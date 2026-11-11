// Scene two introduces the portfolio owner with the same cutout portrait
// used by the opening and closing scenes.
export async function initUniverse() {
  const section = document.getElementById('universe');
  if (!section) return null;

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      section.classList.toggle('is-on', entry.isIntersecting);
    }
  }, { threshold: 0.3 });
  observer.observe(section);
  return { section, observer };
}
