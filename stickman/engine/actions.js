// Higher-level motions built on the rig: push-ups, sitting on another figure, being thrown, lying down.
const { DEG, lerp, mix } = require('./util');
const { BASE } = require('./figure');

// Push-up / plank on floor y=G. Feet stay at fx. h: 0 = chest on floor, 1 = arms locked out.
// Returns { pose, place } ready for figure.draw().
function pushup(fig, G, fx, h, extra = {}) {
  const s = fig.scale * (extra.scale || 1);
  const d = fig.dims;
  const footY = G - (d.legW / 2 + d.outline) * s;
  const L = (d.thigh + d.shin + d.torso - 14) * s; // feet -> shoulder
  const sh = lerp((d.torsoW * 0.5 + d.outline + 6) * s, (d.upper + d.fore) * 0.93 * s, h);
  const dy = (G - sh) - footY;
  const dx = Math.sqrt(Math.max(1, L * L - dy * dy));
  const sx = fx + dx, sy = footY + dy;
  const rot = Math.atan2(dx, -dy) / DEG; // local up -> body direction
  const ux = dx / L, uy = dy / L;
  const legL = (d.thigh + d.shin) * s;
  const place = { x: fx + ux * legL, y: footY + uy * legL, rot, scale: extra.scale || 1, facing: 1 };
  const handX = sx + 6 * s, handY = G - (d.armW / 2 + d.outline) * s;
  const pose = {
    lean: 0, neck: extra.neck == null ? -38 + h * 10 : extra.neck,
    ha: 1, ka: -2, hb: -1, kb: 0,
    ik: { ha: [handX - 4 * s, handY], hb: [handX + 4 * s, handY] },
  };
  return { pose, place, shoulder: [sx, sy] };
}

// FK version of the locked-out plank arms (for blending out of a push-up into another pose).
function plankFK(rot) {
  return { lean: 0, neck: -28, sa: rot, ea: 0, sb: rot, eb: 0, ha: 1, ka: -2, hb: -1, kb: 0 };
}

// Standing placement: feet on floor G at x.
function standAt(fig, G, x, extra = {}) {
  const d = fig.dims, s = fig.scale * (extra.scale || 1);
  return { x, y: G - (d.thigh + d.shin + d.legW / 2 + d.outline - 6) * s, rot: 0, facing: extra.facing || 1, scale: extra.scale || 1 };
}

// Place a sitting figure so its seat rests on a world point.
function sitOn(fig, pt, extra = {}) {
  const d = fig.dims, s = fig.scale * (extra.scale || 1);
  return { x: pt[0] + (extra.dx || 0), y: pt[1] - (d.torsoW * 0.62 + d.outline) * s + (extra.dy || 0), rot: extra.rot || 0, facing: extra.facing || 1, scale: extra.scale || 1 };
}

// Lying flat on the back (KO) on floor G, head toward `dir` (1 right, -1 left).
function lieAt(fig, G, x, dir = 1, extra = {}) {
  const d = fig.dims, s = fig.scale * (extra.scale || 1);
  return {
    place: { x, y: G - (d.torsoW * 0.5 + d.outline) * s, rot: 90 * dir, facing: -dir, scale: extra.scale || 1 },
    pose: { lean: 0, neck: 0, sa: 160, ea: 10, sb: -150, eb: -10, ha: 8, ka: 0, hb: -6, kb: 0 },
  };
}

// Ballistic throw: start place, velocity (px/s), spin (deg/s), gravity.
function thrown(start, v, spin, dt, g = 3200) {
  return { ...start, x: start.x + v[0] * dt, y: start.y + v[1] * dt + 0.5 * g * dt * dt, rot: (start.rot || 0) + spin * dt };
}

module.exports = { pushup, plankFK, standAt, sitOn, lieAt, thrown, mix, BASE };
