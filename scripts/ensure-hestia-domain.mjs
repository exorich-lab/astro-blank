#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);

const hasArg = (name) => argv.includes(name);

const normalize = (value) => String(value || '').trim();
const normalizeDomain = (value) => normalize(value).toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
const stripDomainFromText = (value) => normalize(value).replace(/^https?:\/\//, '').split(':')[0].toLowerCase();
const isLikelyDomain = (value) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalize(value));

const shellEscape = (value) => {
  const asString = String(value ?? '');
  return `'${asString.replaceAll('\\', '\\\\').replaceAll("'", "'\\''")}'`;
};

const collectStringCandidates = (value, list) => {
  if (value == null) return;
  if (typeof value === 'string') {
    list.push(normalize(value));
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectStringCandidates(item, list));
    return;
  }

  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => {
      if (typeof key === 'string' && isLikelyDomain(key)) {
        list.push(key);
      }
      collectStringCandidates(nested, list);
    });
  }
};

const parseResponse = (rawText) => {
  const text = normalize(rawText);
  const result = {
    text,
    parsed: null,
    returnCode: null,
    ok: false,
  };

  if (!text) {
    return result;
  }

  if (/^-?\d+$/.test(text)) {
    const numeric = Number(text);
    if (Number.isFinite(numeric)) {
      result.returnCode = numeric;
      result.ok = numeric === 0;
      return result;
    }
  }

  try {
    result.parsed = JSON.parse(text);
  } catch {
    result.parsed = null;
  }

  if (result.parsed && typeof result.parsed === 'object') {
    const returnCode = result.parsed.returncode ?? result.parsed?.data?.returncode ?? result.parsed?.result?.returncode;
    if (returnCode !== undefined) {
      const numeric = Number(returnCode);
      if (Number.isFinite(numeric)) {
        result.returnCode = numeric;
        result.ok = numeric === 0;
      }
    }
  }

  return result;
};

const extractMatchesFromResponse = (payload, targetDomain) => {
  if (!targetDomain) {
    return false;
  }

  const direct = [];
  collectStringCandidates(payload, direct);

  for (const rawValue of direct) {
    if (stripDomainFromText(rawValue) === targetDomain) {
      return true;
    }
  }

  if (typeof payload === 'string') {
    const tokens = normalize(payload).replace(/[{}[\\]"]+/g, ' ').split(/[\s,;|]+/);
    return tokens.some((token) => stripDomainFromText(token) === targetDomain);
  }

  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload)) {
      return payload.some((entry) => extractMatchesFromResponse(entry, targetDomain));
    }

    return Object.entries(payload).some(([key, value]) => {
      if (normalize(key).toLowerCase().includes(targetDomain)) {
        return true;
      }
      if (typeof value === 'string' && stripDomainFromText(value) === targetDomain) {
        return true;
      }
      return extractMatchesFromResponse(value, targetDomain);
    });
  }

  return false;
};

const getRemoteEnv = () => {
  const remoteHost = normalize(process.env.REMOTE_HOST);
  const remoteUser = normalize(process.env.REMOTE_USER);
  const remotePort = normalize(process.env.REMOTE_PORT || '22');
  const remoteSshKey = normalize(process.env.REMOTE_SSH_KEY);
  const remoteSshOptions = normalize(process.env.REMOTE_SSH_OPTIONS || '');
  const hestiaUser = normalize(process.env.HESTIA_SSH_USER || process.env.REMOTE_USER);

  return {
    remoteHost,
    remoteUser,
    remotePort: remotePort || '22',
    remoteSshKey,
    remoteSshOptions,
    hestiaUser,
  };
};

const buildSshArgs = (config) => {
  const args = ['-p', config.remotePort, `${config.remoteUser}@${config.remoteHost}`];
  if (config.remoteSshKey) {
    args.unshift('-i', config.remoteSshKey);
  }

  if (config.remoteSshOptions) {
    const splitted = config.remoteSshOptions.trim().split(/\s+/);
    args.splice(0, 0, ...splitted);
  }

  return args;
};

const runRemoteCommand = (config, commandLine) => {
  const baseArgs = buildSshArgs(config);
  const result = execFileSync('ssh', [...baseArgs, commandLine], {
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return { ok: true, stdout: normalize(result), code: 0 };
};

const runRemoteCommandSafe = (config, commandLine) => {
  try {
    return { ...runRemoteCommand(config, commandLine), usedCommand: commandLine };
  } catch (error) {
    const stdout = normalize(error.stdout);
    const stderr = normalize(error.stderr || error.message);
    const combined = [stdout, stderr].filter(Boolean).join('\n');
    return { ok: false, stdout: combined, code: Number(error.status) || 1, usedCommand: commandLine };
  }
};

const isUnreliableAccessFailure = (text, code) => {
  if (!text && code) return false;
  const lower = text.toLowerCase();
  if (code === 127) return lower.includes('command not found') || lower.includes('not found');
  if (code === 255) return false;
  return /permission denied|hestia\.conf: permission denied|not allowed|sudo: a password is required|must be run as root|operation not permitted|cannot open file|not in the sudoers file|sorry, you are not allowed|a password is required/.test(lower);
};

const buildHestiaCommand = (command, args = [], hestiaUser) => {
  const bin = '/usr/local/hestia/bin';
  const argLine = args.map(shellEscape).join(' ');
  const base = `${bin}/${command} ${argLine}`.trim();
  const quotedUser = hestiaUser ? shellEscape(hestiaUser) : '';
  const hestiaEnv = `if [ -f /etc/hestiacp/hestia.conf ]; then . /etc/hestiacp/hestia.conf; fi; if [ -f /usr/local/hestia/conf/hestia.conf ]; then . /usr/local/hestia/conf/hestia.conf; fi; if [ -f /etc/profile.d/hestia.sh ]; then . /etc/profile.d/hestia.sh; fi;`;
  const wrapped = `bash -lc ${shellEscape(`${hestiaEnv} ${base}`)}`;

  const attempts = [];
  if (quotedUser) {
    attempts.push(`sudo -n -u ${quotedUser} ${wrapped}`);
  }
  attempts.push(`sudo -n -i ${wrapped}`);
  attempts.push(`sudo -n ${wrapped}`);
  attempts.push(wrapped);
  attempts.push(`sudo -n -i ${base}`);
  attempts.push(`sudo -n ${base}`);
  attempts.push(base);

  return [...new Set(attempts)].map((commandText) => commandText.trim());
};

const runHestiaCommand = (config, command, args = [], hestiaUser) => {
  const candidates = buildHestiaCommand(command, args, hestiaUser);
  let lastError = null;
  let hasUnreliableFailure = false;
  const unreliableReasons = [];

  for (const commandText of candidates) {
    const result = runRemoteCommandSafe(config, commandText);
    const parsed = parseResponse(result.stdout);

    if (result.ok || (parsed.returnCode !== null && parsed.ok)) {
      return { ...result, parsed };
    }

    if (isUnreliableAccessFailure(result.stdout, result.code)) {
      hasUnreliableFailure = true;
      unreliableReasons.push(`"${commandText}"`);
    }

    lastError = result;
  }

  return {
    ...lastError,
    parsed: parseResponse(lastError?.stdout || ''),
    unreliable: hasUnreliableFailure,
    reason: hasUnreliableFailure ? `all command variants failed with access/permission error: ${unreliableReasons.join(', ')}` : 'command execution failed',
  };
};

const findDomainInHestia = (config, domain, hestiaUser) => {
  const listCommands = [];
  if (hestiaUser) {
    listCommands.push(['v-list-web-domains', [hestiaUser, 'json']]);
  }
  listCommands.push(['v-list-web-domains', ['json']]);

  for (const [command, args] of listCommands) {
    const result = runHestiaCommand(config, command, args, hestiaUser);
    if (!result) {
      continue;
    }

    const payload = result.parsed.parsed ?? result.stdout;
    if (extractMatchesFromResponse(payload, domain)) {
      return { found: true, command, result };
    }

    if (result.unreliable) {
      return {
        found: false,
        command,
        result,
        reliable: false,
      };
    }

    if (result.ok || result.parsed.returnCode === 0) {
      return {
        found: false,
        command,
        result,
        reliable: true,
      };
    }
  }

  return { found: false, result: null, reliable: false };
};

const createDomainInHestia = (config, domain, hestiaUser) => {
  const commands = [
    ['v-add-web-domain', [hestiaUser, domain]],
    ['v-add-web-domain', [hestiaUser, domain, 'default']],
  ];

  for (const [command, args] of commands) {
    const result = runHestiaCommand(config, command, args, hestiaUser);
    const output = normalize(result.stdout);
    const lowerOutput = output.toLowerCase();

    if (result.ok && result.parsed.returnCode === 0) {
      return { ok: true, result, output };
    }

    if (lowerOutput.includes('already exists')) {
      return { ok: true, result, output };
    }

    if (!output) {
      continue;
    }
    console.log(`[hestia-domain] Attempt to ${command} returned code ${result.code}, output: ${output.slice(0, 280)}`);
  }

  return { ok: false, result: null };
};

const promptCreate = async (domain, user) => {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const prompt = `Domain "${domain}" is missing in Hestia for user "${user || 'unknown'}". Create it now? [y/N]: `;
    const answer = await new Promise((resolve) => {
      rl.question(prompt, (value) => {
        resolve(String(value || '').trim().toLowerCase());
      });
    });
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
};

const printUsage = () => {
  console.log('Usage: node scripts/ensure-hestia-domain.mjs [options]');
  console.log('');
  console.log('Options:');
  console.log('  --yes                        create missing domain without prompt');
  console.log('  --skip-domain-check          skip domain existence/create check');
  console.log('  --non-interactive            skip interactive prompt in non-TTY mode');
  console.log('  --help                       print help');
  console.log('');
  console.log('Environment values are read from `scripts/deploy-config.mjs` shell output:');
  console.log('  SITE_DOMAIN_NORMALIZED, REMOTE_HOST, REMOTE_USER, REMOTE_PORT, REMOTE_SSH_KEY,');
  console.log('  REMOTE_SSH_OPTIONS, HESTIA_SSH_USER');
};

const ensureDomain = async () => {
  if (hasArg('--help') || hasArg('-h')) {
    printUsage();
    return { ok: true, skipped: true };
  }

  if (hasArg('--skip-domain-check')) {
    console.log('[hestia-domain] Domain check is skipped by --skip-domain-check.');
    return { ok: true, skipped: true };
  }

  const domain = normalizeDomain(process.env.SITE_DOMAIN_NORMALIZED || process.env.SITE_DOMAIN);
  if (!domain) {
    console.log('[hestia-domain] skip: site domain is not set in site.config.json / --domain override.');
    return { ok: true, skipped: true };
  }

  const config = getRemoteEnv();
  if (!config.remoteHost || !config.remoteUser) {
    console.log('[hestia-domain] skip: REMOTE_HOST / REMOTE_USER are not configured. Set them in deploy-hestia.json.');
    return { ok: true, skipped: true };
  }

  const hestiaUser = config.hestiaUser;
  const check = findDomainInHestia(config, domain, hestiaUser);

  if (check.found) {
    console.log(`[hestia-domain] Domain "${domain}" already exists in Hestia.`);
    return { ok: true, skipped: false, existing: true };
  }

  if (check.reliable === false) {
    console.log('[hestia-domain] Could not reliably verify domain presence (SSH permission access limits).');
    console.log('[hestia-domain] Skipping domain create prompt to avoid false-positive actions.');
    return { ok: true, skipped: false, existing: false, reliable: false };
  }

  if (check.result) {
    console.log(`[hestia-domain] Domain "${domain}" not found in Hestia for user "${hestiaUser || 'default scope'}".`);
  } else {
    console.log('[hestia-domain] Could not reliably check domain presence via SSH (no usable command output).');
  }

  const shouldCreateAuto = hasArg('--yes') || hasArg('--yes-create') || hasArg('--force');
  if (!shouldCreateAuto && (!process.stdin.isTTY || !process.stdout.isTTY || hasArg('--non-interactive'))) {
    console.log('[hestia-domain] Skipping automatic create in non-interactive mode (pass --yes to create).');
    return { ok: true, skipped: false, existing: false };
  }

  if (!shouldCreateAuto && !(await promptCreate(domain, hestiaUser || config.remoteUser))) {
    console.log('[hestia-domain] Domain creation skipped by operator.');
    return { ok: true, skipped: false, existing: false };
  }

  if (!hestiaUser) {
    console.log('[hestia-domain] Cannot create domain: HESTIA_SSH_USER is not configured.');
    console.log('[hestia-domain] Create manually in Hestia or set HESTIA_SSH_USER and rerun.');
    return { ok: true, skipped: false, existing: false };
  }

  console.log(`[hestia-domain] Creating domain "${domain}" for Hestia user "${hestiaUser}"...`);
  const created = createDomainInHestia(config, domain, hestiaUser);

  if (!created.ok) {
    console.log('[hestia-domain] Could not create domain automatically. Create it manually in Hestia and rerun deploy.');
    return { ok: true, skipped: false, existing: false };
  }

  const verify = findDomainInHestia(config, domain, hestiaUser);
  if (verify.found) {
    console.log(`[hestia-domain] Verified: domain "${domain}" is present in Hestia.`);
    return { ok: true, skipped: false, existing: true };
  }

  console.log('[hestia-domain] Domain creation returned success, but final verification did not find the domain yet.');
  return { ok: true, skipped: false, existing: false };
};

const run = async () => {
  try {
    const result = await ensureDomain();
    process.exit(result?.ok === false ? 1 : 0);
  } catch (error) {
    console.log(`[hestia-domain] ❌ unexpected error: ${error.message}`);
    process.exit(1);
  }
};

run();
