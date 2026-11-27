<template>
  <main ref="pageRootEl" class="h5-report-page app-page" :class="{ 'junior-report-page': isJunior, 'advanced-report-page': isAdvanced }">
    <header v-if="!h5EditionUnavailable && !isJunior && !isAdvanced" class="h5-report-header">
      <button type="button" class="back-btn" @click="router.push('/student/reports')">返回报告列表</button>
      <div>
        <h1>H5 创作报告工作台</h1>
        <p>先整理项目资料并预览，确认后再保存到报告列表。</p>
      </div>
      <div class="header-actions">
        <button type="button" class="secondary-btn" :disabled="!reportReady" @click="previewReport">预览</button>
        <button type="button" class="primary-btn" :disabled="!reportReady || saving || reportSaved" @click="saveReport">
          {{ saving ? '保存中...' : reportSaved ? '已保存' : '保存' }}
        </button>
        <button type="button" class="secondary-btn" :disabled="!reportReady" @click="exportPdf">导出 PDF</button>
        <button type="button" class="secondary-btn" @click="exitReport">退出</button>
      </div>
    </header>

    <section v-if="h5EditionUnavailable" class="h5-edition-unavailable">
      <div>
        <span>H5</span>
        <h1>{{ editionLabel }}创作报告暂未开放</h1>
        <p>讲师正在为这个版本配置专属的报告样式与创作引导。你可以先继续完成作品，开放后会自动生成属于你的创作报告。</p>
        <button type="button" @click="router.push('/student/workbench')">返回用户工作台</button>
      </div>
    </section>

    <section v-else-if="isJunior && starterPreviewOpen" class="starter-preview-workbench" :style="starterPreviewThemeStyle">
      <header class="starter-preview-header">
        <button type="button" class="starter-back" aria-label="返回继续修改" @click="closeStarterPreview">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7" /></svg>
        </button>
        <div class="starter-progress" aria-label="第 3 步，共 3 步">
          <h1>第 3 步：看看我的H5报告</h1>
          <div><i class="done">✓</i><span></span><i class="done">✓</i><span></span><i class="current"></i></div>
        </div>
        <div class="starter-preview-style"><small>当前风格</small><strong>{{ selectedTemplate?.name || '童趣课堂风' }}</strong></div>
      </header>

      <div class="starter-shared-preview" @touchstart.passive="starterPreviewTouchStart" @touchend.passive="starterPreviewTouchEnd">
        <H5ReportRenderer v-model="starterPreviewIndex" :template="selectedTemplate" :pages="starterPreviewPages" device="phone" student-name="林同学" :edition-label="editionLabel" />
      </div>

      <footer class="starter-preview-footer">
        <button type="button" class="starter-secondary" @click="closeStarterPreview">返回继续修改</button>
        <button type="button" class="starter-primary" :disabled="generating" @click="confirmStarterReport">
          {{ generating ? '正在生成…' : '确认并生成H5报告' }}
        </button>
      </footer>
    </section>

    <section v-else-if="isJunior" class="junior-report-workbench starter-report-workbench">
      <header class="starter-header">
        <span aria-hidden="true" /><!-- 返回在共用顶栏；这里留空位让标题保持居中 -->
        <div class="starter-progress" aria-label="第 2 步，共 3 步">
          <h1>第 2 步：说说我的创意</h1>
          <div><i class="done">✓</i><span></span><i class="current"></i><span></span><i></i></div>
        </div>
        <div class="starter-header-actions">
          <button type="button" class="starter-save-draft" @click="saveDraftOnly">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v17l-6-3-6 3z" /></svg>保存草稿
          </button>
        </div>
      </header>

      <div class="starter-workspace">
        <article class="starter-materials">
          <div class="starter-panel-heading">
            <span class="starter-heading-icon materials-icon">▦</span>
            <div><h2>我的创作宝盒</h2><p>点一点，看看我为作品准备的素材</p></div>
          </div>

          <button
            v-if="juniorHeroMaterial.src"
            type="button"
            class="starter-hero-art"
            :style="artworkStyle(juniorHeroMaterial.src)"
            :aria-label="`查看${juniorHeroMaterial.label}`"
          >
            <span>{{ juniorHeroMaterial.label }}</span>
            <small>{{ juniorHeroMaterial.meta }}</small>
          </button>
          <div v-else class="starter-hero-empty">
            <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 11h32v26H8z"/><path d="m13 31 8-9 6 6 4-4 5 7"/><circle cx="32" cy="18" r="3"/></svg>
            <strong>还没有手稿作品</strong>
            <p>先去完成一张作品，再回来讲讲它吧</p>
            <button type="button" @click="router.push('/student/paint')">去创作</button>
          </div>

          <div class="starter-media-grid">
            <button
              type="button"
              class="starter-media-card"
              :class="{ active: juniorActiveMaterial === 'model', empty: !juniorModelSource }"
              @click="handleJuniorMaterial('model')"
            >
              <span class="starter-media-title"><i class="cube-icon">◇</i><strong>3D作品</strong><small>{{ project.models3d?.length || 0 }} 个</small></span>
              <span v-if="juniorModelSource" class="starter-media-image" :style="artworkStyle(juniorModelSource)"><em>查看作品</em></span>
              <span v-else class="starter-empty-state"><i>◇</i><strong>还没有3D作品</strong><em>去创作</em></span>
            </button>
            <button
              type="button"
              class="starter-media-card"
              :class="{ active: juniorActiveMaterial === 'video', empty: !juniorVideoSource }"
              @click="handleJuniorMaterial('video')"
            >
              <span class="starter-media-title"><i class="video-icon">▶</i><strong>视频讲解</strong><small>{{ project.videos?.length || 0 }} 个</small></span>
              <span v-if="juniorVideoSource" class="starter-media-image" :style="artworkStyle(juniorVideoSource)"><i class="starter-play">▶</i><em>{{ juniorVideoDuration }}</em></span>
              <span v-else class="starter-empty-state"><i>▶</i><strong>还没有视频讲解</strong><em>去录制</em></span>
            </button>
          </div>
        </article>

        <article class="starter-narration">
          <div class="starter-panel-heading orange">
            <span class="starter-heading-icon voice-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/></svg>
            </span>
            <div><h2>我来说一说</h2><p>用自己的话，分享我的创意和想法</p></div>
          </div>

          <div class="starter-prompt-grid">
            <label><span class="prompt-icon green">✎</span><strong>我画了什么</strong><textarea v-model="juniorPromptCards.what" rows="2" maxlength="70" placeholder="作品里有什么？"></textarea></label>
            <label><span class="prompt-icon coral">♥</span><strong>我为什么这样画</strong><textarea v-model="juniorPromptCards.why" rows="2" maxlength="70" placeholder="我想表达什么？"></textarea></label>
            <label><span class="prompt-icon purple">★</span><strong>我最喜欢哪里</strong><textarea v-model="juniorPromptCards.favorite" rows="2" maxlength="70" placeholder="最喜欢哪个部分？"></textarea></label>
          </div>

          <div class="starter-voice-area" :class="{ listening: juniorListening }">
            <button type="button" class="starter-mic" :aria-pressed="juniorListening" @click="toggleJuniorVoice">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/></svg>
            </button>
            <div><strong>{{ juniorListening ? '我在认真听…' : '点击麦克风开始说话' }}</strong><span>{{ juniorSpeechSupported ? '再点一次就可以结束' : '也可以填写上面的提示卡片' }}</span></div>
          </div>

          <label class="starter-summary">
            <span><strong>我的创意小结</strong><small>AI会整理成完整的第一人称表达</small></span>
            <textarea v-model="reportData.idea" rows="3" maxlength="300" aria-label="我的创意小结" placeholder="说完以后，我的创意介绍会出现在这里…"></textarea>
            <em>{{ reportData.idea.length }}/300</em>
          </label>
        </article>
      </div>

      <footer class="starter-footer">
        <section class="starter-style-panel" aria-label="H5报告风格设置">
          <button type="button" class="starter-style-control" :class="{ editable: juniorStudentCanChoose }" @click="openStarterStyleDrawer">
            <img :src="starterTemplateCover(selectedTemplate)" alt="" />
            <span><strong>H5报告风格</strong><small>当前：{{ starterTemplateLabel(selectedTemplate) }}</small></span>
            <b>›</b>
          </button>
          <div class="starter-style-mode" role="group" aria-label="H5报告风格选择方式">
            <button type="button" :class="{ active: starterStyleMode === 'auto' }" @click="useStarterAutomaticStyle">
              <CircleCheckFilled v-if="starterStyleMode === 'auto'" /><span>默认风格</span>
            </button>
            <button type="button" :class="{ active: starterStyleMode === 'manual' }" @click="openStarterManualStyle">
              <CircleCheckFilled v-if="starterStyleMode === 'manual'" /><span>自主选择</span>
            </button>
          </div>
        </section>
        <div class="starter-footer-main">
          <button type="button" class="starter-preview-button" :class="{ unavailable: !juniorCanGenerate }" @click="openStarterPreview">
            <ViewIcon /><span>提前预览H5报告</span>
          </button>
          <button type="button" class="starter-primary" :disabled="generating" :class="{ unavailable: !juniorCanGenerate }" @click="handleStarterGenerate">
            <StarFilled /><span>{{ generating ? '正在生成…' : '生成我的H5报告' }}</span>
          </button>
        </div>
      </footer>

      <div v-if="starterStyleDrawerOpen" class="starter-style-overlay" @click.self="closeStarterStyleDrawer">
        <section class="starter-style-drawer" role="dialog" aria-modal="true" aria-labelledby="starter-style-title">
          <header>
            <div><h2 id="starter-style-title">选择H5报告风格</h2><p>左右滑动看看，点中喜欢的风格</p></div>
            <button type="button" aria-label="关闭风格选择" @click="closeStarterStyleDrawer">×</button>
          </header>
          <div class="starter-style-carousel">
            <button v-if="juniorAvailableTemplates.length > 1" type="button" class="starter-carousel-arrow prev" aria-label="查看上一个风格" @click="browseStarterStyle(-1)">‹</button>
            <div
              ref="starterCarouselTrack"
              class="starter-carousel-track"
              :class="{ dragging: starterCarouselDragging, centered: juniorAvailableTemplates.length < 3 }"
              @scroll.passive="handleStarterCarouselScroll"
              @pointerdown="startStarterCarouselDrag"
              @pointermove="moveStarterCarouselDrag"
              @pointerup="endStarterCarouselDrag"
              @pointercancel="endStarterCarouselDrag"
              @pointerleave="endStarterCarouselDrag"
            >
              <button
                v-for="(template, index) in juniorAvailableTemplates"
                :key="template.id"
                type="button"
                class="starter-template-card"
                :class="{ active: starterStyleDraftId === template.id }"
                :data-carousel-index="index"
                @click="selectStarterStyleDraft(template.id, index)"
              >
                <span class="starter-template-cover"><img :src="starterTemplateCover(template)" :alt="`${starterTemplateLabel(template)}封面`" /><i v-if="starterStyleDraftId === template.id">✓</i></span>
                <span class="starter-template-copy"><strong>{{ starterTemplateLabel(template) }}</strong><small>{{ template.description || '适合展示我的创作过程' }}</small></span>
              </button>
            </div>
            <button v-if="juniorAvailableTemplates.length > 1" type="button" class="starter-carousel-arrow next" aria-label="查看下一个风格" @click="browseStarterStyle(1)">›</button>
          </div>
          <div v-if="juniorAvailableTemplates.length > 1" class="starter-carousel-dots" aria-label="风格浏览位置">
            <button v-for="(template, index) in juniorAvailableTemplates" :key="template.id" type="button" :class="{ active: starterCarouselIndex === index }" :aria-label="`查看${starterTemplateLabel(template)}`" @click="scrollStarterStyleTo(index)"></button>
          </div>
          <footer>
            <p>已选：<strong>{{ starterTemplateLabel(starterStyleDraftTemplate) }}</strong></p>
            <button type="button" class="starter-use-style" @click="confirmStarterTemplate">使用这个风格</button>
          </footer>
        </section>
      </div>
    </section>

    <section v-else-if="isAdvanced" ref="workbenchEl" class="advanced-report-workbench">
      <header class="advanced-report-header">
        <button type="button" class="advanced-back" aria-label="返回报告列表" @click="router.push('/student/reports')">
          <ArrowLeft /><span>返回</span>
        </button>
        <div class="advanced-brand">
          <span class="advanced-brand-mark"><BrushFilled /></span>
          <strong>高级创作报告</strong>
          <i></i>
          <span class="advanced-project-title">{{ advancedProjectTitle }}</span>
          <button type="button" class="advanced-edit-title" aria-label="编辑项目名称" @click="ElMessage.info('项目名称可在创作项目中修改')"><EditPen /></button>
          <span class="advanced-saved"><CircleCheckFilled /> 已自动保存</span>
        </div>
        <ol class="advanced-steps" aria-label="报告生成进度">
          <li class="done"><b><CircleCheckFilled /></b><span>资料整理</span></li>
          <li class="active"><b>2</b><span>叙事编辑</span></li>
          <li><b>3</b><span>选风格</span></li>
          <li><b>4</b><span>提交审核</span></li>
        </ol>
        <div class="advanced-header-actions">
          <button type="button" class="advanced-outline-btn" @click="saveDraftOnly">保存草稿</button>
        </div>
      </header>

      <div class="ar-grid">
        <!-- 1 · 风格模板：整栏只有一个 9:16 手机框，左右滑动切换。
             风格名、「约 N 页」和底部小圆点都去掉了——用户看框就知道长什么样；
             哪个被选中靠蓝色描边 + 右上角对勾。 -->
        <aside class="ar-panel ar-left">
          <div v-if="arVisibleStyleCards.length" class="ar-strip-wrap">
            <div
              ref="arStripRef"
              class="ar-strip"
              aria-label="报告风格，左右滑动切换"
              @wheel.prevent="scrollStyleStrip"
              @scroll.passive="syncArStripNav"
            >
              <button
                v-for="card in arVisibleStyleCards"
                :key="card.id"
                type="button"
                class="ar-style"
                :class="{ on: arSelectedStyleId === card.id }"
                :aria-pressed="arSelectedStyleId === card.id"
                :aria-label="`使用「${card.name}」风格`"
                :title="`${card.name}｜${card.tag}`"
                @click="selectArStyle(card)"
              >
                <span class="ar-tp">
                  <span class="ar-chk"><CircleCheckFilled /></span>
                  <span class="ar-tp-art" :style="artworkStyle(card.cover)"></span>
                </span>
              </button>
            </div>
            <!-- 左右箭头：手机框比一栏宽，只有一张时右边还是会被切掉一截。
                 有箭头用户才知道「右边还有」，不用去猜。只有真能滑时才出现。 -->
            <button
              v-if="arStripNav.left"
              type="button"
              class="ar-strip-nav is-prev"
              aria-label="上一个风格"
              @click="stepArStrip(-1)"
            >‹</button>
            <button
              v-if="arStripNav.right"
              type="button"
              class="ar-strip-nav is-next"
              aria-label="下一个风格"
              @click="stepArStrip(1)"
            >›</button>
          </div>
          <p v-else class="ar-empty">讲师还没有给高级版发布画布风格。等讲师在后台「报告工作流库」发布并勾上「用户可选」后，这里会多出对应的卡片。</p>

          <section v-if="isProductDesignStory(selectedTemplate)" class="ar-fill">
            <button type="button" class="ar-fill-h" @click="arFillOpen = !arFillOpen">
              <span>页面图片填充<small>{{ storyFillMode === 'manual' ? '手动调整中' : '智能匹配中' }}</small></span>
              <b>{{ arFillOpen ? '收起' : '调整' }}</b>
            </button>
            <div v-if="arFillOpen" class="ar-fill-body">
              <div class="ar-fill-mode" role="group" aria-label="页面图片填充方式">
                <button type="button" :class="{ on: storyFillMode === 'auto' }" @click="useStoryAutoFill">智能自动匹配</button>
                <button type="button" :class="{ on: storyFillMode === 'manual' }" @click="useStoryManualFill">手动替换图片</button>
              </div>
              <div v-if="storyFillMode === 'manual'" class="ar-fill-manual">
                <select v-model="storyFillSlot" aria-label="选择要替换的图框">
                  <option v-for="slot in storyFillSlots" :key="slot.id" :value="slot.id">{{ slot.label }}</option>
                </select>
                <p v-if="storyManualAssets.length">点一张真实素材，替换当前图框；没选的图框继续智能匹配。</p>
                <p v-else>这个项目还没有可替换的图片，完成作品后可以回来调整。</p>
                <div v-if="storyManualAssets.length" class="ar-fill-assets">
                  <button
                    v-for="asset in storyManualAssets"
                    :key="asset.id"
                    type="button"
                    :class="{ on: storyAssignedSource(storyFillSlot) === asset.src }"
                    :style="artworkStyle(asset.src)"
                    :title="`用${asset.label}替换${storyFillSlotLabel}`"
                    @click="assignStoryAsset(asset)"
                  ><span>{{ asset.label }}</span></button>
                </div>
              </div>
            </div>
          </section>
        </aside>

        <!-- 2 · 创作素材：素材不是系统随便挑的，只来自上面写着的那个项目。
             上节课的项目还有图、这节课还没画东西时，用户能在这里直接换回来。 -->
        <section class="ar-panel ar-mid">
          <div class="ar-panel-h">
            <h2>创作素材</h2>
            <em>已选 {{ arSelectedMaterialTotal }} / 共 {{ arMaterialTotal }} 张</em>
            <button v-if="arMaterialTotal" type="button" class="ar-pick-all" @click="toggleAllMaterials">{{ arAllSelected ? '全不选' : '全选' }}</button>
          </div>
          <div class="ar-src-row">
            <p class="ar-src" :title="project.title">
              来自<b>「{{ project.title }}」</b><i>点缩略图可取消参与</i>
            </p>
            <button
              type="button"
              class="ar-src-switch"
              :aria-expanded="arProjectPickerOpen"
              @click="arProjectPickerOpen = !arProjectPickerOpen"
            >{{ arProjectPickerOpen ? '收起' : '换项目' }}</button>
          </div>
          <div v-if="arProjectPickerOpen" class="ar-proj-list">
            <p class="ar-proj-hint">换成哪个项目，素材就换成那个项目的图。</p>
            <button
              v-for="item in arProjectOptions"
              :key="item.id"
              type="button"
              class="ar-proj"
              :class="{ on: item.id === project.id }"
              :title="`用「${item.title}」的素材做这份报告`"
              @click="switchReportProject(item)"
            >
              <span class="ar-proj-cover" :style="artworkStyle(item.cover)"></span>
              <span class="ar-proj-copy">
                <b>{{ item.title }}</b>
                <em>{{ item.count }} 张素材{{ item.updatedAt ? ' · ' + item.updatedAt : '' }}</em>
              </span>
              <i v-if="item.id === project.id">✓</i>
            </button>
            <p v-if="!arProjectOptions.length" class="ar-proj-empty">
              你还没有别的{{ editionLabel }}项目。先去画一张作品，回来就能在这里换。
            </p>
            <p v-else-if="arOtherEditionProjectCount" class="ar-proj-note">
              另有 {{ arOtherEditionProjectCount }} 个项目不是{{ editionLabel }}，要先在「我的作品」里打开它做报告。
            </p>
          </div>
          <div class="ar-left-body">
            <div v-if="arMaterialGroups.length" class="ar-groups">
              <section v-for="group in arMaterialGroups" :key="group.id" class="ar-grp">
                <div class="ar-grp-h"><span>{{ group.label }}</span><i>{{ group.items.length }}</i></div>
                <div class="ar-thumbs">
                  <div
                    v-for="item in group.items"
                    :key="item.id"
                    class="ar-th"
                    :class="{ 'is-off': group.id !== 'videos' && !arMaterialSelected(item.id), 'is-locked': group.id === 'videos' }"
                    :style="artworkStyle(item.src)"
                    :title="group.id === 'videos' ? `${item.label}｜视频只嵌入报告播放，不参与出图` : `${item.label}｜点击${arMaterialSelected(item.id) ? '取消参与' : '参与'}本次生成`"
                    :role="group.id === 'videos' ? null : 'button'"
                    :tabindex="group.id === 'videos' ? null : 0"
                    :aria-pressed="group.id === 'videos' ? null : arMaterialSelected(item.id)"
                    @click="group.id !== 'videos' && toggleMaterial(item.id)"
                    @keydown.enter.prevent="group.id !== 'videos' && toggleMaterial(item.id)"
                    @keydown.space.prevent="group.id !== 'videos' && toggleMaterial(item.id)"
                  >
                    <span v-if="group.id !== 'videos'" class="ar-th-check" :class="{ 'is-on': arMaterialSelected(item.id) }" aria-hidden="true">
                      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.2 8.4 6.4 11.6 12.8 4.6" /></svg>
                    </span>
                    <span v-if="group.id === 'videos'" class="ar-play"><VideoPlay /></span>
                    <em>{{ item.label }}</em>
                  </div>
                </div>
              </section>
            </div>
            <p v-else class="ar-empty">这个项目还没有图片素材。先去完成作品、保存草图或生成 AI 版本，报告里才有图可用。</p>
            <div class="ar-tips">
              <b>这些图会怎么用</b>
              <p>只有勾选的图会送进后台工作流出图。出图张数由后台画布上挂的出图节点决定：一个节点出几张，整条流程就出几张。视频不参与出图，只在报告里播放。</p>
            </div>
          </div>
        </section>

        <!-- 3 · 创作叙事 + 提示词：上面这格写「怎么想、怎么做」，下面这格是这次出图用的提示词。
             提示词只影响本次报告出图，用户的画图页/作品记录不会被改。 -->
        <aside class="ar-panel ar-right">
          <div class="ar-right-h">
            <h2>创作叙事</h2>
            <span class="ar-badge">写多少都行，AI 负责整理成完整报告</span>
          </div>
          <div class="ar-editor">
            <div class="ar-editor-h">
              <strong>这次创作，你是怎么想、怎么做的？</strong>
              <span>想到什么写什么，不用讲究顺序</span>
            </div>
            <textarea
              v-model="reportData.idea"
              maxlength="800"
              aria-label="创作叙事"
              placeholder="例如：我想做一个能给植物自动浇水的阳台，因为班里同学经常忘记浇水。一开始我画了三个水箱的位置，试下来只有挂在栏杆外侧最省地方……"
            ></textarea>
            <div class="ar-editor-f">
              <button
                v-if="arNarrationBackup && arNarrationBackup !== reportData.idea"
                type="button"
                class="ar-undo"
                @click="restoreArNarration"
              >恢复我原来写的</button>
              <span>{{ reportData.idea.length }} / 800</span>
            </div>
          </div>
          <div class="ar-ai-row">
            <span class="lbl">不知道怎么写？</span>
            <span class="note">我按你的草图、作品和画图时写的要求整理一版，你再改成自己的话</span>
            <span class="spacer"></span>
            <button type="button" class="ar-ai-btn" :disabled="arDrafting || generating" @click="draftNarrationWithAi">
              <MagicStick />{{ arDrafting ? `正在整理 ${arDraftSeconds}s` : '整理创作构思' }}
            </button>
          </div>
          <div class="ar-ai-meta">
            <span v-if="arDrafting" class="ar-ai-wait">正在让 AI 读你的素材，一般半分钟内出结果，先别关页面</span>
            <span v-else-if="arModelLabel">整理用 {{ arModelLabel }}</span>
            <span v-else>整理用后台配置的报告智能体</span>
          </div>

          <div class="ar-prompt">
            <div class="ar-prompt-h">
              <b>提示词</b>
              <em>这次出图用</em>
              <button v-if="arPromptChanged" type="button" class="ar-prompt-reset" @click="resetArPrompt">恢复原来的</button>
            </div>
            <textarea
              v-model="arPromptText"
              maxlength="600"
              aria-label="本次出图的提示词"
              placeholder="默认带出画图时写的那句，可以改成这份报告想强调的重点"
            ></textarea>
          </div>

          <div class="ar-acts">
            <button type="button" class="ar-prev" @click="openAdvancedPreview"><Iphone />预览</button>
            <button type="button" class="ar-go" :disabled="generating || productStoryImageGenerating" @click="handleAdvancedGenerate">
              <MagicStick /><span>{{ productStoryImageGenerating ? productStoryImageProgress : (generating ? '正在生成…' : '生成 H5 报告') }}</span>
            </button>
          </div>
        </aside>

        <!-- 这一页的智能体只有一个：页面右下角那个「AI 老师」人物（StudentAgentDock）。
             左下角原来还有一张「小画同学」向导卡，是本地写死的话术壳、不是真能力，
             两个入口并存用户会不知道点哪个，已整体删除。 -->
      </div>
    </section>

    <section v-else class="h5-workbench">
      <aside class="h5-control-panel">
        <section class="control-block">
          <div class="block-title">
            <strong>H5 风格</strong>
            <span>{{ selectedTemplate?.name }}</span>
          </div>
          <div v-if="editionAllowsTemplateChoice" class="template-choice-list">
            <button
              v-for="template in visibleTemplates"
              :key="template.id"
              type="button"
              :class="{ active: selectedTemplateId === template.id }"
              @click="selectedTemplateId = template.id"
            >
              <i :style="templateSwatchStyle(template)"></i>
              <span>
                <strong>{{ template.name }}</strong>
                <small>{{ layoutLabel(template.layout) }} · {{ template.description }}</small>
              </span>
            </button>
          </div>
          <p class="recommend-note">{{ editionAllowsTemplateChoice ? `智能推荐：${recommendedTemplate?.name}。你仍然可以手动切换。` : `本版本已由讲师固定使用「${selectedTemplate?.name}」。` }}</p>
        </section>

        <section class="control-block">
          <div class="block-title">
            <strong>报告资料</strong>
            <span>{{ project.title || '当前项目' }}</span>
          </div>
          <label>
            报告名称
            <input v-model="reportTitle" placeholder="请输入报告名称" />
          </label>
        </section>

        <section class="control-block">
          <div class="block-title">
            <strong>智能整理</strong>
            <span>{{ smartOrganizeEnabled ? '智能体' : '本地模板' }}</span>
          </div>
          <label class="switch-row">
            <input v-model="smartOrganizeEnabled" type="checkbox" />
            <span>启用智能体整理项目资料</span>
          </label>
          <ul class="organize-scope">
            <li>创意想法</li>
            <li>扫描草图</li>
            <li>参考元素图</li>
            <li>修改想法</li>
            <li>最终成品</li>
          </ul>
          <button type="button" class="primary-btn full-width" :disabled="generating || !reportTitle.trim()" @click="generateReport">
            {{ generating ? '整理中...' : '智能整理并生成预览' }}
          </button>
          <p v-if="canvasWorkflowStatus" class="strategy-workflow-status">{{ canvasWorkflowStatus }}</p>
        </section>

        <section class="control-block">
          <div class="block-title">
            <strong>分享传播</strong>
            <span>{{ reportSaved ? '海报二维码' : '保存后可用' }}</span>
          </div>
          <button type="button" class="secondary-btn" :disabled="!reportSaved || posterGenerating" @click="generatePoster">
            {{ posterGenerating ? '生成中...' : '生成分享海报' }}
          </button>
          <a v-if="posterUrl" class="poster-download" :href="posterUrl" download="AI创作报告分享海报.png">下载海报</a>
          <img v-if="posterUrl" class="poster-preview" :src="posterUrl" alt="分享海报预览" />
        </section>
      </aside>

      <section class="h5-preview-stage">
        <div class="stage-toolbar">
          <strong>H5 报告预览</strong>
          <div>
            <button type="button" :disabled="!reportReady" @click="previewReport">预览</button>
            <button type="button" :disabled="!reportReady || saving || reportSaved" @click="saveReport">{{ reportSaved ? '已保存' : '保存' }}</button>
            <button type="button" :disabled="!reportReady" @click="exportPdf">导出 PDF</button>
            <button type="button" @click="exitReport">退出</button>
          </div>
        </div>

        <div
          class="h5-book-viewer"
          @pointerdown="handlePointerDown"
          @pointerup="handlePointerUp"
          @pointercancel="handlePointerCancel"
        >
          <button type="button" class="page-nav prev" :disabled="currentPageIndex === 0" aria-label="上一页" @click="prevPage">
            ‹
          </button>

          <article
            ref="reportEl"
            class="h5-report h5-report-book"
            :class="[`layout-${selectedTemplate.layout}`, pageTurnClass]"
            :style="reportThemeStyle"
          >
            <transition :name="pageTransitionName" mode="out-in">
              <section
                v-if="currentPage.type === 'cover'"
                :key="currentPage.id"
                class="h5-cover report-section book-page"
              >
                <div class="cover-copy">
                  <span>{{ selectedTemplate.name }}</span>
                  <h2>{{ reportTitle }}</h2>
                  <p>{{ reportData.summary }}</p>
                </div>
                <div class="hero-art" :style="artworkStyle(finalArtwork)">
                  <span v-if="!hasRealArtwork">用户 AI 作品</span>
                </div>
              </section>

              <section
                v-else-if="currentPage.type === 'module'"
                :key="currentPage.id"
                class="report-section content-section book-page"
                :class="`module-${currentPage.module.key}`"
              >
                <div class="section-heading">
                  <span>{{ currentPage.module.index }}</span>
                  <h3>{{ currentPage.module.title }}</h3>
                </div>

                <div v-if="currentPage.module.type === 'finalWork'" class="final-work-grid">
                  <div class="final-work-image" :style="artworkStyle(currentPage.module.imageSrc || finalArtwork)">
                    <span v-if="!(currentPage.module.imageSrc || hasRealArtwork)">最终作品</span>
                  </div>
                  <p>{{ currentPage.module.body }}</p>
                </div>

                <div v-else-if="currentPage.module.type === 'process'" class="process-grid">
                  <p v-if="currentPage.module.body" class="process-copy">{{ currentPage.module.body }}</p>
                  <div v-for="item in processImages" :key="item.label" class="process-item">
                    <div :style="artworkStyle(item.src)"><span v-if="!item.src">{{ item.label }}</span></div>
                    <strong>{{ item.label }}</strong>
                  </div>
                </div>

                <div v-else-if="currentPage.module.type === 'aiProcess'" class="ai-process-block">
                  <p v-if="currentPage.module.body">{{ currentPage.module.body }}</p>
                  <ol class="timeline-list">
                    <li v-for="item in currentPage.module.timeline || aiProcessItems" :key="item">{{ item }}</li>
                  </ol>
                  <div v-if="currentPage.module.images?.length" class="process-grid">
                    <div v-for="item in currentPage.module.images" :key="item.label" class="process-item">
                      <div :style="artworkStyle(item.src)"><span v-if="!item.src">{{ item.label }}</span></div>
                      <strong>{{ item.label }}</strong>
                    </div>
                  </div>
                </div>

                <div v-else-if="currentPage.module.type === 'teacherComment'" class="certificate-card">
                  <strong>AI 创意小画家成长证书</strong>
                  <p>{{ currentPage.module.body }}</p>
                </div>

                <p v-else>{{ currentPage.module.body }}</p>
              </section>

              <footer v-else :key="currentPage.id" class="h5-report-footer book-page">
                <strong>美佳美画 AI 创意美术</strong>
                <button type="button" @click="openOfficialUrl">{{ selectedTemplate.officialButtonText || '进入官网' }}</button>
              </footer>
            </transition>
          </article>

          <button
            type="button"
            class="page-nav next"
            :disabled="currentPageIndex >= reportPages.length - 1"
            aria-label="下一页"
            @click="nextPage"
          >
            ›
          </button>
        </div>

        <div class="book-footer-controls">
          <button type="button" :disabled="currentPageIndex === 0" @click="prevPage">上一页</button>
          <span>{{ currentPageIndex + 1 }} / {{ reportPages.length }}</span>
          <button type="button" :disabled="currentPageIndex >= reportPages.length - 1" @click="nextPage">下一页</button>
        </div>

        <article
          ref="exportEl"
          class="h5-report h5-export-stack"
          :class="`layout-${selectedTemplate.layout}`"
          :style="reportThemeStyle"
          aria-hidden="true"
        >
          <section class="h5-cover report-section">
            <div class="cover-copy">
              <span>{{ selectedTemplate.name }}</span>
              <h2>{{ reportTitle }}</h2>
              <p>{{ reportData.summary }}</p>
            </div>
            <div class="hero-art" :style="artworkStyle(finalArtwork)">
              <span v-if="!hasRealArtwork">用户 AI 作品</span>
            </div>
          </section>

          <section
            v-for="module in orderedModules"
            :key="module.key"
            class="report-section content-section"
            :class="`module-${module.key}`"
          >
            <div class="section-heading">
              <span>{{ module.index }}</span>
              <h3>{{ module.title }}</h3>
            </div>

            <div v-if="module.type === 'finalWork'" class="final-work-grid">
              <div class="final-work-image" :style="artworkStyle(module.imageSrc || finalArtwork)">
                <span v-if="!(module.imageSrc || hasRealArtwork)">最终作品</span>
              </div>
              <p>{{ module.body }}</p>
            </div>

            <div v-else-if="module.type === 'process'" class="process-grid">
              <p v-if="module.body" class="process-copy">{{ module.body }}</p>
              <div v-for="item in processImages" :key="item.label" class="process-item">
                <div :style="artworkStyle(item.src)"><span v-if="!item.src">{{ item.label }}</span></div>
                <strong>{{ item.label }}</strong>
              </div>
            </div>

            <div v-else-if="module.type === 'aiProcess'" class="ai-process-block">
              <p v-if="module.body">{{ module.body }}</p>
              <ol class="timeline-list">
                <li v-for="item in module.timeline || aiProcessItems" :key="item">{{ item }}</li>
              </ol>
              <div v-if="module.images?.length" class="process-grid">
                <div v-for="item in module.images" :key="item.label" class="process-item">
                  <div :style="artworkStyle(item.src)"><span v-if="!item.src">{{ item.label }}</span></div>
                  <strong>{{ item.label }}</strong>
                </div>
              </div>
            </div>

            <div v-else-if="module.type === 'teacherComment'" class="certificate-card">
              <strong>AI 创意小画家成长证书</strong>
              <p>{{ module.body }}</p>
            </div>

            <p v-else>{{ module.body }}</p>
          </section>

          <footer class="h5-report-footer">
            <strong>美佳美画 AI 创意美术</strong>
            <button type="button" @click="openOfficialUrl">{{ selectedTemplate.officialButtonText || '进入官网' }}</button>
          </footer>
        </article>
      </section>
    </section>
    <div v-if="showH5LayoutPreview && h5LayoutResult" class="h5-designed-preview" @click.self="showH5LayoutPreview = false">
      <section role="dialog" aria-modal="true" aria-label="自动排版报告预览"><header><strong>{{ reportTitle }} · 自动排版预览</strong><button type="button" @click="showH5LayoutPreview = false">关闭</button></header><div class="h5-designed-preview-body"><H5ReportRenderer :template="h5LayoutResult.templateSnapshot" :layout-snapshot="h5LayoutResult.layout" :pages="h5LayoutResult.pages" device="phone" :student-name="project.studentName || '用户'" :edition-label="editionLabel" @official="openOfficialUrl" /></div><p v-if="reportData.warnings.length">{{ reportData.warnings.join('；') }}</p><footer><button type="button" :disabled="saving || reportSaved && h5SavedStatus !== 'draft'" @click="saveReport({ submit: true })">{{ h5SavedStatus === 'published' ? '已发布' : h5SavedStatus === 'pending' ? '已提交审核' : saving ? '保存中…' : '保存并提交审核' }}</button><button v-if="publishedShareUrl" type="button" :disabled="posterGenerating" @click="generatePoster">生成分享海报</button></footer><a v-if="posterUrl" :href="posterUrl" download="AI创作报告分享海报.png"><img :src="posterUrl" alt="分享海报，点击下载" style="width:100%" /></a></section>
    </div>
    <div v-if="isAdvanced && isProductDesignStory(selectedTemplate) && !selectedTemplate?.designDocument" class="product-story-export-stage" aria-hidden="true">
      <ProductStoryImagePage
        v-for="(page, index) in advancedStoryPages"
        :key="page.id"
        :ref="(element) => setProductStoryPageRef(element, index)"
        :page="page"
        :page-index="index"
        :page-count="advancedStoryPages.length"
        :student-name="project.studentName || '林同学'"
        :background-url="productStoryBackgrounds[page.id] || ''"
      />
    </div>

    <StudentAgentDock
      class="report-agent-dock"
      page="report"
      page-label="项目报告"
      :panel-side="isAdvanced ? 'right' : 'left'"
      :samples="agentReportSamples"
      :canvas-context="agentCanvasContext"
      :busy="generating"
      @execute="handleAgentExecute"
    />
  </main>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  ArrowRight,
  BrushFilled,
  CircleCheckFilled,
  Document,
  EditPen,
  Grid,
  InfoFilled,
  Iphone,
  MagicStick,
  MoreFilled,
  Picture,
  Plus,
  Search,
  StarFilled,
  Sunny,
  UserFilled,
  VideoPlay,
  View as ViewIcon,
} from '@element-plus/icons-vue'
import QRCode from 'qrcode'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { apiClient } from '../services/apiClient'
import { createEmptyProject, useProjectStore } from '../stores/projectStore'
import { useCourseStore } from '../stores/courseStore'
import { useDifficultyStore } from '../stores/difficultyStore'
import { h5ReportLayouts, h5ReportModules, useH5ReportTemplateStore } from '../stores/h5ReportTemplateStore'
import H5ReportRenderer from '../components/H5ReportRenderer.vue'
import { H5_CHAPTERS, recordedH5Pages } from '../utils/h5Layout'
import ProductStoryImagePage from '../components/ProductStoryImagePage.vue'
import { generateArtwork } from '../services/aiGateway'
import advancedCoverArt from '../assets/report/advanced-eco-city-cover.png'
import starterGrowthDiaryCover from '../assets/report/templates/starter-growth-diary.png'
import starterKidsClassroomCover from '../assets/report/templates/starter-kids-classroom.png'
import starterLittleGalleryCover from '../assets/report/templates/starter-little-gallery.png'
import productDesignStoryCover from '../assets/report/templates/product-design-story-cover.png'
import { isProductDesignStory, productDesignStoryPages } from '../utils/productDesignStory'
import StudentAgentDock from '../components/StudentAgentDock.vue'

const SERVER_AUTH_MODE = import.meta.env.VITE_AUTH_MODE === 'server'

const starterTemplateVisuals = {
  'growth-file': { label: '成长日记风', cover: starterGrowthDiaryCover },
  'kids-classroom': { label: '童趣课堂风', cover: starterKidsClassroomCover },
  'art-gallery': { label: '小小艺术展', cover: starterLittleGalleryCover },
  'ai-tech': { label: 'AI科技风', cover: advancedCoverArt },
  'product-design-story': { label: '我的产品设计故事', cover: productDesignStoryCover },
}

const router = useRouter()
const route = useRoute()
const projectStore = useProjectStore()
const courseStore = useCourseStore()
const difficultyStore = useDifficultyStore()
const h5TemplateStore = useH5ReportTemplateStore()
const reportEl = ref(null)
const exportEl = ref(null)
const selectedTemplateId = ref('')
const reportTitle = ref('')
const generating = ref(false)
const saving = ref(false)
const posterGenerating = ref(false)
const posterUrl = ref('')
const reportReady = ref(false)
const reportSaved = ref(false)
const savedReportId = ref('')
const publishedShareUrl = ref('')
const smartOrganizeEnabled = ref(true)
const canvasWorkflowImages = ref([])
// 用户自己上传的素材原图（后端原样透传回来的，不重绘）。报告里本来就有这些图，
// 单独留着只用于「本次用了几张素材」的提示，不重复塞进报告版面。
const canvasWorkflowMaterialImages = ref([])
const canvasWorkflowRunning = ref(false)
const canvasWorkflowStatus = ref('')
const canvasWorkflowReportId = ref('')
const canvasWorkflowPageImages = ref([])
const canvasWorkflowMetadata = ref({ adapterKey: '', workflowVersion: 0, nodeResults: [], warnings: [] })
// 右栏「提示词」框：默认带出画图时写的那句，用户可以改成这份报告想强调的重点。
// 只影响本次出图（后端把它拼成「原始提示词」交给工作流），不回写 project.prompt，
// 免得用户以为只是在改报告、结果把画图页的提示词也改了。
const arPromptText = ref('')
const arPromptOrigin = computed(() => String(project.prompt || project.ideaPrompt || '').trim())
const arPromptChanged = computed(() => arPromptText.value.trim() !== arPromptOrigin.value)
function resetArPrompt() {
  arPromptText.value = arPromptOrigin.value
}
// 桌面用鼠标滚轮就能横着翻风格卡：纵向滚轮转成横向滚动，不需要拖滚动条
const arStripRef = ref(null)
const arStripNav = reactive({ left: false, right: false })
// 滚动位置变了就重算「还能往哪边滑」，箭头不会一直挂着不起作用
function syncArStripNav() {
  const strip = arStripRef.value
  if (!strip) {
    arStripNav.left = arStripNav.right = false
    return
  }
  /* ⚠ 只有一张卡时一个箭头都不出。少了这一句会出鬼：
     单卡时卡上套了 margin-inline:auto，自动外边距会把 scrollWidth 撑得比
     clientWidth 大，于是 canScroll 判成真，「上一个」箭头就在明明滑不动时亮着。 */
  const cardCount = strip.querySelectorAll('.ar-style').length
  const canScroll = cardCount > 1 && strip.scrollWidth - strip.clientWidth > 2
  /* 起点阈值 4px（原来是 12）：加了 scroll-padding 之后第一张卡吸附时 scrollLeft 就是
     0 了，不再有那 10px 的内边距偏移。留 4px 只是吃浮点误差。 */
  arStripNav.left = canScroll && strip.scrollLeft > 4
  /* 右端不跟着改成 12：滑到最右时 scrollLeft 正好等于 max，减 12 会让箭头残留。
     右端只留 4px 的浮点余量（sub-pixel 宽度会让它差 0.5 左右）。 */
  arStripNav.right = canScroll && strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 4
}
// 一次滑一张卡（卡宽 + 10px 间距），不按像素挪，用户一下就到下一张
function stepArStrip(direction) {
  const strip = arStripRef.value
  if (!strip) return
  const card = strip.querySelector('.ar-style')
  const step = card ? card.getBoundingClientRect().width + 10 : strip.clientWidth
  strip.scrollTo({ left: strip.scrollLeft + step * direction, behavior: 'smooth' })
}
/* 滚轮一次手势 = 翻一张卡。
   ⚠ 不要写成 `scrollLeft += deltaY`：容器是 `scroll-snap-type: x mandatory`，
   滚个一两百像素还到不了下一张的吸附点，浏览器当场把位置吸回原处 —— 用户感觉
   「滚了没反应、弹回去了」（实测 10 → 10，一点没动）。改成累计到阈值就整张翻，
   落点本身就是吸附点，snap 不会再有回弹。惯性滚动会连发几十个 wheel 事件，
   所以一次手势只许翻一张，600ms 内不再累计。 */
let arStripWheelAcc = 0
let arStripWheelLockAt = 0
function scrollStyleStrip(event) {
  const strip = event.currentTarget
  if (!strip || strip.scrollWidth <= strip.clientWidth) return
  const now = Date.now()
  if (now - arStripWheelLockAt < 600) return
  arStripWheelAcc += event.deltaY || event.deltaX
  // 30px 是「明显想翻页」与「手一抖」的分界，触控板轻扫不会被误判成翻页
  if (Math.abs(arStripWheelAcc) < 30) return
  const direction = arStripWheelAcc > 0 ? 1 : -1
  arStripWheelAcc = 0
  arStripWheelLockAt = now
  stepArStrip(direction)
}
const arExcludedMaterialIds = ref([])
const h5LayoutResult = ref(null)
const h5SavedStatus = ref('')
const showH5LayoutPreview = ref(false)
const organizedContentCache = new Map()
const currentPageIndex = ref(0)
const pageDirection = ref('next')
const pointerStartX = ref(0)
const project = reactive(createEmptyProject())
// 提示词框跟着「原来的那句」走一遍：project 是进页面之后才异步填进来的，
// 用 arPromptAppliedOrigin 记住上次带出来的是什么，只有用户没改动过（框里还是上次带出的那句）
// 才跟着换，避免用户改完又被项目信息覆盖掉。
// ⚠ 必须放在 project 声明之后：watch 建的时候会立刻求一次源，放前面会踩 TDZ
//   （Cannot access 'project' before initialization，整页白屏）。
const arPromptAppliedOrigin = ref('')
watch(arPromptOrigin, (next) => {
  if (arPromptText.value.trim() === arPromptAppliedOrigin.value) arPromptText.value = next
  arPromptAppliedOrigin.value = next
})
const h5RuntimeConfig = reactive({ loaded: false, edition: null, strategies: [], strategy: null, templates: [], defaultStrategyId: 'h5-standard', defaultTemplateId: '', reportModel: null })
const selectedH5StrategyId = ref('h5-standard')
const isJunior = computed(() => project.difficulty === 'starter')
const isAdvanced = computed(() => project.difficulty === 'pro')
const h5EditionUnavailable = computed(() => h5RuntimeConfig.loaded && ['unconfigured', 'disabled'].includes(h5RuntimeConfig.edition?.status))
const editionAllowsTemplateChoice = computed(() => h5RuntimeConfig.edition?.studentCanChoose === true)
const editionLabel = computed(() => ({ junior: '初级版', starter: '入门版', advanced: '进阶版', pro: '高级版' }[project.difficulty] || '当前版本'))
const storyFillSlot = ref('story-cover.hero')
const juniorActiveMaterial = ref('sketch')
const juniorListening = ref(false)
const juniorSpeechSupported = ref(false)
const juniorVoiceTranscript = ref('')
const juniorPromptCards = reactive({ what: '', why: '', favorite: '' })
const starterPreviewOpen = ref(false)
const starterPreviewIndex = ref(0)
const starterStyleDrawerOpen = ref(false)
const starterStyleMode = ref('auto')
const starterStyleDraftId = ref('')
const starterCarouselIndex = ref(0)
const starterCarouselTrack = ref(null)
const starterCarouselDragging = ref(false)
const starterCarouselMoved = ref(false)
const starterDragStartX = ref(0)
const starterDragScrollLeft = ref(0)
const starterPreviewTouchX = ref(0)
const productStoryPageRefs = ref([])
const productStoryPageImages = ref([])
const productStoryBackgrounds = reactive({})
const productStoryImageGenerating = ref(false)
const productStoryImageProgress = ref('')
const productStoryReportId = ref('')
let juniorRecognition = null
const reportData = reactive({
  summary: '点击一键生成后，系统会整理用户项目资料并生成适合 H5 展示的报告内容。',
  course: '',
  idea: '',
  aiReview: '',
  aiProvider: '',
  warnings: [],
  pages: [],
})

const visibleTemplates = computed(() => h5RuntimeConfig.templates.length ? h5RuntimeConfig.templates : (h5TemplateStore.published.length ? h5TemplateStore.published : h5TemplateStore.templates))
const h5StrategyOptions = computed(() => h5RuntimeConfig.strategies.filter((item) => item.status === 'enabled' || (item.status === 'testing' && item.studentSelectable === true)))
const selectedH5Strategy = computed(() => h5RuntimeConfig.strategy || h5StrategyOptions.value.find((item) => item.id === selectedH5StrategyId.value) || h5StrategyOptions.value[0] || { id: 'h5-standard', name: '方案1：标准 H5 报告' })
const h5StrategyExecutionReady = computed(() => selectedH5Strategy.value?.executionReady !== false)
const currentCourse = computed(() => courseStore.courses.find((course) => course.id === project.courseId) || null)
const courseH5Settings = computed(() => currentCourse.value?.h5ReportSettings || { selectionMode: 'auto', allowedTemplateIds: [], defaultTemplateId: '' })
const juniorAvailableTemplates = computed(() => {
  const allowed = new Set(courseH5Settings.value.allowedTemplateIds || [])
  const starterOrder = { 'growth-file': 0, 'kids-classroom': 1, 'art-gallery': 2, 'ai-tech': 3 }
  return visibleTemplates.value
    .filter((template) => allowed.has(template.id))
    .sort((left, right) => (starterOrder[left.layout] ?? 9) - (starterOrder[right.layout] ?? 9))
})
const juniorStudentCanChoose = computed(() => (
  isJunior.value
  && editionAllowsTemplateChoice.value
  && courseH5Settings.value.selectionMode === 'student'
  && juniorAvailableTemplates.value.length > 0
))
const advancedAvailableTemplates = computed(() => {
  if (!isAdvanced.value) return []
  const courseAllowed = new Set(courseH5Settings.value.allowedTemplateIds || [])
  const courseRestricted = courseH5Settings.value.selectionMode === 'student' && courseAllowed.size > 0
  const source = courseRestricted
    ? visibleTemplates.value.filter((template) => courseAllowed.has(template.id))
    : visibleTemplates.value
  return source.length ? source : (selectedTemplate.value ? [selectedTemplate.value] : [])
})
const advancedCanChoose = computed(() => editionAllowsTemplateChoice.value && advancedAvailableTemplates.value.length > 1)
const templateRecommendationPool = computed(() => (isJunior.value && juniorStudentCanChoose.value ? juniorAvailableTemplates.value : visibleTemplates.value))
const recommendedTemplate = computed(() => {
  const text = [project.title, project.prompt, project.courseTitle, project.courseCategory].join(' ')
  const pool = templateRecommendationPool.value
  if (/低龄|童趣|绘本|启蒙|儿童/i.test(text)) return pool.find((item) => item.layout === 'kids-classroom') || pool[0]
  if (/成长|阶段|过程|草图|线稿/i.test(text)) return pool.find((item) => item.layout === 'growth-file') || pool[0]
  if (/作品|展览|画展|成品/i.test(text)) return pool.find((item) => item.layout === 'art-gallery') || pool[0]
  if (!isJunior.value && /AI|3D|科技|数字|视频/i.test(text)) return pool.find((item) => item.layout === 'ai-tech') || pool[0]
  return pool.find((item) => item.layout === 'kids-classroom') || pool[0]
})
const selectedTemplate = computed(() => visibleTemplates.value.find((item) => item.id === selectedTemplateId.value) || recommendedTemplate.value || visibleTemplates.value[0])
const starterStyleDraftTemplate = computed(() => juniorAvailableTemplates.value.find((item) => item.id === starterStyleDraftId.value) || juniorAvailableTemplates.value[0] || selectedTemplate.value)
const finalArtwork = computed(() => {
  const final = project.versions?.find((item) => item.id === project.finalVersionId) || project.versions?.[0]
  return final?.imageUrl || extractUrl(final?.background) || project.cover || ''
})
const hasRealArtwork = computed(() => Boolean(finalArtwork.value && !String(finalArtwork.value).startsWith('linear-gradient')))
const juniorSketchSource = computed(() => project.sketchOriginal || project.sketchOptimized || finalArtwork.value || '')
const juniorModelSource = computed(() => materialSource(project.models3d?.[0]))
const juniorVideoSource = computed(() => materialSource(project.videos?.[0]))
const juniorVideoDuration = computed(() => formatJuniorDuration(project.videos?.[0]?.duration || project.videos?.[0]?.durationSeconds))
const juniorHeroMaterial = computed(() => {
  const materials = {
    sketch: { label: '我的手稿', meta: '创作草图', src: juniorSketchSource.value },
    model: { label: '我的3D作品', meta: `${project.models3d?.length || 0} 个作品`, src: juniorModelSource.value },
    video: { label: '我的视频讲解', meta: juniorVideoDuration.value, src: juniorVideoSource.value },
  }
  const selected = materials[juniorActiveMaterial.value]
  return selected?.src ? selected : (materials.sketch.src ? materials.sketch : selected)
})
const juniorCanGenerate = computed(() => Boolean(reportTitle.value.trim() && reportData.idea.trim()))
const starterPreviewPages = computed(() => {
  const title = project.title && project.title !== '新的AI绘画项目' ? project.title : '我的创作故事'
  const processSource = project.sketchOptimized || project.sketchOriginal || ''
  const finalSource = finalArtwork.value || juniorModelSource.value || ''
  return [
    { id: 'cover', label: '封面', eyebrow: '我的创作报告', title, text: `我是小画家，这是我为大家准备的作品故事。`, src: finalSource || juniorSketchSource.value, icon: '✦', emptyTitle: '我的封面准备中', emptyText: '完成作品后，这里会出现漂亮的封面。' },
    { id: 'idea', label: '创意', eyebrow: '我想这样介绍', title: '我的创意想法', text: reportData.idea || '我还没有写下创意说明。', src: juniorSketchSource.value, icon: '✎', emptyTitle: '创意已经写好了', emptyText: '这页会用我的话讲述作品。' },
    { id: 'process', label: '过程', eyebrow: '一步一步完成', title: '我的创作过程', text: processSource ? '我从手稿开始，不断观察、尝试和修改，让想法慢慢变成作品。' : '这次还没有保存过程图片，正式报告会友好地跳过缺少的内容。', src: processSource, icon: '▦', emptyTitle: '还没有过程图片', emptyText: '不影响预览，也不会伪造作品内容。' },
    { id: 'final', label: '作品', eyebrow: '终于完成啦', title: '我的最终作品', text: finalSource ? '这是我最满意的作品，希望你能发现里面的小惊喜。' : '作品完成以后，它会在这里大大地展示出来。', src: finalSource, icon: '★', emptyTitle: '最终作品还没有加入', emptyText: '完成后再回来看看吧。' },
    { id: 'ending', label: '结尾', eyebrow: '谢谢观看', title: '谢谢你来看我的作品', text: '这是我的创作故事。每一次想象和尝试，都让我的作品变得更特别。', src: juniorVideoSource.value || finalSource, icon: '♥', emptyTitle: '我的故事讲完啦', emptyText: '谢谢你的认真观看。' },
  ]
})
const starterPreviewPage = computed(() => starterPreviewPages.value[starterPreviewIndex.value] || starterPreviewPages.value[0])
const starterPreviewThemeStyle = computed(() => {
  const theme = selectedTemplate.value?.theme || {}
  return {
    '--preview-primary': theme.primary || '#2683f5',
    '--preview-secondary': theme.secondary || '#a8dbff',
    '--preview-accent': theme.accent || '#ff9518',
    '--preview-bg': theme.background || '#f8fbff',
    '--preview-surface': theme.surface || '#ffffff',
    '--preview-text': theme.text || '#17315f',
    fontFamily: selectedTemplate.value?.fontFamily || 'Microsoft YaHei',
  }
})
const advancedProjectTitle = computed(() => project.title && project.title !== '新的AI绘画项目' ? project.title : '我的作品')
const advancedCoverSource = computed(() => finalArtwork.value || advancedCoverArt)
/** 报告页该用哪个项目的素材。
 *  历史坑：草稿里常有一批「点了新建项目但没画东西」的空壳，页面又只取最新那条草稿，
 *  于是素材栏空白——而用户其实在「我的作品」里明明有画好的项目。 */
function projectMaterialCount(item) {
  if (!item) return 0
  return [item.sketchOriginal, item.sketchOptimized].filter(Boolean).length
    + (item.referenceImages || []).length
    + (item.versions || []).length
    + (item.models3d || []).length
    + (item.videos || []).length
}
function resolveReportSourceProject() {
  const current = projectStore.currentProject || projectStore.draft || null
  if (projectMaterialCount(current)) return current
  // projects 由服务端按 updated_at 倒序下发，find 到第一个有素材的就是「最近一个有作品的项目」
  const fallback = (projectStore.projects || []).find((item) => projectMaterialCount(item))
  return fallback || current
}

// ===== 高级版三栏工作台：素材 / 叙事 / 风格 =====
const arFillOpen = ref(false)
const arDrafting = ref(false)
const arDraftSeconds = ref(0)
let arDraftTimer = 0
const arReportModel = computed(() => h5RuntimeConfig.reportModel || {})
// 供应商 label 有时被填成了模型名（deepseek 那条就是），避免显示成「xx · xx」重复两遍
const arModelLabel = computed(() => {
  const info = arReportModel.value || {}
  const model = String(info.model || '').trim()
  const provider = String(info.providerLabel || '').trim()
  if (!model && !provider) return ''
  if (!provider || provider.toLowerCase() === model.toLowerCase()) return model || provider
  return `${provider} · ${model}`
})
const arNarrationBackup = ref('')

function arImageUrl(item) {
  if (!item) return ''
  if (typeof item === 'string') return item.startsWith('linear-gradient') ? '' : item
  return materialSource(item)
}

const arMaterialGroups = computed(() => {
  const seen = new Set()
  const groups = []
  const pushGroup = (id, label, rawItems) => {
    const items = []
    rawItems.forEach((entry) => {
      const src = arImageUrl(entry.src)
      if (!src || seen.has(src)) return
      seen.add(src)
      items.push({ id: entry.id, label: entry.label, src })
    })
    if (items.length) groups.push({ id, label, items })
  }
  pushGroup('sketches', '手绘草图', [
    { id: 'sketch-original', label: '最初草图', src: project.sketchOriginal },
    { id: 'sketch-optimized', label: '优化线稿', src: project.sketchOptimized },
  ])
  // 参考图在 store 里已统一成 { id, name, preview } 对象（旧数据可能是纯字符串），
  // 直接塞 item 会让 src 变成 "[object Object]"，必须过 materialSource 取真实地址。
  pushGroup('references', '灵感参考', (project.referenceImages || []).map((item, index) => ({ id: `reference-${item?.id || index}`, label: `参考 ${index + 1}`, src: materialSource(item) })))
  pushGroup('versions', 'AI 版本', (project.versions || []).map((item, index) => ({ id: `version-${item.id || index}`, label: item.id === project.finalVersionId ? '最终作品' : `AI${index + 1}`, src: item })))
  pushGroup('models', '3D 作品', (project.models3d || []).map((item, index) => ({ id: `model-${item.id || index}`, label: `3D${index + 1}`, src: item })))
  pushGroup('videos', '视频封面', (project.videos || []).map((item, index) => ({ id: `video-${item.id || index}`, label: `视频${index + 1}`, src: item })))
  return groups
})
const arMaterialTotal = computed(() => arMaterialGroups.value.reduce((total, group) => total + group.items.length, 0))
const arMaterialIds = computed(() => arMaterialGroups.value.flatMap((group) => group.items.map((item) => item.id)))
const arSelectedMaterialTotal = computed(() => arMaterialIds.value.filter((id) => !arExcludedMaterialIds.value.includes(id)).length)
const arAllSelected = computed(() => arMaterialTotal.value > 0 && arSelectedMaterialTotal.value === arMaterialTotal.value)

function arMaterialSelected(id) {
  return !arExcludedMaterialIds.value.includes(id)
}
function toggleMaterial(id) {
  if (arExcludedMaterialIds.value.includes(id)) {
    arExcludedMaterialIds.value = arExcludedMaterialIds.value.filter((item) => item !== id)
  } else {
    arExcludedMaterialIds.value = [...arExcludedMaterialIds.value, id]
  }
}
function toggleAllMaterials() {
  arExcludedMaterialIds.value = arAllSelected.value ? [...arMaterialIds.value] : []
}

// ===== 换项目：素材到底来自哪个项目，由用户自己决定 =====
// 原来素材只认「当前项目」，那个项目没图就自动退到「最近一个有图的项目」，
// 于是上节课还没删的项目会被悄悄塞进这节课的报告里，用户只能一张张取消勾选，没有别的办法。
const arProjectPickerOpen = ref(false)
// 用户的项目散在两个地方：画完保存进「我的作品」的在 projectStore.projects，
// 还没结项的在 projectStore.draft。只读 projects 会让列表里连「当前这个项目」都没有
// （实测：当前素材来自 draft 里的项目，而 projects 里只有一条不相干的）——两处都要算进来。
const arAllProjects = computed(() => {
  const list = [...(projectStore.projects || [])]
  const seen = new Set(list.map((item) => item.id))
  for (const item of [projectStore.draft, projectStore.currentProject]) {
    if (item && item.id && !seen.has(item.id)) {
      seen.add(item.id)
      list.push(item)
    }
  }
  return list
})
// 卡片上显示「哪天画完的」，别把 ISO 串原样甩给用户
function arProjectDay(value) {
  const raw = String(value || '')
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (v) => String(v).padStart(2, '0')
  return `${date.getMonth() + 1}月${pad(date.getDate())}日`
}
const arProjectOptions = computed(() => arAllProjects.value
  .filter((item) => projectMaterialCount(item) > 0)
  // 报告版本各管各的：高级版页面不列入门版项目，否则生成时会因为模板和难度对不上直接失败
  .filter((item) => (item.difficulty || 'starter') === project.difficulty)
  .map((item) => ({
    id: item.id,
    title: item.title || '未命名项目',
    updatedAt: arProjectDay(item.updatedAt || item.createdAt),
    cover: item.cover || item.sketchOptimized || item.sketchOriginal || materialSource(item.referenceImages?.[0]) || '',
    count: projectMaterialCount(item),
  }))
  // 当前项目排最前，用户一眼看到「现在用的是它」
  .sort((a, b) => (a.id === project.id ? -1 : b.id === project.id ? 1 : 0)))
const arOtherEditionProjectCount = computed(() => arAllProjects.value
  .filter((item) => projectMaterialCount(item) > 0 && (item.difficulty || 'starter') !== project.difficulty).length)

async function switchReportProject(target) {
  if (!target || target.id === project.id) {
    arProjectPickerOpen.value = false
    return
  }
  const next = arAllProjects.value.find((item) => item.id === target.id)
  if (!next) { ElMessage.warning('这个项目暂时读不到，请刷新后重试'); return }
  // 换项目会把叙事框整段换掉，用户写过的字不能被无声清空——有内容就先问一句
  const typed = String(reportData.idea || '').trim()
  if (typed) {
    try {
      await ElMessageBox.confirm(
        `换成「${next.title}」后，叙事框会变成那个项目的内容。现在写的这段话建议先复制出去，或者点「保存草稿」再换。`,
        '换项目会清空当前叙事',
        { confirmButtonText: '我保存好了，换', cancelButtonText: '先不换' },
      )
    } catch { return }
  }
  // 沿用页面已确定的难度，其余字段整份换掉；不用 Object.assign 是为了不残留上一个项目的字段
  Object.assign(project, { ...createEmptyProject(project.difficulty), ...next, difficulty: project.difficulty })
  // 上一个项目的勾选状态、已出结果、叙事备份都跟着作废，否则会把 A 项目的图带进 B 项目的报告
  arExcludedMaterialIds.value = []
  arNarrationBackup.value = ''
  reportData.idea = next.idea || next.reportIdea || ''
  canvasWorkflowImages.value = []
  canvasWorkflowPageImages.value = []
  canvasWorkflowMaterialImages.value = []
  canvasWorkflowMetadata.value = { adapterKey: '', workflowVersion: 0, nodeResults: [], warnings: [] }
  canvasWorkflowStatus.value = ''
  reportReady.value = false
  reportSaved.value = false
  savedReportId.value = ''
  reportTitle.value = `${project.title || '我的项目'} H5 创作报告`
  arProjectPickerOpen.value = false
  ElMessage.success(`素材已换成「${project.title}」的 ${arMaterialTotal.value} 张`)
}

// 「选一个风格」的卡片 = 后台「报告工作流库」里已发布、且老师勾了「用户可选」的画布模板。
// 老师在后台发布一个，这里就多一张；名字和封面都取那个工作流自己的，不再有写死的图文排版卡。
const arStyleCards = computed(() => h5StrategyOptions.value
  .filter((strategy) => strategy.type === 'canvas-workflow')
  .map((strategy) => ({
    id: `canvas:${strategy.id}`,
    kind: 'canvas',
    name: strategy.name || '未命名风格',
    tag: Number(strategy.pageCount || 0) > 0 ? `画布整页 · 约 ${strategy.pageCount} 页` : '画布整页 · AI 逐页出图',
    cover: strategy.coverUrl || advancedCoverSource.value,
    recommended: false,
    strategyId: strategy.id,
  })))
// 现在只剩「画布整页」一类，分类按钮没意义了；留着这套结构是为了以后真的要分组时能加回来
const arVisibleStyleCards = computed(() => arStyleCards.value)
const arSelectedStyleId = computed(() => (selectedH5Strategy.value?.type === 'canvas-workflow'
  ? `canvas:${selectedH5Strategy.value.id}`
  : ''))

const storyFillMode = computed(() => project.h5LayoutDraft?.fillMode === 'manual' ? 'manual' : 'auto')
const legacyStoryFillSlots = [
  { id: 'cover', label: '第1页 · 封面主图' },
  { id: 'inspiration', label: '第2页 · 灵感图片' },
  { id: 'problem', label: '第3页 · 问题场景图' },
  { id: 'sketch', label: '第4页 · 第一版草图' },
  { id: 'ai-1', label: '第5页 · AI方案一' },
  { id: 'ai-2', label: '第5页 · AI方案二' },
  { id: 'ai-3', label: '第5页 · AI方案三' },
  { id: 'model', label: '第6页 · 3D视觉图' },
  { id: 'scene', label: '第7页 · 环境搭配图' },
  { id: 'reflection', label: '第8页 · 收获页作品图' },
]
const storyFillSlots = [
  { id: 'story-cover.hero', label: '第1页 · 封面最终作品' },
  { id: 'story-cover.detail', label: '第1页 · 封面草图局部' },
  { id: 'story-inspiration.hero', label: '第2页 · 灵感观察图' },
  { id: 'story-problem.hero', label: '第3页 · 问题场景图' },
  { id: 'story-sketch.original', label: '第4页 · 最初草图' },
  { id: 'story-sketch.refined', label: '第4页 · 修改后草图' },
  { id: 'story-ai.a', label: '第5页 · AI方案 A' },
  { id: 'story-ai.b', label: '第5页 · AI方案 B' },
  { id: 'story-ai.c', label: '第5页 · AI方案 C' },
  { id: 'story-model.hero', label: '第6页 · 3D主视图' },
  { id: 'story-scene.hero', label: '第7页 · 环境搭配图' },
  { id: 'story-reflection.hero', label: '第8页 · 收获页作品图' },
]
const storyFillSlotLabel = computed(() => storyFillSlots.find((slot) => slot.id === storyFillSlot.value)?.label || '当前图框')
const storyManualAssets = computed(() => {
  const source = [
    { id: 'sketch-original', label: '我的草图', src: project.sketchOriginal },
    { id: 'sketch-refined', label: '优化草图', src: project.sketchOptimized },
    ...(project.referenceImages || []).map((item, index) => ({ id: `reference-${index}`, label: `灵感图${index + 1}`, src: materialSource(item) })),
    ...(project.versions || []).map((item, index) => ({ id: `version-${item.id || index}`, label: index === 0 ? '最终作品' : `AI方案${index + 1}`, src: materialSource(item) })),
    ...(project.models3d || []).map((item, index) => ({ id: `model-${item.id || index}`, label: `3D作品${index + 1}`, src: materialSource(item) })),
    ...(project.videos || []).map((item, index) => ({ id: `video-${item.id || index}`, label: `视频封面${index + 1}`, src: materialSource(item) })),
  ]
  const seen = new Set()
  return source.filter((item) => item.src && !seen.has(item.src) && seen.add(item.src)).slice(0, 12)
})
const processImages = computed(() => [
  { label: '原始草图', src: project.sketchOriginal },
  { label: '优化线稿', src: project.sketchOptimized },
  { label: 'AI 成品', src: finalArtwork.value },
  ...canvasWorkflowImages.value.map((src, index) => ({ label: `方案2工作流图 ${index + 1}`, src })),
])
// 「我的产品设计故事」整页版式：导出舞台、保存报告、逐页截图都读它。
// 早先这个变量只在模板里被引用、从未声明，一走到整页截图就是 undefined。
const advancedStoryPages = computed(() => productDesignStoryPages(
  { ...project, finalArtworkUrl: finalArtwork.value },
  { idea: reportData.idea, summary: reportData.summary || reportData.idea },
  selectedTemplate.value,
))
const aiProcessItems = computed(() => {
  const versions = project.versions || []
  const items = versions.length
    ? versions.slice(0, 4).map((item, index) => `${index + 1}. ${item.note || item.title || 'AI 生成版本'}`)
    : ['整理创意想法', '生成首张作品', '选择最终作品']
  if (canvasWorkflowImages.value.length) items.push(`方案2工作流完成 ${canvasWorkflowImages.value.length} 张报告图`)
  if (canvasWorkflowMaterialImages.value.length) items.push(`本次用上 ${canvasWorkflowMaterialImages.value.length} 张用户素材原文`)
  return items
})
const courseAnswerText = computed(() => {
  const answers = Array.isArray(project.courseAnswers) ? project.courseAnswers : []
  return answers
    .map((answer, index) => {
      if (typeof answer === 'string') return `${index + 1}. ${answer}`
      return `${index + 1}. ${answer.question || '课程问题'}：${answer.answer || answer.value || answer.text || '已完成'}`
    })
    .join('；')
})
const orderedModules = computed(() => {
  if (reportData.pages.length) {
    const template = selectedTemplate.value || {}
    const hidden = new Set(template.hiddenModules || [])
    const order = template.moduleOrder || h5ReportModules.map((item) => item.key)
    return reportData.pages
      .map((page, index) => ({
        ...page,
        key: page.key || page.id || page.type || `h5-page-${index + 1}`,
        type: page.type || page.key || page.id || `h5-page-${index + 1}`,
      }))
      .filter((page) => !hidden.has(page.type))
      .sort((left, right) => {
        const leftIndex = order.indexOf(left.type)
        const rightIndex = order.indexOf(right.type)
        return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex)
      })
      .map((page, index) => ({ ...page, index: String(index + 1).padStart(2, '0') }))
  }
  const template = selectedTemplate.value
  const hidden = new Set(template.hiddenModules || [])
  const map = {
    course: { title: '课程主题', body: reportData.course },
    idea: { title: '用户创意想法', body: reportData.idea },
    process: { title: '草图与创作过程', body: '' },
    aiPrompt: { title: '我的 AI 提示词', body: project.prompt || project.ideaPrompt || reportData.idea },
    aiProcess: { title: 'AI 生成过程', body: '' },
    finalWork: { title: '最终作品展示', body: reportData.summary },
    aiReview: { title: 'AI 点评', body: reportData.aiReview },
    teacherComment: { title: '讲师给我的成长建议', body: '讲师可以在这里补充课堂表现、作品亮点和下一步建议。' },
    backCover: { title: '我的项目收获', body: reportData.summary },
  }
  return (template.moduleOrder || h5ReportModules.map((item) => item.key))
    .filter((key) => key !== 'cover' && !hidden.has(key) && map[key])
    .map((key, index) => ({ key, type: key, index: String(index + 1).padStart(2, '0'), ...map[key] }))
})
const reportPages = computed(() => [
  { id: 'cover', type: 'cover' },
  ...orderedModules.value.map((module) => ({ id: module.key, type: 'module', module })),
  { id: 'footer', type: 'footer' },
])
const currentPage = computed(() => reportPages.value[currentPageIndex.value] || reportPages.value[0] || { id: 'cover', type: 'cover' })
const pageTransitionName = computed(() => pageDirection.value === 'prev' ? 'book-page-prev' : 'book-page-next')
const pageTurnClass = computed(() => currentPageIndex.value === 0 ? 'is-first-page' : currentPageIndex.value === reportPages.value.length - 1 ? 'is-last-page' : '')
const reportThemeStyle = computed(() => {
  const theme = selectedTemplate.value?.theme || {}
  return {
    '--h5-primary': theme.primary,
    '--h5-secondary': theme.secondary,
    '--h5-accent': theme.accent,
    '--h5-bg': theme.background,
    '--h5-surface': theme.surface,
    '--h5-text': theme.text,
    fontFamily: selectedTemplate.value?.fontFamily || 'Microsoft YaHei',
  }
})

async function loadH5RuntimeConfig() {
  try {
    const response = await apiClient.get('/h5-report/runtime-config', { params: { difficulty: project.difficulty || 'starter', strategy: selectedH5StrategyId.value } })
    h5RuntimeConfig.edition = response.data?.edition || null
    h5RuntimeConfig.strategies = Array.isArray(response.data?.strategies) ? response.data.strategies : []
    h5RuntimeConfig.strategy = response.data?.strategy || null
    h5RuntimeConfig.defaultStrategyId = response.data?.defaultStrategyId || 'h5-standard'
    h5RuntimeConfig.templates = Array.isArray(response.data?.templates) ? response.data.templates : []
    h5RuntimeConfig.defaultTemplateId = response.data?.defaultTemplateId || ''
    h5RuntimeConfig.reportModel = response.data?.reportModel || null
  } catch {
    h5RuntimeConfig.edition = null
    h5RuntimeConfig.strategies = []
    h5RuntimeConfig.strategy = null
    h5RuntimeConfig.templates = []
    h5RuntimeConfig.defaultTemplateId = ''
  } finally {
    h5RuntimeConfig.loaded = true
    // 风格卡刚填进来或换了一批，箭头该露的露、该收的收
    await nextTick()
    syncArStripNav()
  }
}

async function switchH5Strategy(strategyId) {
  if (!strategyId || strategyId === selectedH5StrategyId.value) return
  selectedH5StrategyId.value = strategyId
  h5RuntimeConfig.loaded = false
  await loadH5RuntimeConfig()
  const nextTemplateId = h5RuntimeConfig.defaultTemplateId || h5RuntimeConfig.templates[0]?.id || ''
  if (nextTemplateId) selectedTemplateId.value = nextTemplateId
  reportReady.value = false
  reportSaved.value = false
}

/* 顶栏在窄屏/矮屏会自己长高（步骤条折行），三栏网格的高度必须跟着它变，
   否则网格按老高度算出来的底部会比屏幕还低一截，右栏「生成 H5 报告」跑到可视区外面。
   这里把顶栏真实高度写进 CSS 变量 --adv-header-h，网格用 calc(100% - 它) 算高度。
   顺带量一个数，给「智能体人物站在提示词框上方边缘」用：
     --ar-prompt-top-gap = 屏幕底 → 提示词框顶边 的距离
   人物是 <main> 末尾的 fixed 浮层（不在右栏里），所以只能按屏幕量。
   ⚠ 变量必须写在 .advanced-report-page（= <main>）上，不能写在 .ar-right 上：
     自定义属性只往下继承，浮层和右栏是兄弟关系，写在右栏上浮层根本读不到，
     会一直用 fallback 值、位置永远不动（踩过这个坑）。
   为什么不写死像素：这中间要经过「按钮条高度 + 几处间隙 + 栏底内边距」，
   按钮条在窄栏会折成两行，高度不是常数；直接量最终位置永远不会错位。
   ⚠ 别把量到的框高写回 --ar-prompt-box-h：那个变量是框高本身（clamp），回写等于把
     弹性高度锁成第一次量的固定像素，之后窗口变高框子也不会再长。
   不能只量一次：拖窗口、折叠侧栏、字号变化、页面滚动都会改变这个距离，所以
   ResizeObserver + scroll/resize 一起盯着。 */
const pageRootEl = ref(null)
const workbenchEl = ref(null)
let headerObserver = null
function syncAdvancedHeaderHeight() {
  const root = pageRootEl.value
  const workbench = workbenchEl.value
  if (!root || !workbench) return
  const header = workbench.querySelector('.advanced-report-header')
  /* ⚠ 这个变量必须写在 workbench 自己身上，不能只写在 <main> 上：
     CSS 里 .advanced-report-workbench 自己声明了 --adv-header-h: 58px 兜底，
     元素自身的声明永远压过祖先继承来的值 —— 只写 <main> 的话，网格读到的
     一直是那个写死的 58，顶栏在矮屏折行变高时对不上，底部就会多出十来像素的空隙。 */
  if (header) workbench.style.setProperty('--adv-header-h', `${Math.ceil(header.getBoundingClientRect().height)}px`)
  /* 人物是 fixed 浮层，量位置只能按「视口」算，所以基准取右栏面板本身
     （它是个 overflow:hidden 的普通盒子，位置就是相对视口的）。
     ⚠ 不能拿 <main>/页面根节点当基准：那是滚动容器，getBoundingClientRect().top
     会随整页滚动一起变（实测 main 顶在 -31、整页滚了 47px），量出来的距离跟着漂，
     人物会横穿到提示词框里去。
     ⚠ 基准取「栏底 - 栏的底边框」：fixed/absolute 的 bottom 是从祖先 padding box
     的内沿往上量的，内沿正好等于栏底减掉边框。 */
  const rightCol = workbench.querySelector('.ar-right')
  if (!rightCol) return
  const promptBox = rightCol.querySelector('.ar-prompt')
  if (!promptBox) return
  /* ⚠ 必须用「视口底」当基准，不能用「栏底」：人物是 position:fixed，
     CSS 里的 bottom 是从视口底往上量的。栏底只有在栏正好贴屏幕底时才等于视口底
     （1440×900 恰好如此，所以一度看着是对的），换个窗口高度就整体错位 130px。
     这里算的是「视口底 → 提示词框顶边」，和 CSS 的 bottom 一一对应。 */
  const gap = window.innerHeight - promptBox.getBoundingClientRect().top
  if (gap > 0 && gap < window.innerHeight) root.style.setProperty('--ar-prompt-top-gap', `${Math.round(gap)}px`)
}
const onViewportChange = () => syncAdvancedHeaderHeight()
/* 页面刚挂载时右栏可能还没渲染完（风格配置、项目数据都是异步塞进来的），
   这时候量出来是 0 或者旧值。补一个短轮询：量到的数和上一次不同就再落一次，
   稳定了就停（最多盯 20 次 ≈ 6 秒），避免人物停在错的位置上。 */
let syncTimer = null
let syncTries = 0
function keepSyncStable() {
  clearTimeout(syncTimer)
  syncTries = 0
  const tick = () => {
    const before = pageRootEl.value?.style.getPropertyValue('--ar-prompt-top-gap')
    syncAdvancedHeaderHeight()
    const after = pageRootEl.value?.style.getPropertyValue('--ar-prompt-top-gap')
    const settled = Boolean(after) && after === before
    syncTries += 1
    if (!settled && syncTries < 20) syncTimer = setTimeout(tick, 300)
  }
  tick()
}
onMounted(() => {
  if (typeof ResizeObserver === 'undefined') { nextTick(keepSyncStable); return }
  nextTick(() => {
    syncAdvancedHeaderHeight()
    keepSyncStable()
    if (!workbenchEl.value) return
    headerObserver = new ResizeObserver(() => syncAdvancedHeaderHeight())
    const header = workbenchEl.value.querySelector('.advanced-report-header')
    if (header) headerObserver.observe(header)
    // 提示词框高度/位置一变人物就要跟着走
    const promptBox = workbenchEl.value.querySelector('.ar-right .ar-prompt')
    if (promptBox) headerObserver.observe(promptBox)
    // 右栏整体容器也盯上：内容是从上面一行行长出来的，框的位置会连带变
    const rightCol = workbenchEl.value.querySelector('.ar-right')
    if (rightCol) headerObserver.observe(rightCol)
    // 页面能滚（小屏）时人物是 fixed 的，不跟就会掉队，滚动时补一次
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, { passive: true, capture: true })
  })
})
onBeforeUnmount(() => {
  clearTimeout(syncTimer)
  headerObserver?.disconnect()
  headerObserver = null
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, { capture: true })
})

onMounted(async () => {
  void courseStore.load()
  const sourceProject = resolveReportSourceProject()
  const queryDifficulty = ['junior', 'starter', 'advanced', 'pro'].includes(String(route.query.difficulty || ''))
    ? String(route.query.difficulty)
    : ''
  const effectiveDifficulty = queryDifficulty || sourceProject?.difficulty || difficultyStore.current || 'starter'
  Object.assign(project, sourceProject ? { ...createEmptyProject(effectiveDifficulty), ...sourceProject, difficulty: effectiveDifficulty } : createEmptyProject(effectiveDifficulty))
  juniorSpeechSupported.value = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  reportTitle.value = `${project.title || '我的项目'} H5 创作报告`
  await loadH5RuntimeConfig()
  if (route.query.templateTest === '1') {
    try {
      const testTemplate = JSON.parse(sessionStorage.getItem('h5-report-template-test') || 'null')
      if (testTemplate?.id || testTemplate?.name) {
        testTemplate.id = testTemplate.id || 'h5-admin-test-template'
        h5RuntimeConfig.templates = [testTemplate, ...h5RuntimeConfig.templates.filter((item) => item.id !== testTemplate.id)]
        h5RuntimeConfig.defaultTemplateId = testTemplate.id
      }
    } catch {}
  }
  selectedH5StrategyId.value = h5RuntimeConfig.defaultStrategyId || 'h5-standard'
  if (selectedH5StrategyId.value !== h5RuntimeConfig.strategy?.id) await loadH5RuntimeConfig()
  selectedTemplateId.value = isJunior.value
    ? (route.query.templateTest === '1' ? h5RuntimeConfig.defaultTemplateId : resolveStarterTemplateId())
    : (project.h5TemplateId && visibleTemplates.value.some((template) => template.id === project.h5TemplateId)
      ? project.h5TemplateId
      : (h5RuntimeConfig.defaultTemplateId || recommendedTemplate.value?.id || visibleTemplates.value[0]?.id || ''))
  starterStyleMode.value = juniorStudentCanChoose.value
    && Boolean(project.h5TemplateId)
    && juniorAvailableTemplates.value.some((template) => template.id === project.h5TemplateId)
    ? 'manual'
    : 'auto'
  applyLocalH5Report(buildLocalH5Report(project.prompt || project.ideaPrompt || '创意美术主题'), 'draft')
  if (isJunior.value) reportData.idea = project.idea || project.reportIdea || ''
  // 高级版是用户自己写叙事的页：项目里没有真实叙事时不能把模板兜底文案填进去，
  // 否则用户会以为系统已经替自己写好了（旧版就是这段文案被当成「用户原话」发出）。
  if (isAdvanced.value) reportData.idea = project.idea || project.reportIdea || ''
  reportReady.value = false
  if (route.query.reportId) {
    try {
      const { data } = await apiClient.get('/h5-reports')
      // 不能再用 layoutSnapshot 当筛选条件：工作流出图的报告（canvas-workflow）
      // 只有 pageImages、没有旧排版快照，一卡就会掉进「什么都不发生」，用户点查看预览没反应。
      const saved = data.reports.find(report => report.id === route.query.reportId)
      if (saved && Array.isArray(saved.pageImages) && saved.pageImages.length) {
        // 这份报告已经有工作流结果图（pageImages）时，直接用独立预览页打开。
        // 旧做法是弹「自动排版预览」弹窗 —— 那个弹窗里是模板排版的假页，没有手机外壳，
        // 用户点「查看预览」看到的不是自己的工作流结果图。
        sessionStorage.setItem('advanced-h5-preview-draft', JSON.stringify({
          projectId: saved.projectId || '',
          reportTitle: saved.title || '',
          idea: '',
          templateId: saved.h5TemplateId || '',
          availableTemplateIds: [],
          currentPageIndex: 0,
          pageImages: saved.pageImages.map((item, index) => ({
            id: item.id,
            label: item.label || `结果图 ${index + 1}`,
            url: `/api/h5-report-assets/${encodeURIComponent(saved.id)}/${encodeURIComponent(item.id)}`,
          })),
        }))
        await router.replace({ path: '/student/h5-report/preview', query: { reportId: saved.id } })
        return
      }
      if (saved && saved.layoutSnapshot) {
        h5LayoutResult.value = { layout: saved.layoutSnapshot, templateSnapshot: saved.templateSnapshot, pages: saved.pages, templateId: saved.h5TemplateId, generationToken: saved.generationToken }
        h5SavedStatus.value = saved.status; reportTitle.value = saved.title; reportReady.value = true; reportSaved.value = true; savedReportId.value = saved.id; publishedShareUrl.value = saved.shareToken ? `/h5-report/public/${saved.shareToken}` : ''; showH5LayoutPreview.value = true
      }
    } catch { ElMessage.error('已保存报告暂时无法读取，请刷新重试') }
  }
  window.addEventListener('keydown', handleKeydown)
  if (isAdvanced.value && route.query.action === 'generate') {
    await router.replace({ path: '/student/h5-report' })
    await generateReport()
    if (reportReady.value && selectedH5Strategy.value?.type === 'canvas-workflow' && canvasWorkflowPageImages.value.length) openAdvancedPreview()
    else if (reportReady.value && h5LayoutResult.value) showH5LayoutPreview.value = true
    else if (reportReady.value) await saveReport({ submit: true })
  }
})

watch(selectedTemplate, () => {
  h5LayoutResult.value = null
  currentPageIndex.value = 0
  pageDirection.value = 'next'
  if (reportReady.value) reportSaved.value = false
})

watch(reportTitle, () => {
  if (reportReady.value) reportSaved.value = false
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  if (arDraftTimer) { clearInterval(arDraftTimer); arDraftTimer = 0 }
  if (juniorRecognition) {
    juniorRecognition.onend = null
    juniorRecognition.stop()
    juniorRecognition = null
  }
})

watch(juniorPromptCards, syncJuniorNarration, { deep: true })
watch(juniorVoiceTranscript, syncJuniorNarration)

function extractUrl(background = '') {
  const match = String(background).match(/url\(["']?([^"')]+)["']?\)/)
  return match?.[1] || ''
}
function materialSource(item = null) {
  if (!item) return ''
  // 历史数据里素材可能是纯字符串（或 CSS background），先兜住这两种写法。
  if (typeof item === 'string') return extractUrl(item) || (/^(data:|blob:|https?:\/\/|\/)/.test(item) ? item : '')
  return item.preview || item.cover || item.thumbnail || item.imageUrl || item.previewUrl || item.url || item.src || extractUrl(item.background) || ''
}
function formatJuniorDuration(value) {
  if (!value) return '00:00'
  if (typeof value === 'string' && value.includes(':')) return value
  const seconds = Math.max(0, Math.round(Number(value) || 0))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
function cleanJuniorSentence(value = '') {
  return String(value).trim().replace(/[。！？!?，,]+$/g, '')
}
function syncJuniorNarration() {
  const parts = []
  const voice = cleanJuniorSentence(juniorVoiceTranscript.value)
  const what = cleanJuniorSentence(juniorPromptCards.what)
  const why = cleanJuniorSentence(juniorPromptCards.why)
  const favorite = cleanJuniorSentence(juniorPromptCards.favorite)
  if (voice) parts.push(voice)
  if (what) parts.push(`我画了${what}`)
  if (why) parts.push(`我这样画，是因为${why}`)
  if (favorite) parts.push(`我最喜欢${favorite}`)
  if (parts.length) reportData.idea = `${parts.join('。')}。`.slice(0, 300)
}
function handleJuniorMaterial(type) {
  const source = type === 'model' ? juniorModelSource.value : juniorVideoSource.value
  if (source) {
    juniorActiveMaterial.value = type
    return
  }
  router.push(type === 'model' ? '/student/model3d' : '/student/video')
}
function toggleJuniorVoice() {
  if (juniorListening.value && juniorRecognition) {
    juniorRecognition.stop()
    return
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) {
    ElMessage.info('当前设备暂不支持语音转写，可以填写上面的三张提示卡片。')
    return
  }
  juniorRecognition = new SpeechRecognition()
  juniorRecognition.lang = 'zh-CN'
  juniorRecognition.continuous = false
  juniorRecognition.interimResults = false
  juniorRecognition.onstart = () => { juniorListening.value = true }
  juniorRecognition.onresult = (event) => {
    const transcript = Array.from(event.results || []).map((result) => result[0]?.transcript || '').join('')
    if (transcript.trim()) juniorVoiceTranscript.value = `${juniorVoiceTranscript.value}${juniorVoiceTranscript.value ? '。' : ''}${transcript.trim()}`
  }
  juniorRecognition.onerror = (event) => {
    if (event.error === 'not-allowed') ElMessage.warning('请允许使用麦克风，或者填写上面的提示卡片。')
    else if (event.error !== 'no-speech') ElMessage.info('这次没有听清楚，可以再说一次。')
  }
  juniorRecognition.onend = () => {
    juniorListening.value = false
    juniorRecognition = null
  }
  juniorRecognition.start()
}
function saveDraftOnly() {
  projectStore.saveDraft({ ...project, idea: reportData.idea, h5TemplateId: selectedTemplateId.value })
  ElMessage.success('草稿已保存')
}

function resolveStarterTemplateId() {
  const studentIds = new Set(juniorAvailableTemplates.value.map((template) => template.id))
  if (juniorStudentCanChoose.value && project.h5TemplateId && studentIds.has(project.h5TemplateId)) return project.h5TemplateId
  return resolveStarterAutomaticTemplateId()
}

function resolveStarterAutomaticTemplateId() {
  const allIds = new Set(visibleTemplates.value.map((template) => template.id))
  const studentIds = new Set(juniorAvailableTemplates.value.map((template) => template.id))
  const requestedStudentChoiceHasNoTemplates = editionAllowsTemplateChoice.value
    && courseH5Settings.value.selectionMode === 'student'
    && juniorAvailableTemplates.value.length === 0
  if (requestedStudentChoiceHasNoTemplates && h5RuntimeConfig.defaultTemplateId && allIds.has(h5RuntimeConfig.defaultTemplateId)) return h5RuntimeConfig.defaultTemplateId
  const teacherDefault = courseH5Settings.value.defaultTemplateId
  if (teacherDefault && allIds.has(teacherDefault) && (!juniorStudentCanChoose.value || studentIds.has(teacherDefault))) return teacherDefault
  if (recommendedTemplate.value?.id) return recommendedTemplate.value.id
  if (h5RuntimeConfig.defaultTemplateId && allIds.has(h5RuntimeConfig.defaultTemplateId)) return h5RuntimeConfig.defaultTemplateId
  return visibleTemplates.value[0]?.id || ''
}

function openStarterStyleDrawer() {
  if (!juniorStudentCanChoose.value) {
    ElMessage.info(`当前课程由系统智能选择「${starterTemplateLabel(selectedTemplate.value)}」`)
    return
  }
  const currentIndex = Math.max(0, juniorAvailableTemplates.value.findIndex((template) => template.id === selectedTemplateId.value))
  starterStyleDraftId.value = juniorAvailableTemplates.value[currentIndex]?.id || juniorAvailableTemplates.value[0]?.id || ''
  starterCarouselIndex.value = currentIndex
  starterStyleDrawerOpen.value = true
  nextTick(() => scrollStarterStyleTo(currentIndex, 'auto'))
}

function openStarterManualStyle() {
  if (!juniorStudentCanChoose.value) {
    ElMessage.info('当前课程使用默认风格，讲师开启自主选择后就可以挑选啦')
    return
  }
  openStarterStyleDrawer()
}

function useStarterAutomaticStyle() {
  const automaticTemplateId = resolveStarterAutomaticTemplateId()
  starterStyleMode.value = 'auto'
  selectedTemplateId.value = automaticTemplateId
  project.h5TemplateId = ''
  projectStore.saveDraft({ ...project, idea: reportData.idea, h5TemplateId: '' })
  ElMessage.success(`已使用默认风格「${starterTemplateLabel(selectedTemplate.value)}」`)
}

function closeStarterStyleDrawer() {
  starterStyleDrawerOpen.value = false
  starterStyleDraftId.value = ''
  starterCarouselDragging.value = false
  starterCarouselMoved.value = false
}

function starterTemplateLabel(template) {
  if (!template) return '童趣课堂风'
  return starterTemplateVisuals[template.layout]?.label || template.name || 'H5报告风格'
}

function starterTemplateCover(template) {
  if (template?.coverImage) return template.coverImage
  return starterTemplateVisuals[template?.layout]?.cover || starterKidsClassroomCover
}

function starterCarouselCard(index) {
  return starterCarouselTrack.value?.querySelector(`[data-carousel-index="${index}"]`) || null
}

function scrollStarterStyleTo(index, behavior = 'smooth') {
  const safeIndex = Math.min(Math.max(Number(index) || 0, 0), Math.max(juniorAvailableTemplates.value.length - 1, 0))
  const card = starterCarouselCard(safeIndex)
  const track = starterCarouselTrack.value
  if (!card || !track) return
  starterCarouselIndex.value = safeIndex
  track.scrollTo({ left: card.offsetLeft - (track.clientWidth - card.clientWidth) / 2, behavior })
}

function browseStarterStyle(direction) {
  scrollStarterStyleTo(starterCarouselIndex.value + direction)
}

function selectStarterStyleDraft(templateId, index) {
  if (starterCarouselMoved.value) {
    starterCarouselMoved.value = false
    return
  }
  if (!juniorAvailableTemplates.value.some((template) => template.id === templateId)) return
  starterStyleDraftId.value = templateId
  scrollStarterStyleTo(index)
}

function confirmStarterTemplate() {
  const template = juniorAvailableTemplates.value.find((item) => item.id === starterStyleDraftId.value)
  if (!juniorStudentCanChoose.value || !template) {
    closeStarterStyleDrawer()
    return
  }
  selectedTemplateId.value = template.id
  starterStyleMode.value = 'manual'
  project.h5TemplateId = template.id
  projectStore.saveDraft({ ...project, idea: reportData.idea, h5TemplateId: template.id })
  starterStyleDrawerOpen.value = false
  starterStyleDraftId.value = ''
  ElMessage.success(`已选择「${starterTemplateLabel(template)}」`)
}

async function handleStarterGenerate() {
  if (!juniorCanGenerate.value) {
    ElMessage.info('先说一说你的作品，就可以生成H5报告啦')
    return
  }
  await generateReport()
  await saveReport({ submit: true })
}

function handleStarterCarouselScroll() {
  const track = starterCarouselTrack.value
  if (!track) return
  const center = track.scrollLeft + track.clientWidth / 2
  let closestIndex = 0
  let closestDistance = Number.POSITIVE_INFINITY
  juniorAvailableTemplates.value.forEach((_, index) => {
    const card = starterCarouselCard(index)
    if (!card) return
    const distance = Math.abs(card.offsetLeft + card.clientWidth / 2 - center)
    if (distance < closestDistance) {
      closestDistance = distance
      closestIndex = index
    }
  })
  starterCarouselIndex.value = closestIndex
}

function startStarterCarouselDrag(event) {
  if (event.pointerType === 'touch' || !starterCarouselTrack.value) return
  starterCarouselDragging.value = true
  starterCarouselMoved.value = false
  starterDragStartX.value = event.clientX
  starterDragScrollLeft.value = starterCarouselTrack.value.scrollLeft
  starterCarouselTrack.value.setPointerCapture?.(event.pointerId)
}

function moveStarterCarouselDrag(event) {
  if (!starterCarouselDragging.value || !starterCarouselTrack.value) return
  const delta = event.clientX - starterDragStartX.value
  if (Math.abs(delta) > 5) starterCarouselMoved.value = true
  starterCarouselTrack.value.scrollLeft = starterDragScrollLeft.value - delta
}

function endStarterCarouselDrag(event) {
  if (!starterCarouselDragging.value) return
  starterCarouselDragging.value = false
  starterCarouselTrack.value?.releasePointerCapture?.(event.pointerId)
  scrollStarterStyleTo(starterCarouselIndex.value)
}

function openStarterPreview() {
  if (!juniorCanGenerate.value) {
    ElMessage.info('先说一说你的作品，就可以提前看看报告啦')
    return
  }
  starterPreviewIndex.value = 0
  starterStyleDrawerOpen.value = false
  starterPreviewOpen.value = true
}

function closeStarterPreview() {
  starterPreviewOpen.value = false
}

function starterPreviewPrevious() {
  starterPreviewIndex.value = Math.max(0, starterPreviewIndex.value - 1)
}

function starterPreviewNext() {
  starterPreviewIndex.value = Math.min(starterPreviewPages.value.length - 1, starterPreviewIndex.value + 1)
}

function starterPreviewTouchStart(event) {
  starterPreviewTouchX.value = event.changedTouches?.[0]?.clientX || 0
}

function starterPreviewTouchEnd(event) {
  const distance = (event.changedTouches?.[0]?.clientX || 0) - starterPreviewTouchX.value
  if (Math.abs(distance) < 45) return
  if (distance < 0) starterPreviewNext()
  else starterPreviewPrevious()
}

async function confirmStarterReport() {
  await generateReport()
  await saveReport({ submit: true })
}

function advancedTemplateLabel(template) {
  if (!template) return 'AI科技风'
  return ({
    'kids-classroom': '童趣课堂',
    'growth-file': '成长档案',
    'art-gallery': '小小艺术展',
    'ai-tech': 'AI科技',
    'product-design-story': '我的产品设计故事',
  }[template.layout] || template.name || 'H5报告风格')
}

function selectAdvancedTemplate(template) {
  if (!template) return
  if (!advancedCanChoose.value && selectedTemplateId.value !== template.id) {
    ElMessage.info('当前高级版由平台使用推荐风格，管理员开启自主选择后可切换。')
    return
  }
  selectedTemplateId.value = template.id
  project.h5TemplateId = template.id
  projectStore.saveDraft({ ...project, idea: reportData.idea, reportIdea: reportData.idea, h5TemplateId: template.id })
  ElMessage.success(`已选择「${advancedTemplateLabel(template)}」`)
}

function storyAssignedSource(slot) {
  const item = project.h5LayoutDraft?.assignments?.[slot]
  return materialSource(item)
}

function saveStoryLayoutDraft(layoutDraft) {
  project.h5LayoutDraft = layoutDraft
  projectStore.saveDraft({ ...project, idea: reportData.idea, h5TemplateId: selectedTemplateId.value, h5LayoutDraft: layoutDraft })
}

function useStoryAutoFill() {
  saveStoryLayoutDraft({ templateId: selectedTemplateId.value, fillMode: 'auto', assignments: {} })
  ElMessage.success('已恢复为智能自动匹配项目素材')
}

function useStoryManualFill() {
  const current = project.h5LayoutDraft || {}
  saveStoryLayoutDraft({
    templateId: selectedTemplateId.value,
    fillMode: 'manual',
    assignments: { ...(current.assignments || {}) },
  })
  ElMessage.info('请选择一个图框，再点击下方真实项目素材完成替换')
}

function assignStoryAsset(asset) {
  if (!asset?.src) return
  const current = project.h5LayoutDraft || {}
  const assignments = { ...(current.assignments || {}), [storyFillSlot.value]: { src: asset.src, label: asset.label } }
  saveStoryLayoutDraft({ templateId: selectedTemplateId.value, fillMode: 'manual', assignments })
  ElMessage.success(`已使用「${asset.label}」替换${storyFillSlotLabel.value}`)
}

function openAdvancedPreview() {
  // 画布工作流已经出了结果图时，预览一律走独立预览页（手机框里就是结果图），
  // 不再被「自动排版预览」弹窗截住 —— 那个弹窗里显示的是模板排版，不是工作流结果。
  const hasWorkflowImages = selectedH5Strategy.value?.type === 'canvas-workflow' && canvasWorkflowPageImages.value.length > 0
  if (!hasWorkflowImages && h5LayoutResult.value) { showH5LayoutPreview.value = true; return }
  project.h5TemplateId = selectedTemplateId.value
  projectStore.saveDraft({ ...project, idea: reportData.idea, reportIdea: reportData.idea, h5TemplateId: selectedTemplateId.value })
  sessionStorage.setItem('advanced-h5-preview-draft', JSON.stringify({
    projectId: project.id || '',
    reportTitle: reportTitle.value,
    idea: reportData.idea,
    templateId: selectedTemplateId.value,
    availableTemplateIds: advancedAvailableTemplates.value.map((template) => template.id),
    currentPageIndex: 0,
    // 工作流已经出过图就带上，预览页才能翻成品图而不是硬拼的 6 页。
    pageImages: selectedH5Strategy.value?.type === 'canvas-workflow' ? canvasWorkflowPageImages.value : [],
  }))
  router.push('/student/h5-report/preview')
}

async function handleAdvancedGenerate() {
  await generateReport()
  if (!reportReady.value) return
  // 画布工作流模式：结果图才是要给用户看的东西，直接进独立预览页。
  if (selectedH5Strategy.value?.type === 'canvas-workflow' && canvasWorkflowPageImages.value.length) {
    openAdvancedPreview()
    return
  }
  if (h5LayoutResult.value) { showH5LayoutPreview.value = true; return }
  if (isProductDesignStory(selectedTemplate.value)) {
    try {
      await generateProductStoryPageImages()
    } catch (error) {
      ElMessage.error(error.message || '报告图生成失败，请检查后重试')
      return
    }
  }
  if (reportReady.value) await saveReport({ submit: true })
}

function setProductStoryPageRef(element, index) {
  if (!element) return
  productStoryPageRefs.value[index] = element.$el || element
}

function productStoryBackgroundPrompt(page) {
  const subject = String(page.title || '用户产品设计故事').slice(0, 28)
  const styleByStep = {
    cover: '蓝图纸张、产品局部拼贴、青蓝光效，留出中央作品区域',
    inspiration: '灵感观察板、图钉、便签和连线，清爽蓝白设计纸张',
    problem: '问题卡、使用场景线稿和清晰信息层级，工业设计蓝图',
    sketch: '工程蓝图网格、铅笔线条、尺寸标记和橙色手写圈注',
    ai: '三方案比较连线、科技卡片和青蓝渐变，不要文字',
    model: '3D建模网格、坐标轴、旋转轨迹和材质球，不要文字',
    scene: '柔和环境延伸、产品展示空间和光线层次，不要人物',
    reflection: '创作时间线、纸张拼贴和收获感，蓝白与暖橙',
  }
  return `竖版 9:16 H5 用户产品设计报告背景，主题：${subject}。${styleByStep[page.storyStep] || '蓝白工业设计背景'}。仅制作无文字背景，不要任何中文、英文字母、数字、logo、水印或固定商品；不要出现完整产品主体，必须保留大面积干净留白，便于在网页中叠加用户真实作品图片与中文文案。`
}

function backgroundResultUrl(result) {
  return result?.imageUrl || result?.url || result?.src || extractUrl(result?.background || '')
}

async function runWithConcurrency(items, worker, concurrency = 2) {
  const results = []
  let cursor = 0
  async function run() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run))
  return results
}

function withGenerationTimeLimit(task, timeoutMs = 3500) {
  return Promise.race([
    task,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error('背景生成等待超时，已使用模板背景。')), timeoutMs)
    }),
  ])
}

async function generateProductStoryPageImages() {
  const pages = advancedStoryPages.value
  if (!pages.length) return
  productStoryImageGenerating.value = true
  productStoryPageImages.value = []
  productStoryReportId.value = productStoryReportId.value || `h5_story_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  try {
    productStoryImageProgress.value = '正在生成8页背景…'
    await runWithConcurrency(pages, async (page) => {
      try {
        const output = await withGenerationTimeLimit(generateArtwork({
          projectId: project.id,
          prompt: productStoryBackgroundPrompt(page),
          difficulty: 'pro',
          style: 'product-story-background',
          ratio: '9:16',
          count: 1,
          quality: 'standard',
          images: [],
        }))
        const url = backgroundResultUrl(output?.results?.[0])
        if (url) productStoryBackgrounds[page.id] = url
      } catch {
        // 背景生成失败时，页面组件自身的蓝图背景就是安全兜底。
      }
    }, 2)
    await nextTick()
    productStoryImageProgress.value = '正在合成报告页…'
    const images = []
    for (let index = 0; index < pages.length; index += 1) {
      const element = productStoryPageRefs.value[index]
      if (!element) throw new Error(`第 ${index + 1} 页画布未准备完成`)
      const canvas = await html2canvas(element, { scale: 1080 / 390, useCORS: true, backgroundColor: '#edf5ff', logging: false })
      const imageData = canvas.toDataURL('image/webp', .9)
      productStoryImageProgress.value = `正在保存第 ${index + 1}/${pages.length} 页…`
      const response = await apiClient.post(`/h5-reports/${encodeURIComponent(productStoryReportId.value)}/pages`, {
        pageId: pages[index].id,
        label: pages[index].label || `第 ${index + 1} 页`,
        imageData,
      })
      images.push({ id: pages[index].id, label: pages[index].label || `第 ${index + 1} 页`, url: response.data.assetUrl || response.data.url || '' })
    }
    productStoryPageImages.value = images.filter((item) => item.url)
    if (productStoryPageImages.value.length !== pages.length) throw new Error('部分报告图没有保存成功')
    ElMessage.success('8页产品设计故事报告图已生成并保存')
  } catch (error) {
    productStoryPageImages.value = []
    throw new Error(`报告图生成失败：${error?.response?.data?.message || error.message || '请检查服务端后重试'}`)
  } finally {
    productStoryImageGenerating.value = false
    productStoryImageProgress.value = ''
  }
}

// 每张卡就是一个已发布的报告工作流，点了就按它去出图（换 strategy 会重新拉一次 runtime-config）
async function selectArStyle(card) {
  if (!card || arSelectedStyleId.value === card.id) return
  await switchH5Strategy(card.strategyId)
}

function arNarrationFrom(payload = {}) {
  const pages = Array.isArray(payload.pages) ? payload.pages : []
  const ideaPage = pages.find((page) => String(page.type || page.id || '').toLowerCase().includes('idea'))
  const candidates = [ideaPage?.body, ideaPage?.content, payload.narration, payload.reportDocument, pages[0]?.body]
  return candidates.map((item) => String(item || '').trim()).find((item) => item.length > 20) || ''
}

async function draftNarrationWithAi() {
  if (arDrafting.value || generating.value) return
  const current = String(reportData.idea || '').trim()
  if (current) {
    try {
      await ElMessageBox.confirm('整理会用 AI 的内容替换你现在写的字。原来的字会留着，之后可以点「恢复我原来写的」找回。继续吗？', '整理创作构思', { confirmButtonText: '继续整理', cancelButtonText: '保留我写的', type: 'warning' })
    } catch {
      return
    }
  }
  arDrafting.value = true
  arDraftSeconds.value = 0
  clearInterval(arDraftTimer)
  arDraftTimer = window.setInterval(() => { arDraftSeconds.value += 1 }, 1000)
  arNarrationBackup.value = current
  try {
    project.idea = reportData.idea
    project.reportIdea = reportData.idea
    const response = await apiClient.post('/report/generate', {
      project: h5ProjectPayload(),
      config: {
        difficulty: project.difficulty,
        strategyId: selectedH5Strategy.value?.id || 'h5-standard',
        strategyVersion: Number(selectedH5Strategy.value?.workflowVersion || 1),
        template: selectedTemplate.value?.id,
        h5Layout: selectedTemplate.value?.layout,
        agentId: h5RuntimeConfig.edition?.agentId || '',
        contentProfile: h5RuntimeConfig.edition?.contentProfile || '',
        materials: {
          sketches: true,
          versions: true,
          finalImage: true,
          courseAnswers: true,
          referenceImages: true,
        },
      },
      form: { title: reportTitle.value || '我的创作报告' },
      // 只写一段叙事：不走整份报告页结构，几十秒内出结果
      mode: 'h5-narration',
      flowKey: 'report.h5FirstPerson',
      agentId: h5RuntimeConfig.edition?.agentId || '',
      maxTokens: 700,
      selectedStyle: selectedTemplate.value,
      instruction: '只输出一段 3～6 句、120～260 字的创作叙事，不要输出报告页结构。',
    })
    const draft = String(response.data?.narration || '').trim() || arNarrationFrom(response.data)
    if (!draft) throw new Error('AI 这次没有写出可用的内容，稍后再点一次')
    reportData.idea = draft.slice(0, 800)
    project.idea = reportData.idea
    projectStore.saveDraft({ ...project, idea: reportData.idea, reportIdea: reportData.idea })
    ElMessage.success(`整理好了，用了 ${arDraftSeconds.value} 秒。按你自己的话改一遍再生成报告`)
  } catch (error) {
    ElMessage.error(`整理失败：${error?.response?.data?.message || error.message || '接口暂时不可用'}`)
  } finally {
    clearInterval(arDraftTimer)
    arDraftTimer = 0
    arDrafting.value = false
  }
}

function restoreArNarration() {
  if (arNarrationBackup.value === '') return
  reportData.idea = arNarrationBackup.value
  project.idea = reportData.idea
  project.reportIdea = reportData.idea
  projectStore.saveDraft({ ...project, idea: reportData.idea, reportIdea: reportData.idea })
  ElMessage.success('已经换回你原来写的内容')
}

function artworkStyle(src) {
  if (!src) return { background: 'linear-gradient(135deg, var(--h5-accent), var(--h5-secondary))' }
  if (String(src).startsWith('linear-gradient')) return { background: src }
  return { backgroundImage: `url("${src}")` }
}
function templateSwatchStyle(template) {
  const theme = template.theme || {}
  return { background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }
}
function layoutLabel(value) {
  return h5ReportLayouts.find((item) => item.value === value)?.label || value
}
// 报告页的小智能体：用户说想怎么讲这次项目，它整理成报告想法并直接开始生成。
const agentReportSamples = [
  '帮我把这次的作品做成报告',
  '我想做一份这学期的成长记录',
  '报告里想写我怎么做这只恐龙的',
]
/**
 * 交给智能体的「当前场景」：报告叫什么、已经写了什么想法。
 * 用户说「加一段我调色的过程」时，老师得知道这份报告原本要讲什么。
 */
const agentCanvasContext = computed(() => ({
  theme: String(reportTitle.value || '').trim(),
  prompt: String(reportData.idea || '').trim(),
}))
async function handleAgentExecute(payload = {}) {
  const idea = String(payload.prompt || '').trim()
  if (!idea) return
  reportData.idea = idea
  // 报告必须先有名字，不然会在 generateReport 里被「请先填写报告名称」拦下来
  if (!reportTitle.value.trim()) reportTitle.value = idea.slice(0, 16)
  await nextTick()
  await generateReport()
}

async function generateReport() {
  if (generating.value) return
  // 高级版的报告风格完全由后台「报告工作流库」决定：老师发布一张，左栏多一张卡。
  // 一张都没有的时候不能说「那你走吧」，而是要说清楚为什么，否则用户会以为是自己没选对。
  if (isAdvanced.value && !arStyleCards.value.length) {
    ElMessage.warning('讲师还没有发布报告风格，发布了就能生成啦。')
    return
  }
  const studentNarration = String(reportData.idea || '').trim()
  if (!h5StrategyExecutionReady.value) {
    ElMessage.info('方案 2 仍在配置和评估中，工作流执行器接入后才能生成正式报告。')
    return
  }
  if (!reportTitle.value.trim()) {
    ElMessage.warning('请先填写报告名称')
    return
  }
  if (selectedTemplate.value?.designDocument && !project.finalVersionId && project.versions?.length) {
    try { await ElMessageBox.confirm('将当前预览中的作品作为最终作品生成报告？确认后会保存这次选择。', '确认最终作品', { confirmButtonText: '确认这张作品', cancelButtonText: '返回选择' }); project.finalVersionId = project.versions[0].id } catch { return }
  }
  generating.value = true
  reportReady.value = false
  if (selectedTemplate.value?.designDocument && SERVER_AUTH_MODE) {
    try { projectStore.saveDraft({ ...project, finalArtworkUrl: finalArtwork.value }); await projectStore.flushServerWrites(true) } catch { generating.value = false; ElMessage.error('项目资料保存失败，请先保存创作记录后再生成报告'); return }
  }
  h5LayoutResult.value = null
  h5SavedStatus.value = ''
  reportSaved.value = false
  savedReportId.value = ''
  if (!SERVER_AUTH_MODE) localStorage.removeItem('art-studio-current-report-id')
  reportData.warnings = []
  canvasWorkflowImages.value = []
  canvasWorkflowMaterialImages.value = []
  canvasWorkflowPageImages.value = []
  canvasWorkflowReportId.value = ''
  canvasWorkflowMetadata.value = { adapterKey: '', workflowVersion: 0, nodeResults: [], warnings: [] }
  canvasWorkflowStatus.value = ''
  const promptText = String(arPromptText.value || '').trim() || project.prompt || project.ideaPrompt || '创意美术主题'
  if (studentNarration) {
    project.idea = studentNarration
    project.reportIdea = studentNarration
  }
  applyLocalH5Report(buildLocalH5Report(promptText), 'local')
  if (studentNarration) reportData.idea = studentNarration
  if (selectedTemplate.value?.designDocument) {
    reportData.pages = recordedH5Pages({ ...project, finalArtworkUrl: finalArtwork.value })
    reportData.aiReview = ''; reportData.summary = reportData.pages[0]?.body || ''
  }
  const contentKey = JSON.stringify({ ...h5ProjectPayload(), h5TemplateId: undefined, h5LayoutDraft: undefined, _serverVersion: undefined })
  const cachedContent = selectedTemplate.value?.designDocument && organizedContentCache.get(contentKey)
  if (cachedContent) Object.assign(reportData, JSON.parse(cachedContent))
  if (smartOrganizeEnabled.value && !cachedContent) {
    try {
      const response = await apiClient.post('/report/generate', {
        project: h5ProjectPayload(),
        config: {
          difficulty: project.difficulty,
          strategyId: selectedH5Strategy.value?.id || 'h5-standard',
          strategyVersion: Number(selectedH5Strategy.value?.workflowVersion || 1),
          template: selectedTemplate.value?.id,
          h5Layout: selectedTemplate.value?.layout,
          agentId: h5RuntimeConfig.edition?.agentId || '',
          contentProfile: h5RuntimeConfig.edition?.contentProfile || '',
          materials: {
            sketches: true,
            versions: true,
            finalImage: true,
            courseAnswers: true,
            referenceImages: true,
          },
        },
        form: {
          title: reportTitle.value,
        },
        mode: 'h5-first-person-report',
        flowKey: 'report.h5FirstPerson',
        agentId: h5RuntimeConfig.edition?.agentId || '',
        selectedStyle: selectedTemplate.value,
        instruction: h5ReportInstruction(),
      })
      applyAgentH5Report(response.data, promptText)
      if (selectedTemplate.value?.designDocument) organizedContentCache.set(contentKey, JSON.stringify(reportData))
    } catch (error) {
      reportData.warnings = [selectedTemplate.value?.designDocument ? `AI内容整理未完成，本次仅使用已保存的原始记录：${error?.response?.data?.message || error.message || '接口失败'}` : `AI智能整理暂不可用，已使用本地第一人称报告兜底：${error?.response?.data?.message || error.message || '接口失败'}`]
    }
  }
  if (selectedTemplate.value?.designDocument) {
    const request = { templateId: selectedTemplate.value.id, difficulty: project.difficulty, projectId: project.id, projectDocumentId: projectStore.draft?._serverDocumentId || project._serverDocumentId, ...(SERVER_AUTH_MODE ? {} : { project: { ...project, finalArtworkUrl: finalArtwork.value } }), pages: reportData.pages }
    try {
      const { data } = await apiClient.post('/h5-report/layout', request, { timeout: 65000 })
      h5LayoutResult.value = data
      if (data.materialCoverage?.canvasHistory === false) reportData.warnings.push('已接入本项目保存的想法、草图和作品；完整无限画布节点时间线尚未接入。')
    } catch (error) {
      if ([400, 401, 403, 404, 409, 413].includes(error.response?.status)) { reportReady.value = false; generating.value = false; ElMessage.error(error.response.data?.message || '请检查项目资料和模板授权后重试'); return }
      try {
        await ElMessageBox.confirm(`${error.response?.data?.message || 'AI 排版暂时失败'}。可以保留已整理文案，使用基础版式继续预览。`, '排版未完成', { confirmButtonText: '使用基础版式', cancelButtonText: '稍后重试', type: 'warning' })
        const { data } = await apiClient.post('/h5-report/layout', { ...request, useBasic: true })
        h5LayoutResult.value = data
        reportData.warnings.push('本次使用基础版式，AI 自动排版未完成')
      } catch (fallbackError) {
        reportReady.value = false; generating.value = false
        if (fallbackError?.response) ElMessage.error(fallbackError.response.data?.message || '基础排版失败，资料已保留')
        return
      }
    }
  }
  if (selectedH5Strategy.value?.type === 'canvas-workflow') {
    try {
      await runCanvasWorkflow()
      await composeCanvasWorkflowReportImage()
    } catch (error) {
      reportReady.value = false
      generating.value = false
      reportData.warnings.push(`方案2工作流未完成：${error?.response?.data?.message || error.message || '接口失败'}`)
      ElMessage.error(reportData.warnings.at(-1))
      return
    }
  }
  reportReady.value = true
  currentPageIndex.value = 0
  pageDirection.value = 'next'
  generating.value = false
  if (studentNarration) reportData.idea = studentNarration
  ElMessage.success(selectedH5Strategy.value?.type === 'canvas-workflow' ? '方案2已生成 H5 报告图片，可预览后保存' : (smartOrganizeEnabled.value && reportData.aiProvider !== 'local' ? 'H5 报告已智能整理，可预览后保存' : 'H5 报告已生成预览，可保存'))
}

async function saveReport(options = {}) {
  if (h5LayoutResult.value) return saveDesignedH5Report(options?.submit === true)
  const submit = options?.submit === true
  if (!reportReady.value) {
    ElMessage.warning('请先生成报告预览')
    return
  }
  if (!reportTitle.value.trim()) {
    ElMessage.warning('请先填写报告名称')
    return
  }
  saving.value = true
  const saved = projectStore.saveReport(project.id, {
    title: reportTitle.value,
    type: 'h5',
    course: project.courseTitle || 'AI 创意美术课',
    template: selectedTemplate.value?.id,
    h5TemplateId: selectedTemplate.value?.id,
    h5StrategyId: selectedH5Strategy.value?.id || 'h5-standard',
    h5WorkflowId: selectedH5Strategy.value?.type === 'canvas-workflow' ? selectedH5Strategy.value.workflowId || '' : '',
    h5WorkflowVersion: selectedH5Strategy.value?.type === 'canvas-workflow' ? Number(selectedH5Strategy.value.workflowVersion || 0) : 0,
    adapterKey: selectedH5Strategy.value?.type === 'canvas-workflow' ? canvasWorkflowMetadata.value.adapterKey || 'h5-report-canvas-adapter' : '',
    h5Layout: selectedTemplate.value?.layout,
    cover: finalArtwork.value || project.cover,
    pages: orderedModules.value,
    shareUrl: shareUrl(),
    materialTypes: ['painting', 'h5-report'],
    materialSummary: {
      courseAnswers: project.courseAnswers?.length || 0,
      sketches: project.sketchOriginal ? 1 : 0,
      referenceImages: project.referenceImages?.length || 0,
      versions: project.versions?.length || 0,
      finalImage: finalArtwork.value ? 1 : 0,
    },
    agentProvider: reportData.aiProvider,
    pageImages: selectedH5Strategy.value?.type === 'canvas-workflow' ? canvasWorkflowPageImages.value : productStoryPageImages.value,
    warnings: reportData.warnings,
  })
  if (saved?.id) {
    try {
      const pages = isJunior.value
        ? starterPreviewPages.value
        : isProductDesignStory(selectedTemplate.value)
          ? advancedStoryPages.value
          : orderedModules.value.map((page) => ({ ...page, text: page.text || page.body || '', src: page.src || page.imageSrc || page.images?.[0] || '' }))
      const response = await apiClient.post('/h5-reports', {
        submit,
        report: {
          id: canvasWorkflowReportId.value || productStoryReportId.value || saved.serverReportId || '',
          title: reportTitle.value,
          projectId: project.id,
          courseId: project.courseId || '',
          studentName: project.studentName || '林同学',
          difficulty: project.difficulty || 'starter',
          pages,
          pageImages: selectedH5Strategy.value?.type === 'canvas-workflow' ? canvasWorkflowPageImages.value : productStoryPageImages.value,
          h5TemplateId: selectedTemplate.value?.id,
          strategyId: selectedH5Strategy.value?.id || 'h5-standard',
          strategyVersion: Number(selectedH5Strategy.value?.workflowVersion || 1),
          workflowId: selectedH5Strategy.value?.type === 'canvas-workflow' ? selectedH5Strategy.value.workflowId || '' : '',
          workflowVersion: selectedH5Strategy.value?.type === 'canvas-workflow' ? Number(selectedH5Strategy.value.workflowVersion || 0) : 0,
          adapterKey: selectedH5Strategy.value?.type === 'canvas-workflow' ? canvasWorkflowMetadata.value.adapterKey || 'h5-report-canvas-adapter' : '',
          workflowNodeResults: selectedH5Strategy.value?.type === 'canvas-workflow' ? canvasWorkflowMetadata.value.nodeResults : [],
          warnings: reportData.warnings,
          templateSnapshot: JSON.parse(JSON.stringify(selectedTemplate.value || {})),
          cover: finalArtwork.value || project.cover || selectedTemplate.value?.coverImage || '',
          materialSummary: {
            sketches: project.sketchOriginal ? 1 : 0,
            versions: project.versions?.length || 0,
            models3d: project.models3d?.length || 0,
            videos: project.videos?.length || 0,
            finalImage: finalArtwork.value ? 1 : 0,
          },
          agentProvider: reportData.aiProvider,
          contentProfile: h5RuntimeConfig.edition?.contentProfile || '',
          agentId: h5RuntimeConfig.edition?.agentId || '',
        },
      })
      savedReportId.value = response.data.report.id
      publishedShareUrl.value = response.data.shareUrl || ''
      if (!SERVER_AUTH_MODE) localStorage.setItem('art-studio-current-report-id', response.data.report.id)
      reportSaved.value = true
      ElMessage.success(response.data.report.status === 'published' ? 'H5报告已发布，可分享给用户' : response.data.report.status === 'rejected' ? `报告未通过自动检查：${response.data.report.auditReason}` : 'H5报告已提交后台审核')
    } catch (error) {
      savedReportId.value = saved.id
      reportSaved.value = true
      if (!SERVER_AUTH_MODE) {
        localStorage.setItem('art-studio-current-report-id', saved.id)
        ElMessage.warning(`报告已保存在本机，但服务端保存失败：${error?.response?.data?.message || error.message || '接口不可用'}`)
      } else {
        ElMessage.error(`服务端报告保存失败：${error?.response?.data?.message || error.message || '接口不可用'}`)
      }
    }
  }
  saving.value = false
}

async function saveDesignedH5Report(submit) {
  if (saving.value || reportSaved.value && h5SavedStatus.value !== 'draft') return
  if (!reportTitle.value.trim()) return ElMessage.warning('请先填写报告名称')
  saving.value = true
  try {
    const generated = h5LayoutResult.value
    const { data } = await apiClient.post('/h5-reports', { submit, report: { title: reportTitle.value, projectId: project.id, studentName: project.studentName || '用户', difficulty: project.difficulty || 'pro', generationToken: generated.generationToken, layoutSnapshot: generated.layout, pages: generated.pages, h5TemplateId: generated.templateId, templateSnapshot: generated.templateSnapshot, cover: finalArtwork.value || '' } })
    savedReportId.value = data.report.id; publishedShareUrl.value = data.shareUrl || ''; reportSaved.value = true; h5SavedStatus.value = data.report.status
    projectStore.saveReport(project.id, { ...data.report, type: 'h5', serverReportId: data.report.id, shareUrl: data.shareUrl || '', cover: finalArtwork.value || '', h5TemplateId: generated.templateId })
    if (SERVER_AUTH_MODE) await projectStore.flushServerWrites(true)
    ElMessage.success(submit ? '报告已提交审核' : '报告草稿已保存到服务端')
  } catch (error) { reportSaved.value = false; ElMessage.error(error.response?.data?.message || '保存失败，生成结果已保留，请重试保存') } finally { saving.value = false }
}

function previewReport() {
  // 有工作流结果图就统一走独立预览页（那里才有手机外壳 + 成品图）。
  if (canvasWorkflowPageImages.value.length) { openAdvancedPreview(); return }
  if (h5LayoutResult.value) { showH5LayoutPreview.value = true; return }
  if (!reportReady.value) {
    ElMessage.warning('请先生成报告预览')
    return
  }
  currentPageIndex.value = 0
  pageDirection.value = 'next'
}

function exitReport() {
  router.push('/student/reports')
}
function applyLocalH5Report(result, provider = 'local') {
  reportData.summary = result.summary
  reportData.course = result.course
  reportData.idea = result.idea
  reportData.aiReview = result.aiReview
  reportData.pages = result.pages
  reportData.aiProvider = provider
}
function applyAgentH5Report(payload = {}, promptText = '') {
  const pages = normalizeAgentPages(payload.pages || payload.outline || [])
  if (!pages.length) return
  reportTitle.value = payload.reportTitle || reportTitle.value
  reportData.summary = pages[0]?.body || payload.reportDocument || reportData.summary
  reportData.course = pages.find((page) => page.type === 'course')?.body || reportData.course
  reportData.idea = pages.find((page) => page.type === 'idea')?.body || reportData.idea
  reportData.aiReview = pages.find((page) => page.type === 'aiReview')?.body || reportData.aiReview
  reportData.pages = pages
  reportData.aiProvider = payload.agentProvider || payload.provider || 'api'
  reportData.warnings = Array.isArray(payload.warnings) ? payload.warnings : []
  if (!reportData.summary) reportData.summary = buildLocalH5Report(promptText).summary
}
function normalizeAgentPages(pages = []) {
  const imageMap = h5ImageMap()
  return pages
    .map((page, index) => {
      const type = normalizeH5PageType(page.type || page.id, index)
      return {
        id: page.id || `${type}-${index + 1}`,
        type,
        key: type,
        title: page.title || h5PageTitle(type),
        subtitle: page.subtitle || '',
        body: page.body || page.content || page.copy || '',
        imageRole: pickImageRole(type, page.materials),
        imageSrc: imageMap[pickImageRole(type, page.materials)] || '',
        images: pickImages(type),
        timeline: type === 'aiProcess' ? aiProcessItems.value : [],
      }
    })
    .filter((page) => page.title || page.body || page.imageSrc || page.images?.length)
    .slice(0, 10)
}
function normalizeH5PageType(value = '', index = 0) {
  if (selectedTemplate.value?.designDocument && H5_CHAPTERS.some(chapter => chapter.id === value)) return value
  const text = String(value || '').toLowerCase()
  if (text.includes('aiprompt') || text.includes('prompt')) return 'aiPrompt'
  if (text.includes('backcover') || text.includes('back-cover') || text.includes('footer')) return 'backCover'
  if (text.includes('understanding') || text.includes('course')) return 'course'
  if (text.includes('idea')) return 'idea'
  if (text.includes('sketch')) return 'process'
  if (text.includes('iteration') || text.includes('ai') || text.includes('process')) return 'aiProcess'
  if (text.includes('final') || text.includes('design')) return 'finalWork'
  if (text.includes('review')) return 'aiReview'
  if (text.includes('teacher') || text.includes('comment')) return 'teacherComment'
  return ['course', 'idea', 'process', 'aiProcess', 'finalWork', 'aiReview', 'teacherComment'][index] || `custom-${index + 1}`
}
function h5PageTitle(type) {
  return {
    course: '我理解的课程项目',
    idea: '我的创意想法',
    process: '我的手绘草稿',
    aiProcess: '我的 AI 出图过程',
    finalWork: '我的最终作品',
    aiReview: 'AI 给我的作品点评',
    teacherComment: '讲师给我的成长建议',
  }[type] || '我的项目记录'
}
function pickImageRole(type, materials = []) {
  const joined = Array.isArray(materials) ? materials.join(' ') : ''
  if (joined.includes('sketchOriginal')) return 'sketchOriginal'
  if (joined.includes('sketchOptimized')) return 'sketchOptimized'
  if (joined.includes('versions')) return 'version'
  if (joined.includes('finalImage')) return 'final'
  if (type === 'process') return project.sketchOriginal ? 'sketchOriginal' : 'reference'
  if (type === 'aiProcess') return 'version'
  if (type === 'finalWork') return 'final'
  return ''
}
function h5ImageMap() {
  return {
    final: finalArtwork.value,
    version: finalArtwork.value,
    sketchOriginal: project.sketchOriginal,
    sketchOptimized: project.sketchOptimized,
    reference: project.referenceImages?.[0]?.preview || '',
  }
}
function pickImages(type) {
  if (type === 'process') return processImages.value
  if (type === 'aiProcess') {
    const versions = (project.versions || []).slice(0, 4).map((item, index) => ({
      label: item.title || `AI版本 ${index + 1}`,
      src: item.imageUrl || extractUrl(item.background),
    }))
    return versions.concat(canvasWorkflowImages.value.map((src, index) => ({ label: `方案2工作流图 ${index + 1}`, src })))
  }
  return []
}
// 报告里最多放多少张方案2结果图。老师的画布上摆了几个结果节点，就该进来几张；
// 早先写死 10，8 个结果节点里排在后面的 2 张直接被砍掉，用户端看不到。
const WORKFLOW_MAX_RESULT_IMAGES = 30

// 中栏勾选状态决定哪些素材进工作流，未勾选的一律不发送
function canvasWorkflowMaterialList() {
  const keep = (id) => arMaterialSelected(id)
  const pick = (list, idOf) => (list || [])
    .map((item, index) => ({ id: idOf(item, index), url: materialSource(item) }))
    .filter((entry) => entry.url && keep(entry.id))
    .map((entry) => entry.url)
  const referenceImages = (project.referenceImages || [])
    .map((item, index) => ({ id: `reference-${item?.id || index}`, url: item?.preview || item?.url || item }))
    .filter((entry) => entry.url && keep(entry.id))
    .map((entry) => entry.url)
  const finalVersion = (project.versions || []).find((item) => item.id === project.finalVersionId)
  const finalIndex = finalVersion ? (project.versions || []).indexOf(finalVersion) : -1
  const finalKept = finalIndex < 0 ? true : keep(`version-${finalVersion.id || finalIndex}`)
  return {
    sketchOriginal: keep('sketch-original') ? (project.sketchOriginal || '') : '',
    sketchOptimized: keep('sketch-optimized') ? (project.sketchOptimized || '') : '',
    referenceImages,
    versions: pick(project.versions, (item, index) => `version-${item?.id || index}`),
    models3d: pick(project.models3d, (item, index) => `model-${item?.id || index}`),
    videos: pick(project.videos, (item, index) => `video-${item?.id || index}`),
    finalImage: finalKept ? (finalArtwork.value || '') : '',
  }
}

async function runCanvasWorkflow() {
  const strategy = selectedH5Strategy.value
  if (strategy?.type !== 'canvas-workflow') return
  if (!strategy.workflowId) throw new Error('方案2尚未绑定无限画布工作流')
  if (!arSelectedMaterialTotal.value) throw new Error('请先在中间「创作素材」里勾选至少一张图片，再生成报告')
  canvasWorkflowRunning.value = true
  canvasWorkflowStatus.value = '正在按画布节点生成报告图片…'
  try {
    const response = await apiClient.post('/h5-report/canvas-workflow/run', {
      difficulty: project.difficulty || 'starter',
      workflowId: strategy.workflowId,
      workflowVersion: Number(strategy.workflowVersion || 0),
      templateId: selectedTemplate.value?.id || '',
      materials: canvasWorkflowMaterialList(),
      report: {
        title: reportTitle.value,
        summary: reportData.summary,
        course: reportData.course,
        idea: reportData.idea,
        aiReview: reportData.aiReview,
        // 右栏提示词框里的那句才是这次出图要用的，没改过时就等于画图时写的那句
        prompt: String(arPromptText.value || '').trim() || project.prompt || project.ideaPrompt || '',
        pages: reportData.pages.map((page) => ({ id: page.id || page.type || '', title: page.title || '', body: page.body || page.text || '' })),
      },
    })
    const images = (response.data?.images || []).map((item) => item?.url || item?.imageUrl || item?.src || item).filter(Boolean)
    if (!images.length) throw new Error('方案2工作流未返回可用图像结果')
    canvasWorkflowImages.value = images.slice(0, WORKFLOW_MAX_RESULT_IMAGES)
    // 后端会把「结果图」和「用户素材原图」分开返回：结果图进报告预览，
    // 素材原图只是用户自己上传的那些，报告里本来就有，不重复刷一遍。
    canvasWorkflowMaterialImages.value = (response.data?.materialImages || []).filter(Boolean)
    canvasWorkflowMetadata.value = {
      adapterKey: response.data?.adapterKey || 'h5-report-canvas-adapter',
      workflowVersion: Number(response.data?.workflowVersion || strategy.workflowVersion || 0),
      nodeResults: Array.isArray(response.data?.nodeResults) ? response.data.nodeResults : [],
      warnings: Array.isArray(response.data?.warnings) ? response.data.warnings : [],
    }
    reportData.warnings.push(...canvasWorkflowMetadata.value.warnings.filter((warning) => !reportData.warnings.includes(warning)))
    canvasWorkflowReportId.value = `h5_canvas_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    const nodeCount = Number(response.data?.executedNodes || 0)
    const materialCount = canvasWorkflowMaterialImages.value.length
    canvasWorkflowStatus.value = nodeCount
      ? `画布 ${nodeCount} 个节点执行完成，共返回 ${canvasWorkflowImages.value.length} 张结果图${materialCount ? `（用了 ${materialCount} 张素材）` : ''}`
      : `工作流完成，已返回 ${canvasWorkflowImages.value.length} 张结果图${materialCount ? `（用了 ${materialCount} 张素材）` : ''}`
    if (canvasWorkflowImages.value.length < 6) {
      reportData.warnings.push(`本次只出 ${canvasWorkflowImages.value.length} 张图：后台画布上的出图节点偏少，或单节点出图张数设得偏低，建议加到 3 个出图节点、每节点 2~4 张。`)
    }
    reportData.pages = normalizeAgentPages(reportData.pages)
    return response.data
  } finally {
    canvasWorkflowRunning.value = false
  }
}
async function composeCanvasWorkflowReportImage() {
  if (!canvasWorkflowImages.value.length) return
  // 高级版的报告整页由 ProductStoryImagePage 渲染，页面上没有 exportEl，
  // 旧逻辑在这里直接 return，导致 pageImages 永远是空数组 —— 保存后预览、公开页全都看不到图。
  // 所以高级版改走另一条路：把工作流结果图逐张落盘，一张图就是一页。
  if (!exportEl.value) {
    await storeCanvasWorkflowResultPages()
    return
  }
  canvasWorkflowStatus.value = '正在合成方案2 H5 报告图片…'
  await nextTick()
  const sections = Array.from(exportEl.value.querySelectorAll('.report-section'))
  if (!sections.length) throw new Error('H5 报告页面未准备完成')
  const pageImages = []
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index]
    const canvas = await html2canvas(section, { backgroundColor: '#ffffff', scale: 1.5, useCORS: true, logging: false })
    const pageId = index === 0 ? 'cover' : index === sections.length - 1 ? 'footer' : orderedModules.value[index - 1]?.key || `module-${index}`
    const response = await apiClient.post(`/h5-reports/${encodeURIComponent(canvasWorkflowReportId.value)}/pages`, {
      pageId,
      label: index === 0 ? '方案2 H5 封面' : index === sections.length - 1 ? '方案2 H5 封底' : `方案2 H5 第 ${index} 页`,
      imageData: canvas.toDataURL('image/webp', .88),
    })
    pageImages.push({ id: pageId, label: response.data?.label || `方案2 H5 第 ${index + 1} 页`, url: response.data?.assetUrl || '' })
    canvasWorkflowStatus.value = `正在合成方案2 H5 报告图片（${index + 1}/${sections.length}）…`
  }
  canvasWorkflowPageImages.value = pageImages.filter((item) => item.url)
}

// 工作流结果图 → 报告页图。
// 上游给的是火山/豆包的临时链接（约 24 小时失效），所以必须当场下载落盘；
// 落盘后拿到的是本服务自己的地址，预览、保存、公开页都用它。
async function storeCanvasWorkflowResultPages() {
  const images = canvasWorkflowImages.value
  if (!images.length) return
  const reportId = canvasWorkflowReportId.value || `h5_canvas_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  canvasWorkflowReportId.value = reportId
  const pageImages = []
  for (let index = 0; index < images.length; index += 1) {
    const pageId = `workflow-${index + 1}`
    const label = `方案2 结果图 ${index + 1}`
    canvasWorkflowStatus.value = `正在保存结果图（${index + 1}/${images.length}）…`
    try {
      const response = await apiClient.post(`/h5-reports/${encodeURIComponent(reportId)}/pages/${encodeURIComponent(pageId)}/ingest`, {
        imageUrl: images[index],
        label,
      })
      if (response.data?.assetUrl) pageImages.push({ id: pageId, label: response.data.label || label, url: response.data.assetUrl })
    } catch (error) {
      // 单张失败不阻断整份报告：其余图照常保存，缺的那张会在警告里说清楚。
      reportData.warnings.push(`第 ${index + 1} 张结果图保存失败：${error?.response?.data?.message || error.message || '未知原因'}`)
    }
  }
  canvasWorkflowPageImages.value = pageImages
  canvasWorkflowStatus.value = pageImages.length
    ? `已保存 ${pageImages.length} 张结果图，可在预览里翻页查看`
    : '结果图未能保存，报告里的文字部分仍可正常预览'
}
function buildLocalH5Report(promptText = '') {
  const finalTitle = project.title || '我的 AI 创意作品'
  const courseText = project.courseTitle
    ? `我学习了《${project.courseTitle}》这个课程项目。通过课堂问题和练习，我开始理解主题、造型、颜色和画面重点，并把这些内容变成自己的创作方向。${courseAnswerText.value ? `我的课堂回答包括：${courseAnswerText.value}` : ''}`
    : `我这次围绕“${finalTitle}”完成了一个 AI 绘画项目。我先整理主题，再把自己的想法变成提示词，最后选择最能表达创意的作品。`
  const ideaText = project.ideaSummary || project.courseIdeaText || project.courseIdeaVoiceText || `我一开始的想法是：${promptText}。我希望画面能清楚表达主题，也能保留自己的想象力。`
  const sketchText = project.sketchOriginal
    ? `我上传了自己的手绘草稿，用它记录最早的构图和主体想法。之后我把草稿整理成更适合 AI 理解的参考图，让 AI 可以沿着我的构思继续完善。`
    : `这次我主要用文字想法开始创作，还没有上传手绘草稿。后面如果补充草图，报告会继续记录我的草稿变化。`
  const versionText = project.versions?.length
    ? `我一共生成了 ${project.versions.length} 个 AI 版本，并从主体造型、颜色、清晰度和画面完整度中进行比较。${aiProcessItems.value.join('；')}`
    : `我还没有生成多张 AI 版本，报告先记录我的创意方向和提示词整理过程。`
  const finalText = finalArtwork.value
    ? `我最后选择这张作品作为成品，因为它最接近我的创意主题，也更适合展示给大家。它把我的想法、提示词和 AI 生成结果整理成了完整画面。`
    : `我还没有确定最终作品，生成成品后这里会展示最终图片，并整理我选择它的原因。`
  return {
    summary: `这是我完成《${finalTitle}》项目的 H5 汇报。我会从课程理解、创意想法、手绘草稿、AI 提示词、AI 出图过程和最终作品几个部分，讲清楚我是怎么一步步完成创作的。`,
    course: courseText,
    idea: ideaText,
    aiReview: `AI 点评：我的作品主题比较明确，画面已经有了完整的视觉中心。下一步我可以继续加强细节、背景故事和颜色层次，让作品更有自己的表达。`,
    pages: [
      { id: 'course', type: 'course', title: '我理解的课程项目', body: courseText },
      { id: 'idea', type: 'idea', title: '我的创意想法', body: ideaText },
      { id: 'process', type: 'process', title: '我的手绘草稿', body: sketchText, images: processImages.value, imageRole: 'sketchOriginal', imageSrc: project.sketchOriginal },
      { id: 'aiPrompt', type: 'idea', title: '我的 AI 提示词', body: `我把自己的想法整理成 AI 提示词：“${promptText}”。这个提示词帮助 AI 理解我要画的主体、风格和画面效果。` },
      { id: 'aiProcess', type: 'aiProcess', title: '我的 AI 出图过程', body: versionText, timeline: aiProcessItems.value, images: pickImages('aiProcess'), imageRole: 'version', imageSrc: finalArtwork.value },
      { id: 'finalWork', type: 'finalWork', title: '我的最终作品', body: finalText, imageRole: 'final', imageSrc: finalArtwork.value },
      { id: 'aiReview', type: 'aiReview', title: 'AI 给我的作品点评', body: `AI 点评：我的作品主题比较明确，画面已经有了完整的视觉中心。下一步我可以继续加强细节、背景故事和颜色层次，让作品更有自己的表达。` },
      { id: 'teacherComment', type: 'teacherComment', title: '讲师给我的成长建议', body: '讲师可以在这里补充课堂表现、作品亮点和下一步建议。' },
    ],
  }
}
function h5ProjectPayload() {
  return {
    ...project,
    finalArtworkUrl: finalArtwork.value,
    courseAnswerText: courseAnswerText.value,
    referenceImages: (project.referenceImages || []).map((item) => ({
      id: item.id,
      name: item.name,
      source: item.source,
      hasImage: Boolean(item.preview),
    })),
    versions: (project.versions || []).slice(0, 8).map((item) => ({
      id: item.id,
      title: item.title,
      note: item.note,
      prompt: item.prompt,
      provider: item.provider,
      model: item.model,
      hasImage: Boolean(item.imageUrl || item.background),
    })),
  }
}
function h5ReportInstruction() {
  return `${selectedTemplate.value?.designDocument ? '请返回 cover、inspiration、problem、sketch、ai、model、scene、reflection 八类章节，每页包含 type、title、body。缺少真实记录的章节直接跳过，不编造经历或讲师评语。' : ''}生成 H5 项目报告，不是 PPT。必须使用用户第一人称“我”来写。请智能分析并整理：课程项目回答、创意想法、手绘草稿、草稿创意描述、AI提示词、AI出图过程、图片调整分析、最终作品选择理由和成品创意说明。每页文字适合 H5 左右翻页阅读，语言自然，像用户向讲师汇报自己的创作过程。不要编造不存在的图片；没有素材时说明“我还没有上传/生成”。`
}
function goToPage(index) {
  const nextIndex = Math.max(0, Math.min(index, reportPages.value.length - 1))
  if (nextIndex === currentPageIndex.value) return
  pageDirection.value = nextIndex > currentPageIndex.value ? 'next' : 'prev'
  currentPageIndex.value = nextIndex
}
function nextPage() {
  goToPage(currentPageIndex.value + 1)
}
function prevPage() {
  goToPage(currentPageIndex.value - 1)
}
function handlePointerDown(event) {
  pointerStartX.value = event.clientX
}
function handlePointerUp(event) {
  const delta = event.clientX - pointerStartX.value
  if (Math.abs(delta) < 48) return
  if (delta < 0) nextPage()
  else prevPage()
  pointerStartX.value = 0
}
function handlePointerCancel() {
  pointerStartX.value = 0
}
function handleKeydown(event) {
  if (starterStyleDrawerOpen.value) {
    if (event.key === 'Escape') closeStarterStyleDrawer()
    if (event.key === 'ArrowRight') browseStarterStyle(1)
    if (event.key === 'ArrowLeft') browseStarterStyle(-1)
    if (['Escape', 'ArrowRight', 'ArrowLeft'].includes(event.key)) event.preventDefault()
    return
  }
  const tagName = event.target?.tagName
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || event.target?.isContentEditable) return
  if (event.key === 'ArrowRight') nextPage()
  if (event.key === 'ArrowLeft') prevPage()
}
function shareUrl() {
  if (publishedShareUrl.value) return `${window.location.origin}${publishedShareUrl.value}`
  const id = savedReportId.value || (!SERVER_AUTH_MODE ? localStorage.getItem('art-studio-current-report-id') : '') || ''
  const query = new URLSearchParams({ projectId: project.id || '', reportId: id })
  return `${window.location.origin}/student/h5-report?${query.toString()}`
}
async function generatePoster() {
  if (h5LayoutResult.value && !publishedShareUrl.value) { ElMessage.warning('报告审核通过后才能生成可公开扫码的分享海报'); return }
  posterGenerating.value = true
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 900
    canvas.height = 1280
    const ctx = canvas.getContext('2d')
    const theme = selectedTemplate.value.theme
    ctx.fillStyle = theme.background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = theme.primary
    ctx.fillRect(0, 0, canvas.width, 22)
    ctx.fillStyle = theme.surface
    roundRect(ctx, 70, 86, 760, 760, 34)
    ctx.fill()
    ctx.fillStyle = theme.primary
    ctx.font = 'bold 48px Microsoft YaHei'
    wrapText(ctx, reportTitle.value, 90, 940, 720, 58)
    ctx.fillStyle = theme.text
    ctx.font = '28px Microsoft YaHei'
    wrapText(ctx, '扫码查看孩子的 AI 创意美术 H5 报告', 90, 1048, 520, 38)
    const qr = await QRCode.toDataURL(shareUrl(), { width: 220, margin: 1 })
    const qrImage = await loadImage(qr)
    ctx.drawImage(qrImage, 600, 1010, 210, 210)
    posterUrl.value = canvas.toDataURL('image/png')
  } finally {
    posterGenerating.value = false
  }
}
async function exportPdf() {
  if (!exportEl.value) return
  const canvas = await html2canvas(exportEl.value, { backgroundColor: '#ffffff', scale: 2, useCORS: true })
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width, canvas.height] })
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width, canvas.height)
  pdf.save('AI创作H5报告.pdf')
}
function openOfficialUrl() {
  const url = selectedTemplate.value?.officialUrl
  if (!url) {
    ElMessage.warning('请先在模板或当前报告中配置官网链接')
    return
  }
  if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener')
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  let line = ''
  String(text).split('').forEach((char) => {
    const testLine = line + char
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, y)
      line = char
      y += lineHeight
    } else {
      line = testLine
    }
  })
  if (line) ctx.fillText(line, x, y)
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}
</script>

<style scoped lang="scss">
.h5-designed-preview { position: fixed; inset: 0; z-index: 2100; background: #17273ccc; display: grid; place-items: center; padding: 16px; }
.h5-designed-preview > section { width: min(100%, 580px); max-height: calc(100dvh - 32px); overflow: auto; border-radius: 18px; background: #f3f7fc; }
.h5-designed-preview header, .h5-designed-preview footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 20px; }
.h5-designed-preview button { min-height: 44px; padding: 8px 18px; border: 1px solid #c9d8ec; border-radius: 10px; background: white; cursor: pointer; }
.h5-designed-preview footer button { width: 100%; background: #245bc2; color: white; }
.h5-designed-preview button:disabled { opacity: .5; cursor: default; }
.h5-designed-preview-body { display: flex; justify-content: center; padding: 8px; }
.h5-designed-preview p { padding: 0 20px; color: #8c5a12; }
.h5-report-page {
  max-width: 1440px;
  min-height: calc(100vh - var(--app-top, 0px));
  margin: 0 auto;
  background: #f3f6fa;
}
.h5-report-header {
  min-height: 78px;
  padding: 14px 18px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}
.h5-report-header h1 { margin: 0; font-size: 22px; color: #111827; }
.h5-report-header p { margin: 4px 0 0; color: #64748b; }
.header-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.back-btn,
.primary-btn,
.secondary-btn,
.stage-toolbar button,
.h5-report-footer button {
  min-height: 42px;
  border: 0;
  border-radius: 8px;
  padding: 0 16px;
  font-weight: 900;
  cursor: pointer;
}
.back-btn,
.secondary-btn,
.stage-toolbar button {
  background: #f1f5f9;
  color: #334155;
}
.primary-btn,
.h5-report-footer button {
  background: #f97316;
  color: #fff;
}
.full-width { width: 100%; }
button:disabled { opacity: .55; cursor: not-allowed; }
.h5-workbench {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 16px;
  padding: 16px;
  align-items: start;
}
.h5-control-panel,
.h5-preview-stage {
  display: grid;
  gap: 14px;
}
.control-block,
.stage-toolbar {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 14px;
}
.block-title,
.stage-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.block-title strong { color: #111827; }
.block-title span,
.recommend-note { color: #64748b; font-size: 13px; }
.template-choice-list {
  margin-top: 12px;
  display: grid;
  gap: 10px;
}
.template-choice-list button {
  min-height: 72px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  text-align: left;
  cursor: pointer;
}
.template-choice-list button.active {
  border-color: #f97316;
  box-shadow: 0 0 0 3px rgba(249, 115, 22, .14);
}
.template-choice-list i {
  width: 42px;
  height: 42px;
  border-radius: 8px;
}
.template-choice-list strong,
.template-choice-list small {
  display: block;
}
.template-choice-list small {
  margin-top: 4px;
  color: #64748b;
  line-height: 1.35;
}
label {
  margin-top: 12px;
  display: grid;
  gap: 6px;
  color: #334155;
  font-weight: 900;
}
input,
textarea {
  min-height: 42px;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  padding: 9px 10px;
  font: inherit;
}
textarea { min-height: 96px; resize: vertical; }
.switch-row {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}
.switch-row input {
  width: 18px;
  height: 18px;
  min-height: auto;
  accent-color: #f97316;
}
.organize-scope {
  margin: 12px 0;
  padding: 10px 12px;
  display: grid;
  gap: 6px;
  border-radius: 8px;
  background: #fff7ed;
  color: #7c2d12;
  font-size: 13px;
  line-height: 1.45;
}
.organize-scope li { margin-left: 16px; }
.poster-download {
  display: inline-flex;
  margin-top: 10px;
  color: #f97316;
  font-weight: 900;
}
.poster-preview {
  width: 100%;
  margin-top: 10px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}
.stage-toolbar {
  min-height: 58px;
}
.stage-toolbar div {
  display: flex;
  gap: 8px;
}
.h5-book-viewer {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 704px;
  touch-action: pan-y;
  user-select: none;
}
.h5-report {
  --h5-primary: #f97316;
  --h5-secondary: #14b8a6;
  --h5-accent: #facc15;
  --h5-bg: #fff7ed;
  --h5-surface: #fff;
  --h5-text: #334155;
  max-width: 860px;
  margin: 0 auto;
  background: var(--h5-bg);
  color: var(--h5-text);
  overflow: hidden;
  border-radius: 8px;
  box-shadow: 0 18px 54px rgba(15, 23, 42, .12);
}
.h5-report-book {
  width: min(860px, calc(100vw - 468px));
  min-height: 664px;
  transform-origin: center;
}
.book-page {
  min-height: 664px;
}
.page-nav {
  position: absolute;
  top: 50%;
  z-index: 5;
  width: 48px;
  height: 76px;
  border: 0;
  border-radius: 8px;
  background: rgba(15, 23, 42, .82);
  color: #fff;
  font-size: 48px;
  line-height: 1;
  cursor: pointer;
  transform: translateY(-50%);
  box-shadow: 0 14px 30px rgba(15, 23, 42, .18);
}
.page-nav.prev { left: max(8px, calc(50% - 488px)); }
.page-nav.next { right: max(8px, calc(50% - 488px)); }
.page-nav:disabled {
  opacity: .26;
  cursor: not-allowed;
}
.book-footer-controls {
  max-width: 860px;
  margin: 12px auto 0;
  display: grid;
  grid-template-columns: 112px minmax(72px, 1fr) 112px;
  gap: 10px;
  align-items: center;
}
.book-footer-controls button {
  min-height: 40px;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  background: #fff;
  color: #334155;
  font-weight: 900;
  cursor: pointer;
}
.book-footer-controls span {
  color: #475569;
  font-weight: 900;
  text-align: center;
}
.book-page-next-enter-active,
.book-page-next-leave-active,
.book-page-prev-enter-active,
.book-page-prev-leave-active {
  transition: transform .28s ease, opacity .28s ease;
}
.book-page-next-enter-from {
  opacity: 0;
  transform: translateX(44px) scale(.985);
}
.book-page-next-leave-to {
  opacity: 0;
  transform: translateX(-44px) scale(.985);
}
.book-page-prev-enter-from {
  opacity: 0;
  transform: translateX(-44px) scale(.985);
}
.book-page-prev-leave-to {
  opacity: 0;
  transform: translateX(44px) scale(.985);
}
.h5-export-stack {
  position: absolute;
  left: -99999px;
  top: 0;
  width: 860px;
  pointer-events: none;
}
.report-section {
  padding: 44px;
}
.h5-cover {
  min-height: 640px;
  display: grid;
  grid-template-columns: minmax(0, .92fr) minmax(280px, 1fr);
  gap: 28px;
  align-items: center;
}
.cover-copy span,
.section-heading span {
  color: var(--h5-primary);
  font-weight: 900;
}
.cover-copy h2 {
  margin: 14px 0;
  color: var(--h5-primary);
  font-size: 52px;
  line-height: 1.08;
}
.cover-copy p,
.content-section p {
  font-size: 18px;
  line-height: 1.8;
}
.hero-art,
.final-work-image,
.process-item div {
  min-height: 360px;
  border-radius: 8px;
  background-size: cover;
  background-position: center;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 28px;
  font-weight: 900;
}
.content-section {
  background: var(--h5-surface);
  border-top: 1px solid rgba(148, 163, 184, .22);
}
.section-heading {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 12px;
  align-items: baseline;
  margin-bottom: 18px;
}
.section-heading h3 {
  margin: 0;
  color: var(--h5-primary);
  font-size: 30px;
}
.final-work-grid {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(0, .75fr);
  gap: 24px;
  align-items: center;
}
.process-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.process-copy,
.ai-process-block > p {
  grid-column: 1 / -1;
  margin: 0 0 8px;
}
.process-item div { min-height: 180px; font-size: 18px; }
.process-item strong {
  display: block;
  margin-top: 8px;
  color: var(--h5-primary);
}
.timeline-list {
  display: grid;
  gap: 12px;
  padding-left: 22px;
  font-size: 18px;
  line-height: 1.7;
}
.certificate-card {
  border: 2px solid var(--h5-accent);
  border-radius: 8px;
  padding: 26px;
  background: linear-gradient(135deg, rgba(255,255,255,.82), rgba(255,255,255,.96));
}
.certificate-card strong {
  display: block;
  color: var(--h5-primary);
  font-size: 28px;
}
.h5-report-footer {
  padding: 28px 44px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  background: var(--h5-primary);
  color: #fff;
}
.h5-report-footer button {
  background: #fff;
  color: var(--h5-primary);
}
.layout-art-gallery .h5-cover,
.layout-art-gallery .final-work-grid {
  grid-template-columns: 1fr;
}
.layout-art-gallery .hero-art,
.layout-art-gallery .final-work-image {
  min-height: 520px;
}
.layout-growth-file .content-section {
  border-left: 10px solid var(--h5-accent);
}
.layout-ai-tech {
  background: linear-gradient(135deg, #0f172a, var(--h5-primary));
}
.layout-ai-tech .content-section,
.layout-ai-tech .h5-cover {
  background: rgba(255,255,255,.92);
}
@media (prefers-reduced-motion: reduce) {
  .book-page-next-enter-active,
  .book-page-next-leave-active,
  .book-page-prev-enter-active,
  .book-page-prev-leave-active {
    transition: none;
  }
}
@media (max-width: 980px) {
  .h5-report-header,
  .h5-workbench,
  .h5-cover,
  .final-work-grid,
  .process-grid {
    grid-template-columns: 1fr;
  }
  .report-section { padding: 28px; }
  .cover-copy h2 { font-size: 38px; }
  .h5-book-viewer { min-height: 620px; }
  .h5-report-book {
    width: min(100%, 860px);
    min-height: 580px;
  }
  .header-actions { justify-content: flex-start; }
  .book-page { min-height: 580px; }
  .page-nav {
    top: auto;
    bottom: -62px;
    width: 48px;
    height: 42px;
    font-size: 36px;
    transform: none;
  }
  .page-nav.prev { left: 0; }
  .page-nav.next { right: 0; }
  .book-footer-controls {
    margin-top: 18px;
    padding: 0 58px;
    grid-template-columns: 1fr;
  }
  .book-footer-controls button { display: none; }
}
.junior-report-page{max-width:none!important;min-height: calc(100vh - var(--app-top, 0px));padding:0 32px 24px;background:radial-gradient(circle at 76% 18%,rgba(255,215,233,.62),transparent 26%),radial-gradient(circle at 13% 86%,rgba(216,225,255,.72),transparent 28%),#fffaf2;color:#142356}.junior-report-workbench{max-width:1440px;margin:0 auto}.junior-report-header{height:92px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center}.junior-report-title{display:flex;align-items:center;gap:13px}.junior-report-title h1{margin:0;color:#142356;font-size:30px;letter-spacing:-1px}.junior-report-title>span{color:#ffb13c;font-size:24px}.junior-back{width:44px;height:44px;border:1px solid #ece8e3;border-radius:14px;background:#fff;color:#142356;font-size:31px;line-height:1}.junior-step{display:grid;justify-items:center;gap:9px}.junior-step strong{padding:10px 26px;border-radius:999px;color:#fff;background:#285df0;font-size:15px}.junior-step div{width:220px;display:flex;justify-content:space-between;position:relative}.junior-step div:before{content:"";position:absolute;left:9px;right:9px;top:50%;height:3px;background:#cbd3e4;transform:translateY(-50%)}.junior-step i{z-index:1;width:19px;height:19px;border:3px solid #c9ceda;border-radius:50%;background:#fff}.junior-step i.done{border-color:#2462f0;background:#2462f0;box-shadow:inset 0 0 0 3px #fff}.junior-step i.current{border-color:#2462f0}.junior-student{justify-self:end;height:50px;padding:6px 14px 6px 7px;border:1px solid #efe9e3;border-radius:999px;display:flex;align-items:center;gap:9px;background:#fff;box-shadow:0 5px 18px rgba(49,38,77,.06)}.junior-student b{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;color:#fff;background:linear-gradient(145deg,#f9a273,#2963ee)}.junior-student span{font-size:17px}.junior-report-columns{display:grid;grid-template-columns:1fr 1fr;gap:24px}.junior-materials,.junior-narration{padding:24px;border:1px solid rgba(235,229,221,.83);border-radius:26px;background:rgba(255,255,255,.78);box-shadow:0 15px 50px rgba(63,69,105,.07);backdrop-filter:blur(12px)}.junior-materials{display:grid;grid-template-rows:46px minmax(300px,1fr) 150px}.junior-materials h2,.junior-narration h2{margin:0 0 16px;display:flex;align-items:center;gap:10px;color:#142356;font-size:23px}.junior-icon{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;font-size:20px}.junior-icon.coral{color:#f66d4e;background:#ffebe4}.junior-icon.blue{color:#fff;background:#2860ef}.junior-sketch{width:100%;height:auto;min-height:300px;border:0;border-radius:20px;position:relative;overflow:hidden;text-align:left;background-size:cover;background-position:center;background-color:#ffdfad;box-shadow:inset 0 0 0 1px rgba(255,255,255,.3)}.junior-sketch span{position:absolute;left:14px;top:14px;padding:7px 10px;border-radius:8px;color:#fff;background:rgba(8,18,50,.5);font-size:13px}.junior-media-row{height:150px;margin-top:18px;display:grid;grid-template-columns:1fr 1fr;gap:18px}.junior-media{border:0;border-radius:19px;position:relative;overflow:hidden;color:#fff;text-align:left;background-size:cover;background-position:center;background-color:#34558b}.junior-media:after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(3,12,35,.7),transparent 65%)}.junior-media strong,.junior-media small{position:absolute;z-index:1;left:14px}.junior-media strong{top:13px;font-size:16px}.junior-media small{right:14px;bottom:14px;font-size:11px}.junior-video strong{display:flex;gap:7px}.junior-narration h2{margin-bottom:16px}.junior-idea-card{height:calc(100% - 48px);min-height:480px;padding:56px 46px 32px;border-radius:34px;position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(circle at 10% 12%,#ffedb4 0 3%,transparent 3.2%),radial-gradient(circle at 88% 16%,#ffcfe8 0 4%,transparent 4.2%),radial-gradient(circle at 13% 84%,#d8dcff 0 4%,transparent 4.2%),linear-gradient(135deg,#def4ff,#fff9ec 52%,#f5d7ff);box-shadow:inset 0 0 0 1px rgba(255,255,255,.83)}.junior-idea-card:before,.junior-idea-card:after{content:"";position:absolute;border:2px solid rgba(255,255,255,.6);border-radius:50%;transform:rotate(-26deg)}.junior-idea-card:before{width:250px;height:72px;left:-58px;top:60px}.junior-idea-card:after{width:150px;height:44px;right:-20px;bottom:80px}.junior-idea-card textarea{z-index:1;width:100%;min-height:110px;border:0;outline:0;resize:none;text-align:center;color:#142356;background:transparent;font-size:clamp(25px,2.3vw,40px);font-weight:900;line-height:1.5}.junior-wave{z-index:1;margin:14px 0 22px;color:#91a0ec;letter-spacing:4px;font-size:24px}.junior-mic{z-index:1;width:112px;height:112px;border:13px solid rgba(247,249,255,.55);border-radius:50%;color:#fff;background:#265cf0;box-shadow:0 14px 28px rgba(30,81,214,.26);font-size:0}.junior-mic:after{content:"🎙";font-size:46px}.junior-idea-card p{z-index:1;margin:26px 0 0;color:#4068ce;font-size:17px}.junior-report-footer{height:88px;margin-top:18px;display:grid;grid-template-columns:1fr 1.17fr 1.75fr;gap:18px}.junior-secondary,.junior-primary{border:1px solid #eee8df;border-radius:19px;display:flex;align-items:center;justify-content:center;gap:10px;font-size:19px;font-weight:900}.junior-secondary{color:#162555;background:rgba(255,255,255,.86)}.junior-primary{border:0;color:#fff;background:linear-gradient(100deg,#2259e9,#3471f5);box-shadow:0 12px 25px rgba(31,85,225,.26)}.junior-primary:disabled{opacity:.55}.junior-report-page .h5-report-header,.junior-report-page>.h5-workbench{display:none}@media(max-width:900px){.junior-report-page{padding:14px}.junior-report-header{height:auto;grid-template-columns:1fr auto;gap:16px;margin-bottom:14px}.junior-step{grid-column:1 / -1;grid-row:2;justify-self:center}.junior-report-columns{grid-template-columns:1fr}.junior-materials{min-height:600px}.junior-idea-card{min-height:430px}.junior-report-footer{grid-template-columns:1fr 1fr}.junior-primary{grid-column:1 / -1}}
/* 高级版：平板横屏创作报告工作台 */
.advanced-report-page{max-width:none!important;min-height: calc(100vh - var(--app-top, 0px));padding:0 20px 24px;background:radial-gradient(circle at 78% 39%,rgba(55,119,255,.13),transparent 25%),linear-gradient(135deg,#f5f9ff 0%,#edf5ff 54%,#f7fbff 100%);color:#10243e}.advanced-report-page .h5-report-header,.advanced-report-page>.h5-workbench{display:none}.advanced-report-workbench{max-width:1600px;margin:0 auto}.advanced-report-header{min-height:78px;display:grid;grid-template-columns:minmax(360px,1fr) auto minmax(360px,1fr);align-items:center;border-bottom:1px solid #dbe8fb}.advanced-brand{display:flex;align-items:center;gap:12px;min-width:0}.advanced-brand-mark{width:45px;height:45px;display:grid;place-items:center;border-radius:50%;background:#ff6a00;color:#fff;font-size:23px;box-shadow:0 8px 20px rgba(255,106,0,.2)}.advanced-brand strong{font-size:23px;letter-spacing:-.5px;white-space:nowrap}.advanced-brand>i{width:1px;height:25px;background:#cbd8ea}.advanced-project-title{overflow:hidden;color:#172a45;font-size:17px;font-weight:800;text-overflow:ellipsis;white-space:nowrap}.advanced-edit-title{border:0;background:transparent;color:#3977ff;font-size:19px;cursor:pointer}.advanced-saved{color:#42708e;font-size:13px;white-space:nowrap}.advanced-saved:first-letter{color:#15a86c}.advanced-steps{margin:0;padding:0;display:flex;gap:34px;list-style:none}.advanced-steps li{width:74px;display:grid;justify-items:center;gap:7px;position:relative;color:#53657d;font-size:12px;font-weight:800;white-space:nowrap}.advanced-steps li:not(:last-child):after{content:"";position:absolute;z-index:0;top:11px;left:52px;width:53px;height:1px;background:#bfd0e8}.advanced-steps b{position:relative;z-index:1;width:23px;height:23px;display:grid;place-items:center;border:1px solid #9bb2d2;border-radius:50%;background:#f7fbff;font-size:13px}.advanced-steps .done b,.advanced-steps .active b{border-color:#147beb;background:#147beb;color:#fff}.advanced-steps .active{color:#147beb}.advanced-steps .done:after{background:#6baaf6}.advanced-header-actions{justify-self:end;display:flex;gap:16px}.advanced-outline-btn,.advanced-primary-btn{min-height:40px;border-radius:8px;padding:0 18px;font-size:15px;font-weight:800;cursor:pointer}.advanced-outline-btn{border:1px solid #b9cae3;background:#fff;color:#152b48}.advanced-primary-btn{border:0;background:#ff6500;color:#fff;box-shadow:0 8px 18px rgba(255,101,0,.18)}.advanced-primary-btn:disabled{cursor:not-allowed;opacity:.6}.advanced-workspace-grid{min-height:calc(100vh - var(--app-top, 0px) - 110px);display:grid;grid-template-columns:24% 36% 40%;gap:10px;padding-top:10px}.advanced-material-panel,.advanced-story-panel,.advanced-preview-panel{min-width:0;border:1px solid #d8e6f6;border-radius:12px;background:rgba(255,255,255,.74);box-shadow:0 10px 32px rgba(34,86,152,.05)}.advanced-material-panel{overflow:hidden}.advanced-tabs{height:54px;display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid #e0ebf7}.advanced-tabs button{border:0;border-bottom:2px solid transparent;background:transparent;color:#344d6c;font-size:15px;font-weight:800;cursor:pointer}.advanced-tabs button.active{border-bottom-color:#176ff5;color:#1268ed}.advanced-completeness{margin:14px;padding:13px 14px;border:1px solid #dbe8fa;border-radius:10px;background:#f8fbff;position:relative}.advanced-completeness>div:first-child{display:flex;justify-content:space-between;align-items:center;color:#314863;font-size:13px;font-weight:800}.advanced-completeness strong{color:#1872ed;font-size:24px}.advanced-completeness i{font-style:normal;color:#7395bb}.advanced-progress{height:6px;margin-top:10px;border-radius:999px;background:#dce9f8;overflow:hidden}.advanced-progress i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#16bee5,#286eff)}.advanced-completeness button{position:absolute;right:13px;bottom:11px;border:1px solid #d4e0ef;border-radius:5px;background:#fff;color:#415b77;font-size:12px;line-height:26px;cursor:pointer}.advanced-add-material{width:calc(100% - 28px);height:33px;margin:0 14px;border:1px solid #1d79f5;border-radius:7px;background:#fff;color:#126dec;font-size:14px;font-weight:800;cursor:pointer}.advanced-material-groups{padding:9px 14px 15px}.advanced-material-group{padding:9px 0;border-bottom:1px solid #edf3fa}.advanced-material-group:last-child{border:0}.advanced-group-title{height:26px;display:flex;align-items:center;gap:7px;color:#1d3552;font-size:14px;font-weight:900}.advanced-group-title small{color:#7b91ad;font-size:12px}.advanced-group-title b{margin-left:auto;color:#2a88ee;font-size:12px}.advanced-group-title button{border:0;background:transparent;color:#58708d;letter-spacing:1px;cursor:pointer}.advanced-material-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.advanced-material-grid.is-wide{grid-template-columns:1fr}.advanced-material-thumb{aspect-ratio:1.3;border:0;border-radius:7px;position:relative;overflow:hidden;background-size:cover;background-position:center;cursor:pointer}.advanced-material-thumb:after{content:"";position:absolute;inset:45% 0 0;background:linear-gradient(transparent,rgba(4,21,44,.68))}.advanced-material-thumb em{position:absolute;z-index:1;left:6px;bottom:5px;color:#fff;font-size:10px;font-style:normal;font-weight:800}.advanced-material-thumb.type-video{aspect-ratio:2}.advanced-play-icon{position:absolute;z-index:1;left:50%;top:50%;width:40px;height:40px;display:grid;place-items:center;transform:translate(-50%,-50%);border:1px solid rgba(255,255,255,.7);border-radius:50%;background:rgba(8,34,69,.56);color:#fff;font-size:14px}.advanced-side-timeline,.advanced-chapter-list{padding:14px;display:grid;gap:8px}.advanced-side-timeline button,.advanced-chapter-list button{padding:10px;border:1px solid #e2ecf8;border-radius:10px;display:flex;gap:10px;align-items:center;background:#fbfdff;text-align:left;color:#19324f;cursor:pointer}.advanced-side-timeline b,.advanced-chapter-list b{width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:#e9f4ff;color:#1477ec;font-size:12px}.advanced-side-timeline span,.advanced-chapter-list span{display:grid;gap:3px}.advanced-side-timeline small,.advanced-chapter-list small{color:#7188a4;font-size:11px}.advanced-chapter-list button.active{border-color:#4e96f5;background:#eef6ff}.advanced-story-panel{padding:18px 20px}.advanced-story-panel>h2,.advanced-preview-title h2{margin:0;color:#162e4a;font-size:19px}.advanced-story-steps{height:100px;margin:14px 0;display:grid;grid-template-columns:repeat(4,1fr);align-items:center;border:1px solid #dce8f6;border-radius:10px;background:#fbfdff}.advanced-story-steps button{height:72px;border:0;border-right:1px solid #d6e3f2;background:transparent;display:grid;justify-items:center;gap:7px;color:#41566f;font-size:12px;cursor:pointer}.advanced-story-steps button:last-child{border:0}.advanced-story-steps i{width:37px;height:37px;display:grid;place-items:center;border:1px solid #dbe7f5;border-radius:50%;background:#fff;font-size:20px;font-style:normal}.advanced-story-steps button.active{color:#146ff2;font-weight:900}.advanced-story-steps button.active i{border:0;background:#1675ef;color:#fff;box-shadow:0 7px 15px rgba(22,117,239,.25)}.advanced-editor-card{min-height:245px;padding:16px;border:1px solid #dce8f5;border-radius:12px;background:#fff;position:relative}.advanced-editor-heading{display:flex;justify-content:space-between;gap:12px;align-items:center}.advanced-editor-heading h3{margin:0;color:#1a3554;font-size:20px}.advanced-editor-heading button{border:1px solid #d7e5f4;border-radius:7px;background:#f9fcff;color:#425a76;font-size:12px;line-height:29px;cursor:pointer}.advanced-editor-card textarea{width:100%;height:160px;margin-top:12px;border:0;outline:0;resize:none;color:#27415c;font-family:inherit;font-size:15px;line-height:1.78}.advanced-count{position:absolute;right:17px;bottom:15px;color:#7b92ae;font-size:12px}.advanced-ai-heading{display:flex;align-items:center;gap:12px;margin:17px 0 10px}.advanced-ai-heading strong{color:#183451;font-size:15px}.advanced-ai-heading span{color:#7d91a9;font-size:11px}.advanced-ai-heading span:first-letter{color:#20a36b}.advanced-ai-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.advanced-ai-actions button{min-height:62px;padding:9px 10px;border:1px solid #d7e3f3;border-radius:10px;display:flex;align-items:center;gap:9px;background:#fbfdff;text-align:left;cursor:pointer}.advanced-ai-actions b{width:26px;height:26px;display:grid;place-items:center;border-radius:8px;font-size:18px}.advanced-ai-actions span{display:grid;gap:3px}.advanced-ai-actions strong{color:#233d5b;font-size:13px}.advanced-ai-actions small{color:#7188a4;font-size:11px}.advanced-ai-actions .polish{border-color:#bdb3ff}.advanced-ai-actions .polish b{color:#7358ff}.advanced-ai-actions .voice{border-color:#a9ccff}.advanced-ai-actions .voice b{color:#1b80ee}.advanced-ai-actions .variations{border-color:#ffc78d}.advanced-ai-actions .variations b{color:#ff7900}.advanced-compare-card{margin-top:12px;border:1px solid #d9e5f2;border-radius:10px;display:grid;grid-template-columns:1fr 24px 1fr;background:#fbfdff}.advanced-compare-card section{padding:11px;min-width:0}.advanced-compare-card section+section{border-left:1px solid #e2ebf5}.advanced-compare-card strong{color:#405570;font-size:12px}.advanced-compare-card p{height:48px;margin:8px 0;color:#35506e;font-size:12px;line-height:1.45;overflow:hidden}.advanced-compare-card>i{align-self:center;justify-self:center;color:#2c619b;font-size:26px;font-style:normal}.advanced-compare-card button{border:0;background:transparent;color:#3874d1;font-size:11px;cursor:pointer}.advanced-journey{margin-top:13px;padding:13px;border:1px solid #dae6f2;border-radius:10px;background:#fff}.advanced-journey h3{margin:0 0 10px;color:#1e3957;font-size:14px}.advanced-journey>div{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}.advanced-journey button{display:grid;justify-items:center;gap:5px;border:0;background:transparent;color:#3a5572;cursor:pointer}.advanced-journey b{width:22px;height:22px;display:grid;place-items:center;border-radius:50%;background:#1676eb;color:#fff;font-size:11px}.advanced-journey span{width:100%;aspect-ratio:1.35;border-radius:5px;background-size:cover;background-position:center}.advanced-journey strong,.advanced-journey small{font-size:10px}.advanced-journey small{color:#7590ac}.advanced-preview-panel{padding:18px 16px 14px;position:relative;overflow:hidden;background:radial-gradient(circle at 47% 41%,rgba(42,190,255,.2),transparent 37%),rgba(255,255,255,.72)}.advanced-preview-panel:before{content:"";position:absolute;inset:15% 0 20%;opacity:.35;background-image:linear-gradient(rgba(27,144,236,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(27,144,236,.12) 1px,transparent 1px);background-size:22px 22px;pointer-events:none}.advanced-preview-title,.advanced-phone-stage,.advanced-preview-pages,.advanced-preview-dots,.advanced-publish-checks{position:relative;z-index:1}.advanced-preview-title{display:flex;justify-content:space-between;align-items:center}.advanced-preview-title div{display:flex;gap:5px}.advanced-preview-title button{width:34px;height:34px;border:1px solid transparent;border-radius:50%;background:transparent;color:#56718f;font-size:21px;cursor:pointer}.advanced-preview-title button.active{border-color:#b9d5fb;background:#f5faff;color:#1476ec}.advanced-phone-stage{height:calc(100vh - var(--app-top, 0px) - 300px);min-height:500px;display:grid;place-items:center}.advanced-phone{width:min(76%,360px);height:92%;min-height:485px;border:6px solid #10243e;border-radius:39px;position:relative;overflow:hidden;background-position:center;background-size:cover;box-shadow:0 0 0 3px rgba(105,223,255,.62),0 15px 35px rgba(19,90,153,.33)}.advanced-phone:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(3,26,70,.36),transparent 42%,rgba(2,19,43,.78))}.advanced-phone-top,.advanced-phone-copy,.advanced-swipe-cue{position:absolute;z-index:1;color:#fff}.advanced-phone-top{top:20px;left:19px;right:19px;display:flex;justify-content:space-between;font-size:22px}.advanced-phone-copy{top:15%;left:25px;right:20px}.advanced-phone-copy h3{margin:0;max-width:260px;color:#fff;font-size:clamp(28px,2.6vw,42px);line-height:1.14;letter-spacing:-1px}.advanced-phone-copy p{max-width:230px;margin:12px 0 0;color:rgba(255,255,255,.9);font-size:13px;line-height:1.6}.advanced-phone-copy>span{display:inline-block;margin-bottom:12px;border:1px solid rgba(255,255,255,.4);border-radius:999px;padding:4px 9px;background:rgba(2,23,59,.38);font-size:11px}.advanced-swipe-cue{left:50%;bottom:22px;transform:translateX(-50%);border:0;background:transparent;color:#fff;font-size:29px;cursor:pointer}.advanced-swipe-cue small{display:block;margin-top:5px;font-size:12px;white-space:nowrap}.advanced-preview-pages{display:grid;grid-template-columns:repeat(5,1fr) 22px;gap:9px;align-items:start}.advanced-preview-pages>button{border:0;background:transparent;display:grid;gap:5px;justify-items:center;color:#56708d;font-size:11px;cursor:pointer}.advanced-preview-pages span{width:100%;aspect-ratio:.82;border:1px solid #d7e4f1;border-radius:7px;background-size:cover;background-position:center}.advanced-preview-pages button.active span{border:2px solid #1477ec;box-shadow:0 0 0 2px rgba(76,179,255,.28)}.advanced-next-page{align-self:center!important;font-size:33px!important}.advanced-preview-dots{display:flex;justify-content:center;gap:9px;margin:12px 0}.advanced-preview-dots i{width:6px;height:6px;border-radius:50%;background:#b8c9dc}.advanced-preview-dots i.active{background:#1679f2}.advanced-publish-checks{display:flex;justify-content:space-between;gap:12px;padding:11px 12px;border:1px solid #d7e7f5;border-radius:10px;background:rgba(255,255,255,.9)}.advanced-publish-checks p{margin:0 0 8px;color:#38516e;font-size:12px;font-weight:800}.advanced-publish-checks p:last-child{margin-bottom:0}.advanced-publish-checks p i{width:18px;height:18px;margin-right:5px;border-radius:50%;display:inline-grid;place-items:center;background:#1977f1;color:#fff;font-style:normal}.advanced-publish-checks p i.green{background:#16a86a}.advanced-publish-checks>div:last-child{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap}.advanced-publish-checks button{border:0;border-left:1px solid #dbe6f2;background:transparent;color:#405b78;font-size:11px;cursor:pointer}.advanced-publish-checks button:first-child{border:1px solid #d5e1ef;border-radius:5px;padding:5px 8px}
.h5-edition-unavailable{min-height:calc(100vh - var(--app-top, 0px) - 120px);display:grid;place-items:center;padding:32px;text-align:center}.h5-edition-unavailable>div{max-width:560px;padding:48px;border:1px solid #dbe8f7;border-radius:24px;background:linear-gradient(150deg,#f5faff,#fff);box-shadow:0 18px 48px rgba(26,76,139,.08)}.h5-edition-unavailable span{display:grid;place-items:center;width:60px;height:60px;margin:0 auto 18px;border-radius:18px;background:#e7f2ff;color:#1677ff;font-size:18px;font-weight:900}.h5-edition-unavailable h1{margin:0;color:#17335a;font-size:28px}.h5-edition-unavailable p{margin:16px auto 26px;color:#6c809d;line-height:1.8}.h5-edition-unavailable button{min-height:42px;border:0;border-radius:10px;padding:0 20px;background:#1677ff;color:#fff;font-weight:900;cursor:pointer}

/* 入门版：6–9 岁平板横屏创作讲述页 */
.junior-report-page {
  --starter-blue: #2683f5;
  --starter-blue-dark: #165ccc;
  --starter-orange: #ff9518;
  --starter-coral: #ff6f61;
  --starter-ink: #17315f;
  --starter-muted: #6c7d9c;
  --starter-line: #dce8f7;
  max-width: none !important;
  min-height: calc(100vh - var(--app-top, 0px));
  padding: 0 26px 18px;
  overflow-x: hidden;
  background:
    radial-gradient(circle at 8% 92%, rgba(255, 196, 121, .18), transparent 18%),
    radial-gradient(circle at 88% 7%, rgba(105, 181, 255, .15), transparent 23%),
    #f8fbff;
  color: var(--starter-ink);
  font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
}
.junior-report-page button,
.junior-report-page textarea { font: inherit; }
.starter-report-workbench {
  width: min(1500px, 100%);
  min-height: calc(100vh - var(--app-top, 0px) - 18px);
  margin: 0 auto;
  display: grid;
  grid-template-rows: 82px minmax(500px, 1fr) 92px;
  gap: 14px;
}
.starter-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  border-bottom: 1px solid var(--starter-line);
}
.starter-header-actions { justify-self: end; display: flex; align-items: center; gap: 14px; }
.starter-save-draft { min-height: 42px; padding: 0 17px; border: 1px solid #cfe0f3; border-radius: 14px; display: flex; align-items: center; gap: 8px; color: #2b507e; background: rgba(255,255,255,.94); font-weight: 800; cursor: pointer; box-shadow: 0 6px 18px rgba(49,98,158,.08); }
.starter-save-draft svg { width: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linejoin: round; }
.starter-back {
  width: 48px;
  height: 48px;
  border: 1px solid #d8e5f4;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--starter-blue);
  background: #fff;
  box-shadow: 0 8px 24px rgba(46, 100, 166, .12);
  cursor: pointer;
}
.starter-back svg,
.starter-secondary svg { width: 24px; fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.starter-progress { display: grid; justify-items: center; gap: 8px; }
.starter-progress h1 { margin: 0; color: var(--starter-ink); font-size: clamp(21px, 2vw, 30px); line-height: 1.15; letter-spacing: -.5px; }
.starter-progress>div { display: flex; align-items: center; }
.starter-progress i {
  width: 19px;
  height: 19px;
  border: 2px solid #c7d2e1;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: #fff;
  font-size: 11px;
  font-style: normal;
}
.starter-progress i.done,
.starter-progress i.current { border-color: var(--starter-blue); background: var(--starter-blue); }
.starter-progress i.current { box-shadow: 0 0 0 5px rgba(38, 131, 245, .13); }
.starter-progress span { width: 56px; height: 2px; background: #cfd9e7; }
.starter-progress i.done+span { background: var(--starter-blue); }
.starter-student { justify-self: end; display: flex; align-items: center; gap: 9px; color: #30476c; font-weight: 800; }
.starter-student b { width: 44px; height: 44px; border: 4px solid #fff; border-radius: 50%; display: grid; place-items: center; color: #fff; background: linear-gradient(145deg, #ff9a5a, #438cf6); box-shadow: 0 5px 14px rgba(35, 96, 174, .2); }
.starter-workspace { min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: 18px; }
.starter-materials,
.starter-narration {
  min-width: 0;
  min-height: 0;
  padding: 20px;
  border: 1px solid #d6e5f6;
  border-radius: 28px;
  background: rgba(255, 255, 255, .92);
  box-shadow: 0 16px 42px rgba(42, 91, 151, .08);
}
.starter-materials { display: grid; grid-template-rows: auto minmax(190px, 1fr) 154px; gap: 14px; background: linear-gradient(145deg, #fff, #f3f8ff); }
.starter-narration { display: grid; grid-template-rows: auto auto minmax(104px, 1fr) auto; gap: 13px; border-color: #f3dfbd; background: linear-gradient(145deg, #fffdf8, #fffaf1); }
.starter-panel-heading { min-height: 48px; display: flex; align-items: center; gap: 12px; }
.starter-heading-icon { width: 40px; height: 40px; border-radius: 13px; display: grid; place-items: center; color: #fff; font-size: 23px; font-weight: 900; }
.starter-heading-icon.materials-icon { background: linear-gradient(145deg, #57a9ff, #287ce9); }
.starter-heading-icon.voice-icon { background: #ff961c; }
.starter-heading-icon svg { width: 24px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
.starter-panel-heading h2 { margin: 0; color: var(--starter-ink); font-size: clamp(21px, 1.75vw, 27px); line-height: 1.15; }
.starter-panel-heading p { margin: 5px 0 0; color: var(--starter-muted); font-size: 13px; }
.starter-panel-heading.orange h2 { color: #cf6607; }
.starter-hero-art { min-height: 0; border: 0; border-radius: 21px; position: relative; overflow: hidden; background-color: #e9f3ff; background-position: center; background-size: cover; box-shadow: inset 0 0 0 1px rgba(255,255,255,.45); cursor: pointer; }
.starter-hero-art:after { content: ""; position: absolute; inset: 56% 0 0; background: linear-gradient(transparent, rgba(13, 36, 74, .72)); }
.starter-hero-art span,
.starter-hero-art small { position: absolute; z-index: 1; left: 16px; color: #fff; }
.starter-hero-art span { bottom: 31px; font-size: 17px; font-weight: 900; }
.starter-hero-art small { bottom: 13px; font-size: 11px; }
.starter-hero-empty { min-height: 0; border: 2px dashed #bcd7f7; border-radius: 21px; display: grid; place-content: center; justify-items: center; gap: 7px; text-align: center; background: #f6fbff; }
.starter-hero-empty>svg { width: 54px; fill: none; stroke: #68a6ee; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.starter-hero-empty strong { font-size: 16px; }
.starter-hero-empty p { margin: 0; color: var(--starter-muted); font-size: 12px; }
.starter-hero-empty button { margin-top: 4px; border: 1px solid var(--starter-blue); border-radius: 999px; padding: 6px 18px; color: var(--starter-blue); background: #fff; font-weight: 800; cursor: pointer; }
.starter-media-grid { min-height: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.starter-media-card { min-width: 0; padding: 10px; border: 1px solid #e0e9f4; border-radius: 18px; display: grid; grid-template-rows: 25px 1fr; gap: 7px; overflow: hidden; color: var(--starter-ink); background: #fff; text-align: left; cursor: pointer; }
.starter-media-card.active { border-color: #5a9df2; box-shadow: 0 0 0 3px rgba(60, 140, 238, .12); }
.starter-media-title { min-width: 0; display: flex; align-items: center; gap: 7px; }
.starter-media-title i { width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center; color: #fff; font-size: 11px; font-style: normal; }
.starter-media-title .cube-icon { background: #3a8ff1; }
.starter-media-title .video-icon { background: #ff6f9e; }
.starter-media-title strong { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.starter-media-title small { margin-left: auto; color: var(--starter-muted); font-size: 11px; white-space: nowrap; }
.starter-media-image { min-height: 0; border-radius: 11px; position: relative; overflow: hidden; display: block; background-position: center; background-size: cover; }
.starter-media-image:after { content: ""; position: absolute; inset: 54% 0 0; background: linear-gradient(transparent, rgba(6, 28, 65, .7)); }
.starter-media-image em { position: absolute; z-index: 1; left: 9px; bottom: 7px; color: #fff; font-size: 10px; font-style: normal; font-weight: 800; }
.starter-play { position: absolute; z-index: 1; left: 50%; top: 50%; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; transform: translate(-50%, -50%); color: #fff; background: rgba(17, 49, 91, .7); font-style: normal; font-size: 13px; }
.starter-empty-state { min-height: 0; border: 1px dashed #b9d5f5; border-radius: 11px; display: grid; grid-template-columns: 31px 1fr auto; align-items: center; gap: 8px; padding: 8px; background: #f7fbff; }
.starter-empty-state>i { width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center; color: var(--starter-blue); background: #e5f2ff; font-style: normal; }
.starter-empty-state strong { font-size: 11px; }
.starter-empty-state em { border-radius: 999px; padding: 5px 8px; color: var(--starter-blue); background: #fff; font-size: 10px; font-style: normal; font-weight: 800; }
.starter-prompt-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.starter-prompt-grid label { min-width: 0; padding: 11px; border: 1px solid #ecdfcf; border-radius: 16px; display: grid; grid-template-columns: 28px 1fr; align-items: center; gap: 5px 8px; background: rgba(255,255,255,.9); box-shadow: 0 6px 17px rgba(101, 75, 38, .05); }
.prompt-icon { width: 28px; height: 28px; border-radius: 10px; display: grid; place-items: center; font-size: 15px; }
.prompt-icon.green { color: #12a46c; background: #def8ed; }
.prompt-icon.coral { color: #f14f70; background: #ffe5eb; }
.prompt-icon.purple { color: #775be7; background: #eee8ff; }
.starter-prompt-grid strong { overflow: hidden; color: #273b5f; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.starter-prompt-grid textarea { grid-column: 1 / -1; width: 100%; min-height: 46px; border: 0; outline: 0; resize: none; overflow: hidden; field-sizing: content; color: #425573; background: transparent; font-size: 12px; line-height: 1.55; }
.starter-prompt-grid textarea::placeholder { color: #9aa6b7; }
.starter-voice-area { min-height: 104px; border-radius: 20px; display: flex; align-items: center; justify-content: center; gap: 24px; background: radial-gradient(circle at 42% 50%, rgba(93, 169, 255, .15), transparent 34%), #fffdf8; }
.starter-mic { width: 91px; height: 91px; flex: 0 0 auto; border: 11px solid #e4f0ff; border-radius: 50%; display: grid; place-items: center; color: #fff; background: linear-gradient(145deg, #39a2ff, #1768e9); box-shadow: 0 12px 26px rgba(29, 110, 222, .26); cursor: pointer; transition: transform .2s ease, box-shadow .2s ease; }
.starter-mic:hover { transform: translateY(-2px); }
.starter-mic svg { width: 36px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
.starter-voice-area.listening .starter-mic { animation: starter-pulse 1.1s ease-in-out infinite; background: linear-gradient(145deg, #ff9870, #ff5e61); }
.starter-voice-area>div { display: grid; gap: 7px; }
.starter-voice-area strong { color: #30476b; font-size: 16px; }
.starter-voice-area span { color: var(--starter-muted); font-size: 12px; }
.starter-summary { min-height: 104px; padding: 12px 14px; border: 1px solid #eadfce; border-radius: 16px; position: relative; display: grid; background: #fff; }
.starter-summary>span { display: flex; align-items: baseline; gap: 8px; }
.starter-summary>span strong { color: #253c61; font-size: 14px; }
.starter-summary>span small { color: var(--starter-muted); font-size: 10px; }
.starter-summary textarea { width: 100%; min-height: 58px; margin-top: 7px; padding: 0 40px 0 0; border: 0; outline: 0; resize: none; overflow: hidden; field-sizing: content; color: #334a6d; background: transparent; font-size: 13px; line-height: 1.7; }
.starter-summary textarea::placeholder { color: #9aa6b7; }
.starter-summary em { position: absolute; right: 13px; bottom: 10px; color: #8a97aa; font-size: 10px; font-style: normal; }
.starter-footer { min-height: 78px; display: grid; grid-template-columns: minmax(410px,1.08fr) minmax(430px,1fr); align-items: center; gap: 14px; }
/* 入门版：AI 伙伴站在最左下角，底部按钮条左边给它让出位置（以前人物压在「3D作品」卡片和风格条上） */
.junior-report-page .starter-footer { padding-left: 92px; }
.junior-report-page .report-agent-dock.is-floating { left: 14px; bottom: 14px; --sa-float-size: 76px; }
.starter-secondary,
.starter-primary { min-height: 60px; border-radius: 18px; display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 17px; font-weight: 900; cursor: pointer; }
.starter-secondary { min-width: 170px; border: 1px solid #d7e2f0; color: #284266; background: rgba(255,255,255,.9); }
.starter-primary { border: 0; color: #fff; background: linear-gradient(110deg, #1d70ec, #2c91ff); box-shadow: 0 12px 25px rgba(31, 112, 229, .25); }
.starter-primary svg { width: 22px; fill: currentColor; stroke: currentColor; }
.starter-primary:disabled { color: #8493a7; background: #e1e7ef; box-shadow: none; cursor: not-allowed; }
.starter-style-panel { min-width: 0; min-height: 64px; padding: 6px 8px; border: 1px solid #8fc2ff; border-radius: 18px; display: grid; grid-template-columns: minmax(170px,.85fr) minmax(200px,1.15fr); align-items: stretch; gap: 8px; background: rgba(255,255,255,.94); box-shadow: 0 7px 20px rgba(43,112,190,.08); }
.starter-style-control { min-width: 0; padding: 0 5px; border: 0; border-radius: 13px; display: grid; grid-template-columns: 48px minmax(0,1fr) auto; align-items: center; gap: 10px; color: var(--starter-ink); background: transparent; text-align: left; }
.starter-style-control.editable { cursor: pointer; }
.starter-style-control>img { width: 44px; height: 44px; border-radius: 12px; object-fit: cover; box-shadow: inset 0 0 0 1px rgba(36,88,143,.08); }
.starter-style-control>span { min-width: 0; display: grid; gap: 2px; }
.starter-style-control small { overflow: hidden; color: var(--starter-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.starter-style-control strong { overflow: hidden; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }
.starter-style-control>b { color: var(--starter-blue); font-size: 25px; }
.starter-style-mode { min-width: 0; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); border: 1px solid #d7e2ef; border-radius: 12px; overflow: hidden; background: #f8fbff; }
.starter-style-mode button { min-width: 0; padding: 0 10px; border: 0; display: flex; align-items: center; justify-content: center; gap: 7px; color: #526984; background: transparent; font-size: 14px; font-weight: 800; cursor: pointer; }
.starter-style-mode button+button { border-left: 1px solid #d7e2ef; }
.starter-style-mode button.active { color: #fff; background: linear-gradient(110deg,#2c8df7,#1680ee); box-shadow: 0 5px 13px rgba(34,126,233,.23); }
.starter-style-mode svg { width: 20px; height: 20px; }
.starter-footer-main { min-width: 0; display: grid!important; grid-template-columns: minmax(155px,.8fr) minmax(190px,1fr); gap: 10px!important; }
.starter-footer-main .starter-primary { min-height: 64px; font-size: 17px; }
.starter-preview-button { min-height: 64px; border: 2px solid #1683f4; border-radius: 18px; display: flex; align-items: center; justify-content: center; gap: 10px; color: #1678df; background: rgba(255,255,255,.95); font-size: 16px; font-weight: 900; cursor: pointer; }
.starter-preview-button svg,.starter-footer-main .starter-primary>svg { width: 24px; height: 24px; }
.starter-preview-button.unavailable,.starter-footer-main .starter-primary.unavailable { opacity: .62; }
.starter-style-overlay { position: fixed; z-index: 40; inset: 0; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(72,120,176,.28); backdrop-filter: blur(7px); }
.starter-style-drawer { width: min(900px,100%); max-height: calc(100vh - 40px); padding: 26px 28px 22px; overflow: hidden; border: 1px solid rgba(185,213,244,.9); border-radius: 30px; background: rgba(255,255,255,.98); box-shadow: 0 28px 80px rgba(29,74,130,.28); }
.starter-style-drawer>header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 17px; text-align: center; }
.starter-style-drawer>header>div { flex: 1; padding-left: 42px; }
.starter-style-drawer h2 { margin: 0; color: var(--starter-ink); font-size: 27px; }
.starter-style-drawer header p { margin: 6px 0 0; color: var(--starter-muted); font-size: 13px; }
.starter-style-drawer header button { width: 42px; height: 42px; flex: 0 0 auto; border: 0; border-radius: 50%; color: #58708e; background: #eef4fb; font-size: 27px; cursor: pointer; }
.starter-style-carousel { position: relative; display: grid; grid-template-columns: 46px minmax(0,1fr) 46px; align-items: center; gap: 9px; }
.starter-carousel-arrow { width: 44px; height: 44px; border: 1px solid #d6e5f5; border-radius: 50%; color: #287bdc; background: #fff; box-shadow: 0 8px 22px rgba(40,105,180,.12); font-size: 31px; line-height: 1; cursor: pointer; }
.starter-carousel-track { min-width: 0; padding: 7px calc(50% - 117px) 11px; display: flex; gap: 15px; overflow-x: auto; scroll-snap-type: x mandatory; scroll-behavior: smooth; scrollbar-width: none; touch-action: pan-x; cursor: grab; }
.starter-carousel-track::-webkit-scrollbar { display: none; }
.starter-carousel-track.dragging { scroll-snap-type: none; scroll-behavior: auto; cursor: grabbing; user-select: none; }
.starter-carousel-track.centered { grid-column: 1 / -1; justify-content: center; padding-inline: 7px; }
.starter-template-card { width: 220px; flex: 0 0 220px; padding: 7px; border: 2px solid transparent; border-radius: 21px; scroll-snap-align: center; color: var(--starter-ink); background: #f7faff; text-align: left; cursor: pointer; transition: border-color .2s ease, transform .2s ease, box-shadow .2s ease; }
.starter-template-card:hover { transform: translateY(-2px); }
.starter-template-card.active { border-color: #2683f5; background: #fff; box-shadow: 0 9px 24px rgba(38,131,245,.17); }
.starter-template-cover { position: relative; height: 236px; display: block; overflow: hidden; border-radius: 15px; background: #edf4fb; }
.starter-template-cover img { width: 100%; height: 100%; display: block; object-fit: cover; pointer-events: none; }
.starter-template-cover i { position: absolute; top: 9px; right: 9px; width: 29px; height: 29px; border: 3px solid #fff; border-radius: 50%; display: grid; place-items: center; color: #fff; background: #2683f5; box-shadow: 0 5px 15px rgba(26,83,158,.28); font-size: 14px; font-style: normal; font-weight: 900; }
.starter-template-copy { min-width: 0; padding: 10px 7px 5px; display: grid; gap: 4px; text-align: center; }
.starter-template-copy strong { font-size: 16px; }
.starter-template-copy small { overflow: hidden; color: var(--starter-muted); font-size: 10px; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
.starter-carousel-dots { min-height: 20px; margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 7px; }
.starter-carousel-dots button { width: 7px; height: 7px; padding: 0; border: 0; border-radius: 50%; background: #c9d6e5; cursor: pointer; transition: width .2s ease, background .2s ease; }
.starter-carousel-dots button.active { width: 22px; border-radius: 999px; background: #2683f5; }
.starter-style-drawer>footer { margin-top: 11px; padding-top: 16px; border-top: 1px solid #e7eef6; display: flex; align-items: center; justify-content: space-between; }
.starter-style-drawer>footer p { margin: 0; color: var(--starter-muted); font-size: 14px; }
.starter-style-drawer>footer strong { color: var(--starter-ink); font-size: 16px; }
.starter-use-style { min-width: 188px; min-height: 48px; border: 0; border-radius: 15px; color: #fff; background: linear-gradient(110deg,#1d70ec,#2c91ff); box-shadow: 0 10px 22px rgba(31,112,229,.24); font-size: 16px; font-weight: 900; cursor: pointer; }

/* 入门版：第 3 步本地 H5 效果预览 */
.starter-preview-workbench { width: min(1440px,100%); min-height: calc(100vh - var(--app-top, 0px) - 18px); margin: 0 auto; display: grid; grid-template-rows: 78px minmax(430px,1fr) 74px; gap: 10px; color: var(--preview-text); }
.starter-shared-preview { min-height: 0; display: grid; place-items: center; padding: 0 7%; overflow: auto; }.starter-shared-preview :deep(.report-renderer) { width: min(100%, 350px); }.starter-shared-preview :deep(.device-phone .report-device-frame) { width: min(100%, 350px); min-height: 520px; border-radius: 34px; }.starter-shared-preview :deep(.device-phone .report-page) { min-height: 380px; padding: 24px 20px; }.starter-shared-preview :deep(.device-phone .report-art),.starter-shared-preview :deep(.device-phone .report-empty) { min-height: 185px; }.starter-shared-preview :deep(.device-phone .report-copy h2) { font-size: 30px; }
.starter-preview-header { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; border-bottom: 1px solid color-mix(in srgb,var(--preview-primary) 18%,#dce8f7); }
.starter-preview-style { justify-self: end; min-width: 150px; padding: 8px 13px; border: 1px solid rgba(125,151,184,.25); border-radius: 15px; display: grid; background: rgba(255,255,255,.82); }
.starter-preview-style small { color: #7b8ba0; font-size: 10px; }
.starter-preview-style strong { font-size: 13px; }
.starter-preview-stage { min-height: 0; display: grid; grid-template-columns: 52px minmax(0,1fr) 52px; align-items: center; gap: 12px; }
.starter-page-arrow { width: 48px; height: 72px; border: 1px solid rgba(75,116,164,.2); border-radius: 18px; color: var(--preview-primary); background: rgba(255,255,255,.82); font-size: 42px; cursor: pointer; box-shadow: 0 8px 24px rgba(35,83,141,.08); }
.starter-page-arrow:disabled { opacity: .28; cursor: default; }
.starter-story-page { height: 100%; min-height: 370px; max-height: 560px; padding: clamp(26px,4vw,62px); border: 8px solid #fff; border-radius: 34px; position: relative; overflow: hidden; display: grid; grid-template-columns: minmax(260px,.82fr) minmax(300px,1.18fr); gap: clamp(24px,4vw,64px); align-items: center; background: linear-gradient(135deg,color-mix(in srgb,var(--preview-secondary) 35%,white),var(--preview-bg) 52%,color-mix(in srgb,var(--preview-accent) 18%,white)); box-shadow: 0 18px 50px rgba(34,79,137,.16); }
.starter-story-page:before { content:""; position:absolute; width:240px; height:240px; right:-90px; top:-100px; border:2px solid rgba(255,255,255,.72); border-radius:50%; box-shadow:0 0 0 32px rgba(255,255,255,.13); }
.starter-story-copy { z-index:1; min-width:0; }
.starter-story-copy>span { display:inline-block; margin-bottom:12px; border-radius:999px; padding:7px 12px; color:var(--preview-primary); background:rgba(255,255,255,.74); font-size:12px; font-weight:900; }
.starter-story-copy h2 { margin:0; color:var(--preview-text); font-size:clamp(30px,4vw,58px); line-height:1.08; letter-spacing:-1.5px; }
.starter-story-copy p { margin:20px 0 0; color:color-mix(in srgb,var(--preview-text) 76%,white); font-size:clamp(15px,1.6vw,21px); font-weight:700; line-height:1.85; }
.starter-story-copy small { display:block; margin-top:22px; color:color-mix(in srgb,var(--preview-primary) 72%,#6c7d9c); font-weight:900; }
.starter-story-art,.starter-story-empty { z-index:1; width:100%; height:100%; min-height:290px; border-radius:28px; position:relative; overflow:hidden; background-position:center; background-size:cover; box-shadow:0 16px 36px rgba(25,67,119,.2); }
.starter-story-art:after { content:""; position:absolute; inset:65% 0 0; background:linear-gradient(transparent,rgba(11,31,59,.64)); }
.starter-story-art>i { position:absolute; z-index:1; right:17px; bottom:15px; border-radius:999px; padding:7px 12px; color:#fff; background:rgba(18,49,86,.55); font-size:12px; font-style:normal; font-weight:900; }
.starter-story-empty { display:grid; place-content:center; justify-items:center; gap:10px; color:var(--preview-primary); background:rgba(255,255,255,.66); box-shadow:inset 0 0 0 2px rgba(255,255,255,.8); text-align:center; }
.starter-story-empty b { width:74px; height:74px; border-radius:24px; display:grid; place-items:center; color:#fff; background:linear-gradient(145deg,var(--preview-primary),var(--preview-accent)); font-size:33px; }
.starter-story-empty strong { color:var(--preview-text); font-size:19px; }
.starter-story-empty span { max-width:240px; color:#728299; font-size:13px; line-height:1.6; }
.starter-story-sticker { position:absolute; z-index:0; color:var(--preview-accent); font-style:normal; }
.starter-story-sticker.one { left:42%; top:8%; font-size:35px; transform:rotate(12deg); }
.starter-story-sticker.two { left:4%; bottom:7%; opacity:.25; font-size:56px; }
.starter-preview-thumbs { display:flex; align-items:center; justify-content:center; gap:13px; }
.starter-preview-thumbs button { width:92px; border:0; display:grid; grid-template-columns:46px 1fr; align-items:center; gap:7px; color:#6f8098; background:transparent; cursor:pointer; text-align:left; }
.starter-preview-thumbs i { width:46px; height:58px; border:2px solid transparent; border-radius:9px; display:grid; place-items:center; color:var(--preview-primary); background:#fff; background-position:center; background-size:cover; font-size:18px; font-style:normal; box-shadow:0 5px 14px rgba(31,72,122,.1); }
.starter-preview-thumbs button.active { color:var(--preview-primary); font-weight:900; }
.starter-preview-thumbs button.active i { border-color:var(--preview-primary); box-shadow:0 0 0 4px color-mix(in srgb,var(--preview-primary) 12%,transparent); }
.starter-preview-thumbs span { font-size:12px; }
.starter-preview-footer { display:grid; grid-template-columns:minmax(220px,.65fr) minmax(340px,1fr); justify-content:end; gap:14px; padding-left:42%; }
.starter-preview-footer .starter-primary,.starter-preview-footer .starter-secondary { min-height:58px; }
@keyframes starter-pulse { 50% { transform: scale(1.05); box-shadow: 0 0 0 11px rgba(255, 111, 97, .13), 0 12px 26px rgba(255, 94, 97, .23); } }
@media (max-width: 1050px) {
  .junior-report-page { padding-inline: 14px; }
  .starter-report-workbench { grid-template-rows: 72px minmax(480px, 1fr) 82px; gap: 10px; }
  .starter-workspace { gap: 12px; }
  .starter-materials,.starter-narration { padding: 15px; border-radius: 22px; }
  .starter-materials { grid-template-rows: auto minmax(170px, 1fr) 142px; gap: 10px; }
  .starter-narration { gap: 9px; }
  .starter-panel-heading p { display: none; }
  .starter-panel-heading h2 { font-size: 21px; }
  .starter-prompt-grid { gap: 7px; }
  .starter-prompt-grid label { padding: 8px; grid-template-columns: 25px 1fr; }
  .prompt-icon { width: 25px; height: 25px; }
  .starter-prompt-grid strong { font-size: 11px; }
  .starter-voice-area { min-height: 94px; gap: 15px; }
  .starter-mic { width: 78px; height: 78px; border-width: 9px; }
  .starter-summary { min-height: 94px; }
  .starter-footer { grid-template-columns: minmax(410px,1fr) minmax(430px,1fr); gap:8px; }
  .starter-secondary { min-width: 0; padding-inline:12px; font-size:14px; }
  .starter-style-panel { padding:5px 6px; gap:6px; }
  .starter-style-control { padding:0 4px; }
  .starter-style-control strong { font-size:14px; }
  .starter-style-mode button { padding-inline:6px; font-size:12px; }
  .starter-footer-main { grid-template-columns:minmax(145px,.82fr) minmax(175px,1fr); gap:7px!important; }
  .starter-preview-button,.starter-footer-main .starter-primary { font-size:13px; }
  .starter-story-page { padding:28px; grid-template-columns:minmax(230px,.82fr) minmax(280px,1.18fr); gap:26px; }
  .starter-preview-footer { padding-left:34%; }
}
@media (max-height: 740px) and (orientation: landscape) {
  .starter-report-workbench { grid-template-rows: 66px minmax(450px, 1fr) 72px; gap: 8px; }
  .starter-header { min-height: 66px; }
  .starter-back { width: 42px; height: 42px; }
  .starter-student b { width: 39px; height: 39px; }
  .starter-materials,.starter-narration { padding: 13px; }
  .starter-materials { grid-template-rows: 39px minmax(156px, 1fr) 132px; gap: 8px; }
  .starter-narration { grid-template-rows: 39px auto minmax(86px, 1fr) auto; gap: 7px; }
  .starter-heading-icon { width: 34px; height: 34px; border-radius: 11px; font-size: 19px; }
  .starter-panel-heading h2 { font-size: 19px; }
  .starter-prompt-grid textarea { min-height: 36px; line-height: 1.35; }
  .starter-voice-area { min-height: 82px; }
  .starter-mic { width: 70px; height: 70px; }
  .starter-summary { min-height: 84px; padding: 9px 12px; }
  .starter-summary textarea { min-height: 45px; line-height: 1.45; }
  .starter-secondary,.starter-primary { min-height: 54px; }
  .starter-save-draft { min-height: 38px; padding-inline: 13px; }
  .starter-style-drawer { width: min(820px,100%); padding: 18px 22px 15px; border-radius: 25px; }
  .starter-style-drawer>header { margin-bottom: 8px; }
  .starter-style-drawer h2 { font-size: 23px; }
  .starter-template-card { width: 205px; flex-basis: 205px; }
  .starter-template-cover { height: 218px; }
  .starter-carousel-track { padding-inline: calc(50% - 109px); gap: 12px; }
  .starter-style-drawer>footer { margin-top: 5px; padding-top: 10px; }
  .starter-use-style { min-height: 44px; }
  .starter-preview-workbench { grid-template-rows:66px minmax(350px,1fr) 62px; gap:7px; }
  .starter-shared-preview { padding:0 3%; }.starter-shared-preview :deep(.report-renderer) { width:min(100%,285px); }.starter-shared-preview :deep(.device-phone .report-device-frame) { width:min(100%,285px); min-height:360px; border-radius:28px; }.starter-shared-preview :deep(.device-phone .report-page) { min-height:255px; padding:18px; }.starter-shared-preview :deep(.device-phone .report-art),.starter-shared-preview :deep(.device-phone .report-empty) { min-height:125px; }.starter-shared-preview :deep(.device-phone .report-copy h2) { font-size:24px; }
  .starter-preview-stage { grid-template-columns:44px minmax(0,1fr) 44px; gap:7px; }
  .starter-page-arrow { width:40px; height:62px; }
  .starter-story-page { min-height:350px; max-height:440px; padding:25px; border-width:6px; border-radius:27px; }
  .starter-story-art,.starter-story-empty { min-height:250px; border-radius:21px; }
  .starter-story-copy p { margin-top:13px; line-height:1.65; }
  .starter-story-copy small { margin-top:12px; }
  .starter-preview-thumbs i { width:42px; height:50px; }
  .starter-preview-thumbs button { width:84px; grid-template-columns:42px 1fr; }
  .starter-preview-footer .starter-primary,.starter-preview-footer .starter-secondary { min-height:52px; }
}

/* 高级版：按确认效果图重构为素材、叙事、报告设置三栏工作台。 */
/* 页面外层不做高度约束：高级版自己的工作台是「顶栏 + 三栏网格」的竖排盒子，
   高度由工作台自己按视口算（见 .advanced-report-workbench）。
   这里只保留内边距；padding-bottom 让三栏不贴屏幕底，和左右留白一致。 */
.advanced-report-page { padding: 0 18px 16px; background: #f3f8ff; }
/* 页面容器不用管高度：高级版自己的工作台（.advanced-report-workbench）自己按视口算。 */
.advanced-report-workbench {
  max-width: 1540px;
  /* 工作台高度 = 视口 - 16（只有 <main> 的底部内边距）。
     ⚠ 不要减 112/128：这个页面是独立路由，直接挂在根 RouterView 上，
       外层没有「用户端外框顶栏」，<main> 从屏幕最顶上（y=0）开始。
       减掉 128 会在页面底部凭空留出一条 128px 的空白带，
       三栏面板全部悬空、不贴底（用户截图反馈的就是这一条）。
     只减 padding-bottom：工作台底边 + 16px = 屏幕底，和左右 18px 留白对称。
     --adv-header-h 由脚本用 ResizeObserver 实时写回顶栏真实高度。 */
  height: calc(100vh - var(--app-top, 0px) - 16px);
  min-height: 0;
  display: flex;
  flex-direction: column;
  --adv-header-h: 58px;
}
.advanced-report-header {
  flex: 0 0 auto;
  /* 全站统一导航条 58px（原 76）。顶栏里最高的元素是 45px 的品牌圆标和 40px 的按钮，
     58px 装得下，不会再被内容顶高。 */
  min-height: 58px;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 16px;
}
/* 返回按钮：高级版是从「我的作品 / 报告列表」点进来的，没有这个按钮用户只能去点浏览器后退 */
.advanced-back {
  flex: 0 0 auto;
  height: 34px;
  min-height: 0;
  padding: 0 12px 0 9px;
  border: 1px solid #d3e2f5;
  border-radius: 99px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #fff;
  color: #29496e;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}
.advanced-back:hover { border-color: #b6cde9; background: #f4f9ff; color: #1477ec; }
.advanced-back:focus-visible { outline: 2px solid #1768d4; outline-offset: 2px; }
.advanced-back svg { width: 15px; height: 15px; }
.advanced-brand-mark svg { width: 23px; height: 23px; }
.advanced-edit-title { width: 22px; height: 22px; display: grid; place-items: center; }
.advanced-edit-title svg { width: 16px; height: 16px; }
.advanced-saved { display: inline-flex; align-items: center; gap: 5px; }
.advanced-saved svg { width: 14px; height: 14px; color: #17a66b; }
.advanced-steps b svg { width: 13px; height: 13px; }
.advanced-header-actions { gap: 10px; }
.advanced-workspace-grid { height: calc(100vh - var(--app-top, 0px) - 94px); min-height: 620px; grid-template-columns: minmax(250px,24%) minmax(360px,36%) minmax(390px,40%); gap: 10px; padding-top: 8px; }
.advanced-material-panel,.advanced-story-panel,.advanced-settings-panel { height: 100%; min-height: 0; }
.advanced-material-panel,.advanced-story-panel { overflow: auto; scrollbar-width: thin; scrollbar-color: #c5d8f0 transparent; }
.advanced-add-material { display: flex; align-items: center; justify-content: center; gap: 6px; }
.advanced-add-material svg { width: 16px; height: 16px; }
.advanced-group-title b,.advanced-group-title button { display: grid; place-items: center; }
.advanced-group-title b svg,.advanced-group-title button svg { width: 14px; height: 14px; }
.advanced-play-icon svg { width: 18px; height: 18px; }
.advanced-story-steps i svg { width: 20px; height: 20px; }
.advanced-editor-heading button { display: inline-flex; align-items: center; gap: 5px; padding: 0 9px; }
.advanced-editor-heading button svg { width: 14px; height: 14px; }
.advanced-ai-heading span { display: inline-flex; align-items: center; gap: 5px; }
.advanced-ai-heading span svg { width: 13px; height: 13px; color: #18a56b; }
.advanced-ai-actions b svg { width: 20px; height: 20px; }

.advanced-settings-panel { padding: 0; display: flex; flex-direction: column; overflow: hidden; background: rgba(255,255,255,.9); }
.advanced-settings-panel::before { display: none; }
.advanced-settings-heading { min-height: 74px; padding: 17px 20px; border-bottom: 1px solid #e1ebf7; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.advanced-settings-heading h2 { margin: 0; color: #162e4a; font-size: 19px; }
.advanced-settings-heading p { margin: 5px 0 0; color: #7b90a9; font-size: 11px; }
.advanced-settings-heading>span { flex: 0 0 auto; border-radius: 999px; padding: 5px 9px; color: #146ff2; background: #eef6ff; font-size: 11px; font-weight: 800; }
.advanced-style-section { flex: 1 1 auto; min-height: 270px; padding: 18px 20px 12px; border-bottom: 1px solid #e3edf8; overflow: hidden; }
.advanced-section-title { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.advanced-section-title>div { display: grid; gap: 4px; }
.advanced-section-title strong { color: #17304d; font-size: 16px; }
.advanced-section-title small { color: #7d91aa; font-size: 11px; }
.advanced-section-title>button { border: 0; display: inline-flex; align-items: center; gap: 4px; color: #62809f; background: transparent; font-size: 12px; cursor: pointer; }
.advanced-section-title>button svg { width: 14px; height: 14px; }
.advanced-template-carousel { margin-top: 17px; display: grid; grid-template-columns: 28px minmax(0,1fr) 28px; align-items: center; gap: 7px; }
.advanced-template-arrow { width: 28px; height: 54px; border: 1px solid #d9e6f5; border-radius: 10px; display: grid; place-items: center; color: #37658f; background: #fff; cursor: pointer; }
.advanced-template-arrow svg { width: 16px; height: 16px; }
.advanced-template-track { min-width: 0; display: flex; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; }
.advanced-template-track::-webkit-scrollbar { display: none; }
.advanced-template-card { flex: 0 0 clamp(108px,28%,142px); min-width: 0; border: 1px solid #d9e6f3; border-radius: 12px; padding: 5px; display: grid; gap: 7px; color: #536c87; background: #fff; cursor: pointer; scroll-snap-align: center; transition: border-color .18s ease,box-shadow .18s ease,transform .18s ease; }
.advanced-template-card:hover { transform: translateY(-2px); border-color: #8ebcff; }
.advanced-template-card:focus-visible,.advanced-independent-preview:focus-visible,.advanced-generate-report:focus-visible { outline: 3px solid rgba(32,123,245,.25); outline-offset: 2px; }
.advanced-template-card.active { border: 2px solid #1677f2; padding: 4px; color: #126eea; box-shadow: 0 7px 18px rgba(30,115,231,.16); }
.advanced-template-card:disabled { cursor: not-allowed; opacity: .52; }
.advanced-template-cover { height: clamp(150px,21vh,225px); border-radius: 8px; position: relative; overflow: hidden; display: block; background-position: center; background-size: cover; }
.advanced-template-cover::after { content: ''; position: absolute; inset: 60% 0 0; background: linear-gradient(transparent,rgba(5,24,52,.55)); }
.advanced-template-cover em { position: absolute; z-index: 2; top: 8px; left: 8px; border-radius: 999px; padding: 4px 7px; color: #fff; background: #1b73f1; font-size: 10px; font-style: normal; font-weight: 900; }
.advanced-template-cover b { position: absolute; z-index: 2; top: 7px; right: 7px; width: 25px; height: 25px; border-radius: 50%; display: grid; place-items: center; color: #fff; background: #1478f3; box-shadow: 0 4px 12px rgba(17,94,210,.3); }
.advanced-template-cover b svg { width: 15px; height: 15px; }
.advanced-template-card>strong { padding-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.advanced-template-dots { height: 20px; display: flex; justify-content: center; align-items: end; gap: 7px; }
.advanced-template-dots button { width: 6px; height: 6px; border: 0; border-radius: 999px; padding: 0; background: #b7c9dd; cursor: pointer; transition: width .18s ease,background .18s ease; }
.advanced-template-dots button.active { width: 18px; background: #1b76ee; }
.advanced-current-template { flex: 0 0 auto; margin: 0 20px; padding: 15px 0; border-bottom: 1px solid #e3edf8; }
.advanced-story-fill-section { flex: 0 0 auto; margin: 0 20px; padding: 14px 0 15px; border-bottom: 1px solid #e3edf8; }
.advanced-fill-heading { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.advanced-fill-heading div { display: grid; gap: 4px; }
.advanced-fill-heading strong { color: #203c5d; font-size: 13px; }
.advanced-fill-heading small { color: #7d91aa; font-size: 11px; line-height: 1.45; }
.advanced-fill-heading>span { flex: 0 0 auto; border-radius: 999px; padding: 4px 7px; color: #1175e9; background: #edf6ff; font-size: 10px; font-weight: 800; }
.advanced-fill-mode { margin-top: 11px; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 7px; }
.advanced-fill-mode button { min-height: 30px; border: 1px solid #d6e3f2; border-radius: 7px; color: #536c88; background: #fff; font-size: 11px; font-weight: 800; cursor: pointer; }
.advanced-fill-mode button.active { border-color: #2782ee; color: #0d6fe9; background: #eef7ff; box-shadow: inset 0 0 0 1px rgba(39,130,238,.12); }
.advanced-manual-fill { margin-top: 11px; border-radius: 9px; padding: 10px; background: #f7fbff; }
.advanced-manual-fill label { display: flex; align-items: center; gap: 8px; color: #4e6681; font-size: 11px; font-weight: 800; }
.advanced-manual-fill select { min-width: 0; flex: 1; height: 28px; border: 1px solid #cedfed; border-radius: 6px; padding: 0 6px; color: #294865; background: #fff; font: inherit; }
.advanced-manual-fill p { margin: 8px 0; color: #7188a4; font-size: 10px; line-height: 1.55; }
.advanced-manual-assets { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 6px; }
.advanced-manual-assets button { aspect-ratio: 1.15; border: 1px solid transparent; border-radius: 6px; position: relative; overflow: hidden; background-position: center; background-size: cover; cursor: pointer; }
.advanced-manual-assets button::after { content: ''; position: absolute; inset: 45% 0 0; background: linear-gradient(transparent,rgba(10,30,59,.8)); }
.advanced-manual-assets button.active { border: 2px solid #1479ee; box-shadow: 0 0 0 2px rgba(20,121,238,.14); }
.advanced-manual-assets span { position: absolute; z-index: 1; right: 4px; bottom: 3px; left: 4px; overflow: hidden; color: #fff; font-size: 9px; font-weight: 800; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.advanced-current-title { display: flex; align-items: center; gap: 12px; }
.advanced-current-title span { color: #7388a2; font-size: 12px; }
.advanced-current-title strong { color: #17304d; font-size: 15px; }
.advanced-template-meta { margin-top: 13px; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 11px 14px; }
.advanced-template-meta span { min-width: 0; display: grid; grid-template-columns: 18px auto minmax(0,1fr); align-items: center; gap: 6px; color: #3577d4; }
.advanced-template-meta svg { width: 16px; height: 16px; }
.advanced-template-meta b { color: #435b76; font-size: 11px; white-space: nowrap; }
.advanced-template-meta em { overflow: hidden; color: #7b91a9; font-size: 11px; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
.advanced-generate-section { flex: 0 0 auto; padding: 15px 20px 17px; }
.advanced-generate-section h3 { margin: 0 0 12px; color: #18314e; font-size: 14px; }
.advanced-generate-actions { display: grid; grid-template-columns: minmax(0,.92fr) minmax(0,1.08fr); gap: 12px; }
.advanced-independent-preview,.advanced-generate-report { min-width: 0; min-height: 76px; border-radius: 12px; padding: 10px 13px; display: flex; align-items: center; justify-content: center; gap: 10px; text-align: left; cursor: pointer; }
.advanced-independent-preview { border: 1.5px solid #1678f3; color: #126eea; background: #fff; }
.advanced-generate-report { border: 0; color: #fff; background: #ff6900; box-shadow: 0 9px 22px rgba(255,105,0,.2); }
.advanced-independent-preview>svg,.advanced-generate-report>svg { flex: 0 0 auto; width: 23px; height: 23px; }
.advanced-independent-preview span,.advanced-generate-report span { min-width: 0; display: grid; gap: 4px; }
.advanced-independent-preview strong,.advanced-generate-report strong { font-size: 15px; white-space: nowrap; }
.advanced-independent-preview small { color: #718aa5; font-size: 10px; }
.advanced-generate-report small { color: rgba(255,255,255,.84); font-size: 10px; }
.advanced-generate-report:disabled { cursor: wait; opacity: .65; }
.advanced-generate-note { margin: 11px 0 0; display: flex; align-items: flex-start; gap: 6px; color: #7790aa; font-size: 10px; line-height: 1.45; }
.advanced-generate-note svg { flex: 0 0 auto; width: 14px; height: 14px; color: #4c83c8; }
.product-story-export-stage { position: fixed; left: -10000px; top: 0; width: 390px; display: grid; gap: 20px; pointer-events: none; }

@media (max-width: 1180px) and (orientation: landscape) {
  .advanced-report-page { padding-inline: 10px; }
  .advanced-report-header { grid-template-columns: auto minmax(0, 1fr) auto auto; gap: 8px; }
  .advanced-brand strong { font-size: 18px; }
  .advanced-project-title,.advanced-edit-title,.advanced-saved,.advanced-brand>i { display: none; }
  .advanced-steps { gap: 10px; }
  .advanced-steps li { width: 62px; font-size: 10px; }
  .advanced-steps li:not(:last-child)::after { left: 44px; width: 38px; }
  .advanced-outline-btn { padding-inline: 12px; font-size: 13px; }
  .advanced-workspace-grid { grid-template-columns: minmax(205px,28%) minmax(300px,39%) minmax(280px,33%); }
  .advanced-story-panel { padding: 13px; }
  .advanced-story-steps { height: 80px; margin: 10px 0; }
  .advanced-story-steps button { height: 62px; }
  .advanced-editor-card { min-height: 200px; padding: 12px; }
  .advanced-editor-card textarea { height: 125px; font-size: 13px; }
  .advanced-ai-heading { margin: 12px 0 8px; }
  .advanced-ai-actions button { min-height: 54px; padding: 7px; }
  .advanced-ai-actions small { display: none; }
  .advanced-compare-card { display: none; }
  .advanced-journey { margin-top: 9px; padding: 9px; }
  .advanced-settings-heading,.advanced-style-section,.advanced-generate-section { padding-inline: 13px; }
  .advanced-current-template { margin-inline: 13px; }
  .advanced-story-fill-section { margin-inline: 13px; }
  .advanced-style-section { min-height: 238px; }
  .advanced-template-carousel { grid-template-columns: 23px minmax(0,1fr) 23px; gap: 4px; }
  .advanced-template-arrow { width: 23px; }
  .advanced-template-card { flex-basis: 104px; }
  .advanced-template-cover { height: 150px; }
  .advanced-template-meta { grid-template-columns: 1fr; gap: 7px; }
  .advanced-template-meta span:nth-child(n+3) { display: none; }
  .advanced-generate-actions { gap: 7px; }
  .advanced-independent-preview,.advanced-generate-report { min-height: 68px; padding: 8px; gap: 6px; }
  .advanced-independent-preview>svg,.advanced-generate-report>svg { width: 19px; height: 19px; }
  .advanced-independent-preview strong,.advanced-generate-report strong { font-size: 12px; }
  .advanced-generate-note { display: none; }
}

@media (max-height: 760px) and (orientation: landscape) {
  .advanced-report-header { min-height: 58px; }
  .advanced-workspace-grid { height: calc(100vh - var(--app-top, 0px) - 78px); min-height: 560px; }
  .advanced-tabs { height: 45px; }
  .advanced-completeness { margin: 9px 12px; padding: 8px 10px; }
  .advanced-completeness strong { font-size: 20px; }
  .advanced-material-groups { padding-top: 4px; }
  .advanced-material-group { padding: 5px 0; }
  .advanced-settings-heading { min-height: 58px; padding-block: 11px; }
  .advanced-settings-heading p { display: none; }
  .advanced-style-section { min-height: 215px; padding-top: 12px; }
  .advanced-template-carousel { margin-top: 10px; }
  .advanced-template-cover { height: 132px; }
  .advanced-current-template { padding-block: 10px; }
  .advanced-template-meta { margin-top: 8px; }
  .advanced-generate-section { padding-block: 10px 12px; }
  .advanced-generate-section h3 { margin-bottom: 8px; }
  .advanced-independent-preview,.advanced-generate-report { min-height: 58px; }
}

@media (prefers-reduced-motion: reduce) { .starter-mic { transition: none; } .starter-voice-area.listening .starter-mic { animation: none; } }
.strategy-choice-list { display: grid; gap: 8px; }.strategy-choice-list button { display: grid; gap: 4px; width: 100%; border: 1px solid #dce6f4; border-radius: 9px; padding: 9px 10px; background: #fff; color: #345071; text-align: left; cursor: pointer; }.strategy-choice-list button.active { border-color: #1677ff; background: #edf5ff; color: #1559b4; }.strategy-choice-list small { color: #8392a8; font-size: 11px; }.strategy-choice-warning,.strategy-workflow-status { margin: 9px 0 0; color: #b45309; font-size: 12px; line-height: 1.5; }.strategy-workflow-status { color: #1768d4; }.advanced-strategy-choice { min-height: 0; }.advanced-strategy-choice .strategy-choice-list { display: flex; flex-wrap: wrap; margin-top: 12px; }.advanced-strategy-choice .strategy-choice-list button { width: auto; min-width: 180px; }

/* ===== 高级版三栏工作台：风格模板 / 创作素材 / 创作叙事 + 提示词 ===== */
.advanced-report-page .ar-grid {
  display: grid;
  /* 左栏宽度是从 9:16 手机框反推出来的，不是拍脑袋定的。
     反推链（全部按实测的盒子关系，改任何一个环节都要重算）：
       栏高 = 100vh - 16（<main> 底部内边距）- 顶栏高 - 8（网格上游那条缝）
       栏内可用高 = 栏高 - 2（栏自身上下边框）
       手机框高 = 栏内可用高 - 20（风格条上下内边距 10+10）
       手机框宽 = 手机框高 × 9/16
       栏宽 = 手机框宽 + 10 + 10（风格条内边距）+ 2（栏边框）
     ⇒ 栏宽 = (100vh - 16 - 顶栏 - 8 - 2 - 20) × 0.5625 + 22
     顶栏现在全站统一 58，按 58 算 ⇒ 100vh - 104，再留 10px 余量写成 100vh - 94：
     这样算出来的栏宽只会比需要的大 5~6px（卡贴左、右边剩一丁点留白），
     反过来按 58 算足，窄屏顶栏折行时会窄 6px 把卡右边切掉一条 —— 宁可松一点也不能裁。
     ⚠ 顶栏从 76 改到 58 时这条算式必须一起改：顶栏矮 18px，栏高就长 18px，
       9:16 的框跟着变宽，算式不跟就会横向溢出、卡被切一刀。
       ../../scripts/verify-ar-layout-tweaks.mjs 里有「卡是否按 9:16 铺满且不溢出」的断言。 */
  grid-template-columns:
    clamp(266px, calc((100vh - var(--app-top, 0px) - 94px) * 0.5625 + 22px), 580px)
    minmax(0, 1fr)
    minmax(300px, 1fr);
  /* 只剩一行：原来第 2 行是左下角「小画同学」向导卡，卡片已删除，再留 auto 行会撑出一块空白 */
  grid-template-rows: minmax(0, 1fr);
  gap: 10px;
  /* 网格高度 = 工作台高度 - 顶栏真实高度 - 顶部 8px 缝。
     工作台高度 = 视口 - 112（用户端顶栏/页面留白 96 + 本页底部内边距 16）。
     不能再按「100vh 减一个写死的 110」算：顶栏在窄屏/矮屏会折成两行（实测 720 高时顶栏 123），
     少减那 13px 就会让整页比屏幕高，右栏底部的「生成 H5 报告」被顶出屏幕外。 */
  height: calc(100% - var(--adv-header-h) - 8px);
  /* 兜底高度只防「算出负数/塌成一条」这种极端情况，不能再有 380 这种大数：
     520 高的窗口里工作台只有 408，网格保底 380 会直接把底部按钮顶出屏幕。
     三栏内容自己都会收缩（叙事框、提示词框都有 min-height + 溢出滚动），不靠网格撑。 */
  min-height: 260px;
  margin-top: 8px;
}
.ar-left { grid-column: 1; grid-row: 1; }
.ar-panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #dbe8fb;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(34, 86, 152, .05);
}
.ar-panel-h,
.ar-right-h {
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.ar-panel-h { padding: 13px 13px 0; }
.ar-src-row {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  padding: 0 13px;
}
/* 中栏只有 300 来 px，「来自「项目名」· 点缩略图可取消参与」挤成一行会被省略号砍掉后半句
   （实测可用 226px、实际要 279px）。项目名是用户确认「素材对不对」的唯一依据，
   所以让它独占一行、超长才省略；操作提示落到第二行，不跟它抢宽度。 */
.ar-src {
  flex: 1 1 auto;
  min-width: 0;
  display: grid;
  gap: 1px;
  margin: 0;
  color: #93a3b8;
  font-size: 11px;
  line-height: 1.35;
}
.ar-src b {
  overflow: hidden;
  color: #3f5a7d;
  font-size: 11.5px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ar-src i {
  overflow: hidden;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 「换项目」：素材认哪个项目必须能改，不然抓到旧项目就没办法了 */
.ar-src-switch {
  flex: 0 0 auto;
  height: 20px;
  min-height: 0;
  padding: 0 8px;
  border: 1px solid #dbe5f2;
  border-radius: 99px;
  background: #f6f9fe;
  color: #1768d4;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  white-space: nowrap;
  cursor: pointer;
}
.ar-src-switch:hover { border-color: #b9d0ee; background: #eef4fd; }
.ar-src-switch:focus-visible { outline: 2px solid #1768d4; outline-offset: 2px; }

.ar-proj-list {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 208px;
  margin: 7px 13px 0;
  padding: 8px;
  overflow-y: auto;
  border: 1px solid #e3eefb;
  border-radius: 10px;
  background: #f9fbff;
}
.ar-proj-list::-webkit-scrollbar { width: 4px; }
.ar-proj-list::-webkit-scrollbar-thumb { border-radius: 99px; background: #d8e1ee; }
.ar-proj-hint { margin: 0 0 2px; color: #8b9cb3; font-size: 10.5px; line-height: 1.5; }
.ar-proj {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 0;
  width: 100%;
  padding: 5px 7px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}
.ar-proj:hover { border-color: #b9d0ee; }
.ar-proj.on { border-color: #1477ec; background: #eef6ff; }
.ar-proj:focus-visible { outline: 2px solid #1768d4; outline-offset: 1px; }
.ar-proj-cover {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  background-color: #eef3fa;
  background-position: center;
  background-size: cover;
  box-shadow: inset 0 0 0 1px rgba(16, 32, 64, .08);
}
.ar-proj-copy { min-width: 0; display: grid; gap: 1px; }
.ar-proj-copy b {
  overflow: hidden;
  color: #10243e;
  font-size: 11.5px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ar-proj-copy em {
  overflow: hidden;
  color: #94a2b6;
  font-size: 10px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ar-proj i { flex: 0 0 auto; margin-left: auto; color: #1477ec; font-size: 12px; font-style: normal; font-weight: 800; }
.ar-proj-empty,
.ar-proj-note { margin: 2px 0 0; color: #8b9cb3; font-size: 10.5px; line-height: 1.55; }
.ar-panel-h h2,
.ar-right-h h2 {
  margin: 0;
  color: #10243e;
  font-size: 15px;
  font-weight: 800;
  white-space: nowrap;
}
.ar-panel-h em,
.ar-right-h em {
  color: #7b91ad;
  font-size: 11.5px;
  font-style: normal;
  white-space: nowrap;
}
.ar-empty {
  margin: 0;
  padding: 14px 12px;
  border: 1px dashed #dbe8fb;
  border-radius: 10px;
  color: #8a9ab0;
  font-size: 11.5px;
  line-height: 1.7;
  text-align: center;
}

/* 中：素材 */
.ar-left-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 11px 13px 13px;
  overflow-x: hidden;
  overflow-y: auto;
}
.ar-left-body::-webkit-scrollbar { width: 5px; }
.ar-left-body::-webkit-scrollbar-thumb { border-radius: 99px; background: #d8e1ee; }
.ar-groups { display: flex; flex-direction: column; gap: 12px; }
.ar-grp-h { display: flex; align-items: center; gap: 5px; margin-bottom: 7px; }
.ar-grp-h span { color: #10243e; font-size: 12.5px; font-weight: 700; }
.ar-grp-h i { color: #94a2b6; font-size: 11px; font-style: normal; font-weight: 500; }
/* 素材缩略图自适应列数：中栏宽时 3 列、窄时 2 列。
   写死 2 列在 460px 栏里每张 213px，太大；写死 3 列在 320px 栏里又只剩 93px，看不清。 */
.ar-thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 7px; }
.ar-th {
  position: relative;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 9px;
  background-color: #eef3fa;
  background-position: center;
  background-size: cover;
  box-shadow: inset 0 0 0 1px rgba(16, 32, 64, .07);
}
.ar-th::after { content: ""; position: absolute; inset: 52% 0 0; background: linear-gradient(transparent, rgba(8, 20, 40, .6)); }
.ar-th em {
  position: absolute;
  z-index: 1;
  left: 6px;
  bottom: 5px;
  max-width: calc(100% - 12px);
  overflow: hidden;
  color: #fff;
  font-size: 9.5px;
  font-style: normal;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ar-play {
  position: absolute;
  z-index: 2;
  left: 50%;
  top: 42%;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  transform: translate(-50%, -50%);
  border: 1px solid rgba(255, 255, 255, .7);
  border-radius: 50%;
  background: rgba(8, 34, 69, .56);
  color: #fff;
}
.ar-play svg { width: 11px; height: 11px; }
.ar-mid .ar-panel-h em { margin-left: auto; white-space: nowrap; }
.ar-pick-all {
  flex: 0 0 auto;
  height: 22px;
  min-height: 0;
  padding: 0 9px;
  border: 1px solid #dbe5f2;
  border-radius: 99px;
  background: #f6f9fe;
  color: #1768d4;
  font-size: 11.5px;
  font-weight: 700;
  line-height: 20px;
  cursor: pointer;
}
.ar-pick-all:hover { border-color: #b9d0ee; background: #eef4fd; }
.ar-th { cursor: pointer; transition: box-shadow .16s ease, opacity .16s ease; }
.ar-th.is-locked { cursor: default; }
.ar-th.is-off { opacity: .38; }
.ar-th:focus-visible { outline: 2px solid #1768d4; outline-offset: 2px; }
.ar-th-check {
  position: absolute;
  z-index: 3;
  right: 5px;
  top: 5px;
  width: 17px;
  height: 17px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, .9);
  box-shadow: inset 0 0 0 1px rgba(16, 32, 64, .18);
  color: transparent;
}
.ar-th-check.is-on { background: #1768d4; box-shadow: none; color: #fff; }
.ar-tips {
  flex: 0 0 auto;
  margin-top: auto;
  padding: 11px 12px;
  border: 1px solid #ecf1f9;
  border-radius: 10px;
  background: #f8fafe;
}
.ar-tips b { display: block; margin-bottom: 5px; color: #10243e; font-size: 11.5px; }
.ar-tips p { margin: 0; color: #7c8ba1; font-size: 11px; line-height: 1.75; }

/* 中：创作素材（标题、换项目、缩略图都在这栏，所以不留上内边距给别的东西） */
.ar-mid { grid-column: 2; grid-row: 1; padding: 0; }
.ar-badge {
  padding: 3px 8px;
  border-radius: 6px;
  background: #eef3ff;
  color: #1477ec;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.ar-editor {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #dbe8fb;
  border-radius: 12px;
}
.ar-editor-h {
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px 0;
}
.ar-editor-h strong { color: #10243e; font-size: 13.5px; font-weight: 700; }
.ar-editor-h span { color: #94a2b6; font-size: 11px; }
.ar-editor textarea {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  padding: 9px 16px 0;
  border: 0;
  outline: 0;
  resize: none;
  background: transparent;
  color: #3a4b62;
  font-family: inherit;
  font-size: 13.5px;
  line-height: 2;
}
.ar-editor textarea::placeholder { color: #a9b6c7; }
.ar-editor-f { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 0 16px 10px; }
.ar-editor-f span { color: #94a2b6; font-size: 10.5px; }
.ar-undo {
  min-height: 0;
  padding: 0;
  border: 0;
  background: none;
  color: #2f6df6;
  font-size: 10.5px;
  font-family: inherit;
  cursor: pointer;
  text-decoration: underline;
}
.ar-ai-row { flex: 0 0 auto; flex-wrap: nowrap; display: flex; align-items: center; gap: 7px; }
.ar-ai-row .lbl { flex: 0 0 auto; color: #10243e; font-size: 11.5px; font-weight: 700; white-space: nowrap; }
.ar-ai-row .note {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  color: #94a2b6;
  font-size: 11px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ar-ai-row .spacer { flex: 1 1 0; min-width: 0; }
.ar-ai-btn {
  flex: 0 0 auto;
  min-height: 0;
  height: 30px;
  padding: 0 11px;
  border: 1px solid #c9dbfb;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 5px;
  background: #eef3ff;
  color: #1477ec;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.ar-ai-btn:disabled { cursor: not-allowed; opacity: .6; }
.ar-ai-btn svg { width: 13px; height: 13px; }
/* ⚠ 右侧必须留出 72px，和上面那条按钮行的 padding-right 对齐：
   智能体人物站在提示词框顶边上，身高 64 压在「按钮行 + 这一行」这 60px 空带里，
   这一行不留白的话，「整理用 deepseek-v4.1-flash」的尾巴就被人物盖掉一截（曾重叠 13%）。 */
.ar-ai-meta { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; min-height: 14px; padding-right: 72px; color: #9aa8bb; font-size: 10.5px; line-height: 14px; }
.ar-ai-meta > span { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.ar-ai-meta .ar-ai-wait { color: #1477ec; }

/* 右：创作叙事（上）+ 提示词（中间固定高度）+ 预览/生成（贴底）。
   整栏从上到下：叙事框（吃掉所有剩余高度）→ 提示词框（固定高度）→ 底部按钮条。
   用户原话「提示词框上下窄一点、创作叙事框往下一点」：
   提示词框高度定死（见下方 --ar-prompt-box-h），腾出来的高度全部归叙事框，
   所以叙事框自己会往下长，按钮条仍然贴在栏底。
   ⚠ 栏里不留整栏 gap：间隙逐块写在 margin-top 上，因为人物位置要按「提示词框顶边」
     往上数固定距离算（见 .report-agent-dock 的 bottom），整栏 gap 会让这个距离
     随块数变化而漂移。 */
.ar-right {
  grid-column: 3;
  grid-row: 1;
  gap: 0;
  padding: 13px 13px 12px;
  /* 提示词框高度唯一真源：框子和人物位置（bottom 算式）都读它，不能两处各写一个数，
     否则一改高度人物就和框边错位了。132 是「标题 + 3 行提示词」的可用高度；
     矮屏用 13vh 收，但不低于 112（低于这个只剩两行，字写不开）。 */
  --ar-prompt-box-h: clamp(112px, 15vh, 148px);
}
.ar-right-h { flex-wrap: wrap; row-gap: 3px; }
/* 叙事框下面这几块：和上面一格之间留 10px（原来整栏 gap 的效果），自己内部不再留 */
.ar-right .ar-ai-row { margin-top: 10px; }
.ar-right .ar-ai-meta { margin-top: 6px; }
/* 提示词框：默认带出画图时写的那句，改了就出现「恢复原来的」。
   它是独立一格（不是叙事框的一部分），用户一眼能分清「写故事」和「改出图要求」。
   高度固定（约 3 行），不再抢剩余高度——写故事的地方才是用户主要用的，它得最大。
   上边距 10px = 普通栏内间距，同时是人物脚底落脚的那条缝（人物整体站在框的正上方，
   脚不进框、也不压上面的说明行）。 */
.ar-prompt {
  flex: 0 0 auto;
  margin-top: 10px;
  height: var(--ar-prompt-box-h, 132px);
  min-height: 92px;
  /* overflow: hidden：内容超出时裁在框内，不往按钮条那边溢。 */
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 6px;
  /* 四边同宽 11px。原来右侧留了 74px 给人物让位，人物改成站在框上方以后
     那块留白没用了，留着只会把提示词文字挤窄、多折几行。 */
  padding: 9px 11px;
  border: 1px solid #dbe8fb;
  border-radius: 11px;
  background: #f8fbff;
}
.ar-prompt textarea { min-height: 0; }
.ar-prompt-h { display: flex; align-items: center; gap: 7px; }
.ar-prompt-h b { color: #10243e; font-size: 12.5px; font-weight: 800; }
.ar-prompt-h em { color: #94a2b6; font-size: 10.5px; font-style: normal; }
.ar-prompt-reset {
  margin-left: auto;
  min-height: 0;
  padding: 0;
  border: 0;
  background: none;
  color: #1768d4;
  font-family: inherit;
  font-size: 10.5px;
  text-decoration: underline;
  cursor: pointer;
}
/* textarea 用 flex:1 撑满外框：外框已经按「剩余高度」算好了，
   这里只要跟着长满就行，写死 height 会让下面的空白又长回来。 */
.ar-prompt textarea {
  width: 100%;
  flex: 1 1 auto;
  min-height: 72px;
  padding: 8px 9px;
  border: 1px solid #dde9f8;
  border-radius: 8px;
  outline: 0;
  resize: none;
  background: #fff;
  color: #3a4b62;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.75;
}
.ar-prompt textarea:focus { border-color: #a9c9f5; box-shadow: 0 0 0 3px rgba(23, 104, 212, .1); }
.ar-prompt textarea::placeholder { color: #a9b6c7; }

/* 风格条：一整栏只有手机框，横着滑。桌面用滚轮横翻（见 scrollStyleStrip），
   所以滚动条一律藏起来，不然会出现一条又粗又丑的横条。 */
.ar-strip-wrap {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
  display: flex;
}
.ar-strip {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  align-items: stretch;
  /* 只有一张风格卡时会左右居中：多张卡时是滚动容器，「居中」会变成把第一张
     往右推，永远滑不到最左边，所以只在卡放得下时才用居中。
     ⚠ justify-content:center 在「内容溢出」的滚动容器里会走成「两端对齐」的样子，
       卡一多就贴左；safe center 也不是所有内核都认。所以这里不靠 justify-content，
       居中交给下面 :only-child 的 margin:auto（只在卡放得下时才可能生效）。 */
  justify-content: flex-start;
  gap: 10px;
  padding: 10px;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  /* ⚠ 必须配 scroll-padding：吸附默认对齐到「内容盒起点」，也就是把 padding-left 的
     10px 一起滚掉 —— 一进页面卡左边缘就顶死在容器边框上，看着像被削了一条。
     给了 scroll-padding 之后吸附点改成「距边框 10px」，起点 scrollLeft = 0，
     卡完整落在内边距里，和上下留白一致。 */
  scroll-padding-inline: 10px;
  scrollbar-width: none;
}
.ar-strip::-webkit-scrollbar { height: 0; }
/* 左右箭头：贴在风格条两侧正中的小白圆钮，只有真还有内容没露出来时才出现。
   z-index 压在卡上面，卡被切掉的那截也不会挡住按钮。 */
.ar-strip-nav {
  position: absolute;
  top: 50%;
  z-index: 3;
  width: 30px;
  height: 30px;
  min-height: 0;
  margin-top: -15px;
  padding: 0;
  border: 1px solid #d6e4f8;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, .94);
  box-shadow: 0 4px 12px rgba(30, 64, 120, .16);
  color: #1768d4;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
.ar-strip-nav:hover { background: #fff; box-shadow: 0 6px 16px rgba(30, 64, 120, .24); }
.ar-strip-nav.is-prev { left: 4px; }
.ar-strip-nav.is-next { right: 4px; }
/* 9:16 撑满栏高：高度交给栏高，宽度由 9:16 算出来。
   ⚠ 不要给 .ar-style 加 max-width：卡被压窄而高度不变，长宽比会从 0.5625 掉到 0.5447，
     图被横向压扁。溢出的十几像素在容器这边消化（见 .ar-grid 的左栏宽度算式）。 */
.ar-style {
  flex: 0 0 auto;
  /* 宽度别写死：写死宽度会把 aspect-ratio 顶掉（高度也定了，ratio 就没活干），
     卡就按 栏宽 × 栏高 走，9:16 被压成 1.11，手机框明显横向拉扁。
     目标效果是「高度撑满、宽度 = 高度 × 9/16」，所以 width 必须显式 auto。 */
  width: auto;
  height: 100%;
  aspect-ratio: 9 / 16;
  /* ⚠ flex 项在「横向滚动容器」里的自动最小宽度是 min-content，不是 0：
     一旦卡里的子元素有内容宽度（封面图、文字），卡就不肯缩到 9:16 该有的宽度，
     直接顶成整栏宽（实测 448×796 而不是 448×796…应为 448×796 的 9:16 = 448×796）。
     显式 min-width:0 才能让 aspect-ratio 说了算。 */
  min-width: 0;
  display: flex;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: inherit;
  cursor: pointer;
  /* ⚠ 对齐一律用 start，不能用 center：单张卡靠 justify-content:center 就能居中，
     而多个卡时「居中吸附」会把第一张卡推到可视区右半边，滚到 scrollLeft:0 时
     左边还空着 57px、右边又被切掉，用户看到的是卡偏右一坨。 */
  scroll-snap-align: start;
}
/* 只有一张卡、根本滑不动时：snap 没意义，改成居中（左右留白对称才好看）。
   用 margin:auto 而不是 justify-content——margin 自动值是真的按剩余空间平分，
   滚动容器里也照做，不会像 center 那样在卡多时把第一张推出屏。
   :has(:only-child) 比在 JS 里加 class 稳——配置加载完才塞卡片，class 容易漏同步。 */
/* ⚠ 单卡居中这条选择器后面 MUST 带 .ar-tp（哪怕 .ar-tp 在别的规则里已经写过 width/height）：
   它和 `.ar-tp { width:100%; height:100% }` 的优先级同为 (0,2,0)，谁写在后面谁赢。
   原来 `.ar-strip:has(...) .ar-style` 只有 (0,3,0) 赢了外层、却输给后面那条 .ar-tp，
   卡被强行撑成 100% 宽 —— 整栏被一张卡塞满，右边留白 26px 对不上；
   而且宽度变了、高度没变，9:16 被压成 1.11，图明显横向拉扁。 */
.ar-strip:has(.ar-style:only-child) .ar-style {
  /* 宽度交给 .ar-tp 的 9:16 定，这里别声明——声明了反而会因为 .ar-tp 那条同权后置而失效 */
  height: 100%;
  scroll-snap-align: center;
  margin-inline: auto;
}
.ar-style:focus-visible { outline: 2px solid #1768d4; outline-offset: 3px; border-radius: 12px; }
.ar-tp {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 12px;
  background-color: #f2f6fc;
  box-shadow: inset 0 0 0 1px rgba(16, 32, 64, .08);
  transition: box-shadow .16s ease;
}
/* 封面存的是 900×1200 竖图，正好装进 9:16 的框里（只裁掉一点上下），不用再按 3:1 压扁 */
.ar-style .ar-tp {
  /* ⚠ 这条必须写在 .ar-style:has(...) 那条之后：两条优先级相同 (0,2,0)，
     靠先后顺序才能压住单卡居中时的 width:auto，否则单卡又被撑满整栏、9:16 变形。 */
  width: 100%;
  height: 100%;
}
.ar-tp-art {
  position: absolute;
  inset: 0;
  background-color: #eef3fa;
  background-position: center;
  background-size: cover;
}
/* 对勾：卡片的封面图是「暖白/米色」的，纯白描边+蓝底 放在图右上角远看像一个脏点，
   和图右上角原有的小白圆点（封面自带的水印）也分不清。改成深蓝描边白底，
   衬在任何浅色封面都清楚，也不会再被误看成水印。 */
.ar-chk {
  position: absolute;
  z-index: 2;
  right: 8px;
  top: 8px;
  width: 22px;
  height: 22px;
  display: none;
  place-items: center;
  border: 2px solid #1477ec;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 8px rgba(20, 40, 80, .32);
  color: #1477ec;
}
.ar-chk svg { width: 11px; height: 11px; }
.ar-style.on .ar-tp { box-shadow: 0 0 0 3px #1477ec, 0 10px 22px rgba(40, 96, 232, .24); }
.ar-style.on .ar-chk { display: grid; }
.ar-left > .ar-empty { margin: 12px; }
.ar-fill {
  flex: 0 0 auto;
  /* 现在它挂在左栏风格条下面，左右缩进要和风格条内部对齐（10px） */
  margin: 0 10px 10px;
  overflow: hidden;
  border: 1px solid #dbe8fb;
  border-radius: 10px;
  background: #fbfdff;
}
.ar-fill-h {
  width: 100%;
  min-height: 0;
  padding: 9px 10px;
  border: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: transparent;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.ar-fill-h span { color: #10243e; font-size: 11.5px; font-weight: 700; }
.ar-fill-h small { display: block; margin-top: 2px; color: #94a2b6; font-size: 10px; font-weight: 500; }
.ar-fill-h b { color: #1477ec; font-size: 11px; white-space: nowrap; }
.ar-fill-body { padding: 0 10px 10px; }
.ar-fill-mode { display: flex; gap: 2px; padding: 3px; border-radius: 8px; background: #eef3ff; }
.ar-fill-mode button {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #5a6a82;
  font-family: inherit;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
}
.ar-fill-mode button.on { background: #fff; color: #1477ec; }
.ar-fill-manual { margin-top: 9px; }
.ar-fill-manual select {
  width: 100%;
  height: 30px;
  border: 1px solid #dbe8fb;
  border-radius: 7px;
  background: #fff;
  color: #3a4b62;
  font-family: inherit;
  font-size: 11.5px;
}
.ar-fill-manual p { margin: 7px 0; color: #8a9ab0; font-size: 10.5px; line-height: 1.6; }
.ar-fill-assets { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
.ar-fill-assets button {
  position: relative;
  min-height: 0;
  aspect-ratio: 1 / 1;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background-color: #eef3fa;
  background-position: center;
  background-size: cover;
  cursor: pointer;
}
.ar-fill-assets button.on { box-shadow: 0 0 0 2px #1477ec; }
.ar-fill-assets span {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 2px 3px;
  background: rgba(8, 20, 40, .6);
  color: #fff;
  font-size: 8.5px;
}
/* 底部按钮条：栏里最后一格，压在栏底。
   ⚠ 必须留 10px 上边距：按钮顶边和提示词框底边贴成 0 的话，提示词框里最后一行字
     就在边框线上，用户看着就是「按钮把输入框压住了」。
     这条缝也不能由 .ar-acts 的 padding-top 顶——那道内边距会被按钮自己的
     投影和边框吃掉，看着仍然贴着，所以用 margin-top 实打实让开。 */
.advanced-report-page .ar-acts {
  flex: 0 0 auto;
  margin-top: 10px;
  padding-top: 0;
  border-top: 0;
  display: flex;
  gap: 9px;
}

/* 智能体人物：站在「提示词」框的上方（用户原话「智能体悬浮图是在提示词框的上方的」），
   整体待在框顶边上面那道缝里，脚不进框、不压框里任何字。
   ⚠ 这个组件是挂在 <main> 末尾的浮层（position: fixed），不在右栏里面，
     所以 right/bottom 都按「屏幕」算，不能指望右栏当它的定位父亲。
   位置不写死像素：提示词框离屏幕底多远随窗口高矮、按钮条折行而变化，
   JS 量「屏幕底 → 提示词框顶边」写进 --ar-prompt-top-gap，量多少贴多少。
   ⚠ 人物站在框上方，上半身会伸进上面那条「整理创作构思」按钮行。
     不加处理就会盖住那个按钮的右半截（用户看不到也点不到），
     所以下面把这一行右侧空出 72px（见 .ar-ai-row 的 padding-right），
     人物正好落在这块空白里 —— 见缝站人，谁都不压。
   尺寸 64px（组件默认 92）：上面那道空带只有 ~70px，再大就顶到叙事框的字。
   人物镜像（scaleX(-1)）：原图脸朝左，翻过来朝右栏里面看，不背对页面。
   只镜像人物本身，不镜像整个按钮——按钮里还有「点我说话」气泡，翻了字就是反的。
   面板朝左展开（panel-side="right"），弹出的对话卡不会被屏幕右边裁掉。 */
.advanced-report-page .report-agent-dock.is-floating {
  position: fixed;
  left: auto;
  /* 右侧留 6px 而不是 2px：人物是 scaleX(-1) 镜像的，翻转后包围盒会往右探出一点，
     贴太死会被屏幕右边裁掉一条胳膊（实测 right:2px 时人物右缘到 1442 > 视口 1440）。 */
  right: 6px;
  /* 🔴 提示词框的顶边就落在 bottom: var(--ar-prompt-top-gap)。
     ⚠ 这里必须写成「缩到框顶边上沿、且贴着右边空白」，也就是 0，不要加也不
     要减：`-1px` 是脚钻进框里（框高才 117px，压 1px 就蹭到第一行字），
     `+3px` / `+10px` 是脚离框顶留一道缝、人浮在半空。
     ⚠ 浏览器会把 var 算出的长度按 1/64px 取整（303 - 1 → 302），
     所以「减 1」实际是「减 1.01」，别拿它当「刚好对齐」用。 */
  bottom: var(--ar-prompt-top-gap, 346px);
  /* 组件里人物默认 92px。上面那条「按钮行 + 模型行」空带只有 ~70px，
     64 才塞得下（头顶刚够到叙事框底边），再大就压字。 */
  --sa-float-size: 64px;
}
/* 给人物让出的那块空白：按钮行右侧留 72px（人物 64 + 右侧 6px + 2 余量）。
   不设的话人物上半身会盖住「整理创作构思」按钮右半截（用户点不到）；
   但也不能留太大 —— 这块留白是直接扣掉说明文字宽度的，
   6px 右侧 + 78px 留白会把「整理用 deepseek-v4-flash」提前省略成「整理用 d…」。 */
.advanced-report-page .ar-ai-row { padding-right: 72px; }
/* 镜像顺带把自带的上下浮动动画一起改：transform 会被动画整条覆盖，
   只写 transform 不写 keyframes 的话，一动就翻回原样。 */
@keyframes arMirrorFloat {
  0%, 100% { transform: scaleX(-1) translateY(0); }
  50% { transform: scaleX(-1) translateY(-6px); }
}
.advanced-report-page .report-agent-dock :deep(.sa-figure) {
  transform: scaleX(-1);
  animation-name: arMirrorFloat;
}
/* 窄屏（<960px）三栏堆成一列，右栏不再是「固定高度 + 按钮压底」，
   提示词框也别再抢剩余高度（堆叠后没有剩余高度可分），给个正常高度就行；
   右下角没有稳定的空白，人物退回左下角原本的位置。 */
@media (max-width: 960px) {
  .advanced-report-page .ar-prompt textarea { min-height: 96px; }
  .advanced-report-page .report-agent-dock.is-floating {
    left: 14px;
    right: auto;
    bottom: 78px;
  }
}
.ar-prev,
.ar-go {
  min-height: 0;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}
.ar-prev { flex: 0 0 37%; border: 1px solid #c9dbfb; background: #fff; color: #1477ec; }
.ar-go { flex: 1 1 auto; border: 0; background: #ff6500; color: #fff; box-shadow: 0 7px 16px rgba(242, 107, 42, .28); }
.ar-go:disabled { cursor: not-allowed; opacity: .6; }
.ar-prev svg,
.ar-go svg { width: 13px; height: 13px; }

@media (max-width: 1180px) {
  .advanced-report-page .ar-grid {
    grid-template-columns:
      clamp(214px, calc((100vh - var(--app-top, 0px) - 112px) * 0.5625 + 22px), 336px)
      minmax(0, 1fr)
      minmax(268px, 1fr);
  }
}
/* 矮屏（笔记本横屏、投影、人把窗口拉扁）：右栏那几行固定说明会把叙事框挤到只剩一百来像素。
   这时候把「不知道怎么写？」这一行里的解释和「整理用哪个模型」那行藏掉，只留按钮，
   腾出来的 45px 全还给叙事框。窗口一拉高就自动回来，不用用户做任何操作。 */
@media (max-height: 700px) {
  .advanced-report-page .ar-ai-row .lbl,
  .advanced-report-page .ar-ai-row .note { display: none; }
  .advanced-report-page .ar-ai-row .spacer { flex: 1 1 auto; }
  .advanced-report-page .ar-ai-meta { display: none; }
}
@media (max-width: 960px) {
  .advanced-report-page .ar-grid { grid-template-columns: 1fr; grid-template-rows: none; height: auto; min-height: 0; }
  .ar-left,
  .ar-mid,
  .ar-right { grid-column: auto; grid-row: auto; }
  .ar-left-body { overflow: visible; }
  /* 堆成一列后栏高不固定，「按栏高撑满」就失效了，改成按宽度算：
     每张卡给一个固定宽度，高度由 9:16 自己算出来，照样能横着滑。 */
  .ar-strip-wrap { flex: 0 0 auto; }
  .ar-strip { flex: 0 0 auto; height: auto; padding-bottom: 6px; }
  .ar-style { flex: 0 0 auto; width: 168px; height: auto; }
  .ar-editor { min-height: 240px; }
}
</style>
