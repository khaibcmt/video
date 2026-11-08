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
} from 'lucide-react';
import { Scene, ExportProgress } from '../types';
import { CanvasRenderer } from '../services/canvasRenderer';
import { audioEngine } from '../services/audioEngine';
import { exportVideo, exportSrtFile, VideoExportFormat } from '../services/exporter';

interface VideoPreviewPlayerProps {
  scenes: Scene[];
  lessonTitle: string;
  onResetVideo: () => void;
  selectedSceneIndex: number;
  onSelectScene: (index: number) => void;
}

export const VideoPreviewPlayer: React.FC<VideoPreviewPlayerProps> = ({
  scenes,
  lessonTitle,
  onResetVideo,
  selectedSceneIndex,
  onSelectScene,
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

  useEffect(() => {
    if (!isPlaying && scenes.length > 0) {
      renderCurrentStaticFrame(selectedSceneIndex, 0.2);
      setActiveSceneIdx(selectedSceneIndex);
    }
  }, [scenes, selectedSceneIndex, isPlaying, renderCurrentStaticFrame]);

  // Main playback loop
  const startPlayback = async (fromSeconds: number = currentTimeSec) => {
    if (scenes.length === 0) return;

    // Cancel any existing animation frame & speech first to prevent overlapping loops
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    audioEngine.stopVoiceover();

    await audioEngine.ensureContext();
    if (!isMuted) {
      audioEngine.startBackgroundMusic();
    }

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

    // Trigger narration for the current scene
    if (!isMuted) {
      audioEngine.playVietnameseNarration(scenes[startIdx].narration_normalized);
    }

    let currentIdx = startIdx;
    let sceneStartTimestamp = performance.now() - initialSceneElapsed * 1000;

    const tick = () => {
      const now = performance.now();
      const currentScene = scenes[currentIdx];
      if (!currentScene) {
        pausePlayback();
        return;
      }

      const sceneElapsed = (now - sceneStartTimestamp) / 1000;
      const baseDuration = currentScene.duration_seconds;

      // Calculate total elapsed time for scrubber bar
      const priorDuration = scenes
        .slice(0, currentIdx)
        .reduce((acc, s) => acc + s.duration_seconds, 0);
      const elapsedTotal = Math.min(
        totalDuration,
        priorDuration + Math.min(sceneElapsed, baseDuration)
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
        sceneStartTimestamp = performance.now();
        setActiveSceneIdx(currentIdx);
        onSelectScene(currentIdx);

        if (!isMuted) {
          audioEngine.playVietnameseNarration(scenes[currentIdx].narration_normalized);
        }
      }

      const activeScene = scenes[currentIdx];
      const activeElapsed = (performance.now() - sceneStartTimestamp) / 1000;
      const sceneProgress = Math.min(1.0, activeElapsed / activeScene.duration_seconds);

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
    if (isPlaying) {
      pausePlayback();
    } else {
      if (currentTimeSec >= totalDuration - 0.5) {
        startPlayback(0);
      } else {
        startPlayback(currentTimeSec);
      }
    }
  };

  const handleReplay = () => {
    pausePlayback();
    setCurrentTimeSec(0);
    startPlayback(0);
  };

  const handleSeek = (newTimeSec: number) => {
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
      startPlayback(clamped);
    } else {
      renderCurrentStaticFrame(idx, (clamped - acc) / scenes[idx].duration_seconds);
    }
  };

  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (nextMute) {
      audioEngine.stopAll();
    } else if (isPlaying) {
      audioEngine.startBackgroundMusic();
      const current = scenes[activeSceneIdx];
      if (current) {
        audioEngine.playVietnameseNarration(current.narration_normalized);
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

  // Export handlers
  const handleExport = async (format: VideoExportFormat = 'mp4') => {
    if (!canvasRef.current || scenes.length === 0) return;
    pausePlayback();

    cancelExportRef.current = false;
    setExportProgress({
      isExporting: true,
      progressPercent: 0,
      currentSceneIndex: 0,
      totalScenes: scenes.length,
      timeRemainingSec: totalDuration,
      statusText: `Đang chuẩn bị luồng ghi hình định dạng ${format.toUpperCase()}...`,
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
      alert(err.message || 'Không thể xuất phụ đề');
    }
  };

  // Helper formatting mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div
      ref={containerRef}
      className="bg-slate-900/95 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col relative group/player"
    >
      {/* Canvas Video Viewport (16:9 Aspect Ratio) */}
      <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden">
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="w-full h-full object-contain cursor-pointer"
          onClick={handleTogglePlay}
        />

        {/* Center Play Overlay Icon when paused */}
        {!isPlaying && !exportProgress?.isExporting && scenes.length > 0 && (
          <button
            onClick={handleTogglePlay}
            className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-amber-500/90 hover:bg-amber-400 text-slate-950 flex items-center justify-center shadow-2xl shadow-amber-500/50 backdrop-blur-md transform transition hover:scale-110 active:scale-95"
            aria-label="Phát video"
          >
            <Play className="w-8 h-8 ml-1 fill-current" />
          </button>
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
              Nhập kịch bản ở khung bên trái hoặc chọn kịch bản mẫu và nhấn "✨ Phân Tích & Dựng Phân Cảnh" để Gemini AI tự động tạo video 16:9 với hiệu ứng Ken Burns và lồng tiếng Việt.
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
              Đang Render & Xuất Video Chuẩn Điện Ảnh (1280x720)
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
        <div className="flex items-center gap-3">
          <button
            onClick={handleTogglePlay}
            disabled={scenes.length === 0}
            className="p-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition shadow-md shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            title={isPlaying ? 'Tạm dừng (Space)' : 'Phát (Space)'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
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
            title={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
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

          {/* Audio Ducking Live Telemetry (in control bar, keeping video canvas clean) */}
          <div
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-all ${
              isDuckingActive
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-sm'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
            title="Trạng thái Audio Ducking: Giọng đọc 100%, Nhạc nền tự hạ khi có giọng nói"
          >
            <div className="flex items-center gap-1">
              <Mic
                className={`w-3 h-3 ${
                  isDuckingActive ? 'text-amber-400 animate-pulse' : 'text-slate-400'
                }`}
              />
              <span>Voice: 100%</span>
            </div>
            <span className="text-slate-600">•</span>
            <div className="flex items-center gap-1">
              <Music className="w-3 h-3 text-cyan-400" />
              <span>BGM: {isDuckingActive ? '6%' : `${Math.round(currentMusicGain * 100)}%`}</span>
            </div>
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
