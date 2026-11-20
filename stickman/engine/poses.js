// Pose library (facing right). Mix them with util.mix / util.track.
const POSES = {
  stand:     { lean: 0, neck: 0, sa: -10, ea: 12, sb: 10, eb: 12, ha: -5, ka: 0, hb: 5, kb: 0 },
  slouch:    { lean: 10, neck: 22, sa: -2, ea: 6, sb: 4, eb: 6, ha: -3, ka: 2, hb: 4, kb: -2 },
  crossed:   { lean: -3, neck: -4, sa: 52, ea: 118, sb: 40, eb: 122, ha: -9, ka: 0, hb: 8, kb: 0 },
  point:     { lean: -2, neck: -6, sa: 48, ea: 115, sb: 92, eb: 2, ha: -9, ka: 0, hb: 8, kb: 0 },
  laugh:     { lean: -14, neck: -24, sa: 30, ea: 105, sb: 40, eb: 110, ha: -8, ka: 0, hb: 10, kb: -4 },
  sit:       { lean: -4, neck: 0, sa: 10, ea: 40, sb: 30, eb: 50, ha: 84, ka: -84, hb: 90, kb: -92 },
  sitCrossed:{ lean: -6, neck: -6, sa: 52, ea: 118, sb: 40, eb: 122, ha: 84, ka: -84, hb: 90, kb: -92 },
  lounge:    { lean: -24, neck: -8, sa: 150, ea: 140, sb: 160, eb: 130, ha: 80, ka: -40, hb: 96, kb: -70 },
  power:     { lean: 0, neck: -6, sa: -22, ea: 30, sb: 18, eb: 34, ha: -16, ka: 0, hb: 16, kb: 0 },
  fistUp:    { lean: -4, neck: -10, sa: -20, ea: 30, sb: 170, eb: 8, ha: -16, ka: 0, hb: 16, kb: 0 },
  flail:     { lean: 10, neck: -20, sa: 140, ea: 30, sb: 100, eb: 40, ha: -40, ka: -30, hb: 40, kb: -60 },
  slumped:   { lean: 30, neck: 40, sa: 6, ea: 4, sb: 12, eb: 4, ha: -2, ka: 4, hb: 4, kb: 0 },
};

// Run cycle at phase ph (radians-ish 0..2PI repeating). k = intensity 0..1
function run(ph, k = 1) {
  const s = Math.sin(ph), c = Math.cos(ph);
  return {
    lean: 14 * k, neck: -6,
    sa: -55 * s * k - 5, ea: 75 + 10 * c,
    sb: 55 * s * k + 5, eb: 75 - 10 * c,
    ha: 48 * s * k + 8, ka: -(30 + 60 * Math.max(0, -c)) * k,
    hb: -48 * s * k + 8, kb: -(30 + 60 * Math.max(0, c)) * k,
  };
}

module.exports = { POSES, run };
