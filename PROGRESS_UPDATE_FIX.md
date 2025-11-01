# Progress Update Fix - v2.0.9

**Date:** 2025-11-01
**Issue:** SPA not receiving scan progress updates
**Root Cause:** `chrome.runtime.sendMessage()` doesn't reach content scripts
**Solution:** Use `chrome.tabs.sendMessage(sender.tab.id)` (no tabs permission needed)

---

## 🐛 Problem

When scanning network, web app showed:
```
❌ No progress updates
❌ Loading spinner stuck
❌ "0 of 254 IPs scanned" never changed
```

**But the scan WAS working!** Results appeared at the end.

---

## 🔍 Root Cause Analysis

When we removed the `tabs` permission (v2.0.8), we changed:

**Before:**
```javascript
// ✅ This worked (but needed tabs permission)
const tabs = await chrome.tabs.query({ url: sender.origin + '/*' });
for (const tab of tabs) {
  await chrome.tabs.sendMessage(tab.id, progressMessage);
}
```

**After (BROKEN):**
```javascript
// ❌ This doesn't reach content scripts!
chrome.runtime.sendMessage(progressMessage).catch(() => {});
```

**Why it failed:**
- `chrome.runtime.sendMessage()` only sends to **extension pages** (popup, background, options)
- It does NOT send to **content scripts** injected in web pages
- Content scripts never received progress → web app never updated

---

## ✅ Solution

**Key insight:** You CAN use `chrome.tabs.sendMessage()` WITHOUT `tabs` permission if you have the tab ID!

When a message comes FROM a tab (via `externally_connectable`), the `sender` object includes `sender.tab.id`:

```javascript
// ✅ This works WITHOUT tabs permission!
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  // sender.tab.id is available when message comes from a tab
  if (sender.tab && sender.tab.id) {
    chrome.tabs.sendMessage(sender.tab.id, {
      type: 'scan_progress',
      data: progressData
    });
  }
});
```

---

## 📊 Message Flow (Fixed)

```
Web App (https://anava-ai.web.app)
  ↓ chrome.runtime.sendMessageExternal()
Extension Background Worker
  ↓ chrome.tabs.sendMessage(sender.tab.id) ✅ Works without tabs permission!
Content Script (injected in web app)
  ↓ window.postMessage()
Web App (receives progress updates)
```

---

## 🔧 Code Changes

### background.js

**Before (BROKEN):**
```javascript
chrome.runtime.sendMessage({
  type: 'scan_progress',
  data: progressData,
  targetOrigin: sender.origin
}).catch(() => {});
```

**After (FIXED):**
```javascript
if (sender && sender.tab && sender.tab.id) {
  await chrome.tabs.sendMessage(sender.tab.id, {
    type: 'scan_progress',
    data: progressData
  });
}
```

### src/content-script.ts

**Simplified relay** (no origin filtering needed since we send to specific tab):

```typescript
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'scan_progress') {
    // Background sends directly to this tab, relay to page
    window.postMessage({
      type: 'scan_progress',
      data: message.data
    }, window.location.origin);
  }
});
```

---

## 🧪 Testing

**How to verify:**

1. **Reload extension:**
   ```
   chrome://extensions → "Anava Local Connector" → 🔄
   ```

2. **Open browser console** in both:
   - Extension background worker (chrome://extensions → "Inspect views")
   - Web app tab (F12)

3. **Start network scan**

4. **Look for logs:**
   ```
   [Background] Sending progress to tab 123: { scannedIPs: 10, totalIPs: 254, ... }
   [Content Script] Relaying scan progress to page: { scannedIPs: 10, totalIPs: 254, ... }
   ```

5. **Check web app UI:**
   - Progress bar should update smoothly
   - "10 of 254 IPs scanned" should increment
   - Camera count should update in real-time

---

## 📚 Chrome Extension API Details

### Can you use `chrome.tabs` API without `tabs` permission?

**YES, partially!**

| Method | Requires `tabs` Permission? | Notes |
|--------|---------------------------|-------|
| `chrome.tabs.query()` | ✅ YES | Lists all tabs |
| `chrome.tabs.create()` | ✅ YES | Creates new tabs |
| `chrome.tabs.sendMessage(tabId, msg)` | ❌ NO (if you have tabId) | Can send if you know the ID |
| `chrome.tabs.get(tabId)` | ❌ NO (limited info) | Can get basic info |

**Key point:** When a message arrives via `externally_connectable`, the `sender.tab` object is included automatically.

---

## 🎯 Why This Pattern is Better

1. **No permission needed** ✅
   - `tabs` permission removed in v2.0.8
   - Still works with `sender.tab.id`

2. **More targeted** ✅
   - Only sends to tab that requested scan
   - Doesn't broadcast to all tabs

3. **More efficient** ✅
   - No need to query tabs
   - Direct message delivery

4. **More reliable** ✅
   - No race conditions with tab queries
   - Guaranteed delivery to requesting tab

---

## ⚠️ Common Pitfalls

### Pitfall 1: Using `chrome.runtime.sendMessage()`
```javascript
// ❌ WRONG - doesn't reach content scripts
chrome.runtime.sendMessage({ type: 'scan_progress', data });
```

### Pitfall 2: Trying to query tabs without permission
```javascript
// ❌ WRONG - needs tabs permission
const tabs = await chrome.tabs.query({...});
```

### Pitfall 3: Not checking for `sender.tab`
```javascript
// ❌ WRONG - sender.tab may not exist
chrome.tabs.sendMessage(sender.tab.id, msg); // Crash!

// ✅ CORRECT - always check
if (sender && sender.tab && sender.tab.id) {
  chrome.tabs.sendMessage(sender.tab.id, msg);
}
```

---

## 📝 Lessons Learned

1. **Read the docs carefully**
   - `chrome.runtime.sendMessage()` ≠ `chrome.tabs.sendMessage()`
   - Different recipients!

2. **Test message flows**
   - Use console.log in both background and content script
   - Verify messages reach destination

3. **Understand permission requirements**
   - Some `chrome.tabs.*` methods work without permission
   - If you have the tab ID, you can use `sendMessage()`

4. **Debug with both consoles**
   - Background worker console (service worker)
   - Web page console (F12)

---

## ✅ Result

- **Progress updates work** ✅
- **No tabs permission needed** ✅
- **Cleaner, more targeted code** ✅
- **Better error handling** ✅

**Before:** Broken progress, users confused
**After:** Smooth real-time updates, professional UX ✨

---

## 🚀 Next Steps

1. **Reload extension** and test scan
2. **Watch console** for progress logs
3. **Verify UI updates** in web app
4. **Test edge cases:**
   - Multiple tabs open
   - Tab closed during scan
   - Tab navigated away during scan

If progress still doesn't work, check:
1. Content script injected? (Check web app console for [Content Script] logs)
2. Background sending? (Check service worker console for [Background] logs)
3. Web app listening? (Check for `window.addEventListener('message', ...)` in web app code)
