export function esc(s) {
  return String(s).replace(/[&<>\"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[char]));
}

export function fmt(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export function fmtLong(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m`;
  return `${totalSeconds}s`;
}

export function whenLabel(ts) {
  const date = new Date(ts);
  const now = new Date();
  const yesterday = new Date(now - 86400000);
  const sameDay = date.toDateString() === now.toDateString();
  const sameYesterday = date.toDateString() === yesterday.toDateString();
  const day = sameDay ? "Today" : sameYesterday ? "Yesterday" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${day} · ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

export function fmtEst(min) {
  return parseFloat((min / 60).toFixed(2)) + "h";
}

export function fmtHM(ms) {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? (remainder ? `${hours}h ${remainder}m` : `${hours}h`) : `${minutes}m`;
}

export function estPct(task, taskTotal) {
  return task.estimateMin ? Math.min(100, Math.round(taskTotal(task.id) / (task.estimateMin * 60000) * 100)) : 0;
}
