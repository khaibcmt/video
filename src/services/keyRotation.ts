import { KeyStatus, KeyRotationLog, ExternalApiKeysConfig } from '../types';

const STORAGE_KEY = 'vietvideo_gemini_keys';
const STORAGE_LOGS_KEY = 'vietvideo_gemini_key_logs';
const STORAGE_EXTERNAL_KEYS = 'vietvideo_external_api_keys';

type Listener = () => void;

class KeyRotationEngine {
  private keys: string[] = [];
  private currentIndex: number = 0;
  private keyStatuses: Map<string, KeyStatus> = new Map();
  private logs: KeyRotationLog[] = [];
  private listeners: Set<Listener> = new Set();
  private externalKeys: ExternalApiKeysConfig = {
    pexelsApiKey: '',
    pixabayApiKey: '',
    elevenLabsApiKey: '',
    openaiTtsApiKey: '',
    fptAiApiKey: '',
  };

  constructor() {
    this.loadFromStorage();
  }

  public getExternalKeys(): ExternalApiKeysConfig {
    return { ...this.externalKeys };
  }

  public setExternalKeys(updated: Partial<ExternalApiKeysConfig>): void {
    this.externalKeys = {
      ...this.externalKeys,
      ...updated,
    };
    this.notify();
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.saveToStorage();
    this.listeners.forEach((l) => {
      try {
        l();
      } catch (err) {
        console.error('Error notifying key rotation listener:', err);
      }
    });
  }

  public setKeysFromRawText(rawText: string): void {
    const lines = rawText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));

    // Deduplicate
    const uniqueKeys = Array.from(new Set(lines));
    this.keys = uniqueKeys;

    // Preserve existing statuses or initialize new
    uniqueKeys.forEach((key) => {
      if (!this.keyStatuses.has(key)) {
        this.keyStatuses.set(key, {
          key,
          masked: this.maskKey(key),
          status: 'active',
          requestsCount: 0,
        });
      }
    });

    // Remove old keys from map
    Array.from(this.keyStatuses.keys()).forEach((k) => {
      if (!uniqueKeys.includes(k)) {
        this.keyStatuses.delete(k);
      }
    });

    if (this.currentIndex >= this.keys.length) {
      this.currentIndex = 0;
    }

    this.notify();
  }

  public getRawKeysText(): string {
    return this.keys.join('\n');
  }

  public getAllKeys(): KeyStatus[] {
    return this.keys.map(
      (k) =>
        this.keyStatuses.get(k) || {
          key: k,
          masked: this.maskKey(k),
          status: 'active',
          requestsCount: 0,
        }
    );
  }

  public getLogs(): KeyRotationLog[] {
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
    this.notify();
  }

  public resetAllStatuses(): void {
    this.keyStatuses.forEach((val) => {
      val.status = 'active';
      val.errorMessage = undefined;
    });
    this.currentIndex = 0;
    this.addLog('success', 'Đã đặt lại trạng thái hoạt động cho tất cả các API Key.');
    this.notify();
  }

  public getCurrentKey(): string | null {
    if (this.keys.length === 0) return null;
    return this.keys[this.currentIndex] || this.keys[0];
  }

  public getActiveKeysCount(): number {
    return this.keys.filter((k) => this.keyStatuses.get(k)?.status === 'active').length;
  }

  public getTotalKeysCount(): number {
    return this.keys.length;
  }

  private maskKey(key: string): string {
    if (key.length <= 10) return '••••••••';
    return `${key.slice(0, 5)}...${key.slice(-4)}`;
  }

  private addLog(
    type: KeyRotationLog['type'],
    message: string,
    fromKey?: string,
    toKey?: string
  ): void {
    const log: KeyRotationLog = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      type,
      message,
      fromKey: fromKey ? this.maskKey(fromKey) : undefined,
      toKey: toKey ? this.maskKey(toKey) : undefined,
    };
    this.logs.unshift(log);
    if (this.logs.length > 50) this.logs.pop();
  }

  /**
   * Finds the next active key via Round-Robin.
   * If all active keys are exhausted or invalid, attempts cooldown reset.
   */
  public getNextActiveKey(): string | null {
    if (this.keys.length === 0) return null;

    const total = this.keys.length;
    let attempts = 0;

    while (attempts < total) {
      const key = this.keys[this.currentIndex];
      const status = this.keyStatuses.get(key)?.status || 'active';

      if (status === 'active') {
        const selectedKey = key;
        // Advance pointer for next round-robin usage
        this.currentIndex = (this.currentIndex + 1) % total;
        return selectedKey;
      }

      this.currentIndex = (this.currentIndex + 1) % total;
      attempts++;
    }

    // If all keys are marked exhausted, log warning
    this.addLog(
      'all_exhausted',
      'Cảnh báo: Toàn bộ danh sách API Key đều đã bị đánh dấu Hết hạn mức (429) hoặc Không hợp lệ (403).'
    );
    return null;
  }

  public recordSuccess(key: string): void {
    const entry = this.keyStatuses.get(key);
    if (entry) {
      entry.status = 'active';
      entry.requestsCount += 1;
      entry.lastUsed = Date.now();
      entry.errorMessage = undefined;
      this.notify();
    }
  }

  public recordFailure(key: string, statusCode: number, message: string): void {
    const entry = this.keyStatuses.get(key);
    if (!entry) return;

    entry.lastUsed = Date.now();
    entry.errorMessage = message;

    if (statusCode === 429 || message.includes('RESOURCE_EXHAUSTED')) {
      entry.status = 'exhausted';
      this.addLog(
        'exhausted_429',
        `Key [${this.maskKey(key)}] gặp lỗi 429 (Resource Exhausted / Hết hạn ngạch). Tự động vô hiệu hóa tạm thời.`,
        key
      );
    } else if (statusCode === 403 || statusCode === 400 || message.includes('API_KEY_INVALID')) {
      entry.status = 'invalid';
      this.addLog(
        'invalid_403',
        `Key [${this.maskKey(key)}] gặp lỗi 403/400 (Key không hợp lệ hoặc bị từ chối). Loại bỏ khỏi danh sách chạy.`,
        key
      );
    }
    this.notify();
  }

  /**
   * Executes an async operation with automatic Key Rotation & Failover:
   * Loops through keys if a key encounters 429 or 403 without stopping video process.
   */
  public async executeWithRotation<T>(
    operation: (key: string | undefined) => Promise<T>
  ): Promise<T> {
    const totalKeys = this.keys.length;

    // If no keys configured, try with undefined (will use server process.env.GEMINI_API_KEY)
    if (totalKeys === 0) {
      try {
        return await operation(undefined);
      } catch (err: any) {
        throw new Error(err?.message || 'Lỗi gọi Gemini API (Chưa cấu hình API Key)');
      }
    }

    const triedKeys = new Set<string>();

    while (triedKeys.size < totalKeys) {
      const activeKey = this.getNextActiveKey();
      if (!activeKey) {
        // All keys exhausted
        throw new Error(
          'Tất cả Gemini API Keys trong danh sách đều đã hết hạn mức (429) hoặc không hợp lệ (403). Vui lòng thêm key mới hoặc nhấn Đặt lại trạng thái.'
        );
      }

      if (triedKeys.has(activeKey)) {
        // We looped through all available active keys
        break;
      }
      triedKeys.add(activeKey);

      try {
        const result = await operation(activeKey);
        this.recordSuccess(activeKey);
        return result;
      } catch (err: any) {
        const status = err?.status || err?.response?.status || 500;
        const msg = err?.message || String(err);

        console.warn(`Key rotation caught error for key ${this.maskKey(activeKey)}:`, msg);

        if (
          status === 429 ||
          status === 403 ||
          msg.includes('429') ||
          msg.includes('403') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('API_KEY_INVALID')
        ) {
          this.recordFailure(activeKey, status, msg);
          const nextCandidate = this.getCurrentKey();
          this.addLog(
            'switch',
            `Chuyển đổi tức thì từ [${this.maskKey(activeKey)}] sang key kế tiếp để tiếp tục quy trình dựng video.`,
            activeKey,
            nextCandidate || undefined
          );
          // Continue loop to retry with next key!
          continue;
        }

        // For other unrecoverable errors (e.g. malformed JSON or prompt issues), rethrow
        throw err;
      }
    }

    throw new Error(
      'Không thể hoàn thành yêu cầu sau khi đã thử tất cả các Gemini API Keys trong danh sách xoay vòng.'
    );
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.keys));
      localStorage.setItem(
        STORAGE_LOGS_KEY,
        JSON.stringify(this.logs.slice(0, 30))
      );
      localStorage.setItem(
        STORAGE_EXTERNAL_KEYS,
        JSON.stringify(this.externalKeys)
      );
    } catch (e) {
      console.warn('Unable to save to localStorage:', e);
    }
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const savedKeys = localStorage.getItem(STORAGE_KEY);
      if (savedKeys) {
        const parsed = JSON.parse(savedKeys);
        if (Array.isArray(parsed)) {
          this.keys = parsed;
          parsed.forEach((k) => {
            this.keyStatuses.set(k, {
              key: k,
              masked: this.maskKey(k),
              status: 'active',
              requestsCount: 0,
            });
          });
        }
      }

      const savedLogs = localStorage.getItem(STORAGE_LOGS_KEY);
      if (savedLogs) {
        const parsed = JSON.parse(savedLogs);
        if (Array.isArray(parsed)) {
          this.logs = parsed;
        }
      }

      const savedExternal = localStorage.getItem(STORAGE_EXTERNAL_KEYS);
      if (savedExternal) {
        const parsed = JSON.parse(savedExternal);
        if (parsed && typeof parsed === 'object') {
          this.externalKeys = {
            ...this.externalKeys,
            ...parsed,
          };
        }
      }
    } catch (e) {
      console.warn('Unable to load from localStorage:', e);
    }
  }
}

export const keyRotationEngine = new KeyRotationEngine();
