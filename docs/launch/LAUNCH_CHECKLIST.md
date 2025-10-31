# Launch Checklist - Anava Local Connector

**Version**: 2.0
**Target Release**: TBD

---

## Pre-Launch Checklist

### Code Signing & Certificates

- [ ] **Apple Developer Account Created** ($99/year)
  - Account email: _______________
  - Team ID: _______________
  - Apple ID created: _______________

- [ ] **Developer ID Installer Certificate Obtained**
  - Certificate downloaded as .p12
  - Certificate password stored in password manager
  - Certificate added to GitHub Secrets: `APPLE_CERT_P12`, `APPLE_CERT_PASSWORD`
  - Tested notarization workflow locally

- [ ] **Windows Code Signing Certificate Purchased** ($200-400/year)
  - Provider: _______________ (Sectigo, DigiCert, etc.)
  - Certificate downloaded as .p12
  - Certificate password stored in password manager
  - Certificate added to GitHub Secrets: `WINDOWS_CERT_P12`, `WINDOWS_CERT_PASSWORD`
  - Tested signing workflow locally

- [ ] **Signing Scripts Tested**
  - `scripts/sign-and-notarize-macos.sh` runs successfully
  - `scripts/sign-windows-msi.ps1` runs successfully
  - Signed installers verified (no security warnings)

### Chrome Web Store

- [ ] **Developer Account Created** ($5 one-time fee)
  - Email: _______________
  - Payment method added
  - Account verified

- [ ] **Extension ID Reserved**
  - Extension ID: _______________
  - Updated in:
    - [ ] `manifest.json`
    - [ ] `examples/terraform-spa-integration/well-known-config.json`
    - [ ] All documentation referencing PLACEHOLDER_EXTENSION_ID

- [ ] **Privacy Policy Published**
  - URL: https://connect.anava.cloud/privacy
  - Legal review completed by: _______________
  - Compliant with Chrome Web Store policies
  - Compliant with GDPR (if applicable)

- [ ] **Extension Listing Complete**
  - Title: "Anava Local Connector" (50 chars max)
  - Short description (132 chars) written
  - Detailed description (16,000 chars max) written
  - Screenshots taken and optimized:
    - [ ] Screenshot 1: Extension popup showing connection status (1280x800)
    - [ ] Screenshot 2: Installation guide screen (1280x800)
    - [ ] Screenshot 3: Camera discovery in web app (1280x800)
    - [ ] Screenshot 4: Configuration screen (1280x800)
  - Promotional images created (if desired):
    - [ ] Small tile: 440x280
    - [ ] Marquee: 1400x560

- [ ] **Extension Icons Created**
  - [ ] icon-16.png (16x16)
  - [ ] icon-48.png (48x48)
  - [ ] icon-128.png (128x128)
  - Design approved by: _______________
  - Follows Chrome Web Store guidelines

### Infrastructure

- [ ] **Domain Configured**: connect.anava.cloud
  - DNS records pointing to hosting
  - SSL certificate installed
  - Domain registered with registrar: _______________

- [ ] **Installation Page Deployed**
  - URL: https://connect.anava.cloud/install
  - Detects user's OS automatically
  - Download links working for all platforms

- [ ] **Uninstall Script Hosted**
  - URL: https://connect.anava.cloud/uninstall-old.sh
  - Script tested on macOS, Linux

- [ ] **Privacy Policy Hosted**
  - URL: https://connect.anava.cloud/privacy
  - Page accessible publicly

- [ ] **Support Page Created**
  - URL: https://connect.anava.cloud/support
  - Links to docs.anava.cloud
  - Support email listed: _______________

- [ ] **Analytics Configured**
  - Tool: _______________ (Google Analytics, Plausible, etc.)
  - Tracking code added to connect.anava.cloud
  - Goals configured:
    - Extension installations
    - Installer downloads
    - Support page visits

- [ ] **Error Tracking Configured**
  - Tool: _______________ (Sentry, Rollbar, etc.)
  - Integrated with extension (optional)
  - Integrated with backend

### Testing

- [ ] **All Unit Tests Passing**
  - Version comparison tests
  - Config validation tests
  - Extension ID format tests

- [ ] **Integration Tests Passing**
  - Native messaging protocol
  - Proxy server communication
  - Config discovery flow
  - Authentication flow

- [ ] **Manual Testing Complete on macOS**
  - [ ] macOS 11 Big Sur (Intel)
  - [ ] macOS 12 Monterey (Intel)
  - [ ] macOS 13 Ventura (Apple Silicon)
  - [ ] macOS 14 Sonoma (Apple Silicon)

- [ ] **Manual Testing Complete on Windows**
  - [ ] Windows 10
  - [ ] Windows 11

- [ ] **Manual Testing Complete on Linux**
  - [ ] Ubuntu 20.04
  - [ ] Ubuntu 22.04
  - [ ] Fedora 38 (or latest)

- [ ] **Migration Testing Complete**
  - Old version installed → new version upgrade tested
  - Old files detected and shown in migration UI
  - Uninstall script removes old files successfully

- [ ] **End-to-End Testing Complete**
  - Install extension from .zip
  - Download installer
  - Run installer
  - Extension detects native host
  - Open web app
  - Scan for cameras
  - Deploy ACAP
  - Validate deployment

### Documentation

- [ ] **Installation Guide Complete**
  - Step-by-step instructions
  - Screenshots included
  - Troubleshooting section
  - Platform-specific notes

- [ ] **Troubleshooting Guide Complete**
  - Common issues documented
  - Solutions provided
  - Log file locations listed

- [ ] **Developer Documentation Complete**
  - Architecture diagram
  - API reference
  - Contributing guidelines

- [ ] **terraform-spa Integration Guide Complete**
  - Module usage examples
  - Backend implementation guide
  - Security best practices

- [ ] **Video Walkthrough Recorded** (optional but recommended)
  - Installation process
  - First-time setup
  - Camera deployment workflow
  - Hosted on YouTube or Vimeo

### GitHub Repository

- [ ] **README.md Updated**
  - Installation instructions
  - Link to documentation
  - Link to Chrome Web Store
  - Badge showing latest version

- [ ] **Issue Templates Created**
  - [ ] `.github/ISSUE_TEMPLATE/bug_report.md`
  - [ ] `.github/ISSUE_TEMPLATE/feature_request.md`

- [ ] **Pull Request Template Created**
  - [ ] `.github/PULL_REQUEST_TEMPLATE.md`

- [ ] **Contributing Guide Published**
  - [ ] `CONTRIBUTING.md`

- [ ] **Code of Conduct Published** (optional)
  - [ ] `CODE_OF_CONDUCT.md`

- [ ] **License File Exists**
  - [ ] `LICENSE`
  - License type: _______________ (MIT, Apache 2.0, etc.)

### CI/CD

- [ ] **GitHub Actions Workflow Tested**
  - Created test tag: `v0.0.1-test`
  - Workflow ran successfully
  - All platforms built
  - Installers created
  - GitHub Release created
  - Test tag and release deleted after verification

- [ ] **Build Scripts Exist**
  - [ ] `scripts/build-macos-pkg.sh`
  - [ ] `scripts/build-windows-msi.ps1`
  - [ ] `scripts/build-linux-deb.sh`
  - [ ] `scripts/build-linux-rpm.sh`

- [ ] **GitHub Secrets Configured**
  - [ ] `APPLE_ID`
  - [ ] `APPLE_PASSWORD` (app-specific password)
  - [ ] `APPLE_TEAM_ID`
  - [ ] `APPLE_CERT_P12` (base64 encoded)
  - [ ] `APPLE_CERT_PASSWORD`
  - [ ] `WINDOWS_CERT_P12` (base64 encoded)
  - [ ] `WINDOWS_CERT_PASSWORD`

---

## Launch Day Checklist

### T-1 Hour

- [ ] **Final Version Tag Created**
  - Tag name: `v2.0.0` (or appropriate version)
  - Tag pushed to GitHub
  - CI/CD workflow triggered

- [ ] **GitHub Release Created Automatically**
  - Release notes reviewed
  - All artifacts uploaded successfully
  - Release published (not draft)

- [ ] **Extension .zip Downloaded from Release**
  - File integrity verified (unzip and check contents)

### Submit to Chrome Web Store

- [ ] **Extension Submitted**
  - Logged into Chrome Web Store Developer Dashboard
  - Clicked "New Item"
  - Uploaded `anava-local-connector-extension-v2.0.0.zip`
  - Filled out all listing information
  - Added screenshots
  - Added privacy policy link
  - Set visibility to "Public"
  - Clicked "Submit for review"

- [ ] **Submission Confirmation Received**
  - Email confirmation received
  - Review status: "Pending"

### Update Website

- [ ] **Installation Page Updated**
  - Links point to latest GitHub Release
  - Version numbers updated
  - Chrome Web Store link added (once approved)

- [ ] **Blog Post Published** (optional)
  - Announcement of launch
  - Key features highlighted
  - Installation instructions
  - Link to Chrome Web Store

### Communication

- [ ] **Email Sent to Beta Users** (if applicable)
  - Announcement of public release
  - Migration instructions from beta
  - Thank you for testing

- [ ] **Social Media Posts** (optional)
  - Twitter/X: _______________
  - LinkedIn: _______________
  - Reddit (r/selfhosted, r/homelab): _______________

### Monitoring

- [ ] **Error Tracking Active**
  - Sentry/Rollbar dashboard open
  - Alerts configured

- [ ] **Analytics Dashboard Open**
  - Monitoring installation count
  - Tracking download sources

- [ ] **Support Email Monitoring**
  - Team ready to respond to support requests
  - Response time goal: < 24 hours

---

## Post-Launch Checklist (Week 1)

### Chrome Web Store

- [ ] **Extension Approved**
  - Approval email received
  - Extension live on Chrome Web Store
  - Extension URL: https://chrome.google.com/webstore/detail/[EXTENSION_ID]

- [ ] **Installation Count Tracked**
  - Day 1: _____ installs
  - Day 3: _____ installs
  - Day 7: _____ installs

- [ ] **Reviews Monitored**
  - Average rating: _____ stars
  - Number of reviews: _____
  - Common complaints (if any): _______________

- [ ] **User Feedback Collected**
  - Support tickets: _____ total
  - Common issues: _______________
  - Feature requests: _______________

### Bug Fixes & Hotfixes

- [ ] **Critical Bugs Identified**
  - List: _______________

- [ ] **Hotfix Releases Created** (if needed)
  - Version: `v2.0.1` (or appropriate)
  - Issues fixed: _______________
  - Released on: _______________

### Analytics Review

- [ ] **Installation Success Rate**
  - Target: > 95%
  - Actual: _____%
  - Issues causing failures: _______________

- [ ] **Average Setup Time**
  - Target: < 5 minutes
  - Actual: _____ minutes
  - Bottlenecks: _______________

- [ ] **Platform Distribution**
  - macOS: _____%
  - Windows: _____%
  - Linux: _____%

---

## Post-Launch Checklist (Month 1)

### Success Metrics

- [ ] **Installation Count**
  - Target: 1000+ installs
  - Actual: _____ installs

- [ ] **Rating**
  - Target: 4+ stars
  - Actual: _____ stars

- [ ] **Support Tickets**
  - Target: < 10 tickets
  - Actual: _____ tickets

- [ ] **Installation Failure Rate**
  - Target: < 5%
  - Actual: _____%

### Community Engagement

- [ ] **GitHub Stars**
  - Current: _____ stars

- [ ] **GitHub Issues**
  - Open: _____
  - Closed: _____
  - Average resolution time: _____ days

- [ ] **terraform-spa Integrations**
  - Number of projects integrating: _____
  - Feedback from integrators: _______________

### Documentation Updates

- [ ] **FAQ Updated**
  - Common questions added from support tickets

- [ ] **Troubleshooting Guide Expanded**
  - New issues documented

### Roadmap Planning

- [ ] **Version 2.1 Features Prioritized**
  - Feature 1: _______________
  - Feature 2: _______________
  - Feature 3: _______________

- [ ] **Known Issues Triaged**
  - High priority: _____
  - Medium priority: _____
  - Low priority: _____

---

## Post-Launch Checklist (Month 3)

### Success Metrics

- [ ] **Installation Count**
  - Target: 5000+ installs
  - Actual: _____ installs

- [ ] **Featured on Chrome Web Store** (aspirational)
  - Status: Yes / No
  - Category: _______________

- [ ] **terraform-spa Integrations**
  - Target: 10+ projects
  - Actual: _____ projects

### Long-Term Goals

- [ ] **Enterprise Adoption**
  - Companies using: _______________

- [ ] **Security Audit Complete** (optional)
  - Auditor: _______________
  - Findings: _______________
  - Remediations: _______________

- [ ] **Localization** (optional)
  - Languages: _______________

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|---------|-----------|
| Apple notarization delays | Medium | High | Start setup 2 weeks early, have backup timeline |
| Chrome Web Store rejection | Low | High | Follow all policies strictly, prepare appeal documentation |
| Code signing cert issues | Medium | Medium | Purchase certs early, test signing process thoroughly |
| User confusion during setup | High | Medium | Create video walkthrough, add in-app guidance |
| Native host version skew | Medium | High | Implement strict version checking, show clear update prompts |
| LaunchAgent/Service fails to start | Low | High | Add health checks, auto-restart logic, clear troubleshooting docs |
| Migration from old version fails | Medium | Medium | Extensive testing, fallback instructions, manual cleanup guide |

---

## Emergency Contacts

- **Lead Developer**: _______________
- **DevOps Engineer**: _______________
- **Product Manager**: _______________
- **Support Team**: _______________
- **Legal (for DMCA/privacy issues)**: _______________

---

## Rollback Plan

In case of critical issues requiring rollback:

1. **Remove from Chrome Web Store**
   - Mark extension as "Unlisted" in Developer Dashboard
   - Notify users via support page

2. **Revert GitHub Release**
   - Mark latest release as "Pre-release"
   - Create hotfix release with rollback

3. **Notify Users**
   - Email to all users (if list available)
   - Update connect.anava.cloud with notice
   - Post on GitHub Issues

4. **Root Cause Analysis**
   - Document what went wrong
   - Create action items to prevent recurrence

---

**Last Updated**: [DATE]
**Reviewed By**: _______________
