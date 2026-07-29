import { TOPBAR_SEARCH_RESULT_KINDS } from "../constants";

export type TopbarSearchResultKind = typeof TOPBAR_SEARCH_RESULT_KINDS[keyof typeof TOPBAR_SEARCH_RESULT_KINDS];

export type TopbarSearchResult = {
  key: string;
  kind: TopbarSearchResultKind;
  id: string;
  label: string;
  meta: string;
  listId?: string;
  icon?: string;
};
