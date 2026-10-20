// Feeds scanned on every refresh. `region` is the market a source mostly covers;
// the classifier can override it when a headline names a specific country.

export const FEEDS = [
  // Global tech / gadget press
  { name: 'GSMArena', url: 'https://www.gsmarena.com/rss-news-reviews.php3', region: 'Global' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/gadgets/index.xml', region: 'Global' },
  { name: 'Engadget', url: 'https://www.engadget.com/rss.xml', region: 'Global' },
  { name: 'Gizmodo', url: 'https://gizmodo.com/feed', region: 'Global' },
  { name: 'Android Authority', url: 'https://www.androidauthority.com/feed/', region: 'Global' },
  { name: 'Android Police', url: 'https://www.androidpolice.com/feed/', region: 'Global' },
  { name: 'Android Headlines', url: 'https://www.androidheadlines.com/feed', region: 'Global' },
  { name: '9to5Mac', url: 'https://9to5mac.com/feed/', region: 'Global' },
  { name: '9to5Google', url: 'https://9to5google.com/feed/', region: 'Global' },
  { name: 'MacRumors', url: 'https://feeds.macrumors.com/MacRumors-All', region: 'Global' },
  { name: 'XDA', url: 'https://www.xda-developers.com/feed/', region: 'Global' },
  { name: 'TechRadar', url: 'https://www.techradar.com/rss', region: 'Global' },
  { name: "Tom's Guide", url: 'https://www.tomsguide.com/feeds/all', region: 'Global' },
  { name: 'Pocket-lint', url: 'https://www.pocket-lint.com/feed/', region: 'Global' },
  { name: 'Notebookcheck', url: 'https://www.notebookcheck.net/RSS-Feed-Notebook-Reviews.8156.0.html', region: 'Global' },
  { name: 'New Atlas', url: 'https://newatlas.com/index.rss', region: 'Global' },
  { name: 'Yanko Design', url: 'https://www.yankodesign.com/feed/', region: 'Global' },
  { name: 'CNX Software', url: 'https://www.cnx-software.com/feed/', region: 'Global' },
  { name: 'SamMobile', url: 'https://www.sammobile.com/feed/', region: 'Global' },
  // Regional specialists
  { name: 'Gizmochina', url: 'https://www.gizmochina.com/feed/', region: 'China' },
  { name: 'Huawei Central', url: 'https://www.huaweicentral.com/feed/', region: 'China' },
  { name: 'Gadgets 360', url: 'https://feeds.feedburner.com/gadgets360-latest', region: 'India' },
  { name: 'FoneArena', url: 'https://www.fonearena.com/blog/feed', region: 'India' },
  { name: 'GadgetMatch', url: 'https://www.gadgetmatch.com/feed/', region: 'Southeast Asia' },
];

// Google News search across several country editions catches launches the
// specialist feeds miss (regional brands, local-market launches).
const GN_EDITIONS = [
  { gl: 'US', hl: 'en-US', region: 'USA' },
  { gl: 'IN', hl: 'en-IN', region: 'India' },
  { gl: 'GB', hl: 'en-GB', region: 'UK' },
  { gl: 'SG', hl: 'en-SG', region: 'Southeast Asia' },
  { gl: 'AU', hl: 'en-AU', region: 'Australia' },
  { gl: 'CA', hl: 'en-CA', region: 'Canada' },
];

const GN_QUERIES = [
  'launches smartphone',
  'launches laptop OR tablet',
  'launches smartwatch OR earbuds OR headphones',
  'unveils gadget OR device',
  'launched price specifications',
];

export function googleNewsFeeds() {
  const feeds = [];
  for (const ed of GN_EDITIONS) {
    for (const q of GN_QUERIES) {
      const query = encodeURIComponent(`${q} when:2d`);
      feeds.push({
        name: `Google News ${ed.gl}`,
        url: `https://news.google.com/rss/search?q=${query}&hl=${ed.hl}&gl=${ed.gl}&ceid=${ed.gl}:en`,
        region: ed.region,
        aggregator: true,
      });
    }
  }
  return feeds;
}

export function allFeeds() {
  return [...FEEDS, ...googleNewsFeeds()];
}
