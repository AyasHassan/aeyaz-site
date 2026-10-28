// Builds the website into ./dist from the JSON files in ./content.
// Cloudflare Pages runs this automatically: build command "node build.js", output folder "dist".
// Images you upload (any size, HD or 4K) are automatically resized into small, fast WebP versions.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let sharp = null;
try { sharp = require('sharp'); } catch (e) { console.warn('sharp not installed — images will be copied at original size.'); }

const ROOT = __dirname;
const OUT = path.join(ROOT, 'dist');
const C = path.join(ROOT, 'content');

// ---------- helpers ----------
const readJSON = (p, fallback = {}) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { if (fs.existsSync(p)) console.warn('Could not read', p, e.message); return fallback; }
};
const readDir = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : []);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const write = (rel, html) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html); };
const copyDir = (src, dst) => {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f), d = path.join(dst, f);
    if (fs.statSync(s).isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
};
const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const imgPath = (v) => (typeof v === 'object' && v ? v.image || v.src || v.path || '' : v || '');
const stem = (p) => path.basename(String(p || '')).replace(/\.json$/, '');
const titleCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();

// ---------- images: resize uploads into fast WebP versions ----------
const imgCache = new Map();
async function variant(src, width) {
  if (!src) return '';
  if (/^https?:/.test(src)) return src;
  const file = path.join(ROOT, src.replace(/^\/+/, ''));
  if (!fs.existsSync(file)) { console.warn('Missing image:', src); return ''; }
  const key = src + '@' + width;
  if (imgCache.has(key)) return imgCache.get(key);
  const hash = crypto.createHash('md5').update(src).digest('hex').slice(0, 8);
  const base = path.basename(file).replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 40);
  let url;
  try {
    if (!sharp) throw new Error('no sharp');
    const name = `${base}-${hash}-${width}.webp`;
    const out = path.join(OUT, 'img', name);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    if (!fs.existsSync(out)) {
      await sharp(file, { failOn: 'none' }).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toFile(out);
    }
    url = `/img/${name}`;
  } catch (e) {
    // Fallback: copy the original as-is
    const name = `${base}-${hash}${path.extname(file)}`;
    const out = path.join(OUT, 'img', name);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    if (!fs.existsSync(out)) fs.copyFileSync(file, out);
    url = `/img/${name}`;
  }
  imgCache.set(key, url);
  return url;
}
// Returns { src, srcset } for an image at two sizes
async function responsive(src, small, large) {
  const a = await variant(src, small);
  const b = await variant(src, large);
  if (!a) return null;
  return { src: a, srcset: a === b ? '' : `${a} ${small}w, ${b} ${large}w` };
}
const imgTag = (r, alt, sizes, cls = '') => (r
  ? `<img${cls ? ` class="${cls}"` : ''} src="${esc(r.src)}"${r.srcset ? ` srcset="${esc(r.srcset)}" sizes="${sizes}"` : ''} alt="${esc(alt)}" loading="lazy" decoding="async">`
  : '');

// Turns a Vimeo (or YouTube) link into an embeddable player URL
function embedUrl(url) {
  if (!url) return '';
  url = String(url).trim();
  let m = url.match(/player\.vimeo\.com\/video\/(\d+)(?:\?h=([a-z0-9]+))?/i);
  if (!m) m = url.match(/vimeo\.com\/(?:.*?\/)?(\d+)(?:\/([a-z0-9]+))?/i);
  if (m) return `https://player.vimeo.com/video/${m[1]}?${m[2] ? 'h=' + m[2] + '&' : ''}title=0&byline=0&portrait=0&dnt=1`;
  m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/i);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0`;
  return '';
}

// ---------- content ----------
const settings = readJSON(path.join(C, 'settings.json'));
const about = readJSON(path.join(C, 'about.json'));
const film = readJSON(path.join(C, 'feature-film.json'));
const arrange = readJSON(path.join(C, 'arrange.json'), null);
const name = settings.name || 'AEYAZ';
const SITE_URL = String(settings.site_url || 'https://aeyaz.com').replace(/\/+$/, '');
const PERSON = titleCase(name);
const SEO_TAG = settings.seo_title || 'Director of Photography & Cinematographer in Dubai, UAE';
const pagesForSitemap = [];

const categories = readDir(path.join(C, 'categories')).map((f) => {
  const d = readJSON(path.join(C, 'categories', f));
  const o = Number(d.order);
  return { id: stem(f), name: d.name || stem(f), order: Number.isFinite(o) ? o : 999 };
}).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
const catLookup = {};
for (const c of categories) { catLookup[c.id] = c; catLookup[c.name.toLowerCase()] = c; }
const resolveCat = (ref) => {
  const key = typeof ref === 'object' && ref ? ref.value || ref.name || '' : String(ref || '');
  return catLookup[stem(key)] || catLookup[key.toLowerCase()] || null;
};

const CREDIT_FIELDS = [
  ['client', 'Client'], ['agency', 'Agency'], ['production_house', 'Production House'], ['director', 'Director'],
  ['dop', 'Director of Photography'], ['executive_producer', 'Executive Producer'], ['producer', 'Producer'],
  ['editor', 'Editor'], ['colourist', 'Colourist'],
];

const projects = readDir(path.join(C, 'projects')).map((f) => {
  const d = readJSON(path.join(C, 'projects', f));
  const credits = CREDIT_FIELDS.filter(([k]) => (d[k] || '').trim()).map(([k, role]) => ({ role, name: d[k].trim() }));
  for (const c of arr(d.more_credits).concat(arr(d.credits))) {
    if (c && (c.name || '').trim() && (c.role || '').trim() && !credits.some((x) => x.role.toLowerCase() === c.role.trim().toLowerCase())) credits.push({ role: c.role.trim(), name: c.name.trim() });
  }
  const frames = arr(d.frames).map(imgPath).filter(Boolean);
  if (!frames.length && d.thumbnail) frames.push(imgPath(d.thumbnail));
  return {
    slug: stem(f),
    title: d.title || 'Untitled',
    legacyStatus: (d.status || '').toLowerCase(),
    legacyOrder: Number.isFinite(Number(d.order)) ? Number(d.order) : 9999,
    cats: arr(d.categories).map(resolveCat).filter(Boolean),
    frames: frames.slice(0, 3),
    video: d.video || '',
    credits,
    stills: arr(d.stills).map(imgPath).filter(Boolean),
  };
});
const bySlug = Object.fromEntries(projects.map((p) => [p.slug, p]));

// Order and placement come from the "Arrange projects" page
const placed = new Set();
const pick = (list) => arr(list).map((r) => bySlug[stem(typeof r === 'object' && r ? r.value || r.path || '' : r)]).filter((p) => p && !placed.has(p.slug) && placed.add(p.slug));
let work = [], archive = [];
if (arrange && Array.isArray(arrange.projects)) {
  // One list: order = drag order, each row says where it shows
  const refOf = (r) => (r && typeof r === 'object' ? r.project : r);
  const showOf = (r) => String((r && r.show) || 'work').toLowerCase();
  work = pick(arrange.projects.filter((r) => showOf(r) === 'work').map(refOf));
  archive = pick(arrange.projects.filter((r) => showOf(r) === 'archive').map(refOf));
  pick(arrange.projects.filter((r) => showOf(r) === 'hidden').map(refOf));
} else if (arrange) {
  work = pick(arrange.work);
  archive = pick(arrange.archive);
  pick(arrange.hidden);
}
// Projects not placed yet: use their old setting, otherwise add to the end of Work
const rest = projects.filter((p) => !placed.has(p.slug)).sort((a, b) => a.legacyOrder - b.legacyOrder || a.title.localeCompare(b.title));
for (const p of rest) {
  if (p.legacyStatus === 'archive') archive.push(p);
  else if (p.legacyStatus !== 'hidden') work.push(p);
}

// ---------- layout ----------
const NAV = [['work', 'Work', '/'], ['archive', 'Archive', '/archive/'], ['feature', 'Feature', '/feature-film/'], ['about', 'About', '/about/'], ['contact', 'Contact', '/contact/']];

function page({ title, active, body, description, path: urlPath = '/', image = '', jsonld = null }) {
  const fullTitle = title ? `${title} | ${PERSON} — Director of Photography, Dubai` : `${PERSON} | ${SEO_TAG}`;
  pagesForSitemap.push(urlPath);
  const canonical = SITE_URL + urlPath;
  const ogImage = image ? (image.startsWith('http') ? image : SITE_URL + image) : '';
  const desc = description || settings.seo_description || '';
  const nav = NAV.map(([k, label, href]) => `<a href="${href}"${k === active ? ' aria-current="page"' : ''}>${label}</a>`).join('\n');
  const footLinks = [
    settings.instagram && `<a href="${esc(settings.instagram)}" target="_blank" rel="noopener">Instagram</a>`,
    settings.vimeo && `<a href="${esc(settings.vimeo)}" target="_blank" rel="noopener">Vimeo</a>`,
    settings.email && `<a href="mailto:${esc(settings.email)}">${esc(settings.email)}</a>`,
  ].filter(Boolean).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(PERSON)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(desc)}">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">\n<meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/style.css">
</head>
<body>
<div class="site">
<header class="header">
<a class="logo" href="/">${esc(name)}</a>
<nav class="nav" aria-label="Primary">
${nav}
</nav>
</header>
<main class="main">
${body}
</main>
<footer class="footer">
<span>© ${new Date().getFullYear()} ${esc(PERSON)} — Director of Photography &amp; Cinematographer · ${esc(settings.location || 'Based in Dubai, available worldwide.')}</span>
<div class="foot-links">
${footLinks}
</div>
</footer>
</div>
<script src="/assets/site.js" defer></script>
</body>
</html>`;
}

// Home title: last word goes on its own line ("Director of" / "Photography")
const headlineHtml = (t) => {
  const w = String(t).trim().split(/\s+/);
  return w.length > 1 ? `${esc(w.slice(0, -1).join(' '))}<br>${esc(w[w.length - 1])}` : esc(t);
};

const FRAME_SIZES = '(max-width: 900px) 33vw, 25vw';
const STILL_SIZES = '(max-width: 900px) 50vw, 38vw';

async function row(p) {
  const cells = [];
  for (let i = 0; i < 3; i++) {
    const r = p.frames[i] ? await responsive(p.frames[i], 640, 1280) : null;
    cells.push(`<div class="frame">${imgTag(r, i === 0 ? p.title : '', FRAME_SIZES)}</div>`);
  }
  return `<a class="proj" href="/work/${p.slug}/" data-cats="${p.cats.map((c) => c.id).join(' ')}">
<div class="frames">${cells.join('')}</div>
<div class="pname">${esc(p.title)}</div>
</a>`;
}

const player = (url, label) => {
  const src = embedUrl(url);
  return src
    ? `<div class="player"><iframe src="${esc(src)}" title="${esc(label)}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen loading="lazy"></iframe></div>`
    : `<div class="player player-empty"><span>Video coming soon</span></div>`;
};

const creditsBlock = (list) => (list && list.length ? `<section class="credits" aria-label="Credits">
<h2 class="label">Credits</h2>
<dl class="credit-grid">
${list.map((c) => `<div><dt>${esc(c.role)}</dt><dd>${esc(c.name)}</dd></div>`).join('\n')}
</dl>
</section>` : '');

async function stillsBlock(stills, alt) {
  if (!stills.length) return '';
  const imgs = [];
  for (const s of stills) {
    const r = await responsive(s, 1080, 2048);
    if (r) imgs.push(imgTag(r, `${alt} — still`, STILL_SIZES, 'still'));
  }
  return imgs.length ? `<section class="stills" aria-label="Stills">\n${imgs.join('\n')}\n</section>` : '';
}

const arrowL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';
const arrowR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

const personSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: PERSON,
  jobTitle: 'Director of Photography',
  description: settings.seo_description || '',
  url: SITE_URL + '/',
  email: settings.email ? 'mailto:' + settings.email : undefined,
  address: { '@type': 'PostalAddress', addressLocality: 'Dubai', addressCountry: 'AE' },
  knowsAbout: ['Cinematography', 'TV commercials', 'Feature films', 'Branded content'],
  sameAs: [settings.instagram, settings.vimeo].filter(Boolean),
});

// ---------- build ----------
(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  copyDir(path.join(ROOT, 'assets'), path.join(OUT, 'assets'));
  copyDir(path.join(ROOT, 'files'), path.join(OUT, 'files'));

  // Work (home)
  // Category buttons cover Work + Archive projects. "All" shows Work only;
  // a category shows matching Work projects first, then matching Archive ones.
  const usedCats = categories.filter((c) => work.concat(archive).some((p) => p.cats.some((pc) => pc.id === c.id)));
  const workRows = [];
  for (const p of work) workRows.push(await row(p));
  for (const p of archive) if (p.cats.length) workRows.push((await row(p)).replace('<a class="proj"', '<a class="proj" data-archive hidden'));
  const firstImg = work.find((p) => p.frames.length);
  write('index.html', page({
    active: 'work', path: '/', jsonld: personSchema(),
    image: firstImg ? await variant(firstImg.frames[0], 1280) : '',
    body: `<h1 class="title">${headlineHtml(settings.headline || 'Director of Photography')}</h1>
${usedCats.length ? `<div class="filters" role="group" aria-label="Filter projects by category">
<button type="button" data-filter="all" aria-pressed="true">All</button>
${usedCats.map((c) => `<button type="button" data-filter="${c.id}" aria-pressed="false">${esc(c.name)}</button>`).join('\n')}
</div>` : '<div class="filters-space"></div>'}
<div class="rows" id="rows">
${workRows.join('\n')}
</div>`,
  }));

  // Archive
  const archRows = [];
  for (const p of archive) archRows.push(await row(p));
  write('archive/index.html', page({
    title: 'Archive', active: 'archive', path: '/archive/',
    body: `<h1 class="title title-gap">Archive</h1>
<div class="rows">
${archRows.join('\n')}
</div>`,
  }));

  // Project pages
  const hidden = projects.filter((p) => !work.includes(p) && !archive.includes(p));
  for (const [list, isArchive] of [[work, false], [archive, true], [hidden, null]]) {
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const next = list[(i + 1) % list.length];
      const backHref = isArchive ? '/archive/' : '/';
      const backLabel = isArchive ? 'Back to Archive' : 'Back to Work';
      write(`work/${p.slug}/index.html`, page({
        title: p.title, active: isArchive ? 'archive' : 'work', path: `/work/${p.slug}/`,
        image: p.frames[0] ? await variant(p.frames[0], 1280) : '',
        description: `${p.title}${p.credits.find((c) => c.role === 'Client') ? ' for ' + p.credits.find((c) => c.role === 'Client').name : ''} — shot by ${PERSON}, Dubai-based Director of Photography.${p.credits.filter((c) => c.role !== 'Director of Photography').slice(0, 3).map((c) => ' ' + c.role + ': ' + c.name + '.').join('')}`,
        body: `<div class="project">
<a class="back" href="${backHref}">${arrowL}${backLabel}</a>
<h1 class="ptitle">${esc(p.title)}</h1>
${player(p.video, p.title)}
${creditsBlock(p.credits)}
${await stillsBlock(p.stills, p.title)}
<div class="pnav">
<a class="back" href="${backHref}">${arrowL}${backLabel}</a>
${isArchive !== null && list.length > 1 ? `<a class="next" href="/work/${next.slug}/">Next: ${esc(next.title)}${arrowR}</a>` : ''}
</div>
</div>`,
      }));
    }
  }

  // Feature film
  const filmStills = await stillsBlock(arr(film.stills).map(imgPath).filter(Boolean), film.title || 'Feature film');
  write('feature-film/index.html', page({
    title: film.title || 'Feature Film', active: 'feature', path: '/feature-film/',
    description: `${film.title || 'Feature film'} — ${(arr(film.details)).join(', ')}. ${film.role || ''}`.trim(),
    body: `<div class="film">
<div class="film-head">
<h1 class="title">${esc(film.title || 'Feature Film')}</h1>
<div class="film-meta">
${arr(film.details).map((d) => `<span>${esc(d)}</span>`).join('\n')}
${film.role ? `<span class="hi">${esc(film.role)}</span>` : ''}
</div>
</div>
${film.trailer ? player(film.trailer, (film.title || '') + ' trailer') : ''}
${film.teaser ? player(film.teaser, (film.title || '') + ' teaser') : ''}
${filmStills}
${creditsBlock(arr(film.credits).filter((c) => c && (c.name || '').trim()))}
</div>`,
  }));

  // About
  const paras = String(about.body || '').split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
  const portrait = about.portrait ? await responsive(imgPath(about.portrait), 800, 1400) : null;
  write('about/index.html', page({
    title: 'About', active: 'about', path: '/about/', jsonld: personSchema(),
    description: about.intro || settings.seo_description,
    image: portrait ? portrait.src : '',
    body: `<h1 class="title title-gap">About</h1>
<div class="about">
<div class="portrait">${imgTag(portrait, name, '(max-width: 900px) 100vw, 30vw')}</div>
<div class="about-text">
${about.intro ? `<p class="lead">${esc(about.intro)}</p>` : ''}
${paras.map((t) => `<p>${esc(t)}</p>`).join('\n')}
${about.profile_url ? `<a class="pill" href="${esc(about.profile_url)}" target="_blank" rel="noopener">Download profile (PDF)</a>` : ''}
<div class="contact-list">
${settings.email ? `<div><span class="label">Email</span><a href="mailto:${esc(settings.email)}">${esc(settings.email)}</a></div>` : ''}
${settings.website ? `<div><span class="label">Website</span><a href="https://${esc(settings.website.replace(/^https?:\/\//, ''))}">${esc(settings.website)}</a></div>` : ''}
<div><span class="label">Social</span><span class="row">${settings.instagram ? `<a href="${esc(settings.instagram)}" target="_blank" rel="noopener">Instagram</a>` : ''}${settings.vimeo ? `<a href="${esc(settings.vimeo)}" target="_blank" rel="noopener">Vimeo</a>` : ''}</span></div>
</div>
</div>
</div>`,
  }));

  // Contact
  const igHandle = settings.instagram ? '@' + settings.instagram.replace(/\/+$/, '').split('/').pop() : '';
  write('contact/index.html', page({
    title: 'Contact', active: 'contact', path: '/contact/',
    description: `Contact ${PERSON}, Dubai-based Director of Photography — ${settings.email || ''}`,
    body: `<h1 class="title title-gap">Contact</h1>
<div class="contact">
<div class="contact-form-wrap">
<form class="contact-form" id="contact-form" data-key="${esc(settings.web3forms_key || '')}" data-email="${esc(settings.email || '')}">
<p class="lead">${esc(settings.contact_intro || 'Have a project in mind? Send a message.')}</p>
<div class="two">
<label><span class="label">Name</span><input class="field" type="text" name="name" required autocomplete="name" placeholder="Your name"></label>
<label><span class="label">Email</span><input class="field" type="email" name="email" required autocomplete="email" placeholder="you@company.com"></label>
</div>
<label><span class="label">Message</span><textarea class="field" name="message" rows="5" required placeholder="Tell me about the project, dates and location"></textarea></label>
<input type="checkbox" name="botcheck" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
<button type="submit" class="send">Send message</button>
<p class="form-error" role="alert" hidden>Sorry, something went wrong. Please email me directly instead.</p>
</form>
<div class="thanks" role="status" hidden>
<p class="lead">Thank you, your message is on its way.</p>
<p class="muted">I’ll get back to you by email soon.</p>
</div>
</div>
<aside class="contact-list" aria-label="Contact details">
${settings.email ? `<div><span class="label">Email</span><a href="mailto:${esc(settings.email)}">${esc(settings.email)}</a></div>` : ''}
${settings.website ? `<div><span class="label">Website</span><a href="https://${esc(settings.website.replace(/^https?:\/\//, ''))}">${esc(settings.website)}</a></div>` : ''}
${settings.instagram ? `<div><span class="label">Instagram</span><a href="${esc(settings.instagram)}" target="_blank" rel="noopener">${esc(igHandle)}</a></div>` : ''}
${settings.location ? `<p class="muted">${esc(settings.location)}</p>` : ''}
</aside>
</div>`,
  }));

  // Search engines: sitemap + robots
  const today = new Date().toISOString().slice(0, 10);
  const urls = [...new Set(pagesForSitemap)].filter((u) => !hidden.some((h) => u === `/work/${h.slug}/`));
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${SITE_URL}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

  // Keep old Adobe Portfolio links working (and their Google ranking): 301 redirects
  const OLD_LINKS = {
    '/featured': '/',
    '/saudia-arlines-rihla-journey': 'saudia-airlines-rihla-journey', '/jeetbuzz-x-sunil-narine-x-andre-russel': 'jeetbuzz-x-sunil-narine-x-andre-russell',
    '/e-money-stratgey-films': 'eand-money-strategy-films', '/mall-alone-dubai-tourism': 'mall-alone-dubai-tourism-tom-felton',
    '/homecentre-creature': 'home-centre-fathers-day', '/jsw-cements': 'jsw-cement', '/noon': 'noon-this-is-us',
  };
  const redirects = [];
  for (const [from, to] of Object.entries(OLD_LINKS)) redirects.push(`${from} ${to.startsWith('/') ? to : `/work/${to}/`} 301`);
  for (const p of projects) if (!OLD_LINKS['/' + p.slug]) redirects.push(`/${p.slug} /work/${p.slug}/ 301`);
  for (const r of arr(settings.redirects)) if (r && r.from && r.to) redirects.push(`${r.from} ${r.to} 301`);
  fs.writeFileSync(path.join(OUT, '_redirects'), redirects.join('\n') + '\n');

  write('404.html', page({ title: 'Page not found', active: '', body: `<h1 class="title title-gap">Not found</h1><p class="muted">This page doesn’t exist. <a class="u" href="/">Back to Work</a></p>` }));

  console.log(`Built ${work.length} work + ${archive.length} archive projects, ${categories.length} categories, ${imgCache.size} image versions → dist/`);
})().catch((e) => { console.error(e); process.exit(1); });
