import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_CONFIG = path.join(os.homedir(), 'credentials', 'bing-webmaster.json');
const API_BASE = 'https://ssl.bing.com/webmaster/api.svc/json';
const DEFAULT_STORAGE_DIR = path.join(os.homedir(), 'credentials', 'astro-blank', 'bing');
const DEFAULT_CACHE_DIR = path.join(DEFAULT_STORAGE_DIR, 'cache');
const DEFAULT_PLANS_DIR = path.join(DEFAULT_STORAGE_DIR, 'plans');

const argv = process.argv.slice(2);
const command = argv.find((item) => !item.startsWith('-')) || 'help';

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'best',
  'by',
  'can',
  'for',
  'from',
  'help',
  'how',
  'i',
  'in',
  'is',
  'me',
  'my',
  'of',
  'on',
  'or',
  'the',
  'to',
  'top',
  'what',
  'with',
  'you',
  'your',
]);

const INTENT_MODIFIERS = new Set([
  'best',
  'buy',
  'cheap',
  'custom',
  'do',
  'for',
  'hire',
  'login',
  'order',
  'professional',
  'service',
  'services',
  'write',
  'writer',
  'writing',
]);

const NOISE_PATTERNS = [
  /^\s*google\s*$/i,
  /\bgoogle\s+scholar\b/i,
  /\bgoogle\b/i,
  /\bscholar\b/i,
  /\byoutube\b/i,
  /\breddit\b/i,
  /\bwikipedia\b/i,
  /\blog\s?in\b/i,
  /\blogin\b/i,
  /\bsign\s?in\b/i,
  /\bessay\s?pro\b/i,
  /\bessaypro\b/i,
  /\bpaper\s?owl\b/i,
  /\beditpad\b/i,
  /\bgrammarly\b/i,
  /\bchegg\b/i,
  /\bcourse\s?hero\b/i,
  /\bpest\s+control\b/i,
  /\bscreenshot\b/i,
  /\bheadphones?\b/i,
  /\bairpods?\b/i,
  /\bfarts?\b/i,
  /\blegs?\b/i,
  /\bfeet\b/i,
  /\bankles?\b/i,
  /\beyes?\b/i,
  /\bears?\b/i,
  /\bfingernails?\b/i,
  /\bballs?\b/i,
  /\bwife\b/i,
];

const AFFILIATE_WASTE_TERMS = new Set(['free', 'torrent', 'crack', 'nulled', 'coupon', 'promo']);

const getArg = (name, fallback = '') => {
  const eq = argv.find((item) => item.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const hasArg = (name) => argv.includes(name);

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function numberArg(name, fallback) {
  const value = Number(getArg(name, fallback));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function boundedNumberArg(name, fallback, min, max) {
  return Math.max(min, Math.min(max, numberArg(name, fallback)));
}

function normalizeKeyword(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function slugify(value) {
  return normalizeKeyword(value)
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function stemToken(token) {
  const normalized = normalizeKeyword(token).replace(/[^a-z0-9]/g, '');
  const aliases = {
    papers: 'paper',
    services: 'service',
    writers: 'writer',
    writing: 'write',
    writes: 'write',
    wrote: 'write',
    essays: 'essay',
    topics: 'topic',
    formats: 'format',
    examples: 'example',
    checkers: 'checker',
    detectors: 'detector',
    generators: 'generator',
    graders: 'grader',
  };
  return aliases[normalized] || normalized;
}

function keywordTokens(keyword) {
  return normalizeKeyword(keyword)
    .split(/\s+/)
    .map(stemToken)
    .filter(Boolean);
}

function uniqueItems(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = normalizeKeyword(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function readJsonFile(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Seed plan file not found: ${resolved}`);
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function expandHomePath(filePath) {
  return filePath.startsWith('~/') ? path.join(os.homedir(), filePath.slice(2)) : filePath;
}

function resolvePlanPath(filePath) {
  if (!filePath) return '';
  const basenamePlanPath = path.join(DEFAULT_PLANS_DIR, path.basename(filePath));
  if (!path.isAbsolute(filePath) && (filePath === path.basename(filePath) || filePath.startsWith(`reports${path.sep}`) || filePath.startsWith('reports/')) && fs.existsSync(basenamePlanPath)) {
    return basenamePlanPath;
  }

  const expanded = expandHomePath(filePath);
  const directPath = path.resolve(expanded);
  if (fs.existsSync(directPath)) return directPath;

  if (fs.existsSync(basenamePlanPath)) return basenamePlanPath;

  return directPath;
}

function resolveOutputPath(outputArg, topic) {
  if (!outputArg) {
    return path.join(DEFAULT_PLANS_DIR, `bing-keyword-plan-${slugify(topic) || 'report'}.html`);
  }

  const expanded = expandHomePath(outputArg);
  if (!path.isAbsolute(expanded) && (expanded === path.basename(expanded) || expanded.startsWith(`reports${path.sep}`) || expanded.startsWith('reports/'))) {
    return path.join(DEFAULT_PLANS_DIR, path.basename(expanded));
  }

  if (path.isAbsolute(expanded) || expanded.includes(path.sep)) return path.resolve(expanded);
  return path.join(DEFAULT_PLANS_DIR, expanded);
}

function describeStoredPlan(filePath) {
  const stats = fs.statSync(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const file = path.basename(filePath);
  const base = file.replace(/\.(json|html)$/i, '');
  let kind = extension === '.json' ? 'seed-plan' : 'html-report';
  let topic = base
    .replace(/^bing-keyword-plan-/i, '')
    .replace(/-seed-plan$/i, '')
    .replace(/-/g, ' ');

  if (extension === '.json') {
    try {
      const plan = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      kind = plan.siteModel ? `${kind}:${plan.siteModel}` : kind;
      topic = plan.name || plan.topic || asArray(plan.seeds)[0] || topic;
    } catch {
      kind = `${kind}:invalid-json`;
    }
  }

  return {
    file,
    kind,
    topic,
    modified: stats.mtime.toISOString(),
    bytes: stats.size,
    path: filePath,
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stableJson(value) {
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sleep(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function isRetryableBingError(status, data) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data ?? {});
  return status === 429 || [502, 503, 504].includes(status) || /ThrottleUser|throttl|rate.?limit/i.test(payload);
}

function isRetryableNetworkError(error) {
  return error?.name === 'AbortError' || /fetch failed|network|socket|timeout|econnreset|etimedout/i.test(error?.message || '');
}

function retryAfterMs(response) {
  const raw = response?.headers?.get?.('retry-after');
  if (!raw) return 0;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 600000);

  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.max(0, Math.min(date - Date.now(), 600000));

  return 0;
}

function retryDelayFor(response, data, attempt) {
  const headerDelay = retryAfterMs(response);
  if (headerDelay > 0) return headerDelay;

  const status = response?.status || 0;
  const payload = typeof data === 'string' ? data : JSON.stringify(data ?? {});
  const throttle = status === 429 || /ThrottleUser|throttl|rate.?limit/i.test(payload);
  const baseDelay = throttle
    ? boundedNumberArg('--throttle-delay-ms', 60000, 0, 600000)
    : boundedNumberArg('--retry-delay-ms', 10000, 0, 300000);
  return Math.min(baseDelay * Math.max(1, attempt), 600000);
}

async function fetchJsonWithTimeout(url, options = {}) {
  const timeoutMs = boundedNumberArg('--request-timeout-ms', 30000, 1000, 120000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const text = await response.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {}
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}

function keywordRow(row, source) {
  const query = row.Query || row.query || '';
  return {
    query,
    impressions: Number(row.Impressions ?? row.impressions ?? 0),
    broadImpressions: Number(row.BroadImpressions ?? row.broadImpressions ?? 0),
    source,
  };
}

function isNoiseKeyword(query, seeds = []) {
  const text = normalizeKeyword(query);
  if (!text) return true;
  if (seeds.some((seed) => normalizeKeyword(seed) === text)) return false;
  return NOISE_PATTERNS.some((pattern) => pattern.test(text));
}

function seedPlanRejectReason(query, seedPlan = {}) {
  const text = normalizeKeyword(query);
  if (!text) return 'empty';
  const protectedSeeds = new Set([
    ...asArray(seedPlan.seeds).map(normalizeKeyword),
    ...asArray(seedPlan.gameTitles).map(normalizeKeyword),
  ]);
  if (protectedSeeds.has(text)) return '';
  if (NOISE_PATTERNS.some((pattern) => pattern.test(text))) return 'brand-or-unrelated-noise';
  const rejectExact = new Set(asArray(seedPlan.rejectExact).map(normalizeKeyword));
  if (rejectExact.has(text)) return 'seed-plan-reject-exact';
  if (asArray(seedPlan.rejectPhrases).some((term) => text.includes(normalizeKeyword(term)))) return 'seed-plan-reject-phrase';

  const tokens = new Set(keywordTokens(text));
  const allowedFreeIntent = asArray(seedPlan.allowFreeTerms).some((term) => text.includes(normalizeKeyword(term)));
  if (seedPlan.siteModel === 'affiliate' && [...tokens].some((token) => AFFILIATE_WASTE_TERMS.has(token)) && !allowedFreeIntent) {
    return 'free-or-nonbuyer-intent';
  }

  const rejectTerms = new Set(asArray(seedPlan.rejectTerms).map(stemToken));
  if ([...tokens].some((token) => rejectTerms.has(token) && !(token === 'free' && allowedFreeIntent))) return 'seed-plan-reject-term';

  const requiredTerms = new Set(asArray(seedPlan.requiredTerms).map(stemToken));
  if (requiredTerms.size > 0 && ![...tokens].some((token) => requiredTerms.has(token))) return 'not-in-niche';

  const buyerTerms = new Set(asArray(seedPlan.buyerModifiers).map(stemToken));
  const hasBuyerIntent = [...tokens].some((token) => buyerTerms.has(token)) || text.includes('for me') || text.includes('do my') || text.includes('write my');
  if (seedPlan.siteModel === 'affiliate' && tokens.has('ai') && !hasBuyerIntent) return 'ai-tool-without-buyer-intent';

  if (seedPlan.siteModel === 'affiliate' && seedPlan.strictBuyerIntent && !hasBuyerIntent) return 'no-buyer-intent';
  return '';
}

function rejectReason(query, seeds = [], siteType = 'affiliate', seedPlan = null) {
  if (seedPlan) return seedPlanRejectReason(query, seedPlan);
  return isNoiseKeyword(query, seeds) ? 'noise' : '';
}

function loadSeedPlan() {
  const seedPlanPath = getArg('--seed-plan-file', getArg('--seed-file'));
  if (!seedPlanPath) return null;
  const plan = readJsonFile(resolvePlanPath(seedPlanPath));
  return {
    siteModel: plan.siteModel || 'auto',
    strictBuyerIntent: Boolean(plan.strictBuyerIntent),
    mainCluster: plan.mainCluster || null,
    seeds: asArray(plan.seeds),
    gameTitles: asArray(plan.gameTitles),
    requiredTerms: asArray(plan.requiredTerms),
    rejectTerms: asArray(plan.rejectTerms),
    rejectExact: asArray(plan.rejectExact),
    rejectPhrases: asArray(plan.rejectPhrases),
    allowFreeTerms: asArray(plan.allowFreeTerms),
    buyerModifiers: asArray(plan.buyerModifiers),
    clusterRules: asArray(plan.clusterRules),
    validatedSitemapExpansion: plan.validatedSitemapExpansion || null,
  };
}

function buildSeedPlan(seeds, seedPlan = null) {
  const planned = [...seeds];
  if (seedPlan) planned.push(...asArray(seedPlan.seeds));

  const countryHints = uniqueItems([
    ...seeds.flatMap((seed) => seed.match(/\b(canada|canadian|australia|australian|uk|usa|us|new zealand|nz)\b/gi) || []),
    ...asArray(seedPlan?.countryHints),
  ]).map(normalizeKeyword).filter(Boolean);

  for (const title of asArray(seedPlan?.gameTitles)) {
    const cleanTitle = normalizeKeyword(title);
    if (!cleanTitle) continue;
    planned.push(
      cleanTitle,
      `${cleanTitle} online`,
      `${cleanTitle} casino`,
      `${cleanTitle} online casino`,
      `${cleanTitle} review`,
      `${cleanTitle} bonus`,
      `${cleanTitle} real money`,
      `play ${cleanTitle}`,
      `best ${cleanTitle} casinos`
    );
    for (const country of countryHints) {
      planned.push(
        `${cleanTitle} ${country}`,
        `${cleanTitle} online ${country}`,
        `${cleanTitle} casino ${country}`,
        `${cleanTitle} online casino ${country}`,
        `${cleanTitle} bonus ${country}`,
        `${cleanTitle} real money ${country}`
      );
    }
  }

  for (const seed of seeds) {
    planned.push(
      `best ${seed}`,
      `${seed} service`,
      `${seed} services`,
      `${seed} help`,
      `${seed} online`,
      `${seed} cost`,
      `${seed} pricing`
    );
  }

  return uniqueItems(planned).slice(0, Math.max(1, Math.min(200, numberArg('--seed-limit', 80))));
}

function protectedQueriesForResearch(research) {
  return uniqueItems([
    ...(research.requestedSeeds || []),
    ...asArray(research.seedPlan?.seeds),
    ...asArray(research.seedPlan?.gameTitles),
  ]);
}

function rankKeywords(rows, limit, protectedQueries = []) {
  const byQuery = new Map();
  const protectedSet = new Set(protectedQueries.map(normalizeKeyword).filter(Boolean));

  for (const row of rows) {
    const queryKey = normalizeKeyword(row.query);
    if (!queryKey) continue;

    const current = byQuery.get(queryKey) || {
      query: row.query,
      impressions: 0,
      broadImpressions: 0,
      sources: [],
    };

    current.impressions = Math.max(current.impressions, row.impressions || 0);
    current.broadImpressions = Math.max(current.broadImpressions, row.broadImpressions || 0);
    if (row.source && !current.sources.includes(row.source)) current.sources.push(row.source);
    byQuery.set(queryKey, current);
  }

  const sorted = Array.from(byQuery.values())
    .sort((a, b) => (b.impressions - a.impressions) || (b.broadImpressions - a.broadImpressions) || a.query.localeCompare(b.query));
  const selected = sorted.slice(0, limit);
  const selectedKeys = new Set(selected.map((row) => normalizeKeyword(row.query)));

  for (const row of sorted) {
    const key = normalizeKeyword(row.query);
    if (protectedSet.has(key) && !selectedKeys.has(key)) {
      selected.push(row);
      selectedKeys.add(key);
    }
  }

  return selected;
}

function scoreKeyword(row) {
  return (row.impressions || 0) + Math.round((row.broadImpressions || 0) * 0.25);
}

function classifyIntent(query) {
  const text = normalizeKeyword(query);
  const tokens = new Set(keywordTokens(text));
  const gamblingTerms = ['bet', 'betting', 'bonus', 'casino', 'casinos', 'gambling', 'jackpot', 'odds', 'poker', 'slot', 'slots', 'sportsbook', 'sportsbooks'];
  const commercialModifiers = ['best', 'bonus', 'fast', 'instant', 'legal', 'licensed', 'new', 'real', 'review', 'reviews', 'safe', 'safest', 'top', 'trusted'];
  const whiteningTerms = ['bleaching', 'gel', 'kit', 'kits', 'mouthwash', 'pen', 'stain', 'stains', 'strip', 'strips', 'toothpaste', 'whiten', 'whitening'];

  if (text.includes('login') || text.includes('log in')) return 'navigational';
  if (tokens.has('linkedin') && (tokens.has('job') || tokens.has('jobs') || tokens.has('career') || tokens.has('careers'))) return 'navigational';
  if ((tokens.has('skill') || tokens.has('skills')) && (tokens.has('resume') || tokens.has('resumes'))) return 'informational';
  if ((tokens.has('resume') || tokens.has('resumes')) && ['reference', 'references', 'layout', 'outline'].some((token) => tokens.has(token))) return 'informational';
  if ((tokens.has('resume') || tokens.has('resumes')) && tokens.has('cover') && tokens.has('letter') && !['service', 'services', 'writer', 'writers', 'writing'].some((token) => tokens.has(token))) return 'informational';
  if (whiteningTerms.some((token) => tokens.has(token)) && (tokens.has('teeth') || tokens.has('tooth') || tokens.has('dental') || tokens.has('dentist') || tokens.has('crest') || tokens.has('zoom') || tokens.has('opalescence') || text.includes('white strips'))) {
    return ['best', 'cost', 'dentist', 'kit', 'near', 'professional', 'strips', 'strip', 'products', 'toothpaste', 'gel', 'pen', 'led', 'zoom'].some((token) => tokens.has(token)) || text.includes('teeth whitening')
      ? 'transactional'
      : 'commercial';
  }
  if (text.startsWith('how ') || text.startsWith('what ') || ['topic', 'format', 'example', 'guide', 'mla', 'apa', 'argumentative'].some((token) => tokens.has(token))) {
    return 'informational';
  }
  if ((tokens.has('resume') || tokens.has('resumes')) && ['create', 'make', 'build'].some((token) => tokens.has(token))) return 'tool';
  if (['builder', 'checker', 'creator', 'detector', 'grader', 'generator', 'maker', 'tool'].some((token) => tokens.has(token))) return 'tool';
  if (text.includes('write my') || text.includes('do my') || text.includes('for me') || text.includes('homework help') || text.includes('assignment help') || ['service', 'cheap', 'buy', 'order', 'hire', 'professional', 'custom'].some((token) => tokens.has(token))) {
    return 'transactional';
  }
  if (gamblingTerms.some((token) => tokens.has(token)) && (tokens.has('online') || tokens.has('canada') || tokens.has('canadian') || tokens.has('money') || tokens.has('site') || tokens.has('sites'))) return 'transactional';
  if (gamblingTerms.some((token) => tokens.has(token)) && commercialModifiers.some((token) => tokens.has(token))) return 'commercial';
  if (['writer', 'write', 'paper', 'essay'].some((token) => tokens.has(token))) return 'commercial';
  return 'mixed';
}

function topicLabel(query, seedPlan = null) {
  const text = normalizeKeyword(query);
  const tokens = new Set(keywordTokens(text));

  if (tokens.has('resume') || tokens.has('resumes')) {
    if (text.startsWith('how to write')) return 'How to write a resume';
    if (text.startsWith('how to make')) return 'How to make a resume';
    if (text.startsWith('how to create')) return 'How to create a resume';
    if (text.startsWith('how to build')) return 'How to build a resume';
    if ((tokens.has('skill') || tokens.has('skills')) && ['put', 'list', 'include', 'add'].some((token) => tokens.has(token))) return 'Resume skills guide';
    if (tokens.has('references') || tokens.has('reference')) return 'Resume references guide';
    if (tokens.has('layout')) return 'Resume layout guide';
    if (tokens.has('outline')) return 'Resume outline guide';
    if (tokens.has('linkedin') && (tokens.has('job') || tokens.has('jobs') || tokens.has('career') || tokens.has('careers'))) return 'LinkedIn jobs';
  }

  for (const rule of asArray(seedPlan?.clusterRules)) {
    const label = String(rule.label || '').trim();
    if (!label) continue;
    const pattern = rule.match ? new RegExp(rule.match, 'i') : null;
    const terms = asArray(rule.terms).map(stemToken);
    if ((pattern && pattern.test(text)) || (terms.length > 0 && terms.some((term) => tokens.has(term)))) {
      return label;
    }
  }

  if (text.includes('login') || text.includes('log in')) return 'Account and login queries';
  if (tokens.has('resume') || tokens.has('resumes')) {
    if (text.startsWith('how to write')) return 'How to write a resume';
    if (text.startsWith('how to make')) return 'How to make a resume';
    if (text.startsWith('how to create')) return 'How to create a resume';
    if (text.startsWith('how to build')) return 'How to build a resume';
    if (text.startsWith('what is') || text.includes('look like')) return 'Resume basics guide';
    if (tokens.has('professional') || tokens.has('certified') || tokens.has('expert') || tokens.has('experts')) return 'Resume writing service';
  }
  if (tokens.has('cover') && tokens.has('letter')) {
    if (text.startsWith('how to write') || text.startsWith('how to make') || text.startsWith('how long') || text.startsWith('what is')) return 'Cover letter guide';
    if (tokens.has('generator')) return 'Cover letter generator';
    if (tokens.has('resume')) return 'Resume and cover letter';
    if (tokens.has('writer') || tokens.has('writing') || tokens.has('service')) return 'Cover letter writing service';
    return 'Cover letter guide';
  }
  if (tokens.has('resume') || tokens.has('resumes')) {
    if (tokens.has('checker') || tokens.has('ats')) return 'ATS resume checker';
    if (tokens.has('builder') || tokens.has('maker') || tokens.has('creator')) return 'Resume builder';
    if (tokens.has('skill') || tokens.has('skills')) return 'Resume skills guide';
    if (tokens.has('cover') && tokens.has('letter')) return 'Resume and cover letter';
    if (tokens.has('help') || tokens.has('service') || tokens.has('services') || tokens.has('writer') || tokens.has('writers') || tokens.has('writing')) return 'Resume writing service';
  }
  if (tokens.has('linkedin') && (tokens.has('profile') || tokens.has('writing') || tokens.has('optimization'))) return 'LinkedIn profile writing service';
  if (tokens.has('cv')) {
    if (tokens.has('axle') || tokens.has('linens')) return 'Unrelated CV query';
    if (tokens.has('writing') || tokens.has('writer') || tokens.has('service')) return 'CV writing service';
    return 'CV and resume guide';
  }
  if (isEssayKeyword(text)) {
    if (text.startsWith('how to write')) return 'How to write an essay';
    if (tokens.has('format') || tokens.has('mla') || tokens.has('apa')) return tokens.has('paper') ? 'Paper format guides' : 'Essay format guides';
    if (tokens.has('topic') || tokens.has('argumentative')) return 'Essay topics';
    if (tokens.has('checker') || tokens.has('detector')) return 'Essay checker and AI detector';
    if (tokens.has('grader')) return 'Essay grader';
    if (tokens.has('generator')) return 'Essay generator';
  }
  if (tokens.has('slot') || tokens.has('slots')) return tokens.has('canada') || tokens.has('canadian') ? 'Online slots Canada' : 'Online slots';
  if (tokens.has('casino') || tokens.has('casinos')) {
    if (tokens.has('best') || tokens.has('top')) return tokens.has('canada') || tokens.has('canadian') ? 'Best online casinos Canada' : 'Best online casinos';
    return tokens.has('canada') || tokens.has('canadian') ? 'Online casinos Canada' : 'Online casinos';
  }
  if (tokens.has('gambling')) return tokens.has('canada') || tokens.has('canadian') ? 'Online gambling Canada' : 'Online gambling';

  if (isEssayKeyword(text) || tokens.has('paper') || tokens.has('homework') || tokens.has('assignment')) {
    if (tokens.has('law')) return 'Law essay writing service';
    if (tokens.has('nursing')) return 'Nursing essay writing service';
    if (tokens.has('mba')) return 'MBA essay writing service';
    if (tokens.has('business')) return 'Business essay writing service';
    if (tokens.has('psychology')) return 'Psychology essay writing service';
    if (tokens.has('history')) return 'History essay writing service';
    if (tokens.has('english')) return 'English essay writing service';
    if (tokens.has('philosophy')) return 'Philosophy essay writing service';
    if (tokens.has('economics')) return 'Economics essay writing service';
    if (tokens.has('admission')) return 'Admission essay writing service';
    if (tokens.has('scholarship')) return 'Scholarship essay writing service';
    if (tokens.has('cheap') || tokens.has('affordable')) return 'Cheap essay writing service';
    if (tokens.has('best')) return 'Best essay writing services';
    if (tokens.has('buy') || tokens.has('pay') || tokens.has('order')) return 'Buy essay online';
    if (tokens.has('hire')) return 'Hire essay writer';
    if (tokens.has('dissertation')) return 'Dissertation writing service';
    if (tokens.has('thesis')) return 'Thesis writing service';
    if (tokens.has('coursework')) return 'Coursework writing service';
    if (text.includes('homework') || text.includes('assignment')) return 'Homework and assignment help';
    if (text.includes('research paper')) return 'Research paper writing';
    if (text.includes('college paper')) return 'College paper writing service';
    if (text.includes('college essay')) return 'College essay help';
    if (tokens.has('paper')) return 'Paper writing service';
    if (text.includes('write my') || text.includes('do my') || text.includes('for me')) return 'Write my essay service';
    if (tokens.has('writer') || tokens.has('write') || tokens.has('service')) return 'Essay writing service';
  }

  const core = keywordTokens(query)
    .filter((token) => !STOP_WORDS.has(token) && !INTENT_MODIFIERS.has(token))
    .slice(0, 3);
  return core.length > 0 ? core.map((token) => token[0].toUpperCase() + token.slice(1)).join(' ') : 'General topic';
}

function pageTypeForIntent(intent) {
  if (intent === 'transactional') return 'money-page';
  if (intent === 'commercial') return 'commercial-support';
  if (intent === 'tool') return 'tool-funnel-page';
  if (intent === 'informational') return 'supporting-funnel-page';
  if (intent === 'navigational') return 'exclude-or-brand-defense';
  return 'exclude-or-review';
}

const DISTINCT_SERVICE_TERMS = new Set([
  'admission',
  'assignment',
  'business',
  'college',
  'coursework',
  'dissertation',
  'economics',
  'english',
  'history',
  'homework',
  'law',
  'mba',
  'nursing',
  'paper',
  'philosophy',
  'psychology',
  'research',
  'scholarship',
  'thesis',
]);

function isEssayKeyword(query) {
  const text = normalizeKeyword(query);
  const tokens = new Set(keywordTokens(text));
  return tokens.has('essay') || tokens.has('essays') || (tokens.has('paper') && (tokens.has('write') || tokens.has('writer') || tokens.has('writing')));
}

function isGenericMainMoneyKeyword(query, protectedSet, seedPlan = null) {
  if (seedPlan?.siteModel && seedPlan.siteModel !== 'affiliate-essay' && !isEssayKeyword(query)) return false;
  const text = normalizeKeyword(query);
  if (protectedSet.has(text) && isEssayKeyword(text)) return true;
  const tokens = new Set(keywordTokens(text));
  if (!isEssayKeyword(text) || ![...tokens].some((token) => ['essay', 'write', 'writer', 'service', 'help'].includes(token))) return false;
  return ![...tokens].some((token) => DISTINCT_SERVICE_TERMS.has(token));
}

function choosePrimaryKeyword(ranked, intent, protectedSet = new Set()) {
  const seedExact = ranked.find((row) => row.sources?.includes('seed-exact'));
  if (seedExact && ['transactional', 'commercial', 'mixed'].includes(intent)) return seedExact;
  const protectedSeed = ranked.find((row) => protectedSet.has(normalizeKeyword(row.query)));
  if (protectedSeed && ['transactional', 'commercial', 'mixed'].includes(intent)) return protectedSeed;
  return ranked[0];
}

function conversionHypotheses(intent, label) {
  if (intent === 'transactional') {
    return [
      'Lead with a clear commercial offer, strongest trust signals, comparison criteria, and one primary conversion action.',
      'Handle objections around legality, safety, payment methods, withdrawals, reputation, and user fit on the same page.',
    ];
  }
  if (intent === 'commercial') {
    return [
      'Position the page as a comparison-ready service page with trust proof and a low-friction quote/order CTA.',
      'Use internal links to the main transactional page instead of creating a competing money page.',
    ];
  }
  if (intent === 'tool') {
    return [
      `Use "${label}" as a utility-led funnel entry point, then route users to the closest commercial offer.`,
      'Keep the CTA contextual to the visitor problem instead of creating a competing money page.',
    ];
  }
  if (intent === 'informational') {
    return [
      'Answer the immediate question, then bridge to the service through a natural next step.',
      'Use this page to capture early-stage demand without competing with the main money page.',
    ];
  }
  if (intent === 'navigational') {
    return [
      'Treat competitor/login keywords carefully; do not create misleading pages around another brand.',
      'Use only if there is a legitimate comparison or alternative page angle.',
    ];
  }
  return [
    'Clarify visitor intent before assigning the page type.',
    'Use internal links to route commercial visitors toward the main offer.',
  ];
}

function marketLabelForSeedPlan(seedPlan = null) {
  const text = normalizeKeyword([
    seedPlan?.mainCluster?.reason || '',
    ...asArray(seedPlan?.mainCluster?.labels),
    ...asArray(seedPlan?.seeds),
    ...asArray(seedPlan?.buyerModifiers),
  ].join(' '));

  if (text.includes('new zealand') || /\bnz\b/.test(text)) return 'New Zealand';
  if (text.includes('canada') || text.includes('canadian') || text.includes('ontario')) return 'Canada';
  return '';
}

function withMarket(label, marketLabel) {
  return marketLabel ? `${label} ${marketLabel}` : label;
}

function mergeTargetForCluster(cluster, seedPlan = null) {
  const text = normalizeKeyword(`${cluster.cluster} ${cluster.primaryKeyword}`);
  const tokens = new Set(keywordTokens(text));
  const market = marketLabelForSeedPlan(seedPlan);

  if (tokens.has('sportsbook') || tokens.has('sportsbooks') || (tokens.has('sports') && tokens.has('betting'))) return market === 'Canada' ? 'Canadian sports betting sites' : withMarket('Sports betting sites', market);
  if (tokens.has('bonus') || tokens.has('bonuses') || tokens.has('spins')) return withMarket('Casino bonuses', market);
  if (tokens.has('withdrawal') || tokens.has('withdraw') || tokens.has('payout') || tokens.has('cashout')) return withMarket('Fast withdrawal casinos', market);
  if (tokens.has('poli') || text.includes('bank transfer')) return withMarket('POLi casinos', market);
  if (tokens.has('interac') || tokens.has('paypal') || tokens.has('visa') || tokens.has('crypto') || text.includes('e-transfer')) return withMarket('Payment method casinos', market);
  if (tokens.has('ontario')) return 'Ontario online casinos';
  if (tokens.has('poker')) return withMarket('Poker sites', market);
  if (tokens.has('pokie') || tokens.has('pokies')) return market ? `Online pokies ${market === 'New Zealand' ? 'NZ' : market}` : 'Online pokies';
  if (tokens.has('slot') || tokens.has('slots') || tokens.has('jackpot')) return withMarket('Online slots', market);
  if (tokens.has('casino') || tokens.has('casinos')) return withMarket('Online casinos', market);
  if (tokens.has('gambling')) return withMarket('Online gambling', market);
  return 'Main page';
}

function shouldMergeCluster(cluster, mainCluster = null) {
  if (!cluster) return false;
  if (mainCluster && cluster.cluster === mainCluster.cluster && cluster.intent === mainCluster.intent) return false;
  const isWeak = cluster.totalImpressions < 50 || (cluster.keywords.length <= 1 && cluster.totalImpressions < 100);
  if (!isWeak) return false;
  if (cluster.keywords.some((row) => row.sources?.includes('seed-exact')) && cluster.totalImpressions >= 25) return false;
  return true;
}

function isLikelyBrandCluster(cluster) {
  const genericTokens = new Set([
    'app', 'apps', 'best', 'bet', 'betting', 'bonus', 'bonuses', 'canada', 'canadian', 'casino', 'casinos',
    'fast', 'gambling', 'interac', 'jackpot', 'legal', 'licensed', 'mobile', 'money', 'new', 'online',
    'poker', 'real', 'review', 'reviews', 'safe', 'safest', 'site', 'sites', 'slot', 'slots', 'sports',
    'sportsbook', 'sportsbooks', 'top', 'trusted', 'withdrawal',
  ]);
  const tokens = keywordTokens(`${cluster?.cluster || ''} ${cluster?.primaryKeyword || ''}`);
  const hasUnknownToken = tokens.some((token) => !genericTokens.has(token));
  const hasSeedExact = cluster?.keywords?.some((row) => row.sources?.includes('seed-exact'));
  return hasUnknownToken && !hasSeedExact;
}

function chooseMainCluster(allClusters, protectedSet, seedPlan = null) {
  const commercialClusters = allClusters.filter((cluster) => ['transactional', 'commercial', 'mixed'].includes(cluster.intent));
  const preferredMain = seedPlan?.mainCluster;
  if (preferredMain) {
    const preferredLabel = normalizeKeyword(preferredMain.label || preferredMain);
    const preferredLabels = new Set(asArray(preferredMain.labels).map(normalizeKeyword).filter(Boolean));
    const preferredKeyword = normalizeKeyword(preferredMain.primaryKeyword || preferredMain.keyword || '');
    const preferredPattern = preferredMain.match ? new RegExp(preferredMain.match, 'i') : null;

    const preferredMatches = commercialClusters.filter((cluster) => {
      const clusterText = normalizeKeyword(`${cluster.cluster} ${cluster.primaryKeyword}`);
      return (
        (preferredPattern && preferredPattern.test(clusterText))
        || (preferredLabels.size > 0 && preferredLabels.has(normalizeKeyword(cluster.cluster)))
        || (preferredLabel && normalizeKeyword(cluster.cluster) === preferredLabel)
        || (preferredKeyword && cluster.keywords.some((row) => normalizeKeyword(row.query) === preferredKeyword))
      );
    });

    const strategy = normalizeKeyword(preferredMain.strategy || '');
    if (strategy === 'best volume' || strategy === 'best-volume' || strategy === 'bestvolume') {
      const bestVolume = preferredMatches
        .filter((cluster) => !isLikelyBrandCluster(cluster))
        .sort((a, b) => (
          scoreKeyword({ impressions: b.totalImpressions, broadImpressions: b.totalBroadImpressions })
          - scoreKeyword({ impressions: a.totalImpressions, broadImpressions: a.totalBroadImpressions })
        ))[0];
      if (bestVolume) return bestVolume;
    }

    const preferred = preferredMatches[0];
    if (preferred) return preferred;
  }

  const protectedCommercial = commercialClusters.find((cluster) => (
    !isLikelyBrandCluster(cluster)
    && cluster.keywords.some((row) => protectedSet.has(normalizeKeyword(row.query)))
  ));

  return protectedCommercial
    || commercialClusters.find((cluster) => !isLikelyBrandCluster(cluster))
    || commercialClusters[0]
    || allClusters.find((cluster) => cluster.keywords.some((row) => protectedSet.has(normalizeKeyword(row.query))))
    || allClusters[0]
    || null;
}

function intentPriority(intent) {
  return {
    transactional: 5,
    commercial: 4,
    tool: 3,
    informational: 2,
    mixed: 1,
    navigational: 0,
  }[intent] ?? 0;
}

function mergeDuplicateClusterLabels(clusters, protectedSet) {
  const byLabel = new Map();

  for (const cluster of clusters) {
    const key = normalizeKeyword(cluster.cluster);
    const existing = byLabel.get(key);
    if (!existing) {
      byLabel.set(key, { ...cluster, keywords: [...cluster.keywords] });
      continue;
    }

    const betterIntent = intentPriority(cluster.intent) > intentPriority(existing.intent) ? cluster.intent : existing.intent;
    existing.intent = betterIntent;
    existing.pageType = pageTypeForIntent(betterIntent);
    existing.totalImpressions += cluster.totalImpressions || 0;
    existing.totalBroadImpressions += cluster.totalBroadImpressions || 0;
    existing.keywords = rankKeywords([...existing.keywords, ...cluster.keywords], 1000, Array.from(protectedSet));
    existing.conversionHypotheses = conversionHypotheses(existing.intent, existing.cluster);
  }

  return Array.from(byLabel.values()).map((cluster) => {
    const ranked = rankKeywords(cluster.keywords, 1000, Array.from(protectedSet));
    const primary = choosePrimaryKeyword(ranked, cluster.intent, protectedSet);
    const secondary = ranked.filter((row) => normalizeKeyword(row.query) !== normalizeKeyword(primary?.query));
    return {
      ...cluster,
      primaryKeyword: primary?.query || '',
      secondaryKeywords: secondary.map((row) => row.query),
      keywords: ranked,
      cannibalizationRule: `Use one page for "${cluster.cluster}". Do not create separate pages for: ${ranked.map((row) => row.query).slice(0, 8).join(', ')}.`,
    };
  });
}

function intentForValidatedExpansionType(type, primaryKeyword = '') {
  const text = normalizeKeyword(primaryKeyword);
  if (type === 'trust-legal') return 'commercial';
  if (type === 'mobile-app') return 'commercial';
  if (/\b(free|demo|for fun)\b/.test(text) && !/\bbonus|casino|casinos|real money\b/.test(text)) return 'commercial';
  return ['bonus', 'commercial', 'game', 'payment'].includes(type) ? 'transactional' : 'commercial';
}

function validatedExpansionPageClusters(seedPlan, existingClusters = [], mainCluster = null) {
  const validated = asArray(seedPlan?.validatedSitemapExpansion?.clusters);
  if (validated.length === 0) return [];

  const existingKeys = new Set();
  const addClusterKeys = (cluster) => {
    if (!cluster) return;
    existingKeys.add(normalizeKeyword(cluster.cluster));
    existingKeys.add(normalizeKeyword(cluster.primaryKeyword));
    for (const row of asArray(cluster.keywords)) existingKeys.add(normalizeKeyword(row.query));
  };
  addClusterKeys(mainCluster);
  for (const cluster of existingClusters) addClusterKeys(cluster);

  const result = [];
  for (const item of validated) {
    const primaryKeyword = normalizeKeyword(item.primaryKeyword);
    const label = String(item.label || item.primaryKeyword || '').trim();
    if (!primaryKeyword || !label) continue;

    const keywordRows = asArray(item.keywords)
      .filter((row) => row?.query)
      .map((row) => ({
        ...row,
        sources: uniqueItems([...(row.sources || []), 'validated-sitemap']),
      }));
    const keywordKeys = new Set([
      normalizeKeyword(label),
      primaryKeyword,
      ...keywordRows.map((row) => normalizeKeyword(row.query)),
    ].filter(Boolean));
    if ([...keywordKeys].some((key) => existingKeys.has(key))) continue;

    const intent = intentForValidatedExpansionType(item.type, primaryKeyword);
    const ranked = rankKeywords(keywordRows, 1000, [primaryKeyword]);
    const primary = ranked.find((row) => normalizeKeyword(row.query) === primaryKeyword) || ranked[0];
    const secondary = ranked.filter((row) => normalizeKeyword(row.query) !== normalizeKeyword(primary?.query));
    const cluster = {
      cluster: label,
      intent,
      pageType: pageTypeForIntent(intent),
      slug: slugify(label),
      primaryKeyword: primary?.query || item.primaryKeyword,
      secondaryKeywords: secondary.map((row) => row.query),
      totalImpressions: item.totalImpressions || ranked.reduce((sum, row) => sum + (row.impressions || 0), 0),
      totalBroadImpressions: item.totalBroadImpressions || ranked.reduce((sum, row) => sum + (row.broadImpressions || 0), 0),
      keywords: ranked,
      conversionHypotheses: conversionHypotheses(intent, label),
      cannibalizationRule: `Use one page for "${label}". Do not create separate pages for: ${ranked.map((row) => row.query).slice(0, 8).join(', ')}.`,
      source: 'validated-sitemap-expansion',
      sitemapEvidenceCount: item.sitemapEvidenceCount || 0,
      sampleUrls: item.sampleUrls || [],
    };
    result.push(cluster);
    addClusterKeys(cluster);
  }

  return result;
}

function ruleLabelForKeyword(query, seedPlan = null) {
  const text = normalizeKeyword(query);
  const tokens = new Set(keywordTokens(text));
  for (const rule of asArray(seedPlan?.clusterRules)) {
    const label = String(rule.label || '').trim();
    if (!label) continue;
    const pattern = rule.match ? new RegExp(rule.match, 'i') : null;
    const terms = asArray(rule.terms).map(stemToken);
    if ((pattern && pattern.test(text)) || (terms.length > 0 && terms.some((term) => tokens.has(term)))) {
      return label;
    }
  }
  if (/\bpokies?\b/.test(text)) {
    if (/\bbonus|bonuses|welcome|deposit|spins?\b/.test(text)) return 'Pokies bonuses Australia';
    if (/\bmobile|iphone|android|phone|tablet\b/.test(text)) return 'Mobile pokies Australia';
    if (/\breal money|real cash|cash pokies|for money\b/.test(text)) return 'Real money pokies Australia';
    if (/\bnew\b/.test(text) && /\bsites?\b/.test(text)) return 'New online casinos Australia';
    if (/\bsites?|online|australia|australian|best|top|safe|trusted|play\b/.test(text)) return 'Online pokies Australia';
  }
  if (/\bcasinos?\b/.test(text)) {
    if (/\bnew\b/.test(text)) return 'New online casinos Australia';
    if (/\breal money\b/.test(text)) return 'Online casinos Australia';
    if (/\bbonus|bonuses|welcome|deposit|spins?\b/.test(text)) return 'Pokies bonuses Australia';
    if (/\bpaypal|payid|poli|visa|mastercard|crypto|bitcoin\b/.test(text)) return 'Payment method casinos Australia';
    if (/\bonline|australia|australian|best|top|safe|trusted\b/.test(text)) return 'Online casinos Australia';
  }
  return '';
}

function stripMarketTerms(value) {
  return normalizeKeyword(value)
    .replace(/\b(australia|australian|canada|canadian|new zealand|nz|us|usa|uk)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findClusterByLabel(byLabel, label) {
  const normalized = normalizeKeyword(label);
  if (byLabel.has(normalized)) return byLabel.get(normalized);
  const stripped = stripMarketTerms(label);
  if (stripped && byLabel.has(stripped)) return byLabel.get(stripped);
  for (const [key, cluster] of byLabel.entries()) {
    if (stripMarketTerms(key) === stripped) return cluster;
  }
  return null;
}

function hydrateClustersWithProtectedSeedStats(clusters, seedStats, seedPlan = null, protectedQueries = []) {
  if (!seedPlan || !Array.isArray(clusters) || clusters.length === 0) return clusters;
  const protectedSeeds = new Set([
    ...asArray(seedPlan.seeds),
    ...asArray(protectedQueries),
  ].map(normalizeKeyword).filter(Boolean));
  if (protectedSeeds.size === 0) return clusters;

  const byLabel = new Map(clusters.map((cluster) => [normalizeKeyword(cluster.cluster), cluster]));
  const byKeyword = new Map();
  for (const cluster of clusters) {
    byKeyword.set(normalizeKeyword(cluster.primaryKeyword), cluster);
    for (const row of asArray(cluster.keywords)) byKeyword.set(normalizeKeyword(row.query), cluster);
  }

  for (const row of asArray(seedStats)) {
    const key = normalizeKeyword(row.query);
    if (!protectedSeeds.has(key)) continue;
    if ((row.impressions || 0) <= 0 && (row.broadImpressions || 0) <= 0) continue;
    const existingCluster = byKeyword.get(key);
    if (existingCluster && !String(existingCluster.pageType || '').startsWith('exclude')) continue;

    const label = ruleLabelForKeyword(row.query, seedPlan);
    let cluster = findClusterByLabel(byLabel, label);
    if (!cluster && /\breal money\b/.test(key) && /\bcasinos?\b/.test(key)) {
      cluster = findClusterByLabel(byLabel, 'Real money casinos') || findClusterByLabel(byLabel, 'Online casinos Australia');
    }
    if (!cluster && /\bpokies?\b/.test(key) && /\bsites?\b/.test(key)) {
      cluster = findClusterByLabel(byLabel, 'Online pokies Australia');
    }
    if (!cluster) continue;

    const hydrated = {
      query: row.query,
      impressions: row.impressions || 0,
      broadImpressions: row.broadImpressions || 0,
      sources: uniqueItems([...(row.sources || []), 'protected-seed-stat']),
    };
    if (existingCluster) {
      existingCluster.keywords = existingCluster.keywords.filter((item) => normalizeKeyword(item.query) !== key);
      existingCluster.secondaryKeywords = existingCluster.keywords
        .filter((item) => normalizeKeyword(item.query) !== normalizeKeyword(existingCluster.primaryKeyword))
        .map((item) => item.query);
    }
    cluster.keywords = cluster.keywords.filter((item) => normalizeKeyword(item.query) !== key);
    cluster.keywords.push(hydrated);
    cluster.keywords = rankKeywords(cluster.keywords, 1000, [cluster.primaryKeyword, ...asArray(seedPlan.seeds)]);
    const primary = choosePrimaryKeyword(cluster.keywords, cluster.intent, protectedSeeds);
    cluster.primaryKeyword = primary?.query || cluster.primaryKeyword;
    cluster.secondaryKeywords = cluster.keywords
      .filter((item) => normalizeKeyword(item.query) !== normalizeKeyword(cluster.primaryKeyword))
      .map((item) => item.query);
    cluster.cannibalizationRule = `Use one page for "${cluster.cluster}". Do not create separate pages for: ${cluster.keywords.map((item) => item.query).slice(0, 12).join(', ')}.`;
    byKeyword.set(key, cluster);
  }

  return clusters;
}

function clusterKeywords(keywords, { minClusterSize = 2, clusterLimit = 50, protectedQueries = [], seedPlan = null } = {}) {
  const protectedSet = new Set(protectedQueries.map(normalizeKeyword).filter(Boolean));
  const groups = new Map();

  for (const row of keywords) {
    const intent = classifyIntent(row.query);
    const clusterIntent = ['transactional', 'commercial'].includes(intent) ? 'transactional' : intent;
    const label = clusterIntent === 'transactional' && isGenericMainMoneyKeyword(row.query, protectedSet, seedPlan)
      ? 'Essay writing service'
      : topicLabel(row.query, seedPlan);
    const key = `${clusterIntent}:${label}`;
    const group = groups.get(key) || {
      cluster: label,
      intent: clusterIntent,
      pageType: pageTypeForIntent(clusterIntent),
      slug: slugify(label),
      primaryKeyword: null,
      totalImpressions: 0,
      totalBroadImpressions: 0,
      keywords: [],
      conversionHypotheses: conversionHypotheses(clusterIntent, label),
      cannibalizationRule: '',
    };

    group.keywords.push(row);
    group.totalImpressions += row.impressions || 0;
    group.totalBroadImpressions += row.broadImpressions || 0;
    groups.set(key, group);
  }

  const allClusters = mergeDuplicateClusterLabels(Array.from(groups.values())
    .map((group) => {
      const ranked = [...group.keywords].sort((a, b) => scoreKeyword(b) - scoreKeyword(a));
      const primary = choosePrimaryKeyword(ranked, group.intent, protectedSet);
      const secondary = ranked.filter((row) => normalizeKeyword(row.query) !== normalizeKeyword(primary?.query));
      return {
        ...group,
        primaryKeyword: primary?.query || '',
        secondaryKeywords: secondary.map((row) => row.query),
        keywords: ranked,
        cannibalizationRule: `Use one page for "${group.cluster}". Do not create separate pages for: ${ranked.map((row) => row.query).slice(0, 8).join(', ')}.`,
      };
    })
    .filter((group) => group.keywords.length >= minClusterSize || group.totalImpressions > 0), protectedSet)
    .sort((a, b) => b.totalImpressions - a.totalImpressions || b.totalBroadImpressions - a.totalBroadImpressions);

  const selected = allClusters.slice(0, clusterLimit);
  const selectedKeys = new Set(selected.map((cluster) => `${cluster.intent}:${cluster.cluster}`));
  for (const cluster of allClusters) {
    const hasProtectedKeyword = cluster.keywords.some((row) => protectedSet.has(normalizeKeyword(row.query)));
    const key = `${cluster.intent}:${cluster.cluster}`;
    if (hasProtectedKeyword && !selectedKeys.has(key)) {
      selected.push(cluster);
      selectedKeys.add(key);
    }
  }

  const mainCluster = chooseMainCluster(allClusters, protectedSet, seedPlan);
  const mergedClusters = [];
  const pageClusters = [];

  for (const cluster of selected) {
    if (shouldMergeCluster(cluster, mainCluster)) {
      mergedClusters.push({
        ...cluster,
        mergeTarget: mergeTargetForCluster(cluster, seedPlan),
      });
      continue;
    }
    pageClusters.push(cluster);
  }

  const orphanKeywords = keywords.filter((row) => !pageClusters.some((cluster) => cluster.keywords.some((item) => normalizeKeyword(item.query) === normalizeKeyword(row.query))));

  return { mainCluster, clusters: pageClusters, mergedClusters, orphanKeywords };
}

function summarizeClusters(clusters) {
  return clusters.reduce((summary, cluster) => {
    summary.totalKeywords += cluster.keywords.length;
    summary.totalImpressions += cluster.totalImpressions;
    summary.totalBroadImpressions += cluster.totalBroadImpressions;
    summary.byType[cluster.pageType] = (summary.byType[cluster.pageType] || 0) + 1;
    return summary;
  }, {
    totalKeywords: 0,
    totalImpressions: 0,
    totalBroadImpressions: 0,
    byType: {},
  });
}

function expansionCandidates(clusters, { minImpressions = 1000, maxKeywords = 3, minBroadImpressions = 1000, minBroadRatio = 5 } = {}) {
  return clusters
    .map((cluster) => {
      const broadRatio = cluster.totalBroadImpressions / Math.max(1, cluster.totalImpressions);
      const thinHighExact = cluster.totalImpressions >= minImpressions && cluster.keywords.length <= maxKeywords;
      const broadOpportunity = cluster.totalBroadImpressions >= minBroadImpressions && broadRatio >= minBroadRatio;
      return {
        cluster,
        broadRatio,
        thinHighExact,
        broadOpportunity,
      };
    })
    .filter((item) => item.thinHighExact || item.broadOpportunity)
    .sort((a, b) => {
      const broadDelta = Number(b.broadOpportunity) - Number(a.broadOpportunity);
      if (broadDelta) return broadDelta;
      return b.cluster.totalBroadImpressions - a.cluster.totalBroadImpressions || b.cluster.totalImpressions - a.cluster.totalImpressions;
    })
    .map(({ cluster, broadRatio, broadOpportunity }) => ({
      cluster: cluster.cluster,
      primaryKeyword: cluster.primaryKeyword,
      pageType: cluster.pageType,
      exact: cluster.totalImpressions,
      broad: cluster.totalBroadImpressions,
      broadRatio: Number(broadRatio.toFixed(1)),
      currentKeywordCount: cluster.keywords.length,
      reason: broadOpportunity ? 'broad-opportunity' : 'thin-high-exact',
      action: broadOpportunity
        ? `Create a branch seed-plan for "${cluster.primaryKeyword}" with named games, providers, payment modifiers, review/comparison modifiers, and market/local variants.`
        : `Create a branch seed-plan for "${cluster.primaryKeyword}" and rerun bing-site-plan with SEED_PLAN for this branch.`,
    }));
}

function renderKeywordPlanHtml(report) {
  const clusters = report.clusters || [];
  const mergedClusters = report.mergedClusters || [];
  const seedStats = report.seedStats || [];
  const clusterKey = (cluster) => `${cluster?.intent || ''}:${cluster?.cluster || ''}:${cluster?.primaryKeyword || ''}`;
  const mainCluster = report.mainPage
    ? clusters.find((cluster) => cluster.primaryKeyword === report.mainPage.primaryKeyword) || clusters[0]
    : null;
  const mainClusterKey = clusterKey(mainCluster);
  const sectionClusters = clusters.filter((cluster) => clusterKey(cluster) !== mainClusterKey);
  const moneyClusters = sectionClusters.filter((cluster) => cluster.pageType === 'money-page');
  const funnelClusters = sectionClusters.filter((cluster) => ['commercial-support', 'tool-funnel-page', 'supporting-funnel-page'].includes(cluster.pageType));
  const excludedClusters = sectionClusters.filter((cluster) => cluster.pageType.startsWith('exclude'));
  const validatedExpansion = asArray(report.seedPlan?.validatedSitemapExpansion?.clusters);
  const sitemapStats = report.seedPlan?.validatedSitemapExpansion?.sitemapStats || {};
  const validatedStats = report.seedPlan?.validatedSitemapExpansion || {};
  const marketScopeLabel = `${String(report.country || '').toUpperCase()} / ${report.language || ''}`.trim();
  const selectionTypes = uniqueItems([
    ...Object.keys(validatedStats.byTypeCandidatePool || {}),
    ...Object.keys(validatedStats.byTypeSelectedHypotheses || {}),
  ]);
  const selectionRows = selectionTypes.length ? selectionTypes
    .sort((a, b) => Number(validatedStats.byTypeSelectedHypotheses?.[b] || 0) - Number(validatedStats.byTypeSelectedHypotheses?.[a] || 0) || a.localeCompare(b))
    .map((type) => `
      <span class="pill">${escapeHtml(type)}: ${Number(validatedStats.byTypeSelectedHypotheses?.[type] || 0).toLocaleString('en-US')} selected / ${Number(validatedStats.byTypeCandidatePool?.[type] || 0).toLocaleString('en-US')} pool</span>
    `).join('') : '';

  const clusterCard = (cluster, { isMainPage = false } = {}) => `
    <section class="cluster">
      <div class="cluster-head">
        <div>
          <p class="eyebrow">${isMainPage ? 'homepage · primary' : `${escapeHtml(cluster.pageType)} · ${escapeHtml(cluster.intent)}`}</p>
          <h3>${escapeHtml(cluster.cluster)}</h3>
          <p class="slug">${isMainPage ? '/' : `/${escapeHtml(cluster.slug)}/`}</p>
        </div>
        <div class="metric">
          <span>${cluster.totalImpressions.toLocaleString('en-US')}</span>
          <small>exact ${escapeHtml(String(report.country || '').toUpperCase())} impressions</small>
        </div>
        <div class="metric muted">
          <span>${cluster.totalBroadImpressions.toLocaleString('en-US')}</span>
          <small>broad ${escapeHtml(String(report.country || '').toUpperCase())} impressions</small>
        </div>
      </div>
      <div class="primary">
        <strong>Primary:</strong> ${escapeHtml(cluster.primaryKeyword)}
      </div>
      <table>
        <thead>
          <tr>
            <th>Keyword</th>
            <th>Exact</th>
            <th>Broad</th>
            <th>Found via</th>
          </tr>
        </thead>
        <tbody>
          ${cluster.keywords.map((row) => `
            <tr>
              <td>${escapeHtml(row.query)}</td>
              <td>${Number(row.impressions || 0).toLocaleString('en-US')}</td>
              <td>${Number(row.broadImpressions || 0).toLocaleString('en-US')}</td>
              <td>${sourceCell(row.sources || [])}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="rule">${escapeHtml(cluster.cannibalizationRule)}</div>
      <ul class="hypotheses">
        ${cluster.conversionHypotheses.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    </section>
  `;

  const sourceCell = (sources) => {
    const uniqueSources = uniqueItems(sources).filter(Boolean);
    if (uniqueSources.length === 0) return '<span class="source-summary">direct</span>';
    if (uniqueSources.includes('seed-exact') && uniqueSources.length === 1) return '<span class="source-summary">seed keyword</span>';

    const visibleSources = uniqueSources.filter((source) => source !== 'seed-exact');
    const label = uniqueSources.includes('seed-exact')
      ? `seed + ${visibleSources.length} expansion${visibleSources.length === 1 ? '' : 's'}`
      : `${visibleSources.length} expansion${visibleSources.length === 1 ? '' : 's'}`;

    return `<details class="sources"><summary>${escapeHtml(label)}</summary><span>${escapeHtml(uniqueSources.slice(0, 8).join(', '))}</span></details>`;
  };

  const mergedRows = mergedClusters
    .sort((a, b) => b.totalImpressions - a.totalImpressions || b.totalBroadImpressions - a.totalBroadImpressions)
    .map((cluster) => `
      <tr>
        <td>${escapeHtml(cluster.primaryKeyword || cluster.cluster)}</td>
        <td>${escapeHtml(cluster.mergeTarget || 'Main page')}</td>
        <td>${Number(cluster.totalImpressions || 0).toLocaleString('en-US')}</td>
        <td>${Number(cluster.totalBroadImpressions || 0).toLocaleString('en-US')}</td>
      </tr>
    `).join('');

  const testedSeedRows = seedStats
    .filter((row) => {
      const text = normalizeKeyword(row.query);
      const tokens = new Set(keywordTokens(text));
      const genericSeedPhrases = new Set(['online', 'canada', 'canadian', 'best', 'real', 'money', 'casino', 'casinos', 'slot', 'slots']);
      const looksLikeNamedGame = tokens.size >= 3 && !genericSeedPhrases.has(text);
      return looksLikeNamedGame || row.impressions > 0 || row.broadImpressions > 0;
    })
    .sort((a, b) => (b.impressions - a.impressions) || (b.broadImpressions - a.broadImpressions) || a.query.localeCompare(b.query))
    .slice(0, 80)
    .map((row) => `
      <tr>
        <td>${escapeHtml(row.query)}</td>
        <td>${Number(row.impressions || 0).toLocaleString('en-US')}</td>
        <td>${Number(row.broadImpressions || 0).toLocaleString('en-US')}</td>
        <td>${(row.impressions || row.broadImpressions) ? '<span class="source-summary">has Bing demand</span>' : '<span class="source-summary">tested, no 30-day Bing demand</span>'}</td>
      </tr>
    `).join('');

  const validatedExpansionRows = validatedExpansion
    .sort((a, b) => (b.totalImpressions - a.totalImpressions) || (b.totalBroadImpressions - a.totalBroadImpressions) || a.label.localeCompare(b.label))
    .map((cluster) => {
      const pageCluster = clusters.find((item) => (
        normalizeKeyword(item.cluster) === normalizeKeyword(cluster.label)
        || item.keywords.some((row) => normalizeKeyword(row.query) === normalizeKeyword(cluster.primaryKeyword))
      ));
      const mergedCluster = mergedClusters.find((item) => (
        normalizeKeyword(item.cluster) === normalizeKeyword(cluster.label)
        || item.keywords.some((row) => normalizeKeyword(row.query) === normalizeKeyword(cluster.primaryKeyword))
      ));
      const status = pageCluster
        ? `visible as ${pageCluster.pageType}`
        : mergedCluster
          ? `merged into ${mergedCluster.mergeTarget || 'parent page'}`
          : 'validated seed, needs branch run or manual review';
      return `
        <tr>
          <td><strong>${escapeHtml(cluster.label)}</strong><small>${escapeHtml(cluster.type || 'expansion')}</small></td>
          <td>${escapeHtml(cluster.primaryKeyword)}</td>
          <td>${Number(cluster.totalImpressions || 0).toLocaleString('en-US')}</td>
          <td>${Number(cluster.totalBroadImpressions || 0).toLocaleString('en-US')}</td>
          <td>${escapeHtml(status)}</td>
          <td>${escapeHtml(asArray(cluster.keywords).map((row) => row.query).slice(0, 6).join(', '))}</td>
        </tr>
      `;
    }).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(report.topic)} keyword plan</title>
  <style>
    :root { color-scheme: light; --ink:#18202f; --muted:#667085; --line:#d9e0ea; --soft:#f5f7fb; --brand:#0f766e; --accent:#b45309; --danger:#b42318; }
    body { margin:0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:var(--ink); background:#f8fafc; }
    header { padding:40px max(24px, 6vw) 28px; background:#ffffff; border-bottom:1px solid var(--line); }
    h1 { margin:0 0 10px; font-size:clamp(28px, 4vw, 54px); line-height:1; letter-spacing:0; }
    h2 { margin:38px 0 16px; font-size:28px; letter-spacing:0; }
    h3 { margin:0; font-size:22px; letter-spacing:0; }
    p { color:var(--muted); }
    main { padding:28px max(24px, 6vw) 64px; }
    .meta { display:flex; flex-wrap:wrap; gap:10px; margin-top:20px; }
    .pill { background:var(--soft); border:1px solid var(--line); border-radius:999px; padding:8px 12px; color:#344054; font-size:14px; }
    .grid { display:grid; gap:14px; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); margin-top:22px; }
    .stat { background:#fff; border:1px solid var(--line); border-radius:8px; padding:18px; }
    .stat span { display:block; font-size:28px; font-weight:760; }
    .stat small, .metric small { color:var(--muted); }
    .cluster { background:#fff; border:1px solid var(--line); border-radius:8px; padding:20px; margin:16px 0; box-shadow:0 1px 2px rgba(16,24,40,.04); }
    .cluster-head { display:grid; gap:14px; grid-template-columns:minmax(0, 1fr) auto auto; align-items:start; }
    .eyebrow { margin:0 0 6px; color:var(--brand); font-weight:700; font-size:12px; text-transform:uppercase; letter-spacing:.08em; }
    .slug { margin:6px 0 0; font-family:ui-monospace, SFMono-Regular, Menlo, monospace; color:var(--muted); }
    .metric { text-align:right; min-width:130px; }
    .metric span { display:block; font-weight:800; font-size:22px; }
    .muted span { color:var(--accent); }
    .primary { margin:16px 0 12px; padding:12px; background:#ecfdf3; border:1px solid #abefc6; border-radius:8px; }
    table { width:100%; border-collapse:collapse; margin-top:12px; font-size:14px; }
    th, td { padding:10px 8px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
    th { color:#475467; font-size:12px; text-transform:uppercase; letter-spacing:.06em; background:#f8fafc; }
    .rule { margin-top:14px; padding:12px; background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; color:#7c2d12; }
    .hypotheses { margin:12px 0 0; color:#344054; }
    .empty { padding:18px; border:1px dashed var(--line); border-radius:8px; color:var(--muted); }
    .noise { background:#fff; border:1px solid var(--line); border-radius:8px; padding:16px; color:var(--muted); }
    .rejected { display:grid; gap:8px; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); }
    .rejected div { padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:#fff; }
    .rejected strong { display:block; color:var(--ink); }
    .rejected small { color:var(--danger); }
    .source-summary { color:var(--muted); font-size:13px; white-space:nowrap; }
    td small { display:block; color:var(--muted); margin-top:3px; }
    .note { color:var(--muted); font-size:14px; margin-top:-6px; }
    .sources summary { color:var(--muted); cursor:pointer; font-size:13px; white-space:nowrap; }
    .sources span { display:block; margin-top:6px; color:#475467; font-size:12px; line-height:1.35; }
    .expansion { display:grid; gap:12px; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); }
    .expansion div { background:#fff; border:1px solid #bae6fd; border-radius:8px; padding:14px; }
    .expansion strong { display:block; margin-bottom:6px; }
    .expansion span { color:var(--muted); display:block; }
    .pipeline { display:grid; gap:12px; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); margin:14px 0 16px; }
    .pipeline div { background:#fff; border:1px solid var(--line); border-radius:8px; padding:14px; }
    .pipeline strong { display:block; font-size:24px; line-height:1; }
    .pipeline span { display:block; color:var(--muted); margin-top:6px; font-size:13px; }
    .pipeline-note { background:#f8fafc; border:1px solid var(--line); border-radius:8px; padding:12px 14px; color:#475467; margin:0 0 16px; }
    .report-nav { position:sticky; top:0; z-index:5; display:flex; gap:8px; overflow-x:auto; padding:10px max(24px, 6vw); background:rgba(248,250,252,.94); border-bottom:1px solid var(--line); backdrop-filter:blur(10px); }
    .report-nav a { flex:0 0 auto; text-decoration:none; color:#344054; background:#fff; border:1px solid var(--line); border-radius:999px; padding:7px 10px; font-size:13px; }
    .report-nav a:hover { border-color:var(--brand); color:var(--brand); }
    @media (max-width: 760px) { .cluster-head { grid-template-columns:1fr; } .metric { text-align:left; } table { display:block; overflow-x:auto; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(report.topic)} keyword plan</h1>
    <p>Clustered keyword map for building pages without cannibalizing intent. Demand is scoped by Bing country/language (${escapeHtml(marketScopeLabel)}), so a keyword does not need to contain the market name to be regional traffic.</p>
    <div class="meta">
      <span class="pill">Market: ${escapeHtml(report.country)} / ${escapeHtml(report.language)}</span>
      <span class="pill">Period: ${escapeHtml(report.startDate)} to ${escapeHtml(report.endDate)}</span>
      <span class="pill">Model: ${escapeHtml(report.siteModel)}</span>
      <span class="pill">API requests: ${report.apiRequests}</span>
      <span class="pill">Rejected: ${report.filteredOut.length}</span>
    </div>
    <div class="grid">
      <div class="stat"><span>${report.clusterCount}</span><small>page clusters</small></div>
      <div class="stat"><span>${mergedClusters.length}</span><small>merged small clusters</small></div>
      <div class="stat"><span>${report.summary.totalKeywords}</span><small>clustered keywords</small></div>
      <div class="stat"><span>${report.summary.totalImpressions.toLocaleString('en-US')}</span><small>exact ${escapeHtml(String(report.country || '').toUpperCase())} impressions</small></div>
      <div class="stat"><span>${report.summary.totalBroadImpressions.toLocaleString('en-US')}</span><small>broad ${escapeHtml(String(report.country || '').toUpperCase())} impressions</small></div>
    </div>
  </header>
  <nav class="report-nav">
    <a href="#main-page">Main page</a>
    <a href="#money-pages">Money pages</a>
    <a href="#funnel-pages">Funnel support</a>
    <a href="#validated-expansion">Validated expansion</a>
    <a href="#expansion-candidates">Expansion candidates</a>
    <a href="#merged-keywords">Merged</a>
    <a href="#tested-seeds">Tested seeds</a>
    <a href="#review">Review</a>
  </nav>
  <main>
    <h2 id="main-page">Main Page</h2>
    <p class="source-summary">Found via shows which seed or expansion query discovered the keyword. Traffic numbers are already regionalized by ${escapeHtml(marketScopeLabel)}; generic phrases like "online pokies" can be stronger than market-suffixed variants.</p>
    ${mainCluster ? clusterCard(mainCluster, { isMainPage: true }) : '<div class="empty">No main page found.</div>'}
    <h2 id="money-pages">Money Pages</h2>
    ${moneyClusters.length ? moneyClusters.map(clusterCard).join('') : '<div class="empty">No money-page clusters found.</div>'}
    <h2 id="funnel-pages">Funnel Support Pages</h2>
    ${funnelClusters.length ? funnelClusters.map(clusterCard).join('') : '<div class="empty">No funnel-support clusters found.</div>'}
    <h2 id="validated-expansion">Validated Sitemap Expansion</h2>
    <p class="note">These clusters came from competitor sitemap hypotheses, were expanded into search variants, and then checked with Bing exact/broad impressions. This section is shown even when the final page planner merges a thin validated idea into a larger page.</p>
    <div class="pipeline">
      <div><strong>${Number(sitemapStats.urlCount || 0).toLocaleString('en-US')}</strong><span>sitemap URLs parsed</span></div>
      <div><strong>${Number(sitemapStats.ideaCount || 0).toLocaleString('en-US')}</strong><span>URL-derived ideas retained</span></div>
      <div><strong>${Number(validatedStats.candidatePool || 0).toLocaleString('en-US')}</strong><span>scored validation candidates</span></div>
      <div><strong>${Number(validatedStats.testedHypotheses || 0).toLocaleString('en-US')}</strong><span>hypotheses checked in Bing</span></div>
      <div><strong>${Number(validatedStats.testedQueries || 0).toLocaleString('en-US')}</strong><span>query variants tested</span></div>
      <div><strong>${Number(validatedStats.validatedClusters || validatedExpansion.length || 0).toLocaleString('en-US')}</strong><span>validated clusters</span></div>
    </div>
    ${selectionRows ? `<div class="chips">${selectionRows}</div>` : ''}
    <p class="pipeline-note">The sitemap crawler found far more URLs than the visible clusters. Most URLs are duplicates, brand promo pages, legal/utility pages, foreign-language variants, or patterns without Bing demand. The visible rows are only the hypotheses that passed the Bing validation layer.</p>
    ${validatedExpansionRows ? `
      <table>
        <thead>
          <tr>
            <th>Validated Cluster</th>
            <th>Primary Keyword</th>
            <th>Exact</th>
            <th>Broad</th>
            <th>Planner Status</th>
            <th>Validated Keywords</th>
          </tr>
        </thead>
        <tbody>${validatedExpansionRows}</tbody>
      </table>
    ` : '<div class="empty">No validated sitemap expansion clusters in this seed-plan.</div>'}
    <h2 id="expansion-candidates">Expansion Candidates</h2>
    <div class="expansion">${report.expansionCandidates.length ? report.expansionCandidates.map((item) => `
      <div>
        <strong>${escapeHtml(item.cluster)}</strong>
        <span>Primary: ${escapeHtml(item.primaryKeyword)}</span>
        <span>${escapeHtml(item.reason)} · Exact: ${Number(item.exact).toLocaleString('en-US')} · Broad: ${Number(item.broad).toLocaleString('en-US')} · Ratio: ${Number(item.broadRatio || 0).toLocaleString('en-US')}x · Keywords: ${item.currentKeywordCount}</span>
        <span>${escapeHtml(item.action)}</span>
      </div>
    `).join('') : '<div>No under-expanded high-volume clusters.</div>'}</div>
    <h2 id="merged-keywords">Merged Keywords</h2>
    <p class="note">These weak or single-keyword clusters should not become separate pages. Fold them into the suggested parent page to avoid thin pages and cannibalization.</p>
    ${mergedClusters.length ? `
      <table>
        <thead>
          <tr>
            <th>Keyword / Tiny Cluster</th>
            <th>Merge Into</th>
            <th>Exact</th>
            <th>Broad</th>
          </tr>
        </thead>
        <tbody>${mergedRows}</tbody>
      </table>
    ` : '<div class="empty">No small clusters were merged.</div>'}
    <h2 id="tested-seeds">Tested Seed Hypotheses</h2>
    <p class="note">These are seed ideas the agent explicitly tested. Rows with zero demand are useful: they show named games/providers that should not become pages unless another data source proves demand.</p>
    ${testedSeedRows ? `
      <table>
        <thead>
          <tr>
            <th>Seed Hypothesis</th>
            <th>Exact</th>
            <th>Broad</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${testedSeedRows}</tbody>
      </table>
    ` : '<div class="empty">No seed stats were collected.</div>'}
    <h2 id="review">Excluded / Review</h2>
    ${excludedClusters.length ? excludedClusters.map(clusterCard).join('') : '<div class="noise">No excluded clusters in this run.</div>'}
    <h2>Rejected Keywords</h2>
    <div class="rejected">${report.filteredOut.slice(0, 120).map((row) => `<div><strong>${escapeHtml(row.query)}</strong><small>${escapeHtml(row.reason || 'rejected')}</small></div>`).join('') || '<div>No rejected keywords.</div>'}</div>
  </main>
</body>
</html>`;
}

async function keywordStatsSummary(keyword, country, language) {
  const stats = asArray(await bing('GetKeywordStats', {
    query: {
      q: keyword,
      country,
      language,
    },
  }));

  return {
    query: keyword,
    impressions: stats.reduce((sum, row) => sum + Number(row.Impressions ?? row.impressions ?? 0), 0),
    broadImpressions: stats.reduce((sum, row) => sum + Number(row.BroadImpressions ?? row.broadImpressions ?? 0), 0),
    source: 'seed-exact',
  };
}

function readConfig() {
  const configPath = path.resolve(getArg('--config', process.env.BING_WEBMASTER_CONFIG || DEFAULT_CONFIG));
  if (!fs.existsSync(configPath)) {
    throw new Error(`Bing Webmaster config not found: ${configPath}`);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const apiKey = String(config.apiKey || process.env.BING_WEBMASTER_API_KEY || '').trim();
  if (!apiKey || apiKey.includes('PUT_')) {
    throw new Error(`Bing Webmaster API key is missing in ${configPath}`);
  }

  return {
    configPath,
    apiKey,
    defaultSiteUrl: String(config.defaultSiteUrl || '').trim(),
    keywordResearch: config.keywordResearch || {},
  };
}

function getSiteUrl(config) {
  const siteUrl = getArg('--site', getArg('--site-url', config.defaultSiteUrl));
  if (!siteUrl) {
    throw new Error('Site URL is required. Pass --site https://example.com or set defaultSiteUrl in bing-webmaster.json.');
  }
  return siteUrl;
}

async function bing(method, { query = {}, body, httpMethod = 'GET' } = {}) {
  const config = readConfig();
  const url = new URL(`${API_BASE}/${method}`);
  url.searchParams.set('apikey', config.apiKey);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const cacheDir = path.resolve(process.env.BING_WEBMASTER_CACHE_DIR || DEFAULT_CACHE_DIR);
  const cacheKey = await sha256(stableJson({ method, query, body, httpMethod }));
  const cachePath = path.join(cacheDir, `${cacheKey}.json`);
  const useCache = !hasArg('--no-cache');
  if (useCache && fs.existsSync(cachePath)) {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  }

  const retryCount = boundedNumberArg('--retry-count', 3, 0, 10);
  let lastError = null;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      const { response, data } = await fetchJsonWithTimeout(url, {
        method: httpMethod,
        headers: {
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        if (attempt < retryCount && isRetryableBingError(response.status, data)) {
          const delay = retryDelayFor(response, data, attempt + 1);
          console.error(`[bing-webmaster] ${method} returned ${response.status}; retry ${attempt + 1}/${retryCount} after ${delay}ms.`);
          await sleep(delay);
          continue;
        }

        throw new Error(`Bing Webmaster API ${method} failed ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
      }

      const result = data?.d ?? data;
      if (useCache) {
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(cachePath, JSON.stringify(result), 'utf8');
      }
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < retryCount && isRetryableNetworkError(error)) {
        const delay = Math.min(boundedNumberArg('--retry-delay-ms', 10000, 0, 300000) * (attempt + 1), 600000);
        console.error(`[bing-webmaster] ${method} network error; retry ${attempt + 1}/${retryCount} after ${delay}ms: ${error.message}`);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error(`Bing Webmaster API ${method} failed after retries.`);
}

function print(data) {
  console.log(JSON.stringify(data, null, 2));
}

async function sites() {
  const list = await bing('GetUserSites');
  print((Array.isArray(list) ? list : []).map((site) => ({
    url: site.Url || site.url,
    isVerified: site.IsVerified ?? site.isVerified,
    role: site.Role || site.role,
    authenticationCode: site.AuthenticationCode || site.authenticationCode,
  })));
}

async function quota() {
  const config = readConfig();
  const siteUrl = getSiteUrl(config);
  print(await bing('GetUrlSubmissionQuota', { query: { siteUrl } }));
}

async function submitUrl() {
  const config = readConfig();
  const siteUrl = getSiteUrl(config);
  const url = getArg('--url');
  if (!url) throw new Error('URL is required. Pass --url https://example.com/page');
  print(await bing('SubmitUrl', {
    httpMethod: 'POST',
    body: { siteUrl, url },
  }));
}

async function submitUrls() {
  const config = readConfig();
  const siteUrl = getSiteUrl(config);
  const raw = getArg('--urls');
  const urls = raw ? raw.split(',').map((item) => item.trim()).filter(Boolean) : [];
  if (urls.length === 0) throw new Error('URLs are required. Pass --urls https://example.com/a,https://example.com/b');
  print(await bing('SubmitUrlBatch', {
    httpMethod: 'POST',
    body: { siteUrl, urlList: urls },
  }));
}

async function keywordStats() {
  const config = readConfig();
  const keyword = getArg('--keyword', getArg('--q'));
  if (!keyword) throw new Error('Keyword is required. Pass --keyword "essay writing service"');

  const research = config.keywordResearch || {};
  const country = getArg('--country', research.country || 'us').toLowerCase();
  const language = getArg('--language', research.languageTag || research.language || 'en-US');

  print(await bing('GetKeywordStats', {
    query: {
      q: keyword,
      country,
      language,
    },
  }));
}

async function relatedKeywords() {
  const config = readConfig();
  const keyword = getArg('--keyword', getArg('--q'));
  if (!keyword) throw new Error('Keyword is required. Pass --keyword "essay writing service"');

  const research = config.keywordResearch || {};
  const country = getArg('--country', research.country || 'us').toLowerCase();
  const language = getArg('--language', research.languageTag || research.language || 'en-US');
  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setDate(defaultStart.getDate() - 90);
  const startDate = getArg('--start-date', formatDate(defaultStart));
  const endDate = getArg('--end-date', formatDate(now));

  print(await bing('GetRelatedKeywords', {
    query: {
      q: keyword,
      country,
      language,
      startDate,
      endDate,
    },
  }));
}

async function keywordResearch() {
  print(await gatherKeywordResearch());
}

async function gatherKeywordResearch() {
  const config = readConfig();
  const rawSeeds = getArg('--seeds', getArg('--keywords', getArg('--keyword', getArg('--q'))));
  const seeds = splitCsv(rawSeeds);
  if (seeds.length === 0) {
    throw new Error('Seed keyword is required. Pass --keyword "essay writing service" or --seeds "essay writing service,write my essay"');
  }

  const research = config.keywordResearch || {};
  const country = getArg('--country', research.country || 'us').toLowerCase();
  const language = getArg('--language', research.languageTag || research.language || 'en-US');
  const now = new Date();
  const days = Math.max(1, Math.min(365, numberArg('--days', 30)));
  const defaultStart = new Date(now);
  defaultStart.setDate(defaultStart.getDate() - days);
  const startDate = getArg('--start-date', formatDate(defaultStart));
  const endDate = getArg('--end-date', formatDate(now));
  const depth = Math.max(1, Math.min(3, numberArg('--depth', 2)));
  const perSeed = Math.max(1, Math.min(50, numberArg('--per-seed', 15)));
  const limit = Math.max(1, Math.min(500, numberArg('--limit', 100)));
  const delayMs = boundedNumberArg('--delay-ms', 2000, 0, 120000);
  const statsDelayMs = boundedNumberArg('--stats-delay-ms', Math.max(delayMs, 2500), 0, 120000);
  const maxRelatedRequests = Math.max(1, Math.min(500, numberArg('--max-requests', 80)));
  const includeSeedStats = !hasArg('--no-seed-stats');
  const seedPlan = loadSeedPlan();
  const useBroadSeeds = hasArg('--broad-seeds') || command === 'keyword-site-plan';
  const querySeeds = useBroadSeeds ? buildSeedPlan(seeds, seedPlan) : uniqueItems([...seeds, ...(seedPlan?.seeds || [])]);

  const rows = [];
  const errors = [];
  const queue = querySeeds.map((seed) => ({ keyword: seed, depth: 1, source: 'seed' }));
  const visited = new Set();
  const seedStats = [];
  let statsRequests = 0;

  if (includeSeedStats) {
    for (let index = 0; index < querySeeds.length; index += 1) {
      const seed = querySeeds[index];
      try {
        const statsRow = await keywordStatsSummary(seed, country, language);
        seedStats.push(statsRow);
        rows.push(statsRow);
        statsRequests += 1;
      } catch (error) {
        errors.push({ keyword: seed, method: 'GetKeywordStats', message: error.message });
      }
      if (index < querySeeds.length - 1) await sleep(statsDelayMs);
    }
  }

  while (queue.length > 0 && visited.size < maxRelatedRequests) {
    const item = queue.shift();
    const key = normalizeKeyword(item.keyword);
    if (!key || visited.has(key)) continue;
    visited.add(key);

    try {
      const related = asArray(await bing('GetRelatedKeywords', {
        query: {
          q: item.keyword,
          country,
          language,
          startDate,
          endDate,
        },
      })).map((row) => keywordRow(row, item.keyword));

      rows.push(...related);

      if (item.depth < depth) {
        const next = rankKeywords(related, perSeed);
        for (const row of next) {
          const nextKey = normalizeKeyword(row.query);
          if (nextKey && !visited.has(nextKey)) {
            queue.push({ keyword: row.query, depth: item.depth + 1, source: item.keyword });
          }
        }
      }
    } catch (error) {
      errors.push({ keyword: item.keyword, method: 'GetRelatedKeywords', message: error.message });
    }

    if (queue.length > 0) await sleep(delayMs);
  }

  const keywords = rankKeywords(rows, limit, seeds);
  return {
    source: 'bing-webmaster',
    country,
    language,
    startDate,
    endDate,
    depth,
    perSeed,
    maxRelatedRequests,
    delayMs,
    statsDelayMs,
    requestedSeeds: seeds,
    seedPlan,
    querySeeds,
    seedStats,
    apiRequests: visited.size + statsRequests,
    relatedRequests: visited.size,
    statsRequests,
    totalKeywords: keywords.length,
    keywords,
    errors,
  };
}

async function keywordClusters() {
  const research = await gatherKeywordResearch();
  const minClusterSize = Math.max(1, Math.min(20, numberArg('--min-cluster-size', 2)));
  const clusterLimit = Math.max(1, Math.min(100, numberArg('--cluster-limit', 50)));
  const clustered = clusterKeywords(research.keywords, {
    minClusterSize,
    clusterLimit,
    protectedQueries: protectedQueriesForResearch(research),
    seedPlan: research.seedPlan,
  });

  print({
    ...research,
    mainKeyword: clustered.mainCluster?.primaryKeyword || '',
    mainPage: clustered.mainCluster ? {
      cluster: clustered.mainCluster.cluster,
      intent: clustered.mainCluster.intent,
      pageType: clustered.mainCluster.pageType,
      slug: '/',
      primaryKeyword: clustered.mainCluster.primaryKeyword,
      secondaryKeywords: clustered.mainCluster.secondaryKeywords,
    } : null,
    clusterCount: clustered.clusters.length,
    clusters: clustered.clusters,
    mergedClusters: clustered.mergedClusters,
    orphanKeywords: clustered.orphanKeywords,
  });
}

async function keywordSitePlan() {
  const research = await gatherKeywordResearch();
  const minClusterSize = Math.max(1, Math.min(20, numberArg('--min-cluster-size', 2)));
  const clusterLimit = Math.max(1, Math.min(200, numberArg('--cluster-limit', 80)));
  const includeNoise = hasArg('--include-noise');
  const siteModel = getArg('--site-model', research.seedPlan?.siteModel || 'auto');
  const filteredOut = [];
  const cleanKeywords = [];

  for (const row of research.keywords) {
    const reason = rejectReason(row.query, research.requestedSeeds, siteModel, research.seedPlan);
    if (!includeNoise && reason) {
      filteredOut.push({ ...row, reason });
    } else {
      cleanKeywords.push(row);
    }
  }

  const clustered = clusterKeywords(cleanKeywords, {
    minClusterSize,
    clusterLimit,
    protectedQueries: protectedQueriesForResearch(research),
    seedPlan: research.seedPlan,
  });
  const validatedPageClusters = validatedExpansionPageClusters(research.seedPlan, clustered.clusters, clustered.mainCluster);
  const pageClusters = [...clustered.clusters, ...validatedPageClusters]
    .sort((a, b) => b.totalImpressions - a.totalImpressions || b.totalBroadImpressions - a.totalBroadImpressions || a.cluster.localeCompare(b.cluster));
  hydrateClustersWithProtectedSeedStats(pageClusters, research.seedStats, research.seedPlan, protectedQueriesForResearch(research));
  const topic = research.requestedSeeds.join(', ');
  const report = {
    ...research,
    topic,
    siteModel,
    keywords: cleanKeywords,
    filteredOut,
    mainKeyword: clustered.mainCluster?.primaryKeyword || '',
    mainPage: clustered.mainCluster ? {
      cluster: clustered.mainCluster.cluster,
      intent: clustered.mainCluster.intent,
      pageType: clustered.mainCluster.pageType,
      slug: '/',
      primaryKeyword: clustered.mainCluster.primaryKeyword,
      secondaryKeywords: clustered.mainCluster.secondaryKeywords,
    } : null,
    clusterCount: pageClusters.length,
    clusters: pageClusters,
    mergedClusters: clustered.mergedClusters,
    orphanKeywords: clustered.orphanKeywords,
    summary: summarizeClusters(pageClusters),
  };
  report.expansionCandidates = expansionCandidates(pageClusters, {
    minImpressions: Math.max(100, numberArg('--expand-threshold', 1000)),
    maxKeywords: Math.max(1, numberArg('--expand-max-keywords', 3)),
    minBroadImpressions: Math.max(100, numberArg('--expand-broad-threshold', 1000)),
    minBroadRatio: Math.max(2, numberArg('--expand-broad-ratio', 5)),
  });

  if (report.keywords.length === 0 && report.errors.length > 0) {
    throw new Error(`Bing returned no usable keywords. First error: ${report.errors[0].message}`);
  }

  if (hasArg('--json')) {
    print(report);
    return;
  }

  const outputArg = getArg('--output');
  const outputPath = resolveOutputPath(outputArg, topic);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, renderKeywordPlanHtml(report), 'utf8');

  print({
    reportPath: outputPath,
    topic,
    period: `${report.startDate}..${report.endDate}`,
    apiRequests: report.apiRequests,
    querySeeds: report.querySeeds.length,
    keywords: report.keywords.length,
    filteredOut: report.filteredOut.length,
    clusters: report.clusterCount,
    mainKeyword: report.mainKeyword,
  });
}

async function queryStats() {
  const config = readConfig();
  const siteUrl = getSiteUrl(config);
  print(await bing('GetQueryStats', { query: { siteUrl } }));
}

async function pageStats() {
  const config = readConfig();
  const siteUrl = getSiteUrl(config);
  print(await bing('GetPageStats', { query: { siteUrl } }));
}

async function addSite() {
  const config = readConfig();
  const siteUrl = getSiteUrl(config);
  print(await bing('AddSite', {
    httpMethod: 'POST',
    body: { siteUrl },
  }));
}

async function keywordConfig() {
  const config = readConfig();
  print({
    source: 'bing-webmaster',
    mode: 'manual-ui-or-export',
    note: 'Bing Webmaster Keyword Research is useful for seed-keyword research, but this local CLI uses the official Webmaster API key endpoints that expose verified-site data and submissions.',
    keywordResearch: config.keywordResearch,
  });
}

function storedPlans() {
  fs.mkdirSync(DEFAULT_PLANS_DIR, { recursive: true });
  const files = fs.readdirSync(DEFAULT_PLANS_DIR)
    .filter((file) => /\.(json|html)$/i.test(file))
    .map((file) => describeStoredPlan(path.join(DEFAULT_PLANS_DIR, file)))
    .sort((a, b) => b.modified.localeCompare(a.modified));

  print({
    plansDir: DEFAULT_PLANS_DIR,
    cacheDir: DEFAULT_CACHE_DIR,
    count: files.length,
    files,
  });
}

function help() {
  console.log(`Usage:
  npm run bing:sites
  npm run bing:quota -- --site https://example.com
  npm run bing:submit-url -- --site https://example.com --url https://example.com/page
  npm run bing:submit-urls -- --site https://example.com --urls https://example.com/a,https://example.com/b
  npm run bing:keyword-stats -- --keyword "essay writing service" --country us --language en-US
  npm run bing:related-keywords -- --keyword "essay writing service" --country us --language en-US
  npm run bing:keyword-research -- --seeds "essay writing service,write my essay" --depth 2 --per-seed 10 --limit 100
  npm run bing:keyword-clusters -- --seeds "essay writing service,write my essay" --depth 2 --per-seed 10 --limit 100
  npm run bing:keyword-site-plan -- --keyword "essay writing service" --depth 2 --per-seed 10 --limit 300
  npm run bing:query-stats -- --site https://example.com
  npm run bing:page-stats -- --site https://example.com
  npm run bing:add-site -- --site https://example.com
  npm run bing:keyword-config
  npm run bing:plans

Config:
  ${DEFAULT_CONFIG}`);
}

async function main() {
  if (command === 'help' || hasArg('--help')) return help();
  if (command === 'sites') return sites();
  if (command === 'quota') return quota();
  if (command === 'submit-url') return submitUrl();
  if (command === 'submit-urls') return submitUrls();
  if (command === 'keyword-stats') return keywordStats();
  if (command === 'related-keywords') return relatedKeywords();
  if (command === 'keyword-research') return keywordResearch();
  if (command === 'keyword-clusters') return keywordClusters();
  if (command === 'keyword-site-plan') return keywordSitePlan();
  if (command === 'query-stats') return queryStats();
  if (command === 'page-stats') return pageStats();
  if (command === 'add-site') return addSite();
  if (command === 'keyword-config') return keywordConfig();
  if (command === 'plans') return storedPlans();
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`[bing-webmaster] ${error.message}`);
  process.exit(1);
});
