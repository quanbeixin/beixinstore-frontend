# 管理后台前端项目

基于 React + TypeScript + Vite + Ant Design 的管理后台骨架。

## 架构文档（统一维护）

- 全系统整合架构文档位于后端仓库：`/Users/baopengfei/JS/beixinstore-backend/docs/system-architecture.md`
- 要求：凡是涉及前端路由、权限、接口对接、workflow 交互变更，必须同步更新该文档。

## 技术栈

- React 18
- TypeScript
- Vite
- Ant Design
- React Router v6

## 项目结构

```
src/
├── components/          # 通用组件
│   ├── Header.tsx      # 顶部导航栏
│   └── Sidebar.tsx     # 侧边栏菜单
├── pages/              # 页面
│   └── Dashboard.tsx   # 仪表盘页面
├── App.tsx             # 主应用组件
├── App.css             # 应用样式
├── main.tsx            # 入口文件
└── index.css           # 全局样式
```

## 启动项目

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 功能说明

- 响应式布局
- 左侧菜单导航
- 顶部标题栏和用户头像
- Dashboard 页面包含三张占位卡片
- 浅色主题
- 完全静态，无业务逻辑和 API 调用

## 开发说明

这是一个前端骨架项目，仅包含基础布局和占位页面。可以在此基础上添加：

- 更多页面路由
- 业务组件
- API 集成
- 状态管理
- 权限控制等功能
