<template>
  <article class="product-story-image-page" :class="`story-${page.storyStep || page.type || 'cover'}`" :style="pageStyle">
    <div class="paper-texture"></div>
    <header class="story-page-header"><span>AI创意美术</span><strong>{{ studentName }} · 高级版</strong></header>
    <div class="story-page-count">{{ pageIndex + 1 }} / {{ pageCount }}</div>
    <section class="story-content">
      <p class="story-kicker">{{ page.eyebrow || '我的产品设计故事' }}</p>
      <h1>{{ page.title }}</h1>
      <p class="story-narration">{{ narration }}</p>

      <template v-if="isCover">
        <figure class="hero-frame cover-hero"><img v-if="hero" :src="hero" alt="用户作品" /><span v-else>等待用户作品</span></figure>
        <figure v-if="images[1]" class="mini-frame cover-detail"><img :src="images[1]" alt="创作局部" /></figure>
        <div class="student-guide pose-presenting">我</div>
        <p class="story-highlight">{{ highlight }}</p>
      </template>

      <template v-else-if="isInspiration">
        <div class="inspiration-board">
          <figure v-for="(image, index) in displayImages(3)" :key="`${image}-${index}`" :class="`inspiration-image i-${index}`"><img :src="image" alt="灵感素材" /></figure>
          <span class="note note-a">我看到了什么</span><span class="note note-b">它让我想到</span>
        </div>
        <div class="student-guide pose-thinking">我</div><p class="story-highlight">{{ highlight }}</p>
      </template>

      <template v-else-if="isProblem">
        <figure v-if="hero" class="hero-frame problem-scene"><img :src="hero" alt="问题场景" /></figure>
        <div class="problem-grid"><article v-for="(card, index) in problemCards" :key="index"><b>{{ index + 1 }}</b><span>{{ card }}</span></article></div>
        <div class="student-guide pose-pointing">我</div>
      </template>

      <template v-else-if="isSketch">
        <div class="blueprint-grid"></div>
        <figure class="hero-frame sketch-main"><img v-if="images[0]" :src="images[0]" alt="原始手稿" /><span v-else>还没有草图</span></figure>
        <figure v-if="images[1]" class="mini-frame sketch-detail"><img :src="images[1]" alt="修改草图" /></figure>
        <i class="handwritten mark-one">第一次尝试</i><i class="handwritten mark-two">这里再改一改</i>
        <div class="student-guide pose-drawing">我</div><p class="story-highlight">{{ highlight }}</p>
      </template>

      <template v-else-if="isAi">
        <div class="ai-compare">
          <figure v-for="(image, index) in displayImages(3)" :key="`${image}-${index}`" :class="{ chosen: index === 0 }"><img :src="image" alt="AI方案" /><em>{{ ['方案 A', '方案 B', '方案 C'][index] }}</em><b v-if="index === 0">我选择它</b></figure>
        </div>
        <div class="decision-row"><span>我保留了想法</span><span>我放弃了多余细节</span></div><div class="student-guide pose-comparing">我</div>
      </template>

      <template v-else-if="isModel">
        <div class="model-orbit"></div>
        <figure class="hero-frame model-hero"><img v-if="hero" :src="hero" alt="3D作品" /><span v-else>结构与制作思考</span></figure>
        <div class="model-tags"><span>正视图</span><span>材质</span><span>结构</span></div><div class="student-guide pose-modeling">我</div>
      </template>

      <template v-else-if="isScene">
        <figure class="scene-hero"><img v-if="hero" :src="hero" alt="使用场景" /><span v-else>我想象它被使用的样子</span></figure>
        <aside class="scene-copy"><strong>我想象的使用时刻</strong><p>{{ highlight }}</p></aside><div class="student-guide pose-explaining">我</div>
      </template>

      <template v-else>
        <figure class="hero-frame reflection-hero"><img v-if="hero" :src="hero" alt="最终作品" /><span v-else>我的最终作品</span></figure>
        <div class="reflection-cards"><article v-for="(card, index) in reflectionCards" :key="index"><b>{{ ['最满意', '遇到困难', '下次改进'][index] }}</b><span>{{ card }}</span></article></div>
        <div class="student-guide pose-celebrating">我</div>
      </template>
    </section>
    <footer class="story-page-footer"><span>‹</span><i></i><span>›</span></footer>
  </article>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  page: { type: Object, required: true },
  pageIndex: { type: Number, default: 0 },
  pageCount: { type: Number, default: 8 },
  studentName: { type: String, default: '林同学' },
  backgroundUrl: { type: String, default: '' },
})

const step = computed(() => props.page.storyStep || props.page.type || 'cover')
const images = computed(() => Array.isArray(props.page.images) ? props.page.images.filter(Boolean) : [props.page.src].filter(Boolean))
const hero = computed(() => props.page?.slots?.hero?.src || props.page.src || images.value[0] || '')
const narration = computed(() => String(props.page?.narration?.polished || props.page.text || '').slice(0, 150))
const highlight = computed(() => String(props.page?.narration?.highlight || props.page.highlight || '这是我一步一步完成的设计。').slice(0, 36))
const isCover = computed(() => step.value === 'cover')
const isInspiration = computed(() => step.value === 'inspiration')
const isProblem = computed(() => step.value === 'problem')
const isSketch = computed(() => step.value === 'sketch')
const isAi = computed(() => step.value === 'ai')
const isModel = computed(() => step.value === 'model')
const isScene = computed(() => step.value === 'scene')
const problemCards = computed(() => props.page.cards?.length ? props.page.cards : ['我观察到的困难', '我想帮助的人', '我的设计目标'])
const reflectionCards = computed(() => props.page.cards?.length ? props.page.cards : ['我最满意的部分', '我遇到的困难', '下次我想继续改进'])
const pageStyle = computed(() => props.backgroundUrl ? { '--generated-background': `url("${props.backgroundUrl}")` } : {})
function displayImages(limit) {
  const source = images.value.length ? images.value : (hero.value ? [hero.value] : [])
  return Array.from({ length: Math.min(limit, Math.max(1, source.length)) }, (_, index) => source[index] || source[0]).filter(Boolean)
}
</script>

<style scoped>
.product-story-image-page{--ink:#123f7e;--blue:#1165db;--cyan:#35d6ed;--orange:#ff9d38;position:relative;width:390px;height:844px;box-sizing:border-box;overflow:hidden;background:linear-gradient(150deg,#f5fbff 0%,#e2f3ff 45%,#f6f7ff 100%);color:var(--ink);font-family:"Microsoft YaHei",sans-serif}.product-story-image-page:before{content:"";position:absolute;inset:0;background-image:var(--generated-background),radial-gradient(circle at 88% 17%,rgba(26,211,238,.26),transparent 24%),linear-gradient(rgba(25,100,211,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(25,100,211,.07) 1px,transparent 1px);background-size:cover,auto,20px 20px,20px 20px;background-position:center;opacity:.72;pointer-events:none}.paper-texture{position:absolute;inset:0;background:linear-gradient(90deg,rgba(255,255,255,.55),transparent 55%);pointer-events:none}.story-page-header,.story-page-count,.story-content,.story-page-footer{position:relative;z-index:1}.story-page-header{height:50px;padding:0 23px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(24,88,168,.14);font-size:11px;font-weight:800}.story-page-header span{color:#096eff}.story-page-count{position:absolute;right:25px;top:68px;color:#4b70a5;font-size:12px;font-weight:900}.story-content{padding:39px 25px 56px}.story-kicker{display:inline-block;margin:0 0 9px;padding:5px 8px;background:var(--orange);color:#fff;font-size:11px;font-weight:900;transform:rotate(-2deg)}h1{max-width:305px;margin:0;color:#103d81;font-size:29px;line-height:1.13;letter-spacing:-1.5px}.story-narration{max-height:93px;overflow:hidden;margin:12px 0 0;color:#315684;font-size:13px;line-height:1.65}.hero-frame,.mini-frame,.scene-hero,.inspiration-board figure,.ai-compare figure{margin:0;overflow:hidden;background:#e8f0f8;box-shadow:0 12px 24px rgba(24,77,139,.14)}.hero-frame img,.mini-frame img,.scene-hero img,.inspiration-board img,.ai-compare img{display:block;width:100%;height:100%;object-fit:cover}.hero-frame span,.scene-hero span{display:grid;height:100%;place-items:center;color:#6684a7;font-size:13px}.cover-hero{height:292px;margin-top:18px;border:7px solid #fff;border-radius:21px;transform:rotate(-2deg)}.cover-detail{position:absolute;width:104px;height:145px;right:26px;top:370px;border:5px solid #fff;border-radius:14px;transform:rotate(6deg)}.story-highlight{position:absolute;left:27px;bottom:68px;max-width:250px;margin:0;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.86);box-shadow:0 8px 20px rgba(24,77,139,.1);color:#235898;font-size:12px;font-weight:800;line-height:1.55}.student-guide{position:absolute;right:24px;bottom:47px;width:57px;height:57px;display:grid;place-items:center;border:5px solid #fff;border-radius:22px 22px 10px 22px;background:linear-gradient(140deg,#ffa965 0 34%,#1664de 35%);box-shadow:0 10px 18px rgba(15,80,175,.24);color:#5f3218;font-size:15px;font-weight:900}.pose-thinking{background:linear-gradient(140deg,#ffe18a 0 34%,#1c8ce9 35%)}.pose-pointing{background:linear-gradient(140deg,#ffa86a 0 34%,#325de4 35%)}.pose-drawing{background:linear-gradient(140deg,#ffc09a 0 34%,#4f6ce8 35%)}.pose-comparing{background:linear-gradient(140deg,#ffcc9d 0 34%,#785ce6 35%)}.pose-modeling{background:linear-gradient(140deg,#9cebf6 0 34%,#1964d8 35%)}.pose-explaining{background:linear-gradient(140deg,#ffe0a0 0 34%,#1079ca 35%)}.pose-celebrating{background:linear-gradient(140deg,#ffd371 0 34%,#ef6c5a 35%)}.story-page-footer{position:absolute;bottom:0;left:0;right:0;height:48px;padding:0 32px;display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.82);color:#5c7ba5;font-size:18px}.story-page-footer i{width:22px;height:22px;border-radius:50%;background:#1962d9}.inspiration-board{height:347px;position:relative;margin-top:19px}.inspiration-board figure{position:absolute;border:5px solid #fff;border-radius:12px}.inspiration-image.i-0{width:184px;height:213px;left:0;top:29px;transform:rotate(-3deg)}.inspiration-image.i-1{width:120px;height:149px;right:3px;top:6px;transform:rotate(5deg)}.inspiration-image.i-2{width:135px;height:116px;right:19px;bottom:27px;transform:rotate(-3deg)}.note{position:absolute;padding:6px 8px;background:#fff5bd;color:#805d1e;font-size:10px;font-weight:800;box-shadow:0 6px 12px rgba(103,76,16,.12)}.note-a{left:8px;top:8px}.note-b{right:8px;bottom:7px}.story-inspiration .story-highlight{bottom:64px}.problem-scene{height:188px;margin-top:16px;border-radius:16px}.problem-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:13px}.problem-grid article{min-height:77px;padding:11px;border:1px solid #c7def5;border-radius:12px;background:rgba(255,255,255,.88);display:flex;gap:8px;align-items:flex-start;color:#315b8d;font-size:12px;font-weight:800;line-height:1.5}.problem-grid b{width:21px;height:21px;flex:0 0 21px;display:grid;place-items:center;border-radius:50%;background:var(--orange);color:#fff;font-size:11px}.blueprint-grid{position:absolute;left:0;right:0;top:218px;height:372px;background-image:linear-gradient(rgba(21,98,210,.16) 1px,transparent 1px),linear-gradient(90deg,rgba(21,98,210,.16) 1px,transparent 1px);background-size:18px 18px;transform:rotate(-4deg)}.sketch-main{position:relative;width:218px;height:280px;margin-top:18px;border:6px solid #fff;border-radius:12px;transform:rotate(-2deg)}.sketch-detail{position:absolute;width:124px;height:154px;right:25px;top:378px;border:5px solid #fff;border-radius:11px;transform:rotate(6deg)}.handwritten{position:absolute;z-index:2;color:#ed861b;font-size:11px;font-style:normal;font-weight:900}.mark-one{left:36px;top:517px}.mark-two{right:16px;top:548px;transform:rotate(-7deg)}.story-sketch .story-highlight{bottom:63px}.ai-compare{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:22px}.ai-compare figure{height:202px;position:relative;border:3px solid #fff;border-radius:12px}.ai-compare figure.chosen{border-color:#0f72ee;box-shadow:0 0 0 3px rgba(17,105,230,.18)}.ai-compare em{position:absolute;left:7px;bottom:7px;padding:4px 5px;background:rgba(7,43,91,.78);color:#fff;font-size:9px;font-style:normal}.ai-compare b{position:absolute;top:7px;right:5px;border-radius:999px;padding:4px;background:#0d7ef2;color:#fff;font-size:9px}.decision-row{display:flex;gap:8px;margin-top:14px}.decision-row span{flex:1;padding:9px;border-radius:10px;background:#fff;color:#49698f;font-size:10px;font-weight:800}.model-orbit{position:absolute;top:274px;left:18px;width:345px;height:240px;border:1px solid rgba(16,160,238,.48);border-radius:50%;transform:rotate(-18deg)}.model-hero{position:relative;height:260px;margin-top:22px;border:5px solid #fff;border-radius:50% 50% 18px 18px}.model-tags{position:relative;display:flex;justify-content:center;gap:8px;margin-top:14px}.model-tags span{padding:6px 10px;border:1px solid #91dceb;border-radius:99px;background:#fff;color:#1869b5;font-size:10px;font-weight:800}.scene-hero{height:340px;margin-top:20px;border-radius:20px}.scene-copy{position:absolute;left:37px;right:37px;top:523px;padding:13px;border-radius:14px;background:rgba(11,49,104,.78);color:#fff}.scene-copy strong{font-size:12px}.scene-copy p{margin:5px 0 0;font-size:11px;line-height:1.5}.reflection-hero{height:245px;margin-top:18px;border:6px solid #fff;border-radius:19px}.reflection-cards{display:grid;gap:7px;margin-top:12px}.reflection-cards article{padding:9px 10px;border-radius:10px;background:rgba(255,255,255,.9);display:flex;gap:8px;color:#315b8c;font-size:11px}.reflection-cards b{color:#ed861b;white-space:nowrap}.story-reflection .student-guide{bottom:43px}@media print{.product-story-image-page{break-after:page}}
</style>

<style scoped>
.hero-frame img,
.mini-frame img,
.scene-hero img,
.inspiration-board img,
.ai-compare img {
  object-fit: contain;
  object-position: center;
  background: #e8f0f8;
}
</style>

<style scoped>
/* 手帐式密集排版：减少大面积留白，让图文在画布内形成连续节奏 */
.story-content{min-height:746px;box-sizing:border-box}
.cover-hero{height:340px;margin-top:14px}
.cover-detail{top:399px;right:22px}
.story-highlight{bottom:84px}
.inspiration-board{height:380px;margin-top:14px}
.problem-scene{height:220px;margin-top:14px}
.problem-grid{margin-top:10px}
.sketch-main{height:310px;margin-top:14px}
.sketch-detail{top:394px}
.ai-compare{margin-top:14px}
.model-hero{height:290px;margin-top:14px}
.scene-hero{height:370px;margin-top:14px}
.reflection-hero{height:290px;margin-top:14px}
</style>
