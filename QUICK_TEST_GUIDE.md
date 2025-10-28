# QUICK TEST GUIDE - 3 Steps to Find the Bug

## TL;DR

Extension has been enhanced with 🎯 **target tracking** for IP 192.168.50.156.

## Step 1: Reload Extension (10 seconds)

1. Open `chrome://extensions/`
2. Find "Anava Camera Deployment"
3. Click the **reload** icon (circular arrow)

## Step 2: Open Console (10 seconds)

1. Right-click extension icon in toolbar
2. Select **"Inspect Popup"**
3. Click **Console** tab
4. **KEEP THIS WINDOW OPEN**

## Step 3: Run Test (30 seconds)

### Option A: Single IP Test (RECOMMENDED)

1. Verify credentials in popup:
   - Username: `anava`
   - Password: `baton`

2. Click **"DEBUG: Test .156 Only"** button

3. Watch console for result:
   - ✅ Success = Camera found!
   - ❌ Failed = See error details

### Option B: Full Network Scan

1. Set network: `192.168.50.0/24`
2. Set credentials: `anava` / `baton`
3. Click **"Start Scan"**
4. Watch for 🎯 markers when .156 is scanned

## What You'll See

All console logs for IP .156 are marked with **🎯** symbols:

```
🎯 TARGET IP FOUND IN RANGE: 192.168.50.156
✅ TARGET IP 192.168.50.156 IS IN TASK LIST
🎯 TARGET IP 192.168.50.156 IS IN THIS BATCH!
🎯🎯🎯 STARTING CHECK FOR TARGET IP: 192.168.50.156
```

Then one of:
- ✅ `🎯✅ FOUND CAMERA!` - Success
- ⚠️ `🎯⚠️ NO CAMERA FOUND` - Auth/validation failed
- ❌ `🎯❌ ERROR: [message]` - Connection error

## Copy Results

After test:
1. Right-click in console
2. Select all (Cmd+A)
3. Copy text
4. Share the output!

## What This Tells Us

The console will definitively answer:

1. **Is .156 in the IP range?** → Yes/No
2. **Is .156 in the task list?** → Yes/No
3. **Is .156 scanned?** → Yes/No
4. **What's the exact error?** → Full error details

**No more guessing! Every step is logged! 🎉**

---

See `DEBUG_TEST_INSTRUCTIONS.md` for detailed explanations.
