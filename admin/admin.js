// Admin panel. All dynamic content is inserted with textContent (never innerHTML)
// because subscriber names and contact messages come from the public.
const app = document.getElementById("app");

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
}

async function api(path, opts = {}) {
  const res = await fetch("/api/admin" + path, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json", "X-Requested-With": "admin" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  if (res.status === 401 && path !== "/login") { showLogin(); throw new Error("signed out"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

const fmt = (d) => new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
let me = "";
let unread = 0;

/* ---------- Login ---------- */
function showLogin() {
  const msg = el("p", { class: "msg", role: "status" });
  const email = el("input", { type: "email", required: true, autocomplete: "username" });
  const pw = el("input", { type: "password", required: true, autocomplete: "current-password" });
  app.replaceChildren(el("form", { class: "login", onsubmit: async (e) => {
    e.preventDefault(); msg.className = "msg"; msg.textContent = "Signing in…";
    try { const r = await api("/login", { method: "POST", body: { email: email.value, password: pw.value } }); me = r.email; start(); }
    catch (err) { msg.className = "msg err"; msg.textContent = err.message; }
  } },
    el("h1", {}, "The Beauty Journal"), el("p", { class: "hint" }, "Admin sign-in"),
    el("label", {}, "Email"), email, el("label", {}, "Password"), pw,
    el("button", { class: "btn", style: "width:100%;margin-top:18px", type: "submit" }, "Sign in"), msg));
}

/* ---------- Shell ---------- */
const views = { dashboard, subscribers, messages, settings: settingsView, activity };
const titles = { dashboard: "Dashboard", subscribers: "Subscribers", messages: "Messages", settings: "Site settings", activity: "Activity log" };

async function start() {
  try { me = (await api("/me")).email; } catch { return; }
  navigate(location.hash.slice(1) || "dashboard");
}
addEventListener("hashchange", () => me && navigate(location.hash.slice(1) || "dashboard"));

async function navigate(view) {
  if (!views[view]) view = "dashboard";
  let st;
  try { st = await api("/stats"); unread = st.unread; } catch { return; }
  const main = el("main");
  const link = (v) => el("a", { class: v === view ? "on" : "", href: "#" + v }, titles[v], v === "messages" && unread ? el("span", { class: "badge" }, unread) : null);
  app.replaceChildren(el("div", { class: "layout" },
    el("nav", { class: "side" }, el("div", { class: "brand" }, "The Beauty ", el("em", {}, "Journal")),
      Object.keys(titles).map(link), el("div", { class: "grow" }),
      el("a", { href: "/", target: "_blank", rel: "noopener" }, "View website ↗"),
      el("small", {}, me),
      el("a", { onclick: async () => { await api("/logout"); me = ""; showLogin(); } }, "Sign out")),
    main));
  main.append(el("div", { class: "top" }, el("h1", {}, titles[view])));
  const loading = el("p", { class: "hint" }, "Loading…");
  main.append(loading);
  try { await views[view](main, st); } catch (e) { if (e.message !== "signed out") main.append(el("p", { class: "msg err" }, e.message)); }
  loading.remove();
}

/* ---------- Dashboard ---------- */
const PAGE_NAMES = { "/": "Home page", "/index.html": "Home page", "/hair.html": "Hair page", "/lash.html": "Lash page", "/nails.html": "Nails page", "/about.html": "About page", "/contact.html": "Contact page", "/club.html": "Insider Club page", "/privacy.html": "Privacy page", "/404.html": "Page not found" };
function pageName(path) {
  if (PAGE_NAMES[path]) return PAGE_NAMES[path];
  const g = path.match(/^\/guides\/(.+)\.html$/);
  if (g) { const t = g[1].replace(/-/g, " "); return "Guide: " + t.charAt(0).toUpperCase() + t.slice(1); }
  return path;
}
// friendly names, with "/" and "/index.html" combined into one Home page row
function friendlyPages(rows) {
  const totals = new Map();
  for (const r of rows) { const name = pageName(r.path); totals.set(name, (totals.get(name) || 0) + r.n); }
  return [...totals].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n).slice(0, 8);
}
function friendlySources(rows) {
  const totals = new Map();
  for (const r of rows) { const name = r.source === "(unknown)" ? "Unknown" : pageName(r.source); totals.set(name, (totals.get(name) || 0) + r.n); }
  return [...totals].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
}
async function dashboard(main, s) {
  const stat = (n, label) => el("div", { class: "card stat" }, el("b", {}, n), el("span", {}, label));
  main.append(el("div", { class: "cards" },
    stat(s.totalSubs, "Total subscribers"), stat(s.newSubs7, "New this week"), stat(s.views7, "Page views (7 days)"),
    stat(s.downloads, "Guide downloads"), stat(s.unread, "Unread messages")));
  const max = Math.max(1, ...s.series.map((d) => Math.max(d.views, d.signups)));
  const bars = el("div", { class: "bars" });
  for (const d of s.series) {
    bars.append(el("div", { title: `${d.day}: ${d.views} views`, style: `height:${(d.views / max) * 100}%` }));
    bars.append(el("div", { class: "s", title: `${d.day}: ${d.signups} sign-ups`, style: `height:${(d.signups / max) * 100}%` }));
  }
  main.append(el("div", { class: "card" }, el("h3", {}, "Last 14 days"), bars,
    el("div", { class: "legend" }, el("span", {}, el("i", { class: "dot", style: "background:var(--plum)" }), "Page views"), el("span", {}, el("i", { class: "dot", style: "background:var(--rose)" }), "Sign-ups"))));
  const list = (title, rows, a, b) => el("div", { class: "card" }, el("h3", {}, title),
    rows.length ? el("table", {}, rows.map((r) => el("tr", {}, el("td", {}, r[a]), el("td", {}, r[b])))) : el("p", { class: "hint" }, "No data yet."));
  main.append(el("div", { class: "two", style: "margin-top:14px" }, list("Top pages (14 days)", friendlyPages(s.topPages), "name", "n"), list("Where sign-ups come from", friendlySources(s.sources), "name", "n")));
}

/* ---------- Paged tables ---------- */
function pagedList(main, { endpoint, headers, row, search, extra }) {
  let page = 1, q = "";
  const body = el("tbody"), pager = el("div", { class: "pager" });
  const box = el("input", { type: "search", placeholder: "Search…", style: "max-width:260px", onchange: () => { q = box.value; page = 1; load(); } });
  main.append(el("div", { class: "row", style: "margin-bottom:12px;flex-wrap:wrap" }, search ? box : null, extra), el("div", { class: "wrap-x" }, el("table", {}, el("thead", {}, el("tr", {}, headers.map((h) => el("th", {}, h)))), body)), pager);
  async function load() {
    const sep = endpoint.includes("?") ? "&" : "?";
    const d = await api(`${endpoint}${sep}page=${page}&q=${encodeURIComponent(q)}`);
    body.replaceChildren(...(d.items.length ? d.items.map((it) => row(it, load)) : [el("tr", {}, el("td", { colspan: headers.length }, "Nothing here yet."))]));
    const pages = Math.max(1, Math.ceil(d.total / d.per));
    pager.replaceChildren(el("button", { class: "btn ghost small", disabled: page <= 1, onclick: () => { page--; load(); } }, "← Prev"), `Page ${page} of ${pages} · ${d.total} total`,
      el("button", { class: "btn ghost small", disabled: page >= pages, onclick: () => { page++; load(); } }, "Next →"));
  }
  return load();
}

const OPT_OUT = "\n\n--\nIf you'd rather not get these emails, just reply with the word unsubscribe.";
const WELCOME_SUBJECT = "Your free Hair, Lash & Nail Survival Guide";
const WELCOME_BODY = "Hi {name},\n\nWelcome to The Beauty Insider Club! Here is your free Hair, Lash & Nail Survival Guide:\n\n{guide}\n\nInside you'll find care routines, real monthly costs and the red flags to watch for. Reply to this email any time with your questions or topics you'd like us to cover.\n\nWith love,\nThe Beauty Journal" + OPT_OUT;
const BATCH = 40; // addresses per email, keeps links short enough for every email app

// Opens the admin's own email app / Gmail with the message ready to send.
// to = subscriber id (one person) | "new" | "all"   (bulk uses BCC so people can't see each other)
async function composer({ title, to, sub, welcome, onDone, sender }) {
  const bulk = to === "new" || to === "all";
  let people = sub ? [sub] : [];
  if (bulk) {
    try { people = (await api("/subscribers/emails?to=" + to)).items; } catch (e) { return alert(e.message); }
    if (!people.length) return alert(to === "new" ? "There are no new subscribers to email." : "There are no subscribers to email yet.");
  }
  const guideUrl = location.origin + "/downloads/Hair-Lash-Nail-Survival-Guide.pdf";
  const subject = el("input", { type: "text", value: welcome ? WELCOME_SUBJECT : "" });
  const body = el("textarea", { rows: 12 }, welcome ? WELCOME_BODY : bulk ? "Hi lovely,\n\n" + OPT_OUT : "");
  const msg = el("p", { class: "msg", role: "status" });
  const batches = []; for (let i = 0; i < people.length; i += BATCH) batches.push(people.slice(i, i + BATCH));
  const overlay = el("div", { style: "position:fixed;inset:0;background:rgba(42,31,45,.6);display:grid;place-items:center;padding:16px;z-index:50;overflow:auto" });
  const close = () => overlay.remove();

  const text = (p) => body.value.replaceAll("{name}", bulk ? "there" : (p.name || "there")).replaceAll("{guide}", guideUrl).replace(/\n/g, "\r\n");
  const q = (p, extra) => `subject=${encodeURIComponent(subject.value)}&body=${encodeURIComponent(text(p))}${extra || ""}`;
  const addrs = (list) => list.map((p) => p.email).join(",");
  const openLink = (url) => { const a = el("a", { href: url, target: "_blank", rel: "noopener" }); document.body.append(a); a.click(); a.remove(); };
  const mailtoUrl = (list) => bulk ? `mailto:?bcc=${encodeURIComponent(addrs(list))}&${q(list[0])}` : `mailto:${encodeURIComponent(list[0].email)}?${q(list[0])}`;
  const gmailUrl = (list) => `https://mail.google.com/mail/?${sender ? "authuser=" + encodeURIComponent(sender) + "&" : ""}view=cm&fs=1&${bulk ? "bcc=" : "to="}${encodeURIComponent(addrs(list))}&${q(list[0])}`;
  const need = () => { if (!subject.value.trim() || !body.value.trim()) { msg.className = "msg err"; msg.textContent = "Please write a subject and a message first."; return false; } return true; };

  const markBtn = el("button", { class: "btn", type: "button", style: "display:none", onclick: async () => {
    try {
      await api("/subscribers/mark", { method: "POST", body: { ids: people.map((p) => p._id), welcomed: true } });
      msg.className = "msg ok"; msg.textContent = "Done. They're now marked as welcomed."; markBtn.style.display = "none"; onDone && onDone();
    } catch (err) { msg.className = "msg err"; msg.textContent = err.message; }
  } }, welcome || to === "new" ? "I've sent it: mark as welcomed" : "I've sent it: done");
  const sent = () => { msg.className = "msg"; msg.textContent = "Your email app should have opened with the message ready. Press Send there, then come back here."; if (welcome || to === "new") markBtn.style.display = ""; };
  if (!(welcome || to === "new")) markBtn.onclick = close;

  const rows = batches.map((list, i) => el("div", { class: "row", style: "margin-top:10px;flex-wrap:wrap" },
    el("strong", { style: "min-width:150px" }, batches.length > 1 ? `Email ${i + 1} of ${batches.length} (${list.length} people)` : bulk ? `${list.length} ${list.length === 1 ? "person" : "people"}` : sub.email),
    el("button", { class: "btn", type: "button", onclick: () => { if (need()) { openLink(mailtoUrl(list)); sent(); } } }, "Open in my email app"),
    el("button", { class: "btn ghost", type: "button", onclick: () => { if (need()) { openLink(gmailUrl(list)); sent(); } } }, "Open in Gmail"),
    el("button", { class: "btn ghost small", type: "button", onclick: async () => { try { await navigator.clipboard.writeText(addrs(list)); msg.className = "msg ok"; msg.textContent = "Email addresses copied."; } catch { prompt("Copy these addresses:", addrs(list)); } } }, "Copy addresses")));

  overlay.append(el("div", { class: "card", style: "width:min(660px,100%)" },
    el("h3", {}, title),
    el("p", { class: "hint" }, bulk ? "Everyone is added as a hidden copy (BCC), so nobody sees anyone else's email. Names can't be personalised in group emails. For {guide}, the Survival Guide link is filled in for you." : "Use {name} for their first name and {guide} for the Survival Guide link."),
    el("label", {}, "Subject"), subject, el("label", {}, "Message"), body,
    el("p", { class: "hint", style: "margin-top:14px" }, "This opens your email with everything filled in. You press Send there."),
    sender ? el("p", { class: "sender-note" }, "Emails go out from ", el("strong", {}, sender), ". Use the \"Open in Gmail\" button while signed in to that Gmail account. (\"Open in my email app\" uses whichever account your computer's mail app is set up with.)") : null,
    rows, el("div", { class: "row", style: "margin-top:14px;flex-wrap:wrap" }, markBtn, el("button", { class: "btn ghost", type: "button", onclick: close }, "Close")), msg));
  document.body.append(overlay);
}

async function subscribers(main) {
  const status = await api("/email/status");
  const reload = () => navigate("subscribers");
  const bar = el("div", { class: "row", style: "flex-wrap:wrap" },
    el("button", { class: "btn", onclick: () => composer({ title: `Welcome ${status.newCount} new subscriber${status.newCount === 1 ? "" : "s"}`, to: "new", welcome: true, onDone: reload, sender: status.sender }) }, `Email new subscribers (${status.newCount})`),
    el("button", { class: "btn ghost", onclick: () => composer({ title: "Email all subscribers", to: "all", onDone: reload, sender: status.sender }) }, "Email everyone"),
    el("a", { class: "btn ghost", href: "/api/admin/subscribers/export" }, "Export CSV"));
  return pagedList(main, {
    endpoint: "/subscribers", search: true, headers: ["Joined", "Email", "Name", "Status", ""], extra: bar,
    row: (sub, again) => {
      const out = sub.status === "unsubscribed";
      const st = out ? "Unsubscribed" : sub.welcomed ? "Welcomed" : "NEW";
      const set = (body) => async () => { await api("/subscribers/mark", { method: "POST", body: { ids: [sub._id], ...body } }); reload(); };
      return el("tr", { class: st === "NEW" ? "unread" : "" }, el("td", {}, fmt(sub.createdAt)), el("td", {}, sub.email), el("td", {}, sub.name), el("td", {}, st),
        el("td", {}, el("div", { class: "row" },
          out ? null : el("button", { class: "btn small", onclick: () => composer({ title: "Email " + sub.email, to: sub._id, sub, welcome: !sub.welcomed, onDone: reload, sender: status.sender }) }, sub.welcomed ? "Email" : "Send welcome"),
          el("button", { class: "btn ghost small", title: out ? "Allow emails again" : "They asked to stop getting emails", onclick: set({ status: out ? "active" : "unsubscribed" }) }, out ? "Re-add" : "Opt out"),
          el("button", { class: "btn danger small", onclick: async () => { if (confirm(`Remove ${sub.email}?`)) { await api("/subscribers/" + sub._id, { method: "DELETE" }); again(); } } }, "Delete"))));
    },
  });
}

function messages(main) {
  return pagedList(main, {
    endpoint: "/messages", search: true, headers: ["Received", "From", "Message", ""],
    row: (m, reload) => el("tr", { class: m.read ? "" : "unread" }, el("td", {}, fmt(m.createdAt)),
      el("td", {}, m.name || "(no name)", el("br"), el("a", { href: "mailto:" + m.email }, m.email)), el("td", { class: "msgtext" }, m.message),
      el("td", {}, el("div", { class: "row" },
        el("button", { class: "btn ghost small", onclick: async () => { await api("/messages/" + m._id, { method: "PATCH", body: { read: !m.read } }); navigate("messages"); } }, m.read ? "Mark unread" : "Mark read"),
        el("button", { class: "btn danger small", onclick: async () => { if (confirm("Delete this message?")) { await api("/messages/" + m._id, { method: "DELETE" }); navigate("messages"); } } }, "Delete")))),
  });
}

const typeLabels = { subscribe: "New subscriber", contact: "Contact message", download: "Guide download", admin_login: "Admin sign-in", admin_login_failed: "Failed sign-in", settings_updated: "Settings changed", email_sent: "Email sent", subscribers_marked: "Subscribers updated", unsubscribe: "Unsubscribed", video_uploaded: "Video uploaded", video_removed: "Video removed", password_changed: "Password changed", export: "Subscribers exported", subscriber_deleted: "Subscriber deleted", message_deleted: "Message deleted" };
function activity(main) {
  return pagedList(main, {
    endpoint: "/logs", search: false, headers: ["When", "Event", "Details", "Visitor ID"],
    row: (l) => el("tr", {}, el("td", {}, fmt(l.createdAt)), el("td", {}, typeLabels[l.type] || l.type),
      el("td", {}, Object.entries(l.detail || {}).map(([k, v]) => `${k}: ${v}`).join(" · ")), el("td", { class: "hint" }, l.ip)),
  });
}

/* ---------- Settings ---------- */
async function settingsView(main) {
  const s = await api("/settings");
  const on = el("input", { type: "checkbox", checked: s.announcement.enabled });
  const text = el("input", { type: "text", maxlength: 200, value: s.announcement.text, placeholder: "e.g. New guide: how to blend clip-ins!" });
  const link = el("input", { type: "text", value: s.announcement.link, placeholder: "Optional link, e.g. hair.html" });
  const vids = {}; const vidLabels = { home: "Homepage (Video Masterclass section)", hair: "Hair page + the hair guides", lash: "Lash page + the lash guides", nails: "Nails page + the nail guides" };
  for (const k of Object.keys(vidLabels)) vids[k] = el("input", { type: "text", value: s.videos[k], placeholder: "Or paste a YouTube link" });
  const titles = {}; for (const k of Object.keys(vidLabels)) titles[k] = el("input", { type: "text", maxlength: 100, value: s.videoTitles?.[k] || "", placeholder: "e.g. How to apply clip-in extensions" });
  const uploadBox = (k) => {
    const state = el("p", { class: "hint", style: "margin:4px 0" }, s.videoFiles[k] ? "Uploaded video: " + (s.videoNames?.[k] || "video") : "No video uploaded");
    const file = el("input", { type: "file", accept: "video/mp4,video/webm" });
    const prog = el("span", { class: "hint" });
    const up = el("button", { class: "btn small", type: "button", onclick: () => {
      const f = file.files[0];
      if (!f) return (prog.textContent = "Choose a video file first.");
      if (f.size > 100 * 1024 * 1024) return (prog.textContent = "Too large: maximum 100 MB.");
      up.disabled = true;
      const x = new XMLHttpRequest();
      x.open("POST", "/api/admin/video/" + k);
      x.setRequestHeader("Content-Type", f.type); x.setRequestHeader("X-Requested-With", "admin"); x.setRequestHeader("X-Filename", encodeURIComponent(f.name));
      x.upload.onprogress = (e) => { prog.textContent = "Uploading " + Math.round((e.loaded / e.total) * 100) + "%"; };
      x.onload = () => {
        up.disabled = false;
        let r = {}; try { r = JSON.parse(x.responseText); } catch {}
        if (x.status === 200) { prog.textContent = "Uploaded and live."; state.textContent = "Uploaded video: " + r.name; file.value = ""; }
        else prog.textContent = r.error || "Upload failed.";
      };
      x.onerror = () => { up.disabled = false; prog.textContent = "Upload failed. Check your connection."; };
      x.send(f);
    } }, "Upload video");
    const rm = el("button", { class: "btn danger small", type: "button", onclick: async () => { if (confirm("Remove the uploaded video?")) { await api("/video/" + k, { method: "DELETE" }); state.textContent = "No video uploaded"; prog.textContent = "Removed."; } } }, "Remove");
    return el("div", { style: "border:1px solid var(--line);border-radius:10px;padding:12px;margin-top:12px" }, el("strong", {}, vidLabels[k]), state,
      el("div", { class: "row", style: "flex-wrap:wrap" }, file, up, rm, prog), el("label", {}, "YouTube link ", el("span", { class: "hint" }, "(used only if no video is uploaded; press Save changes at the bottom)")), vids[k], el("label", {}, "Title shown on the video ", el("span", { class: "hint" }, "(optional)")), titles[k]);
  };
  // Insider Club content
  const perkRows = [...Array(4)].map((_, i) => { const p = (s.clubPerks || [])[i] || {}; return { title: el("input", { type: "text", maxlength: 80, value: p.title || "", placeholder: "Offer title, e.g. 15% off at Brand X" }), text: el("input", { type: "text", maxlength: 300, value: p.text || "", placeholder: "Details" }), code: el("input", { type: "text", maxlength: 40, value: p.code || "", placeholder: "Discount code (optional)" }), link: el("input", { type: "text", value: p.link || "", placeholder: "Link (optional)" }) }; });
  const postRows = [...Array(4)].map((_, i) => { const p = (s.clubPosts || [])[i] || {}; return { title: el("input", { type: "text", maxlength: 100, value: p.title || "", placeholder: "Post title, e.g. October tip: protect your lashes" }), text: el("textarea", { rows: 3, maxlength: 1200, placeholder: "Write your update or tip here..." }, p.text || "") }; });
  const qna = { title: el("input", { type: "text", maxlength: 100, value: s.qna?.title || "", placeholder: "e.g. October live Q&A with a lash technician" }), when: el("input", { type: "text", maxlength: 100, value: s.qna?.when || "", placeholder: "e.g. Thursday 30 October, 7pm" }), link: el("input", { type: "text", value: s.qna?.link || "", placeholder: "Join link (Zoom / Instagram Live / YouTube)" }) };
  const msg = el("p", { class: "msg", role: "status" });

  main.append(el("form", { class: "card", style: "max-width:680px", onsubmit: async (e) => {
    e.preventDefault(); msg.className = "msg"; msg.textContent = "Saving…";
    try {
      await api("/settings", { method: "PUT", body: { announcement: { enabled: on.checked, text: text.value, link: link.value }, videos: Object.fromEntries(Object.entries(vids).map(([k, i]) => [k, i.value])), videoTitles: Object.fromEntries(Object.entries(titles).map(([k, i]) => [k, i.value])), clubPosts: postRows.map((r) => ({ title: r.title.value, text: r.text.value })), clubPerks: perkRows.map((r) => ({ title: r.title.value, text: r.text.value, code: r.code.value, link: r.link.value })), qna: { title: qna.title.value, when: qna.when.value, link: qna.link.value }, contactEmail: s.contactEmail } });
      msg.className = "msg ok"; msg.textContent = "Saved. Changes are live on the website.";
    } catch (err) { msg.className = "msg err"; msg.textContent = err.message; }
  } },
    el("h3", {}, "Announcement bar"),
    el("label", {}, on, " Show the bar at the top of every page"),
    el("label", {}, "Message"), text, el("label", {}, "Link ", el("span", { class: "hint" }, "(optional)")), link,
    el("h3", { style: "margin-top:26px" }, "Video masterclasses"), el("p", { class: "hint" }, "Upload an MP4 or WebM file (max 100 MB; uploads go live immediately), or paste a YouTube link and press Save."),
    Object.keys(vidLabels).map(uploadBox),
    el("h3", { style: "margin-top:26px" }, "Insider Club: posts from you"),
    el("p", { class: "hint" }, "Tips and news for members. The newest post goes first (Post 1). Leave empty to show the default welcome tips."),
    postRows.map((r, i) => el("div", { style: "border:1px solid var(--line);border-radius:10px;padding:12px;margin-top:10px" }, el("strong", {}, "Post " + (i + 1)), r.title, r.text)),
    el("h3", { style: "margin-top:26px" }, "Insider Club: member perks"),
    el("p", { class: "hint" }, "Shown only to people who have joined the club (on their Insider Club page). Add partner discounts here once you have them. Leave empty if you have none yet."),
    perkRows.map((r, i) => el("div", { style: "border:1px solid var(--line);border-radius:10px;padding:12px;margin-top:10px" }, el("strong", {}, "Perk " + (i + 1)), r.title, r.text, el("div", { class: "row", style: "margin-top:8px" }, r.code, r.link))),
    el("h3", { style: "margin-top:26px" }, "Insider Club: next live Q&A"),
    el("p", { class: "hint" }, "Leave blank if there is no date yet. Members will be told you'll announce it by email."),
    el("label", {}, "Title"), qna.title, el("label", {}, "Date and time"), qna.when, el("label", {}, "Join link"), qna.link,
    el("button", { class: "btn", type: "submit", style: "margin-top:20px" }, "Save changes"), msg));

  const pmsg = el("p", { class: "msg", role: "status" });
  const cur = el("input", { type: "password", autocomplete: "current-password" }), nxt = el("input", { type: "password", autocomplete: "new-password" });
  main.append(el("form", { class: "card", style: "max-width:680px;margin-top:16px", onsubmit: async (e) => {
    e.preventDefault(); pmsg.className = "msg";
    try { await api("/password", { method: "POST", body: { current: cur.value, next: nxt.value } }); pmsg.className = "msg ok"; pmsg.textContent = "Password changed."; cur.value = nxt.value = ""; }
    catch (err) { pmsg.className = "msg err"; pmsg.textContent = err.message; }
  } }, el("h3", {}, "Change admin password"), el("label", {}, "Current password"), cur, el("label", {}, "New password ", el("span", { class: "hint" }, "(10+ characters)")), nxt,
    el("button", { class: "btn", type: "submit", style: "margin-top:16px" }, "Change password"), pmsg));
}

start().catch(showLogin);
