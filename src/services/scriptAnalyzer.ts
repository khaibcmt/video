import { Scene, ThinkingLevelOption } from '../types';
import { keyRotationEngine } from './keyRotation';
import { matchSamplePreset } from './sampleData';
import { extractVisualKeywordsFromVietnamese } from './mediaLoader';

/**
 * Strips out extraneous meta-instructions, stage directions, scene headers, and non-spoken text
 */
export function cleanExtraneousInstructions(text: string): string {
  if (!text) return '';
  return text
    // Remove bracket tags like [Phân cảnh 1], [Cảnh 2: ...], [Âm nhạc...]
    .replace(/\[[^\]]*\]/g, '')
    // Remove parenthetical stage cues like (Nhạc nền nhẹ nhàng), (MC cười), (Chuyển cảnh)
    .replace(
      /\([^\)]*(nhạc|cảnh|tiếng|hiệu ứng|camera|video|mc|đạo diễn|zoom|pan|intro|outro)[^\)]*\)/gi,
      ''
    )
    // Remove labels like "Phân cảnh 1:", "Cảnh 1:", "Lời bình:", "Lời thoại:", "MC:", "Người dẫn chuyện:"
    .replace(/(phân cảnh|cảnh|scene)\s*\d+\s*[:\-–.]/gi, '')
    .replace(
      /(lời bình|lời thoại|thuyết minh|voiceover|narration|mc|người dẫn chuyện|hình ảnh|mô tả|kịch bản)\s*[:\-–.]/gi,
      ''
    )
    // Clean markdown bold/bullets
    .replace(/[*#_~`]/g, '')
    // Collapse extra whitespaces
    .replace(/\s+/g, ' ')
    .trim();
}

const DIGITS_VI = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

function readThreeDigits(n: number, showZeroHundred: boolean): string {
  const tram = Math.floor(n / 100);
  const chuc = Math.floor((n % 100) / 10);
  const donvi = n % 10;

  const parts: string[] = [];

  if (tram > 0 || showZeroHundred) {
    parts.push(`${DIGITS_VI[tram]} trăm`);
  }

  if (chuc === 0 && donvi > 0) {
    if (tram > 0 || showZeroHundred) {
      parts.push('lẻ');
    }
    parts.push(DIGITS_VI[donvi]);
  } else if (chuc === 1) {
    parts.push('mười');
    if (donvi === 5) {
      parts.push('lăm');
    } else if (donvi > 0) {
      parts.push(DIGITS_VI[donvi]);
    }
  } else if (chuc > 1) {
    parts.push(`${DIGITS_VI[chuc]} mươi`);
    if (donvi === 1) {
      parts.push('mốt');
    } else if (donvi === 4) {
      parts.push('tư');
    } else if (donvi === 5) {
      parts.push('lăm');
    } else if (donvi > 0) {
      parts.push(DIGITS_VI[donvi]);
    }
  }

  return parts.join(' ');
}

/**
 * Converts any integer into natural spoken Vietnamese words
 */
export function numberToVietnameseWords(numStr: string): string {
  // Remove thousand separators (dots or commas used between 3 digits, e.g. 3.260 or 4.000.000)
  const cleanDigits = numStr.replace(/[.,](?=\d{3}\b)/g, '');

  // Handle decimal comma/dot if remaining (e.g., 3,5 or 3.5)
  if (cleanDigits.includes(',') || cleanDigits.includes('.')) {
    const sep = cleanDigits.includes(',') ? ',' : '.';
    const [intPart, decPart] = cleanDigits.split(sep);
    return `${numberToVietnameseWords(intPart)} phẩy ${numberToVietnameseWords(decPart)}`;
  }

  const n = parseInt(cleanDigits, 10);
  if (isNaN(n)) return numStr;
  if (n === 0) return 'không';

  const units = ['', 'nghìn', 'triệu', 'tỷ'];
  const groups: number[] = [];
  let temp = Math.abs(n);

  while (temp > 0) {
    groups.push(temp % 1000);
    temp = Math.floor(temp / 1000);
  }

  const resultParts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const grp = groups[i];
    if (grp > 0) {
      const showZeroHundred = i < groups.length - 1;
      const text = readThreeDigits(grp, showZeroHundred);
      const unitLabel = units[i % 4];
      resultParts.push(unitLabel ? `${text} ${unitLabel}` : text);
    }
  }

  return resultParts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Calculates reading duration in seconds for Vietnamese narration
 * Guarantees comfortable buffer so speech never gets cut off mid-sentence.
 */
export function calculateSceneDuration(narrationNormalized: string): number {
  if (!narrationNormalized) return 6;
  const wordCount = narrationNormalized.trim().split(/\s+/).filter(Boolean).length;
  // ~2.85 words/sec + 2s breath buffer for smooth transition without cutting speech
  return Math.max(6, Math.ceil(wordCount / 2.85 + 2));
}

/**
 * Client-side normalizer to guarantee all digits & measurement units are converted to spoken Vietnamese words
 */
export function normalizeVietnameseNumbers(text: string): string {
  if (!text) return '';

  const unitMap: Record<string, string> = {
    'km2': 'ki-lô-mét vuông',
    'km²': 'ki-lô-mét vuông',
    'm2': 'mét vuông',
    'm²': 'mét vuông',
    'km/s': 'ki-lô-mét trên giây',
    'km/h': 'ki-lô-mét trên giờ',
    'm/s': 'mét trên giây',
    'km': 'ki-lô-mét',
    'cm': 'xen-ti-mét',
    'mm': 'mi-li-mét',
    'kg': 'ki-lô-gam',
    'ha': 'héc-ta',
    'usd': 'đô-la mỹ',
    'vnd': 'việt nam đồng',
    'vnđ': 'việt nam đồng',
  };

  let result = cleanExtraneousInstructions(text);

  // Replace compound units first
  result = result.replace(
    /(\d+(?:[.,]\d+)*)\s*(km2|km²|m2|m²|km\/s|km\/h|m\/s|km|cm|mm|kg|ha|usd|vnd|vnđ)\b/gi,
    (_match, num, unit) => {
      const spokenNum = numberToVietnameseWords(num);
      const spokenUnit = unitMap[unit.toLowerCase()] || unit;
      return `${spokenNum} ${spokenUnit}`;
    }
  );

  // Replace standalone 'm' or 'g' or '%' when preceded by a number
  result = result.replace(/(\d+(?:[.,]\d+)*)\s*%/g, (_m, num) => {
    return `${numberToVietnameseWords(num)} phần trăm`;
  });

  result = result.replace(/(\d+(?:[.,]\d+)*)\s*m\b/g, (_m, num) => {
    return `${numberToVietnameseWords(num)} mét`;
  });

  result = result.replace(/(\d+(?:[.,]\d+)*)\s*g\b/g, (_m, num) => {
    return `${numberToVietnameseWords(num)} gam`;
  });

  // Replace remaining standalone numbers (including formatted numbers like 4.000.000 or 1.600)
  result = result.replace(/\b\d+(?:[.,]\d+)*\b/g, (numMatch) => {
    return numberToVietnameseWords(numMatch);
  });

  return result.replace(/\s+/g, ' ').trim();
}

export interface AnalyzeScriptParams {
  script: string;
  model: string;
  thinkingLevel: ThinkingLevelOption;
  targetDurationSec?: number; // 30 to 300 seconds (max 5 minutes)
  onStatusUpdate?: (status: string) => void;
}

// Check if running on static host (GitHub Pages, Vercel static, etc.)
export function isStaticEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return (
    host.includes('github.io') ||
    window.location.protocol === 'file:' ||
    (window.location.port !== '3000' && !host.includes('run.app'))
  );
}

/**
 * Proportionally adjusts scene durations to match targetDurationSec while guaranteeing
 * each scene duration >= reading duration of its narration so voiceover never gets cut off.
 */
export function scaleScenesToTargetDuration(scenes: Scene[], targetSec: number): Scene[] {
  if (!scenes || scenes.length === 0) return scenes;
  const clampedTarget = Math.max(30, Math.min(300, targetSec || 60));

  const minDurations = scenes.map((s) => calculateSceneDuration(s.narration_normalized));
  const totalMin = minDurations.reduce((acc, d) => acc + d, 0);

  if (clampedTarget > totalMin) {
    const extraTime = clampedTarget - totalMin;
    return scenes.map((s, idx) => {
      const extraShare = Math.round((minDurations[idx] / totalMin) * extraTime);
      return {
        ...s,
        duration_seconds: minDurations[idx] + extraShare,
      };
    });
  } else {
    return scenes.map((s, idx) => ({
      ...s,
      duration_seconds: minDurations[idx],
    }));
  }
}

export async function analyzeScript({
  script,
  model,
  thinkingLevel,
  targetDurationSec = 60,
  onStatusUpdate,
}: AnalyzeScriptParams): Promise<Scene[]> {
  if (!script.trim()) {
    throw new Error('Vui lòng nhập nội dung kịch bản hoặc chọn kịch bản mẫu.');
  }

  const cleanScript = cleanExtraneousInstructions(script);
  const isStatic = isStaticEnvironment();
  const keysCount = keyRotationEngine.getTotalKeysCount();

  // If on GitHub Pages and user has not configured any API keys yet:
  if (isStatic && keysCount === 0) {
    const preset = matchSamplePreset(script);
    if (preset) {
      onStatusUpdate?.('Đang nạp phân cảnh chuẩn mẫu (Chế độ Demo GitHub Pages)...');
      return scaleScenesToTargetDuration(
        preset.map((s) => ({
          ...s,
          duration_seconds: calculateSceneDuration(s.narration_normalized),
        })),
        targetDurationSec
      );
    } else {
      throw new Error(
        'Bạn đang chạy trên GitHub Pages (Web Tĩnh). Vui lòng nhấn vào nút "🔑 Keys" ở góc trên để dán ít nhất 1 Gemini API Key của bạn để phân tích kịch bản mới này.'
      );
    }
  }

  onStatusUpdate?.('Đang gửi kịch bản vào Gemini API (Xoay vòng Multi-Key)...');

  return await keyRotationEngine.executeWithRotation(async (apiKey) => {
    if (isStatic) {
      if (!apiKey) {
        const preset = matchSamplePreset(cleanScript);
        if (preset) return scaleScenesToTargetDuration(preset, targetDurationSec);
        throw new Error('Vui lòng nhập Gemini API Key vào mục Quản Lý Keys trên GitHub Pages.');
      }
      onStatusUpdate?.('Đang gọi trực tiếp Gemini REST API (GitHub Pages Mode)...');
      const resScenes = await callGeminiDirectRest(
        cleanScript,
        model,
        thinkingLevel,
        apiKey,
        targetDurationSec
      );
      return scaleScenesToTargetDuration(resScenes, targetDurationSec);
    }

    try {
      const response = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey,
          model,
          thinkingLevel,
          prompt: cleanScript,
          targetDurationSec,
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
        const cleanNarration = cleanExtraneousInstructions(s.narration_vi || '');
        const narrationNorm = normalizeVietnameseNumbers(
          s.narration_normalized || cleanNarration
        );
        const duration = calculateSceneDuration(narrationNorm);
        const fallbackKw =
          extractVisualKeywordsFromVietnamese(cleanNarration) ||
          'Vietnam nature landscape';

        return {
          scene_id: s.scene_id || idx + 1,
          title: s.title || `Phân cảnh ${idx + 1}`,
          narration_vi: cleanNarration,
          narration_normalized: narrationNorm,
          search_keywords_en: s.search_keywords_en || fallbackKw,
          visual_prompt_en: s.visual_prompt_en || s.search_keywords_en || fallbackKw,
          wikipedia_topic_en: s.wikipedia_topic_en || '',
          camera_motion: s.camera_motion || 'zoom-in',
          lut_style: s.lut_style || 'cinematic-teal-orange',
          duration_seconds: duration,
        };
      });

      return scaleScenesToTargetDuration(processedScenes, targetDurationSec);
    } catch (err: any) {
      if ((err.status === 404 || err.message?.includes('404')) && apiKey) {
        onStatusUpdate?.('Đang chuyển hướng gọi trực tiếp Gemini REST API...');
        const resScenes = await callGeminiDirectRest(
          cleanScript,
          model,
          thinkingLevel,
          apiKey,
          targetDurationSec
        );
        return scaleScenesToTargetDuration(resScenes, targetDurationSec);
      }
      throw err;
    }
  });
}

/**
 * Direct REST API for GitHub Pages hosting with responseSchema structured JSON
 */
async function callGeminiDirectRest(
  prompt: string,
  model: string,
  thinkingLevel: ThinkingLevelOption,
  apiKey: string,
  targetDurationSec: number = 60
): Promise<Scene[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const durationSec = Math.max(30, Math.min(300, targetDurationSec));
  const targetMin = Math.floor(durationSec / 60);
  const targetSecRem = durationSec % 60;
  const durationDesc = `${targetMin > 0 ? `${targetMin} phút ` : ''}${
    targetSecRem > 0 ? `${targetSecRem} giây` : ''
  }`;

  const systemInstruction = `Bạn là Đạo diễn Phim Tài liệu và Biên kịch Hình ảnh Hàng đầu.
Phân tích kịch bản hoặc câu chuyện tiếng Việt thành mảng các phân cảnh điện ảnh chuẩn JSON đồng cấu 100% giữa lời thoại và hình ảnh.

CÁC QUY TẮC BẮT BUỘC:
1. ĐỘ DÀI MỤC TIÊU & LỜI THOẠI MƯỢT MÀ:
   - Tổng độ dài video yêu cầu là: ${durationSec} GIÂY (~${durationDesc}). Tối đa là 5 phút (300 giây).
   - Mỗi phân cảnh nên có từ 1 đến 2 câu lời bình rõ ràng, súc tích (khoảng 20-38 từ/cảnh) để người đọc lồng tiếng đọc lưu loát, tự nhiên, không bị hụt hơi.
2. LƯỢC BỎ TỪ KHÔNG LIÊN QUAN ĐẾN LỜI THOẠI:
   - Trong 'narration_vi', TUYỆT ĐỐI LOẠI BỎ các chú thích kỹ thuật, ghi chú đạo diễn "[Cảnh 1]", "(nhạc dạo)", "MC:", "Người dẫn chuyện:". CHỈ GIỮ LẠI LỜI BÌNH NGUYÊN BẢN trong trẻo để đọc và làm phụ đề.
3. ĐỒNG CẤU HÌNH ẢNH VÀ CÂU CHUYỆN 100% (visual_prompt_en, search_keywords_en, wikipedia_topic_en):
   - 'visual_prompt_en': 1 câu mô tả khung hình 16:9 bằng tiếng Anh chi tiết về nhân vật, hành động, bối cảnh xảy ra trong câu thoại của cảnh này.
   - 'search_keywords_en': 2-3 danh từ tiếng Anh cụ thể miêu tả đúng vật thể/động vật/địa danh xuất hiện trong cảnh đó để tìm kiếm ảnh. Mỗi cảnh phải có từ khóa riêng biệt.
   - 'wikipedia_topic_en': Chủ đề/thực thể chuẩn tiếng Anh trên Wikipedia khớp với nội dung cảnh này.
4. CHUẨN HÓA SỐ VÀ ĐƠN VỊ (narration_normalized):
   - Tự động chuyển đổi 100% mọi con số, đơn vị, ngày tháng sang chữ tiếng Việt đầy đủ để đọc trôi chảy.`;

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
            visual_prompt_en: { type: 'STRING' },
            search_keywords_en: { type: 'STRING' },
            wikipedia_topic_en: { type: 'STRING' },
            camera_motion: {
              type: 'STRING',
              enum: ['zoom-in', 'zoom-out', 'pan-left', 'pan-right'],
            },
            lut_style: {
              type: 'STRING',
              enum: [
                'cinematic-teal-orange',
                'warm-golden',
                'natural-documentary',
                'high-contrast',
              ],
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
    const cleanNarration = cleanExtraneousInstructions(s.narration_vi || '');
    const norm = normalizeVietnameseNumbers(s.narration_normalized || cleanNarration);
    const fallbackKw =
      extractVisualKeywordsFromVietnamese(cleanNarration) || 'Vietnam documentary nature';
    return {
      scene_id: s.scene_id || idx + 1,
      title: s.title || `Phân cảnh ${idx + 1}`,
      narration_vi: cleanNarration,
      narration_normalized: norm,
      search_keywords_en: s.search_keywords_en || fallbackKw,
      visual_prompt_en: s.visual_prompt_en || s.search_keywords_en || fallbackKw,
      wikipedia_topic_en: s.wikipedia_topic_en || '',
      camera_motion: s.camera_motion || 'zoom-in',
      lut_style: s.lut_style || 'cinematic-teal-orange',
      duration_seconds: calculateSceneDuration(norm),
    };
  });
}
