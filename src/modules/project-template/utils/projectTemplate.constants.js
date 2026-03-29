export const TEMPLATE_NODE_TYPE_OPTIONS = [
  { label: '评审', value: 'REVIEW' },
  { label: '方案', value: 'DESIGN' },
  { label: '执行', value: 'EXECUTE' },
  { label: '测试', value: 'QA' },
  { label: '发布', value: 'RELEASE' },
  { label: '里程碑', value: 'MILESTONE' },
  { label: '并行开始', value: 'PARALLEL_SPLIT' },
  { label: '并行汇合', value: 'PARALLEL_JOIN' },
]

export const TEMPLATE_PHASE_OPTIONS = [
  { label: '需求', value: 'requirement' },
  { label: '规划', value: 'plan' },
  { label: '方案', value: 'design' },
  { label: '开发', value: 'develop' },
  { label: '测试', value: 'test' },
  { label: '发布', value: 'release' },
  { label: '运营', value: 'operate' },
]

export const TEMPLATE_GRAPH_STATUS = {
  DRAFT: 'DRAFT',
}

export const TEMPLATE_JOIN_RULE_OPTIONS = [
  { label: '全部分支完成后汇合', value: 'ALL' },
]
