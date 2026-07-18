import React, { useState } from "react";
import { whenLabel } from "../utils.jsx";
import { StickyHeader } from "./sticky-header.jsx";
import { useApp } from "../context/AppContext.jsx";
import { KEYBOARD_SETTINGS_COPY, SETTINGS_DATA_COPY, SETTINGS_SECTIONS, SETTINGS_SECTION_STORAGE_KEY, WORKFLOW_SETTINGS_COPY } from "../constants.jsx";
import { SettingsNavigation } from "./settings-navigation";

function SettingsAlbum({ icon, color, title, subtitle, children }) {
  return (
    <section>
      <div className="salbhead">
        <div className="salb-tile" style={{ background: `${color}22`, color }}>{icon}</div>
        <div className="salb-meta">
          <div className="salb-name">{title}</div>
          <div className="salb-sub">{subtitle}</div>
        </div>
      </div>
      {children}
    </section>
  );
}

export function SettingsPage() {
  const { state, actions } = useApp();
  const [workflowConfigMode, setWorkflowConfigMode] = useState(() => state.S?.config?.mode || "open");
  const [activeSettingsSection, setActiveSettingsSection] = useState(() => {
    const saved = localStorage.getItem(SETTINGS_SECTION_STORAGE_KEY);
    return saved && SETTINGS_SECTIONS.some((section) => section.key === saved) ? saved : SETTINGS_SECTIONS[0].key;
  });
  if (!state.S) return null;
  const config = state.S.config;
  const account = state.S.account;
  const syncFailed = !state.S.syncing && !!state.S.lastSyncError;
  const syncLabel = state.S.syncing
    ? "Syncing…"
    : syncFailed
      ? `Sync failed: ${state.S.lastSyncError}`
      : state.S.lastSyncedAt
        ? `Synced ${whenLabel(state.S.lastSyncedAt)}`
        : "Not synced yet";

  const acctSubtitle = account ? `Signed in as ${account.name || account.email}` : "Sign in to sync across devices";

  // Account Section
  const renderAccountSection = () => {
    if (!account) {
      return (
        <>
          <p className="hint" style={{ marginTop: 0 }}>Sign in with Google to sync your tasks and sessions across devices.</p>
          <div className="setrow">
            <button className="pill" onClick={actions.signInGoogle}>Sign in with Google</button>
          </div>
        </>
      );
    }
    const avatar = account.avatarUrl ? (
      <img className="acct-avatar" src={account.avatarUrl} alt="" />
    ) : (
      <div className="acct-avatar acct-avatar-fallback">{(account.name || account.email || "?")[0].toUpperCase()}</div>
    );
    return (
      <>
        <div className="acct-row">
          {avatar}
          <div className="acct-info">
            <strong>{account.name || account.email}</strong>
            <small>{account.email}</small>
          </div>
        </div>
        <div className="setrow">
          <button className="pill" onClick={actions.signOut}>Sign out</button>
        </div>
      </>
    );
  };

  const renderDataSection = () => (
    <>
      <h4>{SETTINGS_DATA_COPY.heading}</h4>
      <p className="hint" style={{ marginTop: 0 }}>
        {account ? SETTINGS_DATA_COPY.description : SETTINGS_DATA_COPY.signInHint}
      </p>
      <div className="setrow">
        <button className="pill" onClick={actions.fullSync} disabled={!account || !!state.S.syncing}>
          {state.S.syncing ? SETTINGS_DATA_COPY.repairingLabel : SETTINGS_DATA_COPY.repairLabel}
        </button>
      </div>
      {account ? <p className={`hint${syncFailed ? " hint-error" : ""}`}>{syncLabel}</p> : null}
    </>
  );

  // Sound Pickers Section
  const renderSoundPickers = () => {
    const options = state.soundOptions.length ? state.soundOptions : [config.breakSound, config.workSound];
    return (
      <>
        <h4>Alert sounds</h4>
        <div className="fld">
          <label style={{ minWidth: "110px" }}>Break time</label>
          <select
            value={config.breakSound}
            onChange={(e) => actions.setConfigSound("breakSound", e.target.value)}
          >
            {options.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <div className="fld">
          <label style={{ minWidth: "110px" }}>Back to work</label>
          <select
            value={config.workSound}
            onChange={(e) => actions.setConfigSound("workSound", e.target.value)}
          >
            {options.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <p className="hint">Played alongside the notification when a work block or break finishes.</p>
      </>
    );
  };

  // Notification Hint
  const renderNotifHint = () => (
    <div className="fld" style={{ alignItems: "flex-start", gap: "10px", marginTop: "10px", padding: "10px", borderRadius: "8px", background: "rgba(255,255,255,.04)" }}>
      <div style={{ flex: 1 }}>
        <p className="hint" style={{ margin: "0 0 8px" }}>Notifications disappear on their own by default. For reminders that stay put until you dismiss them, set TaskPlayer's Alert style to <strong>Alerts</strong> in System Settings → Notifications.</p>
        <div className="setrow">
          <button className="pill" onClick={actions.openNotificationSettings}>Open Notification Settings</button>
        </div>
      </div>
    </div>
  );

  // Notifications Section
  const renderNotificationModeContent = () => {
    if (config.mode === "open") {
      return (
        <>
          <h4>Hourly check-in</h4>
          <div className="fld">
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={!!config.hourlyNudge}
                onChange={(e) => actions.setConfigField("hourlyNudge", e.target.checked ? "1" : "0")}
              />
              Check in every hour I keep going
            </label>
          </div>
          <p className="hint">Each full hour of continuous work: a quiet note that you're doing great, with a nudge to stretch or grab water. No sound.</p>
          {renderNotifHint()}
        </>
      );
    }
    if (config.mode === "target") {
      return (
        <>
          <p className="hint" style={{ marginTop: 0 }}>When you reach your target length you'll get a notification saying the session's complete — the clock keeps counting if you stay on. It plays the "Break time" sound; work/break sound pickers apply to 🍅 Pomodoro mode.</p>
          {renderNotifHint()}
        </>
      );
    }
    return (
      <>
        {renderSoundPickers()}
        {renderNotifHint()}
      </>
    );
  };

  const renderNotificationsSection = () => (
    <>
      {renderNotificationModeContent()}
    </>
  );

  // Workflow Section
  const renderSessionControls = () => {
    return (
      <>
        <p className="hint" style={{ marginTop: 0 }}>{WORKFLOW_SETTINGS_COPY.configurationHint}</p>
        <div className="modes">
          <button
            className={`modebtn ${workflowConfigMode === "open" ? "sel" : ""}`}
            onClick={() => setWorkflowConfigMode("open")}
          >
            ∞ Open<small>Track time</small>
          </button>
          <button
            className={`modebtn ${workflowConfigMode === "target" ? "sel" : ""}`}
            onClick={() => setWorkflowConfigMode("target")}
          >
            🎯 Target<small>Aim for a length</small>
          </button>
          <button
            className={`modebtn ${workflowConfigMode === "pomodoro" ? "sel" : ""}`}
            onClick={() => setWorkflowConfigMode("pomodoro")}
          >
            🍅 Pomodoro<small>Work / break</small>
          </button>
        </div>
        {workflowConfigMode === "target" && (
          <>
            <h4>Target length</h4>
            <div className="fld">
              <input
                type="number"
                min="1"
                max="240"
                value={config.targetMin}
                onChange={(e) => actions.setConfigField("targetMin", e.target.value)}
              />{" "}
              minutes
            </div>
            <p className="hint">The bar fills toward your target and pulses when reached — you'll also get a notification. It keeps counting if you go over.</p>
          </>
        )}
        {workflowConfigMode === "pomodoro" && (
          <>
            <h4>Work / break lengths</h4>
            <div className="fld">
              <input
                type="number"
                min="1"
                max="120"
                value={config.workMin}
                onChange={(e) => actions.setConfigField("workMin", e.target.value)}
              />{" "}
              min work
            </div>
            <div className="fld">
              <input
                type="number"
                min="1"
                max="60"
                value={config.breakMin}
                onChange={(e) => actions.setConfigField("breakMin", e.target.value)}
              />{" "}
              min break
            </div>
            <p className="hint">Work blocks auto-log; music pauses on breaks and resumes on work. Classic is 25 / 5.</p>
            <h4>Long break</h4>
            <div className="fld">
              <input
                type="number"
                min="1"
                max="12"
                value={config.cyclesBeforeLongBreak}
                onChange={(e) => actions.setConfigField("cyclesBeforeLongBreak", e.target.value)}
              />{" "}
              cycles before a long break
            </div>
            <div className="fld">
              <input
                type="number"
                min="1"
                max="60"
                value={config.longBreakMin}
                onChange={(e) => actions.setConfigField("longBreakMin", e.target.value)}
              />{" "}
              min long break
            </div>
            <p className="hint">Every Nth break is longer, so a full set of work blocks ends in real recovery. Classic is every 4th, 20 min.</p>
          </>
        )}
        {workflowConfigMode === "open" && (
          <p className="hint">The classic stopwatch — runs until you press stop. An hourly check-in nudge can be toggled in Notifications below.</p>
        )}
      </>
    );
  };

  // Keyboard Section
  const renderKeyboardSection = () => {
    const on = !!state.keybindings;
    return (
      <>
        <p className="hint" style={{ marginTop: 0 }}>Drive the app from the keyboard — jump between views, move through lists and tasks, and play/pause without the mouse.</p>
        <div className="settings-keyboard-toggle-row">
          <span>Keyboard shortcuts</span>
          <button
            type="button"
            className={`settings-switch${on ? " on" : ""}`}
            role="switch"
            aria-checked={on}
            aria-label={KEYBOARD_SETTINGS_COPY.toggleLabel}
            title={on ? KEYBOARD_SETTINGS_COPY.disableTitle : KEYBOARD_SETTINGS_COPY.enableTitle}
            onClick={actions.toggleKeybindings}
          >
            <span className="settings-switch-knob" />
          </button>
        </div>
        <div className="setrow">
          <button
            className="pill"
            onClick={() => actions.uiNote(
              KEYBOARD_SETTINGS_COPY.shortcutsTitle,
              KEYBOARD_SETTINGS_COPY.shortcutsHtml,
              KEYBOARD_SETTINGS_COPY.shortcutsConfirmLabel,
            )}
          >⌨ View shortcuts</button>
        </div>
        <p className="hint">When off, single-key shortcuts are disabled. ⌘[ / ⌘] history navigation always works.</p>
      </>
    );
  };

  // Diagnostics Section
  const renderDiagnosticsSection = () => (
    <>
      <h4>Backup &amp; restore</h4>
      <p className="hint" style={{ marginTop: 0 }}>Back up everything — lists, tasks, and session history — to a JSON file, or restore from one.</p>
      <div className="setrow">
        <button className="pill" onClick={actions.exportData}>⤓ Export data</button>
        <button className="pill" onClick={actions.importData}>⤒ Import data</button>
      </div>
      <p className="hint">Importing replaces all current data and can't be undone.</p>
      <h4 style={{ marginTop: "20px" }}>Log file</h4>
      <p className="hint" style={{ marginTop: 0 }}>Running into a bug? Reveal the log file and attach it when you report the issue.</p>
      <div className="setrow">
        <button className="pill" onClick={actions.revealLogs}>📄 Reveal log file</button>
      </div>
    </>
  );

  // About Section
  const renderAboutSection = () => {
    const version = state.S.appVersion || "";
    const info = state.updateInfo;
    const checking = state.checkingForUpdate;
    const installing = state.installingUpdate;
    return (
      <>
        <p className="hint" style={{ marginTop: 0 }}>TaskPlayer {version} — a playlist-style deep-work timer. One task runs at a time; the menu-bar item shows live time.</p>
        <div className="setrow">
          <button className="pill" onClick={() => actions.checkForUpdates({ silent: false })} disabled={!!checking}>{checking ? "⟳ Checking…" : "⟳ Check for updates"}</button>
        </div>
        {info && (
          <>
            <p className="hint" style={{ color: "var(--green-hi)" }}>Update available: v{info.version}</p>
            <div className="setrow">
              <button className="pill" onClick={actions.promptInstallUpdate} disabled={!!installing}>{installing ? "⟳ Installing…" : "⤓ Download & install"}</button>
            </div>
          </>
        )}
      </>
    );
  };

  const settingsSections = SETTINGS_SECTIONS.map((section) => (
    section.key === "account" ? { ...section, subtitle: acctSubtitle } : { ...section }
  ));
  const activeSection = settingsSections.find((section) => section.key === activeSettingsSection) || settingsSections[0];
  const sectionContent = {
    account: renderAccountSection(),
    workflow: renderSessionControls(),
    notifications: renderNotificationsSection(),
    keyboard: renderKeyboardSection(),
    data: renderDataSection(),
    diagnostics: renderDiagnosticsSection(),
    about: renderAboutSection(),
  };
  const selectSettingsSection = (key) => {
    setActiveSettingsSection(key);
    localStorage.setItem(SETTINGS_SECTION_STORAGE_KEY, key);
  };

  return (
    <>
      <StickyHeader icon="⚙" name="Settings" />
      <div className="hdr" data-tauri-drag-region>
        <div className="cover" style={{ background: "linear-gradient(135deg,#5a5a5a,#2e2e2e)" }}>⚙</div>
        <div className="info">
          <small>App</small>
          <h1>Settings</h1>
          <div className="sub">Account, workflow, notifications &amp; more</div>
        </div>
      </div>
      <div className="settings-shell">
        <SettingsNavigation sections={settingsSections} activeKey={activeSection.key} onSelect={selectSettingsSection} />
        <div className="settings-page">
          <SettingsAlbum icon={activeSection.icon} color={activeSection.color} title={activeSection.title} subtitle={activeSection.subtitle}>
            {sectionContent[activeSection.key]}
          </SettingsAlbum>
        </div>
      </div>
    </>
  );
}
