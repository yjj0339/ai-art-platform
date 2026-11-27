-- AI创意设计思维平台：多机构、账号关系、会话和用户数据的第一阶段结构。

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campuses (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  campus_id TEXT REFERENCES campuses(id),
  account TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
  avatar TEXT NOT NULL DEFAULT '',
  class_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, account)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS school_classes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  campus_id TEXT REFERENCES campuses(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS enrollment_codes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  campus_id TEXT NOT NULL REFERENCES campuses(id),
  class_id TEXT REFERENCES school_classes(id),
  role TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS enrollment_codes_org_campus_idx ON enrollment_codes (organization_id, campus_id, status);

CREATE TABLE IF NOT EXISTS teacher_classes (
  teacher_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_user_id, class_id)
);

CREATE TABLE IF NOT EXISTS class_students (
  class_id TEXT NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  student_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, student_user_id)
);

CREATE TABLE IF NOT EXISTS user_documents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  campus_id TEXT REFERENCES campuses(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  document_type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS gallery_submissions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  document_id TEXT REFERENCES user_documents(id),
  automatic_review_status TEXT NOT NULL DEFAULT 'pending' CHECK (automatic_review_status IN ('pending', 'passed', 'rejected')),
  manual_review_status TEXT NOT NULL DEFAULT 'pending' CHECK (manual_review_status IN ('pending', 'approved', 'rejected')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_organization_role ON users(organization_id, role);
CREATE INDEX IF NOT EXISTS idx_sessions_token_expires ON sessions(token_hash, expires_at);
CREATE INDEX IF NOT EXISTS idx_documents_owner_type_updated ON user_documents(organization_id, owner_user_id, document_type, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_teacher_classes_class ON teacher_classes(class_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_created ON audit_logs(organization_id, created_at DESC);

-- 第二阶段：显式账号授权、受保护资产、AI任务和数据库行级隔离。
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS resource_key TEXT NOT NULL DEFAULT '';
ALTER TABLE user_documents ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);

CREATE TABLE IF NOT EXISTS admin_scopes (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  campus_id TEXT REFERENCES campuses(id),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('organization', 'campus')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((scope_type = 'organization' AND campus_id IS NULL) OR (scope_type = 'campus' AND campus_id IS NOT NULL)),
  UNIQUE (admin_user_id, organization_id, campus_id, scope_type)
);

CREATE TABLE IF NOT EXISTS permission_groups (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  campus_id TEXT REFERENCES campuses(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled')),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS permission_group_members (
  group_id TEXT NOT NULL REFERENCES permission_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_assets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  campus_id TEXT REFERENCES campuses(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  asset_kind TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ai_tasks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  campus_id TEXT REFERENCES campuses(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  task_type TEXT NOT NULL CHECK (task_type IN ('image', 'video', 'model3d', 'report')),
  provider TEXT NOT NULL,
  provider_task_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_task_id)
);

CREATE TABLE IF NOT EXISTS organization_documents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  campus_id TEXT REFERENCES campuses(id),
  document_type TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admin_scopes_user_scope ON admin_scopes(admin_user_id, organization_id, campus_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_scopes_organization_unique
  ON admin_scopes(admin_user_id, organization_id)
  WHERE scope_type = 'organization';
CREATE INDEX IF NOT EXISTS idx_permission_group_members_user ON permission_group_members(user_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_user_assets_owner_kind ON user_assets(organization_id, owner_user_id, asset_kind, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ai_tasks_owner_type ON ai_tasks(organization_id, owner_user_id, task_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_documents_scope_type ON organization_documents(organization_id, campus_id, document_type, updated_at DESC) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_owner_type_key_unique
  ON user_documents(organization_id, owner_user_id, document_type, resource_key)
  WHERE deleted_at IS NULL AND resource_key <> '';

-- 登录账号在同一机构内不区分大小写唯一。
-- 表上的 UNIQUE (organization_id, account) 是区分大小写的，而登录查询用 lower(account) 匹配，
-- 于是 'Ceshi2' 和 'ceshi2' 可以同时存在，登录时却撞成同一个账号 —— 会随机登进别人的账号。
-- 这条索引把「不区分大小写」这层约束也落到数据库，任何入口都绕不过去。
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_org_account_ci_unique
  ON users(organization_id, lower(account));

-- AI 玩法中心：玩法本体保存草稿，学生端只使用发布版本的不可变配置。
CREATE TABLE IF NOT EXISTS ai_skills (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('platform', 'organization')),
  source_skill_id TEXT REFERENCES ai_skills(id),
  skill_type TEXT NOT NULL CHECK (skill_type IN ('image', 'video')),
  -- 用途：student_skill=学生 AI 玩法（AI 玩法中心）；report_workflow=H5 报告配图工作流（报告工作流库）。
  -- 两个后台模块共用本表，靠这一列彻底隔离，互不可见。
  usage_kind TEXT NOT NULL DEFAULT 'student_skill',
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'offline', 'archived')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  draft_configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  draft_revision INTEGER NOT NULL DEFAULT 0,
  published_configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_version_id TEXT,
  created_by_user_id TEXT REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ai_skills ADD COLUMN IF NOT EXISTS draft_revision INTEGER NOT NULL DEFAULT 0;
-- 老库补 usage_kind 列：默认 student_skill，报告工作流由一次性回填脚本标记。
ALTER TABLE ai_skills ADD COLUMN IF NOT EXISTS usage_kind TEXT NOT NULL DEFAULT 'student_skill';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_skills_usage_kind_chk') THEN
    ALTER TABLE ai_skills ADD CONSTRAINT ai_skills_usage_kind_chk
      CHECK (usage_kind IN ('student_skill', 'report_workflow'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_skills_usage_kind
  ON ai_skills (organization_id, usage_kind, status);

CREATE TABLE IF NOT EXISTS ai_skill_versions (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL REFERENCES ai_skills(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  configuration JSONB NOT NULL,
  created_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (skill_id, version_number)
);

CREATE TABLE IF NOT EXISTS ai_skill_assignments (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL REFERENCES ai_skills(id) ON DELETE CASCADE,
  version_id TEXT REFERENCES ai_skill_versions(id) ON DELETE SET NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  campus_id TEXT REFERENCES campuses(id),
  class_id TEXT REFERENCES school_classes(id),
  permission_group_id TEXT REFERENCES permission_groups(id),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('organization', 'campus', 'class', 'permission_group')),
  status TEXT NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled')),
  created_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (scope_type = 'organization' AND campus_id IS NULL AND class_id IS NULL AND permission_group_id IS NULL)
    OR (scope_type = 'campus' AND campus_id IS NOT NULL AND class_id IS NULL AND permission_group_id IS NULL)
    OR (scope_type = 'class' AND class_id IS NOT NULL AND permission_group_id IS NULL)
    OR (scope_type = 'permission_group' AND permission_group_id IS NOT NULL AND class_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS ai_skill_daily_usage (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES ai_skills(id) ON DELETE CASCADE,
  version_id TEXT REFERENCES ai_skill_versions(id) ON DELETE SET NULL,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id, skill_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_ai_skills_scope_status ON ai_skills(organization_id, scope_type, status, skill_type, sort_order);
CREATE INDEX IF NOT EXISTS idx_ai_skill_versions_skill ON ai_skill_versions(skill_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_ai_skill_assignments_scope ON ai_skill_assignments(organization_id, skill_id, status, scope_type);
CREATE INDEX IF NOT EXISTS idx_ai_skill_usage_user_date ON ai_skill_daily_usage(organization_id, user_id, usage_date);

-- 学生端初级版/入门版提示词库。
CREATE TABLE IF NOT EXISTS prompt_categories (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '✨',
  icon_image_url TEXT NOT NULL DEFAULT '',
  target_editions TEXT[] NOT NULL DEFAULT ARRAY['junior','starter'],
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled', 'archived')),
  created_by_user_id TEXT REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  category_id TEXT NOT NULL REFERENCES prompt_categories(id) ON DELETE RESTRICT,
  label TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '✨',
  icon_image_url TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL,
  target_editions TEXT[] NOT NULL DEFAULT ARRAY['junior','starter'],
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled', 'archived')),
  created_by_user_id TEXT REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompt_categories_org_status ON prompt_categories(organization_id, status, sort_order);
CREATE INDEX IF NOT EXISTS idx_prompts_org_category_status ON prompts(organization_id, category_id, status, sort_order);

ALTER TABLE prompt_categories ADD COLUMN IF NOT EXISTS icon_image_url TEXT NOT NULL DEFAULT '';
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS icon_image_url TEXT NOT NULL DEFAULT '';

-- 图像风格模板：后台「AI图像功能管理 → 风格模板编辑」维护，学生端绘画页「图像风格」读取。
-- group_name 只是文本分组（如 推荐 / 插画 / 摄影 / 中国风），学生端按出现顺序渲染标签，不单独建表。
CREATE TABLE IF NOT EXISTS image_style_templates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  group_name TEXT NOT NULL DEFAULT '推荐',
  prompt TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled', 'archived')),
  created_by_user_id TEXT REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_style_templates_org_status ON image_style_templates(organization_id, status, sort_order);

-- 风格面板设置（面板标题、每排几张、默认分组、回退方式），按机构一份。
-- 以前只存在后台浏览器里，学生的平板读不到；服务端首次使用时也会自动建这张表。
CREATE TABLE IF NOT EXISTS image_style_panel_settings (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 风格分类（学生端叫「分组」标签）。
-- 为什么要单独建表：分类以前只是 image_style_templates.group_name 里的一段文字，
-- 没有风格时分类就不存在，后台没法先建一个空分类再往里放风格；改分类名也只能逐条改。
-- 这里只存「分类本身」，风格与分类仍靠 group_name 文本对应，不改成外键：
-- 改外键要迁移所有老数据，收益只是理论上的整洁，风险却是把学生端标签搞丢。
CREATE TABLE IF NOT EXISTS image_style_groups (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_style_groups_org ON image_style_groups(organization_id, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS uq_image_style_groups_org_name ON image_style_groups(organization_id, name);

-- Existing administrators receive an explicit initial scope. An administrator
-- without a campus is organization-wide; a campus administrator is limited to
-- that campus. This is idempotent and never broadens an existing explicit scope.
INSERT INTO admin_scopes (id, admin_user_id, organization_id, campus_id, scope_type)
SELECT
  'scope_' || substr(md5(u.id || ':' || u.organization_id), 1, 24),
  u.id,
  u.organization_id,
  u.campus_id,
  CASE WHEN u.campus_id IS NULL THEN 'organization' ELSE 'campus' END
FROM users u
WHERE u.role = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM admin_scopes scope
    WHERE scope.admin_user_id = u.id AND scope.organization_id = u.organization_id
  );

-- 跨机构关系必须同时匹配引用记录的 organization_id。
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campuses_id_organization_unique') THEN
    ALTER TABLE campuses ADD CONSTRAINT campuses_id_organization_unique UNIQUE (id, organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_id_organization_unique') THEN
    ALTER TABLE users ADD CONSTRAINT users_id_organization_unique UNIQUE (id, organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'classes_id_organization_unique') THEN
    ALTER TABLE school_classes ADD CONSTRAINT classes_id_organization_unique UNIQUE (id, organization_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teacher_classes_teacher_org_fkey') THEN
    ALTER TABLE teacher_classes ADD CONSTRAINT teacher_classes_teacher_org_fkey
      FOREIGN KEY (teacher_user_id, organization_id) REFERENCES users(id, organization_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teacher_classes_class_org_fkey') THEN
    ALTER TABLE teacher_classes ADD CONSTRAINT teacher_classes_class_org_fkey
      FOREIGN KEY (class_id, organization_id) REFERENCES school_classes(id, organization_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_students_class_org_fkey') THEN
    ALTER TABLE class_students ADD CONSTRAINT class_students_class_org_fkey
      FOREIGN KEY (class_id, organization_id) REFERENCES school_classes(id, organization_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_students_student_org_fkey') THEN
    ALTER TABLE class_students ADD CONSTRAINT class_students_student_org_fkey
      FOREIGN KEY (student_user_id, organization_id) REFERENCES users(id, organization_id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app_can_read_student(target_user_id TEXT, target_organization_id TEXT, target_campus_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT target_organization_id = current_setting('app.organization_id', true)
    AND (
      target_user_id = current_setting('app.user_id', true)
      OR (
        current_setting('app.user_role', true) = 'teacher'
        AND EXISTS (
          SELECT 1 FROM public.teacher_classes tc
          JOIN public.class_students cs ON cs.class_id = tc.class_id AND cs.organization_id = tc.organization_id
          WHERE tc.teacher_user_id = current_setting('app.user_id', true)
            AND cs.student_user_id = target_user_id
            AND tc.organization_id = target_organization_id
        )
      )
      OR (
        current_setting('app.user_role', true) = 'admin'
        AND EXISTS (
          SELECT 1 FROM public.admin_scopes scope
          WHERE scope.admin_user_id = current_setting('app.user_id', true)
            AND scope.organization_id = target_organization_id
            AND (scope.scope_type = 'organization' OR scope.campus_id = target_campus_id)
        )
      )
    );
$$;

ALTER TABLE user_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE user_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_assets FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_tasks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_documents_select_policy ON user_documents;
CREATE POLICY user_documents_select_policy ON user_documents FOR SELECT
  USING (
    app_can_read_student(owner_user_id, organization_id, campus_id)
    OR EXISTS (
      SELECT 1 FROM gallery_submissions gs
      WHERE gs.document_id = user_documents.id
        AND gs.automatic_review_status = 'passed'
        AND gs.manual_review_status = 'approved'
        AND gs.published_at IS NOT NULL
    )
  );
DROP POLICY IF EXISTS user_documents_insert_policy ON user_documents;
CREATE POLICY user_documents_insert_policy ON user_documents FOR INSERT
  WITH CHECK (
    owner_user_id = current_setting('app.user_id', true)
    AND organization_id = current_setting('app.organization_id', true)
    AND current_setting('app.user_role', true) = 'student'
  );
DROP POLICY IF EXISTS user_documents_update_policy ON user_documents;
CREATE POLICY user_documents_update_policy ON user_documents FOR UPDATE
  USING (owner_user_id = current_setting('app.user_id', true) AND current_setting('app.user_role', true) = 'student')
  WITH CHECK (owner_user_id = current_setting('app.user_id', true) AND organization_id = current_setting('app.organization_id', true));
DROP POLICY IF EXISTS user_documents_delete_policy ON user_documents;
CREATE POLICY user_documents_delete_policy ON user_documents FOR DELETE
  USING (owner_user_id = current_setting('app.user_id', true) AND current_setting('app.user_role', true) = 'student');

DROP POLICY IF EXISTS user_assets_select_policy ON user_assets;
CREATE POLICY user_assets_select_policy ON user_assets FOR SELECT
  USING (app_can_read_student(owner_user_id, organization_id, campus_id));
DROP POLICY IF EXISTS user_assets_insert_policy ON user_assets;
CREATE POLICY user_assets_insert_policy ON user_assets FOR INSERT
  WITH CHECK (owner_user_id = current_setting('app.user_id', true) AND organization_id = current_setting('app.organization_id', true) AND current_setting('app.user_role', true) = 'student');
DROP POLICY IF EXISTS user_assets_update_policy ON user_assets;
CREATE POLICY user_assets_update_policy ON user_assets FOR UPDATE
  USING (owner_user_id = current_setting('app.user_id', true) AND current_setting('app.user_role', true) = 'student');

DROP POLICY IF EXISTS ai_tasks_owner_policy ON ai_tasks;
CREATE POLICY ai_tasks_owner_policy ON ai_tasks FOR ALL
  USING (owner_user_id = current_setting('app.user_id', true) AND organization_id = current_setting('app.organization_id', true))
  WITH CHECK (owner_user_id = current_setting('app.user_id', true) AND organization_id = current_setting('app.organization_id', true));

-- 第三阶段：作品广场审核规则（按机构一行配置）。
CREATE TABLE IF NOT EXISTS gallery_audit_settings (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id),
  auto_audit BOOLEAN NOT NULL DEFAULT TRUE,
  auto_select BOOLEAN NOT NULL DEFAULT TRUE,
  quality_threshold INTEGER NOT NULL DEFAULT 60,
  duplicate_threshold INTEGER NOT NULL DEFAULT 80,
  max_pinned INTEGER NOT NULL DEFAULT 3,
  sensitive_words JSONB NOT NULL DEFAULT '["暴力","色情","仇恨","辱骂"]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT REFERENCES users(id)
);

-- 审核原因与质量分（前端列表展示审核结果需要）。
ALTER TABLE gallery_submissions ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT '学生投稿';
ALTER TABLE gallery_submissions ADD COLUMN IF NOT EXISTS automatic_review_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE gallery_submissions ADD COLUMN IF NOT EXISTS manual_review_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE gallery_submissions ADD COLUMN IF NOT EXISTS quality_score INTEGER;

-- 技能包（外部 SKILL.md 导入区）。
-- 定位：这里是「原料」，不是学生能点的东西。上传后只落成一条待整理记录，
-- 老师补提示词 → 转成玩法卡（写进 ai_skills）→ 测试 → 发布，学生端才看得到。
-- 单独建表而不塞进 ai_skills：一个技能包可能拆出多个玩法（一对多），
-- 且技能包不需要版本、发布、分配这一整套玩法字段。
CREATE TABLE IF NOT EXISTS ai_skill_packages (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  -- 原始文件名（含 .zip/.md 后缀），列表展示用
  file_name TEXT NOT NULL DEFAULT '',
  -- 技能包自带标识（frontmatter 里的 name），用于去重与人工辨认
  package_key TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  -- 技能包里自带的封面图（zip 里的 assets/*.png 等），导入时顺手抽出来。
  -- 空字符串表示没取到，老师之后在玩法卡里自己传。
  cover_url TEXT NOT NULL DEFAULT '',
  -- 正文全文。不参与生成，只在后台「查看原文」和老师挑话术时用。
  body TEXT NOT NULL DEFAULT '',
  -- 从正文里抽出来的候选话术（提示词片段），数组，给老师一键填入。
  prompt_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 解析出的其它信息（frontmatter 剩余键、脚本清单等），只做展示，不执行。
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 内容指纹：同一份 SKILL.md 重复上传直接跳过，避免列表被同名包刷满。
  content_hash TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'converted', 'ignored')),
  -- 转成玩法后回填，方便从玩法反查来源；玩法被删则置空，不影响本记录。
  converted_skill_id TEXT REFERENCES ai_skills(id) ON DELETE SET NULL,
  created_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_skill_packages_org
  ON ai_skill_packages (organization_id, status, created_at DESC);
-- 同一机构内同一份内容只留一条。用内容哈希而不是文件名：
-- 不同来源的同名 SKILL.md 内容常常不同，按文件名去重会误杀。
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_skill_packages_hash
  ON ai_skill_packages (organization_id, content_hash) WHERE content_hash <> '';

-- 技能包分类。由后台自己建，学生端只用来筛选，不参与生成。
-- 每个机构固定一条「未分类」兜底（is_default），接住导入后还没归类的包：
-- 可重复调用 ensureDefaultCategory，删分类时包自动回到这里，不会连带删掉。
CREATE TABLE IF NOT EXISTS ai_skill_package_categories (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_skill_package_category_name
  ON ai_skill_package_categories (organization_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS ai_skill_package_category_default
  ON ai_skill_package_categories (organization_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS ai_skill_package_category_order
  ON ai_skill_package_categories (organization_id, sort_order, created_at);

-- 技能包归属分类；NULL = 还没归类，列表里并入「未分类」
ALTER TABLE ai_skill_packages ADD COLUMN IF NOT EXISTS category_id TEXT;
CREATE INDEX IF NOT EXISTS idx_ai_skill_packages_category
  ON ai_skill_packages (organization_id, category_id);

-- 玩法卡也带一份分类：学生端只读已发布玩法，它不认识「技能包」这张表，
-- 而且老师清掉技能包记录后学生端的分类不该跟着消失，所以转玩法时把分类复制过来。
ALTER TABLE ai_skills ADD COLUMN IF NOT EXISTS category_id TEXT;

-- 取消家长端：角色只剩 用户/老师/管理员。存量库里 users.role 与 enrollment_codes.role
-- 上还挂着允许 'parent' 的旧 CHECK 约束，这里先删家长绑定关系与家长账号，再收紧约束。
-- 顺序不能反：约束先收紧的话，残留的 parent 行会让 ALTER TABLE 直接失败。
-- 用 DO 块判断存在性，全新库里 guardian_students 本来就不存在，直接 DELETE 会报错。
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'guardian_students') THEN
    DELETE FROM guardian_students;
    DROP TABLE guardian_students;
  END IF;
END $$;
-- 删家长账号之前必须先松开审计日志的外键：audit_logs.actor_user_id 是 REFERENCES users(id)
-- 且没有 ON DELETE，家长账号一旦被记过日志，直接 DELETE 会整条迁移回滚（23503）。
-- 审计记录本身要保留（谁在什么时候做过什么），只把「操作人」置空并注明原因。
UPDATE audit_logs SET actor_user_id = NULL,
  detail = COALESCE(detail, '{}'::jsonb) || '{"actorRemoved":"parent-role-retired"}'::jsonb
WHERE actor_user_id IN (SELECT id FROM users WHERE role = 'parent');
DELETE FROM users WHERE role = 'parent';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('student', 'teacher', 'admin'));
ALTER TABLE enrollment_codes DROP CONSTRAINT IF EXISTS enrollment_codes_role_check;
ALTER TABLE enrollment_codes ADD CONSTRAINT enrollment_codes_role_check CHECK (role IN ('student', 'teacher'));

-- ===== 课程中心：课程服务端化 =====
-- 课程本体落在 organization_documents（机构级文档），document_type='course'，resource_key=课程ID。
-- 不用 user_documents：那张表有 RLS，策略硬要求 app.user_role='student' 才能写，
-- 老师与管理员根本插不进去，课程作者恰恰是老师/管理员。
ALTER TABLE organization_documents ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
ALTER TABLE organization_documents ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);
-- 同一机构下「课程类型 + 课程ID」唯一，重复写入会撞唯一键，由服务端改成更新。
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_documents_course_unique
  ON organization_documents (organization_id, document_type, resource_key)
  WHERE deleted_at IS NULL AND document_type = 'course';

-- 课程授权。前四种 scope 与 ai_skill_assignments 一致（已经在生产跑，照搬最稳）；
-- 额外多一个 student：教师端的「授权给某个学生」必须能落到库里，
-- 否则按名字匹配的 authorizedStudents 永远是假的。
CREATE TABLE IF NOT EXISTS course_assignments (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  campus_id TEXT REFERENCES campuses(id),
  class_id TEXT REFERENCES school_classes(id),
  permission_group_id TEXT REFERENCES permission_groups(id),
  student_user_id TEXT REFERENCES users(id),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('organization', 'campus', 'class', 'permission_group', 'student')),
  status TEXT NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled')),
  created_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (scope_type = 'organization' AND campus_id IS NULL AND class_id IS NULL AND permission_group_id IS NULL AND student_user_id IS NULL)
    OR (scope_type = 'campus' AND campus_id IS NOT NULL AND class_id IS NULL AND permission_group_id IS NULL AND student_user_id IS NULL)
    OR (scope_type = 'class' AND class_id IS NOT NULL AND permission_group_id IS NULL AND student_user_id IS NULL)
    OR (scope_type = 'permission_group' AND permission_group_id IS NOT NULL AND class_id IS NULL AND student_user_id IS NULL)
    OR (scope_type = 'student' AND student_user_id IS NOT NULL AND class_id IS NULL AND permission_group_id IS NULL AND campus_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_course_assignments_course
  ON course_assignments (course_id, organization_id) WHERE status = 'enabled';
CREATE INDEX IF NOT EXISTS idx_course_assignments_group
  ON course_assignments (permission_group_id, organization_id) WHERE status = 'enabled';

-- 课程素材（封面/视频/课件）。文件落盘，表里只登记归属与路径。
-- 不开 RLS：只有服务端代码读写，读权限在路由层判定（能看到这门课才能拿到它的素材）。
CREATE TABLE IF NOT EXISTS course_assets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  campus_id TEXT REFERENCES campuses(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('cover', 'video', 'ppt', 'pdf')),
  original_name TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  storage_key TEXT NOT NULL UNIQUE,
  byte_size BIGINT NOT NULL DEFAULT 0 CHECK (byte_size >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_course_assets_org_kind
  ON course_assets (organization_id, asset_kind, created_at DESC) WHERE deleted_at IS NULL;

-- 自定义课程分类。内置 7 个分类由服务端首次访问时补种，机构可再增删。
CREATE TABLE IF NOT EXISTS org_course_categories (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id)
);
