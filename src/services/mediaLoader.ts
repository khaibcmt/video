import { LutStyle } from '../types';
import { keyRotationEngine } from './keyRotation';

interface WikimediaImageResult {
  url: string;
  thumbUrl: string;
  mime: string;
  title: string;
  width: number;
  height: number;
  score: number;
}

interface WikimediaVideoResult {
  url: string;
  mime: string;
  title: string;
  width: number;
  height: number;
  score: number;
}

const imageCache = new Map<string, HTMLImageElement>();
const videoCache = new Map<string, HTMLVideoElement>();
const proceduralCache = new Map<string, HTMLCanvasElement>();

// Detect static hosting environments (only GitHub Pages or local file protocol)
const isStaticHost =
  typeof window !== 'undefined' &&
  (window.location.hostname.includes('github.io') ||
    window.location.protocol === 'file:');

/**
 * Comprehensive Vietnamese-to-English visual subject & action dictionary
 * Ensures direct extraction of accurate English search keywords from Vietnamese narration (`narration_vi`).
 */
const VIETNAMESE_TO_ENGLISH_VISUAL_MAP: Record<string, string> = {
  // Animals & Fables (Truyện ngụ ngôn, cổ tích, thế giới động vật)
  'rùa và thỏ': 'tortoise and hare rabbit nature',
  'con rùa': 'tortoise turtle walking forest',
  'rùa biển': 'sea turtle swimming coral reef',
  'chú rùa': 'tortoise walking nature',
  'rùa': 'tortoise turtle wildlife',
  'con thỏ': 'wild rabbit hare running meadow',
  'chú thỏ': 'rabbit hare grass forest',
  'thỏ': 'wild rabbit hare nature',
  'con cáo': 'red fox forest wildlife',
  'cáo': 'red fox wildlife',
  'sư tử': 'lion savanna wildlife',
  'chúa sơn lâm': 'tiger lion jungle wildlife',
  'con hổ': 'tiger jungle wildlife',
  'hổ': 'tiger wildlife',
  'đàn voi': 'elephant herd nature',
  'con voi': 'elephant nature wildlife',
  'voi': 'elephant wildlife',
  'khỉ': 'monkey macaque forest trees',
  'đàn chim': 'flock of birds flying sky',
  'chim đại bàng': 'eagle soaring mountain sky',
  'đại bàng': 'eagle soaring sky',
  'chim bồ câu': 'white dove pigeon flying',
  'chim công': 'peacock colorful feathers',
  'chim': 'bird nature tree branch',
  'cá heo': 'dolphin swimming ocean waves',
  'cá voi': 'whale deep blue ocean',
  'đàn cá': 'school of fish coral reef underwater',
  'ong mật': 'honeybee flower pollination',
  'đàn ong': 'honeybee hive flower',
  'đàn kiến': 'ants working leaf nature',
  'con ếch': 'green frog lotus leaf pond',
  'con trâu': 'water buffalo rice paddy Vietnam',
  'đàn trâu': 'water buffalo countryside Vietnam',
  'con ngựa': 'horse galloping meadow',
  'đàn cừu': 'sheep flock green hill',
  'chó sói': 'gray wolf forest nature',
  'con sói': 'gray wolf forest',
  'bướm': 'butterfly flower garden',
  'cánh cò': 'white egret heron rice field',
  'con cò': 'white egret rice paddy',
  'gà trống': 'rooster farm sunrise',
  'con mèo': 'cat domestic pet',
  'con chó': 'loyal dog running nature',

  // Landscapes & Vietnam Heritage
  'vịnh hạ long': 'Ha Long Bay limestone islands',
  'hạ long': 'Ha Long Bay Vietnam aerial',
  'động thiên cung': 'Thien Cung Cave stalactites Ha Long',
  'thiên cung': 'Thien Cung Cave stalactites',
  'hang sửng sốt': 'Sung Sot Cave Ha Long Bay',
  'sửng sốt': 'Sung Sot Cave stalactites',
  'làng chài': 'floating fishing village Ha Long Bay Vietnam',
  'hồ hoàn kiếm': 'Hoan Kiem Lake Turtle Tower Hanoi',
  'hồ gươm': 'Hoan Kiem Lake Hanoi',
  'tháp rùa': 'Turtle Tower Hoan Kiem Lake Hanoi',
  'cầu thê húc': 'The Huc Bridge Hoan Kiem Lake Hanoi',
  'hà nội': 'Hanoi Old Quarter Hoan Kiem Lake',
  'tp hồ chí minh': 'Ho Chi Minh City skyline',
  'sài gòn': 'Ho Chi Minh City skyline river',
  'cầu vàng': 'Golden Bridge Ba Na Hills Da Nang',
  'bà nà': 'Ba Na Hills Da Nang cable car',
  'đà nẵng': 'Dragon Bridge Da Nang coastline',
  'phố cổ hội an': 'Hoi An ancient town lanterns river',
  'hội an': 'Hoi An ancient town yellow houses lanterns',
  'cố đô huế': 'Imperial City Hue Citadel Vietnam',
  'kinh thành huế': 'Imperial City Hue Vietnam',
  'sông hương': 'Perfume River Hue Trang Tien Bridge',
  'sapa': 'Sapa terraced rice fields mountains Vietnam',
  'mù cang chải': 'Mu Cang Chai terraced rice fields',
  'ruộng bậc thang': 'terraced rice fields mountains Vietnam',
  'tây nguyên': 'Central Highlands Vietnam coffee waterfall',
  'buôn ma thuột': 'Buon Ma Thuot coffee plantation Vietnam',
  'nhà rông': 'Rong house Central Highlands Vietnam',
  'cồng chiêng': 'Gong culture Central Highlands Vietnam',
  'cà phê': 'coffee beans plantation roasted coffee',
  'phin cà phê': 'Vietnamese drip phin coffee cup',
  'phở': 'Vietnamese Pho noodle soup bowl',
  'bánh mì': 'Vietnamese Banh Mi crispy baguette',
  'áo dài': 'Vietnamese Ao Dai traditional dress',
  'nón lá': 'Vietnamese conical hat Non La',
  'tết nguyên đán': 'Vietnamese Lunar New Year Tet peach blossom',
  'hoa đào': 'pink peach blossom flower spring',
  'hoa mai': 'yellow apricot blossom flower Vietnam',
  'hoa sen': 'pink lotus flower pond Vietnam',
  'đầm sen': 'lotus pond green leaves',
  'trống đồng': 'Dong Son bronze drum ancient Vietnam',
  'con đường tơ lụa': 'Silk Road camel caravan desert dunes',
  'tơ lụa': 'Silk Road caravan ancient trade',
  'đoàn lạc đà': 'camel caravan desert sand dunes',
  'lạc đà': 'camel desert dunes sunset',
  'sa mạc': 'desert sand dunes golden sun',

  // Science, Space, Nature & Environment
  'hố đen': 'supermassive black hole accretion disk space',
  'chân trời sự kiện': 'black hole event horizon gravitational lensing',
  'thuyết tương đối': 'Albert Einstein general relativity spacetime',
  'albert einstein': 'Albert Einstein physicist portrait',
  'einstein': 'Albert Einstein scientist',
  'vũ trụ': 'deep space galaxy nebula stars cosmos',
  'dải ngân hà': 'Milky Way galaxy night sky stars',
  'ngân hà': 'Milky Way galaxy cosmos',
  'hệ mặt trời': 'Solar System planets orbit sun',
  'mặt trời': 'Sun solar flare astronomy space',
  'trái đất': 'Planet Earth from space blue marble',
  'mặt trăng': 'Full Moon craters night sky',
  'sao hỏa': 'Mars red planet space astronomy',
  'thiên thạch': 'asteroid meteor deep space',
  'kính thiên văn': 'space telescope observatory astronomy',
  'rừng mưa nhiệt đới': 'tropical rainforest lush canopy waterfall',
  'khu rừng': 'sunlight green forest trees nature',
  'rừng già': 'ancient forest tall trees sunlight',
  'rừng': 'green forest trees nature',
  'đại dương': 'deep blue ocean underwater marine life',
  'rạn san hô': 'colorful coral reef underwater fish',
  'bãi biển': 'tropical sandy beach turquoise ocean waves',
  'biển': 'turquoise ocean waves coastline',
  'đỉnh núi': 'majestic mountain peak clouds sunrise',
  'dãy núi': 'mountain range valley landscape',
  'núi': 'majestic mountain peaks nature',
  'dòng sông': 'scenic river flowing green valley',
  'con suối': 'clear forest stream rocks nature',
  'thác nước': 'majestic waterfall tropical forest',
  'cánh đồng lúa': 'green rice paddy field countryside Vietnam',
  'đồng lúa': 'golden rice field harvest countryside',
  'cánh đồng': 'green meadow field sunrise',
  'ngôi làng': 'peaceful countryside village nature',
  'đồng bằng sông cửu long': 'Mekong Delta floating market river Vietnam',
  'sông mê kông': 'Mekong River boats delta',
  'chợ nổi': 'Cai Rang floating market boats Mekong Delta',
  'miền tây': 'Mekong Delta river palm trees boats',
  'chùa một cột': 'One Pillar Pagoda Hanoi Vietnam',
  'văn miếu': 'Temple of Literature Hanoi Khue Van Cac',
  'phong nha': 'Phong Nha Cave underground river boat',
  'sơn đoòng': 'Son Doong Cave giant cavern sunlight',
  'ninh bình': 'Trang An Ninh Binh limestone river boats',
  'tràng an': 'Trang An Ninh Binh karst landscape',
  'tam cốc': 'Tam Coc Ninh Binh river rice fields',
  'phú quốc': 'Phu Quoc island beach palm trees sunset',
  'nha trang': 'Nha Trang beach bay turquoise water',
  'đà lạt': 'Da Lat pine forest misty lake flowers',
  'thác bản giốc': 'Ban Gioc Waterfall Cao Bang Vietnam',
  'hồ ba bể': 'Ba Be Lake emerald water mountains',

  // History, Technology, Education, Health, Daily actions
  'lịch sử': 'historical monument ancient citadel architecture',
  'hoàng thành thăng long': 'Imperial Citadel of Thang Long Hanoi',
  'trí tuệ nhân tạo': 'artificial intelligence neural network technology',
  'công nghệ': 'modern technology digital innovation circuit',
  'máy tính': 'modern computer technology workspace',
  'robot': 'humanoid robot futuristic technology',
  'y tế': 'medical hospital doctor healthcare laboratory',
  'bác sĩ': 'doctor stethoscope medical hospital',
  'ADN': 'DNA double helix genetics science',
  'tế bào': 'microscopic biological cells science',
  'giáo dục': 'students classroom university library books',
  'trường học': 'school classroom students learning',
  'đọc sách': 'reading book library knowledge',
  'nông nghiệp': 'farmers green rice field agriculture',
  'năng lượng mặt trời': 'solar panels renewable energy farm',
  'điện gió': 'wind turbines green energy landscape',
  'chạy đua': 'running race track competition nature',
  'về đích': 'finish line victory celebration',
  'ngủ quên': 'sleeping resting under tree nature',
  'kiên trì': 'climbing mountain perseverance sunrise',
};

/**
 * Extracts English visual keywords directly from Vietnamese narration text (`narration_vi`).
 * Sorts dictionary keys by length descending so multi-word Vietnamese phrases match first!
 */
export function extractVisualKeywordsFromVietnamese(viText: string): string | null {
  if (!viText) return null;
  const lower = viText.toLowerCase();
  const matchedTerms: string[] = [];

  const sortedEntries = Object.entries(VIETNAMESE_TO_ENGLISH_VISUAL_MAP).sort(
    (a, b) => b[0].length - a[0].length
  );

  for (const [viKey, enVal] of sortedEntries) {
    if (lower.includes(viKey)) {
      if (!matchedTerms.includes(enVal)) {
        matchedTerms.push(enVal);
      }
      if (matchedTerms.length >= 2) break;
    }
  }

  return matchedTerms.length > 0 ? matchedTerms.join(' ') : null;
}

/**
 * Extracts core Vietnamese noun phrases directly from `narration_vi`
 * so we can search Vietnamese Wikipedia (`vi.wikipedia.org`) and Wikimedia Commons directly from the dialogue.
 */
export function extractVietnameseCoreTopic(narrationVi: string): string {
  if (!narrationVi) return '';
  const lower = narrationVi.toLowerCase();

  // 1. Check if any known Vietnamese entity phrase appears in the narration
  const sortedViKeys = Object.keys(VIETNAMESE_TO_ENGLISH_VISUAL_MAP).sort(
    (a, b) => b.length - a.length
  );
  const foundKeys: string[] = [];
  for (const k of sortedViKeys) {
    if (lower.includes(k)) {
      foundKeys.push(k);
      if (foundKeys.length >= 2) break;
    }
  }
  if (foundKeys.length > 0) {
    return foundKeys.join(' ');
  }

  // 2. Otherwise remove common Vietnamese stop/filler words and keep meaningful subject words
  const stopWords = new Set([
    'là', 'của', 'và', 'những', 'các', 'một', 'trong', 'trên', 'dưới', 'với',
    'được', 'có', 'không', 'đã', 'đang', 'sẽ', 'này', 'đó', 'khi', 'như',
    'về', 'từ', 'đến', 'cho', 'tại', 'bởi', 'vì', 'nên', 'nhưng', 'mà',
    'rất', 'hơn', 'nhất', 'cùng', 'theo', 'qua', 'lại', 'ra', 'vào', 'lên',
    'xuống', 'nơi', 'đây', 'mỗi', 'năm', 'ngày', 'tháng', 'lượt', 'hàng',
  ]);

  const cleanTokens = narrationVi
    .replace(/[.,;!?()"'“”‘’\-–—]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w.toLowerCase()) && !/^\d+$/.test(w));

  return cleanTokens.slice(0, 5).join(' ');
}

/**
 * Cleans and normalizes English search keywords
 */
function sanitizeSearchKeywords(raw: string): string {
  return raw
    .replace(/[\[\]\(\)"'#$*.,;!?/\\]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 1 &&
        ![
          'cinematic',
          'photography',
          'photo',
          'picture',
          'image',
          'footage',
          'video',
          'scene',
          'shot',
          'view',
          'high',
          'quality',
          '4k',
          'hd',
          'the',
          'and',
          'with',
          'for',
          'from',
          'into',
          'over',
          'illustration',
          'wide',
          'angle',
          'background',
          'style',
        ].includes(w.toLowerCase())
    )
    .slice(0, 5)
    .join(' ');
}

/**
 * TIER 0: Search Wikimedia Commons for REAL HD Video Footage (.webm / .mp4)
 * STRICT HOMOLOGY RULE: Only returns a video if its title/subject strictly matches
 * the primary tokens derived from `narration_vi` and `keyword`.
 */
export async function searchWikimediaVideoFootage(
  keyword: string,
  narrationVi?: string,
  usedUrls?: Set<string>
): Promise<string | null> {
  const tryVideoQuery = async (queryStr: string): Promise<string | null> => {
    if (!queryStr || !queryStr.trim()) return null;
    try {
      const searchExpr = `${queryStr.trim()} filetype:video`;
      const endpoint = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        searchExpr
      )}&gsrnamespace=6&prop=imageinfo&iiprop=url|mime|dimensions|size&gsrlimit=15&format=json&origin=*`;

      const res = await fetch(endpoint, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return null;
      const data = await res.json();
      const pages = data?.query?.pages;
      if (!pages) return null;

      const queryTokens = queryStr
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 2);

      if (queryTokens.length === 0) return null;

      // Require at least 2 matching tokens when query has 2+ tokens so unrelated videos are rejected!
      const minRequiredMatches = queryTokens.length >= 2 ? 2 : 1;

      const candidates: WikimediaVideoResult[] = [];

      Object.values(pages).forEach((page: any) => {
        const info = page?.imageinfo?.[0];
        if (!info || !info.url) return;

        const mime = (info.mime || '').toLowerCase();
        const url: string = info.url;
        const title: string = (page.title || '').toLowerCase();
        const width: number = info.width || 1280;
        const height: number = info.height || 720;
        const size: number = info.size || 0;

        // Only accept browser-playable WebM or MP4 video streams under 38MB
        if (
          !(
            mime.includes('webm') ||
            mime.includes('mp4') ||
            url.endsWith('.webm') ||
            url.endsWith('.mp4')
          )
        ) {
          return;
        }
        if (size > 38_000_000) return;
        if (width < 480 || height < 270) return;

        // Exclude spoken interviews, animations of diagrams, maps, logos, or people talking
        if (
          title.includes('interview') ||
          title.includes('speech') ||
          title.includes('lecture') ||
          title.includes('tutorial') ||
          title.includes('screencast') ||
          title.includes('diagram') ||
          title.includes('map') ||
          title.includes('conference') ||
          title.includes('wikimedia') ||
          title.includes('wikimania') ||
          title.includes('user ') ||
          title.includes('pronunciation') ||
          title.includes('sign language')
        ) {
          return;
        }

        let score = 0;
        let matchedTokens = 0;
        for (const token of queryTokens) {
          if (title.includes(token)) {
            matchedTokens++;
            score += 25;
          }
        }

        // Strict homology check: reject video if it doesn't match the required subject tokens
        if (matchedTokens < minRequiredMatches) return;

        const aspect = width / height;
        if (aspect >= 1.25 && aspect <= 2.2) {
          score += 30;
        } else {
          score -= 20;
        }

        if (size > 500_000 && size < 20_000_000) {
          score += 15;
        }

        if (usedUrls && usedUrls.has(url)) {
          score -= 200;
        }

        candidates.push({
          url,
          mime,
          title: page.title || '',
          width,
          height,
          score,
        });
      });

      const valid = candidates.filter((c) => c.score >= 40);
      if (valid.length === 0) return null;

      valid.sort((a, b) => b.score - a.score);
      const chosenUrl = valid[0].url;
      if (usedUrls) usedUrls.add(chosenUrl);
      return chosenUrl;
    } catch {
      return null;
    }
  };

  // Prioritize keywords extracted directly from the Vietnamese narration (`narration_vi`) first!
  const queries: string[] = [];
  const mappedFromNarration = extractVisualKeywordsFromVietnamese(narrationVi || '');
  const cleanedEn = sanitizeSearchKeywords(keyword || '');

  if (mappedFromNarration) {
    const narrationWords = mappedFromNarration.split(/\s+/);
    if (narrationWords.length >= 2) {
      queries.push(narrationWords.slice(0, 2).join(' '));
    }
    queries.push(mappedFromNarration);
  }

  if (cleanedEn) {
    const enWords = cleanedEn.split(/\s+/);
    if (enWords.length >= 2) {
      const twoWord = enWords.slice(0, 2).join(' ');
      if (!queries.includes(twoWord)) queries.push(twoWord);
    }
    if (!queries.includes(cleanedEn)) queries.push(cleanedEn);
  }

  for (const q of queries) {
    const videoUrl = await tryVideoQuery(q);
    if (videoUrl) return videoUrl;
  }

  return null;
}

/**
 * Loads an HTML5 Video element ready for real-time 30fps Canvas rendering
 */
export function loadVideoWithFallback(
  videoUrl: string,
  timeoutMs: number = 9000
): Promise<HTMLVideoElement> {
  if (videoCache.has(videoUrl)) {
    const cached = videoCache.get(videoUrl)!;
    cached.play().catch(() => {});
    return Promise.resolve(cached);
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';

    let timer: any = null;
    let triedProxy = false;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      video.onloadeddata = null;
      video.onerror = null;
    };

    video.onloadeddata = () => {
      cleanup();
      video.play().catch(() => {});
      videoCache.set(videoUrl, video);
      resolve(video);
    };

    video.onerror = () => {
      if (!triedProxy && !isStaticHost && !videoUrl.startsWith('blob:')) {
        triedProxy = true;
        video.src = `/api/proxy-video?url=${encodeURIComponent(videoUrl)}`;
        video.load();
        return;
      }
      cleanup();
      reject(new Error(`Failed to load video footage: ${videoUrl}`));
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Video load timed out: ${videoUrl}`));
    }, timeoutMs);

    video.src = videoUrl;
    video.load();
  });
}

/**
 * TIER 1: Generate an exact narration-matched 16:9 image using Gemini Image Generation
 */
export async function generateStorySceneImage(
  visualPromptEn: string,
  sceneId: number = 1
): Promise<string | null> {
  if (!visualPromptEn || !visualPromptEn.trim()) return null;

  const apiKey = keyRotationEngine.getNextActiveKey();

  if (apiKey || !isStaticHost) {
    try {
      if (isStaticHost && apiKey) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Cinematic 16:9 high-resolution realistic photography/illustration, no text, no words, no watermark, exact depiction of: ${visualPromptEn}`,
                  },
                ],
              },
            ],
            generationConfig: {
              imageConfig: { aspectRatio: '16:9' },
            },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          for (const part of data?.candidates?.[0]?.content?.parts ?? []) {
            if (part.inlineData?.data) {
              const mime = part.inlineData.mimeType || 'image/png';
              return `data:${mime};base64,${part.inlineData.data}`;
            }
          }
        }
      } else if (!isStaticHost) {
        const res = await fetch('/api/gemini/generate-scene-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey,
            visualPrompt: visualPromptEn,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.success && data.imageUrl) {
            return data.imageUrl;
          }
        }
      }
    } catch {
      // Fall through
    }
  }

  return null;
}

/**
 * TIER 2: Wikipedia Lead Article Image Search (vi.wikipedia.org + en.wikipedia.org)
 */
export async function searchWikipediaLeadImage(
  topicOrQuery: string,
  lang: 'en' | 'vi' = 'en',
  usedUrls?: Set<string>
): Promise<string | null> {
  if (!topicOrQuery || !topicOrQuery.trim()) return null;

  try {
    const cleanQ = topicOrQuery.replace(/[^\w\s\u00C0-\u1EF9-]/g, ' ').trim();
    if (!cleanQ) return null;

    const endpoint = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      cleanQ
    )}&gsrlimit=6&prop=pageimages&piprop=original|thumbnail&pithumbsize=1280&format=json&origin=*`;

    const res = await fetch(endpoint, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;

    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;

    const sortedPages = Object.values(pages).sort(
      (a: any, b: any) => (a.index || 99) - (b.index || 99)
    );

    for (const page of sortedPages as any[]) {
      const thumbUrl: string | undefined =
        page?.thumbnail?.source || page?.original?.source;
      if (!thumbUrl) continue;

      const lowerUrl = thumbUrl.toLowerCase();
      if (
        lowerUrl.endsWith('.svg') ||
        lowerUrl.endsWith('.gif') ||
        lowerUrl.endsWith('.tif') ||
        lowerUrl.endsWith('.pdf') ||
        lowerUrl.includes('flag_of') ||
        lowerUrl.includes('coat_of_arms') ||
        lowerUrl.includes('locator_map') ||
        lowerUrl.includes('map_of') ||
        lowerUrl.includes('commons-logo') ||
        lowerUrl.includes('question_book') ||
        lowerUrl.includes('disambig')
      ) {
        continue;
      }

      if (usedUrls && usedUrls.has(thumbUrl)) {
        continue;
      }

      if (usedUrls) usedUrls.add(thumbUrl);
      return thumbUrl;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * TIER 3: Wikimedia Commons Strict Bitmap Search with narration-driven keyword scoring
 */
export async function searchWikimediaCommons(
  keyword: string,
  narrationVi?: string,
  usedUrls?: Set<string>
): Promise<string | null> {
  const trySearch = async (queryStr: string): Promise<string | null> => {
    if (!queryStr || !queryStr.trim()) return null;
    try {
      const searchExpr = `${queryStr.trim()} filetype:bitmap`;
      const endpoint = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        searchExpr
      )}&gsrnamespace=6&prop=imageinfo&iiprop=url|mime|dimensions&iiurlwidth=1280&gsrlimit=15&format=json&origin=*`;

      const res = await fetch(endpoint, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return null;
      const data = await res.json();
      const pages = data?.query?.pages;
      if (!pages) return null;

      const queryTokens = queryStr
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 2);

      const candidates: WikimediaImageResult[] = [];

      Object.values(pages).forEach((page: any) => {
        const info = page?.imageinfo?.[0];
        if (!info || (!info.thumburl && !info.url)) return;

        const mime = (info.mime || '').toLowerCase();
        const url: string = info.thumburl || info.url;
        const title: string = (page.title || '').toLowerCase();
        const width: number = info.width || 1280;
        const height: number = info.height || 720;

        if (
          url.endsWith('.svg') ||
          url.endsWith('.tif') ||
          url.endsWith('.tiff') ||
          url.endsWith('.gif') ||
          url.endsWith('.ogg') ||
          url.endsWith('.webm') ||
          url.endsWith('.pdf') ||
          title.includes('.pdf') ||
          title.includes('.djvu') ||
          title.includes('page ') ||
          title.includes('icon') ||
          title.includes('logo') ||
          title.includes('map ') ||
          title.includes('locator') ||
          title.includes('diagram') ||
          title.includes('chart') ||
          title.includes('signature') ||
          title.includes('coat of arms') ||
          title.includes('flag ') ||
          title.includes('stamp') ||
          title.includes('herbarium') ||
          title.includes('specimen') ||
          !(
            mime.includes('jpeg') ||
            mime.includes('jpg') ||
            mime.includes('png') ||
            mime.includes('webp')
          )
        ) {
          return;
        }

        if (width < 500 || height < 350) return;

        let score = 0;

        let matchedTokensCount = 0;
        for (const token of queryTokens) {
          if (title.includes(token)) {
            matchedTokensCount++;
            score += 22;
          }
        }
        if (matchedTokensCount === 0) {
          return;
        }

        const aspect = width / height;
        if (aspect >= 1.25 && aspect <= 2.2) {
          score += 30;
        } else if (aspect >= 1.0) {
          score += 10;
        } else {
          score -= 20;
        }

        if (mime.includes('jpeg') || mime.includes('jpg')) {
          score += 15;
        }

        if (usedUrls && (usedUrls.has(url) || usedUrls.has(info.url))) {
          score -= 150;
        }

        candidates.push({
          url: info.url,
          thumbUrl: url,
          mime,
          title: page.title || '',
          width,
          height,
          score,
        });
      });

      const validCandidates = candidates.filter((c) => c.score > 20);
      if (validCandidates.length === 0) return null;

      validCandidates.sort((a, b) => b.score - a.score);
      const chosen = validCandidates[0].thumbUrl || validCandidates[0].url;
      if (usedUrls) {
        usedUrls.add(chosen);
        usedUrls.add(validCandidates[0].url);
      }
      return chosen;
    } catch {
      return null;
    }
  };

  // Build search queries prioritizing the exact Vietnamese narration (`narration_vi`) first!
  const queriesToTry: string[] = [];

  if (narrationVi) {
    const mappedFromVi = extractVisualKeywordsFromVietnamese(narrationVi);
    if (mappedFromVi) {
      queriesToTry.push(mappedFromVi);
      const viMappedWords = mappedFromVi.split(/\s+/);
      if (viMappedWords.length > 2) {
        queriesToTry.push(viMappedWords.slice(0, 2).join(' '));
      }
    }
  }

  const cleanedEn = sanitizeSearchKeywords(keyword || '');
  if (cleanedEn) {
    if (!queriesToTry.includes(cleanedEn)) queriesToTry.push(cleanedEn);
    const words = cleanedEn.split(/\s+/);
    if (words.length > 3) {
      const threeW = words.slice(0, 3).join(' ');
      if (!queriesToTry.includes(threeW)) queriesToTry.push(threeW);
    }
    if (words.length > 2) {
      const twoW = words.slice(0, 2).join(' ');
      if (!queriesToTry.includes(twoW)) queriesToTry.push(twoW);
    }
  }

  for (const q of queriesToTry) {
    const foundUrl = await trySearch(q);
    if (foundUrl) return foundUrl;
  }

  return null;
}

/**
 * Loads an image from URL with CORS anonymous and server proxy fallback.
 */
export function loadImageWithFallback(
  imageUrl: string,
  timeoutMs: number = 9000
): Promise<HTMLImageElement> {
  if (imageCache.has(imageUrl)) {
    return Promise.resolve(imageCache.get(imageUrl)!);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!imageUrl.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }

    let timer: any = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
    };

    img.onload = () => {
      cleanup();
      imageCache.set(imageUrl, img);
      resolve(img);
    };

    img.onerror = () => {
      cleanup();

      if (!isStaticHost && !imageUrl.startsWith('data:')) {
        const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
        const proxyImg = new Image();
        proxyImg.crossOrigin = 'anonymous';

        proxyImg.onload = () => {
          imageCache.set(imageUrl, proxyImg);
          resolve(proxyImg);
        };

        proxyImg.onerror = () => {
          reject(new Error(`Failed to load image: ${imageUrl}`));
        };

        proxyImg.src = proxyUrl;
      } else {
        reject(new Error(`CORS blocked or image not found: ${imageUrl}`));
      }
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Image load timed out: ${imageUrl}`));
    }, timeoutMs);

    img.src = imageUrl;
  });
}

/**
 * Master Narration-Driven Video & Image Resolver:
 * Strictly searches for video clips and images directly from the scene's narration (`narration_vi`)
 * and instructions so visuals are 100% homologous with the spoken dialogue!
 */
export async function fetchVerifiedSceneMedia(
  keywordsEn: string,
  narrationVi?: string,
  usedUrls?: Set<string>,
  visualPromptEn?: string,
  wikipediaTopicEn?: string,
  sceneId: number = 1,
  preferRealVideo: boolean = true
): Promise<{
  videoUrl?: string;
  videoElement?: HTMLVideoElement;
  imageUrl?: string;
  imageElement?: HTMLImageElement;
  sourceType: 'video' | 'ai' | 'wikipedia' | 'wikimedia';
} | null> {
  const narrationMappedEn = extractVisualKeywordsFromVietnamese(narrationVi || '');
  const viCoreTopic = extractVietnameseCoreTopic(narrationVi || '');

  // Primary search query combines narration-extracted keywords with scene keywords
  const primarySearchQuery =
    narrationMappedEn || wikipediaTopicEn || keywordsEn || viCoreTopic;

  // 1. TIER 0: Search for strictly matching HD Video Footage (.webm / .mp4) from the narration subject
  if (preferRealVideo && primarySearchQuery) {
    const realVideoUrl = await searchWikimediaVideoFootage(
      primarySearchQuery,
      narrationVi,
      usedUrls
    );
    if (realVideoUrl) {
      try {
        const videoEl = await loadVideoWithFallback(realVideoUrl, 8500);
        return {
          videoUrl: realVideoUrl,
          videoElement: videoEl,
          sourceType: 'video',
        };
      } catch {
        // Continue seamlessly to exact image tiers if video fails to stream
      }
    }
  }

  // 2. TIER 1: Search Vietnamese Wikipedia (`vi.wikipedia.org`) & English Wikipedia (`en.wikipedia.org`)
  // directly using the topic mentioned in `narration_vi`
  if (viCoreTopic) {
    const viWikiUrl = await searchWikipediaLeadImage(viCoreTopic, 'vi', usedUrls);
    if (viWikiUrl) {
      try {
        const img = await loadImageWithFallback(viWikiUrl, 7000);
        return { imageUrl: viWikiUrl, imageElement: img, sourceType: 'wikipedia' };
      } catch {
        // continue
      }
    }
  }

  const enWikiTopic =
    wikipediaTopicEn ||
    narrationMappedEn ||
    keywordsEn.split(/\s+/).slice(0, 3).join(' ');

  if (enWikiTopic) {
    const enWikiUrl = await searchWikipediaLeadImage(enWikiTopic, 'en', usedUrls);
    if (enWikiUrl) {
      try {
        const img = await loadImageWithFallback(enWikiUrl, 7000);
        return { imageUrl: enWikiUrl, imageElement: img, sourceType: 'wikipedia' };
      } catch {
        // continue
      }
    }
  }

  // 3. TIER 2: Strict Wikimedia Commons Photograph Search driven by `narration_vi` & `keywordsEn`
  const commonsUrl = await searchWikimediaCommons(
    narrationMappedEn || keywordsEn,
    narrationVi,
    usedUrls
  );
  if (commonsUrl) {
    try {
      const img = await loadImageWithFallback(commonsUrl, 7000);
      return { imageUrl: commonsUrl, imageElement: img, sourceType: 'wikimedia' };
    } catch {
      // continue
    }
  }

  // 4. TIER 3: Gemini AI 16:9 Scene Image Generation for exact narration depiction
  const effectivePrompt =
    visualPromptEn ||
    narrationMappedEn ||
    keywordsEn ||
    narrationVi ||
    'Vietnam nature landscape';

  if (effectivePrompt) {
    const geminiImgUrl = await generateStorySceneImage(effectivePrompt, sceneId);
    if (geminiImgUrl) {
      try {
        const img = await loadImageWithFallback(geminiImgUrl, 8500);
        return { imageUrl: geminiImgUrl, imageElement: img, sourceType: 'ai' };
      } catch {
        // continue
      }
    }
  }

  // 5. TIER 4: Zero-Key AI 16:9 Story Visual Synthesizer directly from narration prompt
  if (effectivePrompt) {
    try {
      const cleanPrompt = encodeURIComponent(
        `cinematic 16:9 realistic photography of ${effectivePrompt}, high detail, natural lighting, no text, no watermark`
      );
      const seed = sceneId * 101 + (effectivePrompt.length % 97);
      const aiStreamUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1280&height=720&nologo=true&seed=${seed}`;
      const img = await loadImageWithFallback(aiStreamUrl, 9000);
      if (usedUrls) usedUrls.add(aiStreamUrl);
      return { imageUrl: aiStreamUrl, imageElement: img, sourceType: 'ai' };
    } catch {
      // Fall back to procedural canvas
    }
  }

  return null;
}

/**
 * Generates an internal procedural cinematic background (1280x720)
 * ensures the Canvas NEVER shows a black screen!
 */
export function generateProceduralBackground(
  theme: LutStyle = 'cinematic-teal-orange',
  seedIndex: number = 1,
  title: string = ''
): HTMLCanvasElement {
  const cacheKey = `${theme}_${seedIndex}_${title}`;
  if (proceduralCache.has(cacheKey)) {
    return proceduralCache.get(cacheKey)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const w = canvas.width;
  const h = canvas.height;

  // Color palette definitions based on LUT styles
  let gradColors = ['#041e24', '#0d4757', '#e07a38', '#f3b063']; // Teal-Orange
  let accentColor = 'rgba(235, 140, 50, 0.4)';

  if (theme === 'warm-golden') {
    gradColors = ['#1a0f05', '#57300c', '#c77826', '#f6d365'];
    accentColor = 'rgba(255, 200, 80, 0.45)';
  } else if (theme === 'natural-documentary') {
    gradColors = ['#081c15', '#1b4332', '#2d6a4f', '#74c69d'];
    accentColor = 'rgba(116, 198, 157, 0.35)';
  } else if (theme === 'high-contrast') {
    gradColors = ['#0a0a0f', '#1c1b29', '#3a3854', '#8a85b6'];
    accentColor = 'rgba(165, 160, 220, 0.4)';
  }

  // Linear base gradient
  const bgGrad = ctx.createLinearGradient(0, 0, w * 0.8, h);
  bgGrad.addColorStop(0, gradColors[0]);
  bgGrad.addColorStop(0.4, gradColors[1]);
  bgGrad.addColorStop(0.85, gradColors[2]);
  bgGrad.addColorStop(1, gradColors[3]);

  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Radial glow highlight (Cinematic sun/light source)
  const glowX = w * (0.3 + ((seedIndex * 17) % 50) / 100);
  const glowY = h * (0.3 + ((seedIndex * 23) % 40) / 100);
  const radGrad = ctx.createRadialGradient(glowX, glowY, 40, glowX, glowY, w * 0.7);
  radGrad.addColorStop(0, accentColor);
  radGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  radGrad.addColorStop(1, 'rgba(0, 0, 0, 0.6)');

  ctx.fillStyle = radGrad;
  ctx.fillRect(0, 0, w, h);

  // Draw cinematic horizon or subtle geometric topography waves
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, h * 0.65);
  for (let x = 0; x <= w; x += 40) {
    const wave =
      Math.sin((x / w) * 6 + seedIndex) * 45 +
      Math.cos((x / w) * 12 + seedIndex * 2) * 20;
    ctx.lineTo(x, h * 0.68 + wave);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(5, 10, 15, 0.55)';
  ctx.fill();

  // Second softer mountain/horizon layer
  ctx.beginPath();
  ctx.moveTo(0, h * 0.75);
  for (let x = 0; x <= w; x += 40) {
    const wave = Math.sin((x / w) * 8 + seedIndex * 3) * 30;
    ctx.lineTo(x, h * 0.78 + wave);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(3, 6, 10, 0.75)';
  ctx.fill();
  ctx.restore();

  // Draw cinematic ambient stars/particles
  ctx.save();
  for (let i = 0; i < 40; i++) {
    const px = ((seedIndex * 97 + i * 137) % 1200) + 40;
    const py = ((seedIndex * 53 + i * 83) % 640) + 40;
    const radius = ((i * 7) % 4) + 1.2;
    const alpha = 0.2 + ((i * 11) % 6) / 10;

    const pGrad = ctx.createRadialGradient(px, py, 0, px, py, radius * 3);
    pGrad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    pGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = pGrad;
    ctx.beginPath();
    ctx.arc(px, py, radius * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Cinematic top & bottom subtle letterbox vignette
  const vigGrad = ctx.createLinearGradient(0, 0, 0, h);
  vigGrad.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
  vigGrad.addColorStop(0.15, 'rgba(0, 0, 0, 0)');
  vigGrad.addColorStop(0.85, 'rgba(0, 0, 0, 0)');
  vigGrad.addColorStop(1, 'rgba(0, 0, 0, 0.7)');

  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, w, h);

  proceduralCache.set(cacheKey, canvas);
  return canvas;
}
