/**
 * Coerce a repeated (`?k=a&k=b`) or comma-separated (`?k=a,b`) query param into a
 * trimmed, non-empty string array; leaves `undefined` when the param is absent so
 * "not provided" stays distinct from "provided empty".
 */
export const toStringArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null) return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return raw.map((entry) => String(entry).trim()).filter(Boolean);
};
