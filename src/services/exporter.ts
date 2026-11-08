import { Scene, ExportProgress } from '../types';
import { audioEngine } from './audioEngine';
import { CanvasRenderer } from './canvasRenderer';

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
 * Exports video as .webm by combining canvas.captureStream(30) and AudioContext stream
 */
export async function exportWebMVideo(
  canvas: HTMLCanvasElement,
  scenes: Scene[],
  lessonTitle: string,
  onProgress: (progress: ExportProgress) => void,
  onCancelRequested?: () => boolean
): Promise<void> {
  if (!scenes || scenes.length === 0) {
    throw new Error('Chưa có phân cảnh nào để xuất video.');
  }

  // Ensure audio context is ready
  await audioEngine.ensureContext();

  const renderer = new CanvasRenderer(canvas);
  const canvasStream = canvas.captureStream(30);
  const audioStream = audioEngine.getAudioStream();

  const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
  if (audioStream && audioStream.getAudioTracks().length > 0) {
    tracks.push(audioStream.getAudioTracks()[0]);
  }

  const combinedStream = new MediaStream(tracks);

  // Supported MIME type detection
  let mimeType = 'video/webm;codecs=vp9,opus';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm;codecs=vp8,opus';
  }
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm';
  }

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 3_500_000, // 3.5 Mbps for crisp 720p
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  const totalDurationSec = scenes.reduce((acc, s) => acc + s.duration_seconds, 0);

  return new Promise(async (resolve, reject) => {
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

        const fileName = `${cleanName}_${timestamp}.webm`;

        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

        onProgress({
          isExporting: false,
          progressPercent: 100,
          currentSceneIndex: scenes.length - 1,
          totalScenes: scenes.length,
          timeRemainingSec: 0,
          statusText: 'Xuất video thành công!',
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

    // Start background music
    await audioEngine.startBackgroundMusic();
    recorder.start(500);

    let currentSceneIndex = 0;
    let sceneStartTime = performance.now();
    let accumulatedTime = 0;

    const renderLoop = async () => {
      if (onCancelRequested && onCancelRequested()) {
        isCancelled = true;
        recorder.stop();
        return;
      }

      if (currentSceneIndex >= scenes.length) {
        // Finished all scenes
        recorder.stop();
        return;
      }

      const scene = scenes[currentSceneIndex];
      const now = performance.now();
      const sceneElapsed = (now - sceneStartTime) / 1000;
      const sceneDuration = scene.duration_seconds;

      accumulatedTime =
        scenes.slice(0, currentSceneIndex).reduce((acc, s) => acc + s.duration_seconds, 0) +
        sceneElapsed;

      const progressPercent = Math.min(99, Math.round((accumulatedTime / totalDurationSec) * 100));
      const timeRemaining = Math.max(0, Math.round(totalDurationSec - accumulatedTime));

      onProgress({
        isExporting: true,
        progressPercent,
        currentSceneIndex,
        totalScenes: scenes.length,
        timeRemainingSec: timeRemaining,
        statusText: `Đang render phân cảnh ${currentSceneIndex + 1}/${scenes.length}: ${scene.title}`,
      });

      // Transition check (last 0.8s)
      const transitionDuration = 0.8;
      const timeLeftInScene = sceneDuration - sceneElapsed;
      const isTransitioning =
        currentSceneIndex < scenes.length - 1 && timeLeftInScene < transitionDuration;
      const transitionProgress = isTransitioning
        ? 1.0 - timeLeftInScene / transitionDuration
        : 0;

      const nextScene = isTransitioning ? scenes[currentSceneIndex + 1] : null;

      renderer.render({
        currentScene: scene,
        nextScene,
        sceneProgress: Math.min(1.0, sceneElapsed / sceneDuration),
        isTransitioning,
        transitionProgress,
        showSubtitles: true,
        showTitleCard: true,
      });

      if (sceneElapsed >= sceneDuration) {
        // Move to next scene
        currentSceneIndex++;
        sceneStartTime = performance.now();

        if (currentSceneIndex < scenes.length) {
          // Play next narration
          const nextSceneObj = scenes[currentSceneIndex];
          audioEngine.playVietnameseNarration(nextSceneObj.narration_normalized);
        }
      }

      requestAnimationFrame(renderLoop);
    };

    // Trigger first scene narration
    audioEngine.playVietnameseNarration(scenes[0].narration_normalized);
    requestAnimationFrame(renderLoop);
  });
}
