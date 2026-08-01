import { useState, useCallback } from "react";
import { JOURNAL_PENDING_IMAGE_PREFIX } from "../constants";

export type PendingMarkdownImage = {
  token: string;
  file: File;
  previewUrl: string;
};

export function useMarkdownImages() {
  const [pendingImages, setPendingImages] = useState<PendingMarkdownImage[]>([]);

  const onPasteImage = useCallback((file: File, insertText: (text: string) => void) => {
    const token = `${JOURNAL_PENDING_IMAGE_PREFIX}${crypto.randomUUID()}`;
    insertText(`![](${token})`);
    setPendingImages((current) => [
      ...current,
      { token, file, previewUrl: URL.createObjectURL(file) },
    ]);
  }, []);

  const clearPendingImages = useCallback(() => {
    setPendingImages([]);
  }, []);

  return { pendingImages, setPendingImages, onPasteImage, clearPendingImages };
}
