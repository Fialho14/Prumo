import {
  BriefcaseBusiness,
  ChartNoAxesCombined,
  Coins,
  Gem,
  Globe2,
  House,
  Landmark,
  PiggyBank,
  ShieldCheck,
  Sparkles,
  Vault,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  wallet: WalletCards,
  shield: ShieldCheck,
  globe: Globe2,
  chart: ChartNoAxesCombined,
  gem: Gem,
  "piggy-bank": PiggyBank,
  landmark: Landmark,
  coins: Coins,
  briefcase: BriefcaseBusiness,
  home: House,
  vault: Vault,
  sparkles: Sparkles,
};

export function CategoryIcon({ icon, size = 15 }: { icon: string; size?: number }) {
  const Icon = ICONS[icon] ?? WalletCards;
  return <Icon aria-hidden="true" size={size} strokeWidth={1.85} />;
}
