import React, { useState, useEffect } from 'react';
import {
  Key,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  RefreshCw,
  RotateCw,
  Info,
  Check,
  X,
  Video,
  Mic,
} from 'lucide-react';
import { keyRotationEngine } from '../services/keyRotation';
import { KeyStatus, KeyRotationLog, ExternalApiKeysConfig } from '../types';

interface KeyManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyManagerModal: React.FC<KeyManagerModalProps> = ({ isOpen, onClose }) => {
  const [rawText, setRawText] = useState('');
  const [keysList, setKeysList] = useState<KeyStatus[]>([]);
  const [logs, setLogs] = useState<KeyRotationLog[]>([]);
  const [externalKeys, setExternalKeys] = useState<ExternalApiKeysConfig>({
    pexelsApiKey: '',
    pixabayApiKey: '',
    elevenLabsApiKey: '',
    openaiTtsApiKey: '',
    fptAiApiKey: '',
  });
  const [copiedNotification, setCopiedNotification] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRawText(keyRotationEngine.getRawKeysText());
      setKeysList(keyRotationEngine.getAllKeys());
      setLogs(keyRotationEngine.getLogs());
      setExternalKeys(keyRotationEngine.getExternalKeys());
    }

    const unsubscribe = keyRotationEngine.subscribe(() => {
      setKeysList(keyRotationEngine.getAllKeys());
      setLogs(keyRotationEngine.getLogs());
      setExternalKeys(keyRotationEngine.getExternalKeys());
    });

    return unsubscribe;
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    keyRotationEngine.setKeysFromRawText(rawText);
    keyRotationEngine.setExternalKeys(externalKeys);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
  };

  const handleResetStatuses = () => {
    keyRotationEngine.resetAllStatuses();
  };

  const activeCount = keysList.filter((k) => k.status === 'active').length;
  const exhaustedCount = keysList.filter((k) => k.status === 'exhausted').length;
  const invalidCount = keysList.filter((k) => k.status === 'invalid').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Bảng Cấu Hình API Key Thông Minh (V3.0 Multi-Engine)
              </h2>
              <p className="text-xs text-slate-400">
                Lưu trữ an toàn trên LocalStorage • Dùng chung cho Kịch bản, Hình ảnh, Video MP4 & Giọng đọc Neural AI
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Status summary pills */}
          <div className="grid grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-center">
              <span className="text-xs text-slate-400 block mb-1">Tổng Gemini Key</span>
              <span className="text-xl font-bold text-white">{keysList.length}</span>
            </div>
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-center">
              <span className="text-xs text-emerald-300 block mb-1 flex items-center justify-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Sẵn Sàng
              </span>
              <span className="text-xl font-bold text-emerald-400">{activeCount}</span>
            </div>
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-center">
              <span className="text-xs text-amber-300 block mb-1 flex items-center justify-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Hết Quota (429)
              </span>
              <span className="text-xl font-bold text-amber-400">{exhaustedCount}</span>
            </div>
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-center">
              <span className="text-xs text-rose-300 block mb-1 flex items-center justify-center gap-1">
                <XCircle className="w-3.5 h-3.5" /> Sai Key (403)
              </span>
              <span className="text-xl font-bold text-rose-400">{invalidCount}</span>
            </div>
          </div>

          {/* 1. Gemini API Keys Textarea Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" />
                <span>1. Gemini API Keys (Dùng cho Kịch Bản Sư Phạm, Ảnh HD AI & Gemini Native Voice)</span>
              </label>
              <span className="text-xs text-amber-400/90 font-medium">
                {rawText.split('\n').filter((l) => l.trim()).length} keys được phát hiện
              </span>
            </div>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="AIzaSyA... (Dán Gemini key 1)&#10;AIzaSyB... (Dán Gemini key 2 - xoay vòng tự động)"
              rows={3}
              className="w-full bg-slate-950/90 border border-slate-700 rounded-xl px-4 py-2.5 font-mono text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition resize-y"
            />
          </div>

          {/* 2. Pexels & Pixabay Video API Keys */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
              <Video className="w-4 h-4 text-cyan-400" />
              <span>2. Kho Video MP4 Chất Lượng Cao (Pexels / Pixabay API Key — Tùy chọn)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Pexels Video API Key:
                </label>
                <input
                  type="password"
                  value={externalKeys.pexelsApiKey}
                  onChange={(e) =>
                    setExternalKeys({ ...externalKeys, pexelsApiKey: e.target.value })
                  }
                  placeholder="Nhập Pexels API Key (nếu có)..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Pixabay Video API Key:
                </label>
                <input
                  type="password"
                  value={externalKeys.pixabayApiKey}
                  onChange={(e) =>
                    setExternalKeys({ ...externalKeys, pixabayApiKey: e.target.value })
                  }
                  placeholder="Nhập Pixabay API Key (nếu có)..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* 3. Optional Neural TTS API Keys (ElevenLabs / FPT.AI / OpenAI TTS) */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-300">
              <Mic className="w-4 h-4 text-emerald-400" />
              <span>3. Giọng Đọc Neural TTS Mở Rộng (FPT.AI / OpenAI / ElevenLabs — Tùy chọn)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  FPT.AI TTS API Key:
                </label>
                <input
                  type="password"
                  value={externalKeys.fptAiApiKey}
                  onChange={(e) =>
                    setExternalKeys({ ...externalKeys, fptAiApiKey: e.target.value })
                  }
                  placeholder="FPT.AI Key (Ban Mai / Lê Minh)..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  OpenAI TTS API Key:
                </label>
                <input
                  type="password"
                  value={externalKeys.openaiTtsApiKey}
                  onChange={(e) =>
                    setExternalKeys({ ...externalKeys, openaiTtsApiKey: e.target.value })
                  }
                  placeholder="sk-... (gpt-4o-mini-tts / tts-1-hd)"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  ElevenLabs API Key:
                </label>
                <input
                  type="password"
                  value={externalKeys.elevenLabsApiKey}
                  onChange={(e) =>
                    setExternalKeys({ ...externalKeys, elevenLabsApiKey: e.target.value })
                  }
                  placeholder="xi-api-key (Multilingual v2)..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Save & Reset Action Row */}
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-slate-500" />
              Nếu để trống, hệ thống tự động dùng Gemini AI Studio Key & luồng Neural TTS miễn phí tích hợp sẵn.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetStatuses}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition"
              >
                <RotateCw className="w-3.5 h-3.5" />
                Đặt lại trạng thái
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition shadow-lg shadow-amber-500/20"
              >
                {copiedNotification ? <Check className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {copiedNotification ? 'Đã lưu cấu hình!' : 'Lưu Cấu Hình Keys'}
              </button>
            </div>
          </div>

          {/* Live Failover & Rotation Event Log */}
          {logs.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 block">
                  Nhật ký chuyển đổi & Xoay vòng (Rotation Logs)
                </span>
                <button
                  onClick={() => keyRotationEngine.clearLogs()}
                  className="text-[11px] text-slate-400 hover:text-slate-200 transition"
                >
                  Xóa lịch sử
                </button>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] max-h-28 overflow-y-auto space-y-1.5">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-slate-500 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span
                      className={
                        log.type === 'switch'
                          ? 'text-cyan-400 font-medium'
                          : log.type === 'exhausted_429'
                          ? 'text-amber-400'
                          : log.type === 'invalid_403'
                          ? 'text-rose-400'
                          : 'text-emerald-400'
                      }
                    >
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Cấu hình được lưu tự động vào LocalStorage trên trình duyệt.
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition"
          >
            Đóng Cửa Sổ
          </button>
        </div>
      </div>
    </div>
  );
};
