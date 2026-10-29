# 项目状态（半成品快照）

- 仓库：<https://github.com/jiaxiangli477-stack/packrivo-social-workbench>
- 本文件上次改写：2026-10-29（归档复核）。原作者记录时间：2026-10-27。
- 复核环境：Windows，Node v24.21.0，仓库工作副本 `social-workbench/`。
- 状态口径（本文严格区分这三类，不混写）：
  - ✅ **本次可复现**：2026-10-29 归档复核时用命令跑出来、输出贴在下文。
  - 📋 **作者本地实测**：2026-10-25～27 作者在自己机器上的记录；归档复核环境没有对应账号/服务，无法复现，只保留原记录。
  - 🚧 **代码层面未实现/未联调**：能指到具体文件行号，不是"待完善"这种空话。

## 一、本次归档复核跑了什么（✅ 可复现）

| 检查 | 命令 | 结果 |
|---|---|---|
| Postiz 适配器契约自测 | `node ops/postiz-selftest.mjs` | **21/21 通过**（自起契约桩 8798 + 被测服务 8797 + 独立 `data/selftest`，不碰线上库） |
| 冷启动（空数据目录） | `SWB_DATA=<空目录> SWB_PORT=8899 node app/server.mjs` | 自动建库、生成 DPAPI 主密钥；`GET /api/health` → `200 {"ok":true,"version":"0.1.0"}` |
| 暖启动接口连通 | 同上（复用已建库） | `/api/health`、`/api/settings`、`/api/accounts`、`/api/products`、`/api/models`、`/api/overview`、`/` 全部 **200** |
| 静态页资源路径 | `GET /` | `index.html` 引用 `/style.css`、`/app.js`，均由 `web/` 目录提供 |
| 缺依赖时的启动行为 | 拷贝 `app/` 到无 `node_modules` 目录后 `import('./app/channels.mjs')` / `import('./app/browser.mjs')` | 均 `ERR_MODULE_NOT_FOUND`（sharp / playwright-core），证实两者是**必需**依赖 |
| 跟踪文件清单 | `git ls-files` | 346 个文件；无 `data/`、`node_modules/`、`tools/`、`master.key*`、`*.db`、`*.log` |
| 远端快照 | `git ls-remote --heads origin` | `refs/heads/main = 0b3cf3f`（本次修正前的提交，远端已有 README 的 WIP 标注与 `docs/STATUS.md`） |

> 冷启动时出现过一次进程在约 7.8 秒处崩溃：`FATAL ERROR: SegmentedTable::AllocateAndInitializeSegment Allocation failed - process out of memory`，当时本机可用物理内存 1.9 GB、系统提交 43.2 GB / 上限 49 GB。同一份代码暖启动与自测均正常，判断为**复核环境的虚拟内存压力**，不是代码路径异常；换内存正常的机器应无此现象。

## 二、能跑通的主链路

链路：`情报雷达 → 爆款入库 → 结构拆解 → AI 一稿多平台 → AI 预审 + 人工闸门 → 排期 → 发布回执 → 指标回收`

| 环节 | 状态 | 依据 |
|---|---|---|
| Postiz 适配器（public API v1 契约） | ✅ 本次复现 | 契约桩 21 项断言全过：Base 归一化 / Key 加密只回 hint / 通道匹配 / now·schedule·draft / 缺素材拦截 / 401 / 不可达 |
| 服务启动、建库、静态页、健康检查 | ✅ 本次复现 | 见第一节 |
| 文章类/接口类工具链骨架（86 条 `/api/*` 路由） | ✅ 本次复现 | `app/server.mjs` 中 86 个 `on(method, pattern, fn)` 注册；健康检查与 6 个只读接口实测 200 |
| 凭据加密（DPAPI 包主密钥 + AES-256-GCM 列级加密） | ✅ 本次复现 | 自测中 Key 入库后只回 `…-123`；`app/crypto.mjs` 实现 |
| 模型网关接入（OpenAI 兼容，任务→模型映射，主备降级） | 📋 作者记录 | 本机网关 `127.0.0.1:8787/v1`，87 个模型可选；`deconstruct/rewrite/review` 分别调用成功 |
| 爆款结构拆解 / 一稿多平台 / AI 预审 + 敏感项闸门 | 📋 作者记录 | 一条 TikTok 参考帖 → hook/pain/proof/cta/format；FB/IG/TikTok 三版英文稿；含 `$0.89 / 20% off / FSC / WhatsApp` 的稿 AI 92 分仍被闸门转人工 |
| 排期 + 发布 + 回执（mock 通道） | 📋 作者记录 | `publish_result` 记录 `mock-*`，状态 `published` |
| 情报雷达（YouTube / Mastodon / Lemmy / Bluesky / News / 同行站点） | 📋 作者记录 | 2026-10-25 实测 27 条目 + 50 关键词 → 19 keep / 8 drop，逐条给理由 |
| 知识库注入（品牌/产品/客户/语气/术语/禁用/案例） | 📋 作者记录 | 加入「克重写 gsm、MOQ 用 pcs」后新稿自动写 `300 gsm`、`MOQ 500 pcs` |

## 三、未实现 / 未联调（🚧 逐条可核）

| 缺口 | 代码现状（位置） | 现在的行为 |
|---|---|---|
| 平台官方 API | `app/channels.mjs:231-238`：`official` 通道直接 `throw new PublishError('pending_integration', …)`，无任何平台实现 | Meta / TikTok / Pinterest / YouTube / Threads / LinkedIn / X / Alibaba / WhatsApp 等一律 `pending_integration`，排期标 `blocked` |
| 浏览器会话发布 | `app/browser.mjs` 只导出 `closeBrowser / warmupAlibaba / amazonSearch / alibabaSearch / scrapeProducts`（第 26/46/69/112/162 行），没有登录态发布；`app/server.mjs:223` 原文「等浏览器会话模块」 | Facebook 群组 / Reddit / Warrior Forum（平台目录标 `pending_session`）无法发布 |
| Postiz 素材上传 | `app/postiz.mjs:45` 与 `:302` 两处注释明说没接 `/public/v1/upload`，文件内无 upload 函数 | 无图/无视频的 IG / TikTok / Pinterest / YouTube 判 `pending_media` → `blocked`，写明原因不假装成功 |
| Postiz 指标回拉 | `app/postiz.mjs` 内无 metrics/analytics 相关函数；自动回收只有 Bluesky（`app/server.mjs:1574` `/api/metrics/sync-bsky`，30 分钟一次，第 1951 行定时器） | 其余平台指标靠人工按天回填 |
| GA4 引流数据 | 全仓库无 GA4 调用代码（只在需求文档里出现） | 指标手工回收 |
| 邮件 EDM | 平台目录写「SMTP 配置后可用」（`app/db.mjs:405`），但 `app/channels.mjs` 的通道表里没有 smtp/email 实现 | 账号平台选 email 会落到 `official` → `pending_integration`，与目录描述不一致 |
| Apify 自动采集 | `app/sources.mjs:195` 有 `searchApify()`，且已接进 `discover()`（第 259 行） | 无 Token/Actor 时抛「Apify 未配置」；**未对真实 Apify API 联调** |
| 视频生成 | `app/server.mjs:758` `/api/video/generate` 只在模型接入里存在「用途=视频」的接口时才发请求 | 未配置返回 `pending_config` |
| 图片生成 | `app/comfy.mjs`：ComfyUI `127.0.0.1:8188`、本地 SD 服务 `127.0.0.1:8189`，或设置里的外部图像 API | 三个都不在时图片批处理不可用 |
| 模型网关 | 默认 `http://127.0.0.1:8787/v1`，仓库不含该服务 | 未配置时 AI 环节全部不可用 |
| yt-dlp 精确播放量 | `app/sources.mjs:9,15`：`tools/yt-dlp.exe` 不存在时 `youtubeExtractor()` 返回 `html` | 自动回落 HTML 抓取，无需额外配置（17.1 MB 二进制不随仓库分发） |
| 多用户 / 权限 | 无用户表、无登录，HTTP 接口无入站鉴权（全仓库只有出站 `authorization` 头） | 单机单用户；默认只绑 `127.0.0.1`（`app/server.mjs:17-18`） |
| 调度开关的 UI | `app/db.mjs:366` 默认 `worker_enabled=1`；除 `app/queue.mjs:133` 外无其它引用 | 开关只能改设置值，页面上没有入口 |

## 四、文档与实现不一致（⚠️ 本次已改）

| 位置 | 原表述 | 实际 |
|---|---|---|
| README 快速开始 | `playwright-core`、`sharp` 列为「可选依赖」 | 两者都是模块顶层静态 import（`app/browser.mjs:1`、`app/channels.mjs:3`），**不装服务起不来**；已在 README 改为「必须先 `npm i`」 |
| README 目录说明 | `queue.mjs 令牌桶限速 + 退避重试 + 熔断冷却` | 实际是最小间隔 + 日配额 + 失败冷却（`app/queue.mjs:6-42`）；重试是 60s×attempts 线性、最多 3 次（`:4,:119-128`），不是令牌桶/指数退避 |
| README 文档表 | 未列 `docs/07-固定工作流.md`、`docs/09-项目链路.html` | 已补 |
| `.gitignore` | 未覆盖 Python 字节码、`.env`、证书类密钥 | `service/__pycache__/sd_server.cpython-311.pyc` 曾被跟踪；本次取消跟踪并补规则 |
| 三个文件含本机用户名路径 | `docs/01-需求基线.md:101`、`docs/_需求docx.txt:15`、`ops/extract-docx.py:2` 里出现带真实 Windows 用户名的绝对路径 | 已脱敏为 `C:\Users\<user>\…` |

## 五、安全与发布注意（🔒）

- **无入站鉴权**：HTTP API 没有登录/令牌，任何本机进程都能改配置、建账号、触发发布。默认 `SWB_HOST=127.0.0.1` 时影响可控；**不要**随手设成 `0.0.0.0` 暴露到局域网/公网。
- **DPAPI 只适用 Windows**：`app/crypto.mjs:10-23` 通过 `powershell.exe` 调 `ProtectedData`；失败时退化为 `plain:` 明文主密钥（`:42-46`），启动日志会打印警告（`SWB_CRYPTO_WEAK=1`）。
- **`data/` 是整套凭据与登录态**：`workbench.db`（业务数据）、`master.key.dpapi`（解开加密列）、`browser-profile/`（60.8 MB）、`edge-cdp/`（740 MB，含 cookie/token）、`media/`（27.2 MB 客户素材）。整个目录已在 `.gitignore` 中排除，切勿手工 `git add -f`。
- **`tools/` 与 `node_modules/`**：`yt-dlp.exe` 17.1 MB、依赖 33 MB，均已排除；`deploy/data/` 同样排除。
- 仓库目前**没有开源许可证**，按 README 说明默认保留所有权利；要复用需先开 Issue。

## 六、已知的坑（保留原记录 + 本次补充）

- 思考型模型会把推理塞进正文并挤掉 JSON，`max_tokens` 要给到 1600–2600；答案常落在 `reasoning_content`，代码已做兜底取用。（📋 作者记录）
- 完整雷达刷新（20 个竞品站点 + 两轮 kimi 审）约 4–5 分钟，尚未拆成「快刷新 / 深审」两个按钮。（📋 作者记录）
- Pinterest / Pixelfed / Tumblr 没有可用公开搜索接口，已排除，不硬凑。（📋 作者记录）
- `data/master.key.dpapi` 绑定当前 Windows 用户，换机器要重新录入全部凭据。（✅ 代码可核：DPAPI CurrentUser 作用域）
- 每次加解密都起一个 `powershell.exe` 子进程（`app/crypto.mjs:10-15`），凭据多时首次加载会明显变慢。（✅ 本次读码）
- 低内存机器冷启动可能触发 V8 原生 OOM（本次复核环境复现一次），与业务代码无关；内存吃紧时先关掉 `edge-cdp` 浏览器再启动。（✅ 本次实测）

## 七、下一步优先级

1. 起一台 Postiz（Docker 主机或 VPS），把发布中心从 mock 切到真发，用真实 integration 跑一遍 now/schedule/draft。
2. 接 Postiz `POST /public/v1/upload`，打通带图/带视频的 IG / TikTok / Pinterest 发布（当前一律 `pending_media`）。
3. 补邮件 EDM 通道（SMTP/Listmonk），让平台目录里的 `email` 名实相符。
4. 接 GA4 只读授权与 Postiz 指标回拉，把指标回收自动化。
5. 雷达刷新拆快慢两档，把 4–5 分钟压到 40 秒可用。
6. 官方 API 适配器按平台拆分（先 Meta Graph，再 TikTok Content Posting），前提是拿到开发者资质与 App 审核。

## 八、本次归档改动清单

- `README.md`：标题补「· 半成品（WIP）」；依赖表改为必需并写清失败方式；修正限速/重试描述；补 07/09 文档链接。
- `.gitignore`：新增 `__pycache__/`、`*.py[cod]`、`.env`、`.env.*`、`*.pem`、`*.key`、`*.p12`、`*.pfx`、`*.db.bak`、`data.bak/`。
- 取消跟踪：`service/__pycache__/sd_server.cpython-311.pyc`（构建产物，运行 `sd_server.py` 会重新生成）。
- 脱敏：`docs/01-需求基线.md`、`docs/_需求docx.txt`、`ops/extract-docx.py` 中的本机用户名路径。
- 本文件按「本次可复现 / 作者历史记录 / 代码确认未实现」三类重写，去掉无依据的表述。
