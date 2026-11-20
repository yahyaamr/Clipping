// Procedural sound effects — every SFX is synthesised, so there are no third-party audio files.
// An episode lists cues as [time, name, {gain, ...}]; mixCues() renders a 48 kHz stereo WAV.
const fs = require('fs');
const { rng } = require('./util');

const SR = 48000;
const TAU = Math.PI * 2;

// one-pole low-pass / high-pass helpers
function lowpass(buf, cutoff) {
  const a = Math.exp((-TAU * cutoff) / SR);
  let y = 0;
  for (let i = 0; i < buf.length; i++) { y = (1 - a) * buf[i] + a * y; buf[i] = y; }
  return buf;
}
function highpass(buf, cutoff) {
  const a = Math.exp((-TAU * cutoff) / SR);
  let lp = 0;
  for (let i = 0; i < buf.length; i++) { lp = (1 - a) * buf[i] + a * lp; buf[i] = buf[i] - lp; }
  return buf;
}
// resonant band-pass (biquad) with a time-varying centre frequency
function bandSweep(buf, f0, f1, q = 2) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const f = f0 * Math.pow(f1 / f0, i / buf.length);
    const w = (TAU * f) / SR, al = Math.sin(w) / (2 * q);
    const b0 = al, b2 = -al, a0 = 1 + al, a1 = -2 * Math.cos(w), a2 = 1 - al;
    const x = buf[i];
    const y = (b0 * x + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y; buf[i] = y;
  }
  return buf;
}
const env = (i, n, att, rel) => {
  const t = i / SR, d = n / SR;
  const a = att > 0 ? Math.min(1, t / att) : 1;
  const r = Math.max(0, Math.min(1, (d - t) / rel));
  return a * r;
};
function norm(buf, peak = 0.9) {
  let m = 0;
  for (const v of buf) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < buf.length; i++) buf[i] *= peak / m;
  return buf;
}

const SFX = {
  // air whoosh: band-passed noise sweeping up then down
  whoosh(o = {}) {
    const d = o.dur || 0.45, n = Math.floor(d * SR), r = rng(o.seed || 3);
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) b[i] = r() * 2 - 1;
    bandSweep(b, o.f0 || 350, o.f1 || 2400, 1.4);
    for (let i = 0; i < n; i++) { const x = i / n; b[i] *= Math.sin(Math.PI * Math.pow(x, 0.7)); }
    return norm(b, 0.8);
  },
  // body hitting the floor
  thud(o = {}) {
    const d = o.dur || 0.38, n = Math.floor(d * SR), r = rng(9);
    const b = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const f = (o.f || 85) * Math.exp(-t * 9) + 34;
      ph += (TAU * f) / SR;
      b[i] = Math.sin(ph) * Math.exp(-t * 11) + (r() * 2 - 1) * Math.exp(-t * 60) * 0.5;
    }
    lowpass(b, 900);
    return norm(b, 0.95);
  },
  // big cinematic impact: sub drop + crunch + tail
  impact(o = {}) {
    const d = 1.8, n = Math.floor(d * SR), r = rng(21);
    const b = new Float32Array(n);
    let ph = 0;
    const noise = new Float32Array(n);
    for (let i = 0; i < n; i++) noise[i] = r() * 2 - 1;
    lowpass(noise, 2200);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const f = 120 * Math.exp(-t * 6) + 38;
      ph += (TAU * f) / SR;
      const sub = Math.tanh(Math.sin(ph) * 2.2) * Math.exp(-t * 2.4);
      b[i] = sub + noise[i] * (Math.exp(-t * 14) * 0.9 + Math.exp(-t * 2.5) * 0.12);
    }
    return norm(b, 0.98);
  },
  // UI tick for counters / typing
  tick(o = {}) {
    const n = Math.floor(0.035 * SR), r = rng(o.seed || 5);
    const b = new Float32Array(n);
    const f = o.f || 2600;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      b[i] = (Math.sin(TAU * f * t) * 0.6 + (r() * 2 - 1) * 0.4) * Math.exp(-t * 160);
    }
    return norm(b, 0.5);
  },
  // text pop
  pop(o = {}) {
    const n = Math.floor(0.12 * SR);
    const b = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const f = (o.f || 380) * (1 + 1.6 * Math.min(1, t / 0.05));
      ph += (TAU * f) / SR;
      b[i] = Math.sin(ph) * env(i, n, 0.002, 0.08);
    }
    return norm(b, 0.55);
  },
  // heavy stamp for big words
  stamp() {
    const n = Math.floor(0.5 * SR), r = rng(13);
    const b = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      ph += (TAU * (70 * Math.exp(-t * 12) + 45)) / SR;
      b[i] = Math.sin(ph) * Math.exp(-t * 9) + (r() * 2 - 1) * Math.exp(-t * 40) * 0.7;
    }
    lowpass(b, 3000);
    return norm(b, 0.95);
  },
  // heartbeat: lub-dub
  heartbeat() {
    const n = Math.floor(0.7 * SR);
    const b = new Float32Array(n);
    const beat = (t0, amp) => {
      let ph = 0;
      for (let i = Math.floor(t0 * SR); i < n; i++) {
        const t = i / SR - t0;
        ph += (TAU * (55 * Math.exp(-t * 6) + 32)) / SR;
        b[i] += Math.sin(ph) * Math.exp(-t * 14) * amp;
      }
    };
    beat(0, 1); beat(0.2, 0.75);
    lowpass(b, 400);
    return norm(b, 0.95);
  },
  // tension riser: noise + detuned saws climbing, ends abruptly
  riser(o = {}) {
    const d = o.dur || 3, n = Math.floor(d * SR), r = rng(31);
    const b = new Float32Array(n);
    const noise = new Float32Array(n);
    for (let i = 0; i < n; i++) noise[i] = r() * 2 - 1;
    bandSweep(noise, 300, 5000, 1.2);
    let p1 = 0, p2 = 0;
    for (let i = 0; i < n; i++) {
      const x = i / n;
      const f = 90 * Math.pow(9, x);
      p1 += f / SR; p2 += (f * 1.012) / SR;
      const saw = ((p1 % 1) * 2 - 1 + (p2 % 1) * 2 - 1) * 0.25;
      b[i] = (saw + noise[i] * 0.8) * Math.pow(x, 2.2);
    }
    lowpass(b, 6000);
    return norm(b, 0.75);
  },
  // short vocal-ish "HA" (glottal pulses through two formants)
  ha(o = {}) {
    const d = 0.16, n = Math.floor(d * SR), r = rng(o.seed || 41);
    const f0 = o.f || 160 + r() * 40;
    const src = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      ph += f0 / SR;
      src[i] = (ph % 1 < 0.08 ? 1 : 0) + (r() * 2 - 1) * 0.35 * Math.exp(-i / SR * 30);
    }
    const a = bandSweep(Float32Array.from(src), 750, 700, 6);
    const b2 = bandSweep(Float32Array.from(src), 1200, 1100, 6);
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) b[i] = (a[i] + b2[i] * 0.6) * env(i, n, 0.008, 0.09);
    highpass(b, 120);
    return norm(b, 0.6);
  },
  // the win: bright two-note chime
  ding() {
    const n = Math.floor(1.2 * SR);
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const n1 = Math.sin(TAU * 1046.5 * t) + 0.4 * Math.sin(TAU * 2093 * t);
      const n2 = t > 0.09 ? Math.sin(TAU * 1568 * (t - 0.09)) + 0.3 * Math.sin(TAU * 3136 * (t - 0.09)) : 0;
      b[i] = n1 * Math.exp(-t * 5) * 0.6 + n2 * Math.exp(-(t - 0.09) * 3.2) * 0.7;
    }
    return norm(b, 0.6);
  },
  // straining rumble (low filtered noise)
  rumble(o = {}) {
    const d = o.dur || 1.5, n = Math.floor(d * SR), r = rng(55);
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) b[i] = r() * 2 - 1;
    lowpass(b, 160); lowpass(b, 160);
    for (let i = 0; i < n; i++) b[i] *= env(i, n, 0.2, 0.3) * (0.7 + 0.3 * Math.sin(i / SR * 37));
    return norm(b, 0.7);
  },
};

// Render cues to a stereo 16-bit WAV.
function mixCues(cues, duration, outPath) {
  const n = Math.ceil(duration * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const memo = {};
  for (const [time, name, o = {}] of cues) {
    const key = name + JSON.stringify(o);
    const buf = memo[key] || (memo[key] = SFX[name](o));
    const g = o.gain == null ? 0.7 : o.gain, pan = o.pan || 0;
    const gl = g * Math.min(1, 1 - pan), gr = g * Math.min(1, 1 + pan);
    const start = Math.floor(time * SR);
    for (let i = 0; i < buf.length && start + i < n; i++) {
      if (start + i < 0) continue;
      L[start + i] += buf[i] * gl; R[start + i] += buf[i] * gr;
    }
  }
  // soft limiter
  const data = Buffer.alloc(44 + n * 4);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.tanh(L[i] * 1.1) * 32000), 44 + i * 4);
    data.writeInt16LE(Math.round(Math.tanh(R[i] * 1.1) * 32000), 46 + i * 4);
  }
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 4, 4); data.write('WAVE', 8);
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
  data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(n * 4, 40);
  fs.writeFileSync(outPath, data);
}

module.exports = { SFX, mixCues, SR };
