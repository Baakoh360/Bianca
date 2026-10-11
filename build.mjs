// Static site generator for The Beauty Journal.
// Run:  node build.mjs   → writes all pages into this folder.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXTRA_GUIDES } from "./guides-extra.mjs";

const OUT = dirname(fileURLToPath(import.meta.url));

// ---- CONFIG: change these before launch ----------------------------------
const SITE = {
  name: "The Beauty Journal",
  url: "https://www.example.com", // ← your real domain (used for canonical URLs + sitemap)
  email: "hello@example.com",     // ← your real contact email
  updated: "2026-10-05",
  updatedLabel: "5 October 2026",
};
// --------------------------------------------------------------------------

/* ---------- Photography (Unsplash, free to use; credits on the About page) ---------- */
const PHOTOS = {
  'home-hero':   { alt: 'Woman with long, glossy hair', w: 1000, h: 1500, pos: '50% 30%' },
  'hair-hub':    { alt: 'Woman with long dark wavy hair blowing in the wind', w: 900, h: 575, pos: '50% 40%' },
  'hair-guide':  { alt: 'Woman with long straight brown hair', w: 800, h: 534, pos: '50% 50%' },
  'lash-hub':    { alt: 'Close-up of a full set of volume lash extensions', w: 1408, h: 768, pos: '58% 50%' },
  'lash-guide':  { alt: 'Technician applying lash extensions with tweezers', w: 900, h: 1350, pos: '50% 50%' },
  'nails-hub':   { alt: 'Hand with soft nude manicured nails', w: 900, h: 1436, pos: '50% 45%' },
  'costs-guide': { alt: 'Hand with a clean white manicure', w: 800, h: 533, pos: '35% 50%' },
};
function art(name, eager = false) {
  const p = PHOTOS[name];
  const loading = eager ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"';
  return `<img class="art" src="@ROOT@images/${name}.${p.ext || "jpg"}" alt="${p.alt}" width="${p.w}" height="${p.h}" style="object-position:${p.pos}" ${loading}>`;
}

/* ---------- Layout ---------- */
const NAV = [
  ["index.html", "Home"],
  ["hair.html", "Hair Extensions"],
  ["lash.html", "Lash Care"],
  ["nails.html", "Nail Maintenance"],
  ["about.html", "About"],
];

function layout({ title, desc, path, root = "", body, jsonld = [], og = "website", noindex = false }) {
  const fullTitle = title.includes(SITE.name) ? title : `${title} | ${SITE.name}`;
  const url = `${SITE.url}/${path}`;
  const nav = NAV.map(([h, t]) => `<li><a href="${root}${h}"${path === h ? ' aria-current="page"' : ""}>${t}</a></li>`).join("");
  const ld = jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("\n");
  return `<!doctype html>
<html lang="en-GB" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${desc}">
<meta name="theme-color" content="#5b2a4e">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">`}
<meta property="og:type" content="${og}">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:title" content="${fullTitle}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,600;0,700;1,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${root}styles.css">
<link rel="stylesheet" href="${root}motion.css">
${ld}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap nav">
    <a class="logo" href="${root}index.html" aria-label="The Beauty Journal, home"><span class="logo-mark">B</span><span class="logo-text">The Beauty <em>Journal</em></span></a>
    <button class="menu-toggle" aria-label="Menu" aria-expanded="false">☰</button>
    <ul>${nav}<li><a class="btn" href="${root}index.html#club">Join the Club</a></li></ul>
  </div>
</header>
<main id="main">
${body.replaceAll("@ROOT@", root)}
</main>
<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div><h4>The Beauty Journal</h4><p>Honest hair, lash &amp; nail education for women 18–35. No sponsored fluff.</p></div>
      <div><h4>Explore</h4><a href="${root}hair.html">Hair Extensions</a><a href="${root}lash.html">Lash Care</a><a href="${root}nails.html">Nail Maintenance</a><a href="${root}guides/what-beauty-upkeep-really-costs.html">Cost Breakdown</a></div>
      <div><h4>The Journal</h4><a href="${root}about.html">About</a><a href="${root}contact.html">Contact</a><a href="${root}index.html#club">Insider Club</a><a href="${root}privacy.html">Privacy</a></div>
    </div>
    <p class="copy">© <span class="year">2026</span> ${SITE.name}. Website by Ofori Digital Media. Content is educational and not medical advice.</p>
  </div>
</footer>
${optinExtras()}
<script src="${root}script.js"></script>
<script src="${root}motion.js" defer></script>
</body>
</html>
`;
}

function optinExtras() {
  return `<div class="sticky-bar" role="region" aria-label="Subscribe">
  <div class="wrap sticky-inner">
    <p><strong>Free Survival Guide:</strong> hair, lash &amp; nail care in one PDF.</p>
    <form data-subscribe novalidate>
      <input type="email" placeholder="Your email" aria-label="Email address" required>
      <button class="btn" type="submit">Get it</button>
    </form>
    <button class="sticky-close" aria-label="Dismiss">×</button>
    <p class="sticky-msg" role="status"></p>
  </div>
</div>
<div class="modal" role="dialog" aria-modal="true" aria-label="Before you go">
  <div class="modal-card">
    <button class="modal-x" aria-label="Close">×</button>
    <form class="optin" data-subscribe novalidate>
      <h3>Before you go…</h3>
      <p>Grab the free Hair, Lash &amp; Nail Survival Guide.</p>
      <label for="e-modal">Email</label>
      <input id="e-modal" type="email" required autocomplete="email">
      <button class="btn" type="submit">Send me the guide</button>
      <p class="form-msg" role="status"></p>
    </form>
  </div>
</div>`;
}

function clubSection(id = "club", heading = "Get the Ultimate Hair, Lash &amp; Nail Survival Guide — free.") {
  return `<section class="section" id="${id}">
  <div class="wrap">
    <div class="club reveal">
      <div>
        <p class="eyebrow">The Beauty Insider Club</p>
        <h2>${heading}</h2>
        <p>Join the club and we'll send it straight to your inbox, plus:</p>
        <ul class="perks">
          <li>Early access to downloadable toolkits</li>
          <li>Exclusive discount codes from partner brands</li>
          <li>Monthly live Q&amp;A roundups</li>
        </ul>
      </div>
      <form class="optin" data-subscribe novalidate>
        <h3>Join the Insider Club</h3>
        <p>Free. No spam. Unsubscribe anytime.</p>
        <label for="n-${id}">First name</label>
        <input id="n-${id}" name="name" type="text" autocomplete="given-name">
        <label for="e-${id}">Email</label>
        <input id="e-${id}" type="email" required autocomplete="email">
        <button class="btn" type="submit">Send me the guide</button>
        <p class="form-msg" role="status"></p>
        <p class="fine">By subscribing you agree to receive emails from ${SITE.name}. See our <a href="${id === "club" ? "" : ""}privacy.html">privacy policy</a>.</p>
      </form>
    </div>
  </div>
</section>`;
}

const videoBlock = (caption, title, key = "home") => `<div class="video">
  <button class="play" data-vkey="${key}" data-yt="REPLACE_WITH_YOUTUBE_ID" data-title="${title}" aria-label="Play: ${caption}">
    <span class="play-icon">▶</span>
    <span class="caption">${caption}</span>
  </button>
</div>`;

/* ---------- Articles ---------- */
const GUIDES = [
  {
    slug: "how-to-blend-clip-in-extensions-with-short-hair",
    hub: "hair", img: "hair-guide", tag: "Hair",
    title: "How to Blend Clip-In Extensions With Short Hair",
    h1: "How to blend clip-in extensions with short hair",
    desc: "A step-by-step guide to blending clip-in hair extensions with short hair: choosing length and colour, placement, heat styling and aftercare.",
    teaser: "Layering, heat settings and placement so no one can tell.",
    video: "Masterclass: Blend clip-ins with short hair",
    lede: "Short hair and clip-ins can absolutely work together. The difference between a seamless finish and an obvious one comes down to three things: the right set, careful placement and styling the two together.",
    faq: [
      ["Can I wear clip-ins with a bob?", "Yes. Choose shorter lengths and fewer wefts, place them lower down where your hair is thickest, and curl or style everything together so the ends match."],
      ["Do clip-ins damage short hair?", "Used correctly they shouldn't. Damage usually comes from clipping onto fine, thin hair too tightly, placing heavy wefts in one spot, or sleeping in them. Take them out at night."],
      ["How many wefts do I need?", "Less is more with short hair. Many people start with a smaller set and add a weft only if the blend looks thin at the ends."],
    ],
    body: `
<h2 id="choose">1. Choose the right set</h2>
<p>With short hair, the biggest blending mistake is buying extensions that are far longer or far thicker than your own hair. A big length jump makes the join obvious.</p>
<ul>
<li><strong>Length:</strong> pick the shortest length that gives you the look you want, or ask a stylist to cut the set into your style.</li>
<li><strong>Colour:</strong> match to the mid-lengths and ends of your hair rather than the roots, as that's where the two will meet. Check in natural daylight.</li>
<li><strong>Texture:</strong> if your hair is wavy or curly, buy a set that suits it or plan on styling both together.</li>
</ul>
<div class="tip"><strong>Tip:</strong> a stylist can cut-in a new set to blend with your layers. It is usually a small cost compared to the set itself and makes the biggest difference.</div>

<h2 id="prep">2. Prep your hair</h2>
<p>Start with clean, fully dry hair. Add a little texture spray or dry shampoo at the roots so the clips grip better. Straighten or curl your own hair first, so your style is set before the extensions go in.</p>

<h2 id="place">3. Section and place the wefts</h2>
<ol>
<li>Clip the top half of your hair up out of the way.</li>
<li>Start low, near the nape, with the shortest weft. Tease a small section of hair at the root and snap the clips in against your scalp.</li>
<li>Release a new section of hair, add the next weft slightly higher and repeat. Keep the clips on a flat, secure part of the head rather than over a parting.</li>
<li>Let the top section fall over the clips to hide the join. Keep the highest weft well below your crown so the tracks stay hidden.</li>
</ol>

<h2 id="style">4. Style everything together</h2>
<p>Use a heat protectant and, if you're using heat, a moderate temperature on both your own hair and the extensions. Curling or smoothing them together helps the ends line up. A light brush with a soft bristle brush or a wide-tooth comb removes any visible lines.</p>

<h2 id="aftercare">5. Aftercare so they last</h2>
<ul>
<li>Brush from the ends upward, holding the weft at the top, to avoid tangling.</li>
<li>Wash the set sparingly, with the wefts laid flat and the clips kept away from conditioner, then let it air dry.</li>
<li>Remove them to sleep, and store them flat or hung rather than loose in a bag.</li>
<li>Use heat protectant every time and avoid high temperatures near the clips.</li>
</ul>
<p>With good care, a quality set can last many months. For the numbers, see our <a href="what-beauty-upkeep-really-costs.html">realistic cost breakdown</a>.</p>`,
  },
  {
    slug: "how-to-care-for-lash-extensions-and-gel-nails",
    hub: "lash", img: "lash-guide", tag: "Lash + Nails",
    title: "How to Care for Lash Extensions and Gel Nails",
    h1: "How to care for lash extensions and gel nails",
    desc: "One simple weekly routine to protect lash extensions and gel nails: cleansing, products to avoid, safe habits and when to book a fill or removal.",
    teaser: "One weekly routine that protects both, and what to stop doing today.",
    video: "Masterclass: Lash aftercare in 5 minutes",
    lede: "Lash extensions and gel nails fail for the same few reasons: moisture, oils, picking and pulling. The good news is that a short routine covers both.",
    faq: [
      ["How soon can I get lash extensions wet?", "Follow your technician's instructions. Many advise keeping them dry for the first 24 to 48 hours while the adhesive fully sets."],
      ["Can I use mascara on lash extensions?", "Most technicians advise against it. It can clog the lashes and is hard to remove without pulling. A lash serum should only be used if your technician says it's safe for your set."],
      ["Why do my gel nails keep lifting?", "Common causes are oils or moisture on the nail during application, too much water exposure, and using nails as tools. Cuticle oil and gloves for cleaning help."],
      ["Is it OK to peel off gel polish?", "No. Peeling takes layers of your natural nail with it. Soak off properly or have it removed by a professional."],
    ],
    body: `
<h2 id="lashes">Lash extension care</h2>
<h3>Cleanse gently, regularly</h3>
<p>Debris, oils and makeup break down the adhesive. Clean your lashes every few days with a foaming lash cleanser, brush through with a clean spoolie, rinse and pat dry. Don't rub.</p>
<h3>Avoid oils and harsh products</h3>
<ul>
<li>Skip oil-based makeup removers and cleansers around the eyes.</li>
<li>Don't use waterproof mascara, or any mascara unless your technician says so.</li>
<li>Keep heavy steam and very hot water away from your face in the first couple of days.</li>
</ul>
<h3>Hands off</h3>
<p>Picking, rubbing and pulling can take your natural lash with the extension. Sleep on your back where you can, and brush lashes only with a clean spoolie.</p>
<div class="tip"><strong>Tip:</strong> book infills every two to three weeks. Waiting longer leaves heavy, grown-out extensions that put more stress on natural lashes.</div>

<h2 id="nails">Gel nail care</h2>
<h3>Hydrate the cuticles</h3>
<p>Massage cuticle oil in daily. It keeps the skin and nail flexible, which reduces lifting and cracking.</p>
<h3>Protect from water and chemicals</h3>
<p>Wear gloves when washing up or using cleaning products. Long soaks weaken the bond.</p>
<h3>Don't use your nails as tools</h3>
<p>Opening cans, scraping labels and prising things apart are the fastest way to chip or snap a set.</p>
<h3>Remove safely</h3>
<ol>
<li>Gently file through the top coat.</li>
<li>Soak cotton pads in acetone, place on each nail and wrap in foil for around 10 to 15 minutes.</li>
<li>Slide the softened gel off with a wooden stick. If it resists, re-wrap rather than scraping.</li>
<li>Buff lightly, wash your hands and apply cuticle oil and hand cream.</li>
</ol>

<h2 id="routine">The simple weekly routine</h2>
<table class="routine">
<thead><tr><th>When</th><th>Lashes</th><th>Nails</th></tr></thead>
<tbody>
<tr><td>Daily</td><td>Brush with a clean spoolie</td><td>Cuticle oil</td></tr>
<tr><td>Every 2–3 days</td><td>Cleanse and pat dry</td><td>Gloves for cleaning</td></tr>
<tr><td>Weekly</td><td>Check for lifting or overloaded lashes</td><td>Hand cream and check for lifting</td></tr>
<tr><td>2–3 weeks</td><td>Book your infill</td><td>Book your refill or removal</td></tr>
</tbody></table>
<p>If you notice redness, swelling or pain around your eyes or nails, stop and see a doctor or your technician. Don't ignore it.</p>
<p>Want to know what all this costs? Read our <a href="what-beauty-upkeep-really-costs.html">real cost breakdown</a>.</p>`,
  },
  {
    slug: "what-beauty-upkeep-really-costs",
    hub: "home", img: "costs-guide", tag: "Costs",
    title: "What Beauty Upkeep Really Costs Per Month",
    h1: "What beauty upkeep really costs per month",
    desc: "A straight breakdown of what hair extensions, lash extensions and gel nails cost to maintain each month in the UK, salon versus at-home.",
    teaser: "Extensions, lashes and nails: a straight breakdown, salon vs. at-home.",
    video: "Masterclass: Budgeting your beauty routine",
    lede: "Nobody tells you the monthly total until you've already booked. Here is an honest, indicative breakdown so you can decide what's worth it.",
    note: "These are indicative UK price ranges that vary by region, salon and technician. Always check current prices locally.",
    faq: [
      ["What's the cheapest way to keep up all three?", "Clip-in hair extensions are a one-off cost, and a home gel kit replaces salon visits for nails. Lashes are the hardest to do yourself, so many people alternate with a natural-lash routine."],
      ["Is it cheaper to do things at home?", "Often, after the starting kit. But a poor application can cost more in repairs, so learn the technique first."],
    ],
    body: `
<p class="note">These are <strong>indicative UK price ranges</strong> that vary by region, salon and technician. Check current prices locally.</p>

<h2 id="table">The monthly numbers</h2>
<table class="routine">
<thead><tr><th>Service</th><th>Typical cost</th><th>How often</th><th>Approx. per month</th></tr></thead>
<tbody>
<tr><td>Clip-in hair extensions</td><td>£80–£250 one-off</td><td>Lasts 6–12 months</td><td>£7–£40</td></tr>
<tr><td>Tape-in extensions (salon)</td><td>£100–£200</td><td>Every 6–8 weeks</td><td>£55–£135</td></tr>
<tr><td>Lash infill</td><td>£30–£60</td><td>Every 2–3 weeks</td><td>£45–£130</td></tr>
<tr><td>Gel manicure</td><td>£25–£45</td><td>Every 2–3 weeks</td><td>£35–£100</td></tr>
<tr><td>Aftercare products</td><td>£15–£40</td><td>Monthly</td><td>£15–£40</td></tr>
</tbody></table>
<p>Add a one-off first set: lashes commonly cost £50–£130, builder-gel nails £40–£70.</p>

<h2 id="scenarios">Three realistic routines</h2>
<div class="topic-list">
<div class="topic"><h3>The minimalist</h3><p>Clip-ins, home gel nails, natural lashes. Roughly <strong>£30–£80</strong> a month once your kit is bought.</p></div>
<div class="topic"><h3>The balanced</h3><p>Clip-ins, salon gel nails and occasional lash infills. Roughly <strong>£100–£220</strong> a month.</p></div>
<div class="topic"><h3>The full set</h3><p>Tape-ins, lash infills and salon nails. Roughly <strong>£135–£300+</strong> a month.</p></div>
</div>

<h2 id="save">Where to save without cutting corners</h2>
<ul>
<li><strong>Extend the time between appointments safely:</strong> good aftercare means fewer repairs.</li>
<li><strong>Buy once, care well:</strong> a better clip-in set lasts longer than two cheap ones.</li>
<li><strong>Learn removal:</strong> safe at-home removal saves a salon fee each time. See our <a href="how-to-care-for-lash-extensions-and-gel-nails.html">gel care guide</a>.</li>
<li><strong>Check the real total:</strong> ask what's included, such as removal, infill pricing and any deposit.</li>
</ul>`,
  },
];
GUIDES.push(...EXTRA_GUIDES);
const G = (slug) => GUIDES.find((g) => g.slug === slug);
const guideUrl = (g, root = "") => `${root}guides/${g.slug}.html`;

function articlePage(g) {
  const related = GUIDES.filter((x) => x !== g).sort((x, y) => (y.hub === g.hub) - (x.hub === g.hub)).slice(0, 3)
    .map((x) => `<a class="article" href="${x.slug}.html"><span class="tag">${x.tag}</span><h3>${x.title}</h3><p>${x.teaser}</p></a>`).join("");
  const faq = g.faq.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join("");
  const toc = [...g.body.matchAll(/<h2 id="([^"]+)">(?:\d\. )?([^<]+)<\/h2>/g)]
    .map((m) => `<li><a href="#${m[1]}">${m[2]}</a></li>`).join("");
  const words = (g.lede + g.body).replace(/<[^>]+>/g, " ").split(/\s+/).length;
  const mins = Math.max(3, Math.round(words / 200));
  const hubName = { hair: "Hair Extensions", lash: "Lash Care", nails: "Nail Maintenance" }[g.hub];
  const crumb = hubName
    ? `<a class="back" href="../index.html">← Home</a> / <a href="../${g.hub}.html">${hubName}</a> / Guide`
    : `<a class="back" href="../index.html">← Home</a> / Guide`;
  const body = `
<article>
<section class="page-hero article-hero">
  <div class="wrap article-head">
    <div>
      <p class="crumbs">${crumb}</p>
      <p class="eyebrow">${g.tag}</p>
      <h1>${g.h1}</h1>
      <p class="lede">${g.lede}</p>
      <p class="byline">By The Beauty Journal editors · Updated ${SITE.updatedLabel} · ${mins} min read</p>
    </div>
    <div class="article-art">${art(g.img, true)}</div>
  </div>
</section>
<section class="section article-section">
  <div class="wrap article-layout">
    <aside class="toc" aria-label="On this page"><p class="eyebrow">On this page</p><ol>${toc}<li><a href="#faq">FAQ</a></li></ol></aside>
    <div class="prose">
      ${g.body}
      <div class="inline-video">${videoBlock(g.video, g.video, g.hub)}</div>
      <aside class="upgrade">
        <h3>Get the free Survival Guide</h3>
        <p>Our printable hair, lash &amp; nail care checklist, plus Insider Club perks.</p>
        <form data-subscribe novalidate>
          <input type="email" placeholder="Your email" aria-label="Email address" required>
          <button class="btn" type="submit">Send it</button>
          <p class="form-msg" role="status"></p>
        </form>
      </aside>
      <h2 id="faq">Frequently asked questions</h2>
      <div class="faq">${faq}</div>
      <p class="disclaimer">This guide is educational and not medical advice. Always patch test new products, follow your technician's instructions and seek professional help if you have pain, swelling or an allergic reaction.</p>
    </div>
  </div>
</section>
<section class="section alt">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow">Keep reading</p><h2>More from the Journal</h2></div>
    <div class="articles">${related}</div>
  </div>
</section>
</article>
${clubSection("club")}`.replace(/href="privacy\.html"/g, 'href="../privacy.html"');
  return layout({
    title: g.title, desc: g.desc, path: `guides/${g.slug}.html`, root: "../", og: "article", body,
    jsonld: [
      { "@context": "https://schema.org", "@type": "Article", headline: g.h1, description: g.desc, dateModified: SITE.updated, datePublished: SITE.updated,
        author: { "@type": "Organization", name: SITE.name }, publisher: { "@type": "Organization", name: SITE.name },
        mainEntityOfPage: `${SITE.url}/guides/${g.slug}.html` },
      { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: g.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ],
  });
}

/* ---------- Hubs ---------- */
const HUBS = {
  hair: {
    title: "Hair Extensions", eyebrow: "Hair Hub",
    desc: "Honest guides to clip-in, tape and weft hair extensions: blending, washing, damage prevention and real maintenance costs.",
    h1: "Hair extensions, <em>done properly.</em>",
    lede: "Blending, washing and storing extensions so they last — and your natural hair stays healthy.",
    video: "Masterclass: Blend clip-ins with short hair",
    topics: [
      ["How to blend clip-ins with short hair", "Layering, placement and heat settings for a seamless finish.", GUIDES[0]],
      ["Washing and drying extensions", "The routine that stops tangling and extends lifespan.", G("how-to-wash-and-dry-hair-extensions")],
      ["Preventing tension and breakage", "Spot early warning signs and protect your roots.", G("how-to-prevent-extension-tension-and-hair-breakage")],
      ["Tape vs. clip vs. weft", "Which method suits your hair, budget and lifestyle.", G("tape-in-vs-clip-in-vs-weft-hair-extensions")],
    ],
    costs: [["Clip-in set (lasts 6–12 months)", "£80–£250"], ["Tape-in reapplication (every 6–8 weeks)", "£100–£200"], ["Aftercare products (monthly)", "£15–£30"], ["Salon colour match / cut-in", "£40–£90"]],
  },
  lash: {
    title: "Lash Care", eyebrow: "Lash Hub",
    desc: "Lash extension aftercare, cleansing routines, fills and keeping natural lashes healthy — with real costs.",
    h1: "Lash care that <em>actually protects.</em>",
    lede: "Aftercare, cleansing and fill timing — so your set looks full and your natural lashes stay strong.",
    video: "Masterclass: Lash aftercare in 5 minutes",
    topics: [
      ["The daily lash aftercare routine", "Cleansing, brushing and sleeping habits that make sets last.", GUIDES[1]],
      ["Products to avoid", "Oil-based formulas and common mascara mistakes.", G("lash-extension-products-to-avoid")],
      ["Classic vs. hybrid vs. volume", "Choose the right style for your natural lashes.", G("classic-vs-hybrid-vs-volume-lash-extensions")],
      ["When to fill — and when to rest", "Spot overloaded lashes and avoid damage.", G("when-to-fill-lash-extensions-and-when-to-rest")],
    ],
    costs: [["Full set (classic–volume)", "£50–£130"], ["Infill every 2–3 weeks", "£30–£60"], ["Cleanser and spoolies (monthly)", "£8–£20"], ["Annual cost, regular fills", "£600–£1,400"]],
  },
  nails: {
    title: "Nail Maintenance", eyebrow: "Nails Hub",
    desc: "Gel, builder gel and press-on nail care: safe removal, strengthening routines and making a set last.",
    h1: "Nails that last, <em>without the damage.</em>",
    lede: "Safe removal, strengthening and upkeep for gel, builder and press-on sets.",
    video: "Masterclass: Safe gel removal at home",
    topics: [
      ["Gel nail aftercare", "Cuticle oil, filing and daily habits that prevent lifting.", G("gel-nail-aftercare-how-to-stop-lifting")],
      ["Safe removal at home", "Step-by-step soak-off without peeling or thinning nails.", G("how-to-remove-gel-nails-at-home-safely")],
      ["Rebuilding weak nails", "Strengthening routines between sets.", G("how-to-rebuild-weak-nails-between-gel-sets")],
      ["Gel vs. builder vs. press-ons", "A straight comparison on cost, wear and nail health.", G("gel-vs-builder-gel-vs-press-on-nails")],
    ],
    costs: [["Gel manicure (every 2–3 weeks)", "£25–£45"], ["Builder gel / extensions", "£40–£70"], ["Home kit and lamp (one-off)", "£30–£80"], ["Annual cost, regular salon visits", "£450–£1,100"]],
  },
};

function hubPage(key) {
  const h = HUBS[key];
  const topics = h.topics.map(([t, d, g]) => g
    ? `<a class="topic linked reveal" href="guides/${g.slug}.html"><h3>${t}</h3><p>${d}</p><span class="more">Read the guide →</span></a>`
    : `<div class="topic reveal"><h3>${t}</h3><p>${d}</p><span class="soon">Coming soon</span></div>`).join("\n");
  const costs = h.costs.map(([a, b]) => `<div class="cost"><span>${a}</span><b>${b}</b></div>`).join("\n");
  const body = `
<section class="page-hero hub-hero">
  <div class="wrap article-head">
    <div>
      <p class="crumbs"><a class="back" href="index.html">← Home</a> / ${h.title}</p>
      <p class="eyebrow">${h.eyebrow}</p>
      <h1>${h.h1}</h1>
      <p class="lede">${h.lede}</p>
    </div>
    <div class="article-art">${art(key + "-hub", true)}</div>
  </div>
</section>
<section class="section">
  <div class="wrap">
    <div class="section-head"><h2>Start here</h2></div>
    <div class="topic-list">${topics}</div>
  </div>
</section>
<section class="section alt">
  <div class="wrap two-col">
    ${videoBlock(h.video, h.title + " masterclass", key)}
    <div class="box">
      <h3>Realistic maintenance costs</h3>
      <p class="fine">Indicative UK ranges. See the <a href="guides/what-beauty-upkeep-really-costs.html">full cost breakdown</a>.</p>
      ${costs}
    </div>
  </div>
</section>
${clubSection("club", "Get the free Survival Guide.")}`;
  return layout({
    title: h.title, desc: h.desc, path: `${key}.html`, body,
    jsonld: [{ "@context": "https://schema.org", "@type": "CollectionPage", name: h.title, description: h.desc, url: `${SITE.url}/${key}.html` }],
  });
}

/* ---------- Home ---------- */
function homePage() {
  const cards = [["hair", "Hair Extensions", "Clip-ins, tapes and wefts: blending, washing, damage prevention and what they truly cost."],
    ["lash", "Lash Care", "Classic to volume: aftercare routines, cleansing, fills and keeping natural lashes healthy."],
    ["nails", "Nail Maintenance", "Gel, builder and press-ons: safe removal, strengthening and making a set last."]]
    .map(([k, t, d]) => `<a class="hub-card ${k} reveal" href="${k}.html"><div class="hub-thumb">${art(k + "-hub")}</div><div class="hub-body"><h3>${t}</h3><p>${d}</p><span class="more">Enter the hub →</span></div></a>`).join("");
  const FEATURED = ["how-to-blend-clip-in-extensions-with-short-hair", "how-to-care-for-lash-extensions-and-gel-nails", "what-beauty-upkeep-really-costs", "how-to-wash-and-dry-hair-extensions", "classic-vs-hybrid-vs-volume-lash-extensions", "gel-vs-builder-gel-vs-press-on-nails"];
  const arts = FEATURED.map(G).map((g) => `<a class="article reveal" href="guides/${g.slug}.html"><span class="tag">${g.tag}</span><h3>${g.title}</h3><p>${g.teaser}</p><span class="meta">Read the guide →</span></a>`).join("");
  const body = `
<section class="hero">
  <div class="wrap hero-grid">
    <div>
      <p class="eyebrow">Unfiltered Beauty Education</p>
      <h1>Salon-quality results, <em>without the guesswork.</em></h1>
      <p class="lede">Honest, expert-led guides to hair extensions, lashes and gel nails — real routines, real maintenance costs, and zero sponsored fluff.</p>
      <div class="hero-cta">
        <a class="btn" href="#club">Get the free Survival Guide</a>
        <a class="btn ghost" href="#hubs">Explore the guides</a>
      </div>
      <p class="trust">Free PDF · Weekly tips · Unsubscribe anytime</p>
    </div>
    <div class="hero-art">
      ${art("home-hero", true)}
      <div class="card-float c1">Blend clip-ins<small>Short hair guide</small></div>
      <div class="card-float c2">Lash aftercare<small>What to avoid</small></div>
      <div class="card-float c3">Gel nail upkeep<small>Real cost per month</small></div>
    </div>
  </div>
</section>

<section class="stats">
  <div class="wrap stats-row">
    <div><b>3</b><span>Expert-led hubs</span></div>
    <div><b>0</b><span>Sponsored fluff</span></div>
    <div><b>100%</b><span>Real costs, shown</span></div>
    <div><b>Free</b><span>Insider Club</span></div>
  </div>
</section>

<div class="ticker" aria-hidden="true"><div class="ticker-track">${[0, 1].map(() => ["Hair Extensions", "Lash Care", "Gel Nails", "Real Costs", "Zero Sponsored Fluff", "Insider Club", "Video Masterclasses", "Honest Advice"].map((t) => `<span>${t}</span><span class="dot">✦</span>`).join("")).join("")}</div></div>

<section class="section" id="hubs">
  <div class="wrap">
    <div class="section-head">
      <p class="eyebrow">Three Core Hubs</p>
      <h2>Pick your obsession.</h2>
      <p class="lede">Every hub pairs in-depth guides with video masterclasses and step-by-step visual teardowns.</p>
    </div>
    <div class="cards">${cards}</div>
  </div>
</section>

<section class="section alt">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow">Why The Beauty Journal</p><h2>Not another beauty blog.</h2></div>
    <div class="pillars">
      <div class="pillar reveal"><div class="num">01</div><h3>Unfiltered education</h3><p>Evidence-based routines, damage-prevention guides and the realistic maintenance costs other sites skip.</p></div>
      <div class="pillar reveal"><div class="num">02</div><h3>Interactive masterclasses</h3><p>Every pillar guide comes with short video lessons and visual teardowns — learn it, then do it.</p></div>
      <div class="pillar reveal"><div class="num">03</div><h3>The Insider Club</h3><p>Subscribers get toolkits, partner discount codes and monthly live Q&amp;A roundups.</p></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="section-head"><p class="eyebrow">Latest Guides</p><h2>Start with the questions everyone asks.</h2></div>
    <div class="articles">${arts}</div>
  </div>
</section>

<section class="section alt" id="masterclass">
  <div class="wrap video-grid">
    ${videoBlock("Masterclass: Lash aftercare in 5 minutes", "Lash aftercare masterclass")}
    <div>
      <p class="eyebrow">Video Masterclass Hub</p>
      <h2>Watch it done, step by step.</h2>
      <ul class="checks">
        <li>Short, focused lessons embedded in each guide</li>
        <li>Visual teardowns of common mistakes</li>
        <li>Printable checklists for every routine</li>
      </ul>
    </div>
  </div>
</section>
${clubSection("club")}`;
  return layout({
    title: "The Beauty Journal | Honest Hair, Lash & Nail Education",
    desc: "Unfiltered, evidence-based guides for hair extensions, lash care and gel nails. Real maintenance costs, damage-prevention tips and video masterclasses for women 18–35.",
    path: "index.html", body,
    jsonld: [
      { "@context": "https://schema.org", "@type": "Organization", name: SITE.name, url: SITE.url },
      { "@context": "https://schema.org", "@type": "WebSite", name: SITE.name, url: SITE.url },
    ],
  });
}

/* ---------- About / Contact / Privacy / 404 ---------- */
const plainHero = (eyebrow, h1, lede) => `<section class="page-hero"><div class="wrap"><p class="eyebrow">${eyebrow}</p><h1>${h1}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}</div></section>`;

function aboutPage() {
  const body = `${plainHero("About", "Beauty education <em>you can trust.</em>", "The Beauty Journal exists because beauty advice is either generic, sponsored or contradictory. We think you deserve better.")}
<section class="section"><div class="wrap prose narrow">
<h2>Our promise</h2>
<ul>
<li><strong>Unfiltered:</strong> we tell you what things really cost, what can go wrong and what to avoid.</li>
<li><strong>Evidence-led:</strong> routines are based on manufacturer and professional guidance, not trends.</li>
<li><strong>Transparent:</strong> if we ever feature a partner brand or discount code, we'll say so clearly.</li>
<li><strong>Practical:</strong> every guide is built so you can actually do it, with video and checklists.</li>
</ul>
<h2>Who it's for</h2>
<p>Women aged 18–35 — students, young professionals, creators and beauty enthusiasts — who want salon-quality results at a price and effort that make sense.</p>
<h2>The Beauty Insider Club</h2>
<p>Our free membership gives you early access to downloadable toolkits, exclusive partner discount codes and monthly live Q&amp;A roundups. <a href="index.html#club">Join here.</a></p>
<h2>Photo credits</h2>
<p>Photography from <a href="https://unsplash.com">Unsplash</a>, used under the Unsplash License: <a href="https://unsplash.com/photos/RfoISVdKM4U">hair portrait</a>, <a href="https://unsplash.com/photos/D7qzQ234N0o">wavy hair</a>, <a href="https://unsplash.com/photos/rNPfyRYqjHY">long hair</a>, <a href="https://unsplash.com/photos/sRSRuxkOuzI">lash application</a>, <a href="https://unsplash.com/photos/vtQHwU4F13s">nude nails</a> and <a href="https://unsplash.com/photos/DtoWpHt2_d8">white manicure</a>.</p>
<h2>A note on advice</h2>
<p>Our content is educational, not medical advice. If you have pain, swelling, infection or an allergic reaction, stop and speak to a doctor or qualified professional.</p>
</div></section>
${clubSection("club")}`.replace(/href="privacy\.html"/g, 'href="privacy.html"');
  return layout({ title: "About", desc: "Why The Beauty Journal exists and what we promise: unfiltered, evidence-based hair, lash and nail education.", path: "about.html", body });
}

function contactPage() {
  const body = `${plainHero("Contact", "Say <em>hello.</em>", "Questions, topic requests or partnership enquiries — we read everything.")}
<section class="section"><div class="wrap two-col">
<form class="optin box" data-contact novalidate>
  <h3>Send us a message</h3>
  <label for="c-name">Name</label><input id="c-name" name="name" type="text" autocomplete="name">
  <label for="c-email">Email</label><input id="c-email" type="email" required autocomplete="email">
  <label for="c-msg">Message</label><textarea id="c-msg" name="message" rows="6" required></textarea>
  <button class="btn" type="submit">Send message</button>
  <p class="form-msg" role="status"></p>
</form>
<div class="prose"><h2>Other ways</h2>
<p>Email us at <a href="mailto:${SITE.email}">${SITE.email}</a>.</p>
<p>Want a topic covered? Tell us what you're struggling with and we may turn it into a guide and video masterclass.</p>
<p>Brand and partnership enquiries are welcome, but we only feature products we'd recommend, and we always disclose partners.</p></div>
</div></section>`;
  return layout({ title: "Contact", desc: "Contact The Beauty Journal with questions, topic requests or partnership enquiries.", path: "contact.html", body });
}

function privacyPage() {
  const body = `${plainHero("Legal", "Privacy <em>policy</em>", `Last updated ${SITE.updatedLabel}`)}
<section class="section"><div class="wrap prose narrow">
<p class="note">Template provided by Ofori Digital Media. Have it reviewed against your own email provider and legal obligations (including UK GDPR) before launch.</p>
<h2>Who we are</h2><p>${SITE.name} ("we") publishes beauty education content. Contact: <a href="mailto:${SITE.email}">${SITE.email}</a>.</p>
<h2>What we collect</h2>
<ul>
<li><strong>Email address and first name</strong>, when you join the Insider Club or contact us.</li>
<li><strong>Messages</strong> you send through the contact form.</li>
</ul>
<h2>How we use it</h2>
<p>We use your email to send the Survival Guide, our newsletter, and Insider Club perks, and to reply to your messages. We rely on your consent and you can withdraw it at any time using the unsubscribe link in every email.</p>
<h2>Who processes it</h2>
<p>Subscriber details are stored in a secured MongoDB Atlas database (and in any email service we use to send newsletters, which processes data on our behalf). We do not sell your data.</p>
<h2>Analytics and storage</h2>
<p>We record anonymous page views (page visited, referring site and a one-way scrambled visitor ID, never your IP address) and keep these logs for 180 days. We use no advertising cookies. Your browser's local storage remembers that you have subscribed or dismissed a pop-up. Videos load from YouTube's privacy-enhanced mode only when you press play.</p>
<h2>Your rights</h2>
<p>You can ask to access, correct or delete your data, or object to processing, by emailing us. You may also complain to the Information Commissioner's Office (ico.org.uk).</p>
<h2>Retention</h2>
<p>We keep subscriber data until you unsubscribe, and contact messages for as long as needed to respond.</p>
</div></section>`;
  return layout({ title: "Privacy Policy", desc: "How The Beauty Journal collects and uses your data.", path: "privacy.html", body });
}

function notFoundPage() {
  const body = `${plainHero("404", "Page not <em>found.</em>", "That page has moved or never existed.")}
<section class="section"><div class="wrap"><a class="btn" href="index.html">Back to home</a> <a class="btn ghost" href="hair.html">Browse the hubs</a></div></section>`;
  return layout({ title: "Page not found", desc: "Page not found.", path: "404.html", body, noindex: true });
}

/* ---------- Write everything ---------- */
const files = {
  "index.html": homePage(),
  "hair.html": hubPage("hair"),
  "lash.html": hubPage("lash"),
  "nails.html": hubPage("nails"),
  "about.html": aboutPage(),
  "contact.html": contactPage(),
  "privacy.html": privacyPage(),
  "404.html": notFoundPage(),
  ...Object.fromEntries(GUIDES.map((g) => [`guides/${g.slug}.html`, articlePage(g)])),
};
const urls = Object.keys(files).filter((f) => f !== "404.html");
files["sitemap.xml"] = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE.url}/${u}</loc><lastmod>${SITE.updated}</lastmod></url>`).join("\n")}\n</urlset>\n`;
files["robots.txt"] = `User-agent: *\nAllow: /\nSitemap: ${SITE.url}/sitemap.xml\n`;
files["favicon.svg"] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#5b2a4e"/><text x="32" y="45" text-anchor="middle" font-family="Georgia,serif" font-size="38" font-weight="700" font-style="italic" fill="#f3d9d4">B</text></svg>\n`;

for (const [name, content] of Object.entries(files)) {
  const p = join(OUT, name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}
console.log(`Built ${Object.keys(files).length} files.`);
