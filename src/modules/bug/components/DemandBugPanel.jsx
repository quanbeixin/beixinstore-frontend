import { BugOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Card, Empty, Input, Popconfirm, Select, Space, Table, Tag, message } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createBugApi, getDemandBugsApi, getDemandBugStatsApi, reopenBugApi } from '../../../api/bug'
import { hasPermission } from '../../../utils/access'
import { formatBeijingDateTime } from '../../../utils/datetime'
import { pinyinSelectFilter } from '../../../utils/selectSearch'
import BugFormModal from './BugFormModal'
import { uploadDraftAttachments } from '../utils/attachmentUpload'
import './demand-bug-panel.css'

const { Search } = Input

function DemandBugPanel({ demandId }) {
  const navigate = useNavigate()
  const canCreate = hasPermission('bug.create')
  const canTransition = hasPermission('bug.transition')

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [reopeningBugId, setReopeningBugId] = useState(0)
  const [rows, setRows] = useState([])
  const [stats, setStats] = useState([])
  const [statusFilter, setStatusFilter] = useState()
  const [keyword, setKeyword] = useState('')

  const loadData = useCallback(async () => {
    if (!demandId) return
    setLoading(true)
    try {
      const [statsRes, listRes] = await Promise.all([
        getDemandBugStatsApi(demandId),
        getDemandBugsApi(demandId, {
          page: 1,
          pageSize: 100,
          keyword: keyword || undefined,
          status_code: statusFilter || undefined,
        }),
      ])

      if (!statsRes?.success) {
        message.error(statsRes?.message || '获取需求Bug统计失败')
      } else {
        setStats(statsRes.data || [])
      }

      if (!listRes?.success) {
        message.error(listRes?.message || '获取需求Bug列表失败')
      } else {
        setRows(listRes?.data?.rows || [])
      }
    } catch (error) {
      message.error(error?.message || '加载需求Bug数据失败')
    } finally {
      setLoading(false)
    }
  }, [demandId, keyword, statusFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  const statusOptions = useMemo(
    () => [{ label: '全部状态', value: undefined }, ...stats.map((item) => ({ label: item.status_name, value: item.status_code }))],
    [stats],
  )

  const columns = [
    {
      title: '编号',
      dataIndex: 'bug_no',
      key: 'bug_no',
      width: 110,
      render: (value) => <Tag color="blue">{value || '-'}</Tag>,
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      render: (value, row) => (
        <Button type="link" style={{ paddingInline: 0 }} onClick={() => navigate(`/bugs/${row.id}`)}>
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
      title: '处理人',
      dataIndex: 'assignee_names',
      key: 'assignee_names',
      width: 140,
      render: (value, row) => value || row.assignee_name || '-',
    },
    {
      title: '关注人',
      dataIndex: 'watcher_names',
      key: 'watcher_names',
      width: 180,
      render: (value) => value || '-',
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 180,
      render: (value) => formatBeijingDateTime(value),
    },
    ...(canTransition
      ? [
          {
            title: '操作',
            key: 'action',
            width: 110,
            render: (_, row) => {
              const status = String(row?.status_code || '').trim().toUpperCase()
              if (status !== 'CLOSED') return '-'
              return (
                <Popconfirm
                  title="确认重新打开该Bug？"
                  description="重新打开后可继续进入处理流程。"
                  okText="重新打开"
                  cancelText="取消"
                  onConfirm={async () => {
                    const bugId = Number(row?.id || 0)
                    if (!bugId) return
                    try {
                      setReopeningBugId(bugId)
                      const result = await reopenBugApi(bugId, { remark: '需求详情页Bug列表重新打开' })
                      if (!result?.success) {
                        message.error(result?.message || '重新打开失败')
                        return
                      }
                      message.success(result?.message || 'Bug已重新打开')
                      await loadData()
                    } catch (error) {
                      message.error(error?.message || '重新打开失败')
                    } finally {
                      setReopeningBugId(0)
                    }
                  }}
                >
                  <Button
                    type="link"
                    size="small"
                    loading={reopeningBugId === Number(row?.id || 0)}
                    style={{ paddingInline: 0 }}
                  >
                    重新打开
                  </Button>
                </Popconfirm>
              )
            },
          },
        ]
      : []),
  ]

  return (
    <div className="demand-bug-panel">
      <div className="demand-bug-panel__stats-row">
        {(stats || []).map((item) => (
          <div
            className="demand-bug-panel__stat-card"
            data-status={String(item?.status_code || '').trim().toUpperCase() || 'DEFAULT'}
            key={item.status_code}
          >
            <div className="demand-bug-panel__stat-label">{item.status_name}</div>
            <div className="demand-bug-panel__stat-value">{item.total || 0}</div>
          </div>
        ))}
      </div>

      <Card
        size="small"
        className="demand-bug-panel__list-card"
        variant="borderless"
        title={
          <Space size={8}>
            <BugOutlined />
            <span>关联Bug</span>
          </Space>
        }
        extra={
          <Space size={8}>
            <Search
              allowClear
              placeholder="搜索编号/标题/描述"
              onSearch={(value) => setKeyword(String(value || '').trim())}
              style={{ width: 220 }}
            />
            <Select
              allowClear
              showSearch
              placeholder="状态"
              style={{ width: 140 }}
              value={statusFilter}
              options={statusOptions}
              filterOption={pinyinSelectFilter}
              onChange={(value) => setStatusFilter(value)}
            />
            <Button icon={<ReloadOutlined />} onClick={loadData}>
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
        <Table
          rowKey="id"
          loading={loading}
          size="small"
          columns={columns}
          dataSource={rows}
          pagination={false}
          locale={{
            emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前需求下暂无Bug记录" />,
          }}
        />
      </Card>

      <BugFormModal
        open={createOpen}
        title="新建关联Bug"
        submitText="创建"
        presentation="drawer"
        demandIdPreset={demandId}
        lockDemand
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
            await loadData()
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

export default DemandBugPanel
