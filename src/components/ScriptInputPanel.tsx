import React, { useRef } from 'react';
import {
  RotateCcw,
  BookOpen,
  Clock,
  Loader2,
  Wand2,
  CheckCircle2,
  Video,
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

const SAMPLE_TOPICS: {
  name: string;
  subject: SubjectOption;
  title: string;
  content: string;
}[] = [
  {
    name: 'Bài 9: Thủy sản',
    subject: 'Công nghệ',
    title: 'Bài 9: Các nhóm thủy sản và phương thức nuôi phổ biến',
    content: `Việt Nam có đường bờ biển dài 3.260 km và diện tích mặt nước nội địa rộng lớn, tạo điều kiện cho các nhóm thủy sản bản địa và nhập nội phát triển mạnh. Theo tính chất sinh thái, thủy sản được chia thành nhóm nước ngọt như cá tra, cá rô phi, nhóm nước lợ như tôm thẻ chân trắng, cá chẽm và nhóm nước mặn như cá song, tôm hùm. Trong nuôi trồng hiện đại, phương thức nuôi thâm canh ứng dụng quạt nước tạo oxy trên 5 mg/l kết hợp nuôi tuần hoàn RAS và lồng bè công nghệ cao giúp nâng cao năng suất bền vững.`,
  },
  {
    name: 'Quang hợp thực vật',
    subject: 'Sinh học',
    title: 'Bài 4: Quang hợp ở thực vật và chu trình trao đổi chất',
    content: `Quang hợp ở thực vật là quá trình lục lạp hấp thụ năng lượng ánh sáng mặt trời để tổng hợp chất hữu cơ từ khí cacbonic và nước, đồng thời giải phóng dưỡng khí oxy. Tại màng thylakoid, pha sáng diễn ra quá trình quang phân li nước tạo năng lượng ATP và NADPH. Tiếp đó, chu trình Calvin cố định CO2 ở chất nền lục lạp, quyết định trên 90% sinh khối cây trồng trong nông nghiệp công nghệ cao.`,
  },
  {
    name: 'Cảm ứng điện từ',
    subject: 'Vật lý',
    title: 'Bài 12: Hiện tượng cảm ứng điện từ và máy phát điện xoay chiều',
    content: `Hiện tượng cảm ứng điện từ xuất hiện khi từ thông qua mạch kín biến thiên theo định luật Faraday, sinh ra dòng điện cảm ứng. Nguyên lý này được ứng dụng trực tiếp trong các tua-bin máy phát điện xoay chiều 3 pha có tần số 50 Hz tại nhà máy thủy điện và điện gió, truyền tải qua lưới điện cao áp 500 kV phục vụ sản xuất công nghiệp.`,
  },
  {
    name: 'Phản ứng Oxi hóa - Khử',
    subject: 'Hóa học',
    title: 'Bài 15: Phản ứng oxi hóa khử và ứng dụng điện phân',
    content: `Phản ứng oxi hóa khử là quá trình chuyển dịch electron giữa chất khử và chất oxi hóa diễn ra phổ biến trong tự nhiên và công nghiệp hóa chất. Trong phòng thí nghiệm, sự nhường và nhận electron thể hiện rõ qua phản ứng giữa kim loại với dung dịch axit hoặc quá trình điện phân dung dịch muối đồng sunfat để tinh luyện đồng nguyên chất đạt độ tinh khiết 99,9%.`,
  },
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

  const handleApplyTopic = (sample: (typeof SAMPLE_TOPICS)[0]) => {
    onLessonTitleChange(sample.title);
    onSubjectChange(sample.subject);
    onScriptTextChange(sample.content);
  };

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

      {/* YÊU CẦU 1: GIAO DIỆN NHẬP LIỆU 1-CHẠM (QUICK DIRECTOR BAR) */}
      <div className="p-4 rounded-xl bg-slate-950/85 border border-amber-500/30 space-y-3.5 shadow-inner">
        {/* Ô nhập: Tên bài học / Chủ đề */}
        <div>
          <label
            htmlFor="director-topic-input"
            className="block text-xs font-bold text-amber-300 mb-1.5 flex items-center justify-between"
          >
            <span>1. Tên bài học / Chủ đề bài giảng:</span>
            <span className="text-[10px] font-normal text-slate-400">
              Chỉ cần nhập tên bài là AI tự sinh kịch bản 4 phần
            </span>
          </label>
          <input
            id="director-topic-input"
            ref={titleInputRef}
            type="text"
            value={lessonTitle}
            onChange={(e) => onLessonTitleChange(e.target.value)}
            placeholder="Ví dụ: Bài 9: Các nhóm thủy sản và phương thức nuôi phổ biến"
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
                  : 120
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

      {/* Bài học mẫu 1-chạm theo từng môn */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <BookOpen className="w-3.5 h-3.5 text-amber-400/80" />
          <span className="text-xs font-medium text-slate-400">
            Chọn nhanh bài học mẫu chuẩn sư phạm:
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SAMPLE_TOPICS.map((item) => (
            <button
              key={item.name}
              type="button"
              onClick={() => handleApplyTopic(item)}
              className="text-left p-2 rounded-xl bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 hover:border-amber-500/40 transition group"
            >
              <span className="text-[10px] text-amber-400 font-bold block uppercase tracking-wider">
                {item.subject}
              </span>
              <span className="text-xs font-semibold text-slate-200 group-hover:text-amber-200 truncate block">
                {item.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Khung ghi chú / kịch bản chi tiết (Tùy chọn) */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Ghi chú chỉ dẫn hoặc nội dung kịch bản bổ sung (Tùy chọn):</span>
          <span className="text-amber-400 font-semibold">{wordCount} từ</span>
        </div>

        <textarea
          value={scriptText}
          onChange={(e) => onScriptTextChange(e.target.value)}
          placeholder="Có thể để trống (AI sẽ tự biên soạn từ Tên bài học & Môn học ở trên) hoặc dán nội dung bài giảng chi tiết vào đây..."
          rows={3}
          className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs leading-relaxed text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition resize-y font-sans"
        />
      </div>

      {/* Cam kết kỹ thuật Zero-Bug Video Engine */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
        <div className="flex items-start gap-1.5 p-2 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-emerald-300">
          <Video className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
          <span>
            <strong>Ưu tiên 1 & 2 (Zero-Black-Screen):</strong> Nạp video MP4 CORS-safe; tự động fallback ảnh HD 16:9 Ken Burns sau 5s nếu mạng chậm.
          </span>
        </div>
        <div className="flex items-start gap-1.5 p-2 rounded-lg bg-cyan-950/20 border border-cyan-500/20 text-cyan-300">
          <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
          <span>
            <strong>Chuẩn hóa số đọc tiếng Việt:</strong> Tự chuyển "3.260 km" → "ba nghìn hai trăm sáu mươi ki-lô-mét".
          </span>
        </div>
      </div>
    </div>
  );
};
