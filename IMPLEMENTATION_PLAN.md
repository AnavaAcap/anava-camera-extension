# Secure Config Transfer - Implementation Plan

## Executive Summary

**Goal**: Enable Chrome extension to securely receive license keys and cloud configs from web deployer without manual copy-paste.

**Solution**: OAuth 2.0-style authorization flow using Chrome Identity API + one-time token exchange.

**Timeline**: 3 weeks (1 week backend, 1 week extension, 1 week testing)

**Security**: Meets pentesting compliance, Chrome Web Store compatible, no persistent secret storage.

---

## Quick Start for New Session

### 1. Read These Files First
```bash
# Architecture and security design
cat SECURE_CONFIG_ARCHITECTURE.md

# Current project state
cat CLAUDE.md

# This implementation plan
cat IMPLEMENTATION_PLAN.md
```

### 2. Current Branch
```bash
git checkout feature/secure-config-transfer
```

### 3. What's Been Done
- ✅ Architecture designed (with Gemini AI collaboration)
- ✅ Security analysis completed
- ✅ Chrome Web Store compliance verified
- ✅ Documentation written

### 4. What Needs Doing
- ⏳ Backend API implementation (Phase 1)
- ⏳ Extension updates (Phase 2)
- ⏳ Testing and security review (Phase 3)

---

## Phase 1: Backend API Implementation

**Location**: `/Users/ryanwager/anava-infrastructure-deployer`

**Estimated Time**: 1 week

### Task 1.1: Set Up Infrastructure

**Dependencies**:
```bash
# In anava-infrastructure-deployer
npm install redis express-rate-limit
# or
yarn add redis express-rate-limit
```

**Create new directory**:
```bash
mkdir -p src/renderer/api/extension-auth
```

### Task 1.2: Create Authorization Endpoint

**File**: `src/renderer/api/extension-auth/authorize.ts`

```typescript
import express from 'express';
import crypto from 'crypto';
import { getRedisClient } from '../../../main/services/redis';
import { requireAuth } from '../middleware/auth';

const router = express.Router();

// GET /extension/authorize
// Shows authorization screen to user
router.get('/authorize', requireAuth, async (req, res) => {
  const extensionId = req.query.extension_id as string;
  const deploymentId = req.query.deployment_id as string;

  if (!extensionId || !deploymentId) {
    return res.status(400).send('Missing required parameters');
  }

  // Render authorization UI
  res.render('extension-auth', {
    extensionId,
    deploymentId,
    user: req.user
  });
});

// POST /extension/authorize
// User approves, generates one-time code
router.post('/authorize', requireAuth, async (req, res) => {
  const { extensionId, deploymentId, approved } = req.body;
  const userId = req.user.id;

  if (!approved) {
    return res.redirect('chrome://extensions'); // User denied
  }

  // Generate cryptographically secure code
  const authCode = crypto.randomBytes(32).toString('hex');

  // Store in Redis with 60-second TTL
  const redis = getRedisClient();
  await redis.setex(
    `ext_auth:${authCode}`,
    60,
    JSON.stringify({
      userId,
      deploymentId,
      timestamp: Date.now(),
      ip: req.ip
    })
  );

  // Log authorization granted
  await auditLog.create({
    action: 'EXTENSION_AUTH_GRANTED',
    userId,
    deploymentId,
    metadata: { extensionId, ip: req.ip }
  });

  // Redirect back to extension
  const redirectUri = `https://${extensionId}.chromiumapp.org/`;
  res.redirect(`${redirectUri}?code=${authCode}`);
});

export default router;
```

### Task 1.3: Create Exchange Endpoint

**File**: `src/renderer/api/extension-auth/exchange.ts`

```typescript
import express from 'express';
import rateLimit from 'express-rate-limit';
import { getRedisClient } from '../../../main/services/redis';
import { db } from '../../../main/database';

const router = express.Router();

// Rate limiter: 20 requests per minute per IP
const exchangeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Too many exchange attempts, please try again later'
});

// POST /extension/exchange
// Exchanges one-time code for config
router.post('/exchange', exchangeLimiter, async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  // Retrieve auth data from Redis
  const redis = getRedisClient();
  const authData = await redis.get(`ext_auth:${code}`);

  if (!authData) {
    // Log potential replay attack
    await auditLog.create({
      action: 'EXTENSION_AUTH_FAILED',
      reason: 'INVALID_OR_EXPIRED_CODE',
      metadata: { code: code.substring(0, 8) + '...', ip: req.ip }
    });
    return res.status(401).json({ error: 'Invalid or expired authorization code' });
  }

  // CRITICAL: Delete code immediately to prevent replay
  await redis.del(`ext_auth:${code}`);

  const { userId, deploymentId } = JSON.parse(authData);

  // Fetch deployment config from database
  const deployment = await db.deployments.findOne({
    where: { id: deploymentId, userId }
  });

  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }

  // Log successful config access
  await auditLog.create({
    action: 'EXTENSION_CONFIG_ACCESSED',
    userId,
    deploymentId,
    metadata: { ip: req.ip, timestamp: new Date() }
  });

  // Return sensitive configuration
  res.status(200).json({
    licenseKey: deployment.licenseKey,
    customerId: deployment.customerId,
    firebaseConfig: deployment.firebaseConfig,
    geminiConfig: deployment.geminiConfig,
    // Metadata for display
    deploymentName: deployment.name,
    projectId: deployment.gcpProjectId
  });
});

export default router;
```

### Task 1.4: Create Authorization UI

**File**: `src/renderer/views/extension-auth.html` (or React component)

```html
<!DOCTYPE html>
<html>
<head>
  <title>Authorize Anava Extension</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .auth-card {
      background: white;
      padding: 40px;
      border-radius: 12px;
      max-width: 500px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    h1 { margin-top: 0; color: #333; }
    .permissions {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .permissions ul { margin: 10px 0; padding-left: 20px; }
    .buttons { display: flex; gap: 12px; margin-top: 20px; }
    button {
      flex: 1;
      padding: 12px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    .approve {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .deny {
      background: #e0e0e0;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="auth-card">
    <h1>🔐 Authorize Anava Camera Deployer</h1>
    <p>The <strong>Anava Camera Deployer</strong> Chrome extension is requesting access to:</p>

    <div class="permissions">
      <strong>Deployment: {{ deploymentName }}</strong>
      <ul>
        <li>License key</li>
        <li>Firebase configuration</li>
        <li>Vertex AI configuration</li>
      </ul>
    </div>

    <p><small>This data will be transferred securely and stored only for the current browser session.</small></p>

    <form method="POST" action="/extension/authorize">
      <input type="hidden" name="extensionId" value="{{ extensionId }}">
      <input type="hidden" name="deploymentId" value="{{ deploymentId }}">

      <div class="buttons">
        <button type="button" class="deny" onclick="window.close()">Deny</button>
        <button type="submit" name="approved" value="true" class="approve">Allow Access</button>
      </div>
    </form>
  </div>
</body>
</html>
```

### Task 1.5: Wire Up Routes

**File**: `src/renderer/api/index.ts` (or main server file)

```typescript
import authorizeRouter from './extension-auth/authorize';
import exchangeRouter from './extension-auth/exchange';

app.use('/extension', authorizeRouter);
app.use('/extension', exchangeRouter);
```

### Task 1.6: Add Redis Client

**File**: `src/main/services/redis.ts`

```typescript
import { createClient } from 'redis';

let redisClient: ReturnType<typeof createClient> | null = null;

export async function getRedisClient() {
  if (!redisClient) {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    await redisClient.connect();
  }
  return redisClient;
}

export async function closeRedisClient() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
```

### Task 1.7: Environment Variables

**File**: `.env`

```bash
REDIS_URL=redis://localhost:6379
API_BASE_URL=http://localhost:3001
WEB_APP_URL=http://localhost:5173
```

---

## Phase 2: Extension Updates

**Location**: `/Users/ryanwager/anava-camera-extension`

**Estimated Time**: 1 week

### Task 2.1: Update Manifest

**File**: `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "Anava Camera Deployer",
  "version": "2.0.0",
  "permissions": [
    "identity",
    "storage",
    "nativeMessaging"
  ],
  "host_permissions": [
    "https://api.anava.com/*",
    "http://localhost:3001/*"
  ],
  "background": {
    "service_worker": "dist/background.js"
  },
  "action": {
    "default_popup": "popup.html"
  }
}
```

### Task 2.2: Create Config Import Service

**File**: `src/services/ConfigImportService.ts`

```typescript
export interface AnavaConfig {
  licenseKey: string;
  customerId: string;
  firebaseConfig: any;
  geminiConfig: any;
  deploymentName: string;
  projectId: string;
}

export class ConfigImportService {
  private readonly isDevelopment = process.env.NODE_ENV === 'development';
  private readonly webAppUrl = this.isDevelopment
    ? 'http://localhost:5173'
    : 'https://app.anava.com';
  private readonly apiUrl = this.isDevelopment
    ? 'http://localhost:3001'
    : 'https://api.anava.com';

  /**
   * Launch OAuth-style flow to import configuration from web deployer
   */
  async importConfig(deploymentId: string): Promise<AnavaConfig> {
    return new Promise((resolve, reject) => {
      const authUrl = new URL(`${this.webAppUrl}/extension/authorize`);
      authUrl.searchParams.set('extension_id', chrome.runtime.id);
      authUrl.searchParams.set('deployment_id', deploymentId);
      authUrl.searchParams.set('response_type', 'code');

      chrome.identity.launchWebAuthFlow({
        url: authUrl.href,
        interactive: true
      }, async (redirectUrl) => {
        if (chrome.runtime.lastError || !redirectUrl) {
          reject(new Error(chrome.runtime.lastError?.message || 'Auth flow failed'));
          return;
        }

        try {
          const url = new URL(redirectUrl);
          const authCode = url.searchParams.get('code');

          if (!authCode) {
            throw new Error('No authorization code received');
          }

          const config = await this.exchangeCodeForConfig(authCode);
          await this.saveConfig(config);
          resolve(config);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Exchange one-time code for configuration
   */
  private async exchangeCodeForConfig(code: string): Promise<AnavaConfig> {
    const response = await fetch(`${this.apiUrl}/extension/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Exchange failed: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Save config to session storage (NOT local storage)
   */
  private async saveConfig(config: AnavaConfig): Promise<void> {
    await chrome.storage.session.set({ anavaConfig: config });
    console.log('✅ Configuration imported and stored in session');
  }

  /**
   * Get current config from session storage
   */
  async getConfig(): Promise<AnavaConfig | null> {
    const { anavaConfig } = await chrome.storage.session.get('anavaConfig');
    return anavaConfig || null;
  }

  /**
   * Clear config from session storage
   */
  async clearConfig(): Promise<void> {
    await chrome.storage.session.remove('anavaConfig');
  }

  /**
   * Check if config is currently available
   */
  async hasConfig(): Promise<boolean> {
    const config = await this.getConfig();
    return config !== null;
  }
}
```

### Task 2.3: Update Popup UI

**File**: `popup.html` - Add import button

```html
<!-- Add after Step 3 heading -->
<section id="step-configure" class="step-section" style="display: none;">
  <h2>Step 3: Configure Deployment</h2>

  <!-- NEW: Import button -->
  <div class="import-section" style="margin-bottom: 20px; text-align: center;">
    <button id="import-config" class="btn btn-primary" style="width: auto;">
      🔐 Import from Anava Cloud
    </button>
    <p style="font-size: 11px; color: #666; margin-top: 8px;">
      Or enter configuration manually below
    </p>
  </div>

  <div class="selected-info">
    Selected: <span id="selected-count">0</span> camera(s)
  </div>

  <!-- Existing form fields -->
  <!-- ... -->
</section>
```

### Task 2.4: Update Popup JavaScript

**File**: `popup.js` - Add import handler

```javascript
import { ConfigImportService } from './src/services/ConfigImportService.js';

const configImportService = new ConfigImportService();
const importConfigBtn = document.getElementById('import-config');

// Handle config import
importConfigBtn.addEventListener('click', async () => {
  importConfigBtn.disabled = true;
  importConfigBtn.textContent = '🔄 Connecting...';

  try {
    // For now, use latest deployment (later: let user choose)
    const config = await configImportService.importConfig('latest');

    // Populate form fields
    licenseKeyInput.value = config.licenseKey;
    customerIdInput.value = config.customerId;
    firebaseConfigInput.value = JSON.stringify(config.firebaseConfig, null, 2);
    geminiConfigInput.value = JSON.stringify(config.geminiConfig, null, 2);

    // Show success message
    alert(`✅ Configuration imported successfully!\nDeployment: ${config.deploymentName}`);

    updateDeployButton();
  } catch (error) {
    console.error('Import failed:', error);
    alert(`❌ Failed to import configuration:\n${error.message}`);
  } finally {
    importConfigBtn.disabled = false;
    importConfigBtn.textContent = '🔐 Import from Anava Cloud';
  }
});

// On deployment start, use session config if available
startDeployBtn.addEventListener('click', async () => {
  const config = await configImportService.getConfig();

  if (!config) {
    // Fallback to manual form values
    config = {
      licenseKey: licenseKeyInput.value,
      customerId: customerIdInput.value,
      firebaseConfig: JSON.parse(firebaseConfigInput.value),
      geminiConfig: JSON.parse(geminiConfigInput.value)
    };
  }

  // Deploy to cameras
  await deployToAllCameras(selectedCameras, config);

  // Clear sensitive config after successful deployment
  await configImportService.clearConfig();
});
```

### Task 2.5: Remove Persistent Storage of Secrets

**File**: `popup.js` - Remove saveState() for sensitive fields

```javascript
// OLD (do NOT save sensitive data)
async function saveState() {
  const state = {
    currentStep,
    discoveredCameras,
    selectedCameras: Array.from(selectedCameras),
    formData: {
      licenseKey: licenseKeyInput.value, // ❌ REMOVE
      firebaseConfig: firebaseConfigInput.value, // ❌ REMOVE
      geminiConfig: geminiConfigInput.value // ❌ REMOVE
    }
  };
  await chrome.storage.local.set({ anavaState: state });
}

// NEW (only save non-sensitive data)
async function saveState() {
  const state = {
    currentStep,
    discoveredCameras,
    selectedCameras: Array.from(selectedCameras),
    formData: {
      networkRange: networkRangeInput.value, // ✅ OK
      username: usernameInput.value, // ✅ OK (camera creds)
      password: passwordInput.value, // ✅ OK (camera creds)
      intensity: intensitySelect.value, // ✅ OK
      customerId: customerIdInput.value // ✅ OK (not secret)
      // NO license key, NO firebase config, NO gemini config
    }
  };
  await chrome.storage.local.set({ anavaState: state });
}
```

---

## Phase 3: Testing & Security Review

**Estimated Time**: 1 week

### Task 3.1: Unit Tests

```bash
# Backend tests
cd anava-infrastructure-deployer
npm test src/renderer/api/extension-auth/

# Extension tests
cd anava-camera-extension
npm test src/services/ConfigImportService.test.ts
```

### Task 3.2: Integration Tests

**Test Cases**:
1. ✅ Happy path: User authorizes, code exchanges, config received
2. ✅ Code expiration: Wait 61 seconds, exchange fails
3. ✅ Replay attack: Try using same code twice
4. ✅ Invalid code: Try random code, exchange fails
5. ✅ Session persistence: Config available after popup close/reopen
6. ✅ Browser restart: Config cleared, requires re-auth
7. ✅ Rate limiting: 21st request in 1 minute is blocked

### Task 3.3: Security Audit

**Manual Checks**:
- [ ] HTTPS enforced on all endpoints
- [ ] Codes are cryptographically random (32 bytes)
- [ ] Redis TTL actually expires codes
- [ ] Codes are deleted after first use
- [ ] Audit logs capture all auth events
- [ ] No sensitive data in URL (only code)
- [ ] No sensitive data in localStorage
- [ ] Session storage cleared on browser exit

**Automated Scans**:
```bash
# OWASP ZAP scan
zap-cli quick-scan http://localhost:3001/extension

# npm audit
npm audit --production

# Snyk security scan
snyk test
```

### Task 3.4: Penetration Testing

**Scenarios**:
1. Attempt to brute force authorization codes
2. Attempt to replay captured codes
3. Attempt to access other users' configs
4. Attempt XSS on authorization page
5. Attempt CSRF on authorize endpoint
6. Check for timing attacks on code validation

---

## Phase 4: Deployment

### Task 4.1: Backend Deployment

```bash
# Deploy to staging
cd anava-infrastructure-deployer
npm run deploy:staging

# Test staging endpoint
curl -X POST https://api-staging.anava.com/extension/exchange \
  -H "Content-Type: application/json" \
  -d '{"code":"test"}'

# Deploy to production
npm run deploy:production
```

### Task 4.2: Extension Packaging

```bash
cd anava-camera-extension
npm run build

# Create zip for Chrome Web Store
zip -r anava-camera-deployer.zip dist/ manifest.json popup.html popup.css popup.js
```

### Task 4.3: Chrome Web Store Submission

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Upload `anava-camera-deployer.zip`
3. Fill in store listing:
   - Name: Anava Camera Deployer
   - Description: Deploy ACAP applications to Axis cameras
   - Category: Developer Tools
   - Screenshots: (capture workflow)
4. Privacy policy: Upload `PRIVACY_POLICY.md`
5. Submit for review (2-4 weeks)

---

## Rollback Plan

If issues arise:

1. **Immediate**: Disable extension in Web Store (takes effect in minutes)
2. **Backend**: Revert to previous deployment
3. **Database**: No schema changes, no rollback needed
4. **Redis**: Flush extension codes: `redis-cli KEYS "ext_auth:*" | xargs redis-cli DEL`

---

## Success Criteria

- [ ] User can import config in < 30 seconds
- [ ] Zero security vulnerabilities found in pentest
- [ ] Chrome Web Store approval on first submission
- [ ] 99.9% successful auth flow completion rate
- [ ] Zero replay attacks detected in production
- [ ] Zero config leaks in logs or storage

---

## Next Session: Start Here

```bash
# 1. Read the architecture
cat SECURE_CONFIG_ARCHITECTURE.md

# 2. Check out the branch
git checkout feature/secure-config-transfer

# 3. Start with Phase 1, Task 1.1 (Backend Infrastructure)
cd /Users/ryanwager/anava-infrastructure-deployer

# 4. Install dependencies
npm install redis express-rate-limit

# 5. Create first file
mkdir -p src/renderer/api/extension-auth
touch src/renderer/api/extension-auth/authorize.ts

# 6. Follow Phase 1 tasks in order
```

**Questions? Check**:
- `SECURE_CONFIG_ARCHITECTURE.md` for design decisions
- `CLAUDE.md` for project context
- Gemini's original recommendation in this conversation
