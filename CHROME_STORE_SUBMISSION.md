# Chrome Web Store Submission Guide

This document provides complete instructions for submitting the Anava Local Connector extension to the Chrome Web Store and completing post-submission configuration.

## 📋 Pre-Submission Checklist

### ✅ Requirements Met

- [x] **Manifest V3**: Extension uses manifest version 3 (required since 2024)
- [x] **Icons**: All required sizes present (16x16, 48x48, 128x128) in PNG format
- [x] **Version**: Current version is 2.0.7
- [x] **Permissions**: All permissions justified and minimal
- [x] **Privacy Policy**: Created (`PRIVACY_POLICY.md`) - must be hosted online
- [x] **Description**: Clear, concise description in manifest
- [x] **Build**: Clean production build with no development artifacts
- [x] **Package Size**: 45KB (well under 2GB limit)
- [x] **Code Review**: All code is bundled in the package (no remotely hosted code)

### ⚠️ Pre-Submission Requirements

1. **Chrome Web Store Developer Account**
   - Cost: $5 USD one-time registration fee
   - Sign up at: https://chrome.google.com/webstore/devconsole/
   - Uses your Google account

2. **Host Privacy Policy Online** (REQUIRED)
   - Upload `PRIVACY_POLICY.md` to a public URL
   - Suggested options:
     - GitHub Pages: `https://{username}.github.io/anava-camera-extension/privacy-policy.html`
     - Company website: `https://anava.cloud/privacy-policy`
     - Google Drive (public link)
   - You will need this URL during submission

3. **Prepare Marketing Assets**
   - **Store Icon**: 128x128 PNG (already have: `dist/icon128.png`)
   - **Small Promo Tile**: 440x280 PNG (recommended)
   - **Screenshots**: 1280x800 or 640x400 PNG/JPEG (at least 1, up to 5 recommended)
   - **Marquee Promo Tile**: 1400x560 PNG (optional, for featured placement)

4. **Prepare Store Listing Content**
   - See "Store Listing Content" section below

## 📦 Submission Package

**File**: `anava-local-connector-v2.0.7.zip` (45KB)

**Contents**:
```
anava-local-connector-v2.0.7.zip
├── manifest.json (extension manifest)
└── dist/
    ├── background.js (service worker)
    ├── content-script.js (web app integration)
    ├── popup.html/css/js (extension UI)
    ├── icon16.png, icon48.png, icon128.png (icons)
    ├── license-worker.html/js (license activation)
    ├── axis-sdk.js (Axis camera SDK)
    └── rules.json (header modification rules)
```

**Excluded** (correctly omitted from package):
- ❌ Source TypeScript files (`src/`)
- ❌ Development dependencies (`node_modules/`)
- ❌ Build scripts (`build.js`, `tsconfig.json`)
- ❌ Native host binaries (separate installation)
- ❌ Test files and documentation

## 🚀 Submission Process

### Step 1: Create Developer Account

1. Go to [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole/)
2. Sign in with your Google account
3. Pay the $5 one-time registration fee
4. Complete developer profile

### Step 2: Upload Privacy Policy

**Option A: GitHub Pages** (Recommended for open source)
```bash
# In your anava-camera-extension repo
mkdir docs
cp PRIVACY_POLICY.md docs/privacy-policy.md
git add docs/
git commit -m "docs: Add privacy policy for Chrome Store"
git push

# Enable GitHub Pages:
# Repo Settings → Pages → Source: main branch, /docs folder
# Your URL will be: https://{username}.github.io/anava-camera-extension/privacy-policy.html
```

**Option B: Host on Company Website**
- Upload to: `https://anava.cloud/privacy-policy` (or similar)
- Ensure it's publicly accessible

### Step 3: Create New Item in Developer Console

1. Click "New Item" in the developer console
2. Upload `anava-local-connector-v2.0.7.zip`
3. Chrome will validate the package (wait for validation to complete)

### Step 4: Complete Store Listing

Fill in all required fields (see "Store Listing Content" section below).

**Critical Fields**:
- **Item name**: Anava Local Connector
- **Summary**: One-line description (132 chars max)
- **Description**: Detailed description (see template below)
- **Category**: Productivity or Developer Tools
- **Language**: English (United States)
- **Privacy Policy URL**: Your hosted privacy policy URL

**Privacy Practices**:
Check these boxes based on what data you collect:
- [x] **Personally identifiable information** (camera credentials)
- [x] **Authentication information** (camera username/password)
- [ ] **Personal communications** (NO)
- [ ] **Location** (NO)
- [ ] **Web history** (NO)
- [ ] **Website content** (NO)
- [ ] **User activity** (NO)

**Data Handling Certifications** (REQUIRED):
- [x] The item only uses data as described in the privacy policy
- [x] The item transfers data over a secure connection
- [x] The item does not sell user data to third parties
- [x] The item does not use or transfer data for purposes unrelated to core functionality
- [x] The item does not use or transfer data to determine creditworthiness

**Justification for Permissions**:
```
nativeMessaging: Required to communicate with local connector application for network camera access
storage: Required to save camera credentials and configuration locally (never transmitted externally)
tabs: Required for integration with authorized Anava web applications
offscreen: Required for background camera communication processing
```

**Justification for Host Permissions**:
```
http://localhost:*/* and http://127.0.0.1:*/*: Communication with local proxy server only
https://anava-ai.web.app/* and https://*.anava.cloud/*: Authorized Anava web applications
https://api.github.com/* and https://github.com/*: Version update checks only (no user data transmitted)
```

### Step 5: Upload Marketing Assets

1. **Store Icon**: Upload `dist/icon128.png`
2. **Screenshots**: Upload 3-5 screenshots (see Screenshots section below)
3. **Small Promo Tile**: 440x280 PNG (optional but recommended)

### Step 6: Distribution Settings

- **Visibility**: Public
- **Regions**: Select all countries (or specific regions)
- **Pricing**: Free

### Step 7: Submit for Review

1. Review all information carefully
2. Click "Submit for Review"
3. Wait for review (typically 1-3 business days, can take up to 7 days)
4. Monitor your developer console for review status

## 📝 Store Listing Content

### Item Name
```
Anava Local Connector
```

### Summary (132 characters max)
```
Connect to Axis cameras on your local network. Bridge between web apps and network devices. Requires companion app.
```

### Detailed Description
```markdown
# Anava Local Connector

Connect to Axis network cameras directly from your browser with the Anava Local Connector Chrome extension.

## What It Does

This extension bridges the gap between web applications and network cameras on your local network. It enables browser-based tools to:

- 🔍 Discover Axis cameras on your local network
- 🔐 Authenticate with camera credentials
- 📦 Deploy ACAP applications remotely
- ⚙️ Configure camera settings via VAPIX API
- 📊 Monitor camera firmware and status

## How It Works

1. Install the Anava Local Connector extension (this extension)
2. Install the companion native application (required - separate download)
3. Launch the companion app to enable network access
4. Visit an authorized Anava web application
5. The extension automatically bridges communication between the web app and your cameras

## Requirements

- **Companion Application**: This extension requires the "Anava Local Connector" native application to be installed on your computer. The companion app handles network communication that browsers cannot directly access.
  - Download: [Insert download link after native app is published]
  - Supported OS: macOS, Windows, Linux

- **Network Access**: Cameras must be on the same network as your computer (or accessible via VPN/routing)

- **Camera Compatibility**: Axis cameras running firmware 11.11+ (OS11 or OS12)

## Privacy & Security

- ✅ All data stored locally on your device only
- ✅ Camera credentials never transmitted to external servers
- ✅ Communication with cameras uses HTTPS and digest authentication
- ✅ Open source - review the code yourself
- ✅ No tracking, no analytics, no third-party data sharing

Read our full privacy policy: [Your Privacy Policy URL]

## Open Source

This extension is open source. View the code, report issues, or contribute:
https://github.com/AnavaAcap/anava-camera-extension

## Support

- Documentation: [Your docs URL]
- Issues: https://github.com/AnavaAcap/anava-camera-extension/issues
- Email: [Your support email]

## Compatibility

- **Chrome**: Version 88+ (Manifest V3 support)
- **Chromium-based browsers**: Edge, Brave, Vivaldi, Opera (untested but should work)
- **Cameras**: Axis cameras with firmware 11.11.0 or higher

## Why Native Messaging?

Web browsers cannot directly access local network devices due to security restrictions. The companion native application runs on your computer with full network access, while the extension securely bridges communication between your browser and the companion app.

---

**Note**: This extension is designed for professional use in camera deployment and management scenarios. It requires technical knowledge of network configuration and Axis camera systems.
```

### Screenshots Guidance

Create 3-5 screenshots showing:

1. **Extension Popup** - Shows connection status and link to web app
   - Size: 640x400 or 1280x800
   - Show green "Connected" status

2. **Web App Camera Discovery** - Browser discovering cameras on network
   - Show list of discovered cameras
   - Demonstrate network scanning UI

3. **Camera Configuration** - Configuring camera settings
   - Show camera details and configuration interface

4. **Deployment Progress** - ACAP deployment in action
   - Show progress indicators and status messages

5. **Native App Running** - Screenshot of companion app
   - Show that it's running in background/system tray

**Screenshot Tips**:
- Use clean, professional examples
- Annotate with arrows or highlights if helpful
- Remove any sensitive information (real IPs, credentials)
- Use consistent theme/styling
- Show actual functionality, not just UI

## ⚠️ CRITICAL: Post-Approval Steps

### The Extension ID Problem

Once approved, Chrome Web Store will assign a **permanent extension ID**. This ID is different from your development ID.

**Current State**:
- Development ID: Variable (changes each time you load unpacked)
- Store ID: **Will be assigned upon approval** (e.g., `abcdefghijklmnopqrstuvwxyz123456`)

**Problem**: The native host manifest has a placeholder for the extension ID:
```json
{
  "allowed_origins": [
    "chrome-extension://PLACEHOLDER_EXTENSION_ID/"
  ]
}
```

**Solution**: After approval, you MUST:

1. **Get Your Extension ID**
   - Install from Chrome Web Store
   - Go to `chrome://extensions/`
   - Find "Anava Local Connector"
   - Copy the extension ID (long alphanumeric string)

2. **Update Native Host Manifests**

   Update these files with your real extension ID:
   - `installers/macos/com.anava.local_connector.json`
   - `installers/windows/com.anava.local_connector.json`
   - Native host manifest templates

   **macOS** (`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.anava.local_connector.json`):
   ```json
   {
     "name": "com.anava.local_connector",
     "description": "Anava Local Connector for camera network access",
     "path": "/Applications/AnavaLocalConnector/local-connector",
     "type": "stdio",
     "allowed_origins": [
       "chrome-extension://YOUR_REAL_EXTENSION_ID_HERE/"
     ]
   }
   ```

   **Windows** (`HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.anava.local_connector`):
   ```
   Path to: C:\Users\%USERNAME%\AppData\Local\AnavaLocalConnector\com.anava.local_connector.json
   ```

3. **Rebuild Native App Installers**
   - Update installer packages with correct extension ID
   - Redistribute to users
   - Update download links in store listing

4. **Update Web App Integration**
   - Update `anava-infrastructure-deployer` environment variable
   - Set `VITE_EXTENSION_ID=YOUR_REAL_EXTENSION_ID`
   - Redeploy web application

5. **Test End-to-End**
   - Install extension from Chrome Web Store
   - Install updated native app
   - Verify connection in extension popup (should show green dot)
   - Test camera discovery from web app

### Updating the Extension

When you need to release updates:

1. Increment version in `package.json` and `manifest.json`
2. Build: `npm run build`
3. Create new submission package: `./create-submission-package.sh`
4. Upload new ZIP to developer console (same item, new version)
5. Submit for review

Updates typically review faster than initial submissions (1-2 days).

## 📊 Monitoring & Analytics

### Developer Console Metrics

Monitor these in your developer console:
- Weekly users
- Install/uninstall rate
- Ratings and reviews
- Crash reports

### User Feedback

Respond to user reviews promptly:
- Acknowledge issues
- Provide solutions or workarounds
- Direct users to GitHub issues for bugs
- Thank users for positive feedback

### Crash Reports

If Chrome detects crashes:
1. Review crash reports in developer console
2. Reproduce issue if possible
3. Fix bug
4. Release update

## 🔧 Common Submission Issues

### Rejected for "Remotely Hosted Code"
- **Problem**: Extension loads code from external URLs
- **Status**: ✅ Not applicable - all code is bundled

### Rejected for "Over-Privileged Permissions"
- **Problem**: Requesting more permissions than needed
- **Status**: ✅ Minimal permissions, all justified

### Rejected for "Unclear Privacy Policy"
- **Problem**: Privacy policy doesn't match actual data use
- **Status**: ✅ Comprehensive privacy policy created

### Rejected for "Insufficient Justification"
- **Problem**: Didn't explain why permissions are needed
- **Status**: ✅ See "Justification for Permissions" above

### Rejected for "Violating Chrome Web Store Policies"
- **Problem**: Extension violates one of the many policies
- **Status**: ✅ Complies with all policies (productivity tool, no ads, no tracking)

## 📚 Resources

- [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/)
- [Manifest V3 Requirements](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- [Publishing in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish/)
- [Best Practices for Extension Store Listings](https://developer.chrome.com/docs/webstore/best_practices/)

## 🎯 Success Checklist

Before submitting:
- [ ] Developer account created and paid ($5)
- [ ] Privacy policy hosted online
- [ ] Store listing content prepared
- [ ] Screenshots created (3-5 images)
- [ ] Small promo tile created (440x280)
- [ ] Package validated locally (load in Chrome as unpacked)
- [ ] All manifest fields filled correctly
- [ ] Permissions justified clearly
- [ ] Privacy practices declared accurately

After approval:
- [ ] Extension ID copied from Chrome Web Store
- [ ] Native host manifests updated with real ID
- [ ] Native app installers rebuilt
- [ ] Web app updated with real extension ID
- [ ] End-to-end testing completed
- [ ] Users notified of Chrome Store availability

## 🎉 You're Ready!

Upload `anava-local-connector-v2.0.7.zip` to the Chrome Web Store developer console and complete the store listing using the content templates above.

Good luck! 🚀
