import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const rootDir = process.cwd();
const siteConfigPath = path.join(rootDir, 'site.config.json');
const envLocalPath = path.join(rootDir, '.env.local');

const siteConfig = readJson(siteConfigPath);
const args = process.argv.slice(2);

const hasArg = (name) => args.includes(name);
const getArgValue = (name) => {
  const withEq = args.find((item) => item.startsWith(`${name}=`));
  if (withEq) {
    const [, value] = withEq.split('=', 2);
    return value;
  }

  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) {
    return undefined;
  }

  return args[index + 1];
};

const isDryRun = hasArg('--dry-run');
const force = hasArg('--force');
const ensure = hasArg('--ensure');

if (!ensure && !force && !isDryRun) {
  console.log('[ga4-bootstrap] No action: pass --ensure or --force. Use --dry-run for preview.');
  process.exit(0);
}

const env = loadEnvLocal();
const analyticsConfig = siteConfig.analytics || {};
const envEnabled = typeof process.env.GA4_ENABLED !== 'undefined'
  ? resolveFlag(process.env.GA4_ENABLED, true)
  : undefined;
const analyticsEnabled = envEnabled ?? resolveFlag(analyticsConfig.enabled, true);

const macroContext = {
  BRANDNAME: siteConfig.brandName || '',
  BRAND_NAME: siteConfig.brandName || '',
  DOMAIN: siteConfig.domain || '',
  BASE_DOMAIN: siteConfig.domain || '',
  BASE_URL: normalizeDomain(siteConfig.domain || ''),
  DESCRIPTION: siteConfig.description || '',
};

const finalEnv = {
  ...env,
  ...(process.env ?? {}),
};

const preferredDomain = normalizeStreamDomain(
  getArgValue('--domain')
  || finalEnv.GA4_STREAM_DOMAIN
  || applyMacros(analyticsConfig.streamDomain || siteConfig.domain || '', macroContext)
  || finalEnv.PUBLIC_GA4_STREAM_DOMAIN
  || siteConfig.domain
  || '',
);

const preferredProject = getArgValue('--project')
  || finalEnv.GA4_PROJECT_ID
  || finalEnv.GA4_ACCOUNT_ID
  || analyticsConfig.projectId
  || '';

const preferredServiceAccount = getArgValue('--service-account')
  || finalEnv.GA4_SERVICE_ACCOUNT_EMAIL
  || finalEnv.GA4_CLIENT_EMAIL
  || analyticsConfig.serviceAccountEmail
  || '';

const preferredCredentialFile = getArgValue('--credentials-file')
  || finalEnv.GA4_CREDENTIAL_FILE
  || finalEnv.GOOGLE_APPLICATION_CREDENTIALS
  || finalEnv.GA4_CREDENTIALS_FILE
  || '';

const credentialsDir = getArgValue('--credentials-dir')
  || finalEnv.GA4_CREDENTIALS_DIR
  || applyMacros(analyticsConfig.credentialsDir || '', macroContext)
  || path.join(os.homedir(), 'credentials');

const existingMeasurementId = finalEnv.PUBLIC_GA4_MEASUREMENT_ID;
const existingPropertyId = finalEnv.PUBLIC_GA4_PROPERTY_ID;

if (analyticsEnabled === false) {
  console.log('[ga4-bootstrap] Analytics auto-setup is disabled in site.config.json (analytics.enabled=false).');
  process.exit(0);
}

if (existingMeasurementId && existingPropertyId && !force && !isDryRun) {
  console.log('[ga4-bootstrap] GA4 is already configured in .env.local.');
  process.exit(0);
}

const candidates = resolveCredentialCandidates(credentialsDir);
if (!candidates.length) {
  if (!isDryRun) {
    console.log('[ga4-bootstrap] No JSON credentials found.');
    console.log(`Checked folder: ${credentialsDir}`);
    if (ensure && !force) {
      console.log('[ga4-bootstrap] Skipping GA setup because no credentials are available.');
      process.exit(0);
    }
    process.exit(1);
  }

  console.log('[ga4-bootstrap] DRY RUN: no credentials found.');
  logPlannedEnv({
    GA4_PLAN: 'credentials_not_found',
    GA4_CREDENTIALS_DIR: credentialsDir,
    GA4_STREAM_DOMAIN: preferredDomain,
  });
  process.exit(0);
}

const chosen = selectCredential(candidates, preferredProject, preferredServiceAccount, preferredCredentialFile);
if (!chosen) {
  console.log('[ga4-bootstrap] No valid credentials found with provided filters.');
  if (candidates.length) {
    console.log('Available files:');
    for (const item of candidates) {
      console.log(` - ${item.basename} (project: ${item.projectId || 'unknown'})`);
    }
  }
  if (ensure && !force) {
    console.log('[ga4-bootstrap] Skipping GA setup because the filters did not match any credential file.');
    process.exit(0);
  }
  process.exit(1);
}

if (isDryRun) {
  console.log('[ga4-bootstrap] DRY RUN: selected credential file and planned setup.');
  logPlannedEnv({
    GA4_PLAN: 'create_if_missing',
    GA4_CREDENTIALS_DIR: credentialsDir,
    GA4_CREDENTIAL_FILE: chosen.file,
    GA4_STREAM_DOMAIN: preferredDomain,
    GA4_PROJECT_HINT: preferredProject || '(not set)',
    GA4_SERVICE_ACCOUNT_HINT: preferredServiceAccount || '(not set)',
  });

  if (!existingMeasurementId || !existingPropertyId) {
    console.log('[ga4-bootstrap] Would create or reuse a GA4 property and web stream for this domain.');
  } else {
    console.log('[ga4-bootstrap] GA4 config exists in .env.local; no create actions would be run.');
  }

  process.exit(0);
}

const credential = loadCredential(chosen.file);
const token = await fetchAccessToken(credential);
const apiBase = 'https://analyticsadmin.googleapis.com/v1beta';

const accounts = await analyticsGetAll(`${apiBase}/accounts`, token);
if (!accounts.length) {
  throw new Error('No Google Analytics accounts available for this service account.');
}

const account = pickAccount(accounts, preferredProject);
if (!account) {
  throw new Error('No Analytics account matches configured filters.');
}

const accountName = account.name;
const accountId = accountName.replace('accounts/', '');

const properties = await listProperties(accountName, token, apiBase);
const desiredPropertyName = `${siteConfig.brandName || 'Website'} · Web`;
const propertyNameTemplate = applyMacros(analyticsConfig.propertyName || desiredPropertyName, macroContext);
const streamNameTemplate = applyMacros(analyticsConfig.streamName || `${propertyNameTemplate} Web`, macroContext);
const property = await ensureProperty(accountName, properties, {
  displayName: propertyNameTemplate,
  streamDomain: preferredDomain,
  timeZone: finalEnv.GA4_TIME_ZONE || analyticsConfig.timeZone || siteConfig.timeZone,
  currencyCode: analyticsConfig.currencyCode || 'USD',
  token,
  apiBase,
});

const propertyId = String(property.name).replace('properties/', '');
const streams = await analyticsGetAll(`${apiBase}/${String(property.name)}/dataStreams`, token);

const propertyDisplayName = property.displayName || propertyNameTemplate;
const stream = await ensureStream(property.name, streams, {
  displayName: streamNameTemplate,
  defaultUri: preferredDomain,
  token,
  apiBase,
});

const streamPath = String(stream.name || '').replace(`${property.name}/`, '');

const nextEnv = {
  ...env,
  PUBLIC_GA4_ENABLED: 'true',
  PUBLIC_GA4_ACCOUNT_ID: accountId,
  PUBLIC_GA4_PROPERTY_ID: String(propertyId),
  PUBLIC_GA4_STREAM_ID: streamPath,
  PUBLIC_GA4_MEASUREMENT_ID: stream.measurementId || stream.webStreamData?.measurementId || '',
  PUBLIC_GA4_STREAM_DOMAIN: stream.webStreamData?.defaultUri || preferredDomain,
  PUBLIC_GA4_CREDENTIALS_FILE: chosen.file,
  GOOGLE_APPLICATION_CREDENTIALS: chosen.file,
};

writeEnvLocal(nextEnv);

console.log('[ga4-bootstrap] GA4 setup completed and written to .env.local.');
console.log(`[ga4-bootstrap] account=${nextEnv.PUBLIC_GA4_ACCOUNT_ID}`);
console.log(`[ga4-bootstrap] property=${nextEnv.PUBLIC_GA4_PROPERTY_ID}`);
console.log(`[ga4-bootstrap] streamId=${nextEnv.PUBLIC_GA4_STREAM_ID}`);
console.log(`[ga4-bootstrap] measurementId=${nextEnv.PUBLIC_GA4_MEASUREMENT_ID}`);

function resolveCredentialCandidates(rawDir) {
  const dir = expandPath(rawDir);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return [];
  }

  const names = fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.json'))
    .map((name) => path.join(dir, name))
    .filter((filePath) => fs.existsSync(filePath) && fs.statSync(filePath).isFile());

  const loaded = [];

  for (const filePath of names) {
    const parsed = safeJson(filePath);
    if (!parsed) {
      continue;
    }

    const clientEmail = parsed.client_email || '';
    const projectId = parsed.project_id || parsed.projectId || '';
    if (!clientEmail || !projectId) {
      continue;
    }

    loaded.push({
      file: filePath,
      basename: path.basename(filePath),
      projectId,
      clientEmail,
    });
  }

  if (chosenCredentialNoticeAllowed(loaded, preferredCredentialFile)) {
    const list = loaded.map((item) => `${item.basename} (project: ${item.projectId})`);
    const chosenName = preferredCredentialFile
      ? path.basename(resolveCredentialPath(preferredCredentialFile))
      : loaded[0]?.basename;
    const extraCount = list.length - 1;
    console.log('[ga4-bootstrap] Multiple credentials detected.');
    console.log(`Using: ${chosenName}`);
    if (extraCount > 0) {
      console.log(`Available: ${list.join(', ')}`);
      console.log('Set --credentials-file or GA4_CREDENTIAL_FILE/GOOGLE_APPLICATION_CREDENTIALS to force a specific file.');
    }
  }

  return loaded;
}

function chosenCredentialNoticeAllowed(candidates, preferred) {
  return candidates.length > 1 && !preferred;
}

function resolveCredentialPath(rawPath) {
  const value = expandPath(rawPath).replace(/^"|"$/g, '');
  if (!value) {
    return value;
  }

  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
}

function selectCredential(candidates, preferredProject, preferredServiceAccount, preferredFileRaw) {
  if (preferredFileRaw) {
    const preferredPath = resolveCredentialPath(preferredFileRaw);
    if (preferredPath && fs.existsSync(preferredPath)) {
      return candidates.find((item) => item.file === preferredPath) || {
        file: preferredPath,
        basename: path.basename(preferredPath),
        projectId: '',
        clientEmail: '',
      };
    }

    if (preferredPath && candidates.length === 1) {
      const only = candidates[0];
      if (only.file === preferredPath) {
        return only;
      }
    }
  }

  const byProject = preferredProject
    ? candidates.find((item) => item.projectId === preferredProject)
    : null;
  if (byProject) {
    return byProject;
  }

  const byEmail = preferredServiceAccount
    ? candidates.find((item) => item.clientEmail === preferredServiceAccount)
    : null;
  if (byEmail) {
    return byEmail;
  }

  return candidates[0] || null;
}

function pickAccount(accounts, preferredProject) {
  if (preferredProject) {
    const preferred = accounts.find((account) => {
      const normalized = String(account.name || '');
      return normalized.endsWith(`/${preferredProject}`) || account.accountId === preferredProject;
    });

    if (preferred) {
      return preferred;
    }
  }

  return accounts[0];
}

async function listProperties(accountName, token, apiBase) {
  const response = await analyticsGet(`${apiBase}/${accountName}/properties`, token);
  return response.properties || [];
}

function chooseExistingProperty(properties, options) {
  const target = normalizeForMatch(options.streamDomain);
  const candidate = properties.find((property) => {
    const name = property.displayName || '';
    return normalizeForMatch(name).includes(target) || normalizeForMatch(name).includes(normalizeForMatch(options.displayName));
  });
  return candidate || null;
}

async function ensureProperty(accountName, properties, options) {
  const existing = chooseExistingProperty(properties, options);
  if (existing && existing.name) {
    return existing;
  }

  const created = await analyticsPost(`${options.apiBase}/${accountName}/properties`, {
    parent: accountName,
    displayName: options.displayName,
    currencyCode: options.currencyCode || 'USD',
    timeZone: options.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  }, options.token);

  return created;
}

function chooseExistingStream(streams, defaultUri) {
  const target = normalizeForMatch(defaultUri);
  return streams.find((stream) => {
    const uri = stream.webStreamData?.defaultUri || '';
    return normalizeForMatch(uri) === target;
  }) || streams.find((stream) => stream.webStreamData?.measurementId) || null;
}

async function ensureStream(propertyName, streams, options) {
  const existing = chooseExistingStream(streams, options.defaultUri);
  if (existing && existing.name) {
    return existing;
  }

  return analyticsPost(`${options.apiBase}/${propertyName}/dataStreams`, {
    displayName: options.displayName,
    type: 'WEB_DATA_STREAM',
    webStreamData: {
      defaultUri: options.defaultUri,
    },
  }, options.token);
}

async function analyticsGetAll(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Analytics API GET failed ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

async function analyticsGet(url, token) {
  return analyticsGetAll(url, token);
}

async function analyticsPost(url, body, token) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Analytics API POST failed ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

function fetchAccessToken(credential) {
  return (async () => {
    const now = Math.floor(Date.now() / 1000);
    const jwtHeader = {
      alg: 'RS256',
      typ: 'JWT',
    };
    const jwtPayload = {
      iss: credential.client_email,
      scope: 'https://www.googleapis.com/auth/analytics.edit https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    };

    const base64Header = base64UrlEncode(JSON.stringify(jwtHeader));
    const base64Payload = base64UrlEncode(JSON.stringify(jwtPayload));
    const tokenInput = `${base64Header}.${base64Payload}`;

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(tokenInput);
    signer.end();
    const signature = signer.sign(credential.private_key, 'base64url');

    const assertion = `${tokenInput}.${signature}`;

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.access_token) {
      throw new Error(`OAuth error ${response.status}: ${data.error || data.error_description || 'no token'}`);
    }

    return data.access_token;
  })();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizeDomain(rawDomain) {
  const cleaned = String(rawDomain || '').trim().replace(/\/+$/, '');
  if (!cleaned) {
    return '';
  }

  return /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
}

function applyMacros(value, ctx) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.replace(/\{([A-Z0-9_]+)\}/g, (match, token) => ctx[token] ?? match);
}

function safeJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function loadCredential(rawPath) {
  const filePath = expandPath(rawPath);
  const content = safeJson(filePath);
  if (!content || !content.client_email || !content.private_key) {
    throw new Error(`Invalid service-account key: ${rawPath}`);
  }
  return content;
}

function loadEnvLocal() {
  if (!fs.existsSync(envLocalPath)) {
    return {};
  }

  return fs
    .readFileSync(envLocalPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .reduce((acc, line) => {
      const separator = line.indexOf('=');
      if (separator === -1) {
        return acc;
      }

      const key = line.slice(0, separator);
      const value = line.slice(separator + 1);
      acc[key] = stripQuotes(value);
      return acc;
    }, {});
}

function writeEnvLocal(values) {
  const allowed = [
    'PUBLIC_GA4_ENABLED',
    'PUBLIC_GA4_ACCOUNT_ID',
    'PUBLIC_GA4_PROPERTY_ID',
    'PUBLIC_GA4_STREAM_ID',
    'PUBLIC_GA4_MEASUREMENT_ID',
    'PUBLIC_GA4_STREAM_DOMAIN',
    'PUBLIC_GA4_CREDENTIALS_FILE',
    'GOOGLE_APPLICATION_CREDENTIALS',
  ];

  const next = { ...env };
  for (const key of allowed) {
    if (values[key]) {
      next[key] = values[key];
    }
  }

  const output = Object.entries(next)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${escapeEnvValue(String(value))}`)
    .join('\n');

  fs.writeFileSync(envLocalPath, `${output}\n`, 'utf8');
}

function stripQuotes(value) {
  return value.replace(/^\"|\"$/g, '').replace(/^'|'$/g, '');
}

function escapeEnvValue(value) {
  if (/[\n\r\" ]/.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

function resolveFlag(value, defaultValue) {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return String(value).toLowerCase() !== 'false';
}

function normalizeStreamDomain(rawDomain) {
  const trimmed = String(rawDomain || '').trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.replace(/\/$/, '');
}

function normalizeForMatch(value) {
  return String(value || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
}

function logPlannedEnv(values) {
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined) {
      console.log(`  ${key}=${value}`);
    }
  });
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function expandPath(rawPath) {
  if (!rawPath) {
    return rawPath;
  }

  const expanded = String(rawPath).trim().replace(/^~(?=$|[\/\\])/, os.homedir());
  return expanded;
}
