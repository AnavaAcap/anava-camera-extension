# License Upload Fix - Multipart Form-Data Format

## Problem
License upload was failing with `Error: 31` from camera despite HTTP 200 response.

## Root Cause
The multipart form-data format didn't exactly match the Electron installer's format.

## Investigation
Used comparison testing between Electron (TypeScript) and Go implementations:

### Electron Format (cameraConfigurationService.ts lines 2427-2435)
```typescript
const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
const formData = [
  `--${boundary}`,
  'Content-Disposition: form-data; name="fileData"; filename="license.xml"',
  "Content-Type: text/xml",
  "",
  xmlContent,
  `--${boundary}--`,
  "",
].join("\r\n");
```

### Key Insight: JavaScript .join() Behavior
```javascript
["A", "B", ""].join("|")  // Returns: "A|B|" (includes separator after last element!)
```

The array ending with empty string `""` causes `.join("\r\n")` to add a CRLF after the closing boundary.

### Correct Byte Sequence
```
--boundary\r\n
Content-Disposition: form-data; name="fileData"; filename="license.xml"\r\n
Content-Type: text/xml\r\n
\r\n
<license XML content>
\r\n
--boundary--\r\n
```

**CRITICAL**: Ends with `--boundary--\r\n` and NOTHING ELSE (no extra CRLF)

## Fix Applied
Updated `proxy-server/main.go` handleUploadLicense function (lines 940-950):

```go
// CRITICAL: Match EXACT Electron format from cameraConfigurationService.ts
// Array: ["--boundary", "Content-Disposition...", "Content-Type: text/xml", "", xmlContent, "--boundary--", ""]
// .join("\r\n") produces: item0\r\nitem1\r\nitem2\r\nitem3\r\nitem4\r\nitem5\r\nitem6
// Which means: --boundary\r\nContent-Disposition...\r\nContent-Type...\r\n\r\nxmlContent\r\n--boundary--\r\n
buf.WriteString("--" + boundary + "\r\n")
buf.WriteString("Content-Disposition: form-data; name=\"fileData\"; filename=\"license.xml\"\r\n")
buf.WriteString("Content-Type: text/xml\r\n")
buf.WriteString("\r\n") // Empty line after headers (this is the "" element)
buf.WriteString(payload.LicenseXML)
buf.WriteString("\r\n") // CRLF after content
buf.WriteString("--" + boundary + "--\r\n") // Closing boundary + CRLF (last element "" adds no extra CRLF)
```

**Removed**: Extra `buf.WriteString("\r\n")` that was adding incorrect trailing CRLF

## Verification
Created test script `compare-formats.js` that confirms:
- ✅ Electron format: 231 bytes ending with hex `2d2d0d0a` (--\r\n)
- ✅ Go format: 231 bytes ending with hex `2d2d0d0a` (--\r\n)
- ✅ **FORMATS MATCH EXACTLY**

## Testing
To test the fix on a camera without an existing license:

```bash
cd /Users/ryanwager/anava-camera-extension
./test-license-upload.sh
```

Check proxy logs:
```bash
tail -f ~/Library/Logs/anava-camera-proxy-server.log
```

## Error Code Reference
- `Error: 0` = Success
- `Error: 30` = License already installed (also treated as success by Electron)
- `Error: 31` = Invalid license format / cannot parse (likely due to malformed multipart data)

## Next Steps
1. Test on camera without existing license to confirm fix
2. Verify license shows as `License="Valid"` after upload
3. Ensure ACAP app can access license after activation
