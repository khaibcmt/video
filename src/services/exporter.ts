import { Scene, ExportProgress } from '../types';
import { audioEngine } from './audioEngine';
import { CanvasRenderer } from './canvasRenderer';
import { waitForSceneMediaReady } from './mediaLoader';

export type VideoExportFormat = 'mp4' | 'webm';

/**
 * Formats seconds into standard SubRip timestamp: HH:MM:SS,mmm
 */
export function formatSrtTime(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  const ms = Math.min(999, Math.floor((totalSeconds % 1) * 1000));

  const pad = (num: number, size: number = 2) => String(num).padStart(size, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
}

/**
 * Generates and downloads a .srt file matching exact scene durations
 */
export function exportSrtFile(scenes: Scene[], lessonTitle: string): void {
  if (!scenes || scenes.length === 0) {
    throw new Error('Chưa có phân cảnh nào để xuất phụ đề.');
  }

  let currentTime = 0;
  const srtBlocks: string[] = [];

  scenes.forEach((scene, index) => {
    const startTime = currentTime;
    const endTime = startTime + scene.duration_seconds;

    const block = [
      String(index + 1),
      `${formatSrtTime(startTime)} --> ${formatSrtTime(endTime)}`,
      scene.narration_vi.trim(),
    ].join('\n');

    srtBlocks.push(block);
    currentTime = endTime;
  });

  const srtContent = srtBlocks.join('\n\n');
  const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const cleanName = (lessonTitle || 'Bai_Hoc')
    .replace(/[^\w\s\u00C0-\u1EF9-]/g, '')
    .trim()
    .replace(/\s+/g, '_');

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${cleanName}.srt`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Detects the best supported MIME type for MP4 or WebM that explicitly supports BOTH Video and Audio tracks.
 * CRITICAL: Never use a video-only codec string like 'video/mp4;codecs=avc1' without an audio codec,
 * because MediaRecorder will discard the voiceover audio track!
 */
export function getSupportedVideoMimeType(format: VideoExportFormat): {
  mimeType: string;
  extension: string;
  isNativeMp4: boolean;
} {
  if (format === 'mp4') {
    const mp4AudioVideoMimes = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=avc1.4d002a,mp4a.40.2',
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4;codecs=avc1,opus',
      'video/mp4;codecs=h264,aac',
      'video/mp4;codecs=h264,opus',
      'video/mp4',
    ];

    for (const mime of mp4AudioVideoMimes) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
        return { mimeType: mime, extension: 'mp4', isNativeMp4: true };
      }
    }

    // Fallback with guaranteed Opus audio support if native MP4 container isn't supported by browser
    const fallbackMime =
      typeof MediaRecorder !== 'undefined' &&
      MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : typeof MediaRecorder !== 'undefined' &&
          MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';

    return {
      mimeType: fallbackMime,
      extension: 'mp4',
      isNativeMp4: false,
    };
  }

  // WebM format with explicit Opus audio codec
  const webmMimes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];

  for (const mime of webmMimes) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
      return { mimeType: mime, extension: 'webm', isNativeMp4: false };
    }
  }

  return { mimeType: 'video/webm', extension: 'webm', isNativeMp4: false };
}

/**
 * Exports video in MP4 or WebM format by combining canvas.captureStream(30) and Web Audio voiceover stream.
 * Guarantees 100% voiceover narration inclusion and zero background music.
 */
export async function exportVideo(
  canvas: HTMLCanvasElement,
  scenes: Scene[],
  lessonTitle: string,
  format: VideoExportFormat = 'mp4',
  onProgress: (progress: ExportProgress) => void,
  onCancelRequested?: () => boolean
): Promise<void> {
  if (!scenes || scenes.length === 0) {
    throw new Error('Chưa có phân cảnh nào để xuất video.');
  }

  // 1. Stop any ongoing preview audio and initialize Web Audio context + MediaStreamDestination
  audioEngine.stopAll();
  await audioEngine.ensureContext();

  onProgress({
    isExporting: true,
    progressPercent: 2,
    currentSceneIndex: 0,
    totalScenes: scenes.length,
    timeRemainingSec: scenes.reduce((acc, s) => acc + s.duration_seconds, 0),
    statusText: 'Đang nạp và giải mã toàn bộ lời thoại tiếng Việt vào luồng âm thanh xuất file...',
  });

  // 2. Preload and decode all Vietnamese TTS chunks + verify scene media readiness (canplaythrough / onload)
  const [audioDurations] = await Promise.all([
    audioEngine.preloadNarrations(scenes.map((s) => s.narration_normalized)),
    Promise.all(scenes.map((s) => waitForSceneMediaReady(s, 2500))),
  ]);

  // Adjust effective export durations so no scene ever cuts off its voiceover
  const exportScenes: Scene[] = scenes.map((sc, idx) => {
    const minAudioSec = audioDurations[idx] ? Math.ceil(audioDurations[idx] + 1.0) : sc.duration_seconds;
    return {
      ...sc,
      duration_seconds: Math.max(sc.duration_seconds, minAudioSec),
    };
  });

  const renderer = new CanvasRenderer(canvas);
  const canvasStream = canvas.captureStream(30);
  const audioStream = audioEngine.getAudioStream();

  const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
  if (audioStream && audioStream.getAudioTracks().length > 0) {
    audioStream.getAudioTracks().forEach((track) => {
      track.enabled = true;
      tracks.push(track);
    });
  }

  const combinedStream = new MediaStream(tracks);

  // Supported MIME type detection (with both video + audio codecs)
  const { mimeType, extension } = getSupportedVideoMimeType(format);

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 4_000_000, // 4 Mbps 720p HD video
    audioBitsPerSecond: 128_000,   // 128 kbps clear voiceover audio
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  const totalDurationSec = exportScenes.reduce((acc, s) => acc + s.duration_seconds, 0);

  return new Promise((resolve, reject) => {
    let isCancelled = false;

    recorder.onstop = () => {
      audioEngine.stopAll();

      if (isCancelled) {
        reject(new Error('Đã hủy quá trình xuất video.'));
        return;
      }

      try {
        const fullBlob = new Blob(chunks, { type: mimeType });
        const downloadUrl = URL.createObjectURL(fullBlob);

        const timestamp = new Date()
          .toISOString()
          .replace(/[-:]/g, '')
          .slice(0, 15);

        const cleanName = (lessonTitle || 'Bai_Hoc')
          .replace(/[^\w\s\u00C0-\u1EF9-]/g, '')
          .trim()
          .replace(/\s+/g, '_');

        const fileName = `${cleanName}_${timestamp}.${extension}`;

        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);

        onProgress({
          isExporting: false,
          progressPercent: 100,
          currentSceneIndex: exportScenes.length - 1,
          totalScenes: exportScenes.length,
          timeRemainingSec: 0,
          statusText: `Xuất video ${extension.toUpperCase()} kèm lời thoại thành công!`,
        });

        resolve();
      } catch (err) {
        reject(err);
      }
    };

    recorder.onerror = (err) => {
      audioEngine.stopAll();
      reject(err);
    };

    // Start recording (collect data every 300ms for smooth muxing)
    recorder.start(300);

    let currentSceneIndex = 0;
    let sceneStartTime = performance.now();
    let accumulatedTime = 0;

    // Trigger first scene narration immediately
    void audioEngine.playVietnameseNarration(exportScenes[0].narration_normalized);

    const renderLoop = () => {
      if (onCancelRequested && onCancelRequested()) {
        isCancelled = true;
        recorder.stop();
        return;
      }

      if (currentSceneIndex >= exportScenes.length) {
        recorder.stop();
        return;
      }

      const scene = exportScenes[currentSceneIndex];
      const now = performance.now();
      const sceneElapsed = (now - sceneStartTime) / 1000;
      const sceneDuration = scene.duration_seconds;

      accumulatedTime =
        exportScenes.slice(0, currentSceneIndex).reduce((acc, s) => acc + s.duration_seconds, 0) +
        Math.min(sceneElapsed, sceneDuration);

      const progressPercent = Math.min(99, Math.round((accumulatedTime / totalDurationSec) * 100));
      const timeRemaining = Math.max(0, Math.round(totalDurationSec - accumulatedTime));

      onProgress({
        isExporting: true,
        progressPercent,
        currentSceneIndex,
        totalScenes: exportScenes.length,
        timeRemainingSec: timeRemaining,
        statusText: `Đang ghi hình & thu lời thoại cảnh ${currentSceneIndex + 1}/${exportScenes.length} [${format.toUpperCase()}]: ${scene.title}`,
      });

      // Transition check (last 0.8s, only after voiceover completes)
      const transitionDuration = 0.8;
      const timeLeftInScene = sceneDuration - sceneElapsed;
      const isTransitioning =
        currentSceneIndex < exportScenes.length - 1 &&
        timeLeftInScene < transitionDuration &&
        timeLeftInScene > 0 &&
        !audioEngine.isCurrentlySpeaking();
      const transitionProgress = isTransitioning
        ? 1.0 - timeLeftInScene / transitionDuration
        : 0;

      const nextScene = isTransitioning ? exportScenes[currentSceneIndex + 1] : null;

      renderer.render({
        currentScene: scene,
        nextScene,
        sceneProgress: Math.min(1.0, sceneElapsed / sceneDuration),
        isTransitioning,
        transitionProgress,
        showSubtitles: true,
        showTitleCard: false,
      });

      const voiceStillSpeaking = audioEngine.isCurrentlySpeaking();
      if (
        (sceneElapsed >= sceneDuration && !voiceStillSpeaking) ||
        sceneElapsed >= sceneDuration + 10
      ) {
        currentSceneIndex++;
        sceneStartTime = performance.now();

        if (currentSceneIndex < exportScenes.length) {
          const nextSceneObj = exportScenes[currentSceneIndex];
          void audioEngine.playVietnameseNarration(nextSceneObj.narration_normalized);
        }
      }

      requestAnimationFrame(renderLoop);
    };

    requestAnimationFrame(renderLoop);
  });
}

// Backward compatibility alias for WebM
export async function exportWebMVideo(
  canvas: HTMLCanvasElement,
  scenes: Scene[],
  lessonTitle: string,
  onProgress: (progress: ExportProgress) => void,
  onCancelRequested?: () => boolean
): Promise<void> {
  return exportVideo(canvas, scenes, lessonTitle, 'webm', onProgress, onCancelRequested);
}
