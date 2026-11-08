export type CameraMotion = 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';

export type LutStyle =
  | 'cinematic-teal-orange'
  | 'warm-golden'
  | 'natural-documentary'
  | 'high-contrast';

export type SubjectOption = 'Sinh học' | 'Công nghệ' | 'Vật lý' | 'Hóa học';

export type DirectorDurationOption = 60 | 120 | 180;

export interface Scene {
  scene_id: number;
  title: string;
  pedagogical_section?: string;
  narration_vi: string;
  narration_normalized: string;
  exact_video_search_en?: string;
  search_keywords_en: string;
  visual_prompt_en?: string;
  wikipedia_topic_en?: string;
  camera_motion: CameraMotion;
  lut_style: LutStyle;
  duration_seconds: number;
  videoUrl?: string;
  videoElement?: HTMLVideoElement | null;
  videoLoaded?: boolean;
  videoCandidateUrls?: string[];
  videoCandidateIndex?: number;
  videoSourceLabel?: string;
  imageUrl?: string;
  imageElement?: HTMLImageElement | null;
  imageLoaded?: boolean;
  imageFailed?: boolean;
  imageSourceType?: 'video' | 'ai' | 'wikipedia' | 'wikimedia' | 'procedural';
  audioBlobUrl?: string;
  audioDuration?: number;
}

export type ThinkingLevelOption = 'low' | 'medium' | 'high';

export interface KeyStatus {
  key: string;
  masked: string;
  status: 'active' | 'exhausted' | 'invalid' | 'testing';
  requestsCount: number;
  lastUsed?: number;
  errorMessage?: string;
}

export interface KeyRotationLog {
  id: string;
  timestamp: number;
  type: 'switch' | 'exhausted_429' | 'invalid_403' | 'success' | 'all_exhausted';
  message: string;
  fromKey?: string;
  toKey?: string;
}

export interface VideoProject {
  title: string;
  rawScript: string;
  scenes: Scene[];
  totalDuration: number;
  createdAt: number;
}

export interface ExportProgress {
  isExporting: boolean;
  progressPercent: number;
  currentSceneIndex: number;
  totalScenes: number;
  timeRemainingSec: number;
  statusText: string;
}
