import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from 'antd';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Login from './pages/Login';
import Register from './pages/Register';
import './App.css';

const { Content, Sider } = Layout;

// 主应用组件 - 布局和路由
function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 默认重定向到登录页 */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* 登录页面 - 独立布局 */}
        <Route path="/login" element={<Login />} />

        {/* 注册页面 - 独立布局 */}
        <Route path="/register" element={<Register />} />

        {/* 管理后台 - 带侧边栏布局 */}
        <Route path="/dashboard" element={
          <Layout className="app-layout">
            <Sider width={240} className="app-sider">
              <div className="logo-container">
                <div className="logo-text">ADMIN</div>
              </div>
              <Sidebar />
            </Sider>
            <Layout>
              <Header />
              <Content className="app-content">
                <Dashboard />
              </Content>
            </Layout>
          </Layout>
        } />

        {/* 用户管理页面 */}
        <Route path="/users" element={
          <Layout className="app-layout">
            <Sider width={240} className="app-sider">
              <div className="logo-container">
                <div className="logo-text">ADMIN</div>
              </div>
              <Sidebar />
            </Sider>
            <Layout>
              <Header />
              <Content className="app-content">
                <Users />
              </Content>
            </Layout>
          </Layout>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
