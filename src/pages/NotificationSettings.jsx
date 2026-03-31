import { Button, Card, Col, Form, Input, Row, Space, Switch, Typography, message } from 'antd'
import { useState } from 'react'
import {
  bindFeishuOpenIdApi,
  getNotificationMetricsSummaryApi,
  updateNotificationChannelApi,
} from '../api/notifications'

const { Paragraph, Text } = Typography

function NotificationSettings() {
  const [channelLoading, setChannelLoading] = useState(false)
  const [openIdLoading, setOpenIdLoading] = useState(false)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [metrics, setMetrics] = useState(null)
  const [form] = Form.useForm()
  const [inAppEnabled, setInAppEnabled] = useState(true)
  const [feishuEnabled, setFeishuEnabled] = useState(true)

  const updateChannel = async (channel, enabled) => {
    setChannelLoading(true)
    try {
      const result = await updateNotificationChannelApi({
        channel,
        enabled,
      })
      if (!result?.success) {
        message.error(result?.message || '更新通知开关失败')
        return false
      }
      message.success(`${channel} 通知已${enabled ? '开启' : '关闭'}`)
      return true
    } catch (error) {
      message.error(error?.message || '更新通知开关失败')
      return false
    } finally {
      setChannelLoading(false)
    }
  }

  const onChangeInApp = async (checked) => {
    const ok = await updateChannel('IN_APP', checked)
    if (ok) setInAppEnabled(checked)
  }

  const onChangeFeishu = async (checked) => {
    const ok = await updateChannel('FEISHU', checked)
    if (ok) setFeishuEnabled(checked)
  }

  const onBindOpenId = async () => {
    try {
      const values = await form.validateFields()
      setOpenIdLoading(true)
      const result = await bindFeishuOpenIdApi({
        feishu_open_id: values.feishu_open_id,
      })
      if (!result?.success) {
        message.error(result?.message || '绑定飞书 OpenID 失败')
        return
      }
      message.success('飞书 OpenID 绑定成功')
    } catch (error) {
      if (!error?.errorFields) {
        message.error(error?.message || '绑定飞书 OpenID 失败')
      }
    } finally {
      setOpenIdLoading(false)
    }
  }

  const loadMetrics = async () => {
    setMetricsLoading(true)
    try {
      const result = await getNotificationMetricsSummaryApi({ days: 7 })
      if (!result?.success) {
        message.error(result?.message || '获取通知指标失败')
        return
      }
      setMetrics(result?.data || null)
    } catch (error) {
      message.error(error?.message || '获取通知指标失败')
    } finally {
      setMetricsLoading(false)
    }
  }

  return (
    <div style={{ padding: 12 }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="通知渠道配置" variant="borderless">
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Text strong>站内通知</Text>
                  <Paragraph type="secondary" style={{ margin: 0 }}>
                    关闭后将不再接收站内通知消息。
                  </Paragraph>
                </div>
                <Switch checked={inAppEnabled} loading={channelLoading} onChange={onChangeInApp} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Text strong>飞书通知</Text>
                  <Paragraph type="secondary" style={{ margin: 0 }}>
                    开启后可通过飞书应用 API 接收通知。
                  </Paragraph>
                </div>
                <Switch checked={feishuEnabled} loading={channelLoading} onChange={onChangeFeishu} />
              </div>
            </Space>
          </Card>

          <Card title="飞书 OpenID 绑定" style={{ marginTop: 16 }} variant="borderless">
            <Form form={form} layout="vertical">
              <Form.Item
                label="feishu_open_id"
                name="feishu_open_id"
                rules={[{ required: true, message: '请输入 feishu_open_id' }]}
              >
                <Input placeholder="如：ou_xxxxxxxxxxxxx" maxLength={128} />
              </Form.Item>
              <Space>
                <Button type="primary" loading={openIdLoading} onClick={onBindOpenId}>
                  绑定 OpenID
                </Button>
              </Space>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card
            title="通知监控（近7天）"
            extra={
              <Button size="small" loading={metricsLoading} onClick={loadMetrics}>
                刷新
              </Button>
            }
            variant="borderless"
          >
            {metrics ? (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Text>送达率：{Number(metrics?.summary?.delivery_rate || 0) * 100}%</Text>
                <Text>失败率：{Number(metrics?.summary?.failure_rate || 0) * 100}%</Text>
                <Text>重试恢复率：{Number(metrics?.summary?.retry_recovery_rate || 0) * 100}%</Text>
                <Text>总接收数：{metrics?.summary?.total_receivers || 0}</Text>
                <Text>站内：{metrics?.summary?.inapp_receivers || 0}</Text>
                <Text>飞书：{metrics?.summary?.feishu_receivers || 0}</Text>
              </Space>
            ) : (
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                点击“刷新”加载通知指标（需要具备对应权限）。
              </Paragraph>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default NotificationSettings
