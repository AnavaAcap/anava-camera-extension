# Anava Local Connector - Installation Guide

Complete installation guide for all supported platforms.

## Prerequisites

- **Chrome/Chromium**: Version 100 or later
- **Operating System**: macOS 11+, Windows 10+, or Ubuntu 20.04+
- **Disk Space**: 50 MB free
- **Network**: Access to local network (192.168.x.x or similar)
- **Permissions**: Administrator/sudo access for installation

## Quick Install

### 1. Install Chrome Extension

1. Visit Chrome Web Store: [Anava Local Connector](https://chrome.google.com/webstore)
2. Click **Add to Chrome**
3. Click **Add extension** in the confirmation dialog
4. Verify the Anava icon appears in your toolbar

### 2. Install Native Connector (Platform-Specific)

Choose your platform below:

- [macOS](#macos-installation)
- [Windows](#windows-installation)
- [Linux (Ubuntu/Debian)](#linux-ubuntudebian-installation)
- [Linux (Fedora/CentOS)](#linux-fedoracentos-installation)

---

## macOS Installation

### Download

Visit [Releases](https://github.com/AnavaAcap/anava-camera-extension/releases/latest) and download:
```
AnavaLocalConnector.pkg
```

### Install

1. **Open the Package**
   ```bash
   open AnavaLocalConnector.pkg
   ```

2. **Follow the Installer**
   - Click **Continue**
   - Click **Install**
   - Enter your password when prompted

3. **Verify Installation**
   ```bash
   # Check if service is running
   launchctl list | grep anava
   
   # Should show: com.anava.local_connector
   ```

4. **Confirm in Chrome**
   - Click the Anava extension icon
   - Status should show: **Connected** (green dot)

### Troubleshooting macOS

**"App from unidentified developer":**
```bash
# Right-click the package → Open → Open anyway
# Or bypass Gatekeeper (not recommended):
xattr -cr AnavaLocalConnector.pkg
```

**Service not starting:**
```bash
# Manually load the service
launchctl load ~/Library/LaunchAgents/com.anava.local_connector.plist

# Check logs
tail -f ~/Library/Logs/anava-local-connector.log
```

**Permission denied:**
```bash
# Fix permissions
chmod 755 ~/Applications/AnavaLocalConnector/local-connector
```

---

## Windows Installation

### Download

Visit [Releases](https://github.com/AnavaAcap/anava-camera-extension/releases/latest) and download:
```
AnavaLocalConnector.msi
```

### Install

1. **Run the Installer**
   - Double-click `AnavaLocalConnector.msi`
   - Click **Next** through the wizard
   - Click **Install**
   - Click **Finish**

2. **Verify Installation**
   - Open Task Manager (Ctrl+Shift+Esc)
   - Go to **Details** tab
   - Look for `local-connector.exe`

3. **Confirm in Chrome**
   - Click the Anava extension icon
   - Status should show: **Connected** (green dot)

### Troubleshooting Windows

**SmartScreen Warning:**
```
1. Click "More info"
2. Click "Run anyway"
```

**Service not running:**
```powershell
# Check if service exists
Get-Process | Where-Object {$_.Name -like "*local-connector*"}

# Restart service
Stop-Process -Name "local-connector" -Force
# Then reopen Chrome
```

**Firewall blocking:**
```
1. Windows Security → Firewall & network protection
2. Allow an app through firewall
3. Check "Anava Local Connector"
```

---

## Linux (Ubuntu/Debian) Installation

### Download

```bash
wget https://github.com/AnavaAcap/anava-camera-extension/releases/latest/download/anava-local-connector_2.0.0_amd64.deb
```

### Install

```bash
# Install package
sudo dpkg -i anava-local-connector_2.0.0_amd64.deb

# Enable and start service
systemctl --user enable --now anava-local-connector

# Verify service is running
systemctl --user status anava-local-connector
```

### Troubleshooting Linux

**Service won't start:**
```bash
# Check logs
journalctl --user -u anava-local-connector -f

# Restart service
systemctl --user restart anava-local-connector
```

**Permission issues:**
```bash
# Fix binary permissions
chmod 755 /opt/anava/local-connector/local-connector
```

---

## Linux (Fedora/CentOS) Installation

### Download

```bash
wget https://github.com/AnavaAcap/anava-camera-extension/releases/latest/download/anava-local-connector-2.0.0-1.x86_64.rpm
```

### Install

```bash
# Install package
sudo rpm -i anava-local-connector-2.0.0-1.x86_64.rpm

# Enable and start service
systemctl --user enable --now anava-local-connector

# Verify service is running
systemctl --user status anava-local-connector
```

---

## Post-Installation

### Configure Your Application

1. Open your Anava-powered web application (e.g., terraform-spa deployment)
2. Navigate to the camera deployment page
3. Click **Connect to Local Network**
4. Chrome will show a permission dialog - click **Allow**
5. Enter your network range (e.g., `192.168.1.0/24`)
6. Enter camera credentials
7. Click **Scan for Cameras**

### Verify Functionality

Test the connection:

1. **Check Extension Status**
   - Click extension icon
   - Should show green "Connected" indicator

2. **Test Health Check**
   ```bash
   # macOS/Linux
   curl http://localhost:9876/health
   
   # Windows PowerShell
   Invoke-WebRequest http://localhost:9876/health
   ```
   
   Expected response: `{"status":"ok"}`

3. **Scan for Cameras**
   - Use the web application to discover cameras
   - Should see cameras appear within 30-60 seconds

---

## Updating

### Extension Updates

The Chrome extension updates automatically via Chrome Web Store.

### Native Connector Updates

When an update is available:

1. Orange "!" badge appears on extension icon
2. Click the icon
3. Click **Update Now**
4. Download the new installer for your platform
5. Run the installer (will replace old version automatically)
6. Service restarts with new version

### Manual Update Check

```bash
# macOS/Linux
curl http://localhost:9876/version

# Compare with latest release:
# https://github.com/AnavaAcap/anava-camera-extension/releases/latest
```

---

## Uninstalling

### Remove Extension

1. Right-click the extension icon
2. Click **Remove from Chrome**
3. Confirm removal

### Remove Native Connector

#### macOS
```bash
# Stop service
launchctl unload ~/Library/LaunchAgents/com.anava.local_connector.plist

# Remove files
rm -rf ~/Applications/AnavaLocalConnector
rm ~/Library/LaunchAgents/com.anava.local_connector.plist
rm ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.anava.local_connector.json
rm ~/Library/Logs/anava-local-connector.log
```

#### Windows
1. Open **Add or Remove Programs**
2. Find **Anava Local Connector**
3. Click **Uninstall**
4. Follow the wizard

#### Linux
```bash
# Ubuntu/Debian
sudo dpkg -r anava-local-connector

# Fedora/CentOS
sudo rpm -e anava-local-connector

# Remove user service files
systemctl --user disable anava-local-connector
rm -rf ~/.config/systemd/user/anava-local-connector.service
```

---

## Advanced Configuration

### Custom Port

By default, the connector listens on `localhost:9876`. To change:

**macOS**: Edit `~/Library/LaunchAgents/com.anava.local_connector.plist`
```xml
<key>ProgramArguments</key>
<array>
    <string>/Users/USERNAME/Applications/AnavaLocalConnector/local-connector</string>
    <string>--proxy-service</string>
    <string>--port</string>
    <string>8080</string>
</array>
```

**Windows**: Edit registry key or reinstall with custom port

**Linux**: Edit systemd service file

### Logging Configuration

Enable debug logging:

```bash
# Add to service arguments
--log-level debug
```

---

## Need Help?

- **Documentation**: https://docs.anava.cloud
- **Troubleshooting**: See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **Support**: support@anava.cloud
- **Issues**: https://github.com/AnavaAcap/anava-camera-extension/issues
- **Community**: https://community.anava.cloud
