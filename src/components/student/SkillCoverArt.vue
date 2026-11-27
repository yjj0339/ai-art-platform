<template>
  <!-- 玩法卡片的默认封面：后台没上传封面图时，按玩法名称（再看分类名）挑一张原创小插画，带轻微动效
       （眨眼、飘云、星星闪、灯笼摆……）。插画画在 160×120 的画布里，按容器等比缩放，四周是同色渐变底，
       任何尺寸的卡片都不会裁到主体。系统设置了「减少动态效果」时动画全部停掉。 -->
  <span class="sca" :class="`sca--${art}`" :style="{ '--d': delay }" aria-hidden="true">
    <svg class="sca__svg" viewBox="0 0 160 120" preserveAspectRatio="xMidYMid meet" focusable="false">
      <!-- 动漫人物：大眼睛 Q 版女孩 -->
      <template v-if="art === 'anime'">
        <ellipse cx="80" cy="106" rx="26" ry="3.5" fill="#2a2d4f" opacity=".08" />
        <g class="a-float">
          <circle cx="51" cy="36" r="11" fill="#a68bff" />
          <circle cx="109" cy="36" r="11" fill="#a68bff" />
          <path d="M46 70c0-24 15-40 34-40s34 16 34 40v20c0 4-3 6-6 6H52c-3 0-6-2-6-6z" fill="#a68bff" />
          <ellipse cx="80" cy="70" rx="27" ry="25" fill="#fff4ec" />
          <path d="M53 64c3-15 14-23 27-23s24 8 27 23c-6-4-11-6-15-6l-5 6-5-7-5 7-5-6c-5 0-11 2-14 6z" fill="#a68bff" />
          <g class="a-blink">
            <ellipse cx="69" cy="73" rx="4.2" ry="5.6" fill="#2a2d4f" />
            <ellipse cx="91" cy="73" rx="4.2" ry="5.6" fill="#2a2d4f" />
            <circle cx="70.4" cy="70.8" r="1.5" fill="#fff" />
            <circle cx="92.4" cy="70.8" r="1.5" fill="#fff" />
          </g>
          <ellipse cx="62" cy="81" rx="4.5" ry="2.6" fill="#ffb3c7" />
          <ellipse cx="98" cy="81" rx="4.5" ry="2.6" fill="#ffb3c7" />
          <path d="M76 83q4 3.5 8 0" stroke="#2a2d4f" stroke-width="1.8" fill="none" stroke-linecap="round" />
        </g>
        <path class="a-twinkle" :d="star(126, 30, 6)" fill="#fff" />
        <path class="a-twinkle d2" :d="star(34, 50, 5)" fill="#ffd66b" />
        <path class="a-twinkle d3" :d="star(130, 78, 4)" fill="#ff9fbf" />
      </template>

      <!-- 人物角色：戴帽子挥手的小探险家 -->
      <template v-else-if="art === 'character'">
        <g class="a-drift">
          <ellipse cx="34" cy="30" rx="14" ry="6.5" fill="#fff" opacity=".9" />
          <ellipse cx="43" cy="26" rx="9" ry="6.5" fill="#fff" opacity=".9" />
        </g>
        <ellipse cx="80" cy="107" rx="22" ry="3.5" fill="#2a2d4f" opacity=".08" />
        <g class="a-float">
          <rect x="70" y="92" width="7" height="12" rx="3" fill="#2a2d4f" />
          <rect x="83" y="92" width="7" height="12" rx="3" fill="#2a2d4f" />
          <path d="M68 78l-9 11" stroke="#6c9cff" stroke-width="7" stroke-linecap="round" />
          <circle cx="57.5" cy="90.5" r="4.4" fill="#ffe0c7" />
          <rect x="64" y="68" width="32" height="30" rx="13" fill="#6c9cff" />
          <rect x="74" y="74" width="12" height="9" rx="3" fill="#fff" opacity=".85" />
          <g class="a-wave">
            <path d="M93 76l9-13" stroke="#6c9cff" stroke-width="7" stroke-linecap="round" />
            <circle cx="103.5" cy="60.5" r="4.6" fill="#ffe0c7" />
          </g>
          <circle cx="80" cy="50" r="18" fill="#ffe0c7" />
          <path d="M62 48a18 18 0 0 1 36 0z" fill="#ff8f73" />
          <path d="M95 45h10a3 3 0 0 1 0 6H93z" fill="#ff8f73" />
          <circle cx="80" cy="31.5" r="2.6" fill="#ffd66b" />
          <g class="a-blink">
            <circle cx="74" cy="54" r="2.6" fill="#2a2d4f" />
            <circle cx="86" cy="54" r="2.6" fill="#2a2d4f" />
          </g>
          <circle cx="69" cy="60" r="3" fill="#ffb3c7" opacity=".75" />
          <circle cx="91" cy="60" r="3" fill="#ffb3c7" opacity=".75" />
          <path d="M75.5 60.5q4.5 3.6 9 0" stroke="#2a2d4f" stroke-width="1.8" fill="none" stroke-linecap="round" />
        </g>
        <path class="a-twinkle" :d="star(124, 34, 5)" fill="#ffd66b" />
        <path class="a-twinkle d2" :d="star(130, 84, 4)" fill="#fff" />
      </template>

      <!-- 节日海报：灯笼 + 烟花 -->
      <template v-else-if="art === 'festival'">
        <path d="M0 8q40 10 80 4t80 6" stroke="#d9a35b" stroke-width="1.6" fill="none" />
        <g class="a-sway">
          <path d="M42 10v12" stroke="#d9a35b" stroke-width="1.6" />
          <rect x="36" y="21" width="12" height="4" rx="1.5" fill="#ffd66b" />
          <ellipse cx="42" cy="38" rx="16" ry="14" fill="#ff6b6b" />
          <ellipse cx="42" cy="38" rx="8" ry="14" fill="none" stroke="#ff9b8a" stroke-width="1.6" />
          <rect x="36" y="51" width="12" height="4" rx="1.5" fill="#ffd66b" />
          <path d="M42 55v12" stroke="#ffd66b" stroke-width="2" stroke-linecap="round" />
        </g>
        <g class="a-sway d2">
          <path d="M80 12v8" stroke="#d9a35b" stroke-width="1.4" />
          <rect x="75" y="19" width="10" height="3.5" rx="1.5" fill="#ffd66b" />
          <ellipse cx="80" cy="33" rx="12" ry="11" fill="#ff8f6b" />
          <ellipse cx="80" cy="33" rx="6" ry="11" fill="none" stroke="#ffb59c" stroke-width="1.4" />
          <rect x="75" y="43" width="10" height="3.5" rx="1.5" fill="#ffd66b" />
          <path d="M80 46.5v9" stroke="#ffd66b" stroke-width="1.8" stroke-linecap="round" />
        </g>
        <g class="a-pop">
          <path :d="rays(122, 46, 5, 17, 10)" stroke="#ffc94d" stroke-width="2.4" stroke-linecap="round" />
          <circle cx="122" cy="46" r="2.6" fill="#ffc94d" />
        </g>
        <g class="a-pop d2">
          <path :d="rays(138, 84, 3, 10, 8)" stroke="#9b8cff" stroke-width="2" stroke-linecap="round" />
        </g>
        <g class="a-pop d3">
          <path :d="rays(100, 82, 3, 9, 8)" stroke="#ff8fa3" stroke-width="2" stroke-linecap="round" />
        </g>
        <g class="a-twinkle"><rect x="28" y="92" width="6" height="3" rx="1.2" fill="#9b8cff" transform="rotate(20 31 93.5)" /></g>
        <g class="a-twinkle d2"><rect x="54" y="100" width="6" height="3" rx="1.2" fill="#ffc94d" transform="rotate(-25 57 101.5)" /></g>
        <circle class="a-twinkle d3" cx="70" cy="88" r="2.2" fill="#ff8fa3" />
      </template>

      <!-- 广告设计：广告牌 + 喇叭 -->
      <template v-else-if="art === 'ad'">
        <ellipse cx="76" cy="106" rx="46" ry="3.5" fill="#2a2d4f" opacity=".08" />
        <rect x="45" y="70" width="5" height="34" rx="2" fill="#d8c7ad" />
        <rect x="86" y="70" width="5" height="34" rx="2" fill="#d8c7ad" />
        <rect x="26" y="24" width="84" height="52" rx="7" fill="#fff" />
        <path d="M26 31a7 7 0 0 1 7-7h70a7 7 0 0 1 7 7v4H26z" fill="#6c5ce7" />
        <path class="a-burst" :d="burst(48, 56, 13, 8, 8)" fill="#ffd66b" />
        <rect x="66" y="45" width="34" height="6" rx="3" fill="#6c5ce7" />
        <rect x="66" y="56" width="26" height="5" rx="2.5" fill="#c9c1ff" />
        <rect x="66" y="65" width="30" height="4" rx="2" fill="#ececf4" />
        <g class="a-wiggle">
          <rect x="106" y="63" width="8" height="16" rx="3" fill="#ff8f73" />
          <path d="M113 66l19-11v32l-19-11z" fill="#ff8f73" />
          <ellipse cx="132" cy="71" rx="4.5" ry="16" fill="#ffb59c" />
          <rect x="112" y="77" width="5" height="12" rx="2" fill="#e97b62" />
        </g>
        <g class="a-pulse">
          <path d="M141 63q5 8 0 16" stroke="#ff8f73" stroke-width="2.4" fill="none" stroke-linecap="round" />
          <path d="M147 57q9 14 0 28" stroke="#ff8f73" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".6" />
        </g>
      </template>

      <!-- 品牌包装：礼盒 + 瓶子 -->
      <template v-else-if="art === 'brand'">
        <ellipse cx="80" cy="104" rx="50" ry="3.5" fill="#2a2d4f" opacity=".08" />
        <rect x="38" y="60" width="50" height="42" rx="5" fill="#6c5ce7" />
        <rect x="59" y="60" width="8" height="42" fill="#ffd66b" />
        <g class="a-hop">
          <rect x="34" y="48" width="58" height="15" rx="4" fill="#8b7cf6" />
          <rect x="59" y="48" width="8" height="15" fill="#ffe08a" />
          <ellipse cx="55" cy="45" rx="8" ry="5" fill="#ffd66b" transform="rotate(-20 55 45)" />
          <ellipse cx="71" cy="45" rx="8" ry="5" fill="#ffd66b" transform="rotate(20 71 45)" />
          <circle cx="63" cy="47" r="3.5" fill="#ffc94d" />
        </g>
        <rect x="105" y="28" width="12" height="8" rx="2" fill="#2a2d4f" />
        <rect x="106" y="35" width="10" height="10" fill="#8fe3c0" />
        <rect x="97" y="44" width="28" height="58" rx="9" fill="#b8f0d8" />
        <rect x="100" y="60" width="22" height="22" rx="4" fill="#fff" />
        <path d="M111 76c-4-3-6-5-6-8a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 3-2 5-6 8z" fill="#ff8fa3" />
        <rect x="101" y="48" width="3.5" height="40" rx="1.75" fill="#fff" opacity=".5" />
        <path class="a-twinkle" :d="star(26, 36, 5)" fill="#ffd66b" />
        <path class="a-twinkle d2" :d="star(138, 28, 5)" fill="#fff" />
        <path class="a-twinkle d3" :d="star(140, 78, 4)" fill="#9b8cff" />
      </template>

      <!-- 梦幻建筑：城堡 + 小旗 -->
      <template v-else-if="art === 'castle'">
        <g class="a-drift">
          <ellipse cx="26" cy="36" rx="13" ry="6" fill="#fff" opacity=".85" />
          <ellipse cx="34" cy="32" rx="8" ry="6" fill="#fff" opacity=".85" />
        </g>
        <g class="a-drift d2">
          <ellipse cx="136" cy="62" rx="12" ry="5" fill="#fff" opacity=".8" />
          <ellipse cx="142" cy="58" rx="7" ry="5" fill="#fff" opacity=".8" />
        </g>
        <ellipse cx="80" cy="105" rx="52" ry="3.5" fill="#2a2d4f" opacity=".08" />
        <rect x="36" y="48" width="18" height="56" rx="2" fill="#f4f0ff" />
        <rect x="106" y="48" width="18" height="56" rx="2" fill="#f4f0ff" />
        <path d="M33 50 45 24 57 50z" fill="#9b8cff" />
        <path d="M103 50 115 24 127 50z" fill="#9b8cff" />
        <rect x="50" y="62" width="60" height="42" fill="#fff" />
        <rect v-for="x in [50, 63, 76, 89, 102]" :key="x" :x="x" y="56" width="8" height="7" fill="#fff" />
        <rect x="70" y="36" width="20" height="28" fill="#fff" />
        <path d="M66 38 80 12 94 38z" fill="#ff9fbf" />
        <path d="M70 104V86a10 10 0 0 1 20 0v18z" fill="#b3a7ff" />
        <path d="M76 52a4 4 0 0 1 8 0v6h-8z" fill="#cfe8ff" />
        <path d="M41 66a4 4 0 0 1 8 0v8h-8z" fill="#cfe8ff" />
        <path d="M111 66a4 4 0 0 1 8 0v8h-8z" fill="#cfe8ff" />
        <path d="M45 24V14M115 24V14M80 12V3" stroke="#2a2d4f" stroke-width="1.4" />
        <path class="a-flag" d="M45 14l10 3.5-10 3.5z" fill="#ffd66b" />
        <path class="a-flag d2" d="M115 14l10 3.5-10 3.5z" fill="#ffd66b" />
        <path class="a-flag d3" d="M80 3l10 3.5-10 3.5z" fill="#8fe3c0" />
        <path class="a-twinkle" :d="star(20, 66, 4)" fill="#fff" />
        <path class="a-twinkle d2" :d="star(142, 30, 5)" fill="#ffd66b" />
      </template>

      <!-- 自然风景：太阳、云、小山、树 -->
      <template v-else-if="art === 'landscape'">
        <g class="a-spin">
          <path :d="rays(124, 30, 15, 21, 10)" stroke="#ffd66b" stroke-width="3" stroke-linecap="round" />
        </g>
        <circle cx="124" cy="30" r="11" fill="#ffd66b" />
        <g class="a-drift">
          <ellipse cx="40" cy="30" rx="15" ry="6.5" fill="#fff" />
          <ellipse cx="50" cy="26" rx="9" ry="7" fill="#fff" />
        </g>
        <g class="a-fly">
          <path d="M70 24q3-3 6 0q3-3 6 0" stroke="#2a2d4f" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".7" />
          <path d="M86 32q2-2 4 0q2-2 4 0" stroke="#2a2d4f" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".6" />
        </g>
        <path d="M0 84q36-30 76-10t84-12v58H0z" fill="#a6e4bf" />
        <path d="M0 98q46-20 92 0t68-8v30H0z" fill="#6fcf97" />
        <ellipse cx="118" cy="108" rx="17" ry="5" fill="#a8d8ff" />
        <path d="M108 107h9M121 109.5h6" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".8" />
        <g class="a-sway-up">
          <rect x="28" y="80" width="3" height="9" fill="#8a6a4a" />
          <path d="M29.5 62l9 20h-18z" fill="#3fae74" />
        </g>
        <g class="a-sway-up d2">
          <rect x="43" y="80" width="3" height="8" fill="#8a6a4a" />
          <path d="M44.5 68l7 14h-14z" fill="#4fbf86" />
        </g>
        <circle cx="68" cy="106" r="2.2" fill="#ffb3c7" />
        <circle cx="76" cy="110" r="2" fill="#ffd66b" />
        <circle cx="128" cy="106" r="2.2" fill="#fff" />
      </template>

      <!-- 场景环境：温馨小屋一角 -->
      <template v-else-if="art === 'scene'">
        <rect x="8" y="94" width="144" height="18" rx="5" fill="#f1dfc6" />
        <rect x="24" y="22" width="44" height="40" rx="5" fill="#cfe8ff" />
        <circle class="a-pulse" cx="56" cy="33" r="5" fill="#ffd66b" />
        <path d="M46 22v40M24 42h44" stroke="#fff" stroke-width="3" />
        <rect x="24" y="22" width="44" height="40" rx="5" fill="none" stroke="#fff" stroke-width="3" />
        <path d="M20 18h12c-2 14-2 30 2 46H20z" fill="#ffb3c7" />
        <path d="M72 18H60c2 14 2 30-2 46h14z" fill="#ffb3c7" />
        <rect x="17" y="15" width="58" height="4" rx="2" fill="#c9a77f" />
        <g class="a-sway-up">
          <ellipse cx="38" cy="80" rx="4" ry="9" fill="#6fcf97" transform="rotate(-25 38 80)" />
          <ellipse cx="46" cy="78" rx="4" ry="10" fill="#4fbf86" />
          <ellipse cx="53" cy="81" rx="4" ry="9" fill="#6fcf97" transform="rotate(25 53 81)" />
        </g>
        <path d="M36 86h20l-3 10H39z" fill="#ff8f73" />
        <rect x="68" y="60" width="60" height="20" rx="8" fill="#b3a7ff" />
        <rect x="62" y="72" width="72" height="18" rx="8" fill="#9b8cff" />
        <rect x="60" y="66" width="12" height="24" rx="6" fill="#8b7cf6" />
        <rect x="124" y="66" width="12" height="24" rx="6" fill="#8b7cf6" />
        <rect x="76" y="64" width="18" height="12" rx="5" fill="#ffd9a8" />
        <rect x="68" y="90" width="4" height="6" fill="#7a6ad8" />
        <rect x="124" y="90" width="4" height="6" fill="#7a6ad8" />
        <circle class="a-pulse d2" cx="146" cy="38" r="14" fill="#fff3b0" />
        <path d="M146 44v50" stroke="#2a2d4f" stroke-width="2.4" />
        <path d="M139 30h14l4 14h-22z" fill="#ffd66b" />
        <rect x="140" y="92" width="12" height="4" rx="2" fill="#2a2d4f" />
      </template>

      <!-- 科幻机械：小机器人 + 星球 -->
      <template v-else-if="art === 'robot'">
        <circle cx="128" cy="32" r="11" fill="#ffd66b" />
        <ellipse cx="128" cy="32" rx="19" ry="5" fill="none" stroke="#ff9fbf" stroke-width="2.2" transform="rotate(-18 128 32)" />
        <path class="a-twinkle" :d="star(30, 34, 5)" fill="#fff" />
        <path class="a-twinkle d2" :d="star(38, 84, 4)" fill="#9b8cff" />
        <path class="a-twinkle d3" :d="star(138, 80, 4)" fill="#fff" />
        <ellipse cx="80" cy="107" rx="22" ry="3.5" fill="#2a2d4f" opacity=".08" />
        <g class="a-float">
          <path d="M80 30V21" stroke="#2a2d4f" stroke-width="2" />
          <circle class="a-pulse" cx="80" cy="18" r="4" fill="#ff6b6b" />
          <rect x="56" y="40" width="5" height="12" rx="2" fill="#9aa8f5" />
          <rect x="99" y="40" width="5" height="12" rx="2" fill="#9aa8f5" />
          <rect x="60" y="30" width="40" height="32" rx="11" fill="#eef1ff" stroke="#b8c4ff" stroke-width="2" />
          <rect x="65" y="36" width="30" height="20" rx="7" fill="#2a2d4f" />
          <g class="a-blink">
            <circle cx="73.5" cy="45" r="3.4" fill="#8fe3ff" />
            <circle cx="86.5" cy="45" r="3.4" fill="#8fe3ff" />
          </g>
          <path d="M76 51q4 2.5 8 0" stroke="#8fe3ff" stroke-width="1.6" fill="none" stroke-linecap="round" />
          <path d="M64 70l-9 9" stroke="#b8c4ff" stroke-width="6" stroke-linecap="round" />
          <path d="M96 70l9-7" stroke="#b8c4ff" stroke-width="6" stroke-linecap="round" />
          <rect x="64" y="64" width="32" height="28" rx="9" fill="#b8c4ff" />
          <circle class="a-pulse d2" cx="80" cy="77" r="4.5" fill="#8fe3c0" />
          <rect x="68" y="92" width="8" height="9" rx="2.5" fill="#2a2d4f" />
          <rect x="84" y="92" width="8" height="9" rx="2.5" fill="#2a2d4f" />
        </g>
      </template>

      <!-- 绘本分镜：翻开的绘本，页上有分镜格 -->
      <template v-else-if="art === 'book'">
        <path class="a-twinkle" :d="star(80, 20, 7)" fill="#ffd66b" />
        <path class="a-twinkle d2" :d="star(34, 22, 4)" fill="#fff" />
        <g class="a-float2">
          <path d="M128 12a10 10 0 1 0 8 16 8 8 0 1 1-8-16z" fill="#ffe08a" />
        </g>
        <ellipse cx="80" cy="106" rx="54" ry="3.5" fill="#2a2d4f" opacity=".08" />
        <g class="a-float">
          <path d="M22 40v56c20-6 40-6 58 4 18-10 38-10 58-4V40z" fill="#9b8cff" />
          <path d="M80 38c-16-8-36-8-54-2v54c18-6 38-6 54 2z" fill="#fff" />
          <path d="M80 38c16-8 36-8 54-2v54c-18-6-38-6-54 2z" fill="#fffaf2" />
          <path d="M80 38v54" stroke="#e5ddff" stroke-width="1.5" />
          <rect x="33" y="44" width="19" height="15" rx="2.5" fill="#ffd9c2" />
          <rect x="55" y="45" width="19" height="14" rx="2.5" fill="#cde9ff" />
          <rect x="33" y="62" width="41" height="20" rx="2.5" fill="#dff5e8" />
          <circle cx="44" cy="73" r="4" fill="#6fcf97" />
          <path d="M57 80l6-8 6 8z" fill="#8fd6b0" />
          <rect x="86" y="44" width="40" height="22" rx="2.5" fill="#efe9ff" />
          <circle cx="98" cy="55" r="5" fill="#ffd66b" />
          <path d="M106 64l7-9 7 9z" fill="#b3a7ff" />
          <rect x="86" y="71" width="34" height="3.5" rx="1.75" fill="#e3e5f0" />
          <rect x="86" y="78" width="26" height="3.5" rx="1.75" fill="#e3e5f0" />
        </g>
      </template>

      <!-- 动物宠物：趴在台子上的小猫 -->
      <template v-else-if="art === 'animal'">
        <g class="a-peek">
          <g class="a-ear">
            <path d="M52 56 57 28 76 46z" fill="#ffb86b" />
            <path d="M56 50l3-14 9 9z" fill="#ffd9b0" />
          </g>
          <g class="a-ear d2">
            <path d="M108 56 103 28 84 46z" fill="#ffb86b" />
            <path d="M104 50l-3-14-9 9z" fill="#ffd9b0" />
          </g>
          <ellipse cx="80" cy="68" rx="32" ry="26" fill="#ffb86b" />
          <path d="M74 44q6 4 12 0M72 50q8 4 16 0" stroke="#f29a45" stroke-width="2.4" fill="none" stroke-linecap="round" />
          <g class="a-blink">
            <ellipse cx="68" cy="66" rx="4" ry="5" fill="#2a2d4f" />
            <ellipse cx="92" cy="66" rx="4" ry="5" fill="#2a2d4f" />
            <circle cx="69.4" cy="64" r="1.4" fill="#fff" />
            <circle cx="93.4" cy="64" r="1.4" fill="#fff" />
          </g>
          <path d="M77 74h6l-3 3.5z" fill="#ff8fa3" />
          <path d="M74 79q3 3 6 0q3 3 6 0" stroke="#2a2d4f" stroke-width="1.6" fill="none" stroke-linecap="round" />
          <path d="M48 72h12M48 78l12-2M112 72h-12M112 78l-12-2" stroke="#2a2d4f" stroke-width="1.2" stroke-linecap="round" opacity=".5" />
          <ellipse cx="61" cy="76" rx="5" ry="3" fill="#ff9fbf" opacity=".55" />
          <ellipse cx="99" cy="76" rx="5" ry="3" fill="#ff9fbf" opacity=".55" />
        </g>
        <rect x="22" y="90" width="116" height="16" rx="7" fill="#fff" />
        <ellipse cx="62" cy="91" rx="9" ry="6" fill="#ffc78f" />
        <ellipse cx="98" cy="91" rx="9" ry="6" fill="#ffc78f" />
        <path class="a-twinkle" d="M132 42c-3-2.5-5-4-5-6.5a2.5 2.5 0 0 1 5-1 2.5 2.5 0 0 1 5 1c0 2.5-2 4-5 6.5z" fill="#ff8fa3" />
        <path class="a-twinkle d2" d="M28 54c-2.4-2-4-3.2-4-5.2a2 2 0 0 1 4-.8 2 2 0 0 1 4 .8c0 2-1.6 3.2-4 5.2z" fill="#ffb3c7" />
      </template>

      <!-- 美食甜品：纸杯蛋糕 -->
      <template v-else-if="art === 'food'">
        <ellipse cx="80" cy="106" rx="28" ry="3.5" fill="#2a2d4f" opacity=".08" />
        <g class="a-float">
          <path d="M55 70h50l-7 33H62z" fill="#ff9fbf" />
          <path d="M65 70l3 33M75 70l1.5 33M85 70l-1.5 33M95 70l-3 33" stroke="#ff7fa8" stroke-width="2" />
          <path d="M50 72c-2-10 6-17 14-16 1-10 11-15 18-12 6-7 19-4 21 6 9 1 12 10 7 22z" fill="#fff6fb" />
          <path d="M55 66c6 3 12 3 18 0M80 60c5 3 11 3 16 0" stroke="#ffd1e3" stroke-width="2" fill="none" stroke-linecap="round" />
          <rect x="60" y="57" width="5" height="2.4" rx="1.2" fill="#9b8cff" transform="rotate(30 62.5 58.2)" />
          <rect x="92" y="54" width="5" height="2.4" rx="1.2" fill="#6fcf97" transform="rotate(-30 94.5 55.2)" />
          <rect x="72" y="62" width="5" height="2.4" rx="1.2" fill="#ffc94d" transform="rotate(-15 74.5 63.2)" />
          <rect x="99" y="64" width="5" height="2.4" rx="1.2" fill="#6c9cff" transform="rotate(40 101.5 65.2)" />
          <path d="M82 40q2-8 8-10" stroke="#5aa86e" stroke-width="2" fill="none" stroke-linecap="round" />
          <circle cx="82" cy="44" r="6.5" fill="#ff5a6e" />
          <circle cx="80" cy="42" r="1.8" fill="#fff" opacity=".8" />
        </g>
        <path class="a-twinkle" :d="star(124, 36, 5)" fill="#ffd66b" />
        <path class="a-twinkle d2" :d="star(34, 46, 4)" fill="#fff" />
        <path class="a-twinkle d3" :d="star(130, 84, 4)" fill="#ff9fbf" />
      </template>

      <!-- 其它玩法：调色盘 + 画笔 -->
      <template v-else>
        <ellipse cx="80" cy="104" rx="44" ry="3.5" fill="#2a2d4f" opacity=".08" />
        <path d="M80 26c-30 0-50 19-50 40 0 17 13 28 28 28 8 0 11-6 11-11 0-6 5-10 12-10h7c15 0 23-9 23-21 0-15-13-26-31-26z" fill="#fff" />
        <circle cx="58" cy="76" r="6" fill="#f1edff" />
        <circle class="a-twinkle" cx="54" cy="54" r="6" fill="#ff8f73" />
        <circle class="a-twinkle d2" cx="70" cy="40" r="6" fill="#ffd66b" />
        <circle class="a-twinkle d3" cx="90" cy="40" r="6" fill="#8fe3c0" />
        <circle class="a-twinkle d4" cx="103" cy="55" r="6" fill="#9b8cff" />
        <g class="a-brush">
          <path d="M136 98 116 66" stroke="#c49a6c" stroke-width="6" stroke-linecap="round" />
          <path d="M117 67l-4-6" stroke="#b8bccf" stroke-width="7" />
          <path d="M113 61c-3-5-4-10-2-14 4 2 6 7 6 12z" fill="#6c5ce7" />
        </g>
        <path class="a-twinkle d2" :d="star(28, 30, 5)" fill="#fff" />
        <path class="a-twinkle d3" :d="star(134, 30, 5)" fill="#ffd66b" />
      </template>
    </svg>
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: { type: String, default: '' },
  category: { type: String, default: '' },
  /** 直接指定插画（不按名称猜） */
  kind: { type: String, default: '' },
})

// 先看玩法名称，再看分类名；顺序有讲究：「节日海报」算节日、「动漫人物」算动漫
const RULES = [
  ['anime', /动漫|二次元|卡通|Q版|萌系/i],
  ['festival', /节日|新年|春节|中秋|圣诞|生日|庆祝|元宵|端午|国庆/],
  ['character', /人物|角色|形象|头像|IP|自画像/i],
  ['ad', /广告|海报|宣传|招贴|营销|传单|促销/],
  ['brand', /品牌|包装|产品|logo|标志|礼盒|文创|商标/i],
  ['castle', /建筑|城堡|宫殿|房子|城市|梦幻|小镇/],
  ['landscape', /风景|自然|山水|森林|花园|田野|海边|四季|天空/],
  ['scene', /场景|环境|室内|房间|空间|街道|家居/],
  ['robot', /科幻|机械|机器人|太空|宇宙|未来|星球|赛博|宇航/],
  ['book', /绘本|分镜|故事|连环画|漫画|童话/],
  ['animal', /动物|宠物|猫|狗|兔|熊|鸟|鱼|恐龙/],
  ['food', /美食|甜品|蛋糕|食物|水果|饮品|奶茶|零食/],
]
function pick(text) {
  const value = String(text || '')
  if (!value) return ''
  const hit = RULES.find(([, re]) => re.test(value))
  return hit ? hit[0] : ''
}
const KINDS = new Set(RULES.map(([name]) => name))
const art = computed(() => (KINDS.has(props.kind) ? props.kind : '') || pick(props.title) || pick(props.category) || 'paint')

// 每张卡的动画错开一点，一排卡片不会整齐划一地动
const delay = computed(() => {
  let hash = 0
  for (const ch of props.title || props.category) hash = (hash * 31 + ch.charCodeAt(0)) % 997
  return `${((hash % 9) * 0.31).toFixed(2)}s`
})

const f = (n) => Number(n.toFixed(1))
/** 四角星 */
function star(x, y, r) {
  const a = f(r * 0.27)
  const b = f(r * 0.73)
  return `M${x} ${f(y - r)}l${a} ${b} ${b} ${a}-${b} ${a}-${a} ${b}-${a}-${b}-${b}-${a} ${b}-${a}z`
}
/** 放射线（太阳光、烟花） */
function rays(cx, cy, r1, r2, n) {
  let d = ''
  for (let i = 0; i < n; i += 1) {
    const t = (Math.PI * 2 * i) / n - Math.PI / 2
    d += `M${f(cx + Math.cos(t) * r1)} ${f(cy + Math.sin(t) * r1)}L${f(cx + Math.cos(t) * r2)} ${f(cy + Math.sin(t) * r2)}`
  }
  return d
}
/** 爆炸星（广告角标） */
function burst(cx, cy, R, r, n) {
  let d = ''
  for (let i = 0; i < n * 2; i += 1) {
    const t = (Math.PI * i) / n - Math.PI / 2
    const radius = i % 2 ? r : R
    d += `${i ? 'L' : 'M'}${f(cx + Math.cos(t) * radius)} ${f(cy + Math.sin(t) * radius)}`
  }
  return `${d}z`
}
</script>

<style scoped>
.sca { --d: 0s; position: relative; display: block; width: 100%; height: 100%; overflow: hidden; }
.sca__svg { display: block; width: 100%; height: 100%; }

.sca--anime { background: linear-gradient(135deg, #ffe3ef, #efe6ff); }
.sca--character { background: linear-gradient(135deg, #dff0ff, #efe9ff); }
.sca--festival { background: linear-gradient(135deg, #ffe4dc, #fff2c9); }
.sca--ad { background: linear-gradient(135deg, #fff0d6, #ffe0e6); }
.sca--brand { background: linear-gradient(135deg, #e6f8ef, #fff1dc); }
.sca--castle { background: linear-gradient(135deg, #e8e4ff, #ffe6f2); }
.sca--landscape { background: linear-gradient(180deg, #dcefff, #eefbf2); }
.sca--scene { background: linear-gradient(135deg, #fff3e0, #e6f2ff); }
.sca--robot { background: linear-gradient(135deg, #e1eaff, #e3fbff); }
.sca--book { background: linear-gradient(135deg, #fff0d9, #ebe7ff); }
.sca--animal { background: linear-gradient(135deg, #fff0dc, #ffe6ee); }
.sca--food { background: linear-gradient(135deg, #ffe7f0, #fff5d9); }
.sca--paint { background: linear-gradient(135deg, #efeaff, #ffe9dc); }

/* 只给会动的元素设 fill-box；带 transform 属性的元素都包在组里，不受影响 */
.a-float, .a-float2, .a-peek, .a-blink, .a-twinkle, .a-drift, .a-spin, .a-sway, .a-sway-up,
.a-wave, .a-wiggle, .a-brush, .a-pulse, .a-pop, .a-hop, .a-flag, .a-ear, .a-fly, .a-burst { transform-box: fill-box; }

.a-float { transform-origin: center; animation: scaFloat 4.2s ease-in-out var(--d) infinite; }
.a-float2 { transform-origin: center; animation: scaFloat 5.6s ease-in-out calc(var(--d) + 1.2s) infinite; }
.a-peek { animation: scaPeek 4.6s ease-in-out var(--d) infinite; }
.a-blink { transform-origin: center; animation: scaBlink 5s linear calc(var(--d) + 0.6s) infinite; }
.a-twinkle { transform-origin: center; animation: scaTwinkle 2.8s ease-in-out var(--d) infinite; }
.a-twinkle.d2 { animation-delay: calc(var(--d) + 0.9s); }
.a-twinkle.d3 { animation-delay: calc(var(--d) + 1.8s); }
.a-twinkle.d4 { animation-delay: calc(var(--d) + 2.3s); }
.a-drift { animation: scaDrift 9s ease-in-out var(--d) infinite; }
.a-drift.d2 { animation-duration: 11s; animation-direction: reverse; }
.a-spin { transform-origin: center; animation: scaSpin 18s linear infinite; }
.a-sway { transform-origin: 50% 0%; animation: scaSway 3.6s ease-in-out var(--d) infinite; }
.a-sway.d2 { animation-duration: 4.2s; animation-delay: calc(var(--d) + 1.1s); }
.a-sway-up { transform-origin: 50% 100%; animation: scaSway 4.4s ease-in-out var(--d) infinite; }
.a-sway-up.d2 { animation-delay: calc(var(--d) + 0.8s); }
.a-wave { transform-origin: 0% 100%; animation: scaWave 1.8s ease-in-out var(--d) infinite; }
.a-wiggle { transform-origin: 0% 50%; animation: scaWiggle 2.2s ease-in-out var(--d) infinite; }
.a-brush { transform-origin: 100% 100%; animation: scaWiggle 3s ease-in-out var(--d) infinite; }
.a-pulse { animation: scaPulse 2.2s ease-in-out var(--d) infinite; }
.a-pulse.d2 { animation-delay: calc(var(--d) + 1s); }
.a-pop { transform-origin: center; animation: scaPop 2.6s ease-out var(--d) infinite; }
.a-pop.d2 { animation-delay: calc(var(--d) + 0.9s); }
.a-pop.d3 { animation-delay: calc(var(--d) + 1.7s); }
.a-hop { transform-origin: 50% 100%; animation: scaHop 3s ease-in-out var(--d) infinite; }
.a-flag { transform-origin: 0% 50%; animation: scaFlag 1.4s ease-in-out var(--d) infinite; }
.a-flag.d2 { animation-delay: calc(var(--d) + 0.4s); }
.a-flag.d3 { animation-delay: calc(var(--d) + 0.8s); }
.a-ear { transform-origin: 50% 100%; animation: scaEar 4s ease-in-out var(--d) infinite; }
.a-ear.d2 { animation-delay: calc(var(--d) + 0.25s); }
.a-fly { animation: scaFly 6s ease-in-out var(--d) infinite; }
.a-burst { transform-origin: center; animation: scaBurst 3s ease-in-out var(--d) infinite; }

@keyframes scaFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
@keyframes scaPeek { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(2.5px); } }
@keyframes scaBlink { 0%, 90%, 100% { transform: scaleY(1); } 94% { transform: scaleY(0.1); } }
@keyframes scaTwinkle { 0%, 100% { opacity: 0.35; transform: scale(0.7); } 50% { opacity: 1; transform: scale(1.12); } }
@keyframes scaDrift { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(9px); } }
@keyframes scaSpin { to { transform: rotate(360deg); } }
@keyframes scaSway { 0%, 100% { transform: rotate(-5deg); } 50% { transform: rotate(5deg); } }
@keyframes scaWave { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-22deg); } }
@keyframes scaWiggle { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
@keyframes scaPulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
@keyframes scaPop {
  0% { opacity: 0; transform: scale(0.3); }
  25% { opacity: 1; }
  70% { opacity: 0.9; transform: scale(1.05); }
  100% { opacity: 0; transform: scale(1.15); }
}
@keyframes scaHop {
  0%, 70%, 100% { transform: translateY(0) rotate(0deg); }
  80% { transform: translateY(-4px) rotate(-3deg); }
  90% { transform: translateY(-1px) rotate(1deg); }
}
@keyframes scaFlag { 0%, 100% { transform: scaleX(1) skewY(0deg); } 50% { transform: scaleX(0.78) skewY(6deg); } }
@keyframes scaEar { 0%, 80%, 100% { transform: rotate(0deg); } 86% { transform: rotate(-9deg); } 92% { transform: rotate(4deg); } }
@keyframes scaFly { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(10px, -4px); } }
@keyframes scaBurst { 0%, 100% { transform: scale(1) rotate(0deg); } 50% { transform: scale(1.1) rotate(12deg); } }

@media (prefers-reduced-motion: reduce) {
  .sca * { animation: none !important; }
}
</style>
