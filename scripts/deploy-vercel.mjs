#!/usr/bin/env node
/**
 * Deploy this Astro starter to Vercel.
 *
 * Secrets live outside the repo:
 *   ~/credentials/deploy-vercel.json
 *
 * Or set:
 *   VERCEL_TOKEN
 *   VERCEL_ORG_ID / VERCEL_PROJECT_ID (optional, for linked CI deploys)
 *
 * Commands:
 *   node scripts/deploy-vercel.mjs help
 *   node scripts/deploy-vercel.mjs whoami
 *   node scripts/deploy-vercel.mjs link
 *   node scripts/deploy-vercel.mjs deploy [--prod|--preview] [--no-build] [--yes]
 *   node scripts/deploy-vercel.mjs domains [list|add <domain>]
 *   node scripts/deploy-vercel.mjs inspect
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CONFIG = path.join(os.homedir(), 'credentials', 'deploy-vercel.json');
const argv = process.argv.slice(2);
const command = argv.find((item) => !item.startsWith('-')) || 'help';

const getArg = (name, fallback = '') => {
  const eq = argv.find((item) => item.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('-')
    ? argv[index + 1]
    : fallback;
};

const hasArg = (name) => argv.includes(name);

const expandEnvRefs = (value) => {
  if (typeof value !== 'string') return value;
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => process.env[name] || '');
};

const readJson = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const resolveConfigPath = () =>
  path.resolve(
    getArg('--config', process.env.DEPLOY_VERCEL_CONFIG || process.env.VERCEL_CONFIG || DEFAULT_CONFIG),
  );

function loadConfig() {
  const configPath = resolveConfigPath();
  const fileConfig = readJson(configPath) || {};

  const token = String(
    expandEnvRefs(fileConfig.token)
    || process.env.VERCEL_TOKEN
    || process.env.DEPLOY_VERCEL_TOKEN
    || '',
  ).trim();

  const orgId = String(
    expandEnvRefs(fileConfig.orgId)
    || process.env.VERCEL_ORG_ID
    || '',
  ).trim();

  const projectId = String(
    expandEnvRefs(fileConfig.projectId)
    || process.env.VERCEL_PROJECT_ID
    || '',
  ).trim();

  const scope = String(
    expandEnvRefs(fileConfig.scope || fileConfig.team)
    || process.env.VERCEL_SCOPE
    || process.env.VERCEL_TEAM_ID
    || '',
  ).trim();

  const projectName = String(
    expandEnvRefs(fileConfig.projectName || fileConfig.name)
    || process.env.VERCEL_PROJECT_NAME
    || '',
  ).trim();

  const siteConfigPath = path.join(ROOT_DIR, 'site.config.json');
  const siteConfig = readJson(siteConfigPath) || {};
  const domain = String(
    getArg('--domain')
    || expandEnvRefs(fileConfig.domain)
    || siteConfig.domain
    || '',
  )
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');

  return {
    configPath,
    token,
    orgId,
    projectId,
    scope,
    projectName,
    domain,
    defaultProd: fileConfig.prod !== false,
  };
}

function ensureToken(config, { required = true } = {}) {
  if (config.token) return true;
  if (!required) return false;

  console.error(`
Missing Vercel token.

Create a token: https://vercel.com/account/tokens

Then either:
  1) Write ${config.configPath}
     {
       "token": "vercel_xxx",
       "orgId": "team_xxx",
       "projectId": "prj_xxx",
       "projectName": "my-site",
       "scope": "my-team",
       "prod": true
     }

  2) Or export:
     set VERCEL_TOKEN=vercel_xxx   (PowerShell: $env:VERCEL_TOKEN="vercel_xxx")

Optional org/project IDs enable non-interactive CI-style deploys.
`);
  process.exit(1);
}

function buildEnv(config) {
  const env = { ...process.env };
  if (config.token) env.VERCEL_TOKEN = config.token;
  if (config.orgId) env.VERCEL_ORG_ID = config.orgId;
  if (config.projectId) env.VERCEL_PROJECT_ID = config.projectId;
  // Force non-interactive for agents / CI
  env.CI = env.CI || '1';
  return env;
}

function run(commandName, args, { env, cwd = ROOT_DIR } = {}) {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32';
    // Windows: shell resolves .cmd shims (npx.cmd / vercel.cmd). Avoid bare spawn('npx').
    const child = spawn(commandName, args, {
      cwd,
      env,
      stdio: 'inherit',
      shell: isWin,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${commandName} ${args.join(' ')} exited with code ${code ?? 1}`));
    });
  });
}

async function runVercel(config, vercelArgs) {
  const env = buildEnv(config);
  const args = ['--yes', 'vercel@latest', ...vercelArgs];

  if (config.token) {
    args.push('--token', config.token);
  }
  if (config.scope) {
    args.push('--scope', config.scope);
  }

  await run('npx', args, { env });
}

async function runNpmScript(scriptName, config) {
  const env = buildEnv(config);
  await run('npm', ['run', scriptName], { env });
}

function writeLocalLinkHint(config) {
  if (!config.orgId || !config.projectId) return;

  const vercelDir = path.join(ROOT_DIR, '.vercel');
  const projectFile = path.join(vercelDir, 'project.json');

  if (fs.existsSync(projectFile)) return;

  fs.mkdirSync(vercelDir, { recursive: true });
  fs.writeFileSync(
    projectFile,
    `${JSON.stringify(
      {
        projectId: config.projectId,
        orgId: config.orgId,
        projectName: config.projectName || undefined,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  console.log(`Wrote ${path.relative(ROOT_DIR, projectFile)} from credentials (org/project ids).`);
}

function printHelp() {
  console.log(`
Vercel deploy helper for this Astro starter

Usage:
  node scripts/deploy-vercel.mjs <command> [options]

Commands:
  help                 Show this help
  whoami               Show the authenticated Vercel user
  link                 Link this folder to a Vercel project (non-interactive when ids exist)
  deploy               Build (unless --no-build) and deploy
  domains list         List domains for the linked project
  domains add <host>   Attach a custom domain to the project
  inspect              Show local link + credential status (no secrets printed)

Options:
  --config <path>      Credentials JSON (default: ~/credentials/deploy-vercel.json)
  --prod               Production deploy (default when prod != false in JSON)
  --preview            Preview deploy (not production)
  --no-build           Skip npm run build
  --yes                Confirm non-interactive actions
  --domain <host>      Domain hint (also used by domains add if omitted as arg)
  --name <project>     Project name for first deploy / link
  --scope <team>       Team / scope slug

Credentials file example (~/credentials/deploy-vercel.json):
  {
    "token": "vercel_xxx",
    "orgId": "team_xxx",
    "projectId": "prj_xxx",
    "projectName": "my-site",
    "scope": "my-team",
    "prod": true
  }

Env overrides:
  VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID, VERCEL_SCOPE, VERCEL_PROJECT_NAME
  DEPLOY_VERCEL_CONFIG

Make targets:
  make deploy-vercel
  make deploy-vercel-preview
  make deploy-vercel-no-build
  make vercel-whoami
  make vercel-link
`);
}

async function cmdWhoami(config) {
  ensureToken(config);
  await runVercel(config, ['whoami']);
}

async function cmdLink(config) {
  ensureToken(config);
  writeLocalLinkHint(config);

  const args = ['link', '--yes'];
  const name = getArg('--name', config.projectName);
  if (name) args.push('--project', name);

  await runVercel(config, args);
}

async function cmdDeploy(config) {
  ensureToken(config);
  writeLocalLinkHint(config);

  const preview = hasArg('--preview');
  const prod = hasArg('--prod') || (!preview && config.defaultProd);
  const skipBuild = hasArg('--no-build');

  if (!skipBuild) {
    console.log('→ Building site (npm run build)...');
    await runNpmScript('build', config);
  } else {
    console.log('→ Skipping build (--no-build)');
  }

  const args = ['deploy', '--yes'];
  if (prod) args.push('--prod');

  const name = getArg('--name', config.projectName);
  if (name) args.push('--name', name);

  console.log(`→ Deploying to Vercel (${prod ? 'production' : 'preview'})...`);
  await runVercel(config, args);
  console.log('✓ Vercel deploy finished');
}

async function cmdDomains(config) {
  ensureToken(config);
  writeLocalLinkHint(config);

  const sub = argv.filter((item) => !item.startsWith('-')).slice(1);
  const action = sub[0] || 'list';
  const host = sub[1] || config.domain || getArg('--domain');

  if (action === 'list' || action === 'ls') {
    await runVercel(config, ['domains', 'ls']);
    return;
  }

  if (action === 'add') {
    if (!host) {
      console.error('Usage: node scripts/deploy-vercel.mjs domains add example.com');
      process.exit(1);
    }
    await runVercel(config, ['domains', 'add', host]);
    return;
  }

  console.error(`Unknown domains action: ${action}`);
  process.exit(1);
}

function cmdInspect(config) {
  const linked = path.join(ROOT_DIR, '.vercel', 'project.json');
  const linkedData = readJson(linked);

  console.log(JSON.stringify(
    {
      configPath: config.configPath,
      configExists: fs.existsSync(config.configPath),
      hasToken: Boolean(config.token),
      hasOrgId: Boolean(config.orgId),
      hasProjectId: Boolean(config.projectId),
      scope: config.scope || null,
      projectName: config.projectName || null,
      domain: config.domain || null,
      defaultProd: config.defaultProd,
      localLink: linkedData
        ? {
            path: linked,
            projectId: linkedData.projectId || null,
            orgId: linkedData.orgId || null,
            projectName: linkedData.projectName || null,
          }
        : null,
      vercelJson: fs.existsSync(path.join(ROOT_DIR, 'vercel.json')),
    },
    null,
    2,
  ));
}

async function main() {
  const config = loadConfig();

  switch (command) {
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return;
    case 'whoami':
      await cmdWhoami(config);
      return;
    case 'link':
      await cmdLink(config);
      return;
    case 'deploy':
      await cmdDeploy(config);
      return;
    case 'domains':
      await cmdDomains(config);
      return;
    case 'inspect':
    case 'status':
      cmdInspect(config);
      return;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
