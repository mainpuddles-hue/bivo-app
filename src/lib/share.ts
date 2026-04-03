import { Platform, Share } from 'react-native'

/** Cross-platform share: Web Share API on web, native Share on iOS/Android */
export async function shareContent(data: { title?: string; text?: string; url?: string }): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: data.title, text: data.text, url: data.url })
        return true
      } catch {} // Intentional: user cancelled or share unavailable
    }
    // Clipboard fallback
    const copyText = data.url || data.text || ''
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(copyText)
        return true
      } catch {} // Intentional: clipboard access denied
    }
    return false
  }
  // Native
  try {
    const msg = data.url ? `${data.text ?? ''}\n\n${data.url}` : (data.text ?? '')
    await Share.share({ message: msg, title: data.title })
    return true
  } catch {} // Intentional: user cancelled share
  return false
}

/** Download content as a file on web, Share on native */
export async function downloadAsFile(content: string, filename: string, mimeType = 'application/json'): Promise<boolean> {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return true
  }
  try {
    await Share.share({ message: content })
    return true
  } catch {} // Intentional: user cancelled share
  return false
}
