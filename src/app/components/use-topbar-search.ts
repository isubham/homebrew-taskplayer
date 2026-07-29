import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JournalEntrySummary } from "../bindings";
import {
  JOURNAL_VIEW_KEY,
  TOPBAR_SEARCH_COPY,
  TOPBAR_SEARCH_LIMITS,
  TOPBAR_SEARCH_RESULT_KINDS,
} from "../constants";
import { useApp } from "../context/app-context-value";
import {
  clearStoredRecentSearches,
  readRecentSearches,
  storeRecentSearch,
} from "./topbar-search-history";
import type { TopbarSearchResult } from "./topbar-search.types";

export function useTopbarSearch(state, list) {
  const { actions } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentQueries, setRecentQueries] = useState(readRecentSearches);
  const [journalEntries, setJournalEntries] = useState<JournalEntrySummary[]>([]);

  const loadJournalEntries = useCallback(async () => {
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) return;
    try {
      setJournalEntries(await invoke("list_journal_entries") as JournalEntrySummary[]);
    } catch {
      setJournalEntries([]);
    }
  }, []);

  useEffect(() => {
    void loadJournalEntries();
    window.addEventListener("focus", loadJournalEntries);
    return () => window.removeEventListener("focus", loadJournalEntries);
  }, [loadJournalEntries]);

  const results = useMemo<TopbarSearchResult[]>(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized || !state.S) return [];
    const tasks = state.S.tasks
      .filter((task) => !task.completedAt && task.name.toLocaleLowerCase().includes(normalized))
      .slice(0, TOPBAR_SEARCH_LIMITS.tasks)
      .map((task) => {
        const owner = list(task.listId);
        return {
          key: `${TOPBAR_SEARCH_RESULT_KINDS.task}-${task.id}`,
          kind: TOPBAR_SEARCH_RESULT_KINDS.task,
          id: task.id,
          listId: task.listId,
          label: task.name,
          meta: owner?.name || TOPBAR_SEARCH_COPY.unsortedMeta,
          icon: owner?.emoji || TOPBAR_SEARCH_COPY.taskFallbackIcon,
        };
      });
    const lists = state.S.lists
      .filter((item) => item.name.toLocaleLowerCase().includes(normalized))
      .slice(0, TOPBAR_SEARCH_LIMITS.lists)
      .map((item) => ({
        key: `${TOPBAR_SEARCH_RESULT_KINDS.list}-${item.id}`,
        kind: TOPBAR_SEARCH_RESULT_KINDS.list,
        id: item.id,
        label: item.name,
        meta: TOPBAR_SEARCH_COPY.resultKindLabels[TOPBAR_SEARCH_RESULT_KINDS.list],
        icon: item.emoji,
      }));
    const journals = journalEntries
      .filter((entry) => `${entry.title} ${entry.excerpt}`.toLocaleLowerCase().includes(normalized))
      .slice(0, TOPBAR_SEARCH_LIMITS.journals)
      .map((entry) => ({
        key: `${TOPBAR_SEARCH_RESULT_KINDS.journal}-${entry.id}`,
        kind: TOPBAR_SEARCH_RESULT_KINDS.journal,
        id: entry.id,
        label: entry.title,
        meta: TOPBAR_SEARCH_COPY.journalMeta,
      }));
    return [...tasks, ...lists, ...journals];
  }, [journalEntries, list, query, state.S]);

  const visibleCount = query.trim() ? results.length : recentQueries.length;
  useEffect(() => setActiveIndex(0), [query, visibleCount]);

  const rememberQuery = useCallback(() => {
    setRecentQueries((current) => storeRecentSearch(query, current));
  }, [query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }, []);

  const activateResult = useCallback(async (result: TopbarSearchResult) => {
    let navigated = true;
    if (result.kind === TOPBAR_SEARCH_RESULT_KINDS.task) {
      if (!result.listId) return;
      navigated = await actions.selectList(result.listId) !== false;
      if (navigated) actions.setOpenTaskId(result.id);
    } else if (result.kind === TOPBAR_SEARCH_RESULT_KINDS.list) {
      navigated = await actions.selectList(result.id) !== false;
    } else {
      navigated = await actions.navigate({ view: JOURNAL_VIEW_KEY, journalEntryId: result.id }) !== false;
    }
    if (!navigated) return;
    rememberQuery();
    close();
  }, [actions, close, rememberQuery]);

  const selectRecent = useCallback((recentQuery: string) => {
    setQuery(recentQuery);
    setOpen(true);
  }, []);

  const clearRecent = useCallback(() => {
    clearStoredRecentSearches();
    setRecentQueries([]);
    setActiveIndex(0);
  }, []);

  return {
    inputRef, query, setQuery, open, setOpen, activeIndex, setActiveIndex,
    recentQueries, results, visibleCount, activateResult, selectRecent, clearRecent, close,
    refreshJournals: loadJournalEntries,
  };
}
