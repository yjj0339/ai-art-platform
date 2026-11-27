// 素材库「批量操作」公共逻辑。
//
// 设计要点：
// 1. 两个入口（独立页 StudentPortfolio.vue / 工作台标签页 StudentWorkbench.vue）共用同一套逻辑与 UI 组件，
//    避免两份实现各自演化出不一致的行为。
// 2. 状态由调用方（父组件）持有，本 composable 通过 getter/setter 读写，保证父组件能渲染卡片勾选框。
// 3. 删除走「快照 + 可撤销」，不是硬删；重命名/下载遇到不支持的类型**自动跳过**而不是整批失败。
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import JSZip from 'jszip'
import { useProjectStore } from '../stores/projectStore'
import { apiClient } from '../services/apiClient'

const SERVER_AUTH_MODE = import.meta.env.VITE_AUTH_MODE === 'server'

/** 支持批量重命名的素材类型 */
export const RENAMEABLE_KINDS = ['project', 'video', 'text', 'model3d', 'report']
/** 支持批量下载的素材类型 */
export const DOWNLOADABLE_KINDS = ['project', 'video', 'text', 'model3d']

export const KIND_LABELS = {
  project: '图像',
  video: '视频',
  text: '文本',
  model3d: '3D作品',
  report: '创作报告',
  canvas: '无限画布',
}

export const PORTFOLIO_BATCH_ACTIONS = [
  { key: 'delete', label: '批量删除', desc: '移入回收站，可撤销', icon: 'Delete' },
  { key: 'rename', label: '批量重命名', desc: '前缀 + 序号，统一改名', icon: 'EditPen' },
  { key: 'download', label: '批量下载', desc: '打包为一个压缩包', icon: 'Download' },
  { key: 'submit', label: '批量投稿到作品广场', desc: '仅支持 AI 绘画作品', icon: 'Star', disabled: true, badge: '即将开放' },
]

/** 撤销提示条的存活时间 */
const UNDO_TTL = 10000

export function usePortfolioBatch(options = {}) {
  const projectStore = useProjectStore()
  const read = (source, fallback) => (typeof source === 'function' ? source() : source ?? fallback)

  const items = computed(() => read(options.items, []) || [])
  const selectedIds = computed(() => read(options.selectedIds, []) || [])
  const batchActive = computed(() => Boolean(read(options.active, false)))

  const menuOpen = ref(false)
  const action = ref('')
  const busy = ref(false)
  const renameDialog = reactive({ open: false, prefix: '', start: 1, pad: 2, keepOriginal: false })
  const undoBar = reactive({ visible: false, count: 0 })

  let undoTimer = null
  let undoPayload = null

  const actionMeta = computed(() => PORTFOLIO_BATCH_ACTIONS.find((entry) => entry.key === action.value) || null)
  const selectedItems = computed(() => items.value.filter((item) => selectedIds.value.includes(item.id)))
  const supportedKinds = computed(() => {
    if (action.value === 'rename') return RENAMEABLE_KINDS
    if (action.value === 'download') return DOWNLOADABLE_KINDS
    return null // delete：全类型支持
  })
  const supportedSelected = computed(() => {
    const allowed = supportedKinds.value
    return allowed ? selectedItems.value.filter((item) => allowed.includes(item.kind)) : selectedItems.value
  })
  const skippedSelected = computed(() => selectedItems.value.filter((item) => !supportedSelected.value.includes(item)))
  const allSelected = computed(() => items.value.length > 0 && selectedIds.value.length === items.value.length)
  const actionVerb = computed(() => (actionMeta.value?.label || '').replace('批量', ''))

  /** 被跳过项的类型汇总提示，例如「已自动跳过 2 项不支持重命名的素材（创作报告）」 */
  const skippedHint = computed(() => {
    if (!skippedSelected.value.length) return ''
    const kinds = [...new Set(skippedSelected.value.map((item) => KIND_LABELS[item.kind] || '该类型'))]
    return `已自动跳过 ${skippedSelected.value.length} 项不支持${actionVerb.value}的素材（${kinds.join('、')}）`
  })

  const renamePreview = computed(() => {
    const pad = clampPad(renameDialog.pad)
    const start = Number(renameDialog.start) || 1
    const sample = supportedSelected.value[0]
    const base = renameDialog.keepOriginal ? (sample?.title || '原名称') : (renameDialog.prefix || '')
    return `${base}${String(start).padStart(pad, '0')}`
  })

  function emitSelected(ids) {
    options.setSelectedIds?.(ids)
  }
  function emitActive(value) {
    options.setActive?.(value)
  }

  function toggleMenu() {
    if (batchActive.value) {
      exitBatch()
      return
    }
    menuOpen.value = !menuOpen.value
  }
  function closeMenu() {
    menuOpen.value = false
  }

  function chooseAction(key) {
    const meta = PORTFOLIO_BATCH_ACTIONS.find((entry) => entry.key === key)
    if (!meta || meta.disabled) return
    action.value = key
    emitActive(true)
    emitSelected([])
    menuOpen.value = false
  }

  function exitBatch() {
    emitActive(false)
    emitSelected([])
    action.value = ''
    menuOpen.value = false
  }

  function selectAll() {
    emitSelected(items.value.map((item) => item.id))
  }
  function clearSelection() {
    emitSelected([])
  }
  function toggleSelectAll() {
    if (allSelected.value) clearSelection()
    else selectAll()
  }

  async function runAction() {
    if (busy.value) return
    if (!selectedItems.value.length) {
      ElMessage.warning('请先勾选要处理的素材')
      return
    }
    if (action.value === 'delete') {
      await runDelete()
      return
    }
    if (!supportedSelected.value.length) {
      ElMessage.warning(`选中的 ${selectedItems.value.length} 项都不支持${actionVerb.value}`)
      return
    }
    if (action.value === 'rename') {
      renameDialog.prefix = ''
      renameDialog.start = 1
      renameDialog.pad = 2
      renameDialog.keepOriginal = false
      renameDialog.open = true
      return
    }
    if (action.value === 'download') await runDownload()
  }

  async function runDelete() {
    const targets = selectedItems.value
    const listHtml = targets.slice(0, 10)
      .map((item) => `<li><span>${escapeHtml(item.title)}</span><em>${KIND_LABELS[item.kind] || ''}</em></li>`)
      .join('')
    const moreHtml = targets.length > 10 ? `<li class="batch-confirm-more">…另有 ${targets.length - 10} 项</li>` : ''
    try {
      await ElMessageBox.confirm(
        `<p class="batch-confirm-tip">将删除 <strong>${targets.length}</strong> 项素材，删除后可在下方提示条中撤销。</p>`
        + `<ul class="batch-confirm-list">${listHtml}${moreHtml}</ul>`,
        '确认批量删除',
        {
          confirmButtonText: `删除 ${targets.length} 项`,
          cancelButtonText: '取消',
          type: 'warning',
          dangerouslyUseHTMLString: true,
          customClass: 'batch-confirm-box',
        },
      )
    } catch {
      return
    }

    busy.value = true
    try {
      const canvasDocs = read(options.getCanvas, []) || []
      const payload = {
        projects: JSON.parse(JSON.stringify(projectStore.projects)),
        canvas: JSON.parse(JSON.stringify(canvasDocs)),
        count: 0,
      }
      const canvasTargets = targets.filter((item) => item.kind === 'canvas')
      const materialTargets = targets.filter((item) => item.kind !== 'canvas')

      if (materialTargets.length) {
        payload.count += projectStore.bulkDeleteMaterials(materialTargets.map((item) => ({
          projectId: item.projectId,
          kind: item.kind,
          itemId: item.id,
          versionId: item.versionId || '',
          versionIndex: item.versionIndex,
        })))
      }
      if (canvasTargets.length) {
        const remaining = canvasDocs.filter((doc) => !canvasTargets.some((item) => item.documentId === doc.id))
        options.setCanvas?.(remaining)
        payload.count += canvasTargets.length
        if (SERVER_AUTH_MODE) {
          await Promise.all(canvasTargets.map((item) => (item.documentId
            ? apiClient.delete(`/me/documents/${item.documentId}`).catch(() => {})
            : Promise.resolve())))
        }
      }

      pushUndo(payload)
      ElMessage.success(`已删除 ${payload.count} 项素材`)
      exitBatch()
      options.onApplied?.()
    } finally {
      busy.value = false
    }
  }

  function applyRename() {
    const targets = supportedSelected.value
    const pad = clampPad(renameDialog.pad)
    let seq = Number(renameDialog.start) || 1
    const entries = targets.map((item) => {
      const title = renameDialog.keepOriginal
        ? `${item.title}-${String(seq).padStart(pad, '0')}`
        : `${renameDialog.prefix}${String(seq).padStart(pad, '0')}`
      seq += 1
      return {
        projectId: item.projectId,
        kind: item.kind,
        itemId: item.id,
        versionId: item.versionId || '',
        versionIndex: item.versionIndex,
        title,
      }
    })
    const renamed = projectStore.bulkRenameMaterials(entries)
    renameDialog.open = false
    if (!renamed) {
      ElMessage.warning('没有素材被重命名，请检查选择')
      return
    }
    ElMessage.success(`已重命名 ${renamed} 项素材`)
    exitBatch()
    options.onApplied?.()
  }

  async function runDownload() {
    const targets = supportedSelected.value
    busy.value = true
    try {
      const zip = new JSZip()
      const used = new Set()
      const failed = []
      let ok = 0
      for (const item of targets) {
        try {
          const entry = await resolveDownload(item)
          if (!entry) {
            failed.push(`${item.title}（没有可下载的文件）`)
            continue
          }
          let name = entry.name
          let suffix = 2
          while (used.has(name)) {
            name = entry.name.replace(/(\.[^.]+)?$/, (match) => `-${suffix}${match || ''}`)
            suffix += 1
          }
          used.add(name)
          zip.file(name, entry.blob)
          ok += 1
        } catch (error) {
          failed.push(`${item.title}（${error?.message || '读取失败'}）`)
        }
      }
      if (!ok) {
        ElMessage.error(failed[0] ? `下载失败：${failed[0]}` : '没有可下载的素材')
        return
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      triggerDownload(blob, `我的素材库-${timeStamp()}.zip`)
      if (failed.length) {
        ElMessage.warning(`已打包 ${ok} 项，${failed.length} 项跳过：${failed.slice(0, 2).join('；')}`)
      } else {
        ElMessage.success(`已打包下载 ${ok} 项素材`)
      }
      exitBatch()
      options.onApplied?.()
    } finally {
      busy.value = false
    }
  }

  // 单件素材的「下载」也走同一套解析逻辑（菜单组件通过 usePortfolioItemActions 复用），
  // 保证「批量打包」和「单件下载」拿到的文件、扩展名完全一致。
  function resolveDownload(item) {
    return resolveMaterialFile(item)
  }

  function pushUndo(payload) {
    undoPayload = payload
    undoBar.visible = true
    undoBar.count = payload.count
    clearTimeout(undoTimer)
    undoTimer = setTimeout(() => {
      undoBar.visible = false
      undoPayload = null
    }, UNDO_TTL)
  }

  async function undoDelete() {
    if (!undoPayload) return
    const payload = undoPayload
    undoBar.visible = false
    undoPayload = null
    clearTimeout(undoTimer)
    projectStore.restoreProjects(payload.projects)
    if (options.setCanvas) {
      options.setCanvas(payload.canvas)
      if (SERVER_AUTH_MODE) {
        await Promise.all(payload.canvas.map(async (doc) => {
          try {
            await apiClient.post('/me/documents', {
              type: 'canvas',
              resourceKey: doc.resourceKey || doc.id,
              title: doc.title,
              data: doc.data,
            })
          } catch {
            /* 恢复失败不阻断其它文档 */
          }
        }))
      }
    }
    ElMessage.success(`已撤销，恢复了 ${payload.count} 项素材`)
    options.onApplied?.()
  }

  function dismissUndo() {
    undoBar.visible = false
    undoPayload = null
    clearTimeout(undoTimer)
  }

  return {
    // 状态
    items,
    selectedIds,
    batchActive,
    menuOpen,
    action,
    actionMeta,
    actionVerb,
    busy,
    renameDialog,
    undoBar,
    // 派生
    selectedItems,
    supportedSelected,
    skippedSelected,
    skippedHint,
    allSelected,
    renamePreview,
    // 操作
    toggleMenu,
    closeMenu,
    chooseAction,
    exitBatch,
    selectAll,
    clearSelection,
    toggleSelectAll,
    runAction,
    applyRename,
    undoDelete,
    dismissUndo,
  }
}

/* ------------------------------ 工具函数 ------------------------------ */

/**
 * 把一件素材解析成「文件名 + Blob」。批量打包与单件下载共用，避免两个入口出来的文件不一致。
 * 返回 null 表示这件素材没有可下载的文件（例如只有纯 CSS 渐变封面又没有兜底图）。
 */
export async function resolveMaterialFile(item) {
  const base = safeFileName(item.title) || KIND_LABELS[item.kind] || '素材'
  if (item.kind === 'text') {
    const content = item.textContent || item.description || item.prompt || ''
    return { name: `${base}.txt`, blob: new Blob([content], { type: 'text/plain;charset=utf-8' }) }
  }
  const url = item.downloadUrl || extractUrl(item.cover)
  if (url) {
    const response = await fetch(url, { credentials: 'include' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = await response.blob()
    return { name: `${base}.${guessExtension(url, blob.type, item.kind)}`, blob }
  }
  // 兜底：占位封面是纯 CSS 渐变（Mock 数据常见），就地渲染成一张 PNG，避免「下载出来是空的」。
  if (String(item.cover || '').includes('gradient')) {
    const blob = await gradientToPng(item.cover)
    if (blob) return { name: `${base}.png`, blob }
  }
  return null
}

function clampPad(value) {
  return Math.min(4, Math.max(1, Number(value) || 1))
}

function extractUrl(cover = '') {
  const value = String(cover || '')
  if (!value) return ''
  if (value.startsWith('data:') || value.startsWith('http') || value.startsWith('/')) return value
  return value.match(/url\(["']?([^"')]+)["']?\)/)?.[1] || ''
}

function safeFileName(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function timeStamp() {
  const date = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
}

function guessExtension(url, mime = '', kind = '') {
  const type = String(mime || '').toLowerCase()
  if (type.includes('mp4')) return 'mp4'
  if (type.includes('webm')) return 'webm'
  if (type.includes('jpeg')) return 'jpg'
  if (type.includes('webp')) return 'webp'
  if (type.includes('gif')) return 'gif'
  if (type.includes('png')) return 'png'
  if (type.includes('plain')) return 'txt'
  if (!String(url).startsWith('data:')) {
    const match = String(url).match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i)
    if (match) return match[1].toLowerCase()
  }
  return kind === 'video' ? 'mp4' : 'png'
}

/**
 * 把 CSS linear-gradient 占位封面渲染成一张 PNG。
 * 纯前端实现，不依赖 html2canvas，避免为一张占位图引入重依赖。
 */
function gradientToPng(css) {
  return new Promise((resolve) => {
    try {
      const colors = String(css).match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)/g) || []
      const angleMatch = String(css).match(/(-?\d+(?:\.\d+)?)deg/)
      const angle = angleMatch ? Number(angleMatch[1]) : 135
      const size = 1024
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d')
      if (!context) {
        resolve(null)
        return
      }
      const palette = colors.length ? colors : ['#e8ecff', '#c9d4ff']
      const radians = ((angle - 90) * Math.PI) / 180
      const radius = size / 2
      const gradient = context.createLinearGradient(
        size / 2 - Math.cos(radians) * radius,
        size / 2 - Math.sin(radians) * radius,
        size / 2 + Math.cos(radians) * radius,
        size / 2 + Math.sin(radians) * radius,
      )
      palette.forEach((color, index) => {
        gradient.addColorStop(palette.length === 1 ? 0 : index / (palette.length - 1), color)
      })
      context.fillStyle = gradient
      context.fillRect(0, 0, size, size)
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    } catch {
      resolve(null)
    }
  })
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** 单件下载入口（菜单组件用），与批量打包同一套落盘方式 */
export function downloadBlob(blob, filename) {
  triggerDownload(blob, filename)
}
