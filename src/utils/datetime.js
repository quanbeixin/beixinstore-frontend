const BEIJING_TIME_ZONE = 'Asia/Shanghai'

const BEIJING_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: BEIJING_TIME_ZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const BEIJING_DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: BEIJING_TIME_ZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function partsToMap(parts) {
  return Object.fromEntries(parts.map((part) => [part.type, part.value]))
}

function formatDateFromDate(date) {
  const map = partsToMap(BEIJING_DATE_FORMATTER.formatToParts(date))
  return `${map.year}-${map.month}-${map.day}`
}

function formatDateTimeFromDate(date) {
  const map = partsToMap(BEIJING_DATE_TIME_FORMATTER.formatToParts(date))
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`
}

function normalizeInput(value) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value)
  if (typeof value === 'string') return value.trim()
  return String(value)
}

function isSqlDate(text) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text)
}

function isSqlDateTime(text) {
  return /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}/.test(text)
}

export function formatBeijingDate(value, placeholder = '-') {
  const input = normalizeInput(value)
  if (!input) return placeholder

  if (typeof input === 'string') {
    if (isSqlDate(input)) return input
    if (isSqlDateTime(input)) return input.slice(0, 10)

    const parsed = new Date(input)
    if (!Number.isNaN(parsed.getTime())) return formatDateFromDate(parsed)

    return input.slice(0, 10) || placeholder
  }

  if (Number.isNaN(input.getTime())) return placeholder
  return formatDateFromDate(input)
}

export function formatBeijingDateTime(value, placeholder = '-') {
  const input = normalizeInput(value)
  if (!input) return placeholder

  if (typeof input === 'string') {
    if (isSqlDateTime(input)) return input.slice(0, 19)
    if (isSqlDate(input)) return `${input} 00:00:00`

    const parsed = new Date(input)
    if (!Number.isNaN(parsed.getTime())) return formatDateTimeFromDate(parsed)

    return input
  }

  if (Number.isNaN(input.getTime())) return placeholder
  return formatDateTimeFromDate(input)
}

export function getBeijingTodayDateString() {
  return formatDateFromDate(new Date())
}

