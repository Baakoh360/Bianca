// ---- CONFIG -------------------------------------------------------------
// By default forms post to this site's own server (see server.js), which
// saves sign-ups to data/subscribers.csv. To use an email service instead
// (Formspree, MailerLite, ConvertKit...), paste its form URL below.
const SUBSCRIBE_ENDPOINT = '/api/subscribe';
const CONTACT_ENDPOINT = '/api/contact';
// -------------------------------------------------------------------------
const SITE_BASE = new URL('./', document.currentScript.src).href;
const GUIDE_URL = SITE_BASE + 'downloads/Hair-Lash-Nail-Survival-Guide.pdf';
const API_OK = location.protocol.startsWith('http');

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// Mobile menu
const toggle = document.querySelector(".menu-toggle");
const menu = document.querySelector(".nav ul");
if (toggle && menu) {
  toggle.addEventListener("click", () => {
    const open = menu.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open);
  });
}

// Subscribe forms
async function post(url, data) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
  if (!res.ok) throw new Error('status ' + res.status);
}

async function subscribe(form) {
  const msg = form.querySelector('.form-msg, .sticky-msg');
  const email = form.querySelector('input[type=email]').value.trim();
  const name = form.querySelector('input[name=name]')?.value.trim() || '';
  const cls = msg ? msg.className.split(' ')[0] : '';

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    if (msg) { msg.textContent = 'Please enter a valid email address.'; msg.className = cls + ' err'; }
    return;
  }

  let saved = true;
  if (API_OK) {
    try { await post(SUBSCRIBE_ENDPOINT, { email, name, source: location.pathname, website: form.querySelector("input[name=website]")?.value }); } catch { saved = false; }
  }
  store.set('tbj-subscribed', '1');

  if (msg) {
    msg.className = cls + ' ok';
    msg.textContent = saved ? "You're in! Here's your free Survival Guide: " : "We couldn't save your email just now, but here's your guide: ";
    const a = document.createElement('a');
    a.href = GUIDE_URL; a.textContent = 'Download the PDF'; a.download = ''; a.target = '_blank'; a.rel = 'noopener';
    a.style.color = 'inherit'; a.style.textDecoration = 'underline';
    msg.append(a);
  }
  form.reset();
  const link = document.createElement('a');
  link.href = GUIDE_URL; link.download = ''; link.click();
}
document.querySelectorAll("form[data-subscribe]").forEach((f) =>
  f.addEventListener("submit", (e) => { e.preventDefault(); subscribe(f); })
);

// Sticky bar (after 35% scroll) + exit-intent modal (desktop)
const bar = document.querySelector(".sticky-bar");
const modal = document.querySelector(".modal");
const subscribed = () => store.get("tbj-subscribed") === "1";

function closeExtras() {
  bar?.classList.remove("show");
  modal?.classList.remove("show");
}

if (bar && !subscribed() && !store.get("tbj-bar-closed")) {
  const onScroll = () => {
    const pct = scrollY / (document.body.scrollHeight - innerHeight);
    if (pct > 0.35) { bar.classList.add("show"); removeEventListener("scroll", onScroll); }
  };
  addEventListener("scroll", onScroll, { passive: true });
  bar.querySelector(".sticky-close")?.addEventListener("click", () => {
    bar.classList.remove("show");
    store.set("tbj-bar-closed", "1");
  });
}

if (modal && !subscribed() && !store.get("tbj-exit-shown")) {
  document.addEventListener("mouseout", (e) => {
    if (e.clientY < 0 && !e.relatedTarget && !subscribed() && !store.get("tbj-exit-shown")) {
      modal.classList.add("show");
      store.set("tbj-exit-shown", "1");
    }
  });
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("show"); });
  modal.querySelector(".modal-x")?.addEventListener("click", () => modal.classList.remove("show"));
  addEventListener("keydown", (e) => { if (e.key === "Escape") modal.classList.remove("show"); });
}

// Click-to-load videos (keeps pages fast). Uploaded files play in a native player, otherwise YouTube.
document.querySelectorAll(".video button.play").forEach((btn) => {
  btn.addEventListener("click", () => {
    const title = btn.dataset.title || "Video masterclass";
    let player;
    if (btn.dataset.file) {
      player = document.createElement("video");
      player.src = "/media/" + btn.dataset.file;
      player.controls = true; player.autoplay = true; player.playsInline = true; player.preload = "metadata";
      player.setAttribute("aria-label", title);
    } else if (btn.dataset.yt && !btn.dataset.yt.startsWith("REPLACE")) {
      player = document.createElement("iframe");
      player.src = "https://www.youtube-nocookie.com/embed/" + btn.dataset.yt + "?autoplay=1&rel=0";
      player.allow = "autoplay; encrypted-media; picture-in-picture";
      player.allowFullscreen = true;
      player.title = title;
    } else {
      btn.querySelector(".caption").textContent = "This masterclass video is coming soon.";
      return;
    }
    btn.replaceWith(player);
  });
});

document.querySelectorAll(".year").forEach((el) => (el.textContent = new Date().getFullYear()));

// Contact form
document.querySelectorAll('form[data-contact]').forEach((form) => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = form.querySelector('.form-msg');
    const email = form.querySelector('input[type=email]').value.trim();
    const message = form.querySelector('textarea').value.trim();
    const name = form.querySelector('input[name=name]').value.trim();
    const say = (t, c) => { msg.textContent = t; msg.className = 'form-msg ' + c; };
    if (!/^\S+@\S+\.\S+$/.test(email) || !message) return say('Please add your email and a message.', 'err');
    try {
      if (API_OK) await post(CONTACT_ENDPOINT, { name, email, message, website: form.querySelector("input[name=website]")?.value });
      say('Thanks! We will get back to you soon.', 'ok');
      form.reset();
    } catch { say('Something went wrong. Please try again.', 'err'); }
  });
});

// Scroll reveal
document.documentElement.classList.remove('no-js');
const revealEls = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.12 });
  revealEls.forEach((el) => io.observe(el));
} else revealEls.forEach((el) => el.classList.add('in'));

// Honeypot field (hidden from people, bots fill it in)
document.querySelectorAll('form[data-subscribe], form[data-contact]').forEach((f) => {
  const h = document.createElement('input');
  h.type = 'text'; h.name = 'website'; h.tabIndex = -1; h.autocomplete = 'off'; h.setAttribute('aria-hidden', 'true');
  h.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0';
  f.append(h);
});

// Page-view tracking + settings from the admin panel
if (API_OK) {
  try {
    navigator.sendBeacon('/api/track', new Blob([JSON.stringify({ path: location.pathname, ref: document.referrer ? new URL(document.referrer).hostname : '' })], { type: 'application/json' }));
    fetch('/api/settings').then((r) => r.json()).then((cfg) => {
      document.querySelectorAll('.video button.play[data-vkey]').forEach((b) => { const id = cfg.videos?.[b.dataset.vkey]; if (id) b.dataset.yt = id; const f = cfg.videoFiles?.[b.dataset.vkey]; if (f) b.dataset.file = f; });
      const a = cfg.announcement;
      if (a && a.text) {
        const bar = document.createElement('div');
        bar.className = 'announce';
        const t = document.createElement(a.link ? 'a' : 'span');
        t.textContent = a.text;
        if (a.link) t.href = a.link;
        bar.append(t);
        document.body.prepend(bar);
      }
    }).catch(() => {});
  } catch {}
}
