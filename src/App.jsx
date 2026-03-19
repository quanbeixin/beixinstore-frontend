import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from 'antd'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import Dashboard from './pages/Dashboard'
import Users from './pages/Users'
import Login from './pages/Login'
import Register from './pages/Register'
import './App.css'

const { Content, Sider } = Layout

function AdminLayout({ children }) {
  return (
    <Layout className="app-layout">
      <Sider width={240} className="app-sider">
        <div className="logo-container">
          <div className="logo-text">ADMIN</div>
        </div>
        <Sidebar />
      </Sider>
      <Layout>
        <Header />
        <Content className="app-content">{children}</Content>
      </Layout>
    </Layout>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/dashboard"
          element={
            <AdminLayout>
              <Dashboard />
            </AdminLayout>
          }
        />
        <Route
          path="/users"
          element={
            <AdminLayout>
              <Users />
            </AdminLayout>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
