/**
 * Splits a raw artist tag into individual artist names. Handles the common
 * "feat."/"ft."/"featuring" markers and separators (&, ,, x, vs, ;). Trims
 * noise and de-duplicates while preserving order (main artist first).
 *
 * Deliberately conservative: a lone "&" or "," splits, which can over-split a
 * few band names (e.g. "Earth, Wind & Fire"), but the alternative — feat.
 * duplicates flooding the artist list — is the bigger problem in a local
 * library.
 */
export function splitArtists(raw: string | undefined | null): string[] {
  if (!raw) return []
  let s = raw.replace(/\s*[([]?\s*(feat\.?|ft\.?|featuring|com)\s+/gi, ' & ')
  s = s.replace(/\s+(x|vs\.?|×)\s+/gi, ' & ').replace(/[;,]/g, ' & ')
  const parts = s
    .split(/\s*&\s*/)
    .map((p) => p.replace(/[)\]]+$/g, '').trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    const key = p.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      out.push(p)
    }
  }
  return out
}
