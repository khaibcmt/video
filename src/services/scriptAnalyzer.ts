import {
  Scene,
  VisualBeat,
  ThinkingLevelOption,
  SubjectOption,
  CameraMotion,
  LutStyle,
} from '../types';
import { keyRotationEngine } from './keyRotation';
import { matchSamplePreset, getTargetSceneCountForDuration } from './sampleData';
import { translateNarrationToVideoQueries } from './videoQueryTranslator';

/**
 * Strips out extraneous meta-instructions, stage directions, scene headers, and non-spoken text
 */
export function cleanExtraneousInstructions(text: string): string {
  if (!text) return '';
  return text
    .replace(/\[[^\]]*\]/g, '')
    .replace(
      /\([^\)]*(nhạc|cảnh|tiếng|hiệu ứng|camera|video|mc|đạo diễn|zoom|pan|intro|outro)[^\)]*\)/gi,
      ''
    )
    .replace(/(phân cảnh|cảnh|scene)\s*\d+\s*[:\-–.]/gi, '')
    .replace(
      /(lời bình|lời thoại|thuyết minh|voiceover|narration|mc|người dẫn chuyện|hình ảnh|mô tả|kịch bản)\s*[:\-–.]/gi,
      ''
    )
    .replace(/[*#_~`]/g, '')
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
 * Converts any integer or decimal into natural spoken Vietnamese words
 */
export function numberToVietnameseWords(numStr: string): string {
  const cleanDigits = numStr.replace(/[.,](?=\d{3}\b)/g, '');

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
 */
export function calculateSceneDuration(narrationNormalized: string): number {
  if (!narrationNormalized) return 6;
  const wordCount = narrationNormalized.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(6, Math.ceil(wordCount / 2.85 + 2));
}

/**
 * Client-side normalizer to guarantee all digits, symbols, chemical/physical/biological formulas & measurement units
 * are converted to spoken Vietnamese words.
 * Examples:
 * - "3.260 km" -> "ba nghìn hai trăm sáu mươi ki-lô-mét"
 * - "5 mg/l" -> "năm mi-li-gam trên lít"
 * - "H2O" -> "hát hai ô"
 * - "CO2" -> "xê ô hai"
 */
export function normalizeVietnameseNumbers(text: string): string {
  if (!text) return '';

  const formulaMap: Array<[RegExp, string]> = [
    [/\bH2SO4\b|\bH₂SO₄\b/gi, 'hát hai ét ô bốn'],
    [/\bCaCO3\b|\bCaCO₃\b/gi, 'can-xi các-bo-nát'],
    [/\bNaCl\b/gi, 'na-tri clo-rua'],
    [/\bC6H12O6\b|\bC₆H₁₂O₆\b/gi, 'gluco-zơ'],
    [/\bH2O\b|\bH₂O\b/gi, 'hát hai ô'],
    [/\bCO2\b|\bCO₂\b/gi, 'xê ô hai'],
    [/\bO2\b|\bO₂\b/gi, 'ô hai'],
    [/\bN2\b|\bN₂\b/gi, 'ni-tơ'],
    [/\bNH3\b|\bNH₃\b/gi, 'a-mô-ni-ắc'],
    [/\bCH4\b|\bCH₄\b/gi, 'mê-tan'],
    [/\bNADPH\b/gi, 'en-nờ a đê pê hát'],
    [/\bATP\b/gi, 'a tê pê'],
    [/\bADN\b|\bDNA\b/gi, 'a đê en'],
    [/\bARN\b|\bRNA\b/gi, 'a rờ en'],
    [/\bDO\s*(?:>=|≥)\s*/gi, 'hàm lượng oxy hòa tan lớn hơn hoặc bằng '],
    [/\bDO\b/g, 'đê ô'],
    [/>=|≥/g, ' lớn hơn hoặc bằng '],
    [/<=|≤/g, ' nhỏ hơn hoặc bằng '],
  ];

  const unitMap: Record<string, string> = {
    'km2': 'ki-lô-mét vuông',
    'km²': 'ki-lô-mét vuông',
    'm2': 'mét vuông',
    'm²': 'mét vuông',
    'm3': 'mét khối',
    'm³': 'mét khối',
    'km/s': 'ki-lô-mét trên giây',
    'km/h': 'ki-lô-mét trên giờ',
    'm/s': 'mét trên giây',
    'mg/l': 'mi-li-gam trên lít',
    'g/l': 'gam trên lít',
    'ml': 'mi-li-lít',
    'kv': 'ki-lô-vôn',
    'mw': 'mê-ga-oát',
    'kw': 'ki-lô-oát',
    'hz': 'héc',
    'km': 'ki-lô-mét',
    'cm': 'xen-ti-mét',
    'mm': 'mi-li-mét',
    'kg': 'ki-lô-gam',
    'ha': 'héc-ta',
    'usd': 'đô-la mỹ',
    'vnd': 'việt nam đồng',
    'vnđ': 'việt nam đồng',
    '°c': 'độ xê',
    'oc': 'độ xê',
  };

  let result = cleanExtraneousInstructions(text);

  for (const [pattern, replacement] of formulaMap) {
    result = result.replace(pattern, replacement);
  }

  // Replace compound units first
  result = result.replace(
    /(\d+(?:[.,]\d+)*)\s*(km2|km²|m2|m²|m3|m³|km\/s|km\/h|m\/s|mg\/l|g\/l|ml|kv|mw|kw|hz|km|cm|mm|kg|ha|usd|vnd|vnđ|°c|oc)\b/gi,
    (_match, num, unit) => {
      const spokenNum = numberToVietnameseWords(num);
      const spokenUnit = unitMap[unit.toLowerCase()] || unit;
      return `${spokenNum} ${spokenUnit}`;
    }
  );

  result = result.replace(/(\d+(?:[.,]\d+)*)\s*%/g, (_m, num) => {
    return `${numberToVietnameseWords(num)} phần trăm`;
  });

  result = result.replace(/(\d+(?:[.,]\d+)*)\s*m\b/g, (_m, num) => {
    return `${numberToVietnameseWords(num)} mét`;
  });

  result = result.replace(/(\d+(?:[.,]\d+)*)\s*g\b/g, (_m, num) => {
    return `${numberToVietnameseWords(num)} gam`;
  });

  result = result.replace(/\b\d+(?:[.,]\d+)*\b/g, (numMatch) => {
    return numberToVietnameseWords(numMatch);
  });

  return result.replace(/\s+/g, ' ').trim();
}

export interface AnalyzeScriptParams {
  topicTitle?: string;
  subject?: SubjectOption;
  directorInstructions?: string;
  script: string;
  model: string;
  thinkingLevel: ThinkingLevelOption;
  targetDurationSec?: number;
  onStatusUpdate?: (status: string) => void;
}

/**
 * Extracts a concise pedagogical formula/knowledge badge from narration or director instructions
 */
export function extractPedagogicalBadge(
  narrationVi: string,
  directorInstructions?: string,
  fallbackTitle?: string
): string {
  const combined = `${directorInstructions || ''} ${narrationVi || ''}`;
  const formulaMatch = combined.match(
    /(?:công thức|hiện|nhãn)?\s*(DO\s*(?:>=|≥|>)\s*\d+(?:[.,]\d+)?\s*mg\/l|pH\s*[:=]?\s*\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?|\d+(?:[.,]\d+)+\s*(?:km2|km|ha|tấn\/ha|mg\/l|°C|%)|H2O|CO2|O2)/i
  );
  if (formulaMatch) {
    const raw = formulaMatch[1].trim();
    if (raw.toLowerCase().includes('mg/l') && !raw.toLowerCase().includes('do')) {
      return `Hàm lượng Oxy (DO) >= ${raw}`;
    }
    return raw;
  }

  if (narrationVi.includes('3.260 km')) return 'Bờ biển Việt Nam: 3.260 km';
  if (narrationVi.includes('5 mg/l')) return 'Hàm lượng Oxy (DO) >= 5 mg/l';
  if (narrationVi.includes('quang hợp') || narrationVi.includes('lục lạp'))
    return '6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂';
  if (narrationVi.includes('300.000 km/s')) return 'Vận tốc ánh sáng: c = 300.000 km/s';

  return fallbackTitle || 'Kiến thức trọng tâm';
}

/**
 * Splits a scene's narration into 2 to 3 synchronized VisualBeat objects (`visual_beats`)
 * so the Canvas transitions continuously across beats to match each clause in the voiceover.
 */
export function buildVisualBeatsForScene(
  narrationVi: string,
  primaryQueryEn: string,
  title: string,
  directorInstructions?: string,
  existingBeats?: any[]
): VisualBeat[] {
  const defaultBadge = extractPedagogicalBadge(narrationVi, directorInstructions, title);

  if (Array.isArray(existingBeats) && existingBeats.length >= 2) {
    return existingBeats.slice(0, 3).map((b: any, idx: number, arr: any[]) => {
      const queries =
        Array.isArray(b.search_queries_ranked) && b.search_queries_ranked.length > 0
          ? b.search_queries_ranked
          : [primaryQueryEn, `${primaryQueryEn} documentary`, 'nature science documentary'];
      return {
        beat_id: b.beat_id || idx + 1,
        trigger_phrase: b.trigger_phrase || narrationVi.slice(0, 48),
        progress_ratio:
          typeof b.progress_ratio === 'number'
            ? Math.max(0, Math.min(0.85, b.progress_ratio))
            : Number((idx / arr.length).toFixed(2)),
        search_queries_ranked: queries,
        ai_visual_prompt:
          b.ai_visual_prompt ||
          `Cinematic 16:9 HD documentary footage of ${queries[0]}, ${directorInstructions || title}`,
        pedagogical_badge: b.pedagogical_badge || defaultBadge,
        camera_motion: idx % 2 === 0 ? 'zoom-in' : 'pan-right',
      };
    });
  }

  // Automatically segment narrationVi into 2 or 3 natural clauses
  const clauses = narrationVi
    .split(/(?<=[.,;…])\s+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 8);

  const beatPhrases =
    clauses.length >= 3
      ? [clauses[0], clauses[1], clauses.slice(2).join(' ')]
      : clauses.length === 2
      ? clauses
      : [
          narrationVi.slice(0, Math.ceil(narrationVi.length / 2)).trim(),
          narrationVi.slice(Math.ceil(narrationVi.length / 2)).trim() || narrationVi,
        ];

  const SecondaryQueriesMap: Record<string, string[]> = {
    'swimming catfish underwater': [
      'swimming catfish underwater',
      'fish swimming underwater aquarium',
      'aquaculture fish pond river',
    ],
    'shrimp pond aerator splashing': [
      'shrimp pond paddlewheel aerator splashing',
      'shrimp pond aerator splashing',
      'aquaculture pond water aeration',
    ],
    'modern high school classroom discussion': [
      'modern high school classroom discussion',
      'students science laboratory classroom',
      'teacher explaining lesson classroom',
    ],
  };

  const baseRanked = SecondaryQueriesMap[primaryQueryEn] || [
    primaryQueryEn,
    `${primaryQueryEn} nature documentary`,
    'science education documentary footage',
  ];

  return beatPhrases.map((phrase, idx) => {
    const phraseTranslation = translateNarrationToVideoQueries(phrase, baseRanked[idx % baseRanked.length]);
    const rankedQueries = [
      phraseTranslation.primaryQueryEn,
      baseRanked[(idx + 1) % baseRanked.length],
      baseRanked[0],
    ];
    return {
      beat_id: idx + 1,
      trigger_phrase: phrase,
      progress_ratio: Number((idx / beatPhrases.length).toFixed(2)),
      search_queries_ranked: rankedQueries,
      ai_visual_prompt: `Cinematic 16:9 HD educational documentary visual for "${phrase}" (${rankedQueries[0]}), ${
        directorInstructions || title
      }`,
      pedagogical_badge: extractPedagogicalBadge(phrase, directorInstructions, defaultBadge),
      camera_motion: idx % 2 === 0 ? 'zoom-in' : 'pan-right',
    };
  });
}

export function isStaticEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host.includes('github.io') || window.location.protocol === 'file:';
}

export function scaleScenesToTargetDuration(scenes: Scene[], targetSec: number): Scene[] {
  if (!scenes || scenes.length === 0) return scenes;
  const clampedTarget = Math.max(30, Math.min(300, targetSec || 60));

  const minDurations = scenes.map((s) => calculateSceneDuration(s.narration_normalized));
  const totalMin = minDurations.reduce((acc, d) => acc + d, 0) || scenes.length * 8;

  const scaled = scenes.map((s, idx) => {
    const proportional = Math.max(
      4,
      Math.round((minDurations[idx] / totalMin) * clampedTarget)
    );
    return {
      ...s,
      duration_seconds: proportional,
    };
  });

  const currentSum = scaled.reduce((acc, s) => acc + s.duration_seconds, 0);
  const diff = clampedTarget - currentSum;
  if (diff !== 0 && scaled.length > 0) {
    const lastIdx = scaled.length - 1;
    scaled[lastIdx] = {
      ...scaled[lastIdx],
      duration_seconds: Math.max(4, scaled[lastIdx].duration_seconds + diff),
    };
  }

  return scaled;
}

/**
 * Generates a structured 4-part Pedagogical Script autonomously for any topic, subject, and target scene count
 * (Used as an instant local fallback on GitHub Pages or when offline/rate-limited so the app NEVER fails!)
 */
export function generateAutonomousPedagogicalScenes(
  topicTitle: string,
  subject: SubjectOption = 'Sinh học',
  targetDurationSec: number = 120,
  rawCustomScript?: string,
  directorInstructions?: string
): Scene[] {
  const targetCount = getTargetSceneCountForDuration(targetDurationSec);
  const cleanTopic = (topicTitle || 'Bài 9: Các nhóm thủy sản và phương thức nuôi phổ biến')
    .replace(/_/g, ' ')
    .trim();

  // Check if preset matches first
  const preset = matchSamplePreset(`${cleanTopic} ${rawCustomScript || ''}`);
  if (preset && targetCount <= 4 && !directorInstructions) {
    return scaleScenesToTargetDuration(
      preset.slice(0, targetCount).map((s, idx) => {
        const badge = extractPedagogicalBadge(s.narration_vi, directorInstructions, s.title);
        const beats = buildVisualBeatsForScene(
          s.narration_vi,
          s.exact_video_search_en || s.search_keywords_en,
          s.title,
          directorInstructions
        );
        return {
          ...s,
          scene_id: idx + 1,
          pedagogical_badge: badge,
          visual_beats: beats,
        };
      }),
      targetDurationSec
    );
  }

  const motions: CameraMotion[] = ['zoom-in', 'pan-right', 'zoom-out', 'pan-left'];
  const luts: LutStyle[] = [
    'cinematic-teal-orange',
    'natural-documentary',
    'warm-golden',
    'high-contrast',
  ];

  // Subject-specific pedagogical templates (4-part structure expandable to 3, 5, or 7-8 scenes)
  const templatesBySubject: Record<
    SubjectOption,
    Array<{
      section: string;
      titleSuffix: string;
      narrationBuilder: (topic: string) => string;
      exactVideoQuery: string;
      wikiTopic: string;
      badge: string;
    }>
  > = {
    'Sinh học': [
      {
        section: 'Phần 1: Mở đầu & Đặt vấn đề',
        titleSuffix: 'Khởi Động & Đặt Vấn Đề Sinh Học',
        narrationBuilder: (t) =>
          `Chào mừng các em đến với bài học môn Sinh học: ${t}... Thế giới sinh vật tại Việt Nam vô cùng đa dạng, trải dài trên hơn 3.260 km bờ biển và hệ sinh thái rừng nhiệt đới phong phú.`,
        exactVideoQuery: 'swimming catfish underwater',
        wikiTopic: 'Biodiversity',
        badge: 'Đa dạng sinh học • 3.260 km bờ biển',
      },
      {
        section: 'Phần 2: Kiến thức trọng tâm 1',
        titleSuffix: 'Phân Loại & Đặc Điểm Sinh Học',
        narrationBuilder: (t) =>
          `Trong nội dung trọng tâm đầu tiên của ${t}, chúng ta phân loại các nhóm sinh vật dựa trên cấu trúc tế bào, môi trường sống dưới nước ngọt, nước lợ... và khả năng thích nghi tự nhiên.`,
        exactVideoQuery: 'fish swimming underwater aquarium',
        wikiTopic: 'Aquatic ecosystem',
        badge: 'Phân loại sinh thái: Nước ngọt • Nước lợ • Nước mặn',
      },
      {
        section: 'Phần 2: Kiến thức trọng tâm 1 (Mở rộng)',
        titleSuffix: 'Cơ Chế Sinh Trưởng & Trao Đổi Chất',
        narrationBuilder: () =>
          `Quá trình trao đổi chất, hấp thụ H2O và giải phóng O2 diễn ra liên tục ở nhiệt độ lý tưởng từ 25 đến 30 °C... giúp sinh vật tổng hợp chất hữu cơ và phát triển khỏe mạnh.`,
        exactVideoQuery: 'sea turtle swimming coral reef',
        wikiTopic: 'Metabolism',
        badge: 'Nhiệt độ sinh trưởng tối ưu: 25 - 30 °C',
      },
      {
        section: 'Phần 3: Kiến thức trọng tâm 2',
        titleSuffix: 'Phương Thức & Quy Trình Kỹ Thuật',
        narrationBuilder: () =>
          `Ở phần kiến thức trọng tâm thứ hai, việc ứng dụng hệ thống quạt nước tạo oxy hòa tan DO >= 5 mg/l giúp mật độ nuôi trồng tăng gấp 3 lần so với phương thức quảng canh truyền thống.`,
        exactVideoQuery: 'shrimp pond aerator splashing',
        wikiTopic: 'Aquaculture',
        badge: 'Hàm lượng Oxy (DO) >= 5 mg/l',
      },
      {
        section: 'Phần 3: Kiến thức trọng tâm 2 (Thực hành)',
        titleSuffix: 'Quan Sát Thực Nghiệm Trong Phòng Thí Nghiệm',
        narrationBuilder: () =>
          `Khi quan sát mẫu vật dưới kính hiển vi có độ phóng đại 400 lần trong phòng thí nghiệm... học sinh dễ dàng nhận biết cấu trúc mô, tế bào và phân tử ADN chuyên biệt.`,
        exactVideoQuery: 'scientist laboratory microscope research',
        wikiTopic: 'Microscope',
        badge: 'Kính hiển vi quang học: Độ phóng đại 400x',
      },
      {
        section: 'Phần 4: Ứng dụng thực tiễn',
        titleSuffix: 'Ứng Dụng Công Nghệ Sinh Học Bền Vững',
        narrationBuilder: () =>
          `Nhờ áp dụng quy trình sinh học sạch trên diện tích hơn 1.000.000 ha, sản lượng thu hoạch đạt hơn 25 tấn trên 1 ha... bảo vệ môi trường sinh thái lâu dài.`,
        exactVideoQuery: 'fishing village boats emerald water',
        wikiTopic: 'Biotechnology',
        badge: 'Năng suất sinh học: >= 25 tấn/ha',
      },
      {
        section: 'Phần 4: Tổng kết & Câu hỏi ôn tập',
        titleSuffix: 'Tổng Kết Bài Học & Thảo Luận',
        narrationBuilder: (t) =>
          `Qua bài học ${t}, các em đã nắm vững 4 nội dung cốt lõi từ phân loại đến ứng dụng thực tiễn... Hãy cùng thảo luận nhóm để hoàn thành bài tập vận dụng hôm nay.`,
        exactVideoQuery: 'modern high school classroom discussion',
        wikiTopic: 'Education',
        badge: 'Tổng kết 4 phần trọng tâm bài giảng',
      },
    ],
    'Công nghệ': [
      {
        section: 'Phần 1: Mở đầu & Đặt vấn đề',
        titleSuffix: 'Khởi Động - Vai Trò Công Nghệ Hiện Đại',
        narrationBuilder: (t) =>
          `Chào mừng các em đến với môn Công nghệ qua chủ đề: ${t}... Với hơn 3.260 km đường bờ biển và mạng lưới sông ngòi Đồng bằng sông Cửu Long dày đặc, Việt Nam có tiềm năng công nghệ sản xuất vô cùng lớn.`,
        exactVideoQuery: 'swimming catfish underwater',
        wikiTopic: 'Aquaculture in Vietnam',
        badge: 'Tiềm năng Thủy sản • 3.260 km bờ biển',
      },
      {
        section: 'Phần 2: Kiến thức trọng tâm 1',
        titleSuffix: 'Phân Nhóm Đối Tượng & Tiêu Chuẩn Kỹ Thuật',
        narrationBuilder: () =>
          `Các nhóm thủy sản chủ lực bao gồm nhóm cá nước ngọt như cá tra, cá rô phi... và nhóm giáp xác có giá trị xuất khẩu cao như tôm sú, tôm thẻ chân trắng.`,
        exactVideoQuery: 'fish swimming underwater aquarium',
        wikiTopic: 'Catfish',
        badge: 'Nhóm Thủy sản: Cá nước ngọt & Giáp xác',
      },
      {
        section: 'Phần 2: Kiến thức trọng tâm 1 (Chi tiết)',
        titleSuffix: 'Hệ Thống Cơ Sở Hạ Tầng & Môi Trường',
        narrationBuilder: () =>
          `Môi trường nước H2O cần được kiểm soát chặt chẽ với độ pH từ 7,5 đến 8,5 và nhiệt độ ổn định khoảng 28 °C... để tối ưu hóa tốc độ tăng trưởng.`,
        exactVideoQuery: 'sea turtle swimming coral reef',
        wikiTopic: 'Water quality',
        badge: 'Thông số chuẩn: pH 7,5 - 8,5 • 28 °C',
      },
      {
        section: 'Phần 3: Kiến thức trọng tâm 2',
        titleSuffix: 'Phương Thức Nuôi Thâm Canh & Tự Động Hóa',
        narrationBuilder: () =>
          `Trong phương thức nuôi thâm canh công nghệ cao, hệ thống quạt nước ao tôm và máy cho ăn tự động hoạt động liên tục... giúp duy trì hàm lượng oxy DO >= 5 mg/l, đạt năng suất 30 tấn trên 1 ha.`,
        exactVideoQuery: 'shrimp pond aerator splashing',
        wikiTopic: 'Shrimp farming',
        badge: 'Hàm lượng Oxy (DO) >= 5 mg/l • 30 tấn/ha',
      },
      {
        section: 'Phần 3: Kiến thức trọng tâm 2 (Chuyển đổi số)',
        titleSuffix: 'Ứng Dụng Cảm Biến IoT & Tự Động Hóa',
        narrationBuilder: () =>
          `Hệ thống cảm biến thông minh giám sát 24 giờ mỗi ngày, tự động cảnh báo các thông số môi trường... và tiết kiệm 35% chi phí vận hành.`,
        exactVideoQuery: 'robotics artificial intelligence technology',
        wikiTopic: 'Smart farming',
        badge: 'Công nghệ IoT 24/7 • Tiết kiệm 35% chi phí',
      },
      {
        section: 'Phần 4: Ứng dụng thực tiễn',
        titleSuffix: 'Mô Hình Kinh Tế Tuần Hoàn & Xuất Khẩu',
        narrationBuilder: () =>
          `Việc kết hợp nuôi lồng bè trên biển theo tiêu chuẩn VietGAP giúp kim ngạch xuất khẩu đạt hơn 9.000.000.000 USD mỗi năm tại hơn 150 quốc gia.`,
        exactVideoQuery: 'fishing village boats emerald water',
        wikiTopic: 'Fish farming',
        badge: 'Chuẩn VietGAP • Xuất khẩu > 9 tỷ USD',
      },
      {
        section: 'Phần 4: Tổng kết & Đánh giá',
        titleSuffix: 'Tổng Kết Kiến Thức Công Nghệ',
        narrationBuilder: (t) =>
          `Tổng kết lại bài học ${t}, các em hãy ghi nhớ đặc điểm của từng nhóm... và ưu nhược điểm của 3 phương thức phổ biến là quảng canh, bán thâm canh và thâm canh.`,
        exactVideoQuery: 'modern high school classroom discussion',
        wikiTopic: 'Technology education',
        badge: 'Tổng kết: Quảng canh • Bán thâm canh • Thâm canh',
      },
    ],
    'Vật lý': [
      {
        section: 'Phần 1: Mở đầu & Đặt vấn đề',
        titleSuffix: 'Khởi Động - Hiện Tượng Vật Lý Tự Nhiên',
        narrationBuilder: (t) =>
          `Chào mừng các em đến với bài học môn Vật lý: ${t}... Trong vũ trụ bao la, các định luật vật lý chi phối mọi chuyển động từ hạt hạ nguyên tử đến những thiên hà cách xa hàng triệu năm ánh sáng.`,
        exactVideoQuery: 'black hole accretion disk space',
        wikiTopic: 'Physics',
        badge: 'Định luật Vật lý & Chuyển động Tự nhiên',
      },
      {
        section: 'Phần 2: Kiến thức trọng tâm 1',
        titleSuffix: 'Bản Chất Vật Lý & Các Đại Lượng Cơ Bản',
        narrationBuilder: () =>
          `Ánh sáng lan truyền trong chân không với vận tốc không đổi là 300.000 km/s... tương đương 300.000.000 m/s theo hệ đo lường quốc tế SI.`,
        exactVideoQuery: 'Milky Way galaxy night sky stars',
        wikiTopic: 'Speed of light',
        badge: 'Vận tốc ánh sáng: c = 300.000 km/s',
      },
      {
        section: 'Phần 2: Kiến thức trọng tâm 1 (Định luật)',
        titleSuffix: 'Mối Quan Hệ Giữa Năng Lượng & Chuyển Động',
        narrationBuilder: () =>
          `Theo định luật bảo toàn và chuyển hóa năng lượng, động năng của dòng nước thác đổ từ độ cao 120 mét... có thể chuyển hóa thành điện năng công suất 500 MW.`,
        exactVideoQuery: 'waterfall forest stream flowing nature',
        wikiTopic: 'Conservation of energy',
        badge: 'Định luật Bảo toàn Năng lượng: W = Wđ + Wt',
      },
      {
        section: 'Phần 3: Kiến thức trọng tâm 2',
        titleSuffix: 'Thực Nghiệm & Đo Lường Chính Xác',
        narrationBuilder: () =>
          `Trong phòng thí nghiệm vật lý hiện đại, các thiết bị đo quang phổ và dòng điện xoay chiều tần số 50 Hz giúp xác định biên độ dao động với sai số dưới 1%.`,
        exactVideoQuery: 'scientist laboratory microscope research',
        wikiTopic: 'Experimental physics',
        badge: 'Tần số chuẩn: f = 50 Hz • Sai số < 1%',
      },
      {
        section: 'Phần 3: Kiến thức trọng tâm 2 (Mô phỏng)',
        titleSuffix: 'Mô Phỏng Trường Lực & Không Thời Gian',
        narrationBuilder: () =>
          `Khi vật thể có khối lượng gấp 4.000.000 lần Mặt Trời tập trung trong vùng không gian nhỏ... trường hấp dẫn cực mạnh sẽ làm cong đường truyền của tia sáng.`,
        exactVideoQuery: 'black hole gravitational lensing cosmos',
        wikiTopic: 'General relativity',
        badge: 'Thuyết Tương đối Rộng: E = mc²',
      },
      {
        section: 'Phần 4: Ứng dụng thực tiễn',
        titleSuffix: 'Ứng Dụng Vật Lý Trong Kỹ Thuật Cao',
        narrationBuilder: () =>
          `Các nguyên lý vật lý này được ứng dụng trực tiếp trong vệ tinh định vị toàn cầu GPS, lưới điện cao áp 500 kV... và công nghệ vi mạch bán dẫn.`,
        exactVideoQuery: 'robotics artificial intelligence technology',
        wikiTopic: 'Applied physics',
        badge: 'Ứng dụng: Vệ tinh GPS & Lưới điện 500 kV',
      },
      {
        section: 'Phần 4: Tổng kết & Hệ thống công thức',
        titleSuffix: 'Tổng Kết Trọng Tâm Bài Học Vật Lý',
        narrationBuilder: (t) =>
          `Như vậy, qua bài học ${t}, các em đã nắm vững bản chất hiện tượng, công thức tính toán... và các ứng dụng kỹ thuật quan trọng trong đời sống.`,
        exactVideoQuery: 'modern high school classroom discussion',
        wikiTopic: 'Physics education',
        badge: 'Tổng kết Hệ thống Công thức Vật lý',
      },
    ],
    'Hóa học': [
      {
        section: 'Phần 1: Mở đầu & Đặt vấn đề',
        titleSuffix: 'Khởi Động - Thế Giới Các Chất Hóa Học',
        narrationBuilder: (t) =>
          `Chào mừng các em đến với bài học môn Hóa học: ${t}... Mọi vật chất xung quanh chúng ta từ nguồn nước H2O trên 3.260 km bờ biển đến khí quyển đều cấu tạo từ các nguyên tố hóa học.`,
        exactVideoQuery: 'scientist laboratory microscope research',
        wikiTopic: 'Chemistry',
        badge: 'Thành phần Hóa học Tự nhiên: H₂O & O₂',
      },
      {
        section: 'Phần 2: Kiến thức trọng tâm 1',
        titleSuffix: 'Cấu Tạo Phân Tử & Tính Chất Vật Lý',
        narrationBuilder: () =>
          `Ở điều kiện tiêu chuẩn 25 °C và áp suất 1 át-mốt-phe, tốc độ hòa tan của khí O2 trong nước đạt DO >= 5 mg/l... đóng vai trò quyết định cho sự sống dưới nước.`,
        exactVideoQuery: 'shrimp pond aerator splashing',
        wikiTopic: 'Chemical property',
        badge: 'Độ tan Oxy tiêu chuẩn: DO >= 5 mg/l (25 °C)',
      },
      {
        section: 'Phần 2: Kiến thức trọng tâm 1 (Phản ứng)',
        titleSuffix: 'Cơ Chế Phản Ứng & Cân Bằng Hóa Học',
        narrationBuilder: () =>
          `Trong quá trình phản ứng hóa học giữa NaCl và H2O, liên kết giữa các nguyên tử thay đổi... nhưng tổng khối lượng các chất luôn bảo toàn 100%.`,
        exactVideoQuery: 'cave stalactites cavern underground',
        wikiTopic: 'Chemical reaction',
        badge: 'Định luật Bảo toàn Khối lượng: 100%',
      },
      {
        section: 'Phần 3: Kiến thức trọng tâm 2',
        titleSuffix: 'Thí Nghiệm Thực Hành & Quan Sát Hiện Tượng',
        narrationBuilder: () =>
          `Khi tiến hành thí nghiệm với 100 ml dung dịch H2SO4 loãng trong ống nghiệm... sự thay đổi màu sắc hoặc sủi bọt khí CO2 giúp nhận biết chính xác bản chất của phản ứng.`,
        exactVideoQuery: 'scientist laboratory microscope research',
        wikiTopic: 'Laboratory',
        badge: 'Thí nghiệm Hóa học: Nhận biết khí CO₂',
      },
      {
        section: 'Phần 3: Kiến thức trọng tâm 2 (Ứng dụng tự nhiên)',
        titleSuffix: 'Sự Hình Thành Thạch Nhũ Trong Tự Nhiên',
        narrationBuilder: () =>
          `Phản ứng kết tủa CaCO3 diễn ra bền bỉ suốt 500 triệu năm đã kiến tạo nên hệ thống thạch nhũ kỳ vĩ dài hơn 120 mét tại các hang động đá vôi.`,
        exactVideoQuery: 'Ha Long Bay Vietnam aerial boat',
        wikiTopic: 'Calcium carbonate',
        badge: 'Kết tủa Thạch nhũ: CaCO₃ + H₂O + CO₂',
      },
      {
        section: 'Phần 4: Ứng dụng thực tiễn',
        titleSuffix: 'Ứng Dụng Hóa Học Xanh Trong Sản Xuất',
        narrationBuilder: () =>
          `Công nghệ hóa học xanh giúp xử lý nguồn nước nuôi trồng thủy sản, cân bằng pH... và chế biến nông sản xuất khẩu đạt chuẩn quốc tế.`,
        exactVideoQuery: 'coffee beans roasting pouring cup',
        wikiTopic: 'Green chemistry',
        badge: 'Hóa học Xanh & Xử lý Môi trường',
      },
      {
        section: 'Phần 4: Tổng kết & Ghi nhớ',
        titleSuffix: 'Tổng Kết Kiến Thức Hóa Học Trọng Tâm',
        narrationBuilder: (t) =>
          `Khép lại bài học ${t}, các em hãy ôn lại tính chất hóa học đặc trưng, phương trình phản ứng... và các biện pháp an toàn trong phòng thí nghiệm.`,
        exactVideoQuery: 'modern high school classroom discussion',
        wikiTopic: 'Chemistry education',
        badge: 'Tổng kết Phương trình & An toàn Hóa học',
      },
    ],
  };

  const baseTemplates = templatesBySubject[subject] || templatesBySubject['Sinh học'];
  const selectedTemplates =
    targetCount === 3
      ? [baseTemplates[0], baseTemplates[1], baseTemplates[3]]
      : targetCount === 5
      ? [
          baseTemplates[0],
          baseTemplates[1],
          baseTemplates[3],
          baseTemplates[5],
          baseTemplates[6],
        ]
      : baseTemplates;

  // Parse teacher's directorInstructions clauses if provided
  const instructionClauses = (directorInstructions || '')
    .split(/[;\n]+/)
    .map((c) => c.trim())
    .filter(Boolean);

  const generated: Scene[] = selectedTemplates.map((tpl, idx) => {
    const matchedInstruction = instructionClauses[idx] || '';
    const baseNarration = tpl.narrationBuilder(cleanTopic);
    const rawNarration = matchedInstruction
      ? `${baseNarration} Đặc biệt, ${matchedInstruction}.`
      : baseNarration;
    const cleanNarration = cleanExtraneousInstructions(rawNarration);
    const normNarration = normalizeVietnameseNumbers(cleanNarration);
    const translation = translateNarrationToVideoQueries(
      `${cleanNarration} ${matchedInstruction}`,
      tpl.exactVideoQuery,
      tpl.wikiTopic
    );
    const effectiveQueryEn =
      translation.matchedEntityCategory !== 'default_nature'
        ? translation.primaryQueryEn
        : tpl.exactVideoQuery || translation.primaryQueryEn;
    const badge = extractPedagogicalBadge(cleanNarration, directorInstructions, tpl.badge);
    const beats = buildVisualBeatsForScene(
      cleanNarration,
      effectiveQueryEn,
      tpl.titleSuffix,
      directorInstructions
    );

    return {
      scene_id: idx + 1,
      title: `${tpl.section.split(':')[0]}: ${tpl.titleSuffix}`,
      subject,
      pedagogical_section: tpl.section,
      narration_vi: cleanNarration,
      narration_normalized: normNarration,
      exact_video_search_en: effectiveQueryEn,
      search_keywords_en: effectiveQueryEn,
      visual_prompt_en: `Cinematic 16:9 HD educational documentary visual of ${effectiveQueryEn}, ${matchedInstruction || cleanTopic}`,
      wikipedia_topic_en: tpl.wikiTopic,
      pedagogical_badge: badge,
      visual_beats: beats,
      camera_motion: motions[idx % motions.length],
      lut_style: luts[idx % luts.length],
      duration_seconds: calculateSceneDuration(normNarration),
      fallbackStage: 3,
      visualMode: 'auto',
      videoCandidateUrls: translation.curatedVideoUrls,
      videoCandidateIndex: 0,
      videoSourceLabel: `🔄 Đang nạp Media 4 Tầng (${effectiveQueryEn})...`,
      imageSourceType: 'video',
    };
  });

  return scaleScenesToTargetDuration(generated, targetDurationSec);
}

export async function analyzeScript({
  topicTitle = '',
  subject = 'Sinh học',
  directorInstructions = '',
  script,
  model,
  thinkingLevel,
  targetDurationSec = 120,
  onStatusUpdate,
}: AnalyzeScriptParams): Promise<Scene[]> {
  const effectiveInput = (script || topicTitle || directorInstructions || '').trim();
  if (!effectiveInput) {
    throw new Error('Vui lòng nhập Tên bài học / Chủ đề hoặc nội dung kịch bản.');
  }

  const cleanScript = cleanExtraneousInstructions(effectiveInput);
  const isStatic = isStaticEnvironment();
  const keysCount = keyRotationEngine.getTotalKeysCount();
  const targetSceneCount = getTargetSceneCountForDuration(targetDurationSec);

  // If on GitHub Pages without user API keys, autonomously generate the 4-part pedagogical script!
  if (isStatic && keysCount === 0) {
    onStatusUpdate?.(
      `Đạo diễn AI V3.0 đang tự động biên soạn ${targetSceneCount} phân cảnh sư phạm môn ${subject}...`
    );
    return generateAutonomousPedagogicalScenes(
      topicTitle || cleanScript,
      subject,
      targetDurationSec,
      cleanScript,
      directorInstructions
    );
  }

  onStatusUpdate?.(
    `Đạo diễn AI V3.0 (${model}) đang biên soạn kịch bản Scene-Graph 4 phần môn ${subject} (${targetSceneCount} cảnh)...`
  );

  try {
    return await keyRotationEngine.executeWithRotation(async (apiKey) => {
      if (isStatic) {
        if (!apiKey) {
          return generateAutonomousPedagogicalScenes(
            topicTitle || cleanScript,
            subject,
            targetDurationSec,
            cleanScript,
            directorInstructions
          );
        }
        onStatusUpdate?.('Đang gọi trực tiếp Gemini REST API (Scene-Graph Director V3.0)...');
        const resScenes = await callGeminiDirectRest(
          topicTitle || cleanScript,
          subject,
          cleanScript,
          directorInstructions,
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
            topicTitle: topicTitle || cleanScript,
            subject,
            directorInstructions,
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
        if (!data.success || !Array.isArray(data.scenes) || data.scenes.length === 0) {
          throw new Error('Định dạng dữ liệu phân cảnh từ Gemini không hợp lệ.');
        }

        const processedScenes: Scene[] = data.scenes.map((s: any, idx: number) => {
          const cleanNarration = cleanExtraneousInstructions(s.narration_vi || '');
          const narrationNorm = normalizeVietnameseNumbers(
            s.narration_normalized || cleanNarration
          );
          const duration = calculateSceneDuration(narrationNorm);
          const translation = translateNarrationToVideoQueries(
            cleanNarration,
            s.exact_video_search_en || s.search_keywords_en,
            s.wikipedia_topic_en
          );
          const exactSearchEn =
            s.exact_video_search_en || s.search_keywords_en || translation.primaryQueryEn;
          const badge =
            s.pedagogical_badge ||
            extractPedagogicalBadge(cleanNarration, directorInstructions, s.title);
          const beats = buildVisualBeatsForScene(
            cleanNarration,
            exactSearchEn,
            s.title || `Phân cảnh ${idx + 1}`,
            directorInstructions,
            s.visual_beats
          );

          return {
            scene_id: s.scene_id || idx + 1,
            title: s.title || `Phân cảnh ${idx + 1}`,
            subject,
            pedagogical_section: s.pedagogical_section || `Phần ${Math.min(4, idx + 1)}`,
            narration_vi: cleanNarration,
            narration_normalized: narrationNorm,
            exact_video_search_en: exactSearchEn,
            search_keywords_en: exactSearchEn,
            visual_prompt_en: s.visual_prompt_en || exactSearchEn,
            wikipedia_topic_en: s.wikipedia_topic_en || '',
            pedagogical_badge: badge,
            visual_beats: beats,
            camera_motion: s.camera_motion || 'zoom-in',
            lut_style: s.lut_style || 'cinematic-teal-orange',
            duration_seconds: duration,
            fallbackStage: 3,
            visualMode: 'auto',
            videoCandidateUrls: translation.curatedVideoUrls,
            videoCandidateIndex: 0,
            videoSourceLabel: `🔄 Đang nạp Media 4 Tầng (${exactSearchEn})...`,
            imageSourceType: 'video',
          };
        });

        return scaleScenesToTargetDuration(processedScenes, targetDurationSec);
      } catch (err: any) {
        if ((err.status === 404 || err.message?.includes('404')) && apiKey) {
          const resScenes = await callGeminiDirectRest(
            topicTitle || cleanScript,
            subject,
            cleanScript,
            directorInstructions,
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
  } catch (err) {
    console.warn('Gemini API fallback to Autonomous Pedagogical Director:', err);
    onStatusUpdate?.(
      `Đang kích hoạt Bộ Não Đạo Diễn Sư Phạm V3.0 cho chủ đề "${topicTitle || cleanScript}"...`
    );
    return generateAutonomousPedagogicalScenes(
      topicTitle || cleanScript,
      subject,
      targetDurationSec,
      cleanScript,
      directorInstructions
    );
  }
}

/**
 * Direct REST API for GitHub Pages hosting with V3.0 Scene-Graph responseSchema structured JSON
 */
async function callGeminiDirectRest(
  topicTitle: string,
  subject: SubjectOption,
  prompt: string,
  directorInstructions: string,
  model: string,
  thinkingLevel: ThinkingLevelOption,
  apiKey: string,
  targetDurationSec: number = 120
): Promise<Scene[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const durationSec = Math.max(30, Math.min(300, targetDurationSec));
  const targetSceneCount = getTargetSceneCountForDuration(durationSec);

  const systemInstruction = `Bạn là Đạo Diễn Sư Phạm AI Đa Phương Thức Thế Hệ V3.0 (Autonomous Pedagogical Scene-Graph Director) chuyên nghiệp cho môn ${subject}.
Nhiệm vụ: Tự động biên soạn kịch bản bài giảng video chuyển động cấu trúc 4 PHẦN SƯ PHẠM CHUẨN gồm đúng ${targetSceneCount} phân cảnh (scenes) cho tổng thời lượng ${durationSec} giây:
- Phần 1: Mở đầu & Đặt vấn đề
- Phần 2: Kiến thức trọng tâm 1
- Phần 3: Kiến thức trọng tâm 2
- Phần 4: Ứng dụng thực tiễn & Tổng kết

QUY TẮC BẮT BUỘC:
1. 'narration_vi': Văn phong Kể chuyện Sư phạm Truyền cảm, có dấu phẩy, dấu chấm, dấu ba chấm (...) tạo nhịp thở tự nhiên.
2. 'narration_normalized': Chuẩn hóa 100% số, ký hiệu, công thức hóa học/vật lý/sinh học sang chữ tiếng Việt ("3.260 km" -> "ba nghìn hai trăm sáu mươi ki-lô-mét", "5 mg/l" -> "năm mi-li-gam trên lít", "H2O" -> "hát hai ô").
3. 'pedagogical_badge': Nhãn công thức/kiến thức trọng tâm hiện trên góc màn hình (VD: "Hàm lượng Oxy (DO) >= 5 mg/l").`;

  const userPrompt = `Tên bài học / Chủ đề: "${topicTitle}"
Môn học: ${subject}
Thời lượng mục tiêu: ${durationSec} giây (~${targetSceneCount} phân cảnh)
Chỉ dẫn Đạo diễn & Yêu cầu Hình ảnh cụ thể: "${directorInstructions || 'Tự động đạo diễn theo chuẩn sư phạm'}"
Nội dung bổ sung: ${prompt}`;

  const requestBody: any = {
    contents: [
      {
        parts: [{ text: userPrompt }],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        description: 'Danh sách phân cảnh bài giảng sư phạm 4 phần V3.0',
        items: {
          type: 'OBJECT',
          properties: {
            scene_id: { type: 'INTEGER' },
            title: { type: 'STRING' },
            pedagogical_section: { type: 'STRING' },
            narration_vi: { type: 'STRING' },
            narration_normalized: { type: 'STRING' },
            exact_video_search_en: { type: 'STRING' },
            visual_prompt_en: { type: 'STRING' },
            search_keywords_en: { type: 'STRING' },
            wikipedia_topic_en: { type: 'STRING' },
            pedagogical_badge: { type: 'STRING' },
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
    const translation = translateNarrationToVideoQueries(
      cleanNarration,
      s.exact_video_search_en || s.search_keywords_en,
      s.wikipedia_topic_en
    );
    const exactSearchEn =
      s.exact_video_search_en || s.search_keywords_en || translation.primaryQueryEn;
    const badge =
      s.pedagogical_badge ||
      extractPedagogicalBadge(cleanNarration, directorInstructions, s.title);
    const beats = buildVisualBeatsForScene(
      cleanNarration,
      exactSearchEn,
      s.title || `Phân cảnh ${idx + 1}`,
      directorInstructions,
      s.visual_beats
    );

    return {
      scene_id: s.scene_id || idx + 1,
      title: s.title || `Phân cảnh ${idx + 1}`,
      pedagogical_section: s.pedagogical_section || `Phần ${Math.min(4, idx + 1)}`,
      narration_vi: cleanNarration,
      narration_normalized: norm,
      exact_video_search_en: exactSearchEn,
      search_keywords_en: exactSearchEn,
      visual_prompt_en: s.visual_prompt_en || exactSearchEn,
      wikipedia_topic_en: s.wikipedia_topic_en || '',
      pedagogical_badge: badge,
      visual_beats: beats,
      camera_motion: s.camera_motion || 'zoom-in',
      lut_style: s.lut_style || 'cinematic-teal-orange',
      duration_seconds: calculateSceneDuration(norm),
      videoUrl: translation.curatedVideoUrls[0],
      videoCandidateUrls: translation.curatedVideoUrls,
      videoCandidateIndex: 0,
      videoSourceLabel: `🎬 Video MP4/WebM (${exactSearchEn})`,
      imageSourceType: 'video',
    };
  });
}
