/* Motion & sparkle layer. Respects prefers-reduced-motion. */
(() => {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;

  // scroll progress bar + header shadow + hero parallax
  const bar = document.createElement("div"); bar.className = "progress"; document.body.prepend(bar);
  const header = document.querySelector(".site-header");
  const heroImg = document.querySelector(".hero-art > .art");
  let ticking = false;
  const onScroll = () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
      header?.classList.toggle("scrolled", scrollY > 10);
      if (heroImg && !still && scrollY < 900) heroImg.style.transform = `translateY(${scrollY * 0.08}px) scale(1.06)`;
      ticking = false;
    });
  };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  if (still) return;

  // staggered reveal: delay each .reveal by its position among siblings
  document.querySelectorAll(".reveal").forEach((el) => {
    const sibs = [...el.parentElement.children].filter((c) => c.classList.contains("reveal"));
    el.style.setProperty("--stagger", Math.max(0, sibs.indexOf(el)) * 0.12 + "s");
  });

  // twinkling sparkles in heroes
  const glyphs = ["✦", "✧", "✨", "♡"];
  document.querySelectorAll(".hero, .page-hero").forEach((hero) => {
    for (let i = 0; i < 14; i++) {
      const s = document.createElement("span"); s.className = "sparkle"; s.textContent = glyphs[i % glyphs.length];
      s.style.cssText = `left:${Math.random() * 96}%;top:${Math.random() * 90}%;font-size:${10 + Math.random() * 20}px;--d:${3 + Math.random() * 4}s;--delay:${Math.random() * 5}s`;
      s.setAttribute("aria-hidden", "true"); hero.prepend(s);
    }
  });

  // count-up numbers in the stats strip
  document.querySelectorAll(".stats b").forEach((b) => {
    const m = b.textContent.match(/^(\d+)(.*)$/); if (!m) return;
    const target = +m[1], suffix = m[2]; b.textContent = "0" + suffix;
    new IntersectionObserver((es, o) => es.forEach((e) => {
      if (!e.isIntersecting) return; o.disconnect();
      const t0 = performance.now();
      const tick = (t) => { const p = Math.min(1, (t - t0) / 1400); b.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix; if (p < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }), { threshold: 0.6 }).observe(b);
  });

  if (!fine) return;

  // 3D tilt on cards
  document.querySelectorAll(".hub-card, .article, .topic.linked, .pillar").forEach((card) => {
    card.classList.add("tilt");
    card.addEventListener("mousemove", (e) => {
      const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${(-y * 7).toFixed(2)}deg) rotateY(${(x * 9).toFixed(2)}deg) translateY(-4px)`;
    });
    card.addEventListener("mouseleave", () => { card.style.transform = ""; });
  });

  // sparkle burst on click
  addEventListener("click", (e) => {
    if (e.target.closest("input, textarea, select, video, iframe")) return;
    for (let i = 0; i < 6; i++) {
      const s = document.createElement("span"); s.className = "spark-click"; s.textContent = ["✦", "✧", "♡"][i % 3];
      const a = (Math.PI * 2 * i) / 6 + Math.random(), d = 28 + Math.random() * 30;
      s.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;font-size:${10 + Math.random() * 10}px`;
      document.body.append(s); setTimeout(() => s.remove(), 950);
    }
  });
})();
