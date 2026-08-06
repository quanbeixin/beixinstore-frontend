import JSZip from 'jszip'

const TEMPLATE_API_URL = import.meta.env.VITE_MATRIX_RESOURCE_TEMPLATE_API_URL
  || 'https://zuceqbnikiposrhfexvi.supabase.co/rest/v1/matrix_template?select=id%2Cresource%2Ccreated_at%2Cupdated_at&order=updated_at.desc&limit=1'
const TEMPLATE_API_KEY = import.meta.env.VITE_MATRIX_RESOURCE_TEMPLATE_API_KEY
  || 'sb_publishable_OaTnPYVYSizW5XzOXlcMGg_xVS6gJ1s'

const RESOURCE_SIZE_LIMIT = {
  svg: 21 * 1024,
  image: 700 * 1024,
}

const RESOURCE_DIRECTORIES = new Set(['image', 'svg', 'i18nImage', '水印'])

export async function isValidResourcePackage(file) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    return {
      success: false,
      message: '请选择有效的 ZIP 资源包',
    }
  }

  let files
  try {
    files = await readZipFiles(await file.arrayBuffer())
  } catch (error) {
    return {
      success: false,
      message: `资源包解析失败: ${error?.message || 'ZIP 文件无效或已损坏'}`,
    }
  }

  let templateResources
  try {
    templateResources = await getTemplateResources()
  } catch (error) {
    return {
      success: false,
      message: `资源模板获取失败: ${error?.message || '请稍后重试'}`,
    }
  }

  const filePaths = Object.keys(files).map(normalizePath)
  const sizeErrors = checkResourceSize(files)

  if (sizeErrors.length > 0) {
    return {
      success: false,
      message: `资源大小超限（${sizeErrors.length} 个）：\n${sizeErrors
        .map((error) => `- ${error}`)
        .join('\n')}`,
    }
  }

  const missingResources = templateResources
    .filter((resource) => !resource.isDiscarded)
    .filter((resource) => {
      const targetPath = getResourcePath(resource)

      if (resource.resourceType === 'i18nImage') {
        return !filePaths.some((path) => path.startsWith(`${targetPath}/`))
      }

      return !filePaths.includes(targetPath)
    })

  if (missingResources.length > 0) {
    return {
      success: false,
      message: `缺失 ${missingResources.length} 个资源：\n${missingResources
        .map((resource) => `- ${resource.resourceName}`)
        .join('\n')}`,
    }
  }

  return {
    success: true,
    message: '成功',
  }
}

async function readZipFiles(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer)
  const entries = Object.values(zip.files).filter((entry) => (
    !entry.dir && !isIgnoredZipPath(entry.name)
  ))

  const files = await Promise.all(entries.map(async (entry) => ([
    entry.name,
    await entry.async('uint8array'),
  ])))

  return Object.fromEntries(files)
}

function isIgnoredZipPath(filePath) {
  const parts = String(filePath || '').replaceAll('\\', '/').split('/')
  return parts.includes('__MACOSX') || parts.at(-1) === '.DS_Store'
}

function normalizePath(filePath) {
  const parts = String(filePath || '')
    .replaceAll('\\', '/')
    .split('/')
    .filter((part) => part && part !== '.')
  const resourceDirectoryIndex = parts.findIndex((part) => RESOURCE_DIRECTORIES.has(part))

  if (resourceDirectoryIndex === -1) {
    return parts.join('/')
  }

  return parts.slice(resourceDirectoryIndex).join('/')
}

function getResourcePath(resource) {
  if (resource.resourceType === 'i18nImage') {
    return `i18nImage/${resource.resourceName}`
  }

  const extensionMap = {
    image: 'png',
    svg: 'svg',
  }
  const extension = extensionMap[resource.resourceType]

  return `${resource.resourceType}/${resource.resourceName}.${extension}`
}

async function getTemplateResources() {
  const response = await fetch(TEMPLATE_API_URL, {
    method: 'GET',
    headers: {
      apikey: TEMPLATE_API_KEY,
      Authorization: `Bearer ${TEMPLATE_API_KEY}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`模板接口请求失败（${response.status}）`)
  }

  const rows = await response.json()
  const resources = rows?.[0]?.resource
  if (!Array.isArray(resources)) {
    throw new Error('模板数据为空或格式不正确')
  }

  return resources.filter((resource) => (
    !['css', 'json', 'text'].includes(resource.resourceType)
  ))
}

function checkResourceSize(files) {
  const errors = []

  Object.entries(files).forEach(([path, data]) => {
    const normalizedPath = normalizePath(path)

    if (normalizedPath.startsWith('image/') && normalizedPath.endsWith('.png')) {
      if (data.byteLength > RESOURCE_SIZE_LIMIT.image) {
        errors.push(`${normalizedPath}(${formatSize(data.byteLength)} > 700KB)`)
      }
    }

   /*  if (normalizedPath.startsWith('svg/') && normalizedPath.endsWith('.svg')) {
      if (data.byteLength > RESOURCE_SIZE_LIMIT.svg) {
        errors.push(`${normalizedPath}(${formatSize(data.byteLength)} > 21KB)`)
      }
    } */
  })

  return errors
}

function formatSize(size) {
  if (size < 1024) {
    return `${size}B`
  }

  return `${(size / 1024).toFixed(1)}KB`
}
