// Minimal dependency-free RSS 2.0 / Atom parser. Feeds are messy, so this is
// deliberately forgiving: regex extraction, CDATA unwrapping, entity decoding.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function decodeEntities(s = '') {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

function unwrapCdata(s = '') {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function tag(block, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i');
  const m = block.match(re);
  return m ? unwrapCdata(m[1]).trim() : '';
}

function attr(block, tagName, attrName, filter) {
  const re = new RegExp(`<${tagName}\\s[^>]*>`, 'gi');
  for (const m of block.match(re) || []) {
    if (filter && !filter(m)) continue;
    const a = m.match(new RegExp(`${attrName}\\s*=\\s*["']([^"']+)["']`, 'i'));
    if (a) return decodeEntities(a[1]);
  }
  return '';
}

export function stripHtml(s = '') {
  return decodeEntities(unwrapCdata(decodeEntities(s)).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function findImage(block, html) {
  return (
    attr(block, 'media:content', 'url', (t) => !/medium=["']video/i.test(t)) ||
    attr(block, 'media:thumbnail', 'url') ||
    attr(block, 'enclosure', 'url', (t) => /image/i.test(t)) ||
    (decodeEntities(html).match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] ||
    ''
  );
}

export function parseFeed(xml) {
  const items = [];
  const rssItems = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const b of rssItems) {
    const rawDesc = tag(b, 'description') || tag(b, 'content:encoded');
    items.push({
      title: stripHtml(tag(b, 'title')),
      link: decodeEntities(tag(b, 'link')) || attr(b, 'link', 'href'),
      published: tag(b, 'pubDate') || tag(b, 'dc:date') || tag(b, 'published'),
      summary: stripHtml(rawDesc),
      image: findImage(b, tag(b, 'content:encoded') || rawDesc),
      source: stripHtml(tag(b, 'source')),
      categories: (b.match(/<category[^>]*>([\s\S]*?)<\/category>/gi) || []).map((c) => stripHtml(c)),
    });
  }
  const atomEntries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of atomEntries) {
    const rawDesc = tag(b, 'summary') || tag(b, 'content');
    items.push({
      title: stripHtml(tag(b, 'title')),
      link: attr(b, 'link', 'href', (t) => !/rel=["'](?!alternate)/i.test(t)),
      published: tag(b, 'published') || tag(b, 'updated'),
      summary: stripHtml(rawDesc),
      image: findImage(b, tag(b, 'content') || rawDesc),
      source: '',
      categories: [...b.matchAll(/<category[^>]*term=["']([^"']+)["']/gi)].map((m) => decodeEntities(m[1])),
    });
  }
  return items.filter((i) => i.title && i.link);
}
