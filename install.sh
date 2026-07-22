#!/bin/bash
set -e

echo "🚀 Starting setup for Astro Blank application..."

# Get the target directory or use "astro-project" as default
TARGET_DIR=${1:-"my-astro-app"}

if [ -d "$TARGET_DIR" ] && [ "$(ls -A $TARGET_DIR)" ]; then
  echo "⚠️  Directory $TARGET_DIR already exists and is not empty."
  echo "Please choose a different name or run this in an empty directory."
  exit 1
fi

echo "📦 Downloading template..."
npx degit exorich-lab/astro-blank "$TARGET_DIR"

cd "$TARGET_DIR"

echo "🔧 Initializing git repository..."
git init

echo "🔨 Installing dependencies..."
npm install

echo "🧠 Syncing AI skills via autoskills (latest versions)..."
if ! npx autoskills --yes --agent codex; then
  echo "⚠️  autoskills sync failed (network or registry issue)."
  echo "   Continuing with the template-bundled skills."
fi

# Prefetch MCP packages into the npm cache only.
# Do NOT run MCP server binaries (e.g. --help): they often wait on stdin and hang forever.
echo "🧩 Prefetching MCP server packages (cache only, no server start)..."
if ! npm cache add @magicuidesign/mcp@latest >/dev/null 2>&1; then
  echo "⚠️  Failed to prefetch @magicuidesign/mcp@latest. Check network/npm. (safe to ignore)"
else
  echo "  cached @magicuidesign/mcp@latest"
fi
if ! npm cache add search-console-mcp@latest >/dev/null 2>&1; then
  echo "⚠️  Failed to prefetch search-console-mcp@latest. Check network/npm. (safe to ignore)"
else
  echo "  cached search-console-mcp@latest"
fi
if ! command -v uv >/dev/null 2>&1; then
  echo "⚠️  uv not found, cannot install analytics-mcp tool."
  echo "   Install uv: curl -LsSf https://astral.sh/uv/install.sh | sh"
else
  # Install tool only — do not run analytics-mcp (MCP servers hang waiting for stdin).
  if ! uv tool install --force analytics-mcp >/dev/null 2>&1; then
    echo "⚠️  Failed to install analytics-mcp from uv. You can try:"
    echo "   uv tool install --force analytics-mcp"
  fi
fi

echo "🎨 Setting up UI/UX Pro Max Design System..."
if ! command -v uipro &> /dev/null; then
  echo "uipro-cli not found globally. Installing..."
  npm install -g uipro-cli
fi

echo "🤖 Initializing AI Design Skill..."
uipro init --ai antigravity

# Fix: uipro creates `.agent` (singular), but we need it in `.agents` (plural)
if [ -d ".agent/skills/ui-ux-pro-max" ]; then
  mkdir -p .agents/skills
  mv .agent/skills/ui-ux-pro-max .agents/skills/
  rm -rf .agent
fi

# Fallbacks for other possible generation paths
if [ -d "ui-ux-pro-max-skill" ]; then
  mkdir -p .agents/skills
  mv ui-ux-pro-max-skill .agents/skills/ui-ux-pro-max
elif [ -d ".uipro" ]; then
  mkdir -p .agents/skills
  mv .uipro .agents/skills/ui-ux-pro-max
fi

# Keep humanizer skill up to date from the latest upstream repository.
echo "🧠 Updating humanizer skill to latest version..."
mkdir -p .agents/skills
if [ -d ".agents/skills/humanizer/.git" ]; then
  (cd .agents/skills/humanizer && git remote set-url origin https://github.com/blader/humanizer.git) >/dev/null 2>&1 || true
  (cd .agents/skills/humanizer && git pull --ff-only)
else
  rm -rf .agents/skills/humanizer
  git clone https://github.com/blader/humanizer.git .agents/skills/humanizer
fi

echo "✨ Setup complete! You can now start the development server:"
echo "cd $TARGET_DIR"
echo "npm run dev"
echo ""
echo "🧩 Magic UI MCP project configs are included:"
echo "- Codex: .codex/config.toml"
echo "- Antigravity / VS Code MCP: .vscode/mcp.json"
echo "- Generic MCP clients: .mcp.json"
echo "Restart Codex or Antigravity after opening the project so MCP servers reload."
