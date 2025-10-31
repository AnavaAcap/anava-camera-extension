# Load Extension and Get Extension ID

## Steps to Load Extension

1. **Open Chrome Extensions Page**
   - Go to: `chrome://extensions`
   - OR: Chrome menu → More Tools → Extensions

2. **Enable Developer Mode**
   - Toggle "Developer mode" switch in top right corner

3. **Load Unpacked Extension**
   - Click "Load unpacked" button
   - Navigate to: `/Users/ryanwager/anava-camera-extension`
   - **IMPORTANT**: Select the ROOT folder (anava-camera-extension), NOT the dist/ folder
   - Click "Select"

4. **Get Extension ID**
   - Once loaded, you'll see the extension card
   - Under the extension name, you'll see "ID: abc123..."
   - Copy this ID

5. **Test Extension Popup**
   - Click the extension icon in Chrome toolbar
   - Should show green/red connection indicator
   - Should display the extension ID
   - Should show "Connected" if proxy is running

## Extension ID Format

The ID will look something like:
```
abcdefghijklmnopqrstuvwxyz123456
```

Copy the ENTIRE ID - you'll need it for the next step.

## Troubleshooting

**Extension doesn't appear after loading:**
- Make sure you selected the root folder, not dist/
- Check for build errors: `cd /Users/ryanwager/anava-camera-extension && npm run build`

**Extension shows errors:**
- Check the service worker console: Click "Errors" or "service worker" link on extension card
- Verify background.js compiled correctly

**Popup shows "Not Connected":**
- Verify proxy is running: `curl http://127.0.0.1:9876/health`
- Should return: `{"status":"ok"}`
- If not, run: `cd /Users/ryanwager/anava-camera-extension && ./install-proxy.sh`

## Next Step

Once you have the extension ID, provide it to configure the production web app.
