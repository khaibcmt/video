import React, { useRef } from 'react';
import {
  RotateCcw,
  Clock,
  Loader2,
  Wand2,
  GraduationCap,
  Rocket,
  Sliders,
} from 'lucide-react';
import { SubjectOption } from '../types';

interface ScriptInputPanelProps {
  lessonTitle: string;
  onLessonTitleChange: (title: string) => void;
  subject: SubjectOption;
  onSubjectChange: (subject: SubjectOption) => void;
  scriptText: string;
  onScriptTextChange: (text: string) => void;
  targetDurationSec: number;
  onTargetDurationChange: (durationSec: number) => void;
  isAnalyzing: boolean;
  onAnalyzeScript: () => void;
  onResetVideo: () => void;
  analysisStatus: string;
}

const SUBJECT_OPTIONS: SubjectOption[] = [
  'Sinh học',
  'Công nghệ',
  'Vật lý',
  'Hóa học',
];

const DIRECTOR_DURATION_OPTIONS = [
  { label: '1 Phút (~3 cảnh)', value: 60 },
  { label: '2 Phút (~5 cảnh)', value: 120 },
  { label: '3 Phút (~7-8 cảnh)', value: 180 },
];

export const ScriptInputPanel: React.FC<ScriptInputPanelProps> = ({
  lessonTitle,
  onLessonTitleChange,
  subject,
  onSubjectChange,
  scriptText,
  onScriptTextChange,
  targetDurationSec,
  onTargetDurationChange,
  isAnalyzing,
  onAnalyzeScript,
  onResetVideo,
  analysisStatus,
}) => {
  const titleInputRef = useRef<HTMLInputElement>(null);

  const wordCount = scriptText.trim() ? scriptText.trim().split(/\s+/).length : 0;
  const canGenerate = Boolean(lessonTitle.trim() || scriptText.trim());

  const handleReset = () => {
    onResetVideo();
    if (titleInputRef.current) {
      titleInputRef.current.focus();
    }
  };

  const formatMinSec = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const estimatedSceneCount =
    targetDurationSec <= 60 ? '3 cảnh' : targetDurationSec <= 120 ? '5 cảnh' : '7-8 cảnh';

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
      {/* Top Header & Reset Button ("🔄 Tạo Mới Video") */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-100">
            Đạo Diễn Tự Động Khôn Ngoan (1-Chạm)
          </h2>
        </div>

        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-rose-950/50 border border-slate-700 hover:border-rose-500/50 text-slate-200 hover:text-rose-300 text-xs font-semibold transition"
          title="Xóa sạch dữ liệu cũ, dừng toàn bộ video/audio ngầm để tạo bài học mới"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>🔄 Tạo Mới Video</span>
        </button>
      </div>

      {/* GIAO DIỆN NHẬP LIỆU 1-CHẠM (QUICK DIRECTOR BAR) */}
      <div className="p-4 rounded-xl bg-slate-950/85 border border-amber-500/30 space-y-3.5 shadow-inner">
        {/* Ô nhập: Tên bài học / Chủ đề */}
        <div>
          <label
            htmlFor="director-topic-input"
            className="block text-xs font-bold text-amber-300 mb-1.5 flex items-center justify-between"
          >
            <span>1. Tên bài học / Chủ đề:</span>
            <span className="text-[10px] font-normal text-slate-400">
              Nhập chủ đề mới để tạo kịch bản & dựng video
            </span>
          </label>
          <input
            id="director-topic-input"
            ref={titleInputRef}
            type="text"
            value={lessonTitle}
            onChange={(e) => onLessonTitleChange(e.target.value)}
            placeholder="Nhập tên bài học hoặc chủ đề..."
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
          />
        </div>

        {/* Hàng Dropdown Môn học & Thời lượng */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Dropdown Môn học */}
          <div>
            <label
              htmlFor="director-subject-select"
              className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5"
            >
              <GraduationCap className="w-3.5 h-3.5 text-cyan-400" />
              <span>2. Môn học:</span>
            </label>
            <select
              id="director-subject-select"
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value as SubjectOption)}
              aria-label="Môn học"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-slate-100 focus:outline-none focus:border-amber-500 transition"
            >
              {SUBJECT_OPTIONS.map((subj) => (
                <option key={subj} value={subj}>
                  {subj}
                </option>
              ))}
            </select>
          </div>

          {/* Dropdown Thời lượng */}
          <div>
            <label
              htmlFor="director-duration-select"
              className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5"
            >
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>3. Thời lượng kịch bản:</span>
            </label>
            <select
              id="director-duration-select"
              value={
                DIRECTOR_DURATION_OPTIONS.some((o) => o.value === targetDurationSec)
                  ? targetDurationSec
                  : 60
              }
              onChange={(e) => onTargetDurationChange(Number(e.target.value))}
              aria-label="Thời lượng"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-amber-300 focus:outline-none focus:border-amber-500 transition"
            >
              {DIRECTOR_DURATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Nút Hành Động 1-Chạm: 🚀 TỰ ĐỘNG TẠO KỊCH BẢN & DỰNG VIDEO CHUYỂN ĐỘNG */}
        <button
          type="button"
          disabled={isAnalyzing || !canGenerate}
          onClick={onAnalyzeScript}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition-all transform active:scale-98"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span className="truncate">
                {analysisStatus || 'Đang tự động biên soạn kịch bản 4 phần & nạp video...'}
              </span>
            </>
          ) : (
            <>
              <Rocket className="w-4 h-4 shrink-0" />
              <span>🚀 TỰ ĐỘNG TẠO KỊCH BẢN & DỰNG VIDEO CHUYỂN ĐỘNG</span>
            </>
          )}
        </button>

        {/* Thanh tùy chỉnh tinh chỉnh thời lượng mở rộng (30s - 300s) */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-400 flex items-center gap-1 shrink-0">
            <Sliders className="w-3 h-3 text-amber-400" />
            Tinh chỉnh ({formatMinSec(targetDurationSec)} • ~{estimatedSceneCount}):
          </span>
          <input
            type="range"
            min={30}
            max={300}
            step={30}
            value={targetDurationSec}
            aria-label="Thanh trượt thời lượng video"
            onChange={(e) => onTargetDurationChange(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
        </div>
      </div>

      {/* Khung ghi chú / kịch bản chi tiết (Tùy chọn) */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Nội dung kịch bản hoặc chỉ dẫn chi tiết (Tùy chọn):</span>
          <span className="text-amber-400 font-semibold">{wordCount} từ</span>
        </div>

        <textarea
          value={scriptText}
          onChange={(e) => onScriptTextChange(e.target.value)}
          placeholder="Nhập nội dung kịch bản hoặc để trống để AI tự biên soạn từ Tên bài học ở trên..."
          rows={3}
          className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs leading-relaxed text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition resize-y font-sans"
        />
      </div>
    </div>
  );
};
