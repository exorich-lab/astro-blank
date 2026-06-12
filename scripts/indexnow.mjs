import fs from 'node:fs';
import path from 'node:path';

const rawConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'site.config.json'), 'utf8'));
const indexNowConfig = rawConfig.indexNow || {};
const key = process.env.INDEXNOW_KEY || indexNowConfig.key || '';

if (!key) {
  console.log('[indexnow] skip: no key configured (set site.config.json.indexNow.key or INDEXNOW_KEY env var)');
  process.exit(0);
}

const filePath = path.join(process.cwd(), 'public', `${key}.txt`);
const publicDir = path.dirname(filePath);
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;

if (existing !== `${key}\n` && existing !== key) {
  fs.writeFileSync(filePath, key, 'utf8');
}

console.log(`[indexnow] verification file ready: /${key}.txt`);
