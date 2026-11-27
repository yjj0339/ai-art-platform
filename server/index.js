import http from 'node:http'
import { execFile } from 'node:child_process'
import { accessSync, constants as fsConstants, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import sharp from 'sharp'
import { deflateSync } from 'node:zlib'
import { ai3d } from 'tencentcloud-sdk-nodejs-ai3d'
import { clearSessionCookie, getCurrentUser, loginWithPassword, logoutRequest, requireRole, sessionCookie } from './auth.js'
import { isUnexpectedError, listAppErrors, opsOverview, recordAppError, resolveAppErrors, trackRequest } from './ops-store.js'
import { createOwnDocument, deleteOwnDocument, getOwnDocument, getStudentDocument, listAccessibleStudents, listOwnDocuments, listStudentDocuments, updateOwnDocument } from './document-store.js'
import { createOwnAsset, createOwnAssetFromBuffer, getAccessibleAsset } from './asset-store.js'
import { readRemoteArtwork } from './artwork-image.js'
import { preserveGeneratedImages } from './generated-image-store.js'
import { createArtworkEditor, normalizeImageEditSpec } from './artwork-editor.js'
import { createH5LayoutService, h5TemplateVisible } from './h5-layout.js'
import { normalizeH5Design, validateH5Design } from '../src/utils/h5Layout.js'
import { claimOwnAiTaskFlag, createAiTask, getOwnAiTask, updateOwnAiTask } from './task-store.js'
import {
  assertProfileText, assertRegisterRate, checkContent, enforceAccountSafety, guardAiOutput, guardPromptFields, guardTextValues, handlePublicReportAction,
  handleRiskRoutes, loadPublishRiskState, loginWithProtection, publishTextVerdict, recordVerdict, riskCategoryNames, withAccountBans,
} from './risk-routes.js'
import { riskCheckerFor } from './risk-store.js'
import {
  buildH5WorkflowCoverPrompt, bulkDeleteAdminH5Workflows, copyPlatformSkill, createAdminSkill, deleteAdminSkill,
  enablePlatformSkillForOrganization, getAdminH5WorkflowLibraryItem, getAdminSkill, h5WorkflowCanvasCoverSource, listAdminH5WorkflowLibrary, listAdminSkills,
  listAdminSkillVersions, listStudentReportStyles, listStudentSkills, markAdminH5WorkflowTested, markAdminSkillTested, prepareAdminH5WorkflowTest, prepareAdminSkillTest,
  MAX_GENERATION_COUNT,
  prepareH5ReportWorkflowRun, prepareStudentSkillRun, publishAdminH5Workflow, publishAdminSkill, releaseStudentSkillUsage,
  restoreAdminSkillVersion, setAdminSkillStatus, updateAdminH5WorkflowLibraryItem, updateAdminSkill,
} from './ai-skill-store.js'
import {
  bindPackageToSkill, buildPackageSkillConfiguration, getSkillPackageDetail, importSkillPackages,
  listSkillPackages, markSkillPackages, removeSkillPackages, renameSkillPackages,
  setPackagesVisibility, updateSkillPackage,
} from './ai-skill-package-store.js'
import {
  createPackageCategory, deletePackageCategory, listPackageCategories,
  setPackagesCategory, updatePackageCategory,
} from './ai-skill-package-category-store.js'
import { runImageSteps } from './image-step-runner.js'
import { inferModelCapability, isArkHostedBaseUrl, normalizeProviderBaseUrl } from './provider-models.js'
import { getAuditSettings, listManagedGallerySubmissions, listPublicGalleryWorks, reviewGallerySubmission, saveAuditSettings, submitOwnGalleryDocument } from './gallery-store.js'
import * as gallery from './gallery-service.js'
import { configureGalleryRuntime, galleryError } from './gallery-engine.js'
import { startGalleryWorker } from './gallery-worker.js'
import {
  createAccount, deletePermissionGroup, disableAccount, listAccountOptions, listAccounts, listPermissionGroups,
  resetAccountPassword, revokeAccountSessions, savePermissionGroup, setAccountClasses, setAdminScopes,
  updateAccount,
} from './account-store.js'
import {
  getSummary as getCreditSummary, listLedger as listCreditLedger, redeemCode as redeemCreditCode,
  getCreditOverview, getUserCredit, adminAdjustCredits,
  generateCodes as generateCreditCodes, listCodes as listCreditCodes,
  confirmCodePayment, voidCode as voidCreditCode, exportCodes as exportCreditCodes,
  listPrices as listCreditPrices, savePrices as saveCreditPrices,
  saveCreditMessages, getCreditMessages, previewCharge, chargeAbility, refundCredits, refundAbility,
  CREDIT_ABILITIES, CREDIT_MESSAGE_DEFAULTS,
} from './credit-store.js'
import { createEnrollmentCode, disableCampus, listOrganizationSetup, registerWithEnrollment, saveCampus, saveClass } from './organization-store.js'
import { isDatabaseConfigured } from './db.js'
import { listPromptLibrary, listAdminPromptLibrary, removePrompt, removePromptCategory, savePrompt, savePromptCategory } from './prompt-library-store.js'
import { batchUpdateImageStyles, createImageStyleGroup, getImageStylePanelSettings, listAdminImageStyles, listImageStyleGroups, listStudentImageStyles, removeImageStyle, saveImageStylePanelSettings, removeImageStyleGroup, renameImageStyleGroup, reorderImageStyles, saveImageStyle, setImageStyleCoverRoot } from './image-style-store.js'
import { isProviderCooling, isProviderFailure, providerHealthView, recordProviderFailure, recordProviderSuccess, resetProviderHealth } from './provider-health.js'
import { getCanvasTemplate, listCanvasTemplates, removeCanvasTemplate, saveCanvasTemplate } from './canvas-template-store.js'
import { createAgentCallLog } from './agent-call-log.js'
import {
  assertCanReadCourseAsset, bulkUpdateCourseStatus, canReadCourseAssets, createCourse, deleteCourse,
  deleteCourseAsset, deleteCourseCategory, deleteCourses, getCourse, getCourseAssetRecord,
  listCourseAssignments, listCourseCategories, listCourses, registerCourseAsset,
  replaceCourseAssignments, saveCourseCategory, syncAssignmentsFromCourse, updateCourse,
  getMyCourseAccess, COURSE_ASSIGNMENT_FIELDS, listDistributionOptions,
} from './course-store.js'
import { persistCourseAssetFromStream, resolveCourseAssetFile } from './course-asset-store.js'
import { advanceStage, appendDialogMessage, emptyDialogState, loadCourseDialog, normalizeDialogState, quizAnsweredCount, recordQuizAnswer, saveCourseDialog } from './course-dialog-store.js'
import { buildCourseDialogPrompt, buildOpening, buildQuizDoneLine, extractByKeyword, fallbackReply, mergeCollected, normalizeDialogResult, personaName, personaRole, resolveCoursePersona } from './course-dialog-agent.js'
import { appendAgentMessage, clearAgentMessages, listAgentMessages } from './agent-memory-store.js'
import { WORKBENCH_CARD_IDS, WORKBENCH_IMAGE_POSITIONS, defaultWorkbenchConfig, readWorkbenchConfig, workbenchAssetPath, writeWorkbenchConfig } from './workbench-config-store.js'
import { AGENT_TOOL_LABELS, AGENT_TOOL_ROUTES, createAgentRuntime } from './agent-runtime.js'
import {
  agentSkillCoverPath, configureAgentSkillStorage, deleteAgentSkill, getSkillForAdmin, importAgentSkills,
  importSkillFromPackage, listSkillsForAdmin, skillToMarkdown, updateAgentSkill,
} from './agent-skill-store.js'
import { deleteConversation, getOwnConversation, listConversations, listMessages, renameConversation } from './agent-conversation-store.js'
import { agentImageDataUrl, agentImagePath, persistAgentImage, persistAgentVideo } from './agent-image-store.js'

function loadLocalEnv() {
  const envPath = join(process.cwd(), 'server', '.env')
  try {
    const lines = readFileSync(envPath, 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const [key, ...rest] = trimmed.split('=')
      if (!process.env[key]) process.env[key] = rest.join('=').trim()
    }
  } catch {}
}

loadLocalEnv()

const PORT = Number(process.env.PORT || 3000)
const AUTH_MODE = process.env.AUTH_MODE === 'server' ? 'server' : 'demo'
// 允许的来源可以是多个（英文逗号分隔）：开发时同一个应用常有 127.0.0.1 / localhost / 局域网 IP 三种打开方式，
// 只认一个值会让老师用平板打开时连登录都被 403 挡掉。
const APP_ORIGINS = String(process.env.APP_ORIGIN || '')
  .split(',')
  .map((item) => item.trim().replace(/\/+$/, ''))
  .filter(Boolean)
const APP_ORIGIN = APP_ORIGINS[0] || ''
const TENCENT_AI3D_HOST = process.env.TENCENT_AI3D_HOST || 'ai3d.tencentcloudapi.com'
const TENCENT_AI3D_REGION = process.env.TENCENT_AI3D_REGION || 'ap-guangzhou'
const TENCENT_AI3D_MODEL = process.env.TENCENT_AI3D_MODEL || '3.1'
const DEFAULT_PROVIDER = process.env.AI_DEFAULT_PROVIDER || 'agnes'
const DEFAULT_TEXT_PROVIDER = process.env.AI_DEFAULT_TEXT_PROVIDER || ''
const DEFAULT_DATA_DIR = join(process.cwd(), 'server', 'data')
const FALLBACK_DATA_DIR = process.env.AI_DATA_DIR
  || join(process.cwd(), 'server', 'data-fallback')
let dataDir = resolveDataDir()
// 风格封面存在 dataDir 下，删风格时要按同一个根目录清文件，否则数据删了、图还留在盘上
setImageStyleCoverRoot(dataDir)
configureAgentSkillStorage({ dataDir })

function canWriteDataDir(targetDir) {
  try {
    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })
    accessSync(targetDir, fsConstants.W_OK)
    return true
  } catch {
    return false
  }
}

function resolveDataDir() {
  if (process.env.AI_DATA_DIR) return resolve(process.env.AI_DATA_DIR)
  return canWriteDataDir(DEFAULT_DATA_DIR) ? DEFAULT_DATA_DIR : FALLBACK_DATA_DIR
}

function ensureDataDir() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
}

function providerConfigPath() {
  return join(dataDir, 'ai-providers.json')
}

function tencentCredentialPath() {
  return join(dataDir, 'tencent-ai3d-credentials.enc.json')
}

function tencentCredentialKeyPath() {
  return join(dataDir, '.tencent-ai3d-credentials.key')
}

function credentialEncryptionKey() {
  const configuredKey = String(process.env.AI_CREDENTIAL_ENCRYPTION_KEY || '').trim()
  if (configuredKey) return createHash('sha256').update(configuredKey).digest()
  ensureDataDir()
  const keyPath = tencentCredentialKeyPath()
  if (existsSync(keyPath)) return Buffer.from(readFileSync(keyPath, 'utf8').trim(), 'base64')
  const key = randomBytes(32)
  writeFileSync(keyPath, key.toString('base64'), { encoding: 'utf8', mode: 0o600 })
  return key
}

function readTencentCredentialConfig() {
  try {
    const payload = JSON.parse(readFileSync(tencentCredentialPath(), 'utf8'))
    const key = credentialEncryptionKey()
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
    const text = Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]).toString('utf8')
    const config = JSON.parse(text)
    return {
      secretId: String(config.secretId || '').trim(),
      secretKey: String(config.secretKey || '').trim(),
      region: String(config.region || '').trim(),
      endpoint: String(config.endpoint || '').trim(),
      source: 'secure-store',
    }
  } catch {
    return null
  }
}

function writeTencentCredentialConfig(config = {}) {
  ensureDataDir()
  const key = credentialEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const value = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()])
  writeFileSync(tencentCredentialPath(), JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: value.toString('base64') }, null, 2), { encoding: 'utf8', mode: 0o600 })
}

function reportAgentConfigPath() {
  return join(dataDir, 'report-agent-config.json')
}

function creativeAgentConfigPath() {
  return join(dataDir, 'creative-agent-config.json')
}

function agentCallLogPath() {
  return join(dataDir, 'agent-call-logs.json')
}

// 智能体调用记录（后台「调用记录」页签）。路径走函数，dataDir 变了也能跟上。
const agentCallLog = createAgentCallLog({ resolvePath: agentCallLogPath, limit: 500 })

function h5ReportConfigPath() {
  return join(dataDir, 'h5-report-config.json')
}

function h5ReportDraftConfigPath() {
  return join(dataDir, 'h5-report-draft-config.json')
}

function h5ReportsPath() {
  return join(dataDir, 'h5-reports.json')
}

function h5ReportAssetsDir() {
  return join(dataDir, 'h5-report-assets')
}

function h5VisualTemplateAssetsDir() {
  return join(dataDir, 'h5-visual-template-assets')
}

function promptIconAssetsDir() {
  return join(dataDir, 'prompt-library-icons')
}

function imageStyleCoverAssetsDir() {
  return join(dataDir, 'image-style-covers')
}

function aiSkillCoverAssetsDir() {
  return join(dataDir, 'ai-skill-covers')
}

function workbenchAssetDir() {
  return join(dataDir, 'workbench-assets')
}

function safeH5AssetPart(value = '') {
  const normalized = String(value).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 96)
  return normalized || ''
}

function h5ReportAssetPath(reportId, pageId) {
  const safeReportId = safeH5AssetPart(reportId)
  const safePageId = safeH5AssetPart(pageId)
  if (!safeReportId || !safePageId) return ''
  return join(h5ReportAssetsDir(), safeReportId, `${safePageId}.webp`)
}

function decodeH5PageImage(value = '') {
  const matched = String(value).match(/^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/=]+)$/i)
  if (!matched) return null
  const data = Buffer.from(matched[2], 'base64')
  if (!data.length || data.length > 7 * 1024 * 1024) return null
  return data
}

function decodeH5VisualReferenceImage(value = '') {
  const matched = String(value).match(/^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/=]+)$/i)
  if (!matched) return null
  const data = Buffer.from(matched[2], 'base64')
  if (!data.length || data.length > 8 * 1024 * 1024) return null
  const extension = matched[1].toLowerCase() === 'jpeg' ? 'jpg' : matched[1].toLowerCase()
  return { data, extension }
}

function h5VisualReferenceAssetPath(templateId, pageId, assetId, extension = 'webp') {
  const safeTemplateId = safeH5AssetPart(templateId)
  const safePageId = safeH5AssetPart(pageId)
  const safeAssetId = safeH5AssetPart(assetId)
  if (!safeTemplateId || !safePageId || !safeAssetId || !['png', 'jpg', 'webp'].includes(extension)) return ''
  return join(h5VisualTemplateAssetsDir(), safeTemplateId, safePageId, `${safeAssetId}.${extension}`)
}

function sendH5VisualReferenceAsset(res, templateId, pageId, fileName) {
  const safeTemplateId = safeH5AssetPart(templateId)
  const safePageId = safeH5AssetPart(pageId)
  const safeFileName = basename(fileName)
  if (!safeTemplateId || !safePageId || safeFileName !== fileName || !/^[A-Za-z0-9_-]+\.(png|jpg|webp)$/i.test(safeFileName)) {
    return sendJson(res, 400, { ok: false, message: '参考图资源路径无效。' })
  }
  const root = resolve(h5VisualTemplateAssetsDir())
  const filePath = resolve(root, safeTemplateId, safePageId, safeFileName)
  if (!filePath.startsWith(root) || !existsSync(filePath)) return sendJson(res, 404, { ok: false, message: '参考图资源不存在。' })
  res.writeHead(200, {
    'Content-Type': contentTypeForFile(safeFileName),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  createReadStream(filePath).pipe(res)
}

function promptIconAssetPath(organizationId, fileName) {
  const safeOrganizationId = safeH5AssetPart(organizationId)
  const safeFileName = basename(fileName)
  if (!safeOrganizationId || safeFileName !== fileName || !/^[A-Za-z0-9_-]+\.(png|jpg|webp)$/i.test(safeFileName)) return ''
  return join(promptIconAssetsDir(), safeOrganizationId, safeFileName)
}

function sendPromptIconAsset(res, user, organizationId, fileName) {
  if (!user?.organization?.id || user.organization.id !== organizationId) return sendJson(res, 404, { ok: false, message: '提示词图标资源不存在。' })
  const filePath = promptIconAssetPath(organizationId, fileName)
  const root = resolve(promptIconAssetsDir())
  if (!filePath || !resolve(filePath).startsWith(root) || !existsSync(filePath)) return sendJson(res, 404, { ok: false, message: '提示词图标资源不存在。' })
  res.writeHead(200, { 'Content-Type': contentTypeForFile(fileName), 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' })
  createReadStream(filePath).pipe(res)
}

function imageStyleCoverAssetPath(organizationId, fileName) {
  const safeOrganizationId = safeH5AssetPart(organizationId)
  const safeFileName = basename(fileName)
  if (!safeOrganizationId || safeFileName !== fileName || !/^[A-Za-z0-9_-]+\.(png|jpg|webp)$/i.test(safeFileName)) return ''
  return join(imageStyleCoverAssetsDir(), safeOrganizationId, safeFileName)
}

function sendImageStyleCoverAsset(res, user, organizationId, fileName) {
  // 封面图是面向学生展示的美术素材，平台级风格复制到其他机构后仍要能显示，
  // 所以只校验登录态、不按机构归属拦截；文件名带随机串，无法枚举。
  if (!user) return sendJson(res, 404, { ok: false, message: '风格封面图不存在。' })
  const filePath = imageStyleCoverAssetPath(organizationId, fileName)
  const root = resolve(imageStyleCoverAssetsDir())
  if (!filePath || !resolve(filePath).startsWith(root) || !existsSync(filePath)) return sendJson(res, 404, { ok: false, message: '风格封面图不存在。' })
  res.writeHead(200, { 'Content-Type': contentTypeForFile(fileName), 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' })
  createReadStream(filePath).pipe(res)
}

function aiSkillCoverAssetPath(organizationId, fileName) {
  const safeOrganizationId = safeH5AssetPart(organizationId)
  const safeFileName = basename(fileName)
  if (!safeOrganizationId || safeFileName !== fileName || !/^[A-Za-z0-9_-]+\.(png|jpg|webp)$/i.test(safeFileName)) return ''
  return join(aiSkillCoverAssetsDir(), safeOrganizationId, safeFileName)
}

function sendAiSkillCoverAsset(res, user, organizationId, fileName) {
  // 玩法卡片图是面向学生展示的美术素材，平台级玩法复制到其他机构后仍要能显示，
  // 因此只校验登录态，不再按机构归属拦截；文件名含随机串，无法枚举。
  if (!user) return sendJson(res, 404, { ok: false, message: '玩法卡片图不存在。' })
  const filePath = aiSkillCoverAssetPath(organizationId, fileName)
  const root = resolve(aiSkillCoverAssetsDir())
  if (!filePath || !resolve(filePath).startsWith(root) || !existsSync(filePath)) return sendJson(res, 404, { ok: false, message: '玩法卡片图不存在。' })
  res.writeHead(200, { 'Content-Type': contentTypeForFile(fileName), 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' })
  createReadStream(filePath).pipe(res)
}

// 工作台素材（卡片图 / 背景图 / 背景视频 / LOGO）：只校验登录态，不按机构归属拦截。
// 文件名由服务端生成且带随机串，无法枚举；后台传一次，所有学生看到的都是同一份。
function sendWorkbenchAsset(req, res, user, fileName) {
  // LOGO 例外：登录页在「还没登录」的时候就要显示它，所以 logo-* 不校验登录态。
  // 它只是一张品牌图，不含任何账号信息；文件名带随机串，无法枚举。
  const isBrandLogo = /^logo-/.test(String(fileName || ''))
  if (!user && !isBrandLogo) return sendJson(res, 404, { ok: false, message: '工作台素材不存在。' })
  const filePath = workbenchAssetPath(dataDir, fileName)
  const root = resolve(workbenchAssetDir())
  if (!filePath || !resolve(filePath).startsWith(root) || !existsSync(filePath)) return sendJson(res, 404, { ok: false, message: '工作台素材不存在。' })
  const size = statSync(filePath).size
  // 缓存策略：这些素材文件名带时间戳+随机串，内容永不改写，理论上可以 immutable 缓存一年。
  // 但「删除后仍能读到」会误导后台（以为没删掉），而且换图后如果 CDN/浏览器顽固缓存，
  // 学生端会长期看到旧图。折中：给 1 天强缓存 + 1 周 stale-while-revalidate，
  // 既省流量，又保证换图最迟一天内全站生效。
  const cacheHeaders = {
    'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    'X-Content-Type-Options': 'nosniff',
  }
  // 视频必须支持 Range：不支持的话 iOS 完全不播，桌面 Chrome 也拖不动进度条。
  const range = req.headers.range
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range)
    const start = match?.[1] ? Number(match[1]) : 0
    const end = match?.[2] ? Math.min(Number(match[2]), size - 1) : size - 1
    if (Number.isFinite(start) && Number.isFinite(end) && start <= end) {
      res.writeHead(206, {
        ...cacheHeaders,
        'Content-Type': contentTypeForFile(fileName),
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
      })
      createReadStream(filePath, { start, end }).pipe(res)
      return
    }
  }
  res.writeHead(200, {
    ...cacheHeaders,
    'Content-Type': contentTypeForFile(fileName),
    'Content-Length': size,
    'Accept-Ranges': 'bytes',
  })
  createReadStream(filePath).pipe(res)
}

// 把 AI 生成（或远程）的封面图下载下来，按 3:4 竖卡压成 webp 落盘，返回可访问地址。
async function storeH5WorkflowCoverFromUrl(imageUrl, organizationId) {
  const source = String(imageUrl || '').trim()
  if (!source) return ''
  let buffer = null
  const dataMatch = source.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i)
  if (dataMatch) {
    buffer = Buffer.from(dataMatch[2], 'base64')
  } else if (/^https:\/\//i.test(source)) {
    // 只读取公开 HTTPS 图片（DNS 结果固定、拒绝内网地址），防止被利用去访问服务器内网。
    try {
      buffer = await readRemoteArtwork(source, AbortSignal.timeout(30000))
    } catch (error) {
      console.warn('[h5-workflow] 封面下载失败：', error?.message)
      return ''
    }
  }
  if (!buffer?.length) return ''
  let payload = buffer
  let extension = 'png'
  try {
    payload = await sharp(buffer, { limitInputPixels: 40000000 })
      .rotate()
      .resize({ width: 900, height: 1200, fit: 'cover', position: 'attention', withoutEnlargement: false })
      .webp({ quality: 88 })
      .toBuffer()
    extension = 'webp'
  } catch (error) {
    // 解不开的不是图片，不保存。
    console.warn('[h5-workflow] 封面不是有效图片：', error?.message)
    return ''
  }
  const fileName = `h5-cover-${Date.now()}-${randomBytes(6).toString('hex')}.${extension}`
  const target = aiSkillCoverAssetPath(organizationId, fileName)
  if (!target) return ''
  mkdirSync(resolve(target, '..'), { recursive: true })
  writeFileSync(target, payload)
  return `/api/ai-skill-covers/${encodeURIComponent(organizationId)}/${encodeURIComponent(fileName)}`
}

// 报告页图只能由报告主人写入；已提交（待审核 / 已发布）的报告不能再换图，否则等于绕过了审核。
function assertH5PageWritable(reportId, currentUser) {
  if (AUTH_MODE !== 'server') return
  const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode })
  if (currentUser?.role !== 'student') throw fail('只有小画家账号可以保存自己的报告页面图片。', 403)
  const report = readH5Reports().find((item) => item.id === reportId)
  if (!report) return
  if (report.ownerUserId !== currentUser.id) throw fail('未找到该报告，或当前账号没有权限。', 404)
  if (['pending', 'published'].includes(report.status)) throw fail('报告已经提交，不能再修改页面图片；需要修改请重新生成一份。', 409)
}

function h5PageAssetUrl(shareToken, pageId) {
  return `/api/public/h5-reports/${encodeURIComponent(shareToken)}/pages/${encodeURIComponent(pageId)}`
}

// 工作流结果图是火山/豆包的临时链接（约 24 小时就失效），必须当场落盘。
// 和封面不同，报告页图是整页成品，不能裁成 3:4，只按原比例压一版 webp。
async function storeH5ReportPageFromUrl(imageUrl, reportId, pageId, user = null) {
  const source = String(imageUrl || '').trim()
  if (!source) return null
  let buffer = null
  try {
    const dataMatch = source.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i)
    const assetMatch = source.match(/^\/api\/assets\/([A-Za-z0-9_-]+)$/)
    if (dataMatch) buffer = Buffer.from(dataMatch[2], 'base64')
    // 站内图片按当前账号的权限直接读取；外部地址只接受公开 HTTPS 图片（防止被利用去访问服务器内网）。
    else if (assetMatch && user) buffer = (await getAccessibleAsset(user, assetMatch[1], dataDir)).data
    else if (/^\/api\/agent-images\//.test(source) && user) {
      const dataUrl = agentImageDataUrl(source, { user, dataDir })
      buffer = dataUrl ? Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64') : null
    } else if (/^https:\/\//i.test(source)) buffer = await readRemoteArtwork(source, AbortSignal.timeout(30000))
  } catch (error) {
    console.warn('[h5-report] 结果图读取失败：', error?.message)
    return null
  }
  if (!buffer?.length) return null
  const target = h5ReportAssetPath(reportId, pageId)
  if (!target) return null
  let payload
  try {
    payload = await sharp(buffer, { limitInputPixels: 40000000 }).rotate().webp({ quality: 90 }).toBuffer()
  } catch (error) {
    // 解不开的不是图片，不保存（以前会原样落盘，等于把任意内容当成"页面图片"对外提供）。
    console.warn('[h5-report] 结果图不是有效图片：', error?.message)
    return null
  }
  mkdirSync(resolve(target, '..'), { recursive: true })
  writeFileSync(target, payload)
  return { reportId, pageId, bytes: payload.length }
}


function legacyProviderConfigPath() {
  return join(DEFAULT_DATA_DIR, 'ai-providers.json')
}

function legacyReportAgentConfigPath() {
  return join(DEFAULT_DATA_DIR, 'report-agent-config.json')
}

function legacyH5ReportConfigPath() {
  return join(DEFAULT_DATA_DIR, 'h5-report-config.json')
}

const defaultReportAgentConfig = {
  id: 'report-agent-default',
  name: '项目创作报告智能体',
  type: 'report',
  taskType: 'text',
  status: 'enabled',
  updatedAt: '',
  flowKey: 'report.full',
  allowedModelKeys: [],
  defaultModelKey: '',
  fallbackModelKey: '',
  modelParams: {
    temperature: 0.2,
    timeoutSeconds: 120,
    ratio: '16:9',
    count: 1,
    quality: 'high',
    supportReference: true,
  },
  masterPrompt: '',
  persona: '你是一位懂少儿美术教学、AI创意设计和作品集表达的课程报告讲师。你擅长把小画家的草图、AI绘画、3D、视频和课堂想法整理成清晰、温暖、适合讲师和小画家阅读的PPT报告稿。',
  reportGoal: '生成一份可以直接渲染为16:9 PPT的项目创作报告。报告要呈现课程理解、创作过程、迭代思路、成品亮点、AI点评和讲师评价空间。',
  generationLogic: '先读取项目素材，再判断素材类型和创作阶段，按基础8页组织故事线；有3D或视频素材时增加独立展示页。每页只保留一个表达重点，正文写成适合PPT排版的短句，不要长文堆叠。',
  inputScope: '可读取当前项目的课程信息、草图、线稿、AI迭代图、3D模型、AI视频、创作文本和讲师评语。',
  outputRules: '只输出JSON对象，不输出Markdown或解释。pages数组中的每页必须包含id、type、title、subtitle、body、layout、materials、speakerNotes、teacherCommentSuggestion、exportNote、layoutPlan。layoutPlan必须包含source和slots；slots最多8个，每个slot包含id、type、x、y、w、h、maxChars，坐标使用0-1比例。body使用2-4句短句或用分号分隔的要点。',
  qualityRules: '文字适合16:9 PPT展示，每页一个重点，标题不超过18字，副标题不超过28字，正文不超过120字，避免空话套话；缺少素材时说明缺失原因并使用已有信息补齐。',
  fallbackRules: '当素材缺失或信息不足时，不要编造不存在的素材；用课堂目标、项目名称和已有提示词生成可读内容。',
  pageStructure: '基础页固定为：cover封面、understanding课程项目理解、sketch草图线稿对比、iteration迭代修改流程、finalDesign成品创意说明、aiReview AI专业点评、teacher讲师评语、backCover封底。可按素材追加model3d和video页。',
  difficultyRules: {
    junior: '初级版：短句、儿童口吻、鼓励表达，少用专业术语。',
    starter: '入门版：课堂表达，说明观察、想法和完成结果。',
    advanced: '进阶版：加入构图、色彩、提示词、迭代逻辑和修改原因。',
    pro: '高级版：加入专业参数、分镜、排版、作品集表达和提示词策略。',
  },
  layoutRules: '可用layout：cover-hero、text-focus、before-after、timeline、image-text、review-card、comment、back-cover、model-showcase、storyboard。封面用cover-hero，课程理解用text-focus，草图对比用before-after，迭代过程用timeline，成品展示用image-text，AI点评用review-card，讲师评语用comment，封底用back-cover，3D用model-showcase，视频分镜用storyboard。',
}

const defaultCreativeAgentConfig = {
  version: 1,
  enabled: true,
  name: '初级版绘画小助手',
  edition: 'junior',
  surface: 'paint',
  welcome: '你好！我们一起想一想要画什么吧。你可以直接说，也可以点选小图标。',
  questions: [
    '你想画什么？可以是一只小动物、一个房子，或者任何你喜欢的东西。',
    '它在哪里呢？比如草地、森林、海边或房间。',
    '你希望画面里有什么颜色或特别的小细节？',
  ],
  systemPrompt: '你是初级版少儿 AI 绘画小助手。请把孩子的口语想法整理成适合图像生成的中文提示词。保留孩子明确说出的主体和细节，不引入危险、低俗、侵权或成人内容。表达要简单、温暖，适合 4-6 岁儿童。只输出 JSON 对象，包含 summary、prompt、negativePrompt。',
  defaultNegativePrompt: '画面模糊、主体缺失、畸形、恐怖、暴力、低俗、成人内容',
  voiceInputEnabled: true,
  voiceOutputEnabled: true,
  maxQuestions: 3,
  updatedAt: '',
}

function normalizeCreativeAgentConfig(source = {}) {
  const questions = (Array.isArray(source.questions) ? source.questions : defaultCreativeAgentConfig.questions)
    .map((item) => String(item || '').trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 5)
  const result = {
    ...defaultCreativeAgentConfig,
    ...source,
    version: 1,
    enabled: source.enabled !== false,
    name: String(source.name || defaultCreativeAgentConfig.name).trim().slice(0, 80),
    edition: 'junior',
    surface: 'paint',
    welcome: String(source.welcome || defaultCreativeAgentConfig.welcome).trim().slice(0, 240),
    questions: questions.length ? questions : [...defaultCreativeAgentConfig.questions],
    systemPrompt: String(source.systemPrompt || defaultCreativeAgentConfig.systemPrompt).trim().slice(0, 6000),
    defaultNegativePrompt: String(source.defaultNegativePrompt || defaultCreativeAgentConfig.defaultNegativePrompt).trim().slice(0, 1000),
    voiceInputEnabled: source.voiceInputEnabled !== false,
    voiceOutputEnabled: source.voiceOutputEnabled !== false,
    maxQuestions: Math.min(Math.max(Number(source.maxQuestions || 3), 1), 5),
    updatedAt: String(source.updatedAt || ''),
    canvasAgent: {
      enabled: source.canvasAgent?.enabled !== false,
      name: String(source.canvasAgent?.name || '创作 Agent').trim().slice(0, 80),
      flowKey: 'canvas.assistant',
      model: String(source.canvasAgent?.model || '创作 Agent').trim().slice(0, 120),
      maxActions: Math.min(Math.max(Number(source.canvasAgent?.maxActions || 12), 1), 12),
      prompt: String(source.canvasAgent?.prompt || [source.canvasAgent?.personaPrompt, source.canvasAgent?.responseStyle, source.canvasAgent?.systemPrompt].filter(Boolean).join('\n\n') || '你是一个通用型无限画布工作流助手。信息不足时先提问，不要直接创建节点；信息足够后再规划和执行工作流。').trim().slice(0, 18000),
      personaPrompt: String(source.canvasAgent?.personaPrompt || '你是一名资深的无限画布工作流设计师，善于理解用户目标并把复杂创作拆成清晰、可执行的节点流程。').trim().slice(0, 6000),
      responseStyle: String(source.canvasAgent?.responseStyle || '信息不足时先提问，不创建节点；每次最多提问 3 个关键问题；回答使用简洁中文并说明下一步。').trim().slice(0, 6000),
      systemPrompt: String(source.canvasAgent?.systemPrompt || '分析整张无限画布，需求不完整时先提问，再按依赖顺序创建节点、建立连线并逐步校验。').trim().slice(0, 6000),
      capabilities: { createNode: true, createEdge: true, updateNode: true, moveNode: true, deleteNode: true, deleteEdge: true, runGenerator: true, recognizeRegion: true, groupNodes: true, canvasTemplate: true, addElementReference: true, ...(source.canvasAgent?.capabilities || {}) },
      rules: { reuseNodes: true, askWhenUnclear: true, noQuotaWithoutRequest: true, verifyEachStep: true, ...(source.canvasAgent?.rules || {}) },
    },
  }
  return result
}

function readCreativeAgentConfig() {
  try {
    const configPath = creativeAgentConfigPath()
    if (existsSync(configPath)) return normalizeCreativeAgentConfig(JSON.parse(readFileSync(configPath, 'utf8')))
  } catch {}
  return normalizeCreativeAgentConfig()
}

function writeCreativeAgentConfig(source = {}) {
  const normalized = normalizeCreativeAgentConfig({ ...source, updatedAt: new Date().toISOString() })
  ensureDataDir()
  writeFileSync(creativeAgentConfigPath(), JSON.stringify(normalized, null, 2), 'utf8')
  return normalized
}

const defaultReportOutlineAgentConfig = {
  ...defaultReportAgentConfig,
  id: 'report-agent-outline',
  name: '项目资料整理与PPT大纲智能体',
  type: 'report-outline',
  flowKey: 'report.materialsToOutline',
  reportGoal: '把小画家创作流程、提示词、生成素材和课堂内容整理成项目文档，并拆成适合PPT制作的页面大纲。',
  generationLogic: '先整理项目资料，再输出8页左右PPT大纲。每页只保留一个表达重点，标题短、正文短、图片需求清楚，避免堆砌长段文字。',
  outputRules: '只输出JSON对象，不输出Markdown或解释。必须包含reportDocument、outline、pages。outline和pages中的每页必须包含id、type、title、subtitle、body、layout、materials、imagePrompt、layoutPlan。layoutPlan必须包含source和slots；slots最多8个，每个slot包含id、type、x、y、w、h、maxChars，坐标使用0-1比例。',
}

const defaultPptImageAgentConfig = {
  ...defaultReportAgentConfig,
  id: 'report-agent-ppt-image',
  name: 'Image2 PPT模板生成智能体',
  type: 'ppt-image',
  taskType: 'image',
  flowKey: 'report.image2DeckStyle',
  modelParams: {
    ...defaultReportAgentConfig.modelParams,
    temperature: 0.35,
    timeoutSeconds: 180,
    ratio: '16:9',
    count: 1,
  },
  persona: '你是一位少儿美术PPT视觉设计智能体，擅长把项目报告大纲转成完整PPT页图风格方案。',
  reportGoal: '根据项目文档和PPT大纲生成三版完整PPT页图风格，并在图像模型可用时返回每页可直接铺满16:9幻灯片的图片。',
  generationLogic: '先生成三版风格方向，再按选定方向为封面、过程页、作品页、点评页、封底生成整页PPT图。文字必须短，层级清楚，适合课堂和作品展示。',
  inputScope: '可读取项目文档、PPT大纲、小画家作品图、课程信息、选择的风格模板和图像生成模型能力状态。',
  outputRules: '只输出JSON对象，不输出Markdown或解释。必须包含styleOptions和pages。pages中的每页可包含generatedImage或imageSlide，同时必须包含layoutPlan。layoutPlan必须包含source和slots；slots最多8个，每个slot包含id、type、x、y、w、h、maxChars，坐标使用0-1比例。如果真实Image2不可用，必须返回image2Status.ok=false和清楚原因，不要伪造图片。',
}

const defaultH5FirstPersonReportAgentConfig = {
  ...defaultReportAgentConfig,
  id: 'report-agent-h5-first-person',
  name: 'H5第一人称项目报告智能体',
  type: 'h5-first-person-report',
  flowKey: 'report.h5FirstPerson',
  defaultModelKey: 'deepseek:text:deepseek-v4.1-flash',
  fallbackModelKey: 'agnes:text:agnes-2.5-flash',
  persona: '你是一位懂少儿美术教学、AI创意设计和作品传播表达的H5项目报告讲师。你擅长把小画家的课堂回答、创意想法、手绘草稿、AI提示词、AI出图过程和最终作品，整理成小画家第一人称的完整项目汇报。',
  reportGoal: '生成一份可直接用于H5左右翻页浏览的小画家第一人称项目创作报告。报告要让小画家像在向讲师介绍自己的创作过程，完整呈现课程理解、我的想法、我的草稿、我的提示词、AI生成与调整、最终作品和成长建议。',
  generationLogic: '先按时间线读取小画家项目资料，再从“我学习了什么、我想表达什么、我画了什么草稿、我怎样整理提示词、AI生成了哪些版本、我做了哪些调整、我为什么选择最终作品”组织H5页面。每页只表达一个重点，文字自然、真实、鼓励，不写空泛套话。',
  inputScope: '可读取当前项目的课程信息、课堂回答、创意文字、语音整理、手绘草稿、优化线稿、参考图、AI提示词、AI生成版本、模型来源、最终作品和讲师评语。',
  outputRules: '只输出JSON对象，不输出Markdown或解释。必须包含reportTitle、reportDocument、pages、materialSummary、warnings。pages每页必须包含id、type、title、subtitle、body、layout、materials、speakerNotes、teacherCommentSuggestion、layoutPlan。body必须使用小画家第一人称“我”，每页2-5句，适合H5翻页阅读。不要编造不存在的图片。',
  qualityRules: '第一人称表达必须自然，不像机器总结；能引用小画家原始回答和提示词时优先引用；缺少素材时说明“我还没有上传/生成”，但仍完成报告。标题不超过18字，正文不超过180字。',
  fallbackRules: '素材缺失时不编造图片和经历；用已有课程标题、项目名称、提示词、想法和最终图补齐报告。AI接口失败时前端会使用本地兜底。',
  pageStructure: 'H5页固定建议为：cover封面、course我理解的课程项目、idea我的创意想法、process我的手绘草稿、aiPrompt我的AI提示词、aiProcess我的AI出图过程、finalWork我的最终作品、aiReview AI给我的作品点评、teacherComment讲师给我的成长建议、backCover封底。',
  layoutRules: '可用layout：cover-hero、text-focus、before-after、timeline、image-text、review-card、comment、back-cover。封面用cover-hero，课程理解和创意想法用text-focus，草稿页用before-after，AI出图过程用timeline，最终作品用image-text，AI点评用review-card，讲师评语用comment，封底用back-cover。',
}

const h5ReportModuleKeys = ['cover', 'course', 'idea', 'process', 'aiPrompt', 'aiProcess', 'finalWork', 'aiReview', 'teacherComment', 'backCover', 'inspiration', 'problem', 'sketch', 'ai', 'model', 'scene', 'reflection']
const defaultH5ReportStrategies = [
  { id: 'h5-standard', name: '方案1：标准 H5 报告', type: 'renderer', status: 'enabled', studentSelectable: true, executionReady: true, rendererKey: 'existing-h5-renderer', workflowId: '', workflowVersion: 0 },
  {
    id: 'h5-canvas-workflow', name: '方案2：无限画布工作流报告', type: 'canvas-workflow', status: 'testing',
    studentSelectable: false, executionReady: false, rendererKey: 'canvas-workflow-renderer', workflowId: '', workflowVersion: 0,
    adapterKey: 'h5-report-canvas-adapter', boundTemplateIds: [],
    inputPolicy: { text: 'report-document', images: 'all-project-materials', template: 'selected-h5-template' },
    outputPolicy: { resultType: 'page-images', maxPages: 12, ratio: '9:16', requireImageResult: true },
  },
]
const defaultH5ReportTemplates = [
  { id: 'h5-product-design-story', strategyId: 'h5-standard', name: '我的产品设计故事', layout: 'product-design-story', description: '高级版小画家第一人称讲述产品灵感、草图、AI方案、3D验证与真实使用场景。', status: 'published', theme: { primary: '#1559d6', secondary: '#0bd0e8', accent: '#f59a23', background: '#eef5ff', surface: '#ffffff', text: '#163565' }, fontFamily: 'Microsoft YaHei', contentDensity: 'standard', coverImage: '/assets/h5-report/product-design-story.png', pageMode: 'paged', storyPreset: 'product-design-story', renderVersion: 2, pageDesigns: { cover: { enabled: true, variant: 'cover-student-product-a', backgroundStyle: 'blueprint-collage', characterPose: 'presenting', characterPosition: 'left-bottom' }, inspiration: { enabled: true, variant: 'inspiration-board-a', backgroundStyle: 'research-collage', characterPose: 'thinking' }, problem: { enabled: true, variant: 'problem-cards-a', backgroundStyle: 'sticky-notes', characterPose: 'pointing' }, sketch: { enabled: true, variant: 'sketch-compare-a', backgroundStyle: 'blueprint-paper', characterPose: 'drawing' }, ai: { enabled: true, variant: 'ai-compare-a', backgroundStyle: 'ai-connection', characterPose: 'comparing' }, model: { enabled: true, variant: 'model-showcase-a', backgroundStyle: 'model-grid', characterPose: 'presenting-3d' }, scene: { enabled: true, variant: 'scene-immersive-a', backgroundStyle: 'scene-extend', characterPose: 'explaining' }, reflection: { enabled: true, variant: 'reflection-timeline-a', backgroundStyle: 'blueprint-paper', characterPose: 'thumbs-up' } }, minPages: 6, maxPages: 12, moduleOrder: ['cover', 'inspiration', 'problem', 'sketch', 'ai', 'model', 'scene', 'reflection'], hiddenModules: [], officialButtonText: '进入官网', officialUrl: '', builtIn: true },
  { id: 'h5-kids-classroom', name: '童趣课堂报告', layout: 'kids-classroom', description: '适合入门版儿童创意美术、涂鸦和课堂展示。', status: 'published', theme: { primary: '#1677ff', secondary: '#20c7d9', accent: '#ff7a00', background: '#f5f9ff', surface: '#ffffff', text: '#1f3150' }, fontFamily: 'Microsoft YaHei', contentDensity: 'relaxed', coverImage: '/assets/h5-report/kids-classroom.png', moduleOrder: h5ReportModuleKeys, hiddenModules: [], officialButtonText: '进入官网', officialUrl: '', builtIn: true },
  { id: 'h5-art-gallery', name: '艺术展览报告', layout: 'art-gallery', description: '适合高级版正式作品展示和对外分享。', status: 'published', theme: { primary: '#18233b', secondary: '#0f766e', accent: '#d6b16b', background: '#f7f9fc', surface: '#ffffff', text: '#27364f' }, fontFamily: 'Microsoft YaHei', contentDensity: 'relaxed', coverImage: '/assets/h5-report/art-gallery.png', moduleOrder: h5ReportModuleKeys, hiddenModules: [], officialButtonText: '进入官网', officialUrl: '', builtIn: true },
  { id: 'h5-growth-file', name: '成长档案报告', layout: 'growth-file', description: '适合高级版过程记录、草图对比和阶段成长。', status: 'published', theme: { primary: '#6d4aff', secondary: '#19b6a6', accent: '#f3b64a', background: '#f7f6ff', surface: '#ffffff', text: '#2f315d' }, fontFamily: 'Microsoft YaHei', contentDensity: 'standard', coverImage: '/assets/h5-report/growth-file.png', moduleOrder: h5ReportModuleKeys, hiddenModules: [], officialButtonText: '进入官网', officialUrl: '', builtIn: true },
  { id: 'h5-ai-tech', name: 'AI科技报告', layout: 'ai-tech', description: '适合高级版AI绘画、数字艺术、3D和视频项目。', status: 'published', theme: { primary: '#1368ff', secondary: '#17c7e5', accent: '#8b5cf6', background: '#07162e', surface: '#10254c', text: '#eaf5ff' }, fontFamily: 'Microsoft YaHei', contentDensity: 'standard', coverImage: '/assets/h5-report/ai-tech.png', moduleOrder: h5ReportModuleKeys, hiddenModules: [], officialButtonText: '进入官网', officialUrl: '', builtIn: true },
]

function defaultH5ReportConfig() {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    strategies: defaultH5ReportStrategies,
    templates: defaultH5ReportTemplates,
    editions: {
      junior: { status: 'unconfigured', rendererKey: '', defaultStrategyId: 'h5-standard', allowedStrategyIds: ['h5-standard'], defaultTemplateId: '', allowedTemplateIds: [], studentCanChoose: false, contentProfile: 'starter-self-narration', agentId: 'report-agent-h5-first-person', auditPolicy: 'h5-default-auto' },
      starter: { status: 'enabled', rendererKey: 'starter-simple', defaultStrategyId: 'h5-standard', allowedStrategyIds: ['h5-standard'], defaultTemplateId: 'h5-kids-classroom', allowedTemplateIds: ['h5-kids-classroom'], studentCanChoose: false, contentProfile: 'starter-self-narration', agentId: 'report-agent-h5-first-person', auditPolicy: 'h5-default-auto' },
      advanced: { status: 'unconfigured', rendererKey: '', defaultStrategyId: 'h5-standard', allowedStrategyIds: ['h5-standard'], defaultTemplateId: '', allowedTemplateIds: [], studentCanChoose: false, contentProfile: 'advanced-portfolio', agentId: 'report-agent-h5-first-person', auditPolicy: 'h5-default-auto' },
      pro: { status: 'enabled', rendererKey: 'pro-workbench', defaultStrategyId: 'h5-standard', allowedStrategyIds: ['h5-standard'], defaultTemplateId: 'h5-product-design-story', allowedTemplateIds: ['h5-product-design-story', 'h5-ai-tech', 'h5-art-gallery', 'h5-growth-file'], studentCanChoose: true, contentProfile: 'pro-designer-story', agentId: 'report-agent-h5-first-person', auditPolicy: 'h5-default-auto' },
    },
  }
}

function normalizeH5Template(template = {}, index = 0) {
  const seed = defaultH5ReportTemplates.find((item) => item.id === template.id) || defaultH5ReportTemplates[index % defaultH5ReportTemplates.length]
  const allowedLayouts = new Set(['kids-classroom', 'art-gallery', 'growth-file', 'ai-tech', 'product-design-story'])
  const isProductDesignStory = (template.layout || seed.layout) === 'product-design-story'
  const storyModuleOrder = ['cover', 'inspiration', 'problem', 'sketch', 'ai', 'model', 'scene', 'reflection']
  const requestedModuleOrder = Array.isArray(template.moduleOrder) ? template.moduleOrder.filter((key) => h5ReportModuleKeys.includes(key)) : []
  const hasStoryModuleOrder = requestedModuleOrder.some((key) => storyModuleOrder.includes(key) && key !== 'cover')
  const moduleOrder = isProductDesignStory && !hasStoryModuleOrder ? storyModuleOrder : requestedModuleOrder
  const requestedStoryOrder = Array.isArray(template.visualGeneration?.storyOrder)
    ? [...new Set(template.visualGeneration.storyOrder.filter((key) => storyModuleOrder.includes(key)))]
    : []
  return {
    ...seed,
    ...template,
    id: String(template.id || seed.id),
    strategyId: String(template.strategyId || seed.strategyId || 'h5-standard'),
    designDocument: normalizeH5Design(template.designDocument),
    name: String(template.name || seed.name),
    layout: allowedLayouts.has(template.layout) ? template.layout : seed.layout,
    status: ['published', 'draft', 'disabled'].includes(template.status) ? template.status : 'draft',
    theme: { ...seed.theme, ...(template.theme || {}) },
    contentDensity: ['relaxed', 'standard', 'compact'].includes(template.contentDensity) ? template.contentDensity : (seed.contentDensity || 'standard'),
    pageMode: template.pageMode === 'paged' ? 'paged' : (seed.pageMode || 'paged'),
    storyPreset: String(template.storyPreset || seed.storyPreset || ''),
    renderVersion: Number(template.renderVersion || seed.renderVersion || (isProductDesignStory ? 2 : 1)),
    visualGeneration: {
      enabled: template.visualGeneration?.enabled === true,
      mode: template.visualGeneration?.mode === 'structured' ? 'structured' : 'full-page',
      storyOrder: requestedStoryOrder.length ? requestedStoryOrder : storyModuleOrder,
    },
    pageDesigns: { ...(seed.pageDesigns || {}), ...(template.pageDesigns || {}) },
    minPages: Math.max(1, Math.min(12, Number(template.minPages || seed.minPages || 6))),
    maxPages: Math.max(6, Math.min(12, Number(template.maxPages || seed.maxPages || 12))),
    displayOptions: {
      studentInfo: template.displayOptions?.studentInfo !== false,
      chapterNav: template.displayOptions?.chapterNav !== false,
      social: template.displayOptions?.social !== false,
      download: template.displayOptions?.download !== false,
      official: template.displayOptions?.official !== false,
    },
    coverImage: String(template.coverImage || seed.coverImage || ''),
    previewImages: Array.isArray(template.previewImages) ? template.previewImages.filter(Boolean).slice(0, 6) : [],
    posterConfig: {
      backgroundImage: String(template.posterConfig?.backgroundImage || template.coverImage || seed.coverImage || ''),
      titleAlign: ['left', 'center', 'right'].includes(template.posterConfig?.titleAlign) ? template.posterConfig.titleAlign : 'left',
      showStudentInfo: template.posterConfig?.showStudentInfo !== false,
      showBrand: template.posterConfig?.showBrand !== false,
      qrPosition: ['bottom-left', 'bottom-right'].includes(template.posterConfig?.qrPosition) ? template.posterConfig.qrPosition : 'bottom-right',
    },
    moduleOrder: [...new Set(moduleOrder)].concat(h5ReportModuleKeys.filter((key) => !moduleOrder.includes(key))),
    hiddenModules: Array.isArray(template.hiddenModules) ? [...new Set(template.hiddenModules.filter((key) => h5ReportModuleKeys.includes(key)))] : [],
    builtIn: Boolean(template.builtIn ?? seed.builtIn),
  }
}

function normalizeH5ReportConfig(config = {}) {
  const defaults = defaultH5ReportConfig()
  const configuredStrategies = Array.isArray(config.strategies) ? config.strategies : []
  const strategies = defaults.strategies.map((fallback) => {
    const source = configuredStrategies.find((item) => item.id === fallback.id) || {}
    return {
      ...fallback,
      ...source,
      id: fallback.id,
      name: String(source.name || fallback.name),
      status: ['enabled', 'testing', 'disabled'].includes(source.status) ? source.status : fallback.status,
      studentSelectable: source.studentSelectable === true,
      executionReady: source.executionReady === true || fallback.executionReady === true,
      workflowId: String(source.workflowId || fallback.workflowId || ''),
      workflowVersion: Math.max(0, Number(source.workflowVersion || fallback.workflowVersion || 0)),
      adapterKey: fallback.type === 'canvas-workflow' ? 'h5-report-canvas-adapter' : '',
      boundTemplateIds: Array.isArray(source.boundTemplateIds) ? [...new Set(source.boundTemplateIds.map(String))] : (fallback.boundTemplateIds || []),
      inputPolicy: fallback.type === 'canvas-workflow' ? { ...fallback.inputPolicy } : undefined,
      outputPolicy: fallback.type === 'canvas-workflow' ? {
        ...fallback.outputPolicy,
        maxPages: Math.max(1, Math.min(12, Number(source.outputPolicy?.maxPages || fallback.outputPolicy.maxPages))),
        ratio: '9:16',
        requireImageResult: true,
      } : undefined,
    }
  })
  const strategyIds = new Set(strategies.map((item) => item.id))
  const configuredTemplates = Array.isArray(config.templates) && config.templates.length ? config.templates.map(normalizeH5Template) : []
  const configuredTemplateIds = new Set(configuredTemplates.map((item) => item.id))
  // 保证已有服务端配置升级后也能获得新增的官方模板，避免旧配置把新模板永久挡在学生端之外。
  const templates = [
    ...defaults.templates.filter((item) => !configuredTemplateIds.has(item.id)).map(normalizeH5Template),
    ...configuredTemplates,
  ]
  const templateIds = new Set(templates.map((item) => item.id))
  strategies.forEach((strategy) => {
    strategy.boundTemplateIds = (strategy.boundTemplateIds || []).filter((id) => templateIds.has(id))
  })
  templates.forEach((template) => {
    if (!strategyIds.has(template.strategyId)) template.strategyId = 'h5-standard'
  })
  const editions = Object.fromEntries(Object.entries(defaults.editions).map(([key, fallback]) => {
    const source = config.editions?.[key] || {}
    const savedAllowedTemplateIds = Array.isArray(source.allowedTemplateIds) ? source.allowedTemplateIds : []
    // 新增的官方模板需要向已有版本配置做一次安全补齐；自定义模板仍保留管理员原有授权。
    const allowedTemplateIds = [...new Set([...fallback.allowedTemplateIds, ...savedAllowedTemplateIds])].filter((id) => templateIds.has(id))
    const allowedStrategyIds = [...new Set([...(fallback.allowedStrategyIds || []), ...(Array.isArray(source.allowedStrategyIds) ? source.allowedStrategyIds : [])])].filter((id) => strategyIds.has(id))
    const defaultStrategyId = allowedStrategyIds.includes(source.defaultStrategyId) ? source.defaultStrategyId : (allowedStrategyIds[0] || fallback.defaultStrategyId || 'h5-standard')
    const defaultTemplateId = templateIds.has(source.defaultTemplateId) ? source.defaultTemplateId : (allowedTemplateIds[0] || fallback.defaultTemplateId || '')
    return [key, {
      ...fallback,
      ...source,
      status: ['enabled', 'unconfigured', 'disabled'].includes(source.status) ? source.status : fallback.status,
      allowedTemplateIds,
      allowedStrategyIds,
      defaultStrategyId,
      defaultTemplateId,
      studentCanChoose: source.studentCanChoose === true,
    }]
  }))
  return { version: 2, updatedAt: config.updatedAt || defaults.updatedAt, strategies, templates, editions }
}

const defaultReportAgentDefaults = [
  defaultReportOutlineAgentConfig,
  defaultPptImageAgentConfig,
  defaultH5FirstPersonReportAgentConfig,
]

const reportAgentFlows = [
  { key: 'report.h5FirstPerson', label: 'H5报告 / 第一人称项目汇报' },
  { key: 'report.materialsToOutline', label: '项目报告 / 整理资料生成PPT大纲' },
  { key: 'report.image2DeckStyle', label: '项目报告 / Image2生成三版PPT页图' },
  { key: 'report.fullPptImageDeck', label: '项目报告 / 一键生成图片型PPT' },
  { key: 'report.full', label: '项目报告 / 一键生成完整报告' },
  { key: 'report.rewritePage', label: '项目报告 / 单页重写' },
  { key: 'report.youngMode', label: '初级/入门报告生成' },
  { key: 'report.advancedMode', label: '进阶/高级报告生成' },
  { key: 'report.exportCopy', label: '导出说明/讲稿预留' },
  { key: 'paint.promptOptimize', label: 'AI绘画 / 提示词优化' },
  { key: 'paint.sketchUnderstand', label: 'AI绘画 / 草图理解' },
  { key: 'paint.preGenerateAudit', label: 'AI绘画 / 图像生成前审核' },
  { key: 'course.parse', label: '课程中心 / 课程内容解析' },
  { key: 'course.studentAnswer', label: '课程中心 / 小画家回答整理' },
  { key: 'video.storyboard', label: 'AI视频 / 分镜脚本生成' },
  { key: 'video.cameraPrompt', label: 'AI视频 / 运镜参数建议' },
  { key: 'model3d.description', label: '3D生成 / 模型说明生成' },
  { key: 'model3d.parameters', label: '3D生成 / 参数建议' },
  { key: 'audit.text', label: '内容审核 / 文本审核' },
  { key: 'audit.materialRisk', label: '内容审核 / 素材风险提示' },
]

// 供应商「参考图（上游图 / 标记元素图）传输协议」声明。
// 这里是全项目唯一决定“上游图到底能不能送到模型”的地方：
//   新增供应商时必须显式声明 imageInput；未声明时按 OpenAI 兼容（顶层 image 字段）处理，
//   并由 generateImages() 的守卫兜底告警，绝不允许再出现“静默丢弃上游图”。
// 可选 mode：
//   body-field       —— 请求体顶层写一个字段（火山方舟：image，支持 string 或数组）
//   extra-body-image —— 写进 extra_body.image 数组（Agnes）
//   edits            —— 必须换到 /images/edits 走 multipart 上传（OpenAI gpt-image-1）
//   none             —— 明确不支持参考图；用户仍传图时直接报错，而不是悄悄丢掉
const PROVIDER_IMAGE_INPUT_MODES = ['body-field', 'extra-body-image', 'edits', 'none']
const DEFAULT_PROVIDER_IMAGE_INPUT = { mode: 'body-field', field: 'image', maxImages: 4 }

const providers = {
  hunyuan3d: {
    label: '腾讯混元3D',
    category: 'model3d',
    baseUrl: '腾讯云 AI3D 服务（TC3 签名）',
    apiKey: process.env.TENCENTCLOUD_SECRET_ID && process.env.TENCENTCLOUD_SECRET_KEY ? 'server-configured' : '',
    models: ['3.1', '3.0'],
    defaultModel: process.env.TENCENT_AI3D_MODEL || '3.1',
    defaultEdition: 'rapid',
    editions: { rapid: true, pro: true },
    enabled: true,
    custom: false,
    imageInput: { mode: 'none' },
  },
  openai: {
    label: 'OpenAI',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.OPENAI_API_KEY || '',
    imageModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
    textModel: process.env.OPENAI_TEXT_MODEL || 'gpt-4.1-mini',
    // gpt-image-1 不能在 /images/generations 里传图，必须走 /images/edits（multipart）。
    imageInput: { mode: 'edits', maxImages: 1 },
  },
  volcengine: {
    label: '火山方舟',
    baseUrl: process.env.VOLCENGINE_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    apiKey: process.env.VOLCENGINE_API_KEY || process.env.ARK_API_KEY || '',
    imageModel: process.env.VOLCENGINE_IMAGE_MODEL || 'doubao-seedream-4-0-250828',
    textModel: process.env.VOLCENGINE_TEXT_MODEL || process.env.ARK_TEXT_MODEL || 'doubao-seed-1-6-250615',
    // doubao-seedream-4.x：顶层 image 参数，支持 string 或数组（URL 或 data:image/*;base64,）。
    imageInput: { mode: 'body-field', field: 'image', maxImages: 10 },
  },
  agnes: {
    label: 'Agnes AI',
    baseUrl: process.env.AGNES_BASE_URL || 'https://apihub.agnes-ai.com/v1',
    apiKey: process.env.AGNES_API_KEY || '',
    imageModel: process.env.AGNES_IMAGE_MODEL || 'agnes-image-2.0-flash',
    videoModel: process.env.AGNES_VIDEO_MODEL || 'agnes-video-v2.0',
    textModel: process.env.AGNES_TEXT_MODEL || 'gpt-4o-mini',
    imageInput: { mode: 'extra-body-image', maxImages: 4 },
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    imageModel: '',
    videoModel: '',
    textModel: process.env.DEEPSEEK_TEXT_MODEL || 'deepseek-chat',
    imageInput: { mode: 'none' },
  },
}

function readProviderConfig() {
  try {
    const configPath = providerConfigPath()
    if (!existsSync(configPath)) {
      const legacyPath = legacyProviderConfigPath()
      if (dataDir !== DEFAULT_DATA_DIR && existsSync(legacyPath)) return JSON.parse(readFileSync(legacyPath, 'utf8'))
      return {}
    }
    return JSON.parse(readFileSync(configPath, 'utf8'))
  } catch {
    try {
      const legacyPath = legacyProviderConfigPath()
      if (dataDir !== DEFAULT_DATA_DIR && existsSync(legacyPath)) return JSON.parse(readFileSync(legacyPath, 'utf8'))
    } catch {}
    return {}
  }
}

function writeProviderConfig(config) {
  try {
    ensureDataDir()
    writeFileSync(providerConfigPath(), JSON.stringify(config, null, 2), 'utf8')
  } catch (error) {
    if (dataDir !== FALLBACK_DATA_DIR && ['EACCES', 'EPERM'].includes(error?.code)) {
      dataDir = FALLBACK_DATA_DIR
      setImageStyleCoverRoot(dataDir)
      configureAgentSkillStorage({ dataDir })
      ensureDataDir()
      writeFileSync(providerConfigPath(), JSON.stringify(config, null, 2), 'utf8')
      return
    }
    throw error
  }
}

function normalizeProviderKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function providerField(body, field, ...fallbacks) {
  if (Object.prototype.hasOwnProperty.call(body, field)) return String(body[field] || '').trim()
  const fallback = fallbacks.find((item) => item !== undefined && item !== null && String(item).trim())
  return fallback ? String(fallback).trim() : ''
}

function normalizeModelList(value, ...fallbacks) {
  const source = Array.isArray(value) ? value : []
  const defaults = fallbacks.flatMap((item) => Array.isArray(item) ? item : [item])
  return [...source, ...defaults]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 100)
}

function providerModelList(provider = {}, capability) {
  const field = `${capability}Models`
  const defaultField = `${capability}Model`
  return normalizeModelList(provider[field], provider[defaultField], inferredCapabilityModels(provider, capability))
}

// 后台「模型列表」里还没归到 图像 / 视频 / 文字 的模型，按 inferModelCapability 推断归类（见 server/provider-models.js），
// 免得「后台配好了、用户端看不到」。3D 平台的 models 是版本号，不推断。
function inferredCapabilityModels(provider = {}, capability) {
  if (provider.category === 'model3d' || provider.key === 'hunyuan3d') return []
  const assigned = new Set(['image', 'video', 'text'].flatMap((kind) => normalizeModelList(provider[`${kind}Models`], provider[`${kind}Model`])))
  return normalizeModelList(provider.models, provider.defaultModel)
    .filter((model) => !assigned.has(model) && inferModelCapability(model, provider.capabilities) === capability)
}

// 后台「官方水印开关」管哪些平台：火山方舟预置平台，以及 Base URL 指向方舟（*.volces.com）的自建平台。
function providerHasArkWatermark(key, provider = {}) {
  return key === 'volcengine' || isArkHostedBaseUrl(provider.baseUrl)
}

function providerUnifiedModelList(provider = {}) {
  return normalizeModelList(
    provider.models,
    provider.defaultModel,
    provider.textModels,
    provider.imageModels,
    provider.videoModels,
    provider.textModel,
    provider.imageModel,
    provider.videoModel,
  )
}

function providerModelField(body, capability, current = {}, preset = {}) {
  const listField = `${capability}Models`
  const defaultField = `${capability}Model`
  if (Object.prototype.hasOwnProperty.call(body, listField)) {
    return normalizeModelList(body[listField], body[defaultField])
  }
  return normalizeModelList(
    current[listField],
    current[defaultField],
    preset[listField],
    preset[defaultField],
  )
}

// 参考图协议的后台保存规则：body 显式传了合法声明就用 body 的；
// 否则沿用已保存的；再否则沿用代码预设，绝不允许因为一次不完整提交把声明弄丢。
function providerImageInputField(body, current = {}, preset = {}) {
  if (Object.prototype.hasOwnProperty.call(body, 'imageInput')) {
    // 后台选「自动识别」时传 null 或 { mode: 'auto' }：清掉手动指定，交给自动识别（预置平台回到代码里的预设）
    if (body.imageInput === null || body.imageInput?.mode === 'auto') return null
    const fromBody = normalizeImageInputSpec(body.imageInput)
    if (fromBody) return fromBody
  }
  return normalizeImageInputSpec(current.imageInput)
    || normalizeImageInputSpec(preset.imageInput)
    || null
}

function providerUnifiedModelField(body, current = {}, preset = {}) {
  if (Object.prototype.hasOwnProperty.call(body, 'models')) {
    return normalizeModelList(body.models, body.defaultModel)
  }
  return normalizeModelList(
    current.models,
    current.defaultModel,
    current.textModels,
    current.imageModels,
    current.videoModels,
    current.textModel,
    current.imageModel,
    current.videoModel,
    preset.models,
    preset.defaultModel,
    preset.textModel,
    preset.imageModel,
    preset.videoModel,
  )
}

function providerHasModel(provider = {}, capability) {
  return providerModelList(provider, capability).length > 0
}

function modelEnabled(provider, model) {
  return provider.enabled !== false && !normalizeModelList(provider.disabledModels).includes(String(model || '').trim())
}

function availableProviderModels(provider, capability) {
  return normalizeModelList([], provider[`${capability}Model`], providerModelList(provider, capability))
    .filter((model) => modelEnabled(provider, model))
}

function requireModelEnabled(provider, model) {
  if (!modelEnabled(provider, model)) {
    const error = new Error(`模型 ${model || provider.label} 已在后台关闭，请刷新页面并选择其他模型`)
    error.statusCode = 403
    throw error
  }
}

async function fetchProviderModels(provider) {
  requireApiKey(provider)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const response = await fetch(`${String(provider.baseUrl || '').replace(/\/+$/, '')}/models`, {
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      signal: controller.signal,
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(upstreamErrorMessage(provider, response.status, data))
      error.statusCode = response.status
      error.upstreamStatus = response.status
      throw error
    }
    const models = normalizeModelList(
      Array.isArray(data?.data) ? data.data.map((item) => item?.id || item?.name) : data?.models,
    )
    if (!models.length) {
      const error = new Error(`${provider.label} 未返回可识别的模型列表`)
      error.statusCode = 502
      throw error
    }
    return models
  } catch (error) {
    if (error.statusCode) throw error
    throw createUpstreamNetworkError(provider, '/models', error)
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeSingleReportAgent(agent = {}, index = 0) {
  const now = new Date().toISOString()
  const taskType = textValue(agent.taskType, agent.type === 'ppt-image' ? 'image' : 'text')
  const allowedModelKeys = Array.isArray(agent.allowedModelKeys) ? agent.allowedModelKeys.map((item) => textValue(item)).filter(Boolean) : []
  const modelParams = {
    temperature: Number.isFinite(Number(agent.modelParams?.temperature)) ? Number(agent.modelParams.temperature) : defaultReportAgentConfig.modelParams.temperature,
    timeoutSeconds: Number.isFinite(Number(agent.modelParams?.timeoutSeconds)) ? Number(agent.modelParams.timeoutSeconds) : defaultReportAgentConfig.modelParams.timeoutSeconds,
    ratio: textValue(agent.modelParams?.ratio, defaultReportAgentConfig.modelParams.ratio),
    count: Math.min(Math.max(Number(agent.modelParams?.count || defaultReportAgentConfig.modelParams.count || 1), 1), MAX_GENERATION_COUNT),
    quality: textValue(agent.modelParams?.quality, defaultReportAgentConfig.modelParams.quality),
    supportReference: agent.modelParams?.supportReference !== false,
  }
  return {
    ...defaultReportAgentConfig,
    ...agent,
    id: textValue(agent.id, index === 0 ? defaultReportAgentConfig.id : `report-agent-${Date.now()}-${index}`),
    name: textValue(agent.name, index === 0 ? defaultReportAgentConfig.name : `报告智能体 ${index + 1}`),
    type: textValue(agent.type, 'report'),
    taskType,
    status: ['enabled', 'disabled'].includes(agent.status) ? agent.status : 'enabled',
    updatedAt: agent.updatedAt || now,
    flowKey: textValue(agent.flowKey, defaultReportAgentConfig.flowKey),
    allowedModelKeys,
    defaultModelKey: textValue(agent.defaultModelKey, ''),
    fallbackModelKey: textValue(agent.fallbackModelKey, ''),
    modelParams,
    masterPrompt: textValue(agent.masterPrompt, ''),
    inputScope: textValue(agent.inputScope, defaultReportAgentConfig.inputScope),
    qualityRules: textValue(agent.qualityRules, defaultReportAgentConfig.qualityRules),
    fallbackRules: textValue(agent.fallbackRules, defaultReportAgentConfig.fallbackRules),
    difficultyRules: {
      ...defaultReportAgentConfig.difficultyRules,
      ...(agent.difficultyRules || {}),
    },
  }
}

function defaultReportAgentState() {
  const agents = defaultReportAgentDefaults.map((agent, index) => normalizeSingleReportAgent(agent, index))
  const outlineAgent = agents.find((agent) => agent.type === 'report-outline') || agents[0]
  const pptImageAgent = agents.find((agent) => agent.type === 'ppt-image') || outlineAgent
  const bindings = Object.fromEntries(reportAgentFlows.map((flow) => [flow.key, outlineAgent.id]))
  bindings['report.image2DeckStyle'] = pptImageAgent.id
  bindings['report.fullPptImageDeck'] = pptImageAgent.id
  bindings['report.h5FirstPerson'] = agents.find((agent) => agent.type === 'h5-first-person-report')?.id || outlineAgent.id
  return {
    agents,
    bindings,
    activeAgentId: outlineAgent.id,
    flows: reportAgentFlows,
  }
}

function normalizeReportAgentConfig(config = {}) {
  if (!Array.isArray(config.agents)) {
    const legacyAgent = normalizeSingleReportAgent(config, 0)
    const defaultState = defaultReportAgentState()
    const agents = [legacyAgent, ...defaultState.agents.filter((agent) => agent.id !== legacyAgent.id)]
    const bindings = { ...defaultState.bindings, 'report.full': legacyAgent.id }
    return {
      agents,
      bindings,
      activeAgentId: legacyAgent.id,
      flows: reportAgentFlows,
    }
  }

  const defaultState = defaultReportAgentState()
  const agents = config.agents.length
    ? config.agents.map((agent, index) => normalizeSingleReportAgent(agent, index))
    : defaultState.agents
  // 以前这里会把默认的 5 个智能体强行补回列表，老师删了下次读配置又复活。
  // 现在只在「一个都不剩」时兜底：老师只留一个学生端智能体，就真的只有一个。
  if (!agents.length) agents.push(...defaultState.agents)
  const enabledFallback = agents.find((agent) => agent.status === 'enabled') || agents[0]
  const validIds = new Set(agents.map((agent) => agent.id))
  const incomingBindings = config.bindings || {}
  const bindings = Object.fromEntries(reportAgentFlows.map((flow) => {
    const candidate = incomingBindings[flow.key]
    const defaultCandidate = defaultState.bindings[flow.key]
    return [flow.key, validIds.has(candidate) ? candidate : validIds.has(defaultCandidate) ? defaultCandidate : enabledFallback.id]
  }))
  agents.forEach((agent) => {
    if (!reportAgentFlows.some((flow) => flow.key === agent.flowKey)) {
      const boundFlow = reportAgentFlows.find((flow) => bindings[flow.key] === agent.id)
      agent.flowKey = boundFlow?.key || 'report.full'
    }
  })
  const activeAgentId = validIds.has(config.activeAgentId) ? config.activeAgentId : enabledFallback.id
  return { agents, bindings, activeAgentId, flows: reportAgentFlows }
}

function readReportAgentConfig() {
  try {
    const configPath = reportAgentConfigPath()
    if (!existsSync(configPath)) {
      const legacyPath = legacyReportAgentConfigPath()
      if (dataDir !== DEFAULT_DATA_DIR && existsSync(legacyPath)) {
        return normalizeReportAgentConfig(JSON.parse(readFileSync(legacyPath, 'utf8')))
      }
      return normalizeReportAgentConfig()
    }
    return normalizeReportAgentConfig(JSON.parse(readFileSync(configPath, 'utf8')))
  } catch {
    try {
      const legacyPath = legacyReportAgentConfigPath()
      if (dataDir !== DEFAULT_DATA_DIR && existsSync(legacyPath)) {
        return normalizeReportAgentConfig(JSON.parse(readFileSync(legacyPath, 'utf8')))
      }
    } catch {}
    return normalizeReportAgentConfig()
  }
}

function readH5ReportConfig() {
  try {
    const configPath = h5ReportConfigPath()
    if (!existsSync(configPath)) {
      const legacyPath = legacyH5ReportConfigPath()
      if (dataDir !== DEFAULT_DATA_DIR && existsSync(legacyPath)) return normalizeH5ReportConfig(JSON.parse(readFileSync(legacyPath, 'utf8')))
      return defaultH5ReportConfig()
    }
    return normalizeH5ReportConfig(JSON.parse(readFileSync(configPath, 'utf8')))
  } catch {
    return defaultH5ReportConfig()
  }
}

function coursePptAssetRoot() {
  const root = join(dataDir, 'course-ppt-assets')
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  return root
}

function courseVideoAssetRoot() {
  const root = join(dataDir, 'course-video-assets')
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  return root
}

function runFileCommand(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(command, args, { timeout: options.timeout || 120000, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        rejectPromise(error)
        return
      }
      resolvePromise({ stdout, stderr })
    })
  })
}

async function runFirstAvailableCommand(candidates, args, options = {}) {
  const errors = []
  for (const command of candidates.filter(Boolean)) {
    try {
      const result = await runFileCommand(command, args, options)
      return { command, ...result }
    } catch (error) {
      errors.push({
        command,
        code: error.code || '',
        message: error.message || '',
        stderr: error.stderr || '',
      })
      if (!['ENOENT', 'UNKNOWN'].includes(error.code)) break
    }
  }
  const error = new Error(options.missingMessage || 'converter command is unavailable')
  error.diagnostic = errors
  throw error
}

function libreOfficeCandidates() {
  return [
    process.env.PPT_CONVERTER_BIN,
    process.env.LIBREOFFICE_BIN,
    'soffice',
    'libreoffice',
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ]
}

function pdfRenderCandidates() {
  const codexRuntimePdftoppmExe = process.env.USERPROFILE
    ? join(process.env.USERPROFILE, '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'native', 'poppler', 'Library', 'bin', 'pdftoppm.exe')
    : ''
  const codexRuntimePdftoppmCmd = process.env.USERPROFILE
    ? join(process.env.USERPROFILE, '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'bin', 'override', 'pdftoppm.cmd')
    : ''
  return [
    process.env.PDF_RENDER_BIN,
    codexRuntimePdftoppmExe,
    codexRuntimePdftoppmCmd,
    'pdftoppm',
    'C:\\Program Files\\poppler\\Library\\bin\\pdftoppm.exe',
    'C:\\Program Files\\poppler\\bin\\pdftoppm.exe',
  ]
}

function safeUploadExtension(fileName) {
  const ext = extname(String(fileName || '')).toLowerCase()
  return ['.ppt', '.pptx'].includes(ext) ? ext : '.pptx'
}

function safePdfExtension(fileName, mimeType = '') {
  const ext = extname(String(fileName || '')).toLowerCase()
  if (ext === '.pdf' || String(mimeType).includes('pdf')) return '.pdf'
  return ''
}

function safeVideoExtension(fileName, mimeType = '') {
  const ext = extname(String(fileName || '')).toLowerCase()
  if (['.mp4', '.webm', '.mov', '.m4v', '.ogg'].includes(ext)) return ext
  if (String(mimeType).includes('webm')) return '.webm'
  if (String(mimeType).includes('ogg')) return '.ogg'
  return '.mp4'
}

function pptAssetUrl(jobId, fileName) {
  return `/api/course-ppt-assets/${encodeURIComponent(jobId)}/${encodeURIComponent(fileName)}`
}

function videoAssetUrl(jobId, fileName) {
  return `/api/course-video-assets/${encodeURIComponent(jobId)}/${encodeURIComponent(fileName)}`
}

async function renderPdfPages(pdfPath, outputDir, jobId) {
  const prefix = join(outputDir, 'slide')
  try {
    await runFirstAvailableCommand(
      pdfRenderCandidates(),
      ['-png', '-r', '144', pdfPath, prefix],
      { timeout: 120000, missingMessage: 'PDF renderer is unavailable' },
    )
  } catch (error) {
    return {
      ok: false,
      slides: [],
      message: '服务器未安装 Poppler，已生成 PDF，暂不生成每页图片。',
      diagnostic: error.diagnostic || null,
    }
  }
  const slides = readdirSync(outputDir)
    .filter((file) => /^slide-\d+\.png$/i.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((file, index) => ({
      index: index + 1,
      imageUrl: pptAssetUrl(jobId, file),
      title: `PPT ${index + 1}`,
    }))
  return {
    ok: Boolean(slides.length),
    slides,
    message: slides.length ? 'PPT已转换为图片页。' : 'PDF已生成，但未输出图片页。',
    diagnostic: null,
  }
}

async function convertCoursePpt(body = {}) {
  const fileName = String(body.fileName || 'course.pptx')
  const base64 = String(body.dataBase64 || '').replace(/^data:[^,]+,/, '')
  if (!base64) {
    const error = new Error('缺少PPT文件内容')
    error.statusCode = 400
    throw error
  }
  const jobId = `ppt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const outputDir = join(coursePptAssetRoot(), jobId)
  mkdirSync(outputDir, { recursive: true })
  const sourceName = `source${safeUploadExtension(fileName)}`
  const sourcePath = join(outputDir, sourceName)
  writeFileSync(sourcePath, Buffer.from(base64, 'base64'))
  try {
    await runFirstAvailableCommand(
      libreOfficeCandidates(),
      ['--headless', '--convert-to', 'pdf', '--outdir', outputDir, sourcePath],
      { timeout: 180000, missingMessage: 'LibreOffice converter is unavailable' },
    )
  } catch (error) {
    return {
      ok: false,
      jobId,
      status: 'converter-unavailable',
      message: '服务器未安装 LibreOffice，暂时不能把PPT转为原版PDF/图片。',
      diagnostic: error.diagnostic || null,
    }
  }
  const pdfFile = readdirSync(outputDir).find((file) => file.toLowerCase().endsWith('.pdf'))
  if (!pdfFile) {
    return {
      ok: false,
      jobId,
      status: 'convert-failed',
      message: 'LibreOffice已执行，但没有生成PDF文件。',
    }
  }
  const pdfPath = join(outputDir, pdfFile)
  const rendered = await renderPdfPages(pdfPath, outputDir, jobId)
  return {
    ok: true,
    jobId,
    status: rendered.slides.length ? 'slides-ready' : 'pdf-ready',
    pdfUrl: pptAssetUrl(jobId, pdfFile),
    slides: rendered.slides,
    message: rendered.message,
  }
}

async function uploadCourseVideo(body = {}) {
  const fileName = String(body.fileName || 'course-video.mp4')
  const mimeType = String(body.fileType || body.mimeType || 'video/mp4')
  const base64 = String(body.dataBase64 || '').replace(/^data:[^,]+,/, '')
  if (!base64) {
    const error = new Error('缺少视频文件内容')
    error.statusCode = 400
    throw error
  }
  const jobId = `video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const outputDir = join(courseVideoAssetRoot(), jobId)
  mkdirSync(outputDir, { recursive: true })
  const outputName = `source${safeVideoExtension(fileName, mimeType)}`
  const outputPath = join(outputDir, outputName)
  const buffer = Buffer.from(base64, 'base64')
  writeFileSync(outputPath, buffer)
  return {
    ok: true,
    jobId,
    videoUrl: videoAssetUrl(jobId, outputName),
    fileName,
    fileType: mimeType,
    size: buffer.length,
    renderer: {
      pdf: true,
      images: rendered.ok,
    },
    diagnostic: rendered.diagnostic,
    message: '课程视频已保存到服务器。',
  }
}

async function uploadCoursePdf(body = {}) {
  const fileName = String(body.fileName || 'courseware.pdf')
  const mimeType = String(body.fileType || body.mimeType || 'application/pdf')
  const extension = safePdfExtension(fileName, mimeType)
  if (!extension) {
    const error = new Error('请上传 PDF 课件')
    error.statusCode = 400
    throw error
  }
  const base64 = String(body.dataBase64 || '').replace(/^data:[^,]+,/, '')
  if (!base64) {
    const error = new Error('缺少 PDF 课件内容')
    error.statusCode = 400
    throw error
  }
  const jobId = `ppt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const outputDir = join(coursePptAssetRoot(), jobId)
  mkdirSync(outputDir, { recursive: true })
  const outputName = 'source.pdf'
  const outputPath = join(outputDir, outputName)
  const buffer = Buffer.from(base64, 'base64')
  writeFileSync(outputPath, buffer)
  const rendered = await renderPdfPages(outputPath, outputDir, jobId)
  return {
    ok: true,
    jobId,
    status: rendered.slides.length ? 'slides-ready' : 'pdf-ready',
    pdfUrl: pptAssetUrl(jobId, outputName),
    slides: rendered.slides,
    fileName,
    fileType: mimeType,
    size: buffer.length,
    renderer: {
      pdf: true,
      images: rendered.ok,
    },
    diagnostic: rendered.diagnostic,
    message: 'PDF 课件已保存到服务器。',
  }
}

async function renderExistingCoursePdf(body = {}) {
  const pdfUrl = String(body.pdfUrl || '')
  const parts = pdfUrl.split('#')[0].split('?')[0].split('/').map((part) => decodeURIComponent(part))
  const jobId = parts[3] || ''
  const fileName = parts[4] || ''
  if (!/^ppt-\d+-[a-z0-9]+$/.test(jobId) || !fileName || fileName !== basename(fileName) || extname(fileName).toLowerCase() !== '.pdf') {
    const error = new Error('Invalid course PDF URL')
    error.statusCode = 400
    throw error
  }
  const root = resolve(coursePptAssetRoot())
  const filePath = resolve(root, jobId, fileName)
  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    const error = new Error('Course PDF file not found')
    error.statusCode = 404
    throw error
  }
  const outputDir = resolve(root, jobId)
  const rendered = await renderPdfPages(filePath, outputDir, jobId)
  return {
    ok: true,
    jobId,
    status: rendered.slides.length ? 'slides-ready' : 'pdf-ready',
    pdfUrl: pptAssetUrl(jobId, fileName),
    slides: rendered.slides,
    renderer: {
      pdf: true,
      images: rendered.ok,
    },
    diagnostic: rendered.diagnostic,
    message: rendered.message,
  }
}

function contentTypeForFile(fileName) {
  const ext = extname(fileName).toLowerCase()
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.mp4' || ext === '.m4v') return 'video/mp4'
  if (ext === '.webm') return 'video/webm'
  if (ext === '.mov') return 'video/quicktime'
  if (ext === '.ogg') return 'video/ogg'
  return 'application/octet-stream'
}

// 老的按 jobId 目录寻址的素材输出。
// 这两个函数的资源是无鉴权的（任何人拿到 URL 就能读），所以 CORS 不能再回 *：
// 上架后若回 *，任何第三方站点都能把课程视频嵌进自己的页面白拿流量。
// 只按 APP_ORIGIN 回显；未配置来源（demo 模式）时不发 CORS 头，同源访问不受影响。
function courseAssetCorsHeaders() {
  return APP_ORIGIN
    ? { 'Access-Control-Allow-Origin': APP_ORIGIN, 'Access-Control-Allow-Credentials': 'true' }
    : {}
}

function sendCoursePptAsset(req, res, url) {
  const parts = url.pathname.split('/').map((part) => decodeURIComponent(part))
  const jobId = parts[3] || ''
  const fileName = parts[4] || ''
  if (!/^ppt-\d+-[a-z0-9]+$/.test(jobId) || !fileName || fileName !== basename(fileName)) {
    return sendJson(res, 400, { ok: false, message: '课件资源路径无效' })
  }
  const root = resolve(coursePptAssetRoot())
  const filePath = resolve(root, jobId, fileName)
  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    return sendJson(res, 404, { ok: false, message: '课件资源不存在' })
  }
  res.writeHead(200, {
    'Content-Type': contentTypeForFile(fileName),
    ...courseAssetCorsHeaders(),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=3600',
  })
  createReadStream(filePath).pipe(res)
}

function sendCourseVideoAsset(req, res, url) {
  const parts = url.pathname.split('/').map((part) => decodeURIComponent(part))
  const jobId = parts[3] || ''
  const fileName = parts[4] || ''
  if (!/^video-\d+-[a-z0-9]+$/.test(jobId) || !fileName || fileName !== basename(fileName)) {
    return sendJson(res, 400, { ok: false, message: '视频资源路径无效' })
  }
  const root = resolve(courseVideoAssetRoot())
  const filePath = resolve(root, jobId, fileName)
  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    return sendJson(res, 404, { ok: false, message: '视频资源不存在' })
  }
  const size = statSync(filePath).size
  const range = req.headers.range
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range)
    const start = match?.[1] ? Number(match[1]) : 0
    const end = match?.[2] ? Math.min(Number(match[2]), size - 1) : size - 1
    if (Number.isFinite(start) && Number.isFinite(end) && start <= end) {
      res.writeHead(206, {
        'Content-Type': contentTypeForFile(fileName),
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        ...courseAssetCorsHeaders(),
        'Cache-Control': 'private, max-age=3600',
      })
      createReadStream(filePath, { start, end }).pipe(res)
      return
    }
  }
  res.writeHead(200, {
    'Content-Type': contentTypeForFile(fileName),
    'Content-Length': size,
    'Accept-Ranges': 'bytes',
    ...courseAssetCorsHeaders(),
    'Cache-Control': 'private, max-age=3600',
  })
  createReadStream(filePath).pipe(res)
}

/**
 * 受保护的课程素材输出：带 Range（视频拖进度条必须有）、带 CORS 白名单、带私有缓存。
 *
 * 与老的 sendCourseVideoAsset 的区别：
 *  - 老的按 URL 路径直接拼磁盘路径，谁拿到 URL 都能读，且 Access-Control-Allow-Origin: *；
 *  - 这里先由路由层做完鉴权，再按数据库登记的 storage_key 读文件，CORS 只回显 APP_ORIGIN。
 * 缓存用 private 而不是 public：素材是授权后才能看的，不能让 CDN/代理缓存后转给别人。
 */
async function streamCourseAsset(req, res, record) {
  const { size, stream } = await resolveCourseAssetFile(record, dataDir)
  const headers = {
    'Content-Type': record.mime_type || 'application/octet-stream',
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(record.original_name || record.id)}`,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  }
  if (APP_ORIGIN) {
    headers['Access-Control-Allow-Origin'] = APP_ORIGIN
    headers['Access-Control-Allow-Credentials'] = 'true'
  }
  const range = String(req.headers.range || '')
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range)
    const start = match?.[1] ? Number(match[1]) : 0
    // 末尾 0 字节的 Range（bytes=N-）在 Safari 上出现过，end 用 size-1 兜住。
    const end = match?.[2] ? Math.min(Number(match[2]), size - 1) : size - 1
    if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < size) {
      res.writeHead(206, {
        ...headers,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
      })
      stream({ start, end }).pipe(res)
      return
    }
    // Range 越界要回 416 并告诉客户端真实长度，否则有些播放器会一直重试。
    res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` })
    res.end()
    return
  }
  res.writeHead(200, { ...headers, 'Content-Length': String(size) })
  stream().pipe(res)
}

function writeReportAgentConfig(config) {
  const normalized = normalizeReportAgentConfig(config)
  try {
    ensureDataDir()
    writeFileSync(reportAgentConfigPath(), JSON.stringify(normalized, null, 2), 'utf8')
  } catch (error) {
    if (dataDir !== FALLBACK_DATA_DIR) {
      dataDir = FALLBACK_DATA_DIR
      setImageStyleCoverRoot(dataDir)
      configureAgentSkillStorage({ dataDir })
      ensureDataDir()
      writeFileSync(reportAgentConfigPath(), JSON.stringify(normalized, null, 2), 'utf8')
      return normalized
    }
    throw error
  }
  return normalized
}

function writeH5ReportConfig(config) {
  const normalized = normalizeH5ReportConfig({ ...config, updatedAt: new Date().toISOString() })
  try {
    ensureDataDir()
    writeFileSync(h5ReportConfigPath(), JSON.stringify(normalized, null, 2), 'utf8')
  } catch (error) {
    if (dataDir !== FALLBACK_DATA_DIR && ['EACCES', 'EPERM'].includes(error?.code)) {
      dataDir = FALLBACK_DATA_DIR
      setImageStyleCoverRoot(dataDir)
      configureAgentSkillStorage({ dataDir })
      ensureDataDir()
      writeFileSync(h5ReportConfigPath(), JSON.stringify(normalized, null, 2), 'utf8')
    } else {
      throw error
    }
  }
  return normalized
}

function readH5ReportDraftConfig() {
  try {
    if (!existsSync(h5ReportDraftConfigPath())) return readH5ReportConfig()
    return normalizeH5ReportConfig(JSON.parse(readFileSync(h5ReportDraftConfigPath(), 'utf8')))
  } catch {
    return readH5ReportConfig()
  }
}

function writeH5ReportDraftConfig(config) {
  const normalized = normalizeH5ReportConfig({ ...config, updatedAt: new Date().toISOString() })
  ensureDataDir()
  writeFileSync(h5ReportDraftConfigPath(), JSON.stringify(normalized, null, 2), 'utf8')
  return normalized
}

function h5ConfigChanged(draft, published) {
  const comparable = (value) => JSON.stringify({ strategies: value.strategies, templates: value.templates, editions: value.editions })
  return comparable(draft) !== comparable(published)
}

function mergeH5ScopedConfig(body, current, user, publish = false) {
  if (body.configRevision && body.configRevision !== h5LayoutService.config(user).revision) throw Object.assign(new Error('H5配置已被其他会话修改，请重新读取最新配置后再保存'), { statusCode: 409 })
  const submitted = (body.templates || []).map(template => {
    const existing = current.templates.find(item => item.id === template.id)
    if (existing && !h5TemplateVisible(existing, user)) throw Object.assign(new Error('无权修改其他机构的模板'), { statusCode: 403 })
    if (template.designDocument) {
      if (existing?.builtIn) throw Object.assign(new Error('请复制内置模板后再编辑布局'), { statusCode: 400 })
      checkH5TemplateMedia(template.designDocument, user)
      if (publish && template.status === 'published') { const errors = validateH5Design(template.designDocument); if (errors.length) throw Object.assign(new Error(errors[0]), { statusCode: 400 }) }
    }
    return { ...template, organizationId: existing?.organizationId || (existing?.builtIn ? '' : user?.organization?.id || 'demo-organization') }
  })
  return { ...body, templates: [...current.templates.filter(template => !h5TemplateVisible(template, user)), ...submitted] }
}

function checkH5VisualMedia(src, user) {
  const match = src?.match(/^\/api\/h5-visual-template-assets\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+)$/)
  if (!match) return
  const metaPath = join(h5VisualTemplateAssetsDir(), match[1], match[2], `${match[3]}.json`)
  const template = [...readH5ReportDraftConfig().templates, ...readH5ReportConfig().templates].find(item => item.id === match[1])
  const owner = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')).organizationId : template?.organizationId
  if (owner && owner !== (user?.organization?.id || 'demo-organization')) throw Object.assign(new Error('无权使用其他机构的模板素材'), { statusCode: 404 })
}

function checkH5TemplateMedia(design, user) {
  for (const page of design.pages || []) for (const src of [page.backgroundImage, ...(page.elements || []).filter(item => item.type === 'image').map(item => item.src)]) {
    if (/^\/api\/assets\//.test(src || '')) throw Object.assign(new Error('模板固定素材请使用模板上传，小画家作品请使用内容绑定'), { statusCode: 400 })
    checkH5VisualMedia(src, user)
  }
}

function readH5Reports() {
  try {
    if (!existsSync(h5ReportsPath())) return []
    const reports = JSON.parse(readFileSync(h5ReportsPath(), 'utf8'))
    return Array.isArray(reports) ? reports : []
  } catch {
    return []
  }
}

function writeH5Reports(reports) {
  ensureDataDir()
  writeFileSync(h5ReportsPath(), JSON.stringify(reports, null, 2), 'utf8')
  return reports
}

function h5LayoutMedia(report) {
  return [...new Set((report.layoutSnapshot?.pages || []).flatMap(page => [page.backgroundImage, ...page.elements.filter(element => element.type === 'image').map(element => element.src)]).filter(src => /^\/api\/(assets|h5-visual-template-assets)\//.test(src || '')))]
}

function publicH5LayoutSnapshot(report) {
  const layout = normalizeH5Design(report.layoutSnapshot)
  if (!layout) return null
  const sources = h5LayoutMedia(report)
  const rewrite = src => sources.includes(src) ? `/api/public/h5-reports/${encodeURIComponent(report.shareToken)}/media/${sources.indexOf(src)}` : src
  for (const page of layout.pages) { page.backgroundImage = rewrite(page.backgroundImage); for (const element of page.elements) if (element.type === 'image') element.src = rewrite(element.src) }
  return layout
}

// 公开页上的姓名只保留首尾字，中间打码：王*明、李*、小***橙。
function maskPersonName(name) {
  const chars = [...String(name || '').trim()]
  if (chars.length <= 1) return chars.join('')
  if (chars.length === 2) return `${chars[0]}*`
  return `${chars[0]}${'*'.repeat(Math.min(chars.length - 2, 3))}${chars[chars.length - 1]}`
}

function publicH5Report(report = {}) {
  return {
    id: report.id,
    title: report.title,
    projectId: report.projectId,
    courseId: report.courseId,
    // 分享链接谁都能打开：不展示小画家的完整姓名。
    studentName: maskPersonName(report.studentName),
    difficulty: report.difficulty,
    strategyId: report.strategyId || report.templateSnapshot?.strategyId || 'h5-standard',
    strategyVersion: Number(report.strategyVersion || report.templateSnapshot?.strategyVersion || 1),
    workflowId: report.workflowId || '',
    workflowVersion: Number(report.workflowVersion || 0),
    adapterKey: report.adapterKey || '',
    h5TemplateId: report.h5TemplateId || report.templateSnapshot?.id || '',
    warnings: Array.isArray(report.warnings) ? report.warnings : [],
    pages: report.pages || [],
    pageImages: Array.isArray(report.pageImages)
      ? report.pageImages.map((item) => ({ id: item.id, label: item.label || '', url: h5PageAssetUrl(report.shareToken, item.id) }))
      : [],
    templateSnapshot: report.layoutSnapshot ? Object.fromEntries(['id', 'name', 'layout', 'theme', 'fontFamily', 'displayOptions', 'officialUrl', 'officialButtonText'].map(key => [key, report.templateSnapshot?.[key]])) : report.templateSnapshot || {},
    layoutSnapshot: publicH5LayoutSnapshot(report),
    publishedAt: report.publishedAt,
    likes: Number(report.likes || 0),
    comments: Array.isArray(report.comments) ? report.comments.map((item) => ({ content: item.content, createdAt: item.createdAt })) : [],
  }
}

function h5ReportAuditText(report = {}) {
  return [report.title, ...(report.pages || []).flatMap((page) => [page.title, page.text, page.body]), ...(report.layoutSnapshot?.pages || []).flatMap(page => (page.elements || []).filter(element => element.type === 'text').map(element => element.text))].filter(Boolean).join(' ')
}

// 文案走统一风控词库（后台「风控管理」维护；公开分享场景下打码类词语也直接拦下）。riskState 为空时用内置词表。
function auditH5ReportPayload(report = {}, policy = 'h5-default-auto', riskState = null) {
  const verdict = publishTextVerdict(riskState, h5ReportAuditText(report))
  if (verdict.action === 'block') return { status: 'rejected', reason: `文案里有不适合公开的内容（${riskCategoryNames(verdict.categories)}），请修改后再提交` }
  if (!String(report.title || '').trim() || !(report.pages || []).length) return { status: 'rejected', reason: '报告标题或章节不完整' }
  if (policy === 'h5-manual') return { status: 'pending', reason: '当前版本使用人工审核策略' }
  if (verdict.action === 'review') return { status: 'pending', reason: '文案里有需要人工确认的词语，等待人工复核' }
  const mediaNeedsReview = (report.materialSummary?.finalImage || report.materialSummary?.videos || report.materialSummary?.models3d)
  if (mediaNeedsReview) return { status: 'pending', reason: '文案检查通过，图片、3D或视频素材等待人工复核' }
  return { status: 'published', reason: '文案与基础完整度检查通过' }
}

function saveH5ReportRecord(payload = {}, currentUser = null, riskState = null) {
  const reports = readH5Reports()
  let source = payload.report || payload
  if (source.layoutSnapshot || source.generationToken) {
    const generated = h5LayoutService.resolveSnapshot(source.generationToken, currentUser)
    source = { ...source, id: `h5_layout_${generated.generationToken}`, projectId: generated.projectId, difficulty: generated.difficulty, h5TemplateId: generated.templateId, templateSnapshot: generated.templateSnapshot, layoutSnapshot: generated.layout, pages: generated.pages, pageImages: [], materialSummary: { ...source.materialSummary, finalImage: 1 } }
  }
  const existingIndex = reports.findIndex((item) => item.id === source.id)
  const existing = existingIndex >= 0 ? reports[existingIndex] : null
  if (AUTH_MODE === 'server' && existing && existing.ownerUserId !== currentUser?.id) {
    const error = new Error('未找到该报告，或当前账号没有权限。')
    error.statusCode = 404
    throw error
  }
  const config = readH5ReportConfig()
  const difficulty = ['junior', 'starter', 'advanced', 'pro'].includes(source.difficulty) ? source.difficulty : 'starter'
  const policy = config.editions[difficulty]?.auditPolicy || 'h5-default-auto'
  const audit = payload.submit ? auditH5ReportPayload(source, policy, riskState) : { status: 'draft', reason: '草稿' }
  const now = new Date().toISOString()
  const status = audit.status
  const report = {
    ...(existing || {}),
    ...source,
    id: existing?.id || safeH5AssetPart(source.id) || `h5_report_${randomBytes(12).toString('base64url')}`,
    ownerUserId: currentUser?.id || source.ownerUserId || 'demo-student',
    organizationId: currentUser?.organization?.id || source.organizationId || 'demo-organization',
    campusId: currentUser?.campus?.id || source.campusId || '',
    strategyId: String(source.strategyId || source.templateSnapshot?.strategyId || 'h5-standard'),
    strategyVersion: Math.max(1, Number(source.strategyVersion || source.templateSnapshot?.strategyVersion || 1)),
    workflowId: String(source.workflowId || existing?.workflowId || ''),
    workflowVersion: Math.max(0, Number(source.workflowVersion || existing?.workflowVersion || 0)),
    adapterKey: String(source.adapterKey || existing?.adapterKey || ''),
    h5TemplateId: String(source.h5TemplateId || source.templateSnapshot?.id || existing?.h5TemplateId || ''),
    workflowNodeResults: Array.isArray(source.workflowNodeResults) ? source.workflowNodeResults.slice(0, 30) : (existing?.workflowNodeResults || []),
    warnings: Array.isArray(source.warnings) ? source.warnings.map((item) => String(item).slice(0, 300)).slice(0, 20) : (existing?.warnings || []),
    status,
    auditReason: audit.reason,
    auditPolicy: policy,
    updatedAt: now,
    createdAt: existing?.createdAt || now,
    publishedAt: status === 'published' ? (existing?.publishedAt || now) : '',
    shareToken: status === 'published' ? (existing?.shareToken || randomBytes(24).toString('base64url')) : '',
    likes: existing?.likes || 0,
    comments: existing?.comments || [],
    pageImages: Array.isArray(source.pageImages)
      ? source.pageImages.map((item) => ({ id: safeH5AssetPart(item?.id), label: String(item?.label || '').slice(0, 80) })).filter((item) => item.id)
      : (existing?.pageImages || []),
  }
  if (existingIndex >= 0) reports.splice(existingIndex, 1, report)
  else reports.unshift(report)
  writeH5Reports(reports)
  return report
}

function mergedProviders() {
  const saved = readProviderConfig()
  const savedProviders = saved.providers || {}
  const hiddenProviders = new Set(Array.isArray(saved.hiddenProviders) ? saved.hiddenProviders.map(normalizeProviderKey) : [])
  const merged = Object.fromEntries(Object.entries(providers).filter(([key]) => !hiddenProviders.has(key)).map(([key, item]) => {
    const patch = savedProviders[key] || {}
    return [key, {
      ...item,
      ...patch,
      label: patch.label || item.label,
      // 填成完整接口地址（…/images/generations）也能用：去掉接口后缀，免得请求地址拼两遍。
      baseUrl: normalizeProviderBaseUrl(patch.baseUrl || item.baseUrl),
      imageModel: patch.imageModel || item.imageModel,
      videoModel: patch.videoModel || item.videoModel || '',
      textModel: patch.textModel || item.textModel || '',
      imageModels: normalizeModelList(patch.imageModels, patch.imageModel || item.imageModel),
      videoModels: normalizeModelList(patch.videoModels, patch.videoModel || item.videoModel),
      textModels: normalizeModelList(patch.textModels, patch.textModel || item.textModel),
      models: normalizeModelList(
        patch.models,
        patch.defaultModel,
        item.models,
        item.defaultModel,
        patch.textModels,
        patch.imageModels,
        patch.videoModels,
        patch.textModel || item.textModel,
        patch.imageModel || item.imageModel,
        patch.videoModel || item.videoModel,
      ),
      defaultModel: patch.defaultModel || item.defaultModel || patch.textModel || item.textModel || patch.imageModel || item.imageModel || patch.videoModel || item.videoModel || '',
      apiKey: patch.apiKey || item.apiKey,
      category: patch.category || item.category || (key === 'hunyuan3d' ? 'model3d' : 'painting'),
      capabilities: Array.isArray(patch.capabilities) ? patch.capabilities : (item.capabilities || []),
      bindings: Array.isArray(patch.bindings) ? patch.bindings : (item.bindings || []),
      // 后台保存的参考图协议优先于代码预设，但必须是通过校验的合法声明。
      imageInput: normalizeImageInputSpec(patch.imageInput) || item.imageInput || null,
      imageEdit: normalizeImageEditSpec(patch.imageEdit || item.imageEdit),
      enabled: patch.enabled !== false && item.enabled !== false,
      disabledModels: normalizeModelList(patch.disabledModels),
      defaultEdition: patch.defaultEdition === 'pro' ? 'pro' : (patch.defaultEdition === 'rapid' ? 'rapid' : (item.defaultEdition || 'rapid')),
      editions: {
        rapid: patch.editions?.rapid !== false && item.editions?.rapid !== false,
        pro: patch.editions?.pro !== false && item.editions?.pro !== false,
      },
    }]
  }))
  Object.entries(savedProviders).forEach(([rawKey, patch]) => {
    const key = normalizeProviderKey(rawKey)
    if (!key || hiddenProviders.has(key) || merged[key]) return
    merged[key] = {
      label: patch.label || key,
      baseUrl: normalizeProviderBaseUrl(patch.baseUrl || ''),
      imageModel: patch.imageModel || '',
      videoModel: patch.videoModel || '',
      textModel: patch.textModel || '',
      imageModels: normalizeModelList(patch.imageModels, patch.imageModel),
      videoModels: normalizeModelList(patch.videoModels, patch.videoModel),
      textModels: normalizeModelList(patch.textModels, patch.textModel),
      models: normalizeModelList(patch.models, patch.defaultModel, patch.textModels, patch.imageModels, patch.videoModels, patch.textModel, patch.imageModel, patch.videoModel),
      defaultModel: patch.defaultModel || patch.textModel || patch.imageModel || patch.videoModel || '',
      apiKey: patch.apiKey || '',
      custom: true,
      category: patch.category || 'custom',
      capabilities: Array.isArray(patch.capabilities) ? patch.capabilities : [],
      bindings: Array.isArray(patch.bindings) ? patch.bindings : [],
      imageInput: normalizeImageInputSpec(patch.imageInput),
      imageEdit: normalizeImageEditSpec(patch.imageEdit),
      enabled: patch.enabled !== false,
      disabledModels: normalizeModelList(patch.disabledModels),
      modelLabels: normalizeModelLabels(patch.modelLabels),
      ...(typeof patch.imageWatermark === 'boolean' ? { imageWatermark: patch.imageWatermark } : {}),
      defaultEdition: patch.defaultEdition === 'pro' ? 'pro' : 'rapid',
      editions: { rapid: patch.editions?.rapid !== false, pro: patch.editions?.pro !== false },
    }
  })
  return merged
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const corsHeaders = APP_ORIGIN
    ? {
        'Access-Control-Allow-Origin': APP_ORIGIN,
        'Access-Control-Allow-Credentials': 'true',
      }
    : AUTH_MODE === 'demo' ? {
        'Access-Control-Allow-Origin': '*',
      } : {}
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...corsHeaders,
    ...extraHeaders,
  })
  res.end(JSON.stringify(payload))
}

function sendH5ReportPageAsset(res, filePath) {
  if (!filePath || !existsSync(filePath)) return sendJson(res, 404, { ok: false, message: '报告页面图片不存在或已被清理。' })
  const data = readFileSync(filePath)
  res.writeHead(200, {
    'Content-Type': 'image/webp',
    'Content-Length': String(data.length),
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(data)
}

function sendProtectedAsset(res, asset) {
  const headers = {
    'Content-Type': asset.mime_type,
    'Content-Length': String(asset.data.length),
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(asset.original_name || asset.id)}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  }
  if (APP_ORIGIN) {
    headers['Access-Control-Allow-Origin'] = APP_ORIGIN
    headers['Access-Control-Allow-Credentials'] = 'true'
  }
  res.writeHead(200, headers)
  res.end(asset.data)
}

// 本机回环地址互换：localhost 与 127.0.0.1 指向同一台机器，视为同一来源。
// 避免开发时因打开方式不同（启动脚本用 127.0.0.1、手动输入 localhost）导致写操作被 403。
function loopbackOriginVariant(value) {
  if (value.includes('//127.0.0.1')) return value.replace('//127.0.0.1', '//localhost')
  if (value.includes('//localhost')) return value.replace('//localhost', '//127.0.0.1')
  return ''
}

function assertTrustedMutationOrigin(req) {
  if (AUTH_MODE !== 'server' || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return
  const origin = String(req.headers.origin || '').trim()
  if (!origin) return
  const allowed = new Set(APP_ORIGINS.flatMap((item) => [item, loopbackOriginVariant(item)]).filter(Boolean))
  if (!allowed.has(origin)) {
    const error = new Error('请求来源未获授权。')
    error.statusCode = 403
    throw error
  }
}

function tencentAi3dCredentials() {
  const saved = readTencentCredentialConfig()
  const secretId = String(saved?.secretId || process.env.TENCENTCLOUD_SECRET_ID || '').trim()
  const secretKey = String(saved?.secretKey || process.env.TENCENTCLOUD_SECRET_KEY || '').trim()
  if (!secretId || !secretKey) {
    const error = new Error('腾讯混元3D未配置密钥，请在后台填写 SecretId 与 SecretKey 后保存')
    error.statusCode = 503
    throw error
  }
  if (!secretId.startsWith('AKID') || secretKey.startsWith('sk-')) {
    const error = new Error('当前选择的是“腾讯云 SDK”接入，请填写腾讯云 API 密钥对：SecretId（AKID 开头）和 SecretKey；混元 3D 控制台的 API Key（sk- 开头）不能填写在这里')
    error.statusCode = 400
    throw error
  }
  return {
    secretId,
    secretKey,
    region: String(saved?.region || process.env.TENCENT_AI3D_REGION || TENCENT_AI3D_REGION).trim(),
    endpoint: String(saved?.endpoint || process.env.TENCENT_AI3D_HOST || TENCENT_AI3D_HOST).trim(),
    source: saved?.source || 'environment',
  }
}

function tencentAi3dConnectionInfo() {
  const saved = readTencentCredentialConfig()
  const secretId = String(saved?.secretId || process.env.TENCENTCLOUD_SECRET_ID || '').trim()
  const secretKey = String(saved?.secretKey || process.env.TENCENTCLOUD_SECRET_KEY || '').trim()
  return {
    configured: Boolean(secretId && secretKey),
    region: String(saved?.region || process.env.TENCENT_AI3D_REGION || TENCENT_AI3D_REGION).trim(),
    endpoint: String(saved?.endpoint || process.env.TENCENT_AI3D_HOST || TENCENT_AI3D_HOST).trim(),
    source: saved?.source || (secretId || secretKey ? 'environment' : 'none'),
  }
}

function saveTencentAi3dCredentials(body = {}) {
  const current = tencentAi3dConnectionInfo()
  const secretId = String(body.secretId || '').trim()
  const secretKey = String(body.secretKey || '').trim()
  if (secretKey && !secretId) {
    const error = new Error('填写 SecretKey 时必须同时填写 SecretId')
    error.statusCode = 400
    throw error
  }
  const region = String(body.region || current.region || 'ap-guangzhou').trim()
  const endpoint = String(body.endpoint || current.endpoint || 'ai3d.tencentcloudapi.com').trim().toLowerCase()
  if (!/^ap-[a-z0-9-]+$/.test(region)) {
    const error = new Error('腾讯云地域格式无效，例如 ap-guangzhou')
    error.statusCode = 400
    throw error
  }
  if (!/^ai3d(?:\.[a-z0-9-]+)?\.tencentcloudapi\.com$/.test(endpoint)) {
    const error = new Error('腾讯混元3D Endpoint 无效，只允许 ai3d.tencentcloudapi.com 或指定地域域名')
    error.statusCode = 400
    throw error
  }
  if (secretId || secretKey) writeTencentCredentialConfig({ secretId, secretKey, region, endpoint, updatedAt: new Date().toISOString() })
  else if (current.configured && (region !== current.region || endpoint !== current.endpoint)) {
    const existing = readTencentCredentialConfig()
    if (!existing) {
      const error = new Error('环境变量密钥不能从后台修改地域，请同时填写 SecretId 与 SecretKey 后保存')
      error.statusCode = 400
      throw error
    }
    writeTencentCredentialConfig({ ...existing, region, endpoint, updatedAt: new Date().toISOString() })
  }
  return tencentAi3dConnectionInfo()
}

function hunyuan3dSettings(requestedModel, requestedEdition) {
  const provider = mergedProviders().hunyuan3d
  if (!provider || provider.enabled === false) {
    const error = new Error('腾讯混元3D已在后台配置中停用，请先启用后再生成')
    error.statusCode = 503
    throw error
  }
  const edition = requestedEdition === 'pro' ? 'pro' : (requestedEdition === 'rapid' ? 'rapid' : (provider.defaultEdition || 'rapid'))
  if (provider.editions?.[edition] === false) {
    const error = new Error(`腾讯混元3D${edition === 'rapid' ? '极速版' : '专业版'}未在后台启用`)
    error.statusCode = 403
    throw error
  }
  const configuredModels = normalizeModelList(provider.models, provider.defaultModel, TENCENT_AI3D_MODEL)
  const model = String(requestedModel || configuredModels.find((item) => modelEnabled(provider, item)) || provider.defaultModel || TENCENT_AI3D_MODEL).trim()
  requireModelEnabled(provider, model)
  if (edition === 'pro' && configuredModels.length && !configuredModels.includes(model)) {
    const error = new Error(`当前后台未启用混元3D模型 ${model}`)
    error.statusCode = 400
    throw error
  }
  return { model, edition, provider }
}

function createTencentAi3dClient() {
  const { secretId, secretKey, region, endpoint } = tencentAi3dCredentials()
  return new ai3d.v20250513.Client({
    credential: { secretId, secretKey },
    region,
    profile: { httpProfile: { endpoint, reqTimeout: 60 } },
  })
}

async function callTencentAi3d(method, payload) {
  try {
    const client = createTencentAi3dClient()
    if (typeof client[method] !== 'function') throw new Error(`腾讯混元3D SDK不支持方法：${method}`)
    return await client[method](payload)
  } catch (error) {
    const code = String(error?.code || '')
    const sdkError = new Error(error?.message || '腾讯混元3D SDK调用失败')
    if (code.startsWith('AuthFailure.')) sdkError.statusCode = 401
    else if (code.includes('UnauthorizedOperation') || code === 'UnauthorizedOperation') sdkError.statusCode = 403
    else if (code.startsWith('RequestLimitExceeded') || code === 'LimitExceeded') sdkError.statusCode = 429
    else if (code.startsWith('Invalid') || code === 'MissingParameter' || code === 'UnsupportedRegion') sdkError.statusCode = 400
    else sdkError.statusCode = error?.statusCode || 502
    sdkError.data = { code, requestId: error?.requestId || '' }
    sdkError.diagnostic = { provider: 'tencent-hunyuan3d', method, code, requestId: error?.requestId || '' }
    throw sdkError
  }
}

function normalizeHunyuan3dTask(response = {}) {
  const files = Array.isArray(response.ResultFile3Ds) ? response.ResultFile3Ds : []
  const glb = files.find((file) => String(file.Type || '').toUpperCase() === 'GLB') || files[0] || {}
  return {
    taskId: response.JobId || '',
    status: String(response.Status || 'WAIT').toLowerCase(),
    files: files.map((file) => ({ type: file.Type || '', url: file.Url || '', previewImageUrl: file.PreviewImageUrl || '' })),
    modelUrl: glb.Url || '',
    previewImageUrl: glb.PreviewImageUrl || '',
    errorCode: response.ErrorCode || '',
    errorMessage: response.ErrorMessage || '',
    requestId: response.RequestId || '',
  }
}

const HUNYUAN_ASSET_HOST_SUFFIXES = ['myqcloud.com', 'tencentcos.cn', 'qcloud.com', 'tencent.com']

function validateHunyuanAssetUrl(value) {
  let target
  try {
    target = new URL(String(value || ''))
  } catch {
    const error = new Error('3D模型文件地址无效')
    error.statusCode = 400
    throw error
  }
  const hostname = target.hostname.toLowerCase()
  const allowedHost = HUNYUAN_ASSET_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))
  if (target.protocol !== 'https:' || target.username || target.password || !allowedHost) {
    const error = new Error('只允许读取腾讯混元3D返回的 HTTPS 模型文件')
    error.statusCode = 400
    throw error
  }
  return target
}

async function fetchHunyuanAsset(value) {
  let target = validateHunyuanAssetUrl(value)
  for (let redirectCount = 0; redirectCount < 4; redirectCount += 1) {
    const response = await fetch(target, {
      redirect: 'manual',
      headers: { Accept: 'model/gltf-binary, application/octet-stream, */*' },
    })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get('location')
    await response.body?.cancel()
    if (!location) break
    target = validateHunyuanAssetUrl(new URL(location, target).toString())
  }
  const error = new Error('3D模型文件重定向次数过多')
  error.statusCode = 502
  throw error
}

async function proxyHunyuan3dAsset(req, res, url) {
  const remoteUrl = url.searchParams.get('url') || ''
  const response = await fetchHunyuanAsset(remoteUrl)
  if (!response.ok || !response.body) {
    const error = new Error(response.status === 403 || response.status === 404
      ? '腾讯3D模型下载链接已失效，请重新生成模型'
      : `腾讯3D模型文件读取失败（${response.status}）`)
    error.statusCode = 502
    throw error
  }
  const headers = {
    'Content-Type': response.headers.get('content-type') || 'model/gltf-binary',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'private, max-age=900',
  }
  const contentLength = response.headers.get('content-length')
  if (contentLength) headers['Content-Length'] = contentLength
  res.writeHead(200, headers)
  Readable.fromWeb(response.body).pipe(res)
}

async function submitHunyuan3dTask(body = {}) {
  const imageBase64 = String(body.imageBase64 || '').replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
  const settings = hunyuan3dSettings(body.model, body.edition)
  const promptLimit = settings.edition === 'rapid' ? 200 : 1024
  const prompt = textValue(body.prompt).slice(0, promptLimit)
  if (!imageBase64 && !prompt) {
    const error = new Error('请上传作品图片或填写3D模型描述')
    error.statusCode = 400
    throw error
  }
  if (imageBase64 && Buffer.byteLength(imageBase64, 'base64') > 6 * 1024 * 1024) {
    const error = new Error('图片过大，腾讯混元3D要求原始图片不超过6MB')
    error.statusCode = 400
    throw error
  }
  const resultFormat = ['GLB', 'OBJ', 'FBX', 'STL', 'USDZ', 'MP4'].includes(String(body.resultFormat || '').toUpperCase())
    ? String(body.resultFormat).toUpperCase()
    : 'GLB'
  const request = { ResultFormat: resultFormat }
  if (settings.edition === 'pro') {
    request.Model = settings.model
    request.GenerateType = body.isSketch ? 'Sketch' : 'Normal'
    request.EnablePBR = Boolean(body.enablePbr)
    request.FaceCount = Math.min(1500000, Math.max(3000, Number(body.faceCount) || 500000))
  }
  if (imageBase64) request.ImageBase64 = imageBase64
  if (prompt && (!imageBase64 || settings.edition === 'pro' && body.isSketch)) request.Prompt = prompt
  const response = await callTencentAi3d(settings.edition === 'rapid' ? 'SubmitHunyuanTo3DRapidJob' : 'SubmitHunyuanTo3DProJob', request)
  return { ...normalizeHunyuan3dTask(response), status: 'waiting', edition: settings.edition }
}

async function queryHunyuan3dTask(taskId, edition = 'rapid') {
  if (!taskId) {
    const error = new Error('缺少腾讯混元3D任务ID')
    error.statusCode = 400
    throw error
  }
  const resolvedEdition = edition === 'pro' ? 'pro' : 'rapid'
  return { ...normalizeHunyuan3dTask(await callTencentAi3d(resolvedEdition === 'rapid' ? 'QueryHunyuanTo3DRapidJob' : 'QueryHunyuanTo3DProJob', { JobId: taskId })), edition: resolvedEdition }
}

// 请求体默认上限 80MB（最大的作品修改接口带图约 36MB）。以前不传上限就是无限大，一个超大请求就能把服务器内存撑爆。
const DEFAULT_JSON_LIMIT = 80 * 1024 * 1024

async function readJson(req, maxBytes = 0, tooLargeMessage = '') {
  const chunks = []
  let bytes = 0
  const limit = maxBytes || DEFAULT_JSON_LIMIT
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > limit) {
      const error = new Error(tooLargeMessage || (maxBytes ? '图片选区请求过大，请使用较小的图片。' : '请求内容太大，请压缩后再试。'))
      error.statusCode = 413
      throw error
    }
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  let value
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    const error = new Error('请求体不是有效 JSON')
    error.statusCode = 400
    throw error
  }
  // "null"、数字这类合法 JSON 不是对象，路由里取 body.xxx 会直接报 500，统一当成空对象。
  return value && typeof value === 'object' ? value : {}
}

// ---- 模型显示名：后台可以给每个模型起好懂的名字；没起的按常见命名自动生成（例如 Seedream 4.0）----
function autoModelLabel(model) {
  const id = String(model || '').trim()
  const lower = id.toLowerCase()
  let match = lower.match(/seedream-(\d+)-(\d+)/)
  if (match) return `Seedream ${match[1]}.${match[2]}${/flash/.test(lower) ? ' 极速版' : ''}`
  match = lower.match(/seedance-(\d+)-(\d+)/)
  if (match) return `Seedance ${match[1]}.${match[2]}${/pro/.test(lower) ? ' Pro' : /lite/.test(lower) ? ' Lite' : ''}`
  match = lower.match(/^doubao-seed-(\d+)-(\d+)/)
  if (match) return `豆包 Seed ${match[1]}.${match[2]}`
  match = lower.match(/^agnes-image-([\d.]+)/)
  if (match) return `Agnes 图像 ${match[1]}${/flash/.test(lower) ? ' 极速版' : ''}`
  match = lower.match(/^agnes-video-v?([\d.]+)/)
  if (match) return `Agnes 视频 ${match[1]}`
  if (lower === 'gpt-image-1') return 'GPT Image 1'
  return id
}

function normalizeModelLabels(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value)
    .map(([model, label]) => [String(model).trim().slice(0, 120), String(label ?? '').trim().replace(/\s+/g, ' ').slice(0, 24)])
    .filter(([model, label]) => model && label)
    .slice(0, 200))
}

/** 平台每个模型的显示名：后台起的名字优先，没有就用自动生成的。 */
function providerModelLabels(provider = {}) {
  const custom = normalizeModelLabels(provider.modelLabels)
  return Object.fromEntries(providerUnifiedModelList(provider).map((model) => [model, custom[model] || autoModelLabel(model)]))
}

/** 后台看的备用模型状态：配置了但已失效（平台删了、停了、没 Key、模型关了）要明说。 */
function imageFallbackView() {
  const config = readProviderConfig().imageFallback || {}
  const key = normalizeProviderKey(config.provider)
  const provider = key ? mergedProviders()[key] : null
  const model = String(config.model || '')
  const usable = Boolean(config.enabled && provider && provider.enabled !== false && providerKeyUsable(provider) && availableProviderModels(provider, 'image').includes(model))
  return {
    enabled: Boolean(config.enabled),
    provider: key || '',
    model,
    providerLabel: provider?.label || '',
    modelLabel: provider && model ? (providerModelLabels(provider)[model] || model) : '',
    usable,
    problem: config.enabled && !usable ? '备用模型已失效（平台被删除或停用、没有可用的 Key，或者模型被关闭），出图失败时不会自动换用' : '',
  }
}

/**
 * 免费检测连接：请求平台的 /models（只读模型列表，不出图、不产生费用），确认地址、网络和 Key。
 * status：ok 正常 / bad-key Key 无效 / unsupported 平台不提供模型列表（没法免费验证）/ upstream-error / timeout / unreachable / no-key
 */
async function probeProviderConnection(provider) {
  if (!providerKeyUsable(provider)) return { ok: false, status: 'no-key', message: `${provider.label} 还没有填写可用的 API Key` }
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(`${String(provider.baseUrl || '').replace(/\/+$/, '')}/models`, {
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      signal: controller.signal,
    })
    const latencyMs = Date.now() - started
    const data = await response.json().catch(() => null)
    if (response.ok) {
      const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : [])
      return { ok: true, status: 'ok', latencyMs, modelCount: list.length, message: `${provider.label} 连接正常（${latencyMs} 毫秒），Key 有效${list.length ? `，平台上有 ${list.length} 个模型` : ''}。这次检测没有出图，不产生费用。` }
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: 'bad-key', latencyMs, httpStatus: response.status, message: `${provider.label} 能连上，但 API Key 无效或没有权限（${response.status}），请检查 Key 是否填对、是否过期。` }
    }
    if (response.status === 404 || response.status === 405) {
      return { ok: null, status: 'unsupported', latencyMs, httpStatus: response.status, message: `${provider.label} 能连上，但这个平台不提供免费的模型列表接口，没法免费验证 Key；第一次出图时就能知道 Key 是否可用。` }
    }
    return { ok: false, status: 'upstream-error', latencyMs, httpStatus: response.status, message: upstreamErrorMessage(provider, response.status, data || {}) }
  } catch (error) {
    const timedOut = error?.name === 'AbortError'
    return {
      ok: false,
      status: timedOut ? 'timeout' : 'unreachable',
      message: timedOut
        ? `${provider.label} 10 秒内没有响应，请检查网络或 Base URL。`
        : `${provider.label} 连不上，请检查 Base URL 和网络（${String(error?.cause?.code || error?.code || error?.message || '').slice(0, 60)}）。`,
    }
  } finally {
    clearTimeout(timer)
  }
}

function getProvider(name) {
  const saved = readProviderConfig()
  const key = String(name || saved.defaultProvider || DEFAULT_PROVIDER || 'agnes').toLowerCase()
  const provider = mergedProviders()[key]
  if (!provider) {
    const error = new Error(`不支持的 AI 供应商：${key}`)
    error.statusCode = 400
    throw error
  }
  return { key, ...provider }
}

// 判断某个供应商的 Key 是不是真能用。
// .env 里常留着「你的OpenAI密钥」这类中文占位文字，只判 Boolean(apiKey) 会把它算成
// 「已配置」，前端据此把它排在下拉第一位，学生一点出图就报错。空的和含中文的空格的一律不算。
function providerKeyUsable(provider) {
  const key = String(provider?.apiKey || '').trim()
  return Boolean(key) && !/[^\x20-\x7E]/.test(key)
}

function requireApiKey(provider) {
  if (!provider.apiKey) {
    const error = new Error(`${provider.label} 未配置 API Key，请在 server/.env 中填写`)
    error.statusCode = 503
    throw error
  }
  // .env 里留着「你的OpenAI密钥」这类中文占位文字时，fetch 会把 header 转 ByteString 失败，
  // 报出来是 Cannot convert argument to a ByteString，看着像网络故障，实际是配置根本没填。
  // 在发请求前拦下来，直接说清楚要改哪个供应商的 Key。
  if (!providerKeyUsable(provider)) {
    const error = new Error(`${provider.label} 的 API Key 含中文或空格，像是没替换的占位文字，请到后台「供应商设置」重新填写真实 Key`)
    error.statusCode = 503
    throw error
  }
}

function mapOpenAIImageSize(ratio = '1:1') {
  const value = String(ratio)
  if (value.includes('9:16') || value.includes('2:3') || value.includes('3:4')) return '1024x1536'
  if (value.includes('21:9') || value.includes('16:9') || value.includes('3:2') || value.includes('4:3')) return '1536x1024'
  return '1024x1024'
}

function mapAgnesImageSize(ratio = '1:1') {
  const value = String(ratio)
  if (value.includes('21:9')) return '1344x576'
  if (value.includes('3:2')) return '1152x768'
  if (value.includes('1:2')) return '768x1024'
  if (value.includes('2:3')) return '768x1152'
  if (value.includes('9:16')) return '576x1024'
  if (value.includes('3:4')) return '768x1024'
  if (value.includes('16:9')) return '1024x576'
  if (value.includes('4:3')) return '1024x768'
  return '1024x1024'
}

function mapVolcengineImageSize(ratio = '1:1', quality = 'standard') {
  const ratioValue = String(ratio)
  if (ratioValue.includes('21:9')) return '1792x768'
  if (ratioValue.includes('16:9')) return '1536x864'
  if (ratioValue.includes('3:2')) return '1344x896'
  if (ratioValue.includes('4:3')) return '1344x1008'
  if (ratioValue.includes('3:4')) return '1008x1344'
  if (ratioValue.includes('2:3')) return '896x1344'
  if (ratioValue.includes('9:16')) return '864x1536'
  const value = String(quality).toLowerCase()
  if (value.includes('4k')) return '4K'
  if (value.includes('2k') || value.includes('高清') || value.includes('high')) return '2K'
  return '1024x1024'
}

function mapOpenAIQuality(quality = 'standard') {
  const value = String(quality).toLowerCase()
  if (value.includes('4k') || value.includes('高清') || value.includes('hd') || value.includes('high')) return 'high'
  if (value.includes('low') || value.includes('草稿')) return 'low'
  return 'medium'
}

function normalizeImageResults(data, request, providerKey, model) {
  const items = data?.data || data?.images || data?.results || []
  if (!Array.isArray(items) || !items.length) {
    const error = new Error(`${providerKey} 没有返回图片结果`)
    error.statusCode = 502
    error.data = data
    throw error
  }

  return items.map((item, index) => {
    const dataUrl = item.b64_json ? `data:image/png;base64,${item.b64_json}` : ''
    const url = item.url || item.imageUrl || item.image_url || item.src || dataUrl
    return {
      id: item.id || `${providerKey}-art-${Date.now()}-${index}`,
      title: item.title || `AI作品 ${index + 1}`,
      prompt: item.prompt || item.revised_prompt || request.prompt,
      imageUrl: url,
      provider: providerKey,
      model,
      createdAt: item.createdAt || new Date().toISOString(),
    }
  })
}

function extractJsonObject(value) {
  const text = String(value || '').trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()
  try {
    return JSON.parse(text)
  } catch {}
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1))
  throw new Error('AI 未返回有效 JSON')
}

function extractJsonObjectSafe(value) {
  try {
    return extractJsonObject(value)
  } catch (error) {
    error.statusCode = 502
    error.contentPreview = String(value || '').slice(0, 800)
    throw error
  }
}

function normalizeCourseCategory(value = '') {
  const text = String(value || '').toLowerCase()
  const labels = {
    storefront: ['storefront', '门头', '招牌', '店铺', '商店'],
    ip: ['ip', '形象', '角色', '吉祥物'],
    ad: ['ad', '广告', '海报', '宣传'],
    anime: ['anime', '漫画', '人物', '角色设计'],
    product: ['product', '产品', '包装'],
    interior: ['interior', '室内', '空间'],
    car: ['car', '汽车', '车辆', '造型'],
    creative: ['creative', '创意画', '绘画'],
    picturebook: ['picturebook', '绘本', '故事书'],
  }
  for (const [key, words] of Object.entries(labels)) {
    if (words.some((word) => text.includes(word))) return key
  }
  return 'creative'
}

function normalizeCourseQuestion(question = {}) {
  const options = Array.isArray(question.options) ? question.options.filter(Boolean).slice(0, 3) : []
  while (options.length < 3) options.push(['结合课程内容认真观察', '随意选择喜欢的效果', '只看图片大小'][options.length])
  const answer = String(question.answer || 'A').trim().toUpperCase()
  return {
    title: String(question.title || question.question || '这节课最重要的观察点是什么？').trim(),
    options,
    answer: ['A', 'B', 'C'].includes(answer) ? answer : 'A',
  }
}

function normalizeCourseParseResult(raw = {}, request = {}, providerKey = 'api') {
  const questions = Array.isArray(raw.questions) ? raw.questions.map(normalizeCourseQuestion).slice(0, 6) : []
  const pptPages = Array.isArray(raw.pptPages) ? raw.pptPages.slice(0, 8).map((page, index) => ({
    title: String(page?.title || `课程页 ${index + 1}`).trim(),
    body: String(page?.body || page?.content || '').trim(),
  })).filter((page) => page.title || page.body) : []
  return {
    title: String(raw.title || request.fileName || 'AI创意美术课程').trim().slice(0, 60),
    category: normalizeCourseCategory(raw.category || request.currentCategory),
    difficulty: String(raw.difficulty || raw.ageRange || request.currentDifficulty || '少儿基础 · 8-12岁').trim().slice(0, 40),
    description: String(raw.description || raw.summary || '根据课程文档整理出的AI创意美术课程。').trim().slice(0, 260),
    pptPages: pptPages.length ? pptPages : [
      { title: '课程导入', body: '认识课程主题、观察对象和创作目标' },
      { title: '观察分析', body: '提取造型、色彩、构图和表达关键词' },
      { title: '创作任务', body: '整理AI绘画提示词并生成作品' },
    ],
    questions: questions.length ? questions : [
      normalizeCourseQuestion({ title: '这节课最需要先观察什么？', options: ['课程主题和画面特点', '文件大小', '屏幕亮度'], answer: 'A' }),
      normalizeCourseQuestion({ title: '整理AI绘画提示词时应该包含什么？', options: ['对象、风格、颜色和细节', '只写生成图片', '只写好看'], answer: 'A' }),
      normalizeCourseQuestion({ title: '完成作品后应该重点说明什么？', options: ['创意来源和画面表达', '按钮位置', '设备型号'], answer: 'A' }),
    ],
    confidence: Math.min(Math.max(Number(raw.confidence || 0.75), 0), 1),
    provider: providerKey,
  }
}

const RETRYABLE_UPSTREAM_STATUS = new Set([429, 502, 503, 504])

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function upstreamErrorMessage(provider, status, data) {
  if (status === 429) return `${provider.label} 请求较多，请稍后重试`
  if ([502, 503, 504].includes(status)) return `${provider.label} 服务繁忙，请稍后重试`
  return data?.error?.message || data?.message || `${provider.label} 接口失败：${status}`
}

function safeBaseUrl(value = '') {
  try {
    const parsed = new URL(value)
    return parsed.origin
  } catch {
    return String(value || '').replace(/\/+$/g, '')
  }
}

function createUpstreamNetworkError(provider, path, error) {
  const isAbort = error?.name === 'AbortError'
  const wrapped = new Error(isAbort
    ? `${provider.label} 请求超时，请检查网络或稍后重试`
    : `${provider.label} 无法连接上游服务，请检查网络、防火墙或 Base URL 后重试`)
  wrapped.statusCode = 502
  // 只有真正的网络层失败才叫「连不上」。请求还没发出去就失败的（比如请求头里混了中文，
  // fetch 会抛 ByteString 转换错误）必须把原文带出来，否则排查时全被误导成网络问题。
  const detail = String(error?.cause?.message || error?.message || '')
  const isNetworkFailure = Boolean(error?.cause?.code || error?.code) || error?.name === 'AbortError'
  wrapped.message = isNetworkFailure
    ? wrapped.message
    : `${provider.label} 请求未发出：${detail || '未知原因'}`
  wrapped.diagnostic = {
    stage: 'upstream_fetch',
    provider: provider.key,
    providerLabel: provider.label,
    baseUrl: safeBaseUrl(provider.baseUrl),
    path,
    cause: error?.cause?.code || error?.code || error?.name || 'fetch_failed',
    detail: detail.slice(0, 300),
  }
  return wrapped
}

function postJsonWithCurl(provider, path, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const curlPath = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'curl.exe')
    const args = [
      '--silent',
      '--show-error',
      '--fail-with-body',
      '--ipv4',
      '--connect-timeout', '15',
      '--max-time', String(Math.ceil(timeoutMs / 1000)),
      '--request', 'POST',
      `${provider.baseUrl}${path}`,
      '--header', `Authorization: Bearer ${provider.apiKey}`,
      '--header', 'Content-Type: application/json',
      // 通过 stdin 传递请求体，避免参考图 Base64 进入 Windows 命令行参数后触发 ENAMETOOLONG。
      '--data-binary', '@-',
    ]
    const proxy = String(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.AGNES_HTTPS_PROXY || '').trim()
    if (proxy) args.splice(4, 0, '--proxy', proxy)
    const child = execFile(curlPath, args, { windowsHide: true, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      let data = {}
      try { data = stdout ? JSON.parse(stdout) : {} } catch { data = { raw: stdout } }
      if (error) {
        const wrapped = createUpstreamNetworkError(provider, path, error)
        wrapped.statusCode = 502
        wrapped.data = data
        wrapped.diagnostic = { ...wrapped.diagnostic, stage: 'curl_fallback', stderr: stderr ? String(stderr).slice(0, 500) : '' }
        reject(wrapped)
        return
      }
      resolve(data)
    })
    child.stdin.end(JSON.stringify(payload))
  })
}

function getJsonWithCurl(provider, path, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const curlPath = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'curl.exe')
    const args = [
      '--silent', '--show-error', '--fail-with-body',
      '--ipv4',
      '--connect-timeout', '15', '--max-time', String(Math.ceil(timeoutMs / 1000)),
      '--header', `Authorization: Bearer ${provider.apiKey}`,
      `${provider.baseUrl}${path}`,
    ]
    const proxy = String(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.AGNES_HTTPS_PROXY || '').trim()
    if (proxy) args.splice(4, 0, '--proxy', proxy)
    execFile(curlPath, args, { windowsHide: true, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      let data = {}
      try { data = stdout ? JSON.parse(stdout) : {} } catch { data = { raw: stdout } }
      if (error) {
        const wrapped = createUpstreamNetworkError(provider, path, error)
        wrapped.statusCode = 502
        wrapped.data = data
        wrapped.diagnostic = { ...wrapped.diagnostic, stage: 'curl_fallback', stderr: stderr ? String(stderr).slice(0, 500) : '' }
        reject(wrapped)
        return
      }
      resolve(data)
    })
  })
}

async function postJson(provider, path, payload, timeoutMs = 180000, options = {}) {
  if (payload.model) requireModelEnabled(provider, payload.model)
  requireApiKey(provider)
  const maxAttempts = options.singleAttempt ? 1 : 3

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(`${provider.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok) return data

      if (RETRYABLE_UPSTREAM_STATUS.has(response.status) && attempt < maxAttempts) {
        await wait(attempt * 1500)
        continue
      }

      const error = new Error(upstreamErrorMessage(provider, response.status, data))
      error.statusCode = response.status
      error.upstreamStatus = response.status
      error.data = data
      throw error
    } catch (error) {
      if (error.statusCode) throw error
      const cause = String(error?.cause?.code || error?.code || '')
      if (!options.singleAttempt && ['EACCES', 'EPERM'].includes(cause)) {
        try {
          return await postJsonWithCurl(provider, path, payload, timeoutMs)
        } catch (curlError) {
          throw curlError
        }
      }
      // 中转站和家庭宽带都会偶发掐掉一两个连接，报「无法连接上游服务」。
      // 学生看到这句话只会以为是自己说错了，然后重说一遍——代价比服务端重试一次高得多。
      // 只重试「真的没连上」的瞬时故障：带 cause.code 才算；请求根本没发出去的
      // （例如请求头里混进中文导致 ByteString 转换失败）重试多少次结果都一样，直接抛出原文。
      const isAbort = error?.name === 'AbortError'
      if (!isAbort && cause && attempt < maxAttempts) {
        await wait(attempt * 900)
        continue
      }
      throw createUpstreamNetworkError(provider, path, error)
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new Error(`${provider.label} 服务繁忙，请稍后重试`)
}

// —— 智能体调用记录 --------------------------------------------------------
// 后台「调用记录」只回答一个问题：这次为什么没反应。
// 因此记「流程 / 智能体 / 模型 / 耗时 / 结果」，**不记学生原话**——这里可能夹着姓名、班级等
// 未成年人信息，落盘要克制。需要上下文时由调用方显式传 logSummary。
function summarizeAgentCallInput(request = {}) {
  const explicit = String(request.logSummary || '').trim()
  if (explicit) return explicit
  const userText = (request.messages || [])
    .filter((message) => message?.role === 'user')
    .map((message) => String(message.content || ''))
    .join('')
  const length = String(userText || request.prompt || '').length
  return length ? `输入 ${length} 字` : ''
}

function recordAgentCall({ flowKey, agent, result, error, durationMs, request } = {}) {
  try {
    if (!flowKey) return
    const provider = result?.provider || ''
    const model = result?.model || ''
    agentCallLog.append({
      flowKey,
      agentId: result?.agentId || agent?.id || request?.logAgentId || '',
      agentName: result?.agentName || agent?.name || request?.logAgentName || '',
      provider,
      model,
      status: error ? 'error' : 'ok',
      durationMs,
      source: request?.logSource || '',
      summary: summarizeAgentCallInput(request),
      error: error ? (error.message || String(error)) : '',
    })
  } catch {
    // 记录失败绝不能影响主流程。
  }
}

async function generateTextJson(request = {}) {
  const callStartedAt = Date.now()
  const callFlowKey = String(request.flowKey || request.logFlowKey || '').trim()
  if (request.provider && request.model) requireModelEnabled(getProvider(request.provider), request.model)
  const resolved = request.flowKey ? resolveReportAgent({ flowKey: request.flowKey, agentId: request.agentId, config: request.config }) : null
  const agent = resolved?.agent || {}
  const selectedModel = resolveTextModelForAgent(agent)
  const modelCandidates = resolveTextModelCandidatesForAgent(agent)
  const configuredAgentPrompt = agentInstructionText(agent)
  const baseMessages = request.messages || [
    { role: 'system', content: '你是严格的 JSON 结构化信息整理助手。只输出 JSON 对象，不输出 Markdown，不输出解释。' },
    { role: 'user', content: request.prompt || '' },
  ]
  const messages = configuredAgentPrompt
    ? baseMessages.map((message, index) => index === 0 && message.role === 'system'
      ? { ...message, content: `以下是当前流程绑定的智能体规则，请严格遵守：\n${configuredAgentPrompt}\n\n${message.content}` }
      : message)
    : baseMessages
  const saved = readProviderConfig()
  const preferredKey = String(
    request.provider
    || selectedModel.provider
    || saved.defaultTextProvider
    || DEFAULT_TEXT_PROVIDER
    || saved.defaultProvider
    || DEFAULT_PROVIDER
    || '',
  ).toLowerCase()
  const merged = mergedProviders()
  const explicitProvider = Boolean(request.provider)
  const requestedModel = request.model || selectedModel.model
  const preferredCandidate = requestedModel ? [{ provider: preferredKey, model: requestedModel }] : []
  const agentCandidates = explicitProvider ? [] : modelCandidates
  const keyedCandidates = [...preferredCandidate, ...agentCandidates]
  const keys = explicitProvider && preferredKey
    ? [preferredKey]
    : preferredKey
    ? [preferredKey, ...Object.keys(merged).filter((key) => key !== preferredKey)]
    : Object.keys(merged)
  const seenCandidates = new Set()
  const candidates = keys
    .flatMap((key) => {
      const provider = merged[key] ? ({ key, ...merged[key] }) : null
      if (!providerKeyUsable(provider)) return []
      const modelKeys = keyedCandidates.filter((item) => item.provider === key).map((item) => item.model)
      if (!modelKeys.length) modelKeys.push(...availableProviderModels(provider, 'text'))
      return modelKeys.filter((model) => modelEnabled(provider, model)).map((model) => ({ provider, model }))
    })
    .filter((item) => {
      if (!providerKeyUsable(item.provider) || !item.model || !modelEnabled(item.provider, item.model)) return false
      const key = `${item.provider.key}:${item.model}`
      if (seenCandidates.has(key)) return false
      seenCandidates.add(key)
      return true
    })

  if (!candidates.length) {
    const error = new Error('未配置可用的文本大模型 API Key')
    error.statusCode = 503
    throw error
  }

  let lastError
  const attempts = []
  for (const item of (request.singleAttempt ? candidates.slice(0, 1) : candidates)) {
    const provider = item.provider
    const model = item.model
    try {
      attempts.push({ provider: provider.key, providerLabel: provider.label, baseUrl: safeBaseUrl(provider.baseUrl), model })
      const data = await postJson(provider, '/chat/completions', {
        model,
        messages,
        temperature: request.temperature ?? 0.2,
        response_format: request.responseFormat || { type: 'json_object' },
        ...(Number(request.maxTokens) > 0 ? { max_tokens: Math.min(8000, Math.floor(Number(request.maxTokens))) } : {}),
      }, request.timeoutMs || 90000, { singleAttempt: request.singleAttempt === true })
      const content = data?.choices?.[0]?.message?.content || data?.output_text || data?.text || ''
      const callResult = {
        provider: provider.key,
        model,
        json: extractJsonObjectSafe(content),
        agentId: agent.id || '',
        agentName: agent.name || '',
        flowKey: resolved?.flowKey || request.flowKey || '',
      }
      recordAgentCall({ flowKey: callFlowKey, agent, result: callResult, durationMs: Date.now() - callStartedAt, request })
      return callResult
    } catch (error) {
      if (error.diagnostic) error.diagnostic.attempts = attempts
      else error.diagnostic = { attempts, contentPreview: error.contentPreview || '' }
      lastError = error
    }
  }
  recordAgentCall({ flowKey: callFlowKey, agent, error: lastError, durationMs: Date.now() - callStartedAt, request })
  throw lastError || new Error('文本大模型解析失败')
}

async function generateTextJsonLegacy(request = {}) {
  if (request.provider && request.model) requireModelEnabled(getProvider(request.provider), request.model)
  const resolved = request.flowKey ? resolveReportAgent({ flowKey: request.flowKey, agentId: request.agentId, config: request.config }) : null
  const agent = resolved?.agent || {}
  const selectedModel = resolveTextModelForAgent(agent)
  const configuredAgentPrompt = agentInstructionText(agent)
  const baseMessages = request.messages || [
    { role: 'system', content: '你是严格的 JSON 结构化信息抽取助手。只输出 JSON，不输出解释。' },
    { role: 'user', content: request.prompt || '' },
  ]
  const messages = configuredAgentPrompt
    ? baseMessages.map((message, index) => index === 0 && message.role === 'system'
      ? { ...message, content: `以下是当前流程绑定的智能体规则，请遵守：\n${configuredAgentPrompt}\n\n${message.content}` }
      : message)
    : baseMessages
  const saved = readProviderConfig()
  const preferredKey = String(
    request.provider
    || selectedModel.provider
    || saved.defaultTextProvider
    || DEFAULT_TEXT_PROVIDER
    || saved.defaultProvider
    || DEFAULT_PROVIDER
    || '',
  ).toLowerCase()
  const merged = mergedProviders()
  const explicitProvider = Boolean(request.provider)
  const requestedModel = request.model || selectedModel.model
  const keys = explicitProvider && preferredKey
    ? [preferredKey]
    : preferredKey
    ? [preferredKey, ...Object.keys(merged).filter((key) => key !== preferredKey)]
    : Object.keys(merged)
  const candidates = keys
    .map((key) => merged[key] ? ({ key, ...merged[key] }) : null)
    .filter((provider) => providerKeyUsable(provider) && (requestedModel || provider.textModel))

  if (!candidates.length) {
    const error = new Error('未配置可用的文本大模型 API Key')
    error.statusCode = 503
    throw error
  }

  let lastError
  const attempts = []
  for (const provider of candidates) {
    const model = requestedModel || provider.textModel
    try {
      attempts.push({ provider: provider.key, providerLabel: provider.label, baseUrl: safeBaseUrl(provider.baseUrl), model })
      const data = await postJson(provider, '/chat/completions', {
        model,
        messages,
        temperature: request.temperature ?? 0.2,
        response_format: request.responseFormat || { type: 'json_object' },
      }, request.timeoutMs || 90000)
      const content = data?.choices?.[0]?.message?.content || data?.output_text || data?.text || ''
      return {
        provider: provider.key,
        model,
        json: extractJsonObject(content),
        agentId: agent.id || '',
        agentName: agent.name || '',
        flowKey: resolved?.flowKey || request.flowKey || '',
      }
    } catch (error) {
      if (error.diagnostic) error.diagnostic.attempts = attempts
      lastError = error
    }
  }
  throw lastError || new Error('文本大模型解析失败')
}

async function parseCourseDocumentWithAi(request = {}) {
  const text = String(request.text || '').replace(/\s+$/g, '').slice(0, 16000)
  if (!text.trim()) {
    const error = new Error('未读取到课程文档文字')
    error.statusCode = 400
    throw error
  }
  const categoryOptions = 'storefront=门头设计, ip=IP形象设计, ad=广告设计, anime=漫画人物设计, product=产品设计, interior=室内设计, car=汽车造型设计, creative=创意画, picturebook=教育绘本'
  const prompt = `请把下面的少儿/青少年美术课程文档整理成课程管理系统需要的 JSON。\n\n要求：\n1. 只输出 JSON 对象。\n2. category 必须从这些值中选择：${categoryOptions}。\n3. difficulty 输出类似“少儿基础 · 8-10岁”或“小学3-4年级（8-10岁）”。\n4. description 用 80-160 字概括课程目标、观察重点和创作任务。\n5. pptPages 生成 3-5 页，每页包含 title 和 body。\n6. questions 生成 3 道单选题，每题 3 个选项，answer 只能是 A/B/C。\n7. confidence 输出 0-1 数字。\n\n返回 JSON 结构：\n{\n  "title": "",\n  "category": "creative",\n  "difficulty": "",\n  "description": "",\n  "pptPages": [{"title":"", "body":""}],\n  "questions": [{"title":"", "options":["", "", ""], "answer":"A"}],\n  "confidence": 0.8\n}\n\n文件名：${request.fileName || '课程文档'}\n当前课程类型：${request.currentCategory || ''}\n当前适龄：${request.currentDifficulty || ''}\n\n课程正文：\n${text}`
  const result = await generateTextJson({
    flowKey: request.flowKey || 'course.parse',
    provider: request.provider,
    prompt,
    temperature: 0.15,
    timeoutMs: 90000,
  })
  return normalizeCourseParseResult(result.json, request, result.provider)
}

async function optimizeImagePrompt(request = {}) {
  const originalPrompt = String(request.prompt || '').trim()
  if (!originalPrompt) {
    const error = new Error('请先填写需要优化的提示词')
    error.statusCode = 400
    throw error
  }

  const strength = ['safe', 'balanced', 'creative'].includes(request.strength) ? request.strength : 'balanced'
  const strengthRule = {
    safe: '只整理语序和歧义，不增加用户未提到的主体、场景、风格或故事。',
    balanced: '补充必要的构图、色彩和材质表达，但不能改变主体，也不能虚构具体元素。',
    creative: '深入整理主体属性、空间关系和视觉层级，但只能展开用户已经提供的信息，不能引入新的创作方向。',
  }[strength]
  const result = await generateTextJson({
    flowKey: request.flowKey || 'paint.promptOptimize',
    temperature: strength === 'creative' ? 0.45 : 0.2,
    messages: [
      {
        role: 'system',
        content: `你当前负责 AI 绘画提示词优化。你的任务是优化用户原文，不是代替用户创作。${strengthRule}\n必须遵守：\n1. 保留用户明确写出的全部主体、数量、颜色、文字和关系。\n2. 不添加用户未提到的具体创意、故事、角色、商品、装饰物或品牌信息。\n3. 不添加用户未指定的画风、艺术媒介、摄影镜头、视角、光线、画质、用途或平台套话。\n4. 只能消除歧义、整理顺序，并把用户已有信息表达得更准确。\n5. 使用自然、具体、可直接用于图像生成的中文。\n6. 只返回 JSON：{"prompt":"优化后的提示词"}。`,
      },
      { role: 'user', content: originalPrompt },
    ],
  })
  const prompt = String(result.json?.prompt || '').trim()
  if (!prompt) {
    const error = new Error('提示词智能体没有返回有效内容')
    error.statusCode = 502
    throw error
  }
  return {
    prompt,
    provider: result.provider,
    model: result.model,
    agentId: result.agentId || '',
    agentName: result.agentName || '',
    flowKey: result.flowKey || request.flowKey || 'paint.promptOptimize',
  }
}

// —— 智能体试跑（干跑）------------------------------------------------------
// 后台改了人设/提示词，得能立刻知道"它现在会怎么理解这句话"，而不是去学生端点一次看结果。
// 这里只调一次文本模型做判断，**不触发出图、出视频、出报告**，所以不花钱、不动数据。
const AGENT_DRY_RUN_ACTIONS = [
  { key: 'action.image.generate', label: 'AI绘画 / 出图', page: 'AI绘画', spend: '1 张图' },
  { key: 'action.video.generate', label: 'AI视频 / 生成视频', page: 'AI视频', spend: '1 条视频' },
  { key: 'action.model3d.generate', label: 'AI 3D / 生成模型', page: 'AI 3D 世界', spend: '1 个模型' },
  { key: 'action.report.generate', label: '报告 / 生成报告', page: 'H5 报告中心', spend: '1 份报告' },
  { key: 'action.course.find', label: '课程 / 找课程讲课程', page: '课程', spend: '不花钱' },
  { key: 'action.library.find', label: '作品库 / 找作品', page: '我的作品库', spend: '不花钱' },
  { key: 'action.clarify', label: '先追问一句再动手', page: '通用', spend: '不花钱' },
  { key: 'action.chat', label: '只是聊天', page: '通用', spend: '不花钱' },
]
const AGENT_DRY_RUN_DEFAULT_ACTION = AGENT_DRY_RUN_ACTIONS[AGENT_DRY_RUN_ACTIONS.length - 1]

function buildAgentDryRunPrompt(agent = {}, text = '') {
  const actionLines = AGENT_DRY_RUN_ACTIONS
    .map((item) => `- ${item.key}：${item.label}（${item.page}，花费：${item.spend}）`)
    .join('\n')
  const persona = clipText(agentInstructionText(agent), 1500, '（这个智能体还没有写人设和规则）')
  return `你是「后台试跑分析器」，不是执行器。你唯一要做的事：判断下面这句话如果交给这个智能体，它会怎么理解。

【当前智能体】
名称：${textValue(agent.name, '未命名智能体')}
人设与规则：
${persona}

【可用动作】
${actionLines}

【待分析的话】
「${clipText(text, 300, '')}」

请严格输出一个 JSON 对象，不要 Markdown、不要解释：
{
  "intent": "generate_image | generate_video | generate_3d | generate_report | find_course | find_library | clarify | chat",
  "intentLabel": "一句中文，例如：要出图",
  "isCommand": true 或 false,
  "confidence": 0 到 1 的小数,
  "actionKey": "从可用动作里选一个",
  "filledPrompt": "如果它要帮你把描述整理清楚，写出整理后的完整描述；不需要整理就填空字符串",
  "additions": [{"label": "补了哪一类（光线/时间/画风/构图/色彩/比例）", "value": "补进去的内容", "why": "为什么敢补这一条"}],
  "missing": ["还缺的关键信息，没有就空数组"],
  "questions": ["如果必须先问一句才能做对，写在这里，最多 2 条"],
  "reason": "为什么这么判断，一句话"
}

判断规则（必须遵守）：
1. isCommand 只在「这句话是在明确要求现在就做」时为 true。像「我想画猫，但不知道背景用什么」是在想，不是在下令，isCommand 必须为 false。
2. 补全只补软信息：光线、时间、画风、构图、色彩倾向、画面比例。主体长相、画面上要写的汉字、具体数量、真实地点、品牌一律不补，缺了就写进 missing。
3. 补了什么必须逐条写进 additions，一条都不许悄悄补。没补就空数组。
4. additions 里每一条都要能被学生看懂，不要写「提升画面品质」这类空话。
5. intent 和 actionKey 必须匹配：intent=generate_image 就选 action.image.generate，以此类推。
6. 只输出 JSON。`
}

function normalizeAgentDryRunResult(json = {}, agent = {}) {
  const raw = json && typeof json === 'object' ? json : {}
  const action = AGENT_DRY_RUN_ACTIONS.find((item) => item.key === textValue(raw.actionKey, ''))
    || AGENT_DRY_RUN_DEFAULT_ACTION
  const toList = (value, limit) => (Array.isArray(value) ? value : [])
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, limit)
  const additions = (Array.isArray(raw.additions) ? raw.additions : [])
    .map((item) => (item && typeof item === 'object'
      ? {
        label: clipText(item.label, 12, ''),
        value: clipText(item.value, 60, ''),
        why: clipText(item.why, 60, ''),
      }
      : null))
    .filter((item) => item && item.value)
    .slice(0, 6)
  const confidence = Number(raw.confidence)
  return {
    agentId: agent.id || '',
    agentName: textValue(agent.name, ''),
    intent: textValue(raw.intent, 'chat'),
    intentLabel: textValue(raw.intentLabel, '无法判断'),
    isCommand: raw.isCommand === true,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
    actionKey: action.key,
    actionLabel: action.label,
    page: action.page,
    spend: action.spend,
    filledPrompt: clipText(raw.filledPrompt, 600, ''),
    additions,
    missing: toList(raw.missing, 6),
    questions: toList(raw.questions, 2),
    reason: clipText(raw.reason, 160, ''),
  }
}

async function previewAgentUnderstanding(request = {}) {
  const text = clipText(request.text, 300, '')
  if (!text) {
    const error = new Error('请先写一句话再试跑')
    error.statusCode = 400
    throw error
  }
  const state = readReportAgentConfig()
  const requestedAgentId = textValue(request.agentId, '')
  const agent = state.agents.find((item) => item.id === requestedAgentId)
    || state.agents.find((item) => item.status === 'enabled')
    || state.agents[0]
  if (!agent) {
    const error = new Error('还没有可试跑的智能体，请先新建一个')
    error.statusCode = 400
    throw error
  }
  const selected = resolveTextModelForAgent(agent)
  const startedAt = Date.now()
  const result = await generateTextJson({
    ...(selected.provider && selected.model ? { provider: selected.provider, model: selected.model } : {}),
    messages: [
      { role: 'system', content: '你是后台试跑分析器，只输出 JSON 对象，不输出 Markdown，不输出解释。' },
      { role: 'user', content: buildAgentDryRunPrompt(agent, text) },
    ],
    temperature: 0.1,
    timeoutMs: 45000,
    // 试跑走独立标识，不污染真实流程的统计
    logFlowKey: 'agent.dryRun',
    logSource: '后台试跑',
    logSummary: `试跑 ${text.length} 字`,
    logAgentId: agent.id,
    logAgentName: agent.name,
  })
  return {
    ok: true,
    provider: result.provider,
    model: result.model,
    durationMs: Date.now() - startedAt,
    ...normalizeAgentDryRunResult(result.json, agent),
  }
}

// —— 学生端智能体（前台共用一个） ---------------------------------------------
// 五个页面共用后台同一批智能体：按页面对应到已有 flowKey，走 bindings 找人。
// 这样后台「智能体配置」改谁管哪条流程，学生端立刻跟着变，不需要另建一套。
const STUDENT_AGENT_PAGES = [
  { key: 'paint', flowKey: 'paint.promptOptimize', label: 'AI 绘画', actionKey: 'action.image.generate' },
  { key: 'video', flowKey: 'video.storyboard', label: 'AI 视频', actionKey: 'action.video.generate' },
  { key: 'model3d', flowKey: 'model3d.description', label: 'AI 3D 世界', actionKey: 'action.model3d.generate' },
  { key: 'course', flowKey: 'course.parse', label: '课程', actionKey: 'action.course.find', minPromptLength: 2, promptHint: '课程页不出图、不出视频。这一页的 prompt 字段要写「用来在课程列表里搜课的关键词」，控制在 2~6 个字，比如「门头」「绘本」「入门」。不要写成长句子，也不要补光线画风这类出图信息。' },
  { key: 'report', flowKey: 'report.full', label: '项目报告', actionKey: 'action.report.generate', promptHint: '报告页的 prompt 字段写「这份报告要讲什么」，用小画家自己的口吻，2~4 句话，不要写画风光线这类出图信息。' },
]

function resolveStudentAgentPage(page) {
  return STUDENT_AGENT_PAGES.find((item) => item.key === textValue(page, '')) || STUDENT_AGENT_PAGES[0]
}

/**
 * 学生页面上的「画布快照」清洗。
 *
 * 前端把学生此刻在页面上设好的东西（提示词、风格、比例、张数、负面词、已出几张）
 * 一起发过来，这里只认白名单字段、逐项截断并丢掉空值。
 * 目的不是"多传"，而是让老师知道"学生手上正在做哪一张"——少传一项它就接不上上一张画。
 */
function normalizeAgentCanvasContext(raw) {
  const source = raw && typeof raw === 'object' ? raw : null
  if (!source) return null
  const out = {}
  const put = (key, value, limit) => {
    const text = clipText(value, limit, '')
    if (text) out[key] = text
  }
  put('prompt', source.prompt, 600)
  put('style', source.style, 60)
  put('ratio', source.ratio, 20)
  put('count', source.count, 10)
  put('negativePrompt', source.negativePrompt, 200)
  put('theme', source.theme, 60)
  put('duration', source.duration, 20)
  put('music', source.music, 30)
  put('edition', source.edition, 20)
  put('quality', source.quality, 20)
  // 已经生成过几张：只用于让模型说"在刚才那张上改"，不参与出图
  const done = Number(source.doneCount)
  if (Number.isFinite(done) && done > 0) out.doneCount = String(Math.min(999, Math.floor(done)))
  put('lastPrompt', source.lastPrompt, 600)
  return Object.keys(out).length ? out : null
}

/** 把画布快照拼成一小段中文，交给模型当"小画家现在手上是什么" */
function agentCanvasContextLines(context) {
  if (!context) return ''
  const rows = []
  const add = (label, value) => { if (value) rows.push(`- ${label}：${value}`) }
  add('画布上写的提示词', context.prompt)
  add('上次画出来的那句描述', context.lastPrompt)
  add('已选风格', context.style)
  add('画面比例', context.ratio)
  add('这次的张数', context.count)
  add('不想出现的元素', context.negativePrompt)
  add('主题分类', context.theme)
  add('视频时长', context.duration)
  add('配乐', context.music)
  add('模型版本', context.edition)
  add('清晰度', context.quality)
  add('这一轮已经画出几张', context.doneCount ? `${context.doneCount} 张` : '')
  if (!rows.length) return ''
  return `\n\n【小画家画布上现在是这样】\n${rows.join('\n')}`
}

// 学生端只允许「本页该做的动作 + 追问 + 聊天」。
// 在绘画页说要视频，不该悄悄生成视频——那是另一个页面的事，先引导过去。
function buildStudentAgentPrompt(agent = {}, text = '', pageDef = STUDENT_AGENT_PAGES[0], history = [], canvasContext = null) {
  const allowed = AGENT_DRY_RUN_ACTIONS.filter((item) => (
    item.key === pageDef.actionKey
    || item.key === 'action.clarify'
    || item.key === 'action.chat'
    || item.key === 'action.library.find'
    || item.key === 'action.course.find'
  ))
  const actionLines = allowed.map((item) => `- ${item.key}：${item.label}（花费：${item.spend}）`).join('\n')
  const persona = clipText(agentInstructionText(agent), 1200, '（这个智能体还没有写人设和规则）')
  const historyLines = (Array.isArray(history) ? history : [])
    .slice(-6)
    .map((item) => {
      const who = item?.role === 'agent' ? '你' : '小画家'
      return `${who}：${clipText(item?.content, 200, '')}`
    })
    .filter(Boolean)
    .join('\n')
  const canvasLines = agentCanvasContextLines(canvasContext)
  const canvasRule = canvasLines
    ? `
7. 【学生画布上现在是这样】里写的是学生此刻的真实设置，不是学生说的话。用法：
   - 学生说「改一下」「再大点」「重画」「颜色换掉」「再来一张」这类没有主体的指令时，指的就是画布上那张画。要在「画布上写的提示词 / 上次画出来的那句描述」的基础上改，保留原有的主体、风格和比例，只改学生点到的地方，不许另编一个全新主题。
   - 学生说的是全新主题（「我想画一只恐龙」），就按新主题来，画布内容只当风格和比例的参考。
   - 风格、比例、张数、负面词学生已经在画布上设好了，不要重复啰嗦；写进 prompt 时保持同一个风格词和比例。
   - prompt 字段要写成「可以直接拿去出图的完整描述」，把画布上仍然有效的部分并进去，不要只写改动的那半句。`
    : ''
  return `你是美术课堂里陪学生创作的老师，说话像一个有耐心的美术老师，不是机器人。
学生现在在「${pageDef.label}」页面跟你说话。${historyLines ? `\n\n【刚才聊过】\n${historyLines}` : ''}${canvasLines}

【你自己的人设与规则】
${persona}

【这次能做的事】
${actionLines}
${pageDef.promptHint ? `\n【这一页的特别注意】\n${pageDef.promptHint}\n` : ''}

【学生这句话】
「${clipText(text, 300, '')}」

请严格输出一个 JSON 对象，不要 Markdown、不要任何解释：
{
  "intent": "generate_image | generate_video | generate_3d | generate_report | find_course | find_library | clarify | chat",
  "isCommand": true 或 false,
  "readyToRun": true 或 false,
  "confidence": 0 到 1 的小数,
  "actionKey": "只能从上面列出的动作里选一个",
  "reply": "直接对小画家说的那句话，40 字以内，用你自己的人设口吻。不要写「已为您」这种客服腔。",
  "prompt": "整理给小画家看、也直接交给画图/生成用的完整描述。readyToRun=true 时必须写全；只是聊天就填空字符串。绘画/3D 控制在 200 字以内，视频控制在 120 字以内，报告控制在 150 字以内",
  "additions": [{"label": "补的类别", "value": "补的内容", "why": "为什么敢这么补"}],
  "missing": ["还缺的关键信息，最多 3 条"],
  "questions": ["必须先问小画家的一句，最多 2 条"],
  "reason": "一句话说明你的判断"
}

判断规则（必须遵守）：
1. 学生明确要求现在就做（帮我画、给我做一个、我要生成），isCommand = true；只是表达想法（我想画猫但不知道画什么背景）isCommand = false。
2. 只有当「主体明确 + 能补全的软信息已经补好」时 readyToRun 才为 true。主体不清楚（要画谁、做什么）一律 false，放进 questions。
3. 补全只补软信息：光线、时间、画风、构图、色彩倾向、画面比例、氛围。主体长相、画面上要写的汉字、具体数量、真实地点、品牌一律不补，缺了写进 missing。
4. 补了什么必须逐条写进 additions，不许悄悄补，最多 5 条。每条要让学生看懂，不要写「提升画面品质」这种空话。
5. 学生说的东西不在本页能做的范围（比如在绘画页要视频），actionKey 选 action.chat，reply 里告诉他去哪个页面。${canvasRule}
6. 只输出 JSON。`
}

function normalizeStudentAgentResult(json = {}, agent = {}, pageDef = STUDENT_AGENT_PAGES[0], fallbackText = '') {
  const raw = json && typeof json === 'object' ? json : {}
  const allowedKeys = new Set([
    pageDef.actionKey, 'action.clarify', 'action.chat',
    'action.library.find', 'action.course.find',
  ])
  const picked = AGENT_DRY_RUN_ACTIONS.find((item) => item.key === textValue(raw.actionKey, '') && allowedKeys.has(item.key))
  const action = picked || AGENT_DRY_RUN_DEFAULT_ACTION
  const toList = (value, limit) => (Array.isArray(value) ? value : [])
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, limit)
  const additions = (Array.isArray(raw.additions) ? raw.additions : [])
    .map((item) => (item && typeof item === 'object'
      ? {
        label: clipText(item.label, 12, ''),
        value: clipText(item.value, 60, ''),
        why: clipText(item.why, 60, ''),
      }
      : null))
    .filter((item) => item && item.value)
    .slice(0, 6)
  const confidence = Number(raw.confidence)
  const prompt = clipText(raw.prompt, 800, '')
  // 双保险：模型说能跑，但描述只有两三个字（多半是把学生原话抄回来），按不能跑处理。
  // 课程页例外：它要的就是两三个字的搜索关键词，门槛单独放宽。
  const minPromptLength = Number(pageDef.minPromptLength) || 8
  const readyToRun = raw.readyToRun === true && prompt.length >= minPromptLength && action.key === pageDef.actionKey
  return {
    agentId: agent.id || '',
    agentName: textValue(agent.name, ''),
    intent: textValue(raw.intent, 'chat'),
    isCommand: raw.isCommand === true,
    readyToRun,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
    actionKey: action.key,
    actionLabel: action.label,
    spend: action.spend,
    reply: clipText(raw.reply, 80, ''),
    prompt: readyToRun ? prompt : prompt || clipText(fallbackText, 300, ''),
    additions,
    missing: toList(raw.missing, 6),
    questions: toList(raw.questions, 2),
    reason: clipText(raw.reason, 160, ''),
  }
}

async function understandForStudent(request = {}) {
  const pageDef = resolveStudentAgentPage(request.page)
  const text = clipText(request.text, 300, '')
  if (!text) {
    const error = new Error('先说一句话吧')
    error.statusCode = 400
    throw error
  }
  const state = readReportAgentConfig()
  const boundId = state.bindings?.[pageDef.flowKey] || ''
  const agent = state.agents.find((item) => item.id === boundId)
    || state.agents.find((item) => item.status === 'enabled')
    || state.agents[0]
  if (!agent) {
    const error = new Error('还没有可用的 AI 伙伴，请管理员先在后台配置')
    error.statusCode = 400
    throw error
  }
  const selected = resolveTextModelForAgent(agent)
  const startedAt = Date.now()
  // 学生画布上此刻的设置（提示词/风格/比例/张数…）。缺了也能跑，只是老师接不上"上一张画"。
  const canvasContext = normalizeAgentCanvasContext(request.canvasContext)
  const result = await generateTextJson({
    ...(selected.provider && selected.model ? { provider: selected.provider, model: selected.model } : {}),
    messages: [
      { role: 'system', content: '你是美术课堂里的 AI 讲师，只输出 JSON 对象，不输出 Markdown，不输出解释。' },
      { role: 'user', content: buildStudentAgentPrompt(agent, text, pageDef, request.history, canvasContext) },
    ],
    temperature: 0.25,
    // 900 会让「整理后的描述」+ additions 写到一半被截断，JSON 直接烂掉（
    // 实测报 Expected ',' or ']' after array element）。给足余量，靠提示词约束长度。
    maxTokens: 1600,
    timeoutMs: 45000,
    // 走真实流程 key，后台「调用记录」里能看出是哪个页面在用。
    logFlowKey: pageDef.flowKey,
    logSource: `小画家端·${pageDef.label}`,
    logSummary: `小画家说 ${text.length} 字`,
    logAgentId: agent.id,
    logAgentName: agent.name,
  })
  return {
    ok: true,
    page: pageDef.key,
    pageLabel: pageDef.label,
    provider: result.provider,
    model: result.model,
    durationMs: Date.now() - startedAt,
    ...normalizeStudentAgentResult(result.json, agent, pageDef, text),
  }
}

// —— 课程页右侧智能体：课程对话（人设 + 答题 + 追问 + 收尾） ---------------------
// 与上面那个「五页共用一个」的学生智能体是两套东西，刻意不合并：
//   · 上面那套是「听懂你要干什么」，输出 actionKey，管的是执行动作；
//   · 这一套是「按这门课的人设陪你聊」，管的是教学对话，要按课程隔离记忆、要阶段锁。
// 会话落 user_documents（document_type='course-dialog'，resource_key=课程ID），
// 学生本来就能写这张表，天然按课程物理隔离，不会跨课程串场。
const COURSE_DIALOG_TEXT_LIMIT = 400

function courseQuestions(course = {}) {
  return Array.isArray(course?.questions) ? course.questions : []
}

/** 人设/轮次都以课程配置为准，课程没配就走 auto 判定 + 默认 8 轮。 */
function courseDialogOptions(course = {}) {
  const personaInfo = resolveCoursePersona(course)
  const rounds = Number(course.dialogMaxRounds)
  return {
    personaInfo,
    persona: personaInfo.persona,
    maxRounds: Number.isFinite(rounds) && rounds > 0 ? Math.min(Math.floor(rounds), 20) : 8,
    questionCount: courseQuestions(course).length,
  }
}

/**
 * 会话状态 + 课程信息一起回给前端。
 *
 * personaReason 是故意带的：老师问「为什么这门课是甲方人设」时，页面上能直接答出来，
 * 不用去翻后台。前端只做展示，不参与任何判定。
 */
function courseDialogPayload(course, state, options, extra = {}) {
  return {
    ok: true,
    courseId: course.id,
    courseTitle: course.title || '',
    persona: state.persona,
    personaName: personaName(state.persona),
    // 角色（甲方 / 带课老师）只用于后台说明与提示，页面上不显示副标题。
    personaRole: personaRole(state.persona),
    personaReason: options.personaInfo.reason,
    stage: state.stage,
    finished: state.stage === 'done',
    rounds: state.rounds,
    maxRounds: state.maxRounds,
    quiz: {
      total: state.quiz?.total || 0,
      answered: quizAnsweredCount(state),
      answers: state.quiz?.answers || [],
    },
    collected: state.collected || [],
    messages: state.messages || [],
    updatedAt: state.updatedAt || '',
    ...extra,
  }
}

/**
 * 读（或首次创建）某门课的对话。
 *
 * 首次进来必须把开场白落库：只在前端生成的话，刷新一次就换一句问候，
 * 学生会以为跟换了个人说话，已聊的内容也接不上。
 */
async function openCourseDialogForStudent(user, courseId) {
  const course = await getCourse(user, courseId)
  const options = courseDialogOptions(course)
  const stored = await loadCourseDialog(user, courseId)
  const state = normalizeDialogState(courseId, stored.data, {
    persona: options.persona,
    maxRounds: options.maxRounds,
    questionCount: options.questionCount,
  })
  // 课程改过（加题/删题/改轮次）时以课程为准，学生已答的记录保留不清空。
  state.persona = options.persona
  state.maxRounds = options.maxRounds
  state.quiz.total = options.questionCount

  const fresh = !stored.documentId
  if (fresh) {
    appendDialogMessage(state, { role: 'agent', content: buildOpening(course, state.persona), kind: 'text' })
    advanceStage(state, options.questionCount > 0 ? 'quiz' : 'dialog')
    const saved = await saveCourseDialog(user, courseId, state, stored)
    return courseDialogPayload(course, state, options, { documentId: saved.documentId, created: true })
  }
  // 老会话停留在 intro（早期没题目时建的）但课程后来加了题：补推一步，别让学生卡在开场白。
  if (state.stage === 'intro') {
    advanceStage(state, options.questionCount > 0 ? 'quiz' : 'dialog')
    await saveCourseDialog(user, courseId, state, stored)
  }
  return courseDialogPayload(course, state, options, { documentId: stored.documentId, created: false })
}

/**
 * 学生说一句话 → 智能体回一句。
 *
 * 三道防跑题闸门都在这一个函数里：
 *   1. 阶段锁：选择题没答完，只能做题，闲聊直接挡回去（不花模型钱、不计轮次）；
 *   2. 提示词里写死话题边界，并要求模型标注 offTopic；真跑题时前端会显示一句提醒；
 *   3. 轮次硬上限：到 maxRounds 直接把阶段推到 done 并收尾，不管模型想不想停。
 */
async function replyCourseDialogTurn(user, body = {}) {
  const courseId = clipText(body.courseId, 160, '')
  const studentText = clipText(body.text, COURSE_DIALOG_TEXT_LIMIT, '')
  if (!courseId) {
    const error = new Error('缺少课程编号。')
    error.statusCode = 400
    throw error
  }
  if (!studentText) {
    const error = new Error('先说一句话吧。')
    error.statusCode = 400
    throw error
  }

  const course = await getCourse(user, courseId)
  const options = courseDialogOptions(course)
  const stored = await loadCourseDialog(user, courseId)
  const state = normalizeDialogState(courseId, stored.data, {
    persona: options.persona,
    maxRounds: options.maxRounds,
    questionCount: options.questionCount,
  })
  state.persona = options.persona
  state.maxRounds = options.maxRounds
  state.quiz.total = options.questionCount

  // —— 闸门 1：答题阶段不许闲聊 ——
  const answered = quizAnsweredCount(state)
  if (options.questionCount > 0 && answered < options.questionCount && state.stage !== 'dialog' && state.stage !== 'wrapup' && state.stage !== 'done') {
    advanceStage(state, 'quiz')
    appendDialogMessage(state, { role: 'student', content: studentText, kind: 'text' })
    const line = `我们先把旁边那 ${options.questionCount} 道题做完（还剩 ${options.questionCount - answered} 道），做完我再跟你说正事。`
    appendDialogMessage(state, { role: 'agent', content: line, kind: 'notice' })
    const saved = await saveCourseDialog(user, courseId, state, stored)
    return courseDialogPayload(course, state, options, { documentId: saved.documentId, blockedByStage: true })
  }

  if (state.stage === 'intro') advanceStage(state, 'dialog')
  state.rounds = Math.min(state.rounds + 1, 40)
  appendDialogMessage(state, { role: 'student', content: studentText, kind: 'text' })

  const reachedLimit = state.rounds >= state.maxRounds
  const promptStage = reachedLimit ? 'wrapup' : state.stage

  let result = null
  let modelError = ''
  try {
    const prompt = buildCourseDialogPrompt({
      course,
      persona: state.persona,
      stage: promptStage,
      messages: state.messages,
      collected: state.collected,
      rounds: state.rounds,
      maxRounds: state.maxRounds,
      studentText,
      answeredCount: answered,
      questionCount: options.questionCount,
    })
    const call = await generateTextJson({
      messages: [
        { role: 'system', content: '你是课堂里的对话搭子，只输出 JSON 对象，不输出 Markdown，不输出解释。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.75,
      maxTokens: 900,
      timeoutMs: 45000,
      flowKey: 'course.studentAnswer',
      logSource: `小画家端·课程对话·${state.persona === 'client' ? '甲方' : '讲师'}`,
      logSummary: `${course.title || courseId} 第 ${state.rounds} 轮`,
    })
    result = normalizeDialogResult(call.json, '')
  } catch (error) {
    // 模型挂了不能让对话卡死：关键词兜底 + 固定话术，学生至少能继续往下走。
    modelError = error?.message || String(error)
    result = { reply: '', collected: extractByKeyword(studentText), missing: [], offTopic: false, wrapupReady: false, reason: '' }
  }

  state.collected = mergeCollected(state.collected, result.collected)
  const reply = result.reply || fallbackReply({
    persona: state.persona,
    stage: promptStage,
    rounds: state.rounds,
    maxRounds: state.maxRounds,
    collected: state.collected,
    studentText,
  })
  appendDialogMessage(state, { role: 'agent', content: reply, kind: 'text' })

  // —— 闸门 3：轮次硬上限 ——
  if (result.wrapupReady || reachedLimit) advanceStage(state, 'wrapup')
  if (reachedLimit) {
    advanceStage(state, 'done')
    state.finishedAt = new Date().toISOString()
    appendDialogMessage(state, {
      role: 'agent',
      content: '今天先聊到这儿。你把刚才说的这些画出来，画完我们再一起看。',
      kind: 'notice',
    })
  }

  const saved = await saveCourseDialog(user, courseId, state, stored)
  return courseDialogPayload(course, state, options, {
    documentId: saved.documentId,
    offTopic: result.offTopic === true,
    missing: result.missing || [],
    degraded: Boolean(modelError),
  })
}

/** 记一道题的作答。全部答完时自动把阶段推进到 dialog，并让智能体说一句过渡话。 */
async function submitCourseDialogAnswer(user, body = {}) {
  const courseId = clipText(body.courseId, 160, '')
  const questionIndex = Number(body.questionIndex)
  const choice = clipText(body.choice, 4, '').toUpperCase()
  if (!courseId) {
    const error = new Error('缺少课程编号。')
    error.statusCode = 400
    throw error
  }

  const course = await getCourse(user, courseId)
  const options = courseDialogOptions(course)
  const questions = courseQuestions(course)
  const question = questions[questionIndex]
  if (!question) {
    const error = new Error('题目不存在。')
    error.statusCode = 404
    throw error
  }
  if (!/^[ABCD]$/.test(choice)) {
    const error = new Error('请选择 A、B、C、D 其中一个。')
    error.statusCode = 400
    throw error
  }
  const letter = choice
  // 正确答案只在这里比对一次：前端拿不到 answer 字段也能判对错，
  // 但不把答案发给前端（否则学生打开控制台就能抄）。
  const correct = String(question.answer || 'A').toUpperCase() === letter

  const stored = await loadCourseDialog(user, courseId)
  const state = normalizeDialogState(courseId, stored.data, {
    persona: options.persona,
    maxRounds: options.maxRounds,
    questionCount: options.questionCount,
  })
  state.persona = options.persona
  state.maxRounds = options.maxRounds
  state.quiz.total = questions.length
  recordQuizAnswer(state, { questionIndex, choice: letter, correct })

  const answered = quizAnsweredCount(state)
  const finished = questions.length > 0 && answered >= questions.length
  const stageBefore = state.stage
  if (finished) {
    advanceStage(state, 'dialog')
    // 刚好答完这一下才说过渡话；重复提交（改答案）不再重复说。
    if (stageBefore === 'quiz' || stageBefore === 'intro') {
      const correctCount = (state.quiz?.answers || []).filter((item) => item.correct).length
      appendDialogMessage(state, {
        role: 'agent',
        content: buildQuizDoneLine(course, state.persona, { total: questions.length, correct: correctCount }),
        kind: 'text',
      })
    }
  }

  const saved = await saveCourseDialog(user, courseId, state, stored)
  return courseDialogPayload(course, state, options, {
    documentId: saved.documentId,
    correct,
    justFinishedQuiz: finished && stageBefore !== 'dialog',
  })
}

function normalizeCanvasAgentActions(rawActions, canvas = {}) {
  const knownIds = new Set((Array.isArray(canvas.nodes) ? canvas.nodes : []).map((node) => String(node?.id || '')).filter(Boolean))
  const plannedIds = new Set()
  const actions = []
  const warnings = []
  const canReference = (id) => {
    const value = String(id || '').slice(0, 160)
    return value && (knownIds.has(value) || plannedIds.has(value)) ? value : ''
  }
  const clampNumber = (value, fallback) => {
    const number = Number(value)
    return Number.isFinite(number) ? Math.max(-10000, Math.min(10000, number)) : fallback
  }
  // 归一化比例/坐标（0~1），用于 add_element_reference 的裁剪区域。
  const clampUnit = (value, min = 0, max = 1) => {
    const number = Number(value)
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : null
  }
  ;(Array.isArray(rawActions) ? rawActions : []).slice(0, 12).forEach((item, index) => {
    const type = String(item?.type || '')
    if (type === 'create_node') {
      const nodeType = ['text', 'image', 'video'].includes(item?.nodeType)
        ? item.nodeType
        : item?.mode === 'text-generation' ? 'text' : item?.mode === 'video-generation' ? 'video' : item?.mode === 'image-generation' ? 'image' : ''
      const clientId = String(item?.clientId || `agent-node-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80)
      if (!nodeType || !clientId || plannedIds.has(clientId)) {
        warnings.push(`第 ${index + 1} 步创建节点无效，已跳过`)
        return
      }
      plannedIds.add(clientId)
      const data = item?.data && typeof item.data === 'object' ? item.data : {}
      const config = data.config && typeof data.config === 'object' ? {
        model: String(data.config.model || '').slice(0, 160),
        ratio: String(data.config.ratio || '').slice(0, 20),
        resolution: String(data.config.resolution || '').slice(0, 20),
        duration: Number(data.config.duration || 0) || undefined,
      } : {}
      actions.push({
        type, clientId, nodeType,
        position: { x: clampNumber(item?.position?.x, 120 + actions.length * 360), y: clampNumber(item?.position?.y, 120) },
        data: {
          title: String(data.title || (nodeType === 'text' ? '文字生成' : nodeType === 'video' ? '视频生成' : '图像生成')).slice(0, 160),
          prompt: String(data.prompt || '').slice(0, 4000),
          config,
        },
      })
      return
    }
    if (type === 'update_node') {
      const nodeId = canReference(item?.nodeId || item?.targetNodeId)
      if (!nodeId) { warnings.push(`第 ${index + 1} 步修改了不存在的节点，已跳过`); return }
      const raw = item?.data || item?.patch || {}
      const data = {}
      if (typeof raw.title === 'string') data.title = raw.title.slice(0, 160)
      if (typeof raw.prompt === 'string') data.prompt = raw.prompt.slice(0, 4000)
      if (typeof raw.text === 'string') data.text = raw.text.slice(0, 6000)
      if (raw.config && typeof raw.config === 'object') data.config = { model: String(raw.config.model || '').slice(0, 160), ratio: String(raw.config.ratio || '').slice(0, 20), resolution: String(raw.config.resolution || '').slice(0, 20), duration: Number(raw.config.duration || 0) || undefined }
      // 自由文本节点样式（仅前端 mode=free-text 生效，这里只做白名单与数值范围约束）
      const rawStyle = raw.style && typeof raw.style === 'object' ? raw.style : null
      if (rawStyle) {
        const style = {}
        if (typeof rawStyle.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(rawStyle.color)) style.color = rawStyle.color
        if (typeof rawStyle.fontFamily === 'string' && rawStyle.fontFamily.trim()) style.fontFamily = rawStyle.fontFamily.trim().slice(0, 60)
        if (Number.isFinite(Number(rawStyle.fontSize))) style.fontSize = Math.min(240, Math.max(12, Number(rawStyle.fontSize)))
        if (Number.isFinite(Number(rawStyle.fontWeight))) style.fontWeight = Math.min(900, Math.max(100, Number(rawStyle.fontWeight)))
        if (['left', 'center', 'right'].includes(rawStyle.textAlign)) style.textAlign = rawStyle.textAlign
        if (Number.isFinite(Number(rawStyle.width))) style.width = Math.min(1200, Math.max(120, Number(rawStyle.width)))
        if (Number.isFinite(Number(rawStyle.minHeight))) style.minHeight = Math.min(1200, Math.max(40, Number(rawStyle.minHeight)))
        if (Object.keys(style).length) data.style = style
      }
      if (!Object.keys(data).length) { warnings.push(`第 ${index + 1} 步没有可修改字段，已跳过`); return }
      actions.push({ type, nodeId, data })
      return
    }
    if (type === 'move_node') {
      const nodeId = canReference(item?.nodeId || item?.targetNodeId)
      if (!nodeId) { warnings.push(`第 ${index + 1} 步移动了不存在的节点，已跳过`); return }
      actions.push({ type, nodeId, position: { x: clampNumber(item?.position?.x, 0), y: clampNumber(item?.position?.y, 0) } })
      return
    }
    if (type === 'delete_node') {
      const nodeId = canReference(item?.nodeId || item?.targetNodeId)
      if (!nodeId) { warnings.push(`第 ${index + 1} 步删除了不存在的节点，已跳过`); return }
      actions.push({ type, nodeId })
      return
    }
    if (type === 'create_edge') {
      const source = canReference(item?.source)
      const target = canReference(item?.target)
      if (!source || !target || source === target) { warnings.push(`第 ${index + 1} 步连线端点无效，已跳过`); return }
      actions.push({ type, id: String(item?.id || '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100), source, target })
      return
    }
    if (type === 'delete_edge') {
      const edgeId = String(item?.edgeId || item?.id || '').slice(0, 160)
      const source = canReference(item?.source)
      const target = canReference(item?.target)
      if (!edgeId && (!source || !target)) { warnings.push(`第 ${index + 1} 步删除连线的目标无效，已跳过`); return }
      actions.push({ type, edgeId, source, target })
      return
    }
    if (type === 'reference_element') {
      const nodeId = canReference(item?.nodeId || item?.targetNodeId)
      const source = canReference(item?.source || item?.sourceNodeId)
      if (!nodeId || !source) { warnings.push(`第 ${index + 1} 步引用标记元素的目标无效，已跳过`); return }
      const elementIds = Array.isArray(item?.elementIds)
        ? item.elementIds.map((value) => String(value || '').slice(0, 80)).filter(Boolean).slice(0, 12)
        : []
      actions.push({ type, nodeId, source, elementIds })
      return
    }
    if (type === 'group_nodes') {
      const nodeIds = Array.isArray(item?.nodeIds)
        ? item.nodeIds.map((value) => canReference(value)).filter(Boolean).slice(0, 24)
        : []
      if (nodeIds.length < 2) { warnings.push(`第 ${index + 1} 步成组节点不足 2 个，已跳过`); return }
      actions.push({ type, nodeIds, title: String(item?.title || '分组').slice(0, 40) })
      return
    }
    if (type === 'ungroup_nodes') {
      const groupIds = Array.isArray(item?.groupIds)
        ? item.groupIds.map((value) => canReference(value)).filter(Boolean).slice(0, 12)
        : []
      if (!groupIds.length) { warnings.push(`第 ${index + 1} 步解组的组无效，已跳过`); return }
      actions.push({ type, groupIds })
      return
    }
    if (type === 'save_as_template') {
      const nodeIds = Array.isArray(item?.nodeIds)
        ? item.nodeIds.map((value) => canReference(value)).filter(Boolean).slice(0, 24)
        : []
      const name = String(item?.name || '').trim().slice(0, 60)
      if (!nodeIds.length || !name) { warnings.push(`第 ${index + 1} 步存模板参数无效，已跳过`); return }
      actions.push({
        type,
        nodeIds,
        name,
        description: String(item?.description || '').slice(0, 300),
        scope: item?.scope === 'org' ? 'org' : 'private',
      })
      return
    }
    if (type === 'instantiate_template') {
      const templateId = String(item?.templateId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)
      if (!templateId) { warnings.push(`第 ${index + 1} 步模板 ID 无效，已跳过`); return }
      actions.push({
        type,
        templateId,
        position: item?.position
          ? { x: clampNumber(item.position.x, 0), y: clampNumber(item.position.y, 0) }
          : null,
      })
      return
    }
    if (type === 'add_element_reference') {
      const initiateNodeId = canReference(item?.initiateNodeId || item?.nodeId || item?.targetNodeId)
      const sourceNodeId = canReference(item?.sourceNodeId || item?.source)
      if (!initiateNodeId || !sourceNodeId) { warnings.push(`第 ${index + 1} 步元素引用端点无效，已跳过`); return }
      const raw = item?.region && typeof item.region === 'object' ? item.region : null
      const x = clampUnit(raw?.x)
      const y = clampUnit(raw?.y)
      const w = clampUnit(raw?.w, 0.02, 1)
      const h = clampUnit(raw?.h, 0.02, 1)
      if (x === null || y === null || w === null || h === null) { warnings.push(`第 ${index + 1} 步裁剪区域无效，已跳过`); return }
      actions.push({
        type,
        initiateNodeId,
        sourceNodeId,
        region: { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) },
        label: String(item?.label || '').slice(0, 24),
      })
      return
    }
    if (type === 'run_generator') {
      const nodeId = canReference(item?.nodeId || item?.targetNodeId)
      if (!nodeId) { warnings.push(`第 ${index + 1} 步运行了不存在的节点，已跳过`); return }
      const count = Number.isFinite(Number(item?.count)) ? Math.min(MAX_GENERATION_COUNT, Math.max(1, Number(item.count))) : 1
      actions.push({ type, nodeId, count })
      return
    }
    warnings.push(`第 ${index + 1} 步操作类型不受支持，已跳过`)
  })
  return { actions, warnings }
}

function legacyProposalsFromActions(actions, selectedNode = {}) {
  return actions.filter((item) => item.type === 'update_node').slice(0, 1).map((item) => ({
    type: item.data?.text ? 'set_node_text' : 'set_node_prompt',
    targetNodeId: item.nodeId || selectedNode.id || '',
    summary: '写入 AI 生成内容',
    payload: { text: item.data?.text || '', prompt: item.data?.prompt || '', mode: 'image-generation' },
  }))
}

// ───────────────────────── 画布「文字节点生成」专用链路 ─────────────────────────
// 旧实现把 generate-text 塞进 runCanvasAssistant（工作流 Agent）里跑，带来两个硬伤：
//   ① 系统提示词是「你是画布 Agent，先分析再返回 actions」→ 模型习惯回「我打算…请确认」，
//      而旧代码把这个 reply 无条件当成节点正文写回 → 节点里出现"工作汇报"而不是内容；
//   ② user message 是纯文本 JSON，上游图片只有 assetId 字符串 → 模型完全看不到图。
// 下面这条链路专门负责「看图 + 写字」：提示词只要求返回 {"text": "..."}，图片按多模态数组真实发送。

const CANVAS_VISION_MAX_EDGE = 1024
const CANVAS_VISION_INLINE_LIMIT = 900 * 1024
const CANVAS_VISION_MAX_IMAGES = 6
// 有图时优先尝试的读图模型（按顺序）。deepseek-v4.1-flash 与 agnes-2.5-flash 均已实测能正确识图。
const CANVAS_VISION_MODEL_PRIORITY = ['deepseek-v4.1-flash', 'agnes-2.5-flash', 'doubao-seed-evolving', 'gpt-4.1-mini']

const CANVAS_TEXT_WRITER_PROMPT = `你是画布里的「文字创作助手」。你的唯一任务是：根据用户给出的素材和写作要求，直接写出最终可以放进画布节点的正文。

严格遵守：
1. 只输出一个 JSON 对象，形如 {"text": "最终正文"}。不要输出 actions、计划、步骤编号或任何解释。
2. text 必须是已经写好的成品内容本身，不是"我打算怎么写""我将为你整理""请确认以下方向"这类说明性文字。绝对不要向用户提问、不要请求确认、不要复述任务。
3. 如果消息里附带了图片，你必须先仔细观察图片里的真实内容（主体物品、颜色、材质、场景、图中可辨认的文字），把看到的具体信息写进正文；看不清或没有的部分就省略，绝不凭空编造。
4. 若上游素材无法读取（例如图片打不开），就在正文里只写你能确认的内容，不要虚构细节，也不要用说明文字替自己解释。
5. 用中文，按用户要求的格式组织。用户没要求格式时，用简短的分段或短句列出要点，不要加 Markdown 代码块。`

// 从节点上下文里收集所有可能是图片的字段（新老画布字段名不一致，全部覆盖）。
// 注意：前端 assistantNodeContext 产出的是「扁平」对象（image 直接在最外层），
// 但画布快照里的节点是 { id, type, data:{...} } 结构，两种都要能读。
function canvasNodeImageCandidates(node = {}) {
  const flat = node && typeof node === 'object' ? node : {}
  const data = flat.data && typeof flat.data === 'object' ? flat.data : flat
  const pickOutput = (source) => (source?.output && typeof source.output === 'object' ? source.output : {})
  const output = { ...pickOutput(data), ...pickOutput(flat) }
  const values = [
    data.image,
    data.imageUrl,
    data.thumbnail,
    data.url,
    data.outputUrl,
    data.assetUrl,
    flat.image,
    flat.imageUrl,
    flat.thumbnail,
    flat.outputUrl,
    flat.assetUrl,
    output.url,
    output.imageUrl,
    output.assetUrl,
    output.image,
    output.thumbnail,
  ]
  const assetId = String(data.assetId || flat.assetId || output.assetId || '').trim()
  if (assetId) values.push(`/api/assets/${encodeURIComponent(assetId)}`)
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}

// 把任意形态的图片引用变成模型可直接消费的 data URL，并压缩到适合单次请求的体积。
// 远程 http(s) 交给模型自己去取（省一次下载）；本地 /api 资产复用 prepareReferenceImages 的完整校验链。
async function shrinkVisionImage(dataUrl) {
  const match = String(dataUrl || '').trim().match(/^data:image\/([a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i)
  if (!match) return ''
  const mime = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase()
  let buffer
  try {
    buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64')
  } catch {
    return ''
  }
  if (!buffer.length) return ''
  const passthrough = /^(png|jpeg|webp)$/.test(mime) && buffer.length <= CANVAS_VISION_INLINE_LIMIT
  try {
    const meta = await sharp(buffer, { animated: false }).metadata()
    const longest = Math.max(Number(meta.width || 0), Number(meta.height || 0))
    if (passthrough && longest <= CANVAS_VISION_MAX_EDGE) return `data:image/${mime};base64,${buffer.toString('base64')}`
    const pipeline = sharp(buffer, { animated: false }).rotate()
    if (longest > CANVAS_VISION_MAX_EDGE) {
      pipeline.resize({ width: CANVAS_VISION_MAX_EDGE, height: CANVAS_VISION_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    }
    const output = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    return output.length ? `data:image/jpeg;base64,${output.toString('base64')}` : ''
  } catch {
    // sharp 解不了的格式（极少见）：小图直接透传，大图丢弃并由上层报出来，绝不静默当成"没图"。
    return passthrough ? `data:image/${mime};base64,${buffer.toString('base64')}` : ''
  }
}

async function canvasImageToVisionDataUrl(value, user) {
  const source = String(value || '').trim()
  if (!source) return ''
  if (/^data:image\//i.test(source)) return await shrinkVisionImage(source)
  if (/^https?:\/\//i.test(source)) return source
  if (!/^\/api\//i.test(source)) return ''
  const prepared = await prepareReferenceImages([source], { user })
  return prepared.images.length ? await shrinkVisionImage(prepared.images[0]) : ''
}

// 解析上游节点的图片。返回值同时给出"哪些节点有图但读不出来"，好让前端把静默失效变成可见提示。
async function resolveCanvasVisionImages(upstream = [], user) {
  const entries = await Promise.all((Array.isArray(upstream) ? upstream : []).map(async (node) => {
    const candidates = canvasNodeImageCandidates(node)
    const label = String(node?.title || node?.id || '未命名节点').slice(0, 60)
    if (!candidates.length) return null
    for (const candidate of candidates) {
      const dataUrl = await canvasImageToVisionDataUrl(candidate, user)
      if (dataUrl) return { id: String(node?.id || ''), title: label, dataUrl }
    }
    return { id: String(node?.id || ''), title: label, dataUrl: '' }
  }))
  const resolved = entries.filter(Boolean)
  const images = resolved.filter((item) => item.dataUrl).slice(0, CANVAS_VISION_MAX_IMAGES)
  const dropped = resolved.filter((item) => !item.dataUrl)
  return { images, dropped }
}

// 组装给模型的写作简报（文字素材 + 图片清单 + 无法读取的告警）。
function buildCanvasTextBrief({ message, selectedNode, upstream, images, dropped }) {
  const lines = ['【写作要求】', String(message || '').trim()]
  const upstreamTexts = (Array.isArray(upstream) ? upstream : [])
    .map((node) => ({ label: String(node?.title || node?.id || '上游节点').slice(0, 60), text: String(node?.text || node?.prompt || '').trim() }))
    .filter((item) => item.text)
  if (upstreamTexts.length) {
    lines.push('', '【上游文字素材】')
    upstreamTexts.forEach((item, index) => lines.push(`文字${index + 1}（来自节点「${item.label}」）：${item.text.slice(0, 2000)}`))
  }
  if (images.length) {
    lines.push('', `【上游图片素材】本次消息已附带 ${images.length} 张图片，按下列顺序对应：`)
    images.forEach((item, index) => lines.push(`图${index + 1}：来自节点「${item.title}」`))
    lines.push('请逐张仔细观察图中的真实内容（物品类别、外观、颜色、材质、场景、图中文字），据此填写正文，不要编造图中没有的信息。')
  }
  if (dropped.length) {
    lines.push('', `【注意】上游有 ${dropped.length} 个节点的图片无法读取（${dropped.map((item) => item.title).join('、')}），这部分内容你看不到，请不要凭空编造。`)
  }
  const currentText = String(selectedNode?.text || '').trim()
  if (currentText) {
    lines.push('', '【节点当前已有内容（如需在此基础上改写，保留其中有效信息）】', currentText.slice(0, 3000))
  }
  lines.push('', '现在直接输出 {"text": "最终正文"}。')
  return lines.join('\n')
}

// 从模型返回的 JSON 里取出正文。兼容几种常见的键名，避免只认 text 而漏掉 content/result。
function extractCanvasTextResult(json) {
  if (!json || typeof json !== 'object') return ''
  for (const key of ['text', 'content', 'result', 'body', 'output']) {
    const value = json[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (value && typeof value === 'object') {
      const nested = extractCanvasTextResult(value)
      if (nested) return nested
    }
  }
  return ''
}

// 兜底防线：即使模型没听话，也不让"我要怎么干"这类自述被当成正文写进节点。
const CANVAS_NARRATION_SIGNALS = ['我打算', '我将会', '我将为你', '我会先', '接下来我', '请确认', '是否需要', '以下是针对', '我的计划', '我先分析', '以下是为你整理的方向', '请告诉我', '需要你确认', '我建议先']
// 「我看不到这张图」这类说明同样是过程话，不是成品正文。
const CANVAS_BLIND_SIGNALS = ['无法读取', '看不到', '没有看到任何', '无法查看', '未能获取到图片', '图片不可用']
function looksLikeCanvasNarration(text) {
  const value = String(text || '').trim()
  if (!value) return false
  if (value.length > 900) return false
  const hits = CANVAS_NARRATION_SIGNALS.filter((signal) => value.includes(signal))
  return hits.length > 0
}

function looksLikeCanvasBlindNote(text) {
  const value = String(text || '').trim()
  if (!value || value.length > 400) return false
  return CANVAS_BLIND_SIGNALS.some((signal) => value.includes(signal))
}

// 画布文字节点的模型候选：显式指定最优先；有图时把已实测可读图的模型提到前面；
// 最后才回落到默认文本供应商，保证"配置了 key 的模型都能被尝试到"。
function canvasTextModelCandidates({ hasImages, provider, model }) {
  const merged = mergedProviders()
  const saved = readProviderConfig()
  const seen = new Set()
  const candidates = []
  const push = (key, name) => {
    const item = merged[key]
    if (!item?.apiKey || item.enabled === false) return
    const trimmed = String(name || '').trim()
    if (!trimmed || !modelEnabled(item, trimmed)) return
    const id = `${key}:${trimmed}`
    if (seen.has(id)) return
    seen.add(id)
    candidates.push({ provider: key, model: trimmed })
  }
  const explicitKey = String(provider || '').toLowerCase().trim()
  if (explicitKey && model) push(explicitKey, model)
  if (hasImages) {
    for (const name of CANVAS_VISION_MODEL_PRIORITY) {
      for (const [key, item] of Object.entries(merged)) {
        const models = [item.textModel, ...(Array.isArray(item.textModels) ? item.textModels : [])].map((value) => String(value || '').trim())
        if (models.includes(name)) push(key, name)
      }
    }
  }
  const fallbackKey = String(saved.defaultTextProvider || DEFAULT_TEXT_PROVIDER || saved.defaultProvider || DEFAULT_PROVIDER || '').toLowerCase()
  if (fallbackKey && model) push(fallbackKey, model)
  for (const [key, item] of Object.entries(merged)) {
    push(key, item.textModel)
    for (const name of (Array.isArray(item.textModels) ? item.textModels : [])) push(key, name)
  }
  return candidates
}

async function runCanvasTextGeneration(request = {}, options = {}) {
  const message = String(request.message || '').trim().slice(0, 8000)
  if (!message) {
    const error = new Error('请先输入要生成的内容要求')
    error.statusCode = 400
    throw error
  }
  const storedAgent = readCreativeAgentConfig().canvasAgent || {}
  if (storedAgent.enabled === false) {
    const error = new Error('无限画布智能体当前已在后台停用，请先启用后再使用。')
    error.statusCode = 503
    throw error
  }
  const selectedNode = request.selectedNode && typeof request.selectedNode === 'object' ? request.selectedNode : {}
  const upstream = Array.isArray(request.upstream) ? request.upstream.slice(0, 8) : []
  const vision = await resolveCanvasVisionImages(upstream, options.user)
  const warnings = []
  if (vision.dropped.length) {
    warnings.push(`上游有 ${vision.dropped.length} 个节点的图片无法读取（${vision.dropped.map((item) => item.title).join('、')}），本次生成未包含这些图片。`)
  }
  const brief = buildCanvasTextBrief({ message, selectedNode, upstream, images: vision.images, dropped: vision.dropped })
  const userContent = vision.images.length
    ? [
      { type: 'text', text: brief },
      ...vision.images.map((item) => ({ type: 'image_url', image_url: { url: item.dataUrl } })),
    ]
    : brief
  const messages = [
    { role: 'system', content: CANVAS_TEXT_WRITER_PROMPT },
    { role: 'user', content: userContent },
  ]
  const candidates = canvasTextModelCandidates({
    hasImages: vision.images.length > 0,
    provider: request.provider || '',
    model: request.model || '',
  })
  if (!candidates.length) {
    const error = new Error('未配置可用的文本大模型 API Key，无法生成文字')
    error.statusCode = 503
    throw error
  }
  let lastError
  const attempts = []
  for (const candidate of candidates) {
    try {
      attempts.push({ provider: candidate.provider, model: candidate.model, images: vision.images.length })
      const result = await generateTextJson({
        provider: candidate.provider,
        model: candidate.model,
        temperature: 0.4,
        messages,
        responseFormat: { type: 'json_object' },
        singleAttempt: true,
      })
      const text = extractCanvasTextResult(result.json)
      if (!text) {
        lastError = new Error('模型没有返回可用的正文内容')
        lastError.contentPreview = JSON.stringify(result.json || {}).slice(0, 500)
        continue
      }
      if (looksLikeCanvasNarration(text)) {
        // 模型仍回了自述：不写进节点，直接把问题暴露给用户，避免正文被污染。
        warnings.push('模型返回的是操作说明而不是正文，已拦截。请把要求写得更具体（例如"按品名/外观/卖点分三段"）后重试。')
        return {
          reply: '',
          refinePrompt: '',
          actions: [],
          proposals: [],
          warnings,
          provider: result.provider,
          model: result.model,
          phase: 'failed',
          plan: [],
          agentState: { phase: 'failed', updatedAt: new Date().toISOString() },
        }
      }
      if (vision.dropped.length && looksLikeCanvasBlindNote(text)) {
        // 图片读不到 + 模型在解释"我看不到" → 这是过程说明，不是正文，同样不能写进节点。
        warnings.push('上游图片未能读取，本次没有可写入的正文。请确认图片节点正常后重试。')
        return {
          reply: '',
          refinePrompt: '',
          actions: [],
          proposals: [],
          warnings,
          provider: result.provider,
          model: result.model,
          phase: 'failed',
          plan: [],
          agentState: { phase: 'failed', updatedAt: new Date().toISOString() },
        }
      }
      if (vision.images.length && !/图\s*[1-9]|图片|图中/.test(text) && text.length < 60) {
        warnings.push('上游图片已发送给模型，但生成内容较短，建议在要求里写明要提取哪些信息。')
      }
      return {
        reply: text,
        refinePrompt: '',
        actions: [],
        proposals: [{
          type: 'set_node_text',
          targetNodeId: String(selectedNode.id || '').slice(0, 160),
          summary: '写入生成的文字',
          payload: { text, prompt: '', mode: 'image-generation' },
        }],
        warnings,
        provider: result.provider,
        model: result.model,
        phase: 'executing',
        plan: [],
        agentState: { phase: 'executing', updatedAt: new Date().toISOString() },
        vision: { images: vision.images.length, dropped: vision.dropped.length },
      }
    } catch (error) {
      error.diagnostic = { ...(error.diagnostic || {}), attempts }
      lastError = error
    }
  }
  if (warnings.length) {
    const error = lastError || new Error('文字生成失败，请稍后重试')
    // 失败时把"图没读到"这类告警拼进错误信息，避免用户只看到一句笼统的失败原因。
    error.message = `${error.message || '文字生成失败'}（${warnings.join(' ')}）`
    error.canvasWarnings = warnings
  }
  throw lastError || new Error('文字生成失败，请稍后重试')
}

const CANVAS_ATTACHMENT_INSTRUCTION = '用户上传了一张参考图，希望据此与画布助手沟通。请用中文客观描述这张图：主体内容、风格、配色、构图与画幅比例、画面中的文字要点。只输出描述文本，不要加标题、编号、Markdown 或引号，控制在 200 字以内，便于后续作为上下文使用。'

// 画布助手的附件解析：图片走视觉模型转述为文字；纯文本直接截断返回。
// 复用区域识别的候选模型解析逻辑（同一条 chat/completions 视觉链路）。
async function parseCanvasAttachment(request = {}) {
  const kind = String(request.kind || '').toLowerCase()
  const mime = String(request.mime || '').toLowerCase()
  const isImage = kind === 'image' || /^image\//.test(mime)
  if (!isImage) {
    const text = String(request.text || '').trim().slice(0, 6000)
    if (!text) {
      const error = new Error('附件内容为空，无法解析')
      error.statusCode = 400
      throw error
    }
    return { description: `用户提供的文本附件《${String(request.name || '未命名').slice(0, 60)}》内容：\n${text}`, provider: '', model: '' }
  }
  const blocked = regionRecognitionGuard()
  if (blocked) {
    const error = new Error(blocked)
    error.statusCode = 503
    throw error
  }
  const image = parseRegionImageDataUrl(request.dataUrl)
  const candidates = resolveRegionDescribeCandidates(request)
  if (!candidates.length) {
    const error = new Error('未配置可用的文本大模型（API Key 或文本模型），无法读取图片附件')
    error.statusCode = 503
    throw error
  }
  const messages = [{
    role: 'user',
    content: [
      { type: 'text', text: CANVAS_ATTACHMENT_INSTRUCTION },
      { type: 'image_url', image_url: { url: image } },
    ],
  }]
  const attempts = []
  let lastError
  for (const item of candidates) {
    const { provider, model } = item
    attempts.push({ provider: provider.key, providerLabel: provider.label, baseUrl: safeBaseUrl(provider.baseUrl), model })
    try {
      const data = await postJson(provider, '/chat/completions', { model, messages, temperature: 0.2 }, 60000)
      const text = extractAssistantText(data).trim()
      if (!text) {
        const error = new Error(`${provider.label} 未能描述这张图片`)
        error.statusCode = 502
        throw error
      }
      return { description: text.slice(0, 800), provider: provider.key, model }
    } catch (error) {
      if (error.diagnostic) error.diagnostic.attempts = attempts
      else error.diagnostic = { attempts }
      lastError = error
    }
  }
  const error = new Error(regionDescribeErrorMessage(lastError))
  error.statusCode = regionDescribeStatus(lastError)
  throw error
}

async function runCanvasAssistant(request = {}, options = {}) {
  // 文字节点生成是另一件事（看图 + 写字），不共用工作流 Agent 的 actions 提示词，
  // 否则模型会回"我打算怎么做"并被当正文写进节点。这里做一次兜底分流。
  if (request.operation === 'generate-text') return await runCanvasTextGeneration(request, options)
  const message = String(request.message || '').trim().slice(0, 4000)
  const storedAgent = readCreativeAgentConfig().canvasAgent || {}
  const conversation = Array.isArray(request.conversation) ? request.conversation.slice(-10).map((item) => ({ role: item?.role === 'assistant' ? 'assistant' : 'user', content: String(item?.content || item?.text || '').slice(0, 3000) })).filter((item) => item.content) : []
  const incomingState = request.agentState && typeof request.agentState === 'object' ? request.agentState : {}
  const execution = request.execution && typeof request.execution === 'object' ? request.execution : null
  if (storedAgent.enabled === false) return { reply: '无限画布智能体当前已在后台停用，请先启用后再使用。', phase: 'failed', plan: [], agentState: { ...incomingState, phase: 'failed', updatedAt: new Date().toISOString() }, actions: [], warnings: ['后台配置已停用此智能体'], provider: '', model: '' }
  const hasSpecificBrief = /(主题|商品|产品|品牌|文案|卖点|价格|素材|参考图|尺寸|比例|风格|颜色|受众|平台|输出)/.test(message)
  const genericWorkflowRequest = /(工作流|流程|创作|制作|搭建|做一个|帮我做|生成一个)/.test(message)
  const continuationRequest = /(继续|按刚才|下一步|上一步|接着)/.test(message)
  const shortWorkflowBrief = message.length <= 120 && genericWorkflowRequest && !continuationRequest
  if (storedAgent.enabled !== false && storedAgent.rules?.askWhenUnclear !== false && message && shortWorkflowBrief && !hasSpecificBrief) {
    const clarification = '可以。先确认几个关键点，我再为你搭建完整工作流：\n\n1. 最终要完成什么结果？例如图片、视频、文案、课程方案或其他内容。\n2. 主要内容、主题或对象是什么？\n3. 需要使用哪些素材或已有节点？\n4. 输出平台、尺寸、比例、时长或格式有什么要求？\n5. 这次是先搭建工作流，还是要直接生成最终结果？\n\n你补充后，我会先整理创作流程，再开始创建节点和连线。'
    return { reply: clarification, phase: 'clarifying', plan: [], agentState: { ...incomingState, phase: 'clarifying', pendingQuestions: ['最终结果', '主题或对象', '素材或已有节点', '输出规格', '是否立即生成'], updatedAt: new Date().toISOString() }, actions: [], warnings: ['需求信息不足，已暂停创建节点'], provider: '', model: '' }
  }
  if (!message) {
    const error = new Error('请先输入要和 AI 画布助手讨论的内容')
    error.statusCode = 400
    throw error
  }
  const selectedNode = request.selectedNode && typeof request.selectedNode === 'object' ? request.selectedNode : {}
  const upstream = Array.isArray(request.upstream) ? request.upstream.slice(0, 8) : []
  const canvas = request.canvas && typeof request.canvas === 'object' ? {
    nodes: Array.isArray(request.canvas.nodes) ? request.canvas.nodes.slice(0, 120) : [],
    edges: Array.isArray(request.canvas.edges) ? request.canvas.edges.slice(0, 240) : [],
  } : { nodes: [], edges: [] }
  const operation = request.operation === 'generate-text' ? 'generate-text' : 'assist'
  const result = await generateTextJson({
    provider: request.provider || '',
    model: request.model && !['创作 Agent', '提示词专家', '视觉分析'].includes(request.model) ? request.model : '',
    temperature: operation === 'generate-text' ? 0.35 : 0.2,
    messages: [
      {
        role: 'system',
        content: `你是无限画布的 AI 工作流 Agent。以下是后台配置的完整智能体提示词，请严格遵守：\n${storedAgent.prompt || ''}\n\n你必须先分析整张画布，再决定是提问还是返回可直接执行的操作。信息足够时，请一次性返回完整的 3-8 步执行计划（actions 按依赖顺序排列：create_node 在前、引用它的 create_edge 在后），不要只返回第一步。前端会立即整批执行 actions，不需要用户二次确认；不要声称执行了未返回的操作。
只输出 JSON 对象：{"reply":"中文执行结果说明","refinePrompt":"（可选）当本次是看图评价时，给出可直接用于重绘的改进提示词","actions":[{"type":"create_node|update_node|move_node|delete_node|create_edge|delete_edge|run_generator|reference_element|group_nodes|ungroup_nodes|save_as_template|instantiate_template|add_element_reference", "clientId":"新节点临时ID", "nodeId":"已有节点ID或临时ID", "nodeType":"text|image|video", "position":{"x":0,"y":0}, "source":"节点ID", "target":"节点ID", "elementIds":["要引用的标记元素ID"], "count":1, "nodeIds":["要成组/存模板的节点ID","至少2个"], "groupIds":["要解散的分组节点ID"], "templateId":"模板ID", "name":"模板名称", "description":"模板说明", "scope":"private|org", "initiateNodeId":"接收元素引用的节点ID", "sourceNodeId":"被裁剪图片所在的节点ID", "region":{"x":0.1,"y":0.1,"w":0.5,"h":0.5}, "label":"元素名称", "data":{"title":"","prompt":"","text":"","style":{"color":"#20242b","fontSize":42,"fontWeight":700,"textAlign":"left","width":360,"minHeight":72},"config":{"model":"","ratio":"","resolution":"","duration":0}}}],"warnings":["可选警告"]}
规则：
1. create_node 必须先于引用它的 create_edge，必须有唯一 clientId；只允许 text、image、video。
2. 已有节点能复用时不要重复创建；新建节点必须同时规划位置和必要连线。
3. update_node 只能修改 title、prompt、text、config、style；style 仅对自由文本节点（mode=free-text）生效，可改 color/fontSize/fontWeight/textAlign/width/minHeight；move_node 只能修改位置；delete_node 会同时删除关联连线。
4. 用户没有明确要求生成结果时，只搭建或修改工作流，不返回 run_generator；明确要求出图/出视频时，run_generator 必须放在最后。
4.1 请求中的 availableNodeTypes 是画布真实节点清单，含 nodeType、role、accepts/produces 连线方向与 desc 用途说明，规划连线时必须依据它：upload 节点只能作为素材源连向生成节点，result 节点只接收输入。可复用已有节点时优先复用，不要重复造。
5. 不得返回脚本、任意 HTTP、音频、循环、条件分支或未知节点操作。
6. actions 一次最多 12 项（典型 3-8 项）；信息足够时一次给出完整计划，不要拆成多次只返回第一步；即使只需要解释，也必须返回 actions=[]，不要伪造已完成。以下情况视为信息不足：只有“做一个海报/视频/工作流”等目标，但没有主题或内容、素材来源、输出类型/尺寸中的至少两项。信息不足时 reply 只提出 1-3 个简短问题，并返回 actions=[]。所有说明使用中文。
7. 若画布快照中某节点带有 outputUrl，或用户提供了附件分析文字，说明你已能看到具体内容：应结合画面实际给出针对性评价与改进建议（如构图、配色、文案），不要泛泛而谈。
8. 画布快照中，自由文本节点可能带 style（color/fontSize/fontWeight/textAlign/width/minHeight），生成节点可能带 promptParts（提示词结构片，含 text/reference/element 三类）与 elements（已标记的局部元素，含 id 与内容）。需要改文本排版时用 update_node 的 style 字段；评价或编辑时优先复用已有结构片，不要重复添加。只使用系统已支持的操作，不要臆造动作。
9. reference_element：把某个节点的标记元素（elements）作为局部参考，引用到另一个生成节点的提示词。source 是被引用元素的来源节点，nodeId 是接收引用的生成节点，elementIds 指定具体元素（省略则引用该来源节点的全部元素）。这是纯结构操作，重复的元素片会被自动去重。
10. run_generator 可带 count（1-4）：用户明确要「多张 / 多版本 / 几个方案」时用它批量出图，count 越大越慢、越耗额度，无明确要求时保持 1。
11. 当用户要求评价 / 点评画面，且快照中该节点带有 outputUrl（说明你已能看到画面）时：reply 用「亮点 / 问题 / 修改建议」三段式简明作答，并在 refinePrompt 中给出可直接用于重绘的改进提示词；此时 actions 返回 []，不要擅自重绘。用户明确要求「按建议重绘」时才给出 run_generator。
12. group_nodes 把 2 个及以上「未成组的顶层节点」归为一组（只做组织，不改变连线与数据流）；ungroup_nodes 用 groupIds 解散分组并把成员位置还原为绝对坐标。分组是真父子关系：成员被约束在组框内、拖动组框时成员一起移动。节点清单里 nodeType=group 的节点不要用 create_node 创建，也不要把已有分组当成员再次成组（不支持嵌套）。
13. save_as_template 把选中的一批节点存为可复用模板（只保留这批节点之间的内部连线，跨出去的外部连线会被丢弃），必须给出 name；instantiate_template 用 templateId 把模板插入当前画布（可带 position 指定落点）。只能使用请求里 availableTemplates 列出的 templateId；用户没有明确要求时不要擅自存模板。用户说「用某个模板/再放一份 xxx」时才用 instantiate_template。
14. add_element_reference：把「被裁剪图片所在节点 sourceNodeId」上的一块区域裁下来，作为局部参考元素插入「发起节点 initiateNodeId」的提示词。region 是相对该图片的归一化矩形（x/y/w/h 取 0~1，且 x+w≤1、y+h≤1），例如「左上角那块」可给 {x:0,y:0,w:0.4,h:0.4}；label 可写该区域叫什么。与 reference_element 的区别：reference_element 复制「已经存在的标记元素」，本动作是「新裁一块区域生成新元素」，两者都不触发新的生成任务。每个节点最多 3 个标记元素，快照里 elements 已有 3 个时不要再加。`,
      },
      ...conversation.map((item) => ({ role: item.role, content: item.content })),
      {
        role: 'user',
        content: JSON.stringify({ operation, message, selectedNode, upstream, canvas, availableNodeTypes: request.availableNodeTypes || [], availableTemplates: Array.isArray(request.availableTemplates) ? request.availableTemplates.slice(0, 40) : [], agentState: incomingState, execution }).slice(0, 30000),
      },
    ],
  })
  let rawActions = Array.isArray(result.json?.actions) ? result.json.actions : []
  if (!rawActions.length && Array.isArray(result.json?.proposals)) {
    rawActions = result.json.proposals.slice(0, 8).flatMap((item, index) => {
      if (item?.type === 'set_node_text') return [{ type: 'update_node', nodeId: item.targetNodeId || selectedNode.id, data: { text: item.payload?.text || '' } }]
      if (item?.type === 'set_node_prompt') return [{ type: 'update_node', nodeId: item.targetNodeId || selectedNode.id, data: { prompt: item.payload?.prompt || '' } }]
      if (item?.type === 'create_generator_and_connect') {
        const clientId = `agent-node-${index + 1}`
        const nodeType = item.payload?.mode === 'video-generation' ? 'video' : 'image'
        return [
          { type: 'create_node', clientId, nodeType, position: { x: 520 + index * 360, y: 160 }, data: { prompt: item.payload?.prompt || '' } },
          { type: 'create_edge', source: item.targetNodeId || selectedNode.id, target: clientId },
        ]
      }
      return []
    })
  }
  const normalized = normalizeCanvasAgentActions(rawActions, canvas)
  const capabilities = storedAgent.capabilities || {}
  const maxActions = Math.min(Math.max(Number(storedAgent.maxActions || 12), 1), 12)
  const capabilityByAction = {
    create_node: 'createNode',
    create_edge: 'createEdge',
    update_node: 'updateNode',
    move_node: 'moveNode',
    delete_node: 'deleteNode',
    delete_edge: 'deleteEdge',
    run_generator: 'runGenerator',
    group_nodes: 'groupNodes',
    ungroup_nodes: 'groupNodes',
    save_as_template: 'canvasTemplate',
    instantiate_template: 'canvasTemplate',
    add_element_reference: 'addElementReference',
  }
  normalized.actions = normalized.actions.filter((item) => {
    const key = capabilityByAction[item.type]
    return !(key && capabilities[key] === false)
  })
  // 模板动作只能使用前端真实存在的模板，避免助手凭空引用一个不存在的 templateId。
  const templateIds = new Set((Array.isArray(request.availableTemplates) ? request.availableTemplates : [])
    .map((item) => String(item?.id || ''))
    .filter(Boolean))
  normalized.actions = normalized.actions.filter((item) => item.type !== 'instantiate_template' || templateIds.has(String(item.templateId || '')))
  normalized.actions = normalized.actions.slice(0, maxActions)
  if (storedAgent.rules?.noQuotaWithoutRequest !== false && !/(生成|出图|出视频|运行|执行生成)/.test(message)) normalized.actions = normalized.actions.filter((item) => item.type !== 'run_generator')
  const phase = normalized.actions.length ? 'executing' : (result.json?.phase || (result.json?.reply ? 'clarifying' : 'planning'))
  const reply = String(result.json?.reply || (normalized.actions.length ? '已生成下一步画布操作。' : '请补充需求后继续。')).trim().slice(0, 2000)
  const proposals = operation === 'generate-text' ? legacyProposalsFromActions(normalized.actions, selectedNode) : []
  if (operation === 'generate-text' && !proposals.length && selectedNode.id) {
    proposals.push({ type: 'set_node_text', targetNodeId: String(selectedNode.id).slice(0, 160), summary: '写入生成的文字', payload: { text: reply, prompt: '', mode: 'image-generation' } })
  }
  return { reply, refinePrompt: String(result.json?.refinePrompt || '').trim().slice(0, 2000), actions: normalized.actions, warnings: normalized.warnings, proposals, provider: result.provider, model: result.model, phase, plan: Array.isArray(result.json?.plan) ? result.json.plan.slice(0, maxActions) : [], agentState: { ...incomingState, phase, lastActionResult: execution?.result || '', updatedAt: new Date().toISOString() } }
}

function collectReferenceImages(request) {
  // 去重是必须的：画布前端会同时传 images:[首图, ...] 与 referenceImage:首图，
  // 若不去重，首图会被记两次 —— 单张上游图会变成「两图数组」发给模型。
  // 对火山方舟这种「image 传字符串=单图、传数组=多图融合」的平台，形状错位会让上游图形同没送。
  const values = [
    ...(Array.isArray(request.templateReferenceImages) ? request.templateReferenceImages.slice(0, 3) : []),
    ...(Array.isArray(request.images) ? request.images : []),
    ...(Array.isArray(request.image) ? request.image : []),
    ...(request.referenceImage ? [request.referenceImage] : []),
    ...(request.sketchOptimized ? [request.sketchOptimized] : []),
  ].filter(Boolean)
  // 同一张图可能出现多次（同一 data URL 字符串 / 同一 `/api/...` 路径）；按内容去重且保持首次出现顺序。
  return [...new Set(values)]
}

// 校验并归一化后台/代码里声明的参考图协议；非法值一律返回 null（由 providerImageInputSpec 兜底）。
function normalizeImageInputSpec(value) {
  if (!value || typeof value !== 'object') return null
  const mode = String(value.mode || '').trim()
  if (!PROVIDER_IMAGE_INPUT_MODES.includes(mode)) return null
  if (mode === 'none') return { mode }
  const rawMax = Number(value.maxImages)
  const maxImages = Number.isFinite(rawMax) && rawMax > 0 ? Math.min(Math.floor(rawMax), 16) : DEFAULT_PROVIDER_IMAGE_INPUT.maxImages
  const spec = { mode, maxImages }
  if (mode === 'body-field') spec.field = String(value.field || 'image').trim() || 'image'
  return spec
}

// 解析某供应商实际生效的参考图协议。
// declared=false 表示该供应商没有显式声明 —— 按 OpenAI 兼容（顶层 image 字段）处理，
// 并由 generateImages() 在日志与出图响应里明确提示，避免“以为支持其实没发”的静默失效。
// 参考图协议自动识别：只认得准的几种，认不准的仍按 OpenAI 兼容处理并提示管理员。
// 火山方舟（含转发 Seedream 的平台）：顶层 image 字段，最多 10 张；Agnes：extra_body.image；OpenAI 官方：/images/edits。
function autoImageInputSpec(provider = {}) {
  const base = String(provider.baseUrl || '').toLowerCase()
  const models = [provider.imageModel, ...providerModelList(provider, 'image')].map((item) => String(item || '').toLowerCase()).filter(Boolean)
  if (isArkHostedBaseUrl(provider.baseUrl) || models.some((item) => item.includes('seedream'))) {
    return { mode: 'body-field', field: 'image', maxImages: 10, autoReason: '火山方舟 Seedream' }
  }
  if (/agnes/.test(base) || models.some((item) => item.startsWith('agnes-image'))) return { mode: 'extra-body-image', maxImages: 4, autoReason: 'Agnes' }
  if (/^https:\/\/api\.openai\.com(\/|$)/.test(base)) return { mode: 'edits', maxImages: 1, autoReason: 'OpenAI 官方' }
  return null
}

function providerImageInputSpec(provider = {}) {
  const declared = normalizeImageInputSpec(provider.imageInput)
  if (declared) return { ...declared, declared: true }
  // 没在后台手动指定时，按平台地址 / 模型名自动识别（客户反馈这几个开关看不懂：能自动判断的就不让人选）
  const auto = autoImageInputSpec(provider)
  if (auto) return { ...auto, declared: true, auto: true }
  return { ...DEFAULT_PROVIDER_IMAGE_INPUT, declared: false }
}

function sameImageInputSpec(a, b) {
  if (!a || !b || a.mode !== b.mode) return false
  if (a.mode === 'none') return true
  return a.maxImages === b.maxImages && (a.field || '') === (b.field || '')
}

// 参考图设置从哪来，给后台显示用：manual 后台手动指定 / preset 内置平台预设 / auto 自动识别 / default 认不出来按 OpenAI 兼容。
// 旧版表单每次保存都会把参考图设置一起存下；存的和内置预设 / 自动识别结果一模一样时不算「手动」，免得后台满屏都是手动指定。
// 认不出来的平台（default）存过就仍算手动：清掉会让出图响应多出「未声明参考图方式」的提示，行为就变了。
function imageInputSourceOf(key, item, savedEntry) {
  const manual = normalizeImageInputSpec(savedEntry?.imageInput)
  const preset = normalizeImageInputSpec(providers[key]?.imageInput)
  const auto = autoImageInputSpec(item)
  const baseline = preset || normalizeImageInputSpec(auto)
  if (manual && !sameImageInputSpec(manual, baseline)) return 'manual'
  if (preset) return 'preset'
  return auto ? 'auto' : (manual ? 'manual' : 'default')
}

// 把参考图真正写进请求体。返回值 = 实际写入模型的图片张数（0 表示一张都没送出去）。
// 这是全项目唯一的“参考图写入”出口：新增供应商只需声明 imageInput，无需各写一遍。
function applyReferenceImagesToPayload(payload, spec, referenceImages = []) {
  const limit = spec?.maxImages || DEFAULT_PROVIDER_IMAGE_INPUT.maxImages
  const images = (Array.isArray(referenceImages) ? referenceImages : []).filter(Boolean).slice(0, limit)
  if (!images.length) return 0
  if (spec?.mode === 'extra-body-image') {
    payload.extra_body = { ...(payload.extra_body || {}), image: images }
    return images.length
  }
  if (spec?.mode === 'body-field') {
    // 单图传字符串、多图传数组：火山方舟 image 参数同时支持这两种形态。
    payload[spec.field || 'image'] = images.length === 1 ? images[0] : images
    return images.length
  }
  // edits / none：不由本函数写入（edits 走 multipart，none 已在 generateImages 前置拦下）。
  return 0
}

// 参考图协议的中文说明，用于后台展示与报错文案。
function providerImageInputLabel(spec = {}) {
  if (!spec || spec.mode === 'none') return '不支持参考图'
  if (spec.auto) return `自动识别（${spec.autoReason}）：${providerImageInputLabel({ ...spec, auto: false })}`
  if (spec.mode === 'edits') return '参考图（/images/edits 上传）'
  if (spec.mode === 'extra-body-image') return '参考图（extra_body.image）'
  return spec.declared === false ? '参考图（未声明，按 OpenAI 兼容处理）' : `参考图（字段 ${spec.field || 'image'}）`
}

function isUpstreamReadableImage(value) {
  const source = String(value || '').trim()
  return /^https?:\/\//i.test(source) || /^data:image\/[a-z0-9.+-]+;base64,/i.test(source)
}

function imageInputKind(value) {
  const source = String(value || '').trim()
  if (/^data:image\//i.test(source)) return 'data-url'
  if (/^https?:\/\//i.test(source)) return 'remote-url'
  if (/^blob:/i.test(source)) return 'blob-url'
  if (/^\/api\//i.test(source)) return 'local-api-path'
  return source ? 'relative-or-unknown' : 'empty'
}

/** 只按文件头判断格式，不信调用方传来的 MIME。上游 content-type 偶尔和真实字节不一致。 */
function sniffImageMime(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.alloc(0)
  if (bytes.length > 8 && bytes.readUInt32BE(0) === 0x89504e47) return 'image/png'
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  throw Object.assign(new Error('图片格式不支持，只接受 PNG、JPEG 或 WebP。'), { statusCode: 400 })
}

function localH5ReferenceAsDataUrl(value) {
  const source = String(value || '').trim()
  const match = source.match(/^\/api\/h5-visual-template-assets\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+)$/)
  if (!match) return ''
  const templateId = safeH5AssetPart(match[1])
  const pageId = safeH5AssetPart(match[2])
  const fileName = basename(match[3])
  if (!templateId || !pageId || fileName !== match[3] || !/^[A-Za-z0-9_-]+\.(png|jpg|webp)$/i.test(fileName)) return ''
  const root = resolve(h5VisualTemplateAssetsDir())
  const filePath = resolve(root, templateId, pageId, fileName)
  if (!filePath.startsWith(root) || !existsSync(filePath)) return ''
  const mimeType = contentTypeForFile(fileName)
  return `data:${mimeType};base64,${readFileSync(filePath).toString('base64')}`
}

// 把画布里的本地资产引用 `/api/assets/<id>`（上传图 / 画布生成图）解析成 data URL。
// 直接复用业务路由 `/api/assets/:id` 用的 getAccessibleAsset —— 同一套 id 校验、组织归属校验、
// 以及 protected-assets 下的路径逃逸检查都在里面，绝不另拼路径，避免绕过安全检查。
// 任何失败（无登录态、非法 id、越权、文件缺失）一律返回空字符串，交给上层“丢弃统计”去报错/告警，不抛异常。
async function localAssetReferenceAsDataUrl(value, user) {
  const match = String(value || '').trim().match(/^\/api\/assets\/([A-Za-z0-9_-]+)$/)
  if (!match) return ''
  if (!user?.organization?.id) return ''
  try {
    const asset = await getAccessibleAsset(user, match[1], dataDir)
    const mimeType = String(asset.mime_type || '').toLowerCase()
    if (!/^image\//.test(mimeType)) return ''
    return `data:${mimeType};base64,${asset.data.toString('base64')}`
  } catch {
    return ''
  }
}

// 解析出模型可读的参考图（URL 或 data:base64）。原先叫 prepareAgnesReferenceImages，
// 但它对所有供应商都适用，改名以免后来者以为“只跟 Agnes 有关”而漏用。
// 返回值同时给出“哪些被丢弃了”，好让 generateImages() 把静默丢弃变成可见的报错/告警：
//   images  —— 真正可用于模型的参考图
//   dropped —— 认不出来、无法用于模型的原始值（含 imageInputKind 形态标签）
async function prepareReferenceImages(values, context = {}) {
  const entries = await Promise.all(values.map(async (value) => {
    const kind = imageInputKind(value)
    if (isUpstreamReadableImage(value)) return { kind, value, dataUrl: String(value).trim() }
    const h5 = localH5ReferenceAsDataUrl(value)
    if (h5) return { kind, value, dataUrl: h5 }
    const asset = await localAssetReferenceAsDataUrl(value, context.user)
    if (asset) return { kind, value, dataUrl: asset }
    return { kind, value, dataUrl: '' }
  }))
  return {
    images: entries.map((entry) => entry.dataUrl).filter(Boolean),
    dropped: entries.filter((entry) => !entry.dataUrl),
  }
}

async function generateOpenAIImages(provider, request, context = {}) {
  const { referenceImages = [], spec = providerImageInputSpec(provider) } = context
  const model = request.model || provider.imageModel
  // 官方 gpt-image-1 的 /images/generations 不接受输入图，图生图必须走 /images/edits（multipart）。
  if (referenceImages.length && spec.mode === 'edits') {
    return await generateOpenAIEditedImages(provider, request, model, referenceImages)
  }
  const payload = {
    model,
    prompt: request.prompt,
    n: Math.min(Math.max(Number(request.count || 1), 1), MAX_GENERATION_COUNT),
    size: mapOpenAIImageSize(request.ratio),
    quality: mapOpenAIQuality(request.quality),
  }
  // 接的是火山方舟的自建平台：方舟的出图接口认官方 watermark 参数，跟着后台开关走；别的平台不认这个字段，不带。
  if (isArkHostedBaseUrl(provider.baseUrl)) payload.watermark = provider.imageWatermark !== false
  // 未声明协议的供应商走这里：按 OpenAI 兼容处理，顶层写 image 字段。
  const forwardedImageCount = applyReferenceImagesToPayload(payload, spec, referenceImages)
  const data = await postJson(provider, '/images/generations', payload)
  return { images: normalizeImageResults(data, request, provider.key, model), forwardedImageCount }
}

// gpt-image-1 图生图：multipart/form-data 上传参考图。
async function generateOpenAIEditedImages(provider, request, model, referenceImages) {
  requireApiKey(provider)
  const form = new FormData()
  form.append('model', model)
  form.append('prompt', String(request.prompt || ''))
  form.append('n', String(Math.min(Math.max(Number(request.count || 1), 1), MAX_GENERATION_COUNT)))
  form.append('size', mapOpenAIImageSize(request.ratio))
  const quality = mapOpenAIQuality(request.quality)
  if (quality) form.append('quality', quality)

  let forwardedImageCount = 0
  // gpt-image-1 的 edits 单次只接受 1 张输入图；多图时取第一张（画布中优先级最高的那张）。
  for (const [index, image] of referenceImages.slice(0, 1).entries()) {
    const blob = await referenceImageToBlob(image)
    if (!blob) continue
    form.append('image', blob, `reference-${index + 1}.${blob.type === 'image/jpeg' ? 'jpg' : 'png'}`)
    forwardedImageCount += 1
  }
  if (!forwardedImageCount) return { images: [], forwardedImageCount: 0 }

  const base = String(provider.baseUrl || '').replace(/\/+$/, '')
  // 不要手写 Content-Type：boundary 由 fetch 按 RFC 2047 生成。
  // 手拼 `multipart/form-data; boundary=中文…` 会抛
  // 「Cannot convert argument to a ByteString」，中文提示词一律出不了图。
  const response = await fetch(`${base}/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${provider.apiKey}` },
    body: form,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(upstreamErrorMessage(provider, response.status, data))
    error.statusCode = response.status
    error.upstreamStatus = response.status
    error.data = data
    throw error
  }
  // edits 默认返回 b64_json；normalizeImageResults 已兼容该格式。
  return { images: normalizeImageResults(data, request, provider.key, model), forwardedImageCount }
}

// 把参考图（data:base64 或 http(s) URL）转成 Blob，供 multipart 上传使用。无法转换返回 null。
async function referenceImageToBlob(value) {
  const source = String(value || '').trim()
  if (!source) return null
  const match = source.match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i)
  if (match) {
    const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64')
    return buffer.length ? new Blob([buffer], { type: match[1].toLowerCase() }) : null
  }
  // 外部参考图只接受公开 HTTPS 图片，防止被利用去访问服务器内网。
  if (!/^https:\/\//i.test(source)) return null
  try {
    const buffer = await readRemoteArtwork(source, AbortSignal.timeout(20000))
    if (!buffer.length) return null
    const type = buffer[0] === 0x89 ? 'image/png' : buffer[0] === 0xff ? 'image/jpeg' : 'image/webp'
    return new Blob([buffer], { type })
  } catch {
    return null
  }
}

// 生成一张纯色 PNG 的 data URL，作为「参考图能力自检」的探针图。
// 自行编码而不内嵌 base64 大字符串：可读、可调尺寸、不引入测试素材文件、不依赖图片处理库。
function solidColorPngDataUrl(size = 512, rgb = [37, 99, 235]) {
  const crcTable = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c
  }
  const crc32 = (buffer) => {
    let c = -1
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ -1) >>> 0
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length, 0)
    const payload = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(payload), 0)
    return Buffer.concat([length, payload, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // 位深
  ihdr[9] = 2 // 颜色类型：真彩色 RGB
  const row = Buffer.alloc(size * 3 + 1)
  for (let x = 0; x < size; x += 1) {
    row[1 + x * 3] = rgb[0] & 0xff
    row[2 + x * 3] = rgb[1] & 0xff
    row[3 + x * 3] = rgb[2] & 0xff
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => row))
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
  return `data:image/png;base64,${png.toString('base64')}`
}

// 「参考图能力」真实自检：用一张纯色探针图走一次真实出图，确认供应商确实接收参考图。
// 只在后台显式勾选时调用（会产生 1 次付费出图），用于新建模型商后的第一时间发现问题。
async function testReferenceImageForwarding(provider, spec) {
  const model = provider.imageModel || providerModelList(provider, 'image')[0] || ''
  const probe = solidColorPngDataUrl()
  try {
    const result = await generateImages({
      provider: provider.key,
      model,
      prompt: '参考图能力自检：请以这张参考图的主色调为基础，生成一张同色系的极简色块图。',
      ratio: '1:1',
      quality: 'standard',
      count: 1,
      images: [probe],
      referenceImage: probe,
    })
    const ok = result.forwardedImageCount > 0
    return {
      ok,
      forwardedImageCount: result.forwardedImageCount,
      referenceImageCount: result.referenceImageCount,
      generatedImageCount: result.images.length,
      imageInputMode: spec.mode,
      model,
      message: ok
        ? `${provider.label} 的 ${model} 已确认可以接收参考图（${providerImageInputLabel(spec)}），上游图能真正送进模型`
        : `${provider.label} 的 ${model} 未能转发参考图（${providerImageInputLabel(spec)}）`,
    }
  } catch (error) {
    return {
      ok: false,
      forwardedImageCount: 0,
      referenceImageCount: 1,
      generatedImageCount: 0,
      imageInputMode: spec.mode,
      model,
      message: `${provider.label} 参考图自检失败：${error?.message || '未知错误'}`,
    }
  }
}

async function generateAgnesImages(provider, request, context = {}) {
  const { referenceImages = [], spec = providerImageInputSpec(provider) } = context
  const model = request.model || provider.imageModel
  const count = Math.min(Math.max(Number(request.count || 1), 1), MAX_GENERATION_COUNT)
  let forwardedImageCount = 0
  const buildPayload = (index) => {
    const requestedRatio = String(request.ratio || '1:1')
    const requestedSize = request.size || mapAgnesImageSize(requestedRatio)
    const payload = {
      model,
      prompt: count > 1 ? `${request.prompt}\n候选图 ${index + 1}：保持同一创作要求，但构图、细节或镜头角度做轻微变化。` : request.prompt,
      // Agnes 图像队列不接受独立 width/height 字段；使用 size 与比例字段。
      size: requestedSize,
      aspect_ratio: requestedRatio,
    }
    // 参考图写入统一出口：Agnes 用 extra_body.image 数组。
    forwardedImageCount = Math.max(forwardedImageCount, applyReferenceImagesToPayload(payload, spec, referenceImages))
    if (request.responseFormat) {
      payload.extra_body = { ...(payload.extra_body || {}), response_format: request.responseFormat }
    }
    if (request.returnBase64) {
      payload.return_base64 = true
      if (payload.extra_body) delete payload.extra_body.response_format
    }
    return payload
  }

  const batches = []
  for (let index = 0; index < count; index += 1) {
    const data = await postJson(provider, '/images/generations', buildPayload(index))
    batches.push(...normalizeImageResults(data, request, provider.key, model))
  }
  return { images: batches.slice(0, count), forwardedImageCount }
}

// 火山方舟不同出图型号对「组图」参数（sequential_image_generation）的接受度不一样：
//   · doubao-seedream-4.x 认识它，可以显式关掉；
//   · doubao-seedream-5.0-flash 完全不认识，字段一出现就 400（值写 disabled 也没用）。
// 所以改成「白名单里才发」：以后接新型号，最坏结果是少一个组图能力，不会直接报错。
const VOLCENGINE_SEQUENTIAL_MODEL_PATTERNS = [/^doubao-seedream-4(\.|-|$)/i]

function volcengineSupportsSequential(model) {
  const id = String(model || '').trim()
  return VOLCENGINE_SEQUENTIAL_MODEL_PATTERNS.some((pattern) => pattern.test(id))
}

async function generateVolcengineImages(provider, request, context = {}) {
  const { referenceImages = [], spec = providerImageInputSpec(provider) } = context
  const model = request.model || provider.imageModel
  const count = Math.min(Math.max(Number(request.count || 1), 1), MAX_GENERATION_COUNT)
  let forwardedImageCount = 0
  const batches = []
  for (let index = 0; index < count; index += 1) {
    const payload = {
      model,
      prompt: count > 1 ? `${request.prompt}\n候选图 ${index + 1}：保持同一创作要求，但构图、细节或镜头角度做轻微变化。` : request.prompt,
      response_format: 'url',
      size: request.size || mapVolcengineImageSize(request.ratio, request.quality),
      stream: false,
      // 官方水印开关（方舟 watermark 参数）只认后台设置，默认开启；请求体里带的 watermark 一律不认，学生端不能自己关。
      watermark: provider.imageWatermark !== false,
    }
    // 只给认识该字段的型号带上；5.0-flash 只要看到这个 key 就整单拒绝。
    if (volcengineSupportsSequential(model)) {
      payload.sequential_image_generation = request.sequentialImageGeneration || 'disabled'
    }
    // doubao-seedream-4.x：参考图通过顶层 image 传入（单图 string、多图 array）。
    forwardedImageCount = Math.max(forwardedImageCount, applyReferenceImagesToPayload(payload, spec, referenceImages))
    const data = await postJson(provider, '/images/generations', payload)
    batches.push(...normalizeImageResults(data, request, provider.key, model))
  }
  return { images: batches.slice(0, count), forwardedImageCount }
}

// 按画布顺序执行图像生成步骤：上一步的产物作为下一步的参考图。
// 学生端与后台预览共用，保证「老师预览到的」和「学生实际跑出来的」是同一套流程。
// generateImages 产出的是 { id, imageUrl, … } 对象；下一步要当参考图用，
// 必须还原成 URL 字符串。直接传对象会被 imageInputKind 判成 unknown 全部丢弃，
// 触发「收到了 N 张参考图，但一张都没能用于模型」——多步画布会直接 400。
async function runImageSkillSteps(prepared, user) {
  // 收集逻辑抽到 image-step-runner.js，出图函数注入进去 —— 这样能脱网跑验收，
  // 不必为了「8 张结果图有没有进报告」真的花 8 次出图费。
  return runImageSteps(prepared, { generate: (request) => generateImages(request, { user }) })
}

// ---- 出图备用模型 + 平台冷却（参考 LiteLLM / New API 的 fallback + cooldown）----
// 所有出图入口（AI 绘画、AI 伙伴、技能玩法、H5 报告）都走 generateImages，所以兜底只写这一处。
// 只在「平台故障」（401/402/403/404/408/429/5xx、连不上、超时）时换备用；内容不合规之类的 400 不换，
// 否则等于绕过内容审核。备用模型只试一次；积分按次数计费，换不换平台都只扣一次。
function resolveImageFallbackTarget(primaryKey, primaryModel, { needsReference = false } = {}) {
  const config = readProviderConfig().imageFallback || {}
  if (!config.enabled) return null
  const key = normalizeProviderKey(config.provider)
  const provider = mergedProviders()[key]
  if (!provider || provider.enabled === false || !providerKeyUsable(provider)) return null
  const model = String(config.model || '').trim()
  if (!model || !availableProviderModels(provider, 'image').includes(model)) return null
  if (key === primaryKey && model === primaryModel) return null
  // 这次带了参考图、备用平台却不支持参考图：不换（换了会出一张没参考原图的画）
  if (needsReference && providerImageInputSpec(provider).mode === 'none') return null
  return { provider: key, model, label: provider.label }
}

async function generateImagesWithFallbackTarget(request, options, primary, target, reason) {
  const result = await generateImagesOnce({ ...request, provider: target.provider, model: target.model }, options)
  recordProviderSuccess(target.provider)
  return {
    ...result,
    warnings: [...(result.warnings || []), `${primary.label} ${reason}，已自动换用备用模型（${target.label}）完成这次生成`],
    fallback: { from: primary.key, fromModel: primary.model, to: target.provider, toModel: target.model, reason },
  }
}

async function generateImages(request, options = {}) {
  const provider = getProvider(request.provider)
  const model = request.model || availableProviderModels(provider, 'image')[0] || provider.imageModel
  const primary = { key: provider.key, label: provider.label, model }
  const needsReference = collectReferenceImages(request).length > 0
  const primaryRequest = { ...request, provider: provider.key, model }
  // 主平台冷却中：有可用的备用模型就直接用备用，不让小画家白等一次失败
  if (isProviderCooling(provider.key)) {
    const target = resolveImageFallbackTarget(provider.key, model, { needsReference })
    if (target) {
      try {
        return await generateImagesWithFallbackTarget(primaryRequest, options, primary, target, '暂时不可用（冷却中）')
      } catch (error) {
        recordProviderFailure(target.provider, error)
        throw error
      }
    }
  }
  try {
    const result = await generateImagesOnce(primaryRequest, options)
    recordProviderSuccess(provider.key)
    return result
  } catch (error) {
    recordProviderFailure(provider.key, error)
    const target = isProviderFailure(error) ? resolveImageFallbackTarget(provider.key, model, { needsReference }) : null
    if (!target) throw error
    console.warn('[AI image fallback]', { from: provider.key, model, to: target.provider, toModel: target.model, reason: String(error?.message || '').slice(0, 200) })
    // 主平台的失败照样记进「异常记录」，管理员能看到哪个平台出了问题
    void recordAppError({ error, status: Number(error?.statusCode) || 502, user: options.user || null, kind: 'ai', path: '/ai/image（已自动换用备用模型）', req: { method: 'POST' } })
    try {
      return await generateImagesWithFallbackTarget(primaryRequest, options, primary, target, '暂时不可用')
    } catch (fallbackError) {
      recordProviderFailure(target.provider, fallbackError)
      error.fallbackError = String(fallbackError?.message || '').slice(0, 300)
      throw error
    }
  }
}

async function generateImagesOnce(request, options = {}) {
  const provider = getProvider(request.provider)
  request = { ...request, model: request.model || availableProviderModels(provider, 'image')[0] || provider.imageModel }
  requireModelEnabled(provider, request.model)
  const prompt = String(request.prompt || '').trim()
  if (!prompt) {
    const error = new Error('缺少 prompt，无法生成图片')
    error.statusCode = 400
    throw error
  }

  // 参考图解析属于公共层：所有供应商共用同一份“收到的图”，
  // 各 adapter 只负责把它写进自己的字段（由 applyReferenceImagesToPayload 完成）。
  // options.user 用于把 `/api/assets/<id>` 这类本地资产引用解析成 data URL。
  const suppliedImages = collectReferenceImages(request)
  const { images: referenceImages, dropped: droppedImages } = await prepareReferenceImages(suppliedImages, { user: options.user })
  const spec = providerImageInputSpec(provider)
  const model = request.model || provider.imageModel

  console.info('[AI image request]', {
    provider: provider.key,
    model,
    promptLength: prompt.length,
    suppliedImageCount: suppliedImages.length,
    usableImageCount: referenceImages.length,
    droppedImageCount: droppedImages.length,
    droppedImageKinds: droppedImages.map((entry) => entry.kind),
    imageKinds: suppliedImages.map(imageInputKind),
    imageInputMode: spec.mode,
    imageInputDeclared: spec.declared,
  })

  // 防静默#1：用户确实连了参考图，却一张都没能用于模型 —— 直接报错，绝不静默出一张“没参考图”的图。
  // （必须放在 spec.mode==='none' 判定之前：可用图为 0 时下面那条守卫不会触发，会漏报。）
  if (suppliedImages.length && !referenceImages.length) {
    const kinds = [...new Set(droppedImages.map((entry) => entry.kind))].join('、')
    const error = new Error(`收到了 ${suppliedImages.length} 张参考图，但一张都没能用于模型（参考图形态：${kinds}）。该参考图既不是可访问的 http(s) URL，也不是 data:image，可能是本地资产路径（如 /api/assets/…）或无效地址。请检查上游图片后重试。`)
    error.statusCode = 400
    throw error
  }

  // 供应商明确声明不支持参考图时直接报错：静默丢弃会让用户以为模型“看过图”，比报错更糟。
  if (referenceImages.length && spec.mode === 'none') {
    const error = new Error(`${provider.label} 的 ${model || '当前图像模型'} 不支持参考图（图生图）。请在画布上断开上游图片连线后重试，或改选支持参考图的模型。`)
    error.statusCode = 400
    throw error
  }

  const warnings = []
  // 防静默#2：部分参考图被丢弃时照常出图，但必须把“丢了几张、什么形态”透出给用户。
  if (droppedImages.length) {
    const kinds = [...new Set(droppedImages.map((entry) => entry.kind))].join('、')
    warnings.push(`有 ${droppedImages.length} 张参考图无法使用，已忽略（形态：${kinds}）。这些图既不是可访问的 http(s) URL，也不是 data:image；若它们本应是上游图，请检查图片地址是否为本地资产路径。`)
  }
  if (referenceImages.length && !spec.declared) {
    warnings.push(`${provider.label} 未声明参考图协议，已按 OpenAI 兼容的 image 字段尝试发送；若出图没有参考上游图，请在后台把该平台的「参考图能力」配置正确。`)
  }

  const context = { referenceImages, spec }
  const outcome = provider.key === 'agnes'
    ? await generateAgnesImages(provider, request, context)
    : provider.key === 'volcengine'
      ? await generateVolcengineImages(provider, request, context)
      : await generateOpenAIImages(provider, request, context)

  // 防静默守卫：用户确实连了上游图，却一张都没送到模型 —— 直接报错，绝不悄悄过去。
  if (referenceImages.length && !outcome.forwardedImageCount) {
    const error = new Error(`${provider.label} 收到了 ${referenceImages.length} 张参考图，但一张都没能转发给模型（参考图协议：${providerImageInputLabel(spec)}）。请检查该平台的「参考图能力」配置。`)
    error.statusCode = 502
    throw error
  }
  if (referenceImages.length) {
    console.info('[AI image request] forwarded', {
      provider: provider.key,
      model,
      suppliedImageCount: referenceImages.length,
      forwardedImageCount: outcome.forwardedImageCount,
      imageInputMode: spec.mode,
    })
  }

  return {
    provider: provider.key,
    images: outcome.images,
    referenceImageCount: referenceImages.length,
    forwardedImageCount: outcome.forwardedImageCount,
    warnings,
  }
}

// 「标记」功能：把裁剪后的区域小图交给支持视觉的文本模型，返回一句内容描述。
const MAX_REGION_IMAGE_BYTES = 4 * 1024 * 1024
const REGION_DESCRIBE_INSTRUCTION = '这是一张从图片上以用户点击位置为中心裁出的小图。请判断点击位置附近有哪些具体对象或部位，按相关性从高到低给出 3 到 5 个候选。每个候选是一个具体的元素名称（6 到 14 个字），候选之间必须是不同的对象，或同一对象的不同粒度（例如「黑色小狗」与「小狗身上的花裙子」），不要给出同一个东西的同义改写（例如「一只橘猫」「橘色动物」「猫头特写」只能保留一个）。只输出候选本身，每行一个，不要编号、不要解释、不要引号、不要多余标点。'

// 把模型返回的多行文本切成候选列表：去掉行首编号/项目符号、首尾引号与标点，去重后最多保留 5 个。
// 模型偶尔不按「每行一个」输出，退化成「甲、乙、丙」时也要能拆开。
function parseRegionCandidates(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .flatMap((line) => (/[、；;]/.test(line) ? line.split(/[、；;]/) : [line]))
    .map((item) => item.replace(/^\s*(?:[-*•·]|\d+\s*[.、)）])\s*/, ''))
    .map((item) => item.trim())
    .map((item) => item.replace(/^[\s"'“”‘’、,，。.；;]+/, '').replace(/[\s"'“”‘’、,，。.；;]+$/, ''))
    .filter(Boolean)
  return [...new Set(lines)].slice(0, 5)
}

function parseRegionImageDataUrl(value) {
  const image = String(value || '').trim()
  if (!image) {
    const error = new Error('缺少 image 参数，无法识别标记区域内容')
    error.statusCode = 400
    throw error
  }
  const match = image.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/s)
  if (!match) {
    const error = new Error('image 必须是合法的 data:image/...;base64 图片数据')
    error.statusCode = 400
    throw error
  }
  const base64 = match[2].replace(/\s+/g, '')
  if (!base64.length || base64.length % 4 === 1) {
    const error = new Error('image 的 base64 数据无效')
    error.statusCode = 400
    throw error
  }
  const bytes = Math.floor((base64.length * 3) / 4)
  if (bytes > MAX_REGION_IMAGE_BYTES) {
    const error = new Error(`标记区域图片过大（约 ${(bytes / 1024 / 1024).toFixed(1)}MB），请缩小选区后重试`)
    error.statusCode = 413
    throw error
  }
  return `data:image/${match[1].toLowerCase()};base64,${base64}`
}

function resolveRegionDescribeCandidates(request = {}) {
  const merged = mergedProviders()
  const saved = readProviderConfig()
  const explicitKey = request.provider ? String(request.provider).toLowerCase().trim() : ''
  if (explicitKey && !merged[explicitKey]) {
    const error = new Error(`不支持的 AI 供应商：${explicitKey}`)
    error.statusCode = 400
    throw error
  }
  if (explicitKey && merged[explicitKey] && !merged[explicitKey].apiKey) {
    const error = new Error(`${merged[explicitKey].label || explicitKey} 未配置 API Key，无法进行区域识别`)
    error.statusCode = 503
    throw error
  }
  const preferredKey = String(
    explicitKey
    || saved.defaultTextProvider
    || DEFAULT_TEXT_PROVIDER
    || saved.defaultProvider
    || DEFAULT_PROVIDER
    || '',
  ).toLowerCase()
  const keys = explicitKey
    ? [explicitKey]
    : preferredKey
      ? [preferredKey, ...Object.keys(merged).filter((key) => key !== preferredKey)]
      : Object.keys(merged)
  const requestedModel = String(request.model || '').trim()
  const seen = new Set()
  const candidates = []
  for (const key of keys) {
    const item = merged[key]
    if (!item?.apiKey || item.enabled === false) continue
    const models = []
    if (requestedModel && (!explicitKey || key === explicitKey)) models.push(requestedModel)
    if (item.textModel) models.push(item.textModel)
    if (Array.isArray(item.textModels)) models.push(...item.textModels)
    for (const model of models) {
      const trimmed = String(model || '').trim()
      if (!trimmed || !modelEnabled(item, trimmed)) continue
      const id = `${key}:${trimmed}`
      if (seen.has(id)) continue
      seen.add(id)
      candidates.push({ provider: { key, ...item }, model: trimmed })
    }
  }
  return candidates
}

function extractAssistantText(data) {
  const content = data?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : part?.text || part?.content || ''))
      .filter(Boolean)
      .join('')
  }
  return data?.output_text || data?.text || ''
}

function regionDescribeUpstreamText(error) {
  const data = error?.data
  return String(data?.error?.message || data?.message || error?.message || '').trim()
}

function regionDescribeStatus(error) {
  const status = Number(error?.statusCode) || 0
  if (status === 503) return 503
  if (status === 401 || status === 403) return 502
  const upstream = regionDescribeUpstreamText(error)
  if (/vision|image[_\s-]?url|multimodal|unsupported.*(image|content)|not support.*(image|vision)|不支持.*(图片|视觉|多模态)/i.test(upstream)) return 501
  return 502
}

function regionDescribeErrorMessage(error) {
  const status = regionDescribeStatus(error)
  const upstream = regionDescribeUpstreamText(error)
  if (status === 503) return upstream || '未配置可用的文本大模型 API Key，无法进行区域识别'
  if (status === 501) return `当前文本模型不支持图片识别，请改用支持视觉的模型或手动填写元素名称${upstream ? `（上游信息：${upstream.slice(0, 200)}）` : ''}`
  if (error?.diagnostic?.stage === 'upstream_fetch') return `${upstream || '无法连接上游模型服务'}，请稍后重试或手动填写元素名称`
  return `区域识别失败，请稍后重试或手动填写元素名称${upstream ? `（上游信息：${upstream.slice(0, 200)}）` : ''}`
}

// AC-09：标记区域识别复用后台「无限画布智能体配置」。总开关停用、或识别能力被单独关掉时，
// 直接返回说明、不发起上游调用。抽成纯函数便于单测。
function regionRecognitionGuard(config = readCreativeAgentConfig().canvasAgent || {}) {
  if (config?.enabled === false) return '无限画布智能体当前已在后台停用，暂时无法识别标记区域。'
  if (config?.capabilities?.recognizeRegion === false) return '后台已关闭「标记区域识别」能力，暂时无法识别标记区域。'
  return ''
}

async function describeImageRegion(request = {}) {
  const blocked = regionRecognitionGuard()
  if (blocked) {
    const error = new Error(blocked)
    error.statusCode = 503
    throw error
  }
  const image = parseRegionImageDataUrl(request.image)
  const hint = String(request.hint || '').trim().slice(0, 200)
  const messages = [{
    role: 'user',
    content: [
      { type: 'text', text: hint ? `${REGION_DESCRIBE_INSTRUCTION}参考提示：${hint}` : REGION_DESCRIBE_INSTRUCTION },
      { type: 'image_url', image_url: { url: image } },
    ],
  }]

  const candidates = resolveRegionDescribeCandidates(request)
  if (!candidates.length) {
    const error = new Error('未配置可用的文本大模型（API Key 或文本模型），无法进行区域识别')
    error.statusCode = 503
    throw error
  }

  const attempts = []
  let lastError
  for (const item of candidates) {
    const { provider, model } = item
    attempts.push({ provider: provider.key, providerLabel: provider.label, baseUrl: safeBaseUrl(provider.baseUrl), model })
    try {
      // 视觉识别走标准 chat/completions，content 为数组；不设置 response_format（返回纯文本描述）。
      const data = await postJson(provider, '/chat/completions', {
        model,
        messages,
        temperature: 0.2,
      }, 60000)
      const text = extractAssistantText(data).trim()
      const candidates = parseRegionCandidates(text)
      if (!candidates.length) {
        const error = new Error(`${provider.label} 未能识别出标记区域的内容`)
        error.statusCode = 502
        error.data = data
        throw error
      }
      return { description: candidates[0], candidates, provider: provider.key, model }
    } catch (error) {
      if (error.diagnostic) error.diagnostic.attempts = attempts
      else error.diagnostic = { attempts, contentPreview: error.contentPreview || '' }
      lastError = error
    }
  }

  const error = new Error(regionDescribeErrorMessage(lastError))
  error.statusCode = regionDescribeStatus(lastError)
  error.diagnostic = lastError?.diagnostic || { attempts }
  error.data = lastError?.data || null
  throw error
}

function videoDimensions(ratio, resolution = '720P') {
  const shortEdgeByResolution = { '480P': 480, '720P': 720, '1080P': 1080, '2K': 1440, '4K': 2160 }
  const shortEdge = shortEdgeByResolution[resolution] || 720
  if (ratio === '21:9') return { width: Math.round(shortEdge * 21 / 9), height: shortEdge }
  if (ratio === '9:16') return { width: shortEdge, height: Math.round(shortEdge * 16 / 9) }
  if (ratio === '3:4') return { width: shortEdge, height: Math.round(shortEdge * 4 / 3) }
  if (ratio === '4:3') return { width: Math.round(shortEdge * 4 / 3), height: shortEdge }
  if (ratio === '1:1') return { width: shortEdge, height: shortEdge }
  return { width: Math.round(shortEdge * 16 / 9), height: shortEdge }
}

function videoFrameCount(duration, frameRate) {
  // Agnes Video V2.0 当前稳定规格为 121 帧；提交更长帧序列会导致部分任务长期停在处理中。
  return 121
}

function normalizeVideoTask(data = {}) {
  const status = String(data.status || data.state || 'queued').toLowerCase()
  const videoUrl = data.remixed_from_video_id || data.video_url || data.videoUrl || data.url || data.output_url || ''
  return {
    taskId: data.video_id || data.task_id || data.taskId || data.id || '',
    status: ['completed', 'succeeded', 'success'].includes(status) ? 'succeeded' : ['failed', 'error', 'cancelled'].includes(status) ? 'failed' : status === 'in_progress' ? 'processing' : 'queued',
    progress: Math.min(Math.max(Number(data.progress || 0), 0), 100),
    videoUrl,
    error: data.error?.message || data.error || data.message || '',
  }
}

async function generateAgnesVideo(request = {}, context = {}) {
  const provider = getProvider(request.provider || 'agnes')
  if (provider.key !== 'agnes') {
    const error = new Error('当前仅支持 Agnes AI 视频生成')
    error.statusCode = 400
    throw error
  }
  const prompt = String(request.prompt || '').trim()
  if (!prompt) {
    const error = new Error('缺少视频提示词，无法提交生成任务')
    error.statusCode = 400
    throw error
  }
  const { width, height } = videoDimensions(request.ratio, request.resolution)
  // 首帧参考图可能是学生的手绘稿（保存后是 /api/assets/<id>），外部供应商读不到站内路径，
  // 必须先转成 data URL；转不出来的丢掉，绝不当好消息继续发（否则模型会当成"没有首帧"）。
  const suppliedReferences = collectReferenceImages(request)
  const preparedReferences = await prepareReferenceImages(suppliedReferences, context)
  const referenceImages = preparedReferences.images
  const videoPayload = {
    model: request.model || provider.videoModel || 'agnes-video-v2.0',
    prompt,
    width,
    height,
    num_frames: videoFrameCount(request.duration, request.frameRate),
    frame_rate: Math.min(Math.max(Number(request.frameRate || 24), 12), 30),
  }
  // Agnes 视频接口以 image 接收图生视频的首帧；多张参考图时使用第一张作为起始画面。
  if (referenceImages.length) videoPayload.image = referenceImages[0]
  const data = await postJson(provider, '/videos', videoPayload, 240000)
  const task = normalizeVideoTask(data)
  if (!task.taskId) {
    const error = new Error('Agnes AI 未返回视频任务编号')
    error.statusCode = 502
    error.data = data
    throw error
  }
  return { provider: provider.key, duration: '5s', referenceImageCount: referenceImages.length, ...task, droppedReferenceCount: preparedReferences.dropped.length }
}

async function getAgnesVideoTask(taskId, providerKey = 'agnes', useVideoIdQuery = false) {
  const provider = getProvider(providerKey)
  if (!taskId) {
    const error = new Error('缺少视频任务编号')
    error.statusCode = 400
    throw error
  }
  requireApiKey(provider)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  const taskPath = useVideoIdQuery
    ? `/../agnesapi?video_id=${encodeURIComponent(taskId)}`
    : `/videos/${encodeURIComponent(taskId)}`
  try {
    let data
    try {
      const response = await fetch(`${provider.baseUrl}${taskPath}`, {
        headers: { Authorization: `Bearer ${provider.apiKey}` },
        signal: controller.signal,
      })
      data = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (!useVideoIdQuery && data?.code === 'task_not_exist') {
          return getAgnesVideoTask(taskId, providerKey, true)
        }
        const error = new Error(upstreamErrorMessage(provider, response.status, data))
        error.statusCode = response.status
        error.upstreamStatus = response.status
        error.data = data
        throw error
      }
    } catch (error) {
      if (error.statusCode) throw error
      const cause = error?.cause?.code || error?.code || ''
      if (!['EACCES', 'EPERM'].includes(cause)) throw createUpstreamNetworkError(provider, taskPath, error)
      data = await getJsonWithCurl(provider, taskPath)
    }
    return { provider: provider.key, ...normalizeVideoTask({ ...data, task_id: data.task_id || taskId }) }
  } finally {
    clearTimeout(timeout)
  }
}

function decodeAudioRequest(request = {}) {
  const value = String(request.audio || '')
  const match = value.match(/^data:([^;]+);base64,(.+)$/s)
  const mimeType = match?.[1] || String(request.mimeType || 'audio/webm')
  const encoded = match?.[2] || value
  if (!encoded) {
    const error = new Error('没有收到录音数据')
    error.statusCode = 400
    throw error
  }
  const buffer = Buffer.from(encoded, 'base64')
  if (!buffer.length) {
    const error = new Error('录音数据无效')
    error.statusCode = 400
    throw error
  }
  if (buffer.length > 20 * 1024 * 1024) {
    const error = new Error('录音不能超过 20MB')
    error.statusCode = 413
    throw error
  }
  return { buffer, mimeType }
}

async function transcribeAudio(request = {}) {
  const { buffer, mimeType } = decodeAudioRequest(request)
  const localText = await transcribeAudioLocally(buffer, mimeType)
  if (localText) return { text: localText, provider: 'windows-speech', model: 'zh-CN' }
  const configured = mergedProviders()
  const providerKeys = [...new Set([request.provider, 'openai', 'agnes'].filter(Boolean))]
  const errors = []

  for (const key of providerKeys) {
    const provider = configured[key]
    if (!providerKeyUsable(provider)) continue
    try {
      const form = new FormData()
      const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm'
      form.append('file', new Blob([buffer], { type: mimeType }), `voice.${extension}`)
      form.append('model', String(request.model || 'whisper-1'))
      form.append('language', String(request.language || 'zh'))
      form.append('response_format', 'json')
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 120000)
      const response = await fetch(`${String(provider.baseUrl || '').replace(/\/+$/, '')}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${provider.apiKey}` },
        body: form,
        signal: controller.signal,
      }).finally(() => clearTimeout(timer))
      const raw = await response.text()
      let data = {}
      try { data = raw ? JSON.parse(raw) : {} } catch { data = { text: raw } }
      if (!response.ok) throw new Error(data?.error?.message || data?.message || `HTTP ${response.status}`)
      const text = String(data.text || data.transcript || '').trim()
      if (!text) throw new Error('服务没有返回转写文字')
      return { text, provider: key, model: request.model || 'whisper-1' }
    } catch (error) {
      errors.push(`${provider.label || key}: ${error.message}`)
    }
  }

  const error = new Error(errors.length ? `语音转写失败：${errors.join('；')}` : '没有可用的语音转写模型配置')
  error.statusCode = 502
  throw error
}

async function transcribeAudioLocally(buffer, mimeType) {
  if (process.platform !== 'win32' || !String(mimeType).includes('wav')) return ''
  ensureDataDir()
  const audioPath = join(dataDir, `.voice-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`)
  try {
    writeFileSync(audioPath, buffer)
    const escapedPath = audioPath.replaceAll("'", "''")
    const script = [
      'Add-Type -AssemblyName System.Speech',
      '$culture=[Globalization.CultureInfo]::GetCultureInfo("zh-CN")',
      '$engine=New-Object System.Speech.Recognition.SpeechRecognitionEngine($culture)',
      '$engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))',
      `$engine.SetInputToWaveFile('${escapedPath}')`,
      '$result=$engine.Recognize()',
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8',
      'if($result){[Console]::Write($result.Text)}',
      '$engine.Dispose()',
    ].join(';')
    const result = await runFileCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 60000 })
    return String(result.stdout || '').trim()
  } catch {
    return ''
  } finally {
    try { unlinkSync(audioPath) } catch {}
  }
}

function buildReportPages(project = {}) {
  const courseTitle = project.courseTitle || project.course || 'AI创意美术课'
  const finalTitle = project.finalTitle || project.title || 'AI创意作品'
  const prompt = project.prompt || '小画家创意提示词'
  const answers = (project.courseAnswers || [])
    .map((item, index) => `${index + 1}. ${item.question || '引导问题'}：${item.answer || '暂未填写'}`)
    .join('；')
  const idea = [project.courseIdeaText, project.courseIdeaVoiceText, project.ideaSummary].filter(Boolean).join('；')

  return [
    { title: '封面', subtitle: `${finalTitle}完整创作报告`, body: `课程：${courseTitle}｜作者：小画家阿橙` },
    { title: '课程项目理解', subtitle: courseTitle, body: `课程说明：${project.courseDescription || '讲师上传的趣味设计项目'}。课堂问答：${answers || '暂无问答'}。创意想法：${idea || '暂无创意想法'}。` },
    { title: '手绘草图创意', subtitle: '草图与线稿', body: project.sketchOriginal ? '已载入手绘草图和 AI 优化线稿。' : '本项目暂未上传草图，报告保留草图页。' },
    { title: '创作迭代流程', subtitle: '版本记录', body: `共记录 ${project.versions?.length || 0} 个 AI 生成版本。` },
    { title: '成品创意说明', subtitle: finalTitle, body: `最终作品基于提示词“${prompt}”生成。` },
    { title: 'AI专业点评', subtitle: '构图、色彩、创意', body: '主体明确，色彩方向清楚，适合继续完善故事感和细节层次。' },
    { title: '讲师评语', subtitle: '课堂评价', body: '讲师评语：________________\n评分：☆☆☆☆☆\n讲师签字：________' },
    { title: '封底', subtitle: 'AI辅助创意项目创作报告', body: '机构LOGO / 品牌标语 / 分享二维码预留' },
  ]
}

function textValue(value, fallback = '') {
  return String(value || fallback || '').replace(/\s+/g, ' ').trim()
}

function clipText(value, max = 180, fallback = '') {
  const text = textValue(value, fallback)
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function parseAgentModelKey(value = '') {
  const [provider, capability, ...modelParts] = String(value || '').split(':')
  const model = modelParts.join(':')
  if (!provider || !capability || !model) return null
  return { provider, capability, model }
}

function resolveTextModelForAgent(agent = {}) {
  const keys = [agent.defaultModelKey, agent.fallbackModelKey, ...(agent.allowedModelKeys || [])].filter(Boolean)
  const selected = keys.map(parseAgentModelKey).find((item) => item?.capability === 'text')
  return selected ? { provider: selected.provider, model: selected.model } : {}
}

function resolveTextModelCandidatesForAgent(agent = {}) {
  const keys = [agent.defaultModelKey, agent.fallbackModelKey, ...(agent.allowedModelKeys || [])].filter(Boolean)
  const seen = new Set()
  return keys
    .map(parseAgentModelKey)
    .filter((item) => item?.capability === 'text')
    .filter((item) => {
      const key = `${item.provider}:${item.model}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((item) => ({ provider: item.provider, model: item.model }))
}

function agentInstructionText(agent = {}) {
  return textValue(agent.masterPrompt, '') || [
    agent.persona,
    agent.reportGoal,
    agent.generationLogic,
    agent.outputRules,
    agent.qualityRules,
    agent.fallbackRules,
  ].filter(Boolean).join('\n')
}

function finalProjectVersion(project = {}) {
  const versions = Array.isArray(project.versions) ? project.versions : []
  return versions.find((item) => item.id === project.finalVersionId) || versions[0] || {}
}

function summarizeReportMaterials(project = {}, config = {}) {
  const final = finalProjectVersion(project)
  return {
    courseTitle: project.courseTitle || project.course || '',
    hasSketch: Boolean(project.sketchOriginal),
    hasLineart: Boolean(project.sketchOptimized),
    versionCount: Array.isArray(project.versions) ? project.versions.length : 0,
    model3dCount: Array.isArray(project.models3d) ? project.models3d.length : 0,
    videoCount: Array.isArray(project.videos) ? project.videos.length : 0,
    textCount: [project.prompt, project.ideaSummary, project.courseIdeaText, project.courseIdeaVoiceText].filter(Boolean).length,
    finalTitle: final.title || project.title || 'AI创意作品',
    finalPrompt: project.prompt || final.prompt || '',
    selectedMaterials: Object.entries(config.materials || {}).filter(([, enabled]) => enabled).map(([key]) => key),
  }
}

function buildFallbackLayoutPlan(layout = 'text-focus') {
  const slots = []
  const add = (id, type, x, y, w, h, maxChars = 100) => slots.push({ id, type, x, y, w, h, maxChars })
  if (layout === 'cover-hero') {
    add('title', 'title', 0.1, 0.14, 0.54, 0.2, 32)
    add('subtitle', 'subtitle', 0.1, 0.38, 0.5, 0.1, 42)
    add('body', 'body', 0.1, 0.54, 0.5, 0.2, 90)
    add('image', 'image', 0.68, 0.34, 0.24, 0.36, 0)
  } else if (layout === 'image-text' || layout === 'model-showcase') {
    add('image', 'image', 0.07, 0.17, 0.48, 0.56, 0)
    add('title', 'title', 0.62, 0.14, 0.3, 0.14, 28)
    add('subtitle', 'subtitle', 0.62, 0.32, 0.3, 0.08, 40)
    add('body', 'body', 0.62, 0.46, 0.3, 0.28, 110)
  } else if (layout === 'before-after') {
    add('title', 'title', 0.08, 0.08, 0.78, 0.12, 28)
    add('subtitle', 'subtitle', 0.08, 0.22, 0.78, 0.07, 42)
    add('image-left', 'image', 0.08, 0.34, 0.38, 0.38, 0)
    add('image-right', 'image', 0.54, 0.34, 0.38, 0.38, 0)
    add('body', 'body', 0.1, 0.78, 0.8, 0.1, 80)
  } else if (layout === 'timeline' || layout === 'storyboard') {
    add('title', 'title', 0.08, 0.08, 0.72, 0.12, 30)
    add('subtitle', 'subtitle', 0.08, 0.22, 0.72, 0.07, 42)
    add('step-1', 'body', 0.08, 0.38, 0.19, 0.27, 56)
    add('step-2', 'body', 0.31, 0.38, 0.19, 0.27, 56)
    add('step-3', 'body', 0.54, 0.38, 0.19, 0.27, 56)
    add('step-4', 'body', 0.77, 0.38, 0.15, 0.27, 48)
  } else if (layout === 'review-card' || layout === 'comment') {
    add('title', 'title', 0.08, 0.1, 0.72, 0.12, 30)
    add('subtitle', 'subtitle', 0.08, 0.25, 0.68, 0.07, 42)
    add('review-1', 'body', 0.1, 0.42, 0.38, 0.16, 70)
    add('review-2', 'body', 0.52, 0.42, 0.38, 0.16, 70)
    add('review-3', 'body', 0.1, 0.63, 0.38, 0.16, 70)
    add('review-4', 'body', 0.52, 0.63, 0.38, 0.16, 70)
  } else if (layout === 'back-cover') {
    add('title', 'title', 0.16, 0.28, 0.68, 0.16, 34)
    add('subtitle', 'subtitle', 0.2, 0.48, 0.6, 0.1, 50)
    add('body', 'body', 0.18, 0.63, 0.64, 0.12, 60)
  } else {
    add('title', 'title', 0.1, 0.11, 0.76, 0.13, 30)
    add('subtitle', 'subtitle', 0.1, 0.27, 0.7, 0.08, 42)
    add('body', 'body', 0.1, 0.4, 0.76, 0.36, 140)
  }
  return { source: 'local-fallback', slots, warnings: ['文本模型未返回layoutPlan，已使用本地安全版式补齐。'] }
}

function normalizeLayoutPlan(layoutPlan = null, layout = 'text-focus', fallback = null) {
  const source = layoutPlan && typeof layoutPlan === 'object' ? layoutPlan : fallback
  const slots = Array.isArray(source?.slots) ? source.slots.slice(0, 12).map((slot, slotIndex) => ({
    id: textValue(slot.id, `slot-${slotIndex + 1}`),
    type: textValue(slot.type, 'body'),
    x: Number(slot.x),
    y: Number(slot.y),
    w: Number(slot.w),
    h: Number(slot.h),
    maxChars: Number(slot.maxChars || 100),
  })).filter((slot) => Number.isFinite(slot.x) && Number.isFinite(slot.y) && Number.isFinite(slot.w) && Number.isFinite(slot.h) && slot.w > 0 && slot.h > 0) : []
  if (!slots.length) return buildFallbackLayoutPlan(layout)
  return {
    source: textValue(source.source, 'deepseek'),
    slots,
    warnings: Array.isArray(source.warnings) ? source.warnings.map((item) => textValue(item)).filter(Boolean).slice(0, 8) : [],
  }
}

function normalizeAgentPageType(page = {}, index = 0, fallback = {}) {
  const layoutNames = new Set(['cover-hero', 'text-focus', 'before-after', 'timeline', 'image-text', 'review-card', 'comment', 'back-cover', 'model-showcase', 'storyboard'])
  const rawType = textValue(page.type || page.id, '')
  if (!rawType || layoutNames.has(rawType)) return textValue(fallback.type, `page-${index + 1}`)
  return rawType
}

function normalizeAgentPage(page = {}, index = 0, fallback = {}) {
  const type = normalizeAgentPageType(page, index, fallback)
  const layout = textValue(page.layout, fallback.layout || 'text-focus')
  return {
    id: textValue(page.id, fallback.id || `${type}-${index + 1}`),
    type,
    title: clipText(page.title, 28, fallback.title || `第 ${index + 1} 页`),
    subtitle: clipText(page.subtitle, 48, fallback.subtitle || ''),
    body: clipText(page.body || page.content || page.copy, 220, fallback.body || ''),
    layout,
    materials: Array.isArray(page.materials) ? page.materials.map((item) => textValue(item)).filter(Boolean).slice(0, 6) : (fallback.materials || []),
    speakerNotes: clipText(page.speakerNotes, 180, fallback.speakerNotes || ''),
    teacherCommentSuggestion: clipText(page.teacherCommentSuggestion, 160, fallback.teacherCommentSuggestion || ''),
    exportNote: clipText(page.exportNote, 120, fallback.exportNote || ''),
    visual: page.visual || fallback.visual || '',
    generatedImage: page.generatedImage || page.imageSlide || fallback.generatedImage || '',
    imageSlide: page.imageSlide || page.generatedImage || fallback.imageSlide || '',
    imagePrompt: clipText(page.imagePrompt, 500, fallback.imagePrompt || ''),
    layoutPlan: normalizeLayoutPlan(page.layoutPlan, layout, fallback.layoutPlan),
  }
}

function buildH5AgentFallbackPages(project = {}, config = {}, form = {}) {
  const final = finalProjectVersion(project)
  const title = project.title || final.title || '我的 AI 创意美术项目'
  const courseTitle = project.courseTitle || 'AI 创意美术项目课'
  const prompt = project.prompt || final.prompt || ''
  const answers = Array.isArray(project.courseAnswers)
    ? project.courseAnswers.map((item) => `${item.question || '课堂问题'}：${item.answer || '我还没有填写'}`).join('；')
    : ''
  const idea = project.ideaSummary || project.courseIdeaText || project.courseIdeaVoiceText || ''
  const versions = Array.isArray(project.versions) ? project.versions : []
  const versionText = versions.length
    ? versions.map((item, index) => `${index + 1}. ${item.title || 'AI 出图'}：${item.note || item.prompt || '记录一次生成和调整'}`).join('；')
    : ''
  return [
    { id: 'cover', type: 'cover', title, subtitle: courseTitle, body: `这是我完成《${title}》项目的 H5 汇报。`, layout: 'cover-hero', materials: ['finalImage'] },
    { id: 'course', type: 'course', title: '我理解的课程项目', subtitle: courseTitle, body: answers || project.courseDescription || '我会整理课堂问题、课程目标和我对主题的理解。', layout: 'text-focus', materials: ['courseAnswers'] },
    { id: 'idea', type: 'idea', title: '我的创意想法', subtitle: '我想表达什么', body: idea || `我的创意从“${prompt || title}”开始，我会把自己的想法整理成清楚的画面方向。`, layout: 'text-focus', materials: ['courseAnswers', 'prompt'] },
    { id: 'process', type: 'process', title: '我的手绘草稿', subtitle: '草稿和创意描述', body: project.sketchComment || (project.sketchOriginal ? '我上传了手绘草稿，用它记录最早的构图和主体想法。' : '我还没有上传手绘草稿，报告会先记录我的文字创意。'), layout: 'before-after', materials: ['sketchOriginal', 'sketchOptimized'] },
    { id: 'aiPrompt', type: 'aiPrompt', title: '我的 AI 提示词', subtitle: '把想法变成指令', body: prompt ? `我把创意整理成提示词：“${prompt}”。这个提示词帮助 AI 理解主题、风格、颜色和细节。` : '我还没有填写 AI 提示词，后续会把主题、风格、颜色和细节补充完整。', layout: 'text-focus', materials: ['prompt'] },
    { id: 'aiProcess', type: 'aiProcess', title: '我的 AI 出图过程', subtitle: '生成、比较和调整', body: versionText || '我还没有生成多个 AI 版本，后续会记录每次出图、比较和调整。', layout: 'timeline', materials: ['aiVersions'] },
    { id: 'finalWork', type: 'finalWork', title: '我的最终作品', subtitle: '成品创意说明', body: project.finalArtworkUrl ? '我最后选择这张作品作为成品，因为它最接近我的主题，也能完整展示我的创意想法。' : '我还没有确定最终作品，生成成品后这里会展示图片并说明选择理由。', layout: 'image-text', materials: ['finalImage'] },
    { id: 'aiReview', type: 'aiReview', title: 'AI 给我的作品点评', subtitle: '优点和下一步', body: '我的作品主题比较清楚，已经有完整的视觉中心。下一步我可以继续加强细节、背景故事和颜色层次。', layout: 'review-card', materials: ['finalImage'] },
    { id: 'teacherComment', type: 'teacherComment', title: '讲师给我的成长建议', subtitle: '课堂反馈', body: form.teacherComment || '讲师可以在这里补充课堂表现、作品亮点和下一步练习建议。', layout: 'comment', materials: ['teacherComment'] },
    { id: 'backCover', type: 'backCover', title: '我的项目收获', subtitle: '继续创作', body: '这次项目让我学会把观察、草稿、提示词和 AI 出图整理成完整作品。', layout: 'back-cover', materials: [] },
  ].map((page) => ({
    ...page,
    speakerNotes: '',
    teacherCommentSuggestion: '',
    exportNote: '',
    layoutPlan: buildFallbackLayoutPlan(page.layout),
  }))
}

function buildAgentFallbackPages(project = {}, config = {}, form = {}) {
  const legacyPages = buildReportPages(project)
  const basePages = legacyPages.map((page, index) => ({
    id: ['cover', 'understanding', 'sketch', 'iteration', 'finalDesign', 'aiReview', 'teacher', 'backCover'][index] || `page-${index + 1}`,
    type: ['cover', 'understanding', 'sketch', 'iteration', 'finalDesign', 'aiReview', 'teacher', 'backCover'][index] || 'custom',
    title: page.title,
    subtitle: page.subtitle,
    body: page.body,
    layout: ['cover-hero', 'text-focus', 'before-after', 'timeline', 'image-text', 'review-card', 'comment', 'back-cover'][index] || 'text-focus',
    materials: index === 0 || index === 4 ? ['finalImage'] : index === 2 ? ['sketchOriginal', 'sketchOptimized'] : index === 3 ? ['versions'] : [],
    speakerNotes: '按页面内容进行课堂展示说明。',
    teacherCommentSuggestion: '',
    exportNote: '',
  }))
  if (project.models3d?.length && config.materials?.models3d !== false) {
    basePages.splice(5, 0, {
      id: 'model3d',
      type: 'model3d',
      title: '3D模型展示',
      subtitle: '多角度结构与课堂展示',
      body: '展示 3D 模型素材、厚度、旋转角度和课堂展示说明，帮助小画家从平面创意延伸到立体表达。',
      layout: 'model-showcase',
      materials: ['models3d'],
      speakerNotes: '说明从二维到三维的转换。',
      teacherCommentSuggestion: '',
      exportNote: '',
    })
  }
  if (project.videos?.length && config.materials?.videos !== false) {
    basePages.splice(5, 0, {
      id: 'video',
      type: 'video',
      title: 'AI视频分镜',
      subtitle: '镜头脚本与动态表达',
      body: '整理 AI 视频素材的开场、主体运动、细节特写和结尾展示，适合说明运镜与节奏。',
      layout: 'storyboard',
      materials: ['videos'],
      speakerNotes: '说明动态创作意图。',
      teacherCommentSuggestion: '',
      exportNote: '',
    })
  }
  if (form.teacherComment && basePages.find((page) => page.type === 'teacher')) {
    basePages.find((page) => page.type === 'teacher').body = form.teacherComment
  }
  return basePages
}

function normalizeAgentReport(raw = {}, request = {}, provider = 'api', model = '') {
  // 轻量叙事模式只回一段话，不做页结构兜底（避免把 narration 塞进 pages 里又被裁掉）
  if (request.mode === 'h5-narration') {
    const narration = clipText(raw.narration || raw.idea || raw.narrationText || '', 800, '')
    return {
      provider: 'api',
      agentProvider: provider,
      model,
      agentId: request.agent?.id || '',
      agentName: request.agent?.name || '',
      flowKey: request.flowKey || '',
      narration,
    }
  }
  const project = request.project || {}
  const config = request.config || {}
  const form = request.form || {}
  const agent = request.agent || {}
  const fallbackPages = request.mode === 'h5-first-person-report'
    ? buildH5AgentFallbackPages(project, config, form)
    : buildAgentFallbackPages(project, config, form)
  const rawPages = Array.isArray(raw.pages) ? raw.pages : []
  const pages = fallbackPages.map((fallback, index) => normalizeAgentPage(rawPages[index] || {}, index, fallback))
  rawPages.slice(fallbackPages.length, 14).forEach((page, offset) => {
    pages.push(normalizeAgentPage(page, fallbackPages.length + offset, {}))
  })
  const outlineSource = Array.isArray(raw.outline) && raw.outline.length ? raw.outline : pages
  const styleOptions = Array.isArray(raw.styleOptions) ? raw.styleOptions.slice(0, 3).map((style, index) => ({
    id: textValue(style.id, `agent-style-${index + 1}`),
    name: clipText(style.name || style.title, 24, `PPT风格 ${index + 1}`),
    desc: clipText(style.desc || style.description, 100, '根据智能体生成的PPT页图风格方向。'),
    rendererPreset: textValue(style.rendererPreset, index === 1 ? 'portfolio' : index === 2 ? 'brand' : 'classroom'),
    footerBrand: clipText(style.footerBrand, 40, '美佳美画 AI 创意美术'),
    theme: style.theme && typeof style.theme === 'object' ? style.theme : {},
  })) : []
  const hasGeneratedImages = pages.some((page) => page.generatedImage || page.imageSlide)
  const image2Status = raw.image2Status && typeof raw.image2Status === 'object'
    ? raw.image2Status
    : {
        ok: hasGeneratedImages,
        message: hasGeneratedImages
          ? 'Image2已返回PPT页图。'
          : 'Image2页图生成能力未启用，请在API配置中配置可用图像模型。',
      }
  return {
    provider: 'api',
    agentProvider: provider,
    model,
    agentId: request.agent?.id || '',
    agentName: request.agent?.name || '',
    flowKey: request.flowKey || '',
    agentTaskType: textValue(agent.taskType, 'text'),
    allowedModelKeys: Array.isArray(agent.allowedModelKeys) ? agent.allowedModelKeys : [],
    defaultModelKey: textValue(agent.defaultModelKey, ''),
    fallbackModelKey: textValue(agent.fallbackModelKey, ''),
    modelParams: agent.modelParams || defaultReportAgentConfig.modelParams,
    modelSelection: resolveTextModelForAgent(agent),
    reportTitle: clipText(raw.reportTitle || raw.title, 60, form.title || `${project.title || '项目'}完整创作报告`),
    theme: clipText(raw.theme, 60, project.courseTitle || project.title || 'AI创意美术项目'),
    reportDocument: clipText(raw.reportDocument || raw.document, 4000, request.reportDocument || ''),
    outline: outlineSource.map((page, index) => normalizeAgentPage(page, index, pages[index] || {})),
    styleOptions,
    image2Status,
    pages,
    materialSummary: raw.materialSummary && typeof raw.materialSummary === 'object' ? raw.materialSummary : summarizeReportMaterials(project, config),
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map((item) => clipText(item, 120)).filter(Boolean).slice(0, 6) : [],
    createdAt: new Date().toISOString(),
  }
}

function resolveReportAgentFlowKey(request = {}) {
  if (request.flowKey) return request.flowKey
  if (request.mode === 'rewrite-page') return 'report.rewritePage'
  if (request.mode === 'materials-to-outline') return 'report.materialsToOutline'
  if (request.mode === 'image2-deck-style') return 'report.image2DeckStyle'
  if (request.mode === 'full-ppt-image-deck') return 'report.fullPptImageDeck'
  const difficulty = request.difficulty || request.config?.difficulty || ''
  if (['junior', 'starter'].includes(difficulty)) return 'report.youngMode'
  if (['advanced', 'pro'].includes(difficulty)) return 'report.advancedMode'
  return 'report.full'
}

function resolveReportAgent(request = {}) {
  const state = readReportAgentConfig()
  const flowKey = resolveReportAgentFlowKey(request)
  const enabledAgents = state.agents.filter((agent) => agent.status === 'enabled')
  const fallback = enabledAgents[0] || state.agents[0] || normalizeSingleReportAgent(defaultReportAgentConfig)
  const requestedAgentId = textValue(request.agentId, request.config?.agentId || '')
  const boundId = state.bindings?.[flowKey] || state.bindings?.['report.full'] || state.activeAgentId
  const agent = enabledAgents.find((item) => item.id === requestedAgentId)
    || enabledAgents.find((item) => item.id === boundId)
    || state.agents.find((item) => item.id === boundId)
    || fallback
  return { agent, flowKey, state }
}

// 轻量模式：只整理一段学生第一人称的创作叙事（不生成整份报告页）。
// 学生端点「整理创作构思」走这里，输出短、耗时短、花钱少。
function buildH5NarrationPrompt(request = {}) {
  const project = request.project || {}
  const final = finalProjectVersion(project)
  const answers = project.courseAnswers && typeof project.courseAnswers === 'object'
    ? Object.values(project.courseAnswers).map((item) => clipText(item, 120, '')).filter(Boolean).slice(0, 6)
    : []
  const versions = (project.versions || []).slice(0, 5).map((item, index) => ({
    序号: index + 1,
    标题: clipText(item.title, 40, ''),
    说明: clipText(item.note, 80, ''),
    提示词: clipText(item.prompt, 120, ''),
    是否有图: Boolean(item.imageUrl || item.background || item.hasImage),
  }))
  const facts = {
    作品名称: clipText(project.title, 40, ''),
    课程: clipText(project.courseTitle, 60, ''),
    课程描述: clipText(project.courseDescription, 200, ''),
    课堂回答: answers,
    我的想法: clipText(project.ideaSummary || project.courseIdeaText || project.courseIdeaVoiceText || project.ideaRawAnswers || '', 400, ''),
    草稿说明: clipText(project.sketchComment, 200, ''),
    有手绘草图: Boolean(project.sketchOriginal || project.sketchOptimized),
    参考图数量: Array.isArray(project.referenceImages) ? project.referenceImages.length : 0,
    画图提示词: clipText(project.prompt || final.prompt, 300, ''),
    AI版本: versions,
    已经写过的叙事: clipText(project.idea || project.reportIdea || '', 800, ''),
  }
  return `你是少儿美术老师，帮学生把「这次创作我是怎么想、怎么做的」整理成一段学生自己说的话。

严格规则：
1. 只输出 JSON 对象：{"narration":"……"}。不要 Markdown、不要解释、不要分点、不要小标题。
2. narration 必须是学生第一人称「我」，3～6 句，总长 120～260 字，像学生自己口述，不要作文腔。
3. 只能使用下面资料里真实存在的信息。资料里没有的内容（颜色、地点、心情、老师的评价等）一律不要编造，宁可写短一点。
4. 结构参考：我先想做什么 → 画草图或定方案时怎么想的 → 用 AI 出图后我怎么调整 → 我最后选了什么、为什么。
5. 不要用「资料」「提示词里写着」「根据以上信息」这类机器口吻，直接说内容本身。
6. 资料太少时就写 2～3 句实话，不要凑字数、不要写成模板。

项目资料（JSON）：
${JSON.stringify(facts, null, 1)}`
}

function buildH5FirstPersonReportPrompt(request = {}) {
  const project = request.project || {}
  const config = request.config || {}
  const form = request.form || {}
  const contentProfile = config.contentProfile || 'starter-self-narration'
  const contentProfileInstruction = {
    'starter-self-narration': '入门版表达：使用孩子易懂的短句，像小画家亲口讲述自己的想法和完成过程，少用专业术语。',
    'story-narration': '故事讲述型表达：按“灵感出现、尝试、变化、完成、收获”的故事线组织，但不得虚构事实。',
    'advanced-portfolio': '成长作品集表达：突出观察、构图、色彩、草图对比、修改原因和阶段性成长。',
    'pro-designer-story': '专业设计讲解表达：保留小画家第一人称，加入设计目标、视觉选择、提示词策略、迭代判断和作品集式总结。',
  }[contentProfile] || '使用自然、真实的小画家第一人称表达。'
  const final = finalProjectVersion(project)
  const materialSummary = summarizeReportMaterials(project, config)
  const projectData = {
    title: project.title,
    courseTitle: project.courseTitle,
    courseDescription: project.courseDescription,
    courseAnswers: project.courseAnswers,
    courseAnswerText: project.courseAnswerText,
    ideaSummary: project.ideaSummary,
    courseIdeaText: project.courseIdeaText,
    courseIdeaVoiceText: project.courseIdeaVoiceText,
    sketchComment: project.sketchComment,
    hasSketchOriginal: Boolean(project.sketchOriginal),
    hasSketchOptimized: Boolean(project.sketchOptimized),
    referenceImageCount: Array.isArray(project.referenceImages) ? project.referenceImages.length : 0,
    prompt: project.prompt || final.prompt,
    versions: (project.versions || []).slice(0, 8).map((item, index) => ({
      index: index + 1,
      title: item.title,
      note: item.note,
      prompt: item.prompt,
      provider: item.provider,
      model: item.model,
      hasImage: Boolean(item.imageUrl || item.background || item.hasImage),
    })),
    finalArtworkUrl: project.finalArtworkUrl ? '已提供最终作品图片' : '',
    teacherComment: form.teacherComment,
    materialSummary,
  }

  return `你是“H5第一人称项目报告智能体”。请把学生在 AI 创意美术项目中的完整资料，整理成可左右翻页浏览、可分享、可导出 PDF 的 H5 项目汇报。

核心目标：
1. 必须使用学生第一人称“我”来写，语气像学生在向老师汇报自己的创作过程。
表达策略：${contentProfileInstruction}
2. 智能分析并总结：课程项目回答、课堂理解、创意想法、手绘草稿、草稿创意描述、AI 提示词、AI 出图过程、AI 图片调整分析、最终作品选择理由、成品创意表达。
3. 文档和图片要整理成完整项目报告。不要只写泛泛评价；要尽量引用学生真实回答、草稿描述、提示词和版本调整记录。
4. 不要编造不存在的图片。缺少素材时写清楚“我还没有上传/生成这部分素材”，但仍要完成报告。
5. 每页适合 H5 左右翻页阅读：标题短，正文 2-5 句，第一人称，自然、清楚、有成长感。
6. 只输出合法 JSON 对象。不要输出 Markdown，不要输出解释，不要在 JSON 外输出任何文字。

必须返回 8-10 页，建议页面结构：
cover：封面，我的项目主题和最终作品
course：我理解的课程项目，整理课程问题和回答
idea：我的创意想法，说明我想表达什么
process：我的手绘草稿，整理草稿内容和创意描述
aiPrompt：我的 AI 提示词，分析提示词如何表达主题、风格、颜色、细节
aiProcess：我的 AI 出图过程，整理每次生成、比较、修改和调整
finalWork：我的最终作品，说明为什么选择这张作品和成品创意
aiReview：AI 给我的作品点评，从优点和下一步建议写
teacherComment：老师给我的成长建议，可结合老师评语
backCover：封底，总结我的收获

返回 JSON 格式必须完全符合：
{
  "reportTitle": "",
  "theme": "",
  "reportDocument": "",
  "materialSummary": {},
  "warnings": [],
  "pages": [
    {
      "id": "cover",
      "type": "cover",
      "title": "",
      "subtitle": "",
      "body": "",
      "layout": "cover-hero",
      "materials": ["finalImage"],
      "speakerNotes": "",
      "teacherCommentSuggestion": "",
      "layoutPlan": {
        "source": "agent",
        "slots": [
          { "id": "title", "type": "title", "x": 0.08, "y": 0.1, "w": 0.52, "h": 0.14, "maxChars": 28 },
          { "id": "body", "type": "body", "x": 0.08, "y": 0.34, "w": 0.48, "h": 0.34, "maxChars": 120 },
          { "id": "image", "type": "image", "x": 0.62, "y": 0.2, "w": 0.3, "h": 0.45, "maxChars": 0 }
        ],
        "warnings": []
      }
    }
  ]
}

可用 layout：cover-hero, text-focus, before-after, timeline, image-text, review-card, comment, back-cover。
可用 materials：finalImage, sketchOriginal, sketchOptimized, referenceImages, aiVersions, prompt, courseAnswers, teacherComment。

项目数据：
${JSON.stringify(projectData, null, 2)}

报告配置：
${JSON.stringify({
    title: form.title,
    difficulty: request.difficulty || config.difficulty,
    selectedStyle: request.selectedStyle || null,
    instruction: request.instruction || '',
  }, null, 2)}`
}

function buildReportAgentPrompt(request = {}) {
  const project = request.project || {}
  const config = request.config || {}
  const form = request.form || {}
  const isH5FirstPersonReport = request.mode === 'h5-first-person-report'
  if (request.mode === 'h5-narration') return buildH5NarrationPrompt(request).slice(0, 12000)
  if (isH5FirstPersonReport) return buildH5FirstPersonReportPrompt(request).slice(0, 24000)
  const agentConfig = request.agent || resolveReportAgent(request).agent
  const final = finalProjectVersion(project)
  const materialSummary = summarizeReportMaterials(project, config)
  const difficultyText = agentConfig.difficultyRules?.[request.difficulty || config.difficulty]
    || defaultReportAgentConfig.difficultyRules.starter
  const configuredPrompt = textValue(agentConfig.masterPrompt, '')
  const agentPrompt = configuredPrompt || `${agentConfig.persona}

智能体名称：${agentConfig.name}
报告目标：${agentConfig.reportGoal}
生成逻辑：${agentConfig.generationLogic}
可读取输入：${agentConfig.inputScope}
页面结构规则：${agentConfig.pageStructure}
排版规则：${agentConfig.layoutRules}
输出规则：${agentConfig.outputRules}
质量检查规则：${agentConfig.qualityRules}
失败或素材缺失处理：${agentConfig.fallbackRules}`

  const taskRules = isH5FirstPersonReport
    ? `目标：
1. 生成“学生第一人称 H5 项目汇报”，不是 PPT。
2. 必须用“我”的视角整理学生全过程资料，语言自然，像学生向老师介绍自己的创作过程。
3. 智能分析并整理：课程项目回答、创意想法、手绘草稿、草稿创意描述、AI提示词、AI出图过程、图片调整分析、最终作品选择理由和成品创意说明。
4. 每页适合 H5 左右翻页阅读，正文 2-5 句，避免空泛套话。
5. 不要编造不存在的图片；缺少素材时写清“我还没有上传/生成”，但仍然完成报告。
6. 每页都要有明确 title、subtitle、body、layout、materials、speakerNotes、teacherCommentSuggestion。
7. 难度策略：${difficultyText}。
8. layoutPlan.slots 坐标仍按 16:9 画布内 0-1 比例输出，供本地模板引擎兼容使用。`
    : `目标：
1. 根据学生项目素材生成“文案 + 排版”报告稿。
2. 每页文字适合 PPT，不要写成长文。
3. 每页都要有明确 title、subtitle、body、layout、materials、speakerNotes、teacherCommentSuggestion。
4. 遵守后台配置的页面结构规则。
5. 如果有 3D 或视频素材，按后台配置决定是否增加 model3d 或 video 页面。
6. 难度策略：${difficultyText}。
7. 如果你是 DeepSeek 或文本模型，只负责输出结构化排版方案，不生成整页图片；本地模板引擎会根据 layoutPlan.slots 渲染预览和PPTX。
8. layoutPlan.slots 必须避开重叠，文字框不要压到图片框；坐标均为16:9画布内0-1比例。`

  return `${agentPrompt}

只输出 JSON 对象，不要输出 Markdown，不要解释。

${taskRules}

返回 JSON 结构：
{
  "reportTitle": "",
  "theme": "",
  "reportDocument": "",
  "outline": [],
  "styleOptions": [
    { "id": "style-1", "name": "风格名称", "desc": "风格说明", "rendererPreset": "classroom", "theme": {} }
  ],
  "image2Status": { "ok": false, "message": "如果没有真实页图，说明Image2未启用" },
  "materialSummary": {},
  "warnings": [],
  "pages": [
    {
      "id": "cover",
      "type": "cover",
      "title": "",
      "subtitle": "",
      "body": "",
      "layout": "cover-hero",
      "materials": ["finalImage"],
      "imagePrompt": "用于生成本页完整PPT页图的图像提示词",
      "generatedImage": "",
      "imageSlide": "",
      "layoutPlan": {
        "source": "deepseek",
        "slots": [
          { "id": "title", "type": "title", "x": 0.08, "y": 0.1, "w": 0.5, "h": 0.14, "maxChars": 28 },
          { "id": "body", "type": "body", "x": 0.08, "y": 0.34, "w": 0.48, "h": 0.34, "maxChars": 110 },
          { "id": "image", "type": "image", "x": 0.62, "y": 0.2, "w": 0.3, "h": 0.45, "maxChars": 0 }
        ],
        "warnings": []
      },
      "speakerNotes": "",
      "teacherCommentSuggestion": "",
      "exportNote": ""
    }
  ]
}

可用 layout：cover-hero, text-focus, before-after, timeline, image-text, review-card, comment, back-cover, model-showcase, storyboard。

项目数据：
${JSON.stringify({
    title: project.title,
    courseTitle: project.courseTitle,
    courseDescription: project.courseDescription,
    prompt: project.prompt || final.prompt,
    ideaSummary: project.ideaSummary,
    courseIdeaText: project.courseIdeaText,
    courseIdeaVoiceText: project.courseIdeaVoiceText,
    courseAnswers: project.courseAnswers,
    courseAnswerText: project.courseAnswerText,
    versions: (project.versions || []).slice(0, 6).map((item, index) => ({
      index: index + 1,
      title: item.title,
      note: item.note,
      prompt: item.prompt,
      provider: item.provider,
      model: item.model,
    })),
    models3d: (project.models3d || []).slice(0, 4),
    videos: (project.videos || []).slice(0, 4),
    hasSketchOriginal: Boolean(project.sketchOriginal),
    hasSketchOptimized: Boolean(project.sketchOptimized),
    sketchComment: project.sketchComment,
    referenceImageCount: Array.isArray(project.referenceImages) ? project.referenceImages.length : 0,
    finalArtworkUrl: project.finalArtworkUrl ? '已提供最终作品图片' : '',
    materialSummary,
  }, null, 2)}

报告配置：
${JSON.stringify({
    title: form.title,
    teacherComment: form.teacherComment,
    aiText: form.aiText,
    template: config.template,
    chapters: config.chapters,
    materials: config.materials,
    range: config.range,
    exportQuality: config.exportQuality,
    mode: request.mode || 'full-report',
    agentTaskType: agentConfig.taskType || 'text',
    allowedModelKeys: agentConfig.allowedModelKeys || [],
    defaultModelKey: agentConfig.defaultModelKey || '',
    fallbackModelKey: agentConfig.fallbackModelKey || '',
    modelParams: agentConfig.modelParams || defaultReportAgentConfig.modelParams,
    reportDocument: request.reportDocument || '',
    reportOutline: request.reportOutline || [],
    selectedStyle: request.selectedStyle || null,
    page: request.page || null,
    instruction: request.instruction || '',
  }, null, 2)}`.slice(0, 24000)
}

async function generateReportWithAgent(request = {}) {
  const resolved = resolveReportAgent(request)
  const nextRequest = { ...request, agent: resolved.agent, flowKey: resolved.flowKey }
  const result = await generateTextJson({
    provider: request.provider,
    model: request.model,
    prompt: buildReportAgentPrompt(nextRequest),
    temperature: Number.isFinite(Number(resolved.agent?.modelParams?.temperature))
      ? Number(resolved.agent.modelParams.temperature)
      : request.mode === 'rewrite-page'
        ? 0.35
        : 0.2,
    timeoutMs: Math.max(10000, Number(resolved.agent?.modelParams?.timeoutSeconds || 120) * 1000),
    agentId: resolved.agent?.id || '',
    flowKey: resolved.flowKey,
    maxTokens: request.maxTokens,
    config: request.config,
  })
  return normalizeAgentReport(result.json, nextRequest, result.provider, result.model)
}

// —— AI 创作伙伴（智能体 + 技能）-------------------------------------------
// 运行时只拿到它需要的几个函数，供应商配置、出图、计费都复用现有实现，不另起一套。
const AGENT_WORK_TYPES = { project: '作品', sketch: '草图' }
const AGENT_VIDEO_TIMEOUT_MS = 30 * 60 * 1000
const AGENT_VIDEO_POLL_GAP_MS = 3000
const AGENT_VIDEO_PERSIST_ATTEMPTS = 3

// 对话里生成的图片存在 /api/agent-images/ 下，外部模型读不到站内路径：作参考图 / 视频首帧前先换成 data URL。
function resolveAgentReferences(images, user) {
  return (Array.isArray(images) ? images : []).map((value) => agentImageDataUrl(value, { user, dataDir }) || value)
}

// 把关键词拆成两字片段再匹配，"海报设计" 也能找到标题叫 "节日海报" 的玩法。
function keywordScore(haystack, keyword) {
  const words = String(keyword || '').toLowerCase().split(/[\s,，、]+/).filter(Boolean)
  return words.reduce((sum, word) => {
    if (haystack.includes(word)) return sum + 3
    const grams = word.length <= 2 ? [] : Array.from({ length: word.length - 1 }, (_, index) => word.slice(index, index + 2))
    return sum + grams.filter((gram) => haystack.includes(gram)).length
  }, 0)
}

const agentRuntime = createAgentRuntime({
  dataDir: () => dataDir,
  getProviders: () => mergedProviders(),
  providerKeyUsable,
  availableModels: availableProviderModels,
  modelEnabled,
  defaultTextProvider: () => {
    const saved = readProviderConfig()
    return String(saved.defaultTextProvider || DEFAULT_TEXT_PROVIDER || saved.defaultProvider || DEFAULT_PROVIDER || '').toLowerCase()
  },
  defaultImageProvider: () => String(readProviderConfig().defaultProvider || DEFAULT_PROVIDER || '').toLowerCase(),
  authMode: AUTH_MODE,
  chargeAbility,
  refundAbility,
  // 统一风控：用户输入走 checkContent（会记录、累计违规）；AI 回复流式输出时用 riskChecker 同步判断。
  checkContent,
  riskChecker: riskCheckerFor,
  reportError: (user, error) => recordAppError({ error, status: Number(error?.statusCode) || 502, user, kind: 'ai', path: '/api/agent/chat', req: { method: 'POST' } }),
  async generateImage(request, user) {
    let result
    try {
      result = await generateImages({ ...request, images: resolveAgentReferences(request.images, user) }, { user })
    } catch (error) {
      // 通用出图函数的这条报错是写给画布看的（"断开上游连线"），在对话里换成能看懂的说法。
      if (error?.statusCode === 400 && /不支持参考图/.test(String(error.message || ''))) {
        throw Object.assign(new Error('当前图像模型不支持参考图，可以不带参考图重新生成，或请管理员换一个支持图生图的模型。'), { statusCode: 400 })
      }
      throw error
    }
    const preserved = await preserveGeneratedImages(result.images, { user, dataDir, kind: 'ai-generated' })
    const images = await Promise.all(preserved.images.map(async (image) => ({
      ...image,
      imageUrl: await persistAgentImage(image.imageUrl, { user, dataDir }),
    })))
    return { ...result, images }
  },
  async visionDataUrl(url, user) {
    const dataUrl = await localAssetReferenceAsDataUrl(url, user)
    return dataUrl ? await shrinkVisionImage(dataUrl) : ''
  },
  videoTarget() {
    const provider = mergedProviders().agnes
    if (!provider || provider.enabled === false || !providerKeyUsable(provider)) return null
    const model = availableProviderModels(provider, 'video')[0]
    return model ? { provider: 'agnes', model, label: provider.label || 'Agnes' } : null
  },
  // 提交视频任务并记录到 ai_tasks（本人可见）。计费信息一起存下，生成失败时轮询接口据此自动退回。
  async submitVideo(request, user, meta = {}) {
    const result = await generateAgnesVideo({
      prompt: request.prompt, ratio: request.ratio, provider: request.provider, model: request.model,
      images: resolveAgentReferences(request.images, user),
    }, { user })
    const charge = meta.charge
    const task = await createAiTask(user, {
      taskType: 'video', provider: result.provider, providerTaskId: result.taskId, status: result.status,
      result: {
        source: 'agent', duration: result.duration, referenceImageCount: result.referenceImageCount,
        prompt: String(request.prompt || '').slice(0, 300), ratio: request.ratio || '16:9',
        bizType: meta.bizType || '', bizId: meta.bizId || '',
        charge: charge ? { charged: charge.charged || 0, freeCovered: charge.freeCovered || 0, paidCount: charge.paidCount || 0, alreadyCharged: Boolean(charge.alreadyCharged) } : null,
      },
    })
    return { taskId: task.id, status: task.status }
  },
  // 平台「创作玩法」（管理员配置的固定流程）。只有用户和管理员有对应页面，讲师账号不返回。
  async findWorkflows(user, keyword) {
    if (!['student', 'admin'].includes(user.role)) return []
    const skills = await listStudentSkills(user).catch(() => [])
    const word = String(keyword || '').trim()
    return skills
      .map((skill) => ({ skill, score: word ? keywordScore(`${skill.title} ${skill.summary} ${skill.categoryName} ${skill.skillType === 'video' ? '视频 动画' : '图片 绘画'}`.toLowerCase(), word) : 1 }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ skill }) => ({
        id: skill.id,
        title: skill.title,
        summary: String(skill.summary || '').slice(0, 80),
        type: skill.skillType === 'video' ? '视频' : '图片',
        path: user.role === 'admin' ? `/admin/ai-skills/${encodeURIComponent(skill.id)}/student-page` : `/student/skills/${encodeURIComponent(skill.id)}`,
      }))
  },
  async searchPrompts(user, keyword) {
    const library = await listPromptLibrary(user)
    const names = new Map((library.categories || []).map((item) => [item.id, item.name]))
    const words = String(keyword || '').toLowerCase().split(/\s+/).filter(Boolean)
    const scored = (library.prompts || []).map((item) => {
      const haystack = `${item.label} ${item.prompt} ${names.get(item.categoryId) || ''}`.toLowerCase()
      return { item, score: words.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0) }
    }).filter((entry) => !words.length || entry.score > 0)
    return scored.sort((a, b) => b.score - a.score).slice(0, 6)
      .map(({ item }) => ({ title: item.label, category: names.get(item.categoryId) || '', prompt: String(item.prompt || '').slice(0, 300) }))
  },
  async listCourses(user, keyword) {
    const courses = await listCourses(user)
    const word = String(keyword || '').trim().toLowerCase()
    return courses
      .filter((course) => user.role !== 'student' || course.status === 'published')
      .filter((course) => !word || `${course.title} ${course.category || ''} ${course.summary || course.description || ''}`.toLowerCase().includes(word))
      .slice(0, 8)
      .map((course) => ({
        title: course.title,
        category: course.categoryName || course.category || '',
        summary: String(course.summary || course.description || course.intro || '').slice(0, 120),
      }))
  },
  async listWorks(user, limit) {
    if (user.role !== 'student') return []
    const lists = await Promise.all(Object.keys(AGENT_WORK_TYPES).map((type) => listOwnDocuments(user, type).catch(() => [])))
    return lists.flat()
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, limit)
      .map((doc) => ({ title: doc.title || '未命名', kind: AGENT_WORK_TYPES[doc.type] || '作品', updatedAt: doc.updatedAt }))
  },
  recordCall(entry) {
    try {
      agentCallLog.append({
        flowKey: 'assistant.chat',
        agentId: 'creative-partner',
        agentName: entry.agentName || 'AI 创作伙伴',
        provider: entry.provider,
        model: entry.model,
        status: entry.status,
        durationMs: entry.durationMs,
        source: 'agent-chat',
        summary: entry.summary,
        error: entry.error,
      })
    } catch {}
  },
})

// 支持 Range：iPhone / iPad 的 Safari 播放视频前会先要 0-1 字节，不支持就放不出来；拖动进度条也靠它。
function sendAgentFile(req, res, filePath, cacheControl = 'private, max-age=86400') {
  if (!filePath) return sendJson(res, 404, { ok: false, message: '文件不存在' })
  const size = statSync(filePath).size
  const headers = { 'Content-Type': contentTypeForFile(filePath), 'Cache-Control': cacheControl, 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' }
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || '').trim())
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    if (!(start <= end) || start >= size) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` })
      res.end()
      return
    }
    res.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}` })
    createReadStream(filePath, { start, end }).pipe(res)
    return
  }
  res.writeHead(200, { ...headers, 'Content-Length': size })
  createReadStream(filePath).pipe(res)
}

function agentVideoView(task, extra = {}) {
  const result = task.result || {}
  const status = ['succeeded', 'failed', 'processing'].includes(task.status) ? task.status : 'queued'
  return {
    taskId: task.id,
    status,
    progress: status === 'succeeded' ? 100 : Math.max(0, Math.min(99, Math.round(Number(result.progress) || 0))),
    videoUrl: status === 'succeeded' ? String(result.videoUrl || '') : '',
    prompt: String(result.prompt || ''),
    ratio: String(result.ratio || '16:9'),
    error: status === 'failed' ? (task.errorMessage || '视频生成失败了，请稍后再试。') : '',
    refund: status === 'failed' && result.refund ? { credits: result.refund.credits || 0, freeUses: result.refund.freeUses || 0 } : null,
    temporary: status === 'succeeded' && result.persisted === false,
    createdAt: task.createdAt,
    ...extra,
  }
}

function friendlyVideoError(raw) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 100)
  if (/sensitive|moderation|safety|policy|违规|敏感|审核|不合规/i.test(text)) return '视频描述没有通过内容安全检查，换个说法再试试吧。'
  return `视频生成失败了${text ? `（${text}）` : ''}，请稍后再试。`
}

// 失败收尾：原子地关闭任务，只有拿到关闭标记的那个请求去退款，多个页面同时轮询也只退一次。
async function failAgentVideo(user, task, message) {
  const claimed = await claimOwnAiTaskFlag(user, task.id, 'closedAt')
  if (!claimed) return getOwnAiTask(user, task.id, 'video')
  let refund = null
  const { charge, bizType, bizId } = claimed.result || {}
  if (charge && bizType && bizId) {
    try {
      const back = await refundAbility(user, { ability: 'video', bizType, bizId, charge, reason: '视频生成失败自动退回' })
      refund = { credits: back.refunded || 0, freeUses: back.freeRestored || 0 }
    } catch (error) {
      console.warn('[agent-video] 自动退回失败：', error?.message || error)
      refund = { credits: 0, freeUses: 0, error: true }
    }
  }
  return updateOwnAiTask(user, task.id, { status: 'failed', errorMessage: message, result: { ...claimed.result, refund } })
}

/** 查询对话里视频任务的进度；完成后把视频转存到本站，失败自动退回积分 / 免费次数。只能查本人的任务。 */
async function pollAgentVideo(user, taskId) {
  let task = await getOwnAiTask(user, taskId, 'video')
  if (task.result?.source !== 'agent') throw Object.assign(new Error('视频任务不存在'), { statusCode: 404 })
  if (task.status === 'succeeded' || task.status === 'failed') return agentVideoView(task)
  if (Date.now() - new Date(task.createdAt).getTime() > AGENT_VIDEO_TIMEOUT_MS) {
    return agentVideoView(await failAgentVideo(user, task, '视频生成超时了，请稍后重新生成。'))
  }
  const persistingAt = Number(task.result?.persistingAt || 0)
  if (persistingAt && Date.now() - persistingAt < 180000) return agentVideoView(task, { status: 'processing', progress: 99, saving: true })
  // 同一任务 3 秒内只问一次供应商，多个标签页同时轮询也不会放大请求量。
  if (Date.now() - new Date(task.updatedAt).getTime() < AGENT_VIDEO_POLL_GAP_MS) return agentVideoView(task)
  let upstream
  try {
    upstream = await getAgnesVideoTask(task.providerTaskId, task.provider)
  } catch (error) {
    console.warn('[agent-video] 查询进度失败：', error?.message || error)
    task = await updateOwnAiTask(user, task.id, { status: task.status, errorMessage: '', result: { ...task.result, lastPollError: String(error?.message || '').slice(0, 120) } })
    return agentVideoView(task)
  }
  if (upstream.status === 'failed') return agentVideoView(await failAgentVideo(user, task, friendlyVideoError(upstream.error)))
  if (upstream.status !== 'succeeded') {
    task = await updateOwnAiTask(user, task.id, { status: upstream.status, errorMessage: '', result: { ...task.result, progress: upstream.progress, lastPollError: '' } })
    return agentVideoView(task)
  }
  if (!upstream.videoUrl) return agentVideoView(await failAgentVideo(user, task, '视频生成完成了，但没有拿到视频文件，请重新生成一次。'))
  const claimed = await claimOwnAiTaskFlag(user, task.id, 'persistingAt', 180000)
  if (!claimed) return agentVideoView(task, { status: 'processing', progress: 99, saving: true })
  const { persistingAt: _claim, ...rest } = claimed.result
  let trustedOrigin = ''
  try { trustedOrigin = new URL(getProvider(task.provider).baseUrl).origin } catch {}
  try {
    const saved = await persistAgentVideo(upstream.videoUrl, { user, dataDir, trustedOrigin })
    task = await updateOwnAiTask(user, task.id, { status: 'succeeded', errorMessage: '', result: { ...rest, progress: 100, videoUrl: saved, persisted: true } })
    return agentVideoView(task)
  } catch (error) {
    const attempts = Number(rest.persistAttempts || 0) + 1
    console.warn(`[agent-video] 视频转存失败（第 ${attempts} 次）：`, error?.message || error)
    if (attempts < AGENT_VIDEO_PERSIST_ATTEMPTS) {
      task = await updateOwnAiTask(user, task.id, { status: 'processing', errorMessage: '', result: { ...rest, progress: 99, persistAttempts: attempts } })
      return agentVideoView(task, { saving: true })
    }
    if (/^https:\/\//i.test(upstream.videoUrl)) {
      // 一直转存不了：先用供应商的临时地址顶上（一般 24 小时内有效），并标明未转存，前端提示尽快下载。
      task = await updateOwnAiTask(user, task.id, { status: 'succeeded', errorMessage: '', result: { ...rest, progress: 100, videoUrl: upstream.videoUrl, persisted: false, persistAttempts: attempts } })
      return agentVideoView(task)
    }
    return agentVideoView(await failAgentVideo(user, task, '视频生成好了，但没能保存下来，请重新生成一次。'))
  }
}

// —— 生成计费 ——
// 积分系统的设计是「生成入口在服务端内部扣费」：用户账号（student 角色）在服务端登录模式下生成图片 / 视频 / 3D 时，
// 先用当日免费次数，再按单价扣积分；生成失败自动退回。管理员、讲师账号不扣费。
// 前端可先调 /api/credits/preview 显示"这次要花多少"，但扣费只在这里发生，前端绕不过去。
function generationBillable(user) {
  return AUTH_MODE === 'server' && user?.role === 'student' && Boolean(user?.organization?.id)
}

async function refundGeneration(user, billing) {
  if (!billing?.charge) return null
  try {
    const back = await refundAbility(user, { ability: billing.ability, bizType: billing.bizType, bizId: billing.bizId, charge: billing.charge })
    return { credits: back.refunded || 0, freeUses: back.freeRestored || 0 }
  } catch (error) {
    console.warn('[credits] 自动退回失败：', error?.message || error)
    return null
  }
}

async function runWithAbilityCharge(user, { ability, provider = '', model = '', count = 1, bizType }, run) {
  if (!generationBillable(user)) return run(null)
  const bizId = `${bizType}-${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`
  const charge = await chargeAbility(user, { ability, provider: String(provider || ''), model: String(model || ''), count, bizType, bizId })
  const billing = { ability, bizType, bizId, charge }
  try {
    return await run(billing)
  } catch (error) {
    const refund = await refundGeneration(user, billing)
    if (refund && (refund.credits || refund.freeUses)) error.refund = refund
    throw error
  }
}

// 返回给前端的本次消耗（扣了几分 / 用了几次免费、剩余积分），没扣费时为 null。
function billingSummary(billing) {
  if (!billing?.charge) return null
  return { ability: billing.ability, credits: billing.charge.charged || 0, freeUses: billing.charge.freeCovered || 0, balance: billing.charge.balance ?? null }
}

// 异步任务（视频 / 3D）记录里保存的计费信息，失败时据此退回。
function taskBilling(billing) {
  if (!billing?.charge) return null
  const { charge } = billing
  return {
    ability: billing.ability, bizType: billing.bizType, bizId: billing.bizId,
    charge: { charged: charge.charged || 0, freeCovered: charge.freeCovered || 0, paidCount: charge.paidCount || 0, alreadyCharged: Boolean(charge.alreadyCharged) },
  }
}

// 异步任务失败：原子地打退款标记，只有拿到标记的请求去退，多个页面同时轮询也只退一次。
async function settleFailedTask(user, task, taskType) {
  const billing = task.result?.billing
  if (!billing?.charge || task.result?.refundedAt) return task
  const claimed = await claimOwnAiTaskFlag(user, task.id, 'refundedAt')
  if (!claimed) return getOwnAiTask(user, task.id, taskType)
  const refund = await refundGeneration(user, billing)
  return { ...claimed, result: { ...claimed.result, refund } }
}

async function route(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {})

  const url = new URL(req.url, `http://${req.headers.host}`)
  let currentUser = null
  assertTrustedMutationOrigin(req)
  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readJson(req, 16 * 1024, '登录请求内容过大。')
    // 防暴力猜密码 + 暂停登录检查，见 server/risk-routes.js。
    const result = await loginWithProtection(req, body, loginWithPassword)
    return sendJson(res, 200, { ok: true, user: result.user }, { 'Set-Cookie': sessionCookie(result.token) })
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    assertRegisterRate(req)
    const registerBody = await readJson(req, 16 * 1024, '注册请求内容过大。')
    await assertProfileText([registerBody.name])
    const result = await registerWithEnrollment(registerBody)
    return sendJson(res, 201, { ok: true, ...result, message: '账号注册成功，请使用机构代码和新账号登录。' })
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, authMode: AUTH_MODE, databaseConfigured: isDatabaseConfigured() })
  }

  const publicH5PageMatch = url.pathname.match(/^\/api\/public\/h5-reports\/([A-Za-z0-9_-]+)\/pages\/([A-Za-z0-9_-]+)$/)
  if (publicH5PageMatch && req.method === 'GET') {
    const report = readH5Reports().find((item) => item.shareToken === publicH5PageMatch[1] && item.status === 'published')
    const allowed = report?.pageImages?.some((item) => item.id === publicH5PageMatch[2])
    if (!report || !allowed) return sendJson(res, 404, { ok: false, message: '报告页面不存在、未发布或链接无效。' })
    return sendH5ReportPageAsset(res, h5ReportAssetPath(report.id, publicH5PageMatch[2]))
  }

  const publicH5MediaMatch = url.pathname.match(/^\/api\/public\/h5-reports\/([A-Za-z0-9_-]+)\/media\/(\d+)$/)
  if (publicH5MediaMatch && req.method === 'GET') {
    const report = readH5Reports().find(item => item.shareToken === publicH5MediaMatch[1] && item.status === 'published')
    if (!report) return sendJson(res, 404, { ok: false, message: '报告尚未发布或已下架' })
    const source = h5LayoutMedia(report)[Number(publicH5MediaMatch[2])]
    const asset = source?.match(/^\/api\/assets\/([A-Za-z0-9_-]+)$/)
    if (asset) return sendProtectedAsset(res, await getAccessibleAsset({ id: report.ownerUserId, role: 'student', organization: { id: report.organizationId }, campus: { id: report.campusId } }, asset[1], dataDir))
    const visual = source?.match(/^\/api\/h5-visual-template-assets\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+)$/)
    if (visual) return sendH5VisualReferenceAsset(res, visual[1], visual[2], visual[3])
    return sendJson(res, 404, { ok: false, message: '报告素材不存在' })
  }

  const publicH5Match = url.pathname.match(/^\/api\/public\/h5-reports\/([A-Za-z0-9_-]+)$/)
  if (publicH5Match && req.method === 'GET') {
    const report = readH5Reports().find((item) => item.shareToken === publicH5Match[1] && item.status === 'published')
    if (!report) return sendJson(res, 404, { ok: false, message: '报告尚未发布、已下架或分享链接无效。' })
    return sendJson(res, 200, { ok: true, report: publicH5Report(report) })
  }
  if (publicH5Match && req.method === 'POST' && url.pathname.endsWith('/like')) return sendJson(res, 404, { ok: false, message: '分享链接无效。' })
  const publicH5ActionMatch = url.pathname.match(/^\/api\/public\/h5-reports\/([A-Za-z0-9_-]+)\/(like|comments)$/)
  if (publicH5ActionMatch && req.method === 'POST') {
    // 访客点赞 / 留言：同一访客一天一个赞；留言限频并过风控（被拦下的不保存）。
    return handlePublicReportAction(req, res, publicH5ActionMatch[1], publicH5ActionMatch[2], { sendJson, readJson, readReports: readH5Reports, writeReports: writeH5Reports })
  }

  // 登录页在「还没登录」的时候就要显示后台配的 LOGO，所以这条必须放在下面的鉴权拦截之前。
  // 只吐一个图片地址，不含任何账号/机构信息。
  if (req.method === 'GET' && url.pathname === '/api/brand-logo') {
    const brandConfig = readWorkbenchConfig(dataDir)
    return sendJson(res, 200, { ok: true, logoUrl: brandConfig.brand.logoUrl || '' })
  }

  if (AUTH_MODE === 'server' && url.pathname.startsWith('/api/')) {
    // LOGO 图本身也要放行：登录页显示品牌 LOGO 时用户还没登录，卡在这里就永远是内置那个「AI」方块。
    // 只放行 logo-* 前缀，卡片图和背景图仍然要登录才给。
    const isBrandLogoAsset = /^\/api\/workbench-assets\/logo-/.test(url.pathname)
    if (!isBrandLogoAsset) {
      currentUser = await getCurrentUser(req)
      req.authUser = currentUser
      if (!currentUser) {
        return sendJson(res, 401, { ok: false, message: '请先登录。' })
      }
      if (url.pathname.startsWith('/api/admin/')) requireRole(currentUser, ['admin'])
      // 风控：暂停登录的账号立刻踢下线；暂停 AI 的账号、休息时段的创作者账号不能发起 AI 创作和公开发布。
      if (await enforceAccountSafety(req, res, url, currentUser, { sendJson, clearCookie: clearSessionCookie })) return
    }
  }

  // /api/me/safety（护眼提醒、休息时段、封禁状态）和后台「风控管理」的全部接口。
  if (await handleRiskRoutes(req, res, url, currentUser, { sendJson, readJson })) return
  // 后台「异常管理」：服务器意外错误和 AI 调用失败的记录，见 server/ops-store.js。
  if (req.method === 'GET' && url.pathname === '/api/admin/ops/overview') {
    return sendJson(res, 200, { ok: true, ...await opsOverview(currentUser) })
  }
  if (req.method === 'GET' && url.pathname === '/api/admin/ops/errors') {
    return sendJson(res, 200, { ok: true, ...await listAppErrors(currentUser, Object.fromEntries(url.searchParams)) })
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/ops/errors/resolve') {
    return sendJson(res, 200, { ok: true, ...await resolveAppErrors(currentUser, await readJson(req, 64 * 1024, '请求内容过大。')) })
  }

  if (req.method === 'GET' && url.pathname === '/api/prompt-library') {
    return sendJson(res, 200, { ok: true, ...await listPromptLibrary(currentUser, url.searchParams.get('edition') || '') })
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/prompt-library/icon-assets') {
    const body = await readJson(req)
    const image = decodeH5VisualReferenceImage(body.imageData)
    if (!image) return sendJson(res, 400, { ok: false, message: '图标图片格式无效，仅支持 PNG、JPG、WEBP，且文件不能超过8MB。' })
    const organizationId = currentUser?.organization?.id || 'demo-organization'
    const assetId = `icon-${Date.now()}-${randomBytes(6).toString('hex')}`
    const fileName = `${assetId}.${image.extension}`
    const target = promptIconAssetPath(organizationId, fileName)
    mkdirSync(resolve(target, '..'), { recursive: true })
    writeFileSync(target, image.data)
    return sendJson(res, 201, { ok: true, assetUrl: `/api/prompt-library-icons/${encodeURIComponent(organizationId)}/${encodeURIComponent(fileName)}` })
  }

  const promptIconAssetMatch = url.pathname.match(/^\/api\/prompt-library-icons\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+)$/)
  if (promptIconAssetMatch && req.method === 'GET') return sendPromptIconAsset(res, currentUser, promptIconAssetMatch[1], promptIconAssetMatch[2])

  if (req.method === 'GET' && url.pathname === '/api/admin/prompt-library') {
    return sendJson(res, 200, { ok: true, ...await listAdminPromptLibrary(currentUser) })
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/prompt-library/categories') {
    return sendJson(res, 201, { ok: true, category: await savePromptCategory(currentUser, await readJson(req)) })
  }
  const promptCategoryMatch = url.pathname.match(/^\/api\/admin\/prompt-library\/categories\/([A-Za-z0-9_-]+)$/)
  if (promptCategoryMatch && req.method === 'PATCH') {
    return sendJson(res, 200, { ok: true, category: await savePromptCategory(currentUser, await readJson(req), promptCategoryMatch[1]) })
  }
  if (promptCategoryMatch && req.method === 'DELETE') {
    return sendJson(res, 200, await removePromptCategory(currentUser, promptCategoryMatch[1], url.searchParams.get('mode') || 'archive'))
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/prompt-library/prompts') {
    return sendJson(res, 201, { ok: true, prompt: await savePrompt(currentUser, await readJson(req)) })
  }
  const promptMatch = url.pathname.match(/^\/api\/admin\/prompt-library\/prompts\/([A-Za-z0-9_-]+)$/)
  if (promptMatch && req.method === 'PATCH') {
    return sendJson(res, 200, { ok: true, prompt: await savePrompt(currentUser, await readJson(req), promptMatch[1]) })
  }
  if (promptMatch && req.method === 'DELETE') {
    return sendJson(res, 200, await removePrompt(currentUser, promptMatch[1], url.searchParams.get('mode') || 'archive'))
  }

  // ---- 图像风格模板（后台「AI图像功能管理 → 风格模板编辑」 / 学生端绘画页「图像风格」）----
  // 学生端只读：没有启用中的风格时返回空数组，前端自动回退内置风格，不会出现空面板。
  if (req.method === 'GET' && url.pathname === '/api/image-styles') {
    // 面板设置（标题、每排几张、回退方式）一起带上：以前存在后台浏览器里，学生的平板读不到
    const [styles, panel] = await Promise.all([listStudentImageStyles(currentUser), getImageStylePanelSettings(currentUser)])
    return sendJson(res, 200, { ok: true, styles, panelSettings: panel.settings })
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/image-style-covers') {
    const body = await readJson(req)
    const image = decodeH5VisualReferenceImage(body.imageData)
    if (!image) return sendJson(res, 400, { ok: false, message: '封面图格式无效，仅支持 PNG、JPG、WEBP，且文件不能超过8MB。' })
    const organizationId = currentUser?.organization?.id || 'demo-organization'
    let payload = image.data
    let extension = image.extension
    // 学生端风格卡是正方形（1:1），后台预览框同比例。
    // 存储副本按 1:1 居中裁切，保证「后台看到的 = 学生端看到的」，不做二次形变。
    try {
      payload = await sharp(image.data, { limitInputPixels: 40000000 }).rotate().resize({ width: 512, height: 512, fit: 'cover', position: 'centre', withoutEnlargement: false }).webp({ quality: 88 }).toBuffer()
      extension = 'webp'
    } catch (error) {
      console.warn('[image-style] 封面图压缩失败，改为存储原图：', error?.message)
    }
    const fileName = `style-${Date.now()}-${randomBytes(6).toString('hex')}.${extension}`
    const target = imageStyleCoverAssetPath(organizationId, fileName)
    if (!target) return sendJson(res, 400, { ok: false, message: '封面图存储路径无效。' })
    mkdirSync(resolve(target, '..'), { recursive: true })
    writeFileSync(target, payload)
    return sendJson(res, 201, { ok: true, assetUrl: `/api/image-style-covers/${encodeURIComponent(organizationId)}/${encodeURIComponent(fileName)}` })
  }
  const imageStyleCoverAssetMatch = url.pathname.match(/^\/api\/image-style-covers\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+)$/)
  if (imageStyleCoverAssetMatch && req.method === 'GET') return sendImageStyleCoverAsset(res, currentUser, imageStyleCoverAssetMatch[1], imageStyleCoverAssetMatch[2])

  // ---- 学生工作台外观（后台「工作台管理」/ 学生端工作台首屏）----
  // 读接口给学生端用：没配过就返回内置默认值，前端不用判断「有没有配置」。
  if (req.method === 'GET' && url.pathname === '/api/workbench-config') {
    return sendJson(res, 200, { ok: true, config: readWorkbenchConfig(dataDir) })
  }
  if (req.method === 'GET' && url.pathname === '/api/admin/workbench-config') {
    return sendJson(res, 200, { ok: true, config: readWorkbenchConfig(dataDir), cards: WORKBENCH_CARD_IDS, positions: WORKBENCH_IMAGE_POSITIONS })
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/workbench-config') {
    const body = await readJson(req)
    const config = writeWorkbenchConfig(dataDir, body.config || body)
    return sendJson(res, 200, { ok: true, config })
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/workbench-config/reset') {
    // 恢复默认 = 删掉配置文件内容，不动已上传的素材文件（可能还有别处引用，删了没法找回）。
    return sendJson(res, 200, { ok: true, config: writeWorkbenchConfig(dataDir, defaultWorkbenchConfig()) })
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/workbench-assets') {
    // 视频 base64 会比原文件大 1/3，20MB 的原片约 27MB JSON；给 32MB 上限，
    // 不设上限的话一个超大文件能把服务端内存直接撑爆。
    const body = await readJson(req, 32 * 1024 * 1024)
    const kind = ['card', 'bg', 'logo'].includes(String(body.kind || '')) ? String(body.kind) : 'card'
    if (kind === 'bg' && String(body.mediaType || '') === 'video') {
      // 视频走 base64 直传，不压缩（服务端没有转码器）。限 20MB，超了让学生端弱网加载不动。
      const raw = String(body.dataBase64 || '').replace(/^data:[^,]+,/, '')
      if (!raw) return sendJson(res, 400, { ok: false, message: '缺少视频文件内容。' })
      const payload = Buffer.from(raw, 'base64')
      if (!payload.length) return sendJson(res, 400, { ok: false, message: '视频文件内容无效。' })
      if (payload.length > 20 * 1024 * 1024) return sendJson(res, 413, { ok: false, message: '视频不能超过 20MB，请先压缩或缩短时长。' })
      const fileName = `bg-${Date.now()}-${randomBytes(6).toString('hex')}.mp4`
      const target = workbenchAssetPath(dataDir, fileName)
      if (!target) return sendJson(res, 400, { ok: false, message: '视频存储路径无效。' })
      mkdirSync(resolve(target, '..'), { recursive: true })
      writeFileSync(target, payload)
      return sendJson(res, 201, { ok: true, assetUrl: `/api/workbench-assets/${encodeURIComponent(fileName)}`, kind, mediaType: 'video', size: payload.length })
    }
    const image = decodeH5VisualReferenceImage(body.imageData)
    if (!image) return sendJson(res, 400, { ok: false, message: '图片格式无效，仅支持 PNG、JPG、WEBP，且文件不能超过8MB。' })
    let payload = image.data
    let extension = image.extension
    // 卡片是竖版（3:4 左右），背景是横版全屏，LOGO 是方图 —— 三种按各自比例压一份，
    // 保证「后台看到的 = 学生端看到的」，不让学生端再二次裁切。
    const resize = kind === 'bg'
      ? { width: 1920, height: 1080, fit: 'cover', position: 'centre' }
      : kind === 'logo'
        ? { width: 256, height: 256, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }
        : { width: 720, height: 960, fit: 'cover', position: 'centre' }
    try {
      payload = await sharp(image.data, { limitInputPixels: 40000000 }).rotate().resize({ ...resize, withoutEnlargement: false }).webp({ quality: 88 }).toBuffer()
      extension = 'webp'
    } catch (error) {
      console.warn('[workbench] 图片压缩失败，改为存储原图：', error?.message)
    }
    const fileName = `${kind}-${Date.now()}-${randomBytes(6).toString('hex')}.${extension}`
    const target = workbenchAssetPath(dataDir, fileName)
    if (!target) return sendJson(res, 400, { ok: false, message: '图片存储路径无效。' })
    mkdirSync(resolve(target, '..'), { recursive: true })
    writeFileSync(target, payload)
    return sendJson(res, 201, { ok: true, assetUrl: `/api/workbench-assets/${encodeURIComponent(fileName)}`, kind, mediaType: 'image' })
  }
  const workbenchAssetMatch = url.pathname.match(/^\/api\/workbench-assets\/([A-Za-z0-9_.-]+)$/)
  if (workbenchAssetMatch && req.method === 'GET') return sendWorkbenchAsset(req, res, currentUser, workbenchAssetMatch[1])

  if (req.method === 'DELETE' && url.pathname === '/api/admin/workbench-assets') {
    // 后台换图后清掉旧文件。只允许删「配置里已经不再引用」的素材：
    // 万一前端传错名字，也不会把学生端正显示着的那张图删掉。
    const body = await readJson(req, 64 * 1024)
    const fileName = String(body.fileName || '')
    const target = workbenchAssetPath(dataDir, fileName)
    if (!target) return sendJson(res, 400, { ok: false, message: '素材文件名无效。' })
    const config = readWorkbenchConfig(dataDir)
    const inUse = [
      config.brand?.logoUrl,
      config.background?.imageUrl,
      config.background?.videoUrl,
      ...(config.cards || []).map((card) => card.imageUrl),
    ].some((assetUrl) => String(assetUrl || '').includes(`/api/workbench-assets/${encodeURIComponent(fileName)}`))
    if (inUse) return sendJson(res, 409, { ok: false, message: '这张图还在使用中，先换掉再删除。' })
    try {
      unlinkSync(target)
      return sendJson(res, 200, { ok: true })
    } catch (error) {
      if (error?.code === 'ENOENT') return sendJson(res, 200, { ok: true })
      return sendJson(res, 500, { ok: false, message: '删除失败，请稍后重试。' })
    }
  }

  // 风格面板设置：必须排在 :id 路由之前（「settings」也符合风格 ID 的格式）
  if (req.method === 'GET' && url.pathname === '/api/admin/image-styles/settings') {
    if (currentUser?.role !== 'admin') return sendJson(res, 403, { ok: false, message: '仅管理员可以管理图像风格' })
    return sendJson(res, 200, { ok: true, ...(await getImageStylePanelSettings(currentUser)) })
  }
  if (req.method === 'PUT' && url.pathname === '/api/admin/image-styles/settings') {
    return sendJson(res, 200, { ok: true, ...(await saveImageStylePanelSettings(currentUser, await readJson(req))) })
  }
  if (req.method === 'GET' && url.pathname === '/api/admin/image-styles') {
    return sendJson(res, 200, { ok: true, styles: await listAdminImageStyles(currentUser) })
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/image-styles') {
    return sendJson(res, 201, { ok: true, style: await saveImageStyle(currentUser, await readJson(req)) })
  }
  // 排序必须排在 :id 之前，否则「reorder」会被当成一个风格 ID。
  if (req.method === 'POST' && url.pathname === '/api/admin/image-styles/reorder') {
    const body = await readJson(req)
    return sendJson(res, 200, await reorderImageStyles(currentUser, body.ids))
  }
  // 批量处理同理，也要排在 :id 之前。
  if (req.method === 'POST' && url.pathname === '/api/admin/image-styles/batch') {
    return sendJson(res, 200, await batchUpdateImageStyles(currentUser, await readJson(req)))
  }
  const imageStyleMatch = url.pathname.match(/^\/api\/admin\/image-styles\/([A-Za-z0-9_-]+)$/)
  if (imageStyleMatch && req.method === 'PATCH') {
    return sendJson(res, 200, { ok: true, style: await saveImageStyle(currentUser, await readJson(req), imageStyleMatch[1]) })
  }
  if (imageStyleMatch && req.method === 'DELETE') {
    return sendJson(res, 200, await removeImageStyle(currentUser, imageStyleMatch[1], url.searchParams.get('mode') || 'archive'))
  }

  // 风格分类（学生端叫「分组」标签）：分类可以单独建、改名、删；删分类时风格挪到「推荐」，不删风格。
  if (req.method === 'GET' && url.pathname === '/api/admin/image-style-groups') {
    return sendJson(res, 200, { ok: true, groups: await listImageStyleGroups(currentUser) })
  }
  if (req.method === 'POST' && url.pathname === '/api/admin/image-style-groups') {
    return sendJson(res, 201, { ok: true, group: await createImageStyleGroup(currentUser, await readJson(req)) })
  }
  const imageStyleGroupMatch = url.pathname.match(/^\/api\/admin\/image-style-groups\/([A-Za-z0-9_-]+)$/)
  if (imageStyleGroupMatch && req.method === 'PATCH') {
    return sendJson(res, 200, { ok: true, group: await renameImageStyleGroup(currentUser, imageStyleGroupMatch[1], await readJson(req)) })
  }
  if (imageStyleGroupMatch && req.method === 'DELETE') {
    return sendJson(res, 200, await removeImageStyleGroup(currentUser, imageStyleGroupMatch[1]))
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    return sendJson(res, 200, { ok: true, user: currentUser })
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    if (AUTH_MODE === 'server') await logoutRequest(req, currentUser)
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() })
  }

  // ===== 课程中心：课程库服务端化 =====
  // 课程本体落 organization_documents（document_type='course'），授权落 course_assignments。
  // 之前课程只存在浏览器 localStorage，换设备/换浏览器就全没了，上架部署必须落库。
  // demo 模式（没连数据库）不走这里，前端继续用 localStorage，离线演示不受影响。
  // ===== 课程素材：视频 / 课件 / 封面 =====
  // 老的 /api/course-video/upload 和 /api/course-video-assets/* 是无鉴权、无归属的裸接口，
  // 上架后任意站点都能盗链、任意人拿到 URL 就能刷。这里换成受保护的一套：
  //   POST   /api/course-assets          上传（只有老师/管理员），返回 assetId + url
  //   GET    /api/course-assets/:id      读取（按课程授权判定，支持 Range 拖动进度条）
  //   DELETE /api/course-assets/:id      删除（本人或管理员）
  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/course-assets') {
    requireRole(currentUser, ['teacher', 'admin'])
    const assetKind = String(url.searchParams.get('kind') || '').trim()
    const originalName = String(url.searchParams.get('name') || '').trim()
    const contentType = String(req.headers['content-type'] || '').toLowerCase()

    // 请求体是裸二进制流（前端直接 File 当 body），Content-Type 就是文件类型，
    // query 里带 kind（cover/video/ppt/pdf）和 name（原始文件名）。
    // 刻意不做 multipart、也不做 base64：一个 500MB 视频转 base64 要占 670MB+ 内存，
    // 两三个学生同时传就能把服务端顶爆。边收边写盘，内存只占一个 chunk。
    const asset = await persistCourseAssetFromStream(currentUser, {
      stream: req,
      mimeType: contentType || 'application/octet-stream',
      originalName,
      assetKind,
      contentLength: Number(req.headers['content-length'] || 0),
    }, dataDir)
    return sendJson(res, 201, { ok: true, asset })
  }

  const courseAssetMatch = url.pathname.match(/^\/api\/course-assets\/([A-Za-z0-9_-]+)$/)
  if (AUTH_MODE === 'server' && courseAssetMatch && req.method === 'GET') {
    const record = await getCourseAssetRecord(currentUser, courseAssetMatch[1])
    await assertCanReadCourseAsset(currentUser, record)
    return streamCourseAsset(req, res, record)
  }
  if (AUTH_MODE === 'server' && courseAssetMatch && req.method === 'DELETE') {
    await deleteCourseAsset(currentUser, courseAssetMatch[1])
    return sendJson(res, 200, { ok: true })
  }

  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/courses') {
    return sendJson(res, 200, { ok: true, courses: await listCourses(currentUser) })
  }

  // 讲师端：我能不能看课程库 / 用课 / 上传 / 发放（账号开关 + 所在权限组）
  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/me/course-access') {
    requireRole(currentUser, ['teacher', 'admin'])
    return sendJson(res, 200, { ok: true, ...(await getMyCourseAccess(currentUser)) })
  }

  // 讲师端「发放课程」面板：本机构真实的班级、学员名单（以前是写死的演示名字，服务端模式下发不到人）
  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/me/course-distribution-options') {
    requireRole(currentUser, ['teacher', 'admin'])
    return sendJson(res, 200, { ok: true, ...(await listDistributionOptions(currentUser)) })
  }

  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/courses') {
    requireRole(currentUser, ['teacher', 'admin'])
    const body = await readJson(req, 4 * 1024 * 1024)
    const course = await createCourse(currentUser, body)
    // 老字段 authorizedClasses / authorizedStudents 是纯名字，顺手落成授权记录。
    // 名字匹配只看唯一命中，重名一律不授权——宁可漏，也不敢把课发给错的班。
    await syncAssignmentsFromCourse(currentUser, course.id, course)
    return sendJson(res, 201, { ok: true, course: await getCourse(currentUser, course.id) })
  }

  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/courses/bulk-status') {
    requireRole(currentUser, ['teacher', 'admin'])
    const body = await readJson(req)
    const updated = await bulkUpdateCourseStatus(currentUser, body.ids || body.courseIds, body.status)
    return sendJson(res, 200, { ok: true, updated })
  }

  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/courses/bulk-delete') {
    requireRole(currentUser, ['teacher', 'admin'])
    const body = await readJson(req)
    const removed = await deleteCourses(currentUser, body.ids || body.courseIds)
    return sendJson(res, 200, { ok: true, removed })
  }

  const courseMatch = url.pathname.match(/^\/api\/courses\/([A-Za-z0-9_-]+)$/)
  if (AUTH_MODE === 'server' && courseMatch && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, course: await getCourse(currentUser, courseMatch[1]) })
  }

  if (AUTH_MODE === 'server' && courseMatch && req.method === 'PATCH') {
    requireRole(currentUser, ['teacher', 'admin'])
    const body = await readJson(req, 4 * 1024 * 1024)
    const course = await updateCourse(currentUser, courseMatch[1], body)
    if (COURSE_ASSIGNMENT_FIELDS.some((field) => body[field] !== undefined)) {
      await syncAssignmentsFromCourse(currentUser, course.id, course)
    }
    return sendJson(res, 200, { ok: true, course })
  }

  if (AUTH_MODE === 'server' && courseMatch && req.method === 'DELETE') {
    requireRole(currentUser, ['teacher', 'admin'])
    await deleteCourse(currentUser, courseMatch[1])
    return sendJson(res, 200, { ok: true })
  }

  const courseAssignmentsMatch = url.pathname.match(/^\/api\/courses\/([A-Za-z0-9_-]+)\/assignments$/)
  if (AUTH_MODE === 'server' && courseAssignmentsMatch && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, assignments: await listCourseAssignments(currentUser, courseAssignmentsMatch[1]) })
  }
  if (AUTH_MODE === 'server' && courseAssignmentsMatch && req.method === 'PUT') {
    requireRole(currentUser, ['teacher', 'admin'])
    return sendJson(res, 200, {
      ok: true,
      assignments: await replaceCourseAssignments(currentUser, courseAssignmentsMatch[1], await readJson(req)),
    })
  }

  // 课程分类：内置 7 个由服务端首次访问补种，机构可再增删（增删只给管理员）。
  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/course-categories') {
    return sendJson(res, 200, { ok: true, categories: await listCourseCategories(currentUser) })
  }
  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/admin/course-categories') {
    return sendJson(res, 201, { ok: true, categories: await saveCourseCategory(currentUser, await readJson(req)) })
  }
  const adminCourseCategoryMatch = url.pathname.match(/^\/api\/admin\/course-categories\/([A-Za-z0-9_-]+)$/)
  if (AUTH_MODE === 'server' && adminCourseCategoryMatch && req.method === 'PATCH') {
    return sendJson(res, 200, {
      ok: true,
      categories: await saveCourseCategory(currentUser, { ...(await readJson(req)), id: adminCourseCategoryMatch[1] }),
    })
  }
  if (AUTH_MODE === 'server' && adminCourseCategoryMatch && req.method === 'DELETE') {
    return sendJson(res, 200, { ok: true, categories: await deleteCourseCategory(currentUser, adminCourseCategoryMatch[1]) })
  }

  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/me/documents') {
    return sendJson(res, 200, { ok: true, documents: await listOwnDocuments(currentUser, url.searchParams.get('type')) })
  }

  const documentMatch = url.pathname.match(/^\/api\/me\/documents\/([A-Za-z0-9_-]+)$/)
  if (AUTH_MODE === 'server' && documentMatch && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, document: await getOwnDocument(currentUser, documentMatch[1]) })
  }

  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/me/documents') {
    return sendJson(res, 201, { ok: true, document: await createOwnDocument(currentUser, await readJson(req)) })
  }

  if (AUTH_MODE === 'server' && documentMatch && req.method === 'PATCH') {
    return sendJson(res, 200, { ok: true, document: await updateOwnDocument(currentUser, documentMatch[1], await readJson(req)) })
  }

  if (AUTH_MODE === 'server' && documentMatch && req.method === 'DELETE') {
    await deleteOwnDocument(currentUser, documentMatch[1])
    return sendJson(res, 200, { ok: true })
  }

  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/me/assets') {
    return sendJson(res, 201, { ok: true, asset: await createOwnAsset(currentUser, await readJson(req), dataDir) })
  }

  // 把一张远程图片（例如 AI 出图结果）转存成学生自己的素材。
  // 目的是给前端一个「站内同源地址」：跨域图片画进 canvas 会把画布标记为已污染，
  // 之后 toDataURL/导出就会直接抛 SecurityError。
  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/me/assets/from-url') {
    const payload = await readJson(req)
    const source = String(payload.url || '').trim()
    if (!source) throw Object.assign(new Error('缺少图片地址。'), { statusCode: 400 })
    const buffer = await readRemoteArtwork(source)
    const asset = await createOwnAssetFromBuffer(currentUser, {
      buffer,
      mimeType: sniffImageMime(buffer),
      originalName: String(payload.originalName || 'ai-artwork').slice(0, 120),
      kind: String(payload.kind || 'ai-artwork').slice(0, 60),
    }, dataDir)
    return sendJson(res, 201, { ok: true, asset, imageUrl: `/api/assets/${encodeURIComponent(asset.id)}` })
  }

  const assetMatch = url.pathname.match(/^\/api\/assets\/([A-Za-z0-9_-]+)$/)
  if (AUTH_MODE === 'server' && assetMatch && req.method === 'GET') {
    return sendProtectedAsset(res, await getAccessibleAsset(currentUser, assetMatch[1], dataDir))
  }

  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/students') {
    return sendJson(res, 200, { ok: true, students: await listAccessibleStudents(currentUser) })
  }

  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/me/gallery-submissions') {
    const body = await readJson(req)
    return sendJson(res, 201, { ok: true, submission: await submitOwnGalleryDocument(currentUser, body.documentId, body) })
  }

  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/me/gallery-submissions') {
    return sendJson(res, 200, { ok: true, works: await gallery.listOwnGallerySubmissions(currentUser) })
  }
  if (AUTH_MODE === 'server' && url.pathname === '/api/me/gallery-consent') {
    if (req.method === 'GET') return sendJson(res, 200, { consent: await gallery.getGalleryConsent(currentUser) })
    if (req.method === 'PUT') return sendJson(res, 200, { consent: await gallery.setGalleryConsent(currentUser, currentUser.id, await readJson(req)) })
  }
  const galleryWithdraw = url.pathname.match(/^\/api\/me\/gallery-submissions\/([A-Za-z0-9_-]+)\/withdraw$/)
  if (AUTH_MODE === 'server' && galleryWithdraw && req.method === 'POST') {
    return sendJson(res, 200, await gallery.withdrawGallerySubmission(currentUser, galleryWithdraw[1]))
  }
  const galleryImageMatch = url.pathname.match(/^\/api\/gallery\/submissions\/([A-Za-z0-9_-]+)\/image$/)
  if (AUTH_MODE === 'server' && galleryImageMatch && req.method === 'GET') {
    const buffer = await gallery.galleryImage(currentUser, galleryImageMatch[1], url.searchParams.get('review') === '1')
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': buffer.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    return res.end(buffer)
  }
  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/admin/gallery-meta') {
    const [models, usage, students, trialWorks, history] = await Promise.all([
      gallery.galleryModelOptions(currentUser), gallery.galleryUsage(currentUser), gallery.listConsentStudents(currentUser), gallery.galleryTrialWorks(currentUser), gallery.galleryHistory(currentUser),
    ])
    return sendJson(res, 200, { models, usage, students, trialWorks, history })
  }
  const galleryConsentMatch = url.pathname.match(/^\/api\/admin\/gallery-consents\/([A-Za-z0-9_-]+)$/)
  if (AUTH_MODE === 'server' && galleryConsentMatch && req.method === 'PUT') {
    return sendJson(res, 200, { consent: await gallery.setGalleryConsent(currentUser, galleryConsentMatch[1], await readJson(req)) })
  }
  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/admin/gallery-trials') {
    return sendJson(res, 202, { job: await gallery.createGalleryTrial(currentUser, await readJson(req)) })
  }
  const galleryJobMatch = url.pathname.match(/^\/api\/admin\/gallery-jobs\/([A-Za-z0-9_-]+)$/)
  if (AUTH_MODE === 'server' && galleryJobMatch && req.method === 'GET') {
    return sendJson(res, 200, { job: await gallery.galleryJobResult(currentUser, galleryJobMatch[1]) })
  }

  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/gallery/public') {
    const params = Object.fromEntries(url.searchParams)
    // 分类按机构取，不能由前端指定机构 id
    return sendJson(res, 200, { ok: true, ...await listPublicGalleryWorks({ ...params, organizationId: currentUser.organization.id }) })
  }

  // ===== 作品广场分类（后台维护） =====
  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/admin/gallery-categories') {
    return sendJson(res, 200, { ok: true, categories: await gallery.listGalleryCategories(currentUser) })
  }
  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/admin/gallery-categories') {
    return sendJson(res, 201, { ok: true, category: await gallery.createGalleryCategory(currentUser, await readJson(req)) })
  }
  if (AUTH_MODE === 'server' && req.method === 'PUT' && url.pathname === '/api/admin/gallery-categories/order') {
    return sendJson(res, 200, { ok: true, categories: await gallery.reorderGalleryCategories(currentUser, await readJson(req)) })
  }
  const galleryCategoryMatch = url.pathname.match(/^\/api\/admin\/gallery-categories\/([A-Za-z0-9_-]+)$/)
  if (AUTH_MODE === 'server' && galleryCategoryMatch && req.method === 'PATCH') {
    return sendJson(res, 200, { ok: true, category: await gallery.updateGalleryCategory(currentUser, galleryCategoryMatch[1], await readJson(req)) })
  }
  if (AUTH_MODE === 'server' && galleryCategoryMatch && req.method === 'DELETE') {
    return sendJson(res, 200, { ok: true, ...await gallery.deleteGalleryCategory(currentUser, galleryCategoryMatch[1]) })
  }
  const galleryAssignMatch = url.pathname.match(/^\/api\/admin\/gallery-submissions\/([A-Za-z0-9_-]+)\/category$/)
  if (AUTH_MODE === 'server' && galleryAssignMatch && req.method === 'PUT') {
    return sendJson(res, 200, { ok: true, ...await gallery.assignGalleryCategory(currentUser, galleryAssignMatch[1], await readJson(req)) })
  }

  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/admin/gallery-submissions') {
    return sendJson(res, 200, { ok: true, ...await listManagedGallerySubmissions(currentUser, Object.fromEntries(url.searchParams)) })
  }

  const galleryReviewMatch = url.pathname.match(/^\/api\/admin\/gallery-submissions\/([A-Za-z0-9_-]+)$/)
  const galleryRetryMatch = url.pathname.match(/^\/api\/admin\/gallery-submissions\/([A-Za-z0-9_-]+)\/retry$/)
  if (AUTH_MODE === 'server' && galleryRetryMatch && req.method === 'POST') {
    return sendJson(res, 202, { job: await gallery.retryGallerySubmission(currentUser, galleryRetryMatch[1], await readJson(req)) })
  }
  if (AUTH_MODE === 'server' && galleryReviewMatch && req.method === 'PATCH') {
    const body = await readJson(req)
    return sendJson(res, 200, { ok: true, submission: await reviewGallerySubmission(currentUser, galleryReviewMatch[1], body.action, body.reason, body.expectedUpdatedAt) })
  }

  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/admin/gallery-audit-settings') {
    return sendJson(res, 200, { ok: true, settings: await getAuditSettings(currentUser.organization.id) })
  }
  if (AUTH_MODE === 'server' && req.method === 'PUT' && url.pathname === '/api/admin/gallery-audit-settings') {
    const body = await readJson(req)
    return sendJson(res, 200, { ok: true, settings: await saveAuditSettings(currentUser, body) })
  }

  const studentDocumentsMatch = url.pathname.match(/^\/api\/students\/([A-Za-z0-9_-]+)\/documents$/)
  if (AUTH_MODE === 'server' && studentDocumentsMatch && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, documents: await listStudentDocuments(currentUser, studentDocumentsMatch[1], url.searchParams.get('type')) })
  }

  const studentDocumentMatch = url.pathname.match(/^\/api\/students\/([A-Za-z0-9_-]+)\/documents\/([A-Za-z0-9_-]+)$/)
  if (AUTH_MODE === 'server' && studentDocumentMatch && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, document: await getStudentDocument(currentUser, studentDocumentMatch[1], studentDocumentMatch[2]) })
  }

  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/admin/account-options') {
    return sendJson(res, 200, { ok: true, ...(await listAccountOptions(currentUser)) })
  }
  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/admin/organization-setup') {
    return sendJson(res, 200, { ok: true, ...(await listOrganizationSetup(currentUser)) })
  }
  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/admin/campuses') {
    return sendJson(res, 201, { ok: true, campus: await saveCampus(currentUser, await readJson(req)) })
  }
  const campusManageMatch = url.pathname.match(/^\/api\/admin\/campuses\/([^/]+)$/)
  if (AUTH_MODE === 'server' && campusManageMatch && req.method === 'PATCH') {
    return sendJson(res, 200, { ok: true, campus: await saveCampus(currentUser, await readJson(req), decodeURIComponent(campusManageMatch[1])) })
  }
  if (AUTH_MODE === 'server' && campusManageMatch && req.method === 'DELETE') {
    return sendJson(res, 200, { ok: true, campus: await disableCampus(currentUser, decodeURIComponent(campusManageMatch[1])) })
  }
  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/admin/classes') {
    return sendJson(res, 201, { ok: true, schoolClass: await saveClass(currentUser, await readJson(req)) })
  }
  const classManageMatch = url.pathname.match(/^\/api\/admin\/classes\/([^/]+)$/)
  if (AUTH_MODE === 'server' && classManageMatch && req.method === 'PATCH') {
    return sendJson(res, 200, { ok: true, schoolClass: await saveClass(currentUser, await readJson(req), decodeURIComponent(classManageMatch[1])) })
  }
  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/admin/enrollment-codes') {
    return sendJson(res, 201, { ok: true, enrollmentCode: await createEnrollmentCode(currentUser, await readJson(req)) })
  }

  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/admin/accounts') {
    const accounts = await listAccounts(currentUser, {
      keyword: url.searchParams.get('keyword'), role: url.searchParams.get('role'), campusId: url.searchParams.get('campusId'),
      status: url.searchParams.get('status') === 'enabled' ? 'active' : url.searchParams.get('status'),
    })
    // 附带当前生效的封禁（风控管理里设置的），账号列表能直接看到"已暂停"。
    return sendJson(res, 200, { ok: true, accounts: await withAccountBans(currentUser, accounts) })
  }

  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/admin/accounts') {
    return sendJson(res, 201, { ok: true, ...(await createAccount(currentUser, await readJson(req))) })
  }

  const adminAccountMatch = url.pathname.match(/^\/api\/admin\/accounts\/([A-Za-z0-9_-]+)$/)
  if (AUTH_MODE === 'server' && adminAccountMatch && req.method === 'PATCH') {
    await updateAccount(currentUser, adminAccountMatch[1], await readJson(req))
    return sendJson(res, 200, { ok: true })
  }
  if (AUTH_MODE === 'server' && adminAccountMatch && req.method === 'DELETE') {
    await disableAccount(currentUser, adminAccountMatch[1])
    return sendJson(res, 200, { ok: true })
  }

  const accountResetMatch = url.pathname.match(/^\/api\/admin\/accounts\/([A-Za-z0-9_-]+)\/reset-password$/)
  if (AUTH_MODE === 'server' && accountResetMatch && req.method === 'POST') {
    const body = await readJson(req)
    await resetAccountPassword(currentUser, accountResetMatch[1], body.password)
    return sendJson(res, 200, { ok: true })
  }
  const accountSessionsMatch = url.pathname.match(/^\/api\/admin\/accounts\/([A-Za-z0-9_-]+)\/sessions$/)
  if (AUTH_MODE === 'server' && accountSessionsMatch && req.method === 'DELETE') {
    await revokeAccountSessions(currentUser, accountSessionsMatch[1])
    return sendJson(res, 200, { ok: true })
  }
  const accountClassesMatch = url.pathname.match(/^\/api\/admin\/accounts\/([A-Za-z0-9_-]+)\/teacher-classes$/)
  if (AUTH_MODE === 'server' && accountClassesMatch && req.method === 'PUT') {
    await setAccountClasses(currentUser, accountClassesMatch[1], (await readJson(req)).classIds)
    return sendJson(res, 200, { ok: true })
  }
  const accountScopesMatch = url.pathname.match(/^\/api\/admin\/accounts\/([A-Za-z0-9_-]+)\/admin-scopes$/)
  if (AUTH_MODE === 'server' && accountScopesMatch && req.method === 'PUT') {
    await setAdminScopes(currentUser, accountScopesMatch[1], (await readJson(req)).scopes)
    return sendJson(res, 200, { ok: true })
  }

  // ===== 积分体系（credit）=====
  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/credits/summary') {
    return sendJson(res, 200, { ok: true, ...(await getCreditSummary(currentUser)) })
  }
  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/credits/ledger') {
    return sendJson(res, 200, { ok: true, ...(await listCreditLedger(currentUser, {
      limit: url.searchParams.get('limit'), before: url.searchParams.get('before') || '',
    })) })
  }
  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/credits/redeem') {
    const body = await readJson(req)
    return sendJson(res, 200, { ok: true, ...(await redeemCreditCode(currentUser, body.code)) })
  }

  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/admin/credits/overview') {
    return sendJson(res, 200, { ok: true, ...(await getCreditOverview(currentUser, {
      keyword: url.searchParams.get('keyword') || '', role: url.searchParams.get('role') || '',
    })) })
  }
  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/admin/credits/adjust') {
    const body = await readJson(req)
    return sendJson(res, 200, { ok: true, ...(await adminAdjustCredits(currentUser, body.userId, { delta: body.delta, reason: body.reason })) })
  }
  const creditUserMatch = url.pathname.match(/^\/api\/admin\/credits\/([A-Za-z0-9_-]+)$/)
  if (AUTH_MODE === 'server' && creditUserMatch && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, ...(await getUserCredit(currentUser, creditUserMatch[1])) })
  }

  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/admin/credit-codes') {
    return sendJson(res, 201, { ok: true, ...(await generateCreditCodes(currentUser, await readJson(req))) })
  }
  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/admin/credit-codes/export') {
    const { filename, csv } = await exportCreditCodes(currentUser, {
      type: url.searchParams.get('type') || 'codes',
      from: url.searchParams.get('from') || '', to: url.searchParams.get('to') || '',
    })
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    })
    return res.end(csv)
  }
  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/admin/credit-codes') {
    return sendJson(res, 200, { ok: true, ...(await listCreditCodes(currentUser, {
      status: url.searchParams.get('status') || '', from: url.searchParams.get('from') || '',
      to: url.searchParams.get('to') || '', limit: url.searchParams.get('limit'),
    })) })
  }
  const creditCodeConfirmMatch = url.pathname.match(/^\/api\/admin\/credit-codes\/([A-Za-z0-9_-]+)\/confirm$/)
  if (AUTH_MODE === 'server' && creditCodeConfirmMatch && req.method === 'POST') {
    return sendJson(res, 200, { ok: true, ...(await confirmCodePayment(currentUser, creditCodeConfirmMatch[1])) })
  }
  const creditCodeVoidMatch = url.pathname.match(/^\/api\/admin\/credit-codes\/([A-Za-z0-9_-]+)\/void$/)
  if (AUTH_MODE === 'server' && creditCodeVoidMatch && req.method === 'POST') {
    const body = await readJson(req).catch(() => ({}))
    return sendJson(res, 200, { ok: true, ...(await voidCreditCode(currentUser, creditCodeVoidMatch[1], { clawBack: Boolean(body.clawBack) })) })
  }

  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/admin/credit-prices') {
    return sendJson(res, 200, { ok: true, ...(await listCreditPrices(currentUser)) })
  }
  if (AUTH_MODE === 'server' && req.method === 'PUT' && url.pathname === '/api/admin/credit-prices') {
    const body = await readJson(req)
    // 兼容两种入参：老写法 { prices: [...] }，新写法 { abilities, modelPrices, messages }
    return sendJson(res, 200, { ok: true, ...(await saveCreditPrices(currentUser, body)) })
  }
  // 提示文案单独存，面板上的「保存文案」只动这块，不碰价目。
  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/admin/credit-messages') {
    return sendJson(res, 200, {
      ok: true,
      messages: (await getCreditMessages(currentUser)).messages,
      defaults: CREDIT_MESSAGE_DEFAULTS,
    })
  }
  if (AUTH_MODE === 'server' && req.method === 'PUT' && url.pathname === '/api/admin/credit-messages') {
    const body = await readJson(req)
    return sendJson(res, 200, { ok: true, ...(await saveCreditMessages(currentUser, body.messages || body)) })
  }
  // 生成前预检：这次要花多少积分、白送还剩几次。只读，不扣钱不占额度。
  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/credits/preview') {
    const body = await readJson(req)
    return sendJson(res, 200, {
      ok: true,
      ...(await previewCharge(currentUser, {
        ability: body.ability, provider: body.provider, model: body.model, count: body.count,
      })),
    })
  }
  // 手动扣费（给前端「先扣后跑」的场景用；正常生成入口在服务端内部直接调 chargeAbility）
  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/credits/charge') {
    const body = await readJson(req)
    return sendJson(res, 200, {
      ok: true,
      ...(await chargeAbility(currentUser, {
        ability: body.ability, provider: body.provider, model: body.model,
        count: body.count, bizType: body.bizType || 'manual', bizId: body.bizId || `manual-${Date.now()}`,
      })),
    })
  }
  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/credits/refund') {
    const body = await readJson(req)
    return sendJson(res, 200, {
      ok: true,
      ...(await refundCredits(currentUser, {
        bizType: body.bizType, bizId: body.bizId, reason: body.reason,
      })),
    })
  }
  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/credits/abilities') {
    return sendJson(res, 200, { ok: true, abilities: CREDIT_ABILITIES })
  }

  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/admin/permission-groups') {
    return sendJson(res, 200, { ok: true, groups: await listPermissionGroups(currentUser) })
  }
  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/admin/permission-groups') {
    return sendJson(res, 201, { ok: true, ...(await savePermissionGroup(currentUser, await readJson(req))) })
  }
  const permissionGroupMatch = url.pathname.match(/^\/api\/admin\/permission-groups\/([A-Za-z0-9_-]+)$/)
  if (AUTH_MODE === 'server' && permissionGroupMatch && req.method === 'PATCH') {
    return sendJson(res, 200, { ok: true, ...(await savePermissionGroup(currentUser, await readJson(req), permissionGroupMatch[1])) })
  }
  if (AUTH_MODE === 'server' && permissionGroupMatch && req.method === 'DELETE') {
    await deletePermissionGroup(currentUser, permissionGroupMatch[1])
    return sendJson(res, 200, { ok: true })
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/course-ppt-assets/')) {
    return sendCoursePptAsset(req, res, url)
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/course-video-assets/')) {
    return sendCourseVideoAsset(req, res, url)
  }

  if (req.method === 'GET' && url.pathname === '/api/ai/model3d/assets') {
    if (AUTH_MODE === 'server') {
      const error = new Error('正式模式不接受任意远程 3D 文件地址；请使用受保护的资产 ID。')
      error.statusCode = 404
      throw error
    }
    return proxyHunyuan3dAsset(req, res, url)
  }

  // 旧的课程素材接口：保留是为了兼容「后台还没有课程库」的过渡期和本地演示，
  // 但 server 模式下必须收紧——这些接口没有归属概念，谁登录都能往里写。
  if (req.method === 'POST' && url.pathname === '/api/course-video/upload') {
    if (AUTH_MODE === 'server') {
      requireRole(currentUser, ['teacher', 'admin'])
      const limit = Number(process.env.MAX_COURSE_VIDEO_BYTES || 512 * 1024 * 1024)
      // base64 会膨胀 4/3，请求体上限按膨胀后的体积算，否则 500MB 视频永远传不进来。
      const body = await readJson(req, Math.ceil((limit * 4) / 3) + 1024 * 1024, `视频超过 ${Math.round(limit / 1024 / 1024)}MB 上限，请压缩后再上传。`)
      const result = await uploadCourseVideo(body)
      return sendJson(res, 200, result)
    }
    const body = await readJson(req, 512 * 1024 * 1024)
    const result = await uploadCourseVideo(body)
    return sendJson(res, 200, result)
  }

  if (req.method === 'POST' && url.pathname === '/api/course-pdf/upload') {
    if (AUTH_MODE === 'server') {
      requireRole(currentUser, ['teacher', 'admin'])
      const body = await readJson(req, 64 * 1024 * 1024, 'PDF 课件超过 48MB 上限，请拆分后再上传。')
      const result = await uploadCoursePdf(body)
      return sendJson(res, 200, result)
    }
    const body = await readJson(req, 64 * 1024 * 1024)
    const result = await uploadCoursePdf(body)
    return sendJson(res, 200, result)
  }

  if (req.method === 'POST' && url.pathname === '/api/course-pdf/render') {
    if (AUTH_MODE === 'server') requireRole(currentUser, ['teacher', 'admin'])
    const body = await readJson(req)
    const result = await renderExistingCoursePdf(body)
    return sendJson(res, 200, result)
  }

  if (req.method === 'POST' && url.pathname === '/api/course-ppt/convert') {
    if (AUTH_MODE === 'server') requireRole(currentUser, ['teacher', 'admin'])
    const body = await readJson(req, 128 * 1024 * 1024, 'PPT 文件超过 96MB 上限，请压缩后再上传。')
    const result = await convertCoursePpt(body)
    return sendJson(res, result.ok ? 200 : 503, result)
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/report-agent-config') {
    return sendJson(res, 200, readReportAgentConfig())
  }

  // 试跑：只判断「它会怎么理解」，不执行任何花钱动作。
  if (req.method === 'POST' && url.pathname === '/api/admin/report-agent-config/preview') {
    const body = await readJson(req)
    const result = await previewAgentUnderstanding(body)
    return sendJson(res, 200, result)
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/report-agent-config/logs') {
    const logs = agentCallLog.query({
      flowKey: url.searchParams.get('flowKey') || '',
      status: url.searchParams.get('status') || 'all',
      limit: url.searchParams.get('limit') || 100,
    })
    return sendJson(res, 200, { ok: true, logs, actions: AGENT_DRY_RUN_ACTIONS })
  }

  // 学生端：绘画/视频/3D/课程/报告五页共用的智能体入口。
  // 只做「听懂 + 整理描述」，真正的出图/出视频仍由各页面原有流程执行，不在这里花钱。
  if (req.method === 'POST' && url.pathname === '/api/student/agent/understand') {
    const body = await readJson(req)
    await guardPromptFields(currentUser, body, ['text'], 'chat')
    return sendJson(res, 200, await understandForStudent({ ...body, requester: currentUser?.id || '' }))
  }

  // 课程页右侧的智能体对话。按课程隔离：一门课一个会话，刷新/换设备都能接着聊。
  // 三条接口都以课程授权为前提（getCourse 内部已经判过学生可见性），
  // 学生拿别人的 courseId 来问会直接被 404 挡掉，问不出任何内容。
  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/student/course-dialog') {
    const courseId = clipText(url.searchParams.get('courseId'), 160, '')
    if (!courseId) return sendJson(res, 400, { ok: false, message: '缺少课程编号。' })
    return sendJson(res, 200, await openCourseDialogForStudent(currentUser, courseId))
  }

  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/student/course-dialog/turn') {
    const turnBody = await guardPromptFields(currentUser, await readJson(req, 32 * 1024), ['text'], 'chat')
    return sendJson(res, 200, await replyCourseDialogTurn(currentUser, turnBody))
  }

  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/student/course-dialog/answer') {
    return sendJson(res, 200, await submitCourseDialogAnswer(currentUser, await readJson(req, 32 * 1024)))
  }

  // 学生端智能体的记忆：一个账号一份，五页共用，存在服务器（不上浏览器）。
  // 上架前存在本机 server/data/agent-memory.json；上服务器后自动跟着 dataDir 走。
  if (req.method === 'GET' && url.pathname === '/api/student/agent/memory') {
    return sendJson(res, 200, { ok: true, ...listAgentMessages(dataDir, currentUser, { limit: url.searchParams.get('limit') }) })
  }

  if (req.method === 'POST' && url.pathname === '/api/student/agent/memory') {
    const body = await readJson(req)
    return sendJson(res, 201, { ok: true, ...appendAgentMessage(dataDir, currentUser, body) })
  }

  if (req.method === 'DELETE' && url.pathname === '/api/student/agent/memory') {
    return sendJson(res, 200, { ok: true, ...clearAgentMessages(dataDir, currentUser) })
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/report-agent-config/logs/clear') {
    agentCallLog.clear()
    return sendJson(res, 200, { ok: true, message: '调用记录已清空' })
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/creative-agent-config') {
    return sendJson(res, 200, { ok: true, config: readCreativeAgentConfig() })
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/creative-agent-config') {
    const body = await readJson(req)
    return sendJson(res, 200, { ok: true, config: writeCreativeAgentConfig(body), message: '智能体配置已保存' })
  }

  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/admin/ai-skills') {
    return sendJson(res, 200, { ok: true, skills: await listAdminSkills(currentUser) })
  }
  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/admin/ai-skills/cover-assets') {
    const body = await readJson(req)
    const image = decodeH5VisualReferenceImage(body.imageData)
    if (!image) return sendJson(res, 400, { ok: false, message: '卡片图格式无效，仅支持 PNG、JPG、WEBP，且文件不能超过8MB。' })
    const organizationId = currentUser?.organization?.id || 'demo-organization'
    let payload = image.data
    let extension = image.extension
    // 学生端玩法卡片图区是 230×74（约 3.1:1 的横条），后台预览框同比例。
    // 存储副本按同一比例裁切，保证「后台看到的 = 学生端看到的」，不做二次形变。
    // 必须用 centre 而非 attention：attention 会挑对比度最高的区域，把中间主体裁掉。
    try {
      payload = await sharp(image.data, { limitInputPixels: 40000000 }).rotate().resize({ width: 900, height: 290, fit: 'cover', position: 'centre', withoutEnlargement: false }).webp({ quality: 88 }).toBuffer()
      extension = 'webp'
    } catch (error) {
      console.warn('[ai-skill] 卡片图压缩失败，改为存储原图：', error?.message)
    }
    const fileName = `cover-${Date.now()}-${randomBytes(6).toString('hex')}.${extension}`
    const target = aiSkillCoverAssetPath(organizationId, fileName)
    if (!target) return sendJson(res, 400, { ok: false, message: '卡片图存储路径无效。' })
    mkdirSync(resolve(target, '..'), { recursive: true })
    writeFileSync(target, payload)
    return sendJson(res, 201, { ok: true, assetUrl: `/api/ai-skill-covers/${encodeURIComponent(organizationId)}/${encodeURIComponent(fileName)}` })
  }
  const aiSkillCoverAssetMatch = url.pathname.match(/^\/api\/ai-skill-covers\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+)$/)
  if (aiSkillCoverAssetMatch && req.method === 'GET') return sendAiSkillCoverAsset(res, currentUser, aiSkillCoverAssetMatch[1], aiSkillCoverAssetMatch[2])
  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/admin/ai-skills') {
    return sendJson(res, 201, { ok: true, skill: await createAdminSkill(currentUser, await readJson(req)) })
  }
  const adminAiSkillMatch = url.pathname.match(/^\/api\/admin\/ai-skills\/([A-Za-z0-9_-]+)$/)
  const adminAiSkillActionMatch = url.pathname.match(/^\/api\/admin\/ai-skills\/([A-Za-z0-9_-]+)\/(publish|status|copy|enable|test)$/)
  if (AUTH_MODE === 'server' && adminAiSkillMatch && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, skill: await getAdminSkill(currentUser, adminAiSkillMatch[1]) })
  }
  if (AUTH_MODE === 'server' && adminAiSkillMatch && req.method === 'PATCH') {
    return sendJson(res, 200, { ok: true, skill: await updateAdminSkill(currentUser, adminAiSkillMatch[1], await readJson(req)) })
  }
  if (AUTH_MODE === 'server' && adminAiSkillMatch && req.method === 'DELETE') {
    return sendJson(res, 200, await deleteAdminSkill(currentUser, adminAiSkillMatch[1]))
  }
  const adminAiSkillVersionsMatch = url.pathname.match(/^\/api\/admin\/ai-skills\/([A-Za-z0-9_-]+)\/versions$/)
  const adminAiSkillRestoreMatch = url.pathname.match(/^\/api\/admin\/ai-skills\/([A-Za-z0-9_-]+)\/versions\/([A-Za-z0-9_-]+)\/restore$/)
  if (AUTH_MODE === 'server' && adminAiSkillVersionsMatch && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, versions: await listAdminSkillVersions(currentUser, adminAiSkillVersionsMatch[1]) })
  }
  if (AUTH_MODE === 'server' && adminAiSkillRestoreMatch && req.method === 'POST') {
    return sendJson(res, 200, { ok: true, skill: await restoreAdminSkillVersion(currentUser, adminAiSkillRestoreMatch[1], adminAiSkillRestoreMatch[2]) })
  }
  if (AUTH_MODE === 'server' && adminAiSkillActionMatch && req.method === 'POST') {
    const [, skillId, action] = adminAiSkillActionMatch
    const body = await readJson(req)
    if (action === 'publish') return sendJson(res, 200, { ok: true, skill: await publishAdminSkill(currentUser, skillId) })
    if (action === 'status') return sendJson(res, 200, { ok: true, skill: await setAdminSkillStatus(currentUser, skillId, body.status) })
    if (action === 'copy') return sendJson(res, 201, { ok: true, skill: await copyPlatformSkill(currentUser, skillId) })
    if (action === 'enable') return sendJson(res, 200, { ok: true, ...(await enablePlatformSkillForOrganization(currentUser, skillId, body.enabled !== false)) })
    const prepared = await prepareAdminSkillTest(currentUser, body, skillId)
    if (prepared.skill.skillType === 'image') {
      const { images, stepResults } = await runImageSkillSteps(prepared, currentUser)
      const skill = skillId === 'draft' ? null : await markAdminSkillTested(currentUser, skillId, body)
      return sendJson(res, 200, { ok: true, provider: stepResults.at(-1)?.provider, images, prompt: prepared.request.prompt, steps: stepResults, skill })
    }
    const result = await generateAgnesVideo(prepared.request)
    const skill = skillId === 'draft' ? null : await markAdminSkillTested(currentUser, skillId, body)
    return sendJson(res, 202, { ok: true, ...result, prompt: prepared.request.prompt, skill })
  }

  // ---- 技能包（外部 SKILL.md 导入区） ----
  // 定位：原料区。导入只落成待整理记录，学生端看不到；必须经「转成玩法 → 测试 → 发布」。
  // ⚠️ 路由顺序：categories / bulk 这一层必须写在 /:id 正则前面，
  // 否则 "categories" 会被 /:id 抢先匹配走，报「技能包不存在」。
  if (AUTH_MODE === 'server' && url.pathname === '/api/admin/ai-skill-package-categories') {
    if (req.method === 'GET') return sendJson(res, 200, { ok: true, categories: await listPackageCategories(currentUser) })
    if (req.method === 'POST') {
      const body = await readJson(req)
      return sendJson(res, 201, { ok: true, category: await createPackageCategory(currentUser, body) })
    }
  }
  const packageCategoryMatch = url.pathname.match(/^\/api\/admin\/ai-skill-package-categories\/([A-Za-z0-9_-]+)$/)
  if (AUTH_MODE === 'server' && packageCategoryMatch) {
    if (req.method === 'PATCH') {
      const body = await readJson(req)
      return sendJson(res, 200, { ok: true, category: await updatePackageCategory(currentUser, packageCategoryMatch[1], body) })
    }
    if (req.method === 'DELETE') {
      return sendJson(res, 200, { ok: true, ...(await deletePackageCategory(currentUser, packageCategoryMatch[1])) })
    }
  }

  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/admin/ai-skill-packages') {
    const packages = await listSkillPackages(currentUser, {
      status: url.searchParams.get('status') || '',
      categoryId: url.searchParams.get('categoryId') || '',
      keyword: url.searchParams.get('keyword') || '',
    })
    return sendJson(res, 200, { ok: true, packages })
  }
  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/admin/ai-skill-packages/import') {
    const body = await readJson(req)
    const result = await importSkillPackages(currentUser, body.items)
    return sendJson(res, 201, { ok: true, ...result })
  }
  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/admin/ai-skill-packages/bulk') {
    const body = await readJson(req)
    if (body.action === 'delete') return sendJson(res, 200, await removeSkillPackages(currentUser, body.ids))
    if (body.action === 'rename') return sendJson(res, 200, await renameSkillPackages(currentUser, body))
    if (body.action === 'visibility') return sendJson(res, 200, await setPackagesVisibility(currentUser, body))
    if (body.action === 'category') return sendJson(res, 200, await setPackagesCategory(currentUser, body.ids, body.categoryId))
    return sendJson(res, 200, await markSkillPackages(currentUser, body.ids, body.status))
  }
  const skillPackageMatch = url.pathname.match(/^\/api\/admin\/ai-skill-packages\/([A-Za-z0-9_-]+)$/)
  if (AUTH_MODE === 'server' && skillPackageMatch) {
    if (req.method === 'GET') {
      return sendJson(res, 200, { ok: true, package: await getSkillPackageDetail(currentUser, skillPackageMatch[1]) })
    }
    if (req.method === 'PATCH') {
      const body = await readJson(req)
      return sendJson(res, 200, { ok: true, package: await updateSkillPackage(currentUser, skillPackageMatch[1], body) })
    }
  }
  const skillPackageConvertMatch = url.pathname.match(/^\/api\/admin\/ai-skill-packages\/([A-Za-z0-9_-]+)\/convert$/)
  if (AUTH_MODE === 'server' && skillPackageConvertMatch && req.method === 'POST') {
    const body = await readJson(req)
    const detail = await getSkillPackageDetail(currentUser, skillPackageConvertMatch[1])
    const skillType = body.skillType === 'video' ? 'video' : 'image'
    // 提示词取老师填的那句；没填就退回技能包里抽出来的第一条候选，
    // 保证转出来的草稿卡至少能存下来（空的会被 normalizeConfiguration 拦）。
    const promptTemplate = String(body.promptTemplate || '').trim() || detail.promptCandidates[0] || '{{subject}}'
    const configuration = buildPackageSkillConfiguration({
      skillType, promptTemplate, coverUrl: String(body.coverUrl || detail.coverUrl || ''),
    })
    const skill = await createAdminSkill(currentUser, {
      title: String(body.title || '').trim() || detail.title,
      summary: String(body.summary || '').trim() || detail.summary,
      skillType,
      scopeType: 'organization',
      configuration,
    })
    await bindPackageToSkill(currentUser, detail.id, skill.id)
    return sendJson(res, 201, { ok: true, skill })
  }

  const adminH5WorkflowActionMatch = url.pathname.match(/^\/api\/admin\/h5-report-workflows\/([A-Za-z0-9_-]+)\/(test|publish)$/)
  if (AUTH_MODE === 'server' && adminH5WorkflowActionMatch && req.method === 'POST') {
    const [, skillId, action] = adminH5WorkflowActionMatch
    if (action === 'publish') {
      return sendJson(res, 200, { ok: true, skill: await publishAdminH5Workflow(currentUser, skillId) })
    }
    const body = await readJson(req)
    const prepared = await prepareAdminH5WorkflowTest(currentUser, skillId, body)
    const result = await generateImages(prepared.request, { user: currentUser })
    const skill = await markAdminH5WorkflowTested(currentUser, skillId)
    return sendJson(res, 200, {
      ok: true, provider: result.provider, images: result.images, prompt: prepared.request.prompt,
      materialCount: prepared.materialItems.length, nodeResults: prepared.nodeResults, skill,
    })
  }

  // 报告工作流库（方案2）：列表 / 批量删除 / AI 生成封面 / 详情 / 局部更新
  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/admin/h5-report-workflows') {
    return sendJson(res, 200, { ok: true, workflows: await listAdminH5WorkflowLibrary(currentUser) })
  }
  if (AUTH_MODE === 'server' && req.method === 'POST' && url.pathname === '/api/admin/h5-report-workflows/bulk-delete') {
    const body = await readJson(req)
    return sendJson(res, 200, await bulkDeleteAdminH5Workflows(currentUser, body.ids))
  }
  const adminH5WorkflowCoverMatch = url.pathname.match(/^\/api\/admin\/h5-report-workflows\/([A-Za-z0-9_-]+)\/cover\/ai$/)
  if (AUTH_MODE === 'server' && adminH5WorkflowCoverMatch && req.method === 'POST') {
    const workflow = await getAdminH5WorkflowLibraryItem(currentUser, adminH5WorkflowCoverMatch[1])
    const prompt = buildH5WorkflowCoverPrompt(workflow)
    const provider = getProvider('')
    const result = await generateImages({
      provider: provider.key,
      model: availableProviderModels(provider, 'image')[0] || provider.imageModel,
      capability: 'text-to-image',
      prompt,
      ratio: '3:4',
      quality: 'standard',
      count: 1,
    }, { user: currentUser })
    const generated = result.images?.[0]
    if (!generated?.imageUrl) return sendJson(res, 502, { ok: false, message: '封面生成失败：模型没有返回图片，请稍后重试。' })
    const assetUrl = await storeH5WorkflowCoverFromUrl(generated.imageUrl, currentUser?.organization?.id || 'demo-organization')
    if (!assetUrl) return sendJson(res, 502, { ok: false, message: '封面已生成但保存失败，请重试。' })
    const updated = await updateAdminH5WorkflowLibraryItem(currentUser, adminH5WorkflowCoverMatch[1], { coverUrl: assetUrl, coverSource: 'ai' })
    return sendJson(res, 200, { ok: true, workflow: updated, assetUrl, prompt, provider: result.provider })
  }
  // 「用画布第一页当封面」：由服务端自己从草稿配置里取第一张出图再转存成封面。
  // 放在服务端做而不是前端读配置，是因为画布成图存在 data.output.url，前端早期版本只看 data.image，
  // 画布明明出过图却一直提示“还没有生成过图片”。口径统一收敛到 h5WorkflowCanvasCoverSource()。
  const adminH5WorkflowCanvasCoverMatch = url.pathname.match(/^\/api\/admin\/h5-report-workflows\/([A-Za-z0-9_-]+)\/cover\/canvas$/)
  if (AUTH_MODE === 'server' && adminH5WorkflowCanvasCoverMatch && req.method === 'POST') {
    const workflow = await getAdminH5WorkflowLibraryItem(currentUser, adminH5WorkflowCanvasCoverMatch[1])
    const source = h5WorkflowCanvasCoverSource(workflow?.draftConfiguration || {})
    if (!source?.url) {
      return sendJson(res, 409, { ok: false, message: '画布里还没有生成过图片，请先在画布页跑一次真实测试再取首页。' })
    }
    // 画布里的图可能是本地资产 /api/assets/<id>，也可能是 data:URL 或外链，统一交给转存函数处理。
    const localDataUrl = await localAssetReferenceAsDataUrl(source.url, currentUser)
    const imageUrl = localDataUrl || source.url
    const assetUrl = await storeH5WorkflowCoverFromUrl(imageUrl, currentUser?.organization?.id || 'demo-organization')
    if (!assetUrl) return sendJson(res, 502, { ok: false, message: '读到了画布图片但保存封面失败，请重试。' })
    const updated = await updateAdminH5WorkflowLibraryItem(currentUser, adminH5WorkflowCanvasCoverMatch[1], { coverUrl: assetUrl, coverSource: 'canvas-first-page' })
    return sendJson(res, 200, { ok: true, workflow: updated, assetUrl, sourceNode: source })
  }
  const adminH5WorkflowItemMatch = url.pathname.match(/^\/api\/admin\/h5-report-workflows\/([A-Za-z0-9_-]+)$/)
  if (AUTH_MODE === 'server' && adminH5WorkflowItemMatch && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, workflow: await getAdminH5WorkflowLibraryItem(currentUser, adminH5WorkflowItemMatch[1]) })
  }
  if (AUTH_MODE === 'server' && adminH5WorkflowItemMatch && req.method === 'PATCH') {
    return sendJson(res, 200, { ok: true, workflow: await updateAdminH5WorkflowLibraryItem(currentUser, adminH5WorkflowItemMatch[1], await readJson(req)) })
  }

  if (AUTH_MODE === 'server' && req.method === 'GET' && url.pathname === '/api/ai-skills') {
    return sendJson(res, 200, { ok: true, skills: await listStudentSkills(currentUser, url.searchParams.get('type') || '') })
  }
  const studentAiSkillRunMatch = url.pathname.match(/^\/api\/ai-skills\/([A-Za-z0-9_-]+)\/runs$/)
  if (AUTH_MODE === 'server' && studentAiSkillRunMatch && req.method === 'POST') {
    const skillValues = await guardTextValues(currentUser, (await readJson(req)).values || {})
    const prepared = await prepareStudentSkillRun(currentUser, studentAiSkillRunMatch[1], skillValues)
    try {
      if (prepared.skill.skillType === 'image') {
        const { images, stepResults } = await runImageSkillSteps(prepared, currentUser)
        // 同一条规矩：上游临时链接必须出图即转存，否则学生把结果放进作品里第二天就变破图。
        const preserved = await preserveGeneratedImages(images, { user: currentUser, dataDir, kind: 'ai-skill' })
        const task = await createAiTask(currentUser, {
          taskType: 'image', provider: stepResults.at(-1)?.provider, providerTaskId: `skill-image-${Date.now()}-${randomBytes(8).toString('hex')}`,
          status: 'succeeded', result: { skillId: prepared.skill.id, versionId: prepared.skill.publishedVersionId, images: preserved.images, steps: stepResults },
        })
        return sendJson(res, 200, { ok: true, provider: stepResults.at(-1)?.provider, skillId: prepared.skill.id, taskId: task.id, images: preserved.images, steps: stepResults })
      }
      const result = await generateAgnesVideo(prepared.request)
      const task = await createAiTask(currentUser, {
        taskType: 'video', provider: result.provider, providerTaskId: result.taskId, status: result.status,
        result: { skillId: prepared.skill.id, versionId: prepared.skill.publishedVersionId, duration: result.duration, referenceImageCount: result.referenceImageCount },
      })
      return sendJson(res, 202, { ok: true, skillId: prepared.skill.id, ...task, taskId: task.id })
    } catch (error) {
      await releaseStudentSkillUsage(currentUser, prepared.skill).catch(() => {})
      throw error
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/h5-report/canvas-workflow/run') {
    if (AUTH_MODE !== 'server') return sendJson(res, 503, { ok: false, message: '方案2工作流需要服务端登录模式。' })
    if (currentUser?.role !== 'student') return sendJson(res, 403, { ok: false, message: '只有小画家可以执行 H5 方案2工作流。' })
    const body = await readJson(req)
    const difficulty = ['junior', 'starter', 'advanced', 'pro'].includes(body.difficulty) ? body.difficulty : 'starter'
    // 跑哪个工作流，由学生选的那张风格卡决定（= 报告工作流库里的一个已发布模板）。
    // 以前这里写死读「方案2」绑定的单个工作流，现在改成按 body.workflowId 走，
    // 校验条件也换成「已发布 + 勾了学生可选 + 有生效分发」，跟风格卡清单同一口径。
    const requestedWorkflowId = String(body.workflowId || '').trim()
    if (!requestedWorkflowId) return sendJson(res, 409, { ok: false, message: '请先在右边选一个风格。' })
    const styles = await listStudentReportStyles(currentUser).catch(() => [])
    const style = styles.find((item) => item.skillId === requestedWorkflowId)
    if (!style) return sendJson(res, 409, { ok: false, message: '这个风格还没发布或讲师没有开放给小画家，换一个试试。' })
    const prepared = await prepareH5ReportWorkflowRun(currentUser, style.skillId, body)
    if (prepared.workflowVersion !== style.versionNumber) {
      if (prepared.usageReserved) await releaseStudentSkillUsage(currentUser, prepared.skill).catch(() => {})
      return sendJson(res, 409, { ok: false, message: '这个风格刚刚更新过，请刷新页面再生成。' })
    }
    try {
      const executed = await runImageSkillSteps(prepared, currentUser)
      // 和 /api/ai/image/generate 同一条规矩：上游给的是 24 小时临时签名链接，
      // 直接写进报告第二天就全变破图，而且公开分享的媒体代理只认站内地址，
      // 外链连兜底都没有（会直接 404）。所以这里也要出图即转存。
      const preserved = await preserveGeneratedImages(executed.images, {
        user: currentUser, dataDir, kind: 'h5-report',
      })
      // images 与 resultImages 原本指向同一个数组，只改前者会让后者还留着外链，
      // 所以按「原链接 → 站内链接」建一张表，三处一起换掉。
      const urlSwaps = new Map()
      // 执行器给的是纯字符串地址，转存后也还是字符串；两种形态都按同一个规则取地址
      const imageUrlOf = (item) => String((typeof item === 'string' ? item : item?.imageUrl) || '')
      executed.images.forEach((item, index) => {
        const before = imageUrlOf(item)
        const after = imageUrlOf(preserved.images?.[index])
        if (before && after && before !== after) urlSwaps.set(before, after)
      })
      const swapUrl = (value) => urlSwaps.get(String(value || '')) || value
      executed.images = preserved.images
      executed.resultImages = (executed.resultImages || []).map(swapUrl)
      executed.materialImages = (executed.materialImages || []).map(swapUrl)
      // 步骤明细里也存着图，报告页「节点结果」会读它，一并换掉保持一致。
      executed.stepResults = (executed.stepResults || []).map((step) => ({
        ...step,
        images: (step.images || []).map((image) => (
          typeof image === 'string' ? swapUrl(image) : { ...image, imageUrl: swapUrl(image?.imageUrl) }
        )),
      }))
      // 素材格是原样透传的（provider 记为 material），任务记录里要写真正出图的供应商
      const provider = executed.stepResults.find((step) => step.provider && step.provider !== 'material')?.provider || ''
      const task = await createAiTask(currentUser, {
        taskType: 'image', provider, providerTaskId: `h5-canvas-${Date.now()}-${randomBytes(8).toString('hex')}`,
        status: 'succeeded', result: { skillId: prepared.skill.id, versionId: prepared.skill.publishedVersionId, images: executed.images },
      })
      const nodeResults = executed.stepResults.length
        ? executed.stepResults.map((step) => ({
            nodeId: step.nodeId, nodeType: step.nodeType, title: step.title,
            status: 'completed', imageCount: (step.images || []).length,
          }))
        : prepared.nodeResults.map((item) => ({ ...item, status: item.nodeType === 'result' ? 'completed' : 'generated' }))
      return sendJson(res, 200, {
        ok: true, strategyId: style.skillId, workflowId: style.skillId,
        strategyName: style.name,
        workflowVersion: prepared.workflowVersion, adapterKey: 'h5-report-canvas-adapter', provider,
        taskId: task.id, images: executed.images, materialCount: prepared.materialItems.length,
        // 结果图与素材图分开给前端：结果图进「方案2工作流图 1~N」，
        // 素材图只是学生自己上传的原图，不重复刷屏。
        resultImages: executed.resultImages,
        materialImages: executed.materialImages,
        executedNodes: executed.stepResults.length,
        nodeResults,
        warnings: [
          ...(prepared.warnings || []),
          ...(prepared.materialItems.length ? [] : ['当前项目没有可用图片素材，工作流已按纯文字模式生成视觉结果。']),
          ...(preserved.failed ? [`有 ${preserved.failed} 张图没能存进素材库，用的是临时链接，24 小时后可能失效。`] : []),
        ],
      })
    } catch (error) {
      if (prepared.batchIndex === 0) await releaseStudentSkillUsage(currentUser, prepared.skill).catch(() => {})
      throw error
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/h5-report-config') {
    const state = h5LayoutService.config(currentUser)
    return sendJson(res, 200, { ...state, hasUnpublishedChanges: h5ConfigChanged(state.draft, state.published) })
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/h5-report-config/template') {
    return sendJson(res, 200, h5LayoutService.saveTemplate(await readJson(req), currentUser))
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/h5-report-layout/samples') {
    const id = url.searchParams.get('id')
    return sendJson(res, 200, id ? { project: await h5LayoutService.sample(id, currentUser) } : { samples: await h5LayoutService.samples(currentUser) })
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/h5-report-layout/generate') {
    const body = await readJson(req, 4 * 1024 * 1024)
    return sendJson(res, 200, await h5LayoutService.generateLayout(body.design, body.instruction, currentUser))
  }

  if (req.method === 'POST' && url.pathname === '/api/h5-report/layout') {
    if (AUTH_MODE === 'server') requireRole(currentUser, ['student'])
    return sendJson(res, 200, await h5LayoutService.studentLayout(await readJson(req, 4 * 1024 * 1024), currentUser))
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/h5-report-config/draft') {
    const body = await readJson(req)
    writeH5ReportDraftConfig(mergeH5ScopedConfig(body, readH5ReportDraftConfig(), currentUser))
    return sendJson(res, 200, { ok: true, ...h5LayoutService.config(currentUser), message: 'H5 配置草稿已保存' })
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/h5-report-config') {
    const body = await readJson(req)
    const canvasStrategy = (body.strategies || []).find((item) => item.id === 'h5-canvas-workflow')
    const openedEditions = Object.entries(body.editions || {}).filter(([, edition]) => (edition.allowedStrategyIds || []).includes('h5-canvas-workflow'))
    if (canvasStrategy?.studentSelectable === true || canvasStrategy?.status === 'enabled' || openedEditions.length) {
      if (!canvasStrategy.workflowId || canvasStrategy.executionReady !== true || canvasStrategy.adapterKey !== 'h5-report-canvas-adapter' || Number(canvasStrategy.workflowVersion || 0) < 1) {
        return sendJson(res, 409, { ok: false, message: '方案2开放前必须绑定已真实测试并发布的 H5 无限画布工作流版本。' })
      }
      if (!Array.isArray(canvasStrategy.boundTemplateIds) || !canvasStrategy.boundTemplateIds.length) {
        return sendJson(res, 409, { ok: false, message: '方案2开放前至少需要绑定一套 H5 模板。' })
      }
      try {
        const skill = await getAdminSkill(currentUser, canvasStrategy.workflowId)
        if (skill.status !== 'published' || !skill.publishedVersionId || !skill.configuration?.runtime?.testedAt) {
          return sendJson(res, 409, { ok: false, message: '绑定的 H5 无限画布工作流尚未完成真实测试和发布。' })
        }
        if (Number(canvasStrategy.workflowVersion) !== Number(skill.publishedVersionNumber)) {
          return sendJson(res, 409, { ok: false, message: `方案2绑定版本 ${canvasStrategy.workflowVersion} 与工作流已发布版本 ${skill.publishedVersionNumber} 不一致。` })
        }
      } catch (error) {
        if (error?.statusCode) throw error
        return sendJson(res, 409, { ok: false, message: '无法验证方案2工作流发布状态。' })
      }
    }
    const saved = writeH5ReportConfig(mergeH5ScopedConfig(body, readH5ReportConfig(), currentUser, true))
    writeH5ReportDraftConfig(saved)
    return sendJson(res, 200, { ok: true, revision: h5LayoutService.config(currentUser).revision, config: h5LayoutService.config(currentUser).published, message: 'H5 报告中心配置已发布到服务器' })
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/h5-visual-template-assets') {
    const body = await readJson(req, 12 * 1024 * 1024)
    const templateId = safeH5AssetPart(body.templateId)
    const pageId = safeH5AssetPart(body.pageId)
    const image = decodeH5VisualReferenceImage(body.imageData)
    if (!templateId || !pageId || !image) {
      return sendJson(res, 400, { ok: false, message: '参考图格式无效，仅支持PNG、JPG、WEBP，且文件不能超过8MB。' })
    }
    const existingTemplate = [...readH5ReportDraftConfig().templates, ...readH5ReportConfig().templates].find(item => item.id === templateId)
    if (existingTemplate && !h5TemplateVisible(existingTemplate, currentUser)) return sendJson(res, 404, { ok: false, message: '无权上传到该模板' })
    try {
      const meta = await sharp(image.data, { limitInputPixels: 40000000 }).metadata()
      if (!['png', 'jpeg', 'webp'].includes(meta.format) || (meta.pages || 1) > 1 || meta.format !== (image.extension === 'jpg' ? 'jpeg' : image.extension)) throw new Error('invalid image')
    } catch { return sendJson(res, 400, { ok: false, message: '图片内容无法识别、格式不符或尺寸过大，请重新导出PNG、JPG或WEBP。' }) }
    const assetId = `reference-${Date.now()}-${randomBytes(6).toString('hex')}`
    const target = h5VisualReferenceAssetPath(templateId, pageId, assetId, image.extension)
    mkdirSync(resolve(target, '..'), { recursive: true })
    writeFileSync(target, image.data)
    writeFileSync(`${target}.json`, JSON.stringify({ organizationId: currentUser?.organization?.id || 'demo-organization' }), 'utf8')
    return sendJson(res, 201, {
      ok: true,
      assetUrl: `/api/h5-visual-template-assets/${encodeURIComponent(templateId)}/${encodeURIComponent(pageId)}/${encodeURIComponent(`${assetId}.${image.extension}`)}`,
    })
  }

  const h5VisualReferenceMatch = url.pathname.match(/^\/api\/h5-visual-template-assets\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+)$/)
  if (h5VisualReferenceMatch && req.method === 'GET') {
    checkH5VisualMedia(url.pathname, currentUser)
    return sendH5VisualReferenceAsset(res, h5VisualReferenceMatch[1], h5VisualReferenceMatch[2], h5VisualReferenceMatch[3])
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/h5-reports') {
    const status = url.searchParams.get('status') || 'all'
    const reports = readH5Reports().filter((item) => {
      const sameOrganization = AUTH_MODE !== 'server' || item.organizationId === currentUser?.organization?.id
      return sameOrganization && (status === 'all' || item.status === status)
    })
    return sendJson(res, 200, { ok: true, reports })
  }

  // 后台删除分享页上的访客留言（不当留言要能当场删掉）。body: { ids: [...] }，旧留言没有 id 时用 createdAts。
  const adminH5CommentsMatch = url.pathname.match(/^\/api\/admin\/h5-reports\/([A-Za-z0-9_-]+)\/comments\/delete$/)
  if (adminH5CommentsMatch && req.method === 'POST') {
    const body = await readJson(req, 64 * 1024, '请求内容过大。')
    const ids = new Set((Array.isArray(body.ids) ? body.ids : []).map(String))
    const times = new Set((Array.isArray(body.createdAts) ? body.createdAts : []).map(String))
    if (!ids.size && !times.size) return sendJson(res, 400, { ok: false, message: '请先选择要删除的留言。' })
    const reports = readH5Reports()
    const index = reports.findIndex((item) => item.id === adminH5CommentsMatch[1])
    if (index < 0 || (AUTH_MODE === 'server' && reports[index].organizationId !== currentUser?.organization?.id)) {
      return sendJson(res, 404, { ok: false, message: '未找到这份 H5 报告。' })
    }
    const before = reports[index].comments || []
    const comments = before.filter((item) => !(item.id && ids.has(item.id)) && !times.has(String(item.createdAt)))
    reports[index] = { ...reports[index], comments }
    writeH5Reports(reports)
    return sendJson(res, 200, { ok: true, deleted: before.length - comments.length, comments })
  }
  const adminH5AuditMatch = url.pathname.match(/^\/api\/admin\/h5-reports\/([A-Za-z0-9_-]+)\/audit$/)
  if (adminH5AuditMatch && req.method === 'PATCH') {
    const body = await readJson(req)
    const action = ['published', 'rejected', 'offline', 'pending'].includes(body.status) ? body.status : ''
    if (!action) return sendJson(res, 400, { ok: false, message: '无效的审核状态。' })
    const reports = readH5Reports()
    const index = reports.findIndex((item) => item.id === adminH5AuditMatch[1])
    if (index >= 0 && AUTH_MODE === 'server' && reports[index].organizationId !== currentUser?.organization?.id) {
      return sendJson(res, 404, { ok: false, message: '未找到这份 H5 报告。' })
    }
    if (index < 0) return sendJson(res, 404, { ok: false, message: '未找到这份 H5 报告。' })
    reports[index].status = action
    reports[index].auditReason = String(body.reason || (action === 'published' ? '管理员人工审核通过' : '管理员已更新审核状态')).slice(0, 300)
    reports[index].reviewedAt = new Date().toISOString()
    reports[index].reviewedBy = currentUser?.id || 'demo-admin'
    if (action === 'published') {
      reports[index].publishedAt = reports[index].publishedAt || new Date().toISOString()
      reports[index].shareToken = reports[index].shareToken || randomBytes(24).toString('base64url')
    } else if (action === 'offline') reports[index].shareToken = ''
    writeH5Reports(reports)
    return sendJson(res, 200, { ok: true, report: reports[index] })
  }

  // 把工作流返回的远程结果图（火山/豆包临时链接）当场落盘成报告页图。
  // 前端拿到的是本服务自己的地址，不受上游 24 小时过期影响。
  const h5PageIngestMatch = url.pathname.match(/^\/api\/h5-reports\/([A-Za-z0-9_-]+)\/pages\/([A-Za-z0-9_-]+)\/ingest$/)
  if (h5PageIngestMatch && req.method === 'POST') {
    const body = await readJson(req)
    const reportId = safeH5AssetPart(h5PageIngestMatch[1])
    const pageId = safeH5AssetPart(h5PageIngestMatch[2])
    if (!reportId || !pageId) return sendJson(res, 400, { ok: false, message: '报告或页面编号无效。' })
    assertH5PageWritable(reportId, currentUser)
    const stored = await storeH5ReportPageFromUrl(body.imageUrl, reportId, pageId, currentUser)
    if (!stored) return sendJson(res, 502, { ok: false, message: '结果图下载失败，可能是上游链接已过期。请重新生成。' })
    return sendJson(res, 201, {
      ok: true,
      pageId,
      label: String(body.label || '').slice(0, 80),
      assetUrl: `/api/h5-report-assets/${encodeURIComponent(reportId)}/${encodeURIComponent(pageId)}`,
    })
  }

  // 报告页图的读接口。以前只有写、没有读，前端拿到的 assetUrl 打不开，
  // 学生端预览就只能靠公开页的 shareToken 重拼，保存前一律看不到图。
  const h5PageAssetMatch = url.pathname.match(/^\/api\/h5-report-assets\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/)
  if (h5PageAssetMatch && req.method === 'GET') {
    const reportId = safeH5AssetPart(h5PageAssetMatch[1])
    const pageId = safeH5AssetPart(h5PageAssetMatch[2])
    if (!reportId || !pageId) return sendJson(res, 404, { ok: false, message: '报告页面图片不存在。' })
    // 已入库的报告：只放行报告所有者本人；未入库的（刚生成、还没保存）允许登录用户读取，
    // 否则「生成完立刻预览」这一步永远是 403。
    const report = readH5Reports().find((item) => item.id === reportId)
    if (report && AUTH_MODE === 'server' && report.ownerUserId !== currentUser?.id) {
      return sendJson(res, 404, { ok: false, message: '报告页面图片不存在。' })
    }
    return sendH5ReportPageAsset(res, h5ReportAssetPath(reportId, pageId))
  }

  // Keep this more specific route before the generic H5 report collection routes.
  // It prevents a page-image upload from being mistaken for an unknown collection action.
  const h5PageUploadMatch = url.pathname.match(/^\/api\/h5-reports\/([A-Za-z0-9_-]+)\/pages$/)
  if (h5PageUploadMatch && req.method === 'POST') {
    const body = await readJson(req)
    const reportId = safeH5AssetPart(h5PageUploadMatch[1])
    const pageId = safeH5AssetPart(body.pageId)
    const image = decodeH5PageImage(body.imageData)
    if (!reportId || !pageId || !image) return sendJson(res, 400, { ok: false, message: '报告页面图片格式无效，或图片超过 7MB。' })
    assertH5PageWritable(reportId, currentUser)
    const target = h5ReportAssetPath(reportId, pageId)
    mkdirSync(resolve(target, '..'), { recursive: true })
    writeFileSync(target, image)
    return sendJson(res, 201, { ok: true, assetUrl: `/api/h5-report-assets/${encodeURIComponent(reportId)}/${encodeURIComponent(pageId)}` })
  }

  if (req.method === 'GET' && url.pathname === '/api/h5-reports') {
    const reports = readH5Reports().filter((item) => AUTH_MODE !== 'server' || item.ownerUserId === currentUser?.id)
    return sendJson(res, 200, { ok: true, reports })
  }

  if (req.method === 'POST' && url.pathname === '/api/h5-reports') {
    const body = await readJson(req)
    const riskState = body.submit ? await loadPublishRiskState(currentUser) : null
    const report = saveH5ReportRecord(body, currentUser, riskState)
    if (riskState && currentUser) {
      const verdict = publishTextVerdict(riskState, h5ReportAuditText(report))
      if (verdict.action !== 'pass') await recordVerdict(currentUser, verdict, { scope: 'gallery' }).catch(() => {})
    }
    return sendJson(res, 200, { ok: true, report, shareUrl: report.shareToken ? `/h5-report/public/${report.shareToken}` : '' })
  }

  if (req.method === 'GET' && url.pathname === '/api/h5-report/runtime-config') {
    const config = readH5ReportConfig()
    const difficulty = ['junior', 'starter', 'advanced', 'pro'].includes(url.searchParams.get('difficulty'))
      ? url.searchParams.get('difficulty')
      : 'starter'
    const edition = config.editions[difficulty]
    const legacyCanvas = (config.strategies || []).find((item) => item.id === 'h5-canvas-workflow') || {}
    // 画布模板 = 学生端「选一个风格」的卡片来源。
    //   · 一个已发布的报告工作流 → 一张卡（名字/封面都取工作流自己的）
    //   · 每次进页面现查，老师发一个新的就立刻多一张，不用再回后台填工作流 ID
    //   · 只在高级版(pro)开放：入门/初级是低龄端另一套版式，不掺进来
    const workflowStyles = difficulty === 'pro' ? await listStudentReportStyles(currentUser).catch(() => []) : []
    const boundTemplateIds = Array.isArray(legacyCanvas.boundTemplateIds) && legacyCanvas.boundTemplateIds.length
      ? legacyCanvas.boundTemplateIds
      : (edition?.allowedTemplateIds || [])
    const canvasStrategies = workflowStyles.map((style) => ({
      id: style.skillId,
      name: style.name,
      type: 'canvas-workflow',
      status: 'enabled',
      studentSelectable: true,
      executionReady: true,
      rendererKey: 'canvas-workflow-renderer',
      workflowId: style.skillId,
      workflowVersion: style.versionNumber,
      adapterKey: 'h5-report-canvas-adapter',
      boundTemplateIds,
      coverUrl: style.coverUrl,
      summary: style.summary,
      pageCount: style.pageCount,
      estimatedMinutes: style.estimatedMinutes,
      flowSummary: style.flowSummary,
      source: 'report-workflow-library',
      inputPolicy: legacyCanvas.inputPolicy || { text: 'report-document', images: 'all-project-materials', template: 'selected-h5-template' },
      outputPolicy: legacyCanvas.outputPolicy || { resultType: 'page-images', maxPages: 12, ratio: '9:16', requireImageResult: true },
    }))
    // 老的那条「方案2」不再返回给学生：它绑的是单个工作流，现在由上面的模板卡取代
    const strategies = [...(config.strategies || []).filter((item) => item.id !== 'h5-canvas-workflow'), ...canvasStrategies]
    const requested = String(url.searchParams.get('strategy') || '')
    const requestedStrategy = strategies.find((item) => item.id === requested)
    // 进页面时前端带的是默认值（h5-standard / 老的方案2），这不算老师真的选了某张卡 ——
    // 有画布模板就直接落第一张，否则「选一个风格」里没有一个是选中态，点生成会悄悄走方案1。
    const askedLegacy = !requested || requested === 'h5-standard' || requested === 'h5-canvas-workflow'
    const strategy = (requestedStrategy && !askedLegacy) ? requestedStrategy : (canvasStrategies[0] || requestedStrategy || strategies[0])
    const strategyAllowed = (edition?.allowedStrategyIds || []).includes(strategy?.id) || strategy?.source === 'report-workflow-library'
    const strategyVisible = (strategy?.executionReady !== false) && (strategy?.status === 'enabled' || (strategy?.status === 'testing' && strategy?.studentSelectable === true))
    const allowedIds = new Set(edition?.allowedTemplateIds || [])
    const boundIds = new Set(strategy?.boundTemplateIds || [])
    const templates = config.templates.filter((item) => h5TemplateVisible(item, currentUser) && allowedIds.has(item.id) && item.status === 'published' && (
      strategy?.type === 'canvas-workflow' ? boundIds.has(item.id) : (item.strategyId || 'h5-standard') === strategy?.id
    ))
    return sendJson(res, 200, {
      difficulty,
      edition,
      strategies: strategies.filter((item) => item.source === 'report-workflow-library' || ((edition?.allowedStrategyIds || []).includes(item.id) && item.executionReady !== false && (item.status === 'enabled' || (item.status === 'testing' && item.studentSelectable === true)))),
      strategy: strategyAllowed && strategyVisible ? strategy : null,
      templates,
      defaultStrategyId: canvasStrategies[0]?.id || edition?.defaultStrategyId || 'h5-standard',
      defaultTemplateId: templates.some((item) => item.id === edition?.defaultTemplateId) ? edition.defaultTemplateId : templates[0]?.id || '',
      reportModel: (() => {
        const boundAgent = resolveReportAgent({ flowKey: 'report.h5FirstPerson', difficulty }).agent
        const picked = resolveTextModelForAgent(boundAgent)
        const providerInfo = mergedProviders()[picked.provider]
        return {
          agentName: boundAgent?.name || '',
          provider: picked.provider || '',
          providerLabel: providerInfo?.label || picked.provider || '',
          model: picked.model || '',
        }
      })(),
    })
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/report-agent-config/reset') {
    const saved = writeReportAgentConfig(defaultReportAgentState())
    return sendJson(res, 200, { ok: true, config: saved, message: '报告智能体配置已恢复默认' })
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/report-agent-config') {
    const body = await readJson(req)
    const saved = writeReportAgentConfig(body.reset ? defaultReportAgentState() : body)
    return sendJson(res, 200, { ok: true, config: saved, message: body.reset ? '报告智能体配置已恢复默认' : '报告智能体配置已保存' })
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/ai-providers') {
    const saved = readProviderConfig()
    const merged = mergedProviders()
    const tencentConnection = tencentAi3dConnectionInfo()
    return sendJson(res, 200, {
      defaultProvider: saved.defaultProvider || DEFAULT_PROVIDER,
      defaultTextProvider: saved.defaultTextProvider || DEFAULT_TEXT_PROVIDER || saved.defaultProvider || DEFAULT_PROVIDER,
      imageFallback: imageFallbackView(),
      providers: Object.fromEntries(Object.entries(merged).map(([key, item]) => [key, {
        key,
        label: item.label,
        baseUrl: item.baseUrl,
        imageModel: item.imageModel,
        videoModel: item.videoModel || '',
        textModel: item.textModel || '',
        imageModels: providerModelList(item, 'image'),
        videoModels: providerModelList(item, 'video'),
        textModels: providerModelList(item, 'text'),
        models: providerUnifiedModelList(item),
        defaultModel: item.defaultModel || item.textModel || item.imageModel || item.videoModel || '',
        configured: key === 'hunyuan3d'
          ? tencentConnection.configured
          : providerKeyUsable(item),
        enabled: item.enabled !== false,
        disabledModels: item.disabledModels || [],
        credentialsConfigured: key === 'hunyuan3d'
          ? tencentConnection.configured
          : undefined,
        connection: key === 'hunyuan3d'
          ? { region: tencentConnection.region, endpoint: tencentConnection.endpoint, credentialSource: tencentConnection.source }
          : undefined,
        custom: Boolean(item.custom),
        category: item.category || 'painting',
        capabilities: item.capabilities || [],
        bindings: item.bindings || [],
        // 参考图能力：让「上游图能不能送进模型」在后台可见可改，而不是藏在代码里。
        imageInput: providerImageInputSpec(item),
        imageEdit: normalizeImageEditSpec(item.imageEdit),
        imageInputLabel: providerImageInputLabel(providerImageInputSpec(item)),
        // 参考图设置从哪来：manual 后台手动指定 / preset 内置平台预设 / auto 按地址和模型名自动识别 / default 认不出来，按 OpenAI 兼容处理
        imageInputSource: imageInputSourceOf(key, item, saved.providers?.[key]),
        supportsReferenceImage: providerImageInputSpec(item).mode !== 'none',
        defaultEdition: item.defaultEdition || 'rapid',
        editions: { rapid: item.editions?.rapid !== false, pro: item.editions?.pro !== false },
        // 火山方舟（预置或接方舟的自建平台）出图带官方水印参数，其它平台没有这个开关。
        // 模型显示名（后台起的名字优先，没有就自动生成）和平台健康状态（连续失败会冷却一会儿）
        modelLabels: providerModelLabels(item),
        customModelLabels: normalizeModelLabels(item.modelLabels),
        autoModelLabels: Object.fromEntries(providerUnifiedModelList(item).map((model) => [model, autoModelLabel(model)])),
        health: providerHealthView(key),
        imageWatermark: providerHasArkWatermark(key, item) ? item.imageWatermark !== false : undefined,
      }])),
    })
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/ai-providers') {
    const body = await readJson(req)
    const key = normalizeProviderKey(body.key || body.provider)
    if (!key) return sendJson(res, 400, { ok: false, message: '请填写 API 标识，例如 openai-compatible' })
    if (key === 'hunyuan3d') saveTencentAi3dCredentials(body)
    const saved = readProviderConfig()
    const current = mergedProviders()[key] || {}
    const preset = providers[key] || {}
    const next = {
      ...saved,
      defaultProvider: body.defaultProvider || saved.defaultProvider || DEFAULT_PROVIDER,
      defaultTextProvider: body.defaultTextProvider || saved.defaultTextProvider || DEFAULT_TEXT_PROVIDER || '',
      hiddenProviders: (Array.isArray(saved.hiddenProviders) ? saved.hiddenProviders : []).filter((item) => normalizeProviderKey(item) !== key),
      providers: {
        ...(saved.providers || {}),
        [key]: {
          label: body.label || current.label || preset.label || key,
          baseUrl: body.baseUrl || current.baseUrl || preset.baseUrl || '',
          imageModel: providerField(body, 'imageModel', current.imageModel, preset.imageModel),
          videoModel: providerField(body, 'videoModel', current.videoModel, preset.videoModel),
          textModel: providerField(body, 'textModel', current.textModel, preset.textModel),
          imageModels: providerModelField(body, 'image', current, preset),
          videoModels: providerModelField(body, 'video', current, preset),
          textModels: providerModelField(body, 'text', current, preset),
          models: providerUnifiedModelField(body, current, preset),
          modelLabels: normalizeModelLabels(body.modelLabels === undefined ? current.modelLabels : body.modelLabels),
          defaultModel: providerField(body, 'defaultModel', current.defaultModel, current.textModel, current.imageModel, current.videoModel),
          // 腾讯云 AI3D 使用服务端 TC3 密钥，禁止把 SecretKey 写进通用配置文件。
          apiKey: key === 'hunyuan3d' ? '' : (body.apiKey || saved.providers?.[key]?.apiKey || ''),
          custom: !providers[key],
          category: ['painting', 'model3d', 'custom'].includes(body.category) ? body.category : (current.category || preset.category || 'custom'),
          capabilities: Array.isArray(body.capabilities) ? body.capabilities : (current.capabilities || []),
          bindings: Array.isArray(body.bindings) ? body.bindings : (current.bindings || []),
          imageInput: providerImageInputField(body, current, preset),
          imageEdit: normalizeImageEditSpec(body.imageEdit === undefined ? current.imageEdit : body.imageEdit),
          // 方舟图片的官方水印开关：只给火山方舟（预置或接方舟的自建平台）存；请求里没带就保留原值，默认开启。
          ...(providerHasArkWatermark(key, { baseUrl: body.baseUrl || current.baseUrl }) ? { imageWatermark: typeof body.imageWatermark === 'boolean' ? body.imageWatermark : current.imageWatermark !== false } : {}),
          enabled: key === 'hunyuan3d' ? body.enabled !== false : current.enabled !== false,
          disabledModels: normalizeModelList(current.disabledModels),
          defaultEdition: key === 'hunyuan3d' && body.defaultEdition === 'pro' ? 'pro' : 'rapid',
          editions: key === 'hunyuan3d'
            ? { rapid: body.editions?.rapid !== false, pro: body.editions?.pro !== false }
            : (current.editions || {}),
        },
      },
    }
    writeProviderConfig(next)
    return sendJson(res, 200, { ok: true, message: key === 'hunyuan3d' ? '腾讯混元3D配置已安全保存' : '模型配置已保存', config: { defaultProvider: next.defaultProvider } })
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/admin/ai-providers/')) {
    const key = normalizeProviderKey(decodeURIComponent(url.pathname.split('/').pop() || ''))
    if (!key) return sendJson(res, 400, { ok: false, message: '请指定要删除的 API 配置' })
    const saved = readProviderConfig()
    const nextProviders = { ...(saved.providers || {}) }
    const hiddenProviders = new Set(Array.isArray(saved.hiddenProviders) ? saved.hiddenProviders.map(normalizeProviderKey) : [])
    delete nextProviders[key]
    if (providers[key]) hiddenProviders.add(key)
    const remainingKeys = [
      ...Object.keys(providers).filter((item) => !hiddenProviders.has(item)),
      ...Object.keys(nextProviders).filter((item) => !hiddenProviders.has(item)),
    ]
    const nextDefaultProvider = remainingKeys.includes(saved.defaultProvider) ? saved.defaultProvider : (remainingKeys[0] || '')
    const nextDefaultTextProvider = remainingKeys.includes(saved.defaultTextProvider) ? saved.defaultTextProvider : nextDefaultProvider
    const next = {
      ...saved,
      defaultProvider: nextDefaultProvider,
      defaultTextProvider: nextDefaultTextProvider,
      hiddenProviders: [...hiddenProviders],
      providers: nextProviders,
    }
    writeProviderConfig(next)
    return sendJson(res, 200, { ok: true, message: 'API 配置已删除' })
  }

  // 出图备用模型：主平台出故障时自动换用（只换一次）。enabled=false 关闭。
  if (req.method === 'POST' && url.pathname === '/api/admin/ai-providers/fallback') {
    const body = await readJson(req)
    const saved = readProviderConfig()
    if (body.enabled === false) {
      writeProviderConfig({ ...saved, imageFallback: { ...(saved.imageFallback || {}), enabled: false } })
      return sendJson(res, 200, { ok: true, imageFallback: imageFallbackView(), message: '已关闭出图备用模型' })
    }
    const key = normalizeProviderKey(body.provider)
    const provider = key ? mergedProviders()[key] : null
    const model = typeof body.model === 'string' ? body.model.trim() : ''
    if (!provider || provider.enabled === false) return sendJson(res, 400, { ok: false, message: '请选择一个已启用的平台作为备用' })
    if (!providerKeyUsable(provider)) return sendJson(res, 400, { ok: false, message: `${provider.label} 还没有填写可用的 API Key，不能作为备用` })
    if (!availableProviderModels(provider, 'image').includes(model)) return sendJson(res, 400, { ok: false, message: '请选择这个平台已开启的图像模型' })
    writeProviderConfig({ ...saved, imageFallback: { enabled: true, provider: key, model } })
    const view = imageFallbackView()
    return sendJson(res, 200, { ok: true, imageFallback: view, message: `已设置出图备用模型：${view.providerLabel} · ${view.modelLabel}` })
  }

  // 平台冷却中，管理员确认问题解决后可以立即恢复
  if (req.method === 'POST' && url.pathname === '/api/admin/ai-providers/health/reset') {
    const body = await readJson(req)
    const key = normalizeProviderKey(body.provider)
    if (!key || !mergedProviders()[key]) return sendJson(res, 400, { ok: false, message: '找不到这个平台' })
    resetProviderHealth(key)
    return sendJson(res, 200, { ok: true, health: providerHealthView(key), message: '已恢复，下一次出图会重新使用这个平台' })
  }

  // 模型显示名：label 为空表示恢复自动生成的名字
  if (req.method === 'POST' && url.pathname === '/api/admin/ai-providers/model-label') {
    const body = await readJson(req)
    const key = normalizeProviderKey(body.provider)
    const provider = key ? mergedProviders()[key] : null
    const model = typeof body.model === 'string' ? body.model.trim() : ''
    if (!provider || !providerUnifiedModelList(provider).includes(model)) return sendJson(res, 400, { ok: false, message: '请选择这个平台已添加的模型' })
    const label = String(body.label ?? '').trim().replace(/\s+/g, ' ').slice(0, 24)
    const saved = readProviderConfig()
    const labels = { ...normalizeModelLabels(saved.providers?.[key]?.modelLabels) }
    if (label) labels[model] = label
    else delete labels[model]
    writeProviderConfig({ ...saved, providers: { ...(saved.providers || {}), [key]: { ...(saved.providers?.[key] || {}), modelLabels: labels } } })
    const merged = mergedProviders()[key]
    return sendJson(res, 200, { ok: true, modelLabels: providerModelLabels(merged), customModelLabels: normalizeModelLabels(merged.modelLabels), message: label ? `已改名为「${label}」` : '已恢复自动名称' })
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/ai-providers/model-status') {
    const body = await readJson(req)
    const key = normalizeProviderKey(body.provider)
    const provider = mergedProviders()[key]
    const model = typeof body.model === 'string' ? body.model.trim() : ''
    if (!provider || !providerUnifiedModelList(provider).includes(model) || typeof body.enabled !== 'boolean') {
      return sendJson(res, 400, { ok: false, message: '请选择已配置的模型并指定开启或关闭状态' })
    }
    const saved = readProviderConfig()
    const disabledModels = normalizeModelList(provider.disabledModels).filter((item) => item !== model)
    if (!body.enabled) disabledModels.push(model)
    writeProviderConfig({ ...saved, providers: { ...saved.providers, [key]: { ...saved.providers?.[key], disabledModels } } })
    return sendJson(res, 200, { ok: true, disabledModels, message: body.enabled ? '模型已开启，前端刷新后可选择' : '模型已关闭，前端刷新后隐藏并禁止调用' })
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/ai-providers/models') {
    const body = await readJson(req)
    const active = getProvider(body.provider || body.key)
    const models = await fetchProviderModels(active)
    return sendJson(res, 200, {
      ok: true,
      provider: active.key,
      models,
      message: `已从 ${active.label} 获取 ${models.length} 个模型`,
    })
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/ai-providers/default') {
    const body = await readJson(req)
    const key = normalizeProviderKey(body.provider || body.key)
    const available = mergedProviders()
    if (!key || !available[key]) return sendJson(res, 400, { ok: false, message: `找不到模型平台：${key || '未填写'}` })
    const saved = readProviderConfig()
    const active = available[key]
    const next = {
      ...saved,
      defaultProvider: providerHasModel(active, 'image') ? key : (saved.defaultProvider || DEFAULT_PROVIDER),
      defaultTextProvider: providerHasModel(active, 'text') ? key : (saved.defaultTextProvider || ''),
    }
    writeProviderConfig(next)
    return sendJson(res, 200, {
      ok: true,
      defaultProvider: next.defaultProvider,
      defaultTextProvider: next.defaultTextProvider,
      message: providerHasModel(active, 'image') && providerHasModel(active, 'text')
        ? `已设为默认模型，并同步设为默认文本模型：${key}`
        : providerHasModel(active, 'text')
          ? `已设为默认文本模型：${key}`
          : `已设为默认模型：${key}`,
    })
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/ai-providers/test') {
    const body = await readJson(req)
    const active = getProvider(body.provider || body.key)
    if (active.key === 'hunyuan3d') {
      const connection = tencentAi3dConnectionInfo()
      const credentialsConfigured = connection.configured
      const enabled = active.enabled !== false
      return sendJson(res, 200, {
        ok: enabled && credentialsConfigured,
        provider: active.key,
        enabled,
        credentialsConfigured,
        message: !enabled
          ? '腾讯混元3D已停用，小画家端不能发起生成'
          : credentialsConfigured
            ? `腾讯混元3D已启用，服务端密钥已配置，默认使用${active.defaultEdition === 'pro' ? '专业版' : '极速版'}`
            : '腾讯混元3D已启用，但服务端尚未配置 SecretId 和 SecretKey',
        model: active.defaultModel || TENCENT_AI3D_MODEL,
        defaultEdition: active.defaultEdition || 'rapid',
        editions: { rapid: active.editions?.rapid !== false, pro: active.editions?.pro !== false },
        baseUrl: active.baseUrl,
        connection: { region: connection.region, endpoint: connection.endpoint },
      })
    }
    const spec = providerImageInputSpec(active)
    const imageInput = {
      mode: spec.mode,
      declared: spec.declared,
      label: providerImageInputLabel(spec),
      supportsReferenceImage: spec.mode !== 'none',
    }
    // 显式勾选才做真实出图自检（一次付费调用）；不勾选只回报配置，不产生费用。
    if (body.checkReferenceImage === true && active.apiKey && imageInput.supportsReferenceImage) {
      const check = await testReferenceImageForwarding(active, spec)
      return sendJson(res, 200, {
        ok: check.ok,
        provider: active.key,
        message: check.message,
        model: check.model,
        textModel: active.textModel || '',
        baseUrl: active.baseUrl,
        imageInput,
        referenceImageCheck: check,
      })
    }
    // 免费检测连接：读一次平台的模型列表（不出图、不产生费用），确认地址、网络和 Key 是否真的可用
    const connection = await probeProviderConnection(active)
    return sendJson(res, 200, {
      ok: connection.ok !== false,
      provider: active.key,
      message: `${connection.message}${connection.ok !== false ? `参考图能力：${imageInput.label}。` : ''}`,
      connection,
      model: active.imageModel,
      textModel: active.textModel || '',
      baseUrl: active.baseUrl,
      imageInput,
    })
  }

  // ---- AI 创作伙伴（智能体 + 技能）----
  // 会话、消息都按当前登录账号隔离；没有任何按 ID 读取他人数据的入口。
  if (url.pathname.startsWith('/api/agent/') || url.pathname.startsWith('/api/admin/agent/') || url.pathname.startsWith('/api/agent-images/') || url.pathname.startsWith('/api/agent-skill-covers/')) {
    if (AUTH_MODE !== 'server' || !currentUser) return sendJson(res, 409, { ok: false, message: 'AI 创作伙伴需要登录后使用（服务端登录模式）。' })

    if (req.method === 'GET' && url.pathname === '/api/agent/config') {
      return sendJson(res, 200, { ok: true, ...(await agentRuntime.publicConfig(currentUser)) })
    }
    if (req.method === 'POST' && url.pathname === '/api/agent/chat') {
      const body = await readJson(req, 64 * 1024, '消息太长了，请精简后再发送。')
      if (APP_ORIGIN) {
        res.setHeader('Access-Control-Allow-Origin', APP_ORIGIN)
        res.setHeader('Access-Control-Allow-Credentials', 'true')
      }
      await agentRuntime.streamChat(req, res, currentUser, body)
      return
    }
    if (req.method === 'GET' && url.pathname === '/api/agent/conversations') {
      return sendJson(res, 200, { ok: true, conversations: await listConversations(currentUser) })
    }
    const agentConversationMatch = url.pathname.match(/^\/api\/agent\/conversations\/([A-Za-z0-9_-]+)$/)
    if (agentConversationMatch && req.method === 'GET') {
      const conversation = await getOwnConversation(currentUser, agentConversationMatch[1])
      return sendJson(res, 200, { ok: true, conversation, messages: await listMessages(currentUser, conversation.id) })
    }
    if (agentConversationMatch && req.method === 'PATCH') {
      const body = await readJson(req, 8 * 1024)
      return sendJson(res, 200, { ok: true, conversation: await renameConversation(currentUser, agentConversationMatch[1], body.title) })
    }
    if (agentConversationMatch && req.method === 'DELETE') {
      return sendJson(res, 200, { ok: true, ...(await deleteConversation(currentUser, agentConversationMatch[1])) })
    }
    const agentVideoMatch = url.pathname.match(/^\/api\/agent\/videos\/([A-Za-z0-9_-]+)$/)
    if (agentVideoMatch && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, video: await pollAgentVideo(currentUser, agentVideoMatch[1]) })
    }
    const agentImageMatch = url.pathname.match(/^\/api\/agent-images\/([A-Za-z0-9_.-]+)$/)
    if (agentImageMatch && req.method === 'GET') {
      return sendAgentFile(req, res, agentImagePath(agentImageMatch[1], { user: currentUser, dataDir }))
    }
    const agentCoverMatch = url.pathname.match(/^\/api\/agent-skill-covers\/([A-Za-z0-9_.-]+)$/)
    if (agentCoverMatch && req.method === 'GET') {
      return sendAgentFile(req, res, agentSkillCoverPath(agentCoverMatch[1]), 'private, max-age=3600')
    }

    // 后台（/api/admin/* 已在上方统一校验管理员身份，技能管理内部还会校验机构管理范围）
    if (req.method === 'GET' && url.pathname === '/api/admin/agent/config') {
      return sendJson(res, 200, {
        ok: true,
        config: agentRuntime.readConfig(),
        models: agentRuntime.modelOptions(),
        toolLabels: AGENT_TOOL_LABELS,
        toolRoutes: AGENT_TOOL_ROUTES,
      })
    }
    if (req.method === 'PUT' && url.pathname === '/api/admin/agent/config') {
      const body = await readJson(req, 512 * 1024, '配置内容过大（头像图片请小于 300KB）。')
      return sendJson(res, 200, { ok: true, config: agentRuntime.writeConfig(body.config || body), message: '已保存，立即生效' })
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/agent/skills') {
      return sendJson(res, 200, { ok: true, skills: await listSkillsForAdmin(currentUser) })
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/agent/skills/import') {
      const body = await readJson(req, 32 * 1024 * 1024, '上传的技能文件太大（单个压缩包不超过 20MB）。')
      return sendJson(res, 200, { ok: true, ...(await importAgentSkills(currentUser, body.files || [])) })
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/agent/skills/from-package') {
      const body = await readJson(req, 8 * 1024)
      return sendJson(res, 200, { ok: true, ...(await importSkillFromPackage(currentUser, body.packageId)) })
    }
    const agentSkillExportMatch = url.pathname.match(/^\/api\/admin\/agent\/skills\/([A-Za-z0-9_-]+)\/export$/)
    if (agentSkillExportMatch && req.method === 'GET') {
      const skill = await getSkillForAdmin(currentUser, agentSkillExportMatch[1])
      res.writeHead(200, {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${skill.slug}-SKILL.md"`,
        'Cache-Control': 'no-store',
      })
      res.end(skillToMarkdown(skill))
      return
    }
    const agentSkillMatch = url.pathname.match(/^\/api\/admin\/agent\/skills\/([A-Za-z0-9_-]+)$/)
    if (agentSkillMatch && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, skill: await getSkillForAdmin(currentUser, agentSkillMatch[1]) })
    }
    if (agentSkillMatch && req.method === 'PATCH') {
      const body = await readJson(req, 4 * 1024 * 1024, '内容过大（封面图请小于 2MB）。')
      return sendJson(res, 200, { ok: true, skill: await updateAgentSkill(currentUser, agentSkillMatch[1], body) })
    }
    if (agentSkillMatch && req.method === 'DELETE') {
      return sendJson(res, 200, { ok: true, ...(await deleteAgentSkill(currentUser, agentSkillMatch[1])) })
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/agent/logs') {
      const logs = agentCallLog.query({ flowKey: 'assistant.chat', status: url.searchParams.get('status') || 'all', limit: url.searchParams.get('limit') || 100 })
      return sendJson(res, 200, { ok: true, logs })
    }
    return sendJson(res, 404, { ok: false, message: '接口不存在' })
  }

  if (req.method === 'GET' && url.pathname === '/api/ai/health') {
    const active = getProvider(url.searchParams.get('provider'))
    return sendJson(res, 200, {
      ok: providerKeyUsable(active),
      defaultProvider: readProviderConfig().defaultProvider || DEFAULT_PROVIDER,
      activeProvider: active.key,
      providers: Object.fromEntries(Object.entries(mergedProviders()).map(([key, item]) => [key, {
        label: item.label,
        imageModel: availableProviderModels(item, 'image')[0] || '',
        imageModels: availableProviderModels(item, 'image'),
        // 视频生成目前只接了 Agnes（见 generateAgnesVideo）；别的平台的视频模型列出来也只会报错，用户端不显示。
        videoModel: key === 'agnes' ? availableProviderModels(item, 'video')[0] || '' : '',
        videoModels: key === 'agnes' ? availableProviderModels(item, 'video') : [],
        textModel: availableProviderModels(item, 'text')[0] || '',
        textModels: availableProviderModels(item, 'text'),
        // 模型显示名（后台起的名字或自动生成），用户端下拉框显示这个，不显示一长串模型 ID
        modelLabels: providerModelLabels(item),
        configured: providerKeyUsable(item),
        // 参考图能力摘要：供前端与验收脚本判断「该平台能否把上游图送进模型」。
        imageInputMode: providerImageInputSpec(item).mode,
        referenceImageLabel: providerImageInputLabel(providerImageInputSpec(item)),
      }])),
      message: providerKeyUsable(active) ? `${active.label} 已配置，可以测试真实出图` : `${active.label} 还没有配置 API Key`,
    })
  }

  if (url.pathname.startsWith('/api/ai/image/edit')) {
    if (AUTH_MODE !== 'server') return sendJson(res, 409, { ok: false, message: '作品修改需要服务端小画家登录，演示模式不提供真实修改与云端保存。' })
    requireRole(currentUser, ['student'])
    if (req.method === 'GET' && url.pathname === '/api/ai/image/edit/capabilities') {
      return sendJson(res, 200, { ok: true, models: artworkEditor.capabilities(currentUser) })
    }
    if (req.method === 'GET' && url.pathname === '/api/ai/image/edit/source') {
      return sendProtectedAsset(res, await artworkEditor.source(currentUser, url.searchParams.get('documentId'), url.searchParams.get('versionId')))
    }
    if (req.method === 'POST' && url.pathname === '/api/ai/image/edit/save') {
      return sendJson(res, 200, await artworkEditor.save(currentUser, await readJson(req, 8192)))
    }
    if (req.method === 'POST' && url.pathname === '/api/ai/image/edit') {
      const editBody = await guardPromptFields(currentUser, await readJson(req, 36 * 1024 * 1024), ['prompt'])
      return sendJson(res, 200, await artworkEditor.edit(currentUser, editBody))
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/ai/image/generate') {
    const body = await readJson(req)
    await guardPromptFields(currentUser, body, ['prompt'])
    // 用户账号按张扣费（先用当日免费次数），生成失败自动退回；管理员 / 讲师账号不扣费。
    const imageCount = Math.min(Math.max(Math.round(Number(body.count) || 1), 1), MAX_GENERATION_COUNT)
    const { result, billing } = await runWithAbilityCharge(currentUser, {
      ability: 'image', provider: body.provider, model: body.model, count: imageCount, bizType: 'ai-image',
    }, async (billingInfo) => {
      // 传入当前登录态：让 `/api/assets/<id>` 这类本地资产参考图能在服务端解析成 data URL。
      const generated = await generateImages(body, { user: currentUser })
      if (!generated.images?.length) throw Object.assign(new Error('AI 没有返回图片，请换个描述再试一次。'), { statusCode: 502 })
      return { result: generated, billing: billingInfo }
    })
    // 出图结果落地成站内素材：上游返回的是 24 小时有效的临时签名链接，
    // 原样存进作品/画布，第二天就全变破图。这里统一换成 /api/assets/<id>，
    // 画布节点、作品广场、我的素材库三处一次性解决，前端不用各自转存一遍。
    // 转存失败不阻断出图（保留原链接），否则一次下载抖动就让整次出图白花钱。
    const preserved = await preserveGeneratedImages(result.images, {
      user: currentUser,
      dataDir,
      kind: 'ai-generated',
    })
    return sendJson(res, 200, {
      provider: result.provider,
      taskId: `task-${Date.now()}`,
      // 主平台故障时自动换了备用模型：告诉前端换成了谁（null = 没换）
      fallback: result.fallback || null,
      images: preserved.images,
      // 让前端与验收脚本能确认“上游参考图到底送出去几张”，不再靠肉眼猜。
      referenceImageCount: result.referenceImageCount || 0,
      forwardedImageCount: result.forwardedImageCount || 0,
      // 转存了几张 / 失败几张，验收脚本和排查都能直接看到，不用猜。
      preservedImageCount: preserved.stored,
      preserveFailedCount: preserved.failed,
      credits: billingSummary(billing),
      warnings: [
        ...(result.warnings || []),
        ...(preserved.failed ? [`有 ${preserved.failed} 张图没能存进素材库，用的是临时链接，24 小时后可能失效。`] : []),
      ],
    })
  }

  if (req.method === 'POST' && url.pathname === '/api/ai/image/describe-region') {
    const body = await readJson(req)
    const result = await describeImageRegion(body)
    return sendJson(res, 200, {
      description: result.description,
      // 新增多候选：老前端只读 description 仍可正常工作。
      candidates: Array.isArray(result.candidates) && result.candidates.length ? result.candidates : [result.description],
      provider: result.provider,
      model: result.model,
    })
  }

  if (req.method === 'POST' && url.pathname === '/api/ai/video/generate') {
    const body = await readJson(req)
    await guardPromptFields(currentUser, body, ['prompt'])
    if (AUTH_MODE === 'server') {
      // 提交时扣费；提交失败当场退回，任务后来失败由查询接口退回。
      const { task, billing } = await runWithAbilityCharge(currentUser, {
        ability: 'video', provider: body.provider || 'agnes', model: body.model, count: 1, bizType: 'ai-video',
      }, async (billingInfo) => {
        const result = await generateAgnesVideo(body, { user: currentUser })
        const created = await createAiTask(currentUser, {
          taskType: 'video', provider: result.provider, providerTaskId: result.taskId, status: result.status,
          result: { duration: result.duration, referenceImageCount: result.referenceImageCount, billing: taskBilling(billingInfo) },
        })
        return { task: created, billing: billingInfo }
      })
      return sendJson(res, 202, { ok: true, ...task, taskId: task.id, credits: billingSummary(billing) })
    }
    const result = await generateAgnesVideo(body, { user: currentUser })
    return sendJson(res, 202, { ok: true, ...result })
  }

  if (req.method === 'POST' && url.pathname === '/api/ai/model3d/generate') {
    const body = await readJson(req)
    await guardPromptFields(currentUser, body, ['prompt'])
    if (AUTH_MODE === 'server') {
      const { task, billing } = await runWithAbilityCharge(currentUser, {
        ability: 'model3d', provider: 'hunyuan3d', model: body.edition === 'pro' ? 'pro' : 'rapid', count: 1, bizType: 'ai-model3d',
      }, async (billingInfo) => {
        const result = await submitHunyuan3dTask(body)
        const created = await createAiTask(currentUser, {
          taskType: 'model3d', provider: 'tencent-hunyuan3d', providerTaskId: result.taskId, status: result.status,
          result: { edition: result.edition, requestId: result.requestId, billing: taskBilling(billingInfo) },
        })
        return { task: created, billing: billingInfo }
      })
      return sendJson(res, 202, { ok: true, ...task, taskId: task.id, credits: billingSummary(billing) })
    }
    const result = await submitHunyuan3dTask(body)
    return sendJson(res, 202, { ok: true, provider: 'tencent-hunyuan3d', ...result })
  }

  if (req.method === 'GET' && url.pathname === '/api/ai/model3d/config') {
    const provider = mergedProviders().hunyuan3d || {}
    return sendJson(res, 200, {
      ok: true,
      enabled: provider.enabled !== false && providerUnifiedModelList(provider).some((model) => modelEnabled(provider, model)),
      disabledModels: provider.disabledModels || [],
      defaultEdition: provider.defaultEdition || 'rapid',
      editions: { rapid: provider.editions?.rapid !== false, pro: provider.editions?.pro !== false },
      resultFormats: ['GLB'],
    })
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/ai/model3d/tasks/')) {
    const taskId = decodeURIComponent(url.pathname.split('/').pop() || '')
    if (AUTH_MODE === 'server') {
      let task = await getOwnAiTask(currentUser, taskId, 'model3d')
      const result = await queryHunyuan3dTask(task.providerTaskId, task.result?.edition || 'rapid')
      if (result.status === 'fail') task = await settleFailedTask(currentUser, task, 'model3d')
      const saved = await updateOwnAiTask(currentUser, taskId, {
        status: result.status, errorMessage: result.errorMessage,
        result: { ...task.result, edition: result.edition, requestId: result.requestId },
      })
      return sendJson(res, 200, { ok: true, ...saved, taskId: saved.id })
    }
    const result = await queryHunyuan3dTask(taskId, url.searchParams.get('edition') || 'rapid')
    return sendJson(res, 200, { ok: true, provider: 'tencent-hunyuan3d', ...result })
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/ai/video/tasks/')) {
    const taskId = decodeURIComponent(url.pathname.split('/').pop() || '')
    if (AUTH_MODE === 'server') {
      let task = await getOwnAiTask(currentUser, taskId, 'video')
      const result = await getAgnesVideoTask(task.providerTaskId, task.provider)
      if (result.status === 'failed') task = await settleFailedTask(currentUser, task, 'video')
      const saved = await updateOwnAiTask(currentUser, taskId, {
        status: result.status, errorMessage: result.error,
        result: { ...task.result, duration: result.duration || task.result?.duration || '', videoReady: Boolean(result.videoUrl) },
      })
      return sendJson(res, 200, { ok: true, ...saved, taskId: saved.id, videoUrl: result.videoUrl || '' })
    }
    const result = await getAgnesVideoTask(taskId, url.searchParams.get('provider') || 'agnes')
    return sendJson(res, 200, { ok: true, ...result })
  }

  if (req.method === 'POST' && url.pathname === '/api/ai/audio/transcribe') {
    const body = await readJson(req)
    const result = await transcribeAudio(body)
    return sendJson(res, 200, { ok: true, ...result })
  }

  if (req.method === 'POST' && url.pathname === '/api/ai/prompt/optimize') {
    const body = await guardPromptFields(currentUser, await readJson(req), ['prompt'])
    const result = await optimizeImagePrompt(body)
    result.prompt = await guardAiOutput(currentUser, result.prompt)
    return sendJson(res, 200, { ok: true, ...result })
  }

  if (req.method === 'POST' && url.pathname === '/api/ai/canvas/assistant') {
    const body = await readJson(req)
    await guardPromptFields(currentUser, body, ['message'], 'chat')
    // 文字节点生成走专用链路（只产出正文，且真正把上游图片作为多模态内容发出去）。
    // 其余（assist）仍是原来的工作流 Agent。传入登录态是为了让 `/api/assets/<id>` 能被解析成图片。
    const result = body?.operation === 'generate-text'
      ? await runCanvasTextGeneration(body, { user: currentUser })
      : await runCanvasAssistant(body, { user: currentUser })
    return sendJson(res, 200, { ok: true, ...result })
  }

  if (req.method === 'POST' && url.pathname === '/api/ai/canvas/assistant-attachment') {
    const body = await readJson(req)
    const result = await parseCanvasAttachment(body)
    return sendJson(res, 200, { ok: true, ...result })
  }

  if (req.method === 'GET' && url.pathname === '/api/canvas/templates') {
    const result = await listCanvasTemplates(currentUser, {
      withGraph: url.searchParams.get('withGraph') === '1',
    })
    return sendJson(res, 200, { ok: true, ...result })
  }

  if (req.method === 'POST' && url.pathname === '/api/canvas/templates') {
    const template = await saveCanvasTemplate(currentUser, await readJson(req))
    return sendJson(res, 201, { ok: true, template })
  }

  const canvasTemplateMatch = url.pathname.match(/^\/api\/canvas\/templates\/([A-Za-z0-9_-]+)$/)
  if (canvasTemplateMatch && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, template: await getCanvasTemplate(currentUser, canvasTemplateMatch[1]) })
  }
  if (canvasTemplateMatch && req.method === 'PATCH') {
    const template = await saveCanvasTemplate(currentUser, await readJson(req), canvasTemplateMatch[1])
    return sendJson(res, 200, { ok: true, template })
  }
  if (canvasTemplateMatch && req.method === 'DELETE') {
    return sendJson(res, 200, { ok: true, ...await removeCanvasTemplate(currentUser, canvasTemplateMatch[1]) })
  }

  if (req.method === 'POST' && url.pathname === '/api/ai/course-document/parse') {
    const body = await readJson(req)
    const parsed = await parseCourseDocumentWithAi(body)
    return sendJson(res, 200, {
      ok: true,
      ...parsed,
      createdAt: new Date().toISOString(),
    })
  }

  if (req.method === 'POST' && url.pathname === '/api/report/generate') {
    const body = await readJson(req)
    await guardPromptFields(currentUser, body, ['instruction'])
    const report = await generateReportWithAgent({
      project: body.project || body,
      config: body.config || {},
      agentId: body.agentId || body.config?.agentId || '',
      form: body.form || {},
      mode: body.mode || 'full-report',
      page: body.page || null,
      instruction: body.instruction || '',
      reportDocument: body.reportDocument || '',
      reportOutline: body.reportOutline || [],
      selectedStyle: body.selectedStyle || null,
      flowKey: body.flowKey || '',
      difficulty: body.difficulty || body.config?.difficulty || '',
      provider: body.provider,
      model: body.model,
      maxTokens: body.maxTokens,
    })
    return sendJson(res, 200, report)
  }

  return sendJson(res, 404, { ok: false, message: '接口不存在' })
}

function validateProductionConfiguration() {
  if (process.env.NODE_ENV !== 'production') return
  const missing = []
  if (AUTH_MODE !== 'server') missing.push('AUTH_MODE=server')
  if (!isDatabaseConfigured()) missing.push('DATABASE_URL')
  if (process.env.SESSION_COOKIE_SECURE !== 'true') missing.push('SESSION_COOKIE_SECURE=true')
  if (!APP_ORIGIN || !APP_ORIGIN.startsWith('https://')) missing.push('HTTPS APP_ORIGIN')
  if (!String(process.env.AI_DATA_DIR || '').trim()) missing.push('AI_DATA_DIR')
  if (missing.length) throw new Error(`生产环境安全配置不完整：${missing.join('、')}`)
  // 服务只监听 127.0.0.1，正式环境一定是本机 Nginx 转发进来的：不开 TRUST_PROXY，所有访客都会被当成同一个 IP。
  if (process.env.TRUST_PROXY !== 'true') {
    console.warn('[config] 生产环境请在 server/.env 设置 TRUST_PROXY=true（前面是本机 Nginx 时）。不设置的话，所有访客都会被当成同一个 IP：登录保护可能把所有人一起锁住，访客限流也会互相影响。')
  }
}

validateProductionConfiguration()

configureGalleryRuntime({
  dataDir,
  models: () => Object.entries(mergedProviders()).flatMap(([key, provider]) => provider.apiKey
    ? availableProviderModels(provider, 'text').map((model) => ({ provider: key, model, label: `${provider.label} / ${model}`,
      configKey: createHash('sha256').update(`${provider.baseUrl}|${provider.apiKey}|${model}`).digest('hex') })) : []),
  call: async (rules, messages) => {
    const provider = mergedProviders()[rules.provider]
    if (!provider?.apiKey || !availableProviderModels(provider, 'text').includes(rules.model)) throw galleryError('所选审核模型已关闭或未配置。', 409)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), Math.max(500, Math.min(30000, Number(process.env.GALLERY_TIMEOUT_MS) || 30000)))
    try {
      // 审核请求只发送一次；超时后交人工，避免共享网关的重试造成重复计费。
      const response = await fetch(`${provider.baseUrl}/chat/completions`, { method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: rules.model, messages, temperature: 0.1, max_tokens: 1200, response_format: { type: 'json_object' } }) })
      if (!response.ok) throw galleryError('供应商请求失败。', response.status)
      const result = await response.json()
      return { json: extractJsonObjectSafe(result?.choices?.[0]?.message?.content || result?.output_text || ''), usage: result.usage || null }
    } catch (error) {
      const status = Number(error.statusCode || error.status)
      throw galleryError(status === 429 ? '审核模型请求过于频繁，请稍后重试。' : status === 402 ? '审核供应商余额不足，请管理员检查账户。' : error.name === 'AbortError' ? '图片审核超时，已转人工复核，不自动重复计费。' : '图片审核调用失败，请检查模型视觉能力和供应商配置。', 502)
    } finally { clearTimeout(timeout) }
  },
})

const artworkEditor = createArtworkEditor({
  dataDir,
  getProviders: mergedProviders,
  availableModels: (provider) => availableProviderModels(provider, 'image'),
  requireModelEnabled,
})

const h5LayoutService = createH5LayoutService({
  timeoutMs: process.env.H5_LAYOUT_TIMEOUT_MS,
  readConfig: readH5ReportConfig, readDraft: readH5ReportDraftConfig,
  saveConfig: writeH5ReportConfig, saveDraft: writeH5ReportDraftConfig,
  normalizeTemplate: normalizeH5Template, generate: generateTextJson,
  findSaved(token, user) {
    if (!token) return null
    const saved = readH5Reports().find(report => report.generationToken === token && report.ownerUserId === (user?.id || 'demo-student') && report.layoutSnapshot)
    return saved ? { generationToken: token, projectId: saved.projectId, difficulty: saved.difficulty, templateId: saved.h5TemplateId, templateSnapshot: saved.templateSnapshot, layout: saved.layoutSnapshot, pages: saved.pages } : null
  },
  checkTemplateMedia: checkH5TemplateMedia,
  async checkProjectMedia(design, user) {
    for (const src of new Set(design.pages.flatMap(page => [page.backgroundImage, ...page.elements.filter(item => item.type === 'image').map(item => item.src)]))) {
      checkH5VisualMedia(src, user)
      const match = src?.match(/^\/api\/assets\/([A-Za-z0-9_-]+)$/)
      if (match && AUTH_MODE === 'server') { const asset = await getAccessibleAsset(user, match[1], dataDir); if (asset.owner_user_id !== user.id) throw Object.assign(new Error('项目引用了非本人作品，请重新选择自己的素材'), { statusCode: 403 }) }
    }
  },
  readPending() { const file = join(dataDir, 'h5-layout-pending.json'); return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [] },
  savePending(entries) { ensureDataDir(); writeFileSync(join(dataDir, 'h5-layout-pending.json'), JSON.stringify(entries), 'utf8') },
  async ownProject(body, user) {
    if (AUTH_MODE !== 'server') return body.project || {}
    const documents = await listOwnDocuments(user)
    const candidates = documents.filter(item => ['project', 'draft'].includes(item.type))
    const document = body.projectDocumentId
      ? candidates.find(item => item.id === body.projectDocumentId && (!body.projectId || item.data?.id === body.projectId || item.resourceKey === body.projectId))
      : candidates.find(item => item.data?.id === body.projectId || item.resourceKey === body.projectId)
    if (!document) throw Object.assign(new Error('未找到当前项目，请先保存创作资料后再生成报告'), { statusCode: 404 })
    return { ...document.data, studentName: user.name || user.displayName || document.data.studentName || '小画家' }
  },
  async sampleProjects(user) {
    if (AUTH_MODE !== 'server') return []
    const students = (await listAccessibleStudents(user)).slice(0, 20), samples = []
    for (const student of students) {
      const documents = await listStudentDocuments(user, student.id, 'project')
      for (const document of documents.slice(0, 5)) samples.push({ id: `${student.id}:${document.id}`, title: document.title || '未命名项目', studentName: student.name })
    }
    return samples
  },
  async sampleProject(id, user) {
    const [studentId, documentId] = String(id || '').split(':')
    if (AUTH_MODE !== 'server' || !studentId || !documentId) throw Object.assign(new Error('样例项目不存在'), { statusCode: 404 })
    const document = await getStudentDocument(user, studentId, documentId)
    if (document.type !== 'project') throw Object.assign(new Error('请选择已保存的创作项目'), { statusCode: 400 })
    return document.data
  },
})

const server = http.createServer((req, res) => {
  // 数据看板的「接口可用率」：每个 /api 请求结束时计数。
  res.on('finish', () => trackRequest(req, res.statusCode))
  route(req, res).catch((error) => {
    const status = Number(error?.statusCode) || 500
    // 程序或数据库的意外错误：详细原因只写进日志和后台「异常管理」，不把表名、路径等内部信息返回给用户。
    const unexpected = isUnexpectedError(error)
    if (status >= 500) {
      console.error(`[error] ${req.method} ${String(req.url || '').split('?')[0]} -> ${status}:`, error?.stack || error)
      // 生成类接口的 5xx 基本都是上游 AI 服务的问题，归到「AI 调用失败」。
      const aiPath = /^\/api\/(ai\/|agent\/|ai-skills\/|h5-report\/|student\/|report\/|canvas\/)/.test(String(req.url || ''))
      recordAppError({ req, error, status, user: req.authUser, kind: aiPath || error?.diagnostic ? 'ai' : 'server' })
    }
    // 已经开始输出（例如流式回复中途出错）时不能再写响应头，否则会抛错导致整个服务退出。
    if (res.headersSent) {
      if (!res.writableEnded) res.end()
      return
    }
    try {
      sendJson(res, status, {
        ok: false,
        message: unexpected ? '服务器开小差了，请稍后再试；如果一直这样，请联系管理员。' : (error.message || '服务暂时不可用，请稍后再试。'),
        data: unexpected ? null : (error?.data || null),
        // 排查信息只给后台管理接口。
        diagnostic: String(req.url || '').startsWith('/api/admin/') ? (error?.diagnostic || null) : null,
      })
    } catch (sendError) {
      console.error('[error] 错误响应发送失败：', sendError?.message || sendError)
    }
  })
})

// 某处异步操作忘了处理失败时，只记录不退出，避免一个请求的问题让所有人都用不了。
process.on('unhandledRejection', (reason) => {
  console.error('[error] 未处理的异步错误：', reason?.stack || reason)
  recordAppError({ error: reason instanceof Error ? reason : new Error(String(reason)), status: 500 })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`AI backend gateway running at http://127.0.0.1:${PORT}`)
})
// 端口被占用时，Node 默认会让 error 事件无人接管 → 进程直接崩掉。
// 表现就是启动日志只剩前端那一行「VITE ready」，看起来像"后端没启动 / 启动不了"。
// 这里显式打出来，让启动器日志能直接说明原因，而不是静默消失。
server.on('error', (error) => {
  if (error && error.code === 'EADDRINUSE') {
    console.error(`[fatal] port ${PORT} is already in use. Stop the other process (or run scripts/stop-preview.ps1) and retry.`)
  } else {
    console.error('[fatal] backend server error:', error && error.message ? error.message : error)
  }
  process.exit(1)
})
const stopGalleryWorker = AUTH_MODE === 'server' && process.env.GALLERY_WORKER_ENABLED !== 'false' ? startGalleryWorker() : () => {}
server.on('close', stopGalleryWorker)
