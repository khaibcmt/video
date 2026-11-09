import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize2,
  Download,
  FileText,
  Mic,
  Music,
  Layers,
  Sparkles,
  Loader2,
  X,
  Subtitles,
  ShieldCheck,
  MonitorPlay,
} from 'lucide-react';
import { Scene, ExportProgress, EngineVisualMode } from '../types';
import { CanvasRenderer } from '../services/canvasRenderer';
import { audioEngine } from '../services/audioEngine';
import { exportVideo, exportSrtFile, VideoExportFormat } from '../services/exporter';
import { waitForSceneMediaReady } from '../services/mediaLoader';
import { selfHealingVisualEngine } from '../services/selfHealingVisualEngine';

interface VideoPreviewPlayerProps {
  scenes: Scene[];
  lessonTitle: string;
  onResetVideo: () => void;
  selectedSceneIndex: number;
  onSelectScene: (index: number) => void;
  engineVisualMode?: EngineVisualMode;
  onEngineVisualModeChange?: (mode: EngineVisualMode) => void;
}

export const VideoPreviewPlayer: React.FC<VideoPreviewPlayerProps> = ({
  scenes,
  lessonTitle,
  onResetVideo,
  selectedSceneIndex,
  onSelectScene,
  engineVisualMode = 'auto-4-stage',
  onEngineVisualModeChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [activeSceneIdx, setActiveSceneIdx] = useState<number>(0);
  const [showSubtitles, setShowSubtitles] = useState<boolean>(true);
  const [showTitleCard, setShowTitleCard] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isDuckingActive, setIsDuckingActive] = useState<boolean>(false);
  const [currentMusicGain, setCurrentMusicGain] = useState<number>(0.25);
  const [showScreenRecordGuide, setShowScreenRecordGuide] = useState<boolean>(false);

  // Export state
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const cancelExportRef = useRef<boolean>(false);

  // Total duration in seconds
  const totalDuration = scenes.reduce((acc, s) => acc + s.duration_seconds, 0);

  // Animation frame reference
  const animFrameRef = useRef<number | null>(null);
  const playStartTimeRef = useRef<number>(0);
  const currentOffsetSecRef = useRef<number>(0);

  // Initialize Canvas Renderer
  useEffect(() => {
    if (canvasRef.current) {
      rendererRef.current = new CanvasRenderer(canvasRef.current);
    }
  }, []);

  // Listen to Audio Ducking state changes
  useEffect(() => {
    const unsub = audioEngine.subscribeDucking((ducked, gainVal) => {
      setIsDuckingActive(ducked);
      setCurrentMusicGain(gainVal);
    });
    return unsub;
  }, []);

  // Render static frame when paused or scene changed externally
  const renderCurrentStaticFrame = useCallback(
    (sceneIdx: number, progressRatio: number = 0.3) => {
      if (!rendererRef.current || scenes.length === 0) return;
      const scene = scenes[sceneIdx] || scenes[0];
      rendererRef.current.render({
        currentScene: scene,
        sceneProgress: progressRatio,
        isTransitioning: false,
        transitionProgress: 0,
        showSubtitles,
        showTitleCard,
      });
    },
    [scenes, showSubtitles, showTitleCard]
  );

  // Render the active scene's live video stream onto the 16:9 Canvas at a gentle interval when timeline is paused
  useEffect(() => {
    if (scenes.length === 0) {
      setIsPlaying(false);
      setCurrentTimeSec(0);
      setActiveSceneIdx(0);
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#05070d';
          ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
      return;
    }

    if (isPlaying) return;

    setActiveSceneIdx(selectedSceneIndex);
    renderCurrentStaticFrame(selectedSceneIndex, 0.2);

    const startPreviewTime = performance.now();
    const intervalId = window.setInterval(() => {
      const elapsed = (performance.now() - startTimeOrZero(startPreviewTime)) / 1000;
      const scene = scenes[selectedSceneIndex] || scenes[0];
      const progressRatio =
        (elapsed % (scene.duration_seconds || 8)) / (scene.duration_seconds || 8);
      renderCurrentStaticFrame(selectedSceneIndex, progressRatio);
    }, 120);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [scenes, selectedSceneIndex, isPlaying, renderCurrentStaticFrame]);

  function startTimeOrZero(t: number) {
    return t || 0;
  }

  // Main playback loop with immediate AudioContext unlock & non-blocking Self-Healing Canvas render
  const startPlayback = async (fromSeconds: number = currentTimeSec) => {
    if (scenes.length === 0) return;

    // 1. Synchronous AudioContext unlock on user gesture (prevents browser Autoplay Policy mute)
    audioEngine.unlockAudioOnUserGesture();

    // Cancel any existing animation frame & speech first to prevent overlapping loops
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    audioEngine.stopVoiceover();

    setIsPlaying(true);

    // Determine starting scene and scene offset
    let accTime = 0;
    let startIdx = 0;
    let initialSceneElapsed = 0;
    for (let i = 0; i < scenes.length; i++) {
      if (fromSeconds >= accTime && fromSeconds < accTime + scenes[i].duration_seconds) {
        startIdx = i;
        initialSceneElapsed = fromSeconds - accTime;
        break;
      }
      accTime += scenes[i].duration_seconds;
    }

    setActiveSceneIdx(startIdx);
    onSelectScene(startIdx);

    // Warm up media in background without delaying audio gesture token!
    void waitForSceneMediaReady(scenes[startIdx], 1200);

    let currentIdx = startIdx;
    let sceneStartTimestamp = performance.now() - initialSceneElapsed * 1000;
    let activeAudioExactDuration: number | null = null;

    // Trigger narration immediately for the current scene and capture exact AudioBuffer.duration
    if (!isMuted) {
      void audioEngine.playVietnameseNarration(
        scenes[startIdx].narration_normalized,
        undefined,
        (exactSec) => {
          activeAudioExactDuration = exactSec;
        }
      );
    }

    const tick = () => {
      const now = performance.now();
      const currentScene = scenes[currentIdx];
      if (!currentScene) {
        pausePlayback();
        return;
      }

      const sceneElapsed = (now - sceneStartTimestamp) / 1000;
      const baseDuration = activeAudioExactDuration || currentScene.duration_seconds;

      // Calculate total elapsed time for scrubber bar
      const priorDuration = scenes
        .slice(0, currentIdx)
        .reduce((acc, s) => acc + s.duration_seconds, 0);
      const elapsedTotal = Math.min(
        totalDuration,
        priorDuration + Math.min(sceneElapsed, currentScene.duration_seconds)
      );
      setCurrentTimeSec(elapsedTotal);

      // Check if scene time is up AND voiceover has finished speaking (prevents cutting off mid-sentence!)
      const voiceStillSpeaking = !isMuted && audioEngine.isCurrentlySpeaking();
      const maxGracePeriod = baseDuration + 8; // safety cap

      if (
        (sceneElapsed >= baseDuration && !voiceStillSpeaking) ||
        sceneElapsed >= maxGracePeriod
      ) {
        // Advance to next scene
        if (currentIdx + 1 >= scenes.length) {
          pausePlayback();
          setCurrentTimeSec(0);
          setActiveSceneIdx(0);
          renderCurrentStaticFrame(0, 0);
          return;
        }

        currentIdx++;
        activeAudioExactDuration = null;
        sceneStartTimestamp = performance.now();
        setActiveSceneIdx(currentIdx);
        onSelectScene(currentIdx);

        const nextSceneToPlay = scenes[currentIdx];
        if (nextSceneToPlay) {
          void waitForSceneMediaReady(nextSceneToPlay, 1000);
          if (!isMuted) {
            void audioEngine.playVietnameseNarration(
              nextSceneToPlay.narration_normalized,
              undefined,
              (exactSec) => {
                activeAudioExactDuration = exactSec;
              }
            );
          }
        }
      }

      const activeScene = scenes[currentIdx];
      const activeElapsed = (performance.now() - sceneStartTimestamp) / 1000;
      const effectiveSceneDur = activeAudioExactDuration || activeScene.duration_seconds;
      const sceneProgress = Math.min(1.0, activeElapsed / Math.max(1, effectiveSceneDur));

      // Transition check (last 0.8s, only when voiceover is done or nearly done)
      const transitionWindow = 0.8;
      const timeLeftInScene = activeScene.duration_seconds - activeElapsed;
      const isTransitioning =
        currentIdx < scenes.length - 1 &&
        timeLeftInScene < transitionWindow &&
        timeLeftInScene > 0 &&
        !audioEngine.isCurrentlySpeaking();
      const transitionProgress = isTransitioning
        ? 1.0 - timeLeftInScene / transitionWindow
        : 0;
      const nextScene = isTransitioning ? scenes[currentIdx + 1] : null;

      if (rendererRef.current) {
        rendererRef.current.render({
          currentScene: activeScene,
          nextScene,
          sceneProgress,
          isTransitioning,
          transitionProgress,
          showSubtitles,
          showTitleCard,
        });
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
  };

  const pausePlayback = () => {
    setIsPlaying(false);
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    audioEngine.stopAll();
  };

  const handleTogglePlay = () => {
    audioEngine.unlockAudioOnUserGesture();
    if (isPlaying) {
      pausePlayback();
    } else {
      if (currentTimeSec >= totalDuration - 0.5) {
        void startPlayback(0);
      } else {
        void startPlayback(currentTimeSec);
      }
    }
  };

  const handleStartLessonWithAudio = () => {
    audioEngine.unlockAudioOnUserGesture();
    setIsMuted(false);
    if (currentTimeSec >= totalDuration - 0.5) {
      void startPlayback(0);
    } else {
      void startPlayback(currentTimeSec);
    }
  };

  const handleReplay = () => {
    audioEngine.unlockAudioOnUserGesture();
    pausePlayback();
    setCurrentTimeSec(0);
    void startPlayback(0);
  };

  const handleSeek = (newTimeSec: number) => {
    audioEngine.unlockAudioOnUserGesture();
    const clamped = Math.max(0, Math.min(totalDuration, newTimeSec));
    setCurrentTimeSec(clamped);

    let acc = 0;
    let idx = 0;
    for (let i = 0; i < scenes.length; i++) {
      if (clamped >= acc && clamped <= acc + scenes[i].duration_seconds) {
        idx = i;
        break;
      }
      acc += scenes[i].duration_seconds;
    }
    setActiveSceneIdx(idx);
    onSelectScene(idx);

    if (isPlaying) {
      pausePlayback();
      void startPlayback(clamped);
    } else {
      renderCurrentStaticFrame(idx, (clamped - acc) / scenes[idx].duration_seconds);
    }
  };

  const handleToggleMute = () => {
    audioEngine.unlockAudioOnUserGesture();
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (nextMute) {
      audioEngine.stopAll();
    } else if (isPlaying) {
      const current = scenes[activeSceneIdx];
      if (current) {
        void audioEngine.playVietnameseNarration(current.narration_normalized);
      }
    }
  };

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Phương Án B (Ultimate Fallback): Chế độ Trình Chiếu Toàn Màn Hình & Quay Màn Hình (Win + G / OBS)
  const handleStartPresentationMode = () => {
    audioEngine.unlockAudioOnUserGesture();
    setIsMuted(false);
    setShowScreenRecordGuide(true);
    if (containerRef.current && !document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    }
    setCurrentTimeSec(0);
    void startPlayback(0);
  };

  // Export handlers
  const handleExport = async (format: VideoExportFormat = 'mp4') => {
    if (!canvasRef.current || scenes.length === 0) return;
    audioEngine.unlockAudioOnUserGesture();
    pausePlayback();

    cancelExportRef.current = false;
    setExportProgress({
      isExporting: true,
      progressPercent: 0,
      currentSceneIndex: 0,
      totalScenes: scenes.length,
      timeRemainingSec: totalDuration,
      statusText: `Đang chuẩn bị luồng ghi hình & lời thoại định dạng ${format.toUpperCase()}...`,
    });

    try {
      await exportVideo(
        canvasRef.current,
        scenes,
        lessonTitle,
        format,
        (prog) => setExportProgress({ ...prog }),
        () => cancelExportRef.current
      );
    } catch (err: any) {
      console.error(`Export ${format.toUpperCase()} Error:`, err);
    } finally {
      setTimeout(() => setExportProgress(null), 2500);
    }
  };

  const handleExportSrt = () => {
    try {
      exportSrtFile(scenes, lessonTitle);
    } catch (err: any) {
      console.error(err.message || 'Không thể xuất phụ đề');
    }
  };

  // Helper formatting mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleSwitchEngineMode = (nextMode: EngineVisualMode) => {
    selfHealingVisualEngine.setEngineMode(nextMode);
    if (onEngineVisualModeChange) {
      onEngineVisualModeChange(nextMode);
    }
    renderCurrentStaticFrame(activeSceneIdx, 0);
  };

  return (
    <div
      ref={containerRef}
      className="bg-slate-900/95 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col relative group/player"
    >
      {/* Top Self-Healing Visual Engine Mode Bar & Phương Án B (Ultimate Fallback) */}
      <div className="px-4 py-2.5 bg-slate-950/95 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 mr-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Self-Healing Engine:</span>
          </span>

          <button
            type="button"
            onClick={() => handleSwitchEngineMode('auto-4-stage')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition flex items-center gap-1 ${
              engineVisualMode === 'auto-4-stage'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Tự động 4 bước: (1) Video MP4 2.5s timeout -> (2) Ảnh AI 1280x720 + Vật lý 2.5D -> (3) Sơ đồ động VTV7 -> (4) Watchdog chống màn hình đen"
          >
            <span>🛡️ Đa Tầng Tự Phục Hồi (4 Bước)</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchEngineMode('ai-25d-autonomous')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition flex items-center gap-1 ${
              engineVisualMode === 'ai-25d-autonomous'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Chế Độ Tự Chủ: Canvas + AI Image 2.5D + WebAudio (Bỏ qua hoàn toàn nguồn Video ngoài, tạo cảnh AI đúng 100% mô tả)"
          >
            <span>⚡ Chế Độ Tự Chủ: Ảnh AI 2.5D + Vật Lý (Bỏ qua Video ngoài)</span>
          </button>
        </div>

        {/* Phương Án B: Trình Chiếu & Quay Màn Hình 100% Thành Công */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleStartPresentationMode}
            disabled={scenes.length === 0}
            className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-[11px] font-semibold flex items-center gap-1.5 transition disabled:opacity-40"
            title="Phương Án B: Mở toàn màn hình 1280x720 kèm tiếng giảng để quay bằng Windows+G hoặc OBS Studio"
          >
            <MonitorPlay className="w-3.5 h-3.5 text-amber-400" />
            <span>🖥️ Trình Chiếu & Quay Màn Hình (Win+G)</span>
          </button>
        </div>
      </div>

      {/* Optional Screen Recording Guide Banner (Phương Án B) */}
      {showScreenRecordGuide && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <MonitorPlay className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Chế độ Trình Chiếu Siêu Ổn Định (Phương Án B):</strong> Nhấn tổ hợp phím{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-amber-500/40 text-amber-300 font-mono text-[11px]">
                Windows + Alt + R
              </kbd>{' '}
              (hoặc <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-amber-500/40 text-amber-300 font-mono text-[11px]">Windows + G</kbd> / OBS) để ghi trực tiếp bài giảng 60fps kèm âm thanh nổi 100%.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowScreenRecordGuide(false)}
            className="text-amber-300 hover:text-white p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Canvas Video Viewport (16:9 Aspect Ratio) */}
      <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden">
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="w-full h-full object-contain cursor-pointer"
          onClick={handleTogglePlay}
        />

        {/* Prominent "🚀 Khởi động & Phát Bài Giảng" Button when paused (Unlocks WebAudio Context on User Gesture) */}
        {!isPlaying && !exportProgress?.isExporting && scenes.length > 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/35 backdrop-blur-[2px] pointer-events-none">
            <button
              type="button"
              onClick={handleStartLessonWithAudio}
              className="pointer-events-auto px-6 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-extrabold text-sm uppercase tracking-wider flex items-center gap-2.5 shadow-2xl shadow-amber-500/50 transform transition hover:scale-105 active:scale-95 border border-yellow-200/60"
              aria-label="Khởi động và Phát Bài Giảng có tiếng"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>🚀 Khởi Động & Phát Bài Giảng (Bật Tiếng AI)</span>
            </button>
            <span className="mt-2 px-3 py-1 rounded-full bg-slate-950/85 border border-slate-700/80 text-[11px] text-emerald-300 font-medium">
              🔊 Đã tích hợp mở khóa WebAudio trực tiếp & chống màn hình đen 4 tầng
            </span>
          </div>
        )}

        {/* Empty state overlay */}
        {scenes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-slate-950/90 backdrop-blur-sm">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-3">
              <Layers className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">
              Chưa có phân cảnh nào được dựng
            </h3>
            <p className="text-xs text-slate-400 max-w-md">
              Nhập Tên bài học & Chỉ dẫn Đạo diễn ở khung bên trái rồi nhấn "🚀 TỰ ĐỘNG TẠO KỊCH BẢN & DỰNG VIDEO CHUYỂN ĐỘNG" để tạo bài giảng 16:9 đồng cấu hình ảnh và giọng giảng tiếng Việt.
            </p>
          </div>
        )}

        {/* Export Progress Overlay */}
        {exportProgress?.isExporting && (
          <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md z-40 flex flex-col items-center justify-center p-6 text-center animate-in fade-in">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 animate-spin">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">
              Đang Render Video & Thu Lời Thoại Tiếng Việt (1280x720)
            </h3>
            <p className="text-xs text-slate-400 max-w-md mb-4">
              {exportProgress.statusText}
            </p>

            {/* Progress bar */}
            <div className="w-full max-w-md bg-slate-800 rounded-full h-3 overflow-hidden mb-2 p-0.5 border border-slate-700">
              <div
                className="bg-gradient-to-r from-amber-500 to-yellow-400 h-full rounded-full transition-all duration-300"
                style={{ width: `${exportProgress.progressPercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between w-full max-w-md text-xs text-slate-400 mb-6">
              <span>{exportProgress.progressPercent}% hoàn thành</span>
              <span>Thời gian còn lại: ~{exportProgress.timeRemainingSec}s</span>
            </div>

            <button
              onClick={() => {
                cancelExportRef.current = true;
              }}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-rose-400 border border-rose-500/30 transition flex items-center gap-1.5"
            >
              <X className="w-4 h-4" />
              Hủy Quá Trình Xuất
            </button>
          </div>
        )}
      </div>

      {/* Scrubber Timeline Bar */}
      <div className="px-5 pt-3 bg-slate-950/80">
        <div className="relative flex items-center">
          <input
            type="range"
            min={0}
            max={totalDuration || 100}
            step={0.1}
            value={currentTimeSec}
            onChange={(e) => handleSeek(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500 hover:accent-amber-400 transition"
          />
        </div>
      </div>

      {/* Control Bar */}
      <div className="px-5 py-3.5 bg-slate-950/90 flex flex-wrap items-center justify-between gap-4 border-t border-slate-800/60">
        {/* Left: Playback buttons & Timecode */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleTogglePlay}
            disabled={scenes.length === 0}
            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-md shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            title={isPlaying ? 'Tạm dừng (Space)' : 'Khởi động & Phát Bài Giảng (Space)'}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>Tạm dừng</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>🚀 Phát Bài Giảng</span>
              </>
            )}
          </button>

          <button
            onClick={handleReplay}
            disabled={scenes.length === 0}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition disabled:opacity-40"
            title="Xem lại từ đầu"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={handleToggleMute}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title={isMuted ? 'Bật âm thanh lời thoại' : 'Tắt âm thanh lời thoại'}
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-rose-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-amber-400" />
            )}
          </button>

          {/* Time display */}
          <div className="font-mono text-xs text-slate-300 flex items-center gap-1 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
            <span className="text-amber-400 font-bold">{formatTime(currentTimeSec)}</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-400">{formatTime(totalDuration)}</span>
          </div>

          {/* Pure Vietnamese Voiceover Status */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-all ${
              isDuckingActive
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-sm'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
            title="Chế độ âm thanh tập trung vào lời thoại tiếng Việt truyền cảm"
          >
            <Mic
              className={`w-3.5 h-3.5 ${
                isDuckingActive ? 'text-amber-400 animate-pulse' : 'text-emerald-400'
              }`}
            />
            <span>
              {isDuckingActive ? '🔊 Đang đọc lời thoại AI' : '🎙️ Lời thoại: Sẵn sàng'}
            </span>
          </div>
        </div>

        {/* Center: Overlays Toggle & Fullscreen */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSubtitles(!showSubtitles)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition ${
              showSubtitles
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
            title="Bật/Tắt phụ đề tiếng Việt"
          >
            <Subtitles className="w-3.5 h-3.5" />
            <span>Phụ Đề</span>
          </button>

          <button
            onClick={handleToggleFullscreen}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Toàn màn hình"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Right: Export & New Video Actions */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Nút Xuất Phụ Đề (.srt) */}
          <button
            onClick={handleExportSrt}
            disabled={scenes.length === 0}
            className="px-3 py-2 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-750 text-xs font-semibold text-slate-200 hover:text-white flex items-center gap-1.5 transition disabled:opacity-40"
            title="Tải tệp phụ đề SubRip .srt chuẩn mốc thời gian"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span>📄 Phụ Đề (.srt)</span>
          </button>

          {/* Nút Xuất Video (.webm) */}
          <button
            onClick={() => handleExport('webm')}
            disabled={scenes.length === 0 || exportProgress?.isExporting}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-100 flex items-center gap-1.5 transition disabled:opacity-40"
            title="Xuất file video chuẩn WebM"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>🎬 WebM (.webm)</span>
          </button>

          {/* Nút Xuất Video (.mp4) - Nút chính */}
          <button
            onClick={() => handleExport('mp4')}
            disabled={scenes.length === 0 || exportProgress?.isExporting}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-amber-500/25 transition transform active:scale-95 disabled:opacity-40"
            title="Gộp Canvas stream + Web Audio stream xuất video MP4 tương thích mọi thiết bị"
          >
            <Download className="w-4 h-4 stroke-[2.5]" />
            <span>🎬 Xuất Video (.mp4)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
