import { LutStyle } from '../types';

interface WikimediaImageResult {
  url: string;
  mime: string;
  title: string;
}

const imageCache = new Map<string, HTMLImageElement>();
const proceduralCache = new Map<string, HTMLCanvasElement>();

/**
 * Searches Wikimedia Commons for royalty-free images matching the keywords
 */
export async function searchWikimediaCommons(keyword: string): Promise<string | null> {
  if (!keyword || !keyword.trim()) return null;

  try {
    const cleanKeyword = keyword
      .replace(/["'#]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 4)
      .join(' ');

    const endpoint = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      cleanKeyword
    )}&gsrnamespace=6&prop=imageinfo&iiprop=url|mime&gsrlimit=8&format=json&origin=*`;

    const res = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;

    const validImages: WikimediaImageResult[] = [];

    Object.values(pages).forEach((page: any) => {
      const info = page?.imageinfo?.[0];
      if (info && info.url && info.mime) {
        const mime = info.mime.toLowerCase();
        const url = info.url;
        // Filter out svgs, tiffs, pdfs, audio/video
        if (
          (mime.includes('jpeg') || mime.includes('png') || mime.includes('webp')) &&
          !url.endsWith('.svg') &&
          !url.endsWith('.tif') &&
          !url.endsWith('.tiff')
        ) {
          validImages.push({
            url: info.url,
            mime: info.mime,
            title: page.title || '',
          });
        }
      }
    });

    if (validImages.length > 0) {
      // Pick first or random high quality
      return validImages[0].url;
    }

    return null;
  } catch (err) {
    console.warn('Wikimedia fetch failed for keyword:', keyword, err);
    return null;
  }
}

/**
 * Loads an image from URL with CORS anonymous and caching.
 * Falls back to proxy or null if failed.
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
      // Try local proxy if running on fullstack server
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
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Image load timed out: ${imageUrl}`));
    }, timeoutMs);

    img.src = imageUrl;
  });
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
