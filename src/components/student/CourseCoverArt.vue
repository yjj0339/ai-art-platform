<template>
  <!-- 课程封面：后台上传了封面图就显示图片；没有就按课程分类显示一张原创矢量插画（不是「一个字 + 渐变」）。
       插画画在 320×200 的画布里，按容器等比缩放，空出来的地方是同色渐变底，任何比例的卡片都不会裁到主体。 -->
  <span class="cca" :class="`cca--${kind}`" aria-hidden="true">
    <span v-if="imageCss" class="cca__img" :style="{ background: imageCss }" />
    <svg v-else class="cca__svg" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet" focusable="false">
      <template v-if="kind === 'storefront'">
        <circle cx="272" cy="40" r="26" fill="#fff" opacity=".55" />
        <ellipse cx="160" cy="178" rx="112" ry="9" fill="#1f2340" opacity=".07" />
        <rect x="76" y="62" width="168" height="114" rx="8" fill="#fffaf3" />
        <rect x="94" y="32" width="132" height="34" rx="10" fill="#6c5ce7" />
        <rect x="148.5" y="39" width="23" height="4.5" rx="2.2" fill="#ffc9b3" />
        <path d="M151 43.5h18l-2.4 16h-13.2z" fill="#fff" />
        <path d="M163.5 43l2.5-8" stroke="#fff" stroke-width="2.4" stroke-linecap="round" />
        <circle cx="157" cy="54" r="1.8" fill="#6c5ce7" />
        <circle cx="162.5" cy="55.5" r="1.8" fill="#6c5ce7" />
        <path v-for="i in 9" :key="i" :d="`M${50 + i * 20} 68h20v13a10 10 0 0 1-20 0z`" :fill="i % 2 ? '#ff8f73' : '#ffffff'" />
        <rect x="90" y="102" width="48" height="42" rx="6" fill="#d4ecff" />
        <rect x="182" y="102" width="48" height="42" rx="6" fill="#d4ecff" />
        <rect x="96" y="108" width="15" height="4" rx="2" fill="#fff" opacity=".85" />
        <rect x="188" y="108" width="15" height="4" rx="2" fill="#fff" opacity=".85" />
        <rect x="87" y="143" width="54" height="6" rx="3" fill="#eadfcf" />
        <rect x="179" y="143" width="54" height="6" rx="3" fill="#eadfcf" />
        <rect x="146" y="104" width="28" height="72" rx="6" fill="#ffb59c" />
        <rect x="151" y="110" width="18" height="24" rx="4" fill="#fff" opacity=".7" />
        <circle cx="168" cy="146" r="2.2" fill="#fff" />
        <path d="M46 158h22l-3 18h-16z" fill="#ffb59c" />
        <circle cx="57" cy="149" r="10" fill="#69db9b" />
        <circle cx="50" cy="142" r="7" fill="#7fe0aa" />
        <circle cx="64" cy="141" r="7" fill="#56c98a" />
        <path d="M252 158h22l-3 18h-16z" fill="#ffb59c" />
        <circle cx="263" cy="149" r="10" fill="#69db9b" />
        <circle cx="256" cy="142" r="7" fill="#56c98a" />
        <circle cx="270" cy="141" r="7" fill="#7fe0aa" />
      </template>

      <template v-else-if="kind === 'ip'">
        <circle cx="60" cy="44" r="22" fill="#fff" opacity=".5" />
        <ellipse cx="160" cy="180" rx="72" ry="8" fill="#1f2340" opacity=".08" />
        <circle cx="118" cy="68" r="18" fill="#fff" />
        <circle cx="202" cy="68" r="18" fill="#fff" />
        <circle cx="118" cy="68" r="9" fill="#ffc2d4" />
        <circle cx="202" cy="68" r="9" fill="#ffc2d4" />
        <path d="M160 52c40 0 66 30 66 68 0 34-28 56-66 56s-66-22-66-56c0-38 26-68 66-68z" fill="#fff" />
        <ellipse cx="140" cy="112" rx="7" ry="9" fill="#2a2d4f" />
        <ellipse cx="180" cy="112" rx="7" ry="9" fill="#2a2d4f" />
        <circle cx="142.6" cy="108.6" r="2.5" fill="#fff" />
        <circle cx="182.6" cy="108.6" r="2.5" fill="#fff" />
        <ellipse cx="124" cy="128" rx="9" ry="5.5" fill="#ffc2d4" />
        <ellipse cx="196" cy="128" rx="9" ry="5.5" fill="#ffc2d4" />
        <path d="M153 126q7 7 14 0" stroke="#2a2d4f" stroke-width="3" fill="none" stroke-linecap="round" />
        <path d="M160 160c-6-5-10-8-10-12a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 4-4 7-10 12z" fill="#ffb3c7" />
        <path d="M248 52l2.5 7.5 7.5 2.5-7.5 2.5-2.5 7.5-2.5-7.5-7.5-2.5 7.5-2.5z" fill="#fff" />
        <path d="M262 100l1.8 5.2 5.2 1.8-5.2 1.8-1.8 5.2-1.8-5.2-5.2-1.8 5.2-1.8z" fill="#9b8cff" />
        <path d="M74 112l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#fff" />
      </template>

      <template v-else-if="kind === 'ad'">
        <circle cx="270" cy="42" r="24" fill="#fff" opacity=".5" />
        <ellipse cx="168" cy="180" rx="100" ry="8" fill="#1f2340" opacity=".07" />
        <path d="M128 150l-14 28M212 150l14 28M170 152v26" stroke="#d2b48c" stroke-width="5" stroke-linecap="round" />
        <rect x="112" y="26" width="116" height="130" rx="10" fill="#fff" />
        <rect x="126" y="40" width="58" height="10" rx="5" fill="#ff8f73" />
        <rect x="126" y="56" width="36" height="6" rx="3" fill="#ffd3c4" />
        <rect x="126" y="70" width="88" height="56" rx="8" fill="#e3f0ff" />
        <circle cx="194" cy="87" r="9" fill="#ffd166" />
        <path d="M130 126l22-27 17 19 12-12 29 20z" fill="#7aa8ff" />
        <rect x="126" y="134" width="70" height="6" rx="3" fill="#e6e8f2" />
        <rect x="126" y="144" width="46" height="6" rx="3" fill="#e6e8f2" />
        <path d="M30 136l36-16v40l-36-16z" fill="#6c5ce7" />
        <rect x="20" y="134" width="13" height="12" rx="4" fill="#8f84ef" />
        <path d="M74 128q8 12 0 24M84 120q14 20 0 40" stroke="#6c5ce7" stroke-width="4" fill="none" stroke-linecap="round" opacity=".55" />
        <path d="M262 106l2.4 7 7 2.4-7 2.4-2.4 7-2.4-7-7-2.4 7-2.4z" fill="#ff8f73" />
      </template>

      <template v-else-if="kind === 'anime'">
        <rect x="68" y="28" width="114" height="144" rx="12" fill="#fff" />
        <rect x="192" y="28" width="62" height="66" rx="12" fill="#fff" />
        <rect x="192" y="104" width="62" height="68" rx="12" fill="#fff" />
        <path d="M94 172c4-18 16-26 31-26s27 8 31 26z" fill="#ff9fb2" />
        <circle cx="125" cy="106" r="30" fill="#ffe3d3" />
        <path d="M93 104c1-27 16-42 32-42s31 13 33 40l-10-9-8 11-8-12-8 12-8-11-8 11z" fill="#5b4bd6" />
        <ellipse cx="113" cy="112" rx="5" ry="7" fill="#2a2d4f" />
        <ellipse cx="137" cy="112" rx="5" ry="7" fill="#2a2d4f" />
        <circle cx="114.8" cy="109.4" r="1.8" fill="#fff" />
        <circle cx="138.8" cy="109.4" r="1.8" fill="#fff" />
        <ellipse cx="105" cy="123" rx="5" ry="3" fill="#ffc2d4" />
        <ellipse cx="145" cy="123" rx="5" ry="3" fill="#ffc2d4" />
        <path d="M120 125q5 4 10 0" stroke="#2a2d4f" stroke-width="2.6" fill="none" stroke-linecap="round" />
        <path d="M206 42h34a8 8 0 0 1 8 8v14a8 8 0 0 1-8 8h-18l-8 8v-8h-8a8 8 0 0 1-8-8v-14a8 8 0 0 1 8-8z" fill="#efeaff" />
        <rect x="221" y="47" width="4.4" height="12" rx="2.2" fill="#6c5ce7" />
        <circle cx="223.2" cy="64.5" r="2.5" fill="#6c5ce7" />
        <path d="M223 114l5 12 13 1-10 8 4 13-12-7-12 7 4-13-10-8 13-1z" fill="#ffd166" />
        <path d="M204 160h38M210 166h26" stroke="#e6e8f2" stroke-width="4" stroke-linecap="round" />
      </template>

      <template v-else-if="kind === 'product'">
        <ellipse cx="170" cy="178" rx="104" ry="9" fill="#1f2340" opacity=".07" />
        <path d="M98 86l48-21 48 21-48 21z" fill="#ffd0bd" />
        <path d="M98 86l48 21v60l-48-21z" fill="#ff9f80" />
        <path d="M194 86l-48 21v60l48-21z" fill="#ffb59c" />
        <path d="M122 75.5l48 21" stroke="#fff" stroke-width="7" opacity=".7" />
        <path d="M157 121l27-11.5v19l-27 11.5z" fill="#fff" opacity=".85" />
        <rect x="216" y="54" width="20" height="15" rx="4" fill="#6c5ce7" />
        <rect x="206" y="66" width="40" height="100" rx="14" fill="#7fd8be" />
        <rect x="206" y="98" width="40" height="34" fill="#fff" opacity=".92" />
        <circle cx="226" cy="115" r="7" fill="#ffd166" />
        <rect x="213" y="75" width="6" height="18" rx="3" fill="#fff" opacity=".6" />
        <path d="M70 60l2.6 7.4 7.4 2.6-7.4 2.6-2.6 7.4-2.6-7.4-7.4-2.6 7.4-2.6z" fill="#fff" />
        <path d="M270 52l2 5.6 5.6 2-5.6 2-2 5.6-2-5.6-5.6-2 5.6-2z" fill="#ff8f73" />
      </template>

      <template v-else-if="kind === 'interior'">
        <ellipse cx="174" cy="179" rx="100" ry="9" fill="#fff" opacity=".7" />
        <rect x="46" y="28" width="78" height="66" rx="9" fill="#fff" />
        <rect x="52" y="34" width="31" height="25" rx="3" fill="#d4ecff" />
        <rect x="87" y="34" width="31" height="25" rx="3" fill="#d4ecff" />
        <rect x="52" y="63" width="31" height="25" rx="3" fill="#d4ecff" />
        <rect x="87" y="63" width="31" height="25" rx="3" fill="#d4ecff" />
        <rect x="104" y="98" width="140" height="50" rx="18" fill="#9b8cff" />
        <rect x="96" y="128" width="156" height="34" rx="14" fill="#8a7bf5" />
        <rect x="88" y="116" width="26" height="48" rx="12" fill="#a99cff" />
        <rect x="234" y="116" width="26" height="48" rx="12" fill="#a99cff" />
        <rect x="124" y="106" width="40" height="28" rx="10" fill="#ffd6c2" />
        <rect x="184" y="106" width="40" height="28" rx="10" fill="#d6f7ea" />
        <rect x="104" y="162" width="8" height="13" rx="3" fill="#6b5fd0" />
        <rect x="236" y="162" width="8" height="13" rx="3" fill="#6b5fd0" />
        <rect x="276" y="70" width="5" height="104" rx="2.5" fill="#c9b8a6" />
        <path d="M262 46h33l8 26h-49z" fill="#ffd166" />
        <ellipse cx="278.5" cy="175" rx="16" ry="4" fill="#c9b8a6" />
        <path d="M50 150h26l-4 26h-18z" fill="#ffb59c" />
        <circle cx="63" cy="139" r="13" fill="#69db9b" />
        <circle cx="53" cy="128" r="8" fill="#7fe0aa" />
        <circle cx="73" cy="127" r="9" fill="#56c98a" />
      </template>

      <template v-else-if="kind === 'car'">
        <rect x="20" y="172" width="280" height="6" rx="3" fill="#fff" opacity=".65" />
        <path d="M24 110h40M14 126h44M30 142h28" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".8" />
        <path d="M74 146c0-16 10-26 26-28l28-30c6-6 12-8 20-8h46c10 0 18 4 24 12l20 26c22 2 38 12 38 28v8c0 4-3 6-6 6H80c-4 0-6-2-6-6z" fill="#7aa8ff" />
        <path d="M136 93c3-4 7-6 12-6h18v33h-51z" fill="#e3f0ff" />
        <path d="M174 87h18c6 0 10 2 14 7l17 26h-49z" fill="#e3f0ff" />
        <path d="M100 136h146" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7" />
        <rect x="248" y="132" width="14" height="8" rx="4" fill="#ffd166" />
        <rect x="76" y="134" width="10" height="7" rx="3.5" fill="#ff8f73" />
        <circle cx="116" cy="162" r="18" fill="#2a2d4f" />
        <circle cx="116" cy="162" r="7" fill="#c9cde0" />
        <circle cx="226" cy="162" r="18" fill="#2a2d4f" />
        <circle cx="226" cy="162" r="7" fill="#c9cde0" />
        <circle cx="268" cy="44" r="22" fill="#fff" opacity=".55" />
      </template>

      <template v-else-if="kind === 'creative'">
        <ellipse cx="156" cy="178" rx="96" ry="8" fill="#1f2340" opacity=".07" />
        <path d="M156 40c-52 0-88 30-88 66 0 31 24 54 55 54 14 0 18-8 18-16 0-10 8-14 16-14h14c30 0 52-14 52-38 0-30-31-52-67-52z" fill="#fff" />
        <circle cx="128" cy="140" r="10" fill="#ffe4e6" />
        <circle cx="112" cy="94" r="12" fill="#ff8f73" />
        <circle cx="146" cy="70" r="12" fill="#ffd166" />
        <circle cx="186" cy="72" r="12" fill="#69db9b" />
        <circle cx="210" cy="100" r="12" fill="#7aa8ff" />
        <circle cx="104" cy="126" r="9" fill="#9b8cff" />
        <path d="M262 46l-62 82" stroke="#d29a6c" stroke-width="10" stroke-linecap="round" />
        <path d="M206 120l-10 13" stroke="#c9cde0" stroke-width="13" stroke-linecap="round" />
        <path d="M193 136c-6 9-15 11-22 18 9 2 20-1 27-10z" fill="#ff6b9a" />
        <circle cx="250" cy="150" r="7" fill="#ff6b9a" opacity=".5" />
        <circle cx="264" cy="132" r="4" fill="#ffd166" />
        <path d="M60 52l2.4 7 7 2.4-7 2.4-2.4 7-2.4-7-7-2.4 7-2.4z" fill="#fff" />
      </template>

      <template v-else-if="kind === 'picturebook'">
        <path d="M240 30a22 22 0 1 0 16 38 18 18 0 1 1-16-38z" fill="#ffd166" />
        <path d="M72 46l2.4 7 7 2.4-7 2.4-2.4 7-2.4-7-7-2.4 7-2.4z" fill="#fff" />
        <path d="M196 40l1.8 5.2 5.2 1.8-5.2 1.8-1.8 5.2-1.8-5.2-5.2-1.8 5.2-1.8z" fill="#fff" />
        <ellipse cx="160" cy="182" rx="98" ry="7" fill="#1f2340" opacity=".07" />
        <path d="M66 78v96c34-6 66-3 94 8 28-11 60-14 94-8V78c-34-6-66-3-94 8-28-11-60-14-94-8z" fill="#9b8cff" />
        <path d="M160 86c-24-12-56-14-86-8v88c30-6 62-4 86 8z" fill="#fff" />
        <path d="M160 86c24-12 56-14 86-8v88c-30-6-62-4-86 8z" fill="#f6f4ff" />
        <path d="M160 86v88" stroke="#ddd7f7" stroke-width="2" />
        <path d="M84 158q30-18 66-4v8q-34-8-66 4z" fill="#69db9b" />
        <path d="M100 134l15-13 15 13v18h-30z" fill="#ffb59c" />
        <path d="M96 135l19-17 19 17" stroke="#ff8f73" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        <rect x="111" y="140" width="8" height="12" rx="2" fill="#fff" />
        <rect x="176" y="102" width="50" height="5" rx="2.5" fill="#dcd6f7" />
        <rect x="176" y="114" width="40" height="5" rx="2.5" fill="#dcd6f7" />
        <rect x="176" y="126" width="46" height="5" rx="2.5" fill="#dcd6f7" />
        <rect x="176" y="138" width="30" height="5" rx="2.5" fill="#dcd6f7" />
      </template>

      <template v-else>
        <circle cx="64" cy="46" r="22" fill="#fff" opacity=".5" />
        <ellipse cx="160" cy="180" rx="90" ry="8" fill="#1f2340" opacity=".07" />
        <rect x="98" y="38" width="112" height="136" rx="10" fill="#fff" transform="rotate(-6 154 106)" />
        <path d="M118 82q16-14 32 0t32 0" stroke="#9b8cff" stroke-width="5" fill="none" stroke-linecap="round" transform="rotate(-6 154 106)" />
        <circle cx="140" cy="122" r="16" fill="#ffd6c2" transform="rotate(-6 154 106)" />
        <rect x="164" y="112" width="26" height="22" rx="6" fill="#d6f7ea" transform="rotate(-6 154 106)" />
        <g transform="rotate(35 230 100)">
          <rect x="220" y="36" width="20" height="110" rx="4" fill="#ffd166" />
          <path d="M220 146h20l-10 22z" fill="#ffe3c7" />
          <path d="M226.5 160h7l-3.5 8z" fill="#2a2d4f" />
          <rect x="220" y="30" width="20" height="12" rx="3" fill="#ff8f73" />
        </g>
      </template>
    </svg>
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  category: { type: String, default: '' },
  // courseCoverStyle() 的结果：可能是「url(...) center / cover」这种图片，也可能只是一段渐变
  cover: { type: String, default: '' },
})

const KINDS = ['storefront', 'ip', 'ad', 'anime', 'product', 'interior', 'car', 'creative', 'picturebook']
const kind = computed(() => (KINDS.includes(props.category) ? props.category : 'default'))
const imageCss = computed(() => (/url\(/i.test(props.cover || '') ? props.cover : ''))
</script>

<style scoped>
.cca {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: linear-gradient(140deg, #eef0f7, #e7e3ff);
}
.cca__svg { display: block; width: 100%; height: 100%; }
.cca__img { position: absolute; inset: 0; background-size: cover !important; background-position: center !important; }
.cca--storefront { background: linear-gradient(140deg, #dff6ea, #fff1cf); }
.cca--ip { background: linear-gradient(140deg, #ffe3ee, #e7e0ff); }
.cca--ad { background: linear-gradient(140deg, #dcefff, #ffe6d6); }
.cca--anime { background: linear-gradient(140deg, #ece6ff, #dbe9ff); }
.cca--product { background: linear-gradient(140deg, #fff3cc, #ffe2d3); }
.cca--interior { background: linear-gradient(140deg, #fbf1e4, #e2f2e8); }
.cca--car { background: linear-gradient(140deg, #dceeff, #dff7ee); }
.cca--creative { background: linear-gradient(140deg, #ffe8dc, #ffe1ec); }
.cca--picturebook { background: linear-gradient(140deg, #e6e2ff, #dceeff); }
</style>
