# Build Production-Ready Installer

**Quick Guide**: Build a signed, notarized macOS installer ready for end users

---

## One Command to Rule Them All

```bash
APPLE_ID="ryan@anava.ai" \
APPLE_ID_PASSWORD="gbdi-fnth-pxfx-aofv" \
APPLE_TEAM_ID="3JVZNWGRYT" \
CSC_NAME="Ryan Wager (3JVZNWGRYT)" \
./build-production.sh
```

That's it! This will:
1. ✅ Generate icons
2. ✅ Build Chrome extension
3. ✅ Build universal binary (ARM64 + AMD64)
4. ✅ Sign the binary with your Developer ID
5. ✅ Create .pkg installer
6. ✅ Sign the .pkg installer
7. ✅ Submit for notarization to Apple
8. ✅ Wait for notarization approval (~5-10 minutes)
9. ✅ Staple notarization ticket to .pkg
10. ✅ Create extension zip for Chrome Web Store

---

## What You'll Get

After running the command above, you'll find:

```
dist/
  ├── AnavaLocalConnector-2.0.0.pkg  ← Signed & notarized installer
  └── anava-local-connector-extension.zip  ← For Chrome Web Store
```

---

## Testing the Installer

### Install on Your Mac

```bash
# Double-click the .pkg file in Finder
# OR run from terminal:
sudo installer -pkg dist/AnavaLocalConnector-2.0.0.pkg -target /
```

### Verify Installation

```bash
# Check if LaunchAgent is running
launchctl list | grep anava

# Should show:
# 12345  0  com.anava.local_connector

# Check if proxy service is running
curl http://localhost:9876/health

# Should return:
# {"status":"ok"}
```

### Test with Chrome Extension

1. Open Chrome: `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select this directory: `/Users/ryanwager/anava-camera-extension`
5. Click the extension icon
6. Should show: **"Connected ✓"** with green dot
7. Should show version: **2.0.0**

---

## What if Notarization Fails?

The script will still create a signed .pkg, but without notarization.

**Why it might fail:**
- App-specific password is incorrect
- Team ID doesn't match
- Network connectivity issues
- Apple's servers are busy

**To retry notarization manually:**

```bash
# Submit for notarization
xcrun notarytool submit dist/AnavaLocalConnector-2.0.0.pkg \
  --apple-id "ryan@anava.ai" \
  --password "gbdi-fnth-pxfx-aofv" \
  --team-id "3JVZNWGRYT" \
  --wait

# If successful, staple the ticket
xcrun stapler staple dist/AnavaLocalConnector-2.0.0.pkg

# Verify
spctl -a -v --type install dist/AnavaLocalConnector-2.0.0.pkg
```

---

## Build Without Signing (Testing Only)

If you just want to test locally without signing:

```bash
# Build unsigned installer
./scripts/build-macos-pkg.sh

# Install with -allowUntrusted flag
sudo installer -pkg dist/AnavaLocalConnector-2.0.0-unsigned.pkg \
  -target / -allowUntrusted
```

⚠️ **WARNING**: Unsigned installers will show security warnings on other Macs!

---

## Troubleshooting

### "Developer ID certificate not found"

**Problem**: Your Mac doesn't have the signing certificate

**Apple requires TWO different certificate types**:
- **Developer ID Application** - Signs binaries/apps (you have this ✅)
- **Developer ID Installer** - Signs .pkg installers (you need this)

**Solution**:
1. Go to https://developer.apple.com/account/resources/certificates/list
2. Click "+" to create new certificate
3. Select "Developer ID Installer"
4. Download and double-click to install in Keychain
5. Re-run the build script

**Current Status**: Your build will create an unsigned .pkg, but the binary inside IS signed with your Application certificate. This is safe for local testing with `-allowUntrusted` flag.

### "Notarization failed: invalid credentials"

**Problem**: App-specific password is wrong

**Solution**:
1. Go to https://appleid.apple.com/
2. Sign in
3. Go to "Security" → "App-Specific Passwords"
4. Generate new password
5. Use that password in the command

### "lipo: can't create universal file"

**Problem**: One or both binaries didn't build

**Solution**:
```bash
# Build binaries manually
GOOS=darwin GOARCH=arm64 go build -o build/local-connector-arm64 cmd/local-connector/main.go
GOOS=darwin GOARCH=amd64 go build -o build/local-connector-amd64 cmd/local-connector/main.go

# Then run build script again
```

---

## Next Steps After Building

### 1. Test Locally (5 minutes)
- Install the .pkg on your Mac
- Load extension in Chrome
- Verify connection works
- Test camera discovery (if you have cameras)

### 2. Test on Clean Mac (Optional)
- Use a Mac that doesn't have the extension installed
- Test the .pkg installer
- Verify no security warnings appear

### 3. Submit to Chrome Web Store
- Upload `dist/anava-local-connector-extension.zip`
- Fill out listing (see `docs/chrome-web-store-listing.md`)
- Wait for review (1-3 days)

### 4. Distribute Installer
- Upload .pkg to GitHub Releases
- Link from your website
- Users can double-click to install

---

## Build Script Details

The `build-production.sh` script does:

```bash
# 1. Generate icons (if librsvg installed)
./scripts/generate-icons.sh

# 2. Build extension
npm install
npm run build

# 3. Build macOS installer (calls build-macos-pkg.sh)
#    - Builds ARM64 binary
#    - Builds AMD64 binary
#    - Creates universal binary with lipo
#    - Signs binary with codesign
#    - Creates .pkg with pkgbuild
#    - Signs .pkg with productsign
#    - Submits for notarization
#    - Staples notarization ticket

# 4. Create extension zip
zip -r dist/anava-local-connector-extension.zip ...
```

---

## Credentials Explained

| Variable | Value | What It's For |
|----------|-------|---------------|
| `APPLE_ID` | `ryan@anava.ai` | Your Apple ID email |
| `APPLE_ID_PASSWORD` | `gbdi-fnth-pxfx-aofv` | App-specific password (NOT your Apple ID password) |
| `APPLE_TEAM_ID` | `3JVZNWGRYT` | Your Apple Developer Team ID |
| `CSC_NAME` | `Ryan Wager (3JVZNWGRYT)` | Certificate name in Keychain |

**How to find these:**
- Apple ID: Your login email at appleid.apple.com
- App-specific password: Generate at appleid.apple.com → Security
- Team ID: https://developer.apple.com/account → Membership
- Certificate name: Open Keychain Access, look for "Developer ID Installer"

---

## File Structure After Build

```
anava-camera-extension/
├── build/
│   ├── local-connector-arm64      ← ARM64 binary
│   ├── local-connector-amd64      ← AMD64 binary
│   └── local-connector            ← Universal binary (in installer root)
│
├── dist/
│   ├── AnavaLocalConnector-2.0.0.pkg  ← FINAL INSTALLER (signed + notarized)
│   └── anava-local-connector-extension.zip  ← For Chrome Web Store
│
├── installers/macos/root/
│   ├── Applications/AnavaLocalConnector/
│   │   └── local-connector  ← Universal binary (copied here)
│   ├── Library/Application Support/Google/Chrome/NativeMessagingHosts/
│   │   └── com.anava.local_connector.json
│   └── Library/LaunchAgents/
│       └── com.anava.local_connector.plist
│
└── icons/
    ├── icon-16.png  ← Generated
    ├── icon-48.png  ← Generated
    └── icon-128.png ← Generated
```

---

## Summary

**To build production installer:**
```bash
APPLE_ID="ryan@anava.ai" \
APPLE_ID_PASSWORD="gbdi-fnth-pxfx-aofv" \
APPLE_TEAM_ID="3JVZNWGRYT" \
CSC_NAME="Ryan Wager (3JVZNWGRYT)" \
./build-production.sh
```

**Time**: ~10-15 minutes (most of it is Apple notarization)

**Result**: Production-ready installer that users can double-click to install!

🎉 **You're ready to ship!**
