<template>
  <label class="upload-box">
    <input type="file" :accept="accept" :capture="capture || undefined" @change="onFileChange" />
    <span class="upload-box__icon">{{ icon }}</span>
    <strong>{{ title }}</strong>
    <small>{{ hint }}</small>
  </label>
</template>

<script setup>
const emit = defineEmits(['upload'])
defineProps({
  title: { type: String, default: '上传手绘草图' },
  hint: { type: String, default: '支持拍照或相册上传，MVP阶段使用本地预览' },
  icon: { type: String, default: '+' },
  accept: { type: String, default: 'image/*' },
  capture: { type: String, default: '' },
})

function onFileChange(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => emit('upload', { file, preview: reader.result })
  reader.readAsDataURL(file)
  event.target.value = ''
}
</script>
