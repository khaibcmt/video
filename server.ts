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

  // Gemini API Endpoint with Multi-Key Support and structured JSON
  app.post('/api/gemini/generate', async (req, res) => {
    const { apiKey, model = 'gemini-3.8-flash', thinkingLevel, prompt } = req.body;

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

      const systemInstruction = `Bạn là Đạo diễn Phim Tài liệu và Chuyên gia Biên kịch Video Hàng đầu.
Nhiệm vụ của bạn là nhận kịch bản hoặc chủ đề tiếng Việt từ người dùng và phân tích thành các phân cảnh điện ảnh (scenes) hoàn chỉnh.

QUY TẮC BẮT BUỘC:
1. Chia kịch bản thành từ 3 đến 8 phân cảnh logic, giàu tính hình tượng và cảm xúc.
2. Với mỗi phân cảnh:
   - scene_id: số thứ tự bắt đầu từ 1.
   - title: Tiêu đề phân cảnh ngắn gọn (3-6 từ).
   - narration_vi: Đoạn lời bình nguyên bản tiếng Việt xúc tích, truyền cảm (khoảng 15-40 từ).
   - narration_normalized: TỰ ĐỘNG CHUYỂN ĐỔI toàn bộ số, ngày tháng, phần trăm, đơn vị đo lường sang chữ tiếng Việt đầy đủ để giọng đọc máy (TTS) phát âm tự nhiên. Ví dụ:
     * "3.260 km" -> "ba nghìn hai trăm sáu mươi ki-lô-mét"
     * "160" -> "một trăm sáu mươi"
     * "năm 1975" -> "năm một nghìn chín trăm bảy mươi lăm"
     * "99%" -> "chín mươi chín phần trăm"
     * "100m" -> "một trăm mét"
     * "$500" -> "năm trăm đô-la"
   - search_keywords_en: 2-3 từ khóa tiếng Anh ngắn gọn, chính xác để tìm ảnh tư liệu trên Wikimedia Commons (ví dụ: "Ha Long Bay limestone", "ancient silk road desert", "black hole accretion disk").
   - camera_motion: Chọn 1 trong 4 hiệu ứng: "zoom-in" | "zoom-out" | "pan-left" | "pan-right".
   - lut_style: Chọn 1 trong 4 tông màu: "cinematic-teal-orange" | "warm-golden" | "natural-documentary" | "high-contrast".
`;

      const config: any = {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          description: 'Danh sách phân cảnh video tài liệu',
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
              search_keywords_en: {
                type: Type.STRING,
                description: '2-3 từ khóa tiếng Anh tìm tư liệu ảnh',
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
              'search_keywords_en',
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
      // Extract error status code for key rotation failover
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
