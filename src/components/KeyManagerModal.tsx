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
} from 'lucide-react';
import { keyRotationEngine } from '../services/keyRotation';
import { KeyStatus, KeyRotationLog } from '../types';

interface KeyManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyManagerModal: React.FC<KeyManagerModalProps> = ({ isOpen, onClose }) => {
  const [rawText, setRawText] = useState('');
  const [keysList, setKeysList] = useState<KeyStatus[]>([]);
  const [logs, setLogs] = useState<KeyRotationLog[]>([]);
  const [copiedNotification, setCopiedNotification] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRawText(keyRotationEngine.getRawKeysText());
      setKeysList(keyRotationEngine.getAllKeys());
      setLogs(keyRotationEngine.getLogs());
    }

    const unsubscribe = keyRotationEngine.subscribe(() => {
      setKeysList(keyRotationEngine.getAllKeys());
      setLogs(keyRotationEngine.getLogs());
    });

    return unsubscribe;
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    keyRotationEngine.setKeysFromRawText(rawText);
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
                Quản Lý Gemini API Keys & Xoay Vòng (Rotation Engine)
              </h2>
              <p className="text-xs text-slate-400">
                Tự động luân phiên Round-Robin và tự động chuyển đổi khi gặp lỗi 429 hoặc 403
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
              <span className="text-xs text-slate-400 block mb-1">Tổng Số Key</span>
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

          {/* Textarea Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <span>Danh sách API Keys (Mỗi dòng 1 key)</span>
                <span className="text-slate-500 font-normal lowercase">(Tự động lưu vào LocalStorage)</span>
              </label>
              <span className="text-xs text-amber-400/90 font-medium">
                {rawText.split('\n').filter((l) => l.trim()).length} keys được phát hiện
              </span>
            </div>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="AIzaSyA... (Dán key 1)&#10;AIzaSyB... (Dán key 2)&#10;AIzaSyC... (Dán key 3)"
              rows={4}
              className="w-full bg-slate-950/90 border border-slate-700 rounded-xl px-4 py-3 font-mono text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition resize-y"
            />
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-slate-500" />
                Nếu không nhập key tùy chỉnh, hệ thống sẽ tự động dùng key môi trường AI Studio.
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
                  {copiedNotification ? 'Đã lưu!' : 'Lưu Danh Sách'}
                </button>
              </div>
            </div>
          </div>

          {/* Key list table */}
          {keysList.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 block">
                Trạng thái chi tiết từng Key
              </span>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800/80 max-h-48 overflow-y-auto">
                {keysList.map((k, idx) => (
                  <div
                    key={k.key}
                    className="flex items-center justify-between px-4 py-2.5 text-xs hover:bg-slate-900/50 transition"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-slate-500 font-mono w-5">#{idx + 1}</span>
                      <span className="font-mono text-slate-200">{k.masked}</span>
                      <span className="text-slate-400">({k.requestsCount} lượt gọi)</span>
                    </div>
                    <div>
                      {k.status === 'active' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                          Đang hoạt động
                        </span>
                      )}
                      {k.status === 'exhausted' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <AlertTriangle className="w-3 h-3" />
                          Hết hạn ngạch (429)
                        </span>
                      )}
                      {k.status === 'invalid' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <XCircle className="w-3 h-3" />
                          Không hợp lệ (403)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live Failover & Rotation Event Log */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 block">
                Nhật ký chuyển đổi & Xoay vòng (Rotation Logs)
              </span>
              {logs.length > 0 && (
                <button
                  onClick={() => keyRotationEngine.clearLogs()}
                  className="text-[11px] text-slate-400 hover:text-slate-200 transition"
                >
                  Xóa lịch sử
                </button>
              )}
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] max-h-36 overflow-y-auto space-y-1.5">
              {logs.length === 0 ? (
                <div className="text-slate-500 italic py-2 text-center">
                  Chưa có sự kiện chuyển đổi key nào được ghi nhận.
                </div>
              ) : (
                logs.map((log) => (
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
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Hệ thống tự động lưu trữ cấu hình an toàn trên trình duyệt của bạn.
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
