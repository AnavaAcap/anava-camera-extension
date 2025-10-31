// Compare Electron vs Go multipart format
// Run with: node compare-formats.js

const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<license>TEST</license>`;

const boundary = "----WebKitFormBoundaryTEST123";

// ELECTRON FORMAT (TypeScript .join("\r\n"))
const electronArray = [
  `--${boundary}`,
  'Content-Disposition: form-data; name="fileData"; filename="license.xml"',
  "Content-Type: text/xml",
  "",
  xmlContent,
  `--${boundary}--`,
  "",
];

const electronFormat = electronArray.join("\r\n");

console.log("=== ELECTRON FORMAT ===");
console.log("Array elements:", electronArray.length);
electronArray.forEach((elem, i) => {
  console.log(`  [${i}]: "${elem.substring(0, 50)}${elem.length > 50 ? '...' : ''}"`);
});

console.log("\n=== ELECTRON RESULT ===");
console.log("Length:", electronFormat.length, "bytes");
console.log("\nFull string:");
console.log(electronFormat);

console.log("\n=== HEX DUMP (full) ===");
const buffer = Buffer.from(electronFormat);
console.log(buffer.toString('hex'));

console.log("\n=== BYTE-BY-BYTE ANALYSIS (last 30 bytes) ===");
const start = Math.max(0, electronFormat.length - 30);
for (let i = start; i < electronFormat.length; i++) {
  const code = electronFormat.charCodeAt(i);
  const char = code === 13 ? '\\r' : code === 10 ? '\\n' : electronFormat[i];
  console.log(`Pos ${i}: byte=${String(code).padStart(3)} char='${char}'`);
}

console.log("\n=== GO FORMAT (what code should produce) ===");
// Simulate Go code:
// buf.WriteString("--" + boundary + "\r\n")
// buf.WriteString("Content-Disposition: form-data; name=\"fileData\"; filename=\"license.xml\"\r\n")
// buf.WriteString("Content-Type: text/xml\r\n")
// buf.WriteString("\r\n")
// buf.WriteString(payload.LicenseXML)
// buf.WriteString("\r\n")
// buf.WriteString("--" + boundary + "--\r\n")

const goFormat =
  "--" + boundary + "\r\n" +
  'Content-Disposition: form-data; name="fileData"; filename="license.xml"' + "\r\n" +
  "Content-Type: text/xml" + "\r\n" +
  "\r\n" +
  xmlContent +
  "\r\n" +
  "--" + boundary + "--" + "\r\n";

console.log("Length:", goFormat.length, "bytes");
console.log("\nFull string:");
console.log(goFormat);

console.log("\n=== COMPARISON ===");
if (electronFormat === goFormat) {
  console.log("✅ FORMATS MATCH EXACTLY!");
} else {
  console.log("❌ FORMATS DIFFER!");
  console.log("Electron length:", electronFormat.length);
  console.log("Go length:", goFormat.length);
  console.log("Difference:", goFormat.length - electronFormat.length, "bytes");

  // Find first difference
  const minLen = Math.min(electronFormat.length, goFormat.length);
  for (let i = 0; i < minLen; i++) {
    if (electronFormat[i] !== goFormat[i]) {
      console.log(`First difference at position ${i}:`);
      console.log(`  Electron: byte ${electronFormat.charCodeAt(i)} ('${electronFormat[i]}')`);
      console.log(`  Go: byte ${goFormat.charCodeAt(i)} ('${goFormat[i]}')`);
      break;
    }
  }
}
