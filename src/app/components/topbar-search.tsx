import { useEffect, useRef } from "react";
import { BookHeart, History } from "lucide-react";
import {
  TOPBAR_SEARCH_COPY,
  TOPBAR_SEARCH_IDS,
  TOPBAR_SEARCH_KEYS,
  TOPBAR_SEARCH_RESULT_KINDS,
  TOPBAR_SEARCH_SCROLL_BLOCK,
} from "../constants";
import { useTopbarSearch } from "./use-topbar-search";

export function TopbarSearch({ state, list }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const search = useTopbarSearch(state, list);
  const hasQuery = Boolean(search.query.trim());
  const popupVisible = search.open && (hasQuery || search.recentQueries.length > 0);
  const activeOptionId = search.visibleCount ? `${TOPBAR_SEARCH_IDS.results}-option-${search.activeIndex}` : undefined;

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) search.setOpen(false);
    };
    document.addEventListener("click", closeOnOutsideClick);
    return () => document.removeEventListener("click", closeOnOutsideClick);
  }, [search.setOpen]);

  useEffect(() => {
    if (!search.open || !activeOptionId) return;
    document.getElementById(activeOptionId)?.scrollIntoView({ block: TOPBAR_SEARCH_SCROLL_BLOCK });
  }, [activeOptionId, search.open]);

  const moveSelection = (offset: number) => {
    if (!search.visibleCount) return;
    search.setOpen(true);
    search.setActiveIndex((current) => (current + offset + search.visibleCount) % search.visibleCount);
  };

  const handleKeyDown = (event) => {
    if (event.key === TOPBAR_SEARCH_KEYS.next || event.key === TOPBAR_SEARCH_KEYS.previous) {
      event.preventDefault();
      moveSelection(event.key === TOPBAR_SEARCH_KEYS.next ? 1 : -1);
      return;
    }
    if (event.key === TOPBAR_SEARCH_KEYS.activate && search.open) {
      event.preventDefault();
      if (hasQuery) {
        const result = search.results[search.activeIndex];
        if (result) void search.activateResult(result);
      } else {
        const recentQuery = search.recentQueries[search.activeIndex];
        if (recentQuery) search.selectRecent(recentQuery);
      }
      return;
    }
    if (event.key === TOPBAR_SEARCH_KEYS.close) {
      event.preventDefault();
      event.stopPropagation();
      search.close();
    }
  };

  return (
    <div className="topbar-search" id={TOPBAR_SEARCH_IDS.wrapper} ref={wrapperRef}>
      <input
        id={TOPBAR_SEARCH_IDS.input}
        ref={search.inputRef}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={TOPBAR_SEARCH_IDS.results}
        aria-expanded={popupVisible}
        aria-activedescendant={activeOptionId}
        placeholder={TOPBAR_SEARCH_COPY.placeholder}
        autoComplete="off"
        spellCheck="false"
        value={search.query}
        onChange={(event) => {
          search.setQuery(event.target.value);
          search.setOpen(true);
        }}
        onFocus={() => {
          search.setOpen(true);
          void search.refreshJournals();
        }}
        onKeyDown={handleKeyDown}
      />
      {popupVisible && (
        <div className="search-results show" id={TOPBAR_SEARCH_IDS.results}>
          {!hasQuery && search.recentQueries.length ? (
            <>
              <div className="sr-heading">
                <span>{TOPBAR_SEARCH_COPY.recentHeading}</span>
                <button type="button" onClick={search.clearRecent}>{TOPBAR_SEARCH_COPY.clearRecent}</button>
              </div>
              <div role="listbox" aria-label={TOPBAR_SEARCH_COPY.recentHeading}>
                {search.recentQueries.map((recentQuery, index) => (
                  <button
                    type="button"
                    role="option"
                    id={`${TOPBAR_SEARCH_IDS.results}-option-${index}`}
                    aria-selected={search.activeIndex === index}
                    className={`sr-item${search.activeIndex === index ? " active" : ""}`}
                    key={recentQuery}
                    onMouseEnter={() => search.setActiveIndex(index)}
                    onClick={() => search.selectRecent(recentQuery)}
                  >
                    <History aria-hidden="true" />
                    <span className="sr-name">{recentQuery}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {hasQuery && !search.results.length ? <div className="sr-empty">{TOPBAR_SEARCH_COPY.noMatches(search.query)}</div> : null}
          {hasQuery && search.results.length ? (
            <div role="listbox" aria-label={TOPBAR_SEARCH_COPY.resultsLabel}>
              {search.results.map((result, index) => (
                <button
                  type="button"
                  role="option"
                  id={`${TOPBAR_SEARCH_IDS.results}-option-${index}`}
                  aria-selected={search.activeIndex === index}
                  className={`sr-item${search.activeIndex === index ? " active" : ""}`}
                  key={result.key}
                  onMouseEnter={() => search.setActiveIndex(index)}
                  onClick={() => void search.activateResult(result)}
                >
                  {result.kind === TOPBAR_SEARCH_RESULT_KINDS.journal
                    ? <BookHeart aria-hidden="true" />
                    : <span className="sr-icon">{result.icon}</span>}
                  <span className="sr-name">{result.label}</span>
                  <span className="sr-meta">{result.meta}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
