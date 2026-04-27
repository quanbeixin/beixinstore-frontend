import DOMPurify from 'dompurify'

export const BUG_DESCRIPTION_TEMPLATE_TEXT = `【前置条件】

【复现步骤】

【实际结果】

【预期结果】
-`

const BUG_DESCRIPTION_ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  's',
  'del',
  'u',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'a',
  'img',
  'hr',
]

const BUG_DESCRIPTION_ALLOWED_ATTR = ['href', 'target', 'rel', 'src', 'alt', 'title', 'width', 'data-attachment-id']

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function isProbablyHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ''))
}

export function plainTextToRichTextHtml(value) {
  const normalized = String(value || '').replaceAll('\r\n', '\n').trim()
  if (!normalized) return '<p></p>'

  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  if (blocks.length === 0) return '<p></p>'

  return blocks
    .map((block) => `<p>${escapeHtml(block).replaceAll('\n', '<br>')}</p>`)
    .join('')
}

export function sanitizeBugDescriptionHtml(value, { keepPendingImages = false } = {}) {
  const allowedAttr = keepPendingImages
    ? [...BUG_DESCRIPTION_ALLOWED_ATTR, 'data-upload-token']
    : BUG_DESCRIPTION_ALLOWED_ATTR

  return DOMPurify.sanitize(String(value || ''), {
    ALLOWED_TAGS: BUG_DESCRIPTION_ALLOWED_TAGS,
    ALLOWED_ATTR: allowedAttr,
  })
}

function buildAttachmentUrlMap(attachments = [], { preferSignedUrl = true } = {}) {
  const attachmentMap = new Map()
  ;(Array.isArray(attachments) ? attachments : []).forEach((attachment) => {
    const attachmentId = Number(attachment?.id || 0)
    if (!attachmentId) return
    const signedUrl = String(attachment?.download_url || '').trim()
    const objectUrl = String(attachment?.object_url || '').trim()
    const nextSrc = preferSignedUrl ? signedUrl || objectUrl : objectUrl || signedUrl
    if (!nextSrc) return
    attachmentMap.set(attachmentId, nextSrc)
  })
  return attachmentMap
}

function buildDefaultBugDescriptionTemplateHtml() {
  return [
    '<p>【前置条件】</p>',
    '<p><br></p>',
    '<p>【复现步骤】</p>',
    '<p><br></p>',
    '<p>【实际结果】</p>',
    '<p><br></p>',
    '<p>【预期结果】</p>',
    '<p><br></p>',
    '<p>-</p>',
  ].join('')
}

export function buildBugDescriptionInitialHtml(initialValues = null) {
  const description = String(initialValues?.description || '').trim()
  if (description) {
    if (!isProbablyHtml(description)) {
      return plainTextToRichTextHtml(description)
    }
    return hydrateBugDescriptionAttachmentUrls(
      sanitizeBugDescriptionHtml(description, { keepPendingImages: true }),
      initialValues?.attachments || [],
    )
  }

  const reproduceSteps = String(initialValues?.reproduce_steps || '').trim()
  const actualResult = String(initialValues?.actual_result || '').trim()
  const expectedResult = String(initialValues?.expected_result || '').trim()
  const hasLegacyContent = reproduceSteps || actualResult || expectedResult
  if (!hasLegacyContent) {
    return sanitizeBugDescriptionHtml(buildDefaultBugDescriptionTemplateHtml(), { keepPendingImages: true })
  }

  return plainTextToRichTextHtml(`【前置条件】

【复现步骤】
${reproduceSteps}

【实际结果】
${actualResult}

【预期结果】
${expectedResult}
-`)
}

export function hasMeaningfulBugDescription(value) {
  const sanitized = sanitizeBugDescriptionHtml(value, { keepPendingImages: true })
  if (!sanitized) return false

  const container = document.createElement('div')
  container.innerHTML = sanitized
  const text = String(container.textContent || '').replace(/\u00A0/g, ' ').trim()
  if (text) return true
  return Boolean(container.querySelector('img'))
}

export function createPendingDescriptionImageToken() {
  return `bug-desc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function stripPendingDescriptionImages(html) {
  const container = document.createElement('div')
  container.innerHTML = sanitizeBugDescriptionHtml(html, { keepPendingImages: true })
  container.querySelectorAll('img[data-upload-token]').forEach((node) => node.remove())
  return sanitizeBugDescriptionHtml(container.innerHTML)
}

export function replacePendingDescriptionImages(
  html,
  tokenAttachmentMap = new Map(),
  blobAttachmentMap = new Map(),
) {
  const container = document.createElement('div')
  container.innerHTML = sanitizeBugDescriptionHtml(html, { keepPendingImages: true })

  container.querySelectorAll('img').forEach((node) => {
    const token = String(node.getAttribute('data-upload-token') || '').trim()
    const src = String(node.getAttribute('src') || '').trim()
    const attachmentByToken = token && tokenAttachmentMap instanceof Map ? tokenAttachmentMap.get(token) : null
    const attachmentByBlobSrc = src && blobAttachmentMap instanceof Map ? blobAttachmentMap.get(src) : null
    const attachment = attachmentByToken || attachmentByBlobSrc
    const nextSrc = String(attachment?.object_url || attachment?.download_url || '').trim()

    if (token) {
      if (!nextSrc) {
        node.remove()
        return
      }
      node.setAttribute('src', nextSrc)
      node.removeAttribute('data-upload-token')
      if (Number(attachment?.id || 0) > 0) {
        node.setAttribute('data-attachment-id', String(attachment.id))
      }
      return
    }

    // Fallback: 防止 blob 地址被写入数据库后在详情页失效导致裂图。
    if (src.startsWith('blob:')) {
      if (!nextSrc) {
        node.remove()
        return
      }
      node.setAttribute('src', nextSrc)
      if (Number(attachment?.id || 0) > 0) {
        node.setAttribute('data-attachment-id', String(attachment.id))
      }
    }
  })

  return sanitizeBugDescriptionHtml(container.innerHTML)
}

export function hydrateBugDescriptionAttachmentUrls(
  html,
  attachments = [],
  { preferSignedUrl = true } = {},
) {
  const container = document.createElement('div')
  container.innerHTML = sanitizeBugDescriptionHtml(html, { keepPendingImages: true })
  const attachmentUrlMap = buildAttachmentUrlMap(attachments, { preferSignedUrl })

  container.querySelectorAll('img[data-attachment-id]').forEach((node) => {
    const attachmentId = Number(node.getAttribute('data-attachment-id') || 0)
    if (!attachmentId) return
    const nextSrc = attachmentUrlMap.get(attachmentId)
    if (!nextSrc) return
    node.setAttribute('src', nextSrc)
  })

  return sanitizeBugDescriptionHtml(container.innerHTML, { keepPendingImages: true })
}
