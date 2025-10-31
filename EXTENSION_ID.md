# Chrome Web Store Extension ID

## Production Extension ID

**ID**: `gjmomjeppelbbhcmjhnajlbmohogmigi`

**Store URL**: https://chrome.google.com/webstore/detail/gjmomjeppelbbhcmjhnajlbmohogmigi

## Usage

This extension ID is used in:

1. **Native Messaging Host Manifests** - All native host manifests must reference this ID in `allowed_origins`:
   - macOS: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.anava.local_connector.json`
   - Windows: Registry key with manifest at `%LOCALAPPDATA%\Anava\LocalConnector\com.anava.local_connector.json`
   - Linux: `~/.config/google-chrome/NativeMessagingHosts/com.anava.local_connector.json`

2. **Web Application Integration** - The Anava web deployer needs this ID to communicate with the extension:
   ```javascript
   const EXTENSION_ID = 'gjmomjeppelbbhcmjhnajlbmohogmigi';
   chrome.runtime.sendMessage(EXTENSION_ID, message);
   ```

3. **Documentation** - All user-facing documentation should reference the Chrome Web Store URL

## Installer Configuration

All installer packages (macOS PKG, Windows MSI, Linux DEB/RPM) automatically configure the native messaging host manifest with this extension ID during installation.

## Development vs Production

- **Development**: When loading unpacked extension, use the temporary ID from `chrome://extensions/`
- **Production**: Use this permanent ID from Chrome Web Store

## Version History

- **v2.0.7** - Initial Chrome Web Store submission (October 31, 2025)
  - Extension ID assigned: `gjmomjeppelbbhcmjhnajlbmohogmigi`
  - All installer packages updated with production ID

## Testing

To verify the extension ID is working:

1. Install extension from Chrome Web Store
2. Install companion native application
3. Visit https://anava-ai.web.app or https://*.anava.cloud
4. Extension popup should show green "Connected" status
5. Web app should detect extension and enable camera discovery

## Security Note

This extension ID is public and safe to include in open-source code. It's used for extension identity and cannot be used maliciously without the corresponding private signing key held by Google.
