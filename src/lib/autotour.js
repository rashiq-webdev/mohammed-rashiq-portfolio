// Guided tour.
//
// The page is a sequence of scroll-driven scenes, and a visitor who never
// scrolls sees only the hero. So when a visitor enters with sound on, once the
// opening has settled the page scrolls itself from top to bottom at a
// watchable pace and plays every scene once. It does this on every load: the
// owner wants the film shown each time, not only on a first visit.
//
// When it reaches the bottom it returns to the hero and reports completion
// (the page uses that to turn the music off): the visitor is left at the
// top, in quiet, free to explore.
//
// The visitor is told about it up front: after the sound choice the opening
// shows a "sit back and relax" screen (see main.js), so the scrolling reads
// as intended rather than as a glitch.
//
// It is an offer, not a hijack: scrolling, swiping, a key press or a mouse
// click hands the page straight back, and a visible "Skip tour" button does
// the same. On a touch screen a plain TAP does not cancel it (people rest a
// thumb on a phone, and a tap is how a year is picked on the timeline); a
// swipe does. Visitors who asked for reduced motion never get it.

const CINEMA_SPEED = 300;     // px per second through the animated scenes
const READING_SPEED = 520;    // px per second through the text-only profile
const CARD_SECONDS = 2.4;     // phones: how long each timeline year holds the screen
const RAMP = 0.7;             // seconds to ease up to speed
const UNIVERSE_HOLD = 3600;   // ms on the tech-stack scene while its labels arrive
const END_HOLD = 2200;        // ms on the closing scene before heading home

const top = (el) => el.getBoundingClientRect().top + window.scrollY;

// what counts as the visitor taking the page back
const TAKEOVER = ['wheel', 'touchmove', 'keydown', 'mousedown'];

/** True when a tour can run at all, so the opening can announce it. */
export function tourPending() {
  return !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Start the tour after `delayMs` (the time left until the opening settles,
 * plus the hold on the finished hero). Does nothing with reduced motion, or
 * if the visitor has already started scrolling for themselves.
 */
export function scheduleTour(delayMs, { onComplete } = {}) {
  if (!tourPending()) return;

  // if they take the page into their own hands before it starts, never start
  let preempted = false;
  const preempt = () => { preempted = true; };
  const early = ['wheel', 'touchmove', 'keydown'];
  for (const ev of early) window.addEventListener(ev, preempt, { once: true, passive: true });

  setTimeout(() => {
    for (const ev of early) window.removeEventListener(ev, preempt);
    if (preempted || window.scrollY > 4 || document.visibilityState === 'hidden') return;
    run(onComplete);
  }, Math.max(0, delayMs));
}

function run(onComplete) {
  const universe = document.getElementById('universe');
  const profile = document.getElementById('profile');
  const chrono = document.getElementById('chrono');
  const holds = universe ? [{ y: top(universe), ms: UNIVERSE_HOLD, done: false }] : [];

  const pill = document.createElement('div');
  pill.className = 'autotour';
  pill.innerHTML = '<span class="autotour__txt">Guided tour</span>'
    + '<button type="button" class="autotour__skip">Skip tour</button>';
  document.body.appendChild(pill);
  requestAnimationFrame(() => pill.classList.add('is-on'));

  let alive = true;
  let y = window.scrollY;
  let last = performance.now();
  let started = last;
  let holdUntil = 0;

  const stop = () => {
    if (!alive) return;
    alive = false;
    for (const ev of TAKEOVER) window.removeEventListener(ev, stop);
    pill.classList.remove('is-on');
    setTimeout(() => pill.remove(), 500);
  };
  for (const ev of TAKEOVER) window.addEventListener(ev, stop, { passive: true });
  pill.querySelector('.autotour__skip').addEventListener('click', stop);

  const step = (now) => {
    if (!alive) return;
    // a backgrounded tab delivers one huge gap on return; do not leap
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (now < holdUntil) {
      started = now;                       // ease back in after the hold
      return requestAnimationFrame(step);
    }

    const max = document.documentElement.scrollHeight - window.innerHeight;
    const inProfile = profile
      && y + window.innerHeight * 0.5 > top(profile)
      && y + window.innerHeight * 0.5 < top(profile) + profile.offsetHeight;
    // On a phone the timeline's scroll travel is what turns its six years
    // (scene3/boot3.js). At the cinema pace they flick past in a second each,
    // so through that scene the speed is set from the travel itself: every
    // year gets CARD_SECONDS on screen.
    let speed = inProfile ? READING_SPEED : CINEMA_SPEED;
    if (chrono && chrono.classList.contains('is-portrait')) {
      const c0 = top(chrono);
      const travel = chrono.offsetHeight - window.innerHeight;
      if (travel > 0 && y >= c0 && y < c0 + travel) {
        speed = Math.min(CINEMA_SPEED, travel / (6 * CARD_SECONDS));
      }
    }
    const ramp = Math.min(1, (now - started) / (RAMP * 1000));
    y += speed * ramp * ramp * (3 - 2 * ramp) * dt;

    for (const h of holds) {
      if (!h.done && y >= h.y) {
        h.done = true;
        y = h.y;
        holdUntil = now + h.ms;
      }
    }

    if (y >= max) {
      window.scrollTo(0, max);
      // Finished on its own (a skip or takeover never gets here): rest on the
      // closing scene, then go home to the hero. If the visitor takes over
      // during that rest, the page stays where they are.
      return setTimeout(() => {
        if (!alive) return;
        stop();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        onComplete?.();
      }, END_HOLD);
    }
    window.scrollTo(0, y);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
