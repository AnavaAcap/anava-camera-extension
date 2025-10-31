# Build Windows .msi installer for Anava Local Connector
# Requires WiX Toolset: https://wixtoolset.org/

$ErrorActionPreference = "Stop"

$VERSION = "2.0.0"
$BUILD_DIR = "build"
$INSTALLER_DIR = "installers/windows"
$OUTPUT_DIR = "dist"

Write-Host "Building Anava Local Connector v$VERSION for Windows..." -ForegroundColor Green

# Create directories
New-Item -ItemType Directory -Force -Path $BUILD_DIR | Out-Null
New-Item -ItemType Directory -Force -Path $OUTPUT_DIR | Out-Null

# Step 1: Build Windows binary
Write-Host ""
Write-Host "Step 1: Building Windows binary..." -ForegroundColor Yellow

$env:GOOS = "windows"
$env:GOARCH = "amd64"
go build -o "$BUILD_DIR/local-connector.exe" ./cmd/local-connector

Write-Host "  Binary created: $BUILD_DIR/local-connector.exe" -ForegroundColor Gray

# Copy binary to installer directory
Copy-Item "$BUILD_DIR/local-connector.exe" "$INSTALLER_DIR/local-connector.exe"

# Step 2: Build .msi with WiX
Write-Host ""
Write-Host "Step 2: Building .msi installer..." -ForegroundColor Yellow

# Check if WiX is installed
$wixPath = Get-Command candle.exe -ErrorAction SilentlyContinue
if (-not $wixPath) {
    Write-Host ""
    Write-Host "ERROR: WiX Toolset not found!" -ForegroundColor Red
    Write-Host "Please install WiX Toolset from: https://wixtoolset.org/" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "After installation, add WiX bin directory to PATH:" -ForegroundColor Yellow
    Write-Host "  Example: C:\Program Files (x86)\WiX Toolset v3.11\bin" -ForegroundColor Gray
    exit 1
}

# Compile WiX source
Write-Host "  Compiling WiX source..." -ForegroundColor Gray
candle.exe -arch x64 "$INSTALLER_DIR/installer.wxs" -out "$BUILD_DIR/installer.wixobj"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: WiX compilation failed" -ForegroundColor Red
    exit 1
}

# Link to create .msi
Write-Host "  Linking to create .msi..." -ForegroundColor Gray
light.exe "$BUILD_DIR/installer.wixobj" -out "$OUTPUT_DIR/AnavaLocalConnector-$VERSION-unsigned.msi"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: WiX linking failed" -ForegroundColor Red
    exit 1
}

Write-Host "  Unsigned installer created: $OUTPUT_DIR/AnavaLocalConnector-$VERSION-unsigned.msi" -ForegroundColor Green

# Step 3: Code signing (PLACEHOLDER)
Write-Host ""
Write-Host "Step 3: Code signing (MANUAL STEP REQUIRED)" -ForegroundColor Yellow
Write-Host ""
Write-Host "To sign the installer, you need:" -ForegroundColor White
Write-Host "  1. Code signing certificate (.pfx file)" -ForegroundColor Gray
Write-Host "  2. Run the following command:" -ForegroundColor Gray
Write-Host ""
Write-Host "     signtool.exe sign /f certificate.pfx /p PASSWORD /t http://timestamp.digicert.com \\" -ForegroundColor Cyan
Write-Host "       $OUTPUT_DIR\AnavaLocalConnector-$VERSION-unsigned.msi" -ForegroundColor Cyan
Write-Host ""
Write-Host "  3. Verify signature:" -ForegroundColor Gray
Write-Host ""
Write-Host "     signtool.exe verify /pa $OUTPUT_DIR\AnavaLocalConnector-$VERSION.msi" -ForegroundColor Cyan
Write-Host ""

Write-Host ""
Write-Host "===================================================================" -ForegroundColor Green
Write-Host "Build complete!" -ForegroundColor Green
Write-Host "Unsigned installer: $OUTPUT_DIR/AnavaLocalConnector-$VERSION-unsigned.msi" -ForegroundColor White
Write-Host ""
Write-Host "For testing (unsigned):" -ForegroundColor White
Write-Host "  msiexec /i $OUTPUT_DIR\AnavaLocalConnector-$VERSION-unsigned.msi" -ForegroundColor Gray
Write-Host ""
Write-Host "For distribution, complete the code signing step above." -ForegroundColor Yellow
Write-Host "===================================================================" -ForegroundColor Green
