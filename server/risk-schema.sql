-- 风控：敏感词库、内容过滤规则、违规记录、封禁记录、风控设置，以及登录失败计数。
-- 全部按 organization_id 隔离；接口层只有机构管理员能读写（login_attempts 只存哈希，不存账号原文和 IP）。

CREATE TABLE IF NOT EXISTS risk_words (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  word TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  -- allow = 放行词（白名单）：盖住它的命中会被忽略，用来消除"颜色情绪""做爱心卡片"这类误伤。
  action TEXT NOT NULL DEFAULT 'block' CHECK (action IN ('block', 'mask', 'review', 'allow')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('builtin', 'manual', 'import')),
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS risk_words_org_word_unique ON risk_words (organization_id, lower(word));
CREATE INDEX IF NOT EXISTS risk_words_org_category_idx ON risk_words (organization_id, category);

CREATE TABLE IF NOT EXISTS risk_rules (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  rule_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('builtin', 'regex', 'combo')),
  category TEXT NOT NULL DEFAULT 'other',
  pattern TEXT NOT NULL DEFAULT '',
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  action TEXT NOT NULL DEFAULT 'block' CHECK (action IN ('block', 'mask', 'review')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS risk_rules_org_key_unique ON risk_rules (organization_id, rule_key);

-- 违规记录只保存打码后的片段（不超过 120 字），访客只记 IP 的哈希。
CREATE TABLE IF NOT EXISTS risk_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL,
  action TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  hits JSONB NOT NULL DEFAULT '[]'::jsonb,
  excerpt TEXT NOT NULL DEFAULT '',
  counted BOOLEAN NOT NULL DEFAULT FALSE,
  handled_at TIMESTAMPTZ,
  handled_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS risk_events_org_time_idx ON risk_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS risk_events_user_time_idx ON risk_events (organization_id, user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS risk_bans (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'ai' CHECK (scope IN ('ai', 'all')),
  reason TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('auto', 'manual')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  lifted_at TIMESTAMPTZ,
  lifted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  lift_reason TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS risk_bans_active_idx ON risk_bans (organization_id, user_id) WHERE lifted_at IS NULL;
CREATE INDEX IF NOT EXISTS risk_bans_org_time_idx ON risk_bans (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS risk_settings (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  seeded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- 登录失败计数（按「机构+账号」与「IP」两种维度，键是带密钥的哈希）。
-- 账号存在时记下 user_id，方便管理员在后台看到"谁被锁了"并手动解锁；完整 IP 只存哈希（前两段另存为提示，见下方 ip_hint）。
CREATE TABLE IF NOT EXISTS login_attempts (
  key_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'account' CHECK (kind IN ('account', 'ip')),
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  failures INTEGER NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_user_idx ON login_attempts (organization_id, user_id) WHERE user_id IS NOT NULL;
-- 2026-11-26：网络（IP）计数按「机构」分开记，organization_id 记的是要登录的机构，管理员只能看到、解除自己机构的网络锁定。
-- ip_hint 只存 IP 的前两段（例如 183.21.*.*），方便管理员认出是不是自己学校的网络；完整 IP 仍然只存哈希。
ALTER TABLE login_attempts ADD COLUMN IF NOT EXISTS ip_hint TEXT;

-- 登录成功抵扣：一个班几十人共用一个出口 IP 时，大家的正常登录会抵掉偶尔输错的次数，不会把全班锁住。
-- 同一网络里每个账号每 15 分钟最多抵扣一次，攻击者拿自己的一个账号反复登录也刷不掉计数。
CREATE TABLE IF NOT EXISTS login_ip_credits (
  ip_key TEXT NOT NULL,
  account_key TEXT NOT NULL,
  credited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ip_key, account_key)
);
