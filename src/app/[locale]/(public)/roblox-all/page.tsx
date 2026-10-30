import { ProgrammePage } from "@/components/roblox/programme-page";
import { programmePageMetadata } from "../roblox/card-metadata";

export const generateMetadata = programmePageMetadata;

export default function RobloxAllPage() {
  return <ProgrammePage format="all" />;
}
