#!/usr/bin/env bash
#
# One-time setup for the self-updater: generates the ed25519 keypair Tauri
# uses to sign releases and verify them inside the app. Run this exactly
# once per app (not per release) — see scripts/release.sh, which refuses to
# build until this has been done and the public key pasted into
# src-tauri/tauri.conf.json.
#
# Usage:
#   scripts/generate-update-key.sh                     # key at ~/.tauri/taskplayer-updater.key
#   scripts/generate-update-key.sh /path/to/key         # custom location
#
# Losing the private key afterwards means you can never publish an update
# that already-installed copies of the app will accept — they only trust
# the public key baked into the version they're running. Back it up
# somewhere durable (a password manager entry is a good spot) the moment
# it's generated.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

KEY_PATH="${1:-$HOME/.tauri/taskplayer-updater.key}"

if [ -f "$KEY_PATH" ]; then
  echo "A key already exists at $KEY_PATH — refusing to overwrite it." >&2
  echo "(Generating a new one would orphan every already-installed copy of the app: they'd" >&2
  echo "reject all future updates, since they only trust the OLD public key.)" >&2
  exit 1
fi

mkdir -p "$(dirname "$KEY_PATH")"
npx tauri signer generate -w "$KEY_PATH"

echo
echo "Private key saved to: $KEY_PATH"
echo "Back it up somewhere durable right now (a password manager entry, not just this file)."
echo
echo "Next steps:"
echo "  1. Copy the public key printed above into"
echo "     src-tauri/tauri.conf.json -> plugins.updater.pubkey, replacing the placeholder."
echo "  2. Commit that change."
echo "  3. Releasing via GitHub Actions (.github/workflows/release.yml, the recommended path):"
echo "     add these as repo secrets — Settings -> Secrets and variables -> Actions -> New repository secret:"
echo "       TAURI_SIGNING_PRIVATE_KEY           = \$(cat $KEY_PATH)"
echo "       TAURI_SIGNING_PRIVATE_KEY_PASSWORD  = (blank unless the generator asked you for one above)"
echo "     Then release with: gh workflow run release.yml -f version=0.4.0"
echo "  4. Releasing locally instead (scripts/release.sh run on your own Mac) needs the same two"
echo "     values as environment variables first:"
echo "       export TAURI_SIGNING_PRIVATE_KEY=\"\$(cat $KEY_PATH)\""
echo "       export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=\"\"   # only if the generator asked for one above"
