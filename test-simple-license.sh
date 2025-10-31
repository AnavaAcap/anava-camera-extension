#!/bin/bash

# Simple test with hardcoded license XML
# This bypasses the Axis SDK and tests the proxy upload directly

CAMERA_IP="192.168.50.156"
USERNAME="anava"
PASSWORD="baton"
APP_NAME="BatonAnalytic"

# Sample license XML (from previous successful deployment)
# NOTE: This is just for format testing - may not be a valid license
LICENSE_XML='<?xml version="1.0" encoding="UTF-8"?><license version="1.0"><licensekey type="sdk"><owner>AnavaLabs Ltd.</owner><contact>support@ana.valabs.com</contact><product>BatonAnalytic</product><productid>415129</productid><family>network_video</family><class>acap</class><type>standard</type><expires>2025-11-14T23:59:59Z</expires><restrictions><serialnumber>B8A44F45D624</serialnumber></restrictions><licensekey>CQAB7PD27EAZ2MYMJARW</licensekey><signature>AAUAAA6lHTDVs3oBXW3bfm9zHlE8BRYzz7I4AE5PcX9n4RGzMEAACgAAAAmxgzrX0HbVsEBDGQAAAA5vAQGbCCCgAE1AJe