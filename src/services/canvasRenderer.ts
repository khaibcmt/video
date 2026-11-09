import { CameraMotion, LutStyle, Scene, VisualBeat } from '../types';
import { generateProceduralBackground } from './mediaLoader';
import { audioEngine } from './audioEngine';

export interface RenderState {
  currentScene: Scene;
  nextScene?: Scene | null;
  sceneProgress: number; // 0.0 to 1.0 (driven by exact AudioBuffer.duration)
  isTransitioning: boolean;
  transitionProgress: number; // 0.0 to 1.0
  showSubtitles?: boolean;
  showTitleCard?: boolean;
}

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Floating ambient particles & water/light motes for physical depth
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
    const count = 32;
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * 1280,
        y: Math.random() * 720,
        radius: Math.random() * 2.2 + 1,
        speedX: (Math.random() - 0.5) * 0.45,
        speedY: -Math.random() * 0.55 - 0.2,
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
   * Draws a single media source (Beat or Scene video/image) with Ken Burns motion
   */
  private drawMediaSource(
    videoEl: HTMLVideoElement | null | undefined,
    videoLoaded: boolean | undefined,
    imageEl: HTMLImageElement | null | undefined,
    imageLoaded: boolean | undefined,
    motion: CameraMotion,
    lutStyle: LutStyle,
    sceneId: number,
    fallbackText: string,
    localProgress: number,
    alpha: number = 1.0
  ): void {
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.filter = this.getFilterString(lutStyle);

    if (videoEl && videoLoaded && videoEl.readyState >= 2) {
      videoEl.loop = true;
      videoEl.muted = true;
      if (videoEl.ended || videoEl.paused) {
        videoEl.play().catch(() => {});
      }

      let scale = 1.0;
      let offsetX = 0;
      switch (motion) {
        case 'zoom-in':
          scale = 1.0 + 0.08 * localProgress;
          break;
        case 'zoom-out':
          scale = 1.08 - 0.08 * localProgress;
          break;
        case 'pan-left':
          scale = 1.06;
          offsetX = 20 - 40 * localProgress;
          break;
        case 'pan-right':
          scale = 1.06;
          offsetX = -20 + 40 * localProgress;
          break;
      }

      if (scale !== 1.0 || offsetX !== 0) {
        ctx.translate(width / 2 + offsetX, height / 2);
        ctx.scale(scale, scale);
        ctx.translate(-width / 2, -height / 2);
      }

      ctx.drawImage(videoEl, 0, 0, width, height);
    } else if (
      imageEl &&
      imageLoaded &&
      imageEl.complete &&
      imageEl.naturalWidth > 0
    ) {
      let scale = 1.0;
      let offsetX = 0;
      switch (motion) {
        case 'zoom-in':
          scale = 1.0 + 0.15 * localProgress;
          break;
        case 'zoom-out':
          scale = 1.15 - 0.15 * localProgress;
          break;
        case 'pan-left':
          scale = 1.12;
          offsetX = 45 - 90 * localProgress;
          break;
        case 'pan-right':
          scale = 1.12;
          offsetX = -45 + 90 * localProgress;
          break;
      }

      ctx.translate(width / 2 + offsetX, height / 2);
      ctx.scale(scale, scale);
      ctx.translate(-width / 2, -height / 2);

      const imgRatio = imageEl.naturalWidth / imageEl.naturalHeight;
      const canvasRatio = width / height;
      let drawW = width;
      let drawH = height;
      let drawX = 0;
      let drawY = 0;

      if (imgRatio > canvasRatio) {
        drawH = height;
        drawW = height * imgRatio;
        drawX = (width - drawW) / 2;
      } else {
        drawW = width;
        drawH = width / imgRatio;
        drawY = (height - drawH) / 2;
      }

      ctx.drawImage(imageEl, drawX, drawY, drawW, drawH);
    } else {
      const animatedFallback = generateProceduralBackground(
        lutStyle,
        sceneId,
        fallbackText
      );
      ctx.drawImage(animatedFallback, 0, 0, width, height);
    }

    ctx.restore();
  }

  /**
   * Resolves the active VisualBeat (and optional cross-fade previous beat) for a given sceneProgress
   */
  private getActiveBeatState(
    scene: Scene,
    progress: number
  ): {
    activeBeat?: VisualBeat;
    prevBeat?: VisualBeat;
    beatBlendAlpha: number;
    beatLocalProgress: number;
  } {
    const beats = scene.visual_beats;
    if (!beats || beats.length < 2) {
      return { beatBlendAlpha: 1, beatLocalProgress: progress };
    }

    let activeIdx = 0;
    for (let i = 0; i < beats.length; i++) {
      const startRatio = beats[i].progress_ratio ?? i / beats.length;
      if (progress >= startRatio) {
        activeIdx = i;
      }
    }

    const activeBeat = beats[activeIdx];
    const startRatio = activeBeat.progress_ratio ?? activeIdx / beats.length;
    const endRatio =
      activeIdx + 1 < beats.length
        ? beats[activeIdx + 1].progress_ratio ?? (activeIdx + 1) / beats.length
        : 1.0;
    const span = Math.max(0.1, endRatio - startRatio);
    const beatLocalProgress = Math.max(0, Math.min(1, (progress - startRatio) / span));

    // Smooth 0.5s cross-fade window (~0.08 of scene progress) when entering a new beat
    const crossFadeWindow = 0.08;
    if (activeIdx > 0 && progress - startRatio < crossFadeWindow) {
      const blend = (progress - startRatio) / crossFadeWindow;
      return {
        activeBeat,
        prevBeat: beats[activeIdx - 1],
        beatBlendAlpha: Math.max(0, Math.min(1, blend)),
        beatLocalProgress,
      };
    }

    return {
      activeBeat,
      beatBlendAlpha: 1,
      beatLocalProgress,
    };
  }

  /**
   * Draws a Scene Layer with Multi-Beat 0.5s Cross-Fade support
   */
  private drawSceneLayer(
    scene: Scene,
    progress: number,
    alpha: number = 1.0
  ): void {
    const { activeBeat, prevBeat, beatBlendAlpha, beatLocalProgress } =
      this.getActiveBeatState(scene, progress);

    if (prevBeat && activeBeat && beatBlendAlpha < 1) {
      this.drawMediaSource(
        prevBeat.videoElement || scene.videoElement,
        prevBeat.videoLoaded ?? scene.videoLoaded,
        prevBeat.imageElement || scene.imageElement,
        prevBeat.imageLoaded ?? scene.imageLoaded,
        prevBeat.camera_motion || scene.camera_motion,
        scene.lut_style,
        scene.scene_id,
        prevBeat.trigger_phrase || scene.title,
        1.0,
        alpha
      );
      this.drawMediaSource(
        activeBeat.videoElement || scene.videoElement,
        activeBeat.videoLoaded ?? scene.videoLoaded,
        activeBeat.imageElement || scene.imageElement,
        activeBeat.imageLoaded ?? scene.imageLoaded,
        activeBeat.camera_motion || scene.camera_motion,
        scene.lut_style,
        scene.scene_id + 10,
        activeBeat.trigger_phrase || scene.title,
        beatLocalProgress,
        alpha * beatBlendAlpha
      );
      return;
    }

    if (activeBeat && (activeBeat.videoElement || activeBeat.imageElement)) {
      this.drawMediaSource(
        activeBeat.videoElement || scene.videoElement,
        activeBeat.videoLoaded ?? scene.videoLoaded,
        activeBeat.imageElement || scene.imageElement,
        activeBeat.imageLoaded ?? scene.imageLoaded,
        activeBeat.camera_motion || scene.camera_motion,
        scene.lut_style,
        scene.scene_id,
        activeBeat.trigger_phrase || scene.title,
        beatLocalProgress,
        alpha
      );
      return;
    }

    this.drawMediaSource(
      scene.videoElement,
      scene.videoLoaded,
      scene.imageElement,
      scene.imageLoaded,
      scene.camera_motion,
      scene.lut_style,
      scene.scene_id,
      `${scene.title} ${scene.narration_vi}`,
      progress,
      alpha
    );
  }

  /**
   * Draws floating physical light motes / aquatic bubbles
   */
  private drawFloatingParticles(): void {
    const ctx = this.ctx;
    ctx.save();
    this.updateParticles();

    for (const p of this.particles) {
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 2);
      grad.addColorStop(0, `rgba(255, 235, 190, ${p.opacity})`);
      grad.addColorStop(1, 'rgba(255, 235, 190, 0)');

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
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.48)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const bottomBar = ctx.createLinearGradient(0, height - 150, 0, height);
    bottomBar.addColorStop(0, 'rgba(5, 5, 10, 0)');
    bottomBar.addColorStop(1, 'rgba(5, 5, 10, 0.76)');
    ctx.fillStyle = bottomBar;
    ctx.fillRect(0, height - 150, width, 150);

    ctx.restore();
  }

  /**
   * Draws the animated Pedagogical Formula/Knowledge Badge in the top-right corner of the Canvas
   */
  private drawPedagogicalBadge(scene: Scene, progress: number): void {
    const { activeBeat } = this.getActiveBeatState(scene, progress);
    const badgeText = (
      activeBeat?.pedagogical_badge ||
      scene.pedagogical_badge ||
      ''
    ).trim();
    const sectionText = (scene.pedagogical_section || '').trim();

    if (!badgeText && !sectionText) return;

    const { width } = this.canvas;
    const ctx = this.ctx;

    // Smooth slide-in during first 8% of scene
    const slideRatio = Math.min(1, progress / 0.08);
    const slideOffset = (1 - slideRatio) * 40;

    ctx.save();
    ctx.globalAlpha = Math.max(0.15, slideRatio);

    // Top-Right Formula / Knowledge Badge
    if (badgeText) {
      ctx.font = '700 16px "Be Vietnam Pro", system-ui, sans-serif';
      const label = `📌 ${badgeText}`;
      const textWidth = ctx.measureText(label).width;
      const boxW = Math.min(520, textWidth + 36);
      const boxH = 40;
      const boxX = width - boxW - 28 + slideOffset;
      const boxY = 24;

      ctx.fillStyle = 'rgba(8, 15, 28, 0.86)';
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fbbf24';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, boxX + 16, boxY + boxH / 2, boxW - 28);
    }

    // Top-Left Pedagogical Section Pill
    if (sectionText) {
      ctx.font = '700 13px "Be Vietnam Pro", system-ui, sans-serif';
      const secWidth = ctx.measureText(sectionText).width;
      const pillW = Math.min(420, secWidth + 28);
      const pillH = 32;
      const pillX = 28 - slideOffset;
      const pillY = 24;

      ctx.fillStyle = 'rgba(6, 24, 38, 0.82)';
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.45)';
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#67e8f9';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(sectionText, pillX + 14, pillY + pillH / 2, pillW - 24);
    }

    ctx.restore();
  }

  /**
   * Draws Chunked Karaoke/Cinema Vietnamese Subtitles synchronized to `sceneProgress`
   * + Live Audio Waveform Visualizer pulsing to the teacher's voice
   */
  private drawChunkedSubtitlesAndWaveform(narration: string, sceneProgress: number): void {
    if (!narration || !narration.trim()) return;

    const { width, height } = this.canvas;
    const ctx = this.ctx;

    // Split narration into readable cinema subtitle chunks (~12 words per chunk) so only a short, crisp phrase appears at a time
    const allWords = narration.trim().split(/\s+/);
    const wordsPerChunk = 14;
    const phraseChunks: string[][] = [];
    for (let i = 0; i < allWords.length; i += wordsPerChunk) {
      phraseChunks.push(allWords.slice(i, i + wordsPerChunk));
    }

    const activeChunkIdx = Math.min(
      phraseChunks.length - 1,
      Math.max(0, Math.floor(sceneProgress * phraseChunks.length))
    );
    const activeWords = phraseChunks[activeChunkIdx] || allWords;
    const activePhrase = activeWords.join(' ');

    // Progress within current chunk (for karaoke word highlight)
    const chunkStartProgress = activeChunkIdx / phraseChunks.length;
    const chunkSpan = 1 / phraseChunks.length;
    const localChunkProgress = Math.max(
      0,
      Math.min(1, (sceneProgress - chunkStartProgress) / chunkSpan)
    );
    const highlightedWordCount = Math.ceil(localChunkProgress * activeWords.length);

    ctx.save();
    ctx.font = '700 25px "Be Vietnam Pro", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxWidth = 900;
    const lines: { text: string; wordStartIdx: number; wordEndIdx: number }[] = [];
    let currentLineWords: string[] = [];
    let lineStartIdx = 0;

    activeWords.forEach((word, wIdx) => {
      const testLine = [...currentLineWords, word].join(' ');
      if (ctx.measureText(testLine).width > maxWidth && currentLineWords.length > 0) {
        lines.push({
          text: currentLineWords.join(' '),
          wordStartIdx: lineStartIdx,
          wordEndIdx: wIdx - 1,
        });
        currentLineWords = [word];
        lineStartIdx = wIdx;
      } else {
        currentLineWords.push(word);
      }
    });

    if (currentLineWords.length > 0) {
      lines.push({
        text: currentLineWords.join(' '),
        wordStartIdx: lineStartIdx,
        wordEndIdx: activeWords.length - 1,
      });
    }

    const displayLines = lines.slice(0, 2);
    const lineHeight = 36;
    const totalTextHeight = displayLines.length * lineHeight;

    const centerY = height - 66;
    const cardH = totalTextHeight + 28;
    const maxLineWidth = Math.max(
      260,
      ...displayLines.map((l) => ctx.measureText(l.text).width),
      ctx.measureText(activePhrase).width > maxWidth ? maxWidth : ctx.measureText(activePhrase).width
    );
    const waveformWidth = 68;
    const cardW = Math.min(1140, maxLineWidth + waveformWidth + 68);
    const cardX = width / 2 - cardW / 2;
    const cardY = centerY - cardH / 2;

    // Subtitle card background
    ctx.fillStyle = 'rgba(6, 9, 16, 0.86)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 14);
    ctx.fill();
    ctx.stroke();

    // Draw Live Audio Waveform Visualizer on the left side of the subtitle bar
    const bands = audioEngine.getVoiceWaveformBands(10);
    const waveStartX = cardX + 18;
    const barGap = 5;
    const barW = 3;
    bands.forEach((amp, bIdx) => {
      const barH = Math.max(4, amp * (cardH - 20));
      const bx = waveStartX + bIdx * (barW + barGap);
      const by = centerY - barH / 2;
      ctx.fillStyle = amp > 0.25 ? '#fbbf24' : '#38bdf8';
      ctx.beginPath();
      ctx.roundRect(bx, by, barW, barH, 2);
      ctx.fill();
    });

    // Draw Subtitle Lines with thick dark outline and active karaoke highlight
    const textCenterX = cardX + waveformWidth + (cardW - waveformWidth) / 2 - 8;
    displayLines.forEach((lineObj, index) => {
      const lineY =
        centerY - totalTextHeight / 2 + index * lineHeight + lineHeight / 2;

      ctx.lineWidth = 6;
      ctx.strokeStyle = '#020617';
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeText(lineObj.text, textCenterX, lineY);

      ctx.shadowColor = 'rgba(0, 0, 0, 0.88)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;

      const isLineActive = highlightedWordCount > lineObj.wordStartIdx;
      ctx.fillStyle = isLineActive ? '#ffffff' : '#cbd5e1';
      ctx.fillText(lineObj.text, textCenterX, lineY);

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
    this.drawPedagogicalBadge(state.currentScene, state.sceneProgress);

    if (state.showSubtitles !== false) {
      this.drawChunkedSubtitlesAndWaveform(
        state.currentScene.narration_vi,
        state.sceneProgress
      );
    }
  }
}
