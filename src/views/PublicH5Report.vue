<template>
  <main class="public-report-page">
    <section v-if="loading" class="public-state"><b>H5</b><h1>正在打开创作报告…</h1></section>
    <section v-else-if="error" class="public-state error"><b>!</b><h1>这份报告暂时无法查看</h1><p>{{ error }}</p></section>
    <template v-else>
      <header class="public-report-header"><div><strong>{{ report.title }}</strong><span>已通过平台审核 · {{ report.studentName || '用户创作报告' }}</span></div><button type="button" @click="copyShare">转发报告</button></header>
      <H5PageImageViewer v-if="report.pageImages?.length" :images="report.pageImages" />
      <H5ReportRenderer v-else v-model="pageIndex" :template="report.templateSnapshot" :layout-snapshot="report.layoutSnapshot" :pages="report.pages" device="phone" :student-name="report.studentName" :edition-label="editionLabel" :show-actions="true" @like="likeReport" @comment="showComment = true" @download="downloadNotice" @official="openOfficial" />
      <p class="public-report-meta">{{ report.likes || 0 }} 人点赞 · 发布于 {{ formatDate(report.publishedAt) }}</p>
      <div v-if="showComment" class="comment-overlay" @click.self="showComment = false"><section><h2>写一句评语</h2><textarea v-model="comment" maxlength="120" placeholder="告诉小画家你喜欢作品的哪里"></textarea><div><button type="button" @click="showComment = false">取消</button><button type="button" class="primary" @click="submitComment">提交评语</button></div></section></div>
    </template>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import H5ReportRenderer from '../components/H5ReportRenderer.vue'
import H5PageImageViewer from '../components/H5PageImageViewer.vue'
import { apiClient } from '../services/apiClient'

const route = useRoute()
const loading = ref(true)
const error = ref('')
const report = ref({})
const pageIndex = ref(0)
const showComment = ref(false)
const comment = ref('')
const editionLabel = computed(() => ({ junior: '初级版', starter: '入门版', advanced: '进阶版', pro: '高级版' }[report.value.difficulty] || '用户版'))

onMounted(async () => {
  try {
    const response = await apiClient.get(`/public/h5-reports/${encodeURIComponent(route.params.token)}`)
    report.value = response.data.report
  } catch (requestError) {
    error.value = requestError?.response?.data?.message || '报告可能尚未通过审核，或分享链接已经失效。'
  } finally { loading.value = false }
})
async function likeReport() {
  try {
    const response = await apiClient.post(`/public/h5-reports/${encodeURIComponent(route.params.token)}/like`)
    report.value.likes = response.data.likes
  } catch { ElMessage.warning('点赞暂未成功，请稍后再试') }
}
async function submitComment() {
  if (!comment.value.trim()) return
  try {
    await apiClient.post(`/public/h5-reports/${encodeURIComponent(route.params.token)}/comments`, { content: comment.value.trim() })
    comment.value = ''
    showComment.value = false
    ElMessage.success('评语已提交')
  } catch { ElMessage.warning('评语暂未提交，请稍后再试') }
}
async function copyShare() {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard-unavailable')
    await navigator.clipboard.writeText(window.location.href)
    ElMessage.success('分享链接已复制')
  } catch { ElMessage.info('请使用浏览器的分享功能转发当前页面') }
}
function downloadNotice() { window.print() }
function openOfficial() { const url = report.value.templateSnapshot?.officialUrl; if (/^https?:\/\//i.test(url || '')) window.open(url, '_blank', 'noopener') }
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '刚刚' : date.toLocaleDateString('zh-CN') }
</script>

<style scoped>
.public-report-page { min-height: 100vh; padding: 20px; background: #edf4fb; }
.public-report-header { width: min(100%, 430px); min-height: 66px; margin: 0 auto 14px; padding: 0 6px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }.public-report-header strong,.public-report-header span { display: block; }.public-report-header strong { color: #17315f; font-size: 18px; }.public-report-header span { margin-top: 4px; color: #718198; font-size: 12px; }.public-report-header button { min-height: 38px; border: 1px solid #bcd2ef; border-radius: 999px; padding: 0 14px; background: #fff; color: #176ad7; font-weight: 800; }
.public-report-page :deep(.report-renderer) { max-width: 430px; margin: auto; }.public-report-meta { color: #70809a; text-align: center; font-size: 12px; }
.public-state { min-height: 80vh; display: grid; place-items: center; align-content: center; text-align: center; }.public-state b { display: grid; width: 64px; height: 64px; place-items: center; border-radius: 20px; background: #1677ff; color: #fff; font-size: 24px; }.public-state p { color: #718198; }.public-state.error b { background: #ef6a5b; }
.comment-overlay { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; padding: 20px; background: rgba(18, 36, 64, .45); }.comment-overlay section { width: min(100%, 410px); border-radius: 18px; padding: 22px; background: #fff; box-shadow: 0 22px 70px rgba(16, 41, 79, .25); }.comment-overlay textarea { width: 100%; min-height: 110px; box-sizing: border-box; border: 1px solid #dbe5f2; border-radius: 12px; padding: 12px; resize: vertical; }.comment-overlay div { margin-top: 12px; display: flex; justify-content: flex-end; gap: 8px; }.comment-overlay button { min-height: 38px; border: 1px solid #d3deec; border-radius: 10px; padding: 0 14px; background: #fff; }.comment-overlay .primary { border-color: #1677ff; background: #1677ff; color: #fff; }
@media (max-width: 520px) { .public-report-page { padding: 10px; }.public-report-header { padding: 0 4px; } }
</style>
