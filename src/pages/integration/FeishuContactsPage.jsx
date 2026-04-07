import {
  EyeOutlined,
  ReloadOutlined,
  SearchOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Input,
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
  getFeishuContactDetailApi,
  getFeishuContactsApi,
  syncFeishuContactsApi,
} from '../../api/integration'
import { hasPermission } from '../../utils/access'

const { Search } = Input
const { Paragraph, Text } = Typography

const STATUS_OPTIONS = [
  { label: '全部状态', value: 'ALL' },
  { label: '在职', value: 'ACTIVE' },
  { label: '未激活', value: 'INACTIVE' },
  { label: '已离职', value: 'RESIGNED' },
]

function getStatusMeta(record = {}) {
  if (Number(record.is_resigned) === 1) {
    return { color: 'red', label: '已离职' }
  }
  if (Number(record.is_active) === 1) {
    return { color: 'green', label: '在职' }
  }
  return { color: 'gold', label: '未激活' }
}

function formatDepartmentNames(record = {}) {
  const names = Array.isArray(record.department_names) ? record.department_names.filter(Boolean) : []
  if (names.length > 0) return names.join('、')
  const ids = Array.isArray(record.department_ids) ? record.department_ids.filter(Boolean) : []
  return ids.length > 0 ? ids.join('、') : '-'
}

function FeishuContactsPage() {
  const canManage = hasPermission('option.manage')
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState({
    total: 0,
    active_total: 0,
    inactive_total: 0,
    resigned_total: 0,
    last_synced_at: null,
  })
  const [config, setConfig] = useState({
    configured: false,
    missing_keys: [],
  })
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('ALL')
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  })
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailRecord, setDetailRecord] = useState(null)

  const loadData = useCallback(
    async (nextPage = 1, nextPageSize = 20) => {
      setLoading(true)
      try {
        const result = await getFeishuContactsApi({
          page: nextPage,
          pageSize: nextPageSize,
          ...(keyword ? { keyword } : {}),
          ...(status && status !== 'ALL' ? { status } : {}),
        })

        if (!result?.success) {
          message.error(result?.message || '获取飞书通讯录失败')
          return
        }

        const data = result?.data || {}
        setRows(Array.isArray(data.list) ? data.list : [])
        setSummary(data.summary || {})
        setConfig(data.config || { configured: false, missing_keys: [] })
        setPagination({
          current: Number(data.page || nextPage || 1),
          pageSize: Number(data.pageSize || nextPageSize || 20),
          total: Number(data.total || 0),
        })
      } catch (error) {
        message.error(error?.message || '获取飞书通讯录失败')
      } finally {
        setLoading(false)
      }
    },
    [keyword, status],
  )

  useEffect(() => {
    loadData(1, pagination.pageSize)
  }, [loadData])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      const result = await syncFeishuContactsApi()
      if (!result?.success) {
        message.error(result?.message || '同步飞书通讯录失败')
        return
      }
      message.success(result?.message || '飞书通讯录同步成功')
      await loadData(1, pagination.pageSize)
    } catch (error) {
      message.error(error?.message || '同步飞书通讯录失败')
    } finally {
      setSyncing(false)
    }
  }, [loadData, pagination.pageSize])

  const handleOpenDetail = useCallback(async (record) => {
    if (!record?.id) return
    setDetailOpen(true)
    setDetailRecord(null)
    setDetailLoading(true)
    try {
      const result = await getFeishuContactDetailApi(record.id)
      if (!result?.success) {
        message.error(result?.message || '获取成员详情失败')
        return
      }
      setDetailRecord(result?.data?.record || null)
      if (result?.data?.config) {
        setConfig(result.data.config)
      }
    } catch (error) {
      message.error(error?.message || '获取成员详情失败')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const columns = useMemo(
    () => [
      {
        title: '成员',
        dataIndex: 'name',
        key: 'name',
        width: 220,
        render: (_, record) => {
          const statusMeta = getStatusMeta(record)
          return (
            <Space direction="vertical" size={2}>
              <Space size={6} wrap>
                <Text strong>{record.name || '-'}</Text>
                <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
              </Space>
              <Text type="secondary">{record.job_title || record.nickname || '-'}</Text>
            </Space>
          )
        },
      },
      {
        title: '联系方式',
        key: 'contact',
        width: 220,
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            <Text>{record.mobile || '-'}</Text>
            <Text type="secondary">{record.email || record.enterprise_email || '-'}</Text>
          </Space>
        ),
      },
      {
        title: '部门',
        key: 'departments',
        width: 240,
        render: (_, record) => {
          const text = formatDepartmentNames(record)
          return (
            <Paragraph ellipsis={{ rows: 2, tooltip: text }} style={{ marginBottom: 0 }}>
              {text}
            </Paragraph>
          )
        },
      },
      {
        title: '直属上级',
        dataIndex: 'leader_user_id',
        key: 'leader_user_id',
        width: 160,
        render: (value) => value || '-',
      },
      {
        title: 'Open ID',
        dataIndex: 'open_id',
        key: 'open_id',
        width: 240,
        render: (value) => (
          <Typography.Text
            copyable={value ? { text: value } : false}
            ellipsis={{ tooltip: value || '-' }}
            style={{ maxWidth: 210 }}
          >
            {value || '-'}
          </Typography.Text>
        ),
      },
      {
        title: 'User ID',
        dataIndex: 'feishu_user_id',
        key: 'feishu_user_id',
        width: 220,
        render: (value) => (
          <Typography.Text
            copyable={value ? { text: value } : false}
            ellipsis={{ tooltip: value || '-' }}
            style={{ maxWidth: 190 }}
          >
            {value || '-'}
          </Typography.Text>
        ),
      },
      {
        title: '最近同步',
        dataIndex: 'last_synced_at',
        key: 'last_synced_at',
        width: 180,
        render: (value) => value || '-',
      },
      {
        title: '操作',
        key: 'action',
        width: 96,
        fixed: 'right',
        render: (_, record) => (
          <Button type="link" icon={<EyeOutlined />} onClick={() => handleOpenDetail(record)}>
            详情
          </Button>
        ),
      },
    ],
    [handleOpenDetail],
  )

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      {!config.configured ? (
        <Alert
          type="warning"
          showIcon
          title="飞书应用配置未完成"
          description={`当前缺少配置：${
            Array.isArray(config.missing_keys) && config.missing_keys.length > 0
              ? config.missing_keys.join('、')
              : '请检查 FEISHU_APP_ID / FEISHU_APP_SECRET'
          }。页面可正常查看本地快照，但手动同步会失败。`}
        />
      ) : null}

      <Card variant="borderless">
        <Space size={24} wrap>
          <Statistic title="通讯录总数" value={Number(summary.total || 0)} />
          <Statistic title="在职成员" value={Number(summary.active_total || 0)} />
          <Statistic title="未激活" value={Number(summary.inactive_total || 0)} />
          <Statistic title="已离职" value={Number(summary.resigned_total || 0)} />
          <Statistic
            title="最近同步"
            value={summary.last_synced_at || '-'}
            styles={{ content: { fontSize: 16 } }}
          />
        </Space>
      </Card>

      <Card
        title="飞书通讯录快照"
        extra={
          <Space wrap>
            <Search
              allowClear
              placeholder="搜索姓名、手机号、邮箱、Open ID"
              onSearch={(value) => {
                setKeyword(value)
              }}
              enterButton={<SearchOutlined />}
              style={{ width: 320 }}
            />
            <Select
              value={status}
              options={STATUS_OPTIONS}
              style={{ width: 140 }}
              onChange={(value) => {
                setStatus(value)
              }}
            />
            <Button icon={<ReloadOutlined />} onClick={() => loadData(1, pagination.pageSize)}>
              刷新
            </Button>
            {canManage ? (
              <Button
                type="primary"
                icon={<SyncOutlined />}
                loading={syncing}
                onClick={handleSync}
              >
                手动同步
              </Button>
            ) : null}
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1480 }}
          locale={{ emptyText: <Empty description="暂无飞书通讯录快照数据" /> }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
          onChange={(nextPagination) => {
            const nextPage = Number(nextPagination.current || 1)
            const nextPageSize = Number(nextPagination.pageSize || pagination.pageSize || 20)
            loadData(nextPage, nextPageSize)
          }}
        />
      </Card>

      <Drawer
        title={detailRecord?.name || '飞书成员详情'}
        size={760}
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false)
          setDetailRecord(null)
        }}
        destroyOnHidden
      >
        {detailRecord ? (
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="姓名">{detailRecord.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="英文名">{detailRecord.en_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="昵称">{detailRecord.nickname || '-'}</Descriptions.Item>
              <Descriptions.Item label="岗位">{detailRecord.job_title || '-'}</Descriptions.Item>
              <Descriptions.Item label="手机号">{detailRecord.mobile || '-'}</Descriptions.Item>
              <Descriptions.Item label="邮箱">
                {detailRecord.email || detailRecord.enterprise_email || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="部门">
                {formatDepartmentNames(detailRecord)}
              </Descriptions.Item>
              <Descriptions.Item label="主部门">
                {detailRecord.primary_department_name || detailRecord.primary_department_id || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="直属上级">{detailRecord.leader_user_id || '-'}</Descriptions.Item>
              <Descriptions.Item label="员工编号">{detailRecord.employee_no || '-'}</Descriptions.Item>
              <Descriptions.Item label="Open ID">{detailRecord.open_id || '-'}</Descriptions.Item>
              <Descriptions.Item label="Union ID">{detailRecord.union_id || '-'}</Descriptions.Item>
              <Descriptions.Item label="User ID">{detailRecord.feishu_user_id || '-'}</Descriptions.Item>
              <Descriptions.Item label="同步批次">{detailRecord.sync_batch_id || '-'}</Descriptions.Item>
              <Descriptions.Item label="最近同步">{detailRecord.last_synced_at || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={getStatusMeta(detailRecord).color}>{getStatusMeta(detailRecord).label}</Tag>
              </Descriptions.Item>
            </Descriptions>

            <Card size="small" title="原始飞书回传">
              <pre
                style={{
                  margin: 0,
                  maxHeight: 420,
                  overflow: 'auto',
                  padding: 12,
                  background: '#fafafa',
                  borderRadius: 8,
                  fontSize: 12,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {JSON.stringify(detailRecord.raw_payload || {}, null, 2)}
              </pre>
            </Card>
          </Space>
        ) : (
          <Empty description={detailLoading ? '正在加载详情...' : '暂无详情数据'} />
        )}
      </Drawer>
    </Space>
  )
}

export default FeishuContactsPage
