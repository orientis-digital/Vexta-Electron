# ==============================================================================
# Vexta-Electron Windows Build Script (PowerShell for Windows OS)
# Automated Version Management, Prerequisite Checks, Vite Build & packaging
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host "`n====> 1. Verifying Windows Node.js & npm Environment" -ForegroundColor Cipher
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is not installed. Please install Node.js >= 18."
    exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm is not installed."
    exit 1
}

$NodeVer = node -v
$NpmVer = npm -v
Write-Host "[SUCCESS] Node.js $NodeVer and npm $NpmVer detected OK." -ForegroundColor Green

Write-Host "`n====> 2. Verifying Dependencies" -ForegroundColor Cyan
if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] Installing dependencies..." -ForegroundColor Yellow
    npm install
}

Write-Host "`n====> 3. Running Linter Audit" -ForegroundColor Cyan
npx oxlint

Write-Host "`n====> 4. Compiling React Frontend Bundle" -ForegroundColor Cyan
npm run build

Write-Host "`n====> 5. Packaging Windows Executable (.exe / NSIS / Portable)" -ForegroundColor Cyan
npx electron-builder --win nsis portable

Write-Host "`n[SUCCESS] Windows installers built successfully in ./release!" -ForegroundColor Green
Get-ChildItem -Path release -Filter "*.exe" | Select-Name Name, Length
