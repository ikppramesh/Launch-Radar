import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allFeeds } from './sources.js';
import { parseFeed } from './parse.js';
import { classify } from './classify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'public', 'data');
export const TIMEZONE = process.env.TZ_DISPLAY || Intl.DateTimeFormat().resolvedOptions().timeZone;

const MAX_AGE_DAYS = 14;
const UA = 'Mozilla/5.0 (compatible; LatestGadgetsBot/1.0; +https://github.com/)';

const STOP = new Set('the a an and or of for with to in on at by from its it is are new now this that as be has have officially official launch launches launched unveils unveiled announces announced debuts arrives available goes sale price pricing specs specifications features india global globally'.split(' '));

export function dayKey(date, tz = TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function tokens(title) {
  return new Set(title.toLowerCase().replace(/[^a-z0-9+ ]/g, ' ').split(/\s+/).filter((t) => t && !STOP.has(t)));
}

// Model identifiers like "f70", "k100", "neo12" — alphanumeric, but not spec units ("5000mah", "120hz", "5g").
const UNIT = /^\d+(\.\d+)?(mah|hz|mp|gb|tb|w|k|g|nm|mm|x|th|st|nd|rd|in|inch|p|fps|v|kg|m|cm|h|hrs?|nits?)$/;
function modelTokens(tok) {
  return [...tok].filter((t) => /[a-z]/.test(t) && /\d/.test(t) && !UNIT.test(t));
}

function sameProduct(a, b) {
  if (a.status !== b.status) return false; // a teaser and the actual launch are separate events
  if (similar(a._tok, b._tok)) return true;
  if (a.brand === '—' || a.brand !== b.brand) return false;
  const bm = new Set(modelTokens(b._tok));
  return modelTokens(a._tok).some((t) => bm.has(t));
}

function similar(a, b) {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 && (inter / union >= 0.5 || (inter >= 4 && inter / Math.min(a.size, b.size) >= 0.8));
}

async function fetchFeed(feed) {
  const res = await fetch(feed.url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeed(await res.text());
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = { ok: true, value: await fn(items[idx]) }; } catch (e) { out[idx] = { ok: false, error: e.message }; }
    }
  }));
  return out;
}

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

function toRecord(raw, feed, now) {
  const published = new Date(raw.published);
  if (Number.isNaN(published.getTime())) return null;
  if (published > new Date(now.getTime() + 6 * 3600e3)) return null; // future-dated / scheduled posts
  if (now - published > MAX_AGE_DAYS * 86400e3) return null;

  let title = raw.title;
  let sourceName = feed.name;
  if (feed.aggregator) {
    sourceName = raw.source || title.split(' - ').pop() || feed.name;
    title = title.replace(new RegExp(`\\s+-\\s+${sourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '');
  }
  const tags = classify({ ...raw, title }, { requireCategory: !!feed.aggregator });
  if (!tags) return null;

  return {
    id: createHash('sha1').update(title.toLowerCase()).digest('hex').slice(0, 12),
    title,
    summary: raw.summary.slice(0, 280),
    link: raw.link,
    image: raw.image || '',
    publishedAt: published.toISOString(),
    date: dayKey(published),
    ...tags,
    // A Google News edition says where coverage surfaced, not where the product launched.
    region: tags.region || (feed.aggregator ? 'Global' : feed.region),
    aggregator: !!feed.aggregator,
    sources: [{ name: sourceName, link: raw.link }],
    firstSeen: now.toISOString(),
  };
}

function merge(existing, incoming) {
  for (const s of incoming.sources) {
    if (!existing.sources.some((x) => x.name === s.name)) existing.sources.push(s);
  }
  // Prefer a direct publisher link over a Google News redirect, and the earliest timestamp.
  if (existing.aggregator && !incoming.aggregator) {
    Object.assign(existing, { title: incoming.title, link: incoming.link, summary: incoming.summary || existing.summary, aggregator: false });
  }
  if (!existing.image && incoming.image) existing.image = incoming.image;
  if (incoming.publishedAt < existing.publishedAt) {
    existing.publishedAt = incoming.publishedAt;
    existing.date = incoming.date;
  }
  if (existing.region === 'Global' && incoming.region !== 'Global') existing.region = incoming.region;
  existing.confidence = Math.max(existing.confidence, incoming.confidence);
}

export async function refresh({ log = console.log } = {}) {
  const started = Date.now();
  const now = new Date();
  const feeds = allFeeds();
  await mkdir(DATA_DIR, { recursive: true });

  const results = await pool(feeds, 8, fetchFeed);
  const health = feeds.map((f, i) => ({ name: f.name, ok: results[i].ok, count: results[i].ok ? results[i].value.length : 0, error: results[i].error }));

  // Load every day still inside the window so cross-day duplicates merge too.
  const files = (await readdir(DATA_DIR)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  const pool_ = [];
  for (const f of files) {
    if (now - new Date(f.slice(0, 10)) > (MAX_AGE_DAYS + 2) * 86400e3) continue;
    pool_.push(...(await readJson(path.join(DATA_DIR, f), { items: [] })).items);
  }
  for (const it of pool_) it._tok = tokens(it.title);

  let added = 0;
  results.forEach((r, i) => {
    if (!r.ok) return;
    for (const raw of r.value) {
      const rec = toRecord(raw, feeds[i], now);
      if (!rec) continue;
      rec._tok = tokens(rec.title);
      const dup = pool_.find((x) => x.id === rec.id || x.link === rec.link || sameProduct(x, rec));
      if (dup) merge(dup, rec);
      else { pool_.push(rec); added++; }
    }
  });

  const byDay = {};
  for (const it of pool_) {
    delete it._tok;
    (byDay[it.date] ||= []).push(it);
  }
  for (const [day, items] of Object.entries(byDay)) {
    items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    await writeFile(path.join(DATA_DIR, `${day}.json`), JSON.stringify({ date: day, items }, null, 1));
  }

  // Rebuild the index from disk so days older than the merge window are kept.
  const allFiles = (await readdir(DATA_DIR)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
  const days = [];
  for (const f of allFiles) {
    const d = await readJson(path.join(DATA_DIR, f), { items: [] });
    days.push({ date: f.slice(0, 10), count: d.items.length });
  }
  const meta = {
    lastRefresh: now.toISOString(),
    timezone: TIMEZONE,
    tookMs: Date.now() - started,
    feedsOk: health.filter((h) => h.ok).length,
    feedsTotal: feeds.length,
    added,
    days,
    health,
  };
  await writeFile(path.join(DATA_DIR, 'index.json'), JSON.stringify(meta, null, 1));
  log(`[refresh] ${meta.feedsOk}/${meta.feedsTotal} feeds ok, ${added} new launches, ${days.length} days on file (${meta.tookMs} ms)`);
  return meta;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  refresh().catch((e) => { console.error(e); process.exit(1); });
}
