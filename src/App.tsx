import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { ScriptInputPanel } from './components/ScriptInputPanel';
import { VideoPreviewPlayer } from './components/VideoPreviewPlayer';
import { SceneListEditor } from './components/SceneListEditor';
import { KeyManagerModal } from './components/KeyManagerModal';
import { Scene, ThinkingLevelOption, CameraMotion, LutStyle } from './types';
import { analyzeScript, calculateSceneDuration, normalizeVietnameseNumbers } from './services/scriptAnalyzer';
import { searchWikimediaCommons, loadImageWithFallback } from './services/mediaLoader';
import { audioEngine } from './services/audioEngine';

// Default initial scenes so the application opens immediately ready to play with no blank screen!
const INITIAL_SCENES: Scene[] = [
  {
    scene_id: 1,
    title: 'Kỳ Quan Vịnh Hạ Long',
    narration_vi: 'Vịnh Hạ Long là di sản thiên nhiên thế giới với hơn 1.600 hòn đảo đá vôi kỳ vĩ trải rộng trên diện tích 1.553 km2.',
    narration_normalized: 'Vịnh Hạ Long là di sản thiên nhiên thế giới với hơn một nghìn sáu trăm hòn đảo đá vôi kỳ vĩ trải rộng trên diện tích một nghìn năm trăm năm mươi ba ki-lô-mét vuông.',
    search_keywords_en: 'Ha Long Bay limestone cliffs',
    camera_motion: 'zoom-in',
    lut_style: 'cinematic-teal-orange',
    duration_seconds: 9,
  },
  {
    scene_id: 2,
    title: 'Hang Động Lung Linh',
    narration_vi: 'Trải qua hơn 500 triệu năm kiến tạo, hệ thống hang động như động Thiên Cung, hang Sửng Sốt với chiều dài hơn 120 mét sở hữu thạch nhũ huyền ảo.',
    narration_normalized: 'Trải qua hơn năm trăm triệu năm kiến tạo, hệ thống hang động như động Thiên Cung, hang Sửng Sốt với chiều dài hơn một trăm hai mươi mét sở hữu thạch nhũ huyền ảo.',
    search_keywords_en: 'Sung Sot cave Ha Long',
    camera_motion: 'pan-right',
    lut_style: 'warm-golden',
    duration_seconds: 11,
  },
  {
    scene_id: 3,
    title: 'Nhịp Sống Làng Chài',
    narration_vi: 'Mỗi năm, nơi đây đón hơn 4.000.000 lượt du khách quốc tế chiêm ngưỡng làn nước xanh ngọc bích và vẻ đẹp mộc mạc của các làng chài cổ kính.',
    narration_normalized: 'Mỗi năm, nơi đây đón hơn bốn triệu lượt du khách quốc tế chiêm ngưỡng làn nước xanh ngọc bích và vẻ đẹp mộc mạc của các làng chài cổ kính.',
    search_keywords_en: 'Ha Long Bay floating fishing village',
    camera_motion: 'zoom-out',
    lut_style: 'natural-documentary',
    duration_seconds: 10,
  },
];

export default function App() {
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.8-flash');
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevelOption>('medium');
  const [isKeyManagerOpen, setIsKeyManagerOpen] = useState<boolean>(false);

  // Script & Video project state
  const [lessonTitle, setLessonTitle] = useState<string>('Hanh_Trinh_Kham_Pha_Vinh_Ha_Long');
  const [scriptText, setScriptText] = useState<string>(
    `Vịnh Hạ Long là di sản thiên nhiên thế giới với hơn 1.600 hòn đảo đá vôi kỳ vĩ trải rộng trên diện tích 1.553 km2. Trải qua hơn 500 triệu năm kiến tạo, hệ thống hang động như động Thiên Cung, hang Sửng Sốt với chiều dài hơn 120 mét sở hữu thạch nhũ huyền ảo. Mỗi năm, nơi đây đón hơn 4.000.000 lượt du khách quốc tế chiêm ngưỡng làn nước xanh ngọc bích và vẻ đẹp mộc mạc của các làng chài cổ kính.`
  );
  const [scenes, setScenes] = useState<Scene[]>(INITIAL_SCENES);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>('');

  // Preload images for scenes
  const loadMediaForScenes = useCallback(async (scenesToLoad: Scene[]) => {
    const updatedScenes = [...scenesToLoad];

    await Promise.allSettled(
      updatedScenes.map(async (scene, index) => {
        try {
          const imageUrl = await searchWikimediaCommons(scene.search_keywords_en);
          if (imageUrl) {
            const imgElement = await loadImageWithFallback(imageUrl);
            setScenes((prev) => {
              const copy = [...prev];
              if (copy[index]) {
                copy[index] = {
                  ...copy[index],
                  imageUrl,
                  imageElement: imgElement,
                  imageLoaded: true,
                  imageFailed: false,
                };
              }
              return copy;
            });
          }
        } catch {
          // Keep procedural background fallback
          setScenes((prev) => {
            const copy = [...prev];
            if (copy[index]) {
              copy[index] = {
                ...copy[index],
                imageLoaded: false,
                imageFailed: true,
              };
            }
            return copy;
          });
        }
      })
    );
  }, []);

  // Preload initial scenes images on mount
  useEffect(() => {
    loadMediaForScenes(INITIAL_SCENES);
  }, [loadMediaForScenes]);

  // Handle Gemini Script Analysis
  const handleAnalyzeScript = async () => {
    if (!scriptText.trim()) return;

    audioEngine.stopAll();
    setIsAnalyzing(true);
    setAnalysisStatus('Đang gửi kịch bản vào Gemini API (Xoay vòng Multi-Key)...');

    try {
      const generatedScenes = await analyzeScript({
        script: scriptText,
        model: selectedModel,
        thinkingLevel,
        onStatusUpdate: (msg) => setAnalysisStatus(msg),
      });

      setScenes(generatedScenes);
      setSelectedSceneIndex(0);
      setAnalysisStatus('Đang nạp tư liệu bản quyền mở từ Wikimedia Commons...');

      // Load media in background
      loadMediaForScenes(generatedScenes);
    } catch (err: any) {
      console.error('Script analysis error:', err);
      const errMsg = err?.message || 'Không thể phân tích kịch bản.';
      
      // If error indicates missing API key on GitHub Pages, open Key Manager modal
      if (errMsg.includes('API Key') || errMsg.includes('Quản Lý Keys')) {
        setIsKeyManagerOpen(true);
      }
      
      alert(errMsg);
    } finally {
      setIsAnalyzing(false);
      setAnalysisStatus('');
    }
  };

  /**
   * YÊU CẦU 5: Nút "🔄 Tạo Mới Video"
   * - Dừng ngay lập tức mọi luồng phát âm thanh và video đang chạy.
   * - Xóa sạch nội dung ô kịch bản, làm mới danh sách phân cảnh và đặt lại con trỏ chuột vào khung nhập liệu sẵn sàng cho kịch bản tiếp theo.
   */
  const handleResetVideo = () => {
    // 1. Dừng ngay lập tức mọi luồng phát âm thanh & video
    audioEngine.stopAll();

    // 2. Xóa sạch nội dung ô kịch bản và làm mới danh sách phân cảnh
    setScriptText('');
    setLessonTitle('Bai_Hoc_Moi');
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
      title: `Phân cảnh mới ${newId}`,
      narration_vi: 'Nhập nội dung lời bình tiếng Việt cho phân cảnh này.',
      narration_normalized: 'Nhập nội dung lời bình tiếng Việt cho phân cảnh này.',
      search_keywords_en: 'vietnam nature travel',
      camera_motion: 'zoom-in',
      lut_style: 'cinematic-teal-orange',
      duration_seconds: 6,
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
        {/* Left Column (5 cols): Script Input Panel & Scene Editor */}
        <div className="lg:col-span-5 flex flex-col gap-6 order-2 lg:order-1">
          <ScriptInputPanel
            lessonTitle={lessonTitle}
            onLessonTitleChange={setLessonTitle}
            scriptText={scriptText}
            onScriptTextChange={setScriptText}
            isAnalyzing={isAnalyzing}
            onAnalyzeScript={handleAnalyzeScript}
            onResetVideo={handleResetVideo}
            analysisStatus={analysisStatus}
          />

          <SceneListEditor
            scenes={scenes}
            selectedSceneIndex={selectedSceneIndex}
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
            lessonTitle={lessonTitle}
            onResetVideo={handleResetVideo}
            selectedSceneIndex={selectedSceneIndex}
            onSelectScene={setSelectedSceneIndex}
          />

          {/* Feature Architecture Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
              <span className="text-amber-400 font-bold block mb-1">
                ⚡ Multi-Key Failover
              </span>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Xoay vòng Round-Robin liên tục. Tự động chuyển đổi tức thời khi gặp lỗi 429 hoặc 403 mà không làm gián đoạn tiến trình.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
              <span className="text-cyan-400 font-bold block mb-1">
                🎥 Ken Burns & LUT Canvas
              </span>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Canvas 16:9 (1280x720) 30fps với chuyển cảnh mờ dần, bộ lọc màu điện ảnh và tự sinh nền Procedural Gradient nếu không có ảnh.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
              <span className="text-emerald-400 font-bold block mb-1">
                🎙️ Vietnamese Audio Ducking
              </span>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Web Audio API tự động giảm nhạc nền xuống 6% khi đọc thoại tiếng Việt và hồi phục về 25% khi dứt câu.
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
