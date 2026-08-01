import { useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link2, Pencil } from "lucide-react";
import type { JournalDocument } from "../../bindings";
import { JOURNAL_COPY, JOURNAL_MOODS, LOCAL_NOTES_ALLOWED_LINK_PROTOCOLS } from "../../constants";

const { invoke } = window.__TAURI__.core;

type JournalViewerProps = {
  document: JournalDocument;
  onEdit: () => void;
};

export function JournalViewer({ document, onEdit }: JournalViewerProps) {
  const assetUrls = useMemo(() => new Map(document.assets.map((asset) => [
    asset.markdownPath,
    URL.createObjectURL(new Blob([new Uint8Array(asset.bytes)], { type: asset.mimeType })),
  ])), [document.assets]);

  useEffect(() => () => assetUrls.forEach((url) => URL.revokeObjectURL(url)), [assetUrls]);

  const mood = JOURNAL_MOODS.find((candidate) => candidate.key === document.mood);
  const bodyWithoutTitle = useMemo(() => {
    const lines = document.body.split("\n");
    const titleLineIndex = lines.findIndex((line) => (
      line.trim().replace(/^#+/, "").trim() === document.title
    ));
    if (titleLineIndex === -1) return document.body;
    return lines.filter((_, index) => index !== titleLineIndex).join("\n").trimStart();
  }, [document.body, document.title]);
  const date = new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  }).format(new Date(`${document.date}T00:00:00Z`));

  return (
    <article className="journal-viewer">
      <div className="journal-viewer-meta">
        <span className="journal-viewer-mood" aria-label={mood?.label || JOURNAL_COPY.noMoodLabel}>{mood?.emoji || "—"}</span>
        <time dateTime={document.date}>{date}</time>
        {document.relatedItems.map((item) => (
          <span className="journal-related-label" key={`${item.kind}-${item.id}`}><Link2 aria-hidden="true" />{item.label}</span>
        ))}
        <button className="journal-viewer-edit" type="button" onClick={onEdit} title={JOURNAL_COPY.edit} aria-label={JOURNAL_COPY.edit}><Pencil /></button>
      </div>
      <h1 className="journal-entry-title">{document.title}</h1>
      <div className="journal-viewer-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          skipHtml
          components={{
            img: ({ src, alt }) => {
              const localUrl = assetUrls.get(src || "");
              return localUrl ? <img src={localUrl} alt={alt || ""} /> : null;
            },
            a: ({ href, children }) => {
              const allowed = (() => {
                try {
                  return LOCAL_NOTES_ALLOWED_LINK_PROTOCOLS.some((protocol) => protocol === new URL(href || "").protocol);
                } catch {
                  return false;
                }
              })();
              return allowed
                ? <button className="journal-link" type="button" onClick={() => void invoke("open_url", { url: href })}>{children}</button>
                : <span>{children}</span>;
            },
          }}
        >
          {bodyWithoutTitle}
        </ReactMarkdown>
      </div>
    </article>
  );
}
