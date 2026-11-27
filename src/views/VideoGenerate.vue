<template>
  <main class="video-page app-page" :class="{ 'mode-pro-video': difficulty === 'pro' }">
    <!-- 返回和标题由共用顶栏提供；版本只在登录时选，这里不再显示版本 -->

    <section class="video-layout" :class="{ 'video-layout--studio': difficulty === 'pro' }">
      <aside class="settings-panel" :class="`mode-${difficulty}`">
        <template v-if="difficulty === 'junior'">
          <section class="young-panel">
            <h2>1. 选择作品</h2>
            <p>选一张完成的画，AI 会自己帮它动起来。</p>
            <button class="large-action" @click="showProjectPicker = true">从素材库选一张</button>
            <SingleMaterialPreview :material="materials[0]" />
          </section>

          <section class="young-panel">
            <h2>2. 选择动画</h2>
            <div class="template-row template-row--large">
              <button v-for="item in juniorTemplates" :key="item" :class="{ active: form.template === item }" @click="selectTemplate(item)">{{ item }}</button>
            </div>
          </section>

          <section class="young-generate">
            <p>固定 10 秒 · 9:16 竖屏 · 轻柔音乐</p>
            <BaseButton block :loading="running" :disabled="running || !materials.length" @click="startTask">一键生成AI视频</BaseButton>
          </section>
        </template>

        <template v-else-if="difficulty === 'starter'">
          <section class="young-panel">
            <h2>1. 素材</h2>
            <div class="source-grid two">
              <button @click="showProjectPicker = true"><strong>素材库单选</strong><span>用完成素材生成</span></button>
              <button @click="triggerUpload"><strong>相册上传</strong><span>上传一张草图</span></button>
            </div>
            <input ref="fileInput" class="file-input" type="file" accept="image/*" @change="handleUpload" />
            <SingleMaterialPreview :material="materials[0]" />
          </section>

          <section class="young-panel">
            <h2>2. 动画模板</h2>
            <div class="template-row">
              <button v-for="item in starterTemplates" :key="item" :class="{ active: form.template === item }" @click="selectTemplate(item)">{{ item }}</button>
            </div>
            <label class="field-label">画面比例</label>
            <div class="segmented">
              <button v-for="item in starterRatios" :key="item" :class="{ active: form.ratio === item }" @click="form.ratio = item">{{ item }}</button>
            </div>
          </section>

          <section class="young-panel">
            <h2>3. 语音创意补充</h2>
            <button class="mic-circle" :class="{ active: listening }" @click="toggleSpeech">{{ listening ? '结束' : '说想法' }}</button>
            <p>{{ voiceStory || 'AI 会在后台把你说的话变成故事，不展示提示词。' }}</p>
            <BaseButton variant="secondary" block @click="regenerateStory">AI重新生成故事</BaseButton>
          </section>

          <section class="young-generate">
            <h2>4. 音乐和生成</h2>
            <div class="audio-grid">
              <button v-for="item in starterMusic" :key="item" :class="{ active: form.music === item }" @click="form.music = item">{{ item }}</button>
            </div>
            <BaseButton block :loading="running" :disabled="running || !materials.length" @click="startTask">生成AI视频</BaseButton>
          </section>
        </template>

        <template v-else-if="difficulty === 'advanced'">
          <div class="settings-scroll">
            <PanelCard title="1. 素材模块" :open="panels.materials" @toggle="togglePanel('materials')">
              <div class="source-grid">
              <button @click="showProjectPicker = true"><strong>素材库选取</strong><span>可多图排序</span></button>
                <button @click="triggerUpload"><strong>草图上传</strong><span>支持图片素材</span></button>
                <button @click="useBlankIdea"><strong>文字生成</strong><span>空白创意开始</span></button>
              </div>
              <input ref="fileInput" class="file-input" type="file" accept="image/*" @change="handleUpload" />
              <MaterialStrip :materials="materials" @move="moveMaterial" @remove="removeMaterial" />
            </PanelCard>

            <PanelCard title="2. 基础视频参数" :open="panels.basic" @toggle="togglePanel('basic')">
              <label class="field-label">生成模式</label>
              <div class="segmented two">
                <button :class="{ active: form.mode === 'template' }" @click="form.mode = 'template'">模板模式</button>
                <button :class="{ active: form.mode === 'free' }" @click="form.mode = 'free'">自由提示词模式</button>
              </div>
              <label class="field-label">时长</label>
              <div class="segmented">
                <button v-for="item in durations" :key="item" :class="{ active: form.duration === item }" @click="form.duration = item">{{ item }}</button>
              </div>
              <label class="field-label">画面比例</label>
              <div class="segmented">
                <button v-for="item in ratios" :key="item" :class="{ active: form.ratio === item }" @click="form.ratio = item">{{ item }}</button>
              </div>
              <label class="field-label">动画模板</label>
              <div class="template-row">
                <button v-for="item in advancedTemplates" :key="item" :class="{ active: form.template === item }" @click="selectTemplate(item)">{{ item }}</button>
              </div>
            </PanelCard>

            <PanelCard title="3. 快捷标签提示词" :open="panels.tags" @toggle="togglePanel('tags')">
              <div v-for="group in advancedTagGroups" :key="group.title" class="tag-group">
                <label>{{ group.title }}</label>
                <div class="tag-list">
                  <button v-for="tag in group.items" :key="tag" @click="appendShortPrompt(tag)">{{ tag }}</button>
                </div>
              </div>
              <textarea v-model="form.shortPrompt" maxlength="100" placeholder="补充一句短想法，最多100字。" />
            </PanelCard>

            <PanelCard title="4. 创意剧本" :open="panels.script" @toggle="togglePanel('script')">
              <BaseButton variant="secondary" block @click="syncProjectIdea">同步绘画项目构思</BaseButton>
              <BaseButton block :loading="scriptLoading" @click="improveScript">AI生成分镜剧本</BaseButton>
              <textarea v-model="form.script" placeholder="可少量修改 AI 生成的分镜剧本。" />
            </PanelCard>

            <PanelCard title="5. 音频与简易调节" :open="panels.audio" @toggle="togglePanel('audio')">
              <label class="field-label">背景音乐</label>
              <div class="audio-grid">
                <button v-for="item in allMusic" :key="item" :class="{ active: form.music === item }" @click="form.music = item">{{ item }}</button>
              </div>
              <div class="switch-row"><span>字幕</span><el-switch v-model="form.subtitle" /></div>
              <label class="field-label">动态强度</label>
              <div class="segmented">
                <button v-for="item in simpleStrength" :key="item" :class="{ active: form.strengthLevel === item }" @click="form.strengthLevel = item">{{ item }}</button>
              </div>
            </PanelCard>
          </div>
          <section class="fixed-generate">
            <BaseButton block :loading="running" :disabled="running || !materials.length" @click="startTask">生成AI视频</BaseButton>
          </section>
        </template>

        <template v-else-if="difficulty === 'pro'">
          <section class="studio-skill-panel">
            <div class="studio-skill-heading">
              <strong>技能玩法</strong>
              <span>{{ studioSkills.length }}</span>
            </div>
            <p>选择模板，快速开始创作</p>
            <button
              v-for="skill in studioSkills"
              :key="skill.id"
              class="studio-skill-card"
              :class="{ active: activeStudioSkill === skill.id }"
              type="button"
              @click="openStudioSkillCard(skill)"
            >
              <span class="studio-skill-art" :class="[`art-${skill.id}`, { 'has-cover': Boolean(studioSkillCoverUrl(skill)) }]" :style="studioSkillCoverStyle(skill)"><i /><b /></span>
              <span class="studio-skill-copy"><strong>{{ skill.title }}</strong></span>
            </button>
            <div v-if="activeManagedStudioSkill" class="managed-skill-fields">
              <strong>填写玩法信息</strong>
              <label v-for="field in activeManagedStudioSkill.configuration?.inputFields || []" :key="field.key">
                <span>{{ field.label }}<i v-if="field.required">*</i></span>
                <textarea v-if="field.type === 'textarea'" v-model="managedSkillValues[field.key]" :placeholder="field.placeholder" :maxlength="field.maxLength || 1000" />
                <select v-else-if="field.type === 'select'" v-model="managedSkillValues[field.key]"><option value="">请选择</option><option v-for="option in field.options || []" :key="option.value" :value="option.value">{{ option.label }}</option></select>
                <el-switch v-else-if="field.type === 'switch'" v-model="managedSkillValues[field.key]" />
                <div v-else-if="field.type === 'image'" class="managed-skill-image">将使用当前参考图片；可在下方素材区上传或选择图片。</div>
                <input v-else v-model="managedSkillValues[field.key]" :placeholder="field.placeholder" :maxlength="field.maxLength || 160" />
              </label>
            </div>
          </section>
          <StudentAgentDock
            class="video-agent"
            variant="inline"
            page="video"
            page-label="AI 视频"
            :samples="agentVideoSamples"
            :canvas-context="agentCanvasContext"
            :busy="hasActiveVideoJobs"
            @execute="handleAgentExecute"
          />
          <nav class="studio-shortcuts" aria-label="创作入口">
            <button type="button" @click="router.push('/student/paint')">无限画布</button>
            <button type="button" @click="router.push('/student/paint')">AI绘画</button>
            <button type="button" @click="router.push({ path: '/student/h5-report', query: { difficulty: difficulty.value } })">项目报告高清</button>
          </nav>
        </template>

        <template v-else>
          <div class="settings-scroll">
            <PanelCard title="1. 素材模块全权限" :open="true">
              <div class="source-grid">
                <button @click="showProjectPicker = true"><strong>批量作品素材</strong><span>可自定义顺序</span></button>
                <button @click="triggerUpload"><strong>多图上传</strong><span>参考图/线稿</span></button>
                <button @click="useBlankIdea"><strong>纯文字创作</strong><span>无模板自由生成</span></button>
              </div>
              <input ref="fileInput" class="file-input" type="file" accept="image/*" multiple @change="handleUpload" />
              <MaterialStrip :materials="materials" @move="moveMaterial" @remove="removeMaterial" />
              <div class="switch-row"><span>线稿预处理</span><el-switch v-model="form.linePreprocess" /></div>
              <div class="switch-row"><span>参考图叠加</span><el-switch v-model="form.referenceOverlay" /></div>
            </PanelCard>

            <PanelCard title="2. 视频基础设置" :open="true">
              <label class="field-label">自定义时长（秒）</label>
              <input v-model.number="form.customDuration" class="text-input" type="number" min="3" max="60" />
              <label class="field-label">画面比例</label>
              <div class="segmented">
                <button v-for="item in ratios" :key="item" :class="{ active: form.ratio === item }" @click="form.ratio = item">{{ item }}</button>
              </div>
              <label class="field-label">动画模板</label>
              <div class="template-row">
                <button v-for="item in proTemplates" :key="item" :class="{ active: form.template === item }" @click="selectTemplate(item)">{{ item }}</button>
              </div>
            </PanelCard>

            <PanelCard title="3. 双层专业提示词面板" :open="true">
              <label class="field-label">正向提示词</label>
              <textarea v-model="form.positivePrompt" class="prompt-large" placeholder="正向提示词：自由描述镜头、动态、光影、角色动画细节。" />
              <label class="field-label">反向负面提示词</label>
              <textarea v-model="form.negativePrompt" placeholder="反向负面提示词：例如画面畸形、模糊、抖动、穿帮、低清晰度。" />
              <div v-for="group in proTagGroups" :key="group.title" class="tag-group">
                <label>{{ group.title }}</label>
                <div class="tag-list">
                  <button v-for="tag in group.items" :key="tag" @click="appendPositivePrompt(tag)">{{ tag }}</button>
                </div>
              </div>
            </PanelCard>

            <PanelCard title="4. 精细运镜分镜调节" :open="true">
              <label class="field-label">动态幅度</label><el-slider v-model="form.motionStrength" :min="0" :max="100" />
              <label class="field-label">镜头转速</label><el-slider v-model="form.cameraSpeed" :min="0" :max="100" />
              <label class="field-label">分镜时长</label><el-slider v-model="form.shotDuration" :min="1" :max="10" />
              <el-select v-model="form.transition" size="large">
                <el-option label="柔和淡入" value="fade" />
                <el-option label="画纸翻页" value="page" />
                <el-option label="镜头推近" value="zoom" />
                <el-option label="电影切换" value="cinema" />
              </el-select>
            </PanelCard>

            <PanelCard title="5. 完整剧本与旁白编辑" :open="true">
              <BaseButton block :loading="scriptLoading" @click="improveScript">AI生成逐镜头脚本</BaseButton>
              <textarea v-model="form.script" class="prompt-large" placeholder="逐镜头脚本，可增删修改。" />
              <textarea v-model="form.voiceover" placeholder="TTS 旁白配音文本。" />
            </PanelCard>

            <PanelCard title="6. 画质音频模块" :open="true">
              <div class="switch-row"><span>4K高清</span><el-switch v-model="form.quality4k" /></div>
              <label class="field-label">帧率</label>
              <div class="segmented">
                <button v-for="item in frameRates" :key="item" :class="{ active: form.frameRate === item }" @click="form.frameRate = item">{{ item }}</button>
              </div>
              <label class="field-label">背景音乐</label>
              <div class="audio-grid">
                <button v-for="item in allMusic" :key="item" :class="{ active: form.music === item }" @click="form.music = item">{{ item }}</button>
              </div>
              <div class="switch-row"><span>自定义字幕</span><el-switch v-model="form.subtitle" /></div>
            </PanelCard>
          </div>
          <section class="fixed-generate">
            <BaseButton block :loading="running" :disabled="running || !materials.length" @click="startTask">生成AI视频</BaseButton>
          </section>
        </template>
      </aside>

      <section v-if="difficulty !== 'pro'" class="preview-panel">
        <div class="preview-top">
          <div>
            <h2>视频实时预览</h2>
            <p>{{ previewSubtitle }}</p>
          </div>
          <button @click="resetAll">重置清空素材</button>
        </div>

        <div class="preview-canvas" :class="ratioClass">
          <div v-if="task.status === 'failed'" class="preview-state is-error">
            <strong>哎呀，AI刚才开小差啦，再试一次吧～</strong>
            <p>{{ task.error }}</p>
            <BaseButton @click="startTask">再试一次</BaseButton>
          </div>
          <div v-else-if="running" class="preview-state video-generation-waiting-grid" :class="`count-${videoGenerationCount}`">
            <div v-for="slot in videoGenerationCount" :key="slot" class="video-generation-waiting-card">
              <strong>{{ statusText }}</strong>
              <el-progress :percentage="task.progress" :stroke-width="10" color="#6c5ce7" />
            </div>
          </div>
          <video v-else-if="task.result?.videoUrl" class="real-video-player" :src="task.result.videoUrl" controls playsinline />
          <article v-else-if="task.result" class="mock-player" :style="{ background: task.result.background }">
            <button class="play-btn" @click="playing = !playing">{{ playing ? '暂停' : '播放' }}</button>
            <h3>{{ task.result.title }}</h3>
            <p>{{ task.result.description }}</p>
            <div class="fake-progress"><span :style="{ width: playing ? '72%' : '34%' }" /></div>
          </article>
          <div v-else class="preview-state">
            <div class="empty-illustration">视</div>
            <strong>还没有生成视频</strong>
            <p>选择素材和模板后，点击生成按钮即可看到 Mock 预览。</p>
          </div>
        </div>

        <div class="preview-actions" :class="{ disabled: !task.result }">
          <BaseButton v-for="action in previewActions" :key="action.key" :variant="action.variant" :disabled="!task.result" @click="handlePreviewAction(action.key)">
            {{ action.label }}
          </BaseButton>
        </div>
      </section>

      <section v-else class="studio-preview-panel">
        <div class="studio-video-stage" :class="ratioClass">
          <div class="studio-current-preview">
          <div v-if="videoPreviewItems.length" class="studio-video-grid">
            <article v-for="item in videoPreviewItems" :key="item.taskId || item.id" class="studio-video-card" :class="videoRatioClass(item.ratio)">
              <video v-if="item.videoUrl" :src="item.videoUrl" controls playsinline preload="metadata" />
              <div v-else class="studio-video-pending" :class="{ 'is-error': item.status === 'failed' }">
                <strong>{{ videoJobStatusText(item.status) }}</strong>
                <el-progress :percentage="Math.min(Math.max(Number(item.progress || 0), 6), 100)" :show-text="false" :stroke-width="7" color="#6c5ce7" />
                <small v-if="item.status === 'failed'">{{ item.error || '视频任务提交失败' }}</small>
                <small v-else>可继续输入新提示词并发送</small>
              </div>
              <div class="studio-video-card-meta"><strong>{{ item.title }}</strong><span>{{ item.duration }} · {{ item.ratio }}</span><button v-if="item.videoUrl" type="button" @click="openVideoPreview(item)">放大播放</button></div>
            </article>
          </div>
          <div v-else-if="task.status === 'failed'" class="studio-stage-state is-error">
            <strong>生成失败，请重新尝试</strong>
            <p>{{ task.error }}</p>
            <BaseButton @click="startTask">重新生成</BaseButton>
          </div>
          <div v-else-if="running" class="studio-stage-state video-generation-waiting-grid" :class="`count-${videoGenerationCount}`">
            <div v-for="slot in videoGenerationCount" :key="slot" class="video-generation-waiting-card">
              <strong>{{ statusText }}</strong>
              <el-progress :percentage="task.progress" :stroke-width="10" color="#6c5ce7" />
            </div>
          </div>
          <article v-else-if="task.result" class="studio-player" :style="{ background: task.result.background }">
            <button class="studio-play" type="button" @click="playing = !playing">{{ playing ? '暂停' : '播放' }}</button>
            <h3>{{ task.result.title }}</h3>
            <p>{{ task.result.description }}</p>
          </article>
          <div v-else class="studio-stage-empty">
            <svg viewBox="0 0 96 72" width="96" height="72" aria-hidden="true">
              <rect x="6" y="12" width="62" height="48" rx="11" fill="#f0eeff" stroke="#6c5ce7" stroke-width="2.5" />
              <path d="M68 31 88 19v34L68 41z" fill="#f0eeff" stroke="#6c5ce7" stroke-width="2.5" stroke-linejoin="round" />
              <path d="M31 27v18l14-9z" fill="#6c5ce7" />
            </svg>
            <strong>这里会出现你的视频</strong>
            <p>在下面写一句话，或先选一个技能玩法，再点「发送」</p>
          </div>
          </div>
        </div>
      </section>
      <section v-if="difficulty === 'pro'" class="studio-composer studio-composer--panel">
          <div class="video-reference-stack" :class="{ expanded: referenceStackExpanded }">
            <button type="button" class="video-reference-card" @click="handleReferenceStackClick">
              <template v-if="videoReferenceImages?.length">
                <span v-for="(item, index) in videoReferenceImages.slice(0, 3)" :key="item.id" class="video-reference-stack-image" :class="`stack-${index + 1}`">
                  <img :src="item.preview" :alt="item.name" />
                </span>
                <b>{{ videoReferenceImages?.length }}</b>
              </template>
              <span v-else>参考图</span>
            </button>
            <button v-if="videoReferenceImages?.length" type="button" class="video-reference-add" @click.stop="toggleReferenceMenu">+</button>
          </div>
          <div v-if="referenceStackExpanded && videoReferenceImages?.length" class="video-reference-strip">
            <article v-for="item in videoReferenceImages" :key="item.id">
              <img :src="item.preview" :alt="item.name" />
              <button type="button" @click="removeVideoReference(item.id)">×</button>
            </article>
          </div>
          <div v-if="showReferenceMenu" class="video-reference-menu">
            <button type="button" @click="chooseReferenceSource('camera')">扫描上传</button>
            <button type="button" @click="chooseReferenceSource('upload')">本地上传</button>
            <button type="button" @click="chooseReferenceSource('library')">资源库</button>
          </div>
          <input ref="referenceCameraInput" class="file-input" type="file" accept="image/*" capture="environment" @change="handleReferenceFile" />
          <input ref="referenceUploadInput" class="file-input" type="file" accept="image/*" multiple @change="handleReferenceFile" />
          <input ref="mentionImageInput" class="file-input" type="file" accept="image/*" multiple @change="handleMentionImageFile" />
          <button class="studio-reference" type="button" @click="showProjectPicker = true">参考图</button>
          <div class="studio-prompt-field prompt-composer">
            <div
              ref="videoPromptInputRef"
              class="video-prompt-editor pro-prompt-textarea"
              contenteditable="true"
              role="textbox"
              aria-label="视频提示词"
              aria-multiline="true"
              data-placeholder="提示词输入"
              @click="handleVideoPromptClick"
              @focus="saveVideoPromptSelection"
              @input="handleVideoPromptInput"
              @keyup="saveVideoPromptSelection"
              @mouseup="saveVideoPromptSelection"
              @paste="handleVideoPromptPaste"
            />
          </div>
          <div class="studio-composer-actions pro-action-stack">
            <button type="button" title="退格" aria-label="删掉最后一个字" @click="backspaceVideoPrompt">
              <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M7.5 4.5H16a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H7.5L2.5 10z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><path d="m9.5 8 4 4m0-4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
              <span>退格</span>
            </button>
            <button type="button" class="voice-action-btn" :class="{ active: listening }" title="语音输入" @click="toggleSpeech">
              <span class="voice-wave" aria-hidden="true"></span>
              <svg v-if="!listening" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="7" y="2.5" width="6" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
              <span>{{ listening ? '结束' : '语音' }}</span>
            </button>
            <button type="button" class="send-action-btn" :disabled="!materials.length" title="发送生成" @click="startTask">
              <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3.5 10 16.5 4l-4 12.5-2.6-5.3z" fill="currentColor" /></svg>
              <span>发送</span>
            </button>
          </div>
          <div class="prompt-chip-row">
            <div class="chip-menu-wrap model-menu-wrap">
              <button type="button" class="prompt-chip model-chip" :class="{ active: activeChipMenu === 'model' }" :title="`模型：${selectedVideoModel.label}`" @click="toggleChipMenu('model')"><span class="chip-text">模型：{{ selectedVideoModel.label }}</span></button>
              <div v-if="activeChipMenu === 'model'" class="chip-option-panel model-panel">
                <button
                  v-for="item in availableVideoModels"
                  :key="item.id"
                  type="button"
                  :class="{ selected: form.modelId === item.id }"
                  @click="selectVideoModel(item.id)"
                >
                  <strong>{{ item.label }}</strong>
                  <small>{{ item.cost }} Token/段</small>
                </button>
              </div>
            </div>
            <div class="chip-menu-wrap">
              <button type="button" class="prompt-chip" :class="{ active: activeChipMenu === 'video-settings' }" @click="toggleChipMenu('video-settings')">视频设置：{{ videoSettingsSummary }}</button>
              <div v-if="activeChipMenu === 'video-settings'" class="chip-option-panel video-settings-panel">
                <label>选择比例</label>
                <div class="video-settings-options ratio-settings-options">
                  <button v-for="item in videoRatioOptions" :key="item.value" type="button" :class="{ selected: form.ratio === item.value }" @click="selectVideoRatio(item.value)">
                    <span class="ratio-icon" :style="{ aspectRatio: item.aspect }"></span><small>{{ item.label }}</small>
                  </button>
                </div>
                <label>选择分辨率</label>
                <div class="video-settings-options resolution-options">
                  <button v-for="item in videoResolutionOptions" :key="item" type="button" :class="{ selected: form.resolution === item }" @click="form.resolution = item">{{ item }}</button>
                </div>
                <label>选择生成数量</label>
                <div class="video-settings-options four-options">
                  <button v-for="item in videoCountOptions" :key="item" type="button" :class="{ selected: form.count === item }" @click="form.count = item">{{ item }}</button>
                </div>
              </div>
            </div>
            <div class="chip-menu-wrap">
              <button type="button" class="prompt-chip" :class="{ active: activeChipMenu === 'template' }" @click="toggleChipMenu('template')">视频风格：{{ form.template }}</button>
              <div v-if="activeChipMenu === 'template'" class="chip-option-panel style-panel">
                <button v-for="item in proTemplates" :key="item" type="button" :class="{ selected: form.template === item }" @click="selectVideoTemplate(item)">{{ item }}</button>
              </div>
            </div>
            <div class="chip-menu-wrap prompt-optimize-wrap">
              <button type="button" class="prompt-chip prompt-optimize-action" :class="{ active: optimizing }" :disabled="optimizing" @click="optimizeVideoPromptFromChip">{{ optimizing ? '优化中...' : `提示词AI优：${videoStrengthLabel}` }}</button>
              <button type="button" class="prompt-chip prompt-chip-caret" :class="{ active: activeChipMenu === 'optimize' }" :disabled="optimizing" title="选择优化强度" aria-label="选择提示词优化强度" @click="toggleChipMenu('optimize')">⌄</button>
              <div v-if="activeChipMenu === 'optimize'" class="chip-option-panel compact">
                <button v-for="item in strengthOptions" :key="item.value" type="button" :class="{ selected: form.strength === item.value }" @click="selectVideoOptimizeStrength(item.value)">{{ item.label }}</button>
              </div>
            </div>
            <div class="mention-menu-wrap">
              <button type="button" class="prompt-chip mention-trigger" :class="{ active: showMentionPanel }" title="添加参考图或技能" @mousedown.prevent="saveVideoPromptSelection" @click="toggleMentionPanel">@</button>
              <div v-if="showMentionPanel" class="mention-panel">
                <div class="mention-tabs">
                  <button type="button" :class="{ active: mentionTab === 'upload' }" @click="mentionTab = 'upload'">上传图片</button>
                  <button type="button" :class="{ active: mentionTab === 'skill' }" @click="mentionTab = 'skill'">技能</button>
                </div>
                <div v-if="mentionTab === 'upload'" class="mention-upload-pane">
                  <button type="button" class="mention-upload-btn" @mousedown.prevent="saveVideoPromptSelection" @click="triggerMentionImageUpload">
                    <strong>选择本地图片</strong>
                    <span>上传后作为参考图参与生成，并显示在输入框内。</span>
                  </button>
                  <p v-if="videoPromptAttachments.length">已加入 {{ videoPromptAttachments.length }} 张 @ 图片附件</p>
                  <p v-else>支持一次上传多张 PNG / JPG 图片。</p>
                </div>
                <div v-else class="mention-skill-pane">
                  <button
                    v-for="skill in studioSkills"
                    :key="skill.id"
                    type="button"
                    :class="{ selected: activeStudioSkill === skill.id }"
                    @click="selectMentionSkill(skill)"
                  >
                    <strong>@{{ skill.title }}</strong>
                    <span>{{ skill.description }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
      </section>
    </section>

    <el-dialog v-model="showProjectPicker" :title="referencePickerMode ? '从资源库选择参考素材' : '从我的素材库选取素材'" width="680px">
      <div class="picker-grid">
        <article v-for="project in projectStore.projects" :key="project.id" class="picker-card" @click="pickProject(project)">
          <div class="picker-cover" :style="{ background: project.cover || fallbackCover }">{{ project.title.slice(0, 1) }}</div>
          <strong>{{ project.title }}</strong>
          <p>{{ project.prompt || '暂无构思文字' }}</p>
        </article>
      </div>
    </el-dialog>
    <el-dialog v-model="showVideoReferenceLibrary" title="从资源库选择参考素材" width="760px">
      <div class="library-mode-tabs">
        <button type="button" :class="{ active: videoReferenceLibraryMode === 'mine' }" @click="selectVideoReferenceLibraryMode('mine')">我的素材</button>
        <button type="button" :class="{ active: videoReferenceLibraryMode === 'square' }" @click="selectVideoReferenceLibraryMode('square')">作品广场</button>
      </div>
      <div class="library-filter-row">
        <button v-for="item in videoReferenceCategoryOptions" :key="item.value" type="button" :class="{ active: videoReferenceLibraryCategory === item.value }" @click="videoReferenceLibraryCategory = item.value">{{ item.label }}</button>
      </div>
      <div class="library-grid">
        <article v-for="item in visibleVideoReferenceLibraryMaterials" :key="item.id" :title="item.title" :aria-label="item.title" @click="useVideoReferenceLibraryMaterial(item)">
          <div class="library-thumb" :style="{ background: item.cover }"></div>
        </article>
      </div>
      <div v-if="!visibleVideoReferenceLibraryMaterials.length" class="library-empty">当前分类没有可用图片。只有真实上传图或已生成作品可作为图生视频参考图。</div>
    </el-dialog>
    <el-dialog v-model="showVideoPreview" class="video-preview-dialog" width="min(94vw, 1180px)" destroy-on-close>
      <video v-if="activeVideoPreview?.videoUrl" class="video-preview-dialog__player" :src="activeVideoPreview.videoUrl" controls autoplay playsinline />
    </el-dialog>
  </main>
</template>

<script setup>
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import BaseButton from '../components/base/BaseButton.vue'
import { useDifficultyStore } from '../stores/difficultyStore'
import { useProjectStore } from '../stores/projectStore'
import { useGalleryStore } from '../stores/galleryStore'
import { createMockTask } from '../services/mockTaskService'
import { generateVideo, getVideoTask, optimizeArtworkPrompt, testAiConnection, transcribeArtworkVoice } from '../services/aiGateway'
import { listStudentAiSkills, runStudentAiSkill } from '../services/aiSkillGateway'
import { resolveSmartRatio } from '../utils/smartRatio'
import { apiClient } from '../services/apiClient'
import { useSketchMaterials } from '../composables/useSketchMaterials'
import StudentAgentDock from '../components/StudentAgentDock.vue'

const SERVER_AUTH_MODE = import.meta.env.VITE_AUTH_MODE === 'server'

const PanelCard = defineComponent({
  props: {
    title: { type: String, required: true },
    open: { type: Boolean, default: true },
  },
  emits: ['toggle'],
  setup(props, { slots, emit }) {
    return () => h('section', { class: 'setting-card' }, [
      h('button', { class: 'module-title', onClick: () => emit('toggle') }, [
        h('span', props.title),
        h('small', props.open ? '收起' : '展开'),
      ]),
      props.open ? h('div', { class: 'module-body' }, slots.default?.()) : null,
    ])
  },
})

const SingleMaterialPreview = defineComponent({
  props: { material: { type: Object, default: null } },
  setup(props) {
    return () => props.material
      ? h('article', { class: 'single-material' }, [
        h('div', { class: 'single-material__cover', style: { background: props.material.cover } }, props.material.title?.slice(0, 1) || '图'),
        h('strong', props.material.title),
      ])
      : h('div', { class: 'soft-empty' }, '还没有选择作品')
  },
})

const MaterialStrip = defineComponent({
  props: { materials: { type: Array, default: () => [] } },
  emits: ['move', 'remove'],
  setup(props, { emit }) {
    return () => props.materials.length
      ? h('div', { class: 'material-strip' }, props.materials.map((item, index) => h('article', { class: 'material-card', key: item.id }, [
        h('div', { class: 'material-thumb', style: { background: item.cover } }, String(index + 1)),
        h('strong', item.title),
        h('div', { class: 'material-actions' }, [
          h('button', { disabled: index === 0, onClick: () => emit('move', index, -1) }, '前移'),
          h('button', { disabled: index === props.materials.length - 1, onClick: () => emit('move', index, 1) }, '后移'),
          h('button', { onClick: () => emit('remove', index) }, '删除'),
        ]),
      ])))
      : h('div', { class: 'soft-empty' }, '还没有素材，请先选择作品或上传图片。')
  },
})

const router = useRouter()
const projectStore = useProjectStore()
const galleryStore = useGalleryStore()
const difficultyStore = useDifficultyStore()
// 四档用户入口统一使用高级版视频工作区和任务参数。
const difficulty = computed(() => 'pro')
const fallbackCover = 'linear-gradient(135deg, #ff7a00, #ffd166)'
const fileInput = ref(null)
const referenceCameraInput = ref(null)
const referenceUploadInput = ref(null)
const mentionImageInput = ref(null)
const videoPromptInputRef = ref(null)
const showProjectPicker = ref(false)
const showVideoReferenceLibrary = ref(false)
const referencePickerMode = ref(false)
const showReferenceMenu = ref(false)
const referenceStackExpanded = ref(false)
const showMentionPanel = ref(false)
const mentionTab = ref('upload')
const activeChipMenu = ref('')
const running = ref(false)
const scriptLoading = ref(false)
const optimizing = ref(false)
const listening = ref(false)
const playing = ref(false)
const showVideoPreview = ref(false)
const activeVideoPreview = ref(null)
const activeStudioSkill = ref('camera')
const managedSkillValues = reactive({})
const materials = ref([])
const videoReferenceImages = ref([])
const referenceUploadSource = ref('local')
const videoReferenceLibraryMode = ref('mine')
const videoReferenceLibraryCategory = ref('all')
// 手绘板存下来的稿子也能当图生视频的首帧参考。
const { sketchMaterials, loadSketchMaterials } = useSketchMaterials()
const voiceStory = ref('')
const activeVideoProjectId = ref('')
const task = reactive(createMockTask('video', {}))
const videoHistory = ref([])
const videoJobs = ref([])
const videoSubmissionQueue = []
let videoSubmissionQueueRunning = false
const resumedVideoTaskIds = new Set()
const videoPreviewItems = computed(() => {
  const seen = new Set()
  return [...videoJobs.value, task.result, ...videoHistory.value]
    .filter(Boolean)
    .filter((item) => {
      const key = item.taskId || item.id
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
})
const hasActiveVideoJobs = computed(() => videoJobs.value.some((item) => isVideoJobActive(item)))

// 视频页的小智能体：用户说一句想要什么视频，它整理成视频描述并直接提交生成。
const agentVideoSamples = [
  '让我这张画动起来，慢慢推进',
  '做一个恐龙在森林里走的视频',
  '画面加风吹的效果，再配点轻音乐',
]
/**
 * 交给智能体的「画布快照」：用户此刻的视频设置。
 * 有这一份，用户说「换个比例再来一条」时老师才知道现在是 9:16 还是 16:9。
 */
const agentCanvasContext = computed(() => ({
  prompt: String(form.positivePrompt || '').trim(),
  ratio: form.ratio,
  duration: form.duration,
  count: form.count ? String(form.count) : '',
  music: form.music,
  negativePrompt: String(form.negativePrompt || '').trim(),
}))
async function handleAgentExecute(payload = {}) {
  const prompt = String(payload.prompt || '').trim()
  if (!prompt) return
  form.positivePrompt = prompt
  await nextTick()
  // 视频必须挂一张作品素材，这是页面原有的硬规则，不在这里擅自放宽。
  if (!materials.value.length && !activeManagedStudioSkill.value) {
    ElMessage.warning('想法我先记下了，你在上面选一张作品素材，再点生成视频。')
    return
  }
  await startTask()
}

let savedVideoPromptRange = null
let activeRecognition = null
let activeVoiceStream = null
let activeAudioContext = null
let activeAudioSource = null
let activeAudioProcessor = null
let recordedVoiceChunks = []
let recordedVoiceSampleRate = 44100
let voiceTranscript = ''
let voiceInterimTranscript = ''
const panels = reactive({ materials: true, basic: true, tags: true, script: true, audio: true })
// 提交后输入框清空，但重生成/再次提交仍要带上刚才那句提示词
const lastSubmittedPrompt = ref('')
const form = reactive({
  duration: '10s',
  customDuration: 10,
  ratio: '9:16',
  template: '卡通动一动',
  mode: 'template',
  music: '轻柔音乐',
  subtitle: true,
  shortPrompt: '',
  script: '',
  positivePrompt: '',
  negativePrompt: '',
  motionStrength: 55,
  strengthLevel: '中',
  cameraSpeed: 45,
  shotDuration: 4,
  transition: 'fade',
  voiceover: '',
  linePreprocess: true,
  referenceOverlay: false,
  quality4k: false,
  frameRate: '24fps',
  model: 'agnes',
  modelId: 'agnes-video-v2.0',
  count: 1,
  resolution: '720P',
  strength: 'balanced',
})

const juniorTemplates = ['卡通动一动', '梦幻光影', '水彩流动']
const starterTemplates = ['卡通动一动', '梦幻光影', '水彩流动', '故事动画']
const advancedTemplates = ['卡通动一动', '梦幻光影', '水彩流动', '故事动画', '音乐短片', '课堂展示']
const proTemplates = ['无模板自由创作', ...advancedTemplates, '电影镜头', '专业作品集']
const durations = ['5s', '10s', '15s']
const ratios = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']
const starterRatios = ['16:9', '1:1', '9:16']
const starterMusic = ['轻快儿歌', '舒缓纯音乐', '电影氛围']
const allMusic = ['无音乐', '轻快儿歌', '舒缓纯音乐', '电影氛围']
const simpleStrength = ['弱', '中', '强']
const frameRates = ['24fps', '30fps', '60fps']
const defaultVideoModels = [
  { id: 'agnes-video-v2.0', label: 'Agnes AI 视频 2.0', provider: 'agnes', model: 'agnes-video-v2.0', cost: 24, configured: true },
]
const videoModelOptions = ref([])
const videoCountOptions = [1, 2, 3, 4]
const videoResolutionOptions = ['480P', '720P', '1080P', '2K', '4K']
const videoRatioOptions = [
  { label: '智能', value: '自动', aspect: '1 / 1' },
  { label: '21:9', value: '21:9', aspect: '21 / 9' },
  { label: '16:9', value: '16:9', aspect: '16 / 9' },
  { label: '4:3', value: '4:3', aspect: '4 / 3' },
  { label: '1:1', value: '1:1', aspect: '1 / 1' },
  { label: '3:4', value: '3:4', aspect: '3 / 4' },
  { label: '9:16', value: '9:16', aspect: '9 / 16' },
]
const videoReferenceCategoryOptions = [
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
const strengthOptions = [{ label: '基础', value: 'safe' }, { label: '一般', value: 'balanced' }, { label: '深度', value: 'creative' }]
const defaultStudioSkills = [
  { id: 'camera', title: '动态运镜', description: '推进 / 拉远 / 环绕', template: '电影镜头', transition: 'zoom', prompt: '镜头缓慢推进，电影感运镜，主体始终清晰稳定' },
  { id: 'action', title: '动作运动', description: '走动 / 挥手 / 转身', template: '故事动画', prompt: '角色自然行走并轻轻挥手，动作连贯，肢体比例稳定，避免突然跳动或重复肢体' },
  { id: 'expression', title: '微表情', description: '眨眼 / 微笑 / 呼吸', prompt: '自然眨眼，轻微微笑，细腻面部表情变化，轻柔呼吸感，保持人物身份一致' },
  { id: 'rhythm', title: '镜头节奏', description: '快慢与镜头停顿', template: '故事动画', transition: 'fade', prompt: '镜头节奏舒缓，动作有自然停顿，画面平稳连贯' },
  { id: 'style', title: '视频风格', description: '写实 / 插画 / 动画', template: '梦幻光影', prompt: '保持统一的插画动画质感，色彩柔和，光影自然' },
  { id: 'transition', title: '转场效果', description: '淡入 / 推镜 / 叠化', transition: 'page', prompt: '使用柔和自然的场景衔接，避免突兀切换' },
  { id: 'music', title: '视频配乐', description: '氛围 / 节奏 / 童趣', music: '电影氛围' },
  { id: 'subtitle', title: '片尾字幕', description: '标题 / 署名 / 课程', subtitle: true },
]
const studioSkills = ref(defaultStudioSkills)
// 后台上传的玩法卡片图（configuration.presentation.coverUrl），没有则沿用 CSS 插画。
function studioSkillCoverUrl(skill) {
  return skill?.configuration?.presentation?.coverUrl || skill?.presentation?.coverUrl || ''
}
function studioSkillCoverStyle(skill) {
  const url = studioSkillCoverUrl(skill)
  return url ? { backgroundImage: `url("${url}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}
}
const advancedTagGroups = [
  { title: '镜头运镜', items: ['缓慢推进', '左右平移', '轻微旋转', '定格展示'] },
  { title: '动态效果', items: ['角色挥手', '背景发光', '云朵飘动', '颜色渐变'] },
  { title: '氛围风格', items: ['温暖课堂', '梦幻童话', '清新水彩', '节日快乐'] },
]
const proTagGroups = [
  { title: '运镜', items: ['dolly in', 'pan left', 'orbit camera', 'rack focus'] },
  { title: '动态', items: ['subtle character motion', 'fluid background motion', 'particle glow', 'parallax depth'] },
  { title: '画质', items: ['high detail', 'clean edges', 'stable frame', 'sharp focus'] },
  { title: '光影', items: ['soft cinematic light', 'volumetric glow', 'warm rim light', 'watercolor diffusion'] },
]

const headerText = computed(() => {
  const map = {
    junior: '初级版是一键模板创作，不展示任何提示词和参数。',
    starter: '入门版用单图、模板和语音补充完成视频创作。',
    advanced: '进阶版开放标签式短提示词和轻量参数。',
    pro: '高级版开放正反向提示词、运镜、画质和完整专业参数。',
  }
  return map[difficulty.value] || map.starter
})
const previewSubtitle = computed(() => `${effectiveDuration.value} · ${form.ratio} · ${form.template}`)
const effectiveDuration = computed(() => (difficulty.value === 'pro' ? `${form.customDuration}s` : form.duration))
const ratioClass = computed(() => videoRatioClass(form.ratio))
const videoGenerationCount = computed(() => Math.min(Math.max(Number(form.count) || 1, 1), 4))
const availableVideoModels = computed(() => videoModelOptions.value.filter((item) => item.configured))
const selectedVideoModel = computed(() => availableVideoModels.value.find((item) => item.id === form.modelId) || availableVideoModels.value[0] || { label: '暂无可用视频模型', cost: 24 })
const videoRatioLabel = computed(() => videoRatioOptions.find((item) => item.value === form.ratio)?.label || form.ratio)
const videoSettingsSummary = computed(() => `${videoRatioLabel.value} · ${form.resolution} · ${form.count}`)
const videoStrengthLabel = computed(() => strengthOptions.find((item) => item.value === form.strength)?.label || '一般')
const videoPromptAttachments = computed(() => videoReferenceImages.value.filter((item) => item.source === 'mention-upload'))
const activeManagedStudioSkill = computed(() => studioSkills.value.find((item) => item.id === activeStudioSkill.value && item.managedSkill) || null)
const visibleVideoReferenceLibraryMaterials = computed(() => {
  const matchesCategory = (item) => videoReferenceLibraryCategory.value === 'all' || item.category === videoReferenceLibraryCategory.value
  const toLibraryItem = (item, source) => {
    const preview = extractVideoReferenceImageUrl(item)
    if (!preview) return null
    return {
      id: `${source}-${item.id || item.title || Math.random()}`,
      source,
      title: item.title || item.name || '参考图',
      prompt: item.prompt || item.batchPrompt || '',
      category: inferVideoReferenceCategory(item),
      preview,
      cover: `url("${preview}") center / cover no-repeat`,
    }
  }
  const mine = [
    ...videoReferenceImages.value.map((item) => toLibraryItem(item, '我的上传素材')),
    ...sketchMaterials.value.map((item) => toLibraryItem(item, '我的手绘稿')),
    ...materials.value.map((item) => toLibraryItem(item, '当前视频素材')),
    ...projectStore.projects.map((item) => toLibraryItem(item, '我的素材库')),
  ].filter(Boolean)
  const square = (galleryStore.publishedWorks || []).map((item) => toLibraryItem(item, '作品广场')).filter(Boolean)
  return (videoReferenceLibraryMode.value === 'square' ? square : mine).filter(matchesCategory)
})
const previewActions = computed(() => {
  if (difficulty.value === 'junior') return [
    { key: 'save', label: '保存到素材库', variant: 'primary' },
    { key: 'report', label: '生成创作报告', variant: 'secondary' },
  ]
  if (difficulty.value === 'starter') return [
    { key: 'save', label: '保存素材库', variant: 'primary' },
    { key: 'report', label: '生成报告', variant: 'secondary' },
    { key: 'poster', label: '分享海报', variant: 'text' },
    { key: 'download', label: '导出MP4', variant: 'text' },
  ]
  if (difficulty.value === 'advanced') return [
    { key: 'regenerate', label: '重新生成', variant: 'secondary' },
    { key: 'save', label: '保存到素材库', variant: 'primary' },
    { key: 'report', label: '生成配套创作报告', variant: 'secondary' },
    { key: 'download', label: '导出MP4本地', variant: 'text' },
    { key: 'poster', label: '生成分享海报', variant: 'text' },
  ]
  return [
    { key: 'regenerate', label: '重新精细生成', variant: 'secondary' },
    { key: 'trim', label: '视频裁剪', variant: 'text' },
    { key: 'cover', label: '截取封面', variant: 'text' },
    { key: 'batch', label: '批量导出', variant: 'text' },
    { key: 'report', label: '生成完整项目报告', variant: 'secondary' },
    { key: 'save', label: '保存到素材库', variant: 'primary' },
  ]
})
const statusText = computed(() => {
  const map = { queued: '准备提交视频任务', submitting: '正在上传素材', processing: 'AI 正在整理分镜', rendering: '正在生成视频预览', succeeded: '生成完成', failed: '生成失败' }
  return map[task.status] || '准备生成'
})

onMounted(async () => {
  applyDifficultyDefaults()
  loadSketchMaterials()
  const source = projectStore.currentProject || projectStore.draft || projectStore.projects[0]
  if (source) {
    projectStore.openProject(source.id)
    activeVideoProjectId.value = source.id
    restoreProjectVideoTasks(projectStore.currentProject || source)
    await restoreLocalCache(source.id)
    pickProject(source, false)
    resumePersistedVideoJobs()
  } else {
    await restoreLocalCache()
    resumePersistedVideoJobs()
  }
  refreshAvailableVideoModels()
  void loadPublishedVideoSkills()
  nextTick(() => syncVideoPromptEditorFromText(form.positivePrompt))
})

onBeforeUnmount(() => {
  stopVideoVoiceInput()
})

watch(difficulty, () => {
  applyDifficultyDefaults()
  filterMaterialsForDifficulty()
})
watch([form, materials, videoReferenceImages, videoHistory, videoJobs, () => task.result], saveLocalCache, { deep: true })
watch(() => form.positivePrompt, (value) => {
  syncVideoPromptEditorFromText(value)
})

function applyDifficultyDefaults() {
  if (difficulty.value === 'junior') Object.assign(form, { duration: '10s', ratio: '9:16', template: '卡通动一动', music: '轻柔音乐', subtitle: true })
  if (difficulty.value === 'starter') Object.assign(form, { duration: '10s', ratio: '9:16', template: '卡通动一动', music: '轻快儿歌', subtitle: true })
  if (difficulty.value === 'pro') Object.assign(form, { ratio: '16:9', template: '电影镜头', music: '电影氛围' })
}
async function loadPublishedVideoSkills() {
  if (import.meta.env.VITE_AUTH_MODE !== 'server') return
  try {
    const skills = await listStudentAiSkills('video')
    if (!skills.length) return
    studioSkills.value = skills.map((skill) => ({
      ...skill,
      id: skill.id,
      description: skill.summary || '按讲师配置的玩法生成视频',
      managedSkill: true,
      prompt: skill.configuration?.generation?.promptTemplate || '',
    }))
    selectStudioSkill(studioSkills.value[0])
  } catch (error) {
    console.warn('无法读取已发布视频玩法', error)
  }
}
function filterMaterialsForDifficulty() {
  if (['junior', 'starter'].includes(difficulty.value) && materials.value.length > 1) materials.value = materials.value.slice(0, 1)
}
function togglePanel(key) {
  panels[key] = !panels[key]
}
function selectTemplate(item) {
  form.template = item
}
function selectStudioSkill(skill) {
  activeStudioSkill.value = skill.id
  Object.keys(managedSkillValues).forEach((key) => delete managedSkillValues[key])
  if (skill.managedSkill) {
    ;(skill.configuration?.inputFields || []).forEach((field) => {
      managedSkillValues[field.key] = field.type === 'switch' ? Boolean(field.defaultValue) : (field.defaultValue || '')
    })
    form.ratio = skill.configuration?.generation?.ratio || form.ratio
    form.resolution = skill.configuration?.generation?.resolution || form.resolution
    ElMessage.success(`已选择“${skill.title}”，本次将按后台玩法配置提交`)
    return
  }
  if (skill.template) form.template = skill.template
  if (skill.transition) form.transition = skill.transition
  if (skill.music) form.music = skill.music
  if (typeof skill.subtitle === 'boolean') form.subtitle = skill.subtitle
  if (skill.prompt && !form.positivePrompt.includes(skill.prompt)) {
    form.positivePrompt = [form.positivePrompt.trim(), skill.prompt].filter(Boolean).join('，')
    ElMessage.success(`已应用「${skill.title}」Skill，将在本次真实视频生成中生效`)
  }
}
function openStudioSkillCard(skill) {
  if (skill.managedSkill) {
    router.push(`/student/skills/${encodeURIComponent(skill.id)}`)
    return
  }
  // 与绘画页一致：源码写死的示例卡片只占位，点击不产生任何效果，
  // 避免用户把「示例卡」误当成老师配置好的玩法。
}
async function refreshAvailableVideoModels() {
  try {
    const health = await testAiConnection()
    const providerData = health?.data?.providers
    const providers = Array.isArray(providerData)
      ? providerData
      : Object.entries(providerData || {}).map(([key, value]) => ({ key, ...value }))
    const options = providers
      .filter((item) => item.configured)
      .flatMap((item) => (item.videoModels || (item.videoModel ? [item.videoModel] : [])).map((model) => ({
        id: `${item.key}-${model}`,
        label: `${item.label || item.key} · ${item.modelLabels?.[model] || model}`,
        provider: item.key,
        model,
        cost: defaultVideoModels.find((entry) => entry.provider === item.key)?.cost || 24,
        configured: true,
      })))
    videoModelOptions.value = options
    if (!options.some((item) => item.id === form.modelId)) form.modelId = options[0]?.id || ''
  } catch {
    videoModelOptions.value = []
  }
}
function toggleChipMenu(name) {
  showMentionPanel.value = false
  showReferenceMenu.value = false
  referenceStackExpanded.value = false
  activeChipMenu.value = activeChipMenu.value === name ? '' : name
}
function selectVideoModel(id) {
  const item = availableVideoModels.value.find((model) => model.id === id)
  form.modelId = id
  form.model = item?.provider || form.model
  activeChipMenu.value = ''
}
function cycleVideoCount() {
  const index = videoCountOptions.indexOf(Number(form.count))
  form.count = videoCountOptions[(index + 1) % videoCountOptions.length]
}
function selectVideoRatio(value) {
  form.ratio = value
  activeChipMenu.value = ''
}
function selectVideoTemplate(value) {
  form.template = value
  activeChipMenu.value = ''
}
async function selectVideoOptimizeStrength(value) {
  form.strength = value
  activeChipMenu.value = ''
  await optimizeVideoPrompt()
}
async function optimizeVideoPromptFromChip() {
  activeChipMenu.value = ''
  showMentionPanel.value = false
  showReferenceMenu.value = false
  referenceStackExpanded.value = false
  await optimizeVideoPrompt()
}
async function optimizeVideoPrompt() {
  syncVideoPromptFromEditor()
  if (!form.positivePrompt.trim()) {
    ElMessage.warning('请先填写需要优化的提示词')
    return
  }
  optimizing.value = true
  try {
    const result = await optimizeArtworkPrompt({ prompt: form.positivePrompt, strength: form.strength, flowKey: 'video.cameraPrompt' })
    form.positivePrompt = result.prompt
    await nextTick()
    syncVideoPromptEditorFromText(form.positivePrompt, true)
    ElMessage.success('提示词智能体已完成优化')
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || error.message || '提示词优化失败，请稍后重试')
  } finally {
    optimizing.value = false
  }
}
function triggerUpload() {
  fileInput.value?.click()
}
function pickProject(project, close = true) {
  if (referencePickerMode.value) {
    const preview = extractVideoReferenceImageUrl(project)
    if (!preview) {
      ElMessage.warning('该资源只有提示词或渐变封面，没有可发送给 AI 的真实图片。请选择上传图或已生成的作品。')
      return
    }
    videoReferenceImages.value.push({
      id: `reference-project-${Date.now()}`,
      name: project.title,
      preview,
      source: 'library',
    })
    referencePickerMode.value = false
    referenceStackExpanded.value = false
    if (close) showProjectPicker.value = false
    return
  }
  if (['junior', 'starter'].includes(difficulty.value)) materials.value = []
  const material = { id: `${project.id}-${Date.now()}`, projectId: project.id, title: project.title, cover: project.cover || fallbackCover, prompt: project.prompt || '' }
  if (!materials.value.some((item) => item.projectId === project.id)) materials.value.push(material)
  filterMaterialsForDifficulty()
  if (project.id) {
    projectStore.openProject(project.id)
    activeVideoProjectId.value = project.id
    restoreProjectVideoTasks(projectStore.currentProject || project)
  }
  if (close) showProjectPicker.value = false
}
function handleReferenceStackClick() {
  showMentionPanel.value = false
  if (videoReferenceImages.value.length) {
    referenceStackExpanded.value = !referenceStackExpanded.value
    showReferenceMenu.value = false
    return
  }
  toggleReferenceMenu()
}
function toggleReferenceMenu() {
  showReferenceMenu.value = !showReferenceMenu.value
  referenceStackExpanded.value = false
  showMentionPanel.value = false
}
function chooseReferenceSource(type) {
  showReferenceMenu.value = false
  if (type === 'camera') {
    referenceUploadSource.value = 'scan'
    referenceCameraInput.value?.click()
  } else if (type === 'upload') {
    referenceUploadSource.value = 'local'
    referenceUploadInput.value?.click()
  }
  else {
    videoReferenceLibraryMode.value = 'mine'
    videoReferenceLibraryCategory.value = 'all'
    showVideoReferenceLibrary.value = true
    loadSketchMaterials()
  }
}
function selectVideoReferenceLibraryMode(mode) {
  videoReferenceLibraryMode.value = mode
  videoReferenceLibraryCategory.value = 'all'
}
function inferVideoReferenceCategory(item = {}) {
  const text = `${item.category || item.courseCategory || item.theme || item.type || ''} ${item.title || item.name || ''} ${item.prompt || item.batchPrompt || ''}`.toLowerCase()
  const rules = [
    ['门头设计', ['门头', '招牌', '店铺']], ['IP形象', ['ip', '形象', '吉祥物']], ['广告设计', ['广告', '海报', '宣传']],
    ['漫画人物', ['漫画', '动漫', '人物', '表情']], ['产品设计', ['产品', '包装', '盒型']], ['室内设计', ['室内', '房间', '空间']],
    ['汽车造型', ['汽车', '车', '交通']], ['教育绘本', ['绘本', '分镜', '故事书']],
  ]
  return rules.find(([, words]) => words.some((word) => text.includes(word)))?.[0] || '创意画'
}
function useVideoReferenceLibraryMaterial(item) {
  if (!item?.preview) {
    ElMessage.warning('该素材没有可发送给 AI 的真实图片。')
    return
  }
  if (!videoReferenceImages.value.some((reference) => reference.preview === item.preview)) {
    videoReferenceImages.value.push({
      id: `reference-library-${Date.now()}`,
      name: item.title,
      preview: item.preview,
      source: item.source,
    })
  }
  if (item.prompt && !form.positivePrompt.includes(item.prompt)) form.positivePrompt = [form.positivePrompt, item.prompt].filter(Boolean).join('，')
  showVideoReferenceLibrary.value = false
  referenceStackExpanded.value = Boolean(videoReferenceImages.value.length)
  ElMessage.success('已加入参考图，本次视频生成将使用该图片作为起始画面')
}
function readVideoReference(file, source = 'reference') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({
      id: `${source}-${Date.now()}-${file.name}`,
      name: file.name.replace(/\.[^.]+$/, ''),
      preview: String(reader.result || ''),
      source,
    })
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
function handleReferenceFile(event) {
  const files = Array.from(event.target.files || []).filter((file) => file.type?.startsWith('image/'))
  if (!files.length) return
  Promise.all(files.map((file) => readVideoReference(file, referenceUploadSource.value)))
    .then((items) => {
      videoReferenceImages.value.push(...items)
      referenceStackExpanded.value = items.length > 1
      ElMessage.success(`已添加${items.length}张参考图，本次视频生成将使用首张图片作为起始画面`)
    })
    .finally(() => { event.target.value = '' })
}
function extractVideoReferenceImageUrl(item = {}) {
  const finalVersion = item.versions?.find((version) => version.id === item.finalVersionId) || item.versions?.[0] || {}
  const direct = [item.preview, item.imageUrl, item.url, item.finalArtworkUrl, finalVersion.imageUrl, finalVersion.preview, finalVersion.url].find(Boolean)
  if (direct) return String(direct)
  const background = String(finalVersion.background || item.background || item.cover || '')
  const match = background.match(/url\(["']?([^"')]+)["']?\)/)
  return match?.[1] || (background.startsWith('data:image/') || /^https?:\/\//.test(background) ? background : '')
}
function removeVideoReference(id) {
  videoReferenceImages.value = videoReferenceImages.value.filter((item) => item.id !== id)
  removeVideoPromptImageChips(id)
  if (!videoReferenceImages.value.length) referenceStackExpanded.value = false
}
function triggerMentionImageUpload() {
  showMentionPanel.value = false
  mentionImageInput.value?.click()
}
function toggleMentionPanel() {
  activeChipMenu.value = ''
  showMentionPanel.value = !showMentionPanel.value
  showReferenceMenu.value = false
  referenceStackExpanded.value = false
}
function selectMentionSkill(skill) {
  selectStudioSkill(skill)
  insertVideoPromptSkillChip(skill)
  showMentionPanel.value = false
}
function handleMentionImageFile(event) {
  const files = Array.from(event.target.files || []).filter((file) => file.type?.startsWith('image/'))
  if (!files.length) return
  Promise.all(files.map((file) => readVideoReference(file, 'mention-upload')))
    .then((items) => {
      videoReferenceImages.value.push(...items)
      items.forEach(appendMentionReference)
      ElMessage.success(`已通过@加入${items.length}张图片`)
    })
    .finally(() => { event.target.value = '' })
}
function appendMentionReference(item) {
  insertVideoPromptImageChip(item)
  showMentionPanel.value = false
}
function isRangeInsideVideoPrompt(range) {
  const editor = videoPromptInputRef.value
  return Boolean(editor && range && editor.contains(range.startContainer) && editor.contains(range.endContainer))
}
function saveVideoPromptSelection() {
  const selection = window.getSelection?.()
  if (!selection?.rangeCount) return
  const range = selection.getRangeAt(0)
  if (isRangeInsideVideoPrompt(range)) savedVideoPromptRange = range.cloneRange()
}
function restoreVideoPromptSelection() {
  const editor = videoPromptInputRef.value
  const selection = window.getSelection?.()
  if (!editor || !selection) return null
  const range = savedVideoPromptRange && isRangeInsideVideoPrompt(savedVideoPromptRange)
    ? savedVideoPromptRange.cloneRange()
    : document.createRange()
  if (!savedVideoPromptRange || !isRangeInsideVideoPrompt(savedVideoPromptRange)) {
    range.selectNodeContents(editor)
    range.collapse(false)
  }
  selection.removeAllRanges()
  selection.addRange(range)
  return range
}
function setVideoPromptCaretAfter(node) {
  const selection = window.getSelection?.()
  if (!selection) return
  const range = document.createRange()
  range.setStartAfter(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  savedVideoPromptRange = range.cloneRange()
}
function makeShortVideoReferenceName(name = '参考图') {
  const clean = String(name || '参考图').trim()
  return clean.length <= 18 ? clean : `${clean.slice(0, 10)}...${clean.slice(-4)}`
}
function createVideoPromptChip(item, type) {
  const chip = document.createElement('span')
  chip.className = `prompt-inline-chip prompt-inline-${type}`
  chip.contentEditable = 'false'
  chip.dataset.tokenType = type
  chip.dataset.tokenText = `@${item.title || item.name || '参考图'}`
  if (type === 'image') {
    chip.dataset.referenceId = item.id
    const image = document.createElement('img')
    image.src = item.preview
    image.alt = item.name || '参考图'
    chip.append(image)
  }
  const label = document.createElement('span')
  label.textContent = type === 'image' ? `@${makeShortVideoReferenceName(item.name)}` : `@${item.title}`
  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'prompt-inline-remove'
  remove.title = type === 'image' ? '删除这个@图片' : '删除这个@技能'
  remove.textContent = '×'
  chip.append(label, remove)
  return chip
}
function insertVideoPromptNode(node) {
  const editor = videoPromptInputRef.value
  if (!editor) {
    form.positivePrompt = `${form.positivePrompt}${form.positivePrompt ? ' ' : ''}${node.dataset.tokenText}`
    return
  }
  editor.focus()
  const range = restoreVideoPromptSelection()
  if (!range) return
  range.deleteContents()
  range.insertNode(node)
  const spacer = document.createTextNode(' ')
  range.setStartAfter(node)
  range.collapse(true)
  range.insertNode(spacer)
  setVideoPromptCaretAfter(spacer)
  syncVideoPromptFromEditor()
}
function insertVideoPromptImageChip(item) {
  if (videoPromptInputRef.value?.querySelector(`.prompt-inline-image[data-reference-id="${CSS.escape(item.id)}"]`)) return
  insertVideoPromptNode(createVideoPromptChip(item, 'image'))
}
function insertVideoPromptSkillChip(skill) {
  const token = `@${skill.title}`
  if (form.positivePrompt.includes(token)) return
  insertVideoPromptNode(createVideoPromptChip(skill, 'skill'))
}
function serializeVideoPromptNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  if (node.classList?.contains('prompt-inline-chip')) return node.dataset.tokenText || ''
  if (node.tagName === 'BR') return '\n'
  return Array.from(node.childNodes).map(serializeVideoPromptNode).join('')
}
function syncVideoPromptFromEditor() {
  const editor = videoPromptInputRef.value
  if (!editor) return
  form.positivePrompt = Array.from(editor.childNodes)
    .map(serializeVideoPromptNode)
    .join('')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
function syncVideoPromptEditorFromText(text, force = false) {
  const editor = videoPromptInputRef.value
  if (!editor || (!force && document.activeElement === editor)) return
  const serialized = Array.from(editor.childNodes).map(serializeVideoPromptNode).join('').replace(/\u00a0/g, ' ').replace(/[ \t]{2,}/g, ' ').trim()
  if (serialized !== String(text || '')) editor.textContent = text || ''
}
function handleVideoPromptInput() {
  syncVideoPromptFromEditor()
  saveVideoPromptSelection()
}
function handleVideoPromptPaste(event) {
  event.preventDefault()
  const text = event.clipboardData?.getData('text/plain') || ''
  if (!text) return
  const editor = videoPromptInputRef.value
  if (!editor) return
  editor.focus()
  const range = restoreVideoPromptSelection()
  if (!range) return
  range.deleteContents()
  const textNode = document.createTextNode(text)
  range.insertNode(textNode)
  setVideoPromptCaretAfter(textNode)
  syncVideoPromptFromEditor()
}
function handleVideoPromptClick(event) {
  const remove = event.target?.closest?.('.prompt-inline-remove')
  if (!remove) {
    saveVideoPromptSelection()
    return
  }
  event.preventDefault()
  const chip = remove.closest('.prompt-inline-chip')
  if (chip?.dataset.tokenType === 'image') videoReferenceImages.value = videoReferenceImages.value.filter((item) => item.id !== chip.dataset.referenceId)
  chip?.remove()
  syncVideoPromptFromEditor()
  saveVideoPromptSelection()
}
function removeVideoPromptImageChips(id) {
  videoPromptInputRef.value?.querySelectorAll(`.prompt-inline-image[data-reference-id="${CSS.escape(id)}"]`).forEach((chip) => chip.remove())
  syncVideoPromptFromEditor()
}
function handleUpload(event) {
  const files = Array.from(event.target.files || [])
  if (!files.length) return
  const allowed = difficulty.value === 'pro' ? files : files.slice(0, 1)
  allowed.forEach((file) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (['junior', 'starter'].includes(difficulty.value)) materials.value = []
      materials.value.push({ id: `upload-${Date.now()}-${file.name}`, title: file.name.replace(/\.[^.]+$/, ''), cover: `url(${reader.result}) center / cover`, source: 'upload', prompt: '' })
      filterMaterialsForDifficulty()
    }
    reader.readAsDataURL(file)
  })
  event.target.value = ''
}
function useBlankIdea() {
  materials.value.push({ id: `idea-${Date.now()}`, title: '文字创意素材', cover: 'linear-gradient(135deg, #f3efff, #ffffff)', source: 'idea', prompt: form.shortPrompt || form.positivePrompt || '文字创意视频' })
}
function moveMaterial(index, direction) {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= materials.value.length) return
  const next = [...materials.value]
  const [item] = next.splice(index, 1)
  next.splice(nextIndex, 0, item)
  materials.value = next
}
function removeMaterial(index) {
  materials.value.splice(index, 1)
}
function appendShortPrompt(tag) {
  const next = `${form.shortPrompt ? `${form.shortPrompt}，` : ''}${tag}`
  form.shortPrompt = next.slice(0, 100)
}
function appendPositivePrompt(tag) {
  form.positivePrompt = `${form.positivePrompt ? `${form.positivePrompt}, ` : ''}${tag}`
}
function syncProjectIdea() {
  const project = projectStore.currentProject || projectStore.draft
  form.script = [project?.ideaSummary, project?.ideaPrompt, project?.prompt].filter(Boolean).join('。') || form.script
}
function regenerateStory() {
  voiceStory.value = 'AI 已根据作品构思重新生成一个小故事，提示词仍在后台处理。'
  ElMessage.success('AI 已重新生成故事')
}
function improveScript() {
  scriptLoading.value = true
  window.setTimeout(() => {
    const materialNames = materials.value.map((item) => item.title).join('、') || '当前作品'
    const prompt = form.shortPrompt || form.positivePrompt || voiceStory.value || '展示作品亮点'
    form.script = `镜头1：展示${materialNames}主体，画面稳定清晰。镜头2：使用${form.template}风格，让作品元素自然动起来。镜头3：结合“${prompt}”完成结尾展示。`
    scriptLoading.value = false
    ElMessage.success('AI 已生成分镜剧本')
  }, 520)
}
function toggleSpeech() { listening.value ? finishVideoVoiceInput() : startVideoVoiceInput() }
async function startVideoVoiceInput() {
  resetVideoVoiceSession()
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) {
    await startRecordedVideoVoiceInput()
    return
  }
  activeRecognition = new SpeechRecognition()
  activeRecognition.lang = 'zh-CN'
  activeRecognition.continuous = true
  activeRecognition.interimResults = true
  listening.value = true
  activeRecognition.onresult = (event) => {
    let interim = ''
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const text = event.results[index][0].transcript
      if (event.results[index].isFinal) voiceTranscript += text
      else interim += text
    }
    voiceInterimTranscript = interim
  }
  activeRecognition.onerror = async () => {
    stopVideoRecognitionOnly()
    listening.value = false
    await startRecordedVideoVoiceInput()
  }
  activeRecognition.onend = () => {
    if (listening.value && activeRecognition) {
      try { activeRecognition.start() } catch { listening.value = false }
    }
  }
  try {
    activeRecognition.start()
  } catch {
    stopVideoRecognitionOnly()
    listening.value = false
    await startRecordedVideoVoiceInput()
  }
}
async function startRecordedVideoVoiceInput() {
  if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
    ElMessage.warning('当前浏览器无法使用麦克风录音，请用最新版 Chrome 或 Edge。')
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
    listening.value = true
  } catch {
    stopRecordedVideoVoiceInput()
    listening.value = false
    ElMessage.warning('麦克风没有启动，请允许本页面使用麦克风后重试。')
  }
}
async function finishVideoVoiceInput() {
  if (activeAudioContext) {
    await finishRecordedVideoVoiceInput()
    return
  }
  const text = (voiceTranscript || voiceInterimTranscript).trim()
  stopVideoVoiceInput()
  if (!text) {
    ElMessage.warning('没有识别到语音内容，请靠近麦克风后重试。')
    return
  }
  applyVideoVoiceText(text)
}
async function finishRecordedVideoVoiceInput() {
  if (!activeAudioContext) return
  listening.value = false
  try {
    const audioBlob = encodeVideoVoiceWav(recordedVoiceChunks, recordedVoiceSampleRate)
    stopRecordedVideoVoiceInput()
    if (!audioBlob.size) throw new Error('没有录到声音')
    const text = await transcribeArtworkVoice(audioBlob)
    applyVideoVoiceText(text)
  } catch (error) {
    stopRecordedVideoVoiceInput()
    ElMessage.error(error?.response?.data?.message || error?.message || '语音识别失败，请重试。')
  }
}
function applyVideoVoiceText(text) {
  if (difficulty.value === 'pro') {
    form.positivePrompt = `${form.positivePrompt || ''}${form.positivePrompt ? '，' : ''}${text}`.slice(0, 500)
    nextTick(() => syncVideoPromptEditorFromText(form.positivePrompt, true))
  } else {
    voiceStory.value = text
  }
  ElMessage.success('语音内容已写入')
}
function encodeVideoVoiceWav(chunks, sampleRate) {
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
function stopRecordedVideoVoiceInput() {
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
function stopVideoRecognitionOnly() {
  if (!activeRecognition) return
  try { activeRecognition.onend = null; activeRecognition.stop() } catch {}
  activeRecognition = null
}
function stopVideoVoiceInput() {
  stopVideoRecognitionOnly()
  stopRecordedVideoVoiceInput()
  listening.value = false
}
function resetVideoVoiceSession() {
  stopVideoVoiceInput()
  voiceTranscript = ''
  voiceInterimTranscript = ''
}
function removePreviousVideoPromptUnit(range) {
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
    savedVideoPromptRange = nextRange.cloneRange()
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
      setVideoPromptCaretAfter(previous)
      return true
    }
  }
  return false
}
function backspaceVideoPrompt() {
  const editor = videoPromptInputRef.value
  if (!editor) return
  editor.focus()
  const range = restoreVideoPromptSelection()
  if (!range) return
  if (!range.collapsed) range.deleteContents()
  else removePreviousVideoPromptUnit(range)
  syncVideoPromptFromEditor()
}
function buildPayload() {
  const hiddenPrompt = [
    materials.value.map((item) => item.prompt).filter(Boolean).join('。'),
    voiceStory.value,
    form.shortPrompt,
    form.script,
    form.positivePrompt || lastSubmittedPrompt.value,
  ].filter(Boolean).join('。')
  return {
    difficulty: difficulty.value,
    provider: selectedVideoModel.value.provider,
    model: selectedVideoModel.value.model,
    modelLabel: selectedVideoModel.value.label,
    count: Number(form.count || 1),
    resolution: form.resolution,
    duration: effectiveDuration.value,
    ratio: form.ratio,
    template: form.template,
    prompt: hiddenPrompt || '当前作品',
    negativePrompt: form.negativePrompt,
    materials: materials.value,
    referenceImages: videoReferenceImages.value.map((item) => ({ id: item.id, name: item.name, source: item.source, preview: item.preview })),
    images: videoReferenceImages.value.map((item) => item.preview).filter(Boolean),
    form: { ...form },
  }
}
async function resolveVideoSubmissionRatio() {
  if (form.ratio !== '自动') return form.ratio
  return resolveSmartRatio({
    referenceImages: videoReferenceImages.value.map((item) => item.preview),
    prompt: [form.shortPrompt, form.script, form.positivePrompt].filter(Boolean).join('，'),
    candidates: videoRatioOptions.map((item) => item.value).filter((value) => value !== '自动'),
    fallback: '16:9',
  })
}
function isVideoJobActive(item) {
  return ['submitting', 'queued', 'processing', 'rendering'].includes(item?.status)
}
function videoJobStatusText(status) {
  const map = { queued: '等待 Agnes AI 开始生成', submitting: '正在提交视频任务', processing: 'AI 正在整理分镜', rendering: '正在生成视频', succeeded: '生成完成', failed: '生成失败' }
  return map[status] || '等待生成视频'
}
function syncRunningState() {
  running.value = hasActiveVideoJobs.value
}
function mirrorVideoJobToTask(job) {
  Object.assign(task, {
    id: job.taskId || job.id,
    taskId: job.taskId || '',
    type: 'video',
    payload: job.payload,
    status: job.status,
    progress: job.progress,
    result: job.videoUrl ? job : null,
    error: job.error || '',
  })
}
function serializableVideoJob(job = {}) {
  return {
    id: job.id,
    taskId: job.taskId || '',
    provider: job.provider || '',
    title: job.title || 'Agnes AI 视频片段',
    duration: job.duration || '5s',
    ratio: job.ratio || form.ratio,
    model: job.model || selectedVideoModel.value.label,
    background: job.background || fallbackCover,
    status: job.status || 'queued',
    progress: Number(job.progress || 0),
    error: job.error || '',
    videoUrl: job.videoUrl || '',
    previewUrl: job.previewUrl || job.videoUrl || '',
    description: job.description || '',
    createdAt: job.createdAt || new Date().toISOString(),
  }
}
function persistVideoTasksToProject() {
  const projectId = activeVideoProjectId.value || projectStore.currentProject?.id
  if (!projectId) return
  const source = projectStore.projects.find((project) => project.id === projectId) || projectStore.currentProject || projectStore.draft
  if (!source?.id) return
  projectStore.openProject(source.id)
  projectStore.saveCurrentProject({ videoTasks: videoJobs.value.map(serializableVideoJob) })
}
function restoreProjectVideoTasks(project) {
  const savedTasks = Array.isArray(project?.videoTasks) ? project.videoTasks : []
  const savedVideos = Array.isArray(project?.videos) ? project.videos : []
  const merged = new Map()
  savedVideos.forEach((item) => {
    const normalized = serializableVideoJob({ ...item, id: item.id || item.taskId, taskId: item.taskId || item.id, status: item.status || 'succeeded', progress: item.progress || 100 })
    if (normalized.id) merged.set(normalized.id, normalized)
  })
  savedTasks.forEach((item) => {
    const normalized = serializableVideoJob(item)
    if (normalized.id) merged.set(normalized.id, normalized)
  })
  if (merged.size) videoJobs.value = [...merged.values()]
  const latestResult = [...videoJobs.value].reverse().find((item) => item?.videoUrl)
  if (latestResult) mirrorVideoJobToTask(latestResult)
}
function resumePersistedVideoJobs() {
  videoJobs.value
    .filter((item) => isVideoJobActive(item) && item.taskId && !resumedVideoTaskIds.has(item.taskId))
    .forEach((item) => {
      resumedVideoTaskIds.add(item.taskId)
      void monitorVideoJob(item, { taskId: item.taskId, provider: item.provider, status: item.status })
    })
  const waitingForSubmission = videoJobs.value.filter((item) => (
    item?.status === 'queued'
    && !item.taskId
    && item.payload
    && !videoSubmissionQueue.some((queued) => queued?.id === item.id)
  ))
  if (waitingForSubmission.length) enqueueVideoJobs(waitingForSubmission)
}
async function waitForVideoJob(job, submitted) {
  let current = submitted
  for (let attempt = 0; attempt < 90 && !['succeeded', 'failed'].includes(current.status); attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 5000))
    current = await getVideoTask(job.taskId, submitted.provider || job.provider || selectedVideoModel.value.provider)
    Object.assign(job, {
      status: current.status || 'processing',
      progress: Math.max(Number(current.progress || 0), 16),
      error: current.error || '',
    })
    mirrorVideoJobToTask(job)
    persistVideoTasksToProject()
  }
  if (current.status !== 'succeeded' || !current.videoUrl) throw new Error(current.error || 'Agnes AI 视频生成超时，请稍后重新查看任务')
  Object.assign(job, {
    status: 'succeeded',
    progress: 100,
    videoUrl: current.videoUrl,
    previewUrl: current.videoUrl,
    description: '已通过 Agnes AI 真实视频模型生成。',
  })
  mirrorVideoJobToTask(job)
  persistVideoTasksToProject()
  playing.value = true
}
async function monitorVideoJob(job, submitted) {
  try {
    await waitForVideoJob(job, submitted)
  } catch (error) {
    Object.assign(job, { status: 'failed', progress: 100, error: error?.message || '视频生成失败，请稍后再试。' })
    mirrorVideoJobToTask(job)
  } finally {
    if (job.taskId) resumedVideoTaskIds.delete(job.taskId)
    persistVideoTasksToProject()
    syncRunningState()
  }
}
function getRateLimitRetryDelay(error, retryCount) {
  const rawRetryAfter = error?.response?.headers?.['retry-after'] || error?.response?.headers?.get?.('retry-after')
  const retryAfterSeconds = Number(rawRetryAfter)
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) return retryAfterSeconds * 1000
  return Math.min(60000, 15000 * (Number(retryCount || 0) + 1))
}
async function runVideoJob(job) {
  try {
    const submitted = job.payload.managedSkillId
      ? await runStudentAiSkill(job.payload.managedSkillId, job.payload.managedSkillValues || {})
      : await generateVideo({ ...job.payload, count: 1, frameRate: Number.parseInt(job.payload.form?.frameRate, 10) || 24 })
    if (!submitted.taskId) throw new Error('Agnes AI 未返回视频任务编号')
    Object.assign(job, {
      id: submitted.taskId,
      taskId: submitted.taskId,
      provider: submitted.provider || job.provider,
      duration: submitted.duration || job.duration,
      status: submitted.status || 'queued',
      progress: Math.max(Number(submitted.progress || 0), 12),
    })
    mirrorVideoJobToTask(job)
    persistVideoTasksToProject()
    void monitorVideoJob(job, submitted)
  } catch (error) {
    const isRateLimited = Number(error?.response?.status || error?.status) === 429
    if (isRateLimited && Number(job.retryCount || 0) < 2) {
      const retryCount = Number(job.retryCount || 0) + 1
      Object.assign(job, {
        status: 'queued',
        progress: 4,
        error: 'Agnes AI 当前请求较多，已自动排队重试。',
        retryCount,
        nextSubmissionAt: Date.now() + getRateLimitRetryDelay(error, retryCount),
      })
      videoSubmissionQueue.push(job)
      return
    }
    Object.assign(job, {
      status: 'failed',
      progress: 100,
      error: isRateLimited ? 'Agnes AI 当前触发限流，请稍后再试。' : (error?.message || '视频任务提交失败，请稍后再试。'),
    })
    mirrorVideoJobToTask(job)
  } finally {
    persistVideoTasksToProject()
    syncRunningState()
  }
}
async function drainVideoSubmissionQueue() {
  if (videoSubmissionQueueRunning) return
  videoSubmissionQueueRunning = true
  try {
    while (videoSubmissionQueue.length) {
      const job = videoSubmissionQueue.shift()
      if (!job || !['queued', 'submitting'].includes(job.status)) continue
      const waitUntil = Number(job.nextSubmissionAt || 0) - Date.now()
      if (waitUntil > 0) {
        videoSubmissionQueue.push(job)
        await new Promise((resolve) => window.setTimeout(resolve, Math.min(waitUntil, 30000)))
        continue
      }
      job.status = 'submitting'
      job.progress = Math.max(Number(job.progress || 0), 8)
      job.error = ''
      mirrorVideoJobToTask(job)
      await runVideoJob(job)
      if (videoSubmissionQueue.length) await new Promise((resolve) => window.setTimeout(resolve, 10000))
    }
  } finally {
    videoSubmissionQueueRunning = false
  }
}
function enqueueVideoJobs(jobs) {
  videoSubmissionQueue.push(...jobs)
  void drainVideoSubmissionQueue()
}
async function confirmAdditionalVideoTask() {
  if (!hasActiveVideoJobs.value) return true
  try {
    await ElMessageBox.confirm('当前还有视频正在生成，是否继续提交新的视频任务？', '继续生成视频', {
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
async function startTask() {
  if (!availableVideoModels.value.length) {
    ElMessage.warning('暂无可用视频模型，请联系管理员开启模型后刷新页面')
    return
  }
  if (!materials.value.length && !activeManagedStudioSkill.value) {
    ElMessage.warning('先选择一张作品素材，再生成视频。')
    return
  }
  if (!(await confirmAdditionalVideoTask())) return
  if (['advanced', 'pro'].includes(difficulty.value) && !form.script) improveScript()
  const payload = buildPayload()
  if (activeManagedStudioSkill.value) {
    const skill = activeManagedStudioSkill.value
    const values = { ...managedSkillValues }
    ;(skill.configuration?.inputFields || []).filter((field) => field.type === 'image').forEach((field) => {
      values[field.key] = videoReferenceImages.value[0]?.preview || materials.value[0]?.preview || materials.value[0]?.imageUrl || ''
    })
    payload.managedSkillId = skill.id
    payload.managedSkillValues = values
    payload.provider = skill.configuration?.generation?.provider || payload.provider
    payload.model = skill.configuration?.generation?.model || payload.model
    payload.modelLabel = skill.title
    payload.duration = skill.configuration?.generation?.duration || payload.duration
  }
  payload.ratio = await resolveVideoSubmissionRatio()
  payload.form = { ...payload.form, ratio: payload.ratio }
  const total = Math.min(Math.max(Number(form.count || 1), 1), 4)
  const createdAt = Date.now()
  const jobs = Array.from({ length: total }, (_, index) => ({
    id: `local-video-${createdAt}-${index}`,
    taskId: '',
    type: 'video',
    payload,
    provider: payload.provider,
    title: total > 1 ? `Agnes AI 视频片段 ${index + 1}` : 'Agnes AI 视频片段',
    duration: payload.duration || '5s',
    ratio: payload.ratio,
    model: payload.modelLabel,
    background: fallbackCover,
    status: 'queued',
    progress: 4,
    error: '',
    videoUrl: '',
    previewUrl: '',
    description: '',
  }))
  videoJobs.value.push(...jobs)
  persistVideoTasksToProject()
  syncRunningState()
  mirrorVideoJobToTask(jobs[jobs.length - 1])
  enqueueVideoJobs(jobs)
  // 提交完就把输入框清空，别让上一句提示词留在那儿；快照留着给重生成用
  if (form.positivePrompt.trim()) lastSubmittedPrompt.value = form.positivePrompt
  form.positivePrompt = ''
  nextTick(() => syncVideoPromptEditorFromText('', true))
  ElMessage.success(total > 1 ? `已加入 ${total} 个视频任务队列，将依次提交以避免限流。` : '视频任务已加入队列，可继续输入新提示词。')
}
function restoreVideoHistory(historyItem) {
  if (!historyItem) return
  const currentResult = task.result ? { ...task.result } : null
  videoHistory.value = videoHistory.value.filter((item) => item.id !== historyItem.id)
  if (currentResult) videoHistory.value.unshift({ id: `history-${Date.now()}`, ...currentResult })
  Object.assign(task, { status: 'succeeded', progress: 100, result: { ...historyItem }, error: '' })
  playing.value = false
}
function openVideoPreview(item) {
  activeVideoPreview.value = item
  showVideoPreview.value = true
}
function videoRatioClass(value = form.ratio) {
  return {
    'is-vertical': value === '9:16',
    'is-wide': value === '16:9',
    'is-square': value === '1:1',
    'ratio-21x9': value === '21:9',
    'ratio-4x3': value === '4:3',
    'ratio-3x4': value === '3:4',
  }
}
function saveVideo() {
  if (!task.result) return null
  let projectId = projectStore.currentProject?.id || materials.value[0]?.projectId
  if (!projectId) {
    projectStore.startNewProject(difficulty.value)
    projectStore.saveCurrentProject({ title: 'AI视频创作项目', prompt: buildPayload().prompt, cover: materials.value[0]?.cover || fallbackCover })
    projectId = projectStore.currentProject.id
  }
  const saved = projectStore.saveVideo(projectId, {
    title: `${projectStore.currentProject?.title || '作品'} AI动态视频`,
    duration: effectiveDuration.value,
    ratio: form.ratio,
    style: form.template,
    script: form.script || buildPayload().prompt,
    cover: materials.value[0]?.cover,
    background: task.result.background,
    description: task.result.description,
    taskId: task.result.taskId || task.result.id,
    status: task.result.status || 'succeeded',
    progress: task.result.progress || 100,
    videoUrl: task.result.videoUrl || '',
    previewUrl: task.result.previewUrl || task.result.videoUrl || '',
    materials: materials.value,
  })
  ElMessage.success('视频已保存到我的素材库')
  return saved
}
function handlePreviewAction(key) {
  if (key === 'save') saveVideo()
  else if (key === 'report') {
    saveVideo()
    router.push({ path: '/student/h5-report', query: { difficulty: difficulty.value } })
  } else if (key === 'regenerate') startTask()
  else if (key === 'download') ElMessage.success('已模拟导出 MP4，正式版将调用下载接口。')
  else if (key === 'poster') ElMessage.success('分享海报已生成 Mock 预览。')
  else if (key === 'trim') ElMessage.success('视频裁剪为高级版 Mock 占位。')
  else if (key === 'cover') ElMessage.success('已模拟截取封面。')
  else if (key === 'batch') ElMessage.success('批量导出为高级版 Mock 占位。')
}
function resetAll() {
  materials.value = []
  voiceStory.value = ''
  videoReferenceImages.value = []
  referenceStackExpanded.value = false
  showReferenceMenu.value = false
  showMentionPanel.value = false
  form.shortPrompt = ''
  form.script = ''
  form.positivePrompt = ''
  form.negativePrompt = ''
  playing.value = false
  videoHistory.value = []
  videoJobs.value = []
  running.value = false
  Object.assign(task, createMockTask('video', {}))
}
const serverVideoDraftDocument = ref(null)
let serverVideoWrite = Promise.resolve()

function videoCachePayload() {
  return {
    form: { ...form },
    materials: materials.value,
    voiceStory: voiceStory.value,
    currentVideo: task.result || null,
    videoHistory: videoHistory.value,
    videoJobs: videoJobs.value,
    projectId: activeVideoProjectId.value || projectStore.currentProject?.id || '',
  }
}

function saveLocalCache() {
  const saved = videoCachePayload()
  if (!SERVER_AUTH_MODE) {
    localStorage.setItem('art-studio-video-draft', JSON.stringify(saved))
    return
  }
  serverVideoWrite = serverVideoWrite.catch(() => {}).then(async () => {
    if (serverVideoDraftDocument.value) {
      const { data } = await apiClient.patch(`/me/documents/${serverVideoDraftDocument.value.id}`, {
        title: '视频创作草稿', data: saved, version: serverVideoDraftDocument.value.version,
      })
      serverVideoDraftDocument.value = data.document
    } else {
      const { data } = await apiClient.post('/me/documents', {
        type: 'video-draft', resourceKey: `video:${saved.projectId || 'current'}`, title: '视频创作草稿', data: saved,
      })
      serverVideoDraftDocument.value = data.document
    }
  })
}

async function restoreLocalCache(projectId = '') {
  try {
    let saved
    if (SERVER_AUTH_MODE) {
      const { data } = await apiClient.get('/me/documents', { params: { type: 'video-draft' } })
      serverVideoDraftDocument.value = (data.documents || []).find((item) => item.resourceKey === `video:${projectId || 'current'}`) || data.documents?.[0] || null
      saved = serverVideoDraftDocument.value?.data
    } else {
      saved = JSON.parse(localStorage.getItem('art-studio-video-draft') || 'null')
    }
    if (!saved || typeof saved !== 'object') return
    if (projectId && saved.projectId && saved.projectId !== projectId) return
    if (saved.form && typeof saved.form === 'object') Object.assign(form, saved.form)
    if (Array.isArray(saved.materials)) materials.value = saved.materials
    if (typeof saved.voiceStory === 'string') voiceStory.value = saved.voiceStory
    if (Array.isArray(saved.videoHistory)) videoHistory.value = saved.videoHistory.filter((item) => item?.videoUrl)
    if (Array.isArray(saved.videoJobs)) {
      const merged = new Map(videoJobs.value.map((item) => [item.taskId || item.id, item]))
      saved.videoJobs.filter((item) => item?.id).forEach((item) => merged.set(item.taskId || item.id, item))
      videoJobs.value = [...merged.values()]
    }
    if (saved.currentVideo?.videoUrl) Object.assign(task, { status: 'succeeded', progress: 100, result: saved.currentVideo, error: '' })
    const latestResult = [...videoJobs.value].reverse().find((item) => item?.videoUrl)
    if (latestResult) mirrorVideoJobToTask(latestResult)
    resumePersistedVideoJobs()
    syncRunningState()
  } catch {}
}
</script>

<style scoped lang="scss">
.video-page { max-width: 1440px; margin: 0 auto; }
.mode-pro-video.video-page.app-page {
  max-width: 1280px;
  height: calc(100dvh - var(--app-top, 0px));
  min-height: auto;
  overflow: hidden;
  box-sizing: border-box;
  padding: 14px 18px;
}
.video-header,
.settings-panel,
.preview-panel {
  background: #fff;
  border-radius: 24px;
  box-shadow: var(--shadow-card);
}
.video-header {
  min-height: 84px;
  padding: 16px 22px;
  display: flex;
  align-items: center;
  gap: 18px;
}
.video-header h1,
.preview-top h2 { margin: 0; color: var(--color-title); }
.video-header p,
.preview-top p { margin: 4px 0 0; color: var(--color-muted); line-height: 1.5; }
.back-btn,
.preview-top button,
.material-actions button,
.large-action,
.mic-circle {
  min-height: 48px;
  border: 0;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-weight: 800;
  cursor: pointer;
}
.video-layout {
  height: calc(100dvh - var(--app-top, 0px) - 150px);
  min-height: 620px;
  max-height: 760px;
  margin-top: 22px;
  display: grid;
  grid-template-columns: minmax(420px, 40%) 1fr;
  gap: 22px;
}
.settings-panel {
  display: grid;
  grid-template-rows: 1fr auto;
  min-width: 0;
  overflow: hidden;
}
.settings-panel.mode-junior,
.settings-panel.mode-starter {
  grid-template-rows: auto;
  gap: 16px;
  padding: 22px;
  overflow: auto;
}
.settings-scroll {
  overflow: auto;
  padding: 20px;
  display: grid;
  gap: 16px;
}
.young-panel,
.young-generate,
.setting-card {
  border: 1px solid var(--color-border);
  border-radius: 18px;
  background: #fff;
  overflow: hidden;
}
:deep(.setting-card) {
  border: 1px solid var(--color-border);
  border-radius: 18px;
  background: #fff;
  overflow: hidden;
}
.young-panel,
.young-generate {
  padding: 18px;
  display: grid;
  gap: 14px;
}
.young-panel h2,
.young-generate h2 { margin: 0; color: var(--color-title); font-size: 24px; }
.young-panel p,
.young-generate p { margin: 0; color: var(--color-muted); line-height: 1.6; }
.mode-junior .young-panel h2,
.mode-junior .young-generate h2 { font-size: 28px; }
.large-action { min-height: 64px; border-radius: 18px; font-size: 20px; }
.module-title {
  width: 100%;
  min-height: 58px;
  border: 0;
  background: #f8f7ff;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--color-title);
  font-weight: 900;
  cursor: pointer;
}
.module-title small { color: var(--color-muted); font-weight: 700; }
.module-body { padding: 16px; display: grid; gap: 14px; }
:deep(.module-title) {
  width: 100%;
  min-height: 58px;
  border: 0;
  background: #f8f7ff;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--color-title);
  font-weight: 900;
  cursor: pointer;
}
:deep(.module-title small) { color: var(--color-muted); font-weight: 700; }
:deep(.module-body) { padding: 16px; display: grid; gap: 14px; }
.source-grid,
.template-row,
.audio-grid,
.segmented {
  display: grid;
  gap: 10px;
}
.source-grid { grid-template-columns: repeat(3, 1fr); }
.source-grid.two,
.segmented.two { grid-template-columns: repeat(2, 1fr); }
.source-grid button,
.template-row button,
.audio-grid button,
.segmented button,
.tag-list button {
  min-height: 48px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: #fff;
  color: var(--color-text);
  cursor: pointer;
}
.source-grid button {
  min-height: 86px;
  padding: 12px;
  text-align: left;
}
.source-grid strong,
.source-grid span { display: block; line-height: 1.45; }
.source-grid span { margin-top: 5px; color: var(--color-muted); font-size: 13px; }
.template-row { grid-template-columns: repeat(2, 1fr); }
.template-row--large { grid-template-columns: 1fr; }
.template-row--large button { min-height: 78px; font-size: 22px; }
.audio-grid,
.segmented { grid-template-columns: repeat(3, 1fr); }
button.active,
.mic-circle.active {
  border-color: rgba(108, 92, 231, .45);
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
button:disabled {
  cursor: not-allowed;
  opacity: .45;
}
.field-label,
.tag-group label { color: var(--color-title); font-weight: 900; }
.file-input { display: none; }
.single-material {
  border-radius: 16px;
  border: 1px solid var(--color-border);
  padding: 12px;
}
.single-material__cover {
  height: 150px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 40px;
  font-weight: 900;
}
.single-material strong { display: block; margin-top: 10px; color: var(--color-title); }
.material-strip { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; }
.material-card {
  min-width: 170px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 10px;
  background: #fff;
}
.material-thumb {
  height: 92px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 28px;
  font-weight: 900;
}
.material-card strong { display: block; margin-top: 8px; color: var(--color-title); }
.material-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.material-actions button { min-height: 36px; padding: 0 10px; font-size: 12px; }
:deep(.material-strip) { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; }
:deep(.material-card) {
  min-width: 170px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 10px;
  background: #fff;
}
:deep(.material-thumb) {
  height: 92px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 28px;
  font-weight: 900;
}
:deep(.material-card strong) { display: block; margin-top: 8px; color: var(--color-title); }
:deep(.material-actions) { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
:deep(.material-actions button) {
  min-height: 36px;
  border: 0;
  border-radius: 999px;
  padding: 0 10px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 800;
}
.soft-empty {
  min-height: 70px;
  border-radius: 14px;
  background: #f8fafc;
  display: grid;
  place-items: center;
  color: var(--color-muted);
  text-align: center;
  padding: 12px;
}
.mic-circle {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  justify-self: center;
  font-size: 22px;
}
textarea,
.text-input {
  width: 100%;
  min-height: 48px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 12px;
  line-height: 1.65;
  resize: vertical;
  font: inherit;
}
textarea { min-height: 112px; }
.prompt-large { min-height: 170px; }
.tag-group { display: grid; gap: 8px; }
.tag-list { display: flex; gap: 8px; flex-wrap: wrap; }
.tag-list button { padding: 0 14px; }
.switch-row {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--color-title);
  font-weight: 800;
}
.fixed-generate {
  border-top: 1px solid var(--color-border);
  padding: 16px 20px 20px;
  display: grid;
  gap: 12px;
  background: #fff;
  position: sticky;
  bottom: 0;
  z-index: 2;
}
.preview-panel {
  padding: 22px;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 16px;
  min-width: 0;
}
.preview-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.preview-canvas {
  min-height: 0;
  border-radius: 24px;
  background: #f8fafc;
  border: 1px solid var(--color-border);
  display: grid;
  place-items: center;
  padding: 20px;
  overflow: hidden;
}
.preview-canvas.is-vertical .mock-player,
.preview-canvas.is-vertical .preview-state { width: min(330px, 100%); aspect-ratio: 9 / 16; }
.preview-canvas.is-wide .mock-player,
.preview-canvas.is-wide .preview-state { width: min(720px, 100%); aspect-ratio: 16 / 9; }
.preview-canvas.is-square .mock-player,
.preview-canvas.is-square .preview-state { width: min(520px, 100%); aspect-ratio: 1 / 1; }
.preview-canvas.ratio-21x9 .mock-player,
.preview-canvas.ratio-21x9 .preview-state { width: min(860px, 100%); aspect-ratio: 21 / 9; }
.preview-canvas.ratio-4x3 .mock-player,
.preview-canvas.ratio-4x3 .preview-state { width: min(680px, 100%); aspect-ratio: 4 / 3; }
.preview-canvas.ratio-3x4 .mock-player,
.preview-canvas.ratio-3x4 .preview-state { width: min(420px, 100%); aspect-ratio: 3 / 4; }
.preview-state {
  border-radius: 24px;
  background: #fff;
  box-shadow: var(--shadow-card);
  padding: 24px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 14px;
  text-align: center;
  color: var(--color-text);
}
.preview-state strong { color: var(--color-title); font-size: 22px; }
.preview-state p { margin: 0; color: var(--color-muted); line-height: 1.6; }
.preview-state.is-error { background: #fff5f5; }
.empty-illustration {
  width: 100px;
  height: 100px;
  border-radius: 30px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #f3efff, #fff);
  color: #7c3aed;
  font-size: 42px;
  font-weight: 900;
}
.mock-player {
  border-radius: 28px;
  padding: 28px;
  color: #fff;
  box-shadow: var(--shadow-soft);
  display: grid;
  align-content: end;
  gap: 12px;
}
.mock-player h3,
.mock-player p { margin: 0; color: #fff; }
.real-video-player {
  width: 100%;
  height: 100%;
  min-height: 320px;
  border-radius: 28px;
  background: #111827;
  object-fit: contain;
  box-shadow: var(--shadow-soft);
}
.studio-real-video { min-height: 420px; }
.play-btn {
  width: 86px;
  height: 86px;
  border: 0;
  border-radius: 50%;
  background: rgba(255,255,255,.92);
  color: var(--color-primary);
  font-weight: 900;
  cursor: pointer;
  align-self: start;
}
.fake-progress {
  height: 10px;
  border-radius: 999px;
  background: rgba(255,255,255,.28);
  overflow: hidden;
}
.fake-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #fff;
  transition: width .28s ease;
}
.preview-actions {
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}
.preview-actions.disabled { opacity: .72; }
.picker-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}
.picker-card {
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 12px;
  cursor: pointer;
}
.picker-cover {
  height: 110px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 28px;
  font-weight: 900;
}
.picker-card strong { display: block; margin-top: 10px; color: var(--color-title); }
.picker-card p { margin: 6px 0 0; color: var(--color-muted); line-height: 1.45; }

/* 高级版工作台：与 AI 绘画创作页共享顶部、左侧技能和底部提示词的阅读顺序。 */
/* 页内头部去掉了：工作区直接占满顶栏下面的高度（只减掉页面上下内边距） */
.mode-pro-video .video-layout--studio {
  grid-template-columns: 210px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) 200px;
  min-height: 0;
  height: calc(100dvh - var(--app-top, 0px) - 28px);
  margin-top: 0;
  gap: 12px;
}
.mode-pro-video .video-layout--studio .settings-panel {
  grid-row: 1 / 3;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto 200px;
  gap: 12px;
  background: transparent;
  box-shadow: none;
  overflow: visible;
}
.studio-skill-panel,
.studio-shortcuts,
.studio-preview-panel {
  background: #fff;
  border-radius: 16px;
  box-shadow: var(--shadow-card);
}
.studio-skill-panel {
  min-height: 0;
  padding: 10px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.studio-skill-heading { display: flex; align-items: center; justify-content: space-between; color: var(--color-title); }
.studio-skill-heading strong { font-size: 15px; }
.studio-skill-heading span { color: #9caabd; font-size: 12px; }
.studio-skill-panel > p { margin: 6px 0 10px; color: var(--color-muted); font-size: 12px; }
.studio-skill-card {
  width: 100%;
  min-height: 96px;
  margin-top: 8px;
  padding: 6px;
  border: 1px solid #dce4ed;
  border-radius: 12px;
  background: #fff;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 5px;
  text-align: center;
  cursor: pointer;
}
.studio-skill-card.active { border-color: #6c5ce7; background: #f7f5ff; }
.studio-skill-card > span:last-child { min-width: 0; }
.studio-skill-card strong { display: block; color: var(--color-title); font-size: 12px; }
.studio-skill-card.active strong { color: #6c5ce7; }
.managed-skill-fields { display: grid; gap: 9px; margin-top: 12px; padding: 10px; border: 1px solid #dcd6fb; border-radius: 12px; background: #f9f8ff; }
.managed-skill-fields > strong { color: #5b4bd6; font-size: 13px; }
.managed-skill-fields label { display: grid; gap: 5px; color: #64748b; font-size: 12px; font-weight: 800; }
.managed-skill-fields label i { margin-left: 2px; color: #e45d47; font-style: normal; }
.managed-skill-fields input,.managed-skill-fields textarea,.managed-skill-fields select { width: 100%; box-sizing: border-box; border: 1px solid #d4cdf7; border-radius: 8px; padding: 8px; background: #fff; color: var(--color-title); font: inherit; }
.managed-skill-fields textarea { min-height: 70px; resize: vertical; }
.managed-skill-image { padding: 8px; border-radius: 8px; background: #fff; color: #7d899d; font-size: 11px; line-height: 1.5; }
.studio-skill-copy { min-height: 18px; display: grid; place-items: center; }
.studio-skill-art {
  position: relative;
  width: 100%;
  /* 卡片图统一按 3:1 存储，容器同比例才能整图铺满、不裁左右两边 */
  height: auto;
  aspect-ratio: 3 / 1;
  overflow: hidden;
  border-radius: 8px;
  background: #547e98;
}
.studio-skill-art::before,
.studio-skill-art::after,
.studio-skill-art i,
.studio-skill-art b { content: ''; position: absolute; display: block; }
.studio-skill-art.has-cover { background-color: #eef2f7; }
.studio-skill-art.has-cover::before,
.studio-skill-art.has-cover::after,
.studio-skill-art.has-cover i,
.studio-skill-art.has-cover b { display: none; }
.studio-skill-art::before { width: 31px; height: 31px; top: 7px; right: 9px; border-radius: 50%; background: #f5d269; }
.studio-skill-art::after { left: -6px; right: -6px; bottom: -10px; height: 39px; background: #274b66; clip-path: polygon(0 100%, 33% 30%, 50% 65%, 71% 12%, 100% 66%, 100% 100%); }
.studio-skill-art i { z-index: 2; }
.studio-skill-art b { z-index: 3; }
.art-camera { background: #edb761; }
.art-camera::before { width: 29px; height: 29px; top: 10px; left: 22px; right: auto; background: #526eb4; }
.art-camera::after { height: 32px; background: #ef7d67; clip-path: polygon(0 100%, 30% 42%, 52% 80%, 72% 28%, 100% 73%, 100% 100%); }
.art-camera i { top: 25px; left: 8px; width: 55px; height: 5px; border-radius: 8px; background: #fff; transform: rotate(-29deg); }
.art-action { background: #6f9eb5; }
.art-action::before { width: 18px; height: 18px; top: 14px; left: 28px; right: auto; background: #ffd36a; }
.art-action::after { background: #31516c; clip-path: polygon(0 100%, 26% 53%, 45% 73%, 58% 22%, 78% 59%, 100% 35%, 100% 100%); }
.art-action i { top: 18px; left: 10px; width: 44px; height: 4px; border-radius: 8px; background: #fff; transform: rotate(-19deg); }
.art-expression { background: #d09b79; }
.art-expression::before { width: 33px; height: 33px; top: 7px; left: 21px; right: auto; background: #ffe0a1; }
.art-expression::after { background: #77505d; }
.art-expression i { top: 29px; left: 32px; width: 12px; height: 5px; border-bottom: 3px solid #84535b; border-radius: 0 0 12px 12px; }
.art-rhythm { background: #557f99; }
.art-style { background: #a684c9; }
.art-style::after { background: #ee8977; }
.art-style::before { width: 19px; height: 19px; left: 47px; top: 17px; background: #63c9d0; }
.art-transition { background: #78bac2; }
.art-transition::before { display: none; }
.art-transition::after { background: #173f5d; clip-path: polygon(0 100%, 30% 32%, 51% 65%, 70% 10%, 100% 49%, 100% 100%); }
.art-transition i { top: 28px; left: -5px; width: 84px; height: 4px; background: #fff; transform: rotate(17deg); }
.art-music { background: #e8aa69; }
.art-music::before { display: none; }
.art-music::after { background: #68496b; clip-path: polygon(0 100%, 25% 48%, 47% 73%, 75% 28%, 100% 62%, 100% 100%); }
.art-music i { left: 16px; top: 10px; width: 3px; height: 33px; background: #fff; box-shadow: 11px -6px #fff, 22px 5px #fff, 33px -3px #fff; }
.art-subtitle { background: #ead279; }
.art-subtitle::before { display: none; }
.art-subtitle::after { background: #718db3; clip-path: polygon(0 100%, 25% 45%, 49% 72%, 70% 21%, 100% 58%, 100% 100%); }
.art-subtitle i { top: 12px; left: 12px; width: 34px; height: 6px; border-radius: 3px; background: #fff; box-shadow: 0 11px 0 7px #fff; }
.studio-shortcuts { min-height: 0; padding: 10px; display: grid; gap: 10px; }
.studio-shortcuts button {
  min-height: 47px;
  border: 1px solid #dce4ed;
  border-radius: 11px;
  background: #fff;
  color: #263748;
  font-weight: 800;
  cursor: pointer;
}
/* AI 伙伴：和绘画页一样站在左栏里（以前浮在左下角，正好压住下面三个入口按钮）。
   上面留出「点我说话」小气泡的位置；对话面板比左栏宽，往右展开到预览区上面。 */
.video-agent.is-inline { padding-top: 22px; }
.video-agent.is-inline :deep(.sa-figure-btn) { width: 92px; }
.video-agent.is-inline :deep(.sa-panel) { right: auto; width: min(332px, calc(100vw - 40px)); }
.studio-preview-panel {
  grid-column: 2;
  grid-row: 1;
  min-width: 0;
  min-height: 0;
  padding: 10px;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  gap: 0;
}
.studio-meta { min-height: 26px; display: flex; align-items: center; gap: 20px; color: #657990; font-size: 13px; }
.studio-meta strong { color: #1b2d40; }
.studio-meta button { border: 0; border-radius: 14px; padding: 6px 12px; color: #506b85; background: #edf2f7; cursor: pointer; }
.studio-video-stage {
  min-height: 0;
  border: 1px solid #dce4ec;
  border-radius: 13px;
  background: #f5f7f9;
  display: block;
  padding: 14px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.studio-current-preview { min-height: 100%; display: grid; justify-items: start; align-items: start; }
.studio-video-grid { width: 100%; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; align-items: start; justify-content: start; }
.studio-video-card { min-width: 0; border: 1px solid #dce4ec; border-radius: 8px; padding: 0; background: #fff; overflow: hidden; }
.studio-video-card video { display: block; width: 100%; aspect-ratio: 16 / 9; margin: 0 auto; background: #111827; object-fit: contain; }
.studio-video-pending { display: grid; width: 100%; aspect-ratio: 16 / 9; margin: 0 auto; background: #111827; }
.studio-video-card.ratio-21x9 video, .studio-video-card.ratio-21x9 .studio-video-pending { aspect-ratio: 21 / 9; }
.studio-video-card.ratio-4x3 video, .studio-video-card.ratio-4x3 .studio-video-pending { width: 88%; aspect-ratio: 4 / 3; }
.studio-video-card.is-square video, .studio-video-card.is-square .studio-video-pending { width: 76%; aspect-ratio: 1 / 1; }
.studio-video-card.ratio-3x4 video, .studio-video-card.ratio-3x4 .studio-video-pending { width: 64%; aspect-ratio: 3 / 4; }
.studio-video-card.is-vertical video, .studio-video-card.is-vertical .studio-video-pending { width: 54%; aspect-ratio: 9 / 16; }
.studio-video-pending { place-content: center; gap: 8px; padding: 12px; box-sizing: border-box; background: linear-gradient(145deg, #fff7ef, #f4f8fc); color: #1b2d40; text-align: center; }
.studio-video-pending strong { white-space: normal; text-overflow: clip; }
.studio-video-pending small { color: #728399; font-size: 11px; line-height: 1.45; }
.studio-video-pending.is-error { background: #fff5f5; color: #c53b3b; }
.studio-video-pending :deep(.el-progress) { width: min(100%, 132px); margin: 0 auto; }
.studio-video-card-meta { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 6px; align-items: center; padding: 7px 8px 8px; border-top: 1px solid #e5edf5; }
.studio-video-card strong { min-width: 0; overflow: hidden; color: #1b2d40; font-size: 12px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.studio-video-card span { color: #657990; font-size: 11px; }
.studio-video-card button { grid-column: 2; grid-row: 1 / span 2; border: 0; border-radius: 999px; padding: 5px 8px; background: #f0eeff; color: #5b4bd6; font-size: 11px; font-weight: 800; cursor: pointer; }
.library-mode-tabs { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 14px; }
.library-mode-tabs button { min-height: 48px; border: 1px solid #dce4ec; border-radius: 12px; background: #fff; color: #586b80; font-weight: 800; cursor: pointer; }
.library-mode-tabs button.active, .library-mode-tabs button:hover { border-color: rgba(108, 92, 231,.38); background: #f0eeff; color: #5b4bd6; }
.library-filter-row { display: flex; gap: 8px; margin-bottom: 14px; overflow-x: auto; padding-bottom: 4px; }
.library-filter-row button { flex: 0 0 auto; min-height: 38px; border: 1px solid #dce4ec; border-radius: 999px; padding: 0 13px; background: #fff; color: #657990; font-size: 12px; font-weight: 800; cursor: pointer; }
.library-filter-row button.active, .library-filter-row button:hover { border-color: rgba(108, 92, 231,.4); background: #f0eeff; color: #5b4bd6; }
.library-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; max-height: 420px; overflow-y: auto; }
.library-grid article { min-height: 0; aspect-ratio: 4 / 3; border: 1px solid #dce4ec; border-radius: 12px; padding: 5px; background: #fff; cursor: pointer; overflow: hidden; }
.library-grid article:hover { border-color: #6c5ce7; box-shadow: 0 6px 18px rgba(108, 92, 231,.16); }
.library-grid .library-thumb { width: 100%; height: 100%; border-radius: 8px; background-position: center; background-size: cover; background-repeat: no-repeat; }
.library-empty { min-height: 120px; display: grid; place-items: center; padding: 12px; border: 1px dashed #d7e1eb; border-radius: 12px; color: #708298; text-align: center; }
@media (max-width: 980px) {
  .studio-video-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .library-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
.video-preview-dialog :deep(.el-dialog__body) { padding: 8px 14px 16px; }
.video-preview-dialog__player { display: block; width: 100%; max-height: 82vh; background: #111827; }
.studio-history-stream { display: grid; gap: 6px; margin-bottom: 12px; }
.studio-history-card {
  min-height: 54px;
  border: 1px solid #dce4ec;
  border-radius: 8px;
  padding: 6px;
  background: #fff;
  display: grid;
  grid-template-columns: 66px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  color: #30465a;
  text-align: left;
  cursor: pointer;
}
.studio-history-card:hover { border-color: var(--color-primary); }
.studio-history-thumb { width: 66px; height: 40px; border-radius: 5px; }
.studio-history-card strong,
.studio-history-card small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.studio-history-card strong { font-size: 12px; }
.studio-history-card small { margin-top: 3px; color: #8493a3; font-size: 11px; }
.studio-video-stage .studio-player,
.studio-video-stage .studio-stage-state,
.studio-video-placeholder { width: min(624px, 100%); aspect-ratio: 16 / 9; }
.studio-video-stage.is-vertical .studio-player,
.studio-video-stage.is-vertical .studio-stage-state,
.studio-video-stage.is-vertical .studio-video-placeholder { width: min(330px, 100%); aspect-ratio: 9 / 16; }
.studio-video-stage.is-square .studio-player,
.studio-video-stage.is-square .studio-stage-state,
.studio-video-stage.is-square .studio-video-placeholder { width: min(500px, 100%); aspect-ratio: 1 / 1; }
.studio-video-stage.ratio-21x9 .studio-player,
.studio-video-stage.ratio-21x9 .studio-stage-state,
.studio-video-stage.ratio-21x9 .studio-video-placeholder { width: min(920px, 100%); aspect-ratio: 21 / 9; }
.studio-video-stage.ratio-4x3 .studio-player,
.studio-video-stage.ratio-4x3 .studio-stage-state,
.studio-video-stage.ratio-4x3 .studio-video-placeholder { width: min(760px, 100%); aspect-ratio: 4 / 3; }
.studio-video-stage.ratio-3x4 .studio-player,
.studio-video-stage.ratio-3x4 .studio-stage-state,
.studio-video-stage.ratio-3x4 .studio-video-placeholder { width: min(440px, 100%); aspect-ratio: 3 / 4; }
.studio-stage-state { display: grid; place-content: center; gap: 14px; text-align: center; padding: 24px; border-radius: 6px; background: #fff; color: var(--color-title); }
.video-generation-waiting-grid {
  width: 100%;
  height: 100%;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 10px;
  align-items: stretch;
  background: transparent;
}
.video-generation-waiting-grid.count-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.video-generation-waiting-grid.count-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.video-generation-waiting-grid.count-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.video-generation-waiting-card {
  min-width: 0;
  min-height: 0;
  display: grid;
  place-content: center;
  gap: 10px;
  padding: 16px;
  border-radius: 12px;
  overflow: hidden;
  text-align: center;
  color: #1b2d40;
  background: linear-gradient(125deg, #7c3aed, #22d3ee 34%, #f9a8d4 64%, #f59e0b);
  background-size: 180% 180%;
  animation: video-dream-color-flow 7s ease-in-out infinite alternate;
}
.video-generation-waiting-card :deep(.el-progress) { width: min(100%, 180px); margin: 0 auto; }
.preview-canvas.is-vertical .video-generation-waiting-card,
.studio-video-stage.is-vertical .video-generation-waiting-card { aspect-ratio: 9 / 16; }
.preview-canvas.is-wide .video-generation-waiting-card,
.studio-video-stage.is-wide .video-generation-waiting-card { aspect-ratio: 16 / 9; }
.preview-canvas.is-square .video-generation-waiting-card,
.studio-video-stage.is-square .video-generation-waiting-card { aspect-ratio: 1 / 1; }
@keyframes video-dream-color-flow {
  from { background-position: 0% 50%; filter: saturate(1); }
  to { background-position: 100% 50%; filter: saturate(1.25); }
}
.studio-stage-state.is-error { background: #fff5f5; }
.studio-stage-empty { align-self: center; justify-self: center; display: grid; justify-items: center; gap: 8px; padding: 24px; text-align: center; }
.studio-stage-empty svg { margin-bottom: 4px; }
.studio-stage-empty strong { color: var(--su-ink); font-size: 18px; font-weight: 800; }
.studio-stage-empty p { margin: 0; color: var(--su-muted); font-size: 14px; line-height: 1.6; }
.studio-player { position: relative; display: grid; align-content: end; gap: 10px; padding: 22px; color: #fff; border-radius: 5px; overflow: hidden; }
.studio-player h3, .studio-player p { margin: 0; color: #fff; }
.studio-play { width: 78px; height: 78px; align-self: center; justify-self: center; border: 0; border-radius: 50%; background: rgba(255,255,255,.94); color: #204451; font-weight: 900; cursor: pointer; }
.studio-video-placeholder { display: grid; align-content: end; justify-items: center; gap: 10px; padding: 26px; border: 1px dashed #7f96a8; border-radius: 6px; background: #28656f; color: #f7fbfb; }
.studio-video-placeholder strong { font-size: 15px; }
.studio-video-placeholder p { margin: 0; color: #bfd0db; font-size: 13px; }
.studio-scene { position: relative; width: 100%; height: 78%; overflow: hidden; }
.studio-scene::before { content: ''; position: absolute; width: 116px; height: 116px; top: 5%; right: 16%; border-radius: 50%; background: #f6d36c; }
.studio-scene::after { content: ''; position: absolute; left: -5%; right: -5%; bottom: -5%; height: 44%; background: #54b3bc; clip-path: polygon(0 72%, 22% 28%, 42% 77%, 60% 59%, 80% 13%, 100% 62%, 100% 100%, 0 100%); }
.studio-scene i { position: absolute; z-index: 2; top: 51%; left: 45%; width: 70px; height: 46px; border-radius: 50% 56% 48% 50%; background: #f18a76; }
.studio-scene i::before, .studio-scene i::after { content: ''; position: absolute; top: -19px; width: 32px; height: 34px; background: #f8f9f5; clip-path: polygon(0 70%, 100% 0, 100% 100%); }
.studio-scene i::before { left: -6px; transform: rotate(28deg); }
.studio-scene i::after { right: -10px; transform: scaleX(-1) rotate(28deg); }
.studio-scene b { position: absolute; z-index: 3; top: 46%; left: 51%; width: 80px; height: 80px; border-radius: 50%; background: #fff; opacity: .92; }
.studio-scene b::after { content: ''; position: absolute; top: 23px; left: 31px; border-top: 17px solid transparent; border-bottom: 17px solid transparent; border-left: 25px solid #19434d; }
.studio-details { display: flex; justify-content: center; gap: 18px; color: #6e8295; font-size: 12px; }
.studio-composer { display: grid; grid-template-columns: 108px minmax(0, 1fr) 132px; grid-template-rows: minmax(84px, 1fr) auto; gap: 10px; }
.studio-composer--panel {
  grid-column: 2;
  grid-row: 2;
  position: relative;
  display: block;
  min-height: max-content;
  padding: 16px 140px 16px 122px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: #fff;
  box-shadow: var(--shadow-card);
  overflow: visible;
  z-index: 12;
}
.studio-composer--panel > .studio-reference { display: none; }
.video-reference-stack {
  position: absolute;
  left: 24px;
  top: 28px;
  z-index: 8;
  width: 88px;
  height: 102px;
}
.video-reference-card {
  position: relative;
  width: 76px;
  height: 92px;
  min-height: 0;
  border: 1.5px solid var(--color-border);
  border-radius: 10px;
  background: #f8f7ff;
  color: var(--color-title);
  display: grid;
  place-items: center;
  font-weight: 900;
  cursor: pointer;
  transform: rotate(-13deg);
  box-shadow: 0 10px 24px rgba(15,23,42,.08);
  overflow: visible;
}
.video-reference-card b {
  position: absolute;
  right: -7px;
  top: -8px;
  z-index: 5;
  min-width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #6c5ce7;
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 12px;
}
.video-reference-stack-image {
  position: absolute;
  width: 58px;
  height: 78px;
  border: 2px solid #fff;
  border-radius: 5px;
  background: #fff;
  overflow: hidden;
  box-shadow: 0 9px 20px rgba(15,23,42,.22);
}
.video-reference-stack-image img,
.video-reference-strip img { width: 100%; height: 100%; object-fit: cover; display: block; }
.video-reference-stack-image.stack-1 { left: 8px; top: 6px; z-index: 3; transform: rotate(-9deg); }
.video-reference-stack-image.stack-2 { left: 18px; top: 9px; z-index: 2; transform: rotate(7deg); }
.video-reference-stack-image.stack-3 { left: 28px; top: 12px; z-index: 1; transform: rotate(-2deg); opacity: .92; }
.video-reference-add {
  position: absolute;
  right: -2px;
  bottom: 0;
  z-index: 6;
  width: 26px;
  height: 26px;
  min-height: 0;
  border: 0;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  font-size: 18px;
  cursor: pointer;
}
.video-reference-strip,
.video-reference-menu {
  position: absolute;
  left: 16px;
  bottom: calc(100% + 10px);
  z-index: 30;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 8px;
  background: #fff;
  box-shadow: var(--shadow-soft);
}
.video-reference-strip { display: flex; gap: 8px; max-width: min(560px, calc(100% - 32px)); overflow-x: auto; }
.video-reference-strip article { position: relative; width: 62px; height: 62px; flex: 0 0 auto; overflow: hidden; border-radius: 7px; }
.video-reference-strip button { position: absolute; right: 2px; top: 2px; width: 20px; height: 20px; min-height: 0; border: 0; border-radius: 50%; background: rgba(15,23,42,.76); color: #fff; cursor: pointer; }
.video-reference-menu { display: grid; gap: 4px; min-width: 120px; }
.video-reference-menu button { min-height: 32px; border: 0; border-radius: 7px; background: #f8fafc; color: var(--color-title); cursor: pointer; font-size: 12px; font-weight: 800; }
.studio-reference {
  position: absolute;
  left: 24px;
  top: 28px;
  width: 76px;
  height: 92px;
  min-height: 0;
  border: 1.5px solid var(--color-border);
  border-radius: 10px;
  background: #f8f7ff;
  color: var(--color-title);
  font-weight: 900;
  cursor: pointer;
  transform: rotate(-13deg);
  box-shadow: 0 10px 24px rgba(15,23,42,.08);
}
.studio-prompt-field { position: relative; min-width: 0; min-height: 94px; }
.prompt-composer { position: relative; z-index: 6; width: 100%; min-height: 94px; border: 1px solid var(--color-border); border-radius: 10px; background: #fff; display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; overflow: hidden; }
.prompt-composer:focus-within { border-color: rgba(22,131,255,.76); box-shadow: 0 0 0 2px rgba(22,131,255,.12); }
.video-prompt-editor { flex: 1 1 180px; width: 100%; min-height: 70px; max-height: 92px; padding: 0; overflow-y: auto; border: 0; background: transparent; color: #344c63; font-size: 18px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; caret-color: var(--color-primary); }
.video-prompt-editor:focus { outline: 0; }
.video-prompt-editor:empty::before { content: attr(data-placeholder); color: #94a3b8; pointer-events: none; }
.video-prompt-editor :deep(.prompt-inline-chip) { display: inline-flex; align-items: center; max-width: min(108px, 36vw); min-height: 20px; margin: 0 1px; vertical-align: middle; border: 1px solid rgba(22,131,255,.28); border-radius: 999px; padding: 0 2px; background: #eff6ff; color: #1260b3; font-size: 9px; font-weight: 900; line-height: 1; user-select: none; }
.video-prompt-editor :deep(.prompt-inline-image) { max-width: min(118px, 34vw); min-height: 18px; height: 18px; gap: 3px; border-color: rgba(22,131,255,.28); border-radius: 6px; padding: 0 3px; background: #eef6ff; }
.video-prompt-editor :deep(.prompt-inline-skill) { gap: 6px; border-color: rgba(108, 92, 231,.32); background: #f6f4ff; color: #4f40c4; }
.video-prompt-editor :deep(.prompt-inline-chip img) { width: 16px; height: 16px; border: 1px solid rgba(255,255,255,.82); border-radius: 999px; object-fit: cover; }
.video-prompt-editor :deep(.prompt-inline-image img) { width: 14px; height: 14px; }
.video-prompt-editor :deep(.prompt-inline-chip span) { min-width: 0; max-width: 62px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.video-prompt-editor :deep(.prompt-inline-image span) { max-width: 78px; }
.video-prompt-editor :deep(.prompt-inline-remove) { flex: 0 0 auto; width: 14px; height: 14px; min-height: 0; border: 0; border-radius: 999px; padding: 0; display: inline-grid; place-items: center; background: rgba(18,96,179,.13); color: inherit; cursor: pointer; font-size: 9px; font-weight: 900; line-height: 1; }
.video-prompt-editor :deep(.prompt-inline-image .prompt-inline-remove) { width: 12px; height: 12px; background: transparent; font-size: 10px; }
.video-prompt-editor :deep(.prompt-inline-remove:hover) { background: rgba(18,96,179,.24); }
.mention-menu-wrap { position: relative; display: inline-flex; }
.mention-trigger { min-width: 34px; justify-content: center; font-size: 16px; }
.mention-panel { position: absolute; right: 0; bottom: 38px; z-index: 35; width: min(380px, calc(100vw - 180px)); max-height: 268px; border: 1px solid rgba(148,163,184,.34); border-radius: 14px; padding: 10px; background: #fff; box-shadow: 0 18px 42px rgba(15,23,42,.18); display: grid; gap: 10px; }
.mention-panel::after { content: ''; position: absolute; right: 16px; bottom: -7px; width: 12px; height: 12px; transform: rotate(45deg); border-right: 1px solid rgba(148,163,184,.34); border-bottom: 1px solid rgba(148,163,184,.34); background: #fff; }
.mention-tabs { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.mention-tabs button { min-height: 38px; border: 1px solid var(--color-border); border-radius: 10px; background: #f8fafc; color: var(--color-title); cursor: pointer; font-weight: 900; }
.mention-tabs button.active { border-color: rgba(108, 92, 231,.38); background: var(--color-primary-soft); color: var(--color-primary); }
.mention-upload-pane { display: grid; gap: 8px; }
.mention-upload-pane p { margin: 0; color: var(--color-muted); font-size: 12px; font-weight: 800; }
.mention-upload-btn { min-height: 92px; border: 1px dashed rgba(108, 92, 231,.42); border-radius: 12px; background: #f6f4ff; color: var(--color-title); cursor: pointer; display: grid; place-items: center; align-content: center; gap: 6px; padding: 12px; text-align: center; }
.mention-upload-btn strong { font-size: 14px; }
.mention-upload-btn span { color: var(--color-muted); font-size: 12px; font-weight: 800; }
.mention-skill-pane { max-height: 190px; overflow-y: auto; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding-right: 2px; }
.mention-skill-pane button { min-height: 54px; border: 1px solid var(--color-border); border-radius: 10px; background: #f8fafc; color: var(--color-title); cursor: pointer; display: grid; gap: 3px; padding: 7px 9px; text-align: left; }
.mention-skill-pane button.selected, .mention-skill-pane button:hover { border-color: rgba(108, 92, 231,.38); background: var(--color-primary-soft); color: var(--color-primary); }
.mention-skill-pane strong { font-size: 12px; }
.mention-skill-pane span { color: var(--color-muted); font-size: 11px; font-weight: 800; line-height: 1.25; }
/* 右侧竖排三个大按钮（照客户稿，和绘画页一致）：小画家一眼找到、好按 */
.studio-composer-actions { position: absolute; right: 18px; top: 16px; bottom: 16px; width: 108px; display: flex; flex-direction: column; justify-content: center; gap: 8px; }
.studio-composer-actions > button {
  flex: none; width: 100%; height: 46px; min-height: 0; padding: 0 10px;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border: 1px solid var(--su-line-strong); border-radius: 14px;
  background: #fff; color: var(--su-ink); font-size: 15px; font-weight: 800; white-space: nowrap; cursor: pointer;
  transition: border-color .15s, color .15s, background .15s;
}
.studio-composer-actions > button svg { flex: none; color: var(--su-muted); }
.studio-composer-actions > button:hover:not(:disabled) { border-color: var(--su-accent); color: var(--su-accent); }
.studio-composer-actions > button:hover:not(:disabled) svg { color: var(--su-accent); }
.studio-composer-actions > button:active:not(:disabled) { transform: scale(.97); }
.studio-composer-actions > button.send-action-btn {
  height: 56px; border: 0; border-radius: 16px;
  background: var(--su-accent); color: #fff; font-size: 17px;
  box-shadow: 0 8px 18px rgba(108, 92, 231, .28);
}
.studio-composer-actions > button.send-action-btn svg,
.studio-composer-actions > button.send-action-btn:hover:not(:disabled) svg { color: #fff; }
.studio-composer-actions > button.send-action-btn:hover:not(:disabled) { background: var(--su-accent-hover); color: #fff; }
.studio-composer-actions > button:disabled { cursor: not-allowed; opacity: .5; box-shadow: none; }
.voice-action-btn {
  position: relative;
  overflow: hidden;
}
.voice-wave {
  display: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}
.studio-composer-actions > button.voice-action-btn.active { border-color: var(--su-accent); background: var(--su-accent-soft); color: var(--su-accent); }
.voice-action-btn.active .voice-wave { display: block; animation: voicePulse 1s ease-in-out infinite; }
.voice-action-btn.active::before,
.voice-action-btn.active::after {
  content: '';
  position: absolute;
  inset: 6px;
  border: 1px solid rgba(108, 92, 231, .35);
  border-radius: 12px;
  animation: voiceRing 1.3s ease-out infinite;
}
.voice-action-btn.active::after { animation-delay: .35s; }
@keyframes voicePulse {
  0%, 100% { transform: scale(.82); }
  50% { transform: scale(1.35); }
}
@keyframes voiceRing {
  0% { transform: scale(.72); opacity: .72; }
  100% { transform: scale(1.22); opacity: 0; }
}
.prompt-chip-row { position: relative; z-index: 10; margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; justify-content: center; }
.prompt-chip { min-height: 30px; border: 1px solid var(--color-border); border-radius: 9px; padding: 0 10px; background: #fff; color: var(--color-title); font-size: 12px; font-weight: 900; cursor: pointer; white-space: nowrap; }
/* 模型名长短不一：必须限宽 + 省略号。
   否则名字一长就把芯片行撑开 → 换行 → 「@」被挤到第二行、行高翻倍压住输入区。
   限宽必须加在外层 flex 项上：芯片是收缩容器里的子元素，百分比会解析成容器自身宽度。 */
.chip-menu-wrap.model-menu-wrap { min-width: 0; max-width: 330px; max-width: max(96px, calc(100% - 495px)); }
.prompt-chip.model-chip { display: inline-flex; align-items: center; min-width: 0; max-width: 100%; overflow: hidden; }
.prompt-chip.model-chip .chip-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 桌面端强制单行：模型名再长也只压缩自己，不会把「@」挤到第二行。
   窄屏（≤820px）保留换行——那里芯片行会变成网格子项，需要换行。 */
@media (min-width: 821px) { .prompt-chip-row { flex-wrap: nowrap; } }
.prompt-chip.active, .prompt-chip:hover { border-color: rgba(108, 92, 231,.38); background: var(--color-primary-soft); color: var(--color-primary); }
.prompt-chip:disabled { cursor: not-allowed; opacity: .72; }
.chip-menu-wrap { position: relative; display: inline-flex; }
.prompt-optimize-wrap { gap: 0; }
.prompt-optimize-action { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.prompt-chip-caret { min-width: 28px; padding: 0 7px; border-left: 0; border-top-left-radius: 0; border-bottom-left-radius: 0; }
.chip-option-panel { position: absolute; left: 50%; bottom: 34px; z-index: 30; width: 238px; transform: translateX(-50%); border: 1px solid rgba(148,163,184,.34); border-radius: 12px; padding: 8px; background: #fff; box-shadow: 0 18px 40px rgba(15,23,42,.16); display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.chip-option-panel::after { content: ''; position: absolute; left: 50%; bottom: -7px; width: 12px; height: 12px; transform: translateX(-50%) rotate(45deg); border-right: 1px solid rgba(148,163,184,.34); border-bottom: 1px solid rgba(148,163,184,.34); background: #fff; }
.chip-option-panel.compact { width: 176px; }
.chip-option-panel.model-panel { width: 238px; max-height: 172px; overflow-y: auto; grid-template-columns: 1fr; }
.chip-option-panel.style-panel { width: 308px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.chip-option-panel.ratio-panel { width: 190px; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; }
.chip-option-panel.video-settings-panel { width: 382px; padding: 14px; display: grid; grid-template-columns: 1fr; gap: 10px; }
.video-settings-panel > label { color: #64748b; font-size: 12px; font-weight: 800; }
.video-settings-options { display: grid; gap: 5px; }
.ratio-settings-options { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.resolution-options { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.four-options { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.video-settings-options button { min-height: 42px; display: grid; place-items: center; gap: 3px; }
.ratio-settings-options button { min-height: 58px; }
.chip-option-panel button { position: relative; z-index: 1; min-height: 34px; border: 1px solid transparent; border-radius: 8px; background: #f8fafc; color: var(--color-title); font-size: 12px; font-weight: 900; cursor: pointer; }
.chip-option-panel button:hover, .chip-option-panel button.selected { border-color: rgba(108, 92, 231,.42); background: var(--color-primary-soft); color: var(--color-primary); }
.chip-option-panel.model-panel button { min-height: 42px; padding: 6px 10px; display: grid; gap: 3px; text-align: left; }
.chip-option-panel.model-panel strong { color: inherit; font-size: 12px; line-height: 1.2; }
.chip-option-panel.model-panel small { color: #64748b; font-size: 11px; font-weight: 800; }
.chip-option-panel.model-panel button.selected small, .chip-option-panel.model-panel button:hover small { color: var(--color-primary); }
.chip-option-panel.style-panel button { min-height: 34px; padding: 0 12px; text-align: center; }
.chip-option-panel .ratio-option { min-height: 54px; display: grid; place-items: center; align-content: center; gap: 5px; padding: 5px 4px; background: transparent; }
.ratio-icon { width: 17px; max-height: 20px; border: 2px solid currentColor; border-radius: 4px; display: block; }
.ratio-option small { color: inherit; font-size: 11px; font-weight: 800; line-height: 1; }
@media (max-width: 1100px) {
  .video-layout {
    height: auto;
    max-height: none;
    grid-template-columns: 1fr;
  }
  .settings-panel { min-height: 680px; }
  .mode-pro-video .video-layout--studio {
    grid-template-columns: 230px minmax(0, 1fr);
    height: calc(100dvh - var(--app-top, 0px) - 28px);
  }
  .video-layout--studio .settings-panel { min-height: 0; }
}
@media (max-width: 820px) {
  .video-layout--studio { grid-template-columns: 1fr; height: auto; }
  .video-layout--studio .settings-panel { min-height: 680px; }
  .studio-composer { grid-template-columns: 84px minmax(0, 1fr); }
  .studio-composer-actions { grid-column: 1 / -1; grid-template-columns: 1fr 1fr; grid-template-rows: 48px; }
  .prompt-chip-row { grid-column: 1 / -1; }
}
@media (min-width: 981px) and (max-width: 1280px) {
  .mode-pro-video.video-page.app-page { padding: 12px 16px; }
  .mode-pro-video .video-layout--studio {
    height: calc(100dvh - var(--app-top, 0px) - 24px);
    grid-template-columns: 204px minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) 196px;
    gap: 10px;
  }
  .mode-pro-video .video-layout--studio .settings-panel {
    grid-template-rows: minmax(0, 1fr) auto 196px;
    gap: 10px;
  }
  .mode-pro-video .studio-composer--panel { padding: 14px 136px 14px 114px; }
  .mode-pro-video .studio-reference { left: 22px; top: 26px; }
  .mode-pro-video .video-reference-stack { left: 22px; top: 26px; }
  .mode-pro-video .prompt-chip-row { gap: 6px; }
  .mode-pro-video .prompt-chip { min-height: 28px; padding: 0 9px; font-size: 11px; }
  .mode-pro-video .studio-composer-actions { right: 16px; top: 18px; bottom: 14px; }
}
@media (max-width: 980px) {
  .mode-pro-video.video-page.app-page {
    height: auto;
    overflow: visible;
  }
  /* 竖屏平板：胶囊会换成两三行，底部输入区按内容长高（至少放得下右边三个大按钮），上面的预览区让位 */
  .mode-pro-video .video-layout--studio { grid-template-rows: minmax(0, 1fr) minmax(200px, auto); }
  .mode-pro-video .video-layout--studio .settings-panel { grid-template-rows: minmax(0, 1fr) auto minmax(200px, auto); }
}
/* 手机竖屏：本页被「把手机横过来用」挡住；底部输入区别把整页撑宽，否则那个提示框会偏到右边被截掉一截 */
@media (max-width: 680px) {
  .mode-pro-video.video-page.app-page { overflow-x: hidden; overflow-x: clip; }
}
</style>
