import {
  AlertOutlined,
  EditOutlined,
  ReloadOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Result,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getOwnerWorkbenchApi, previewNoFillReminderApi, updateWorkLogOwnerEstimateApi } from '../api/work'

const { Text } = Typography

function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function formatDateTime(value) {
  if (!value) return '-'
  const text = String(value)
  if (text.includes('T')) return text.replace('T', ' ').slice(0, 19)
  return text.slice(0, 19)
}

function formatDateOnly(value) {
  if (!value) return '-'
  const text = String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  if (text.includes('T')) return text.split('T')[0]
  return text.slice(0, 10)
}

function getSearchText(item) {
  return [
    item?.id,
    item?.username,
    item?.item_type_name,
    item?.demand_id,
    item?.demand_name,
    item?.phase_name,
    item?.phase_key,
    item?.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function OwnerWorkbench() {
  const [loading, setLoading] = useState(false)
  const [remindLoading, setRemindLoading] = useState(false)
  const [savingEstimate, setSavingEstimate] = useState(false)
  const [batchSaving, setBatchSaving] = useState(false)
  const [lastLoadedAt, setLastLoadedAt] = useState(null)
  const [noAccess, setNoAccess] = useState(false)
  const [noAccessMessage, setNoAccessMessage] = useState('仅部门负责人可访问 Owner 工作台')

  const [estimateModalOpen, setEstimateModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [batchModalOpen, setBatchModalOpen] = useState(false)

  const [keyword, setKeyword] = useState('')
  const [memberFilter, setMemberFilter] = useState()
  const [phaseFilter, setPhaseFilter] = useState()
  const [pendingOnly, setPendingOnly] = useState(true)
  const [selectedRowKeys, setSelectedRowKeys] = useState([])

  const [estimateForm] = Form.useForm()
  const [batchForm] = Form.useForm()

  const [data, setData] = useState({
    data_scope: {
      scope_type: 'SELF_DEPARTMENT',
      scope_label: '-',
      department_id: null,
      department_name: null,
      team_member_count: 0,
    },
    team_overview: {
      team_size: 0,
      filled_users_today: 0,
      unfilled_users_today: 0,
      total_personal_estimate_hours_today: 0,
      total_actual_hours_today: 0,
    },
    no_fill_members: [],
    owner_estimate_items: [],
    owner_estimate_pending_count: 0,
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getOwnerWorkbenchApi()
      if (!result?.success) {
        message.error(result?.message || '获取 Owner 工作台失败')
        return
      }
      setNoAccess(false)
      setData(result.data || {})
      setLastLoadedAt(new Date().toISOString())
      setSelectedRowKeys([])
    } catch (error) {
      if (error?.status === 403) {
        setNoAccess(true)
        setNoAccessMessage(error?.message || '仅部门负责人可访问 Owner 工作台')
      } else {
        message.error(error?.message || '获取 Owner 工作台失败')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handlePreviewReminder = async () => {
    if (noAccess) {
      message.warning(noAccessMessage)
      return
    }

    setRemindLoading(true)
    try {
      const result = await previewNoFillReminderApi()
      if (!result?.success) {
        message.error(result?.message || '生成未填报提醒预览失败')
        return
      }
      const count = result?.data?.no_fill_members?.length || 0
      message.success(`提醒预览已生成，未填报 ${count} 人`)
    } catch (error) {
      message.error(error?.message || '生成未填报提醒预览失败')
    } finally {
      setRemindLoading(false)
    }
  }

  const overview = data.team_overview || {}
  const dataScope = data.data_scope || {}
  const teamSize = toNumber(overview.team_size, 0)
  const filledUsers = toNumber(overview.filled_users_today, 0)
  const fillRate = teamSize > 0 ? Math.min(100, Math.max(0, (filledUsers / teamSize) * 100)) : 0
  const scopeLabel = dataScope.scope_label || (dataScope.scope_type === 'ALL' ? '全部部门' : '-')
  const scopeMemberCount = toNumber(dataScope.team_member_count, teamSize)
  const noFillMembers = Array.isArray(data.no_fill_members) ? data.no_fill_members : []
  const ownerEstimateItems = Array.isArray(data.owner_estimate_items) ? data.owner_estimate_items : []
  const pendingOwnerEstimateCount = toNumber(data.owner_estimate_pending_count, 0)

  const memberOptions = useMemo(() => {
    const map = new Map()
    ownerEstimateItems.forEach((item) => {
      const id = Number(item.user_id)
      if (!Number.isInteger(id)) return
      if (!map.has(id)) {
        map.set(id, {
          value: id,
          label: item.username ? `${item.username} (#${id})` : `用户#${id}`,
        })
      }
    })
    return Array.from(map.values())
  }, [ownerEstimateItems])

  const phaseOptions = useMemo(() => {
    const map = new Map()
    ownerEstimateItems.forEach((item) => {
      const key = String(item.phase_key || '')
      if (!key) return
      if (!map.has(key)) {
        const label = item.phase_name ? `${item.phase_name} (${key})` : key
        map.set(key, { value: key, label })
      }
    })
    return Array.from(map.values())
  }, [ownerEstimateItems])

  const filteredOwnerEstimateItems = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    return ownerEstimateItems.filter((item) => {
      if (pendingOnly && item.owner_estimate_hours !== null && item.owner_estimate_hours !== undefined) return false
      if (memberFilter && Number(item.user_id) !== Number(memberFilter)) return false
      if (phaseFilter && String(item.phase_key || '') !== String(phaseFilter)) return false
      if (q && !getSearchText(item).includes(q)) return false
      return true
    })
  }, [ownerEstimateItems, keyword, memberFilter, phaseFilter, pendingOnly])

  const openEstimateModal = (item) => {
    setEditingItem(item)
    estimateForm.setFieldsValue({
      owner_estimate_hours:
        item?.owner_estimate_hours === null || item?.owner_estimate_hours === undefined
          ? undefined
          : toNumber(item.owner_estimate_hours, 0),
    })
    setEstimateModalOpen(true)
  }

  const closeEstimateModal = () => {
    setEstimateModalOpen(false)
    setEditingItem(null)
    estimateForm.resetFields()
  }

  const handleSaveOwnerEstimate = async () => {
    if (!editingItem?.id) return

    try {
      const values = await estimateForm.validateFields()
      setSavingEstimate(true)
      const result = await updateWorkLogOwnerEstimateApi(editingItem.id, {
        owner_estimate_hours: values.owner_estimate_hours,
      })

      if (!result?.success) {
        message.error(result?.message || 'Owner 预估更新失败')
        return
      }

      message.success('Owner 预估已更新')
      closeEstimateModal()
      await loadData()
    } catch (error) {
      if (error?.errorFields) {
        message.error('请检查 Owner 预估输入')
      } else {
        message.error(error?.message || 'Owner 预估更新失败')
      }
    } finally {
      setSavingEstimate(false)
    }
  }

  const openBatchModal = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先勾选要批量评估的事项')
      return
    }
    batchForm.setFieldsValue({ owner_estimate_hours: undefined })
    setBatchModalOpen(true)
  }

  const closeBatchModal = () => {
    setBatchModalOpen(false)
    batchForm.resetFields()
  }

  const handleBatchSave = async () => {
    try {
      const values = await batchForm.validateFields()
      const targets = filteredOwnerEstimateItems.filter((item) => selectedRowKeys.includes(item.id))
      if (targets.length === 0) {
        message.warning('当前筛选结果中没有可批量更新的事项')
        return
      }

      setBatchSaving(true)
      let successCount = 0
      for (const item of targets) {
        try {
          const result = await updateWorkLogOwnerEstimateApi(item.id, {
            owner_estimate_hours: values.owner_estimate_hours,
          })
          if (result?.success) successCount += 1
        } catch {
          // keep going for batch robustness
        }
      }

      message.success(`批量更新完成：成功 ${successCount}/${targets.length}`)
      closeBatchModal()
      await loadData()
    } catch (error) {
      if (error?.errorFields) {
        message.error('请检查批量评估输入')
      } else {
        message.error(error?.message || '批量更新失败')
      }
    } finally {
      setBatchSaving(false)
    }
  }

  const noFillColumns = useMemo(
    () => [
      { title: '用户ID', dataIndex: 'id', key: 'id', width: 100 },
      { title: '用户名', dataIndex: 'username', key: 'username' },
    ],
    [],
  )

  const ownerEstimateColumns = [
    {
      title: '事项ID',
      dataIndex: 'id',
      key: 'id',
      width: 90,
      render: (value) => <Tag color="blue">#{value}</Tag>,
    },
    {
      title: '成员',
      dataIndex: 'username',
      key: 'username',
      width: 120,
    },
    {
      title: '事项类型',
      dataIndex: 'item_type_name',
      key: 'item_type_name',
      width: 140,
    },
    {
      title: '关联需求',
      key: 'demand',
      width: 240,
      render: (_, row) => (row.demand_id ? `${row.demand_id} - ${row.demand_name || '-'}` : '-'),
    },
    {
      title: '阶段',
      key: 'phase',
      width: 150,
      render: (_, row) => row.phase_name || row.phase_key || '-',
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '个人预估(h)',
      dataIndex: 'personal_estimate_hours',
      key: 'personal_estimate_hours',
      width: 120,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '实际(h)',
      dataIndex: 'actual_hours',
      key: 'actual_hours',
      width: 100,
      render: (value) => toNumber(value, 0).toFixed(1),
    },
    {
      title: '预计完成日期',
      dataIndex: 'expected_completion_date',
      key: 'expected_completion_date',
      width: 130,
      render: (value) => formatDateOnly(value),
    },
    {
      title: 'Owner评估(h)',
      dataIndex: 'owner_estimate_hours',
      key: 'owner_estimate_hours',
      width: 130,
      render: (value) =>
        value === null || value === undefined ? <Tag color="orange">待评估</Tag> : toNumber(value, 0).toFixed(1),
    },
    {
      title: 'Owner评估时间',
      dataIndex: 'owner_estimated_at',
      key: 'owner_estimated_at',
      width: 160,
      render: (value) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      fixed: 'right',
      render: (_, row) => (
        <Button type="link" icon={<EditOutlined />} onClick={() => openEstimateModal(row)}>
          维护评估
        </Button>
      ),
    },
  ]

  if (noAccess) {
    return (
      <div style={{ padding: 24 }}>
        <Card variant="borderless">
          <Result
            status="403"
            title="暂无访问权限"
            subTitle={noAccessMessage}
            extra={[
              <Button key="refresh" icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
                重新校验权限
              </Button>,
            ]}
          />
        </Card>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Owner工作台</h1>
        <p style={{ margin: '8px 0 0', color: '#667085' }}>
          面向部门负责人的每日视图：填报覆盖、团队投入与事项 Owner 评估维护。
        </p>
        <Space size={8} wrap style={{ marginTop: 10 }}>
          <Tag color={dataScope.scope_type === 'ALL' ? 'purple' : 'blue'}>{`数据范围: ${scopeLabel}`}</Tag>
          <Tag>{`在岗成员: ${scopeMemberCount}`}</Tag>
        </Space>
      </div>

      <Card
        variant="borderless"
        style={{ marginBottom: 16 }}
        extra={
          <Space wrap>
            <Text type="secondary">最近刷新：{formatDateTime(lastLoadedAt)}</Text>
            <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
              刷新
            </Button>
            <Button icon={<AlertOutlined />} loading={remindLoading} onClick={handlePreviewReminder}>
              未填报提醒预览
            </Button>
          </Space>
        }
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8} lg={4}>
            <Card variant="borderless">
              <Space>
                <TeamOutlined />
                <Text type="secondary">团队人数</Text>
              </Space>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{teamSize}</div>
            </Card>
          </Col>
          <Col xs={24} md={8} lg={4}>
            <Card variant="borderless">
              <Space>
                <AlertOutlined />
                <Text type="secondary">今日已填报</Text>
              </Space>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{filledUsers}</div>
            </Card>
          </Col>
          <Col xs={24} md={8} lg={4}>
            <Card variant="borderless">
              <Space>
                <TeamOutlined />
                <Text type="secondary">今日填报率</Text>
              </Space>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{`${fillRate.toFixed(1)}%`}</div>
            </Card>
          </Col>
          <Col xs={24} md={8} lg={4}>
            <Card variant="borderless">
              <Space>
                <WarningOutlined />
                <Text type="secondary">今日未填报</Text>
              </Space>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, color: '#d4380d' }}>
                {toNumber(overview.unfilled_users_today, 0)}
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8} lg={4}>
            <Card variant="borderless">
              <Space>
                <TeamOutlined />
                <Text type="secondary">团队今日预估(h)</Text>
              </Space>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>
                {toNumber(overview.total_personal_estimate_hours_today, 0).toFixed(1)}
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8} lg={4}>
            <Card variant="borderless">
              <Space>
                <TeamOutlined />
                <Text type="secondary">团队今日实际(h)</Text>
              </Space>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>
                {toNumber(overview.total_actual_hours_today, 0).toFixed(1)}
              </div>
            </Card>
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={7}>
          <Card title="今日未填报成员" variant="borderless">
            {noFillMembers.length === 0 ? (
              <Empty description="今日全员已填报" />
            ) : (
              <Table
                rowKey="id"
                loading={loading}
                columns={noFillColumns}
                dataSource={noFillMembers}
                pagination={false}
                size="small"
              />
            )}
          </Card>
        </Col>
        <Col xs={24} xl={17}>
          <Card
            title="事项 Owner 评估维护"
            variant="borderless"
            extra={
              <Space wrap>
                <Tag color={pendingOwnerEstimateCount > 0 ? 'orange' : 'green'}>{`待评估 ${pendingOwnerEstimateCount}`}</Tag>
                <Tag>{`总事项 ${ownerEstimateItems.length}`}</Tag>
                <Tag>{`筛选后 ${filteredOwnerEstimateItems.length}`}</Tag>
              </Space>
            }
          >
            <Space wrap style={{ marginBottom: 12 }}>
              <Input
                allowClear
                placeholder="搜索成员/需求/阶段/描述"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                style={{ width: 260 }}
              />
              <Select
                allowClear
                placeholder="筛选成员"
                options={memberOptions}
                value={memberFilter}
                onChange={setMemberFilter}
                style={{ width: 180 }}
              />
              <Select
                allowClear
                placeholder="筛选阶段"
                options={phaseOptions}
                value={phaseFilter}
                onChange={setPhaseFilter}
                style={{ width: 220 }}
              />
              <Space>
                <Text type="secondary">仅看待评估</Text>
                <Switch checked={pendingOnly} onChange={setPendingOnly} />
              </Space>
              <Button onClick={() => setSelectedRowKeys([])}>清空勾选</Button>
              <Button type="primary" disabled={selectedRowKeys.length === 0} onClick={openBatchModal}>
                批量评估
              </Button>
            </Space>

            {filteredOwnerEstimateItems.length === 0 ? (
              <Empty description="当前筛选下暂无可维护事项" />
            ) : (
              <div style={{ width: '100%', overflowX: 'auto' }}>
                <Table
                  rowKey="id"
                  loading={loading}
                  columns={ownerEstimateColumns}
                  dataSource={filteredOwnerEstimateItems}
                  size="small"
                  scroll={{ x: 1680 }}
                  rowSelection={{
                    selectedRowKeys,
                    onChange: (keys) => setSelectedRowKeys(keys),
                    preserveSelectedRowKeys: true,
                  }}
                  pagination={{
                    pageSize: 10,
                    showSizeChanger: false,
                    showTotal: (count) => `共 ${count} 条`,
                  }}
                />
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title={editingItem ? `维护 Owner 评估：#${editingItem.id}` : '维护 Owner 评估'}
        open={estimateModalOpen}
        onCancel={closeEstimateModal}
        onOk={handleSaveOwnerEstimate}
        confirmLoading={savingEstimate}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={estimateForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            label="Owner评估(h)"
            name="owner_estimate_hours"
            rules={[{ required: true, message: '请输入 Owner 评估工时' }]}
          >
            <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          {editingItem ? (
            <div style={{ color: '#667085', fontSize: 12 }}>
              事项: {editingItem.item_type_name || '-'} / 成员: {editingItem.username || '-'}
            </div>
          ) : null}
        </Form>
      </Modal>

      <Modal
        title={`批量评估（已选 ${selectedRowKeys.length} 项）`}
        open={batchModalOpen}
        onCancel={closeBatchModal}
        onOk={handleBatchSave}
        confirmLoading={batchSaving}
        okText="批量保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={batchForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            label="统一 Owner评估(h)"
            name="owner_estimate_hours"
            rules={[{ required: true, message: '请输入评估工时' }]}
          >
            <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          <Text type="secondary">将对当前筛选结果中已勾选事项统一设置该评估值。</Text>
        </Form>
      </Modal>
    </div>
  )
}

export default OwnerWorkbench

