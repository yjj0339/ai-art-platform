/**
 * 智能体朗读 / 听写的最小工具。
 *
 * 两件事先说清楚，免得后面误会：
 * 1. 朗读用设备自带的 speechSynthesis，不花钱、不依赖外网，iPad 也能用，但音色像导航播报。
 * 2. 听写优先用浏览器实时识别（Chrome 走 Google 服务器，国内常连不上），
 *    连不上自动退回「录音 → 后台转写」，这条是项目里本来就有的 /api/ai/audio/transcribe。
 */

import { ref } from 'vue'

const STORAGE_KEY = 'ai-agent-voice-muted'
/** 绘画页顶栏那个「语音 / 静音」按钮用的老键，面板开关要和它保持一致，不能各存各的 */
const PAGE_KEY = 'art-studio-muted'

export function isSpeechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function getMuted() {
  if (typeof localStorage === 'undefined') return false
  const stored = localStorage.getItem(STORAGE_KEY)
  // 老用户只在绘画页关过声音（只有 PAGE_KEY），这里也要认
  if (stored !== null) return stored === 'true'
  return localStorage.getItem(PAGE_KEY) === 'true'
}

/** 全站唯一的「要不要念」，面板喇叭和绘画页顶栏按钮都读它，改一处两边一起变 */
export const voiceMuted = ref(getMuted())

export function setMuted(value) {
  const next = Boolean(value)
  voiceMuted.value = next
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, String(next))
    localStorage.setItem(PAGE_KEY, String(next))
  }
  if (next) stopAllSpeech()
}

/** 喇叭 / 顶栏按钮都调这个，省得两边各写一遍取反 */
export function toggleMuted() {
  setMuted(!voiceMuted.value)
  return voiceMuted.value
}

export function stopSpeaking() {
  if (isSpeechSupported()) window.speechSynthesis.cancel()
}

/**
 * 现在是不是正念着某一句话。
 * 每句话旁边那个小喇叭要画成「念 / 停」两种样子，就得问这个。
 * 安卓 / iPad 的 speechSynthesis 有时候不触发 onend（比如页面被切走），
 * 所以额外算一个兜底时间，超过就当作念完了。
 */
export const speakingId = ref('')
let speakingTimer = 0

export function isSpeaking(id) {
  return Boolean(id) && speakingId.value === id
}

/** 掐掉正在念的话，把「正在念」的标记也一起清掉，否则小喇叭会一直显示成「停止」 */
export function stopAllSpeech() {
  clearTimeout(speakingTimer)
  speakingId.value = ''
  stopSpeaking()
}

/**
 * 念一句话。会先掐掉上一句——用户点得快的时候不能排长队。
 * @param {string} text
 * @param {{ muted?: boolean, rate?: number, id?: string, onEnd?: Function }} options
 */
export function speakAgentText(text, options = {}) {
  const content = String(text || '').trim()
  if (!content || options.muted || !isSpeechSupported()) return
  try {
    stopAllSpeech()
    const utterance = new SpeechSynthesisUtterance(content)
    utterance.lang = 'zh-CN'
    // 0.92 比默认稍慢，小用户听 1.0 会觉得赶
    utterance.rate = options.rate ?? 0.92
    utterance.pitch = 1.05
    // 最长按每字 0.45 秒兜底，设备不回报 onend 时也能把标记清掉
    const guardMs = Math.min(120000, 4000 + content.length * 450)
    const id = String(options.id || '')
    const finish = () => {
      clearTimeout(speakingTimer)
      if (id && speakingId.value === id) speakingId.value = ''
      if (typeof options.onEnd === 'function') options.onEnd()
    }
    utterance.onend = finish
    utterance.onerror = finish
    if (id) {
      speakingId.value = id
      clearTimeout(speakingTimer)
      speakingTimer = setTimeout(finish, guardMs)
    }
    window.speechSynthesis.speak(utterance)
  } catch {
    // 朗读失败不该影响任何业务，静默放过
  }
}

/* ---------------- 录音（自己拼 WAV，不依赖 webm 编码） ---------------- */

function encodeWav(chunks, sampleRate) {
  const sampleCount = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const buffer = new ArrayBuffer(44 + sampleCount * 2)
  const view = new DataView(buffer)
  const writeText = (offset, text) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
  writeText(0, 'RIFF')
  view.setUint32(4, 36 + sampleCount * 2, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, sampleCount * 2, true)
  let offset = 44
  chunks.forEach((chunk) => chunk.forEach((sample) => {
    const value = Math.max(-1, Math.min(1, sample))
    view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true)
    offset += 2
  }))
  return new Blob([buffer], { type: 'audio/wav' })
}

function createRecorder() {
  let stream = null
  let context = null
  let source = null
  let processor = null
  let chunks = []
  let sampleRate = 44100
  return {
    async start() {
      if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
        throw new Error('当前浏览器不能录音，请用最新版 Chrome / Edge')
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      context = new AudioContext()
      sampleRate = context.sampleRate
      source = context.createMediaStreamSource(stream)
      processor = context.createScriptProcessor(4096, 1, 1)
      chunks = []
      processor.onaudioprocess = (event) => {
        chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)))
      }
      source.connect(processor)
      processor.connect(context.destination)
    },
    async stop() {
      const blob = encodeWav(chunks, sampleRate)
      this.dispose()
      return blob
    },
    dispose() {
      try { processor?.disconnect() } catch {}
      try { source?.disconnect() } catch {}
      try { context?.close() } catch {}
      stream?.getTracks?.().forEach((track) => track.stop())
      stream = null
      context = null
      source = null
      processor = null
      chunks = []
    },
  }
}

/* ---------------- 听写 ---------------- */

function getRecognitionCtor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export function isRecognitionSupported() {
  return Boolean(getRecognitionCtor())
}

/**
 * 「点一下开始说，再点一下结束」的听写器。
 *
 * 用法：
 *   const talker = createVoiceTalker({ onState, onText, onError })
 *   talker.toggle()   // 第一次点：开始；第二次点：结束并返回文字
 *
 * onState(state, preview)
 *   state: 'idle' | 'listening' | 'transcribing'
 *   preview: 实时识别到的字（仅实时识别时有）
 */
export function createVoiceTalker({ onState = () => {}, onText = () => {}, onError = () => {} } = {}) {
  let recognition = null
  let collected = ''
  let recorder = null
  let listening = false
  let mode = '' // 'recognition' | 'recording'
  let cancelled = false

  function report(state, preview) {
    try { onState(state, preview) } catch {}
  }

  function dropRecognition() {
    if (!recognition) return
    try {
      recognition.onend = null
      recognition.onerror = null
      recognition.onresult = null
      recognition.stop()
    } catch {}
    recognition = null
  }

  async function transcribeRecording() {
    if (!recorder) return
    report('transcribing')
    try {
      const blob = await recorder.stop()
      recorder = null
      listening = false
      if (!blob.size) throw new Error('没有录到声音')
      const { transcribeArtworkVoice } = await import('../services/aiGateway')
      const text = await transcribeArtworkVoice(blob)
      report('idle')
      if (!cancelled) onText(text)
    } catch (error) {
      listening = false
      report('idle')
      if (!cancelled) onError(error)
    }
  }

  async function startRecording() {
    mode = 'recording'
    recorder = createRecorder()
    try {
      await recorder.start()
      listening = true
      report('listening', '')
    } catch (error) {
      recorder?.dispose()
      recorder = null
      listening = false
      report('idle')
      onError(error)
    }
  }

  function startRecognition() {
    const Ctor = getRecognitionCtor()
    if (!Ctor) return false
    const rec = new Ctor()
    rec.lang = 'zh-CN'
    rec.continuous = true
    rec.interimResults = true
    collected = ''
    rec.onresult = (event) => {
      let interim = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const piece = event.results[index][0].transcript
        if (event.results[index].isFinal) collected += piece
        else interim += piece
      }
      report('listening', (collected + interim).trim())
    }
    // 国内 Google 服务器连不上会走 onerror(network)，立刻改走录音
    rec.onerror = async () => {
      dropRecognition()
      await startRecording()
    }
    recognition = rec
    mode = 'recognition'
    listening = true
    try {
      rec.start()
      return true
    } catch {
      dropRecognition()
      listening = false
      return false
    }
  }

  return {
    get listening() {
      return listening
    },
    async toggle() {
      cancelled = false

      // —— 结束这一次 ——
      if (listening) {
        if (mode === 'recording') {
          await transcribeRecording()
          return
        }
        const text = collected.trim()
        listening = false
        dropRecognition()
        if (text) {
          report('idle')
          onText(text)
        } else {
          // 点了结束但一个字没听到 → 退回录音，让用户重说
          await startRecording()
        }
        return
      }

      // —— 开始 ——
      if (startRecognition()) {
        report('listening', '')
        return
      }
      await startRecording()
    },
    stop() {
      cancelled = true
      dropRecognition()
      recorder?.dispose()
      recorder = null
      listening = false
      mode = ''
      report('idle')
    },
  }
}
