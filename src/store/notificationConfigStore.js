import { create } from 'zustand'

export const GLOBAL_STATES = Object.freeze({
  BOOTSTRAP_LOADING: 'BOOTSTRAP_LOADING',
  READY: 'READY',
  EMPTY_RULES: 'EMPTY_RULES',
  NO_PERMISSION: 'NO_PERMISSION',
  LOAD_ERROR: 'LOAD_ERROR',
})

export const MODAL_STATES = Object.freeze({
  CLOSED: 'MODAL_CLOSED',
  OPEN_EDIT: 'MODAL_OPEN_EDIT',
  VALIDATING: 'MODAL_VALIDATING',
  SAVING: 'MODAL_SAVING',
  SAVE_ERROR: 'MODAL_SAVE_ERROR',
})

export const AUDIT_STATES = Object.freeze({
  CLOSED: 'AUDIT_CLOSED',
  LOADING: 'AUDIT_LOADING',
  READY: 'AUDIT_READY',
  EMPTY: 'AUDIT_EMPTY',
  ERROR: 'AUDIT_ERROR',
})

export const useNotificationConfigStore = create((set) => ({
  bizDomain: 'project_management',
  globalState: GLOBAL_STATES.BOOTSTRAP_LOADING,
  modalState: MODAL_STATES.CLOSED,
  auditState: AUDIT_STATES.CLOSED,
  metricDays: 7,
  selectedRuleId: null,
  editingRule: null,
  auditRows: [],
  auditTotal: 0,
  errorMessage: '',

  setBizDomain: (bizDomain) => set({ bizDomain }),
  setGlobalState: (globalState) => set({ globalState }),
  setModalState: (modalState) => set({ modalState }),
  setAuditState: (auditState) => set({ auditState }),
  setMetricDays: (metricDays) => set({ metricDays }),
  setSelectedRuleId: (selectedRuleId) => set({ selectedRuleId }),
  setEditingRule: (editingRule) => set({ editingRule }),
  setAuditData: ({ rows = [], total = 0 } = {}) =>
    set({
      auditRows: rows,
      auditTotal: total,
    }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),

  openEditModal: (rule) =>
    set({
      editingRule: rule,
      modalState: MODAL_STATES.OPEN_EDIT,
    }),
  closeEditModal: () =>
    set({
      editingRule: null,
      modalState: MODAL_STATES.CLOSED,
    }),
  openAuditDrawer: (ruleId) =>
    set({
      selectedRuleId: ruleId,
      auditState: AUDIT_STATES.LOADING,
    }),
  closeAuditDrawer: () =>
    set({
      selectedRuleId: null,
      auditRows: [],
      auditTotal: 0,
      auditState: AUDIT_STATES.CLOSED,
    }),
}))
