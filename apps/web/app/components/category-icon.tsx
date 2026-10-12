import type { ShopCategory } from "@lp/db/community";
import {
  Coins,
  GameController,
  Gift,
  GlobeHemisphereWest,
  GraduationCap,
  Key,
  MonitorPlay,
  PaintBrushBroad,
  SquaresFour,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";

const ICONS = {
  game_topup: Coins,
  game_accounts: GameController,
  software: Key,
  subscriptions: MonitorPlay,
  gift_cards: Gift,
  digital_services: PaintBrushBroad,
  courses: GraduationCap,
  domains_hosting: GlobeHemisphereWest,
  social_accounts: UsersThree,
  other: SquaresFour,
} satisfies Record<ShopCategory, unknown>;

export function CategoryIcon({
  category,
  size = 24,
}: {
  category: ShopCategory;
  size?: number;
}) {
  const Icon = ICONS[category];
  return <Icon size={size} weight="duotone" aria-hidden="true" />;
}
