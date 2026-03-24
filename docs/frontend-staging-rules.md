# 前端 Staging 联调规范

## 文档目标

本文档用于说明前端项目在本地 `staging` 模式下的统一联调规则，包括环境变量、启动方式、代理规则和联调边界，不记录单次搭建过程。

## 一、适用范围

本文档适用于以下场景：

- 本机以 `staging` 方式运行前端
- 通过 Vite 代理联调后端 `staging`
- 发布前进行本地联调和回归验证

## 二、当前项目约定

- 技术栈：Vite + React
- 本地默认访问地址：`http://localhost:5173`
- 后端 `staging` 地址：`http://localhost:3001`
- API 基地址环境变量：`VITE_API_BASE_URL`
- 本地代理目标环境变量：`VITE_DEV_PROXY_TARGET`

## 三、环境变量规则

前端 `staging` 环境统一通过 `.env.staging` 管理。

推荐最小配置如下：

```env
VITE_API_BASE_URL=/api
VITE_APP_TITLE=Admin Dashboard Staging
VITE_DEV_PROXY_TARGET=http://localhost:3001
```

规则如下：

- `VITE_API_BASE_URL` 优先使用相对路径 `/api`
- 本地开发请求统一通过 Vite 代理转发
- `VITE_DEV_PROXY_TARGET` 必须指向后端 `staging`
- 前端本地调试不得直接指向正式后端

## 四、启动规则

前端本地 `staging` 联调统一使用：

```powershell
npm run dev:staging
```

如需生成 `staging` 构建结果，统一使用：

```powershell
npm run build:staging
```

## 五、联调规则

联调时建议按以下顺序检查：

1. 后端 `staging` 是否已启动
2. 前端是否以 `dev:staging` 启动
3. 浏览器请求路径是否仍为 `/api/...`
4. Vite 代理是否指向 `http://localhost:3001`
5. 后端 `CLIENT_ORIGIN` 是否包含 `http://localhost:5173`

## 六、代理与跨域规则

- 本地联调优先依赖 Vite 代理，而不是直接把前端请求地址写死为完整域名
- 后端跨域白名单必须与前端本地访问地址一致
- 如出现接口 404，优先检查代理目标和请求前缀
- 如出现登录失败或跨域异常，优先检查后端 `CLIENT_ORIGIN`

## 七、团队协作规则

- 前端本地联调默认走 `staging`
- 不将本地调试直接连接正式后端
- 与后端约定的环境变量键名和代理路径保持稳定
- 出现环境问题时，优先修正规则和配置，不记录一次性操作流水

## 八、关联文档

- 后端环境规范：[environment-staging-production.md](d:/Project/beixinstore-backend/docs/environment-staging-production.md)
- 后端 Staging 规则：[staging-rules.md](d:/Project/beixinstore-backend/docs/staging-rules.md)
