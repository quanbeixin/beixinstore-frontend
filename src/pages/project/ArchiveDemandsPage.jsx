import { DeleteOutlined, ReloadOutlined, RollbackOutlined, SearchOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  DatePicker,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getUsersApi } from '../../api/users'
import {
  getArchivedDemandsApi,
  purgeArchivedDemandApi,
  restoreArchivedDemandApi,
} from '../../api/work'
import { hasPermission } from '../../utils/access'
import { formatBeijingDateTime } from '../../utils/datetime'

const { RangePicker } = DatePicker
const { Text } = Typography

function getHealthTagColor(healthStatus) {
  if (healthStatus === 'red') return 'error'
  if (healthStatus === 'yellow') return 'warning'
  return 'success'
}

function getHealthLabel(healthStatus) {
  if (healthStatus === 'red') return '风险'
  if (healthStatus === 'yellow') return '预警'
  return '健康'
}

function ArchiveDemands() {
  const canManage = hasPermission('archive.manage')
  const [loading, setLoading] = useState(false)
  const [purging, setPurging] = useState(false)
  const [restoringDemandId, setRestoringDemandId] = useState('')

  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [ownerFilter, setOwnerFilter] = useState()
  const [archivedRange, setArchivedRange] = useState([])

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [list, setList] = useState([])

  const [owners, setOwners] = useState([])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [targetDemand, setTargetDemand] = useState(null)
  const [confirmDemandId, setConfirmDemandId] = useState('')

  const ownerOptions = useMemo(
    () =>
      owners.map((item) => ({
        value: item.id,
        label: item.real_name || item.username || `用户${item.id}`,
      })),
    [owners],
  )

  const loadOwners = useCallback(async () => {
    try {
      const result = await getUsersApi({ page: 1, pageSize: 500 })
      if (result?.success) {
        setOwners(result.data?.list || [])
      }
    } catch {
      // ignore owner options load failure and keep page available
    }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        page,
        pageSize,
        keyword: keyword || undefined,
        owner_user_id: ownerFilter || undefined,
        archived_start_date: archivedRange?.[0]?.format?.('YYYY-MM-DD') || undefined,
        archived_end_date: archivedRange?.[1]?.format?.('YYYY-MM-DD') || undefined,
      }
      const result = await getArchivedDemandsApi(params)
      if (!result?.success) {
        message.error(result?.message || '获取归档需求失败')
        return
      }
      setList(result.data?.list || [])
      setTotal(Number(result.data?.total || 0))
    } catch (error) {
      message.error(error?.message || '获取归档需求失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword, ownerFilter, archivedRange])

  useEffect(() => {
    loadOwners()
  }, [loadOwners])

  useEffect(() => {
    loadData()
  }, [loadData])

  const openPurgeConfirm = (record) => {
    setTargetDemand(record)
    setConfirmDemandId('')
    setConfirmOpen(true)
  }

  const closePurgeConfirm = () => {
    setConfirmOpen(false)
    setTargetDemand(null)
    setConfirmDemandId('')
  }

  const handlePurge = async () => {
    if (!targetDemand?.id) return
    if (confirmDemandId.trim().toUpperCase() !== String(targetDemand.id).toUpperCase()) {
      message.error('确认需求ID不匹配')
      return
    }

    setPurging(true)
    try {
      const result = await purgeArchivedDemandApi(targetDemand.id, {
        confirm_demand_id: confirmDemandId.trim().toUpperCase(),
      })
      if (!result?.success) {
        message.error(result?.message || '彻底删除失败')
        return
      }

      const deletedLogs = Number(result?.data?.deleted_work_logs || 0)
      message.success(`已彻底删除，关联事项删除 ${deletedLogs} 条`)
      closePurgeConfirm()

      if (list.length === 1 && page > 1) {
        setPage((prev) => Math.max(prev - 1, 1))
      } else {
        await loadData()
      }
    } catch (error) {
      message.error(error?.message || '彻底删除失败')
    } finally {
      setPurging(false)
    }
  }

  const handleRestore = async (record) => {
    if (!record?.id || !canManage) return
    setRestoringDemandId(String(record.id))
    try {
      const result = await restoreArchivedDemandApi(record.id)
      if (!result?.success) {
        message.error(result?.message || '恢复归档需求失败')
        return
      }

      message.success(result?.message || `需求 ${record.id} 已恢复`)
      if (list.length === 1 && page > 1) {
        setPage((prev) => Math.max(prev - 1, 1))
      } else {
        await loadData()
      }
    } catch (error) {
      message.error(error?.message || '恢复归档需求失败')
    } finally {
      setRestoringDemandId('')
    }
  }

  const columns = [
    {
      title: '需求ID',
      dataIndex: 'id',
      key: 'id',
      width: 130,
      render: (value) => <Tag color="default">{value}</Tag>,
    },
    {
      title: '需求名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
    },
    {
      title: '负责人',
      dataIndex: 'owner_name',
      key: 'owner_name',
      width: 120,
      render: (value) => value || '-',
    },
    {
      title: '项目负责人',
      dataIndex: 'project_manager_name',
      key: 'project_manager_name',
      width: 120,
      render: (value) => value || '-',
    },
    {
      title: '健康度',
      dataIndex: 'health_status',
      key: 'health_status',
      width: 100,
      render: (value) => <Tag color={getHealthTagColor(value)}>{getHealthLabel(value)}</Tag>,
    },
    {
      title: '模板',
      dataIndex: 'template_name',
      key: 'template_name',
      width: 180,
      render: (_, record) =>
        record.template_name ? `${record.template_name} (#${record.template_id})` : '-',
    },
    {
      title: '成员数',
      dataIndex: 'member_count',
      key: 'member_count',
      width: 100,
      render: (value) => Number(value || 0),
    },
    {
      title: '归档时间',
      dataIndex: 'archived_at',
      key: 'archived_at',
      width: 170,
      render: (value) => formatBeijingDateTime(value),
    },
    {
      title: '关联事项数',
      dataIndex: 'related_log_count',
      key: 'related_log_count',
      width: 120,
      render: (value) => Number(value || 0),
    },
    {
      title: '流程实例数',
      dataIndex: 'related_workflow_instance_count',
      key: 'related_workflow_instance_count',
      width: 120,
      render: (value) => Number(value || 0),
    },
    {
      title: '操作',
      key: 'action',
      width: 250,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Popconfirm
            title={`确认恢复需求 ${record.id}？`}
            description="恢复后需求将重新回到工作列表，并可继续流程推进。"
            okText="确认恢复"
            cancelText="取消"
            onConfirm={() => handleRestore(record)}
            disabled={!canManage}
          >
            <Button
              icon={<RollbackOutlined />}
              disabled={!canManage}
              loading={restoringDemandId === String(record.id)}
            >
              恢复
            </Button>
          </Popconfirm>
          <Button
            danger
            icon={<DeleteOutlined />}
            disabled={!canManage || restoringDemandId === String(record.id)}
            onClick={() => openPurgeConfirm(record)}
          >
            彻底删除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 12 }}>
      <Card
        variant="borderless"
        title="归档管理"
        extra={
          <Button icon={<ReloadOutlined />} loading={loading} onClick={loadData}>
            刷新
          </Button>
        }
      >
        <Space wrap style={{ marginBottom: 12 }}>
          <Input
            allowClear
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onPressEnter={() => {
              setPage(1)
              setKeyword(keywordInput.trim())
            }}
            placeholder="搜索需求ID/需求名称"
            style={{ width: 260 }}
            suffix={<SearchOutlined />}
          />
          <Select
            allowClear
            showSearch
            placeholder="筛选负责人"
            options={ownerOptions}
            value={ownerFilter}
            onChange={(val) => {
              setPage(1)
              setOwnerFilter(val)
            }}
            optionFilterProp="label"
            style={{ width: 200 }}
          />
          <RangePicker
            value={archivedRange}
            onChange={(vals) => {
              setPage(1)
              setArchivedRange(vals || [])
            }}
          />
          <Button
            type="primary"
            onClick={() => {
              setPage(1)
              setKeyword(keywordInput.trim())
            }}
          >
            查询
          </Button>
          <Button
            onClick={() => {
              setKeywordInput('')
              setKeyword('')
              setOwnerFilter(undefined)
              setArchivedRange([])
              setPage(1)
            }}
          >
            重置
          </Button>
        </Space>

        {list.length === 0 ? (
          <Empty description="当前没有归档需求" />
        ) : (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <Table
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={list}
              scroll={{ x: 1360 }}
              pagination={{
                current: page,
                pageSize,
                total,
                showSizeChanger: true,
                showTotal: (count) => `共 ${count} 条`,
              }}
              onChange={(pagination) => {
                setPage(pagination.current || 1)
                setPageSize(pagination.pageSize || 10)
              }}
            />
          </div>
        )}

        {!canManage ? (
          <Text type="secondary">当前账号仅可查看归档记录，若需彻底删除请分配 `archive.manage` 权限。</Text>
        ) : null}
      </Card>

      <Modal
        title="确认彻底删除"
        open={confirmOpen}
        onCancel={closePurgeConfirm}
        onOk={handlePurge}
        okButtonProps={{ danger: true }}
        confirmLoading={purging}
        okText="确认删除"
        cancelText="取消"
        destroyOnHidden
        forceRender
      >
        <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 4 }}>
          <Text>
            该操作会永久删除需求主档、关联事项和流程数据，无法恢复。请填写需求ID以确认：
          </Text>
          <Text strong>{targetDemand?.id || '-'}</Text>
          <Input
            placeholder="请输入需求ID进行确认"
            value={confirmDemandId}
            onChange={(e) => setConfirmDemandId(e.target.value)}
            onPressEnter={handlePurge}
          />
          <Text type="secondary">
            归档时间：{targetDemand?.archived_at ? formatBeijingDateTime(targetDemand.archived_at) : '-'}
          </Text>
        </Space>
      </Modal>
    </div>
  )
}

export default ArchiveDemands
