import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { ScriptInputPanel } from './components/ScriptInputPanel';
import { VideoPreviewPlayer } from './components/VideoPreviewPlayer';
import { SceneListEditor } from './components/SceneListEditor';
import { KeyManagerModal } from './components/KeyManagerModal';
import { Scene, ThinkingLevelOption, SubjectOption } from './types';
import {
  analyzeScript,
  scaleScenesToTargetDuration,
} from './services/scriptAnalyzer';
import { fetchVerifiedSceneMedia } from './services/mediaLoader';
import { PRESET_SAMPLE_SCENES } from './services/sampleData';
import { audioEngine } from './services/audioEngine';

// Default initial scenes: Bài 9: Các nhóm thủy sản và phương thức nuôi phổ biến (5 pedagogical scenes)
const INITIAL_SCENES: Scene[] = PRESET_SAMPLE_SCENES.bai_9_thuy_san;

export default function App() {
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.8-flash');
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevelOption>('medium');
  const [isKeyManagerOpen, setIsKeyManagerOpen] = useState<boolean>(false);

  // Autonomous AI Director Mode state
  const [lessonTitle, setLessonTitle] = useState<string>(
    'Bài 9: Các nhóm thủy sản và phương thức nuôi phổ biến'
  );
  const [subject, setSubject] = useState<SubjectOption>('Công nghệ');
  const [scriptText, setScriptText] = useState<string>(
    `Việt Nam có đường bờ biển dài 3.260 km và diện tích mặt nước nội địa rộng lớn, tạo điều kiện cho các nhóm thủy sản bản địa và nhập nội phát triển mạnh. Theo tính chất sinh thái, thủy sản được chia thành nhóm nước ngọt như cá tra, cá rô phi, nhóm nước lợ như tôm thẻ chân trắng, cá chẽm và nhóm nước mặn như cá song, tôm hùm. Trong nuôi trồng hiện đại, phương thức nuôi thâm canh ứng dụng quạt nước tạo oxy trên 5 mg/l kết hợp nuôi tuần hoàn RAS và lồng bè công nghệ cao giúp nâng cao năng suất bền vững.`
  );
  const [targetDurationSec, setTargetDurationSec] = useState<number>(120);
  const [scenes, setScenes] = useState<Scene[]>(INITIAL_SCENES);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>('');

  // Preload distinct, homologous real motion video streams (or Priority 2 HD Ken Burns fallback) per scene in parallel
  const loadMediaForScenes = useCallback(async (scenesToLoad: Scene[]) => {
    const usedUrls = new Set<string>();

    await Promise.all(
      scenesToLoad.map(async (scene, index) => {
        try {
          const media = await fetchVerifiedSceneMedia(
            scene.exact_video_search_en || scene.search_keywords_en,
            scene.narration_vi,
            usedUrls,
            scene.visual_prompt_en,
            scene.wikipedia_topic_en,
            scene.scene_id || index + 1,
            index
          );
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

  // Preload initial scenes media on mount
  useEffect(() => {
    loadMediaForScenes(INITIAL_SCENES);
  }, [loadMediaForScenes]);

  // Handle Autonomous AI Director 1-Click Script & Video Generation
  const handleAnalyzeScript = async () => {
    if (!lessonTitle.trim() && !scriptText.trim()) return;

    audioEngine.stopAll();
    setIsAnalyzing(true);
    setAnalysisStatus(
      `Đang tự động biên soạn kịch bản 4 phần sư phạm (${subject} • ${Math.round(targetDurationSec / 60)} phút)...`
    );

    try {
      const generatedScenes = await analyzeScript({
        script: scriptText,
        topicTitle: lessonTitle,
        subject,
        model: selectedModel,
        thinkingLevel,
        targetDurationSec,
        onStatusUpdate: (msg) => setAnalysisStatus(msg),
      });

      setScenes(generatedScenes);
      setSelectedSceneIndex(0);
      setAnalysisStatus('Đang nạp luồng Video MP4 (kèm cơ chế dự phòng HD Ken Burns)...');

      // Load media in background
      loadMediaForScenes(generatedScenes);
    } catch (err: any) {
      console.error('Script analysis error:', err);
    } finally {
      setIsAnalyzing(false);
      setAnalysisStatus('');
    }
  };

  /**
   * YÊU CẦU 5: Nút "🔄 Tạo Mới Video"
   * - Xóa sạch dữ liệu cũ, dừng toàn bộ video/audio ngầm để sẵn sàng tạo bài học mới.
   */
  const handleResetVideo = () => {
    // 1. Dừng ngay lập tức mọi luồng phát âm thanh
    audioEngine.stopAll();

    // 2. Dừng toàn bộ thẻ <video> chạy ngầm trong bộ nhớ của các phân cảnh cũ
    scenes.forEach((sc) => {
      try {
        if (sc.videoElement) {
          sc.videoElement.pause();
          sc.videoElement.removeAttribute('src');
          sc.videoElement.load();
        }
      } catch {
        // Ignore cleanup errors
      }
    });

    // 3. Xóa sạch dữ liệu cũ để sẵn sàng tạo bài học mới
    setLessonTitle('');
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
      if (target?.videoElement) {
        try {
          target.videoElement.pause();
        } catch {
          // ignore
        }
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
    const newScene: Scene = {
      scene_id: newId,
      pedagogical_section: 'Phần 4: Ứng dụng thực tiễn & Tổng kết',
      title: `Phân cảnh mới ${newId}`,
      narration_vi: 'Nhập nội dung lời bình tiếng Việt cho phân cảnh này.',
      narration_normalized: 'Nhập nội dung lời bình tiếng Việt cho phân cảnh này.',
      exact_video_search_en: 'swimming catfish underwater',
      search_keywords_en: 'swimming catfish underwater',
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
        {/* Left Column (5 cols): Quick Director Bar & Scene Editor */}
        <div className="lg:col-span-5 flex flex-col gap-6 order-2 lg:order-1">
          <ScriptInputPanel
            lessonTitle={lessonTitle}
            onLessonTitleChange={setLessonTitle}
            subject={subject}
            onSubjectChange={setSubject}
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

        {/* Right Column (7 cols): Video Preview Player (16:9 Canvas + Web Audio) */}
        <div className="lg:col-span-7 flex flex-col gap-6 order-1 lg:order-2">
          <VideoPreviewPlayer
            scenes={scenes}
            lessonTitle={lessonTitle || 'Bai_Giang_AI_Director'}
            onResetVideo={handleResetVideo}
            selectedSceneIndex={selectedSceneIndex}
            onSelectScene={setSelectedSceneIndex}
          />

          {/* Zero-Bug Autonomous AI Director Architecture Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
              <span className="text-amber-400 font-bold block mb-1">
                🧠 Đạo Diễn Sư Phạm 4 Phần
              </span>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Chỉ cần nhập Tên bài + Môn học + Thời lượng, AI tự động sinh kịch bản 4 phần sư phạm và chuẩn hóa 100% số đọc tiếng Việt.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
              <span className="text-cyan-400 font-bold block mb-1">
                🛡️ Strict Media Loader (CORS-Safe)
              </span>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Ưu tiên 1 nạp Video MP4 chuyển động thật; Ưu tiên 2 tự động fallback ảnh HD 16:9 Ken Burns sau 5s để không bao giờ bị màn hình đen.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
              <span className="text-emerald-400 font-bold block mb-1">
                🎬 Đồng Bộ Canvas & Xuất Video
              </span>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Kiểm tra bộ nhớ đệm (canplaythrough / onload) trước khi phát giọng đọc tiếng Việt và thu trọn luồng Canvas + Audio ra file MP4/WebM.
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
