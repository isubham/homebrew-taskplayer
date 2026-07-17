import { AUDIO_INTERRUPTION_COPY } from "../constants";
import { useApp } from "../context/AppContext";

export function AudioInterruptionSetting() {
  const { state, actions } = useApp();
  const capability = state.audioInterruptionCapability;
  const available = capability?.available;
  const enabled = !!state.audioInterruptionEnabled;
  const takeoverEnabled = !!state.musicPlayerTakeoverEnabled;
  const disabled = available !== true;
  const status = available == null
    ? AUDIO_INTERRUPTION_COPY.checking
    : available ? AUDIO_INTERRUPTION_COPY.description : AUDIO_INTERRUPTION_COPY.unavailable;

  return (
    <div className="audio-interruption-setting">
      <h4>{AUDIO_INTERRUPTION_COPY.heading}</h4>
      <div className="settings-keyboard-toggle-row">
        <span>{AUDIO_INTERRUPTION_COPY.label}</span>
        <button
          type="button"
          className={`settings-switch${enabled ? " on" : ""}`}
          role="switch"
          aria-checked={enabled}
          aria-label={AUDIO_INTERRUPTION_COPY.toggleLabel}
          title={enabled ? AUDIO_INTERRUPTION_COPY.disableTitle : AUDIO_INTERRUPTION_COPY.enableTitle}
          disabled={disabled}
          onClick={() => actions.setAudioInterruptionEnabled(!enabled)}
        >
          <span className="settings-switch-knob" />
        </button>
      </div>
      <p className="hint">{status}</p>
      <div className="settings-keyboard-toggle-row">
        <span>{AUDIO_INTERRUPTION_COPY.takeoverLabel}</span>
        <button
          type="button"
          className={`settings-switch${takeoverEnabled ? " on" : ""}`}
          role="switch"
          aria-checked={takeoverEnabled}
          aria-label={AUDIO_INTERRUPTION_COPY.takeoverToggleLabel}
          title={takeoverEnabled
            ? AUDIO_INTERRUPTION_COPY.takeoverDisableTitle
            : AUDIO_INTERRUPTION_COPY.takeoverEnableTitle}
          disabled={disabled || !enabled}
          onClick={() => actions.setMusicPlayerTakeoverEnabled(!takeoverEnabled)}
        >
          <span className="settings-switch-knob" />
        </button>
      </div>
      <p className="hint">{AUDIO_INTERRUPTION_COPY.takeoverDescription}</p>
    </div>
  );
}
