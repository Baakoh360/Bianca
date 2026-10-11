// The Beauty Journal: web server + admin API, backed by MongoDB.
// Run:  node server.js      (reads settings from .env)
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { MongoClient, ObjectId, GridFSBucket } from "mongodb";
import nodemailer from "nodemailer";

const ROOT = dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(join(ROOT, ".env")); } catch { /* env may come from the host */ }
const { MONGODB_URI, ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_SECRET } = process.env;
const PORT = process.env.PORT || 3000;
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const MAX_VIDEO = 100 * 1024 * 1024; // 100 MB
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const IS_PROD = process.env.NODE_ENV === "production";
if (!SESSION_SECRET || SESSION_SECRET.length < 32) { console.error("Set SESSION_SECRET (32+ chars) in .env"); process.exit(1); }

const HIDDEN = /^\/(node_modules|tools|data)(\/|$)|^\/(server\.js|build\.mjs|package(-lock)?\.json|README\.md)$|^\/\.|\.env/i;
const TYPES = {
  ".mp4": "video/mp4", ".webm": "video/webm",
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml", ".pdf": "application/pdf", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
};

/* ---------- Database ---------- */
let db = null;
async function connect() {
  if (!MONGODB_URI) { console.error("MONGODB_URI missing: forms and admin disabled."); return; }
  for (;;) {
    try {
      const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
      await client.connect();
      db = client.db();
      await Promise.all([
        db.collection("subscribers").createIndex({ email: 1 }, { unique: true }),
        db.collection("subscribers").createIndex({ createdAt: -1 }),
        db.collection("messages").createIndex({ createdAt: -1 }),
        db.collection("logs").createIndex({ createdAt: -1 }),
        db.collection("logs").createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 }), // keep logs 180 days
        db.collection("admins").createIndex({ email: 1 }, { unique: true }),
      ]);
      await ensureAdmin();
      console.log("MongoDB connected.");
      return;
    } catch (e) {
      console.error("MongoDB connection failed, retrying in 10s:", e.message);
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
}

/* ---------- Helpers ---------- */
const hashPw = (pw, salt = crypto.randomBytes(16).toString("hex")) =>
  new Promise((res, rej) => crypto.scrypt(pw, salt, 64, (e, k) => (e ? rej(e) : res({ salt, hash: k.toString("hex") }))));
async function checkPw(pw, rec) {
  const { hash } = await hashPw(pw, rec.salt);
  const a = Buffer.from(hash, "hex"), b = Buffer.from(rec.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function ensureAdmin() {
  const admins = db.collection("admins");
  if (await admins.countDocuments() || !ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  const { salt, hash } = await hashPw(ADMIN_PASSWORD);
  await admins.insertOne({ email: ADMIN_EMAIL.toLowerCase(), salt, hash, createdAt: new Date() });
  console.log(`Created admin account ${ADMIN_EMAIL} (password is ADMIN_PASSWORD in .env). Change it in the admin panel.`);
}

const clientIp = (req) => (TRUST_PROXY && req.headers["x-forwarded-for"]?.split(",")[0].trim()) || req.socket.remoteAddress || "";
const ipHash = (ip) => crypto.createHmac("sha256", SESSION_SECRET).update(ip).digest("hex").slice(0, 16); // never store raw IPs
const validEmail = (e) => typeof e === "string" && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const clean = (v, n) => String(v ?? "").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, n);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buckets = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const list = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now); buckets.set(key, list);
  return list.length > max;
}
const attempts = (key, windowMs) => (buckets.get(key) || []).filter((t) => Date.now() - t < windowMs).length;
const record = (key) => { const l = buckets.get(key) || []; l.push(Date.now()); buckets.set(key, l); };
setInterval(() => { const now = Date.now(); for (const [k, v] of buckets) if (!v.some((t) => now - t < 3600000)) buckets.delete(k); }, 600000).unref();

async function log(type, req, detail = {}) {
  if (!db) return;
  try {
    await db.collection("logs").insertOne({ type, detail, ip: ipHash(clientIp(req)), ua: clean(req.headers["user-agent"], 200), createdAt: new Date() });
  } catch { /* logging must never break a request */ }
}

const json = (res, code, obj, headers = {}) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers }); res.end(JSON.stringify(obj)); };
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 20000) { reject(new Error("too large")); req.destroy(); } });
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch (e) { reject(e); } });
  });
}

/* ---------- Sessions (signed cookie) ---------- */
const COOKIE = "tbj_admin";
const sign = (s) => crypto.createHmac("sha256", SESSION_SECRET).update(s).digest("base64url");
function makeToken(email) {
  const p = Buffer.from(JSON.stringify({ email, exp: Date.now() + 8 * 3600 * 1000 })).toString("base64url");
  return `${p}.${sign(p)}`;
}
function readSession(req) {
  const m = (req.headers.cookie || "").match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [p, sig] = m[1].split(".");
  if (!p || !sig || sig.length !== sign(p).length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sign(p)))) return null;
  try { const d = JSON.parse(Buffer.from(p, "base64url").toString()); return d.exp > Date.now() ? d : null; } catch { return null; }
}
const cookie = (val, maxAge) => `${COOKIE}=${val}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${IS_PROD ? "; Secure" : ""}`;

/* ---------- Settings ---------- */
const DEFAULT_SETTINGS = {
  announcement: { enabled: false, text: "", link: "" },
  videos: { home: "", hair: "", lash: "", nails: "" },
  videoFiles: { home: "", hair: "", lash: "", nails: "" },
  videoNames: { home: "", hair: "", lash: "", nails: "" },
  videoTitles: { home: "", hair: "", lash: "", nails: "" },
  clubPerks: [],
  clubPosts: [],
  qna: { title: "", when: "", link: "" },
  contactEmail: "",
};
async function getSettings() {
  const s = db ? await db.collection("settings").findOne({ _id: "site" }) : null;
  return { ...DEFAULT_SETTINGS, ...(s || {}), announcement: { ...DEFAULT_SETTINGS.announcement, ...(s?.announcement || {}) }, videos: { ...DEFAULT_SETTINGS.videos, ...(s?.videos || {}) }, videoFiles: { ...DEFAULT_SETTINGS.videoFiles, ...(s?.videoFiles || {}) }, videoNames: { ...DEFAULT_SETTINGS.videoNames, ...(s?.videoNames || {}) }, videoTitles: { ...DEFAULT_SETTINGS.videoTitles, ...(s?.videoTitles || {}) }, clubPerks: s?.clubPerks || [], clubPosts: s?.clubPosts || [], qna: { ...DEFAULT_SETTINGS.qna, ...(s?.qna || {}) } };
}
const ytId = (v) => { const m = String(v).match(/(?:v=|youtu\.be\/|embed\/|shorts\/)?([A-Za-z0-9_-]{11})(?:[?&].*)?$/); return m ? m[1] : ""; };

/* ---------- Email ---------- */
const mailer = SMTP_HOST && SMTP_USER && SMTP_PASS
  ? nodemailer.createTransport({ host: SMTP_HOST, port: +SMTP_PORT || 465, secure: (+SMTP_PORT || 465) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } })
  : null;
const unsubToken = (email) => sign("unsub:" + email).slice(0, 32);
const unsubUrl = (email) => `${PUBLIC_URL}/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubToken(email)}`;
const escHtml = (t) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function buildEmail(sub, body) {
  const guide = `${PUBLIC_URL}/downloads/Hair-Lash-Nail-Survival-Guide.pdf`;
  const text = body.replaceAll("{name}", sub.name || "there").replaceAll("{guide}", guide);
  const unsub = unsubUrl(sub.email);
  const paras = escHtml(text).split(/\n{2,}/).map((p) => `<p style="margin:0 0 16px">${p.replace(/\n/g, "<br>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#5b2a4e">$1</a>')}</p>`).join("");
  const html = `<div style="background:#faf6f1;padding:24px"><div style="max-width:560px;margin:auto;background:#fff;border-radius:14px;padding:28px;font:16px/1.6 Georgia,serif;color:#2a1f2d"><div style="font-size:20px;font-weight:bold;color:#3f1b36;margin-bottom:18px">The Beauty <i style="color:#c9667a">Journal</i></div>${paras}<hr style="border:0;border-top:1px solid #eadfd8;margin:24px 0 12px"><p style="font:12px Arial,sans-serif;color:#6b5d6e">You're receiving this because you joined the Beauty Insider Club. <a href="${unsub}" style="color:#6b5d6e">Unsubscribe</a></p></div></div>`;
  return { text: text + `\n\n--\nUnsubscribe: ${unsub}`, html, unsub };
}

/* ---------- Video storage (MongoDB GridFS) ---------- */
const bucket = () => new GridFSBucket(db, { bucketName: "videos" });
async function serveMedia(req, res, id) {
  const _id = oid(id);
  const f = _id && db ? await db.collection("videos.files").findOne({ _id }) : null;
  if (!f) { res.writeHead(404); return res.end("Not found"); }
  const size = f.length;
  let start = 0, end = size - 1, status = 200;
  const m = (req.headers.range || "").match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    if (m[1] === "") start = Math.max(0, size - +m[2]); else { start = +m[1]; if (m[2] !== "") end = Math.min(+m[2], size - 1); }
    if (start > end || start >= size) { res.writeHead(416, { "Content-Range": `bytes */${size}` }); return res.end(); }
    status = 206;
  }
  const headers = { "Content-Type": f.metadata?.type || "video/mp4", "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" };
  if (status === 206) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  res.writeHead(status, headers);
  bucket().openDownloadStream(_id, { start, end: end + 1 }).on("error", () => res.destroy()).pipe(res);
}

async function receiveVideo(req, res, slot, session) {
  const type = (req.headers["content-type"] || "").split(";")[0];
  const len = +req.headers["content-length"];
  if (!["video/mp4", "video/webm"].includes(type)) return json(res, 400, { error: "Only MP4 or WebM videos are allowed." });
  if (!len || len > MAX_VIDEO) return json(res, 413, { error: `Video is too large. Maximum is ${MAX_VIDEO / 1048576} MB.` });
  let name = "video";
  try { name = clean(decodeURIComponent(req.headers["x-filename"] || "video"), 120); } catch { /* keep default */ }
  const up = bucket().openUploadStream(name, { metadata: { type, slot } });
  let n = 0, first = true;
  const guard = new Transform({
    transform(chunk, _, cb) {
      n += chunk.length;
      if (n > MAX_VIDEO) return cb(new Error("Video is too large."));
      if (first) {
        first = false;
        const ok = type === "video/webm" ? chunk.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) : chunk.subarray(4, 8).toString() === "ftyp";
        if (!ok) return cb(new Error("That file isn't a valid video."));
      }
      cb(null, chunk);
    },
  });
  try { await pipeline(req, guard, up); }
  catch (e) { await up.abort().catch(() => {}); return json(res, 400, { error: e.message || "Upload failed." }); }
  const prev = (await getSettings()).videoFiles[slot];
  await db.collection("settings").updateOne({ _id: "site" }, { $set: { [`videoFiles.${slot}`]: up.id.toString(), [`videoNames.${slot}`]: name } }, { upsert: true });
  if (prev && oid(prev)) await bucket().delete(oid(prev)).catch(() => {});
  await log("video_uploaded", req, { slot, name, by: session.email });
  json(res, 200, { ok: true, id: up.id.toString(), name });
}

/* ---------- Public API ---------- */
async function publicApi(req, res, path) {
  if (path === "/api/settings" && req.method === "GET") {
    const s = await getSettings();
    return json(res, 200, { announcement: s.announcement.enabled ? s.announcement : null, videos: s.videos, videoFiles: s.videoFiles, videoTitles: s.videoTitles });
  }
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const ip = clientIp(req);
  if (path === "/api/member") {
    if (limited("m" + ip, 40, 600000)) return json(res, 429, { error: "Too many attempts, try again later." });
    if (!db) return json(res, 503, { error: "Database unavailable" });
    let d; try { d = await readBody(req); } catch { return json(res, 400, { error: "bad request" }); }
    const email = clean(d.email, 254).toLowerCase();
    const m = validEmail(email) ? await db.collection("subscribers").findOne({ email, status: { $ne: "unsubscribed" } }) : null;
    if (!m) return json(res, 404, { member: false });
    const st = await getSettings();
    return json(res, 200, { member: true, name: m.name || "", perks: st.clubPerks, posts: st.clubPosts, qna: st.qna.title ? st.qna : null });
  }
  let d;
  try { d = await readBody(req); } catch { return json(res, 400, { error: "bad request" }); }

  if (path === "/api/track") {
    if (limited("t" + ip, 120, 600000) || !db) return json(res, 204, {});
    const p = clean(d.path, 200);
    if (!p.startsWith("/") || p.startsWith("/admin")) return json(res, 204, {});
    await log("pageview", req, { path: p, ref: clean(d.ref, 200) });
    return json(res, 204, {});
  }

  if (limited("f" + ip, 10, 600000)) return json(res, 429, { error: "Too many attempts, try again later." });
  if (!db) return json(res, 503, { error: "Database unavailable" });
  if (d.website) return json(res, 200, { ok: true }); // honeypot field: bots fill it in
  const email = clean(d.email, 254).toLowerCase();
  if (!validEmail(email)) return json(res, 400, { error: "invalid email" });

  if (path === "/api/subscribe") {
    const r = await db.collection("subscribers").updateOne(
      { email },
      { $setOnInsert: { email, name: clean(d.name, 80), source: clean(d.source, 200), status: "active", createdAt: new Date() } },
      { upsert: true });
    if (r.upsertedCount) await log("subscribe", req, { email, source: clean(d.source, 200) });
    return json(res, 200, { ok: true, duplicate: !r.upsertedCount });
  }
  if (path === "/api/contact") {
    const message = clean(d.message, 3000);
    if (!message) return json(res, 400, { error: "message required" });
    await db.collection("messages").insertOne({ name: clean(d.name, 80), email, message, read: false, createdAt: new Date() });
    await log("contact", req, { email });
    return json(res, 200, { ok: true });
  }
  json(res, 404, { error: "not found" });
}

/* ---------- Admin API ---------- */
const oid = (id) => { try { return new ObjectId(id); } catch { return null; } };
const csvCell = (v) => { let s = String(v ?? "").replace(/[\r\n]+/g, " "); if (/^[=+\-@\t]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };

async function adminApi(req, res, path, url) {
  const ip = clientIp(req);

  if (path === "/api/admin/login" && req.method === "POST") {
    if (attempts("l" + ip, 900000) >= 5) return json(res, 429, { error: "Too many attempts. Try again in 15 minutes." });
    if (!db) return json(res, 503, { error: "Database unavailable" });
    let d; try { d = await readBody(req); } catch { return json(res, 400, { error: "bad request" }); }
    const rec = await db.collection("admins").findOne({ email: clean(d.email, 254).toLowerCase() });
    const ok = rec ? await checkPw(String(d.password ?? ""), rec) : (await hashPw("x"), false); // equalise timing
    await log(ok ? "admin_login" : "admin_login_failed", req, { email: clean(d.email, 254) });
    if (!ok) { record("l" + ip); return json(res, 401, { error: "Wrong email or password." }); }
    return json(res, 200, { ok: true, email: rec.email }, { "Set-Cookie": cookie(makeToken(rec.email), 8 * 3600) });
  }

  const session = readSession(req);
  if (!session) return json(res, 401, { error: "Not signed in" });
  if (!db) return json(res, 503, { error: "Database unavailable" });
  if (req.method !== "GET" && req.headers["x-requested-with"] !== "admin") return json(res, 403, { error: "forbidden" });

  const subs = db.collection("subscribers"), msgs = db.collection("messages"), logs = db.collection("logs");
  const page = Math.max(1, +url.searchParams.get("page") || 1), per = 25;
  const q = clean(url.searchParams.get("q"), 100);

  if (path === "/api/admin/me") return json(res, 200, { email: session.email });
  if (path === "/api/admin/logout") return json(res, 200, { ok: true }, { "Set-Cookie": cookie("", 0) });

  if (path === "/api/admin/stats") {
    const since = new Date(Date.now() - 14 * 86400000);
    const day = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
    const [totalSubs, newSubs7, totalMsgs, unread, views7, viewsByDay, subsByDay, topPages, sources] = await Promise.all([
      subs.countDocuments(),
      subs.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } }),
      msgs.countDocuments(), msgs.countDocuments({ read: false }),
      logs.countDocuments({ type: "pageview", createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } }),
      logs.aggregate([{ $match: { type: "pageview", createdAt: { $gte: since } } }, { $group: { _id: day, n: { $sum: 1 } } }]).toArray(),
      subs.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: day, n: { $sum: 1 } } }]).toArray(),
      logs.aggregate([{ $match: { type: "pageview", createdAt: { $gte: since } } }, { $group: { _id: "$detail.path", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]).toArray(),
      subs.aggregate([{ $group: { _id: "$source", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 6 }]).toArray(),
    ]);
    const downloads = await logs.countDocuments({ type: "download" });
    const days = [...Array(14)].map((_, i) => new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(0, 10));
    const map = (arr) => Object.fromEntries(arr.map((x) => [x._id, x.n]));
    const v = map(viewsByDay), s = map(subsByDay);
    return json(res, 200, {
      totalSubs, newSubs7, totalMsgs, unread, views7, downloads,
      series: days.map((d) => ({ day: d, views: v[d] || 0, signups: s[d] || 0 })),
      topPages: topPages.map((x) => ({ path: x._id, n: x.n })), sources: sources.map((x) => ({ source: x._id || "(unknown)", n: x.n })),
    });
  }

  if (path === "/api/admin/subscribers" && req.method === "GET") {
    const filter = q ? { $or: [{ email: { $regex: esc(q), $options: "i" } }, { name: { $regex: esc(q), $options: "i" } }] } : {};
    const [items, total] = await Promise.all([subs.find(filter).sort({ createdAt: -1 }).skip((page - 1) * per).limit(per).toArray(), subs.countDocuments(filter)]);
    return json(res, 200, { items, total, page, per });
  }
  if (path === "/api/admin/subscribers/export") {
    const all = await subs.find({}).sort({ createdAt: -1 }).toArray();
    await log("export", req, { count: all.length, by: session.email });
    const csv = "date,email,name,source,status\n" + all.map((s) => [s.createdAt.toISOString(), s.email, s.name, s.source, s.status].map(csvCell).join(",")).join("\n") + "\n";
    res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="subscribers.csv"', "Cache-Control": "no-store" });
    return res.end("﻿" + csv);
  }
  let m = path.match(/^\/api\/admin\/subscribers\/([a-f0-9]{24})$/);
  if (m && req.method === "DELETE") {
    const r = await subs.deleteOne({ _id: oid(m[1]) });
    await log("subscriber_deleted", req, { by: session.email });
    return json(res, 200, { ok: !!r.deletedCount });
  }

  if (path === "/api/admin/messages" && req.method === "GET") {
    const filter = q ? { $or: [{ email: { $regex: esc(q), $options: "i" } }, { message: { $regex: esc(q), $options: "i" } }, { name: { $regex: esc(q), $options: "i" } }] } : {};
    const [items, total] = await Promise.all([msgs.find(filter).sort({ createdAt: -1 }).skip((page - 1) * per).limit(per).toArray(), msgs.countDocuments(filter)]);
    return json(res, 200, { items, total, page, per });
  }
  m = path.match(/^\/api\/admin\/messages\/([a-f0-9]{24})$/);
  if (m && req.method === "PATCH") {
    let d; try { d = await readBody(req); } catch { return json(res, 400, { error: "bad request" }); }
    await msgs.updateOne({ _id: oid(m[1]) }, { $set: { read: !!d.read } });
    return json(res, 200, { ok: true });
  }
  if (m && req.method === "DELETE") {
    const r = await msgs.deleteOne({ _id: oid(m[1]) });
    await log("message_deleted", req, { by: session.email });
    return json(res, 200, { ok: !!r.deletedCount });
  }

  if (path === "/api/admin/logs") {
    const type = clean(url.searchParams.get("type"), 30);
    const filter = type ? { type } : { type: { $ne: "pageview" } };
    const [items, total] = await Promise.all([logs.find(filter).sort({ createdAt: -1 }).skip((page - 1) * per).limit(per).toArray(), logs.countDocuments(filter)]);
    return json(res, 200, { items, total, page, per });
  }

  if (path === "/api/admin/settings") {
    if (req.method === "GET") return json(res, 200, await getSettings());
    if (req.method === "PUT") {
      let d; try { d = await readBody(req); } catch { return json(res, 400, { error: "bad request" }); }
      const link = clean(d.announcement?.link, 300);
      if (link && !/^(https?:\/\/|\/|#|[a-z0-9-]+\.html)/i.test(link)) return json(res, 400, { error: "Banner link must be a web address or page." });
      const videos = {};
      for (const k of Object.keys(DEFAULT_SETTINGS.videos)) {
        const raw = clean(d.videos?.[k], 200);
        if (raw && !ytId(raw)) return json(res, 400, { error: `"${raw}" is not a valid YouTube link or ID (${k}).` });
        videos[k] = raw ? ytId(raw) : "";
      }
      const videoTitles = {};
      for (const k of Object.keys(DEFAULT_SETTINGS.videoTitles)) videoTitles[k] = clean(d.videoTitles?.[k], 100);
      const safeLink = (v) => { const l = clean(v, 300); return /^(https?:\/\/|\/|[a-z0-9-]+\.html)/i.test(l) ? l : ""; };
      const clubPerks = (Array.isArray(d.clubPerks) ? d.clubPerks : []).slice(0, 8).map((p) => ({ title: clean(p?.title, 80), text: clean(p?.text, 300), code: clean(p?.code, 40), link: safeLink(p?.link) })).filter((p) => p.title);
      const clubPosts = (Array.isArray(d.clubPosts) ? d.clubPosts : []).slice(0, 6).map((p) => ({ title: clean(p?.title, 100), text: String(p?.text ?? "").replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, 1200) })).filter((p) => p.title && p.text);
      const qna = { title: clean(d.qna?.title, 100), when: clean(d.qna?.when, 100), link: safeLink(d.qna?.link) };
      const next = { clubPerks, clubPosts, qna, announcement: { enabled: !!d.announcement?.enabled, text: clean(d.announcement?.text, 200), link }, videos, videoTitles, contactEmail: clean(d.contactEmail, 254) };
      await db.collection("settings").updateOne({ _id: "site" }, { $set: next }, { upsert: true });
      await log("settings_updated", req, { by: session.email });
      return json(res, 200, { ok: true, settings: next });
    }
  }

  const vm = path.match(/^\/api\/admin\/video\/(home|hair|lash|nails)$/);
  if (vm && req.method === "POST") return receiveVideo(req, res, vm[1], session);
  if (vm && req.method === "DELETE") {
    const prev = (await getSettings()).videoFiles[vm[1]];
    await db.collection("settings").updateOne({ _id: "site" }, { $set: { [`videoFiles.${vm[1]}`]: "", [`videoNames.${vm[1]}`]: "" } }, { upsert: true });
    if (prev && oid(prev)) await bucket().delete(oid(prev)).catch(() => {});
    await log("video_removed", req, { slot: vm[1], by: session.email });
    return json(res, 200, { ok: true });
  }

  if (path === "/api/admin/subscribers/emails" && req.method === "GET") {
    const to = url.searchParams.get("to");
    const filter = { status: { $ne: "unsubscribed" }, ...(to === "new" ? { welcomed: { $ne: true } } : {}) };
    const items = await subs.find(filter, { projection: { email: 1, name: 1 } }).sort({ createdAt: 1 }).limit(2000).toArray();
    return json(res, 200, { items });
  }
  if (path === "/api/admin/subscribers/mark" && req.method === "POST") {
    let d; try { d = await readBody(req); } catch { return json(res, 400, { error: "bad request" }); }
    const ids = (Array.isArray(d.ids) ? d.ids : []).slice(0, 2000).map(oid).filter(Boolean);
    if (!ids.length) return json(res, 400, { error: "No subscribers selected." });
    const set = {};
    if (typeof d.welcomed === "boolean") { set.welcomed = d.welcomed; if (d.welcomed) set.lastEmailedAt = new Date(); }
    if (["active", "unsubscribed"].includes(d.status)) set.status = d.status;
    if (!Object.keys(set).length) return json(res, 400, { error: "Nothing to change." });
    const r = await subs.updateMany({ _id: { $in: ids } }, { $set: set });
    await log("subscribers_marked", req, { count: r.modifiedCount, change: Object.keys(set).join(","), by: session.email });
    return json(res, 200, { ok: true, count: r.modifiedCount });
  }
  if (path === "/api/admin/email/status") {
    return json(res, 200, { configured: !!mailer, sender: (process.env.SENDER_EMAIL || ADMIN_EMAIL || "").toLowerCase(), from: MAIL_FROM || SMTP_USER || "", newCount: await subs.countDocuments({ status: { $ne: "unsubscribed" }, welcomed: { $ne: true } }), publicUrl: PUBLIC_URL });
  }
  if (path === "/api/admin/email" && req.method === "POST") {
    if (!mailer) return json(res, 400, { error: "Email sending isn't set up yet. Add the SMTP settings to .env (see README)." });
    let d; try { d = await readBody(req); } catch { return json(res, 400, { error: "bad request" }); }
    const subject = clean(d.subject, 150), body = String(d.body ?? "").slice(0, 10000).trim();
    if (!subject || !body) return json(res, 400, { error: "Subject and message are required." });
    const live = { status: { $ne: "unsubscribed" } };
    const filter = d.to === "new" ? { ...live, welcomed: { $ne: true } } : d.to === "all" ? live : oid(d.to) ? { _id: oid(d.to), ...live } : null;
    if (!filter) return json(res, 400, { error: "Choose who to send to." });
    const list = await subs.find(filter).limit(200).toArray();
    if (!list.length) return json(res, 400, { error: "No eligible recipients (they may have unsubscribed)." });
    let sent = 0; const failed = [];
    const markWelcome = !!d.welcome || d.to === "new";
    for (const sub of list) {
      try {
        const m = buildEmail(sub, body);
        await mailer.sendMail({ from: MAIL_FROM || SMTP_USER, to: sub.email, subject, text: m.text, html: m.html, headers: { "List-Unsubscribe": `<${m.unsub}>` } });
        await subs.updateOne({ _id: sub._id }, { $set: { lastEmailedAt: new Date(), ...(markWelcome ? { welcomed: true } : {}) } });
        sent++;
      } catch (e) { failed.push(sub.email); console.error("mail error:", e.message); }
    }
    await log("email_sent", req, { to: d.to === "new" || d.to === "all" ? d.to : list[0].email, sent, failed: failed.length, subject, by: session.email });
    return json(res, 200, { ok: true, sent, failed });
  }

  if (path === "/api/admin/password" && req.method === "POST") {
    let d; try { d = await readBody(req); } catch { return json(res, 400, { error: "bad request" }); }
    const rec = await db.collection("admins").findOne({ email: session.email });
    if (!rec || !(await checkPw(String(d.current ?? ""), rec))) return json(res, 400, { error: "Current password is wrong." });
    const next = String(d.next ?? "");
    if (next.length < 10) return json(res, 400, { error: "New password must be at least 10 characters." });
    const { salt, hash } = await hashPw(next);
    await db.collection("admins").updateOne({ email: session.email }, { $set: { salt, hash } });
    await log("password_changed", req, { by: session.email });
    return json(res, 200, { ok: true });
  }

  json(res, 404, { error: "not found" });
}

/* ---------- Static files ---------- */
async function serveStatic(req, res, path) {
  if (path === "/admin") { res.writeHead(301, { Location: "/admin/" }); return res.end(); }
  if (HIDDEN.test(path)) throw Object.assign(new Error(), { code: "ENOENT" });
  if (path.endsWith("/")) path += "index.html";
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) throw Object.assign(new Error(), { code: "ENOENT" });
  const st = await stat(file);
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  if (req.headers["if-none-match"] === etag && !path.startsWith("/admin/")) { res.writeHead(304, { ETag: etag, "Cache-Control": "no-cache" }); return res.end(); }
  const data = await readFile(file);
  const ext = extname(file);
  const headers = { "Content-Type": TYPES[ext] || "application/octet-stream", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" };
  if (path.startsWith("/admin/")) { headers["X-Frame-Options"] = "DENY"; headers["Cache-Control"] = "no-store"; headers["X-Robots-Tag"] = "noindex"; }
  else if ([".html", ".css", ".js", ".xml", ".txt"].includes(ext)) { headers["Cache-Control"] = "no-cache"; headers.ETag = etag; } // always revalidate, so updates show immediately
  else if (/\.(jpg|png|webp|svg|pdf)$/.test(ext)) { headers["Cache-Control"] = "public, max-age=3600"; headers.ETag = etag; }
  if (ext === ".pdf") {
    headers["Content-Disposition"] = `attachment; filename="${path.split("/").pop()}"`;
    if (req.method === "GET") log("download", req, { file: path });
  }
  res.writeHead(200, headers);
  res.end(req.method === "HEAD" ? undefined : data);
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    const path = decodeURIComponent(url.pathname);
    if (path.startsWith("/api/admin/")) return await adminApi(req, res, path, url);
    if (path.startsWith("/api/")) return await publicApi(req, res, path);
    const mm = path.match(/^\/media\/([a-f0-9]{24})$/);
    if (mm) return await serveMedia(req, res, mm[1]);
    if (path === "/unsubscribe") {
      const e = (url.searchParams.get("e") || "").toLowerCase(), t = url.searchParams.get("t") || "";
      const good = validEmail(e) && t.length === 32 && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(unsubToken(e)));
      if (good && db) { await db.collection("subscribers").updateOne({ email: e }, { $set: { status: "unsubscribed", unsubscribedAt: new Date() } }); await log("unsubscribe", req, { email: e }); }
      res.writeHead(good ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Unsubscribe</title><body style="font:18px/1.6 Georgia,serif;background:#faf6f1;color:#2a1f2d;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:20px"><div><h1>${good ? "You're unsubscribed" : "Invalid link"}</h1><p>${good ? "You won't receive any more emails from The Beauty Journal." : "This unsubscribe link isn't valid."}</p><p><a href="/" style="color:#5b2a4e">Back to the website</a></p></div>`);
    }
    await serveStatic(req, res, path);
  } catch (e) {
    if (e.code !== "ENOENT" && e.code !== "EISDIR") { console.error(e); if (req.url.startsWith("/api/")) return json(res, 500, { error: "server error" }); }
    try {
      const page = await readFile(join(ROOT, "404.html"));
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(page);
    } catch { res.writeHead(404); res.end("Not found"); }
  }
}).on("listening", function () { this.requestTimeout = 15 * 60 * 1000; }).listen(PORT, () => console.log(`The Beauty Journal running at http://localhost:${PORT}  (admin: /admin/)`));

connect();
