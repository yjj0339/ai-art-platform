<template>
  <!-- AI 绘画（2026-11 重新设计）
       左：玩法 / 图标提示词（低龄）+ AI 小画师（高级）；右上：作品流（每次生成一组）；右下：输入区（参考图、提示词、模型/图像设置/风格/AI 优化/@、语音、发送）。
       顶栏右侧只放「语音播报开关」（版本在登录时选，进来后不能切）。输入区照客户稿：右侧竖排三个大按钮。所有生成、保存、引用、修图逻辑沿用原 script。 -->
  <main class="su-page su-page--fill paint" :class="{ 'is-young': isJuniorStarter, 'is-muted': muted }">
    <Teleport to="#su-topbar-actions" defer>
      <div class="paint-bar-tools">
        <button
          type="button"
          class="paint-voice"
          :class="{ 'is-off': muted }"
          :aria-pressed="!muted"
          :aria-label="muted ? '语音播报已关闭，点一下打开' : '语音播报已打开，点一下关闭'"
          @click="toggleMuted"
        >
          <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
            <path d="M3 8v4h3l4 3V5L6 8z" fill="currentColor" />
            <path v-if="!muted" d="M13 7.5a3.5 3.5 0 0 1 0 5M15.2 5.3a6.6 6.6 0 0 1 0 9.4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" />
            <path v-else d="M13.5 8l4 4m0-4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
          <span>{{ muted ? '已静音' : '语音播报' }}</span>
        </button>
      </div>
    </Teleport>

    <div class="paint-layout">
      <!-- ===== 左侧 ===== -->
      <aside class="paint-side su-panel" :aria-label="isJuniorStarter ? '画画小工具' : '技能玩法'">
        <div v-if="isJuniorStarter" class="su-seg paint-side__tabs" role="tablist" aria-label="切换">
          <button type="button" role="tab" :aria-selected="youngSidebarMode === 'prompt-library'" @click="openYoungSidebar('prompt-library')">图标提示词</button>
          <button type="button" role="tab" :aria-selected="youngSidebarMode === 'workflow'" @click="openYoungSidebar('workflow')">技能玩法</button>
        </div>
        <header v-else class="paint-side__head">
          <h2>技能玩法</h2>
          <small>点一张卡片开始</small>
        </header>

        <!-- 低龄：图标提示词 -->
        <div v-if="isJuniorStarter && youngSidebarMode === 'prompt-library'" class="paint-icons">
          <p v-if="youngPromptLoading" class="paint-note">正在读取提示词库…</p>
          <p v-else-if="youngPromptLoadError" class="paint-note is-warn">提示词库暂时连不上，先用默认的图标。</p>
          <nav v-if="visibleYoungPromptGroups.length" class="paint-icons__cats" aria-label="提示词分类">
            <button
              v-for="group in visibleYoungPromptGroups"
              :key="group.id"
              type="button"
              class="paint-icons__cat"
              :class="{ 'is-active': selectedYoungPromptCategoryId === group.id }"
              :aria-pressed="selectedYoungPromptCategoryId === group.id"
              @click="selectYoungPromptCategory(group.id)"
            >
              <span class="paint-icons__cat-icon" aria-hidden="true">
                <img v-if="group.iconImageUrl" :src="group.iconImageUrl" alt="" />
                <template v-else>{{ group.icon || '✨' }}</template>
              </span>
              <span>{{ group.title }}</span>
            </button>
          </nav>
          <div v-if="activeYoungPromptGroup" class="paint-icons__grid su-scroll" :aria-label="activeYoungPromptGroup.title">
            <button
              v-for="item in activeYoungPromptGroup.items"
              :key="item.id"
              type="button"
              class="paint-icon"
              :class="{ 'is-on': selectedYoungPromptIds.includes(item.id) }"
              :aria-pressed="selectedYoungPromptIds.includes(item.id)"
              :title="item.label"
              @click="toggleYoungPrompt(item)"
            >
              <span class="paint-icon__art" aria-hidden="true">
                <img v-if="item.iconImageUrl" :src="item.iconImageUrl" alt="" />
                <template v-else>{{ item.icon }}</template>
              </span>
              <span class="paint-icon__label">{{ item.label }}</span>
              <i v-if="selectedYoungPromptIds.includes(item.id)" class="paint-icon__check" aria-hidden="true">✓</i>
            </button>
          </div>
          <footer class="paint-icons__foot">
            <p>{{ selectedYoungPromptItems.length ? `已选：${selectedYoungPromptItems.map((item) => item.label).join('、')}` : '先点几个小图标，再按发送' }}</p>
            <button type="button" class="su-btn su-btn--sm su-btn--ghost" :disabled="!selectedYoungPromptItems.length" @click="clearYoungPrompts">清空</button>
          </footer>
        </div>

        <!-- 技能玩法（分类由后台「技能包列表」建立，这里只筛选） -->
        <div v-else class="paint-skills">
          <nav v-if="workflowCategoryTabs.length > 1" class="paint-skills__cats" aria-label="技能分类">
            <button
              v-for="tab in workflowCategoryTabs"
              :key="tab.id"
              type="button"
              class="su-chip"
              :aria-pressed="selectedWorkflowCategoryId === tab.id"
              @click="selectedWorkflowCategoryId = tab.id"
            >{{ tab.name }}<small>{{ tab.count }}</small></button>
          </nav>
          <div class="paint-skills__grid su-scroll">
            <button
              v-for="workflow in visibleCreativeWorkflows"
              :key="workflow.id"
              type="button"
              class="paint-skill"
              :class="{ 'is-active': activeWorkflowId === workflow.id }"
              :title="workflow.short"
              @click="openWorkflowCard(workflow)"
            >
              <span class="paint-skill__cover" :style="workflowCoverStyle(workflow)" aria-hidden="true">
                <SkillCoverArt v-if="!workflowCoverUrl(workflow)" :title="workflow.title" :category="workflow.categoryName || ''" />
              </span>
              <strong>{{ workflow.title }}</strong>
            </button>
            <p v-if="!visibleCreativeWorkflows.length" class="paint-note">这个分类下还没有玩法</p>
          </div>
        </div>

        <button v-if="isJuniorStarter" type="button" class="su-btn su-btn--soft su-btn--block paint-side__report" @click="openDerivativePage('/student/h5-report')">
          把作品做成项目报告
        </button>
        <!-- 高级版：AI 小画师。点它说话，它把想法整理成画得出来的描述并直接出图 -->
        <StudentAgentDock
          v-else
          id="agentDock"
          ref="agentDockRef"
          class="paint-agent"
          page="paint"
          page-label="AI 绘画"
          variant="inline"
          prompt-only
          :agent-mode="agentMode"
          :busy="hasActiveImageGenerationJobs"
          :samples="agentPaintSamples"
          :links="agentQuickLinks"
          :canvas-context="agentCanvasContext"
          @mode-change="setAgentMode"
          @link="handleAgentQuickLink"
        />
      </aside>

      <!-- ===== 右侧：作品流 + 输入区 ===== -->
      <section class="paint-main">
        <div class="paint-stream su-scroll" :class="ratioClass" aria-live="polite">
          <template v-if="project.versions.length || imageGenerationJobs.length">
            <article v-for="batch in generationBatches" :key="batch.id" class="paint-batch">
              <header class="paint-batch__head">
                <span class="paint-batch__swatch" :style="{ background: batch.thumbnail }" aria-hidden="true" />
                <div class="paint-batch__copy">
                  <p class="paint-batch__prompt">{{ batch.prompt }}</p>
                  <p class="paint-batch__meta">
                    <span>{{ batch.model }}</span>
                    <span>{{ batch.ratio }}</span>
                    <span>{{ batch.quality }}</span>
                    <span>{{ batch.versions.length }} 张</span>
                    <span>{{ batch.createdAt }}</span>
                  </p>
                </div>
                <div class="paint-batch__actions">
                  <button type="button" class="paint-mini" :disabled="!batch.versions[0]" data-reference-keep="1" @click="referenceBatchArtwork(batch.versions[0])">
                    <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 14.5z" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="m4.5 13 3.5-3.5 2.5 2.5 2-2 3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><circle cx="12.5" cy="7.5" r="1.3" fill="currentColor" /></svg>
                    引用
                  </button>
                  <button type="button" class="paint-mini" :disabled="!batch.versions[0]" @click="createVersionVariant('再次生成', batch.versions[0]?.id)">
                    <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M15.5 9.5a5.5 5.5 0 1 1-1.6-3.9M15.5 4v3.5H12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
                    再画一组
                  </button>
                  <el-dropdown trigger="click" placement="bottom-end" :disabled="!batch.versions.length" popper-class="su-pop su-me-pop" @command="handleBatchMoreCommand">
                    <button type="button" class="paint-mini paint-mini--icon" aria-label="更多操作">
                      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="5" cy="10" r="1.6" fill="currentColor" /><circle cx="10" cy="10" r="1.6" fill="currentColor" /><circle cx="15" cy="10" r="1.6" fill="currentColor" /></svg>
                    </button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item :command="{ action: 'edit', batchId: batch.id }">修图</el-dropdown-item>
                        <el-dropdown-item :command="{ action: 'save', batchId: batch.id }">下载 / 保存</el-dropdown-item>
                        <el-dropdown-item :command="{ action: 'delete', batchId: batch.id }" divided>删除这一组</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </header>
              <div class="paint-batch__images" :class="`count-${Math.min(batch.versions.length, 4)}`">
                <button
                  v-for="version in batch.versions"
                  :key="version.id"
                  type="button"
                  class="paint-art"
                  :class="{ 'is-selected': selectedVersion?.id === version.id, 'is-final': project.finalVersionId === version.id }"
                  :style="getArtworkFrameStyle(version)"
                  :aria-label="`查看和编辑：${project.finalVersionId === version.id ? '终稿' : version.title}`"
                  @click="openImageEditor(version.id)"
                >
                  <img v-if="getArtworkImageUrl(version)" :src="getArtworkImageUrl(version)" alt="" @load="rememberArtworkNaturalRatio(version, $event)" />
                  <span class="paint-art__tag">{{ project.finalVersionId === version.id ? '终稿' : version.title }}</span>
                </button>
              </div>
            </article>

            <article v-for="job in imageGenerationJobs" :key="job.id" class="paint-batch is-pending" :class="{ 'is-failed': job.status === 'failed' }">
              <header class="paint-batch__head">
                <span class="paint-batch__swatch is-ai" aria-hidden="true">AI</span>
                <div class="paint-batch__copy">
                  <p class="paint-batch__prompt">{{ job.prompt }}</p>
                  <p class="paint-batch__meta">
                    <span>{{ job.model }}</span>
                    <span>{{ job.ratio }}</span>
                    <span>{{ job.quality }}</span>
                    <span>{{ job.count }} 张</span>
                  </p>
                </div>
                <span class="su-badge" :class="job.status === 'failed' ? 'su-badge--err' : 'su-badge--accent'">
                  {{ job.status === 'queued' ? '排队中' : job.status === 'failed' ? '没画成' : '正在画' }}
                </span>
              </header>
              <div v-if="job.status !== 'failed'" class="paint-batch__images" :class="`count-${job.count}`" aria-label="AI 正在画">
                <div v-for="slot in job.count" :key="slot" class="paint-art is-waiting" :style="getWaitingPreviewStyle(job.ratio)">
                  <span v-if="slot === 1" class="paint-art__wait">
                    <i aria-hidden="true" />{{ job.status === 'queued' ? '等一下，马上轮到你' : 'AI 正在画…' }}
                  </span>
                </div>
              </div>
              <div v-else class="paint-fail">
                <p>{{ job.error || '这一组没有画出来，可以再试一次。' }}</p>
                <div>
                  <button type="button" class="su-btn su-btn--sm su-btn--primary" @click="retryImageGeneration(job.id)">再试一次</button>
                  <button type="button" class="su-btn su-btn--sm" @click="dismissImageGeneration(job.id)">关闭</button>
                </div>
              </div>
            </article>
          </template>

          <div v-else-if="generationStatus === 'error'" class="paint-empty is-error">
            <span class="paint-empty__mark" aria-hidden="true">!</span>
            <strong>这次没画成</strong>
            <p>{{ generationError }}</p>
            <button type="button" class="su-btn su-btn--primary" @click="generate">重新生成</button>
          </div>

          <div v-else class="paint-empty">
            <span class="paint-empty__mark" aria-hidden="true">
              <svg viewBox="0 0 48 48" width="34" height="34"><path d="M10 38c6 0 9-3 9-8a5 5 0 0 0-10 0c0 3-2 5-4 6 1 1 3 2 5 2z" fill="currentColor" opacity=".9" /><path d="M21 27 38 10a3 3 0 0 1 4 4L25 31" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </span>
            <strong>{{ isJuniorStarter ? '想画什么？点左边的小图标，或者说给 AI 听' : '想画什么？写下来或者说出来' }}</strong>
            <ol class="paint-empty__steps">
              <li><b>1</b>在下面写想法，或按「语音」直接说</li>
              <li><b>2</b>可以加一张参考图，或扫描纸上的草图</li>
              <li><b>3</b>按「发送」，AI 帮你画出来</li>
            </ol>
          </div>
        </div>

        <!-- ===== 输入区 ===== -->
        <section class="paint-composer su-panel" :class="{ 'is-agent': agentMode }">
          <div v-if="referenceStackExpanded && project.referenceImages?.length" class="reference-strip paint-refs">
            <article v-for="item in project.referenceImages" :key="item.id" class="paint-refs__item">
              <button type="button" class="paint-refs__img" :aria-label="`编辑参考图 ${item.name || ''}`" @click="openReferenceEditor(item.id)">
                <img :src="item.preview" :alt="item.name || '参考图'" />
              </button>
              <button type="button" class="paint-refs__remove" aria-label="删除这张参考图" @click.stop="removeReferenceImage(item.id, { silent: true })">×</button>
            </article>
          </div>

          <div class="paint-composer__grid">
          <div class="paint-composer__row">
            <div class="reference-stack-shell paint-ref" :class="{ 'is-open': referenceStackExpanded, 'is-empty': !project.referenceImages?.length }">
              <button
                type="button"
                class="paint-ref__card"
                :class="{ 'has-images': project.referenceImages?.length }"
                :aria-label="project.referenceImages?.length ? `参考图 ${project.referenceImages.length} 张，点开查看` : '添加参考图'"
                @click="handleReferenceStackClick"
              >
                <template v-if="project.referenceImages?.length">
                  <span v-for="(item, index) in referenceStackPreviewItems" :key="item.id" class="paint-ref__stack" :class="`is-${index + 1}`">
                    <img :src="item.preview" :alt="item.name || '参考图'" />
                  </span>
                  <b>{{ project.referenceImages.length }}</b>
                </template>
                <template v-else>
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.7" /><path d="m6 16 4-4 3 3 2-2 3 3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" /><path d="M18 2v5m-2.5-2.5h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /></svg>
                  <span>参考图</span>
                </template>
              </button>
              <button v-if="project.referenceImages?.length" type="button" class="paint-ref__add" aria-label="再加一张参考图" @click.stop="toggleReferenceMenu">+</button>
              <div v-if="showReferenceMenu" class="paint-pop paint-ref__menu" role="menu">
                <button type="button" role="menuitem" @click="chooseReferenceSource('scan')">
                  <strong>扫描草图</strong><small>用摄像头拍纸上的画</small>
                </button>
                <button type="button" role="menuitem" @click="chooseReferenceSource('album')">
                  <strong>本地图片</strong><small>从相册或电脑里选</small>
                </button>
                <button type="button" role="menuitem" @click="chooseReferenceSource('library')">
                  <strong>素材库</strong><small>我的素材、作品广场</small>
                </button>
              </div>
            </div>

            <div class="prompt-composer paint-prompt" :class="{ 'is-agent-mode': agentMode }">
              <span v-if="agentMode" class="paint-prompt__agent">说给 AI 伙伴听</span>
              <div
                ref="promptInputRef"
                class="pro-prompt-textarea paint-prompt__editor su-scroll"
                contenteditable="true"
                role="textbox"
                aria-multiline="true"
                aria-label="想画什么"
                :data-placeholder="agentMode ? '跟 AI 伙伴说：想画什么，我帮你理成画得出来的描述' : '写下你想画的画面，比如：一只戴着草帽的小猫在海边放风筝'"
                @click="handlePromptEditorClick"
                @focus="handlePromptEditorFocus"
                @input="handlePromptEditorInput"
                @keyup="savePromptSelection"
                @mouseup="savePromptSelection"
                @paste="handlePromptEditorPaste"
              />
            </div>
          </div>
          <input ref="localReferenceInput" class="paint-file" type="file" accept="image/*" multiple @change="handleLocalReferenceFile" />
          <input ref="mentionImageInput" class="paint-file" type="file" accept="image/*" multiple @change="handleMentionImageFile" />

          <div class="paint-composer__bar">
            <div class="paint-chips">
              <div class="chip-menu-wrap">
                <button type="button" class="paint-chip" :class="{ 'is-open': activeChipMenu === 'model' }" :title="`模型：${selectedModel.label}`" @click="toggleChipMenu('model')">
                  <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M10 2.5 16.5 6v8L10 17.5 3.5 14V6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><path d="M3.8 6.2 10 9.6l6.2-3.4M10 9.6v7.6" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
                  <span class="paint-chip__text">{{ selectedModel.label }}</span>
                </button>
                <div v-if="activeChipMenu === 'model'" class="paint-pop paint-pop--list" role="menu">
                  <p class="paint-pop__title">用哪个模型画</p>
                  <button v-for="item in availableAiModels" :key="item.id" type="button" role="menuitemradio" :aria-checked="form.modelId === item.id" :class="{ 'is-on': form.modelId === item.id }" @click="selectAiModel(item.id)">
                    <strong>{{ item.label }}</strong>
                    <small>{{ item.cost }} Token / 张</small>
                  </button>
                </div>
              </div>

              <div ref="imageSettingsRef" class="chip-menu-wrap" @keydown.esc.stop.prevent="closeImageSettings">
                <button
                  ref="imageSettingsButtonRef"
                  type="button"
                  class="paint-chip paint-chip--settings"
                  :class="{ 'is-open': activeChipMenu === 'imageSettings' }"
                  :aria-expanded="activeChipMenu === 'imageSettings'"
                  aria-controls="paint-image-settings"
                  :title="`${ratioLabel} · ${qualityLabel} · ${form.count}张`"
                  @click="toggleImageSettings"
                >
                  <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /><circle cx="7" cy="5.5" r="1.9" fill="#fff" stroke="currentColor" stroke-width="1.5" /><circle cx="13" cy="10" r="1.9" fill="#fff" stroke="currentColor" stroke-width="1.5" /><circle cx="8.5" cy="14.5" r="1.9" fill="#fff" stroke="currentColor" stroke-width="1.5" /></svg>
                  <span class="paint-chip__text">{{ ratioLabel }} · {{ qualityLabel }} · {{ form.count }}张</span>
                </button>
                <Teleport to="body">
                  <section
                    v-if="activeChipMenu === 'imageSettings'"
                    id="paint-image-settings"
                    ref="imageSettingsPanelRef"
                    class="paint-settings"
                    :style="imageSettingsPosition"
                    aria-label="图像设置"
                    @keydown.esc.stop.prevent="closeImageSettings"
                  >
                    <header><strong>图像设置</strong><button type="button" aria-label="关闭图像设置" @click="closeImageSettings">×</button></header>
                    <fieldset>
                      <legend>画面比例</legend>
                      <div class="paint-settings__opts is-ratios">
                        <button v-for="item in imageSettingsRatios" :key="item.value" type="button" :class="{ 'is-on': form.ratio === item.value }" :aria-pressed="form.ratio === item.value" @click="selectRatio(item.value)">
                          <span class="paint-settings__shape" :style="{ aspectRatio: item.aspect }" aria-hidden="true">{{ item.value === '自动' ? '✦' : '' }}</span>
                          <span>{{ item.label }}</span>
                        </button>
                      </div>
                    </fieldset>
                    <fieldset>
                      <legend>清晰度</legend>
                      <div class="paint-settings__opts">
                        <button v-for="item in qualityOptions" :key="item.value" type="button" :class="{ 'is-on': form.quality === item.value }" :aria-pressed="form.quality === item.value" @click="selectQuality(item.value)">{{ item.label }}</button>
                      </div>
                    </fieldset>
                    <fieldset>
                      <legend>一次画几张</legend>
                      <div class="paint-settings__opts">
                        <button v-for="count in countOptions" :key="count" type="button" :class="{ 'is-on': Number(form.count) === count }" :aria-pressed="Number(form.count) === count" @click="selectCount(count)">{{ count }} 张</button>
                      </div>
                    </fieldset>
                  </section>
                </Teleport>
              </div>

              <div class="chip-menu-wrap paint-style-wrap">
                <button type="button" class="paint-chip" :class="{ 'is-open': activeChipMenu === 'style' }" @click="toggleStyleMenu">
                  <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M10 3a7 7 0 1 0 0 14c1.2 0 1.8-.7 1.8-1.6 0-1.1-.9-1.4-.9-2.3 0-.8.6-1.4 1.5-1.4H14a3 3 0 0 0 3-3C17 5.6 13.9 3 10 3z" fill="none" stroke="currentColor" stroke-width="1.6" /><circle cx="6.5" cy="9" r="1.1" fill="currentColor" /><circle cx="9" cy="6.2" r="1.1" fill="currentColor" /><circle cx="12.6" cy="6.6" r="1.1" fill="currentColor" /></svg>
                  <span class="paint-chip__text">{{ styleIsNone ? '风格' : selectedStyle.label }}</span>
                </button>
                <div v-if="activeChipMenu === 'style'" class="paint-pop paint-styles" :class="`cols-${stylePanelColumns}`">
                  <header class="paint-styles__head">
                    <strong>{{ stylePanelTitle }}</strong>
                    <small>{{ styleCardItems.length }} 种<template v-if="styleHasRightMore"> · 左右滑动看更多</template></small>
                    <button type="button" class="su-chip" :aria-pressed="styleIsNone" @click="selectStylePreset('none')">不用风格</button>
                  </header>
                  <div v-if="styleGroupTabs.length > 2" class="paint-styles__groups">
                    <button v-for="group in styleGroupTabs" :key="group" type="button" class="su-chip" :aria-pressed="activeStyleGroupSafe === group" @click="activeStyleGroup = group">{{ group }}</button>
                  </div>
                  <div ref="styleCardScrollEl" class="paint-styles__scroll" :class="{ 'has-more': hasStyleOverflow }" @scroll.passive="onStyleScroll">
                    <div class="paint-styles__grid">
                      <button
                        v-for="item in visibleStyleOptions"
                        :key="item.value"
                        type="button"
                        class="paint-style"
                        :class="{ 'is-on': form.stylePreset === item.value }"
                        :title="item.prompt ? `${item.label}：${item.prompt}` : item.label"
                        @click="selectStylePreset(item.value)"
                      >
                        <span class="paint-style__cover">
                          <img v-if="item.coverImageUrl" :src="item.coverImageUrl" :alt="item.label" loading="lazy" />
                          <StyleSwatchArt v-else :label="item.label" :value="item.value" />
                        </span>
                        <span class="paint-style__name">{{ item.label }}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="!isJuniorStarter" class="chip-menu-wrap paint-optimize">
                <button type="button" class="paint-chip paint-chip--join" :class="{ 'is-busy': optimizing }" :disabled="optimizing" @click="optimizePromptFromChip">
                  <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="m10 2.5 1.6 4.4 4.4 1.6-4.4 1.6L10 14.5l-1.6-4.4L4 8.5l4.4-1.6zM15.5 13l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" fill="currentColor" /></svg>
                  <span class="paint-chip__text">{{ optimizing ? '正在优化…' : 'AI 优化' }}<small v-if="!optimizing" class="paint-chip__sub"> · {{ strengthLabel }}</small></span>
                </button>
                <button type="button" class="paint-chip paint-chip--caret" :class="{ 'is-open': activeChipMenu === 'optimize' }" :disabled="optimizing" aria-label="选择优化强度" @click="toggleChipMenu('optimize')">
                  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" stroke="currentColor" stroke-width="1.5" fill="none" /></svg>
                </button>
                <div v-if="activeChipMenu === 'optimize'" class="paint-pop paint-pop--list paint-pop--narrow" role="menu">
                  <p class="paint-pop__title">优化强度</p>
                  <button v-for="item in strengthOptions" :key="item.value" type="button" role="menuitemradio" :aria-checked="form.strength === item.value" :class="{ 'is-on': form.strength === item.value }" @click="selectOptimizeStrength(item.value)">
                    <strong>{{ item.label }}</strong>
                  </button>
                </div>
              </div>

              <div class="mention-menu-wrap">
                <button type="button" class="paint-chip paint-chip--at" :class="{ 'is-open': showMentionPanel }" aria-label="@ 图片或技能" @mousedown.prevent="savePromptSelection" @click="toggleMentionPanel">@</button>
                <div v-if="showMentionPanel" class="paint-pop paint-mention">
                  <div class="su-seg paint-mention__tabs">
                    <button type="button" :class="{ 'is-active': mentionTab === 'upload' }" @click="mentionTab = 'upload'">插入图片</button>
                    <button type="button" :class="{ 'is-active': mentionTab === 'skill' }" @click="mentionTab = 'skill'">插入技能</button>
                  </div>
                  <div v-if="mentionTab === 'upload'" class="paint-mention__upload">
                    <button type="button" class="paint-mention__pick" @mousedown.prevent="savePromptSelection" @click="triggerMentionImageUpload">
                      <strong>选择本地图片</strong>
                      <span>上传后当作参考图一起生成，并显示在输入框里。</span>
                    </button>
                    <p>{{ promptAttachmentItems.length ? `已插入 ${promptAttachmentItems.length} 张图片` : '可以一次选多张 PNG / JPG。' }}</p>
                  </div>
                  <div v-else class="paint-mention__skills su-scroll">
                    <button v-for="workflow in creativeWorkflows" :key="workflow.id" type="button" :class="{ 'is-on': activeWorkflowId === workflow.id }" @click="selectMentionSkill(workflow)">
                      <strong>@{{ workflow.title }}</strong>
                      <span>{{ workflow.short }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="paint-send">
              <button type="button" class="paint-round" aria-label="删掉最后一个字" title="退格" @click="backspacePrompt">
                <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M7.5 4.5H16a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H7.5L2.5 10z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><path d="m9.5 8 4 4m0-4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
                <span>退格</span>
              </button>
              <button
                type="button"
                class="paint-voice-btn"
                :class="{ 'is-on': voiceListening }"
                :aria-pressed="voiceListening"
                :title="agentMode ? '语音：说一句，让 AI 伙伴帮你理' : '语音输入'"
                @click="toggleVoiceInput"
              >
                <span class="paint-voice-btn__wave" aria-hidden="true"><i /><i /><i /></span>
                <svg v-if="!voiceListening" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="7" y="2.5" width="6" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
                <span>{{ voiceListening ? '说完了' : '语音' }}</span>
              </button>
              <button
                type="button"
                class="paint-go"
                :disabled="generating || agentAsking"
                :title="agentMode ? '发给 AI 伙伴：整理好直接开画' : '发送，开始画'"
                @click="submitPrompt"
              >
                <span>{{ agentAsking ? '整理中…' : generating ? '画画中…' : '发送' }}</span>
                <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true"><path d="M3.5 10 16.5 4l-4 12.5-2.6-5.3z" fill="currentColor" /></svg>
              </button>
            </div>
          </div>
          </div>

        </section>
      </section>
    </div>

    <!-- ===== 弹窗 ===== -->
    <el-dialog v-model="showIdeaDialog" title="AI 帮你整理想法" width="min(780px, calc(100vw - 32px))" destroy-on-close class="paint-dialog">
      <IdeaDialog
        :answers="ideaAnswers"
        :questions="ideaQuestions"
        :result="ideaResult"
        :starter="difficultyStore.current === 'starter'"
        @update-answer="updateIdeaAnswer"
        @organize="organizeIdeaFlow"
        @append="applyIdeaPrompt('append')"
        @replace="applyIdeaPrompt('replace')"
      />
    </el-dialog>

    <el-dialog
      v-model="showSketchDialog"
      title="扫描纸上的草图"
      :width="difficultyStore.current === 'starter' ? 'min(760px, calc(100vw - 32px))' : 'min(820px, calc(100vw - 32px))'"
      :fullscreen="difficultyStore.current === 'junior'"
      destroy-on-close
      class="paint-dialog"
    >
      <SketchModule
        v-if="showSketchDialog"
        :project="project"
        :difficulty="difficultyStore.current"
        dialog-mode
        @upload="handleSketchUpload"
        @confirm="confirmSketchUse"
        @disable="disableSketchUse"
        @reset="resetSketch"
        @adjust="adjustSketch"
        @reset-adjust="resetSketchAdjust"
      />
    </el-dialog>

    <el-dialog
      v-model="showImageEditor"
      title="查看和修改这张画"
      width="min(1180px, 96vw)"
      top="4vh"
      class="paint-dialog paint-viewer-dialog"
      append-to-body
      destroy-on-close
      :close-on-click-modal="!singleImageEditing"
      :close-on-press-escape="!singleImageEditing"
      :show-close="!singleImageEditing"
    >
      <div v-if="editingVersion" class="paint-viewer">
        <section class="paint-viewer__stage">
          <img v-if="getArtworkImageUrl(editingVersion)" :src="getArtworkImageUrl(editingVersion)" :alt="editingVersion.title || '当前作品'" />
          <p v-else class="paint-viewer__none">这一张没有可以查看的图片</p>
          <span class="paint-viewer__tag">{{ editingVersion.title || 'AI 作品' }}</span>
          <button type="button" class="paint-viewer__full" :disabled="singleImageEditing || !getArtworkImageUrl(editingVersion)" @click="singleImageFullscreen = true">
            <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M3.5 7.5v-4h4M16.5 7.5v-4h-4M3.5 12.5v4h4M16.5 12.5v4h-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /></svg>
            全屏看
          </button>
        </section>
        <aside class="paint-viewer__side">
          <div class="paint-viewer__head">
            <h3>{{ singleImageMode === 'edit' ? '想怎么改？' : '这张画的描述' }}</h3>
            <button v-if="singleImageMode === 'edit'" type="button" class="su-btn su-btn--sm su-btn--ghost" :disabled="singleImageEditing" @click="singleImageMode = 'view'">看原来的描述</button>
          </div>
          <template v-if="singleImageMode === 'edit'">
            <textarea
              ref="singleImagePromptInput"
              v-model="singleImagePrompt"
              class="su-textarea paint-viewer__input"
              aria-label="描述修改要求"
              maxlength="2000"
              :disabled="singleImageEditing"
              placeholder="比如：把背景换成森林，加一点柔和的阳光，人物和衣服不要变。"
            />
            <span class="paint-viewer__count">{{ singleImagePrompt.length }} / 2000</span>
          </template>
          <p v-else class="paint-viewer__prompt">{{ singleOriginalPrompt || '这一张没有记录描述。' }}</p>
          <div class="paint-viewer__actions">
            <button type="button" class="su-btn" :disabled="singleImageEditing" @click="openSingleArtworkEditor">动手修改</button>
            <button type="button" class="su-btn" :disabled="singleImageEditing || !singleOriginalPrompt" @click="regenerateSingleImage">
              {{ singleImageAction === 'again' ? '正在画…' : '再画一张' }}
            </button>
            <button
              type="button"
              class="su-btn su-btn--primary"
              :disabled="singleImageEditing || (singleImageMode === 'edit' && !singleImagePrompt.trim())"
              @click="startSingleImageEdit"
            >{{ singleImageAction === 'edit' ? '正在改…' : singleImageMode === 'edit' ? '按要求改' : '改成新版本' }}</button>
          </div>
        </aside>
      </div>
    </el-dialog>

    <el-dialog v-model="singleImageFullscreen" title="全屏查看" fullscreen append-to-body destroy-on-close :show-close="false" class="paint-dialog paint-full-dialog">
      <template #header>
        <div class="paint-full__head">
          <span>{{ editingVersion?.title || '当前作品' }}</span>
          <button type="button" class="su-btn su-btn--sm" @click="singleImageFullscreen = false">退出全屏</button>
        </div>
      </template>
      <div class="paint-full__stage"><img v-if="editingVersion" :src="getArtworkImageUrl(editingVersion)" :alt="editingVersion.title || '当前作品'" /></div>
    </el-dialog>

    <ArtworkEditor v-if="showArtworkEditor && editingVersion" :project="project" :version-id="editingVersionId" @close="closeArtworkEditor" @saved="acceptArtworkEdit" @reload="reloadArtworkEdit" />

    <el-dialog v-model="showReferenceEditor" title="参考图" width="min(930px, calc(100vw - 32px))" destroy-on-close class="paint-dialog">
      <div v-if="editingReference" class="paint-refedit">
        <section class="paint-refedit__canvas">
          <img :src="editingReference.preview" :alt="editingReference.name || '参考图'" />
          <div class="paint-refedit__mask" :class="`tool-${referenceEditTool}`"></div>
          <div class="paint-refedit__tools" role="toolbar" aria-label="参考图工具">
            <button type="button" :class="{ 'is-on': referenceEditTool === 'paint' }" @click="referenceEditTool = 'paint'">涂抹</button>
            <button type="button" :class="{ 'is-on': referenceEditTool === 'select' }" @click="referenceEditTool = 'select'">框选</button>
            <button type="button" :class="{ 'is-on': referenceEditTool === 'eraser' }" @click="referenceEditTool = 'eraser'">橡皮</button>
            <button type="button" :class="{ 'is-on': referenceEditTool === 'cutout' }" @click="referenceEditTool = 'cutout'">抠图</button>
          </div>
        </section>
        <footer class="paint-refedit__foot">
          <button type="button" class="su-btn" @click="showReferenceEditor = false">取消</button>
          <button type="button" class="su-btn su-btn--primary" @click="saveReferenceEdit">保存</button>
        </footer>
      </div>
    </el-dialog>

    <el-dialog v-model="showResumeDialog" title="上次的画还没画完" width="min(480px, calc(100vw - 32px))" class="paint-dialog">
      <p class="paint-dialog__text">要接着画上次的作品，还是新开一张空白的？</p>
      <template #footer>
        <button type="button" class="su-btn" @click="startFreshProject">新开一张</button>
        <button type="button" class="su-btn su-btn--primary" @click="showResumeDialog = false">接着画</button>
      </template>
    </el-dialog>

    <el-dialog v-model="showStyleDialog" title="绘画风格素材" width="min(760px, calc(100vw - 32px))" destroy-on-close class="paint-dialog">
      <div class="paint-tpls">
        <button v-for="style in styleTemplates" :key="style.name" type="button" class="paint-tpl" @click="applyStyleTemplate(style)">
          <span :style="{ background: style.background }"></span>
          <strong>{{ style.name }}</strong>
          <small>{{ style.prompt }}</small>
        </button>
      </div>
      <template #footer>
        <button type="button" class="su-btn su-btn--ghost" @click="clearStyleTags">清空风格标签</button>
        <button type="button" class="su-btn" @click="showStyleDialog = false">关闭</button>
      </template>
    </el-dialog>

    <el-dialog v-model="showLibraryDialog" :title="`从${libraryDialogTitle}选参考图`" width="min(760px, calc(100vw - 32px))" class="paint-dialog">
      <div class="paint-lib">
        <div class="su-seg">
          <button type="button" :class="{ 'is-active': selectedLibraryMode === 'mine' }" @click="selectLibraryMode('mine')">我的素材</button>
          <button type="button" :class="{ 'is-active': selectedLibraryMode === 'square' }" @click="selectLibraryMode('square')">作品广场</button>
        </div>
        <div class="paint-lib__cats">
          <button v-for="item in libraryCategoryOptions" :key="item.value" type="button" class="su-chip" :aria-pressed="selectedLibraryCategory === item.value" @click="selectedLibraryCategory = item.value">{{ item.label }}</button>
        </div>
        <div class="paint-lib__grid">
          <button v-for="item in visibleLibraryMaterials" :key="item.id" type="button" class="paint-lib__item" :title="item.title" :aria-label="item.title" @click="useLibraryMaterial(item)">
            <span :style="{ background: item.cover || 'linear-gradient(135deg, #ffe4d4, #e5dbff)' }"></span>
          </button>
        </div>
        <div v-if="!visibleLibraryMaterials.length" class="su-empty">
          <strong>这里还没有素材</strong>
          <p>换个分类看看，或者先去画几张作品。</p>
        </div>
      </div>
    </el-dialog>
  </main>
</template>

<script setup>
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import BaseButton from '../components/base/BaseButton.vue'
import SketchModule from '../components/SketchScanModule.vue'
import ArtworkEditor from '../components/ArtworkEditor.vue'
import StudentAgentDock from '../components/StudentAgentDock.vue'
import SkillCoverArt from '../components/student/SkillCoverArt.vue'
import StyleSwatchArt from '../components/student/StyleSwatchArt.vue'
import { useLeaveGuard } from '../composables/useStudentTopBar'
import { createEmptyProject, useProjectStore } from '../stores/projectStore'
import { useDifficultyStore } from '../stores/difficultyStore'
import { createVariant, optimizeSketch, organizeIdea } from '../services/mockAiService'
import { generateArtwork, optimizeArtworkPrompt, testAiConnection, transcribeArtworkVoice } from '../services/aiGateway'
import { listStudentAiSkills, runStudentAiSkill } from '../services/aiSkillGateway'
import { listStudentPromptLibrary } from '../services/promptLibraryGateway'
import { loadStudentImageStylePanel } from '../services/imageStyleGateway'
import { resolveSmartRatio } from '../utils/smartRatio'
import { setMuted, toggleMuted, voiceMuted } from '../utils/agentSpeech'
import { useSketchMaterials } from '../composables/useSketchMaterials'

const IdeaDialog = defineComponent({
  props: { answers: Array, questions: Array, result: Object, young: Boolean, starter: Boolean },
  emits: ['update-answer', 'organize', 'append', 'replace'],
  setup(props, { emit }) {
    const cardOptions = ['可爱', '明亮', '有故事', '好多细节']
    return () => h('div', { class: 'idea-dialog' }, [
      h('div', { class: props.young ? 'idea-card-grid' : 'idea-form-grid' }, props.questions.map((question, index) => h('label', { key: question }, [
        h('span', question),
        props.young
          ? h('div', { class: 'idea-options' }, cardOptions.map((option) => h('button', { type: 'button', onClick: () => emit('update-answer', index, `${props.answers[index] || ''}${option} `) }, option)))
          : h('textarea', { value: props.answers[index], onInput: (event) => emit('update-answer', index, event.target.value), placeholder: '写下想法，也可以用语音输入。' }),
      ]))),
      h(BaseButton, { onClick: () => emit('organize') }, () => 'AI帮我整理'),
      props.result?.prompt ? h('div', { class: 'idea-compare' }, [
        h('section', [h('h3', '你的原始想法'), h('p', props.answers.filter(Boolean).join('；') || '还没有填写')]),
        h('section', [h('h3', 'AI整理后的提示词'), h('p', props.result.prompt)]),
      ]) : null,
      props.result?.prompt ? h('div', { class: 'prompt-actions' }, [
        h(BaseButton, { variant: 'secondary', onClick: () => emit('append') }, () => '追加到现有提示词'),
        props.young ? null : h(BaseButton, { onClick: () => emit('replace') }, () => '替换现有提示词'),
      ]) : null,
    ])
  },
})

const router = useRouter()
const route = useRoute()
const difficultyStore = useDifficultyStore()
const projectStore = useProjectStore()
const ideaQuestions = ['这个作品的主题是什么？有什么小故事吗？', '你设计了哪些特别的细节？', '你想用什么颜色和风格？', '还有什么补充想法？']
const strengthOptions = [{ label: '基础', value: 'safe' }, { label: '一般', value: 'balanced' }, { label: '深度', value: 'creative' }]
const TOKEN_BALANCE_KEY = 'art-studio-token-balance'
const TOKEN_LEDGER_KEY = 'art-studio-token-ledger'
const defaultTokenBalance = 1260
const defaultAiModels = [
  // AI 绘画页与无限画布、服务端默认配置保持一致。Agnes 2.1 当前会被路由到不支持尺寸字段的 text image queue。
  { id: 'agnes-image-2.0-flash', label: 'Agnes 图像 2.0 Flash', provider: 'agnes', model: 'agnes-image-2.0-flash', cost: 8, configured: true },
  { id: 'doubao-seedream', label: '豆包 Seedream', provider: 'volcengine', model: 'doubao-seedream-4-0-250828', cost: 10, configured: true },
  { id: 'openai-gpt-image', label: 'OpenAI 图像', provider: 'openai', model: 'gpt-image-1', cost: 12, configured: true },
]
// 图像风格：后台「AI图像功能管理 → 风格模板编辑」配好即生效（用户端按启用状态、排序值读取）。
// 后台一条都没配时，回退下面这套内置风格，保证面板永远有卡片可选。
const noneStyleOption = { value: 'none', label: '不指定', prompt: '', coverImageUrl: '', groupName: '' }
const builtinStylePresets = [
  { value: 'none', label: '不指定', prompt: '' },
  { value: 'guohua', label: '国画风格', prompt: '国画风格，水墨层次，留白雅致', groupName: '中国风' },
  { value: 'lineart', label: '线描风格', prompt: '线描风格，线条清晰，黑白关系明确', groupName: '插画' },
  { value: 'oil', label: '油画风格', prompt: '油画风格，笔触厚重，色彩有层次', groupName: '油画' },
  { value: 'photo', label: '照片写实', prompt: '照片写实风格，真实光影，材质清晰', groupName: '摄影' },
  { value: 'comic', label: '漫画风格', prompt: '漫画风格，角色表情鲜明，画面有故事感', groupName: '插画' },
  { value: 'watercolor', label: '水彩风格', prompt: '水彩风格，柔和晕染，纸张纹理', groupName: '插画' },
  { value: 'cartoon3d', label: '3D卡通', prompt: '3D卡通风格，圆润造型，柔和灯光', groupName: '3D' },
  { value: 'children', label: '儿童插画', prompt: '儿童插画风格，明亮亲和，适合课堂展示', groupName: '插画' },
]
const serverImageStyles = ref([])
const activeStyleGroup = ref('全部')
const styleTemplates = [
  { name: '手绘', prompt: '手绘质感，线条自然，儿童原创感', background: 'linear-gradient(135deg, #fff7ed, #f59e0b)' },
  { name: '二次元', prompt: '二次元插画，清晰线条，明亮上色', background: 'linear-gradient(135deg, #fdf2f8, #f472b6)' },
  { name: '水彩', prompt: '透明水彩，柔和晕染，纸张纹理', background: 'linear-gradient(135deg, #ecfeff, #36bffa)' },
  { name: '写实', prompt: '写实光影，高细节，真实材质', background: 'linear-gradient(135deg, #f8fafc, #64748b)' },
  { name: '3D卡通', prompt: '3D卡通，圆润建模，柔和灯光', background: 'linear-gradient(135deg, #fff7ed, #33cc99)' },
]
const defaultCreativeWorkflows = [
  { id: 'anime', title: '动漫人物', short: '角色表情 / 动作姿态', theme: '人物角色', ratio: '1:1', count: 2, prompt: '动漫人物角色，表情鲜明，姿态有故事感，线条清晰，色彩明亮' },
  { id: 'poster', title: '广告设计', short: '海报构图 / 标题留白', theme: '广告设计', ratio: '16:9', count: 2, prompt: '广告海报设计，主体突出，标题区域留白，商业插画质感，画面干净' },
  { id: 'character', title: '人物角色', short: 'IP造型 / 服装细节', theme: 'IP形象', ratio: '1:1', count: 4, prompt: '原创IP人物角色，完整服装造型，细节丰富，适合美术课堂展示' },
  { id: 'scene', title: '场景环境', short: '空间氛围 / 光影层次', theme: '场景环境', ratio: '16:9', count: 2, prompt: '完整场景环境设计，前中后景清晰，光影层次丰富，氛围感强' },
  { id: 'package', title: '品牌包装', short: '盒型结构 / 标签视觉', theme: '包装设计', ratio: '1:1', count: 4, prompt: '儿童创意品牌包装设计，盒型结构清晰，标签图案醒目，色彩统一，有展示质感' },
  { id: 'festival', title: '节日海报', short: '主题文字 / 装饰氛围', theme: '节日海报', ratio: '9:16', count: 2, prompt: '节日主题海报，标题醒目，装饰元素丰富，画面热闹但层次清楚，适合竖版展示' },
  { id: 'building', title: '梦幻建筑', short: '建筑造型 / 空间设计', theme: '场景环境', ratio: '16:9', count: 4, prompt: '梦幻建筑空间设计，建筑外形独特，空间层次清楚，光影柔和，带有幻想美术风格' },
  { id: 'nature', title: '自然风景', short: '山水植物 / 空气光影', theme: '场景环境', ratio: '16:9', count: 2, prompt: '自然风景插画，植物细节丰富，远近层次分明，空气感强，色彩明亮柔和' },
  { id: 'machine', title: '科幻机械', short: '结构细节 / 发光零件', theme: '星际汽车', ratio: '16:9', count: 4, prompt: '科幻机械设计，结构细节清楚，金属材质，发光零件，适合高级美术创作展示' },
  { id: 'storybook', title: '绘本分镜', short: '故事场景 / 连续画面', theme: '绘本插画', ratio: '16:9', count: 4, prompt: '绘本故事分镜插画，连续画面感，角色动作明确，色彩温暖，适合课堂项目展示' },
]
const youngPromptGroups = [
  {
    id: 'subject',
    title: '画什么',
    iconImageUrl: '/assets/prompt-icons/cat-subject.png',
    items: [
      { id: 'dog', label: '小狗', icon: '🐶', iconImageUrl: '/assets/prompt-icons/dog.png', prompt: '一只可爱的小狗' },
      { id: 'cat', label: '小猫', icon: '🐱', iconImageUrl: '/assets/prompt-icons/cat.png', prompt: '一只可爱的小猫' },
      { id: 'rabbit', label: '小兔子', icon: '🐰', iconImageUrl: '/assets/prompt-icons/rabbit.png', prompt: '一只软萌的小兔子' },
      { id: 'dinosaur', label: '小恐龙', icon: '🦕', iconImageUrl: '/assets/prompt-icons/dinosaur.png', prompt: '一只友好的小恐龙' },
      { id: 'fox', label: '小狐狸', icon: '🦊', iconImageUrl: '/assets/prompt-icons/fox.png', prompt: '一只机灵的小狐狸' },
      { id: 'bear', label: '小熊', icon: '🐻', iconImageUrl: '/assets/prompt-icons/bear.png', prompt: '一只憨厚的小熊' },
      { id: 'elephant', label: '大象', icon: '🐘', iconImageUrl: '/assets/prompt-icons/elephant.png', prompt: '一只温和的大象' },
      { id: 'panda', label: '熊猫', icon: '🐼', iconImageUrl: '/assets/prompt-icons/panda.png', prompt: '一只可爱的熊猫' },
      { id: 'bird', label: '小鸟', icon: '🐦', iconImageUrl: '/assets/prompt-icons/bird.png', prompt: '一只漂亮的小鸟' },
      { id: 'fish', label: '小鱼', icon: '🐟', iconImageUrl: '/assets/prompt-icons/fish.png', prompt: '一条活泼的小鱼' },
    ],
  },
  {
    id: 'scene',
    title: '在哪里',
    iconImageUrl: '/assets/prompt-icons/cat-scene.png',
    items: [
      { id: 'grass', label: '草地', icon: '🌱', iconImageUrl: '/assets/prompt-icons/grass.png', prompt: '在绿色的草地上' },
      { id: 'forest', label: '森林', icon: '🌲', iconImageUrl: '/assets/prompt-icons/forest.png', prompt: '在阳光明亮的森林里' },
      { id: 'beach', label: '海边', icon: '🏖️', iconImageUrl: '/assets/prompt-icons/beach.png', prompt: '在蓝色的大海边' },
      { id: 'room', label: '房间', icon: '🏠', iconImageUrl: '/assets/prompt-icons/room.png', prompt: '在温暖可爱的房间里' },
    ],
  },
  {
    id: 'background',
    title: '天空和背景',
    iconImageUrl: '/assets/prompt-icons/cat-background.png',
    items: [
      { id: 'blue-sky', label: '蓝天', icon: '☁️', iconImageUrl: '/assets/prompt-icons/blue-sky.png', prompt: '蓝蓝的天空和白云' },
      { id: 'rainbow', label: '彩虹', icon: '🌈', iconImageUrl: '/assets/prompt-icons/rainbow.png', prompt: '天空中有一道彩虹' },
      { id: 'stars', label: '星空', icon: '🌟', iconImageUrl: '/assets/prompt-icons/stars.png', prompt: '闪闪发光的星空' },
      { id: 'flowers', label: '小花', icon: '🌼', iconImageUrl: '/assets/prompt-icons/flowers.png', prompt: '周围开满五颜六色的小花' },
    ],
  },
  {
    id: 'action',
    title: '让它做什么',
    starterOnly: true,
    items: [
      { id: 'play', label: '一起玩', icon: '🎈', iconImageUrl: '/assets/prompt-icons/play.png', prompt: '它们正在开心地一起玩耍' },
      { id: 'run', label: '奔跑', icon: '🏃', iconImageUrl: '/assets/prompt-icons/run.png', prompt: '它们正在快乐地奔跑' },
      { id: 'smile', label: '微笑', icon: '😊', iconImageUrl: '/assets/prompt-icons/smile.png', prompt: '角色面带灿烂的笑容' },
      { id: 'butterfly', label: '蝴蝶', icon: '🦋', iconImageUrl: '/assets/prompt-icons/butterfly.png', prompt: '有彩色蝴蝶在旁边飞舞' },
    ],
  },
]
const creativeWorkflows = ref(defaultCreativeWorkflows)
// 后台给玩法上传的卡片图：优先用 service 下发的 configuration.presentation.coverUrl，
// 没有时才回落到原来的 CSS 插画 / 静态主题图。
function workflowCoverUrl(workflow) {
  return workflow?.configuration?.presentation?.coverUrl || workflow?.presentation?.coverUrl || ''
}
function workflowCoverStyle(workflow) {
  const url = workflowCoverUrl(workflow)
  return url ? { backgroundImage: `url("${url}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}
}
// 技能分类标签：分类由后台「技能包列表」建立，用户端只做筛选。
// 一个分类都没有（纯本地默认玩法 / 老师还没建分类）时整排标签不出现，避免空条占位。
const selectedWorkflowCategoryId = ref('all')
const workflowCategoryTabs = computed(() => {
  const groups = new Map()
  creativeWorkflows.value.forEach((workflow) => {
    const id = workflow.categoryId || ''
    const name = workflow.categoryName || ''
    if (!id || !name) return
    if (!groups.has(id)) groups.set(id, { id, name, count: 0 })
    groups.get(id).count += 1
  })
  if (!groups.size) return []
  const tabs = [...groups.values()].sort((a, b) => b.count - a.count)
  return [{ id: 'all', name: '全部', count: creativeWorkflows.value.length }, ...tabs]
})
const visibleCreativeWorkflows = computed(() => {
  const selected = selectedWorkflowCategoryId.value
  if (!selected || selected === 'all') return creativeWorkflows.value
  return creativeWorkflows.value.filter((workflow) => workflow.categoryId === selected)
})
const qualityMarks = { 1: '标准', 2: '高清', 3: '2K', 4: '4K' }
const qualityOptions = Object.entries(qualityMarks).map(([value, label]) => ({ value: Number(value), label }))
const ratioOptions = [
  { label: '智能', value: '自动', aspect: '1 / 1' },
  { label: '21:9', value: '21:9', aspect: '21 / 9' },
  { label: '16:9', value: '16:9', aspect: '16 / 9' },
  { label: '3:2', value: '3:2', aspect: '3 / 2' },
  { label: '4:3', value: '4:3', aspect: '4 / 3' },
  { label: '1:1', value: '1:1', aspect: '1 / 1' },
  { label: '3:4', value: '3:4', aspect: '3 / 4' },
  { label: '2:3', value: '2:3', aspect: '2 / 3' },
  { label: '9:16', value: '9:16', aspect: '9 / 16' },
]
const imageSettingsRatios = ['自动', '1:1', '3:4', '16:9', '4:3', '9:16', '2:3', '3:2', '21:9'].map((value) => ratioOptions.find((item) => item.value === value))
const countOptions = [1, 2, 3, 4]
const libraryCategoryOptions = [
  { label: '全部', value: 'all' },
  { label: '门头设计', value: '门头设计' },
  { label: 'IP形象', value: 'IP形象' },
  { label: '广告设计', value: '广告设计' },
  { label: '漫画人物', value: '漫画人物' },
  { label: '产品设计', value: '产品设计' },
  { label: '室内设计', value: '室内设计' },
  { label: '汽车造型', value: '汽车造型' },
  { label: '创意画', value: '创意画' },
  { label: '教育绘本', value: '教育绘本' },
]
const publicLibraryMaterials = [
  { id: 'square-001', source: '作品广场', category: '创意画', title: '梦幻建筑作品', prompt: '梦幻建筑空间设计，建筑外形独特，空间层次清楚，光影柔和', cover: 'linear-gradient(135deg, #dbeafe, #7dd3fc)' },
  { id: 'square-002', source: '作品广场', category: '创意画', title: '国画山水参考', prompt: '国画山水构图，水墨层次，远山近树，留白自然', cover: 'linear-gradient(135deg, #dcfce7, #86efac)' },
  { id: 'square-003', source: '作品广场', category: '漫画人物', title: '漫画角色参考', prompt: '原创漫画角色，表情明确，服装细节丰富，动作有故事感', cover: 'linear-gradient(135deg, #fce7f3, #f9a8d4)' },
  { id: 'square-004', source: '作品广场', category: '产品设计', title: '产品包装参考', prompt: '儿童创意产品包装，标签醒目，品牌色统一，展示感强', cover: 'linear-gradient(135deg, #ffedd5, #fdba74)' },
  { id: 'square-005', source: '作品广场', category: '门头设计', title: '门头设计参考', prompt: '门头招牌设计，品牌名字突出，灯光温暖，商业展示清楚', cover: 'linear-gradient(135deg, #fef3c7, #facc15)' },
]
const project = reactive(createEmptyProject(difficultyStore.current))
const form = reactive({ theme: 'IP形象', prompt: '', originalPrompt: '', optimize: true, strength: 'balanced', ratio: '自动', stylePower: 6, count: 1, negativePrompt: '', quality: 2, webSearch: false, modelId: defaultAiModels[0].id, stylePreset: 'none' })
// 提交后输入框会清空，作品入库/再次生成还要知道「上一句到底写了什么」
const lastSubmittedPrompt = ref('')
const ideaAnswers = ref(['', '', '', ''])
const ideaResult = ref(null)
const generating = ref(false)
const generationStatus = ref('idle')
const generationError = ref('')
const generationPreviewRatio = ref('1:1')
const generationPreviewCount = computed(() => Math.min(Math.max(Number(form.count) || 1, 1), 4))
const imageGenerationJobs = ref([])
const imageSubmissionPreparingCount = ref(0)
let imageGenerationQueueRunning = false
const hasActiveImageGenerationJobs = computed(() => imageSubmissionPreparingCount.value > 0 || imageGenerationJobs.value.some((job) => ['queued', 'loading'].includes(job.status)))
const optimizing = ref(false)
const ideaOrganizing = ref(false)
const selectedVersionId = ref('')
const activeWorkflowId = ref('anime')
const youngSidebarMode = ref('prompt-library')
const selectedYoungPromptIds = ref([])
const youngPromptBase = ref('')
const serverYoungPromptGroups = ref([])
const youngPromptLoading = ref(false)
const youngPromptLoadError = ref(false)
const promptInputRef = ref(null)
const localReferenceInput = ref(null)
const mentionImageInput = ref(null)
const activeChipMenu = ref('')
const imageSettingsRef = ref(null)
const imageSettingsPanelRef = ref(null)
const imageSettingsButtonRef = ref(null)
const imageSettingsPosition = ref({})
const showMentionPanel = ref(false)
const mentionTab = ref('upload')
const activeSkillMention = ref(null)
const showImageEditor = ref(false)
const showArtworkEditor = ref(false)
const singleImagePrompt = ref('')
const singleImageEditing = ref(false)
const singleImageMode = ref('view')
const singleImageAction = ref('')
const singleImageFullscreen = ref(false)
const singleImagePromptInput = ref(null)
const editingVersionId = ref('')
const showReferenceEditor = ref(false)
const editingReferenceId = ref('')
const referenceEditTool = ref('paint')
const voiceListening = ref(false)
const voiceStatus = ref('')
// 智能体模式：点头像进/出。开着的时候，大框和它旁边的语音、发送都听智能体的
const agentMode = ref(false)
const agentDockRef = ref(null)
const agentAsking = ref(false)
// 和智能体面板的朗读开关共用同一个状态，改一边另一边跟着变（存在 localStorage）
const muted = voiceMuted
const showIdeaDialog = ref(false)
const showSketchDialog = ref(false)
const showResumeDialog = ref(false)
const showStyleDialog = ref(false)
const showLibraryDialog = ref(false)
const bottomPanelCollapsed = ref(false)
const showReferenceMenu = ref(false)
const referenceStackExpanded = ref(false)
const advancedParamsOpen = ref(false)
const libraryDialogTitle = ref('素材库')
const selectedLibraryMode = ref('mine')
const selectedLibraryCategory = ref('all')
// 手绘板存下来的稿子也进参考图弹窗，用户不用另找入口。
const { sketchMaterials, loadSketchMaterials } = useSketchMaterials()
const modelHealthOptions = ref([])
const tokenBalance = ref(readTokenBalance())
let activeRecognition = null
let activeVoiceStream = null
let activeAudioContext = null
let activeAudioSource = null
let activeAudioProcessor = null
let recordedVoiceChunks = []
let recordedVoiceSampleRate = 44100
let voiceManualStop = false
let voiceMockMode = false
let voiceTranscript = ''
let voiceInterimTranscript = ''
let savedPromptRange = null
let promptEditorSyncing = false
let draftSaveTimer = null
let lastDraftSaveWarningAt = 0

const REFERENCE_IMAGE_MAX_EDGE = 1600
const DRAFT_SAVE_DELAY = 280

const isJuniorStarter = computed(() => ['junior', 'starter'].includes(difficultyStore.current))
const selectedYoungPromptCategoryId = ref('')
const activeYoungPromptGroups = computed(() => serverYoungPromptGroups.value.length ? serverYoungPromptGroups.value : youngPromptGroups)
// 初级版与入门版共享同一套提示词库，分类和内容完全一致。
const visibleYoungPromptGroups = computed(() => activeYoungPromptGroups.value)
const activeYoungPromptGroup = computed(() => visibleYoungPromptGroups.value.find((group) => group.id === selectedYoungPromptCategoryId.value) || visibleYoungPromptGroups.value[0] || null)
const selectedYoungPromptItems = computed(() => activeYoungPromptGroups.value
  .flatMap((group) => group.items)
  .filter((item) => selectedYoungPromptIds.value.includes(item.id)))
const selectedVersion = computed(() => project.versions.find((item) => item.id === selectedVersionId.value) || project.versions[0] || null)
const editingVersion = computed(() => project.versions.find((item) => item.id === editingVersionId.value) || selectedVersion.value)
const singleOriginalPrompt = computed(() => String(editingVersion.value?.batchPrompt || editingVersion.value?.prompt || '').trim())
const primaryReferencePreview = computed(() => project.referenceImages?.[0]?.preview || project.sketchOriginal || '')
const editingReference = computed(() => project.referenceImages?.find((item) => item.id === editingReferenceId.value) || null)
const promptAttachmentItems = computed(() => (project.referenceImages || []).filter((item) => item.source === 'mention-upload'))
const referenceStackPreviewItems = computed(() => (project.referenceImages || []).slice(0, 3))
const visibleProVersions = computed(() => project.versions)
const generationBatches = computed(() => {
  const groups = []
  const groupMap = new Map()
  visibleProVersions.value.forEach((version) => {
    const id = version.batchId || 'legacy-history'
    if (!groupMap.has(id)) {
      const meta = version.batchMeta || {}
      const group = {
        id,
        firstIndex: groups.length,
        sortTime: Number.isNaN(new Date(version.createdAt).getTime()) ? null : new Date(version.createdAt).getTime(),
        prompt: version.batchPrompt || version.promptSummary || version.prompt || form.prompt || lastSubmittedPrompt.value || '未记录提示词',
        model: meta.model || version.model || '图片 5.0 Pro',
        ratio: meta.ratio || version.ratio || (form.ratio === '自动' ? '1:1' : form.ratio),
        quality: meta.quality || version.quality || qualityLabel.value,
        createdAt: formatBatchTime(version.createdAt),
        thumbnail: version.background || 'linear-gradient(135deg, #fff7ed, #fed7aa)',
        versions: [],
      }
      groupMap.set(id, group)
      groups.push(group)
    }
    const group = groupMap.get(id)
    if (!group.thumbnail && version.background) group.thumbnail = version.background
    group.versions.push(version)
  })
  return groups.sort((a, b) => {
    if (a.sortTime === null && b.sortTime === null) return a.firstIndex - b.firstIndex
    if (a.sortTime === null) return -1
    if (b.sortTime === null) return 1
    return a.sortTime - b.sortTime || a.firstIndex - b.firstIndex
  })
})
const ratioClass = computed(() => ({ '9:16': 'is-vertical', '16:9': 'is-wide', '1:1': 'is-square' }[form.ratio] || 'is-square'))
const qualityLabel = computed(() => qualityMarks[form.quality] || '高清')
const ratioLabel = computed(() => ratioOptions.find((item) => item.value === form.ratio)?.label || form.ratio || '智能')
const strengthLabel = computed(() => strengthOptions.find((item) => item.value === form.strength)?.label || '一般')
const availableAiModels = computed(() => modelHealthOptions.value.filter((item) => item.configured))
const selectedModel = computed(() => availableAiModels.value.find((item) => item.id === form.modelId) || availableAiModels.value[0] || { label: '暂无可用绘画模型', cost: 8 })
// 面板里的风格卡片：第一张固定「不指定」，后面是后台配置（或内置兜底）
const stylePresetOptions = computed(() => {
  const configured = serverImageStyles.value
  // 后台「模板设置」选了「不显示任何风格」时，只留「不指定」一张卡
  if (!configured.length && stylePanelSettings.value.fallbackMode === 'empty') return [noneStyleOption]
  const cards = configured.length
    ? configured.map((item) => ({
      value: item.id,
      label: item.name,
      prompt: item.prompt || '',
      coverImageUrl: item.coverImageUrl || '',
      groupName: item.groupName || '',
    }))
    : builtinStylePresets
      .filter((item) => item.value !== 'none')
      .map((item) => ({ ...item, coverImageUrl: '' }))
  return [noneStyleOption, ...cards]
})
// 分组标签：只有一个分组时不显示标签行，避免一排只有一个按钮
const styleGroupTabs = computed(() => {
  const groups = []
  stylePresetOptions.value.forEach((item) => {
    if (item.groupName && !groups.includes(item.groupName)) groups.push(item.groupName)
  })
  return ['全部', ...groups]
})
const activeStyleGroupSafe = computed(() => (styleGroupTabs.value.includes(activeStyleGroup.value) ? activeStyleGroup.value : '全部'))
// 「不指定」不再占卡片位：它挪到面板标题右侧当按钮，这样 8 个格子全部留给真正的风格
const styleCardItems = computed(() => stylePresetOptions.value.filter((item) => item.value !== 'none'))
const visibleStyleOptions = computed(() => {
  const all = styleCardItems.value
  if (activeStyleGroupSafe.value === '全部') return all
  return all.filter((item) => item.groupName === activeStyleGroupSafe.value)
})
const selectedStyle = computed(() => stylePresetOptions.value.find((item) => item.value === form.stylePreset)
  || builtinStylePresets.find((item) => item.value === form.stylePreset)
  || noneStyleOption)
// 「不用风格」按钮亮不亮：按实际生效的风格算。后台把用户选的那个风格删掉后 form.stylePreset 仍是旧 id，
// 只看 form.stylePreset 会「按钮不亮、但其实已经没有风格生效」。
const styleIsNone = computed(() => selectedStyle.value.value === 'none')
const generationTokenCost = computed(() => (selectedModel.value?.cost || defaultAiModels[0].cost) * Number(form.count || 1))
const visibleLibraryMaterials = computed(() => {
  const category = selectedLibraryCategory.value
  const matchesCategory = (item) => category === 'all' || item.category === category
  if (selectedLibraryMode.value === 'square') return publicLibraryMaterials.filter(matchesCategory)
  const projectMaterials = projectStore.projects.map((item) => ({
    id: `project-${item.id}`,
    source: '我的素材库',
    category: inferMaterialCategory(item),
    title: item.title,
    prompt: item.prompt,
    preview: extractReferenceImageUrl(item),
    cover: referenceImageCover(extractReferenceImageUrl(item), item.cover),
  }))
  const currentReferences = (project.referenceImages || []).map((item) => ({
    id: `reference-${item.id}`,
    source: '我的上传素材',
    category: inferMaterialCategory(item),
    title: item.name || '参考图',
    prompt: '使用这张参考图的构图、主体和色彩关系',
    cover: `url("${item.preview}") center / cover no-repeat`,
    preview: item.preview,
  }))
  const currentVersions = (project.versions || []).map((item) => {
    const url = extractDownloadUrl(item)
    return {
      id: `version-${item.id}`,
      source: '我的生成作品',
      category: inferMaterialCategory(item),
      title: item.title || 'AI生成图',
      prompt: item.batchPrompt || item.prompt || form.prompt || lastSubmittedPrompt.value,
      cover: item.background || 'linear-gradient(135deg, #ff7a00, #ffd166)',
      preview: url,
    }
  })
  return [...sketchMaterials.value, ...currentReferences, ...currentVersions, ...projectMaterials].filter(matchesCategory)
})

onMounted(() => {
  loadSketchMaterials()
  if (route.query.projectId) projectStore.openProject(String(route.query.projectId))
  const draft = projectStore.currentProject || projectStore.draft
  Object.assign(project, draft ? { ...createEmptyProject(difficultyStore.current), ...draft } : createEmptyProject(difficultyStore.current))
  form.prompt = project.prompt || ''
  form.theme = project.theme || form.theme
  form.negativePrompt = project.negativePrompt || form.negativePrompt
  form.ratio = project.ratio || form.ratio
  form.count = project.count || form.count
  form.quality = project.quality || form.quality
  form.modelId = project.modelId || form.modelId
  form.stylePreset = project.stylePreset || form.stylePreset
  ideaAnswers.value = [...(project.ideaRawAnswers || ['', '', '', ''])]
  selectedVersionId.value = project.finalVersionId || project.versions?.[0]?.id || ''
  if (route.query.edit === '1') {
    const requested = String(route.query.versionId || selectedVersionId.value)
    if (project.versions?.some((version) => version.id === requested)) openArtworkEditor(requested)
    else ElMessage.warning('未找到该作品版本，请在版本列表中重新选择。')
  }
  if (route.query.scan === '1') openSketchDialog()
  if (projectStore.draft?.prompt && !projectStore.currentProject) showResumeDialog.value = true
  speak('欢迎来到AI绘画创作页')
  refreshAvailableModels()
  void loadYoungPromptLibrary()
  void loadImageStyles()
  void loadPublishedImageSkills()
  document.addEventListener('selectionchange', handlePromptSelectionChange)
  document.addEventListener('click', handleImageSettingsOutside)
  document.addEventListener('click', handleReferenceStripOutside)
  document.addEventListener('click', handleChipMenusOutside)
  window.addEventListener('resize', dismissImageSettings)
  nextTick(() => syncPromptEditorFromText(form.prompt))
})

async function loadPublishedImageSkills() {
  if (import.meta.env.VITE_AUTH_MODE !== 'server') return
  try {
    const skills = await listStudentAiSkills('image')
    if (!skills.length) return
    creativeWorkflows.value = skills.map((skill) => ({
      ...skill,
      id: skill.id,
      short: skill.summary || '按讲师配置的玩法创作',
      theme: skill.title,
      ratio: skill.configuration?.generation?.ratio || '1:1',
      count: skill.configuration?.generation?.count || 1,
      prompt: skill.configuration?.generation?.promptTemplate || '',
      managedSkill: true,
    }))
    if (!creativeWorkflows.value.some((item) => item.id === activeWorkflowId.value)) activeWorkflowId.value = creativeWorkflows.value[0].id
    // 分类标签要跟着刷新：老师可能刚改过分类，旧的选中项已经不存在了就回到「全部」
    if (!workflowCategoryTabs.value.some((tab) => tab.id === selectedWorkflowCategoryId.value)) selectedWorkflowCategoryId.value = 'all'
  } catch (error) {
    console.warn('无法读取已发布图像玩法', error)
  }
}
onBeforeUnmount(() => {
  stopVoiceInput()
  document.removeEventListener('selectionchange', handlePromptSelectionChange)
  document.removeEventListener('click', handleImageSettingsOutside)
  document.removeEventListener('click', handleReferenceStripOutside)
  document.removeEventListener('click', handleChipMenusOutside)
  window.removeEventListener('resize', dismissImageSettings)
  flushProjectDraft()
})
// 状态一变就落盘，并且同步给智能体面板那个开关（两个本地键一起写）
watch(muted, (value) => setMuted(value))
watch(showImageEditor, (visible) => { if (!visible) singleImageFullscreen.value = false })
watch(form, saveDraft, { deep: true })
watch(() => form.prompt, (value) => {
  if (promptEditorSyncing) return
  nextTick(() => syncPromptEditorFromText(value))
})
watch(() => difficultyStore.current, (value) => {
  youngSidebarMode.value = ['junior', 'starter'].includes(value) ? 'prompt-library' : 'workflow'
  selectedYoungPromptIds.value = []
  youngPromptBase.value = ''
  selectedYoungPromptCategoryId.value = ''
  void loadYoungPromptLibrary()
  nextTick(() => syncPromptEditorFromText(form.prompt))
})

async function loadYoungPromptLibrary() {
  if (!['junior', 'starter'].includes(difficultyStore.current)) return
  youngPromptLoading.value = true
  youngPromptLoadError.value = false
  try {
    // 两个用户版本统一读取入门版这套后台配置，后台增删会同步作用于两端。
    const data = await listStudentPromptLibrary('starter')
    const categories = Array.isArray(data.categories) ? data.categories : []
    const prompts = Array.isArray(data.prompts) ? data.prompts : []
    serverYoungPromptGroups.value = categories.map((category) => ({
      id: category.id,
      title: category.name,
      icon: category.icon,
      items: prompts.filter((item) => item.categoryId === category.id).map((item) => ({ id: item.id, label: item.label, icon: item.icon, iconImageUrl: item.iconImageUrl || '', prompt: item.prompt })),
    })).filter((group) => group.items.length)
    if (!visibleYoungPromptGroups.value.some((group) => group.id === selectedYoungPromptCategoryId.value)) selectedYoungPromptCategoryId.value = visibleYoungPromptGroups.value[0]?.id || ''
  } catch (error) {
    serverYoungPromptGroups.value = []
    youngPromptLoadError.value = true
    console.warn('无法读取用户端提示词库，已使用默认配置', error)
  } finally {
    youngPromptLoading.value = false
  }
}

// 后台配置的图像风格模板：读不到（本地演示模式／网络失败）就静默回退内置风格
async function loadImageStyles() {
  if (import.meta.env.VITE_AUTH_MODE !== 'server') return
  try {
    const { styles, panelSettings } = await loadStudentImageStylePanel()
    serverImageStyles.value = Array.isArray(styles) ? styles : []
    // 后台保存在服务端的面板设置优先（以前只存在后台那台电脑的浏览器里，平板上读不到）
    if (panelSettings) applyStylePanelSettings(panelSettings)
  } catch (error) {
    serverImageStyles.value = []
    console.warn('无法读取后台配置的图像风格，已使用内置风格', error)
  }
}

// 后台「模板设置」里的面板偏好（标题、每排几张、是否回退内置风格）。
// 正式环境以服务端为准（loadImageStyles 读到后覆盖）；本机缓存只用于没有后端的演示模式和首屏占位。
const STYLE_PANEL_SETTINGS_KEY = 'image-style-panel-settings-v1'
const stylePanelSettings = ref({ panelTitle: '图像风格', columns: 4, fallbackMode: 'builtin' })
function applyStylePanelSettings(saved = {}) {
  stylePanelSettings.value = {
    panelTitle: String(saved?.panelTitle || '').trim() || '图像风格',
    columns: [2, 3, 4].includes(Number(saved?.columns)) ? Number(saved.columns) : 4,
    fallbackMode: saved?.fallbackMode === 'empty' ? 'empty' : 'builtin',
  }
}
function loadStylePanelSettings() {
  try {
    applyStylePanelSettings(JSON.parse(localStorage.getItem(STYLE_PANEL_SETTINGS_KEY) || '{}'))
  } catch { applyStylePanelSettings({}) }
}
// 默认每排 4 张 → 两排正好一屏 8 个（用户最常要的是一眼看全，不用滑）
const stylePanelColumns = computed(() => ([2, 3, 4].includes(Number(stylePanelSettings.value.columns)) ? Number(stylePanelSettings.value.columns) : 4))
const stylePanelTitle = computed(() => stylePanelSettings.value.panelTitle || '图像风格')
// 卡片超过「两排 × 每排几张」才往右滑；滑到最右边时把「左右滑动」提示收起来，避免误导
const styleCardScrollEl = ref(null)
const styleScrolledToEnd = ref(false)
const styleCardCapacity = computed(() => stylePanelColumns.value * 2)
const hasStyleOverflow = computed(() => visibleStyleOptions.value.length > styleCardCapacity.value)
const styleHasRightMore = computed(() => (hasStyleOverflow.value ? !styleScrolledToEnd.value : false))
function syncStyleScrollState() {
  const box = styleCardScrollEl.value
  if (!box) { styleScrolledToEnd.value = false; return }
  styleScrolledToEnd.value = box.scrollLeft + box.clientWidth >= box.scrollWidth - 4
}
function onStyleScroll() { syncStyleScrollState() }
watch(activeChipMenu, async (value) => {
  if (value !== 'style') return
  await nextTick()
  syncStyleScrollState()
})

function toggleStyleMenu() {
  const opening = activeChipMenu.value !== 'style'
  activeChipMenu.value = opening ? 'style' : ''
  if (!opening) return
  loadStylePanelSettings()
  // 打开时优先停在当前已选风格所在分组，省得用户来回找
  const current = selectedStyle.value?.groupName || ''
  activeStyleGroup.value = styleGroupTabs.value.includes(current) ? current : '全部'
}

function selectYoungPromptCategory(categoryId) {
  if (visibleYoungPromptGroups.value.some((group) => group.id === categoryId)) selectedYoungPromptCategoryId.value = categoryId
}

function syncIdeaDraft() { project.ideaRawAnswers = [...ideaAnswers.value]; saveProjectDraft() }
function formatBatchTime(value) {
  if (!value) return '历史记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '历史记录'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
function normalizeArtworkRatio(value) {
  const ratio = String(value || '').trim()
  if (ratio === '自动') return '1:1'
  if (ratioOptions.some((item) => item.value === ratio && item.value !== '自动')) return ratio
  return '16:9'
}
function getArtworkRatio(version) {
  return normalizeArtworkRatio(version?.ratio || version?.batchMeta?.ratio || form.ratio)
}
const artworkNaturalRatios = reactive({})
function ratioToNumber(value, fallback = 1) {
  const [width, height] = String(value || '').split(':').map(Number)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return fallback
  return width / height
}
function getArtworkRatioValue(version) {
  return artworkNaturalRatios[version?.id] || ratioToNumber(getArtworkRatio(version))
}
function getArtworkAspectRatio(version) {
  return getArtworkRatioValue(version)
}
function getWaitingPreviewStyle(ratio) {
  const ratioValue = ratioToNumber(ratio)
  return {
    '--preview-aspect': ratioValue,
    '--preview-ratio-value': ratioValue,
  }
}
function getArtworkFrameStyle(version) {
  const ratioValue = getArtworkRatioValue(version)
  const style = {
    aspectRatio: ratioValue,
    '--artwork-ratio-value': ratioValue,
  }
  if (version?.imageUrl) {
    style.backgroundImage = `url("${version.imageUrl}")`
    return style
  }
  style.background = version?.background || 'linear-gradient(135deg, #fff7ed, #fed7aa)'
  return style
}
function getArtworkImageUrl(version) {
  return extractDownloadUrl(version)
}
function rememberArtworkNaturalRatio(version, event) {
  const image = event?.currentTarget
  if (!version?.id || !image?.naturalWidth || !image?.naturalHeight) return
  const naturalRatio = image.naturalWidth / image.naturalHeight
  if (Number.isFinite(naturalRatio) && naturalRatio > 0) artworkNaturalRatios[version.id] = naturalRatio
}
function getArtworkEditorStyle(version) {
  const ratio = getArtworkRatio(version)
  const style = getArtworkFrameStyle(version)
  const widthMap = {
    '9:16': 'min(38vh, 380px)',
    '3:4': 'min(48vh, 460px)',
    '1:1': 'min(62vh, 560px)',
    '4:3': 'min(70vw, 650px)',
    '16:9': 'min(72vw, 720px)',
  }
  style.width = widthMap[ratio] || 'min(72vw, 720px)'
  return style
}
function saveDraft() {
  project.prompt = form.prompt
  project.theme = form.theme
  project.negativePrompt = form.negativePrompt
  project.ratio = form.ratio
  project.count = form.count
  project.quality = form.quality
  project.modelId = form.modelId
  project.stylePreset = form.stylePreset
  saveProjectDraft()
}
function persistProjectDraft() {
  try {
    projectStore.setCurrentProject({ ...project })
  } catch (error) {
    if (Date.now() - lastDraftSaveWarningAt > 3000) {
      lastDraftSaveWarningAt = Date.now()
      ElMessage.warning('参考图过大，已保留本次编辑，请减少图片数量后再保存')
    }
    console.warn('项目草稿保存失败', error)
  }
}
function flushProjectDraft() {
  if (draftSaveTimer) {
    window.clearTimeout(draftSaveTimer)
    draftSaveTimer = null
    persistProjectDraft()
  }
}
function saveProjectDraft() {
  if (draftSaveTimer) window.clearTimeout(draftSaveTimer)
  draftSaveTimer = window.setTimeout(() => {
    draftSaveTimer = null
    persistProjectDraft()
  }, DRAFT_SAVE_DELAY)
}
function projectPayload() {
  return {
    ...project,
    // 输入框生成后就空了，这里要拿「上一句已提交的提示词」，否则作品入库会变成空提示词
    prompt: form.prompt || lastSubmittedPrompt.value,
    theme: form.theme,
    negativePrompt: form.negativePrompt,
    ratio: form.ratio,
    count: form.count,
    quality: form.quality,
    modelId: form.modelId,
    stylePreset: form.stylePreset,
    thumbnails: project.versions,
  }
}
function saveProjectToPortfolio() {
  const payload = projectPayload()
  const stored = projectStore.projects.find((item) => item.id === project.id)
  // 异步保存会更新 store 的文档版本，页面快照不能将版本号退回。
  if (stored?._serverDocumentId) {
    payload._serverDocumentId = stored._serverDocumentId
    payload._serverVersion = stored._serverVersion
  }
  projectStore.saveCurrentProject(payload)
  Object.assign(project, projectStore.currentProject || project)
}
function openIdeaDialog() { showIdeaDialog.value = true }
function openSketchDialog() { showSketchDialog.value = true }
function updateIdeaAnswer(index, value) { ideaAnswers.value[index] = value; syncIdeaDraft() }

async function organizeIdeaFlow() {
  ideaOrganizing.value = true
  try { ideaResult.value = await organizeIdea({ answers: ideaAnswers.value, style: difficultyStore.current === 'pro' ? 'formal' : 'balanced' }) } finally { ideaOrganizing.value = false }
  project.ideaSummary = ideaResult.value.summary
  project.ideaPrompt = ideaResult.value.prompt
  if (difficultyStore.current === 'junior') applyIdeaPrompt('append')
  if (difficultyStore.current === 'starter') speak('AI整理好了：' + ideaResult.value.prompt)
  saveProjectDraft()
  return true
}
function applyIdeaPrompt(mode) {
  if (!ideaResult.value?.prompt) return
  form.originalPrompt = form.prompt
  form.prompt = mode === 'replace' ? ideaResult.value.prompt : (form.prompt ? form.prompt + '，' : '') + ideaResult.value.prompt
  showIdeaDialog.value = false
  saveDraft()
  ElMessage.success(mode === 'replace' ? '已替换提示词' : '已追加到提示词')
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function compressReferencePreview(preview) {
  if (!preview?.startsWith('data:image/')) return Promise.resolve(preview)

  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const longestEdge = Math.max(image.naturalWidth, image.naturalHeight)
      const scale = Math.min(1, REFERENCE_IMAGE_MAX_EDGE / longestEdge)
      const width = Math.max(1, Math.round(image.naturalWidth * scale))
      const height = Math.max(1, Math.round(image.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) {
        resolve(preview)
        return
      }
      context.drawImage(image, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    image.onerror = () => resolve(preview)
    image.src = preview
  })
}

function readImageFile(file, source = 'local') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async () => {
      const preview = await compressReferencePreview(reader.result)
      resolve({
        id: `ref-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        source,
        preview,
        edited: false,
        createdAt: new Date().toISOString(),
      })
    }
    reader.onerror = () => reject(reader.error || new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

async function handleSketchUpload(payload) {
  project.sketchSource = payload.source || 'album'
  project.sketchStage = 'optimizing'
  project.sketchProgress = 12
  project.sketchCurrentStep = '智能扶正裁剪'
  saveProjectDraft()
  await wait(280)
  project.sketchProgress = 42
  project.sketchCurrentStep = '去杂去阴影'
  saveProjectDraft()
  await wait(300)
  project.sketchProgress = 76
  project.sketchCurrentStep = '线稿增强'
  saveProjectDraft()
  const preview = await compressReferencePreview(payload.preview)
  const result = await optimizeSketch({ preview })
  project.sketchOriginal = result.original
  project.sketchOptimized = result.optimized
  project.sketchScore = result.score
  project.sketchComment = result.comment
  project.sketchProgress = 100
  project.sketchCurrentStep = '优化完成'
  project.sketchStage = 'ready'
  project.lineControl.enabled = true
  saveProjectDraft()
  ElMessage.success('草图已完成AI线稿优化并启用')
}
function confirmSketchUse() {
  const preview = project.sketchOptimized || project.sketchOriginal
  project.lineControl.enabled = true
  if (preview && !(project.referenceImages || []).some((item) => item.preview === preview)) {
    project.referenceImages = [
      ...(project.referenceImages || []),
      {
        id: `scan-${Date.now()}`,
        name: '扫描草图',
        source: 'scan',
        preview,
        edited: false,
        createdAt: new Date().toISOString(),
      },
    ]
  }
  referenceStackExpanded.value = Boolean(project.referenceImages?.length)
  showSketchDialog.value = false
  saveProjectDraft()
  ElMessage.success('已加入参考图并启用线稿控制')
}
function disableSketchUse() {
  project.lineControl.enabled = false
  saveProjectDraft()
  ElMessage.success('已取消线稿控制')
}
function adjustSketch(payload) {
  project.lineControl = { ...project.lineControl, ...payload }
  saveProjectDraft()
}
function resetSketchAdjust() {
  project.lineControl.thickness = 50
  project.lineControl.contrast = 60
  project.lineControl.strength = 70
  project.lineControl.mode = 'clean-line'
  saveProjectDraft()
}
function resetSketch() {
  project.sketchOriginal = ''
  project.sketchOptimized = ''
  project.referenceImages = []
  project.sketchScore = 0
  project.sketchComment = ''
  project.sketchSource = ''
  project.sketchStage = 'idle'
  project.sketchProgress = 0
  project.sketchCurrentStep = ''
  project.lineControl.enabled = false
  saveProjectDraft()
}

async function optimizeCurrentPrompt() {
  const editorPrompt = serializePromptEditor()
  if (editorPrompt !== form.prompt) form.prompt = editorPrompt
  if (!form.optimize) {
    ElMessage.warning('请先开启提示词优化')
    return
  }
  if (!form.prompt.trim()) {
    ElMessage.warning('请先填写需要优化的提示词')
    return
  }
  form.originalPrompt = form.prompt
  optimizing.value = true
  try {
    const result = await optimizeArtworkPrompt({ prompt: form.prompt, strength: form.strength })
    form.prompt = result.prompt
    ElMessage.success('提示词智能体已完成优化')
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || error.message || '提示词优化失败，请稍后重试')
  } finally {
    optimizing.value = false
  }
}
async function optimizePromptFromChip() {
  activeChipMenu.value = ''
  showMentionPanel.value = false
  showReferenceMenu.value = false
  referenceStackExpanded.value = false
  form.optimize = true
  await optimizeCurrentPrompt()
}
function clearPromptText() {
  form.originalPrompt = form.prompt
  form.prompt = ''
  form.negativePrompt = ''
  saveDraft()
  ElMessage.success('已清空提示词')
}
function applyStyleTemplate(style) {
  form.theme = style.name
  form.prompt = (form.prompt ? form.prompt + '，' : '') + style.prompt
  saveDraft()
  ElMessage.success('已应用' + style.name + '风格')
}
function applyWorkflow(workflow) {
  activeWorkflowId.value = workflow.id
  form.theme = workflow.theme
  form.ratio = workflow.ratio
  form.count = workflow.count
  form.originalPrompt = form.prompt
  if (workflow.managedSkill) {
    form.prompt = form.prompt || workflow.configuration?.inputFields?.find((item) => item.required)?.placeholder || ''
    ElMessage.success(`已选择“${workflow.title}”，生成时将按后台发布的玩法配置执行`)
  } else form.prompt = form.prompt ? `${form.prompt}，${workflow.prompt}` : workflow.prompt
  saveDraft()
  if (!workflow.managedSkill) ElMessage.success('已选择' + workflow.title + '模板工作流')
}
function openYoungSidebar(mode) {
  if (!isJuniorStarter.value) return
  youngSidebarMode.value = mode === 'workflow' ? 'workflow' : 'prompt-library'
}
function toggleYoungPrompt(item) {
  if (!youngPromptBase.value && !selectedYoungPromptIds.value.length) youngPromptBase.value = form.prompt.trim()
  const selected = selectedYoungPromptIds.value.includes(item.id)
  selectedYoungPromptIds.value = selected
    ? selectedYoungPromptIds.value.filter((id) => id !== item.id)
    : [...selectedYoungPromptIds.value, item.id]
  const promptParts = [youngPromptBase.value, ...selectedYoungPromptItems.value.map((promptItem) => promptItem.prompt)].filter(Boolean)
  form.prompt = promptParts.join('，')
  nextTick(() => syncPromptEditorFromText(form.prompt))
  saveDraft()
}
function clearYoungPrompts() {
  selectedYoungPromptIds.value = []
  form.prompt = youngPromptBase.value
  youngPromptBase.value = ''
  nextTick(() => syncPromptEditorFromText(form.prompt))
  saveDraft()
}
/**
 * 点生成之后输入框统一清空。
 * ① 提示词已经跟着任务提交走了，留在框里用户会以为「没发出去」，容易连点造成重复出图；
 * ② 编辑器是 contenteditable，带焦点时 syncPromptEditorFromText 会主动跳过（怕抢光标），
 *    所以这里必须直接清 DOM，否则会出现「数据空了、屏幕上字还在」。
 */
function resetYoungPromptSelectionAfterSubmit() {
  if (isJuniorStarter.value) {
    selectedYoungPromptIds.value = []
    youngPromptBase.value = ''
  }
  form.prompt = ''
  form.originalPrompt = ''
  if (promptInputRef.value) promptInputRef.value.textContent = ''
  savedPromptRange = null
  saveDraft()
}
function openWorkflowCard(workflow) {
  if (workflow.managedSkill) {
    router.push(`/student/skills/${encodeURIComponent(workflow.id)}`)
    return
  }
  // 源码里写死的示例卡片只占位：后台还没发布玩法时把卡片位置留着，
  // 但点了什么都不做。以前会把提示词塞进输入框，用户会以为「玩法已经生效」，
  // 实际既没进配置页、也没走老师搭的画布流程 —— 这是最容易误导人的地方。
}
function clearStyleTags() {
  form.theme = ''
  form.stylePreset = 'none'
  saveDraft()
  ElMessage.success('已清空风格标签')
}
function inferMaterialCategory(item = {}) {
  const explicit = item.category || item.courseCategory || item.theme || item.type || item.source || ''
  const text = `${explicit} ${item.title || ''} ${item.prompt || ''} ${item.batchPrompt || ''}`.toLowerCase()
  const rules = [
    { category: '门头设计', words: ['门头', '招牌', '店铺', '商家', '奶茶店'] },
    { category: 'IP形象', words: ['ip', '形象', '角色', '吉祥物', '店长'] },
    { category: '广告设计', words: ['广告', '海报', '宣传', '标题'] },
    { category: '漫画人物', words: ['漫画', '动漫', '人物', '表情'] },
    { category: '产品设计', words: ['产品', '包装', '盒型', '标签'] },
    { category: '室内设计', words: ['室内', '房间', '空间', '家居'] },
    { category: '汽车造型', words: ['汽车', '车', '交通工具'] },
    { category: '教育绘本', words: ['绘本', '分镜', '故事书'] },
    { category: '创意画', words: ['创意', '风景', '建筑', '国画', '水彩', '油画', 'ai绘画', '参考图'] },
  ]
  return rules.find((rule) => rule.words.some((word) => text.includes(word)))?.category || '创意画'
}
function readTokenBalance() {
  const saved = Number(localStorage.getItem(TOKEN_BALANCE_KEY))
  return Number.isFinite(saved) && saved >= 0 ? saved : defaultTokenBalance
}
function persistTokenBalance(value) {
  tokenBalance.value = Math.max(0, Number(value) || 0)
  localStorage.setItem(TOKEN_BALANCE_KEY, String(tokenBalance.value))
}
function recordTokenUsage(cost, meta = {}) {
  if (!cost) return
  persistTokenBalance(tokenBalance.value - cost)
  let ledger = []
  try {
    ledger = JSON.parse(localStorage.getItem(TOKEN_LEDGER_KEY) || '[]')
  } catch {
    ledger = []
  }
  const record = {
    id: `token-${Date.now()}`,
    type: 'AI绘画生成',
    amount: -cost,
    balance: tokenBalance.value,
    model: meta.model || selectedModel.value.label,
    count: meta.count || Number(form.count || 1),
    projectId: project.id,
    createdAt: new Date().toISOString(),
  }
  localStorage.setItem(TOKEN_LEDGER_KEY, JSON.stringify([record, ...ledger].slice(0, 80)))
  project.tokenUsage = [record, ...(project.tokenUsage || [])].slice(0, 80)
}
async function refreshAvailableModels() {
  try {
    const health = await testAiConnection()
    const providerData = health?.data?.providers
    const providers = Array.isArray(providerData)
      ? providerData
      : Object.entries(providerData || {}).map(([key, value]) => ({ key, ...value }))
    const modelOptions = providers
      .filter((item) => item.configured)
      .flatMap((item) => (item.imageModels || (item.imageModel ? [item.imageModel] : [])).map((model) => {
        const fallback = defaultAiModels.find((entry) => entry.provider === item.key)
        return {
          id: `${item.key}-${model}`,
          label: `${item.label || item.key} · ${item.modelLabels?.[model] || model}`,
          provider: item.key,
          model,
          cost: fallback?.cost || 8,
          configured: true,
        }
      }))
    modelHealthOptions.value = modelOptions
    if (!modelOptions.some((item) => item.id === form.modelId)) form.modelId = modelOptions[0]?.id || ''
  } catch {
    modelHealthOptions.value = []
  }
}
function chooseReferenceSource(type) {
  showReferenceMenu.value = false
  showMentionPanel.value = false
  referenceStackExpanded.value = false
  if (type === 'scan') {
    openSketchDialog()
    return
  }
  if (type === 'album') {
    localReferenceInput.value?.click()
    return
  }
  selectedLibraryMode.value = 'mine'
  openReferenceLibrary('资源库')
}
function toggleReferenceMenu() {
  showReferenceMenu.value = !showReferenceMenu.value
  referenceStackExpanded.value = false
  showMentionPanel.value = false
  activeChipMenu.value = ''
}
function handleReferenceStackClick() {
  showMentionPanel.value = false
  activeChipMenu.value = ''
  if (project.referenceImages?.length) {
    referenceStackExpanded.value = !referenceStackExpanded.value
    showReferenceMenu.value = false
    return
  }
  toggleReferenceMenu()
}
function handleLocalReferenceFile(event) {
  const files = Array.from(event.target.files || []).filter((file) => file.type?.startsWith('image/'))
  if (!files.length) {
    ElMessage.warning('请选择图片文件')
    event.target.value = ''
    return
  }
  Promise.all(files.map(readImageFile))
    .then((items) => {
      project.referenceImages = [...(project.referenceImages || []), ...items]
      if (!project.sketchOriginal) project.sketchOriginal = items[0].preview
      referenceStackExpanded.value = Boolean(project.referenceImages.length)
      saveProjectDraft()
      ElMessage.success(`已上传${items.length}张参考图`)
    })
    .catch((error) => {
      ElMessage.error(error?.message || '图片读取失败，请重新选择')
    })
  event.target.value = ''
}
function toggleMentionPanel() {
  if (showMentionPanel.value) removePromptInsertMarker()
  else placePromptInsertMarker()
  showMentionPanel.value = !showMentionPanel.value
  activeChipMenu.value = ''
  showReferenceMenu.value = false
  referenceStackExpanded.value = false
}
function triggerMentionImageUpload() {
  savePromptSelection()
  mentionImageInput.value?.click()
}
function handleMentionImageFile(event) {
  const files = Array.from(event.target.files || []).filter((file) => file.type?.startsWith('image/'))
  if (!files.length) {
    ElMessage.warning('请选择图片文件')
    event.target.value = ''
    return
  }
  Promise.all(files.map((file) => readImageFile(file, 'mention-upload')))
    .then((items) => {
      project.referenceImages = [...(project.referenceImages || []), ...items]
      if (!project.sketchOriginal) project.sketchOriginal = items[0].preview
      referenceStackExpanded.value = false
      nextTick(() => {
        items.forEach((item) => insertPromptImageChip(item))
        updatePromptFromEditor()
      })
      saveProjectDraft()
      showMentionPanel.value = false
      ElMessage.success(`已通过@加入${items.length}张参考图`)
    })
    .catch((error) => {
      ElMessage.error(error?.message || '图片读取失败，请重新选择')
    })
  event.target.value = ''
}
function removeMentionAttachment(id) {
  removeReferenceImage(id, { silent: true })
}
function selectMentionSkill(workflow) {
  applyWorkflow(workflow)
  activeSkillMention.value = { id: workflow.id, title: workflow.title }
  mentionTab.value = 'skill'
  nextTick(() => {
    insertPromptSkillChip(workflow)
    updatePromptFromEditor()
    showMentionPanel.value = false
  })
}
function clearSkillMention() {
  activeSkillMention.value = null
}
function openReferenceEditor(id) {
  editingReferenceId.value = id
  referenceEditTool.value = 'paint'
  showReferenceEditor.value = true
}
function removeReferenceImage(id, options = {}) {
  removeInlineImageChips(id)
  project.referenceImages = (project.referenceImages || []).filter((item) => item.id !== id)
  if (!project.referenceImages.length) referenceStackExpanded.value = false
  if (project.sketchOriginal && !project.referenceImages.some((item) => item.preview === project.sketchOriginal)) {
    project.sketchOriginal = project.referenceImages[0]?.preview || ''
  }
  if (editingReferenceId.value === id) {
    showReferenceEditor.value = false
    editingReferenceId.value = ''
  }
  saveProjectDraft()
  if (!options.silent) ElMessage.success('已删除参考图')
}
function saveReferenceEdit() {
  const item = editingReference.value
  if (!item) return
  item.edited = true
  item.editTool = referenceEditTool.value
  item.updatedAt = new Date().toISOString()
  saveProjectDraft()
  showReferenceEditor.value = false
  ElMessage.success('参考图编辑已保存')
}
function openReferenceLibrary(title) {
  libraryDialogTitle.value = title
  showLibraryDialog.value = true
  showReferenceMenu.value = false
  referenceStackExpanded.value = false
  // 每次打开都重新拉一遍，刚在手绘板存下的稿子立刻可选。
  loadSketchMaterials()
}
function selectLibraryMode(mode) {
  selectedLibraryMode.value = mode
  selectedLibraryCategory.value = 'all'
}
function useLibraryMaterial(item) {
  const preview = extractReferenceImageUrl(item)
  if (!preview) {
    ElMessage.warning('该素材只有提示词或渐变封面，没有可发送给 AI 的真实图片。请选择上传图或已生成的作品。')
    return
  }
  form.prompt = `${form.prompt ? `${form.prompt}，` : ''}参考作品《${item.title}》：${item.prompt || '延续主体风格和构图'}`
  project.referenceImages = [
    ...(project.referenceImages || []),
    {
      id: `library-${Date.now()}`,
      name: item.title,
      preview,
      source: item.source,
      createdAt: new Date().toISOString(),
    },
  ]
  if (!project.sketchOriginal) project.sketchOriginal = preview
  showLibraryDialog.value = false
  saveDraft()
  ElMessage.success('已加入参考图，本次生成将使用该图片')
}
// 生成好的图直接「引用」进参考图：不插提示词、不弹资源库，只把这一张塞进参考图区
function referenceBatchArtwork(version) {
  const preview = version?.id ? getArtworkImageUrl(version) : ''
  if (!preview) {
    ElMessage.warning('这一批还没有可引用的图，等出图后再点引用')
    return
  }
  const exists = (project.referenceImages || []).some((item) => item.preview === preview)
  if (exists) {
    referenceStackExpanded.value = true
    saveProjectDraft()
    ElMessage.info('这张图已经在参考图里了')
    return
  }
  project.referenceImages = [
    ...(project.referenceImages || []),
    {
      id: `artwork-${Date.now()}`,
      name: version.title || '生成作品',
      preview,
      source: 'artwork',
      createdAt: new Date().toISOString(),
    },
  ]
  if (!project.sketchOriginal) project.sketchOriginal = preview
  referenceStackExpanded.value = true
  saveProjectDraft()
  ElMessage.success('已加入参考图，下次生成会把它一起带上')
}
function selectCount(count) {
  form.count = count
  saveDraft()
}
function dismissImageSettings() {
  if (activeChipMenu.value === 'imageSettings') activeChipMenu.value = ''
}
function closeImageSettings() {
  dismissImageSettings()
  imageSettingsButtonRef.value?.focus()
}
function handleImageSettingsOutside(event) {
  if (!imageSettingsRef.value?.contains(event.target) && !imageSettingsPanelRef.value?.contains(event.target)) dismissImageSettings()
}
// 参考图条：点这块窗口以外的地方就收回去（上传/引用后仍会自动展开给个反馈）
function handleReferenceStripOutside(event) {
  if (!referenceStackExpanded.value) return
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('.reference-stack-shell') || target.closest('.reference-strip')) return
  // 点「引用」本身不算离开：它刚把图放进去，正要展开给人看
  if (target.closest('[data-reference-keep]')) return
  // 弹窗（智能参考、资源库）里的操作不算「离开」
  if (target.closest('.el-overlay')) return
  referenceStackExpanded.value = false
}
function handleChipMenusOutside(event) {
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('.paint-pop') || target.closest('.paint-chip') || target.closest('.paint-ref') || target.closest('.el-overlay')) return
  if (activeChipMenu.value && activeChipMenu.value !== 'imageSettings') activeChipMenu.value = ''
  if (showMentionPanel.value) {
    removePromptInsertMarker()
    showMentionPanel.value = false
  }
  showReferenceMenu.value = false
}
function toggleImageSettings() {
  const bounds = imageSettingsButtonRef.value.getBoundingClientRect()
  const width = Math.min(564, window.innerWidth - 32)
  imageSettingsPosition.value = {
    width: `${width}px`,
    left: `${Math.max(16, Math.min(bounds.left + bounds.width / 2 - width / 2, window.innerWidth - width - 16))}px`,
    bottom: `${window.innerHeight - bounds.top + 12}px`,
    maxHeight: `${Math.max(0, bounds.top - 28)}px`,
  }
  toggleChipMenu('imageSettings')
}
function toggleChipMenu(name) {
  showMentionPanel.value = false
  showReferenceMenu.value = false
  referenceStackExpanded.value = false
  activeChipMenu.value = activeChipMenu.value === name ? '' : name
}
function selectAiModel(id) {
  form.modelId = id
  activeChipMenu.value = ''
  saveDraft()
}
function selectRatio(value) {
  form.ratio = value
  saveDraft()
}
function selectStylePreset(value) {
  form.stylePreset = value
  activeChipMenu.value = ''
  saveDraft()
}
function selectQuality(value) {
  form.quality = value
  saveDraft()
}
async function selectOptimizeStrength(value) {
  form.strength = value
  activeChipMenu.value = ''
  saveDraft()
  await optimizeCurrentPrompt()
}
function isRangeInsidePromptEditor(range) {
  const editor = promptInputRef.value
  if (!editor || !range) return false
  return editor.contains(range.startContainer) && editor.contains(range.endContainer)
}
function getPromptSelectionRange() {
  const selection = window.getSelection?.()
  if (!selection || !selection.rangeCount) return null
  const range = selection.getRangeAt(0)
  return isRangeInsidePromptEditor(range) ? range : null
}
function savePromptSelection() {
  const range = getPromptSelectionRange()
  if (range) savedPromptRange = range.cloneRange()
}
function restorePromptSelection() {
  const editor = promptInputRef.value
  if (!editor) return null
  const selection = window.getSelection?.()
  if (!selection) return null
  let range = savedPromptRange && isRangeInsidePromptEditor(savedPromptRange) ? savedPromptRange.cloneRange() : null
  if (!range) {
    range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
  }
  selection.removeAllRanges()
  selection.addRange(range)
  return range
}
function setPromptCaretAfter(node) {
  const selection = window.getSelection?.()
  if (!selection) return
  const range = document.createRange()
  range.setStartAfter(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  savedPromptRange = range.cloneRange()
}
function makeShortFileName(name = '参考图') {
  const clean = String(name || '参考图').trim()
  if (clean.length <= 18) return clean
  const dotIndex = clean.lastIndexOf('.')
  const ext = dotIndex > -1 ? clean.slice(dotIndex) : ''
  return `${clean.slice(0, 10)}...${ext || clean.slice(-4)}`
}
function createPromptImageChip(item) {
  const chip = document.createElement('span')
  chip.className = 'prompt-inline-chip prompt-inline-image'
  chip.contentEditable = 'false'
  chip.dataset.tokenType = 'image'
  chip.dataset.referenceId = item.id
  chip.dataset.tokenText = `@${item.name || '参考图'}`
  chip.title = item.name || '参考图'

  const img = document.createElement('img')
  img.src = item.preview
  img.alt = item.name || '参考图'

  const label = document.createElement('span')
  label.textContent = `@${makeShortFileName(item.name || '参考图')}`

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'prompt-inline-remove'
  remove.title = '删除这个@图片'
  remove.textContent = '×'

  chip.append(img, label, remove)
  return chip
}
function createPromptSkillChip(workflow) {
  const chip = document.createElement('span')
  chip.className = 'prompt-inline-chip prompt-inline-skill'
  chip.contentEditable = 'false'
  chip.dataset.tokenType = 'skill'
  chip.dataset.skillId = workflow.id
  chip.dataset.tokenText = `@${workflow.title}`
  chip.title = workflow.short || workflow.title

  const label = document.createElement('span')
  label.textContent = `@${workflow.title}`
  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'prompt-inline-remove'
  remove.title = '删除这个@技能'
  remove.textContent = '×'
  chip.append(label, remove)
  return chip
}
function insertPromptNode(node) {
  const editor = promptInputRef.value
  if (!editor) return
  const marker = editor.querySelector('.prompt-insert-marker')
  if (marker) {
    const spacer = document.createTextNode(' ')
    marker.replaceWith(node, spacer)
    setPromptCaretAfter(spacer)
    return
  }
  const liveRange = getPromptSelectionRange()
  const preferredRange = liveRange
    ? liveRange.cloneRange()
    : (savedPromptRange && isRangeInsidePromptEditor(savedPromptRange) ? savedPromptRange.cloneRange() : null)
  editor.focus()
  const selection = window.getSelection?.()
  if (!selection) return
  let range = preferredRange
  if (!range) {
    range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
  }
  selection.removeAllRanges()
  selection.addRange(range)
  if (!range) return
  range.deleteContents()
  range.insertNode(node)
  const spacer = document.createTextNode(' ')
  range.setStartAfter(node)
  range.collapse(true)
  range.insertNode(spacer)
  setPromptCaretAfter(spacer)
}
function insertPromptImageChip(item) {
  insertPromptNode(createPromptImageChip(item))
}
function insertPromptSkillChip(workflow) {
  insertPromptNode(createPromptSkillChip(workflow))
}
function serializePromptNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  if (node.classList?.contains('prompt-insert-marker')) return ''
  if (node.classList?.contains('prompt-young-token')) {
    return Array.from(node.childNodes)
      .filter((child) => !child.classList?.contains('selected-prompt-icon'))
      .map(serializePromptNode)
      .join('')
  }
  if (node.classList?.contains('prompt-inline-chip')) return node.dataset.tokenText || node.textContent || ''
  if (node.tagName === 'BR') return '\n'
  return Array.from(node.childNodes).map(serializePromptNode).join('')
}
function serializePromptEditor() {
  const editor = promptInputRef.value
  if (!editor) return form.prompt
  return Array.from(editor.childNodes)
    .map(serializePromptNode)
    .join('')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
function updatePromptFromEditor() {
  promptEditorSyncing = true
  form.prompt = serializePromptEditor()
  saveDraft()
  nextTick(() => {
    promptEditorSyncing = false
  })
}
function syncPromptEditorFromText(text = '') {
  const editor = promptInputRef.value
  if (!editor || document.activeElement === editor) return
  promptEditorSyncing = true
  editor.textContent = ''
  if (isJuniorStarter.value && selectedYoungPromptItems.value.length) {
    let cursor = 0
    selectedYoungPromptItems.value.forEach((item) => {
      const index = text.indexOf(item.prompt, cursor)
      if (index < cursor) return
      if (index > cursor) editor.append(document.createTextNode(text.slice(cursor, index)))
      const token = document.createElement('span')
      token.className = 'prompt-young-token'
      token.dataset.promptId = item.id
      token.contentEditable = 'true'
      const icon = document.createElement('span')
      icon.className = 'selected-prompt-icon'
      icon.contentEditable = 'false'
      icon.title = item.label
      if (item.iconImageUrl) {
        const image = document.createElement('img')
        image.src = item.iconImageUrl
        image.alt = item.label
        icon.append(image)
      } else {
        icon.dataset.icon = item.icon || '✨'
      }
      token.append(icon, document.createTextNode(item.prompt))
      editor.append(token)
      cursor = index + item.prompt.length
    })
    if (cursor < text.length) editor.append(document.createTextNode(text.slice(cursor)))
  } else editor.textContent = text || ''
  nextTick(() => {
    promptEditorSyncing = false
  })
}
function removePromptInsertMarker() {
  const editor = promptInputRef.value
  if (!editor) return
  editor.querySelectorAll('.prompt-insert-marker').forEach((marker) => marker.remove())
}
function placePromptInsertMarker() {
  const editor = promptInputRef.value
  if (!editor) return
  removePromptInsertMarker()
  const liveRange = getPromptSelectionRange()
  const preferredRange = liveRange
    ? liveRange.cloneRange()
    : (savedPromptRange && isRangeInsidePromptEditor(savedPromptRange) ? savedPromptRange.cloneRange() : null)
  if (!preferredRange) return
  const marker = document.createElement('span')
  marker.className = 'prompt-insert-marker'
  marker.contentEditable = 'false'
  marker.dataset.promptMarker = 'true'
  preferredRange.deleteContents()
  preferredRange.insertNode(marker)
  setPromptCaretAfter(marker)
}
function handlePromptEditorClick(event) {
  const removeButton = event.target?.closest?.('.prompt-inline-remove')
  if (removeButton) {
    event.preventDefault()
    const chip = removeButton.closest('.prompt-inline-chip')
    chip?.remove()
    updatePromptFromEditor()
    savePromptSelection()
    return
  }
  savePromptSelection()
}
function handlePromptEditorFocus() {
  savePromptSelection()
}
function handlePromptSelectionChange() {
  savePromptSelection()
}
function handlePromptEditorInput() {
  if (isJuniorStarter.value) {
    const editor = promptInputRef.value
    editor?.querySelectorAll('.prompt-young-token').forEach((token) => {
      const text = Array.from(token.childNodes).filter((node) => !node.classList?.contains('selected-prompt-icon')).map((node) => node.textContent || '').join('').trim()
      if (!text) token.remove()
    })
    const remainingIds = new Set(Array.from(editor?.querySelectorAll('.prompt-young-token') || []).map((token) => token.dataset.promptId))
    selectedYoungPromptIds.value = selectedYoungPromptIds.value.filter((id) => remainingIds.has(id))
  }
  updatePromptFromEditor()
  savePromptSelection()
}
function handlePromptEditorPaste(event) {
  event.preventDefault()
  const text = event.clipboardData?.getData('text/plain') || ''
  if (!text) return
  const editor = promptInputRef.value
  if (!editor) return
  editor.focus()
  const range = restorePromptSelection()
  if (!range) return
  range.deleteContents()
  const textNode = document.createTextNode(text)
  range.insertNode(textNode)
  setPromptCaretAfter(textNode)
  updatePromptFromEditor()
}
function removeInlineImageChips(referenceId) {
  const editor = promptInputRef.value
  if (!editor || !referenceId) return
  editor.querySelectorAll(`.prompt-inline-image[data-reference-id="${CSS.escape(referenceId)}"]`).forEach((chip) => chip.remove())
  promptEditorSyncing = true
  form.prompt = serializePromptEditor()
  nextTick(() => {
    promptEditorSyncing = false
  })
}
function removePreviousPromptUnit(range) {
  if (!range) return false
  const container = range.startContainer
  const offset = range.startOffset
  if (container.nodeType === Node.TEXT_NODE && offset > 0) {
    container.deleteData(offset - 1, 1)
    const nextRange = document.createRange()
    nextRange.setStart(container, offset - 1)
    nextRange.collapse(true)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(nextRange)
    savedPromptRange = nextRange.cloneRange()
    return true
  }
  if (container.nodeType === Node.ELEMENT_NODE && offset > 0) {
    const previous = container.childNodes[offset - 1]
    if (previous?.classList?.contains('prompt-inline-chip')) {
      previous.remove()
      return true
    }
    if (previous?.nodeType === Node.TEXT_NODE && previous.textContent.length) {
      previous.deleteData(previous.textContent.length - 1, 1)
      setPromptCaretAfter(previous)
      return true
    }
  }
  return false
}
function backspacePrompt() {
  const input = promptInputRef.value
  if (input?.isContentEditable) {
    input.focus()
    const range = restorePromptSelection()
    if (range && !range.collapsed) {
      range.deleteContents()
    } else {
      removePreviousPromptUnit(range)
    }
    updatePromptFromEditor()
    return
  }
  if (input && typeof input.selectionStart === 'number') {
    const start = input.selectionStart
    const end = input.selectionEnd
    if (start !== end) form.prompt = form.prompt.slice(0, start) + form.prompt.slice(end)
    else if (start > 0) form.prompt = form.prompt.slice(0, start - 1) + form.prompt.slice(start)
  } else {
    form.prompt = form.prompt.slice(0, -1)
  }
  saveDraft()
}
function openImageEditor(id) {
  if (!id || !project.versions.some((version) => version.id === id)) return
  selectedVersionId.value = id
  editingVersionId.value = id
  singleImagePrompt.value = ''
  singleImageMode.value = 'view'
  showImageEditor.value = true
}
function openSingleArtworkEditor() {
  const versionId = editingVersionId.value
  showImageEditor.value = false
  openArtworkEditor(versionId)
}
async function startSingleImageEdit() {
  if (singleImageMode.value === 'edit') return generateSingleImageEdit()
  singleImageMode.value = 'edit'
  await nextTick()
  singleImagePromptInput.value?.focus()
}
async function regenerateSingleImage() {
  if (singleImageEditing.value || !singleOriginalPrompt.value) return
  if (!availableAiModels.value.length) return ElMessage.warning('暂无可用绘画模型，请联系管理员开启模型后刷新页面')
  const prompt = singleOriginalPrompt.value
  singleImageEditing.value = true
  singleImageAction.value = 'again'
  try {
    const submission = await createArtworkSubmission()
    await runArtworkSubmission({ ...submission, basePrompt: prompt, prompt, count: 1, images: [], referenceImage: '', lineControl: { enabled: false }, ratio: editingVersion.value.ratio || editingVersion.value.batchMeta?.ratio || submission.ratio })
    showImageEditor.value = false
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || error?.message || '再次生成失败，请稍后重试')
  } finally {
    singleImageEditing.value = false
    singleImageAction.value = ''
  }
}
function openArtworkEditor(id) {
  if (!id || !project.versions.some((version) => version.id === id)) return
  selectedVersionId.value = id
  editingVersionId.value = id
  showArtworkEditor.value = true
}
function closeArtworkEditor() {
  showArtworkEditor.value = false
  if (route.query.edit) {
    const query = { ...route.query }
    delete query.edit
    delete query.versionId
    router.replace({ query })
  }
}
function reloadArtworkEdit(document) {
  Object.assign(project, document.data, { _serverDocumentId: document.id, _serverVersion: document.version })
}
function acceptArtworkEdit(result) {
  reloadArtworkEdit(result.document)
  selectedVersionId.value = result.versionId
  editingVersionId.value = result.versionId
}

async function generateSingleImageEdit() {
  if (singleImageEditing.value) return
  const prompt = singleImagePrompt.value.trim()
  if (!prompt) return ElMessage.warning('请先填写修改要求')
  const source = getArtworkImageUrl(editingVersion.value)
  if (!source) return ElMessage.warning('该版本没有可修改的图片')
  if (!availableAiModels.value.length) return ElMessage.warning('暂无可用绘画模型，请联系管理员开启模型后刷新页面')
  singleImageEditing.value = true
  singleImageAction.value = 'edit'
  try {
    const submission = await createArtworkSubmission()
    await runArtworkSubmission({
      ...submission,
      basePrompt: prompt,
      prompt: `以参考图片为基础修改，尽量保留原有风格和未提及的内容。修改要求：${prompt}`,
      count: 1,
      ratio: editingVersion.value.ratio || editingVersion.value.batchMeta?.ratio || submission.ratio,
      images: [source],
      referenceImage: '',
      lineControl: { enabled: false },
    })
    showImageEditor.value = false
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || error?.message || '图片修改失败，请稍后重试')
  } finally {
    singleImageEditing.value = false
    singleImageAction.value = ''
  }
}

async function createArtworkSubmission() {
  const basePrompt = form.prompt || `画一个${form.theme}，儿童美术课堂风格，明亮活泼。`
  const stylePrompt = selectedStyle.value.prompt && !basePrompt.includes(selectedStyle.value.prompt) ? `，${selectedStyle.value.prompt}` : ''
  const lineControlPrompt = project.lineControl.enabled ? '，参考用户手绘草图造型生成' : ''
  const prompt = `${basePrompt}${stylePrompt}${lineControlPrompt}`
  const resolvedRatio = form.ratio === '自动'
    ? await resolveSmartRatio({
      referenceImages: [
        ...(project.referenceImages || []).map((item) => item.preview),
        project.sketchOptimized,
        project.sketchOriginal,
      ],
      prompt,
      candidates: ratioOptions.map((item) => item.value).filter((value) => value !== '自动'),
      fallback: '1:1',
    })
    : form.ratio
  generationPreviewRatio.value = resolvedRatio
  const createdAt = new Date().toISOString()
  return {
    id: `image-job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    batchId: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    basePrompt,
    prompt,
    negativePrompt: form.negativePrompt,
    difficulty: difficultyStore.current,
    theme: form.theme,
    styleLabel: selectedStyle.value.label,
    count: Math.min(Math.max(Number(form.count || 1), 1), 4),
    ratio: resolvedRatio,
    quality: qualityLabel.value,
    provider: selectedModel.value.provider,
    model: selectedModel.value.model,
    modelLabel: selectedModel.value.label,
    modelCost: selectedModel.value.cost || defaultAiModels[0].cost,
    lineControl: { ...project.lineControl },
    images: (project.referenceImages || []).map((item) => item.preview),
    referenceImage: project.sketchOptimized || project.sketchOriginal || '',
    projectId: project.id,
    createdAt,
  }
}
async function runArtworkSubmission(submission) {
  const batchMeta = {
    model: submission.modelLabel,
    modelId: submission.model,
    provider: submission.provider,
    style: submission.styleLabel,
    ratio: submission.ratio,
    quality: submission.quality,
    count: submission.count,
    tokenCost: submission.modelCost * submission.count,
  }
  const response = await generateArtwork({
    prompt: submission.prompt,
    negativePrompt: submission.negativePrompt,
    difficulty: submission.difficulty,
    style: submission.styleLabel === '不指定' ? submission.theme : submission.styleLabel,
    count: submission.count,
    ratio: submission.ratio,
    quality: submission.quality,
    provider: submission.provider,
    model: submission.model,
    lineControl: submission.lineControl,
    images: submission.images,
    referenceImage: submission.referenceImage,
    projectId: submission.projectId,
  })
  const results = response.results
  batchMeta.provider = results[0]?.provider || response.source
  batchMeta.model = results[0]?.model || batchMeta.model
  // 不同难度共用同一生成接口，接口返回的每一张图都属于本次批次。
  // 低龄版也可能由提示词玩法配置返回多张，不能按难度再截成一张。
  const batchSize = Math.min(results.length, Math.max(Number(submission.count) || 1, 1))
  const batch = results.slice(0, batchSize).map((item, index) => ({
    ...item,
    id: `version-${Date.now()}-${index}`,
    title: project.versions.length || index ? `V${project.versions.length + index + 1}候选图` : 'V1初稿',
    batchId: submission.batchId,
    batchPrompt: submission.prompt,
    batchMeta,
    ratio: batchMeta.ratio,
    quality: batchMeta.quality,
    note: response.source === 'api'
      ? '真实API生成'
      : response.source === 'mock-fallback'
        ? 'API失败后Mock回退'
        : (project.versions.length ? '本轮Mock生成' : '首次Mock生成'),
    provider: item.provider || response.source,
    model: item.model || batchMeta.model,
    createdAt: submission.createdAt,
  }))
  const actualTokenCost = submission.modelCost * batch.length
  batchMeta.tokenCost = actualTokenCost
  project.versions = [...project.versions, ...batch]
  project.finalVersionId = project.finalVersionId || batch[0].id
  project.cover = batch[0].background
  selectedVersionId.value = batch[0].id
  recordTokenUsage(actualTokenCost, { model: batchMeta.model, count: batch.length })
  saveProjectToPortfolio()
  if (response.source === 'api') ElMessage.success('真实AI接口已返回作品')
  else if (response.source === 'mock-fallback') ElMessage.warning(response.error || '真实API失败，已用Mock结果回退')
  else ElMessage.success('示意图已生成（演示模式，未调用真实 AI）')
  speak(batch.length > 1 ? '已生成' + batch.length + '张候选作品' : '作品生成完成')
}
async function confirmAdditionalImageTask(required = hasActiveImageGenerationJobs.value) {
  if (!required) return true
  try {
    await ElMessageBox.confirm('当前还有图片正在生成，是否继续提交新的生图任务？', '继续生成图片', {
      confirmButtonText: '确认生成',
      cancelButtonText: '取消',
      type: 'warning',
      closeOnClickModal: false,
    })
    return true
  } catch {
    return false
  }
}
async function drainImageGenerationQueue() {
  if (imageGenerationQueueRunning) return
  imageGenerationQueueRunning = true
  try {
    let job = imageGenerationJobs.value.find((item) => item.status === 'queued')
    while (job) {
      job.status = 'loading'
      generating.value = true
      generationStatus.value = 'loading'
      generationError.value = ''
      try {
        await runArtworkSubmission(job.submission)
        imageGenerationJobs.value = imageGenerationJobs.value.filter((item) => item.id !== job.id)
        generationStatus.value = 'success'
      } catch (error) {
        job.status = 'failed'
        job.error = error?.response?.data?.message || error?.message || 'AI刚才开小差了，请再试一次。'
        generationStatus.value = 'error'
        generationError.value = job.error
      }
      job = imageGenerationJobs.value.find((item) => item.status === 'queued')
    }
  } finally {
    imageGenerationQueueRunning = false
    generating.value = hasActiveImageGenerationJobs.value
  }
}
function retryImageGeneration(jobId) {
  const job = imageGenerationJobs.value.find((item) => item.id === jobId)
  if (!job) return
  job.status = 'queued'
  job.error = ''
  void drainImageGenerationQueue()
}
function dismissImageGeneration(jobId) {
  imageGenerationJobs.value = imageGenerationJobs.value.filter((item) => item.id !== jobId)
  if (!imageGenerationJobs.value.length && generationStatus.value === 'error') generationStatus.value = project.versions.length ? 'success' : 'idle'
}
async function generate() {
  if (!availableAiModels.value.length) {
    ElMessage.warning('暂无可用绘画模型，请联系管理员开启模型后刷新页面')
    return
  }
  const confirmationRequired = hasActiveImageGenerationJobs.value
  imageSubmissionPreparingCount.value += 1
  let submission
  try {
    if (!(await confirmAdditionalImageTask(confirmationRequired))) return
    submission = await createArtworkSubmission()
  } catch (error) {
    generationStatus.value = 'error'
    generationError.value = error?.message || '画幅分析失败，请重新发送。'
    ElMessage.error(generationError.value)
    return
  } finally {
    imageSubmissionPreparingCount.value = Math.max(0, imageSubmissionPreparingCount.value - 1)
  }
  imageGenerationJobs.value.push({
    id: submission.id,
    prompt: submission.prompt,
    model: submission.modelLabel,
    ratio: submission.ratio,
    quality: submission.quality,
    count: submission.count,
    status: 'queued',
    error: '',
    createdAt: submission.createdAt,
    submission,
  })
  lastSubmittedPrompt.value = submission.basePrompt
  resetYoungPromptSelectionAfterSubmit()
  generating.value = true
  generationStatus.value = 'loading'
  void drainImageGenerationQueue()
}
async function createVersionVariant(action, baseVersionId = selectedVersion.value?.id) {
  const baseArtwork = project.versions.find((item) => item.id === baseVersionId) || selectedVersion.value
  const batchId = `batch-${Date.now()}`
  const version = await createVariant({ baseArtwork, prompt: form.prompt || lastSubmittedPrompt.value, action })
  const nextVersion = {
    ...version,
    batchId,
    batchPrompt: form.prompt || baseArtwork?.batchPrompt || baseArtwork?.prompt || '再次生成',
    batchMeta: {
      model: baseArtwork?.batchMeta?.model || '图片 5.0 Pro',
      ratio: baseArtwork?.batchMeta?.ratio || (form.ratio === '自动' ? '1:1' : form.ratio),
      quality: baseArtwork?.batchMeta?.quality || qualityLabel.value,
      count: 1,
    },
    ratio: baseArtwork?.ratio || baseArtwork?.batchMeta?.ratio || (form.ratio === '自动' ? '1:1' : form.ratio),
    quality: baseArtwork?.quality || baseArtwork?.batchMeta?.quality || qualityLabel.value,
    provider: version.provider || 'mock',
    createdAt: new Date().toISOString(),
  }
  project.versions = [...project.versions, nextVersion]
  selectedVersionId.value = nextVersion.id
  saveProjectToPortfolio()
}

async function generateManagedImageSkill(skill, subject) {
  const fields = skill.configuration?.inputFields || []
  const values = {}
  fields.forEach((field) => {
    if (field.type === 'image') values[field.key] = project.sketchOptimized || project.sketchOriginal || project.referenceImages?.[0]?.preview || ''
    else if (field.type === 'switch') values[field.key] = Boolean(field.defaultValue)
    else values[field.key] = subject || field.defaultValue || ''
  })
  const result = await runStudentAiSkill(skill.id, values)
  const images = result.images || []
  if (!images.length) throw new Error('玩法没有返回图像结果')
  return {
    source: 'managed-skill',
    results: images.map((item, index) => ({
      id: item.id || `managed-skill-${Date.now()}-${index}`,
      title: item.title || `${skill.title}作品 ${index + 1}`,
      prompt: subject,
      imageUrl: item.imageUrl || item.url || item.b64_json || '',
      background: item.background || (item.imageUrl || item.url ? `url("${item.imageUrl || item.url}") center / cover no-repeat` : ''),
      provider: result.provider || skill.configuration?.generation?.provider || 'api',
      model: skill.configuration?.generation?.model || '',
    })),
  }
}
function getBatchVersions(batchId) {
  return project.versions.filter((item) => (item.batchId || 'legacy-history') === batchId)
}
function extractDownloadUrl(version) {
  if (version?.imageUrl) return version.imageUrl
  const background = String(version?.background || '')
  const match = background.match(/url\(["']?([^"')]+)["']?\)/)
  return match?.[1] || ''
}
function extractReferenceImageUrl(item = {}) {
  const finalVersion = item.versions?.find((version) => version.id === item.finalVersionId) || item.versions?.[0] || {}
  const direct = [item.preview, item.imageUrl, item.url, item.finalArtworkUrl, item.referenceImage, finalVersion.preview, finalVersion.imageUrl, finalVersion.url].find(Boolean)
  if (direct) return String(direct)
  const background = String(finalVersion.background || item.background || item.cover || '')
  const match = background.match(/url\(["']?([^"')]+)["']?\)/)
  return match?.[1] || (background.startsWith('data:image/') || /^https?:\/\//.test(background) ? background : '')
}
function referenceImageCover(preview, fallback = '') {
  return preview ? `url("${preview}") center / cover no-repeat` : fallback
}
function downloadVersion(version, index = 0) {
  const url = extractDownloadUrl(version)
  if (!url) return false
  const link = document.createElement('a')
  link.href = url
  link.download = `${project.title || 'AI作品'}-${version.title || `候选图${index + 1}`}.png`
  link.target = '_blank'
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  return true
}
async function saveBatchToPortfolio(batchId) {
  const versions = getBatchVersions(batchId)
  if (!versions.length) return
  if (!project.finalVersionId) project.finalVersionId = versions[0].id
  if (!project.cover) project.cover = versions[0].background
  saveProjectToPortfolio()
  const downloaded = versions.reduce((count, version, index) => count + (downloadVersion(version, index) ? 1 : 0), 0)
  if (downloaded) ElMessage.success(`已保存到素材库，并开始下载${downloaded}张图片`)
  else ElMessage.success('已保存到素材库')
}
async function deleteBatch(batchId) {
  const versions = getBatchVersions(batchId)
  if (!versions.length) return
  try {
    await ElMessageBox.confirm(`确定删除这一组${versions.length}张候选图吗？删除后会进入回收站。`, '删除生成记录', { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' })
  } catch {
    return
  }
  const deletedAt = new Date().toISOString()
  const deleteIds = new Set(versions.map((item) => item.id))
  project.trash = [...versions.map((item) => ({ ...item, deletedAt })), ...(project.trash || [])]
  project.versions = project.versions.filter((item) => !deleteIds.has(item.id))
  if (deleteIds.has(project.finalVersionId)) project.finalVersionId = project.versions[0]?.id || ''
  selectedVersionId.value = project.versions[0]?.id || ''
  saveProjectToPortfolio()
  ElMessage.success('已删除这一组生成记录')
}
async function handleBatchMoreCommand(command) {
  const batchId = command?.batchId
  const versions = getBatchVersions(batchId)
  if (!batchId || !versions.length) return
  if (command.action === 'save') {
    await saveBatchToPortfolio(batchId)
    return
  }
  if (command.action === 'delete') {
    await deleteBatch(batchId)
    return
  }
  if (command.action === 'edit') {
    openArtworkEditor(versions[0].id)
  }
}
async function deleteVersion(id) {
  try {
    await ElMessageBox.confirm('删除后会进入回收站，7天内可恢复。确定删除吗？', '删除确认', { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' })
  } catch {
    return
  }
  const version = project.versions.find((item) => item.id === id)
  if (!version) return
  project.trash = [{ ...version, deletedAt: new Date().toISOString() }, ...(project.trash || [])]
  project.versions = project.versions.filter((item) => item.id !== id)
  selectedVersionId.value = project.versions[0]?.id || ''
  saveProjectToPortfolio()
}
function startFreshProject() { Object.assign(project, createEmptyProject(difficultyStore.current)); projectStore.startNewProject(difficultyStore.current); showResumeDialog.value = false }
// 离开本页（顶栏「主页」、AI 伙伴、头像菜单、退出登录）：和原来的「返回」按钮一样——有作品先存进作品集，再确认一次。
// 本页自己的跳转（玩法页、生成报告 / 视频 / 3D / 无限画布）不拦，和原来一致。
const PAINT_FLOW_PATHS = ['/student/skills/', '/student/h5-report', '/student/video', '/student/model3d', '/student/canvas', '/student/paint']
useLeaveGuard(async (to) => {
  const path = String(to?.path || '')
  if (PAINT_FLOW_PATHS.some((prefix) => path.startsWith(prefix))) return true
  if (project.versions.length) saveProjectToPortfolio()
  if (project.versions.length || form.prompt || project.ideaSummary) {
    try {
      await ElMessageBox.confirm('作品还没保存哦，确定要离开吗？', '离开确认', { confirmButtonText: '离开', cancelButtonText: '继续创作' })
    } catch {
      return false
    }
  }
  return true
})
// —— 左下角小画师（共用智能体） ----------------------------------------------
const agentPaintSamples = [
  '帮我画一只月球上的猫',
  '我想画恐龙，但不知道背景画什么',
  '画一张秋天的森林，暖一点',
]
const agentQuickLinks = [
  { label: '无限画布', action: 'canvas' },
  { label: 'AI视频', action: '/student/video' },
  { label: '项目报告高清', action: '/student/h5-report' },
]
/**
 * 交给智能体的「画布快照」。
 * 注意：智能体模式下底部大框里的文字是「用户对老师说的话」，不能当画布内容再传回去，
 * 否则老师会把「耳朵改大点」当成用户的画，自己跟自己绕圈。
 * 这里只用「真正生成过的那句」+ 用户已经选好的风格/比例等设置。
 */
const agentCanvasContext = computed(() => {
  const current = selectedVersion.value
  const madePrompt = String(current?.batchPrompt || current?.prompt || '').trim()
  const lastPrompt = String(lastSubmittedPrompt.value || madePrompt || '').trim()
  return {
    prompt: madePrompt,
    lastPrompt,
    style: form.stylePreset === 'none' ? '' : selectedStyle.value?.label || '',
    ratio: form.ratio,
    count: String(form.count || ''),
    negativePrompt: String(form.negativePrompt || '').trim(),
    theme: form.theme,
    quality: qualityLabel.value,
    doneCount: project.versions.length,
  }
})
function handleAgentQuickLink(action) {
  if (action === 'canvas') {
    goDerivative('canvas')
    return
  }
  openDerivativePage(action)
}
/**
 * 点头像 = 切模式。开：面板展开成对话窗；关：回到图像生成，大框照常直接出图。
 * 退出时不强清提示词——用户可能只是想自己改，别把刚理好的描述抹掉。
 */
function setAgentMode(next) {
  const value = Boolean(next)
  agentMode.value = value
  if (value) {
    stopAllSpeech()
    ElMessage.success('已进入智能体模式：大框里说想画什么，AI 伙伴帮你理')
  }
}
/**
 * 大框旁边那个「发送」，两种模式共用一个键：
 * - 图像模式：原样交给 generate()，行为不变；
 * - 智能体模式：先把大框里的话交给智能体理解，整理好的描述写回大框，然后直接出图。
 */
async function submitPrompt() {
  if (agentMode.value) {
    await runAgentFromPrompt()
    return
  }
  await generate()
}
/**
 * 智能体模式下的发送：说一句 → 老师整理 → 描述回填大框 → 直接开画。
 * 出图逻辑一行没改，还是 generate() 那套队列、比例、模型。
 */
async function runAgentFromPrompt() {
  if (agentAsking.value) return
  const text = (form.prompt || '').trim()
  if (!text) {
    ElMessage.warning('先跟 AI 伙伴说一句想画什么')
    promptInputRef.value?.focus()
    return
  }
  agentAsking.value = true
  try {
    const data = await agentDockRef.value?.say(text)
    // 没听懂 / 要追问：不画，等用户补一句。省得拿一句含糊的话烧 Token。
    if (!data?.readyToRun || !data?.prompt) return
    const prompt = String(data.prompt).trim()
    if (!prompt) return
    form.prompt = prompt
    // 描述已经由智能体整理过，再叠一层「提示词优化」会让它改回去。
    const previousOptimize = form.optimize
    form.optimize = false
    try {
      await nextTick()
      await generate()
    } finally {
      form.optimize = previousOptimize
    }
  } finally {
    agentAsking.value = false
  }
}
function goDerivative(type) {
  saveProjectToPortfolio()
  router.push({ report: '/student/h5-report', video: '/student/video', model3d: '/student/model3d', canvas: '/student/canvas' }[type] || '/student/paint')
}
function openDerivativePage(path) {
  try {
    saveProjectToPortfolio()
  } catch (error) {
    console.warn('跳转前保存项目失败', error)
    ElMessage.warning('当前草稿未能保存，已继续进入下一步创作')
  }
  router.push(path === '/student/h5-report' ? { path, query: { difficulty: difficultyStore.current } } : path)
}

function toggleVoiceInput() { voiceListening.value ? finishVoiceInput() : startVoiceInput() }
async function startVoiceInput() {
  resetVoiceSession()
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) {
    await startRecordedVoiceInput()
    return
  }
  activeRecognition = new SpeechRecognition()
  activeRecognition.lang = 'zh-CN'; activeRecognition.continuous = true; activeRecognition.interimResults = true
  voiceListening.value = true; voiceStatus.value = '语音识别已打开，说完后请再次点击结束。'
  activeRecognition.onresult = (event) => {
    let interim = ''
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const text = event.results[index][0].transcript
      if (event.results[index].isFinal) voiceTranscript += text
      else interim += text
    }
    voiceInterimTranscript = interim
    const preview = (voiceTranscript + voiceInterimTranscript).trim()
    if (preview) voiceStatus.value = '正在听写：' + preview
  }
  activeRecognition.onerror = async () => {
    stopRecognitionOnly()
    voiceListening.value = false
    voiceStatus.value = '实时识别不可用，正在切换本地录音...'
    await startRecordedVoiceInput()
  }
  activeRecognition.onend = () => { if (voiceListening.value && !voiceManualStop && !voiceMockMode) activeRecognition.start() }
  try { activeRecognition.start() } catch {
    voiceMockMode = true
    voiceListening.value = false
    voiceStatus.value = '语音启动失败，请允许麦克风权限，或用 Chrome / Edge 打开本页重试。'
    ElMessage.warning('语音启动失败')
  }
}
async function startRecordedVoiceInput() {
  if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
    const message = '当前浏览器无法使用麦克风录音，请用最新版 Chrome 或 Edge。'
    voiceStatus.value = message
    ElMessage.warning(message)
    return
  }
  try {
    activeVoiceStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    activeAudioContext = new AudioContext()
    recordedVoiceSampleRate = activeAudioContext.sampleRate
    activeAudioSource = activeAudioContext.createMediaStreamSource(activeVoiceStream)
    activeAudioProcessor = activeAudioContext.createScriptProcessor(4096, 1, 1)
    recordedVoiceChunks = []
    activeAudioProcessor.onaudioprocess = (event) => {
      recordedVoiceChunks.push(new Float32Array(event.inputBuffer.getChannelData(0)))
    }
    activeAudioSource.connect(activeAudioProcessor)
    activeAudioProcessor.connect(activeAudioContext.destination)
    voiceListening.value = true
    voiceStatus.value = '正在录音，说完后请再次点击结束。'
  } catch {
    stopRecordedVoiceInput()
    voiceStatus.value = '麦克风没有启动，请允许本页面使用麦克风后重试。'
    ElMessage.warning(voiceStatus.value)
  }
}
async function finishVoiceInput() {
  if (activeAudioContext) {
    await finishRecordedVoiceInput()
    return
  }
  const text = (voiceTranscript || voiceInterimTranscript).trim()
  stopVoiceInput()
  if (!text) {
    voiceStatus.value = '没有识别到语音内容，请靠近麦克风后重试。'
    ElMessage.warning('没有识别到语音内容')
    return
  }
  await applyVoiceText(text)
}
/**
 * 说完之后去哪儿：智能体模式下这句话是「跟老师说」，直接理解并出图；
 * 图像模式下还是老规矩——只写进提示词框，等用户自己按发送。
 */
async function applyVoiceText(text) {
  const value = String(text || '').trim()
  if (!value) return
  if (agentMode.value) {
    form.prompt = value
    saveDraft()
    await nextTick()
    await runAgentFromPrompt()
    return
  }
  form.prompt = form.prompt ? `${form.prompt}，${value}` : value
  saveDraft()
  ElMessage.success('语音内容已写入')
}
async function finishRecordedVoiceInput() {
  if (!activeAudioContext) return
  voiceListening.value = false
  voiceStatus.value = '正在识别语音...'
  try {
    const audioBlob = encodeRecordedVoiceWav(recordedVoiceChunks, recordedVoiceSampleRate)
    stopRecordedVoiceInput()
    if (!audioBlob.size) throw new Error('没有录到声音')
    const text = await transcribeArtworkVoice(audioBlob)
    voiceStatus.value = '语音内容已写入提示词。'
    await applyVoiceText(text)
  } catch (error) {
    stopRecordedVoiceInput()
    voiceStatus.value = error?.response?.data?.message || error?.message || '语音识别失败，请重试。'
    ElMessage.error(voiceStatus.value)
  }
}
function encodeRecordedVoiceWav(chunks, sampleRate) {
  const sampleCount = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const buffer = new ArrayBuffer(44 + sampleCount * 2)
  const view = new DataView(buffer)
  const writeText = (offset, text) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
  writeText(0, 'RIFF')
  view.setUint32(4, 36 + sampleCount * 2, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, sampleCount * 2, true)
  let offset = 44
  chunks.forEach((chunk) => chunk.forEach((sample) => {
    const value = Math.max(-1, Math.min(1, sample))
    view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true)
    offset += 2
  }))
  return new Blob([buffer], { type: 'audio/wav' })
}
function stopRecordedVoiceInput() {
  try { activeAudioProcessor?.disconnect() } catch {}
  try { activeAudioSource?.disconnect() } catch {}
  try { activeAudioContext?.close() } catch {}
  activeVoiceStream?.getTracks?.().forEach((track) => track.stop())
  activeVoiceStream = null
  activeAudioContext = null
  activeAudioSource = null
  activeAudioProcessor = null
  recordedVoiceChunks = []
}
function resetVoiceSession() { stopRecognitionOnly(); voiceManualStop = false; voiceMockMode = false; voiceTranscript = ''; voiceInterimTranscript = ''; voiceListening.value = false }
function stopRecognitionOnly() { if (activeRecognition) { try { activeRecognition.onend = null; activeRecognition.stop() } catch {} activeRecognition = null } }
function stopVoiceInput() { voiceManualStop = true; stopRecognitionOnly(); stopRecordedVoiceInput(); voiceMockMode = false; voiceListening.value = false }
function speak(text) { if (muted.value || !('speechSynthesis' in window) || !text) return; window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'zh-CN'; utterance.rate = 0.92; window.speechSynthesis.speak(utterance) }
</script>

<style scoped lang="scss">
/* ==========================================================================
   AI 绘画 · 2026-11 重新设计（只换界面，逻辑沿用）
   平板横屏优先：左 玩法/图标，右 作品流 + 输入区；所有可点区域 ≥ 40px
   ========================================================================== */

/* ---------- 顶栏右侧：语音播报 + 难度 ---------- */
.paint-bar-tools { display: flex; align-items: center; gap: 8px; }
.paint-voice {
  display: inline-flex; align-items: center; gap: 6px;
  height: 38px; min-height: 0; padding: 0 12px;
  border: 1px solid var(--su-line-strong); border-radius: 999px;
  background: var(--su-surface-solid); color: var(--su-accent);
  font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap;
}
.paint-voice.is-off { color: var(--su-muted); }
.paint-voice:hover { border-color: var(--su-accent); }

/* ---------- 骨架 ---------- */
.paint-layout {
  flex: 1; min-height: 0;
  display: grid;
  grid-template-columns: clamp(240px, 22vw, 300px) minmax(0, 1fr);
  gap: 12px;
}

/* ---------- 左侧 ---------- */
.paint-side {
  position: relative;
  min-height: 0;
  display: flex; flex-direction: column; gap: 12px;
  padding: 14px;
}
.paint-side__tabs { display: flex; width: 100%; flex: none; }
.paint-side__tabs button { flex: 1; }
.paint-side__head { flex: none; display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 2px 2px 0; }
.paint-side__head h2 { margin: 0; font-size: 17px; font-weight: 800; color: var(--su-ink); }
.paint-side__head small { color: var(--su-muted); font-size: 13px; }
.paint-side__report { flex: none; }
.paint-agent { flex: none; margin-top: 30px; } /* 头顶「点我切智能体」小标签是浮在上面的，留出它的位置 */
.paint-note {
  margin: 0; padding: 10px 12px; border-radius: var(--su-radius-sm);
  background: var(--su-surface-2); color: var(--su-muted); font-size: 13px; line-height: 1.5;
}
.paint-note.is-warn { background: var(--su-warn-soft); color: var(--su-warn); }

/* 低龄：图标提示词 */
.paint-icons { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.paint-icons__cats { flex: none; display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 1px 1px 3px; }
.paint-icons__cats::-webkit-scrollbar { display: none; }
.paint-icons__cat {
  flex: none; display: inline-flex; align-items: center; gap: 6px;
  min-height: 40px; padding: 0 12px 0 5px;
  border: 1px solid var(--su-line-strong); border-radius: 999px;
  background: var(--su-surface-solid); color: var(--su-text);
  font-size: 14px; font-weight: 700; cursor: pointer;
}
.paint-icons__cat-icon {
  width: 30px; height: 30px; border-radius: 50%; overflow: hidden;
  display: grid; place-items: center; background: var(--su-surface-3); font-size: 16px; line-height: 1;
}
.paint-icons__cat-icon img { width: 100%; height: 100%; object-fit: cover; }
.paint-icons__cat.is-active { border-color: transparent; background: var(--su-accent); color: #fff; box-shadow: 0 6px 14px var(--su-accent-ring); }
.paint-icons__cat.is-active .paint-icons__cat-icon { background: rgba(255, 255, 255, 0.24); }
.paint-icons__grid {
  flex: 1; min-height: 0; overflow-y: auto;
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; align-content: start;
  padding: 2px 2px 22px;
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 26px), transparent);
  mask-image: linear-gradient(to bottom, #000 calc(100% - 26px), transparent);
}
.paint-icon {
  position: relative;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  aspect-ratio: 1; min-height: auto; padding: 6px 4px;
  border: 2px solid transparent; border-radius: 18px;
  background: var(--su-surface-2); color: var(--su-ink); cursor: pointer;
  transition: transform 0.15s, background 0.15s, border-color 0.15s;
}
.paint-icon:hover { background: var(--su-accent-soft); }
.paint-icon:active { transform: scale(0.95); }
.paint-icon__art { width: 58%; aspect-ratio: 1; display: grid; place-items: center; font-size: clamp(24px, 2.6vw, 32px); line-height: 1; }
.paint-icon__art img { width: 100%; height: 100%; object-fit: contain; }
.paint-icon__label { max-width: 100%; font-size: 13px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.paint-icon.is-on { border-color: var(--su-accent); background: var(--su-accent-soft); }
.paint-icon__check {
  position: absolute; top: 5px; right: 5px; width: 20px; height: 20px; border-radius: 50%;
  display: grid; place-items: center; background: var(--su-accent); color: #fff; font-size: 12px; font-style: normal;
}
.paint-icons__foot { flex: none; display: flex; align-items: center; gap: 8px; padding-top: 10px; border-top: 1px solid var(--su-line); }
.paint-icons__foot p { flex: 1; min-width: 0; margin: 0; font-size: 13px; color: var(--su-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 技能玩法 */
.paint-skills { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.paint-skills__cats { flex: none; display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 1px 1px 3px; }
.paint-skills__cats::-webkit-scrollbar { display: none; }
.paint-skills__cats .su-chip { flex: none; min-height: 36px; padding: 0 12px; font-size: 13px; }
.paint-skills__cats .su-chip small { margin-left: 2px; font-size: 12px; opacity: 0.6; }
.paint-skills__grid {
  flex: 1; min-height: 0; overflow-y: auto;
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; align-content: start;
  padding: 2px 2px 22px;
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 26px), transparent);
  mask-image: linear-gradient(to bottom, #000 calc(100% - 26px), transparent);
}
.paint-skill {
  display: flex; flex-direction: column; gap: 6px;
  min-height: auto; padding: 6px 6px 8px;
  border: 2px solid transparent; border-radius: 16px;
  background: var(--su-surface-solid); box-shadow: 0 1px 3px rgba(31, 35, 64, 0.08);
  text-align: left; cursor: pointer; transition: transform 0.15s, border-color 0.15s;
}
.paint-skill:hover { border-color: rgba(108, 92, 231, 0.35); }
.paint-skill:active { transform: scale(0.97); }
.paint-skill.is-active { border-color: var(--su-accent); }
.paint-skill__cover {
  flex: none; width: 100%; height: clamp(58px, 5.6vw, 74px); border-radius: 11px; overflow: hidden;
  display: grid; place-items: center;
  background: linear-gradient(135deg, #efeaff, #ffe9dc) center / cover no-repeat;
}
.paint-skill strong {
  padding: 0 2px; color: var(--su-ink); font-size: 13.5px; font-weight: 700; line-height: 1.3;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

/* ---------- 右侧：作品流 ---------- */
.paint-main { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 12px; }
.paint-stream {
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: 14px;
  padding: 2px 4px 6px 2px;
}
.paint-stream > *, .paint-composer { width: 100%; max-width: 1180px; margin-inline: auto; }

.paint-batch {
  flex: none; padding: 14px;
  border: 1px solid var(--su-line); border-radius: var(--su-radius-lg);
  background: var(--su-surface); box-shadow: var(--su-shadow);
}
.paint-batch__head { display: flex; align-items: flex-start; gap: 12px; }
.paint-batch__swatch { flex: none; width: 38px; height: 38px; border-radius: 12px; background: var(--su-accent-soft); box-shadow: inset 0 0 0 1px rgba(31, 35, 64, 0.06); }
.paint-batch__swatch.is-ai {
  display: grid; place-items: center;
  background: linear-gradient(135deg, #8d7ff7, #6c5ce7); color: #fff; font-size: 12px; font-weight: 800;
}
.paint-batch__copy { flex: 1; min-width: 0; }
.paint-batch__prompt {
  margin: 0; color: var(--su-ink); font-size: 15px; font-weight: 600; line-height: 1.45;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;
}
.paint-batch__meta { margin: 6px 0 0; display: flex; flex-wrap: wrap; gap: 4px 6px; }
.paint-batch__meta span { padding: 2px 8px; border-radius: 999px; background: var(--su-surface-3); color: var(--su-muted); font-size: 12px; }
.paint-batch__actions { flex: none; display: flex; align-items: center; gap: 6px; }
.paint-mini {
  display: inline-flex; align-items: center; gap: 5px;
  height: 38px; min-height: 0; padding: 0 12px;
  border: 1px solid var(--su-line-strong); border-radius: 999px;
  background: var(--su-surface-solid); color: var(--su-text);
  font-size: 13px; font-weight: 700; white-space: nowrap; cursor: pointer;
}
.paint-mini:hover:not(:disabled) { border-color: var(--su-accent); color: var(--su-accent); }
.paint-mini:disabled { opacity: 0.45; cursor: not-allowed; }
.paint-mini--icon { width: 38px; padding: 0; justify-content: center; }

/* 一组图：每张按自己的比例排，最高约 380px，竖图不会撑满一屏 */
.paint-batch__images {
  margin-top: 12px;
  display: grid; gap: 10px; align-items: start; justify-items: start;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.paint-batch__images.count-1 { grid-template-columns: minmax(0, 1fr); }
.paint-batch__images.count-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.paint-batch__images.count-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.paint-art {
  position: relative; display: block;
  width: min(100%, calc(var(--artwork-ratio-value, 1) * 380px));
  min-height: 0; padding: 0; border: 0; border-radius: 14px; overflow: hidden;
  background-color: var(--su-surface-3); background-size: cover; background-position: center;
  box-shadow: 0 0 0 1px var(--su-line); cursor: zoom-in;
  transition: transform 0.18s, box-shadow 0.18s;
}
.paint-art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.paint-art:hover { transform: translateY(-2px); box-shadow: 0 0 0 1px var(--su-line), 0 12px 26px rgba(31, 35, 64, 0.16); }
.paint-art.is-selected { box-shadow: 0 0 0 3px var(--su-accent); }
.paint-art__tag {
  position: absolute; left: 8px; bottom: 8px; max-width: calc(100% - 16px);
  padding: 3px 9px; border-radius: 999px;
  background: rgba(20, 22, 40, 0.55); color: #fff; font-size: 12px; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
}
.paint-art.is-final .paint-art__tag { background: var(--su-accent); }
.paint-art.is-waiting {
  aspect-ratio: var(--preview-aspect, 1);
  width: min(100%, calc(var(--preview-ratio-value, 1) * 380px));
  cursor: default; transform: none;
  background: linear-gradient(110deg, #eceef7 30%, #f8f8fd 50%, #eceef7 70%) 0 0 / 220% 100%;
  animation: paintShimmer 1.6s linear infinite;
}
.paint-art__wait {
  position: absolute; inset: 0; padding: 8px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  color: var(--su-muted); font-size: 13px; font-weight: 600; text-align: center;
}
.paint-art__wait i {
  width: 28px; height: 28px; border-radius: 50%;
  border: 3px solid var(--su-accent-soft); border-top-color: var(--su-accent);
  animation: paintSpin 0.9s linear infinite;
}
.paint-batch.is-failed { border-color: rgba(224, 72, 72, 0.22); }
.paint-fail {
  margin-top: 12px; padding: 12px 14px; border-radius: var(--su-radius);
  background: var(--su-err-soft);
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
}
.paint-fail p { flex: 1; min-width: 200px; margin: 0; color: var(--su-err); font-size: 14px; line-height: 1.5; }
.paint-fail div { display: flex; gap: 8px; }

/* 空状态 */
.paint-empty {
  margin: auto; max-width: 440px;
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 24px 16px; text-align: center;
}
.paint-empty__mark {
  width: 76px; height: 76px; border-radius: 26px;
  display: grid; place-items: center; color: var(--su-accent);
  background: linear-gradient(145deg, #f3f0ff, #ffeedd);
  box-shadow: inset 0 0 0 1px rgba(108, 92, 231, 0.1);
}
.paint-empty strong { color: var(--su-ink); font-size: 19px; font-weight: 800; line-height: 1.4; }
.paint-empty p { margin: 0; color: var(--su-muted); line-height: 1.6; }
.paint-empty__steps { width: 100%; margin: 4px 0 0; padding: 0; list-style: none; display: grid; gap: 8px; text-align: left; }
.paint-empty__steps li {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 14px; border-radius: 14px;
  border: 1px solid var(--su-line); background: var(--su-surface);
  color: var(--su-text); font-size: 14px;
}
.paint-empty__steps b {
  flex: none; width: 24px; height: 24px; border-radius: 50%;
  display: grid; place-items: center; background: var(--su-accent-soft); color: var(--su-accent); font-size: 13px;
}
.paint-empty.is-error .paint-empty__mark { background: var(--su-err-soft); color: var(--su-err); font-size: 32px; font-weight: 800; }

/* ---------- 输入区 ---------- */
.paint-composer { flex: none; position: relative; z-index: 5; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.paint-composer.is-agent { box-shadow: 0 0 0 2px var(--su-accent-ring), var(--su-shadow); }
.paint-file { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }

.paint-refs { display: flex; gap: 10px; overflow-x: auto; padding: 8px 4px 4px; }
.paint-refs__item { position: relative; flex: none; }
.paint-refs__img {
  display: block; width: 64px; height: 64px; min-height: 0; padding: 0;
  border: 0; border-radius: 12px; overflow: hidden; cursor: pointer;
  box-shadow: 0 0 0 1px var(--su-line-strong);
}
.paint-refs__img img { width: 100%; height: 100%; object-fit: cover; }
.paint-refs__remove,
.paint-ref__add {
  position: absolute; display: grid; place-items: center;
  min-height: 0; padding: 0; border: 2px solid #fff; border-radius: 50%;
  color: #fff; line-height: 1; cursor: pointer;
}
.paint-refs__remove { top: -7px; right: -7px; width: 22px; height: 22px; background: var(--su-ink); font-size: 13px; }
.paint-refs__remove::after,
.paint-ref__add::after { content: ''; position: absolute; inset: -10px; }

/* 输入区（照客户稿）：左 参考图 ｜ 中 提示词框 + 下面一排胶囊 ｜ 右 竖排三个大按钮（退格、语音、发送） */
.paint-composer__grid {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-rows: minmax(0, 1fr) auto;
  grid-template-areas: "ref prompt send" "ref chips send";
  gap: 10px 12px;
}
.paint-composer__row, .paint-composer__bar { display: contents; }
.paint-ref { grid-area: ref; }
.paint-prompt { grid-area: prompt; }
.paint-chips { grid-area: chips; }
.paint-send { grid-area: send; }
.paint-ref { position: relative; flex: none; display: flex; }
.paint-ref__card {
  position: relative; width: 78px; min-height: 78px; padding: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  border: 1.5px dashed var(--su-line-strong); border-radius: 16px;
  background: var(--su-surface-2); color: var(--su-muted);
  font-size: 12px; font-weight: 700; cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.paint-ref__card:hover { border-color: var(--su-accent); color: var(--su-accent); background: var(--su-accent-soft); }
.paint-ref__card.has-images { border-style: solid; border-color: var(--su-line); background: var(--su-surface-solid); }
.paint-ref__stack {
  position: absolute; width: 50px; height: 50px; border-radius: 10px; overflow: hidden;
  border: 2px solid #fff; box-shadow: 0 2px 8px rgba(31, 35, 64, 0.18);
}
.paint-ref__stack img { width: 100%; height: 100%; object-fit: cover; }
.paint-ref__stack.is-1 { z-index: 3; transform: rotate(-5deg) translateX(-3px); }
.paint-ref__stack.is-2 { z-index: 2; transform: rotate(5deg) translate(5px, -3px); }
.paint-ref__stack.is-3 { z-index: 1; transform: rotate(12deg) translate(10px, -6px); }
.paint-ref__card b {
  position: absolute; right: 4px; bottom: 4px; z-index: 4;
  min-width: 20px; height: 20px; padding: 0 5px; border-radius: 999px;
  display: grid; place-items: center; background: var(--su-accent); color: #fff; font-size: 12px;
}
.paint-ref__add { top: -8px; right: -8px; z-index: 5; width: 26px; height: 26px; background: var(--su-accent); font-size: 17px; box-shadow: 0 2px 8px var(--su-accent-ring); }
.paint-ref__menu { width: 250px; }

/* 提示词输入框（contenteditable） */
.paint-prompt {
  position: relative; flex: 1; min-width: 0;
  display: flex; flex-direction: column;
  border: 1.5px solid var(--su-line-strong); border-radius: 16px;
  background: var(--su-surface-solid);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.paint-prompt:focus-within { border-color: var(--su-accent); box-shadow: 0 0 0 4px var(--su-accent-ring); }
.paint-prompt.is-agent-mode { border-color: rgba(108, 92, 231, 0.45); background: linear-gradient(180deg, #faf8ff, #fff); }
.paint-prompt__agent {
  align-self: flex-start; margin: 8px 0 0 12px; padding: 2px 9px; border-radius: 999px;
  background: var(--su-accent-soft); color: var(--su-accent); font-size: 12px; font-weight: 700;
}
.paint-prompt__editor {
  flex: 1; min-height: 78px; max-height: 150px; overflow-y: auto;
  padding: 12px 14px; outline: none; cursor: text;
  color: var(--su-ink); font-size: 15px; line-height: 1.65; word-break: break-word;
}
.paint-prompt__editor:empty::before { content: attr(data-placeholder); color: var(--su-faint); pointer-events: none; }
/* 输入框里由脚本生成的小标签：图标提示词、@图片、@技能 */
.paint-prompt__editor :deep(.prompt-young-token) {
  display: inline-flex; align-items: center; gap: 4px;
  margin: 1px 2px; padding: 1px 9px 1px 3px; border-radius: 999px;
  background: var(--su-accent-soft); color: var(--su-accent); font-weight: 600; vertical-align: baseline;
}
.paint-prompt__editor :deep(.selected-prompt-icon) {
  flex: none; display: inline-grid; place-items: center;
  width: 24px; height: 24px; border-radius: 50%; overflow: hidden;
  background: #fff; font-size: 15px; line-height: 1; vertical-align: middle;
}
.paint-prompt__editor :deep(.selected-prompt-icon[data-icon]::before) { content: attr(data-icon); }
.paint-prompt__editor :deep(.selected-prompt-icon img) { width: 100%; height: 100%; object-fit: cover; }
.paint-prompt__editor :deep(.prompt-inline-chip) {
  display: inline-flex; align-items: center; gap: 4px;
  max-width: 160px; height: 26px; margin: 0 2px; padding: 0 4px;
  border-radius: 8px; vertical-align: middle; user-select: none;
  background: var(--su-surface-3); color: var(--su-ink); font-size: 13px; font-weight: 600;
}
.paint-prompt__editor :deep(.prompt-inline-chip img) { flex: none; width: 18px; height: 18px; border-radius: 5px; object-fit: cover; }
.paint-prompt__editor :deep(.prompt-inline-chip span) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.paint-prompt__editor :deep(.prompt-inline-skill) { background: #fff1e0; color: #b45f06; }
.paint-prompt__editor :deep(.prompt-inline-remove) {
  flex: none; display: grid; place-items: center;
  width: 18px; height: 18px; min-height: 0; padding: 0; border: 0; border-radius: 50%;
  background: rgba(31, 35, 64, 0.1); color: inherit; font-size: 12px; line-height: 1; cursor: pointer;
}
.paint-prompt__editor :deep(.prompt-inline-remove:hover) { background: var(--su-err); color: #fff; }
.paint-prompt__editor :deep(.prompt-insert-marker) { display: inline-block; width: 0; height: 1em; }

/* 工具条 */
.paint-chips { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; }
.chip-menu-wrap { position: relative; display: inline-flex; }
/* 地方不够时，模型名、风格名先缩成省略号（其它按钮保持完整），而不是把 @ 挤到第二行 */
.paint-chips > .chip-menu-wrap:first-child { flex: 0 1 auto; min-width: 72px; }
/* 「风格」两个字本身就是最短的样子，不再往下缩；选了长风格名时才缩 */
.paint-chips > .paint-style-wrap { flex: 0 1 auto; min-width: 75px; }
.paint-chips > .chip-menu-wrap:first-child > .paint-chip, .paint-chips > .paint-style-wrap > .paint-chip { min-width: 0; }
/* 风格面板、@ 面板比较宽：以整个输入区为定位基准，避免伸出屏幕 */
.paint-style-wrap, .mention-menu-wrap { position: static; display: inline-flex; }
.paint-chip {
  display: inline-flex; align-items: center; gap: 6px;
  height: 40px; min-height: 0; max-width: 200px; padding: 0 13px;
  border: 1px solid var(--su-line-strong); border-radius: 999px;
  background: var(--su-surface-solid); color: var(--su-text);
  font-size: 13px; font-weight: 700; cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.paint-chip svg { flex: none; color: var(--su-muted); }
.paint-chip:hover:not(:disabled), .paint-chip.is-open { border-color: var(--su-accent); color: var(--su-accent); }
.paint-chip:hover:not(:disabled) svg, .paint-chip.is-open svg { color: var(--su-accent); }
.paint-chip.is-open { background: var(--su-accent-soft); }
.paint-chip:disabled { opacity: 0.6; cursor: not-allowed; }
.paint-chip__text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.paint-chip__sub { font-size: inherit; font-weight: inherit; }
.paint-chip--join { border-radius: 999px 0 0 999px; padding-right: 10px; }
.paint-chip--caret { margin-left: -1px; padding: 0 10px; border-radius: 0 999px 999px 0; }
.paint-chip--at { width: 40px; padding: 0; justify-content: center; font-size: 17px; font-weight: 800; }
.paint-chip.is-busy svg { animation: paintSpin 1.2s linear infinite; }

/* 弹出面板（参考图来源、模型、优化强度、风格、@） */
.paint-pop {
  position: absolute; z-index: 60; left: 0; bottom: calc(100% + 10px);
  padding: 8px; border: 1px solid var(--su-line); border-radius: 18px;
  background: var(--su-surface-solid); box-shadow: var(--su-shadow-pop);
}
.paint-pop > button {
  width: 100%; min-height: 50px; padding: 8px 12px;
  display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 2px;
  border: 0; border-radius: 12px; background: transparent; color: var(--su-ink); text-align: left; cursor: pointer;
}
.paint-pop > button:hover { background: var(--su-surface-2); }
.paint-pop > button strong { font-size: 14px; font-weight: 700; }
.paint-pop > button small { font-size: 12px; color: var(--su-muted); }
.paint-pop > button.is-on { background: var(--su-accent-soft); color: var(--su-accent); }
.paint-pop--list { width: 260px; max-height: 340px; overflow-y: auto; }
.paint-pop--narrow { width: 200px; }
.paint-pop__title { margin: 4px 10px 6px; color: var(--su-muted); font-size: 12px; font-weight: 700; }

/* 风格面板：两排，每排 2/3/4 张（后台设置），多了左右滑 */
.paint-styles { --cols: 4; left: 12px; width: min(580px, calc(100% - 24px)); padding: 12px; }
.paint-styles.cols-2 { --cols: 2; width: min(340px, calc(100% - 24px)); }
.paint-styles.cols-3 { --cols: 3; width: min(460px, calc(100% - 24px)); }
.paint-styles__head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.paint-styles__head strong { color: var(--su-ink); font-size: 15px; }
.paint-styles__head small { flex: 1; min-width: 0; color: var(--su-muted); font-size: 12px; }
.paint-styles__head .su-chip,
.paint-styles__groups .su-chip { flex: none; min-height: 34px; padding: 0 12px; font-size: 13px; }
.paint-styles__groups { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; margin-bottom: 10px; }
.paint-styles__groups::-webkit-scrollbar { display: none; }
.paint-styles__scroll { overflow-x: auto; overflow-y: hidden; padding-bottom: 6px; scrollbar-width: thin; }
.paint-styles__grid {
  display: grid; grid-auto-flow: column; grid-template-rows: repeat(2, auto); gap: 8px;
  grid-auto-columns: calc((100% - (var(--cols) - 1) * 8px) / var(--cols));
}
.paint-style {
  display: flex; flex-direction: column; gap: 6px;
  min-width: 0; min-height: 0; padding: 4px;
  border: 2px solid transparent; border-radius: 14px; background: none; text-align: center; cursor: pointer;
}
.paint-style:hover { background: var(--su-surface-2); }
.paint-style.is-on { border-color: var(--su-accent); background: var(--su-accent-soft); }
.paint-style__cover { flex: none; width: 100%; aspect-ratio: 1; border-radius: 10px; overflow: hidden; display: grid; place-items: center; background: linear-gradient(135deg, #efeaff, #ffe9dc); }
.paint-style__cover img { width: 100%; height: 100%; object-fit: cover; }
.paint-style__name { color: var(--su-text); font-size: 12.5px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.paint-style.is-on .paint-style__name { color: var(--su-accent); }

/* @ 面板 */
.paint-mention { left: auto; right: 12px; width: min(380px, calc(100% - 24px)); padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.paint-mention__tabs { align-self: flex-start; }
.paint-mention__pick {
  width: 100%; min-height: 78px; padding: 14px 16px;
  display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
  border: 1.5px dashed var(--su-line-strong); border-radius: 14px; background: var(--su-surface-2);
  text-align: left; cursor: pointer;
}
.paint-mention__pick:hover { border-color: var(--su-accent); background: var(--su-accent-soft); }
.paint-mention__pick strong { color: var(--su-ink); font-size: 15px; }
.paint-mention__pick span { color: var(--su-muted); font-size: 13px; line-height: 1.5; }
.paint-mention__upload p { margin: 8px 2px 0; color: var(--su-muted); font-size: 12px; }
.paint-mention__skills { max-height: 250px; overflow-y: auto; display: grid; gap: 2px; }
.paint-mention__skills button {
  min-height: 52px; padding: 8px 12px;
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  border: 0; border-radius: 12px; background: none; text-align: left; cursor: pointer;
}
.paint-mention__skills button:hover { background: var(--su-surface-2); }
.paint-mention__skills button.is-on { background: var(--su-accent-soft); }
.paint-mention__skills strong { color: var(--su-ink); font-size: 14px; }
.paint-mention__skills span { max-width: 100%; color: var(--su-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 发送区 */
/* 三个大按钮：小画家一眼找到、好按 */
.paint-send { flex: none; width: 108px; display: flex; flex-direction: column; justify-content: center; gap: 8px; }
.paint-round, .paint-voice-btn, .paint-go {
  width: 100%; min-height: 0; padding: 0 10px;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  font-weight: 800; white-space: nowrap; cursor: pointer;
}
.paint-round, .paint-voice-btn {
  height: 46px; border: 1px solid var(--su-line-strong); border-radius: 14px;
  background: var(--su-surface-solid); color: var(--su-ink); font-size: 15px;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.paint-round svg, .paint-voice-btn svg { color: var(--su-muted); }
.paint-round:hover, .paint-voice-btn:hover:not(.is-on) { border-color: var(--su-accent); color: var(--su-accent); }
.paint-round:hover svg, .paint-voice-btn:hover:not(.is-on) svg { color: var(--su-accent); }
.paint-round:active, .paint-voice-btn:active { transform: scale(0.97); }
.paint-voice-btn__wave { display: none; align-items: center; gap: 2px; height: 16px; }
.paint-voice-btn__wave i { width: 3px; height: 100%; border-radius: 2px; background: currentColor; animation: paintWave 0.9s ease-in-out infinite; }
.paint-voice-btn__wave i:nth-child(2) { animation-delay: 0.15s; }
.paint-voice-btn__wave i:nth-child(3) { animation-delay: 0.3s; }
.paint-voice-btn.is-on { border-color: transparent; background: var(--su-err); color: #fff; box-shadow: 0 6px 16px rgba(224, 72, 72, 0.3); }
.paint-voice-btn.is-on .paint-voice-btn__wave { display: inline-flex; }
.paint-go {
  height: 56px;
  border: 0; border-radius: 16px; background: var(--su-accent); color: #fff;
  font-size: 17px;
  box-shadow: 0 8px 20px rgba(108, 92, 231, 0.32);
  transition: background 0.15s, transform 0.15s;
}
.paint-go:hover:not(:disabled) { background: var(--su-accent-hover); }
.paint-go:active:not(:disabled) { transform: scale(0.97); }
.paint-go:disabled { background: #b8b0f0; box-shadow: none; cursor: progress; }

/* ---------- 图像设置面板（挂在 body 上，位置由脚本算） ---------- */
.paint-settings {
  position: fixed; z-index: 3000; overflow-y: auto;
  padding: 16px 18px 18px; border: 1px solid var(--su-line); border-radius: 20px;
  background: var(--su-surface-solid); box-shadow: var(--su-shadow-pop); color: var(--su-text);
}
.paint-settings, .paint-settings * { box-sizing: border-box; }
.paint-settings header { display: flex; align-items: center; justify-content: space-between; }
.paint-settings header strong { color: var(--su-ink); font-size: 16px; }
.paint-settings header button {
  width: 34px; height: 34px; min-height: 0; padding: 0;
  border: 0; border-radius: 50%; background: var(--su-surface-3); color: var(--su-text); font-size: 18px; cursor: pointer;
}
.paint-settings fieldset { margin: 14px 0 0; padding: 0; border: 0; min-width: 0; }
.paint-settings legend { margin-bottom: 8px; padding: 0; color: var(--su-muted); font-size: 13px; font-weight: 700; }
.paint-settings__opts { display: flex; flex-wrap: wrap; gap: 8px; }
.paint-settings__opts button {
  min-height: 42px; padding: 0 16px;
  border: 1px solid var(--su-line-strong); border-radius: 12px;
  background: var(--su-surface-solid); color: var(--su-text); font-size: 14px; font-weight: 700; cursor: pointer;
}
.paint-settings__opts button:hover { border-color: var(--su-accent); }
.paint-settings__opts button.is-on { border-color: var(--su-accent); background: var(--su-accent-soft); color: var(--su-accent); }
.paint-settings__opts.is-ratios { display: grid; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); }
.paint-settings__opts.is-ratios button {
  height: 76px; padding: 8px 4px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; font-size: 13px;
}
.paint-settings__shape {
  display: grid; place-items: center; height: 24px; max-width: 46px;
  border: 2px solid currentColor; border-radius: 5px; opacity: 0.7; font-size: 12px;
}

/* ---------- 弹窗内容 ---------- */
.paint-dialog__text { margin: 0; color: var(--su-text); font-size: 15px; line-height: 1.7; }

.paint-viewer { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; }
.paint-viewer__stage {
  position: relative; min-height: 360px; border-radius: 18px; overflow: hidden;
  display: grid; place-items: center;
  background: radial-gradient(circle at 50% 40%, #fbfbfe, #eef0f7);
}
.paint-viewer__stage img { display: block; max-width: 100%; max-height: min(68vh, 660px); object-fit: contain; }
.paint-viewer__none { color: var(--su-muted); }
.paint-viewer__tag,
.paint-viewer__full {
  position: absolute; top: 12px; padding: 0 12px; height: 34px; min-height: 0;
  display: inline-flex; align-items: center; gap: 6px; border-radius: 999px;
  font-size: 13px; font-weight: 700;
}
.paint-viewer__tag { left: 12px; background: rgba(20, 22, 40, 0.55); color: #fff; }
.paint-viewer__full { right: 12px; border: 0; background: rgba(255, 255, 255, 0.92); color: var(--su-ink); box-shadow: var(--su-shadow); cursor: pointer; }
.paint-viewer__full:disabled { opacity: 0.5; cursor: not-allowed; }
.paint-viewer__side { min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.paint-viewer__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 36px; }
.paint-viewer__head h3 { margin: 0; color: var(--su-ink); font-size: 16px; }
.paint-viewer__input { flex: 1; min-height: 190px; resize: none; }
.paint-viewer__count { align-self: flex-end; margin-top: -6px; color: var(--su-muted); font-size: 12px; }
.paint-viewer__prompt {
  flex: 1; max-height: 380px; margin: 0; padding: 12px 14px; overflow-y: auto;
  border-radius: 14px; background: var(--su-surface-2);
  color: var(--su-text); font-size: 14px; line-height: 1.75; white-space: pre-wrap; word-break: break-word;
}
.paint-viewer__actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.paint-viewer__actions .su-btn--primary { grid-column: 1 / -1; }

.paint-full__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--su-ink); font-size: 15px; font-weight: 700; }
/* 行高固定成整块高度，图片的 max-height: 100% 才有参照，长图、横图都能完整放进一屏 */
.paint-full__stage { height: calc(100dvh - 96px); display: grid; grid-template: minmax(0, 1fr) / minmax(0, 1fr); place-items: center; }
.paint-full__stage img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 12px; }

.paint-refedit { display: grid; gap: 14px; }
.paint-refedit__canvas {
  position: relative; min-height: 320px; border-radius: 18px; overflow: hidden;
  display: grid; place-items: center; background: var(--su-surface-3);
}
.paint-refedit__canvas img { display: block; max-width: 100%; max-height: 60vh; object-fit: contain; }
.paint-refedit__mask { position: absolute; inset: 0; pointer-events: none; }
.paint-refedit__mask.tool-select { box-shadow: inset 0 0 0 3px rgba(108, 92, 231, 0.5); }
.paint-refedit__tools {
  position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%);
  display: flex; gap: 4px; padding: 4px; border-radius: 999px;
  background: rgba(255, 255, 255, 0.94); box-shadow: var(--su-shadow-pop);
}
.paint-refedit__tools button {
  min-height: 40px; padding: 0 16px; border: 0; border-radius: 999px;
  background: none; color: var(--su-text); font-size: 14px; font-weight: 700; cursor: pointer;
}
.paint-refedit__tools button.is-on { background: var(--su-accent); color: #fff; }
.paint-refedit__foot { display: flex; justify-content: flex-end; gap: 8px; }

.paint-tpls { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.paint-tpl {
  min-height: 0; padding: 8px;
  display: flex; flex-direction: column; gap: 6px;
  border: 1px solid var(--su-line); border-radius: 16px; background: var(--su-surface-solid); text-align: left; cursor: pointer;
}
.paint-tpl:hover { border-color: var(--su-accent); }
.paint-tpl span { flex: none; height: 96px; border-radius: 12px; }
.paint-tpl strong { color: var(--su-ink); font-size: 14px; }
.paint-tpl small { color: var(--su-muted); font-size: 12px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

.paint-lib { display: grid; gap: 12px; }
.paint-lib .su-seg { justify-self: start; }
.paint-lib__cats { display: flex; flex-wrap: wrap; gap: 6px; }
.paint-lib__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; }
.paint-lib__item {
  aspect-ratio: 1; min-height: 0; padding: 0; border: 0; border-radius: 14px; overflow: hidden; cursor: pointer;
  box-shadow: 0 0 0 1px var(--su-line); transition: box-shadow 0.15s;
}
.paint-lib__item span { display: block; width: 100%; height: 100%; background-size: cover; background-position: center; }
.paint-lib__item:hover { box-shadow: 0 0 0 3px var(--su-accent); }

/* ---------- 低龄：字和按钮再大一号 ---------- */
.paint.is-young .paint-prompt__editor { font-size: 17px; }
.paint.is-young .paint-chip { height: 44px; font-size: 14px; }
.paint.is-young .paint-chip--at { width: 44px; }
.paint.is-young .paint-send { width: 116px; gap: 10px; }
.paint.is-young .paint-round, .paint.is-young .paint-voice-btn { height: 52px; font-size: 16px; }
.paint.is-young .paint-go { height: 62px; font-size: 19px; }

@keyframes paintShimmer { to { background-position: -220% 0; } }
@keyframes paintSpin { to { transform: rotate(360deg); } }
@keyframes paintWave { 0%, 100% { transform: scaleY(0.35); } 50% { transform: scaleY(1); } }
@media (prefers-reduced-motion: reduce) {
  .paint-art.is-waiting, .paint-art__wait i, .paint-voice-btn__wave i, .paint-chip.is-busy svg { animation: none; }
}

/* ---------- 尺寸适配 ---------- */
/* 小一点的横屏平板 / 笔记本 */
@media (max-width: 1280px) {
  .paint-chip { max-width: 160px; }
  .paint-chip.paint-chip--settings { max-width: none; }
  .paint-chip__sub { display: none; }
}
@media (max-width: 1100px) {
  .paint-batch__actions .paint-mini:not(.paint-mini--icon) { padding: 0 10px; }
}
/* 竖屏平板：左栏收窄，图标两列 */
@media (max-width: 900px) {
  .paint-layout { grid-template-columns: 216px minmax(0, 1fr); gap: 10px; }
  .paint-side { padding: 12px; }
  .paint-icons__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .paint-skill strong { font-size: 13px; }
  .paint-batch__head { flex-wrap: wrap; }
  .paint-batch__actions { width: 100%; justify-content: flex-end; }
  .paint-viewer { grid-template-columns: 1fr; }
  .paint-viewer__stage { min-height: 260px; }
  .paint-viewer__stage img { max-height: 46vh; }
  .paint-chips { flex-wrap: wrap; } /* 竖屏中间栏窄：胶囊换行 */
}
/* 手机横屏等矮屏：压缩上下高度，把空间留给作品 */
@media (max-height: 560px) {
  .paint-side { gap: 8px; padding: 10px; }
  .paint-side__head small { display: none; }
  .paint-agent { margin-top: 26px; }
  /* .paint-agent 就是 AI 伙伴组件的根节点（.sa-dock），所以写成同一元素上的组合类 */
  .paint-side .paint-agent.is-inline :deep(.sa-figure-btn) { width: 84px; }
  .paint-composer { padding: 8px; gap: 6px; }
  .paint-ref__card { width: 60px; min-height: 56px; }
  .paint-prompt__editor { min-height: 52px; max-height: 84px; padding: 8px 12px; }
  .paint-chip { height: 36px; }
  .paint-chip--at { width: 36px; }
  .paint-send { gap: 6px; }
  .paint-round, .paint-voice-btn { height: 38px; font-size: 14px; }
  .paint-go { height: 44px; font-size: 16px; }
  .paint.is-young .paint-round, .paint.is-young .paint-voice-btn { height: 40px; }
  .paint.is-young .paint-go { height: 46px; }
  .paint-batch { padding: 10px; }
  .paint-empty { padding: 8px; gap: 8px; }
  .paint-empty__steps { display: none; }
}
</style>

<style lang="scss">
/* AI 绘画页弹窗：el-dialog 外壳不在本组件 scoped 范围内，单独放这里（只认 paint-dialog 前缀，不影响别的页面） */
.el-dialog.paint-dialog { border-radius: 22px; padding: 18px 20px 20px; }
.el-dialog.paint-dialog .el-dialog__header { padding-bottom: 12px; }
.el-dialog.paint-dialog .el-dialog__title { color: #1f2340; font-size: 17px; font-weight: 800; }
.el-dialog.paint-dialog .el-dialog__footer { display: flex; justify-content: flex-end; gap: 8px; }
.el-dialog.paint-full-dialog { border-radius: 0; padding: 14px 18px; }
/* 「AI 帮你整理想法」：内容由脚本 h() 生成 */
.el-dialog.paint-dialog .idea-dialog { display: grid; gap: 16px; }
.el-dialog.paint-dialog .idea-form-grid,
.el-dialog.paint-dialog .idea-card-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.el-dialog.paint-dialog .idea-form-grid label,
.el-dialog.paint-dialog .idea-card-grid label { display: grid; gap: 6px; color: #4a5071; font-size: 14px; font-weight: 700; }
.el-dialog.paint-dialog .idea-form-grid textarea {
  min-height: 84px; padding: 10px 12px; resize: vertical;
  border: 1px solid rgba(31, 35, 64, 0.14); border-radius: 12px; outline: none;
  color: #1f2340; font: inherit; font-weight: 400; line-height: 1.6;
}
.el-dialog.paint-dialog .idea-form-grid textarea:focus { border-color: #6c5ce7; box-shadow: 0 0 0 3px rgba(108, 92, 231, 0.18); }
.el-dialog.paint-dialog .idea-options { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.el-dialog.paint-dialog .idea-options button {
  min-height: 48px; border: 1px solid rgba(31, 35, 64, 0.14); border-radius: 14px;
  background: #fff; color: #6c5ce7; font-weight: 700; cursor: pointer;
}
.el-dialog.paint-dialog .idea-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.el-dialog.paint-dialog .idea-compare section { padding: 14px; border-radius: 16px; background: #f6f6fb; }
.el-dialog.paint-dialog .idea-compare h3 { margin: 0 0 6px; color: #1f2340; font-size: 14px; }
.el-dialog.paint-dialog .idea-compare p { margin: 0; color: #4a5071; font-size: 14px; line-height: 1.65; }
.el-dialog.paint-dialog .prompt-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; }
@media (max-width: 640px) {
  .el-dialog.paint-dialog .idea-form-grid,
  .el-dialog.paint-dialog .idea-card-grid,
  .el-dialog.paint-dialog .idea-compare { grid-template-columns: 1fr; }
}
</style>
