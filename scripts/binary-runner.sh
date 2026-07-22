#!/bin/bash
# Cargo runner script for macOS development.
# It copies the compiled debug binary into the .app bundle structure
# and runs it from there. This registers the running dev process with
# macOS Launch Services so deep-link callbacks (taskplayer-dev://) work.

BINARY_PATH="$1"
shift

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
APP_PATH="$PROJECT_ROOT/src-tauri/target/debug/bundle/macos/TaskPlayer Dev.app"

if [ -d "$APP_PATH" ]; then
    # Copy the binary to the bundle
    cp "$BINARY_PATH" "$APP_PATH/Contents/MacOS/taskplayer"
    # Execute the copy inside the bundle (preserves stdin/stdout/stderr)
    exec "$APP_PATH/Contents/MacOS/taskplayer" "$@"
else
    # Fallback if the bundle has not been built yet
    exec "$BINARY_PATH" "$@"
fi
