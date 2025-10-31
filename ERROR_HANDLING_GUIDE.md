# Production-Ready Error Handling & Resilience

## Overview

The Anava Camera Extension now features production-ready error handling with:

1. **User-Friendly Error UI** - Clear error messages, no technical jargon
2. **Automatic Health Monitoring** - Continuous proxy server health checks
3. **Self-Healing Mechanisms** - Auto-recovery from common failures
4. **Comprehensive Diagnostics** - System health checks with actionable fixes
5. **Error Logging** - Persistent error logs for debugging and support

## Architecture

### Core Services

#### 1. ErrorManager (`src/services/ErrorManager.ts`)

Centralized error handling system that:
- Categorizes errors (proxy, network, deployment, system)
- Assigns severity levels (info, warning, error, critical)
- Provides user-friendly translations of technical errors
- Maintains persistent error log
- Notifies UI of new errors

**Usage:**
```typescript
import { ErrorManager, ErrorTranslator } from './services/ErrorManager.js';

// Report an error
ErrorManager.reportError({
  category: ErrorCategory.PROXY_SERVER,
  severity: ErrorSeverity.ERROR,
  title: 'Proxy Server Not Running',
  message: 'The local proxy server is not responding.',
  suggestion: 'Click "Start Proxy Server" to install and start it.',
  actionButton: {
    label: 'Start Proxy',
    action: 'start_proxy'
  },
  technicalDetails: error.message
});

// Subscribe to errors
ErrorManager.onError((error) => {
  console.log('New error:', error.title);
  displayErrorInUI(error);
});

// Translate errors automatically
const errorDetails = ErrorTranslator.translateProxyError(error);
ErrorManager.reportError(errorDetails);
```

#### 2. ProxyHealthMonitor (`src/services/ProxyHealthMonitor.ts`)

Monitors proxy server health with:
- Periodic health checks (every 10 seconds)
- Consecutive failure tracking
- Response time monitoring
- Auto-recovery attempts after 3 failures
- Status notifications (healthy, degraded, down)

**Features:**
- Detects when proxy crashes or stops responding
- Measures response time (warns if > 1 second)
- Attempts automatic recovery
- Reports errors after multiple failures

**Usage:**
```typescript
import { ProxyHealthMonitor, ProxyStatus } from './services/ProxyHealthMonitor.js';

// Subscribe to health changes
ProxyHealthMonitor.onHealthChange((health, status) => {
  console.log('Proxy status:', status);
  console.log('Response time:', health.responseTime, 'ms');

  if (status === ProxyStatus.DOWN) {
    showProxyDownError();
  }
});

// Force immediate check
const health = await ProxyHealthMonitor.forceCheck();
console.log('Proxy running:', health.isRunning);
```

#### 3. DiagnosticsService (`src/services/DiagnosticsService.ts`)

Comprehensive system diagnostics:
- Proxy server connectivity
- Port availability checks
- Network connectivity tests
- Extension health verification
- Storage access validation

**Features:**
- Runs full diagnostic suite
- Provides actionable fixes for each issue
- Exports reports for support
- Categorizes issues by severity

**Usage:**
```typescript
import { DiagnosticsService } from './services/DiagnosticsService.js';

// Run diagnostics
const report = await DiagnosticsService.runDiagnostics();

console.log('Overall status:', report.overallStatus);
console.log('System info:', report.systemInfo);

// Check individual results
for (const check of report.checks) {
  console.log(`${check.name}: ${check.status}`);
  console.log(`  ${check.message}`);

  if (check.fix) {
    console.log(`  Fix: ${check.fix.label}`);
  }
}

// Export for support
const reportText = DiagnosticsService.exportReport(report);
console.log(reportText);
```

## UI Components

### Error Banner

Located at the top of the popup, the error banner displays:
- **Error title** - Brief description of the issue
- **Error message** - User-friendly explanation
- **Suggestion** - What the user should do
- **Action button** - One-click fix (if available)
- **Dismiss button** - Hide the error
- **Technical details** - Expandable section for debugging

**Styling:**
- Red border/background for errors
- Orange for warnings
- Blue for informational messages
- Smooth slide-down animation

### Status Indicators

Enhanced status indicators show:
- **Green dot** - System healthy (< 1s response time)
- **Yellow dot** - Degraded (slow response time)
- **Red dot** - System down

## Error Translation

The `ErrorTranslator` automatically converts technical errors into user-friendly messages:

### Proxy Errors

| Technical Error | User-Friendly Message |
|----------------|----------------------|
| `ECONNREFUSED` | "Proxy Server Not Running" |
| `EADDRINUSE` | "Proxy Server Port Conflict" |
| `timeout` | "Proxy Server Timeout" |

### Network Scan Errors

| Technical Error | User-Friendly Message |
|----------------|----------------------|
| `no cameras found` | "No Cameras Found" |
| `401 Unauthorized` | "Camera Authentication Failed" |
| `proxy not responding` | "Scan Failed - Proxy Unavailable" |

### Deployment Errors

| Step Failed | User-Friendly Message |
|------------|----------------------|
| Step 1 (Deploy ACAP) | "ACAP Installation Failed" |
| Step 2 (License) | "License Activation Failed" |
| Step 3 (Start ACAP) | "ACAP Failed to Start" |
| Step 4 (Config) | "Configuration Push Failed" |

### System Errors

| Technical Error | User-Friendly Message |
|----------------|----------------------|
| `Extension context invalidated` | "Extension Reloaded" |
| `chrome.runtime error` | "Extension Communication Error" |

## Auto-Recovery

### ProxyHealthMonitor Auto-Recovery

When 3 consecutive health checks fail:
1. Report error to user
2. Check for port conflicts
3. Attempt to resolve conflicts
4. Verify proxy is running
5. Reset failure counter if successful

**Note:** Chrome extensions cannot start/stop system processes, so recovery is limited to detection and reporting.

### Error Recovery Actions

Users can trigger recovery actions from error banners:

| Action | Description |
|--------|-------------|
| `start_proxy` | Show installation instructions |
| `restart_proxy` | Attempt to restart proxy server |
| `check_proxy_status` | Force immediate health check |
| `run_diagnostics` | Run full diagnostic suite |
| `retry_scan` | Retry network scan |
| `refresh_page` | Reload the web page |
| `reload_extension` | Reload the extension |

## Testing Error Handling

### Test Scenario 1: Proxy Not Running

1. Stop the proxy server: `./stop-proxy.sh`
2. Open the extension popup
3. **Expected:**
   - Red status dot
   - "Proxy Server Not Running" error banner
   - "Start Proxy Server" action button
   - Setup instructions displayed

### Test Scenario 2: Proxy Timeout

1. Simulate slow proxy (modify proxy server code)
2. Open the extension popup
3. **Expected:**
   - Yellow status dot (if > 1s response)
   - "Proxy Server Slow" warning
   - Response time displayed

### Test Scenario 3: Extension Context Invalidation

1. Reload the extension while popup is open
2. Try to use a feature
3. **Expected:**
   - "Extension Reloaded" error banner
   - "Refresh Page" action button

### Test Scenario 4: Network Scan Failure

1. Try to scan network with proxy stopped
2. **Expected:**
   - "Scan Failed - Proxy Unavailable" error
   - "Check Proxy Status" action button

### Test Scenario 5: Camera Authentication Failure

1. Scan network with wrong credentials
2. **Expected:**
   - "Camera Authentication Failed" error
   - "Update Credentials" suggestion

## Debugging

### View Error Log

```javascript
// In browser console on popup page
import { ErrorManager } from './services/ErrorManager.js';

// Get recent errors
const errors = ErrorManager.getRecentErrors(10);
console.table(errors);

// Export error log
const log = ErrorManager.exportErrorLog();
console.log(log);
```

### Check Proxy Health

```javascript
// In browser console
import { ProxyHealthMonitor } from './services/ProxyHealthMonitor.js';

// Get current health
const health = ProxyHealthMonitor.getHealth();
console.log('Proxy health:', health);

// Force health check
const newHealth = await ProxyHealthMonitor.forceCheck();
console.log('Updated health:', newHealth);
```

### Run Diagnostics

```javascript
// In browser console
import { DiagnosticsService } from './services/DiagnosticsService.js';

// Run full diagnostics
const report = await DiagnosticsService.runDiagnostics();
console.log('Diagnostic report:', report);

// Export as text
const text = DiagnosticsService.exportReport(report);
console.log(text);
```

## Limitations

### Chrome Extension Constraints

1. **Cannot execute shell commands** - Cannot start/stop proxy server directly
2. **Cannot kill processes** - Cannot detect or kill duplicate proxy instances
3. **Cannot access system logs** - Limited to what's available via Chrome APIs
4. **Service worker lifecycle** - Background script may sleep after 30 seconds

### Workarounds

1. **Proxy management** - User must run `./install-proxy.sh` manually
2. **Process management** - User must run `pkill -f camera-proxy-server` manually
3. **Persistent monitoring** - ProxyHealthMonitor wakes up service worker for checks

## Future Enhancements

1. **Diagnostics Modal** - Full-screen diagnostics UI with live results
2. **Error History** - View and filter past errors
3. **Auto-Update Checks** - Notify when new extension version available
4. **Performance Metrics** - Track proxy response times over time
5. **Advanced Recovery** - More sophisticated auto-recovery strategies

## Support

When reporting issues, export the diagnostic report and error log:

```javascript
// Export error log
const errorLog = ErrorManager.exportErrorLog();

// Export diagnostic report
const diagnostics = await DiagnosticsService.runDiagnostics();
const diagnosticText = DiagnosticsService.exportReport(diagnostics);

// Combine into support bundle
const supportBundle = {
  errorLog,
  diagnostics: diagnosticText,
  timestamp: new Date().toISOString(),
  extensionVersion: chrome.runtime.getManifest().version
};

console.log(JSON.stringify(supportBundle, null, 2));
```

## Summary

The extension now provides:

✅ **User-Friendly Errors** - No more cryptic technical messages
✅ **Automatic Monitoring** - Proxy health checked every 10 seconds
✅ **Self-Healing** - Auto-recovery attempts after failures
✅ **Comprehensive Diagnostics** - Full system health checks
✅ **Actionable Fixes** - One-click recovery actions
✅ **Persistent Logging** - Error history for debugging
✅ **Production Ready** - Handles all common failure scenarios gracefully
