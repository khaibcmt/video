import React, { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { ScriptInputPanel } from './components/ScriptInputPanel';
import { VideoPreviewPlayer } from './components/VideoPreviewPlayer';
import { SceneListEditor } from './components/SceneListEditor';
import { KeyManagerModal } from './components/KeyManagerModal';
import {
  Scene,
  ThinkingLevelOption,
  SubjectOption,
  VoiceSettings,
  EngineVisualMode,
} from './types';
import {
  analyzeScript,
  scaleScenesToTargetDuration,
  buildVisualBeatsForScene,
} from './services/scriptAnalyzer';
import {
  fetchVerifiedSceneMedia,
  loadSceneVisualBeats,
  releaseAllSceneMedia,
} from './services/mediaLoader';
import { audioEngine } from './services/audioEngine';
import { selfHealingVisualEngine } from './services/selfHealingVisualEngine';

export default function App() {
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.8-flash');
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevelOption>('medium');
  const [isKeyManagerOpen, setIsKeyManagerOpen] = useState<boolean>(false);

  // Clean, blank initial state ("trang mới tinh") with V3.0 Director & Neural Voice controls
  const [lessonTitle, setLessonTitle] = useState<string>('');
  const [subject, setSubject] = useState<SubjectOption>('Sinh học');
  const [directorInstructions, setDirectorInstructions] = useState<string>('');
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() =>
    audioEngine.getVoiceSettings()
  );
  const [engineVisualMode, setEngineVisualMode] = useState<EngineVisualMode>(() =>
    selfHealingVisualEngine.getEngineMode()
  );
  const [scriptText, setScriptText] = useState<string>('');
  const [targetDurationSec, setTargetDurationSec] = useState<number>(60);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>('');

  const handleVoiceSettingsChange = (updated: Partial<VoiceSettings>) => {
    audioEngine.unlockAudioOnUserGesture();
    audioEngine.updateVoiceSettings(updated);
    setVoiceSettings(audioEngine.getVoiceSettings());
  };

  // Preload distinct, homologous real motion video streams + 4-Stage Self-Healing fallback per scene in parallel
  const loadMediaForScenes = useCallback(async (scenesToLoad: Scene[]) => {
    const usedUrls = new Set<string>();

    await Promise.all(
      scenesToLoad.map(async (scene, index) => {
        try {
          const [media, loadedBeats] = await Promise.all([
            fetchVerifiedSceneMedia(
              scene.exact_video_search_en || scene.search_keywords_en,
              scene.narration_vi,
              usedUrls,
              scene.visual_prompt_en,
              scene.wikipedia_topic_en,
              scene.scene_id || index + 1,
              index,
              {
                subject: scene.subject,
                pedagogicalBadge: scene.pedagogical_badge,
                pedagogicalSection: scene.pedagogical_section,
                title: scene.title,
                forcedMode: scene.visualMode || 'auto',
              }
            ),
            loadSceneVisualBeats(scene, usedUrls),
          ]);

          if (media) {
            setScenes((prev) => {
              const copy = [...prev];
              if (copy[index] && copy[index].scene_id === scene.scene_id) {
                copy[index] = {
                  ...copy[index],
                  videoUrl: media.videoUrl,
                  videoElement: media.videoElement,
                  videoLoaded: Boolean(media.videoElement),
                  videoCandidateUrls: media.videoCandidateUrls,
                  videoCandidateIndex: media.videoCandidateIndex,
                  videoSourceLabel: media.videoSourceLabel,
                  fallbackStage: media.fallbackStage,
                  imageUrl: media.imageUrl,
                  imageElement: media.imageElement,
                  imageLoaded: Boolean(media.imageElement),
                  imageSourceType: media.sourceType,
                  visual_beats:
                    loadedBeats.length > 0 ? loadedBeats : copy[index].visual_beats,
                };
              }
              return copy;
            });
          }
        } catch (err) {
          console.error('Video pipeline error for scene:', scene.scene_id, err);
        }
      })
    );
  }, []);

  const handleEngineVisualModeChange = (mode: EngineVisualMode) => {
    selfHealingVisualEngine.setEngineMode(mode);
    setEngineVisualMode(mode);
    if (scenes.length > 0) {
      void loadMediaForScenes(scenes);
    }
  };

  // Handle Autonomous AI Director V3.0 1-Click Script & Video Generation
  const handleAnalyzeScript = async () => {
    if (!lessonTitle.trim() && !scriptText.trim() && !directorInstructions.trim()) return;

    // Unlock browser AudioContext synchronously on click!
    audioEngine.unlockAudioOnUserGesture();
    audioEngine.stopAll();
    setIsAnalyzing(true);
    setAnalysisStatus(
      `Đang biên soạn kịch bản Scene-Graph 4 phần (${subject} • ${Math.round(
        targetDurationSec / 60
      )} phút)...`
    );

    try {
      const generatedScenes = await analyzeScript({
        script: scriptText,
        topicTitle: lessonTitle,
        subject,
        directorInstructions,
        model: selectedModel,
        thinkingLevel,
        targetDurationSec,
        onStatusUpdate: (msg) => setAnalysisStatus(msg),
      });

      setScenes(generatedScenes);
      setSelectedSceneIndex(0);
      setAnalysisStatus(
        'Đang nạp luồng Self-Healing 4 Tầng (Video MP4 / Ảnh AI 2.5D / Sơ đồ VTV7) & tổng hợp giọng đọc Neural AI...'
      );

      // Load media & pre-warm neural voice buffers in background
      void loadMediaForScenes(generatedScenes);
      void audioEngine.preloadNarrations(
        generatedScenes.map((s) => s.narration_normalized)
      );
    } catch (err: any) {
      console.error('Script analysis error:', err);
    } finally {
      setIsAnalyzing(false);
      setAnalysisStatus('');
    }
  };

  /**
   * PHẦN 4.4: Nút "🔄 Tạo Mới Video"
   * - Dừng ngay lập tức mọi AudioBufferSourceNode, đóng các luồng tải ngầm,
   *   giải phóng toàn bộ thẻ <video> (src="", load()) và xóa sạch bộ nhớ đệm để sẵn sàng tạo bài giảng mới.
   */
  const handleResetVideo = () => {
    audioEngine.stopAll();
    audioEngine.clearCache();
    releaseAllSceneMedia(scenes);

    setLessonTitle('');
    setDirectorInstructions('');
    setScriptText('');
    setScenes([]);
    setSelectedSceneIndex(0);
    setAnalysisStatus('');
  };

  // Scene management handlers
  const handleUpdateScene = (index: number, updated: Partial<Scene>) => {
    setScenes((prev) => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], ...updated };
      }
      return copy;
    });
  };

  const handleDeleteScene = (index: number) => {
    setScenes((prev) => {
      const target = prev[index];
      if (target) {
        releaseAllSceneMedia([target]);
      }
      const copy = prev.filter((_, i) => i !== index);
      return copy.map((s, i) => ({ ...s, scene_id: i + 1 }));
    });
    if (selectedSceneIndex >= index && selectedSceneIndex > 0) {
      setSelectedSceneIndex(selectedSceneIndex - 1);
    }
  };

  const handleMoveScene = (index: number, direction: 'up' | 'down') => {
    setScenes((prev) => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy.map((s, i) => ({ ...s, scene_id: i + 1 }));
    });
    setSelectedSceneIndex(direction === 'up' ? index - 1 : index + 1);
  };

  const handleAddScene = () => {
    const newId = scenes.length + 1;
    const defaultNarration = 'Nhập nội dung lời bình tiếng Việt cho phân cảnh này.';
    const newScene: Scene = {
      scene_id: newId,
      subject,
      pedagogical_section: 'Phần 4: Ứng dụng thực tiễn & Tổng kết',
      title: `Phân cảnh mới ${newId}`,
      narration_vi: defaultNarration,
      narration_normalized: defaultNarration,
      exact_video_search_en: 'swimming catfish underwater',
      search_keywords_en: 'swimming catfish underwater',
      pedagogical_badge: 'Kiến thức trọng tâm',
      fallbackStage: 3,
      visualMode: 'auto',
      retryCounter: 0,
      visual_beats: buildVisualBeatsForScene(
        defaultNarration,
        'swimming catfish underwater',
        `Phân cảnh mới ${newId}`
      ),
      camera_motion: 'zoom-in',
      lut_style: 'cinematic-teal-orange',
      duration_seconds: 8,
    };
    setScenes((prev) => [...prev, newScene]);
    setSelectedSceneIndex(scenes.length);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* Top Header */}
      <Header
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        thinkingLevel={thinkingLevel}
        onThinkingLevelChange={setThinkingLevel}
        onOpenKeyManager={() => setIsKeyManagerOpen(true)}
      />

      {/* Main Studio Work Area */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (5 cols): Quick Director Bar V3.0 & Scene Editor */}
        <div className="lg:col-span-5 flex flex-col gap-6 order-2 lg:order-1">
          <ScriptInputPanel
            lessonTitle={lessonTitle}
            onLessonTitleChange={setLessonTitle}
            subject={subject}
            onSubjectChange={setSubject}
            directorInstructions={directorInstructions}
            onDirectorInstructionsChange={setDirectorInstructions}
            voiceSettings={voiceSettings}
            onVoiceSettingsChange={handleVoiceSettingsChange}
            scriptText={scriptText}
            onScriptTextChange={setScriptText}
            targetDurationSec={targetDurationSec}
            onTargetDurationChange={setTargetDurationSec}
            isAnalyzing={isAnalyzing}
            onAnalyzeScript={handleAnalyzeScript}
            onResetVideo={handleResetVideo}
            analysisStatus={analysisStatus}
          />

          <SceneListEditor
            scenes={scenes}
            selectedSceneIndex={selectedSceneIndex}
            targetDurationSec={targetDurationSec}
            onSyncToTargetDuration={() =>
              setScenes((prev) => scaleScenesToTargetDuration(prev, targetDurationSec))
            }
            onSelectScene={setSelectedSceneIndex}
            onUpdateScene={handleUpdateScene}
            onDeleteScene={handleDeleteScene}
            onMoveScene={handleMoveScene}
            onAddScene={handleAddScene}
          />
        </div>

        {/* Right Column (7 cols): Video Preview Player (16:9 Canvas + Studio WebAudio + 4-Stage Self-Healing) */}
        <div className="lg:col-span-7 flex flex-col gap-6 order-1 lg:order-2">
          <VideoPreviewPlayer
            scenes={scenes}
            lessonTitle={lessonTitle || 'Bai_Giang_AI_Director_V3'}
            onResetVideo={handleResetVideo}
            selectedSceneIndex={selectedSceneIndex}
            onSelectScene={setSelectedSceneIndex}
            engineVisualMode={engineVisualMode}
            onEngineVisualModeChange={handleEngineVisualModeChange}
          />

          {/* V3.0 + 4-Stage Self-Healing Architecture Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
              <span className="text-amber-400 font-bold block mb-1">
                🛡️ 4-Stage Self-Healing Visual Engine
              </span>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Tự động chuyển mượt 4 tầng: (1) Video MP4 2.5s timeout → (2) Ảnh AI 1280x720 + Vật lý 2.5D → (3) Đồ họa chuyển động VTV7 → (4) Watchdog chống đen hình.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
              <span className="text-emerald-400 font-bold block mb-1">
                🎙️ Mở Khóa WebAudio & Giọng AI Truyền Cảm
              </span>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Tự động mở khóa AudioContext ngay khi bấm nút, kết hợp đa nguồn TTS tiếng Việt + bộ lọc phòng thu EQ ấm áp và thu trực tiếp vào file xuất.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
              <span className="text-cyan-400 font-bold block mb-1">
                ⚡ Chế Độ Tự Chủ AI 2.5D & Phương Án B
              </span>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Hỗ trợ chế độ tự chủ 100% ảnh AI + hạt vật lý theo môn học và chế độ trình chiếu toàn màn hình để quay nhanh bằng Windows+G / OBS.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Key Manager Modal */}
      <KeyManagerModal
        isOpen={isKeyManagerOpen}
        onClose={() => setIsKeyManagerOpen(false)}
      />
    </div>
  );
}
