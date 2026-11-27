-- 积分体系：钱包 / 流水 / 价目表 / 兑换码 / 每日免费额度。全部为新增表，不改现有表。

-- 1) 钱包：一个账号一个钱包
CREATE TABLE IF NOT EXISTS credit_wallets (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL DEFAULT 'user' CHECK (owner_type IN ('user', 'org')),
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_recharged INTEGER NOT NULL DEFAULT 0 CHECK (total_recharged >= 0),
  total_consumed INTEGER NOT NULL DEFAULT 0 CHECK (total_consumed >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

-- 2) 每日免费额度：当天一条，跨天新建一条（不累加）
CREATE TABLE IF NOT EXISTS credit_daily_quota (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grant_date DATE NOT NULL DEFAULT CURRENT_DATE,
  free_total INTEGER NOT NULL DEFAULT 60 CHECK (free_total >= 0),
  free_used INTEGER NOT NULL DEFAULT 0 CHECK (free_used >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id, grant_date),
  CHECK (free_used <= free_total)
);

-- 3) 流水：只增不改，所有余额变动都必须有一条
CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  from_free INTEGER NOT NULL DEFAULT 0 CHECK (from_free >= 0),
  from_wallet INTEGER NOT NULL DEFAULT 0 CHECK (from_wallet >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('recharge', 'redeem', 'admin_adjust', 'consume', 'refund', 'void')),
  biz_type TEXT NOT NULL DEFAULT '',
  biz_id TEXT NOT NULL DEFAULT '',
  balance_after INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  operator_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4) 价目表：后台可改，改价不影响历史流水
CREATE TABLE IF NOT EXISTS credit_prices (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits >= 0),
  status TEXT NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_by_user_id TEXT REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

-- 4b) 价目升级：按「能力 + 供应商 + 模型」定价，并给每种能力配「每天送几次」。
--     老行（image_basic / report_h5 / video_clip）仍然保留，升级后按 ability 认领，
--     provider / model 留空表示「该能力的兜底价」——学生选了没单独定价的模型就走这一行。
ALTER TABLE credit_prices ADD COLUMN IF NOT EXISTS ability TEXT NOT NULL DEFAULT 'image';
ALTER TABLE credit_prices ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT '';
ALTER TABLE credit_prices ADD COLUMN IF NOT EXISTS model TEXT NOT NULL DEFAULT '';
ALTER TABLE credit_prices ADD COLUMN IF NOT EXISTS daily_free INTEGER NOT NULL DEFAULT 0;

-- 老三种能力就位（幂等：只在新加列后第一次跑时改到目标值，之后不再覆盖后台改过的数字）
UPDATE credit_prices SET ability = 'image' WHERE code = 'image_basic' AND ability <> 'image';
UPDATE credit_prices SET ability = 'report_h5' WHERE code = 'report_h5' AND ability <> 'report_h5';
UPDATE credit_prices SET ability = 'video' WHERE code = 'video_clip' AND ability <> 'video';

CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_prices_model
  ON credit_prices(organization_id, ability, provider, model);

-- 4c) 每日赠送用量：按「人 / 天 / 能力」记次数，不是积分。白送的不折成钱，用完就走积分。
CREATE TABLE IF NOT EXISTS credit_usage_daily (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ability TEXT NOT NULL,
  free_total INTEGER NOT NULL DEFAULT 0 CHECK (free_total >= 0),
  free_used INTEGER NOT NULL DEFAULT 0 CHECK (free_used >= 0),
  paid_count INTEGER NOT NULL DEFAULT 0 CHECK (paid_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id, usage_date, ability),
  CHECK (free_used <= free_total)
);

-- 4d) 计费设置：提示文案等，按机构一份 JSONB，后台改完立即生效
CREATE TABLE IF NOT EXISTS credit_settings (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by_user_id TEXT REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id)
);

CREATE INDEX IF NOT EXISTS idx_credit_usage_daily_user
  ON credit_usage_daily(organization_id, user_id, usage_date DESC);

-- 5) 发码批次 + 6) 兑换码
CREATE TABLE IF NOT EXISTS credit_code_batches (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  face_value INTEGER NOT NULL CHECK (face_value > 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  prefix TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ,
  created_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_codes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  batch_id TEXT REFERENCES credit_code_batches(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  face_value INTEGER NOT NULL CHECK (face_value > 0),
  status TEXT NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued', 'redeemed', 'confirmed', 'void')),
  order_no TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  issued_by_user_id TEXT REFERENCES users(id),
  redeemed_by_user_id TEXT REFERENCES users(id),
  redeemed_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  confirmed_by_user_id TEXT REFERENCES users(id),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created
  ON credit_ledger(organization_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_biz
  ON credit_ledger(organization_id, user_id, biz_type, biz_id);
-- 幂等关键：同一笔业务（同 taskId）最多一条扣费流水
CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_ledger_consume
  ON credit_ledger(organization_id, user_id, biz_type, biz_id)
  WHERE kind = 'consume' AND biz_id <> '';
CREATE INDEX IF NOT EXISTS idx_credit_codes_status
  ON credit_codes(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_codes_batch ON credit_codes(batch_id);
CREATE INDEX IF NOT EXISTS idx_credit_wallets_org ON credit_wallets(organization_id, updated_at DESC);

-- 7) 默认价目（每个机构各一份，已存在则跳过）
INSERT INTO credit_prices (id, organization_id, code, label, credits, sort_order)
SELECT 'cp_' || o.id || '_image_basic', o.id, 'image_basic', '普通出图', 5, 10 FROM organizations o
ON CONFLICT DO NOTHING;
INSERT INTO credit_prices (id, organization_id, code, label, credits, sort_order)
SELECT 'cp_' || o.id || '_report_h5', o.id, 'report_h5', '高级 H5 报告', 10, 20 FROM organizations o
ON CONFLICT DO NOTHING;
INSERT INTO credit_prices (id, organization_id, code, label, credits, sort_order)
SELECT 'cp_' || o.id || '_video_clip', o.id, 'video_clip', '视频生成', 30, 30 FROM organizations o
ON CONFLICT DO NOTHING;

-- 7b) 新增两种能力的兜底价（3D 模型 / AI 文字），并把「每天送几次」按能力补齐。
--     只在该能力的兜底行还没设过每天赠送数时才写，避免每次迁移都覆盖后台调过的数字。
INSERT INTO credit_prices (id, organization_id, code, label, credits, sort_order, ability, daily_free)
SELECT 'cp_' || o.id || '_model3d', o.id, 'model3d', '3D 模型', 20, 40, 'model3d', 1 FROM organizations o
ON CONFLICT DO NOTHING;
INSERT INTO credit_prices (id, organization_id, code, label, credits, sort_order, ability, daily_free)
SELECT 'cp_' || o.id || '_ai_text', o.id, 'ai_text', 'AI 文字', 2, 50, 'ai_text', 5 FROM organizations o
ON CONFLICT DO NOTHING;

UPDATE credit_prices SET daily_free = 8  WHERE code = 'image_basic' AND daily_free = 0;
UPDATE credit_prices SET daily_free = 1  WHERE code = 'video_clip'  AND daily_free = 0;
UPDATE credit_prices SET daily_free = 1  WHERE code = 'report_h5'   AND daily_free = 0;
-- 报告一份内部要跑 6~8 张图，按份收 10 分会亏；30 张图成本口径把兜底价提到 40。
UPDATE credit_prices SET credits = 40 WHERE code = 'report_h5' AND credits = 10;
