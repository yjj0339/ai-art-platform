-- AI 玩法中心 V2 一次性清理脚本。
-- 必须先使用 pg_dump 备份数据库，再显式设置确认变量执行：
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SET app.confirm_ai_skill_reset='YES';" -f scripts/migrations/20260814-reset-ai-skills-v2.sql

BEGIN;

DO $$
BEGIN
  IF current_setting('app.confirm_ai_skill_reset', true) IS DISTINCT FROM 'YES' THEN
    RAISE EXCEPTION '未确认 AI 玩法清理。请先备份数据库，并设置 app.confirm_ai_skill_reset=YES。';
  END IF;
END $$;

-- 关联版本、分配和每日用量通过外键 ON DELETE CASCADE 一并删除。
DELETE FROM ai_skills;

COMMIT;
