#!/usr/bin/env node
// Render an episode to MP4 (1080x1920, 30 fps, H.264 + synthesized SFX).
//
//   node render.js episodes/001-the-weight.js                 -> out/001-the-weight.mp4
//   node render.js episodes/001-the-weight.js --still 12.5    -> out/001-the-weight@12.5.png
//   node render.js episodes/001-the-weight.js --stills 0,4,8  -> several pngs
//   node render.js episodes/001-the-weight.js --from 15 --to 20   (render a slice)
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const P = require('./engine/palette');
const { makeCanvas } = require('./engine/stage');
const { mixCues } = require('./engine/audio');

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && /\.js$/.test(a));
if (!file) { console.error('usage: node render.js <episode.js> [--still t] [--stills a,b] [--from t --to t]'); process.exit(1); }
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };

const ep = require(path.resolve(file));
const name = path.basename(file, '.js');
const outDir = path.resolve(__dirname, opt('--out') || 'out');
fs.mkdirSync(outDir, { recursive: true });

const canvas = makeCanvas();
const ctx = canvas.getContext('2d');
const fps = P.FPS;

function frameAt(t) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ep.draw(ctx, t, Math.round(t * fps));
  ctx.restore();
}

async function main() {
  const stills = opt('--stills') ? opt('--stills').split(',') : opt('--still') ? [opt('--still')] : null;
  if (stills) {
    for (const s of stills) {
      frameAt(parseFloat(s));
      const p = path.join(outDir, `${name}@${s}.png`);
      fs.writeFileSync(p, canvas.toBuffer('image/png'));
      console.log(p);
    }
    return;
  }

  const from = parseFloat(opt('--from') || 0), to = parseFloat(opt('--to') || ep.duration);
  const sliced = from > 0 || to < ep.duration;
  const out = path.join(outDir, `${name}${sliced ? `_${from}-${to}` : ''}.mp4`);
  const wav = path.join(outDir, `${name}.sfx.wav`);
  mixCues(ep.sfx || [], ep.duration, wav);

  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${P.W}x${P.H}`, '-r', String(fps), '-i', '-',
    '-ss', String(from), '-t', String(to - from), '-i', wav,
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  const total = Math.round((to - from) * fps);
  const t0 = Date.now();
  for (let f = 0; f < total; f++) {
    const t = from + f / fps;
    frameAt(t);
    const raw = canvas.data(); // RGBA
    if (!ff.stdin.write(raw)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 30 === 0) process.stdout.write(`\r  frame ${f}/${total}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log(`\n${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
