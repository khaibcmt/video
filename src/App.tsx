import React, { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { ScriptInputPanel } from './components/ScriptInputPanel';
import { VideoPreviewPlayer } from './components/VideoPreviewPlayer';
import { SceneListEditor } from './components/SceneListEditor';
import { KeyManagerModal } from './components/KeyManagerModal';
import { Scene, ThinkingLevelOption, SubjectOption, VoiceSettings } from './types';
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
  const [scriptText, setScriptText] = useState<string>('');
  const [targetDurationSec, setTargetDurationSec] = useState<number>(60);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>('');

  const handleVoiceSettingsChange = (updated: Partial<VoiceSettings>) => {
    audioEngine.updateVoiceSettings(updated);
    setVoiceSettings(audioEngine.getVoiceSettings());
  };

  // Preload distinct, homologous real motion video streams + Multi-Beat media per scene in parallel
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
              index
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
                  videoLoaded: true,
                  videoCandidateUrls: media.videoCandidateUrls,
                  videoCandidateIndex: media.videoCandidateIndex,
                  videoSourceLabel: media.videoSourceLabel,
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

  // Handle Autonomous AI Director V3.0 1-Click Script & Video Generation
  const handleAnalyzeScript = async () => {
    if (!lessonTitle.trim() && !scriptText.trim() && !directorInstructions.trim()) return;

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
        'Đang nạp luồng Multi-Beat Video MP4 & tổng hợp giọng đọc Neural AI...'
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
      pedagogical_section: 'Phần 4: Ứng dụng thực tiễn & Tổng kết',
      title: `Phân cảnh mới ${newId}`,
      narration_vi: defaultNarration,
      narration_normalized: defaultNarration,
      exact_video_search_en: 'swimming catfish underwater',
      search_keywords_en: 'swimming catfish underwater',
      pedagogical_badge: 'Kiến thức trọng tâm',
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

        {/* Right Column (7 cols): Video Preview Player (16:9 Canvas + Studio WebAudio) */}
        <div className="lg:col-span-7 flex flex-col gap-6 order-1 lg:order-2">
          <VideoPreviewPlayer
            scenes={scenes}
            lessonTitle={lessonTitle || 'Bai_Giang_AI_Director_V3'}
            onResetVideo={handleResetVideo}
            selectedSceneIndex={selectedSceneIndex}
            onSelectScene={setSelectedSceneIndex}
          />

          {/* V3.0 Architecture Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
              <span className="text-amber-400 font-bold block mb-1">
                🧠 Gemini Scene-Graph & Visual Beats
              </span>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Chia mỗi cảnh thành 2–3 nhịp hình ảnh (Visual Beats) khớp từng cụm lời thoại, tự động gắn nhãn công thức và hiểu sâu Chỉ dẫn Đạo diễn.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
              <span className="text-emerald-400 font-bold block mb-1">
                🎙️ Human-Like Neural Voice & Studio EQ
              </span>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Giọng Cô Giáo / Thầy Giáo truyền cảm qua chuỗi lọc phòng thu BiquadFilter (+3dB@180Hz, +2dB@6000Hz), DynamicsCompressor & Audio Ducking -18dB.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
              <span className="text-cyan-400 font-bold block mb-1">
                🎬 Đồng Bộ AudioBuffer & Xuất MP4 Có Tiếng
              </span>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Khớp tuyệt đối khung hình, phụ đề Karaoke & sóng âm theo AudioBuffer.duration, thu trực tiếp luồng tiếng vào file MP4/WebM.
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
