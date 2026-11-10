/**
 * Links that come from outside the app (SDK results, explorer data) are only followed if they are plain http(s) URLs.
 * A `javascript:` or `data:` URL in an href would run code when clicked.
 */
export function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const u = new URL(value)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined
  } catch {
    return undefined
  }
}
