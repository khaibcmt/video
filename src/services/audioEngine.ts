export type DuckingListener = (isDucking: boolean, currentGain: number) => void;

/**
 * Splits a Vietnamese narration text into natural sentence/clause chunks <= 165 characters
 * so Google TTS never truncates or stutters mid-sentence.
 */
export function splitTextIntoChunks(text: string, maxChars: number = 165): string[] {
  if (!text || !text.trim()) return [];
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChars) return [cleaned];

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
  private silentKeepAliveOsc: OscillatorNode | null = null;

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

  public subscribeDucking(listener: DuckingListener): () => void {
    this.duckingListeners.add(listener);
    return () => this.duckingListeners.delete(listener);
  }

  private notifySpeakingState(speaking: boolean) {
    this.duckingListeners.forEach((l) => {
      try {
        l(speaking, 0);
      } catch (err) {
        console.error('Error in audio state listener:', err);
      }
    });
  }

  public async ensureContext(): Promise<AudioContext> {
    if (!this.audioCtx) {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextClass();

      // Master gain - 100% pure crystal-clear voiceover
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.setValueAtTime(1.0, this.audioCtx.currentTime);

      // Voiceover node - Gain 100%
      this.voiceGain = this.audioCtx.createGain();
      this.voiceGain.gain.setValueAtTime(1.0, this.audioCtx.currentTime);

      // Background music node - Muted (0%) as user requested no background music
      this.musicGain = this.audioCtx.createGain();
      this.musicGain.gain.setValueAtTime(0.0, this.audioCtx.currentTime);

      // Create MediaStream destination for recording with MediaRecorder
      this.mediaStreamDestination = this.audioCtx.createMediaStreamDestination();

      // Wire nodes: connect voiceGain BOTH to masterGain (speakers) AND directly to mediaStreamDestination (export recorder)
      this.voiceGain.connect(this.masterGain);
      this.voiceGain.connect(this.mediaStreamDestination);

      // Output to speakers
      this.masterGain.connect(this.audioCtx.destination);

      // Continuous ultra-quiet keep-alive signal into mediaStreamDestination so MediaRecorder never drops the audio track during pauses!
      try {
        const silentOsc = this.audioCtx.createOscillator();
        const silentGain = this.audioCtx.createGain();
        silentOsc.frequency.setValueAtTime(440, this.audioCtx.currentTime);
        silentGain.gain.setValueAtTime(0.00001, this.audioCtx.currentTime); // -100dB inaudible keep-alive
        silentOsc.connect(silentGain);
        silentGain.connect(this.mediaStreamDestination);
        silentOsc.start();
        this.silentKeepAliveOsc = silentOsc;
      } catch {
        // ignore
      }
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

  public duckMusic(): void {
    this.notifySpeakingState(true);
  }

  public restoreMusic(): void {
    this.notifySpeakingState(false);
  }

  public setMusicBaseVolume(_vol: number): void {
    // Background music removed to focus 100% on voiceover and visuals
  }

  public setVoiceVolume(vol: number): void {
    if (this.voiceGain && this.audioCtx) {
      this.voiceGain.gain.setValueAtTime(vol, this.audioCtx.currentTime);
    }
  }

  /**
   * Background music is intentionally disabled so video focuses 100% on clear voiceover and visuals
   */
  public async startBackgroundMusic(_mood: string = 'cinematic'): Promise<void> {
    await this.ensureContext();
  }

  public stopBackgroundMusic(): void {
    // No-op (background music removed)
  }

  /**
   * Fetches and decodes a single TTS chunk (<= 165 chars) as an AudioBuffer.
   * Tries local /api/tts first, and falls back to public CORS audio proxy if on static GitHub Pages!
   */
  private async fetchChunkBuffer(chunk: string): Promise<AudioBuffer | null> {
    const key = chunk.trim();
    if (!key) return null;

    if (this.ttsBufferCache.has(key)) {
      return this.ttsBufferCache.get(key)!;
    }

    if (this.ttsPendingFetches.has(key)) {
      return this.ttsPendingFetches.get(key)!;
    }

    const fetchPromise = (async (): Promise<AudioBuffer | null> => {
      const ctx = await this.ensureContext();

      // 1. Primary: Local Express server TTS proxy (/api/tts) — works on localhost:3000, Cloud Run (*.run.app), and full-stack deployments
      try {
        const res = await fetch(`/api/tts?text=${encodeURIComponent(key)}`);
        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('audio') || contentType.includes('octet-stream')) {
            const arrayBuffer = await res.arrayBuffer();
            if (arrayBuffer && arrayBuffer.byteLength > 200) {
              const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
              this.ttsBufferCache.set(key, decoded);
              return decoded;
            }
          }
        }
      } catch {
        // Fall through to CORS proxy for static GitHub Pages
      }

      // 2. Fallback for static GitHub Pages: Fetch Google Translate TTS binary via CORS proxy so WebAudio + MediaRecorder still record the voice!
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
              this.ttsBufferCache.set(key, decoded);
              return decoded;
            }
          }
        } catch {
          // try next proxy
        }
      }

      return null;
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
   * Guarantees the voiceover is routed through Web Audio API for both speaker playback and video file export (.mp4 / .webm).
   */
  public async getOrFetchFullNarrationBuffer(normalizedText: string): Promise<AudioBuffer | null> {
    if (!normalizedText || !normalizedText.trim()) return null;

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
    return Promise.all(
      texts.map(async (text) => {
        const buf = await this.getOrFetchFullNarrationBuffer(text);
        return buf ? buf.duration : null;
      })
    );
  }

  /**
   * Plays Vietnamese Google TTS chunks sequentially via HTML5 Audio elements (last resort if both server and CORS proxies are unreachable)
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
   * Fallback Web Speech API with strict Vietnamese check
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
   * Plays fluent Vietnamese narration with zero overlap, zero background music distraction,
   * and direct Web Audio routing so exported video files ALWAYS include the voiceover!
   */
  public async playVietnameseNarration(
    normalizedText: string,
    onEnded?: () => void
  ): Promise<void> {
    this.stopVoiceover();
    const currentToken = ++this.playbackToken;

    if (!normalizedText || !normalizedText.trim()) {
      onEnded?.();
      return;
    }

    const ctx = await this.ensureContext();
    if (currentToken !== this.playbackToken) return;

    this.isVoiceoverPlaying = true;

    // 1. Play via decoded Web Audio API AudioBuffer (connects to both speakers AND MediaRecorder export stream!)
    const audioBuffer = await this.getOrFetchFullNarrationBuffer(normalizedText);
    if (currentToken !== this.playbackToken) return;

    if (audioBuffer && this.voiceGain) {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
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

    // 2. Fallback HTML5 Audio element if buffer decoding was unavailable
    const chunks = splitTextIntoChunks(normalizedText, 165);
    const elementPlayed = this.playGoogleTtsChunksSequentially(chunks, currentToken, onEnded);

    if (!elementPlayed && currentToken === this.playbackToken) {
      this.fallbackWebSpeech(normalizedText, currentToken, onEnded);
    }
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
    this.restoreMusic();
  }
}

export const audioEngine = new AudioEngine();
