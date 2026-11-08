import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Google Translate Vietnamese TTS Proxy with anti-CORS & caching
  app.get('/api/tts', async (req, res) => {
    const text = req.query.text as string;
    if (!text) {
      res.status(400).json({ error: 'Missing text parameter' });
      return;
    }

    try {
      const trimmedText = text.slice(0, 200); // Google translate tts chunk limit
      const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(trimmedText)}&tl=vi&client=gtx`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://translate.google.com/',
        },
      });

      if (!response.ok) {
        res.status(response.status).json({ error: 'TTS upstream error' });
        return;
      }

      const buffer = await response.arrayBuffer();
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(Buffer.from(buffer));
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'TTS request failed' });
    }
  });

  // Image Proxy for Wikimedia or external images if CORS blocked
  app.get('/api/proxy-image', async (req, res) => {
    const imageUrl = req.query.url as string;
    if (!imageUrl) {
      res.status(400).json({ error: 'Missing url parameter' });
      return;
    }

    try {
      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'VietVideoStudio/1.0 (Educational Video Engine; contact@example.com)',
        },
      });

      if (!response.ok) {
        res.status(response.status).json({ error: 'Failed to fetch image upstream' });
        return;
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const buffer = await response.arrayBuffer();

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(Buffer.from(buffer));
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Image proxy failed' });
    }
  });

  // Video Proxy for Wikimedia Commons real video footage (.webm / .mp4 / .ogv)
  app.get('/api/proxy-video', async (req, res) => {
    const videoUrl = req.query.url as string;
    if (!videoUrl) {
      res.status(400).json({ error: 'Missing url parameter' });
      return;
    }

    try {
      const response = await fetch(videoUrl, {
        headers: {
          'User-Agent': 'VietVideoStudio/2.0 (Pro Documentary Video Engine; contact@example.com)',
        },
      });

      if (!response.ok) {
        res.status(response.status).json({ error: 'Failed to fetch video upstream' });
        return;
      }

      const contentType = response.headers.get('content-type') || 'video/webm';
      const buffer = await response.arrayBuffer();

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(Buffer.from(buffer));
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Video proxy failed' });
    }
  });

  // Gemini API Endpoint with Multi-Key Support and 4-Part Pedagogical AI Director structured JSON
  app.post('/api/gemini/generate', async (req, res) => {
    const {
      apiKey,
      model = 'gemini-3.8-flash',
      thinkingLevel,
      topicTitle = '',
      subject = 'Sinh học',
      prompt = '',
      targetDurationSec = 120,
    } = req.body;

    const effectiveApiKey = apiKey || process.env.GEMINI_API_KEY;

    if (!effectiveApiKey) {
      res.status(400).json({
        error: {
          status: 400,
          message: 'Không tìm thấy Gemini API Key. Vui lòng nhập API Key vào ô cấu hình.',
        },
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: effectiveApiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      let chosenThinkingLevel: ThinkingLevel | undefined;
      if (thinkingLevel === 'low') chosenThinkingLevel = ThinkingLevel.LOW;
      else if (thinkingLevel === 'medium') chosenThinkingLevel = ThinkingLevel.MEDIUM;
      else if (thinkingLevel === 'high') chosenThinkingLevel = ThinkingLevel.HIGH;

      const durationSec = Math.max(30, Math.min(300, Number(targetDurationSec) || 120));
      const targetSceneCount = durationSec <= 75 ? 3 : durationSec <= 150 ? 5 : 7;
      const targetMin = Math.floor(durationSec / 60);
      const targetSecRemainder = durationSec % 60;
      const durationDisplay = `${targetMin > 0 ? `${targetMin} phút ` : ''}${targetSecRemainder > 0 ? `${targetSecRemainder} giây` : ''}`;

      const systemInstruction = `Bạn là Đạo Diễn Sư Phạm AI Tự Động (Autonomous Pedagogical Video Director) chuyên nghiệp cho môn ${subject}.
Nhiệm vụ của bạn là nhận Tên bài học / Chủ đề (và kịch bản gợi ý nếu có) từ người dùng và tự động biên soạn kịch bản bài giảng video chuyển động theo CẤU TRÚC 4 PHẦN SƯ PHẠM CHUẨN gồm đúng ${targetSceneCount} phân cảnh (scenes) cho tổng thời lượng ${durationSec} giây (~${durationDisplay}):
- Phần 1: Mở đầu & Đặt vấn đề (Khởi động hấp dẫn)
- Phần 2: Khám phá Kiến thức Trọng tâm 1 (Phân loại / Bản chất khoa học)
- Phần 3: Khám phá Kiến thức Trọng tâm 2 (Quy trình / Cơ chế / Phương thức kỹ thuật)
- Phần 4: Ứng dụng Thực tiễn & Tổng kết Bài học

CÁC QUY TẮC BẮT BUỘC TUÂN THỦ:
1. KHỚP ĐỘ DÀI MỤC TIÊU & NHỊP ĐỌC SƯ PHẠM LƯU LOÁT:
   - Tổng độ dài video yêu cầu là: ${durationSec} GIÂY (~${targetSceneCount} cảnh).
   - Mỗi phân cảnh có 1-2 câu giảng bài mạch lạc, giàu hình ảnh thực tế (khoảng 22 đến 38 từ mỗi cảnh) để giọng đọc thuyết minh tiếng Việt phát âm trôi chảy, tự nhiên.

2. LƯỢC BỎ TỪ KHÔNG LIÊN QUAN ĐẾN LỜI THOẠI:
   - Trong 'narration_vi': TUYỆT ĐỐI LOẠI BỎ mọi ghi chú kỹ thuật, hướng dẫn đạo diễn như "[Cảnh 1]", "(Nhạc nền)", "MC:", "Giáo viên:". Chỉ giữ lại lời giảng nguyên bản.

3. TRÍCH XUẤT 'exact_video_search_en' & ĐỒNG CẤU VIDEO CHUYỂN ĐỘNG THẬT 100%:
   - 'exact_video_search_en': 2-3 từ khóa tiếng Anh CỰC KỲ CỤ THỂ về chủ thể chuyển động thực tế trong cảnh (ví dụ: "swimming catfish underwater", "shrimp pond aerator splashing", "modern high school classroom discussion", "scientist laboratory microscope research", "Ha Long Bay Vietnam aerial boat").
   - 'search_keywords_en': Đặt trùng hoặc bổ trợ sát với 'exact_video_search_en'.
   - 'visual_prompt_en': 1 câu mô tả khung hình 16:9 bằng tiếng Anh chi tiết cho cơ chế Fallback ảnh HD Ken Burns nếu video tải quá 5 giây.
   - 'wikipedia_topic_en': Chủ đề thực thể tiếng Anh chuẩn trên Wikipedia liên quan trực tiếp đến cảnh đó.

4. CHUẨN HÓA SỐ VÀ ĐƠN VỊ THÀNH CHỮ TIẾNG VIỆT (narration_normalized):
   - TỰ ĐỘNG CHUYỂN ĐỔI 100% các con số, ký hiệu, phần trăm, đơn vị đo lường sang chữ tiếng Việt đầy đủ để giọng đọc máy phát âm chuẩn xác ("3.260 km" -> "ba nghìn hai trăm sáu mươi ki-lô-mét", "5 mg/l" -> "năm mi-li-gam trên lít").`;

      const combinedContents = `Tên bài học / Chủ đề: "${topicTitle || prompt}"
Môn học: ${subject}
Thời lượng mục tiêu: ${durationSec} giây (~${targetSceneCount} phân cảnh)
Nội dung chi tiết / Yêu cầu thêm: ${prompt || topicTitle}`;

      const config: any = {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          description: 'Danh sách phân cảnh bài giảng sư phạm 4 phần chuẩn',
          items: {
            type: Type.OBJECT,
            properties: {
              scene_id: { type: Type.INTEGER, description: 'Số thứ tự phân cảnh' },
              title: { type: Type.STRING, description: 'Tiêu đề ngắn của phân cảnh' },
              pedagogical_section: {
                type: Type.STRING,
                description: 'Phần sư phạm (Phần 1: Mở đầu, Phần 2: Kiến thức 1, Phần 3: Kiến thức 2, Phần 4: Ứng dụng & Tổng kết)',
              },
              narration_vi: { type: Type.STRING, description: 'Lời giảng gốc tiếng Việt' },
              narration_normalized: {
                type: Type.STRING,
                description: 'Lời giảng đã chuẩn hóa 100% số và đơn vị thành chữ tiếng Việt',
              },
              exact_video_search_en: {
                type: Type.STRING,
                description: '2-3 từ khóa tiếng Anh cực kỳ cụ thể về chủ thể chuyển động thực tế',
              },
              visual_prompt_en: {
                type: Type.STRING,
                description: 'Mô tả chi tiết khung hình 16:9 HD bằng tiếng Anh khớp 100% nội dung cảnh',
              },
              search_keywords_en: {
                type: Type.STRING,
                description: '2-3 danh từ tiếng Anh cụ thể mô tả chủ thể chính của phân cảnh',
              },
              wikipedia_topic_en: {
                type: Type.STRING,
                description: 'Tên thực thể/chủ đề tiếng Anh chuẩn trên Wikipedia của cảnh này',
              },
              camera_motion: {
                type: Type.STRING,
                enum: ['zoom-in', 'zoom-out', 'pan-left', 'pan-right'],
                description: 'Hiệu ứng chuyển động máy quay Ken Burns',
              },
              lut_style: {
                type: Type.STRING,
                enum: ['cinematic-teal-orange', 'warm-golden', 'natural-documentary', 'high-contrast'],
                description: 'Bộ lọc màu điện ảnh',
              },
            },
            required: [
              'scene_id',
              'title',
              'pedagogical_section',
              'narration_vi',
              'narration_normalized',
              'exact_video_search_en',
              'visual_prompt_en',
              'search_keywords_en',
              'wikipedia_topic_en',
              'camera_motion',
              'lut_style',
            ],
          },
        },
      };

      if (chosenThinkingLevel && (model.includes('gemini-3') || model.includes('gemini-4'))) {
        config.thinkingConfig = { thinkingLevel: chosenThinkingLevel };
      }

      const response = await ai.models.generateContent({
        model,
        contents: combinedContents,
        config,
      });

      const responseText = response.text || '[]';
      const parsedScenes = JSON.parse(responseText);

      res.json({
        success: true,
        scenes: parsedScenes,
      });
    } catch (err: any) {
      console.error('Gemini API Error:', err);
      let statusCode = 500;
      const errMsg = err?.message || String(err);
      if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        statusCode = 429;
      } else if (errMsg.includes('403') || errMsg.includes('PERMISSION_DENIED') || errMsg.includes('API_KEY_INVALID')) {
        statusCode = 403;
      } else if (err.status) {
        statusCode = err.status;
      }

      res.status(statusCode).json({
        error: {
          status: statusCode,
          message: errMsg,
          details: err,
        },
      });
    }
  });

  // Endpoint to generate exact story-matched scene image using Gemini Image model if available
  app.post('/api/gemini/generate-scene-image', async (req, res) => {
    const { apiKey, visualPrompt } = req.body;
    const effectiveApiKey = apiKey || process.env.GEMINI_API_KEY;

    if (!effectiveApiKey || !visualPrompt) {
      res.status(400).json({ error: 'Missing apiKey or visualPrompt' });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: effectiveApiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-image',
        contents: {
          parts: [
            {
              text: `Cinematic 16:9 high-resolution illustration/photography, no text, no watermark, vivid storytelling composition: ${visualPrompt}`,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: '16:9',
          },
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          const dataUrl = `data:${mime};base64,${part.inlineData.data}`;
          res.json({ success: true, imageUrl: dataUrl });
          return;
        }
      }

      res.status(404).json({ error: 'No image generated' });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Image generation failed' });
    }
  });

  // Mount Vite in development or serve static in production
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 VietVideo Engine running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
