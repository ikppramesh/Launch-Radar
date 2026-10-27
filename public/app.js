const $ = (s) => document.querySelector(s);
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STRIP_DAYS = 14;
const POLL_MS = 5 * 60e3;

const state = { range: 'today', date: null, status: 'Launched', category: '', brand: '', region: '', month: '', q: '', sort: 'time' };
let meta = null;
let tz = 'UTC';
const cache = new Map();
let current = [];
let expanded = new Set();

// ---- dates (all in the data's timezone, so "today" matches how files are bucketed)
function dayKey(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function shiftDay(key, n) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function prettyDay(key, opts = { weekday: 'long', month: 'long', day: 'numeric' }) {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
}
function prettyMonth(m) {
  return new Date(`${m}-15T12:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function today() { return dayKey(new Date()); }

function selectedDays() {
  const t = today();
  if (state.range === 'today') return [t];
  if (state.range === 'yesterday') return [shiftDay(t, -1)];
  if (state.range === 'week') return Array.from({ length: 7 }, (_, i) => shiftDay(t, -i));
  if (state.range === 'month') return meta.days.map((d) => d.date).filter((d) => d.startsWith(state.month)).sort().reverse();
  return [state.date];
}

// ---- url state
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  for (const k of Object.keys(state)) if (p.has(k)) state[k] = p.get(k);
  if (state.range === 'month' || state.month) state.range = /^\d{4}-\d{2}$/.test(state.month) ? 'month' : 'today';
  if (state.range !== 'month') state.month = '';
  if (state.range === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(state.date || '')) state.range = 'today';
}
function writeHash() {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) if (v && !(k === 'range' && v === 'today') && !(k === 'status' && v === 'Launched') && !(k === 'sort' && v === 'time') && !(k === 'date' && state.range !== 'date') && !(k === 'range' && v === 'month')) p.set(k, v);
  history.replaceState(null, '', p.toString() ? `#${p}` : location.pathname);
}

// ---- data
async function getJson(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}
async function loadDay(day, force = false) {
  if (!force && cache.has(day)) return cache.get(day);
  const known = meta?.days.some((d) => d.date === day);
  const items = known ? (await getJson(`data/${day}.json`).catch(() => ({ items: [] }))).items : [];
  cache.set(day, items);
  return items;
}
async function loadMeta() {
  meta = await getJson('data/index.json');
  tz = meta.timezone || 'UTC';
}

// ---- rendering
function renderHeader() {
  const when = new Date(meta.lastRefresh);
  const mins = Math.round((Date.now() - when) / 60e3);
  const ago = mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`;
  $('#refreshInfo').innerHTML = `<span class="dot"></span><span class="upd-word">Updated </span>${ago}<span class="src-count"> · ${meta.feedsOk}/${meta.feedsTotal} sources live</span>`;
  $('#refreshInfo').title = when.toLocaleString();
}

function renderStrip() {
  const t = today();
  const counts = Object.fromEntries(meta.days.map((d) => [d.date, d.count]));
  const days = Array.from({ length: STRIP_DAYS }, (_, i) => shiftDay(t, -(STRIP_DAYS - 1 - i)));
  const max = Math.max(1, ...days.map((d) => counts[d] || 0));
  const sel = new Set(selectedDays());
  $('#dayStrip').innerHTML = days.map((d) => {
    const c = counts[d] || 0;
    return `<button class="day ${sel.has(d) ? 'on' : ''}" data-day="${d}" role="listitem" aria-label="${prettyDay(d)}: ${c} items">
      <div class="dow">${d === t ? 'Today' : prettyDay(d, { weekday: 'short' })}</div>
      <div class="dnum">${+d.slice(8)}</div>
      <div class="bar"><i style="height:${Math.round((c / max) * 100)}%"></i></div>
      <div class="cnt">${c}</div></button>`;
  }).join('');
  const el = $('#dayStrip');
  requestAnimationFrame(() => { el.scrollLeft = el.scrollWidth; });

  document.querySelectorAll('[data-range]').forEach((b) => b.classList.toggle('on', b.dataset.range === state.range));
  const titles = { month: state.month && `${prettyMonth(state.month)} · whole month`, today: `Today · ${prettyDay(t)}`, yesterday: `Yesterday · ${prettyDay(shiftDay(t, -1))}`, week: 'Last 7 days' };
  $('#dayTitle').textContent = titles[state.range] || prettyDay(state.date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  $('#datePicker').value = state.range === 'month' ? '' : selectedDays()[0];
  $('#datePicker').max = t;
}

function fillMonths() {
  const counts = new Map();
  for (const d of meta.days) counts.set(d.date.slice(0, 7), (counts.get(d.date.slice(0, 7)) || 0) + d.count);
  const months = [...counts.keys()].sort().reverse();
  $('#month').innerHTML = '<option value="">Any month</option>' +
    months.map((m) => `<option value="${m}" ${m === state.month ? 'selected' : ''}>${prettyMonth(m)} (${counts.get(m)})</option>`).join('');
}

function baseFiltered() {
  const q = state.q.trim().toLowerCase();
  return current.filter((i) =>
    (state.status === 'all' || i.status === state.status) &&
    (!state.brand || i.brand === state.brand) &&
    (!state.region || i.region === state.region) &&
    (!q || `${i.title} ${i.brand} ${i.category} ${i.summary} ${i.region}`.toLowerCase().includes(q)));
}

function fillSelect(sel, values, label, chosen) {
  const opts = [...values.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  sel.innerHTML = `<option value="">${label}</option>` + opts.map(([v, n]) => `<option value="${esc(v)}" ${v === chosen ? 'selected' : ''}>${esc(v)} (${n})</option>`).join('');
}
const tally = (arr, key) => arr.reduce((m, i) => m.set(i[key], (m.get(i[key]) || 0) + 1), new Map());

function render() {
  const base = baseFiltered();
  const rows = base.filter((i) => !state.category || i.category === state.category);

  // Facets reflect the other filters, so counts are always truthful.
  const statusScoped = current.filter((i) => state.status === 'all' || i.status === state.status);
  fillSelect($('#brand'), tally(statusScoped.filter((i) => i.brand !== '—'), 'brand'), 'All brands', state.brand);
  fillSelect($('#region'), tally(statusScoped, 'region'), 'All regions', state.region);
  const cats = [...tally(base, 'category').entries()].sort((a, b) => b[1] - a[1]);
  $('#categoryChips').innerHTML = `<button data-cat="" class="${!state.category ? 'on' : ''}">All<span>${base.length}</span></button>` +
    cats.map(([c, n]) => `<button data-cat="${esc(c)}" class="${state.category === c ? 'on' : ''}">${esc(c)}<span>${n}</span></button>`).join('');

  document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.status === state.status));
  $('#search').value = state.q;
  $('#sort').value = state.sort;
  // On phones brand/region/sort sit behind the Filters button, so show how many are active.
  const active = [state.brand, state.region, state.month, state.sort !== 'time'].filter(Boolean).length;
  $('#moreCount').hidden = !active;
  $('#moreCount').textContent = active;

  renderStats(rows);
  renderRows(rows);
  writeHash();
}

function top(arr, key) {
  const [k, n] = [...tally(arr.filter((i) => i[key] !== '—'), key).entries()].sort((a, b) => b[1] - a[1])[0] || ['—', 0];
  return n ? `${k}` : '—';
}

function renderStats(rows) {
  const launched = current.filter((i) => i.status === 'Launched').length;
  const upcoming = current.length - launched;
  const buzz = [...rows].sort((a, b) => b.sources.length - a.sources.length)[0];
  const regions = new Set(rows.map((i) => i.region)).size;
  $('#stats').innerHTML = [
    ['Launched', launched],
    ['Upcoming / teased', upcoming],
    ['Top brand', top(rows, 'brand')],
    ['Top category', top(rows, 'category')],
    ['Markets', regions],
    ['Most buzz', buzz ? `${buzz.sources.length} outlets` : '—', buzz?.title],
  ].map(([k, v, t]) => `<div class="stat" ${t ? `title="${esc(t)}"` : ''}><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`).join('');
}

function sortRows(rows) {
  const r = [...rows];
  if (state.sort === 'coverage') r.sort((a, b) => b.sources.length - a.sources.length || b.publishedAt.localeCompare(a.publishedAt));
  else if (state.sort === 'brand') r.sort((a, b) => a.brand.localeCompare(b.brand) || b.publishedAt.localeCompare(a.publishedAt));
  else r.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return r;
}

function initials(s) { return esc((s === '—' ? '?' : s).slice(0, 2)); }

function renderRows(rows) {
  const sorted = sortRows(rows);
  const maxCov = Math.max(1, ...sorted.map((i) => i.sources.length));
  const multiDay = selectedDays().length > 1 && state.sort === 'time';
  let lastDay = null;
  const html = [];
  for (const i of sorted) {
    if (multiDay && i.date !== lastDay) {
      lastDay = i.date;
      html.push(`<tr class="day-sep"><td colspan="7">${prettyDay(i.date)}</td></tr>`);
    }
    const d = new Date(i.publishedAt);
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const img = i.image
      ? `<img class="thumb" src="${esc(i.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'thumb ph',textContent:'${initials(i.brand)}'}))">`
      : `<div class="thumb ph">${initials(i.brand)}</div>`;
    const open = expanded.has(i.id);
    html.push(`<tr class="row" data-id="${i.id}" aria-expanded="${open}">
      <td class="time"><b>${time}</b>${date}</td>
      <td class="g"><div class="gadget">${img}<div><span class="badge ${i.status}">${i.status}</span><span class="t">${esc(i.title)}</span>
        <div class="meta"><b>${esc(i.brand)}</b><span>${esc(i.category)}</span><span>${esc(i.region)}</span><span class="m-buzz">${i.sources.length} outlet${i.sources.length > 1 ? 's' : ''}</span></div></div></div></td>
      <td class="brand">${esc(i.brand)}</td>
      <td class="cat"><span class="pill">${esc(i.category)}</span></td>
      <td class="reg"><span class="pill">${esc(i.region)}</span></td>
      <td class="cov" title="${i.sources.length} outlet(s)">${i.sources.length}<span class="flame" style="width:${Math.max(12, Math.round((i.sources.length / maxCov) * 44))}px"></span></td>
      <td class="lnk"><a class="open" href="${esc(i.link)}" target="_blank" rel="noopener noreferrer">Open ↗</a></td>
    </tr>`);
    if (open) {
      html.push(`<tr class="detail"><td colspan="7"><div class="detail-box">
        ${i.summary ? `<p>${esc(i.summary)}${i.summary.length >= 280 ? '…' : ''}</p>` : ''}
        <div class="srcs">${i.sources.map((s) => `<a href="${esc(s.link)}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗</a>`).join('')}</div>
      </div></td></tr>`);
    }
  }
  $('#rows').innerHTML = html.join('');
  const empty = $('#empty');
  empty.hidden = sorted.length > 0;
  if (!sorted.length) {
    const other = state.status === 'Launched' ? current.filter((i) => i.status === 'Upcoming').length : 0;
    empty.innerHTML = current.length === 0
      ? 'No launches logged for this day yet. Today’s list fills up as outlets publish, so check back in a few hours.'
      : `Nothing matches these filters.${other ? ` There are ${other} upcoming launch${other > 1 ? 'es' : ''}. Switch to <b>Upcoming</b> to see them.` : ''}`;
  }
}

async function loadSelection(force = false) {
  const days = selectedDays();
  current = (await Promise.all(days.map((d) => loadDay(d, force)))).flat();
  fillMonths();
  renderStrip();
  render();
}

function renderHealth() {
  $('#health').innerHTML = meta.health.map((h) => `<div class="${h.ok ? '' : 'bad'}">${h.ok ? '●' : '○'} ${esc(h.name)} ${h.ok ? `· ${h.count}` : `· ${esc(h.error)}`}</div>`).join('');
}

function toast(msg, onClick) {
  document.querySelector('.toast')?.remove();
  const t = Object.assign(document.createElement('div'), { className: 'toast', innerHTML: msg });
  t.onclick = () => { onClick?.(); t.remove(); };
  document.body.append(t);
  setTimeout(() => t.remove(), 8000);
}

function toCsv(rows) {
  const cols = ['date', 'publishedAt', 'status', 'title', 'brand', 'category', 'region', 'link', 'outlets'];
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return [cols.join(','), ...rows.map((i) => [i.date, i.publishedAt, i.status, i.title, i.brand, i.category, i.region, i.link, i.sources.map((s) => s.name).join('; ')].map(q).join(','))].join('\n');
}

// ---- events
function bind() {
  document.querySelectorAll('[data-range]').forEach((b) => b.onclick = () => { state.range = b.dataset.range; state.month = ''; expanded.clear(); loadSelection(); });
  $('#dayStrip').onclick = (e) => {
    const b = e.target.closest('.day');
    if (!b) return;
    const d = b.dataset.day;
    const t = today();
    Object.assign(state, d === t ? { range: 'today' } : d === shiftDay(t, -1) ? { range: 'yesterday' } : { range: 'date', date: d });
    state.month = '';
    expanded.clear();
    loadSelection();
  };
  $('#datePicker').onchange = (e) => { if (e.target.value) { Object.assign(state, { range: 'date', date: e.target.value, month: '' }); loadSelection(); } };
  document.querySelectorAll('.seg button').forEach((b) => b.onclick = () => { state.status = b.dataset.status; state.category = ''; render(); });
  $('#categoryChips').onclick = (e) => { const b = e.target.closest('button'); if (b) { state.category = b.dataset.cat; render(); } };
  let t;
  $('#search').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; render(); }, 120); };
  $('#brand').onchange = (e) => { state.brand = e.target.value; render(); };
  $('#region').onchange = (e) => { state.region = e.target.value; render(); };
  $('#month').onchange = (e) => {
    Object.assign(state, e.target.value ? { range: 'month', month: e.target.value } : { range: 'today', month: '' });
    expanded.clear();
    loadSelection();
  };
  $('#sort').onchange = (e) => { state.sort = e.target.value; render(); };
  $('#rows').onclick = (e) => {
    if (e.target.closest('a')) return;
    const row = e.target.closest('tr.row');
    if (!row) return;
    const id = row.dataset.id;
    expanded.has(id) ? expanded.delete(id) : expanded.add(id);
    renderRows(baseFiltered().filter((i) => !state.category || i.category === state.category));
  };
  $('#exportBtn').onclick = () => {
    const rows = sortRows(baseFiltered().filter((i) => !state.category || i.category === state.category));
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv' })), download: `gadget-launches-${selectedDays().at(-1)}${selectedDays().length > 1 ? `_to_${selectedDays()[0]}` : ''}.csv` });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  $('#moreBtn').onclick = () => {
    const open = $('#moreFilters').classList.toggle('is-open');
    $('#moreBtn').setAttribute('aria-expanded', open);
  };
  const toTop = $('#toTop');
  addEventListener('scroll', () => { toTop.hidden = scrollY < 900; }, { passive: true });
  toTop.onclick = () => scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  $('#healthLink').onclick = (e) => { e.preventDefault(); renderHealth(); $('#health').hidden = !$('#health').hidden; };
  $('#refreshBtn').onclick = async () => {
    const b = $('#refreshBtn');
    b.disabled = true; b.querySelector('.lbl').textContent = 'Scanning…';
    try {
      const r = await (await fetch('api/refresh', { method: 'POST' })).json();
      await reloadAll();
      toast(r.added ? `${r.added} new item${r.added > 1 ? 's' : ''} found` : 'Up to date. Nothing new since the last scan.');
    } catch { toast('Refresh failed. Is the server running?'); }
    b.disabled = false; b.querySelector('.lbl').textContent = 'Refresh now';
  };
}

async function reloadAll() {
  await loadMeta();
  cache.clear();
  renderHeader();
  await loadSelection(true);
}

async function poll() {
  try {
    const prev = meta.lastRefresh;
    const next = await getJson('data/index.json');
    if (next.lastRefresh !== prev) {
      const added = next.added;
      await reloadAll();
      if (added) toast(`${added} new gadget launch${added > 1 ? 'es' : ''} just came in`);
    } else renderHeader();
  } catch { /* offline: try again next tick */ }
}

async function init() {
  readHash();
  bind();
  try {
    await loadMeta();
  } catch {
    $('#refreshInfo').textContent = 'No data yet';
    $('#empty').hidden = false;
    $('#empty').textContent = 'No data has been collected yet. Run “npm run fetch” or start the server with “npm start”.';
    return;
  }
  renderHeader();
  await loadSelection();
  // The refresh button only makes sense when served by server.js (not static hosting).
  fetch('api/health').then((r) => r.ok && r.json()).then((j) => { if (j?.ok) $('#refreshBtn').hidden = false; }).catch(() => {});
  setInterval(poll, POLL_MS);
  // Roll "today" over at midnight without a reload.
  let day = today();
  setInterval(() => { if (today() !== day) { day = today(); cache.clear(); loadSelection(); } }, 60e3);
}

init();
