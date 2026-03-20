import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { getToken, hasPermission } from './utils/access'
import './App.css'

const AdminLayout = lazy(() => import('./layouts/AdminLayout'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Users = lazy(() => import('./pages/Users'))
const Departments = lazy(() => import('./pages/Departments'))
const UserDepartments = lazy(() => import('./pages/UserDepartments'))
const Options = lazy(() => import('./pages/Options'))
const DictCenter = lazy(() => import('./pages/DictCenter'))
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))

function PageFallback() {
  return <div style={{ padding: '24px' }}>页面加载中...</div>
}

function RequireAuth({ children }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />
  }

  return children
}

function RequirePermission({ code, children }) {
  if (!hasPermission(code)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to={getToken() ? '/dashboard' : '/login'} replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <AdminLayout>
                  <Dashboard />
                </AdminLayout>
              </RequireAuth>
            }
          />
          <Route
            path="/users"
            element={
              <RequireAuth>
                <RequirePermission code="user.view">
                  <AdminLayout>
                    <Users />
                  </AdminLayout>
                </RequirePermission>
              </RequireAuth>
            }
          />
          <Route
            path="/departments"
            element={
              <RequireAuth>
                <RequirePermission code="dept.view">
                  <AdminLayout>
                    <Departments />
                  </AdminLayout>
                </RequirePermission>
              </RequireAuth>
            }
          />
          <Route
            path="/user-departments"
            element={
              <RequireAuth>
                <RequirePermission code="dept.view">
                  <AdminLayout>
                    <UserDepartments />
                  </AdminLayout>
                </RequirePermission>
              </RequireAuth>
            }
          />
          <Route
            path="/options"
            element={
              <RequireAuth>
                <RequirePermission code="option.view">
                  <AdminLayout>
                    <Options />
                  </AdminLayout>
                </RequirePermission>
              </RequireAuth>
            }
          />
          <Route
            path="/dict-center"
            element={
              <RequireAuth>
                <RequirePermission code="dict.view">
                  <AdminLayout>
                    <DictCenter />
                  </AdminLayout>
                </RequirePermission>
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
