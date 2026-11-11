// Background music: one looping track under the whole page, with a visible
// sound toggle.
//
// Browsers refuse to start audible audio before the visitor has interacted
// with the page, so playback is attempted straight away and, when refused,
// armed to start on the first click, tap or key press instead. The visitor's
// on/off choice is remembered, the track pauses while the tab is hidden, and
// a visitor who asked for reduced motion gets silence until they opt in.

const SRC = 'public/media/bg-audio.mp3';
const VOLUME = 0.35;
const FADE_MS = 1400;
const KEY = 'bg-audio';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function saved() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function save(v) {
  try { localStorage.setItem(KEY, v); } catch { /* private mode: not kept */ }
}

const audio = new Audio(SRC);
audio.loop = true;
audio.preload = 'auto';
audio.volume = 0;

// wanted = the visitor's intent; the element may still be waiting on a gesture
let wanted = saved() ? saved() === 'on' : !reduced;
let fadeId = 0;

const btn = document.createElement('button');
btn.type = 'button';
btn.className = 'bgaudio';
btn.innerHTML = '<span class="bgaudio__bars" aria-hidden="true">'
  + '<i></i><i></i><i></i><i></i></span><span class="bgaudio__txt"></span>';
const txt = btn.querySelector('.bgaudio__txt');

function paint() {
  const live = wanted && !audio.paused;
  btn.classList.toggle('is-on', live);
  btn.setAttribute('aria-pressed', String(wanted));
  btn.setAttribute('aria-label',
    wanted ? 'Turn background music off' : 'Turn background music on');
  txt.textContent = wanted ? 'Sound on' : 'Sound off';
}

function fadeTo(target, then) {
  cancelAnimationFrame(fadeId);
  const from = audio.volume;
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / FADE_MS);
    audio.volume = from + (target - from) * k;
    if (k < 1) fadeId = requestAnimationFrame(step);
    else if (then) then();
  };
  fadeId = requestAnimationFrame(step);
}

function arm() {
  const go = () => { if (wanted) start(); };
  for (const ev of ['pointerdown', 'keydown', 'touchend']) {
    window.addEventListener(ev, go, { once: true, passive: true });
  }
}

function start() {
  if (!audio.paused) return;
  audio.play().then(() => {
    fadeTo(VOLUME);
    paint();
  }).catch(() => {
    // refused before any interaction: wait for the first gesture
    arm();
    paint();
  });
}

function stop() {
  fadeTo(0, () => { audio.pause(); paint(); });
}

btn.addEventListener('click', (e) => {
  e.stopPropagation();
  wanted = !wanted;
  save(wanted ? 'on' : 'off');
  if (wanted) start(); else stop();
  paint();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    cancelAnimationFrame(fadeId);
    audio.pause();
  } else if (wanted) {
    start();
  }
});

audio.addEventListener('error', () => { btn.hidden = true; }, { once: true });

document.body.appendChild(btn);
paint();
if (wanted) start();
