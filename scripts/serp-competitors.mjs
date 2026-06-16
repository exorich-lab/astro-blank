import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';

const CREDENTIALS_DIR = path.join(os.homedir(), 'credentials', 'astro-blank');
const DEFAULT_CONFIG = path.join(CREDENTIALS_DIR, 'serp', 'sites-api.json');
const DEFAULT_BING_CONFIG = path.join(os.homedir(), 'credentials', 'bing-webmaster.json');
const BING_PLANS_DIR = path.join(CREDENTIALS_DIR, 'bing', 'plans');
const BING_CACHE_DIR = path.join(CREDENTIALS_DIR, 'bing', 'cache');
const OUTPUT_DIR = path.join(CREDENTIALS_DIR, 'serp', 'competitors');
const SERP_CACHE_DIR = path.join(CREDENTIALS_DIR, 'serp', 'cache');
const PAGE_CACHE_DIR = path.join(SERP_CACHE_DIR, 'pages');
const BING_API_BASE = 'https://ssl.bing.com/webmaster/api.svc/json';

const argv = process.argv.slice(2);
const command = argv.find((item) => !item.startsWith('-')) || 'help';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/xml;q=0.8,*/*;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

const getArg = (name, fallback = '') => {
  const eq = argv.find((item) => item.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const hasArg = (name) => argv.includes(name);

function expandHome(filePath) {
  return filePath.startsWith('~/') ? path.join(os.homedir(), filePath.slice(2)) : filePath;
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'serp';
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolvePlanPath(filePath) {
  if (!filePath) return '';
  const expanded = expandHome(filePath);
  if (path.isAbsolute(expanded)) return expanded;
  const byBasename = path.join(BING_PLANS_DIR, path.basename(expanded));
  if (fs.existsSync(byBasename)) return byBasename;
  return path.resolve(expanded);
}

function unique(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const text = String(item || '').trim().replace(/\s+/g, ' ');
    const key = text.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(value) {
  return decodeEntities(String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function extractMeta(html, url) {
  const title = stripTags(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  const h1 = stripTags(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '');
  const description = decodeEntities(
    html.match(/<meta\b(?=[^>]*\bname=["']description["'])(?=[^>]*\bcontent=["']([^"']*)["'])[^>]*>/i)?.[1]
    || html.match(/<meta\b(?=[^>]*\bcontent=["']([^"']*)["'])(?=[^>]*\bname=["']description["'])[^>]*>/i)?.[1]
    || html.match(/<meta\b(?=[^>]*\bproperty=["']og:description["'])(?=[^>]*\bcontent=["']([^"']*)["'])[^>]*>/i)?.[1]
    || ''
  ).replace(/\s+/g, ' ').trim();
  const canonical = decodeEntities(
    html.match(/<link\b(?=[^>]*\brel=["']canonical["'])(?=[^>]*\bhref=["']([^"']*)["'])[^>]*>/i)?.[1] || ''
  );
  const wordCount = stripTags(html).split(/\s+/).filter(Boolean).length;

  return {
    url,
    title,
    h1,
    metaDescription: description,
    canonical,
    wordCount,
  };
}

function keywordsFromSeedPlan(plan) {
  return unique([
    ...(Array.isArray(plan.seeds) ? plan.seeds : []),
    ...(Array.isArray(plan.buyerModifiers) ? plan.buyerModifiers : []),
    ...(Array.isArray(plan.requiredTerms) ? plan.requiredTerms : []),
    ...(Array.isArray(plan.gameTitles) ? plan.gameTitles : []),
  ]);
}

function keywordsFromHtmlReport(html) {
  const keywords = [];
  const regex = /<td>([\s\S]*?)<\/td>\s*<td>[\d,]+<\/td>\s*<td>[\d,]+<\/td>/gi;
  for (const match of html.matchAll(regex)) {
    keywords.push(stripTags(match[1]));
  }
  return unique(keywords);
}

function primaryClustersFromHtmlReport(html) {
  const clusters = [];
  const sectionRegex = /<section class="cluster">([\s\S]*?)<\/section>/gi;
  for (const match of html.matchAll(sectionRegex)) {
    const section = match[1];
    const cluster = stripTags(section.match(/<h3>([\s\S]*?)<\/h3>/i)?.[1] || '');
    const slug = stripTags(section.match(/<p class="slug">([\s\S]*?)<\/p>/i)?.[1] || '');
    const pageType = stripTags(section.match(/<p class="eyebrow">([\s\S]*?)<\/p>/i)?.[1] || '').split('·')[0]?.trim() || '';
    if (pageType === 'competitor-meta') continue;
    const primaryKeyword = stripTags(section.match(/<strong>Primary:<\/strong>\s*([\s\S]*?)\s*<\/div>/i)?.[1] || '');
    if (!primaryKeyword) continue;
    clusters.push({ cluster, slug, pageType, primaryKeyword });
  }
  return uniqueBy(clusters, (item) => normalizeSeedPhrase(item.primaryKeyword));
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function loadKeywords() {
  const keyword = getArg('--keyword', getArg('--q'));
  const keywords = keyword ? [keyword] : [];
  const planFile = getArg('--plan', getArg('--plan-file'));
  if (planFile) {
    const planPath = resolvePlanPath(planFile);
    if (!fs.existsSync(planPath)) throw new Error(`Plan file not found: ${planPath}`);
    if (planPath.endsWith('.json')) {
      keywords.push(...keywordsFromSeedPlan(readJson(planPath)));
    } else if (planPath.endsWith('.html')) {
      keywords.push(...keywordsFromHtmlReport(fs.readFileSync(planPath, 'utf8')));
    }
  }
  return unique(keywords);
}

async function fetchText(url, { timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: 'follow',
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      contentType: response.headers.get('content-type') || '',
      text,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function postJson(url, payload, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`SERP API failed ${response.status}: ${text.slice(0, 500)}`);
  }
  return data;
}

function siteOrigin(url) {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`;
}

function domainFromUrl(url) {
  return new URL(url).hostname.replace(/^www\./, '');
}

function normalizeUrlForCache(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    if ((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')) {
      parsed.port = '';
    }
    return parsed.href.replace(/\/$/, '');
  } catch {
    return String(url || '').trim();
  }
}

function pageCachePaths(cacheKey) {
  const id = hash(cacheKey);
  return {
    json: path.join(PAGE_CACHE_DIR, `${id}.json`),
    html: path.join(PAGE_CACHE_DIR, `${id}.html`),
  };
}

function readCachedPage(cacheKey) {
  const paths = pageCachePaths(cacheKey);
  if (!fs.existsSync(paths.json)) return null;
  try {
    const cached = readJson(paths.json);
    return fs.existsSync(cached.htmlPath || '') ? cached : null;
  } catch {
    return null;
  }
}

function writeCachedPage(cacheKey, data) {
  fs.mkdirSync(PAGE_CACHE_DIR, { recursive: true });
  const paths = pageCachePaths(cacheKey);
  if (data.html && !fs.existsSync(paths.html)) {
    fs.writeFileSync(paths.html, data.html);
  }
  const payload = {
    serpUrl: data.serpUrl,
    fetched: data.fetched,
    status: data.status,
    finalUrl: data.finalUrl,
    htmlPath: paths.html,
    meta: data.meta,
    cachedAt: new Date().toISOString(),
  };
  fs.writeFileSync(paths.json, JSON.stringify(payload, null, 2));
  return payload;
}

function extractSitemapUrls(robotsText, origin) {
  const explicit = robotsText
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*sitemap:\s*(.+?)\s*$/i)?.[1])
    .filter(Boolean);
  const common = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml', '/sitemap.xml.gz'];
  return unique([
    ...explicit,
    ...common.map((item) => new URL(item, origin).href),
  ]);
}

function extractUrlsFromSitemap(xml, origin, limit) {
  const urls = [];
  for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
    const url = decodeEntities(match[1].trim());
    if (!url) continue;
    try {
      urls.push(new URL(url, origin).href);
    } catch {
      // Ignore invalid sitemap URLs.
    }
    if (urls.length >= limit) break;
  }
  return unique(urls);
}

function isLikelySitemapUrl(url) {
  return /sitemap|\.xml(\.gz)?($|\?)/i.test(url);
}

function sitemapLocs(xml, origin) {
  const locs = [];
  for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
    const raw = decodeEntities(match[1].trim());
    if (!raw) continue;
    try {
      locs.push(new URL(raw, origin).href);
    } catch {
      // Ignore invalid sitemap URLs.
    }
  }
  return unique(locs);
}

function pageKeywordIdeaFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (/\b(about|contact|privacy|terms|cookie|disclaimer|editorial|author|tag|wp-content|wp-json|feed)\b/i.test(parsed.pathname)) {
      return '';
    }
    const parts = parsed.pathname
      .split('/')
      .filter(Boolean)
      .map((part) => part.replace(/\.[a-z0-9]+$/i, ''))
      .flatMap((part) => part.split(/[-_]+/))
      .map((part) => part.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter((part) => part.length > 2 && ![
        'html',
        'php',
        'page',
        'blog',
        'news',
        'category',
        'tag',
        'author',
        'about',
        'contact',
        'privacy',
        'policy',
        'terms',
        'cookie',
        'cookies',
        'disclaimer',
        'editorial',
      ].includes(part) && !/^\d{4}$/.test(part));
    if (parts.length === 0) return '';
    return unique(parts).join(' ');
  } catch {
    return '';
  }
}

function classifyUrlIdea(url) {
  const text = `${url} ${pageKeywordIdeaFromUrl(url)}`.toLowerCase();
  if (/\bbonus|bonuses|free-spins|no-deposit|welcome\b/.test(text)) return 'bonus';
  if (/\bpaypal|payid|poli|visa|mastercard|banking|payment|deposit|withdrawal|payout|bitcoin|crypto\b/.test(text)) return 'payment';
  if (/\bmobile|android|iphone|ios|app\b/.test(text)) return 'mobile-app';
  if (/\bbuffalo|lightning-link|aristocrat|pragmatic|netent|microgaming|pokie|pokies|slot|slots\b/.test(text)) return 'game';
  if (/\breview|reviews|best|top|casino|casinos\b/.test(text)) return 'commercial';
  if (/\blegal|law|responsible|gambleaware|license|licence|safe\b/.test(text)) return 'trust-legal';
  return 'other';
}

function sitemapIdeaSummary(urls) {
  const byIdea = new Map();
  for (const url of urls) {
    const idea = pageKeywordIdeaFromUrl(url);
    if (!idea) continue;
    const type = classifyUrlIdea(url);
    if (type === 'other') continue;
    const item = byIdea.get(idea) || {
      idea,
      type,
      count: 0,
      sampleUrls: [],
    };
    item.count += 1;
    if (item.sampleUrls.length < 5) item.sampleUrls.push(url);
    byIdea.set(idea, item);
  }
  return Array.from(byIdea.values()).sort((a, b) => b.count - a.count || a.idea.localeCompare(b.idea));
}

function normalizeSeedPhrase(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function readBingConfig() {
  const configPath = expandHome(getArg('--bing-config', process.env.BING_WEBMASTER_CONFIG || DEFAULT_BING_CONFIG));
  if (!fs.existsSync(configPath)) throw new Error(`Bing Webmaster config not found: ${configPath}`);
  const config = readJson(configPath);
  const apiKey = String(config.apiKey || process.env.BING_WEBMASTER_API_KEY || '').trim();
  if (!apiKey || apiKey.includes('PUT_')) throw new Error(`Bing Webmaster API key is missing in ${configPath}`);
  return {
    configPath,
    apiKey,
    keywordResearch: config.keywordResearch || {},
  };
}

async function fetchJsonWithTimeout(url, options = {}) {
  const timeoutMs = Math.max(3000, Number(getArg('--request-timeout-ms', 30000)) || 30000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {
      // Keep non-JSON API errors readable.
    }
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

async function bingGetKeywordStats(keyword, { country, language, retryCount = 3 } = {}) {
  const config = readBingConfig();
  const query = { q: keyword, country, language };
  const cacheDir = path.resolve(process.env.BING_WEBMASTER_CACHE_DIR || BING_CACHE_DIR);
  const cacheKey = hash(stableJson({ method: 'GetKeywordStats', query }));
  const cachePath = path.join(cacheDir, `${cacheKey}.json`);
  const useCache = !hasArg('--no-cache');
  if (useCache && fs.existsSync(cachePath)) return readJson(cachePath);

  const url = new URL(`${BING_API_BASE}/GetKeywordStats`);
  url.searchParams.set('apikey', config.apiKey);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });

  let lastError = null;
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      const { response, data } = await fetchJsonWithTimeout(url, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        const retryAfter = Number(response.headers.get('retry-after')) || 0;
        const retryable = [408, 425, 429, 500, 502, 503, 504].includes(response.status)
          || /ThrottleUser|rate|timeout|temporarily/i.test(typeof data === 'string' ? data : JSON.stringify(data));
        if (attempt < retryCount && retryable) {
          const delay = retryAfter > 0 ? retryAfter * 1000 : Math.min(60000, (attempt + 1) * 10000);
          console.error(`[serp-expansion] Bing throttle/retry for "${keyword}" after ${delay}ms.`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(`Bing GetKeywordStats failed ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
      }
      const result = data?.d ?? data;
      if (useCache) {
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(cachePath, JSON.stringify(result), 'utf8');
      }
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < retryCount && /fetch|network|abort|timeout/i.test(error.message)) {
        const delay = Math.min(60000, (attempt + 1) * 10000);
        console.error(`[serp-expansion] Bing network retry for "${keyword}" after ${delay}ms: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error(`Bing GetKeywordStats failed for ${keyword}`);
}

function keywordStatsTotals(rows, keyword) {
  const list = Array.isArray(rows) ? rows : [];
  return {
    query: keyword,
    impressions: list.reduce((sum, row) => sum + Number(row.Impressions ?? row.impressions ?? 0), 0),
    broadImpressions: list.reduce((sum, row) => sum + Number(row.BroadImpressions ?? row.broadImpressions ?? 0), 0),
  };
}

function seedFromSitemapIdea(idea, type, marketLabel) {
  const text = normalizeSeedPhrase(idea);
  if (!text) return '';
  const hasMarket = /\baustralia|australian|au\b/i.test(text);
  const suffix = hasMarket ? '' : ` ${marketLabel}`;
  if (type === 'bonus') return `${text} ${marketLabel}`.replace(/\s+/g, ' ').trim();
  if (type === 'payment') return `${text} casinos ${marketLabel}`.replace(/\s+/g, ' ').trim();
  if (type === 'mobile-app') return `${text} pokies ${marketLabel}`.replace(/\s+/g, ' ').trim();
  if (type === 'game') return `${text}${suffix}`.replace(/\s+/g, ' ').trim();
  if (type === 'trust-legal') return `${text}${suffix}`.replace(/\s+/g, ' ').trim();
  if (type === 'commercial') return `${text}${suffix}`.replace(/\s+/g, ' ').trim();
  return '';
}

function isUsefulPlanExpansionIdea(idea, type) {
  const text = normalizeSeedPhrase(idea);
  if (!text) return false;
  if (/\b(ohne|einzahlung|bonos|deposito|gratis|terminos|servicio|contacto|brasil|mexico|canada|uk|usa|zealand)\b/.test(text)) return false;
  if (/\b(privacy|contact|about|disclaimer|editorial|terms|faq)\b/.test(text)) return false;
  if (/\b(20|25|30|35|40|45|50|70|75|100)\b/.test(text) && /\bfree spins\b/.test(text)) return false;
  if (/^\d/.test(text)) return false;

  if (type === 'bonus') {
    return /\b(free spins|no deposit|welcome bonus|deposit bonus|casino bonuses|bonus codes|wagering|bonus)\b/.test(text)
      && !/\b(at|lincoln|uptown|shazam|aussie play)\b/.test(text);
  }
  if (type === 'payment') {
    return /\b(paypal|payid|poli|visa|mastercard|banking|payment|minimum deposit|fast payout|bitcoin|crypto)\b/.test(text);
  }
  if (type === 'game') {
    return /\b(pokies|slot|slots|aristocrat|lightning link|buffalo|jackpot|progressive|live casino|software|new pokies|free pokies|real money)\b/.test(text);
  }
  if (type === 'mobile-app') {
    return /\b(mobile|android|iphone|ios|app)\b/.test(text);
  }
  if (type === 'trust-legal') {
    return /\b(responsible gambling|gambling laws|licensed online|safe online|legal online|licensed casino|safe casino)\b/.test(text);
  }
  if (type === 'commercial') {
    return /\b(casino reviews|casino games|live casinos|new casinos|real money casinos|high roller|casino sites|online casinos)\b/.test(text);
  }
  return false;
}

function marketAliases(marketLabel) {
  const market = normalizeSeedPhrase(marketLabel);
  if (!market) return [];
  if (market === 'australia') return ['australia', 'australian', 'au'];
  if (market === 'new zealand') return ['new zealand', 'nz'];
  if (market === 'canada') return ['canada', 'canadian'];
  return [market];
}

function hasMarketPhrase(text, marketLabel) {
  const normalized = normalizeSeedPhrase(text);
  return marketAliases(marketLabel).some((alias) => new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i').test(normalized));
}

function withMarketVariant(text, marketLabel) {
  const normalized = normalizeSeedPhrase(text);
  if (!normalized || hasMarketPhrase(normalized, marketLabel)) return normalized;
  return `${normalized} ${normalizeSeedPhrase(marketLabel)}`.trim();
}

function isUnderqualifiedExpansionKeyword(keyword, type, marketLabel) {
  const text = normalizeSeedPhrase(keyword);
  const tokens = text.split(/\s+/).filter(Boolean);
  const genericSingleTerms = new Set([
    'bonus',
    'bonuses',
    'casino',
    'casinos',
    'pokies',
    'slot',
    'slots',
    'reviews',
    'games',
    'mobile',
    'app',
    'apps',
  ]);
  if (tokens.length === 1 && genericSingleTerms.has(tokens[0])) return true;
  if (type === 'bonus' && /^bonus casinos?$/.test(text)) return true;
  if (type === 'commercial' && /^casino reviews?$/.test(text)) return true;
  const hasNiche = /\b(casino|casinos|pokie|pokies|slot|slots|gambling|real money|online)\b/.test(text);
  if (type === 'mobile-app' && !/\b(casino|casinos|pokie|pokies|slot|slots|gambling)\b/.test(text)) return true;
  if (type === 'payment' && !/\b(casino|casinos|pokie|pokies|slot|slots|gambling)\b/.test(text)) return true;
  if (type === 'trust-legal' && !/\b(casino|casinos|pokie|pokies|slot|slots|gambling|responsible gambling|gambling laws|licensed online)\b/.test(text)) return true;
  if (tokens.length <= 2 && !hasMarketPhrase(text, marketLabel) && !hasNiche && !/\b(free spins|no deposit|deposit bonus|welcome bonus)\b/.test(text)) {
    return true;
  }
  return false;
}

function keywordVariantsForHypothesis(candidate, marketLabel, maxVariants = 8) {
  const base = normalizeSeedPhrase(candidate.idea);
  const seed = normalizeSeedPhrase(candidate.seed || seedFromSitemapIdea(candidate.idea, candidate.type, marketLabel));
  const marketBase = withMarketVariant(base, marketLabel);
  const variants = [base, marketBase, seed];

  if (candidate.type === 'bonus') {
    variants.push(
      `${base} casinos`,
      withMarketVariant(`${base} casinos`, marketLabel),
      withMarketVariant(`best ${base} casinos`, marketLabel),
      withMarketVariant(`online pokies ${base}`, marketLabel),
      withMarketVariant(`casino ${base}`, marketLabel)
    );
  } else if (candidate.type === 'payment') {
    variants.push(
      withMarketVariant(`${base} casinos`, marketLabel),
      withMarketVariant(`online casinos with ${base}`, marketLabel),
      withMarketVariant(`${base} pokies`, marketLabel),
      withMarketVariant(`best ${base} casinos`, marketLabel),
      withMarketVariant(`${base} casino sites`, marketLabel)
    );
  } else if (candidate.type === 'game') {
    variants.push(
      `${base} online`,
      `${base} casino`,
      `${base} review`,
      `${base} bonus`,
      `${base} real money`,
      withMarketVariant(base, marketLabel),
      withMarketVariant(`${base} online`, marketLabel),
      withMarketVariant(`${base} casino`, marketLabel),
      withMarketVariant(`${base} review`, marketLabel),
      withMarketVariant(`${base} real money`, marketLabel)
    );
    if (!/\b(slot|slots|pokie|pokies)\b/i.test(base)) {
      variants.push(`${base} slot`, `${base} pokies`, withMarketVariant(`${base} slot`, marketLabel));
    }
  } else if (candidate.type === 'mobile-app') {
    variants.push(
      withMarketVariant(`${base} casinos`, marketLabel),
      withMarketVariant(`${base} pokies`, marketLabel),
      withMarketVariant(`best ${base} casinos`, marketLabel),
      withMarketVariant(`online casino apps`, marketLabel),
      withMarketVariant(`pokies app`, marketLabel)
    );
  } else if (candidate.type === 'trust-legal') {
    variants.push(
      withMarketVariant(base, marketLabel),
      withMarketVariant(`safe online casinos`, marketLabel),
      withMarketVariant(`legal online casinos`, marketLabel),
      withMarketVariant(`licensed online casinos`, marketLabel)
    );
  } else {
    variants.push(
      withMarketVariant(base, marketLabel),
      withMarketVariant(`best ${base}`, marketLabel),
      withMarketVariant(`top ${base}`, marketLabel),
      withMarketVariant(`${base} reviews`, marketLabel),
      withMarketVariant(`${base} sites`, marketLabel)
    );
  }

  return unique(variants)
    .filter((variant) => !isUnderqualifiedExpansionKeyword(variant, candidate.type, marketLabel))
    .slice(0, maxVariants);
}

function labelForValidatedCluster(candidate, marketLabel) {
  const seed = normalizeSeedPhrase(candidate.seed || candidate.idea);
  const market = normalizeSeedPhrase(marketLabel);
  const cleaned = seed.replace(new RegExp(`\\b${escapeRegex(market)}\\b`, 'ig'), '').replace(/\s+/g, ' ').trim() || seed;
  return cleaned.split(' ').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function ruleForValidatedCluster(cluster) {
  const terms = unique([
    cluster.primaryKeyword,
    ...cluster.keywords.slice(0, 6).map((item) => item.query),
  ]).map(normalizeSeedPhrase).filter(Boolean);
  return {
    label: cluster.label,
    match: `\\b(${terms.map(escapeRegex).join('|')})\\b`,
  };
}

function inferMainClusterForPlan(plan) {
  if (plan.mainCluster) return plan.mainCluster;
  const firstRule = Array.isArray(plan.clusterRules) ? plan.clusterRules[0] : null;
  const firstSeed = Array.isArray(plan.seeds) ? plan.seeds[0] : '';
  if (firstRule?.label || firstSeed) {
    return {
      label: firstRule?.label || firstSeed,
      primaryKeyword: firstSeed,
      match: firstRule?.match || (firstSeed ? `\\b${escapeRegex(firstSeed)}\\b` : ''),
      strategy: 'protected',
    };
  }
  return null;
}

function ruleForExpansionType(type) {
  const rules = {
    bonus: {
      label: 'Pokies bonuses Australia',
      match: '\\b(bonus|bonuses|free spins|no deposit|welcome bonus|deposit bonus|wagering)\\b',
    },
    payment: {
      label: 'Payment method casinos Australia',
      match: '\\b(paypal|payid|poli|visa|mastercard|banking|payment|deposit|withdrawal|payout|bitcoin|crypto|minimum deposit)\\b',
    },
    game: {
      label: 'Pokies games and providers Australia',
      match: '\\b(aristocrat|lightning link|buffalo|jackpot|progressive|live casino|software|slots|free pokies|new pokies|high rtp)\\b',
    },
    'mobile-app': {
      label: 'Mobile pokies Australia',
      match: '\\b(mobile|android|iphone|ios|app|tablet)\\b',
    },
    'trust-legal': {
      label: 'Responsible and legal gambling Australia',
      match: '\\b(responsible gambling|legal|licensed|safe|gambling laws|self exclusion|review methodology)\\b',
    },
    commercial: {
      label: 'Online casino comparison Australia',
      match: '\\b(casino reviews|casino games|live casinos|new casinos|real money casinos|high roller|casino sites)\\b',
    },
  };
  return rules[type] || null;
}

function existingNormalizedSet(items) {
  return new Set((items || []).map(normalizeSeedPhrase).filter(Boolean));
}

function expansionCandidatesFromIdeas(ideas, { marketLabel = 'australia', perTypeLimit = 25, minCount = 2 } = {}) {
  const byType = new Map();
  for (const item of ideas || []) {
    if ((item.count || 0) < minCount) continue;
    if (!isUsefulPlanExpansionIdea(item.idea, item.type)) continue;
    const typeItems = byType.get(item.type) || [];
    if (typeItems.length >= perTypeLimit) continue;
    const seed = seedFromSitemapIdea(item.idea, item.type, marketLabel);
    if (!seed) continue;
    typeItems.push({
      seed,
      idea: item.idea,
      type: item.type,
      count: item.count,
      sampleUrls: item.sampleUrls || [],
    });
    byType.set(item.type, typeItems);
  }
  return Array.from(byType.values()).flat();
}

async function collectSiteArtifacts(site, keywordDir, options) {
  const url = site.url;
  const domain = site.domain || domainFromUrl(url);
  const siteDir = path.join(keywordDir, `${String(site.position || 'x').padStart(2, '0')}-${slugify(domain)}`);
  fs.mkdirSync(siteDir, { recursive: true });
  const cache = options.cache || { pages: new Map(), origins: new Map(), sitemaps: new Map() };
  const inputCacheKey = normalizeUrlForCache(url);

  const pageResult = {
    domain,
    position: site.position,
    serpTitle: site.title || '',
    serpUrl: url,
    fetched: false,
    status: null,
    finalUrl: '',
    htmlPath: '',
    meta: null,
    robots: null,
    sitemaps: [],
    errors: [],
  };

  const cachedPage = cache.pages.get(inputCacheKey);
  const persistentInputPage = cachedPage || readCachedPage(inputCacheKey);
  if (persistentInputPage) {
    Object.assign(pageResult, {
      fetched: persistentInputPage.fetched,
      status: persistentInputPage.status,
      finalUrl: persistentInputPage.finalUrl,
      htmlPath: persistentInputPage.htmlPath,
      meta: persistentInputPage.meta,
      duplicateOf: persistentInputPage.serpUrl,
      fromCache: true,
    });
    cache.pages.set(inputCacheKey, persistentInputPage);
  } else {
    try {
      const page = await fetchText(url, { timeoutMs: options.timeoutMs });
      pageResult.fetched = page.ok;
      pageResult.status = page.status;
      pageResult.finalUrl = page.finalUrl;
      const finalCacheKey = normalizeUrlForCache(page.finalUrl || url);
      const duplicatePage = cache.pages.get(finalCacheKey) || readCachedPage(finalCacheKey);
      if (duplicatePage) {
        Object.assign(pageResult, {
          fetched: duplicatePage.fetched,
          status: duplicatePage.status,
          finalUrl: duplicatePage.finalUrl,
          htmlPath: duplicatePage.htmlPath,
          meta: duplicatePage.meta,
          duplicateOf: duplicatePage.serpUrl,
          fromCache: true,
        });
        cache.pages.set(finalCacheKey, duplicatePage);
      } else {
        pageResult.meta = extractMeta(page.text, page.finalUrl || url);
        const cached = writeCachedPage(finalCacheKey, {
          serpUrl: url,
          fetched: pageResult.fetched,
          status: pageResult.status,
          finalUrl: pageResult.finalUrl,
          html: page.text,
          meta: pageResult.meta,
        });
        pageResult.htmlPath = cached.htmlPath;
        pageResult.meta = extractMeta(page.text, page.finalUrl || url);
        cache.pages.set(finalCacheKey, cached);
      }
      const finalCached = cache.pages.get(finalCacheKey) || readCachedPage(finalCacheKey) || {
        serpUrl: url,
        fetched: pageResult.fetched,
        status: pageResult.status,
        finalUrl: pageResult.finalUrl,
        htmlPath: pageResult.htmlPath,
        meta: pageResult.meta,
      };
      cache.pages.set(inputCacheKey, finalCached);
      if (inputCacheKey !== finalCacheKey && !readCachedPage(inputCacheKey)) {
        writeCachedPage(inputCacheKey, { ...finalCached, html: fs.existsSync(finalCached.htmlPath) ? fs.readFileSync(finalCached.htmlPath, 'utf8') : '' });
      }
    } catch (error) {
      pageResult.errors.push(`page fetch failed: ${error.message}`);
    }
  }

  const origin = siteOrigin(pageResult.finalUrl || url);
  const cachedOrigin = cache.origins.get(origin);
  if (cachedOrigin) {
    pageResult.robots = cachedOrigin.robots;
    pageResult.sitemaps = cachedOrigin.sitemaps;
  } else {
    try {
    const robotsUrl = new URL('/robots.txt', origin).href;
    const robots = await fetchText(robotsUrl, { timeoutMs: options.timeoutMs });
    const robotsPath = path.join(siteDir, 'robots.txt');
    fs.writeFileSync(robotsPath, robots.text);
    pageResult.robots = {
      url: robotsUrl,
      status: robots.status,
      path: robotsPath,
    };

      if (robots.ok || robots.text) {
      const sitemapUrls = extractSitemapUrls(robots.text, origin).slice(0, options.sitemapLimit);
      for (const sitemapUrl of sitemapUrls) {
        const sitemapCacheKey = normalizeUrlForCache(sitemapUrl);
        const cachedSitemap = cache.sitemaps.get(sitemapCacheKey);
        if (cachedSitemap) {
          pageResult.sitemaps.push(cachedSitemap);
          continue;
        }
        try {
          const sitemap = await fetchText(sitemapUrl, { timeoutMs: options.timeoutMs });
          if (!sitemap.ok && !sitemap.text) continue;
          const sitemapPath = path.join(siteDir, `sitemap-${hash(sitemapUrl)}.xml`);
          fs.writeFileSync(sitemapPath, sitemap.text);
          const sitemapResult = {
            url: sitemapUrl,
            status: sitemap.status,
            path: sitemapPath,
            sampleUrls: extractUrlsFromSitemap(sitemap.text, origin, options.sitemapUrlLimit),
          };
          cache.sitemaps.set(sitemapCacheKey, sitemapResult);
          pageResult.sitemaps.push(sitemapResult);
        } catch (error) {
          pageResult.errors.push(`sitemap fetch failed ${sitemapUrl}: ${error.message}`);
        }
      }
    }
      cache.origins.set(origin, {
        robots: pageResult.robots,
        sitemaps: pageResult.sitemaps,
      });
    } catch (error) {
      pageResult.errors.push(`robots/sitemap discovery failed: ${error.message}`);
    }
  }

  fs.writeFileSync(path.join(siteDir, 'summary.json'), JSON.stringify(pageResult, null, 2));
  return pageResult;
}

function addUniqueSerpUrl(uniqueUrls, site, keyword) {
  if (!site?.url) return;
  const key = normalizeUrlForCache(site.url);
  const existing = uniqueUrls.get(key) || {
    url: site.url,
    normalizedUrl: key,
    domain: site.domain || domainFromUrl(site.url),
    title: site.title || '',
    appearances: [],
  };
  existing.appearances.push({
    keyword,
    position: site.position,
    title: site.title || '',
  });
  uniqueUrls.set(key, existing);
}

function uniqueDomainsFromUrls(urls) {
  const byDomain = new Map();
  for (const item of urls) {
    const list = byDomain.get(item.domain) || [];
    list.push(item);
    byDomain.set(item.domain, list);
  }

  return Array.from(byDomain.entries()).map(([domain, items]) => {
    const sorted = [...items].sort((a, b) => b.appearances.length - a.appearances.length || a.url.length - b.url.length);
    return {
      domain,
      url: sorted[0]?.url || '',
      normalizedUrl: sorted[0]?.normalizedUrl || '',
      title: sorted[0]?.title || '',
      urlCount: items.length,
      appearances: items.flatMap((item) => item.appearances),
      urls: items.map((item) => ({
        url: item.url,
        appearances: item.appearances.length,
      })),
    };
  }).sort((a, b) => b.appearances.length - a.appearances.length || b.urlCount - a.urlCount || a.domain.localeCompare(b.domain));
}

function latestRunDir() {
  if (!fs.existsSync(OUTPUT_DIR)) return '';
  const dirs = fs.readdirSync(OUTPUT_DIR)
    .map((name) => path.join(OUTPUT_DIR, name))
    .filter((item) => fs.statSync(item).isDirectory())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return dirs[0] || '';
}

async function collectSerp() {
  const configPath = expandHome(getArg('--config', DEFAULT_CONFIG));
  const config = readJson(configPath);
  const endpoint = config.endpoints?.sites?.url;
  if (!endpoint) throw new Error(`Missing endpoints.sites.url in ${configPath}`);

  const market = getArg('--market', 'US');
  const language = getArg('--language', 'en-US');
  const top = Math.max(1, Math.min(10, Number(getArg('--top', 10)) || 10));
  const keywordLimit = Math.max(1, Math.min(200, Number(getArg('--keyword-limit', 1)) || 1));
  const keywordOffset = Math.max(0, Math.min(1000, Number(getArg('--keyword-offset', 0)) || 0));
  const delayMs = Math.max(0, Number(getArg('--delay-ms', 750)) || 0);
  const allKeywords = loadKeywords();
  const keywords = allKeywords.slice(keywordOffset, keywordOffset + keywordLimit);

  if (keywords.length === 0) {
    throw new Error('Pass --keyword "online pokies chooser" or --plan seed-or-report-file');
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${slugify(keywords[0])}`;
  const runDir = path.join(OUTPUT_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const result = {
    ok: true,
    configPath,
    endpoint,
    runDir,
    market,
    language,
    top,
    keywordLimit,
    keywordOffset,
    totalAvailableKeywords: allKeywords.length,
    startedAt: new Date().toISOString(),
    keywords: [],
    uniqueUrls: [],
    uniqueDomains: [],
  };
  const uniqueUrls = new Map();

  for (const keyword of keywords) {
    console.error(`[serp-collect] ${result.keywords.length + 1}/${keywords.length}: ${keyword}`);
    const keywordDir = path.join(runDir, slugify(keyword));
    fs.mkdirSync(keywordDir, { recursive: true });
    const serp = await postJson(endpoint, { market, language, keyword }, config.endpoints.sites.headers || {});
    fs.writeFileSync(path.join(keywordDir, 'serp-response.json'), JSON.stringify(serp, null, 2));

    const sites = (Array.isArray(serp.sites) ? serp.sites : []).slice(0, top);
    const keywordResult = {
      keyword,
      serpStatus: serp.status,
      cvid: serp.cvid,
      searchUrl: serp.search_url,
      count: sites.length,
      sites,
    };

    for (const site of sites) {
      addUniqueSerpUrl(uniqueUrls, site, keyword);
    }

    fs.writeFileSync(path.join(keywordDir, 'summary.json'), JSON.stringify(keywordResult, null, 2));
    result.keywords.push(keywordResult);
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  result.uniqueUrls = Array.from(uniqueUrls.values())
    .sort((a, b) => b.appearances.length - a.appearances.length || a.domain.localeCompare(b.domain));
  result.uniqueDomains = uniqueDomainsFromUrls(result.uniqueUrls);
  result.finishedAt = new Date().toISOString();

  fs.writeFileSync(path.join(runDir, 'unique-urls.json'), JSON.stringify(result.uniqueUrls, null, 2));
  fs.writeFileSync(path.join(runDir, 'unique-domains.json'), JSON.stringify(result.uniqueDomains, null, 2));
  fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({
    ok: true,
    mode: 'collect',
    runDir,
    keywords: result.keywords.length,
    serpPositions: result.keywords.reduce((sum, item) => sum + item.count, 0),
    uniqueUrls: result.uniqueUrls.length,
    uniqueDomains: result.uniqueDomains.length,
    topDomains: result.uniqueDomains.slice(0, 20).map((item) => ({
      domain: item.domain,
      appearances: item.appearances.length,
      urlCount: item.urlCount,
    })),
  }, null, 2));
}

async function fetchCompetitorPages() {
  const runDir = expandHome(getArg('--run-dir', latestRunDir()));
  if (!runDir || !fs.existsSync(runDir)) throw new Error(`Run dir not found: ${runDir || '(empty)'}`);
  const uniquePath = path.join(runDir, 'unique-urls.json');
  if (!fs.existsSync(uniquePath)) throw new Error(`Unique URL list not found: ${uniquePath}. Run collect first.`);

  const timeoutMs = Math.max(3000, Number(getArg('--timeout-ms', 20000)) || 20000);
  const sitemapLimit = Math.max(0, Math.min(10, Number(getArg('--sitemap-limit', 3)) || 3));
  const sitemapUrlLimit = Math.max(0, Math.min(1000, Number(getArg('--sitemap-url-limit', 100)) || 100));
  const limit = Math.max(1, Math.min(1000, Number(getArg('--limit', 1000)) || 1000));
  const delayMs = Math.max(0, Number(getArg('--delay-ms', 500)) || 0);
  const source = getArg('--source', 'domains');
  const sourcePath = source === 'urls' ? uniquePath : path.join(runDir, 'unique-domains.json');
  if (!fs.existsSync(sourcePath)) throw new Error(`Fetch source not found: ${sourcePath}`);
  const uniqueUrls = readJson(sourcePath).slice(0, limit);
  const pagesDir = path.join(runDir, 'pages');
  fs.mkdirSync(pagesDir, { recursive: true });
  const cache = { pages: new Map(), origins: new Map(), sitemaps: new Map() };
  const pages = [];

  for (let index = 0; index < uniqueUrls.length; index += 1) {
    const item = uniqueUrls[index];
    console.error(`[serp-fetch] ${index + 1}/${uniqueUrls.length}: ${item.domain} ${item.url}`);
    pages.push(await collectSiteArtifacts({
      url: item.url,
      domain: item.domain,
      title: item.title,
      position: index + 1,
    }, pagesDir, {
      timeoutMs,
      sitemapLimit,
      sitemapUrlLimit,
      cache,
    }));
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const result = {
    ok: true,
    mode: 'fetch',
    runDir,
    pagesDir,
    fetchedAt: new Date().toISOString(),
    source,
    uniqueUrls: uniqueUrls.length,
    fetchedPages: pages.filter((page) => page.fetched).length,
    cachedPages: pages.filter((page) => page.fromCache).length,
    pages,
  };
  fs.writeFileSync(path.join(runDir, 'pages-summary.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({
    ok: true,
    mode: 'fetch',
    runDir,
    uniqueUrls: result.uniqueUrls,
    fetchedPages: result.fetchedPages,
    cachedPages: result.cachedPages,
    domains: pages.slice(0, 30).map((page) => page.domain),
  }, null, 2));
}

async function discoverDomainSitemaps(item, outputDir, options) {
  const origin = siteOrigin(item.url);
  const domain = item.domain || domainFromUrl(item.url);
  const domainDir = path.join(outputDir, slugify(domain));
  fs.mkdirSync(domainDir, { recursive: true });
  const errors = [];
  const sitemapQueue = [];
  const seenSitemaps = new Set();
  const pageUrls = new Set();
  let robots = null;

  try {
    const robotsUrl = new URL('/robots.txt', origin).href;
    const response = await fetchText(robotsUrl, { timeoutMs: options.timeoutMs });
    fs.writeFileSync(path.join(domainDir, 'robots.txt'), response.text);
    robots = { url: robotsUrl, status: response.status, ok: response.ok };
    for (const url of extractSitemapUrls(response.text || '', origin)) sitemapQueue.push(url);
  } catch (error) {
    errors.push(`robots failed: ${error.message}`);
  }

  for (const common of ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml']) {
    sitemapQueue.push(new URL(common, origin).href);
  }

  const sitemapResults = [];
  while (sitemapQueue.length > 0 && sitemapResults.length < options.maxSitemapsPerDomain && pageUrls.size < options.maxUrlsPerDomain) {
    const sitemapUrl = sitemapQueue.shift();
    const key = normalizeUrlForCache(sitemapUrl);
    if (!key || seenSitemaps.has(key)) continue;
    seenSitemaps.add(key);

    try {
      const response = await fetchText(sitemapUrl, { timeoutMs: options.timeoutMs });
      if (!response.text || response.status >= 500) continue;
      const locs = sitemapLocs(response.text, origin);
      const isIndex = /<sitemapindex[\s>]/i.test(response.text);
      const sitemapPath = path.join(domainDir, `sitemap-${String(sitemapResults.length + 1).padStart(3, '0')}-${hash(sitemapUrl)}.xml`);
      fs.writeFileSync(sitemapPath, response.text);

      const childSitemaps = locs.filter(isLikelySitemapUrl);
      const pages = isIndex ? locs.filter((url) => !isLikelySitemapUrl(url)) : locs;
      for (const child of childSitemaps) {
        if (sitemapResults.length + sitemapQueue.length < options.maxSitemapsPerDomain) sitemapQueue.push(child);
      }
      for (const url of pages) {
        if (!isLikelySitemapUrl(url)) pageUrls.add(url);
        if (pageUrls.size >= options.maxUrlsPerDomain) break;
      }

      sitemapResults.push({
        url: sitemapUrl,
        status: response.status,
        path: sitemapPath,
        locs: locs.length,
        childSitemaps: childSitemaps.length,
        pageUrls: pages.filter((url) => !isLikelySitemapUrl(url)).length,
      });
    } catch (error) {
      errors.push(`sitemap failed ${sitemapUrl}: ${error.message}`);
    }
  }

  const urls = Array.from(pageUrls).sort();
  const result = {
    domain,
    origin,
    sourceUrl: item.url,
    robots,
    sitemapCount: sitemapResults.length,
    urlCount: urls.length,
    sitemaps: sitemapResults,
    urls,
    ideas: sitemapIdeaSummary(urls).slice(0, options.ideaLimit),
    errors,
  };
  fs.writeFileSync(path.join(domainDir, 'sitemap-summary.json'), JSON.stringify(result, null, 2));
  return result;
}

async function expandFromSitemaps() {
  const runDir = expandHome(getArg('--run-dir', latestRunDir()));
  if (!runDir || !fs.existsSync(runDir)) throw new Error(`Run dir not found: ${runDir || '(empty)'}`);
  const source = getArg('--source', 'domains');
  const sourcePath = path.join(runDir, source === 'urls' ? 'unique-urls.json' : 'unique-domains.json');
  if (!fs.existsSync(sourcePath)) throw new Error(`Sitemap source not found: ${sourcePath}`);

  const limit = Math.max(1, Math.min(1000, Number(getArg('--limit', 1000)) || 1000));
  const timeoutMs = Math.max(3000, Number(getArg('--timeout-ms', 12000)) || 12000);
  const maxSitemapsPerDomain = Math.max(1, Math.min(200, Number(getArg('--max-sitemaps-per-domain', 30)) || 30));
  const maxUrlsPerDomain = Math.max(10, Math.min(100000, Number(getArg('--max-urls-per-domain', 5000)) || 5000));
  const ideaLimit = Math.max(10, Math.min(5000, Number(getArg('--idea-limit', 300)) || 300));
  const delayMs = Math.max(0, Number(getArg('--delay-ms', 200)) || 0);
  const targets = readJson(sourcePath).slice(0, limit);
  const outputDir = path.join(runDir, 'sitemap-expansion');
  fs.mkdirSync(outputDir, { recursive: true });

  const domains = [];
  for (let index = 0; index < targets.length; index += 1) {
    const item = targets[index];
    console.error(`[serp-sitemaps] ${index + 1}/${targets.length}: ${item.domain} ${item.url}`);
    domains.push(await discoverDomainSitemaps(item, outputDir, {
      timeoutMs,
      maxSitemapsPerDomain,
      maxUrlsPerDomain,
      ideaLimit,
    }));
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const allUrls = unique(domains.flatMap((domain) => domain.urls));
  const ideas = sitemapIdeaSummary(allUrls).slice(0, ideaLimit);
  const byType = ideas.reduce((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {});
  const result = {
    ok: true,
    mode: 'sitemaps',
    runDir,
    outputDir,
    source,
    domainsChecked: domains.length,
    domainsWithUrls: domains.filter((domain) => domain.urlCount > 0).length,
    sitemapCount: domains.reduce((sum, domain) => sum + domain.sitemapCount, 0),
    urlCount: allUrls.length,
    ideaCount: ideas.length,
    byType,
    ideas,
    domains: domains.map((domain) => ({
      domain: domain.domain,
      sitemapCount: domain.sitemapCount,
      urlCount: domain.urlCount,
      topIdeas: domain.ideas.slice(0, 20),
      errors: domain.errors,
    })),
  };

  fs.writeFileSync(path.join(runDir, 'sitemap-expansion.json'), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(outputDir, 'all-urls.json'), JSON.stringify(allUrls, null, 2));
  fs.writeFileSync(path.join(outputDir, 'keyword-ideas.json'), JSON.stringify(ideas, null, 2));
  console.log(JSON.stringify({
    ok: true,
    mode: 'sitemaps',
    runDir,
    domainsChecked: result.domainsChecked,
    domainsWithUrls: result.domainsWithUrls,
    sitemapCount: result.sitemapCount,
    urlCount: result.urlCount,
    ideaCount: result.ideaCount,
    byType,
    topIdeas: ideas.slice(0, 30).map((item) => ({
      idea: item.idea,
      type: item.type,
      count: item.count,
    })),
  }, null, 2));
}

async function expandSeedPlanFromSitemaps() {
  const runDir = expandHome(getArg('--run-dir', latestRunDir()));
  if (!runDir || !fs.existsSync(runDir)) throw new Error(`Run dir not found: ${runDir || '(empty)'}`);
  const sitemapExpansionPath = path.join(runDir, 'sitemap-expansion.json');
  if (!fs.existsSync(sitemapExpansionPath)) throw new Error(`Sitemap expansion not found: ${sitemapExpansionPath}. Run serp-sitemaps first.`);

  const planPath = resolvePlanPath(getArg('--plan', getArg('--plan-file')));
  if (!planPath || !fs.existsSync(planPath)) throw new Error(`Seed plan file not found: ${planPath || '(empty)'}`);
  const plan = readJson(planPath);
  const expansion = readJson(sitemapExpansionPath);
  const marketLabel = getArg('--market-label', 'australia');
  const perTypeLimit = Math.max(1, Math.min(100, Number(getArg('--per-type-limit', 20)) || 20));
  const minCount = Math.max(1, Math.min(100, Number(getArg('--min-count', 2)) || 2));
  const candidates = expansionCandidatesFromIdeas(expansion.ideas || [], { marketLabel, perTypeLimit, minCount });
  const existingSeeds = existingNormalizedSet(plan.seeds || []);
  const newSeedCandidates = candidates.filter((item) => !existingSeeds.has(normalizeSeedPhrase(item.seed)));
  const existingRules = existingNormalizedSet((plan.clusterRules || []).map((rule) => rule.label));
  const newRules = Array.from(new Set(newSeedCandidates.map((item) => item.type)))
    .map(ruleForExpansionType)
    .filter(Boolean)
    .filter((rule) => !existingRules.has(normalizeSeedPhrase(rule.label)));

  const expanded = {
    ...plan,
    mainCluster: inferMainClusterForPlan(plan),
    seeds: unique([...(plan.seeds || []), ...newSeedCandidates.map((item) => item.seed)]),
    buyerModifiers: unique([
      ...(plan.buyerModifiers || []),
      'free spins',
      'no deposit',
      'welcome bonus',
      'minimum deposit',
      'crypto',
      'bitcoin',
      'fast payout',
      'mobile',
      'aristocrat',
      'lightning link',
      'responsible gambling',
    ]),
    clusterRules: [...(plan.clusterRules || []), ...newRules],
    sitemapExpansion: {
      sourceRunDir: runDir,
      sourceFile: sitemapExpansionPath,
      generatedAt: new Date().toISOString(),
      method: 'sitemap ideas are hypotheses; validate through Bing keyword demand and SERP before final page creation',
      domainsChecked: expansion.domainsChecked,
      sitemapCount: expansion.sitemapCount,
      urlCount: expansion.urlCount,
      ideaCount: expansion.ideaCount,
      minCount,
      perTypeLimit,
      addedSeedCandidates: newSeedCandidates.length,
      addedClusterRules: newRules.length,
      candidateGroups: newSeedCandidates.reduce((acc, item) => {
        acc[item.type] = acc[item.type] || [];
        acc[item.type].push(item);
        return acc;
      }, {}),
      validationQueue: newSeedCandidates.slice(0, 80).map((item) => ({
        keyword: item.seed,
        type: item.type,
        evidenceCount: item.count,
        sampleUrls: item.sampleUrls,
        suggestedCheck: `make bing-keyword KEYWORD="${item.seed}" COUNTRY=au LANGUAGE=en-AU`,
      })),
    },
  };

  const outputArg = getArg('--output');
  const outputPath = outputArg
    ? resolvePlanPath(outputArg)
    : path.join(BING_PLANS_DIR, `${path.basename(planPath, '.json')}-expanded-draft.json`);
  fs.writeFileSync(outputPath, JSON.stringify(expanded, null, 2));
  const reportPath = outputPath.replace(/\.json$/i, '.expansion-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    sourcePlan: planPath,
    outputPlan: outputPath,
    runDir,
    addedSeedCandidates: newSeedCandidates.length,
    addedClusterRules: newRules.length,
    byType: newSeedCandidates.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {}),
    topCandidates: newSeedCandidates.slice(0, 60),
  }, null, 2));

  console.log(JSON.stringify({
    ok: true,
    mode: 'plan-expand',
    sourcePlan: planPath,
    outputPlan: outputPath,
    reportPath,
    addedSeedCandidates: newSeedCandidates.length,
    addedClusterRules: newRules.length,
    byType: newSeedCandidates.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {}),
    next: [
      `Review ${outputPath}`,
      'Validate candidate seeds with Bing keyword demand and SERP before building pages',
      `Run: make bing-site-plan KEYWORD="online pokies australia" SEED_PLAN=${path.basename(outputPath)} COUNTRY=au LANGUAGE=en-AU`,
    ],
  }, null, 2));
}

async function validateSitemapExpansionWithBing() {
  const runDir = expandHome(getArg('--run-dir', latestRunDir()));
  if (!runDir || !fs.existsSync(runDir)) throw new Error(`Run dir not found: ${runDir || '(empty)'}`);
  const sitemapExpansionPath = path.join(runDir, 'sitemap-expansion.json');
  if (!fs.existsSync(sitemapExpansionPath)) throw new Error(`Sitemap expansion not found: ${sitemapExpansionPath}. Run serp-sitemaps first.`);

  const planPath = resolvePlanPath(getArg('--plan', getArg('--plan-file')));
  if (!planPath || !fs.existsSync(planPath)) throw new Error(`Seed plan file not found: ${planPath || '(empty)'}`);

  const plan = readJson(planPath);
  const expansion = readJson(sitemapExpansionPath);
  const bingConfig = readBingConfig();
  const marketLabel = getArg('--market-label', 'australia');
  const country = getArg('--country', bingConfig.keywordResearch.country || 'au').toLowerCase();
  const language = getArg('--language', bingConfig.keywordResearch.languageTag || bingConfig.keywordResearch.language || 'en-AU');
  const perTypeLimit = Math.max(1, Math.min(100, Number(getArg('--per-type-limit', 20)) || 20));
  const minCount = Math.max(1, Math.min(100, Number(getArg('--min-count', 2)) || 2));
  const maxIdeas = Math.max(1, Math.min(300, Number(getArg('--max-ideas', 80)) || 80));
  const variantsPerIdea = Math.max(1, Math.min(20, Number(getArg('--variants-per-idea', 8)) || 8));
  const minImpressions = Math.max(0, Number(getArg('--min-impressions', 1)) || 0);
  const minBroadImpressions = Math.max(0, Number(getArg('--min-broad-impressions', 10)) || 0);
  const delayMs = Math.max(0, Number(getArg('--stats-delay-ms', getArg('--delay-ms', 500))) || 0);
  const retryCount = Math.max(0, Math.min(10, Number(getArg('--retry-count', 3)) || 3));

  const candidates = expansionCandidatesFromIdeas(expansion.ideas || [], { marketLabel, perTypeLimit, minCount }).slice(0, maxIdeas);
  const statsByQuery = new Map();
  const clusters = [];
  const errors = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const variants = keywordVariantsForHypothesis(candidate, marketLabel, variantsPerIdea);
    console.error(`[serp-expansion] ${index + 1}/${candidates.length}: ${candidate.idea} (${variants.length} variants)`);
    const rows = [];
    for (const variant of variants) {
      const key = normalizeSeedPhrase(variant);
      if (!key) continue;
      try {
        let totals = statsByQuery.get(key);
        if (!totals) {
          totals = keywordStatsTotals(await bingGetKeywordStats(variant, { country, language, retryCount }), variant);
          statsByQuery.set(key, totals);
          if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        if ((totals.impressions || 0) >= minImpressions || (totals.broadImpressions || 0) >= minBroadImpressions) {
          rows.push({
            ...totals,
            source: variant === candidate.seed ? 'sitemap-seed' : 'sitemap-variant',
          });
        }
      } catch (error) {
        errors.push({ variant, candidate: candidate.idea, message: error.message });
      }
    }
    const ranked = rows
      .filter((row) => !isUnderqualifiedExpansionKeyword(row.query, candidate.type, marketLabel))
      .sort((a, b) => b.impressions - a.impressions || b.broadImpressions - a.broadImpressions || a.query.localeCompare(b.query));
    if (ranked.length === 0) continue;
    const primary = ranked[0];
    clusters.push({
      label: labelForValidatedCluster({ ...candidate, seed: primary.query }, marketLabel),
      type: candidate.type,
      primaryKeyword: primary.query,
      totalImpressions: ranked.reduce((sum, row) => sum + row.impressions, 0),
      totalBroadImpressions: ranked.reduce((sum, row) => sum + row.broadImpressions, 0),
      sitemapEvidenceCount: candidate.count,
      sampleUrls: candidate.sampleUrls || [],
      keywords: ranked,
      testedVariants: variants,
    });
  }

  const sortedClusters = clusters.sort((a, b) => b.totalImpressions - a.totalImpressions || b.totalBroadImpressions - a.totalBroadImpressions || a.label.localeCompare(b.label));
  const existingSeeds = existingNormalizedSet(plan.seeds || []);
  const newSeeds = unique(sortedClusters.flatMap((cluster) => [cluster.primaryKeyword, ...cluster.keywords.map((row) => row.query)]))
    .filter((seed) => !existingSeeds.has(normalizeSeedPhrase(seed)));
  const existingRuleLabels = existingNormalizedSet((plan.clusterRules || []).map((rule) => rule.label));
  const newRules = sortedClusters
    .map(ruleForValidatedCluster)
    .filter((rule) => !existingRuleLabels.has(normalizeSeedPhrase(rule.label)));

  const outputArg = getArg('--output');
  const outputPath = outputArg
    ? resolvePlanPath(outputArg)
    : path.join(BING_PLANS_DIR, `${path.basename(planPath, '.json')}-validated-expansion.json`);
  const reportPath = outputPath.replace(/\.json$/i, '.validation-report.json');
  const expanded = {
    ...plan,
    mainCluster: inferMainClusterForPlan(plan),
    seeds: unique([...(plan.seeds || []), ...newSeeds]),
    clusterRules: [...(plan.clusterRules || []), ...newRules],
    validatedSitemapExpansion: {
      sourceRunDir: runDir,
      sourceFile: sitemapExpansionPath,
      generatedAt: new Date().toISOString(),
      bingConfigPath: bingConfig.configPath,
      country,
      language,
      marketLabel,
      minCount,
      maxIdeas,
      variantsPerIdea,
      minImpressions,
      minBroadImpressions,
      testedHypotheses: candidates.length,
      testedQueries: statsByQuery.size,
      validatedClusters: sortedClusters.length,
      addedSeeds: newSeeds.length,
      addedClusterRules: newRules.length,
      clusters: sortedClusters,
    },
  };

  fs.writeFileSync(outputPath, JSON.stringify(expanded, null, 2));
  fs.writeFileSync(reportPath, JSON.stringify({
    sourcePlan: planPath,
    outputPlan: outputPath,
    runDir,
    country,
    language,
    testedHypotheses: candidates.length,
    testedQueries: statsByQuery.size,
    validatedClusters: sortedClusters.length,
    addedSeeds: newSeeds.length,
    addedClusterRules: newRules.length,
    byType: sortedClusters.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {}),
    topClusters: sortedClusters.slice(0, 80),
    errors,
  }, null, 2));

  console.log(JSON.stringify({
    ok: true,
    mode: 'plan-validate-expansion',
    sourcePlan: planPath,
    outputPlan: outputPath,
    reportPath,
    country,
    language,
    testedHypotheses: candidates.length,
    testedQueries: statsByQuery.size,
    validatedClusters: sortedClusters.length,
    addedSeeds: newSeeds.length,
    addedClusterRules: newRules.length,
    byType: sortedClusters.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {}),
    topClusters: sortedClusters.slice(0, 20).map((cluster) => ({
      label: cluster.label,
      type: cluster.type,
      primaryKeyword: cluster.primaryKeyword,
      exact: cluster.totalImpressions,
      broad: cluster.totalBroadImpressions,
      keywords: cluster.keywords.slice(0, 5).map((row) => row.query),
    })),
    next: [
      `Run: make bing-site-plan KEYWORD="${(plan.seeds || [])[0] || 'topic'}" SEED_PLAN=${path.basename(outputPath)} COUNTRY=${country} LANGUAGE=${language}`,
      `Review ${reportPath}`,
    ],
  }, null, 2));
}

async function fetchCompetitorMetaPage(url, timeoutMs) {
  const cacheKey = normalizeUrlForCache(url);
  const cached = readCachedPage(cacheKey);
  if (cached?.meta) {
    return {
      fetched: cached.fetched,
      status: cached.status,
      finalUrl: cached.finalUrl,
      htmlPath: cached.htmlPath,
      meta: cached.meta,
      fromCache: true,
    };
  }

  const page = await fetchText(url, { timeoutMs });
  const meta = extractMeta(page.text, page.finalUrl || url);
  const stored = writeCachedPage(normalizeUrlForCache(page.finalUrl || url), {
    serpUrl: url,
    fetched: page.ok,
    status: page.status,
    finalUrl: page.finalUrl,
    html: page.text,
    meta,
  });
  return {
    fetched: page.ok,
    status: page.status,
    finalUrl: page.finalUrl,
    htmlPath: stored.htmlPath,
    meta,
    fromCache: false,
  };
}

function competitorMetaSectionHtml(result) {
  const meaningfulWords = (items) => {
    const stop = new Set(['a', 'and', 'are', 'at', 'best', 'for', 'from', 'in', 'of', 'on', 'online', 'the', 'to', 'top', 'with', '2025', '2026']);
    const counts = new Map();
    for (const item of items) {
      for (const word of normalizeSeedPhrase(item).split(/\s+/)) {
        if (word.length < 4 || stop.has(word)) continue;
        counts.set(word, (counts.get(word) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([word]) => word);
  };

  const rows = result.clusters.map((cluster) => {
    const pages = cluster.pages.filter((page) => !page.error);
    const domains = unique(pages.map((page) => page.domain)).slice(0, 8);
    const titleWords = meaningfulWords(pages.map((page) => page.title));
    const h1Words = meaningfulWords(pages.map((page) => page.h1));
    const descWords = meaningfulWords(pages.map((page) => page.metaDescription));
    const bestExamples = pages
      .filter((page) => page.title || page.h1 || page.metaDescription)
      .slice(0, 3);
    const blocked = cluster.pages.filter((page) => /cloudflare|blocked|just a moment/i.test(`${page.title || ''} ${page.h1 || ''}`)).length;

    return `
      <details class="meta-card">
        <summary>
          <span>
            <strong>${escapeHtml(cluster.cluster || cluster.primaryKeyword)}</strong>
            <small>${escapeHtml(cluster.primaryKeyword)} · ${escapeHtml(cluster.slug || '')}</small>
          </span>
          <span class="meta-count">${Number(pages.length).toLocaleString('en-US')} parsed</span>
        </summary>
        <div class="meta-body">
          <div class="meta-brief">
            <div>
              <b>Top domains</b>
              <p>${domains.map((domain) => `<span>${escapeHtml(domain)}</span>`).join('')}</p>
            </div>
            <div>
              <b>Title terms</b>
              <p>${titleWords.map((word) => `<span>${escapeHtml(word)}</span>`).join('') || '<span>no signal</span>'}</p>
            </div>
            <div>
              <b>H1 terms</b>
              <p>${h1Words.map((word) => `<span>${escapeHtml(word)}</span>`).join('') || '<span>no signal</span>'}</p>
            </div>
            <div>
              <b>Description terms</b>
              <p>${descWords.map((word) => `<span>${escapeHtml(word)}</span>`).join('') || '<span>no signal</span>'}</p>
            </div>
          </div>
          <div class="serp-examples">
            ${bestExamples.map((page) => `
              <article>
                <header>
                  <span>#${Number(page.position || 0).toLocaleString('en-US')}</span>
                  <a href="${escapeHtml(page.finalUrl || page.url)}">${escapeHtml(page.domain || page.url)}</a>
                </header>
                <h4>${escapeHtml(page.title || page.serpTitle || 'No title')}</h4>
                <p>${escapeHtml(page.h1 || 'No H1')}</p>
                <small>${escapeHtml(page.metaDescription || 'No meta description')}</small>
              </article>
            `).join('')}
          </div>
          <details class="raw-serp">
            <summary>Show all SERP metadata${blocked ? ` · ${blocked} blocked/JS pages` : ''}</summary>
            <table>
              <thead>
                <tr>
                  <th>Pos</th>
                  <th>URL</th>
                  <th>Meta title</th>
                  <th>H1</th>
                  <th>Meta description</th>
                </tr>
              </thead>
              <tbody>
                ${cluster.pages.map((page) => `
                  <tr>
                    <td>${Number(page.position || 0).toLocaleString('en-US')}</td>
                    <td><a href="${escapeHtml(page.finalUrl || page.url)}">${escapeHtml(page.domain || page.url)}</a></td>
                    <td>${escapeHtml(page.title || page.error || '')}</td>
                    <td>${escapeHtml(page.h1 || '')}</td>
                    <td>${escapeHtml(page.metaDescription || '')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </details>
        </div>
      </details>
    `;
  }).join('');

  return `<!-- competitor-meta:start -->
<style>
  .competitor-workbench { margin: 38px 0; }
  .competitor-head { display:flex; justify-content:space-between; gap:16px; align-items:end; margin-bottom:14px; }
  .competitor-head h2 { margin:0; }
  .competitor-head p { max-width:760px; margin:6px 0 0; }
  .competitor-grid { display:grid; gap:12px; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); }
  .meta-card { background:#fff; border:1px solid var(--line); border-radius:8px; box-shadow:0 1px 2px rgba(16,24,40,.04); overflow:hidden; }
  .meta-card > summary { list-style:none; display:flex; justify-content:space-between; gap:12px; cursor:pointer; padding:16px 18px; border-left:4px solid var(--brand); }
  .meta-card > summary::-webkit-details-marker { display:none; }
  .meta-card > summary strong { display:block; font-size:17px; }
  .meta-card > summary small { color:var(--muted); display:block; margin-top:4px; }
  .meta-count { align-self:start; white-space:nowrap; color:var(--brand); font-weight:760; font-size:13px; background:#ecfdf3; border:1px solid #abefc6; padding:5px 8px; border-radius:999px; }
  .meta-body { border-top:1px solid var(--line); padding:16px 18px 18px; }
  .meta-brief { display:grid; gap:10px; grid-template-columns:repeat(2, minmax(0, 1fr)); margin-bottom:14px; }
  .meta-brief div { background:#f8fafc; border:1px solid var(--line); border-radius:8px; padding:10px; }
  .meta-brief b { display:block; font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:#475467; margin-bottom:7px; }
  .meta-brief p { display:flex; flex-wrap:wrap; gap:6px; margin:0; }
  .meta-brief span { font-size:12px; color:#344054; background:#fff; border:1px solid var(--line); border-radius:999px; padding:4px 7px; }
  .serp-examples { display:grid; gap:10px; }
  .serp-examples article { border:1px solid var(--line); border-radius:8px; padding:12px; background:#fff; }
  .serp-examples header { display:flex; gap:8px; align-items:center; font-size:12px; color:var(--muted); margin-bottom:7px; }
  .serp-examples header span { font-weight:800; color:var(--accent); }
  .serp-examples h4 { margin:0 0 6px; font-size:15px; line-height:1.25; }
  .serp-examples p { margin:0 0 5px; color:#344054; font-weight:650; }
  .serp-examples small { color:var(--muted); line-height:1.35; display:block; }
  .raw-serp { margin-top:12px; }
  .raw-serp > summary { cursor:pointer; color:var(--muted); font-size:13px; }
  @media (max-width:760px) { .competitor-head { display:block; } .meta-brief { grid-template-columns:1fr; } }
</style>
<section class="competitor-workbench">
  <div class="competitor-head">
    <div>
      <h2>Competitor Metadata By Primary Keyword</h2>
      <p class="note">Compact SERP metadata by cluster. Open a card only when writing that page's title, H1, meta description, first screen, and comparison angle.</p>
    </div>
    <span class="pill">${Number(result.clusters.length || 0).toLocaleString('en-US')} clusters · ${Number(result.clusters.reduce((sum, cluster) => sum + cluster.pages.length, 0)).toLocaleString('en-US')} SERP pages</span>
  </div>
  <div class="competitor-grid">
    ${rows || '<div class="empty">No competitor metadata collected.</div>'}
  </div>
</section>
<!-- competitor-meta:end -->`;
}

function injectCompetitorMetaIntoReport(reportPath, result) {
  const html = fs.readFileSync(reportPath, 'utf8');
  const section = competitorMetaSectionHtml(result);
  const markerRegex = /<!-- competitor-meta:start -->[\s\S]*?<!-- competitor-meta:end -->/;
  const cleaned = html.replace(markerRegex, '').replace(/\n{3,}/g, '\n\n');
  const insertBefore = '<h2 id="validated-expansion">Validated Sitemap Expansion</h2>';
  if (cleaned.includes(insertBefore)) {
    fs.writeFileSync(reportPath, cleaned.replace(insertBefore, `${section}\n    ${insertBefore}`), 'utf8');
    return;
  }
  fs.writeFileSync(reportPath, cleaned.replace('<main>', `<main>\n${section}`), 'utf8');
}

async function collectPlanCompetitorMetadata() {
  const reportPath = resolvePlanPath(getArg('--report', getArg('--plan', getArg('--plan-file'))));
  if (!reportPath || !fs.existsSync(reportPath)) throw new Error(`HTML report not found: ${reportPath || '(empty)'}`);
  if (!reportPath.endsWith('.html')) throw new Error(`Competitor metadata needs an HTML report, got: ${reportPath}`);

  const configPath = expandHome(getArg('--config', DEFAULT_CONFIG));
  const config = readJson(configPath);
  const endpoint = config.endpoints?.sites?.url;
  if (!endpoint) throw new Error(`Missing endpoints.sites.url in ${configPath}`);

  const html = fs.readFileSync(reportPath, 'utf8');
  const allClusters = primaryClustersFromHtmlReport(html);
  const clusterLimit = Math.max(1, Math.min(100, Number(getArg('--cluster-limit', allClusters.length)) || allClusters.length));
  const keywordOffset = Math.max(0, Math.min(1000, Number(getArg('--keyword-offset', 0)) || 0));
  const clusters = allClusters.slice(keywordOffset, keywordOffset + clusterLimit);
  if (clusters.length === 0) throw new Error(`No primary clusters found in ${reportPath}`);

  const market = getArg('--market', 'US');
  const language = getArg('--language', 'en-US');
  const top = Math.max(1, Math.min(10, Number(getArg('--top', 10)) || 10));
  const timeoutMs = Math.max(3000, Number(getArg('--timeout-ms', 20000)) || 20000);
  const serpDelayMs = Math.max(0, Number(getArg('--serp-delay-ms', 500)) || 0);
  const fetchDelayMs = Math.max(0, Number(getArg('--fetch-delay-ms', 250)) || 0);
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${slugify(path.basename(reportPath, '.html'))}-meta`;
  const outputDir = path.join(OUTPUT_DIR, runId);
  fs.mkdirSync(outputDir, { recursive: true });

  const result = {
    ok: true,
    mode: 'plan-competitor-meta',
    reportPath,
    outputDir,
    endpoint,
    market,
    language,
    top,
    generatedAt: new Date().toISOString(),
    clusters: [],
  };

  for (let index = 0; index < clusters.length; index += 1) {
    const cluster = clusters[index];
    console.error(`[serp-meta] ${index + 1}/${clusters.length}: ${cluster.primaryKeyword}`);
    const clusterDir = path.join(outputDir, `${String(index + 1).padStart(2, '0')}-${slugify(cluster.primaryKeyword)}`);
    fs.mkdirSync(clusterDir, { recursive: true });
    const serp = await postJson(endpoint, { market, language, keyword: cluster.primaryKeyword }, config.endpoints.sites.headers || {});
    fs.writeFileSync(path.join(clusterDir, 'serp-response.json'), JSON.stringify(serp, null, 2));
    const sites = (Array.isArray(serp.sites) ? serp.sites : []).slice(0, top);
    const pages = [];

    for (const site of sites) {
      if (!site.url) continue;
      try {
        const page = await fetchCompetitorMetaPage(site.url, timeoutMs);
        pages.push({
          position: site.position,
          url: site.url,
          domain: site.domain || domainFromUrl(site.url),
          serpTitle: site.title || '',
          status: page.status,
          fetched: page.fetched,
          finalUrl: page.finalUrl,
          htmlPath: page.htmlPath,
          title: page.meta?.title || '',
          h1: page.meta?.h1 || '',
          metaDescription: page.meta?.metaDescription || '',
          canonical: page.meta?.canonical || '',
          wordCount: page.meta?.wordCount || 0,
          fromCache: page.fromCache,
        });
      } catch (error) {
        pages.push({
          position: site.position,
          url: site.url,
          domain: site.domain || domainFromUrl(site.url),
          serpTitle: site.title || '',
          error: error.message,
        });
      }
      if (fetchDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, fetchDelayMs));
    }

    const clusterResult = { ...cluster, pages };
    fs.writeFileSync(path.join(clusterDir, 'metadata.json'), JSON.stringify(clusterResult, null, 2));
    result.clusters.push(clusterResult);
    if (serpDelayMs > 0 && index < clusters.length - 1) await new Promise((resolve) => setTimeout(resolve, serpDelayMs));
  }

  fs.writeFileSync(path.join(outputDir, 'competitor-metadata.json'), JSON.stringify(result, null, 2));
  injectCompetitorMetaIntoReport(reportPath, result);

  console.log(JSON.stringify({
    ok: true,
    mode: 'plan-competitor-meta',
    reportPath,
    outputDir,
    clusters: result.clusters.length,
    pages: result.clusters.reduce((sum, item) => sum + item.pages.length, 0),
    injected: true,
  }, null, 2));
}

async function competitors() {
  await collectSerp();
  await fetchCompetitorPages();
}

function help() {
  console.log(`Usage:
  npm run serp:collect -- --keyword "online pokies chooser" --market US --language en-US --top 10
  npm run serp:collect -- --plan online-pokies-au-affiliate-seed-plan.json --market AU --language en-AU --keyword-limit 10 --top 10
  npm run serp:fetch -- --run-dir /path/to/run --limit 100
  npm run serp:sitemaps -- --run-dir /path/to/run --limit 100
  npm run serp:plan-expand -- --run-dir /path/to/run --plan online-pokies-au-affiliate-seed-plan.json
  npm run serp:plan-validate-expansion -- --run-dir /path/to/run --plan online-pokies-au-affiliate-seed-plan.json --country au --language en-AU
  npm run serp:plan-competitor-meta -- --report bing-keyword-plan-online-pokies-au.html --market AU --language en-AU --top 10

Output:
  ${OUTPUT_DIR}

Config:
  ${DEFAULT_CONFIG}`);
}

async function main() {
  if (command === 'help' || hasArg('--help')) return help();
  if (command === 'competitors') return competitors();
  if (command === 'collect') return collectSerp();
  if (command === 'fetch') return fetchCompetitorPages();
  if (command === 'sitemaps') return expandFromSitemaps();
  if (command === 'plan-expand') return expandSeedPlanFromSitemaps();
  if (command === 'plan-validate-expansion') return validateSitemapExpansionWithBing();
  if (command === 'plan-competitor-meta') return collectPlanCompetitorMetadata();
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`[serp-competitors] ${error.message}`);
  process.exit(1);
});
