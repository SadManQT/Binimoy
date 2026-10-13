import {
  ChatCircleText,
  ClipboardText,
  Coins,
  Flag,
  GlobeHemisphereWest,
  LockKey,
  MagnifyingGlass,
  Megaphone,
  Star,
  Storefront,
  Warning,
} from "@phosphor-icons/react/dist/ssr";

// The picture on a feature tile: one large icon for the thing, one small
// badge for what you do with it, on a flat colour. Decoration only; the
// tile's name is the text beside it.
const ART = {
  check: [Storefront, MagnifyingGlass],
  alerts: [Megaphone, Warning],
  reviews: [ChatCircleText, Star],
  report: [ClipboardText, Flag],
  deal: [LockKey, Coins],
  lookup: [GlobeHemisphereWest, MagnifyingGlass],
} as const;

export type ArtKey = keyof typeof ART;

export function FeatureArt({ kind }: { kind: ArtKey }) {
  const [Main, Badge] = ART[kind];
  return (
    <span className="art" data-art={kind} aria-hidden="true">
      <Main weight="duotone" />
      <span>
        <Badge weight="fill" />
      </span>
    </span>
  );
}
