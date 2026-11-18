// All sound is synthesised with WebAudio: no audio files are shipped.
// The engine is two detuned sawtooths through a lowpass whose pitch follows
// the car speed; the music is a slow chord-pad loop with a bass line, all
// scheduled ahead of time so it never stutters.

import { CFG } from './config.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenOn = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.muted = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = CFG.audio.music * 0.35;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = CFG.audio.sfx;
    this.sfxGain.connect(this.master);

    // Engine hum: two saws, one an octave up, through a lowpass.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const engineOsc2 = this.ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 110;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    engineOsc2.start();
    this.engineOsc2 = engineOsc2;

    // Police siren: a triangle that slides between two notes.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.9;
  }

  setEngine(speed01) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const freq = 50 + speed01 * 130;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(freq * 2, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(280 + speed01 * 900, t, 0.1);
    this.engineGain.gain.setTargetAtTime(speed01 > 0.02 ? 0.05 + speed01 * 0.05 : 0, t, 0.1);
  }

  setSiren(on) {
    if (!this.ctx || this.sirenOn === on) return;
    this.sirenOn = on;
    const t = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, t, 0.2);
    if (on) {
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.7;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      lfo.start();
      this.sirenLfo = lfo;
    } else if (this.sirenLfo) {
      this.sirenLfo.stop();
      this.sirenLfo = null;
      this.sirenOsc.frequency.value = 700;
    }
  }

  // A short noise burst through a filter: gunshots, punches, crashes.
  burst(freq, dur, vol, type = 'lowpass') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start();
  }

  // A short tone with a slide: pickups, clicks, jingles.
  tone(freq, endFreq, dur, vol, type = 'sine') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(t + dur + 0.02);
  }

  shot() { this.burst(1800, 0.14, 0.5, 'bandpass'); this.tone(160, 60, 0.1, 0.25, 'square'); }
  punch() { this.burst(300, 0.1, 0.4); }
  crash(intensity = 1) { this.burst(240, 0.3, 0.5 * intensity); }
  pickup() { this.tone(660, 990, 0.12, 0.25); this.tone(990, 1320, 0.14, 0.2); }
  cash() { this.tone(880, 880, 0.09, 0.22, 'triangle'); this.tone(1174, 1174, 0.12, 0.22, 'triangle'); }
  click() { this.tone(500, 400, 0.05, 0.15, 'square'); }
  missionStart() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, f, 0.16, 0.22, 'triangle'), i * 110)); }
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, f, 0.2, 0.22, 'triangle'), i * 120)); }
  busted() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.tone(f, f, 0.25, 0.25, 'sawtooth'), i * 160)); }
  wasted() { [330, 262, 196, 131].forEach((f, i) => setTimeout(() => this.tone(f, f, 0.3, 0.25, 'sawtooth'), i * 180)); }

  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    // Am – F – C – G pad, one bar each, with a walking bass line.
    const chords = [
      [220.0, 261.6, 329.6],
      [174.6, 220.0, 261.6],
      [196.0, 246.9, 293.7],
      [164.8, 196.0, 246.9],
    ];
    const bass = [55, 43.65, 65.41, 49];
    const barLen = 2.4;
    const step = () => {
      if (!this.ctx) return;
      const bar = this.musicStep % 4;
      const t0 = this.ctx.currentTime + 0.05;
      for (const f of chords[bar]) {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.05, t0 + 0.4);
        g.gain.setValueAtTime(0.05, t0 + barLen - 0.5);
        g.gain.linearRampToValueAtTime(0, t0 + barLen);
        osc.connect(g);
        g.connect(this.musicGain);
        osc.start(t0);
        osc.stop(t0 + barLen + 0.1);
      }
      const b = this.ctx.createOscillator();
      b.type = 'sine';
      b.frequency.value = bass[bar];
      const bg = this.ctx.createGain();
      bg.gain.setValueAtTime(0.09, t0);
      bg.gain.setValueAtTime(0.09, t0 + barLen - 0.3);
      bg.gain.linearRampToValueAtTime(0, t0 + barLen);
      b.connect(bg);
      bg.connect(this.musicGain);
      b.start(t0);
      b.stop(t0 + barLen + 0.1);
      this.musicStep += 1;
    };
    step();
    this.musicTimer = setInterval(step, 2400);
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}
