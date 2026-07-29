import { TOPBAR_SEARCH_LIMITS, TOPBAR_SEARCH_STORAGE_KEY } from "../constants";

export function readRecentSearches(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(TOPBAR_SEARCH_STORAGE_KEY) || "[]");
    return Array.isArray(stored)
      ? stored.filter((query): query is string => typeof query === "string").slice(0, TOPBAR_SEARCH_LIMITS.recentQueries)
      : [];
  } catch {
    return [];
  }
}

export function storeRecentSearch(query: string, current: string[]): string[] {
  const normalized = query.trim();
  if (!normalized) return current;
  const next = [
    normalized,
    ...current.filter((item) => item.toLocaleLowerCase() !== normalized.toLocaleLowerCase()),
  ].slice(0, TOPBAR_SEARCH_LIMITS.recentQueries);
  localStorage.setItem(TOPBAR_SEARCH_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearStoredRecentSearches(): void {
  localStorage.removeItem(TOPBAR_SEARCH_STORAGE_KEY);
}
