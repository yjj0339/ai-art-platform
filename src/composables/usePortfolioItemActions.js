// 素材库「单个素材」的三个动作：下载 / 改名 / 删除。
//
// 为什么单独一层：批量操作（usePortfolioBatch）是「先勾选再统一执行」，
// 单个素材是「卡片右上角三个点 → 点一下就做」。两条路径必须落到同一份数据上，
// 所以这里复用批量那套 store 方法（bulkDeleteMaterials / bulkRenameMaterials）
// 和同一份下载解析（resolveMaterialFile），避免同名素材在两处行为不一致。
import { ElMessage } from 'element-plus'
import { useProjectStore } from '../stores/projectStore'
import { apiClient } from '../services/apiClient'
import { KIND_LABELS, RENAMEABLE_KINDS, resolveMaterialFile, downloadBlob } from './usePortfolioBatch'

const SERVER_AUTH_MODE = import.meta.env.VITE_AUTH_MODE === 'server'
const SKETCH_LOCAL_KEY = 'ai-sketchpad-local-v1'

export function usePortfolioItemActions(options = {}) {
  const projectStore = useProjectStore()

  /** 能否改名：与「批量重命名」保持同一份白名单，避免两处能力不一致 */
  function canRename(item) {
    return Boolean(item) && RENAMEABLE_KINDS.includes(item.kind)
  }

  /**
   * 能否删除：
   * - 项目 / 图像版本 / 视频 / 文本 / 3D / 报告：都能删（走 store）
   * - 手绘稿：能删（删 document，本地模式清本地缓存）
   * - 无限画布：仅服务端模式能删；本地模式那份画布是画布自动保存的唯一副本，
   *   在素材库里删掉会让用户丢掉正在画的东西，因此拦下并提示。
   */
  function canDelete(item) {
    if (!item) return false
    if (item.kind === 'canvas') return SERVER_AUTH_MODE
    return true
  }

  function deleteBlockedReason(item) {
    if (item?.kind === 'canvas' && !SERVER_AUTH_MODE) return '本地模式的画布请进入画布后清空，暂不支持在这里删除'
    return ''
  }

  function entryOf(item) {
    return {
      projectId: item.projectId,
      kind: item.kind,
      itemId: item.id,
      versionId: item.versionId || '',
      versionIndex: item.versionIndex,
    }
  }

  async function download(item) {
    try {
      const file = await resolveMaterialFile(item)
      if (!file) {
        ElMessage.warning(`「${item.title}」没有可下载的文件`)
        return false
      }
      downloadBlob(file.blob, file.name)
      ElMessage.success(`已开始下载 ${file.name}`)
      return true
    } catch (error) {
      ElMessage.error(`下载失败：${error?.message || '请稍后重试'}`)
      return false
    }
  }

  async function rename(item, title) {
    const next = String(title || '').trim()
    if (!next) {
      ElMessage.warning('名称不能为空')
      return false
    }
    if (next === item.title) return true
    if (!canRename(item)) {
      ElMessage.warning(`${KIND_LABELS[item.kind] || '该类型'}暂不支持改名`)
      return false
    }
    const renamed = projectStore.bulkRenameMaterials([{ ...entryOf(item), title: next }])
    if (!renamed) {
      ElMessage.error('改名失败，请刷新后重试')
      return false
    }
    ElMessage.success(`已改名为「${next}」`)
    options.onApplied?.()
    return true
  }

  async function remove(item) {
    if (!canDelete(item)) {
      ElMessage.warning(deleteBlockedReason(item) || '这件素材暂不支持删除')
      return false
    }
    try {
      if (item.kind === 'sketch') {
        const done = await removeSketchDocument(item)
        if (done) finishRemove(item)
        return done
      }
      if (item.kind === 'canvas') {
        const done = await removeCanvasDocument(item)
        if (done) finishRemove(item)
        return done
      }
      // 图像/视频/文本/3D/报告：走 store 的素材删除（删到最后一张时连带项目一起移除）
      let removed = projectStore.bulkDeleteMaterials([entryOf(item)])
      // 工作台那种「整张项目卡片」没有版本号，store 里匹配不到版本，
      // 这时把它当作「删整个项目」处理，否则点了删除没反应。
      if (!removed && item.kind === 'project' && !item.versionId && item.versionIndex === undefined) {
        projectStore.deleteProject(item.projectId)
        removed = 1
      }
      if (!removed) {
        ElMessage.error('删除失败，请刷新后重试')
        return false
      }
      finishRemove(item)
      return true
    } catch (error) {
      ElMessage.error(`删除失败：${error?.message || '请稍后重试'}`)
      return false
    }
  }

  function finishRemove(item) {
    ElMessage.success(`已删除「${item.title}」`)
    options.onApplied?.()
  }

  async function removeSketchDocument(item) {
    if (!item.documentId) return false
    if (SERVER_AUTH_MODE) {
      await apiClient.delete(`/me/documents/${encodeURIComponent(item.documentId)}`)
      return true
    }
    try {
      const list = JSON.parse(window.localStorage.getItem(SKETCH_LOCAL_KEY) || '[]')
      const next = (Array.isArray(list) ? list : []).filter((entry) => entry.id !== item.documentId)
      window.localStorage.setItem(SKETCH_LOCAL_KEY, JSON.stringify(next))
      return true
    } catch {
      return false
    }
  }

  async function removeCanvasDocument(item) {
    if (!item.documentId) return false
    await apiClient.delete(`/me/documents/${encodeURIComponent(item.documentId)}`)
    return true
  }

  return { canRename, canDelete, deleteBlockedReason, download, rename, remove }
}
