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
    const count = 28;
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * 1280,
        y: Math.random() * 720,
        radius: Math.random() * 2 + 1,
        speedX: (Math.random() - 0.5) * 0.4,
        speedY: -Math.random() * 0.5 - 0.2,
        opacity: Math.random() * 0.45 + 0.15,
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
        return 'contrast(1.12) saturate(1.2) sepia(0.15) hue-rotate(-10deg)';
      case 'warm-golden':
        return 'sepia(0.28) saturate(1.25) brightness(1.04) contrast(1.08)';
      case 'natural-documentary':
        return 'contrast(1.06) saturate(1.05) brightness(1.0)';
      case 'high-contrast':
        return 'contrast(1.3) saturate(1.15) brightness(1.02)';
      default:
        return 'none';
    }
  }

  /**
   * Draws a real HTMLVideoElement stream onto the 16:9 Canvas (Zero static images).
   * Automatically loops the video clip if the scene narration is longer than the clip duration.
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

    // Apply LUT color grading filter
    const filterStr = this.getFilterString(scene.lut_style);
    ctx.filter = filterStr;

    const currentVideoElement = scene.videoElement;

    if (
      currentVideoElement &&
      scene.videoLoaded &&
      currentVideoElement.readyState >= 2
    ) {
      // Ensure seamless looping if narration duration exceeds video clip duration
      currentVideoElement.loop = true;
      currentVideoElement.muted = true;
      if (currentVideoElement.ended || currentVideoElement.paused) {
        currentVideoElement.play().catch(() => {});
      }

      // Subtle camera motion transform on top of live video footage
      let scale = 1.0;
      let offsetX = 0;
      const motion: CameraMotion = scene.camera_motion || 'zoom-in';

      switch (motion) {
        case 'zoom-in':
          scale = 1.0 + 0.08 * progress;
          break;
        case 'zoom-out':
          scale = 1.08 - 0.08 * progress;
          break;
        case 'pan-left':
          scale = 1.06;
          offsetX = 20 - 40 * progress;
          break;
        case 'pan-right':
          scale = 1.06;
          offsetX = -20 + 40 * progress;
          break;
      }

      if (scale !== 1.0 || offsetX !== 0) {
        ctx.translate(width / 2 + offsetX, height / 2);
        ctx.scale(scale, scale);
        ctx.translate(-width / 2, -height / 2);
      }

      // Direct 16:9 video frame draw as specified: ctx.drawImage(currentVideoElement, 0, 0, canvas.width, canvas.height)
      ctx.drawImage(currentVideoElement, 0, 0, width, height);
    } else {
      // Animated motion stream frame while remote video element decodes first frame
      const animatedFallback = generateProceduralBackground(
        scene.lut_style,
        scene.scene_id,
        `${scene.title} ${scene.narration_vi}`
      );
      ctx.drawImage(animatedFallback, 0, 0, width, height);
    }

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
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.5)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const bottomBar = ctx.createLinearGradient(0, height - 140, 0, height);
    bottomBar.addColorStop(0, 'rgba(5, 5, 10, 0)');
    bottomBar.addColorStop(1, 'rgba(5, 5, 10, 0.7)');
    ctx.fillStyle = bottomBar;
    ctx.fillRect(0, height - 140, width, 140);

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

    const displayLines = lines.slice(-2);
    const lineHeight = 34;
    const totalTextHeight = displayLines.length * lineHeight;

    const centerY = height - 70;
    const cardH = totalTextHeight + 28;
    const maxLineWidth = Math.max(
      ...displayLines.map((l) => ctx.measureText(l).width)
    );
    const cardW = Math.min(1060, maxLineWidth + 56);

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

    displayLines.forEach((line, index) => {
      const lineY =
        centerY -
        (totalTextHeight / 2) +
        index * lineHeight +
        lineHeight / 2;

      ctx.lineWidth = 5;
      ctx.strokeStyle = '#020617';
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeText(line, width / 2, lineY);

      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;

      ctx.fillStyle = '#ffffff';
      ctx.fillText(line, width / 2, lineY);

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

    ctx.filter = 'none';
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, width, height);

    if (state.isTransitioning && state.nextScene) {
      this.drawSceneLayer(
        state.nextScene,
        state.transitionProgress * 0.15,
        1.0
      );
      this.drawSceneLayer(
        state.currentScene,
        state.sceneProgress,
        1.0 - state.transitionProgress
      );
    } else {
      this.drawSceneLayer(
        state.currentScene,
        state.sceneProgress,
        1.0
      );
    }

    this.drawFloatingParticles();
    this.drawCinematicVignette();

    if (state.showSubtitles !== false) {
      this.drawSubtitles(state.currentScene.narration_vi);
    }
  }
}
