import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';

const rootDir = process.cwd();
const siteConfigPath = path.join(rootDir, 'site.config.json');
const envLocalPath = path.join(rootDir, '.env.local');
const GCP_ADC_RELATIVE_PATH = path.join('.config', 'gcloud', 'application_default_credentials.json');
const PROJECT_CREDENTIALS_DIR = path.join(rootDir, 'credentials');
const HOME_CREDENTIALS_DIR = path.join(os.homedir(), 'credentials');

const ANALYTICS_SCOPE_ANALYZE = 'https://www.googleapis.com/auth/analytics.readonly';
const ANALYTICS_SCOPE_EDIT = 'https://www.googleapis.com/auth/analytics.edit';
const ANALYTICS_SCOPE_MANAGE_USERS = 'https://www.googleapis.com/auth/analytics.manage.users';
const ANALYTICS_SCOPE_DEFAULT = `${ANALYTICS_SCOPE_ANALYZE} ${ANALYTICS_SCOPE_EDIT}`;
const ANALYTICS_SCOPE_ADMIN = `${ANALYTICS_SCOPE_MANAGE_USERS} ${ANALYTICS_SCOPE_ANALYZE}`;

const ANALYTICS_API_V1BETA = 'https://analyticsadmin.googleapis.com/v1beta';
const ANALYTICS_API_V1ALPHA = 'https://analyticsadmin.googleapis.com/v1alpha';

const getDefaultGcloudAdcPath = () => (
  process.platform === 'win32'
    ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'gcloud', 'application_default_credentials.json')
    : path.join(os.homedir(), GCP_ADC_RELATIVE_PATH)
);

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

const preferredPropertyId = normalizePropertyId(
  getArgValue('--property-id')
  || finalEnv.GA4_PROPERTY_ID
  || finalEnv.PUBLIC_GA4_PROPERTY_ID
  || analyticsConfig.propertyId
  || '',
);

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

const preferredCredentialJson = getArgValue('--credentials-json')
  || finalEnv.GA4_CREDENTIAL_JSON
  || finalEnv.GA4_CREDENTIALS_JSON
  || '';

const preferredAdminCredentialFile = getArgValue('--admin-credentials-file')
  || finalEnv.GA4_ADMIN_CREDENTIAL_FILE
  || finalEnv.GA4_ADMIN_CREDENTIALS_FILE
  || '';

const preferredAdminCredentialJson = getArgValue('--admin-credentials-json')
  || finalEnv.GA4_ADMIN_CREDENTIAL_JSON
  || finalEnv.GA4_ADMIN_CREDENTIALS_JSON
  || '';

const preferredAdminCredentialJsonB64 = getArgValue('--admin-credentials-json-b64')
  || finalEnv.GA4_ADMIN_CREDENTIAL_JSON_B64
  || finalEnv.GA4_ADMIN_CREDENTIALS_JSON_B64
  || '';

const adminCredentialsDir = getArgValue('--admin-credentials-dir')
  || finalEnv.GA4_ADMIN_CREDENTIALS_DIR
  || finalEnv.GA4_ADMIN_CREDENTIALS_PATH
  || '';

const preferredCredentialJsonB64 = finalEnv.GA4_CREDENTIAL_JSON_B64
  || finalEnv.GA4_CREDENTIALS_JSON_B64
  || '';

const credentialsDir = getArgValue('--credentials-dir')
  || finalEnv.GA4_CREDENTIALS_DIR
  || applyMacros(analyticsConfig.credentialsDir || '', macroContext)
  || PROJECT_CREDENTIALS_DIR;

const interactiveChoice = hasArg('--non-interactive')
  ? false
  : hasArg('--interactive')
    || hasArg('--choose-credential')
    || resolveFlag(process.env.GA4_INTERACTIVE_CREDENTIALS, isInteractiveSession());

const autoGrantEnabled = resolveFlag(finalEnv.GA4_AUTO_GRANT_SERVICE_ACCOUNT, false);
const adminRole = getArgValue('--admin-role')
  || finalEnv.GA4_ADMIN_ROLE
  || 'predefinedRoles/admin';

const hasExplicitCredentialSource = Boolean(
  preferredCredentialFile
  || preferredCredentialJson
  || preferredCredentialJsonB64
  || preferredAdminCredentialFile
  || preferredAdminCredentialJson
  || preferredAdminCredentialJsonB64
  || finalEnv.GA4_PROJECT_ID
  || finalEnv.GA4_ACCOUNT_ID
  || preferredProject
  || preferredServiceAccount,
);

const existingMeasurementId = finalEnv.PUBLIC_GA4_MEASUREMENT_ID;
const existingPropertyId = finalEnv.PUBLIC_GA4_PROPERTY_ID || preferredPropertyId;
const strictMode = hasArg('--strict') || resolveFlag(finalEnv.GA4_STRICT, false);
const shouldGracefullySkip = ensure && !force && !strictMode;
const allowAutoGcloudLogin = resolveFlag(finalEnv.GA4_AUTO_GCLOUD_AUTH, true);
const allowAutoGcloudAuthForAdmin = resolveFlag(finalEnv.GA4_ADMIN_AUTO_GCLOUD_AUTH, false);

if (analyticsEnabled === false) {
  console.log('[ga4-bootstrap] Analytics auto-setup is disabled in site.config.json (analytics.enabled=false).');
  process.exit(0);
}

if (existingMeasurementId && existingPropertyId && !force && !isDryRun) {
  console.log('[ga4-bootstrap] GA4 is already configured in .env.local.');
  process.exit(0);
}

let candidates = resolveCredentialCandidates({
  credentialsDir,
  preferredCredentialFile,
  preferredCredentialJson,
  preferredCredentialJsonB64,
});

const adminCandidates = resolveAdminCredentialCandidates({
  credentialsDir: adminCredentialsDir,
  preferredCredentialFile: preferredAdminCredentialFile,
  preferredCredentialJson: preferredAdminCredentialJson,
  preferredCredentialJsonB64: preferredAdminCredentialJsonB64,
  allowAuthorizedUserOnly: true,
});

if (!candidates.length) {
  if (ensure && !force && !preferredCredentialFile && !preferredCredentialJson && !isDryRun && allowAutoGcloudLogin) {
    await ensureGcloudApplicationDefaultCredentials();
    candidates = resolveCredentialCandidates({
      credentialsDir,
      preferredCredentialFile,
      preferredCredentialJson,
      preferredCredentialJsonB64,
    });
  }

  if (!isDryRun) {
    console.log('[ga4-bootstrap] No JSON credentials found.');
    console.log('Checked credential sources: explicit credential file/json/env vars, GA4_CREDENTIAL_JSON(/_B64), and ADC from gcloud.');
    if (ensure && !force) {
    printGa4Troubleshoot({
      apiProjectId: preferredProject || '(not set)',
      reason: 'NO_CREDENTIALS',
      credentialFile: preferredCredentialFile || '(not set)',
      preferredProject,
      preferredServiceAccount,
      streamDomain: preferredDomain,
      hasAdminCredentialOption: adminCandidates.length > 0,
    });
    console.log('[ga4-bootstrap] Skipping GA setup because no credentials are available.');
    process.exit(0);
  }
    process.exit(1);
  }

  console.log('[ga4-bootstrap] DRY RUN: no credentials found.');
  logPlannedEnv({
    GA4_PLAN: 'credentials_not_found',
    GA4_CREDENTIALS_DIR: credentialsDir || '(disabled)',
    GA4_STREAM_DOMAIN: preferredDomain,
  });
  process.exit(0);
}

const chosen = await selectCredential(
  candidates,
  preferredProject,
  preferredServiceAccount,
  preferredCredentialFile,
  Boolean(preferredCredentialJson || preferredCredentialJsonB64),
  interactiveChoice,
  !hasExplicitCredentialSource,
  isInteractiveSession(),
);
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
    if (shouldGracefullySkip) {
      process.exit(0);
    }
    process.exit(1);
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
    GA4_PROPERTY_HINT: preferredPropertyId || '(not set)',
    GA4_SERVICE_ACCOUNT_HINT: preferredServiceAccount || '(not set)',
  });

  if (!existingMeasurementId || !existingPropertyId) {
    console.log('[ga4-bootstrap] Would create or reuse a GA4 property and web stream for this domain.');
  } else {
    console.log('[ga4-bootstrap] GA4 config exists in .env.local; no create actions would be run.');
  }

  process.exit(0);
}

const credential = loadCredentialFromCandidate(chosen);
try {
  const token = await fetchAccessToken(credential, ANALYTICS_SCOPE_DEFAULT);
  const apiBase = ANALYTICS_API_V1BETA;
  const streamNameTemplate = applyMacros(analyticsConfig.streamName || `${siteConfig.brandName || 'Website'} Web`, macroContext);

  if (preferredPropertyId) {
    const propertyName = `properties/${preferredPropertyId}`;
    const streams = await analyticsGetAll(`${apiBase}/${propertyName}/dataStreams`, token);
    const stream = await ensureStream(propertyName, streams, {
      displayName: streamNameTemplate,
      defaultUri: preferredDomain,
      token,
      apiBase,
    });
    const streamPath = String(stream.name || '').replace(`${propertyName}/`, '');

    const nextEnv = {
      ...env,
      PUBLIC_GA4_ENABLED: 'true',
      PUBLIC_GA4_PROPERTY_ID: String(preferredPropertyId),
      PUBLIC_GA4_STREAM_ID: streamPath,
      PUBLIC_GA4_MEASUREMENT_ID: stream.measurementId || stream.webStreamData?.measurementId || '',
      PUBLIC_GA4_STREAM_DOMAIN: stream.webStreamData?.defaultUri || preferredDomain,
      PUBLIC_GA4_CREDENTIALS_FILE: chosen.file,
      GOOGLE_APPLICATION_CREDENTIALS: chosen.file,
    };

    writeEnvLocal(nextEnv);

    console.log('[ga4-bootstrap] GA4 setup completed from configured propertyId and written to .env.local.');
    console.log(`[ga4-bootstrap] property=${nextEnv.PUBLIC_GA4_PROPERTY_ID}`);
    console.log(`[ga4-bootstrap] streamId=${nextEnv.PUBLIC_GA4_STREAM_ID}`);
    console.log(`[ga4-bootstrap] measurementId=${nextEnv.PUBLIC_GA4_MEASUREMENT_ID}`);
    process.exit(0);
  }

  let accounts = await listAllAccounts(apiBase, token);

  if (!accounts.length) {
    if (detectCredentialType(credential) === 'service_account' && autoGrantEnabled && !isDryRun) {
      try {
        await autoGrantServiceAccountToAnalytics(
          {
            serviceCredential: credential,
            targetDomain: preferredDomain,
            preferredProject,
            preferredServiceAccount,
            adminRole,
            adminCandidates,
            allowAutoGcloudAuth: allowAutoGcloudAuthForAdmin,
          },
        );
        accounts = await listAllAccounts(apiBase, token);
      } catch (grantError) {
        throw grantError;
      }

      if (!accounts.length) {
        console.log('[ga4-bootstrap] No Google Analytics accounts visible after grant attempt.');
        printGa4Troubleshoot({
          apiProjectId: credential.project_id || credential.projectId || '(not set)',
          reason: 'NO_ACCOUNTS',
          credentialFile: chosen.file,
          streamDomain: preferredDomain,
          preferredProject,
          serviceAccountEmail: preferredServiceAccount || credential.client_email || '',
          hasAdminCredentialOption: adminCandidates.length > 0,
        });
        if (shouldGracefullySkip) {
          console.log('[ga4-bootstrap] Skipping GA setup in --ensure mode.');
          process.exit(0);
        }
        console.log('[ga4-bootstrap] GA setup failed: No Google Analytics accounts available for this service account.');
        process.exit(1);
      }
    } else {
      console.log('[ga4-bootstrap] No Google Analytics accounts available for this credential.');
      printGa4Troubleshoot({
        apiProjectId: credential.project_id || credential.projectId || '(not set)',
        reason: 'NO_ACCOUNTS',
        credentialFile: chosen.file,
        streamDomain: preferredDomain,
        preferredProject,
        preferredServiceAccount,
        serviceAccountEmail: preferredServiceAccount || credential.client_email || '',
        hasAdminCredentialOption: adminCandidates.length > 0,
      });
      if (shouldGracefullySkip) {
        console.log('[ga4-bootstrap] Skipping GA setup in --ensure mode.');
        process.exit(0);
      }
      console.log('[ga4-bootstrap] GA setup failed: No Google Analytics accounts available for this service account.');
      process.exit(1);
    }
  }

  const account = pickAccount(accounts, preferredProject);
  if (!account) {
    console.log('[ga4-bootstrap] No Analytics account matches configured filters.');
    console.log(`Configured filters: project=${preferredProject || '(none)'}, serviceAccount=${preferredServiceAccount || '(none)'}`);
    if (shouldGracefullySkip) {
      console.log('[ga4-bootstrap] Skipping GA setup in --ensure mode.');
      process.exit(0);
    }
    console.log('[ga4-bootstrap] GA setup failed: No Analytics account matches configured filters.');
    process.exit(1);
  }

  const accountName = account.name;
  const accountId = accountName.replace('accounts/', '');

  const properties = await listProperties(accountName, token, apiBase);
  const desiredPropertyName = `${siteConfig.brandName || 'Website'} · Web`;
  const propertyNameTemplate = applyMacros(analyticsConfig.propertyName || desiredPropertyName, macroContext);
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
} catch (error) {
  if (strictMode) {
    const message = String(error?.message || error);
    console.log(`[ga4-bootstrap] GA setup failed in strict mode: ${message}`);
    if (!message.includes('No Google Analytics accounts available') && !message.includes('No Analytics account matches')) {
      printGa4Troubleshoot({
        apiProjectId: credential.project_id || credential.projectId || '(not set)',
        reason: analyzeGa4Failure(error),
        credentialFile: chosen.file,
        details: message,
        preferredProject,
        preferredServiceAccount,
        serviceAccountEmail: preferredServiceAccount || credential.client_email || '',
        streamDomain: preferredDomain,
      });
    }
    process.exit(1);
  }

  if (shouldGracefullySkip) {
    const message = String(error?.message || error);
    console.log('[ga4-bootstrap] GA setup failed, but dev launch will continue because --ensure mode is set.');
    console.log(`[ga4-bootstrap] Reason: ${message}`);
    printGa4Troubleshoot({
      apiProjectId: credential.project_id || credential.projectId || '(not set)',
      reason: analyzeGa4Failure(error),
      credentialFile: chosen.file,
      details: message,
      preferredProject,
      preferredServiceAccount,
      serviceAccountEmail: preferredServiceAccount || credential.client_email || '',
      streamDomain: preferredDomain,
    });
    process.exit(0);
  }
  throw error;
}

function resolveCredentialCandidates({
  credentialsDir,
  preferredCredentialFile,
  preferredCredentialJson,
  preferredCredentialJsonB64,
}) {
  const loaded = [];
  const dir = expandPath(credentialsDir);
  const explicitCredential = expandPath(preferredCredentialFile || '');

  if (explicitCredential) {
    const parsed = safeJson(explicitCredential);
    if (parsed && hasGa4CredentialShape(parsed)) {
      loaded.push({
        file: explicitCredential,
        basename: path.basename(explicitCredential),
        projectId: parsed.project_id || parsed.projectId || '',
        clientEmail: parsed.client_email || parsed.client_id || '',
        type: detectCredentialType(parsed),
      });
    }
  }

  const dirCandidates = resolveFolderCredentials(dir);
  loaded.push(...dirCandidates);

  if (dir !== HOME_CREDENTIALS_DIR) {
    const homeDirCandidates = resolveFolderCredentials(HOME_CREDENTIALS_DIR);
    loaded.push(...homeDirCandidates);
  }

  if (HOME_CREDENTIALS_DIR !== PROJECT_CREDENTIALS_DIR && dir !== PROJECT_CREDENTIALS_DIR) {
    const projectDirCandidates = resolveFolderCredentials(PROJECT_CREDENTIALS_DIR);
    loaded.push(...projectDirCandidates);
  }

  const adcPath = getDefaultGcloudAdcPath();
  const adcParsed = safeJson(adcPath);
  if (adcParsed && hasGa4CredentialShape(adcParsed)) {
    loaded.push({
      file: adcPath,
      basename: 'application_default_credentials.json (gcloud)',
      projectId: adcParsed.project_id || adcParsed.quota_project_id || '',
      clientEmail: adcParsed.client_email || adcParsed.client_id || '',
      type: detectCredentialType(adcParsed),
      isAdc: true,
    });
  }

  const inlineCredential = resolveInlineCredential(preferredCredentialJson, preferredCredentialJsonB64);
  if (inlineCredential) {
    loaded.push({
      inline: true,
      file: '(inline-credential-json)',
      basename: 'inline-credential-json',
      projectId: inlineCredential.project_id || inlineCredential.projectId || '',
      clientEmail: inlineCredential.client_email || inlineCredential.client_id || '',
      type: detectCredentialType(inlineCredential),
      content: inlineCredential,
    });
  }

  if (chosenCredentialNoticeAllowed(loaded, preferredCredentialFile, preferredCredentialJson, preferredCredentialJsonB64)) {
    const list = loaded.map((item) => `${item.basename} (project: ${item.projectId || 'unknown'})`);
    const chosenName = preferredCredentialFile
      ? path.basename(resolveCredentialPath(preferredCredentialFile))
      : preferredCredentialJson || preferredCredentialJsonB64
        ? 'inline-credential-json'
        : null;
    const extraCount = list.length - 1;
    console.log('[ga4-bootstrap] Multiple credentials detected.');
    console.log(`Active source preference: ${chosenName || 'selection by project/email/first available'}`);
    if (extraCount > 0) {
      console.log(`Available: ${list.join(', ')}`);
      console.log('Set --credentials-file/--credentials-json, GA4_CREDENTIAL_FILE/GOOGLE_APPLICATION_CREDENTIALS or GA4_CREDENTIAL_JSON to force a specific source.');
    }
  }

  return dedupeCredentials(loaded);
}

function resolveAdminCredentialCandidates({
  credentialsDir,
  preferredCredentialFile,
  preferredCredentialJson,
  preferredCredentialJsonB64,
  allowAuthorizedUserOnly = false,
}) {
  const candidates = resolveCredentialCandidates({
    credentialsDir: credentialsDir || PROJECT_CREDENTIALS_DIR,
    preferredCredentialFile,
    preferredCredentialJson,
    preferredCredentialJsonB64,
  });

  if (!allowAuthorizedUserOnly) {
    return candidates;
  }

  const authorized = candidates.filter((candidate) => detectCredentialType(candidate) === 'authorized_user');
  if (authorized.length) {
    return authorized;
  }

  return candidates.filter((candidate) => {
    const parsed = safeJson(resolveCredentialPath(candidate.file || ''));
    return detectCredentialType(parsed) === 'authorized_user';
  });
}

function resolveFolderCredentials(dir) {
  const loaded = [];

  if (!dir) {
    return loaded;
  }

  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
    const names = fs
      .readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith('.json'))
      .map((name) => path.join(dir, name))
      .filter((filePath) => fs.existsSync(filePath) && fs.statSync(filePath).isFile());

    for (const filePath of names) {
      const parsed = safeJson(filePath);
      if (!parsed || !hasGa4CredentialShape(parsed)) {
        continue;
      }

      const clientEmail = parsed.client_email || '';
      const projectId = parsed.project_id || parsed.projectId || '';
      loaded.push({
        file: filePath,
        basename: path.basename(filePath),
        projectId,
        clientEmail,
        type: detectCredentialType(parsed),
      });
    }
  }

  return loaded;
}

function dedupeCredentials(items) {
  const map = new Map();
  for (const item of items) {
    map.set(item.file, item);
  }
  return Array.from(map.values());
}

function isInteractiveSession() {
  return process.stdin.isTTY && process.stdout.isTTY;
}

function hasGa4CredentialShape(parsed) {
  const type = String(parsed.type || '').trim();

  if (type === 'authorized_user') {
    return Boolean(parsed.refresh_token && parsed.client_id && parsed.client_secret && parsed.token_uri);
  }

  if (type === 'service_account' || parsed.private_key || parsed.client_email) {
    return Boolean(parsed.client_email && parsed.private_key && parsed.project_id);
  }

  return false;
}

function detectCredentialType(parsed) {
  const type = String(parsed.type || '').trim();
  if (type === 'authorized_user') {
    return 'authorized_user';
  }
  return 'service_account';
}

function chosenCredentialNoticeAllowed(candidates, preferredFile, preferredCredentialJson, preferredCredentialJsonB64) {
  return candidates.length > 1 && !(preferredFile || preferredCredentialJson || preferredCredentialJsonB64);
}

function resolveCredentialPath(rawPath) {
  const value = expandPath(rawPath).replace(/^"|"$/g, '');
  if (!value) {
    return value;
  }

  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
}

async function selectCredential(
  candidates,
  preferredProject,
  preferredServiceAccount,
  preferredFileRaw,
  preferInline,
  interactiveMode,
  allowInteractiveChoice,
  hasTty,
) {
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

  if (preferInline) {
    const inline = candidates.find((item) => item.inline);
    if (inline) {
      return inline;
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

  if (interactiveMode && allowInteractiveChoice && hasTty && candidates.length > 1) {
    return promptCredentialChoice(candidates);
  }

  return candidates[0] || null;
}

async function promptCredentialChoice(candidates) {
  console.log('[ga4-bootstrap] Multiple credentials found. Choose one:');

  candidates.forEach((item, index) => {
    const sourceLabel = item.inline ? 'inline json' : item.basename || item.file;
    console.log(`  ${index + 1}) ${sourceLabel} (project: ${item.projectId || 'unknown'})`);
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const input = await rl.question(`Select credential (1-${candidates.length}): `);
    const index = Number(String(input).trim()) - 1;
    if (Number.isInteger(index) && index >= 0 && index < candidates.length) {
      const selected = candidates[index];
      console.log(`[ga4-bootstrap] Selected credential: ${selected.inline ? 'inline json' : selected.basename}`);
      return selected;
    }

    console.log('[ga4-bootstrap] Invalid selection. Using the first credential.');
    return candidates[0];
  } finally {
    rl.close();
  }
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

function listAllAccounts(apiBase, token) {
  return analyticsList(`${apiBase}/accounts`, token, 'accounts');
}

async function listAccessBindings(accountName, token) {
  return analyticsList(`${ANALYTICS_API_V1ALPHA}/${accountName}/accessBindings`, token, 'accessBindings');
}

async function autoGrantServiceAccountToAnalytics({
  serviceCredential,
  preferredProject,
  preferredServiceAccount,
  adminRole,
  adminCandidates,
  allowAutoGcloudAuth,
}) {
  let adminCredentialCandidates = Array.isArray(adminCandidates) ? [...adminCandidates] : [];

  if (!adminCredentialCandidates.length && allowAutoGcloudAuth) {
    await ensureGcloudApplicationDefaultCredentials();
    adminCredentialCandidates = resolveAdminCredentialCandidates({
      credentialsDir: '',
      preferredCredentialFile: '',
      preferredCredentialJson: '',
      preferredCredentialJsonB64: '',
      allowAuthorizedUserOnly: true,
    });
  }

  const targetServiceAccount = (preferredServiceAccount || serviceCredential.client_email || '').trim();

  if (!targetServiceAccount) {
    throw new Error('Unable to resolve service account email to grant Analytics access.');
  }

  if (!adminCredentialCandidates.length) {
    throw new Error('AUTO_GRANT_FAILED: Admin GA4 credential for access-binding is missing. '
      + 'Set GA4_ADMIN_CREDENTIAL_FILE / GA4_ADMIN_CREDENTIAL_JSON(_B64) or enable GA4_ADMIN_AUTO_GCLOUD_AUTH=true.');
  }

  const adminCredential = loadCredentialFromCandidate(adminCredentialCandidates[0]);
  const adminToken = await fetchAccessToken(adminCredential, ANALYTICS_SCOPE_ADMIN);

  const candidateAccounts = await listAllAccounts(ANALYTICS_API_V1BETA, adminToken);
  if (!candidateAccounts.length) {
    throw new Error('AUTO_GRANT_FAILED: admin credential has no GA4 accounts available to grant access.');
  }

  const selectedAccount = (preferredProject
    ? candidateAccounts.find((account) => {
      const normalized = String(account.name || '');
      const candidateId = String(account.accountId || normalized.split('/').pop() || '');
      return normalized.endsWith(`/${preferredProject}`) || candidateId === preferredProject;
    })
    : candidateAccounts[0]);

  if (!selectedAccount?.name) {
    throw new Error(`AUTO_GRANT_FAILED: no account matched filter preferredProject=${preferredProject || '(none)'}.`);
  }

  const existingBindings = await listAccessBindings(selectedAccount.name, adminToken);
  const alreadyBound = existingBindings.some((item) => {
    const email = String(item?.user || '').toLowerCase();
    return email === targetServiceAccount.toLowerCase();
  });

  if (alreadyBound) {
    console.log(`[ga4-bootstrap] Service account ${targetServiceAccount} already has direct access on ${selectedAccount.name}.`);
    return;
  }

  try {
    await analyticsPost(
      `${ANALYTICS_API_V1ALPHA}/${selectedAccount.name}/accessBindings`,
      {
        user: targetServiceAccount,
        roles: [adminRole || 'predefinedRoles/admin'],
      },
      adminToken,
    );
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('already exists') || message.includes('already have') || message.includes('409')) {
      console.log(`[ga4-bootstrap] Access binding for ${targetServiceAccount} already exists on ${selectedAccount.name}.`);
      return;
    }
    throw error;
  }

  console.log(`[ga4-bootstrap] Granted ${adminRole || 'predefinedRoles/admin'} access to ${targetServiceAccount} on ${selectedAccount.name}.`);
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

async function ensureGcloudApplicationDefaultCredentials() {
  const gcloudPath = findGcloudExecutable();
  if (!gcloudPath) {
    return;
  }

  const adcPath = getDefaultGcloudAdcPath();
  const existingAdc = safeJson(adcPath);
  if (existingAdc && detectCredentialType(existingAdc) === 'authorized_user' && existingAdc.refresh_token) {
    console.log('[ga4-bootstrap] Reusing existing gcloud ADC (authorized_user) for GA admin bootstrap.');
    return;
  }

  try {
    console.log('[ga4-bootstrap] Attempting to authenticate application-default via gcloud for local GA setup.');
    execSync(
      `"${gcloudPath}" auth application-default login --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/analytics.edit,https://www.googleapis.com/auth/analytics.manage.users`,
      { stdio: 'inherit' },
    );
    return;
  } catch {
    console.log('[ga4-bootstrap] Automatic gcloud ADC setup was not completed. You can run manually:');
    console.log('gcloud auth application-default login --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/analytics.edit,https://www.googleapis.com/auth/analytics.manage.users');
    console.log('[ga4-bootstrap] If Google blocks this OAuth app, your account or domain policy likely restricts it.');
    console.log('[ga4-bootstrap] In that case, use service-account credentials instead (set GA4_CREDENTIAL_FILE or GOOGLE_APPLICATION_CREDENTIALS).');
  }
}

function commandExists(command) {
  try {
    execSync(`command -v ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function findGcloudExecutable() {
  if (commandExists('gcloud')) {
    return 'gcloud';
  }

  const candidates = [];
  const home = os.homedir();

  const brewPrefix = (() => {
    const brewCommands = ['brew', '/opt/homebrew/bin/brew', '/usr/local/bin/brew'];
    for (const brew of brewCommands) {
      if (!commandExists(brew)) {
        continue;
      }
      try {
        return execSync(`${brew} --prefix google-cloud-sdk`, { encoding: 'utf8' }).toString().trim();
      } catch {
        return '';
      }
    }
    return '';
  })();

  candidates.push(path.join(home, 'google-cloud-sdk', 'bin', 'gcloud'));
  candidates.push('/opt/homebrew/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/bin/gcloud');
  candidates.push('/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/bin/gcloud');
  candidates.push('/opt/homebrew/bin/gcloud');
  candidates.push('/usr/local/bin/gcloud');
  if (brewPrefix) {
    candidates.push(path.join(brewPrefix, 'bin', 'gcloud'));
    candidates.push(path.join(brewPrefix, 'google-cloud-sdk', 'bin', 'gcloud'));
  }

  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles || '';
    const localAppData = process.env.LocalAppData || process.env.APPDATA || '';
    candidates.push(path.join(programFiles, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd'));
    candidates.push(path.join(localAppData, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd'));
  }

  return candidates.find((candidate) => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }) || '';
}

async function listProperties(accountName, token, apiBase) {
  return analyticsList(`${apiBase}/${accountName}/properties`, token, 'properties');
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

async function analyticsList(url, token, collectionField = 'items') {
  const items = [];
  let pageToken = '';

  do {
    const query = new URL(url);
    query.searchParams.set('pageSize', '200');
    if (pageToken) {
      query.searchParams.set('pageToken', pageToken);
    }

    const response = await analyticsGetAll(query.toString(), token);
    const collection = Array.isArray(response[collectionField])
      ? response[collectionField]
      : (Array.isArray(response.account) ? response.account : []);
    items.push(...collection);
    pageToken = response.nextPageToken || '';
  } while (pageToken);

  return items;
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

function fetchAccessToken(credential, scopes = ANALYTICS_SCOPE_DEFAULT) {
  return (async () => {
    const credentialType = detectCredentialType(credential);
    if (credentialType === 'authorized_user') {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: credential.client_id,
          client_secret: credential.client_secret,
          refresh_token: credential.refresh_token,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.access_token) {
        throw new Error(`OAuth refresh error ${response.status}: ${data.error || data.error_description || 'no token'}`);
      }

      return data.access_token;
    }

    if (credentialType !== 'service_account' || !credential.client_email || !credential.private_key) {
      throw new Error('Invalid service-account credential format for JWT auth.');
    }

    const now = Math.floor(Date.now() / 1000);
    const jwtHeader = {
      alg: 'RS256',
      typ: 'JWT',
    };
    const jwtPayload = {
      iss: credential.client_email,
      scope: scopes || ANALYTICS_SCOPE_DEFAULT,
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

function resolveInlineCredential(credentialJson, credentialJsonBase64) {
  const candidates = [
    credentialJson,
    decodeBase64CredentialJson(credentialJsonBase64),
  ];

  for (const raw of candidates) {
    if (!raw || !String(raw).trim()) {
      continue;
    }

    const parsed = parseJsonMaybe(raw);
    if (parsed && hasGa4CredentialShape(parsed)) {
      return parsed;
    }
  }

  return null;
}

function decodeBase64CredentialJson(credentialJsonBase64) {
  const raw = String(credentialJsonBase64 || '').trim();
  if (!raw) {
    return '';
  }

  try {
    return Buffer.from(raw, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function parseJsonMaybe(raw) {
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function loadCredentialFromCandidate(candidate) {
  if (!candidate) {
    throw new Error('Invalid or missing credential source.');
  }

  if (candidate.inline) {
    if (candidate.content && hasGa4CredentialShape(candidate.content)) {
      return candidate.content;
    }
    throw new Error('Invalid or unsupported inline Google credential payload.');
  }

  const filePath = expandPath(candidate.file || '');
  const content = safeJson(filePath);
  if (!content || !hasGa4CredentialShape(content)) {
    throw new Error(`Invalid or unsupported Google credentials: ${candidate.file || ''}`);
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

function normalizePropertyId(value) {
  return String(value || '').trim().replace(/^properties\//, '');
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

function analyzeGa4Failure(error) {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('blocked') && message.includes('application')) {
    return 'OAUTH_BLOCKED';
  }
  if (message.includes('service_disabled') || message.includes('api has not been used')) {
    return 'SERVICE_DISABLED';
  }
  if (message.includes('permission_denied') || message.includes('permission')) {
    return 'PERMISSION_DENIED';
  }
  if (message.includes('no google analytics accounts available')) {
    return 'NO_ACCOUNTS';
  }
  if (message.includes('auto_grant_failed') || message.includes('admin credential')) {
    return 'AUTO_GRANT_FAILED';
  }
  if (message.includes('no credentials') || message.includes('credentials not found')) {
    return 'NO_CREDENTIALS';
  }
  if (message.includes('invalid service-account credential format') || message.includes('invalid or missing credential source') || message.includes('invalid or unsupported google credentials')) {
    return 'INVALID_CREDENTIAL';
  }
  if (message.includes('no analytics account matches configured filters')) {
    return 'NO_MATCHING_ACCOUNT';
  }

  return 'GENERAL';
}

function printBrowserTroubleshootingStep({ title, url, steps }) {
  console.log(` - ${title}`);
  if (url) {
    console.log(`   Open: ${url}`);
  }
  for (const line of steps) {
    console.log(`   - ${line}`);
  }
}

function printGa4Troubleshoot({
  apiProjectId,
  reason,
  credentialFile,
  details,
  preferredProject,
  preferredServiceAccount,
  serviceAccountEmail,
  streamDomain,
  hasAdminCredentialOption = false,
}) {
  console.log('[ga4-bootstrap] Troubleshooting checklist:');
  console.log(` - Credential file: ${credentialFile}`);
  console.log(` - Analytics project from SA key: ${apiProjectId}`);
  if (serviceAccountEmail) {
    console.log(` - Service account email to add in GA4: ${serviceAccountEmail}`);
  }
  console.log(` - Stream domain in current run: ${streamDomain || '(not set)'}`);
  if (preferredProject || preferredServiceAccount) {
    console.log(` - Config filters: project=${preferredProject || '(none)'}, serviceAccount=${preferredServiceAccount || '(none)'}`);
  }

  if (reason === 'SERVICE_DISABLED') {
    printBrowserTroubleshootingStep({
      title: `Enable Analytics Admin API for project ${apiProjectId}`,
      url: `https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com?project=${apiProjectId}`,
      steps: [
        'Click "Enable API" on this page.',
        'Wait 2-5 minutes for API quota metadata to propagate.',
        'Run: `GA4_AUTO_GCLOUD_AUTH=false npm run ga4:bootstrap` if you use SA JSON only.',
      ],
    });
    printBrowserTroubleshootingStep({
      title: 'Alternative quick check (API status)',
      url: `https://console.cloud.google.com/apis/api/analyticsadmin.googleapis.com/overview?project=${apiProjectId}`,
      steps: [
        'Verify status is "Enabled" and there are no quota errors.',
      ],
    });
  } else if (reason === 'PERMISSION_DENIED') {
    printBrowserTroubleshootingStep({
      title: `Give service account access in GA4 (for account/project ${preferredProject || '(check in Analytics)'})`,
      url: 'https://support.google.com/analytics/answer/9305587',
      steps: [
        'Open Google Analytics → Admin → Account access management.',
        'Add your service account email with at least Editor.',
        'If bootstrap must create streams/properties, use Administrator.',
        'Save, then rerun `GA4_ENABLED=true npm run ga4:bootstrap`.',
      ],
    });
    printBrowserTroubleshootingStep({
      title: 'If using Cloud roles, verify service-account identity in IAM',
      url: `https://console.cloud.google.com/iam-admin/iam?project=${apiProjectId}`,
      steps: [
        'Check the service account for this project is enabled.',
        'No IAM role alone is enough for GA4 data access; keep analytics grant in Analytics Admin too.',
      ],
    });
  } else if (reason === 'NO_ACCOUNTS') {
    console.log(' - API returns valid token, but this service account has no visible GA4 account.');
    if (hasAdminCredentialOption) {
      printBrowserTroubleshootingStep({
        title: 'Try automatic service-account grant if this is first-run setup',
        url: 'https://analytics.google.com/analytics/web/',
        steps: [
          'Provide an admin credential via GA4_ADMIN_CREDENTIAL_FILE or GA4_ADMIN_CREDENTIAL_JSON(_B64).',
          'Enable service-account grant explicitly with GA4_AUTO_GRANT_SERVICE_ACCOUNT=true.',
          'Re-run: `GA4_AUTO_GRANT_SERVICE_ACCOUNT=true npm run ga4:bootstrap`',
        ],
      });
    }
    printBrowserTroubleshootingStep({
      title: 'Preferred manual path: try Property access management first',
      url: 'https://analytics.google.com/analytics/web/',
      steps: [
        'Open Admin (gear icon) -> choose the target Property -> Property access management.',
        serviceAccountEmail
          ? `Add this service account as a user: ${serviceAccountEmail}`
          : 'Add the service account email from the JSON key as a user.',
        'Role: Editor for property/stream setup, Administrator if account-level setup is needed.',
        'Disable "Notify new users by email".',
        'If GA4 says the service account is not a valid Google account, use the Firebase IAM or Admin API workaround below.',
      ],
    });
    printBrowserTroubleshootingStep({
      title: 'GA4 UI workaround: use Firebase IAM if this property is Firebase-linked',
      url: 'https://console.firebase.google.com/',
      steps: [
        'Your GA4 access screen can show Firebase virtual users; if so, add the service account to the linked Firebase project instead.',
        serviceAccountEmail
          ? `Member: serviceAccount:${serviceAccountEmail}`
          : 'Member: serviceAccount:<service-account-email>',
        'Role: Firebase Analytics Admin (roles/firebase.analyticsAdmin) or Firebase Editor if Analytics Admin is unavailable.',
        'Equivalent gcloud command:',
        serviceAccountEmail
          ? `  gcloud projects add-iam-policy-binding <FIREBASE_PROJECT_ID> --member="serviceAccount:${serviceAccountEmail}" --role="roles/firebase.analyticsAdmin"`
          : '  gcloud projects add-iam-policy-binding <FIREBASE_PROJECT_ID> --member="serviceAccount:<service-account-email>" --role="roles/firebase.analyticsAdmin"',
        'After IAM propagation, rerun: `make deploy-ga`.',
      ],
    });
    printBrowserTroubleshootingStep({
      title: 'GA4 UI workaround: grant access by Analytics Admin API',
      url: 'https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1alpha/accounts.accessBindings/create',
      steps: [
        'This requires an existing GA4 admin user OAuth token with analytics.manage.users.',
        'A service account that currently sees zero GA4 accounts cannot grant access to itself.',
        'Use GA4_ADMIN_CREDENTIAL_FILE or GA4_ADMIN_CREDENTIAL_JSON_B64, then rerun with GA4_AUTO_GRANT_SERVICE_ACCOUNT=true.',
      ],
    });
    printBrowserTroubleshootingStep({
      title: `Verify Analytics Admin API for Google Cloud project ${apiProjectId}`,
      url: `https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com?project=${apiProjectId}`,
      steps: [
        'Status must be Enabled.',
        'If it was just enabled, wait 2-5 minutes.',
      ],
    });
    printBrowserTroubleshootingStep({
      title: 'Verify service account exists and is enabled',
      url: `https://console.cloud.google.com/iam-admin/serviceaccounts?project=${apiProjectId}`,
      steps: [
        'Find the same service account email from the credential file.',
        'Cloud IAM roles alone do not grant GA4 account access; GA4 Account access management is still required.',
      ],
    });
    printBrowserTroubleshootingStep({
      title: 'Google reference for adding GA4 users',
      url: 'https://support.google.com/analytics/answer/9305587',
      steps: [
        'Use this only as reference; the direct GA4 entry point is above.',
        'Create GA4 account/property if missing.',
        'Run `GA4_PROJECT_ID=<ACCOUNT_ID> npm run ga4:bootstrap`.',
      ],
    });
  } else if (reason === 'AUTO_GRANT_FAILED') {
    printBrowserTroubleshootingStep({
      title: 'Automatic grant failed',
      url: 'https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1alpha/accounts.accessBindings/create',
      steps: [
        'Check that the admin credential is valid and has Manage Users scope.',
        'Admin credential must be an authorized-user JSON, not a service-account JSON.',
        'Verify the admin Google user still has Admin / Manage Users access to GA4 account.',
        'If needed, use a personal admin token and rerun with explicit values:',
        '  GA4_ADMIN_CREDENTIAL_FILE=/abs/path/admin-user.json GA4_PROJECT_ID=<ACCOUNT_ID> npm run ga4:bootstrap',
        '  or GA4_ADMIN_AUTO_GCLOUD_AUTH=true GA4_PROJECT_ID=<ACCOUNT_ID> npm run ga4:bootstrap',
      ],
    });
  } else if (reason === 'NO_MATCHING_ACCOUNT') {
    console.log(' - Filter did not match available accounts from API response.');
    printBrowserTroubleshootingStep({
      title: 'Verify that filter values match real GA4 values',
      url: 'https://analytics.google.com/analytics/web/',
      steps: [
        'Open GA4 list of accounts and copy the correct Account ID.',
        'Re-run with exact filters:',
        '  `GA4_PROJECT_ID=<ACCOUNT_ID> GA4_SERVICE_ACCOUNT_EMAIL=<service-account-email> npm run ga4:bootstrap`',
        'If unsure, temporarily clear filters and rerun bootstrap.',
      ],
    });
  } else if (reason === 'NO_CREDENTIALS') {
    printBrowserTroubleshootingStep({
      title: 'Create or export Analytics service-account JSON',
      url: 'https://console.cloud.google.com/iam-admin/serviceaccounts',
      steps: [
        'Open IAM → Service accounts in project tied to your GA4.',
        'Create key JSON for service account and save file locally.',
        'Set `GA4_CREDENTIAL_FILE=/absolute/path/key.json` and retry.',
      ],
    });
  } else if (reason === 'INVALID_CREDENTIAL') {
    printBrowserTroubleshootingStep({
      title: 'Replace invalid credentials',
      url: 'https://cloud.google.com/iam/docs/service-accounts-create#iam-service-account-keys',
      steps: [
        'Download a fresh service-account key JSON.',
        'Use one of:',
        '  - GOOGLE_APPLICATION_CREDENTIALS=/abs/path/key.json',
        '  - GA4_CREDENTIAL_FILE=/abs/path/key.json',
        '  - GA4_CREDENTIAL_JSON_B64',
        'Run bootstrap again.',
      ],
    });
  } else if (reason === 'OAUTH_BLOCKED') {
    printBrowserTroubleshootingStep({
      title: 'Google blocked OAuth flow in your account',
      url: 'https://support.google.com/cloud/answer/13404052',
      steps: [
        'If possible, ask domain admin to allow Google authentication scope for your account.',
        'Or avoid user OAuth completely and use service account JSON/secret file.',
        'Set `GA4_AUTO_GCLOUD_AUTH=false` and export GA4 credentials.',
        'Rerun: `GA4_AUTO_GCLOUD_AUTH=false npm run ga4:bootstrap`',
      ],
    });
    printBrowserTroubleshootingStep({
      title: 'OAuth docs for reference',
      url: 'https://cloud.google.com/sdk/gcloud/reference/auth/application-default/login',
      steps: [
        'Use this page if you want to debug CLI OAuth on a browser with a different account.',
      ],
    });
  } else {
    if (details) {
      console.log(` - Error details: ${details}`);
    }
    console.log(' - Verify API enablement, credentials path, and Analytics account permissions.');
  }

  console.log(' - API setup guides:');
  console.log('   https://developers.google.com/analytics/devguides/config/admin/v1');
  if (streamDomain && /localhost|127\\.0\\.0\\.1/.test(streamDomain)) {
    console.log(' - Note: localhost is fine for development stream (does not require public DNS).');
    console.log('   On production run GA bootstrap with GA4_STREAM_DOMAIN=<real-domain> to create/use production stream.');
    console.log('   Example: GA4_STREAM_DOMAIN=https://your-domain.com npm run ga4:bootstrap');
  }
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
