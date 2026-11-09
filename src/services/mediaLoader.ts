import {
  LutStyle,
  Scene,
  SceneVisualMode,
  SubjectOption,
  VisualBeat,
  VisualFallbackStage,
} from '../types';
import {
  translateNarrationToVideoQueries,
  scoreVideoCandidateForQuery,
  getNextCandidateVideoIndex,
  RawVideoSearchItem,
} from './videoQueryTranslator';
import { keyRotationEngine } from './keyRotation';
import { selfHealingVisualEngine } from './selfHealingVisualEngine';

const videoCache = new Map<string, HTMLVideoElement>();
const imageCache = new Map<string, HTMLImageElement>();
const wikimediaQueryCache = new Map<string, string[]>();
const proceduralCanvasCache = new Map<string, HTMLCanvasElement>();

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
 * Queries Pexels / Pixabay HD MP4 Video APIs when API keys are configured in KeyManagerModal
 */
export async function searchPexelsOrPixabayVideos(
  queries: string[],
  usedUrls?: Set<string>
): Promise<string[]> {
  const extKeys = keyRotationEngine.getExternalKeys();
  const pexelsKey = extKeys.pexelsApiKey?.trim();
  const pixabayKey = extKeys.pixabayApiKey?.trim();
  if (!pexelsKey && !pixabayKey) return [];

  const foundUrls: string[] = [];
  const primaryQuery = queries.find(Boolean) || 'nature science';

  if (pexelsKey) {
    try {
      const res = await fetch(
        `https://api.pexels.com/videos/search?query=${encodeURIComponent(
          primaryQuery
        )}&orientation=landscape&size=medium&per_page=4`,
        {
          headers: { Authorization: pexelsKey },
        }
      );
      if (res.ok) {
        const data = await res.json();
        for (const vid of data?.videos || []) {
          const files: any[] = vid?.video_files || [];
          const hdFile =
            files.find(
              (f) =>
                f.file_type === 'video/mp4' &&
                f.width >= 1280 &&
                f.width <= 1920
            ) || files.find((f) => f.file_type === 'video/mp4');
          if (hdFile?.link && (!usedUrls || !usedUrls.has(hdFile.link))) {
            foundUrls.push(hdFile.link);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  if (pixabayKey && foundUrls.length < 2) {
    try {
      const res = await fetch(
        `https://pixabay.com/api/videos/?key=${encodeURIComponent(
          pixabayKey
        )}&q=${encodeURIComponent(primaryQuery)}&per_page=4`
      );
      if (res.ok) {
        const data = await res.json();
        for (const hit of data?.hits || []) {
          const url = hit?.videos?.medium?.url || hit?.videos?.small?.url;
          if (url && (!usedUrls || !usedUrls.has(url))) {
            foundUrls.push(url);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return foundUrls;
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
  variantIndex: number = 0,
  options?: {
    stage?: VisualFallbackStage;
    imageElement?: HTMLImageElement;
    sceneContext?: Partial<Scene>;
  }
): Promise<{ videoUrl: string; videoElement: HTMLVideoElement }> {
  const stage = options?.stage || 3;
  const hasImg = Boolean(options?.imageElement);
  const cacheKey = `stream://${category}_${sceneId}_${variantIndex}_s${stage}_${hasImg ? 'img' : 'proc'}`;
  if (videoCache.has(cacheKey)) {
    return { videoUrl: cacheKey, videoElement: videoCache.get(cacheKey)! };
  }

  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d')!;

  const startTime = performance.now();
  const mockScene: Scene = {
    scene_id: sceneId,
    title: options?.sceneContext?.title || `Phân cảnh ${sceneId}`,
    subject: options?.sceneContext?.subject || 'Sinh học',
    pedagogical_section:
      options?.sceneContext?.pedagogical_section || 'Kiến thức trọng tâm',
    narration_vi:
      options?.sceneContext?.narration_vi ||
      options?.sceneContext?.title ||
      'Nội dung bài giảng sư phạm',
    narration_normalized:
      options?.sceneContext?.narration_normalized || '',
    search_keywords_en: category,
    pedagogical_badge:
      options?.sceneContext?.pedagogical_badge || 'Kiến thức trọng tâm',
    camera_motion: options?.sceneContext?.camera_motion || 'zoom-in',
    lut_style: options?.sceneContext?.lut_style || 'cinematic-teal-orange',
    duration_seconds: 10,
  };

  const drawPreviewTick = (elapsedSec: number) => {
    const localProgress = (elapsedSec % 8) / 8;
    if (stage === 2 && options?.imageElement) {
      selfHealingVisualEngine.render25DParallaxScene(
        ctx,
        canvas.width,
        canvas.height,
        options.imageElement,
        mockScene.camera_motion,
        localProgress,
        elapsedSec
      );
      selfHealingVisualEngine.renderProceduralEnvironmentParticles(
        ctx,
        canvas.width,
        canvas.height,
        mockScene.subject || 'Sinh học',
        elapsedSec,
        mockScene.narration_vi
      );
    } else if (stage === 3) {
      ctx.save();
      ctx.scale(0.5, 0.5);
      selfHealingVisualEngine.renderProceduralMotionGraphics(
        ctx,
        1280,
        720,
        mockScene,
        undefined,
        elapsedSec,
        localProgress
      );
      ctx.restore();
    } else {
      drawAnimatedCategoryFrame(ctx, canvas.width, canvas.height, category, elapsedSec, variantIndex);
    }
  };

  drawPreviewTick(0);

  window.setInterval(() => {
    const elapsed = (performance.now() - startTime) / 1000;
    drawPreviewTick(elapsed);
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
 * 4-STAGE SELF-HEALING VISUAL FALLBACK ENGINE (`fetchVerifiedSceneMedia`):
 * - BƯỚC 1: Truy vấn lùi đa cấp (Multi-Query Relaxation) từ chi tiết đến tổng quát,
 *           mỗi link MP4 giới hạn 2.5 giây qua AbortController, tổng thời gian Bước 1 tối đa 3.5 giây.
 * - BƯỚC 2: Nếu Bước 1 không có video khớp chủ đề hoặc quá 3.5 giây (hoặc ở Chế độ Tự chủ AI 2.5D),
 *           tự động nạp Ảnh AI HD 1280x720 từ `ai_visual_prompt` (Pollinations Flux / Documentary HD)
 *           + Lớp Camera 3D Parallax + Lớp Môi trường Vật lý theo môn học (Bọt khí O2/Tia sáng nước hoặc Mạng phân tử/Đường sức).
 * - BƯỚC 3: Nếu sau 5 giây cả Video lẫn Ảnh AI đều không tải được (mất mạng/quá tải) hoặc chọn chế độ Sơ đồ VTV7,
 *           tự động kích hoạt Đồ họa Chuyển động Sư phạm Nội sinh (`renderProceduralMotionGraphics` chuẩn VTV7).
 */
export async function fetchVerifiedSceneMedia(
  keywordsEn: string,
  narrationVi?: string,
  usedUrls?: Set<string>,
  visualPromptEn?: string,
  wikipediaTopicEn?: string,
  sceneId: number = 1,
  preferredCandidateIndex: number = 0,
  options?: {
    forcedMode?: SceneVisualMode;
    subject?: SubjectOption;
    pedagogicalBadge?: string;
    pedagogicalSection?: string;
    title?: string;
    rankedQueries?: string[];
  }
): Promise<{
  videoUrl: string;
  videoElement: HTMLVideoElement;
  videoCandidateUrls: string[];
  videoCandidateIndex: number;
  videoSourceLabel: string;
  imageUrl?: string;
  imageElement?: HTMLImageElement;
  imageLoaded?: boolean;
  fallbackStage: VisualFallbackStage;
  visualMode: SceneVisualMode;
  sourceType: 'video' | 'ai' | 'wikipedia' | 'wikimedia' | 'procedural';
}> {
  const pipelineStartMs = performance.now();
  const STAGE1_MAX_BUDGET_MS = 3500; // Strict 3.5-second max budget for Stage 1 Video Query
  const PER_VIDEO_ABORT_TIMEOUT_MS = 2500; // Strict 2.5-second AbortController timeout per video link

  const forcedMode: SceneVisualMode =
    options?.forcedMode ||
    (selfHealingVisualEngine.getEngineMode() === 'ai-25d-autonomous'
      ? 'ai-25d'
      : 'auto');
  const subject: SubjectOption = options?.subject || 'Sinh học';

  const translation = translateNarrationToVideoQueries(
    narrationVi || '',
    keywordsEn,
    wikipediaTopicEn
  );

  // Build ranked queries (3 tiers from most specific to general)
  const rankedQueries = (
    options?.rankedQueries && options.rankedQueries.length > 0
      ? options.rankedQueries
      : [
          keywordsEn,
          translation.primaryQueryEn,
          ...(translation.fallbackQueriesEn || []),
        ]
  )
    .filter(Boolean)
    .slice(0, 3);

  const allCandidateUrls: string[] = [];

  // ============================================================================
  // BƯỚC 1: TRUY VẤN LÙI ĐA CẤP & CẮT TIMEOUT NHANH (TỐI ĐA 3.5 GIÂY)
  // ============================================================================
  if (forcedMode === 'auto' || forcedMode === 'video') {
    try {
      const searchRace = Promise.all([
        searchPexelsOrPixabayVideos(rankedQueries, usedUrls),
        searchWikimediaVideoPool(rankedQueries[0] || translation.primaryQueryEn, narrationVi, usedUrls),
      ]);
      const timeoutSearch = new Promise<[string[], string[]]>((resolve) =>
        setTimeout(() => resolve([[], []]), 2200)
      );

      const [externalVideoUrls, wikimediaUrls] = await Promise.race([
        searchRace,
        timeoutSearch,
      ]);

      for (const u of [
        ...externalVideoUrls,
        ...wikimediaUrls,
        ...translation.curatedVideoUrls,
      ]) {
        if (u && !allCandidateUrls.includes(u)) {
          allCandidateUrls.push(u);
        }
      }
    } catch {
      // Fall through to Stage 2
    }

    const totalCandidates = allCandidateUrls.length;
    const startIndex =
      totalCandidates > 0 ? preferredCandidateIndex % totalCandidates : 0;

    for (let offset = 0; offset < totalCandidates; offset++) {
      const elapsedMs = performance.now() - pipelineStartMs;
      const remainingStage1Ms = STAGE1_MAX_BUDGET_MS - elapsedMs;
      if (remainingStage1Ms <= 250) {
        // Exceeded 3.5s budget -> immediately switch to Stage 2 (AI Scene + 2.5D Physics)!
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
        const perLinkTimeout = Math.min(PER_VIDEO_ABORT_TIMEOUT_MS, remainingStage1Ms);
        const videoEl = await selfHealingVisualEngine.loadVideoWithAbortTimeout(
          candidateUrl,
          perLinkTimeout
        );
        if (usedUrls) usedUrls.add(candidateUrl);

        const isWikimedia = candidateUrl.includes('wikimedia.org');
        const label = isWikimedia
          ? `🎬 [Bước 1] Video MP4/WebM Thật (Wikimedia HD • Clip #${idx + 1}/${totalCandidates})`
          : `🎬 [Bước 1] Video MP4 Thực Tế (${rankedQueries[0]} • Clip #${idx + 1}/${totalCandidates})`;

        return {
          videoUrl: candidateUrl,
          videoElement: videoEl,
          videoCandidateUrls: allCandidateUrls,
          videoCandidateIndex: idx,
          videoSourceLabel: label,
          fallbackStage: 1,
          visualMode: 'video',
          sourceType: 'video',
        };
      } catch {
        // AbortController triggered or CORS/404 -> immediately try next link
      }
    }
  }

  // ============================================================================
  // BƯỚC 2: SINH CẢNH AI ĐÚNG MÔ TẢ + LỚP VẬT LÝ CHUYỂN ĐỘNG 2.5D (KHI KHÔNG CÓ VIDEO THẬT)
  // ============================================================================
  if (forcedMode !== 'vtv7-graphics') {
    const seed = sceneId * 137 + preferredCandidateIndex * 31 + 19;
    const aiSceneUrl = selfHealingVisualEngine.buildAiSceneUrl(
      visualPromptEn || narrationVi || keywordsEn,
      rankedQueries[0] || translation.primaryQueryEn,
      subject,
      seed
    );

    let loadedStage2Img: HTMLImageElement | undefined;
    let loadedStage2Url: string | undefined;

    // Race Pollinations Flux HD AI Image and Topic-Matched Documentary HD Image within remaining 5s window
    try {
      loadedStage2Img = await loadImageWithFallback(aiSceneUrl, 3400);
      loadedStage2Url = aiSceneUrl;
    } catch {
      try {
        const docImgUrl = await searchHdFallbackImage(
          rankedQueries[0] || translation.primaryQueryEn,
          wikipediaTopicEn,
          narrationVi,
          usedUrls
        );
        if (docImgUrl) {
          loadedStage2Img = await loadImageWithFallback(docImgUrl, 2400);
          loadedStage2Url = docImgUrl;
        }
      } catch {
        // Proceed to Stage 3 VTV7 Motion Graphics
      }
    }

    if (loadedStage2Img) {
      const synth25D = await createSynthesizedMotionVideo(
        translation.matchedEntityCategory,
        sceneId,
        preferredCandidateIndex,
        {
          stage: 2,
          imageElement: loadedStage2Img,
          sceneContext: {
            title: options?.title || rankedQueries[0],
            subject,
            narration_vi: narrationVi,
            pedagogical_badge: options?.pedagogicalBadge,
            pedagogical_section: options?.pedagogicalSection,
          },
        }
      );

      return {
        videoUrl: synth25D.videoUrl,
        videoElement: synth25D.videoElement,
        videoCandidateUrls: [...allCandidateUrls, synth25D.videoUrl],
        videoCandidateIndex: allCandidateUrls.length,
        videoSourceLabel: `🎨 [Bước 2] Cảnh AI HD + Vật Lý 2.5D (${subject} • ${rankedQueries[0]})`,
        imageUrl: loadedStage2Url,
        imageElement: loadedStage2Img,
        imageLoaded: true,
        fallbackStage: 2,
        visualMode: 'ai-25d',
        sourceType: 'ai',
      };
    }
  }

  // ============================================================================
  // BƯỚC 3: VIDEO ĐỒ HỌA CHUYỂN ĐỘNG SƯ PHẠM NỘI SINH (CHUẨN VTV7 MOTION GRAPHICS)
  // ============================================================================
  const synthStage3 = await createSynthesizedMotionVideo(
    translation.matchedEntityCategory,
    sceneId,
    preferredCandidateIndex,
    {
      stage: 3,
      sceneContext: {
        title: options?.title || rankedQueries[0],
        subject,
        narration_vi: narrationVi,
        pedagogical_badge: options?.pedagogicalBadge,
        pedagogical_section: options?.pedagogicalSection,
      },
    }
  );

  return {
    videoUrl: synthStage3.videoUrl,
    videoElement: synthStage3.videoElement,
    videoCandidateUrls: [...allCandidateUrls, synthStage3.videoUrl],
    videoCandidateIndex: allCandidateUrls.length,
    videoSourceLabel: `📊 [Bước 3] Đồ Họa Sơ Đồ Động VTV7 (${options?.pedagogicalBadge || rankedQueries[0]})`,
    imageLoaded: false,
    fallbackStage: 3,
    visualMode: 'vtv7-graphics',
    sourceType: 'procedural',
  };
}

/**
 * Synchronization Readiness Check:
 * Waits until the scene's video (`canplaythrough` / `readyState >= 2`) or HD AI 2.5D image (`onload` / `complete`)
 * is ready in memory before starting the Vietnamese voiceover!
 */
export async function waitForSceneMediaReady(
  scene: Scene,
  maxWaitMs: number = 2000
): Promise<void> {
  if (!scene) return;

  // Stage 3 VTV7 Procedural Motion Graphics is rendered natively in real-time (0ms wait)
  if (scene.fallbackStage === 3 || scene.visualMode === 'vtv7-graphics') {
    return;
  }

  if (scene.videoElement && scene.videoElement.readyState >= 2) {
    if (scene.videoElement.paused) {
      await scene.videoElement.play().catch(() => {});
    }
    return;
  }

  if (
    scene.imageElement &&
    scene.imageLoaded &&
    scene.imageElement.complete &&
    scene.imageElement.naturalWidth > 0
  ) {
    return;
  }

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
 * BƯỚC 4: 1-Click Per-Scene Visual Retry & Mode Switcher
 * (`[🔄 Đổi cảnh khác (Video / AI / Sơ đồ động)]`)
 * Cycles or switches a single scene between:
 * - 'ai-25d' (Cảnh AI HD + Vật lý 2.5D mới)
 * - 'vtv7-graphics' (Sơ đồ khối động chuẩn VTV7)
 * - 'video' (Video MP4 kế tiếp theo từ khóa)
 */
export async function switchSceneToNextVideoClip(
  scene: Scene,
  sceneIndex: number,
  explicitMode?: SceneVisualMode
): Promise<{
  videoUrl: string;
  videoElement: HTMLVideoElement;
  videoCandidateUrls: string[];
  videoCandidateIndex: number;
  videoSourceLabel: string;
  imageUrl?: string;
  imageElement?: HTMLImageElement;
  imageLoaded?: boolean;
  fallbackStage: VisualFallbackStage;
  visualMode: SceneVisualMode;
}> {
  const retryNum = (scene.retryCounter || 0) + 1;

  // Cycle order when user clicks "🔄 Đổi cảnh khác (Video / AI / Sơ đồ động)" without explicit mode:
  // If currently video (stage 1) -> try next video clip or switch to AI 2.5D (stage 2) -> switch to VTV7 Graphics (stage 3) -> back to Video/AI
  let targetMode: SceneVisualMode = explicitMode || 'auto';
  if (!explicitMode) {
    if (scene.visualMode === 'video' && retryNum % 3 === 1) {
      targetMode = 'ai-25d';
    } else if (scene.visualMode === 'ai-25d' || retryNum % 3 === 2) {
      targetMode = 'vtv7-graphics';
    } else {
      targetMode =
        selfHealingVisualEngine.getEngineMode() === 'ai-25d-autonomous'
          ? 'ai-25d'
          : 'video';
    }
  }

  const existingPool = scene.videoCandidateUrls || [];
  const currentIdx = scene.videoCandidateIndex ?? 0;
  const nextIdx =
    existingPool.length > 1
      ? getNextCandidateVideoIndex(currentIdx, existingPool.length)
      : currentIdx + retryNum;

  const res = await fetchVerifiedSceneMedia(
    scene.exact_video_search_en || scene.search_keywords_en,
    scene.narration_vi,
    undefined,
    scene.visual_prompt_en,
    scene.wikipedia_topic_en,
    scene.scene_id || sceneIndex + 1,
    nextIdx,
    {
      forcedMode: targetMode,
      subject: scene.subject || 'Sinh học',
      pedagogicalBadge: scene.pedagogical_badge,
      pedagogicalSection: scene.pedagogical_section,
      title: scene.title,
    }
  );

  return {
    videoUrl: res.videoUrl,
    videoElement: res.videoElement,
    videoCandidateUrls: res.videoCandidateUrls,
    videoCandidateIndex: res.videoCandidateIndex,
    videoSourceLabel: res.videoSourceLabel,
    imageUrl: res.imageUrl,
    imageElement: res.imageElement,
    imageLoaded: res.imageLoaded,
    fallbackStage: res.fallbackStage,
    visualMode: res.visualMode,
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

/**
 * V3.0 Strict Multi-Beat Media Loader with 4-Stage Self-Healing Fallback:
 * Loads real MP4/WebM video (Stage 1), or AI Scene HD + 2.5D Physics (Stage 2),
 * or VTV7 Motion Graphics (Stage 3) for each visual_beat in a scene.
 */
export async function loadSceneVisualBeats(
  scene: Scene,
  usedUrls?: Set<string>
): Promise<VisualBeat[]> {
  if (!scene.visual_beats || scene.visual_beats.length === 0) return [];

  return Promise.all(
    scene.visual_beats.map(async (beat, bIdx) => {
      const primaryQuery =
        beat.search_queries_ranked?.[0] ||
        scene.exact_video_search_en ||
        scene.search_keywords_en;
      try {
        const media = await fetchVerifiedSceneMedia(
          primaryQuery,
          beat.trigger_phrase || scene.narration_vi,
          usedUrls,
          beat.ai_visual_prompt,
          scene.wikipedia_topic_en,
          (scene.scene_id || 1) * 10 + bIdx + 1,
          bIdx,
          {
            forcedMode: scene.visualMode,
            subject: scene.subject || 'Sinh học',
            pedagogicalBadge: beat.pedagogical_badge || scene.pedagogical_badge,
            pedagogicalSection: scene.pedagogical_section,
            title: scene.title,
            rankedQueries: beat.search_queries_ranked,
          }
        );
        return {
          ...beat,
          fallbackStage: media.fallbackStage,
          visualMode: media.visualMode,
          videoUrl: media.videoUrl,
          videoElement: media.videoElement,
          videoLoaded: media.fallbackStage === 1,
          imageUrl: media.imageUrl,
          imageElement: media.imageElement,
          imageLoaded: Boolean(media.imageElement),
          sourceLabel: media.videoSourceLabel,
        };
      } catch {
        return {
          ...beat,
          fallbackStage: 3,
          visualMode: 'vtv7-graphics',
        };
      }
    })
  );
}

/**
 * Releases all <video> elements (including inside visual_beats) and clears memory caches
 * when "🔄 Tạo Mới Video" is clicked.
 */
export function releaseAllSceneMedia(scenes: Scene[]): void {
  const cleanVideoEl = (v?: HTMLVideoElement | null) => {
    if (!v) return;
    try {
      v.pause();
      v.srcObject = null;
      v.removeAttribute('src');
      v.load();
    } catch {
      // ignore
    }
  };

  scenes.forEach((sc) => {
    cleanVideoEl(sc.videoElement);
    sc.visual_beats?.forEach((beat) => {
      cleanVideoEl(beat.videoElement);
    });
  });

  videoCache.forEach((v) => cleanVideoEl(v));
  videoCache.clear();
  imageCache.clear();
}


