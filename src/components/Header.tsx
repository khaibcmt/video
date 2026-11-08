import React, { useState, useEffect } from 'react';
import {
  Film,
  Key,
  Cpu,
  Brain,
  ShieldCheck,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { ThinkingLevelOption } from '../types';
import { keyRotationEngine } from '../services/keyRotation';

interface HeaderProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  thinkingLevel: ThinkingLevelOption;
  onThinkingLevelChange: (level: ThinkingLevelOption) => void;
  onOpenKeyManager: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  selectedModel,
  onModelChange,
  thinkingLevel,
  onThinkingLevelChange,
  onOpenKeyManager,
}) => {
  const [activeKeysCount, setActiveKeysCount] = useState<number>(0);
  const [totalKeysCount, setTotalKeysCount] = useState<number>(0);

  useEffect(() => {
    const updateStats = () => {
      setActiveKeysCount(keyRotationEngine.getActiveKeysCount());
      setTotalKeysCount(keyRotationEngine.getTotalKeysCount());
    };
    updateStats();
    const unsub = keyRotationEngine.subscribe(updateStats);
    return unsub;
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80 px-4 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
      {/* Brand logo & title */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 via-amber-500 to-yellow-400 p-0.5 shadow-lg shadow-amber-500/20 flex items-center justify-center">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Film className="w-5 h-5 text-amber-400" />
            </div>
          </div>
          <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
          </span>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base lg:text-lg font-black tracking-tight text-white flex items-center gap-1.5">
              <span>VietVideo</span>
              <span className="bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">
                Studio
              </span>
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-300 border border-amber-500/25">
              Web Multimedia Engine
            </span>
          </div>
          <p className="text-xs text-slate-400 hidden sm:block">
            Gemini AI Script Analysis • Ken Burns Canvas • Vietnamese TTS • Audio Ducking
          </p>
        </div>
      </div>

      {/* Model & Thinking & Keys Control Bar */}
      <div className="flex items-center flex-wrap gap-2.5">
        {/* Model Selector */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-1.5 shadow-inner">
          <Cpu className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider hidden sm:inline">
            Model:
          </label>
          <select
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value)}
            className="bg-transparent text-xs font-semibold text-slate-100 focus:outline-none cursor-pointer"
          >
            <option value="gemini-3.8-flash" className="bg-slate-900 text-white">
              gemini-3.8-flash (Tốc độ & Thông minh)
            </option>
            <option value="gemini-3.1-flash-lite" className="bg-slate-900 text-white">
              gemini-3.1-flash-lite (Siêu nhanh)
            </option>
            <option value="gemini-3.1-pro-preview" className="bg-slate-900 text-white">
              gemini-3.1-pro-preview (Chuyên sâu)
            </option>
            <option value="gemini-4-argon" className="bg-slate-900 text-white">
              gemini-4-argon (Suy luận cao cấp)
            </option>
          </select>
        </div>

        {/* Thinking Level */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-1.5 shadow-inner">
          <Brain className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider hidden sm:inline">
            Thinking:
          </label>
          <select
            value={thinkingLevel}
            onChange={(e) => onThinkingLevelChange(e.target.value as ThinkingLevelOption)}
            className="bg-transparent text-xs font-semibold text-slate-100 focus:outline-none cursor-pointer"
          >
            <option value="low" className="bg-slate-900 text-white">
              Thấp (Low)
            </option>
            <option value="medium" className="bg-slate-900 text-white">
              Trung bình (Medium)
            </option>
            <option value="high" className="bg-slate-900 text-white">
              Cao (High)
            </option>
          </select>
        </div>

        {/* Multi-Key Rotation Status Button */}
        <button
          onClick={onOpenKeyManager}
          type="button"
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 hover:border-amber-500/50 text-slate-200 text-xs font-semibold transition shadow-sm group"
        >
          <Key className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
          <div className="flex items-center gap-1.5">
            <span className="hidden sm:inline">Keys:</span>
            {totalKeysCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-emerald-400 font-mono font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                {activeKeysCount}/{totalKeysCount}
              </span>
            ) : (
              <span className="text-amber-400/90 text-[11px] font-medium flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Mặc định (Auto)
              </span>
            )}
          </div>
        </button>
      </div>
    </header>
  );
};
