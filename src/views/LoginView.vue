<template>
  <main class="login-page">
    <!-- 装饰动效层：只做轻微的呼吸感，不承载任何内容，也不吃鼠标事件 -->
    <div class="login-backdrop" aria-hidden="true">
      <span class="aya-hair-flow aya-hair-flow--front" />
      <span class="aya-hair-flow aya-hair-flow--back" />
      <span class="aya-eye-awake" />
      <span class="aya-stylus-energy" />
    </div>

    <header class="login-topbar">
      <div class="brand">
        <span class="brand-mark" :class="{ 'has-logo': Boolean(brandLogoUrl) }">
          <img v-if="brandLogoUrl" :src="brandLogoUrl" alt="机构 LOGO" />
          <template v-else>AI</template>
        </span>
        <strong>AI 创意设计思维平台</strong>
      </div>
      <p class="brand-slogan">创意设计 · AI 创作 · 思维表达</p>
    </header>

    <section class="login-card">
      <h1 class="login-card__title">登录工作台</h1>
      <p class="login-card__subtitle">选择身份</p>

      <div class="role-tabs" role="tablist" aria-label="选择登录身份">
        <button
          v-for="role in roleOptions"
          :key="role.id"
          class="role-tab-btn role-tab-slot"
          :class="{ active: form.role === role.id }"
          type="button"
          role="tab"
          :aria-selected="form.role === role.id"
          @click="selectRole(role.id)"
        >
          <span class="role-tab__label">{{ role.label }}</span>
        </button>
      </div>

      <!-- 小画家登录时直接选版本（入门版 / 高级版）；进去以后不再切换，想换版本就重新登录 -->
      <div v-if="form.role === 'student'" class="version-pick" role="radiogroup" aria-label="选择版本">
        <button
          v-for="item in difficultyList"
          :key="item.id"
          type="button"
          class="version-pick__item"
          :class="[`is-${item.id}`, { 'is-on': difficultyStore.current === item.id }]"
          role="radio"
          :aria-checked="difficultyStore.current === item.id"
          @click="selectStudentDifficulty(item.id)"
        >
          <span class="version-pick__icon" aria-hidden="true">
            <svg v-if="item.id === 'starter'" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#ffe3d3" /><circle cx="11.5" cy="13" r="2.4" fill="#ff8a5c" /><circle cx="17" cy="10.5" r="2.4" fill="#ffc94d" /><circle cx="21.5" cy="15" r="2.4" fill="#6fcf97" /><circle cx="19" cy="20.5" r="2.4" fill="#6c8cff" /><circle cx="12.5" cy="19.5" r="2.6" fill="#fff" /></svg>
            <svg v-else viewBox="0 0 32 32"><rect x="5" y="7" width="22" height="16" rx="3" fill="#e4e0ff" /><path d="M9 12h8M9 16h12M9 20h5" stroke="#6c5ce7" stroke-width="2" stroke-linecap="round" /><circle cx="22" cy="12" r="2" fill="#6c5ce7" /><path d="M12 26h8" stroke="#a49cf0" stroke-width="2" stroke-linecap="round" /></svg>
          </span>
          <span class="version-pick__text">
            <strong>{{ item.label }}</strong>
            <small>{{ item.hint }}</small>
          </span>
          <i class="version-pick__check" aria-hidden="true"></i>
        </button>
      </div>

      <el-form class="login-form" :model="form" label-position="top" @submit.prevent="handleLogin">
        <el-form-item :label="accountLabel">
          <el-input v-model="form.account" size="large" :placeholder="accountPlaceholder" />
        </el-form-item>
        <el-form-item v-if="isServerAuthMode" label="机构代码">
          <el-input v-model="form.organizationCode" size="large" placeholder="请输入机构代码，例如 demo-school" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" size="large" type="password" :placeholder="passwordPlaceholder" show-password />
        </el-form-item>
        <div class="login-options">
          <el-checkbox v-model="form.remember">记住我</el-checkbox>
          <button type="button">忘记密码</button>
        </div>
        <!-- 只走表单提交（点按钮和按回车都会触发 @submit）。以前按钮上又绑了 @click，点一次会登录两次：
             建两个会话，输错密码一次算两次失败（5 次的锁定点 3 下就到）。 -->
        <BaseButton type="submit" block :loading="loading">
          {{ loginButtonText }}<i class="btn-arrow" aria-hidden="true">→</i>
        </BaseButton>
      </el-form>

      <!-- 占位入口：头像/扫码登录尚未接入，保持隐藏，避免给出点了没反应的入口 -->
      <div class="quick-login">
        <button>头像快捷登录</button>
        <button>扫码登录占位</button>
      </div>
      <div v-if="isServerAuthMode" class="registration-entry">
        <span>首次使用平台？</span>
        <button type="button" @click="showRegisterDialog = true">使用邀请码注册</button>
      </div>

      <!-- append-to-body 必须保留：登录卡片的入场动画带 transform，
           会给弹窗的 position:fixed 造出错误包含块，矮窗口下弹窗被裁进卡片里、按钮点不到。 -->
      <el-dialog v-model="showRegisterDialog" title="使用邀请码注册" width="min(460px, 92vw)" align-center append-to-body class="registration-dialog">
        <p class="registration-dialog-tip">请向机构管理员索取邀请码。邀请码会自动确定你的机构、机构分部与身份。</p>
        <el-form class="registration-form" label-position="top" @submit.prevent="submitRegistration">
          <el-form-item label="邀请码"><el-input v-model="registerForm.code" placeholder="例如：JOIN-ABC123" /></el-form-item>
          <el-form-item label="姓名"><el-input v-model="registerForm.name" placeholder="请输入真实姓名" /></el-form-item>
          <el-form-item label="登录账号">
            <el-input
              :model-value="registerForm.account"
              placeholder="3-20 位字母或数字，例如手机号"
              @update:model-value="onRegisterAccountInput"
            />
            <p class="registration-field-tip">只能用字母和数字，可以直接填手机号；输入大写会自动转小写。</p>
          </el-form-item>
          <el-form-item label="设置密码"><el-input v-model="registerForm.password" type="password" show-password autocomplete="new-password" placeholder="至少 8 位" /></el-form-item>
          <el-form-item label="确认密码"><el-input v-model="registerForm.passwordConfirm" type="password" show-password autocomplete="new-password" placeholder="请再次输入密码" /></el-form-item>
        </el-form>
        <!-- 按钮放 footer 而不是表单内：footer 在滚动区之外，矮窗口下也永远可见可点。 -->
        <template #footer>
          <div class="registration-actions">
            <button type="button" class="registration-cancel" @click="showRegisterDialog = false">取消</button>
            <BaseButton :loading="registerLoading" @click="submitRegistration">完成注册</BaseButton>
          </div>
        </template>
      </el-dialog>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import BaseButton from '../components/base/BaseButton.vue'
import { difficultyList, useDifficultyStore } from '../stores/difficultyStore'
import { useUserStore } from '../stores/userStore'
import { apiClient } from '../services/apiClient'
import { getBrandLogo } from '../services/workbenchGateway'
import { accountFormatError, sanitizeAccountInput } from '../utils/accountRules'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const difficultyStore = useDifficultyStore()
const loading = ref(false)
const registerLoading = ref(false)
const showRegisterDialog = ref(false)
// 后台「工作台管理」配了 LOGO 就显示它，没配就还是内置那个「AI」方块。
const brandLogoUrl = ref('')
const roleOptions = [
  { id: 'student', label: '用户', icon: '画', defaultAccount: '小画家阿橙' },
  { id: 'teacher', label: '讲师', icon: '师', defaultAccount: '王讲师' },
  { id: 'admin', label: '管理员', icon: '管', defaultAccount: '管理员' },
]
const isServerAuthMode = import.meta.env.VITE_AUTH_MODE === 'server'
const defaultOrganizationCode = import.meta.env.VITE_ORGANIZATION_CODE || 'demo-school'

function defaultAccountForRole(role) {
  if (isServerAuthMode) return role === 'admin' ? 'admin' : ''
  return roleOptions.find((item) => item.id === role)?.defaultAccount || ''
}

const form = reactive({
  role: 'student',
  account: defaultAccountForRole('student'),
  organizationCode: defaultOrganizationCode,
  password: isServerAuthMode ? '' : '1234',
  remember: true,
})
const registerForm = reactive({ code: '', name: '', account: '', password: '', passwordConfirm: '' })
const accountLabel = computed(() => {
  const map = { student: '账号', teacher: '账号', admin: '账号' }
  return map[form.role]
})
const accountPlaceholder = computed(() => {
  const map = {
    student: '请输入用户名或账号',
    teacher: '请输入讲师姓名或账号',
    admin: '请输入管理员账号',
  }
  return map[form.role]
})
const loginButtonText = computed(() => {
  const map = {
    student: '进入用户工作台',
    teacher: '进入讲师工作台',
    admin: '进入管理员后台',
  }
  return map[form.role]
})
const passwordPlaceholder = computed(() => import.meta.env.VITE_AUTH_MODE === 'server' ? '请输入登录密码' : '演示模式下任意密码可登录')

function selectRole(role) {
  form.role = role
  form.account = defaultAccountForRole(role)
  if (isServerAuthMode) form.password = ''
}

function onRegisterAccountInput(value) {
  // 边打字边纠正：大写转小写、剔除中文和符号，避免用户填完才被服务端拒绝。
  registerForm.account = sanitizeAccountInput(value)
}

function selectStudentDifficulty(value) {
  selectRole('student')
  difficultyStore.setDifficulty(value)
}

onMounted(() => {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  if (redirect.startsWith('/teacher')) selectRole('teacher')
  if (redirect.startsWith('/admin')) selectRole('admin')
  // 不 await：LOGO 只是装饰，网络慢不该让登录按钮等它。
  getBrandLogo().then((url) => { brandLogoUrl.value = url })
})

async function handleLogin() {
  // 平板上连点两下也只发一次登录请求。
  if (loading.value) return
  if (!form.account.trim()) {
    ElMessage.warning(`请输入${accountLabel.value}`)
    return
  }
  if (isServerAuthMode && !form.organizationCode.trim()) {
    ElMessage.warning('请输入机构代码')
    return
  }
  loading.value = true
  try {
    await userStore.login({ account: form.account, password: form.password, organizationCode: form.organizationCode, difficulty: form.role === 'student' ? difficultyStore.current : '', role: form.role })
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message || '登录失败，请稍后重试')
    return
  } finally {
    loading.value = false
  }
  const homeMap = {
    student: '/student/workbench',
    teacher: '/teacher/workbench',
    admin: '/admin',
  }
  const rolePrefixMap = {
    student: '/student',
    teacher: '/teacher',
    admin: '/admin',
  }
  const activeRole = userStore.user?.role || form.role
  // 小画家登录后一律回主页：以前会按 redirect 回到上次停留的页面（比如登录过期前在 AI 绘画），
  // 用户反馈「登录进去立马变成 AI 创作页面，不是主页」。讲师 / 管理员仍可回到原来要去的页面。
  const redirect = activeRole !== 'student' && typeof route.query.redirect === 'string' && route.query.redirect.startsWith(rolePrefixMap[activeRole])
    ? route.query.redirect
    : ''
  ElMessage.success('登录成功')
  router.push(redirect || homeMap[activeRole])
}

async function submitRegistration() {
  const code = registerForm.code.trim()
  const name = registerForm.name.trim()
  const account = registerForm.account.trim()
  if (!code || !name || !account || !registerForm.password) {
    ElMessage.warning('请完整填写邀请码、姓名、账号和密码。')
    return
  }
  const accountMessage = accountFormatError(account)
  if (accountMessage) {
    ElMessage.warning(accountMessage)
    return
  }
  if (registerForm.password.length < 8) {
    ElMessage.warning('密码至少需要 8 位。')
    return
  }
  if (registerForm.password !== registerForm.passwordConfirm) {
    ElMessage.warning('两次输入的密码不一致。')
    return
  }
  registerLoading.value = true
  try {
    const response = await apiClient.post('/auth/register', { code, name, account, password: registerForm.password })
    form.account = account
    form.password = ''
    form.role = response.data.role || 'student'
    form.organizationCode = response.data.organizationCode || form.organizationCode
    showRegisterDialog.value = false
    registerForm.code = ''
    registerForm.name = ''
    registerForm.account = ''
    registerForm.password = ''
    registerForm.passwordConfirm = ''
    ElMessage.success('注册成功，机构代码已自动填写，请登录。')
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message || '注册失败，请检查邀请码后重试。')
  } finally {
    registerLoading.value = false
  }
}
</script>

<style scoped lang="scss">
/* ===== 页面骨架：左侧整幅插画铺满，登录卡片浮在右侧 ===== */
.login-page {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 100vh;
  padding: 104px clamp(20px, 3.4vw, 56px) 44px;
  overflow-x: hidden;
  background: #f7f5fb url('/assets/student-theme/login-aya-artist-v1.png') center center / cover no-repeat;
  isolation: isolate;
}
.login-backdrop {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
  pointer-events: none;
}

/* ===== 顶部品牌条 ===== */
.login-topbar {
  position: absolute;
  top: 26px;
  left: clamp(20px, 3.4vw, 56px);
  right: clamp(20px, 3.4vw, 56px);
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}
.brand-mark {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, .92);
  background: rgba(255, 255, 255, .7);
  color: #2b2f52;
  font-size: 14px;
  font-weight: 900;
  box-shadow: 0 6px 16px rgba(72, 84, 150, .14);
  backdrop-filter: blur(10px);
}
.brand-mark.has-logo {
  overflow: hidden;
  padding: 3px;
}
.brand-mark.has-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.brand strong {
  color: #2a3150;
  font-size: 19px;
  font-weight: 800;
  letter-spacing: .01em;
  white-space: nowrap;
}
.brand-slogan {
  margin: 0;
  color: #8d94a8;
  font-size: 13px;
  letter-spacing: .12em;
  white-space: nowrap;
}

/* ===== 登录卡片 ===== */
.login-card {
  position: relative;
  z-index: 3;
  width: clamp(360px, 33vw, 462px);
  padding: 34px 38px 26px;
  border-radius: 22px;
  border: 1px solid rgba(255, 255, 255, .9);
  background: rgba(255, 255, 255, .82);
  box-shadow: 0 26px 64px rgba(58, 68, 120, .16), 0 2px 8px rgba(58, 68, 120, .06);
  backdrop-filter: blur(22px) saturate(1.08);
  animation: login-card-in .46s cubic-bezier(.22, .68, .3, 1) both;
}
@keyframes login-card-in {
  from { opacity: 0; transform: translate3d(0, 14px, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}
.login-card__title {
  margin: 0;
  color: #1c2340;
  font-size: clamp(24px, 1.9vw, 29px);
  line-height: 1.2;
  font-weight: 800;
  letter-spacing: .01em;
}
.login-card__subtitle {
  margin: 18px 0 0;
  color: #8b93a7;
  font-size: 13px;
  line-height: 1.2;
}

/* ===== 身份切换：下划线式 Tab ===== */
.role-tabs {
  display: flex;
  align-items: stretch;
  margin-top: 6px;
  border-bottom: 1px solid #e6e9f2;
}
.role-tab-slot {
  flex: 1 1 0;
  min-width: 0;
}
.role-tab-btn {
  position: relative;
  display: flex;
  flex-direction: column;
  /* 顶对齐而不是居中：「用户」带一行版本小字，居中会让它的文字比另外两个高一截，
     看起来像没对齐。统一顶对齐后三个 Tab 的文字基线一致。 */
  align-items: center;
  justify-content: flex-start;
  gap: 2px;
  width: 100%;
  min-height: 52px;
  padding: 9px 4px 15px;
  border: 0;
  background: transparent;
  color: #7b839a;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: color .18s ease;
}
.role-tab-btn:hover { color: #4b4f74; }
.role-tab-btn.active {
  color: #2b2f52;
  font-weight: 800;
}
/* 选中态下划线压在分隔线上，和参考稿一致 */
.role-tab-btn.active::after {
  content: "";
  position: absolute;
  left: 18%;
  right: 18%;
  bottom: -1px;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: linear-gradient(90deg, #6b4fd8, #8b6ee8);
}
.role-tab__label { line-height: 1.2; }
/* ===== 小画家选版本：两张卡片，登录前直接选 ===== */
.version-pick {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}
.version-pick__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 64px;
  padding: 10px 12px;
  border: 1.5px solid #e3e6f0;
  border-radius: 16px;
  background: rgba(255, 255, 255, .9);
  text-align: left;
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease, box-shadow .15s ease;
}
.version-pick__item:hover { border-color: #c9bff5; }
.version-pick__item:focus-visible { outline: 3px solid rgba(108, 92, 231, .25); outline-offset: 2px; }
.version-pick__item.is-on {
  border-color: #6c5ce7;
  background: #f4f1ff;
  box-shadow: 0 6px 16px rgba(108, 92, 231, .14);
}
.version-pick__icon { flex: none; width: 36px; height: 36px; }
.version-pick__icon svg { display: block; width: 100%; height: 100%; }
.version-pick__text { flex: 1; min-width: 0; display: grid; gap: 2px; }
.version-pick__text strong { color: #2a3150; font-size: 15px; font-weight: 800; line-height: 1.25; }
.version-pick__text small { color: #8b93a7; font-size: 11.5px; line-height: 1.35; }
.version-pick__item.is-on .version-pick__text strong { color: #5b46c4; }
.version-pick__check {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid #d5d9e6;
  background: #fff;
}
.version-pick__item.is-on .version-pick__check {
  border-color: #6c5ce7;
  background: #6c5ce7 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='m4.5 8.2 2.3 2.3 4.7-4.9' fill='none' stroke='%23fff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 12px no-repeat;
}

/* ===== 表单 ===== */
.login-form { margin-top: 20px; }
.login-form :deep(.el-form-item) { margin-bottom: 14px; }
.login-form :deep(.el-form-item__label) {
  display: block;
  margin-bottom: 6px;
  padding: 0;
  color: #7b839a;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.2;
}
.login-form :deep(.el-input__wrapper) {
  min-height: 46px;
  padding: 0 13px;
  border-radius: 10px;
  background: #fbfcff;
  box-shadow: 0 0 0 1px #e2e7f0 inset;
  transition: box-shadow .18s ease, background .18s ease;
}
.login-form :deep(.el-input__wrapper:hover) { box-shadow: 0 0 0 1px #cdd5e4 inset; }
.login-form :deep(.el-input__wrapper.is-focus) {
  background: #fff;
  box-shadow: 0 0 0 1px #7c5ce0 inset, 0 0 0 4px rgba(124, 92, 224, .12);
}
.login-form :deep(.el-input__inner) {
  color: #23283f;
  font-size: 15px;
}
.login-form :deep(.el-input__inner::placeholder) { color: #a9b0c1; }

.login-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: -2px 0 14px;
  font-size: 13px;
}
.login-options :deep(.el-checkbox__label) {
  color: #5a6478;
  font-size: 13px;
  padding-left: 7px;
}
.login-options :deep(.el-checkbox__inner) {
  width: 15px;
  height: 15px;
  border-radius: 4px;
  border-color: #cfd6e4;
}
.login-options :deep(.el-checkbox__inner::after) { left: 5px; top: 2px; }
.login-options :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background: #6b4fd8;
  border-color: #6b4fd8;
}
.login-options :deep(.el-checkbox__input.is-checked + .el-checkbox__label) { color: #5a6478; }
.login-options button {
  min-height: 32px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #7b839a;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.login-options button:hover { color: #6b4fd8; }

.login-form :deep(.base-button) {
  min-height: 52px;
  border-radius: 12px;
  padding: 0 20px;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: .04em;
  color: #fff;
  background: linear-gradient(100deg, #6b4fd8 0%, #7d5fe0 52%, #8b6ee8 100%);
  box-shadow: 0 14px 28px rgba(107, 79, 216, .28);
}
.login-form :deep(.base-button:not(:disabled):hover) {
  transform: translateY(-1px);
  box-shadow: 0 18px 34px rgba(107, 79, 216, .34);
}
.login-form :deep(.base-button:not(:disabled):active) { transform: scale(.985); }
.login-form :deep(.base-button:disabled) {
  background: #d9d2f0;
  color: #fff;
  box-shadow: none;
}
.btn-arrow {
  font-style: normal;
  font-size: 17px;
  line-height: 1;
  transform: translateY(-1px);
}

.quick-login { display: none; }

.registration-entry {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
  color: #8b93a7;
  /* 字号必须 ≥14px：这是 2026-11-16 验收基线里的硬性条目，注册入口是第一屏唯一的新用户入口，
     调小到 13px 会让回归直接失败，也真的更难看清。 */
  font-size: 14px;
}
.registration-entry button {
  min-height: 32px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #3f57c9;
  cursor: pointer;
  font-size: 14px;
  font-weight: 800;
}
.registration-entry button:hover { color: #2c41ab; text-decoration: underline; }

/* ===== 参考图上的轻动效：只保留插画头发/眼睛/笔尖的呼吸感 ===== */
.aya-hair-flow {
  position: absolute;
  inset: 0;
  display: block;
  background: url('/assets/student-theme/login-aya-artist-v1.png') center / cover no-repeat;
  mix-blend-mode: screen;
  opacity: .26;
  filter: saturate(1.12) brightness(1.04);
  will-change: transform, opacity;
}
.aya-hair-flow--front {
  clip-path: polygon(0 6%, 42% 4%, 43% 22%, 35% 37%, 20% 33%, 0 44%);
  transform-origin: 19% 20%;
  animation: aya-hair-front-flow 6.8s cubic-bezier(.45, .05, .2, 1) infinite alternate;
}
.aya-hair-flow--back {
  clip-path: polygon(0 11%, 31% 7%, 46% 17%, 39% 51%, 18% 62%, 0 71%);
  transform-origin: 12% 35%;
  opacity: .16;
  animation: aya-hair-back-flow 8.4s cubic-bezier(.4, .04, .18, 1) infinite alternate;
}
.aya-eye-awake {
  position: absolute;
  left: 18.9%;
  top: 33.4%;
  width: clamp(12px, 1.15vw, 19px);
  height: clamp(2px, .2vw, 3px);
  border-radius: 999px;
  background: rgba(255, 255, 255, .9);
  box-shadow: 0 0 7px rgba(120, 196, 255, .9), 0 0 18px rgba(140, 150, 255, .6);
  transform-origin: center;
  animation: aya-eye-awake 5.6s ease-in-out infinite;
}
.aya-stylus-energy {
  position: absolute;
  left: 43.3%;
  top: 52%;
  width: clamp(20px, 2.4vw, 36px);
  height: clamp(20px, 2.4vw, 36px);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, .95) 0 7%, rgba(168, 200, 255, .7) 20%, rgba(150, 130, 255, .22) 47%, transparent 70%);
  animation: aya-stylus-pulse 2.9s ease-in-out infinite;
}
@keyframes aya-hair-front-flow {
  0% { transform: translate3d(-3px, 1px, 0) rotate(-.45deg) scale(1); opacity: .16; }
  100% { transform: translate3d(8px, -3px, 0) rotate(1.4deg) scale(1.022); opacity: .34; }
}
@keyframes aya-hair-back-flow {
  0% { transform: translate3d(-7px, 4px, 0) rotate(-1.1deg) scale(1); }
  100% { transform: translate3d(9px, -6px, 0) rotate(1.7deg) scale(1.035); }
}
@keyframes aya-eye-awake {
  0%, 38%, 48%, 100% { transform: scaleY(1); opacity: .8; }
  43% { transform: scaleY(.22); opacity: .4; }
  63% { transform: scaleY(1.2); opacity: 1; }
}
@keyframes aya-stylus-pulse {
  0%, 100% { transform: scale(.78); opacity: .4; }
  52% { transform: scale(1.26); opacity: .92; }
}

/* ===== 注册弹窗（与改版前完全一致，勿动） ===== */
.registration-dialog-tip {
  margin: 0 0 18px;
  color: #667085;
  font-size: 13px;
  line-height: 1.6;
}
.registration-field-tip {
  margin: 6px 0 0;
  color: #8a94a6;
  font-size: 12px;
  line-height: 1.5;
}
.registration-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
/* 注册弹窗固定 606px 高，矮窗口（如 1080×532）会被裁掉「完成注册」按钮，
   而 el-overlay 本身滚不动（scrollTop 一直是 0）。改成弹窗自身限高 + 内容区内部滚动，
   按钮固定在底部，任何视口高度都能点到。 */
:global(.registration-dialog) {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 32px);
}
:global(.registration-dialog .el-dialog__body) {
  overflow-y: auto;
  min-height: 0;
}
/* footer 里是「取消 / 完成注册」，放在滚动区外面，矮窗口也一定看得见。 */
:global(.registration-dialog .el-dialog__footer) {
  flex: 0 0 auto;
  padding: 8px 18px 12px;
}
/* 矮窗口再压一层间距，让「完成注册」按钮不必滚动就能看到。
   实测 1080×532 下原本只溢出 7px，压缩边距即可完全容纳。 */
@media (max-height: 700px) {
  :global(.registration-dialog .el-dialog__header) { padding: 10px 18px 4px; }
  :global(.registration-dialog .el-dialog__body) { padding: 6px 18px 8px; }
  :global(.registration-dialog .registration-dialog-tip) { margin-bottom: 8px; font-size: 12px; line-height: 1.45; }
  :global(.registration-dialog .el-form-item) { margin-bottom: 6px; }
  :global(.registration-dialog .el-form-item__label) { margin-bottom: 1px; font-size: 12px; line-height: 1.25; }
  :global(.registration-dialog .el-input__wrapper) { min-height: 34px; }
  :global(.registration-dialog .registration-field-tip) { margin-top: 2px; font-size: 11px; line-height: 1.35; }
  :global(.registration-dialog .registration-actions button) { min-height: 34px; }
}
.registration-cancel {
  min-height: 38px;
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  padding: 0 15px;
  background: #fff;
  color: #475467;
  cursor: pointer;
  font-weight: 800;
}

/* ===== 窄屏：顶部品牌条压在上，卡片收到中间并允许纵向滚动 ===== */
@media (max-width: 900px) {
  .login-page {
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    padding: 18px 16px 28px;
    background-position: 32% center;
  }
  .login-backdrop { display: none; }
  .login-topbar {
    position: static;
    margin-bottom: 16px;
  }
  .brand strong { font-size: 17px; }
  .brand-slogan { display: none; }
  .login-card {
    width: 100%;
    max-width: 430px;
    margin: 0 auto;
    padding: 26px 22px 20px;
    border-radius: 20px;
  }
  .login-card__subtitle { margin-top: 14px; }
}

/* ===== 矮窗口：不允许卡片被视口切掉，改为从顶部排布并可滚动 ===== */
@media (max-height: 820px) {
  .login-page { align-items: flex-start; }
}
/* 1080×532（笔记本 125% 缩放最常见）卡片原本 592px 高，会超出一屏。
   这里整体压一轮间距，让「使用邀请码注册」也落在首屏内，不必先滚动才看得到。 */
@media (min-width: 901px) and (max-height: 700px) {
  .login-page { padding: 64px clamp(20px, 3.4vw, 56px) 12px; }
  .login-topbar { top: 15px; }
  .brand-mark { width: 30px; height: 30px; font-size: 13px; }
  .brand strong { font-size: 17px; }
  .login-card { padding: 20px 28px 14px; }
  .login-card__title { font-size: 22px; }
  .login-card__subtitle { margin-top: 10px; font-size: 12px; }
  .role-tabs { margin-top: 4px; }
  .role-tab-btn { min-height: 40px; padding: 5px 4px 8px; font-size: 14px; }
  .version-pick { margin-top: 10px; }
  .version-pick__item { min-height: 54px; padding: 8px 10px; }
  .login-form { margin-top: 12px; }
  .login-form :deep(.el-form-item) { margin-bottom: 8px; }
  .login-form :deep(.el-form-item__label) { margin-bottom: 3px; font-size: 11.5px; }
  .login-form :deep(.el-input__wrapper) { min-height: 38px; }
  .login-form :deep(.el-input__inner) { font-size: 14px; }
  .login-options { margin-bottom: 8px; font-size: 12px; }
  .login-options button { min-height: 28px; font-size: 12px; }
  .login-form :deep(.base-button) { min-height: 44px; font-size: 15px; }
  .btn-arrow { font-size: 15px; }
  .registration-entry { margin-top: 8px; }
  .registration-entry button { min-height: 26px; }
}
@media (max-width: 900px) and (max-height: 640px) {
  .login-card { padding: 20px 18px 16px; }
  .role-tab-btn { min-height: 40px; padding-bottom: 9px; }
  .login-form { margin-top: 14px; }
  .login-form :deep(.el-form-item) { margin-bottom: 10px; }
  .login-form :deep(.el-input__wrapper) { min-height: 42px; }
  .login-form :deep(.base-button) { min-height: 46px; font-size: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  .login-card { animation: none; }
  .aya-hair-flow,
  .aya-eye-awake,
  .aya-stylus-energy { animation: none; }
}
</style>
