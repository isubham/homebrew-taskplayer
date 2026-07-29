import { Link2, X } from "lucide-react";
import { useState } from "react";
import type { JournalRelatedItem } from "../../bindings";
import { JOURNAL_COPY, JOURNAL_MOODS } from "../../constants";
import { JournalRelationPicker } from "./journal-relation-picker";
import type { JournalRelationOption } from "./use-journal-relation-options";

type JournalSaveDialogProps = {
  saving: boolean;
  initialMood: string | null;
  initialRelatedItems: JournalRelatedItem[];
  relationOptions: JournalRelationOption[];
  onSave: (mood: string | null, relatedItems: JournalRelatedItem[]) => void;
  onCancel: () => void;
};

export function JournalSaveDialog(props: JournalSaveDialogProps) {
  const [mood, setMood] = useState<string | null>(props.initialMood);
  const [relatedItems, setRelatedItems] = useState(props.initialRelatedItems);
  const [showPicker, setShowPicker] = useState(false);
  const toggleRelated = (item: JournalRelatedItem) => {
    setRelatedItems((current) => current.some((candidate) => candidate.kind === item.kind && candidate.id === item.id)
      ? current.filter((candidate) => candidate.kind !== item.kind || candidate.id !== item.id)
      : [...current, item]);
  };

  return (
    <div className="overlay show journal-mood-overlay" role="presentation">
      <section className="modal journal-mood-dialog show" role="dialog" aria-modal="true" aria-labelledby="journal-mood-title">
        <header>
          <div><h3 id="journal-mood-title">{JOURNAL_COPY.saveDialogTitle}</h3><small>{JOURNAL_COPY.saveDialogHint}</small></div>
          <button type="button" onClick={props.onCancel} aria-label={JOURNAL_COPY.cancel}><X /></button>
        </header>
        <div className="journal-save-section-heading"><strong>{JOURNAL_COPY.moodTitle}</strong><small>{JOURNAL_COPY.moodHint}</small></div>
        <div className="journal-mood-options">
          {JOURNAL_MOODS.map((option) => (
            <button
              key={option.key}
              className={option.key === mood ? "sel" : ""}
              type="button"
              disabled={props.saving}
              aria-pressed={option.key === mood}
              onClick={() => setMood((current) => current === option.key ? null : option.key)}
            >
              <span>{option.emoji}</span>{option.label}
            </button>
          ))}
        </div>
        <div className="journal-save-section-heading"><strong>{JOURNAL_COPY.relatedTitle}</strong><small>{JOURNAL_COPY.relatedHint}</small></div>
        <div className="journal-related-selection">
          <button className="pill" type="button" aria-expanded={showPicker} onClick={() => setShowPicker((current) => !current)}>
            <Link2 aria-hidden="true" />{JOURNAL_COPY.relatedAction}
          </button>
          {relatedItems.map((item) => (
            <button key={`${item.kind}-${item.id}`} className="journal-related-chip" type="button" aria-label={JOURNAL_COPY.removeRelated(item.label)} onClick={() => toggleRelated(item)}>
              {item.label}<X aria-hidden="true" />
            </button>
          ))}
        </div>
        {showPicker ? <JournalRelationPicker options={props.relationOptions} selected={relatedItems} onToggle={toggleRelated} /> : null}
        <div className="journal-save-actions">
          <button className="pill primary journal-save-confirm" type="button" disabled={props.saving} onClick={() => props.onSave(mood, relatedItems)}>
            {props.saving ? JOURNAL_COPY.saving : JOURNAL_COPY.save}
          </button>
        </div>
      </section>
    </div>
  );
}
