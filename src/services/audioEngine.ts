export type DuckingListener = (isDucking: boolean, currentGain: number) => void;

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

  // Active voiceover source
  private activeVoiceSource: AudioBufferSourceNode | null = null;
  private isVoiceoverPlaying: boolean = false;
  private isDucked: boolean = false;

  // Listeners
  private duckingListeners: Set<DuckingListener> = new Set();

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
      this.masterGain.gain.setValueAtTime(0.9, this.audioCtx.currentTime);

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

  /**
   * Sets custom volume levels
   */
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

    // Mood chords (Cinematic D minor / Ambient modal)
    // Frequencies: D2 (73.4), A2 (110.0), F3 (174.6), A3 (220.0), C4 (261.6), E4 (329.6)
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

      // Fade out previous synth nodes
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

      // Filter node for warmth
      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(550, this.audioCtx.currentTime);
      filter.Q.setValueAtTime(1.5, this.audioCtx.currentTime);
      filter.connect(this.musicGain);

      // Play new notes
      currentNotes.forEach((freq, idx) => {
        if (!this.audioCtx) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = idx === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

        // Subtle slow pitch drift for analog character
        const detune = (idx * 2 - 2) + Math.sin(Date.now() / 1000) * 1.5;
        osc.detune.setValueAtTime(detune, this.audioCtx.currentTime);

        const targetGain = idx === 0 ? 0.35 : 0.15;
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

  /**
   * Fetches Google TTS Vietnamese audio as an AudioBuffer
   */
  public async fetchGoogleTtsBuffer(text: string): Promise<AudioBuffer | null> {
    const ctx = await this.ensureContext();
    const cleanText = text.slice(0, 190);

    const tryFetch = async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`TTS status ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      return await ctx.decodeAudioData(arrayBuffer);
    };

    try {
      // Primary: backend proxy with anti-CORS headers
      return await tryFetch(`/api/tts?text=${encodeURIComponent(cleanText)}`);
    } catch (err) {
      console.warn('Backend TTS failed, trying direct Google TTS URL...', err);
      try {
        const directUrl = `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
          cleanText
        )}&tl=vi&client=gtx`;
        return await tryFetch(directUrl);
      } catch (directErr) {
        console.warn('Direct Google TTS also failed:', directErr);
        return null;
      }
    }
  }

  /**
   * Plays Vietnamese voiceover with ducking:
   * 1. First tries Google TTS AudioBuffer.
   * 2. If fails, uses Web Speech API strictly locked to Vietnamese voice (`vi-VN`).
   */
  public async playVietnameseNarration(
    normalizedText: string,
    onEnded?: () => void
  ): Promise<void> {
    const ctx = await this.ensureContext();
    this.stopVoiceover();

    this.isVoiceoverPlaying = true;
    this.duckMusic();

    const handleFinished = () => {
      this.isVoiceoverPlaying = false;
      this.restoreMusic();
      onEnded?.();
    };

    // Attempt Google TTS AudioBuffer
    const audioBuffer = await this.fetchGoogleTtsBuffer(normalizedText);

    if (audioBuffer && this.voiceGain) {
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.voiceGain);
      this.activeVoiceSource = source;

      source.onended = () => {
        if (this.activeVoiceSource === source) {
          this.activeVoiceSource = null;
          handleFinished();
        }
      };

      source.start();
      return;
    }

    // Fallback: Web Speech API with strict Vietnamese check
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(normalizedText);
      utterance.lang = 'vi-VN';
      utterance.rate = 0.95;

      const voices = window.speechSynthesis.getVoices();
      const vietnameseVoice = voices.find(
        (v) =>
          v.lang.toLowerCase().includes('vi') ||
          v.lang.toLowerCase().includes('vn') ||
          v.name.toLowerCase().includes('vietnam')
      );

      // CRITICAL REQUIREMENT: Strictly disallow English voice reading Vietnamese!
      if (vietnameseVoice) {
        utterance.voice = vietnameseVoice;
      } else if (voices.length > 0 && !voices.some((v) => v.lang.toLowerCase().includes('vi'))) {
        console.warn('No Vietnamese TTS voice found on system. Muting speech to avoid English voice reciting Vietnamese.');
        // Wait simulated duration then finish
        const wordCount = normalizedText.split(/\s+/).length;
        const durationMs = Math.max(3000, (wordCount / 3.25) * 1000);
        setTimeout(handleFinished, durationMs);
        return;
      }

      utterance.onend = () => {
        handleFinished();
      };

      utterance.onerror = () => {
        handleFinished();
      };

      window.speechSynthesis.speak(utterance);
    } else {
      // Simulate duration
      const wordCount = normalizedText.split(/\s+/).length;
      const durationMs = Math.max(3000, (wordCount / 3.25) * 1000);
      setTimeout(handleFinished, durationMs);
    }
  }

  public stopVoiceover(): void {
    if (this.activeVoiceSource) {
      try {
        this.activeVoiceSource.stop();
        this.activeVoiceSource.disconnect();
      } catch {}
      this.activeVoiceSource = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    if (this.isVoiceoverPlaying) {
      this.isVoiceoverPlaying = false;
      this.restoreMusic();
    }
  }

  /**
   * Complete reset: stops all voice, music, synthesizers
   */
  public stopAll(): void {
    this.stopVoiceover();
    this.stopBackgroundMusic();
    this.restoreMusic();
  }
}

export const audioEngine = new AudioEngine();
