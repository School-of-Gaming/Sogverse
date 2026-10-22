import { clsx, type ClassValue } from "clsx";
import { mergeClasses } from "@sog/ui";

export function cn(...inputs: ClassValue[]) {
  return mergeClasses(clsx(inputs));
}
