import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  Modal,
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
import { getMatrixPackagesApi } from '../../api/matrixPackage'
import './AppVersionReleaseApplyPage.css'

const { Text } = Typography

const URGENCY_OPTIONS = [
  { label: 'P0', value: 'P0' },
  { label: 'P1', value: 'P1' },
  { label: 'P2', value: 'P2' },
  { label: 'P3', value: 'P3' },
]

function formatDateTimeValue(value) {
  return value ? value.format('YYYY-MM-DD HH:mm:ss') : null
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
  const [packages, setPackages] = useState([])

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

  useEffect(() => {
    fetchPackages()
  }, [fetchPackages])

  const packageOptions = useMemo(() => packages.map(buildPackageOption), [packages])

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
        package_ids: values.package_ids,
        app_version: values.app_version,
        urgency_code: values.urgency_code,
        expected_submit_at: formatDateTimeValue(values.expected_submit_at),
        remark: values.remark || '',
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
          className="app-version-release-apply-alert"
        />

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            urgency_code: 'P1',
            expected_submit_at: null,
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
            <Col xs={24} md={12}>
              <Form.Item
                label="版本号"
                name="app_version"
                rules={[{ required: true, message: '请填写版本号' }]}
              >
                <Input allowClear maxLength={80} placeholder="例如 1.0.3" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="紧急程度"
                name="urgency_code"
                rules={[{ required: true, message: '请选择紧急程度' }]}
              >
                <Select options={URGENCY_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="送审预期" name="expected_submit_at">
                <DatePicker
                  showTime
                  format="YYYY-MM-DD HH:mm:ss"
                  placeholder="选择送审预期"
                  disabledDate={(current) => current && current < dayjs().startOf('day')}
                  style={{ width: '100%' }}
                />
              </Form.Item>
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
