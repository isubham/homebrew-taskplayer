import React, { useState, useEffect } from "react";
import { History } from "lucide-react";
import "./player.css";
import { fmt, esc } from "../utils.jsx";
import { useApp } from "../context/AppContext.jsx";
import { useMusic } from "../../music.jsx";
import { MUSIC_COPY, MUSIC_PLAYER_WIDTH, PLAYER_HISTORY_ICON_SIZE } from "../constants.jsx";
import { MusicMarquee } from "./music-marquee.jsx";

const M_NOTE_SVG = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const M_SKIP_SVG = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
    <path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6h-2z" />
  </svg>
);

export function Player({ setTrackDetailOpen }) {
  const { state, helpers, actions } = useApp();
  const { musicState, next: musicNext, setGenre: musicSetGenre, GENRES } = useMusic();

  const [tick, setTick] = useState(0);
  const isTimerTicking = !!(state.S?.run?.activeTaskId && state.S?.run?.phase);

  useEffect(() => {
    if (!isTimerTicking) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerTicking]);

  if (!state.S) return null;

  const run = state.S.run;
  const config = state.S.config;
  const running = run.activeTaskId && run.phase ? helpers.findTask(run.activeTaskId) : null;
  let task = running || (run.lastTaskId ? helpers.findTask(run.lastTaskId) : null);
  if (!running && task && task.completedAt) task = null;
  const listItem = task ? helpers.list(task.listId) : null;

  const badge = (
    <button
      className={`mode-btn ${config.mode !== "open" ? "on" : ""}`}
      onClick={actions.cycleMode}
      title={`Session mode: ${helpers.modeLabel()} — click to change`}
    >
      {helpers.modeGlyph()}
    </button>
  );

  const historyButton = (taskId) => (
    <button className="pbtn" onClick={() => actions.setOpenTaskId(taskId)} title="History">
      <History size={PLAYER_HISTORY_ICON_SIZE} aria-hidden="true" />
    </button>
  );

  const renderNowPlayingInfo = () => {
    const mirrored = running && run.deviceId && state.S.deviceId && run.deviceId !== state.S.deviceId;
    if (mirrored) {
      return (
        <button className="player-task-link" onClick={() => actions.navigate({ view: "playing" })} title="Open Now Playing">
          <span className="art" style={{ background: `${listItem?.color}22`, color: listItem?.color }}>{listItem?.emoji}</span>
          <span className="player-task-copy">
            <span className="t">{task?.name}</span>
            <span className="l">Playing on {run.deviceName || "another device"}</span>
          </span>
        </button>
      );
    }

    if (!task) {
      return (
        <>
          <div className="art" style={{ background: "#333" }}>▤</div>
          <div>
            <div className="t" style={{ color: "var(--muted)" }}>Nothing playing</div>
            <div className="l">Press ▶ on a task</div>
          </div>
        </>
      );
    }

    return (
      <button className="player-task-link" onClick={() => actions.navigate({ view: "playing" })} title="Open Now Playing">
        <span className="art" style={{ background: `${listItem?.color}22`, color: listItem?.color }}>{listItem?.emoji}</span>
        <span className="player-task-copy">
          <span className="t">{task?.name}</span>
          <span className="l">{listItem?.name}{running ? "" : " · paused"}</span>
        </span>
      </button>
    );
  };

  const renderCenterControls = () => {
    const mirrored = running && run.deviceId && state.S.deviceId && run.deviceId !== state.S.deviceId;
    if (mirrored) {
      let clockText;
      if (run.phase === "break") {
        const breakLen = (run.longBreak ? config.longBreakMin : config.breakMin) * 60000;
        const rem = run.breakStart ? Math.max(0, breakLen - (Date.now() - run.breakStart)) : breakLen;
        clockText = `☕ ${fmt(rem)}`;
      } else if (run.phase === "work" && run.runningStart) {
        clockText = fmt(Date.now() - run.runningStart);
      } else {
        clockText = "waiting";
      }
      return (
        <>
          <div className="controls">
            {badge}
            <button className="bigaction" onClick={() => actions.play(task?.id)} title="Take over on this device">▶ Play here</button>
          </div>
          <div className="timeline">
            <span className="clock" id="liveclock" style={{ color: "var(--muted)" }}>{clockText}</span>
            <div className="bar live"><span id="livebar" style={{ width: "40%", animation: "pulse 1.6s ease-in-out infinite" }} /></div>
            <span className="clock">elsewhere</span>
          </div>
        </>
      );
    }

    if (!task) {
      return (
        <>
          <div className="controls">
            {badge}
            <button className="pmain" disabled style={{ opacity: 0.4 }}>▶</button>
          </div>
          <div className="timeline">
            <span className="clock">0:00</span>
            <div className="bar"><span /></div>
            <span className="clock">—</span>
          </div>
        </>
      );
    }

    if (!running) {
      const timerTarget = helpers.targetMs();
      return (
        <>
          <div className="controls">
            {badge}
            <button className="pmain" onClick={() => actions.play(task.id)} title="Resume timer">▶</button>
            {historyButton(task.id)}
          </div>
          <div className="timeline">
            <span className="clock">{fmt(helpers.taskTotal(task.id))}</span>
            <div className="bar"><span style={{ width: 0 }} /></div>
            <span className="clock">{timerTarget ? fmt(timerTarget) : "total"}</span>
          </div>
        </>
      );
    }

    if (run.phase === "break") {
      const breakLen = run.longBreak ? state.S.config.longBreakMin : state.S.config.breakMin;
      const rem = Math.max(0, breakLen * 60000 - (Date.now() - run.breakStart));
      const pct = 100 - (rem / (breakLen * 60000)) * 100;
      const brkLabel = run.longBreak ? "☕☕" : "☕";
      return (
        <>
          <div className="controls">
            {badge}
            <button className="pmain" onClick={actions.skipBreak} title="Skip break">⏭</button>
            <button className="stopbtn" onClick={actions.stop}>■ End</button>
          </div>
          <div className="timeline">
            <span className="clock" id="liveclock" style={{ color: "var(--blue)" }}>{brkLabel} {fmt(rem)}</span>
            <div className="bar brk live"><span id="livebar" style={{ width: `${pct}%` }} /></div>
            <span className="clock" style={{ color: "var(--blue)" }}>{run.longBreak ? "long break" : "break"}</span>
          </div>
          <div className="phaseline"><span className="dot" style={{ background: "var(--blue)" }} />{run.longBreak ? `long break · cycle ${config.cyclesBeforeLongBreak} of ${config.cyclesBeforeLongBreak}` : "break"}</div>
        </>
      );
    }

    if (run.phase === "awaiting_break") {
      const breakLen = run.longBreak ? state.S.config.longBreakMin : state.S.config.breakMin;
      const btnLabel = run.longBreak ? `Long break ☕☕ — ${breakLen}m` : `Break ☕ — ${breakLen}m`;
      return (
        <>
          <div className="controls">
            {badge}
            <button className="bigaction" onClick={actions.startBreak} title="Start break" style={{ background: "var(--blue)" }}>{btnLabel}</button>
            <button className="stopbtn" onClick={actions.stop}>■ End</button>
          </div>
          <div className="timeline">
            <span className="clock" style={{ color: "var(--blue)" }}>Work session done</span>
            <div className="bar brk"><span style={{ width: "100%" }} /></div>
            <span className="clock" style={{ color: "var(--blue)" }}>waiting</span>
          </div>
        </>
      );
    }

    if (run.phase === "awaiting_work") {
      return (
        <>
          <div className="controls">
            {badge}
            <button className="bigaction" onClick={actions.resumeWork} title="Start work" style={{ background: "var(--green)" }}>▶ Start work</button>
            <button className="stopbtn" onClick={actions.stop}>■ End</button>
          </div>
          <div className="timeline">
            <span className="clock" style={{ color: "var(--green)" }}>Break's over</span>
            <div className="bar"><span style={{ width: "100%" }} /></div>
            <span className="clock" style={{ color: "var(--green)" }}>waiting</span>
          </div>
        </>
      );
    }

    const elapsed = Date.now() - run.runningStart;
    const timerTarget = helpers.targetMs();
    const pct = timerTarget ? Math.min(100, (elapsed / timerTarget) * 100) : 0;
    const phaseText = config.mode === "pomodoro"
      ? `work · cycle ${run.cyclesCompleted + 1} of ${config.cyclesBeforeLongBreak}`
      : config.mode === "target"
        ? `target · ${Math.round(pct)}%`
        : "open · no target";
    const phaseDot = config.mode === "open" ? "#6a6a6a" : "var(--green)";

    return (
      <>
        <div className="controls">
          {badge}
          <button className="pmain" onClick={() => actions.play(task.id)} title="Stop &amp; log">⏸</button>
          {historyButton(task.id)}
        </div>
        <div className="timeline">
          <span className="clock" id="liveclock">{fmt(elapsed)}</span>
          <div className={`bar live ${pct >= 100 ? "done" : ""}`}>
            <span id="livebar" style={{ width: timerTarget ? `${pct}%` : "40%", animation: timerTarget ? undefined : "pulse 1.6s ease-in-out infinite" }} />
          </div>
          <span className="clock">{timerTarget ? fmt(timerTarget) : "rec"}</span>
        </div>
        <div className="phaseline"><span className="dot" style={{ background: phaseDot }} />{phaseText}</div>
      </>
    );
  };

  const renderMusicPanel = () => {
    if (!musicState) return null;
    const stateName = musicState.loading ? "loading" : musicState.playing ? "playing" : "idle";
    const name = musicState.loading ? "Finding tracks…" : (musicState.playing || (musicState.name && musicState.name !== "Focus music")) ? musicState.name : "Not playing";
    const urls = musicState.artworkUrls || [];

    const handleGenreChange = (e) => {
      musicSetGenre(e.target.value);
    };

    return (
      <div className={`music ${stateName}`}>
        {urls.length ? (
          <img
            className="m-note m-art"
            src={urls[0]}
            onClick={() => setTrackDetailOpen(true)}
            title="Track details"
            alt=""
            style={{ cursor: "pointer" }}
            onError={(e) => {
              const idx = urls.indexOf(e.target.src);
              if (idx !== -1 && idx + 1 < urls.length) {
                e.target.src = urls[idx + 1];
              } else {
                e.target.style.display = "none";
              }
            }}
          />
        ) : (
          <span className="m-note" onClick={() => setTrackDetailOpen(true)} title="Track details" style={{ cursor: "pointer" }}>{M_NOTE_SVG}</span>
        )}
        <MusicMarquee text={name} />
        <label className="m-genre" title={MUSIC_COPY.changeVibeTitle}>
          <span className="m-genre-current">{musicState.genreLabel}</span>
          <select value={musicState.genre || ""} onChange={handleGenreChange} aria-label={MUSIC_COPY.changeVibeTitle}>
            {Object.entries(GENRES).map(([key, value]) => (
              <option key={key} value={key}>{value.label}</option>
            ))}
          </select>
        </label>
        <button className="m-next" title="Next track" onClick={musicNext}>{M_SKIP_SVG}</button>
      </div>
    );
  };

  return (
    <footer className="player">
      <div className="np" id="np">{renderNowPlayingInfo()}</div>
      <div className="center" id="center">{renderCenterControls()}</div>
      <div className="right" id="music" style={{ width: MUSIC_PLAYER_WIDTH, flexBasis: MUSIC_PLAYER_WIDTH }}>{renderMusicPanel()}</div>
    </footer>
  );
}
