# Native Messaging Host - Quick Start

## Installation (5 minutes)

### Step 1: Install Native Host
```bash
cd /Users/ryanwager/anava-camera-extension
./install.sh
```

Expected output:
```
✓ Found extension ID: abcdef123456...
✓ Using ARM64 binary
✓ Directories created
✓ Binary installed
✓ Manifest created
✓ Binary test passed
```

### Step 2: Reload Chrome Extension
1. Open `chrome://extensions`
2. Find "Anava Camera Discovery & Deployment"
3. Click the reload icon 🔄

### Step 3: Test Authentication
1. Open extension popup
2. Try connecting to a camera
3. Check console logs (right-click popup → Inspect)

Expected console output:
```
✅ [NativeHost] Available and responding
🔐 [CameraAuth] Using native messaging host...
✅ [CameraAuth] Authentication successful via HTTPS:443
```

## Verification

### Quick Test
```bash
./test-native-host.sh
```

### Manual Test
```bash
# Test with camera
echo '{"url":"https://192.168.50.156:443/axis-cgi/param.cgi?action=list","method":"GET","username":"anava","password":"baton"}' | \
  python3 -c "import sys, struct; msg = sys.stdin.read().encode(); sys.stdout.buffer.write(struct.pack('<I', len(msg)) + msg)" | \
  ~/Library/Application\ Support/Anava/camera-proxy | \
  python3 -c "import sys, struct, json; length = struct.unpack('<I', sys.stdin.buffer.read(4))[0]; data = sys.stdin.buffer.read(length); print(json.loads(data)['status'])"
```

Expected: `200`

### Check Logs
```bash
tail -f ~/Library/Logs/anava-camera-proxy.log
```

## Troubleshooting

### "Native host not found"
```bash
# Check manifest
cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.anava.camera_proxy.json

# Verify extension ID matches
# Get extension ID from chrome://extensions (enable Developer mode)
# Update manifest if needed
```

### "Permission denied"
```bash
chmod +x ~/Library/Application\ Support/Anava/camera-proxy
```

### Authentication fails
```bash
# Test with curl
curl --digest -u anava:baton https://192.168.50.156:443/axis-cgi/param.cgi?action=list -k

# Check logs
tail -20 ~/Library/Logs/anava-camera-proxy.log
```

## Files Created

```
~/Library/Application Support/Anava/camera-proxy
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.anava.camera_proxy.json
~/Library/Logs/anava-camera-proxy.log
```

## Uninstall

```bash
rm ~/Library/Application\ Support/Anava/camera-proxy
rm ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.anava.camera_proxy.json
rm ~/Library/Logs/anava-camera-proxy.log
```

## Documentation

- **Installation Guide**: [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md)
- **Technical Details**: [NATIVE_MESSAGING_SETUP.md](NATIVE_MESSAGING_SETUP.md)
- **Complete Summary**: [DELIVERABLES_SUMMARY.md](DELIVERABLES_SUMMARY.md)

## Support

If issues persist:
1. Check `~/Library/Logs/anava-camera-proxy.log`
2. Run `./test-native-host.sh`
3. Verify camera is accessible with curl
4. Ensure extension ID matches in manifest
