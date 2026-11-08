import React, { useRef } from 'react';
import {
  Sparkles,
  RotateCcw,
  BookOpen,
  FileText,
  Clock,
  Loader2,
  Wand2,
  Sliders,
  CheckCircle2,
  Image as ImageIcon,
  ShieldCheck,
} from 'lucide-react';

interface ScriptInputPanelProps {
  lessonTitle: string;
  onLessonTitleChange: (title: string) => void;
  scriptText: string;
  onScriptTextChange: (text: string) => void;
  targetDurationSec: number;
  onTargetDurationChange: (durationSec: number) => void;
  isAnalyzing: boolean;
  onAnalyzeScript: () => void;
  onResetVideo: () => void;
  analysisStatus: string;
}

const SAMPLE_SCRIPTS = [
  {
    name: 'Vịnh Hạ Long',
    badge: 'Kỳ quan',
    title: 'Hành_Trình_Kham_Pha_Vịnh_Hạ_Long',
    content: `Vịnh Hạ Long là di sản thiên nhiên thế giới nổi tiếng của Việt Nam với hơn 1.600 hòn đảo đá vôi lớn nhỏ trải rộng trên diện tích 1.553 km2. 
Trải qua hơn 500 triệu năm kiến tạo địa chất kỳ vĩ, nơi đây sở hữu hệ thống hang động lung linh như động Thiên Cung, hang Sửng Sốt với chiều dài hơn 120 mét. 
Mỗi năm, kỳ quan đón hơn 4.000.000 lượt du khách quốc tế đến chiêm ngưỡng làn nước xanh màu ngọc bích và nhịp sống yên bình của các làng chài cổ kính.`,
  },
  {
    name: 'Con Đường Tơ Lụa',
    badge: 'Lịch sử',
    title: 'Bi_Ca_Con_Duong_To_Lua',
    content: `Con Đường Tơ Lụa là mạng lưới giao thương cổ đại vĩ đại nhất nhân loại, trải dài hơn 6.400 km nối liền phương Đông và phương Tây. 
Khởi nguồn từ thế kỷ 2 trước Công nguyên dưới triều đại nhà Hán, các đoàn thương buôn vượt qua sa mạc khắc nghiệt với hơn 100 con lạc đà thồ lụa, gia vị và gốm sứ. 
Tuyến đường không chỉ trao đổi hàng hóa trị giá hàng triệu lượng vàng mà còn lan tỏa tri thức, nghệ thuật và tôn giáo qua hơn 1.500 năm thăng trầm lịch sử.`,
  },
  {
    name: 'Hố Đen Vũ Trụ',
    badge: 'Vật lý thiên văn',
    title: 'Bi_An_Ho_Den_Vu_Tru',
    content: `Hố đen là một trong những thực thể bí ẩn và quyền năng nhất trong vũ trụ bao la. 
Với lực hấp dẫn vô hạn tại điểm kỳ dị, ngay cả ánh sáng di chuyển với vận tốc 300.000 km/s cũng không thể trốn thoát khỏi chân trời sự kiện. 
Hố đen siêu khối lượng ở trung tâm Dải Ngân Hà có khối lượng gấp 4.000.000 lần Mặt Trời của chúng ta, bẻ cong thời gian và không gian theo thuyết tương đối của Einstein.`,
  },
  {
    name: 'Cà Phê Việt Nam',
    badge: 'Văn hóa & Đời sống',
    title: 'Huong_Vi_Ca_Phe_Viet_Nam',
    content: `Việt Nam tự hào là quốc gia xuất khẩu cà phê Robusta số 1 thế giới với sản lượng hơn 1.600.000 tấn mỗi năm, chiếm gần 18% thị phần toàn cầu. 
Từ những đồn điền bạt ngàn tại vùng đất đỏ bazan Buôn Ma Thuột với độ cao trên 800 mét so với mực nước biển, từng hạt cà phê chín mọng được thu hái cẩn trọng. 
Ly cà phê phin đậm đà nhỏ từng giọt hòa quyện cùng sữa đặc ngọt ngào đã trở thành biểu tượng văn hóa độc đáo của người Việt.`,
  },
];

const DURATION_PRESETS = [
  { label: '30s (Shorts)', value: 30 },
  { label: '1 phút', value: 60 },
  { label: '2 phút', value: 120 },
  { label: '3 phút', value: 180 },
  { label: '5 phút (Tối đa)', value: 300 },
];

export const ScriptInputPanel: React.FC<ScriptInputPanelProps> = ({
  lessonTitle,
  onLessonTitleChange,
  scriptText,
  onScriptTextChange,
  targetDurationSec,
  onTargetDurationChange,
  isAnalyzing,
  onAnalyzeScript,
  onResetVideo,
  analysisStatus,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const wordCount = scriptText.trim() ? scriptText.trim().split(/\s+/).length : 0;
  const charCount = scriptText.length;
  // Estimated video duration of raw script at 3.25 words/sec
  const rawSpeechSeconds = wordCount > 0 ? Math.max(5, Math.round(wordCount / 3.25 + 1)) : 0;

  const handleApplySample = (sample: (typeof SAMPLE_SCRIPTS)[0]) => {
    onLessonTitleChange(sample.title);
    onScriptTextChange(sample.content);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleReset = () => {
    onResetVideo();
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const formatMinSec = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
      {/* Top Header & Reset Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
            Kịch Bản & Thiết Lập Video
          </h2>
        </div>

        {/* Nút Tạo Mới Video */}
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-rose-950/40 border border-slate-700 hover:border-rose-500/50 text-slate-300 hover:text-rose-300 text-xs font-semibold transition"
          title="Dừng toàn bộ luồng phát và xóa trắng để nhập kịch bản mới"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>🔄 Tạo Mới Video</span>
        </button>
      </div>

      {/* Lesson Title Input */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">
          Tên bài học / Tiêu đề xuất file (.mp4 / .webm / .srt)
        </label>
        <input
          type="text"
          value={lessonTitle}
          onChange={(e) => onLessonTitleChange(e.target.value)}
          placeholder="Nhap_Ten_Bai_Hoc_Hoac_Chu_De"
          className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
        />
      </div>

      {/* YÊU CẦU 3: TÙY CHỈNH TẠO ĐỘ DÀI CỦA VIDEO (TỐI ĐA 5 PHÚT) */}
      <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5" />
            <span>TÙY CHỈNH ĐỘ DÀI VIDEO (TỐI ĐA 5 PHÚT):</span>
          </label>
          <div className="flex items-center gap-1.5 font-mono text-xs px-2.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>{formatMinSec(targetDurationSec)}</span>
            <span className="text-slate-400 font-normal">({targetDurationSec}s)</span>
          </div>
        </div>

        {/* Range Slider from 30s to 300s */}
        <div className="space-y-1">
          <input
            type="range"
            min={30}
            max={300}
            step={5}
            value={targetDurationSec}
            onChange={(e) => onTargetDurationChange(Number(e.target.value))}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500 hover:accent-amber-400 transition"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>30s</span>
            <span>1:00</span>
            <span>2:00</span>
            <span>3:00</span>
            <span>4:00</span>
            <span className="text-amber-400 font-bold">5:00 (Max)</span>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {DURATION_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => onTargetDurationChange(preset.value)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
                targetDurationSec === preset.value
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-sm'
                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-600'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* YÊU CẦU 1 & 2: TIÊU CHÍ ĐẢM BẢO CHẤT LƯỢNG KỊCH BẢN */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
        <div className="flex items-start gap-1.5 p-2 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-emerald-300">
          <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
          <span>
            <strong>Hình ảnh chính xác:</strong> Tự động bám sát danh từ thị giác cụ thể của từng cảnh.
          </span>
        </div>
        <div className="flex items-start gap-1.5 p-2 rounded-lg bg-cyan-950/20 border border-cyan-500/20 text-cyan-300">
          <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
          <span>
            <strong>Lược bỏ từ thừa:</strong> Tự lọc bỏ [Cảnh], (Nhạc), ghi chú đạo diễn để giữ lời thoại sạch.
          </span>
        </div>
      </div>

      {/* Sample Scripts Quick Picker */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <BookOpen className="w-3.5 h-3.5 text-amber-400/80" />
          <span className="text-xs font-medium text-slate-400">
            Kịch bản mẫu tham khảo nhanh:
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SAMPLE_SCRIPTS.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => handleApplySample(s)}
              className="text-left p-2 rounded-xl bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 hover:border-amber-500/40 transition group"
            >
              <span className="text-[10px] text-amber-400 font-bold block uppercase tracking-wider">
                {s.badge}
              </span>
              <span className="text-xs font-semibold text-slate-200 group-hover:text-amber-200 truncate block">
                {s.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Textarea Input */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Nội dung kịch bản hoặc chỉ dẫn tạo video:</span>
          <div className="flex items-center gap-3">
            <span>{charCount} ký tự</span>
            <span>•</span>
            <span className="text-amber-400 font-semibold">{wordCount} từ</span>
            <span>•</span>
            <span className="flex items-center gap-1 text-slate-300">
              <Clock className="w-3 h-3 text-slate-400" /> ~{rawSpeechSeconds}s thoại
            </span>
          </div>
        </div>

        <textarea
          ref={textareaRef}
          value={scriptText}
          onChange={(e) => onScriptTextChange(e.target.value)}
          placeholder="Nhập nội dung kịch bản, cốt truyện hoặc chủ đề... AI sẽ tự động:&#10;1. Lược bỏ các từ ngữ không liên quan đến lời thoại ([Cảnh], (Nhạc), hướng dẫn kỹ thuật).&#10;2. Phân chia các phân cảnh với hình ảnh khớp 100% nội dung chỉ dẫn.&#10;3. Điều phối độ dài các cảnh khớp đúng thời lượng mục tiêu bạn đã chọn (tối đa 5 phút)."
          rows={5}
          className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-4 py-3 text-xs leading-relaxed text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition resize-y font-sans"
        />
      </div>

      {/* Action Button & Status */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
        <div className="text-xs text-slate-400 flex items-center gap-2">
          {isAnalyzing ? (
            <div className="flex items-center gap-2 text-amber-400">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span className="truncate">{analysisStatus || 'Đang phân tích kịch bản...'}</span>
            </div>
          ) : (
            <span className="text-slate-500 text-[11px] flex items-center gap-1">
              <Wand2 className="w-3.5 h-3.5 text-amber-500" />
              Tự động khớp hình ảnh & điều phối độ dài {formatMinSec(targetDurationSec)}
            </span>
          )}
        </div>

        <button
          type="button"
          disabled={isAnalyzing || !scriptText.trim()}
          onClick={onAnalyzeScript}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition-all transform active:scale-95 shrink-0"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang Xử Lý...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>✨ Phân Tích & Dựng Phân Cảnh ({formatMinSec(targetDurationSec)})</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
