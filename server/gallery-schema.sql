-- 内容审核增量结构；可重复执行。不启用模型调用，不自动发布旧作品。
ALTER TABLE gallery_audit_settings ADD COLUMN IF NOT EXISTS rules JSONB NOT NULL DEFAULT '{}';
ALTER TABLE gallery_audit_settings ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE gallery_audit_settings ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
ALTER TABLE gallery_submissions ADD COLUMN IF NOT EXISTS review_state TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE gallery_submissions ADD COLUMN IF NOT EXISTS snapshot JSONB NOT NULL DEFAULT '{}';
ALTER TABLE gallery_submissions ADD COLUMN IF NOT EXISTS image_data BYTEA;
ALTER TABLE gallery_submissions ADD COLUMN IF NOT EXISTS published_snapshot JSONB;
ALTER TABLE gallery_submissions ADD COLUMN IF NOT EXISTS published_image BYTEA;
ALTER TABLE gallery_submissions ADD COLUMN IF NOT EXISTS content_key TEXT NOT NULL DEFAULT '';
ALTER TABLE gallery_submissions ADD COLUMN IF NOT EXISTS image_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE gallery_submissions ADD COLUMN IF NOT EXISTS perceptual_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE gallery_submissions ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE gallery_submissions ADD COLUMN IF NOT EXISTS ai_result JSONB;
ALTER TABLE gallery_submissions ADD COLUMN IF NOT EXISTS rule_version INTEGER;
ALTER TABLE gallery_submissions ADD COLUMN IF NOT EXISTS student_submitted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE gallery_submissions ADD COLUMN IF NOT EXISTS decision_by TEXT;
CREATE INDEX IF NOT EXISTS gallery_owner_document ON gallery_submissions(organization_id,owner_user_id,document_id);

CREATE TABLE IF NOT EXISTS gallery_consents (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  student_id TEXT NOT NULL REFERENCES users(id),
  granted BOOLEAN NOT NULL DEFAULT FALSE,
  opted_in BOOLEAN NOT NULL DEFAULT FALSE,
  granted_by TEXT REFERENCES users(id),
  authority TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  policy_version TEXT NOT NULL DEFAULT 'gallery-2026-10',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,student_id)
);
CREATE TABLE IF NOT EXISTS gallery_model_checks (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  provider TEXT NOT NULL, model TEXT NOT NULL, config_key TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,provider,model)
);
CREATE TABLE IF NOT EXISTS gallery_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  actor_user_id TEXT REFERENCES users(id),
  document_id TEXT NOT NULL REFERENCES user_documents(id),
  submission_id TEXT REFERENCES gallery_submissions(id),
  content_key TEXT NOT NULL, rules JSONB NOT NULL, rule_version INTEGER NOT NULL,
  snapshot JSONB NOT NULL, image_data BYTEA NOT NULL,
  is_trial BOOLEAN NOT NULL DEFAULT FALSE,
  state TEXT NOT NULL DEFAULT 'queued', result JSONB, error_message TEXT NOT NULL DEFAULT '',
  request_sent BOOLEAN NOT NULL DEFAULT FALSE,
  charged_day DATE, reserved_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_until TIMESTAMPTZ
);
ALTER TABLE gallery_jobs ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS gallery_job_once ON gallery_jobs(organization_id,document_id,content_key,rule_version) WHERE NOT is_trial;
CREATE INDEX IF NOT EXISTS gallery_jobs_queue ON gallery_jobs(state,created_at);
CREATE TABLE IF NOT EXISTS gallery_daily_usage (
  organization_id TEXT NOT NULL REFERENCES organizations(id), day DATE NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0, reserved_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
  PRIMARY KEY(organization_id,day)
);
CREATE TABLE IF NOT EXISTS gallery_events (
  id BIGSERIAL PRIMARY KEY, document_id TEXT NOT NULL REFERENCES user_documents(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id), owner_user_id TEXT NOT NULL REFERENCES users(id),
  document_version INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'queued', reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(document_id,document_version)
);
CREATE OR REPLACE FUNCTION gallery_source_content(payload JSONB, title TEXT) RETURNS JSONB LANGUAGE SQL IMMUTABLE AS $$
  SELECT jsonb_build_array(title,payload->'finalVersionId',
    (SELECT jsonb_build_array(v->'imageUrl',v->'background',v->'preview') FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(COALESCE(payload->'versions',payload->'thumbnails'))='array' THEN COALESCE(payload->'versions',payload->'thumbnails') ELSE '[]'::jsonb END) v
      WHERE v->>'id'=payload->>'finalVersionId' LIMIT 1),
    payload->'ideaSummary',payload->'courseIdeaText',payload->'prompt',payload->'courseTitle',payload->'courseCategory',payload->'ageRange')
$$;
CREATE OR REPLACE FUNCTION gallery_record_final_save() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    UPDATE gallery_submissions SET blocked=TRUE, review_state='withdrawn',published_at=NULL,updated_at=now()
      WHERE document_id=NEW.id;
  ELSIF NEW.document_type='project' AND COALESCE(NEW.data->>'finalVersionId','')<>'' AND EXISTS(
    SELECT 1 FROM gallery_audit_settings s JOIN gallery_consents c ON c.organization_id=s.organization_id
    WHERE s.organization_id=NEW.organization_id AND c.student_id=NEW.owner_user_id AND c.granted AND c.opted_in
    AND s.rules->>'aiAudit'='true' AND s.rules->>'autoSelect'='true' AND s.activated_at IS NOT NULL
  ) THEN
    IF TG_OP='UPDATE' AND gallery_source_content(NEW.data,NEW.title)=gallery_source_content(OLD.data,OLD.title) THEN RETURN NEW; END IF;
    INSERT INTO gallery_events(document_id,organization_id,owner_user_id,document_version)
      VALUES(NEW.id,NEW.organization_id,NEW.owner_user_id,NEW.version) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS gallery_final_save ON user_documents;
CREATE TRIGGER gallery_final_save AFTER INSERT OR UPDATE ON user_documents FOR EACH ROW EXECUTE FUNCTION gallery_record_final_save();

-- 新发布路径只提供独立快照，不靠放宽原始文档权限展示。
DROP POLICY IF EXISTS user_documents_select_policy ON user_documents;
CREATE POLICY user_documents_select_policy ON user_documents FOR SELECT USING (
  app_can_read_student(owner_user_id,organization_id,campus_id)
);

-- ===== 作品广场分类 =====
-- 为什么单独建表：以前学生端顶部的「分类」按钮是拿作品的 course 字段去重凑出来的，
-- 作品没绑课程时 course 会退回作品标题，于是按钮上显示的是某一幅画的名字。
-- 现在分类由后台独立维护，作品只记「属于哪个分类」。
CREATE TABLE IF NOT EXISTS gallery_categories (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  -- 每个机构固定有一条「未分类」兜底，不可删除、不可隐藏，用于接住没有分类的旧作品
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 同一机构内分类名不能重复（默认分类也走这条约束）
CREATE UNIQUE INDEX IF NOT EXISTS gallery_category_name ON gallery_categories(organization_id, name);
-- 每个机构只允许一条默认分类
CREATE UNIQUE INDEX IF NOT EXISTS gallery_category_default ON gallery_categories(organization_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS gallery_category_order ON gallery_categories(organization_id, sort_order, created_at);

-- 作品归属分类；NULL = 尚未归类（列表里会并入「未分类」）
ALTER TABLE gallery_submissions ADD COLUMN IF NOT EXISTS category_id TEXT;
CREATE INDEX IF NOT EXISTS gallery_submission_category ON gallery_submissions(organization_id, category_id);
