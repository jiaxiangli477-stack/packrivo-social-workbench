# 项目状态（半成品快照）

记录时间：2026-10-27。本文件是「哪块真跑过、哪块还是空的」的台账，随实现更新。
判据：标 ✅ 的都有本机实测记录（接口返回、截图或自测脚本输出）；标 🚧/❌ 的写明缺的具体东西，不写「待完善」。

## 一、能跑通的主链路

`情报雷达 → 爆款入库 → 结构拆解 → 一稿多平台 → AI 预审 + 人工闸门 → 排期 → 发布回执 → 指标回收`

| 环节 | 状态 | 证据 |
|---|---|---|
| 模型网关接入（OpenAI 兼容，任务→模型映射，主备降级） | ✅ | 本机网关 `127.0.0.1:8787/v1`，87 个模型可选；`deconstruct/rewrite/review` 三个任务分别调用成功 |
| 爆款结构拆解 | ✅ | 一条 TikTok 参考帖 → hook/pain/proof/cta/format + 6 段结构 + 可复用结论 |
| 一稿多平台（FB 主页 / IG / TikTok 三版） | ✅ | 英文生成，实测与原文相似度 0–0.4% |
| AI 预审 + 敏感项强制人工 | ✅ | IG 版 95 分 approve；含 `$0.89 / 20% off / FSC / WhatsApp` 的稿子 AI 92 分仍被闸门拦下转人工（content #8） |
| 排期 + 发布 + 回执（mock 通道） | ✅ | 发布成功，`publish_result` 记录 `mock-mvo02j3o`，状态 `published` |
| 凭据加密 | ✅ | DPAPI 包裹主密钥 + AES-256-GCM 列级加密，页面只回显 key 后 4 位 |
| 情报雷达（视频/帖子/文章/关键词/同行站点） | ✅ | YouTube(yt-dlp) + Mastodon + Lemmy + Bluesky + Google News RSS；缩略图走本地代理并挡内网地址 |
| kimi 质检（每条雷达条打分/丢弃理由） | ✅ | 2026-10-25 实测 27 条目 + 50 关键词 → 19 keep / 8 drop，逐条给理由 |
| 知识库注入（品牌/产品/客户/语气/术语/禁用/案例） | ✅ | 加入「克重写 gsm、MOQ 用 pcs」后新稿自动写成 `300 gsm`、`MOQ 500 pcs` |
| Postiz 适配器（按 public API v1 官方 OpenAPI 契约） | ✅ | `ops/postiz-selftest.mjs` 用本机契约桩跑 21 项断言全过（Base 归一化 / Key 加密 / 通道匹配 / now·schedule·draft / 缺素材拦截 / 401 / 不可达） |
| 数据看板（按天回填指标、趋势、平台对比、帖子排行） | ✅ | 表结构与回收表单已通；示例数据带 demo 标记可一键清除 |

## 二、卡在外部的（不是代码没写，是缺服务或资质）

| 缺口 | 缺的具体东西 | 现在的行为 |
|---|---|---|
| Postiz 真发 | 一台跑起来的 Postiz 实例（本机无 Docker / WSL / 管理员） | 适配器完整，填 Base URL + API Key 即可切真发；未填时通道状态如实显示未配置 |
| 素材上传 | Postiz `POST /public/v1/upload` 未接 | IG / TikTok / Pinterest / YouTube 无媒体时判 `pending_media` 并 `blocked`，写明原因，不假装成功 |
| 官方平台 API | Meta / TikTok / Pinterest / YouTube 开发者账号 + App 审核 + 商业验证 + HTTPS 回调域名 | 通道返回 `pending_integration`，排期标 `blocked` |
| Apify 自动采集爆款 | Apify Token + 采集任务 ID | 目前手工粘贴链接入库 |
| GA4 引流数据 | GA4 Data API 授权 | 指标手工回收 |
| 视频生成 | 视频模型接口与预算 | `POST /api/video/generate` 已通，未配置时返回 `pending_config` |
| 多用户 / 权限 | — | 单机单用户，一期不做 |

## 三、已知的坑

- 思考型模型会把推理塞进正文并挤掉 JSON，`max_tokens` 要给到 1600–2600；答案常落在 `reasoning_content`，代码已做兜底取用。
- 完整雷达刷新（20 个竞品站点 + 两轮 kimi 审）约 4–5 分钟，尚未拆成「快刷新 / 深审」两个按钮。
- Pinterest / Pixelfed / Tumblr 没有可用公开搜索接口，已排除，不硬凑。
- `data/` 里的 `master.key.dpapi` 绑定当前 Windows 用户，换机器要重新录入全部凭据。

## 四、下一步优先级

1. 起一台 Postiz（Docker 主机或 VPS），把发布中心从 mock 切到真发。
2. 接 `POST /public/v1/upload`，打通带图/带视频的 IG / TikTok / Pinterest 发布。
3. 雷达刷新拆快慢两档，把 4–5 分钟压到 40 秒可用。
4. 接 GA4 只读授权，把指标回收自动化。
