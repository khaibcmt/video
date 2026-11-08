import React, { useRef } from 'react';
import {
  Sparkles,
  RotateCcw,
  BookOpen,
  FileText,
  Clock,
  Loader2,
  Wand2,
} from 'lucide-react';

interface ScriptInputPanelProps {
  lessonTitle: string;
  onLessonTitleChange: (title: string) => void;
  scriptText: string;
  onScriptTextChange: (text: string) => void;
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

export const ScriptInputPanel: React.FC<ScriptInputPanelProps> = ({
  lessonTitle,
  onLessonTitleChange,
  scriptText,
  onScriptTextChange,
  isAnalyzing,
  onAnalyzeScript,
  onResetVideo,
  analysisStatus,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const wordCount = scriptText.trim() ? scriptText.trim().split(/\s+/).length : 0;
  const charCount = scriptText.length;
  // Estimated video duration: ~3.25 words per second
  const estSeconds = wordCount > 0 ? Math.max(5, Math.round(wordCount / 3.25 + 3)) : 0;

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

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
      {/* Top Header & Reset Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
            Kịch Bản & Thông Tin Video
          </h2>
        </div>

        {/* Nút Tạo Mới Video (Yêu cầu 5) */}
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
          Tên bài học / Tiêu đề xuất file (.webm / .srt)
        </label>
        <input
          type="text"
          value={lessonTitle}
          onChange={(e) => onLessonTitleChange(e.target.value)}
          placeholder="Nhap_Ten_Bai_Hoc_Hoac_Chu_De"
          className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
        />
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
          <span>Nội dung kịch bản tiếng Việt</span>
          <div className="flex items-center gap-3">
            <span>{charCount} ký tự</span>
            <span>•</span>
            <span className="text-amber-400 font-semibold">{wordCount} từ</span>
            <span>•</span>
            <span className="flex items-center gap-1 text-slate-300">
              <Clock className="w-3 h-3 text-slate-400" /> ~{estSeconds}s video
            </span>
          </div>
        </div>

        <textarea
          ref={textareaRef}
          value={scriptText}
          onChange={(e) => onScriptTextChange(e.target.value)}
          placeholder="Nhập đoạn văn bản hoặc kịch bản tiếng Việt có chứa số, đơn vị, ngày tháng... Gemini AI sẽ tự động phân tích thành các phân cảnh, chuẩn hóa số sang chữ tiếng Việt, tạo chuyển động máy và nạp tư liệu ảnh mở."
          rows={6}
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
              Tự động chuẩn hóa số/đơn vị & phân chia cảnh quay
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
              <span>✨ Phân Tích & Dựng Phân Cảnh</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
