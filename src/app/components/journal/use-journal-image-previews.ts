import { useEffect, useMemo } from "react";
import type { JournalAsset } from "../../bindings";
import type { PendingMarkdownImage } from "../../hooks/use-markdown-images";

export function useJournalImagePreviews(
  assets: JournalAsset[],
  pendingImages: PendingMarkdownImage[],
) {
  const savedPreviews = useMemo(() => new Map(assets.map((asset) => [
    asset.markdownPath,
    URL.createObjectURL(new Blob([new Uint8Array(asset.bytes)], { type: asset.mimeType })),
  ])), [assets]);

  useEffect(() => () => {
    savedPreviews.forEach((url) => URL.revokeObjectURL(url));
  }, [savedPreviews]);

  return useMemo(() => {
    const previews = new Map(savedPreviews);
    pendingImages.forEach((image) => previews.set(image.token, image.previewUrl));
    return previews;
  }, [pendingImages, savedPreviews]);
}
