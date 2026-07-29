import { Save, Trash2, X } from "lucide-react";
import { lazy, Suspense, type Dispatch, type SetStateAction } from "react";
import { JOURNAL_COPY, JOURNAL_PENDING_IMAGE_PREFIX } from "../../constants";

const MarkdownEditor = lazy(() => import("../markdown-editor").then((module) => ({
  default: module.MarkdownEditor,
})));

export type PendingJournalImage = {
  token: string;
  file: File;
  previewUrl: string;
};

type JournalEditorProps = {
  dateLabel: string;
  body: string;
  pendingImages: PendingJournalImage[];
  vimMode: boolean;
  onBodyChange: (body: string) => void;
  onPendingImagesChange: Dispatch<SetStateAction<PendingJournalImage[]>>;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
};

export function JournalEditor(props: JournalEditorProps) {
  const onPasteImage = (file: File, insertText: (text: string) => void) => {
    const token = `${JOURNAL_PENDING_IMAGE_PREFIX}${crypto.randomUUID()}`;
    insertText(`![](${token})`);
    props.onPendingImagesChange((current) => [
      ...current,
      { token, file, previewUrl: URL.createObjectURL(file) },
    ]);
  };

  return (
    <section className="journal-editor-screen">
      <header>
        <div><h1>{props.onDelete ? JOURNAL_COPY.editEntry : JOURNAL_COPY.newEntry}</h1><small>{props.dateLabel}</small></div>
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
          onPasteImage={onPasteImage}
        />
      </Suspense>
      {props.pendingImages.filter((image) => props.body.includes(image.token)).map((image) => <img key={image.token} src={image.previewUrl} alt={JOURNAL_COPY.pastedImageAlt} />)}
    </section>
  );
}
