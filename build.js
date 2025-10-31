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

  // Step 2: Build content script (TypeScript → JavaScript)
  console.log('2️⃣  Building content script...');
  try {
    await esbuild.build({
      entryPoints: ['src/content-script.ts'],
      bundle: true,
      outfile: 'dist/content-script.js',
      platform: 'browser',
      target: 'es2020',
      format: 'iife', // Immediately Invoked Function Expression for content scripts
      sourcemap: false,
      minify: false,
    });
    console.log('✅ Content script built\n');
  } catch (error) {
    console.error('❌ Content script build failed:', error);
    process.exit(1);
  }

  // Step 3: Build popup script (bundle with services)
  console.log('3️⃣  Building popup script...');
  try {
    await esbuild.build({
      entryPoints: ['popup-new.js'],
      bundle: true,
      outfile: 'dist/popup.js',
      platform: 'browser',
      target: 'es2020',
      format: 'iife',
      sourcemap: false,
      minify: false,
    });
    console.log('✅ Popup script built\n');
  } catch (error) {
    console.error('❌ Popup script build failed:', error);
    process.exit(1);
  }

  // Step 4: Copy background script (using root background.js, not TypeScript)
  console.log('4️⃣  Copying background script...');
  try {
    fs.copyFileSync('background.js', 'dist/background.js');
    console.log('✅ Background script copied\n');
  } catch (error) {
    console.error('❌ Copy failed:', error);
    process.exit(1);
  }

  // Step 5: Copy static files
  console.log('5️⃣  Copying static files...');
  const staticFiles = [
    'manifest.json',
    'popup.html',
    'popup.css',
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

  console.log('🎉 Build complete! Extension ready in ROOT directory\n');
  console.log('📦 Next steps:');
  console.log('   1. Go to chrome://extensions');
  console.log('   2. Click "Load unpacked"');
  console.log('   3. Select the ROOT directory (anava-camera-extension)');
  console.log('   4. Copy the extension ID');
  console.log('   5. Add to .env.local: VITE_EXTENSION_ID=<id>\n');
  console.log('⚠️  NOTE: Load from ROOT, not from dist/ folder!');
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
