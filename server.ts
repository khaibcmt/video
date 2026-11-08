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

  // Gemini API Endpoint with Multi-Key Support and structured JSON
  app.post('/api/gemini/generate', async (req, res) => {
    const { apiKey, model = 'gemini-3.8-flash', thinkingLevel, prompt, targetDurationSec = 60 } = req.body;

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

      const durationSec = Math.max(30, Math.min(300, Number(targetDurationSec) || 60));
      const targetMin = Math.floor(durationSec / 60);
      const targetSecRemainder = durationSec % 60;
      const durationDisplay = `${targetMin > 0 ? `${targetMin} phút ` : ''}${targetSecRemainder > 0 ? `${targetSecRemainder} giây` : ''}`;

      const systemInstruction = `Bạn là Đạo diễn Phim Tài liệu và Chuyên gia Biên kịch Hình ảnh Hàng đầu.
Nhiệm vụ của bạn là nhận kịch bản hoặc câu chuyện từ người dùng và phân tích thành các phân cảnh điện ảnh (scenes) đồng cấu 100% giữa lời kể và hình ảnh minh họa.

CÁC QUY TẮC BẮT BUỘC TUÂN THỦ:
1. KHỚP ĐỘ DÀI MỤC TIÊU & NHỊP ĐỌC LƯU LOÁT:
   - Tổng độ dài video người dùng yêu cầu là: ${durationSec} GIÂY (~${durationDisplay}). Tối đa là 5 phút (300 giây).
   - Mỗi phân cảnh nên có từ 1 đến 2 câu lời bình mạch lạc, giàu hình ảnh (khoảng 18 đến 38 từ mỗi cảnh) để giọng đọc lồng tiếng phát âm trôi chảy, lưu loát, tự nhiên, không bị hụt hơi hay vấp chữ.
   - Tổng thời lượng các phân cảnh cộng lại xấp xỉ bằng ${durationSec} giây.

2. LƯỢC BỎ TỪ KHÔNG LIÊN QUAN ĐẾN LỜI THOẠI:
   - Trong 'narration_vi': TUYỆT ĐỐI LOẠI BỎ mọi ghi chú kỹ thuật, hướng dẫn đạo diễn, ký hiệu kịch bản như "[Cảnh 1]", "(Nhạc nền du dương)", "MC:", "Người dẫn chuyện:", "Hình ảnh:...", các câu lệnh chỉ dẫn của người dùng.
   - CHỈ GIỮ LẠI LỜI BÌNH / LỜI THOẠI NGUYÊN BẢN trong trẻo, tự nhiên, truyền cảm để đọc và hiển thị phụ đề.

3. ĐỒNG CẤU VIDEO CHUYỂN ĐỘNG THẬT 100% (search_keywords_en, visual_prompt_en, wikipedia_topic_en):
   - Toàn bộ phân cảnh BẮT BUỘC sử dụng VIDEO CHUYỂN ĐỘNG THẬT (MP4/WebM), tuyệt đối không dùng ảnh tĩnh.
   - Nếu câu thoại nói về sinh vật, thiết bị hay bối cảnh nào, 'search_keywords_en' PHẢI dịch chính xác sang cụm từ khóa truy vấn video chuyển động tiếng Anh chuyên ngành của đúng thực thể đó (ví dụ: "swimming catfish underwater", "shrimp pond aerator splashing", "modern high school classroom discussion", "Ha Long Bay Vietnam aerial boat", "tortoise walking forest nature").
   - 'visual_prompt_en': Mô tả cảnh quay video 16:9 chuyển động bằng tiếng Anh khớp 100% với hành động trong câu thoại.
   - 'wikipedia_topic_en': Chủ đề thực thể tiếng Anh tương ứng (ví dụ: "Catfish", "Shrimp farming", "Hạ Long Bay", "Black hole").

4. CHUẨN HÓA SỐ VÀ ĐƠN VỊ THÀNH CHỮ TIẾNG VIỆT (narration_normalized):
   - TỰ ĐỘNG CHUYỂN ĐỔI 100% các con số, ngày tháng, phần trăm, đơn vị đo lường sang chữ tiếng Việt đầy đủ để giọng đọc máy phát âm chuẩn xác, không bị khựng.
     Ví dụ: "3.260 km" -> "ba nghìn hai trăm sáu mươi ki-lô-mét", "160" -> "một trăm sáu mươi", "1975" -> "năm một nghìn chín trăm bảy mươi lăm".
`;

      const config: any = {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          description: 'Danh sách phân cảnh video đồng cấu nội dung và hình ảnh',
          items: {
            type: Type.OBJECT,
            properties: {
              scene_id: { type: Type.INTEGER, description: 'Số thứ tự phân cảnh' },
              title: { type: Type.STRING, description: 'Tiêu đề ngắn của phân cảnh' },
              narration_vi: { type: Type.STRING, description: 'Lời bình gốc tiếng Việt' },
              narration_normalized: {
                type: Type.STRING,
                description: 'Lời bình đã chuẩn hóa số và đơn vị thành chữ tiếng Việt',
              },
              visual_prompt_en: {
                type: Type.STRING,
                description: 'Mô tả chi tiết khung hình 16:9 bằng tiếng Anh khớp 100% hành động và nhân vật trong câu thoại',
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
                description: 'Hiệu ứng chuyển động máy quay',
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
              'narration_vi',
              'narration_normalized',
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
        contents: prompt,
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
