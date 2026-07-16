import {
  ArrowLeftOutlined,
  BellOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  DownloadOutlined,
  FileOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  Image,
  Input,
  Modal,
  Progress,
  Row,
  Skeleton,
  Select,
  Space,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getMatrixPackageApi,
  completeMatrixPackageProductionApi,
  getMatrixPackageProductionNodesApi,
  getMatrixPackageSideNotesApi,
  confirmMatrixPackageSideNoteApi,
  getMatrixPackageSideNoteUploadPolicyApi,
  remindMatrixPackageProductionNodeApi,
  remindMatrixPackageSideNoteApi,
  saveMatrixPackageSideNotesApi,
  updateMatrixPackageApi,
  updateMatrixPackageProductionNodeApi,
} from '../../api/matrixPackage'
import { getNotificationTemplateFilesApi } from '../../api/matrixPackageNotification'
import { getUsersApi } from '../../api/users'
import { hasPermission } from '../../utils/access'
import './ColdStandbyProductionDetailPage.css'

const { Text } = Typography
const DATA_SAFETY_TEMPLATE_KEYS = ['data_safety_file', 'data-safe-file', 'date-safe-file']
const PRODUCT_CONFIG_TEMPLATE_KEYS = ['product_config_link', 'product-config-link']

const NOTE_SECTIONS = [
  {
    type: 'DELIVERY',
    title: 'PUSH信息补充',
    placeholder: '记录投放前需要了解的账号限制、适配要求、计划使用场景等信息',
  },
  {
    type: 'DESIGN',
    title: '设计侧补充',
    placeholder: '记录设计素材、视觉规范、切图资源、动效要求等信息',
  },
  {
    type: 'OPERATION',
    title: '运营侧补充',
    placeholder: '记录可复用性、维护风险、后续观察点等信息',
  },
  {
    type: 'FRONTEND',
    title: '前端补充',
    placeholder: '记录前端实现、页面配置、交互限制、版本适配等信息',
  },
  {
    type: 'BACKEND',
    title: 'GP初始化配置信息',
    placeholder: '记录后端接口、服务配置、数据依赖、技术限制等信息',
  },
  {
    type: 'DEVOPS',
    title: '运维补充',
    placeholder: '记录部署配置、环境变量、构建打包、发布注意事项等信息',
  },
]

const SIDE_CHECK_SECTION_TYPES = NOTE_SECTIONS
  .filter((section) => section.type !== 'BACKEND')
  .map((section) => section.type)

const OPERATION_FIELDS = [
  { name: 'appOrigin', label: 'appOrigin', placeholder: '填写 appOrigin' },
  {
    name: 'contactEmail',
    label: '联系邮箱',
    placeholder: 'contact@example.com',
    tooltip: 'contact@域名',
  },
  { name: 'privacyPolicyUrl', label: '隐私政策网址', placeholder: 'https://...' },
  { name: 'termsUrl', label: '服务条款网址', placeholder: 'https://...' },
  { name: 'dataDeletionUrl', label: '数据删除说明网址', placeholder: 'https://...' },
  { name: 'officialEmail', label: '官方邮箱', placeholder: '填写官方邮箱' },
  { name: 'materialUrl', label: '运营提供物料地址链接', placeholder: 'https://...' },
  { name: 'feedbackSurveyUrl', label: '用户反馈问卷地址', placeholder: 'https://...' },
  { name: 'reportSurveyUrl', label: '举报问卷地址', placeholder: 'https://...' },
  { name: 'reviewAccount', label: '送审账号', placeholder: '填写送审账号' },
  { name: 'appName', label: '应用名称', placeholder: '填写应用名称' },
  { name: 'shortDescription', label: '简短说明', placeholder: '填写简短说明' },
  { name: 'fullDescription', label: '完整说明', placeholder: '填写完整说明', type: 'textarea', span: 24 },
]

const PUSH_FIELD_DEFINITIONS = [
  { key: 'appId', label: '个推Push APP ID' },
  { key: 'appKey', label: '个推PUSH APP KEY' },
  { key: 'appSecret', label: '个推APPSecret' },
  { key: 'masterSecret', label: '个推MasterSecret' },
]

const PUSH_ENV_SECTIONS = [
  {
    key: 'prod',
    title: '生产环境信息',
    fields: PUSH_FIELD_DEFINITIONS.map((field) => ({
      name: `prod${field.key[0].toUpperCase()}${field.key.slice(1)}`,
      label: field.label,
      placeholder: `填写生产环境${field.label}`,
    })),
  },
  {
    key: 'test',
    title: '测试环境信息',
    fields: PUSH_FIELD_DEFINITIONS.map((field) => ({
      name: `test${field.key[0].toUpperCase()}${field.key.slice(1)}`,
      label: field.label,
      placeholder: `填写测试环境${field.label}`,
    })),
  },
]

const PUSH_FIELDS = PUSH_ENV_SECTIONS.flatMap((section) => section.fields)

const DEVOPS_FIELDS = [
  {
    name: 'googleAuthClientId',
    label: '谷歌鉴权认证ClientId',
    placeholder: '填写谷歌鉴权认证 ClientId',
  },
  {
    name: 'googleAuthClientSecret',
    label: '谷歌鉴权认证ClientSecret',
    placeholder: '填写谷歌鉴权认证 ClientSecret',
  },
  {
    name: 'firebaseEmailAccount',
    label: 'Firebase邮箱账号',
    placeholder: '填写 Firebase 邮箱账号',
  },
  {
    name: 'googlePayPackageName',
    label: '谷歌支付包名',
    placeholder: '填写谷歌支付包名',
  },
  {
    name: 'googlePayCertificateUrl',
    label: '谷歌支付证书地址',
    placeholder: '填写谷歌支付证书地址',
  },
  {
    name: 'pushFcmFile',
    label: 'push-fcm文件',
    placeholder: '上传 push-fcm JSON 文件',
    kind: 'file',
    accept: '.json,application/json,text/json',
  },
  {
    name: 'googleServiceJsonFile',
    label: 'google-service.json文件',
    placeholder: '上传 google-service.json 文件',
    kind: 'file',
    accept: '.json,application/json,text/json',
  },
]

const DESIGN_UPLOAD_FIELDS = [
  { name: 'dynamicWatermarkImage', label: '动态水印图', placeholder: '上传动态水印图' },
  { name: 'emailLogoImage', label: '邮箱 logo 图', placeholder: '上传邮箱 logo 图' },
  { name: 'dynamicWatermarkBrandImage', label: '动态水印结尾品牌图', placeholder: '上传动态水印结尾品牌图' },
]

const DESIGN_FORM_FIELDS = [
  { name: 'designPreviewUrl', label: '设计稿预览地址', placeholder: '填写设计稿预览地址' },
]

const DESIGN_ATTACHMENT_FIELDS = [
  {
    name: 'designSliceDeliveryUrl',
    label: '设计资源切图交付',
    placeholder: '上传设计资源切图交付附件',
    kind: 'file',
  },
  {
    name: 'tokenDocUrl',
    label: 'TOKEN文档',
    placeholder: '上传 TOKEN 文档附件',
    kind: 'file',
  },
  {
    name: 'productFiveImagesZipPackage',
    label: '商品5图的压缩包',
    placeholder: '上传压缩包',
    accept: '.zip,.rar,.7z,.tar,.gz,application/zip,application/x-rar-compressed,application/x-7z-compressed',
    kind: 'file',
  },
]

const DESIGN_FIELDS = [...DESIGN_UPLOAD_FIELDS, ...DESIGN_FORM_FIELDS, ...DESIGN_ATTACHMENT_FIELDS]
const DESIGN_UPLOAD_MAX_FILE_SIZE = 50 * 1024 * 1024

const FRONTEND_BASE_FIELDS = [
  { name: 'appVersion', label: 'APP版本号', placeholder: '填写 APP 版本号' },
  { name: 'appConsoleUrl', label: 'APP后台地址', placeholder: 'https://play.google.com/console/...' },
]

const FRONTEND_FIELD_DEFINITIONS = [
  { key: 'sha1Fingerprint', label: 'sha1指纹' },
  { key: 'sha256Fingerprint', label: 'sha256指纹' },
]

const FRONTEND_ENV_SECTIONS = [
  {
    key: 'prod',
    title: '生产环境信息',
    fields: FRONTEND_FIELD_DEFINITIONS.map((field) => ({
      name: `prod${field.key[0].toUpperCase()}${field.key.slice(1)}`,
      label: field.label,
      placeholder: `填写生产环境${field.label}`,
    })),
  },
  {
    key: 'test',
    title: '测试环境信息',
    fields: FRONTEND_FIELD_DEFINITIONS.map((field) => ({
      name: `test${field.key[0].toUpperCase()}${field.key.slice(1)}`,
      label: field.label,
      placeholder: `填写测试环境${field.label}`,
    })),
  },
]

const FRONTEND_FIELDS = [...FRONTEND_BASE_FIELDS, ...FRONTEND_ENV_SECTIONS.flatMap((section) => section.fields)]

const BACKEND_FIELDS = []

const STRUCTURED_NOTE_FIELDS = {
  DELIVERY: PUSH_FIELDS,
  DESIGN: DESIGN_FIELDS,
  OPERATION: OPERATION_FIELDS,
  FRONTEND: FRONTEND_FIELDS,
  BACKEND: BACKEND_FIELDS,
  DEVOPS: DEVOPS_FIELDS,
}

const NODE_STATUS_META = {
  NOT_STARTED: { label: '未开始', color: 'default' },
  IN_PROGRESS: { label: '进行中', color: 'processing' },
  COMPLETED: { label: '已完成', color: 'success' },
  BLOCKED: { label: '阻塞', color: 'error' },
}

function parseCsvText(text = '') {
  const rows = []
  let currentRow = []
  let currentCell = ''
  let index = 0
  let inQuotes = false
  const normalizedText = String(text || '').replace(/^\ufeff/, '')

  while (index < normalizedText.length) {
    const char = normalizedText[index]

    if (inQuotes) {
      if (char === '"') {
        if (normalizedText[index + 1] === '"') {
          currentCell += '"'
          index += 2
          continue
        }
        inQuotes = false
        index += 1
        continue
      }

      currentCell += char
      index += 1
      continue
    }

    if (char === '"') {
      inQuotes = true
      index += 1
      continue
    }

    if (char === ',') {
      currentRow.push(currentCell)
      currentCell = ''
      index += 1
      continue
    }

    if (char === '\n') {
      currentRow.push(currentCell)
      rows.push(currentRow)
      currentRow = []
      currentCell = ''
      index += 1
      continue
    }

    if (char === '\r') {
      index += 1
      continue
    }

    currentCell += char
    index += 1
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell)
    rows.push(currentRow)
  }

  return rows
}

function stringifyCsvRows(rows = []) {
  const escapeCsvCell = (value) => {
    const text = String(value ?? '')
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`
    }
    return text
  }

  return `\ufeff${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n')}\n`
}

function normalizeTemplateKeyForMatch(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function findTemplateByKeys(rows = [], keys = []) {
  const expectedKeys = new Set((keys || []).map((item) => normalizeTemplateKeyForMatch(item)))
  return Array.isArray(rows)
    ? rows.find((item) => expectedKeys.has(normalizeTemplateKeyForMatch(item?.template_key || '')))
    : null
}

const OPERATION_NODE_REQUIRED_FIELDS = [
  { name: 'materialUrl', label: '运营提供物料地址链接', placeholder: 'https://...' },
  { name: 'appName', label: '应用名称', placeholder: '填写应用名称' },
  { name: 'shortDescription', label: '简短说明', placeholder: '填写简短说明' },
  { name: 'fullDescription', label: '完整说明', placeholder: '填写完整说明', textarea: true },
]

const FRONTEND_NODE_REQUIRED_FIELDS = FRONTEND_ENV_SECTIONS

function buildUserOption(user) {
  const name = user.real_name || user.username || `用户${user.id}`
  const department = String(user.department_name || '').trim()
  return {
    label: department ? `${name} / ${department}` : name,
    value: user.id,
    searchText: `${name} ${department} ${user.username || ''}`.toLowerCase(),
  }
}

function parseStructuredContent(content) {
  if (content && typeof content === 'object' && !Array.isArray(content)) return content
  const text = String(content || '').trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function serializeStructuredContent(value, fields) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const normalized = {}
  let hasContent = false
  for (const field of fields) {
    const raw = source[field.name]
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const attachment = {
        file_name: String(raw.file_name || '').trim(),
        file_size: Number(raw.file_size || 0) || null,
        mime_type: String(raw.mime_type || '').trim(),
        storage_provider: String(raw.storage_provider || raw.provider || '').trim(),
        bucket_name: String(raw.bucket_name || '').trim(),
        object_key: String(raw.object_key || '').trim(),
        object_url: String(raw.object_url || '').trim(),
        uploaded_at: raw.uploaded_at || null,
      }
      normalized[field.name] = attachment
      if (attachment.object_key || attachment.object_url || attachment.file_name) hasContent = true
      continue
    }
    const text = String(raw || '').trim()
    normalized[field.name] = text
    if (text) hasContent = true
  }
  return hasContent ? JSON.stringify(normalized) : ''
}

function getNoteReadableContent(note) {
  return String(note?.content || '').trim() ? note.content : note?.confirmed_content || ''
}

function getExistingNoteContent(notes, noteType) {
  const matched = notes.find((item) => item.note_type === noteType)
  return matched?.content || ''
}

function buildSideNoteOwnerValues(notes) {
  return NOTE_SECTIONS.reduce((acc, section) => {
    const matched = notes.find((item) => item.note_type === section.type)
    acc[section.type] = matched?.owner_user_id || null
    return acc
  }, {})
}

function buildSideNotePayload(values, existingNotes, ownerValues = {}) {
  const source = values && typeof values === 'object' && !Array.isArray(values) ? values : {}
  return NOTE_SECTIONS.map((section) => {
    const hasSectionValue = Object.prototype.hasOwnProperty.call(source, section.type)
    const ownerUserId = section.type === 'BACKEND' ? null : (ownerValues?.[section.type] || null)
    if (!hasSectionValue || source[section.type] === undefined) {
      return {
        note_type: section.type,
        content: getExistingNoteContent(existingNotes, section.type),
        owner_user_id: ownerUserId,
      }
    }
    return {
      note_type: section.type,
      owner_user_id: ownerUserId,
      content: STRUCTURED_NOTE_FIELDS[section.type]
        ? serializeStructuredContent(source[section.type], STRUCTURED_NOTE_FIELDS[section.type])
        : source[section.type] || '',
    }
  })
}

function buildNoteFormValues(notes) {
  const values = {}
  for (const section of NOTE_SECTIONS) {
    const matched = notes.find((item) => item.note_type === section.type)
    values[section.type] = STRUCTURED_NOTE_FIELDS[section.type]
      ? parseStructuredContent(getNoteReadableContent(matched))
      : getNoteReadableContent(matched)
  }
  return values
}

function hasNoteContent(notes, noteType) {
  const matched = notes.find((item) => item.note_type === noteType)
  const fields = STRUCTURED_NOTE_FIELDS[noteType]
  if (fields) {
    const parsed = parseStructuredContent(getNoteReadableContent(matched))
    if (fields.some((field) => {
      const value = parsed[field.name]
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Boolean(value.object_key || value.object_url || value.file_name)
      }
      return Boolean(String(value || '').trim())
    })) return true
  }
  return Boolean(String(getNoteReadableContent(matched)).trim())
}

function getSideNote(notes, noteType) {
  return notes.find((item) => item.note_type === noteType) || null
}

function getSideNoteCompletionPercent(notes, detail) {
  const requiredSections = NOTE_SECTIONS.filter((section) => SIDE_CHECK_SECTION_TYPES.includes(section.type))
  if (!requiredSections.length) return 0
  if (Array.isArray(notes) && notes.length > 0) {
    const confirmedCount = requiredSections.filter((section) => getSideNote(notes, section.type)?.is_confirmed).length
    return Math.round((confirmedCount / requiredSections.length) * 100)
  }
  const sideNotePercent = Number(detail?.side_note_completion_percent)
  return Number.isFinite(sideNotePercent) ? sideNotePercent : 0
}

function getNodeStatusMeta(statusCode) {
  return NODE_STATUS_META[statusCode] || NODE_STATUS_META.NOT_STARTED
}

function buildUploadFormData(policy = {}, file = null) {
  const formData = new FormData()
  Object.entries(policy.fields || {}).forEach(([key, value]) => {
    formData.append(key, value)
  })
  formData.append('file', file)
  return formData
}

function normalizeUploadValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  const text = String(value || '').trim()
  return text ? { object_url: text, file_name: text } : null
}

function DesignUploadField({ packageId, noteType = 'DESIGN', field, value, onChange, onUploaded, disabled }) {
  const normalized = normalizeUploadValue(value)
  const [uploading, setUploading] = useState(false)
  const [imageLoadFailed, setImageLoadFailed] = useState(false)
  const isFileField = field.kind === 'file'
  const imageUrl = normalized?.preview_url || normalized?.object_url || ''
  const downloadUrl = normalized?.download_url || normalized?.preview_url || normalized?.object_url || ''
  const fileList = normalized ? [{
    uid: normalized.object_key || normalized.object_url || normalized.file_name,
    name: normalized.file_name || normalized.object_key || normalized.object_url || field.label,
    status: 'done',
    url: normalized.object_url || undefined,
  }] : []

  useEffect(() => {
    setImageLoadFailed(false)
  }, [imageUrl])

  const handleUpload = async ({ file, onSuccess, onError }) => {
    try {
      if (file?.size > DESIGN_UPLOAD_MAX_FILE_SIZE) {
        throw new Error('文件大小不能超过 50MB，请压缩后再上传')
      }
      setUploading(true)
      const policyResult = await getMatrixPackageSideNoteUploadPolicyApi(packageId, {
        note_type: noteType,
        field_name: field.name,
        file_name: file?.name || 'file',
        file_size: file?.size || 0,
        mime_type: file?.type || '',
      })
      if (!policyResult?.success) {
        throw new Error(policyResult?.message || '获取上传策略失败')
      }
      const policy = policyResult.data || {}
      const uploadResponse = await fetch(policy.host, {
        method: 'POST',
        body: buildUploadFormData(policy, file),
      })
      if (!uploadResponse.ok) {
        const text = await uploadResponse.text().catch(() => '')
        throw new Error(text || `上传失败(${uploadResponse.status})`)
      }

      const nextValue = {
        file_name: file?.name || '',
        file_size: file?.size || null,
        mime_type: file?.type || '',
        storage_provider: policy.provider || 'ALIYUN_OSS',
        bucket_name: policy.bucket_name || '',
        object_key: policy.object_key || '',
        object_url: policy.object_url || '',
        preview_url: policy.preview_url || '',
        download_url: policy.download_url || '',
        uploaded_at: new Date().toISOString(),
      }
      onChange?.(nextValue)
      await Promise.resolve(onUploaded?.(field.name, nextValue))
      onSuccess?.(nextValue)
      message.success(`${field.label}已上传`)
    } catch (error) {
      onError?.(error)
      message.error(error?.message || `${field.label}上传失败`)
    } finally {
      setUploading(false)
    }
  }

  const uploadProps = {
    accept: field.accept || (isFileField ? undefined : 'image/*'),
    maxCount: 1,
    fileList,
    customRequest: handleUpload,
    disabled: disabled || uploading,
    showUploadList: false,
  }

  return (
    <div
      className={`cold-production-design-upload cold-production-design-upload-${field.name}${isFileField ? ' cold-production-design-upload-fileField' : ''}`}
    >
      <div className="cold-production-design-upload-head">
        <Text className="cold-production-design-upload-title">{field.label}</Text>
        <Space size={6}>
          <Upload {...uploadProps}>
            <Button size="small" icon={<UploadOutlined />} loading={uploading} disabled={disabled}>
              {normalized ? '重传' : '上传'}
            </Button>
          </Upload>
          {normalized ? (
            <Button
              size="small"
              type="text"
              icon={<DownloadOutlined />}
              disabled={!downloadUrl}
              onClick={() => window.open(downloadUrl, '_blank', 'noopener,noreferrer')}
            >
              下载
            </Button>
          ) : null}
          {normalized ? (
            <Button
              size="small"
              type="text"
              danger
              disabled={disabled || uploading}
              onClick={() => {
                onChange?.(null)
                onUploaded?.(field.name, null)
              }}
            >
              删除
            </Button>
          ) : null}
        </Space>
      </div>
      <div className="cold-production-design-upload-display">
        {isFileField && normalized ? (
          <div className="cold-production-design-file-display">
            <FileOutlined />
            <Text
              className="cold-production-design-file-name"
              title={normalized.file_name || normalized.object_key || field.label}
            >
              {normalized.file_name || normalized.object_key || field.label}
            </Text>
          </div>
        ) : imageUrl && !imageLoadFailed ? (
          <Image
            src={imageUrl}
            alt=""
            width="100%"
            height="100%"
            referrerPolicy="no-referrer"
            className="cold-production-design-upload-image"
            preview={{ mask: '预览' }}
            onError={() => setImageLoadFailed(true)}
          />
        ) : normalized ? (
          <div className="cold-production-design-upload-unavailable">
            <span>{isFileField ? '附件已上传' : '图片暂不可预览'}</span>
          </div>
        ) : (
          <div className="cold-production-design-upload-empty">
            {isFileField ? <FileOutlined /> : <UploadOutlined />}
            <span>{uploading ? '上传中' : '未上传'}</span>
          </div>
        )}
      </div>
      {normalized && !normalized.object_url ? (
        <div className="cold-production-design-upload-file" title={normalized.file_name || normalized.object_key}>
          {normalized.file_name || normalized.object_key || field.label}
        </div>
      ) : null}
    </div>
  )
}

function ColdStandbyProductionDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const autoSaveTimerRef = useRef(null)
  const autoSaveSeqRef = useRef(0)
  const pushSectionRefs = useRef({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [completingProduction, setCompletingProduction] = useState(false)
  const [updatingUnifiedDeadline, setUpdatingUnifiedDeadline] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [confirmingType, setConfirmingType] = useState('')
  const [detail, setDetail] = useState(null)
  const [sideNotes, setSideNotes] = useState([])
  const [productionNodes, setProductionNodes] = useState([])
  const [updatingNodeCode, setUpdatingNodeCode] = useState('')
  const [nodeBlockReasons, setNodeBlockReasons] = useState({})
  const [activeNoteTab, setActiveNoteTab] = useState(NOTE_SECTIONS[0]?.type || 'DELIVERY')
  const [highlightPushSection, setHighlightPushSection] = useState('')
  const [userOptions, setUserOptions] = useState([])
  const [sideNoteOwners, setSideNoteOwners] = useState({})
  const [operationNodeValues, setOperationNodeValues] = useState({})
  const [frontendNodeValues, setFrontendNodeValues] = useState({})

  const canManage = hasPermission('matrix_package.manage')
  const checklistPercent = useMemo(() => getSideNoteCompletionPercent(sideNotes, detail), [detail, sideNotes])

  const fetchDetail = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [detailResult, notesResult, nodesResult] = await Promise.all([
        getMatrixPackageApi(id),
        getMatrixPackageSideNotesApi(id),
        getMatrixPackageProductionNodesApi(id),
      ])
      if (!detailResult?.success) {
        message.error(detailResult?.message || '获取生产详情失败')
        return
      }
      const detailData = detailResult.data || null
      setDetail(detailData)
      const notes = notesResult?.success && Array.isArray(notesResult.data) ? notesResult.data : []
      setSideNotes(notes)
      setSideNoteOwners(buildSideNoteOwnerValues(notes))
      const noteFormValues = buildNoteFormValues(notes)
      setOperationNodeValues(
        noteFormValues.OPERATION && typeof noteFormValues.OPERATION === 'object' ? noteFormValues.OPERATION : {},
      )
      setFrontendNodeValues(
        noteFormValues.FRONTEND && typeof noteFormValues.FRONTEND === 'object' ? noteFormValues.FRONTEND : {},
      )
      const nodes = nodesResult?.success && Array.isArray(nodesResult.data) ? nodesResult.data : []
      setProductionNodes(nodes)
      setNodeBlockReasons(
        nodes.reduce((acc, item) => {
          acc[item.node_code] = item.block_reason || ''
          return acc
        }, {}),
      )
    } catch (error) {
      message.error(error?.message || '获取生产详情失败')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  useEffect(() => {
    let cancelled = false
    async function fetchUsers() {
      try {
        const result = await getUsersApi({ page: 1, pageSize: 1000, keyword: '', sort_by: 'real_name', sort_order: 'asc' })
        if (cancelled) return
        const rows = Array.isArray(result?.data?.list) ? result.data.list : []
        setUserOptions(rows)
      } catch {
        if (!cancelled) setUserOptions([])
      }
    }
    fetchUsers()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!detail) return
    form.setFieldsValue(buildNoteFormValues(sideNotes))
  }, [detail, form, sideNotes])

  const saveNotes = useCallback(async (values, { showSuccess = false, ownerValues = sideNoteOwners } = {}) => {
    try {
      const notes = buildSideNotePayload(values, sideNotes, ownerValues)
      setSaving(true)
      setSaveStatus('saving')
      const result = await saveMatrixPackageSideNotesApi(id, notes)
      if (!result?.success) {
        message.error(result?.message || '保存补充信息失败')
        setSaveStatus('failed')
        return
      }
      const nextNotes = Array.isArray(result.data) ? result.data : []
      setSideNotes(nextNotes)
      setSideNoteOwners(buildSideNoteOwnerValues(nextNotes))
      const nextNoteFormValues = buildNoteFormValues(nextNotes)
      setOperationNodeValues(
        nextNoteFormValues.OPERATION && typeof nextNoteFormValues.OPERATION === 'object'
          ? nextNoteFormValues.OPERATION
          : {},
      )
      setFrontendNodeValues(
        nextNoteFormValues.FRONTEND && typeof nextNoteFormValues.FRONTEND === 'object'
          ? nextNoteFormValues.FRONTEND
          : {},
      )
      setSaveStatus('saved')
      if (showSuccess) message.success('补充信息已保存')
    } catch (error) {
      if (error?.errorFields) return
      setSaveStatus('failed')
      message.error(error?.message || '保存补充信息失败')
    } finally {
      setSaving(false)
    }
  }, [id, sideNoteOwners, sideNotes])

  const scheduleAutoSave = useCallback((allValues) => {
    if (!canManage) return
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }
    const currentSeq = autoSaveSeqRef.current + 1
    autoSaveSeqRef.current = currentSeq
    setSaveStatus('pending')
    autoSaveTimerRef.current = setTimeout(() => {
      if (autoSaveSeqRef.current !== currentSeq) return
      saveNotes(allValues)
    }, 800)
  }, [canManage, saveNotes])

  const handleNoteValuesChange = (_, allValues) => {
    const nextOperationValues = allValues?.OPERATION
    if (nextOperationValues && typeof nextOperationValues === 'object') {
      setOperationNodeValues(nextOperationValues)
    }
    const nextFrontendValues = allValues?.FRONTEND
    if (nextFrontendValues && typeof nextFrontendValues === 'object') {
      setFrontendNodeValues(nextFrontendValues)
    }
    scheduleAutoSave(allValues)
  }

  const handleAttachmentUploadComplete = useCallback((sectionType, fieldName, nextValue) => {
    if (!canManage) return
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
    const currentValues = form.getFieldsValue(true)
    const nextSectionValues = {
      ...(currentValues[sectionType] && typeof currentValues[sectionType] === 'object' ? currentValues[sectionType] : {}),
      [fieldName]: nextValue,
    }
    const nextValues = {
      ...currentValues,
      [sectionType]: nextSectionValues,
    }
    form.setFieldsValue({ [sectionType]: nextSectionValues })
    return saveNotes(nextValues)
  }, [canManage, form, saveNotes])

  const handleConfirmNote = async (noteType) => {
    setConfirmingType(noteType)
    try {
      const result = await confirmMatrixPackageSideNoteApi(id, noteType)
      if (!result?.success) {
        message.error(result?.message || '确认失败')
        return
      }
      const nextNotes = Array.isArray(result.data) ? result.data : []
      setSideNotes(nextNotes)
      setSideNoteOwners(buildSideNoteOwnerValues(nextNotes))
      message.success('已确认完成')
    } catch (error) {
      message.error(error?.message || '确认失败')
    } finally {
      setConfirmingType('')
    }
  }

  const handleRemindProductionNode = async (nodeCode) => {
    if (!canManage) return
    try {
      const result = await remindMatrixPackageProductionNodeApi(id, nodeCode)
      if (!result?.success) {
        message.error(result?.message || '催办失败')
        return
      }
      message.success(result?.message || '已发送催办')
    } catch (error) {
      message.error(error?.message || '催办失败')
    }
  }

  const handleRemindSideNote = async (noteType) => {
    if (!canManage) return
    try {
      const result = await remindMatrixPackageSideNoteApi(id, noteType)
      if (!result?.success) {
        message.error(result?.message || '催办失败')
        return
      }
      message.success(result?.message || '已发送催办')
    } catch (error) {
      message.error(error?.message || '催办失败')
    }
  }

  const handleOperationNodeFieldChange = (fieldName, value) => {
    if (!canManage) return
    const currentValues = form.getFieldsValue(true)
    const nextOperationValues = {
      ...(currentValues.OPERATION && typeof currentValues.OPERATION === 'object' ? currentValues.OPERATION : {}),
      [fieldName]: value,
    }
    const nextValues = {
      ...currentValues,
      OPERATION: nextOperationValues,
    }
    form.setFieldsValue({ OPERATION: nextOperationValues })
    setOperationNodeValues(nextOperationValues)
    scheduleAutoSave(nextValues)
  }

  const handleFrontendNodeFieldChange = (fieldName, value) => {
    if (!canManage) return
    const currentValues = form.getFieldsValue(true)
    const nextFrontendValues = {
      ...(currentValues.FRONTEND && typeof currentValues.FRONTEND === 'object' ? currentValues.FRONTEND : {}),
      [fieldName]: value,
    }
    const nextValues = {
      ...currentValues,
      FRONTEND: nextFrontendValues,
    }
    form.setFieldsValue({ FRONTEND: nextFrontendValues })
    setFrontendNodeValues(nextFrontendValues)
    scheduleAutoSave(nextValues)
  }

  const handleUpdateProductionNode = async (nodeCode, statusCode, extraPayload = {}) => {
    setUpdatingNodeCode(nodeCode)
    try {
      const payload = {
        status_code: statusCode,
        block_reason: statusCode === 'BLOCKED' ? nodeBlockReasons[nodeCode] || '' : '',
        ...extraPayload,
      }
      const result = await updateMatrixPackageProductionNodeApi(id, nodeCode, payload)
      if (!result?.success) {
        message.error(result?.message || '更新生产节点失败')
        return
      }
      const nodes = Array.isArray(result.data) ? result.data : []
      setProductionNodes(nodes)
      setNodeBlockReasons((current) => ({
        ...current,
        ...nodes.reduce((acc, item) => {
          acc[item.node_code] = item.block_reason || ''
          return acc
        }, {}),
      }))
      message.success('生产节点已更新')
    } catch (error) {
      message.error(error?.message || '更新生产节点失败')
    } finally {
      setUpdatingNodeCode('')
    }
  }

  const handleCompleteProduction = () => {
    if (!canManage || !detail?.id) return
    Modal.confirm({
      title: '确认生产完成？',
      content: '确认后会将矩阵包状态更新为冷备包，并自动创建一条 APP 版本发布记录。',
      okText: '确认完成',
      cancelText: '取消',
      onOk: async () => {
        setCompletingProduction(true)
        try {
          const result = await completeMatrixPackageProductionApi(detail.id)
          if (!result?.success) {
            message.error(result?.message || '生产完成失败')
            return
          }
          const nextPackage = result.data?.package
          if (nextPackage) setDetail(nextPackage)
          message.success(result?.message || '生产已完成，APP发版记录已创建')
        } catch (error) {
          message.error(error?.message || '生产完成失败')
        } finally {
          setCompletingProduction(false)
        }
      },
    })
  }

  const productionNodeMap = useMemo(
    () => productionNodes.reduce((acc, item) => {
      acc[item.node_code] = item
      return acc
    }, {}),
    [productionNodes],
  )

  const nodeFlowTitleExtra = (
    <Space size={16} wrap className="cold-production-flow-title-meta">
      <div className="cold-production-flow-title-item">
        <Text type="secondary">矩阵包</Text>
        <Text>{detail?.package_name || '-'}</Text>
      </div>
      <div className="cold-production-flow-title-item">
        <Text type="secondary">域名</Text>
        <Text>{detail?.domain_info || '-'}</Text>
      </div>
      <div className="cold-production-flow-title-item">
        <Text type="secondary">包ID（应用ID）</Text>
        <Text>{detail?.app_id || '-'}</Text>
      </div>
      <div className="cold-production-flow-title-item">
        <Text type="secondary">开发者账号</Text>
        <Text>
          {detail?.developer_company_name || detail?.developer_account_name
            ? `${detail.developer_company_name || '-'} / ${detail.developer_account_name || '-'}`
            : '-'}
        </Text>
      </div>
      <div className="cold-production-flow-title-item">
        <Text type="secondary">负责人</Text>
        <Text>{detail?.owner_name || '-'}</Text>
      </div>
      <div className="cold-production-flow-title-item">
        <Text type="secondary">关联需求</Text>
        {detail?.linked_demand_id ? (
          <Button
            type="link"
            size="small"
            className="cold-production-linked-demand-btn"
            onClick={() => window.open(`/work-demands/${encodeURIComponent(detail.linked_demand_id)}`, '_blank', 'noopener,noreferrer')}
          >
            {detail.linked_demand_name || detail.linked_demand_id}
          </Button>
        ) : (
          <Text>-</Text>
        )}
      </div>
      <Button
        type="primary"
        size="small"
        disabled={!canManage}
        loading={completingProduction}
        onClick={handleCompleteProduction}
      >
        生产完成
      </Button>
    </Space>
  )

  const handleCopyStructuredField = async (event, sectionType, field) => {
    event.preventDefault()
    event.stopPropagation()
    const rawValue = form.getFieldValue([sectionType, field.name])
    const value = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
      ? String(rawValue.object_url || rawValue.object_key || rawValue.file_name || '').trim()
      : String(rawValue || '').trim()
    if (!value) {
      message.warning('暂无可复制内容')
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      message.success('已复制')
    } catch {
      message.error('复制失败，请手动复制')
    }
  }

  const handleDownloadBackendConfigJson = () => {
    const operationValues = form.getFieldValue('OPERATION')
    const operationContent = operationValues && typeof operationValues === 'object' && !Array.isArray(operationValues)
      ? operationValues
      : {}

    const normalized = {
      brand: String(detail?.package_name || '').trim(),
      domain: String(detail?.domain_info || '').trim(),
      email: String(operationContent.reviewAccount || '').trim(),
      appName: String(operationContent.appName || '').trim(),
      shortDescription: String(operationContent.shortDescription || '').trim(),
      fullDescription: String(operationContent.fullDescription || '').trim(),
    }

    if (!Object.values(normalized).some(Boolean)) {
      message.warning('暂无可生成的配置内容')
      return
    }

    const blob = new Blob([`${JSON.stringify(normalized, null, 2)}\n`], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const packageName = String(detail?.package_name || '').trim() || 'matrix-package'
    const safeFileName = packageName.replace(/[\\/:*?"<>|]+/g, '-')
    link.download = `${safeFileName}-GP-config.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    message.success('config.json 已生成')
  }

  const handleDownloadBackendSecurityFile = async () => {
    const operationValues = form.getFieldValue('OPERATION')
    const operationContent = operationValues && typeof operationValues === 'object' && !Array.isArray(operationValues)
      ? operationValues
      : {}

    const dataDeletionUrl = String(operationContent.dataDeletionUrl || '').trim()
    if (!dataDeletionUrl) {
      message.warning('请先补充运营侧的“数据删除说明网址”')
      return
    }

    try {
      const templateResult = await getNotificationTemplateFilesApi()
      if (!templateResult?.success) {
        message.error(templateResult?.message || '获取数据安全文件模板失败')
        return
      }

      const templateRow = findTemplateByKeys(templateResult.data, DATA_SAFETY_TEMPLATE_KEYS)

      const templateUrl = String(
        templateRow?.preview_url || templateRow?.download_url || templateRow?.object_url || '',
      ).trim()

      if (!templateUrl) {
        message.warning('请先在通用文件模板里上传数据安全文件模板')
        return
      }

      const templateResponse = await fetch(templateUrl)
      if (!templateResponse.ok) {
        throw new Error(`模板下载失败(${templateResponse.status})`)
      }

      const templateText = await templateResponse.text()
      const rows = parseCsvText(templateText)
      if (!rows.length) {
        message.warning('模板文件内容为空')
        return
      }

      const targetRow = rows.find((row) => row.some((cell) => String(cell || '').trim() === 'PSL_ACCOUNT_DELETION_URL'))
      if (!targetRow) {
        message.warning('模板中未找到 PSL_ACCOUNT_DELETION_URL 行')
        return
      }

      while (targetRow.length < 3) {
        targetRow.push('')
      }
      targetRow[2] = dataDeletionUrl

      const csvContent = stringifyCsvRows(rows)
      const packageName = String(detail?.package_name || '').trim() || 'matrix-package'
      const safeFileName = packageName.replace(/[\\/:*?"<>|]+/g, '-')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${safeFileName}-数据安全文件.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      message.success('数据安全文件已生成')
    } catch (error) {
      message.error(error?.message || '生成数据安全文件失败')
    }
  }

  const handleOpenProductConfigLink = async () => {
    try {
      const templateResult = await getNotificationTemplateFilesApi()
      if (!templateResult?.success) {
        message.error(templateResult?.message || '获取商品信息配置链接失败')
        return
      }

      const templateRow = findTemplateByKeys(templateResult.data, PRODUCT_CONFIG_TEMPLATE_KEYS)
      const templateUrl = String(templateRow?.object_url || templateRow?.preview_url || templateRow?.download_url || '').trim()
      if (!templateUrl) {
        message.warning('请先在通用文件模板里配置商品信息配置链接')
        return
      }

      window.open(templateUrl, '_blank', 'noopener,noreferrer')
    } catch (error) {
      message.error(error?.message || '打开商品信息配置链接失败')
    }
  }

  const renderStructuredFieldLabel = (sectionType, field) => {
    const labelText = field.tooltip ? (
      <Tooltip title={field.tooltip}>
        <span>{field.label}</span>
      </Tooltip>
    ) : (
      <span>{field.label}</span>
    )

    return (
      <Space size={4} className="cold-production-operation-label">
        {labelText}
        {sectionType === 'DESIGN' ? <UploadOutlined className="cold-production-upload-label-icon" /> : null}
        {sectionType === 'DELIVERY' || sectionType === 'OPERATION' || sectionType === 'FRONTEND' || sectionType === 'BACKEND' || sectionType === 'DEVOPS' ? (
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            aria-label={`复制${field.label}`}
            onClick={(event) => handleCopyStructuredField(event, sectionType, field)}
          />
        ) : null}
      </Space>
    )
  }

  const jumpToPushSection = useCallback((sectionKey) => {
    setActiveNoteTab('DELIVERY')
    setHighlightPushSection(sectionKey)
    window.setTimeout(() => {
      const element = pushSectionRefs.current?.[sectionKey]
      element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 80)
    window.setTimeout(() => {
      setHighlightPushSection((current) => (current === sectionKey ? '' : current))
    }, 1800)
  }, [])

  const noteCardExtra = (
    <Space size={8} wrap>
      <Space size={4}>
        <Text type="secondary">统一截止时间</Text>
        <DatePicker
          size="small"
          disabled={!canManage || updatingUnifiedDeadline}
          value={detail?.expected_cold_ready_date ? dayjs(detail.expected_cold_ready_date) : null}
          format="YYYY-MM-DD HH:00"
          placeholder="选择日期和小时"
          showTime={{
            format: 'HH',
            minuteStep: 60,
            secondStep: 60,
            defaultOpenValue: dayjs().minute(0).second(0),
          }}
          onChange={async (value) => {
            if (!detail?.id) return
            try {
              setUpdatingUnifiedDeadline(true)
              const result = await updateMatrixPackageApi(detail.id, {
                package_name: detail.package_name,
                app_id: detail.app_id || '',
                new_package_version: detail.new_package_version || '',
                domain_info: detail.domain_info || '',
                developer_account_id: detail.developer_account_id || null,
                owner_user_id: detail.owner_user_id || null,
                status_code: detail.status_code,
                health_code: detail.health_code || null,
                expected_cold_ready_date: value ? value.minute(0).second(0).format('YYYY-MM-DD HH:mm:ss') : null,
              })
              if (!result?.success) {
                message.error(result?.message || '统一截止时间更新失败')
                return
              }
              setDetail(result.data || detail)
              message.success('统一截止时间已更新')
            } catch (error) {
              message.error(error?.message || '统一截止时间更新失败')
            } finally {
              setUpdatingUnifiedDeadline(false)
            }
          }}
        />
      </Space>
      <Button size="small" onClick={() => jumpToPushSection('prod')}>
        生产环境信息一键配置
      </Button>
      <Button size="small" onClick={() => jumpToPushSection('test')}>
        测试环境信息一键配置
      </Button>
      <Text type={saveStatus === 'failed' ? 'danger' : 'secondary'}>
        {saving || saveStatus === 'saving'
          ? '保存中...'
          : saveStatus === 'pending'
            ? '待自动保存'
            : saveStatus === 'saved'
              ? '已自动保存'
              : saveStatus === 'failed'
                ? '自动保存失败'
                : ''}
      </Text>
    </Space>
  )

  const handleSideNoteOwnerChange = async (noteType, ownerUserId) => {
    if (!canManage) return
    const nextOwnerValues = {
      ...sideNoteOwners,
      [noteType]: ownerUserId || null,
    }
    setSideNoteOwners(nextOwnerValues)
    const currentValues = form.getFieldsValue(true)
    await saveNotes(currentValues, { ownerValues: nextOwnerValues })
  }

  const renderPreparationModule = (
    nodeCode,
    { fields = null, values = {}, onFieldChange = null, emptyText = '当前环节暂无额外补充项', enableCopy = false } = {},
  ) => {
    const node = productionNodeMap[nodeCode]
    if (!node) return null
    const statusMeta = getNodeStatusMeta(node.status_code)
    const isUpdating = updatingNodeCode === node.node_code
    const blockReason = nodeBlockReasons[node.node_code] || ''
    const handleCopyPreparationField = async (field) => {
      const value = String(values?.[field.name] || '').trim()
      if (!value) {
        message.warning('暂无可复制内容')
        return
      }
      try {
        await navigator.clipboard.writeText(value)
        message.success('已复制')
      } catch {
        message.error('复制失败，请手动复制')
      }
    }

    return (
      <div className="cold-production-prep-module" key={node.node_code}>
        <div className="cold-production-prep-module-head">
          <Space size={[8, 8]} wrap>
            <Text strong>{node.node_name}</Text>
            <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
          </Space>
          <Space size={[8, 8]} wrap className="cold-production-prep-toolbar-actions">
            <Button
              size="small"
              type="primary"
              disabled={!canManage}
              loading={isUpdating}
              onClick={() => handleUpdateProductionNode(node.node_code, 'COMPLETED')}
            >
              完成
            </Button>
            <Button
              size="small"
              disabled={!canManage || !String(blockReason).trim()}
              loading={isUpdating}
              onClick={() => handleUpdateProductionNode(node.node_code, 'BLOCKED')}
            >
              阻塞
            </Button>
            {node.status_code === 'BLOCKED' ? (
              <Button
                size="small"
                disabled={!canManage}
                loading={isUpdating}
                onClick={() => handleUpdateProductionNode(node.node_code, 'IN_PROGRESS')}
              >
                解除
              </Button>
            ) : null}
          </Space>
        </div>

        {fields?.length ? (
          <div className="cold-production-prep-fields">
            {fields[0]?.fields ? fields.map((group) => (
              <div className="cold-production-push-module" key={group.key}>
                <div className="cold-production-push-module-title">{group.title}</div>
                <Row gutter={[14, 8]}>
                  {group.fields.map((field) => (
                    <Col xs={24} md={12} key={field.name}>
                      <div className={`cold-production-prep-field${field.textarea ? ' is-full' : ''}`}>
                        <Space size={4} className="cold-production-operation-label">
                          <Text type="secondary">{field.label}</Text>
                          {enableCopy ? (
                            <Button
                              type="text"
                              size="small"
                              icon={<CopyOutlined />}
                              aria-label={`复制${field.label}`}
                              onClick={() => handleCopyPreparationField(field)}
                            />
                          ) : null}
                        </Space>
                        {field.textarea ? (
                          <Input.TextArea
                            rows={3}
                            maxLength={2000}
                            disabled={!canManage}
                            value={values?.[field.name] || ''}
                            placeholder={field.placeholder}
                            onChange={(event) => onFieldChange?.(field.name, event.target.value)}
                          />
                        ) : (
                          <Input
                            maxLength={500}
                            disabled={!canManage}
                            value={values?.[field.name] || ''}
                            placeholder={field.placeholder}
                            onChange={(event) => onFieldChange?.(field.name, event.target.value)}
                          />
                        )}
                      </div>
                    </Col>
                  ))}
                </Row>
              </div>
            )) : fields.map((field) => (
              <div
                className={`cold-production-prep-field${field.textarea ? ' is-full' : ''}`}
                key={field.name}
              >
                <Space size={4} className="cold-production-operation-label">
                  <Text type="secondary">{field.label}</Text>
                  {enableCopy ? (
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      aria-label={`复制${field.label}`}
                      onClick={() => handleCopyPreparationField(field)}
                    />
                  ) : null}
                </Space>
                {field.textarea ? (
                  <Input.TextArea
                    rows={3}
                    maxLength={2000}
                    disabled={!canManage}
                    value={values?.[field.name] || ''}
                    placeholder={field.placeholder}
                    onChange={(event) => onFieldChange?.(field.name, event.target.value)}
                  />
                ) : (
                  <Input
                    maxLength={500}
                    disabled={!canManage}
                    value={values?.[field.name] || ''}
                    placeholder={field.placeholder}
                    onChange={(event) => onFieldChange?.(field.name, event.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="cold-production-prep-empty">
            <Text type="secondary">{emptyText}</Text>
          </div>
        )}

        {(node.status_code === 'BLOCKED' || node.block_reason) ? (
          <Input
            maxLength={1000}
            value={blockReason}
            disabled={!canManage}
            placeholder="填写阻塞原因"
            onChange={(event) => {
              const nextValue = event.target.value
              setNodeBlockReasons((current) => ({
                ...current,
                [node.node_code]: nextValue,
              }))
            }}
          />
        ) : null}

        <div className="cold-production-prep-footer">
          <div className="cold-production-prep-toolbar-field">
            <Space size={6} align="center" wrap>
              <Text type="secondary">责任人</Text>
              <Select
                allowClear
                showSearch
                disabled={!canManage || isUpdating}
                placeholder="选择系统用户"
                optionFilterProp="searchText"
                value={node.owner_user_id || undefined}
                filterOption={(input, option) => String(option?.searchText || '').includes(input.toLowerCase())}
                options={userOptions.map(buildUserOption)}
                onChange={(value) => handleUpdateProductionNode(node.node_code, node.status_code, {
                  owner_user_id: value || null,
                })}
              />
            </Space>
          </div>

          <div className="cold-production-prep-toolbar-field">
            <Space size={6} align="center" wrap>
              <Text type="secondary">预期完成时间</Text>
              <DatePicker
                disabled={!canManage || isUpdating}
                value={node.expected_delivery_date ? dayjs(node.expected_delivery_date) : null}
                format="YYYY-MM-DD HH:00"
                placeholder="选择日期和小时"
                showTime={{
                  format: 'HH',
                  minuteStep: 60,
                  secondStep: 60,
                  defaultOpenValue: dayjs().minute(0).second(0),
                }}
                onChange={(value) => handleUpdateProductionNode(node.node_code, node.status_code, {
                  expected_delivery_date: value ? value.minute(0).second(0).format('YYYY-MM-DD HH:mm:ss') : null,
                })}
              />
              <Tooltip title="手动催一下">
                <Button
                  type="text"
                  icon={<BellOutlined />}
                  disabled={!canManage}
                  onClick={() => handleRemindProductionNode(node.node_code)}
                />
              </Tooltip>
            </Space>
          </div>
        </div>
      </div>
    )
  }

  if (loading && !detail) {
    return (
      <div className="cold-production-detail-page">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="cold-production-detail-page">
        <Empty description="未找到矩阵包生产详情">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/matrix-package-special/cold-standby-production')}>
            返回生产线
          </Button>
        </Empty>
      </div>
    )
  }

  return (
    <div className="cold-production-detail-page">
      <div className="cold-production-detail-head">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/matrix-package-special/cold-standby-production')}>
          返回生产线
        </Button>
      </div>

      <Row gutter={[14, 14]} align="stretch">
        <Col xs={24} lg={16}>
          <Card variant="borderless" title="前置准备" extra={nodeFlowTitleExtra} className="cold-production-flow-card">
            {productionNodes.length ? (
              <div className="cold-production-prep-grid">
                {renderPreparationModule('OPERATION_MATERIAL', {
                  fields: OPERATION_NODE_REQUIRED_FIELDS,
                  values: operationNodeValues,
                  onFieldChange: handleOperationNodeFieldChange,
                })}
                {renderPreparationModule('DESIGN_PRODUCTION', {
                  fields: FRONTEND_NODE_REQUIRED_FIELDS,
                  values: frontendNodeValues,
                  onFieldChange: handleFrontendNodeFieldChange,
                  enableCopy: true,
                })}
              </div>
            ) : (
              <Alert type="info" showIcon title="暂无前置准备信息" />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card variant="borderless" title="各侧信息check" className="cold-production-side-check-card">
            <div className="cold-production-side-checks">
              {NOTE_SECTIONS.filter((section) => SIDE_CHECK_SECTION_TYPES.includes(section.type)).map((section) => {
                const note = getSideNote(sideNotes, section.type)
                const completed = hasNoteContent(sideNotes, section.type)
                const confirmed = Boolean(note?.is_confirmed)
                return (
                  <div className="cold-production-side-check-item" key={section.type}>
                    <Space size={8}>
                      {completed ? (
                        <CheckCircleOutlined className="cold-production-side-check-icon-done" />
                      ) : (
                        <ClockCircleOutlined className="cold-production-side-check-icon-pending" />
                      )}
                      <Text>{section.title}</Text>
                    </Space>
                    <Space size={6} wrap>
                      <Tag color={completed ? 'green' : 'default'}>{completed ? '已填写' : '待填写'}</Tag>
                      <Tag color={confirmed ? 'blue' : 'orange'}>{confirmed ? '已确认' : '待确认'}</Tag>
                      <Tooltip title="手动催一下">
                        <Button
                          type="text"
                          size="small"
                          icon={<BellOutlined />}
                          disabled={!canManage}
                          onClick={() => handleRemindSideNote(section.type)}
                        />
                      </Tooltip>
                      {!confirmed ? (
                        <Button
                          size="small"
                          disabled={!canManage || !completed}
                          loading={confirmingType === section.type}
                          onClick={() => handleConfirmNote(section.type)}
                        >
                          确认完成
                        </Button>
                      ) : null}
                    </Space>
                  </div>
                )
              })}
            </div>
            <div className="cold-production-side-check-progress">
              <Text type="secondary">配置完整度</Text>
              <Progress percent={checklistPercent} size="small" />
            </div>
          </Card>
        </Col>
      </Row>

      <Card
        variant="borderless"
        title="各侧补充信息"
        extra={noteCardExtra}
      >
        <Form
          form={form}
          layout="vertical"
          className="cold-production-note-form"
          onValuesChange={handleNoteValuesChange}
        >
          <Tabs
            className="cold-production-note-tabs"
            activeKey={activeNoteTab}
            onChange={setActiveNoteTab}
            items={NOTE_SECTIONS.map((section) => {
              const note = sideNotes.find((item) => item.note_type === section.type)
              return {
                key: section.type,
                label: section.title,
                children: (
                  <div className="cold-production-note-pane">
                    {section.type === 'DELIVERY' ? (
                      <div className="cold-production-push-form">
                        {PUSH_ENV_SECTIONS.map((envSection) => (
                          <div
                            className={`cold-production-push-module${highlightPushSection === envSection.key ? ' is-highlighted' : ''}`}
                            key={envSection.key}
                            ref={(node) => {
                              if (node) {
                                pushSectionRefs.current[envSection.key] = node
                              } else {
                                delete pushSectionRefs.current[envSection.key]
                              }
                            }}
                          >
                            <div className="cold-production-push-module-title">{envSection.title}</div>
                            <Row gutter={[14, 8]}>
                              {envSection.fields.map((field) => (
                                <Col xs={24} md={12} key={field.name}>
                                  <Form.Item
                                    name={[section.type, field.name]}
                                    label={renderStructuredFieldLabel(section.type, field)}
                                  >
                                    <Input
                                      allowClear
                                      maxLength={500}
                                      disabled={!canManage}
                                      placeholder={field.placeholder}
                                    />
                                  </Form.Item>
                                </Col>
                              ))}
                            </Row>
                          </div>
                        ))}
                      </div>
                    ) : section.type === 'DESIGN' ? (
                      <Row gutter={[16, 12]} className="cold-production-design-layout">
                        <Col xs={24} lg={12}>
                          <Row gutter={[12, 12]}>
                            {DESIGN_UPLOAD_FIELDS.map((field) => (
                              <Col xs={24} key={field.name}>
                                <Form.Item name={[section.type, field.name]}>
                                  <DesignUploadField
                                    packageId={id}
                                    noteType={section.type}
                                    field={field}
                                    onUploaded={(fieldName, nextValue) => handleAttachmentUploadComplete(section.type, fieldName, nextValue)}
                                    disabled={!canManage}
                                  />
                                </Form.Item>
                              </Col>
                            ))}
                          </Row>
                        </Col>
                        <Col xs={24} lg={12}>
                          <div className="cold-production-design-side-form">
                            {DESIGN_FORM_FIELDS.map((field) => (
                              <Form.Item
                                key={field.name}
                                name={[section.type, field.name]}
                                label={field.label}
                              >
                                <Input
                                  allowClear
                                  maxLength={1000}
                                  disabled={!canManage}
                                  placeholder={field.placeholder}
                                />
                              </Form.Item>
                            ))}
                            {DESIGN_ATTACHMENT_FIELDS.map((field) => (
                              <Form.Item key={field.name} name={[section.type, field.name]}>
                                <DesignUploadField
                                  packageId={id}
                                  noteType={section.type}
                                  field={field}
                                  onUploaded={(fieldName, nextValue) => handleAttachmentUploadComplete(section.type, fieldName, nextValue)}
                                  disabled={!canManage}
                                />
                              </Form.Item>
                            ))}
                          </div>
                        </Col>
                      </Row>
                    ) : section.type === 'FRONTEND' ? (
                      <div className="cold-production-push-form">
                        <div className="cold-production-push-module">
                          <div className="cold-production-push-module-title">基础信息</div>
                          <Row gutter={[14, 8]}>
                            {FRONTEND_BASE_FIELDS.map((field) => (
                              <Col xs={24} md={12} key={field.name}>
                                <Form.Item
                                  name={[section.type, field.name]}
                                  label={renderStructuredFieldLabel(section.type, field)}
                                >
                                  <Input
                                    allowClear
                                    maxLength={1000}
                                    disabled={!canManage}
                                    placeholder={field.placeholder}
                                  />
                                </Form.Item>
                              </Col>
                            ))}
                          </Row>
                        </div>
                        {FRONTEND_ENV_SECTIONS.map((envSection) => (
                          <div className="cold-production-push-module" key={envSection.key}>
                            <div className="cold-production-push-module-title">{envSection.title}</div>
                            <Row gutter={[14, 8]}>
                              {envSection.fields.map((field) => (
                                <Col xs={24} md={12} key={field.name}>
                                  <Form.Item
                                    name={[section.type, field.name]}
                                    label={renderStructuredFieldLabel(section.type, field)}
                                  >
                                    <Input
                                      allowClear
                                      maxLength={500}
                                      disabled={!canManage}
                                      placeholder={field.placeholder}
                                    />
                                  </Form.Item>
                                </Col>
                              ))}
                            </Row>
                          </div>
                        ))}
                      </div>
                    ) : section.type === 'BACKEND' ? (
                      <div className="cold-production-push-form">
                        <div className="cold-production-push-module">
                          <div className="cold-production-push-module-title">
                            <Space size={8} wrap>
                              <span>配置项文件下载</span>
                              <Space size={8} wrap>
                                <Button size="small" onClick={handleOpenProductConfigLink}>
                                  商品信息配置链接
                                </Button>
                                <Button size="small" onClick={handleDownloadBackendConfigJson}>
                                  config-json 文件生成
                                </Button>
                                <Button size="small" onClick={handleDownloadBackendSecurityFile}>
                                  数据安全文件
                                </Button>
                              </Space>
                            </Space>
                          </div>
                        </div>
                      </div>
                    ) : section.type === 'DEVOPS' ? (
                      <div className="cold-production-devops-form">
                        <Row gutter={[14, 8]} className="cold-production-operation-form">
                          {DEVOPS_FIELDS.filter((field) => field.kind !== 'file').map((field) => (
                            <Col xs={24} md={12} key={field.name}>
                              <Form.Item
                                name={[section.type, field.name]}
                                label={renderStructuredFieldLabel(section.type, field)}
                              >
                                <Input
                                  allowClear
                                  maxLength={500}
                                  disabled={!canManage}
                                  placeholder={field.placeholder}
                                />
                              </Form.Item>
                            </Col>
                          ))}
                        </Row>
                        <div className="cold-production-devops-attachments">
                          {DEVOPS_FIELDS.filter((field) => field.kind === 'file').map((field) => (
                            <Form.Item key={field.name} name={[section.type, field.name]}>
                              <DesignUploadField
                                packageId={id}
                                noteType={section.type}
                                field={field}
                                onUploaded={(fieldName, nextValue) => handleAttachmentUploadComplete(section.type, fieldName, nextValue)}
                                disabled={!canManage}
                              />
                            </Form.Item>
                          ))}
                        </div>
                      </div>
                    ) : STRUCTURED_NOTE_FIELDS[section.type] ? (
                      <Row gutter={[14, 8]} className="cold-production-operation-form">
                        {STRUCTURED_NOTE_FIELDS[section.type].map((field) => (
                          <Col xs={24} md={field.span === 24 ? 24 : 12} key={field.name}>
                            <Form.Item
                              name={[section.type, field.name]}
                              label={renderStructuredFieldLabel(section.type, field)}
                            >
                              {field.type === 'textarea' ? (
                                <Input.TextArea
                                  rows={4}
                                  maxLength={2000}
                                  showCount
                                  disabled={!canManage}
                                  placeholder={field.placeholder}
                                />
                              ) : (
                                <Input
                                  allowClear
                                  maxLength={500}
                                  disabled={!canManage}
                                  placeholder={field.placeholder}
                                />
                              )}
                            </Form.Item>
                          </Col>
                        ))}
                      </Row>
                    ) : (
                      <Form.Item name={section.type}>
                        <Input.TextArea
                          rows={8}
                          maxLength={4000}
                          showCount
                          disabled={!canManage}
                          placeholder={section.placeholder}
                        />
                      </Form.Item>
                    )}
                    {section.type === 'BACKEND' ? (
                      <div className="cold-production-note-meta">
                        <div className="cold-production-note-meta-updated">
                          {note?.updated_at ? (
                            <Text type="secondary">
                              最近更新：{note.updated_by_name ? `${note.updated_by_name} / ` : ''}{note.updated_at}
                            </Text>
                          ) : (
                            <Text type="secondary">最近更新：-</Text>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="cold-production-note-meta">
                        <div className="cold-production-note-meta-owner">
                          <Text type="secondary">负责人</Text>
                          <Select
                            allowClear
                            showSearch
                            size="small"
                            disabled={!canManage}
                            placeholder="选择系统用户"
                            optionFilterProp="searchText"
                            value={sideNoteOwners?.[section.type] || undefined}
                            filterOption={(input, option) => String(option?.searchText || '').includes(input.toLowerCase())}
                            options={userOptions.map(buildUserOption)}
                            onChange={(value) => handleSideNoteOwnerChange(section.type, value)}
                          />
                        </div>
                        <div className="cold-production-note-meta-updated">
                          {note?.updated_at ? (
                            <Text type="secondary">
                              最近更新：{note.updated_by_name ? `${note.updated_by_name} / ` : ''}{note.updated_at}
                            </Text>
                          ) : (
                            <Text type="secondary">最近更新：-</Text>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ),
              }
            })}
          />
        </Form>
      </Card>
    </div>
  )
}

export default ColdStandbyProductionDetailPage
