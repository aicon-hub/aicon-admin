/* AiCoN Admin - compose, preview and publish posts to the AiCoN site repo.
   No third-party scripts. Token lives only in this browser's localStorage. */
'use strict';

const SITE_BASE = 'https://aicon-hub.github.io/';
const LS_KEY = 'aicon-admin-settings';
const LS_DRAFT = 'aicon-admin-draft';

const TYPES = {
  ai:          { label: 'AI tool',              cat: 'ai',           chip: 'AI TOOL' },
  app:         { label: 'Android app',          cat: 'apps',         chip: 'FREE APP' },
  pc:          { label: 'PC / Linux tool',      cat: 'pc-tools',     chip: 'FREE TOOL' },
  scholarship: { label: 'Scholarship',          cat: 'scholarships', chip: 'SCHOLARSHIP' },
  govt:        { label: 'Govt service / scheme',cat: 'government',   chip: 'GOVT SERVICE' },
  safety:      { label: 'Digital safety',       cat: 'safety',       chip: 'DIGITAL SAFETY' },
  learning:    { label: 'Learning',             cat: 'learning',     chip: 'FREE LEARNING' },
  offer:       { label: 'Offer',                cat: 'offers',       chip: 'OFFER' },
  event:       { label: 'Event',                cat: 'events',       chip: 'EVENT' },
  news:        { label: 'News / alert',         cat: 'other',        chip: 'NEWS' },
  other:       { label: 'Other',                cat: 'other',        chip: 'FREE RESOURCE' },
};
const CATS = ['ai','apps','pc-tools','linux','safety','scholarships','government','offers','events','learning','other'];

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const escAttr = esc;
const clean = s => String(s).replace(/[\u2013\u2014]/g,'-').trim();

/* ---------- settings ---------- */
function settings(){ try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch(e){ return {}; } }
function saveSettings(patch){ const s = Object.assign(settings(), patch); localStorage.setItem(LS_KEY, JSON.stringify(s)); return s; }
function repoName(){ return (settings().repo || 'aicon-hub/aicon-hub.github.io').trim(); }
function token(){ return (settings().token || '').trim(); }

function setConn(state, text){
  const d = $('conn-dot'); d.className = 'dot' + (state ? ' ' + state : '');
  $('conn-text').textContent = text;
}

/* ---------- github api ---------- */
async function gh(path, opts = {}){
  const t = token();
  if (!t) throw new Error('No token saved. Open Setup and paste your GitHub token.');
  const r = await fetch('https://api.github.com' + path, Object.assign({
    headers: {
      'Authorization': 'Bearer ' + t,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
  }, opts));
  if (!r.ok) {
    let msg = r.status + ' ' + r.statusText;
    try { const j = await r.json(); if (j.message) msg += ': ' + j.message; } catch(e){}
    const err = new Error(msg); err.status = r.status; throw err;
  }
  return r.status === 204 ? null : r.json();
}

const b64encodeText = s => btoa(unescape(encodeURIComponent(s)));
function b64decodeText(b){
  const bin = atob(b.replace(/\n/g,''));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
const readFileB64 = f => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result.split(',')[1]);
  r.onerror = rej;
  r.readAsDataURL(f);
});

/* One atomic commit with several files. files: [{path, text} or {path, b64}] */
async function commitFiles(files, message, log){
  const repo = repoName();
  log('Reading main branch...');
  const ref = await gh('/repos/' + repo + '/git/ref/heads/main');
  const baseSha = ref.object.sha;
  const baseCommit = await gh('/repos/' + repo + '/git/commits/' + baseSha);
  log('Creating ' + files.length + ' file blob(s)...');
  const tree = [];
  for (const f of files) {
    const blob = await gh('/repos/' + repo + '/git/blobs', {
      method: 'POST',
      body: JSON.stringify(f.b64 ? { content: f.b64, encoding: 'base64' } : { content: f.text, encoding: 'utf-8' }),
    });
    tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  log('Building commit...');
  const newTree = await gh('/repos/' + repo + '/git/trees', {
    method: 'POST', body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }),
  });
  const commit = await gh('/repos/' + repo + '/git/commits', {
    method: 'POST', body: JSON.stringify({ message, tree: newTree.sha, parents: [baseSha] }),
  });
  await gh('/repos/' + repo + '/git/refs/heads/main', {
    method: 'PATCH', body: JSON.stringify({ sha: commit.sha }),
  });
  log('Pushed: ' + commit.sha.slice(0, 7));
  return commit;
}

/* ---------- form state ---------- */
function fillSelect(sel, items, withLabels){
  sel.innerHTML = '';
  for (const it of items) {
    const o = document.createElement('option');
    if (withLabels) { o.value = it[0]; o.textContent = it[1]; }
    else { o.value = it; o.textContent = it; }
    sel.appendChild(o);
  }
}

function todayISO(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function fmtDate(iso){
  if (!iso) return '';
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const p = iso.split('-');
  if (p.length !== 3) return iso;
  return String(parseInt(p[2],10)) + ' ' + months[parseInt(p[1],10)-1] + ' ' + p[0];
}

function slugify(s){
  return clean(s).toLowerCase()
    .replace(/['\u2019]/g,'')
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0, 90);
}

let iconFile = null;
let iconURL = null;

function formState(){
  const type = $('f-type').value;
  return {
    type,
    chip: clean($('f-chip').value) || TYPES[type].chip,
    cat: $('f-cat').value,
    date: $('f-date').value || todayISO(),
    slug: slugify($('f-slug').value || $('f-title').value),
    title: clean($('f-title').value),
    summary: clean($('f-summary').value),
    lead: clean($('f-lead').value),
    facts: $('f-facts').value.split('\n').map(clean).filter(Boolean),
    body: $('f-body').value,
    deadline: $('f-deadline').value,
    deadlineLabel: clean($('f-deadline-label').value),
    links: $('f-links').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const i = l.indexOf('|');
      return i === -1 ? { label: l.trim(), url: l.trim() } : { label: clean(l.slice(0,i)), url: l.slice(i+1).trim() };
    }),
    tested: $('f-tested').checked,
    extra: extraState(type),
  };
}

/* Type-specific extra fields */
const EXTRA_FIELDS = {
  app: [
    { id: 'play', label: 'Play Store link', ph: 'https://play.google.com/store/apps/details?id=...' },
    { id: 'fdroid', label: 'F-Droid / source link (optional)', ph: 'https://f-droid.org/...' },
  ],
  news: [
    { id: 'source', label: 'Reporting source', ph: 'Reuters, PIB, official blog...' },
  ],
};
function extraState(type){
  const out = {};
  for (const f of (EXTRA_FIELDS[type] || [])) {
    const el = $('x-' + f.id);
    if (el) out[f.id] = clean(el.value);
  }
  return out;
}
function renderExtra(){
  const type = $('f-type').value;
  const wrap = $('type-extra');
  wrap.innerHTML = '';
  for (const f of (EXTRA_FIELDS[type] || [])) {
    const l = document.createElement('label');
    l.className = 'fld';
    l.innerHTML = '<span>' + esc(f.label) + '</span>';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.id = 'x-' + f.id; inp.placeholder = f.ph || ''; inp.spellcheck = false;
    l.appendChild(inp);
    wrap.appendChild(l);
  }
}

/* ---------- body markup -> html ---------- */
function bodyToHtml(src){
  const lines = src.split('\n');
  let html = '', list = null;
  const closeList = () => { if (list) { html += '</' + list + '>\n'; list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const t = line.trim();
    let m;
    if (!t) { closeList(); continue; }
    if ((m = t.match(/^##\s+(.+)/))) { closeList(); html += '<h2>' + esc(clean(m[1])) + '</h2>\n'; }
    else if ((m = t.match(/^-\s+(.+)/))) { if (list !== 'ul') { closeList(); html += '<ul>\n'; list = 'ul'; } html += '<li>' + esc(clean(m[1])) + '</li>\n'; }
    else if ((m = t.match(/^\d+[.)]\s+(.+)/))) { if (list !== 'ol') { closeList(); html += '<ol>\n'; list = 'ol'; } html += '<li>' + esc(clean(m[1])) + '</li>\n'; }
    else if ((m = t.match(/^>\s+(.+)/))) { closeList(); html += '<p><strong>' + esc(clean(m[1])) + '</strong></p>\n'; }
    else { closeList(); html += '<p>' + esc(clean(t)) + '</p>\n'; }
  }
  closeList();
  return html;
}

/* ---------- article html ---------- */
function iconPath(st){
  if (!iconFile) return null;
  const ext = (iconFile.name.match(/\.([a-z0-9]+)$/i) || [null,'png'])[1].toLowerCase().replace('jpeg','jpg').replace('svg','svg');
  return 'assets/2026/howto/' + st.slug + '-logo.' + ext;
}

function buildArticle(st){
  const d = fmtDate(st.date);
  const url = SITE_BASE + 'posts/' + st.slug + '.html';
  const icon = iconPath(st);
  const iconAbs = icon ? SITE_BASE + icon : '';
  const firstLink = st.links[0];

  const facts = st.facts.length
    ? '<h2>Quick facts</h2>\n<ul>\n' + st.facts.map(f => '<li>' + esc(f) + '</li>').join('\n') + '\n</ul>\n' : '';
  const deadline = st.deadline
    ? '<h2>Last date</h2>\n<p><strong>' + esc(st.deadlineLabel || ('Last date: ' + fmtDate(st.deadline))) + '</strong> (' + esc(fmtDate(st.deadline)) + '). Check the official notice before applying; dates can change.</p>\n' : '';
  const tested = st.tested
    ? '<p><strong>Tested by AiCoN:</strong> we installed and used this ourselves before publishing.</p>\n' : '';
  const sources = st.links.length
    ? '<p>Sources checked ' + esc(d) + ':</p>\n<ul>\n' +
      st.links.map(l => '<li><a href="' + escAttr(l.url) + '" rel="noopener" target="_blank">' + esc(l.label) + '</a></li>').join('\n') +
      '\n</ul>\n' : '';
  const access = firstLink
    ? '<p><a class="btn-orange" href="' + escAttr(firstLink.url) + '" rel="noopener" target="_blank">Open ' + esc(firstLink.label) + '</a></p>\n' : '';

  const logoImg = icon
    ? '<img class="pub-logo" src="../' + escAttr(icon) + '" alt="' + escAttr(st.title) + ' logo" width="76" height="76" style="display:block;width:76px;height:76px;object-fit:contain;border-radius:16px;padding:5px;margin:12px 0 8px;background:#fff"/>' : '';

  const jsonld = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Article',
    headline: st.title, description: st.summary || st.lead.slice(0, 200),
    datePublished: st.date, inLanguage: 'en-IN',
    mainEntityOfPage: url,
    author: { '@type': 'Organization', name: 'AiCoN' },
    publisher: { '@type': 'Organization', name: 'AiCoN' },
  });

  return '<!DOCTYPE html>\n\n<html lang="en-IN"><head><script src="../assets/2026/theme.js?v=20261105bj"></script>\n' +
'<meta charset="utf-8"/>\n<meta content="width=device-width,initial-scale=1" name="viewport"/>\n' +
'<title>' + esc(st.title) + ' | AiCoN</title>\n' +
'<link href="' + url + '" rel="canonical"/>\n' +
'<meta content="index,follow,max-image-preview:large" name="robots"/>\n' +
'<meta content="' + st.date + '" property="article:published_time"/>\n' +
'<script type="application/ld+json">' + jsonld + '</script>\n' +
'<link href="https://fonts.googleapis.com" rel="preconnect"/><link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>\n' +
'<link href="../assets/2026/style.css?v=20261021dates1" rel="stylesheet"/><link href="../assets/2026/article.css?v=20261021dates1" rel="stylesheet"/>' +
'<link href="https://fonts.googleapis.com/css2?family=Comfortaa:wght@500&amp;family=Inter:wght@400;500;600;700&amp;family=Poppins:wght@400;500;600;700&amp;display=swap" rel="stylesheet"/>' +
'<link href="../assets/2026/theme.css?v=20261021dates1" rel="stylesheet"/>\n' +
'<link href="../assets/2026/cinema.css?v=20261015smooth1" rel="stylesheet"/><script defer="" src="../assets/2026/cinema.js?v=20261015smooth1"></script>\n' +
'<link href="../assets/2026/refresh-2026.css?v=1" rel="stylesheet"/>\n' +
'<meta name="description" content="' + escAttr(st.summary) + '"/>\n' +
'<meta property="og:type" content="article"/>\n<meta property="og:site_name" content="AiCoN"/>\n' +
'<meta property="og:title" content="' + escAttr(st.title) + '"/>\n' +
'<meta property="og:description" content="' + escAttr(st.summary) + '"/>\n' +
'<meta property="og:url" content="' + url + '"/>\n' +
'<meta name="twitter:card" content="' + (iconAbs ? 'summary_large_image' : 'summary') + '"/>\n' +
'<meta name="twitter:title" content="' + escAttr(st.title) + '"/>\n' +
'<meta name="twitter:description" content="' + escAttr(st.summary) + '"/>\n' +
(iconAbs ? '<meta property="og:image" content="' + iconAbs + '"/>\n<meta name="twitter:image" content="' + iconAbs + '"/>\n' : '') +
'</head><body>\n' +
'<header class="top"><div class="wrap"><a class="brand" href="../index.html">Ai<span>CoN</span></a><nav><a href="index.html">Posts</a><a href="../index.html#contact">Contact</a><a href="about-aicon.html">About AiCoN</a></nav></div></header>\n' +
'<main class="wrap">\n' +
'<p class="crumbs"><a href="../index.html">Home</a> / <a href="index.html">Posts</a> / ' + esc(st.title.split(':')[0]) + '</p>\n' +
'<article class="post"><span class="chip">' + esc(st.chip) + '</span>' + logoImg +
'<h1>' + esc(st.title) + '</h1>' +
'<p class="meta">By AiCoN | Published ' + esc(d) + ' | Sources checked ' + esc(d) + '</p>' +
'<p class="lead">' + esc(st.lead) + '</p>\n' +
access + tested + facts + bodyToHtml(st.body) + deadline + sources +
'<p><a href="index.html">Back to all posts</a></p>\n' +
'</article></main>\n' +
'<footer><div class="wrap">&copy; 2026 AiCoN | Your Trusted Tech Companion<br/>Every tool and link verified before sharing.<br/>' +
'<a href="https://whatsapp.com/channel/0029VawGIGTD38CRJde0fl1c">WhatsApp</a> &middot; <a href="https://t.me/AiCoN4tech">Telegram</a> &middot; ' +
'<a href="mailto:aicon4tech@proton.me">aicon4tech@proton.me</a> &middot; <a href="mailto:aicon4tech@gmail.com">aicon4tech@gmail.com</a></div></footer>\n' +
'</body></html>\n';
}

/* ---------- card html for posts/index.html ---------- */
const FALLBACK_SVG = '<svg class="micon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 15.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z"/></svg>';
function buildCard(st){
  const d = fmtDate(st.date);
  const url = SITE_BASE + 'posts/' + st.slug + '.html';
  const icon = iconPath(st);
  const media = icon
    ? '<a class="guide-media" href="../posts/' + st.slug + '.html"><img src="' + SITE_BASE + icon + '" alt="' + escAttr(st.title) + '" loading="lazy"/></a>'
    : '<a class="guide-media mono cat-' + escAttr(st.cat) + '" href="../posts/' + st.slug + '.html">' + FALLBACK_SVG + '</a>';
  const search = (st.title + ' ' + st.summary + ' ' + st.chip.toLowerCase() + ' ' + d).toLowerCase().replace(/["']/g,'').replace(/\s+/g,' ').trim();
  const dl = st.deadline
    ? ' data-deadlines=\'[{"date":"' + st.deadline + '","label":"' + escAttr(st.deadlineLabel || ('Last date ' + fmtDate(st.deadline))).replace(/'/g, '&#39;') + '"}]\'' 
    : '';
  return '<article class="guide-card" data-categories="' + escAttr(st.cat) + '" data-search="' + escAttr(search) + '"' + dl + '>' +
    media +
    '<div class="guide-body"><div class="guide-meta"><span class="tag">' + esc(st.chip) + '</span><small>' + esc(d) + '</small></div>' +
    '<h3><a href="../posts/' + st.slug + '.html">' + esc(st.title) + '</a></h3>' +
    '<p>' + esc(st.summary) + '</p>' +
    '<a class="read-link" href="../posts/' + st.slug + '.html">Read guide</a></div></article>';
}

/* ---------- captions ---------- */
function captions(st){
  const url = SITE_BASE + 'posts/' + st.slug + '.html';
  const desc = st.summary.split(/(?<=[.!?])\s+/)[0] || st.summary;
  const wa = '\u26A1 ' + st.title + '\n\n' + desc + '\n\nRead the full guide: ' + url;
  let tg = '\u26A1 *' + st.title + '*\n\n' + desc + '\n\nRead the full guide: ' + url;
  return { wa, tg, url };
}

/* ---------- validation ---------- */
function validate(st){
  const missing = [];
  if (!st.title) missing.push('Title');
  if (!st.slug) missing.push('Slug');
  if (!st.summary) missing.push('Summary');
  if (!st.lead) missing.push('Lead paragraph');
  if (!st.body.trim()) missing.push('Article body');
  return missing;
}

/* ---------- preview ---------- */
let lastArticle = '';
function showPreview(){
  const st = formState();
  const missing = validate(st);
  if (missing.length) { alert('Missing: ' + missing.join(', ')); return; }
  lastArticle = buildArticle(st);
  let html = lastArticle
    .replace(/\.\.\/assets\//g, SITE_BASE + 'assets/')
    .replace(/href="index\.html"/g, 'href="' + SITE_BASE + 'posts/index.html"')
    .replace(/href="\.\.\/index\.html/g, 'href="' + SITE_BASE + 'index.html');
  if (iconURL) {
    const icon = iconPath(st);
    html = html.replace(SITE_BASE + icon, iconURL).replace('../' + icon, iconURL);
  }
  $('preview-frame').srcdoc = html;
  switchTab('tab-preview');
}

/* ---------- publish ---------- */
function logTo(el, msg){
  el.hidden = false;
  el.textContent += msg + '\n';
  el.scrollTop = el.scrollHeight;
}

async function doPublish(){
  const st = formState();
  const missing = validate(st);
  if (missing.length) { alert('Missing: ' + missing.join(', ')); return; }
  const log = m => logTo($('publish-log'), m);
  $('publish-log').textContent = ''; $('publish-log').hidden = true;
  $('publish-result').innerHTML = '';
  $('btn-publish').disabled = true;
  try {
    if (!lastArticle) lastArticle = buildArticle(st);
    const card = buildCard(st);

    log('Checking for an existing post with this slug...');
    let exists = false;
    try { await gh('/repos/' + repoName() + '/contents/posts/' + st.slug + '.html'); exists = true; } catch(e){ if (e.status !== 404) throw e; }
    if (exists && !confirm('posts/' + st.slug + '.html already exists. Overwrite it and add a new card?')) {
      $('btn-publish').disabled = false; log('Cancelled.'); return;
    }

    log('Fetching posts/index.html...');
    const idxFile = await gh('/repos/' + repoName() + '/contents/posts/index.html');
    const idx = b64decodeText(idxFile.content);
    const mark = '<article class="guide-card"';
    const at = idx.indexOf(mark);
    if (at === -1) throw new Error('Could not find the card list inside posts/index.html. The site template may have changed.');
    const newIdx = idx.slice(0, at) + card + '\n' + idx.slice(at);

    const files = [
      { path: 'posts/' + st.slug + '.html', text: lastArticle },
      { path: 'posts/index.html', text: newIdx },
    ];
    if (iconFile) {
      const p = iconPath(st);
      log('Reading icon ' + iconFile.name + '...');
      files.push({ path: p, b64: await readFileB64(iconFile) });
    }

    const commit = await commitFiles(files, 'New post: ' + st.title, log);
    const cap = captions(st);
    const commitUrl = 'https://github.com/' + repoName() + '/commit/' + commit.sha;

    $('publish-result').innerHTML =
      '<div class="result-box"><h3>Published</h3>' +
      '<p class="hint">The site rebuilds in about a minute, then the post is live.</p>' +
      '<p><a href="' + cap.url + '" target="_blank" rel="noopener">' + cap.url + '</a><br/>' +
      '<a href="' + commitUrl + '" target="_blank" rel="noopener">View commit</a></p>' +
      '<h3 style="margin-top:14px">WhatsApp caption</h3>' +
      '<textarea rows="4" id="cap-wa" readonly></textarea>' +
      '<button class="copybtn" data-copy="cap-wa" type="button">Copy WhatsApp caption</button>' +
      '<h3 style="margin-top:14px">Telegram post</h3>' +
      '<textarea rows="4" id="cap-tg" readonly></textarea>' +
      '<div class="btnrow"><button class="copybtn" data-copy="cap-tg" type="button">Copy Telegram text</button>' +
      '<button class="copybtn" id="btn-tg-send" type="button">Send to Telegram</button></div>' +
      '<p class="hint" id="tg-status"></p></div>';
    $('cap-wa').value = cap.wa;
    $('cap-tg').value = cap.tg;
    $('btn-tg-send').addEventListener('click', () => sendTelegram(cap, iconPath(st)));
    log('Done.');
  } catch (e) {
    log('ERROR: ' + e.message);
    if (e.status === 403 || e.status === 404) log('Check the token in Setup: it needs Contents: Read and write on ' + repoName() + '.');
  }
  $('btn-publish').disabled = false;
}

async function sendTelegram(cap, icon){
  const status = $('tg-status');
  status.textContent = 'Asking the site repo to publish to Telegram...';
  try {
    const iconAbs = icon ? SITE_BASE + icon : '';
    await gh('/repos/' + repoName() + '/actions/workflows/telegram.yml/dispatches', {
      method: 'POST',
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          mode: 'publish',
          post_id: 'admin-' + Date.now(),
          text: cap.tg,
          photo_url: iconAbs,
          article_url: cap.url,
        },
      }),
    });
    status.textContent = 'Telegram publish requested. The bot posts within about a minute.';
  } catch (e) {
    status.textContent = 'Could not trigger Telegram (' + e.message + '). The token needs Actions: Read and write, or copy the text and post manually.';
  }
}

/* ---------- assets tab ---------- */
let assetFiles = [];
function renderAssetList(){
  const ul = $('a-list');
  ul.innerHTML = '';
  assetFiles.forEach((f, i) => {
    const li = document.createElement('li');
    const img = document.createElement('img');
    img.src = URL.createObjectURL(f.file);
    const inp = document.createElement('input');
    inp.value = f.name;
    inp.addEventListener('input', () => { f.name = inp.value; });
    const rm = document.createElement('button');
    rm.className = 'rm'; rm.type = 'button'; rm.textContent = '\u00D7';
    rm.addEventListener('click', () => { assetFiles.splice(i,1); renderAssetList(); });
    li.append(img, inp, rm);
    ul.appendChild(li);
  });
}
async function pushAssets(){
  const log = m => logTo($('assets-log'), m);
  $('assets-log').textContent = ''; $('assets-log').hidden = true;
  if (!assetFiles.length) { alert('Pick at least one file.'); return; }
  let folder = $('a-folder').value;
  if (folder === 'custom') folder = $('a-custom').value.trim();
  if (folder && !folder.endsWith('/')) folder += '/';
  $('btn-assets-push').disabled = true;
  try {
    const files = [];
    for (const f of assetFiles) {
      log('Reading ' + f.file.name + '...');
      files.push({ path: folder + f.name, b64: await readFileB64(f.file) });
    }
    const commit = await commitFiles(files, 'Assets: ' + files.map(f => f.path.split('/').pop()).join(', '), log);
    log('Live after the next site rebuild.');
    log('Commit: https://github.com/' + repoName() + '/commit/' + commit.sha);
    assetFiles = []; renderAssetList(); $('a-files').value = '';
  } catch (e) {
    log('ERROR: ' + e.message);
  }
  $('btn-assets-push').disabled = false;
}

/* ---------- posts tab ---------- */
async function loadPosts(){
  const ul = $('posts-list');
  ul.innerHTML = '<li class="hint">Loading...</li>';
  try {
    const r = await fetch(SITE_BASE + 'posts/index.html');
    const t = await r.text();
    const cards = [...t.matchAll(/<article\b[^>]*class="guide-card"[^>]*>[\s\S]*?<\/article>/g)].slice(0, 12);
    ul.innerHTML = '';
    for (const c of cards) {
      const h = c[0];
      const title = (h.match(/<h3><a[^>]*>([\s\S]*?)<\/a>/) || [])[1] || '';
      const href = (h.match(/<h3><a[^>]*href="([^"]+)"/) || [])[1] || '';
      const tag = (h.match(/<span[^>]*class="tag"[^>]*>([\s\S]*?)<\/span>/) || [])[1] || '';
      const date = (h.match(/<small>([^<]+)<\/small>/) || [])[1] || '';
      const url = href.startsWith('http') ? href : SITE_BASE + 'posts/' + href.replace(/^\.\.\/posts\//,'');
      const li = document.createElement('li');
      li.innerHTML = '<a href="' + escAttr(url) + '" target="_blank" rel="noopener">' + esc(title) + '</a>' +
        '<small><span class="ptag">' + esc(tag) + '</span> &middot; ' + esc(date) + '</small>';
      ul.appendChild(li);
    }
    if (!ul.children.length) ul.innerHTML = '<li class="hint">No posts found.</li>';
  } catch (e) {
    ul.innerHTML = '<li class="hint">Could not load: ' + esc(e.message) + '</li>';
  }
}

/* ---------- settings tab ---------- */
async function testConnection(){
  const log = m => logTo($('settings-log'), m);
  $('settings-log').textContent = ''; $('settings-log').hidden = true;
  saveSettings({ token: $('s-token').value, repo: $('s-repo').value });
  setConn('', 'checking...');
  try {
    const u = await gh('/user');
    log('Signed in as: ' + u.login);
    const r = await gh('/repos/' + repoName());
    log('Repo OK: ' + r.full_name + ' (' + (r.private ? 'private' : 'public') + ')');
    setConn('ok', u.login);
  } catch (e) {
    log('ERROR: ' + e.message);
    setConn('err', 'failed');
  }
}

/* ---------- tabs ---------- */
function switchTab(id){
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === id));
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  window.scrollTo(0, 0);
  if (id === 'tab-posts') loadPosts();
  if (id === 'tab-publish') renderPublishSummary();
}

function renderPublishSummary(){
  const st = formState();
  const files = ['posts/' + (st.slug || '...') + '.html', 'posts/index.html (new card on top)'];
  const icon = iconPath(st);
  if (icon) files.push(icon);
  $('publish-summary').innerHTML =
    '<div class="pills"><span class="pill">Type: <b>' + esc(TYPES[st.type].label) + '</b></span>' +
    '<span class="pill">Tag: <b>' + esc(st.chip) + '</b></span>' +
    '<span class="pill">Date: <b>' + esc(fmtDate(st.date)) + '</b></span></div>' +
    '<p><b>' + esc(st.title || '(no title yet)') + '</b></p>' +
    '<p class="hint">' + esc(st.summary || '') + '</p>' +
    '<p class="hint">One commit with ' + files.length + ' file(s):<br/>' + files.map(esc).join('<br/>') + '</p>';
}

/* ---------- draft autosave ---------- */
const DRAFT_FIELDS = ['f-type','f-chip','f-cat','f-date','f-slug','f-title','f-summary','f-lead','f-facts','f-body','f-deadline','f-deadline-label','f-links','f-tested'];
function saveDraft(){
  const d = {};
  for (const id of DRAFT_FIELDS) {
    const el = $(id);
    d[id] = el.type === 'checkbox' ? el.checked : el.value;
  }
  for (const f of Object.values(EXTRA_FIELDS).flat()) {
    const el = $('x-' + f.id);
    if (el) d['x-' + f.id] = el.value;
  }
  localStorage.setItem(LS_DRAFT, JSON.stringify(d));
}
function loadDraft(){
  let d;
  try { d = JSON.parse(localStorage.getItem(LS_DRAFT)) || {}; } catch(e){ return; }
  if (d['f-type']) $('f-type').value = d['f-type'];
  renderExtra();
  for (const id of DRAFT_FIELDS) {
    if (d[id] === undefined || id === 'f-type') continue;
    const el = $(id);
    if (el.type === 'checkbox') el.checked = !!d[id]; else el.value = d[id];
  }
  for (const k of Object.keys(d)) {
    if (k.startsWith('x-') && $(k)) $(k).value = d[k];
  }
}

/* ---------- init ---------- */
function init(){
  fillSelect($('f-type'), Object.entries(TYPES).map(([k,v]) => [k, v.label]), true);
  fillSelect($('f-cat'), CATS);
  $('f-date').value = todayISO();

  $('f-type').addEventListener('change', () => {
    const t = TYPES[$('f-type').value];
    $('f-chip').value = t.chip;
    $('f-cat').value = t.cat;
    renderExtra(); saveDraft();
  });
  $('f-type').value = 'ai';
  $('f-chip').value = TYPES.ai.chip;
  $('f-cat').value = TYPES.ai.cat;
  renderExtra();

  $('f-title').addEventListener('input', () => {
    if (!$('f-slug').dataset.touched) $('f-slug').value = slugify($('f-title').value) + '-guide';
  });
  $('f-slug').addEventListener('input', () => { $('f-slug').dataset.touched = '1'; });

  $('f-icon').addEventListener('change', () => {
    iconFile = $('f-icon').files[0] || null;
    if (iconURL) URL.revokeObjectURL(iconURL);
    iconURL = iconFile ? URL.createObjectURL(iconFile) : null;
    $('icon-preview').innerHTML = iconURL ? '<img src="' + iconURL + '" alt="icon preview"/>' : '';
  });

  $('btn-preview').addEventListener('click', showPreview);
  $('btn-back-edit').addEventListener('click', () => switchTab('tab-new'));
  $('btn-to-publish').addEventListener('click', () => switchTab('tab-publish'));
  $('btn-pub-back').addEventListener('click', () => switchTab('tab-new'));
  $('btn-publish').addEventListener('click', doPublish);
  $('btn-clear').addEventListener('click', () => {
    if (!confirm('Clear the whole form?')) return;
    localStorage.removeItem(LS_DRAFT);
    for (const id of DRAFT_FIELDS) {
      const el = $(id);
      if (el.type === 'checkbox') el.checked = false; else el.value = '';
    }
    $('f-date').value = todayISO();
    iconFile = null; $('icon-preview').innerHTML = ''; $('f-icon').value = '';
    lastArticle = '';
  });

  document.querySelectorAll('.tabbar button').forEach(b =>
    b.addEventListener('click', () => switchTab(b.dataset.tab)));

  $('a-folder').addEventListener('change', () => {
    $('a-custom-wrap').hidden = $('a-folder').value !== 'custom';
  });
  $('a-files').addEventListener('change', () => {
    for (const f of $('a-files').files) assetFiles.push({ file: f, name: f.name });
    renderAssetList();
  });
  $('btn-assets-push').addEventListener('click', pushAssets);

  $('btn-test').addEventListener('click', testConnection);
  $('btn-save').addEventListener('click', () => {
    saveSettings({ token: $('s-token').value, repo: $('s-repo').value });
    setConn('', 'saved, test it');
  });
  $('btn-forget').addEventListener('click', () => {
    saveSettings({ token: '' });
    $('s-token').value = '';
    setConn('', 'not connected');
  });

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    const el = $(b.dataset.copy);
    el.select();
    navigator.clipboard.writeText(el.value).then(() => { b.textContent = 'Copied'; setTimeout(() => b.textContent = b.textContent.replace('Copied','Copy'), 1500); });
  });

  const s = settings();
  if (s.token) { $('s-token').value = s.token; setConn('', 'saved, test it'); }
  if (s.repo) $('s-repo').value = s.repo;

  loadDraft();
  document.querySelectorAll('#tab-new input, #tab-new textarea, #tab-new select').forEach(el =>
    el.addEventListener('input', saveDraft));

  if (matchMedia('(prefers-color-scheme: light)').matches) document.documentElement.dataset.theme = 'light';
}
document.addEventListener('DOMContentLoaded', init);
