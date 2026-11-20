// Canvas, fonts, camera, subtle original backgrounds, and on-screen text.
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const P = require('./palette');
const { rng, clamp, lerp, ease, DEG } = require('./util');

GlobalFonts.registerFromPath(path.join(__dirname, '..', 'fonts', 'JetBrainsMono-ExtraBold.ttf'), P.fontLabel);
GlobalFonts.registerFromPath(path.join(__dirname, '..', 'fonts', 'Inter-Black.otf'), P.fontDisplay);

const { W, H } = P;

function makeCanvas(w = W, h = H) {
  return createCanvas(w, h);
}

// ---------- camera ----------
// cam = { x, y, zoom, rot, shake } — (x,y) is the world point shown at screen centre
function applyCamera(ctx, cam = {}, t = 0) {
  const z = cam.zoom || 1;
  let sx = 0, sy = 0;
  if (cam.shake) {
    sx = (Math.sin(t * 91.7) + Math.sin(t * 57.3)) * cam.shake * 0.5;
    sy = (Math.cos(t * 83.1) + Math.sin(t * 43.9)) * cam.shake * 0.5;
  }
  ctx.translate(W / 2 + sx, H / 2 + sy);
  ctx.rotate((cam.rot || 0) * DEG);
  ctx.scale(z, z);
  ctx.translate(-(cam.x == null ? W / 2 : cam.x), -(cam.y == null ? H / 2 : cam.y));
}

// ---------- backgrounds (all procedural + deliberately quiet) ----------
const cache = {};

// pre-rendered film grain frames
function grainFrames() {
  if (cache.grain) return cache.grain;
  const frames = [];
  const r = rng(7);
  for (let i = 0; i < 6; i++) {
    const c = createCanvas(W / 3, H / 3);
    const g = c.getContext('2d');
    const img = g.createImageData(c.width, c.height);
    for (let k = 0; k < img.data.length; k += 4) {
      const v = r() * 255;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v;
      img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    frames.push(c);
  }
  return (cache.grain = frames);
}

// Base: deep charcoal with a soft spotlight. `glow` tints the spotlight (e.g. red at the breaking point).
function drawBase(ctx, o = {}) {
  ctx.fillStyle = P.bg;
  ctx.fillRect(0, 0, W, H);
  const cx = o.cx == null ? W / 2 : o.cx, cy = o.cy == null ? H * 0.47 : o.cy;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, H * 0.62);
  g.addColorStop(0, o.center || P.bgCenter);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (o.glow && o.glowAmt > 0) {
    const r = o.glowR || 520;
    const gx = o.glowX == null ? cx : o.glowX, gy = o.glowY == null ? cy : o.glowY;
    const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    gg.addColorStop(0, rgba(o.glow, 0.55 * o.glowAmt));
    gg.addColorStop(0.5, rgba(o.glow, 0.18 * o.glowAmt));
    gg.addColorStop(1, rgba(o.glow, 0));
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, W, H);
  }
}

// Pattern A — "graph paper": a faint grid with tiny + marks at crossings, fading out from centre.
function drawGrid(ctx, t = 0, o = {}) {
  const step = o.step || 90, a = o.alpha == null ? 0.07 : o.alpha;
  const drift = (t * (o.speed || 6)) % step;
  ctx.save();
  ctx.strokeStyle = o.color || '#ffffff';
  ctx.lineWidth = 2;
  for (let y = -step + drift; y < H + step; y += step) {
    for (let x = -step + (drift * 0.5) % step; x < W + step; x += step) {
      const dx = (x - W / 2) / W, dy = (y - H * 0.47) / H;
      const f = clamp(1 - Math.hypot(dx * 1.3, dy * 1.6) * 1.6);
      if (f <= 0) continue;
      ctx.globalAlpha = a * f;
      ctx.beginPath();
      ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y);
      ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Pattern B — halftone dots that grow toward the screen edges (pressure closing in).
function drawHalftone(ctx, t = 0, o = {}) {
  const step = o.step || 30, amt = o.amt == null ? 1 : o.amt;
  ctx.save();
  ctx.fillStyle = o.color || P.red;
  const cx = o.cx || W / 2, cy = o.cy || H * 0.47;
  for (let y = step / 2; y < H; y += step) {
    for (let x = step / 2 + ((y / step) % 2) * step * 0.5; x < W; x += step) {
      const d = Math.hypot((x - cx) / W, (y - cy) / H * 0.8);
      const pulse = 0.5 + 0.5 * Math.sin(d * 18 - t * 5);
      const r = clamp((d - 0.22) * 2.6) * step * 0.42 * amt * (0.8 + 0.2 * pulse);
      if (r < 0.6) continue;
      ctx.globalAlpha = (o.alpha == null ? 0.16 : o.alpha);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

// Pattern C — concentric pressure rings expanding from a point.
function drawRings(ctx, t, o = {}) {
  const cx = o.cx || W / 2, cy = o.cy || H * 0.47;
  const gap = o.gap || 140, n = 12;
  ctx.save();
  ctx.strokeStyle = o.color || P.red;
  for (let i = 0; i < n; i++) {
    const r = ((t * (o.speed || 160)) % gap) + i * gap;
    const a = clamp(1 - r / (gap * n)) * (o.alpha == null ? 0.22 : o.alpha);
    ctx.globalAlpha = a;
    ctx.lineWidth = o.width || 3;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

// Pattern D — radial burst lines (focus lines), our own take: thin wedges with jitter.
function drawBurst(ctx, t, o = {}) {
  const cx = o.cx || W / 2, cy = o.cy || H * 0.47;
  const n = o.n || 70, inner = o.inner || 330;
  const r = rng(Math.floor(t * (o.flicker || 12)) + 3);
  ctx.save();
  ctx.fillStyle = o.color || '#ffffff';
  ctx.globalAlpha = o.alpha == null ? 0.12 : o.alpha;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.05;
    const w = 0.004 + r() * 0.012;
    const r0 = inner + r() * 140;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a - w) * 2200, cy + Math.sin(a - w) * 2200);
    ctx.lineTo(cx + Math.cos(a + w) * 2200, cy + Math.sin(a + w) * 2200);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// Horizontal speed streaks (for motion / the comeback run).
function drawStreaks(ctx, t, o = {}) {
  const r = rng(11);
  ctx.save();
  ctx.strokeStyle = o.color || '#ffffff';
  ctx.lineCap = 'round';
  for (let i = 0; i < (o.n || 26); i++) {
    const y = r() * H, len = 120 + r() * 380, sp = (900 + r() * 1600) * (o.speed || 1);
    const x = W + 400 - ((t * sp + r() * 3000) % (W + 900));
    ctx.globalAlpha = (o.alpha == null ? 0.12 : o.alpha) * (0.4 + r() * 0.6);
    ctx.lineWidth = 2 + r() * 4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
  }
  ctx.restore();
}

function drawGrain(ctx, frame, amt = 0.06) {
  const g = grainFrames();
  ctx.save();
  ctx.globalAlpha = amt;
  ctx.globalCompositeOperation = 'overlay';
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(g[frame % g.length], 0, 0, W, H);
  ctx.restore();
}

function drawVignette(ctx, amt = 0.85) {
  const g = ctx.createRadialGradient(W / 2, H * 0.47, H * 0.25, W / 2, H * 0.47, H * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${amt})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// Floor: a thin line with small measuring ticks (gym-floor feel). Drawn in world space.
function drawFloor(ctx, y, o = {}) {
  const x0 = o.x0 == null ? -600 : o.x0, x1 = o.x1 == null ? W + 600 : o.x1;
  ctx.save();
  ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
  ctx.strokeStyle = o.color || P.line;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  ctx.lineWidth = 3;
  const off = o.scroll || 0;
  for (let x = x0 - (off % 120); x < x1; x += 120) {
    ctx.beginPath(); ctx.moveTo(x, y + 16); ctx.lineTo(x + 34, y + 16); ctx.stroke();
  }
  ctx.restore();
}

// ---------- text ----------
// Big statement text. `parts` = [['WORD ', color], ...] or a string. Supports pop-in (p 0..1).
function statement(ctx, parts, x, y, o = {}) {
  if (typeof parts === 'string') parts = [[parts, P.white]];
  const size = o.size || 92;
  const p = o.p == null ? 1 : o.p;
  if (p <= 0) return;
  const sc = o.noPop ? 1 : lerp(0.6, 1, ease.outBack(clamp(p)));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((o.rot || 0) * DEG);
  ctx.scale(sc, sc);
  ctx.globalAlpha *= clamp(p * 3) * (o.alpha == null ? 1 : o.alpha);
  ctx.font = `${size}px ${o.font || P.fontDisplay}`;
  ctx.letterSpacing = `${o.tracking == null ? -size * 0.02 : o.tracking}px`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const widths = parts.map(([s]) => ctx.measureText(s).width);
  const total = widths.reduce((a, b) => a + b, 0);
  let cx = o.align === 'left' ? 0 : -total / 2;
  parts.forEach(([s, col], i) => {
    ctx.lineJoin = 'round';
    if (o.stroke !== false) {
      ctx.lineWidth = o.strokeW || size * 0.16;
      ctx.strokeStyle = P.ink;
      ctx.strokeText(s, cx, 0);
    }
    if (o.outlineOnly) {
      ctx.lineWidth = o.outlineW || 4; ctx.strokeStyle = col; ctx.strokeText(s, cx, 0);
    } else {
      ctx.fillStyle = col;
      ctx.fillText(s, cx, 0);
    }
    cx += widths[i];
  });
  ctx.restore();
}

// Small monospaced caption (e.g. "DAY 47", "REPS").
function mono(ctx, s, x, y, o = {}) {
  const size = o.size || 34;
  ctx.save();
  ctx.globalAlpha *= o.alpha == null ? 1 : o.alpha;
  ctx.font = `${size}px ${P.fontLabel}`;
  ctx.letterSpacing = `${size * (o.spacing == null ? 0.25 : o.spacing)}px`;
  ctx.textAlign = o.align || 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8; ctx.lineJoin = 'round'; ctx.strokeStyle = P.ink;
  const nx = x + (ctx.textAlign === 'center' ? size * (o.spacing == null ? 0.25 : o.spacing) * 0.5 : 0);
  ctx.strokeText(s, nx, y);
  ctx.fillStyle = o.color || P.white;
  ctx.fillText(s, nx, y);
  ctx.restore();
}

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

module.exports = {
  W, H, makeCanvas, applyCamera, drawBase, drawGrid, drawHalftone, drawRings, drawBurst, drawStreaks,
  drawGrain, drawVignette, drawFloor, statement, mono, rgba,
};
