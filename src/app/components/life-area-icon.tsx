import type { LucideIcon } from "lucide-react";
import {
  BriefcaseBusiness,
  HeartPulse,
  Inbox,
  Palette,
  Users,
  WalletCards,
} from "lucide-react";
import { LIFE_AREA_ICON_SIZE_PX } from "../constants";

const ICON_BY_LIFE_AREA: Record<string, LucideIcon> = {
  career: BriefcaseBusiness,
  health: HeartPulse,
  relationships: Users,
  finance: WalletCards,
  recreation: Palette,
};

export function LifeAreaIcon({ areaKey }: { areaKey: string }) {
  const Icon = ICON_BY_LIFE_AREA[areaKey] || Inbox;
  return <Icon size={LIFE_AREA_ICON_SIZE_PX} aria-hidden="true" />;
}
