# Privacy Policy - Anava Local Connector

**Last Updated**: January 30, 2025

**IMPORTANT**: This is a DRAFT privacy policy and MUST be reviewed by legal counsel before publication.

---

## Introduction

Anava Local Connector ("the Extension") is a Chrome browser extension that enables web applications to discover and communicate with cameras on your local network. This privacy policy explains what data the Extension collects, how it's used, and your rights regarding that data.

**Operator**: Anava ACAP
**Contact**: [privacy@anava.cloud](mailto:privacy@anava.cloud)
**Website**: [https://connect.anava.cloud](https://connect.anava.cloud)

---

## What We Collect

### Data Collected Locally (Never Sent to External Servers)

The Anava Local Connector stores the following data **locally on your device only**:

1. **Camera Credentials**
   - Username and password for cameras you configure
   - **Storage**: Chrome extension local storage (encrypted by Chrome)
   - **Purpose**: Authenticate with cameras on your local network
   - **Retention**: Until you uninstall the extension or clear browser data

2. **Configuration Settings**
   - terraform-spa project configuration (backend URL, project ID)
   - Extension preferences
   - **Storage**: Chrome extension local storage
   - **Purpose**: Remember your settings between sessions
   - **Retention**: Until you uninstall the extension or clear browser data

3. **Session Tokens**
   - Authentication tokens from terraform-spa backend
   - **Storage**: Chrome extension local storage
   - **Purpose**: Maintain authenticated session with backend
   - **Retention**: Until session expires or extension is reloaded

4. **Discovered Camera Information**
   - IP addresses of cameras on your local network
   - Camera model, firmware version, serial number
   - **Storage**: Chrome extension local storage (temporary)
   - **Purpose**: Display camera information in UI
   - **Retention**: Cleared when you close the extension popup

### Data Sent to Terraform-SPA Backend (If Configured)

If you configure the Extension to work with a terraform-spa project, the following data **may be** sent to that project's backend:

1. **Authentication Requests**
   - Nonce (one-time token) provided by web application
   - Project ID
   - **Purpose**: Authenticate the Extension with your backend
   - **Recipient**: The terraform-spa backend YOU configured
   - **Retention**: Controlled by the backend operator

2. **Camera Deployment Requests**
   - Camera IP address, model, firmware version
   - ACAP configuration (Firebase config, AI Gateway URLs)
   - **Purpose**: Deploy ACAP applications to cameras
   - **Recipient**: The terraform-spa backend YOU configured
   - **Retention**: Controlled by the backend operator

**IMPORTANT**: The Extension does NOT send data to Anava's servers. All communication is between:
- Your browser ↔ Your local camera
- Your browser ↔ Your configured terraform-spa backend

---

## What We Do NOT Collect

- ❌ Browsing history
- ❌ Personally identifiable information (PII)
- ❌ Camera video feeds or images
- ❌ Analytics or telemetry
- ❌ Crash reports
- ❌ Location data
- ❌ Usage statistics

---

## How Data Is Used

### Local Network Communication

The Extension communicates with cameras on your local network using:
- **HTTPS** (encrypted communication)
- **HTTP Digest Authentication** (industry-standard)
- **Self-signed certificates** (for cameras without CA-issued certs)

All camera communication stays on your local network. The Extension cannot access cameras outside your network.

### Companion App (Native Host)

The Extension requires a companion app ("Native Host") that runs on your computer. This app:
- Forwards requests from the Extension to cameras on your local network
- Runs as a local proxy server (127.0.0.1:9876)
- Logs activity to local files for troubleshooting:
  - macOS: `~/Library/Logs/anava-local-connector.log`
  - Windows: `%APPDATA%\Anava\Logs\local-connector.log`
  - Linux: `~/.local/share/anava/logs/local-connector.log`

Log files contain:
- Timestamps
- Request types (e.g., "camera scan", "ACAP deploy")
- IP addresses of cameras
- Error messages

Log files do NOT contain:
- Passwords or credentials
- Camera video/images
- Personally identifiable information

You can delete log files at any time. They are not sent to external servers.

---

## Your Rights

### Access & Deletion

You have the right to:
- **View** all data stored by the Extension (via Chrome DevTools → Application → Storage)
- **Delete** all data by uninstalling the Extension or clearing browser data

### Opt-Out

You can opt out of data collection by:
- Not configuring a terraform-spa backend (Extension works in local-only mode)
- Uninstalling the Extension

### Data Portability

You can export your configuration by:
1. Open Chrome DevTools (F12)
2. Go to Application → Storage → Local Storage → chrome-extension://[EXTENSION_ID]
3. Copy data as JSON

---

## Third-Party Services

The Extension may interact with the following third-party services **only if you configure them**:

### terraform-spa Backend (Your Choice)

If you configure a terraform-spa project, the Extension will send authentication and deployment requests to that backend. That backend's privacy policy applies to data sent to it.

**Anava is NOT responsible for the data practices of terraform-spa backends you configure.**

### Axis Communications (Camera Manufacturer)

The Extension communicates with Axis cameras using VAPIX API. This communication is direct (Extension → Camera) and does not pass through Anava servers.

Axis Communications' privacy policy applies to camera firmware and services: [https://www.axis.com/legal/privacy-policy](https://www.axis.com/legal/privacy-policy)

---

## Security

### Encryption

- All camera communication uses HTTPS (TLS 1.2+)
- Credentials are stored in Chrome's encrypted storage
- Session tokens use industry-standard JWT format

### No External Transmission

The Extension does not transmit data to Anava servers. All data stays:
- On your local device (Chrome storage)
- On your local network (camera communication)
- On your configured backend (if you set one up)

### Open Source

The Extension is open source. You can review the code at:
[https://github.com/AnavaAcap/anava-camera-extension](https://github.com/AnavaAcap/anava-camera-extension)

---

## Children's Privacy

The Extension is not intended for children under 13. We do not knowingly collect data from children.

---

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be posted at:
[https://connect.anava.cloud/privacy](https://connect.anava.cloud/privacy)

**Last updated**: January 30, 2025

---

## Contact Us

If you have questions about this privacy policy, contact us:

**Email**: [privacy@anava.cloud](mailto:privacy@anava.cloud)
**Support**: [https://connect.anava.cloud/support](https://connect.anava.cloud/support)
**GitHub**: [https://github.com/AnavaAcap/anava-camera-extension/issues](https://github.com/AnavaAcap/anava-camera-extension/issues)

---

## Legal Basis (GDPR)

If you are in the European Economic Area (EEA), our legal basis for processing your data is:

- **Consent**: You consent by installing the Extension
- **Legitimate Interest**: We process data to provide the Extension's functionality
- **Contract**: We process data necessary to fulfill the Extension's purpose

---

## Data Retention

| Data Type | Retention Period | Deletion Method |
|-----------|-----------------|----------------|
| Camera credentials | Until uninstall or manual deletion | Uninstall extension or clear browser data |
| Configuration settings | Until uninstall or manual deletion | Uninstall extension or clear browser data |
| Session tokens | Until session expires | Automatic (1 hour) or manual reload |
| Log files | 30 days (auto-rotate) | Delete files from filesystem |

---

## Compliance

This privacy policy is designed to comply with:

- ✅ **Chrome Web Store Developer Program Policies**
- ✅ **GDPR** (General Data Protection Regulation)
- ✅ **CCPA** (California Consumer Privacy Act)
- ✅ **COPPA** (Children's Online Privacy Protection Act)

**NOTE**: Legal review required to confirm compliance.

---

## Your Consent

By using the Anava Local Connector, you consent to this privacy policy.

If you do not agree, do not install or use the Extension.

---

**End of Privacy Policy**

---

## For Legal Review

### Questions for Legal Counsel:

1. **GDPR Compliance**: Do we need a Data Protection Officer (DPO)?
2. **Consent Mechanism**: Is installation sufficient, or do we need explicit opt-in?
3. **Data Processing Agreement**: Do terraform-spa backend operators need DPAs?
4. **Right to Be Forgotten**: How do we handle deletion requests?
5. **Data Breach Notification**: What are our obligations if credentials are compromised?
6. **International Data Transfers**: If backend is outside EEA, what safeguards are needed?
7. **Third-Party Liability**: Are we liable for data practices of configured backends?
8. **Cookie Policy**: Do we need a separate cookie policy? (Extension doesn't use cookies, but Chrome storage is similar)

---

**Draft Status**: Pending legal review
**Reviewed By**: _______________
**Approved By**: _______________
**Publication Date**: _______________
