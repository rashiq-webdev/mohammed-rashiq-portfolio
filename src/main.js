// Boot, orchestration, the frame loop.
//
// Order of operations matters here: the page must sit on TRUE black until the
// fonts, textures and the portrait are ready, otherwise the sequence starts
// before its main visual is available.

import { Stage } from './gl/stage.js';
import { computeLayout } from './scene/layout.js';
import { buildWord, fontsReady } from './scene/type.js';
import { Furniture } from './scene/furniture.js';
import { sample, letterOrder, CUES, T } from './scene/timeline.js';
import { damp, clamp } from './lib/ease.js';
import { initUniverse } from './scene2/boot2.js';
import { initChrono } from './scene3/boot3.js';
import { initGallery } from './scene4/boot4.js';
import { initFinale } from './scene6/boot6.js';

// a cinematic page manages its own positions; the browser restoring an old
// scroll offset mid-boot yanks the visitor (and any scripted anchor) around
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

const MIN_BLACK = 620;          // the darkness must be felt, even on a fast line

const root = document.documentElement;
const boot = document.getElementById('boot');
const bootFill = document.getElementById('bootFill');

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const app = {
  stage: null,
  furniture: null,
  clips: {},
  layout: null,
  word: null,
  order: [],
  t0: 0,
  fired: new Set(),
  pointer: { x: 0, y: 0, tx: 0, ty: 0 },
  running: false,
  portrait: null,
};

// --------------------------------------------------------------------------

async function main() {
  const canvas = document.getElementById('stage');
  app.stage = new Stage(canvas);
  app.furniture = new Furniture(document);

  if (!app.stage.ok) return degrade('WebGL unavailable');

  const steps = 3;
  let done = 0;
  const tick = () => { bootFill.style.width = `${(++done / steps) * 100}%`; };

  const startedAt = performance.now();

  await Promise.all([
    fontsReady().then(tick),
    app.stage.loadTextures({
      grunge: 'public/tex/grunge.png',
      grain: 'public/tex/grain.png',
    }).then(tick),
  ]);

  layout();
  window.addEventListener('resize', debounce(layout, 140));
  window.addEventListener('orientationchange', () => setTimeout(layout, 220));
  const portrait = document.querySelector('.hero-portrait');
  if (portrait instanceof HTMLVideoElement && await portraitReady(portrait)) {
    app.portrait = portrait;
    portrait.pause();
    portrait.currentTime = 0;
    setupPortraitLayers(portrait);
    layout();
    app.poses = await Promise.race([loadPoses(portrait.currentSrc), timeout(PORTRAIT_TIMEOUT)]);
    // the clip loads but its poses could not be lifted: stand him in place
    if (!app.poses) settlePortraitStill();
  } else {
    // No playable clip (unsupported codec, failed request, slow line): never
    // hold the page on black for it. The masked poster stands in, in place.
    settlePortraitStill();
  }
  tick();
  const held = performance.now() - startedAt;
  if (held < MIN_BLACK) await wait(MIN_BLACK - held);

  // the later scenes build while the hero plays, so scrolling into them is
  // instant; each one runs only while it is actually on screen
  initUniverse().then((u) => { app.universe = u; })
    .catch((e) => console.warn('[gireesh] universe unavailable:', e.message));
  initChrono().then((c) => { app.chrono = c; })
    .catch((e) => console.warn('[gireesh] chrono unavailable:', e.message));
  initGallery().then((g) => { app.gallery = g; })
    .catch((e) => console.warn('[gireesh] gallery unavailable:', e.message));
  initFinale().then((f) => { app.finale = f; })
    .catch((e) => console.warn('[gireesh] finale unavailable:', e.message));

  begin();
}

// --------------------------------------------------------------------------
// The portrait walk.
//
// The supplied clip is not footage of a walk: it is four still poses, each
// held for three quarters of a second. Poses 1, 2 and 4 all have the SAME leg
// forward and only pose 3 has the other, so played in file order he takes one
// step and then shuffles. The clip is therefore used only as a source of
// poses, and the walk itself is built here:
//   - the poses are re-ordered so the legs strictly alternate, at a natural
//     cadence, with a short dissolve through each stride instead of a cut;
//   - the body rises and falls once per step and leans over the planted leg,
//     pivoting at the feet so the shoes stay on the ground;
//   - he approaches the camera the whole time and settles on pose 1.
//
// Two canvases show the same picture: one BEHIND the WebGL canvas (so the
// wordmark covers him) and one in FRONT. Cross-fading the front one in is what
// carries him through the name without a one-frame jump between depths.

const WALK_PASSES = 4;          // the clip repeats its four poses four times
const POSE_COUNT = 4;
// pose indices, one per step: left-leg poses (0, 1, 3) alternate with the
// only right-leg pose (2); it ends on pose 0, the one the hold is tuned for
const STEPS = [0, 2, 1, 2, 3, 2, 1, 2, 0];
const STEP_SECONDS = 0.56;      // ~107 steps a minute: an unhurried walk
const STRIDE_BLEND = 0.34;      // share of a step spent dissolving to the next pose
const BOB = 0.011;              // rise at mid-stride, as a fraction of his height
const LEAN_DEG = 0.7;           // sway over the planted leg
const APPROACH_FROM = 0.58;     // starting scale; he reaches 1 at the hold
const FRONT_FROM = 0.10;        // walk progress where the front layer starts...
const FRONT_TO = 0.55;          // ...and where he is fully in front of the name
const PLATE_OUT = 0.5;          // seconds for the plate to clear / return
const PLATE_IN = 0.7;
const PORTRAIT_TIMEOUT = 8000;

const once = (el, type) => new Promise((r) => el.addEventListener(type, r, { once: true }));
const timeout = (ms) => new Promise((r) => setTimeout(() => r(null), ms));

/** Resolves true once the clip can be drawn, false if it never will be. */
function portraitReady(video) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve(true);
  if (video.error) return Promise.resolve(false);
  return new Promise((resolve) => {
    const sources = [...video.querySelectorAll('source')];
    let timer = 0;
    const finish = (ok) => {
      clearTimeout(timer);
      video.removeEventListener('loadeddata', onOk);
      video.removeEventListener('error', onFail);
      sources.forEach((s) => s.removeEventListener('error', onFail));
      resolve(ok);
    };
    const onOk = () => finish(true);
    const onFail = () => finish(false);
    video.addEventListener('loadeddata', onOk);
    video.addEventListener('error', onFail);
    // a failed <source> reports on the source element, not on the video
    sources.forEach((s) => s.addEventListener('error', onFail));
    timer = setTimeout(onFail, PORTRAIT_TIMEOUT);
  });
}

/**
 * Lift the four poses out of the clip as bitmaps. The clip is read through a
 * blob so it can be seeked even on a static host without Range support.
 * Resolves null if anything goes wrong; the caller falls back to a still.
 */
async function loadPoses(src) {
  let url = '';
  try {
    const blob = await (await fetch(src)).blob();
    url = URL.createObjectURL(blob);
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = url;
    await once(v, 'loadeddata');
    const hold = v.duration / WALK_PASSES / POSE_COUNT;
    const poses = [];
    for (let i = 0; i < POSE_COUNT; i++) {
      const seeked = once(v, 'seeked');
      v.currentTime = (i + 0.5) * hold;      // the middle of each held pose
      await seeked;
      poses.push(await createImageBitmap(v));
    }
    return poses;
  } catch (e) {
    console.warn('[portrait] poses unavailable:', e.message);
    return null;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

function setupPortraitLayers(video) {
  app.portraitLayers = [...document.querySelectorAll('.hero-portrait-back, .hero-portrait-front')]
    .filter((c) => c instanceof HTMLCanvasElement)
    .map((c) => {
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      return c.getContext('2d');
    });
  // the glasses ride on both layers, so they are covered by the wordmark
  // exactly where the figure behind it is
  const overlay = document.querySelector('.portrait-overlay');
  if (overlay && !document.querySelector('.portrait-overlay--front')) {
    const twin = overlay.cloneNode(true);
    twin.classList.add('portrait-overlay--front');
    // the twin reuses the original's gradient defs; duplicate ids are invalid
    twin.querySelector('defs')?.remove();
    overlay.after(twin);
  }
}

/** The finished composition with no motion: full size, in front, no glasses. */
function settlePortraitStill() {
  root.classList.add('is-portrait-still');
  if (app.stage) app.stage.backgroundAlpha = 1;
}

function startPortraitWalk(now) {
  if (reduced || app.walk || !app.poses || !app.portraitLayers?.length) return;
  app.walk = { startedAt: now, frontAt: 0, held: false, done: false, drawn: '' };
  root.style.setProperty('--portrait-approach', `${APPROACH_FROM}`);
  root.style.setProperty('--portrait-front', '0');
  drawPose(STEPS[0], STEPS[0], 0);
  root.classList.add('is-portrait-walking');
}

/** Runs every frame while the walk is live. */
function stepPortraitWalk(now) {
  const walk = app.walk;
  if (!walk || walk.done) return;

  const stepCount = STEPS.length - 1;
  const elapsed = Math.max(0, now - walk.startedAt) / 1000;
  const at = Math.min(elapsed / STEP_SECONDS, stepCount);   // in steps
  const k = Math.min(Math.floor(at), stepCount - 1);
  const p = at - k;                                         // 0..1 through this step
  const progress = at / stepCount;

  if (!walk.held) {
    // the stride: hold the planted pose, then dissolve to the next one
    const b = clamp((p - (1 - STRIDE_BLEND)) / STRIDE_BLEND);
    drawPose(STEPS[k], STEPS[k + 1], b * b * (3 - 2 * b));

    // weight: up over the planted leg at mid-stride, down as the next foot
    // lands, and a lean that swaps sides with every step
    const settle = 1 - clamp(at - (stepCount - 1));         // eases out on the last step
    const bob = 1 + BOB * Math.sin(Math.PI * p) * settle;
    const side = k % 2 ? -1 : 1;
    const lean = LEAN_DEG * side * Math.sin(Math.PI * p) * settle;
    root.style.setProperty('--portrait-bob', bob.toFixed(4));
    root.style.setProperty('--portrait-lean', `${lean.toFixed(3)}deg`);
    root.style.setProperty('--portrait-approach',
      `${APPROACH_FROM + progress * (1 - APPROACH_FROM)}`);
  }

  // cross-fade from behind the wordmark to in front of it
  const f = clamp((progress - FRONT_FROM) / (FRONT_TO - FRONT_FROM));
  const front = f * f * (3 - 2 * f);
  root.style.setProperty('--portrait-front', front.toFixed(3));
  if (front >= 1 && !walk.frontAt) walk.frontAt = now;

  // the plate clears as he appears and returns once he is fully in front
  app.stage.backgroundAlpha = walk.frontAt
    ? clamp((now - walk.frontAt) / (PLATE_IN * 1000))
    : 1 - clamp(elapsed / PLATE_OUT);

  if (!walk.held && at >= stepCount) {
    walk.held = true;
    drawPose(STEPS[stepCount], STEPS[stepCount], 0);
    root.style.setProperty('--portrait-approach', '1');
    root.style.setProperty('--portrait-bob', '1');
    root.style.setProperty('--portrait-lean', '0deg');
    root.classList.add('is-portrait-held', 'is-glasses-removing');
  }
  if (walk.held && app.stage.backgroundAlpha >= 1) walk.done = true;
}

/** Paint pose `from` dissolving into pose `to` (blend 0..1) on both layers. */
function drawPose(from, to, blend) {
  const key = `${from}:${to}:${blend.toFixed(3)}`;
  if (app.walk.drawn === key) return;
  app.walk.drawn = key;
  for (const ctx of app.portraitLayers) {
    const { width, height } = ctx.canvas;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, width, height);
    if (blend <= 0 || from === to) {
      ctx.drawImage(app.poses[from], 0, 0, width, height);
      continue;
    }
    // additive, so the two weights sum to one and his body never goes
    // see-through half way through the dissolve
    ctx.globalAlpha = 1 - blend;
    ctx.drawImage(app.poses[from], 0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = blend;
    ctx.drawImage(app.poses[to], 0, 0, width, height);
  }
}

function begin() {
  boot.classList.add('is-done');
  root.classList.remove('is-booting');
  app.t0 = performance.now();
  app.running = true;
  bindPointer();

  // ?t=4.2 starts the sequence part-way through, and ?t=end lands on the
  // settled composition. Purely a review aid for tuning a single beat without
  // sitting through the whole opening each time.
  const q = new URLSearchParams(location.search).get('t');
  if (q !== null) {
    const at = q === 'end' ? T.settled : parseFloat(q);
    if (Number.isFinite(at)) {
      app.t0 = performance.now() - at * 1000;
      for (const [when, name] of CUES) {
        if (at >= when) { app.fired.add(name); root.classList.add(`is-${name}`); }
      }
    }
  }
  if (reduced) {
    // Honour the preference fully: land on the finished composition and hold it
    // still, with the portrait already in place.
    app.t0 = performance.now() - T.settled * 1000;
    for (const [, name] of CUES) root.classList.add(`is-${name}`);
    settlePortraitStill();
    renderStill();
    window.addEventListener('resize', debounce(renderStill, 160));
    return;
  }
  requestAnimationFrame(frame);
}

// --------------------------------------------------------------------------

function layout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const L = computeLayout(w, h);
  app.layout = L;
  app.stage.resize(L);

  // Keep the same feet anchor as the source compositor while giving the
  // walking full-body video enough height to read clearly in the hero.
  let portraitHeight = Math.max(L.hero.h * 0.8, h * 0.53);
  if (L.portrait) {
    // On a phone the word is short and he is as wide as five of its letters,
    // so at full height his chest blots out the middle of the name. Size him
    // so his shoulders (18.5% down the frame) stop at the baseline: only his
    // head rises into the gap between the two names.
    portraitHeight = Math.min(portraitHeight, (L.hero.feet - L.word.baseline) / (1 - 0.185));
  }
  root.style.setProperty('--portrait-top', `${L.hero.feet - portraitHeight}px`);
  root.style.setProperty('--portrait-height', `${portraitHeight}px`);
  if (app.portrait?.videoWidth && app.portrait?.videoHeight) {
    root.style.setProperty('--portrait-width', `${portraitHeight * app.portrait.videoWidth / app.portrait.videoHeight}px`);
  }

  const capPx = Math.round(L.word.capH * L.dpr);
  if (!app.word || Math.abs(app.word.capPx - capPx) > 2) {
    const word = buildWord(capPx, app.stage.maxTexture);
    word.capPx = capPx;
    app.word = word;
    app.stage.setWord(word);
    app.order = letterOrder(word.letters);
  }
  // He stands in the space between the two names, so at the hold he parts the
  // wordmark instead of hiding letters in the middle of the first name.
  root.style.setProperty('--portrait-x', `${L.word.x + wordGap(app.word) * L.word.w}px`);
  app.furniture.apply(L);
}

/** Centre of the widest gap between letters, as a fraction of the ink width. */
function wordGap(word) {
  const inked = word.letters.filter((l) => l.w > 1).sort((a, b) => a.x - b.x);
  let best = 0;
  let mid = word.ink.x + word.ink.w * 0.5;
  for (let i = 1; i < inked.length; i++) {
    const left = inked[i - 1].x + inked[i - 1].w;
    const gap = inked[i].x - left;
    if (gap > best) { best = gap; mid = left + gap * 0.5; }
  }
  return (mid - word.ink.x) / word.ink.w;
}

function bindPointer() {
  if (reduced || matchMedia('(pointer: coarse)').matches) return;
  window.addEventListener('pointermove', (e) => {
    // normalised to -1..1, then damped in the frame loop; the response is
    // deliberately small — depth, not a toy
    app.pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    app.pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });
  window.addEventListener('pointerleave', () => {
    app.pointer.tx = 0;
    app.pointer.ty = 0;
  });
}

let last = 0;
function frame(now) {
  if (!app.running) return;
  const t = (now - app.t0) / 1000;
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;

  for (const [at, name] of CUES) {
    if (t >= at && !app.fired.has(name)) {
      app.fired.add(name);
      root.classList.add(`is-${name}`);
    }
  }
  if (t >= T.settled && !app.fired.has('portraitWalk')) {
    app.fired.add('portraitWalk');
    startPortraitWalk(now);
  }
  stepPortraitWalk(now);

  const p = app.pointer;
  p.x = damp(p.x, p.tx, 3.1, dt);
  p.y = damp(p.y, p.ty, 3.1, dt);
  // parallax only comes alive once the composition has settled
  const gate = clamp((t - T.settled + 0.9) / 1.2);
  app.stage.parallax.x = p.x * gate;
  app.stage.parallax.y = p.y * gate;

  const state = sample(t, app.word.letters.length, app.order);
  // The supplied walking footage belongs to the template creator. The owner's
  // own portrait sits over the compositor instead.
  state.hero.opacity = 0;

  // after the intro the wordmark breathes very slightly, so the frame never
  // becomes a static image
  if (state.settled) {
    const b = Math.sin(t * 0.42) * 0.5 + Math.sin(t * 0.27 + 1.3) * 0.5;
    for (const l of state.letters) l.dy = b * 0.0035;
  }

  app.stage.render(state, t, app.clips);
  requestAnimationFrame(frame);
}

// --------------------------------------------------------------------------

function degrade(reason) {
  console.warn('[gireesh] falling back:', reason);
  root.classList.remove('is-booting');
  root.classList.add('is-fallback');
  boot.classList.add('is-done');
  for (const [, name] of CUES) root.classList.add(`is-${name}`);
  document.querySelector('.stage-wrap').insertAdjacentHTML('afterbegin',
    '<div class="fallback"><p>MOHAMMED RASHIQ</p>'
    + '<small>Welcome to my world</small></div>');
}

function renderStill() {
  layout();
  const state = sample(T.settled + 1, app.word.letters.length, app.order);
  state.hero.opacity = 0;
  app.stage.render(state, T.settled + 1, app.clips);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function debounce(fn, ms) {
  let id;
  return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
}

// mobile menu
const burger = document.getElementById('burger');
const menu = document.getElementById('menu');
menu?.querySelectorAll('a').forEach((a, i) => a.style.setProperty('--i', i));
function setMenu(open) {
  burger.setAttribute('aria-expanded', String(open));
  root.classList.toggle('is-menu', open);
  if (open) menu.hidden = false;
  else setTimeout(() => { if (!root.classList.contains('is-menu')) menu.hidden = true; }, 500);
}
burger?.addEventListener('click', () =>
  setMenu(burger.getAttribute('aria-expanded') !== 'true'));
menu?.addEventListener('click', (e) => {
  if (e.target.closest('a')) setMenu(false);
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && root.classList.contains('is-menu')) setMenu(false);
});

// Review hook. Draws one frame on demand and reads the framebuffer in the SAME
// task, because the context is created without preserveDrawingBuffer. Rendering
// here rather than piggy-backing on the animation loop means it still works when
// the tab is hidden and rAF is throttled to a stop.
window.__shot = async (name = 'shot', at = null) => {
  if (!app.word) return 'not ready';
  const t = at !== null ? at : (performance.now() - app.t0) / 1000;
  const state = sample(t, app.word.letters.length, app.order);
  state.hero.opacity = 0;
  app.stage.render(state, t, app.clips);
  const url = app.stage.canvas.toDataURL('image/png');
  await fetch(`/__shot?name=${encodeURIComponent(name)}`,
    { method: 'POST', body: url });
  return `${app.stage.canvas.width}x${app.stage.canvas.height} @ t=${t.toFixed(2)}`;
};

// live tuning of the letter surface while matching the reference art
window.__tune = (k, v) => { app.stage[k] = v; return app.stage[k]; };

main().catch((e) => degrade(e.message));
