#!/usr/bin/env node
/**
 * Build script for Anava Camera Extension
 * Bundles TypeScript services into single background.js
 */

const esbuild = require('esbuild');
const fs = require('fs');
const { execSync } = require('child_process');

console.log('🔨 Building Anava Camera Extension...\n');

// Ensure dist directory exists
try {
  fs.mkdirSync('dist', { recursive: true });
} catch (e) {}

async function build() {
  // Step 1: Build icons
  console.log('1️⃣  Generating icons...');
  try {
    execSync('python3 build-icons.py', { stdio: 'inherit' });
    console.log('✅ Icons generated\n');
  } catch (error) {
    console.error('❌ Icon generation failed:', error.message);
    process.exit(1);
  }

  // Step 2: Copy background script (using root background.js, not TypeScript)
  console.log('2️⃣  Copying background script...');
  try {
    fs.copyFileSync('background.js', 'dist/background.js');
    console.log('✅ Background script copied\n');
  } catch (error) {
    console.error('❌ Copy failed:', error);
    process.exit(1);
  }

  // Step 3: Copy static files
  console.log('3️⃣  Copying static files...');
  const staticFiles = [
    'manifest.json',
    'popup.html',
    'popup.css',
    'popup.js',
    'rules.json',
    'license-worker.html'
  ];

  try {
    for (const file of staticFiles) {
      fs.copyFileSync(file, `dist/${file}`);
      console.log(`   ✓ ${file}`);
    }
    console.log('✅ Static files copied\n');
  } catch (error) {
    console.error('❌ Copy failed:', error.message);
    process.exit(1);
  }

  console.log('🎉 Build complete! Extension ready in dist/\n');
  console.log('📦 Next steps:');
  console.log('   1. Go to chrome://extensions');
  console.log('   2. Click "Load unpacked"');
  console.log('   3. Select the dist/ folder');
  console.log('   4. Copy the extension ID');
  console.log('   5. Add to .env.local: VITE_EXTENSION_ID=<id>\n');
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
