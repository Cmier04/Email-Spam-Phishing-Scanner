/** Show only the first given name in the dashboard welcome message. */
export function greetingName(displayName?: string | null, email?: string | null): string {
  const providedName = displayName?.trim().split(/\s+/)[0];
  if (providedName) return providedName.replace(/[,;:]+$/, "");
  const accountName = email?.split("@")[0]?.split(/[._-]/)[0];
  return accountName || "there";
}
