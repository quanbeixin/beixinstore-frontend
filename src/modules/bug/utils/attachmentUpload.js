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

  const result = await precheckBugAttachmentApi({
    file_name: file?.name || 'file',
    mime_type: file?.type || '',
    file_size: file?.size || 0,
  })
  if (!result?.success) {
    throw new Error(result?.message || `${file?.name || '文件'}预检失败`)
  }
  return result.data || {}
}

async function uploadSingleAttachment({ getPolicy, register }, file) {
  const policyRes = await getPolicy(file)
  if (!policyRes?.success) {
    throw new Error(policyRes?.message || `获取上传策略失败: ${file?.name || 'file'}`)
  }

  const policy = policyRes.data || {}
  if (Number(policy.max_file_size || 0) > 0 && Number(file?.size || 0) > Number(policy.max_file_size)) {
    throw new Error(`${file?.name || '文件'}超过大小限制`)
  }

  await uploadToOssWithRetry({
    host: policy.host,
    policy,
    file,
    fileName: file?.name || '文件',
  })

  const registerRes = await register(file, policy)
  if (!registerRes?.success) {
    throw new Error(registerRes?.message || `附件登记失败: ${file?.name || '文件'}`)
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
  const file = normalizeFile(fileLike)
  if (!file) {
    throw new Error('附件文件无效')
  }

  const policyRes = await getBugAttachmentPolicyApi(bugId, {
    file_name: file?.name || 'file',
    mime_type: file?.type || '',
    file_size: file?.size || 0,
  })
  if (!policyRes?.success) {
    throw new Error(policyRes?.message || `获取上传策略失败: ${file?.name || 'file'}`)
  }

  const policy = policyRes.data || {}
  if (Number(policy.max_file_size || 0) > 0 && Number(file?.size || 0) > Number(policy.max_file_size)) {
    throw new Error(`${file?.name || '文件'}超过大小限制`)
  }

  await uploadToOssWithRetry({
    host: policy.host,
    policy,
    file,
    fileName: file?.name || '文件',
  })

  const registerRes = await createBugAttachmentApi(bugId, {
    file_name: file?.name || 'file',
    file_ext: getFileExt(file?.name || ''),
    file_size: file?.size || 0,
    mime_type: file?.type || '',
    storage_provider: 'ALIYUN_OSS',
    bucket_name: policy.bucket_name,
    object_key: policy.object_key,
    object_url: policy.object_url || '',
  })
  if (!registerRes?.success) {
    throw new Error(registerRes?.message || `附件登记失败: ${file?.name || '文件'}`)
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
