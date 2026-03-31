import { Layout } from 'antd'
import { useState } from 'react'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'

const { Content, Sider } = Layout
const SIDEBAR_COLLAPSED_KEY = 'sidebar_collapsed'

function readInitialCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function AdminLayout({ route, children }) {
  const [collapsed, setCollapsed] = useState(readInitialCollapsed)

  const handleToggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        // noop
      }
      return next
    })
  }

  return (
    <Layout className="app-layout">
      <Sider width={240} collapsedWidth={80} collapsed={collapsed} trigger={null} className="app-sider">
        <div className="logo-container">
          <div className="logo-text">ADMIN</div>
        </div>
        <Sidebar collapsed={collapsed} />
      </Sider>
      <Layout className="app-main-layout">
        <Header route={route} collapsed={collapsed} onToggleSidebar={handleToggleCollapsed} />
        <Content className="app-content">{children}</Content>
      </Layout>
    </Layout>
  )
}

export default AdminLayout
