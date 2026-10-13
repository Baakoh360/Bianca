# The Beauty Journal

## Run
    npm install
    node server.js      # http://localhost:3000   admin: http://localhost:3000/admin/

Settings live in `.env` (never commit or share it): `MONGODB_URI`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD` (initial admin password, change it in Admin > Site settings), `SESSION_SECRET`.

## Admin panel (/admin/)
Dashboard (sign-ups, page views, downloads), subscribers (search, delete, CSV export),
contact messages (read/unread/delete), activity log, announcement bar, YouTube video links, password change.

## Content
Edit `build.mjs`, then `node build.mjs`. Survival Guide source: `tools/survival-guide.html`.

## Deploy (needs a Node host: Render, Railway, Fly.io, VPS)
Set the same env vars on the host plus `NODE_ENV=production` and `TRUST_PROXY=1`.
In MongoDB Atlas > Network Access, allow the host's IP (or 0.0.0.0/0).
Before launch set `SITE.url` and `SITE.email` in `build.mjs` and rebuild.

## Emailing subscribers (from your own email)
The website never sends email itself. In Admin > Subscribers, new sign-ups are marked NEW. Click "Send welcome" (one person),
"Email new subscribers" or "Email everyone": this opens YOUR email app (or Gmail in the browser) with the message ready.
Group emails use BCC (nobody sees other addresses) and are split into batches of 40. Press Send in your email app, then
click "I've sent it: mark as welcomed" so they stop showing as NEW. Use "Opt out" when someone replies "unsubscribe".
(The optional SMTP_* settings in .env are not needed; leave them empty.)

## Video uploads
Admin > Site settings > Video masterclasses: upload MP4 or WebM (max 100 MB each). Videos are stored in
MongoDB, so they survive redeploys. Mind your Atlas storage limit (free tier: 512 MB total).

## Insider Club (members page)
After joining, people land on /club.html: their Survival Guide, two printable toolkits (downloads/), member perks and the next live Q&A.
Perks and Q&A are set in Admin > Site settings (leave blank until you have them; members then see an honest "coming soon").
Members are recognised by the email they joined with (stored in their browser); "Already a member?" lets them reopen it on another device.
Toolkit sources: tools/toolkit-*.html (re-export to PDF like the Survival Guide).

## Marketing and analytics (Admin > Analytics)
- First-party, cookie-free analytics: page views, unique visitors, sign-ups, visitor-to-sign-up rate, traffic sources, devices, tracked campaigns. Export CSV for reports.
- Campaign link builder: make a tracked link (utm_source / utm_medium / utm_campaign) for every social post, ad or email. Visits and sign-ups are credited to the campaign.
- Optional Google Analytics 4: paste the Measurement ID (G-...) in Site settings. It loads only after a visitor accepts the cookie banner.
- Social links (footer), share buttons on every guide (with tracking), Open Graph / Twitter cards, canonical links and sitemap use the live web address automatically (set PUBLIC_URL on the host to force one).

## Google Search Console (get found on Google)
Admin > Site settings > Google Search Console: paste the verification code from Search Console's "HTML tag" method; the site then adds the tag to every page.
Then in Search Console submit https://YOUR-SITE/sitemap.xml. robots.txt already allows crawling; the admin area is marked noindex.
