#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

print_help() {
  cat <<'EOF'
Usage:
  ./deploy.sh [options]

Options:
  --profile <name>          Deploy profile from credentials file (default: default)
  --config <path>           Credentials file (default: ~/credentials/deploy-hestia.json)
  --site-config <path>      Site config path (default: ./site.config.json)
  --domain <value>          Domain override for siteUrl and remote path template interpolation
  --dist <path>             Build output folder (default: ./dist/)
  --no-build                Skip npm run build
  --skip-domain-check        Skip Hestia domain existence/creation check
  --create-domain           Create missing domain automatically during deploy
  --help                    Show this help

Environment overrides (legacy compatible):
  DEPLOY_PROFILE
  DEPLOY_CREDENTIALS_FILE
  SITE_CONFIG_PATH
  DEPLOY_SITE_DOMAIN
  LOCAL_DIST
EOF
}

parse_args() {
  local remaining_args=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --profile)
        DEPLOY_PROFILE="${2}"
        shift 2
        ;;
      --config)
        DEPLOY_CONFIG_FILE="${2}"
        shift 2
        ;;
      --site-config)
        SITE_CONFIG_PATH="${2}"
        shift 2
        ;;
      --domain)
        DEPLOY_SITE_DOMAIN="${2}"
        shift 2
        ;;
      --dist)
        LOCAL_DIST="${2}"
        shift 2
        ;;
      --no-build)
        DEPLOY_NO_BUILD=1
        shift 1
        ;;
      --skip-domain-check)
        DEPLOY_SKIP_HESTIA_DOMAIN=1
        shift 1
        ;;
      --create-domain)
        DEPLOY_CREATE_HESTIA_DOMAIN=1
        shift 1
        ;;
      --help|-h)
        print_help
        exit 0
        ;;
      *)
        remaining_args+=("$1")
        shift 1
        ;;
    esac
  done

  if [[ "${#remaining_args[@]}" -gt 0 ]]; then
    echo "❌ Unknown arguments: ${remaining_args[*]}"
    print_help
    exit 1
  fi
}

DEPLOY_PROFILE="${DEPLOY_PROFILE:-default}"
DEPLOY_CONFIG_FILE="${DEPLOY_CREDENTIALS_FILE:-$HOME/credentials/deploy-hestia.json}"
SITE_CONFIG_PATH="${SITE_CONFIG_PATH:-$PROJECT_ROOT/site.config.json}"
DEPLOY_SITE_DOMAIN="${DEPLOY_SITE_DOMAIN:-${SITE_DOMAIN:-}}"
LOCAL_DIST="${LOCAL_DIST:-./dist/}"

parse_args "$@"

read_env_from_config() {
  local output
  output="$(node "$SCRIPT_DIR/scripts/deploy-config.mjs" \
    --format shell \
    ${DEPLOY_SITE_DOMAIN:+--domain "$DEPLOY_SITE_DOMAIN"} \
    --config "$DEPLOY_CONFIG_FILE" \
    --profile "$DEPLOY_PROFILE" \
    --site-config "$SITE_CONFIG_PATH")" || return 1
  eval "$output"
}

read_env_from_config

if [ -z "${REMOTE_HOST:-}" ] || [ -z "${REMOTE_USER:-}" ]; then
  echo "❌ Deployment config is incomplete in: $DEPLOY_CONFIG_FILE"
  echo "Expected profile '$DEPLOY_PROFILE' with remote.host and remote.user."
  exit 1
fi

if [ -z "${REMOTE_PATH:-}" ]; then
  echo "❌ Deployment config is incomplete: remote.path/pathTemplate is empty."
  echo "Check profiles.${DEPLOY_PROFILE}.remote in: $DEPLOY_CONFIG_FILE"
  exit 1
fi

echo "🚀 Starting deployment using Hestia profile '$DEPLOY_PROFILE'..."

REMOTE_TARGET="${REMOTE_USER}@${REMOTE_HOST}"
REMOTE_SSH_ARGS=("-p" "${REMOTE_PORT:-22}")
if [ -n "${REMOTE_SSH_KEY:-}" ]; then
  REMOTE_SSH_ARGS+=("-i" "${REMOTE_SSH_KEY}")
fi
if [ -n "${REMOTE_SSH_OPTIONS:-}" ]; then
  # shell-safe split by spaces for options like '-o StrictHostKeyChecking=no'
  # to avoid unexpected expansion, use eval only for explicit flags
  IFS=' ' read -r -a extra_opts <<< "${REMOTE_SSH_OPTIONS}"
  REMOTE_SSH_ARGS+=("${extra_opts[@]}")
fi

SSH_CMD=(ssh "${REMOTE_SSH_ARGS[@]}" "$REMOTE_TARGET")
echo "🔧 SSH command: ${SSH_CMD[*]}"

run_ssh_connectivity_check() {
  local command_output
  if ! command_output="$(ssh "${REMOTE_SSH_ARGS[@]}" "${REMOTE_TARGET}" "true" 2>&1)"; then
    echo "❌ SSH connectivity check failed."
    echo "   Target: ${REMOTE_TARGET}"
    echo "   Command: ssh ${REMOTE_SSH_ARGS[*]} ${REMOTE_TARGET} true"
    echo "   Output: ${command_output}"

    if [[ "${command_output}" == *"Connection refused"* || "${command_output}" == *"No route to host"* || "${command_output}" == *"timed out"* ]]; then
      echo "💡 Проверьте, что SSHD запущен на хосте, порт/host корректны, и IP вашего клиента разрешен фаерволом."
    fi

    exit 1
  fi
}

run_ssh_connectivity_check

if [ -z "${DEPLOY_SKIP_HESTIA_DOMAIN:-}" ]; then
  echo "🌐 Checking Hestia domain via SSH..."
  DEPLOY_DOMAIN_ARGS=()
  if [ -n "${DEPLOY_CREATE_HESTIA_DOMAIN:-}" ]; then
    DEPLOY_DOMAIN_ARGS+=("--yes")
  fi
  node "$SCRIPT_DIR/scripts/ensure-hestia-domain.mjs" "${DEPLOY_DOMAIN_ARGS[@]}"
fi

auto_build=1
if [ -n "${DEPLOY_NO_BUILD:-}" ] || [ "${1-}" = "--no-build" ]; then
  auto_build=0
fi

if [ "$auto_build" -eq 1 ]; then
  echo "📦 Building production site..."
  (cd "$PROJECT_ROOT" && npm run build)
fi

if [ ! -d "${PROJECT_ROOT}/${LOCAL_DIST}" ]; then
  echo "❌ Build artifacts not found: ${PROJECT_ROOT}/${LOCAL_DIST}"
  echo "Run npm run build or rerun without --no-build."
  exit 1
fi

echo "📤 Uploading files to ${REMOTE_TARGET}:${REMOTE_PATH}"

ssh "${REMOTE_SSH_ARGS[@]}" "${REMOTE_TARGET}" "mkdir -p '${REMOTE_PATH}'"

RSH="ssh ${REMOTE_SSH_ARGS[*]}"
rsync -e "$RSH" -avz --delete "${PROJECT_ROOT}/${LOCAL_DIST}" "${REMOTE_TARGET}:${REMOTE_PATH}"

echo "✅ Deployment successful!"
echo "🔗 Site is live at: ${SITE_URL:-https://$SITE_DOMAIN_NORMALIZED}"
echo "🔗 Remote path: ${REMOTE_PATH}"
