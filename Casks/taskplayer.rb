cask "taskplayer" do
  version "0.5.1"
  sha256 "386aa7316cab11584db8e07c3991c9ca902fd05fba9cc275c6246eac05634297"

  url "https://github.com/isubham/homebrew-taskplayer/releases/download/v#{version}/TaskPlayer.app.tar.gz"
  name "TaskPlayer"
  desc "Spotify-style deep-work timer"
  homepage "https://github.com/isubham/homebrew-taskplayer"

  depends_on macos: :big_sur

  app "TaskPlayer.app"

  postflight do
    system_command "/usr/bin/xattr",
                    args: ["-cr", "#{appdir}/TaskPlayer.app"]
    system_command "/usr/bin/codesign",
                    args: ["--force", "--deep", "--sign", "-", "#{appdir}/TaskPlayer.app"]

    # LaunchAgent so macOS relaunches TaskPlayer automatically if it ever
    # exits abnormally (a crash), but never after a deliberate Quit — Quit
    # always exits 0 (it's Tauri's PredefinedMenuItem::quit, see the tray
    # menu in src-tauri/src/main.rs), and KeepAlive's SuccessfulExit: false
    # means "only restart on a *non*-zero exit."
    #
    # Points straight at the binary inside the bundle rather than `open -a
    # TaskPlayer.app`: `open` hands off the launch and exits immediately
    # with its own success code, so launchd would only ever see *that*
    # always-clean exit and never notice the real app crashing minutes
    # later — the whole mechanism silently no-ops with `open` in the middle.
    plist_path = Pathname.new(Dir.home) / "Library/LaunchAgents/com.taskplayer.desktop.plist"
    plist_path.dirname.mkpath
    plist_path.write <<~PLIST
      <?xml version="1.0" encoding="UTF-8"?>
      <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
      <plist version="1.0">
      <dict>
        <key>Label</key>
        <string>com.taskplayer.desktop</string>
        <key>ProgramArguments</key>
        <array>
          <string>#{appdir}/TaskPlayer.app/Contents/MacOS/taskplayer</string>
        </array>
        <key>RunAtLoad</key>
        <true/>
        <key>KeepAlive</key>
        <dict>
          <key>SuccessfulExit</key>
          <false/>
        </dict>
        <key>ThrottleInterval</key>
        <integer>10</integer>
      </dict>
      </plist>
    PLIST
    system_command "/bin/launchctl", args: ["load", "-w", plist_path.to_s]
  end

  # Runs on every `brew uninstall --cask taskplayer` (not just `--zap`) —
  # without this, uninstalling would leave the LaunchAgent behind, quietly
  # relaunching a TaskPlayer.app that no longer exists, forever.
  uninstall launchctl: "com.taskplayer.desktop",
            trash:     "~/Library/LaunchAgents/com.taskplayer.desktop.plist"

  zap trash: [
    "~/Library/Application Support/com.taskplayer.desktop",
    "~/Library/Saved Application State/com.taskplayer.desktop.savedState",
    "~/Library/WebKit/com.taskplayer.desktop",
    "~/Library/LaunchAgents/com.taskplayer.desktop.plist",
  ]

  caveats <<~EOS
    TaskPlayer isn't notarized by Apple yet. This install already cleared
    the Gatekeeper quarantine flag and re-signed it locally, so it should
    open normally from Applications or Spotlight.

    If macOS still calls it "damaged" (rare — can happen if Finder
    re-quarantines it after moving), run this once:

      xattr -cr "#{appdir}/TaskPlayer.app" && codesign --force --deep --sign - "#{appdir}/TaskPlayer.app"

    This install also registers a LaunchAgent (~/Library/LaunchAgents/
    com.taskplayer.desktop.plist) so TaskPlayer starts automatically at
    login and relaunches itself if it ever crashes. It will NOT relaunch
    after a normal Quit. `brew uninstall --cask taskplayer` removes it
    automatically. To disable it without uninstalling:

      launchctl unload ~/Library/LaunchAgents/com.taskplayer.desktop.plist
  EOS
end
