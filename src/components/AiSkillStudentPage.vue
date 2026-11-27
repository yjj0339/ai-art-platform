<template>
  <section class="skill-runtime" :class="{ compact, mobile: previewDevice === 'mobile' }">
    <div class="skill-runtime__grid">
      <article
        v-for="block in blocks"
        :key="block.id"
        class="runtime-block"
        :class="[`block-${block.type}`, { selected: selectedId === block.id }]"
        :style="blockStyle(block)"
        @click="$emit('select', block.id)"
      >
        <template v-if="block.type === 'heading'">
          <h1>{{ block.label || title }}</h1>
          <p>{{ block.description || summary }}</p>
        </template>

        <template v-else-if="block.type === 'image' || block.type === 'images'">
          <label class="runtime-label">{{ block.label }} <em v-if="block.required">必填</em></label>
          <button type="button" class="upload-tile" @click.stop="openFile(block)">
            <img v-if="imageValue(block)" :src="imageValue(block)" :alt="block.label" />
            <span v-else class="upload-empty"><UploadFilled /><b>{{ block.placeholder || '点击或拖拽上传图片' }}</b><small>支持 JPG、PNG、WebP</small></span>
          </button>
          <input :ref="(element) => setFileInput(block.id, element)" hidden type="file" accept="image/*" :multiple="block.type === 'images'" @change="readImages(block, $event)" />
        </template>

        <template v-else-if="block.type === 'text' || block.type === 'textarea'">
          <label class="runtime-label" :for="block.id">{{ block.label }} <em v-if="block.required">必填</em></label>
          <textarea v-if="block.type === 'textarea'" :id="block.id" :value="valueOf(block)" :placeholder="block.placeholder" :maxlength="block.maxLength || 1000" @input="setValue(block.key, $event.target.value)" />
          <input v-else :id="block.id" :value="valueOf(block)" :placeholder="block.placeholder" :maxlength="block.maxLength || 200" @input="setValue(block.key, $event.target.value)" />
        </template>

        <template v-else-if="block.type === 'select' || block.type === 'ratio' || block.type === 'count'">
          <label class="runtime-label" :for="block.id">{{ block.label }} <em v-if="block.required">必填</em></label>
          <select :id="block.id" :value="valueOf(block) || defaultSelectValue(block)" @change="setValue(block.key, $event.target.value)">
            <option v-for="option in optionsOf(block)" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </template>

        <template v-else-if="block.type === 'switch'">
          <label class="switch-row"><span><b>{{ block.label }}</b><small>{{ block.description }}</small></span><input type="checkbox" :checked="Boolean(valueOf(block))" @change="setValue(block.key, $event.target.checked)" /></label>
        </template>

        <template v-else-if="block.type === 'example'">
          <label class="runtime-label">{{ block.label || '效果示例' }}</label>
          <img v-if="block.imageUrl" class="example-image" :src="block.imageUrl" :alt="block.label" />
          <div v-else class="example-empty">填写示例图片地址后在此展示</div>
        </template>

        <button v-else-if="block.type === 'submit'" type="button" class="generate-action" :disabled="running || disabled" @click.stop="$emit('run')">
          <Loading v-if="running" class="is-loading" />
          <MagicStick v-else />
          {{ running ? '正在生成…' : (block.label || (skillType === 'video' ? '生成视频' : '生成图片')) }}
        </button>

        <section v-else-if="block.type === 'result'" class="result-region">
          <header><strong>{{ block.label || '生成结果' }}</strong><span v-if="result?.status">{{ statusText }}</span></header>
          <div v-if="error" class="runtime-error"><WarningFilled />{{ error }}</div>
          <div v-else-if="running" class="result-waiting"><Loading class="is-loading" /><b>{{ skillType === 'video' ? '视频正在生成，请稍候' : '图片正在生成，请稍候' }}</b></div>
          <video v-else-if="result?.videoUrl" :src="result.videoUrl" controls playsinline />
          <div v-else-if="resultImages.length" class="result-images"><img v-for="(url, index) in resultImages" :key="`${url}-${index}`" :src="url" :alt="`生成结果 ${index + 1}`" /></div>
          <div v-else class="result-empty"><Picture /><span>生成结果将在这里展示</span></div>
        </section>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { Loading, MagicStick, Picture, UploadFilled, WarningFilled } from '@element-plus/icons-vue'

const props = defineProps({
  title: { type: String, default: '' },
  summary: { type: String, default: '' },
  skillType: { type: String, default: 'image' },
  blocks: { type: Array, default: () => [] },
  values: { type: Object, default: () => ({}) },
  result: { type: Object, default: null },
  error: { type: String, default: '' },
  running: Boolean,
  disabled: Boolean,
  compact: Boolean,
  previewDevice: { type: String, default: 'desktop' },
  selectedId: { type: String, default: '' },
})
const emit = defineEmits(['update:values', 'run', 'select'])
const fileInputs = new Map()
// 服务端 images 是对象数组（{ id, imageUrl, prompt, … }），早期接口也可能给纯字符串。
// 不取 URL 直接塞进 <img src> 会渲染成 [object Object]，看起来像「生成成功但图裂了」。
function resultImageUrl(item) {
  if (!item) return ''
  if (typeof item === 'string') return item
  return item.imageUrl || item.url || item.src || item.preview || ''
}
const resultImages = computed(() => (props.result?.images || []).map(resultImageUrl).filter(Boolean))
const statusText = computed(() => ({ queued: '排队中', submitting: '提交中', processing: '生成中', rendering: '渲染中', succeeded: '已完成', failed: '失败' })[props.result?.status] || '')

function blockStyle(block) {
  return { '--block-span': props.previewDevice === 'mobile' ? 12 : Math.min(12, Math.max(4, Number(block.span || 12))) }
}
function valueOf(block) { return props.values?.[block.key] ?? block.defaultValue ?? '' }
function setValue(key, value) { if (key) emit('update:values', { ...props.values, [key]: value }) }
function setFileInput(id, element) { if (element) fileInputs.set(id, element); else fileInputs.delete(id) }
function openFile(block) { fileInputs.get(block.id)?.click() }
function imageValue(block) {
  const value = valueOf(block)
  return Array.isArray(value) ? value[0] : value
}
function optionsOf(block) {
  if (block.type === 'count') return [1, 2, 3, 4].map((value) => ({ label: `${value} 张`, value: String(value) }))
  if (block.type === 'ratio') return block.options?.length ? block.options : ['1:1', '16:9', '9:16', '4:3', '3:4'].map((value) => ({ label: value, value }))
  return block.options || []
}
function defaultSelectValue(block) { return optionsOf(block)[0]?.value || '' }
async function readImages(block, event) {
  const files = [...(event.target.files || [])]
  event.target.value = ''
  if (!files.length) return
  const urls = await Promise.all(files.slice(0, block.type === 'images' ? 6 : 1).map((file) => new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file)
  })))
  setValue(block.key, block.type === 'images' ? urls : urls[0])
}
</script>

<style scoped>
.skill-runtime{width:100%;color:#18213a}.skill-runtime__grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:16px}.runtime-block{grid-column:span var(--block-span);min-width:0}.runtime-block.selected{outline:2px solid #6c4cff;outline-offset:5px;border-radius:10px}.block-heading{padding:8px 2px 12px}.block-heading h1{margin:0;font-size:30px;line-height:1.2}.block-heading p{margin:8px 0 0;color:#75809a}.runtime-label{display:flex;gap:7px;align-items:center;margin-bottom:8px;font-size:13px;font-weight:700}.runtime-label em{color:#8a5cf6;font-size:11px;font-style:normal}.runtime-block input:not([type=checkbox]),.runtime-block textarea,.runtime-block select{width:100%;box-sizing:border-box;border:1px solid #dce1ec;border-radius:10px;background:#fff;padding:12px 14px;color:#27324a;font:inherit;outline:none}.runtime-block input:focus,.runtime-block textarea:focus,.runtime-block select:focus{border-color:#7053f2;box-shadow:0 0 0 3px rgba(112,83,242,.1)}.runtime-block textarea{min-height:112px;resize:vertical}.upload-tile{display:block;width:100%;height:180px;overflow:hidden;border:1px dashed #ccd3e2;border-radius:12px;background:#f8f9fc;cursor:pointer}.upload-tile img{width:100%;height:100%;object-fit:cover}.upload-empty{display:flex;height:100%;align-items:center;justify-content:center;flex-direction:column;gap:8px;color:#768198}.upload-empty svg{width:30px}.upload-empty b{font-size:13px}.upload-empty small{font-size:11px}.switch-row{display:flex;align-items:center;justify-content:space-between;border:1px solid #e3e6ee;border-radius:10px;padding:12px 14px}.switch-row span{display:grid;gap:4px}.switch-row small{color:#7d879c}.example-image{width:100%;max-height:280px;object-fit:cover;border-radius:12px}.example-empty,.result-empty,.result-waiting{display:flex;min-height:140px;align-items:center;justify-content:center;gap:10px;border:1px dashed #d5dae5;border-radius:12px;background:#f8f9fc;color:#8791a5}.generate-action{display:flex;width:100%;align-items:center;justify-content:center;gap:8px;border:0;border-radius:11px;background:#6946ef;color:#fff;padding:14px 18px;font:inherit;font-weight:800;cursor:pointer;box-shadow:0 8px 20px rgba(105,70,239,.2)}.generate-action:disabled{cursor:not-allowed;opacity:.58}.generate-action svg{width:18px}.result-region{border-top:1px solid #e8ebf1;padding-top:16px}.result-region header{display:flex;justify-content:space-between;margin-bottom:12px}.result-region header span{color:#6b53e8;font-size:12px}.result-images{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.result-images img,.result-region video{width:100%;border-radius:12px}.runtime-error{display:flex;align-items:center;gap:8px;border:1px solid #ffd1d1;border-radius:10px;background:#fff5f5;color:#c54242;padding:12px}.runtime-error svg,.result-empty svg{width:22px}.is-loading{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.skill-runtime.mobile{max-width:390px;margin:auto}.skill-runtime.mobile .skill-runtime__grid{grid-template-columns:1fr}.skill-runtime.mobile .runtime-block{grid-column:1}.compact .skill-runtime__grid{gap:12px}.compact .block-heading h1{font-size:22px}.compact .upload-tile{height:150px}@media(max-width:760px){.runtime-block{grid-column:1/-1}.block-heading h1{font-size:24px}}
</style>
