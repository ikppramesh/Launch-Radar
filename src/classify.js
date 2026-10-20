// Decides whether a headline is a *launch* of a physical gadget, and tags it
// with status, brand, category and market. Rules are keyword-based and tuned
// for precision: rumours, leaks, deals, reviews and software news are dropped.

const LAUNCH = /\b(launch(es|ed|ing)?|unveil(s|ed|ing)?|announc(es|ed|ing)|debut(s|ed)?|introduc(es|ed|ing)|goes official|is official|now official|made official|officially (revealed|announced)|goes on sale|on sale now|now available|available now|arrives?|arrived|lands? in|released?|rolls? out|breaks cover|pre-?orders? (open|now|begin))\b/i;

// Announced-but-not-yet-launched: kept, but tagged "Upcoming".
const UPCOMING = /\b(to (launch|unveil|announce|debut|arrive|release)|will (launch|unveil|debut|arrive)|set to|gearing up|ahead of (its |the )?launch|before (its |the )?launch|launch date|launch timeline|coming soon|what's coming|what to expect|expected|confirmed for|teases?d?|teaser|countdown|event|listed|ahead of|before (its |the |official )?launch|launch set|set for|is launching|launching (next|this|on|soon|in)|next week|this week|next month|soon|upcoming|tomorrow|what we know|everything we know|will be|launch(es)? on (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*)\b/i;

const NEGATIVE = /\b(rumou?rs?|rumou?red|leak(s|ed)?|tipped|spotted|could|might|reportedly|allegedly|renders?|deal|deals|discount|% off|save \$|price cut|cheapest|lowest price|black friday|prime day|coupon|review|reviewed|hands-on|vs\.?|versus|how to|tips|best .* (to buy|of 20\d\d)|ranked|podcast|weekly|roundup|recap|week in|wallpapers?|beta|release candidates?|seeds|firmware|software update|security update|patch|i(pad)?os \d+|macos|watchos|tvos|visionos|android \d+ update|one ui|hyperos \d|app|apps|software|features? for|gemini|messages|ai model|llm|chatbot|game|games|season \d|trailer|stock|shares|earnings|revenue|lawsuit|tariff|layoffs?|ceo|enterprise|startup|funding|satellite|rocket|missile|vaccine|drug|policy|schemes?|portal|campaign|initiative|programme|anticipated|buyers|years since|anniversary)\b|\bbest\b(?! buy)|\?$/i;

// Each category lists device nouns and product-line names. The pattern that
// matches *earliest* in the headline wins, because the subject comes first:
// "Vivo Y15 with triple rear camera" is a phone, "Redmi Band 4" is a wearable.
const CATEGORIES = [
  ['Smartphone', /\b(smartphones?|phones?|mobiles?|\d+ 5g|iphone( \d+| air| pro)?|galaxy [szamf]\d+|galaxy (z )?(fold|flip)|pixel \d+a?|foldable|redmi (note |k)?\d+|poco [xfmc]\d+|iqoo (z|neo)?\d+|realme (gt |narzo |p|c)?\d+|oneplus (ace |nord )?\d+|nord( ce)? ?\d|moto [gex]\d+|razr|xperia|reno ?\d+|find [nx]\d+|oppo [akf]\d+|vivo [vxyst]\d+|honor (x|magic ?)\d+|nova \d+|mate ?\d+|pura \d+|rog phone|red ?magic \d+|nothing phone|cmf phone|tecno (spark|camon|pova|phantom)|infinix (hot|note|zero|smart|gt)|xiaomi \d+t?|galaxy m\d+|nokia [cgx]\d+|lava \w+ \d+|fairphone)\b/i],
  ['Tablet', /\b(tablets?|ipad( pro| air| mini)?|galaxy tab|matepad|xiaomi pad|redmi pad|oneplus pad|lenovo tab|honor pad|pad ?\d+( pro)?)\b/i],
  ['Laptop', /\b(laptops?|notebooks?|macbook( pro| air)?|chromebooks?|ultrabook|thinkpad|zenbook|vivobook|xps|spectre|envy|omen|legion|yoga|swift|predator|zephyrus|surface (laptop|pro)|matebook|galaxy book)\b/i],
  ['PC & Components', /\b(desktop|mini ?pc|imac|mac mini|mac studio|mac pro|gpus?|graphics cards?|geforce|radeon|rtx ?\d+|cpus?|processors?|ryzen|core ultra|snapdragon|dimensity|exynos|tensor g\d|chipsets?|motherboards?|ssds?|monitors?)\b/i],
  ['Wearable', /\b(smartwatch(es)?|watch( \d+| ultra| gt| fit)?|smart ?band|band \d+|fitness (band|tracker)|smart rings?|ring|wearables?|smart glasses|ar glasses|glasses|vr headset|xr headset|quest \d|vision pro)\b/i],
  ['Audio', /\b(earbuds|earphones|headphones|tws|buds( \d| pro| on)?|airpods|speakers?|soundbars?|amplifier|turntable)\b/i],
  ['Camera & Drone', /\b(cameras?|mirrorless|dslr|lens|gopro|insta360|action cam|drones?|gimbal|osmo|dji)\b/i],
  ['Gaming', /\b(consoles?|gaming handheld|handhelds?|playstation|ps5|xbox|nintendo|switch \d|steam deck|controllers?|gaming (mouse|keyboard|headset|chair|monitor))\b/i],
  ['TV & Entertainment', /\b(tvs?|television|oled|qled|mini[- ]led|projectors?|streaming (stick|device)|fire tv|chromecast|apple tv)\b/i],
  ['Smart Home', /\b(smart home|smart display|echo( show| dot)?|nest|homepod|homeview|doorbells?|security cameras?|thermostats?|robot vacuums?|vacuums?|air purifiers?|smart locks?|routers?|mesh wi-?fi|smart plugs?|bulbs?|fans?|cushion|kettle|refrigerators?|washing machines?|air conditioners?)\b/i],
  ['Accessories', /\b(chargers?|power ?banks?|keyboards?|mouse|stylus|pencil|cases?|docks?|hubs?|e-?readers?|kindle|kobo|boox|item trackers?|airtags?|magsafe)\b/i],
  ['Mobility & EV', /\b(e-?bikes?|electric (bike|scooter|car|vehicle|motorcycle)s?|scooters?|evs?)\b/i],
];

const BRANDS = [
  'Apple', 'Samsung', 'Google', 'Xiaomi', 'Redmi', 'Poco', 'POCO', 'OnePlus', 'Oppo', 'OPPO', 'Vivo', 'vivo', 'iQOO', 'Realme', 'realme', 'Honor', 'HONOR', 'Huawei', 'HUAWEI',
  'Motorola', 'Nothing', 'CMF', 'Sony', 'Asus', 'ASUS', 'Lenovo', 'Dell', 'Alienware', 'HP', 'Acer', 'MSI', 'Razer', 'Microsoft',
  'Garmin', 'Fitbit', 'Amazfit', 'Withings', 'Oura', 'Anker', 'Eufy', 'Soundcore', 'Baseus', 'Ugreen', 'UGREEN', 'DJI', 'GoPro', 'Insta360',
  'Bose', 'JBL', 'Sennheiser', 'Sonos', 'Marshall', 'Shokz', 'Beats', 'LG', 'TCL', 'Hisense', 'Philips', 'Panasonic', 'Sharp', 'BenQ',
  'Nintendo', 'Xbox', 'PlayStation', 'Valve', 'Ayaneo', 'AYANEO', 'Anbernic', 'Meta', 'Amazon', 'Logitech', 'Corsair', 'SteelSeries',
  'Nvidia', 'NVIDIA', 'AMD', 'Intel', 'Qualcomm', 'MediaTek', 'Tecno', 'TECNO', 'Infinix', 'Itel', 'itel', 'Nubia', 'RedMagic', 'ZTE', 'Meizu', 'Fairphone',
  'HMD', 'Nokia', 'Lava', 'boAt', 'Noise', 'Fire-Boltt', 'Nikon', 'Canon', 'Fujifilm', 'Leica', 'Hasselblad',
  'OM System', 'Ricoh', 'Roborock', 'Dreame', 'Ecovacs', 'iRobot', 'Dyson', 'Ring', 'Arlo', 'Framework', 'Beelink', 'Minisforum',
  'Kobo', 'Boox', 'reMarkable', 'Xreal', 'XREAL', 'Rokid', 'Viture', 'Pico', 'HTC', 'Teenage Engineering', 'Rabbit', 'Tesla',
  'Belkin', 'Netgear', 'TP-Link', 'Polar', 'Suunto', 'Coros', 'COROS', 'Whoop', 'WHOOP', 'Blackview', 'Ulefone', 'Doogee', 'Oukitel',
  'Kyocera', 'Gigabyte', 'Zotac', 'Western Digital', 'Seagate', 'Crucial', 'Skullcandy', 'Audio-Technica', 'Edifier', 'Jabra',
  'Mijia', 'Lenovo Legion', 'Elephone', 'Cubot', 'Sunmi', 'Hasbro', 'Peloton', 'Segway', 'Ninebot', 'Ather', 'Ola',
];

// Case-sensitive on purpose: "Nothing", "Ring", "Meta" are brands only when capitalised.
const BRAND_RE = BRANDS.map((b) => [b, new RegExp(`(^|[^A-Za-z])${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z])`)]);
const CANONICAL = { POCO: 'Poco', OPPO: 'Oppo', vivo: 'Vivo', realme: 'Realme', HONOR: 'Honor', HUAWEI: 'Huawei', ASUS: 'Asus', UGREEN: 'Ugreen', AYANEO: 'Ayaneo', NVIDIA: 'Nvidia', TECNO: 'Tecno', itel: 'Itel', XREAL: 'Xreal', COROS: 'Coros', WHOOP: 'Whoop', Mijia: 'Xiaomi', 'Lenovo Legion': 'Lenovo' };

// Product lines that imply a brand when the brand itself isn't named.
const BRAND_HINTS = [
  ['Apple', /\b(iphone|ipad|macbook|imac|mac mini|airpods|homepod|apple watch|vision pro)\b/i],
  ['Google', /\b(pixel|googlebook|chromecast|nest)\b/i],
  ['Samsung', /\bgalaxy\b/i],
  ['Microsoft', /\b(surface|xbox)\b/i],
  ['Sony', /\b(playstation|ps5|xperia)\b/i],
  ['Amazon', /\b(kindle|echo|fire tv)\b/i],
  ['Meta', /\bquest \d/i],
  ['Nintendo', /\bswitch \d/i],
];

const REGIONS = [
  ['India', /\b(india|indian|inr|flipkart)\b|₹|\bRs\.? ?\d/i],
  ['China', /\b(china|chinese|cny|yuan)\b|¥/i],
  ['USA', /\b(US|U\.S\.|USA|United States|America|Best Buy)\b/],
  ['UK', /\b(UK|U\.K\.|Britain)\b|£/],
  ['Europe', /\b(EU|Europe|European|Germany|France|Spain|Italy)\b|€/],
  ['Japan', /\b(japan|japanese)\b/i],
  ['South Korea', /\b(korea|korean)\b/i],
  ['Southeast Asia', /\b(malaysia|indonesia|philippines|thailand|vietnam|singapore)\b/i],
  ['Middle East', /\b(uae|saudi|middle east|dubai)\b/i],
  ['Africa', /\b(nigeria|kenya|south africa|africa)\b/i],
  ['Global', /\b(global(ly)?|worldwide|international(ly)?)\b/i],
];

function earliest(text, list) {
  let best = null;
  let bestPos = Infinity;
  for (const [name, re] of list) {
    const m = re.exec(text);
    if (m && m.index < bestPos) { best = name; bestPos = m.index; }
  }
  return best;
}

export function classify(item, { requireCategory = false } = {}) {
  const title = item.title;
  if (!LAUNCH.test(title) || NEGATIVE.test(title)) return null;

  const category = earliest(title, CATEGORIES);
  const brandRaw = earliest(title, BRAND_RE) || earliest(title, BRAND_HINTS);
  // Must look like hardware. Generic sources (Google News) also need a device type,
  // since a brand alone ("Amazon unveils …") is too often software or business news.
  if (!category && (!brandRaw || requireCategory)) return null;

  const status = UPCOMING.test(title) ? 'Upcoming' : 'Launched';
  const region = earliest(title, REGIONS);

  let confidence = 1;
  if (/\b(launch(es|ed)|unveil(s|ed)|goes official|is official|now available|goes on sale|debuts?)\b/i.test(title)) confidence++;
  if (category && brandRaw) confidence++;

  return {
    status,
    category: category || 'Other gadget',
    brand: brandRaw ? CANONICAL[brandRaw] || brandRaw : '—',
    region,
    confidence,
  };
}
