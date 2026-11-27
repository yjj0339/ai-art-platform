<template>
  <main class="partner-page" :class="{ 'history-open': historyOpen }">
    <!-- 左侧：聊天记录（平板横屏常驻，窄屏收成抽屉） -->
    <aside class="partner-history" aria-label="聊天记录">
      <div class="history-head">
        <button class="icon-btn only-narrow" type="button" aria-label="收起聊天记录" @click="historyOpen = false">
          <el-icon><Close /></el-icon>
        </button>
      </div>
      <button class="new-chat-btn" type="button" :disabled="streaming" @click="startNewChat">
        <el-icon><Plus /></el-icon>
        新的聊天
      </button>
      <p class="history-label">聊天记录</p>
      <div class="history-list">
        <p v-if="historyLoading" class="history-empty">正在加载…</p>
        <p v-else-if="!conversations.length" class="history-empty">还没有聊天记录，开始第一次聊天吧</p>
        <div
          v-for="item in conversations"
          :key="item.id"
          class="history-item"
          :class="{ active: item.id === currentId }"
        >
          <button class="history-open-btn" type="button" :disabled="streaming" @click="openConversation(item.id)">
            <span class="history-title">{{ item.title || '新的聊天' }}</span>
            <span class="history-time">{{ formatTime(item.updatedAt) }}</span>
          </button>
          <button class="icon-btn history-delete" type="button" :disabled="streaming" aria-label="删除这次聊天" @click="removeConversation(item)">
            <el-icon><Delete /></el-icon>
          </button>
        </div>
      </div>
    </aside>
    <div class="history-mask only-narrow" @click="historyOpen = false" />

    <!-- 右侧：对话 -->
    <section class="partner-main">
      <header class="partner-header">
        <button class="icon-btn only-narrow" type="button" aria-label="打开聊天记录" @click="historyOpen = true">
          <el-icon><Fold /></el-icon>
        </button>
        <div class="partner-identity">
          <span class="partner-avatar" aria-hidden="true">
            <img v-if="avatarUrl" :src="avatarUrl" alt="">
            <el-icon v-else><MagicStick /></el-icon>
          </span>
          <div>
            <h1>{{ config?.name || 'AI 伙伴' }}</h1>
            <p>{{ statusLine }}</p>
          </div>
        </div>
        <span v-if="remainingToday !== null" class="quota-pill" :class="{ low: remainingToday <= 3 }">
          今天还能聊 {{ remainingToday }} 次
        </span>
      </header>

      <div ref="scroller" class="partner-scroll" @scroll.passive="onScroll">
        <div class="partner-column">
          <!-- 加载 / 不可用 -->
          <div v-if="loadingConfig" class="state-card">
            <el-icon class="is-loading"><Loading /></el-icon>
            <p>正在叫醒 AI 伙伴…</p>
          </div>
          <div v-else-if="configError" class="state-card">
            <el-icon><WarningFilled /></el-icon>
            <p>{{ configError }}</p>
            <button class="primary-btn" type="button" @click="loadConfig">再试一次</button>
          </div>
          <div v-else-if="!config.enabled" class="state-card">
            <el-icon><Moon /></el-icon>
            <p>AI 伙伴暂时没有开放，过段时间再来看看吧。</p>
          </div>

          <template v-else>
            <!-- 空对话：问候 + 技能 + 快捷说法 -->
            <section v-if="!messages.length" class="welcome">
              <p class="welcome-greeting">{{ config.greeting }}</p>
              <p v-if="!config.ready" class="welcome-warn">管理员还没有给 AI 伙伴配置好模型，现在发消息会失败，请先联系管理员。</p>
              <div v-if="skillList.length" class="skill-grid" aria-label="AI 伙伴会的本领">
                <button
                  v-for="skill in skillList"
                  :key="skill.slug"
                  type="button"
                  class="skill-card"
                  :class="{ active: activeSkill?.slug === skill.slug }"
                  :style="{ '--skill-color': skill.color || '#6c5ce7' }"
                  @click="pickSkill(skill)"
                >
                  <span class="skill-icon" aria-hidden="true">
                    <img v-if="skill.coverUrl" :src="skill.coverUrl" alt="">
                    <template v-else>{{ skill.icon || '✨' }}</template>
                  </span>
                  <span class="skill-text">
                    <strong>{{ skill.title }}</strong>
                    <small>{{ skill.description }}</small>
                  </span>
                </button>
              </div>
              <div class="prompt-chips">
                <button v-for="text in starterPrompts" :key="text" type="button" class="chip" @click="sendText(text)">
                  {{ text }}
                </button>
              </div>
            </section>

            <!-- 消息 -->
            <article
              v-for="message in messages"
              :key="message.key"
              class="msg"
              :class="[`msg-${message.role}`, { 'msg-error': message.status === 'error' }]"
            >
              <template v-if="message.role === 'user'">
                <div class="user-bubble">
                  <span v-if="message.skill" class="skill-tag">{{ message.skill.icon || '✨' }} {{ message.skill.title }}</span>
                  <div v-if="message.attachments.length" class="attach-row">
                    <img v-for="item in message.attachments" :key="item.url" :src="item.url" :alt="item.name || '图片'" @click="viewer = item.url">
                  </div>
                  <p v-if="message.text">{{ message.text }}</p>
                </div>
              </template>

              <template v-else>
                <span class="msg-avatar" aria-hidden="true"><el-icon><MagicStick /></el-icon></span>
                <div class="assistant-body">
                  <div v-if="message.skills.length" class="skill-used">
                    <span v-for="skill in message.skills" :key="skill.slug" class="skill-tag">{{ skill.icon || '✨' }} 用了「{{ skill.title }}」</span>
                  </div>
                  <ul v-if="message.tools.length" class="tool-steps" aria-label="AI 伙伴正在做的事">
                    <li v-for="tool in message.tools" :key="tool.id" :class="`tool-${tool.status}`">
                      <el-icon v-if="tool.status === 'running'" class="is-loading"><Loading /></el-icon>
                      <el-icon v-else-if="tool.status === 'done'"><CircleCheckFilled /></el-icon>
                      <el-icon v-else><CircleCloseFilled /></el-icon>
                      <span>{{ tool.label }}</span>
                      <small v-if="tool.summary">{{ tool.summary }}</small>
                    </li>
                  </ul>

                  <div v-if="message.text" class="assistant-text" v-html="renderText(message.text)" />
                  <div v-else-if="message.status === 'streaming' && !message.cards.length" class="typing" aria-label="正在思考">
                    <i /><i /><i />
                  </div>

                  <!-- 生成结果卡片 -->
                  <div v-for="(card, index) in message.cards" :key="`${message.key}-${index}`" class="result-card" :class="`card-${card.type}`">
                    <template v-if="card.type === 'image'">
                      <button class="image-frame" type="button" :style="{ aspectRatio: ratioCss(card.ratio) }" aria-label="放大查看图片" @click="viewer = card.url">
                        <img :src="card.url" :alt="card.prompt || 'AI 生成的图片'" loading="lazy">
                      </button>
                      <div class="card-actions">
                        <a class="ghost-btn small" :href="card.url" :download="`AI伙伴-${index + 1}.png`">
                          <el-icon><Download /></el-icon>保存图片
                        </a>
                        <button v-if="config.canGenerateVideos" class="ghost-btn small" type="button" :disabled="streaming || composerDisabled" @click="sendText('把刚才那张图做成一段小视频')">
                          <el-icon><VideoCamera /></el-icon>变成视频
                        </button>
                      </div>
                    </template>

                    <template v-else-if="card.type === 'video'">
                      <div class="video-frame" :style="{ aspectRatio: ratioCss(videoOf(card).ratio || card.ratio) }">
                        <video v-if="videoOf(card).status === 'succeeded' && videoOf(card).videoUrl" :src="videoOf(card).videoUrl" controls playsinline preload="metadata" />
                        <div v-else-if="videoOf(card).status === 'failed'" class="video-state failed">
                          <el-icon><CircleCloseFilled /></el-icon>
                          <p>{{ videoOf(card).error || '视频没有做成，请稍后再试。' }}</p>
                          <small v-if="videoOf(card).refund?.credits">已退回 {{ videoOf(card).refund.credits }} 积分</small>
                        </div>
                        <div v-else class="video-state">
                          <el-icon class="is-loading"><Loading /></el-icon>
                          <p>视频制作中，大约 1~3 分钟，可以先接着聊</p>
                          <div class="progress"><span :style="{ width: `${Math.max(6, videoOf(card).progress || 0)}%` }" /></div>
                        </div>
                      </div>
                      <p v-if="videoOf(card).temporary" class="card-note">视频还没存到站内，请尽快下载保存。</p>
                    </template>

                    <template v-else-if="card.type === 'layout'">
                      <div class="layout-preview" :style="{ '--layout-color': card.color || '#6c5ce7' }">
                        <header>
                          <span>{{ card.kind === 'storyboard' ? '分镜' : '详情页' }}</span>
                          <h3>{{ card.title }}</h3>
                          <p v-if="card.subtitle">{{ card.subtitle }}</p>
                        </header>
                        <section v-for="(section, sIndex) in card.sections" :key="sIndex" class="layout-section">
                          <img v-if="section.image" :src="section.image" :alt="section.heading || '配图'" loading="lazy" @click="viewer = section.image">
                          <h4 v-if="section.heading">
                            <span v-if="card.kind === 'storyboard'" class="shot-no">{{ sIndex + 1 }}</span>{{ section.heading }}
                          </h4>
                          <p v-if="section.text">{{ section.text }}</p>
                        </section>
                      </div>
                      <div class="card-actions">
                        <button class="primary-btn small" type="button" :disabled="exporting" @click="exportLayout(card)">
                          <el-icon :class="{ 'is-loading': exporting }"><component :is="exporting ? Loading : Download" /></el-icon>
                          {{ exporting ? '正在生成长图…' : '保存为长图' }}
                        </button>
                      </div>
                    </template>
                  </div>

                  <div v-if="message.actions.length" class="action-row">
                    <button v-for="(action, index) in message.actions" :key="index" type="button" class="action-btn" :title="action.reason || ''" @click="openAction(action)">
                      {{ action.label }}
                      <el-icon><Right /></el-icon>
                    </button>
                  </div>

                  <div v-if="message.notice" class="notice-banner" role="status">
                    <el-icon><WarningFilled /></el-icon>
                    <span>{{ message.notice.message }}</span>
                  </div>
                  <div v-if="message.status === 'error'" class="error-line" role="alert">
                    <el-icon><WarningFilled /></el-icon>
                    <span>{{ message.error }}</span>
                    <button v-if="message.retryText !== undefined && !streaming" type="button" class="link-btn" @click="retry(message)">再试一次</button>
                  </div>
                  <p v-if="message.usage" class="usage-line">
                    <template v-if="message.usage.credits">用了 {{ message.usage.credits }} 积分</template>
                    <template v-if="message.usage.refunded"> · 退回 {{ message.usage.refunded }} 积分</template>
                    <template v-if="message.usage.balance !== undefined"> · 还剩 {{ message.usage.balance }}</template>
                  </p>
                  <div v-if="message.status === 'done' && message.text && speechSupported" class="msg-tools">
                    <button type="button" class="link-btn" @click="toggleSpeak(message)">
                      {{ speakingId === message.key ? '停止朗读' : '读给我听' }}
                    </button>
                  </div>
                </div>
              </template>
            </article>
          </template>
        </div>
      </div>

      <button v-if="!atBottom && messages.length" class="jump-btn" type="button" aria-label="回到最新消息" @click="scrollToBottom(true)">
        <el-icon><Bottom /></el-icon>
      </button>

      <!-- 输入区 -->
      <footer v-if="config?.enabled" class="composer-wrap">
        <div class="composer" :class="{ disabled: composerDisabled }">
          <div v-if="activeSkill || attachments.length" class="composer-top">
            <span v-if="activeSkill" class="skill-tag removable">
              {{ activeSkill.icon || '✨' }} {{ activeSkill.title }}
              <button type="button" aria-label="不用这个本领" @click="activeSkill = null"><el-icon><Close /></el-icon></button>
            </span>
            <span v-for="(item, index) in attachments" :key="item.url" class="attach-chip">
              <img :src="item.preview || item.url" :alt="item.name">
              <button type="button" aria-label="移除这张图片" @click="attachments.splice(index, 1)"><el-icon><Close /></el-icon></button>
            </span>
          </div>
          <p v-if="limitReached" class="composer-note">今天的聊天次数用完啦，明天再来找我吧～</p>
          <p v-else-if="voiceState !== 'idle'" class="composer-note voice">
            {{ voiceState === 'listening' ? (voicePreview || '我在听，说完再点一下麦克风') : '正在把声音变成文字…' }}
          </p>
          <div class="composer-row">
            <button class="icon-btn tool" type="button" :disabled="composerDisabled || uploading || attachments.length >= 3" aria-label="添加图片" @click="pickFiles">
              <el-icon :class="{ 'is-loading': uploading }"><component :is="uploading ? Loading : Picture" /></el-icon>
            </button>
            <button
              v-if="voiceSupported"
              class="icon-btn tool"
              :class="{ recording: voiceState === 'listening' }"
              type="button"
              :disabled="composerDisabled || voiceState === 'transcribing'"
              :aria-label="voiceState === 'listening' ? '说完了' : '用说的'"
              @click="toggleVoice"
            >
              <el-icon><Microphone /></el-icon>
            </button>
            <textarea
              ref="inputRef"
              v-model="input"
              rows="1"
              :maxlength="1200"
              :disabled="composerDisabled"
              :placeholder="activeSkill?.starterPrompts?.[0] ? `比如：${activeSkill.starterPrompts[0]}` : '想画什么？告诉我吧'"
              @input="autoGrow"
              @keydown="onKeydown"
              @paste="onPaste"
            />
            <button v-if="streaming" class="send-btn stop" type="button" aria-label="停止回答" @click="stopStreaming">
              <el-icon><VideoPause /></el-icon>
            </button>
            <button v-else class="send-btn" type="button" :disabled="!canSend" aria-label="发送" @click="sendText()">
              <el-icon><Promotion /></el-icon>
            </button>
          </div>
        </div>
        <p class="composer-hint">AI 也会出错，重要的事情记得问问讲师或家人</p>
        <input ref="fileRef" class="sr-only" type="file" accept="image/png,image/jpeg,image/webp" multiple @change="onFiles">
      </footer>
    </section>

    <!-- 看大图 -->
    <div v-if="viewer" class="viewer" role="dialog" aria-label="查看大图" @click="viewer = ''">
      <img :src="viewer" alt="大图">
      <button class="icon-btn viewer-close" type="button" aria-label="关闭"><el-icon><Close /></el-icon></button>
    </div>
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft, Bottom, CircleCheckFilled, CircleCloseFilled, Close, Delete, Download, Fold, Loading, MagicStick,
  Microphone, Moon, Picture, Plus, Promotion, Right, VideoCamera, VideoPause, WarningFilled,
} from '@element-plus/icons-vue'
import { apiClient } from '../services/apiClient'
import {
  deleteAgentConversation, getAgentConfig, getAgentConversation, listAgentConversations, streamAgentChat,
} from '../services/agentGateway'
import { createVoiceTalker, isRecognitionSupported, isSpeechSupported, speakAgentText, speakingId, stopAllSpeech } from '../utils/agentSpeech'
import { downloadBlob, renderLayoutLongImage } from '../utils/layoutLongImage'

const router = useRouter()
const route = useRoute()

const config = ref(null)
const loadingConfig = ref(true)
const configError = ref('')
const conversations = ref([])
const historyLoading = ref(false)
const historyOpen = ref(false)
const currentId = ref('')
const messages = ref([])
const input = ref('')
const attachments = ref([])
const uploading = ref(false)
const activeSkill = ref(null)
const streaming = ref(false)
const remainingToday = ref(null)
const viewer = ref('')
const exporting = ref(false)
const atBottom = ref(true)
const voiceState = ref('idle')
const voicePreview = ref('')
const videos = reactive({})
const scroller = ref(null)
const inputRef = ref(null)
const fileRef = ref(null)
let controller = null
let keySeed = 0
const videoTimers = new Map()
const speechSupported = isSpeechSupported()
const voiceSupported = isRecognitionSupported() || (typeof window !== 'undefined' && Boolean(window.MediaRecorder))

const avatarUrl = computed(() => {
  const value = String(config.value?.avatar || '')
  return value.startsWith('/') || value.startsWith('https://') ? value : ''
})
const skillList = computed(() => (config.value?.skills || []).slice(0, 8))
const starterPrompts = computed(() => {
  const fromSkill = activeSkill.value?.starterPrompts || []
  return (fromSkill.length ? fromSkill : config.value?.quickPrompts || []).slice(0, 4)
})
const limitReached = computed(() => remainingToday.value !== null && remainingToday.value <= 0)
const composerDisabled = computed(() => !config.value?.enabled || limitReached.value)
const canSend = computed(() => !composerDisabled.value && !uploading.value && Boolean(input.value.trim() || attachments.value.length))
const statusLine = computed(() => {
  if (streaming.value) return '正在回答…'
  if (!config.value) return '你的创作伙伴'
  const abilities = ['聊天出主意']
  if (config.value.canGenerateImages) abilities.push('画图')
  if (config.value.canGenerateVideos) abilities.push('做视频')
  return `可以${abilities.join('、')}`
})

/* ---------------- 文字渲染（只做加粗、列表、小标题，先转义，不渲染外部链接） ---------------- */
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
function renderText(text) {
  const escaped = String(text || '').replace(/[&<>"']/g, (c) => ESCAPES[c])
  const inline = (value) => value.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`\n]+)`/g, '<code>$1</code>')
  let html = ''
  let list = ''
  for (const raw of escaped.split('\n')) {
    const line = raw.trimEnd()
    const item = line.match(/^\s*(?:([-*•])|(\d+)[.、)])\s+(.+)$/)
    if (item) {
      const tag = item[1] ? 'ul' : 'ol'
      if (list !== tag) { if (list) html += `</${list}>`; html += `<${tag}>`; list = tag }
      html += `<li>${inline(item[3])}</li>`
      continue
    }
    if (list) { html += `</${list}>`; list = '' }
    const heading = line.match(/^#{1,6}\s+(.+)$/)
    if (heading) html += `<p class="md-h">${inline(heading[1])}</p>`
    else if (line.trim()) html += `<p>${inline(line)}</p>`
  }
  if (list) html += `</${list}>`
  return html
}

function ratioCss(ratio) {
  const match = String(ratio || '').match(/^(\d+):(\d+)$/)
  return match ? `${match[1]} / ${match[2]}` : '1 / 1'
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  const pad = (n) => String(n).padStart(2, '0')
  if (sameDay) return `今天 ${pad(date.getHours())}:${pad(date.getMinutes())}`
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

/* ---------------- 消息模型 ---------------- */
function blankAssistant() {
  return reactive({ key: `m${++keySeed}`, id: '', role: 'assistant', text: '', skills: [], tools: [], cards: [], actions: [], notice: null, usage: null, status: 'streaming', error: '' })
}

function fromStored(item) {
  const parts = Array.isArray(item.parts) ? item.parts : []
  if (item.role === 'user') {
    const skill = parts.find((part) => part.type === 'skill') || null
    return reactive({
      key: `m${++keySeed}`, id: item.id, role: 'user', text: item.content || '', skill,
      attachments: parts.filter((part) => part.type === 'attachment' && /^\/api\/assets\//.test(part.url || '')),
    })
  }
  const message = blankAssistant()
  message.id = item.id
  message.text = item.content || ''
  message.status = item.status === 'error' ? 'error' : 'done'
  if (message.status === 'error' && !message.text) message.error = '这条回答没有完成。'
  for (const part of parts) applyPart(message, part)
  return message
}

function applyPart(message, part) {
  if (!part || typeof part !== 'object') return
  if (part.type === 'skill') {
    if (!message.skills.some((item) => item.slug === part.slug)) message.skills.push(part)
  } else if (part.type === 'tool') {
    const index = message.tools.findIndex((item) => item.id === part.id)
    if (index >= 0) message.tools[index] = { ...part }
    else message.tools.push({ ...part })
  } else if (part.type === 'image' && part.url) {
    message.cards.push({ ...part })
  } else if (part.type === 'video' && part.taskId) {
    message.cards.push({ ...part })
    watchVideo(part)
  } else if (part.type === 'layout') {
    message.cards.push({ ...part, sections: Array.isArray(part.sections) ? part.sections : [] })
  } else if (part.type === 'action' && typeof part.path === 'string' && part.path.startsWith('/')) {
    message.actions.push({ ...part })
  }
}

function applyEvent(message, type, data) {
  switch (type) {
    case 'meta':
      if (data.conversationId && data.conversationId !== currentId.value) {
        currentId.value = data.conversationId
        if (!conversations.value.some((item) => item.id === data.conversationId)) {
          conversations.value.unshift({ id: data.conversationId, title: data.title || '新的聊天', updatedAt: new Date().toISOString() })
        }
      }
      if (remainingToday.value !== null) remainingToday.value = Math.max(0, remainingToday.value - 1)
      break
    case 'delta':
      message.text += data.text || ''
      break
    case 'replace':
      message.text = data.text || ''
      break
    case 'notice':
      message.notice = { kind: data.kind, message: data.message || '' }
      break
    case 'skill': case 'tool': case 'image': case 'video': case 'layout': case 'action':
      applyPart(message, { ...data, type })
      break
    case 'usage': {
      const usage = message.usage || { credits: 0, refunded: 0 }
      usage.credits += Number(data.credits) || 0
      usage.refunded += Number(data.refunded) || 0
      if (data.balance !== undefined && data.balance !== null) usage.balance = data.balance
      message.usage = usage
      break
    }
    case 'error':
      message.status = 'error'
      message.error = data.message || 'AI 伙伴这次没回答上来，请再试一次。'
      break
    case 'done':
      if (data.messageId) message.id = data.messageId
      if (message.status !== 'error') message.status = 'done'
      break
    default:
      break
  }
  if (type !== 'meta' && type !== 'usage') scrollToBottom()
}

/* ---------------- 视频：后台生成，轮询进度 ---------------- */
function videoOf(card) {
  return videos[card.taskId] || { status: card.status || 'queued', progress: 0, ratio: card.ratio }
}

function watchVideo(part) {
  if (!part.taskId || videoTimers.has(part.taskId)) return
  if (!videos[part.taskId]) videos[part.taskId] = { status: part.status || 'queued', progress: 0, ratio: part.ratio }
  const poll = async () => {
    try {
      const { data } = await apiClient.get(`/agent/videos/${encodeURIComponent(part.taskId)}`, { timeout: 30000 })
      if (data.video) videos[part.taskId] = data.video
      if (['succeeded', 'failed'].includes(data.video?.status)) {
        videoTimers.delete(part.taskId)
        return
      }
    } catch (error) {
      if (error?.response?.status === 404 || error?.response?.status === 403) {
        videos[part.taskId] = { status: 'failed', error: '这个视频找不到了。' }
        videoTimers.delete(part.taskId)
        return
      }
    }
    if (videoTimers.has(part.taskId)) videoTimers.set(part.taskId, setTimeout(poll, 6000))
  }
  videoTimers.set(part.taskId, setTimeout(poll, 1500))
}

function stopAllVideoPolling() {
  for (const timer of videoTimers.values()) clearTimeout(timer)
  videoTimers.clear()
}

/* ---------------- 加载 ---------------- */
async function loadConfig() {
  loadingConfig.value = true
  configError.value = ''
  try {
    const data = await getAgentConfig()
    config.value = data
    remainingToday.value = typeof data.remainingToday === 'number' ? data.remainingToday : null
    const wanted = String(route.query.skill || '')
    if (wanted) activeSkill.value = (data.skills || []).find((skill) => skill.slug === wanted) || null
  } catch (error) {
    configError.value = error?.response?.data?.message || 'AI 伙伴暂时联系不上，请检查网络后再试。'
  } finally {
    loadingConfig.value = false
  }
}

async function loadHistory() {
  historyLoading.value = true
  try {
    conversations.value = await listAgentConversations()
  } catch {
    conversations.value = []
  } finally {
    historyLoading.value = false
  }
}

async function openConversation(id) {
  if (streaming.value) return
  historyOpen.value = false
  if (id === currentId.value && messages.value.length) return
  stopAllVideoPolling()
  stopAllSpeech()
  try {
    const data = await getAgentConversation(id)
    currentId.value = id
    messages.value = (data.messages || []).map(fromStored)
    activeSkill.value = null
    await scrollToBottom(true)
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '这次聊天打不开了，请刷新后再试。')
  }
}

function startNewChat() {
  if (streaming.value) return
  stopAllVideoPolling()
  stopAllSpeech()
  currentId.value = ''
  messages.value = []
  attachments.value = []
  historyOpen.value = false
  nextTick(() => inputRef.value?.focus())
}

async function removeConversation(item) {
  try {
    await ElMessageBox.confirm(`删除「${item.title || '新的聊天'}」后就找不回来了，确定删除吗？`, '删除聊天记录', {
      confirmButtonText: '删除', cancelButtonText: '先不删', type: 'warning',
    })
  } catch {
    return
  }
  try {
    await deleteAgentConversation(item.id)
    conversations.value = conversations.value.filter((entry) => entry.id !== item.id)
    if (item.id === currentId.value) startNewChat()
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '删除失败，请稍后再试。')
  }
}

/* ---------------- 发送 ---------------- */
function pickSkill(skill) {
  activeSkill.value = activeSkill.value?.slug === skill.slug ? null : skill
  nextTick(() => inputRef.value?.focus())
}

async function sendText(preset) {
  const text = String(preset ?? input.value).trim()
  if (streaming.value || composerDisabled.value || uploading.value) return
  if (!text && !attachments.value.length) return
  stopAllSpeech()
  const sentAttachments = attachments.value.map(({ url, name }) => ({ url, name }))
  const skill = activeSkill.value
  messages.value.push(reactive({
    key: `m${++keySeed}`, id: '', role: 'user', text,
    skill: skill ? { slug: skill.slug, title: skill.title, icon: skill.icon } : null,
    attachments: attachments.value.map((item) => ({ url: item.preview || item.url, name: item.name })),
  }))
  if (preset === undefined) input.value = ''
  attachments.value = []
  autoGrow()
  const message = blankAssistant()
  message.retryText = text
  message.retryAttachments = sentAttachments
  message.retrySkill = skill
  messages.value.push(message)
  await scrollToBottom(true)
  await runStream(message, { message: text, attachments: sentAttachments, skill: skill?.slug || undefined })
}

async function runStream(message, body) {
  streaming.value = true
  controller = new AbortController()
  try {
    const result = await streamAgentChat({ ...body, conversationId: currentId.value || undefined, page: 'AI伙伴' }, {
      signal: controller.signal,
      onEvent: (type, data) => applyEvent(message, type, data),
    })
    if (result?.aborted) {
      message.status = 'done'
      if (!message.text) message.text = '（这次回答被你停下了）'
    } else if (message.status === 'streaming') {
      // 流结束了却没有收到 done（例如服务重启），按出错处理，方便重试。
      message.status = 'error'
      message.error = '回答中断了，请再试一次。'
    }
  } catch (error) {
    message.status = 'error'
    message.error = error?.message || 'AI 伙伴这次没回答上来，请再试一次。'
    if (error?.code === 401) message.retryText = undefined
  } finally {
    streaming.value = false
    controller = null
    touchConversation()
    scrollToBottom()
    // 服务端在第一轮回答后会给聊天起标题，悄悄刷新一下列表
    listAgentConversations().then((list) => { if (!streaming.value) conversations.value = list }).catch(() => {})
  }
}

function retry(message) {
  if (streaming.value || message.retryText === undefined) return
  const index = messages.value.indexOf(message)
  if (index > 0) messages.value.splice(index - 1, 2)
  attachments.value = (message.retryAttachments || []).map((item) => ({ ...item }))
  activeSkill.value = message.retrySkill || null
  input.value = message.retryText
  sendText()
}

function stopStreaming() {
  controller?.abort()
}

function touchConversation() {
  const item = conversations.value.find((entry) => entry.id === currentId.value)
  if (!item) return
  item.updatedAt = new Date().toISOString()
  conversations.value = [item, ...conversations.value.filter((entry) => entry !== item)]
}

function openAction(action) {
  if (typeof action.path !== 'string' || !action.path.startsWith('/') || action.path.startsWith('//')) return
  router.push(action.path)
}

/* ---------------- 输入辅助 ---------------- */
function onKeydown(event) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return
  // 触屏键盘上回车多半是想换行，只有实体键盘直接发送
  if (window.matchMedia?.('(pointer: coarse)').matches && !event.ctrlKey && !event.metaKey) return
  event.preventDefault()
  sendText()
}

function autoGrow() {
  nextTick(() => {
    const el = inputRef.value
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  })
}

function pickFiles() {
  fileRef.value?.click()
}

function onFiles(event) {
  const files = [...(event.target.files || [])]
  event.target.value = ''
  addPictures(files)
}

function onPaste(event) {
  const files = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith('image/'))
  if (!files.length) return
  event.preventDefault()
  addPictures(files)
}

function compressImage(file, maxSide = 1600) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.86))
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('这张图片打不开，换一张试试。'))
    }
    image.src = url
  })
}

async function addPictures(files) {
  const room = 3 - attachments.value.length
  const images = files.filter((file) => /^image\/(png|jpe?g|webp)$/.test(file.type)).slice(0, Math.max(0, room))
  if (!images.length) {
    if (files.length) ElMessage.warning(room <= 0 ? '一次最多带 3 张图片。' : '只能添加 PNG、JPG 或 WebP 图片。')
    return
  }
  uploading.value = true
  try {
    for (const file of images) {
      if (file.size > 20 * 1024 * 1024) { ElMessage.warning('图片太大了（超过 20MB），换一张小一点的吧。'); continue }
      const dataUrl = await compressImage(file)
      const { data } = await apiClient.post('/me/assets', {
        kind: 'agent-attachment',
        originalName: (file.name || '图片').slice(0, 60),
        mimeType: 'image/jpeg',
        base64: dataUrl,
      }, { timeout: 60000 })
      if (!data.asset?.id) throw new Error('图片上传失败，请再试一次。')
      attachments.value.push({ url: `/api/assets/${encodeURIComponent(data.asset.id)}`, name: file.name || '图片', preview: dataUrl })
    }
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || error?.message || '图片上传失败，请再试一次。')
  } finally {
    uploading.value = false
  }
}

const talker = createVoiceTalker({
  onState: (state, preview) => { voiceState.value = state; voicePreview.value = preview || '' },
  onText: (text) => {
    const value = String(text || '').trim()
    if (!value) return
    input.value = input.value ? `${input.value} ${value}` : value
    autoGrow()
    inputRef.value?.focus()
  },
  onError: (error) => ElMessage.warning(error?.message || '没听清，再说一次吧。'),
})

function toggleVoice() {
  stopAllSpeech()
  talker.toggle()
}

function toggleSpeak(message) {
  if (speakingId.value === message.key) {
    stopAllSpeech()
    return
  }
  speakAgentText(message.text.replace(/[*#`]/g, ''), { id: message.key })
}

/* ---------------- 长图导出 ---------------- */
async function exportLayout(card) {
  if (exporting.value) return
  exporting.value = true
  try {
    const blob = await renderLayoutLongImage(card)
    downloadBlob(blob, `${String(card.title || 'AI伙伴长图').replace(/[\\/:*?"<>|]/g, '').slice(0, 30)}.png`)
    ElMessage.success('长图已生成，正在保存')
  } catch (error) {
    ElMessage.error(error?.message || '长图生成失败，请再试一次。')
  } finally {
    exporting.value = false
  }
}

/* ---------------- 滚动 ---------------- */
function onScroll() {
  const el = scroller.value
  if (!el) return
  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80
}

async function scrollToBottom(force = false) {
  await nextTick()
  const el = scroller.value
  if (!el || (!force && !atBottom.value)) return
  el.scrollTop = el.scrollHeight
  atBottom.value = true
}

function onKeyEscape(event) {
  if (event.key === 'Escape') {
    if (viewer.value) viewer.value = ''
    else historyOpen.value = false
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKeyEscape)
  await loadConfig()
  // 首页「问问 AI 伙伴」带过来的话：先填进输入框，让小画家自己确认后再发
  if (route.query.q) {
    input.value = String(route.query.q).slice(0, 1200)
    autoGrow()
  }
  if (config.value?.enabled) {
    await loadHistory()
    const wanted = String(route.query.c || '')
    if (wanted && conversations.value.some((item) => item.id === wanted)) await openConversation(wanted)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyEscape)
  controller?.abort()
  stopAllVideoPolling()
  stopAllSpeech()
  talker.stop()
})
</script>

<style scoped>
.partner-page {
  --history-width: 288px;
  display: grid;
  grid-template-columns: var(--history-width) minmax(0, 1fr);
  height: calc(100vh - var(--app-top, 0px));
  height: calc(100dvh - var(--app-top, 0px));
  background: var(--color-bg);
  color: var(--color-text);
  overflow: hidden;
}

.sr-only { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.partner-page .only-narrow { display: none; }

/* 通用按钮（最小 44px 触控区） */
.icon-btn, .ghost-btn, .primary-btn, .link-btn, .chip, .action-btn {
  font: inherit;
  cursor: pointer;
  border: 0;
  -webkit-tap-highlight-color: transparent;
}
.icon-btn {
  display: inline-grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: transparent;
  color: var(--color-text);
  font-size: 20px;
}
.icon-btn:hover:not(:disabled) { background: var(--color-primary-soft); color: var(--color-primary); }
.icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ghost-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 14px;
  background: transparent;
  color: var(--color-text);
  font-weight: 600;
  text-decoration: none;
}
.ghost-btn:hover { background: var(--color-primary-soft); color: var(--color-primary); }
.ghost-btn.small, .primary-btn.small { min-height: 40px; padding: 0 14px; font-size: 14px; }
.ghost-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.primary-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 18px;
  border-radius: 14px;
  background: var(--color-primary);
  color: #fff;
  font-weight: 600;
}
.primary-btn:hover:not(:disabled) { background: var(--color-primary-hover); }
.primary-btn:disabled { opacity: 0.6; cursor: wait; }
.link-btn { padding: 4px 2px; background: none; color: var(--color-primary); font-size: 13px; font-weight: 600; }

/* 左侧聊天记录 */
.partner-history {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  padding: 16px 14px;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
}
.history-head { display: flex; align-items: center; justify-content: flex-end; } /* 返回在共用顶栏；这里只剩窄屏的「收起」 */
.new-chat-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 52px;
  border: 1.5px dashed var(--color-primary);
  border-radius: 16px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font: inherit;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}
.new-chat-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.history-label { margin: 8px 6px 0; color: var(--color-muted); font-size: 13px; font-weight: 600; }
.history-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; overscroll-behavior: contain; }
.history-empty { margin: 12px 6px; color: var(--color-muted); font-size: 14px; line-height: 1.6; }
.history-item { display: flex; align-items: center; border-radius: 14px; }
.history-item.active { background: var(--color-primary-soft); }
.history-item:hover:not(.active) { background: var(--color-bg); }
.history-open-btn {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 56px;
  padding: 8px 4px 8px 12px;
  border: 0;
  background: none;
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.history-title { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--color-title); font-size: 15px; font-weight: 600; }
.history-item.active .history-title { color: var(--color-primary); }
.history-time { color: var(--color-muted); font-size: 12px; }
.history-delete { flex: none; opacity: 0.55; font-size: 17px; }
.history-item:hover .history-delete, .history-item.active .history-delete { opacity: 1; }

/* 右侧主区 */
.partner-main { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.partner-header {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: var(--topbar-height, 68px);
  padding: 10px 24px;
  background: var(--glass, rgba(255, 255, 255, 0.78));
  border-bottom: 1px solid var(--color-border);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}
.partner-identity { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; }
.partner-identity h1 { margin: 0; color: var(--color-title); font-size: 19px; line-height: 1.3; }
.partner-identity p { margin: 0; color: var(--color-muted); font-size: 13px; }
.partner-avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 44px;
  height: 44px;
  overflow: hidden;
  border-radius: 50%;
  background: linear-gradient(135deg, #8b7cf6, #6c5ce7);
  color: #fff;
  font-size: 22px;
}
.partner-avatar img { width: 100%; height: 100%; object-fit: cover; }
.quota-pill { flex: none; padding: 6px 12px; border-radius: 999px; background: var(--color-mint-soft); color: var(--color-mint); font-size: 13px; font-weight: 600; }
.quota-pill.low { background: var(--color-sun-soft); color: #b97800; }

.partner-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scroll-padding-bottom: 24px; }
.partner-column { display: flex; flex-direction: column; gap: 22px; width: min(860px, 100%); margin: 0 auto; padding: 28px 24px 32px; }

.state-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 12vh;
  color: var(--color-muted);
  font-size: 16px;
  text-align: center;
}
.state-card .el-icon { font-size: 40px; color: var(--color-primary); }
.state-card p { margin: 0; max-width: 420px; line-height: 1.7; }

/* 欢迎区 */
.welcome { display: flex; flex-direction: column; gap: 18px; padding-top: 4vh; }
.welcome-greeting { margin: 0; color: var(--color-title); font-size: clamp(22px, 2.6vw, 28px); font-weight: 700; line-height: 1.5; }
.welcome-warn { margin: 0; padding: 12px 14px; border-radius: 14px; background: var(--color-sun-soft); color: #9a6400; font-size: 14px; line-height: 1.6; }
.skill-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.skill-card {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 76px;
  padding: 12px 14px;
  border: 1.5px solid var(--color-border);
  border-radius: 18px;
  background: var(--color-surface);
  text-align: left;
  font: inherit;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}
.skill-card:hover { border-color: var(--skill-color); box-shadow: var(--shadow-card); }
.skill-card:active { transform: scale(0.98); }
.skill-card.active { border-color: var(--skill-color); background: var(--color-primary-soft); background: color-mix(in srgb, var(--skill-color) 8%, #fff); }
.skill-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 48px;
  height: 48px;
  overflow: hidden;
  border-radius: 14px;
  background: var(--color-primary-soft);
  background: color-mix(in srgb, var(--skill-color) 14%, #fff);
  font-size: 24px;
}
.skill-icon img { width: 100%; height: 100%; object-fit: cover; }
.skill-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.skill-text strong { color: var(--color-title); font-size: 15px; }
.skill-text small { display: -webkit-box; overflow: hidden; color: var(--color-muted); font-size: 12.5px; line-height: 1.5; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.prompt-chips { display: flex; flex-wrap: wrap; gap: 10px; }
.chip {
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 14.5px;
}
.chip:hover { border-color: var(--color-primary); color: var(--color-primary); }

/* 消息 */
.msg { display: flex; gap: 12px; }
.msg-user { justify-content: flex-end; }
.user-bubble {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  max-width: min(78%, 620px);
  padding: 12px 16px;
  border-radius: 20px 20px 6px 20px;
  background: var(--color-primary);
  color: #fff;
}
.user-bubble p { margin: 0; font-size: 16px; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
.user-bubble .skill-tag { background: rgba(255, 255, 255, 0.2); color: #fff; }
.attach-row { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
.attach-row img { width: 96px; height: 96px; object-fit: cover; border-radius: 12px; background: rgba(255, 255, 255, 0.2); cursor: zoom-in; }
.msg-avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #8b7cf6, #6c5ce7);
  color: #fff;
  font-size: 18px;
}
.assistant-body { display: flex; flex-direction: column; gap: 10px; min-width: 0; flex: 1; }
.skill-used { display: flex; flex-wrap: wrap; gap: 6px; }
.skill-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 600;
}
.tool-steps { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 8px 12px; list-style: none; border-radius: 14px; background: var(--color-surface); border: 1px solid var(--color-border); }
.tool-steps li { display: flex; align-items: center; gap: 8px; min-height: 28px; color: var(--color-text); font-size: 13.5px; }
.tool-steps small { overflow: hidden; color: var(--color-muted); white-space: nowrap; text-overflow: ellipsis; }
.tool-running .el-icon { color: var(--color-primary); }
.tool-done .el-icon { color: var(--color-mint); }
.tool-error .el-icon { color: var(--color-danger); }
.assistant-text { color: var(--color-title); font-size: 16px; line-height: 1.75; overflow-wrap: anywhere; }
.assistant-text :deep(p) { margin: 0 0 8px; }
.assistant-text :deep(p:last-child) { margin-bottom: 0; }
.assistant-text :deep(.md-h) { font-weight: 700; }
.assistant-text :deep(ul), .assistant-text :deep(ol) { margin: 0 0 8px; padding-left: 22px; }
.assistant-text :deep(li) { margin: 2px 0; }
.assistant-text :deep(code) { padding: 1px 6px; border-radius: 6px; background: var(--color-bg); font-size: 0.92em; }
.typing { display: flex; gap: 5px; padding: 10px 0; }
.typing i { width: 8px; height: 8px; border-radius: 50%; background: var(--color-primary); opacity: 0.35; animation: typing 1.2s infinite ease-in-out; }
.typing i:nth-child(2) { animation-delay: 0.15s; }
.typing i:nth-child(3) { animation-delay: 0.3s; }
@keyframes typing { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }

.result-card { display: flex; flex-direction: column; gap: 10px; max-width: 560px; }
.image-frame { display: block; width: 100%; max-height: 520px; padding: 0; overflow: hidden; border: 0; border-radius: 20px; background: var(--color-border); cursor: zoom-in; }
.image-frame img { display: block; width: 100%; height: 100%; object-fit: cover; }
.card-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.card-actions .ghost-btn { border: 1px solid var(--color-border); background: var(--color-surface); }
.video-frame { width: 100%; max-height: 520px; overflow: hidden; border-radius: 20px; background: #1f2340; }
.video-frame video { display: block; width: 100%; height: 100%; object-fit: contain; background: #000; }
.video-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; height: 100%; min-height: 180px; padding: 20px; color: #fff; text-align: center; }
.video-state .el-icon { font-size: 30px; }
.video-state p { margin: 0; font-size: 14.5px; line-height: 1.6; opacity: 0.92; }
.video-state small { opacity: 0.8; }
.video-state.failed .el-icon { color: #ff9b9b; }
.progress { width: min(260px, 80%); height: 6px; overflow: hidden; border-radius: 99px; background: rgba(255, 255, 255, 0.2); }
.progress span { display: block; height: 100%; border-radius: inherit; background: #fff; transition: width 0.6s; }
.card-note { margin: 0; color: #b97800; font-size: 13px; }

.layout-preview { overflow: hidden; border: 1px solid var(--color-border); border-radius: 20px; background: #fff; }
.layout-preview header { padding: 20px 22px; background: var(--layout-color); color: #fff; }
.layout-preview header span { display: inline-block; padding: 2px 10px; border-radius: 99px; background: rgba(255, 255, 255, 0.22); font-size: 12px; font-weight: 600; }
.layout-preview h3 { margin: 8px 0 0; font-size: 22px; line-height: 1.4; }
.layout-preview header p { margin: 6px 0 0; font-size: 14px; line-height: 1.6; opacity: 0.9; }
.layout-section { display: flex; flex-direction: column; gap: 6px; padding: 16px 22px 4px; }
.layout-section:last-child { padding-bottom: 20px; }
.layout-section img { width: 100%; max-height: 420px; object-fit: cover; border-radius: 14px; cursor: zoom-in; }
.layout-section h4 { display: flex; align-items: center; gap: 8px; margin: 4px 0 0; color: var(--color-title); font-size: 16.5px; }
.layout-section p { margin: 0; color: var(--color-text); font-size: 14.5px; line-height: 1.7; }
.shot-no { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--layout-color); color: #fff; font-size: 13px; }

.action-row { display: flex; flex-wrap: wrap; gap: 8px; }
.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 16px;
  border: 1.5px solid var(--color-primary);
  border-radius: 14px;
  background: var(--color-surface);
  color: var(--color-primary);
  font-size: 14.5px;
  font-weight: 600;
}
.action-btn:hover { background: var(--color-primary-soft); }
.notice-banner, .error-line { display: flex; align-items: flex-start; gap: 8px; padding: 10px 14px; border-radius: 14px; font-size: 14px; line-height: 1.6; }
.notice-banner { background: var(--color-sun-soft); color: #9a6400; }
.error-line { align-items: center; flex-wrap: wrap; background: #fff1f1; color: #c24141; }
.notice-banner .el-icon, .error-line .el-icon { flex: none; margin-top: 3px; }
.error-line .el-icon { margin-top: 0; }
.usage-line { margin: 0; color: var(--color-muted); font-size: 12.5px; }
.msg-tools { display: flex; gap: 12px; }

.jump-btn {
  position: absolute;
  right: 28px;
  bottom: 150px;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-surface);
  box-shadow: var(--shadow-soft);
  color: var(--color-text);
  font-size: 18px;
  cursor: pointer;
}

/* 输入区 */
.composer-wrap { padding: 8px 24px calc(12px + env(safe-area-inset-bottom)); background: linear-gradient(to top, var(--color-bg) 70%, transparent); }
.composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(860px, 100%);
  margin: 0 auto;
  padding: 10px;
  border: 1.5px solid var(--color-border);
  border-radius: 24px;
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.composer:focus-within { border-color: var(--color-primary); box-shadow: 0 0 0 4px var(--color-primary-ring); }
.composer.disabled { opacity: 0.75; }
.composer-top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 2px 4px 0; }
.skill-tag.removable { padding-right: 4px; }
.skill-tag.removable button, .attach-chip button {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.attach-chip { position: relative; display: inline-flex; }
.attach-chip img { width: 56px; height: 56px; object-fit: cover; border-radius: 12px; border: 1px solid var(--color-border); }
.attach-chip button { position: absolute; top: -8px; right: -8px; width: 26px; height: 26px; background: var(--color-title); color: #fff; font-size: 12px; }
.composer-note { margin: 0; padding: 0 8px; color: var(--color-muted); font-size: 13.5px; }
.composer-note.voice { color: var(--color-primary); }
.composer-row { display: flex; align-items: flex-end; gap: 4px; }
.icon-btn.tool { width: 46px; height: 46px; color: var(--color-muted); font-size: 22px; }
.icon-btn.tool.recording { background: #fff1f1; color: var(--color-danger); animation: pulse 1.2s infinite; }
@keyframes pulse { 50% { box-shadow: 0 0 0 6px rgba(239, 90, 90, 0.15); } }
.composer textarea {
  flex: 1;
  min-width: 0;
  min-height: 46px;
  max-height: 160px;
  padding: 11px 8px;
  border: 0;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--color-title);
  font: inherit;
  font-size: 16px;
  line-height: 1.5;
  scrollbar-width: thin;
}
.composer textarea::placeholder { overflow: hidden; color: var(--color-muted); white-space: nowrap; text-overflow: ellipsis; }
.send-btn {
  display: grid;
  place-items: center;
  flex: none;
  width: 48px;
  height: 48px;
  border: 0;
  border-radius: 16px;
  background: var(--color-primary);
  color: #fff;
  font-size: 22px;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}
.send-btn:active:not(:disabled) { transform: scale(0.94); }
.send-btn:disabled { background: var(--color-border-strong); cursor: not-allowed; }
.send-btn.stop { background: var(--color-title); }
.composer-hint { margin: 6px 0 0; color: var(--color-muted); font-size: 12px; text-align: center; }

/* 大图 */
.viewer { position: fixed; inset: 0; z-index: 3000; display: grid; place-items: center; padding: 24px; background: rgba(15, 17, 35, 0.86); cursor: zoom-out; }
.viewer img { max-width: 100%; max-height: 100%; border-radius: 16px; object-fit: contain; }
.viewer-close { position: absolute; top: 16px; right: 16px; color: #fff; background: rgba(255, 255, 255, 0.14); }

/* 窄屏（竖屏平板 / 手机）：聊天记录变成抽屉 */
@media (max-width: 900px) {
  .partner-page { grid-template-columns: minmax(0, 1fr); }
  .partner-page .only-narrow { display: inline-grid; }
  .partner-history {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 2000;
    width: min(86vw, 320px);
    transform: translateX(-104%);
    transition: transform 0.22s ease;
    box-shadow: var(--shadow-pop);
  }
  .history-open .partner-history { transform: none; }
  .partner-page .history-mask { position: fixed; inset: 0; z-index: 1999; display: block; background: rgba(15, 17, 35, 0.32); opacity: 0; pointer-events: none; transition: opacity 0.2s; }
  .history-open .history-mask { opacity: 1; pointer-events: auto; }
  .partner-header { padding: 8px 12px; }
  .partner-column { padding: 20px 14px 24px; }
  .composer-wrap { padding: 6px 10px calc(10px + env(safe-area-inset-bottom)); }
  .user-bubble { max-width: 88%; }
  .jump-btn { right: 16px; }
}
@media (max-width: 520px) {
  .quota-pill { display: none; }
  .skill-grid { grid-template-columns: 1fr; }
  .msg-avatar { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .typing i, .icon-btn.tool.recording { animation: none; }
  .partner-history, .history-mask { transition: none; }
}
</style>
