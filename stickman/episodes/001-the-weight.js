// EPISODE 001 — "THE WEIGHT"
// Idea: COMFORT, EXCUSES and DOUBT sit on your back while you try to push up. You fail, day after day.
// At the lowest point you refuse to stay down, throw them all off, and the weight turns out to be the training.
//
// Beats (30s):
//  0.0  HOOK        "WHAT'S HOLDING YOU DOWN?" — YOU pinned under three grey figures, fails a rep, they laugh.
//  5.2  THE GRIND   Day counter runs 001 -> 047. Each attempt gets a little higher. "EVERY. SINGLE. DAY."
// 11.0  LOW POINT   DOUBT leans in: "YOU'LL NEVER CHANGE." Heartbeat. YOU goes flat.
// 15.5  BREAKING    Close-up, red pressure rings. "NOT TODAY." YOU turns red.
// 19.5  PAYOFF      Explosive push-up, all three thrown off. Lands standing. DAY 100 (green).
//                   "THE WEIGHT WAS THE TRAINING."
// 26.6  SIGN-OFF    "+1%  BETTER THAN YESTERDAY" — channel end card.

const P = require('../engine/palette');
const S = require('../engine/stage');
const { Figure } = require('../engine/figure');
const { POSES } = require('../engine/poses');
const A = require('../engine/actions');
const { seg, ease, lerp, clamp, mix, noise1, track, rng } = require('../engine/util');
const { run } = require('../engine/poses');

const W = P.W, H = P.H;
const G = 1330; // floor
const FX = 150; // hero's feet x while doing push-ups
const STAND_X = 560;

const hero = new Figure({ label: 'YOU', color: P.hero, labelColor: P.red, headband: true, face: 'frown', scale: 1.38 });
const comfort = new Figure({ label: 'COMFORT', scale: 0.74 });
const excuses = new Figure({ label: 'EXCUSES', scale: 0.74 });
const doubt = new Figure({ label: 'DOUBT', scale: 0.95 });

// ---------------------------------------------------------------- hero push-up height over time
const strainWindows = [[1.5, 3.1], [5.4, 6.7], [7.0, 8.2], [8.5, 10.2], [18.0, 19.5]];
const hTrack = track([
  [0, 0], [1.5, 0], [2.9, 0.3, 'out'], [3.1, 0.3], [3.3, 0, 'in'],
  [5.4, 0], [6.4, 0.48, 'out'], [6.7, 0.48], [6.85, 0, 'in'],
  [7.0, 0], [7.9, 0.66, 'out'], [8.2, 0.66], [8.35, 0, 'in'],
  [8.5, 0], [9.3, 0.8, 'out'], [10.2, 0.8], [10.35, 0, 'in'],
  [18.0, 0], [19.4, 0.16, 'out'], [19.5, 0.16],
  [19.68, 1, 'out3'],
]);
const strain = (t) => strainWindows.reduce((m, [a, b]) => Math.max(m, seg(t, a, a + 0.4) * (1 - seg(t, b, b + 0.05))), 0);

const T_BLAST = 19.5, T_UP = 19.68, T_LAND = 20.12;

function heroColor(t) {
  return mixHex(P.hero, P.red, ease.inOut(seg(t, 17.0, 18.6)));
}

function heroState(t) {
  const col = heroColor(t);
  const face = t > 15.8 ? 'grit' : 'frown';
  if (t < T_UP) {
    const k = strain(t);
    const h = clamp(hTrack(t) + noise1(t * 28, 1) * 0.025 * k, 0, 1);
    const neck = t > 15.6 && t < T_BLAST ? lerp(-38, -62, ease.out(seg(t, 15.7, 16.4))) : undefined;
    const r = A.pushup(hero, G, FX, h, { neck });
    r.place.x += noise1(t * 40, 2) * 2.5 * k;
    return { ...r, col, face, wind: 0.15 };
  }
  // explosive transition: plank -> airborne -> land standing
  const plank = A.pushup(hero, G, FX, 1);
  const stand = A.standAt(hero, G, STAND_X);
  if (t < T_LAND) {
    const p = ease.inOut(seg(t, T_UP, T_LAND));
    const pose = mix(A.plankFK(plank.place.rot), { ...POSES.flail, lean: 8, ha: 30, ka: -70, hb: 60, kb: -90 }, p);
    const place = { x: lerp(plank.place.x, stand.x, p), y: lerp(plank.place.y, stand.y, p) - Math.sin(Math.PI * p) * 260, rot: lerp(plank.place.rot, 0, p), scale: 1 };
    return { pose, place, col, face, wind: 1 };
  }
  const land = seg(t, T_LAND, T_LAND + 0.28);
  const crouch = Math.sin(Math.PI * land) * (1 - land * 0.3);
  let pose = mix(POSES.power, { lean: 18, neck: -16, sa: -40, ea: 60, sb: 40, eb: 70, ha: 60, ka: -95, hb: 55, kb: -100 }, crouch);
  const breathe = Math.sin(t * 3.2) * 4;
  pose = { ...pose, lean: pose.lean + breathe * 0.3 };
  if (t > 24.3) pose = mix(pose, POSES.fistUp, ease.outBack(seg(t, 24.3, 24.6)));
  const place = { ...stand, y: stand.y + crouch * 70 };
  return { pose, place, col, face: 'grit', wind: 0.9 };
}

// ---------------------------------------------------------------- the three weights
const laughWins = [[3.4, 4.7], [6.9, 7.5], [8.4, 9.0]];
const laughing = (t) => laughWins.reduce((m, [a, b]) => Math.max(m, seg(t, a, a + 0.15) * (1 - seg(t, b - 0.15, b))), 0);

function sitterStates(t, hs) {
  const pts = hero.points(hs.pose, hs.place);
  const L = laughing(t);
  const bob = Math.abs(Math.sin(t * 20)) * 8 * L;
  // EXCUSES: on the upper back, arms crossed, legs dangling toward the head
  let exPose = mix(POSES.sitCrossed, { ...POSES.sitCrossed, lean: -18, neck: -28 }, L);
  const ex = { pose: exPose, place: A.sitOn(excuses, pts.backMid, { dx: 0, dy: -bob }) };
  // COMFORT: on the lower back, leaning back, hands behind head, facing the feet
  const lounge = { lean: -16, neck: -6, sa: 168, ea: 150, sb: 158, eb: 150, ha: 78, ka: -70, hb: 92, kb: -86 };
  const cfPose = mix(lounge, { ...lounge, lean: -26, neck: -24 }, L);
  const cf = { pose: cfPose, place: A.sitOn(comfort, pts.thighTop, { facing: -1, dx: 0, dy: -bob * 0.8 }) };
  // DOUBT: standing near the head, facing YOU
  const dStand = A.standAt(doubt, G, 900, { facing: -1 });
  const lean = ease.inOut(seg(t, 11.1, 11.8));
  let dPose = mix(POSES.crossed, { ...POSES.laugh, sa: 40, ea: 110 }, L);
  dPose = mix(dPose, { lean: 34, neck: 16, sa: 40, ea: 112, sb: 62, eb: 6, ha: -16, ka: 0, hb: 10, kb: 0 }, lean);
  dPose = { ...dPose, neck: dPose.neck + Math.sin(t * 22) * 6 * L };
  const dt = { pose: dPose, place: { ...dStand, y: dStand.y - bob * 0.5 } };
  return { ex, cf, dt };
}

// snapshot of where they are the moment YOU explodes up, then ballistic + landing on the floor
let blastStart = null;
function blasted(t) {
  if (!blastStart) {
    const hs = heroState(T_BLAST - 0.001);
    blastStart = sitterStates(T_BLAST - 0.001, hs);
  }
  const dt = t - T_BLAST;
  const out = {};
  const plan = {
    ex: { v: [380, -2600], spin: 620, land: 21.0, lie: A.lieAt(excuses, G, 830, 1) },
    cf: { v: [-520, -2500], spin: -560, land: 21.25, lie: A.lieAt(comfort, G, 290, -1) },
    dt: { v: [900, -1500], spin: 480, land: 21.5, lie: A.lieAt(doubt, G - 44, 330, 1) },
  };
  for (const k of Object.keys(plan)) {
    const p = plan[k], s0 = blastStart[k];
    if (t < p.land - 0.35) {
      out[k] = { pose: mix(s0.pose, POSES.flail, clamp(dt * 6)), place: A.thrown(s0.place, p.v, p.spin, dt) };
    } else {
      // fall back in from above and land flat
      const q = ease.in(seg(t, p.land - 0.35, p.land));
      const bounce = Math.sin(Math.PI * seg(t, p.land, p.land + 0.25)) * 26 * (t > p.land ? 1 : 0);
      const place = { ...p.lie.place, y: lerp(-300, p.lie.place.y, q) - bounce, rot: lerp(p.lie.place.rot + 160, p.lie.place.rot, q) };
      out[k] = { pose: mix(POSES.flail, p.lie.pose, q), place };
    }
  }
  return out;
}

// ---------------------------------------------------------------- HUD: day counter
const dayTrack = track([[5.4, 1], [6.85, 9, 'out'], [8.35, 23, 'out'], [10.35, 47, 'out'], [21.05, 47], [21.2, 100, 'out3']]);
const dayAt = (t) => Math.round(dayTrack(t));

function drawCounter(ctx, t) {
  const appear = ease.outBack(seg(t, 5.2, 5.55));
  const hide = seg(t, 26.2, 26.5);
  if (appear <= 0 || hide >= 1) return;
  const win = seg(t, 21.15, 21.3);
  const col = win > 0 ? P.green : P.white;
  const day = dayAt(t);
  const changed = day !== dayAt(t - 1 / 30);
  ctx.save();
  ctx.globalAlpha = 1 - hide;
  ctx.translate(W / 2, 250);
  const sc = appear * (1 + (changed ? 0.05 : 0) + Math.sin(Math.PI * seg(t, 21.15, 21.45)) * 0.18);
  ctx.scale(sc, sc);
  const w = 360, h = 132;
  ctx.fillStyle = '#121214';
  ctx.strokeStyle = win > 0 ? P.green : '#36363c';
  ctx.lineWidth = 5;
  roundRect(ctx, -w / 2, -h / 2, w, h, 22); ctx.fill(); ctx.stroke();
  // little red "live" bar on the left that turns green on the win
  ctx.fillStyle = win > 0 ? P.green : P.red;
  roundRect(ctx, -w / 2 + 22, -h / 2 + 30, 10, h - 60, 5); ctx.fill();
  S.mono(ctx, 'DAY', -w / 2 + 60, -2, { size: 30, color: P.grayText, align: 'left', spacing: 0.2 });
  S.mono(ctx, String(day).padStart(3, '0'), 70, 2, { size: 78, color: col, spacing: 0.08 });
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ---------------------------------------------------------------- "HA" pops
const HAS = [
  [3.45, 760, 1010, -12], [3.7, 330, 960, 10], [3.95, 930, 1080, 8], [4.2, 470, 900, -6],
  [6.95, 820, 1000, 9], [7.15, 360, 950, -10], [8.45, 900, 1030, -8], [8.65, 420, 930, 12],
];
function drawHas(ctx, t) {
  for (const [t0, x, y, r] of HAS) {
    const p = seg(t, t0, t0 + 0.12), f = 1 - seg(t, t0 + 0.45, t0 + 0.7);
    if (p <= 0 || f <= 0) continue;
    S.statement(ctx, 'HA', x, y - p * 20, { size: 70, p, rot: r, alpha: f, strokeW: 10, tracking: 2 });
    ctx.save(); ctx.fillStyle = P.grayText; ctx.restore();
  }
}

// ---------------------------------------------------------------- camera
const HEAD0 = hero.points(A.pushup(hero, G, FX, 0).pose, A.pushup(hero, G, FX, 0).place).head;
const WIDE = { x: 540, y: 1090, zoom: 1.15 };
const camTrack = track([
  [0, { x: 560, y: 1150, zoom: 1.38 }],
  [5.0, WIDE, 'inOut'],
  [11.0, WIDE],
  [12.2, { x: 700, y: 1150, zoom: 1.55 }, 'inOut3'],
  [15.4, { x: 690, y: 1160, zoom: 1.68 }, 'linear'],
  [15.5, { x: HEAD0[0] - 10, y: HEAD0[1] - 150, zoom: 2.0 }, 'out3'],
  [19.4, { x: HEAD0[0] - 10, y: HEAD0[1] - 135, zoom: 2.25 }, 'linear'],
  [19.5, { x: 540, y: 1060, zoom: 1.12 }, 'out3'],
  [24.0, { x: 540, y: 1060, zoom: 1.18 }, 'linear'],
]);

// ---------------------------------------------------------------- draw
function draw(ctx, t, frame) {
  if (t >= 26.6) return drawEndCard(ctx, t - 26.6, frame);

  const breaking = seg(t, 15.5, 15.7) * (1 - seg(t, 19.5, 19.6));
  const payoff = seg(t, 19.5, 19.6);
  const low = seg(t, 11.2, 12.4) * (1 - breaking);

  // --- background (screen space)
  S.drawBase(ctx, {
    center: breaking > 0 ? '#241112' : P.bgCenter,
    glow: P.red, glowAmt: breaking * (0.75 + 0.25 * Math.sin(t * 6)) + payoff * (0.55 + 0.1 * Math.sin(t * 4)) * (1 - seg(t, 24.8, 26.2) * 0.5),
    glowY: breaking ? H * 0.62 : 820, glowR: breaking ? 900 : 620,
  });
  if (breaking <= 0) S.drawGrid(ctx, t, { alpha: 0.06 * (1 - low * 0.7) });
  if (breaking > 0) {
    S.drawHalftone(ctx, t, { amt: breaking * (0.7 + seg(t, 16, 19.4) * 0.5), alpha: 0.2 });
    S.drawRings(ctx, t, { cy: H * 0.62, alpha: 0.2 * breaking, speed: 120 + seg(t, 15.5, 19.5) * 260 });
    S.drawBurst(ctx, t, { cy: H * 0.62, alpha: 0.06 + 0.1 * seg(t, 17, 19.4), inner: 360 - seg(t, 16, 19.4) * 120 });
  }
  if (payoff > 0 && t < 22) S.drawBurst(ctx, t, { cy: 800, alpha: 0.14 * (1 - seg(t, 19.6, 21.5)), inner: 200 });

  // --- world (camera space)
  const cam = { ...camTrack(t) };
  const shakeT = Math.max(0, 1 - (t - T_BLAST) / 0.9);
  cam.shake = (t >= T_BLAST ? 40 * shakeT * shakeT : 0) + (t > 17 && t < T_BLAST ? seg(t, 17, 19.5) * 7 : 0) +
    [3.3, 6.85, 8.35, 10.35, 21.0, 21.25, 21.5].reduce((m, th) => Math.max(m, t >= th ? 14 * Math.max(0, 1 - (t - th) / 0.2) : 0), 0);
  ctx.save();
  S.applyCamera(ctx, cam, t);

  S.drawFloor(ctx, G, { alpha: 1 - breaking * 0.6 });

  const hs = heroState(t);
  const ss = t < T_BLAST ? sitterStates(t, hs) : blasted(t);
  const lab = { time: t, label: breaking > 0.5 ? false : undefined };
  const grayAlpha = 1 - breaking * 0.35;
  // draw order: DOUBT (behind), hero, then the sitters on top of him
  if (ss.dt) doubt.draw(ctx, ss.dt.pose, { ...ss.dt.place, alpha: grayAlpha }, { ...lab, labelLift: t >= T_BLAST ? 60 : 0 });
  // red aura behind YOU after the transformation
  if (t > 17.2) {
    const pts = hero.points(hs.pose, hs.place);
    const a = seg(t, 17.2, 18.6) * (t > T_BLAST ? 0.9 - seg(t, 24.8, 26.2) * 0.4 : 0.6);
    const g = ctx.createRadialGradient(pts.neck[0], pts.neck[1], 0, pts.neck[0], pts.neck[1], 330);
    g.addColorStop(0, S.rgba(P.red, 0.45 * a)); g.addColorStop(1, S.rgba(P.red, 0));
    ctx.fillStyle = g; ctx.fillRect(pts.neck[0] - 400, pts.neck[1] - 400, 800, 800);
  }
  hero.draw(ctx, hs.pose, hs.place, {
    time: t, color: hs.col, face: hs.face, wind: hs.wind,
    labelColor: t > 17.8 ? P.white : P.red,
    labelAlpha: low > 0 && t < 15.5 ? 0.55 + 0.45 * (Math.sin(t * 17) > 0 ? 1 : 0) : 1,
  });
  if (ss.cf) comfort.draw(ctx, ss.cf.pose, { ...ss.cf.place, alpha: grayAlpha }, { ...lab, labelLift: 0 });
  if (ss.ex) excuses.draw(ctx, ss.ex.pose, { ...ss.ex.place, alpha: grayAlpha }, lab);

  drawHas(ctx, t);
  ctx.restore();

  // low point: drain the scene
  if (low > 0) {
    ctx.fillStyle = `rgba(0,0,0,${0.32 * low})`; ctx.fillRect(0, 0, W, H);
    const beat = Math.max(pulse(t, 13.4), pulse(t, 14.4));
    if (beat > 0) { ctx.fillStyle = S.rgba(P.red, 0.1 * beat); ctx.fillRect(0, 0, W, H); }
  }

  // DOUBT's whisper, typed out (screen space so it never gets cropped by the zoom)
  if (t > 11.7 && t < 15.5) {
    const txt = '"YOU\'LL NEVER CHANGE."';
    const n = Math.floor(seg(t, 11.8, 13.0) * txt.length);
    ctx.save();
    ctx.font = `44px ${P.fontLabel}`; ctx.letterSpacing = `${44 * 0.12}px`;
    const fw = ctx.measureText(txt).width;
    ctx.restore();
    S.mono(ctx, 'DOUBT:', W / 2, 455, { size: 26, color: P.red, alpha: seg(t, 11.7, 11.9) * (1 - seg(t, 15.2, 15.5)) });
    S.mono(ctx, txt.slice(0, n), W / 2 - fw / 2, 520, { size: 44, color: P.grayText, spacing: 0.12, align: 'left', alpha: 1 - seg(t, 15.2, 15.5) });
  }

  // --- overlay text (screen space)
  // hook
  const hookOut = 1 - seg(t, 4.9, 5.2);
  if (hookOut > 0) {
    S.statement(ctx, "WHAT'S HOLDING", W / 2, 400, { size: 96, p: seg(t, 0.12, 0.42), alpha: hookOut });
    S.statement(ctx, [['YOU ', P.white], ['DOWN?', P.red]], W / 2, 515, { size: 112, p: seg(t, 0.55, 0.85), alpha: hookOut });
  }
  // the grind
  const grindOut = 1 - seg(t, 9.6, 10.0);
  ['EVERY.', 'SINGLE.', 'DAY.'].forEach((w, i) => {
    const p = seg(t, 5.6 + i * 0.4, 5.9 + i * 0.4);
    if (p > 0 && grindOut > 0) S.statement(ctx, w, W / 2 + (i - 1) * 300, 440, { size: 78, p, alpha: grindOut, color: P.white });
  });
  // breaking point
  if (breaking > 0) {
    const sh = (Math.sin(t * 70) * 6) * seg(t, 16.2, 16.3) * (1 - seg(t, 16.3, 16.6));
    S.statement(ctx, 'NOT', W / 2 + sh, 470, { size: 190, p: seg(t, 16.2, 16.35), stroke: true, strokeW: 26 });
    S.statement(ctx, [['TODAY.', P.red]], W / 2 - sh, 650, { size: 210, p: seg(t, 16.7, 16.85), strokeW: 26 });
  }
  // payoff line
  const payOut = 1 - seg(t, 26.1, 26.5);
  if (t > 21.9 && payOut > 0) {
    S.statement(ctx, 'THE WEIGHT', W / 2, 430, { size: 104, p: seg(t, 21.95, 22.25), alpha: payOut });
    S.statement(ctx, [['WAS THE ', P.white], ['TRAINING.', P.green]], W / 2, 545, { size: 92, p: seg(t, 22.5, 22.8), alpha: payOut });
  }

  drawCounter(ctx, t);

  // flashes + finishing
  const flashW = 1 - seg(t, T_BLAST, T_BLAST + 0.3);
  if (t >= T_BLAST && flashW > 0) { ctx.fillStyle = `rgba(255,255,255,${0.9 * flashW})`; ctx.fillRect(0, 0, W, H); }
  const flashR = 1 - seg(t, 15.5, 15.85);
  if (t >= 15.5 && flashR > 0) { ctx.fillStyle = S.rgba(P.red, 0.55 * flashR); ctx.fillRect(0, 0, W, H); }
  S.drawVignette(ctx, 0.8);
  S.drawGrain(ctx, frame, 0.07);
  const fadeOut = seg(t, 26.3, 26.6);
  if (fadeOut > 0) { ctx.fillStyle = `rgba(0,0,0,${fadeOut})`; ctx.fillRect(0, 0, W, H); }
}

const pulse = (t, t0) => (t >= t0 ? Math.max(0, 1 - (t - t0) / 0.5) : 0);

// ---------------------------------------------------------------- end card (channel signature)
const runner = new Figure({ label: '', color: P.hero, headband: true, face: 'grit', scale: 0.62 });
function drawEndCard(ctx, u, frame) {
  S.drawBase(ctx, { glow: P.green, glowAmt: 0.35 * seg(u, 0.2, 0.6), glowY: 860, glowR: 560 });
  S.drawGrid(ctx, u + 26, { alpha: 0.05 });
  const p = seg(u, 0.25, 0.42);
  S.statement(ctx, [['+1%', P.green]], W / 2, 820, { size: 260, p, strokeW: 30 });
  const q = seg(u, 0.75, 0.95);
  if (q > 0) S.mono(ctx, 'BETTER THAN YESTERDAY', W / 2, 1010, { size: 40, color: P.white, alpha: q, spacing: 0.22 });
  // the hero keeps running — every video ends with the same loop
  const fy = 1420;
  const scroll = u * 520;
  S.drawFloor(ctx, fy, { x0: 0, x1: W, scroll, alpha: 0.9 });
  const ph = u * 11;
  const pl = A.standAt(runner, fy, W / 2 - 10);
  runner.draw(ctx, run(ph), { ...pl, y: pl.y + 8 - Math.abs(Math.sin(ph)) * 16 }, { time: u, wind: 1 });
  S.drawStreaks(ctx, u, { alpha: 0.07, n: 14 });
  const r = seg(u, 1.4, 1.7);
  if (r > 0) S.mono(ctx, 'SEE YOU ON DAY 002', W / 2, 1600, { size: 28, color: P.grayText, alpha: r, spacing: 0.25 });
  S.drawVignette(ctx, 0.8);
  S.drawGrain(ctx, frame, 0.07);
  const fin = 1 - seg(u, 0, 0.18);
  if (fin > 0) { ctx.fillStyle = `rgba(0,0,0,${fin})`; ctx.fillRect(0, 0, W, H); }
}

// ---------------------------------------------------------------- sound design
const sfx = [
  [0.12, 'pop', { gain: 0.5 }], [0.55, 'stamp', { gain: 0.8 }],
  [1.55, 'rumble', { dur: 1.6, gain: 0.45 }], [3.3, 'thud', { gain: 1 }],
  ...HAS.map(([t0], i) => [t0, 'ha', { seed: 40 + i, f: 150 + (i % 4) * 25, gain: 0.55, pan: i % 2 ? -0.4 : 0.4 }]),
  [5.15, 'whoosh', { gain: 0.6 }],
  [5.6, 'pop', { gain: 0.45, f: 340 }], [6.0, 'pop', { gain: 0.45, f: 380 }], [6.4, 'pop', { gain: 0.5, f: 430 }],
  [5.45, 'rumble', { dur: 1.2, gain: 0.35 }], [7.05, 'rumble', { dur: 1.1, gain: 0.35 }], [8.55, 'rumble', { dur: 1.6, gain: 0.4 }],
  [6.85, 'thud', { gain: 0.9 }], [8.35, 'thud', { gain: 0.9 }], [10.35, 'thud', { gain: 1 }],
  [12.1, 'whoosh', { gain: 0.35, f0: 200, f1: 900, dur: 0.8 }],
  ...Array.from({ length: 20 }, (_, i) => [11.8 + i * 0.06, 'tick', { gain: 0.25, f: 1800, seed: i + 1 }]),
  [13.4, 'heartbeat', { gain: 1 }], [14.4, 'heartbeat', { gain: 1 }],
  [15.5, 'whoosh', { gain: 0.6, f0: 2500, f1: 300, dur: 0.5 }],
  [16.2, 'stamp', { gain: 0.9 }], [16.7, 'stamp', { gain: 1 }],
  [16.0, 'riser', { dur: 3.5, gain: 0.55 }],
  [T_BLAST, 'impact', { gain: 1 }],
  [19.55, 'whoosh', { gain: 0.6, pan: -0.5, seed: 4 }], [19.6, 'whoosh', { gain: 0.6, pan: 0.5, seed: 6 }],
  [T_LAND + 0.02, 'thud', { gain: 0.9, f: 70 }],
  [21.0, 'thud', { gain: 0.8, f: 95 }], [21.25, 'thud', { gain: 0.8, f: 105 }], [21.5, 'thud', { gain: 0.85, f: 90 }],
  [21.15, 'ding', { gain: 0.55 }],
  [21.95, 'pop', { gain: 0.45 }], [22.5, 'stamp', { gain: 0.8 }],
  [24.3, 'whoosh', { gain: 0.5, dur: 0.35 }],
  [26.35, 'whoosh', { gain: 0.5, f0: 2000, f1: 200 }],
  [26.85, 'stamp', { gain: 0.9 }], [27.35, 'pop', { gain: 0.4, f: 500 }],
];
// counter ticks whenever the day number changes
for (let f = 5.4 * 30; f < 21.3 * 30; f++) {
  const t = f / 30;
  if (dayAt(t) !== dayAt(t - 1 / 30)) sfx.push([t, 'tick', { gain: 0.3, seed: f }]);
}

function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map((s) => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, t)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
void rng;

module.exports = {
  title: 'THE WEIGHT',
  duration: 30,
  draw,
  sfx,
  post: {
    caption: 'The weight was never the enemy. It was the training. Day 1 of becoming better. 🔴',
    hashtags: ['#discipline', '#motivation', '#selfimprovement', '#mindset', '#stickman', '#nevergiveup', '#gymmotivation', '#1percentbetter'],
  },
};
