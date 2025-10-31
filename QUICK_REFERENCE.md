# Quick Reference - Post-Hardening Changes

## What Changed?

We cleaned up and hardened the **first successful web deployment** code to prevent regressions.

### Key Changes Summary

1. **Cleaner Logs** (-70% noise)
2. **Retry Logic** (3 attempts with backoff)
3. **Input Validation** (rejects bad license keys early)
4. **CI/CD Pipeline** (catches build failures before merge)

## For Developers

### Running Locally

```bash
# Build extension
npm run build

# Build proxy server
cd proxy-server && go build -o camera-proxy-server main.go

# Build local connector
go build -o local-connector native-host-proxy/main.go

# Run tests (CI/CD validation locally)
npm run build  # Should succeed
cd proxy-server && go vet ./...  # Should pass
cd proxy-server && gofmt -l .  # Should return nothing
```

### Common Errors & Solutions

**Error: "License generation failed after 3 attempts"**
- **Cause:** Offscreen document not loading
- **Solution:** Check browser console for SDK loading errors
- **Workaround:** Reload extension and try again

**Error: "Invalid license key format"**
- **Cause:** License key not 16 alphanumeric characters
- **Solution:** Check license key (e.g., `2CNDCWSYP7MG6YBDNR65`)

**Error: "License worker did not become ready within 15 seconds"**
- **Cause:** Axis SDK CDN slow/blocked
- **Solution:** Check internet connection, try again
- **Workaround:** Increase timeout in `generateLicenseWithAxisSDK()`

## For QA Testing

### Test Scenarios

**✅ Happy Path (should take ~60 seconds):**
1. Fresh camera (not licensed)
2. Valid license key
3. Network stable
4. **Expected:** Success with ~30 log lines

**✅ Already Licensed (should take ~20 seconds):**
1. Camera already licensed
2. Valid license key
3. **Expected:** Skips activation, ensures app running

**⚠️ Invalid Input (should fail immediately):**
1. Invalid license key (15 chars, special chars, etc.)
2. **Expected:** Clear error message before any network calls

**🔄 Network Flake (should retry and succeed):**
1. Slow/unstable network during license generation
2. **Expected:** Retries up to 3 times, eventually succeeds

**❌ Persistent Failure (should fail with clear message):**
1. Camera offline
2. **Expected:** Fails with network error after retries exhausted

### Log Monitoring

**Good deployment logs:**
```
[Background] Starting ACAP deployment to: 192.168.50.156
[Background] Step 0: Getting camera info...
[Background] ✅ Camera: AXIS M3215-LVE firmware: 11.11.77
[Background] Step 1: Deploying ACAP file...
[Background] ✅ ACAP deployed
[Background] Step 2: Activating license...
[Background] Activating license for camera: 192.168.50.156
[Background] ✅ License verified as active
[Background] ✅ License activation complete
[Background] ✅ License activated and app started
[Background] Step 3: Pushing configuration...
[Background] ✅ Configuration pushed
[Background] Step 4: Validating deployment...
[Background] ✅ Deployment successful!
```

**Bad deployment logs (requires investigation):**
```
[Background] License generation attempt 1 failed: ...
[Background] Retry attempt 1/2 for license generation
[Background] License generation attempt 2 failed: ...
[Background] Retry attempt 2/2 for license generation
[Background] ❌ Deployment failed: License generation failed after 3 attempts
```

## For DevOps

### CI/CD Workflows

**PR Validation (`.github/workflows/pr-validation.yml`):**
- **Triggers:** Every PR to master/main
- **Duration:** ~5-10 minutes
- **Jobs:**
  - Build extension (Node.js + TypeScript)
  - Build proxy server (Go - Linux, macOS amd64/arm64)
  - Build local connector (Go - all platforms)
  - Code quality checks (logging, manifest, secrets)
  - Go quality checks (fmt, vet, build)

**Release (`.github/workflows/release.yml`):**
- **Triggers:** Tag push (v1.2.3 format)
- **Duration:** ~15-20 minutes
- **Artifacts:**
  - macOS installer (.pkg)
  - Windows installer (.msi)
  - Linux packages (.deb, .rpm)
  - Extension zip

### GitHub Actions Commands

```bash
# Check workflow status
gh run list --workflow=pr-validation.yml --limit=5

# View specific run
gh run view <run-id>

# Rerun failed jobs
gh run rerun <run-id> --failed

# Watch running workflow
gh run watch
```

### Deployment Checklist

**Before Tagging Release:**
- [ ] All PRs merged to master
- [ ] pr-validation.yml passing
- [ ] Version bumped in manifest.json
- [ ] CHANGELOG.md updated
- [ ] Manual testing completed

**Tagging Release:**
```bash
# Update version
vim manifest.json  # Bump version

# Commit
git add manifest.json
git commit -m "chore: bump version to v0.9.240"

# Tag
git tag v0.9.240

# Push (triggers release workflow)
git push origin master --tags
```

**After Release:**
- [ ] Verify all artifacts uploaded to GitHub release
- [ ] Test download and install on macOS/Windows/Linux
- [ ] Update web app VITE_EXTENSION_VERSION if needed

## For Support/Debugging

### Checking Extension Logs

**Chrome DevTools:**
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "service worker" under Anava Local Connector
4. View console logs

**Proxy Server Logs:**
```bash
tail -f ~/Library/Logs/anava-camera-proxy-server.log
```

### Common Support Questions

**Q: How do I know if deployment succeeded?**
A: Look for `✅ Deployment successful!` in extension console logs. Also check camera web interface shows BatonAnalytic running.

**Q: Deployment is stuck at "Activating license..."**
A: Check:
1. Offscreen document created? (chrome://extensions -> Inspect views)
2. Network stable? (ping camera IP)
3. Retry happening? (should see retry logs after 1-2 seconds)

**Q: How do I rollback to previous working version?**
A: See `DEPLOYMENT_HARDENING.md` section "Rollback Plan". TL;DR: Revert to commit `6a16a63`.

**Q: What if camera reboots during deployment?**
A: Code handles this:
- Waits 3 seconds after license upload
- Retries if needed
- If persistent, may need manual intervention

## Critical Bug Fixes Preserved

**🔥 DO NOT REVERT THESE CHANGES:**

1. **License verification regex** (background.js line 915):
   ```javascript
   // OLD (BROKEN): verifyText.includes('License="None"')
   // NEW (WORKS): verifyText.match(/Name="BatonAnalytic"[^>]*License="([^"]*)"/);
   ```
   **Why:** Old code incorrectly failed when ANY app had `License="None"`.

2. **Digest auth body handling** (proxy-server/main.go lines 617-624):
   ```go
   // CRITICAL: Send body in BOTH challenge AND authenticated requests
   ```
   **Why:** Missing body in second request caused "JSON syntax error" from camera.

3. **Offscreen document race condition** (background.js lines 662-673):
   ```javascript
   try {
     await chrome.offscreen.createDocument(...);
   } catch (createError) {
     // Ignore "already exists" errors
     if (!createError.message.includes('already exists')) {
       throw createError;
     }
   }
   ```
   **Why:** Rapid deployments could try to create document twice.

## Performance Metrics

**Expected Timings:**
- ACAP download: 5-10 seconds
- ACAP upload: 30-60 seconds
- License generation: 2-5 seconds
- License activation: 5-10 seconds
- Config push: 2-3 seconds
- **Total: 45-90 seconds**

**Red Flags:**
- ⚠️ License generation >30 seconds (CDN issues)
- ⚠️ ACAP upload >120 seconds (network slow)
- 🔴 Any step >5 minutes (timeout/hang)

## Contact & Resources

**Documentation:**
- Full changes: `DEPLOYMENT_HARDENING.md`
- Camera setup: `CLAUDE.md`
- Build instructions: `README.md`

**Key Files:**
- License activation: `background.js` lines 824-929
- Proxy server: `proxy-server/main.go`
- CI/CD: `.github/workflows/pr-validation.yml`

**Working Test Camera:**
- IP: 192.168.50.156
- Credentials: anava / baton
- Device ID: B8A44F45D624
- License: 2CNDCWSYP7MG6YBDNR65

---

**Version:** Post-hardening (commit 6a16a63+)
**Last Updated:** 2025-10-31
**Status:** ✅ Production Ready
