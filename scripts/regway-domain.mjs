import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_CONFIG = path.join(os.homedir(), 'credentials', 'regway-domain.json');

const argv = process.argv.slice(2);
const command = argv.find((item) => !item.startsWith('-')) || 'help';

const getArg = (name, fallback = '') => {
  const eq = argv.find((item) => item.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const hasArg = (name) => argv.includes(name);
const normalizeDomain = (value) => String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
const splitDomain = (domain) => {
  const normalized = normalizeDomain(domain);
  const parts = normalized.split('.');
  if (parts.length < 2) throw new Error(`Invalid domain: ${domain}`);
  return {
    domain: normalized,
    name: parts.slice(0, -1).join('.'),
    tld: parts.at(-1),
  };
};

const readJson = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const configPath = path.resolve(getArg('--config', process.env.REGWAY_CONFIG || DEFAULT_CONFIG));

function loadConfig() {
  const config = readJson(configPath);
  const authUserId = String(config.authUserId || process.env.REGWAY_AUTH_USERID || '').trim();
  const apiKey = String(config.apiKey || process.env.REGWAY_API_KEY || '').trim();

  if (!authUserId || !apiKey || apiKey.includes('PUT_')) {
    throw new Error(`Regway credentials are missing. Fill authUserId and apiKey in ${configPath}`);
  }

  return {
    baseUrl: String(config.baseUrl || 'https://httpapi.com').replace(/\/+$/, ''),
    testBaseUrl: String(config.testBaseUrl || 'https://test.httpapi.com').replace(/\/+$/, ''),
    availabilityBaseUrl: String(config.availabilityBaseUrl || 'https://domaincheck.httpapi.com').replace(/\/+$/, ''),
    priceBaseUrl: String(config.priceBaseUrl || config.testBaseUrl || 'https://test.httpapi.com').replace(/\/+$/, ''),
    sandbox: config.sandbox !== false,
    authUserId,
    apiKey,
    defaultYears: Number(config.defaultYears || 1),
    defaultCustomerId: String(config.defaultCustomerId || ''),
    invoiceOption: String(config.invoiceOption || 'KeepInvoice'),
    discountAmount: String(config.discountAmount ?? '0.0'),
    nameservers: Array.isArray(config.nameservers) ? config.nameservers : [],
    contacts: config.contacts || {},
    productKeys: config.productKeys || {},
    testDomain: String(config.testDomain || 'regway-sandbox-test-domain.com'),
  };
}

function authParams(config) {
  return {
    'auth-userid': config.authUserId,
    'api-key': config.apiKey,
  };
}

function appendParams(url, params) {
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.filter((item) => item !== '' && item != null).forEach((item) => url.searchParams.append(key, String(item)));
      return;
    }
    if (value !== '' && value != null) url.searchParams.append(key, String(value));
  });
}

async function requestJson(url, method = 'GET') {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      'User-Agent': 'astro-blank-regway-domain-cli/1.0',
    },
  });
  const text = await response.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {}

  if (!response.ok) {
    if (typeof data === 'string' && /cloudflare|cf-ray|Sorry, you have been blocked/i.test(data)) {
      const ray = data.match(/Cloudflare Ray ID:\\s*<strong[^>]*>([^<]+)/i)?.[1] || response.headers.get('cf-ray') || 'unknown';
      throw new Error(`Regway upstream is blocked by Cloudflare before API auth. Host: ${url.hostname}. Ray ID: ${ray}. Ask Regway support to allow API access from this IP or provide a reseller API host that bypasses the browser WAF.`);
    }
    throw new Error(`Regway API ${method} failed ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }

  return data;
}

async function checkAvailability(config, domains) {
  const parsed = domains.map(splitDomain);
  const url = new URL('/api/domains/available.json', config.availabilityBaseUrl);
  appendParams(url, authParams(config));
  appendParams(url, {
    'domain-name': parsed.map((item) => item.name),
    tlds: [...new Set(parsed.map((item) => item.tld))],
  });
  return requestJson(url);
}

async function getCustomerPrice(config, domain) {
  const { tld } = splitDomain(domain);
  const defaultProductKeys = {
    com: 'domcno',
    org: 'domorg',
    net: 'dotnet',
    info: 'dotinfo',
    biz: 'dotbiz',
  };
  const productKey = config.productKeys[tld] || defaultProductKeys[tld] || `dot${tld.replaceAll('.', '')}`;
  const url = new URL('/api/products/customer-price.json', config.sandbox ? config.priceBaseUrl : config.baseUrl);
  appendParams(url, authParams(config));
  if (config.defaultCustomerId) url.searchParams.set('customer-id', config.defaultCustomerId);

  const data = await requestJson(url);
  const product = data?.[productKey];
  return {
    productKey,
    addNewDomain: product?.addnewdomain || product?.addNewDomain || null,
    raw: product || null,
  };
}

function buildRegisterParams(config, domain) {
  const contacts = config.contacts || {};
  const required = {
    'customer-id': config.defaultCustomerId,
    'reg-contact-id': contacts.registrant,
    'admin-contact-id': contacts.admin,
    'tech-contact-id': contacts.tech,
    'billing-contact-id': contacts.billing,
  };

  const missing = Object.entries(required).filter(([, value]) => value === undefined || value === null || String(value).trim() === '' || String(value).startsWith('PUT_'));
  if (missing.length > 0) {
    throw new Error(`Missing registration fields in ${configPath}: ${missing.map(([key]) => key).join(', ')}`);
  }

  if (config.nameservers.length < 2) {
    throw new Error(`At least two nameservers are required in ${configPath}`);
  }

  return {
    ...authParams(config),
    'domain-name': domain,
    years: config.defaultYears,
    ns: config.nameservers,
    ...required,
    'invoice-option': config.invoiceOption,
    'discount-amount': config.discountAmount,
  };
}

async function registerDomain(config, domain, { live = false } = {}) {
  const normalized = normalizeDomain(domain);
  const confirm = getArg('--confirm-register');

  if (live && config.sandbox) {
    throw new Error('Live registration is blocked because regway-domain.json has sandbox=true.');
  }

  if (live && confirm !== normalized) {
    throw new Error(`Live registration requires --confirm-register ${normalized}`);
  }

  const url = new URL('/api/domains/register.json', live ? config.baseUrl : config.testBaseUrl);
  appendParams(url, buildRegisterParams(config, normalized));

  return requestJson(url, live ? 'POST' : 'GET');
}

function suggestDomains(input) {
  const base = normalizeDomain(input).replace(/\.[a-z0-9.-]+$/i, '').replace(/[^a-z0-9-]/g, '');
  const tlds = getArg('--tlds', 'com,net,org,io,co').split(',').map((item) => item.trim().replace(/^\./, '')).filter(Boolean);
  const prefixes = ['', 'get', 'try', 'go', 'my'];
  const suffixes = ['', 'app', 'hq', 'pro', 'now'];
  const names = new Set();
  for (const prefix of prefixes) {
    for (const suffix of suffixes) {
      const label = `${prefix}${base}${suffix}`.replace(/-+/g, '-');
      if (label.length >= 3) tlds.forEach((tld) => names.add(`${label}.${tld}`));
    }
  }
  return [...names].slice(0, Number(getArg('--limit', 20)));
}

function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

function printHelp() {
  console.log(`Usage:
  npm run domain:check -- --domain example.com
  npm run domain:price -- --domain example.com
  npm run domain:suggest -- --keyword brand --tlds com,net,org
  npm run domain:buy-test -- --domain example.com
  npm run domain:register -- --domain example.com --live --confirm-register example.com

Config:
  ${DEFAULT_CONFIG}

Safety:
  buy-test always uses https://test.httpapi.com/
  register requires sandbox=false, --live, and --confirm-register <domain>`);
}

async function main() {
  if (command === 'help' || hasArg('--help')) {
    printHelp();
    return;
  }

  const config = loadConfig();
  const domain = getArg('--domain', config.testDomain);

  if (command === 'check') {
    printJson(await checkAvailability(config, [domain]));
    return;
  }

  if (command === 'price') {
    printJson(await getCustomerPrice(config, domain));
    return;
  }

  if (command === 'suggest') {
    const keyword = getArg('--keyword', domain);
    const suggestions = suggestDomains(keyword);
    printJson({
      suggestions,
      availability: hasArg('--check') ? await checkAvailability(config, suggestions) : undefined,
    });
    return;
  }

  if (command === 'buy-test') {
    console.log(`[regway] sandbox register test for ${normalizeDomain(domain)} via ${config.testBaseUrl}`);
    printJson(await registerDomain(config, domain, { live: false }));
    return;
  }

  if (command === 'register') {
    printJson(await registerDomain(config, domain, { live: hasArg('--live') }));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`[regway] ${error.message}`);
  process.exit(1);
});
