import rawConfig from '../../site.config.json' with { type: 'json' };

const trimTrailingSlash = (value) => value.trim().replace(/\/+$/, '');
const ensureLeadingSlash = (value) => (value.startsWith('/') ? value : `/${value}`);

const applyBrandMacros = (value, values) => {
  if (typeof value !== 'string') {
    return value;
  }

  return value.replace(/\{([A-Z][A-Z0-9_]*)\}/g, (match, token) => values[token] ?? match);
};

const resolveMacros = (input, values) => {
  if (typeof input === 'string') {
    return applyBrandMacros(input, values);
  }

  if (Array.isArray(input)) {
    return input.map((item) => resolveMacros(item, values));
  }

  if (input && typeof input === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(input)) {
      result[key] = resolveMacros(value, values);
    }
    return result;
  }

  return input;
};

export const siteConfig = rawConfig;

export const normalizeDomain = (value) => {
  const cleaned = trimTrailingSlash(String(value || '').trim());
  if (!cleaned) {
    throw new Error('site.config.json: domain is required.');
  }

  return /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
};

export const baseUrl = normalizeDomain(siteConfig.domain);
export const brandName = resolveMacros(siteConfig.brandName || 'Your Brand', {});
const macroContext = {
  BRANDNAME: brandName,
  BRAND_NAME: brandName,
  DOMAIN: siteConfig.domain || '',
  BASE_DOMAIN: siteConfig.domain || '',
  BASE_URL: baseUrl,
  DESCRIPTION: siteConfig.description || '',
};

const resolvedDescription = resolveMacros(siteConfig.description || '', macroContext);
const manifestShortName = resolveMacros(siteConfig.manifest?.shortName || brandName, macroContext);
const manifestInput = resolveMacros(siteConfig.manifest || {}, {
  ...macroContext,
  SHORT_NAME: manifestShortName,
});

export const siteDescription = resolvedDescription;
export const adsConfig = resolveMacros(siteConfig.ads || {}, macroContext);
export const robotsConfig = resolveMacros(siteConfig.robots || {}, macroContext);
export const indexNowConfig = resolveMacros(siteConfig.indexNow || {}, macroContext);

export const manifestConfig = {
  ...{
    name: brandName,
    short_name: manifestShortName,
    description: siteDescription,
  },
  ...manifestInput,
  start_url: manifestInput.startUrl || '/',
  icons: manifestInput.icons || [],
};
export const sitemapPath = ensureLeadingSlash(
  (robotsConfig.sitemapPath || '/sitemap.xml'),
);
