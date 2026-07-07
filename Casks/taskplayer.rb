cask "taskplayer" do
  version "0.4.0"
  sha256 "db6584d3326470070f0d8aa2198903fda1af572b75f342548f1da16496c386cd"

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
  end

  zap trash: [
    "~/Library/Application Support/com.taskplayer.desktop",
    "~/Library/Saved Application State/com.taskplayer.desktop.savedState",
    "~/Library/WebKit/com.taskplayer.desktop",
  ]

  caveats <<~EOS
    TaskPlayer isn't notarized by Apple yet. This install already cleared
    the Gatekeeper quarantine flag and re-signed it locally, so it should
    open normally from Applications or Spotlight.

    If macOS still calls it "damaged" (rare — can happen if Finder
    re-quarantines it after moving), run this once:

      xattr -cr "#{appdir}/TaskPlayer.app" && codesign --force --deep --sign - "#{appdir}/TaskPlayer.app"
  EOS
end
