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

# Ensure the skill is moved to the .agents folder if created in the root
if [ -d "ui-ux-pro-max-skill" ]; then
  mkdir -p .agents/skills
  mv ui-ux-pro-max-skill .agents/skills/
fi
# Also try catching if it's named 'uipro' or similar
if [ -f "SKILL.md" ] && [ ! -d ".agents/skills/ui-ux-pro-max" ]; then
  mkdir -p .agents/skills/ui-ux-pro-max
  mv SKILL.md .agents/skills/ui-ux-pro-max/
elif [ -d ".uipro" ]; then
  mkdir -p .agents/skills
  mv .uipro .agents/skills/ui-ux-pro-max
fi

echo "✨ Setup complete! You can now start the development server:"
echo "cd $TARGET_DIR"
echo "npm run dev"
