import { CameraMotion, LutStyle, Scene } from '../types';
import { generateProceduralBackground } from './mediaLoader';

export interface RenderState {
  currentScene: Scene;
  nextScene?: Scene | null;
  sceneProgress: number; // 0.0 to 1.0
  isTransitioning: boolean;
  transitionProgress: number; // 0.0 to 1.0
  showSubtitles?: boolean;
  showTitleCard?: boolean;
}

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Floating ambient particles for cinematic depth
  private particles: {
    x: number;
    y: number;
    radius: number;
    speedX: number;
    speedY: number;
    opacity: number;
  }[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('Failed to get 2D rendering context for Canvas');
    }
    this.ctx = context;
    this.initParticles();
  }

  private initParticles(): void {
    const count = 35;
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * 1280,
        y: Math.random() * 720,
        radius: Math.random() * 2 + 1,
        speedX: (Math.random() - 0.5) * 0.4,
        speedY: -Math.random() * 0.5 - 0.2, // Drift gently upwards
        opacity: Math.random() * 0.5 + 0.2,
      });
    }
  }

  private updateParticles(): void {
    for (const p of this.particles) {
      p.x += p.speedX;
      p.y += p.speedY;
      if (p.y < 0) p.y = 720;
      if (p.x < 0) p.x = 1280;
      if (p.x > 1280) p.x = 0;
    }
  }

  private getFilterString(lut: LutStyle): string {
    switch (lut) {
      case 'cinematic-teal-orange':
        return 'contrast(1.15) saturate(1.25) sepia(0.2) hue-rotate(-15deg)';
      case 'warm-golden':
        return 'sepia(0.35) saturate(1.3) brightness(1.05) contrast(1.1)';
      case 'natural-documentary':
        return 'contrast(1.08) saturate(1.05) brightness(0.98)';
      case 'high-contrast':
        return 'contrast(1.35) saturate(1.15) brightness(1.02)';
      default:
        return 'none';
    }
  }

  /**
   * Draws a scene image or procedural fallback with Ken Burns transform
   */
  private drawSceneLayer(
    scene: Scene,
    progress: number,
    alpha: number = 1.0
  ): void {
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

    // Determine motion scale and offsets
    let scale = 1.0;
    let offsetX = 0;
    let offsetY = 0;

    const motion: CameraMotion = scene.camera_motion || 'zoom-in';

    switch (motion) {
      case 'zoom-in':
        // Zoom from 1.0 to 1.15
        scale = 1.0 + 0.15 * progress;
        break;
      case 'zoom-out':
        // Zoom from 1.15 to 1.0
        scale = 1.15 - 0.15 * progress;
        break;
      case 'pan-left':
        // Scale 1.12, pan from +40px to -40px
        scale = 1.12;
        offsetX = 40 - 80 * progress;
        break;
      case 'pan-right':
        // Scale 1.12, pan from -40px to +40px
        scale = 1.12;
        offsetX = -40 + 80 * progress;
        break;
    }

    // Apply LUT filter
    const filterStr = this.getFilterString(scene.lut_style);
    ctx.filter = filterStr;

    // Source video, image, or procedural background
    let sourceDrawable: CanvasImageSource;
    let sourceW = width;
    let sourceH = height;

    if (
      scene.videoElement &&
      scene.videoLoaded &&
      scene.videoElement.readyState >= 2
    ) {
      if (scene.videoElement.paused) {
        scene.videoElement.play().catch(() => {});
      }
      sourceDrawable = scene.videoElement;
      sourceW = scene.videoElement.videoWidth || width;
      sourceH = scene.videoElement.videoHeight || height;
    } else if (scene.imageElement && scene.imageLoaded) {
      sourceDrawable = scene.imageElement;
      sourceW = scene.imageElement.naturalWidth || width;
      sourceH = scene.imageElement.naturalHeight || height;
    } else {
      sourceDrawable = generateProceduralBackground(
        scene.lut_style,
        scene.scene_id,
        scene.title
      );
    }

    // Draw with centered scaling and Ken Burns transforms
    ctx.translate(width / 2 + offsetX, height / 2 + offsetY);
    ctx.scale(scale, scale);

    // Maintain aspect ratio cover for both video and image sources
    let drawW = width;
    let drawH = height;

    if (sourceW > 0 && sourceH > 0) {
      const mediaAspect = sourceW / sourceH;
      const canvasAspect = width / height;

      if (mediaAspect > canvasAspect) {
        drawH = height;
        drawW = height * mediaAspect;
      } else {
        drawW = width;
        drawH = width / mediaAspect;
      }
    }

    ctx.drawImage(sourceDrawable, -drawW / 2, -drawH / 2, drawW, drawH);

    ctx.restore();
  }

  /**
   * Draws dynamic floating cinematic particles
   */
  private drawFloatingParticles(): void {
    const ctx = this.ctx;
    ctx.save();
    this.updateParticles();

    for (const p of this.particles) {
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 2);
      grad.addColorStop(0, `rgba(255, 230, 180, ${p.opacity})`);
      grad.addColorStop(1, 'rgba(255, 230, 180, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Draws cinematic vignette overlay
   */
  private drawCinematicVignette(): void {
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    ctx.save();
    const grad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      height * 0.45,
      width / 2,
      height / 2,
      width * 0.75
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.55)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Subtle 2.39:1 letterbox bars hint (or soft dark gradient on borders)
    const topBar = ctx.createLinearGradient(0, 0, 0, 80);
    topBar.addColorStop(0, 'rgba(5, 5, 10, 0.6)');
    topBar.addColorStop(1, 'rgba(5, 5, 10, 0)');
    ctx.fillStyle = topBar;
    ctx.fillRect(0, 0, width, 80);

    const bottomBar = ctx.createLinearGradient(0, height - 140, 0, height);
    bottomBar.addColorStop(0, 'rgba(5, 5, 10, 0)');
    bottomBar.addColorStop(1, 'rgba(5, 5, 10, 0.7)');
    ctx.fillStyle = bottomBar;
    ctx.fillRect(0, height - 140, width, 140);

    ctx.restore();
  }

  /**
   * Draws Scene Title Card at top-left
   */
  private drawTitleCard(scene: Scene): void {
    const ctx = this.ctx;
    ctx.save();

    const titleText = scene.title.toUpperCase();
    const sceneTag = `PHÂN CẢNH ${String(scene.scene_id).padStart(2, '0')}`;

    // Tag background pill
    ctx.fillStyle = 'rgba(10, 15, 25, 0.75)';
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)'; // Amber border
    ctx.lineWidth = 1;

    const boxX = 40;
    const boxY = 40;
    const boxW = Math.max(260, ctx.measureText(titleText).width + 80);
    const boxH = 50;
    const radius = 8;

    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, radius);
    ctx.fill();
    ctx.stroke();

    // Amber indicator dot
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(boxX + 16, boxY + 25, 4, 0, Math.PI * 2);
    ctx.fill();

    // Text: Scene Tag
    ctx.font = '600 11px "Be Vietnam Pro", system-ui, sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(sceneTag, boxX + 28, boxY + 20);

    // Text: Title
    ctx.font = '700 14px "Be Vietnam Pro", system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(titleText, boxX + 28, boxY + 38);

    ctx.restore();
  }

  /**
   * Draws dynamic Vietnamese subtitles with word-wrapping and dark outline
   */
  private drawSubtitles(narration: string): void {
    if (!narration || !narration.trim()) return;

    const { width, height } = this.canvas;
    const ctx = this.ctx;

    ctx.save();
    ctx.font = '700 24px "Be Vietnam Pro", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxWidth = 980;
    const words = narration.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = ctx.measureText(testLine).width;
      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    // Limit to 2 lines max on screen at once
    const displayLines = lines.slice(-2);
    const lineHeight = 34;
    const totalTextHeight = displayLines.length * lineHeight;

    const centerY = height - 70;
    const cardH = totalTextHeight + 28;
    const maxLineWidth = Math.max(
      ...displayLines.map((l) => ctx.measureText(l).width)
    );
    const cardW = Math.min(1060, maxLineWidth + 56);

    // Semi-transparent rounded card behind subtitles
    ctx.fillStyle = 'rgba(6, 9, 15, 0.82)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.roundRect(
      width / 2 - cardW / 2,
      centerY - cardH / 2,
      cardW,
      cardH,
      12
    );
    ctx.fill();
    ctx.stroke();

    // Render each text line with thick black stroke and crisp white fill
    displayLines.forEach((line, index) => {
      const lineY =
        centerY -
        (totalTextHeight / 2) +
        index * lineHeight +
        lineHeight / 2;

      // Heavy outline
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#020617';
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeText(line, width / 2, lineY);

      // Soft drop shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;

      // Crisp inner fill
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line, width / 2, lineY);

      // Reset shadow for subsequent drawings
      ctx.shadowColor = 'transparent';
    });

    ctx.restore();
  }

  /**
   * Main render function called on every animation frame (30fps)
   */
  public render(state: RenderState): void {
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    // Reset filters
    ctx.filter = 'none';

    // Clear background
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, width, height);

    // If transitioning to next scene: Cross-dissolve
    if (state.isTransitioning && state.nextScene) {
      // 1. Draw next scene at background with rising alpha
      this.drawSceneLayer(
        state.nextScene,
        state.transitionProgress * 0.15,
        1.0
      );

      // 2. Draw current scene fading out
      this.drawSceneLayer(
        state.currentScene,
        state.sceneProgress,
        1.0 - state.transitionProgress
      );
    } else {
      // Normal single scene rendering
      this.drawSceneLayer(
        state.currentScene,
        state.sceneProgress,
        1.0
      );
    }

    // Cinematic particles & vignette overlay
    this.drawFloatingParticles();
    this.drawCinematicVignette();

    // Watermark / title card (Disabled by default to keep video screen clean and cinematic)
    if (state.showTitleCard === true) {
      this.drawTitleCard(state.currentScene);
    }

    // Dynamic Vietnamese Subtitles
    if (state.showSubtitles !== false) {
      this.drawSubtitles(state.currentScene.narration_vi);
    }
  }
}
