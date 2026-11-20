// Small math + easing + keyframe helpers shared by every episode.

const DEG = Math.PI / 180;

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
// progress of t inside [a, b] -> 0..1 (clamped)
const seg = (t, a, b) => clamp((t - a) / (b - a));

const ease = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  in3: (t) => t * t * t,
  out3: (t) => 1 - Math.pow(1 - t, 3),
  inOut3: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => {
    const c1 = 1.9, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  step: (t) => (t < 1 ? 0 : 1),
};

// deterministic pseudo random (so every render is identical)
function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
// smooth 1D noise, deterministic
function noise1(x, seed = 0) {
  const h = (n) => {
    const v = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u) * 2 - 1;
}

// Interpolate two plain objects of numbers (and nested {x,y} / arrays).
function mix(a, b, t) {
  if (typeof a === 'number' && typeof b === 'number') return lerp(a, b, t);
  if (a == null) return b;
  if (b == null) return a;
  if (Array.isArray(a)) return a.map((v, i) => mix(v, b[i], t));
  if (typeof a === 'object') {
    const out = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = mix(a[k], b[k], t);
    return out;
  }
  return t < 0.5 ? a : b;
}

// Keyframe track: keys = [[time, value, easeName?], ...]  (ease applies to the segment ARRIVING at that key)
function track(keys) {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, e] = keys[i];
      if (t <= t1) {
        const [t0, v0] = keys[i - 1];
        const p = (ease[e || 'inOut'] || ease.inOut)(seg(t, t0, t1));
        return mix(v0, v1, p);
      }
    }
    return keys[keys.length - 1][1];
  };
}

module.exports = { DEG, clamp, lerp, seg, ease, rng, noise1, mix, track };
