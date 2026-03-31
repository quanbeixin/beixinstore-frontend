import { BugOutlined, FilterOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Card, Empty, Input, Segmented, Select, Space, Table, Tag, Typography, message } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDictItemsApi } from '../../api/configDict'
import { createBugApi, getBugsApi } from '../../api/bug'
import { hasPermission } from '../../utils/access'
import { formatBeijingDateTime } from '../../utils/datetime'
import { BugFormModal } from '../../modules/bug'
import { uploadDraftAttachments } from '../../modules/bug/utils/attachmentUpload'
import './BugListPage.css'

const { Text } = Typography

function mapDictOptions(rows) {
  return [{ label: '全部', value: undefined }].concat(
    (rows || []).map((item) => ({
      label: item?.item_name || item?.item_code || '-',
      value: item?.item_code,
    })),
  )
}

function mapSegmentedOptions(rows) {
  return [{ label: '全部状态', value: '' }].concat(
    (rows || []).map((item) => ({
      label: item?.item_name || item?.item_code || '-',
      value: item?.item_code || '',
    })),
  )
}

function BugListPage() {
  const navigate = useNavigate()
  const canCreate = hasPermission('bug.create')

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [statusSegmentOptions, setStatusSegmentOptions] = useState([{ label: '全部状态', value: '' }])
  const [severityOptions, setSeverityOptions] = useState([{ label: '全部', value: undefined }])
  const [priorityOptions, setPriorityOptions] = useState([{ label: '全部', value: undefined }])

  const loadDicts = useCallback(async () => {
    try {
      const [statusRes, severityRes, priorityRes] = await Promise.all([
        getDictItemsApi('bug_status', { enabledOnly: true }),
        getDictItemsApi('bug_severity', { enabledOnly: true }),
        getDictItemsApi('bug_priority', { enabledOnly: true }),
      ])
      const statusRows = statusRes?.data || []
      setStatusSegmentOptions(mapSegmentedOptions(statusRows))
      setSeverityOptions(mapDictOptions(severityRes?.data || []))
      setPriorityOptions(mapDictOptions(priorityRes?.data || []))
    } catch (error) {
      message.error(error?.message || '加载Bug筛选项失败')
    }
  }, [])

  const loadBugs = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getBugsApi({
        page,
        pageSize,
        keyword: keyword || undefined,
        status_code: statusFilter || undefined,
        severity_code: severityFilter || undefined,
        priority_code: priorityFilter || undefined,
      })
      if (!result?.success) {
        message.error(result?.message || '获取Bug列表失败')
        return
      }
      setRows(result?.data?.rows || [])
      setTotal(Number(result?.data?.total || 0))
    } catch (error) {
      message.error(error?.message || '获取Bug列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword, statusFilter, severityFilter, priorityFilter])

  useEffect(() => {
    loadDicts()
  }, [loadDicts])

  useEffect(() => {
    loadBugs()
  }, [loadBugs])

  const activeFilterCount = useMemo(
    () => [keyword, statusFilter, severityFilter, priorityFilter].filter(Boolean).length,
    [keyword, statusFilter, severityFilter, priorityFilter],
  )

  const resetFilters = useCallback(() => {
    setSearchInput('')
    setKeyword('')
    setStatusFilter('')
    setSeverityFilter('')
    setPriorityFilter('')
    setPage(1)
    setPageSize(20)
  }, [])

  const columns = useMemo(
    () => [
      {
        title: '标题',
        dataIndex: 'title',
        key: 'title',
        width: 300,
        ellipsis: true,
        onCell: () => ({ style: { minWidth: 300 } }),
        render: (value, row) => (
          <Button
            type="link"
            size="small"
            className="bug-list-page__title-link"
            onClick={() => navigate(`/bugs/${row.id}`)}
          >
            {value || '-'}
          </Button>
        ),
      },
      {
        title: '状态',
        dataIndex: 'status_name',
        key: 'status_name',
        width: 110,
        render: (value, row) => <Tag color={row.status_color || 'default'}>{value || row.status_code || '-'}</Tag>,
      },
      {
        title: '严重程度',
        dataIndex: 'severity_name',
        key: 'severity_name',
        width: 110,
        render: (value, row) => <Tag color={row.severity_color || 'default'}>{value || row.severity_code || '-'}</Tag>,
      },
      {
        title: '优先级',
        dataIndex: 'priority_name',
        key: 'priority_name',
        width: 110,
        render: (value, row) => <Tag color={row.priority_color || 'default'}>{value || row.priority_code || '-'}</Tag>,
      },
      {
        title: 'Bug阶段',
        dataIndex: 'issue_stage_name',
        key: 'issue_stage_name',
        width: 130,
        ellipsis: true,
        render: (value, row) => (
          <Tag color={row.issue_stage_color || 'default'}>{value || row.issue_stage || '-'}</Tag>
        ),
      },
      {
        title: '关联需求',
        dataIndex: 'demand_name',
        key: 'demand_name',
        width: 220,
        ellipsis: true,
        render: (value, row) => value || row.demand_id || '-',
      },
      {
        title: '处理人',
        dataIndex: 'assignee_name',
        key: 'assignee_name',
        width: 110,
        ellipsis: true,
        render: (value) => value || '-',
      },
      {
        title: '发现人',
        dataIndex: 'reporter_name',
        key: 'reporter_name',
        width: 110,
        ellipsis: true,
        render: (value) => value || '-',
      },
      {
        title: '创建时间',
        dataIndex: 'created_at',
        key: 'created_at',
        width: 180,
        render: (value) => formatBeijingDateTime(value),
      },
    ],
    [navigate],
  )

  return (
    <div className="bug-list-page">
      <Card
        className="bug-list-page__shell"
        variant="borderless"
        title={
          <Space size={8} className="bug-list-page__title-wrap">
            <BugOutlined />
            <span className="bug-list-page__title">Bug管理</span>
          </Space>
        }
        extra={
          <Space size={8} className="bug-list-page__header-actions">
            <Button icon={<ReloadOutlined />} onClick={loadBugs}>
              刷新
            </Button>
            {canCreate ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                新建Bug
              </Button>
            ) : null}
          </Space>
        }
      >
        <div className="bug-list-page__filter-panel">
          <div className="bug-list-page__filter-row bug-list-page__filter-row--status">
            <Text strong className="bug-list-page__filter-label">
              状态筛选
            </Text>
            <Segmented
              size="small"
              value={statusFilter}
              options={statusSegmentOptions}
              onChange={(value) => {
                setStatusFilter(String(value || ''))
                setPage(1)
              }}
            />
          </div>

          <div className="bug-list-page__filter-row">
            <Select
              size="small"
              style={{ width: 140 }}
              value={severityFilter || undefined}
              options={severityOptions}
              placeholder="严重程度"
              onChange={(value) => {
                setSeverityFilter(String(value || ''))
                setPage(1)
              }}
            />
            <Select
              size="small"
              style={{ width: 130 }}
              value={priorityFilter || undefined}
              options={priorityOptions}
              placeholder="优先级"
              onChange={(value) => {
                setPriorityFilter(String(value || ''))
                setPage(1)
              }}
            />
            <Input
              size="small"
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索编号、标题、描述"
              className="bug-list-page__keyword"
              value={searchInput}
              onChange={(event) => {
                const nextValue = event.target.value
                setSearchInput(nextValue)
                if (!nextValue) {
                  setKeyword('')
                  setPage(1)
                }
              }}
              onPressEnter={() => {
                setKeyword(String(searchInput || '').trim())
                setPage(1)
              }}
            />
            <Button
              size="small"
              type="primary"
              className="bug-list-page__query-btn"
              onClick={() => {
                setKeyword(String(searchInput || '').trim())
                setPage(1)
              }}
            >
              查询
            </Button>
            <Button size="small" icon={<FilterOutlined />} onClick={resetFilters}>
              清空筛选
            </Button>
            <Text type="secondary" className="bug-list-page__total">
              共 {total} 条
            </Text>
            {activeFilterCount ? (
              <Tag color="processing" className="bug-list-page__active-filter-tag">
                已筛选 {activeFilterCount} 项
              </Tag>
            ) : null}
          </div>
        </div>

        <Table
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1180 }}
          pagination={{
            current: page,
            pageSize,
            total,
            size: 'small',
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (value) => `共 ${value} 条`,
            pageSizeOptions: ['20', '50', '100'],
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage)
              setPageSize(nextPageSize)
            },
          }}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无Bug记录" />,
          }}
        />
      </Card>

      <BugFormModal
        open={createOpen}
        title="新建Bug"
        submitText="创建"
        confirmLoading={submitting}
        onCancel={() => setCreateOpen(false)}
        onSubmit={async (values, extra) => {
          setSubmitting(true)
          try {
            const result = await createBugApi(values)
            if (!result?.success) {
              message.error(result?.message || '创建Bug失败')
              return
            }
            const bugId = Number(result?.data?.id || 0)
            const draftAttachments = extra?.draftAttachments || []
            if (bugId > 0 && draftAttachments.length > 0) {
              const uploadResult = await uploadDraftAttachments(bugId, draftAttachments)
              if (uploadResult.failures.length > 0) {
                message.warning(
                  `Bug已创建，附件上传成功 ${uploadResult.successCount}/${uploadResult.total}，请在详情页补传失败附件`,
                )
              } else {
                message.success(`Bug创建成功，已上传 ${uploadResult.successCount} 个附件`)
              }
            } else {
              message.success('Bug创建成功')
            }
            setCreateOpen(false)
            await loadBugs()
          } catch (error) {
            message.error(error?.message || '创建Bug失败')
          } finally {
            setSubmitting(false)
          }
        }}
      />
    </div>
  )
}

export default BugListPage
