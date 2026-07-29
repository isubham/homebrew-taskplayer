import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { drawSelection, EditorView, keymap, placeholder as editorPlaceholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { vim } from "@replit/codemirror-vim";
import "./markdown-editor.css";

type MarkdownEditorProps = {
  value: string;
  placeholder: string;
  vimMode: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
  className?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  onPasteImage?: (file: File, insertText: (text: string) => void) => void;
};

export function MarkdownEditor({
  value,
  placeholder,
  vimMode,
  onChange,
  onBlur,
  className = "",
  ariaLabel,
  autoFocus = false,
  onPasteImage,
}: MarkdownEditorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  const onPasteImageRef = useRef(onPasteImage);
  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;
  onPasteImageRef.current = onPasteImage;

  useEffect(() => {
    if (!rootRef.current) return;
    const view = new EditorView({
      parent: rootRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          ...(vimMode ? [vim()] : []),
          drawSelection(),
          history(),
          markdown(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          EditorView.lineWrapping,
          editorPlaceholder(placeholder),
          ...(ariaLabel ? [EditorView.contentAttributes.of({ "aria-label": ariaLabel })] : []),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            blur: () => {
              onBlurRef.current();
            },
            paste: (event, view) => {
              const item = Array.from(event.clipboardData?.items || [])
                .find((candidate) => candidate.type.startsWith("image/"));
              const file = item?.getAsFile();
              if (!file || !onPasteImageRef.current) return false;
              event.preventDefault();
              onPasteImageRef.current(file, (text) => {
                const selection = view.state.selection.main;
                view.dispatch({
                  changes: { from: selection.from, to: selection.to, insert: text },
                  selection: { anchor: selection.from + text.length },
                });
              });
              return true;
            },
          }),
        ],
      }),
    });
    viewRef.current = view;
    if (autoFocus) view.focus();
    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, [ariaLabel, autoFocus, placeholder, vimMode]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  return (
    <div className={`markdown-editor${className ? ` ${className}` : ""}`}>
      <div ref={rootRef} className="markdown-editor-codemirror" />
    </div>
  );
}
