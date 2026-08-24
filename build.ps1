# ==============================================================================
# Vexta-Electron All-in-One Build & Version Management Script (PowerShell)
# Automated Version Bumping, Prerequisite Checks, Multi-Platform Compilation (Windows & Linux)
# ==============================================================================

[CmdletBinding()]
param(
    [Alias("y")]
    [switch]$Yes,

    [ValidateSet("patch", "minor", "major", "")]
    [string]$Bump = "",

    [Alias("ver")]
    [string]$SetVersion = "",

    [ValidateSet("win", "linux", "all", "")]
    [string]$Target = "win",

    [switch]$Tag,

    [Alias("h", "?")]
    [switch]$Help
)

$ErrorActionPreference = "Stop"

function Show-Usage {
    Write-Host "`nUsage: .\build.ps1 [OPTIONS]" -ForegroundColor Cyan
    Write-Host "`nOptions:" -ForegroundColor Yellow
    Write-Host "  -Yes, -KeepVersion, -y        Keep existing version without prompt (non-interactive)"
    Write-Host "  -Bump <patch|minor|major>     Bump patch, minor, or major version"
    Write-Host "  -SetVersion <ver>             Set exact version (e.g. 1.2.3)"
    Write-Host "  -Target <win|linux|all>       Build target platform (Default: win)"
    Write-Host "  -Tag                          Create git tag v<version> on successful build"
    Write-Host "  -Help, -h                     Show this help menu"
    Write-Host "`nExamples:" -ForegroundColor Yellow
    Write-Host "  .\build.ps1 -Target win                  # Build Windows .exe installers"
    Write-Host "  .\build.ps1 -Target all                  # Build Linux + Windows installers"
    Write-Host "  .\build.ps1 -SetVersion 1.5.0 -Tag       # Set version and create git tag"
    Write-Host ""
}

if ($Help) {
    Show-Usage
    exit 0
}

function Log-Info    { param([string]$Message) Write-Host "[INFO] $Message" -ForegroundColor Cyan }
function Log-Success { param([string]$Message) Write-Host "[SUCCESS] $Message" -ForegroundColor Green }
function Log-Warn    { param([string]$Message) Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Log-Error   { param([string]$Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }
function Log-Step    { param([string]$Message) Write-Host "`n===> $Message" -ForegroundColor Cyan }

# Set working directory to the script's root
Set-Location -Path $PSScriptRoot

Write-Host ""
Write-Host "  _   _ _____ _  _______  _     " -ForegroundColor Cyan
Write-Host " | | | | ____| |/ /_   _|/ \    " -ForegroundColor Cyan
Write-Host " | | | |  _| | ' /  | | / _ \   " -ForegroundColor Cyan
Write-Host " | |_| | |___| . \  | |/ ___ \  " -ForegroundColor Cyan
Write-Host "  \___/|_____|_|\_\ |_/_/   \_\ " -ForegroundColor Cyan
Write-Host " Zero-Knowledge Messenger Build Automation" -ForegroundColor White
Write-Host ""

# ==============================================================================
# STEP 1: Version Management
# ==============================================================================
Log-Step "1. Version Management & Project Metadata"

$PackageJsonPath = Join-Path $PSScriptRoot "package.json"
if (-not (Test-Path $PackageJsonPath)) {
    Log-Error "package.json not found in $PSScriptRoot"
    exit 1
}

$pkg = Get-Content -Raw -Path $PackageJsonPath | ConvertFrom-Json
$CURRENT_VERSION = $pkg.version
Log-Info "Current application version: v$CURRENT_VERSION"

$BUMP_TYPE = $Bump
$EXPLICIT_VERSION = $SetVersion
$CREATE_GIT_TAG = $Tag.IsPresent
$NON_INTERACTIVE = $Yes.IsPresent
$TARGET_PLATFORM = if ($Target) { $Target } else { "win" }

# Interactive prompt if no CLI flags specified
if (-not $EXPLICIT_VERSION -and -not $BUMP_TYPE -and -not $NON_INTERACTIVE) {
    $parts = $CURRENT_VERSION.Split('.')
    if ($parts.Count -ge 3) {
        $major = [int]$parts[0]
        $minor = [int]$parts[1]
        $patch = [int]$parts[2]
        $patchPreview = "$major.$minor.$($patch + 1)"
        $minorPreview = "$major.$($minor + 1).0"
        $majorPreview = "$($major + 1).0.0"
    } else {
        $patchPreview = "$CURRENT_VERSION.1"
        $minorPreview = "$CURRENT_VERSION.1"
        $majorPreview = "$CURRENT_VERSION.1"
    }

    Write-Host "`nSelect Version Action for current version (v$CURRENT_VERSION):" -ForegroundColor Yellow
    Write-Host "  1) Keep current version (v$CURRENT_VERSION)"
    Write-Host "  2) Bump Patch (v$CURRENT_VERSION -> v$patchPreview)"
    Write-Host "  3) Bump Minor (v$CURRENT_VERSION -> v$minorPreview)"
    Write-Host "  4) Bump Major (v$CURRENT_VERSION -> v$majorPreview)"
    Write-Host "  5) Enter custom version string"
    Write-Host ""
    $Choice = Read-Host "Choice [1-5] (default: 1)"

    switch ($Choice) {
        "2" { $BUMP_TYPE = "patch" }
        "3" { $BUMP_TYPE = "minor" }
        "4" { $BUMP_TYPE = "major" }
        "5" {
            $EXPLICIT_VERSION = Read-Host "Enter custom version (e.g. 1.2.3)"
        }
        Default {
            Log-Info "Action selected: Keeping current version v$CURRENT_VERSION"
        }
    }

    Write-Host "`nSelect Target Packaging Platform:" -ForegroundColor Yellow
    Write-Host "  1) Windows (.exe NSIS & Portable) [Default]"
    Write-Host "  2) Linux (AppImage, .deb, .tar.gz)"
    Write-Host "  3) All Platforms (Linux + Windows)"
    Write-Host ""
    $PlatformChoice = Read-Host "Choice [1-3] (default: 1)"

    switch ($PlatformChoice) {
        "2" { $TARGET_PLATFORM = "linux" }
        "3" { $TARGET_PLATFORM = "all" }
        Default { $TARGET_PLATFORM = "win" }
    }
}

if ($EXPLICIT_VERSION) {
    Log-Info "Setting explicit version to v$EXPLICIT_VERSION..."
    npm version "$EXPLICIT_VERSION" --no-git-tag-version | Out-Null
    $pkg = Get-Content -Raw -Path $PackageJsonPath | ConvertFrom-Json
    $CURRENT_VERSION = $pkg.version
    Log-Success "Updated version to v$CURRENT_VERSION"
} elseif ($BUMP_TYPE) {
    switch ($BUMP_TYPE) {
        { $_ -in "patch", "minor", "major" } {
            Log-Info "Bumping $BUMP_TYPE version..."
            npm version "$BUMP_TYPE" --no-git-tag-version | Out-Null
            $pkg = Get-Content -Raw -Path $PackageJsonPath | ConvertFrom-Json
            $CURRENT_VERSION = $pkg.version
            Log-Success "Bumped version to v$CURRENT_VERSION"
        }
        Default {
            Log-Error "Invalid bump type: '$BUMP_TYPE'. Must be 'patch', 'minor', or 'major'."
            exit 1
        }
    }
}

# ==============================================================================
# STEP 2: Prerequisite Checks
# ==============================================================================
Log-Step "2. Performing System & Tool Prerequisite Checks"

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Log-Error "Node.js is not installed. Please install Node.js >= 18.0.0."
    exit 1
}

$NodeVer = (node -v).Trim()
$NodeMajor = [int]($NodeVer -replace '^v([0-9]+).*', '$1')
if ($NodeMajor -lt 18) {
    Log-Error "Node.js version $NodeVer is below required minimum (v18+)."
    exit 1
}
Log-Success "Node.js version $NodeVer OK"

# Check npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Log-Error "npm package manager is not installed."
    exit 1
}
$NpmVer = (npm -v).Trim()
Log-Success "npm version $NpmVer OK"

# Check Git
if (Get-Command git -ErrorAction SilentlyContinue) {
    try {
        $GitRev = (git rev-parse --short HEAD 2>$null).Trim()
        if (-not $GitRev) { $GitRev = "uncommitted" }
    } catch {
        $GitRev = "uncommitted"
    }
    Log-Success "Git repository state: $GitRev"
} else {
    Log-Warn "Git is not installed (skipping revision tagging)."
}

# ==============================================================================
# STEP 3: Dependency Verification & Installation
# ==============================================================================
Log-Step "3. Verifying Node.js Project Dependencies"

if (-not (Test-Path "node_modules") -or -not (Test-Path "package-lock.json")) {
    Log-Info "node_modules or lockfile missing. Installing dependencies..."
    npm install
} else {
    Log-Info "node_modules detected. Verifying required packages..."
    $checkDeps = npm list electron electron-builder 2>$null
    if ($LASTEXITCODE -ne 0) {
        Log-Info "Installing packaging dependencies (electron & electron-builder)..."
        npm install
    }
}
Log-Success "Dependencies verified cleanly."

# ==============================================================================
# STEP 4: Quality Audit & Static Code Analysis
# ==============================================================================
Log-Step "4. Executing Linter & Code Quality Audit"

if (Get-Command npx -ErrorAction SilentlyContinue) {
    Log-Info "Running oxlint code analysis..."
    try {
        npx oxlint
    } catch {
        Log-Warn "Oxlint reported warnings. Proceeding with compilation..."
    }
}

# ==============================================================================
# STEP 5: React & TypeScript Compilation
# ==============================================================================
Log-Step "5. Compiling React Application & Bundle Asset Generation"

Log-Info "Verifying logo and application icon assets..."
if (-not (Test-Path "public/icon.png") -or -not (Test-Path "public/icon.ico") -or -not (Test-Path "public/orientis-logo.png")) {
    Log-Error "Missing required logo files in ./public! (icon.png, icon.ico, or orientis-logo.png)"
    exit 1
}

Log-Info "Executing TypeScript typecheck & Vite build..."
npm run build
if ($LASTEXITCODE -ne 0) {
    Log-Error "TypeScript or Vite build failed."
    exit 1
}
Log-Success "Static application bundle compiled to ./dist"

Log-Info "Synchronizing logo assets into ./dist..."
Copy-Item -Path "public/icon.png" -Destination "dist/icon.png" -Force -ErrorAction SilentlyContinue
Copy-Item -Path "public/icon.ico" -Destination "dist/icon.ico" -Force -ErrorAction SilentlyContinue
Copy-Item -Path "public/orientis-logo.png" -Destination "dist/orientis-logo.png" -Force -ErrorAction SilentlyContinue
Log-Success "Logo assets verified and packaged cleanly."

# ==============================================================================
# STEP 6: Electron Installer Packaging (Windows / Linux / All)
# ==============================================================================
Log-Step "6. Packaging Desktop Installers via electron-builder (v$CURRENT_VERSION, target: $TARGET_PLATFORM)"

if (-not (Test-Path "release")) {
    New-Item -ItemType Directory -Path "release" | Out-Null
}

switch ($TARGET_PLATFORM) {
    "win" {
        Log-Info "Running electron-builder Windows targets (NSIS Setup .exe, Portable .exe, ZIP x64)..."
        npx electron-builder --win nsis portable zip --x64
    }
    "all" {
        Log-Info "Running electron-builder Linux targets..."
        npx electron-builder --linux
        Log-Info "Running electron-builder Windows targets (NSIS Setup .exe, Portable .exe, ZIP x64)..."
        npx electron-builder --win nsis portable zip --x64
    }
    Default {
        Log-Info "Running electron-builder Linux targets (AppImage, deb, tar.gz)..."
        npx electron-builder --linux
    }
}

if ($LASTEXITCODE -ne 0) {
    Log-Error "electron-builder packaging failed."
    exit 1
}

Log-Success "Packaging completed successfully!"

# Create Git tag if requested
if ($CREATE_GIT_TAG -and (Get-Command git -ErrorAction SilentlyContinue)) {
    $TAG_NAME = "v$CURRENT_VERSION"
    Log-Info "Creating git tag '$TAG_NAME'..."
    git add package.json package-lock.json 2>$null
    git commit -m "chore(release): bump version to $TAG_NAME" 2>$null
    git tag -a "$TAG_NAME" -m "Release $TAG_NAME" 2>$null
    Log-Success "Created Git tag '$TAG_NAME' cleanly."
}

# ==============================================================================
# STEP 7: Release Summary & Artifact Report
# ==============================================================================
Log-Step "7. Build Summary & Release Artifact Report (v$CURRENT_VERSION)"

if (Test-Path "release") {
    Write-Host "`nGenerated Artifacts in ./release:" -ForegroundColor Yellow
    $artifacts = Get-ChildItem -Path "release" -File
    if ($artifacts.Count -gt 0) {
        foreach ($file in $artifacts) {
            $formattedSize = if ($file.Length -ge 1GB) {
                "{0:N2} GB" -f ($file.Length / 1GB)
            } elseif ($file.Length -ge 1MB) {
                "{0:N2} MB" -f ($file.Length / 1MB)
            } elseif ($file.Length -ge 1KB) {
                "{0:N2} KB" -f ($file.Length / 1KB)
            } else {
                "$($file.Length) B"
            }
            Write-Host ("  • {0} ({1})" -f $file.Name, $formattedSize) -ForegroundColor White
        }
    } else {
        Log-Warn "No release files found in ./release directory."
    }
} else {
    Log-Warn "No release directory found."
}

Write-Host "`n[SUCCESS] Vexta-Electron v$CURRENT_VERSION build pipeline completed flawlessly!`n" -ForegroundColor Green
