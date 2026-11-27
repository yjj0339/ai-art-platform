import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { galleryStatusLabels } from '../utils/galleryRules'

export function useStudentGallery({ galleryStore, projectStore, userStore, submissionDialog, getSourceProject }) {
  const galleryBusy = ref(false), consentBusy = ref(false)
  const message = error => error?.response?.data?.message || error?.message || '操作失败，请稍后重试。'
  const galleryStatusLabel = item => galleryStore.statusLabel(item.projectId, !!item.finalVersionId)
  const isGalleryPublished = item => { const work = galleryStore.ownWork(item.projectId); return work?.status === 'published' || !!work?.previousPublished }
  async function initializeGallery() {
    if (galleryStore.serverMode) { try { await galleryStore.loadOwnWorks() } catch (error) { ElMessage.error(message(error)) } }
    else if (galleryStore.settings.autoSelect && galleryStore.autoSelectConsent) projectStore.projects.forEach(project => galleryStore.autoSelectProject(project, userStore.user))
  }
  async function toggleAutoSelectConsent(value) {
    consentBusy.value = true
    try {
      if (value) await ElMessageBox.confirm('允许系统在你保存最终绘画作品后，将作品图片和说明发送给机构配置的审核服务，并将入选作品公开到平台广场。你可以随时关闭或撤回单件作品。', '参与系统精选', { confirmButtonText: '允许参与', cancelButtonText: '暂不参与' })
      await galleryStore.setAutoSelectConsent(value)
      if (!galleryStore.serverMode && value) projectStore.projects.forEach(project => galleryStore.autoSelectProject(project, userStore.user))
      ElMessage.success(value ? '已允许后续最终作品参与系统精选' : '已关闭后续自动精选；已上架作品可逐件撤回')
    } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(message(error)) } finally { consentBusy.value = false }
  }
  function openSubmissionDialog(item) {
    Object.assign(submissionDialog, { item, title: String(item.title || '').slice(0, 30), description: String(item.description || item.prompt || '').slice(0, 200), acceptPublication: false, open: true })
  }
  async function submitPortfolioArtwork() {
    if (galleryBusy.value) return
    if (!submissionDialog.item || !submissionDialog.title.trim()) return ElMessage.warning('请填写作品名称')
    if (!submissionDialog.acceptPublication) return ElMessage.warning('请先确认公开展示说明')
    galleryBusy.value = true
    try {
      await projectStore.flushServerWrites(true)
      const project = getSourceProject(submissionDialog.item.projectId)
      const result = await galleryStore.submitProject(project, userStore.user, { title: submissionDialog.title.trim(), description: submissionDialog.description.trim(), source: '用户投稿', acceptPublication: true })
      submissionDialog.open = false
      if (result.passed) ElMessage.success(result.existed ? '当前版本已经上架' : '作品已上架')
      else ElMessage.info(result.status ? `提交成功：${galleryStatusLabels[result.status] || '待审核'}` : result.work?.auditReason || '已提交审核')
    } catch (error) { ElMessage.error(message(error)) } finally { galleryBusy.value = false }
  }
  async function withdrawArtwork(item) {
    const work = galleryStore.ownWork(item.projectId)
    if (!work) return
    try {
      await ElMessageBox.confirm('撤回后将停止本作品的审核并从广场移除，个人素材会保留。', '撤回广场作品', { confirmButtonText: '确认撤回', cancelButtonText: '取消' })
      await galleryStore.withdraw(work.id)
      ElMessage.success('作品已撤回')
    } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(message(error)) }
  }
  async function withdrawSelected() {
    try {
      await ElMessageBox.confirm('将关闭后续自动精选，并撤回系统精选的作品；你主动投稿的作品不受影响。', '撤下已精选作品', { confirmButtonText: '确认撤下', cancelButtonText: '取消' })
      await galleryStore.setAutoSelectConsent(false, true)
      ElMessage.success('已关闭精选并撤回系统精选作品')
    } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(message(error)) }
  }
  return { galleryBusy, consentBusy, galleryStatusLabel, isGalleryPublished, initializeGallery, toggleAutoSelectConsent, openSubmissionDialog, submitPortfolioArtwork, withdrawArtwork, withdrawSelected }
}
