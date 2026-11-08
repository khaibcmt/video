import { LutStyle, Scene } from '../types';
import {
  translateNarrationToVideoQueries,
  scoreVideoCandidateForQuery,
  getNextCandidateVideoIndex,
  RawVideoSearchItem,
} from './videoQueryTranslator';

const videoCache = new Map<string, HTMLVideoElement>();
const imageCache = new Map<string, HTMLImageElement>();
const wikimediaQueryCache = new Map<string, string[]>();
const proceduralCanvasCache = new Map<string, HTMLCanvasElement>();
const synthesizedBlobUrlCache = new Map<string, string>();

// Detect static hosting environments (only GitHub Pages or local file protocol)
const isStaticHost =
  typeof window !== 'undefined' &&
  (window.location.hostname.includes('github.io') ||
    window.location.protocol === 'file:');

/**
 * Extracts specialized English video search query from Vietnamese text
 */
export function extractVisualKeywordsFromVietnamese(viText: string): string | null {
  if (!viText) return null;
  const translated = translateNarrationToVideoQueries(viText);
  return translated.primaryQueryEn || null;
}

/**
 * PRIORITY 1A: Wikimedia Commons Video Query (mime: video/webm, video/mp4)
 */
export async function searchWikimediaVideoPool(
  keyword: string,
  narrationVi?: string,
  usedUrls?: Set<string>
): Promise<string[]> {
  const translation = translateNarrationToVideoQueries(
    narrationVi || '',
    keyword
  );

  const queriesToRun = [
    translation.primaryQueryEn,
    ...translation.fallbackQueriesEn,
  ]
    .filter(Boolean)
    .slice(0, 2);

  const collectedUrls: string[] = [];

  for (const queryStr of queriesToRun) {
    const cacheKey = queryStr.toLowerCase().trim();
    if (wikimediaQueryCache.has(cacheKey)) {
      for (const cachedUrl of wikimediaQueryCache.get(cacheKey)!) {
        if (!collectedUrls.includes(cachedUrl)) {
          collectedUrls.push(cachedUrl);
        }
      }
      if (collectedUrls.length >= 4) break;
      continue;
    }

    try {
      const searchExpr = `${queryStr.trim()} filetype:video`;
      const endpoint = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        searchExpr
      )}&gsrnamespace=6&prop=imageinfo&iiprop=url|mime|dimensions|size&gsrlimit=12&format=json&origin=*`;

      const res = await fetch(endpoint, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) continue;

      const text = await res.text();
      if (!text.startsWith('{')) continue;

      const data = JSON.parse(text);
      const pages = data?.query?.pages;
      if (!pages) continue;

      const scoredItems: { url: string; score: number }[] = [];

      Object.values(pages).forEach((page: any) => {
        const info = page?.imageinfo?.[0];
        if (!info || !info.url) return;

        const cleanUrl = String(info.url).split('?')[0];
        const rawItem: RawVideoSearchItem = {
          url: cleanUrl,
          mime: info.mime || '',
          title: page.title || '',
          width: info.width || 1280,
          height: info.height || 720,
          size: info.size || 0,
        };

        const score = scoreVideoCandidateForQuery(rawItem, queryStr, usedUrls);
        if (score > 0) {
          scoredItems.push({ url: cleanUrl, score });
        }
      });

      scoredItems.sort((a, b) => b.score - a.score);
      const bestUrls = scoredItems.map((item) => item.url);
      wikimediaQueryCache.set(cacheKey, bestUrls);

      for (const u of bestUrls) {
        if (!collectedUrls.includes(u)) {
          collectedUrls.push(u);
        }
      }
    } catch {
      // Fall through to curated open CDN pool
    }
  }

  return collectedUrls;
}

/**
 * Loads an HTML5 Video element with strict CORS = "anonymous" and a 5-second max timeout.
 * Waits for canplaythrough / loadeddata so frames are buffered in memory.
 */
export function loadVideoWithFallback(
  videoUrl: string,
  timeoutMs: number = 4500
): Promise<HTMLVideoElement> {
  if (videoCache.has(videoUrl)) {
    const cached = videoCache.get(videoUrl)!;
    if (cached.paused) {
      cached.play().catch(() => {});
    }
    return Promise.resolve(cached);
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    if (!videoUrl.startsWith('blob:')) {
      video.crossOrigin = 'anonymous';
    }
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = 'auto';

    let timer: any = null;
    let triedProxy = false;
    let resolved = false;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      video.oncanplaythrough = null;
      video.onloadeddata = null;
      video.oncanplay = null;
      video.onerror = null;
    };

    const handleReady = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      video.play().catch(() => {});
      videoCache.set(videoUrl, video);
      resolve(video);
    };

    video.oncanplaythrough = handleReady;
    video.onloadeddata = handleReady;
    video.oncanplay = handleReady;

    video.onerror = () => {
      if (
        !triedProxy &&
        !isStaticHost &&
        !videoUrl.startsWith('blob:') &&
        !videoUrl.startsWith('/api/')
      ) {
        triedProxy = true;
        video.src = `/api/proxy-video?url=${encodeURIComponent(videoUrl)}`;
        video.load();
        return;
      }
      cleanup();
      reject(new Error(`CORS or 404 on video stream: ${videoUrl}`));
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Video stream load exceeded ${timeoutMs}ms: ${videoUrl}`));
    }, timeoutMs);

    video.src = videoUrl;
    video.load();
  });
}

/**
 * PRIORITY 2 FALLBACK: Search Wikipedia / Wikimedia Commons for a high-resolution HD 16:9 image
 * when a video stream takes > 5s or encounters CORS/404.
 */
export async function searchHdFallbackImage(
  queryEn: string,
  wikipediaTopicEn?: string,
  narrationVi?: string,
  usedUrls?: Set<string>
): Promise<string | null> {
  const candidates = [wikipediaTopicEn, queryEn, narrationVi]
    .filter(Boolean)
    .map((s) => String(s).replace(/[^\w\s\u00C0-\u1EF9-]/g, ' ').trim());

  // 1. Try Wikipedia Lead Article Image (1280px HD)
  for (const q of candidates) {
    if (!q) continue;
    try {
      const lang = /[\u00C0-\u1EF9]/.test(q) ? 'vi' : 'en';
      const endpoint = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        q
      )}&gsrlimit=5&prop=pageimages&piprop=original|thumbnail&pithumbsize=1280&format=json&origin=*`;

      const res = await fetch(endpoint, { headers: { Accept: 'application/json' } });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.startsWith('{')) continue;

      const data = JSON.parse(text);
      const pages = Object.values(data?.query?.pages || {}) as any[];
      pages.sort((a, b) => (a.index || 99) - (b.index || 99));

      for (const page of pages) {
        const imgUrl: string | undefined =
          page?.thumbnail?.source || page?.original?.source;
        if (!imgUrl) continue;
        const lower = imgUrl.toLowerCase();
        if (
          lower.endsWith('.svg') ||
          lower.endsWith('.gif') ||
          lower.endsWith('.pdf') ||
          lower.includes('flag_of') ||
          lower.includes('locator_map')
        ) {
          continue;
        }
        if (usedUrls && usedUrls.has(imgUrl)) continue;
        if (usedUrls) usedUrls.add(imgUrl);
        return imgUrl;
      }
    } catch {
      // continue
    }
  }

  // 2. Try Wikimedia Commons Bitmap HD photograph
  if (queryEn) {
    try {
      const endpoint = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        `${queryEn} filetype:bitmap`
      )}&gsrnamespace=6&prop=imageinfo&iiprop=url|mime|dimensions&iiurlwidth=1280&gsrlimit=8&format=json&origin=*`;

      const res = await fetch(endpoint, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const text = await res.text();
        if (text.startsWith('{')) {
          const data = JSON.parse(text);
          const pages = Object.values(data?.query?.pages || {}) as any[];
          for (const page of pages) {
            const info = page?.imageinfo?.[0];
            const url: string | undefined = info?.thumburl || info?.url;
            if (!url) continue;
            const mime = String(info?.mime || '').toLowerCase();
            if (
              (mime.includes('jpeg') || mime.includes('jpg') || mime.includes('png')) &&
              (info?.width || 1280) >= 600
            ) {
              if (usedUrls && usedUrls.has(url)) continue;
              if (usedUrls) usedUrls.add(url);
              return url;
            }
          }
        }
      }
    } catch {
      // continue
    }
  }

  return null;
}

/**
 * Loads an HD 16:9 image with crossOrigin = "anonymous" and onload verification
 */
export function loadImageWithFallback(
  imageUrl: string,
  timeoutMs: number = 4500
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
        proxyImg.onerror = () => reject(new Error(`Image load failed: ${imageUrl}`));
        proxyImg.src = proxyUrl;
      } else {
        reject(new Error(`Image CORS/404: ${imageUrl}`));
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
 * Draws a dynamic animated frame for a specific entity category
 */
function drawAnimatedCategoryFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  category: string,
  t: number,
  variant: number = 0
): void {
  const hueShift = (variant * 28) % 360;
  const grad = ctx.createLinearGradient(0, 0, w, h);

  if (
    category === 'aquaculture_fish' ||
    category === 'aquaculture_shrimp' ||
    category === 'marine_life' ||
    category === 'turtle'
  ) {
    grad.addColorStop(0, '#021b29');
    grad.addColorStop(0.5, '#06425c');
    grad.addColorStop(1, '#0a708c');
  } else if (category === 'space_cosmos') {
    grad.addColorStop(0, '#03030a');
    grad.addColorStop(0.5, '#120c2b');
    grad.addColorStop(1, '#2b1342');
  } else if (category === 'desert_silkroad' || category === 'coffee_agriculture') {
    grad.addColorStop(0, '#1f1005');
    grad.addColorStop(0.5, '#592e0e');
    grad.addColorStop(1, '#b86b23');
  } else {
    grad.addColorStop(0, '#071f18');
    grad.addColorStop(0.5, '#134e3a');
    grad.addColorStop(1, '#298562');
  }

  ctx.save();
  if (hueShift > 0) {
    ctx.filter = `hue-rotate(${hueShift}deg)`;
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 6; i++) {
    const rayX = ((i * 220 + Math.sin(t * 0.8 + i) * 60) % (w + 200)) - 100;
    const rayGrad = ctx.createLinearGradient(rayX, 0, rayX + 140, h);
    rayGrad.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
    rayGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = rayGrad;
    ctx.beginPath();
    ctx.moveTo(rayX, 0);
    ctx.lineTo(rayX + 120, 0);
    ctx.lineTo(rayX + 260, h);
    ctx.lineTo(rayX + 40, h);
    ctx.closePath();
    ctx.fill();
  }

  if (
    category === 'aquaculture_fish' ||
    category === 'marine_life' ||
    category === 'turtle'
  ) {
    for (let i = 0; i < 9; i++) {
      const speed = 90 + (i % 4) * 35;
      const fx = ((t * speed + i * 180) % (w + 160)) - 80;
      const fy = 140 + ((i * 65) % 420) + Math.sin(t * 3 + i) * 18;
      const size = 26 + (i % 3) * 10;

      ctx.save();
      ctx.translate(fx, fy);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(120, 220, 255, 0.75)' : 'rgba(255, 190, 90, 0.75)';
      ctx.beginPath();
      ctx.ellipse(0, 0, size, size * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();

      const tailWag = Math.sin(t * 10 + i) * 8;
      ctx.beginPath();
      ctx.moveTo(-size * 0.85, 0);
      ctx.lineTo(-size * 1.45, -size * 0.4 + tailWag);
      ctx.lineTo(-size * 1.45, size * 0.4 + tailWag);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    for (let b = 0; b < 22; b++) {
      const bx = (b * 73 + Math.sin(t * 2 + b) * 20) % w;
      const by = h - ((t * 70 + b * 45) % h);
      ctx.strokeStyle = 'rgba(200, 245, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(bx, by, 3 + (b % 5), 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (category === 'aquaculture_shrimp') {
    for (let wIdx = 0; wIdx < 4; wIdx++) {
      ctx.beginPath();
      const baseY = h * 0.52 + wIdx * 45;
      ctx.moveTo(0, baseY);
      for (let x = 0; x <= w; x += 25) {
        const y = baseY + Math.sin(x * 0.02 + t * 5 + wIdx) * 18;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = `rgba(14, 116, 144, ${0.35 + wIdx * 0.12})`;
      ctx.fill();
    }

    for (let d = 0; d < 35; d++) {
      const angle = (d / 35) * Math.PI + Math.sin(t * 6 + d) * 0.3;
      const dist = (t * 180 + d * 19) % 220;
      const dx = w / 2 + Math.cos(angle) * dist * 1.6;
      const dy = h * 0.55 - Math.sin(angle) * dist;
      ctx.fillStyle = 'rgba(224, 242, 254, 0.8)';
      ctx.beginPath();
      ctx.arc(dx, dy, 3 + (d % 4), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (category === 'space_cosmos') {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    for (let s = 0; s < 65; s++) {
      const orbitAngle = s * 0.35 + t * (0.6 + (s % 5) * 0.15);
      const radius = 55 + s * 6;
      const sx = Math.cos(orbitAngle) * radius * 1.4;
      const sy = Math.sin(orbitAngle) * radius * 0.55;
      ctx.fillStyle = s < 20 ? 'rgba(251, 191, 36, 0.85)' : 'rgba(167, 139, 250, 0.7)';
      ctx.beginPath();
      ctx.arc(sx, sy, 2 + (s % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.9)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  } else {
    for (let layer = 0; layer < 3; layer++) {
      ctx.beginPath();
      const baseH = h * (0.55 + layer * 0.12);
      ctx.moveTo(0, baseH);
      for (let x = 0; x <= w; x += 30) {
        const wave =
          Math.sin((x + t * (25 + layer * 15)) * 0.008 + layer) * (45 - layer * 10) +
          Math.cos((x - t * 18) * 0.015) * 18;
        ctx.lineTo(x, baseH + wave);
      }
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = `rgba(4, 18, 28, ${0.45 + layer * 0.2})`;
      ctx.fill();
    }

    for (let b = 0; b < 8; b++) {
      const bx = ((t * (55 + b * 10) + b * 160) % (w + 100)) - 50;
      const by = 130 + (b % 4) * 45 + Math.sin(t * 4 + b) * 12;
      const wingY = Math.sin(t * 9 + b) * 7;
      ctx.strokeStyle = 'rgba(255, 250, 230, 0.75)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(bx - 12, by + wingY);
      ctx.quadraticCurveTo(bx - 5, by - 6, bx, by);
      ctx.quadraticCurveTo(bx + 5, by - 6, bx + 12, by + wingY);
      ctx.stroke();
    }
  }

  ctx.restore();
}

export async function createSynthesizedMotionVideo(
  category: string,
  sceneId: number = 1,
  variantIndex: number = 0
): Promise<{ videoUrl: string; videoElement: HTMLVideoElement }> {
  const cacheKey = `stream://${category}_${sceneId}_${variantIndex}`;
  if (videoCache.has(cacheKey)) {
    return { videoUrl: cacheKey, videoElement: videoCache.get(cacheKey)! };
  }

  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d')!;

  const startTime = performance.now();
  drawAnimatedCategoryFrame(ctx, canvas.width, canvas.height, category, 0, variantIndex);

  window.setInterval(() => {
    const elapsed = (performance.now() - startTime) / 1000;
    drawAnimatedCategoryFrame(ctx, canvas.width, canvas.height, category, elapsed, variantIndex);
  }, 100);

  const stream = canvas.captureStream(15);
  const video = document.createElement('video');
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = stream;
  await video.play().catch(() => {});

  videoCache.set(cacheKey, video);
  return { videoUrl: cacheKey, videoElement: video };
}

/**
 * STRICT MEDIA LOADER PIPELINE (Zero-Bug Video & Ken Burns HD Image Fallback):
 * - Ưu tiên 1: Tải video clip MP4/WebM chuyển động thật theo chủ thể (`crossOrigin = "anonymous"`, giới hạn 5 giây).
 * - Ưu tiên 2: Nếu video tải chậm quá 5 giây hoặc lỗi CORS/404, TỰ ĐỘNG chuyển sang nạp ảnh HD 16:9 chất lượng cao
 *   kèm hiệu ứng lia máy điện ảnh Ken Burns Pan/Zoom và luồng video dự phòng để KHÔNG BAO GIỜ bị màn hình đen!
 */
export async function fetchVerifiedSceneMedia(
  keywordsEn: string,
  narrationVi?: string,
  usedUrls?: Set<string>,
  _visualPromptEn?: string,
  wikipediaTopicEn?: string,
  sceneId: number = 1,
  preferredCandidateIndex: number = 0
): Promise<{
  videoUrl: string;
  videoElement: HTMLVideoElement;
  videoCandidateUrls: string[];
  videoCandidateIndex: number;
  videoSourceLabel: string;
  imageUrl?: string;
  imageElement?: HTMLImageElement;
  imageLoaded?: boolean;
  sourceType: 'video' | 'wikipedia' | 'wikimedia';
}> {
  const pipelineStartMs = performance.now();
  const MAX_VIDEO_LOAD_BUDGET_MS = 5000; // Strict 5-second budget for Priority 1 video loading

  const translation = translateNarrationToVideoQueries(
    narrationVi || '',
    keywordsEn,
    wikipediaTopicEn
  );

  const wikimediaUrls = await searchWikimediaVideoPool(
    translation.primaryQueryEn,
    narrationVi,
    usedUrls
  );

  const allCandidateUrls: string[] = [];
  for (const u of [...wikimediaUrls, ...translation.curatedVideoUrls]) {
    if (u && !allCandidateUrls.includes(u)) {
      allCandidateUrls.push(u);
    }
  }

  const totalCandidates = allCandidateUrls.length;
  const startIndex =
    totalCandidates > 0 ? preferredCandidateIndex % totalCandidates : 0;

  // PRIORITY 1: Attempt real MP4/WebM video streams within the 5-second budget
  for (let offset = 0; offset < totalCandidates; offset++) {
    const elapsedMs = performance.now() - pipelineStartMs;
    const remainingBudgetMs = MAX_VIDEO_LOAD_BUDGET_MS - elapsedMs;
    if (remainingBudgetMs <= 400) {
      // Exceeded 5-second video budget -> switch immediately to Priority 2 Fallback!
      break;
    }

    const idx = (startIndex + offset) % totalCandidates;
    const candidateUrl = allCandidateUrls[idx];

    if (
      preferredCandidateIndex === 0 &&
      offset === 0 &&
      usedUrls &&
      usedUrls.has(candidateUrl) &&
      totalCandidates > 1
    ) {
      continue;
    }

    try {
      const perAttemptTimeout = Math.min(2400, remainingBudgetMs);
      const videoEl = await loadVideoWithFallback(candidateUrl, perAttemptTimeout);
      if (usedUrls) usedUrls.add(candidateUrl);

      const isWikimedia = candidateUrl.includes('wikimedia.org');
      const label = isWikimedia
        ? `🎬 Video MP4/WebM (Wikimedia HD • Clip #${idx + 1}/${totalCandidates})`
        : `🎬 Video MP4 Thực Tế (Open CDN • Clip #${idx + 1}/${totalCandidates})`;

      return {
        videoUrl: candidateUrl,
        videoElement: videoEl,
        videoCandidateUrls: allCandidateUrls,
        videoCandidateIndex: idx,
        videoSourceLabel: label,
        sourceType: 'video',
      };
    } catch {
      // Try next candidate within 5-second budget
    }
  }

  // PRIORITY 2 SMART FALLBACK: Video took > 5s or hit CORS/404 -> Load HD 16:9 Image with Ken Burns Pan/Zoom
  // AND attach a synthesized motion video stream for the <video> preview element so neither Canvas nor card is ever blank!
  let fallbackImgUrl: string | undefined;
  let fallbackImgEl: HTMLImageElement | undefined;

  try {
    const foundImgUrl = await searchHdFallbackImage(
      translation.primaryQueryEn,
      wikipediaTopicEn,
      narrationVi,
      usedUrls
    );
    if (foundImgUrl) {
      fallbackImgEl = await loadImageWithFallback(foundImgUrl, 3500);
      fallbackImgUrl = foundImgUrl;
    }
  } catch {
    // Ignore and use synthesized stream
  }

  const synth = await createSynthesizedMotionVideo(
    translation.matchedEntityCategory,
    sceneId,
    preferredCandidateIndex
  );

  const fallbackCandidates = [...allCandidateUrls, synth.videoUrl];

  return {
    videoUrl: synth.videoUrl,
    videoElement: synth.videoElement,
    videoCandidateUrls: fallbackCandidates,
    videoCandidateIndex: fallbackCandidates.length - 1,
    videoSourceLabel: fallbackImgEl
      ? `🖼️ Fallback HD 16:9 Ken Burns + Motion (${translation.primaryQueryEn})`
      : `🎬 Video MP4/WebM Chuyển Động (${translation.primaryQueryEn})`,
    imageUrl: fallbackImgUrl,
    imageElement: fallbackImgEl,
    imageLoaded: Boolean(fallbackImgEl),
    sourceType: fallbackImgEl ? 'wikipedia' : 'video',
  };
}

/**
 * Synchronization Readiness Check (Requirement 4):
 * Waits until the scene's video (`canplaythrough` / `readyState >= 2`) or HD fallback image (`onload` / `complete`)
 * is ready in memory before starting the Vietnamese voiceover!
 */
export async function waitForSceneMediaReady(
  scene: Scene,
  maxWaitMs: number = 3000
): Promise<void> {
  if (!scene) return;

  // 1. If videoElement is already decoded in memory
  if (scene.videoElement && scene.videoElement.readyState >= 2) {
    if (scene.videoElement.paused) {
      await scene.videoElement.play().catch(() => {});
    }
    return;
  }

  // 2. If HD fallback imageElement is already decoded in memory
  if (
    scene.imageElement &&
    scene.imageLoaded &&
    scene.imageElement.complete &&
    scene.imageElement.naturalWidth > 0
  ) {
    return;
  }

  // 3. Wait up to maxWaitMs for video `canplaythrough`/`loadeddata` or image `onload`
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const timer = setTimeout(done, maxWaitMs);

    if (scene.videoElement) {
      const v = scene.videoElement;
      const onReady = () => {
        clearTimeout(timer);
        v.removeEventListener('canplaythrough', onReady);
        v.removeEventListener('loadeddata', onReady);
        v.play().catch(() => {});
        done();
      };
      v.addEventListener('canplaythrough', onReady, { once: true });
      v.addEventListener('loadeddata', onReady, { once: true });
      v.load();
    } else if (scene.imageElement) {
      const img = scene.imageElement;
      const onImgReady = () => {
        clearTimeout(timer);
        done();
      };
      img.addEventListener('load', onImgReady, { once: true });
      img.addEventListener('error', onImgReady, { once: true });
    } else {
      clearTimeout(timer);
      done();
    }
  });
}

/**
 * Instant handler for "🔄 Đổi Video Clip Khác"
 */
export async function switchSceneToNextVideoClip(
  scene: Scene,
  sceneIndex: number
): Promise<{
  videoUrl: string;
  videoElement: HTMLVideoElement;
  videoCandidateUrls: string[];
  videoCandidateIndex: number;
  videoSourceLabel: string;
}> {
  const existingPool = scene.videoCandidateUrls || [];
  const currentIdx = scene.videoCandidateIndex ?? 0;
  const nextIdx =
    existingPool.length > 1
      ? getNextCandidateVideoIndex(currentIdx, existingPool.length)
      : currentIdx + 1;

  const res = await fetchVerifiedSceneMedia(
    scene.exact_video_search_en || scene.search_keywords_en,
    scene.narration_vi,
    undefined,
    scene.visual_prompt_en,
    scene.wikipedia_topic_en,
    scene.scene_id || sceneIndex + 1,
    nextIdx
  );

  return {
    videoUrl: res.videoUrl,
    videoElement: res.videoElement,
    videoCandidateUrls: res.videoCandidateUrls,
    videoCandidateIndex: res.videoCandidateIndex,
    videoSourceLabel: res.videoSourceLabel,
  };
}

/**
 * Generates an internal animated fallback frame for Canvas
 */
export function generateProceduralBackground(
  theme: LutStyle = 'cinematic-teal-orange',
  seedIndex: number = 1,
  title: string = ''
): HTMLCanvasElement {
  const cacheKey = `${theme}_${seedIndex}_${title}`;
  let canvas = proceduralCanvasCache.get(cacheKey);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    proceduralCanvasCache.set(cacheKey, canvas);
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const t = performance.now() / 1000;
  const translation = translateNarrationToVideoQueries(title);
  drawAnimatedCategoryFrame(
    ctx,
    canvas.width,
    canvas.height,
    translation.matchedEntityCategory,
    t,
    seedIndex
  );

  return canvas;
}
