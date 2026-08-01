import { StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";

const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

class MarkdownImageWidget extends WidgetType {
  constructor(
    private readonly source: string,
    private readonly alt: string,
  ) {
    super();
  }

  eq(other: MarkdownImageWidget) {
    return other.source === this.source && other.alt === this.alt;
  }

  toDOM() {
    const container = document.createElement("span");
    container.className = "cm-markdown-image-preview";
    const image = document.createElement("img");
    image.src = this.source;
    image.alt = this.alt;
    image.loading = "lazy";
    container.append(image);
    return container;
  }
}

const buildImageDecorations = (
  state: EditorState,
  imagePreviews: ReadonlyMap<string, string>,
  fallbackAlt: string,
) => {
  const ranges: Range<Decoration>[] = [];
  const contents = state.doc.toString();
  for (const match of contents.matchAll(MARKDOWN_IMAGE_PATTERN)) {
    const markdownPath = match[2];
    const source = imagePreviews.get(markdownPath);
    if (!source || match.index === undefined) continue;
    const lineEnd = state.doc.lineAt(match.index).to;
    ranges.push(Decoration.widget({
      widget: new MarkdownImageWidget(source, match[1] || fallbackAlt),
      block: true,
      side: 1,
    }).range(lineEnd));
  }
  return Decoration.set(ranges, true);
};

export const markdownImagePreviews = (
  imagePreviews: ReadonlyMap<string, string>,
  fallbackAlt: string,
): Extension => StateField.define<DecorationSet>({
  create: (state) => buildImageDecorations(state, imagePreviews, fallbackAlt),
  update: (decorations, transaction) => transaction.docChanged
    ? buildImageDecorations(transaction.state, imagePreviews, fallbackAlt)
    : decorations,
  provide: (field) => EditorView.decorations.from(field),
});
