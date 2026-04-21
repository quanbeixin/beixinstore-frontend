import { Suspense, lazy, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { getAccessApi, getPreferencesApi, notificationLoginApi } from './api/auth'
import { getMyMenuVisibilityApi } from './api/rbac'
import { PRIVATE_ROUTES, PUBLIC_ROUTES } from './config/route.config'
import {
  AUTH_STORAGE_UPDATED_EVENT,
  canAccessRoute,
  getToken,
  setAuthStorage,
  setMenuVisibilityAccessMap,
  setUserPreferences,
} from './utils/access'
import './App.css'

const AdminLayout = lazy(() => import('./layouts/AdminLayout'))
const Users = lazy(() => import('./pages/system/UsersPage'))
const Departments = lazy(() => import('./pages/system/DepartmentsPage'))
const UserDepartments = lazy(() => import('./pages/system/UserDepartmentsPage'))
const AgentConfig = lazy(() => import('./pages/system/AgentConfigPage'))
const Options = lazy(() => import('./pages/system/OptionsPage'))
const DemandInsightBoard = lazy(() => import('./pages/insight/DemandInsightBoardPage'))
const EfficiencyFactorSettings = lazy(() => import('./pages/insight/EfficiencyFactorSettingsPage'))
const DepartmentEfficiencyRanking = lazy(() => import('./pages/insight/DepartmentEfficiencyRankingPage'))
const DepartmentEfficiencyDetail = lazy(() => import('./pages/insight/DepartmentEfficiencyDetailPage'))
const MemberRhythmBoard = lazy(() => import('./pages/insight/MemberRhythmBoardPage'))
const MemberEfficiencyDetail = lazy(() => import('./pages/insight/MemberEfficiencyDetailPage'))
const WorkDemands = lazy(() => import('./pages/project/WorkDemandsPage'))
const LaunchPlan = lazy(() => import('./pages/project/LaunchPlanPage'))
const HumanGantt = lazy(() => import('./pages/project/HumanGanttPage'))
const ProjectTemplates = lazy(() => import('./pages/project/ProjectTemplatesPage'))
const ProjectTemplateDetail = lazy(() => import('./pages/project/ProjectTemplateDetailPage'))
const NotificationConfig = lazy(() => import('./pages/project/NotificationConfigPage'))
const NotificationRules = lazy(() => import('./pages/notification/NotificationRulesPage'))
const WorkLogs = lazy(() => import('./pages/workbench/WorkLogsPage'))
const MyDemands = lazy(() => import('./pages/workbench/MyDemandsPage'))
const MyPendingBugs = lazy(() => import('./pages/workbench/MyPendingBugsPage'))
const MyAssignedItems = lazy(() => import('./pages/workbench/MyAssignedItemsPage'))
const WorkLogHistory = lazy(() => import('./pages/workbench/WorkLogHistoryPage'))
const MorningStandupBoard = lazy(() => import('./pages/workbench/MorningStandupPage'))
const OwnerWorkbench = lazy(() => import('./pages/workbench/OwnerWorkbenchPage'))
const PersonalSettings = lazy(() => import('./pages/workbench/PersonalSettingsPage'))
const RolePermissions = lazy(() => import('./pages/system/RolePermissionsPage'))
const MenuVisibility = lazy(() => import('./pages/system/MenuVisibilityPage'))
const ArchiveDemands = lazy(() => import('./pages/project/ArchiveDemandsPage'))
const DictCenter = lazy(() => import('./pages/system/DictCenterPage'))
const FeishuContacts = lazy(() => import('./pages/integration/FeishuContactsPage'))
const FeishuUserBindings = lazy(() => import('./pages/integration/FeishuUserBindingsPage'))
const BugList = lazy(() => import('./pages/bug/BugListPage'))
const BugDetail = lazy(() => import('./pages/bug/BugDetailPage'))
const BugWorkflowConfig = lazy(() => import('./pages/bug/BugWorkflowConfigPage'))
const FeedbackList = lazy(() => import('./pages/feedback/FeedbackListPage'))
const FeedbackDashboard = lazy(() => import('./pages/feedback/FeedbackDashboardPage'))
const FeedbackAIPromptConfig = lazy(() => import('./pages/feedback/AIPromptConfigPage'))
const Login = lazy(() => import('./pages/auth/LoginPage'))
const Register = lazy(() => import('./pages/auth/RegisterPage'))

const PAGE_COMPONENTS = {
  departments: Departments,
  agentConfig: AgentConfig,
  dictCenter: DictCenter,
  feishuContacts: FeishuContacts,
  feishuUserBindings: FeishuUserBindings,
  login: Login,
  menuVisibility: MenuVisibility,
  archiveDemands: ArchiveDemands,
  bugList: BugList,
  bugDetail: BugDetail,
  bugWorkflowConfig: BugWorkflowConfig,
  feedbackList: FeedbackList,
  feedbackDashboard: FeedbackDashboard,
  feedbackAIPromptConfig: FeedbackAIPromptConfig,
  morningStandupBoard: MorningStandupBoard,
  options: Options,
  ownerWorkbench: OwnerWorkbench,
  personalSettings: PersonalSettings,
  demandInsightBoard: DemandInsightBoard,
  efficiencyFactorSettings: EfficiencyFactorSettings,
  departmentEfficiencyRanking: DepartmentEfficiencyRanking,
  departmentEfficiencyDetail: DepartmentEfficiencyDetail,
  memberRhythmBoard: MemberRhythmBoard,
  memberEfficiencyDetail: MemberEfficiencyDetail,
  projectTemplates: ProjectTemplates,
  projectTemplateDetail: ProjectTemplateDetail,
  humanGantt: HumanGantt,
  notificationConfig: NotificationConfig,
  notificationRules: NotificationRules,
  launchPlan: LaunchPlan,
  register: Register,
  rolePermissions: RolePermissions,
  workDemands: WorkDemands,
  workLogs: WorkLogs,
  myDemands: MyDemands,
  myPendingBugs: MyPendingBugs,
  myAssignedItems: MyAssignedItems,
  workLogHistory: WorkLogHistory,
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

function getCurrentPathWithQuery() {
  if (typeof window === 'undefined') return '/'
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function getNotificationTicketFromUrl() {
  if (typeof window === 'undefined') return ''
  const search = new URLSearchParams(window.location.search || '')
  return String(search.get('nt') || '').trim()
}

function stripNotificationTicketFromCurrentUrl() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has('nt')) return
  url.searchParams.delete('nt')
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState({}, '', next)
}

function NotificationAutoLoginGate({ children }) {
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let active = true

    const run = async () => {
      const ticket = getNotificationTicketFromUrl()
      if (!ticket) {
        if (active) setStatus('failed')
        return
      }

      try {
        const loginResult = await notificationLoginApi(ticket)
        if (!loginResult?.success) {
          throw new Error(loginResult?.message || '通知免登失败')
        }

        const token = loginResult?.data?.token || ''
        const user = loginResult?.data?.user || null
        if (!token || !user) {
          throw new Error('通知免登返回数据异常')
        }

        setAuthStorage({
          token,
          user,
          remember: true,
        })

        const userId = Number(user?.id) > 0 ? Number(user.id) : null
        const [accessTask, menuTask, preferenceTask] = await Promise.allSettled([
          getAccessApi(),
          getMyMenuVisibilityApi(),
          getPreferencesApi(),
        ])

        let accessSnapshot = null
        if (accessTask.status === 'fulfilled' && accessTask.value?.success) {
          accessSnapshot = accessTask.value.data
        }
        setAuthStorage({ access: accessSnapshot })

        let menuAccessMap = {}
        if (menuTask.status === 'fulfilled' && menuTask.value?.success) {
          menuAccessMap = menuTask.value?.data?.menu_access_map || {}
        }
        setMenuVisibilityAccessMap(menuAccessMap, { user_id: userId })

        if (preferenceTask.status === 'fulfilled' && preferenceTask.value?.success) {
          setUserPreferences(preferenceTask.value.data || {})
        }

        stripNotificationTicketFromCurrentUrl()
        if (active) setStatus('success')
      } catch (error) {
        console.warn('通知免登失败:', error?.message || error)
        if (!active) return
        setStatus('failed')
      }
    }

    run()
    return () => {
      active = false
    }
  }, [])

  if (status === 'success') return children
  if (status === 'loading') return <PageFallback />

  const redirect = getCurrentPathWithQuery()
  return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />
}

function RequireAuth({ children }) {
  if (!getToken()) {
    if (getNotificationTicketFromUrl()) {
      return <NotificationAutoLoginGate>{children}</NotificationAutoLoginGate>
    }
    const redirect = getCurrentPathWithQuery()
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />
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
