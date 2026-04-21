import { PartyPopper, Repeat, School, Tent } from "lucide-react";
import type { ProductType } from "../_mock/data";

export const TYPE_ICON: Record<
  ProductType,
  React.ComponentType<{ className?: string }>
> = {
  "consumer-club": Repeat,
  "municipality-club": School,
  camp: Tent,
  event: PartyPopper,
};
