import { Scene, ThinkingLevelOption } from '../types';
import { keyRotationEngine } from './keyRotation';

export function calculateSceneDuration(narrationNormalized: string): number {
  if (!narrationNormalized) return 5;
  const wordCount = narrationNormalized.trim().split(/\s+/).filter(Boolean).length;
  // duration_seconds = Math.max(5, Math.round(wordCount / 3.25 + 1))
  return Math.max(5, Math.round(wordCount / 3.25 + 1));
}

/**
 * Fallback client-side normalizer to guarantee no raw digits slip through
 */
export function normalizeVietnameseNumbers(text: string): string {
  if (!text) return '';

  const units: Record<string, string> = {
    km: 'ki-lô-mét',
    m: 'mét',
    cm: 'xen-ti-mét',
    mm: 'mi-li-mét',
    kg: 'ki-lô-gam',
    g: 'gam',
    '%': ' phần trăm',
    'ha': 'héc-ta',
    '$': 'đô-la ',
    'usd': 'đô-la mỹ',
    'vnd': 'việt nam đồng',
    'đ': 'đồng',
  };

  let result = text;

  // Replace common units
  result = result.replace(/(\d+)\s*(km|m|cm|mm|kg|g|ha|%)/gi, (_match, num, unit) => {
    return `${num} ${units[unit.toLowerCase()] || unit}`;
  });

  return result;
}

export interface AnalyzeScriptParams {
  script: string;
  model: string;
  thinkingLevel: ThinkingLevelOption;
  onStatusUpdate?: (status: string) => void;
}

export async function analyzeScript({
  script,
  model,
  thinkingLevel,
  onStatusUpdate,
}: AnalyzeScriptParams): Promise<Scene[]> {
  if (!script.trim()) {
    throw new Error('Vui lòng nhập nội dung kịch bản hoặc chọn kịch bản mẫu.');
  }

  onStatusUpdate?.('Đang gửi kịch bản vào Gemini API với cơ chế xoay vòng key...');

  return await keyRotationEngine.executeWithRotation(async (apiKey) => {
    try {
      // First attempt: call local/fullstack backend proxy
      const response = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey,
          model,
          thinkingLevel,
          prompt: script,
        }),
      });

      if (!response.ok) {
        let errData: any = {};
        try {
          errData = await response.json();
        } catch {
          // ignore
        }
        const error = new Error(errData?.error?.message || `Server returned ${response.status}`);
        (error as any).status = response.status;
        throw error;
      }

      const data = await response.json();
      if (!data.success || !Array.isArray(data.scenes)) {
        throw new Error('Định dạng dữ liệu phân cảnh từ Gemini không hợp lệ.');
      }

      const processedScenes: Scene[] = data.scenes.map((s: any, idx: number) => {
        const narrationNorm = s.narration_normalized || normalizeVietnameseNumbers(s.narration_vi);
        const duration = calculateSceneDuration(narrationNorm);
        return {
          scene_id: s.scene_id || idx + 1,
          title: s.title || `Phân cảnh ${idx + 1}`,
          narration_vi: s.narration_vi || '',
          narration_normalized: narrationNorm,
          search_keywords_en: s.search_keywords_en || 'vietnam landscape cinematic',
          camera_motion: s.camera_motion || 'zoom-in',
          lut_style: s.lut_style || 'cinematic-teal-orange',
          duration_seconds: duration,
        };
      });

      return processedScenes;
    } catch (err: any) {
      // Check if this was a 404 on /api/gemini/generate (e.g. running statically on GitHub Pages)
      // If running on static host with client API key, fallback to direct Google Generative AI REST API!
      if (err.status === 404 && apiKey) {
        onStatusUpdate?.('Đang chuyển hướng gọi trực tiếp Gemini REST API (Chế độ GitHub Pages)...');
        return await callGeminiDirectRest(script, model, thinkingLevel, apiKey);
      }
      throw err;
    }
  });
}

/**
 * Direct REST API fallback for GitHub Pages hosting
 */
async function callGeminiDirectRest(
  prompt: string,
  model: string,
  thinkingLevel: ThinkingLevelOption,
  apiKey: string
): Promise<Scene[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const systemInstruction = `Bạn là Đạo diễn Phim Tài liệu và Biên kịch Video Hàng đầu. Phân tích kịch bản tiếng Việt thành mảng các phân cảnh điện ảnh chuẩn JSON theo schema. Tự động chuẩn hóa mọi số và đơn vị đo lường sang chữ tiếng Việt đầy đủ trong trường narration_normalized.`;

  const requestBody: any = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        description: 'Danh sách phân cảnh video',
        items: {
          type: 'OBJECT',
          properties: {
            scene_id: { type: 'INTEGER' },
            title: { type: 'STRING' },
            narration_vi: { type: 'STRING' },
            narration_normalized: { type: 'STRING' },
            search_keywords_en: { type: 'STRING' },
            camera_motion: {
              type: 'STRING',
              enum: ['zoom-in', 'zoom-out', 'pan-left', 'pan-right'],
            },
            lut_style: {
              type: 'STRING',
              enum: ['cinematic-teal-orange', 'warm-golden', 'natural-documentary', 'high-contrast'],
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
    },
  };

  if (thinkingLevel && (model.includes('gemini-3') || model.includes('gemini-4'))) {
    const levelMap: Record<string, string> = {
      low: 'LOW',
      medium: 'MEDIUM',
      high: 'HIGH',
    };
    requestBody.generationConfig.thinkingConfig = {
      thinkingLevel: levelMap[thinkingLevel] || 'MEDIUM',
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    const error = new Error(errJson?.error?.message || `HTTP ${res.status}`);
    (error as any).status = res.status;
    throw error;
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const scenesRaw = JSON.parse(text);

  return scenesRaw.map((s: any, idx: number) => {
    const norm = s.narration_normalized || normalizeVietnameseNumbers(s.narration_vi);
    return {
      scene_id: s.scene_id || idx + 1,
      title: s.title || `Phân cảnh ${idx + 1}`,
      narration_vi: s.narration_vi || '',
      narration_normalized: norm,
      search_keywords_en: s.search_keywords_en || 'vietnam landscape documentary',
      camera_motion: s.camera_motion || 'zoom-in',
      lut_style: s.lut_style || 'cinematic-teal-orange',
      duration_seconds: calculateSceneDuration(norm),
    };
  });
}
