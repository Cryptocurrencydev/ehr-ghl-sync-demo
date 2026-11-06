import { parsePhoneNumberFromString } from "libphonenumber-js";

export function normalisePhone(raw: unknown, defaultCountry: "US" = "US"): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const parsed = parsePhoneNumberFromString(String(raw), defaultCountry);
  return parsed?.isPossible() ? parsed.number : null;
}

export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
