<template>
  <main class="visual-test-page">
    <header class="visual-test-header">
      <div>
        <span class="eyebrow">AI视觉报告测试空间</span>
        <h1>我的产品设计故事 · AI整页视觉测试</h1>
        <p>每页生成一张完整竖版视觉图，当前为独立测试分支，不会修改正式H5报告。</p>
        <small v-if="runtimeTemplate" class="runtime-template">当前已发布模板：{{ runtimeTemplate.name }} · {{ runtimeTemplate.renderVersion === 2 ? '整页视觉配置' : '通用配置' }}</small>
        <small v-else class="runtime-template runtime-template--disabled">当前高级版尚未发布可用的整页视觉模板，请先在后台开启并发布。</small>
      </div>
      <div class="header-actions">
        <span class="test-badge">测试草稿</span>
        <button type="button" @click="resetDraft">恢复测试初始状态</button>
        <button type="button" class="primary" :disabled="generating || !runtimeTemplate" @click="generateAll">{{ generating ? progress : runtimeTemplate ? '生成测试报告图' : '整页视觉未启用' }}</button>
      </div>
    </header>

    <section class="visual-test-layout">
      <aside class="asset-panel">
        <div class="panel-heading"><span>用户素材</span><small>{{ assets.length }}项</small></div>
        <p class="panel-note">素材只写入测试草稿，正式报告不会读取。</p>
        <button v-for="asset in assets" :key="asset.id" type="button" class="asset-item" :class="{ active: selectedAssetId === asset.id }" @click="selectedAssetId = asset.id">
          <span class="asset-thumb" :style="assetStyle(asset.src)"></span>
          <span><strong>{{ asset.label }}</strong><small>{{ asset.type }}</small></span>
        </button>
      </aside>

      <section class="stage-panel">
        <div class="stage-toolbar">
          <div><strong>手机单页效果</strong><span>模板画布：1080 × 2160 · 1:2</span></div>
          <div class="stage-actions"><button type="button" :disabled="pageIndex === 0" @click="pageIndex--">上一页</button><span>{{ pageIndex + 1 }} / {{ pages.length }}</span><button type="button" :disabled="pageIndex === pages.length - 1" @click="pageIndex++">下一页</button></div>
        </div>
        <div class="phone-stage">
          <article class="single-report-page" :class="{ 'is-generated': currentPage.generatedVisual }" :style="pageStyle(currentPage)">
            <div v-if="!currentPage.generatedVisual" class="paper-grid"></div>
            <div v-if="currentPage.generatedVisual" class="generated-page-badge">AI整页视觉</div>
            <span class="page-label">{{ currentPage.eyebrow }}</span>
            <span class="page-number">{{ pageIndex + 1 }} / {{ pages.length }}</span>
            <h2>{{ currentPage.title }}</h2>
            <p class="narration">{{ currentPage.text }}</p>
            <div class="report-note">{{ currentPage.highlight }}</div>
            <div class="student-mark">林同学 · 高级版</div>
          </article>
        </div>
        <div class="slide-dots" aria-label="报告页码"><button v-for="(page, index) in pages" :key="page.id" type="button" :class="{ active: pageIndex === index }" :aria-label="`第${index + 1}页`" @click="pageIndex = index"></button></div>
      </section>

      <aside class="recipe-panel">
        <div class="panel-heading"><span>本页生成配方</span><small>不会覆盖正式报告</small></div>
        <div class="template-reference-panel">
          <span>后台整页参考图</span>
          <div v-if="currentPageReferenceImages.length" class="template-reference-images"><img v-for="image in currentPageReferenceImages" :key="image" :src="image" alt="后台整页视觉参考" /></div>
          <small v-else>当前页面尚未配置参考图，将按后台颜色和提示词生成。</small>
        </div>
        <label>当前页面<select v-model.number="pageIndex"><option v-for="(page, index) in pages" :key="page.id" :value="index">{{ index + 1 }} · {{ page.title }}</option></select></label>
        <label>替换本页素材<select v-model="pageAssetDraft"><option value="">保持当前素材</option><option v-for="asset in assets" :key="asset.id" :value="asset.id">{{ asset.label }}</option></select></label>
        <button type="button" class="replace-button" :disabled="!runtimeTemplate || !pageAssetDraft || currentPage.allowRegenerate === false" @click="replaceCurrentPage">{{ !runtimeTemplate ? '整页视觉未启用' : currentPage.allowRegenerate === false ? '后台已关闭单页重新生成' : '替换并重新生成本页' }}</button>
        <div class="recipe-status"><span>页面状态</span><strong :class="currentPage.status">{{ pageStatusLabel(currentPage) }}</strong><small v-if="currentPage.error" class="recipe-error">{{ currentPage.error }}</small><small v-else>当前版本：{{ currentPage.revision }}</small></div>
        <div class="recipe-list"><span>保留信息</span><small>模板参考图</small><small>页面文字和页码</small><small>未替换的用户素材</small><small>本页生成随机种子</small></div>
      </aside>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { generateArtwork } from '../services/aiGateway'
import { apiClient } from '../services/apiClient'

const projectStore = useProjectStore()
const project = projectStore.currentProject || projectStore.draft || {}
const pageIndex = ref(0)
const selectedAssetId = ref('final')
const pageAssetDraft = ref('')
const generating = ref(false)
const progress = ref('准备生成…')
const seed = ref(Date.now())
const runtimeTemplate = ref(null)

function mediaUrl(item) {
  if (!item) return ''
  if (typeof item === 'string') return item
  return item.preview || item.cover || item.thumbnail || item.imageUrl || item.previewUrl || item.url || item.src || ''
}
const assets = computed(() => [
  { id: 'final', label: '最终作品', type: 'finalWork', src: mediaUrl(project.versions?.find(item => item.id === project.finalVersionId) || project.versions?.[0]) },
  { id: 'sketch', label: '第一版草图', type: 'sketch', src: mediaUrl(project.sketchOriginal) },
  { id: 'ai', label: 'AI方案图', type: 'aiVariant', src: mediaUrl(project.versions?.[1]) },
  { id: 'scene', label: '环境参考图', type: 'scene', src: mediaUrl(project.referenceImages?.[0]) },
].filter(item => item.src))
const pages = reactive([
  { id: 'cover', title: '这是我的设计', eyebrow: '产品创意设计', text: '大家好，我是林同学。这是我从生活观察、草图和反复尝试中完成的设计。', highlight: '这是我一步一步完成的设计。', status: 'pending', revision: 1, src: '', generatedVisual: '' },
  { id: 'inspiration', title: '我的灵感从哪里来', eyebrow: '生活观察', text: '我把生活里的发现记录下来，再想一想它们怎样影响我的设计。', highlight: '我把观察变成了设计的起点。', status: 'pending', revision: 1, src: '', generatedVisual: '' },
  { id: 'problem', title: '我想解决的问题', eyebrow: '设计目标', text: '我希望自己的设计可以帮助真正使用它的人，让生活变得更轻松。', highlight: '我先想清楚要帮助谁。', status: 'pending', revision: 1, src: '', generatedVisual: '' },
  { id: 'sketch', title: '我画下第一版想法', eyebrow: '草图与修改', text: '我先用草图记录结构，再把不满意的地方圈出来，一点一点调整。', highlight: '第一版不完美，但让我知道下一步怎么改。', status: 'pending', revision: 1, src: '', generatedVisual: '' },
  { id: 'ai', title: '我和AI一起试方案', eyebrow: '方案比较', text: '我把自己的想法整理成提示词，再比较不同方案，最后由我做出选择。', highlight: 'AI帮我尝试，我自己做选择。', status: 'pending', revision: 1, src: '', generatedVisual: '' },
  { id: 'model', title: '我把它做成立体的', eyebrow: '3D与结构', text: '变成立体以后，我从不同角度观察结构，也发现了新的修改方向。', highlight: '从平面到立体，我看见了新的问题。', status: 'pending', revision: 1, src: '', generatedVisual: '' },
  { id: 'scene', title: '我想象它真正被使用', eyebrow: '环境搭配', text: '我希望它能进入真实生活，让使用它的人觉得轻松、安心又方便。', highlight: '我希望它不只好看，也真的好用。', status: 'pending', revision: 1, src: '', generatedVisual: '' },
  { id: 'reflection', title: '这是我的收获', eyebrow: '我的创作收获', text: '我把一个最初的想法一步一步画出来、改出来，也讲清楚了它为什么是这个样子。', highlight: '下一次，我还想继续把它做得更好。', status: 'pending', revision: 1, src: '', generatedVisual: '' },
])
const currentPage = computed(() => pages[pageIndex.value])
const currentPageReferenceImages = computed(() => runtimeTemplate.value?.pageDesigns?.[currentPage.value?.id]?.referenceImages || [])
const studentTextContext = computed(() => [
  project.title,
  project.ideaSummary,
  project.prompt,
  project.courseIdeaText,
  project.courseIdeaVoiceText,
  project.reflection,
].filter(Boolean).join('；').slice(0, 1800))
function assetStyle(src) { return src ? { backgroundImage: `url("${src}")` } : { background: 'linear-gradient(135deg,#eaf3ff,#f9fbff)' } }
function pageStatusLabel(page) {
  if (page.status === 'ready' && page.generatedVisual) return '已生成'
  if (page.status === 'generating') return '生成中'
  if (page.status === 'failed') return '生成失败'
  return '待生成'
}
function normalizeGeneratedVisual(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.startsWith('url(')) {
    const match = raw.match(/^url\((["']?)(.*?)\1\)/)
    return match?.[2] || raw
  }
  return raw
}
function pageStyle(page) {
  const style = { '--page-accent': page.id === 'ai' ? '#735cff' : (runtimeTemplate.value?.theme?.primary || '#1456c8') }
  if (page.generatedVisual) {
    style.backgroundImage = `linear-gradient(180deg, rgba(7, 18, 42, .05), rgba(7, 18, 42, .3)), url("${normalizeGeneratedVisual(page.generatedVisual)}")`
    style.backgroundSize = 'cover'
    style.backgroundPosition = 'center'
  }
  return style
}
function buildPagePrompt(page) {
  const design = runtimeTemplate.value?.pageDesigns?.[page.id] || {}
  const allowedSources = Array.isArray(design.allowedSourceTypes) && design.allowedSourceTypes.length ? design.allowedSourceTypes.join('、') : '用户项目中的真实素材'
  return [
    `生成一张完整的手机H5报告单页视觉图，画布比例1:2，主题是“${page.title}”。`,
    `这是用户林同学的产品设计故事，不是模板图框拼贴，也不是单独生成一张插图。`,
    `整张画面需要包含完整构图、背景、装饰、用户作品展示区域和产品设计叙事氛围。`,
    `页面方向：${page.text} 重点表达：${page.highlight}`,
    studentTextContext.value ? `用户项目中整理出的真实文字：${studentTextContext.value}。只能基于这些内容表达，不得虚构经历。` : '用户文字信息较少，不得虚构创作经历。',
    `后台模板版式：${design.variant || 'cover-student-product-a'}；页面标题：${design.title || page.title}；背景风格：${design.backgroundStyle || 'blueprint-collage'}；用户角色动作：${design.characterPose || 'presenting'}。`,
    `本页允许使用的用户素材类型：${allowedSources}；素材缺失时：${design.fallbackVariant || '友好空状态'}。`,
    design.aiPrompt ? `后台管理员补充要求：${design.aiPrompt}。` : '',
    design.referenceImages?.length ? `已提供${design.referenceImages.length}张后台整页参考图，参考强度${Math.round(Number(design.referenceStrength || 0.7) * 100)}%。参考图只用于学习构图、色彩、背景和内容层级，绝不能复制其中的商品、人物、文字或品牌。` : '',
    `模板主色：${runtimeTemplate.value?.theme?.primary || '#1559d6'}，辅助色：${runtimeTemplate.value?.theme?.secondary || '#0bd0e8'}，强调色：${runtimeTemplate.value?.theme?.accent || '#f59a23'}。`,
    '参考蓝白工业设计、蓝图纸张、手绘线条、橙色手写标记和真实用户创作过程；只使用提供的用户素材，不要添加无关商品或固定汽车图片。',
    '不要生成任何可读文字、字母或乱码，标题和正文由系统后置排版。',
  ].join(' ')
}
function applyRuntimePageConfig(template) {
  if (!template) return
  const order = Array.isArray(template.visualGeneration?.storyOrder) ? template.visualGeneration.storyOrder : []
  const pageMap = new Map(pages.map((page) => [page.id, page]))
  const orderedIds = [...order, ...pages.map((page) => page.id)].filter((id, index, list) => list.indexOf(id) === index)
  const configured = orderedIds.map((id) => pageMap.get(id)).filter(Boolean).filter((page) => template.pageDesigns?.[page.id]?.enabled !== false)
  configured.forEach((page) => {
    const design = template.pageDesigns?.[page.id] || {}
    page.title = design.title || page.title
    page.allowRegenerate = design.allowRegenerate !== false
  })
  if (configured.length) pages.splice(0, pages.length, ...configured)
  pageIndex.value = Math.min(pageIndex.value, Math.max(0, pages.length - 1))
}
function allowedAssetsForPage(page) {
  const configured = runtimeTemplate.value?.pageDesigns?.[page.id]?.allowedSourceTypes
  if (!Array.isArray(configured) || !configured.length) return assets.value
  const aliases = { aiVariant: 'aiImage' }
  return assets.value.filter((asset) => configured.includes(aliases[asset.type] || asset.type))
}
async function loadRuntimeTemplate() {
  try {
    const response = await apiClient.get('/h5-report/runtime-config', { params: { difficulty: 'pro' } })
    const templates = response.data?.templates || []
    const defaultId = response.data?.defaultTemplateId
    runtimeTemplate.value = templates.find((item) => item.visualGeneration?.enabled && item.visualGeneration?.mode === 'full-page') || null
    applyRuntimePageConfig(runtimeTemplate.value)
  } catch {
    runtimeTemplate.value = null
  }
}
onMounted(loadRuntimeTemplate)
async function generatePage(page) {
  if (!runtimeTemplate.value) {
    page.status = 'failed'
    page.error = '后台尚未发布可用的整页视觉模板'
    throw new Error(page.error)
  }
  page.status = 'generating'
  try {
    const templateReferences = runtimeTemplate.value?.pageDesigns?.[page.id]?.referenceImages || []
    const response = await generateArtwork({ projectId: project.id, prompt: buildPagePrompt(page), difficulty: 'pro', style: 'visual-product-story-full-page', ratio: '1:2', count: 1, quality: 'standard', images: allowedAssetsForPage(page).map(item => item.src).filter(Boolean), templateReferenceImages: templateReferences })
    const result = response?.results?.[0]
    const generated = normalizeGeneratedVisual(result?.imageUrl || result?.url || result?.background || '')
    if (!generated) throw new Error('图像模型没有返回可展示的图片')
    page.generatedVisual = generated
    page.status = 'ready'
    page.revision += 1
  } catch (error) {
    page.status = 'failed'
    page.error = error?.data?.details?.message || error?.data?.message || error?.message || '生成失败'
    throw error
  }
}
async function replaceCurrentPage() {
  const asset = assets.value.find(item => item.id === pageAssetDraft.value)
  if (!asset) return
  currentPage.value.src = asset.src
  pageAssetDraft.value = ''
  try { await generatePage(currentPage.value); seed.value += 1 } catch { /* 页面保留失败状态，旧版本数据仍在草稿中 */ }
}
async function generateAll() {
  generating.value = true
  let completed = 0
  try {
    for (const page of pages) { progress.value = `生成页面 ${completed + 1} / ${pages.length}…`; await generatePage(page); completed += 1 }
  } catch (error) { progress.value = `第${completed + 1}页失败：${error?.message || '请重试'}` }
  finally { generating.value = false; seed.value += 1 }
}
function resetDraft() { pages.forEach(page => { page.status = 'pending'; page.revision = 1; page.src = ''; page.generatedVisual = ''; page.error = '' }); pageIndex.value = 0; pageAssetDraft.value = '' }
</script>

<style scoped>
:global(*){box-sizing:border-box}.runtime-template{display:block;margin-top:8px;color:#2369d2;font-size:12px;font-weight:800}
.template-reference-panel{display:grid;gap:8px;margin-top:16px;padding:12px;border:1px solid #d8e5f4;border-radius:11px;background:#f7fbff;color:#526b8e;font-size:12px;font-weight:800}.template-reference-panel small{color:#8293aa;font-weight:600;line-height:1.5}.template-reference-images{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.template-reference-images img{width:100%;aspect-ratio:1/2;object-fit:cover;border:1px solid #cfdded;border-radius:6px;background:#eaf2fb}
:global(*){box-sizing:border-box}.visual-test-page{min-height:100vh;padding:28px 32px;background:#eef4fb;color:#142d55}.visual-test-header{display:flex;justify-content:space-between;gap:28px;align-items:flex-start;margin:0 auto 24px;max-width:1500px}.eyebrow{display:block;color:#2369d2;font-size:12px;font-weight:800;letter-spacing:.08em}.visual-test-header h1{margin:8px 0 5px;font-size:28px}.visual-test-header p{margin:0;color:#6d809c}.header-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.header-actions button,.stage-actions button,.replace-button{border:1px solid #cbdcf2;border-radius:10px;padding:10px 14px;background:#fff;color:#31527e;font-weight:700}.header-actions .primary,.replace-button{border-color:#1669e8;background:#1669e8;color:#fff}.header-actions button:disabled,.stage-actions button:disabled,.replace-button:disabled{opacity:.45;cursor:not-allowed}.test-badge{padding:8px 11px;border-radius:999px;background:#fff3df;color:#d97706;font-size:12px;font-weight:800}.visual-test-layout{display:grid;grid-template-columns:260px minmax(500px,1fr) 300px;gap:20px;max-width:1500px;margin:auto;min-height:720px}.asset-panel,.stage-panel,.recipe-panel{border:1px solid #d7e3f3;border-radius:18px;background:rgba(255,255,255,.9);box-shadow:0 12px 30px rgba(32,77,132,.08)}.asset-panel,.recipe-panel{padding:18px}.panel-heading{display:flex;justify-content:space-between;align-items:center;font-weight:900}.panel-heading small{color:#8b9bb2;font-size:11px}.panel-note{color:#7b8da6;font-size:12px;line-height:1.6}.asset-item{width:100%;display:flex;align-items:center;gap:10px;border:1px solid #e0e9f5;border-radius:12px;background:#fff;padding:9px;margin-top:9px;text-align:left;color:#29466d}.asset-item.active{border-color:#1677ff;box-shadow:0 0 0 3px rgba(22,119,255,.12)}.asset-thumb{width:54px;height:48px;border-radius:8px;background-position:center;background-size:cover;flex:none}.asset-item strong,.asset-item small{display:block}.asset-item small{margin-top:4px;color:#899ab0;font-size:11px}.stage-panel{display:flex;flex-direction:column;min-width:0}.stage-toolbar{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:17px 20px;border-bottom:1px solid #e6eef8}.stage-toolbar strong,.stage-toolbar span{display:block}.stage-toolbar span{margin-top:5px;color:#8191a8;font-size:11px}.stage-actions{display:flex;align-items:center;gap:8px}.stage-actions span{margin:0;color:#225dc1;font-weight:800}.phone-stage{display:grid;place-items:center;flex:1;min-height:620px;padding:24px;background:radial-gradient(circle at 50% 20%,#fff 0,#edf5ff 58%)}.single-report-page{position:relative;overflow:hidden;width:min(390px,78%);aspect-ratio:1/2;border:7px solid #fff;border-radius:28px;background:#f5f9ff;box-shadow:0 18px 40px rgba(19,63,126,.2);padding:28px 22px;color:#173f7b}.paper-grid{position:absolute;inset:0;z-index:0;background-image:linear-gradient(rgba(25,91,181,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(25,91,181,.07) 1px,transparent 1px);background-size:20px 20px;opacity:.55}.single-report-page>*:not(.paper-grid){position:relative;z-index:1}.page-label{display:inline-block;padding:7px 10px;background:var(--page-accent);color:#fff;font-size:11px;font-weight:900;box-shadow:3px 3px 0 #f49a22;transform:rotate(-2deg)}.page-number{position:absolute!important;right:22px;top:30px;color:#587aa8;font-size:11px;font-weight:900}.single-report-page h2{margin:28px 0 10px;color:var(--page-accent);font-size:30px;line-height:1.2}.narration{margin:0;color:#3e5d86;font-size:13px;line-height:1.7}.report-visual{height:43%;margin-top:22px;border:4px solid #fff;border-radius:16px;background-position:center;background-size:cover;box-shadow:0 12px 26px rgba(26,75,143,.2);display:grid;place-items:center;color:#7388a6;text-align:center;font-size:12px}.report-note{margin-top:15px;padding:13px;background:#fffdf1;border:1px solid #e9dfbc;color:#eb7b19;font-size:12px;line-height:1.6;transform:rotate(-1deg)}.student-mark{position:absolute!important;left:22px;bottom:20px;padding:8px 12px;background:#fff;color:var(--page-accent);font-size:12px;font-weight:900;box-shadow:0 5px 12px rgba(26,75,143,.12)}.slide-dots{display:flex;justify-content:center;gap:7px;padding:14px}.slide-dots button{width:9px;height:9px;border:0;border-radius:50%;background:#bfd2ee}.slide-dots button.active{background:#1b6fe3;transform:scale(1.35)}.recipe-panel label{display:block;margin-top:18px;color:#607693;font-size:12px;font-weight:800}.recipe-panel select{width:100%;margin-top:7px;border:1px solid #d8e4f2;border-radius:9px;padding:10px;background:#fff;color:#274971}.replace-button{width:100%;margin-top:16px}.recipe-status{display:grid;gap:7px;margin-top:25px;padding:14px;border-radius:12px;background:#f6f9fd}.recipe-status span,.recipe-status small{color:#8091a8;font-size:11px}.recipe-status strong.ready{color:#168557}.recipe-status strong.generating{color:#d97706}.recipe-list{display:grid;gap:9px;margin-top:20px;color:#526b8e}.recipe-list span{font-weight:900}.recipe-list small{padding-left:15px;position:relative}.recipe-list small:before{content:'✓';position:absolute;left:0;color:#1b75dc}@media(max-width:1050px){.visual-test-layout{grid-template-columns:220px minmax(440px,1fr);}.recipe-panel{grid-column:1/-1}.recipe-panel{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.recipe-panel .panel-heading,.recipe-panel .recipe-status,.recipe-panel .recipe-list{grid-column:1/-1}}@media(max-width:760px){.visual-test-page{padding:16px}.visual-test-header{display:block}.header-actions{margin-top:14px}.visual-test-layout{display:block}.asset-panel,.recipe-panel{margin-top:14px}.stage-panel{margin-top:14px}.phone-stage{min-height:520px}.single-report-page{width:min(390px,82vw)}}
.single-report-page.is-generated{color:#fff;background-color:#162b50}.single-report-page.is-generated .page-label{background:rgba(11,32,68,.82);box-shadow:3px 3px 0 #f49a22}.single-report-page.is-generated .page-number{color:rgba(255,255,255,.84)}.single-report-page.is-generated h2{color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.42)}.single-report-page.is-generated .narration{color:rgba(255,255,255,.94);text-shadow:0 1px 8px rgba(0,0,0,.42)}.single-report-page.is-generated .report-note{background:rgba(255,250,226,.94);color:#a95511}.generated-page-badge{position:absolute!important;right:18px;bottom:64px;z-index:2!important;padding:6px 9px;border:1px solid rgba(255,255,255,.42);border-radius:999px;background:rgba(10,31,68,.6);color:#fff;font-size:10px;font-weight:800;letter-spacing:.04em}.recipe-status strong.failed{color:#c2410c}.recipe-status .recipe-error{color:#c2410c;line-height:1.5}
</style>
