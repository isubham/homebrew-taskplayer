import { createContext, useContext, useState, useCallback } from "react";
import { LIFE_AREAS, IMPACT_TIERS, jewelPayout, dailyPayoutDayCount, dailyPayoutOn, RANKS, RANK_AREA_CAP_RATIO } from "../utils.jsx";
import { ATTENTION_TASKS_SIZE, RECENT_TASKS_SIZE, IMPACT_WEIGHT_TO_MS, LIFE_BALANCE_CAP_MS } from "../constants.jsx";
import { buildDailyJamAttentionEntries } from "../daily-jam-attention";
import { buildLogicalSessions } from "../logical-sessions";

const CoreContext = createContext(null);

export function useCore() {
  return useContext(CoreContext);
}



export function CoreProvider({ children }) {
  const [S, setS] = useState(null);

  const apply = useCallback((snap) => {
    if (!snap) return;
    setS(snap);
  }, []);

  const list = useCallback((id) => S?.lists.find((item) => item.id === id), [S]);
  const findTask = useCallback((id) => S?.tasks.find((task) => task.id === id), [S]);
  const tasksForList = useCallback((lid) => S?.tasks.filter((task) => task.listId === lid) || [], [S]);
  const taskSessions = useCallback((id) => S?.sessions.filter((session) => session.taskId === id) || [], [S]);
  const logicalSessions = useCallback((now = Date.now()) => S ? buildLogicalSessions(S, now) : [], [S]);
  const currentLogicalSession = useCallback((now = Date.now()) => {
    const activeSessionId = S?.run?.activeSessionId;
    return activeSessionId
      ? logicalSessions(now).find((session) => session.id === activeSessionId) || null
      : null;
  }, [S, logicalSessions]);

  const taskTotal = useCallback((id) => {
    const now = Date.now();
    let ms = taskSessions(id).reduce((sum, session) => sum + ((session.end ?? now) - session.start), 0);
    const run = S?.run;
    if (run?.activeTaskId === id && run.phase === "work" && run.runningStart) {
      ms += now - run.runningStart;
    }
    return ms;
  }, [S, taskSessions]);

  const listTotal = useCallback((lid) => {
    return tasksForList(lid).reduce((sum, task) => sum + taskTotal(task.id), 0);
  }, [tasksForList, taskTotal]);

  const listEstimateTotal = useCallback((lid) => {
    return tasksForList(lid).reduce((sum, task) => sum + (task.estimateMin || 0), 0);
  }, [tasksForList]);

  const targetMs = useCallback(() => {
    const config = S?.config;
    if (!config) return null;
    return config.mode === "target"
      ? config.targetMin * 60000
      : config.mode === "pomodoro"
        ? config.workMin * 60000
        : null;
  }, [S]);

  const modeLabel = useCallback(() => {
    const config = S?.config;
    if (!config) return "∞ Open";
    return config.mode === "target"
      ? `🎯 ${config.targetMin}m target`
      : config.mode === "pomodoro"
        ? `🍅 ${config.workMin}/${config.breakMin}`
        : "∞ Open";
  }, [S]);

  const modeGlyph = useCallback(() => {
    const mode = S?.config?.mode;
    return mode === "target" ? "◎" : mode === "pomodoro" ? "◔" : "∞";
  }, [S]);

  const isAgainstTask = useCallback((task) => {
    if (!task) return false;
    const payout = jewelPayout(task);
    if (payout && payout.amount < 0) return true;
    const listItem = list(task.listId);
    return !!(listItem && listItem.lifeDirection === "decrease");
  }, [list]);

  const todayTotalMs = useCallback(() => {
    if (!S) return 0;
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    const start = cutoff.getTime();
    const now = Date.now();
    return S.sessions.reduce((sum, session) => {
      const segStart = Math.max(session.start, start);
      const segEnd = Math.min(session.end ?? now, now);
      return sum + Math.max(0, segEnd - segStart);
    }, 0);
  }, [S]);

  const todayMsForTask = useCallback((taskId) => {
    if (!S) return 0;
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    const start = cutoff.getTime();
    const now = Date.now();
    return S.sessions.reduce((sum, session) => {
      if (session.taskId !== taskId) return sum;
      const segStart = Math.max(session.start, start);
      const segEnd = Math.min(session.end ?? now, now);
      return sum + Math.max(0, segEnd - segStart);
    }, 0);
  }, [S]);

  const todayJewels = useCallback(() => {
    if (!S) return 0;
    const todayStartMs = new Date().setHours(0, 0, 0, 0);
    let total = 0;
    for (const task of S.tasks) {
      const payout = jewelPayout(task);
      if (!payout) continue;
      if (task.cadence === "daily") {
        if (dailyPayoutOn(task, S.sessions, todayStartMs)) total += payout.amount;
      } else if (task.completedAt && task.completedAt >= todayStartMs) {
        total += payout.amount;
      }
    }
    return total;
  }, [S]);

  const lifetimeJewelsNet = useCallback(() => {
    if (!S) return 0;
    const now = Date.now();
    let total = 0;
    for (const task of S.tasks) {
      const payout = jewelPayout(task);
      if (!payout) continue;
      if (task.cadence === "daily") {
        total += payout.amount * dailyPayoutDayCount(task, S.sessions, 0, now);
      } else if (task.completedAt) {
        total += payout.amount;
      }
    }
    return total;
  }, [S]);

  const lifetimeJewelsByArea = useCallback(() => {
    const totals = new Map();
    if (!S) return totals;
    const now = Date.now();
    const add = (key, amount) => totals.set(key, (totals.get(key) || 0) + amount);
    for (const task of S.tasks) {
      const payout = jewelPayout(task);
      if (!payout || payout.amount <= 0) continue;
      const listItem = list(task.listId);
      const key = listItem && listItem.lifeArea ? listItem.lifeArea : "other";
      if (task.cadence === "daily") {
        const days = dailyPayoutDayCount(task, S.sessions, 0, now);
        if (days > 0) add(key, payout.amount * days);
      } else if (task.completedAt) {
        add(key, payout.amount);
      }
    }
    return totals;
  }, [S, list]);

  const buildRankInfo = useCallback(() => {
    if (!S) return null;
    const byArea = lifetimeJewelsByArea();
    const hasLifeTags = S.lists.some((listItem) => listItem.lifeArea);
    const rawTotal = Array.from(byArea.values()).reduce((sum, v) => sum + v, 0);
    const balancedScoreFor = (tier) => {
      if (!hasLifeTags) return rawTotal;
      const cap = tier.min * RANK_AREA_CAP_RATIO;
      let total = 0;
      for (const v of byArea.values()) total += Math.min(v, cap);
      return total;
    };
    let current = RANKS[0];
    for (let i = 1; i < RANKS.length; i++) {
      if (balancedScoreFor(RANKS[i]) >= RANKS[i].min - 1e-6) current = RANKS[i];
      else break;
    }
    const currentIdx = RANKS.indexOf(current);
    const next = RANKS[currentIdx + 1] || null;
    const progress = next ? Math.min(balancedScoreFor(next), next.min) : null;
    return { current, next, progress, rawTotal };
  }, [S, lifetimeJewelsByArea]);

  const lifeBalanceScores = useCallback(() => {
    const empty = LIFE_AREAS.map((area) => ({ ...area, ms: 0, pct: 0, negMs: 0, negPct: 0 }));
    if (!S) return empty;
    const now = Date.now();
    const windowStart = now - 7 * 24 * 60 * 60 * 1000;
    const posMs = new Map(LIFE_AREAS.map((area) => [area.key, 0]));
    const negMs = new Map(LIFE_AREAS.map((area) => [area.key, 0]));
    const addPos = (key, ms) => posMs.set(key, posMs.get(key) + ms);
    const addNeg = (key, ms) => negMs.set(key, negMs.get(key) + ms);
    for (const listItem of S.lists) {
      if (!listItem.lifeArea || !posMs.has(listItem.lifeArea)) continue;
      let timeMs = 0;
      for (const task of tasksForList(listItem.id)) {
        const payout = jewelPayout(task);
        if (payout && task.cadence === "daily") {
          const days = dailyPayoutDayCount(task, S.sessions, windowStart, now);
          if (days > 0) {
            const swing = payout.amount * IMPACT_WEIGHT_TO_MS * days;
            if (swing >= 0) addPos(listItem.lifeArea, swing);
            else addNeg(listItem.lifeArea, -swing);
          }
          continue;
        }
        if (payout && task.completedAt && task.completedAt >= windowStart && task.completedAt <= now) {
          const swing = payout.amount * IMPACT_WEIGHT_TO_MS;
          if (swing >= 0) addPos(listItem.lifeArea, swing);
          else addNeg(listItem.lifeArea, -swing);
          continue;
        }
        for (const session of taskSessions(task.id)) {
          const segStart = Math.max(session.start, windowStart);
          const segEnd = Math.min(session.end ?? now, now);
          timeMs += Math.max(0, segEnd - segStart);
        }
      }
      if (listItem.lifeDirection === "decrease") addNeg(listItem.lifeArea, timeMs);
      else addPos(listItem.lifeArea, timeMs);
    }
    return LIFE_AREAS.map((area) => {
      const neg = negMs.get(area.key);
      const net = posMs.get(area.key) - neg;
      const pct = Math.max(0, Math.min(100, Math.round((net / LIFE_BALANCE_CAP_MS) * 100)));
      const negPct = Math.max(0, Math.min(100, Math.round((neg / LIFE_BALANCE_CAP_MS) * 100)));
      return { ...area, ms: net, pct, negMs: neg, negPct };
    });
  }, [S, tasksForList, taskSessions]);

  const againstContributors = useCallback((areaKey) => {
    if (!S) return [];
    const now = Date.now();
    const windowStart = now - 7 * 24 * 60 * 60 * 1000;
    const listMap = new Map(S.lists.map((l) => [l.id, l]));
    const taskConts = new Map();

    const add = (task, ms) => {
      const existing = taskConts.get(task.id);
      if (existing) existing.ms += ms;
      else {
        const l = listMap.get(task.listId);
        taskConts.set(task.id, {
          taskId: task.id,
          taskName: task.name,
          listName: l?.name || "",
          listColor: l?.color || "",
          ms,
        });
      }
    };

    for (const task of S.tasks) {
      const payout = jewelPayout(task);
      const l = listMap.get(task.listId);
      if (!l || l.lifeArea !== areaKey) continue;
      const dec = l.lifeDirection === "decrease";

      if (payout && task.cadence === "daily") {
        const days = dailyPayoutDayCount(task, S.sessions, windowStart, now);
        const swing = payout.amount * IMPACT_WEIGHT_TO_MS * days;
        if (swing < 0) add(task, -swing);
        continue;
      }
      if (payout && task.completedAt && task.completedAt >= windowStart && task.completedAt <= now) {
        const swing = payout.amount * IMPACT_WEIGHT_TO_MS;
        if (swing < 0) add(task, -swing);
        continue;
      }

      let timeMs = 0;
      for (const session of taskSessions(task.id)) {
        const segStart = Math.max(session.start, windowStart);
        const segEnd = Math.min(session.end ?? now, now);
        timeMs += Math.max(0, segEnd - segStart);
      }
      if (dec && timeMs > 0) add(task, timeMs);
    }
    return Array.from(taskConts.values()).sort((a, b) => b.ms - a.ms);
  }, [S, taskSessions]);

  const lifeBalanceDailyGrid = useCallback(() => {
    const now = new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const startMs = d.getTime();
      days.push({
        label: d.toLocaleDateString(undefined, { weekday: "short" }),
        isToday: i === 0,
        startMs,
        endMs: startMs + 24 * 60 * 60 * 1000,
      });
    }
    const rows = LIFE_AREAS.map((area) => ({
      ...area,
      cells: days.map(() => ({ ms: 0, contributors: [] })),
    }));
    if (!S) return { days, rows };
    const rowByKey = new Map(rows.map((row) => [row.key, row]));

    const mergeContributors = (list) => {
      const byTask = new Map();
      for (const c of list) {
        const existing = byTask.get(c.taskId);
        if (existing) existing.ms += c.ms;
        else byTask.set(c.taskId, { ...c });
      }
      return Array.from(byTask.values()).sort((a, b) => Math.abs(b.ms) - Math.abs(a.ms));
    };

    for (const listItem of S.lists) {
      const row = rowByKey.get(listItem.lifeArea);
      if (!row) continue;
      for (const task of tasksForList(listItem.id)) {
        const payout = jewelPayout(task);
        if (payout && task.cadence === "daily") {
          days.forEach((day, dayIndex) => {
            if (!dailyPayoutOn(task, S.sessions, day.startMs)) return;
            const tierMs = payout.amount * IMPACT_WEIGHT_TO_MS;
            const cell = row.cells[dayIndex];
            cell.ms += tierMs;
            cell.contributors.push({
              taskId: task.id, taskName: task.name, listName: listItem.name, listColor: listItem.color,
              kind: "tier", tier: task.impactTier, amount: payout.amount, ms: tierMs,
            });
          });
          continue;
        }
        if (payout && task.completedAt) {
          const dayIndex = days.findIndex((day) => task.completedAt >= day.startMs && task.completedAt < day.endMs);
          if (dayIndex !== -1) {
            const tierMs = payout.amount * IMPACT_WEIGHT_TO_MS;
            const cell = row.cells[dayIndex];
            cell.ms += tierMs;
            cell.contributors.push({
              taskId: task.id, taskName: task.name, listName: listItem.name, listColor: listItem.color,
              kind: "tier", tier: task.impactTier, amount: payout.amount, ms: tierMs,
            });
          }
          continue;
        }
        for (const session of taskSessions(task.id)) {
          const sessionEnd = session.end ?? Date.now();
          days.forEach((day, dayIndex) => {
            const segStart = Math.max(session.start, day.startMs);
            const segEnd = Math.min(sessionEnd, day.endMs);
            if (segEnd <= segStart) return;
            const dur = segEnd - segStart;
            const signed = listItem.lifeDirection === "decrease" ? -dur : dur;
            const cell = row.cells[dayIndex];
            cell.ms += signed;
            cell.contributors.push({
              taskId: task.id, taskName: task.name, listName: listItem.name, listColor: listItem.color,
              kind: "time", ms: signed,
            });
          });
        }
      }
    }
    rows.forEach((row) => {
      row.cells = row.cells.map((cell) => ({ ms: cell.ms, contributors: mergeContributors(cell.contributors) }));
    });
    return { days, rows };
  }, [S, tasksForList, taskSessions]);

  const recentTasks = useCallback((limit = RECENT_TASKS_SIZE) => {
    if (!S) return [];
    const now = Date.now();
    const lastPlayedAt = new Map();
    for (const session of S.sessions) {
      const at = session.end ?? now;
      if (!lastPlayedAt.has(session.taskId) || at > lastPlayedAt.get(session.taskId)) {
        lastPlayedAt.set(session.taskId, at);
      }
    }
    const run = S.run;
    const liveTaskId = run.activeTaskId && run.phase === "work" && run.runningStart ? run.activeTaskId : null;
    if (liveTaskId) lastPlayedAt.set(liveTaskId, now);
    const ongoingTaskId = run.activeSessionId ? run.activeTaskId || run.lastTaskId : null;
    if (ongoingTaskId) lastPlayedAt.set(ongoingTaskId, now);
    const latestLogicalSession = new Map();
    for (const session of logicalSessions(now)) {
      if (!latestLogicalSession.has(session.taskId)) latestLogicalSession.set(session.taskId, session);
    }

    return Array.from(lastPlayedAt.entries())
      .map(([taskId, at]) => ({
        task: findTask(taskId),
        at,
        live: taskId === liveTaskId,
        ongoing: taskId === ongoingTaskId,
        logicalSession: latestLogicalSession.get(taskId) || null,
      }))
      .filter((entry) => entry.task && !entry.task.completedAt && !isAgainstTask(entry.task))
      .sort((a, b) => b.at - a.at)
      .slice(0, limit);
  }, [S, findTask, isAgainstTask, logicalSessions]);

  const dailyJamTasks = useCallback(() => {
    if (!S) return [];
    return buildDailyJamAttentionEntries({
      tasks: S.tasks,
      sessions: S.sessions,
      run: S.run,
      list,
      isAgainstTask,
    });
  }, [S, list, isAgainstTask]);

  const attentionTasks = useCallback((limit = ATTENTION_TASKS_SIZE) => {
    if (!S) return [];
    const now = Date.now();
    const run = S.run;
    const liveTaskId = run.activeTaskId && run.phase === "work" && run.runningStart ? run.activeTaskId : null;

    const lastTouch = new Map();
    for (const session of S.sessions) {
      const at = session.end ?? now;
      if (!lastTouch.has(session.taskId) || at > lastTouch.get(session.taskId)) {
        lastTouch.set(session.taskId, at);
      }
    }

    return S.tasks
      .filter((task) => !task.completedAt && task.id !== liveTaskId)
      .filter((task) => task.deadlineAt && (task.impactTier === "medium" || task.impactTier === "high"))
      .map((task) => {
        const daysLeft = (task.deadlineAt - now) / 86400000;
        const touchedAt = lastTouch.get(task.id) ?? null;
        const daysSinceTouch = touchedAt ? (now - touchedAt) / 86400000 : Infinity;
        const urgency = Math.max(0, Math.min(1, 1 - daysLeft / 7));
        const neglect = Math.max(0, Math.min(1, daysSinceTouch / Math.max(daysLeft, 1)));
        const weight = IMPACT_TIERS[task.impactTier].weight;
        return { task, score: weight * (0.6 * urgency + 0.4 * neglect) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => entry.task);
  }, [S]);

  const nowPlayingSelection = useCallback(() => {
    const run = S?.run;
    if (!run) return null;
    const running = run.activeTaskId && run.phase ? findTask(run.activeTaskId) : null;
    let task = running || (run.lastTaskId ? findTask(run.lastTaskId) : null);
    if (!running && task && task.completedAt) task = null;
    return task;
  }, [S, findTask]);

  return (
    <CoreContext.Provider value={{
      S,
      apply,
      helpers: {
        list, findTask, tasksForList, taskSessions, logicalSessions, currentLogicalSession, taskTotal, listTotal,
        listEstimateTotal, targetMs, modeLabel, modeGlyph, isAgainstTask, todayTotalMs,
        todayMsForTask, todayJewels, lifetimeJewelsNet, lifetimeJewelsByArea, buildRankInfo,
        lifeBalanceScores, againstContributors, lifeBalanceDailyGrid, recentTasks,
        dailyJamTasks, attentionTasks, nowPlayingSelection
      }
    }}>
      {children}
    </CoreContext.Provider>
  );
}
