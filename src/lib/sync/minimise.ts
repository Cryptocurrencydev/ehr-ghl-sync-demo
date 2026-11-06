// Allowlist, not blocklist: a field nobody has reviewed is dropped by default.
const MAX_LOGGED = 50;

function fieldNames(value: unknown, path: string): string[] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value);
    if (entries.length) return entries.flatMap(([k, v]) => fieldNames(v, `${path}.${k}`));
  }
  return [path];
}

/** Returns allowed fields, plus the names (never the values) of everything else. */
export function minimise(raw: Record<string, unknown>, allowed: readonly string[]) {
  const kept: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (allowed.includes(key)) kept[key] = value;
    else dropped.push(...fieldNames(value, key));
  }
  const safeNames = dropped.map((n) => n.replace(/[^\w.-]/g, "_").slice(0, 64));
  return { kept, droppedFields: [...new Set(safeNames)].sort().slice(0, MAX_LOGGED) };
}
