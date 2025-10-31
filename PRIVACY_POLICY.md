# Privacy Policy for Anava Local Connector

**Last Updated**: October 31, 2024

## Overview

Anava Local Connector is a Chrome extension that enables communication between your web browser and network cameras on your local network. This privacy policy explains what data we collect, how we use it, and how we protect your information.

## Data Collection and Use

### What Data We Collect

The extension collects and stores the following information **locally on your device only**:

1. **Network Camera Information**:
   - Camera IP addresses on your local network
   - Camera model numbers and firmware versions
   - Camera authentication credentials (username/password) that you provide

2. **Configuration Data**:
   - Web application configuration from authorized domains
   - Extension settings and preferences

3. **Version Information**:
   - Extension version checks from GitHub (api.github.com) to notify you of updates

### How We Use This Data

- **Local Network Communication**: Camera credentials and IP addresses are used solely to connect to and configure cameras on your local network
- **Browser Storage**: All data is stored locally using Chrome's storage API - never transmitted to external servers (except camera devices on your network)
- **Update Checks**: Version information from GitHub is used only to check for extension updates

### What We DO NOT Do

- ❌ We DO NOT transmit your camera credentials to any external servers
- ❌ We DO NOT collect personal information beyond what's needed for camera connectivity
- ❌ We DO NOT share, sell, or rent your data to third parties
- ❌ We DO NOT track your browsing activity
- ❌ We DO NOT use analytics or tracking services

## Data Security

- All camera communication uses HTTPS with digest authentication
- Credentials are stored encrypted in Chrome's local storage
- Data never leaves your local network except for version checks (GitHub)
- Communication with the local proxy server uses localhost (127.0.0.1) only

## Permissions Justification

The extension requires the following permissions:

| Permission | Purpose |
|------------|---------|
| `nativeMessaging` | Required to communicate with the local connector application that provides network access |
| `storage` | Required to save camera credentials and configuration locally |
| `tabs` | Required to interact with authorized web applications |
| `offscreen` | Required for background processing of camera communications |

### Host Permissions

- `http://localhost:*/*` and `http://127.0.0.1:*/*` - Communication with local proxy server
- `https://anava-ai.web.app/*` and `https://*.anava.cloud/*` - Authorized Anava web applications
- `https://api.github.com/*` and `https://github.com/*` - Version checking only

## Data Retention

- Camera credentials and configuration are stored locally until you uninstall the extension
- You can clear stored data at any time by uninstalling the extension
- No data is retained after uninstallation

## Third-Party Services

The extension only connects to:

1. **GitHub**: For checking extension version updates (no personal data transmitted)
2. **Authorized Anava Web Apps**: Only domains listed in the manifest can communicate with the extension
3. **Your Local Network Cameras**: Direct communication on your local network only

## Companion Application

This extension requires the "Anava Local Connector" native application to be installed on your computer. The companion app:

- Runs locally on your computer (not a cloud service)
- Only accessible via localhost (127.0.0.1:9876)
- Does not transmit data outside your local network
- Handles network communication with cameras that browsers cannot directly access

## Changes to This Policy

We may update this privacy policy from time to time. We will notify users of any material changes by updating the "Last Updated" date at the top of this policy.

## User Rights

You have the right to:

- Access all data stored by the extension (via Chrome's storage inspector)
- Delete all stored data (by uninstalling the extension or clearing Chrome storage)
- Opt-out of version checking (by blocking github.com in your firewall)

## Contact Information

For questions or concerns about this privacy policy, please contact:

- **GitHub Issues**: https://github.com/AnavaAcap/anava-camera-extension/issues
- **Email**: [support contact to be added]

## Compliance

This extension complies with:

- Chrome Web Store Developer Program Policies
- Chrome Extension Limited Use Policy
- General Data Protection Regulation (GDPR) principles
- California Consumer Privacy Act (CCPA) principles

## Open Source

This extension is open source. You can review the complete source code at:
https://github.com/AnavaAcap/anava-camera-extension

---

**Summary**: This extension stores camera credentials locally on your device and only uses them to connect to cameras on your local network. No data is transmitted to external servers except for version checks from GitHub.
