# 通知配置中心前端联调与回归指南

## 目标

用于“系统设置-通知配置”主入口页面（`/notification-config`）的前端本地联调、mock/real 切换与功能/权限回归执行。

## 页面入口与权限

- 主入口：`系统设置 -> 通知配置`
- 路由：`/notification-config`
- 读权限：`notification.config.view`
- 管理权限：`notification.config.manage`

无 `notification.config.view` 时页面显示无权限态；仅有 `notification.config.view` 时页面可查看不可改。

## 状态管理实现

- 数据层：`React Query`
- UI 状态机：`Zustand`
- Store：`src/store/notificationConfigStore.js`
- 页面：`src/pages/project/NotificationConfigPage.jsx`

状态机包含：

- 全局状态：`BOOTSTRAP_LOADING / READY / EMPTY_RULES / NO_PERMISSION / LOAD_ERROR`
- 编辑弹窗状态：`CLOSED / OPEN_EDIT / VALIDATING / SAVING / SAVE_ERROR`
- 审计抽屉状态：`CLOSED / LOADING / READY / EMPTY / ERROR`

## mock 与真实接口切换

通知配置中心 API 支持通过环境变量切换数据源：

- `VITE_NOTIFICATION_API_MODE=mock`：使用本地 mock（`src/mocks/notificationConfig.mock.js`）
- `VITE_NOTIFICATION_API_MODE=real`：请求后端真实接口

推荐流程：先 mock 验证页面交互，再切真实接口联调。

### 常用命令

```bash
# mock 本地联调
npm run dev:notification:mock

# 真实接口联调（需 .env 配置 API 基地址）
npm run dev:notification:real

# 常规构建检查
npm run build
```

## 真实接口联调环境变量

最少需要：

- `VITE_API_BASE_URL`：后端 API 基地址（如 `http://127.0.0.1:3000/api`）
- `VITE_NOTIFICATION_API_MODE=real`

可选：

- `VITE_BIZ_LINE_ID`：默认业务线（若后端按 header 或 token 解析业务线，可不配置）

## 回归脚本（功能 + 权限）

脚本文件：`scripts/api-regression-notification-center.js`

用途：

- 功能回归：模板、规则、审计、指标查询
- 权限回归：普通用户修改规则预期 403
- 可选写操作：语义事件触发（`--write`）

### 运行方式

```bash
# 仅读接口回归
NOTIFY_REGRESSION_ADMIN_TOKEN=<admin-token> npm run regression:notification

# 包含写操作（触发语义事件）
NOTIFY_REGRESSION_ADMIN_TOKEN=<admin-token> npm run regression:notification:write

# 同时做权限用例（普通用户 token）
NOTIFY_REGRESSION_ADMIN_TOKEN=<admin-token> \
NOTIFY_REGRESSION_USER_TOKEN=<user-token> \
npm run regression:notification
```

可覆盖参数：

- `NOTIFY_REGRESSION_BASE_URL`（默认 `http://127.0.0.1:3000/api`）
- `NOTIFY_REGRESSION_BIZ_DOMAIN`（默认 `project_management`）
- `NOTIFY_REGRESSION_BIZ_LINE_ID`（默认 `1`）
- `NOTIFY_REGRESSION_TIMEOUT_MS`（默认 `12000`）

安全保护（默认开启）：

- 回归脚本默认只允许请求 `127.0.0.1/localhost`
- 如必须连接非本地环境，需显式设置 `NOTIFY_REGRESSION_ALLOW_NON_LOCAL=1`

## 与后端契约对齐

后端接口契约与测试矩阵见：

- `beixinstore-backend/docs/project-management/notification-center-api-contract.md`
- `beixinstore-backend/docs/project-management/notification-center-test-cases.md`

联调时请优先以以上契约为准。
