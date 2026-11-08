export type CameraMotion = 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';

export type LutStyle =
  | 'cinematic-teal-orange'
  | 'warm-golden'
  | 'natural-documentary'
  | 'high-contrast';

export interface Scene {
  scene_id: number;
  title: string;
  narration_vi: string;
  narration_normalized: string;
  search_keywords_en: string;
  visual_prompt_en?: string;
  wikipedia_topic_en?: string;
  camera_motion: CameraMotion;
  lut_style: LutStyle;
  duration_seconds: number;
  videoUrl?: string;
  videoElement?: HTMLVideoElement | null;
  videoLoaded?: boolean;
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
