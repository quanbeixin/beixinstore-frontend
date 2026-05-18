import JSZip from 'jszip'
import {
  createBugAttachmentApi,
  createBugCommentAttachmentApi,
  getBugAttachmentPolicyApi,
  getBugCommentAttachmentPolicyApi,
  precheckBugAttachmentApi,
} from '../../../api/bug'

const OSS_UPLOAD_TIMEOUT_MS = 120000
const OSS_UPLOAD_MAX_ATTEMPTS = 2
const OSS_RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])
const DEFAULT_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
const ZIP_MIME_TYPE = 'application/zip'

function normalizeFile(fileLike) {
  if (!fileLike) return null
  if (fileLike instanceof File) return fileLike
  if (fileLike.originFileObj instanceof File) return fileLike.originFileObj
  return null
}

function getFileExt(fileName = '') {
  const text = String(fileName || '')
  const dotIndex = text.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex >= text.length - 1) return ''
  return text.slice(dotIndex + 1).slice(0, 50)
}

function splitFileName(fileName = '') {
  const text = String(fileName || '').trim()
  if (!text) return { baseName: 'file', extName: '' }
  const dotIndex = text.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex >= text.length - 1) {
    return { baseName: text || 'file', extName: '' }
  }
  return {
    baseName: text.slice(0, dotIndex) || 'file',
    extName: text.slice(dotIndex + 1),
  }
}

function formatLimitMb(maxBytes = DEFAULT_MAX_FILE_SIZE_BYTES) {
  const normalized = Number(maxBytes || 0)
  if (!Number.isFinite(normalized) || normalized <= 0) return 5
  return Math.max(1, Math.ceil(normalized / 1024 / 1024))
}

function buildFileTooLargeMessage(fileName, maxBytes) {
  return `${fileName || '文件'}超过大小限制（${formatLimitMb(maxBytes)}MB），请压缩后再上传`
}

async function compressFileToZip(file) {
  const normalizedFile = normalizeFile(file)
  if (!normalizedFile) throw new Error('附件文件无效')

  const zip = new JSZip()
  zip.file(normalizedFile.name || 'file', normalizedFile)
  const zippedBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  })
  const { baseName } = splitFileName(normalizedFile.name || 'file')
  const zipFileName = `${baseName || 'file'}.zip`
  return new File([zippedBlob], zipFileName, {
    type: ZIP_MIME_TYPE,
    lastModified: Date.now(),
  })
}

export async function prepareFileForUpload(fileLike, maxFileSize = DEFAULT_MAX_FILE_SIZE_BYTES) {
  const file = normalizeFile(fileLike)
  if (!file) throw new Error('附件文件无效')

  const normalizedLimit = Number(maxFileSize || 0)
  if (!Number.isFinite(normalizedLimit) || normalizedLimit <= 0 || Number(file.size || 0) <= normalizedLimit) {
    return {
      uploadFile: file,
      transformed: false,
      sourceFile: file,
    }
  }

  const zippedFile = await compressFileToZip(file)
  if (Number(zippedFile.size || 0) > normalizedLimit) {
    throw new Error(buildFileTooLargeMessage(file.name, normalizedLimit))
  }

  return {
    uploadFile: zippedFile,
    transformed: true,
    sourceFile: file,
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function buildUploadFormData(policy = {}, file = null) {
  const formData = new FormData()
  Object.entries(policy.fields || {}).forEach(([key, value]) => {
    formData.append(key, value)
  })
  formData.append('file', file)
  return formData
}

function isRetryableUploadError(error) {
  if (!error) return false
  const errorName = String(error?.name || '').trim()
  if (errorName === 'AbortError') return true
  const message = String(error?.message || '').toLowerCase()
  return (
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('load failed') ||
    message.includes('timeout')
  )
}

async function uploadToOssWithRetry({ host, policy, file, fileName = '文件' }) {
  let lastError = null
  for (let attempt = 1; attempt <= OSS_UPLOAD_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      controller.abort()
    }, OSS_UPLOAD_TIMEOUT_MS)
    try {
      const uploadRes = await fetch(host, {
        method: 'POST',
        body: buildUploadFormData(policy, file),
        signal: controller.signal,
      })
      if (uploadRes.ok) return

      const uploadText = await uploadRes.text().catch(() => '')
      const retryable = OSS_RETRYABLE_STATUS.has(Number(uploadRes.status || 0))
      const uploadError = new Error(uploadText || `上传失败(${uploadRes.status}): ${fileName}`)
      lastError = uploadError
      if (retryable && attempt < OSS_UPLOAD_MAX_ATTEMPTS) {
        await sleep(500 * attempt)
        continue
      }
      throw uploadError
    } catch (error) {
      lastError = error
      if (isRetryableUploadError(error) && attempt < OSS_UPLOAD_MAX_ATTEMPTS) {
        await sleep(500 * attempt)
        continue
      }
      if (String(error?.name || '').trim() === 'AbortError') {
        throw new Error(`上传超时: ${fileName}`)
      }
      throw error
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  if (String(lastError?.name || '').trim() === 'AbortError') {
    throw new Error(`上传超时: ${fileName}`)
  }
  throw lastError || new Error(`上传失败: ${fileName}`)
}

export function buildAttachmentFileSignature(fileLike) {
  const file = normalizeFile(fileLike)
  return `${file?.name || ''}|${file?.size || 0}|${file?.type || ''}`
}

export async function precheckDraftAttachment(fileLike) {
  const file = normalizeFile(fileLike)
  if (!file) {
    throw new Error('附件文件无效')
  }

  const prepared = await prepareFileForUpload(file, DEFAULT_MAX_FILE_SIZE_BYTES)
  const uploadFile = prepared.uploadFile

  const result = await precheckBugAttachmentApi({
    file_name: uploadFile?.name || 'file',
    mime_type: uploadFile?.type || '',
    file_size: uploadFile?.size || 0,
  })
  if (!result?.success) {
    throw new Error(result?.message || `${uploadFile?.name || file?.name || '文件'}预检失败`)
  }
  return {
    ...(result.data || {}),
    upload_file: uploadFile,
    transformed: Boolean(prepared?.transformed),
    source_file: file,
  }
}

async function uploadSingleAttachment({ getPolicy, register }, file) {
  const sourceFile = normalizeFile(file)
  if (!sourceFile) {
    throw new Error('附件文件无效')
  }

  const policyRes = await getPolicy(sourceFile)
  if (!policyRes?.success) {
    throw new Error(policyRes?.message || `获取上传策略失败: ${sourceFile?.name || 'file'}`)
  }

  let policy = policyRes.data || {}
  const maxFileSize = Number(policy.max_file_size || DEFAULT_MAX_FILE_SIZE_BYTES)
  const prepared = await prepareFileForUpload(sourceFile, maxFileSize)
  let uploadFile = prepared.uploadFile

  if (prepared.transformed) {
    const zippedPolicyRes = await getPolicy(uploadFile)
    if (!zippedPolicyRes?.success) {
      throw new Error(zippedPolicyRes?.message || `获取上传策略失败: ${uploadFile?.name || 'file'}`)
    }
    policy = zippedPolicyRes.data || {}
  }

  if (Number(policy.max_file_size || 0) > 0 && Number(uploadFile?.size || 0) > Number(policy.max_file_size)) {
    throw new Error(buildFileTooLargeMessage(uploadFile?.name || sourceFile?.name, Number(policy.max_file_size || 0)))
  }

  await uploadToOssWithRetry({
    host: policy.host,
    policy,
    file: uploadFile,
    fileName: uploadFile?.name || sourceFile?.name || '文件',
  })

  const registerRes = await register(uploadFile, policy)
  if (!registerRes?.success) {
    throw new Error(registerRes?.message || `附件登记失败: ${uploadFile?.name || sourceFile?.name || '文件'}`)
  }
  return registerRes?.data || null
}

async function uploadAttachmentBatch({ files = [], getPolicy, register }) {
  const normalizedFiles = (files || []).map(normalizeFile).filter(Boolean)
  let successCount = 0
  const failures = []
  const successes = []

  for (const file of normalizedFiles) {
    try {
      // Keep sequence stable to simplify policy and error feedback.
      const attachment = await uploadSingleAttachment({ getPolicy, register }, file)
      successCount += 1
      successes.push({
        file,
        signature: buildAttachmentFileSignature(file),
        attachment,
      })
    } catch (error) {
      failures.push({
        fileName: file?.name || '未命名文件',
        signature: buildAttachmentFileSignature(file),
        reason: error?.message || '上传失败',
      })
    }
  }

  return {
    total: normalizedFiles.length,
    successCount,
    successes,
    failures,
  }
}

export async function uploadBugAttachmentFile(bugId, fileLike) {
  const sourceFile = normalizeFile(fileLike)
  if (!sourceFile) {
    throw new Error('附件文件无效')
  }

  const policyRes = await getBugAttachmentPolicyApi(bugId, {
    file_name: sourceFile?.name || 'file',
    mime_type: sourceFile?.type || '',
    file_size: sourceFile?.size || 0,
  })
  if (!policyRes?.success) {
    throw new Error(policyRes?.message || `获取上传策略失败: ${sourceFile?.name || 'file'}`)
  }

  let policy = policyRes.data || {}
  const maxFileSize = Number(policy.max_file_size || DEFAULT_MAX_FILE_SIZE_BYTES)
  const prepared = await prepareFileForUpload(sourceFile, maxFileSize)
  let uploadFile = prepared.uploadFile

  if (prepared.transformed) {
    const zippedPolicyRes = await getBugAttachmentPolicyApi(bugId, {
      file_name: uploadFile?.name || 'file',
      mime_type: uploadFile?.type || '',
      file_size: uploadFile?.size || 0,
    })
    if (!zippedPolicyRes?.success) {
      throw new Error(zippedPolicyRes?.message || `获取上传策略失败: ${uploadFile?.name || 'file'}`)
    }
    policy = zippedPolicyRes.data || {}
  }

  if (Number(policy.max_file_size || 0) > 0 && Number(uploadFile?.size || 0) > Number(policy.max_file_size)) {
    throw new Error(buildFileTooLargeMessage(uploadFile?.name || sourceFile?.name, Number(policy.max_file_size || 0)))
  }

  await uploadToOssWithRetry({
    host: policy.host,
    policy,
    file: uploadFile,
    fileName: uploadFile?.name || sourceFile?.name || '文件',
  })

  const registerRes = await createBugAttachmentApi(bugId, {
    file_name: uploadFile?.name || 'file',
    file_ext: getFileExt(uploadFile?.name || ''),
    file_size: uploadFile?.size || 0,
    mime_type: uploadFile?.type || '',
    storage_provider: 'ALIYUN_OSS',
    bucket_name: policy.bucket_name,
    object_key: policy.object_key,
    object_url: policy.object_url || '',
  })
  if (!registerRes?.success) {
    throw new Error(registerRes?.message || `附件登记失败: ${uploadFile?.name || sourceFile?.name || '文件'}`)
  }
  return registerRes.data || null
}

export async function uploadDraftAttachments(bugId, files = []) {
  return uploadAttachmentBatch({
    files,
    getPolicy: (file) =>
      getBugAttachmentPolicyApi(bugId, {
        file_name: file?.name || 'file',
        mime_type: file?.type || '',
        file_size: file?.size || 0,
      }),
    register: (file, policy) =>
      createBugAttachmentApi(bugId, {
        file_name: file?.name || 'file',
        file_ext: getFileExt(file?.name || ''),
        file_size: file?.size || 0,
        mime_type: file?.type || '',
        storage_provider: 'ALIYUN_OSS',
        bucket_name: policy.bucket_name,
        object_key: policy.object_key,
        object_url: policy.object_url || '',
      }),
  })
}

export async function uploadCommentDraftAttachments(bugId, commentLogId, files = []) {
  return uploadAttachmentBatch({
    files,
    getPolicy: (file) =>
      getBugCommentAttachmentPolicyApi(bugId, commentLogId, {
        file_name: file?.name || 'file',
        mime_type: file?.type || '',
        file_size: file?.size || 0,
      }),
    register: (file, policy) =>
      createBugCommentAttachmentApi(bugId, commentLogId, {
        file_name: file?.name || 'file',
        file_ext: getFileExt(file?.name || ''),
        file_size: file?.size || 0,
        mime_type: file?.type || '',
        storage_provider: 'ALIYUN_OSS',
        bucket_name: policy.bucket_name,
        object_key: policy.object_key,
        object_url: policy.object_url || '',
      }),
  })
}
