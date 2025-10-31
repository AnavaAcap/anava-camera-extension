# terraform-spa Integration Guide

This directory contains examples for integrating the Anava Local Connector Chrome extension with terraform-spa projects.

## Overview

The Anava Local Connector enables web applications to discover and communicate with cameras on the user's local network. This is achieved through:

1. **Well-Known Configuration**: A `.well-known/spa-connector-config.json` endpoint that the extension auto-discovers
2. **Native Messaging**: Communication between the extension and a local proxy service
3. **Nonce Authentication**: Secure backend authentication for the native connector

## Files in This Directory

- `well-known-config.json` - Example configuration file format
- `terraform-module-example.tf` - Terraform module for enabling connector features
- `webapp-integration-example.tsx` - React component showing web app integration
- `backend-nonce-auth-example.ts` - Backend API for nonce authentication

## Quick Start

### 1. Enable in Terraform Module

```hcl
module "spa" {
  source = "your-terraform-spa-module"

  # ... other configuration ...

  # Enable extension connector
  enable_spa_connector = true
  extension_id         = "YOUR_EXTENSION_ID_FROM_CHROME_STORE"
}
```

### 2. Deploy Infrastructure

```bash
terraform apply
```

This will create:
- `.well-known/spa-connector-config.json` endpoint (publicly accessible)
- API Gateway endpoint for extension authentication
- CloudFront cache behavior for .well-known directory

### 3. Verify Configuration Endpoint

After deployment, verify the configuration is accessible:

```bash
curl https://your-domain.com/.well-known/spa-connector-config.json
```

Expected response:
```json
{
  "version": "1.0",
  "extensionId": "abcdefghijklmnopqrstuvwxyz123456",
  "backendUrl": "https://api.your-domain.com",
  "projectId": "your-project-123",
  "features": ["camera-discovery", "acap-deployment"]
}
```

### 4. Add Extension UI to Web App

See `webapp-integration-example.tsx` for a complete React component example.

Basic usage:

```typescript
import { ExtensionConnector } from '@anava/extension-connector';

const connector = new ExtensionConnector();

// Check if extension is installed
const isInstalled = await connector.isExtensionInstalled();

if (!isInstalled) {
  // Show installation instructions
} else {
  // Scan for cameras
  const cameras = await connector.scanForCameras({
    network: '192.168.1.0/24',
    credentials: { username: 'admin', password: 'password' }
  });
}
```

## Configuration Fields

### `version` (string, required)
API version for configuration schema. Currently `"1.0"`.

### `extensionId` (string, required)
Your Chrome extension ID from the Chrome Web Store (32-character lowercase alphanumeric).

**How to get this**:
1. Reserve extension ID in Chrome Web Store Developer Dashboard
2. Use this ID in your Terraform configuration
3. Update extension manifest with same ID

### `backendUrl` (string, required)
Base URL for your API Gateway or backend API. Used for nonce authentication.

Example: `https://api.your-project.com`

### `projectId` (string, required)
Unique identifier for your project. Used for analytics and debugging.

### `features` (array of strings, required)
List of enabled features. Supported values:
- `"camera-discovery"` - Enable local network camera scanning
- `"acap-deployment"` - Enable ACAP application deployment to cameras

## Security Considerations

### 1. Public Configuration Endpoint

The `.well-known/spa-connector-config.json` file is **publicly accessible**. Do not include sensitive data like:
- API keys
- Passwords
- Private project details

Only include:
- Extension ID (public)
- Backend URL (public)
- Project ID (non-sensitive)
- Feature flags (non-sensitive)

### 2. Nonce Authentication

For secure backend communication, implement nonce-based authentication:

1. Web app generates random nonce and sends to backend
2. Backend stores nonce with short TTL (60 seconds)
3. Extension receives nonce from web app
4. Native connector authenticates with backend using nonce
5. Backend validates nonce (one-time use only)

See `backend-nonce-auth-example.ts` for implementation.

### 3. Extension ID Verification

Always verify the Chrome extension ID in backend requests:

```typescript
// Backend API validation
if (req.headers['x-extension-id'] !== process.env.ALLOWED_EXTENSION_ID) {
  return res.status(403).json({ error: 'Invalid extension ID' });
}
```

## Troubleshooting

### Extension not detecting configuration

**Problem**: Extension doesn't auto-discover your web app configuration.

**Solutions**:
1. Verify `.well-known/spa-connector-config.json` is publicly accessible
2. Check CloudFront cache - may need to invalidate cache
3. Verify CORS headers allow extension origin
4. Check browser console for fetch errors

### CORS errors

**Problem**: Browser blocks extension from fetching configuration.

**Solutions**:
1. Add `Access-Control-Allow-Origin: *` header to S3 object metadata
2. Configure CloudFront to forward `Origin` header
3. Verify content-type is `application/json`

### Invalid extension ID

**Problem**: Backend rejects extension authentication requests.

**Solutions**:
1. Verify extension ID in Terraform matches Chrome Web Store ID
2. Check extension ID is 32 characters, lowercase alphanumeric
3. Ensure extension manifest uses same ID

## Advanced: Custom Features

You can add custom features to the configuration:

```json
{
  "version": "1.0",
  "extensionId": "your-extension-id",
  "backendUrl": "https://api.your-domain.com",
  "projectId": "your-project",
  "features": [
    "camera-discovery",
    "acap-deployment",
    "custom-analytics",
    "batch-operations"
  ],
  "customConfig": {
    "scanTimeout": 30000,
    "maxCameras": 50,
    "retryAttempts": 3
  }
}
```

Then handle custom features in your web app:

```typescript
const config = await connector.getConfiguration();

if (config.features.includes('custom-analytics')) {
  // Enable analytics features
}

if (config.customConfig?.scanTimeout) {
  connector.setScanTimeout(config.customConfig.scanTimeout);
}
```

## Support

For integration help:
- Documentation: https://docs.anava.cloud
- GitHub: https://github.com/AnavaAcap/anava-camera-extension
- Support: support@anava.cloud
