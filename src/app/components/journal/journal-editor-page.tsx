import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type JournalEditorPageProps = {
  children: ReactNode;
};

export function JournalEditorPage({ children }: JournalEditorPageProps) {
  return createPortal(
    <div className="journal-editor-page">{children}</div>,
    window.document.body,
  );
}
