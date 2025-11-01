# Chrome Web Store Submission - v2.0.8

**Package:** `anava-local-connector-v2.0.8.zip` (44 KB)
**Date:** 2025-11-01
**Key Change:** 27% fewer permissions (11 → 8)

---

## 📦 Quick Submission Steps

1. **Upload Package**
   - Go to: https://chrome.google.com/webstore/devconsole
   - Click "Anava Local Connector"
   - Click "Package" tab
   - Upload: `anava-local-connector-v2.0.8.zip`

2. **Update Version Notes**
   ```
   Version 2.0.8 - Permission Optimization

   - Reduced permissions by 27% (11 → 8)
   - Removed unused nativeMessaging permission
   - Replaced tabs API with content script relay pattern
   - Improved security posture with smaller attack surface
   - No functionality changes - all features work identically
   ```

3. **Update Permission Justifications** (copy/paste from sections below)

4. **Submit for Review**

---

## 📋 Permission Justifications (Copy/Paste)

### **Single Purpose Description**
```
Enables browser-based deployment of AI security analytics to Axis network cameras on local networks. Provides a connection bridge between the Anava web application and local cameras, allowing discovery, configuration, and license activation through a locally-running proxy server.
```

---

### **storage justification**
```
Stores connection preferences (web app URL), caches camera discovery results, maintains error logs for troubleshooting deployment issues, and persists proxy server health status. All data is stored locally and never transmitted to external servers. Used by ErrorManager to track deployment errors and by content scripts to cache web app configuration between page loads.
```

---

### **offscreen justification**
```
Used exclusively to load the Axis SDK library for generating signed license XML required to activate camera applications. The Axis SDK requires DOM access to initialize, which is not available in service workers. The offscreen document (license-worker.html) loads the SDK, generates the cryptographically signed license, and returns the XML to the background worker. This process is required by Axis camera licensing protocol.
```

---

### **Host permission justification**
```
localhost:9876 and 127.0.0.1:9876 - Health checks and API calls to local proxy server (user-installed, runs on localhost only)

anava-ai.web.app, anava-ai.firebaseapp.com, *.anava.cloud - Web application integration for camera deployment UI and configuration discovery

api.github.com - Fetching ACAP application release manifests to determine correct firmware variant for camera deployment

All camera network traffic goes through the local proxy server. The extension makes no direct connections to cameras - it only communicates with localhost proxy and the Anava web application.
```

---

### **Are you using remote code?**
☑️ **No, I am not using Remote code**

**Justification:**
```
All executable code is packaged within the extension. The extension loads the Axis SDK library via offscreen document for license generation, but this is a static external library (axis-sdk.js) bundled with the extension, not remotely loaded code. The extension fetches ACAP binary files (.eap) from GitHub releases, but these are data files deployed to cameras, not code executed by the extension. All core functionality (camera discovery, authentication, deployment orchestration) is implemented in bundled TypeScript compiled to JavaScript.
```

---

## 🎯 Key Selling Points for Reviewers

**What Changed:**
- ❌ Removed `nativeMessaging` - unused legacy code
- ❌ Removed `tabs` - replaced with safer content script pattern
- ❌ Removed `github.com` host permission - only need API access

**Why This Matters:**
- 50% fewer API permissions (4 → 2)
- Smaller attack surface
- Follows principle of least privilege
- No functionality loss

**Evidence of Safety:**
- All network communication limited to localhost proxy
- No direct camera access from extension
- Content script only injects on whitelisted Anava domains
- No remote code execution

---

## ✅ Pre-Submission Checklist

- [ ] Package uploaded: `anava-local-connector-v2.0.8.zip`
- [ ] Version number updated to: **2.0.8**
- [ ] Single purpose description updated
- [ ] All permission justifications updated
- [ ] Remote code answer: **No**
- [ ] Testing completed (see PERMISSION_OPTIMIZATION_v2.0.8.md)
- [ ] Screenshots current (if needed)
- [ ] Privacy policy link working (if applicable)

---

## 📊 Comparison Table (for internal use)

| Permission | v2.0.7 | v2.0.8 | Status |
|------------|--------|--------|--------|
| **storage** | ✅ | ✅ | Kept |
| **offscreen** | ✅ | ✅ | Kept |
| **nativeMessaging** | ✅ | ❌ | **Removed** |
| **tabs** | ✅ | ❌ | **Removed** |
| **localhost:9876** | ✅ | ✅ | Kept |
| **anava-ai.web.app** | ✅ | ✅ | Kept |
| **api.github.com** | ✅ | ✅ | Kept |
| **github.com** | ✅ | ❌ | **Removed** |
| **TOTAL** | **11** | **8** | **-27%** |

---

## 🚨 Potential Reviewer Questions

**Q: Why do you need offscreen permission?**
A: Required by Axis camera licensing SDK which needs DOM access. Cannot run in service worker. See offscreen justification above.

**Q: Why localhost access?**
A: User installs local proxy server to bridge Chrome's sandbox (cannot access local network) with cameras. All camera operations go through localhost:9876.

**Q: Why multiple anava.cloud subdomains?**
A: Supports dev/staging/production environments for web application. All owned by Anava.

**Q: What happened to nativeMessaging permission?**
A: Removed in v2.0.8 - was unused code from old architecture. Now use HTTP to localhost proxy instead.

**Q: What's the proxy server?**
A: User-installed Go binary that runs on their machine. Provides network access to local cameras. Required because Chrome extensions cannot access 192.168.x.x addresses directly.

---

## 📞 Support

If reviewers have questions:
1. Point to this documentation
2. Reference PERMISSION_OPTIMIZATION_v2.0.8.md for technical details
3. Show git commit `c256c1b` for change history
4. Offer to provide demo/walkthrough if needed

---

## 🎉 Expected Outcome

**Best Case:** Quick approval (1-3 days)
**Why:** Reducing permissions is always viewed favorably by reviewers

**Likely Case:** Standard review (3-7 days)
**Why:** New version, need to verify permission changes don't break functionality

**Worst Case:** Questions from reviewers (7-14 days)
**Why:** Reviewers may ask about offscreen or localhost access - refer to justifications above
