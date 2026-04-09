import { ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, Spin, Tabs, message } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { getAIPromptConfigApi, updateAIPromptConfigApi } from '../../api/aiConfig'

const { TextArea } = Input

function AIPromptConfigPage() {
  const [systemForm] = Form.useForm()
  const [knowledgeForm] = Form.useForm()
  const [categoryForm] = Form.useForm()
  const [styleForm] = Form.useForm()
  const [limitForm] = Form.useForm()

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState({})
  const [config, setConfig] = useState({})

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getAIPromptConfigApi()
      const data = result?.data || {}
      setConfig(data)

      systemForm.setFieldsValue({ systemPrompt: data.systemPrompt || '' })
      knowledgeForm.setFieldsValue({ knowledgeBase: data.knowledgeBase || '' })
      categoryForm.setFieldsValue({ categories: data.categories || '' })
      styleForm.setFieldsValue({ replyStyle: data.replyStyle || '' })
      limitForm.setFieldsValue({ limitations: data.limitations || '' })
    } catch (error) {
      message.error(error?.message || '获取配置失败')
    } finally {
      setLoading(false)
    }
  }, [systemForm, knowledgeForm, categoryForm, styleForm, limitForm])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  const handleSave = async (type, form) => {
    try {
      const values = await form.validateFields()
      setSaving((prev) => ({ ...prev, [type]: true }))

      const payload = {
        ...config,
        ...values,
      }

      const result = await updateAIPromptConfigApi(payload)
      const nextConfig = result?.data || payload
      setConfig(nextConfig)

      message.success('配置保存成功')
    } catch (error) {
      if (error?.errorFields) {
        message.error('请填写完整信息')
      } else {
        message.error(error?.message || '保存失败')
      }
    } finally {
      setSaving((prev) => ({ ...prev, [type]: false }))
    }
  }

  const tabItems = [
    {
      key: 'system',
      label: '系统角色定义',
      forceRender: true,
      children: (
        <Spin spinning={loading}>
          <Form form={systemForm} layout="vertical">
            <Form.Item
              label="系统角色定义"
              name="systemPrompt"
              rules={[{ required: true, message: '请输入系统角色定义' }]}
              extra="定义 AI 的角色和基础能力"
            >
              <TextArea rows={12} placeholder="例如：你是一位专业且富有同理心的客服专员..." />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={saving.system}
                onClick={() => handleSave('system', systemForm)}
              >
                保存配置
              </Button>
            </Form.Item>
          </Form>
        </Spin>
      ),
    },
    {
      key: 'knowledge',
      label: '知识库',
      forceRender: true,
      children: (
        <Spin spinning={loading}>
          <Form form={knowledgeForm} layout="vertical">
            <Form.Item
              label="知识库"
              name="knowledgeBase"
              rules={[{ required: true, message: '请输入知识库内容' }]}
              extra="提供常见问题与解决方案"
            >
              <TextArea rows={14} placeholder="例如：为什么我的账号被封禁了？..." />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={saving.knowledge}
                onClick={() => handleSave('knowledge', knowledgeForm)}
              >
                保存配置
              </Button>
            </Form.Item>
          </Form>
        </Spin>
      ),
    },
    {
      key: 'category',
      label: '问题分类',
      forceRender: true,
      children: (
        <Spin spinning={loading}>
          <Form form={categoryForm} layout="vertical">
            <Form.Item
              label="问题分类"
              name="categories"
              rules={[{ required: true, message: '请输入问题分类' }]}
              extra="多个分类用逗号分隔"
            >
              <TextArea rows={8} placeholder="例如：会员订阅-未激活,功能反馈-无法生成..." />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={saving.category}
                onClick={() => handleSave('category', categoryForm)}
              >
                保存配置
              </Button>
            </Form.Item>
          </Form>
        </Spin>
      ),
    },
    {
      key: 'style',
      label: '回复风格',
      forceRender: true,
      children: (
        <Spin spinning={loading}>
          <Form form={styleForm} layout="vertical">
            <Form.Item
              label="回复风格要求"
              name="replyStyle"
              rules={[{ required: true, message: '请输入回复风格要求' }]}
              extra="定义 AI 回复语气与表达偏好"
            >
              <TextArea rows={10} placeholder="例如：语气亲切自然，像朋友聊天一样..." />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={saving.style}
                onClick={() => handleSave('style', styleForm)}
              >
                保存配置
              </Button>
            </Form.Item>
          </Form>
        </Spin>
      ),
    },
    {
      key: 'limit',
      label: '限制条件',
      forceRender: true,
      children: (
        <Spin spinning={loading}>
          <Form form={limitForm} layout="vertical">
            <Form.Item
              label="限制条件"
              name="limitations"
              rules={[{ required: true, message: '请输入限制条件' }]}
              extra="定义 AI 分析和回复时必须遵循的限制"
            >
              <TextArea rows={10} placeholder="例如：回复必须基于知识库内容..." />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={saving.limit}
                onClick={() => handleSave('limit', limitForm)}
              >
                保存配置
              </Button>
            </Form.Item>
          </Form>
        </Spin>
      ),
    },
  ]

  return (
    <div style={{ padding: 12 }}>
      <Card
        title="AI 分析 Prompt 配置"
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchConfig}>
            刷新
          </Button>
        }
      >
        <Tabs items={tabItems} />

        <div style={{ marginTop: 20, padding: 12, background: '#f5f5f5', borderRadius: 6 }}>
          <h4 style={{ marginBottom: 10 }}>配置说明：</h4>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>每个配置项可独立保存，互不影响</li>
            <li>修改后新的 AI 分析会立即使用最新配置</li>
            <li>建议先在测试环境验证再应用到生产环境</li>
            <li>知识库和分类建议定期更新，保持与业务一致</li>
          </ul>
        </div>
      </Card>
    </div>
  )
}

export default AIPromptConfigPage
