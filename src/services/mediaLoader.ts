import { LutStyle } from '../types';

interface WikimediaImageResult {
  url: string;
  thumbUrl: string;
  mime: string;
  title: string;
  width: number;
  height: number;
  score: number;
}

const imageCache = new Map<string, HTMLImageElement>();
const proceduralCache = new Map<string, HTMLCanvasElement>();

// Detect static hosting environments (like GitHub Pages)
const isStaticHost =
  typeof window !== 'undefined' &&
  (window.location.hostname.includes('github.io') ||
    window.location.protocol === 'file:' ||
    (window.location.port !== '3000' && !window.location.hostname.includes('run.app')));

/**
 * Dictionary of common Vietnamese topic keywords mapped to precise English photographic search terms
 * so that even if Vietnamese words appear or fallback is needed, the search finds exact imagery.
 */
const VIETNAMESE_TO_ENGLISH_VISUAL_MAP: Record<string, string> = {
  'hạ long': 'Ha Long Bay limestone islands',
  'vịnh hạ long': 'Ha Long Bay limestone islands',
  'thiên cung': 'Thien Cung Cave stalactites',
  'sửng sốt': 'Sung Sot Cave Ha Long',
  'làng chài': 'floating fishing village Vietnam',
  'rùa': 'sea turtle swimming ocean',
  'con rùa': 'tortoise turtle nature',
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
  'lạc đà': 'camel caravan Sahara desert dunes',
  'sa mạc': 'sand dunes desert sunset',
  'hố đen': 'black hole accretion disk space',
  'vũ trụ': 'deep space galaxy nebula stars',
  'ngân hà': 'Milky Way galaxy night sky',
  'mặt trời': 'Sun solar flare astronomy',
  'trái đất': 'Planet Earth from space',
  'mặt trăng': 'Full Moon craters astronomy',
  'rừng': 'tropical rainforest canopy nature',
  'biển': 'turquoise ocean waves coral reef',
  'đại dương': 'deep blue ocean marine life',
  'núi': 'majestic mountain peaks clouds',
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
 * Extracts fallback English visual keywords from Vietnamese text if primary keywords are too generic
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
 * Cleans and normalizes English search keywords for Wikimedia Commons
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
        ].includes(w.toLowerCase())
    )
    .slice(0, 5)
    .join(' ');
}

/**
 * Searches Wikimedia Commons for relevant, landscape-oriented photographs matching the scene's content.
 * Avoids reused URLs via `usedUrls` set so every scene gets a distinct, relevant visual.
 */
export async function searchWikimediaCommons(
  keyword: string,
  narrationVi?: string,
  usedUrls?: Set<string>
): Promise<string | null> {
  const trySearch = async (queryStr: string): Promise<string | null> => {
    if (!queryStr || !queryStr.trim()) return null;
    try {
      // Request filetype:bitmap to strictly get real photographs (no SVGs, PDFs, or audio)
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

        // Skip non-photo formats, icons, maps, diagrams, logos, stamps, signatures
        if (
          url.endsWith('.svg') ||
          url.endsWith('.tif') ||
          url.endsWith('.tiff') ||
          url.endsWith('.gif') ||
          url.endsWith('.ogg') ||
          url.endsWith('.webm') ||
          url.endsWith('.pdf') ||
          title.includes('icon') ||
          title.includes('logo') ||
          title.includes('map of') ||
          title.includes('locator') ||
          title.includes('diagram') ||
          title.includes('chart') ||
          title.includes('signature') ||
          title.includes('coat of arms') ||
          title.includes('flag of') ||
          title.includes('stamp') ||
          !(mime.includes('jpeg') || mime.includes('jpg') || mime.includes('png') || mime.includes('webp'))
        ) {
          return;
        }

        // Skip tiny images
        if (width < 500 || height < 350) return;

        // Calculate relevance & cinematic aspect ratio score
        let score = 0;

        // Prefer landscape orientation (width >= height) for 16:9 video canvas
        const aspect = width / height;
        if (aspect >= 1.25 && aspect <= 2.2) {
          score += 30; // Ideal 16:9 / 4:3 / 3:2 landscape photograph
        } else if (aspect >= 1.0) {
          score += 10;
        } else {
          score -= 15; // Portrait images get lower priority
        }

        // Prefer JPEG photographs over PNG graphics
        if (mime.includes('jpeg') || mime.includes('jpg')) {
          score += 15;
        }

        // Match query tokens in file title
        for (const token of queryTokens) {
          if (title.includes(token)) {
            score += 12;
          }
        }

        // Penalize already-used URLs so consecutive scenes don't show identical photos
        if (usedUrls && (usedUrls.has(url) || usedUrls.has(info.url))) {
          score -= 100;
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

      if (candidates.length === 0) return null;

      // Sort by highest relevance & landscape score
      candidates.sort((a, b) => b.score - a.score);
      const chosen = candidates[0].thumbUrl || candidates[0].url;
      if (usedUrls) {
        usedUrls.add(chosen);
        usedUrls.add(candidates[0].url);
      }
      return chosen;
    } catch {
      return null;
    }
  };

  // Build progressive search queries from most specific to broader visual nouns
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

  // Also check Vietnamese narration for direct visual subject mapping
  if (narrationVi) {
    const mappedFromVi = extractVisualKeywordsFromVietnamese(narrationVi);
    if (mappedFromVi && !queriesToTry.includes(mappedFromVi)) {
      queriesToTry.push(mappedFromVi);
    }
  }

  // Last-resort single main noun if multi-word queries returned nothing
  if (cleanedEn) {
    const firstTwo = cleanedEn.split(' ').slice(0, 2).join(' ');
    if (firstTwo && !queriesToTry.includes(firstTwo)) {
      queriesToTry.push(firstTwo);
    }
    const mainNoun = cleanedEn.split(' ').find((w) => w.length >= 4);
    if (mainNoun && !queriesToTry.includes(mainNoun)) {
      queriesToTry.push(mainNoun);
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
 * On static hosts (GitHub Pages), skips failing local proxy calls and falls back cleanly.
 */
export function loadImageWithFallback(
  imageUrl: string,
  timeoutMs: number = 7000
): Promise<HTMLImageElement> {
  if (imageCache.has(imageUrl)) {
    return Promise.resolve(imageCache.get(imageUrl)!);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

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

      // Attempt local proxy if running on fullstack Node.js server
      if (!isStaticHost) {
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
 * Searches and loads a verified working HTMLImageElement for a scene.
 * If the first image fails to load, tries alternative search queries before falling back.
 */
export async function fetchVerifiedSceneMedia(
  keywordsEn: string,
  narrationVi?: string,
  usedUrls?: Set<string>
): Promise<{ imageUrl: string; imageElement: HTMLImageElement } | null> {
  const firstUrl = await searchWikimediaCommons(keywordsEn, narrationVi, usedUrls);
  if (firstUrl) {
    try {
      const img = await loadImageWithFallback(firstUrl);
      return { imageUrl: firstUrl, imageElement: img };
    } catch {
      // First image failed to decode or timed out; try next candidate
    }
  }

  // Second attempt with Vietnamese visual mapping or simplified keywords
  const backupQuery =
    extractVisualKeywordsFromVietnamese(narrationVi || '') ||
    keywordsEn.split(/\s+/).slice(0, 2).join(' ');

  if (backupQuery) {
    const secondUrl = await searchWikimediaCommons(backupQuery, undefined, usedUrls);
    if (secondUrl) {
      try {
        const img = await loadImageWithFallback(secondUrl);
        return { imageUrl: secondUrl, imageElement: img };
      } catch {
        return null;
      }
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
