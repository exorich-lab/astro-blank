import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const rootDir = process.cwd();
const siteConfigPath = path.join(rootDir, 'site.config.json');
const envLocalPath = path.join(rootDir, '.env.local');

const CREDENTIALS_DIR = '/Users/sergejapetenok/credentials';
const SERVICE_ACCOUNT_FILE = path.join(CREDENTIALS_DIR, 'allbiz-1544779694702-a214e2f6806c.json');

const SCOPES = [
  'https://www.googleapis.com/auth/analytics.edit',
  'https://www.googleapis.com/auth/tagmanager.edit.containers',
  'https://www.googleapis.com/auth/tagmanager.edit.containerversions',
  'https://www.googleapis.com/auth/tagmanager.publish'
].join(' ');

// Load configuration
if (!fs.existsSync(siteConfigPath)) {
  console.error('[analytics-bootstrap] site.config.json not found in root.');
  process.exit(1);
}

const siteConfig = JSON.parse(fs.readFileSync(siteConfigPath, 'utf8'));
const brandName = siteConfig.brandName || 'My Brand';
const domain = siteConfig.domain || '';

if (!domain) {
  console.error('[analytics-bootstrap] No domain specified in site.config.json.');
  process.exit(1);
}

const macroContext = {
  BRANDNAME: brandName,
  BRAND_NAME: brandName,
  DOMAIN: domain,
  BASE_DOMAIN: domain,
  BASE_URL: domain.startsWith('http') ? domain : `https://${domain}`,
};

const applyMacros = (value, ctx) => {
  if (typeof value !== 'string') return value;
  return value.replace(/\{([A-Z0-9_]+)\}/g, (match, token) => ctx[token] ?? match);
};

const gaPropertyName = applyMacros(siteConfig.analytics?.propertyName || '{BRANDNAME} · Web', macroContext);
const gaStreamName = applyMacros(siteConfig.analytics?.streamName || '{BRANDNAME} · Main Site', macroContext);
const gtmContainerName = domain;

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// Generate JWT token
async function fetchAccessToken(credential, scopes) {
  const now = Math.floor(Date.now() / 1000);
  const jwtHeader = { alg: 'RS256', typ: 'JWT' };
  const jwtPayload = {
    iss: credential.client_email,
    scope: scopes,
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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(`OAuth error ${response.status}: ${JSON.stringify(data)}`);
  }

  return data.access_token;
}

// REST call helpers
async function apiCall(url, method = 'GET', body = null, token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(`API Call failed ${response.status}: ${JSON.stringify(data)}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

// Read existing .env.local
function readEnvLocal() {
  if (!fs.existsSync(envLocalPath)) return {};
  return fs
    .readFileSync(envLocalPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .reduce((acc, line) => {
      const separator = line.indexOf('=');
      if (separator === -1) return acc;
      const key = line.slice(0, separator);
      let value = line.slice(separator + 1);
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      acc[key] = value;
      return acc;
    }, {});
}

// Save back to .env.local
function writeEnvLocal(values) {
  const current = readEnvLocal();
  const next = { ...current, ...values };

  const output = Object.entries(next)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  fs.writeFileSync(envLocalPath, `${output}\n`, 'utf8');
}

// Handle API service enablement errors
function handleApiError(error) {
  const message = String(error.message || '').toLowerCase();
  const data = error.data || {};
  const status = error.status;

  if (status === 403 && (message.includes('service_disabled') || message.includes('has not been used in project'))) {
    console.error('\n================================================================');
    console.error('❌ ERROR: A required Google API is disabled on your project.');
    console.error('Please visit the following links in your browser to enable them:');
    console.error('1. Service Usage API:');
    console.error('   https://console.developers.google.com/apis/api/serviceusage.googleapis.com/overview?project=allbiz-1544779694702');
    console.error('2. Tag Manager API:');
    console.error('   https://console.developers.google.com/apis/api/tagmanager.googleapis.com/overview?project=allbiz-1544779694702');
    console.error('3. Analytics Admin API:');
    console.error('   https://console.developers.google.com/apis/api/analyticsadmin.googleapis.com/overview?project=allbiz-1544779694702');
    console.error('================================================================\n');
    process.exit(1);
  }

  throw error;
}

const TOKENS_FILE = path.join(CREDENTIALS_DIR, 'analytics-tokens.json');

async function run() {
  console.log('[analytics-bootstrap] Starting automated setup...');

  let token;

  if (fs.existsSync(TOKENS_FILE)) {
    console.log(`[analytics-bootstrap] Authenticating with OAuth refresh token from ${TOKENS_FILE}...`);
    try {
      const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: tokens.client_id,
          client_secret: tokens.client_secret,
          refresh_token: tokens.refresh_token,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.access_token) {
        throw new Error(`Token refresh error: ${JSON.stringify(data)}`);
      }
      token = data.access_token;
      console.log('[analytics-bootstrap] Successfully authenticated with personal credentials.');
    } catch (err) {
      console.error('[analytics-bootstrap] Failed to authenticate using refresh token:', err.message);
      process.exit(1);
    }
  } else {
    if (!fs.existsSync(SERVICE_ACCOUNT_FILE)) {
      console.error(`[analytics-bootstrap] Credentials not found. Please run "node scripts/oauth-setup.mjs" or place a service account key at ${SERVICE_ACCOUNT_FILE}`);
      process.exit(1);
    }

    const credential = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_FILE, 'utf8'));
    console.log(`[analytics-bootstrap] Authenticating service account: ${credential.client_email}`);

    try {
      token = await fetchAccessToken(credential, SCOPES);
    } catch (err) {
      console.error('[analytics-bootstrap] Failed to generate OAuth token:', err.message);
      process.exit(1);
    }
  }

  let ga4MeasurementId = '';
  let ga4AccountId = '';
  let ga4PropertyId = '';
  let ga4StreamId = '';

  // 1. Google Analytics 4 Setup
  try {
    console.log('[analytics-bootstrap] Step 1: Configuring Google Analytics 4...');
    const accountsRes = await apiCall('https://analyticsadmin.googleapis.com/v1beta/accounts', 'GET', null, token).catch(handleApiError);
    const accounts = accountsRes.accounts || [];

    if (!accounts.length) {
      console.error('\n================================================================');
      console.error('❌ ERROR: No Google Analytics accounts found.');
      console.error('Please open your Google Analytics interface and verify your access.');
      console.error('================================================================\n');
      process.exit(1);
    }

    const preferredAccountId = siteConfig.analytics?.accountId || '';
    const preferredAccountName = siteConfig.analytics?.accountName || '';

    const sortedAccounts = [...accounts].sort((a, b) => {
      const aId = a.name.split('/').pop();
      const bId = b.name.split('/').pop();

      // 1. Exact Account ID match
      if (preferredAccountId) {
        if (aId === String(preferredAccountId) && bId !== String(preferredAccountId)) return -1;
        if (bId === String(preferredAccountId) && aId !== String(preferredAccountId)) return 1;
      }

      // 2. Exact Account Name match
      if (preferredAccountName) {
        if (a.displayName === preferredAccountName && b.displayName !== preferredAccountName) return -1;
        if (b.displayName === preferredAccountName && a.displayName !== preferredAccountName) return 1;
      }

      // 3. Display name containing "Основной" or "Main" (case insensitive)
      const aIsMain = /основной|main/i.test(a.displayName);
      const bIsMain = /основной|main/i.test(b.displayName);
      if (aIsMain && !bIsMain) return -1;
      if (bIsMain && !aIsMain) return 1;

      return 0;
    });

    let selectedAccount = null;
    let properties = [];

    for (const account of sortedAccounts) {
      try {
        console.log(`[analytics-bootstrap] Trying GA4 Account: ${account.displayName} (${account.name.split('/').pop()})...`);
        const propertiesRes = await apiCall(`https://analyticsadmin.googleapis.com/v1beta/properties?filter=parent:${account.name}`, 'GET', null, token);
        properties = propertiesRes.properties || [];
        selectedAccount = account;
        ga4AccountId = account.name.split('/').pop();
        console.log(`[analytics-bootstrap] Successfully selected GA4 Account: ${account.displayName}`);
        break;
      } catch (err) {
        console.log(`[analytics-bootstrap] Account ${account.displayName} skipped: ${err.message}`);
      }
    }

    if (!selectedAccount) {
      console.error('\n================================================================');
      console.error('❌ ERROR: Could not find any GA4-compatible Google Analytics accounts.');
      console.error('All available accounts failed to list properties (likely legacy UA-only accounts).');
      console.error('================================================================\n');
      process.exit(1);
    }

    let property = properties.find((p) => p.displayName === gaPropertyName);

    if (!property) {
      console.log(`[analytics-bootstrap] Creating GA4 Property: "${gaPropertyName}"...`);
      property = await apiCall(`https://analyticsadmin.googleapis.com/v1beta/properties`, 'POST', {
        parent: selectedAccount.name,
        displayName: gaPropertyName,
        timeZone: siteConfig.timeZone || 'UTC',
        currencyCode: siteConfig.analytics?.currencyCode || 'USD',
      }, token);
    } else {
      console.log(`[analytics-bootstrap] Reusing existing GA4 Property: "${gaPropertyName}"`);
    }
    ga4PropertyId = property.name.split('/').pop();

    // List streams
    const streamsRes = await apiCall(`https://analyticsadmin.googleapis.com/v1beta/${property.name}/dataStreams`, 'GET', null, token);
    const streams = streamsRes.dataStreams || [];
    const normalizedTargetDomain = domain.replace(/^https?:\/\//i, '').toLowerCase();

    let stream = streams.find((s) => {
      const uri = (s.webStreamData?.defaultUri || '').replace(/^https?:\/\//i, '').toLowerCase();
      return uri === normalizedTargetDomain;
    });

    if (!stream) {
      console.log(`[analytics-bootstrap] Creating Web Data Stream for domain: "${domain}"...`);
      const streamUri = domain.startsWith('http') ? domain : `https://${domain}`;
      stream = await apiCall(`https://analyticsadmin.googleapis.com/v1beta/${property.name}/dataStreams`, 'POST', {
        type: 'WEB_DATA_STREAM',
        displayName: gaStreamName,
        webStreamData: {
          defaultUri: streamUri,
        },
      }, token);
    } else {
      console.log(`[analytics-bootstrap] Reusing existing Web Data Stream`);
    }

    ga4StreamId = stream.name.split('/').pop();
    ga4MeasurementId = stream.measurementId || stream.webStreamData?.measurementId;
    console.log(`[analytics-bootstrap] GA4 Measurement ID: ${ga4MeasurementId}`);

  } catch (err) {
    console.error('[analytics-bootstrap] GA4 configuration failed:', err.message);
    process.exit(1);
  }

  let gtmContainerId = '';

  // 2. Google Tag Manager Setup
  try {
    console.log('[analytics-bootstrap] Step 2: Configuring Google Tag Manager...');
    const gtmAccountsRes = await apiCall('https://tagmanager.googleapis.com/tagmanager/v2/accounts', 'GET', null, token).catch(handleApiError);
    const gtmAccounts = gtmAccountsRes.account || [];

    if (!gtmAccounts.length) {
      console.error('\n================================================================');
      console.error('❌ ERROR: No Google Tag Manager accounts found.');
      console.error('Please open your Google Tag Manager interface and verify your access.');
      console.error('================================================================\n');
      process.exit(1);
    }

    const gtmAccount = gtmAccounts[0];
    console.log(`[analytics-bootstrap] GTM Account selected: ${gtmAccount.name} (${gtmAccount.accountId})`);

    // List containers
    const containersRes = await apiCall(`https://tagmanager.googleapis.com/tagmanager/v2/accounts/${gtmAccount.accountId}/containers`, 'GET', null, token);
    const containers = containersRes.container || [];
    let container = containers.find((c) => c.name === gtmContainerName || c.publicId === siteConfig.analytics?.gtmId);

    if (!container) {
      console.log(`[analytics-bootstrap] Creating GTM Container: "${gtmContainerName}"...`);
      container = await apiCall(`https://tagmanager.googleapis.com/tagmanager/v2/accounts/${gtmAccount.accountId}/containers`, 'POST', {
        name: gtmContainerName,
        usageContext: ['web'],
      }, token);
    } else {
      console.log(`[analytics-bootstrap] Reusing existing GTM Container: "${container.name}" (${container.publicId})`);
    }
    gtmContainerId = container.publicId;

    // Get default workspace
    const workspacesRes = await apiCall(`https://tagmanager.googleapis.com/tagmanager/v2/${container.path}/workspaces`, 'GET', null, token);
    const workspaces = workspacesRes.workspace || [];
    let workspace = workspaces[0]; // Usually default workspace

    if (!workspace) {
      console.log('[analytics-bootstrap] No GTM Workspace found. Creating default workspace...');
      workspace = await apiCall(`https://tagmanager.googleapis.com/tagmanager/v2/${container.path}/workspaces`, 'POST', {
        name: 'Default Workspace',
      }, token);
    }

    console.log(`[analytics-bootstrap] GTM Workspace active: "${workspace.name}"`);
    
    // Get triggers in workspace
    const triggersRes = await apiCall(`https://tagmanager.googleapis.com/tagmanager/v2/${workspace.path}/triggers`, 'GET', null, token);
    const triggers = triggersRes.trigger || [];
    let customTrigger = triggers.find((t) => t.type === 'pageview');

    if (!customTrigger) {
      console.log('[analytics-bootstrap] Creating custom pageview trigger for All Pages...');
      customTrigger = await apiCall(`https://tagmanager.googleapis.com/tagmanager/v2/${workspace.path}/triggers`, 'POST', {
        name: 'All Pages Custom',
        type: 'pageview'
      }, token);
    }

    const triggerId = customTrigger.triggerId;

    // Check if Google Tag / GA4 Config exists
    const tagsRes = await apiCall(`https://tagmanager.googleapis.com/tagmanager/v2/${workspace.path}/tags`, 'GET', null, token);
    const tags = tagsRes.tag || [];
    let googleTag = tags.find((t) => (t.type === 'gaawc' || t.type === 'googtag') && t.parameter?.some((p) => p.value === ga4MeasurementId));

    if (!googleTag) {
      const existingTagByName = tags.find((t) => t.name === 'GA4 Configuration');
      if (existingTagByName) {
        console.log(`[analytics-bootstrap] Updating existing GA4 Configuration Tag with Measurement ID: ${ga4MeasurementId}...`);
        const hasTagId = existingTagByName.parameter?.some(p => p.key === 'tagId');
        const key = hasTagId || existingTagByName.type === 'googtag' ? 'tagId' : 'measurementId';
        
        googleTag = await apiCall(`https://tagmanager.googleapis.com/tagmanager/v2/${existingTagByName.path}`, 'PUT', {
          ...existingTagByName,
          parameter: [
            {
              type: 'template',
              key: key,
              value: ga4MeasurementId,
            },
          ],
          firingTriggerId: [triggerId],
        }, token);
        console.log('[analytics-bootstrap] Updated GA4 Configuration Tag inside workspace.');
      } else {
        console.log(`[analytics-bootstrap] Creating GA4 Config Tag for Measurement ID: ${ga4MeasurementId}...`);
        googleTag = await apiCall(`https://tagmanager.googleapis.com/tagmanager/v2/${workspace.path}/tags`, 'POST', {
          name: 'GA4 Configuration',
          type: 'gaawc',
          parameter: [
            {
              type: 'template',
              key: 'measurementId',
              value: ga4MeasurementId,
            },
          ],
          firingTriggerId: [triggerId],
        }, token);
        console.log('[analytics-bootstrap] Created GA4 Configuration Tag inside workspace.');
      }
    } else {
      console.log('[analytics-bootstrap] GA4 Configuration Tag already configured in workspace.');
    }

    // Publish Workspace Version
    console.log('[analytics-bootstrap] Creating workspace version and publishing container...');
    const versionRes = await apiCall(`https://tagmanager.googleapis.com/tagmanager/v2/${workspace.path}:create_version`, 'POST', {
      name: `Auto GA4 integration: ${ga4MeasurementId}`,
    }, token);

    const containerVersion = versionRes.containerVersion;
    console.log(`[analytics-bootstrap] Created Container Version ${containerVersion.containerVersionId}`);

    const publishRes = await apiCall(`https://tagmanager.googleapis.com/tagmanager/v2/${containerVersion.path}:publish`, 'POST', null, token);
    console.log('[analytics-bootstrap] Google Tag Manager Container published successfully!');

  } catch (err) {
    console.error('[analytics-bootstrap] GTM configuration failed:', err.message);
    process.exit(1);
  }

  // 3. Write variables to .env.local and site.config.json
  try {
    // Write to .env.local
    writeEnvLocal({
      PUBLIC_GTM_ID: gtmContainerId,
      PUBLIC_GA4_ENABLED: 'true',
      PUBLIC_GA4_MEASUREMENT_ID: ga4MeasurementId,
      PUBLIC_GA4_ACCOUNT_ID: ga4AccountId,
      PUBLIC_GA4_PROPERTY_ID: ga4PropertyId,
      PUBLIC_GA4_STREAM_ID: ga4StreamId,
      PUBLIC_GA4_STREAM_DOMAIN: domain,
      PUBLIC_GA4_CREDENTIALS_FILE: SERVICE_ACCOUNT_FILE,
      GOOGLE_APPLICATION_CREDENTIALS: SERVICE_ACCOUNT_FILE,
    });

    // Write to site.config.json
    siteConfig.analytics = siteConfig.analytics || {};
    siteConfig.analytics.gtmId = gtmContainerId;
    siteConfig.analytics.ga4MeasurementId = ga4MeasurementId;
    siteConfig.analytics.propertyId = ga4PropertyId;
    
    fs.writeFileSync(siteConfigPath, JSON.stringify(siteConfig, null, 2), 'utf8');

    console.log('\n================================================================');
    console.log('🎉 SUCCESS: Analytics & GTM bootstrap successfully completed!');
    console.log(`- GTM Container ID: ${gtmContainerId}`);
    console.log(`- GA4 Measurement ID: ${ga4MeasurementId}`);
    console.log('Credentials and variables have been written to .env.local and site.config.json.');
    console.log('================================================================\n');

  } catch (err) {
    console.error('[analytics-bootstrap] Saving configuration failed:', err.message);
    process.exit(1);
  }
}

run();
