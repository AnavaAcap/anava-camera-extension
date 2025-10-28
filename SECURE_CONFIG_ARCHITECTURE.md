# Secure Configuration Transfer Architecture

## Problem Statement

Chrome extension needs to receive sensitive configuration data from the Anava web deployer:
- License keys (sensitive)
- Firebase config (contains API keys)
- Gemini/Vertex AI config (contains API keys/URLs)

**Security Requirements**:
- ✅ Must meet pentesting compliance standards
- ✅ NO persistent storage of sensitive data
- ✅ Works generically (no customer-specific builds)
- ✅ Chrome Web Store compatible
- ✅ Professional, industry-standard approach

## Recommended Solution: OAuth 2.0-Style Authorization Flow

**Pattern**: Chrome Identity API + One-Time Authorization Code Exchange

This is the **industry standard** for securely transferring sensitive data from web apps to browser extensions.

### Architecture Diagram

```
┌─────────────────┐   1. User clicks           ┌──────────────────┐
│ Chrome Extension│      "Connect Account"      │  Extension       │
│    (Popup)      │ ──────────────────────────> │  Auth Handler    │
└─────────────────┘                             └──────────────────┘
        ↑                                                │
        │ 8. POST /exchange-token                       │ 2. launchWebAuthFlow()
        │    with auth_code                             │    Opens popup window
        │ 9. Receives { configs }                       ↓
        │                                       ┌──────────────────┐
┌───────┴─────────┐  7. Validates code,        │   Web Deployer   │
│   Backend API   │     returns configs,        │ app.anava.com    │
│ api.anava.com   │     invalidates code        │  /auth/extension │
└─────────────────┘ <───────────────────────── └──────────────────┘
        ↑                6. POST                         │
        │                                                │
        │ 5. Generate one-time                          │ 3. User logs in
        │    auth_code (60s TTL)                        │ 4. User authorizes
        │                                                ↓
        └────────────────────────────────────────────────┘
             5. Redirect to chromiumapp.org/?code=xxx
```

### Security Properties

| Property | Implementation | Compliance |
|----------|----------------|------------|
| **No secrets in URLs** | Only temporary code in URL, config via POST | ✅ OWASP A01:2021 |
| **Replay attack protection** | One-time code, invalidated after use | ✅ OAuth 2.0 RFC 6749 |
| **Time-limited exposure** | 60-second code TTL | ✅ NIST SP 800-63B |
| **No persistent storage** | chrome.storage.session only | ✅ PCI DSS 3.2.1 |
| **User consent** | Authorization screen shown | ✅ GDPR Article 7 |
| **Audit trail** | Backend logs all exchanges | ✅ SOC 2 Type II |

### Step-by-Step Flow

#### 1. Extension: Initiate Auth Flow
```javascript
// popup.js
document.getElementById('import-config').addEventListener('click', async () => {
  const authUrl = new URL('https://app.anava.com/extension/authorize');
  authUrl.searchParams.set('extension_id', chrome.runtime.id);
  authUrl.searchParams.set('response_type', 'code');

  chrome.identity.launchWebAuthFlow({
    url: authUrl.href,
    interactive: true
  }, handleAuthCallback);
});
```

#### 2. Web App: User Authorization
```html
<!-- app.anava.com/extension/authorize -->
<div class="auth-screen">
  <h2>Anava Camera Deployer Extension</h2>
  <p>This extension wants to access:</p>
  <ul>
    <li>Your deployment license key</li>
    <li>Firebase configuration</li>
    <li>Vertex AI configuration</li>
  </ul>
  <button onclick="authorize()">Allow</button>
  <button onclick="deny()">Deny</button>
</div>
```

#### 3. Backend: Generate One-Time Code
```javascript
// Backend (Node.js/Express)
app.post('/extension/authorize', async (req, res) => {
  const userId = req.session.userId; // From authenticated session
  const deploymentId = req.body.deploymentId; // Which deployment to share

  // Generate cryptographically secure one-time code
  const authCode = crypto.randomBytes(32).toString('hex');

  // Store in Redis with 60-second TTL
  await redis.setex(`ext_auth:${authCode}`, 60, JSON.stringify({
    userId,
    deploymentId,
    timestamp: Date.now()
  }));

  // Redirect back to extension
  const redirectUri = `https://${req.body.extension_id}.chromiumapp.org/`;
  res.redirect(`${redirectUri}?code=${authCode}`);
});
```

#### 4. Extension: Exchange Code for Config
```javascript
// background.js or popup.js
async function handleAuthCallback(redirectUrl) {
  if (!redirectUrl) {
    console.error('Auth failed:', chrome.runtime.lastError);
    return;
  }

  const url = new URL(redirectUrl);
  const authCode = url.searchParams.get('code');

  if (!authCode) {
    throw new Error('No authorization code received');
  }

  // Exchange code for config via secure POST
  const response = await fetch('https://api.anava.com/extension/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: authCode })
  });

  if (!response.ok) {
    throw new Error(`Exchange failed: ${response.status}`);
  }

  const config = await response.json();

  // Store ONLY in session storage (cleared on browser close)
  await chrome.storage.session.set({ anavaConfig: config });

  console.log('✅ Configuration imported securely');
}
```

#### 5. Backend: Validate and Exchange
```javascript
app.post('/extension/exchange', async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Missing code' });
  }

  // Retrieve stored auth data
  const authData = await redis.get(`ext_auth:${code}`);

  if (!authData) {
    // Log potential replay attack attempt
    logger.warn('Invalid/expired code used:', { code, ip: req.ip });
    return res.status(401).json({ error: 'Invalid or expired code' });
  }

  // CRITICAL: Invalidate code immediately (prevent replay)
  await redis.del(`ext_auth:${code}`);

  const { userId, deploymentId } = JSON.parse(authData);

  // Fetch the sensitive config from database
  const deployment = await db.getDeployment(deploymentId, userId);

  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }

  // Audit log
  await db.logConfigAccess({
    userId,
    deploymentId,
    accessMethod: 'extension',
    timestamp: new Date(),
    ip: req.ip
  });

  // Return the sensitive config
  res.status(200).json({
    licenseKey: deployment.licenseKey,
    customerId: deployment.customerId,
    firebaseConfig: deployment.firebaseConfig,
    geminiConfig: deployment.geminiConfig
  });
});
```

#### 6. Extension: Use Config (No Persistence)
```javascript
// When deploying to cameras
async function deployCameras(selectedCameras) {
  // Retrieve from session storage (NOT local storage)
  const { anavaConfig } = await chrome.storage.session.get('anavaConfig');

  if (!anavaConfig) {
    // Config expired/not available - re-authenticate
    alert('Configuration expired. Please reconnect to your Anava account.');
    return;
  }

  // Use the config for deployment
  for (const camera of selectedCameras) {
    await deploymentService.deploy(camera, anavaConfig);
  }

  // Optional: Clear config after successful deployment
  await chrome.storage.session.remove('anavaConfig');
}
```

## Data Storage Policy

| Data Type | Storage Location | Persistence | Justification |
|-----------|------------------|-------------|---------------|
| License keys | `chrome.storage.session` | Session only | PCI DSS compliance |
| Firebase config | `chrome.storage.session` | Session only | Contains API keys |
| Gemini config | `chrome.storage.session` | Session only | Contains API keys |
| Discovered cameras | `chrome.storage.local` | Persistent | No sensitive data |
| Network settings | `chrome.storage.local` | Persistent | User convenience |
| Deployment history | None | Not stored | Audit backend only |

**Key Principle**: If it contains secrets/keys → `chrome.storage.session` ONLY

## Chrome Web Store Compliance

### Required Manifest Permissions
```json
{
  "permissions": [
    "identity",        // For launchWebAuthFlow()
    "storage"          // For chrome.storage.session
  ],
  "host_permissions": [
    "https://api.anava.com/*"  // For config exchange API
  ]
}
```

### Privacy Policy Requirements
Must document:
1. What data is collected (auth tokens, config data)
2. How it's transmitted (HTTPS only)
3. How it's stored (session storage, not persistent)
4. Who has access (user's own deployment only)
5. Retention period (cleared on browser close)

### Review Checklist
- ✅ Minimal permissions requested
- ✅ Clear data handling disclosure
- ✅ No obfuscated code
- ✅ Secure authentication flow
- ✅ User consent mechanism
- ✅ Data retention policy

## Alternative Approaches Considered

### ❌ Option 1: Manual Copy-Paste
**Pros**: Simple, no backend changes
**Cons**: Poor UX, error-prone, clipboard security risks
**Verdict**: Not professional for production use

### ❌ Option 2: QR Code Scanning
**Pros**: Visual transfer, no typing
**Cons**: QR code can be photographed/logged, limited data size
**Verdict**: Less secure than token exchange

### ❌ Option 3: Chrome Extension Messaging API
**Pros**: Direct web page → extension communication
**Cons**: Both must be open simultaneously, requires web page injection
**Verdict**: More complex, no clear security advantage

### ✅ Option 4: OAuth 2.0-Style Flow (SELECTED)
**Pros**: Industry standard, secure, auditable, Web Store compatible
**Cons**: Requires backend API implementation
**Verdict**: Best practice for this use case

## Implementation Checklist

### Phase 1: Backend API (anava-infrastructure-deployer)
- [ ] Create `/extension/authorize` endpoint
- [ ] Create `/extension/exchange` endpoint
- [ ] Set up Redis for temporary code storage
- [ ] Add audit logging for all config access
- [ ] Create authorization UI screen
- [ ] Add rate limiting (prevent brute force)

### Phase 2: Extension Updates (anava-camera-extension)
- [ ] Add `identity` permission to manifest
- [ ] Implement `chrome.identity.launchWebAuthFlow()`
- [ ] Create "Import Configuration" button in UI
- [ ] Replace form inputs with imported values
- [ ] Switch from `chrome.storage.local` to `chrome.storage.session`
- [ ] Add config expiration handling
- [ ] Update CLAUDE.md with new flow

### Phase 3: Testing & Security
- [ ] Penetration test authorization flow
- [ ] Test code expiration (60s TTL)
- [ ] Test code reuse prevention (replay attack)
- [ ] Test browser restart (session cleared)
- [ ] Load test token exchange endpoint
- [ ] Security audit by third party

### Phase 4: Documentation & Deployment
- [ ] Write privacy policy
- [ ] Update user documentation
- [ ] Create video walkthrough
- [ ] Submit to Chrome Web Store
- [ ] Monitor audit logs for anomalies

## Security Considerations

### Threat Model

| Threat | Mitigation | Status |
|--------|------------|--------|
| **Man-in-the-Middle** | HTTPS only, no HTTP fallback | ✅ |
| **Replay Attack** | One-time codes, immediate invalidation | ✅ |
| **Code Interception** | 60s TTL, one-time use | ✅ |
| **Persistent Storage Leak** | Session storage only, cleared on exit | ✅ |
| **XSS on Web App** | CSP headers, token httpOnly cookies | 🔄 |
| **Malicious Extension** | User must explicitly authorize | ✅ |
| **Brute Force** | Rate limiting on exchange endpoint | 🔄 |

### Rate Limiting Recommendations
```javascript
// Backend rate limiter
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per IP
  message: 'Too many authorization attempts'
});

app.post('/extension/authorize', authLimiter, handleAuth);
app.post('/extension/exchange', rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20 // More generous for legitimate retries
}), handleExchange);
```

## Development vs Production

### Development (localhost:5173)
```javascript
const AUTH_URL = process.env.NODE_ENV === 'development'
  ? 'http://localhost:5173/extension/authorize'
  : 'https://app.anava.com/extension/authorize';

const API_URL = process.env.NODE_ENV === 'development'
  ? 'http://localhost:3001/extension/exchange'
  : 'https://api.anava.com/extension/exchange';
```

### Chrome Extension IDs
- **Development**: Unpacked extension (random ID)
- **Production**: Fixed ID from Chrome Web Store

Backend must accept any extension ID (validated against user's auth session, not hardcoded).

## Rollout Plan

### Stage 1: Alpha (Internal Testing)
- Deploy backend to staging environment
- Test with development extension
- Validate security controls
- **Duration**: 1 week

### Stage 2: Beta (Customer Preview)
- Deploy backend to production
- Share unpacked extension with 2-3 pilot customers
- Collect feedback on UX
- **Duration**: 2 weeks

### Stage 3: Production (Chrome Web Store)
- Submit extension for review
- Address any review feedback
- Publish to Chrome Web Store
- Monitor analytics and error logs
- **Duration**: 2-4 weeks (Chrome review time)

## Success Metrics

- **Security**: Zero config leaks, zero replay attacks detected
- **UX**: < 30 seconds to import config (vs 2+ minutes manual entry)
- **Reliability**: 99.9% successful auth flow completion rate
- **Compliance**: Pass Chrome Web Store review on first submission

## References

- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [Chrome Identity API](https://developer.chrome.com/docs/extensions/reference/identity/)
- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [Chrome Web Store Developer Policy](https://developer.chrome.com/docs/webstore/program-policies/)
- [NIST SP 800-63B Digital Identity Guidelines](https://pages.nist.gov/800-63-3/sp800-63b.html)
