import { execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const commandExists = (command) => {
  try {
    execSync(`command -v ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const isMac = os.platform() === 'darwin';

const hasBrew = () => {
  if (commandExists('brew')) {
    return 'brew';
  }

  if (commandExists('/opt/homebrew/bin/brew')) {
    return '/opt/homebrew/bin/brew';
  }

  if (commandExists('/usr/local/bin/brew')) {
    return '/usr/local/bin/brew';
  }

  return null;
};

const runWith = (command) => execSync(command, { stdio: 'inherit' });

const runBrew = (args) => {
  const brewCommand = hasBrew();
  if (!brewCommand) {
    throw new Error('brew command is not available in PATH.');
  }
  runWith(`${brewCommand} ${args}`);
};


const log = (message) => console.log(`[gcloud-check] ${message}`);
const logError = (message) => console.warn(`[gcloud-check] ${message}`);

const hasPath = (commandPath) => {
  try {
    execSync(`[ -x '${commandPath}' ]`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

if (commandExists('gcloud')) {
  log('Google Cloud SDK is already available.');
  process.exit(0);
}

if (!isMac) {
  logError('gcloud is not installed.');
  if (os.platform() === 'win32') {
    logError('Install via: choco install gcloudsdk');
    logError('or: https://cloud.google.com/sdk/docs/install#windows');
  } else {
    logError('Install from: https://cloud.google.com/sdk/docs/install');
  }
  process.exit(0);
}

try {
  if (!hasBrew()) {
    logError('Homebrew is not installed. Installing Homebrew first...');
    logError('Homebrew install command may ask for confirmation and system password.');
    runWith('/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"');
    log('Homebrew installed.');
  }

  log('Installing Google Cloud SDK via Homebrew...');
  runBrew('install --cask google-cloud-sdk');
} catch (error) {
  logError(`Could not install Google Cloud SDK automatically: ${error?.message || error}`);
  logError('Manual install options:');
  logError('1) Homebrew: brew install --cask google-cloud-sdk');
  logError('2) Official installer: https://cloud.google.com/sdk/docs/install#mac');
  process.exit(0);
}

if (commandExists('gcloud')) {
  log('Google Cloud SDK is available.');
  process.exit(0);
}

const brewPrefix = hasBrew()
  ? (() => {
  try {
    const brewCommand = hasBrew();
    return execSync(`${brewCommand} --prefix google-cloud-sdk`, { encoding: 'utf8' }).toString().trim();
  } catch {
    return '';
  }
})() : '';

const candidates = [
  path.join(os.homedir(), 'google-cloud-sdk', 'bin', 'gcloud'),
  path.join('/opt/homebrew/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/bin/gcloud'),
  path.join('/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/bin/gcloud'),
  path.join(brewPrefix || '', 'bin', 'gcloud'),
  path.join(brewPrefix || '', 'google-cloud-sdk', 'bin', 'gcloud'),
];

if (candidates.some(hasPath)) {
  log('Google Cloud SDK files are present, but not yet in PATH for this shell.');
  log('Run one of these commands, then restart terminal session:');
  if (hasBrew()) {
    log('source "$(brew --prefix)/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/path.bash.inc"');
    log('source "$(brew --prefix)/share/google-cloud-sdk/path.bash.inc"');
  }
  process.exit(0);
}

logError('Google Cloud SDK still not found after installation attempt.');
logError('Restart terminal and run `gcloud --version`.');
process.exit(0);
