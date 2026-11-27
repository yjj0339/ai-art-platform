<template>
  <div class="paint-app" :class="{ 'is-canvas-focus': canvasFocus }">
    <!-- ================= 顶栏 ================= -->
    <!-- 返回、页面名、头像都在共用顶栏里；「保存状态 + 保存作品」放进顶栏右侧 -->
    <Teleport to="#su-topbar-actions" defer>
      <span class="paint-save-state" :class="`is-${saveStatus}`"><i />{{ saveLabel }}</span>
      <button class="paint-ghost" type="button" :disabled="saving" @click="save">
        {{ saving ? '保存中…' : '保存作品' }}
      </button>
    </Teleport>

    <main class="paint-workspace">
      <!-- ================= 左：画板 ================= -->
      <section class="paint-board" aria-label="画板">
        <div class="paint-board-head">
          <div class="paint-bh-left">
            <span class="paint-dot" aria-hidden="true" />
            <strong>我的画纸</strong>
            <input
              v-if="renaming"
              ref="titleInput"
              v-model="titleDraft"
              class="paint-bh-input"
              maxlength="20"
              aria-label="作品名称"
              @blur="commitTitle"
              @keydown.enter.prevent="commitTitle"
              @keydown.esc.prevent="cancelRename"
            />
            <button v-else class="paint-bh-tag" type="button" title="点一下改名字" @click="startRename">
              {{ title }}
            </button>
            <!--
              画纸尺寸：原来只是一段灰色文字（600 × 480），看着像标签、其实是死的，
              老师想换张横的纸根本找不到入口。现在改成按钮，点开选预设或自定义宽高。
              标签跟着旋转走（转 90° 后显示 600 × 480），但选的尺寸永远是纸本身的正向宽高。
            -->
            <div class="paint-size-wrap">
              <button
                class="paint-bh-size"
                :class="{ 'is-open': sizeMenuOpen }"
                type="button"
                title="点一下换画纸尺寸"
                :aria-expanded="sizeMenuOpen"
                aria-haspopup="dialog"
                @click="sizeMenuOpen = !sizeMenuOpen"
              >
                {{ paperSizeLabel }}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </button>

              <div v-if="sizeMenuOpen" class="paint-size-menu" role="dialog" aria-label="画纸尺寸">
                <p class="paint-size-tip">点一下就换，纸上内容留着</p>
                <div class="paint-size-grid">
                  <button
                    v-for="preset in PAPER_PRESETS"
                    :key="preset.id"
                    type="button"
                    class="paint-size-item"
                    :class="{ 'is-active': paperSizePresetId === preset.id }"
                    @click="applyPaperPreset(preset)"
                  >
                    <span class="paint-size-ratio"><i :style="{ width: `${preset.thumb.w}px`, height: `${preset.thumb.h}px` }" /></span>
                    <span class="paint-size-txt">
                      <b>{{ preset.label }}</b>
                      <em>{{ preset.ratio }} · {{ preset.width }} × {{ preset.height }}</em>
                    </span>
                  </button>
                </div>
                <div class="paint-size-custom">
                  <span class="paint-size-custom-label">自定义</span>
                  <input v-model.number="customWidth" type="number" min="160" max="1600" step="10" aria-label="画纸宽度" />
                  <span class="paint-size-x">×</span>
                  <input v-model.number="customHeight" type="number" min="160" max="1600" step="10" aria-label="画纸高度" />
                  <span class="paint-size-px">px</span>
                  <button type="button" class="paint-size-apply" @click="applyCustomPaperSize">应用</button>
                </div>
                <p class="paint-size-note">换纸后，原来的画会缩到新纸中间，不会丢。但撤销记录会从头开始。</p>
              </div>
            </div>
          </div>

          <div class="paint-bh-right">
            <button class="paint-icon-btn" type="button" title="撤销" :disabled="!canUndo" @click="undo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
            </button>
            <button class="paint-icon-btn" type="button" title="重做" :disabled="!canRedo" @click="redo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></svg>
            </button>
            <div class="paint-more-wrap">
              <button class="paint-icon-btn" type="button" title="更多" @click="moreOpen = !moreOpen">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
              </button>
              <div v-if="moreOpen" class="paint-more-menu" role="menu">
                <button type="button" role="menuitem" @click="runMore(exportImage)">导出 PNG</button>
                <button type="button" role="menuitem" @click="runMore(fitCanvas)">适应画面</button>
                <button type="button" role="menuitem" @click="runMore(rotatePaper)">画纸旋转 90°（当前 {{ rotationLabel }}）</button>
                <button v-if="rotation" type="button" role="menuitem" @click="runMore(resetRotation)">画纸转回正向</button>
                <button type="button" role="menuitem" class="is-danger" @click="runMore(clearLayer)">清空当前图层</button>
              </div>
            </div>
            <!--
              画纸全屏：只把画纸放大到铺满屏幕，右侧 AI 区、底部提示词、整条顶栏都让位。
              用 CSS 定位而不是浏览器 Fullscreen API——iPad Safari 不支持元素级全屏，
              老师一旦点不出反应就更困惑。
              现在顶栏整个藏起来了，这个按钮就是唯一的出口（外加 Esc），
              所以全屏时它会从方形图标变成「退出全屏」的橙色胶囊，别让人找不到。
            -->
            <button
              class="paint-icon-btn paint-focus-btn"
              :class="{ 'is-on': canvasFocus }"
              type="button"
              :title="canvasFocus ? '退出全屏（Esc）' : '画纸全屏放大'"
              :aria-pressed="canvasFocus"
              @click="toggleCanvasFocus"
            >
              <svg v-if="!canvasFocus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 4H4v5" /><path d="M15 20h5v-5" /><path d="M20 9V4h-5" /><path d="M4 15v5h5" />
              </svg>
              <template v-else>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 9h5V4" /><path d="M20 15h-5v5" /><path d="M15 4v5h5" /><path d="M9 20v-5H4" />
                </svg>
                <span class="paint-focus-label">退出全屏</span>
              </template>
            </button>
          </div>
        </div>

        <div class="paint-board-body">
          <PaintToolbar
            v-model:tool="tool"
            v-model:brush-id="brushId"
            v-model:color="color"
            v-model:size="size"
            :rotation="rotation"
            @rotate="rotatePaper"
          />
          <PaintStage
            ref="stageRef"
            :doc="doc"
            :tool="tool"
            :brush-id="brushId"
            :color="color"
            :size="size"
            :rotation="rotation"
            @changed="onChanged"
            @pick-color="onPickColor"
            @lasso="onLasso"
            @rotate="rotatePaper"
          />
          <PaintLayers
            :doc="doc"
            :revision="revision"
            :active-id="activeLayerId"
            @select="selectLayer"
            @changed="onChanged"
          />
        </div>
      </section>

      <!-- ================= 右：AI 生成 ================= -->
      <aside class="paint-ai" aria-label="AI 生成">
        <!--
          顶部那块「AI 生成 / 灵感加速 / 参考画纸」标题区已按老师要求整块删掉，
          把高度全部让给生成结果图。参考画纸的开关没丢——底部提示词栏左边那个
          「已引用当前画布 / 引用当前画布」就是同一件事。
        -->
        <div class="paint-ai-body">
          <div class="paint-styles">
            <button
              v-for="preset in STYLE_PRESETS"
              :key="preset.id"
              type="button"
              class="paint-style-chip"
              :class="{ 'is-active': styleId === preset.id }"
              @click="styleId = preset.id"
            >{{ preset.label }}</button>
          </div>

          <p class="paint-sec-label">
            生成结果
            <em>{{ mainResult ? '本次 1 张 · 直接是大图' : '一次只出 1 张' }}</em>
          </p>

          <!--
            出图改成「一次一张大图」（老师定）。
            以前一次出 4 张、下面还有 2/3/4 一排小图：细节看不清，还要先挑一张再插回，
            时间和积分都是 4 份。现在只出一张、直接铺满，不满意就点「再生成」。
          -->
          <div class="paint-results">
            <div class="paint-result paint-result-main" :class="{ 'is-current': Boolean(mainResult) }">
              <template v-if="mainResult">
                <span class="paint-rbadge">本次生成</span>
                <img :src="mainResult.imageUrl" :alt="mainResult.prompt || 'AI 生成结果'" />
                <span class="paint-rtools">
                  <span role="button" tabindex="0" @click="insertResult(0)">
                    {{ inserting ? '正在贴回…' : '插成图层' }}
                  </span>
                  <span role="button" tabindex="0" @click="generate">再生成</span>
                </span>
              </template>
              <span v-else class="paint-result-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="16" rx="3" />
                  <path d="m7 15 3.4-3.6 3 3L16 11l4 4" />
                  <circle cx="8.4" cy="8.6" r="1.4" />
                </svg>
                <b>{{ generating ? '正在生成…' : '画点什么，再点开始生成' }}</b>
                <em>{{ generating ? '大概 10～30 秒' : '会用你画纸的样子当参考' }}</em>
              </span>
            </div>
          </div>

          <!--
            这一排放在结果大图**下面**：左边「导入到新图层」（把这张 AI 图贴到左边画纸上），
            右边「参考强度」滑块 0~100%。先看图、再决定要不要贴进画纸，手往下走一遍就完成。
          -->
          <div class="paint-strength">
            <div class="paint-strength-row">
              <button
                type="button"
                class="paint-import-btn"
                :disabled="!mainResult || inserting"
                :title="mainResult ? '把这张 AI 图贴成画纸上的新图层' : '先点「开始生成」，有图了才能导入'"
                @click="insertResult(0)"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 3v10" />
                  <path d="m8.2 9.4 3.8 3.8 3.8-3.8" />
                  <path d="M4 15.5V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3.5" />
                </svg>
                <span>{{ inserting ? '导入中…' : '导入到新图层' }}</span>
              </button>

              <label class="paint-strength-ctl">
                <span class="paint-strength-name">参考强度</span>
                <!--
                  轨道、已填充段、拇指全部自己画，原生 input 只负责交互（opacity: 0）。
                  原因：accent-color 的未填充轨道在各浏览器/无头环境里颜色不定，会变成一根深黑条，
                  看着像「已经填满」，用户分不清哪头是满格。
                -->
                <span class="paint-strength-slider" :style="{ '--pct': `${strengthPct}%` }">
                  <span class="paint-strength-rail" aria-hidden="true" />
                  <span class="paint-strength-fill" aria-hidden="true" />
                  <span class="paint-strength-knob" aria-hidden="true" />
                  <input
                    v-model.number="strengthPct"
                    class="paint-strength-range"
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    :aria-label="`参考强度 ${strengthPct}%`"
                  />
                </span>
                <b class="paint-strength-val">{{ strengthPct }}%</b>
              </label>
            </div>
            <p class="paint-strength-hint">{{ activeStrength.hint }}</p>
          </div>

          <p v-if="errorText" class="paint-ai-error">{{ errorText }}</p>
        </div>
      </aside>
    </main>

    <!-- ================= 底部提示词 ================= -->
    <footer class="paint-composer">
      <div class="paint-prompt-bar">
        <button
          v-if="lassoBox"
          class="paint-ref-chip is-lasso"
          type="button"
          title="点一下取消框选"
          @click="clearLasso"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12c0-3.3 3.6-6 8-6s8 2.7 8 6-3.6 6-8 6c-1.6 0-3.1-.3-4.4-.9" /><path d="M7.6 17.2c-.7.9-1 1.7-1 2.3M4.4 16.4c-.3.8-.3 1.6 0 2.3" /></svg>
          局部参考 · {{ Math.round(lassoBox.w) }}×{{ Math.round(lassoBox.h) }} ✕
        </button>
        <button
          v-else
          class="paint-ref-chip"
          :class="{ 'is-on': referenceOn }"
          type="button"
          :title="referenceOn ? '点一下不把画纸发给 AI' : '点一下把画纸当参考图'"
          @click="referenceOn = !referenceOn"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m7 15 3.4-3.6 3 3L16 11l4 4" /><circle cx="8.4" cy="8.6" r="1.4" /></svg>
          {{ referenceOn ? '已引用当前画布' : '引用当前画布' }}
        </button>

        <!--
          出图模型：紧跟在「引用当前画布」后面。
          以前这里是空白一条，老师没法换模型，永远用后台默认那个。
          菜单往上弹（bottom:100%），因为这一条贴在页面最底部，往下弹会被屏幕切掉。
        -->
        <div class="paint-model-wrap">
          <button
            class="paint-model-chip"
            :class="{ 'is-on': modelPickerOpen }"
            type="button"
            :title="modelTitle"
            :aria-expanded="modelPickerOpen"
            aria-haspopup="listbox"
            @click="toggleModelPicker"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="4" y="4" width="16" height="16" rx="4" /><path d="M9 9h6v6H9z" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
            </svg>
            <span class="paint-model-name">{{ modelLabel }}</span>
            <svg class="paint-model-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
          </button>

          <div v-if="modelPickerOpen" class="paint-model-menu" role="listbox" aria-label="选择出图模型">
            <p class="paint-model-tip">{{ artworkModels.length ? '换一个模型会换一种画风手感' : '后台还没有配置可用的出图模型' }}</p>
            <button
              type="button"
              class="paint-model-item"
              :class="{ 'is-active': !modelId }"
              role="option"
              :aria-selected="!modelId"
              @click="pickModel(null)"
            >
              <span class="paint-model-item-main"><b>自动</b><em>跟随后台默认</em></span>
              <svg v-if="!modelId" class="paint-model-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7" /></svg>
            </button>
            <button
              v-for="item in artworkModels"
              :key="item.id"
              type="button"
              class="paint-model-item"
              :class="{ 'is-active': modelId === item.id }"
              role="option"
              :aria-selected="modelId === item.id"
              @click="pickModel(item)"
            >
              <span class="paint-model-item-main"><b>{{ item.label || item.model }}</b><em>{{ item.providerLabel }}</em></span>
              <svg v-if="modelId === item.id" class="paint-model-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7" /></svg>
            </button>
          </div>
        </div>

        <input
          v-model="promptText"
          class="paint-prompt-input"
          type="text"
          maxlength="160"
          placeholder="想让它画成什么样？比如：把小屋画成水彩绘本风格，暖色黄昏，加一点雾气"
          aria-label="提示词"
          @keydown.enter.prevent="generate"
        />

        <span class="paint-count">本次生成 {{ lastCount }} 张</span>
        <button class="paint-gen-btn" type="button" :disabled="generating" @click="generate">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5" /><path d="m6 11 6-6 6 6" /></svg>
          {{ generating ? '生成中…' : '开始生成' }}
        </button>
      </div>
    </footer>

    <Transition name="paint-toast">
      <div v-if="toastText" class="paint-toast">{{ toastText }}</div>
    </Transition>

    <!--
      竖屏 / 窗口太窄时直接挡住整页。
      右栏 AI 出图区在 1020px 以下会被挤掉，与其让老师看到残缺界面，不如请他先横过来。
      用 fixed 遮罩盖住、底层不销毁，转回横屏后画纸内容与撤销历史都还在。
    -->
    <div v-if="viewportBlocked" class="paint-rotate-mask" role="alert">
      <span class="paint-rotate-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
          <path d="M13.5 12H20" />
          <path d="m17.5 9.5 2.5 2.5-2.5 2.5" />
        </svg>
      </span>
      <strong>请横屏使用</strong>
      <p>{{ viewportBlockedText }}</p>
      <button type="button" @click="goBack">返回工作台</button>
    </div>
  </div>
</template>

<script setup>
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/userStore'
import { useLeaveGuard } from '../composables/useStudentTopBar'
import { BRUSH_MAP, PaintDocument, rotateCanvas, rotatedBox } from '../utils/paintEngine'
import PaintStage from '../components/paint/PaintStage.vue'
import PaintToolbar from '../components/paint/PaintToolbar.vue'
import PaintLayers from '../components/paint/PaintLayers.vue'
import { STYLE_PRESETS, loadArtworkModels, requestArtwork, saveArtwork, toCanvasSafeImageUrl } from '../services/paintStudioApi'

const PAPER_WIDTH = 480
const PAPER_HEIGHT = 600
/**
 * 一次只出 1 张（老师定）。
 * 以前是 4 张 + 一排小缩略图：图太小看不清细节，还得先挑一张再插回，
 * 时间和积分却都是 4 份。服务端 /api/ai/image/generate 支持 1~4，这里固定 1。
 */
const RESULT_COUNT = 1

/**
 * 画纸预设尺寸。
 * thumb 只是面板里那个小方块的像素尺寸，用来示意比例，别拿它算真实画纸。
 */
const PAPER_PRESETS = [
  { id: 'square', label: '正方形', ratio: '1:1', width: 800, height: 800, thumb: { w: 19, h: 19 } },
  { id: 'portrait', label: '竖幅', ratio: '4:5', width: 480, height: 600, thumb: { w: 16, h: 20 } },
  { id: 'landscape', label: '横幅', ratio: '4:3', width: 600, height: 450, thumb: { w: 21, h: 16 } },
  { id: 'wide', label: '宽幅', ratio: '16:9', width: 1280, height: 720, thumb: { w: 23, h: 13 } },
]
const PAPER_MIN_SIDE = 160
const PAPER_MAX_SIDE = 1600

const userStore = useUserStore()
const router = useRouter()
const userName = computed(() => userStore.user?.name || '小画家')
const avatarText = computed(() => String(userStore.user?.avatar || userName.value).slice(0, 1))

/**
 * 画布文档是纯 canvas 对象，必须 markRaw 后再 shallowRef 持有。
 * 一旦放进普通 ref，Vue 会尝试深度代理 canvas 与像素数据，第一笔就会卡死。
 */
const doc = shallowRef(markRaw(new PaintDocument({ width: PAPER_WIDTH, height: PAPER_HEIGHT })))
const stageRef = ref(null)
const titleInput = ref(null)

const revision = ref(0)
const activeLayerId = ref(doc.value.activeLayerId)
const canUndo = ref(false)
const canRedo = ref(false)

const tool = ref('brush')
const brushId = ref('pencil')
const color = ref('#2b3440')
const size = ref(BRUSH_MAP.pencil?.size || 16)

const title = ref('未命名创作')
const renaming = ref(false)
const titleDraft = ref('')

const saveStatus = ref('idle')
const saving = ref(false)
const moreOpen = ref(false)

const styleId = ref(STYLE_PRESETS[0].id)
const promptText = ref('')
const referenceOn = ref(true)

/**
 * 出图模型。
 * 以前画板没得选，出图永远走「后台默认那个模型」——后台配了两三个模型也调不动。
 * 现在底部提示词条里给一个下拉：清单来自 /ai/health（只列配了 Key 且有图像模型的平台），
 * 选完连同 provider 一起发给服务端，服务端就不必再猜该用谁。
 * 默认「自动」= 不指定，仍然按后台默认走，跟以前行为一致。
 */
const artworkModels = ref([])
const modelPickerOpen = ref(false)
const modelId = ref('')
const activeModel = computed(() => artworkModels.value.find((item) => item.id === modelId.value) || null)
const modelLabel = computed(() => activeModel.value?.label || activeModel.value?.model || '自动')
const modelTitle = computed(() =>
  activeModel.value
    ? `当前出图模型：${activeModel.value.providerLabel} · ${activeModel.value.label || activeModel.value.model}（点开可换）`
    : '当前用后台默认模型（点开可换）',
)

function toggleModelPicker() {
  modelPickerOpen.value = !modelPickerOpen.value
}

function pickModel(item) {
  modelId.value = item?.id || ''
  modelPickerOpen.value = false
  flash(item ? `已切到 ${item.providerLabel} · ${item.label || item.model}` : '已切回后台默认模型')
}

/** 只在后台确实配了出图模型时才拉；失败就保持「自动」，不弹任何错，画板照常能画 */
async function loadModels() {
  try {
    const list = await loadArtworkModels()
    artworkModels.value = list
    // 后台换了配置、当前选的那个模型没了，就退回自动，避免一直报「模型未启用」
    if (modelId.value && !list.some((item) => item.id === modelId.value)) modelId.value = ''
  } catch {
    artworkModels.value = []
  }
}

/**
 * 参考强度：AI 有多「听」画纸上那张稿。0 ~ 100% 一根滑块。
 * agnes / 火山这类模型都没有暴露 img2img 的 strength 参数，所以强度落在两处：
 *   ① 提示词里写明「要不要照抄构图」；② 送给模型的参考图清晰度（越小细节越容易丢，AI 越自由）。
 * 滑块连续变化，但提示词只有三套说法，所以按 0-33 / 34-66 / 67-100 取最接近的那一档文案；
 * 参考图尺寸则跟着百分比连续插值，按 32 像素取整——否则拖一下就换个尺寸，缓存全打散。
 */
const REFERENCE_LEVELS = [
  {
    id: 'loose',
    label: '自由发挥',
    hint: '只借题材，构图配色都可以大变',
    maxSize: 448,
    hintPrompt: '参考图只用来判断题材和大致氛围。请大胆重新构图，物体位置、大小比例、镜头角度都可以改，不要照抄参考图的线条。',
  },
  {
    id: 'medium',
    label: '半参考',
    hint: '留大致构图，细节重新画',
    maxSize: 768,
    hintPrompt: '请保留参考图里主要物体的大致位置和画面结构，在此基础上重新完成上色、光影与细节。',
  },
  {
    id: 'tight',
    label: '照着画',
    hint: '不打乱你画的位置和线条',
    maxSize: 1024,
    hintPrompt: '严格保留参考图的构图、物体位置、大小比例和线条走向，只补足色彩、光影和细节，不要移动、删减或新增主要物体。',
  },
]
const strengthPct = ref(60)
const activeStrength = computed(() => {
  const pct = strengthPct.value
  const level = pct <= 33 ? REFERENCE_LEVELS[0] : pct <= 66 ? REFERENCE_LEVELS[1] : REFERENCE_LEVELS[2]
  const raw = 448 + ((1024 - 448) * pct) / 100
  const maxSize = Math.min(1024, Math.max(448, Math.round(raw / 32) * 32))
  return { ...level, maxSize, pct }
})

/** 画纸全屏：只放大左侧画纸，右侧 AI 区与底部提示词暂让位 */
const canvasFocus = ref(false)

/**
 * 画纸旋转（0 / 90 / 180 / 270）。
 * 只转「看的方向」，不动纸上的像素——每按一次往右转 90°，画着画着想把纸横过来就按它。
 * 笔迹坐标由画布组件逆着转回去，所以转完接着画，线条还是落在笔尖位置。
 */
const rotation = ref(0)
const rotationLabel = computed(() => `${rotation.value}°`)
/** 板头显示的尺寸跟着转：横过来以后是 600 × 480，用户一看就知道纸真的转了 */
const paperSize = computed(() => rotatedBox(doc.value?.width || PAPER_WIDTH, doc.value?.height || PAPER_HEIGHT, rotation.value))
const paperSizeLabel = computed(() => `${paperSize.value.w} × ${paperSize.value.h}`)
function rotatePaper() {
  rotation.value = (rotation.value + 90) % 360
  flash(`画纸已转到 ${rotation.value}°`)
}
function resetRotation() {
  if (!rotation.value) return
  rotation.value = 0
  flash('画纸已转回正向')
}

// ---------- 画纸尺寸 ----------

/**
 * 换画纸尺寸。
 *
 * 为什么是「新建一张纸」而不是改原来那张：PaintDocument 的每一层画布、复用的临时画布、
 * 撤销记录里的画布，全都是在构造时按当时的宽高分好的。中途改 width/height，旧图层还是
 * 原来那么大，画到边上就错位、出空白。所以造一张新纸，把旧纸上已经画好的内容按比例
 * 居中缩进去，再挂到新纸上——用户看到的还是自己那张画，只是纸换了。
 *
 * 代价：撤销历史不跨纸张（跨纸张的撤销会贴错位置）。换错了就再换回原来的尺寸。
 */
function applyPaperSize(width, height) {
  const clampSide = (value) => Math.round(Math.min(PAPER_MAX_SIDE, Math.max(PAPER_MIN_SIDE, Number(value) || 0)))
  const w = clampSide(width)
  const h = clampSide(height)
  if (!w || !h) return

  sizeMenuOpen.value = false
  const previous = doc.value
  if (previous && previous.width === w && previous.height === h) {
    flash('已经是这个尺寸了')
    return
  }

  // 旧纸上已经画出来的样子，方向跟屏幕一致（转成横的就是横的）
  const snapshot = previous ? composedAsShown() : null
  const next = new PaintDocument({ width: w, height: h })

  if (snapshot && snapshot.width && snapshot.height) {
    // 屏幕上是横的，纸本体是竖的：先逆着转回来，才能按新纸的比例缩，否则会歪 90°
    const upright = rotation.value ? rotateCanvas(snapshot, (360 - rotation.value) % 360) : snapshot
    const base = next.layers[next.layers.length - 1]
    const ratio = Math.min(next.width / upright.width, next.height / upright.height)
    const dw = Math.max(1, upright.width * ratio)
    const dh = Math.max(1, upright.height * ratio)
    base?.ctx?.drawImage(upright, (next.width - dw) / 2, (next.height - dh) / 2, dw, dh)
    next.revision += 1
  }

  doc.value = markRaw(next)
  activeLayerId.value = next.activeLayerId
  lassoBox.value = null
  lassoRefImage.value = ''
  usedLasso.value = null
  stageRef.value?.clearLasso?.()
  // 纸的长宽比例变了，画布组件要等新版式回填后再居中放大一次
  stageRef.value?.fitOnNextResize?.()

  customWidth.value = w
  customHeight.value = h
  syncView()
  saveStatus.value = 'dirty'
  flash(`画纸换成 ${w} × ${h}，原来的画已按比例放到中间`)
}

/** 顶部尺寸按钮里那 4 个预设，哪一个跟当前画纸一模一样就高亮哪一个 */
const paperSizePresetId = computed(() => {
  const target = doc.value
  if (!target) return ''
  return PAPER_PRESETS.find((item) => item.width === target.width && item.height === target.height)?.id || ''
})

const sizeMenuOpen = ref(false)
const customWidth = ref(PAPER_WIDTH)
const customHeight = ref(PAPER_HEIGHT)

function applyPaperPreset(preset) {
  if (preset) applyPaperSize(preset.width, preset.height)
}

function applyCustomPaperSize() {
  const w = Number(customWidth.value)
  const h = Number(customHeight.value)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    flash('宽和高都要填数字')
    return
  }
  applyPaperSize(w, h)
}

/** 点面板外面关掉尺寸面板，跟随「更多」菜单的处理方式 */
watch(sizeMenuOpen, (open) => {
  if (open) {
    customWidth.value = doc.value?.width || PAPER_WIDTH
    customHeight.value = doc.value?.height || PAPER_HEIGHT
  }
})

const results = ref([])
const currentIndex = ref(0)
const generating = ref(false)
const inserting = ref(false)
const lastCount = ref(RESULT_COUNT)
/** 生成那一刻用的框（画纸坐标）。结果插回时按这个框落位，避免框被清掉后位置错乱 */
const usedLasso = ref(null)

const lassoBox = ref(null)
const lassoRefImage = ref('')

const toastText = ref('')
const errorText = ref('')
let toastTimer = 0

/**
 * 窄屏闸门：右栏 AI 出图区在 1020px 以下会整块隐藏，屏幕太矮工具栏也会挤成一团。
 * 所以「竖屏」不做好看的降级排版，直接请他横过来——一只手就能解决，比适配三档断点可靠。
 */
const viewportWidth = ref(typeof window === 'undefined' ? 1280 : window.innerWidth)
const viewportHeight = ref(typeof window === 'undefined' ? 800 : window.innerHeight)
const viewportBlocked = computed(() => viewportWidth.value < 1024 || viewportHeight.value < 520)
const viewportBlockedText = computed(() => {
  const narrow = viewportWidth.value < 1024
  const short = viewportHeight.value < 520
  if (narrow && short) return '这块屏幕太小，右侧 AI 出图区和工具栏都放不下。建议换用平板或电脑。'
  if (narrow) return '屏幕宽度不够，右侧 AI 出图区放不下。平板请横过来，电脑请把窗口拉宽。'
  return '屏幕高度不够，工具栏会挤成一团。请把窗口拉高，或换用更大的屏幕。'
})
function syncViewport() {
  viewportWidth.value = window.innerWidth
  viewportHeight.value = window.innerHeight
}

const subTitle = computed(() => `${userName.value} · ${title.value}`)
const saveLabel = computed(() => {
  const map = { saving: '保存中…', saved: '已保存', dirty: '未保存', error: '保存失败', idle: '未改动' }
  return map[saveStatus.value] || '未改动'
})
const usingReference = computed(() => Boolean(lassoBox.value) || referenceOn.value)
const mainResult = computed(() => results.value[currentIndex.value] || null)

function flash(message) {
  toastText.value = message
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toastText.value = '' }, 2600)
}

/**
 * 回工作台。画板是整屏 fixed 布局，页面里没有别的导航，
 * 所以这里直接跳工作台，不用 history.back()（用户可能是直接开链接进来的第一页）。
 * 画纸还没保存时先拦一下，免得误点丢掉画了一半的稿子。
 */
function goBack() {
  router.push('/student/workbench')
}
// 未保存提醒挪到离开检查里：顶栏「主页」、头像菜单里的跳转、上面的 goBack 都会先问一句
useLeaveGuard(() => saveStatus.value !== 'dirty' || window.confirm('画纸还有未保存的改动，确定离开吗？'))

/**
 * doc 内部变化 Vue 看不见，所以每次操作后手动把「历史上限、当前图层、缩略图」拉一遍。
 */
function syncView() {
  const target = doc.value
  if (!target) return
  revision.value = target.revision
  activeLayerId.value = target.activeLayerId
  const state = target.historyState
  canUndo.value = state.canUndo
  canRedo.value = state.canRedo
  stageRef.value?.refresh()
}

function onChanged() {
  syncView()
  if (!saving.value) saveStatus.value = 'dirty'
}

function undo() {
  if (!doc.value?.undo()) return
  onChanged()
  flash('已撤销一步')
}

function redo() {
  if (!doc.value?.redo()) return
  onChanged()
}

function selectLayer(id) {
  if (!doc.value) return
  doc.value.activeLayerId = id
  syncView()
}

function onPickColor(hex) {
  color.value = hex
  tool.value = 'brush'
  flash(`取到颜色 ${hex}`)
}

function fitCanvas() {
  stageRef.value?.fitToScreen()
}

/**
 * 画纸全屏开关。
 * 尺寸变了以后画布组件只重算像素尺寸、不会重新居中缩放，所以要让它在尺寸变化后补一次适配。
 * 不能死等几十毫秒：版式重排完、尺寸回填到画布组件是有先后的，等早了会按旧宽度算偏移，
 * 纸就缩在偏左的位置——交给「下次尺寸变化后自动适应」才稳。
 */
function toggleCanvasFocus() {
  const next = !canvasFocus.value
  canvasFocus.value = next
  applyBrowserFullscreen(next)
  stageRef.value?.fitOnNextResize?.()
}

/**
 * 安卓浏览器（Chrome / 夸克 / 小米自带）支持整页全屏，能把地址栏也一起收起来；
 * iPad Safari 不支持元素级全屏，所以这里只对安卓尝试，失败就静默放弃——反正 CSS 全屏态已经生效了。
 * 桌面端和自动化脚本（UA 不是 Android）不会走到这里，避免无头环境下的全屏影响回归断言。
 */
const isAndroidTablet = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

function applyBrowserFullscreen(on) {
  if (!isAndroidTablet) return
  try {
    if (on) {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {})
      }
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.()?.catch?.(() => {})
    }
  } catch {
    /* 全屏被浏览器拒绝时不影响画纸全屏 */
  }
}

/** 用户从系统手势退出全屏时，把画纸全屏也收回来，否则按钮还显示「退出全屏」但已无全屏可退 */
function onFullscreenChange() {
  if (!document.fullscreenElement && canvasFocus.value) {
    canvasFocus.value = false
    stageRef.value?.fitOnNextResize?.()
  }
}

function clearLayer() {
  const target = doc.value
  if (!target) return
  if (!target.clearActiveLayer()) {
    flash('这一层是锁定的，先解锁再清空')
    return
  }
  onChanged()
  flash('已清空当前图层，可以用左上角撤销找回')
}

function startRename() {
  renaming.value = true
  titleDraft.value = title.value
  nextTick(() => titleInput.value?.focus())
}

function commitTitle() {
  const next = titleDraft.value.trim().slice(0, 20)
  if (next) title.value = next
  renaming.value = false
}

function cancelRename() {
  renaming.value = false
}

function runMore(action) {
  moreOpen.value = false
  action?.()
}

// ---------- 保存 / 导出 ----------

/**
 * 按当前旋转角度把画纸合成出来。
 * 屏幕上看到的是横的，导出/保存就必须也是横的——否则用户下载下来发现图又转回去了。
 */
function composedAsShown() {
  const target = doc.value
  const base = target.composeToCanvas(target.width, target.height)
  return rotateCanvas(base, rotation.value)
}

/** 按长边上限导出（参考图用），0 表示原尺寸 */
function exportAsShown(maxSize = 0) {
  const canvas = composedAsShown()
  if (!maxSize) return canvas
  const longSide = Math.max(canvas.width, canvas.height)
  const ratio = Math.min(1, maxSize / longSide)
  if (ratio >= 1) return canvas
  const out = document.createElement('canvas')
  out.width = Math.round(canvas.width * ratio)
  out.height = Math.round(canvas.height * ratio)
  out.getContext('2d').drawImage(canvas, 0, 0, out.width, out.height)
  return out
}

async function save() {
  if (saving.value) return
  saving.value = true
  saveStatus.value = 'saving'
  try {
    // maxSize: 0 表示按原始尺寸导出，保存的是用户真正画出来的清晰度
    const canvas = exportAsShown(0)
    const dataUrl = canvas.toDataURL('image/png')
    await saveArtwork({ title: title.value, dataUrl, width: canvas.width, height: canvas.height })
    saveStatus.value = 'saved'
    flash('已保存到「我的作品 · 手绘稿」')
  } catch (error) {
    saveStatus.value = 'error'
    flash(error?.message || '保存失败，请稍后再试')
  } finally {
    saving.value = false
  }
}

async function exportImage() {
  try {
    const canvas = composedAsShown()
    const blob = await new Promise((resolve) => canvas.toBlob((value) => resolve(value), 'image/png', 0.92))
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${title.value || '我的创作'}.png`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 4000)
    flash('图片已下载')
  } catch {
    flash('导出失败，请稍后再试')
  }
}

// ---------- 套索框选 ----------

function onLasso(box) {
  lassoBox.value = box
  try {
    // 整张画纸合成一张原尺寸位图，再从里面裁出框选那一块当参考图
    const full = doc.value.composeToCanvas(doc.value.width, doc.value.height)
    const crop = document.createElement('canvas')
    crop.width = Math.max(8, Math.round(box.w))
    crop.height = Math.max(8, Math.round(box.h))
    const ctx = crop.getContext('2d')
    ctx.drawImage(full, box.x, box.y, box.w, box.h, 0, 0, crop.width, crop.height)
    lassoRefImage.value = crop.toDataURL('image/jpeg', 0.86)
    flash('已框选一块区域，生成时只用这一块当参考')
  } catch {
    lassoRefImage.value = ''
    flash('框选失败，先画点东西再框')
  }
}

function clearLasso() {
  lassoBox.value = null
  lassoRefImage.value = ''
  usedLasso.value = null
  stageRef.value?.clearLasso()
}

// ---------- AI 出图 ----------

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片加载失败，请重新生成'))
    image.src = src
  })
}

/**
 * 把 AI 图先画到一张「和画纸同样大」的透明画布上，只占框选那块。
 * 这样再交给 addImageLayer 时，cover 的缩放正好是 1、偏移是 0，落位就是精确的。
 */
function stageIntoBox(image, box) {
  const canvas = document.createElement('canvas')
  canvas.width = doc.value.width
  canvas.height = doc.value.height
  canvas.getContext('2d').drawImage(image, box.x, box.y, box.w, box.h)
  return canvas
}

async function generate() {
  if (generating.value) return
  const hasPrompt = Boolean(promptText.value.trim())
  if (!hasPrompt && !usingReference.value) {
    errorText.value = '先写一句想画什么，或者打开「引用当前画布」'
    return
  }

  generating.value = true
  errorText.value = ''
  try {
    const level = activeStrength.value
    let reference = ''
    // 强度越低，送给模型的参考图越小：细节少了，AI 才敢自己重排画面
    if (lassoRefImage.value) reference = lassoRefImage.value
    else if (referenceOn.value) reference = exportAsShown(level.maxSize).toDataURL('image/jpeg', 0.72)
    usedLasso.value = lassoRefImage.value ? lassoBox.value : null

    const list = await requestArtwork({
      prompt: promptText.value,
      styleId: styleId.value,
      count: RESULT_COUNT,
      referenceDataUrl: reference,
      strengthHint: reference ? level.hintPrompt : '',
      model: activeModel.value?.model || '',
      provider: activeModel.value?.provider || '',
    })
    const usable = (Array.isArray(list) ? list : []).filter((item) => item && item.imageUrl)
    if (!usable.length) throw new Error('这次没有出图，换个说法再试一次')

    // 只要 1 张：模型偶尔会多返回，多余的直接丢掉，界面上也没有地方放
    results.value = usable.slice(0, 1).map((item, index) => ({
      id: item.id || `result-${Date.now()}-${index}`,
      imageUrl: item.imageUrl,
      prompt: item.prompt || '',
    }))
    currentIndex.value = 0
    lastCount.value = results.value.length
  } catch (error) {
    errorText.value = error?.message || '生成失败，请稍后再试'
  } finally {
    generating.value = false
  }
}

async function insertResult(index) {
  const item = results.value[index]
  if (!item || inserting.value) return
  inserting.value = true
  errorText.value = ''
  try {
    // 跨域图片直接画进 canvas 会让整张画布被标记为已污染，导出时抛 SecurityError，
    // 所以先换成站内同源地址（data URL 则原样返回）。
    const safeUrl = await toCanvasSafeImageUrl(item.imageUrl)
    const image = await loadImage(safeUrl)
    const preset = STYLE_PRESETS.find((entry) => entry.id === styleId.value)
    const layerName = `AI · ${preset?.label || '生成'}`
    const box = usedLasso.value
    const layer = box
      ? doc.value.addImageLayer(layerName, stageIntoBox(image, box), { fit: 'cover' })
      : doc.value.addImageLayer(layerName, image, { fit: 'cover' })
    if (!layer) throw new Error('插回画纸失败，请重试')
    doc.value.activeLayerId = layer.id
    onChanged()
    flash(box ? '已贴回框选那块，成为新图层' : '已插成新图层，可以直接在上面接着画')
  } catch (error) {
    errorText.value = error?.message || '插回画纸失败'
  } finally {
    inserting.value = false
  }
}

// ---------- 笔刷 / 快捷键 / 外部点击 ----------

/** 每种笔刷记住自己上次用的粗细，切来切去不用反复调 */
const sizeByBrush = reactive({})
watch(brushId, (next, prev) => {
  if (prev) sizeByBrush[prev] = size.value
  size.value = sizeByBrush[next] || BRUSH_MAP[next]?.size || 16
})

function onDocPointerDown(event) {
  const target = event.target
  // 下拉菜单自己内部点击不算「点外面」，否则选项还没点到就被关了
  if (target instanceof Element && target.closest('.paint-more-wrap')) return
  moreOpen.value = false
  if (target instanceof Element && target.closest('.paint-model-wrap')) return
  modelPickerOpen.value = false
  if (target instanceof Element && target.closest('.paint-size-wrap')) return
  sizeMenuOpen.value = false
}

function onKeyDown(event) {
  const target = event.target
  const isField = target instanceof HTMLElement && target.closest('input, textarea, [contenteditable="true"]')
  if (isField) return
  // Esc 退出画纸全屏（在输入框里不抢，方便退出输入）
  if (event.key === 'Escape' && canvasFocus.value) {
    event.preventDefault()
    toggleCanvasFocus()
    return
  }
  if (!(event.ctrlKey || event.metaKey)) return
  const key = event.key.toLowerCase()
  if (key === 'z' && !event.shiftKey) {
    event.preventDefault()
    undo()
    return
  }
  if ((key === 'z' && event.shiftKey) || key === 'y') {
    event.preventDefault()
    redo()
  }
}

onMounted(() => {
  syncView()
  syncViewport()
  window.addEventListener('resize', syncViewport)
  window.addEventListener('orientationchange', syncViewport)
  document.addEventListener('pointerdown', onDocPointerDown, true)
  window.addEventListener('keydown', onKeyDown)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  loadModels()
})

onBeforeUnmount(() => {
  window.clearTimeout(toastTimer)
  window.removeEventListener('resize', syncViewport)
  window.removeEventListener('orientationchange', syncViewport)
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  window.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
})
</script>

<style scoped>
.paint-app {
  position: fixed;
  /* 从共用顶栏下面开始：以前 top:0 被顶栏盖住一截，底部还空出一条 */
  top: var(--app-top, 0px);
  left: 0;
  right: 0;
  /* 高度一定要用 dvh：iPad Safari 上 fixed+inset:0 按「布局视口」算，
     地址栏占掉的那一截也算进去，顶栏就被压到看不见了。
     dvh 跟的是真正能看见的高度，第一行给老浏览器兜底。 */
  height: calc(100vh - var(--app-top, 0px));
  height: calc(100dvh - var(--app-top, 0px));
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px 14px;
  background: var(--color-bg, #f4f6fa);
  color: var(--color-text, #4b5563);
  overflow: hidden;
}

/* ================= 顶栏 ================= */
.paint-topbar {
  height: 52px;
  flex: 0 0 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
/* 顶栏左边是「返回 + 品牌」一组，右边是「保存状态 + 保存 + 头像」一组。
   中间用 space-between 撑开，所以左边必须自己包一层，不能直接塞进 header。 */
.paint-topbar-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.paint-back {
  height: 34px;
  min-height: 0;
  flex: 0 0 auto;
  padding: 0 13px 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 999px;
  background: #fff;
  color: var(--color-text, #4b5563);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: .18s cubic-bezier(.22, .61, .36, 1);
}
.paint-back svg { width: 15px; height: 15px; }
.paint-back:hover { border-color: rgba(108, 92, 231, .4); color: #6c5ce7; transform: translateX(-2px); }
.paint-brand { display: flex; align-items: center; gap: 11px; min-width: 0; }
.paint-brand-mark {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #6c5ce7, #a594f9);
  box-shadow: 0 8px 18px rgba(108, 92, 231, .28);
}
.paint-brand-mark svg { width: 20px; height: 20px; }
.paint-brand-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.paint-brand-text strong { font-size: 15px; color: var(--color-title, #1f2937); letter-spacing: .2px; }
.paint-brand-text span {
  font-size: 11.5px;
  color: var(--color-muted, #9ca3af);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.paint-topbar-right { display: flex; align-items: center; gap: 10px; }

.paint-save-state { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--color-muted, #9ca3af); white-space: nowrap; }
.paint-save-state i { width: 6px; height: 6px; border-radius: 50%; background: #c2c9d2; }
.paint-save-state.is-dirty i { background: #f59e0b; box-shadow: 0 0 0 3px rgba(245, 158, 11, .16); }
.paint-save-state.is-saving i { background: #36bffa; box-shadow: 0 0 0 3px rgba(54, 191, 250, .16); }
.paint-save-state.is-saved i { background: #34d399; box-shadow: 0 0 0 3px rgba(52, 211, 153, .16); }
.paint-save-state.is-error i { background: #ef4444; box-shadow: 0 0 0 3px rgba(239, 68, 68, .16); }

.paint-ghost {
  height: 34px;
  min-height: 0;
  padding: 0 14px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 999px;
  background: #fff;
  color: var(--color-text, #4b5563);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: .18s cubic-bezier(.22, .61, .36, 1);
}
.paint-ghost:hover:not(:disabled) { border-color: rgba(108, 92, 231, .4); color: #6c5ce7; transform: translateY(-1px); }
.paint-ghost:disabled { opacity: .6; cursor: default; }

.paint-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #e9e5fe, #cfc8fa);
  color: #5b4bd6;
  font-size: 13px;
  font-weight: 700;
  border: 2px solid #fff;
  box-shadow: var(--shadow-card, 0 12px 28px rgba(31, 41, 55, .08));
}

/* ================= 工作区 ================= */
/*
 * 工作区：左画板 + 右 AI 区合成「一整张卡」。
 * 原来是两张独立卡片（各有圆角、边框、阴影）+ 中间 14px 空档，看着像两个软件并排。
 * 现在两栏之间 gap:0，外框（圆角/边框/阴影）挂在工作区上，右栏只留一条 1px 分割线，
 * 顺带把画纸的可用宽度多挤出 14px。
 */
.paint-workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 496px;
  gap: 0;
  position: relative;
  background: var(--color-surface, #fff);
  border: 1px solid rgba(31, 41, 55, .07);
  border-radius: 20px;
  box-shadow: var(--shadow-card, 0 12px 28px rgba(31, 41, 55, .08));
  overflow: hidden;
}

/* ---------- 左：画板 ---------- */
.paint-board {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--color-surface, #fff);
  overflow: hidden;
}
.paint-board-head {
  height: 44px;
  flex: 0 0 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 12px 0 14px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}
.paint-bh-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
.paint-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border-radius: 50%;
  background: #6c5ce7;
  box-shadow: 0 0 0 4px rgba(108, 92, 231, .12);
}
.paint-bh-left strong { font-size: 13px; font-weight: 700; color: var(--color-title, #1f2937); white-space: nowrap; }
.paint-bh-tag {
  min-height: 0;
  max-width: 170px;
  padding: 2px 7px;
  border: 0;
  border-radius: 6px;
  background: #f3f1ff;
  color: #5b4bd6;
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.paint-bh-tag:hover { background: #e9e5fe; }
.paint-bh-input {
  width: 150px;
  height: 22px;
  min-height: 0;
  padding: 0 6px;
  border: 1px solid rgba(108, 92, 231, .4);
  border-radius: 6px;
  background: #fff;
  color: var(--color-title, #1f2937);
  font-size: 11px;
  outline: none;
}
/* 画纸尺寸按钮：原来是灰色小字，现在是可点的小按钮。
   ⚠️ 全局 button{min-height} 会把它撑高，必须显式 min-height:0 并自己定高。 */
.paint-size-wrap { position: relative; flex: 0 0 auto; }
.paint-bh-size {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 24px;
  min-height: 0;
  padding: 0 6px 0 8px;
  border: 1px solid rgba(31, 41, 55, .1);
  border-radius: 7px;
  background: #fff;
  color: #5b6675;
  font-size: 10.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  cursor: pointer;
  transition: .16s;
}
.paint-bh-size svg { width: 10px; height: 10px; color: #98a2b0; transition: .16s; }
.paint-bh-size:hover { border-color: rgba(108, 92, 231, .5); color: #6c5ce7; }
.paint-bh-size:hover svg { color: #6c5ce7; }
.paint-bh-size.is-open { border-color: rgba(108, 92, 231, .62); color: #6c5ce7; background: #f7f6ff; }
.paint-bh-size.is-open svg { color: #6c5ce7; transform: rotate(180deg); }

.paint-size-menu {
  position: absolute;
  left: 0;
  top: 30px;
  z-index: 70;
  width: 232px;
  padding: 9px 10px 10px;
  border: 1px solid rgba(31, 41, 55, .09);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 18px 40px rgba(31, 41, 55, .18);
  /* 面板浮在画纸上方，给画纸一点“被盖住”的纵深感 */
  animation: paint-size-pop .16s ease-out;
}
@keyframes paint-size-pop {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.paint-size-tip { margin: 0 0 7px; font-size: 9.5px; color: #a8b0ba; }
.paint-size-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
.paint-size-item {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 0;
  padding: 6px 7px;
  border: 1px solid rgba(31, 41, 55, .08);
  border-radius: 8px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  transition: .16s;
}
.paint-size-item:hover { border-color: rgba(108, 92, 231, .45); background: #f9f8ff; }
.paint-size-item.is-active { border-color: rgba(108, 92, 231, .72); background: #f3f1ff; }
.paint-size-ratio {
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
}
.paint-size-ratio i { display: block; border: 1.5px solid #b9c2ce; border-radius: 2px; background: #f4f6fa; }
.paint-size-item.is-active .paint-size-ratio i { border-color: #6c5ce7; background: #e9e5fe; }
.paint-size-txt { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.paint-size-txt b { font-size: 10.5px; font-weight: 700; color: #37404c; }
.paint-size-txt em { font-style: normal; font-size: 8.5px; color: #a8b0ba; font-variant-numeric: tabular-nums; }
.paint-size-item.is-active .paint-size-txt b { color: #6c5ce7; }

.paint-size-custom {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f0f2f6;
}
.paint-size-custom-label { font-size: 9.5px; color: #98a2b0; flex: 0 0 auto; }
.paint-size-custom input {
  width: 44px;
  height: 24px;
  min-height: 0;
  padding: 0 4px;
  border: 1px solid rgba(31, 41, 55, .12);
  border-radius: 6px;
  background: #fff;
  color: #37404c;
  font-size: 10.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: center;
  outline: none;
}
.paint-size-custom input:focus { border-color: rgba(108, 92, 231, .6); }
.paint-size-x, .paint-size-px { font-size: 9.5px; color: #a8b0ba; }
.paint-size-apply {
  margin-left: auto;
  height: 24px;
  min-height: 0;
  padding: 0 10px;
  border: 0;
  border-radius: 7px;
  background: #6c5ce7;
  color: #fff;
  font-size: 10.5px;
  font-weight: 700;
  cursor: pointer;
}
.paint-size-apply:hover { background: #5b4bd6; }
.paint-size-note { margin: 7px 0 0; font-size: 8.5px; line-height: 1.5; color: #b3bcc7; }

.paint-bh-right { display: flex; align-items: center; gap: 2px; }
.paint-icon-btn {
  width: 28px;
  height: 28px;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  display: grid;
  place-items: center;
  color: #8b95a3;
  cursor: pointer;
  transition: .16s;
}
.paint-icon-btn svg { width: 14px; height: 14px; }
.paint-icon-btn:hover:not(:disabled) { background: #f3f5f9; color: var(--color-title, #1f2937); }
.paint-icon-btn:disabled { opacity: .42; cursor: default; }

/* 全屏按钮单独隔开：左边是「改画」的操作，右边是「看画」的操作，别混在一起 */
.paint-focus-btn {
  margin-left: 4px;
  box-shadow: inset 1px 0 0 var(--color-border, #e5e7eb);
  border-radius: 0 8px 8px 0;
  padding-left: 6px;
  width: 32px;
  color: #6b7684;
}
/* 全屏态：顶栏整条藏起来了，这个按钮是唯一出口 → 从方形图标展开成橙色胶囊。
   ⚠️ 全局 button{min-height:48px} 会把它撑高，必须显式 min-height:0。 */
.paint-focus-btn.is-on {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  width: auto;
  height: 30px;
  min-height: 0;
  padding: 0 12px 0 9px;
  margin-left: 4px;
  border-radius: 999px;
  box-shadow: none;
  color: #6c5ce7;
  background: #f3f1ff;
  border: 1px solid rgba(108, 92, 231, .42);
}
.paint-focus-btn.is-on svg { width: 13px; height: 13px; }
.paint-focus-btn.is-on:hover:not(:disabled) { background: #ebe8fe; color: #5b4bd6; border-color: rgba(108, 92, 231, .62); }
.paint-focus-label { font-size: 12px; font-weight: 700; line-height: 1; white-space: nowrap; }

.paint-more-wrap { position: relative; }
.paint-more-menu {
  position: absolute;
  right: 0;
  top: 32px;
  z-index: 60;
  min-width: 152px;
  padding: 5px;
  background: #fff;
  border: 1px solid rgba(31, 41, 55, .09);
  border-radius: 12px;
  box-shadow: 0 18px 40px rgba(31, 41, 55, .18);
}
.paint-more-menu button {
  display: block;
  width: 100%;
  min-height: 0;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  font-size: 12px;
  color: var(--color-text, #4b5563);
  cursor: pointer;
}
.paint-more-menu button:hover { background: #f4f6fa; color: var(--color-title, #1f2937); }
.paint-more-menu button.is-danger:hover { background: #fef2f2; color: #dc2626; }

/* 画笔浮层靠这里当定位父级：left:60px 正好落在 56px 工具栏的右边 */
.paint-board-body { flex: 1; min-height: 0; display: flex; position: relative; }

/* ---------- 右：AI 生成 ---------- */
/* 右栏不再自带圆角/边框/阴影（外框在工作区上），只保留左侧那一条分割线 */
.paint-ai {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--color-surface, #fff);
  border-left: 1px solid #e2e8f1;
  overflow: hidden;
  position: relative;
}
/* 三色装饰线改到整张卡顶部横贯（原来是只画在右栏顶上，像右栏自己的装饰） */
.paint-workspace::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 5;
  background: linear-gradient(90deg, #6c5ce7, #f472b6, #36bffa);
  pointer-events: none;
}
/* 板头跟着让出这 3px，文字别压在彩色线上 */
.paint-board-head { padding-top: 3px; }

.paint-ai-body { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 15px 16px 14px; }

.paint-styles { display: flex; gap: 5px; overflow-x: auto; padding-bottom: 2px; margin-bottom: 10px; scrollbar-width: none; }
.paint-styles::-webkit-scrollbar { display: none; }
.paint-style-chip {
  flex: 0 0 auto;
  height: 26px;
  min-height: 0;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: #f5f7fb;
  color: #5b6675;
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: .16s cubic-bezier(.22, .61, .36, 1);
}
.paint-style-chip:hover { background: #eef2f8; color: var(--color-title, #1f2937); }
.paint-style-chip.is-active {
  color: #5b4bd6;
  background: #f3f1ff;
  border-color: rgba(108, 92, 231, .34);
  box-shadow: 0 2px 6px rgba(108, 92, 231, .12);
}

.paint-sec-label {
  margin: 0 0 7px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 700;
  color: #6b7684;
}
.paint-sec-label em { font-style: normal; font-size: 10px; font-weight: 600; color: var(--color-muted, #9ca3af); }

/* ---------- 导入到新图层 + 参考强度（同一排，钉在缩略图下方） ---------- */
/* 这一块是「看完图之后要做的事」，所以沉到最下面，上面加一条浅分隔线跟结果区分开 */
.paint-strength {
  flex: 0 0 auto;
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px solid #eef1f6;
}
.paint-strength-row { display: flex; align-items: center; gap: 10px; }

/* 主行动按钮：承接原来底部那条橙色横条的视觉重量，用户一眼能看到「图可以拿过去」 */
.paint-import-btn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 27px;
  min-height: 0;             /* 全局 button 有 48px 触控高，这里必须压回去 */
  padding: 0 11px 0 9px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: linear-gradient(118deg, #a594f9, #5b4bd6);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: 0 3px 10px rgba(91, 75, 214, .24);
  transition: filter .16s cubic-bezier(.22, .61, .36, 1), box-shadow .16s, background .16s;
}
.paint-import-btn svg { flex: 0 0 auto; width: 13px; height: 13px; }
.paint-import-btn:hover:not(:disabled) { filter: brightness(1.07); box-shadow: 0 5px 14px rgba(91, 75, 214, .32); }
.paint-import-btn:disabled {
  background: #eef1f6;
  color: #a9b3c0;
  box-shadow: none;
  cursor: not-allowed;
}

.paint-strength-ctl { flex: 1 1 auto; display: flex; align-items: center; gap: 8px; min-width: 0; }
.paint-strength-name { flex: 0 0 auto; font-size: 11px; font-weight: 700; color: #6b7684; }
.paint-strength-val {
  flex: 0 0 auto;
  min-width: 32px;
  font-size: 11px;
  font-weight: 700;
  color: #5b4bd6;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
/* 滑块：轨道/填充/拇指自绘，原生 input 只留交互 */
.paint-strength-slider {
  position: relative;
  flex: 1 1 auto;
  min-width: 62px;
  height: 27px;
}
.paint-strength-rail,
.paint-strength-fill {
  position: absolute;
  top: 50%;
  height: 6px;
  border-radius: 999px;
  transform: translateY(-50%);
  pointer-events: none;
}
.paint-strength-rail { left: 0; right: 0; background: #e4e9f1; box-shadow: inset 0 1px 2px rgba(31, 41, 55, .06); }
.paint-strength-fill {
  left: 0;
  width: var(--pct, 60%);
  background: linear-gradient(90deg, #a594f9, #6c5ce7);
}
.paint-strength-knob {
  position: absolute;
  top: 50%;
  left: var(--pct, 60%);
  width: 15px;
  height: 15px;
  margin: -7.5px 0 0 -7.5px;
  border-radius: 50%;
  background: #fff;
  border: 2.5px solid #6c5ce7;
  box-shadow: 0 1px 4px rgba(31, 41, 55, .24);
  pointer-events: none;
}
.paint-strength-slider:has(.paint-strength-range:focus-visible) .paint-strength-knob {
  box-shadow: 0 0 0 3px rgba(108, 92, 231, .26);
}
.paint-strength-range {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  margin: 0;
  padding: 0;
  background: transparent;
  -webkit-appearance: none;
  appearance: none;
  opacity: 0;           /* 视觉全交给上面三层；opacity 不影响点击与拖动 */
  cursor: pointer;
}
.paint-strength-hint {
  margin: 3px 0 0;
  padding-left: 2px;
  font-size: 10px;
  color: var(--color-muted, #9ca3af);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.paint-results { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 9px; }
.paint-result {
  position: relative;
  display: block;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 12px;
  overflow: hidden;
  background: #f4f6fa;
  box-shadow: 0 2px 10px rgba(31, 41, 55, .1);
  cursor: pointer;
  transition: .18s cubic-bezier(.22, .61, .36, 1);
}
.paint-result img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.paint-result-main { flex: 1 1 0; min-height: 0; cursor: default; border-radius: 14px; }
.paint-result.is-current { border-color: #6c5ce7; box-shadow: 0 10px 26px rgba(108, 92, 231, .22); }

.paint-rbadge {
  position: absolute;
  z-index: 3;
  left: 10px;
  top: 10px;
  padding: 3px 8px;
  border-radius: 6px;
  background: #6c5ce7;
  color: #fff;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: .3px;
}
.paint-rindex {
  position: absolute;
  z-index: 3;
  right: 7px;
  top: 7px;
  padding: 2px 5px;
  border-radius: 5px;
  background: rgba(255, 255, 255, .92);
  color: #3d4753;
  font-size: 9px;
  font-weight: 700;
}
.paint-result-main .paint-rindex { right: 10px; top: 10px; padding: 3px 7px; font-size: 10px; }

.paint-rtools {
  position: absolute;
  z-index: 3;
  left: 6px;
  right: 6px;
  bottom: 6px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transform: translateY(4px);
  transition: .18s cubic-bezier(.22, .61, .36, 1);
}
.paint-result:hover .paint-rtools,
.paint-result-main .paint-rtools { opacity: 1; transform: none; }
.paint-rtools span {
  flex: 1;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: rgba(255, 255, 255, .94);
  color: #3d4753;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
}
.paint-rtools span:hover { background: #fff; color: #6c5ce7; }
.paint-result-main .paint-rtools { left: 10px; right: 10px; bottom: 10px; justify-content: flex-start; }
.paint-result-main .paint-rtools span {
  flex: 0 0 auto;
  height: 28px;
  padding: 0 16px;
  font-size: 11.5px;
  box-shadow: 0 4px 12px rgba(31, 41, 55, .14);
}

.paint-result-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 16px;
  text-align: center;
}
.paint-result-empty svg { width: 26px; height: 26px; color: #c2c9d2; }
.paint-result-empty b { font-size: 12px; color: #6b7684; }
.paint-result-empty em { font-style: normal; font-size: 10.5px; color: #a8b0ba; }


.paint-ai-error {
  margin: 8px 0 0;
  padding: 7px 10px;
  border-radius: 8px;
  background: #fef2f2;
  color: #dc2626;
  font-size: 11px;
  line-height: 1.5;
}

/* ================= 底部提示词条 ================= */
.paint-composer { flex: 0 0 auto; }
.paint-prompt-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 9px 9px 11px;
  background: var(--color-surface, #fff);
  border: 1px solid rgba(31, 41, 55, .08);
  border-radius: 16px;
  box-shadow: 0 10px 26px rgba(31, 41, 55, .09);
}
.paint-ref-chip {
  height: 34px;
  min-height: 0;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
  background: #fff;
  color: #8b95a3;
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: .16s;
}
.paint-ref-chip svg { width: 13px; height: 13px; }
.paint-ref-chip:hover { background: #ebe8fe; }
.paint-ref-chip.is-on,
.paint-ref-chip.is-lasso { color: #5b4bd6; background: #f5f3ff; border-color: rgba(108, 92, 231, .24); }

/* 出图模型下拉：外观跟左边「引用当前画布」一个模子，一眼看出是同一排的开关 */
.paint-model-wrap { position: relative; flex: 0 0 auto; }
.paint-model-chip {
  height: 34px;
  min-height: 0;
  max-width: 168px;
  padding: 0 9px 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
  background: #fff;
  color: #6b7684;
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: .16s;
}
.paint-model-chip > svg { width: 13px; height: 13px; flex: 0 0 13px; }
.paint-model-chip:hover { background: #f4f6fa; color: #1f2937; }
.paint-model-chip.is-on { border-color: rgba(108, 92, 231, .3); background: #f5f3ff; color: #5b4bd6; }
.paint-model-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.paint-model-caret { width: 11px !important; height: 11px !important; flex: 0 0 11px !important; opacity: .55; transition: transform .16s; }
.paint-model-chip.is-on .paint-model-caret { transform: rotate(180deg); opacity: .8; }

/* 菜单往上弹：这条横栏贴着页面最底边，往下弹会被屏幕裁掉 */
.paint-model-menu {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  z-index: 60;
  width: 224px;
  max-height: 264px;
  overflow-y: auto;
  padding: 5px;
  background: #fff;
  border: 1px solid rgba(31, 41, 55, .09);
  border-radius: 13px;
  box-shadow: 0 22px 48px rgba(31, 41, 55, .2), 0 2px 8px rgba(31, 41, 55, .07);
  scrollbar-width: thin;
}
.paint-model-menu::-webkit-scrollbar { width: 6px; }
.paint-model-menu::-webkit-scrollbar-thumb { background: #dbe2ec; border-radius: 3px; }
.paint-model-tip {
  margin: 3px 6px 5px;
  font-size: 9.5px;
  line-height: 1.4;
  color: #9ca3af;
}
.paint-model-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 0;
  /* 全局只约定了 button 的最小高度，没有重置外观；不写这两行会露出浏览器默认的深色描边按钮 */
  border: 0;
  background: none;
  cursor: pointer;
  padding: 7px 8px;
  border-radius: 9px;
  text-align: left;
  transition: .14s;
}
.paint-model-item:hover { background: #f5f7fb; }
.paint-model-item.is-active { background: #f3f1ff; box-shadow: inset 0 0 0 1px rgba(108, 92, 231, .26); }
.paint-model-item-main { display: flex; flex-direction: column; min-width: 0; }
.paint-model-item-main b {
  font-size: 11.5px;
  font-weight: 600;
  color: #1f2937;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.paint-model-item-main em { font-style: normal; font-size: 9.5px; color: #9ca3af; line-height: 1.3; }
.paint-model-item.is-active .paint-model-item-main b { color: #5b4bd6; }
.paint-model-tick { width: 13px; height: 13px; flex: 0 0 13px; margin-left: auto; color: #6c5ce7; }

.paint-prompt-input {
  flex: 1;
  min-width: 0;
  height: 36px;
  min-height: 0;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--color-title, #1f2937);
  font-size: 13px;
}
.paint-prompt-input::placeholder { color: #b3bcc8; }

.paint-count { padding-right: 2px; font-size: 10.5px; color: var(--color-muted, #9ca3af); white-space: nowrap; }

.paint-gen-btn {
  height: 40px;
  min-height: 0;
  padding: 0 18px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 0;
  border-radius: 11px;
  background: linear-gradient(135deg, #6c5ce7, #a594f9);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: 0 10px 22px rgba(108, 92, 231, .3);
  transition: .18s cubic-bezier(.22, .61, .36, 1);
}
.paint-gen-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 14px 26px rgba(108, 92, 231, .36); }
.paint-gen-btn:disabled { opacity: .72; cursor: default; transform: none; }
.paint-gen-btn svg { width: 14px; height: 14px; }

/* ================= 轻提示 ================= */
.paint-toast {
  position: fixed;
  left: 50%;
  /* 贴在顶栏下方居中：舞台底部有「操作提示」和「缩放条」两处浮层，
     轻提示如果放底部必然压到其中一处，放顶部最干净 */
  top: 62px;
  z-index: 200;
  transform: translateX(-50%);
  padding: 9px 16px;
  border-radius: 999px;
  background: rgba(31, 41, 55, .92);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 12px 28px rgba(31, 41, 55, .28);
  pointer-events: none;
}
.paint-toast-enter-active,
.paint-toast-leave-active { transition: opacity .18s ease, transform .18s ease; }
/* 从顶栏往下来 */
.paint-toast-enter-from,
.paint-toast-leave-to { opacity: 0; transform: translate(-50%, -8px); }

/* ================= 竖屏闸门 ================= */
.paint-rotate-mask {
  position: fixed;
  inset: 0;
  z-index: 6000;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 14px;
  padding: 32px;
  text-align: center;
  background: #0f172a;
  color: #fff;
}
.paint-rotate-icon {
  display: grid;
  place-items: center;
  width: 66px;
  height: 66px;
  border-radius: 22px;
  background: rgba(255, 255, 255, .1);
  color: #fff;
}
.paint-rotate-icon svg { width: 34px; height: 34px; }
.paint-rotate-mask strong { font-size: 23px; letter-spacing: .5px; }
.paint-rotate-mask p {
  margin: 0;
  max-width: 360px;
  font-size: 13.5px;
  line-height: 1.75;
  color: rgba(255, 255, 255, .76);
}
.paint-rotate-mask button {
  min-height: 48px;
  margin-top: 4px;
  padding: 0 26px;
  border: 0;
  border-radius: 999px;
  background: #fff;
  color: #1f2937;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}

/* ================= 画纸全屏 ================= */
/* 全屏 = 干净画纸：顶栏整条、右侧 AI 区、底部提示词全部让位，只剩工具栏 + 画纸。
   ⚠️ 顶栏藏掉后「返回 / 保存作品」也一起没了，这是刻意的——退出全屏后它们原样回来。
   出口只有两个：板头右上的橙色「退出全屏」胶囊 + Esc。 */
.paint-app.is-canvas-focus { padding: 0; gap: 0; }
.paint-app.is-canvas-focus .paint-topbar { display: none; }
.paint-app.is-canvas-focus .paint-workspace {
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.paint-app.is-canvas-focus .paint-workspace::before { display: none; }
.paint-app.is-canvas-focus .paint-ai,
.paint-app.is-canvas-focus .paint-composer { display: none; }
/* 顶栏没了，板头就顶到屏幕最上沿；留一点安全区，别被 iPad 状态栏压住那排图标 */
.paint-app.is-canvas-focus .paint-board-head { padding-top: max(8px, env(safe-area-inset-top, 0px)); }

/* ================= 适配 ================= */
@media (max-width: 1360px) {
  .paint-workspace { grid-template-columns: minmax(0, 1fr) 440px; }
}
@media (max-width: 1180px) {
  .paint-workspace { grid-template-columns: minmax(0, 1fr) 380px; }
  .paint-brand-text span { display: none; }
}
@media (max-width: 1020px) {
  .paint-workspace { grid-template-columns: minmax(0, 1fr); }
  .paint-ai { display: none; }
}
/* 手机竖屏：顶栏放不下就只留图标，别把「保存作品」挤出去 */
@media (max-width: 640px) {
  .paint-back { width: 34px; padding: 0; justify-content: center; }
  .paint-back span { display: none; }
  .paint-save-state { display: none; }
}
</style>
