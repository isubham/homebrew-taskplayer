import React from "react";
import { fmtLong, fmtHM, LIFE_AREAS, timeAgo, IMPACT_TIERS } from "../utils.jsx";
import { StickyHeader } from "./sticky-header.jsx";
import { DailyJam } from "./daily-jam.jsx";
import { useApp } from "../context/AppContext.jsx";
import { RECENT_TASKS_SIZE } from "../constants.jsx";

const HOME_SVG = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
  </svg>
);

// Radar Chart Component
function LifeRadar({ scores, against, selectedAgainst, onSelectAgainst }) {
  const width = 520;
  const height = 320;
  const cx = width / 2;
  const cy = height / 2 - 2;
  const maxR = 84;
  const n = scores.length;
  const angleFor = (i) => -Math.PI / 2 + i * ((2 * Math.PI) / n);
  const pointAt = (i, frac) => {
    const a = angleFor(i);
    return [cx + Math.cos(a) * maxR * frac, cy + Math.sin(a) * maxR * frac];
  };

  const ringPolygons = [0.25, 0.5, 0.75, 1].map((frac, idx) => {
    const points = scores.map((_, i) => pointAt(i, frac).join(",")).join(" ");
    return <polygon key={idx} points={points} fill="none" stroke="#333" strokeWidth="1" />;
  });

  const spokes = scores.map((_, i) => {
    const [x, y] = pointAt(i, 1);
    return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#333" strokeWidth="1" />;
  });

  const dataPts = scores.map((s, i) => pointAt(i, Math.max(0.04, s.pct / 100)));
  const dataPointsStr = dataPts.map((p) => p.join(",")).join(" ");
  const dataPoly = <polygon points={dataPointsStr} fill="var(--green)" fillOpacity="0.22" stroke="var(--green)" strokeWidth="2" />;

  const dots = dataPts.map(([x, y], i) => (
    <circle key={i} cx={x} cy={y} r="3" fill="var(--green)">
      <title>{scores[i].label}: {scores[i].pct}%</title>
    </circle>
  ));

  const showAgainst = against && scores.some((s) => s.negPct > 0);
  const againstPts = scores.map((s, i) => pointAt(i, s.negPct / 100));
  const againstPointsStr = againstPts.map((p) => p.join(",")).join(" ");
  const againstPoly = showAgainst ? (
    <polygon points={againstPointsStr} fill="#8f8f8f" fillOpacity="0.12" stroke="#8f8f8f" strokeWidth="1.5" strokeDasharray="3 3" />
  ) : null;

  const againstDots = showAgainst
    ? scores.map((s, i) => {
        if (s.negPct <= 0) return null;
        const sel = selectedAgainst === s.key;
        return (
          <circle
            key={i}
            className="radar-against-dot"
            cx={againstPts[i][0]}
            cy={againstPts[i][1]}
            r={sel ? 5 : 4}
            fill="#8f8f8f"
            stroke={sel ? "#fff" : undefined}
            strokeWidth={sel ? 1.5 : undefined}
            onClick={() => onSelectAgainst(s.key)}
            style={{ cursor: "pointer" }}
          >
            <title>{s.label} — pulling against: {s.negPct}% · click for detail</title>
          </circle>
        );
      })
    : null;

  const labels = scores.map((s, i) => {
    const [lx, ly] = pointAt(i, 1.2);
    const anchor = Math.abs(lx - cx) < 4 ? "middle" : lx > cx ? "start" : "end";
    return (
      <text key={i} x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" fontSize="11" fill="var(--muted)">
        {s.label}
      </text>
    );
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="300">
      {ringPolygons}
      {spokes}
      {againstPoly}
      {dataPoly}
      {dots}
      {againstDots}
      {labels}
    </svg>
  );
}

// Against Detail Component
function AgainstDetail({ areaKey, againstContributors }) {
  const { actions } = useApp();
  const area = LIFE_AREAS.find((a) => a.key === areaKey);
  if (!area) return null;
  const items = againstContributors(areaKey);

  return (
    <div className="lg-detail against-detail">
      <div className="lg-detail-head">Pulling against {area.label} <span className="lg-detail-day">last 7 days</span></div>
      {items.length ? (
        items.map((c, i) => {
          const amountHtml = c.kind === "tier" ? (
            <span className="lg-item-amt"><i className="jewel-dot neg" />{c.amount} {IMPACT_TIERS[c.tier]?.label ?? ""}</span>
          ) : (
            <span className="lg-item-amt">−{fmtLong(c.ms)}</span>
          );
          return (
            <div
              key={i}
              className="lg-item"
              onClick={() => {
                actions.selectList(c.listId);
                actions.setOpenTaskId(c.taskId);
              }}
              style={{ cursor: "pointer" }}
            >
              <span className="lg-item-dot" style={{ background: c.listColor || "#555" }} />
              <span className="lg-item-name">{c.taskName}</span>
              {amountHtml}
            </div>
          );
        })
      ) : (
        <div className="lg-item-empty">Nothing pulling against here.</div>
      )}
    </div>
  );
}

// Grid Cell Detail Component
function GridCellDetail({ row, day, cell }) {
  const { actions } = useApp();
  return (
    <div className="lg-detail">
      <div className="lg-detail-head">{row.label} <span className="lg-detail-day">{day.label}</span></div>
      {cell.contributors.length ? (
        cell.contributors.map((c, i) => {
          const amountHtml = c.kind === "tier" ? (
            <span className="lg-item-amt"><i className={`jewel-dot${c.amount < 0 ? " neg" : ""}`} />{c.amount > 0 ? "+" : ""}{c.amount} {IMPACT_TIERS[c.tier]?.label ?? ""}</span>
          ) : (
            <span className="lg-item-amt">{c.ms < 0 ? "−" : ""}{fmtLong(Math.abs(c.ms))}</span>
          );
          return (
            <div
              key={i}
              className="lg-item"
              onClick={() => {
                actions.selectList(c.listId);
                actions.setOpenTaskId(c.taskId);
              }}
              style={{ cursor: "pointer" }}
            >
              <span className="lg-item-dot" style={{ background: c.listColor || "#555" }} />
              <span className="lg-item-name">{c.taskName}</span>
              {amountHtml}
            </div>
          );
        })
      ) : (
        <div className="lg-item-empty">Nothing tracked here.</div>
      )}
    </div>
  );
}

// Daily Balance Grid Component
function LifeBalanceGrid({ lifeBalanceDailyGrid, selectedGridCell, onSelectCell, LIFE_BALANCE_DAILY_CAP_MS }) {
  const { days, rows } = lifeBalanceDailyGrid();
  const header = (
    <div className="lg-row lg-head">
      <span className="lg-label" />
      {days.map((day, i) => (
        <span key={i} className={`lg-cell-label${day.isToday ? " today" : ""}`}>{day.label}</span>
      ))}
    </div>
  );

  const body = rows.map((row, rowIdx) => (
    <div key={rowIdx} className="lg-row">
      <span className="lg-label">{row.label}</span>
      {row.cells.map((cell, i) => {
        const opacity = Math.max(0.08, Math.min(1, 0.12 + 0.88 * (Math.abs(cell.ms) / LIFE_BALANCE_DAILY_CAP_MS)));
        const title = cell.ms !== 0 ? `${row.label} · ${days[i].label} · ${cell.ms < 0 ? "−" : ""}${fmtLong(Math.abs(cell.ms))}` : `${row.label} · ${days[i].label} · nothing tracked`;
        const selected = selectedGridCell && selectedGridCell.areaKey === row.key && selectedGridCell.dayIndex === i;
        return (
          <span
            key={i}
            className={`lg-cell${selected ? " selected" : ""}`}
            onClick={() => onSelectCell(row.key, i)}
            style={{ background: row.color, opacity: opacity.toFixed(2), cursor: "pointer" }}
            title={title}
          />
        );
      })}
    </div>
  ));

  const gridCol = (
    <div className="lg-grid-col">
      {header}
      {body}
      <div className="lg-legend">Lighter to darker means less to more time</div>
    </div>
  );

  let detail = null;
  if (selectedGridCell) {
    const row = rows.find((r) => r.key === selectedGridCell.areaKey);
    const day = days[selectedGridCell.dayIndex];
    if (row && day) {
      detail = <GridCellDetail row={row} day={day} cell={row.cells[selectedGridCell.dayIndex]} />;
    }
  }

  return (
    <div className={`lg-wrap${detail ? " has-detail" : ""}`}>
      {gridCol}
      {detail}
    </div>
  );
}

export function HomePage() {
  const { state, helpers, actions, setSelectedAgainstArea, setSelectedGridCell, setLifeBalanceAgainst } = useApp();

  const radarScores = helpers.lifeBalanceScores();
  const hasLifeTags = state.S?.lists.some((listItem) => listItem.lifeArea);
  const hasAgainst = radarScores.some((s) => s.negPct > 0);
  const againstOn = state.lifeBalanceAgainst;
  const dailyEntries = helpers.dailyJamTasks();
  const dailyDoneCount = dailyEntries.filter((entry) => entry.doneToday).length;
  const dailyPct = dailyEntries.length ? Math.round((dailyDoneCount / dailyEntries.length) * 100) : 0;
  const jump = helpers.recentTasks(RECENT_TASKS_SIZE);

  const todayMs = helpers.todayTotalMs();
  const rankInfo = helpers.buildRankInfo();

  const greetingText = () => {
    const h = new Date().getHours();
    if (h < 5) return "Good night";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    if (h < 21) return "Good evening";
    return "Good night";
  };

  const greetingEmojiText = () => {
    const h = new Date().getHours();
    if (h < 5) return "🌙";
    if (h < 12) return "🌤️";
    if (h < 17) return "☀️";
    if (h < 21) return "🌇";
    return "🌙";
  };

  const rankBadge = rankInfo ? (
    <span className="rank-badge" title={`${rankInfo.current.sub}${rankInfo.next ? ` — ${Math.round(rankInfo.progress)} of ${rankInfo.next.min} to ${rankInfo.next.label}` : ""}`}>
      {rankInfo.current.label}
    </span>
  ) : null;

  const handleSelectAgainst = (key) => {
    setSelectedAgainstArea((prev) => (prev === key ? null : key));
  };

  const handleSelectCell = (areaKey, dayIndex) => {
    setSelectedGridCell((prev) => {
      if (prev && prev.areaKey === areaKey && prev.dayIndex === dayIndex) {
        return null;
      }
      return { areaKey, dayIndex };
    });
  };

  return (
    <>
      <StickyHeader icon={HOME_SVG} name="Home" />
      <div className="hdr" data-tauri-drag-region>
        <div className="cover" style={{ background: "linear-gradient(135deg,#3a3a3a,#1c1c1c)" }}>{greetingEmojiText()}</div>
        <div className="info">
          <small>{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</small>
          <h1>{greetingText()}</h1>
          <div className="sub">{fmtHM(todayMs)} tracked today · {rankBadge}</div>
        </div>
      </div>
      <div className="home-body">
        <section className="home-section">
          <h4>Jump back in</h4>
          <div className="jb-grid">
            {jump.length ? (
              jump.map((entry, idx) => {
                const { task, at, live } = entry;
                const listItem = helpers.list(task.listId);
                const meta = live ? <span style={{ color: "var(--green)" }}>now · recording</span> : timeAgo(at);
                return (
                  <div
                    key={idx}
                    className="jb-card"
                    onClick={() => {
                      actions.selectList(task.listId);
                      actions.setOpenTaskId(task.id);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <span className="jb-dot" style={{ background: listItem ? listItem.color : "#555" }} />
                    <div className="jb-body">
                      <div className="jb-name">{task.name}</div>
                      <div className="jb-meta">{listItem ? listItem.name + " · " : ""}{meta}</div>
                    </div>
                    <button
                      className="jb-play"
                      onClick={(e) => {
                        e.stopPropagation();
                        actions.play(task.id);
                      }}
                      title={live ? "Stop" : "Start"}
                    >
                      {live ? "⏸" : "▶"}
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="home-empty">Nothing played yet — press play on any task to start tracking.</div>
            )}
          </div>
        </section>
        <section className="home-section">
          <h4>Daily Jam{dailyEntries.length ? <span className="home-sub-note">· {dailyDoneCount} of {dailyEntries.length} today</span> : ""}</h4>
          <div id="dailyJamRoot">
            <DailyJam
              state={state}
              entries={dailyEntries}
              doneCount={dailyDoneCount}
              percent={dailyPct}
              taskSessions={helpers.taskSessions}
              taskTotal={helpers.taskTotal}
              attentionTaskIds={new Set(helpers.attentionTasks().map((task) => task.id))}
            />
          </div>
        </section>
        <section className="home-section">
          <h4>
            Life balance <span className="home-sub-note">· last 7 days</span>
            {hasLifeTags && hasAgainst && (
              <button className="home-toggle" onClick={() => setLifeBalanceAgainst(!againstOn)}>
                {againstOn ? "Hide what's pulling against" : "Show what's pulling against"}
              </button>
            )}
          </h4>
          {hasLifeTags ? (
            <>
              <div className="home-radar">
                <LifeRadar
                  scores={radarScores}
                  against={againstOn}
                  selectedAgainst={againstOn ? state.selectedAgainstArea : null}
                  onSelectAgainst={handleSelectAgainst}
                />
              </div>
              {againstOn && hasAgainst && (
                <div className="radar-legend">
                  <span className="rl-swatch" />Time pulling against your areas · last 7 days · tap a grey dot for detail
                </div>
              )}
              {againstOn && state.selectedAgainstArea && (
                <div className="against-detail-wrap">
                  <AgainstDetail areaKey={state.selectedAgainstArea} againstContributors={helpers.againstContributors} />
                </div>
              )}
              <LifeBalanceGrid
                lifeBalanceDailyGrid={helpers.lifeBalanceDailyGrid}
                selectedGridCell={state.selectedGridCell}
                onSelectCell={handleSelectCell}
                LIFE_BALANCE_DAILY_CAP_MS={8 * 60 * 60 * 1000} // 8 hours cap
              />
            </>
          ) : (
            <div className="home-empty">Tag a list with a life area (Edit list, or when creating a new one) to see your balance here.</div>
          )}
        </section>
      </div>
    </>
  );
}
