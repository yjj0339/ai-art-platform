<template>
  <section class="sk" :class="[`mode-${difficulty}`, { 'is-collapsed': collapsed, 'is-dialog': dialogMode, 'is-young': difficulty === 'junior' || difficulty === 'starter' }]">
    <header class="sk-head">
      <span class="sk-head__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.2-1.7c.3-.4.7-.6 1.2-.6h3c.5 0 .9.2 1.2.6L15.9 6h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" /><circle cx="12" cy="12.5" r="3.4" fill="none" stroke="currentColor" stroke-width="1.7" /></svg>
      </span>
      <div class="sk-head__text">
        <strong>手绘草图扫描上传</strong>
        <p>拍摄手绘草稿，AI自动生成干净线稿，功能可跳过</p>
      </div>
      <span class="sk-status" :class="{ 'is-on': isEnabled }">{{ isEnabled ? '已启用' : '未使用' }}</span>
      <!-- 在弹窗里时不需要「收起」：关掉弹窗就行 -->
      <button v-if="!dialogMode" type="button" class="su-btn su-btn--sm su-btn--ghost" @click="collapsed = !collapsed">{{ collapsed ? '展开' : '收起' }}</button>
    </header>

    <transition name="sk-fold">
      <div v-if="!collapsed" class="sk-body">
        <button type="button" class="sk-trigger" @click="openScanner">
          <span class="sk-trigger__art" aria-hidden="true">
            <svg viewBox="0 0 120 90">
              <rect x="10" y="6" width="100" height="78" rx="14" fill="#fff" stroke="#c9c2f5" stroke-width="3" />
              <rect x="20" y="15" width="80" height="60" rx="7" fill="#f6f4ff" />
              <g class="sk-paper">
                <rect x="34" y="21" width="52" height="48" rx="4" fill="#fff" stroke="#ddd8fb" stroke-width="2" />
                <path d="M42 58c6-10 11-8 15-17 5 7 12 6 16 17" fill="none" stroke="#4b4f7a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                <circle cx="50" cy="34" r="5" fill="none" stroke="#4b4f7a" stroke-width="2.6" />
                <path d="M68 30l5 9h-10z" fill="none" stroke="#f08a5d" stroke-width="2.6" stroke-linejoin="round" />
              </g>
              <path d="M24 26v-6h6M96 26v-6h-6M24 64v6h6M96 64v6h-6" fill="none" stroke="#6c5ce7" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
              <rect class="sk-beam" x="24" y="20" width="72" height="4" rx="2" fill="#6c5ce7" opacity=".55" />
            </svg>
          </span>
          <span class="sk-trigger__text">
            <strong>点击打开平板扫描</strong>
            <small>把画纸放平，对准取景框拍一张</small>
          </span>
          <span class="sk-trigger__go" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 12h13m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
        </button>

        <div v-if="isOptimizing" class="sk-progress" role="status">
          <div class="sk-progress__head">
            <strong>{{ project.sketchCurrentStep || 'AI正在优化草图' }}</strong>
            <span>{{ project.sketchProgress || 0 }}%</span>
          </div>
          <div class="sk-progress__track">
            <i :style="{ width: `${project.sketchProgress || 0}%` }"></i>
          </div>
        </div>

        <div v-if="project.sketchOriginal && !isOptimizing" class="sk-preview">
          <div class="sk-compare">
            <button type="button" class="sk-shot" @click="zoomImage(project.sketchOriginal, '原始草图')">
              <img :src="project.sketchOriginal" alt="原始草图" />
              <span>原始草图</span>
            </button>
            <span class="sk-compare__arrow" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 12h13m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </span>
            <button type="button" class="sk-shot" @click="zoomImage(project.sketchOptimized || project.sketchOriginal, '优化线稿')">
              <img :src="project.sketchOptimized || project.sketchOriginal" alt="优化线稿" />
              <span>优化线稿</span>
            </button>
          </div>

          <div class="sk-actions">
            <button type="button" class="su-btn su-btn--primary" @click="emit('confirm')">保存并加入参考图</button>
            <button type="button" class="su-btn" @click="openScanner">重新扫描</button>
            <button type="button" class="su-btn su-btn--ghost" @click="emit('disable')">取消使用</button>
          </div>

          <div v-if="difficulty === 'advanced'" class="sk-controls">
            <label>
              <span>线稿粗细</span>
              <el-slider :model-value="project.lineControl?.thickness || 50" :min="0" :max="100" @change="(value) => emit('adjust', { thickness: value })" />
            </label>
            <label>
              <span>对比度</span>
              <el-slider :model-value="project.lineControl?.contrast || 60" :min="0" :max="100" @change="(value) => emit('adjust', { contrast: value })" />
            </label>
          </div>

          <div v-if="difficulty === 'pro'" class="sk-pro">
            <button type="button" class="sk-pro__toggle" :aria-expanded="proOpen" @click="proOpen = !proOpen">
              <span>{{ proOpen ? '收起更多线稿控制' : '更多线稿控制' }}</span>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
            <transition name="sk-fold">
              <div v-if="proOpen" class="sk-controls sk-controls--pro">
                <label>
                  <span>线稿粗细</span>
                  <el-slider :model-value="project.lineControl?.thickness || 50" :min="0" :max="100" @change="(value) => emit('adjust', { thickness: value })" />
                </label>
                <label>
                  <span>对比度</span>
                  <el-slider :model-value="project.lineControl?.contrast || 60" :min="0" :max="100" @change="(value) => emit('adjust', { contrast: value })" />
                </label>
                <label>
                  <span>ControlNet权重</span>
                  <el-slider :model-value="project.lineControl?.strength || 70" :min="0" :max="100" @change="(value) => emit('adjust', { strength: value })" />
                </label>
                <label>
                  <span>预处理模式</span>
                  <el-select :model-value="project.lineControl?.mode || 'clean-line'" @change="(value) => emit('adjust', { mode: value })">
                    <el-option label="干净线稿" value="clean-line" />
                    <el-option label="保留铅笔纹理" value="pencil-texture" />
                    <el-option label="多控制网占位" value="multi-control" />
                  </el-select>
                </label>
              </div>
            </transition>
          </div>
        </div>
      </div>
    </transition>

    <input ref="cameraInput" class="sk-camera-input" type="file" accept="image/*" capture="environment" @change="handleCameraFile" />

    <el-dialog v-model="scannerOpen" title="平板扫描拍摄" fullscreen append-to-body destroy-on-close class="sk-dialog sk-scanner-dialog">
      <div class="sk-scan">
        <section class="sk-scan__stage">
          <div class="sk-scan__paper">
            <i class="sk-scan__corner is-tl"></i><i class="sk-scan__corner is-tr"></i><i class="sk-scan__corner is-bl"></i><i class="sk-scan__corner is-br"></i>
            <span class="sk-scan__label">A4取景框</span>
            <span class="sk-scan__beam" aria-hidden="true"></span>
          </div>
        </section>
        <aside class="sk-scan__tips">
          <h2>把画纸对准方框，保持平整哦</h2>
          <p>{{ cameraTip }}</p>
          <ul>
            <li>
              <span aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg></span>
              光线太暗时，换到更亮的地方
            </li>
            <li>
              <span aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /><rect x="8" y="8" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8" /></svg></span>
              画纸歪了时，把边缘对齐虚线框
            </li>
            <li>
              <span aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><rect x="6" y="3" width="12" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M10.5 18h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg></span>
              画面模糊时，拿稳平板再拍
            </li>
          </ul>
          <div class="sk-scan__actions">
            <button type="button" class="su-btn su-btn--primary su-btn--lg" @click="triggerCamera">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.2-1.7c.3-.4.7-.6 1.2-.6h3c.5 0 .9.2 1.2.6L15.9 6h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /><circle cx="12" cy="12.5" r="3.4" fill="none" stroke="currentColor" stroke-width="1.8" /></svg>
              拍照扫描
            </button>
            <button type="button" class="su-btn" @click="mockAutoCapture">模拟自动拍摄</button>
          </div>
        </aside>
      </div>
    </el-dialog>

    <el-dialog v-model="preview.open" :title="preview.title" width="min(760px, calc(100vw - 32px))" append-to-body class="sk-dialog">
      <img class="sk-zoom" :src="preview.src" :alt="preview.title" />
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'

const props = defineProps({
  project: { type: Object, required: true },
  difficulty: { type: String, default: 'starter' },
  dialogMode: Boolean,
})

const emit = defineEmits(['upload', 'confirm', 'reset', 'disable', 'adjust', 'reset-adjust'])

const collapsed = ref(false)
const proOpen = ref(false)
const scannerOpen = ref(false)
const cameraInput = ref(null)
const cameraTip = ref('系统会在弹窗内模拟扶正裁剪、去阴影和线稿增强。')
const preview = reactive({ open: false, title: '', src: '' })

const isOptimizing = computed(() => props.project.sketchStage === 'optimizing')
const isEnabled = computed(() => Boolean(props.project.lineControl?.enabled || props.project.sketchOriginal))

function openScanner() {
  scannerOpen.value = true
}

function triggerCamera() {
  cameraInput.value?.click()
}

function handleCameraFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    scannerOpen.value = false
    emit('upload', { source: 'camera', file, preview: reader.result })
  }
  reader.readAsDataURL(file)
  event.target.value = ''
}

function mockAutoCapture() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="640" viewBox="0 0 900 640"><rect width="900" height="640" rx="32" fill="#fff7ed"/><rect x="150" y="70" width="600" height="500" rx="18" fill="#fff" stroke="#f59e0b" stroke-width="8"/><path d="M250 430 C330 280 420 320 470 205 C540 290 650 270 670 425" fill="none" stroke="#1f2937" stroke-width="18" stroke-linecap="round"/><circle cx="360" cy="240" r="42" fill="none" stroke="#1f2937" stroke-width="14"/><path d="M565 225 l45 75 h-90z" fill="none" stroke="#1f2937" stroke-width="14" stroke-linejoin="round"/></svg>`
  scannerOpen.value = false
  emit('upload', {
    source: 'camera',
    preview: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    file: null,
  })
}

function zoomImage(src, title) {
  preview.src = src
  preview.title = title
  preview.open = true
}
</script>

<style scoped lang="scss">
/* 扫描纸上的草图 · 2026-11 重新设计：浅色、简约，和 AI 绘画页同一套 su- 规范 */
.sk {
  display: grid; gap: 14px; align-content: start;
  padding: 16px; border: 1px solid var(--su-line); border-radius: var(--su-radius-lg);
  background: var(--su-surface-solid);
}
.sk.is-dialog { padding: 0; border: 0; background: none; }

.sk-head { display: flex; align-items: center; gap: 12px; }
.sk-head__icon {
  flex: none; width: 44px; height: 44px; display: grid; place-items: center;
  border-radius: 14px; background: var(--su-accent-soft); color: var(--su-accent);
}
.sk-head__text { flex: 1; min-width: 0; }
.sk-head__text strong { display: block; color: var(--su-ink); font-size: 16px; font-weight: 800; }
.sk-head__text p { margin: 3px 0 0; color: var(--su-muted); font-size: 13px; line-height: 1.5; }
.sk-status {
  flex: none; height: 28px; padding: 0 12px; display: inline-flex; align-items: center;
  border-radius: 999px; background: var(--su-surface-2); color: var(--su-muted);
  font-size: 12.5px; font-weight: 700; white-space: nowrap;
}
.sk-status.is-on { background: var(--su-ok-soft); color: var(--su-ok); }

.sk-body { display: grid; gap: 14px; }

/* 打开扫描：一整块大按钮，带一个会「扫」的小插画 */
.sk-trigger {
  width: 100%; min-height: 112px; padding: 14px 18px 14px 14px;
  display: flex; align-items: center; gap: 16px;
  border: 2px dashed rgba(108, 92, 231, 0.35); border-radius: var(--su-radius-lg);
  background: linear-gradient(135deg, #f8f6ff, #fff6ef);
  text-align: left; cursor: pointer;
  transition: border-color 0.15s, background 0.15s, transform 0.15s;
}
.sk-trigger:hover { border-color: var(--su-accent); background: linear-gradient(135deg, #f1edff, #fff0e4); }
.sk-trigger:active { transform: scale(0.99); }
.sk-trigger:focus-visible { outline: 3px solid var(--su-accent-ring); outline-offset: 2px; }
.sk-trigger__art { flex: none; width: 120px; }
.sk-trigger__art svg { display: block; width: 100%; height: auto; }
.sk-trigger__text { flex: 1; min-width: 0; display: grid; gap: 4px; }
.sk-trigger__text strong { color: var(--su-ink); font-size: 17px; font-weight: 800; }
.sk-trigger__text small { color: var(--su-muted); font-size: 13px; line-height: 1.5; }
.sk-trigger__go {
  flex: none; width: 40px; height: 40px; display: grid; place-items: center;
  border-radius: 50%; background: var(--su-accent); color: #fff;
  box-shadow: 0 6px 14px rgba(108, 92, 231, 0.3);
  transition: transform 0.15s;
}
.sk-trigger:hover .sk-trigger__go { transform: translateX(3px); }
.sk-beam { animation: skBeam 2.6s ease-in-out infinite; }
@keyframes skBeam { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(46px); } }

/* AI 优化进度 */
.sk-progress { display: grid; gap: 10px; padding: 14px 16px; border-radius: var(--su-radius); background: var(--su-surface-2); }
.sk-progress__head { display: flex; justify-content: space-between; gap: 12px; color: var(--su-ink); font-size: 14px; }
.sk-progress__head span { color: var(--su-accent); font-weight: 800; font-variant-numeric: tabular-nums; }
.sk-progress__track { height: 10px; border-radius: 999px; background: #e7e4f7; overflow: hidden; }
.sk-progress__track i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #a594f9, var(--su-accent)); transition: width 0.3s ease; }

/* 原图 → 线稿 对比 */
.sk-preview { display: grid; gap: 14px; }
.sk-compare { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 10px; }
.sk-compare__arrow {
  width: 36px; height: 36px; display: grid; place-items: center;
  border-radius: 50%; background: var(--su-accent-soft); color: var(--su-accent);
}
.sk-shot {
  position: relative; min-height: 0; padding: 0;
  border: 1px solid var(--su-line); border-radius: var(--su-radius);
  background: #fff; overflow: hidden; cursor: zoom-in;
  transition: border-color 0.15s;
}
.sk-shot:hover { border-color: var(--su-accent); }
.sk-shot img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: contain; }
.sk-shot span {
  position: absolute; left: 10px; top: 10px; height: 26px; padding: 0 10px;
  display: inline-flex; align-items: center; border-radius: 999px;
  background: rgba(31, 35, 64, 0.6); color: #fff; font-size: 12px; font-weight: 700;
}
.sk-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.sk-actions .su-btn--primary { flex: 1 1 200px; }

/* 线稿控制（进阶 / 高级） */
.sk-controls {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 22px;
  padding: 12px 16px; border-radius: var(--su-radius); background: var(--su-surface-2);
}
.sk-controls label { display: grid; gap: 0; color: var(--su-text); font-size: 13px; font-weight: 700; }
.sk-controls label :deep(.el-select) { margin: 6px 0 8px; }
.sk-controls--pro { margin-top: 8px; }
.sk-pro__toggle {
  display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 4px;
  border: 0; background: none; color: var(--su-accent); font-size: 14px; font-weight: 700; cursor: pointer;
}
.sk-pro__toggle svg { transition: transform 0.2s; }
.sk-pro__toggle[aria-expanded='true'] svg { transform: rotate(180deg); }

.sk-camera-input { display: none; }

/* 全屏扫描：左边取景框，右边提示和按钮 */
.sk-scan { height: calc(100dvh - 104px); display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 380px); gap: 18px; }
.sk-scan__stage {
  position: relative; min-height: 0; display: grid; place-items: center;
  border: 1px solid var(--su-line); border-radius: 24px;
  background: radial-gradient(circle at 50% 30%, #fbfaff, #eeecfb);
}
.sk-scan__paper {
  position: relative; height: min(82%, 620px); max-width: 86%; aspect-ratio: 210 / 297;
  border: 2px dashed rgba(108, 92, 231, 0.3); border-radius: 14px;
  background: #fff; box-shadow: 0 18px 40px rgba(76, 64, 160, 0.12);
}
.sk-scan__corner { position: absolute; width: 34px; height: 34px; border: 0 solid var(--su-accent); }
.sk-scan__corner.is-tl { left: -6px; top: -6px; border-width: 4px 0 0 4px; border-top-left-radius: 16px; }
.sk-scan__corner.is-tr { right: -6px; top: -6px; border-width: 4px 4px 0 0; border-top-right-radius: 16px; }
.sk-scan__corner.is-bl { left: -6px; bottom: -6px; border-width: 0 0 4px 4px; border-bottom-left-radius: 16px; }
.sk-scan__corner.is-br { right: -6px; bottom: -6px; border-width: 0 4px 4px 0; border-bottom-right-radius: 16px; }
.sk-scan__label {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  color: var(--su-faint); font-size: 15px; font-weight: 700; letter-spacing: 0.12em; white-space: nowrap;
}
.sk-scan__beam {
  position: absolute; left: 7%; right: 7%; top: 8%; height: 3px; border-radius: 3px;
  background: linear-gradient(90deg, transparent, var(--su-accent), transparent);
  box-shadow: 0 0 14px rgba(108, 92, 231, 0.55);
  animation: skScan 3s ease-in-out infinite;
}
@keyframes skScan { 0%, 100% { top: 8%; } 50% { top: 91%; } }
.sk-scan__tips {
  min-height: 0; display: flex; flex-direction: column; gap: 14px; padding: 24px;
  border: 1px solid var(--su-line); border-radius: 24px; background: var(--su-surface-solid);
  overflow-y: auto;
}
.sk-scan__tips h2 { margin: 0; color: var(--su-ink); font-size: 22px; font-weight: 800; line-height: 1.35; }
.sk-scan__tips p { margin: 0; color: var(--su-muted); font-size: 14px; line-height: 1.6; }
.sk-scan__tips ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
.sk-scan__tips li {
  display: flex; align-items: center; gap: 12px; padding: 12px 14px;
  border-radius: 14px; background: var(--su-surface-2); color: var(--su-text); font-size: 14px; font-weight: 600;
}
.sk-scan__tips li span {
  flex: none; width: 34px; height: 34px; display: grid; place-items: center;
  border-radius: 10px; background: var(--su-accent-soft); color: var(--su-accent);
}
.sk-scan__actions { margin-top: auto; display: grid; gap: 10px; }
.sk-zoom { display: block; width: 100%; max-height: 70vh; object-fit: contain; border-radius: 14px; background: var(--su-surface-2); }

/* 小画家（启蒙 / 入门）：字再大一点 */
.sk.is-young .sk-head__text strong { font-size: 17px; }
.sk.is-young .sk-head__text p { font-size: 14px; }
.sk.is-young .sk-trigger__text strong { font-size: 19px; }
.sk.is-young .sk-trigger__text small { font-size: 14px; }

.sk-fold-enter-active, .sk-fold-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.sk-fold-enter-from, .sk-fold-leave-to { opacity: 0; transform: translateY(-4px); }

@media (prefers-reduced-motion: reduce) {
  .sk-beam, .sk-scan__beam { animation: none; }
}
/* 竖屏平板：取景框在上，提示在下 */
@media (max-width: 900px) {
  .sk-scan { height: auto; min-height: calc(100dvh - 104px); grid-template-columns: 1fr; grid-template-rows: minmax(360px, 1fr) auto; }
}
/* 手机横屏等矮屏 */
@media (max-height: 560px) {
  .sk-trigger { min-height: 88px; padding: 10px 14px 10px 10px; }
  .sk-trigger__art { width: 92px; }
  .sk-scan { grid-template-columns: minmax(0, 1fr) minmax(260px, 320px); gap: 12px; }
  .sk-scan__tips { padding: 14px; gap: 10px; }
  .sk-scan__tips h2 { font-size: 17px; }
  .sk-scan__tips li { padding: 7px 10px; font-size: 13px; }
  .sk-scan__tips li span { width: 28px; height: 28px; }
}
@media (max-width: 640px) {
  .sk-head { flex-wrap: wrap; }
  .sk-compare { grid-template-columns: 1fr 1fr; }
  .sk-compare__arrow { display: none; }
  .sk-controls { grid-template-columns: 1fr; }
  .sk-trigger__art { width: 84px; }
}
</style>

<style lang="scss">
/* 扫描相关弹窗的外壳：el-dialog 本身不在本组件 scoped 范围内，只认 sk-dialog 前缀 */
.el-dialog.sk-dialog { border-radius: 22px; padding: 18px 20px 20px; }
.el-dialog.sk-dialog .el-dialog__title { color: #1f2340; font-size: 17px; font-weight: 800; }
.el-dialog.sk-dialog.sk-scanner-dialog { border-radius: 0; padding: 14px 20px 20px; background: #f7f7fb; }
</style>
