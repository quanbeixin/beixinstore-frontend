import {
  EditOutlined,
  MoreOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  DatePicker,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Row,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getDeveloperAccountOptionsApi } from '../../api/developerAccount'
import {
  getMatrixPackageReviewPlansApi,
  saveMatrixPackageReviewPlanApi,
  transitionMatrixPackageReviewPlanApi,
} from '../../api/matrixPackageReviewPlan'
import { getUsersApi } from '../../api/users'
import { hasPermission } from '../../utils/access'
import './MatrixPackageReviewPlanPage.css'

const { Text } = Typography

const DEFAULT_STAGE_OPTIONS = [
  { code: 'PENDING_REVIEW_SUBMIT', name: '待送审', color: 'orange' },
  { code: 'FIRST_SUBMITTED', name: '首次送审', color: 'processing' },
  { code: 'IN_REVIEW', name: '审核中', color: 'gold' },
  { code: 'WAITING_AD_ACCOUNT', name: '待绑定广告账号信息', color: 'purple' },
  { code: 'SECOND_SUBMITTED', name: '二次送审', color: 'processing' },
  { code: 'HOT_STANDBY', name: '热备包', color: 'green' },
  { code: 'REVIEW_REJECTED', name: '被拒审', color: 'red' },
]

const DEFAULT_AD_BINDING_OPTIONS = [
  { code: 'NOT_REQUIRED', name: '不需要', color: 'default' },
  { code: 'PENDING', name: '待绑定', color: 'gold' },
  { code: 'BOUND', name: '已绑定', color: 'green' },
  { code: 'BLOCKED', name: '阻塞', color: 'red' },
]

const TRANSITION_ACTIONS = [
  { code: 'FIRST_SUBMITTED', label: '标记首次送审' },
  { code: 'IN_REVIEW', label: '标记审核中' },
  { code: 'WAITING_AD_ACCOUNT', label: '待绑定广告账号' },
  { code: 'SECOND_SUBMITTED', label: '标记二次送审' },
  { code: 'HOT_STANDBY', label: '标记热备包' },
  { code: 'REVIEW_REJECTED', label: '标记被拒审', danger: true },
]

const FLOW_STAGE_CODES = [
  'PENDING_REVIEW_SUBMIT',
  'FIRST_SUBMITTED',
  'IN_REVIEW',
  'WAITING_AD_ACCOUNT',
  'SECOND_SUBMITTED',
]

const REVIEW_PLAN_TABS = [
  { key: 'ALL', label: '全部' },
  { key: 'PENDING_REVIEW_SUBMIT', label: '待送审' },
  { key: 'IN_FLOW', label: '流程中' },
]

function buildOptionMap(options = []) {
  return new Map(options.map((item) => [item.code, item]))
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

function toDateTimeValue(value) {
  return value ? dayjs(value) : null
}

function formatDateTimeValue(value) {
  return value ? value.format('YYYY-MM-DD HH:mm:ss') : null
}

function formatDisplayTime(value) {
  if (!value) return '-'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : value
}

function getReviewTime(primaryValue, fallbackValue) {
  return primaryValue || fallbackValue || null
}

function MatrixPackageReviewPlanPage() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [transitioningKey, setTransitioningKey] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [stageOptions, setStageOptions] = useState(DEFAULT_STAGE_OPTIONS)
  const [adBindingOptions, setAdBindingOptions] = useState(DEFAULT_AD_BINDING_OPTIONS)
  const [developerAccountOptions, setDeveloperAccountOptions] = useState([])
  const [userOptions, setUserOptions] = useState([])
  const [activeTab, setActiveTab] = useState('ALL')
  const [filters, setFilters] = useState({
    keyword: '',
    review_stage_code: undefined,
    developer_account_id: undefined,
    owner_user_id: undefined,
  })

  const canManage = hasPermission('demand.manage')
  const stageMap = useMemo(() => buildOptionMap(stageOptions), [stageOptions])
  const adBindingMap = useMemo(() => buildOptionMap(adBindingOptions), [adBindingOptions])

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

  const fetchPlans = useCallback(async (next = {}) => {
    const nextPage = next.page || 1
    const nextPageSize = next.pageSize || 20
    setLoading(true)
    try {
      const result = await getMatrixPackageReviewPlansApi({
        page: nextPage,
        pageSize: nextPageSize,
        keyword: filters.keyword || undefined,
        review_stage_group: activeTab === 'ALL' ? undefined : activeTab,
        review_stage_code: filters.review_stage_code || undefined,
        developer_account_id: filters.developer_account_id || undefined,
        owner_user_id: filters.owner_user_id || undefined,
      })
      if (!result?.success) {
        message.error(result?.message || '获取送审排期失败')
        return
      }

      const data = result.data || {}
      setRows(Array.isArray(data.list) ? data.list : [])
      setPagination({
        current: Number(data.page || nextPage),
        pageSize: Number(data.pageSize || nextPageSize),
        total: Number(data.total || 0),
      })
      if (Array.isArray(data.stage_options) && data.stage_options.length > 0) {
        setStageOptions(data.stage_options)
      }
      if (Array.isArray(data.ad_account_binding_options) && data.ad_account_binding_options.length > 0) {
        setAdBindingOptions(data.ad_account_binding_options)
      }
    } catch (error) {
      message.error(error?.message || '获取送审排期失败')
    } finally {
      setLoading(false)
    }
  }, [activeTab, filters])

  useEffect(() => {
    fetchDeveloperAccounts()
  }, [fetchDeveloperAccounts])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  useEffect(() => {
    fetchPlans({ page: 1 })
  }, [filters, fetchPlans])

  const openEditModal = (record) => {
    setEditingRecord(record)
    form.setFieldsValue({
      review_stage_code: record.review_stage_code || 'PENDING_REVIEW_SUBMIT',
      planned_first_submit_at: toDateTimeValue(record.planned_first_submit_at),
      planned_second_submit_at: toDateTimeValue(record.planned_second_submit_at),
      ad_account_binding_status: record.ad_account_binding_status || 'NOT_REQUIRED',
      owner_user_id: record.owner_user_id || undefined,
      remark: record.remark || '',
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!editingRecord?.package_id) return
    try {
      const values = await form.validateFields()
      const payload = {
        ...values,
        planned_first_submit_at: formatDateTimeValue(values.planned_first_submit_at),
        planned_second_submit_at: formatDateTimeValue(values.planned_second_submit_at),
      }

      setSaving(true)
      const result = await saveMatrixPackageReviewPlanApi(editingRecord.package_id, payload)
      if (!result?.success) {
        message.error(result?.message || '保存失败')
        return
      }
      message.success('送审排期已保存')
      setModalOpen(false)
      setEditingRecord(null)
      form.resetFields()
      fetchPlans({ page: pagination.current, pageSize: pagination.pageSize })
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleTransition = async (record, action) => {
    if (!record?.package_id || !action?.code) return
    const actionKey = `${record.package_id}-${action.code}`
    setTransitioningKey(actionKey)
    try {
      const result = await transitionMatrixPackageReviewPlanApi(record.package_id, {
        review_stage_code: action.code,
      })
      if (!result?.success) {
        message.error(result?.message || '更新阶段失败')
        return Promise.reject(new Error(result?.message || '更新阶段失败'))
      }
      message.success('送审阶段已更新')
      fetchPlans({ page: pagination.current, pageSize: pagination.pageSize })
      return undefined
    } catch (error) {
      message.error(error?.message || '更新阶段失败')
      return Promise.reject(error)
    } finally {
      setTransitioningKey('')
    }
  }

  const getStageMeta = (record) => (
    stageMap.get(record.review_stage_code) || {
      name: record.review_stage_name || record.review_stage_code || '-',
      color: record.review_stage_color || 'default',
    }
  )

  const getAdBindingMeta = (record) => (
    adBindingMap.get(record.ad_account_binding_status) || {
      name: record.ad_account_binding_name || record.ad_account_binding_status || '-',
      color: record.ad_account_binding_color || 'default',
    }
  )

  const handleTransitionMenuClick = (record, actionCode) => {
    const action = TRANSITION_ACTIONS.find((item) => item.code === actionCode)
    if (!action) return

    Modal.confirm({
      title: `确认${action.label}？`,
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: action.danger },
      onOk: () => handleTransition(record, action),
    })
  }

  const renderStageRail = (record) => {
    const currentIndex = FLOW_STAGE_CODES.indexOf(record.review_stage_code)
    const isRejected = record.review_stage_code === 'REVIEW_REJECTED'

    return (
      <div className="matrix-review-stage-rail">
        {FLOW_STAGE_CODES.map((code, index) => {
          const meta = stageMap.get(code) || { name: code }
          const active = index === currentIndex
          const done = currentIndex > index
          return (
            <div
              key={code}
              className={[
                'matrix-review-stage-node',
                active ? 'is-active' : '',
                done ? 'is-done' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="matrix-review-stage-dot" />
              <span className="matrix-review-stage-name">{meta.name}</span>
            </div>
          )
        })}
        {isRejected ? (
          <Tag color="red" className="matrix-review-stage-terminal">被拒审</Tag>
        ) : null}
      </div>
    )
  }

  const renderPlanCard = (record) => {
    const stageMeta = getStageMeta(record)
    const adBindingMeta = getAdBindingMeta(record)
    const actionItems = TRANSITION_ACTIONS.map((action) => ({
      key: action.code,
      label: action.label.replace(/^标记/, ''),
      danger: action.danger,
      disabled: !canManage || transitioningKey === `${record.package_id}-${action.code}`,
    }))

    return (
      <div
        key={record.package_id}
        className={[
          'matrix-review-plan-card',
          record.review_stage_code === 'REVIEW_REJECTED' ? 'is-rejected' : '',
        ].filter(Boolean).join(' ')}
      >
        <div className="matrix-review-plan-card-main">
          <div className="matrix-review-plan-card-header">
            <div className="matrix-review-plan-title-block">
              <Space size={8} wrap>
                <Text strong className="matrix-review-plan-title">{record.package_name || '-'}</Text>
                <Tag color={record.review_stage_color || stageMeta.color}>{stageMeta.name}</Tag>
                {record.app_id ? <Text type="secondary" className="matrix-review-plan-inline-meta">包ID：{record.app_id}</Text> : null}
                {record.domain_info ? <Text type="secondary" className="matrix-review-plan-inline-meta">域名：{record.domain_info}</Text> : null}
              </Space>
              <Space size={6} wrap className="matrix-review-plan-sub-tags">
                {record.new_package_version ? <Tag color="blue">{record.new_package_version}</Tag> : null}
              </Space>
            </div>

            <Space size={8} className="matrix-review-plan-card-actions">
              <Button
                icon={<EditOutlined />}
                disabled={!canManage}
                onClick={() => openEditModal(record)}
              >
                编辑排期
              </Button>
              <Dropdown
                trigger={['click']}
                menu={{
                  items: actionItems,
                  onClick: ({ key }) => handleTransitionMenuClick(record, key),
                }}
              >
                <Button icon={<MoreOutlined />} disabled={!canManage}>
                  更多流转
                </Button>
              </Dropdown>
            </Space>
          </div>

          {renderStageRail(record)}

          <div className="matrix-review-plan-info-grid">
            <div className="matrix-review-plan-info-item">
              <span>开发者账号</span>
              <strong>
                {[record.developer_account_name, record.developer_company_name].filter(Boolean).join(' / ') || '-'}
              </strong>
            </div>
            <div className="matrix-review-plan-info-item">
              <span>负责人</span>
              <strong>{record.owner_name || record.package_owner_name || '-'}</strong>
            </div>
            <div className="matrix-review-plan-info-item">
              <span>包状态</span>
              <Tag color={record.status_color || 'default'}>{record.status_name || record.status_code || '-'}</Tag>
            </div>
            <div className="matrix-review-plan-info-item">
              <span>首次送审</span>
              <strong>{formatDisplayTime(getReviewTime(record.planned_first_submit_at, record.actual_first_submit_at))}</strong>
            </div>
            <div className="matrix-review-plan-info-item">
              <span>广告账号</span>
              <Tag color={record.ad_account_binding_color || adBindingMeta.color}>{adBindingMeta.name}</Tag>
            </div>
            <div className="matrix-review-plan-info-item">
              <span>二次送审</span>
              <strong>{formatDisplayTime(getReviewTime(record.planned_second_submit_at, record.actual_second_submit_at))}</strong>
            </div>
            <div className="matrix-review-plan-info-item matrix-review-plan-remark">
              <span>备注</span>
              <strong>{record.remark || '-'}</strong>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="matrix-review-plan-page">
      <Card variant="borderless" className="matrix-review-plan-filter-card">
        <div className="matrix-review-plan-tabs-row">
          <Tabs
            activeKey={activeTab}
            items={REVIEW_PLAN_TABS}
            className="matrix-review-plan-tabs"
            onChange={(key) => {
              setActiveTab(key)
              setFilters((prev) => ({ ...prev, review_stage_code: undefined }))
            }}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchPlans({ page: pagination.current, pageSize: pagination.pageSize })}
            loading={loading}
          >
            刷新
          </Button>
        </div>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={7}>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索名称、包ID、域名、账号、负责人"
              value={filters.keyword}
              onChange={(event) => setFilters((prev) => ({ ...prev, keyword: event.target.value }))}
            />
          </Col>
          <Col xs={12} md={5}>
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
          </Col>
          <Col xs={12} md={5}>
            <Select
              allowClear
              disabled={activeTab !== 'ALL'}
              placeholder="送审阶段"
              value={filters.review_stage_code}
              options={stageOptions.map((item) => ({ label: item.name, value: item.code }))}
              onChange={(value) => setFilters((prev) => ({ ...prev, review_stage_code: value }))}
            />
          </Col>
          <Col xs={24} md={7}>
            <Select
              allowClear
              showSearch
              placeholder="送审负责人"
              value={filters.owner_user_id}
              optionFilterProp="searchText"
              filterOption={(input, option) => String(option?.searchText || '').toLowerCase().includes(input.toLowerCase())}
              options={userOptions.map(buildUserOption)}
              onChange={(value) => setFilters((prev) => ({ ...prev, owner_user_id: value }))}
            />
          </Col>
        </Row>
      </Card>

      <Card variant="borderless" className="matrix-review-plan-list-card">
        <Spin spinning={loading}>
          {rows.length > 0 ? (
            <div className="matrix-review-plan-list">
              {rows.map(renderPlanCard)}
            </div>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无送审排期"
            />
          )}
        </Spin>
        <div className="matrix-review-plan-pagination">
          <Pagination
            current={pagination.current}
            pageSize={pagination.pageSize}
            total={pagination.total}
            showSizeChanger
            showTotal={(total) => `共 ${total} 条`}
            onChange={(page, pageSize) => fetchPlans({ page, pageSize })}
          />
        </div>
      </Card>

      <Modal
        title={editingRecord ? `编辑送审排期：${editingRecord.package_name || '-'}` : '编辑送审排期'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false)
          setEditingRecord(null)
          form.resetFields()
        }}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={760}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" className="matrix-review-plan-form">
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item label="送审阶段" name="review_stage_code" rules={[{ required: true, message: '请选择送审阶段' }]}>
                <Select options={stageOptions.map((item) => ({ label: item.name, value: item.code }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="广告账号绑定状态" name="ad_account_binding_status" rules={[{ required: true, message: '请选择广告账号绑定状态' }]}>
                <Select options={adBindingOptions.map((item) => ({ label: item.name, value: item.code }))} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="首次送审时间" name="planned_first_submit_at">
                <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="二次送审时间" name="planned_second_submit_at">
                <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label="送审负责人" name="owner_user_id">
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
            <Col xs={24}>
              <Form.Item label="备注" name="remark">
                <Input.TextArea rows={4} maxLength={1000} showCount placeholder="记录送审安排、审核反馈、账号绑定说明等" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}

export default MatrixPackageReviewPlanPage
