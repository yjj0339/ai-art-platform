<template>
  <main class="student-skill-page">
    <header class="runner-topbar">
      <button type="button" @click="goBack"><ArrowLeft />返回{{ skill?.skillType === 'video' ? 'AI视频' : 'AI绘画' }}</button>
      <div><strong>{{ skill?.title || 'AI玩法' }}</strong><span v-if="skill">{{ skill.skillType === 'video' ? '视频玩法' : '图像玩法' }}</span></div>
      <button type="button" :disabled="running" @click="resetValues"><RefreshLeft />重新填写</button>
    </header>

    <section v-if="loading" class="runner-state"><Loading class="loading-icon" />正在加载玩法配置…</section>
    <section v-else-if="loadError" class="runner-state error"><WarningFilled />{{ loadError }}<button type="button" @click="loadSkill">重新加载</button></section>
    <section v-else-if="skill" class="runner-shell">
      <aside class="skill-intro">
        <div class="intro-cover" :style="coverStyle"><VideoCamera v-if="skill.skillType === 'video'" /><Picture v-else /></div>
        <span>{{ skill.configuration?.presentation?.badge || '技能玩法' }}</span>
        <h1>{{ skill.title }}</h1>
        <p>{{ skill.summary || '按照页面提示填写内容，然后开始生成。' }}</p>
        <dl><div><dt>生成模型</dt><dd>{{ providerLabel }}</dd></div><div><dt>每日限额</dt><dd>{{ dailyLimitLabel }}</dd></div><div><dt>发布版本</dt><dd>{{ skill.publishedVersionId ? '已锁定' : '--' }}</dd></div></dl>
        <small><Lock />模型、隐藏提示词和工作流由讲师配置，用户无法修改。</small>
      </aside>
      <section class="runtime-card">
        <AiSkillStudentPage
          :title="skill.title"
          :summary="skill.summary"
          :skill-type="skill.skillType"
          :blocks="blocks"
          :values="values"
          :result="result"
          :error="runError"
          :running="running"
          @update:values="values = $event"
          @run="runSkill"
        />
      </section>
    </section>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Loading, Lock, Picture, RefreshLeft, VideoCamera, WarningFilled } from '@element-plus/icons-vue'
import AiSkillStudentPage from '../components/AiSkillStudentPage.vue'
import { listStudentAiSkills, runStudentAiSkill } from '../services/aiSkillGateway'
import { getVideoTask } from '../services/aiGateway'

const route = useRoute(); const router = useRouter(); const skill = ref(null); const loading = ref(true); const loadError = ref(''); const running = ref(false); const runError = ref(''); const values = ref({}); const result = ref(null)
let pollTimer = null
const blocks = computed(() => skill.value?.configuration?.studentPage?.blocks || [])
const coverStyle = computed(() => skill.value?.configuration?.presentation?.coverUrl ? { backgroundImage: `url("${skill.value.configuration.presentation.coverUrl}")` } : {})
const providerLabel = computed(() => ({ agnes: 'Agnes', volcengine: '火山引擎' })[skill.value?.configuration?.runtime?.provider || skill.value?.configuration?.generation?.provider] || '后台默认模型')
const dailyLimitLabel = computed(() => skill.value?.configuration?.limits?.dailyLimit ? `每天 ${skill.value.configuration.limits.dailyLimit} 次` : '不限')
const taskStorageKey = computed(() => `ai-skill-active-task:${route.params.skillId}`)

function errorMessage(error, fallback) { return error?.response?.data?.message || error?.message || fallback }
function goBack() { router.push(skill.value?.skillType === 'video' ? '/student/video' : '/student/paint') }
function resetValues() { values.value = defaultValues(); result.value = null; runError.value = ''; localStorage.removeItem(taskStorageKey.value) }
function defaultValues() { return Object.fromEntries(blocks.value.filter((block) => block.key).map((block) => [block.key, block.defaultValue ?? (block.type === 'switch' ? false : '')])) }

async function loadSkill() {
  loading.value = true; loadError.value = ''
  try {
    const skills = await listStudentAiSkills()
    skill.value = skills.find((item) => item.id === route.params.skillId) || null
    if (!skill.value) throw new Error('玩法不存在、已下线或当前账号不可使用')
    values.value = defaultValues()
    const stored = JSON.parse(localStorage.getItem(taskStorageKey.value) || 'null')
    if (stored?.taskId && skill.value.skillType === 'video') { result.value = stored; running.value = true; await pollVideo(stored) }
  } catch (error) { loadError.value = errorMessage(error, '玩法加载失败') } finally { loading.value = false }
}

function validateValues() {
  const missing = blocks.value.find((block) => block.required && (!values.value[block.key] || (Array.isArray(values.value[block.key]) && !values.value[block.key].length)))
  if (missing) throw new Error(`请填写${missing.label}`)
}

async function runSkill() {
  runError.value = ''; result.value = null
  try {
    validateValues(); running.value = true
    const response = await runStudentAiSkill(skill.value.id, values.value)
    if (skill.value.skillType === 'image') {
      result.value = { ...response, status: 'succeeded' }
      ElMessage.success('图片生成完成')
      return
    }
    const task = { taskId: response.taskId, provider: response.provider || 'agnes', status: response.status || 'queued' }
    result.value = task; localStorage.setItem(taskStorageKey.value, JSON.stringify(task)); await pollVideo(task)
  } catch (error) { runError.value = errorMessage(error, '生成失败，请稍后重试') } finally { if (skill.value?.skillType === 'image' || runError.value) running.value = false }
}

async function pollVideo(task) {
  try {
    const current = await getVideoTask(task.taskId, task.provider || 'agnes')
    result.value = { ...task, ...current }
    localStorage.setItem(taskStorageKey.value, JSON.stringify(result.value))
    if (current.status === 'succeeded') { running.value = false; localStorage.removeItem(taskStorageKey.value); ElMessage.success('视频生成完成'); return }
    if (current.status === 'failed') throw new Error(current.error || '视频生成失败')
    pollTimer = window.setTimeout(() => pollVideo(result.value), 5000)
  } catch (error) { running.value = false; runError.value = errorMessage(error, '视频任务查询失败'); localStorage.removeItem(taskStorageKey.value) }
}

onMounted(loadSkill)
onBeforeUnmount(() => { if (pollTimer) window.clearTimeout(pollTimer) })
</script>

<style scoped>
.student-skill-page{min-height: calc(100vh - var(--app-top, 0px));background:#f5f6fa;color:#172038}.runner-topbar{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;border-bottom:1px solid #e4e7ee;background:#fff;padding:14px 28px}.runner-topbar button{display:inline-flex;width:max-content;align-items:center;gap:7px;border:1px solid #dfe3eb;border-radius:9px;background:#fff;color:#536078;padding:8px 12px;font:inherit;cursor:pointer}.runner-topbar button:last-child{justify-self:end}.runner-topbar svg{width:17px}.runner-topbar>div{display:flex;align-items:center;gap:9px}.runner-topbar span{border-radius:99px;background:#eeebff;color:#6549e6;padding:4px 8px;font-size:11px}.runner-shell{display:grid;grid-template-columns:280px minmax(0,920px);justify-content:center;gap:22px;padding:28px}.skill-intro,.runtime-card{border:1px solid #e1e5ed;border-radius:16px;background:#fff;box-shadow:0 10px 30px rgba(30,40,72,.05)}.skill-intro{align-self:start;overflow:hidden;padding:14px}.intro-cover{display:flex;height:auto;aspect-ratio:3/1;align-items:center;justify-content:center;border-radius:11px;background:#eef1f6;background-size:cover;background-position:center;color:#7356ec}.intro-cover svg{width:42px}.skill-intro>span{display:inline-block;margin-top:16px;border-radius:99px;background:#f0edff;color:#674ce6;padding:4px 9px;font-size:11px}.skill-intro h1{margin:10px 0 7px;font-size:23px}.skill-intro p{margin:0;color:#737f96;font-size:13px;line-height:1.65}.skill-intro dl{display:grid;gap:10px;margin:20px 0;border-top:1px solid #eceef3;border-bottom:1px solid #eceef3;padding:16px 0}.skill-intro dl div{display:flex;justify-content:space-between}.skill-intro dt{color:#8a94a7}.skill-intro dd{margin:0;font-weight:700}.skill-intro>small{display:flex;gap:7px;color:#8a94a7;line-height:1.5}.skill-intro>small svg{width:16px;flex:0 0 auto}.runtime-card{padding:28px}.runner-state{display:flex;min-height:500px;align-items:center;justify-content:center;gap:10px;flex-direction:column;color:#7f8a9e}.runner-state svg{width:28px}.runner-state button{border:1px solid #dfe3eb;border-radius:8px;background:#fff;padding:8px 12px}.runner-state.error{color:#bf4a4a}.loading-icon{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:860px){.runner-shell{grid-template-columns:1fr;padding:16px}.skill-intro{display:none}.runtime-card{padding:18px}.runner-topbar{grid-template-columns:1fr auto;padding:12px 14px}.runner-topbar>div{display:none}}
</style>
