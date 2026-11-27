<template>
  <main class="app-page placeholder-page">
    <section>
      <h1>{{ title }}</h1>
      <p>该模块已在路由中预留，MVP阶段暂不开发。</p>
      <BaseButton @click="$router.push('/student/workbench')">返回用户工作台</BaseButton>
    </section>
  </main>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import BaseButton from '../components/base/BaseButton.vue'

const route = useRoute()
const title = computed(() => route.meta.title || '功能预留')
</script>

<style scoped lang="scss">
.placeholder-page { display: grid; place-items: center; }
section { width: min(620px, 100%); border-radius: 24px; background: #fff; box-shadow: var(--shadow-card); padding: 40px; text-align: center; }
h1 { margin: 0 0 12px; color: var(--color-title); }
p { margin: 0 0 24px; color: var(--color-text); }
</style>
