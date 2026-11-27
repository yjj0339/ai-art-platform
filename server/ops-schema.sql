-- 运维：服务器意外错误和 AI 调用失败的记录（后台「异常管理」）。
-- 首次使用时由 server/ops-store.js 自动建表；部署时 pnpm db:migrate 也会执行这份 SQL。
CREATE TABLE IF NOT EXISTS app_error_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  user_id TEXT,
  kind TEXT NOT NULL DEFAULT 'server' CHECK (kind IN ('server', 'ai')),
  method TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',
  status INTEGER NOT NULL DEFAULT 500,
  message TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL DEFAULT '',
  stack TEXT NOT NULL DEFAULT '',
  repeat_count INTEGER NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_error_logs_org_time_idx ON app_error_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS app_error_logs_time_idx ON app_error_logs (created_at DESC);
