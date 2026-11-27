<template>
  <!-- 创作类工作台（画画、视频、3D、无限画布…）在竖着拿的手机上放不下画布和工具，提示横过来用。
       平板竖屏不提示（宽度够），只在 ≤680px 的竖屏手机上出现。 -->
  <div v-if="route.meta.landscapeWorkspace" class="landscape-notice" role="status">
    <div class="landscape-notice__card">
      <span class="landscape-notice__phone" aria-hidden="true"><i /></span>
      <strong>把手机横过来用</strong>
      <span>这个页面要横屏才放得下画布和工具。</span>
      <button type="button" @click="router.push('/student/workbench')">先回主页</button>
    </div>
  </div>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
</script>

<style>
.landscape-notice { display: none; }
@media (max-width: 680px) and (orientation: portrait) {
  .landscape-notice {
    position: fixed;
    z-index: 5000;
    inset: 0;
    padding: 24px;
    display: grid;
    place-items: center;
    background: rgba(244, 245, 251, 0.82);
    -webkit-backdrop-filter: blur(16px) saturate(1.3);
    backdrop-filter: blur(16px) saturate(1.3);
  }
  .landscape-notice__card {
    width: min(100%, 340px);
    padding: 30px 24px 24px;
    display: grid;
    justify-items: center;
    gap: 10px;
    border: 1px solid rgba(31, 35, 64, 0.08);
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 18px 48px rgba(31, 35, 64, 0.14);
    text-align: center;
  }
  .landscape-notice__card strong { color: #1f2340; font-size: 20px; font-weight: 700; }
  .landscape-notice__card > span:not(.landscape-notice__phone) { color: #4a5071; font-size: 14px; line-height: 1.6; }
  .landscape-notice__card button {
    margin-top: 8px;
    min-height: 48px;
    padding: 0 26px;
    border: 0;
    border-radius: 999px;
    background: var(--color-primary, #6c5ce7);
    color: #fff;
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }
  .landscape-notice__phone {
    width: 46px;
    height: 72px;
    margin-bottom: 6px;
    border: 3px solid #6c5ce7;
    border-radius: 12px;
    display: grid;
    place-items: end center;
    padding-bottom: 6px;
    animation: landscape-notice-turn 2.4s ease-in-out infinite;
  }
  .landscape-notice__phone i { width: 12px; height: 3px; border-radius: 2px; background: #6c5ce7; }
}
@keyframes landscape-notice-turn {
  0%, 25% { transform: rotate(0deg); }
  50%, 80% { transform: rotate(-90deg); }
  100% { transform: rotate(0deg); }
}
</style>
