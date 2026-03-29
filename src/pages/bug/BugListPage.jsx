import { BugOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Card, Empty, Input, Select, Space, Table, Tag, Typography, message } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDictItemsApi } from '../../api/configDict'
import { createBugApi, getBugsApi } from '../../api/bug'
import { hasPermission } from '../../utils/access'
import { formatBeijingDateTime } from '../../utils/datetime'
import { BugFormModal } from '../../modules/bug'

const { Search } = Input
const { Text } = Typography

function mapDictOptions(rows) {
  return [{ label: '全部', value: undefined }].concat(
    (rows || []).map((item) => ({
      label: item?.item_name || item?.item_code || '-',
      value: item?.item_code,
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
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState()
  const [severityFilter, setSeverityFilter] = useState()
  const [priorityFilter, setPriorityFilter] = useState()
  const [statusOptions, setStatusOptions] = useState([{ label: '全部', value: undefined }])
  const [severityOptions, setSeverityOptions] = useState([{ label: '全部', value: undefined }])
  const [priorityOptions, setPriorityOptions] = useState([{ label: '全部', value: undefined }])

  const loadDicts = useCallback(async () => {
    try {
      const [statusRes, severityRes, priorityRes] = await Promise.all([
        getDictItemsApi('bug_status', { enabledOnly: true }),
        getDictItemsApi('bug_severity', { enabledOnly: true }),
        getDictItemsApi('bug_priority', { enabledOnly: true }),
      ])
      setStatusOptions(mapDictOptions(statusRes?.data || []))
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
        page: 1,
        pageSize: 200,
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
    } catch (error) {
      message.error(error?.message || '获取Bug列表失败')
    } finally {
      setLoading(false)
    }
  }, [keyword, statusFilter, severityFilter, priorityFilter])

  useEffect(() => {
    loadDicts()
  }, [loadDicts])

  useEffect(() => {
    loadBugs()
  }, [loadBugs])

  const columns = useMemo(
    () => [
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
        title: '优先级',
        dataIndex: 'priority_name',
        key: 'priority_name',
        width: 110,
        render: (value, row) => <Tag color={row.priority_color || 'default'}>{value || row.priority_code || '-'}</Tag>,
      },
      {
        title: '关联需求',
        dataIndex: 'demand_name',
        key: 'demand_name',
        width: 220,
        render: (value, row) => value || row.demand_id || '-',
      },
      {
        title: '处理人',
        dataIndex: 'assignee_name',
        key: 'assignee_name',
        width: 140,
        render: (value) => value || '-',
      },
      {
        title: '发现人',
        dataIndex: 'reporter_name',
        key: 'reporter_name',
        width: 140,
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
    <div style={{ padding: 12 }}>
      <Card
        variant="borderless"
        title={
          <Space size={8}>
            <BugOutlined />
            <span>Bug管理</span>
          </Space>
        }
        extra={
          <Space size={8}>
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
        <Space size={8} wrap style={{ marginBottom: 12 }}>
          <Search
            allowClear
            placeholder="搜索编号、标题、描述"
            style={{ width: 240 }}
            onSearch={(value) => setKeyword(String(value || '').trim())}
          />
          <Select style={{ width: 140 }} value={statusFilter} options={statusOptions} onChange={setStatusFilter} />
          <Select style={{ width: 140 }} value={severityFilter} options={severityOptions} onChange={setSeverityFilter} />
          <Select style={{ width: 140 }} value={priorityFilter} options={priorityOptions} onChange={setPriorityFilter} />
          <Text type="secondary">共 {rows.length} 条</Text>
        </Space>

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={false}
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
        onSubmit={async (values) => {
          setSubmitting(true)
          try {
            const result = await createBugApi(values)
            if (!result?.success) {
              message.error(result?.message || '创建Bug失败')
              return
            }
            message.success('Bug创建成功')
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
