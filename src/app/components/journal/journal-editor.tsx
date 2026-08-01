import { Save, Trash2, X } from "lucide-react";
import { lazy, Suspense } from "react";
import { JOURNAL_COPY } from "../../constants";
import type { JournalAsset } from "../../bindings";
import type { PendingMarkdownImage } from "../../hooks/use-markdown-images";
import { useJournalImagePreviews } from "./use-journal-image-previews";

const MarkdownEditor = lazy(() => import("../markdown-editor").then((module) => ({
  default: module.MarkdownEditor,
})));

type JournalEditorProps = {
  dateLabel: string;
  body: string;
  assets: JournalAsset[];
  pendingImages: PendingMarkdownImage[];
  vimMode: boolean;
  onBodyChange: (body: string) => void;
  onPasteImage: (file: File, insertText: (text: string) => void) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
};

export function JournalEditor(props: JournalEditorProps) {
  const imagePreviews = useJournalImagePreviews(props.assets, props.pendingImages);

  return (
    <section className="journal-editor-screen">
      <header>
        <div>{props.onDelete ? null : <h1>{JOURNAL_COPY.newEntry}</h1>}<small>{props.dateLabel}</small></div>
        <div>
          {props.onDelete ? <button className="journal-delete" type="button" onClick={props.onDelete} title={JOURNAL_COPY.delete} aria-label={JOURNAL_COPY.delete}><Trash2 /></button> : null}
          <button type="button" onClick={props.onSave} disabled={!props.body.trim()} title={JOURNAL_COPY.save} aria-label={JOURNAL_COPY.save}><Save /></button>
          <button type="button" onClick={props.onCancel} title={JOURNAL_COPY.cancel} aria-label={JOURNAL_COPY.cancel}><X /></button>
        </div>
      </header>
      <Suspense fallback={<div className="markdown-editor-loading journal-markdown-editor" />}>
        <MarkdownEditor
          className="journal-markdown-editor"
          ariaLabel={JOURNAL_COPY.editorAriaLabel}
          autoFocus
          value={props.body}
          placeholder={JOURNAL_COPY.editorPlaceholder}
          vimMode={props.vimMode}
          onChange={props.onBodyChange}
          onBlur={() => undefined}
          onPasteImage={props.onPasteImage}
          imagePreviews={imagePreviews}
          imagePreviewAlt={JOURNAL_COPY.pastedImageAlt}
        />
      </Suspense>
    </section>
  );
}
