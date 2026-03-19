import { ArrowRightOutlined, LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons'
import { Button, Card, Divider, Form, Input, message } from 'antd'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { registerApi } from '../api/auth'
import './Register.css'

function Register() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm()

  const onFinish = async (values) => {
    setLoading(true)
    try {
      const result = await registerApi({
        username: values.username,
        email: values.email || null,
        password: values.password,
        confirmPassword: values.confirmPassword,
      })

      if (result?.success) {
        message.success('注册成功，请登录')
        navigate('/login')
      } else {
        message.error(result.message || '注册失败')
      }
    } catch (error) {
      console.error('Register error:', error)
      message.error(error?.message || '网络请求失败，请检查后端服务是否启动')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="register-page">
      <div className="register-container">
        <Card className="register-card">
          <div className="register-header">
            <h2 className="register-title">创建账号</h2>
            <p className="register-subtitle">加入我们的管理系统</p>
          </div>

          <Form
            form={form}
            name="register"
            onFinish={onFinish}
            autoComplete="off"
            layout="vertical"
            className="register-form"
          >
            <Form.Item
              name="username"
              rules={[
                { required: true, message: '请输入用户名' },
                { min: 2, message: '用户名至少 2 个字符' },
                { max: 20, message: '用户名最多 20 个字符' },
                {
                  pattern: /^[a-zA-Z0-9_]+$/,
                  message: '用户名只能包含字母、数字和下划线',
                },
              ]}
            >
              <Input prefix={<UserOutlined />} placeholder="用户名" size="large" />
            </Form.Item>

            <Form.Item
              name="email"
              rules={[
                {
                  type: 'email',
                  message: '邮箱格式不正确',
                },
              ]}
            >
              <Input prefix={<MailOutlined />} placeholder="邮箱（可选）" size="large" />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少 6 个字符' },
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="密码" size="large" />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              rules={[
                { required: true, message: '请确认密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve()
                    }
                    return Promise.reject(new Error('两次输入的密码不一致'))
                  },
                }),
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="确认密码" size="large" />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" size="large" loading={loading} block>
                注册
                <ArrowRightOutlined />
              </Button>
            </Form.Item>
          </Form>

          <Divider>已有账号？</Divider>

          <Link to="/login" className="login-link">
            返回登录
          </Link>
        </Card>
      </div>
    </div>
  )
}

export default Register
