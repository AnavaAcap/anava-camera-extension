# License Key Validation Fix - v2.0.9

**Date:** 2025-11-01
**Issue:** Extension rejected valid 20-character license key
**Root Cause:** Hardcoded 16-character validation in extension code
**Solution:** Remove client-side validation, let Axis SDK/camera validate format

---

## 🐛 Problem

Extension was throwing error:
```
❌ Failed: Step 2 (Activate License): Invalid license key format. Expected 16 alphanumeric characters.
```

**Valid License Key (20 chars):**
```
6YE4NK2J4T3LMY4WSSHL
```

**Bad Code:**
```javascript
// background.js:835-836
if (!licenseKey.match(/^[A-Z0-9]{16}$/)) {
  throw new Error('Invalid license key format. Expected 16 alphanumeric characters.');
}
```

---

## ✅ Fix

**Removed restrictive validation:**
```javascript
// Old (v2.0.8):
if (!licenseKey.match(/^[A-Z0-9]{16}$/)) {
  throw new Error('Invalid license key format. Expected 16 alphanumeric characters.');
}

if (!deviceId.match(/^[A-Z0-9]{12}$/)) {
  throw new Error('Invalid device ID format. Expected 12 character serial number.');
}

// New (v2.0.9):
// Input validation - check for required parameters only
// Let the camera/Axis SDK validate the actual format
if (!cameraIp || !credentials || !licenseKey || !deviceId) {
  throw new Error('Missing required parameters for license activation');
}

console.log('[Background] License key length:', licenseKey.length, 'Device ID length:', deviceId.length);
```

---

## 🎯 Why This is Correct

1. **Extension shouldn't enforce business rules** - License key format is determined by Axis/Anava backend, not extension
2. **Format may change** - Hardcoding lengths creates brittleness
3. **Server validates anyway** - The camera and Axis SDK will reject invalid keys
4. **Better error messages** - Server errors are more descriptive than client-side validation

---

## 📦 Updated Package

```
anava-local-connector-v2.0.9.zip (44 KB)
```

**Changes from v2.0.8:**
- Removed license key format validation (16 char restriction)
- Removed device ID format validation (12 char restriction)
- Added debug logging for key/ID lengths
- Still validates required parameters are present

---

## 🧪 Testing

**Test with your 20-character key:**
```
6YE4NK2J4T3LMY4WSSHL
```

Expected flow:
1. Extension accepts key (no client-side rejection)
2. Sends to Axis SDK for license XML generation
3. Uploads license XML to camera
4. Camera validates license
5. If invalid: Camera returns error (proper feedback)
6. If valid: License activated successfully

---

## 🔄 What to Do

1. **Reload extension:**
   ```
   chrome://extensions → Find "Anava Local Connector" → Click 🔄
   ```

2. **Retry deployment:**
   - Your 20-character key should now work
   - Extension will accept any non-empty string
   - Camera will validate format and provide error if invalid

3. **If it still fails:**
   - Check browser console for actual error from camera
   - Error will now come from Axis SDK or camera, not extension
   - Better diagnostic information

---

## 📊 Version History

| Version | Issue | Fix |
|---------|-------|-----|
| 2.0.7 | Original | Had 16-char validation from Electron code |
| 2.0.8 | Permission optimization | Still had 16-char validation |
| **2.0.9** | **License key rejected** | **Removed format validation** ✅ |

---

## 🎉 Benefits

1. **Flexible** - Supports any license key format (current and future)
2. **Better errors** - Server errors are more descriptive
3. **Less code** - Removed unnecessary validation logic
4. **More correct** - Extension doesn't enforce business logic it doesn't control

---

## 📝 Git History

```
87be446 - fix: Remove restrictive license key validation (v2.0.9)
8f9b27f - chore: Update package script to v2.0.9
```

Branch: `permission-optimization-v2.0.8` (yes, branch name still says 2.0.8, that's OK)

---

## ⚠️ Note

This is a **critical bug fix** that should be in the Chrome Web Store package. The v2.0.8 package would have failed for any user with non-16-character license keys.

**Use v2.0.9 package for Chrome Web Store submission**, not v2.0.8.
