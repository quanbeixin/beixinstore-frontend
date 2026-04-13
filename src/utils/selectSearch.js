import { pinyin } from 'pinyin-pro'

const SEARCH_INDEX_CACHE = new Map()

function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

function getOptionSearchText(option, labelKey = 'label') {
  if (!option || typeof option !== 'object') return ''

  const explicitSearchText = option.searchText
  if (typeof explicitSearchText === 'string' || typeof explicitSearchText === 'number') {
    return String(explicitSearchText)
  }

  const labelValue = option[labelKey]
  if (typeof labelValue === 'string' || typeof labelValue === 'number') {
    return String(labelValue)
  }

  const value = option.value
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }

  return ''
}

function buildSearchIndex(text) {
  const source = String(text || '')
  if (!source) {
    return {
      raw: '',
      fullPinyin: '',
      initials: '',
    }
  }

  const cached = SEARCH_INDEX_CACHE.get(source)
  if (cached) return cached

  const index = {
    raw: normalizeSearchText(source),
    fullPinyin: normalizeSearchText(
      pinyin(source, {
        toneType: 'none',
      }),
    ),
    initials: normalizeSearchText(
      pinyin(source, {
        toneType: 'none',
        pattern: 'first',
      }),
    ),
  }

  SEARCH_INDEX_CACHE.set(source, index)
  return index
}

export function pinyinSelectFilter(input, option, config = {}) {
  const keyword = normalizeSearchText(input)
  if (!keyword) return true

  const labelKey = config?.labelKey || 'label'
  const searchText = getOptionSearchText(option, labelKey)
  if (!searchText) return false

  const index = buildSearchIndex(searchText)
  return (
    index.raw.includes(keyword) ||
    index.fullPinyin.includes(keyword) ||
    index.initials.includes(keyword)
  )
}
