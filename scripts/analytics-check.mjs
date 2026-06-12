import fs from 'node:fs';
import path from 'node:path';

import siteConfig from '../site.config.json' with { type: 'json' };

const rootDir = process.cwd();
const envLocalPath = path.join(rootDir, '.env.local');
const env = {
  ...readEnvLocal(),
  ...process.env,
};

const analytics = siteConfig.analytics || {};
const analyticsEnabled = readFlag(env.PUBLIC_ANALYTICS_ENABLED ?? env.ANALYTICS_ENABLED ?? analytics.enabled, true);

if (!analyticsEnabled) {
  console.log('[analytics-check] Analytics is disabled. Deploy can continue.');
  process.exit(0);
}

const gtmId = String(env.PUBLIC_GTM_ID || analytics.gtmId || '').trim();
const ga4MeasurementId = String(env.PUBLIC_GA4_MEASUREMENT_ID || analytics.ga4MeasurementId || '').trim();

const validGtm = /^GTM-[A-Z0-9]+$/i.test(gtmId);
const validGa4 = /^G-[A-Z0-9]+$/i.test(ga4MeasurementId);

if (validGtm || validGa4) {
  console.log('[analytics-check] Analytics tag is configured.');
  if (validGtm) {
    console.log(`[analytics-check] GTM=${gtmId}`);
  }
  if (validGa4) {
    console.log(`[analytics-check] GA4=${ga4MeasurementId}`);
  }
  process.exit(0);
}

console.log('[analytics-check] Analytics tag is not configured.');
console.log('[analytics-check] Simple setup, no Google API, no service account:');
console.log(' - Put GTM container ID in site.config.json: analytics.gtmId = "GTM-XXXXXXX"');
console.log(' - or put GA4 Measurement ID in site.config.json: analytics.ga4MeasurementId = "G-XXXXXXXXXX"');
console.log(' - or write .env.local with: PUBLIC_GTM_ID=GTM-XXXXXXX');
console.log(' - or write .env.local with: PUBLIC_GA4_MEASUREMENT_ID=G-XXXXXXXXXX');
console.log('[analytics-check] Helper command: npm run analytics:gtm:setup -- --gtm-id GTM-XXXXXXX --ga4-id G-XXXXXXXXXX');
process.exit(1);

function readEnvLocal() {
  if (!fs.existsSync(envLocalPath)) {
    return {};
  }

  return fs
    .readFileSync(envLocalPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .reduce((acc, line) => {
      const index = line.indexOf('=');
      if (index <= 0) {
        return acc;
      }
      acc[line.slice(0, index)] = stripQuotes(line.slice(index + 1));
      return acc;
    }, {});
}

function readFlag(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

function stripQuotes(value) {
  return String(value || '').replace(/^"|"$/g, '').replace(/^'|'$/g, '');
}
