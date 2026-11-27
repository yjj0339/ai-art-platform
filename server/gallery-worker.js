import { getDb, query, withTransaction, withUserContext } from './db.js'
import { galleryError as error, modelIdentity, sourceIdentity, imageDistance, callGalleryModel } from './gallery-engine.js'
import { galleryOwner, galleryDocument, getGalleryConsent, getAuditSettings, submitOwnGalleryDocument, galleryLog, platformBudget, lockGalleryStudent } from './gallery-service.js'

async function reserveBudget(job) {
  return withTransaction(async (client) => {
    await lockGalleryStudent(client, job.organization_id, job.owner_user_id)
    const consent = (await client.query('SELECT * FROM gallery_consents WHERE organization_id=$1 AND student_id=$2', [job.organization_id, job.owner_user_id])).rows[0]
    const liveJob = (await client.query('SELECT request_sent FROM gallery_jobs WHERE id=$1 FOR UPDATE', [job.id])).rows[0]
    if (!consent?.granted || liveJob?.request_sent) throw error('授权已变化或该请求已发出，请人工复核。', 409)
    if (!job.is_trial) {
      const doc = (await client.query('SELECT * FROM user_documents WHERE id=$1 AND deleted_at IS NULL FOR SHARE', [job.document_id])).rows[0]
      const config = (await client.query('SELECT rules FROM gallery_audit_settings WHERE organization_id=$1 FOR SHARE', [job.organization_id])).rows[0]?.rules || {}
      const sub = (await client.query('SELECT * FROM gallery_submissions WHERE id=$1 FOR UPDATE', [job.submission_id])).rows[0]
      if (!config.aiAudit || !doc || sourceIdentity(doc) !== job.snapshot.sourceKey || !sub || sub.blocked || sub.decision_by === 'manual' || sub.content_key !== job.content_key || sub.rule_version !== job.rule_version || (!sub.student_submitted && (!config.autoSelect || !consent.opted_in))) throw error('投稿已变更、精选已暂停或已由管理员处理。', 409)
    }
    await client.query("SELECT pg_advisory_xact_lock(hashtext('gallery-budget'))")
    const today = (await client.query("SELECT (now() AT TIME ZONE 'Asia/Shanghai')::date::text AS day")).rows[0].day
    const own = (await client.query('SELECT * FROM gallery_daily_usage WHERE organization_id=$1 AND day=$2', [job.organization_id, today])).rows[0]
    const total = Number((await client.query('SELECT COALESCE(sum(reserved_cost),0) AS total FROM gallery_daily_usage WHERE day=$1', [today])).rows[0].total)
    const cost = Number(job.rules.requestCostCeiling)
    if (platformBudget() <= 0 || cost <= 0 || total + cost > platformBudget() || (own?.calls || 0) >= job.rules.dailyLimit || Number(own?.reserved_cost || 0) + cost > job.rules.dailyBudget) return false
    await client.query(`INSERT INTO gallery_daily_usage(organization_id,day,calls,reserved_cost) VALUES($1,$2,1,$3)
      ON CONFLICT(organization_id,day) DO UPDATE SET calls=gallery_daily_usage.calls+1,reserved_cost=gallery_daily_usage.reserved_cost+$3`, [job.organization_id, today, cost])
    await client.query('UPDATE gallery_jobs SET request_sent=TRUE,charged_day=$2,reserved_cost=$3,attempts=attempts+1,updated_at=now() WHERE id=$1', [job.id, today, cost])
    if (job.submission_id) await client.query("UPDATE gallery_submissions SET review_state='running',automatic_review_reason='正在进行图片与文字审核',updated_at=now() WHERE id=$1", [job.submission_id])
    return true
  })
}
async function processEvent() {
  const event = await withTransaction(async (client) => {
    const row = (await client.query("SELECT * FROM gallery_events WHERE state='queued' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0]
    if (row) await client.query("UPDATE gallery_events SET state='processing' WHERE id=$1", [row.id])
    return row
  })
  if (!event) return
  try {
    const user = await galleryOwner(event.owner_user_id)
    const doc = await galleryDocument(user, event.document_id)
    if (doc.version !== event.document_version) throw error('已由更新版本替代。')
    await submitOwnGalleryDocument(user, doc.id, {}, true)
    await query("UPDATE gallery_events SET state='done' WHERE id=$1", [event.id])
  } catch (e) { await query("UPDATE gallery_events SET state='skipped',reason=$2 WHERE id=$1", [event.id, String(e.message).slice(0, 300)]) }
}
async function finalizeJob(user, job, result) {
  await withUserContext(user, async (client) => {
    await lockGalleryStudent(client, job.organization_id, user.id)
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`gallery-doc:${job.document_id}`])
    const doc = (await client.query('SELECT * FROM user_documents WHERE id=$1 AND deleted_at IS NULL FOR SHARE', [job.document_id])).rows[0]
    const sub = (await client.query('SELECT * FROM gallery_submissions WHERE id=$1 FOR UPDATE', [job.submission_id])).rows[0]
    const consent = (await client.query('SELECT * FROM gallery_consents WHERE organization_id=$1 AND student_id=$2 FOR SHARE', [job.organization_id, user.id])).rows[0]
    const config = (await client.query('SELECT rules FROM gallery_audit_settings WHERE organization_id=$1 FOR SHARE', [job.organization_id])).rows[0]?.rules || {}
    if (!sub || sub.blocked || sub.decision_by === 'manual' || sub.content_key !== job.content_key || sub.rule_version !== job.rule_version) return
    if (!doc || sourceIdentity(doc) !== job.snapshot.sourceKey || !consent?.granted) {
      await client.query("UPDATE gallery_submissions SET review_state='stale',automatic_review_reason='作品或授权已变化，请重新提交',updated_at=now() WHERE id=$1", [sub.id])
      return
    }
    const duplicate = await hasDuplicate(client, job)
    let state = result.safety === 'unsafe' ? 'rejected' : result.safety === 'uncertain' || duplicate ? 'review' : !sub.student_submitted && result.score < job.rules.qualityThreshold ? 'not_selected' : 'review'
    const canAuto = result.safety === 'safe' && !duplicate && state !== 'not_selected' && config.aiAudit && config.autoPublish && job.rules.autoPublish
      && (sub.student_submitted || (config.autoSelect && consent.opted_in))
    if (canAuto) state = 'published'
    await client.query(`UPDATE gallery_submissions SET review_state=$2,automatic_review_status=$3,automatic_review_reason=$4,quality_score=$5,ai_result=$6,
      published_snapshot=CASE WHEN $2='published' THEN snapshot ELSE published_snapshot END,published_image=CASE WHEN $2='published' THEN image_data ELSE published_image END,
      published_at=CASE WHEN $2='published' THEN now() ELSE published_at END,decision_by='ai',updated_at=now() WHERE id=$1`,
    [sub.id, state, result.safety === 'safe' ? 'passed' : result.safety === 'unsafe' ? 'rejected' : 'pending', duplicate ? '存在相同或相似公开作品，请人工确认。' : result.reason, result.score, JSON.stringify(result)])
    await galleryLog(client, { id: null, organization: user.organization }, 'gallery.ai_decision', sub.id, { state, score: result.score, ruleVersion: job.rule_version })
  })
}
async function hasDuplicate(client, job) {
  const duplicates = (await client.query("SELECT published_snapshot FROM gallery_submissions WHERE organization_id=$1 AND document_id<>$2 AND published_at IS NOT NULL AND NOT blocked", [job.organization_id, job.document_id])).rows
  return duplicates.some(({ published_snapshot: snap }) => snap && (snap.imageHash === job.snapshot.imageHash || (job.rules.duplicateCheck && imageDistance(snap.perceptualHash, job.snapshot.perceptualHash) <= 5)))
}
async function checkTrialActor(job) {
  const row = (await query("SELECT id,organization_id,campus_id,display_name FROM users WHERE id=$1 AND organization_id=$2 AND role='admin' AND status='active'", [job.actor_user_id, job.organization_id])).rows[0]
  if (!row) throw error('发起试审的管理员权限已失效。', 403)
  await galleryDocument({ id: row.id, role: 'admin', organization: { id: row.organization_id }, campus: row.campus_id ? { id: row.campus_id } : null }, job.document_id)
}
async function processJob(job) {
  try {
    const user = await galleryOwner(job.owner_user_id), current = await getAuditSettings(job.organization_id)
    const doc = await galleryDocument(user, job.document_id), consent = await getGalleryConsent(user)
    const sub = job.submission_id ? (await query('SELECT * FROM gallery_submissions WHERE id=$1', [job.submission_id])).rows[0] : null
    if (job.is_trial) await checkTrialActor(job)
    if (!consent.granted || (!job.is_trial && (!current.aiAudit || sub?.blocked || sub?.decision_by === 'manual' || sub?.content_key !== job.content_key || sub?.rule_version !== job.rule_version || (!sub?.student_submitted && (!current.autoSelect || !consent.opted_in))))) throw error('审核已暂停、授权已撤回或作品状态已变更。', 409)
    if (sourceIdentity(doc) !== job.snapshot.sourceKey) throw error('作品已更新，请重新提交当前版本。', 409)
    const model = modelIdentity(job.rules)
    if (model.configKey !== job.rules.modelConfigKey) throw error('模型配置已变化，旧任务不再调用，请重新试审。', 409)
    if (!job.is_trial) {
      const check = await query('SELECT 1 FROM gallery_model_checks WHERE organization_id=$1 AND provider=$2 AND model=$3 AND config_key=$4', [job.organization_id, job.rules.provider, job.rules.model, model.configKey])
      if (!check.rows.length) throw error('模型配置已变更，请重新试审验证。', 409)
      if (await hasDuplicate({ query }, job)) {
        await query("UPDATE gallery_submissions SET review_state='review',automatic_review_reason='存在相同或相似公开作品，已转人工确认',updated_at=now() WHERE id=$1 AND content_key=$2 AND rule_version=$3 AND NOT blocked AND decision_by IS DISTINCT FROM 'manual'", [job.submission_id, job.content_key, job.rule_version])
        await query("UPDATE gallery_jobs SET state='done',error_message='重复疑点转人工，未调用模型',lease_until=NULL,updated_at=now() WHERE id=$1", [job.id])
        return
      }
    }
    if (!await reserveBudget(job)) {
      await query("UPDATE gallery_jobs SET state='waiting_budget',error_message='额度或预算不足，等待额度恢复',updated_at=now() WHERE id=$1", [job.id])
      if (sub) await query("UPDATE gallery_submissions SET review_state='waiting_budget',automatic_review_reason='额度或预算不足',updated_at=now() WHERE id=$1 AND content_key=$2 AND NOT blocked", [sub.id, job.content_key])
      return
    }
    const result = await callGalleryModel(job.rules, job.snapshot, job.image_data)
    if (job.is_trial) {
      await checkTrialActor(job)
      if (!(await getGalleryConsent(user)).granted || modelIdentity(job.rules).configKey !== model.configKey) throw error('授权或模型配置已变化，请重新试审。', 409)
      await query(`INSERT INTO gallery_model_checks(organization_id,provider,model,config_key) VALUES($1,$2,$3,$4)
      ON CONFLICT(organization_id,provider,model) DO UPDATE SET config_key=$4,verified_at=now()`, [job.organization_id, job.rules.provider, job.rules.model, model.configKey])
    } else await finalizeJob(user, job, result)
    await query("UPDATE gallery_jobs SET state='done',result=$2,error_message='',updated_at=now(),lease_until=NULL WHERE id=$1", [job.id, JSON.stringify(result)])
  } catch (e) {
    const message = e.statusCode ? String(e.message).slice(0, 400) : '审核服务异常，请管理员检查模型或稍后重试。'
    await query("UPDATE gallery_jobs SET state='error',error_message=$2,updated_at=now(),lease_until=NULL WHERE id=$1", [job.id, message])
    if (job.submission_id) await query("UPDATE gallery_submissions SET review_state='review',automatic_review_reason=$3,updated_at=now() WHERE id=$1 AND content_key=$2 AND NOT blocked AND review_state IN ('queued','running','waiting_budget')", [job.submission_id, job.content_key, message])
  }
}
export async function runGalleryWorkerOnce() {
  const lock = await getDb().connect()
  let held = false
  try {
    held = (await lock.query("SELECT pg_try_advisory_lock(hashtext('gallery-worker')) AS held")).rows[0].held
    if (!held) return
    await query("UPDATE gallery_events SET state='queued' WHERE state='processing'")
    await processEvent()
    await query("UPDATE gallery_jobs SET state=CASE WHEN request_sent THEN 'error' ELSE 'queued' END,error_message=CASE WHEN request_sent THEN '服务中断，模型结果不明；请人工复核，避免重复计费。' ELSE '' END WHERE state='running' AND lease_until<now()")
    await query("UPDATE gallery_submissions gs SET review_state='review',automatic_review_reason=j.error_message FROM gallery_jobs j WHERE j.submission_id=gs.id AND j.content_key=gs.content_key AND j.state='error' AND gs.review_state IN ('queued','running')")
    await query("UPDATE gallery_jobs SET state='queued' WHERE state='waiting_budget' AND NOT request_sent AND updated_at < now()-interval '1 minute'")
    const job = await withTransaction(async (client) => {
      const row = (await client.query("SELECT * FROM gallery_jobs WHERE state='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0]
      if (row) await client.query("UPDATE gallery_jobs SET state='running',lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=$1", [row.id])
      return row
    })
    if (job) await processJob(job)
  } finally {
    if (held) await lock.query("SELECT pg_advisory_unlock(hashtext('gallery-worker'))")
    lock.release()
  }
}
export function startGalleryWorker() {
  let busy = false, stopped = false, warned = false
  const timer = setInterval(async () => {
    if (busy || stopped) return
    busy = true
    try { await runGalleryWorkerOnce(); warned = false } catch (e) {
      if (!warned) { console.warn(['42P01','42703'].includes(e.code) ? '内容审核等待数据库增量迁移。' : '内容审核后台任务暂时不可用，请检查数据库。'); warned = true }
    } finally { busy = false }
  }, 3000)
  timer.unref()
  return () => { stopped = true; clearInterval(timer) }
}
