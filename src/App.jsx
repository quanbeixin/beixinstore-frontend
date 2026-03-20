import { Suspense, lazy, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { getMyMenuVisibilityApi } from './api/rbac'
import { PRIVATE_ROUTES, PUBLIC_ROUTES } from './config/route.config'
import { canAccessRoute, getToken, setMenuVisibilityAccessMap } from './utils/access'
import './App.css'

const AdminLayout = lazy(() => import('./layouts/AdminLayout'))
const Users = lazy(() => import('./pages/Users'))
const Departments = lazy(() => import('./pages/Departments'))
const UserDepartments = lazy(() => import('./pages/UserDepartments'))
const Options = lazy(() => import('./pages/Options'))
const PerformanceDashboard = lazy(() => import('./pages/PerformanceDashboard'))
const WorkDemands = lazy(() => import('./pages/WorkDemands'))
const WorkLogs = lazy(() => import('./pages/WorkLogs'))
const OwnerWorkbench = lazy(() => import('./pages/OwnerWorkbench'))
const RolePermissions = lazy(() => import('./pages/RolePermissions'))
const MenuVisibility = lazy(() => import('./pages/MenuVisibility'))
const DictCenter = lazy(() => import('./pages/DictCenter'))
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))

const PAGE_COMPONENTS = {
  departments: Departments,
  dictCenter: DictCenter,
  login: Login,
  menuVisibility: MenuVisibility,
  options: Options,
  ownerWorkbench: OwnerWorkbench,
  performanceDashboard: PerformanceDashboard,
  register: Register,
  rolePermissions: RolePermissions,
  workDemands: WorkDemands,
  workLogs: WorkLogs,
  userDepartments: UserDepartments,
  users: Users,
}

function PageFallback() {
  return <div style={{ padding: '24px' }}>页面加载中...</div>
}

function RequireAuth({ children }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />
  }

  return children
}

function RequireRouteAccess({ route, children }) {
  if (!canAccessRoute(route)) {
    return <Navigate to="/performance-dashboard" replace />
  }

  return children
}

function renderPage(route) {
  const Component = PAGE_COMPONENTS[route.componentKey]
  if (!Component) return null
  return <Component />
}

function renderPublicRoute(route) {
  const page = renderPage(route)
  return page || <Navigate to="/" replace />
}

function renderPrivateRoute(route) {
  const page = renderPage(route)
  if (!page) {
    return <Navigate to="/performance-dashboard" replace />
  }

  const inLayout = <AdminLayout>{page}</AdminLayout>

  return (
    <RequireAuth>
      <RequireRouteAccess route={route}>{inLayout}</RequireRouteAccess>
    </RequireAuth>
  )
}

function App() {
  const [loadingVisibility, setLoadingVisibility] = useState(Boolean(getToken()))

  useEffect(() => {
    let active = true

    const loadMyMenuVisibility = async () => {
      if (!getToken()) {
        if (active) setLoadingVisibility(false)
        return
      }

      try {
        const result = await getMyMenuVisibilityApi()
        if (result?.success) {
          setMenuVisibilityAccessMap(result?.data?.menu_access_map || {})
        } else {
          setMenuVisibilityAccessMap({})
        }
      } catch {
        // keep the app available even when this endpoint is temporarily unavailable
        setMenuVisibilityAccessMap({})
      } finally {
        if (active) setLoadingVisibility(false)
      }
    }

    loadMyMenuVisibility()

    return () => {
      active = false
    }
  }, [])

  if (loadingVisibility) {
    return <PageFallback />
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route
            path="/"
            element={<Navigate to={getToken() ? '/performance-dashboard' : '/login'} replace />}
          />
          {PUBLIC_ROUTES.map((route) => (
            <Route key={route.path} path={route.path} element={renderPublicRoute(route)} />
          ))}
          {PRIVATE_ROUTES.map((route) => (
            <Route key={route.path} path={route.path} element={renderPrivateRoute(route)} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
