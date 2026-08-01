import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  CloudOff,
  ExternalLink,
  HardDrive,
  Maximize2,
  Minimize2,
  RefreshCw,
} from "lucide-react";
import {
  LOCAL_NOTES_ALLOWED_LINK_PROTOCOLS,
  LOCAL_NOTES_COPY,
  LOCAL_NOTES_ICON_SIZES,
  LOCAL_NOTES_MODES,
} from "../constants";
import { useLocalNote } from "../hooks/use-local-note";
import { useMarkdownImages } from "../hooks/use-markdown-images";
import { MarkdownEditor } from "./markdown-editor";
import { LocalStorageRequired } from "./local-storage-required";
import "./local-notes.css";

const { invoke } = window.__TAURI__.core;

type LocalNotePanelProps = {
  taskId: string;
  maximized: boolean;
  onMaximizedChange: (maximized: boolean) => void;
};

type LocalNotesMode = typeof LOCAL_NOTES_MODES[keyof typeof LOCAL_NOTES_MODES];

const canOpenLink = (href: string) => {
  try {
    const protocol = new URL(href).protocol;
    return LOCAL_NOTES_ALLOWED_LINK_PROTOCOLS.some((allowed) => allowed === protocol);
  } catch {
    return false;
  }
};

export function LocalNotePanel({
  taskId,
  maximized,
  onMaximizedChange,
}: LocalNotePanelProps) {
  const [mode, setMode] = useState<LocalNotesMode>(LOCAL_NOTES_MODES.write);
  const { pendingImages, onPasteImage } = useMarkdownImages();
  const note = useLocalNote(taskId, { pendingImages });
  const document = note.document;

  const preview = (
    <div className="local-notes-preview">
      {note.body ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          skipHtml
          components={{
            img: ({ alt }) => <span className="local-notes-blocked-image">{LOCAL_NOTES_COPY.remoteImageLabel(alt)}</span>,
            a: ({ href, children }) => canOpenLink(href || "") ? (
              <button type="button" className="local-notes-link" onClick={() => void invoke("open_url", { url: href })}>
                {children}
              </button>
            ) : <span>{children}</span>,
          }}
        >
          {note.body}
        </ReactMarkdown>
      ) : <span className="local-notes-empty">{LOCAL_NOTES_COPY.emptyPreview}</span>}
    </div>
  );

  return (
    <section className="local-notes-panel">
      <div className="local-notes-heading">
        <div>
          <h4>{LOCAL_NOTES_COPY.heading}</h4>
          <span className="local-notes-badge"><CloudOff size={LOCAL_NOTES_ICON_SIZES.badge} />{LOCAL_NOTES_COPY.noCloudBadge}</span>
        </div>
        <div className="local-notes-heading-actions">
          <button
            type="button"
            className={mode === LOCAL_NOTES_MODES.write ? "sel" : ""}
            onClick={() => setMode(LOCAL_NOTES_MODES.write)}
          >
            {LOCAL_NOTES_COPY.writeMode}
          </button>
          <button
            type="button"
            className={mode === LOCAL_NOTES_MODES.preview ? "sel" : ""}
            onClick={() => setMode(LOCAL_NOTES_MODES.preview)}
          >
            {LOCAL_NOTES_COPY.previewMode}
          </button>
          <button
            type="button"
            className="local-notes-maximize"
            title={maximized ? LOCAL_NOTES_COPY.restore : LOCAL_NOTES_COPY.maximize}
            aria-label={maximized ? LOCAL_NOTES_COPY.restore : LOCAL_NOTES_COPY.maximize}
            aria-pressed={maximized}
            onClick={() => onMaximizedChange(!maximized)}
          >
            {maximized
              ? <Minimize2 size={LOCAL_NOTES_ICON_SIZES.maximize} />
              : <Maximize2 size={LOCAL_NOTES_ICON_SIZES.maximize} />}
          </button>
        </div>
      </div>

      {note.conflict ? (
        <div className="local-notes-conflict">
          <RefreshCw size={LOCAL_NOTES_ICON_SIZES.toolbar} />
          <span>{LOCAL_NOTES_COPY.conflictMessage}</span>
          <button type="button" onClick={note.reloadExternal}>{LOCAL_NOTES_COPY.reloadExternal}</button>
          <button type="button" onClick={() => void note.forceSave()}>{LOCAL_NOTES_COPY.keepMine}</button>
        </div>
      ) : null}

      {!document ? <div className="local-notes-unavailable">{LOCAL_NOTES_COPY.savingStatus}</div>
        : !document.enabled ? <LocalStorageRequired />
          : !document.available ? <LocalStorageRequired unavailable />
            : mode === LOCAL_NOTES_MODES.write ? (
              <>
                <MarkdownEditor
                  value={note.body}
                  placeholder={LOCAL_NOTES_COPY.editorPlaceholder}
                  vimMode={document.vimMode}
                  onChange={note.setBody}
                  onBlur={() => void note.saveNow()}
                  onPasteImage={onPasteImage}
                />
                {pendingImages.filter((image) => note.body.includes(image.token)).map((image) => <img key={image.token} src={image.previewUrl} alt="Pasted Image" />)}
              </>
            ) : preview}

      <div className="local-notes-status">
        <span><HardDrive size={LOCAL_NOTES_ICON_SIZES.badge} />{note.status}</span>
        {document?.absolutePath ? (
          <span className="local-notes-path" title={LOCAL_NOTES_COPY.fullPathLabel}>
            {document.absolutePath}
          </span>
        ) : null}
        {document?.enabled && document.available ? (
          <button type="button" onClick={() => void note.openExternally()}>
            <ExternalLink size={LOCAL_NOTES_ICON_SIZES.badge} />{LOCAL_NOTES_COPY.openExternally}
          </button>
        ) : null}
      </div>
    </section>
  );
}
