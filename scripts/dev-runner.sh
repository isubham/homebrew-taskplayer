#!/bin/bash
# Custom Tauri runner to enable deep link handling on macOS in development.
# It copies the compiled HMR binary into the .app bundle and executes it
# from there, registering it with macOS Launch Services.

BINARY_PATH="$1"
shift

# Get absolute path of this script's directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Project root is the parent of the script directory
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

APP_PATH="$PROJECT_ROOT/src-tauri/target/debug/bundle/macos/TaskPlayer Dev.app"

if [ ! -d "$APP_PATH" ]; then
    echo "[Runner] Error: Debug app bundle not found. Please build it first using:"
    echo "  pnpm tauri build --debug --config src-tauri/tauri.dev.conf.json"
    exit 1
fi

# Copy the HMR binary into the app bundle
cp "$BINARY_PATH" "$APP_PATH/Contents/MacOS/taskplayer"

# Exec the bundle binary to preserve stdout/stderr and process controls in the terminal
exec "$APP_PATH/Contents/MacOS/taskplayer" "$@"
