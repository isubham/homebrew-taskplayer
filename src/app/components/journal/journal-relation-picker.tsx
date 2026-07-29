import { Check, Search } from "lucide-react";
import { useState } from "react";
import type { JournalRelatedItem } from "../../bindings";
import { JOURNAL_COPY, JOURNAL_RELATED_RESULT_LIMIT } from "../../constants";
import type { JournalRelationOption } from "./use-journal-relation-options";

type JournalRelationPickerProps = {
  options: JournalRelationOption[];
  selected: JournalRelatedItem[];
  onToggle: (item: JournalRelatedItem) => void;
};

export function JournalRelationPicker(props: JournalRelationPickerProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = props.options
    .filter((option) => `${option.label} ${option.detail}`.toLocaleLowerCase().includes(normalizedQuery))
    .slice(0, JOURNAL_RELATED_RESULT_LIMIT);

  return (
    <div className="journal-relation-picker">
      <label>
        <Search aria-hidden="true" />
        <input
          autoFocus
          type="search"
          value={query}
          placeholder={JOURNAL_COPY.relatedSearchPlaceholder}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="journal-relation-results">
        {visible.map((option) => {
          const selected = props.selected.some((item) => item.kind === option.kind && item.id === option.id);
          return (
            <button
              key={`${option.kind}-${option.id}`}
              className={selected ? "sel" : ""}
              type="button"
              aria-pressed={selected}
              onClick={() => props.onToggle(option)}
            >
              <span><strong>{option.label}</strong><small>{option.detail}</small></span>
              {selected ? <Check aria-hidden="true" /> : null}
            </button>
          );
        })}
        {!visible.length ? <p>{JOURNAL_COPY.relatedEmpty}</p> : null}
      </div>
    </div>
  );
}
