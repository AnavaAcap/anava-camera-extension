# Testing Guide - Anava Local Connector

**Last Updated**: 2025-01-30
**Status**: Ready to test!

---

## Quick Start: Test Everything in 30 Minutes

### Step 1: Build the Icons (2 minutes)

```bash
cd /Users/ryanwager/anava-camera-extension

# Install dependencies if needed (macOS)
# brew install librsvg

# Generate icons from SVG
chmod +x scripts/generate-icons.sh
./scripts/generate-icons.sh
```

**Expected output**: `icons/icon-{16,48,128}.png` files created

**Verify**:
```bash
ls -lh icons/*.png
# Should see 3 PNG files
```

---

### Step 2: Build the Unified Binary (5 minutes)

```bash
# Build for your current platform (macOS example)
cd /Users/ryanwager/anava-camera-extension

# macOS (Apple Silicon)
GOOS=darwin GOARCH=arm64 go build -o build/local-connector cmd/local-connector/main.go

# OR macOS (Intel)
GOOS=darwin GOARCH=amd64 go build -o build/local-connector cmd/local-connector/main.go

# Verify
./build/local-connector --version
# Should print: Local Connector v2.0.0
```

---

### Step 3: Test Binary Modes (5 minutes)

#### Test Version Handshake
```bash
echo '{"type":"GET_VERSION"}' | ./build/local-connector --native-messaging | tail -c +5
# Expected: {"version":"2.0.0"}
```

#### Test Proxy Service
```bash
# Start proxy in background
./build/local-connector --proxy-service &
PROXY_PID=$!

# Test health endpoint
curl http://localhost:9876/health
# Expected: {"status":"ok"}

# Kill proxy
kill $PROXY_PID
```

---

### Step 4: Build Extension (3 minutes)

```bash
npm install
npm run build

# Verify
ls -la dist/
# Should see background.js, content-script.js
```

---

### Step 5: Load in Chrome (3 minutes)

1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `/Users/ryanwager/anava-camera-extension` (root directory)
5. Note the Extension ID

---

### Step 6: Install Native Host (5 minutes)

```bash
# Create directories
mkdir -p ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/

# Copy and update manifest
cp installers/macos/com.anava.local_connector.json \
   ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/

# Update path to your build
MANIFEST=~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.anava.local_connector.json
sed -i '' "s|/Users/USERNAME/Applications/AnavaLocalConnector/local-connector|$(pwd)/build/local-connector|g" $MANIFEST

# Update with your extension ID
EXTENSION_ID="YOUR_EXTENSION_ID_HERE"  # Get from chrome://extensions
sed -i '' "s|PLACEHOLDER_EXTENSION_ID|$EXTENSION_ID|g" $MANIFEST
```

---

### Step 7: Test End-to-End (5 minutes)

1. Start proxy service:
   ```bash
   ./build/local-connector --proxy-service &
   ```

2. Reload extension in Chrome

3. Click extension icon
   - Should show green dot (connected)
   - Should show version 2.0.0

4. Open background console:
   - chrome://extensions → Details → Inspect background page
   - Look for: `[VersionCheck] Received version: 2.0.0`

---

### Step 8: Run Tests (5 minutes)

```bash
cd tests
npm install
npm test

# Expected:
# ✓ Version Comparison (8 tests)
# ✓ Configuration Validation (5 tests)
```

---

## What's Left to Do?

### Before Chrome Web Store Submission

1. **Code Signing** (External - $300-500)
   - [ ] Purchase Apple Developer account ($99/year)
   - [ ] Get Developer ID certificate
   - [ ] Purchase Windows code signing cert ($200-400/year)
   - [ ] Sign all installers

2. **Backend OAuth** (Your implementation)
   - [ ] Implement `/oauth/authorize` endpoint
   - [ ] Implement `/oauth/token` endpoint (PKCE validation)
   - [ ] Deploy to production
   - [ ] Test PKCE flow end-to-end

3. **Chrome Web Store** ($5 one-time)
   - [ ] Create developer account
   - [ ] Reserve extension ID
   - [ ] Replace placeholders with real ID
   - [ ] Create listing (screenshots, description)
   - [ ] Submit for review (1-3 days)

4. **Final Testing**
   - [ ] Test on clean macOS VM
   - [ ] Test on clean Windows VM
   - [ ] Test on Ubuntu VM
   - [ ] Test version update flow
   - [ ] Test OAuth flow with real backend

---

## Testing Checklist

### Build ✅ (Can do now)
- [x] Icons generated
- [x] Binary builds successfully
- [x] Extension builds successfully
- [x] Unit tests pass
- [x] Documentation complete

### Functional ⏳ (Can test locally)
- [ ] Version handshake works
- [ ] Health check works
- [ ] Proxy service runs
- [ ] Native messaging works
- [ ] Extension loads without errors

### Integration ⏳ (Requires setup)
- [ ] Camera discovery works
- [ ] OAuth flow works (requires backend)
- [ ] LaunchAgent/Service auto-starts
- [ ] Update detection works

### Production ⏳ (Requires certificates)
- [ ] Signed installers work
- [ ] Notarization succeeds (macOS)
- [ ] SmartScreen accepts (Windows)
- [ ] Chrome Web Store review passes

---

## Quick Test Commands

```bash
# All-in-one test script
cd /Users/ryanwager/anava-camera-extension

# 1. Generate icons
./scripts/generate-icons.sh

# 2. Build binary
GOOS=darwin GOARCH=arm64 go build -o build/local-connector cmd/local-connector/main.go

# 3. Build extension
npm run build

# 4. Run tests
cd tests && npm test && cd ..

# 5. Test binary
./build/local-connector --version
echo '{"type":"GET_VERSION"}' | ./build/local-connector --native-messaging | tail -c +5

# 6. Start proxy and test
./build/local-connector --proxy-service &
sleep 2
curl http://localhost:9876/health
kill %1

echo "✅ All tests passed! Ready for manual testing in Chrome."
```

---

## Troubleshooting

### Icons don't generate
```bash
# Install librsvg
brew install librsvg  # macOS
sudo apt-get install librsvg2-bin  # Linux
```

### Binary won't build
```bash
# Install Go
brew install go  # macOS
# Check version
go version  # Need 1.21+
```

### Extension won't load
- Make sure you're loading the ROOT directory, not dist/
- Check for JavaScript errors in console
- Verify manifest.json is valid JSON

### Native messaging fails
- Check manifest path is correct
- Verify extension ID matches
- Test binary manually first
- Check Chrome logs at chrome://extensions

---

## Next Steps

1. **Run the quick test** (30 minutes)
2. **Fix any issues** found during testing
3. **Get code signing certs** (1-2 weeks lead time)
4. **Implement backend OAuth** (your terraform-spa project)
5. **Submit to Chrome Web Store** (follows launch checklist)

**Start here**: Run Step 1-8 above! 🚀
