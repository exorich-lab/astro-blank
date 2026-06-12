import fs from 'node:fs';
import http from 'node:http';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

const rootDir = process.cwd();
const siteConfigPath = path.join(rootDir, 'site.config.json');

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
      : (path.isAbsolute(preferredCredentialsDir) ? preferredCredentialsDir : path.resolve(rootDir, preferredCredentialsDir))
    )
  : path.join(os.homedir(), 'credentials');

const tokensPath = path.join(CREDENTIALS_DIR, 'analytics-tokens.json');

// Auto-detect client_secret file
let clientSecretPath = '';
if (fs.existsSync(CREDENTIALS_DIR)) {
  const files = fs.readdirSync(CREDENTIALS_DIR);
  const matchedSecret = files.find(f => f.startsWith('client_secret_') && f.endsWith('.json'));
  if (matchedSecret) {
    clientSecretPath = path.join(CREDENTIALS_DIR, matchedSecret);
  }
}

// Fallback to default if not found
if (!clientSecretPath) {
  clientSecretPath = path.join(CREDENTIALS_DIR, 'client_secret_268801417333-15iu3dr47k48bvfp289uva48c7vk4ui5.apps.googleusercontent.com.json');
}

const PORT = 8085;
const REDIRECT_URI = `http://localhost:${PORT}`;

const SCOPES = [
  'https://www.googleapis.com/auth/analytics.edit',
  'https://www.googleapis.com/auth/tagmanager.edit.containers',
  'https://www.googleapis.com/auth/tagmanager.edit.containerversions',
  'https://www.googleapis.com/auth/tagmanager.publish'
].join(' ');

async function run() {
  if (!fs.existsSync(clientSecretPath)) {
    console.error(`[oauth-setup] Client secret file not found at ${clientSecretPath}`);
    process.exit(1);
  }

  const rawSecret = JSON.parse(fs.readFileSync(clientSecretPath, 'utf8'));
  const config = rawSecret.installed || rawSecret.web;
  if (!config) {
    console.error('[oauth-setup] Invalid client_secret format. Expected "installed" or "web" root key.');
    process.exit(1);
  }

  const { client_id, client_secret } = config;

  console.log('[oauth-setup] Starting local authentication server on port ' + PORT + '...');

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, REDIRECT_URI);
    const code = url.searchParams.get('code');

    if (code) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>Успешно!</h1><p>Авторизация выполнена. Вы можете закрыть эту вкладку и вернуться в терминал.</p>');
      
      console.log('[oauth-setup] Authorization code captured. Exchanging for tokens...');
      
      server.close();

      try {
        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id,
            client_secret,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code',
          }),
        });

        const data = await response.json();
        if (!response.ok || !data.refresh_token) {
          throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
        }

        const credentialsData = {
          client_id,
          client_secret,
          refresh_token: data.refresh_token,
        };

        fs.writeFileSync(tokensPath, JSON.stringify(credentialsData, null, 2), 'utf8');
        console.log('\n================================================================');
        console.log('🎉 SUCCESS: Permanent credentials saved successfully!');
        console.log(`Saved to: ${tokensPath}`);
        console.log('You can now run "make deploy-ga" or the bootstrap script.');
        console.log('================================================================\n');
        process.exit(0);

      } catch (err) {
        console.error('[oauth-setup] Failed to exchange token:', err.message);
        process.exit(1);
      }
    } else {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Code parameter missing.');
    }
  });

  server.listen(PORT, () => {
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
      client_id,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
    }).toString();

    console.log('\nPlease open this link in your browser to authorize:');
    console.log(authUrl);
    console.log('\nTrying to open the browser automatically...');

    try {
      execSync(`open "${authUrl}"`);
    } catch {
      console.log('Failed to open automatically. Please copy and paste the link above into your browser.');
    }
  });
}

run();
