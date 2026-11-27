<script setup>
/**
 * 用户端左下角的智能体入口。
 *
 * 五个页面（绘画 / 视频 / 3D / 课程 / 报告）共用同一个后台智能体：
 * 组件只负责「听用户说一句 → 让后端理解 → 把整理好的描述交出去」，
 * 真正的出图 / 出视频由各页面自己执行，组件不碰生成逻辑。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { apiClient } from '../services/apiClient'
import {
  createVoiceTalker,
  isSpeechSupported,
  isSpeaking,
  speakAgentText,
  stopAllSpeech,
  stopSpeaking,
  toggleMuted,
  voiceMuted,
} from '../utils/agentSpeech'

const props = defineProps({
  page: { type: String, required: true },
  pageLabel: { type: String, default: '' },
  samples: { type: Array, default: () => [] },
  avatarSrc: { type: String, default: '/assets/student-theme/paint-agent-avatar-v2.webp' },
  /** inline：放在页面已有的侧栏里（绘画页）；floating：固定在左下角（其他页） */
  variant: { type: String, default: 'floating' },
  /** 执行中的提示语，由父页面在开跑时传 true */
  busy: { type: Boolean, default: false },
  /** 面板底部的快捷入口，如 [{ label: '无限画布', action: 'canvas' }] */
  links: { type: Array, default: () => [] },
  /** 面板从哪边展开：人物靠左用 left（默认），人物被挪到屏幕右侧的页面必须用 right，否则半个面板在屏外 */
  panelSide: { type: String, default: 'left' },
  /**
   * 智能体模式开关，由父页面控制（绘画页 = 点人物头像）。
   * 传 null 表示这一页没有模式概念，点人物就是开关面板（其他四页的老行为）。
   */
  agentMode: { type: Boolean, default: null },
  /**
   * 提示词只走父页面的大输入框：面板去掉自己的输入框 / 麦克风 / 发送键，
   * 只留对话记录和朗读，变成一块「只读的对话窗」。只有绘画页打开这个开关。
   */
  promptOnly: { type: Boolean, default: false },
  /**
   * 用户此刻在页面上的真实设置（提示词 / 风格 / 比例 / 张数 / 已出几张…）。
   * 不传也能用，只是老师说「改一下耳朵」时不知道要改哪张画。
   * 由各页面用 computed 拼好传进来，组件只负责原样转发，不猜、不补。
   */
  canvasContext: { type: Object, default: null },
})

const emit = defineEmits(['execute', 'link', 'mode-change'])

const open = ref(false)
const chatText = ref('')
const loading = ref(false)
const messages = ref([])
const agentName = ref('AI 小画师')
const understanding = ref(null)
const lastError = ref('')
const scroller = ref(null)
const inputRef = ref(null)

/* —— 语音：朗读回复 + 语音输入 —— */
// 朗读开关是全站共用的一个状态：面板这里关掉，绘画页顶栏那个「语音/静音」也跟着变
const muted = voiceMuted
const canSpeak = isSpeechSupported()
const voiceState = ref('idle') // idle | listening | transcribing
/** 最近一次自动念过的句子 id，用来避免「自动念一遍 → 用户又点小喇叭 → 再念一遍」 */
const lastSpokenId = ref('')

/** 智能体每句回话都念出来，开关一关就彻底不响；记得住是哪一条，小喇叭才知道该显示成「停」 */
function speakReply(text, id = '') {
  if (muted.value || !text) return
  lastSpokenId.value = id
  speakAgentText(text, {
    id,
    onEnd() {
      if (lastSpokenId.value === id) lastSpokenId.value = ''
    },
  })
}

const talker = createVoiceTalker({
  onState(state, preview) {
    voiceState.value = state
    // 边说边把字填进输入框，用户能看到自己说的被认成了什么
    if (state === 'listening' && preview) chatText.value = preview
  },
  onText(text) {
    chatText.value = text
    void send()
  },
  onError(error) {
    const reason = String(error?.message || '').trim() || '没听清'
    pushMessage('agent', `我这边没听清（${reason}）。你点一下麦克风再说一次，或者直接打字也行。`, { transient: true })
  },
})

function toggleVoice() {
  if (loading.value || voiceState.value === 'transcribing') return
  // 听的时候要安静，别让上一句朗读盖住用户说话
  stopSpeaking()
  void talker.toggle()
}

const fallbackSamples = ['帮我画一只月球上的猫', '我想画恐龙，但不知道背景画什么']
const sampleList = computed(() => (props.samples.length ? props.samples : fallbackSamples))
/**
 * 后台这个智能体同时管五个页面，名字里带「报告」。
 * 在绘画页给用户看「项目创作报告智能体」太怪，非报告页统一按页面称呼，
 * 后台一旦把它改成通用名字，这里会原样显示后台的名字。
 */
const displayName = computed(() => {
  const name = String(agentName.value || '').trim()
  const looksLikeReportOnly = /报告/.test(name) && props.page !== 'report'
  if (!looksLikeReportOnly) return name || 'AI 伙伴'
  return props.pageLabel ? `${props.pageLabel}伙伴` : 'AI 伙伴'
})
const greeting = computed(() => (
  props.pageLabel
    ? `我是陪你上课的 AI 伙伴。想画什么、想做什么，直接跟我说一句，我来帮你理清楚。`
    : '想做什么，直接跟我说一句。'
))

/* —— 记忆：一个账号一份，五个页面共用，存在服务器上 ——
 * 组件自己不存记忆，只做两件事：进来先要回历史、说一句就记一句。
 * 所以切页面、刷新、换设备登录都能接着聊；报错提示标 transient，不进记忆。 */
const memoryLoading = ref(false)

async function loadMemory() {
  memoryLoading.value = true
  try {
    const { data } = await apiClient.get('/student/agent/memory', { params: { limit: 60 } })
    const history = Array.isArray(data?.messages) ? data.messages : []
    if (!history.length) return
    const restored = history
      .filter((item) => item && item.content)
      .map((item, index) => ({
        id: item.id || `memory-${index}`,
        role: item.role === 'agent' ? 'agent' : 'student',
        content: String(item.content),
        page: item.page || '',
        restored: true,
      }))
    // 历史回来之前用户可能已经开口了：历史放前面，本地已有的一句都不重复插
    const local = messages.value
    const exists = new Set(restored.map((item) => `${item.role}:${item.content}`))
    messages.value = [...restored, ...local.filter((item) => !exists.has(`${item.role}:${item.content}`))]
    await scrollToBottom()
  } catch {
    // 记忆拉不到就当没有，绝不能挡住用户说话
  } finally {
    memoryLoading.value = false
  }
}

async function remember(item) {
  try {
    await apiClient.post('/student/agent/memory', { role: item.role, content: item.content, page: props.page })
  } catch {
    // 记不上不影响这一轮对话，不弹错打扰用户
  }
}

async function clearMemory() {
  if (!messages.value.length) return
  if (!window.confirm('清空后，绘画、视频、3D、课程、报告五个页面的 AI 伙伴都会忘记之前聊过的内容。确定清空吗？')) return
  stopAllSpeech()
  try {
    await apiClient.delete('/student/agent/memory')
    messages.value = []
    understanding.value = null
    lastError.value = ''
  } catch (error) {
    const message = error?.response?.data?.message || '清空失败了，再点一次试试'
    const bubble = pushMessage('agent', message, { transient: true })
    speakReply(message, bubble.id)
  }
}

/** 发出去的消息里，只有老师的话需要带小喇叭；用户自己说的话、报错提示不掺进去 */
function pushMessage(role, content, extra = {}) {
  const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, role, content, ...extra }
  messages.value = [...messages.value, item]
  void scrollToBottom()
  // 报错提示是「这一次没成功」，不是记忆，写进服务器会污染下次的上下文
  if (!extra.transient) void remember(item)
  return item
}

/**
 * 每句话单独念。总开关关着就不响，点也不响——用户看到的是「朗读已关闭」。
 * 同一条再点一次就是停：像微信语音条那样，点一下播、再点一下停。
 */
function speakBubble(item) {
  if (muted.value || !item?.content) return
  if (isSpeaking(item.id)) {
    stopAllSpeech()
    return
  }
  lastSpokenId.value = item.id
  speakAgentText(item.content, {
    id: item.id,
    onEnd() {
      if (lastSpokenId.value === item.id) lastSpokenId.value = ''
    },
  })
}

/** 点总开关的两个方向：打开时念最后一句确认，关掉时立刻闭嘴 */
function toggleMute() {
  const next = toggleMuted()
  if (!next) {
    const last = [...messages.value].reverse().find((item) => item.role === 'agent')
    if (last) speakBubble(last)
    else speakReply('好，我说话了。')
  }
}


/** 录音状态下占位文字就是状态提示，省一行高度（面板本来就窄） */
const voicePlaceholder = computed(() => {
  if (voiceState.value === 'transcribing') return '正在把你说的变成字…'
  if (voiceState.value === 'listening') return '正在听，说完点一下麦克风'
  if (props.pageLabel === '课程') return '想学什么？说一句就行'
  if (props.pageLabel === '项目报告') return '想做什么报告？说一句就行'
  return '想做什么？说一句就行'
})

async function scrollToBottom() {
  await nextTick()
  const el = scroller.value
  if (el) el.scrollTop = el.scrollHeight
}

function toggle() {
  // 这一页有「智能体模式」时，点人物 = 切模式（父母页面接管开关），不再自己开关面板
  if (props.agentMode !== null) {
    emit('mode-change', !props.agentMode)
    return
  }
  open.value = !open.value
  if (open.value) {
    // 面板一打开就停掉别处还在念的话，否则用户根本听不清自己说了什么
    stopAllSpeech()
    nextTick(() => inputRef.value?.focus())
  }
}

function close() {
  open.value = false
  talker.stop()
  stopAllSpeech()
  // 绘画页：收起对话窗就等于退出智能体模式，跟再点一次头像是同一个效果
  if (props.agentMode) emit('mode-change', false)
}

/* —— 供父页面「大输入框」驱动的对外接口 ——
 * 绘画页把智能体的输入框搬到了底部的大框，这边只负责收结果、显示、朗读。
 * 用 defineExpose 而不是双向同步，是为了不让组件内部维护第二份待发送的文字。 */
const mode = computed(() => props.agentMode)

/**
 * 发给后端的公共部分：这句话 + 最近 6 句 + 用户画布上的设置。
 * say / send 两处共用，避免以后改一处漏一处。
 */
function agentPayload(text) {
  const history = messages.value
    .slice(-6)
    .map((item) => ({ role: item.role === 'student' ? 'user' : 'agent', content: item.content }))
  // 全空就别发，让后端走原来的提示词，避免多出一段空标题
  const context = props.canvasContext
  const hasContext = Boolean(context && typeof context === 'object' && Object.keys(context)
    .some((key) => context[key] !== '' && context[key] !== null && context[key] !== undefined))
  return {
    page: props.page,
    text,
    history,
    ...(hasContext ? { canvasContext: context } : {}),
  }
}

/** 用户在大框说了一句：先记进对话流，让面板像聊天一样有来有回 */
async function say(text) {
  const content = String(text || '').trim()
  if (!content) return Promise.resolve(null)
  lastError.value = ''
  pushMessage('student', content)
  loading.value = true
  try {
    const { data } = await apiClient.post('/student/agent/understand', agentPayload(content))
    if (data?.agentName) agentName.value = data.agentName
    understanding.value = data
    const reply = data?.reply || '我听着呢，再说详细一点？'
    // 先插进去拿到 id，再念——小喇叭要知道自己对应的是哪一条
    const bubble = pushMessage('agent', reply)
    speakReply(reply, bubble.id)
    return data || null
  } catch (error) {
    const message = error?.response?.data?.message || '我这会儿没听清，再说一次好吗'
    lastError.value = message
    const bubble = pushMessage('agent', message, { transient: true })
    speakReply(message, bubble.id)
    return null
  } finally {
    loading.value = false
  }
}

/** 没走 AI、只想知道用户在干嘛时用：直接往对话流里放一句老师的话 */
function note(text) {
  const content = String(text || '').trim()
  if (!content) return
  const bubble = pushMessage('agent', content)
  speakReply(content, bubble.id)
}

defineExpose({ say, note, open, close })


function useSample(text) {
  chatText.value = text
  void send()
}

async function send() {
  const text = chatText.value.trim()
  if (!text || loading.value) return
  lastError.value = ''
  pushMessage('student', text)
  chatText.value = ''
  loading.value = true
  try {
    const { data } = await apiClient.post('/student/agent/understand', agentPayload(text))
    if (data?.agentName) agentName.value = data.agentName
    understanding.value = data
    const reply = data?.reply || '我听着呢，再说详细一点？'
    // 先插进去拿到 id，再念——小喇叭要知道自己对应的是哪一条
    const bubble = pushMessage('agent', reply)
    // 念回复，不念整理后的长描述（几十秒的朗读会把用户逼疯）
    speakReply(reply, bubble.id)
    if (data?.readyToRun && data?.prompt) {
      emit('execute', {
        prompt: data.prompt,
        actionKey: data.actionKey,
        understanding: data,
      })
    }
  } catch (error) {
    const message = error?.response?.data?.message || '我这会儿没听清，再说一次好吗'
    lastError.value = message
    const bubble = pushMessage('agent', message, { transient: true })
    speakReply(message, bubble.id)
  } finally {
    loading.value = false
  }
}

function onKeydown(event) {
  // Enter 发出去，Shift+Enter 换行——用户不会按 Ctrl+Enter
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    void send()
  }
}

// 一进页面就把这个账号的记忆要回来：五个页面共用同一份，切回来还能接着上次说
onMounted(() => {
  void loadMemory()
})

// 切页面时把麦克风和喇叭一起关掉，否则换个页面还在录
onBeforeUnmount(() => {
  talker.stop()
  stopAllSpeech()
})
</script>

<template>
  <div class="sa-dock" :class="[`is-${variant}`, `is-panel-${panelSide}`, { 'is-open': open, 'is-agent-mode': agentMode === true, 'is-prompt-only': promptOnly }]">
    <button
      type="button"
      class="sa-figure-btn"
      :aria-expanded="agentMode === null ? open : agentMode"
      :aria-pressed="agentMode === null ? undefined : agentMode"
      :aria-label="agentMode === null ? 'AI 伙伴，点击说话' : (agentMode ? '点一下退出智能体模式，回到图像生成' : '点一下进入智能体模式，让讲师帮你整理提示词')"
      :title="agentMode === null ? '' : (agentMode ? '点一下回到图像生成' : '点一下进入智能体模式')"
      @click="toggle"
    >
      <span class="sa-figure-shadow" aria-hidden="true"></span>
      <img class="sa-figure" :src="avatarSrc" alt="" draggable="false" />
      <!-- 有模式概念的页面：用户一眼看出现在在哪种模式，不然点了头像不知道发生了什么 -->
      <span v-if="agentMode !== null" class="sa-mode-tag" :class="{ 'is-on': agentMode }">
        {{ agentMode ? '智能体模式' : '点我切智能体' }}
      </span>
      <span v-else-if="!open" class="sa-hint">点我说话</span>
    </button>

    <transition name="sa-pop">
      <section
        v-if="agentMode === null ? open : agentMode"
        class="sa-panel"
        aria-label="AI 伙伴对话"
      >
        <header class="sa-head">
          <span class="sa-avatar"><img :src="avatarSrc" alt="" /></span>
          <span class="sa-who">
            <strong>{{ displayName }}</strong>
            <small :title="promptOnly ? '在大框里说，我帮你理成画得出来的描述' : ''">{{ promptOnly ? '在大框里说' : `${pageLabel || '随时问我'} · 说一句就动手` }}</small>
          </span>
          <button
            v-if="canSpeak"
            type="button"
            class="sa-sound"
            :class="{ 'is-off': muted }"
            :aria-pressed="!muted"
            :aria-label="muted ? '打开朗读，让我把话念出来' : '关闭朗读，别念了'"
            :title="muted ? '打开朗读' : '关闭朗读'"
            @click="toggleMute"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 9.5v5h3.6L12 18V6L7.6 9.5H4z" />
              <path v-if="!muted" d="M15.5 9a4.2 4.2 0 0 1 0 6" />
              <path v-if="!muted" d="M18 6.6a8 8 0 0 1 0 10.8" />
              <path v-else d="M16 9.5l5 5M21 9.5l-5 5" />
            </svg>
            <span>{{ muted ? '朗读关闭' : '朗读开启' }}</span>
          </button>
          <button
            v-if="messages.length"
            type="button"
            class="sa-forget"
            title="清空绘画、视频、3D、课程、报告五个页面的对话记忆"
            @click="clearMemory"
          >清空</button>
          <button type="button" class="sa-close" aria-label="收起" @click="close">×</button>
        </header>

        <div ref="scroller" class="sa-stream">
          <p class="sa-bubble is-agent">{{ greeting }}</p>
          <template v-for="item in messages" :key="item.id">
            <p v-if="item.role === 'student'" class="sa-bubble is-student">{{ item.content }}</p>
            <!-- 老师每句话前面一个小喇叭：想再听一遍点一下，正在念就点一下停 -->
            <div v-else class="sa-line">
              <button
                v-if="canSpeak"
                type="button"
                class="sa-speak"
                :class="{ 'is-on': isSpeaking(item.id), 'is-off': muted }"
                :aria-label="isSpeaking(item.id) ? '停止朗读这一句' : '朗读这一句'"
                :title="muted ? '朗读已关闭，点顶部开关打开' : (isSpeaking(item.id) ? '停止' : '读给我听')"
                @click="speakBubble(item)"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 9.5v5h3.6L12 18V6L7.6 9.5H4z" />
                  <template v-if="isSpeaking(item.id)">
                    <path d="M16 9.5l5 5M21 9.5l-5 5" />
                  </template>
                  <template v-else-if="!muted">
                    <path d="M15.5 9a4.2 4.2 0 0 1 0 6" />
                  </template>
                  <path v-else d="M16 8.5l5 7M21 8.5l-5 7" />
                </svg>
              </button>
              <p class="sa-bubble is-agent">{{ item.content }}</p>
            </div>
          </template>

          <!-- 模型要想 5~12 秒，不给反馈用户会以为卡死了 -->
          <p v-if="loading" class="sa-bubble is-agent is-thinking" aria-label="正在想">
            <i></i><i></i><i></i>
          </p>

          <div v-if="understanding && understanding.readyToRun" class="sa-detail">
            <p class="sa-detail-title">我按这个来画</p>
            <p class="sa-detail-prompt">{{ understanding.prompt }}</p>
            <p v-if="understanding.additions.length" class="sa-detail-sub">
              替你补了 {{ understanding.additions.length }} 样：{{ understanding.additions.map((a) => a.label || a.value).join('、') }}
            </p>
            <p v-if="understanding.missing.length" class="sa-detail-sub is-warn">
              这几样我不敢编，等下你告诉我：{{ understanding.missing.join('、') }}
            </p>
          </div>

          <div v-else-if="understanding && understanding.questions.length" class="sa-detail">
            <p class="sa-detail-title">我想先问清楚再动手</p>
            <ul class="sa-question-list">
              <li v-for="(q, index) in understanding.questions" :key="index">{{ q }}</li>
            </ul>
          </div>

          <p v-if="busy" class="sa-busy">正在画，稍等…</p>
        </div>

        <div v-if="!messages.length" class="sa-samples">
          <button
            v-for="sample in sampleList"
            :key="sample"
            type="button"
            class="sa-sample"
            @click="useSample(sample)"
          >{{ sample }}</button>
        </div>

        <!-- 绘画页：输入、麦克风、发送全在大框那边，这里不再放第二套 -->
        <p v-if="promptOnly" class="sa-foot-hint">想说什么，写进下面的大框，我在这儿回你。</p>

        <footer v-else class="sa-input-row">
          <button
            type="button"
            class="sa-mic"
            :class="{ 'is-live': voiceState === 'listening', 'is-busy': voiceState === 'transcribing' }"
            :aria-label="voiceState === 'listening' ? '说完了，点这里结束' : '点这里说话'"
            :title="voiceState === 'listening' ? '说完了，点这里结束' : '点这里说话'"
            :disabled="loading || voiceState === 'transcribing'"
            @click="toggleVoice"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="2.5" width="6" height="11" rx="3" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
              <path d="M12 17.5V21" />
            </svg>
          </button>
          <textarea
            ref="inputRef"
            v-model="chatText"
            class="sa-input"
            rows="1"
            maxlength="300"
            :placeholder="voicePlaceholder"
            @keydown="onKeydown"
          ></textarea>
          <button type="button" class="sa-send" :disabled="loading || !chatText.trim()" @click="send">
            {{ loading ? '…' : '说' }}
          </button>
        </footer>

        <div v-if="links.length" class="sa-links">
          <button
            v-for="link in links"
            :key="link.action"
            type="button"
            class="sa-link"
            @click="emit('link', link.action)"
          >{{ link.label }}</button>
        </div>
      </section>
    </transition>
  </div>
</template>

<style scoped>
/* 全局 button 有 min-height，这里一律清掉，否则人物按钮会被撑成一块方块 */
.sa-dock {
  position: relative;
  z-index: 30;
}
/* 抬离底部：很多页底部有一条「开始生成」吸底条，压住它用户就点不到按钮了 */
.sa-dock.is-floating {
  position: fixed;
  left: 14px;
  bottom: 78px;
}
.sa-dock.is-floating.is-open {
  z-index: 60;
}

.sa-figure-btn {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  min-height: 0;
  padding: 0;
  border: 0;
  background: none;
  box-shadow: none;
  cursor: pointer;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}
/* floating 人物的宽度走变量：默认 92，页面可以按自己那块空白的大小改
   （比如高级报告页要把它塞进提示词框和按钮条之间那条缝里，只能给 76）。 */
.sa-dock.is-floating .sa-figure-btn { width: var(--sa-float-size, 92px); }
/* 绘画页：人物站在原有侧栏底部，尺寸跟原来的 182px 形象对齐 */
.sa-dock.is-inline .sa-figure-btn { width: 182px; max-width: 100%; margin: 0 auto; }
.sa-figure-btn:focus-visible { outline: 2px solid rgba(255, 122, 0, .55); outline-offset: 6px; border-radius: 16px; }

.sa-figure {
  display: block;
  width: 100%;
  height: auto;
  filter: drop-shadow(0 6px 10px rgba(126, 104, 214, .16));
  animation: saFloat 4.6s ease-in-out infinite;
  user-select: none;
  -webkit-user-drag: none;
}
.sa-dock.is-floating .sa-figure { width: var(--sa-float-size, 92px); }
.sa-figure-btn:hover .sa-figure { filter: drop-shadow(0 10px 18px rgba(126, 104, 214, .3)); }
@keyframes saFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.sa-figure-shadow {
  position: absolute;
  left: 50%;
  bottom: 2px;
  width: 62px;
  height: 12px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(50% 50% at 50% 50%, rgba(102, 96, 168, .22), rgba(102, 96, 168, 0));
  animation: saShadow 4.6s ease-in-out infinite;
  pointer-events: none;
}
@keyframes saShadow {
  0%, 100% { transform: translateX(-50%) scale(1); opacity: 1; }
  50% { transform: translateX(-50%) scale(.9); opacity: .72; }
}

/* 气泡/模式标签默认在头像正上方居中。
   ⚠ 浮层贴在屏幕最右边时（panelSide='right'），居中会让气泡右半截出屏——
   这类浮层改成「右缘对齐头像右缘」，气泡整体往左收，不再出屏。 */
.sa-dock.is-panel-right.is-floating .sa-hint,
.sa-dock.is-panel-right.is-floating .sa-mode-tag {
  left: auto;
  right: 0;
  transform: translate(0, -100%);
}
.sa-hint {
  position: absolute;
  left: 50%;
  top: -6px;
  transform: translate(-50%, -100%);
  padding: 3px 9px;
  border-radius: 999px;
  background: #fff;
  color: #6b74ad;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(69, 79, 160, .16);
  pointer-events: none;
}

/* 模式标签：点头像切换模式，必须让用户看见「现在在哪一档」 */
.sa-mode-tag {
  position: absolute;
  left: 50%;
  top: -6px;
  transform: translate(-50%, -100%);
  padding: 3px 9px;
  border: 1px solid rgba(118, 126, 199, .22);
  border-radius: 999px;
  background: #fff;
  color: #6b74ad;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(69, 79, 160, .14);
  pointer-events: none;
  transition: background .16s ease, color .16s ease, border-color .16s ease;
}
.sa-mode-tag.is-on {
  border-color: rgba(122, 112, 226, .45);
  background: #6f66d8;
  color: #fff;
  box-shadow: 0 6px 16px rgba(111, 102, 216, .32);
}

/* 只读对话窗底部的指引：告诉用户去哪儿说话，别在面板里找输入框 */
.sa-foot-hint {
  margin: 0;
  padding-top: 8px;
  border-top: 1px solid #eff1f9;
  color: #8b93bd;
  font-size: 11.5px;
  line-height: 1.5;
}

/* —— 对话面板 —— */
.sa-panel {
  position: absolute;
  left: 0;
  bottom: calc(100% + 10px);
  z-index: 5;
  display: grid;
  /* 「最少 0」不写全的话，内容一多整块面板会涨高，底部快捷入口被裁掉 */
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  width: 332px;
  /* 人物贴着页面底部，面板必须能按可视高度自己缩，否则底部快捷入口会被裁掉 */
  max-height: min(460px, calc(100vh - 210px));
  padding: 12px;
  gap: 8px;
  border: 1px solid rgba(118, 126, 199, .18);
  border-radius: 16px;
  background: rgba(255, 255, 255, .98);
  box-shadow: 0 18px 42px rgba(69, 79, 160, .2);
  backdrop-filter: blur(10px);
  /* 侧栏同级有一层 z-index:3 的浮层（绘画页 .pro-canvas），会整块盖住面板。
     这里就地造一个叠层：不依赖父级 z-index 比较，改哪页都不会被压回去 */
  isolation: isolate;
}
.sa-dock.is-floating .sa-panel { bottom: calc(100% + 8px); width: min(332px, calc(100vw - 28px)); }
/* 只读对话窗没有输入行：底部改成「提示语 + 快捷入口」两行，5 行模板装 4 块内容会把最后一块挤进溢出 */
.sa-dock.is-prompt-only .sa-panel { grid-template-rows: auto minmax(0, 1fr) auto auto auto; }
/* 人物被挪到屏幕右侧的页面（3D），面板改为贴右边展开，否则一大半跑到屏外，朗读开关点不到 */
.sa-dock.is-floating.is-panel-right .sa-panel { left: auto; right: 0; }
/* 绘画页：面板必须老老实实待在侧栏这一列里。
   以前是居中弹（left:50% + 负 margin），面板比 280px 的侧栏宽，左右各伸出 26px；
   而 .pro-paint-layout 是 overflow:hidden —— 伸出去的那截被直接裁掉，
   于是每句话前面的小喇叭「看得见点不到」。改成贴满这一列，一点不长出去 */
.sa-dock.is-inline .sa-panel {
  left: 0;
  right: 0;
  width: auto;
  margin-left: 0;
}

.sa-head {
  display: flex;
  align-items: center;
  gap: 9px;
}
.sa-avatar {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: linear-gradient(140deg, #eef1ff, #ffe9d6);
  overflow: hidden;
}
.sa-avatar img { width: 100%; height: 100%; object-fit: contain; object-position: bottom; }
.sa-who { flex: 1 1 auto; min-width: 0; display: grid; gap: 1px; }
.sa-who strong { color: #2c3163; font-size: 13px; }
.sa-who small { color: #8b93bd; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sa-close {
  flex: 0 0 auto;
  width: 26px;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: none;
  color: #9aa2c6;
  font-size: 18px;
  line-height: 1;
}
.sa-close:hover { background: #f2f4fb; color: #5b6494; }

/* 「清空」记忆：跨页面记忆一旦落地，就必须有一个能归零的入口，否则越聊越长 */
.sa-forget {
  flex: 0 0 auto;
  height: 25px;
  min-height: 0;
  padding: 0 8px;
  border: 1px solid rgba(154, 162, 198, .28);
  border-radius: 999px;
  background: #fff;
  color: #9aa2c6;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}
.sa-forget:hover { background: #fff4ee; border-color: rgba(226, 124, 60, .4); color: #c2662b; }

/* 朗读开关：不只是个喇叭图标——带文字用户才找得到「怎么让它别念了」 */
.sa-sound {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 25px;
  min-height: 0;
  padding: 0 8px;
  border: 1px solid rgba(123, 131, 176, .24);
  border-radius: 999px;
  background: #f4f6ff;
  color: #5b6494;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}
.sa-sound:hover { background: #e9edfb; color: #46509a; }
.sa-sound.is-off {
  border-color: rgba(154, 162, 198, .28);
  background: #fff;
  color: #9aa2c6;
}
.sa-sound.is-off:hover { background: #f2f4fb; color: #6b74a8; }

.sa-stream {
  display: grid;
  gap: 7px;
  align-content: start;
  overflow-y: auto;
  padding-right: 2px;
}
.sa-bubble {
  margin: 0;
  padding: 8px 11px;
  border-radius: 12px;
  font-size: 12.5px;
  line-height: 1.55;
  word-break: break-word;
}
.sa-bubble.is-agent { background: #f5f6fd; color: #3c4266; border-bottom-left-radius: 4px; }
.sa-bubble.is-student { margin-left: auto; background: var(--color-primary-soft, #fff1e3); color: #7a4a12; border-bottom-right-radius: 4px; }

/* 老师每句话前面那个小喇叭：竖排贴着气泡左侧，不占正文宽度 */
.sa-line {
  display: flex;
  align-items: flex-end;
  gap: 5px;
  min-width: 0;
}
.sa-line > .sa-bubble { min-width: 0; }
.sa-speak {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  min-height: 0;
  margin-bottom: 1px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  color: #8d95bd;
  line-height: 1;
  transition: color .16s, background .16s;
  /* 绘画页侧栏只有 ~100px 宽，面板往左伸出去的那半截会被画布浮层整块盖住。
     喇叭连同它所在的那一列一起「贴到气泡内侧」，用户肉眼看到的位置也就都能点到 */
  order: -1;
  align-self: flex-start;
}
.sa-speak:hover { background: #eceffb; color: #5560a8; }
/* 正在念这一句：点亮 + 轻轻呼吸，用户一眼知道是这句在响 */
.sa-speak.is-on { background: #e6ebff; color: #4b57b0; animation: saSpeak 1.4s ease-in-out infinite; }
/* 总开关关着：灰掉，但仍然可点（点一下提示去开总开关） */
.sa-speak.is-off { color: #c3c9de; }
@keyframes saSpeak {
  0%, 100% { box-shadow: 0 0 0 0 rgba(75, 87, 176, .22); }
  50% { box-shadow: 0 0 0 4px rgba(75, 87, 176, .06); }
}
@media (prefers-reduced-motion: reduce) {
  .sa-speak.is-on { animation: none; }
}

/* 「正在想」的三个点：不写文字，用户也知道老师在转 */
.sa-bubble.is-thinking {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  padding: 11px;
}
.sa-bubble.is-thinking i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #98a0c8;
  animation: saThink 1.1s ease-in-out infinite;
}
.sa-bubble.is-thinking i:nth-child(2) { animation-delay: .16s; }
.sa-bubble.is-thinking i:nth-child(3) { animation-delay: .32s; }
@keyframes saThink {
  0%, 70%, 100% { opacity: .28; transform: translateY(0); }
  35% { opacity: 1; transform: translateY(-2px); }
}
@media (prefers-reduced-motion: reduce) {
  .sa-bubble.is-thinking i { animation: none; opacity: .6; }
}

.sa-detail {
  display: grid;
  gap: 4px;
  padding: 9px 11px;
  border-radius: 12px;
  border: 1px dashed rgba(255, 122, 0, .35);
  background: #fffaf4;
}
.sa-detail-title { margin: 0; color: #b26a1d; font-size: 11.5px; font-weight: 800; }
.sa-detail-prompt { margin: 0; color: #4a4235; font-size: 12.5px; line-height: 1.6; }
.sa-detail-sub { margin: 0; color: #8a7c66; font-size: 11.5px; line-height: 1.5; }
.sa-detail-sub.is-warn { color: #b4733c; }
.sa-question-list { margin: 0; padding-left: 16px; display: grid; gap: 3px; color: #4a4235; font-size: 12.5px; }

.sa-busy { margin: 0; color: #8b93bd; font-size: 11.5px; }

.sa-samples { display: flex; flex-wrap: wrap; gap: 5px; }
.sa-sample {
  min-height: 0;
  padding: 5px 9px;
  border: 1px solid rgba(118, 126, 199, .22);
  border-radius: 999px;
  background: #fff;
  color: #5a63a0;
  font-size: 11px;
  line-height: 1.3;
}
.sa-sample:hover { border-color: rgba(255, 122, 0, .5); color: var(--color-primary, #ff7a00); background: var(--color-primary-soft, #fff1e3); }

.sa-input-row {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid #eff1f9;
}
.sa-input {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 34px;
  max-height: 76px;
  padding: 8px 10px;
  border: 1px solid #e3e6f5;
  border-radius: 10px;
  background: #fbfbfe;
  color: #333a5e;
  font-size: 12.5px;
  line-height: 1.5;
  resize: none;
  outline: none;
}
.sa-input:focus { border-color: rgba(255, 122, 0, .55); background: #fff; }
.sa-send {
  flex: 0 0 auto;
  width: 46px;
  min-height: 34px;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: var(--color-primary, #ff7a00);
  color: #fff;
  font-size: 12.5px;
  font-weight: 800;
}
.sa-send:disabled { opacity: .45; }

/* 麦克风：全局 button 有 min-height，这里必须显式清掉，否则会被撑成方块 */
.sa-mic {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 34px;
  min-height: 34px;
  padding: 0;
  border: 1px solid #e3e6f5;
  border-radius: 10px;
  background: #fbfbfe;
  color: #6b74ad;
  line-height: 1;
  transition: border-color .16s ease, background .16s ease, color .16s ease;
}
.sa-mic:hover { border-color: rgba(255, 122, 0, .45); color: var(--color-primary, #ff7a00); }
.sa-mic:disabled { opacity: .45; }
.sa-mic.is-live {
  border-color: rgba(255, 122, 0, .7);
  background: var(--color-primary-soft, #fff1e3);
  color: var(--color-primary, #ff7a00);
  animation: saMicPulse 1.15s ease-in-out infinite;
}
.sa-mic.is-busy { color: var(--color-primary, #ff7a00); }
@keyframes saMicPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 122, 0, .34); }
  55% { box-shadow: 0 0 0 6px rgba(255, 122, 0, 0); }
}
@media (prefers-reduced-motion: reduce) {
  .sa-mic.is-live { animation: none; }
}

.sa-links {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding-top: 7px;
  border-top: 1px dashed #eef0f8;
}
.sa-link {
  min-height: 0;
  padding: 3px 8px;
  border: 1px solid rgba(118, 126, 199, .2);
  border-radius: 8px;
  background: #f8f9fe;
  color: #5a63a0;
  font-size: 11px;
  line-height: 1.4;
}
.sa-link:hover { border-color: rgba(255, 122, 0, .45); color: var(--color-primary, #ff7a00); }

.sa-pop-enter-active, .sa-pop-leave-active { transition: opacity .16s ease, transform .16s ease; }
.sa-pop-enter-from, .sa-pop-leave-to { opacity: 0; transform: translateY(6px); }

@media (max-width: 520px) {
  .sa-panel { width: calc(100vw - 24px); max-height: min(460px, 62vh); }
  .sa-dock.is-inline .sa-panel { width: calc(100vw - 24px); margin-left: 0; left: 0; }
  .sa-dock.is-floating .sa-figure-btn { width: 74px; }
  .sa-dock.is-floating .sa-figure { width: 74px; }
  .sa-dock.is-inline .sa-figure-btn { width: 140px; }
}

@media (prefers-reduced-motion: reduce) {
  .sa-figure, .sa-figure-shadow { animation: none; }
  .sa-pop-enter-active, .sa-pop-leave-active { transition: none; }
}
</style>
