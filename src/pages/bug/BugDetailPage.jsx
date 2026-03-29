import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  RedoOutlined,
  ReloadOutlined,
  SendOutlined,
  StopOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  List,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  createBugAttachmentApi,
  deleteBugAttachmentApi,
  deleteBugApi,
  fixBugApi,
  getBugAttachmentPolicyApi,
  getBugByIdApi,
  rejectBugApi,
  reopenBugApi,
  startBugApi,
  updateBugApi,
  verifyBugApi,
} from '../../api/bug'
import { BugFormModal, BugStatusFlow } from '../../modules/bug'
import { hasPermission } from '../../utils/access'
import { formatBeijingDateTime } from '../../utils/datetime'
import './BugDetailPage.css'

const { Paragraph, Text, Title } = Typography

function BugDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const bugId = Number(id)
  const canUpdate = hasPermission('bug.update')
  const canTransition = hasPermission('bug.transition')
  const canDelete = hasPermission('bug.delete')

  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState('')
  const [uploading, setUploading] = useState(false)
  const [deletingAttachmentId, setDeletingAttachmentId] = useState(0)
  const [editOpen, setEditOpen] = useState(false)
  const [detail, setDetail] = useState(null)
  const [remarkForm] = Form.useForm()

  const loadDetail = useCallback(async () => {
    if (!bugId) return
    setLoading(true)
    try {
      const result = await getBugByIdApi(bugId)
      if (!result?.success) {
        message.error(result?.message || '获取Bug详情失败')
        return
      }
      setDetail(result.data || null)
    } catch (error) {
      message.error(error?.message || '获取Bug详情失败')
    } finally {
      setLoading(false)
    }
  }, [bugId])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  useEffect(() => {
    remarkForm.setFieldsValue({
      remark: '',
      fix_solution: detail?.fix_solution || '',
      verify_result: detail?.verify_result || '',
    })
  }, [detail, remarkForm])

  const transitionButtons = useMemo(() => {
    const status = String(detail?.status_code || '').toUpperCase()
    if (!canTransition) return []
    if (status === 'NEW') {
      return [{ key: 'start', label: '开始处理', icon: <SendOutlined /> }]
    }
    if (status === 'PROCESSING') {
      return [
        { key: 'fix', label: '修复完成', icon: <CheckCircleOutlined /> },
        { key: 'reject', label: '打回', icon: <StopOutlined /> },
      ]
    }
    if (status === 'FIXED') {
      return [
        { key: 'verify', label: '验证通过', icon: <CheckCircleOutlined /> },
        { key: 'reopen', label: '重新打开', icon: <RedoOutlined /> },
      ]
    }
    if (status === 'REOPENED') {
      return [{ key: 'start', label: '重新处理', icon: <ReloadOutlined /> }]
    }
    return []
  }, [detail?.status_code, canTransition])

  const runTransition = async (actionKey) => {
    try {
      const values = await remarkForm.validateFields()
      setActionLoading(actionKey)
      let result = null

      if (actionKey === 'start') {
        result = await startBugApi(bugId, { remark: values.remark || '' })
      } else if (actionKey === 'fix') {
        result = await fixBugApi(bugId, {
          remark: values.remark || '',
          fix_solution: values.fix_solution || '',
        })
      } else if (actionKey === 'verify') {
        result = await verifyBugApi(bugId, {
          remark: values.remark || '',
          verify_result: values.verify_result || '',
        })
      } else if (actionKey === 'reopen') {
        result = await reopenBugApi(bugId, {
          remark: values.remark || '',
          verify_result: values.verify_result || '',
        })
      } else if (actionKey === 'reject') {
        result = await rejectBugApi(bugId, { remark: values.remark || '' })
      }

      if (!result?.success) {
        message.error(result?.message || '操作失败')
        return
      }

      message.success(result?.message || '操作成功')
      remarkForm.resetFields()
      await loadDetail()
    } catch (error) {
      if (error?.errorFields) return
      message.error(error?.message || '操作失败')
    } finally {
      setActionLoading('')
    }
  }

  const attachmentColumns = [
    {
      title: '文件名',
      dataIndex: 'file_name',
      key: 'file_name',
      render: (value, row) =>
        row.object_url ? (
          <a href={row.object_url} target="_blank" rel="noreferrer">
            {value || '-'}
          </a>
        ) : (
          value || '-'
        ),
    },
    {
      title: '大小',
      dataIndex: 'file_size',
      key: 'file_size',
      width: 120,
      render: (value) => (value ? `${Math.round(Number(value) / 1024)} KB` : '-'),
    },
    {
      title: '上传人',
      dataIndex: 'uploaded_by_name',
      key: 'uploaded_by_name',
      width: 140,
      render: (value) => value || '-',
    },
    {
      title: '上传时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (value) => formatBeijingDateTime(value),
    },
    ...(canUpdate
      ? [
          {
            title: '操作',
            key: 'action',
            width: 100,
            render: (_, row) => (
              <Popconfirm
                title="确认删除该附件？"
                onConfirm={async () => {
                  try {
                    setDeletingAttachmentId(Number(row.id))
                    const result = await deleteBugAttachmentApi(bugId, row.id)
                    if (!result?.success) {
                      message.error(result?.message || '附件删除失败')
                      return
                    }
                    message.success('附件删除成功')
                    await loadDetail()
                  } catch (error) {
                    message.error(error?.message || '附件删除失败')
                  } finally {
                    setDeletingAttachmentId(0)
                  }
                }}
              >
                <Button
                  type="link"
                  danger
                  size="small"
                  loading={deletingAttachmentId === Number(row.id)}
                  style={{ paddingInline: 0 }}
                >
                  删除
                </Button>
              </Popconfirm>
            ),
          },
        ]
      : []),
  ]

  const handleUpload = async ({ file, onSuccess, onError }) => {
    try {
      setUploading(true)
      const policyRes = await getBugAttachmentPolicyApi(bugId, {
        file_name: file?.name || 'file',
        mime_type: file?.type || '',
        file_size: file?.size || 0,
      })
      if (!policyRes?.success) {
        throw new Error(policyRes?.message || '获取OSS上传策略失败')
      }

      const policy = policyRes.data || {}
      if (Number(policy.max_file_size || 0) > 0 && Number(file?.size || 0) > Number(policy.max_file_size)) {
        throw new Error(`附件大小不能超过 ${Math.ceil(Number(policy.max_file_size) / 1024 / 1024)}MB`)
      }

      const formData = new FormData()
      Object.entries(policy.fields || {}).forEach(([key, value]) => {
        formData.append(key, value)
      })
      formData.append('file', file)

      const uploadRes = await fetch(policy.host, {
        method: 'POST',
        body: formData,
      })

      if (!uploadRes.ok) {
        const uploadText = await uploadRes.text().catch(() => '')
        throw new Error(uploadText || `上传到OSS失败，状态码 ${uploadRes.status}`)
      }

      const registerRes = await createBugAttachmentApi(bugId, {
        file_name: file?.name || 'file',
        file_ext: file?.name?.includes('.') ? String(file.name).split('.').pop() : '',
        file_size: file?.size || 0,
        mime_type: file?.type || '',
        storage_provider: 'ALIYUN_OSS',
        bucket_name: policy.bucket_name,
        object_key: policy.object_key,
        object_url: policy.object_url || '',
      })

      if (!registerRes?.success) {
        throw new Error(registerRes?.message || '附件登记失败')
      }

      message.success('附件上传成功')
      onSuccess?.(registerRes.data, file)
      await loadDetail()
    } catch (error) {
      message.error(error?.message || '附件上传失败')
      onError?.(error)
    } finally {
      setUploading(false)
    }
  }

  if (!bugId) {
    return (
      <div style={{ padding: 12 }}>
        <Alert type="error" title="Bug ID 无效" />
      </div>
    )
  }

  return (
    <div className="bug-detail-page">
      <Card loading={loading} variant="borderless" className="bug-detail-page__shell">
        {detail ? (
          <>
            <div className="bug-detail-page__head">
              <div>
                <Space size={8} align="center" wrap>
                  <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
                    返回
                  </Button>
                  <Tag color="blue">{detail.bug_no || '-'}</Tag>
                  <Title level={4} style={{ margin: 0 }}>
                    {detail.title || '-'}
                  </Title>
                  <Tag color={detail.status_color || 'default'}>{detail.status_name || detail.status_code}</Tag>
                </Space>
              </div>
              <Space size={8} wrap>
                {canUpdate ? (
                  <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                    编辑
                  </Button>
                ) : null}
                {canDelete ? (
                  <Popconfirm title="确认删除该Bug？" onConfirm={async () => {
                    try {
                      const result = await deleteBugApi(bugId)
                      if (!result?.success) {
                        message.error(result?.message || '删除失败')
                        return
                      }
                      message.success('Bug删除成功')
                      navigate('/bugs')
                    } catch (error) {
                      message.error(error?.message || '删除失败')
                    }
                  }}>
                    <Button danger icon={<DeleteOutlined />}>
                      删除
                    </Button>
                  </Popconfirm>
                ) : null}
              </Space>
            </div>

            <Card size="small" className="bug-detail-page__block" variant="borderless" title="状态流转">
              <BugStatusFlow currentStatus={detail.status_code} />
            </Card>

            <div className="bug-detail-page__grid">
              <Card size="small" className="bug-detail-page__block" variant="borderless" title="基本信息">
                <Descriptions column={2} size="small" bordered>
                  <Descriptions.Item label="严重程度">
                    <Tag color={detail.severity_color || 'default'}>{detail.severity_name || detail.severity_code || '-'}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="优先级">
                    <Tag color={detail.priority_color || 'default'}>{detail.priority_name || detail.priority_code || '-'}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Bug类型">{detail.bug_type_name || detail.bug_type_code || '-'}</Descriptions.Item>
                  <Descriptions.Item label="产品模块">{detail.product_name || detail.product_code || '-'}</Descriptions.Item>
                  <Descriptions.Item label="发现人">{detail.reporter_name || '-'}</Descriptions.Item>
                  <Descriptions.Item label="处理人">{detail.assignee_name || '-'}</Descriptions.Item>
                  <Descriptions.Item label="关联需求" span={2}>
                    {detail.demand_id ? (
                      <Button type="link" style={{ paddingInline: 0 }} onClick={() => navigate(`/work-demands/${detail.demand_id}`)}>
                        {detail.demand_name || detail.demand_id}
                      </Button>
                    ) : (
                      '-'
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="创建时间">{formatBeijingDateTime(detail.created_at)}</Descriptions.Item>
                  <Descriptions.Item label="更新时间">{formatBeijingDateTime(detail.updated_at)}</Descriptions.Item>
                </Descriptions>
              </Card>

              <Card size="small" className="bug-detail-page__block" variant="borderless" title="流转操作">
                <Form form={remarkForm} layout="vertical">
                  <Form.Item label="备注" name="remark">
                    <Input.TextArea rows={3} maxLength={20000} placeholder="打回、重开或处理说明可填写在这里" />
                  </Form.Item>
                  <Form.Item
                    label="修复方案"
                    name="fix_solution"
                    extra="执行“修复完成”时必填"
                  >
                    <Input.TextArea rows={3} maxLength={20000} placeholder="描述修复方案" />
                  </Form.Item>
                  <Form.Item
                    label="验证结果"
                    name="verify_result"
                    extra="执行“验证通过”或“重新打开”时建议填写"
                  >
                    <Input.TextArea rows={3} maxLength={20000} placeholder="描述验证结果" />
                  </Form.Item>

                  <Space size={8} wrap>
                    {transitionButtons.map((item) => (
                      <Button
                        key={item.key}
                        type="primary"
                        icon={item.icon}
                        loading={actionLoading === item.key}
                        onClick={() => runTransition(item.key)}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </Space>
                </Form>
              </Card>
            </div>

            <Card size="small" className="bug-detail-page__block" variant="borderless" title="问题描述">
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Bug描述">
                  <Paragraph>{detail.description || '-'}</Paragraph>
                </Descriptions.Item>
                <Descriptions.Item label="重现步骤">
                  <Paragraph>{detail.reproduce_steps || '-'}</Paragraph>
                </Descriptions.Item>
                <Descriptions.Item label="预期结果">
                  <Paragraph>{detail.expected_result || '-'}</Paragraph>
                </Descriptions.Item>
                <Descriptions.Item label="实际结果">
                  <Paragraph>{detail.actual_result || '-'}</Paragraph>
                </Descriptions.Item>
                <Descriptions.Item label="环境信息">
                  <Paragraph>{detail.environment_info || '-'}</Paragraph>
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card size="small" className="bug-detail-page__block" variant="borderless" title="修复与验证">
              <Descriptions column={1} size="small">
                <Descriptions.Item label="修复方案">
                  <Paragraph>{detail.fix_solution || '-'}</Paragraph>
                </Descriptions.Item>
                <Descriptions.Item label="验证结果">
                  <Paragraph>{detail.verify_result || '-'}</Paragraph>
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card
              size="small"
              className="bug-detail-page__block"
              variant="borderless"
              title="附件"
              extra={
                canUpdate ? (
                  <Upload
                    showUploadList={false}
                    customRequest={handleUpload}
                    disabled={uploading}
                    multiple={false}
                    maxCount={1}
                  >
                    <Button size="small" loading={uploading}>
                      上传附件
                    </Button>
                  </Upload>
                ) : null
              }
            >
              <Alert
                type="info"
                showIcon
                className="bug-detail-page__attachment-alert"
                title="附件通过阿里云OSS直传，需先在后端环境中配置 OSS 参数并完成 Bucket CORS"
              />
              <Table
                rowKey="id"
                size="small"
                columns={attachmentColumns}
                dataSource={detail.attachments || []}
                pagination={false}
                locale={{
                  emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前暂无附件" />,
                }}
              />
            </Card>

            <Card size="small" className="bug-detail-page__block" variant="borderless" title="状态变更历史">
              <List
                dataSource={detail.status_logs || []}
                locale={{ emptyText: '暂无流转记录' }}
                renderItem={(item) => (
                  <List.Item>
                    <div className="bug-detail-page__log-item">
                      <div className="bug-detail-page__log-main">
                        <Text strong>{item.operator_name || '-'}</Text>
                        <Text type="secondary">
                          {item.from_status_name || item.from_status_code || '初始'}
                          {' -> '}
                          {item.to_status_name || item.to_status_code || '-'}
                        </Text>
                      </div>
                      <div className="bug-detail-page__log-time">{formatBeijingDateTime(item.created_at)}</div>
                      {item.remark ? <div className="bug-detail-page__log-remark">{item.remark}</div> : null}
                    </div>
                  </List.Item>
                )}
              />
            </Card>

            <BugFormModal
              open={editOpen}
              title="编辑Bug"
              submitText="保存"
              initialValues={detail}
              onCancel={() => setEditOpen(false)}
              onSubmit={async (values) => {
                const result = await updateBugApi(bugId, values)
                if (!result?.success) {
                  message.error(result?.message || '更新失败')
                  return
                }
                message.success('Bug更新成功')
                setEditOpen(false)
                await loadDetail()
              }}
            />
          </>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bug不存在或已被删除" />
        )}
      </Card>
    </div>
  )
}

export default BugDetailPage
