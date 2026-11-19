import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Input,
  Modal,
  Popover,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getAppReleaseDemandCoverageApi,
  getAppReleaseOperatingAppsApi,
  saveAppReleaseOperatingAppsApi,
} from '../../api/appVersionRelease'
import { hasPermission } from '../../utils/access'
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

function AppReleaseDemandCoveragePage() {
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [coverageModal, setCoverageModal] = useState({ open: false, demand: null })
  const [coverageFilter, setCoverageFilter] = useState('all')
  const [operatingApps, setOperatingApps] = useState([])
  const [operatingAppKeyword, setOperatingAppKeyword] = useState('')
  const [operatingAppsLoading, setOperatingAppsLoading] = useState(false)
  const [operatingAppsModal, setOperatingAppsModal] = useState({ open: false, demand: null })
  const [selectedOperatingAppIds, setSelectedOperatingAppIds] = useState([])
  const [savingOperatingApps, setSavingOperatingApps] = useState(false)
  const canManageDemands = hasPermission('demand.manage')
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

  const loadOperatingApps = useCallback(async () => {
    setOperatingAppsLoading(true)
    try {
      const result = await getAppReleaseOperatingAppsApi()
      if (!result?.success) {
        message.error(result?.message || '获取计划运营 APP 失败')
        return
      }
      setOperatingApps(Array.isArray(result.data) ? result.data : [])
    } catch (error) {
      message.error(error?.message || '获取计划运营 APP 失败')
    } finally {
      setOperatingAppsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOperatingApps()
  }, [loadOperatingApps])

  const openCoverage = (record) => {
    setCoverageModal({ open: true, demand: record })
    setCoverageFilter('all')
  }

  const closeCoverage = () => {
    setCoverageModal({ open: false, demand: null })
  }

  const openOperatingApps = (demand) => {
    const savedIds = demand.operating_app_package_ids
    setSelectedOperatingAppIds(Array.isArray(savedIds)
      ? savedIds.map(Number).filter((id) => operatingApps.some((app) => app.matrix_package_id === id))
      : operatingApps.map((app) => app.matrix_package_id))
    setOperatingAppKeyword('')
    setOperatingAppsModal({ open: true, demand })
  }

  const saveOperatingApps = async () => {
    const demandId = operatingAppsModal.demand?.id
    if (!demandId) return
    setSavingOperatingApps(true)
    try {
      const result = await saveAppReleaseOperatingAppsApi(demandId, selectedOperatingAppIds)
      if (!result?.success) {
        message.error(result?.message || '保存计划运营 APP 失败')
        return
      }
      const selectedIds = Array.isArray(result.data) ? result.data.map(Number) : []
      setRows((currentRows) => currentRows.map((row) => String(row.id) === String(demandId)
        ? { ...row, operating_app_package_ids: selectedIds }
        : row))
      setOperatingAppsModal({ open: false, demand: null })
      message.success('计划运营 APP 已保存')
    } catch (error) {
      message.error(error?.message || '保存计划运营 APP 失败')
    } finally {
      setSavingOperatingApps(false)
    }
  }

  const coverageRows = useMemo(() => {
    const packageRows = Array.isArray(coverageModal.demand?.package_coverage) ? coverageModal.demand.package_coverage : []
    if (coverageFilter === 'all') return packageRows
    return packageRows.filter((row) => row.coverage_status === coverageFilter.toUpperCase())
  }, [coverageFilter, coverageModal.demand])

  const filteredOperatingApps = useMemo(() => {
    const keywordValue = operatingAppKeyword.trim().toLowerCase()
    if (!keywordValue) return operatingApps
    return operatingApps.filter((app) => (
      `${app.package_name || ''} ${app.app_id || ''}`.toLowerCase().includes(keywordValue)
    ))
  }, [operatingAppKeyword, operatingApps])

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
      title: '仅发版无代码变更',
      dataIndex: 'release_without_code_change',
      width: 150,
      render: (value) => <Tag color={value ? 'blue' : 'default'}>{value ? '是' : '否'}</Tag>,
    },
    {
      title: '计划运营 APP',
      key: 'operating_apps',
      width: 190,
      render: (_, record) => {
        const ids = Array.isArray(record.operating_app_package_ids)
          ? record.operating_app_package_ids
          : operatingApps.map((app) => app.matrix_package_id)
        const selected = operatingApps.filter((app) => ids.includes(app.matrix_package_id))
        const label = `${selected.length}/${operatingApps.length}`
        return canManageDemands ? (
          <Button type="link" size="small" disabled={operatingAppsLoading} onClick={() => openOperatingApps(record)}>
            {label}
          </Button>
        ) : <Text>{label}</Text>
      },
    },
    {
      title: '已上架覆盖范围',
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
      <Card className="app-release-demand-coverage-card" variant="borderless">
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
          scroll={{ x: 1210 }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
          onChange={(nextPagination) => {
            loadData(nextPagination.current, nextPagination.pageSize)
          }}
          locale={{ emptyText: '暂无需要 APP 发版的需求' }}
        />
      </Card>

      <Modal
        title={operatingAppsModal.demand
          ? `${operatingAppsModal.demand.id} · ${operatingAppsModal.demand.name} · 计划运营 APP`
          : '计划运营 APP'}
        open={operatingAppsModal.open}
        width={980}
        destroyOnHidden
        confirmLoading={savingOperatingApps}
        onCancel={() => setOperatingAppsModal({ open: false, demand: null })}
        onOk={saveOperatingApps}
        okText="保存"
      >
        <div className="app-release-operating-apps-toolbar">
          <Input
            className="app-release-operating-apps-search"
            value={operatingAppKeyword}
            prefix={<SearchOutlined />}
            allowClear
            placeholder="搜索 APP 名称或包 ID"
            onChange={(event) => setOperatingAppKeyword(event.target.value)}
          />
          <Space size={8}>
            <Text>全选</Text>
            <Switch
              checked={operatingApps.length > 0 && selectedOperatingAppIds.length === operatingApps.length}
              disabled={operatingAppsLoading || operatingApps.length === 0}
              onChange={(checked) => setSelectedOperatingAppIds(
                checked ? operatingApps.map((app) => app.matrix_package_id) : [],
              )}
            />
          </Space>
          <Text type="secondary">已选择 {selectedOperatingAppIds.length} / {operatingApps.length}</Text>
        </div>
        <Table
          rowKey="matrix_package_id"
          size="small"
          loading={operatingAppsLoading}
          dataSource={filteredOperatingApps}
          pagination={false}
          columns={[
            {
              title: 'APP 名称',
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
              title: '当前版本',
              dataIndex: 'current_version',
              width: 180,
              render: (value, record) => {
                if (!value) return <Text type="secondary">暂无已上架版本</Text>
                const items = Array.isArray(record.features) ? record.features : []
                return (
                  <Popover
                    trigger="click"
                    placement="left"
                    title={`${record.package_name || 'APP'} · ${value} · 版本信息`}
                    content={(
                      items.length > 0 ? (
                        <ul className="app-release-operating-apps-feature-list">
                          {items.map((feature, index) => <li key={`${feature}-${index}`}>{feature}</li>)}
                        </ul>
                      ) : <Text type="secondary">暂无版本信息</Text>
                    )}
                  >
                    <Button type="link" size="small">
                      {value}
                    </Button>
                  </Popover>
                )
              },
            },
            {
              title: '是否计划运营',
              key: 'is_operating',
              width: 150,
              render: (_, record) => {
                const checked = selectedOperatingAppIds.includes(record.matrix_package_id)
                return (
                  <Switch
                    checked={checked}
                    checkedChildren="是"
                    unCheckedChildren="否"
                    disabled={!canManageDemands || savingOperatingApps}
                    aria-label={`${record.package_name || 'APP'}是否计划运营`}
                    onChange={(nextChecked) => setSelectedOperatingAppIds((current) => (
                      nextChecked
                        ? Array.from(new Set([...current, record.matrix_package_id]))
                        : current.filter((id) => id !== record.matrix_package_id)
                    ))}
                  />
                )
              },
            },
          ]}
          scroll={{ x: 650, y: 460 }}
          locale={{ emptyText: '暂无可选 APP' }}
        />
      </Modal>

      <Modal
        title={coverageModal.demand ? `${coverageModal.demand.id} · ${coverageModal.demand.name} · 已上架覆盖范围` : '已上架覆盖范围'}
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

    </div>
  )
}

export default AppReleaseDemandCoveragePage
