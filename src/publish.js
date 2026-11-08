import { writeFile } from 'node:fs/promises';
import path from 'node:path';

// Public origin used for absolute links in the feed and the email page.
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

export async function writeFeeds(dataDir, items, now, tz) {
  const sorted = [...items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const out = path.join(dataDir, '..');
  await writeFile(path.join(out, 'feed.xml'), buildAtom(sorted, now));
  await writeFile(path.join(out, 'week.html'), buildWeekPage(sorted, now, tz));
}
