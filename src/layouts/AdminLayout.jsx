import { Layout } from 'antd'
import Header from '../components/Header'
import Sidebar from '../components/Sidebar'

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

export default AdminLayout
