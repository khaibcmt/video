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

/**
 * Wraps raw 16-bit PCM mono audio (e.g. 24000 Hz from Gemini Native TTS) in a 44-byte RIFF WAV header
 * so standard browser AudioContext.decodeAudioData() can decode it with 100% compatibility.
 */
function pcm16ToWavBuffer(pcmBuffer: Buffer, sampleRate: number = 24000, numChannels: number = 1): Buffer {
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34); // BitsPerSample
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', version: '3.0.0', timestamp: new Date().toISOString() });
  });

  // Tier 2 Multi-Chunk Vietnamese Neural TTS Stream Proxy with anti-CORS & caching
  app.get('/api/tts', async (req, res) => {
    const text = req.query.text as string;
    if (!text) {
      res.status(400).json({ error: 'Missing text parameter' });
      return;
    }

    try {
      const trimmedText = text.slice(0, 200);
      const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(trimmedText)}&tl=vi&client=gtx`;

      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Referer: 'https://translate.google.com/',
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

  // Tier 1 Human-Like Neural Voice Endpoint (Gemini 2.5 Native Audio / OpenAI TTS / ElevenLabs / Neural Fallback)
  app.post('/api/tts/neural', async (req, res) => {
    const {
      text,
      voiceId = 'female-neural',
      apiKey,
      openaiTtsApiKey,
      elevenLabsApiKey,
      useGeminiNative = false,
    } = req.body || {};

    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'Missing text for neural TTS' });
      return;
    }

    // 1. Optional OpenAI Neural TTS (if teacher configured OpenAI TTS Key)
    if (openaiTtsApiKey && String(openaiTtsApiKey).trim().startsWith('sk-')) {
      try {
        const oaRes = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${String(openaiTtsApiKey).trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'tts-1',
            voice: voiceId === 'male-neural' ? 'onyx' : 'nova',
            input: text.slice(0, 1000),
            response_format: 'mp3',
          }),
        });
        if (oaRes.ok) {
          const buf = Buffer.from(await oaRes.arrayBuffer());
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.send(buf);
          return;
        }
      } catch {
        // Fall through to next neural provider
      }
    }

    // 2. Optional ElevenLabs Multilingual v2 Neural TTS (if teacher configured ElevenLabs Key)
    if (elevenLabsApiKey && String(elevenLabsApiKey).trim().length > 10) {
      try {
        const elVoice =
          voiceId === 'male-neural'
            ? 'pNInz6obpgDQGcFmaJgB' // Adam (Warm male)
            : '21m00Tcm4TlvDq8ikWAM'; // Rachel (Expressive female)
        const elRes = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${elVoice}`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': String(elevenLabsApiKey).trim(),
              'Content-Type': 'application/json',
              Accept: 'audio/mpeg',
            },
            body: JSON.stringify({
              text: text.slice(0, 1000),
              model_id: 'eleven_multilingual_v2',
            }),
          }
        );
        if (elRes.ok) {
          const buf = Buffer.from(await elRes.arrayBuffer());
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.send(buf);
          return;
        }
      } catch {
        // Fall through to Gemini Native TTS / Neural stream
      }
    }

    // 3. Gemini 2.5 Flash Native Audio TTS (when explicitly requested & API key present)
    const effectiveGeminiKey = apiKey || process.env.GEMINI_API_KEY;
    if (useGeminiNative && effectiveGeminiKey) {
      try {
        const ai = new GoogleGenAI({
          apiKey: effectiveGeminiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const geminiVoiceName = voiceId === 'male-neural' ? 'Puck' : 'Kore';
        const ttsPrompt = `Hãy đọc đoạn văn bản bài giảng sau bằng tiếng Việt chuẩn, giọng giáo viên ${
          voiceId === 'male-neural' ? 'nam ấm áp, chững chạc' : 'nữ truyền cảm, dịu dàng'
        }, ngắt nghỉ tự nhiên như người thật, nhấn giọng ở các thuật ngữ quan trọng: "${text}"`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-preview-tts',
          contents: [{ parts: [{ text: ttsPrompt }] }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: geminiVoiceName },
              },
            },
          } as any,
        });

        for (const part of response.candidates?.[0]?.content?.parts ?? []) {
          if (part.inlineData?.data) {
            const rawBuf = Buffer.from(part.inlineData.data, 'base64');
            const mime = (part.inlineData.mimeType || '').toLowerCase();
            if (mime.includes('pcm') || mime.includes('l16')) {
              const wavBuf = pcm16ToWavBuffer(rawBuf, 24000, 1);
              res.setHeader('Content-Type', 'audio/wav');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.send(wavBuf);
              return;
            }
            res.setHeader('Content-Type', part.inlineData.mimeType || 'audio/wav');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.send(rawBuf);
            return;
          }
        }
      } catch {
        // Fall through to fast multi-chunk neural stream
      }
    }

    // 4. Fast Vietnamese Neural TTS stream fallback
    try {
      const trimmedText = text.slice(0, 190);
      const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
        trimmedText
      )}&tl=vi&client=gtx`;
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Referer: 'https://translate.google.com/',
        },
      });
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(Buffer.from(buffer));
        return;
      }
    } catch {
      // ignore
    }

    res.status(502).json({ error: 'Neural TTS generation unavailable' });
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
          'User-Agent': 'VietVideoStudio/3.0 (Educational Video Engine; contact@example.com)',
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
          'User-Agent': 'VietVideoStudio/3.0 (Pro Documentary Video Engine; contact@example.com)',
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

  // V3.0 Gemini Scene-Graph Endpoint: 4-Part Pedagogical Structure + Expressive Storytelling + Multi-Beat Visuals
  app.post('/api/gemini/generate', async (req, res) => {
    const {
      apiKey,
      model = 'gemini-3.8-flash',
      thinkingLevel,
      topicTitle = '',
      subject = 'Sinh học',
      directorInstructions = '',
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

      const systemInstruction = `Bạn là Đạo Diễn Sư Phạm AI Đa Phương Thức Thế Hệ V3.0 (Autonomous Pedagogical Scene-Graph Director) cho môn ${subject}.
Nhiệm vụ của bạn là biên soạn kịch bản bài giảng video chuyển động thực tế gồm đúng ${targetSceneCount} phân cảnh (scenes) cho tổng thời lượng ${durationSec} giây, tuân thủ CẤU TRÚC 4 PHẦN SƯ PHẠM CHUẨN:
- Phần 1: Mở đầu & Đặt vấn đề
- Phần 2: Kiến thức trọng tâm 1
- Phần 3: Kiến thức trọng tâm 2
- Phần 4: Ứng dụng thực tiễn & Tổng kết

QUY TẮC BẮT BUỘC V3.0:
1. PHÂN TÍCH SÂU "CHỈ DẪN ĐẠO DIỄN":
   - Nếu giáo viên cung cấp "Chỉ dẫn Đạo diễn & Yêu cầu Hình ảnh cụ thể", BẮT BUỘC cài đặt chính xác từng bối cảnh, phép so sánh và công thức (ví dụ: DO >= 5 mg/l, bối cảnh ao nuôi ĐBSCL...) vào đúng các phân cảnh và nhãn 'pedagogical_badge' tương ứng.

2. VĂN PHONG KỂ CHUYỆN SƯ PHẠM TRUYỀN CẢM (Expressive Pedagogical Storytelling):
   - Viết 'narration_vi' và 'narration_normalized' uyển chuyển, giàu cảm xúc như giáo viên giảng bài thật trên lớp, tự động chèn dấu phẩy (,), dấu chấm (.), dấu ba chấm (...) để tạo độ ngân và nhịp thở tự nhiên.
   - Trong 'narration_normalized': BẮT BUỘC chuẩn hóa 100% số, ký hiệu, công thức hóa học/vật lý/sinh học sang chữ đọc tiếng Việt chuẩn xác ("3.260 km" -> "ba nghìn hai trăm sáu mươi ki-lô-mét", "5 mg/l" -> "năm mi-li-gam trên lít", "H2O" -> "hát hai ô", "CO2" -> "xê ô hai").

3. CHIA MỖI PHÂN CẢNH THÀNH 2 ĐẾN 3 NHỊP HÌNH ẢNH ('visual_beats'):
   - Mỗi Scene PHẢI có mảng 'visual_beats' gồm 2 đến 3 nhịp (mỗi nhịp 4-6 giây) khớp với từng ý trong câu thoại:
     + 'trigger_phrase': Cụm từ tiếng Việt kích hoạt nhịp hình ảnh này.
     + 'progress_ratio': Tỷ lệ thời điểm xuất hiện trong câu (ví dụ nhịp 1 là 0.0, nhịp 2 là 0.5).
     + 'search_queries_ranked': Mảng 3 cụm từ khóa tiếng Anh mô tả hành động thực tế từ chi tiết nhất đến tổng quát để tìm video MP4 thật (VD: ["shrimp pond paddlewheel aerator splashing", "aquaculture pond water aeration", "fish farming"]).
     + 'ai_visual_prompt': Câu lệnh tiếng Anh chuẩn điện ảnh mô tả sát 100% nội dung kiến thức của câu thoại để sinh hình ảnh HD 1280x720 khi kho video không có cảnh đặc thù.
     + 'pedagogical_badge': Nhãn công thức/kiến thức trọng tâm hiện nổi bật trên góc màn hình (VD: "Hàm lượng Oxy (DO) >= 5 mg/l").`;

      const combinedContents = `Tên bài học / Chủ đề: "${topicTitle || prompt}"
Môn học: ${subject}
Thời lượng mục tiêu: ${durationSec} giây (~${targetSceneCount} phân cảnh)
Chỉ dẫn Đạo diễn & Yêu cầu Hình ảnh cụ thể: "${directorInstructions || 'Tự động đạo diễn theo chuẩn sư phạm'}"
Nội dung kịch bản chi tiết: "${prompt || topicTitle}"`;

      const config: any = {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          description: 'Danh sách phân cảnh bài giảng sư phạm V3.0 kèm visual_beats',
          items: {
            type: Type.OBJECT,
            properties: {
              scene_id: { type: Type.INTEGER },
              title: { type: Type.STRING },
              pedagogical_section: { type: Type.STRING },
              narration_vi: { type: Type.STRING },
              narration_normalized: { type: Type.STRING },
              exact_video_search_en: { type: Type.STRING },
              visual_prompt_en: { type: Type.STRING },
              search_keywords_en: { type: Type.STRING },
              wikipedia_topic_en: { type: Type.STRING },
              pedagogical_badge: { type: Type.STRING },
              camera_motion: {
                type: Type.STRING,
                enum: ['zoom-in', 'zoom-out', 'pan-left', 'pan-right'],
              },
              lut_style: {
                type: Type.STRING,
                enum: [
                  'cinematic-teal-orange',
                  'warm-golden',
                  'natural-documentary',
                  'high-contrast',
                ],
              },
              visual_beats: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    beat_id: { type: Type.INTEGER },
                    trigger_phrase: { type: Type.STRING },
                    progress_ratio: { type: Type.NUMBER },
                    search_queries_ranked: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    ai_visual_prompt: { type: Type.STRING },
                    pedagogical_badge: { type: Type.STRING },
                  },
                  required: [
                    'beat_id',
                    'trigger_phrase',
                    'progress_ratio',
                    'search_queries_ranked',
                    'ai_visual_prompt',
                    'pedagogical_badge',
                  ],
                },
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
              'pedagogical_badge',
              'camera_motion',
              'lut_style',
              'visual_beats',
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
      } else if (
        errMsg.includes('403') ||
        errMsg.includes('PERMISSION_DENIED') ||
        errMsg.includes('API_KEY_INVALID')
      ) {
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
              text: `Cinematic 16:9 high-resolution educational documentary illustration/photography, no text, no watermark, vivid scientific composition: ${visualPrompt}`,
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
    console.log(`🚀 VietVideo Engine V3.0 running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
