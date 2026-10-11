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
  store.set('tbj-subscribed', '1'); store.set('tbj-email', email); store.set('tbj-name', name);

  if (msg) {
    msg.className = cls + ' ok';
    msg.textContent = saved ? "You're in! Opening your Insider Club page… Your guide: " : "We couldn't save your email just now, but here's your guide: ";
    const a = document.createElement('a');
    a.href = GUIDE_URL; a.textContent = 'Download the PDF'; a.download = ''; a.target = '_blank'; a.rel = 'noopener';
    a.style.color = 'inherit'; a.style.textDecoration = 'underline';
    msg.append(a);
  }
  form.reset();
  if (API_OK && saved) {
    if (document.getElementById('club-app')) location.search = '?joined=1';
    else setTimeout(() => { location.href = SITE_BASE + 'club.html?joined=1'; }, 1100);
  } else {
    const link = document.createElement('a');
    link.href = GUIDE_URL; link.download = ''; link.click();
  }
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
      document.querySelectorAll('.video button.play[data-vkey]').forEach((b) => {
        const k = b.dataset.vkey, file = cfg.videoFiles?.[k], yt = cfg.videos?.[k], title = (cfg.videoTitles?.[k] || '').trim();
        if (!file && !yt) return;
        const cap = b.querySelector('.caption');
        if (cap) { if (title) cap.textContent = title; else cap.remove(); }
        if (title) b.dataset.title = title;
        if (file) {
          // uploaded video: show the player straight away (first frame visible)
          const v = document.createElement('video');
          v.src = '/media/' + file + '#t=0.1'; v.controls = true; v.preload = 'metadata'; v.playsInline = true;
          v.setAttribute('aria-label', title || 'Video masterclass');
          b.replaceWith(v);
        } else {
          b.dataset.yt = yt;
          b.classList.add('has-thumb');
          b.style.backgroundImage = 'url(https://i.ytimg.com/vi/' + yt + '/hqdefault.jpg)';
        }
      });
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

/* ================= Insider Club page ================= */
(() => {
  const app = document.getElementById('club-app');
  if (!app || !API_OK) { if (app) { document.getElementById('club-loading').remove(); document.getElementById('club-guest').hidden = false; } return; }
  const $ = (id) => document.getElementById(id);
  const J = { 'Content-Type': 'application/json' };
  const lookup = async (email) => { try { const r = await fetch('/api/member', { method: 'POST', headers: J, body: JSON.stringify({ email }) }); return r.ok ? await r.json() : null; } catch { return null; } };
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const safeHref = (u) => (/^(https?:\/\/|\/|[a-z0-9-]+\.html)/i.test(u) ? u : '');

  function show(d) {
    $('club-loading').hidden = true; $('club-guest').hidden = true; $('club-member').hidden = false;
    $('club-title').replaceChildren(document.createTextNode((d.name ? 'Welcome, ' + d.name + '. ' : 'Welcome. ') ), Object.assign(document.createElement('em'), { textContent: "You're in the club." }));
    $('club-lede').textContent = 'Everything for members is below: your guide, printable toolkits, perks and live Q&A news.';
    if (/[?&]joined=1/.test(location.search)) $('club-joined').hidden = false;

    // posts from the admin, or helpful defaults so the page is never empty
    const posts = (d.posts && d.posts.length) ? d.posts : [
      { title: 'Start here: make one small habit stick', text: 'Download your guide, print the weekly checklist and pick just one habit for this week. Cuticle oil once a day is a great first one. Small routines beat big overhauls.' },
      { title: 'Tip of the month: protect what you paid for', text: 'Water, oil and picking shorten almost every set of lashes and gel nails. Keep oil-based products away from your lash line, wear gloves for cleaning, and never peel gel off. Use the removal guide in the library below instead.' },
      { title: 'How the club works', text: 'Everything here is free. We add new guides and masterclasses to the site regularly, and we will email you when a new perk or live Q&A is announced.' },
    ];
    const pl = $('club-posts'); pl.replaceChildren();
    for (const p of posts) { const a = h('article', 'post'); a.append(h('h3', null, p.title)); for (const para of String(p.text).split(/\n{2,}/)) a.append(h('p', null, para)); pl.append(a); }

    const perks = $('club-perks'); perks.replaceChildren();
    if (d.perks && d.perks.length) {
      for (const p of d.perks) {
        const c = h('div', 'perk'); c.append(h('strong', null, p.title)); if (p.text) c.append(h('p', null, p.text));
        if (p.code) { const row = h('div', 'code-row'); row.append(h('code', null, p.code)); const b = h('button', 'btn small ghost', 'Copy'); b.type = 'button'; b.onclick = async () => { try { await navigator.clipboard.writeText(p.code); b.textContent = 'Copied'; } catch { b.textContent = p.code; } }; row.append(b); c.append(row); }
        const href = safeHref(p.link || ''); if (href) { const a = h('a', 'more', 'Get this offer →'); a.href = href; a.target = '_blank'; a.rel = 'noopener'; c.append(a); }
        perks.append(c);
      }
    } else perks.append(h('p', 'muted', "Partner offers are on the way. We'll email you as soon as the first discount codes are live."));

    const q = $('club-qna'); q.replaceChildren();
    if (d.qna) {
      q.append(h('strong', null, d.qna.title)); if (d.qna.when) q.append(h('p', null, d.qna.when));
      const href = safeHref(d.qna.link || ''); if (href) { const a = h('a', 'btn small', 'Join the Q&A'); a.href = href; a.target = '_blank'; a.rel = 'noopener'; q.append(a); }
    } else q.append(h('p', 'muted', "The next live Q&A date will be announced by email. Have a question for it? Send it through the contact page."));
  }

  // weekly routine tracker (saved on this device, resets each ISO week)
  (function tracker() {
    const goals = ['Cuticle oil every day', 'Cleanse lashes 2 to 3 times', 'Gloves for washing up and cleaning', 'Brush and store hair extensions properly', 'No picking, peeling or pulling', 'Book my next appointment (if due)'];
    const wk = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); const w1 = new Date(d.getFullYear(), 0, 4); return d.getFullYear() + '-W' + (1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7)); })();
    let done = []; try { const v = JSON.parse(localStorage.getItem('tbj-tracker') || '{}'); if (v.week === wk) done = v.done || []; } catch {}
    const list = $('tracker-list'), fill = $('tracker-fill'), count = $('tracker-count');
    const render = () => { fill.style.width = (done.length / goals.length * 100) + '%'; count.textContent = done.length === goals.length ? 'All done this week! 🎉' : done.length + ' of ' + goals.length + ' done'; };
    goals.forEach((g, i) => {
      const li = h('li'); const id = 'goal' + i; const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = id; cb.checked = done.includes(i);
      cb.onchange = () => { done = cb.checked ? [...new Set([...done, i])] : done.filter((x) => x !== i); store.set('tbj-tracker', JSON.stringify({ week: wk, done })); render(); };
      const lab = h('label', null, g); lab.htmlFor = id; li.append(cb, lab); list.append(li);
    });
    render();
  })();

  // ask the club -> goes to the admin's Messages inbox
  $('ask-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = e.currentTarget.querySelector('.form-msg'), q = $('ask-q').value.trim(), email = store.get('tbj-email'), name = store.get('tbj-name') || '';
    if (!q) { msg.className = 'form-msg err'; msg.textContent = 'Please type your question first.'; return; }
    msg.className = 'form-msg'; msg.textContent = 'Sending…';
    try { await post('/api/contact', { name, email, message: '[Club question] ' + q }); msg.className = 'form-msg ok'; msg.textContent = 'Thank you! We have your question.'; $('ask-q').value = ''; }
    catch { msg.className = 'form-msg err'; msg.textContent = 'Something went wrong. Please try again.'; }
  });

  function guest() { $('club-loading').hidden = true; $('club-member').hidden = true; $('club-guest').hidden = false; }

  $('member-check').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('e-mc').value.trim(), msg = e.currentTarget.querySelector('.form-msg');
    msg.className = 'form-msg'; msg.textContent = 'Checking…';
    const d = await lookup(email);
    if (d && d.member) { store.set('tbj-email', email.toLowerCase()); store.set('tbj-subscribed', '1'); show(d); }
    else { msg.className = 'form-msg err'; msg.textContent = "We couldn't find that email in the club. Join with the form above."; }
  });
  $('club-leave').addEventListener('click', (e) => { e.preventDefault(); try { localStorage.removeItem('tbj-email'); localStorage.removeItem('tbj-subscribed'); } catch {} location.href = 'club.html'; });

  (async () => {
    const email = store.get('tbj-email');
    const d = email ? await lookup(email) : null;
    if (d && d.member) show(d); else guest();
  })();
})();
