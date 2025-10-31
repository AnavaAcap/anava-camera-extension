// Test script to show EXACT Electron multipart format
const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<license>TEST_LICENSE_KEY</license>`;

const boundary = "----WebKitFormBoundaryTestBoundary123";
const formData = [
  `--${boundary}`,
  'Content-Disposition: form-data; name="fileData"; filename="license.xml"',
  "Content-Type: text/xml",
  "",
  xmlContent,
  `--${boundary}--`,
  "",
].join("\r\n");

console.log("=== ELECTRON MULTIPART FORMAT ===");
console.log("Total length:", formData.length, "bytes");
console.log("\n=== RAW STRING (first 500 chars) ===");
console.log(formData.substring(0, 500));
console.log("\n=== LAST 200 CHARS ===");
console.log(formData.substring(formData.length - 200));
console.log("\n=== HEX DUMP (first 500 bytes) ===");
const buffer = Buffer.from(formData);
console.log(buffer.slice(0, 500).toString('hex'));
console.log("\n=== HEX DUMP (last 100 bytes) ===");
console.log(buffer.slice(-100).toString('hex'));
console.log("\n=== CHARACTER ANALYSIS (last 20 bytes) ===");
for (let i = Math.max(0, formData.length - 20); i < formData.length; i++) {
  const char = formData.charCodeAt(i);
  const repr = char === 13 ? '\\r' : char === 10 ? '\\n' : formData[i];
  console.log(`Byte ${i}: ${char} (${repr})`);
}
