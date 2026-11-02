import { buildShareLink } from './share'

/** Share-safe link, or an empty string if the share base cannot be resolved. */
export async function buildShareLinkSafe(path: string): Promise<string> {
  try {
    return await buildShareLink(path)
  } catch {
    return ''
  }
}

/** Offer a text file for download from the browser. Nothing is uploaded anywhere. */
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
