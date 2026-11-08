import { Scene, ThinkingLevelOption } from '../types';
import { keyRotationEngine } from './keyRotation';
import { matchSamplePreset } from './sampleData';

/**
 * Strips out extraneous meta-instructions, stage directions, scene headers, and non-spoken text
 */
export function cleanExtraneousInstructions(text: string): string {
  if (!text) return '';
  return text
    // Remove bracket tags like [Phân cảnh 1], [Cảnh 2: ...], [Âm nhạc...]
    .replace(/\[[^\]]*\]/g, '')
    // Remove parenthetical stage cues like (Nhạc nền nhẹ nhàng), (MC cười), (Chuyển cảnh)
    .replace(/\([^\)]*(nhạc|cảnh|tiếng|hiệu ứng|camera|video|mc|đạo diễn|zoom|pan|intro|outro)[^\)]*\)/gi, '')
    // Remove labels like "Phân cảnh 1:", "Cảnh 1:", "Lời bình:", "Lời thoại:", "MC:", "Người dẫn chuyện:"
    .replace(/(phân cảnh|cảnh|scene)\s*\d+\s*[:\-–.]/gi, '')
    .replace(/(lời bình|lời thoại|thuyết minh|voiceover|narration|mc|người dẫn chuyện|hình ảnh|mô tả|kịch bản)\s*[:\-–.]/gi, '')
    // Clean markdown bold/bullets
    .replace(/[*#_~`]/g, '')
    // Collapse extra whitespaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates reading duration in seconds for Vietnamese narration
 * duration_seconds = Math.max(5, Math.round(wordCount / 3.25 + 1))
 */
export function calculateSceneDuration(narrationNormalized: string): number {
  if (!narrationNormalized) return 5;
  const wordCount = narrationNormalized.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(5, Math.round(wordCount / 3.25 + 1));
}

/**
 * Fallback client-side normalizer to guarantee no raw digits slip through
 */
export function normalizeVietnameseNumbers(text: string): string {
  if (!text) return '';

  const units: Record<string, string> = {
    km: 'ki-lô-mét',
    m: 'mét',
    cm: 'xen-ti-mét',
    mm: 'mi-li-mét',
    kg: 'ki-lô-gam',
    g: 'gam',
    '%': ' phần trăm',
    'ha': 'héc-ta',
    '$': 'đô-la ',
    'usd': 'đô-la mỹ',
    'vnd': 'việt nam đồng',
    'đ': 'đồng',
  };

  let result = cleanExtraneousInstructions(text);

  // Replace common units
  result = result.replace(/(\d+)\s*(km|m|cm|mm|kg|g|ha|%)/gi, (_match, num, unit) => {
    return `${num} ${units[unit.toLowerCase()] || unit}`;
  });

  return result;
}

export interface AnalyzeScriptParams {
  script: string;
  model: string;
  thinkingLevel: ThinkingLevelOption;
  targetDurationSec?: number; // 30 to 300 seconds (max 5 minutes)
  onStatusUpdate?: (status: string) => void;
}

// Check if running on static host (GitHub Pages, Vercel static, etc.)
export function isStaticEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return (
    host.includes('github.io') ||
    window.location.protocol === 'file:' ||
    (window.location.port !== '3000' && !host.includes('run.app'))
  );
}

/**
 * Proportionally adjusts scene durations to match targetDurationSec while guaranteeing
 * each scene duration >= reading duration of its narration
 */
export function scaleScenesToTargetDuration(scenes: Scene[], targetSec: number): Scene[] {
  if (!scenes || scenes.length === 0) return scenes;
  const clampedTarget = Math.max(30, Math.min(300, targetSec || 60));

  const minDurations = scenes.map((s) => calculateSceneDuration(s.narration_normalized));
  const totalMin = minDurations.reduce((acc, d) => acc + d, 0);

  // If target is larger than minimum speech time, distribute remaining time proportionally
  if (clampedTarget > totalMin) {
    const extraTime = clampedTarget - totalMin;
    return scenes.map((s, idx) => {
      const extraShare = Math.round((minDurations[idx] / totalMin) * extraTime);
      return {
        ...s,
        duration_seconds: minDurations[idx] + extraShare,
      };
    });
  } else {
    // Keep speech duration so narration doesn't get cut off!
    return scenes.map((s, idx) => ({
      ...s,
      duration_seconds: minDurations[idx],
    }));
  }
}

export async function analyzeScript({
  script,
  model,
  thinkingLevel,
  targetDurationSec = 60,
  onStatusUpdate,
}: AnalyzeScriptParams): Promise<Scene[]> {
  if (!script.trim()) {
    throw new Error('Vui lòng nhập nội dung kịch bản hoặc chọn kịch bản mẫu.');
  }

  const cleanScript = cleanExtraneousInstructions(script);
  const isStatic = isStaticEnvironment();
  const keysCount = keyRotationEngine.getTotalKeysCount();

  // If on GitHub Pages and user has not configured any API keys yet:
  if (isStatic && keysCount === 0) {
    const preset = matchSamplePreset(script);
    if (preset) {
      onStatusUpdate?.('Đang nạp phân cảnh chuẩn mẫu (Chế độ Demo GitHub Pages)...');
      return scaleScenesToTargetDuration(
        preset.map((s) => ({
          ...s,
          duration_seconds: calculateSceneDuration(s.narration_normalized),
        })),
        targetDurationSec
      );
    } else {
      throw new Error(
        'Bạn đang chạy trên GitHub Pages (Web Tĩnh). Vui lòng nhấn vào nút "🔑 Keys" ở góc trên để dán ít nhất 1 Gemini API Key của bạn để phân tích kịch bản mới này.'
      );
    }
  }

  onStatusUpdate?.('Đang gửi kịch bản vào Gemini API (Xoay vòng Multi-Key)...');

  return await keyRotationEngine.executeWithRotation(async (apiKey) => {
    // If running on static host (GitHub Pages), call Google Generative Language REST API directly!
    if (isStatic) {
      if (!apiKey) {
        const preset = matchSamplePreset(cleanScript);
        if (preset) return scaleScenesToTargetDuration(preset, targetDurationSec);
        throw new Error('Vui lòng nhập Gemini API Key vào mục Quản Lý Keys trên GitHub Pages.');
      }
      onStatusUpdate?.('Đang gọi trực tiếp Gemini REST API (GitHub Pages Mode)...');
      const resScenes = await callGeminiDirectRest(cleanScript, model, thinkingLevel, apiKey, targetDurationSec);
      return scaleScenesToTargetDuration(resScenes, targetDurationSec);
    }

    try {
      // On fullstack Node.js server, call local backend proxy
      const response = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey,
          model,
          thinkingLevel,
          prompt: cleanScript,
          targetDurationSec,
        }),
      });

      if (!response.ok) {
        let errData: any = {};
        try {
          errData = await response.json();
        } catch {
          // ignore
        }
        const error = new Error(errData?.error?.message || `Server returned ${response.status}`);
        (error as any).status = response.status;
        throw error;
      }

      const data = await response.json();
      if (!data.success || !Array.isArray(data.scenes)) {
        throw new Error('Định dạng dữ liệu phân cảnh từ Gemini không hợp lệ.');
      }

      const processedScenes: Scene[] = data.scenes.map((s: any, idx: number) => {
        const cleanNarration = cleanExtraneousInstructions(s.narration_vi || '');
        const narrationNorm = s.narration_normalized || normalizeVietnameseNumbers(cleanNarration);
        const duration = calculateSceneDuration(narrationNorm);
        return {
          scene_id: s.scene_id || idx + 1,
          title: s.title || `Phân cảnh ${idx + 1}`,
          narration_vi: cleanNarration,
          narration_normalized: narrationNorm,
          search_keywords_en: s.search_keywords_en || 'vietnam landscape cinematic',
          camera_motion: s.camera_motion || 'zoom-in',
          lut_style: s.lut_style || 'cinematic-teal-orange',
          duration_seconds: duration,
        };
      });

      return scaleScenesToTargetDuration(processedScenes, targetDurationSec);
    } catch (err: any) {
      // Fallback for static hosts or direct client REST
      if ((err.status === 404 || err.message?.includes('404')) && apiKey) {
        onStatusUpdate?.('Đang chuyển hướng gọi trực tiếp Gemini REST API...');
        const resScenes = await callGeminiDirectRest(cleanScript, model, thinkingLevel, apiKey, targetDurationSec);
        return scaleScenesToTargetDuration(resScenes, targetDurationSec);
      }
      throw err;
    }
  });
}

/**
 * Direct REST API for GitHub Pages hosting with responseSchema structured JSON
 */
async function callGeminiDirectRest(
  prompt: string,
  model: string,
  thinkingLevel: ThinkingLevelOption,
  apiKey: string,
  targetDurationSec: number = 60
): Promise<Scene[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const durationSec = Math.max(30, Math.min(300, targetDurationSec));
  const targetMin = Math.floor(durationSec / 60);
  const targetSecRem = durationSec % 60;
  const durationDesc = `${targetMin > 0 ? `${targetMin} phút ` : ''}${targetSecRem > 0 ? `${targetSecRem} giây` : ''}`;

  const systemInstruction = `Bạn là Đạo diễn Phim Tài liệu và Biên kịch Video Hàng đầu.
Phân tích kịch bản tiếng Việt thành mảng các phân cảnh điện ảnh chuẩn JSON theo schema.

CÁC QUY TẮC BẮT BUỘC:
1. ĐỘ DÀI MỤC TIÊU:
   - Tổng độ dài video yêu cầu là: ${durationSec} GIÂY (~${durationDesc}). Tối đa là 5 phút (300 giây).
   - Hãy chia số phân cảnh và viết dung lượng lời bình tương ứng sao cho tổng thời gian các cảnh cộng lại xấp xỉ bằng ${durationSec} giây (tốc độ đọc ~3.25 từ/giây).
2. LƯỢC BỎ TỪ KHÔNG LIÊN QUAN ĐẾN LỜI THOẠI:
   - Trong 'narration_vi', TUYỆT ĐỐI LOẠI BỎ các chú thích kỹ thuật, ghi chú đạo diễn "[Cảnh 1]", "(nhạc dạo)", "MC:", "Người dẫn chuyện:". CHỈ GIỮ LẠI LỜI BÌNH NGUYÊN BẢN trong trẻo để đọc và làm phụ đề.
3. HÌNH ẢNH LIÊN QUAN TRỰC TIẾP (search_keywords_en):
   - Chứa 2-3 từ khóa tiếng Anh miêu tả đúng danh từ/chủ thể trọng tâm của phân cảnh đó để tìm kiếm ảnh Wikimedia Commons.
4. CHUẨN HÓA SỐ VÀ ĐƠN VỊ (narration_normalized):
   - Tự động chuẩn hóa 100% mọi số, đơn vị, ngày tháng sang chữ tiếng Việt đầy đủ.`;

  const requestBody: any = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        description: 'Danh sách phân cảnh video',
        items: {
          type: 'OBJECT',
          properties: {
            scene_id: { type: 'INTEGER' },
            title: { type: 'STRING' },
            narration_vi: { type: 'STRING' },
            narration_normalized: { type: 'STRING' },
            search_keywords_en: { type: 'STRING' },
            camera_motion: {
              type: 'STRING',
              enum: ['zoom-in', 'zoom-out', 'pan-left', 'pan-right'],
            },
            lut_style: {
              type: 'STRING',
              enum: ['cinematic-teal-orange', 'warm-golden', 'natural-documentary', 'high-contrast'],
            },
          },
          required: [
            'scene_id',
            'title',
            'narration_vi',
            'narration_normalized',
            'search_keywords_en',
            'camera_motion',
            'lut_style',
          ],
        },
      },
    },
  };

  if (thinkingLevel && (model.includes('gemini-3') || model.includes('gemini-4'))) {
    const levelMap: Record<string, string> = {
      low: 'LOW',
      medium: 'MEDIUM',
      high: 'HIGH',
    };
    requestBody.generationConfig.thinkingConfig = {
      thinkingLevel: levelMap[thinkingLevel] || 'MEDIUM',
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    const error = new Error(errJson?.error?.message || `HTTP ${res.status}`);
    (error as any).status = res.status;
    throw error;
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const scenesRaw = JSON.parse(text);

  return scenesRaw.map((s: any, idx: number) => {
    const cleanNarration = cleanExtraneousInstructions(s.narration_vi || '');
    const norm = s.narration_normalized || normalizeVietnameseNumbers(cleanNarration);
    return {
      scene_id: s.scene_id || idx + 1,
      title: s.title || `Phân cảnh ${idx + 1}`,
      narration_vi: cleanNarration,
      narration_normalized: norm,
      search_keywords_en: s.search_keywords_en || 'vietnam landscape documentary',
      camera_motion: s.camera_motion || 'zoom-in',
      lut_style: s.lut_style || 'cinematic-teal-orange',
      duration_seconds: calculateSceneDuration(norm),
    };
  });
}
