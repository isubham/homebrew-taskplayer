import { BookHeart, CloudOff, Link2, Plus } from "lucide-react";
import type { JournalEntrySummary } from "../../bindings";
import { JOURNAL_COPY, JOURNAL_LIST_RELATED_LIMIT, JOURNAL_MOODS } from "../../constants";

type JournalListProps = {
  entries: JournalEntrySummary[];
  onCreate: () => void;
  onOpen: (id: string) => void;
};

const moodFor = (key: string | null) => JOURNAL_MOODS.find((mood) => mood.key === key);
const displayDate = (date: string) => new Intl.DateTimeFormat(undefined, {
  year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
}).format(new Date(`${date}T00:00:00Z`));
const displayTime = (createdAt: number | null) => createdAt
  ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(createdAt))
  : "";

export function JournalList({ entries, onCreate, onOpen }: JournalListProps) {
  return (
    <>
      <div className="journal-header">
        <div>
          <h1>{JOURNAL_COPY.title}</h1>
          <p>{JOURNAL_COPY.subtitle}</p>
          <small><CloudOff aria-hidden="true" />{JOURNAL_COPY.localBadge}</small>
        </div>
        <button className="pill primary" type="button" onClick={onCreate}>
          <Plus aria-hidden="true" />{JOURNAL_COPY.newEntry}
        </button>
      </div>
      {entries.length ? (
        <table className="journal-table">
          <thead><tr><th aria-label={JOURNAL_COPY.moodColumnLabel} /><th>{JOURNAL_COPY.dateColumn}</th><th>{JOURNAL_COPY.entryColumn}</th></tr></thead>
          <tbody>
            {entries.map((entry) => {
              const mood = moodFor(entry.mood);
              const visibleRelated = entry.relatedItems.slice(0, JOURNAL_LIST_RELATED_LIMIT);
              const hiddenRelatedCount = entry.relatedItems.length - visibleRelated.length;
              return (
                <tr key={entry.id} onClick={() => onOpen(entry.id)}>
                  <td className="journal-mood" aria-label={mood?.label || JOURNAL_COPY.noMoodLabel}>{mood?.emoji || "—"}</td>
                  <td><time dateTime={entry.date}>{displayDate(entry.date)}</time><small>{displayTime(entry.createdAt)}</small></td>
                  <td>
                    <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(entry.id); }}>
                      <strong>{entry.title}</strong>
                      {entry.excerpt ? <small>{entry.excerpt}</small> : null}
                      {visibleRelated.length ? (
                        <span className="journal-list-relations" aria-label={JOURNAL_COPY.relatedListLabel(entry.relatedItems.map((item) => item.label))}>
                          <Link2 aria-hidden="true" />
                          {visibleRelated.map((item) => <span key={`${item.kind}-${item.id}`}>{item.label}</span>)}
                          {hiddenRelatedCount ? <span>{JOURNAL_COPY.relatedOverflow(hiddenRelatedCount)}</span> : null}
                        </span>
                      ) : null}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="journal-empty">
          <BookHeart aria-hidden="true" />
          <h3>{JOURNAL_COPY.emptyTitle}</h3>
          <p>{JOURNAL_COPY.emptyDescription}</p>
        </div>
      )}
    </>
  );
}
