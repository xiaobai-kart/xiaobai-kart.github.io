// 声音：全部用 Web Audio 实时合成，不需要音频文件
(function () {
  const A = { ctx: null, muted: false };
  let master, engG, engO1, engO2, engF, drG, musicG, noiseBuf, seqTimer = null, step = 0, nextT = 0;

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = A.ctx = new C();
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    engF = ctx.createBiquadFilter(); engF.type = 'lowpass'; engF.frequency.value = 700;
    engG = ctx.createGain(); engG.gain.value = 0;
    engO1 = ctx.createOscillator(); engO1.type = 'sawtooth'; engO1.frequency.value = 60;
    engO2 = ctx.createOscillator(); engO2.type = 'square'; engO2.frequency.value = 61;
    const g2 = ctx.createGain(); g2.gain.value = 0.4;
    engO1.connect(engF); engO2.connect(g2); g2.connect(engF); engF.connect(engG); engG.connect(master);
    engO1.start(); engO2.start();

    const dn = ctx.createBufferSource(); dn.buffer = noiseBuf; dn.loop = true;
    const df = ctx.createBiquadFilter(); df.type = 'bandpass'; df.frequency.value = 2200; df.Q.value = 1.4;
    drG = ctx.createGain(); drG.gain.value = 0;
    dn.connect(df); df.connect(drG); drG.connect(master); dn.start();

    musicG = ctx.createGain(); musicG.gain.value = 0.0; musicG.connect(master);
  };

  A.setMuted = function (m) { A.muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, A.ctx.currentTime, 0.05); };

  A.engine = function (speed, boost, on) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime, s = Math.abs(speed);
    const f = 48 + s * 2.4 + (boost ? 30 : 0);
    engO1.frequency.setTargetAtTime(f, t, 0.06); engO2.frequency.setTargetAtTime(f * 1.5 + 1, t, 0.06);
    engF.frequency.setTargetAtTime(500 + s * 30 + (boost ? 800 : 0), t, 0.08);
    engG.gain.setTargetAtTime(on ? 0.035 + s * 0.0009 : 0, t, 0.1);
  };
  A.drift = function (on) { if (A.ctx) drG.gain.setTargetAtTime(on ? 0.05 : 0, A.ctx.currentTime, 0.05); };

  function tone(freq, dur, type = 'square', vol = 0.12, freq2, delay = 0) {
    if (!A.ctx) return;
    const ctx = A.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.2, freq = 1200, type = 'lowpass', delay = 0) {
    if (!A.ctx) return;
    const ctx = A.ctx, t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
  }

  A.sfx = function (name) {
    switch (name) {
      case 'count': tone(520, 0.25, 'square', 0.12); break;
      case 'go': tone(1040, 0.6, 'square', 0.14); tone(1560, 0.6, 'triangle', 0.08); break;
      case 'boost': noise(0.5, 0.18, 900, 'bandpass'); tone(180, 0.5, 'sawtooth', 0.06, 520); break;
      case 'nitro': noise(0.9, 0.22, 700, 'bandpass'); tone(150, 0.9, 'sawtooth', 0.08, 700); break;
      case 'nitroGet': tone(880, 0.12, 'triangle', 0.12); tone(1320, 0.18, 'triangle', 0.12, null, 0.09); break;
      case 'wall': noise(0.22, 0.25, 400); tone(90, 0.2, 'square', 0.08, 50); break;
      case 'item': tone(660, 0.08, 'square', 0.08); tone(990, 0.15, 'square', 0.08, null, 0.07); tone(1320, 0.2, 'triangle', 0.1, null, 0.14); break;
      case 'roll': for (let i = 0; i < 8; i++) tone(500 + i * 70, 0.05, 'square', 0.05, null, i * 0.1); break;
      case 'throw': tone(400, 0.3, 'sine', 0.14, 900); noise(0.25, 0.08, 2000, 'highpass'); break;
      case 'drop': tone(300, 0.15, 'triangle', 0.12, 160); break;
      case 'splash': noise(0.5, 0.25, 1500); tone(600, 0.3, 'sine', 0.1, 200); break;
      case 'slip': tone(900, 0.5, 'sawtooth', 0.07, 200); noise(0.4, 0.12, 2500, 'highpass'); break;
      case 'hit': noise(0.45, 0.25, 1200); tone(300, 0.5, 'sine', 0.14, 120); break;
      case 'shield': tone(500, 0.4, 'sine', 0.12, 1000); tone(750, 0.4, 'sine', 0.08, 1500, 0.05); break;
      case 'block': tone(1200, 0.15, 'triangle', 0.14); tone(1800, 0.2, 'triangle', 0.1, null, 0.08); break;
      case 'magnet': tone(220, 0.6, 'sawtooth', 0.07, 880); break;
      case 'angel': for (let i = 0; i < 5; i++) tone(880 * Math.pow(1.26, i), 0.4, 'sine', 0.08, null, i * 0.07); break;
      case 'jump': tone(300, 0.25, 'sine', 0.08, 600); break;
      case 'land': noise(0.2, 0.2, 300); break;
      case 'lap': [784, 988, 1175].forEach((f, i) => tone(f, 0.25, 'square', 0.09, null, i * 0.11)); break;
      case 'finish': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.3, 'square', 0.1, null, i * 0.14)); break;
      case 'click': tone(800, 0.06, 'square', 0.06); break;
    }
  };

  // 背景音乐：简单的轻快循环
  const MEL = [76, 79, 81, 79, 76, 74, 72, 74, 76, 76, 79, 81, 84, 81, 79, 76, 77, 81, 84, 81, 77, 76, 74, 72, 74, 76, 79, 76, 74, 72, 71, 72];
  const BASS = [48, 48, 55, 55, 45, 45, 52, 52, 41, 41, 48, 48, 43, 43, 50, 50];
  const mf = n => 440 * Math.pow(2, (n - 69) / 12);
  function sched() {
    const ctx = A.ctx, spb = 60 / 150 / 2;
    while (nextT < ctx.currentTime + 0.2) {
      const i = step % 32;
      if (i % 1 === 0 && MEL[i] && (step % 64 < 32 || i % 2 === 0)) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = mf(MEL[i]);
        g.gain.setValueAtTime(0.05, nextT); g.gain.exponentialRampToValueAtTime(0.0001, nextT + spb * 1.6);
        o.connect(g); g.connect(musicG); o.start(nextT); o.stop(nextT + spb * 1.7);
      }
      if (step % 2 === 0) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = mf(BASS[(step / 2) % 16]);
        g.gain.setValueAtTime(0.09, nextT); g.gain.exponentialRampToValueAtTime(0.0001, nextT + spb * 1.8);
        o.connect(g); g.connect(musicG); o.start(nextT); o.stop(nextT + spb * 2);
      }
      if (step % 4 === 2) {
        const s = ctx.createBufferSource(); s.buffer = noiseBuf;
        const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.03, nextT); g.gain.exponentialRampToValueAtTime(0.0001, nextT + 0.05);
        s.connect(f); f.connect(g); g.connect(musicG); s.start(nextT); s.stop(nextT + 0.06);
      }
      nextT += spb; step++;
    }
  }
  A.music = function (on) {
    if (!A.ctx) return;
    musicG.gain.setTargetAtTime(on ? 1 : 0, A.ctx.currentTime, 0.3);
    if (on && !seqTimer) { nextT = A.ctx.currentTime + 0.1; seqTimer = setInterval(sched, 50); }
  };

  window.AUDIO = A;
})();
