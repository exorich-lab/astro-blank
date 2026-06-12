import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';

const argv = process.argv.slice(2);

const hasArg = (name) => argv.includes(name);

const resolveValue = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const hasEnv = value.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
  if (hasEnv) {
    return process.env[hasEnv[1]] || '';
  }

  const envRef = value.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
  if (envRef) {
    return process.env[envRef[1]] || '';
  }

  return value;
};

const getRawValue = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const resolved = resolveValue(value);
  if (typeof resolved !== 'string') {
    return resolved;
  }

  return resolved.includes('${') ? '' : resolved;
};

const expandEnvRefs = (input) => {
  if (typeof input !== 'string') {
    return input;
  }

  return input.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => process.env[name] || '');
};

const getArgValue = (name) => {
  const withEq = argv.find((item) => item.startsWith(`${name}=`));
  if (withEq) {
    const [, value] = withEq.split('=', 2);
    return value;
  }

  const index = argv.indexOf(name);
  if (index === -1 || index === argv.length - 1) {
    return undefined;
  }

  return argv[index + 1];
};

const getArgs = () => {
  const explicitFormat = getArgValue('--format') || getArgValue('-f') || 'json';

  const siteConfigPath =
    resolveValue(getArgValue('--site-config'))
    || process.env.SITE_CONFIG_PATH
    || process.env.ASTRO_SITE_CONFIG
    || process.env.DEPLOY_SITE_CONFIG
    || path.join(process.cwd(), 'site.config.json');

  let siteConfig = {};
  if (fs.existsSync(siteConfigPath)) {
    try {
      siteConfig = JSON.parse(fs.readFileSync(siteConfigPath, 'utf8'));
    } catch {}
  }

  const preferredCredentialsDir = siteConfig.analytics?.credentialsDir || process.env.ANALYTICS_CREDENTIALS_DIR || '';
  const CREDENTIALS_DIR = preferredCredentialsDir 
    ? (preferredCredentialsDir.startsWith('~/') || preferredCredentialsDir === '~'
        ? path.join(os.homedir(), preferredCredentialsDir.slice(1))
        : (path.isAbsolute(preferredCredentialsDir) ? preferredCredentialsDir : path.resolve(process.cwd(), preferredCredentialsDir))
      )
    : path.join(os.homedir(), 'credentials');

  const credentialsFile = getArgValue('--config')
    || getArgValue('--credentials')
    || getArgValue('--credentials-file')
    || process.env.DEPLOY_CREDENTIALS_FILE
    || getArgValue('--file')
    || path.join(CREDENTIALS_DIR, 'deploy-hestia.json');

  const profile = getArgValue('--profile') || process.env.DEPLOY_PROFILE || process.env.HESTIA_PROFILE || 'default';

  const siteDomain = resolveValue(getArgValue('--domain'))
    || process.env.DEPLOY_SITE_DOMAIN
    || process.env.SITE_DOMAIN;

  return {
    format: explicitFormat,
    credentialsFile,
    profile,
    siteConfigPath,
    siteDomain,
    useJson: hasArg('--json'),
    verbose: hasArg('--verbose'),
  };
};

const shellEscape = (value) => {
  const asString = String(value ?? '');
  return `'${asString.replaceAll('\\', '\\\\').replaceAll("'", "'\\''")}'`;
};

const normalizeDomain = (rawDomain) => {
  let trimmed = String(rawDomain || '').trim();
  trimmed = trimmed.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return trimmed;
};

const normalizeProtocol = (value) => {
  const trimmed = String(value || '').trim();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
};

const safeGet = (obj, pathList, fallback = '') => {
  let current = obj;
  for (const key of pathList) {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return fallback;
    }
    current = current[key];
  }
  return current == null ? fallback : current;
};

const readJson = (filePath) => {
  if (!filePath) {
    return null;
  }

  const normalized = path.resolve(filePath);
  if (!fs.existsSync(normalized)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(normalized, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

function interpolateTemplate(template, replacements) {
  const str = String(template || '');
  return str.replaceAll('{domain}', replacements.domain || '')
    .replaceAll('{user}', replacements.user || '')
    .replaceAll('{host}', replacements.host || '')
    .replaceAll('{env}', replacements.env || '')
    .replaceAll('{basePath}', replacements.basePath || '');
}

function resolveSiteConfigDomain(siteConfigPath) {
  const siteConfig = readJson(siteConfigPath);
  const domain = normalizeDomain(safeGet(siteConfig, ['domain'], ''));

  if (!domain) {
    return { raw: '', normalized: '', url: '' };
  }

  const normalized = normalizeDomain(domain);
  return {
    raw: domain,
    normalized,
    url: normalizeProtocol(normalized),
  };
}

function resolveProfileConfig(data, profileName) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const explicit = safeGet(data, ['profiles', profileName]);
  if (explicit && typeof explicit === 'object') {
    return explicit;
  }

  const defaultProfile = safeGet(data, ['defaultProfile'], '');
  if (defaultProfile && typeof safeGet(data, ['profiles', defaultProfile]) === 'object') {
    return safeGet(data, ['profiles', defaultProfile]);
  }

  return safeGet(data, ['profiles', 'default'], safeGet(data, ['default'], null));
}

function mergeConfig(data, profileName, siteDomain) {
  const profile = resolveProfileConfig(data, profileName);
  if (!profile || typeof profile !== 'object') {
    return null;
  }

  const remote = safeGet(profile, ['remote'], {});
  const hestia = safeGet(profile, ['hestia'], {});

  const domain = normalizeDomain(siteDomain.normalized);
  const remoteUser = resolveValue(safeGet(remote, ['user'], ''));
  const remoteHost = resolveValue(safeGet(remote, ['host'], ''));
  const pathTemplate = safeGet(remote, ['pathTemplate'], safeGet(remote, ['path'], '') || '/home/{user}/web/{domain}/public_html');
  const baseRemotePath = interpolateTemplate(pathTemplate, {
    domain: domain || 'localhost',
    user: remoteUser,
    host: remoteHost,
    basePath: safeGet(remote, ['basePath'], ''),
  });

  return {
    profile: profileName,
    remote: {
      host: remoteHost,
      user: remoteUser,
      path: domain ? baseRemotePath : safeGet(remote, ['path'], baseRemotePath),
      port: getRawValue(safeGet(remote, ['port'], '22')) || '22',
      sshKey: getRawValue(safeGet(remote, ['sshKey'], '')),
      sshOptions: resolveValue(safeGet(remote, ['sshOptions'], '')),
    },
    hestia: {
      sshUser: expandEnvRefs(resolveValue(safeGet(hestia, ['sshUser'], safeGet(hestia, ['user'], '')))),
    },
    site: {
      domain: siteDomain.raw,
      domainNormalized: siteDomain.normalized,
      siteUrl: siteDomain.url,
    },
  };
}

function toShellAssignments(values, credentialsFile) {
  const assignments = [];
  const flat = {
    DEPLOY_CONFIG_FILE: credentialsFile,
    DEPLOY_PROFILE: values.profile,
    SITE_DOMAIN: values.site.domain,
    SITE_DOMAIN_NORMALIZED: values.site.domainNormalized,
    SITE_URL: values.site.siteUrl,
    REMOTE_HOST: values.remote.host,
    REMOTE_USER: values.remote.user,
    REMOTE_PATH: values.remote.path,
    REMOTE_PORT: values.remote.port,
    REMOTE_SSH_KEY: values.remote.sshKey,
    REMOTE_SSH_OPTIONS: values.remote.sshOptions,
    HESTIA_SSH_USER: values.hestia.sshUser,
  };

  Object.entries(flat).forEach(([key, value]) => {
    assignments.push(`export ${key}=${shellEscape(value)}`);
  });

  return assignments.join('\n');
}

const applyDomainOverride = (siteConfig, override) => {
  if (!override) {
    return siteConfig;
  }

  const normalized = normalizeDomain(override);
  return {
    ...siteConfig,
    raw: normalized,
    domain: normalized || siteConfig.domain,
    normalized,
    url: normalized ? normalizeProtocol(normalized) : siteConfig.url,
  };
};

function run() {
  const args = getArgs();

  const credentials = readJson(args.credentialsFile);
  if (!credentials) {
    console.error(`[deploy-config] Не найден или невалиден файл: ${args.credentialsFile}`);
    process.exit(1);
  }

  const siteConfig = applyDomainOverride(resolveSiteConfigDomain(args.siteConfigPath), args.siteDomain);
  const config = mergeConfig(credentials, args.profile, siteConfig);

  if (!config) {
    console.error(`[deploy-config] Не найден профиль: ${args.profile}`);
    process.exit(1);
  }

  if (args.format === 'shell') {
    process.stdout.write(`${toShellAssignments(config, args.credentialsFile)}\n`);
    return;
  }

  if (args.format === 'json') {
    process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
    return;
  }

  process.stdout.write(`profile=${config.profile}\n`);
  process.stdout.write(`remote=${config.remote.host}:${config.remote.user}@${config.remote.path}\n`);
  if (args.verbose) {
    process.stdout.write(`config=${JSON.stringify(config)}\n`);
  }
}

run();
