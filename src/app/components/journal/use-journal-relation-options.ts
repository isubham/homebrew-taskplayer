import { useMemo } from "react";
import type { JournalRelatedItem } from "../../bindings";
import {
  JOURNAL_RELATED_CONTEXT_SEPARATOR,
  JOURNAL_RELATED_KIND_LABELS,
  JOURNAL_RELATED_KINDS,
} from "../../constants";
import { useCore } from "../../context/CoreProvider";
import { LIFE_AREAS } from "../../utils";

export type JournalRelationOption = JournalRelatedItem & {
  detail: string;
};

export function useJournalRelationOptions() {
  const { S } = useCore();

  return useMemo(() => {
    if (!S) return [];
    const listNames = new Map(S.lists.map((list) => [list.id, list.name]));
    const areaNames = new Map(LIFE_AREAS.map((area) => [area.key, area.label]));
    const listOptions: JournalRelationOption[] = S.lists.map((list) => ({
      kind: JOURNAL_RELATED_KINDS.list,
      id: list.id,
      label: list.name,
      detail: [
        JOURNAL_RELATED_KIND_LABELS.list,
        list.lifeArea ? areaNames.get(list.lifeArea) : null,
      ].filter(Boolean).join(JOURNAL_RELATED_CONTEXT_SEPARATOR),
    }));
    const albumOptions: JournalRelationOption[] = (S.albums || []).map((album) => ({
      kind: JOURNAL_RELATED_KINDS.album,
      id: album.id,
      label: album.name,
      detail: [
        JOURNAL_RELATED_KIND_LABELS.album,
        listNames.get(album.listId),
      ].filter(Boolean).join(JOURNAL_RELATED_CONTEXT_SEPARATOR),
    }));
    const taskOptions: JournalRelationOption[] = S.tasks.map((task) => ({
      kind: JOURNAL_RELATED_KINDS.task,
      id: task.id,
      label: task.name,
      detail: [
        JOURNAL_RELATED_KIND_LABELS.task,
        listNames.get(task.listId),
      ].filter(Boolean).join(JOURNAL_RELATED_CONTEXT_SEPARATOR),
    }));
    return [...listOptions, ...albumOptions, ...taskOptions]
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [S]);
}
