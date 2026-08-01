import { useEffect, useState } from "react";
import { BookHeart, CloudOff, Link2, Plus } from "lucide-react";
import type { JournalAsset, JournalEntrySummary } from "../../bindings";
import { JOURNAL_COPY, JOURNAL_LIST_RELATED_LIMIT, JOURNAL_MOODS } from "../../constants";

type JournalListProps = {
  entries: JournalEntrySummary[];
  onCreate: () => void;
  onOpen: (id: string) => void;
};

const displayDate = (date: string) => new Intl.DateTimeFormat(undefined, {
  year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
}).format(new Date(`${date}T00:00:00Z`));
const displayTime = (createdAt: number | null) => createdAt
  ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(createdAt))
  : "";

function JournalThumbnail({ asset }: { asset: JournalAsset }) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(new Blob([new Uint8Array(asset.bytes)], { type: asset.mimeType }));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [asset]);
  return url ? <img src={url} alt="" className="journal-list-thumbnail" /> : null;
}

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
          <thead>
            <tr>
              <th aria-label={JOURNAL_COPY.imageColumnLabel} />
              <th>{JOURNAL_COPY.titleColumn}</th>
              <th>{JOURNAL_COPY.relatedColumn}</th>
              <th>{JOURNAL_COPY.dateColumn}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const visibleRelated = entry.relatedItems.slice(0, JOURNAL_LIST_RELATED_LIMIT);
              const hiddenRelatedCount = entry.relatedItems.length - visibleRelated.length;
              return (
                <tr key={entry.id} onClick={() => onOpen(entry.id)}>
                  <td className="journal-thumbnail-cell">
                    {entry.firstAsset ? <JournalThumbnail asset={entry.firstAsset} /> : null}
                  </td>
                  <td className="journal-title-cell">
                    <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(entry.id); }}>
                      <strong>{entry.title}</strong>
                      {entry.excerpt ? <small>{entry.excerpt}</small> : null}
                    </button>
                  </td>
                  <td className="journal-related-cell">
                    {visibleRelated.length > 0 ? (
                      <span className="journal-list-relations" aria-label={JOURNAL_COPY.relatedListLabel(entry.relatedItems.map((item) => item.label))}>
                        <Link2 aria-hidden="true" />
                        {visibleRelated.map((item) => <span key={`${item.kind}-${item.id}`}>{item.label}</span>)}
                        {hiddenRelatedCount ? <span>{JOURNAL_COPY.relatedOverflow(hiddenRelatedCount)}</span> : null}
                      </span>
                    ) : null}
                  </td>
                  <td className="journal-date-cell">
                    <time dateTime={entry.date}>{displayDate(entry.date)}</time>
                    <small>{displayTime(entry.createdAt)}</small>
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
