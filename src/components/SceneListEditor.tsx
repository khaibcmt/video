import React, { useRef, useState } from 'react';
import {
  Film,
  Camera,
  Palette,
  Volume2,
  Trash2,
  ChevronUp,
  ChevronDown,
  Plus,
  RefreshCw,
  Upload,
  Search,
  CheckCircle2,
  Clock,
  Video,
} from 'lucide-react';
import { Scene, CameraMotion, LutStyle } from '../types';
import { audioEngine } from '../services/audioEngine';
import {
  fetchVerifiedSceneMedia,
  switchSceneToNextVideoClip,
} from '../services/mediaLoader';
import { translateNarrationToVideoQueries } from '../services/videoQueryTranslator';
import { calculateSceneDuration, normalizeVietnameseNumbers } from '../services/scriptAnalyzer';

interface SceneListEditorProps {
  scenes: Scene[];
  selectedSceneIndex: number;
  targetDurationSec?: number;
  onSyncToTargetDuration?: () => void;
  onSelectScene: (index: number) => void;
  onUpdateScene: (index: number, updated: Partial<Scene>) => void;
  onDeleteScene: (index: number) => void;
  onMoveScene: (index: number, direction: 'up' | 'down') => void;
  onAddScene: () => void;
}

export const SceneListEditor: React.FC<SceneListEditorProps> = ({
  scenes,
  selectedSceneIndex,
  targetDurationSec = 60,
  onSyncToTargetDuration,
  onSelectScene,
  onUpdateScene,
  onDeleteScene,
  onMoveScene,
  onAddScene,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeUploadIndexRef = useRef<number | null>(null);
  const [switchingSceneIdx, setSwitchingSceneIdx] = useState<number | null>(null);

  const totalCurrentDuration = scenes.reduce((acc, s) => acc + s.duration_seconds, 0);

  const handleTestTts = (scene: Scene) => {
    audioEngine.playVietnameseNarration(scene.narration_normalized);
  };

  /**
   * Cycles to the next MP4/WebM video clip in the scene's topic pool ("🔄 Đổi Video Clip Khác")
   */
  const handleSwitchNextVideoClip = async (index: number) => {
    const scene = scenes[index];
    if (!scene) return;
    setSwitchingSceneIdx(index);
    try {
      const nextMedia = await switchSceneToNextVideoClip(scene, index);
      onUpdateScene(index, {
        videoUrl: nextMedia.videoUrl,
        videoElement: nextMedia.videoElement,
        videoLoaded: true,
        videoCandidateUrls: nextMedia.videoCandidateUrls,
        videoCandidateIndex: nextMedia.videoCandidateIndex,
        videoSourceLabel: nextMedia.videoSourceLabel,
        imageSourceType: 'video',
      });
    } finally {
      setSwitchingSceneIdx(null);
    }
  };

  /**
   * Re-queries the Direct Video Stream Pipeline based on the scene's narration & English keywords
   */
  const handleRefetchVideoFromNarration = async (index: number, customKeywords?: string) => {
    const scene = scenes[index];
    if (!scene) return;
    setSwitchingSceneIdx(index);
    try {
      const translation = translateNarrationToVideoQueries(
        scene.narration_vi,
        customKeywords ?? scene.exact_video_search_en ?? scene.search_keywords_en,
        scene.wikipedia_topic_en
      );
      const effectiveKeywords = customKeywords || translation.primaryQueryEn;

      const media = await fetchVerifiedSceneMedia(
        effectiveKeywords,
        scene.narration_vi,
        undefined,
        scene.visual_prompt_en,
        scene.wikipedia_topic_en,
        scene.scene_id || index + 1,
        0
      );

      onUpdateScene(index, {
        exact_video_search_en: effectiveKeywords,
        search_keywords_en: effectiveKeywords,
        videoUrl: media.videoUrl,
        videoElement: media.videoElement,
        videoLoaded: true,
        videoCandidateUrls: media.videoCandidateUrls,
        videoCandidateIndex: media.videoCandidateIndex,
        videoSourceLabel: media.videoSourceLabel,
        imageUrl: media.imageUrl,
        imageElement: media.imageElement,
        imageLoaded: Boolean(media.imageElement),
        imageSourceType: media.sourceType,
      });
    } finally {
      setSwitchingSceneIdx(null);
    }
  };

  const handleCustomVideoUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    index: number
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const blobUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = 'auto';
    video.onloadeddata = () => {
      video.play().catch(() => {});
      const existingCandidates = scenes[index]?.videoCandidateUrls || [];
      onUpdateScene(index, {
        videoUrl: blobUrl,
        videoElement: video,
        videoLoaded: true,
        videoCandidateUrls: [blobUrl, ...existingCandidates],
        videoCandidateIndex: 0,
        videoSourceLabel: `🎬 Video MP4 Tải Lên (${file.name})`,
        imageSourceType: 'video',
      });
    };
    video.src = blobUrl;
    video.load();
    e.target.value = '';
  };

  const triggerUpload = (index: number) => {
    activeUploadIndexRef.current = index;
    fileInputRef.current?.click();
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
      {/* Hidden File Input strictly for Video (.mp4 / .webm) Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/*"
        className="hidden"
        onChange={(e) => {
          if (activeUploadIndexRef.current !== null) {
            handleCustomVideoUpload(e, activeUploadIndexRef.current);
          }
        }}
      />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
            Danh Sách Phân Cảnh Video MP4 ({scenes.length})
          </h2>
          <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 font-bold border border-slate-700">
            Tổng: {totalCurrentDuration}s
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onSyncToTargetDuration && (
            <button
              onClick={onSyncToTargetDuration}
              type="button"
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-cyan-300 border border-slate-700 flex items-center gap-1 transition"
              title={`Tự động cân đối thời lượng các cảnh để khớp đúng ${targetDurationSec} giây`}
            >
              <Clock className="w-3 h-3 text-cyan-400" />
              <span>Khớp {targetDurationSec}s</span>
            </button>
          )}

          <button
            onClick={onAddScene}
            type="button"
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-amber-300 border border-slate-700 flex items-center gap-1.5 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm Cảnh</span>
          </button>
        </div>
      </div>

      {/* Scene Cards List */}
      <div className="flex flex-col gap-3 max-h-[680px] overflow-y-auto pr-1">
        {scenes.length === 0 && (
          <div className="py-10 px-4 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 text-center flex flex-col items-center justify-center gap-2">
            <Film className="w-6 h-6 text-slate-600" />
            <p className="text-xs font-semibold text-slate-400">
              Danh sách phân cảnh đang trống
            </p>
            <p className="text-[11px] text-slate-500 max-w-xs">
              Nhập tên bài học ở khung trên và nhấn "🚀 TỰ ĐỘNG TẠO KỊCH BẢN & DỰNG VIDEO CHUYỂN ĐỘNG" hoặc bấm "+ Thêm Cảnh" để bắt đầu mới.
            </p>
          </div>
        )}
        {scenes.map((scene, idx) => {
          const isSelected = idx === selectedSceneIndex;
          const isSwitching = switchingSceneIdx === idx;
          const candidateCount = scene.videoCandidateUrls?.length || 1;
          const currentClipNum = ((scene.videoCandidateIndex ?? 0) % candidateCount) + 1;

          return (
            <div
              key={scene.scene_id || idx}
              onClick={() => onSelectScene(idx)}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-slate-800/90 border-amber-500/80 shadow-lg shadow-amber-500/10'
                  : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              {/* Card Header */}
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono text-xs font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  {scene.pedagogical_section && (
                    <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px] font-bold">
                      {scene.pedagogical_section}
                    </span>
                  )}
                  <input
                    type="text"
                    value={scene.title}
                    onChange={(e) => onUpdateScene(idx, { title: e.target.value })}
                    aria-label={`Tiêu đề phân cảnh ${idx + 1}`}
                    className="bg-transparent font-bold text-xs text-white focus:outline-none focus:border-b border-amber-500"
                    placeholder="Tiêu đề phân cảnh"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <div
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700/80 text-[11px] font-mono text-slate-300"
                    title="Điều chỉnh thời lượng phân cảnh (giây)"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                    <input
                      type="number"
                      min={3}
                      max={120}
                      value={scene.duration_seconds}
                      aria-label={`Thời lượng phân cảnh ${idx + 1}`}
                      onChange={(e) => {
                        const val = Math.max(3, Math.min(120, parseInt(e.target.value) || 5));
                        onUpdateScene(idx, { duration_seconds: val });
                      }}
                      className="w-9 bg-transparent text-center font-bold text-amber-300 focus:outline-none focus:bg-slate-900 rounded"
                    />
                    <span className="text-slate-500">s</span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveScene(idx, 'up');
                    }}
                    disabled={idx === 0}
                    aria-label={`Di chuyển cảnh ${idx + 1} lên`}
                    className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-20"
                    title="Di chuyển lên"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveScene(idx, 'down');
                    }}
                    disabled={idx === scenes.length - 1}
                    aria-label={`Di chuyển cảnh ${idx + 1} xuống`}
                    className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-20"
                    title="Di chuyển xuống"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteScene(idx);
                    }}
                    aria-label={`Xóa phân cảnh ${idx + 1}`}
                    className="p-1 rounded text-slate-500 hover:text-rose-400 transition"
                    title="Xóa phân cảnh"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Main Content Row: 100% Real Motion Video Preview Player & Controls */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-3">
                {/* Left (5 cols): Live HTML5 Video MP4/WebM Preview + "🔄 Đổi Video Clip Khác" Button */}
                <div className="md:col-span-5 flex flex-col gap-1.5">
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center group/thumb">
                    <video
                      key={scene.videoUrl || `scene_video_${idx}`}
                      ref={(el) => {
                        if (
                          el &&
                          scene.videoUrl?.startsWith('stream://') &&
                          scene.videoElement?.srcObject &&
                          el.srcObject !== scene.videoElement.srcObject
                        ) {
                          el.srcObject = scene.videoElement.srcObject;
                          el.play().catch(() => {});
                        }
                      }}
                      src={
                        scene.videoUrl && !scene.videoUrl.startsWith('stream://')
                          ? scene.videoUrl
                          : undefined
                      }
                      crossOrigin="anonymous"
                      playsInline
                      muted
                      autoPlay
                      loop
                      data-testid={`scene-video-preview-${idx}`}
                      className="w-full h-full object-cover"
                    />

                    {/* Live Video Clip Status Badge */}
                    <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded bg-emerald-500/90 text-slate-950 font-bold text-[10px] uppercase tracking-wider shadow flex items-center gap-1">
                      <Video className="w-3 h-3" />
                      <span>Clip {currentClipNum}/{candidateCount}</span>
                    </span>

                    {/* Upload Custom MP4 Button in Top-Right Corner */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerUpload(idx);
                      }}
                      aria-label={`Tải video MP4 từ máy cho cảnh ${idx + 1}`}
                      className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-slate-900/85 hover:bg-slate-800 text-cyan-300 border border-slate-700/80 text-[10px] font-semibold flex items-center gap-1 shadow"
                      title="Tải file video (.mp4/.webm) từ máy tính"
                    >
                      <Upload className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Dedicated Button: "🔄 Đổi Video Clip Khác" */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSwitchNextVideoClip(idx);
                    }}
                    disabled={isSwitching}
                    aria-label={`Đổi Video Clip Khác cảnh ${idx + 1}`}
                    className="w-full py-1.5 px-2.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-[11px] font-bold flex items-center justify-center gap-1.5 transition active:scale-98 disabled:opacity-50"
                    title="Đổi ngay sang video MP4 chuyển động kế tiếp cùng chủ đề"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 text-amber-400 ${
                        isSwitching ? 'animate-spin' : ''
                      }`}
                    />
                    <span>
                      {isSwitching ? 'Đang nạp video kế tiếp...' : '🔄 Đổi Video Clip Khác'}
                    </span>
                  </button>
                </div>

                {/* Right (7 cols): Specialized Video Query, Camera Motion, and LUT */}
                <div className="md:col-span-7 flex flex-col justify-between gap-2">
                  {/* Specialized English Video Search Query */}
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 block mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Search className="w-3 h-3 text-emerald-400" /> Từ khóa Video Chuyên Ngành (EN):
                      </span>
                      <span className="text-[10px] text-emerald-400 font-mono">
                        100% Video MP4/WebM
                      </span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={scene.search_keywords_en}
                        aria-label={`Từ khóa tìm kiếm video cảnh ${idx + 1}`}
                        onChange={(e) =>
                          onUpdateScene(idx, { search_keywords_en: e.target.value })
                        }
                        className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                        placeholder="e.g. swimming catfish underwater"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRefetchVideoFromNarration(idx, scene.search_keywords_en);
                        }}
                        aria-label={`Tìm video theo từ khóa cảnh ${idx + 1}`}
                        className="px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 rounded-lg text-emerald-300 text-xs font-semibold flex items-center gap-1 shrink-0 transition"
                        title="Truy vấn video MP4 mới theo từ khóa chuyên ngành này"
                      >
                        <Search className="w-3.5 h-3.5" />
                        <span>Tìm Video</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {/* Camera Motion */}
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 block mb-1 flex items-center gap-1">
                        <Camera className="w-3 h-3 text-amber-400" /> Góc máy Canvas
                      </label>
                      <select
                        value={scene.camera_motion}
                        aria-label={`Chuyển động máy quay cảnh ${idx + 1}`}
                        onChange={(e) =>
                          onUpdateScene(idx, {
                            camera_motion: e.target.value as CameraMotion,
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                      >
                        <option value="zoom-in">Zoom-in (1.0 → 1.08)</option>
                        <option value="zoom-out">Zoom-out (1.08 → 1.0)</option>
                        <option value="pan-left">Pan-left (Phải sang Trái)</option>
                        <option value="pan-right">Pan-right (Trái sang Phải)</option>
                      </select>
                    </div>

                    {/* LUT Style */}
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 block mb-1 flex items-center gap-1">
                        <Palette className="w-3 h-3 text-cyan-400" /> Bộ lọc màu LUT
                      </label>
                      <select
                        value={scene.lut_style}
                        aria-label={`Bộ lọc màu LUT cảnh ${idx + 1}`}
                        onChange={(e) =>
                          onUpdateScene(idx, { lut_style: e.target.value as LutStyle })
                        }
                        className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                      >
                        <option value="cinematic-teal-orange">Teal & Orange</option>
                        <option value="warm-golden">Warm Golden</option>
                        <option value="natural-documentary">Natural Documentary</option>
                        <option value="high-contrast">High Contrast</option>
                      </select>
                    </div>
                  </div>

                  {/* Active Video Stream Info Pill */}
                  <div className="px-2.5 py-1 rounded-lg bg-slate-950/80 border border-slate-800/90 text-[10px] text-slate-400 flex items-center justify-between truncate">
                    <span className="truncate text-emerald-300 font-medium">
                      {scene.videoSourceLabel || '🎬 Luồng Video MP4/WebM Trực Tiếp (Loop 30fps)'}
                    </span>
                    <span className="text-slate-500 font-mono shrink-0 ml-2">Auto-Loop</span>
                  </div>
                </div>
              </div>

              {/* Narration Editor */}
              <div className="space-y-2 pt-1 border-t border-slate-800/60">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <span className="text-[11px] font-medium text-slate-400">
                      Lời bình nguyên bản (Tự động dịch thực thể sang từ khóa Video MP4):
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const translated = translateNarrationToVideoQueries(scene.narration_vi);
                          handleRefetchVideoFromNarration(idx, translated.primaryQueryEn);
                        }}
                        className="text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 transition"
                        title="Trích xuất thực thể từ câu thoại và nạp đúng Video MP4 chuyển động của thực thể đó"
                      >
                        <Search className="w-3 h-3" />
                        Đồng bộ Video theo Lời thoại
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTestTts(scene);
                        }}
                        className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 transition"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        Nghe thử lời thoại
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={scene.narration_vi}
                    aria-label={`Lời bình tiếng Việt phân cảnh ${idx + 1}`}
                    onChange={(e) => {
                      const newText = e.target.value;
                      const norm = normalizeVietnameseNumbers(newText);
                      const dur = calculateSceneDuration(norm);
                      const translated = translateNarrationToVideoQueries(newText);
                      onUpdateScene(idx, {
                        narration_vi: newText,
                        narration_normalized: norm,
                        duration_seconds: dur,
                        search_keywords_en: translated.primaryQueryEn,
                      });
                    }}
                    rows={2}
                    className="w-full bg-slate-950 border border-slate-700/60 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 resize-none font-sans"
                    placeholder="Nhập lời bình tiếng Việt..."
                  />
                </div>

                {/* Normalized text display for TTS */}
                <div className="p-2 rounded-lg bg-slate-950/40 border border-slate-800/80 flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-slate-400 leading-snug">
                    <span className="font-semibold text-slate-300">Chuẩn hóa TTS: </span>
                    <span className="font-mono text-emerald-300/90">
                      {scene.narration_normalized}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
