// Profile section motion: blocks rise into place as they scroll into view, and
// the three headline metrics count to their values the first time they appear.
//
// The hidden start state is applied from here (class js-reveal), never from
// CSS alone, so with scripting off or this module failing the section is simply
// visible. Reduced-motion visitors get the finished state with no movement.

const section = document.getElementById('profile');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (section && !reduced && 'IntersectionObserver' in window) {
  const blocks = [...section.querySelectorAll(
    '.profile__intro > *, .profile__metrics > div, .profile__panel, '
    + '.profile__sectionhead, .profile__projects article')];

  // siblings arrive one after another rather than as a slab
  for (const el of blocks) {
    const i = [...el.parentElement.children].indexOf(el);
    el.style.setProperty('--d', `${Math.min(i, 6) * 90}ms`);
  }
  section.classList.add('js-reveal');

  const count = (el) => {
    const to = Number(el.dataset.count);
    const from = Number(el.dataset.from ?? 0);
    const t0 = performance.now();
    const dur = 1300;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - (1 - k) ** 3;
      el.textContent = String(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step);
    };
    el.textContent = String(from);
    requestAnimationFrame(step);
  };

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      io.unobserve(el);
      el.classList.add('is-in');
      const delay = parseFloat(el.style.getPropertyValue('--d')) || 0;
      for (const n of el.querySelectorAll('[data-count]')) {
        setTimeout(() => count(n), delay + 150);
      }
    }
  }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });

  for (const el of blocks) io.observe(el);
}
