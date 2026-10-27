// Builds the static website into ./dist from the JSON files in ./content.
// Cloudflare Pages runs this automatically: build command "node build.js", output folder "dist".
// No packages needed — plain Node.js.

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'dist');
const C = path.join(ROOT, 'content');

// ---------- helpers ----------
const readJSON = (p, fallback = {}) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { console.warn('Could not read', p, e.message); return fallback; }
};
const readDir = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : []);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/×/g, 'x').replace(/[’'“”"()]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const write = (rel, html) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html); };
const copyDir = (src, dst) => {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f), d = path.join(dst, f);
    if (fs.statSync(s).isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
};
const img = (src) => (src ? (/^https?:/.test(src) || src.startsWith('/') ? src : '/' + src) : '');
const num = (v, d = 9999) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);

// Turns a Vimeo or YouTube link into an embeddable player URL
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

const categories = readDir(path.join(C, 'categories')).map((f) => {
  const d = readJSON(path.join(C, 'categories', f));
  return { id: f.replace(/\.json$/, ''), name: d.name || f.replace(/\.json$/, ''), order: num(d.order) };
}).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

// A project's category can be stored as a file path, a file name or a name — accept all.
const catLookup = {};
for (const c of categories) { catLookup[c.id] = c; catLookup[c.name.toLowerCase()] = c; }
const resolveCat = (ref) => {
  if (!ref) return null;
  const key = String(typeof ref === 'object' ? ref.value || ref.name || '' : ref);
  const stem = path.basename(key).replace(/\.json$/, '');
  return catLookup[stem] || catLookup[key.toLowerCase()] || null;
};

const projects = readDir(path.join(C, 'projects')).map((f) => {
  const d = readJSON(path.join(C, 'projects', f));
  const cats = (Array.isArray(d.categories) ? d.categories : d.categories ? [d.categories] : []).map(resolveCat).filter(Boolean);
  return {
    slug: f.replace(/\.json$/, '') || slugify(d.title),
    title: d.title || 'Untitled',
    status: (d.status || 'work').toLowerCase() === 'archive' ? 'archive' : (d.status || '').toLowerCase() === 'hidden' ? 'hidden' : 'work',
    order: num(d.order),
    cats,
    thumbnail: img(d.thumbnail),
    video: d.video || '',
    credits: (d.credits || []).filter((c) => c && (c.name || '').trim()),
    stills: (Array.isArray(d.stills) ? d.stills : d.stills ? [d.stills] : []).map((s) => img(typeof s === 'object' ? s.image || s.src : s)).filter(Boolean),
  };
}).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

const work = projects.filter((p) => p.status === 'work');
const archive = projects.filter((p) => p.status === 'archive');

// ---------- layout ----------
const NAV = [
  ['work', 'Work', '/'],
  ['archive', 'Archive', '/archive/'],
  ['feature', 'Feature Film', '/feature-film/'],
  ['about', 'About', '/about/'],
  ['contact', 'Contact', '/contact/'],
];
const name = settings.name || 'AEYAZ';

function page({ title, active, body, description }) {
  const fullTitle = title ? `${title} — ${name}` : `${name} — ${settings.headline || 'Director of Photography'}`;
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
<meta name="description" content="${esc(description || settings.seo_description || '')}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description || settings.seo_description || '')}">
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
<span>© ${new Date().getFullYear()} ${esc(name.charAt(0) + name.slice(1).toLowerCase())}</span>
<div class="foot-links">
${footLinks}
</div>
</footer>
</div>
<script src="/assets/site.js" defer></script>
</body>
</html>`;
}

const thumb = (p) => `<div class="thumb">${p.thumbnail ? `<img src="${esc(p.thumbnail)}" alt="${esc(p.title)}" loading="lazy">` : ''}</div>`;
const card = (p) => `<a class="proj" href="/work/${p.slug}/" data-cats="${p.cats.map((c) => c.id).join(' ')}">
${thumb(p)}
<div class="pname">${esc(p.title)}</div>
</a>`;

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

// Stills alternate: one wide frame, then a pair, then wide, then a pair…
function stillsBlock(stills, alt) {
  if (!stills.length) return '';
  const out = [];
  let i = 0, wide = true;
  while (i < stills.length) {
    if (wide || i === stills.length - 1) { out.push(`<img class="still wide" src="${esc(stills[i])}" alt="${esc(alt)} — still" loading="lazy">`); i += 1; }
    else { out.push(`<div class="pair"><img class="still" src="${esc(stills[i])}" alt="${esc(alt)} — still" loading="lazy"><img class="still" src="${esc(stills[i + 1])}" alt="${esc(alt)} — still" loading="lazy"></div>`); i += 2; }
    wide = !wide;
  }
  return `<section class="stills" aria-label="Stills">\n${out.join('\n')}\n</section>`;
}

const arrowL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';
const arrowR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

// ---------- build ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
copyDir(path.join(ROOT, 'assets'), path.join(OUT, 'assets'));
copyDir(path.join(ROOT, 'images'), path.join(OUT, 'images'));
copyDir(path.join(ROOT, 'files'), path.join(OUT, 'files'));

// Home / Work
const usedCats = categories.filter((c) => work.some((p) => p.cats.some((pc) => pc.id === c.id)));
write('index.html', page({
  active: 'work',
  body: `<h1 class="title">${esc(settings.headline || 'Director of Photography')}</h1>
${usedCats.length ? `<div class="filters" role="group" aria-label="Filter projects by category">
<button type="button" data-filter="all" aria-pressed="true">All</button>
${usedCats.map((c) => `<button type="button" data-filter="${c.id}" aria-pressed="false">${esc(c.name)}</button>`).join('\n')}
</div>` : '<div class="filters-space"></div>'}
<div class="grid" id="grid">
${work.map(card).join('\n')}
</div>`,
}));

// Archive
write('archive/index.html', page({
  title: 'Archive', active: 'archive',
  body: `<h1 class="title title-gap">Archive</h1>
<div class="grid">
${archive.map(card).join('\n')}
</div>`,
}));

// Project pages (work + archive)
for (const list of [work, archive]) {
  list.forEach((p, i) => {
    const next = list[(i + 1) % list.length];
    const backHref = p.status === 'archive' ? '/archive/' : '/';
    const backLabel = p.status === 'archive' ? 'Back to Archive' : 'Back to Work';
    write(`work/${p.slug}/index.html`, page({
      title: p.title, active: p.status === 'archive' ? 'archive' : 'work',
      description: `${p.title} — cinematography by ${name.charAt(0) + name.slice(1).toLowerCase()}.`,
      body: `<div class="project">
<a class="back" href="${backHref}">${arrowL}${backLabel}</a>
<h1 class="ptitle">${esc(p.title)}</h1>
${player(p.video, p.title)}
${creditsBlock(p.credits)}
${stillsBlock(p.stills, p.title)}
<div class="pnav">
<a class="back" href="${backHref}">${arrowL}${backLabel}</a>
${list.length > 1 ? `<a class="next" href="/work/${next.slug}/">Next: ${esc(next.title)}${arrowR}</a>` : ''}
</div>
</div>`,
    }));
  });
}
// Hidden projects still get a page (shareable by link) but are not listed anywhere
for (const p of projects.filter((x) => x.status === 'hidden')) {
  write(`work/${p.slug}/index.html`, page({ title: p.title, active: 'work', body: `<div class="project"><a class="back" href="/">${arrowL}Back to Work</a><h1 class="ptitle">${esc(p.title)}</h1>${player(p.video, p.title)}${creditsBlock(p.credits)}${stillsBlock(p.stills, p.title)}</div>` }));
}

// Feature film
const filmStills = (Array.isArray(film.stills) ? film.stills : film.stills ? [film.stills] : []).map((s) => img(typeof s === 'object' ? s.image : s)).filter(Boolean);
write('feature-film/index.html', page({
  title: film.title || 'Feature Film', active: 'feature',
  body: `<div class="film">
<div class="film-head">
<h1 class="title">${esc(film.title || 'Feature Film')}</h1>
<div class="film-meta">
${(film.details || []).map((d) => `<span>${esc(d)}</span>`).join('\n')}
${film.role ? `<span class="hi">${esc(film.role)}</span>` : ''}
</div>
</div>
${film.trailer ? player(film.trailer, (film.title || '') + ' trailer') : ''}
${film.teaser ? player(film.teaser, (film.title || '') + ' teaser') : ''}
${filmStills.length ? `<div class="film-stills">${filmStills.map((s) => `<img class="still" src="${esc(s)}" alt="${esc(film.title)} — frame" loading="lazy">`).join('')}</div>` : ''}
${creditsBlock((film.credits || []).filter((c) => c && (c.name || '').trim()))}
</div>`,
}));

// About
const paras = String(about.body || '').split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
write('about/index.html', page({
  title: 'About', active: 'about',
  body: `<h1 class="title title-gap">About</h1>
<div class="about">
<div class="portrait">${about.portrait ? `<img src="${esc(img(about.portrait))}" alt="${esc(name)}">` : ''}</div>
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
  title: 'Contact', active: 'contact',
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

// 404
write('404.html', page({ title: 'Page not found', active: '', body: `<h1 class="title title-gap">Not found</h1><p class="muted">This page doesn’t exist. <a class="u" href="/">Back to Work</a></p>` }));

console.log(`Built ${work.length} work + ${archive.length} archive projects, ${categories.length} categories → dist/`);
