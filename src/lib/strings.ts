export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/** Parse a comma-separated list of emails into a trimmed array. */
export function parseEmails(input: string): string[] {
  return input.split(",").map((e) => e.trim()).filter(Boolean);
}
