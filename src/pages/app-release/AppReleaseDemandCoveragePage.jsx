import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getAppReleaseDemandCoverageApi } from '../../api/appVersionRelease'
import './AppReleaseDemandCoveragePage.css'

const { Text } = Typography

const DEMAND_STATUS_OPTIONS = [
  { value: 'TODO', label: '待处理' },
  { value: 'IN_PROGRESS', label: '进行中' },
  { value: 'PAUSED', label: '已挂起' },
  { value: 'DONE', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' },
]

function renderCoverageSummary(summary = {}, onClick) {
  const total = Number(summary.total || 0)
  const content = (
    <Space className="app-release-demand-coverage-summary" size={2}>
      <Tag color="green">已覆盖 {Number(summary.covered || 0)}</Tag>
      <Tag color="gold">审核中 {Number(summary.in_review || 0)}</Tag>
      <Tag color="cyan">已申请 {Number(summary.application_submitted || 0)}</Tag>
      <Text type="secondary">共 {total} 个包</Text>
    </Space>
  )
  return onClick ? <Button type="link" className="app-release-demand-coverage-summary-button" onClick={onClick}>{content}</Button> : content
}

function AppReleaseDemandCoveragePage() {
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [coverageModal, setCoverageModal] = useState({ open: false, demand: null })
  const currentPageSize = pagination.pageSize

  const loadData = useCallback(async (current = 1, pageSize = currentPageSize) => {
    setLoading(true)
    try {
      const result = await getAppReleaseDemandCoverageApi({
        page: current,
        pageSize,
        keyword: keyword || undefined,
        status: status || undefined,
      })
      if (!result?.success) {
        message.error(result?.message || '获取APP发版需求失败')
        return
      }
      setRows(Array.isArray(result.data?.list) ? result.data.list : [])
      setPagination({
        current: Number(result.data?.page || current),
        pageSize: Number(result.data?.pageSize || pageSize),
        total: Number(result.data?.total || 0),
      })
    } catch (error) {
      message.error(error?.message || '获取APP发版需求失败')
    } finally {
      setLoading(false)
    }
  }, [currentPageSize, keyword, status])

  useEffect(() => {
    loadData(1, currentPageSize)
  }, [currentPageSize, loadData])

  const openCoverage = (record) => {
    setCoverageModal({ open: true, demand: record })
  }

  const closeCoverage = () => {
    setCoverageModal({ open: false, demand: null })
  }

  const coverageRows = useMemo(
    () => Array.isArray(coverageModal.demand?.package_coverage) ? coverageModal.demand.package_coverage : [],
    [coverageModal.demand],
  )

  const columns = [
    {
      title: '需求编号',
      dataIndex: 'id',
      width: 140,
      render: (value) => <Tag color="blue">{value || '-'}</Tag>,
    },
    {
      title: '需求名称',
      dataIndex: 'name',
      width: 280,
      ellipsis: true,
    },
    {
      title: '需求状态',
      dataIndex: 'status_name',
      width: 110,
      render: (value, record) => <Tag color={record.status_color || 'default'}>{value || '-'}</Tag>,
    },
    {
      title: '负责人',
      dataIndex: 'owner_name',
      width: 120,
      render: (value) => value || '-',
    },
    {
      title: '预计上线',
      dataIndex: 'expected_release_date',
      width: 120,
      render: (value) => value || '-',
    },
    {
      title: '覆盖范围',
      key: 'coverage_summary',
      render: (_, record) => renderCoverageSummary(record.coverage_summary, () => openCoverage(record)),
    },
  ]

  const coverageColumns = [
    {
      title: '矩阵包',
      dataIndex: 'package_name',
      width: 170,
      render: (value, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{value || '-'}</Text>
          <Text type="secondary">{record.app_id || '-'}</Text>
        </Space>
      ),
    },
    {
      title: '覆盖状态',
      dataIndex: 'coverage_status_name',
      width: 130,
      render: (value, record) => <Tag color={record.coverage_status_color || 'default'}>{value || '-'}</Tag>,
    },
    {
      title: '匹配版本',
      dataIndex: 'matched_version_number',
      width: 130,
      render: (value) => value || '-',
    },
    {
      title: '发版进度',
      dataIndex: 'release_status_name',
      width: 120,
      render: (value, record) => (value ? <Tag color={record.release_status_color || 'default'}>{value}</Tag> : '-'),
    },
    {
      title: '发版申请',
      dataIndex: 'release_request_no',
      width: 170,
      render: (value) => value || '-',
    },
    {
      title: '说明',
      key: 'explanation',
      render: (_, record) => {
        if (record.coverage_status === 'COVERED') return <Text type="success">版本已上架，已覆盖该需求</Text>
        if (record.coverage_status === 'IN_REVIEW') return <Text type="warning">已包含功能，当前审核中</Text>
        if (record.coverage_status === 'APPLICATION_SUBMITTED') return <Text type="secondary">已包含功能，已提交发版申请</Text>
        if (record.coverage_status === 'INCLUDED_NOT_RELEASED') return <Text type="secondary">版本包含功能，但尚未完成发布</Text>
        return <Text type="secondary">当前版本信息未包含该需求</Text>
      },
    },
  ]

  return (
    <div className="app-release-demand-coverage-page">
      <Card className="app-release-demand-coverage-card" bordered={false}>
        <div className="app-release-demand-coverage-toolbar">
          <Space wrap>
            <Input
              value={keywordInput}
              className="app-release-demand-coverage-search"
              placeholder="搜索需求编号或名称"
              prefix={<SearchOutlined />}
              allowClear
              onChange={(event) => setKeywordInput(event.target.value)}
              onPressEnter={() => {
                setKeyword(keywordInput.trim())
                setPagination((current) => ({ ...current, current: 1 }))
              }}
            />
            <Select
              value={status || undefined}
              className="app-release-demand-coverage-status"
              placeholder="需求状态"
              allowClear
              options={DEMAND_STATUS_OPTIONS}
              onChange={(value) => {
                setStatus(value || '')
                setPagination((current) => ({ ...current, current: 1 }))
              }}
            />
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={() => {
                setKeyword(keywordInput.trim())
                setPagination((current) => ({ ...current, current: 1 }))
              }}
            >
              查询
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => loadData(1, currentPageSize)}>
              刷新
            </Button>
          </Space>
          <Text type="secondary">仅展示已标记“需要 APP 发版”的需求</Text>
        </div>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={rows}
          columns={columns}
          scroll={{ x: 980 }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
          onChange={(nextPagination) => loadData(nextPagination.current, nextPagination.pageSize)}
          locale={{ emptyText: '暂无需要 APP 发版的需求' }}
        />
      </Card>

      <Modal
        title={coverageModal.demand ? `${coverageModal.demand.id} · ${coverageModal.demand.name} · 覆盖范围` : '覆盖范围'}
        open={coverageModal.open}
        width={1120}
        footer={null}
        destroyOnHidden
        onCancel={closeCoverage}
      >
        <div className="app-release-demand-coverage-modal-summary">
          {coverageModal.demand ? renderCoverageSummary(coverageModal.demand.coverage_summary) : null}
        </div>
        <Table
          rowKey="matrix_package_id"
          size="small"
          dataSource={coverageRows}
          columns={coverageColumns}
          pagination={false}
          scroll={{ x: 1000, y: 520 }}
          locale={{ emptyText: '暂无矩阵包' }}
        />
      </Modal>
    </div>
  )
}

export default AppReleaseDemandCoveragePage
