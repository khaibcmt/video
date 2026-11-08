export type DuckingListener = (isDucking: boolean, currentGain: number) => void;

/**
 * Splits a Vietnamese narration text into natural sentence/clause chunks <= 165 characters
 * so Google TTS never truncates or stutters mid-sentence.
 */
export function splitTextIntoChunks(text: string, maxChars: number = 165): string[] {
  if (!text || !text.trim()) return [];
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChars) return [cleaned];

  // First split by major sentence boundaries (. ! ? ; : or newline)
  const rawSentences = cleaned.split(/(?<=[.!?;:\n])\s+/);
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
          // Split long clause by words
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

class AudioEngine {
  private audioCtx: AudioContext | null = null;
  private voiceGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private mediaStreamDestination: MediaStreamAudioDestinationNode | null = null;

  // Synthesizer background music nodes
  private synthInterval: any = null;
  private synthNodes: { osc: OscillatorNode; gain: GainNode }[] = [];
  private isMusicPlaying: boolean = false;
  private currentMusicMood: string = 'cinematic';

  // Custom audio element for user uploaded / external audio
  private customAudioEl: HTMLAudioElement | null = null;
  private customAudioSource: MediaElementAudioSourceNode | null = null;

  // Active voiceover playback control & anti-overlap session token
  private playbackToken: number = 0;
  private activeVoiceSource: AudioBufferSourceNode | null = null;
  private activeHtmlAudio: HTMLAudioElement | null = null;
  private isVoiceoverPlaying: boolean = false;
  private isDucked: boolean = false;
  private speechKeepAliveTimer: any = null;

  // Preload cache for instant zero-lag playback
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

  public subscribeDucking(listener: DuckingListener): () => void {
    this.duckingListeners.add(listener);
    return () => this.duckingListeners.delete(listener);
  }

  private notifyDucking(ducked: boolean, gainVal: number) {
    this.isDucked = ducked;
    this.duckingListeners.forEach((l) => {
      try {
        l(ducked, gainVal);
      } catch (err) {
        console.error('Error in ducking listener:', err);
      }
    });
  }

  public async ensureContext(): Promise<AudioContext> {
    if (!this.audioCtx) {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextClass();

      // Master gain
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.setValueAtTime(0.95, this.audioCtx.currentTime);

      // Voiceover node - Gain 100%
      this.voiceGain = this.audioCtx.createGain();
      this.voiceGain.gain.setValueAtTime(1.0, this.audioCtx.currentTime);

      // Background music node - Gain default 25%
      this.musicGain = this.audioCtx.createGain();
      this.musicGain.gain.setValueAtTime(0.25, this.audioCtx.currentTime);

      // Create MediaStream destination for recording with MediaRecorder
      this.mediaStreamDestination = this.audioCtx.createMediaStreamDestination();

      // Wire nodes
      this.voiceGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);

      // Output to speakers and to export stream
      this.masterGain.connect(this.audioCtx.destination);
      this.masterGain.connect(this.mediaStreamDestination);
    }

    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    return this.audioCtx;
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
   * Smoothly duck music to 6% when voiceover speaks
   */
  public duckMusic(transitionDuration: number = 0.25): void {
    if (!this.audioCtx || !this.musicGain) return;
    const now = this.audioCtx.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
    this.musicGain.gain.linearRampToValueAtTime(0.06, now + transitionDuration);
    this.notifyDucking(true, 0.06);
  }

  /**
   * Smoothly restore music to 25% when voiceover finishes
   */
  public restoreMusic(transitionDuration: number = 0.6): void {
    if (!this.audioCtx || !this.musicGain) return;
    const now = this.audioCtx.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
    this.musicGain.gain.linearRampToValueAtTime(0.25, now + transitionDuration);
    this.notifyDucking(false, 0.25);
  }

  public setMusicBaseVolume(vol: number): void {
    if (this.musicGain && this.audioCtx && !this.isDucked) {
      this.musicGain.gain.setValueAtTime(vol, this.audioCtx.currentTime);
    }
  }

  public setVoiceVolume(vol: number): void {
    if (this.voiceGain && this.audioCtx) {
      this.voiceGain.gain.setValueAtTime(vol, this.audioCtx.currentTime);
    }
  }

  /**
   * Starts ambient procedural documentary soundtrack
   */
  public async startBackgroundMusic(mood: string = 'cinematic'): Promise<void> {
    await this.ensureContext();
    if (this.isMusicPlaying && this.currentMusicMood === mood) return;

    this.stopBackgroundMusic();
    this.currentMusicMood = mood;
    this.isMusicPlaying = true;

    const chords: number[][] = [
      [73.4, 110.0, 174.6, 220.0], // Dm9
      [65.4, 98.0, 164.8, 220.0],  // C add 9
      [58.2, 87.3, 146.8, 174.6],  // Bb Maj7
      [65.4, 110.0, 164.8, 246.9], // Am7
    ];

    let chordIndex = 0;

    const playNextChord = () => {
      if (!this.isMusicPlaying || !this.audioCtx || !this.musicGain) return;

      const currentNotes = chords[chordIndex % chords.length];
      chordIndex++;

      const oldNodes = [...this.synthNodes];
      this.synthNodes = [];
      const fadeNow = this.audioCtx.currentTime;

      oldNodes.forEach(({ osc, gain }) => {
        try {
          gain.gain.cancelScheduledValues(fadeNow);
          gain.gain.setValueAtTime(gain.gain.value, fadeNow);
          gain.gain.linearRampToValueAtTime(0.0001, fadeNow + 1.8);
          setTimeout(() => {
            try {
              osc.stop();
              osc.disconnect();
              gain.disconnect();
            } catch {}
          }, 2000);
        } catch {}
      });

      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(550, this.audioCtx.currentTime);
      filter.Q.setValueAtTime(1.5, this.audioCtx.currentTime);
      filter.connect(this.musicGain);

      currentNotes.forEach((freq, idx) => {
        if (!this.audioCtx) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = idx === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

        const detune = (idx * 2 - 2) + Math.sin(Date.now() / 1000) * 1.5;
        osc.detune.setValueAtTime(detune, this.audioCtx.currentTime);

        const targetGain = idx === 0 ? 0.32 : 0.14;
        gain.gain.setValueAtTime(0.0001, this.audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(targetGain, this.audioCtx.currentTime + 1.5);

        osc.connect(gain);
        gain.connect(filter);
        osc.start();

        this.synthNodes.push({ osc, gain });
      });
    };

    playNextChord();
    this.synthInterval = setInterval(playNextChord, 5500);
  }

  public stopBackgroundMusic(): void {
    this.isMusicPlaying = false;
    if (this.synthInterval) {
      clearInterval(this.synthInterval);
      this.synthInterval = null;
    }

    if (this.audioCtx) {
      const now = this.audioCtx.currentTime;
      this.synthNodes.forEach(({ osc, gain }) => {
        try {
          gain.gain.linearRampToValueAtTime(0.0001, now + 0.3);
          setTimeout(() => {
            try {
              osc.stop();
              osc.disconnect();
              gain.disconnect();
            } catch {}
          }, 350);
        } catch {}
      });
      this.synthNodes = [];
    }

    if (this.customAudioEl) {
      this.customAudioEl.pause();
    }
  }

  /**
   * Loads custom MP3 file for background music
   */
  public async loadCustomMusic(file: File): Promise<void> {
    await this.ensureContext();
    this.stopBackgroundMusic();

    const url = URL.createObjectURL(file);
    if (!this.customAudioEl) {
      this.customAudioEl = new Audio();
      this.customAudioEl.loop = true;
      this.customAudioEl.crossOrigin = 'anonymous';
      this.customAudioSource = this.audioCtx!.createMediaElementSource(this.customAudioEl);
      this.customAudioSource.connect(this.musicGain!);
    }

    this.customAudioEl.src = url;
    await this.customAudioEl.play();
    this.isMusicPlaying = true;
  }

  private isStaticHost(): boolean {
    return (
      typeof window !== 'undefined' &&
      (window.location.hostname.includes('github.io') ||
        window.location.protocol === 'file:' ||
        (window.location.port !== '3000' && !window.location.hostname.includes('run.app')))
    );
  }

  /**
   * Fetches and caches a single chunk (<= 165 chars) as an AudioBuffer
   */
  private async fetchChunkBuffer(chunk: string): Promise<AudioBuffer | null> {
    if (this.isStaticHost()) return null;

    const key = chunk.trim();
    if (!key) return null;

    if (this.ttsBufferCache.has(key)) {
      return this.ttsBufferCache.get(key)!;
    }

    if (this.ttsPendingFetches.has(key)) {
      return this.ttsPendingFetches.get(key)!;
    }

    const fetchPromise = (async (): Promise<AudioBuffer | null> => {
      try {
        const ctx = await this.ensureContext();
        const res = await fetch(`/api/tts?text=${encodeURIComponent(key)}`);
        if (!res.ok) return null;
        const arrayBuffer = await res.arrayBuffer();
        if (!arrayBuffer || arrayBuffer.byteLength < 100) return null;
        const decoded = await ctx.decodeAudioData(arrayBuffer);
        this.ttsBufferCache.set(key, decoded);
        return decoded;
      } catch {
        return null;
      } finally {
        this.ttsPendingFetches.delete(key);
      }
    })();

    this.ttsPendingFetches.set(key, fetchPromise);
    return fetchPromise;
  }

  /**
   * Concatenates multiple AudioBuffers into a single continuous AudioBuffer with a tiny natural breath pause (50ms)
   */
  private concatAudioBuffers(buffers: AudioBuffer[], ctx: AudioContext): AudioBuffer {
    if (buffers.length === 1) return buffers[0];

    const sampleRate = buffers[0].sampleRate;
    const channels = buffers[0].numberOfChannels;
    const pauseSamples = Math.floor(sampleRate * 0.05); // 50ms natural breath between clauses

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
   * Fetches full narration (of any length) by chunking, fetching in parallel, and concatenating into a single continuous AudioBuffer!
   * Also returns exact duration in seconds so scene timing never cuts off speech.
   */
  public async getOrFetchFullNarrationBuffer(normalizedText: string): Promise<AudioBuffer | null> {
    if (this.isStaticHost() || !normalizedText.trim()) return null;

    const fullKey = `FULL__${normalizedText.trim()}`;
    if (this.ttsBufferCache.has(fullKey)) {
      return this.ttsBufferCache.get(fullKey)!;
    }

    const chunks = splitTextIntoChunks(normalizedText, 165);
    if (chunks.length === 0) return null;

    try {
      const ctx = await this.ensureContext();
      const chunkBuffers = await Promise.all(chunks.map((c) => this.fetchChunkBuffer(c)));
      const validBuffers = chunkBuffers.filter((b): b is AudioBuffer => b !== null);

      if (validBuffers.length === 0) return null;

      const combined = this.concatAudioBuffers(validBuffers, ctx);
      this.ttsBufferCache.set(fullKey, combined);
      return combined;
    } catch {
      return null;
    }
  }

  /**
   * Preloads TTS audio for all scenes in advance so playback and export have zero lag or stutter.
   * Returns a map of scene index -> actual audio duration in seconds.
   */
  public async preloadNarrations(texts: string[]): Promise<(number | null)[]> {
    if (this.isStaticHost()) {
      return texts.map(() => null);
    }

    return Promise.all(
      texts.map(async (text) => {
        const buf = await this.getOrFetchFullNarrationBuffer(text);
        return buf ? buf.duration : null;
      })
    );
  }

  /**
   * Plays Vietnamese Google TTS chunks sequentially via HTML5 Audio elements (for static GitHub Pages)
   */
  private playGoogleTtsChunksSequentially(
    chunks: string[],
    token: number,
    onEnded?: () => void
  ): boolean {
    if (chunks.length === 0) return false;

    let currentIdx = 0;

    const playNext = () => {
      if (token !== this.playbackToken) return;
      if (currentIdx >= chunks.length) {
        this.activeHtmlAudio = null;
        this.isVoiceoverPlaying = false;
        this.restoreMusic();
        onEnded?.();
        return;
      }

      const chunkText = chunks[currentIdx];
      currentIdx++;

      try {
        const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
          chunkText
        )}&tl=vi&client=gtx`;

        const audio = new Audio();
        audio.preload = 'auto';
        this.activeHtmlAudio = audio;

        // Pre-warm next chunk in background
        if (currentIdx < chunks.length) {
          const nextUrl = `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
            chunks[currentIdx]
          )}&tl=vi&client=gtx`;
          const preloader = new Audio();
          preloader.preload = 'auto';
          preloader.src = nextUrl;
        }

        audio.onplay = () => {
          if (token === this.playbackToken) {
            this.duckMusic();
          }
        };

        audio.onended = () => {
          if (token !== this.playbackToken) return;
          playNext();
        };

        audio.onerror = () => {
          if (token !== this.playbackToken) return;
          this.fallbackWebSpeech(chunks.slice(currentIdx - 1).join(' '), token, onEnded);
        };

        audio.src = url;
        audio.play().catch(() => {
          if (token !== this.playbackToken) return;
          this.fallbackWebSpeech(chunks.slice(currentIdx - 1).join(' '), token, onEnded);
        });
      } catch {
        this.fallbackWebSpeech(chunks.slice(currentIdx - 1).join(' '), token, onEnded);
      }
    };

    playNext();
    return true;
  }

  /**
   * Fallback Web Speech API with strict Vietnamese check and Chrome 15s anti-freeze keep-alive
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

      // Strictly disallow English voice reading Vietnamese
      if (!vietnameseVoice && voices.length > 0) {
        const wordCount = normalizedText.split(/\s+/).length;
        const durationMs = Math.max(3000, (wordCount / 3.2) * 1000);
        setTimeout(() => {
          if (token === this.playbackToken) {
            this.isVoiceoverPlaying = false;
            this.restoreMusic();
            onEnded?.();
          }
        }, durationMs);
        return;
      }

      const chunks = splitTextIntoChunks(normalizedText, 160);
      let idx = 0;

      this.duckMusic();

      // Chrome bug fix: speechSynthesis freezes after ~14 seconds unless paused/resumed
      this.speechKeepAliveTimer = setInterval(() => {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 10000);

      const speakNextChunk = () => {
        if (token !== this.playbackToken) return;
        if (idx >= chunks.length) {
          if (this.speechKeepAliveTimer) {
            clearInterval(this.speechKeepAliveTimer);
            this.speechKeepAliveTimer = null;
          }
          this.isVoiceoverPlaying = false;
          this.restoreMusic();
          onEnded?.();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[idx]);
        idx++;
        utterance.lang = 'vi-VN';
        utterance.rate = 1.0;
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
   * Plays fluent Vietnamese narration with zero overlap, zero truncation, and automatic ducking.
   */
  public async playVietnameseNarration(
    normalizedText: string,
    onEnded?: () => void
  ): Promise<void> {
    // Increment playback token and cancel any active speech immediately to prevent overlapping voices ("nói lấp")
    this.stopVoiceover();
    const currentToken = ++this.playbackToken;

    if (!normalizedText || !normalizedText.trim()) {
      onEnded?.();
      return;
    }

    const ctx = await this.ensureContext();
    if (currentToken !== this.playbackToken) return;

    this.isVoiceoverPlaying = true;

    // 1. First attempt full concatenated AudioBuffer (crystal-clear, zero gap between clauses, works with MediaRecorder)
    const audioBuffer = await this.getOrFetchFullNarrationBuffer(normalizedText);
    if (currentToken !== this.playbackToken) return;

    if (audioBuffer && this.voiceGain) {
      this.duckMusic();
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.voiceGain);
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
      return;
    }

    // 2. Static host (GitHub Pages): play sequential chunks via HTML5 Audio element
    const chunks = splitTextIntoChunks(normalizedText, 165);
    const elementPlayed = this.playGoogleTtsChunksSequentially(chunks, currentToken, onEnded);

    if (!elementPlayed && currentToken === this.playbackToken) {
      this.fallbackWebSpeech(normalizedText, currentToken, onEnded);
    }
  }

  public stopVoiceover(): void {
    // Invalidate any pending async speech callbacks
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
      } catch {}
      this.activeVoiceSource = null;
    }

    if (this.activeHtmlAudio) {
      try {
        this.activeHtmlAudio.onended = null;
        this.activeHtmlAudio.onerror = null;
        this.activeHtmlAudio.pause();
        this.activeHtmlAudio.src = '';
      } catch {}
      this.activeHtmlAudio = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    if (this.isVoiceoverPlaying) {
      this.isVoiceoverPlaying = false;
      this.restoreMusic();
    }
  }

  public stopAll(): void {
    this.stopVoiceover();
    this.stopBackgroundMusic();
    this.restoreMusic();
  }
}

export const audioEngine = new AudioEngine();
