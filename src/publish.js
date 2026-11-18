import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderShareCard } from './og.js';

// Public origin used for absolute links in the feed, the email page and the day pages.
const SITE_URL = (process.env.SITE_URL || 'https://gadgets-ir.vercel.app').replace(/\/+$/, '');
const FEED_ITEMS = 50;
const WEEK_DAYS = 7;

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : SITE_URL);

function describe(it) {
  const bits = [it.status, it.category, it.brand !== '—' ? it.brand : '', it.region].filter(Boolean);
  return { meta: bits.join(' · '), outlets: it.sources.map((s) => s.name).join(', ') };
}

export function buildAtom(items, now) {
  const entries = items.slice(0, FEED_ITEMS).map((it) => {
    const { meta, outlets } = describe(it);
    const body = `<p>${esc(it.summary)}</p><p>${esc(meta)}<br>Covered by: ${esc(outlets)}</p>`;
    return `  <entry>
    <id>tag:launch-radar,${it.date}:${it.id}</id>
    <title>${esc(it.title)}</title>
    <link href="${esc(safeUrl(it.link))}"/>
    <published>${it.publishedAt}</published>
    <updated>${it.publishedAt}</updated>
    <category term="${esc(it.category)}"/>
    <summary type="html">${esc(body)}</summary>
  </entry>`;
  });
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${SITE_URL}/feed.xml</id>
  <title>Launch Radar</title>
  <subtitle>Gadgets launched worldwide, with links to the coverage.</subtitle>
  <link rel="self" type="application/atom+xml" href="${SITE_URL}/feed.xml"/>
  <link rel="alternate" type="text/html" href="${SITE_URL}/"/>
  <updated>${items[0]?.publishedAt || now.toISOString()}</updated>
${entries.join('\n')}
</feed>
`;
}

// Table layout with inline styles only: survives email clients and the site's strict CSP.
export function buildWeekPage(items, now, tz) {
  const cutoff = new Date(now.getTime() - WEEK_DAYS * 86400e3).toISOString();
  const recent = items.filter((it) => it.publishedAt >= cutoff);
  // Most-covered launches first, newest breaking ties.
  const launched = recent
    .filter((it) => it.status === 'Launched')
    .sort((a, b) => b.sources.length - a.sources.length || b.publishedAt.localeCompare(a.publishedAt));
  const upcoming = recent.filter((it) => it.status === 'Upcoming').slice(0, 10);
  const font = 'font-family:Helvetica,Arial,sans-serif;';
  const row = (it) => {
    const { meta, outlets } = describe(it);
    return `<tr><td style="padding:14px 0;border-bottom:1px solid #e5e2da;${font}">
<a href="${esc(safeUrl(it.link))}" style="color:#17171c;font-size:16px;font-weight:700;text-decoration:none;">${esc(it.title)}</a>
<div style="color:#6b6b73;font-size:13px;margin-top:4px;">${esc(meta)} · ${esc(it.date)}</div>
<div style="color:#6b6b73;font-size:13px;margin-top:2px;">${esc(outlets)}</div></td></tr>`;
  };
  const section = (title, list) => (list.length
    ? `<tr><td style="padding:22px 0 4px;${font}font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#ff5a1f;">${title} (${list.length})</td></tr>\n${list.map(row).join('\n')}`
    : '');
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' });
  const label = `${fmt.format(new Date(cutoff))} – ${fmt.format(now)}`;
  const empty = `<tr><td style="padding:20px 0;${font}color:#6b6b73;">No launches logged yet this week.</td></tr>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>This week's launches · Launch Radar</title>
<meta name="description" content="Gadgets launched in the last 7 days, in an email-friendly layout.">
<link rel="alternate" type="application/atom+xml" title="Launch Radar" href="feed.xml">
</head>
<body style="margin:0;padding:0;background:#f6f4ef;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4ef;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;padding:24px;">
<tr><td style="${font}font-size:24px;font-weight:700;color:#17171c;">This week's launches</td></tr>
<tr><td style="${font}font-size:14px;color:#6b6b73;padding-top:4px;">${esc(label)} · ${launched.length} launched</td></tr>
${section('Launched', launched) || empty}
${section('Upcoming', upcoming)}
<tr><td style="padding-top:24px;${font}font-size:12px;color:#6b6b73;">Via <a href="${SITE_URL}/" style="color:#ff5a1f;">Launch Radar</a> · <a href="${SITE_URL}/feed.xml" style="color:#ff5a1f;">Atom feed</a></td></tr>
</table></td></tr></table>
</body>
</html>
`;
}

const dayLabel = (day) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${day}T00:00:00Z`));
const newsArticle = (it) => ({
  '@type': 'NewsArticle',
  headline: it.title,
  url: safeUrl(it.link),
  datePublished: it.publishedAt,
  description: it.summary,
  publisher: { '@type': 'Organization', name: it.sources[0]?.name || 'Launch Radar' },
  about: { '@type': 'Product', ...(it.brand !== '—' ? { brand: { '@type': 'Brand', name: it.brand } } : {}), category: it.category },
});
// Escaping "<" keeps a headline from closing the script tag early.
const jsonLd = (obj) => JSON.stringify(obj, null, 1).replace(/</g, '\\u003c');

// Static, crawlable page for one day: a list of its launches, schema.org markup and a share image.
export function buildDayPage(day, items) {
  const url = `${SITE_URL}/day/${day}.html`;
  const label = dayLabel(day);
  const launched = items.filter((it) => it.status === 'Launched').length;
  const upcoming = items.length - launched;
  const counts = [`${launched} launched`, upcoming ? `${upcoming} upcoming` : ''].filter(Boolean).join(', ');
  const title = `Gadget launches on ${label} · Launch Radar`;
  const description = `Gadgets logged on ${label}: ${counts}. Links to the original coverage.`;
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': url,
        url,
        name: title,
        description,
        isPartOf: { '@type': 'WebSite', name: 'Launch Radar', url: `${SITE_URL}/` },
      },
      {
        '@type': 'ItemList',
        numberOfItems: items.length,
        itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, item: newsArticle(it) })),
      },
    ],
  };
  const list = items.map((it) => {
    const { meta, outlets } = describe(it);
    return `      <li>
        <span class="badge ${esc(it.status)}">${esc(it.status)}</span>
        <a href="${esc(safeUrl(it.link))}">${esc(it.title)}</a>
        <div class="muted">${esc(meta)} · ${esc(outlets)}</div>
      </li>`;
  });
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${esc(url)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Launch Radar">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:image" content="${SITE_URL}/og/${day}.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="alternate" type="application/atom+xml" title="Launch Radar" href="../feed.xml">
  <link rel="stylesheet" href="../styles.css">
  <script type="application/ld+json">
${jsonLd(graph)}
  </script>
</head>
<body>
  <header class="top">
    <div class="wrap top-inner">
      <div class="logo">
        <span class="radar" aria-hidden="true"><span></span></span>
        <div>
          <h1>Launch Radar</h1>
          <p class="tag">${esc(label)}</p>
        </div>
      </div>
    </div>
  </header>
  <main class="wrap">
    <section class="days">
      <div class="days-head">
        <h2>${esc(label)}</h2>
      </div>
      <p class="muted">${esc(counts)}.</p>
      <img class="share-card" src="../og/${day}.png" width="1200" height="630" alt="Radar showing ${items.length} gadget ${items.length === 1 ? 'launch' : 'launches'} on ${esc(label)}">
      <ol class="day-list">
${list.join('\n')}
      </ol>
    </section>
    <footer class="foot">
      <p><a href="../#range=date&amp;date=${day}">Open ${esc(label)} in Launch Radar</a> · <a href="../feed.xml">Atom feed</a> · <a href="../week.html">This week's launches</a></p>
    </footer>
  </main>
</body>
</html>
`;
}

// One page and one share image per day that has launches.
export async function writeDayPages(root, items) {
  await mkdir(path.join(root, 'day'), { recursive: true });
  await mkdir(path.join(root, 'og'), { recursive: true });
  for (const day of [...new Set(items.map((it) => it.date))]) {
    const dayItems = items.filter((it) => it.date === day);
    await writeFile(path.join(root, 'day', `${day}.html`), buildDayPage(day, dayItems));
    await writeFile(path.join(root, 'og', `${day}.png`), renderShareCard(dayItems));
  }
}

export async function writeFeeds(dataDir, items, now, tz) {
  const sorted = [...items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const out = path.join(dataDir, '..');
  await writeFile(path.join(out, 'feed.xml'), buildAtom(sorted, now));
  await writeFile(path.join(out, 'week.html'), buildWeekPage(sorted, now, tz));
  await writeDayPages(out, sorted);
}
