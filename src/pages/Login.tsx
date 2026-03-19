import { Form, Input, Button, Checkbox, message } from 'antd';
import { UserOutlined, LockOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import { useState } from 'react';
import './Login.css';

// 登录页面组件
const Login = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { username: string; password: string; remember?: boolean }) => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: values.username,
          password: values.password,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // 保存 token 和用户信息到 localStorage
        localStorage.setItem('token', result.data.token);
        localStorage.setItem('user', JSON.stringify(result.data.user));

        message.success('登录成功');
        navigate('/dashboard');
      } else {
        message.error(result.message || '登录失败');
      }
    } catch (error) {
      console.error('Login error:', error);
      message.error('网络请求失败，请检查后端服务是否启动');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* 左侧品牌区 */}
      <div className="login-brand">
        <div className="brand-bg-orb orb-1" />
        <div className="brand-bg-orb orb-2" />
        <div className="brand-grid" />

        <div className="brand-content">
          <div className="brand-logo">ADMIN</div>
          <h1 className="brand-headline">
            掌控全局<br />
            <span className="brand-headline-accent">从这里开始</span>
          </h1>
          <p className="brand-desc">
            统一管理您的业务数据、用户与运营，<br />
            让决策更清晰，效率更高。
          </p>

          <div className="brand-stats">
            <div className="brand-stat">
              <span className="brand-stat-value">12K+</span>
              <span className="brand-stat-label">活跃用户</span>
            </div>
            <div className="brand-stat-divider" />
            <div className="brand-stat">
              <span className="brand-stat-value">99.9%</span>
              <span className="brand-stat-label">系统稳定性</span>
            </div>
            <div className="brand-stat-divider" />
            <div className="brand-stat">
              <span className="brand-stat-value">24/7</span>
              <span className="brand-stat-label">实时监控</span>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧表单区 */}
      <div className="login-form-area">
        <div className="login-form-card">
          <div className="form-header">
            <h2 className="form-title">欢迎回来</h2>
            <p className="form-subtitle">请登录您的管理员账号</p>
          </div>

          <Form
            name="login"
            onFinish={onFinish}
            autoComplete="off"
            layout="vertical"
            className="login-form"
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
              <a className="forgot-link" href="#">忘记密码？</a>
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
            <span>还没有账户？</span>
          </div>

          <Link to="/register" className="register-btn-link">
            <Button
              type="default"
              size="large"
              className="register-btn"
              block
            >
              创建新账户
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
