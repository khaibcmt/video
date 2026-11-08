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

// Detect static hosting environments (like GitHub Pages)
const isStaticHost =
  typeof window !== 'undefined' &&
  (window.location.hostname.includes('github.io') ||
    window.location.protocol === 'file:' ||
    (window.location.port !== '3000' && !window.location.hostname.includes('run.app')));

/**
 * Rich Vietnamese-to-English visual subject & entity dictionary
 * Covers animals, fables, landscapes, history, science, daily life, and culture.
 */
const VIETNAMESE_TO_ENGLISH_VISUAL_MAP: Record<string, string> = {
  // Animals & Fables (Truyện ngụ ngôn, cổ tích, thế giới động vật)
  'rùa': 'tortoise turtle nature',
  'con rùa': 'tortoise walking forest nature',
  'rùa biển': 'sea turtle swimming coral reef',
  'thỏ': 'wild rabbit hare meadow nature',
  'con thỏ': 'rabbit running grass forest',
  'cáo': 'red fox forest wildlife',
  'sư tử': 'lion savanna wildlife',
  'hổ': 'tiger jungle wildlife',
  'voi': 'elephant herd nature',
  'khỉ': 'monkey macaque forest trees',
  'chim': 'bird flying tree branch nature',
  'đại bàng': 'eagle soaring mountain sky',
  'cá heo': 'dolphin swimming ocean waves',
  'cá voi': 'whale deep blue ocean',
  'ong': 'honeybee flower pollination',
  'kiến': 'ants working leaf nature',
  'ếch': 'green frog lotus leaf pond',
  'trâu': 'water buffalo rice paddy Vietnam',
  'ngựa': 'horse galloping meadow',
  'cừu': 'sheep flock green hill',
  'sói': 'gray wolf forest nature',
  'rắn': 'snake reptile jungle',
  'bướm': 'butterfly flower garden',
  'cò': 'white egret heron rice field',

  // Landscapes & Vietnam Heritage
  'hạ long': 'Ha Long Bay Vietnam aerial',
  'vịnh hạ long': 'Ha Long Bay limestone islands',
  'thiên cung': 'Thien Cung Cave stalactites',
  'sửng sốt': 'Sung Sot Cave Ha Long',
  'làng chài': 'floating fishing village Vietnam',
  'hồ gươm': 'Hoan Kiem Lake Turtle Tower Hanoi',
  'hà nội': 'Hanoi Old Quarter Hoan Kiem Lake',
  'sài gòn': 'Ho Chi Minh City skyline',
  'hồ chí minh': 'Ho Chi Minh City landmark',
  'đà nẵng': 'Golden Bridge Ba Na Hills Da Nang',
  'hội an': 'Hoi An ancient town lanterns',
  'huế': 'Imperial City Hue Citadel Vietnam',
  'sapa': 'Sapa terraced rice fields mountains',
  'ruộng bậc thang': 'terraced rice fields Mu Cang Chai',
  'tây nguyên': 'Central Highlands Vietnam coffee',
  'buôn ma thuột': 'Buon Ma Thuot coffee plantation',
  'cà phê': 'coffee beans plantation harvest',
  'phin cà phê': 'Vietnamese drip phin coffee',
  'phở': 'Vietnamese Pho noodle soup',
  'bánh mì': 'Vietnamese Banh Mi sandwich',
  'áo dài': 'Vietnamese Ao Dai traditional dress',
  'tết': 'Lunar New Year peach blossom Vietnam',
  'trống đồng': 'Dong Son bronze drum Vietnam',
  'tơ lụa': 'Silk Road camel caravan desert',
  'lạc đà': 'camel caravan desert dunes',
  'sa mạc': 'sand dunes desert sunset',
  'hố đen': 'black hole accretion disk space',
  'vũ trụ': 'deep space galaxy nebula stars',
  'ngân hà': 'Milky Way galaxy night sky',
  'mặt trời': 'Sun solar flare astronomy',
  'trái đất': 'Planet Earth from space',
  'mặt trăng': 'Full Moon craters astronomy',
  'rừng': 'sunlight forest trees nature',
  'khu rừng': 'green forest trees nature',
  'biển': 'turquoise ocean waves coral reef',
  'đại dương': 'deep blue ocean marine life',
  'núi': 'majestic mountain peaks clouds',
  'dòng sông': 'scenic river flowing valley nature',
  'con suối': 'forest stream waterfall rocks',
  'thác nước': 'waterfall cascade tropical forest',
  'cánh đồng': 'green rice field countryside sunrise',
  'ngôi làng': 'peaceful countryside village nature',
  'sông mê kông': 'Mekong Delta floating market boats',
  'miền tây': 'Mekong Delta river boats Vietnam',
  'chùa một cột': 'One Pillar Pagoda Hanoi',
  'văn miếu': 'Temple of Literature Hanoi',
  'phong nha': 'Phong Nha Cave underground river',
  'sơn đoòng': 'Son Doong Cave giant cavern',
  'ninh bình': 'Trang An Ninh Binh karst river',
  'tràng an': 'Trang An boat tour limestone',
  'phú quốc': 'Phu Quoc island beach palm trees',
  'nha trang': 'Nha Trang beach bay island',
  'đà lạt': 'Da Lat pine forest misty lake',
  'lịch sử': 'ancient historical monument citadel',
  'công nghệ': 'modern technology microchip circuit',
  'trí tuệ nhân tạo': 'artificial intelligence robotics',
  'y tế': 'medical science laboratory doctor',
  'giáo dục': 'university library books students',
  'nông nghiệp': 'green rice paddy field farmers',
};

/**
 * Extracts fallback English visual keywords from Vietnamese text
 */
export function extractVisualKeywordsFromVietnamese(viText: string): string | null {
  if (!viText) return null;
  const lower = viText.toLowerCase();
  const matchedTerms: string[] = [];

  for (const [viKey, enVal] of Object.entries(VIETNAMESE_TO_ENGLISH_VISUAL_MAP)) {
    if (lower.includes(viKey)) {
      matchedTerms.push(enVal);
      if (matchedTerms.length >= 2) break;
    }
  }

  return matchedTerms.length > 0 ? matchedTerms.join(' ') : null;
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
        ].includes(w.toLowerCase())
    )
    .slice(0, 5)
    .join(' ');
}

/**
 * TIER 0: Search Wikimedia Commons for REAL HD Video Footage (.webm / .mp4 / .ogv)
 * matching the scene's subject so the scene renders live motion video!
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
      )}&gsrnamespace=6&prop=imageinfo&iiprop=url|mime|dimensions|size&gsrlimit=12&format=json&origin=*`;

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

        // Only accept browser-playable WebM or MP4 video streams under 38MB for fast loading
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

        // Exclude spoken interviews, animations of diagrams, maps, or logos
        if (
          title.includes('interview') ||
          title.includes('speech') ||
          title.includes('lecture') ||
          title.includes('tutorial') ||
          title.includes('screencast') ||
          title.includes('diagram') ||
          title.includes('map')
        ) {
          return;
        }

        let score = 0;
        let matchedTokens = 0;
        for (const token of queryTokens) {
          if (title.includes(token)) {
            matchedTokens++;
            score += 20;
          }
        }
        if (matchedTokens === 0) return;

        const aspect = width / height;
        if (aspect >= 1.25 && aspect <= 2.2) {
          score += 30;
        }

        // Prefer compact fast-streaming HD clips (1MB - 18MB)
        if (size > 500_000 && size < 18_000_000) {
          score += 15;
        }

        if (usedUrls && usedUrls.has(url)) {
          score -= 150;
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

      const valid = candidates.filter((c) => c.score > 0);
      if (valid.length === 0) return null;

      valid.sort((a, b) => b.score - a.score);
      const chosenUrl = valid[0].url;
      if (usedUrls) usedUrls.add(chosenUrl);
      return chosenUrl;
    } catch {
      return null;
    }
  };

  const queries: string[] = [];
  const mappedVi = extractVisualKeywordsFromVietnamese(narrationVi || '');
  const cleanedEn = sanitizeSearchKeywords(keyword || '');

  if (cleanedEn) {
    const words = cleanedEn.split(' ');
    if (words.length >= 2) {
      queries.push(words.slice(0, 2).join(' '));
    }
    queries.push(cleanedEn);
  }
  if (mappedVi) {
    const viWords = mappedVi.split(' ').slice(0, 2).join(' ');
    if (viWords && !queries.includes(viWords)) {
      queries.push(viWords);
    }
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
 * TIER 1: Generate an exact story-matched 16:9 image using Gemini Image Generation
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
                    text: `Cinematic 16:9 high-resolution illustration/photography, no text, no words, no watermark, vivid storytelling composition: ${visualPromptEn}`,
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
 * TIER 2: Wikipedia Lead Article Image Search (en.wikipedia.org + vi.wikipedia.org)
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
        lowerUrl.includes('question_book')
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
 * TIER 3: Wikimedia Commons Strict Bitmap Search with relevance & landscape scoring
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
            score += 18;
          }
        }
        if (matchedTokensCount === 0) {
          score -= 25;
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
          score -= 120;
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

      const validCandidates = candidates.filter((c) => c.score > 0);
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

  const queriesToTry: string[] = [];
  const cleanedEn = sanitizeSearchKeywords(keyword || '');
  if (cleanedEn) {
    queriesToTry.push(cleanedEn);
    const words = cleanedEn.split(' ');
    if (words.length > 3) {
      queriesToTry.push(words.slice(0, 3).join(' '));
    }
    if (words.length > 2) {
      queriesToTry.push(words.slice(0, 2).join(' '));
    }
  }

  if (narrationVi) {
    const mappedFromVi = extractVisualKeywordsFromVietnamese(narrationVi);
    if (mappedFromVi && !queriesToTry.includes(mappedFromVi)) {
      queriesToTry.push(mappedFromVi);
    }
  }

  for (const q of queriesToTry) {
    const foundUrl = await trySearch(q);
    if (foundUrl) return foundUrl;
  }

  return null;
}

/**
 * Loads an image from URL with CORS anonymous and caching.
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
 * Master Multi-Tier Homologous Video & Visual Resolver:
 * Prioritizes real HD video footage (cảnh quay thật) when available,
 * combined with AI 16:9 story scenes, Wikipedia Lead Images, and Wikimedia photographs!
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
  // 0. First attempt: Real HD Video Footage (.webm / .mp4) from Wikimedia Commons
  if (preferRealVideo) {
    const realVideoUrl = await searchWikimediaVideoFootage(
      wikipediaTopicEn || keywordsEn,
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
        // If video stream fails to decode, continue seamlessly to image/AI tiers
      }
    }
  }

  const effectivePrompt =
    visualPromptEn ||
    extractVisualKeywordsFromVietnamese(narrationVi || '') ||
    keywordsEn;

  // 1. Try Gemini AI Scene Image Generation for 100% story fidelity
  if (effectivePrompt) {
    const geminiImgUrl = await generateStorySceneImage(effectivePrompt, sceneId);
    if (geminiImgUrl) {
      try {
        const img = await loadImageWithFallback(geminiImgUrl, 8000);
        return { imageUrl: geminiImgUrl, imageElement: img, sourceType: 'ai' };
      } catch {
        // continue
      }
    }
  }

  // 2. Try Curated Wikipedia Lead Image (English Wikipedia)
  const wikiTopic =
    wikipediaTopicEn ||
    extractVisualKeywordsFromVietnamese(narrationVi || '') ||
    keywordsEn.split(/\s+/).slice(0, 3).join(' ');

  if (wikiTopic) {
    const enWikiUrl = await searchWikipediaLeadImage(wikiTopic, 'en', usedUrls);
    if (enWikiUrl) {
      try {
        const img = await loadImageWithFallback(enWikiUrl, 7000);
        return { imageUrl: enWikiUrl, imageElement: img, sourceType: 'wikipedia' };
      } catch {
        // continue
      }
    }
  }

  // 3. Try Strict Wikimedia Commons Photograph Search
  const commonsUrl = await searchWikimediaCommons(keywordsEn, narrationVi, usedUrls);
  if (commonsUrl) {
    try {
      const img = await loadImageWithFallback(commonsUrl, 7000);
      return { imageUrl: commonsUrl, imageElement: img, sourceType: 'wikimedia' };
    } catch {
      // continue
    }
  }

  // 4. Try Vietnamese Wikipedia Lead Image
  if (narrationVi) {
    const viWords = narrationVi
      .replace(/[.,;!?()"]/g, '')
      .split(/\s+/)
      .slice(0, 4)
      .join(' ');
    const viWikiUrl = await searchWikipediaLeadImage(viWords, 'vi', usedUrls);
    if (viWikiUrl) {
      try {
        const img = await loadImageWithFallback(viWikiUrl, 7000);
        return { imageUrl: viWikiUrl, imageElement: img, sourceType: 'wikipedia' };
      } catch {
        // continue
      }
    }
  }

  // 5. Try Zero-Key AI Story Visual Synthesizer (1280x720 16:9)
  if (effectivePrompt) {
    try {
      const cleanPrompt = encodeURIComponent(
        `cinematic 16:9 photography illustration of ${effectivePrompt}, vivid colors, high detail, no text`
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
