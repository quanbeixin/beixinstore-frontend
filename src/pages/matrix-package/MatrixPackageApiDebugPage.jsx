import {
  ApiOutlined,
  ClearOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  SendOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
  message,
} from 'antd'
import { useMemo, useState } from 'react'
import { sendMatrixPackageDebugRequestApi } from '../../api/matrixPackageDebug'
import './MatrixPackageApiDebugPage.css'

const { Text } = Typography
const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].map((item) => ({ label: item, value: item }))

function parseJsonObject(value, fieldName) {
  const text = String(value || '').trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${fieldName} 必须是 JSON 对象`)
    }
    return parsed
  } catch (error) {
    throw new Error(error?.message || `${fieldName} 格式错误`)
  }
}

function tryFormatJson(text) {
  const source = String(text || '')
  if (!source) return ''
  try {
    return JSON.stringify(JSON.parse(source), null, 2)
  } catch {
    return source
  }
}

function formatHeaders(headers) {
  if (!headers || typeof headers !== 'object') return ''
  return JSON.stringify(headers, null, 2)
}

function getStatusColor(status) {
  const code = Number(status || 0)
  if (code >= 200 && code < 300) return 'green'
  if (code >= 300 && code < 400) return 'blue'
  if (code >= 400 && code < 500) return 'gold'
  if (code >= 500) return 'red'
  return 'default'
}

function MatrixPackageApiDebugPage() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [errorText, setErrorText] = useState('')

  const responseBody = useMemo(() => tryFormatJson(result?.body), [result])
  const responseHeaders = useMemo(() => formatHeaders(result?.headers), [result])

  const handleCopy = async (text, emptyMessage = '暂无可复制内容') => {
    const value = String(text || '')
    if (!value) {
      message.warning(emptyMessage)
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      message.success('已复制')
    } catch {
      message.error('复制失败，请手动复制')
    }
  }

  const handleSubmit = async () => {
    setErrorText('')
    try {
      const values = await form.validateFields()
      const payload = {
        url: values.url,
        method: values.method,
        timeout_ms: values.timeout_ms,
        body_type: values.body_type,
        headers: parseJsonObject(values.headers, 'Headers'),
        query: parseJsonObject(values.query, 'Query'),
        body: values.body || '',
      }

      setLoading(true)
      const response = await sendMatrixPackageDebugRequestApi(payload)
      if (!response?.success) {
        setResult(null)
        setErrorText(response?.message || '请求失败')
        message.error(response?.message || '请求失败')
        return
      }
      setResult(response.data || null)
      message.success('请求完成')
    } catch (error) {
      if (error?.errorFields) return
      setErrorText(error?.message || '请求失败')
      message.error(error?.message || '请求失败')
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => {
    setResult(null)
    setErrorText('')
  }

  return (
    <div className="matrix-api-debug-page">
      <Card variant="borderless" className="matrix-api-debug-toolbar">
        <Space wrap>
          <Tag icon={<ApiOutlined />} color="blue">后端代理</Tag>
          <Text type="secondary">用于验证外部接口连通性；已拦截本机、内网与 metadata 地址。</Text>
        </Space>
      </Card>

      <Row gutter={[14, 14]} align="stretch">
        <Col xs={24} xl={11}>
          <Card
            variant="borderless"
            title="请求配置"
            extra={(
              <Space>
                <Button icon={<ClearOutlined />} onClick={handleClear}>清空结果</Button>
                <Button type="primary" icon={<SendOutlined />} loading={loading} onClick={handleSubmit}>发送</Button>
              </Space>
            )}
          >
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                method: 'GET',
                body_type: 'json',
                timeout_ms: 15000,
                headers: '{\n  "Accept": "application/json"\n}',
                query: '{}',
              }}
            >
              <Row gutter={12}>
                <Col xs={24} md={8}>
                  <Form.Item label="Method" name="method" rules={[{ required: true, message: '请选择 Method' }]}>
                    <Select options={METHOD_OPTIONS} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={16}>
                  <Form.Item label="超时时间" name="timeout_ms">
                    <InputNumber min={1000} max={30000} step={1000} addonAfter="ms" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                label="URL"
                name="url"
                rules={[
                  { required: true, message: '请输入 URL' },
                  { type: 'url', warningOnly: true, message: '请输入完整 HTTP/HTTPS URL' },
                ]}
              >
                <Input placeholder="https://example.com/api/health" />
              </Form.Item>

              <Form.Item label="Query Params JSON" name="query">
                <Input.TextArea rows={4} spellCheck={false} />
              </Form.Item>

              <Form.Item label="Headers JSON" name="headers">
                <Input.TextArea rows={6} spellCheck={false} />
              </Form.Item>

              <Form.Item label="Body 类型" name="body_type">
                <Select
                  options={[
                    { label: 'JSON', value: 'json' },
                    { label: 'Text', value: 'text' },
                  ]}
                />
              </Form.Item>

              <Form.Item label="Body" name="body">
                <Input.TextArea rows={8} placeholder={'{\n  "key": "value"\n}'} spellCheck={false} />
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} xl={13}>
          <Card
            variant="borderless"
            title="响应结果"
            extra={result ? (
              <Space>
                <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopy(responseHeaders)}>复制 Headers</Button>
                <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopy(responseBody)}>复制 Body</Button>
              </Space>
            ) : null}
          >
            {errorText ? <Alert type="error" showIcon message={errorText} className="matrix-api-debug-alert" /> : null}

            {result ? (
              <div className="matrix-api-debug-response">
                <Row gutter={[12, 12]}>
                  <Col xs={12} md={6}>
                    <Statistic title="状态码" value={result.status} prefix={<Tag color={getStatusColor(result.status)}>{result.status_text || '-'}</Tag>} />
                  </Col>
                  <Col xs={12} md={6}>
                    <Statistic title="耗时" value={result.duration_ms} suffix="ms" prefix={<ClockCircleOutlined />} />
                  </Col>
                  <Col xs={24} md={12}>
                    <div className="matrix-api-debug-url">
                      <Text type="secondary">Final URL</Text>
                      <Text copyable>{result.final_url || result.url || '-'}</Text>
                    </div>
                  </Col>
                </Row>

                {result.body_truncated ? (
                  <Alert type="warning" showIcon message="响应体较大，已截断展示前 200000 个字符。" />
                ) : null}

                <div>
                  <div className="matrix-api-debug-section-title">Headers</div>
                  <pre className="matrix-api-debug-code">{responseHeaders || '-'}</pre>
                </div>

                <div>
                  <div className="matrix-api-debug-section-title">Body</div>
                  <pre className="matrix-api-debug-code matrix-api-debug-body">{responseBody || '-'}</pre>
                </div>
              </div>
            ) : (
              <div className="matrix-api-debug-empty">
                <ApiOutlined />
                <Text type="secondary">填写请求配置后发送，响应会显示在这里。</Text>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default MatrixPackageApiDebugPage
