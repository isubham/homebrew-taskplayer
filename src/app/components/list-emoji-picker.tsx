import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { EMOJI_CATEGORIES, EMOJI_PICKER_COPY } from "../constants.jsx";

type ListEmojiPickerProps = {
  color: string;
  emoji: string;
  onChange: (emoji: string) => void;
};

export function ListEmojiPicker({ color, emoji, onChange }: ListEmojiPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedCategory = EMOJI_CATEGORIES.find((category) => category.emojis.includes(emoji));
  const [activeCategoryKey, setActiveCategoryKey] = useState(
    selectedCategory?.key ?? EMOJI_CATEGORIES[0].key,
  );
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (selectedCategory) setActiveCategoryKey(selectedCategory.key);
  }, [selectedCategory]);

  useEffect(() => {
    if (!isOpen) return;

    const closeFromOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key !== EMOJI_PICKER_COPY.escapeKey) return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [isOpen]);

  const activeIndex = EMOJI_CATEGORIES.findIndex(
    (category) => category.key === activeCategoryKey,
  );
  const activeCategory = EMOJI_CATEGORIES[activeIndex < 0 ? 0 : activeIndex];

  const changeCategory = (step: number) => {
    const nextIndex = (activeIndex + step + EMOJI_CATEGORIES.length) % EMOJI_CATEGORIES.length;
    setActiveCategoryKey(EMOJI_CATEGORIES[nextIndex].key);
  };

  const chooseEmoji = (nextEmoji: string) => {
    onChange(nextEmoji);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="emoji-picker-anchor" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="emoji-preview-button"
        style={{ background: `${color}22`, color }}
        title={EMOJI_PICKER_COPY.triggerTitle}
        aria-label={EMOJI_PICKER_COPY.triggerTitle}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span>{emoji}</span>
        <ChevronDown aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="emoji-picker-popover" role="dialog" aria-label={EMOJI_PICKER_COPY.dialogLabel}>
          <div className="emoji-cat-pager">
            <button type="button" className="emoji-cat-nav" onClick={() => changeCategory(-1)} title={EMOJI_PICKER_COPY.previousTitle} aria-label={EMOJI_PICKER_COPY.previousTitle}>
              <ChevronLeft aria-hidden="true" />
            </button>
            <span className="emoji-cat-label">{activeCategory.label}</span>
            <button type="button" className="emoji-cat-nav" onClick={() => changeCategory(1)} title={EMOJI_PICKER_COPY.nextTitle} aria-label={EMOJI_PICKER_COPY.nextTitle}>
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
          <div className="emoji-grid">
            {activeCategory.emojis.map((option) => (
              <button
                key={option}
                type="button"
                className={`emoji-opt${option === emoji ? " sel" : ""}`}
                aria-pressed={option === emoji}
                onClick={() => chooseEmoji(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
