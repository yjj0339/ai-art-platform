<template>
  <section class="ax-page wb-page">
    <header class="ax-head">
      <div>
        <h2>工作台管理</h2>
        <p>用户一打开工作台看到的东西：九张卡片图、背后的背景（图或视频）、左上角 LOGO。改完点「保存并生效」，用户刷新页面就能看到。</p>
      </div>
      <div class="ax-head-actions">
        <button type="button" class="ax-btn" :disabled="loading || saving" @click="loadConfig"><AdminIcon name="refresh" plain />{{ loading ? '读取中…' : '刷新' }}</button>
        <button type="button" class="ax-btn" :disabled="loading || saving" @click="resetAll"><AdminIcon name="undo" plain />恢复默认</button>
        <button type="button" class="ax-btn is-primary" :disabled="loading || saving || !dirty" @click="saveConfig">{{ saving ? '保存中…' : dirty ? '保存并生效' : '已保存' }}</button>
      </div>
    </header>

    <div class="wb-tips">
      <div class="wb-tip"><AdminIcon name="lock" tint="#8e8e93" /><span class="ax-row-main"><strong>卡片不能新增</strong><small>每张卡背后绑着一个用户页面（绘画、视频、3D…），凭空加一张没有页面可去。</small></span></div>
      <div class="wb-tip"><AdminIcon name="image" /><span class="ax-row-main"><strong>卡片图按 3:4 竖版存</strong><small>上传后自动压成 720×960，后台看到的构图就是用户看到的。</small></span></div>
      <div class="wb-tip"><AdminIcon name="video" /><span class="ax-row-main"><strong>背景视频限 20MB</strong><small>超过请先压缩，否则用户弱网打不开，会一直停在第一帧。</small></span></div>
    </div>

    <div v-if="loadError" class="ax-note is-bad wb-note"><span>{{ loadError }}</span><button type="button" class="ax-btn is-sm" @click="loadConfig">重新加载</button></div>
    <p v-if="notice" class="ax-note is-ok">{{ notice }}</p>

    <div v-if="loading" class="ax-card"><div class="ax-empty is-compact"><strong>正在读取工作台配置…</strong></div></div>

    <template v-else>
      <div class="wb-top">
        <!-- 1. 品牌 LOGO -->
        <section class="ax-card">
          <div class="ax-card-head">
            <div><h3>品牌 LOGO</h3><p>替换登录页左上角的「AI」方块，以及后台侧栏顶部的标识。建议方形透明底 PNG。</p></div>
            <button v-if="form.brand.logoUrl" type="button" class="ax-btn is-sm is-danger" @click="clearAsset('logo')">恢复内置</button>
          </div>
          <div class="wb-logo-row">
            <div class="wb-logo-preview" :class="{ 'is-empty': !form.brand.logoUrl }">
              <img v-if="form.brand.logoUrl" :src="form.brand.logoUrl" alt="LOGO 预览" />
              <AdminIcon v-else name="sparkles" size="xl" />
            </div>
            <div class="wb-logo-actions">
              <strong>{{ form.brand.logoUrl ? '已上传自定义 LOGO' : '正在使用内置标识' }}</strong>
              <small class="ax-hint">PNG / JPG / WEBP，8MB 以内。上传后自动压成 256×256。</small>
              <input ref="logoInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="handleFile($event, 'logo')" />
              <button type="button" class="ax-btn is-sm is-soft" :disabled="uploading.logo" @click="logoInput?.click()"><AdminIcon name="upload" plain />{{ uploading.logo ? '上传中…' : '上传 LOGO' }}</button>
            </div>
          </div>
        </section>

        <!-- 2. 背景 -->
        <section class="ax-card">
          <div class="ax-card-head">
            <div><h3>工作台背景</h3><p>整屏铺在九张卡片后面。传了视频就静音循环播放；只传图片就铺这张图；都不传用内置「动态光影」（原创、无水印、平板省电）。视频放不出来时先退回背景图，没有背景图再用动态光影。</p></div>
            <button v-if="form.background.videoUrl || form.background.imageUrl" type="button" class="ax-btn is-sm is-danger" @click="clearAsset('background')">恢复内置</button>
          </div>
          <div class="wb-bg-grid">
            <article class="wb-bg-card">
              <div class="wb-bg-preview">
                <video v-if="form.background.videoUrl" :src="form.background.videoUrl" muted loop autoplay playsinline />
                <img v-else-if="form.background.imageUrl" :src="form.background.imageUrl" alt="背景图预览" />
                <span v-else class="wb-bg-placeholder"><AdminIcon name="play" plain />内置「动态光影」</span>
              </div>
              <div class="wb-bg-meta">
                <strong>背景视频</strong>
                <small v-if="isLegacyVideo">原来的豆包视频 · 片中带「豆包 AI 生成」标识，用户端会在角落盖柔雾</small>
                <small v-else-if="form.background.videoUrl">已设置 · 用户端优先播视频</small>
                <small v-else>未设置 · MP4，20MB 以内，建议 10 秒无缝循环</small>
                <small v-if="isLegacyVideo" class="wb-warn">按《人工智能生成合成内容标识办法》，AI 生成内容的标识不宜遮挡或去掉，建议用内置动态光影或自己的原创视频。</small>
              </div>
              <div class="wb-bg-actions">
                <input ref="videoInput" type="file" accept="video/mp4" hidden @change="handleVideoFile" />
                <button type="button" class="ax-btn is-sm is-soft" :disabled="uploading.video" @click="videoInput?.click()"><AdminIcon name="upload" plain />{{ uploading.video ? '上传中…' : '上传视频' }}</button>
                <button v-if="form.background.videoUrl" type="button" class="ax-btn is-sm is-ghost" @click="form.background.videoUrl = ''; dirty = true">移除视频</button>
                <button v-else type="button" class="ax-btn is-sm is-ghost" @click="useLegacyVideo">用回原来的视频</button>
              </div>
            </article>

            <article class="wb-bg-card">
              <div class="wb-bg-preview">
                <img v-if="form.background.imageUrl" :src="form.background.imageUrl" alt="背景图预览" />
                <span v-else class="wb-bg-placeholder"><AdminIcon name="image" plain />未设置</span>
              </div>
              <div class="wb-bg-meta">
                <strong>背景图</strong>
                <small v-if="form.background.imageUrl">已设置</small>
                <small v-else>建议 1920×1080 横版；有视频时，它也是视频的封面和兜底</small>
              </div>
              <div class="wb-bg-actions">
                <input ref="bgImageInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="handleFile($event, 'bg')" />
                <button type="button" class="ax-btn is-sm is-soft" :disabled="uploading.bg" @click="bgImageInput?.click()"><AdminIcon name="upload" plain />{{ uploading.bg ? '上传中…' : '上传背景图' }}</button>
                <button v-if="form.background.imageUrl" type="button" class="ax-btn is-sm is-ghost" @click="form.background.imageUrl = ''; dirty = true">移除图片</button>
              </div>
            </article>
          </div>
        </section>
      </div>

      <!-- 3. 卡片 -->
      <section class="ax-card">
        <div class="ax-card-head">
          <div><h3>卡片封面</h3><p>九张卡片各一张竖图。没换过的沿用内置图；「作品广场」「我的素材库」有作品时会自动显示最新作品封面，这里配的图只作兜底。</p></div>
          <div class="wb-tools">
            <span class="ax-count">{{ visibleCount }} / {{ form.cards.length }} 张显示中</span>
            <button type="button" class="ax-btn is-sm" @click="resetCards">全部恢复内置图</button>
          </div>
        </div>

        <div class="wb-card-grid">
          <article v-for="card in form.cards" :key="card.id" class="wb-card" :class="{ 'is-hidden': !card.visible }">
            <div class="wb-card-preview">
              <img v-if="card.imageUrl" :src="card.imageUrl" :alt="`${card.title} 封面`" />
              <img v-else :src="builtinImage(card.id)" :alt="`${card.title} 内置封面`" class="is-builtin" />
              <span v-if="!card.visible" class="ax-pill is-muted wb-card-tag">已隐藏</span>
              <span v-else-if="!card.imageUrl" class="ax-pill is-info wb-card-tag">内置图</span>
            </div>
            <div class="wb-card-body">
              <div class="wb-card-title">
                <strong>{{ card.title }}</strong>
                <label class="ax-switch" :title="card.visible ? '点击隐藏这张卡' : '点击显示这张卡'">
                  <input v-model="card.visible" type="checkbox" :aria-label="`显示 ${card.title}`" @change="dirty = true" />
                  <i></i>
                </label>
              </div>
              <label class="ax-field">
                <span>构图位置</span>
                <select v-model="card.position" @change="dirty = true">
                  <option v-for="option in positionOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </label>
              <div class="wb-card-actions">
                <input :ref="(el) => setCardInput(card.id, el)" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="handleFile($event, 'card', card.id)" />
                <button type="button" class="ax-btn is-sm is-soft" :disabled="uploading[card.id]" @click="cardInputs[card.id]?.click()">{{ uploading[card.id] ? '上传中…' : '换图' }}</button>
                <button v-if="card.imageUrl" type="button" class="ax-btn is-sm is-ghost" @click="card.imageUrl = ''; dirty = true">用内置图</button>
              </div>
            </div>
          </article>
        </div>
      </section>
    </template>

    <div v-if="!loading" class="ax-savebar">
      <span class="ax-hint">
        <template v-if="dirty">有改动还没保存，用户端现在看到的仍是旧样子。</template>
        <template v-else-if="config.updatedAt">上次保存：{{ formatTime(config.updatedAt) }}</template>
        <template v-else>还没保存过，用户端使用内置外观。</template>
      </span>
      <button type="button" class="ax-btn is-primary" :disabled="saving || !dirty" @click="saveConfig">{{ saving ? '保存中…' : '保存并生效' }}</button>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  adminDeleteWorkbenchAsset,
  adminGetWorkbenchConfig,
  adminResetWorkbenchConfig,
  adminSaveWorkbenchConfig,
  adminUploadWorkbenchImage,
  adminUploadWorkbenchVideo,
} from '../services/workbenchGateway'
import {
  WORKBENCH_BUILTIN_CARD_IMAGES,
  WORKBENCH_BUILTIN_CARD_POSITIONS,
  WORKBENCH_CARD_ORDER,
  WORKBENCH_CARD_TITLES,
  WORKBENCH_LEGACY_BG_VIDEO,
  WORKBENCH_POSITION_OPTIONS,
} from '../utils/workbenchDefaults'
import AdminIcon from './admin/AdminIcon.vue'

const loading = ref(true)
const saving = ref(false)
const loadError = ref('')
const notice = ref('')
const config = ref({ updatedAt: '' })
const dirty = ref(false)
const positionOptions = WORKBENCH_POSITION_OPTIONS

// uploading 用「logo / bg / video / 卡片id」当 key：每张卡独立转圈，
// 不能共用一个布尔，否则传一张卡九张都在转。
const uploading = reactive({})
const logoInput = ref(null)
const videoInput = ref(null)
const bgImageInput = ref(null)
const cardInputs = reactive({})

function setCardInput(id, el) {
  if (el) cardInputs[id] = el
}

const form = reactive({
  brand: { logoUrl: '' },
  background: { imageUrl: '', videoUrl: '' },
  cards: WORKBENCH_CARD_ORDER.map((id) => ({
    id,
    title: WORKBENCH_CARD_TITLES[id],
    imageUrl: '',
    position: WORKBENCH_BUILTIN_CARD_POSITIONS[id] || 'center',
    visible: true,
  })),
})

const visibleCount = computed(() => form.cards.filter((card) => card.visible).length)

function builtinImage(id) {
  return WORKBENCH_BUILTIN_CARD_IMAGES[id] || ''
}

function applyNotice(text) {
  notice.value = text
  window.setTimeout(() => { if (notice.value === text) notice.value = '' }, 4000)
}

function errorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback
}

function formatTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 把后端配置铺进表单。后端返回的一定是归一化过的完整 9 张，所以这里可以逐张对上，
// 万一后端少了某张（老配置），也按内置默认补上，面板不会出现空卡片。
function applyConfig(payload) {
  const source = payload || {}
  config.value = { updatedAt: source.updatedAt || '' }
  form.brand.logoUrl = source.brand?.logoUrl || ''
  form.background.imageUrl = source.background?.imageUrl || ''
  form.background.videoUrl = source.background?.videoUrl || ''
  const byId = new Map((source.cards || []).map((card) => [card.id, card]))
  form.cards = WORKBENCH_CARD_ORDER.map((id) => {
    const saved = byId.get(id) || {}
    return {
      id,
      title: WORKBENCH_CARD_TITLES[id],
      imageUrl: saved.imageUrl || '',
      position: saved.position || WORKBENCH_BUILTIN_CARD_POSITIONS[id] || 'center',
      visible: saved.visible !== false,
    }
  })
  dirty.value = false
}

async function loadConfig() {
  loading.value = true
  loadError.value = ''
  try {
    applyConfig(await adminGetWorkbenchConfig())
  } catch (error) {
    loadError.value = errorMessage(error, '读取工作台配置失败')
  } finally {
    loading.value = false
  }
}

async function saveConfig() {
  saving.value = true
  // 存下「保存前」引用的素材，保存成功后再对比，把换下来的旧图删掉，
  // 不然每换一次图就在服务器上多留一份，一年下来几十上百张没人清。
  const beforeAssets = collectAssetNames(form)
  try {
    const saved = await adminSaveWorkbenchConfig({
      brand: { logoUrl: form.brand.logoUrl },
      background: { imageUrl: form.background.imageUrl, videoUrl: form.background.videoUrl },
      cards: form.cards.map((card) => ({
        id: card.id,
        imageUrl: card.imageUrl,
        position: card.position,
        visible: card.visible,
      })),
    })
    if (saved) applyConfig(saved)
    else await loadConfig()
    applyNotice('已保存，用户刷新工作台就能看到')
    ElMessage.success('工作台外观已更新')
    cleanOrphanAssets(beforeAssets, collectAssetNames(form))
  } catch (error) {
    ElMessage.error(errorMessage(error, '保存失败'))
  } finally {
    saving.value = false
  }
}

// 从配置里把「本站素材文件名」抠出来，如 /api/workbench-assets/bg-123-abc.webp → bg-123-abc.webp
function collectAssetNames(source) {
  const urls = [
    source.brand?.logoUrl,
    source.background?.imageUrl,
    source.background?.videoUrl,
    ...(source.cards || []).map((card) => card.imageUrl),
  ]
  const names = new Set()
  urls.forEach((assetUrl) => {
    const matched = /\/api\/workbench-assets\/([A-Za-z0-9_.-]+)$/.exec(String(assetUrl || ''))
    if (matched) names.add(decodeURIComponent(matched[1]))
  })
  return names
}

// 后台静默清理：失败不提示、不打断，服务端还有一道「在用就不许删」的兜底。
function cleanOrphanAssets(beforeAssets, afterAssets) {
  beforeAssets.forEach((fileName) => {
    if (!afterAssets.has(fileName)) adminDeleteWorkbenchAsset(fileName)
  })
}

async function resetAll() {
  try {
    await ElMessageBox.confirm('会把卡片图、背景、LOGO 全部恢复成系统内置的样子（已上传的图片文件不会被删除），确定继续吗？', '恢复默认', { type: 'warning', confirmButtonText: '恢复默认' })
  } catch {
    return
  }
  saving.value = true
  try {
    applyConfig(await adminResetWorkbenchConfig())
    applyNotice('已恢复默认外观')
  } catch (error) {
    ElMessage.error(errorMessage(error, '恢复默认失败'))
  } finally {
    saving.value = false
  }
}

function resetCards() {
  form.cards.forEach((card) => {
    card.imageUrl = ''
    card.position = WORKBENCH_BUILTIN_CARD_POSITIONS[card.id] || 'center'
  })
  dirty.value = true
  applyNotice('卡片图已清空为内置图，记得点保存')
}

// 一键用回以前默认的那段豆包视频（文件一直留在站内 /assets 下，不用重新上传）
const isLegacyVideo = computed(() => form.background.videoUrl === WORKBENCH_LEGACY_BG_VIDEO)
function useLegacyVideo() {
  form.background.videoUrl = WORKBENCH_LEGACY_BG_VIDEO
  dirty.value = true
  applyNotice('已换回原来的视频背景，记得点保存')
}

// kind: 'logo' | 'bg' | 'card'
function clearAsset(kind) {
  if (kind === 'logo') form.brand.logoUrl = ''
  else if (kind === 'background') {
    form.background.imageUrl = ''
    form.background.videoUrl = ''
  }
  dirty.value = true
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

async function handleFile(event, kind, cardId = '') {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) { ElMessage.warning('请选择 PNG、JPG 或 WEBP 图片'); return }
  if (file.size > 8 * 1024 * 1024) { ElMessage.warning('图片不能超过 8MB，请先压缩'); return }
  const key = kind === 'card' ? cardId : kind
  uploading[key] = true
  try {
    const assetUrl = await adminUploadWorkbenchImage(kind, await readFileAsDataUrl(file))
    if (kind === 'logo') form.brand.logoUrl = assetUrl
    else if (kind === 'bg') form.background.imageUrl = assetUrl
    else {
      const card = form.cards.find((entry) => entry.id === cardId)
      if (card) card.imageUrl = assetUrl
    }
    dirty.value = true
    applyNotice('图片已上传，记得点保存才会生效')
  } catch (error) {
    ElMessage.error(errorMessage(error, '图片上传失败'))
  } finally {
    uploading[key] = false
  }
}

async function handleVideoFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!/^video\/mp4$/i.test(file.type)) { ElMessage.warning('请选择 MP4 视频'); return }
  if (file.size > 20 * 1024 * 1024) { ElMessage.warning('视频不能超过 20MB，请先压缩或缩短时长'); return }
  uploading.video = true
  try {
    form.background.videoUrl = await adminUploadWorkbenchVideo(await readFileAsDataUrl(file))
    dirty.value = true
    applyNotice('背景视频已上传，记得点保存才会生效')
  } catch (error) {
    ElMessage.error(errorMessage(error, '视频上传失败'))
  } finally {
    uploading.video = false
  }
}

onMounted(loadConfig)
</script>

<style scoped>
/* 工作台管理（2026-11-26 第二版）：LOGO + 背景并排，下面九张卡片 3:4 竖图墙；组件类名沿用 wb- 前缀 */
.wb-tips { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.wb-tip { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 14px 16px; border: 1px solid var(--ax-glass-edge); border-radius: var(--ax-radius); background: var(--ax-surface); box-shadow: var(--ax-shadow); -webkit-backdrop-filter: var(--ax-blur); backdrop-filter: var(--ax-blur); }
.wb-note { align-items: center; }
.wb-note > span { flex: 1 1 auto; }

.wb-top { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.6fr); align-items: stretch; gap: 16px; }
.wb-logo-row { display: flex; align-items: center; gap: 18px; }
.wb-logo-preview { display: grid; flex: none; overflow: hidden; place-items: center; width: 96px; height: 96px; border-radius: 24px; background: #fff; box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.08), 0 6px 16px rgba(16, 24, 40, 0.08); }
.wb-logo-preview.is-empty { background: var(--ax-surface-2); box-shadow: none; }
.wb-logo-preview > img { width: 100%; height: 100%; object-fit: contain; }
.wb-logo-actions { display: grid; justify-items: start; gap: 8px; min-width: 0; }
.wb-logo-actions > strong { color: var(--ax-ink); font-size: 14px; }

.wb-bg-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.wb-bg-card { display: grid; align-content: start; gap: 10px; min-width: 0; }
.wb-bg-preview { display: grid; overflow: hidden; place-items: center; aspect-ratio: 16 / 9; border-radius: 16px; background: linear-gradient(135deg, #dbe8ff, #f6e3f1 55%, #dff5ee); }
.wb-bg-preview > img,
.wb-bg-preview > video { width: 100%; height: 100%; object-fit: cover; }
.wb-bg-placeholder { display: inline-flex; align-items: center; gap: 6px; color: var(--ax-text); font-size: 13px; font-weight: 600; }
.wb-bg-meta { display: grid; gap: 3px; }
.wb-bg-meta > strong { color: var(--ax-ink); font-size: 14px; }
.wb-bg-meta > small { color: var(--ax-muted); font-size: 12.5px; line-height: 1.5; }
.wb-bg-meta > small.wb-warn { color: var(--ax-warn); }
.wb-bg-actions { display: flex; flex-wrap: wrap; gap: 6px; }

.wb-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.wb-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 14px; }
.wb-card { display: flex; flex-direction: column; overflow: hidden; min-width: 0; border-radius: 18px; background: var(--ax-surface-2); transition: opacity 0.2s ease; }
.wb-card.is-hidden { opacity: 0.6; }
.wb-card-preview { position: relative; overflow: hidden; aspect-ratio: 3 / 4; background: var(--ax-fill); }
.wb-card-preview > img { display: block; width: 100%; height: 100%; object-fit: cover; }
.wb-card.is-hidden .wb-card-preview > img { filter: grayscale(0.8); }
.wb-card-tag { position: absolute; bottom: 10px; left: 10px; background: rgba(255, 255, 255, 0.92) !important; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12); }
.wb-card-body { display: grid; gap: 10px; padding: 12px; }
.wb-card-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.wb-card-title > strong { overflow: hidden; color: var(--ax-ink); font-size: 14.5px; white-space: nowrap; text-overflow: ellipsis; }
.wb-card-actions { display: flex; flex-wrap: wrap; gap: 6px; }

@media (max-width: 1280px) {
  .wb-top { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 900px) {
  .wb-tips { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 640px) {
  .wb-bg-grid { grid-template-columns: minmax(0, 1fr); }
  .wb-card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
