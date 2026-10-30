import { ProgrammePage } from "@/components/roblox/programme-page";
import { programmePageMetadata } from "./card-metadata";

export const generateMetadata = programmePageMetadata;

export default function RobloxPage() {
  return <ProgrammePage format="in_person" />;
}
