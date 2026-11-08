import React, { useRef } from 'react';
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
  Sparkles,
} from 'lucide-react';
import { Scene, CameraMotion, LutStyle } from '../types';
import { audioEngine } from '../services/audioEngine';
import {
  fetchVerifiedSceneMedia,
  generateStorySceneImage,
  loadImageWithFallback,
} from '../services/mediaLoader';
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

  const totalCurrentDuration = scenes.reduce((acc, s) => acc + s.duration_seconds, 0);

  const handleTestTts = (scene: Scene) => {
    audioEngine.startBackgroundMusic();
    audioEngine.playVietnameseNarration(scene.narration_normalized);
  };

  const handleRefetchImage = async (index: number, keywords: string) => {
    try {
      const scene = scenes[index];
      const usedUrls = new Set<string>(
        scenes
          .map((s) => s.videoUrl || s.imageUrl)
          .filter((u): u is string => Boolean(u))
      );
      const media = await fetchVerifiedSceneMedia(
        keywords,
        scene?.narration_vi,
        usedUrls,
        scene?.visual_prompt_en,
        scene?.wikipedia_topic_en,
        (scene?.scene_id || index + 1) + Math.floor(Math.random() * 50),
        true
      );
      if (media) {
        onUpdateScene(index, {
          videoUrl: media.videoUrl,
          videoElement: media.videoElement || null,
          videoLoaded: Boolean(media.videoElement),
          imageUrl: media.imageUrl,
          imageElement: media.imageElement || null,
          imageLoaded: Boolean(media.imageElement),
          imageFailed: false,
          imageSourceType: media.sourceType,
        });
      } else {
        onUpdateScene(index, {
          videoLoaded: false,
          imageLoaded: false,
          imageFailed: true,
          imageSourceType: 'procedural',
        });
      }
    } catch {
      onUpdateScene(index, {
        videoLoaded: false,
        imageLoaded: false,
        imageFailed: true,
        imageSourceType: 'procedural',
      });
    }
  };

  const handleGenerateAiSceneImage = async (index: number) => {
    const scene = scenes[index];
    if (!scene) return;
    const promptToUse =
      scene.visual_prompt_en || `${scene.search_keywords_en} - ${scene.narration_vi}`;

    try {
      const aiUrl = await generateStorySceneImage(
        promptToUse,
        (scene.scene_id || index + 1) + Math.floor(Math.random() * 100)
      );
      if (aiUrl) {
        const img = await loadImageWithFallback(aiUrl, 9000);
        onUpdateScene(index, {
          videoUrl: undefined,
          videoElement: null,
          videoLoaded: false,
          imageUrl: aiUrl,
          imageElement: img,
          imageLoaded: true,
          imageFailed: false,
          imageSourceType: 'ai',
        });
        return;
      }
      // Fallback to direct 16:9 story synthesizer
      const cleanPrompt = encodeURIComponent(
        `cinematic 16:9 illustration of ${promptToUse}, vivid storytelling, no text`
      );
      const seed = Math.floor(Math.random() * 10000);
      const streamUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1280&height=720&nologo=true&seed=${seed}`;
      const img = await loadImageWithFallback(streamUrl, 9000);
      onUpdateScene(index, {
        videoUrl: undefined,
        videoElement: null,
        videoLoaded: false,
        imageUrl: streamUrl,
        imageElement: img,
        imageLoaded: true,
        imageFailed: false,
        imageSourceType: 'ai',
      });
    } catch {
      handleRefetchImage(index, scene.search_keywords_en);
    }
  };

  const handleCustomMediaUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    index: number
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('video/')) {
      const blobUrl = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.onloadeddata = () => {
        video.play().catch(() => {});
        onUpdateScene(index, {
          videoUrl: blobUrl,
          videoElement: video,
          videoLoaded: true,
          imageSourceType: 'video',
          imageFailed: false,
        });
      };
      video.src = blobUrl;
      video.load();
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        onUpdateScene(index, {
          videoUrl: undefined,
          videoElement: null,
          videoLoaded: false,
          imageUrl: dataUrl,
          imageElement: img,
          imageLoaded: true,
          imageFailed: false,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const triggerUpload = (index: number) => {
    activeUploadIndexRef.current = index;
    fileInputRef.current?.click();
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
      {/* Hidden File Input for Video (.mp4/.webm) or Image Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,image/*"
        className="hidden"
        onChange={(e) => {
          if (activeUploadIndexRef.current !== null) {
            handleCustomMediaUpload(e, activeUploadIndexRef.current);
          }
        }}
      />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
            Danh Sách Phân Cảnh ({scenes.length})
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
      <div className="flex flex-col gap-3 max-h-[640px] overflow-y-auto pr-1">
        {scenes.map((scene, idx) => {
          const isSelected = idx === selectedSceneIndex;

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
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono text-xs font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={scene.title}
                    onChange={(e) => onUpdateScene(idx, { title: e.target.value })}
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
                    className="p-1 rounded text-slate-500 hover:text-rose-400 transition"
                    title="Xóa phân cảnh"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Main Content Row: Thumbnail & Controls */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                {/* Thumbnail Preview (Real Video Clip or Image) */}
                <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center group/thumb">
                  {scene.videoUrl && scene.videoLoaded ? (
                    <video
                      src={scene.videoUrl}
                      muted
                      loop
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : scene.imageUrl && scene.imageLoaded ? (
                    <img
                      src={scene.imageUrl}
                      alt={scene.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-2 text-center">
                      <Sparkles className="w-5 h-5 text-amber-400/80 mb-1" />
                      <span className="text-[10px] text-slate-400 font-medium">
                        Nền Procedural Canvas
                      </span>
                    </div>
                  )}

                  {/* Source Badge on Thumbnail */}
                  {scene.imageSourceType === 'video' && (
                    <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-emerald-500/90 text-slate-950 font-bold text-[9px] uppercase tracking-wider shadow">
                      🎬 Video Thật
                    </span>
                  )}
                  {scene.imageSourceType === 'ai' && (
                    <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-amber-500/90 text-slate-950 font-bold text-[9px] uppercase tracking-wider shadow">
                      ✨ Cảnh AI
                    </span>
                  )}

                  {/* Thumbnail Overlay Buttons */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGenerateAiSceneImage(idx);
                      }}
                      className="p-1.5 rounded-lg bg-amber-500/90 hover:bg-amber-400 text-slate-950 text-[10px] font-bold flex items-center gap-1"
                      title="Vẽ cảnh AI 16:9 đồng cấu 100% nội dung câu chuyện"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>AI</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRefetchImage(idx, scene.search_keywords_en);
                      }}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold flex items-center gap-1"
                      title="Tìm cảnh quay video thật (.webm/.mp4) hoặc ảnh Wikipedia"
                    >
                      <Search className="w-3 h-3 text-amber-400" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerUpload(idx);
                      }}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold flex items-center gap-1"
                      title="Tải video (.mp4/.webm) hoặc ảnh từ máy tính"
                    >
                      <Upload className="w-3 h-3 text-cyan-400" />
                    </button>
                  </div>
                </div>

                {/* Motion, LUT, and Keywords */}
                <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Camera Motion */}
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 block mb-1 flex items-center gap-1">
                      <Camera className="w-3 h-3 text-amber-400" /> Chuyển động
                    </label>
                    <select
                      value={scene.camera_motion}
                      onChange={(e) =>
                        onUpdateScene(idx, {
                          camera_motion: e.target.value as CameraMotion,
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                    >
                      <option value="zoom-in">Zoom-in (1.0 → 1.15)</option>
                      <option value="zoom-out">Zoom-out (1.15 → 1.0)</option>
                      <option value="pan-left">Pan-left (Phải sang Trái)</option>
                      <option value="pan-right">Pan-right (Trái sang Phải)</option>
                    </select>
                  </div>

                  {/* LUT Style */}
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 block mb-1 flex items-center gap-1">
                      <Palette className="w-3 h-3 text-cyan-400" /> Bộ lọc LUT
                    </label>
                    <select
                      value={scene.lut_style}
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

                  {/* Search Keywords */}
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 block mb-1 flex items-center gap-1">
                      <Search className="w-3 h-3 text-emerald-400" /> Chủ thể Hình ảnh (EN)
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={scene.search_keywords_en}
                        onChange={(e) =>
                          onUpdateScene(idx, { search_keywords_en: e.target.value })
                        }
                        className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                        placeholder="e.g. Ha Long Bay"
                      />
                      <button
                        type="button"
                        onClick={() => handleGenerateAiSceneImage(idx)}
                        className="p-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded-lg text-amber-300 transition"
                        title="Vẽ ảnh AI 16:9 đồng cấu 100% nội dung cảnh này"
                      >
                        <Sparkles className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRefetchImage(idx, scene.search_keywords_en)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition"
                        title="Đổi ảnh tư liệu khác"
                      >
                        <RefreshCw className="w-3 h-3 text-amber-400" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Narration Editor */}
              <div className="space-y-2 pt-1 border-t border-slate-800/60">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-medium text-slate-400">
                      Lời bình nguyên bản (Hiển thị phụ đề trên video):
                    </span>
                    <button
                      type="button"
                      onClick={() => handleTestTts(scene)}
                      className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 transition"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      Thử giọng đọc + Ducking
                    </button>
                  </div>
                  <textarea
                    value={scene.narration_vi}
                    onChange={(e) => {
                      const newText = e.target.value;
                      const norm = normalizeVietnameseNumbers(newText);
                      const dur = calculateSceneDuration(norm);
                      onUpdateScene(idx, {
                        narration_vi: newText,
                        narration_normalized: norm,
                        duration_seconds: dur,
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
