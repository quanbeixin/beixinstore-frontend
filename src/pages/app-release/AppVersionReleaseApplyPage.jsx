import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd'
import { SendOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createAppVersionReleaseApplicationsApi } from '../../api/appVersionRelease'
import { getMatrixPackageSideNotesApi, getMatrixPackagesApi } from '../../api/matrixPackage'
import { getWorkDemandsApi } from '../../api/work'
import './AppVersionReleaseApplyPage.css'

const { Text } = Typography

const URGENCY_OPTIONS = [
  { label: 'P0', value: 'P0' },
  { label: 'P1', value: 'P1' },
  { label: 'P2', value: 'P2' },
  { label: 'P3', value: 'P3' },
]

const RELEASE_TYPE_OPTIONS = [
  { label: '首次发版', value: 'FIRST_RELEASE' },
  { label: '版本迭代', value: 'VERSION_UPDATE' },
]

function formatDateValue(value) {
  return value ? value.format('YYYY-MM-DD') : null
}

function parseJsonObject(value) {
  const text = String(value || '').trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function extractFrontendAppConsoleUrl(notes = []) {
  const frontendNote = Array.isArray(notes) ? notes.find((item) => item?.note_type === 'FRONTEND') : null
  const content = String(frontendNote?.content || '').trim() || String(frontendNote?.confirmed_content || '').trim()
  const parsed = parseJsonObject(content)
  return String(parsed.appConsoleUrl || '').trim()
}

function buildPackageOption(item) {
  const appId = item.app_id ? `包ID：${item.app_id}` : '包ID：-'
  const domain = item.domain_info ? `域名：${item.domain_info}` : '域名：-'
  return {
    label: (
      <Space direction="vertical" size={0}>
        <Text>{item.package_name || `矩阵包 ${item.id}`}</Text>
        <Text type="secondary" className="app-version-release-apply-option-meta">
          {appId} / {domain}
        </Text>
      </Space>
    ),
    value: item.id,
    searchText: `${item.package_name || ''} ${item.app_id || ''} ${item.domain_info || ''}`,
  }
}

function buildDemandOption(item) {
  return {
    label: (
      <Space direction="vertical" size={0}>
        <Text>{item.name || item.id}</Text>
        <Text type="secondary" className="app-version-release-apply-option-meta">
          {item.id || '-'} / {item.owner_name || '-'} / {item.status || '-'}
        </Text>
      </Space>
    ),
    value: item.id,
    searchText: `${item.id || ''} ${item.name || ''} ${item.owner_name || ''}`,
  }
}

function renderConflictList(conflicts = []) {
  return (
    <div className="app-version-release-apply-conflicts">
      {conflicts.map((item) => (
        <div className="app-version-release-apply-conflict" key={`${item.matrix_package_id}-${item.id}`}>
          <Space direction="vertical" size={2}>
            <Text strong>{item.package_name || `矩阵包 ${item.matrix_package_id}`}</Text>
            <Text type="secondary">
              包ID：{item.app_id || '-'} / 域名：{item.domain_info || '-'} / 版本：{item.app_version || '-'}
            </Text>
          </Space>
          <Tag color="orange">{item.release_status_name || item.release_status || '未上架'}</Tag>
        </div>
      ))}
    </div>
  )
}

function AppVersionReleaseApplyPage() {
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [packageLoading, setPackageLoading] = useState(false)
  const [demandLoading, setDemandLoading] = useState(false)
  const [packages, setPackages] = useState([])
  const [demands, setDemands] = useState([])
  const [appConsoleUrlMap, setAppConsoleUrlMap] = useState({})

  const fetchPackages = useCallback(async () => {
    setPackageLoading(true)
    try {
      const result = await getMatrixPackagesApi({
        page: 1,
        pageSize: 1000,
      })
      if (!result?.success) {
        message.error(result?.message || '获取矩阵包失败')
        return
      }
      setPackages(Array.isArray(result.data?.list) ? result.data.list : [])
    } catch (error) {
      message.error(error?.message || '获取矩阵包失败')
    } finally {
      setPackageLoading(false)
    }
  }, [])

  const fetchDemands = useCallback(async () => {
    setDemandLoading(true)
    try {
      const result = await getWorkDemandsApi({
        page: 1,
        pageSize: 200,
        exclude_completed: 1,
        exclude_cancelled: 1,
      })
      if (!result?.success) {
        message.error(result?.message || '获取需求列表失败')
        return
      }
      setDemands(Array.isArray(result.data?.list) ? result.data.list : [])
    } catch (error) {
      message.error(error?.message || '获取需求列表失败')
    } finally {
      setDemandLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPackages()
    fetchDemands()
  }, [fetchDemands, fetchPackages])

  const packageOptions = useMemo(() => packages.map(buildPackageOption), [packages])
  const demandOptions = useMemo(() => demands.map(buildDemandOption), [demands])
  const watchedPackageIds = Form.useWatch('package_ids', form)
  const selectedPackageIds = useMemo(() => (
    Array.isArray(watchedPackageIds) ? watchedPackageIds : []
  ), [watchedPackageIds])
  const packageMap = useMemo(() => new Map(packages.map((item) => [Number(item.id), item])), [packages])
  const selectedPackages = useMemo(
    () => selectedPackageIds.map((id) => packageMap.get(Number(id))).filter(Boolean),
    [packageMap, selectedPackageIds],
  )

  useEffect(() => {
    const missingPackageIds = selectedPackageIds
      .map((id) => Number(id))
      .filter((id) => id > 0 && !Object.prototype.hasOwnProperty.call(appConsoleUrlMap, id))
    if (missingPackageIds.length === 0) return

    let cancelled = false
    Promise.all(missingPackageIds.map(async (packageId) => {
      try {
        const result = await getMatrixPackageSideNotesApi(packageId)
        return [packageId, result?.success ? extractFrontendAppConsoleUrl(result.data) : '']
      } catch {
        return [packageId, '']
      }
    })).then((entries) => {
      if (cancelled) return
      setAppConsoleUrlMap((current) => {
        const next = { ...current }
        entries.forEach(([packageId, appConsoleUrl]) => {
          next[packageId] = appConsoleUrl || ''
        })
        return next
      })
    })

    return () => {
      cancelled = true
    }
  }, [appConsoleUrlMap, selectedPackageIds])

  useEffect(() => {
    const currentItems = Array.isArray(form.getFieldValue('package_items')) ? form.getFieldValue('package_items') : []
    const currentMap = new Map(currentItems.map((item) => [Number(item?.package_id), item]))
    const nextItems = selectedPackageIds.map((packageId) => {
      const currentItem = currentMap.get(Number(packageId))
      const frontendAppConsoleUrl = appConsoleUrlMap[Number(packageId)] || ''
      return {
        package_id: Number(packageId),
        app_version: currentItem?.app_version || '',
        urgency_code: currentItem?.urgency_code || 'P1',
        app_console_url: currentItem?.app_console_url || frontendAppConsoleUrl,
        expected_submit_at: currentItem?.expected_submit_at || null,
      }
    })
    const hasChanged = JSON.stringify(nextItems.map((item) => ({
      package_id: item.package_id,
      app_version: item.app_version,
      urgency_code: item.urgency_code,
      app_console_url: item.app_console_url,
      expected_submit_at: item.expected_submit_at ? dayjs(item.expected_submit_at).valueOf() : null,
    }))) !== JSON.stringify((currentItems || []).map((item) => ({
      package_id: Number(item?.package_id),
      app_version: item?.app_version || '',
      urgency_code: item?.urgency_code || 'P1',
      app_console_url: item?.app_console_url || '',
      expected_submit_at: item?.expected_submit_at ? dayjs(item.expected_submit_at).valueOf() : null,
    })))
    if (hasChanged) {
      form.setFieldsValue({ package_items: nextItems })
    }
  }, [appConsoleUrlMap, form, selectedPackageIds])

  const showConflicts = (conflicts = []) => {
    Modal.warning({
      title: '存在未上架的发版记录',
      width: 720,
      content: (
        <div>
          <Text>以下 app 包已有未上架的发版记录，请先到 APP版本发布列表修改已有记录，本次申请未创建成功。</Text>
          {renderConflictList(conflicts)}
        </div>
      ),
      okText: '知道了',
    })
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const result = await createAppVersionReleaseApplicationsApi({
        release_type: values.release_type,
        related_demand_id: values.related_demand_id || '',
        remark: values.remark || '',
        items: (values.package_items || []).map((item) => ({
          package_id: item.package_id,
          app_version: item.app_version,
          app_console_url: item.app_console_url || '',
          urgency_code: item.urgency_code,
          expected_submit_at: formatDateValue(item.expected_submit_at),
        })),
      })
      if (!result?.success) {
        message.error(result?.message || '创建版本发布申请失败')
        return
      }
      message.success(result?.message || '版本发布申请已创建')
      form.resetFields()
      navigate('/app-version-release')
    } catch (error) {
      if (error?.errorFields) return
      const conflicts = Array.isArray(error?.data?.conflicts) ? error.data.conflicts : []
      if (conflicts.length > 0) {
        showConflicts(conflicts)
        return
      }
      message.error(error?.message || '创建版本发布申请失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="app-version-release-apply-page">
      <Card variant="borderless" className="app-version-release-apply-card">
        <Alert
          type="info"
          showIcon
          title="同一次申请可选择多个 app 包，系统会为每个 app 包分别创建一条发版记录。"
          description={(
            <a
              href="https://fyze31atzb.feishu.cn/base/DJawbjqnLa3zysswqUAczCSon3b?table=ldxMbmmKsDdaivtN"
              target="_blank"
              rel="noreferrer"
            >
              Android APP 发版说明书
            </a>
          )}
          className="app-version-release-apply-alert"
        />

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            release_type: 'VERSION_UPDATE',
            package_items: [],
          }}
          className="app-version-release-apply-form"
        >
          <Row gutter={16}>
            <Col xs={24}>
              <Form.Item
                label="app包"
                name="package_ids"
                rules={[{ required: true, message: '请选择app包' }]}
              >
                <Select
                  mode="multiple"
                  allowClear
                  showSearch
                  loading={packageLoading}
                  placeholder="选择一个或多个矩阵包"
                  optionFilterProp="searchText"
                  filterOption={(input, option) => String(option?.searchText || '').toLowerCase().includes(input.toLowerCase())}
                  options={packageOptions}
                />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item
                label="发版类型"
                name="release_type"
                rules={[{ required: true, message: '请选择发版类型' }]}
              >
                <Radio.Group
                  optionType="button"
                  buttonStyle="solid"
                  options={RELEASE_TYPE_OPTIONS}
                />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label="关联需求" name="related_demand_id">
                <Select
                  allowClear
                  showSearch
                  loading={demandLoading}
                  placeholder="选择项目管理中的需求"
                  optionFilterProp="searchText"
                  filterOption={(input, option) => String(option?.searchText || '').toLowerCase().includes(input.toLowerCase())}
                  options={demandOptions}
                />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <div className="app-version-release-apply-package-list">
                {selectedPackages.length === 0 ? (
                  <div className="app-version-release-apply-package-empty">
                    选择 app 包后，在这里逐个填写版本信息
                  </div>
                ) : selectedPackages.map((pkg, index) => (
                  <Card
                    key={pkg.id}
                    size="small"
                    title={pkg.package_name || `矩阵包 ${pkg.id}`}
                    className="app-version-release-apply-package-card"
                    extra={(
                      <Text type="secondary" className="app-version-release-apply-package-meta">
                        包ID：{pkg.app_id || '-'} / 域名：{pkg.domain_info || '-'}
                      </Text>
                    )}
                  >
                    <Form.Item name={['package_items', index, 'package_id']} hidden>
                      <Input />
                    </Form.Item>
                    <Row gutter={12} className="app-version-release-apply-package-fields">
                      <Col xs={24} md={6}>
                        <Form.Item
                          label="版本号"
                          name={['package_items', index, 'app_version']}
                          rules={[{ required: true, message: '请填写版本号' }]}
                        >
                          <Input allowClear maxLength={80} placeholder="例如 1.0.3" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item
                          label="紧急程度"
                          name={['package_items', index, 'urgency_code']}
                          rules={[{ required: true, message: '请选择紧急程度' }]}
                        >
                          <Select options={URGENCY_OPTIONS} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={7}>
                        <Form.Item
                          label="APP后台地址"
                          name={['package_items', index, 'app_console_url']}
                        >
                          <Input allowClear maxLength={1000} placeholder="https://play.google.com/console/..." />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={5}>
                        <Form.Item
                          label="送审预期"
                          name={['package_items', index, 'expected_submit_at']}
                        >
                          <DatePicker
                            format="YYYY-MM-DD"
                            placeholder="选择送审预期"
                            disabledDate={(current) => current && current < dayjs().startOf('day')}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>
                ))}
              </div>
            </Col>
            <Col xs={24}>
              <Form.Item label="备注" name="remark">
                <Input.TextArea rows={4} maxLength={1000} showCount placeholder="记录本次发版申请的背景、注意事项或特殊要求" />
              </Form.Item>
            </Col>
          </Row>

          <div className="app-version-release-apply-actions">
            <Button onClick={() => navigate('/app-version-release')}>
              返回列表
            </Button>
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={submitting}
              onClick={handleSubmit}
            >
              提交申请
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  )
}

export default AppVersionReleaseApplyPage
