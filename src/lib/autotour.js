// First-visit guided tour.
//
// The page is a sequence of scroll-driven scenes, and a first-time visitor who
// never scrolls sees only the hero. So on the first visit, once the opening
// has settled, the page scrolls itself from top to bottom at a watchable pace
// and plays every scene once.
//
// When it reaches the bottom it returns to the hero and reports completion
// (the page uses that to turn the music off): the visitor is left at the
// top, in quiet, free to explore.
//
// It is an offer, not a hijack: any wheel, touch, key press or click hands the
// page straight back, a visible "Skip tour" button does the same, and it never
// runs again on that browser. Visitors who asked for reduced motion never get
// it. Append ?tour=1 to the address to replay it for review.

const KEY = 'tour-seen';
const CINEMA_SPEED = 300;     // px per second through the animated scenes
const READING_SPEED = 520;    // px per second through the text-only profile
const RAMP = 0.7;             // seconds to ease up to speed
const UNIVERSE_HOLD = 3600;   // ms on the tech-stack scene while its labels arrive
const END_HOLD = 2200;         // ms on the closing scene before heading home

function seen() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}
function markSeen() {
  try { localStorage.setItem(KEY, '1'); } catch { /* private mode: runs again */ }
}

const top = (el) => el.getBoundingClientRect().top + window.scrollY;

/**
 * Start the tour after `delayMs` (the time left until the opening settles).
 * Does nothing on a repeat visit, with reduced motion, or if the visitor has
 * already started scrolling for themselves.
 */
export function scheduleTour(delayMs, { onComplete } = {}) {
  const forced = new URLSearchParams(location.search).get('tour') === '1';
  if (!forced && (seen() || matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    return;
  }

  // if they take the page into their own hands before it starts, never start
  let preempted = false;
  const preempt = () => { preempted = true; };
  const early = ['wheel', 'touchstart', 'keydown'];
  for (const ev of early) window.addEventListener(ev, preempt, { once: true, passive: true });

  setTimeout(() => {
    for (const ev of early) window.removeEventListener(ev, preempt);
    if (preempted || window.scrollY > 4 || document.visibilityState === 'hidden') {
      if (preempted || window.scrollY > 4) markSeen();
      return;
    }
    run(onComplete);
  }, Math.max(0, delayMs));
}

function run(onComplete) {
  markSeen();

  const universe = document.getElementById('universe');
  const profile = document.getElementById('profile');
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

  const takeover = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
  const stop = () => {
    if (!alive) return;
    alive = false;
    for (const ev of takeover) window.removeEventListener(ev, stop);
    pill.classList.remove('is-on');
    setTimeout(() => pill.remove(), 500);
  };
  for (const ev of takeover) window.addEventListener(ev, stop, { passive: true });
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
    const ramp = Math.min(1, (now - started) / (RAMP * 1000));
    y += (inProfile ? READING_SPEED : CINEMA_SPEED) * ramp * ramp * (3 - 2 * ramp) * dt;

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
