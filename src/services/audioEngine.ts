import { VoiceIdOption, VoiceSettings } from '../types';
import { keyRotationEngine } from './keyRotation';

export type DuckingListener = (isDucking: boolean, currentGain: number) => void;

/**
 * Splits a Vietnamese narration text into natural sentence/clause chunks <= 175 characters
 * preserving breath pauses (periods, commas, ellipses) for expressive storytelling.
 */
export function splitTextIntoChunks(text: string, maxChars: number = 175): string[] {
  if (!text || !text.trim()) return [];
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChars) return [cleaned];

  const rawSentences = cleaned.split(/(?<=[.!?;:\n…])\s+/);
  const chunks: string[] = [];
  let current = '';

  const pushOrSplitClause = (segment: string) => {
    const clauses = segment.split(/(?<=[,–—])\s+/);
    for (const clause of clauses) {
      if (!clause.trim()) continue;
      if ((current + ' ' + clause).trim().length <= maxChars) {
        current = (current + ' ' + clause).trim();
      } else {
        if (current) chunks.push(current);
        if (clause.length <= maxChars) {
          current = clause.trim();
        } else {
          const words = clause.split(/\s+/);
          current = '';
          for (const word of words) {
            if ((current + ' ' + word).trim().length <= maxChars) {
              current = (current + ' ' + word).trim();
            } else {
              if (current) chunks.push(current);
              current = word;
            }
          }
        }
      }
    }
  };

  for (const sentence of rawSentences) {
    if (!sentence.trim()) continue;
    if ((current + ' ' + sentence).trim().length <= maxChars) {
      current = (current + ' ' + sentence).trim();
    } else {
      if (current) {
        chunks.push(current);
        current = '';
      }
      if (sentence.length <= maxChars) {
        current = sentence.trim();
      } else {
        pushOrSplitClause(sentence);
      }
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

/**
 * V3.0 VietnameseHumanVoiceEngine
 * - 3-Tier Human-Like Neural TTS Pipeline (Gemini Native Audio / Neural Stream / Emergency SpeechSynthesis)
 * - Studio Voice Mastering Chain: Low-shelf (+3dB @ 180Hz) -> High-shelf (+2dB @ 6000Hz) -> DynamicsCompressor -> AnalyserNode
 * - Educational Ambient Background Music with automatic -18dB Audio Ducking
 * - Direct routing into MediaStreamAudioDestinationNode for 100% MP4/WebM voiceover recording
 */
export class VietnameseHumanVoiceEngine {
  private audioCtx: AudioContext | null = null;

  // Studio Voice Mastering Nodes
  private lowShelfFilter: BiquadFilterNode | null = null;
  private highShelfFilter: BiquadFilterNode | null = null;
  private studioCompressor: DynamicsCompressorNode | null = null;
  private voiceAnalyser: AnalyserNode | null = null;
  private analyserDataArray: Uint8Array<ArrayBuffer> | null = null;

  private voiceGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private mediaStreamDestination: MediaStreamAudioDestinationNode | null = null;
  private silentKeepAliveOsc: OscillatorNode | null = null;

  // Ambient Educational Background Music Oscillators
  private bgmOscillators: OscillatorNode[] = [];
  private isBgmRunning: boolean = false;

  // Voice Settings (Neural Female / Male, Speed 0.85x-1.15x, BGM Ducking)
  private voiceSettings: VoiceSettings = {
    voiceId: 'female-neural',
    speed: 1.0,
    bgmEnabled: false,
  };

  // Active voiceover playback control & anti-overlap session token
  private playbackToken: number = 0;
  private activeVoiceSource: AudioBufferSourceNode | null = null;
  private activeHtmlAudio: HTMLAudioElement | null = null;
  private isVoiceoverPlaying: boolean = false;
  private speechKeepAliveTimer: any = null;

  // Preload cache for instant zero-lag playback and guaranteed export audio
  private ttsBufferCache = new Map<string, AudioBuffer>();
  private ttsPendingFetches = new Map<string, Promise<AudioBuffer | null>>();

  // Speech synthesis cached voices
  private speechVoices: SpeechSynthesisVoice[] = [];

  // Listeners
  private duckingListeners: Set<DuckingListener> = new Set();

  constructor() {
    this.initSpeechVoices();
  }

  private initSpeechVoices(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.speechVoices = window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        this.speechVoices = window.speechSynthesis.getVoices();
      };
    }
  }

  public getVoiceSettings(): VoiceSettings {
    return { ...this.voiceSettings };
  }

  public updateVoiceSettings(partial: Partial<VoiceSettings>): void {
    this.voiceSettings = {
      ...this.voiceSettings,
      ...partial,
    };

    // Update studio EQ warmth based on Male/Female teacher voice profile
    if (this.lowShelfFilter && this.highShelfFilter && this.audioCtx) {
      const now = this.audioCtx.currentTime;
      if (this.voiceSettings.voiceId === 'male-neural') {
        this.lowShelfFilter.gain.setTargetAtTime(4.5, now, 0.05); // Extra chest warmth for male teacher
        this.highShelfFilter.gain.setTargetAtTime(1.8, now, 0.05);
      } else {
        this.lowShelfFilter.gain.setTargetAtTime(3.0, now, 0.05); // +3dB @ 180Hz
        this.highShelfFilter.gain.setTargetAtTime(2.2, now, 0.05); // +2.2dB @ 6000Hz
      }
    }

    // Handle BGM toggle immediately
    if (partial.bgmEnabled !== undefined) {
      if (partial.bgmEnabled) {
        void this.startBackgroundMusic();
      } else {
        this.stopBackgroundMusic();
      }
    }
  }

  public subscribeDucking(listener: DuckingListener): () => void {
    this.duckingListeners.add(listener);
    return () => this.duckingListeners.delete(listener);
  }

  private notifySpeakingState(speaking: boolean, gainVal: number = 0) {
    this.duckingListeners.forEach((l) => {
      try {
        l(speaking, gainVal);
      } catch (err) {
        console.error('Error in audio state listener:', err);
      }
    });
  }

  /**
   * Synchronously unlocks the Browser AudioContext inside a direct user click handler (Autoplay Policy fix).
   * Must be called at the very top of onClick handlers before any async/await calls!
   */
  public unlockAudioOnUserGesture(): void {
    try {
      const ctx = this.initContextSync();
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }
      // Play a 1-sample silent buffer to permanently unlock Chrome/Safari/Edge audio output
      const unlockBuf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = unlockBuf;
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      // ignore
    }
  }

  public isAudioUnlocked(): boolean {
    return Boolean(this.audioCtx && this.audioCtx.state === 'running');
  }

  /**
   * Synchronous initialization of the Studio WebAudio Mastering Graph:
   * Source -> LowShelf(+3dB@180Hz) -> HighShelf(+2dB@6000Hz) -> DynamicsCompressor -> Analyser -> VoiceGain -> MasterGain & MediaStreamDestination
   */
  private initContextSync(): AudioContext {
    if (!this.audioCtx) {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextClass();

      const now = this.audioCtx.currentTime;

      // 1. Studio Low-Shelf Filter (+3dB at 180Hz for warm, full-bodied teacher voice)
      this.lowShelfFilter = this.audioCtx.createBiquadFilter();
      this.lowShelfFilter.type = 'lowshelf';
      this.lowShelfFilter.frequency.setValueAtTime(180, now);
      this.lowShelfFilter.gain.setValueAtTime(3.0, now);

      // 2. Studio High-Shelf Filter (+2dB at 6000Hz for crisp consonant clarity)
      this.highShelfFilter = this.audioCtx.createBiquadFilter();
      this.highShelfFilter.type = 'highshelf';
      this.highShelfFilter.frequency.setValueAtTime(6000, now);
      this.highShelfFilter.gain.setValueAtTime(2.0, now);

      // 3. Studio Dynamics Compressor (broadcast microphone leveling)
      this.studioCompressor = this.audioCtx.createDynamicsCompressor();
      this.studioCompressor.threshold.setValueAtTime(-20, now);
      this.studioCompressor.knee.setValueAtTime(18, now);
      this.studioCompressor.ratio.setValueAtTime(3.5, now);
      this.studioCompressor.attack.setValueAtTime(0.005, now);
      this.studioCompressor.release.setValueAtTime(0.18, now);

      // 4. Real-time Voice AnalyserNode for Canvas Audio Waveform Visualizer
      this.voiceAnalyser = this.audioCtx.createAnalyser();
      this.voiceAnalyser.fftSize = 128;
      this.voiceAnalyser.smoothingTimeConstant = 0.78;
      this.analyserDataArray = new Uint8Array(new ArrayBuffer(this.voiceAnalyser.frequencyBinCount));

      // 5. Gain & Destination Nodes
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.setValueAtTime(1.0, now);

      this.voiceGain = this.audioCtx.createGain();
      this.voiceGain.gain.setValueAtTime(1.25, now);

      this.musicGain = this.audioCtx.createGain();
      this.musicGain.gain.setValueAtTime(0.0, now);

      this.mediaStreamDestination = this.audioCtx.createMediaStreamDestination();

      // Connect Studio Voice Mastering Chain:
      // lowShelf -> highShelf -> studioCompressor -> voiceAnalyser -> voiceGain
      this.lowShelfFilter.connect(this.highShelfFilter);
      this.highShelfFilter.connect(this.studioCompressor);
      this.studioCompressor.connect(this.voiceAnalyser);
      this.voiceAnalyser.connect(this.voiceGain);

      // Route voiceGain & musicGain to BOTH speakers (masterGain) AND MediaRecorder (mediaStreamDestination)
      this.voiceGain.connect(this.masterGain);
      this.voiceGain.connect(this.mediaStreamDestination);

      this.musicGain.connect(this.masterGain);
      this.musicGain.connect(this.mediaStreamDestination);

      this.masterGain.connect(this.audioCtx.destination);

      // Continuous -100dB keep-alive oscillator so MediaRecorder never drops the audio track during pauses
      try {
        const silentOsc = this.audioCtx.createOscillator();
        const silentGain = this.audioCtx.createGain();
        silentOsc.frequency.setValueAtTime(440, now);
        silentGain.gain.setValueAtTime(0.00001, now);
        silentOsc.connect(silentGain);
        silentGain.connect(this.mediaStreamDestination);
        silentOsc.start();
        this.silentKeepAliveOsc = silentOsc;
      } catch {
        // ignore
      }
    }
    return this.audioCtx;
  }

  public async ensureContext(): Promise<AudioContext> {
    const ctx = this.initContextSync();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // ignore if called outside gesture; unlockAudioOnUserGesture will resume on click
      }
    }
    return ctx;
  }

  /**
   * Returns normalized frequency amplitude bars (0.0 -> 1.0) for the Canvas Audio Waveform Visualizer
   */
  public getVoiceWaveformBands(barCount: number = 16): number[] {
    if (!this.isVoiceoverPlaying || !this.voiceAnalyser || !this.analyserDataArray) {
      return new Array(barCount).fill(0.06);
    }

    try {
      this.voiceAnalyser.getByteFrequencyData(this.analyserDataArray);
      const bands: number[] = [];
      const usableBins = Math.min(36, this.analyserDataArray.length);
      for (let i = 0; i < barCount; i++) {
        const binIdx = Math.floor((i / barCount) * usableBins);
        const val = this.analyserDataArray[binIdx] / 255;
        bands.push(Math.max(0.08, Math.min(1.0, val * 1.25)));
      }
      return bands;
    } catch {
      return new Array(barCount).fill(0.15);
    }
  }

  public getAudioStream(): MediaStream | null {
    return this.mediaStreamDestination ? this.mediaStreamDestination.stream : null;
  }

  public getContext(): AudioContext | null {
    return this.audioCtx;
  }

  public isCurrentlySpeaking(): boolean {
    return this.isVoiceoverPlaying;
  }

  /**
   * Automatic -18dB Audio Ducking when teacher's voice starts speaking
   */
  public duckMusic(): void {
    if (this.musicGain && this.audioCtx) {
      const targetGain = this.voiceSettings.bgmEnabled ? 0.022 : 0.0; // -18dB ducked ambient pad
      this.musicGain.gain.setTargetAtTime(targetGain, this.audioCtx.currentTime, 0.12);
      this.notifySpeakingState(true, targetGain);
    } else {
      this.notifySpeakingState(true, 0);
    }
  }

  /**
   * Restores gentle ambient music when teacher pauses between scenes
   */
  public restoreMusic(): void {
    if (this.musicGain && this.audioCtx) {
      const normalGain = this.voiceSettings.bgmEnabled ? 0.16 : 0.0;
      this.musicGain.gain.setTargetAtTime(normalGain, this.audioCtx.currentTime, 0.25);
      this.notifySpeakingState(false, normalGain);
    } else {
      this.notifySpeakingState(false, 0);
    }
  }

  public setVoiceVolume(vol: number): void {
    if (this.voiceGain && this.audioCtx) {
      this.voiceGain.gain.setValueAtTime(vol, this.audioCtx.currentTime);
    }
  }

  /**
   * Synthesizes a warm, gentle educational ambient pad with automatic -18dB Audio Ducking
   */
  public async startBackgroundMusic(): Promise<void> {
    const ctx = await this.ensureContext();
    if (!this.voiceSettings.bgmEnabled) {
      this.stopBackgroundMusic();
      return;
    }
    if (this.isBgmRunning) {
      const gainVal = this.isVoiceoverPlaying ? 0.022 : 0.16;
      this.musicGain?.gain.setTargetAtTime(gainVal, ctx.currentTime, 0.2);
      return;
    }

    try {
      this.stopBackgroundMusic();
      const padFilter = ctx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.setValueAtTime(420, ctx.currentTime);
      if (this.musicGain) {
        padFilter.connect(this.musicGain);
      }

      // Warm C-major 9th ambient educational chord (C3, G3, B3, D4)
      const freqs = [130.81, 196.0, 246.94, 293.66];
      this.bgmOscillators = freqs.map((freq, idx) => {
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        oscGain.gain.setValueAtTime(0.18 / freqs.length, ctx.currentTime);
        osc.connect(oscGain);
        oscGain.connect(padFilter);
        osc.start();
        return osc;
      });

      this.isBgmRunning = true;
      const initialGain = this.isVoiceoverPlaying ? 0.022 : 0.16;
      this.musicGain?.gain.setTargetAtTime(initialGain, ctx.currentTime, 0.2);
    } catch {
      // ignore
    }
  }

  public stopBackgroundMusic(): void {
    this.bgmOscillators.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // ignore
      }
    });
    this.bgmOscillators = [];
    this.isBgmRunning = false;
    if (this.musicGain && this.audioCtx) {
      this.musicGain.gain.setTargetAtTime(0.0, this.audioCtx.currentTime, 0.08);
    }
  }

  /**
   * Tier 1 & Tier 2: Fetches and decodes a single TTS chunk as an AudioBuffer.
   * Uses /api/tts/neural when external Neural TTS keys are configured, or fast /api/tts + CORS fallback.
   */
  private async fetchChunkBuffer(chunk: string): Promise<AudioBuffer | null> {
    const key = chunk.trim();
    if (!key) return null;

    const extKeys = keyRotationEngine.getExternalKeys();
    const hasCustomNeuralKey = Boolean(
      extKeys.openaiTtsApiKey?.trim() || extKeys.elevenLabsApiKey?.trim()
    );
    const cacheKey = `${this.voiceSettings.voiceId}__${hasCustomNeuralKey ? 'T1' : 'T2'}__${key}`;

    if (this.ttsBufferCache.has(cacheKey)) {
      return this.ttsBufferCache.get(cacheKey)!;
    }

    if (this.ttsPendingFetches.has(cacheKey)) {
      return this.ttsPendingFetches.get(cacheKey)!;
    }

    const fetchPromise = (async (): Promise<AudioBuffer | null> => {
      const ctx = await this.ensureContext();

      // Tier 1: Call /api/tts/neural if OpenAI / ElevenLabs key is provided
      if (hasCustomNeuralKey) {
        try {
          const neuralRes = await fetch('/api/tts/neural', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: key,
              voiceId: this.voiceSettings.voiceId,
              openaiTtsApiKey: extKeys.openaiTtsApiKey,
              elevenLabsApiKey: extKeys.elevenLabsApiKey,
            }),
          });
          if (neuralRes.ok) {
            const arrayBuffer = await neuralRes.arrayBuffer();
            if (arrayBuffer && arrayBuffer.byteLength > 200) {
              const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
              this.ttsBufferCache.set(cacheKey, decoded);
              return decoded;
            }
          }
        } catch {
          // Fall through to Tier 2
        }
      }

      // Tier 2 Primary: Local Express server Neural TTS stream (/api/tts)
      try {
        const res = await fetch(`/api/tts?text=${encodeURIComponent(key)}`);
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('audio') || contentType.includes('octet-stream')) {
            const arrayBuffer = await res.arrayBuffer();
            if (arrayBuffer && arrayBuffer.byteLength > 200) {
              const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
              this.ttsBufferCache.set(cacheKey, decoded);
              return decoded;
            }
          }
        }
      } catch {
        // Fall through to CORS proxy for static GitHub Pages
      }

      // Tier 2 Static Fallback (GitHub Pages): Fetch neural TTS binary via CORS proxy
      const googleTtsUrl = `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
        key
      )}&tl=vi&client=gtx`;

      const corsProxies = [
        `https://corsproxy.io/?${encodeURIComponent(googleTtsUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(googleTtsUrl)}`,
      ];

      for (const proxyUrl of corsProxies) {
        try {
          const res = await fetch(proxyUrl);
          if (res.ok) {
            const arrayBuffer = await res.arrayBuffer();
            if (arrayBuffer && arrayBuffer.byteLength > 200) {
              const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
              this.ttsBufferCache.set(cacheKey, decoded);
              return decoded;
            }
          }
        } catch {
          // try next proxy
        }
      }

      return null;
    })();

    this.ttsPendingFetches.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  /**
   * Concatenates multiple AudioBuffers into a single continuous AudioBuffer
   * with natural pedagogical breath pauses (180ms between clauses/sentences).
   */
  public concatenateAudioBuffers(buffers: AudioBuffer[], ctx: AudioContext): AudioBuffer {
    if (buffers.length === 1) return buffers[0];

    const sampleRate = buffers[0].sampleRate;
    const channels = buffers[0].numberOfChannels;
    const pauseSamples = Math.floor(sampleRate * 0.18); // 180ms natural pedagogical breath pause

    const totalLength =
      buffers.reduce((acc, b) => acc + b.length, 0) + pauseSamples * (buffers.length - 1);

    const output = ctx.createBuffer(channels, totalLength, sampleRate);

    for (let ch = 0; ch < channels; ch++) {
      const outData = output.getChannelData(ch);
      let offset = 0;
      buffers.forEach((buf, idx) => {
        const srcCh = Math.min(ch, buf.numberOfChannels - 1);
        outData.set(buf.getChannelData(srcCh), offset);
        offset += buf.length;
        if (idx < buffers.length - 1) {
          offset += pauseSamples;
        }
      });
    }

    return output;
  }

  /**
   * Fetches full narration by chunking, fetching in parallel, and concatenating into a single continuous AudioBuffer.
   */
  public async getOrFetchFullNarrationBuffer(normalizedText: string): Promise<AudioBuffer | null> {
    if (!normalizedText || !normalizedText.trim()) return null;

    const fullKey = `FULL__${this.voiceSettings.voiceId}__${normalizedText.trim()}`;
    if (this.ttsBufferCache.has(fullKey)) {
      return this.ttsBufferCache.get(fullKey)!;
    }

    const chunks = splitTextIntoChunks(normalizedText, 175);
    if (chunks.length === 0) return null;

    try {
      const ctx = await this.ensureContext();
      const chunkBuffers = await Promise.all(chunks.map((c) => this.fetchChunkBuffer(c)));
      const validBuffers = chunkBuffers.filter((b): b is AudioBuffer => b !== null);

      if (validBuffers.length === 0) return null;

      const combined = this.concatenateAudioBuffers(validBuffers, ctx);
      this.ttsBufferCache.set(fullKey, combined);
      return combined;
    } catch {
      return null;
    }
  }

  /**
   * Preloads TTS audio for all scenes in advance and returns effective duration in seconds
   * accounting for the user's selected voiceSpeed (0.85x -> 1.15x).
   */
  public async preloadNarrations(texts: string[]): Promise<(number | null)[]> {
    const speed = Math.max(0.85, Math.min(1.15, this.voiceSettings.speed || 1.0));
    return Promise.all(
      texts.map(async (text) => {
        const buf = await this.getOrFetchFullNarrationBuffer(text);
        return buf ? buf.duration / speed : null;
      })
    );
  }

  /**
   * Secondary stream fallback using HTMLAudioElement routed into WebAudio / Speakers
   * in case decodeAudioData fails on any browser codec edge case
   */
  private playViaHtmlAudioChain(
    normalizedText: string,
    token: number,
    onEnded?: () => void
  ): Promise<boolean> {
    return new Promise((resolve) => {
      if (token !== this.playbackToken) {
        resolve(false);
        return;
      }

      const chunks = splitTextIntoChunks(normalizedText, 165);
      if (chunks.length === 0) {
        resolve(false);
        return;
      }

      let idx = 0;
      let startedAny = false;
      this.duckMusic();

      const playNext = () => {
        if (token !== this.playbackToken) return;
        if (idx >= chunks.length) {
          this.activeHtmlAudio = null;
          this.isVoiceoverPlaying = false;
          this.restoreMusic();
          onEnded?.();
          return;
        }

        const chunkText = chunks[idx++];
        const audio = new Audio(`/api/tts?text=${encodeURIComponent(chunkText)}`);
        audio.crossOrigin = 'anonymous';
        audio.playbackRate = Math.max(0.85, Math.min(1.15, this.voiceSettings.speed || 1.0));
        this.activeHtmlAudio = audio;

        audio.onplay = () => {
          if (!startedAny) {
            startedAny = true;
            resolve(true);
          }
        };

        audio.onended = () => {
          if (token !== this.playbackToken) return;
          setTimeout(playNext, 140);
        };

        audio.onerror = () => {
          if (!startedAny) {
            resolve(false);
          } else {
            playNext();
          }
        };

        audio.play().catch(() => {
          if (!startedAny) {
            resolve(false);
          } else {
            playNext();
          }
        });
      };

      playNext();
    });
  }

  /**
   * Emergency offline rescue via Web Speech API ONLY if all network streams fail
   */
  private fallbackWebSpeech(
    normalizedText: string,
    token: number,
    onEnded?: () => void
  ): void {
    if (token !== this.playbackToken) return;

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      if (this.speechKeepAliveTimer) {
        clearInterval(this.speechKeepAliveTimer);
        this.speechKeepAliveTimer = null;
      }

      const voices =
        this.speechVoices.length > 0
          ? this.speechVoices
          : window.speechSynthesis.getVoices();
      const vietnameseVoice = voices.find(
        (v) =>
          v.lang.toLowerCase().startsWith('vi') ||
          v.lang.toLowerCase().includes('vn') ||
          v.name.toLowerCase().includes('vietnam')
      );

      const chunks = splitTextIntoChunks(normalizedText, 160);
      let idx = 0;

      this.duckMusic();

      const speakNextChunk = () => {
        if (token !== this.playbackToken) return;
        if (idx >= chunks.length) {
          this.isVoiceoverPlaying = false;
          this.restoreMusic();
          onEnded?.();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[idx]);
        idx++;
        utterance.lang = 'vi-VN';
        utterance.volume = 1.0;
        utterance.rate = this.voiceSettings.speed || 1.0;
        utterance.pitch = this.voiceSettings.voiceId === 'male-neural' ? 0.88 : 1.05;
        if (vietnameseVoice) {
          utterance.voice = vietnameseVoice;
        }

        utterance.onend = () => {
          if (token !== this.playbackToken) return;
          speakNextChunk();
        };

        utterance.onerror = () => {
          if (token !== this.playbackToken) return;
          speakNextChunk();
        };

        window.speechSynthesis.speak(utterance);
      };

      speakNextChunk();
    } else {
      const wordCount = normalizedText.split(/\s+/).length;
      const durationMs = Math.max(3000, (wordCount / 3.2) * 1000);
      setTimeout(() => {
        if (token === this.playbackToken) {
          this.isVoiceoverPlaying = false;
          this.restoreMusic();
          onEnded?.();
        }
      }, durationMs);
    }
  }

  /**
   * Plays fluent Vietnamese narration through the Studio Mastering Chain
   * (LowShelf -> HighShelf -> DynamicsCompressor -> Analyser -> Speakers + MediaStreamDestination)
   * Returns the exact effective duration in seconds (AudioBuffer.duration / speed) when decoded.
   */
  public async playVietnameseNarration(
    normalizedText: string,
    onEnded?: () => void,
    onDurationResolved?: (exactDurationSec: number) => void
  ): Promise<number | null> {
    this.stopVoiceover();
    const currentToken = ++this.playbackToken;

    if (!normalizedText || !normalizedText.trim()) {
      onEnded?.();
      return null;
    }

    const ctx = await this.ensureContext();
    if (currentToken !== this.playbackToken) return null;

    if (this.voiceSettings.bgmEnabled && !this.isBgmRunning) {
      await this.startBackgroundMusic();
    }

    this.isVoiceoverPlaying = true;

    const audioBuffer = await this.getOrFetchFullNarrationBuffer(normalizedText);
    if (currentToken !== this.playbackToken) return null;

    if (audioBuffer && this.lowShelfFilter) {
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch {
          // ignore
        }
      }

      if (this.masterGain) {
        this.masterGain.gain.setValueAtTime(1.0, ctx.currentTime);
      }
      if (this.voiceGain) {
        this.voiceGain.gain.setValueAtTime(1.25, ctx.currentTime);
      }

      this.duckMusic();

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      const speed = Math.max(0.85, Math.min(1.15, this.voiceSettings.speed || 1.0));
      source.playbackRate.setValueAtTime(speed, ctx.currentTime);

      // Subtle formant/pitch shaping for Male vs Female Neural Voice profile
      if (source.detune) {
        const detuneCents = this.voiceSettings.voiceId === 'male-neural' ? -135 : 20;
        source.detune.setValueAtTime(detuneCents, ctx.currentTime);
      }

      const exactEffectiveDuration = audioBuffer.duration / speed;
      onDurationResolved?.(exactEffectiveDuration);

      // Connect into the Studio Mastering Chain entry node (lowShelfFilter)
      source.connect(this.lowShelfFilter);
      this.activeVoiceSource = source;

      source.onended = () => {
        if (this.activeVoiceSource === source && currentToken === this.playbackToken) {
          this.activeVoiceSource = null;
          this.isVoiceoverPlaying = false;
          this.restoreMusic();
          onEnded?.();
        }
      };

      source.start(0);
      return exactEffectiveDuration;
    }

    // Secondary fallback: HTMLAudioElement streaming /api/tts
    const htmlPlayed = await this.playViaHtmlAudioChain(normalizedText, currentToken, onEnded);
    if (htmlPlayed) {
      return null;
    }

    // Emergency fallback if offline
    this.fallbackWebSpeech(normalizedText, currentToken, onEnded);
    return null;
  }

  public stopVoiceover(): void {
    this.playbackToken++;

    if (this.speechKeepAliveTimer) {
      clearInterval(this.speechKeepAliveTimer);
      this.speechKeepAliveTimer = null;
    }

    if (this.activeVoiceSource) {
      try {
        this.activeVoiceSource.onended = null;
        this.activeVoiceSource.stop();
        this.activeVoiceSource.disconnect();
      } catch {
        // ignore
      }
      this.activeVoiceSource = null;
    }

    if (this.activeHtmlAudio) {
      try {
        this.activeHtmlAudio.onended = null;
        this.activeHtmlAudio.onerror = null;
        this.activeHtmlAudio.pause();
        this.activeHtmlAudio.src = '';
      } catch {
        // ignore
      }
      this.activeHtmlAudio = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }

    if (this.isVoiceoverPlaying) {
      this.isVoiceoverPlaying = false;
      this.restoreMusic();
    }
  }

  public clearCache(): void {
    this.ttsBufferCache.clear();
    this.ttsPendingFetches.clear();
  }

  public stopAll(): void {
    this.stopVoiceover();
    this.stopBackgroundMusic();
  }
}

export const vietnameseVoiceEngine = new VietnameseHumanVoiceEngine();
export const audioEngine = vietnameseVoiceEngine;
