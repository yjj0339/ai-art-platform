<template>
  <div class="prompt-library page-shell">
    <header class="library-header">
      <div class="header-copy">
        <p class="eyebrow">创作灵感中心</p>
        <h1>提示词库</h1>
        <p class="subtitle">按创作类型和复杂度，快速找到适合你的提示词。</p>
      </div>
      <el-input v-model="keyword" class="search-input" clearable placeholder="搜索标题、内容或标签">
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
    </header>

    <section class="filters" aria-label="提示词筛选">
      <div class="filter-group">
        <span class="filter-label">创作类型</span>
        <button v-for="item in typeOptions" :key="item.value" type="button" :class="['filter-chip', { active: activeType === item.value }]" @click="activeType = item.value">
          <el-icon v-if="item.icon"><component :is="item.icon" /></el-icon>{{ item.label }}
        </button>
      </div>
      <div class="filter-group">
        <span class="filter-label">提示词难度</span>
        <button v-for="item in levelOptions" :key="item.value" type="button" :class="['filter-chip', { active: activeLevel === item.value }]" @click="activeLevel = item.value">{{ item.label }}</button>
      </div>
    </section>

    <div class="result-bar">
      <span>共找到 <strong>{{ filteredPrompts.length }}</strong> 条提示词</span>
      <span v-if="keyword" class="result-keyword">正在搜索“{{ keyword }}”</span>
    </div>

    <section v-if="filteredPrompts.length" class="prompt-grid">
      <article v-for="item in filteredPrompts" :key="item.id" class="prompt-card">
        <div class="card-meta">
          <span class="type-badge">{{ item.typeLabel }}</span>
          <span :class="['level-badge', item.level]">{{ item.levelLabel }}</span>
        </div>
        <h2>{{ item.title }}</h2>
        <p class="card-summary">{{ item.summary }}</p>
        <pre class="prompt-text">{{ item.prompt }}</pre>
        <div class="tag-list"><span v-for="tag in item.tags" :key="tag">#{{ tag }}</span></div>
        <p class="card-tip"><el-icon><MagicStick /></el-icon>{{ item.tips }}</p>
        <div class="card-actions">
          <el-button type="primary" plain @click="copyPrompt(item.prompt)"><el-icon><CopyDocument /></el-icon>复制提示词</el-button>
          <el-button text @click="goCreate(item)">前往创作 <el-icon><ArrowLeft class="forward-icon" /></el-icon></el-button>
        </div>
      </article>
    </section>
    <el-empty v-else description="没有找到匹配的提示词，换个关键词试试吧" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, CopyDocument, EditPen, MagicStick, Picture, Search, VideoPlay } from '@element-plus/icons-vue'

const router = useRouter()
const keyword = ref('')
const activeType = ref('all')
const activeLevel = ref('all')

const typeOptions = [
  { value: 'all', label: '全部', icon: EditPen },
  { value: 'image', label: '图像提示词', icon: Picture },
  { value: 'video', label: '视频提示词', icon: VideoPlay },
  { value: 'canvas', label: '无限画布', icon: EditPen },
]
const levelOptions = [
  { value: 'all', label: '全部难度' },
  { value: 'basic', label: '基础提示词' },
  { value: 'advanced', label: '高级复杂提示词' },
]
const prompts = [
  { id: 1, type: 'image', typeLabel: '图像', level: 'basic', levelLabel: '基础提示词', title: '雨衣小熊的森林散步', summary: '适合第一次练习主体、动作和场景描述。', prompt: '一只戴着黄色雨衣的小熊，在雨后的森林小路上散步，水洼倒映着柔和的晨光，温暖童话插画风格。', tags: ['主体描述', '童话', '插画'], tips: '先说清楚“谁、在哪里、做什么”，画面会更稳定。', studioPath: '/student/paint' },
  { id: 2, type: 'image', typeLabel: '图像', level: 'advanced', levelLabel: '高级复杂提示词', title: '未来城市的光影叙事', summary: '通过镜头、材质与氛围，构建完整的电影感画面。', prompt: '电影概念设计，一位穿银色风衣的少年站在雨夜未来城市天桥，霓虹倒影、体积雾、湿润金属材质，低机位广角，冷暖对比光，细节丰富，8k。', tags: ['镜头语言', '材质', '电影感'], tips: '复杂提示词建议按“主体—环境—镜头—光线—质感”顺序组织。', studioPath: '/student/paint' },
  { id: 3, type: 'video', typeLabel: '视频', level: 'basic', levelLabel: '基础提示词', title: '纸飞机飞过操场', summary: '适合练习一个主体和一个连续动作。', prompt: '一只白色纸飞机从教室窗边飞出，掠过阳光下的校园操场，镜头平稳跟随，时长 5 秒，清新明亮。', tags: ['动作', '运镜', '短视频'], tips: '视频提示词要补充动作方向、镜头运动和时长。', studioPath: '/student/video' },
  { id: 4, type: 'video', typeLabel: '视频', level: 'advanced', levelLabel: '高级复杂提示词', title: '四季变换的城市街角', summary: '用时间线和镜头调度，生成有节奏的连续片段。', prompt: '固定机位中景，城市街角咖啡店门口。一位红伞行人从左向右经过；镜头随季节自然变化：春日樱花、夏日骤雨、秋叶飘落、冬雪覆盖，光线连续，12 秒电影转场。', tags: ['时间线', '固定机位', '转场'], tips: '连续视频可用分号拆分时间段，减少模型遗漏关键变化。', studioPath: '/student/video' },
  { id: 5, type: 'canvas', typeLabel: '无限画布', level: 'basic', levelLabel: '基础提示词', title: '我的灵感地图', summary: '帮助你把零散想法整理成视觉化创作地图。', prompt: '请围绕“我的梦想城市”生成一张灵感地图，包含建筑、交通、自然、人物四个分支，每个分支给出 3 个关键词，布局清晰、色彩活泼。', tags: ['发散思考', '结构化', '灵感'], tips: '先用基础提示词搭框架，再逐步补充细节。', studioPath: '/student/canvas' },
  { id: 6, type: 'canvas', typeLabel: '无限画布', level: 'advanced', levelLabel: '高级复杂提示词', title: '艺术项目策划板', summary: '适合把研究、草图和执行计划组织成完整项目。', prompt: '创建“海洋环保艺术展”策划画布：左侧放研究资料与数据，中间放 3 个作品概念草图，右侧放材料清单、制作步骤和展览动线；使用颜色区分研究、创作、执行三类内容。', tags: ['项目策划', '信息架构', '展览'], tips: '明确画布分区和信息层级，便于后续继续编辑。', studioPath: '/student/canvas' },
]

const filteredPrompts = computed(() => prompts.filter((item) => {
  const matchesType = activeType.value === 'all' || item.type === activeType.value
  const matchesLevel = activeLevel.value === 'all' || item.level === activeLevel.value
  const query = keyword.value.trim().toLowerCase()
  const matchesKeyword = !query || [item.title, item.summary, item.prompt, ...item.tags].join(' ').toLowerCase().includes(query)
  return matchesType && matchesLevel && matchesKeyword
}))

async function copyPrompt(text) {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
    else {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }
    ElMessage.success('提示词已复制')
  } catch { ElMessage.error('复制失败，请手动选择文本复制') }
}

function goCreate(item) { router.push({ path: item.studioPath, query: { prompt: item.prompt } }) }
</script>

<style scoped lang="scss">
.prompt-library { min-height: calc(100vh - var(--app-top, 0px)); padding: 36px clamp(20px, 5vw, 72px) 64px; background: #f7f8fc; color: #1f2937; }
.library-header { max-width: 1200px; margin: 0 auto 30px; display: flex; align-items: flex-end; justify-content: space-between; gap: 28px; }
.header-copy { flex: 1; }
.back-button { border: 0; background: transparent; color: #64748b; padding: 0; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 14px; }
.eyebrow { margin: 28px 0 8px; color: #6d5dfc; font-size: 13px; font-weight: 700; letter-spacing: .12em; }
h1 { margin: 0; font-size: clamp(30px, 4vw, 46px); letter-spacing: -.04em; }
.subtitle { margin: 10px 0 0; color: #718096; font-size: 16px; }
.search-input { max-width: 310px; }
.filters, .result-bar, .prompt-grid { max-width: 1200px; margin-left: auto; margin-right: auto; }
.filters { display: flex; flex-wrap: wrap; gap: 18px 42px; padding: 18px 20px; background: #fff; border: 1px solid #edf0f7; border-radius: 18px; }
.filter-group { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.filter-label { color: #94a3b8; font-size: 13px; margin-right: 4px; }
.filter-chip { border: 1px solid #e5e7ef; border-radius: 999px; color: #64748b; background: #fff; padding: 8px 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; font-size: 13px; transition: .2s; }
.filter-chip:hover, .filter-chip.active { color: #fff; border-color: #6d5dfc; background: #6d5dfc; }
.result-bar { display: flex; justify-content: space-between; padding: 26px 2px 14px; color: #94a3b8; font-size: 13px; }
.result-bar strong { color: #334155; }
.result-keyword { color: #6d5dfc; }
.prompt-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.prompt-card { padding: 22px; background: #fff; border: 1px solid #edf0f7; border-radius: 20px; box-shadow: 0 8px 24px rgba(46, 52, 83, .04); }
.card-meta { display: flex; justify-content: space-between; align-items: center; }
.type-badge, .level-badge { border-radius: 7px; padding: 5px 9px; font-size: 12px; font-weight: 700; }
.type-badge { color: #635bdb; background: #f0efff; }
.level-badge.basic { color: #16805f; background: #e7f8f0; }
.level-badge.advanced { color: #b45309; background: #fff2d9; }
.prompt-card h2 { margin: 17px 0 8px; font-size: 19px; }
.card-summary { min-height: 42px; margin: 0 0 14px; color: #718096; font-size: 13px; line-height: 1.7; }
.prompt-text { min-height: 102px; margin: 0; padding: 14px; border-radius: 12px; background: #f8f8fc; color: #3f4655; white-space: pre-wrap; word-break: break-word; font: inherit; font-size: 13px; line-height: 1.75; }
.tag-list { display: flex; flex-wrap: wrap; gap: 7px; margin: 14px 0; }
.tag-list span { color: #8b93a5; font-size: 12px; }
.card-tip { display: flex; gap: 5px; align-items: flex-start; margin: 0 0 18px; color: #8b93a5; font-size: 12px; line-height: 1.6; }
.card-actions { display: flex; align-items: center; justify-content: space-between; }
.forward-icon { transform: rotate(180deg); }
@media (max-width: 720px) { .prompt-library { padding: 24px 16px 42px; } .library-header { display: block; } .search-input { max-width: none; margin-top: 20px; } .prompt-grid { grid-template-columns: 1fr; } .filters { padding: 15px; } .result-bar { padding-top: 20px; } }
</style>
