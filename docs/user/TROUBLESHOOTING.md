# Troubleshooting Guide

Comprehensive troubleshooting for the Anava Local Connector.

## Table of Contents

- [Extension Shows "Not Connected"](#extension-shows-not-connected)
- [Extension Shows "Update Required"](#extension-shows-update-required)
- [No Cameras Found](#no-cameras-found)
- [Camera Authentication Fails](#camera-authentication-fails)
- [Slow Camera Discovery](#slow-camera-discovery)
- [High CPU or Memory Usage](#high-cpu-or-memory-usage)
- [Permission Errors](#permission-errors)
- [Crashes or Freezes](#crashes-or-freezes)

---

## Extension Shows "Not Connected"

### Problem
Red dot in extension popup, status shows "Not Connected".

### Cause
The native connector service is not running or Chrome cannot communicate with it.

### Solution

#### Step 1: Check if Service is Running

**macOS:**
```bash
launchctl list | grep anava
# Should see: com.anava.local_connector
```

**Windows:**
```powershell
Get-Process | Where-Object {$_.Name -like "*local-connector*"}
# Should see: local-connector.exe process
```

**Linux:**
```bash
systemctl --user status anava-local-connector
# Should show: active (running)
```

#### Step 2: Restart the Service

**macOS:**
```bash
launchctl stop com.anava.local_connector
launchctl start com.anava.local_connector
```

**Windows:**
1. Open Task Manager
2. Find `local-connector.exe`
3. Right-click → End task
4. Close and reopen Chrome (service auto-starts)

**Linux:**
```bash
systemctl --user restart anava-local-connector
```

#### Step 3: Check Logs

**macOS:**
```bash
tail -f ~/Library/Logs/anava-local-connector.log
```

**Windows:**
```
%LOCALAPPDATA%\Anava\LocalConnector\logs\service.log
```

**Linux:**
```bash
journalctl --user -u anava-local-connector -f
```

Look for errors like:
- "Address already in use" (another service on port 9876)
- "Permission denied" (file permissions issue)
- "Fatal error" (service crash)

#### Step 4: Verify Installation

**macOS:**
```bash
ls -la ~/Applications/AnavaLocalConnector/local-connector
# Should be executable (permissions: -rwxr-xr-x)
```

**Windows:**
```powershell
Test-Path "$env:LOCALAPPDATA\Anava\LocalConnector\local-connector.exe"
# Should return: True
```

**Linux:**
```bash
ls -la /opt/anava/local-connector/local-connector
# Should be executable
```

If file is missing, **reinstall** the native connector.

---

## Extension Shows "Update Required"

### Problem
Orange "!" badge on extension icon, popup shows "Update Required".

### Cause
Extension version and native connector version don't match.

### Solution

1. Click the extension icon
2. Click **Update Now**
3. Download the latest installer for your platform
4. Run the installer (automatically replaces old version)
5. Reload the extension:
   - Go to `chrome://extensions/`
   - Find "Anava Local Connector"
   - Click the reload icon

### Manual Version Check

```bash
# Check native connector version
curl http://localhost:9876/version

# Compare with extension version
# Click extension icon to see current version
```

---

## No Cameras Found

### Problem
Camera discovery completes but finds zero cameras.

### Causes & Solutions

#### 1. Wrong Network Range

**Verify your network**:
```bash
# macOS/Linux
ipconfig getifaddr en0  # WiFi
ipconfig getifaddr en1  # Ethernet

# Windows
ipconfig /all
```

If your IP is `192.168.50.100`, use network range `192.168.50.0/24`.

#### 2. Cameras Not on Network

**Test camera connectivity**:
```bash
# Ping a known camera
ping 192.168.50.156

# Try accessing camera web interface
curl -k https://192.168.50.156
```

If ping fails:
- Check camera power
- Verify network cable
- Confirm camera and computer on same VLAN/subnet

#### 3. Wrong Credentials

**Test credentials directly**:
```bash
curl -k --digest -u username:password https://CAMERA_IP/axis-cgi/basicdeviceinfo.cgi
```

If you get 401 Unauthorized:
- Verify username/password spelling
- Check if account is enabled
- Confirm account has admin privileges

#### 4. Firewall Blocking

**macOS:**
```bash
# Temporarily disable firewall to test
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate off

# Re-enable after testing
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on
```

**Windows:**
```
1. Windows Security → Firewall & network protection
2. Click "Domain network", "Private network", "Public network"
3. Turn off temporarily
4. Test discovery
5. Turn back on
6. If it works, add exception for Anava Local Connector
```

**Linux:**
```bash
# Check firewall status
sudo ufw status

# Allow local network
sudo ufw allow from 192.168.0.0/16

# Or disable temporarily
sudo ufw disable
```

#### 5. Cameras Use HTTP (Not HTTPS)

By default, the connector tries HTTPS first. Some cameras may only support HTTP.

**Workaround**: Configure cameras to enable HTTPS, or contact support for HTTP-only scanning.

#### 6. Unsupported Firmware

The connector requires Axis cameras with firmware 11.11.0 or later.

**Check firmware**:
```bash
curl -k https://CAMERA_IP/axis-cgi/basicdeviceinfo.cgi?apiversion=1.0 \
  -d '{"apiVersion":"1.0","method":"getProperties","params":{"propertyList":["ProdType","HardwareID","Version"]}}'
```

Look for `"Version"` field. If < 11.11.0, upgrade camera firmware.

---

## Camera Authentication Fails

### Problem
Cameras are discovered but authentication fails with "401 Unauthorized" or "Authentication Error".

### Solutions

#### 1. Verify Credentials

Test credentials with curl:
```bash
curl -k --digest -u CAMERA_USER:CAMERA_PASS \
  https://CAMERA_IP/axis-cgi/basicdeviceinfo.cgi \
  -d '{"apiVersion":"1.0","method":"getProperties"}'
```

If this fails, credentials are wrong.

#### 2. Check Account Status

Log into camera web interface:
1. Navigate to `https://CAMERA_IP`
2. Log in with admin account
3. Go to System → Users
4. Verify the deployment account:
   - Is enabled
   - Has "Administrator" role
   - Password hasn't expired

#### 3. Certificate Issues

If error mentions "certificate" or "SSL/TLS":

The connector automatically accepts self-signed certificates. If still failing:

```bash
# Test with curl (should work)
curl -k https://CAMERA_IP

# If curl fails, camera HTTPS is misconfigured
```

#### 4. Digest Auth vs Basic Auth

Most Axis cameras use Digest authentication. If camera is configured for Basic auth only:

The connector tries both automatically. Check camera logs for authentication method mismatches.

---

## Slow Camera Discovery

### Problem
Camera discovery takes too long (>5 minutes for /24 network).

### Optimization Steps

#### 1. Use Smaller Network Range

Instead of /24 (254 IPs):
```
Use /26 (62 IPs)
Use /27 (30 IPs)
Use /28 (14 IPs)
```

Example: If cameras are .150-.160, use `192.168.50.128/27`.

#### 2. Increase Scan Intensity

In the web application:
1. Go to camera discovery settings
2. Change intensity from "Conservative" to "Aggressive"

**Warning**: Aggressive mode may trigger network alarms.

#### 3. Exclude Known Non-Camera IPs

If you know certain IPs are not cameras (e.g., routers, switches), exclude them:

**Not yet implemented** - contact support for custom exclusion lists.

#### 4. Check Network Performance

Slow discovery may indicate network issues:

```bash
# Test network latency to camera
ping -c 10 192.168.50.156

# Should see:
# - avg time < 10ms
# - 0% packet loss
```

If latency > 50ms or packet loss > 1%, investigate network:
- Check for network congestion
- Verify switches aren't overloaded
- Test with different network cable

---

## High CPU or Memory Usage

### Problem
`local-connector` process using high CPU (>30%) or memory (>200 MB).

### Diagnosis

#### 1. Check What It's Doing

**macOS/Linux:**
```bash
# View process details
ps aux | grep local-connector

# Monitor in real-time
top -pid $(pgrep local-connector)
```

**Windows:**
```powershell
# Task Manager → Details tab
# Right-click local-connector.exe → Properties
```

#### 2. Check Logs

```bash
# Look for errors or infinite loops
tail -f ~/Library/Logs/anava-local-connector.log | grep ERROR
```

Common issues:
- "Retrying connection" (infinite retry loop)
- "Rate limited" (too many requests)
- "Memory leak" (bug - report this!)

### Solutions

#### 1. Restart Service

Often fixes temporary high usage:

**macOS:**
```bash
launchctl stop com.anava.local_connector
launchctl start com.anava.local_connector
```

**Windows/Linux**: See "Extension Shows Not Connected" section.

#### 2. Reduce Scan Frequency

If scanning continuously:
1. Complete current scan
2. Don't start new scans until needed
3. Use smaller network ranges

#### 3. Update to Latest Version

High CPU/memory may be a known bug:
1. Check for updates (extension icon)
2. Install latest version
3. Check release notes for bug fixes

---

## Permission Errors

### Problem
Logs show "permission denied", "access denied", or "operation not permitted".

### macOS Solutions

#### 1. Full Disk Access

If error mentions file access:

1. System Preferences → Security & Privacy
2. Privacy tab → Full Disk Access
3. Click lock to make changes
4. Click + and add: `/Users/USERNAME/Applications/AnavaLocalConnector/local-connector`
5. Restart service

#### 2. Network Access

If error mentions network or sockets:

```bash
# Check firewall
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --listapps

# Add exception
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add ~/Applications/AnavaLocalConnector/local-connector
```

### Windows Solutions

#### 1. Run as Administrator

Right-click installer → Run as administrator

#### 2. Check Windows Defender

1. Windows Security → Virus & threat protection
2. Manage settings → Exclusions
3. Add exclusion for `local-connector.exe`

### Linux Solutions

```bash
# Fix file permissions
sudo chmod 755 /opt/anava/local-connector/local-connector

# Fix ownership
sudo chown $USER:$USER /opt/anava/local-connector/local-connector

# Check SELinux (if enabled)
sestatus
# If enforcing, may need to add policy
```

---

## Crashes or Freezes

### Problem
`local-connector` process crashes or stops responding.

### Collect Crash Information

**macOS:**
```bash
# Check crash reports
ls -lt ~/Library/Logs/DiagnosticReports/ | grep local-connector | head -5

# View most recent crash
cat ~/Library/Logs/DiagnosticReports/local-connector_*.crash
```

**Windows:**
```
1. Event Viewer → Windows Logs → Application
2. Filter for "local-connector" or "Error"
3. Look for crash dumps in %LOCALAPPDATA%\CrashDumps
```

**Linux:**
```bash
# Check systemd logs for crashes
journalctl --user -u anava-local-connector --since "1 hour ago"

# Check for core dumps
coredumpctl list
```

### Solutions

#### 1. Update to Latest Version

Crashes are often fixed in updates:
1. Check current version
2. Compare with latest release
3. Update if outdated

#### 2. Clear Corrupted Data

```bash
# macOS
rm ~/Library/Application\ Support/AnavaLocalConnector/*

# Windows
del %LOCALAPPDATA%\Anava\LocalConnector\data\*

# Linux
rm ~/.local/share/anava-local-connector/*
```

#### 3. Reinstall

If crashes persist:
1. Uninstall completely (see Installation Guide)
2. Reboot computer
3. Install fresh copy
4. Test without configuration first

#### 4. Report the Bug

If still crashing:
1. Collect crash logs (above)
2. Note steps to reproduce
3. Report to: https://github.com/AnavaAcap/anava-camera-extension/issues

Include:
- Operating system and version
- Connector version
- Crash logs
- Steps to reproduce

---

## Still Need Help?

If none of these solutions work:

### 1. Gather Information

- Extension version (click icon)
- Native connector version (`curl http://localhost:9876/version`)
- Operating system and version
- Error messages from logs (last 50 lines)
- Steps to reproduce the issue

### 2. Contact Support

**GitHub Issues** (preferred for bugs):
https://github.com/AnavaAcap/anava-camera-extension/issues

**Email Support**:
support@anava.cloud

**Community Forum**:
https://community.anava.cloud

### 3. Include Diagnostic Info

Run diagnostic script:

```bash
# Coming soon - automated diagnostic collector
```

For now, manually collect:
- Logs (see sections above)
- Version info
- System info (`uname -a` on macOS/Linux, `systeminfo` on Windows)
