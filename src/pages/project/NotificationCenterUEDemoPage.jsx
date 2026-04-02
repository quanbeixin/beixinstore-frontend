import { useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Input,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'

const { Paragraph, Text, Title } = Typography

const BUSINESS_LINES = ['Wegic', 'SEO运营', '广告投放']
const SCENES = ['节点指派', '节点完成', '节点驳回', '任务逾期']

const INITIAL_RULES = [
  {
    id: 1,
    name: '节点指派提醒',
    business_line: 'Wegic',
    scene: '节点指派',
    receivers: ['需求负责人', '项目负责人'],
    channel: '飞书',
    message_type: '飞书卡片',
    message_title: '节点指派提醒',
    message_content:
      '【${demand_name}】已进入${node_name}，负责人：${assignee_name}，请及时跟进。\\n业务线：${business_line}',
    enabled: true,
    retry_count: 2,
    updated_at: '2026-04-02 12:20:00',
  },
  {
    id: 2,
    name: '节点完成同步',
    business_line: 'SEO运营',
    scene: '节点完成',
    receivers: ['需求负责人'],
    channel: '飞书',
    message_type: '飞书文本',
    message_title: '节点完成同步',
    message_content: '【${demand_name}】${node_name}已完成，完成人：${operator_name}，完成时间：${finished_at}',
    enabled: true,
    retry_count: 1,
    updated_at: '2026-04-02 12:22:00',
  },
  {
    id: 3,
    name: '任务逾期告警',
    business_line: '广告投放',
    scene: '任务逾期',
    receivers: ['业务线管理员'],
    channel: '飞书',
    message_type: '飞书卡片',
    message_title: '任务逾期告警',
    message_content: '告警：需求【${demand_name}】节点【${node_name}】已逾期${overdue_days}天，请负责人尽快处理。',
    enabled: false,
    retry_count: 3,
    updated_at: '2026-04-02 12:30:00',
  },
]

const INITIAL_LOGS = [
  {
    id: 101,
    rule_name: '节点指派提醒',
    business_line: 'Wegic',
    scene: '节点指派',
    receiver: '需求负责人',
    status: 'SUCCESS',
    error_message: '',
    created_at: '2026-04-02 11:55:00',
    request_payload: '{"msg_type":"interactive","scene":"NODE_ASSIGN"}',
    response_payload: '{"code":0,"msg":"ok"}',
    retry_times: 0,
  },
  {
    id: 102,
    rule_name: '任务逾期告警',
    business_line: '广告投放',
    scene: '任务逾期',
    receiver: '业务线管理员',
    status: 'FAILED',
    error_message: 'feishu: 429 rate limited',
    created_at: '2026-04-02 12:03:00',
    request_payload: '{"msg_type":"interactive","scene":"TASK_OVERDUE"}',
    response_payload: '{"code":429,"msg":"rate limited"}',
    retry_times: 2,
  },
]

function renderMessagePreview(content) {
  return String(content || '')
    .replaceAll('${demand_name}', '支付中台重构')
    .replaceAll('${node_name}', '开发实现')
    .replaceAll('${assignee_name}', '包鹏飞')
    .replaceAll('${business_line}', 'Wegic')
    .replaceAll('${operator_name}', '张璇')
    .replaceAll('${finished_at}', '2026-04-02 12:20:00')
    .replaceAll('${overdue_days}', '2')
}

function NotificationCenterUEDemoPage() {
  const [messageApi, contextHolder] = message.useMessage()
  const [rules, setRules] = useState(INITIAL_RULES)
  const [logs, setLogs] = useState(INITIAL_LOGS)

  const [ruleFilter, setRuleFilter] = useState({ keyword: '', business_line: undefined, enabled: undefined })
  const [logFilter, setLogFilter] = useState({ status: undefined, business_line: undefined, keyword: '' })

  const [ruleDrawerOpen, setRuleDrawerOpen] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [ruleForm] = Form.useForm()

  const [logDetail, setLogDetail] = useState(null)
  const [logDrawerOpen, setLogDrawerOpen] = useState(false)

  const filteredRules = useMemo(() => {
    return rules.filter((item) => {
      const byKeyword = ruleFilter.keyword
        ? `${item.name} ${item.scene} ${item.business_line}`.toLowerCase().includes(ruleFilter.keyword.toLowerCase())
        : true
      const byLine = ruleFilter.business_line ? item.business_line === ruleFilter.business_line : true
      const byEnabled =
        ruleFilter.enabled === undefined
          ? true
          : ruleFilter.enabled === 'enabled'
            ? item.enabled
            : !item.enabled
      return byKeyword && byLine && byEnabled
    })
  }, [rules, ruleFilter])

  const filteredLogs = useMemo(() => {
    return logs.filter((item) => {
      const byStatus = logFilter.status ? item.status === logFilter.status : true
      const byLine = logFilter.business_line ? item.business_line === logFilter.business_line : true
      const byKeyword = logFilter.keyword
        ? `${item.rule_name} ${item.receiver} ${item.error_message}`.toLowerCase().includes(logFilter.keyword.toLowerCase())
        : true
      return byStatus && byLine && byKeyword
    })
  }, [logs, logFilter])

  const openCreateRule = () => {
    setEditingRule(null)
    ruleForm.setFieldsValue({
      name: '',
      business_line: BUSINESS_LINES[0],
      scene: SCENES[0],
      receivers: ['需求负责人'],
      channel: '飞书',
      message_type: '飞书文本',
      message_title: '',
      message_content: '',
      enabled: true,
      retry_count: 2,
    })
    setRuleDrawerOpen(true)
  }

  const openEditRule = (rule) => {
    setEditingRule(rule)
    ruleForm.setFieldsValue({ ...rule })
    setRuleDrawerOpen(true)
  }

  const saveRule = async () => {
    const values = await ruleForm.validateFields()
    if (editingRule) {
      setRules((prev) =>
        prev.map((item) =>
          item.id === editingRule.id
            ? {
                ...item,
                ...values,
                updated_at: '2026-04-02 13:10:00',
              }
            : item,
        ),
      )
      messageApi.success('规则已更新（UE演示）')
    } else {
      setRules((prev) => [
        {
          id: Date.now(),
          ...values,
          updated_at: '2026-04-02 13:10:00',
        },
        ...prev,
      ])
      messageApi.success('规则已创建（UE演示）')
    }
    setRuleDrawerOpen(false)
  }

  const toggleRuleEnabled = (ruleId, enabled) => {
    setRules((prev) =>
      prev.map((item) => (item.id === ruleId ? { ...item, enabled, updated_at: '2026-04-02 13:10:00' } : item)),
    )
  }

  const openLogDetail = (row) => {
    setLogDetail(row)
    setLogDrawerOpen(true)
  }

  const retryLog = (row) => {
    setLogs((prev) =>
      prev.map((item) =>
        item.id === row.id
          ? {
              ...item,
              status: 'SUCCESS',
              error_message: '',
              retry_times: Number(item.retry_times || 0) + 1,
              response_payload: '{"code":0,"msg":"retry success"}',
            }
          : item,
      ),
    )
    messageApi.success('重试成功（UE演示）')
  }

  const ruleColumns = [
    {
      title: '规则名称',
      dataIndex: 'name',
      width: 160,
    },
    {
      title: '业务线',
      dataIndex: 'business_line',
      width: 120,
      render: (value) => <Tag color="blue">{value}</Tag>,
    },
    {
      title: '触发场景',
      dataIndex: 'scene',
      width: 120,
    },
    {
      title: '接收对象',
      dataIndex: 'receivers',
      width: 180,
      render: (value) => (Array.isArray(value) ? value.join('、') : '-'),
    },
    {
      title: '通知方式',
      dataIndex: 'message_type',
      width: 120,
      render: (value) => <Tag color="purple">{value}</Tag>,
    },
    {
      title: '内容预览',
      dataIndex: 'message_content',
      ellipsis: true,
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 80,
      render: (_, row) => <Switch checked={row.enabled} onChange={(checked) => toggleRuleEnabled(row.id, checked)} />,
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      width: 170,
    },
    {
      title: '操作',
      width: 180,
      fixed: 'right',
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => openEditRule(row)}>
            编辑
          </Button>
          <Button size="small" onClick={() => messageApi.info(`已触发规则：${row.name}（UE演示）`)}>
            试发
          </Button>
        </Space>
      ),
    },
  ]

  const logColumns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 170,
    },
    {
      title: '规则',
      dataIndex: 'rule_name',
      width: 160,
    },
    {
      title: '业务线',
      dataIndex: 'business_line',
      width: 120,
    },
    {
      title: '场景',
      dataIndex: 'scene',
      width: 120,
    },
    {
      title: '接收人',
      dataIndex: 'receiver',
      width: 140,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value) =>
        value === 'SUCCESS' ? <Badge status="success" text="成功" /> : <Badge status="error" text="失败" />,
    },
    {
      title: '错误信息',
      dataIndex: 'error_message',
      ellipsis: true,
    },
    {
      title: '操作',
      width: 160,
      fixed: 'right',
      render: (_, row) => (
        <Space>
          <Button size="small" onClick={() => openLogDetail(row)}>
            详情
          </Button>
          {row.status === 'FAILED' ? (
            <Button size="small" type="primary" onClick={() => retryLog(row)}>
              重试
            </Button>
          ) : null}
        </Space>
      ),
    },
  ]

  const tabs = [
    {
      key: 'rules',
      label: '通知规则',
      children: (
        <Card>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Row gutter={12}>
              <Col span={7}>
                <Input
                  placeholder="搜索规则名称/场景/业务线"
                  value={ruleFilter.keyword}
                  onChange={(e) => setRuleFilter((prev) => ({ ...prev, keyword: e.target.value }))}
                />
              </Col>
              <Col span={5}>
                <Select
                  allowClear
                  placeholder="业务线"
                  style={{ width: '100%' }}
                  options={BUSINESS_LINES.map((item) => ({ label: item, value: item }))}
                  value={ruleFilter.business_line}
                  onChange={(value) => setRuleFilter((prev) => ({ ...prev, business_line: value }))}
                />
              </Col>
              <Col span={4}>
                <Select
                  allowClear
                  placeholder="启用状态"
                  style={{ width: '100%' }}
                  options={[
                    { label: '已启用', value: 'enabled' },
                    { label: '已停用', value: 'disabled' },
                  ]}
                  value={ruleFilter.enabled}
                  onChange={(value) => setRuleFilter((prev) => ({ ...prev, enabled: value }))}
                />
              </Col>
              <Col span={8} style={{ textAlign: 'right' }}>
                <Space>
                  <Button onClick={() => setRuleFilter({ keyword: '', business_line: undefined, enabled: undefined })}>
                    重置
                  </Button>
                  <Button type="primary" onClick={openCreateRule}>
                    新建规则
                  </Button>
                </Space>
              </Col>
            </Row>
            <Table
              rowKey="id"
              columns={ruleColumns}
              dataSource={filteredRules}
              pagination={{ pageSize: 8 }}
              scroll={{ x: 1380 }}
            />
          </Space>
        </Card>
      ),
    },
    {
      key: 'logs',
      label: '通知日志',
      children: (
        <Card>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Row gutter={12}>
              <Col span={6}>
                <Input
                  placeholder="搜索规则/接收人/错误信息"
                  value={logFilter.keyword}
                  onChange={(e) => setLogFilter((prev) => ({ ...prev, keyword: e.target.value }))}
                />
              </Col>
              <Col span={4}>
                <Select
                  allowClear
                  placeholder="发送状态"
                  style={{ width: '100%' }}
                  options={[
                    { label: '成功', value: 'SUCCESS' },
                    { label: '失败', value: 'FAILED' },
                  ]}
                  value={logFilter.status}
                  onChange={(value) => setLogFilter((prev) => ({ ...prev, status: value }))}
                />
              </Col>
              <Col span={5}>
                <Select
                  allowClear
                  placeholder="业务线"
                  style={{ width: '100%' }}
                  options={BUSINESS_LINES.map((item) => ({ label: item, value: item }))}
                  value={logFilter.business_line}
                  onChange={(value) => setLogFilter((prev) => ({ ...prev, business_line: value }))}
                />
              </Col>
              <Col span={9} style={{ textAlign: 'right' }}>
                <Button onClick={() => setLogFilter({ keyword: '', status: undefined, business_line: undefined })}>
                  重置
                </Button>
              </Col>
            </Row>
            <Table
              rowKey="id"
              columns={logColumns}
              dataSource={filteredLogs}
              pagination={{ pageSize: 8 }}
              scroll={{ x: 1180 }}
            />
          </Space>
        </Card>
      ),
    },
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {contextHolder}
      <Card>
        <Title level={4} style={{ marginBottom: 8 }}>
          通知配置中心（UE可视化演示）
        </Title>
        <Text type="secondary">
          本页用于展示 notification_center 的 MVP 交互原型：通知规则、通知日志。所有操作均为本地演示数据，不会调用真实发送。
        </Text>
      </Card>

      <Tabs items={tabs} />

      <Drawer
        title={editingRule ? `编辑规则：${editingRule.name}` : '新建规则'}
        width={640}
        open={ruleDrawerOpen}
        onClose={() => setRuleDrawerOpen(false)}
        extra={
          <Space>
            <Button onClick={() => setRuleDrawerOpen(false)}>取消</Button>
            <Button type="primary" onClick={saveRule}>
              保存
            </Button>
          </Space>
        }
      >
        <Form form={ruleForm} layout="vertical">
          <Form.Item name="name" label="规则名称" rules={[{ required: true, message: '请输入规则名称' }]}>
            <Input placeholder="例如：节点完成同步通知" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="business_line" label="所属业务线" rules={[{ required: true }]}>
                <Select options={BUSINESS_LINES.map((item) => ({ label: item, value: item }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="scene" label="触发场景" rules={[{ required: true }]}>
                <Select options={SCENES.map((item) => ({ label: item, value: item }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="receivers" label="接收对象" rules={[{ required: true }]}>
            <Select
              mode="multiple"
              options={['需求负责人', '项目负责人', '业务线管理员', 'Bug处理人', 'Bug发现人'].map((item) => ({
                label: item,
                value: item,
              }))}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="channel" label="通知渠道" rules={[{ required: true }]}>
                <Select options={[{ label: '飞书', value: '飞书' }]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="message_type" label="消息类型" rules={[{ required: true }]}>
                <Select options={[{ label: '飞书文本', value: '飞书文本' }, { label: '飞书卡片', value: '飞书卡片' }]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="message_title" label="消息标题">
            <Input placeholder="可选：例如 节点指派提醒" />
          </Form.Item>
          <Form.Item name="message_content" label="消息内容" rules={[{ required: true, message: '请输入消息内容' }]}>
            <Input.TextArea
              autoSize={{ minRows: 5, maxRows: 9 }}
              placeholder="支持变量：${demand_name} ${node_name} ${assignee_name} ${business_line}"
            />
          </Form.Item>
          <Card size="small" title="内容预览（示例变量渲染）">
            <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
              {renderMessagePreview(ruleForm.getFieldValue('message_content'))}
            </Paragraph>
          </Card>
          <Row gutter={12} style={{ marginTop: 16 }}>
            <Col span={12}>
              <Form.Item name="retry_count" label="失败重试次数" rules={[{ required: true }]}>
                <Select options={[0, 1, 2, 3, 4, 5].map((num) => ({ label: String(num), value: num }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="enabled" label="是否启用" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Drawer>

      <Drawer title="日志详情" width={680} open={logDrawerOpen} onClose={() => setLogDrawerOpen(false)}>
        {logDetail ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Card size="small" title="基础信息">
              <Paragraph>规则：{logDetail.rule_name}</Paragraph>
              <Paragraph>业务线：{logDetail.business_line}</Paragraph>
              <Paragraph>场景：{logDetail.scene}</Paragraph>
              <Paragraph>接收人：{logDetail.receiver}</Paragraph>
              <Paragraph>
                状态：{logDetail.status === 'SUCCESS' ? <Tag color="success">成功</Tag> : <Tag color="error">失败</Tag>}
              </Paragraph>
              {logDetail.error_message ? <Paragraph>错误：{logDetail.error_message}</Paragraph> : null}
            </Card>
            <Card size="small" title="请求载荷">
              <Paragraph copyable style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                {logDetail.request_payload}
              </Paragraph>
            </Card>
            <Card size="small" title="响应结果">
              <Paragraph copyable style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                {logDetail.response_payload}
              </Paragraph>
            </Card>
          </Space>
        ) : null}
      </Drawer>
    </Space>
  )
}

export default NotificationCenterUEDemoPage
