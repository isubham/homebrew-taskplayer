#!/bin/bash
# setup-dev-env.sh — Sets up a new macOS developer environment for TaskPlayer.
# It installs core tools, generates the debug .app bundle structure,
# and configures cargo to execute dev binaries inside the bundle so deep links
# (taskplayer-dev://) work natively in active dev HMR instances.

set -e

echo "=== TaskPlayer macOS Dev Environment Setup ==="

# 1. Check & Install Rust
if ! command -v rustc &> /dev/null; then
    echo "Rust not found. Installing rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
else
    echo "✓ Rust is installed ($(rustc --version))"
fi

# 2. Check & Install pnpm
if ! command -v pnpm &> /dev/null; then
    echo "pnpm not found. Installing pnpm..."
    curl -fsSL https://get.pnpm.io/install.sh | sh -
    export PNPM_HOME="$HOME/Library/pnpm"
    export PATH="$PNPM_HOME/bin:$PATH"
else
    echo "✓ pnpm is installed ($(pnpm --version))"
fi

# 3. Install Node.js dependencies
echo "Installing Node dependencies..."
pnpm install

# 4. Generate the debug .app bundle structure
echo "Generating debug app bundle structure..."
# Ignore updater signing errors since we only need the compiled .app bundle
pnpm tauri build --debug --config src-tauri/tauri.dev.conf.json || true

# 5. Create Cargo configuration directory and config.toml
echo "Configuring Cargo target runner..."
mkdir -p src-tauri/.cargo
cat << 'EOF' > src-tauri/.cargo/config.toml
[target.aarch64-apple-darwin]
runner = "../scripts/binary-runner.sh"

[target.x86_64-apple-darwin]
runner = "../scripts/binary-runner.sh"
EOF

# 6. Create binary-runner.sh
echo "Creating binary runner script..."
mkdir -p scripts
cat << 'EOF' > scripts/binary-runner.sh
#!/bin/bash
# Cargo runner script for macOS development.
# Copies compiled debug binary to the .app bundle structure and runs it.
# This registers the process with macOS Launch Services for deep links.

BINARY_PATH="$1"
shift

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
APP_PATH="$PROJECT_ROOT/src-tauri/target/debug/bundle/macos/TaskPlayer Dev.app"

if [ -d "$APP_PATH" ]; then
    # Copy compiled binary into bundle
    cp "$BINARY_PATH" "$APP_PATH/Contents/MacOS/taskplayer"
    # Execute the copied binary inside the bundle (preserves process lifecycle/terminal output)
    exec "$APP_PATH/Contents/MacOS/taskplayer" "$@"
else
    # Fallback if bundle is not yet built
    exec "$BINARY_PATH" "$@"
fi
EOF

chmod +x scripts/binary-runner.sh

echo ""
echo "=== Setup Complete ==="
echo "You can now run:"
echo "  pnpm dev"
echo ""
echo "Google Sign-In deep-links will automatically route to your active terminal HMR process!"
EOF
