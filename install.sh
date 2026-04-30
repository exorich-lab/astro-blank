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

echo "✨ Setup complete! You can now start the development server:"
echo "cd $TARGET_DIR"
echo "npm run dev"
echo ""
echo "🧩 Magic UI MCP project configs are included:"
echo "- Codex: .codex/config.toml"
echo "- Antigravity / VS Code MCP: .vscode/mcp.json"
echo "- Generic MCP clients: .mcp.json"
echo "Restart Codex or Antigravity after opening the project so MCP servers reload."
