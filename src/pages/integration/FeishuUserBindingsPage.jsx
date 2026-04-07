import {
  CheckOutlined,
  DisconnectOutlined,
  LinkOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  batchBindFeishuUsersApi,
  bindFeishuUserApi,
  getFeishuUserBindingCandidatesApi,
  getFeishuUserBindingRecommendationsApi,
  getFeishuUserBindingsApi,
  unbindFeishuUserApi,
} from '../../api/integration'
import { getUsersApi } from '../../api/users'
import { hasPermission } from '../../utils/access'

const { Search } = Input
const { Paragraph, Text } = Typography

const MATCH_STATUS_META = {
  CONFIDENT: { color: 'green', label: '高置信可确认' },
  REVIEW: { color: 'gold', label: '建议人工复核' },
  AMBIGUOUS: { color: 'volcano', label: '存在多个相近候选' },
  LOW_CONFIDENCE: { color: 'purple', label: '低置信候选' },
  NO_MATCH: { color: 'default', label: '未匹配到候选' },
  NO_ALIAS: { color: 'default', label: '系统信息不足' },
}

function formatDepartmentNames(names = []) {
  const list = Array.isArray(names) ? names.filter(Boolean) : []
  return list.length > 0 ? list.join('、') : '-'
}

function getBindingStatusMeta(binding) {
  if (!binding) return { color: 'default', label: '未绑定' }
  if (Number(binding.snapshot_is_resigned) === 1) return { color: 'red', label: '已绑定（离职）' }
  if (Number(binding.snapshot_is_active) === 1) return { color: 'green', label: '已绑定' }
  return { color: 'gold', label: '已绑定（未激活）' }
}

function getMatchStatusMeta(status) {
  return MATCH_STATUS_META[String(status || '').trim().toUpperCase()] || MATCH_STATUS_META.NO_MATCH
}

function isRecommendationSelectable(record) {
  return record?.match_status === 'CONFIDENT' && Number(record?.snapshot?.id || 0) > 0
}

function FeishuUserBindingsPage() {
  const canManage = hasPermission('option.manage')

  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState([])
  const [bindingsMap, setBindingsMap] = useState({})
  const [bindingSummary, setBindingSummary] = useState({
    total_users: 0,
    bound_total: 0,
    unbound_total: 0,
  })
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)

  const [recommendationLoading, setRecommendationLoading] = useState(false)
  const [recommendationRows, setRecommendationRows] = useState([])
  const [recommendationSummary, setRecommendationSummary] = useState({
    total: 0,
    confident_total: 0,
    review_total: 0,
    unmatched_total: 0,
  })
  const [selectedRecommendationKeys, setSelectedRecommendationKeys] = useState([])
  const [batchSubmitting, setBatchSubmitting] = useState(false)

  const [bindModalOpen, setBindModalOpen] = useState(false)
  const [bindTargetUser, setBindTargetUser] = useState(null)
  const [bindingSubmitting, setBindingSubmitting] = useState(false)
  const [candidateLoading, setCandidateLoading] = useState(false)
  const [candidateKeyword, setCandidateKeyword] = useState('')
  const [candidateRows, setCandidateRows] = useState([])
  const [candidatePage, setCandidatePage] = useState(1)
  const [candidatePageSize, setCandidatePageSize] = useState(10)
  const [candidateTotal, setCandidateTotal] = useState(0)
  const [selectedSnapshotId, setSelectedSnapshotId] = useState(null)

  const loadBindings = useCallback(async (userIds = []) => {
    try {
      const result = await getFeishuUserBindingsApi({
        user_ids: userIds.join(','),
      })
      if (!result?.success) {
        message.error(result?.message || '获取飞书绑定关系失败')
        return
      }

      const data = result?.data || {}
      setBindingsMap(data.map || {})
      setBindingSummary(
        data.summary || {
          total_users: 0,
          bound_total: 0,
          unbound_total: 0,
        },
      )
    } catch (error) {
      message.error(error?.message || '获取飞书绑定关系失败')
    }
  }, [])

  const loadRecommendations = useCallback(async (userIds = []) => {
    setRecommendationLoading(true)
    try {
      if (!Array.isArray(userIds) || userIds.length === 0) {
        setRecommendationRows([])
        setRecommendationSummary({
          total: 0,
          confident_total: 0,
          review_total: 0,
          unmatched_total: 0,
        })
        setSelectedRecommendationKeys([])
        return
      }

      const result = await getFeishuUserBindingRecommendationsApi({
        user_ids: userIds.join(','),
      })
      if (!result?.success) {
        message.error(result?.message || '获取智能候选失败')
        return
      }

      const data = result?.data || {}
      setRecommendationRows(Array.isArray(data.list) ? data.list : [])
      setRecommendationSummary(
        data.summary || {
          total: 0,
          confident_total: 0,
          review_total: 0,
          unmatched_total: 0,
        },
      )
      setSelectedRecommendationKeys([])
    } catch (error) {
      message.error(error?.message || '获取智能候选失败')
    } finally {
      setRecommendationLoading(false)
    }
  }, [])

  const loadUsers = useCallback(
    async (nextPage = page, nextPageSize = pageSize, nextKeyword = keyword) => {
      setLoading(true)
      try {
        const result = await getUsersApi({
          page: nextPage,
          pageSize: nextPageSize,
          ...(nextKeyword ? { keyword: nextKeyword } : {}),
          sort_by: 'real_name',
          sort_order: 'asc',
        })

        if (!result?.success) {
          message.error(result?.message || '获取系统用户失败')
          return
        }

        const data = result?.data || {}
        const list = Array.isArray(data.list) ? data.list : []
        const userIds = list.map((item) => item.id).filter(Boolean)
        setUsers(list)
        setTotal(Number(data.total || 0))
        await Promise.all([loadBindings(userIds), loadRecommendations(userIds)])
      } catch (error) {
        message.error(error?.message || '获取系统用户失败')
      } finally {
        setLoading(false)
      }
    },
    [keyword, loadBindings, loadRecommendations, page, pageSize],
  )

  useEffect(() => {
    loadUsers(page, pageSize, keyword)
  }, [keyword, loadUsers, page, pageSize])

  const loadCandidates = useCallback(
    async (nextPage = candidatePage, nextPageSize = candidatePageSize, nextKeyword = candidateKeyword) => {
      setCandidateLoading(true)
      try {
        const result = await getFeishuUserBindingCandidatesApi({
          page: nextPage,
          pageSize: nextPageSize,
          ...(nextKeyword ? { keyword: nextKeyword } : {}),
        })

        if (!result?.success) {
          message.error(result?.message || '获取飞书候选成员失败')
          return
        }

        const data = result?.data || {}
        setCandidateRows(Array.isArray(data.list) ? data.list : [])
        setCandidateTotal(Number(data.total || 0))
      } catch (error) {
        message.error(error?.message || '获取飞书候选成员失败')
      } finally {
        setCandidateLoading(false)
      }
    },
    [candidateKeyword, candidatePage, candidatePageSize],
  )

  const openBindModal = useCallback(
    async (user) => {
      setBindTargetUser(user)
      setSelectedSnapshotId(bindingsMap[user.id]?.feishu_snapshot_id || null)
      setCandidateKeyword('')
      setCandidatePage(1)
      setCandidatePageSize(10)
      setBindModalOpen(true)
      await loadCandidates(1, 10, '')
    },
    [bindingsMap, loadCandidates],
  )

  const handleConfirmBind = useCallback(async () => {
    if (!bindTargetUser?.id) {
      message.warning('请选择要绑定的系统用户')
      return
    }
    if (!selectedSnapshotId) {
      message.warning('请选择飞书成员')
      return
    }

    setBindingSubmitting(true)
    try {
      const result = await bindFeishuUserApi({
        user_id: bindTargetUser.id,
        feishu_snapshot_id: selectedSnapshotId,
      })
      if (!result?.success) {
        message.error(result?.message || '绑定飞书账号失败')
        return
      }

      message.success(result?.message || '飞书账号绑定成功')
      setBindModalOpen(false)
      setBindTargetUser(null)
      setSelectedSnapshotId(null)
      await loadUsers(page, pageSize, keyword)
    } catch (error) {
      message.error(error?.message || '绑定飞书账号失败')
    } finally {
      setBindingSubmitting(false)
    }
  }, [bindTargetUser, keyword, loadUsers, page, pageSize, selectedSnapshotId])

  const handleBatchBind = useCallback(async () => {
    const selectedRows = recommendationRows.filter((item) => selectedRecommendationKeys.includes(item.user_id))
    const items = selectedRows
      .filter((item) => isRecommendationSelectable(item))
      .map((item) => ({
        user_id: item.user_id,
        feishu_snapshot_id: item.snapshot.id,
      }))

    if (items.length === 0) {
      message.warning('请先选择可确认的智能候选')
      return
    }

    setBatchSubmitting(true)
    try {
      const result = await batchBindFeishuUsersApi({ items })
      if (!result?.success) {
        message.error(result?.message || '批量绑定失败')
        return
      }

      message.success(result?.message || '批量绑定成功')
      await loadUsers(page, pageSize, keyword)
    } catch (error) {
      message.error(error?.message || '批量绑定失败')
    } finally {
      setBatchSubmitting(false)
    }
  }, [keyword, loadUsers, page, pageSize, recommendationRows, selectedRecommendationKeys])

  const handleUnbind = useCallback(
    async (user) => {
      try {
        const result = await unbindFeishuUserApi({ user_id: user.id })
        if (!result?.success) {
          message.error(result?.message || '解绑飞书账号失败')
          return
        }

        message.success(result?.message || '飞书账号解绑成功')
        await loadUsers(page, pageSize, keyword)
      } catch (error) {
        message.error(error?.message || '解绑飞书账号失败')
      }
    },
    [keyword, loadUsers, page, pageSize],
  )

  const mergedRows = useMemo(
    () =>
      users.map((user) => ({
        ...user,
        binding: bindingsMap[user.id] || null,
      })),
    [bindingsMap, users],
  )

  const currentPageBoundCount = useMemo(
    () => mergedRows.filter((item) => item.binding).length,
    [mergedRows],
  )

  const columns = useMemo(
    () => [
      {
        title: '系统用户',
        key: 'user',
        width: 220,
        render: (_, record) => (
          <Space orientation="vertical" size={2}>
            <Text strong>{record.real_name || record.username || '-'}</Text>
            <Text type="secondary">{record.username || '-'}</Text>
          </Space>
        ),
      },
      {
        title: '部门',
        dataIndex: 'department_name',
        key: 'department_name',
        width: 160,
        render: (value) => value || '-',
      },
      {
        title: '绑定状态',
        key: 'binding_status',
        width: 140,
        render: (_, record) => {
          const meta = getBindingStatusMeta(record.binding)
          return <Tag color={meta.color}>{meta.label}</Tag>
        },
      },
      {
        title: '当前飞书账号',
        key: 'feishu_account',
        width: 260,
        render: (_, record) => {
          const binding = record.binding
          if (!binding) return <Text type="secondary">未绑定</Text>

          return (
            <Space orientation="vertical" size={2}>
              <Space size={6} wrap>
                <Text strong>{binding.snapshot_name || binding.snapshot_nickname || '-'}</Text>
                {binding.snapshot_job_title ? <Tag>{binding.snapshot_job_title}</Tag> : null}
              </Space>
              <Paragraph
                ellipsis={{ rows: 2, tooltip: formatDepartmentNames(binding.snapshot_department_names) }}
                style={{ marginBottom: 0 }}
              >
                {formatDepartmentNames(binding.snapshot_department_names)}
              </Paragraph>
            </Space>
          )
        },
      },
      {
        title: 'Open ID',
        key: 'open_id',
        width: 260,
        render: (_, record) => {
          const value = record.binding?.open_id || ''
          return (
            <Typography.Text
              copyable={value ? { text: value } : false}
              ellipsis={{ tooltip: value || '-' }}
              style={{ maxWidth: 230 }}
            >
              {value || '-'}
            </Typography.Text>
          )
        },
      },
      {
        title: '绑定更新时间',
        key: 'binding_updated_at',
        width: 180,
        render: (_, record) => record.binding?.updated_at || '-',
      },
      {
        title: '操作',
        key: 'action',
        width: 170,
        fixed: 'right',
        render: (_, record) => (
          <Space size={4} wrap>
            {canManage ? (
              <Button type="link" icon={<LinkOutlined />} onClick={() => openBindModal(record)}>
                {record.binding ? '换绑' : '绑定'}
              </Button>
            ) : null}
            {canManage && record.binding ? (
              <Popconfirm
                title="确认解绑当前飞书账号吗？"
                okText="解绑"
                cancelText="取消"
                onConfirm={() => handleUnbind(record)}
              >
                <Button danger type="link" icon={<DisconnectOutlined />}>
                  解绑
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
        ),
      },
    ],
    [canManage, handleUnbind, openBindModal],
  )

  const recommendationColumns = useMemo(
    () => [
      {
        title: '系统用户',
        key: 'user',
        width: 220,
        render: (_, record) => (
          <Space orientation="vertical" size={2}>
            <Text strong>{record.real_name || record.username || '-'}</Text>
            <Text type="secondary">{record.username || '-'}</Text>
          </Space>
        ),
      },
      {
        title: '部门',
        dataIndex: 'department_name',
        key: 'department_name',
        width: 160,
        render: (value) => value || '-',
      },
      {
        title: '匹配结果',
        key: 'match_status',
        width: 150,
        render: (_, record) => {
          const meta = getMatchStatusMeta(record.match_status)
          return <Tag color={meta.color}>{meta.label}</Tag>
        },
      },
      {
        title: '推荐飞书成员',
        key: 'snapshot',
        width: 280,
        render: (_, record) => {
          const snapshot = record.snapshot
          if (!snapshot) return <Text type="secondary">暂无候选</Text>

          return (
            <Space orientation="vertical" size={2}>
              <Space size={6} wrap>
                <Text strong>{snapshot.name || snapshot.nickname || '-'}</Text>
                {snapshot.job_title ? <Tag>{snapshot.job_title}</Tag> : null}
              </Space>
              <Paragraph
                ellipsis={{ rows: 2, tooltip: formatDepartmentNames(snapshot.department_names) }}
                style={{ marginBottom: 0 }}
              >
                {formatDepartmentNames(snapshot.department_names)}
              </Paragraph>
            </Space>
          )
        },
      },
      {
        title: '匹配分',
        dataIndex: 'match_score',
        key: 'match_score',
        width: 90,
      },
      {
        title: '匹配依据',
        key: 'match_reasons',
        width: 260,
        render: (_, record) => {
          const reasons = Array.isArray(record.match_reasons) ? record.match_reasons.filter(Boolean) : []
          const text = reasons.length > 0 ? reasons.join('；') : '-'
          return (
            <Paragraph ellipsis={{ rows: 2, tooltip: text }} style={{ marginBottom: 0 }}>
              {text}
            </Paragraph>
          )
        },
      },
      {
        title: '备选数量',
        dataIndex: 'alternative_count',
        key: 'alternative_count',
        width: 100,
      },
      {
        title: '操作',
        key: 'action',
        width: 120,
        render: (_, record) =>
          canManage ? (
            <Button type="link" icon={<LinkOutlined />} onClick={() => openBindModal(record)}>
              手动确认
            </Button>
          ) : null,
      },
    ],
    [canManage, openBindModal],
  )

  const candidateColumns = useMemo(
    () => [
      {
        title: '飞书成员',
        key: 'name',
        width: 220,
        render: (_, record) => (
          <Space orientation="vertical" size={2}>
            <Text strong>{record.name || record.nickname || '-'}</Text>
            <Text type="secondary">{record.job_title || '-'}</Text>
          </Space>
        ),
      },
      {
        title: '部门',
        key: 'department_names',
        width: 220,
        render: (_, record) => {
          const text = formatDepartmentNames(record.department_names)
          return (
            <Paragraph ellipsis={{ rows: 2, tooltip: text }} style={{ marginBottom: 0 }}>
              {text}
            </Paragraph>
          )
        },
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
        title: '最近同步',
        dataIndex: 'last_synced_at',
        key: 'last_synced_at',
        width: 180,
        render: (value) => value || '-',
      },
    ],
    [],
  )

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Card variant="borderless">
        <Space size={24} wrap>
          <Statistic title="系统用户总数" value={Number(bindingSummary.total_users || 0)} />
          <Statistic title="已绑定" value={Number(bindingSummary.bound_total || 0)} />
          <Statistic title="未绑定" value={Number(bindingSummary.unbound_total || 0)} />
          <Statistic title="当前页已绑定" value={currentPageBoundCount} />
        </Space>
      </Card>

      <Card
        title="智能候选"
        extra={
          <Space wrap>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                loadRecommendations(users.map((item) => item.id).filter(Boolean))
              }}
            >
              刷新候选
            </Button>
            {canManage ? (
              <Button
                type="primary"
                icon={<CheckOutlined />}
                loading={batchSubmitting}
                disabled={selectedRecommendationKeys.length === 0}
                onClick={handleBatchBind}
              >
                批量确认绑定
              </Button>
            ) : null}
          </Space>
        }
      >
        <Space size={24} wrap style={{ marginBottom: 16 }}>
          <Statistic title="当前页未绑定用户" value={Number(recommendationSummary.total || 0)} />
          <Statistic title="高置信候选" value={Number(recommendationSummary.confident_total || 0)} />
          <Statistic title="需人工复核" value={Number(recommendationSummary.review_total || 0)} />
          <Statistic title="未匹配" value={Number(recommendationSummary.unmatched_total || 0)} />
        </Space>

        <Table
          rowKey="user_id"
          loading={recommendationLoading}
          columns={recommendationColumns}
          dataSource={recommendationRows}
          scroll={{ x: 1450 }}
          locale={{ emptyText: <Empty description="当前页暂无可推荐的未绑定用户" /> }}
          pagination={false}
          rowSelection={
            canManage
              ? {
                  selectedRowKeys: selectedRecommendationKeys,
                  onChange: (selectedRowKeys) => {
                    setSelectedRecommendationKeys(selectedRowKeys.map((item) => Number(item)).filter(Boolean))
                  },
                  getCheckboxProps: (record) => ({
                    disabled: !isRecommendationSelectable(record),
                  }),
                }
              : undefined
          }
        />
      </Card>

      <Card
        title="飞书账号映射"
        extra={
          <Space wrap>
            <Search
              allowClear
              placeholder="搜索系统用户姓名、用户名、邮箱"
              enterButton={<SearchOutlined />}
              style={{ width: 320 }}
              onSearch={(value) => {
                setPage(1)
                setKeyword(value)
              }}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                loadUsers(page, pageSize, keyword)
              }}
            >
              刷新
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={mergedRows}
          scroll={{ x: 1390 }}
          locale={{ emptyText: <Empty description="暂无系统用户数据" /> }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count) => `共 ${count} 条`,
          }}
          onChange={(nextPagination) => {
            setPage(Number(nextPagination.current || 1))
            setPageSize(Number(nextPagination.pageSize || 20))
          }}
        />
      </Card>

      <Modal
        title={bindTargetUser ? `绑定飞书账号 - ${bindTargetUser.real_name || bindTargetUser.username}` : '绑定飞书账号'}
        open={bindModalOpen}
        width={980}
        destroyOnHidden
        confirmLoading={bindingSubmitting}
        onOk={handleConfirmBind}
        onCancel={() => {
          setBindModalOpen(false)
          setBindTargetUser(null)
          setSelectedSnapshotId(null)
        }}
      >
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          {bindTargetUser ? (
            <Card size="small" title="系统用户">
              <Space orientation="vertical" size={4}>
                <Text>
                  姓名：{bindTargetUser.real_name || '-'} / 用户名：{bindTargetUser.username || '-'}
                </Text>
                <Text>部门：{bindTargetUser.department_name || '-'}</Text>
                <Text>当前绑定：{bindingsMap[bindTargetUser.id]?.open_id || '未绑定'}</Text>
              </Space>
            </Card>
          ) : null}

          <Card
            size="small"
            title="选择飞书成员"
            extra={
              <Search
                allowClear
                placeholder="搜索飞书姓名、Open ID、手机号、邮箱"
                enterButton={<SearchOutlined />}
                style={{ width: 320 }}
                onSearch={(value) => {
                  setCandidatePage(1)
                  setCandidateKeyword(value)
                  loadCandidates(1, candidatePageSize, value)
                }}
              />
            }
          >
            <Table
              rowKey="id"
              loading={candidateLoading}
              columns={candidateColumns}
              dataSource={candidateRows}
              scroll={{ x: 900 }}
              locale={{ emptyText: <Empty description="暂无可绑定的飞书快照成员" /> }}
              rowSelection={{
                type: 'radio',
                selectedRowKeys: selectedSnapshotId ? [selectedSnapshotId] : [],
                onChange: (selectedRowKeys) => {
                  setSelectedSnapshotId(Number(selectedRowKeys?.[0] || 0) || null)
                },
              }}
              pagination={{
                current: candidatePage,
                pageSize: candidatePageSize,
                total: candidateTotal,
                showSizeChanger: true,
                showTotal: (count) => `共 ${count} 条`,
              }}
              onChange={(nextPagination) => {
                const nextPage = Number(nextPagination.current || 1)
                const nextPageSize = Number(nextPagination.pageSize || 10)
                setCandidatePage(nextPage)
                setCandidatePageSize(nextPageSize)
                loadCandidates(nextPage, nextPageSize, candidateKeyword)
              }}
            />
          </Card>
        </Space>
      </Modal>
    </Space>
  )
}

export default FeishuUserBindingsPage
