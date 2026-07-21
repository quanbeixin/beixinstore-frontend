import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  FireOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createMatrixPackageApi,
  deleteMatrixPackageApi,
  getMatrixPackagesApi,
  updateMatrixPackageApi,
} from '../../api/matrixPackage'
import { getDeveloperAccountOptionsApi } from '../../api/developerAccount'
import { getDictItemsApi } from '../../api/configDict'
import { getUsersApi } from '../../api/users'
import { hasPermission } from '../../utils/access'
import './MatrixPackageSpecialPage.css'

const { Text } = Typography
const STATUS_DICT_KEY = 'matrix_package_status'
const HEALTH_DICT_KEY = 'matrix_package_health'
const PLATFORM_DICT_KEY = 'matrix_package_delivery_platform'
const DELIVERY_STATUS_DICT_KEY = 'matrix_package_delivery_status'
const DELIVERING_STATUS = 'DELIVERING'
const PENDING_DEV_STATUS = 'PENDING_DEV'
const IN_DEVELOPMENT_STATUS = 'IN_DEVELOPMENT'
const COLD_STANDBY_STATUS = 'COLD_STANDBY'
const PENDING_REVIEW_SUBMIT_STATUS = 'PENDING_REVIEW_SUBMIT'
const DEFAULT_PRODUCTION_STAGE = 'REQUIREMENT_CONFIRM'

const DEFAULT_STATUS_OPTIONS = [
  { item_code: 'PENDING_DEV', item_name: '待开发', color: 'default' },
  { item_code: 'IN_DEVELOPMENT', item_name: '开发中', color: 'cyan' },
  { item_code: 'COLD_STANDBY', item_name: '冷备包', color: 'blue' },
  { item_code: 'PENDING_REVIEW_SUBMIT', item_name: '待送审', color: 'orange' },
  { item_code: 'IN_REVIEW', item_name: '审核中', color: 'gold' },
  { item_code: 'REVIEW_REJECTED', item_name: '被拒审', color: 'red' },
  { item_code: 'HOT_STANDBY', item_name: '热备包', color: 'green' },
  { item_code: 'DELIVERING', item_name: '运营中', color: 'processing' },
  { item_code: 'BANNED', item_name: '已封禁', color: 'red' },
  { item_code: 'ARCHIVED', item_name: '已归档', color: 'default' },
]

const DEFAULT_HEALTH_OPTIONS = [
  { item_code: 'NORMAL', item_name: '正常', color: 'green' },
  { item_code: 'WATCH', item_name: '关注', color: 'gold' },
  { item_code: 'ABNORMAL', item_name: '异常', color: 'red' },
]

const DEFAULT_PLATFORM_OPTIONS = [
  { item_code: 'META', item_name: 'Meta', color: 'blue' },
  { item_code: 'GOOGLE', item_name: 'Google', color: 'green' },
  { item_code: 'SNAPCHAT', item_name: 'Snapchat', color: 'gold' },
  { item_code: 'TT', item_name: 'TT', color: 'purple' },
]

const DEFAULT_DELIVERY_STATUS_OPTIONS = [
  { item_code: 'ACTIVE', item_name: '在投', color: 'green' },
  { item_code: 'STOPPED', item_name: '停投', color: 'default' },
]

const HEALTH_ICON_MAP = {
  NORMAL: <span className="matrix-health-dot matrix-health-dot-normal" />,
  WATCH: <span className="matrix-health-dot matrix-health-dot-watch" />,
  ABNORMAL: <span className="matrix-health-dot matrix-health-dot-abnormal" />,
}

function normalizeDictItems(items, fallback) {
  const source = Array.isArray(items) && items.length > 0 ? items : fallback
  return source
    .filter((item) => Number(item.enabled ?? 1) === 1)
    .map((item) => ({
      code: String(item.item_code || '').trim().toUpperCase(),
      name: String(item.item_name || item.item_code || '').trim(),
      color: String(item.color || '').trim() || 'default',
      remark: String(item.remark || '').trim(),
    }))
    .filter((item) => item.code && item.name)
}

function buildDictMap(options) {
  return new Map((options || []).map((item) => [item.code, item]))
}

function normalizePlatformCodes(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || '').split(',')
  return Array.from(new Set(source.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean)))
}

function getStatusTone(statusCode) {
  if (statusCode === 'DELIVERING') return 'active'
  if (statusCode === 'BANNED') return 'danger'
  if (statusCode === 'ARCHIVED') return 'muted'
  return 'steady'
}

function getUserDisplayName(user) {
  return user?.real_name || user?.username || `用户${user?.id || ''}`
}

function buildUserOption(user) {
  const name = getUserDisplayName(user)
  return {
    label: user.department_name ? `${name} / ${user.department_name}` : name,
    value: user.id,
    searchText: `${name} ${user.username || ''} ${user.department_name || ''}`,
  }
}

function MatrixPackageSpecialPage() {
  const [form] = Form.useForm()
  const watchedStatusCode = Form.useWatch('status_code', form)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [packages, setPackages] = useState([])
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [summary, setSummary] = useState({
    total: 0,
    pendingDev: 0,
    inDevelopment: 0,
    coldStandby: 0,
    pendingReviewSubmit: 0,
    inReview: 0,
    hotStandby: 0,
    delivering: 0,
  })
  const [summaryModal, setSummaryModal] = useState({
    open: false,
    title: '',
    statusCode: undefined,
    rows: [],
    loading: false,
    pagination: { current: 1, pageSize: 20, total: 0 },
  })
  const [filters, setFilters] = useState({
    keyword: '',
    developer_account_id: undefined,
    status_code: undefined,
    health_code: undefined,
    platform: [],
    delivery_status_code: undefined,
  })
  const [developerAccountOptions, setDeveloperAccountOptions] = useState([])
  const [userOptions, setUserOptions] = useState([])
  const [statusOptions, setStatusOptions] = useState(DEFAULT_STATUS_OPTIONS.map((item) => ({
    code: item.item_code,
    name: item.item_name,
    color: item.color,
    remark: item.remark || '',
  })))
  const [healthOptions, setHealthOptions] = useState(DEFAULT_HEALTH_OPTIONS.map((item) => ({
    code: item.item_code,
    name: item.item_name,
    color: item.color,
    remark: item.remark || '',
  })))
  const [platformOptions, setPlatformOptions] = useState(DEFAULT_PLATFORM_OPTIONS.map((item) => ({
    code: item.item_code,
    name: item.item_name,
    color: item.color,
    remark: item.remark || '',
  })))
  const [deliveryStatusOptions, setDeliveryStatusOptions] = useState(DEFAULT_DELIVERY_STATUS_OPTIONS.map((item) => ({
    code: item.item_code,
    name: item.item_name,
    color: item.color,
    remark: item.remark || '',
  })))

  const canManage = hasPermission('matrix_package.manage')
  const statusMap = useMemo(() => buildDictMap(statusOptions), [statusOptions])
  const healthMap = useMemo(() => buildDictMap(healthOptions), [healthOptions])
  const platformMap = useMemo(() => buildDictMap(platformOptions), [platformOptions])
  const deliveryStatusMap = useMemo(() => buildDictMap(deliveryStatusOptions), [deliveryStatusOptions])
  const isDelivering = watchedStatusCode === DELIVERING_STATUS

  const fetchDicts = useCallback(async () => {
    const [statusResult, healthResult, platformResult, deliveryStatusResult] = await Promise.allSettled([
      getDictItemsApi(STATUS_DICT_KEY, { enabledOnly: true }),
      getDictItemsApi(HEALTH_DICT_KEY, { enabledOnly: true }),
      getDictItemsApi(PLATFORM_DICT_KEY, { enabledOnly: true }),
      getDictItemsApi(DELIVERY_STATUS_DICT_KEY, { enabledOnly: true }),
    ])

    if (statusResult.status === 'fulfilled' && statusResult.value?.success) {
      setStatusOptions(normalizeDictItems(statusResult.value.data, DEFAULT_STATUS_OPTIONS))
    }
    if (healthResult.status === 'fulfilled' && healthResult.value?.success) {
      setHealthOptions(normalizeDictItems(healthResult.value.data, DEFAULT_HEALTH_OPTIONS))
    }
    if (platformResult.status === 'fulfilled' && platformResult.value?.success) {
      setPlatformOptions(normalizeDictItems(platformResult.value.data, DEFAULT_PLATFORM_OPTIONS))
    }
    if (deliveryStatusResult.status === 'fulfilled' && deliveryStatusResult.value?.success) {
      setDeliveryStatusOptions(normalizeDictItems(deliveryStatusResult.value.data, DEFAULT_DELIVERY_STATUS_OPTIONS))
    }
  }, [])

  const fetchDeveloperAccounts = useCallback(async () => {
    const result = await getDeveloperAccountOptionsApi()
    if (result?.success) {
      setDeveloperAccountOptions(Array.isArray(result.data) ? result.data : [])
    }
  }, [])

  const fetchUsers = useCallback(async () => {
    const result = await getUsersApi({ page: 1, pageSize: 1000, keyword: '', sort_by: 'real_name', sort_order: 'asc' })
    if (result?.success) {
      setUserOptions(Array.isArray(result.data?.list) ? result.data.list : [])
    }
  }, [])

  const fetchPackages = useCallback(async (next = {}) => {
    const nextPage = next.page || 1
    const nextPageSize = next.pageSize || 20
    setLoading(true)
    try {
      const result = await getMatrixPackagesApi({
        page: nextPage,
        pageSize: nextPageSize,
        keyword: filters.keyword || undefined,
        developer_account_id: filters.developer_account_id || undefined,
        status_code: filters.status_code || undefined,
        health_code: filters.health_code || undefined,
        platform: Array.isArray(filters.platform) && filters.platform.length > 0 ? filters.platform.join(',') : undefined,
        delivery_status_code: filters.delivery_status_code || undefined,
      })
      if (!result?.success) {
        message.error(result?.message || '获取矩阵包列表失败')
        return
      }

      const data = result.data || {}
      setPackages(Array.isArray(data.list) ? data.list : [])
      setPagination({
        current: Number(data.page || nextPage),
        pageSize: Number(data.pageSize || nextPageSize),
        total: Number(data.total || 0),
      })
      setSummary({
        total: Number(data.summary?.total || data.total || 0),
        pendingDev: Number(data.summary?.pending_dev || 0),
        inDevelopment: Number(data.summary?.in_development || 0),
        coldStandby: Number(data.summary?.cold_standby || 0),
        pendingReviewSubmit: Number(data.summary?.pending_review_submit || 0),
        inReview: Number(data.summary?.in_review || 0),
        hotStandby: Number(data.summary?.hot_standby || 0),
        delivering: Number(data.summary?.delivering || 0),
      })
    } catch (error) {
      message.error(error?.message || '获取矩阵包列表失败')
    } finally {
      setLoading(false)
    }
  }, [filters])

  const fetchSummaryPackages = useCallback(async (config = {}) => {
    const nextPage = config.page || 1
    const nextPageSize = config.pageSize || 20
    const statusCode = Object.prototype.hasOwnProperty.call(config, 'statusCode')
      ? config.statusCode
      : summaryModal.statusCode
    const title = config.title || summaryModal.title

    setSummaryModal((prev) => ({
      ...prev,
      open: true,
      title,
      statusCode,
      loading: true,
      pagination: {
        ...prev.pagination,
        current: nextPage,
        pageSize: nextPageSize,
      },
    }))

    try {
      const result = await getMatrixPackagesApi({
        page: nextPage,
        pageSize: nextPageSize,
        keyword: filters.keyword || undefined,
        developer_account_id: filters.developer_account_id || undefined,
        status_code: statusCode || filters.status_code || undefined,
        health_code: filters.health_code || undefined,
      })
      if (!result?.success) {
        message.error(result?.message || '获取矩阵包列表失败')
        return
      }

      const data = result.data || {}
      setSummaryModal((prev) => ({
        ...prev,
        rows: Array.isArray(data.list) ? data.list : [],
        pagination: {
          current: Number(data.page || nextPage),
          pageSize: Number(data.pageSize || nextPageSize),
          total: Number(data.total || 0),
        },
      }))
    } catch (error) {
      message.error(error?.message || '获取矩阵包列表失败')
    } finally {
      setSummaryModal((prev) => ({ ...prev, loading: false }))
    }
  }, [filters, summaryModal.statusCode, summaryModal.title])

  useEffect(() => {
    fetchDicts()
  }, [fetchDicts])

  useEffect(() => {
    fetchDeveloperAccounts()
  }, [fetchDeveloperAccounts])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  useEffect(() => {
    fetchPackages({ page: 1 })
  }, [filters, fetchPackages])

  useEffect(() => {
    if (watchedStatusCode && watchedStatusCode !== DELIVERING_STATUS) {
      form.setFieldValue('health_code', undefined)
      form.setFieldValue('platform', [])
      form.setFieldValue('delivery_status_code', undefined)
    }
  }, [form, watchedStatusCode])

  const handleCreate = () => {
    setEditingRecord(null)
    form.setFieldsValue({
      package_name: '',
      app_id: '',
      new_package_version: '',
      domain_info: '',
      platform: [],
      delivery_status_code: undefined,
      developer_account_id: undefined,
      owner_user_id: undefined,
      status_code: 'COLD_STANDBY',
      health_code: undefined,
    })
    setModalOpen(true)
  }

  const handleEdit = (record) => {
    setEditingRecord(record)
    form.setFieldsValue({
      package_name: record.package_name || '',
      app_id: record.app_id || '',
      new_package_version: record.new_package_version || '',
      domain_info: record.domain_info || '',
      platform: record.status_code === DELIVERING_STATUS ? normalizePlatformCodes(record.platform_codes || record.platform) : [],
      delivery_status_code: record.status_code === DELIVERING_STATUS ? record.delivery_status_code || undefined : undefined,
      developer_account_id: record.developer_account_id || undefined,
      owner_user_id: record.owner_user_id || undefined,
      status_code: record.status_code || 'COLD_STANDBY',
      health_code: record.health_code || undefined,
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const submitIsDelivering = values.status_code === DELIVERING_STATUS
      const payload = {
        ...values,
        health_code: submitIsDelivering ? values.health_code : null,
        platform: submitIsDelivering ? values.platform : [],
        delivery_status_code: submitIsDelivering ? values.delivery_status_code : null,
      }

      setSaving(true)
      const result = editingRecord?.id
        ? await updateMatrixPackageApi(editingRecord.id, payload)
        : await createMatrixPackageApi(payload)

      if (!result?.success) {
        message.error(result?.message || '保存失败')
        return
      }

      message.success(editingRecord?.id ? '矩阵包已更新' : '矩阵包已新增')
      setModalOpen(false)
      setEditingRecord(null)
      form.resetFields()
      fetchPackages({ page: pagination.current, pageSize: pagination.pageSize })
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handlePromoteDevelopment = (record) => {
    if (!record?.developer_account_id) {
      message.warning('请先绑定开发者账号后推进开发')
      return
    }

    Modal.confirm({
      title: '确认推进开发？',
      content: `确认后「${record.package_name || '该矩阵包'}」将转为开发中，并进入冷备包生产线。`,
      okText: '确认推进',
      cancelText: '取消',
      async onOk() {
        const payload = {
          package_name: record.package_name,
          app_id: record.app_id || '',
          domain_info: record.domain_info || '',
          developer_account_id: record.developer_account_id || null,
          platform: normalizePlatformCodes(record.platform_codes || record.platform),
          delivery_status_code: record.delivery_status_code || null,
          status_code: IN_DEVELOPMENT_STATUS,
          health_code: null,
          production_stage_code: record.production_stage_code || DEFAULT_PRODUCTION_STAGE,
          expected_cold_ready_date: record.expected_cold_ready_date || null,
          latest_progress: record.latest_progress || '',
          production_checklist: Array.isArray(record.production_checklist) ? record.production_checklist : [],
        }
        const result = await updateMatrixPackageApi(record.id, payload)
        if (!result?.success) {
          message.error(result?.message || '推进开发失败')
          return Promise.reject(new Error(result?.message || '推进开发失败'))
        }
        message.success('已推进到冷备包生产线')
        fetchPackages({ page: pagination.current, pageSize: pagination.pageSize })
        return undefined
      },
    })
  }

  const handleDelete = async (record) => {
    if (!record?.id) return
    setDeletingId(record.id)
    try {
      const result = await deleteMatrixPackageApi(record.id)
      if (!result?.success) {
        message.error(result?.message || '删除失败')
        return
      }

      message.success('矩阵包已删除')
      fetchPackages({ page: pagination.current, pageSize: pagination.pageSize })
    } catch (error) {
      message.error(error?.message || '删除失败')
    } finally {
      setDeletingId(null)
    }
  }

  const columns = [
    {
      title: '矩阵包',
      dataIndex: 'package_name',
      key: 'package_name',
      fixed: 'left',
      width: 240,
      render: (value, record) => (
        <div className="matrix-package-name-cell">
          <Text strong>{value || '-'}</Text>
          <Space size={4} wrap>
            {record.app_id ? <Tag color="cyan">{record.app_id}</Tag> : null}
            {record.new_package_version ? <Tag color="blue">{record.new_package_version}</Tag> : null}
            {record.domain_info ? <Tag color="purple">{record.domain_info}</Tag> : null}
            {record.owner_name ? <Text type="secondary">{record.owner_name}</Text> : null}
          </Space>
        </div>
      ),
    },
    {
      title: '开发者账号',
      dataIndex: 'developer_account_id',
      key: 'developer_account_id',
      width: 220,
      render: (_, record) => (
        <div className="matrix-package-account-cell">
          <Text>{record.developer_account_name || '-'}</Text>
          {record.developer_company_name ? <Text type="secondary">{record.developer_company_name}</Text> : null}
        </div>
      ),
    },
    {
      title: '包状态',
      dataIndex: 'status_code',
      key: 'status_code',
      width: 130,
      render: (value, record) => {
        const meta = statusMap.get(value) || { name: record.status_name || value || '-', color: record.status_color || 'default' }
        return <Tag color={record.status_color || meta.color}>{meta.name}</Tag>
      },
    },
    {
      title: '健康度',
      dataIndex: 'health_code',
      key: 'health_code',
      width: 130,
      render: (value, record) => {
        if (record.status_code !== DELIVERING_STATUS) return <Text type="secondary">不适用</Text>
        const meta = healthMap.get(value) || { name: record.health_name || value || '-', color: record.health_color || 'default' }
        return (
          <Tag color={record.health_color || meta.color} className="matrix-health-tag">
            {HEALTH_ICON_MAP[value] || null}
            {meta.name}
          </Tag>
        )
      },
    },
    {
      title: '投放平台',
      dataIndex: 'platform',
      key: 'platform',
      width: 180,
      render: (_, record) => {
        if (record.status_code !== DELIVERING_STATUS) return '-'
        const codes = normalizePlatformCodes(record.platform_codes || record.platform)
        if (codes.length === 0) return '-'
        return (
          <Space size={4} wrap>
            {codes.map((code) => {
              const meta = platformMap.get(code) || { name: code, color: 'default' }
              return <Tag key={code} color={meta.color}>{meta.name}</Tag>
            })}
          </Space>
        )
      },
    },
    {
      title: '投放状态',
      dataIndex: 'delivery_status_code',
      key: 'delivery_status_code',
      width: 120,
      render: (value, record) => {
        if (record.status_code !== DELIVERING_STATUS) return '-'
        if (!value) return '-'
        const meta = deliveryStatusMap.get(value) || {
          name: record.delivery_status_name || value,
          color: record.delivery_status_color || 'default',
        }
        return <Tag color={record.delivery_status_color || meta.color}>{meta.name}</Tag>
      },
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 170,
      render: (value) => value || '-',
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 240,
      render: (_, record) => (
        <Space size={4}>
          <Button
            type="link"
            icon={<EditOutlined />}
            disabled={!canManage}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          {record.status_code === PENDING_DEV_STATUS ? (
            <Button
              type="link"
              disabled={!canManage}
              onClick={() => handlePromoteDevelopment(record)}
            >
              推进开发
            </Button>
          ) : null}
          <Popconfirm
            title="确认删除该矩阵包？"
            description="删除后不可恢复，并会从全景图和生产线视图中移除。"
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ danger: true, loading: deletingId === record.id }}
            onConfirm={() => handleDelete(record)}
          >
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              disabled={!canManage}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const summaryModalColumns = [
    {
      title: '矩阵包',
      dataIndex: 'package_name',
      key: 'package_name',
      width: 240,
      render: (value, record) => (
        <div className="matrix-package-name-cell">
          <Text strong>{value || '-'}</Text>
          <Space size={4} wrap>
            {record.app_id ? <Tag color="cyan">{record.app_id}</Tag> : null}
            {record.domain_info ? <Tag color="purple">{record.domain_info}</Tag> : null}
          </Space>
        </div>
      ),
    },
    {
      title: '开发者账号',
      dataIndex: 'developer_account_name',
      key: 'developer_account_name',
      width: 200,
      render: (_, record) => (
        <div className="matrix-package-account-cell">
          <Text>{record.developer_account_name || '-'}</Text>
          {record.developer_company_name ? <Text type="secondary">{record.developer_company_name}</Text> : null}
        </div>
      ),
    },
    {
      title: '包状态',
      dataIndex: 'status_code',
      key: 'status_code',
      width: 110,
      render: (value, record) => {
        const meta = statusMap.get(value) || { name: record.status_name || value || '-', color: record.status_color || 'default' }
        return <Tag color={record.status_color || meta.color}>{meta.name}</Tag>
      },
    },
    {
      title: '健康度',
      dataIndex: 'health_code',
      key: 'health_code',
      width: 110,
      render: (value, record) => {
        if (record.status_code !== DELIVERING_STATUS) return <Text type="secondary">不适用</Text>
        const meta = healthMap.get(value) || { name: record.health_name || value || '-', color: record.health_color || 'default' }
        return <Tag color={record.health_color || meta.color}>{meta.name}</Tag>
      },
    },
    {
      title: '负责人',
      dataIndex: 'owner_name',
      key: 'owner_name',
      width: 120,
      render: (value) => value || '-',
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 170,
      render: (value) => value || '-',
    },
  ]

  const summaryCards = [
    {
      title: '矩阵包总数',
      value: summary.total,
      statusCode: undefined,
      icon: <ClockCircleOutlined />,
      className: 'matrix-summary-card-total',
    },
    {
      title: '待开发',
      value: summary.pendingDev,
      statusCode: PENDING_DEV_STATUS,
      icon: <ClockCircleOutlined />,
    },
    {
      title: '开发中',
      value: summary.inDevelopment,
      statusCode: IN_DEVELOPMENT_STATUS,
      icon: <FireOutlined />,
    },
    {
      title: '冷备包',
      value: summary.coldStandby,
      statusCode: COLD_STANDBY_STATUS,
      icon: <CheckCircleOutlined />,
    },
    {
      title: '待送审',
      value: summary.pendingReviewSubmit,
      statusCode: PENDING_REVIEW_SUBMIT_STATUS,
      icon: <ClockCircleOutlined />,
    },
    {
      title: '审核中',
      value: summary.inReview,
      statusCode: 'IN_REVIEW',
      icon: <ClockCircleOutlined />,
    },
    {
      title: '热备包',
      value: summary.hotStandby,
      statusCode: 'HOT_STANDBY',
      icon: <CheckCircleOutlined />,
    },
    {
      title: '运营中',
      value: summary.delivering,
      statusCode: DELIVERING_STATUS,
      icon: <FireOutlined />,
    },
  ]

  return (
    <div className="matrix-package-page">
      <div className="matrix-package-head">
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchPackages({ page: pagination.current, pageSize: pagination.pageSize })}
            loading={loading}
          >
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} disabled={!canManage}>
            新增矩阵包
          </Button>
        </Space>
      </div>

      <Row gutter={[12, 12]} className="matrix-summary-row">
        {summaryCards.map((item) => (
          <Col key={item.title} xs={12} flex="1 1 150px">
            <Card
              variant="borderless"
              className={`matrix-summary-card matrix-summary-card-clickable ${item.className || ''}`}
              onClick={() => fetchSummaryPackages({ title: item.title, statusCode: item.statusCode, page: 1 })}
            >
              <Statistic title={item.title} value={item.value} prefix={item.icon} />
            </Card>
          </Col>
        ))}
      </Row>

      <Card variant="borderless" className="matrix-filter-card">
        <div className="matrix-filter-bar">
          <div className="matrix-filter-item matrix-filter-item-keyword">
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索名称、包ID、域名、负责人、账号"
              value={filters.keyword}
              onChange={(event) => setFilters((prev) => ({ ...prev, keyword: event.target.value }))}
            />
          </div>
          <div className="matrix-filter-item matrix-filter-item-account">
            <Select
              allowClear
              showSearch
              placeholder="开发者账号"
              value={filters.developer_account_id}
              optionFilterProp="label"
              options={developerAccountOptions.map((item) => ({
                label: `${item.company_name || '-'} / ${item.account_name || '-'}`,
                value: item.id,
              }))}
              onChange={(value) => setFilters((prev) => ({ ...prev, developer_account_id: value }))}
            />
          </div>
          <div className="matrix-filter-item matrix-filter-item-status">
            <Select
              allowClear
              placeholder="包状态"
              value={filters.status_code}
              options={statusOptions.map((item) => ({ label: item.name, value: item.code }))}
              onChange={(value) => setFilters((prev) => ({ ...prev, status_code: value }))}
            />
          </div>
          <div className="matrix-filter-item matrix-filter-item-health">
            <Select
              allowClear
              placeholder="健康度"
              value={filters.health_code}
              options={healthOptions.map((item) => ({ label: item.name, value: item.code }))}
              onChange={(value) => setFilters((prev) => ({ ...prev, health_code: value }))}
            />
          </div>
          <div className="matrix-filter-item matrix-filter-item-platform">
            <Select
              allowClear
              mode="multiple"
              placeholder="投放平台"
              value={filters.platform}
              options={platformOptions.map((item) => ({ label: item.name, value: item.code }))}
              onChange={(value) => setFilters((prev) => ({ ...prev, platform: Array.isArray(value) ? value : [] }))}
            />
          </div>
          <div className="matrix-filter-item matrix-filter-item-delivery-status">
            <Select
              allowClear
              placeholder="投放状态"
              value={filters.delivery_status_code}
              options={deliveryStatusOptions.map((item) => ({ label: item.name, value: item.code }))}
              onChange={(value) => setFilters((prev) => ({ ...prev, delivery_status_code: value }))}
            />
          </div>
        </div>
      </Card>

      <Card variant="borderless" className="matrix-table-card">
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={packages}
          scroll={{ x: 1560 }}
          rowClassName={(record) => `matrix-table-row-${getStatusTone(record.status_code)}`}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无矩阵包"
              />
            ),
          }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => fetchPackages({ page, pageSize }),
          }}
        />
      </Card>

      <Modal
        title={`${summaryModal.title || '矩阵包'}明细`}
        open={summaryModal.open}
        footer={null}
        width={980}
        destroyOnHidden
        onCancel={() => setSummaryModal((prev) => ({ ...prev, open: false }))}
      >
        <Table
          rowKey="id"
          size="middle"
          loading={summaryModal.loading}
          columns={summaryModalColumns}
          dataSource={summaryModal.rows}
          scroll={{ x: 950 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无矩阵包"
              />
            ),
          }}
          pagination={{
            current: summaryModal.pagination.current,
            pageSize: summaryModal.pagination.pageSize,
            total: summaryModal.pagination.total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => fetchSummaryPackages({ page, pageSize }),
          }}
        />
      </Modal>

      <Modal
        title={editingRecord ? '编辑矩阵包' : '新增矩阵包'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          setEditingRecord(null)
          form.resetFields()
        }}
        onOk={handleSubmit}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={720}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" className="matrix-package-form">
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="矩阵包名称"
                name="package_name"
                rules={[{ required: true, message: '请输入矩阵包名称' }]}
              >
                <Input placeholder="例如：Meta-US-热备包-01" maxLength={120} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="包ID（应用ID）" name="app_id">
                <Input placeholder="填写包ID或应用ID" maxLength={80} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="域名信息"
                name="domain_info"
                rules={[{ required: true, message: '请先补充好域名信息' }]}
              >
                <Input placeholder="例如：example.com 或多个域名用逗号分隔" maxLength={255} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="投放平台" name="platform">
                <Select
                  allowClear
                  mode="multiple"
                  disabled={!isDelivering}
                  placeholder={isDelivering ? '选择投放平台' : '仅运营中生效'}
                  options={platformOptions.map((item) => ({
                    label: item.name,
                    value: item.code,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="投放状态" name="delivery_status_code">
                <Select
                  allowClear
                  disabled={!isDelivering}
                  placeholder={isDelivering ? '选择投放状态' : '仅运营中生效'}
                  options={deliveryStatusOptions.map((item) => ({
                    label: item.name,
                    value: item.code,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="新包版本" name="new_package_version">
                <Input placeholder="例如：26/07/07版本" maxLength={50} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="开发者账号" name="developer_account_id">
                <Select
                  allowClear
                  showSearch
                  placeholder="选择开发者账号"
                  optionFilterProp="label"
                  options={developerAccountOptions.map((item) => ({
                    label: `${item.company_name || '-'} / ${item.account_name || '-'}`,
                    value: item.id,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="负责人" name="owner_user_id">
                <Select
                  allowClear
                  showSearch
                  placeholder="选择系统用户"
                  optionFilterProp="searchText"
                  filterOption={(input, option) => String(option?.searchText || '').toLowerCase().includes(input.toLowerCase())}
                  options={userOptions.map(buildUserOption)}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="包状态"
                name="status_code"
                rules={[{ required: true, message: '请选择包状态' }]}
              >
                <Select
                  options={statusOptions.map((item) => ({
                    label: item.name,
                    value: item.code,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="健康度"
                name="health_code"
                rules={isDelivering ? [{ required: true, message: '运营中必须选择健康度' }] : []}
              >
                <Select
                  disabled={!isDelivering}
                  placeholder={isDelivering ? '选择健康度' : '仅运营中生效'}
                  options={healthOptions.map((item) => ({
                    label: item.name,
                    value: item.code,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}

export default MatrixPackageSpecialPage
