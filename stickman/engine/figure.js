// The stickman rig.
//
// A figure is drawn from a POSE (joint angles in degrees) at a ROOT (hip point in world space).
// Local space: the figure faces +x, y points down. Angle convention for a bone: 0 = pointing straight
// down, 90 = pointing forward (+x), 180 = straight up.
//
// Pose fields (all optional, default 0):
//   lean  torso lean forward (+) / back (-)
//   neck  head tilt forward (+) / back (-)
//   sa,ea back arm shoulder / elbow (relative to torso; elbow + bends the forearm forward)
//   sb,eb front arm
//   ha,ka back leg hip / knee  (knee - bends the shin backwards, like a real knee)
//   hb,kb front leg
//   ik    { ha:[x,y], hb:[x,y], fa:[x,y], fb:[x,y] }  WORLD targets for hands (ha/hb) / feet (fa/fb)
//
// Placement: { x, y, rot (deg, clockwise), facing (1 | -1), scale, alpha }

const { DEG } = require('./util');
const P = require('./palette');

const BASE = {
  head: 40, // radius
  torso: 118,
  torsoW: 50,
  upper: 72,
  fore: 66,
  armW: 25,
  thigh: 84,
  shin: 82,
  legW: 29,
  outline: 7,
};

const dir = (a) => [Math.sin(a * DEG), Math.cos(a * DEG)];
const angOf = (vx, vy) => Math.atan2(vx, vy) / DEG;

// two-bone IK: returns [upperAbs, lowerAbs] in our angle convention.
function ik2(sx, sy, tx, ty, l1, l2, bend) {
  let dx = tx - sx, dy = ty - sy;
  let d = Math.hypot(dx, dy);
  const maxD = (l1 + l2) * 0.999;
  if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
  if (d < 1e-3) d = 1e-3;
  const base = angOf(dx, dy);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA))) / DEG;
  const upper = base + bend * a;
  const ux = sx + Math.sin(upper * DEG) * l1, uy = sy + Math.cos(upper * DEG) * l1;
  const lower = angOf(tx - ux, ty - uy);
  return [upper, lower];
}

class Figure {
  constructor(opts = {}) {
    this.label = opts.label || '';
    this.color = opts.color || P.gray;
    this.farColor = opts.farColor || null;
    this.labelColor = opts.labelColor || P.grayText;
    this.scale = opts.scale || 1;
    this.headband = !!opts.headband; // the hero's signature red headband
    this.face = opts.face || 'none'; // none | frown | flat | grit | smile
    this.dims = { ...BASE, ...(opts.dims || {}) };
  }

  // Compute joint positions in LOCAL space. Returns a skeleton object.
  solve(pose, place) {
    const d = this.dims;
    const p = { lean: 0, neck: 0, sa: -8, ea: 8, sb: 8, eb: 8, ha: -4, ka: 0, hb: 4, kb: 0, ...pose };
    const hip = [0, 0];
    const up = dir(180 - p.lean);
    const neck = [hip[0] + up[0] * d.torso, hip[1] + up[1] * d.torso];
    const shoulder = [neck[0] - up[0] * 14, neck[1] - up[1] * 14];
    const headC = (() => {
      const hd = dir(180 - p.lean - p.neck);
      return [neck[0] + hd[0] * (d.head + 6), neck[1] + hd[1] * (d.head + 6)];
    })();

    const toLocal = (w) => this.worldToLocal(w, place);
    const limb = (start, a1rel, a2rel, l1, l2, target, bend, relToTorso) => {
      let a1, a2;
      if (target) {
        const t = toLocal(target);
        [a1, a2] = ik2(start[0], start[1], t[0], t[1], l1, l2, bend);
      } else {
        a1 = relToTorso ? a1rel - p.lean : a1rel;
        a2 = a1 + a2rel;
      }
      const j = [start[0] + dir(a1)[0] * l1, start[1] + dir(a1)[1] * l1];
      const e = [j[0] + dir(a2)[0] * l2, j[1] + dir(a2)[1] * l2];
      return [start, j, e];
    };
    const ikT = p.ik || {};
    return {
      hip, neck, shoulder, headC,
      armA: limb(shoulder, p.sa, p.ea, d.upper, d.fore, ikT.ha, -1, true),
      armB: limb(shoulder, p.sb, p.eb, d.upper, d.fore, ikT.hb, -1, true),
      legA: limb(hip, p.ha, p.ka, d.thigh, d.shin, ikT.fa, 1, false),
      legB: limb(hip, p.hb, p.kb, d.thigh, d.shin, ikT.fb, 1, false),
      p,
    };
  }

  // world <-> local transforms for a placement
  localToWorld([lx, ly], pl) {
    const s = (pl.scale || 1) * this.scale, f = pl.facing || 1, r = (pl.rot || 0) * DEG;
    const x = lx * s * f, y = ly * s;
    return [pl.x + x * Math.cos(r) - y * Math.sin(r), pl.y + x * Math.sin(r) + y * Math.cos(r)];
  }
  worldToLocal([wx, wy], pl) {
    const s = (pl.scale || 1) * this.scale, f = pl.facing || 1, r = (pl.rot || 0) * DEG;
    const dx = wx - pl.x, dy = wy - pl.y;
    const x = dx * Math.cos(-r) - dy * Math.sin(-r), y = dx * Math.sin(-r) + dy * Math.cos(-r);
    return [x / s / f, y / s];
  }

  // Useful world points (for labels, props, other figures sitting on this one).
  points(pose, place) {
    const sk = this.solve(pose, place);
    const w = (pt) => this.localToWorld(pt, place);
    const d = this.dims;
    const backOff = (pt) => {
      // a point on the BACK surface of the torso
      const up = dir(180 - sk.p.lean);
      const back = [up[1], -up[0]];
      return w([pt[0] + back[0] * d.torsoW * 0.55, pt[1] + back[1] * d.torsoW * 0.55]);
    };
    const mid = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    return {
      hip: w(sk.hip), neck: w(sk.neck), head: w(sk.headC),
      handA: w(sk.armA[2]), handB: w(sk.armB[2]), footA: w(sk.legA[2]), footB: w(sk.legB[2]),
      backLow: backOff(mid(sk.hip, sk.neck, 0.15)),
      backHigh: backOff(mid(sk.hip, sk.neck, 0.7)),
      backMid: backOff(mid(sk.hip, sk.neck, 0.42)),
      // top (back side) of the front thigh, frac 0 = hip .. 1 = knee
      thighTop: w([mid(sk.legB[0], sk.legB[1], 0.75)[0] - d.legW * 0.6, mid(sk.legB[0], sk.legB[1], 0.75)[1]]),
      headR: d.head * this.scale * (place.scale || 1),
    };
  }

  draw(ctx, pose, place, opt = {}) {
    const sk = this.solve(pose, place);
    const d = this.dims;
    const s = (place.scale || 1) * this.scale;
    const body = opt.color || this.color;
    const far = opt.farColor || this.farColor || shade(body, -0.16);
    const ink = opt.ink || P.ink;
    const o = d.outline;
    const t = opt.time || 0;

    ctx.save();
    ctx.globalAlpha *= place.alpha == null ? 1 : place.alpha;
    ctx.translate(place.x, place.y);
    ctx.rotate((place.rot || 0) * DEG);
    ctx.scale(s * (place.facing || 1), s);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const stroke = (pts, w, col) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.lineWidth = w + o * 2; ctx.strokeStyle = ink; ctx.stroke();
      ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke();
    };

    // torso as a slightly pear-shaped capsule: a thick line + a wider pelvis blob
    const drawTorso = () => {
      const [hx, hy] = sk.hip, [nx, ny] = sk.neck;
      const mx = hx + (nx - hx) * 0.18, my = hy + (ny - hy) * 0.18;
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(nx + (hx - nx) * 0.12, ny + (hy - ny) * 0.12);
      ctx.lineWidth = d.torsoW + o * 2; ctx.strokeStyle = ink; ctx.stroke();
      ctx.beginPath(); ctx.arc(mx, my, d.torsoW * 0.62 + o, 0, Math.PI * 2); ctx.fillStyle = ink; ctx.fill();
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(nx + (hx - nx) * 0.12, ny + (hy - ny) * 0.12);
      ctx.lineWidth = d.torsoW; ctx.strokeStyle = body; ctx.stroke();
      ctx.beginPath(); ctx.arc(mx, my, d.torsoW * 0.62, 0, Math.PI * 2); ctx.fillStyle = body; ctx.fill();
    };

    const drawHead = () => {
      const [cx, cy] = sk.headC;
      ctx.beginPath(); ctx.arc(cx, cy, d.head + o, 0, Math.PI * 2); ctx.fillStyle = ink; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, d.head, 0, Math.PI * 2); ctx.fillStyle = body; ctx.fill();
      const ha = (180 - sk.p.lean - sk.p.neck) * DEG; // head "up" direction angle
      // local head frame: up = (sin ha, cos ha), fwd = (cos ha, -sin ha)... derive numerically
      const up = [Math.sin(ha), Math.cos(ha)];
      const fwd = [-up[1], up[0]];
      const at = (f, u) => [cx + fwd[0] * f + up[0] * u, cy + fwd[1] * f + up[1] * u];
      if (this.headband) {
        // two tails flowing behind the knot; wind 0 = hanging with gravity, 1 = streaming straight back
        const knot = at(-d.head * 0.92, d.head * 0.28);
        const wind = opt.wind == null ? 0.25 : opt.wind;
        const dn = worldDown(place);
        for (let i = 0; i < 2; i++) {
          const len = 62 + i * 16;
          let vx = -fwd[0] * (0.35 + wind) + dn[0] * (1 - wind) * 0.9;
          let vy = -fwd[1] * (0.35 + wind) + dn[1] * (1 - wind) * 0.9;
          const n = Math.hypot(vx, vy) || 1; vx /= n; vy /= n;
          const spread = (i ? 0.22 : -0.12);
          const ex = knot[0] + (vx - vy * spread) * len, ey = knot[1] + (vy + vx * spread) * len;
          const wav = Math.sin(t * (5 + wind * 14) + i * 1.9) * (6 + wind * 12);
          const qx = (knot[0] + ex) / 2 - vy * wav, qy = (knot[1] + ey) / 2 + vx * wav;
          ctx.beginPath(); ctx.moveTo(knot[0], knot[1]); ctx.quadraticCurveTo(qx, qy, ex, ey);
          ctx.lineCap = 'round';
          ctx.lineWidth = 11 + o * 2; ctx.strokeStyle = ink; ctx.stroke();
          ctx.lineWidth = 11; ctx.strokeStyle = opt.bandColor || P.red; ctx.stroke();
        }
        // redraw the head over the tail roots so the knot sits behind
        ctx.beginPath(); ctx.arc(cx, cy, d.head, 0, Math.PI * 2); ctx.fillStyle = body; ctx.fill();
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, d.head, 0, Math.PI * 2); ctx.clip();
        const a2 = at(-d.head * 1.2, d.head * 0.28), b2 = at(d.head * 1.2, d.head * 0.28);
        ctx.beginPath(); ctx.moveTo(a2[0], a2[1]); ctx.lineTo(b2[0], b2[1]);
        ctx.lineWidth = 15; ctx.strokeStyle = opt.bandColor || P.red; ctx.lineCap = 'butt'; ctx.stroke();
        ctx.restore();
        ctx.beginPath(); ctx.arc(cx, cy, d.head + o / 2, 0, Math.PI * 2);
        ctx.lineWidth = o; ctx.strokeStyle = ink; ctx.stroke();
      }
      const face = opt.face || this.face;
      if (face !== 'none') {
        ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineCap = 'round';
        ctx.lineWidth = 6;
        const eye = (f, u) => { const q = at(f, u); ctx.beginPath(); ctx.arc(q[0], q[1], 4.6, 0, Math.PI * 2); ctx.fill(); };
        if (face === 'frown') {
          eye(d.head * 0.18, -d.head * 0.02); eye(d.head * 0.62, -d.head * 0.02);
          const m0 = at(d.head * 0.15, -d.head * 0.5), m1 = at(d.head * 0.4, -d.head * 0.36), m2 = at(d.head * 0.66, -d.head * 0.5);
          ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.quadraticCurveTo(m1[0], m1[1], m2[0], m2[1]); ctx.stroke();
        } else if (face === 'grit') {
          // angry brows + flat mouth
          const b0 = at(d.head * 0.1, d.head * 0.02), b1 = at(d.head * 0.4, -d.head * 0.12);
          const b2 = at(d.head * 0.52, -d.head * 0.12), b3 = at(d.head * 0.82, d.head * 0.02);
          ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.lineTo(b1[0], b1[1]); ctx.moveTo(b2[0], b2[1]); ctx.lineTo(b3[0], b3[1]); ctx.stroke();
          eye(d.head * 0.3, -d.head * 0.24); eye(d.head * 0.66, -d.head * 0.24);
          const m0 = at(d.head * 0.25, -d.head * 0.56), m2 = at(d.head * 0.7, -d.head * 0.56);
          ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.lineTo(m2[0], m2[1]); ctx.stroke();
        } else if (face === 'flat') {
          eye(d.head * 0.2, -d.head * 0.05); eye(d.head * 0.62, -d.head * 0.05);
          const m0 = at(d.head * 0.22, -d.head * 0.45), m2 = at(d.head * 0.6, -d.head * 0.45);
          ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.lineTo(m2[0], m2[1]); ctx.stroke();
        } else if (face === 'smile') {
          eye(d.head * 0.2, -d.head * 0.02); eye(d.head * 0.62, -d.head * 0.02);
          const m0 = at(d.head * 0.15, -d.head * 0.38), m1 = at(d.head * 0.4, -d.head * 0.62), m2 = at(d.head * 0.66, -d.head * 0.38);
          ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.quadraticCurveTo(m1[0], m1[1], m2[0], m2[1]); ctx.stroke();
        }
      }
    };

    stroke(sk.legA, d.legW, far);
    stroke(sk.armA, d.armW, far);
    stroke(sk.legB, d.legW, body);
    drawTorso();
    drawHead();
    stroke(sk.armB, d.armW, body);
    ctx.restore();

    if (this.label && opt.label !== false) this.drawLabel(ctx, pose, place, opt);
    return sk;
  }

  // Monospace spaced caps label floating above the head (always upright in world space).
  drawLabel(ctx, pose, place, opt = {}) {
    const pts = this.points(pose, place);
    const text = (opt.labelText || this.label).toUpperCase();
    const size = (opt.labelSize || 30) * Math.min(1.4, Math.max(0.75, (place.scale || 1) * this.scale));
    ctx.save();
    ctx.globalAlpha *= (place.alpha == null ? 1 : place.alpha) * (opt.labelAlpha == null ? 1 : opt.labelAlpha);
    ctx.font = `${size}px ${P.fontLabel}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const x = pts.head[0], y = pts.head[1] - pts.headR - 22 - (opt.labelLift || 0);
    ctx.letterSpacing = `${size * 0.22}px`;
    ctx.lineWidth = 8; ctx.strokeStyle = P.ink; ctx.lineJoin = 'round';
    ctx.strokeText(text, x + size * 0.11, y);
    ctx.fillStyle = opt.labelColor || this.labelColor;
    ctx.fillText(text, x + size * 0.11, y);
    ctx.restore();
  }
}

// world "down" expressed in the figure's local frame (for gravity-affected bits like headband tails)
function worldDown(place) {
  const r = (place.rot || 0) * DEG, f = place.facing || 1;
  return [Math.sin(r) * f, Math.cos(r)];
}

function shade(col, amt) {
  let r, g, b;
  if (col.startsWith('rgb')) [r, g, b] = col.match(/[\d.]+/g).map(Number);
  else { const n = parseInt(col.slice(1), 16); r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
  const f = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

module.exports = { Figure, BASE, shade, ik2 };
