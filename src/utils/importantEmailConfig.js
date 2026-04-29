const IMPORTANT_EMAIL_CONFIG_STORAGE_KEY = 'feedbackImportantEmailConfig'

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

export function normalizeImportantEmailRules(value) {
  const list = Array.isArray(value) ? value : []
  const seenEmails = new Set()

  return list
    .map((item) => {
      const email = normalizeEmail(item?.email)
      if (!email) return null

      return {
        email,
        style: String(item?.style || 'STAR').trim().toUpperCase() || 'STAR',
        note: String(item?.note || '').trim(),
        enabled: item?.enabled !== false,
      }
    })
    .filter((item) => {
      if (!item?.email) return false
      if (seenEmails.has(item.email)) return false
      seenEmails.add(item.email)
      return true
    })
}

export function readImportantEmailConfigCache() {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(IMPORTANT_EMAIL_CONFIG_STORAGE_KEY)
    if (!raw) return []
    return normalizeImportantEmailRules(JSON.parse(raw))
  } catch {
    return []
  }
}

export function writeImportantEmailConfigCache(value) {
  if (typeof window === 'undefined') return

  try {
    const normalized = normalizeImportantEmailRules(value)
    window.localStorage.setItem(IMPORTANT_EMAIL_CONFIG_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // noop
  }
}

export { IMPORTANT_EMAIL_CONFIG_STORAGE_KEY }
