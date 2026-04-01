import { PRIVATE_ROUTES } from './route.config'

const SECTION_META = {
  main: { key: 'main' },
  workbench: { key: 'workbench', label: '个人工作台', icon: 'dashboard' },
  project: { key: 'project', label: '项目管理', icon: 'tool' },
  personal: { key: 'personal', label: '个人设置', icon: 'setting' },
  efficiency: { key: 'efficiency', label: '效能总览', icon: 'dashboard' },
  system: { key: 'system', label: '系统设置', icon: 'setting' },
}

const SECTION_ORDER = ['workbench', 'main', 'project', 'efficiency', 'system', 'personal']

function buildMenuSectionsFromRoutes() {
  const sectionMap = {}

  PRIVATE_ROUTES.forEach((route) => {
    if (!route.menu) return

    const sectionKey = route.menu.section || 'main'
    if (!sectionMap[sectionKey]) {
      sectionMap[sectionKey] = {
        ...(SECTION_META[sectionKey] || { key: sectionKey }),
        items: [],
      }
    }

    sectionMap[sectionKey].items.push({
      key: route.path,
      label: route.menu.label,
      icon: route.menu.icon,
      route,
    })
  })

  const orderedSections = []

  SECTION_ORDER.forEach((key) => {
    if (sectionMap[key] && sectionMap[key].items.length > 0) {
      orderedSections.push(sectionMap[key])
    }
  })

  Object.keys(sectionMap).forEach((key) => {
    if (SECTION_ORDER.includes(key)) return
    if (sectionMap[key].items.length === 0) return
    orderedSections.push(sectionMap[key])
  })

  return orderedSections
}

export const MENU_SECTIONS = buildMenuSectionsFromRoutes()
