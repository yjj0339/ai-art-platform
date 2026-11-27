<template>
  <el-dialog
    :model-value="modelValue"
    class="ax-dialog"
    title="封禁账号"
    width="min(520px, 94vw)"
    align-center
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
    @open="resetDraft"
  >
    <form class="ax-form is-1col" @submit.prevent="submit">
      <label class="ax-field">
        <span>账号</span>
        <template v-if="fixedAccount">
          <div class="ban-target">
            <AdminAvatar :role="fixedAccount.role" />
            <div class="ax-cell-main">
              <strong>{{ fixedAccount.name || fixedAccount.account }}</strong>
              <small>{{ fixedAccount.account }}</small>
            </div>
          </div>
        </template>
        <select v-else v-model="draft.userId">
          <option value="">请选择要封禁的账号</option>
          <option v-for="item in pickableAccounts" :key="item.id" :value="item.id">
            {{ item.name || item.account }}（{{ item.account }}）
          </option>
        </select>
      </label>

      <div class="ax-field">
        <span>限制范围</span>
        <div class="ban-scope-grid">
          <label class="ax-option">
            <input v-model="draft.scope" type="radio" value="ai" />
            <span><strong>暂停 AI 与发布</strong><small>还能登录、看自己的作品，但不能用 AI 创作、不能公开发布和留言。</small></span>
          </label>
          <label class="ax-option">
            <input v-model="draft.scope" type="radio" value="all" />
            <span><strong>暂停登录</strong><small>立即退出所有设备，期间无法登录。</small></span>
          </label>
        </div>
      </div>

      <div class="ax-field">
        <span>时长</span>
        <div class="ax-tags">
          <label v-for="option in durationOptions" :key="option.minutes" class="ax-chip-check">
            <input v-model="draft.minutes" type="radio" :value="option.minutes" />
            <span>{{ option.label }}</span>
          </label>
        </div>
      </div>

      <label class="ax-field">
        <span>原因</span>
        <textarea v-model="draft.reason" rows="2" maxlength="200" placeholder="例如：多次发布不适合的内容（只有管理员能看到）"></textarea>
      </label>

      <p v-if="errorText" class="ax-note is-bad">{{ errorText }}</p>
    </form>
    <template #footer>
      <button type="button" class="ax-btn" @click="emit('update:modelValue', false)">取消</button>
      <button type="button" class="ax-btn is-danger is-solid" :disabled="submitting" @click="submit">
        {{ submitting ? '提交中…' : '确认封禁' }}
      </button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { apiClient } from '../services/apiClient'
import AdminAvatar from './admin/AdminAvatar.vue'

// 封禁弹窗：「账号安全」页和「账号与权限」列表共用，接口是 POST /api/admin/risk/bans。
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // 从某一行点进来时直接带上账号（{ id, name, account, role }），不再让管理员重选。
  account: { type: Object, default: null },
  // 从页头点「封禁账号」时给一个可选账号列表；管理员账号不能被封禁，会自动排除。
  accounts: { type: Array, default: () => [] },
  defaultReason: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'banned'])

const durationOptions = [
  { minutes: 30, label: '30 分钟' },
  { minutes: 1440, label: '1 天' },
  { minutes: 10080, label: '7 天' },
  { minutes: 43200, label: '30 天' },
  { minutes: 0, label: '永久' },
]
const draft = reactive({ userId: '', scope: 'ai', minutes: 1440, reason: '' })
const submitting = ref(false)
const errorText = ref('')

const fixedAccount = computed(() => (props.account?.id ? props.account : null))
// 账号列表接口里的 ban 只在「正在封禁」时才有值，已封禁的不用再出现在可选列表里。
const pickableAccounts = computed(() => props.accounts.filter((item) => item.role !== 'admin' && !item.ban))


function resetDraft() {
  Object.assign(draft, { userId: props.account?.id || '', scope: 'ai', minutes: 1440, reason: props.defaultReason || '' })
  errorText.value = ''
}

async function submit() {
  errorText.value = ''
  const userId = fixedAccount.value?.id || draft.userId
  if (!userId) { errorText.value = '请先选择要封禁的账号'; return }
  if (String(draft.reason || '').trim().length < 2) { errorText.value = '请写一句封禁原因，方便以后查'; return }
  submitting.value = true
  try {
    const { data } = await apiClient.post('/admin/risk/bans', {
      userId,
      scope: draft.scope,
      minutes: draft.minutes,
      reason: draft.reason.trim(),
    })
    ElMessage.success(draft.scope === 'all' ? '已封禁，并让该账号退出了所有设备' : '已暂停该账号的 AI 创作和公开发布')
    emit('banned', data?.ban || null)
    emit('update:modelValue', false)
  } catch (error) {
    errorText.value = error?.response?.data?.message || '封禁失败，请稍后再试'
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.ban-target {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--ax-surface-2);
}
.ban-scope-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
@media (max-width: 520px) {
  .ban-scope-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
