import { DeleteOutlined, MessageOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Card, Empty, Input, Popconfirm, Select, Space, Tag, Typography, message } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getDictItemsApi } from '../../../api/configDict'
import {
  createDemandCommunicationApi,
  deleteDemandCommunicationApi,
  getDemandCommunicationsApi,
} from '../../../api/work'
import { getCurrentUser } from '../../../utils/access'
import { formatBeijingDateTime } from '../../../utils/datetime'
import './demand-communication-panel.css'

const { Text, Paragraph } = Typography
const { TextArea } = Input

const FALLBACK_TYPE_OPTIONS = [
  { value: 'MEETING_DECISION', label: '会议结论', color: 'blue' },
  { value: 'COMM_NOTE', label: '沟通备注', color: 'gold' },
  { value: 'RISK_ALERT', label: '风险提醒', color: 'red' },
  { value: 'DECISION_LOG', label: '决策结论', color: 'green' },
]

function DemandCommunicationPanel({ demandId, canManage = false }) {
  const currentUser = getCurrentUser()
  const currentUserId = Number(currentUser?.id || 0)

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [rows, setRows] = useState([])
  const [typeOptions, setTypeOptions] = useState(FALLBACK_TYPE_OPTIONS)
  const [typeFilter, setTypeFilter] = useState()
  const [draftTypeCode, setDraftTypeCode] = useState('COMM_NOTE')
  const [draftContent, setDraftContent] = useState('')

  const typeColorMap = useMemo(() => {
    const map = new Map()
    typeOptions.forEach((item) => {
      map.set(String(item.value || '').trim().toUpperCase(), item.color || 'default')
    })
    return map
  }, [typeOptions])

  const loadTypeOptions = useCallback(async () => {
    try {
      const result = await getDictItemsApi('demand_communication_type', { enabledOnly: true })
      if (!result?.success) {
        setTypeOptions(FALLBACK_TYPE_OPTIONS)
        return
      }
      const rows = Array.isArray(result.data) ? result.data : []
      if (rows.length === 0) {
        setTypeOptions(FALLBACK_TYPE_OPTIONS)
        return
      }
      setTypeOptions(
        rows.map((item) => ({
          value: String(item.item_code || '').trim().toUpperCase(),
          label: String(item.item_name || item.item_code || '').trim(),
          color: item.color || 'default',
        })),
      )
    } catch {
      setTypeOptions(FALLBACK_TYPE_OPTIONS)
    }
  }, [])

  const loadRows = useCallback(async () => {
    if (!demandId) {
      setRows([])
      return
    }
    setLoading(true)
    try {
      const result = await getDemandCommunicationsApi(demandId, {
        record_type_code: typeFilter || undefined,
      })
      if (!result?.success) {
        message.error(result?.message || '获取沟通记录失败')
        setRows([])
        return
      }
      setRows(Array.isArray(result.data) ? result.data : [])
    } catch (error) {
      message.error(error?.message || '获取沟通记录失败')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [demandId, typeFilter])

  useEffect(() => {
    loadTypeOptions()
  }, [loadTypeOptions])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const typeStats = useMemo(() => {
    const counter = new Map()
    rows.forEach((item) => {
      const code = String(item.record_type_code || '').trim().toUpperCase()
      if (!code) return
      counter.set(code, (counter.get(code) || 0) + 1)
    })
    return typeOptions
      .map((item) => ({
        ...item,
        total: counter.get(String(item.value || '').trim().toUpperCase()) || 0,
      }))
      .filter((item) => item.total > 0)
  }, [rows, typeOptions])

  const canSubmit = draftContent.trim().length > 0 && String(draftTypeCode || '').trim()

  const handleCreate = async () => {
    if (!demandId || !canSubmit) return
    setSubmitting(true)
    try {
      const result = await createDemandCommunicationApi(demandId, {
        record_type_code: draftTypeCode,
        content: draftContent.trim(),
      })
      if (!result?.success) {
        message.error(result?.message || '保存沟通记录失败')
        return
      }
      message.success(result?.message || '沟通记录已保存')
      setDraftContent('')
      setDraftTypeCode((prev) => prev || 'COMM_NOTE')
      await loadRows()
    } catch (error) {
      message.error(error?.message || '保存沟通记录失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (communicationId) => {
    if (!demandId || !communicationId) return
    try {
      const result = await deleteDemandCommunicationApi(demandId, communicationId)
      if (!result?.success) {
        message.error(result?.message || '删除沟通记录失败')
        return
      }
      message.success(result?.message || '沟通记录已删除')
      await loadRows()
    } catch (error) {
      message.error(error?.message || '删除沟通记录失败')
    }
  }

  return (
    <div className="demand-communication-panel">
      <Card
        size="small"
        className="demand-communication-panel__card"
        variant="borderless"
        loading={loading && rows.length === 0}
        title={
          <Space size={8}>
            <MessageOutlined />
            <span>沟通记录</span>
          </Space>
        }
        extra={
          <Space size={8} wrap>
            <Select
              allowClear
              size="small"
              className="demand-communication-panel__filter"
              placeholder="筛选类型"
              value={typeFilter}
              options={[{ label: '全部类型', value: undefined }, ...typeOptions]}
              onChange={(value) => setTypeFilter(value)}
            />
            <Button size="small" icon={<ReloadOutlined />} onClick={loadRows}>
              {loading ? '刷新中' : '刷新'}
            </Button>
          </Space>
        }
      >
        <div className="demand-communication-panel__composer">
          <div className="demand-communication-panel__composer-head">
            <Select
              value={draftTypeCode}
              className="demand-communication-panel__type-select"
              options={typeOptions}
              onChange={(value) => setDraftTypeCode(value)}
            />
            <Button type="primary" loading={submitting} disabled={!canSubmit} onClick={handleCreate}>
              保存记录
            </Button>
          </div>
          <TextArea
            rows={4}
            maxLength={5000}
            value={draftContent}
            placeholder="记录沟通备注、会议结论、风险提醒或决策说明"
            onChange={(event) => setDraftContent(event.target.value)}
          />
          <div className="demand-communication-panel__composer-foot">
            <Text type="secondary">支持沉淀需求推进过程中的口头同步、会议结论与临时决策。</Text>
            <Text type="secondary">{draftContent.trim().length}/5000</Text>
          </div>
        </div>

        {typeStats.length > 0 ? (
          <div className="demand-communication-panel__stats">
            <Tag bordered={false}>全部 {rows.length}</Tag>
            {typeStats.map((item) => (
              <Tag key={item.value} color={item.color || 'default'}>
                {item.label} {item.total}
              </Tag>
            ))}
          </div>
        ) : null}

        <div className="demand-communication-panel__timeline">
          {rows.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前需求下暂无沟通记录" />
          ) : (
            rows.map((item) => {
              const canDelete = canManage || Number(item.created_by) === currentUserId
              const typeCode = String(item.record_type_code || '').trim().toUpperCase()
              const tagColor = item.record_type_color || typeColorMap.get(typeCode) || 'default'
              return (
                <div key={item.id} className="demand-communication-panel__item">
                  <div className="demand-communication-panel__item-head">
                    <Space size={[8, 8]} wrap>
                      <Tag color={tagColor}>{item.record_type_name || item.record_type_code || '-'}</Tag>
                      <Text type="secondary">{item.created_by_name || '-'}</Text>
                      <Text type="secondary">{formatBeijingDateTime(item.created_at)}</Text>
                    </Space>
                    {canDelete ? (
                      <Popconfirm
                        title="确认删除这条沟通记录？"
                        okText="删除"
                        cancelText="取消"
                        onConfirm={() => handleDelete(item.id)}
                      >
                        <Button size="small" type="text" danger icon={<DeleteOutlined />}>
                          删除
                        </Button>
                      </Popconfirm>
                    ) : null}
                  </div>
                  <Paragraph className="demand-communication-panel__item-content">
                    {item.content || '-'}
                  </Paragraph>
                </div>
              )
            })
          )}
        </div>
      </Card>
    </div>
  )
}

export default DemandCommunicationPanel
