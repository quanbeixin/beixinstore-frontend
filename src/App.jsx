import { Suspense, lazy, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { getMyMenuVisibilityApi } from './api/rbac'
import { PRIVATE_ROUTES, PUBLIC_ROUTES } from './config/route.config'
import {
  AUTH_STORAGE_UPDATED_EVENT,
  canAccessRoute,
  getToken,
  setMenuVisibilityAccessMap,
} from './utils/access'
import './App.css'

const AdminLayout = lazy(() => import('./layouts/AdminLayout'))
const Users = lazy(() => import('./pages/Users'))
const Departments = lazy(() => import('./pages/Departments'))
const UserDepartments = lazy(() => import('./pages/UserDepartments'))
const Options = lazy(() => import('./pages/Options'))
const DemandInsightBoard = lazy(() => import('./pages/DemandInsightBoard'))
const MemberRhythmBoard = lazy(() => import('./pages/MemberRhythmBoard'))
const WorkDemands = lazy(() => import('./pages/WorkDemands'))
const WorkLogs = lazy(() => import('./pages/WorkLogs'))
const MorningStandupBoard = lazy(() => import('./pages/MorningStandupBoard'))
const OwnerWorkbench = lazy(() => import('./pages/OwnerWorkbench'))
const PersonalSettings = lazy(() => import('./pages/PersonalSettings'))
const RolePermissions = lazy(() => import('./pages/RolePermissions'))
const MenuVisibility = lazy(() => import('./pages/MenuVisibility'))
const ArchiveDemands = lazy(() => import('./pages/ArchiveDemands'))
const DictCenter = lazy(() => import('./pages/DictCenter'))
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))

const PAGE_COMPONENTS = {
  departments: Departments,
  dictCenter: DictCenter,
  login: Login,
  menuVisibility: MenuVisibility,
  archiveDemands: ArchiveDemands,
  morningStandupBoard: MorningStandupBoard,
  options: Options,
  ownerWorkbench: OwnerWorkbench,
  personalSettings: PersonalSettings,
  demandInsightBoard: DemandInsightBoard,
  memberRhythmBoard: MemberRhythmBoard,
  register: Register,
  rolePermissions: RolePermissions,
  workDemands: WorkDemands,
  workLogs: WorkLogs,
  userDepartments: UserDepartments,
  users: Users,
}

function PageFallback() {
  return <div style={{ padding: '12px' }}>Loading...</div>
}

function getDefaultPrivatePath() {
  const personalWorkbenchRoute = PRIVATE_ROUTES.find((route) => route.path === '/work-logs')
  if (personalWorkbenchRoute && canAccessRoute(personalWorkbenchRoute)) return '/work-logs'

  const firstAccessibleRoute = PRIVATE_ROUTES.find((route) => canAccessRoute(route))
  return firstAccessibleRoute?.path || '/work-logs'
}

function RequireAuth({ children }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />
  }

  return children
}

function RequireRouteAccess({ route, children }) {
  if (!canAccessRoute(route)) {
    return <Navigate to={getDefaultPrivatePath()} replace />
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
    return <Navigate to={getDefaultPrivatePath()} replace />
  }

  const inLayout = <AdminLayout route={route}>{page}</AdminLayout>

  return (
    <RequireAuth>
      <RequireRouteAccess route={route}>{inLayout}</RequireRouteAccess>
    </RequireAuth>
  )
}

function App() {
  const [loadingVisibility, setLoadingVisibility] = useState(Boolean(getToken()))
  const [, setVisibilityVersion] = useState(0)

  useEffect(() => {
    let active = true
    let requestId = 0

    const loadMyMenuVisibility = async ({ showLoading = false } = {}) => {
      const currentRequestId = ++requestId
      if (showLoading && active) setLoadingVisibility(true)

      if (!getToken()) {
        setMenuVisibilityAccessMap({}, { user_id: null })
        setVisibilityVersion((value) => value + 1)
        if (active && currentRequestId === requestId) setLoadingVisibility(false)
        return
      }

      try {
        const result = await getMyMenuVisibilityApi()
        if (!active || currentRequestId !== requestId) return

        if (result?.success) {
          setMenuVisibilityAccessMap(result?.data?.menu_access_map || {})
        } else {
          setMenuVisibilityAccessMap({})
        }
        setVisibilityVersion((value) => value + 1)
      } catch {
        // keep the app available even when this endpoint is temporarily unavailable
        if (!active || currentRequestId !== requestId) return
        setMenuVisibilityAccessMap({})
        setVisibilityVersion((value) => value + 1)
      } finally {
        if (active && currentRequestId === requestId) setLoadingVisibility(false)
      }
    }

    loadMyMenuVisibility({ showLoading: Boolean(getToken()) })

    const handleAuthStorageUpdated = () => {
      loadMyMenuVisibility({ showLoading: false })
    }
    window.addEventListener(AUTH_STORAGE_UPDATED_EVENT, handleAuthStorageUpdated)

    return () => {
      active = false
      window.removeEventListener(AUTH_STORAGE_UPDATED_EVENT, handleAuthStorageUpdated)
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
            element={<Navigate to={getToken() ? getDefaultPrivatePath() : '/login'} replace />}
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

