#!/bin/bash

# Test license upload to proxy server
PROXY_URL="http://127.0.0.1:9876/upload-license"
CAMERA_IP="192.168.50.156"
CAMERA_URL="https://${CAMERA_IP}/axis-cgi/applications/license.cgi?action=uploadlicensekey&package=BatonAnalytic"
USERNAME="anava"
PASSWORD="baton"

# Sample license XML (use actual license key)
LICENSE_XML='<?xml version="1.0" encoding="UTF-8"?>
<license xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.axis.com/schemas/AxisLicense-1.xsd" version="1.0">
  <token>
    <producerId>4d2b0f12-d5b4-11ea-8d2d-68a3c49c4d76</producerId>
    <productName>test_License</productName>
    <productOrderCode>test_License</productOrderCode>
    <productType>Analytic</productType>
    <customerId>33aa29ae-ca6a-11ed-892e-68a3c49c4d76</customerId>
    <licenseId>33aa29ae-ca6a-11ed-892e-68a3c49c4d76-4d2b0f12-d5b4-11ea-8d2d-68a3c49c4d76-23b04</licenseId>
    <publicKey>NdA/n3U/0T4D/n/7bXQ94d9/Anz8hxv7L8PmB/Mn/zT/en/n0JfR/0/7HO/3/e3w99Pnm8+b///xnz3/4f+f9i/DWd///c/gT/nf//////</publicKey>
    <serial>B8A44F45D624</serial>
    <startDate>2025-01-01T00:00:00Z</startDate>
    <stopDate>2099-12-31T23:59:59Z</stopDate>
    <signature>BATON_TEST_SIGNATURE_HERE</signature>
  </token>
</license>'

echo "Testing license upload via proxy..."
echo "Camera: ${CAMERA_IP}"
echo "License XML length: ${#LICENSE_XML} bytes"

curl -X POST "${PROXY_URL}" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${CAMERA_URL}\",
    \"username\": \"${USERNAME}\",
    \"password\": \"${PASSWORD}\",
    \"licenseXML\": $(echo "$LICENSE_XML" | jq -Rs .)
  }"

echo ""
echo "Check proxy logs: tail -f ~/Library/Logs/anava-camera-proxy-server.log"
