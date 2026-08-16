/* Animatic engine.
 *
 * Deterministic canvas renderer for the previz cut. Every frame is a pure
 * function of time, so the render can be piped frame-by-frame to ffmpeg and
 * reproduced exactly. No requestAnimationFrame, no wall-clock, no randomness
 * that isn't seeded.
 *
 * These are storyboard visuals, not the final 3D animation: abstract, graphic
 * stand-ins that carry the composition, timing, camera intent and typography
 * of each shot in production/timeline.json.
 */

const W = 1920, H = 1080;
const cv = document.getElementById('stage');
cv.width = W; cv.height = H;
const g = cv.getContext('2d', { alpha: false });

/* ---------- palette ---------- */
const C = {
  gold:   '#F5B95C',
  ochre:  '#C98A3C',
  terra:  '#A9502F',
  green:  '#2F5D3A',
  chalk:  '#F2EDE3',
  sky:    '#9FC7DE',
  cyan:   '#4FD8E8',
  amber:  '#F2A93B',
  teal:   '#0E3B45',
  indigo: '#131A3A',
  violet: '#7A5CF0',
  ink:    '#080B18',
};

const FONT = 'Liberation Sans, DejaVu Sans, sans-serif';

/* ---------- math ---------- */
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const lerp  = (a, b, t) => a + (b - a) * t;
const ease  = t => t * t * (3 - 2 * t);                    // smoothstep
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeIn  = t => t * t * t;
// Ramp up from 0, hold, ramp back down — used for text and element beats.
const pulse = (t, up, down) => Math.min(ease(clamp(t / up, 0, 1)),
                                        ease(clamp((1 - t) / down, 0, 1)));

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hex(c, alpha) {
  const n = parseInt(c.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${alpha})`;
}

/* ---------- primitives ---------- */
function fillRect(x, y, w, h, style) { g.fillStyle = style; g.fillRect(x, y, w, h); }

function vgrad(y0, y1, stops) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([p, c]) => gr.addColorStop(p, c));
  return gr;
}

/** Soft radial glow. Cheaper and better-controlled than shadowBlur. */
function glow(x, y, r, color, alpha = 1) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, hex(color, 0.85 * alpha));
  gr.addColorStop(0.4, hex(color, 0.28 * alpha));
  gr.addColorStop(1, hex(color, 0));
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

function dot(x, y, r, color, alpha = 1) {
  g.fillStyle = hex(color, alpha);
  g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
}

function line(x1, y1, x2, y2, color, width, alpha = 1) {
  g.strokeStyle = hex(color, alpha); g.lineWidth = width;
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
}

function poly(cx, cy, r, sides, rot, color, alpha, fill) {
  g.beginPath();
  for (let i = 0; i <= sides; i++) {
    const a = rot + i * Math.PI * 2 / sides;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  if (fill) { g.fillStyle = hex(color, alpha); g.fill(); }
  else { g.strokeStyle = hex(color, alpha); g.lineWidth = 3; g.stroke(); }
}

/** Human silhouette. h = height in px, anchored at the feet. */
function figure(x, y, h, color, alpha = 1) {
  const u = h / 100;
  g.fillStyle = hex(color, alpha);
  g.beginPath(); g.arc(x, y - 88 * u, 11 * u, 0, 7); g.fill();      // head
  g.beginPath();
  g.moveTo(x - 13 * u, y - 74 * u);
  g.quadraticCurveTo(x, y - 80 * u, x + 13 * u, y - 74 * u);
  g.lineTo(x + 11 * u, y - 38 * u);
  g.lineTo(x + 9 * u, y);
  g.lineTo(x + 2 * u, y);
  g.lineTo(x + 1 * u, y - 36 * u);
  g.lineTo(x - 1 * u, y - 36 * u);
  g.lineTo(x - 2 * u, y);
  g.lineTo(x - 9 * u, y);
  g.lineTo(x - 11 * u, y - 38 * u);
  g.closePath(); g.fill();
}

/** Backpack-wearing student, seen from behind. */
function student(x, y, h, color, alpha = 1) {
  figure(x, y, h, color, alpha);
  const u = h / 100;
  g.fillStyle = hex(color, alpha);
  g.beginPath();
  g.roundRect(x - 9 * u, y - 72 * u, 18 * u, 26 * u, 4 * u);
  g.fill();
}

function vignette(strength = 0.55) {
  const gr = g.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.95);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, `rgba(0,0,0,${strength})`);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
}

/* Pre-rendered grain tile, offset per frame so it shimmers like real grain. */
const grainTile = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const img = x.createImageData(256, 256);
  const rnd = mulberry32(99);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (rnd() - 0.5) * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
})();

function grain(frame, amount = 0.05) {
  g.save();
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = amount;
  const ox = (frame * 71) % 256, oy = (frame * 113) % 256;
  for (let y = -oy; y < H; y += 256) for (let x = -ox; x < W; x += 256) {
    g.drawImage(grainTile, x, y);
  }
  g.restore();
}

/* Letterbox bars — locks the cinematic 2.39:1 framing inside 16:9. */
function bars() {
  const b = 92;
  fillRect(0, 0, W, b, '#000');
  fillRect(0, H - b, W, b, '#000');
}

/* ---------- typography ---------- */
function drawText(text, x, y, size, color, alpha, opts = {}) {
  if (alpha <= 0.01) return;
  g.save();
  g.font = `${opts.weight || 700} ${size}px ${FONT}`;
  g.textAlign = opts.align || 'center';
  g.textBaseline = 'middle';
  if (opts.track) {
    // Manual letter-spacing: measure the tracked run, then place glyph by glyph.
    const chars = [...text];
    let total = 0;
    chars.forEach(ch => total += g.measureText(ch).width + opts.track);
    total -= opts.track;
    let cx = g.textAlign === 'center' ? x - total / 2 : x;
    g.textAlign = 'left';
    if (opts.shadow !== false) {
      g.fillStyle = `rgba(0,0,0,${0.6 * alpha})`;
      let sx = cx;
      chars.forEach(ch => { g.fillText(ch, sx + 3, y + 3); sx += g.measureText(ch).width + opts.track; });
    }
    g.fillStyle = hex(color, alpha);
    chars.forEach(ch => { g.fillText(ch, cx, y); cx += g.measureText(ch).width + opts.track; });
  } else {
    if (opts.shadow !== false) {
      g.fillStyle = `rgba(0,0,0,${0.6 * alpha})`;
      g.fillText(text, x + 3, y + 3);
    }
    g.fillStyle = hex(color, alpha);
    g.fillText(text, x, y);
  }
  g.restore();
}

function wrap(text, size, maxW, weight = 400) {
  g.save();
  g.font = `${weight} ${size}px ${FONT}`;
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (g.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  g.restore();
  return lines;
}

/** Narration caption, bottom third, above the lower letterbox bar. */
function subtitle(text, alpha) {
  if (!text || alpha <= 0.01) return;
  const size = 40;
  const lines = wrap(text, size, W * 0.72, 400);
  const lh = size * 1.42;
  const baseY = H - 92 - 46 - (lines.length - 1) * lh;

  g.save();
  const scrimTop = baseY - lh * 0.9;
  const gr = g.createLinearGradient(0, scrimTop, 0, H - 92);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, `rgba(0,0,0,${0.62 * alpha})`);
  g.fillStyle = gr;
  g.fillRect(0, scrimTop, W, H - 92 - scrimTop);
  g.restore();

  lines.forEach((ln, i) => {
    drawText(ln, W / 2, baseY + i * lh, size, C.chalk, alpha * 0.96, { weight: 400 });
  });
}

/** Shrink `size` until the tracked string fits inside maxW. */
function fitSize(text, size, maxW, track = 0, weight = 700) {
  g.save();
  let s = size;
  for (let i = 0; i < 12; i++) {
    g.font = `${weight} ${s}px ${FONT}`;
    const w = track
      ? [...text].reduce((a, ch) => a + g.measureText(ch).width + track, 0) - track
      : g.measureText(text).width;
    if (w <= maxW) break;
    s *= (maxW / w) * 0.99;
  }
  g.restore();
  return s;
}

/** Soft dark plate so labels stay readable over busy visuals. */
function scrim(cx, cy, w, h, alpha) {
  if (alpha <= 0.01) return;
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.72);
  gr.addColorStop(0, `rgba(4,6,14,${0.72 * alpha})`);
  gr.addColorStop(0.6, `rgba(4,6,14,${0.46 * alpha})`);
  gr.addColorStop(1, 'rgba(4,6,14,0)');
  g.fillStyle = gr;
  g.fillRect(cx - w, cy - h, w * 2, h * 2);
}

/**
 * On-screen title treatment. The layout adapts to how many strings the shot
 * carries so labels always stay inside frame and never collide:
 *   1-2  hero card (with title/subtitle sizing when the first line is short)
 *   3-6  staggered stack
 *   7+   staggered grid
 * mode 'sequence' overrides this and strikes one hero word at a time.
 */
function onscreen(items, u, dur, mode) {
  if (!items || !items.length) return;
  const n = items.length;
  const MAXW = W * 0.84;
  const CY = H * 0.46;

  if (mode === 'sequence') {
    // Each word owns an equal slice; the last is held to the end of the shot.
    const slice = 1 / n;
    items.forEach((t, i) => {
      const local = (u - i * slice) / slice;
      if (local < 0 || (local > 1 && i < n - 1)) return;
      const a = i === n - 1
        ? pulse(clamp((u - i * slice) / slice, 0, 1), 0.25, 0.10)
        : pulse(clamp(local, 0, 1), 0.22, 0.30);
      const size = fitSize(t, 104, MAXW, 8);
      const rise = (1 - ease(clamp(local * 4, 0, 1))) * 22;
      drawText(t, W / 2, CY + rise, size, C.chalk, a, { track: 8 });
    });
    return;
  }

  if (n <= 2) {
    const a = pulse(u, 0.22, 0.22);
    // "YEAR 1" + descriptor reads as title/subtitle; two full lines read equal.
    const titled = n === 2 && items[0].length <= 14;
    const sizes = n === 1 ? [76] : titled ? [76, 42] : [58, 58];
    const fitted = items.map((t, i) => fitSize(t, sizes[i], MAXW, 5));
    const lh = fitted.map(s => s * 1.42);
    const totalH = lh.reduce((x, y) => x + y, 0);
    let y = CY - totalH / 2 + lh[0] / 2;
    const rise = (1 - ease(clamp(u / 0.25, 0, 1))) * 26;
    scrim(W / 2, CY, MAXW * 0.72, totalH * 0.95, a * 0.55);
    items.forEach((t, i) => {
      drawText(t, W / 2, y + rise, fitted[i], C.chalk, a, { track: 5 });
      y += lh[i];
    });
    return;
  }

  if (n <= 6) {
    const fitted = items.map(t => fitSize(t, 42, MAXW, 3));
    const lh = 68;
    const y0 = CY - (n - 1) * lh / 2;
    scrim(W / 2, CY, MAXW * 0.66, (n * lh) * 0.72, pulse(u, 0.18, 0.18) * 0.6);
    items.forEach((t, i) => {
      const at = 0.10 + i * (0.55 / n);
      const a = pulse(clamp((u - at) / (1 - at), 0, 1), 0.12, 0.16);
      const rise = (1 - ease(clamp((u - at) * 6, 0, 1))) * 18;
      drawText(t, W / 2, y0 + i * lh + rise, fitted[i], C.chalk, a * 0.96, { track: 3 });
    });
    return;
  }

  const cols = n >= 12 ? 3 : n >= 7 ? 2 : 2;
  const rows = Math.ceil(n / cols);
  const cw = (W * 0.90) / cols;
  const rh = Math.min(60, (H * 0.62) / rows);
  const y0 = CY - (rows - 1) * rh / 2;
  scrim(W / 2, CY, W * 0.50, rows * rh * 0.68, pulse(u, 0.16, 0.16) * 0.66);
  items.forEach((t, i) => {
    const at = 0.08 + (i / n) * 0.58;
    const a = pulse(clamp((u - at) / (1 - at), 0, 1), 0.10, 0.14);
    const size = fitSize(t, Math.min(32, rh * 0.56), cw - 46, 2);
    const cx = W / 2 - (cols - 1) * cw / 2 + (i % cols) * cw;
    const cy = y0 + Math.floor(i / cols) * rh;
    drawText(t, cx, cy, size, C.chalk, a * 0.94, { track: 2 });
  });
}

/* ================= visual modules ================= */
/* Each takes (u, v, t): shot progress 0-1, variant index, absolute seconds. */

const M = {};

/* --- Act A --- */

M.canopy = (u, v) => {
  // Dawn sky, aerial descent through canopy toward the campus.
  g.fillStyle = vgrad(0, H, [
    [0, '#1B2A4A'], [0.35, '#4A6A86'], [0.62, '#B98B62'], [1, '#E8B672'],
  ]);
  g.fillRect(0, 0, W, H);

  const sunY = lerp(H * 0.74, H * 0.66, ease(u));
  glow(W * 0.66, sunY, 460, C.gold, 0.72);
  dot(W * 0.66, sunY, 54, '#FFF0CE', 0.95);

  // Mist bands drifting laterally.
  for (let i = 0; i < 5; i++) {
    const y = H * (0.56 + i * 0.055);
    fillRect(((u * 60 + i * 300) % (W + 600)) - 300, y, 900, 26, hex(C.chalk, 0.055));
  }

  // Hill ridges: parallax scale as the camera drops.
  const desc = ease(u);
  [[0.80, '#2C4436', 1.00], [0.855, '#22362B', 1.10], [0.90, '#182720', 1.22]].forEach(([hy, col, sc]) => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 40) {
      const y = H * hy + Math.sin(x / 300 + hy * 20) * 46 * sc - desc * 44 * sc;
      g.lineTo(x, y);
    }
    g.lineTo(W, H); g.closePath(); g.fill();
  });

  // Campus rooftops emerging from the mist.
  const ra = ease(clamp((u - 0.3) / 0.5, 0, 1));
  const rnd = mulberry32(7);
  for (let i = 0; i < 9; i++) {
    const x = 180 + rnd() * (W - 360), bw = 130 + rnd() * 170;
    const y = H * 0.855 + rnd() * 60 - desc * 34;
    g.fillStyle = hex('#7A3222', 0.72 * ra);
    g.beginPath();
    g.moveTo(x - bw / 2, y); g.lineTo(x, y - 34); g.lineTo(x + bw / 2, y);
    g.closePath(); g.fill();
    fillRect(x - bw / 2, y, bw, 74, hex('#E4DCCB', 0.5 * ra));
  }

  // Foreground canopy sweeping up past the lens as we descend.
  const rnd2 = mulberry32(21);
  for (let i = 0; i < 16; i++) {
    const x = rnd2() * W;
    const y = -160 + rnd2() * 300 - desc * 520;
    const r = 90 + rnd2() * 140;
    g.fillStyle = hex('#0E1C15', 0.9);
    g.beginPath(); g.ellipse(x, y, r, r * 0.62, rnd2() * 3, 0, 7); g.fill();
  }

  // Birds.
  const ba = ease(clamp((u - 0.45) / 0.3, 0, 1));
  for (let i = 0; i < 5; i++) {
    const bx = (W * 0.15 + u * 420 + i * 96) % W;
    const by = H * 0.4 + Math.sin(u * 6 + i) * 24 + i * 16;
    g.strokeStyle = hex('#14202E', 0.6 * ba); g.lineWidth = 3;
    g.beginPath();
    g.moveTo(bx - 11, by); g.quadraticCurveTo(bx, by - 7, bx + 11, by); g.stroke();
  }
  vignette(0.5);
};

M.gate = (u, v) => {
  // v0 title / v1 walking in / v2 looking up / v3 golden-hour walk out
  const golden = v === 3;
  g.fillStyle = vgrad(0, H, golden
    ? [[0, '#3E4E74'], [0.5, '#C58A55'], [1, '#F0C079']]
    : [[0, '#7FA9C8'], [0.55, '#C6C2AC'], [1, '#D9C69C']]);
  g.fillRect(0, 0, W, H);

  const push = 1 + ease(u) * (v === 0 ? 0.10 : 0.05);
  g.save();
  g.translate(W / 2, H * 0.62);
  g.scale(push, push);
  g.translate(-W / 2, -H * 0.62);

  glow(W / 2, H * 0.52, 420, golden ? C.gold : C.chalk, golden ? 0.85 : 0.55);

  // Gate: two piers and an arch, drawn as a silhouette.
  const wallC = golden ? '#5A3520' : '#8A5A38';
  const pierW = 130, gap = 460, top = H * 0.30, base = H * 0.86;
  g.fillStyle = wallC;
  g.fillRect(W / 2 - gap / 2 - pierW, top + 40, pierW, base - top - 40);
  g.fillRect(W / 2 + gap / 2, top + 40, pierW, base - top - 40);
  g.beginPath();
  g.moveTo(W / 2 - gap / 2 - pierW, top + 90);
  g.quadraticCurveTo(W / 2, top - 108, W / 2 + gap / 2 + pierW, top + 90);
  g.lineTo(W / 2 + gap / 2 + pierW, top + 40);
  g.quadraticCurveTo(W / 2, top - 30, W / 2 - gap / 2 - pierW, top + 40);
  g.closePath(); g.fill();
  // Finials.
  [-1, 1].forEach(s => {
    g.fillStyle = wallC;
    g.beginPath();
    g.moveTo(W / 2 + s * (gap / 2 + pierW / 2) - 34, top + 40);
    g.lineTo(W / 2 + s * (gap / 2 + pierW / 2), top - 26);
    g.lineTo(W / 2 + s * (gap / 2 + pierW / 2) + 34, top + 40);
    g.closePath(); g.fill();
  });

  fillRect(0, base, W, H - base, golden ? '#4A2E1E' : '#6E5A3E');

  // Foliage flanking the gate.
  [[190, 0.78], [W - 190, 0.80]].forEach(([x, hy], i) => {
    g.fillStyle = golden ? '#20301F' : '#2F5D3A';
    g.beginPath(); g.ellipse(x, H * hy - 150, 190, 150, 0, 0, 7); g.fill();
    fillRect(x - 15, H * hy - 150, 30, 260, golden ? '#1A2416' : '#28321F');
  });

  if (v === 1) {           // walking in, away from camera
    const p = ease(u);
    student(W / 2 - 40 + p * 30, lerp(H * 0.99, H * 0.86, p), lerp(300, 190, p), '#20130C', 0.92);
  } else if (v === 2) {    // stopped, looking up
    figure(W / 2 - 190, H * 0.90, 250, '#20130C', 0.92);
  } else if (v === 3) {    // walking out, toward camera
    const p = ease(u);
    figure(W / 2 + 20, lerp(H * 0.84, H * 0.99, p), lerp(180, 330, p), '#2B1A10', 0.94);
  }

  // Extras crossing frame.
  if (v === 1 || v === 0) {
    const rnd = mulberry32(5);
    for (let i = 0; i < 4; i++) {
      const sp = 40 + rnd() * 60, ph = rnd();
      const x = ((ph + u * sp / 260) % 1.4 - 0.2) * W;
      figure(x, H * 0.88 + rnd() * 30, 150 + rnd() * 40, '#241811', 0.5);
    }
  }
  g.restore();
  vignette(0.5);
};

M.corridor = (u, v) => {
  // v0 corridor / v1 lecture hall / v2 whiteboard class / v3 computer lab
  const warm = v !== 3;
  g.fillStyle = vgrad(0, H, warm
    ? [[0, '#2A1F15'], [0.5, '#5C4630'], [1, '#2A1F15']]
    : [[0, '#141A1E'], [0.5, '#26333B'], [1, '#101418']]);
  g.fillRect(0, 0, W, H);

  const vx = W / 2, vy = H * 0.50;
  const dolly = ease(u);

  if (v === 2) {
    // Front-on classroom: whiteboard and lecturer.
    fillRect(0, 0, W, H, '#3A2E20');
    fillRect(W * 0.14, H * 0.16, W * 0.72, H * 0.44, '#E8E4D6');
    glow(W / 2, H * 0.36, 620, C.chalk, 0.16);
    // Chalk marks accumulating across the shot.
    const rnd = mulberry32(31);
    const marks = Math.floor(u * 26);
    for (let i = 0; i < marks; i++) {
      const x = W * 0.18 + rnd() * W * 0.62, y = H * 0.22 + rnd() * H * 0.30;
      line(x, y, x + 40 + rnd() * 130, y + (rnd() - 0.5) * 14, '#2E3A46', 4, 0.55);
    }
    figure(W * 0.24, H * 0.86, 300, '#1A120A', 0.95);              // lecturer
    for (let i = 0; i < 7; i++) {                                   // students
      figure(W * 0.42 + i * 130, H * 1.06 + Math.sin(i) * 8, 260, '#150F08', 0.85);
    }
    vignette(0.55);
    return;
  }

  // Receding perspective: pillars, seat rows or workstation rows.
  const depth = 11;
  for (let i = depth; i >= 1; i--) {
    const z = i - dolly * 1.4;
    if (z < 0.35) continue;
    const s = 1 / z;
    const halfW = W * 0.62 * s, yTop = vy - H * 0.46 * s, yBot = vy + H * 0.52 * s;
    const a = clamp(0.9 - z * 0.06, 0.1, 0.9);

    if (v === 0) {
      [-1, 1].forEach(sd => {
        const x = vx + sd * halfW;
        fillRect(x - 34 * s, yTop, 68 * s, yBot - yTop, hex('#EFE6D2', a * 0.85));
        // Light shaft falling between pillars.
        const gr = g.createLinearGradient(x, yTop, x - sd * 220 * s, yBot);
        gr.addColorStop(0, hex(C.gold, 0.20 * a));
        gr.addColorStop(1, hex(C.gold, 0));
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(x, yTop); g.lineTo(x + 60 * s, yTop);
        g.lineTo(x - sd * 200 * s + 60 * s, yBot); g.lineTo(x - sd * 200 * s, yBot);
        g.closePath(); g.fill();
      });
    } else if (v === 1) {
      fillRect(vx - halfW, vy + H * 0.10 * s, halfW * 2, 26 * s, hex('#6B4A2C', a));
      for (let k = -3; k <= 3; k++) {
        figure(vx + k * halfW / 3.4, vy + H * 0.16 * s, 150 * s, hex('#120C06', a), a);
      }
    } else {
      for (let k = -2; k <= 2; k++) {
        const mx = vx + k * halfW / 2.6;
        fillRect(mx - 42 * s, vy - 20 * s, 84 * s, 58 * s, hex('#0B1218', a));
        fillRect(mx - 36 * s, vy - 14 * s, 72 * s, 46 * s, hex(C.cyan, a * 0.5));
        figure(mx, vy + H * 0.15 * s, 130 * s, hex('#0A0E12', a), a * 0.9);
      }
    }
  }

  fillRect(0, vy + H * 0.44, W, H, warm ? '#241A11' : '#0D1116');
  glow(vx, vy, 380, warm ? C.gold : C.cyan, 0.5);

  if (v === 0) {
    const rnd = mulberry32(13);
    for (let i = 0; i < 5; i++) {
      const ph = rnd(), sp = 0.25 + rnd() * 0.4;
      const p = (ph + u * sp) % 1;
      const s = 0.5 + p * 1.6;
      figure(vx + (rnd() - 0.5) * W * 0.7 * p, vy + H * 0.30 * s, 200 * s, '#160E07', clamp(p * 1.6, 0, 0.9));
    }
  }
  vignette(0.58);
};

M.desk = (u, v) => {
  // v0 noticeboard / v1 notebook / v2 overhead desk / v3 timelapse / v4 IDE
  if (v === 0) {
    fillRect(0, 0, W, H, '#2A2118');
    fillRect(W * 0.08, H * 0.10, W * 0.84, H * 0.72, '#4B3A26');
    const rnd = mulberry32(41);
    for (let i = 0; i < 42; i++) {
      const x = W * 0.10 + rnd() * W * 0.78, y = H * 0.12 + rnd() * H * 0.64;
      const w = 90 + rnd() * 130, h = 70 + rnd() * 110;
      g.save();
      g.translate(x + w / 2, y + h / 2); g.rotate((rnd() - 0.5) * 0.16);
      fillRect(-w / 2, -h / 2, w, h, ['#E9E2D0', '#DCCFAE', '#E4D9C4'][i % 3]);
      g.fillStyle = 'rgba(60,50,40,0.35)';
      for (let k = 0; k < 4; k++) g.fillRect(-w / 2 + 12, -h / 2 + 16 + k * 15, w - 24 - rnd() * 30, 5);
      g.restore();
    }
    const foc = ease(clamp((u - 0.35) / 0.4, 0, 1));   // rack focus to the student
    fillRect(0, 0, W, H, hex('#0A0705', 0.30 * foc));
    figure(W * 0.30, H * 1.02, 520, '#150E08', 0.6 + 0.35 * foc);
    vignette(0.5);
    return;
  }

  if (v === 2) {   // top-down desk
    fillRect(0, 0, W, H, '#241A12');
    glow(W / 2, H / 2, 620, C.gold, 0.30);
    g.save();
    g.translate(W / 2, H / 2); g.rotate(u * 0.10 - 0.05);
    fillRect(-520, -230, 300, 200, '#6E4A2C');       // book stack
    fillRect(-505, -215, 300, 200, '#8A5F38');
    fillRect(-490, -200, 300, 200, '#A57345');
    fillRect(-140, -250, 420, 300, '#EDE6D6');       // notebook
    g.fillStyle = 'rgba(70,60,50,0.4)';
    for (let k = 0; k < 9; k++) g.fillRect(-115, -220 + k * 30, 340 - (k % 3) * 70, 5);
    fillRect(-160, 90, 500, 300, '#1A1E24');         // laptop
    fillRect(-140, 110, 460, 250, '#0D1117');
    g.fillStyle = hex(C.cyan, 0.55);
    for (let k = 0; k < 10; k++) g.fillRect(-120, 128 + k * 22, 90 + (k * 67 % 260), 8);
    dot(400, -120, 52, '#C98A3C', 0.9);              // tea
    dot(400, -120, 44, '#5A3A20', 1);
    g.restore();
    vignette(0.55);
    return;
  }

  if (v === 3) {   // time-lapse: assignments, exam hall, project defence
    const seg = clamp(Math.floor(u * 3), 0, 2);
    const su = (u * 3) % 1;
    const tone = [['#1A1410', C.gold], ['#20242C', C.chalk], ['#181C22', C.cyan]][seg];
    fillRect(0, 0, W, H, tone[0]);
    glow(W / 2, H * 0.4, 700, tone[1], 0.22);
    if (seg === 0) {
      glow(W * 0.62, H * 0.44, 320, C.gold, 0.7);
      figure(W * 0.42, H * 0.94, 420, '#0F0A06', 0.95);
      fillRect(W * 0.52, H * 0.62, 380, 220, hex('#EDE6D6', 0.9));
    } else if (seg === 1) {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
        fillRect(W * 0.12 + c * 260, H * 0.52 + r * 150, 190, 22, hex('#6B5A44', 0.8));
        figure(W * 0.12 + c * 260 + 95, H * 0.52 + r * 150, 130, '#0C0F14', 0.75);
      }
    } else {
      fillRect(W * 0.30, H * 0.20, W * 0.44, H * 0.42, hex(C.cyan, 0.16));
      g.strokeStyle = hex(C.cyan, 0.5); g.lineWidth = 3;
      g.strokeRect(W * 0.30, H * 0.20, W * 0.44, H * 0.42);
      figure(W * 0.24, H * 0.92, 340, '#0A0E12', 0.95);
      figure(W * 0.72, H * 0.94, 300, '#0A0E12', 0.6);
      figure(W * 0.82, H * 0.94, 300, '#0A0E12', 0.6);
    }
    fillRect(0, 0, W, H, `rgba(0,0,0,${(1 - pulse(su, 0.12, 0.12)) * 0.85})`);
    vignette(0.5);
    return;
  }

  // v1 notebook close-up, v4 IDE at night
  const ide = v === 4;
  fillRect(0, 0, W, H, ide ? '#0A0D12' : '#231A11');
  glow(W * (ide ? 0.5 : 0.62), H * 0.42, ide ? 560 : 420, ide ? C.cyan : C.gold, ide ? 0.34 : 0.62);

  if (ide) {
    fillRect(W * 0.16, H * 0.14, W * 0.68, H * 0.66, '#11161F');
    fillRect(W * 0.16, H * 0.14, W * 0.68, 46, '#1B2230');
    fillRect(W * 0.16, H * 0.20, 210, H * 0.60, '#0D1219');   // project tree
    const rnd = mulberry32(61);
    for (let k = 0; k < 12; k++) {
      fillRect(W * 0.17, H * 0.22 + k * 40, 60 + rnd() * 110, 9, hex(C.chalk, 0.28));
    }
    const lines = Math.floor(3 + u * 20);                      // code typing in
    for (let k = 0; k < lines; k++) {
      const ind = (k % 4 === 1 || k % 4 === 2) ? 60 : 0;
      const wd = 120 + ((k * 137) % 460);
      const col = [C.cyan, C.amber, C.chalk, C.violet][k % 4];
      fillRect(W * 0.30 + ind, H * 0.22 + k * 34, wd, 11, hex(col, 0.62));
    }
    figure(W * 0.5, H * 1.30, 620, '#04060A', 0.92);
  } else {
    g.save();
    g.translate(W / 2, H * 0.58); g.rotate(-0.05);
    fillRect(-560, -300, 1120, 620, '#F3EDDE');
    fillRect(-8, -300, 16, 620, '#DCD3BE');                    // spine
    g.fillStyle = 'rgba(90,80,66,0.35)';
    for (let k = 0; k < 11; k++) g.fillRect(40, -250 + k * 52, 480, 4);
    const written = ease(clamp(u / 0.7, 0, 1));                // date being written
    fillRect(-480, -244, 300 * written, 13, hex('#2A3A55', 0.8));
    g.restore();
    figure(W * 0.80, H * 1.22, 640, '#150E08', 0.55);
  }
  vignette(0.55);
};

M.columns = (u) => {
  // Thirteen curriculum pillars rising in sequence.
  fillRect(0, 0, W, H, '#171310');
  glow(W / 2, H * 0.30, 780, C.gold, 0.20);
  const n = 13, base = H * 0.90;
  for (let i = 0; i < n; i++) {
    const at = i / n * 0.55;
    const p = ease(clamp((u - at) / 0.30, 0, 1));
    if (p <= 0) continue;
    const x = W * 0.07 + i * (W * 0.86 / (n - 1));
    const h = 560 * p, cw = 62;
    fillRect(x - cw / 2, base - h, cw, h, hex('#EDE3CE', 0.90));
    fillRect(x - cw / 2 - 9, base - h - 20, cw + 18, 20, hex('#F6EEDC', 0.95));  // capital
    fillRect(x - cw / 2 - 9, base - 16, cw + 18, 16, hex('#D8CBB2', 0.9));       // plinth
    // Light shaft above each capital.
    const gr = g.createLinearGradient(x, base - h - 20, x, base - h - 300);
    gr.addColorStop(0, hex(C.gold, 0.26 * p));
    gr.addColorStop(1, hex(C.gold, 0));
    g.fillStyle = gr;
    g.fillRect(x - cw, base - h - 300, cw * 2, 300);
  }
  fillRect(0, base, W, H - base, '#0F0C09');
  figure(W * 0.5, base, 220, '#0A0705', 0.85);
  vignette(0.6);
};

M.doorway = (u) => {
  // The "graduation stage" resolves into an open door and a road beyond.
  fillRect(0, 0, W, H, '#0D0B0A');
  const open = ease(u);
  const dw = lerp(180, 520, open), dh = lerp(300, 720, open);
  const cx = W / 2, cy = H * 0.62;
  glow(cx, cy - dh * 0.2, lerp(300, 900, open), C.gold, 0.75);
  g.fillStyle = vgrad(cy - dh, cy, [[0, '#FFF3D6'], [1, '#F5B95C']]);
  g.fillRect(cx - dw / 2, cy - dh, dw, dh);
  // Road receding through the doorway.
  const ra = ease(clamp((u - 0.35) / 0.5, 0, 1));
  g.fillStyle = hex('#FFF8E6', 0.55 * ra);
  g.beginPath();
  g.moveTo(cx - dw * 0.16, cy - dh * 0.5); g.lineTo(cx + dw * 0.16, cy - dh * 0.5);
  g.lineTo(cx + W * 0.4, H); g.lineTo(cx - W * 0.4, H);
  g.closePath(); g.fill();
  fillRect(0, 0, W, H, hex('#0D0B0A', 0));
  figure(cx, cy, 250, '#120D08', 0.92);
  vignette(0.62);
};

/* --- Act B --- */

M.rail = (u, v, t) => {
  // Accelerating holographic timeline. Variants set the speed and the framing.
  const warmHall = v === 0;
  fillRect(0, 0, W, H, warmHall ? '#1E1710' : C.indigo);

  if (warmHall) {                       // line igniting across the lecture hall
    for (let i = 0; i < 5; i++) {
      const s = 1 / (i * 0.5 + 1);
      fillRect(W / 2 - W * 0.5 * s, H * 0.5 - H * 0.3 * s, W * s, H * 0.6 * s, hex('#3A2C1D', 0.5));
    }
    for (let k = -3; k <= 3; k++) figure(W / 2 + k * 230, H * 0.86, 210, '#100B07', 0.7);
  }

  const speeds = [0, 320, 420, 1500, 60, 900, 2600, 0, 120];
  const spd = speeds[v] || 0;
  const ignite = v === 0 ? ease(clamp(u / 0.6, 0, 1)) : 1;
  const railY = H * 0.5;

  // The rail itself.
  const gr = g.createLinearGradient(0, railY - 60, 0, railY + 60);
  gr.addColorStop(0, hex(C.cyan, 0));
  gr.addColorStop(0.5, hex(C.cyan, 0.85));
  gr.addColorStop(1, hex(C.cyan, 0));
  g.fillStyle = gr;
  g.fillRect(W / 2 - W * 0.5 * ignite, railY - 60, W * ignite, 120);
  glow(W / 2, railY, 520, C.cyan, 0.35 * ignite);

  if (v === 2) {
    // Books and desktop towers dissolving upward into cloud/model forms.
    const rnd = mulberry32(77);
    for (let i = 0; i < 26; i++) {
      const p = clamp((u - rnd() * 0.4) * 1.7, 0, 1);
      const x = W * 0.1 + rnd() * W * 0.8;
      const y0 = H * 0.72 + rnd() * 120;
      const y = lerp(y0, H * 0.22, ease(p));
      const sz = lerp(70, 14, ease(p));
      const col = p < 0.5 ? '#8A5F38' : C.cyan;
      g.save(); g.globalAlpha = 0.85;
      fillRect(x - sz / 2, y - sz / 2, sz, sz * (p < 0.5 ? 1.3 : 1), hex(col, 0.8));
      g.restore();
      if (p > 0.5) dot(x, y, 4, C.cyan, 0.9);
    }
  }

  // Node markers streaming past.
  const nodes = 26;
  for (let i = 0; i < nodes; i++) {
    const raw = (i * 240 - t * spd) % (W + 900);
    const x = raw < -400 ? raw + W + 900 : raw;
    if (x < -300 || x > W + 300) continue;
    const streak = clamp(spd / 700, 0, 1);
    const a = 0.85 * ignite;
    if (streak > 0.08) {
      const gr2 = g.createLinearGradient(x - 420 * streak, railY, x + 40, railY);
      gr2.addColorStop(0, hex(C.cyan, 0));
      gr2.addColorStop(1, hex(C.violet, 0.75 * a));
      g.fillStyle = gr2;
      g.fillRect(x - 420 * streak, railY - 9, 420 * streak + 40, 18);
    }
    if (streak < 0.9) {
      glow(x, railY, 90, C.cyan, 0.55 * a * (1 - streak));
      poly(x, railY, 34, 6, t * 0.7 + i, C.cyan, 0.9 * a * (1 - streak), false);
      dot(x, railY, 9, '#FFFFFF', 0.9 * a * (1 - streak));
    }
    line(x, railY - 150, x, railY - 60, C.cyan, 2, 0.22 * a * (1 - streak));
  }

  if (v === 4) {
    // The rush continues; the student stands still inside it.
    student(W * 0.5, H * 0.90, 300, '#050810', 0.95);
    glow(W * 0.5, H * 0.72, 260, C.cyan, 0.25);
    const rnd = mulberry32(91);
    for (let i = 0; i < 120; i++) {
      const y = rnd() * H;
      const dir = rnd() > 0.5 ? 1 : -1;
      const x = (rnd() * W + dir * t * (120 + rnd() * 320)) % W;
      dot(x < 0 ? x + W : x, y, 2 + rnd() * 2, C.cyan, 0.35);
    }
  }

  if (v === 7) {
    // Timeline ends at an open field of light — bright, not ominous.
    const bright = ease(clamp((u - 0.15) / 0.55, 0, 1));
    const edge = W * 0.58;
    const gr3 = g.createLinearGradient(edge, 0, W, 0);
    gr3.addColorStop(0, hex('#FFFFFF', 0));
    gr3.addColorStop(1, hex('#FFFFFF', 0.92 * bright));
    g.fillStyle = gr3; g.fillRect(edge, 0, W - edge, H);
    glow(W * 0.86, H * 0.5, 620, '#FFFFFF', 0.7 * bright);
  }

  if (v === 8) {
    // Landscape continuously rebuilding itself; the student is unafraid.
    const rnd = mulberry32(103);
    for (let i = 0; i < 46; i++) {
      const ph = (t * 0.5 + rnd() * 6) % 3;
      const a = pulse(clamp(ph / 3, 0, 1), 0.2, 0.2);
      const x = rnd() * W, hgt = 80 + rnd() * 460;
      fillRect(x, H * 0.86 - hgt, 30 + rnd() * 60, hgt, hex(C.cyan, 0.18 * a));
      line(x, H * 0.86 - hgt, x, H * 0.86, C.cyan, 2, 0.4 * a);
    }
    fillRect(0, H * 0.86, W, H, '#070A14');
    student(W * 0.5, H * 0.94, 320, '#04060C', 0.96);
  }
  vignette(0.55);
};

M.solids = (u, v, t) => {
  // Concept polyhedra: the durable layer that survives a change of language.
  fillRect(0, 0, W, H, v === 2 ? '#14100C' : '#0B1018');
  const cx = W / 2, cy = H * 0.48;

  if (v === 2) {
    // Tool rack — every tool clean and in good order.
    glow(cx, cy, 640, C.amber, 0.24);
    const tools = 7;
    for (let i = 0; i < tools; i++) {
      const x = W * 0.16 + i * (W * 0.68 / (tools - 1));
      const a = pulse(clamp((u - i * 0.05) / 0.9, 0, 1), 0.1, 0.5) * 0.5 + 0.5;
      line(x, H * 0.24, x, H * 0.30, C.amber, 3, 0.5 * a);
      g.save(); g.translate(x, H * 0.30 + 90); g.rotate(Math.sin(t * 0.6 + i) * 0.03);
      fillRect(-14, -90, 28, 150, hex('#C9D4DE', 0.85 * a));
      fillRect(-26, 60, 52, 60, hex(C.amber, 0.8 * a));
      g.restore();
      glow(x, H * 0.36, 90, C.amber, 0.2 * a);
    }
    const pick = ease(clamp((u - 0.45) / 0.4, 0, 1));   // one tool selected
    const px = W * 0.16 + 3 * (W * 0.68 / (tools - 1));
    if (pick > 0) {
      glow(px, H * 0.36, 150 * pick, C.gold, 0.7 * pick);
      figure(W * 0.5, H * 1.02, 420, '#0C0906', 0.9);
    }
    vignette(0.6);
    return;
  }

  if (v === 0) {
    // Code lifting off the screen and reassembling as concepts.
    const lift = ease(clamp(u / 0.5, 0, 1));
    fillRect(W * 0.28, H * 0.62, W * 0.44, H * 0.30, hex('#0D1219', 1 - lift * 0.6));
    for (let k = 0; k < 9; k++) {
      const y = lerp(H * 0.66 + k * 26, H * 0.30 + k * 8, ease(clamp((u - k * 0.02) / 0.5, 0, 1)));
      fillRect(W * 0.31, y, 120 + ((k * 91) % 300), 9, hex(C.cyan, 0.5 * (1 - lift * 0.4)));
    }
  }

  if (v === 1) {
    // The interface shell dissolves and a different one rebuilds around the
    // SAME solids. The older emblem stays lit and intact — never crumbling.
    const swap = clamp((u - 0.25) / 0.35, 0, 1);
    const oldA = 1 - ease(swap), newA = ease(swap);
    g.strokeStyle = hex(C.amber, 0.5 * oldA); g.lineWidth = 4;
    g.strokeRect(cx - 520, cy - 330, 1040, 660);
    g.strokeStyle = hex(C.cyan, 0.55 * newA); g.lineWidth = 4;
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      g.roundRect(cx - 560 + k * 20, cy - 350 + k * 12, 1120 - k * 40, 40, 8);
    }
    g.stroke();
    // Respected predecessor, still burning bright at frame edge.
    const em = W * 0.115, emy = H * 0.80;
    glow(em, emy, 130, C.amber, 0.55);
    poly(em, emy, 56, 6, t * 0.4, C.amber, 0.95, false);
    dot(em, emy, 20, C.amber, 0.9);
    drawText('STILL IMPORTANT', em, emy + 110, 22, C.amber, 0.75, { track: 3 });
  }

  // Eight concept solids in slow orbit — identical across v0 and v1.
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = t * 0.32 + i * Math.PI * 2 / n;
    const rx = 430, ry = 165;
    const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    const dep = (Math.sin(a) + 1) / 2;                 // fake z for scale/alpha
    const sc = lerp(0.62, 1.25, dep);
    const app = ease(clamp((u - 0.18 - i * 0.035) / 0.4, 0, 1));
    if (app <= 0) continue;
    glow(x, y, 105 * sc, C.amber, 0.34 * dep * app);
    poly(x, y, 46 * sc, 3 + (i % 4), a * 1.6, C.cyan, 0.9 * app, false);
    poly(x, y, 30 * sc, 3 + (i % 4), a * 1.6, C.amber, 0.55 * dep * app, true);
  }
  glow(cx, cy, 300, C.cyan, 0.16);
  vignette(0.6);
};

M.panels = (u, v, t) => {
  // An arc of holographic panels fanning out, each with its own mini-visual.
  fillRect(0, 0, W, H, v === 2 ? '#0B0A1C' : '#0A1018');
  const counts = [6, 4, 5];
  const n = counts[v];
  const accent = v === 2 ? C.violet : C.cyan;
  glow(W / 2, H * 0.5, 760, accent, 0.16);

  for (let i = 0; i < n; i++) {
    const app = ease(clamp((u - i * 0.08) / 0.4, 0, 1));
    if (app <= 0) continue;
    const spread = (i - (n - 1) / 2) / Math.max(n - 1, 1);
    const x = W / 2 + spread * W * 0.72 * app;
    const tilt = -spread * 0.34;
    const dep = 1 - Math.abs(spread) * 0.30;
    const pw = 330 * dep, ph = 430 * dep;

    g.save();
    g.translate(x, H * 0.48 + Math.sin(t * 0.6 + i) * 8);
    g.transform(1, tilt * 0.5, 0, 1, 0, 0);
    g.globalAlpha = app * (0.55 + dep * 0.45);

    fillRect(-pw / 2, -ph / 2, pw, ph, hex(accent, 0.10));
    g.strokeStyle = hex(accent, 0.6); g.lineWidth = 3;
    g.strokeRect(-pw / 2, -ph / 2, pw, ph);

    const rnd = mulberry32(200 + i + v * 10);
    if (i % 5 === 0) {                                  // flow / pipeline
      for (let k = 0; k < 5; k++) {
        const yy = -ph / 2 + 70 + k * 60;
        line(-pw / 2 + 26, yy, pw / 2 - 26, yy + Math.sin(t + k) * 10, accent, 3, 0.7);
        dot(-pw / 2 + 26 + ((t * 90 + k * 60) % (pw - 52)), yy, 6, C.amber, 0.9);
      }
    } else if (i % 5 === 1) {                           // scatter
      for (let k = 0; k < 40; k++) {
        dot(-pw / 2 + 30 + rnd() * (pw - 60), ph / 2 - 30 - rnd() * (ph - 60), 4, accent, 0.75);
      }
    } else if (i % 5 === 2) {                           // training curve
      g.strokeStyle = hex(C.amber, 0.9); g.lineWidth = 4; g.beginPath();
      for (let k = 0; k <= 40; k++) {
        const px = -pw / 2 + 30 + k / 40 * (pw - 60);
        const py = ph / 2 - 40 - (1 - Math.exp(-k / 9)) * (ph - 90);
        k ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.stroke();
    } else if (i % 5 === 3) {                           // graph / lattice
      const pts = [];
      for (let k = 0; k < 8; k++) {
        pts.push([-pw / 2 + 40 + rnd() * (pw - 80), -ph / 2 + 40 + rnd() * (ph - 80)]);
      }
      pts.forEach((p, a2) => pts.forEach((q, b2) => {
        if (b2 > a2 && (a2 + b2) % 3 === 0) line(p[0], p[1], q[0], q[1], accent, 2, 0.35);
      }));
      pts.forEach(p => dot(p[0], p[1], 7, C.amber, 0.9));
    } else {                                            // molecular / structure
      for (let k = 0; k < 6; k++) {
        const a2 = t * 0.5 + k;
        const px = Math.cos(a2) * pw * 0.24, py = Math.sin(a2 * 1.3) * ph * 0.22;
        line(0, 0, px, py, accent, 2, 0.5);
        dot(px, py, 9, C.amber, 0.9);
      }
      dot(0, 0, 13, '#FFFFFF', 0.9);
    }
    g.restore();
  }
  if (v === 1) figure(W * 0.5, H * 1.06, 380, '#050A10', 0.5);
  vignette(0.58);
};

M.unfold = (u, v, t) => {
  // A single old web page becoming a modern distributed system.
  fillRect(0, 0, W, H, v >= 2 ? '#080C18' : '#0B1016');
  const cx = W / 2, cy = H * 0.48;

  if (v === 0) {
    const push = 1 + ease(u) * 0.14;
    g.save(); g.translate(cx, cy); g.scale(push, push);
    fillRect(-430, -280, 860, 560, '#C8C8C0');                 // grey page
    fillRect(-410, -260, 820, 60, '#9AA6B4');
    for (let k = 0; k < 5; k++) {
      fillRect(-410, -180 + k * 82, 300 + (k % 2) * 180, 22, '#7C8899');
      fillRect(-410, -148 + k * 82, 480 - (k % 3) * 90, 12, '#A8B0BC');
    }
    fillRect(-410, 210, 210, 34, '#3A5BA0');                   // link bar
    const blink = (t * 2 | 0) % 2;                             // period blink
    if (blink) fillRect(230, 210, 170, 34, '#2E7D46');
    g.restore();
    glow(cx, cy, 520, C.cyan, 0.14);
    vignette(0.6);
    return;
  }

  if (v === 1) {
    // Unfolding into layered components, a framework tree, API arcs.
    const p = ease(u);
    for (let i = 0; i < 7; i++) {
      const off = i * 60 * p;
      const a = 0.85 - i * 0.09;
      g.save();
      g.translate(cx - 150 + off * 1.4, cy - 60 + off * 0.5);
      g.transform(1, -0.13 * p, 0, 1, 0, 0);
      fillRect(-260, -170, 520, 340, hex(i === 0 ? '#C8C8C0' : C.cyan, (i === 0 ? 0.6 : 0.13) * a));
      g.strokeStyle = hex(C.cyan, 0.55 * a); g.lineWidth = 3;
      g.strokeRect(-260, -170, 520, 340);
      g.restore();
    }
    // Framework tree growing behind.
    const grow = ease(clamp((u - 0.25) / 0.5, 0, 1));
    (function branch(x, y, ang, len, d) {
      if (d === 0 || len < 12) return;
      const x2 = x + Math.cos(ang) * len * grow, y2 = y + Math.sin(ang) * len * grow;
      line(x, y, x2, y2, C.cyan, d, 0.45 * grow);
      branch(x2, y2, ang - 0.42, len * 0.72, d - 1);
      branch(x2, y2, ang + 0.42, len * 0.72, d - 1);
    })(cx + 380, cy + 240, -Math.PI / 2, 150, 5);
    // API arcs shooting outward to nodes and databases.
    const arcs = ease(clamp((u - 0.4) / 0.5, 0, 1));
    for (let i = 0; i < 6; i++) {
      const a = -0.4 + i * 0.42;
      const ex = cx + Math.cos(a) * 800 * arcs, ey = cy + Math.sin(a) * 420 * arcs;
      g.strokeStyle = hex(C.amber, 0.5 * arcs); g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx, cy);
      g.quadraticCurveTo(cx + Math.cos(a) * 420, cy + Math.sin(a) * 120, ex, ey);
      g.stroke();
      if (arcs > 0.6) {                                        // database cylinders
        g.fillStyle = hex(C.cyan, 0.5);
        g.beginPath(); g.ellipse(ex, ey - 20, 34, 12, 0, 0, 7); g.fill();
        g.fillRect(ex - 34, ey - 20, 68, 44);
        g.beginPath(); g.ellipse(ex, ey + 24, 34, 12, 0, 0, 7); g.fill();
      }
    }
    vignette(0.6);
    return;
  }

  // v2 container field / v3 AI membrane / v4 one light among many
  const rnd = mulberry32(151);
  const pts = [];
  for (let i = 0; i < 210; i++) {
    pts.push([rnd() * W, H * 0.16 + rnd() * H * 0.68, rnd()]);
  }
  const spread = v === 2 ? ease(u) : 1;
  pts.forEach(([x, y, r], i) => {
    const px = lerp(W / 2, x, spread), py = lerp(H * 0.5, y, spread);
    const sz = lerp(6, 16, r);
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.2 + r * 9));
    fillRect(px - sz / 2, py - sz / 2, sz, sz, hex(C.cyan, 0.42 * spread * tw));
    if (i % 9 === 0 && spread > 0.5) {
      const q = pts[(i + 7) % pts.length];
      line(px, py, lerp(W / 2, q[0], spread), lerp(H * 0.5, q[1], spread), C.cyan, 1, 0.13);
    }
  });
  if (v === 2) {
    const burst = (t * 3) % 1;                                  // serverless bursts
    for (let i = 0; i < 8; i++) {
      const b = (burst + i / 8) % 1;
      const p = pts[(i * 23) % pts.length];
      glow(p[0], p[1], 60 * (1 - b), C.amber, 0.7 * (1 - b));
    }
  }
  if (v === 3) {
    const desc = ease(u);                                       // intelligence layer
    const my = lerp(-H * 0.4, H * 0.34, desc);
    const gr = g.createLinearGradient(0, my - 260, 0, my + 260);
    gr.addColorStop(0, hex(C.violet, 0));
    gr.addColorStop(0.5, hex(C.violet, 0.32));
    gr.addColorStop(1, hex(C.violet, 0));
    g.fillStyle = gr; g.fillRect(0, my - 260, W, 520);
    for (let i = 0; i < 4; i++) {
      const rp = ((t * 0.5 + i / 4) % 1);
      g.strokeStyle = hex(C.violet, 0.35 * (1 - rp)); g.lineWidth = 3;
      g.beginPath(); g.ellipse(W / 2, my, W * rp * 0.8, 190 * rp, 0, 0, 7); g.stroke();
    }
  }
  if (v === 4) {
    const ig = ease(clamp((u - 0.4) / 0.4, 0, 1));              // their one light
    glow(W * 0.44, H * 0.44, 200 * ig, C.gold, 0.9 * ig);
    dot(W * 0.44, H * 0.44, 15 * ig, '#FFF6DE', ig);
    figure(W * 0.12, H * 1.04, 400, '#040810', 0.75 * (1 - ig * 0.4));
  }
  vignette(0.6);
};

M.aitree = (u, v, t) => {
  // AI as a family of technologies: one core, many branches.
  fillRect(0, 0, W, H, C.indigo);
  const cx = W / 2, cy = v === 1 ? H * 0.46 : H * 0.48;

  if (v === 2) {
    // Student and system as collaborators, light moving both ways.
    glow(W * 0.68, H * 0.46, 460, C.cyan, 0.32);
    fillRect(W * 0.50, H * 0.20, W * 0.40, H * 0.56, hex(C.cyan, 0.09));
    g.strokeStyle = hex(C.cyan, 0.5); g.lineWidth = 3;
    g.strokeRect(W * 0.50, H * 0.20, W * 0.40, H * 0.56);
    for (let k = 0; k < 8; k++) {
      fillRect(W * 0.53, H * 0.26 + k * 46, 120 + ((k * 113) % 380), 12, hex(C.cyan, 0.42));
    }
    glow(W * 0.24, H * 0.55, 300, C.gold, 0.34);
    figure(W * 0.26, H * 0.96, 460, '#05070F', 0.95);
    for (let i = 0; i < 10; i++) {                    // exchange in both directions
      const p = ((t * 0.5 + i / 10) % 1);
      const fwd = i % 2 === 0;
      const x = fwd ? lerp(W * 0.32, W * 0.50, p) : lerp(W * 0.50, W * 0.32, p);
      const y = H * 0.50 + Math.sin(p * 6 + i) * 40;
      dot(x, y, 7, fwd ? C.gold : C.cyan, 0.85 * Math.sin(p * Math.PI));
    }
    vignette(0.6);
    return;
  }

  const scale = v === 3 ? lerp(1, 0.55, ease(u)) : 1;
  const oy = v === 3 ? lerp(0, H * 0.16, ease(u)) : 0;
  g.save(); g.translate(cx, cy + oy); g.scale(scale, scale); g.translate(-cx, -cy);

  const branches = 8;
  const showBranch = v >= 1;
  if (showBranch) {
    for (let i = 0; i < branches; i++) {
      const at = (i >> 1) * 0.14;                     // grow in pairs
      const p = ease(clamp((u - at) / 0.34, 0, 1));
      if (p <= 0) continue;
      const a = -Math.PI / 2 + (i - (branches - 1) / 2) * 0.40;
      const len = 400;
      const ex = cx + Math.cos(a) * len * p, ey = cy + Math.sin(a) * len * p * 0.92;
      g.strokeStyle = hex(C.cyan, 0.6 * p); g.lineWidth = 5;
      g.beginPath(); g.moveTo(cx, cy);
      g.quadraticCurveTo(cx + Math.cos(a) * len * 0.5, cy + Math.sin(a) * len * 0.35, ex, ey);
      g.stroke();
      glow(ex, ey, 90 * p, C.violet, 0.45 * p);
      poly(ex, ey, 30 * p, 6, t * 0.5 + i, C.cyan, 0.85 * p, false);
      dot(ex, ey, 10 * p, '#FFFFFF', 0.8 * p);
    }
  }

  // Core sphere.
  const core = ease(clamp(u / 0.35, 0, 1));
  glow(cx, cy, 330 * core, C.violet, 0.6);
  const sg = g.createRadialGradient(cx - 30, cy - 30, 10, cx, cy, 150 * core);
  sg.addColorStop(0, hex('#FFFFFF', 0.95));
  sg.addColorStop(0.45, hex(C.cyan, 0.75));
  sg.addColorStop(1, hex(C.violet, 0.30));
  g.fillStyle = sg;
  g.beginPath(); g.arc(cx, cy, 150 * core, 0, 7); g.fill();
  for (let i = 0; i < 3; i++) {                        // internal structure
    g.strokeStyle = hex('#FFFFFF', 0.28); g.lineWidth = 2;
    g.beginPath();
    g.ellipse(cx, cy, 150 * core, 150 * core * Math.abs(Math.cos(t * 0.4 + i * 1.1)), 0, 0, 7);
    g.stroke();
  }
  g.restore();

  if (v === 3) {
    const rnd = mulberry32(171);                        // wider ecosystem
    for (let i = 0; i < 70; i++) {
      const x = rnd() * W, y = H * 0.2 + rnd() * H * 0.6;
      dot(x, y, 3 + rnd() * 4, C.cyan, 0.30);
      if (i % 5 === 0) line(x, y, cx, cy + oy, C.cyan, 1, 0.07);
    }
    figure(W * 0.5, H * 0.99, 190, '#04060E', 0.9);
    glow(W * 0.5, H * 0.92, 170, C.gold, 0.28);
  }
  vignette(0.6);
};

M.pipeline = (u, v, t) => {
  // Data -> Model -> Prediction -> Decision -> Automation
  fillRect(0, 0, W, H, C.indigo);
  const y = H * 0.46, n = 5;
  const xs = [];
  for (let i = 0; i < n; i++) xs.push(W * 0.13 + i * (W * 0.74 / (n - 1)));

  for (let i = 0; i < n - 1; i++) {
    line(xs[i], y, xs[i + 1], y, C.cyan, 4, 0.35);
  }
  // Flow travelling the whole pipeline.
  for (let k = 0; k < 26; k++) {
    const p = ((t * 0.28 + k / 26) % 1);
    const seg = clamp(Math.floor(p * (n - 1)), 0, n - 2);
    const sp = (p * (n - 1)) % 1;
    dot(lerp(xs[seg], xs[seg + 1], sp), y + Math.sin(p * 20) * 6, 6, C.amber, 0.8);
  }

  for (let i = 0; i < n; i++) {
    const app = ease(clamp((u - i * 0.10) / 0.3, 0, 1));
    if (app <= 0) continue;
    glow(xs[i], y, 150 * app, C.cyan, 0.32 * app);
    const rnd = mulberry32(300 + i);
    g.save(); g.translate(xs[i], y); g.globalAlpha = app;
    if (i === 0) {                                    // raw particles
      for (let k = 0; k < 34; k++) dot((rnd() - 0.5) * 150, (rnd() - 0.5) * 150, 4, C.cyan, 0.8);
    } else if (i === 1) {                             // dense lattice
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
        const px = (a - 1.5) * 36, py = (b - 1.5) * 36;
        dot(px, py, 6, C.violet, 0.85);
        if (a < 3) line(px, py, px + 36, py, C.violet, 1.5, 0.4);
        if (b < 3) line(px, py, px, py + 36, C.violet, 1.5, 0.4);
      }
    } else if (i === 2) {                             // probability bars
      for (let k = 0; k < 5; k++) {
        const hgt = 30 + Math.abs(Math.sin(t * 0.7 + k)) * 90;
        fillRect(-90 + k * 38, 70 - hgt, 26, hgt, hex(C.amber, 0.85));
      }
    } else if (i === 3) {                             // decision fork
      line(0, 60, 0, 0, C.cyan, 4, 0.9);
      line(0, 0, -70, -70, C.cyan, 4, 0.9);
      line(0, 0, 70, -70, C.cyan, 4, 0.5);
      dot(-70, -70, 12, C.amber, 0.95); dot(70, -70, 12, C.cyan, 0.4);
    } else {                                          // autonomous machines
      for (let k = 0; k < 3; k++) {
        const px = (k - 1) * 66, py = Math.sin(t * 1.5 + k) * 14;
        fillRect(px - 22, py - 22, 44, 44, hex(C.cyan, 0.6));
        dot(px, py, 8, C.amber, 0.9);
      }
    }
    g.restore();
  }
  vignette(0.6);
};

M.mathfield = (u, v, t) => {
  // The deliberate slow-down. Least motion, most beauty.
  fillRect(0, 0, W, H, '#0A0D1E');
  const cx = W / 2, cy = H * 0.46;

  if (v === 0) {
    // Glyphs drifting almost imperceptibly around a still, thinking student.
    const glyphs = ['∑', '∫', 'σ', 'μ', 'λ', 'π', 'θ', '∂', '√', '∞', 'Δ', 'Ω', 'x̄', 'P(A|B)', 'ƒ(x)'];
    const rnd = mulberry32(211);
    glyphs.forEach((s, i) => {
      const bx = rnd() * W, by = H * 0.12 + rnd() * H * 0.74;
      const x = bx + Math.sin(t * 0.12 + i) * 22, y = by + Math.cos(t * 0.10 + i * 1.3) * 18;
      const a = (0.22 + 0.5 * rnd()) * ease(clamp(u / 0.3, 0, 1));
      glow(x, y, 100, C.cyan, 0.10 * a);
      drawText(s, x, y, 56 + rnd() * 46, C.cyan, a, { weight: 400, shadow: false });
    });
    for (let i = 0; i < 3; i++) {                     // matrix lattices
      const x = W * (0.18 + i * 0.31), y = H * (0.24 + (i % 2) * 0.45);
      g.strokeStyle = hex(C.gold, 0.18); g.lineWidth = 2;
      for (let a = 0; a <= 3; a++) {
        line(x - 60, y - 60 + a * 40, x + 60, y - 60 + a * 40, C.gold, 2, 0.16);
        line(x - 60 + a * 40, y - 60, x - 60 + a * 40, y + 60, C.gold, 2, 0.16);
      }
    }
    figure(cx, H * 1.00, 420, '#04060E', 0.9);
    glow(cx, H * 0.80, 260, C.gold, 0.16);
    vignette(0.62);
    return;
  }

  if (v === 1) {
    // Bell curve filling from falling samples.
    const curve = y0 => {
      g.beginPath();
      for (let k = 0; k <= 120; k++) {
        const x = cx - 620 + k * (1240 / 120);
        const z = (x - cx) / 260;
        const y = y0 - Math.exp(-z * z / 2) * 420;
        k ? g.lineTo(x, y) : g.moveTo(x, y);
      }
    };
    const base = H * 0.80;
    const fill = ease(clamp((u - 0.1) / 0.7, 0, 1));
    curve(base); g.lineTo(cx + 620, base); g.lineTo(cx - 620, base); g.closePath();
    g.fillStyle = hex(C.cyan, 0.14 * fill); g.fill();
    curve(base); g.strokeStyle = hex(C.cyan, 0.9); g.lineWidth = 5; g.stroke();
    glow(cx, base - 210, 460, C.cyan, 0.20);
    const rnd = mulberry32(223);
    for (let i = 0; i < 220; i++) {                   // samples raining down
      const ph = (t * 0.30 + rnd()) % 1;
      const x = cx + (rnd() - 0.5) * 1100;
      const z = (x - cx) / 260;
      const target = base - Math.exp(-z * z / 2) * 420;
      const y = lerp(-60, target, ease(ph));
      dot(x, y, 3.5, C.gold, 0.75 * fill);
    }
    fillRect(0, base, W, 4, hex(C.chalk, 0.30));
    vignette(0.62);
    return;
  }

  if (v === 2) {
    // A matrix rotating a point cloud — geometry made physical.
    const ang = t * 0.24;
    g.strokeStyle = hex(C.cyan, 0.13); g.lineWidth = 1.5;
    for (let k = -8; k <= 8; k++) {
      line(cx + k * 90, cy - 380, cx + k * 90, cy + 380, C.cyan, 1.5, 0.11);
      line(cx - 760, cy + k * 46, cx + 760, cy + k * 46, C.cyan, 1.5, 0.11);
    }
    const rnd = mulberry32(233);
    const app = ease(clamp(u / 0.35, 0, 1));
    for (let i = 0; i < 150; i++) {
      const px = (rnd() - 0.5) * 620, py = (rnd() - 0.5) * 400;
      const shear = Math.sin(ang) * 0.55;
      const x = cx + (px + py * shear) * app, y = cy + py * (1 + Math.cos(ang) * 0.24) * app;
      dot(x, y, 4, C.gold, 0.72 * app);
    }
    [[1, 0], [0.35, -0.9]].forEach(([dx, dy], i) => {   // basis vectors
      const s = 260 * (1 + Math.sin(ang + i) * 0.24);
      const ex = cx + dx * s, ey = cy + dy * s;
      line(cx, cy, ex, ey, i ? C.violet : C.cyan, 6, 0.95);
      g.fillStyle = hex(i ? C.violet : C.cyan, 0.95);
      g.beginPath(); g.arc(ex, ey, 12, 0, 7); g.fill();
    });
    vignette(0.62);
    return;
  }

  if (v === 3) {
    // Push through a confident answer to the machinery underneath.
    const peel = ease(clamp((u - 0.20) / 0.55, 0, 1));
    const sc = 1 + peel * 2.6;
    g.save(); g.translate(cx, cy); g.scale(sc, sc); g.translate(-cx, -cy);
    g.globalAlpha = 1 - peel;
    glow(cx, cy, 300, C.gold, 0.6);
    fillRect(cx - 300, cy - 78, 600, 156, hex(C.gold, 0.16));
    g.strokeStyle = hex(C.gold, 0.8); g.lineWidth = 4;
    g.strokeRect(cx - 300, cy - 78, 600, 156);
    drawText('0.94', cx, cy, 92, C.gold, 1, { track: 6 });
    g.restore();

    g.globalAlpha = peel;
    for (let i = 0; i < 4; i++) {                      // distributions beneath
      const y0 = H * 0.30 + i * 170;
      g.beginPath();
      for (let k = 0; k <= 80; k++) {
        const x = W * 0.14 + k * (W * 0.72 / 80);
        const z = (x - W * (0.3 + i * 0.14)) / 150;
        const y = y0 - Math.exp(-z * z / 2) * 110;
        k ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.strokeStyle = hex([C.cyan, C.violet, C.amber, C.cyan][i], 0.7); g.lineWidth = 3;
      g.stroke();
      for (let k = 0; k < 22; k++) {
        fillRect(W * 0.14 + k * 74, y0 + 14, 8, 6 + ((k * 37 + i * 11) % 30), hex(C.cyan, 0.35));
      }
    }
    g.globalAlpha = 1;
    vignette(0.62);
    return;
  }

  // v4 close on the face as understanding lands
  glow(W * 0.42, H * 0.44, 620, C.cyan, 0.20);
  glow(W * 0.62, H * 0.50, 420, C.gold, 0.24);
  const rnd = mulberry32(241);
  for (let i = 0; i < 40; i++) {                       // reflected maths in the lenses
    const x = W * 0.30 + rnd() * W * 0.44, y = H * 0.20 + rnd() * H * 0.5;
    drawText(['∑', 'σ', 'π', '∫', 'λ'][i % 5], x, y, 26, C.cyan, 0.16, { weight: 400, shadow: false });
  }
  const understand = ease(clamp((u - 0.35) / 0.45, 0, 1));
  g.save(); g.translate(W / 2, H * 0.56);
  g.fillStyle = hex('#070A16', 0.96);                  // head, close
  g.beginPath(); g.ellipse(0, 0, 300, 380, 0, 0, 7); g.fill();
  glow(-90, -60, 130, C.cyan, 0.5 + understand * 0.4); // lens reflections
  glow(90, -60, 130, C.cyan, 0.5 + understand * 0.4);
  g.strokeStyle = hex(C.cyan, 0.8); g.lineWidth = 6;
  g.beginPath(); g.arc(-90, -60, 78, 0, 7); g.arc(90, -60, 78, 0, 7); g.stroke();
  line(-12, -60, 12, -60, C.cyan, 6, 0.8);
  g.restore();
  vignette(0.62);
};

M.paths = (u, v, t) => {
  // Theory and application: two equally grand rails that converge.
  fillRect(0, 0, W, H, '#0B0E1A');
  const vy = H * 0.42;

  if (v === 1) {
    // Cross-cut: a proof completed, then the same shape running as code.
    const side = u < 0.5 ? 0 : 1;
    const su = (u * 2) % 1;
    if (side === 0) {
      fillRect(0, 0, W, H, '#2C2418');
      fillRect(W * 0.12, H * 0.14, W * 0.76, H * 0.62, '#3E3324');
      const steps = Math.floor(su * 7) + 1;
      for (let k = 0; k < steps; k++) {
        const y = H * 0.22 + k * 74;
        line(W * 0.18, y, W * 0.18 + 200 + (k * 97 % 380), y, C.chalk, 5, 0.7);
        if (k % 2) line(W * 0.18 + 60, y + 26, W * 0.18 + 320, y + 26, C.chalk, 3, 0.4);
      }
      figure(W * 0.80, H * 1.00, 420, '#171008', 0.85);
    } else {
      fillRect(0, 0, W, H, '#08101A');
      glow(W / 2, H * 0.44, 620, C.cyan, 0.22);
      const steps = Math.floor(su * 7) + 1;
      for (let k = 0; k < steps; k++) {                // the same shape, running
        const y = H * 0.22 + k * 74;
        line(W * 0.18, y, W * 0.18 + 200 + (k * 97 % 380), y, C.cyan, 5, 0.8);
        dot(W * 0.18 + 200 + (k * 97 % 380) + 24, y, 8, C.amber, 0.9);
      }
    }
    vignette(0.6);
    return;
  }

  const converge = v >= 2 ? ease(clamp(u / 0.65, 0, 1)) : 0;
  const sep = lerp(0.30, 0.0, converge);

  // Sky split warm/cool until the merge.
  const gr = g.createLinearGradient(0, 0, W, 0);
  gr.addColorStop(0, hex(C.gold, 0.10));
  gr.addColorStop(0.5, hex('#000000', 0));
  gr.addColorStop(1, hex(C.cyan, 0.10));
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  glow(W / 2, vy, 620, converge > 0.5 ? C.gold : C.chalk, 0.24);

  [[-1, C.gold, '#6B5334'], [1, C.cyan, '#1D4753']].forEach(([sd, col, deck]) => {
    const nearX = W / 2 + sd * W * sep + sd * W * 0.30;
    const farX = W / 2 + sd * W * sep * 0.28;
    g.fillStyle = hex(deck, 0.85);
    g.beginPath();
    g.moveTo(nearX - sd * 260, H); g.lineTo(nearX + sd * 260, H);
    g.lineTo(farX + sd * 46, vy); g.lineTo(farX - sd * 46, vy);
    g.closePath(); g.fill();
    // Rails and structures alongside.
    for (let i = 1; i <= 9; i++) {
      const z = i / 9;
      const x = lerp(nearX, farX, z), y = lerp(H * 0.98, vy, z), s = 1 - z * 0.86;
      const a = 0.7 * (1 - z * 0.6);
      if (sd < 0) {                                    // theory: carved stone
        fillRect(x - sd * 300 * s - 40 * s, y - 200 * s, 80 * s, 200 * s, hex('#E4D8BC', a));
        fillRect(x - sd * 300 * s - 60 * s, y - 216 * s, 120 * s, 20 * s, hex('#F2E9D2', a));
      } else {                                         // application: cyan lattice
        g.strokeStyle = hex(C.cyan, a); g.lineWidth = 2;
        g.strokeRect(x - sd * 300 * s - 50 * s, y - 210 * s, 100 * s, 210 * s);
        line(x - sd * 300 * s - 50 * s, y - 210 * s, x - sd * 300 * s + 50 * s, y, C.cyan, 2, a * 0.6);
      }
      line(x - 200 * s, y, x + 200 * s, y, col, 3 * s, a * 0.5);
    }
    glow(farX, vy, 200, col, 0.35);
  });

  if (v === 3) {
    const p = ease(u);
    student(W / 2, lerp(H * 0.99, H * 0.86, p * 0.5), lerp(360, 300, p), '#050810', 0.95);
    glow(W / 2 + 90, H * 0.72, 110, C.cyan, 0.6);      // app in hand
    poly(W / 2 + 90, H * 0.72, 30, 6, t, C.cyan, 0.9, false);
  }
  vignette(0.6);
};

M.globe = (u, v, t) => {
  // Campus opens out into a global industry.
  fillRect(0, 0, W, H, C.indigo);
  const cx = W / 2, cy = H * 0.46;

  if (v === 0) {
    // Walls dissolving; desks becoming distant city clusters.
    const open = ease(u);
    fillRect(0, 0, W, H, `rgba(60,44,28,${(1 - open) * 0.9})`);
    for (let i = 0; i < 5; i++) {
      const s = (1 - open) * (1 - i * 0.12);
      g.strokeStyle = hex('#C9A87C', 0.5 * (1 - open)); g.lineWidth = 4;
      g.strokeRect(W / 2 - W * 0.42 * s, H / 2 - H * 0.40 * s, W * 0.84 * s, H * 0.80 * s);
    }
    const rnd = mulberry32(257);
    for (let i = 0; i < 90; i++) {
      const x = rnd() * W, y = H * 0.2 + rnd() * H * 0.66;
      glow(x, y, 40 * open, C.cyan, 0.35 * open);
      dot(x, y, 3, C.cyan, 0.7 * open);
    }
    vignette(0.6);
    return;
  }

  if (v === 3) {
    // Close on the student meeting the camera's gaze.
    glow(cx, cy, 700, C.cyan, 0.16);
    const rnd = mulberry32(263);
    for (let i = 0; i < 60; i++) {                     // bokeh falling away
      dot(rnd() * W, rnd() * H, 10 + rnd() * 34, C.cyan, 0.07);
    }
    const push = 1 + ease(u) * 0.3;
    g.save(); g.translate(cx, H * 0.60); g.scale(push, push);
    glow(-230, -180, 320, C.cyan, 0.45);
    glow(240, -160, 300, C.gold, 0.4);
    g.fillStyle = '#060912';
    g.beginPath(); g.ellipse(0, 0, 250, 320, 0, 0, 7); g.fill();
    g.strokeStyle = hex(C.cyan, 0.7); g.lineWidth = 5;
    g.beginPath(); g.arc(-76, -50, 66, 0, 7); g.arc(76, -50, 66, 0, 7); g.stroke();
    line(-10, -50, 10, -50, C.cyan, 5, 0.7);
    g.restore();
    vignette(0.6);
    return;
  }

  // v1 globe with arcs, v2 capability token ring
  const R = 300;
  const app = ease(clamp(u / 0.35, 0, 1));
  const rot = t * 0.16;
  glow(cx, cy, 520 * app, C.cyan, 0.22);
  g.strokeStyle = hex(C.cyan, 0.55 * app); g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, R * app, 0, 7); g.stroke();
  for (let i = -3; i <= 3; i++) {                      // parallels
    const rr = Math.cos(i * 0.38) * R * app;
    g.beginPath(); g.ellipse(cx, cy + Math.sin(i * 0.38) * R * app, rr, rr * 0.20, 0, 0, 7); g.stroke();
  }
  for (let i = 0; i < 8; i++) {                        // meridians
    const ph = rot + i * Math.PI / 8;
    g.beginPath();
    g.ellipse(cx, cy, Math.abs(Math.cos(ph)) * R * app, R * app, 0, 0, 7);
    g.stroke();
  }
  // Collaboration arcs.
  const rnd = mulberry32(271);
  const arcs = ease(clamp((u - 0.2) / 0.5, 0, 1));
  for (let i = 0; i < 22; i++) {
    const a1 = rnd() * 7, a2 = rnd() * 7;
    const x1 = cx + Math.cos(a1) * R * 0.86, y1 = cy + Math.sin(a1) * R * 0.5;
    const x2 = cx + Math.cos(a2) * R * 0.86, y2 = cy + Math.sin(a2) * R * 0.5;
    g.strokeStyle = hex(C.cyan, 0.3 * arcs); g.lineWidth = 2;
    g.beginPath(); g.moveTo(x1, y1);
    g.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 - 220, x2, y2); g.stroke();
  }
  // Sri Lanka, lit warm.
  const sl = [cx + Math.cos(rot * 0.4 + 1.1) * R * 0.42, cy + 96];
  glow(sl[0], sl[1], 90, C.gold, 0.9 * app);
  dot(sl[0], sl[1], 11, '#FFF3D4', app);

  if (v === 2) {
    // Eleven capability tokens orbiting in three illumination waves.
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = t * 0.22 + i * Math.PI * 2 / n;
      const x = cx + Math.cos(a) * 640, y = cy + Math.sin(a) * 230;
      const dep = (Math.sin(a) + 1) / 2, sc = lerp(0.6, 1.15, dep);
      const wave = ease(clamp((u - (i % 3) * 0.16) / 0.3, 0, 1));
      if (wave <= 0) continue;
      glow(x, y, 90 * sc, C.amber, 0.34 * dep * wave);
      poly(x, y, 46 * sc, 6, Math.PI / 6, C.cyan, 0.9 * wave, false);
      poly(x, y, 30 * sc, 6, Math.PI / 6, C.amber, 0.4 * dep * wave, true);
    }
    figure(cx, H * 1.02, 300, '#04060E', 0.9);
  }
  vignette(0.6);
};

/* --- Act C --- */

M.fracture = (u, v, t) => {
  // The integrity beat. Cool, quiet, and sympathetic — never mocking.
  if (v === 0) {
    const cool = ease(u);                              // light shifts warm -> cool
    g.fillStyle = vgrad(0, H, [
      [0, `rgb(${lerp(46, 16, cool) | 0},${lerp(34, 22, cool) | 0},${lerp(22, 40, cool) | 0})`],
      [1, `rgb(${lerp(20, 8, cool) | 0},${lerp(15, 12, cool) | 0},${lerp(10, 24, cool) | 0})`],
    ]);
    g.fillRect(0, 0, W, H);
    glow(W * 0.5, H * 0.42, 520, cool > 0.5 ? C.cyan : C.gold, 0.26);
    const drop = ease(clamp(u / 0.45, 0, 1));          // the brief lands
    g.save();
    g.translate(W / 2, lerp(H * 0.20, H * 0.60, drop));
    g.rotate((1 - drop) * 0.24);
    fillRect(-300, -390, 600, 780, hex('#E7E1D2', 0.94));
    g.fillStyle = 'rgba(60,55,50,0.45)';
    for (let k = 0; k < 16; k++) g.fillRect(-250, -330 + k * 42, 420 - (k % 4) * 90, 9);
    g.restore();
    figure(W * 0.16, H * 1.04, 460, '#05070E', 0.8);
    vignette(0.62);
    return;
  }

  fillRect(0, 0, W, H, '#070A16');

  if (v === 1) {
    // Instant generation — genuinely dazzling, deliberately tempting.
    const p = ease(clamp(u / 0.55, 0, 1));
    glow(W / 2, H * 0.46, 900 * p, C.cyan, 0.5 * p);
    fillRect(W * 0.14, H * 0.12, W * 0.72, H * 0.72, hex('#0C1420', 0.95));
    const rows = Math.floor(p * 30);
    for (let k = 0; k < rows; k++) {
      const ind = (k % 5 === 2 || k % 5 === 3) ? 70 : 0;
      const wd = 140 + ((k * 149) % 700);
      const a = clamp((rows - k) / 6, 0.25, 1);
      fillRect(W * 0.17 + ind, H * 0.16 + k * 32, wd, 12, hex([C.cyan, C.amber, C.chalk][k % 3], 0.7 * a));
    }
    for (let k = 0; k < 30; k++) {                     // cascade sparkle
      const kp = (p * 30 - k);
      if (kp > 0 && kp < 2) glow(W * 0.17 + 300, H * 0.16 + k * 32, 120, C.cyan, 0.5);
    }
    vignette(0.6);
    return;
  }

  if (v === 2) {
    // Copied whole, untouched — and a hairline fracture appears.
    const slide = ease(clamp(u / 0.5, 0, 1));
    glow(W / 2, H * 0.46, 620, C.cyan, 0.18);
    g.strokeStyle = hex(C.cyan, 0.35); g.lineWidth = 3;
    g.strokeRect(W * 0.54, H * 0.18, W * 0.36, H * 0.60);
    drawText('SUBMISSION', W * 0.72, H * 0.13, 26, C.cyan, 0.5, { track: 4 });

    const bx = lerp(W * 0.10, W * 0.56, slide);
    fillRect(bx, H * 0.20, W * 0.32, H * 0.56, hex(C.cyan, 0.14));
    g.strokeStyle = hex(C.cyan, 0.6); g.lineWidth = 3;
    g.strokeRect(bx, H * 0.20, W * 0.32, H * 0.56);
    for (let k = 0; k < 14; k++) {
      fillRect(bx + 30, H * 0.23 + k * 36, 120 + ((k * 137) % 380), 10, hex(C.chalk, 0.4));
    }
    // The crack, propagating silently after it lands.
    const cr = clamp((u - 0.55) / 0.4, 0, 1);
    if (cr > 0) {
      g.strokeStyle = hex('#FF6B6B', 0.75); g.lineWidth = 3;
      g.beginPath();
      let px = bx + W * 0.05, py = H * 0.20;
      g.moveTo(px, py);
      const rnd = mulberry32(311);
      for (let k = 0; k < 14 * cr; k++) {
        px += (rnd() - 0.35) * 40; py += H * 0.56 / 14;
        g.lineTo(px, py);
      }
      g.stroke();
    }
    vignette(0.62);
    return;
  }

  // v3 the viva — isolated light, their own work now unreadable to them
  glow(W * 0.5, H * 0.30, 460, C.cyan, 0.24);
  fillRect(W * 0.28, H * 0.10, W * 0.44, H * 0.42, hex('#0D1626', 0.9));
  const blur = ease(clamp((u - 0.2) / 0.5, 0, 1));
  for (let k = 0; k < 12; k++) {
    const a = lerp(0.55, 0.10, blur);
    const wob = blur * 14;
    fillRect(W * 0.30 + (k % 3) * 22, H * 0.13 + k * 30 + Math.sin(k) * wob,
             120 + ((k * 113) % 380), 10, hex(C.cyan, a));
  }
  // A tight pool of light; darkness closing in.
  const close = ease(u);
  const gr = g.createRadialGradient(W / 2, H * 0.78, 100, W / 2, H * 0.78, lerp(900, 520, close));
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, 'rgba(0,0,0,0.92)');
  figure(W / 2, H * 0.99, 420, '#0B1020', 0.95);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  vignette(0.5);
};

M.chain = (u, v, t) => {
  // The correct workflow, and AI used as a tutor rather than a substitute.
  if (v === 1) {
    fillRect(0, 0, W, H, '#181206');
    glow(W * 0.5, H * 0.44, 760, C.gold, 0.26);
    fillRect(W * 0.52, H * 0.22, W * 0.36, H * 0.44, hex(C.cyan, 0.10));
    g.strokeStyle = hex(C.cyan, 0.45); g.lineWidth = 3;
    g.strokeRect(W * 0.52, H * 0.22, W * 0.36, H * 0.44);
    for (let k = 0; k < 7; k++) {
      fillRect(W * 0.55, H * 0.26 + k * 46, 110 + ((k * 97) % 340), 11, hex(C.cyan, 0.4));
    }
    // Rewriting it in their own hand.
    const write = ease(clamp((u - 0.25) / 0.6, 0, 1));
    fillRect(W * 0.10, H * 0.30, W * 0.32, H * 0.40, hex('#EFE7D5', 0.94));
    g.fillStyle = 'rgba(60,52,42,0.5)';
    for (let k = 0; k < 8; k++) {
      const full = 240 + ((k * 131) % 260);
      const shown = clamp(write * 8 - k, 0, 1) * full;
      g.fillRect(W * 0.12, H * 0.34 + k * 40, shown, 8);
    }
    figure(W * 0.47, H * 1.06, 420, '#100A04', 0.9);
    for (let i = 0; i < 8; i++) {                      // dialogue both ways
      const p = ((t * 0.55 + i / 8) % 1);
      const fwd = i % 2 === 0;
      const x = fwd ? lerp(W * 0.44, W * 0.52, p) : lerp(W * 0.52, W * 0.44, p);
      dot(x, H * 0.46 + Math.sin(p * 6 + i) * 34, 7, fwd ? C.gold : C.cyan, 0.8 * Math.sin(p * Math.PI));
    }
    vignette(0.58);
    return;
  }

  // Seven linked rings assembling into one continuous chain.
  fillRect(0, 0, W, H, '#1A1408');
  glow(W / 2, H * 0.46, 820, C.gold, 0.24);
  const n = 7, y = H * 0.46;
  for (let i = 0; i < n; i++) {
    const at = i * 0.115;
    const p = ease(clamp((u - at) / 0.20, 0, 1));
    if (p <= 0) continue;
    const x = W * 0.13 + i * (W * 0.74 / (n - 1));
    const arch = Math.sin(i / (n - 1) * Math.PI) * 90;
    const yy = y - arch;
    const lock = clamp((u - at - 0.14) * 12, 0, 1);    // bright pulse on locking in
    glow(x, yy, 140 * p, C.gold, (0.30 + lock * 0.5) * p);
    g.save();
    g.translate(x, yy); g.rotate(i % 2 ? 0.5 : 0);
    g.strokeStyle = hex(C.gold, 0.95 * p); g.lineWidth = 13;
    g.beginPath(); g.ellipse(0, 0, 74 * p, 50 * p, 0, 0, 7); g.stroke();
    g.strokeStyle = hex('#FFF6DE', 0.55 * p * lock); g.lineWidth = 5;
    g.beginPath(); g.ellipse(0, 0, 74 * p, 50 * p, 0, 0, 7); g.stroke();
    g.restore();
  }
  vignette(0.58);
};

M.tower = (u, v, t) => {
  // The portfolio, built tier by tier across four years.
  fillRect(0, 0, W, H, '#0A0C1C');
  const cx = W / 2;
  const tiers = [
    { w: 620, h: 150, col: C.gold },
    { w: 540, h: 145, col: C.cyan },
    { w: 470, h: 140, col: C.violet },
    { w: 380, h: 150, col: C.gold },
  ];
  const built = v >= 4 ? 4 : v + 1;
  const rise = v >= 4 ? 1 : ease(u);

  // Scale down and lift as the tower grows so it always fits frame.
  const sc = v === 4 ? lerp(1, 0.34, ease(u)) : lerp(1.05, 0.86, built / 4);
  const oy = v === 4 ? lerp(0, H * 0.20, ease(u)) : 0;
  g.save(); g.translate(cx, H * 0.86 + oy); g.scale(sc, sc); g.translate(-cx, -H * 0.86);

  let baseY = H * 0.86;
  for (let i = 0; i < built; i++) {
    const t2 = tiers[i];
    const p = i === built - 1 && v < 4 ? rise : 1;
    if (p <= 0) break;
    const h = t2.h * p;
    glow(cx, baseY - h / 2, 340 * p, t2.col, 0.26 * p);
    fillRect(cx - t2.w / 2, baseY - h, t2.w, h, hex(t2.col, 0.17 * p));
    g.strokeStyle = hex(t2.col, 0.8 * p); g.lineWidth = 4;
    g.strokeRect(cx - t2.w / 2, baseY - h, t2.w, h);
    // Interlocking blocks inside each tier.
    const cols = Math.max(3, Math.floor(t2.w / 90));
    for (let k = 0; k < cols; k++) {
      const bx = cx - t2.w / 2 + 14 + k * ((t2.w - 28) / cols);
      const bh = (h - 28) * (0.4 + ((k * 37) % 60) / 100);
      fillRect(bx, baseY - 14 - bh, (t2.w - 28) / cols - 12, bh, hex(t2.col, 0.32 * p));
    }
    baseY -= h + 12;
  }

  // Version-control commit graph branching off tier 2.
  if (built >= 2) {
    const gp = ease(clamp(v === 1 ? (u - 0.4) / 0.5 : 1, 0, 1));
    let gx = cx + 320, gy = H * 0.72;
    for (let k = 0; k < 9 * gp; k++) {
      const nx = gx + 46, ny = gy - (k % 3 === 0 ? 40 : 0);
      line(gx, gy, nx, ny, C.cyan, 3, 0.6);
      dot(nx, ny, 8, C.cyan, 0.9);
      if (k % 4 === 2) { line(nx, ny, nx + 40, ny + 56, C.cyan, 2, 0.4); dot(nx + 40, ny + 56, 6, C.amber, 0.8); }
      gx = nx; gy = ny;
    }
  }
  // Dashboards and training curves orbiting tier 3.
  if (built >= 3) {
    for (let i = 0; i < 3; i++) {
      const a = t * 0.35 + i * 2.1;
      const x = cx + Math.cos(a) * 420, y = H * 0.50 + Math.sin(a) * 70;
      fillRect(x - 62, y - 44, 124, 88, hex(C.violet, 0.16));
      g.strokeStyle = hex(C.violet, 0.6); g.lineWidth = 2;
      g.strokeRect(x - 62, y - 44, 124, 88);
      g.strokeStyle = hex(C.amber, 0.8); g.lineWidth = 3; g.beginPath();
      for (let k = 0; k <= 12; k++) {
        const px = x - 50 + k * 8.4, py = y + 30 - (1 - Math.exp(-k / 3)) * 60;
        k ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.stroke();
    }
  }
  // Crown: the live final-year project, with docs and research in orbit.
  if (built >= 4) {
    const crown = v === 3 ? ease(clamp((u - 0.3) / 0.5, 0, 1)) : 1;
    glow(cx, baseY - 40, 320 * crown, C.gold, 0.6 * crown);
    poly(cx, baseY - 40, 70 * crown, 6, t * 0.4, C.gold, 0.95 * crown, false);
    dot(cx, baseY - 40, 26 * crown, '#FFF6DE', crown);
    for (let i = 0; i < 6; i++) {
      const a = t * 0.5 + i * Math.PI / 3;
      const x = cx + Math.cos(a) * 210 * crown, y = baseY - 40 + Math.sin(a) * 80 * crown;
      g.save(); g.translate(x, y); g.rotate(Math.sin(t + i) * 0.2);
      fillRect(-26, -34, 52, 68, hex(C.chalk, 0.5 * crown));
      g.restore();
    }
  }
  g.restore();

  if (v === 4) {
    // Scale flip: the whole thing rests in their palm.
    const rev = ease(clamp((u - 0.25) / 0.5, 0, 1));
    g.fillStyle = hex('#0A0F1E', 0.95 * rev);
    g.beginPath();
    g.moveTo(cx - 520, H * 1.02);
    g.quadraticCurveTo(cx, H * 0.86, cx + 520, H * 1.02);
    g.lineTo(cx + 520, H); g.lineTo(cx - 520, H);
    g.closePath(); g.fill();
    glow(cx, H * 0.90, 420 * rev, C.gold, 0.30 * rev);
    figure(W * 0.16, H * 1.08, 560, '#050813', 0.55 * rev);
  }
  vignette(0.6);
};

M.qubit = (u, v, t) => {
  // Classical certainty giving way to quantum superposition.
  fillRect(0, 0, W, H, '#0A0A1E');
  const cx = W / 2, cy = H * 0.46;

  if (v === 0) {
    // A classical bit flipping crisply between two discrete states.
    const flips = Math.floor(t * 1.6);
    const state = flips % 2;
    const settle = clamp((t * 1.6) % 1 * 6, 0, 1);
    glow(cx, cy, 380, '#DDE8FF', 0.24);
    g.save(); g.translate(cx, cy);
    g.rotate(state ? Math.PI * 0.5 * settle : Math.PI * 0.5 * (1 - settle) + Math.PI * 0.5);
    g.fillStyle = '#C6D2E4';
    g.fillRect(-130, -130, 260, 260);
    g.strokeStyle = '#8C9CB4'; g.lineWidth = 6; g.strokeRect(-130, -130, 260, 260);
    g.restore();
    drawText(state ? '1' : '0', cx, cy, 130, '#0A0A1E', 0.9, { shadow: false });
    vignette(0.6);
    return;
  }

  if (v === 2) {
    // A quantum circuit: parallel wires, gates, entangling links.
    const app = ease(clamp(u / 0.35, 0, 1));
    const rows = 5, y0 = H * 0.26, dy = 130;
    const drift = (t * 60) % 260;
    for (let r = 0; r < rows; r++) {
      const y = y0 + r * dy;
      line(0, y, W, y, C.cyan, 3, 0.5 * app);
      for (let k = -1; k < 9; k++) {
        const x = k * 260 + 130 - drift;
        if (x < -100 || x > W + 100) continue;
        if ((k + r) % 3 === 0) {
          fillRect(x - 44, y - 44, 88, 88, hex(C.violet, 0.30 * app));
          g.strokeStyle = hex(C.violet, 0.9 * app); g.lineWidth = 3;
          g.strokeRect(x - 44, y - 44, 88, 88);
          drawText(['H', 'X', 'Z', 'T'][(k + r) % 4], x, y, 42, C.chalk, 0.9 * app, { shadow: false });
        } else if ((k + r) % 5 === 1 && r < rows - 1) {
          line(x, y, x, y + dy, C.amber, 4, 0.8 * app);   // entangling link
          dot(x, y, 12, C.amber, 0.95 * app);
          dot(x, y + dy, 12, C.amber, 0.95 * app);
        }
      }
    }
    vignette(0.6);
    return;
  }

  if (v === 3 || v === 4) {
    // The dilution refrigerator: concentric gold tiers descending into cold.
    const crane = v === 3 ? ease(u) : 0.5;
    g.save(); g.translate(cx, lerp(H * 0.10, H * -0.10, crane));
    const tiers = 6;
    for (let i = 0; i < tiers; i++) {
      const y = H * 0.10 + i * 150;
      const w = 560 - i * 74;
      glow(0, y, 260, C.gold, 0.16);
      fillRect(-w / 2, y, w, 30, hex('#E8B45C', 0.9));
      g.strokeStyle = hex('#B98436', 0.9); g.lineWidth = 3;
      g.strokeRect(-w / 2, y, w, 30);
      for (let k = -6; k <= 6; k++) {                    // coaxial cable bundles
        const x = k * (w / 14);
        line(x, y + 30, x + (Math.sin(k + i) * 12), y + 150, '#C9924A', 3, 0.55);
      }
    }
    // Cold vapour drifting off the lower stages.
    const rnd = mulberry32(331);
    for (let i = 0; i < 30; i++) {
      const ph = (t * 0.3 + rnd()) % 1;
      dot((rnd() - 0.5) * 600, H * 0.86 + ph * 240, 20 + rnd() * 40, '#BFE6F5', 0.05);
    }
    g.restore();
    if (v === 4) {
      figure(W * 0.5, H * 1.02, 320, '#04060E', 0.95);
      glow(W * 0.5, H * 0.90, 200, C.gold, 0.22);
    }
    vignette(0.62);
    return;
  }

  // v1 the cube dissolving into a superposition sphere
  const morph = ease(clamp((u - 0.10) / 0.5, 0, 1));
  glow(cx, cy, 420, C.violet, 0.34);
  if (morph < 1) {
    g.save(); g.globalAlpha = 1 - morph; g.translate(cx, cy); g.rotate(morph * 1.2);
    g.fillStyle = '#C6D2E4'; g.fillRect(-130, -130, 260, 260);
    g.restore();
  }
  if (morph > 0) {
    const R = 190 * morph;
    const sg = g.createRadialGradient(cx - 50, cy - 50, 10, cx, cy, R);
    sg.addColorStop(0, hex('#FFFFFF', 0.55 * morph));
    sg.addColorStop(0.5, hex(C.violet, 0.34 * morph));
    sg.addColorStop(1, hex(C.cyan, 0.12 * morph));
    g.fillStyle = sg; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    g.strokeStyle = hex(C.cyan, 0.7 * morph); g.lineWidth = 3;
    g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
    for (let i = 0; i < 5; i++) {                        // interference rings
      g.strokeStyle = hex(C.violet, 0.30 * morph); g.lineWidth = 2;
      g.beginPath();
      g.ellipse(cx, cy, R, R * Math.abs(Math.cos(t * 0.5 + i * 0.7)), 0, 0, 7);
      g.stroke();
    }
    // Precessing state vector.
    const a = t * 0.8;
    const ex = cx + Math.cos(a) * R * 0.8, ey = cy - Math.abs(Math.sin(a * 0.6)) * R * 0.7;
    line(cx, cy, ex, ey, C.amber, 5, 0.95 * morph);
    dot(ex, ey, 13, C.amber, morph);
    drawText('0', cx, cy - R - 40, 34, C.cyan, 0.6 * morph, { shadow: false });
    drawText('1', cx, cy + R + 40, 34, C.cyan, 0.6 * morph, { shadow: false });
  }
  vignette(0.62);
};

M.horizon = (u, v, t) => {
  // The payoff: campus warmth behind, luminous landscape ahead.
  const dawn = vgrad(0, H, [
    [0, '#101A3C'], [0.34, '#3C4A7A'], [0.58, '#B87F55'], [0.74, '#F0B368'], [1, '#2A2340'],
  ]);
  g.fillStyle = dawn; g.fillRect(0, 0, W, H);
  const hy = H * 0.66;
  glow(W * 0.5, hy, 760, C.gold, 0.66);
  dot(W * 0.5, hy, 76, '#FFF6DE', 0.9);

  // Warm campus behind (left), luminous tech landscape ahead (right).
  g.fillStyle = '#241A2E';
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += 30) {
    g.lineTo(x, hy + 30 + Math.sin(x / 240) * 22 + Math.sin(x / 70) * 7);
  }
  g.lineTo(W, H); g.closePath(); g.fill();

  const rnd = mulberry32(347);
  for (let i = 0; i < 46; i++) {                        // the technological horizon
    const x = W * 0.5 + rnd() * W * 0.55;
    const hgt = 40 + rnd() * 300;
    const a = 0.10 + rnd() * 0.22;
    fillRect(x, hy - hgt, 16 + rnd() * 34, hgt, hex(C.cyan, a));
    if (rnd() > 0.6) glow(x, hy - hgt, 60, C.cyan, 0.18);
  }
  for (let i = 0; i < 18; i++) {                        // campus rooftops behind
    const x = rnd() * W * 0.46;
    const y = hy + 10;
    g.fillStyle = hex('#4A2C1E', 0.65);
    g.beginPath(); g.moveTo(x - 60, y); g.lineTo(x, y - 30); g.lineTo(x + 60, y);
    g.closePath(); g.fill();
  }

  // Light pulse sweeping the landscape (cues the FIN-03 word beats).
  if (v === 1) {
    const sw = (t * 0.9) % 1;
    const gx = sw * W * 1.4 - W * 0.2;
    const gr = g.createLinearGradient(gx - 260, 0, gx + 260, 0);
    gr.addColorStop(0, hex(C.cyan, 0));
    gr.addColorStop(0.5, hex(C.cyan, 0.16));
    gr.addColorStop(1, hex(C.cyan, 0));
    g.fillStyle = gr; g.fillRect(gx - 260, hy - 380, 520, 420);
  }

  if (v === 2) {
    // Close on the student, turning to camera.
    g.save(); g.translate(W / 2, H * 0.66); g.scale(1 + ease(u) * 0.2, 1 + ease(u) * 0.2);
    glow(-210, -200, 300, C.gold, 0.5);
    glow(220, -190, 280, C.cyan, 0.42);
    g.fillStyle = '#221A2C';
    g.beginPath(); g.ellipse(0, -60, 230, 300, 0, 0, 7); g.fill();
    g.strokeStyle = hex(C.gold, 0.7); g.lineWidth = 5;
    g.beginPath(); g.arc(-72, -110, 62, 0, 7); g.arc(72, -110, 62, 0, 7); g.stroke();
    line(-10, -110, 10, -110, C.gold, 5, 0.7);
    g.strokeStyle = hex(C.chalk, 0.5); g.lineWidth = 5;   // faint smile
    g.beginPath(); g.arc(0, -10, 54, 0.3, Math.PI - 0.3); g.stroke();
    g.restore();
    vignette(0.55);
    return;
  }

  if (v === 5) {
    // Drift up into pure light.
    const up = ease(u);
    g.fillStyle = hex('#FFF8E8', 0.95 * up);
    g.fillRect(0, 0, W, H);
    glow(W / 2, H * 0.5, 900, C.gold, 0.5 * (1 - up));
    return;
  }

  // Figure placement per variant.
  const hz = { 0: [0.50, 0.86, 260], 1: [0.50, 0.90, 300], 3: [0.50, 0.90, 300], 4: [0.50, 0.80, 90] }[v];
  if (hz) {
    let [fx, fy, fh] = hz;
    if (v === 3) {                                       // the final walk away
      const p = ease(u);
      fy = lerp(0.94, 0.74, p); fh = lerp(340, 86, p);
      // Path lighting up beneath each step.
      for (let k = 0; k < 12; k++) {
        const kp = k / 12;
        const a = clamp(p * 1.6 - kp, 0, 1) * 0.4;
        const wdt = lerp(300, 40, kp);
        fillRect(W / 2 - wdt / 2, lerp(H * 0.98, hy + 20, kp), wdt, 8, hex(C.gold, a));
      }
    }
    if (v === 0) {                                       // crane over the shoulder
      fy = lerp(0.94, 0.86, ease(u));
      fh = lerp(360, 260, ease(u));
    }
    student(W * fx, H * fy, fh, '#1A1226', 0.95);
    glow(W * fx, H * fy - fh * 0.4, fh * 0.7, C.gold, 0.18);
  }
  vignette(0.55);
};

M.endcard = (u, v) => {
  fillRect(0, 0, W, H, '#000000');
  if (v === 0) {
    const fade = 1 - ease(clamp(u / 0.35, 0, 1));
    g.fillStyle = hex('#FFF8E8', 0.9 * fade); g.fillRect(0, 0, W, H);
    glow(W / 2, H / 2, 620, C.gold, 0.20 * (1 - ease(clamp(u / 0.5, 0, 1))));
  } else {
    const out = ease(clamp((u - 0.15) / 0.6, 0, 1));
    glow(W / 2, H / 2, 500, C.gold, 0.12 * (1 - out));
  }
};

/* ================= composition ================= */

function shotAt(t) {
  const S = DATA.shots;
  let lo = 0, hi = S.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (S[mid].start <= t) lo = mid; else hi = mid - 1;
  }
  return S[lo];
}

function cueAt(t) {
  for (const c of DATA.cues) {
    // Hold the caption slightly past the spoken end so it reads comfortably.
    if (t >= c.start - 0.15 && t <= c.end + 0.35) return c;
  }
  return null;
}

/** Render one frame at absolute time t. Pure function of t. */
function renderAt(t, opts = {}) {
  const total = DATA.runtime;
  t = clamp(t, 0, total);
  const sh = shotAt(t);
  const u = clamp((t - sh.start) / sh.dur, 0, 1);
  const [mod, variant, textMode] = DATA.viz[sh.id] || ['horizon', 0];

  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  (M[mod] || M.horizon)(u, variant, t);

  // Cross-dissolve into each shot: a short mix rather than a hard cut.
  const CUT = 0.22;
  if (u < CUT / sh.dur && sh.start > 0) {
    g.fillStyle = `rgba(0,0,0,${(1 - u * sh.dur / CUT) * 0.55})`;
    g.fillRect(0, 0, W, H);
  }

  onscreen(sh.onscreen, u, sh.dur, textMode);

  grain(Math.round(t * 24), 0.045);
  bars();

  const cue = cueAt(t);
  if (cue) {
    const inA  = clamp((t - (cue.start - 0.15)) / 0.2, 0, 1);
    const outA = clamp(((cue.end + 0.35) - t) / 0.25, 0, 1);
    subtitle(cue.text, Math.min(inA, outA));
  }

  // Act fades at the head and tail of the film.
  if (t < 1.2) { g.fillStyle = `rgba(0,0,0,${1 - t / 1.2})`; g.fillRect(0, 0, W, H); }
  if (t > total - 2.4) {
    g.fillStyle = `rgba(0,0,0,${clamp((t - (total - 2.4)) / 2.4, 0, 1)})`;
    g.fillRect(0, 0, W, H);
  }

  if (opts.hud) {
    const tc = `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
    drawText(`${sh.id}   ${tc}`, 40, 128, 26, C.chalk, 0.55, { align: 'left', weight: 400 });
  }
}

window.renderAt = renderAt;
window.__ready = true;
