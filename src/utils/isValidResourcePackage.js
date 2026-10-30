import { unzipSync } from 'fflate'

const TEMPLATE_API_URL = 'https://zuceqbnikiposrhfexvi.supabase.co/rest/v1/matrix_resource_template_items?select=*&template_id=eq.83d81af0-9312-4454-9b1e-0282f7f8bb19&order=resource_key.asc'
const TEMPLATE_API_KEY = 'sb_publishable_OaTnPYVYSizW5XzOXlcMGg_xVS6gJ1s'
const RESOURCE_SIZE_LIMIT = { svg: 21 * 1024, image: 700 * 1024 }
const RESOURCE_DIRECTORIES = new Set(['image', 'svg', 'i18nImage', '水印'])

export async function isValidResourcePackage(file) {
  if (!file || typeof file.arrayBuffer !== 'function') return { success: false, message: '请选择有效的 ZIP 资源包' }

  let files
  try {
    const arrayBuffer = await file.arrayBuffer()
    files = unzipSync(new Uint8Array(arrayBuffer), {
      filter: (entry) => !entry.name.startsWith('__MACOSX') && !entry.name.endsWith('.DS_Store'),
    })
  } catch (error) {
    return { success: false, message: `资源包解析失败: ${error?.message || 'ZIP 文件无效或已损坏'}` }
  }

  let templateResources
  try {
    templateResources = await getTemplateResources()
  } catch (error) {
    return { success: false, message: `资源模板获取失败: ${error?.message || '请稍后重试'}` }
  }

  const filePaths = Object.keys(files).map(normalizePath)
  const sizeErrors = checkResourceSize(files)
  if (sizeErrors.length > 0) return { success: false, message: `资源大小超限: ${sizeErrors.join(', ')}` }

  const missingResources = templateResources
    .filter((resource) => !resource.isDiscarded)
    .filter((resource) => {
      const targetPath = getResourcePath(resource)
      return resource.resourceType === 'i18nImage'
        ? !filePaths.some((path) => path.startsWith(`${targetPath}/`))
        : !filePaths.includes(targetPath)
    })
  if (missingResources.length > 0) {
    return {
      success: false,
      message: `缺失 ${missingResources.length} 个资源：\n${missingResources
        .map((item) => `- ${item.resourceName}`)
        .join('\n')}`,
    }
  }
  return { success: true, message: '成功' }
}

function normalizePath(filePath) {
  const parts = String(filePath || '').replaceAll('\\', '/').split('/')
  const index = parts.findIndex((item) => RESOURCE_DIRECTORIES.has(item))
  return index === -1 ? parts.join('/') : parts.slice(index).join('/')
}

function getResourcePath(resource) {
  if (resource.resourceType === 'i18nImage') return `i18nImage/${resource.resourceName}`
  const extension = { image: 'png', svg: 'svg' }[resource.resourceType]
  return `${resource.resourceType}/${resource.resourceName}.${extension}`
}

async function getTemplateResources() {
  const response = await fetch(TEMPLATE_API_URL, {
    method: 'GET',
    headers: { apikey: TEMPLATE_API_KEY, 'Content-Type': 'application/json' },
  })
  if (!response.ok) throw new Error(`获取模板资源失败：${response.status}`)
  const rows = await response.json()
  return rows
    .filter((resource) => !['css', 'json', 'text'].includes(resource.resource_type))
    .map((resource) => ({
      id: resource.id,
      description: resource.description || '',
      isDiscarded: resource.status === 'deprecated',
      resourceName: resource.resource_key,
      resourceType: resource.resource_type,
    }))
}

function checkResourceSize(files) {
  const errors = []
  Object.entries(files).forEach(([path, data]) => {
    const normalizedPath = normalizePath(path)
    if (normalizedPath.startsWith('image/') && normalizedPath.endsWith('.png') && data.byteLength > RESOURCE_SIZE_LIMIT.image) {
      errors.push(`${normalizedPath}(${formatSize(data.byteLength)} > 700KB)`)
    }
    if (normalizedPath.startsWith('svg/') && normalizedPath.endsWith('.svg') && data.byteLength > RESOURCE_SIZE_LIMIT.svg) {
      errors.push(`${normalizedPath}(${formatSize(data.byteLength)} > 21KB)`)
    }
  })
  return errors
}

function formatSize(size) {
  if (size < 1024) return `${size}B`
  return `${(size / 1024).toFixed(1)}KB`
}
