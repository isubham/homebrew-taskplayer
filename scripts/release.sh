#!/usr/bin/env bash
#
# Cut a TaskPlayer release: bump the version everywhere it's recorded, build
# the signed-nowhere-but-working .app + .dmg, package the .app for the
# Homebrew cask, update Casks/taskplayer.rb, commit + tag, and (optionally)
# push + publish a GitHub release with both artifacts attached.
#
# This repo doubles as the app source AND the homebrew tap, so "release"
# means two things landing together: a GitHub Release holding the binaries,
# and Casks/taskplayer.rb pointing `brew install --cask` at them. This script
# keeps those in lockstep instead of hand-editing three version strings and
# a sha256 by hand (see the 45fd21a / e58d69c history — that's what this is
# replacing).
#
# Usage:
#   scripts/release.sh 0.3.0              # bump, build, package, commit, tag
#   scripts/release.sh 0.3.0 --publish    # ...and push + gh release create
#   scripts/release.sh 0.3.0 --yes        # don't pause for confirmation
#   scripts/release.sh 0.3.0 --skip-build # reuse an existing bundle (fast
#                                          #   iteration on packaging/cask
#                                          #   steps without recompiling Rust)
#   scripts/release.sh --force ...        # skip the clean-tree/branch checks
#
# Must run on macOS — `tauri build` only produces a .app/.dmg there, and
# this script relies on macOS's `shasum`/`ditto`.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP_NAME="TaskPlayer"
CASK_FILE="Casks/taskplayer.rb"
REPO="isubham/homebrew-taskplayer"
BUNDLE_DIR="src-tauri/target/release/bundle"

VERSION=""
PUBLISH=0
ASSUME_YES=0
SKIP_BUILD=0
FORCE=0

# ---------- helpers ----------

info()  { printf '\033[1;36m==>\033[0m %s\n' "$1"; }
warn()  { printf '\033[1;33m!!\033[0m %s\n' "$1"; }
die()   { printf '\033[1;31mERROR:\033[0m %s\n' "$1" >&2; exit 1; }

confirm() {
  [ "$ASSUME_YES" = 1 ] && return 0
  local prompt="$1"
  read -r -p "$prompt [y/N] " reply
  case "$reply" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' is required but not found on PATH."
}

# Replace an exact, known string in a file — fails loudly instead of
# silently no-op'ing if the "before" text isn't found verbatim. That's the
# whole point versus a regex: if some file has already drifted (someone
# hand-edited one version string but not the others), we want this script
# to stop, not paper over it.
replace_exact() {
  local file="$1" before="$2" after="$3"
  grep -qF -- "$before" "$file" || die "Expected to find:\n  $before\nin $file, but didn't. Aborting before anything is half-updated."
  local tmp
  tmp="$(mktemp)"
  # First occurrence only — package.json/tauri.conf.json/Cargo.toml each
  # have exactly one line we mean to touch, but dependency tables can
  # contain look-alike substrings (e.g. `version = "2"` inside a Cargo
  # dependency spec), so we don't blanket-replace_all.
  awk -v before="$before" -v after="$after" '
    !done && index($0, before) { sub(before, after); done=1 }
    { print }
  ' "$file" > "$tmp" && mv "$tmp" "$file"
}

# ---------- parse args ----------

while [ $# -gt 0 ]; do
  case "$1" in
    --publish) PUBLISH=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --force) FORCE=1 ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    [0-9]*.[0-9]*.[0-9]*) VERSION="$1" ;;
    *) die "Unrecognized argument: $1 (expected a version like 0.3.0, or a flag)" ;;
  esac
  shift
done

[ -n "$VERSION" ] || die "Usage: scripts/release.sh <version> [--publish] [--yes] [--skip-build] [--force]"

TAG="v$VERSION"

# ---------- preflight ----------

[ "$(uname -s)" = "Darwin" ] || die "This has to run on macOS — Tauri only bundles .app/.dmg there."

require_cmd npm
require_cmd cargo
require_cmd tar
require_cmd shasum
require_cmd git
require_cmd awk

CURRENT_VERSION="$(node -pe "require('./package.json').version")"
[ "$CURRENT_VERSION" != "$VERSION" ] || die "package.json is already at $VERSION — nothing to bump."

if git rev-parse "$TAG" >/dev/null 2>&1; then
  die "Tag $TAG already exists. Pick a new version or delete the tag first."
fi

if [ "$FORCE" != 1 ]; then
  [ -z "$(git status --porcelain)" ] || die "Working tree isn't clean. Commit/stash first, or pass --force."
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  [ "$BRANCH" = "main" ] || warn "You're on '$BRANCH', not 'main'. (--force to skip this check silently next time.)"
fi

info "Releasing $APP_NAME $CURRENT_VERSION -> $VERSION"

# ---------- 1. bump version everywhere it's recorded ----------

info "Bumping version in package.json, tauri.conf.json, Cargo.toml"
replace_exact "package.json"                 "\"version\": \"$CURRENT_VERSION\"" "\"version\": \"$VERSION\""
replace_exact "src-tauri/tauri.conf.json"    "\"version\": \"$CURRENT_VERSION\"" "\"version\": \"$VERSION\""
replace_exact "src-tauri/Cargo.toml"         "version = \"$CURRENT_VERSION\""    "version = \"$VERSION\""

# ---------- 2. build ----------

if [ "$SKIP_BUILD" = 1 ]; then
  info "Skipping build (--skip-build) — reusing whatever's already in $BUNDLE_DIR"
else
  info "npm install"
  npm install
  info "npm run build  (this compiles the Rust core — a couple minutes)"
  npm run build
fi

APP_PATH="$BUNDLE_DIR/macos/$APP_NAME.app"
[ -d "$APP_PATH" ] || die "Expected to find $APP_PATH after the build — check the build output above."

DMG_PATH="$(find "$BUNDLE_DIR/dmg" -maxdepth 1 -name '*.dmg' -print -quit 2>/dev/null || true)"
[ -n "$DMG_PATH" ] || warn "No .dmg found in $BUNDLE_DIR/dmg — continuing with just the .app tarball."

# ---------- 3. package the .app for the cask ----------

info "Packaging $APP_NAME.app.tar.gz"
TARBALL="$ROOT/$APP_NAME.app.tar.gz"
rm -f "$TARBALL"
# COPYFILE_DISABLE keeps macOS from sneaking AppleDouble (._*) files into the
# archive; Homebrew's cask just wants the plain .app bundle back out.
( cd "$BUNDLE_DIR/macos" && COPYFILE_DISABLE=1 tar -czf "$TARBALL" "$APP_NAME.app" )

SHA256="$(shasum -a 256 "$TARBALL" | awk '{print $1}')"
info "sha256: $SHA256"

# ---------- 4. update the cask ----------

info "Updating $CASK_FILE"
CURRENT_SHA="$(awk -F'"' '/^  sha256 /{print $2; exit}' "$CASK_FILE")"
[ -n "$CURRENT_SHA" ] || die "Couldn't find the current sha256 line in $CASK_FILE."
replace_exact "$CASK_FILE" "version \"$CURRENT_VERSION\"" "version \"$VERSION\""
replace_exact "$CASK_FILE" "sha256 \"$CURRENT_SHA\""       "sha256 \"$SHA256\""

# ---------- 5. commit + tag ----------

info "Committing version bump and tagging $TAG"
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml "$CASK_FILE"
git commit -m "release $TAG"
git tag -a "$TAG" -m "$APP_NAME $VERSION"

echo
info "Local release steps done:"
echo "  - version bumped: $CURRENT_VERSION -> $VERSION"
echo "  - built: $APP_PATH"
[ -n "$DMG_PATH" ] && echo "  - built: $DMG_PATH"
echo "  - packaged: $TARBALL (sha256 $SHA256)"
echo "  - committed + tagged: $TAG"
echo

# ---------- 6. push + publish (optional) ----------

if [ "$PUBLISH" != 1 ]; then
  info "Not pushing (pass --publish to push + create the GitHub release automatically)."
  echo "  Manual steps from here:"
  echo "    git push origin $(git rev-parse --abbrev-ref HEAD) --follow-tags"
  echo "    gh release create $TAG \"$TARBALL\"${DMG_PATH:+ \"$DMG_PATH\"} --title \"$TAG\" --generate-notes"
  echo "  (or upload $TARBALL${DMG_PATH:+ and $DMG_PATH} by hand at https://github.com/$REPO/releases/new?tag=$TAG)"
  exit 0
fi

if ! command -v gh >/dev/null 2>&1; then
  warn "gh CLI not found — can't auto-publish. Falling back to manual instructions."
  echo "    git push origin $(git rev-parse --abbrev-ref HEAD) --follow-tags"
  echo "  Then upload $TARBALL${DMG_PATH:+ and $DMG_PATH} at https://github.com/$REPO/releases/new?tag=$TAG"
  exit 0
fi

confirm "Push $(git rev-parse --abbrev-ref HEAD) + tag $TAG and publish a GitHub release now?" \
  || die "Aborted before pushing. Everything above is already committed/tagged locally if you want to finish this by hand."

info "Pushing"
git push origin "$(git rev-parse --abbrev-ref HEAD)" --follow-tags

info "Creating GitHub release $TAG"
gh release create "$TAG" "$TARBALL" ${DMG_PATH:+"$DMG_PATH"} \
  --repo "$REPO" \
  --title "$TAG" \
  --generate-notes

info "Done. brew users get this the moment $CASK_FILE lands on main — this tap IS the cask."
