import { get, run, setting } from './db.mjs';
import { encrypt, decrypt, keyHint } from './crypto.mjs';
import { PublishError } from './errors.mjs';

/* Postiz 发布中心适配器 —— 对的是它的公开 API v1：
   POST {base}/api/public/v1/posts        （自建）
   POST {base}/public/v1/posts            （api.postiz.com）
   鉴权：Authorization: <api key>（裸 key，不带 Bearer）
   契约来源：gitroomhq/postiz-docs → public-api/openapi.json（2026-10-26 取） */

const OWNER_KIND = 'channel';
const OWNER_ID = 0;
const KEY_FIELD = 'postiz_key';

/* 工作台平台 → Postiz identifier 候选。公司页/个人号这种同平台多授权按顺序先匹配 */
export const TYPE_CANDIDATES = {
  x: ['x'],
  linkedin: ['linkedin', 'linkedin-page'],
  facebook_page: ['facebook'],
  instagram: ['instagram', 'instagram-standalone'],
  threads: ['threads'],
  tiktok: ['tiktok'],
  youtube: ['youtube'],
  pinterest: ['pinterest'],
  reddit: ['reddit', 'lemmy'],
  telegram: ['telegram'],
  bluesky: ['bluesky'],
  mastodon: ['mastodon'],
  discord: ['discord'],
  wordpress: ['wordpress'],
};

/* Postiz 没有发布通道的平台：不硬凑，直接判 blocked 并说明 */
export const NO_POSTIZ_CHANNEL = {
  facebook_group: 'Postiz 没有 FB 群组发布器（群组只能会话发帖）',
  quora: 'Postiz 没有 Quora 通道',
  warrior_forum: 'Postiz 没有该论坛通道',
  alibaba: 'Postiz 没有 Alibaba 国际站通道',
  made_in_china: 'Postiz 没有中国制造网通道',
  globalsources: 'Postiz 没有环球资源通道',
  whatsapp: 'Postiz 没有 WhatsApp Cloud API 发布器',
  email: '邮件走 SMTP / Listmonk，不归 Postiz',
};

/* 这几种平台没有图/视频发不出去，本工作台素材上传还没接 Postiz /upload，提前拦住而不是让上游返错 */
const MEDIA_REQUIRED = new Set(['instagram', 'instagram-standalone', 'tiktok', 'youtube', 'pinterest']);

/* ---------- Base URL ---------- */
export function normalizeBase(raw) {
  let base = String(raw || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  if (/\/api\/public\/v1$/i.test(base) || /\/public\/v1$/i.test(base)) return base;
  if (/\/api$/i.test(base)) return base + '/public/v1';
  if (/^https?:\/\/api\.postiz\.com$/i.test(base)) return base + '/public/v1';
  return base + '/api/public/v1';
}

export function apiBase() {
  return normalizeBase(setting('postiz_base'));
}

/* ---------- API Key（AES-256-GCM 列级加密，DPAPI 包主密钥） ---------- */
export function saveKey(key) {
  const k = String(key || '').trim();
  run('delete from credential where owner_kind = ? and owner_id = ? and field = ?', OWNER_KIND, OWNER_ID, KEY_FIELD);
  if (!k) return { saved: false, hint: '' };
  run('insert into credential(owner_kind, owner_id, field, cipher, hint) values (?,?,?,?,?)',
    OWNER_KIND, OWNER_ID, KEY_FIELD, encrypt(k), keyHint(k));
  return { saved: true, hint: keyHint(k) };
}

export function keyView() {
  const r = get('select hint from credential where owner_kind = ? and owner_id = ? and field = ? order by id desc limit 1',
    OWNER_KIND, OWNER_ID, KEY_FIELD);
  return { saved: !!r, hint: r?.hint || '' };
}

function readKey() {
  const r = get('select cipher from credential where owner_kind = ? and owner_id = ? and field = ? order by id desc limit 1',
    OWNER_KIND, OWNER_ID, KEY_FIELD);
  if (r?.cipher) {
    try { return decrypt(r.cipher); } catch { return ''; }
  }
  // 兼容早期直接写 setting 的明文（只在没有加密记录时兜底）
  return String(setting('postiz_key') || '');
}

/* ---------- HTTP ---------- */
async function api(method, pathname, payload) {
  const base = apiBase();
  if (!base) throw new PublishError('pending_config', '未配置 Postiz 地址（设置 → 外部对接 → Postiz Base URL）');
  const key = readKey();
  if (!key) throw new PublishError('pending_config', '未配置 Postiz API Key（设置 → 外部对接 → Postiz API Key，保存后点验证）');

  const url = base + pathname;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30000);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        authorization: key,
        'content-type': 'application/json',
        'user-agent': 'social-workbench/0.1 (+postiz-public-v1)',
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: ac.signal,
    });
  } catch (e) {
    const why = e.name === 'AbortError' ? '30s 超时' : (e.cause?.code || e.message);
    throw new PublishError('upstream_error', `连不上 Postiz：${url}（${why}）`);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  if (res.status === 401 || res.status === 403) {
    throw new PublishError('pending_config', `Postiz 拒绝鉴权（HTTP ${res.status}）：API Key 不对或已撤销`, text.slice(0, 300));
  }
  if (res.status === 404) {
    throw new PublishError('pending_config', `Postiz 路径 404：Base URL 解析成 ${base}，确认自建版本与端口`, text.slice(0, 300));
  }
  if (res.status === 429) {
    throw new PublishError('rate_limited', 'Postiz 限流（HTTP 429）', text.slice(0, 300));
  }
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try {
      const j = JSON.parse(text);
      msg = [j.msg, j.message, j.error].filter(Boolean).join(' / ') || msg;
    } catch {}
    throw new PublishError('upstream_error', `Postiz 返回 HTTP ${res.status}：${msg}`, text.slice(0, 800));
  }
  try { return text ? JSON.parse(text) : {}; } catch { return { raw: text }; }
}

/* ---------- 通道（integration）发现与匹配 ---------- */
let cache = { at: 0, list: [] };

export function invalidateCache() {
  cache = { at: 0, list: [] };
}

export async function listIntegrations(force = false) {
  if (!force && cache.list.length && Date.now() - cache.at < 60000) return cache.list;
  const data = await api('GET', '/integrations');
  const list = Array.isArray(data) ? data : Array.isArray(data?.integrations) ? data.integrations : [];
  cache = { at: Date.now(), list };
  return list;
}

function matchIntegration(platform, list) {
  const explicit = jsonSetting('postiz_integration_map', {});
  const forcedId = explicit[platform];
  if (forcedId) {
    const hit = list.find((i) => i.id === forcedId);
    if (hit) return hit;
  }
  const candidates = TYPE_CANDIDATES[platform] || [platform];
  for (const cand of candidates) {
    const hit = list.find((i) => !i.disabled && i.identifier === cand);
    if (hit) return hit;
  }
  return null;
}

/* ---------- 平台 settings ---------- */
function jsonSetting(key, fallback) {
  try {
    const v = JSON.parse(setting(key) || '');
    return v && typeof v === 'object' ? v : fallback;
  } catch {
    return fallback;
  }
}

function buildSettings(identifier, content) {
  const extra = jsonSetting('postiz_settings', {});
  const s = { __type: identifier, ...(extra[identifier] || {}) };

  if (identifier === 'x') {
    if (!s.who_can_reply_post) s.who_can_reply_post = 'everyone';
  }
  if (identifier === 'instagram' || identifier === 'instagram-standalone') {
    if (!s.post_type) s.post_type = 'post';
  }
  if (identifier === 'tiktok') {
    if (!s.privacy_level) s.privacy_level = 'PUBLIC_TO_EVERYONE';
    if (!s.content_posting_method) s.content_posting_method = 'DIRECT_POST';
    if (s.duet === undefined) s.duet = false;
    if (s.stitch === undefined) s.stitch = false;
    if (s.comment === undefined) s.comment = true;
    if (s.autoAddMusic === undefined) s.autoAddMusic = 'yes';
    if (s.brand_content_toggle === undefined) s.brand_content_toggle = false;
    if (s.brand_organic_toggle === undefined) s.brand_organic_toggle = false;
  }
  if (identifier === 'pinterest' && !s.board) {
    throw new PublishError('pending_config',
      'Pinterest 必须指定 board id：设置里填 postiz_settings = {"pinterest":{"board":"<board-id>","link":""}}');
  }
  if (identifier === 'youtube') {
    const title = String(s.title || content?.title || '').split('\n')[0].trim().slice(0, 100);
    if (title.length < 2) throw new PublishError('pending_config', 'YouTube 要求标题 2-100 字，当前内容没有标题');
    s.title = title;
    if (!s.type) s.type = 'public';
    if (!s.selfDeclaredMadeForKids) s.selfDeclaredMadeForKids = 'no';
  }
  if ((identifier === 'reddit' || identifier === 'lemmy') && !Array.isArray(s.subreddit)) {
    throw new PublishError('pending_config',
      'Reddit/Lemmy 必须指定 subreddit：postiz_settings = {"reddit":{"subreddit":[{"value":{"subreddit":"saas","title":"标题","type":"self","url":"","is_flair_required":false,"flair":null}}]}}');
  }
  if ((identifier === 'discord' || identifier === 'slack') && !s.channel) {
    throw new PublishError('pending_config', `${identifier} 必须指定 channel id：postiz_settings.${identifier}.channel`);
  }
  return s;
}

function composeText(content) {
  const parts = [];
  const title = String(content?.title || '').trim();
  const body = String(content?.body || '').trim();
  if (title) parts.push(title);
  if (body) parts.push(body);
  const joined = parts.join('\n\n');
  const tags = String(content?.hashtags || '').trim();
  if (tags && !joined.includes(tags.split(/\s+/)[0])) parts.push(tags);
  const utm = String(content?.utm_url || '').trim();
  if (utm && !parts.join('\n\n').includes(utm)) parts.push(utm);
  return parts.filter(Boolean).join('\n\n');
}

/* ---------- 状态 / 验证 ---------- */
export function status() {
  const base = apiBase();
  const k = keyView();
  return {
    base,
    base_raw: setting('postiz_base') || '',
    key_saved: k.saved,
    key_hint: k.hint,
    configured: !!base && k.saved,
    post_type_mode: setting('postiz_type') || 'now',
    integration_map: jsonSetting('postiz_integration_map', {}),
  };
}

export async function verify() {
  const base = apiBase();
  if (!base) throw new PublishError('pending_config', '未配置 Postiz Base URL');
  if (!keyView().saved) throw new PublishError('pending_config', '未配置 Postiz API Key');

  const list = await listIntegrations(true);
  const matched = {};
  const unmatched = [];
  for (const platform of Object.keys(TYPE_CANDIDATES)) {
    const hit = matchIntegration(platform, list);
    if (hit) matched[platform] = { id: hit.id, identifier: hit.identifier, name: hit.name };
    else unmatched.push(platform);
  }
  return {
    ok: true,
    base,
    key_hint: keyView().hint,
    count: list.length,
    integrations: list.map((i) => ({
      id: i.id,
      identifier: i.identifier || '',
      name: i.name || '',
      profile: i.profile || '',
      disabled: !!i.disabled,
      customer: i.customer?.name || '',
    })),
    matched,
    unmatched,
  };
}

/* ---------- 发布 ---------- */
export async function publish({ content, account, platform, schedule }) {
  if (NO_POSTIZ_CHANNEL[platform]) {
    throw new PublishError('pending_integration', NO_POSTIZ_CHANNEL[platform]);
  }
  if (!TYPE_CANDIDATES[platform]) {
    throw new PublishError('pending_integration', `Postiz 公开 API 没有 ${platform} 的发布器`);
  }

  const list = await listIntegrations();
  const integration = matchIntegration(platform, list);
  if (!integration) {
    const connected = list.map((i) => i.identifier).filter(Boolean).join(', ') || '空';
    throw new PublishError('pending_config',
      `Postiz 里还没有 ${platform} 通道。先在 Postiz 后台接账号，当前已接：${connected}`);
  }
  if (integration.disabled) {
    throw new PublishError('pending_config', `Postiz 里 ${integration.identifier} 通道已停用（${integration.id}）`);
  }

  const identifier = integration.identifier;
  if (MEDIA_REQUIRED.has(identifier)) {
    throw new PublishError('pending_media',
      `${identifier} 必须带图/视频才能发；素材上传还没接 Postiz /upload，先人工发或补素材管线`);
  }

  const settings = buildSettings(identifier, content);
  const mode = setting('postiz_type') || 'now';
  let date;
  if (mode === 'schedule') {
    if (!schedule?.run_at) throw new PublishError('pending_config', 'postiz_type=schedule 但这条排期没有 run_at');
    date = new Date(String(schedule.run_at).replace(' ', 'T') + 'Z').toISOString();
  } else {
    date = new Date().toISOString();
  }

  const payload = {
    type: mode,
    date,
    shortLink: setting('postiz_shortlink') === '1',
    tags: [],
    posts: [
      {
        integration: { id: integration.id },
        value: [{ content: composeText(content), image: [] }],
        settings,
      },
    ],
  };

  const res = await api('POST', '/posts', payload);
  const first = Array.isArray(res) ? res[0] : res;
  const postId = first?.postId || first?.id || first?.post_id || '';
  const url = first?.releaseURL || first?.url || first?.releaseUrl || '';
  return {
    ok: true,
    post_id: postId || `postiz-${Date.now().toString(36)}`,
    url,
    integration: { id: integration.id, identifier, name: integration.name || '' },
  };
}
