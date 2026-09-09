import { EyeOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getAppReleaseDemandCoverageApi } from '../../api/appVersionRelease'
import { getAppVersionReleaseVersionInfoApi } from '../../api/appVersionRelease'
import VersionInfoDetail from '../../components/VersionInfoDetail'
import './AppReleaseDemandCoveragePage.css'

const { Text } = Typography

const DEMAND_STATUS_OPTIONS = [
  { value: 'TODO', label: '待处理' },
  { value: 'IN_PROGRESS', label: '进行中' },
  { value: 'PAUSED', label: '已挂起' },
  { value: 'DONE', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' },
]

function renderCoverageSummary(summary = {}, onClick, filterOptions = {}) {
  const total = Number(summary.total || 0)
  const statusItems = [
    ['covered', '已覆盖', 'green', '功能所在版本已上架的矩阵包数量。'],
    ['in_review', '审核中', 'gold', '功能所在版本对应的发版申请处于审核中的矩阵包数量。'],
    ['application_submitted', '已申请', 'cyan', '功能所在版本对应的发版申请处于待规划或排队中的矩阵包数量。'],
    ['release_only', '仅发版', 'purple', '未在版本信息中匹配到该需求功能，但存在关联发版申请，表示无需修改 APP 底层代码，仅需重新打包发版。'],
  ]
  const activeFilter = filterOptions.activeFilter || 'all'
  const onFilter = filterOptions.onFilter
  const renderFilterTag = (key, label, color, description, count) => (
    <Tooltip key={key} title={description}>
      <Tag
        color={color}
        className={onFilter && activeFilter === key ? 'app-release-demand-coverage-summary-tag-active' : ''}
        onClick={onFilter ? () => onFilter(key) : undefined}
        role={onFilter ? 'button' : undefined}
        tabIndex={onFilter ? 0 : undefined}
        onKeyDown={onFilter ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') onFilter(key)
        } : undefined}
      >
        {label} {count}
      </Tag>
    </Tooltip>
  )
  const content = (
    <Space className="app-release-demand-coverage-summary" size={2}>
      {onFilter ? renderFilterTag('all', '全部', 'blue', '显示当前需求的全部矩阵包。', total) : null}
      {statusItems.map(([key, label, color, description]) => renderFilterTag(key, label, color, description, Number(summary[key] || 0)))}
      <Tooltip title="当前系统中的全部矩阵包数量。">
        <Text type="secondary">共 {total} 个包</Text>
      </Tooltip>
    </Space>
  )
  return onClick ? <Button type="link" className="app-release-demand-coverage-summary-button" onClick={onClick}>{content}</Button> : content
}

function renderReleasePackageSummary(summary = {}, onClick) {
  const total = Number(summary.total || 0)
  const statusItems = [
    ['listed', '已上架', 'green', '同一需求、同一矩阵包下，最新发版申请状态为已上架的矩阵包数量。'],
    ['in_review', '审核中', 'gold', '同一需求、同一矩阵包下，最新发版申请状态为审核中的矩阵包数量。'],
    ['queued', '排队中', 'geekblue', '同一需求、同一矩阵包下，最新发版申请状态为排队中的矩阵包数量。'],
    ['pending_plan', '待规划', 'magenta', '同一需求、同一矩阵包下，最新发版申请状态为待规划的矩阵包数量。'],
    ['rejected', '被拒审', 'red', '同一需求、同一矩阵包下，最新发版申请状态为被拒审的矩阵包数量。'],
    ['cancelled', '取消', 'default', '同一需求、同一矩阵包下，最新发版申请状态为取消的矩阵包数量。'],
  ]
  const content = (
    <Space className="app-release-demand-coverage-summary" size={2} wrap>
      {statusItems
        .filter(([key]) => Number(summary[key] || 0) > 0)
        .map(([key, label, color, description]) => (
          <Tooltip key={key} title={description}>
            <Tag color={color}>{label} {Number(summary[key] || 0)}</Tag>
          </Tooltip>
        ))}
      <Tooltip title="同一需求、同一矩阵包只统计一次，按该包最新发版申请计数。">
        <Text type="secondary">共 {total} 个包</Text>
      </Tooltip>
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
  const [releasePackageSortOrder, setReleasePackageSortOrder] = useState('asc')
  const [coverageModal, setCoverageModal] = useState({ open: false, demand: null })
  const [coverageFilter, setCoverageFilter] = useState('all')
  const [releasePackageModal, setReleasePackageModal] = useState({ open: false, demand: null })
  const [versionInfoModal, setVersionInfoModal] = useState({ open: false, loading: false, record: null })
  const currentPageSize = pagination.pageSize

  const loadData = useCallback(async (current = 1, pageSize = currentPageSize) => {
    setLoading(true)
    try {
      const result = await getAppReleaseDemandCoverageApi({
        page: current,
        pageSize,
        keyword: keyword || undefined,
        status: status || undefined,
        sort_order: releasePackageSortOrder,
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
  }, [currentPageSize, keyword, releasePackageSortOrder, status])

  useEffect(() => {
    loadData(1, currentPageSize)
  }, [currentPageSize, loadData])

  const openCoverage = (record) => {
    setCoverageModal({ open: true, demand: record })
    setCoverageFilter('all')
  }

  const closeCoverage = () => {
    setCoverageModal({ open: false, demand: null })
  }

  const closeReleasePackage = () => {
    setReleasePackageModal({ open: false, demand: null })
  }

  const handleViewVersionInfo = async (record) => {
    if (!record?.release_id) return
    setVersionInfoModal({ open: true, loading: true, record: null })
    try {
      const result = await getAppVersionReleaseVersionInfoApi(record.release_id)
      if (!result?.success) {
        message.error(result?.message || '获取版本信息失败')
        return
      }
      if (!result.data) {
        message.info('该发版版本暂无版本信息')
        setVersionInfoModal({ open: false, loading: false, record: null })
        return
      }
      setVersionInfoModal({ open: true, loading: false, record: result.data })
    } catch (error) {
      message.error(error?.message || '获取版本信息失败')
    } finally {
      setVersionInfoModal((current) => ({ ...current, loading: false }))
    }
  }

  const coverageRows = useMemo(() => {
    const packageRows = Array.isArray(coverageModal.demand?.package_coverage) ? coverageModal.demand.package_coverage : []
    if (coverageFilter === 'all') return packageRows
    return packageRows.filter((row) => row.coverage_status === coverageFilter.toUpperCase())
  }, [coverageFilter, coverageModal.demand])

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
      render: (value, record) => {
        const demandId = String(record?.id || '').trim()
        if (!demandId) return value || '-'

        return (
          <a
            href={`/work-demands/${encodeURIComponent(demandId)}`}
            target="_blank"
            rel="noreferrer"
          >
            {value || demandId}
          </a>
        )
      },
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
      title: '关联发版包',
      key: 'release_package_summary',
      sorter: true,
      sortOrder: releasePackageSortOrder === 'asc' ? 'ascend' : 'descend',
      sortDirections: ['ascend', 'descend', 'ascend'],
      render: (_, record) => renderReleasePackageSummary(
        record.release_package_summary,
        () => setReleasePackageModal({ open: true, demand: record }),
      ),
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
      title: '功能所在版本',
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
        if (record.coverage_status === 'COVERED') return <Text type="success">功能所在版本已上架，已覆盖该需求</Text>
        if (record.coverage_status === 'IN_REVIEW') return <Text type="warning">功能所在版本当前审核中</Text>
        if (record.coverage_status === 'APPLICATION_SUBMITTED') return <Text type="secondary">功能所在版本已提交发版申请</Text>
        if (record.coverage_status === 'RELEASE_ONLY') return <Text type="secondary">未修改 APP 底层功能，仅需重新打包发版</Text>
        if (record.coverage_status === 'INCLUDED_NOT_RELEASED') return <Text type="secondary">功能所在版本尚未完成发布</Text>
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
          onChange={(nextPagination, _, sorter) => {
            const nextSortOrder = sorter.order === 'descend' ? 'desc' : 'asc'
            if (nextSortOrder !== releasePackageSortOrder) {
              setReleasePackageSortOrder(nextSortOrder)
              setPagination((current) => ({ ...current, current: 1, pageSize: nextPagination.pageSize }))
              return
            }
            loadData(nextPagination.current, nextPagination.pageSize)
          }}
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
          {coverageModal.demand ? renderCoverageSummary(coverageModal.demand.coverage_summary, null, {
            activeFilter: coverageFilter,
            onFilter: setCoverageFilter,
          }) : null}
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

      <Modal
        title={releasePackageModal.demand ? `${releasePackageModal.demand.id} · ${releasePackageModal.demand.name} · 关联发版包` : '关联发版包'}
        open={releasePackageModal.open}
        width={900}
        footer={null}
        destroyOnHidden
        onCancel={closeReleasePackage}
      >
        <Table
          rowKey="matrix_package_id"
          size="small"
          dataSource={releasePackageModal.demand?.release_package_coverage || []}
          pagination={false}
          columns={[
            {
              title: '矩阵包',
              dataIndex: 'package_name',
              width: 220,
              render: (value, record) => (
                <Space direction="vertical" size={0}>
                  <Text strong>{value || '-'}</Text>
                  <Text type="secondary">{record.app_id || '-'}</Text>
                </Space>
              ),
            },
            {
              title: '申请版本',
              dataIndex: 'application_versions',
              width: 220,
              render: (value) => Array.isArray(value) && value.length > 0 ? (
                <Space direction="vertical" size={0}>
                  {value.map((item) => (
                    <span key={item.release_id}>
                      {item.app_version || '-'}{item.release_request_no ? `（${item.release_request_no}）` : ''}
                    </span>
                  ))}
                </Space>
              ) : '-',
            },
            {
              title: '发版版本',
              dataIndex: 'app_version',
              width: 150,
              render: (value, record) => value ? (
                <Space size={2}>
                  <span>{value}</span>
                  <Button
                    type="text"
                    size="small"
                    icon={<EyeOutlined />}
                    aria-label={`查看${value}版本信息`}
                    title="查看版本信息"
                    onClick={() => handleViewVersionInfo(record)}
                  />
                </Space>
              ) : '-'
            },
            {
              title: '发版进度',
              dataIndex: 'release_status_name',
              width: 120,
              render: (value, record) => <Tag color={record.release_status_color || 'default'}>{value || '-'}</Tag>,
            },
          ]}
          scroll={{ x: 900, y: 520 }}
          locale={{ emptyText: '暂无关联发版包' }}
        />
      </Modal>

      <Modal
        title={versionInfoModal.record ? `版本信息：${versionInfoModal.record.version_number || '-'}` : '版本信息'}
        open={versionInfoModal.open}
        footer={null}
        width={760}
        destroyOnHidden
        confirmLoading={versionInfoModal.loading}
        onCancel={() => setVersionInfoModal({ open: false, loading: false, record: null })}
      >
        {versionInfoModal.loading ? (
          <div style={{ minHeight: 120 }} />
        ) : (
          <VersionInfoDetail record={versionInfoModal.record} />
        )}
      </Modal>
    </div>
  )
}

export default AppReleaseDemandCoveragePage
