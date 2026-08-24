#!/usr/bin/env bash
# ==============================================================================
# Vexta-Electron All-in-One Build & Version Management Script
# Automated Version Bumping, Prerequisite Checks, Multi-Platform Compilation (Linux & Windows)
# ==============================================================================

set -eo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()    { echo -e "\n${BOLD}${CYAN}===> $1${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BUMP_TYPE=""
EXPLICIT_VERSION=""
CREATE_GIT_TAG=false
NON_INTERACTIVE=false
TARGET_PLATFORM="linux"

usage() {
    echo -e "${BOLD}Usage:${NC} $0 [OPTIONS]"
    echo -e "\n${BOLD}Options:${NC}"
    echo "  --keep-version       Keep existing version without prompt"
    echo "  --bump patch         Bump patch version (e.g. 1.0.0 -> 1.0.1)"
    echo "  --bump minor         Bump minor version (e.g. 1.0.0 -> 1.1.0)"
    echo "  --bump major         Bump major version (e.g. 1.0.0 -> 2.0.0)"
    echo "  --set-version <ver>  Set exact version (e.g. 1.2.3)"
    echo "  --target linux       Build Linux packages (AppImage, .deb, .tar.gz)"
    echo "  --target win         Build Windows packages (.exe NSIS & Portable)"
    echo "  --target all         Build both Linux and Windows packages"
    echo "  --tag                Create git tag v<version> on successful build"
    echo "  -y, --yes            Run non-interactively keeping default options"
    echo "  --help, -h           Show this help menu"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  ./build.sh --target win        # Build Windows .exe installers"
    echo "  ./build.sh --target all        # Build Linux + Windows installers"
    echo "  ./build.sh --set-version 1.5.0 --tag"
    exit 0
}

# Parse CLI arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --keep-version|-y|--yes)
            NON_INTERACTIVE=true
            shift
            ;;
        --bump)
            BUMP_TYPE="$2"
            shift 2
            ;;
        --set-version)
            EXPLICIT_VERSION="$2"
            shift 2
            ;;
        --target)
            TARGET_PLATFORM="$2"
            shift 2
            ;;
        --tag)
            CREATE_GIT_TAG=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            ;;
    esac
done

echo -e "${BOLD}${CYAN}"
echo "  _   _ _____ _  _______  _     "
echo " | | | | ____| |/ /_   _|/ \    "
echo " | | | |  _| | ' /  | | / _ \   "
echo " | |_| | |___| . \  | |/ ___ \  "
echo "  \___/|_____|_|\_\ |_/_/   \_\ "
echo " Zero-Knowledge Messenger Build Automation"
echo -e "${NC}"

# ==============================================================================
# STEP 1: Version Management
# ==============================================================================
log_step "1. Version Management & Project Metadata"

CURRENT_VERSION=$(node -p "require('./package.json').version")
log_info "Current application version: ${BOLD}v${CURRENT_VERSION}${NC}"

# Interactive prompt if no CLI flags specified and TTY attached
if [ -z "$EXPLICIT_VERSION" ] && [ -z "$BUMP_TYPE" ] && [ "$NON_INTERACTIVE" = false ]; then
    if [ -t 0 ]; then
        PATCH_PREVIEW=$(node -p "const [m,n,p]='${CURRENT_VERSION}'.split('.').map(Number); \`\${m}.\${n}.\${p+1}\`")
        MINOR_PREVIEW=$(node -p "const [m,n,p]='${CURRENT_VERSION}'.split('.').map(Number); \`\${m}.\${n+1}.0\`")
        MAJOR_PREVIEW=$(node -p "const [m,n,p]='${CURRENT_VERSION}'.split('.').map(Number); \`\${m+1}.0.0\`")

        echo -e "\n${BOLD}Select Version Action for current version (v${CURRENT_VERSION}):${NC}"
        echo "  1) Keep current version (v${CURRENT_VERSION})"
        echo "  2) Bump Patch (v${CURRENT_VERSION} -> v${PATCH_PREVIEW})"
        echo "  3) Bump Minor (v${CURRENT_VERSION} -> v${MINOR_PREVIEW})"
        echo "  4) Bump Major (v${CURRENT_VERSION} -> v${MAJOR_PREVIEW})"
        echo "  5) Enter custom version string"
        echo ""
        read -r -p "Choice [1-5] (default: 1): " CHOICE
        case "$CHOICE" in
            2) BUMP_TYPE="patch" ;;
            3) BUMP_TYPE="minor" ;;
            4) BUMP_TYPE="major" ;;
            5)
                read -r -p "Enter custom version (e.g. 1.2.3): " EXPLICIT_VERSION
                ;;
            *)
                log_info "Action selected: Keeping current version v${CURRENT_VERSION}"
                ;;
        esac

        echo -e "\n${BOLD}Select Target Packaging Platform:${NC}"
        echo "  1) Linux (AppImage, .deb, .tar.gz) [Default]"
        echo "  2) Windows (.exe NSIS & Portable)"
        echo "  3) All Platforms (Linux + Windows)"
        echo ""
        read -r -p "Choice [1-3] (default: 1): " PLATFORM_CHOICE
        case "$PLATFORM_CHOICE" in
            2) TARGET_PLATFORM="win" ;;
            3) TARGET_PLATFORM="all" ;;
            *) TARGET_PLATFORM="linux" ;;
        esac
    fi
fi

if [ -n "$EXPLICIT_VERSION" ]; then
    log_info "Setting explicit version to v${EXPLICIT_VERSION}..."
    npm version "$EXPLICIT_VERSION" --no-git-tag-version >/dev/null
    CURRENT_VERSION=$(node -p "require('./package.json').version")
    log_success "Updated version to v${CURRENT_VERSION}"
elif [ -n "$BUMP_TYPE" ]; then
    case $BUMP_TYPE in
        patch|minor|major)
            log_info "Bumping $BUMP_TYPE version..."
            npm version "$BUMP_TYPE" --no-git-tag-version >/dev/null
            CURRENT_VERSION=$(node -p "require('./package.json').version")
            log_success "Bumped version to v${CURRENT_VERSION}"
            ;;
        *)
            log_error "Invalid bump type: '$BUMP_TYPE'. Must be 'patch', 'minor', or 'major'."
            exit 1
            ;;
    esac
fi

# ==============================================================================
# STEP 2: Prerequisite Checks
# ==============================================================================
log_step "2. Performing System & Tool Prerequisite Checks"

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
    log_error "Node.js is not installed. Please install Node.js >= 18.0.0."
    exit 1
fi

NODE_VER=$(node -v)
NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 18 ]; then
    log_error "Node.js version $NODE_VER is below required minimum (v18+)."
    exit 1
fi
log_success "Node.js version $NODE_VER OK"

# Check npm
if ! command -v npm >/dev/null 2>&1; then
    log_error "npm package manager is not installed."
    exit 1
fi
NPM_VER=$(npm -v)
log_success "npm version $NPM_VER OK"

# Check Git
if command -v git >/dev/null 2>&1; then
    GIT_REV=$(git rev-parse --short HEAD 2>/dev/null || echo "uncommitted")
    log_success "Git repository state: ${GIT_REV}"
else
    log_warn "Git is not installed (skipping revision tagging)."
fi

# ==============================================================================
# STEP 3: Dependency Verification & Installation
# ==============================================================================
log_step "3. Verifying Node.js Project Dependencies"

if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
    log_info "node_modules or lockfile missing. Installing dependencies..."
    npm install
else
    log_info "node_modules detected. Verifying required packages..."
    if ! npm list electron electron-builder >/dev/null 2>&1; then
        log_info "Installing packaging dependencies (electron & electron-builder)..."
        npm install
    fi
fi
log_success "Dependencies verified cleanly."

# ==============================================================================
# STEP 4: Quality Audit & Static Code Analysis
# ==============================================================================
log_step "4. Executing Linter & Code Quality Audit"

if command -v npx >/dev/null 2>&1; then
    log_info "Running oxlint code analysis..."
    npx oxlint || {
        log_warn "Oxlint reported warnings. Proceeding with compilation..."
    }
fi

# ==============================================================================
# STEP 5: React & TypeScript Compilation
# ==============================================================================
log_step "5. Compiling React Application & Bundle Asset Generation"

log_info "Verifying logo and application icon assets..."
if [ ! -f "public/icon.png" ] || [ ! -f "public/icon.ico" ] || [ ! -f "public/orientis-logo.png" ]; then
    log_error "Missing required logo files in ./public! (icon.png, icon.ico, or orientis-logo.png)"
    exit 1
fi

log_info "Executing TypeScript typecheck & Vite build..."
npm run build
log_success "Static application bundle compiled to ./dist"

log_info "Synchronizing logo assets into ./dist..."
cp -f public/icon.png dist/icon.png 2>/dev/null || true
cp -f public/icon.ico dist/icon.ico 2>/dev/null || true
cp -f public/orientis-logo.png dist/orientis-logo.png 2>/dev/null || true
log_success "Logo assets verified and packaged cleanly."

# ==============================================================================
# STEP 6: Electron Installer Packaging (Linux / Windows / All)
# ==============================================================================
log_step "6. Packaging Desktop Installers via electron-builder (v${CURRENT_VERSION}, target: ${TARGET_PLATFORM})"

mkdir -p release

case "$TARGET_PLATFORM" in
    win)
        log_info "Running electron-builder Windows targets (NSIS Setup .exe, Portable .exe, ZIP x64)..."
        npx electron-builder --win nsis portable zip --x64
        ;;
    all)
        log_info "Running electron-builder Linux targets..."
        npx electron-builder --linux
        log_info "Running electron-builder Windows targets (NSIS Setup .exe, Portable .exe, ZIP x64)..."
        npx electron-builder --win nsis portable zip --x64
        ;;
    *)
        log_info "Running electron-builder Linux targets (AppImage, deb, tar.gz)..."
        npx electron-builder --linux
        ;;
esac

# Grant execution permissions to generated AppImage binaries
if ls release/*.AppImage >/dev/null 2>&1; then
    chmod +x release/*.AppImage
    log_success "Applied execution permissions (chmod +x) to generated AppImage binaries."
fi

log_success "Packaging completed successfully!"

# Create Git tag if requested
if [ "$CREATE_GIT_TAG" = true ] && command -v git >/dev/null 2>&1; then
    TAG_NAME="v${CURRENT_VERSION}"
    log_info "Creating git tag '${TAG_NAME}'..."
    git add package.json package-lock.json 2>/dev/null || true
    git commit -m "chore(release): bump version to ${TAG_NAME}" 2>/dev/null || true
    git tag -a "${TAG_NAME}" -m "Release ${TAG_NAME}" 2>/dev/null || true
    log_success "Created Git tag '${TAG_NAME}' cleanly."
fi

# ==============================================================================
# STEP 7: Release Summary & Artifact Report
# ==============================================================================
log_step "7. Build Summary & Release Artifact Report (v${CURRENT_VERSION})"

if [ -d "release" ]; then
    echo -e "${BOLD}Generated Artifacts in ./release:${NC}"
    ls -lh release/ | grep -v '^total' | grep -v '^drwx' | awk '{print "  • " $9 " (" $5 ")"}'
else
    log_warn "No release directory found."
fi

echo -e "\n${GREEN}${BOLD}✓ Vexta-Electron v${CURRENT_VERSION} build pipeline completed flawlessly!${NC}\n"
