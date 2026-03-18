import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from 'antd';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import './App.css';

const { Content, Sider } = Layout;

// 主应用组件 - 布局和路由
function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 登录页面 - 独立布局 */}
        <Route path="/login" element={<Login />} />

        {/* 管理后台 - 带侧边栏布局 */}
        <Route path="/*" element={
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
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                </Routes>
              </Content>
            </Layout>
          </Layout>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
