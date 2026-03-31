import { ArrowRightOutlined, LockOutlined, UserOutlined } from '@ant-design/icons'
import { Button, Checkbox, Form, Input, message } from 'antd'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getAccessApi, getPreferencesApi, loginApi } from '../../api/auth'
import { getMyMenuVisibilityApi } from '../../api/rbac'
import { setAuthStorage, setMenuVisibilityAccessMap, setUserPreferences } from '../../utils/access'
import './LoginPage.css'

async function warmupWorkbenchPage() {
  await Promise.allSettled([
    import('../../layouts/AdminLayout'),
    import('../workbench/WorkLogsPage'),
  ])
}

function Login() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const onFinish = async (values) => {
    setLoading(true)
    try {
      const result = await loginApi({
        username: values.username,
        password: values.password,
      })

      if (result?.success) {
        const remember = Boolean(values?.remember)
        const token = result?.data?.token || result?.token || result?.data?.data?.token || ''
        const user = result?.data?.user || result?.user || result?.data?.data?.user || null

        if (!token) {
          console.error('Login response missing token:', result)
          message.error('登录响应异常：未返回 token')
          return
        }

        setAuthStorage({
          token,
          user,
          remember,
        })

        const userId = Number(user?.id) > 0 ? Number(user.id) : null
        const [accessTask, menuTask, preferenceTask] = await Promise.allSettled([
          getAccessApi(),
          getMyMenuVisibilityApi(),
          getPreferencesApi(),
          warmupWorkbenchPage(),
        ])

        let accessSnapshot = null
        if (accessTask.status === 'fulfilled' && accessTask.value?.success) {
          accessSnapshot = accessTask.value.data
        } else if (accessTask.status === 'rejected') {
          console.warn('Fetch access snapshot failed:', accessTask.reason)
        }
        setAuthStorage({ access: accessSnapshot })

        let menuAccessMap = {}
        if (menuTask.status === 'fulfilled' && menuTask.value?.success) {
          menuAccessMap = menuTask.value?.data?.menu_access_map || {}
        } else if (menuTask.status === 'rejected') {
          console.warn('Fetch menu visibility failed:', menuTask.reason)
        }
        setMenuVisibilityAccessMap(menuAccessMap, { user_id: userId })

        if (preferenceTask.status === 'fulfilled' && preferenceTask.value?.success) {
          setUserPreferences(preferenceTask.value.data || {})
        } else if (preferenceTask.status === 'rejected') {
          console.warn('Fetch user preferences failed:', preferenceTask.reason)
        }

        message.success('登录成功')
        navigate('/work-logs', { replace: true })
      } else {
        message.error(result.message || '登录失败')
      }
    } catch (error) {
      console.error('Login error:', error)
      message.error(error?.message || '网络请求失败，请检查后端服务是否启动')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-brand">
        <div className="brand-bg-orb orb-1" />
        <div className="brand-bg-orb orb-2" />
        <div className="brand-grid" />

        <div className="brand-content">
          <div className="brand-logo">ADMIN</div>
          <h1 className="brand-headline">
            掌控全局
            <br />
            <span className="brand-headline-accent">从这里开始</span>
          </h1>
          <p className="brand-desc">
            统一管理你的业务数据、用户与运营，
            <br />
            让决策更清晰，效率更高。
          </p>
        </div>
      </div>

      <div className="login-form-area">
        <div className="login-form-card">
          <div className="form-header">
            <h2 className="form-title">欢迎回来</h2>
            <p className="form-subtitle">请登录你的管理员账号</p>
          </div>

          <Form
            name="login"
            onFinish={onFinish}
            autoComplete="off"
            layout="vertical"
            className="login-form"
            initialValues={{ remember: true }}
          >
            <Form.Item
              name="username"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input
                prefix={<UserOutlined className="input-icon" />}
                placeholder="用户名"
                size="large"
                className="login-input"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined className="input-icon" />}
                placeholder="密码"
                size="large"
                className="login-input"
              />
            </Form.Item>

            <div className="form-options">
              <Form.Item name="remember" valuePropName="checked" noStyle>
                <Checkbox className="remember-check">记住我</Checkbox>
              </Form.Item>
              <a className="forgot-link" href="#">
                忘记密码？
              </a>
            </div>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                className="login-btn"
                loading={loading}
                block
              >
                登录
                <ArrowRightOutlined className="btn-arrow" />
              </Button>
            </Form.Item>
          </Form>

          <div className="form-footer">
            <span className="footer-dot" />
            <span className="footer-dot" />
            <span className="footer-dot active" />
          </div>

          <div className="form-divider">
            <span>还没有账号？</span>
          </div>

          <Link to="/register" className="register-btn-link">
            <Button type="default" size="large" className="register-btn" block>
              创建新账号
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Login
