#!/usr/bin/env node
/**
 * Build script for Anava Camera Extension
 * Bundles TypeScript services into single background.js
 */

const esbuild = require('esbuild');
const fs = require('fs');
const { execSync } = require('child_process');

console.log('🔨 Building Anava Camera Extension...\n');

// Backup source files to src/ before building to root
const sourceFiles = [
  'src/content-script.ts',
  'popup-new.js',
  'background.js'
];

async function build() {
  // Step 1: Build icons (outputs to root by default)
  console.log('1️⃣  Generating icons...');
  try {
    execSync('python3 build-icons.py', { stdio: 'inherit' });
    console.log('✅ Icons generated\n');
  } catch (error) {
    console.error('❌ Icon generation failed:', error.message);
    process.exit(1);
  }

  // Step 2: Build content script (TypeScript → JavaScript) to ROOT
  console.log('2️⃣  Building content script...');
  try {
    await esbuild.build({
      entryPoints: ['src/content-script.ts'],
      bundle: true,
      outfile: 'content-script.js',  // Output to ROOT, not dist/
      platform: 'browser',
      target: 'es2020',
      format: 'iife',
      sourcemap: false,
      minify: false,
    });
    console.log('✅ Content script built\n');
  } catch (error) {
    console.error('❌ Content script build failed:', error);
    process.exit(1);
  }

  // Step 3: Build popup script (bundle with services) to ROOT
  console.log('3️⃣  Building popup script...');
  try {
    await esbuild.build({
      entryPoints: ['popup-new.js'],
      bundle: true,
      outfile: 'popup.js',  // Output to ROOT, not dist/
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

  // Step 4: background.js already in root - no action needed
  console.log('4️⃣  Background script already in root...');
  console.log('✅ Background script ready\n');

  // Step 5: Verify all required files are in root
  console.log('5️⃣  Verifying files in root...');
  const requiredFiles = [
    'manifest.json',
    'background.js',
    'content-script.js',
    'popup.html',
    'popup.js',
    'popup.css',
    'rules.json',
    'license-worker.html',
    'license-worker.js',
    'axis-sdk.js',
    'icon16.png',
    'icon48.png',
    'icon128.png'
  ];

  let allPresent = true;
  for (const file of requiredFiles) {
    if (fs.existsSync(file)) {
      console.log(`   ✓ ${file}`);
    } else {
      console.log(`   ✗ ${file} MISSING`);
      allPresent = false;
    }
  }

  if (!allPresent) {
    console.error('\n❌ Some required files are missing!');
    process.exit(1);
  }

  console.log('✅ All files verified\n');

  console.log('🎉 Build complete! Extension ready in ROOT directory\n');
  console.log('📦 Next steps:');
  console.log('   1. Go to chrome://extensions');
  console.log('   2. Enable "Developer mode"');
  console.log('   3. Click "Load unpacked"');
  console.log('   4. Select: /Users/ryanwager/anava-camera-extension');
  console.log('   5. Copy the extension ID');
  console.log('   6. Add to web app .env.local: VITE_EXTENSION_ID=<id>\n');
  console.log('✅ Extension can now be loaded directly from root!');
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
