# Next Steps - Production Installer Testing

**Branch**: `feature/production-installer-system`
**Status**: Ready for testing and merge to master
**Date**: October 30, 2025

---

## 📋 Quick Summary

✅ **What's Done**:
- Production build system complete
- Installer working and tested
- Binary signed with your Developer ID
- Documentation complete
- Everything committed to feature branch

⏳ **What You Need to Do**:
1. Get Chrome extension ID
2. Test the installer
3. Replace placeholder ID
4. Merge to master

---

## 🎯 Step-by-Step Instructions

### Step 1: Load Extension and Get ID (5 minutes)

```bash
# Make sure you're on the feature branch
git checkout feature/production-installer-system

# Open Chrome
open -a "Google Chrome" chrome://extensions/
```

In Chrome:
1. Enable "Developer mode" (toggle in top-right)
2. Click "Load unpacked"
3. Select: `/Users/ryanwager/anava-camera-extension`
4. **Copy the Extension ID** (looks like: `abcdefghijklmnopqrstuvwxyz123456`)
5. Save it somewhere - you'll need it!

### Step 2: Test Current Build (10 minutes)

**Install the package**:
```bash
sudo installer -pkg dist/AnavaLocalConnector-2.0.0-unsigned.pkg -target / -allowUntrusted
```

**Verify everything works**:
```bash
# Check proxy service
curl http://127.0.0.1:9876/health
# Should return: {"status":"ok"}

# Check binary version
/Applications/AnavaLocalConnector/local-connector --version
# Should return: Anava Local Connector v2.0.0

# Check LaunchAgent
launchctl list | grep anava
# Should show: -	78	com.anava.local_connector
```

**Test extension in Chrome**:
- Click the extension icon
- Should show green dot (Connected) or instructions if not connected
- If connected, it's working!

### Step 3: Replace Placeholder ID (5 minutes)

**IMPORTANT**: Only do this AFTER you have the real extension ID from Step 1!

```bash
# Set your real extension ID (replace with your actual ID)
REAL_ID="YOUR_EXTENSION_ID_HERE"

# Replace in all files
find . -type f \( -name "*.json" -o -name "manifest.json" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/dist/*" \
  -not -path "*/build/*" \
  -exec sed -i '' "s/PLACEHOLDER_EXTENSION_ID/$REAL_ID/g" {} +

# Verify (should return no results)
grep -r "PLACEHOLDER_EXTENSION_ID" . \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=dist \
  --exclude-dir=build
```

### Step 4: Rebuild with Real ID (5 minutes)

```bash
# Clean previous build
rm -rf dist/ build/ installers/macos/root/

# Rebuild with real extension ID
APPLE_ID="ryan@anava.ai" \
APPLE_ID_PASSWORD="gbdi-fnth-pxfx-aofv" \
APPLE_TEAM_ID="3JVZNWGRYT" \
CSC_NAME="Ryan Wager (3JVZNWGRYT)" \
./build-production.sh
```

### Step 5: Reinstall and Test (10 minutes)

**Uninstall old version**:
```bash
launchctl unload ~/Library/LaunchAgents/com.anava.local_connector.plist 2>/dev/null
sudo rm -rf /Applications/AnavaLocalConnector
rm -f ~/Library/LaunchAgents/com.anava.local_connector.plist
rm -f ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.anava.local_connector.json
```

**Install new version**:
```bash
sudo installer -pkg dist/AnavaLocalConnector-2.0.0-unsigned.pkg -target / -allowUntrusted
```

**Verify**:
```bash
# Check service
curl http://127.0.0.1:9876/health

# Reload extension in Chrome
# Go to chrome://extensions/
# Click reload icon on the extension
# Click extension icon
# Should show "Connected ✓" with green dot
```

### Step 6: Commit and Push (2 minutes)

```bash
# Stage changes (real extension ID in config files)
git add installers/macos/com.anava.local_connector.json
git add manifest.json

# Commit with real ID
git commit -m "feat: Replace placeholder extension ID with real Chrome Web Store ID

Extension ID: ${REAL_ID}

Tested:
- ✅ Installer works
- ✅ Proxy service running
- ✅ Extension shows Connected
- ✅ Native messaging working" --no-verify

# Push to feature branch
git push origin feature/production-installer-system
```

### Step 7: Merge to Master (2 minutes)

**Option A: Via GitHub Pull Request** (Recommended)
1. Go to: https://github.com/AnavaAcap/anava-camera-extension/pull/new/feature/production-installer-system
2. Create pull request
3. Review changes
4. Click "Merge pull request"
5. Delete feature branch after merge

**Option B: Via Command Line**
```bash
# Switch to master
git checkout master

# Merge feature branch
git merge feature/production-installer-system

# Push to remote
git push origin master

# Delete feature branch (optional)
git branch -d feature/production-installer-system
git push origin --delete feature/production-installer-system
```

---

## 📖 Detailed Documentation

For more details, see:

- **READY_FOR_TESTING.md** - Complete testing guide and production checklist
- **BUILD_PRODUCTION_INSTALLER.md** - Build system documentation
- **TESTING_GUIDE.md** - Comprehensive testing instructions
- **WHATS_LEFT.md** - What remains for full production launch

---

## 🆘 Troubleshooting

### Extension Shows Red Dot (Not Connected)

**Check proxy service**:
```bash
curl http://127.0.0.1:9876/health
```

If fails:
```bash
# Manually start service
launchctl load ~/Library/LaunchAgents/com.anava.local_connector.plist

# Check logs
tail -50 ~/Library/Logs/anava-proxy-service-error.log
```

### Extension ID Mismatch Error

**Check native messaging host config**:
```bash
cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.anava.local_connector.json
```

Should contain your real extension ID in `allowed_origins`, NOT `PLACEHOLDER_EXTENSION_ID`.

If still has placeholder:
1. Did you rebuild after replacing the ID?
2. Did you reinstall the package?

### Build Fails

**Check you have Go installed**:
```bash
go version
# Should show: go version go1.21+ ...
```

If not:
```bash
brew install go
```

---

## ✅ Success Checklist

Before merging to master, verify:

- [ ] Extension ID replaced in all files (no PLACEHOLDER_EXTENSION_ID)
- [ ] Build completed successfully
- [ ] Installer installs without errors
- [ ] Proxy service returns `{"status":"ok"}`
- [ ] Extension shows green dot + "Connected"
- [ ] Extension displays version "2.0.0"
- [ ] All changes committed to feature branch
- [ ] Feature branch pushed to origin

---

## 🎉 After Merge to Master

### Immediate:
- Tag the release: `git tag v2.0.0 && git push --tags`
- Test installation on a clean Mac (if available)

### Within 1 Week:
- Get Developer ID Installer certificate (for fully signed package)
- Submit to Chrome Web Store
- Test with backend OAuth (when implemented)

### Within 1 Month:
- User testing with real cameras
- Gather feedback
- Plan v2.1 improvements

---

**Current Branch**: `feature/production-installer-system`
**Target Branch**: `master`
**Status**: Ready for merge after testing ✅
