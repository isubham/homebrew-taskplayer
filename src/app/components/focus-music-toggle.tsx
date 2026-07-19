import { useMusic } from "../../music";
import { MUSIC_COPY } from "../constants";

export function FocusMusicToggle() {
  const { musicState, setFlowMusicEnabled } = useMusic();
  const enabled = !!musicState?.flowMusicEnabled;
  const title = enabled ? MUSIC_COPY.flowEnabledTitle : MUSIC_COPY.flowDisabledTitle;

  return (
    <button
      type="button"
      className={`settings-switch${enabled ? " on" : ""}`}
      role="switch"
      aria-checked={enabled}
      aria-label={MUSIC_COPY.flowToggleLabel}
      title={title}
      onClick={() => setFlowMusicEnabled(!enabled)}
    >
      <span className="settings-switch-knob" />
    </button>
  );
}
