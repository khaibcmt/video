Ứng dụng VietVideo Studio (Web Multimedia Video Engine) đã được triển khai hoàn chỉnh theo đúng các tiêu chí kỹ thuật:
1. Quản lý Gemini API & Xoay Vòng Nhiều Key (Multi-Key Rotation Engine):
Giao diện quản lý key: Hộp thoại cấu hình cho phép dán danh sách nhiều Gemini API Key (mỗi dòng 1 key, tự động lưu trữ và đồng bộ hóa qua localStorage).
Thuật toán Round-Robin & Failover tức thì:
Tự động luân phiên sử dụng key qua con trỏ vòng tròn.
Khi một key gặp lỗi 429 (Resource Exhausted) hoặc 403 (Invalid Key), hệ thống tự động ghi nhật ký, tạm thời vô hiệu hóa key đó và ngay lập tức kích hoạt key kế tiếp để thử lại request mà không làm gián đoạn tiến trình dựng video.
Model Selector & Thinking Level: Hỗ trợ lựa chọn giữa gemini-3.8-flash, gemini-3.1-flash-lite, gemini-3.1-pro-preview, gemini-4-argon kết hợp các mức thinkingConfig (Low / Medium / High).
2. Phân Tích Kịch Bản & Structured JSON:
Gửi kịch bản/chỉ dẫn kèm responseSchema (@google/genai) yêu cầu trả về các trường bắt buộc:
scene_id, title, narration_vi (lời bình gốc).
narration_normalized: tự động chuyển đổi số, đơn vị, ngày tháng sang chữ tiếng Việt hoàn chỉnh (ví dụ: "1.600 hòn đảo" 
 "một nghìn sáu trăm hòn đảo", "1.553 km2" 
 "một nghìn năm trăm năm mươi ba ki-lô-mét vuông").
search_keywords_en, camera_motion (zoom-in, zoom-out, pan-left, pan-right), lut_style (cinematic-teal-orange, warm-golden, natural-documentary, high-contrast).
Tính toán thời lượng đọc: Công thức chuẩn xác:
3. Nạp Tư Liệu Mở & Canvas Ken Burns (1280x720 30fps):
Wikimedia Commons Pipeline: Tự động tìm kiếm ảnh bản quyền mở từ search_keywords_en qua Wikimedia Commons API.
Procedural Canvas Fallback: Khi không tải được ảnh hoặc ảnh bị chặn CORS, Canvas tự động render nền gradient đa lớp theo chủ đề màu sắc, đi kèm 35 hạt ánh sáng chuyển động lơ lửng (ambient particles) và hiệu ứng vignette, đảm bảo không bao giờ bị lỗi màn hình đen.
Hiệu ứng điện ảnh:
Ken Burns mượt mà: Zoom-in (1.0 
 1.15), Zoom-out (1.15 
 1.0), Pan-left, Pan-right.
Chuyển cảnh Cross-dissolve mờ dần giữa các phân cảnh trong 0.8 giây cuối.
Bộ lọc màu LUT thông qua ctx.filter (Teal & Orange, Golden Sunset, Natural Documentary, High Contrast).
Phụ đề tiếng Việt động rõ nét, viền đen dày đổ bóng ở đáy màn hình.
4. Lồng Tiếng Việt & Audio Ducking (Web Audio API):
Lồng tiếng tiếng Việt 100%: Ưu tiên luồng phát Google TTS tiếng Việt qua endpoint proxy chống CORS (kèm <meta name="referrer" content="no-referrer">), hoặc Web Speech API lọc nghiêm ngặt giọng vi-VN (tuyệt đối không để giọng tiếng Anh đọc tiếng Việt).
Audio Ducking:
Kênh 1: Giọng đọc (Voiceover Node) - Gain 100%.
Kênh 2: Nhạc nền tài liệu (Background Music Node) - Gain mặc định 25%.
Khi giọng đọc cất lên, nhạc nền tự động hạ xuống mức 6% (linearRampToValueAtTime). Khi dứt lời, nhạc nền tự động nâng dần trở lại mức 25%.
Tích hợp bộ tổng hợp nhạc nền Procedural Ambient Synthesizer chạy trực tiếp bằng Web Audio API với 0 phụ thuộc file ngoài.
5. Xuất Video (.webm), Phụ Đề (.srt) & Tạo Mới Video:
🔄 Tạo Mới Video: Dừng ngay lập tức mọi luồng phát âm thanh và video đang chạy, xóa sạch ô kịch bản, làm mới danh sách phân cảnh và đặt lại con trỏ chuột vào khung nhập liệu.
🎬 Xuất Video (.webm): Gộp luồng canvas.captureStream(30) và audioDestination.stream qua MediaRecorder để ghi hình và tải về máy file [Ten_Bai_Hoc]_[Time].webm.
📄 Tải Phụ Đề (.srt): Xuất file .srt chuẩn SubRip tương ứng chính xác mốc thời gian của từng phân cảnh.
