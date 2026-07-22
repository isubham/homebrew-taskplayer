import { useMemo } from "react";
import _ from "lodash";
import { LIFE_AREAS } from "../utils.jsx";
import { SIDEBAR_COPY, SIDEBAR_UNSORTED_KEY } from "../constants.jsx";

export function useSidebarSections(state) {
  return useMemo(() => {
    if (!state.S?.lists) return [];

    const byArea = _.groupBy(state.S.lists, (listItem) => listItem.lifeArea || "");
    const rankByArea = _.keyBy(state.S.lifeAreaPriorities || [], "areaKey");

    const orderedAreas = _.orderBy(
      _.map(LIFE_AREAS, (area, canonicalIndex) => ({ area, canonicalIndex })),
      [
        (entry) => rankByArea[entry.area.key]?.priorityRank ?? (entry.canonicalIndex + 1)
      ],
      ["asc"]
    );

    const sections = _.map(orderedAreas, (entry, priorityIndex) => {
      const area = entry.area;
      const items = byArea[area.key] || [];
      return {
        key: area.key,
        dropArea: area.key,
        label: area.label,
        color: area.color,
        items,
        priorityRank: priorityIndex + 1
      };
    });

    const untagged = byArea[""];
    if (untagged && untagged.length) {
      sections.push({
        key: SIDEBAR_UNSORTED_KEY,
        dropArea: SIDEBAR_UNSORTED_KEY,
        label: SIDEBAR_COPY.unsortedLabel,
        color: "var(--muted)",
        items: untagged,
        priorityRank: null
      });
    }
    
    return sections;
  }, [state.S?.lists, state.S?.lifeAreaPriorities]);
}
