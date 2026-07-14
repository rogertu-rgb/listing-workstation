# Listing Workstation

增长潜力品推荐网页的独立服务器版本。浏览器直接调用本服务，本服务再调用 DataSuite API；不再依赖 Google Apps Script、Google Sheet 队列或 Python Bridge。

## 架构

```text
Browser
  ├─ GET  /api/initial-data
  └─ POST /api/growth-recommendation
             │
             ▼
       Node.js API service
             │ OAuth + async job polling + result shards
             ▼
         DataSuite API
```

服务启动后会读取本地卖家缓存，并在后台请求一次全量数据。之后每 24 小时重新请求 DataSuite，从返回行中提取唯一卖家并原子更新 `/app/data/sellers.json`。即使刷新失败，服务也会保留上一次成功的列表。

默认用空的 `request_param_1` 获取全量卖家。如果 DataSuite 对全量查询使用其他参数，可通过 `SELLER_REFRESH_QUERY_VALUE` 调整。

## API

- `GET /api/health`：容器健康检查和配置状态。
- `GET /api/initial-data`：卖家列表、刷新时间和集成状态。
- `POST /api/growth-recommendation`：请求体为 `{"sellerName":"..."}`，直接查询 DataSuite 并返回页面数据。
- `POST /api/admin/refresh-sellers`：使用 `Authorization: Bearer <ADMIN_TOKEN>` 手动刷新卖家缓存。

## 凭证管理

仓库和镜像均不包含密钥。复制环境变量模板并在目标服务器填写：

```sh
cp .env.example .env
chmod 600 .env
```

必须设置：

- `DATASUITE_APP_KEY`
- `DATASUITE_APP_SECRET`
- `DATASUITE_END_USER`
- `ADMIN_TOKEN`

可选设置 `LLM_API_KEY`。配置后前几个 zone 和卖家总览会调用兼容 OpenAI Chat Completions 的模型；模型调用失败时保留确定性总结，不会使整个查询失败。

`.env` 已被 `.gitignore` 和 `.dockerignore` 排除。不要把密钥写进 Dockerfile、Compose 文件或 Git URL。

## 本地运行

需要 Node.js 20 或更高版本：

```sh
npm test
npm start
```

打开 `http://localhost:8080`，健康检查为 `http://localhost:8080/api/health`。

## Docker 部署

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 listing-workstation
curl -fsS http://127.0.0.1:8080/api/health
```

Compose 将宿主机 `8080` 映射到容器 `8080`，并使用命名卷持久化每日卖家缓存。容器设置为 `restart: unless-stopped`，服务器重启后会自动恢复。

## 上线验证

1. `docker compose ps` 显示容器为 `healthy`。
2. `/api/health` 的 `dataSuiteConfigured` 为 `true`。
3. `/api/initial-data` 返回卖家数组和 `updatedAt`。
4. 选择一个卖家生成推荐，确认 `meta.data_mode` 为 `direct_datasuite_api`。
5. 检查日志中没有 OAuth、job、shard 或 LLM 错误。

## 安全说明

- 服务只向前端返回经过处理的错误，不返回 OAuth token、App Secret 或 LLM key。
- 请求体限制为 64 KiB，卖家名限制为 300 字符。
- 手动刷新接口必须使用独立的 `ADMIN_TOKEN`。
- 生产环境建议由平台反向代理提供 HTTPS、公司登录鉴权和访问控制；不要直接把 8080 暴露到公网。
