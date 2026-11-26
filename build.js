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
  // The video number must be a whole path segment, so the hash of an unlisted link
  // (vimeo.com/1250342296/54fe8b2bab) is never mistaken for the video number.
  if (!m) m = url.match(/vimeo\.com\/(?:.*?\/)?(\d+)(?=[\/?#]|$)(?:\/([a-z0-9]+)(?=[\/?#]|$))?/i);
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
const THUMBS = settings.thumbnail_style === 'one' ? 'one' : 'three';
const SHOW_CATS = settings.show_categories !== false;
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
    show: String(d.show || 'work').toLowerCase(),
    visible: d.visible !== false,
    cats: arr(d.categories).map(resolveCat).filter(Boolean),
    frames: frames.slice(0, 3),
    videos: arr(d.videos).concat(arr(d.video))
      .map((v) => (typeof v === 'object' && v
        ? { url: String(v.url || v.link || '').trim(), title: String(v.title || '').trim() }
        : { url: String(v || '').trim(), title: '' }))
      .filter((v) => v.url)
      .filter((v, i, a) => a.findIndex((x) => x.url === v.url) === i),
    credits,
    stills: arr(d.stills).map(imgPath).filter(Boolean),
  };
});
const bySlug = Object.fromEntries(projects.map((p) => [p.slug, p]));
const catSlug = (c) => String(c.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const CAT_NAMES_JSON = JSON.stringify(Object.fromEntries([...categories.map((c) => [catSlug(c), c.name]), ['all', 'All']])).replace(/</g, '\\u003c');

// Order comes from content/order.txt (one project title per line, top first).
// Matching ignores case, punctuation and spacing. Projects not listed go to the bottom, A–Z.
const norm = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');
const orderFile = path.join(C, 'order.txt');
const orderLines = fs.existsSync(orderFile) ? fs.readFileSync(orderFile, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean) : [];
const isRetired = (p) => p.show === 'hidden' || p.legacyStatus === 'hidden';
const live = projects.filter((p) => !isRetired(p));
const ordered = [];
for (const line of orderLines) {
  const hit = live.find((p) => norm(p.title) === norm(line) && !ordered.includes(p));
  if (hit) ordered.push(hit);
  else console.log(`Order file: no project matches "${line}"`);
}
for (const p of live.filter((p) => !ordered.includes(p)).sort((a, b) => a.title.localeCompare(b.title))) ordered.push(p);
// Main Work page: only projects switched on. Category pages use every live project in that category.
const work = ordered.filter((p) => p.visible);

// ---------- layout ----------
const NAV = [['work', 'Work', '/'], ['feature', 'Feature', '/feature-film/'], ['about', 'About', '/about/'], ['contact', 'Contact', '/contact/']];

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
<link rel="icon" type="image/png" href="/assets/favicon.png">
<link rel="apple-touch-icon" href="/assets/favicon.png">
<style>
.ig{display:inline-flex;align-items:center;color:inherit;margin-left:18px;opacity:.85}
.ig:hover{opacity:1}
.to-top{position:fixed;right:20px;bottom:20px;width:44px;height:44px;border:1px solid #F2F2F0;background:#0A0A0A;color:#F2F2F0;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .3s;z-index:50;padding:0}
.to-top.show{opacity:1;pointer-events:auto}
.film-poster{margin:0 auto 48px;max-width:560px}
.film-poster img{display:block;width:100%;height:auto}
.film-synopsis{max-width:640px;margin:0 auto 56px;font-size:17px;line-height:1.6}
.film-synopsis p{margin:0 0 16px}
.film-video{margin:0 0 56px}
.film-kicker{font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8a8a8a;margin:0 0 12px}
.film-stills{margin-top:72px}
.filters a{min-height:32px;display:inline-flex;align-items:center;padding:0 14px;border-radius:999px;font-family:'DM Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#F2F2F0;border:1px solid #3A3A38;transition:background .2s,color .2s,border-color .2s}
.filters a:hover{border-color:#F2F2F0}
.filters a[aria-current="page"]{background:#F2F2F0;color:#0A0A0A;border-color:#F2F2F0}
@media (max-width:700px){.filters a{font-size:10px;padding:0 10px;min-height:28px}}
</style>
</head>
<body>
<div class="site">
<header class="header">
<a class="logo" href="/">${esc(name)}</a>
<nav class="nav" aria-label="Primary">
${nav}
${settings.instagram ? `<a class="ig" href="${esc(settings.instagram)}" target="_blank" rel="noopener" aria-label="Instagram"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg></a>` : ''}
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
${urlPath === '/' ? `<button class="to-top" type="button" aria-label="Back to top"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
<script>(function(){var b=document.querySelector('.to-top');if(!b)return;function t(){b.classList.toggle('show',window.scrollY>600)}window.addEventListener('scroll',t,{passive:true});t();b.addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'})})})();</script>` : ''}
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

async function row(p, from = '') {
  const cells = [];
  const n = THUMBS === 'one' ? 1 : 3;
  for (let i = 0; i < n; i++) {
    const r = p.frames[i] ? await responsive(p.frames[i], 640, 1280) : null;
    cells.push(`<div class="frame">${imgTag(r, i === 0 ? p.title : '', FRAME_SIZES)}</div>`);
  }
  return `<a class="proj" href="/work/${p.slug}/${from ? '?from=' + from : ''}" data-cats="${p.cats.map((c) => c.id).join(' ')}">
<div class="frames${THUMBS === 'one' ? ' one' : ''}">${cells.join('')}</div>
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
  // Category buttons cover all Work projects.
  const usedCats = categories.filter((c) => live.some((p) => p.cats.some((pc) => pc.id === c.id)));
  const filterBar = (current) => (usedCats.length && SHOW_CATS ? `<nav class="filters" aria-label="Categories">
<a href="/"${current === 'all' ? ' aria-current="page"' : ''}>Featured</a>
${usedCats.map((c) => `<a href="/category/${catSlug(c)}/"${current === c.id ? ' aria-current="page"' : ''}>${esc(c.name)}</a>`).join('\n')}
<a href="/all/"${current === 'everything' ? ' aria-current="page"' : ''}>All</a>
</nav>` : '<div class="filters-space"></div>');
  const workRows = [];
  for (const p of work) workRows.push(await row(p));
  const firstImg = work.find((p) => p.frames.length);
  // Share image: the picture shown when the link is pasted into WhatsApp, email etc.
  // Uses the "Share image" from Site settings if set, otherwise the first project still.
  let shareImage = '';
  if (settings.share_image) {
    const shareFile = path.join(ROOT, String(settings.share_image).replace(/^\/+/, ''));
    if (sharp && fs.existsSync(shareFile)) {
      fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });
      await sharp(shareFile, { failOn: 'none' }).rotate().resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 82 }).toFile(path.join(OUT, 'img', 'share.jpg'));
      shareImage = '/img/share.jpg';
    } else console.warn('Share image not found or sharp missing:', settings.share_image);
  }
  write('index.html', page({
    active: 'work', path: '/', jsonld: personSchema(),
    image: shareImage || (firstImg ? await variant(firstImg.frames[0], 1280) : ''),
    body: `<h1 class="title">${headlineHtml(settings.headline || 'Director of Photography')}</h1>
${filterBar('all')}
<div class="rows${THUMBS === 'one' ? ' rows-one' : ''}" id="rows">
${workRows.join('\n')}
</div>`,
  }));

  // Project pages
  const hidden = projects.filter((p) => !work.includes(p));
  for (const [list, isWork] of [[work, true], [hidden, null]]) {
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const next = list[(i + 1) % list.length];
      const backHref = '/';
      const backLabel = 'Back to Work';
      write(`work/${p.slug}/index.html`, page({
        title: p.title, active: 'work', path: `/work/${p.slug}/`,
        image: p.frames[0] ? await variant(p.frames[0], 1280) : '',
        description: `${p.title}${p.credits.find((c) => c.role === 'Client') ? ' for ' + p.credits.find((c) => c.role === 'Client').name : ''} — shot by ${PERSON}, Dubai-based Director of Photography.${p.credits.filter((c) => c.role !== 'Director of Photography').slice(0, 3).map((c) => ' ' + c.role + ': ' + c.name + '.').join('')}`,
        body: `<div class="project">
<a class="back" href="${backHref}">${arrowL}${backLabel}</a>
<h1 class="ptitle">${esc(p.title)}</h1>
${p.videos.length ? `<div class="players">${p.videos.map((v, i) => `${player(v.url, v.title || p.title + (p.videos.length > 1 ? ' — film ' + (i + 1) : ''))}${v.title ? `<p class="film-label">${esc(v.title)}</p>` : ''}`).join('\n')}</div>` : player('', p.title)}
${creditsBlock(p.credits)}
${await stillsBlock(p.stills, p.title)}
<div class="pnav">
<a class="back" href="${backHref}">${arrowL}${backLabel}</a>
${isWork !== null && list.length > 1 ? `<a class="next" href="/work/${next.slug}/">Next: ${esc(next.title)}${arrowR}</a>` : ''}
</div>
<script>(function(){var n=${CAT_NAMES_JSON};var f=new URLSearchParams(location.search).get('from');if(!f||!n[f])return;var u=f==='all'?'/all/':'/category/'+f+'/';document.querySelectorAll('a.back').forEach(function(a){a.href=u;a.lastChild.textContent='Back to '+n[f];});})();</script>
</div>`,
      }));
    }
  }

  // Feature film
  const filmStills = await stillsBlock(arr(film.stills).map(imgPath).filter(Boolean), film.title || 'Feature film');
  // Layout: poster at the top, then credits, trailer, teaser and stills
  const filmPoster = film.poster ? await responsive(imgPath(film.poster), 1080, 2048) : null;
  write('feature-film/index.html', page({
    title: film.title || 'Feature Film', active: 'feature', path: '/feature-film/',
    description: `${film.title || 'Feature film'} — ${(arr(film.details)).join(', ')}. ${film.role || ''}`.trim(),
    image: filmPoster ? filmPoster.src : '',
    body: `<div class="film">
<h1 class="ptitle">${esc(film.title || 'Feature Film')} - Feature Film</h1>
${filmPoster ? `<div class="film-poster">${imgTag(filmPoster, (film.title || 'Feature film') + ' poster', '100vw')}</div>` : ''}
${film.synopsis ? `<div class="film-synopsis">${String(film.synopsis).split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean).map((t) => `<p>${esc(t)}</p>`).join('')}</div>` : ''}
${creditsBlock(arr(film.credits).filter((c) => c && (c.name || '').trim()))}
${film.trailer ? `<div class="film-video"><p class="film-kicker">Trailer 1</p>${player(film.trailer, (film.title || '') + ' trailer 1')}</div>` : ''}
${film.teaser ? `<div class="film-video"><p class="film-kicker">Trailer 2</p>${player(film.teaser, (film.title || '') + ' trailer 2')}</div>` : ''}
${filmStills ? `<div class="film-stills"><p class="film-kicker">Stills</p>${filmStills}</div>` : ''}
</div>`,
  }));

  // Category pages: /category/<name>/ lists that category's projects in the same order
  for (const c of usedCats) {
    const list = ordered.filter((p) => p.cats.some((pc) => pc.id === c.id));
    const catRows = [];
    for (const p of list) catRows.push(await row(p, catSlug(c)));
    write(`category/${catSlug(c)}/index.html`, page({
      title: c.name, active: 'work', path: `/category/${catSlug(c)}/`,
      description: `${c.name} — work by ${PERSON}, Dubai-based Director of Photography.`,
      body: `<h1 class="title">${esc(c.name)}</h1>
${filterBar(c.id)}
<div class="rows${THUMBS === 'one' ? ' rows-one' : ''}" id="rows">
${catRows.join('\n')}
</div>`,
    }));
  }

  // All works: every live project in order.txt order, switched on or not
  const allRows = [];
  for (const p of ordered) allRows.push(await row(p, 'all'));
  write('all/index.html', page({
    title: 'All', active: 'work', path: '/all/',
    description: `All work by ${PERSON}, Dubai-based Director of Photography.`,
    body: `<h1 class="title">All</h1>
${filterBar('everything')}
<div class="rows${THUMBS === 'one' ? ' rows-one' : ''}" id="rows">
${allRows.join('\n')}
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
<p class="lead">${esc(settings.contact_intro || 'Say hello.')}</p>
<div class="two">
<label><span class="label">Name</span><input class="field" type="text" name="name" required autocomplete="name" placeholder="Your name"></label>
<label><span class="label">Email</span><input class="field" type="email" name="email" required autocomplete="email" placeholder="you@company.com"></label>
</div>
<label><span class="label">Message</span><textarea class="field" name="message" rows="5" required placeholder="Type your message here"></textarea></label>
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
  const urls = [...new Set(pagesForSitemap)].filter((u) => !projects.some((p) => isRetired(p) && u === `/work/${p.slug}/`));
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${SITE_URL}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

  // Keep old Adobe Portfolio links working (and their Google ranking): 301 redirects
  const OLD_LINKS = {
    '/featured': '/',
    '/saudia-arlines-rihla-journey': 'saudia-airlines-rihla-journey', '/jeetbuzz-x-sunil-narine-x-andre-russel': 'jeetbuzz-x-sunil-narine-x-andre-russell',
    '/e-money-stratgey-films': 'eand-money-strategy-films', '/mall-alone-dubai-tourism': 'mall-alone-dubai-tourism-tom-felton',
    '/homecentre-creature': 'home-centre-fathers-day', '/jsw-cements': 'jsw-cement', '/noon': '/',
    // project renamed after it went live
    '/work/experience-abu-dhabi-x-ranvir-deepika/': '/work/experience-abu-dhabi-x-ranveer-singh-deepika-padukone/',
  };
  const redirects = [];
  for (const [from, to] of Object.entries(OLD_LINKS)) redirects.push(`${from} ${to.startsWith('/') ? to : `/work/${to}/`} 301`);
  for (const p of projects) if (!OLD_LINKS['/' + p.slug]) redirects.push(`/${p.slug} /work/${p.slug}/ 301`);
  for (const r of arr(settings.redirects)) if (r && r.from && r.to) redirects.push(`${r.from} ${r.to} 301`);
  fs.writeFileSync(path.join(OUT, '_redirects'), redirects.join('\n') + '\n');

  write('404.html', page({ title: 'Page not found', active: '', body: `<h1 class="title title-gap">Not found</h1><p class="muted">This page doesn’t exist. <a class="u" href="/">Back to Work</a></p>` }));

  console.log(`Built ${work.length} work projects, ${categories.length} categories, ${imgCache.size} image versions → dist/`);
})().catch((e) => { console.error(e); process.exit(1); });
