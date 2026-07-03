cask "taskplayer" do
  version "0.1.0"
  sha256 "21e1700fa395da10dfde03c891d7c57e54509d7128c046950d6dcbe5f502b38f"

  url "https://github.com/isubham/homebrew-taskplayer/releases/download/v#{version}/TaskPlayer.app.tar.gz"
  name "TaskPlayer"
  desc "Spotify-style deep-work timer"
  homepage "https://github.com/isubham/homebrew-taskplayer"

  depends_on macos: :big_sur

  app "TaskPlayer.app"

  zap trash: [
    "~/Library/Application Support/com.taskplayer.desktop",
    "~/Library/Saved Application State/com.taskplayer.desktop.savedState",
    "~/Library/WebKit/com.taskplayer.desktop",
  ]

  caveats <<~EOS
    TaskPlayer isn't notarized by Apple yet, so Gatekeeper will block the
    first launch with an "unidentified developer" warning. Run this once
    to allow it:

      xattr -cr "#{appdir}/TaskPlayer.app"

    Then open it normally from Applications or Spotlight.
  EOS
end
