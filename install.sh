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

echo "✨ Setup complete! You can now start the development server:"
echo "cd $TARGET_DIR"
echo "npm run dev"
