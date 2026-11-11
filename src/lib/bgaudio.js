// Background music: one looping track under the whole page, with a visible
// sound toggle.
//
// Browsers refuse to start audible audio before the visitor has interacted
// with the page, so playback is attempted straight away and, when refused,
// armed to start on the first click, tap or key press instead. Sound is ON by
// default on every visit (the owner's choice); the toggle only lasts for the
// current visit. The track pauses while the tab is hidden.

const SRC = 'public/media/bg-audio.mp3';
const VOLUME = 0.35;
const FADE_MS = 1400;

const audio = new Audio(SRC);
audio.loop = true;
audio.preload = 'auto';
audio.volume = 0;

// wanted = the visitor's intent; the element may still be waiting on a gesture
let wanted = true;
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
  btn.classList.toggle('is-blocked', wanted && audio.paused);
  btn.setAttribute('aria-pressed', String(live));
  btn.setAttribute('aria-label',
    live ? 'Turn background music off' : 'Enable background music');
  txt.textContent = live ? 'Sound on' : wanted ? 'Tap to enable sound' : 'Sound off';
}

function fadeTo(target, then) {
  cancelAnimationFrame(fadeId);
  const from = audio.volume;
  const t0 = performance.now();
  const step = (now) => {
    // a frame's timestamp can predate t0, so k is clamped at both ends
    const k = Math.min(1, Math.max(0, (now - t0) / FADE_MS));
    audio.volume = Math.min(1, Math.max(0, from + (target - from) * k));
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
  if (!audio.paused) return Promise.resolve(true);
  return audio.play().then(() => {
    fadeTo(VOLUME);
    paint();
    return true;
  }).catch(() => {
    // refused before any interaction: wait for the first gesture
    arm();
    paint();
    return false;
  });
}

/**
 * Start the music and report whether it is actually sounding.
 *
 * The opening attempts music before it begins. If autoplay is refused, the
 * visual intro continues and the sound control invites a user gesture.
 */
export function startSound() {
  if (!wanted) return Promise.resolve(true);
  return start();
}

function stop() {
  fadeTo(0, () => { audio.pause(); paint(); });
}

btn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!wanted) {
    wanted = true;
    start();
  } else if (audio.paused) {
    // Autoplay may have been blocked; the button click retries from a gesture.
    start();
  } else {
    wanted = false;
    stop();
  }
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
audio.addEventListener('playing', paint);
audio.addEventListener('pause', paint);

document.body.appendChild(btn);
paint();
// The opening (main.js) starts the track through startSound(). Arming here as
// well means that if the opening never runs (no WebGL, script error), the
// first click or key press still brings the music in.
arm();
