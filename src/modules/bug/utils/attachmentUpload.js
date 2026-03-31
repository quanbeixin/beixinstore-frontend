import { createBugAttachmentApi, getBugAttachmentPolicyApi } from '../../../api/bug'

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

async function uploadSingleAttachment(bugId, file) {
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

  const formData = new FormData()
  Object.entries(policy.fields || {}).forEach(([key, value]) => {
    formData.append(key, value)
  })
  formData.append('file', file)

  const uploadRes = await fetch(policy.host, {
    method: 'POST',
    body: formData,
  })
  if (!uploadRes.ok) {
    throw new Error(`上传失败: ${file?.name || '文件'}`)
  }

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
}

export async function uploadDraftAttachments(bugId, files = []) {
  const normalizedFiles = (files || []).map(normalizeFile).filter(Boolean)
  let successCount = 0
  const failures = []

  for (const file of normalizedFiles) {
    try {
      // Keep sequence stable to simplify policy and error feedback.
      await uploadSingleAttachment(bugId, file)
      successCount += 1
    } catch (error) {
      failures.push({
        fileName: file?.name || '未命名文件',
        reason: error?.message || '上传失败',
      })
    }
  }

  return {
    total: normalizedFiles.length,
    successCount,
    failures,
  }
}
