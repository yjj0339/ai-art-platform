<template>
  <main
    class="workflow-page floating-workflow-mode"
    :class="{ 'admin-workflow-mode': adminMode }"
    @dragstart="handlePromptDragStart($event)"
    @dragover="handlePromptDragOver($event)"
    @drop="handlePromptDrop($event)"
    @dragend="handlePromptDragEnd($event)"
  >
    <header class="workflow-topbar">
      <div class="brand-block">
        <strong>{{ adminMode ? '玩法工作流' : 'AI创作画布' }}</strong>
        <span class="topbar-divider" />
        <!-- 「文件」下拉：两种模式共用同一个入口。
             用户端是返回工作台/新建/保存到素材库/删除；后台是保存草稿/返回列表/重置工作流。
             后台原来顶栏那一整条（标题、状态、保存、测试、发布）已经撤掉，保存这类「对这份文件的操作」都收到这里。 -->
        <div ref="fileMenuWrap" class="file-menu-wrap">
          <button
            type="button"
            class="file-menu-trigger"
            :class="{ active: fileMenuOpen }"
            aria-haspopup="menu"
            :aria-expanded="fileMenuOpen"
            title="画布文件菜单"
            @click.stop="toggleFileMenu"
          >
            <Document />
            <span class="file-menu-label">文件</span>
            <ArrowDown class="file-menu-caret" />
            <!-- 有未保存改动时只亮一个小的橙色点：不占位置，也不会像原来那行小字那样碍眼。 -->
            <i v-if="adminMode && adminDirty" class="file-menu-dot" aria-hidden="true" />
            <span v-if="adminMode && adminDirty" class="sr-only">有未保存的改动</span>
          </button>
          <div v-if="fileMenuOpen" class="file-menu" role="menu" @click.stop>
            <template v-if="adminMode">
              <button type="button" role="menuitem" :disabled="adminSaving" @click="runFileMenuAction(saveAdminDraft)">
                <Check /><span>{{ adminSaving ? '正在保存…' : '保存草稿' }}</span>
              </button>
              <button v-if="adminStudentPage" type="button" role="menuitem" @click="runFileMenuAction(openAdminStudentPage)">
                <View /><span>用户使用页面</span>
              </button>
              <span class="file-menu-sep" />
              <button type="button" role="menuitem" @click="runFileMenuAction(goBack)">
                <ArrowLeft /><span>{{ adminBackLabel }}</span>
              </button>
              <button type="button" role="menuitem" class="is-danger" @click="runFileMenuAction(resetWorkflow)">
                <RefreshLeft /><span>重置工作流</span>
              </button>
            </template>
            <template v-else>
              <button type="button" role="menuitem" @click="runFileMenuAction(goToWorkbench)">
                <ArrowLeft /><span>返回工作台</span>
              </button>
              <button type="button" role="menuitem" @click="runFileMenuAction(createNewCanvas)">
                <Plus /><span>新建画布</span>
              </button>
              <button type="button" role="menuitem" @click="runFileMenuAction(saveCanvasToLibrary)">
                <UploadFilled /><span>保存画布到素材库</span>
              </button>
              <span class="file-menu-sep" />
              <button
                type="button"
                role="menuitem"
                class="is-danger"
                @click="runFileMenuAction(deleteCurrentCanvas)"
              >
                <Delete /><span>删除当前画布</span>
              </button>
            </template>
          </div>
        </div>
        <template v-if="adminMode">
          <span class="project-name">{{ workspaceTitle }}</span>
        </template>
        <template v-else>
          <input
            v-if="canvasNameEditing"
            ref="canvasNameInput"
            v-model="canvasNameDraft"
            class="canvas-name-input"
            type="text"
            maxlength="40"
            aria-label="画布名称"
            placeholder="给画布起个名字"
            title="回车保存，Esc 取消"
            @keydown="handleCanvasNameKeydown"
            @blur="finishCanvasNameEdit()"
          />
          <button
            v-else
            type="button"
            class="canvas-name-action"
            :title="`${canvasDisplayName}（点击修改画布名称）`"
            :aria-label="`修改画布名称：${canvasDisplayName}`"
            @click="startCanvasNameEdit"
          >
            <span class="canvas-name-text">{{ canvasDisplayName }}</span>
            <EditPen />
          </button>
        </template>
      </div>

      <div v-if="!adminMode" class="save-state" role="status" :class="{ saving: saveState === '正在保存' }">
        <Check v-if="saveState !== '正在保存'" />
        <span v-else class="save-spinner" />
        {{ saveState }}
      </div>

      <div class="topbar-actions">
        <button type="button" class="icon-action" title="全屏" aria-label="全屏" @click="toggleFullscreen">
          <FullScreen />
        </button>
      </div>
    </header>

    <section class="workspace-shell" :class="{ 'right-panel-collapsed': rightPanelCollapsed }">
      <aside class="tool-rail" aria-label="画布工具">
        <div class="rail-actions">
          <button
            type="button"
            class="rail-action"
            :class="{ active: createMenuOpen }"
            aria-label="创作"
            @click.stop="toggleCreateMenu"
          >
            <MagicStick />
            <span>创作</span>
          </button>
          <button type="button" class="rail-action" aria-label="添加文字" @click="addTextNode">
            <EditPen />
            <span>文字</span>
          </button>
          <button
            type="button"
            class="rail-action"
            :class="{ active: marqueeMode }"
            :aria-pressed="marqueeMode"
            aria-label="框选节点"
            title="框选：在画布空白处拖动，框住多个节点后可整体移动"
            @click="toggleMarqueeMode"
          >
            <Crop />
            <span>框选</span>
          </button>
          <button
            type="button"
            class="rail-action"
            :class="{ active: materialLibraryOpen }"
            aria-label="打开我的素材库"
            title="我的素材库：在画布内打开，点一张素材就直接放到画布上"
            @click="openMaterialLibrary"
          >
            <FolderOpened />
            <span>我的素材库</span>
          </button>
          <button
            type="button"
            class="rail-action"
            aria-label="把选中的多个节点归为一组"
            title="成组：把画布上选中的多个节点归为一组，之后拖动组框会带着成员一起移动"
            @click="groupSelectedNodes"
          >
            <Grid />
            <span>成组</span>
          </button>
          <button
            type="button"
            class="rail-action"
            aria-label="解散选中的分组"
            title="解组：解散选中的分组，成员恢复为独立节点（位置不变）"
            @click="ungroupSelectedNode"
          >
            <FolderRemove />
            <span>解组</span>
          </button>
          <button
            type="button"
            class="rail-action"
            :class="{ active: templatePanelOpen }"
            aria-label="画布模板"
            title="画布模板：把选中的一段流程存成模板，之后一键复用；也可以直接套用别人的模板"
            @click="openTemplatePanel"
          >
            <Collection />
            <span>模板</span>
          </button>
          <button
            type="button"
            class="rail-action"
            :class="{ active: generationConfigOpen }"
            aria-label="生成配置"
            @click.stop="toggleGenerationConfig"
          >
            <Operation />
            <span>生成配置</span>
          </button>
        </div>

        <div class="rail-line-control">
          <View />
          <span>连线</span>
          <button
            type="button"
            class="mini-switch"
            :class="{ on: edgesVisible }"
            :aria-pressed="edgesVisible"
            :title="edgesVisible ? '隐藏连线并进入干净模式' : '显示工作流连线'"
            @click="toggleEdges"
          >
            <span />
          </button>
          <small>关闭后进入<br />干净模式</small>
        </div>

        <Transition name="popover">
          <div v-if="createMenuOpen" class="create-popover" @pointerdown.stop @click.stop>
            <div class="popover-arrow" />
            <header>
              <strong>创建节点</strong>
              <button type="button" aria-label="关闭创建节点面板" @click="createMenuOpen = false">
                <Close />
              </button>
            </header>
            <div class="create-options">
              <button
                v-for="option in creationOptions"
                :key="option.type"
                type="button"
                :class="{ featured: option.type === 'video-generation' }"
                @click="handleCreateOption(option.type)"
              >
                <component :is="option.icon" />
                <span>{{ option.label }}</span>
              </button>
            </div>
          </div>
        </Transition>

        <input ref="fileInput" class="visually-hidden" type="file" accept="image/*" @change="handleUpload" />
        <input ref="referenceFileInput" class="visually-hidden" type="file" accept="image/*" @change="handleReferenceUpload" />
        <input ref="videoFileInput" class="visually-hidden" type="file" accept="video/*" @change="handleVideoUpload" />
      </aside>

      <section
        ref="canvasArea"
        class="canvas-area"
        style="width: 100%; height: 100%"
        :class="{ 'clean-mode': !edgesVisible, 'connection-active': connectionInProgress, 'marquee-mode': marqueeMode, 'marking-mode': markingActive, 'prompt-zoom': Boolean(promptZoomNodeId) }"
        @pointerdown.capture="captureConnectionPointer"
        @click="closeFloatingMenus"
      >
        <VueFlow
          id="ai-creation-workflow"
          v-model:nodes="nodes"
          v-model:edges="edges"
          class="flow-canvas"
          style="width: 100%; height: 100%"
          :default-viewport="{ x: 24, y: 110, zoom: 0.92 }"
          :min-zoom="0.25"
          :max-zoom="1.8"
          :fit-view-on-init="false"
          :nodes-connectable="edgesVisible"
          :nodes-draggable="!markingActive"
          :elements-selectable="!markingActive"
          :selection-key-code="marqueeMode ? true : 'Shift'"
          :pan-on-drag="marqueeMode ? [1] : true"
          :zoom-on-scroll="true"
          :zoom-on-pinch="true"
          :delete-key-code="null"
          :is-valid-connection="isValidCanvasConnection"
          @connect="handleConnect"
          @connect-start="handleConnectStart"
          @connect-end="handleConnectEnd"
          @edge-click="handleEdgeClick"
          @node-click="handleNodeClick"
          @node-drag-stop="handleNodeDragStop"
          @pane-click="handlePaneClick"
          @selection-end="handleSelectionEnd"
        >
          <template #node-upload="{ id, data, selected }">
            <article class="workflow-node upload-node reference-media-node" :class="{ selected }" :style="uploadNodeStyle(data)">
              <Handle type="source" :position="Position.Right" class="flow-handle" title="从这里拖动连线" aria-label="上传图片输出连接点" />
              <small class="node-kind-label node-display-name"><Picture /><NodeName :title="getNodeDisplayName(data, 'upload')" @rename="renameNode(id, $event)" /></small>
              <div v-if="selected" class="node-top-toolbar nodrag nopan"><button type="button" @click.stop="showNodeInfo(id)">信息</button><button type="button" @click.stop="deleteNode(id)">删除</button><button type="button" @click.stop="openImageNodeUpload(id)">上传图片</button></div>
              <NodeActionMenu :open="nodeActionId === id" @delete="deleteNode(id)" />
              <div class="node-image-frame" :class="{ 'mark-target-wrap': markingActive }" :style="imageFrameStyle(data)">
                <img v-if="data.image" :src="data.image" alt="已上传素材" class="mark-target" draggable="false" @click="handleCanvasMarkClick(id, $event)" />
                <div v-else class="node-image-background" :style="{ background: data.background }" />
                <div v-if="markingActive" class="mark-badge-layer">
                  <span
                    v-for="badge in markBadgesForNode(id)"
                    :key="badge.id"
                    class="mark-badge"
                    :class="{ active: badge.active }"
                    :style="badge.style"
                  >{{ badge.index }}</span>
                </div>
              </div>
            </article>
          </template>

          <template #node-prompt="{ id, data, selected }">
            <article class="workflow-node prompt-node" :class="{ selected, 'has-slot': h5SlotMode }">
              <Handle type="target" :position="Position.Left" class="flow-handle" title="拖到这里完成连接" aria-label="提示词输入连接点" />
              <Handle type="source" :position="Position.Right" class="flow-handle" title="从这里拖动连线" aria-label="提示词输出连接点" />
              <NodeHeader :icon="MagicStick" :title="getNodeDisplayName(data, 'prompt')" icon-tone="purple" @rename="renameNode(id, $event)" @more="toggleNodeActions(id)" />
              <NodeActionMenu :open="nodeActionId === id" @delete="deleteNode(id)" />
              <button
                v-if="h5SlotMode"
                type="button"
                class="slot-pill nodrag nopan"
                :class="`is-${slotRoleFor(id)}`"
                :title="slotPillTitle(id)"
                @pointerdown.stop
                @click.stop="openSlotMenu(id, $event)"
              >{{ slotPillText(id) }}<i class="slot-pill-caret" aria-hidden="true">▾</i></button>
              <p>{{ data.prompt }}</p>
            </article>
          </template>

          <template #node-video="{ id, data, selected }">
            <article class="video-generation-node" :class="{ selected: selected || selectedNodeId === id }" :style="videoGeneratorNodeStyle(data)">
              <Handle type="target" :position="Position.Left" class="flow-handle" title="拖到这里完成连接" aria-label="视频生成输入连接点" />
              <Handle type="source" :position="Position.Right" class="flow-handle" title="从这里拖动连线" aria-label="视频生成输出连接点" />
              <small class="node-kind-label node-display-name"><VideoCamera /><NodeName :title="getNodeDisplayName(data, 'video')" @rename="renameNode(id, $event)" /></small>
              <div v-if="selected || selectedNodeId === id" class="image-action-toolbar video-action-toolbar nodrag nopan">
                <button type="button" @click.stop="showNodeInfo(id)">信息</button><button type="button" @click.stop="deleteNode(id)">删除</button>
                <button type="button" @click.stop="expandedNodeId = id">编辑</button><button type="button" @click.stop="openVideoNodeUpload(id)">上传视频</button>
              </div>
              <div class="video-generation-preview">
                <video v-if="data.output?.url" :src="data.output.url" controls playsinline />
                <div v-else class="empty-video-node"><VideoCamera /><span>空视频节点</span></div>
              </div>
              <!-- 提示词卡片：放大态时 Teleport 到 body 层（画布有 transform，fixed 会被当成节点内定位），
                   卡片居中 + 1.35 倍放大，画布其余部分由 .prompt-zoom-scrim 冻结压暗。 -->
              <Teleport v-if="selected || selectedNodeId === id || expandedNodeId === id" to="body" :disabled="promptZoomNodeId !== id">
              <div class="node-follow-panel video-composer-panel nodrag nopan" :class="{ 'is-zoom-open': promptZoomNodeId === id }" :style="promptZoomStyle(id)" @pointerdown.stop @click.stop>
              <div class="composer-head">
              <div v-if="directNodeReferenceChips(id).length" class="node-upstream-thumbs nodrag nopan" aria-label="上游素材">
                <div v-for="(reference, referenceIndex) in directNodeReferenceChips(id)" :key="reference.id" class="upstream-thumb">
                  <button type="button" class="upstream-thumb-open" :title="`${reference.name}（点击放大预览）`" :aria-label="`放大预览 ${reference.name}`" @pointerdown.stop @click.stop="openUpstreamPreview(reference, $event)">
                    <img v-if="reference.image" :src="reference.image" alt="" />
                    <component :is="reference.icon" v-else />
                  </button>
                  <span class="upstream-thumb-index" aria-hidden="true">{{ referenceIndex + 1 }}</span>
                  <button v-if="hasDirectReferenceEdge(id, reference.id)" type="button" class="upstream-thumb-remove" title="移除引用" aria-label="移除引用" @pointerdown.stop @click.stop="removeReferenceChip(id, reference.id)"><Close /></button>
                  <button type="button" class="upstream-thumb-mention" title="引用到提示词" aria-label="把该上游引用到提示词" @pointerdown.stop @click.stop="insertReferenceToPrompt(id, reference)">@</button>
                </div>
              </div>
              <div v-else-if="upstreamNodes(id).length" class="node-upstream-thumbs node-upstream-thumbs-placeholder nodrag nopan" aria-label="上游素材占位">
                <div v-for="(upstream, upstreamIndex) in upstreamNodes(id)" :key="`upstream-placeholder-${upstream.id || upstreamIndex}`" class="upstream-thumb-placeholder" aria-hidden="true"></div>
              </div>
              <button type="button" class="composer-zoom-button nodrag nopan" :title="promptZoomNodeId === id ? '收起提示词卡片（Esc）' : '放大提示词卡片'" :aria-label="promptZoomNodeId === id ? '收起提示词卡片' : '放大提示词卡片'" @pointerdown.stop @click.stop="promptZoomNodeId === id ? closePromptZoom() : openPromptZoom(id)">
                <ScaleToOriginal v-if="promptZoomNodeId === id" />
                <FullScreen v-else />
              </button>
              </div>
              <div class="node-prompt-shell">
                <div class="generation-prompt-inline">
                  <div :key="promptEditorDomKey(id)" :ref="(element) => setGenerationConfigNodePromptRef(id, element)" class="node-prompt-input inline-prompt-editor" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="描述要生成的视频内容" @input="updateInlineGeneratorPrompt(id, $event)" @blur="commitInlinePrompt(id, $event)" @click="handlePromptEditorClick">
                    <template v-for="part in inlinePromptParts(data, id, false, true, false)" :key="part.key">
                      <span v-if="part.type === 'reference' && part.reference" class="inline-prompt-reference" draggable="true" :data-reference-id="part.reference.id" contenteditable="false"><img v-if="part.reference.image" :src="part.reference.image" alt="" /><component v-else :is="part.reference.icon" /><span>@{{ part.reference.name }}</span></span>
                      <span v-else-if="part.type === 'element' && part.element" class="inline-prompt-reference inline-prompt-element" draggable="true" :data-element-id="part.element.id" :title="`标记元素 ${part.index} · ${part.element.label}`" contenteditable="false"><img v-if="part.element.thumb" :src="part.element.thumb" alt="" /><b class="inline-element-index">{{ part.index }}</b><span class="inline-element-name">{{ part.element.label }}</span><i class="inline-element-caret" role="button" :aria-label="`选择「${part.element.label}」的内容`" @click.stop="openElementMenu(part.element.id, id, $event)"><ArrowDown /></i></span>
                      <span v-else class="inline-prompt-text" data-placeholder="描述要生成的视频内容">{{ part.text || '' }}</span>
                    </template>
                  </div>
                </div>
              </div>
              <p v-if="data.error" class="generator-error">{{ data.error }}</p>
              <div class="video-composer-controls">
                <select :value="data.config?.model || defaultGeneratorModel({ type: 'video', data })" @change="updateGeneratorConfig(id, 'model', $event.target.value)"><option v-for="model in generatorModels({ type: 'video', data })" :key="model" :value="model">{{ generatorModelLabel(model) }}</option></select>
                <select :value="videoPresetValue(data)" aria-label="视频生成规格" @change="updateVideoPreset(id, $event.target.value)"><option value="720P|16:9|6">720P · 横屏 · 6s</option><option value="1080P|16:9|5">1080P · 横屏 · 5s</option><option value="720P|9:16|6">720P · 竖屏 · 6s</option></select>
                <button type="button" @click.stop="showCameraPlaceholder"><VideoCamera />摄像机</button>
                <button type="button" class="node-run-button" :disabled="data.status === 'running'" @click.stop="runGenerator(id)">
                  {{ data.status === 'running' ? '生成中…' : data.output?.url ? '重新生成' : '生成视频' }}
                </button>
              </div>
              </div>
              </Teleport>
            </article>
          </template>

          <template #node-result="{ id, data, selected }">
            <article class="workflow-node result-node image-result-node" :class="{ selected, 'has-slot': h5SlotMode }" :style="uploadNodeStyle(data)">
              <Handle type="target" :position="Position.Left" class="flow-handle" title="拖到这里完成连接" aria-label="生成结果输入连接点" />
              <small class="node-kind-label node-display-name"><Picture /><NodeName :title="getNodeDisplayName(data, 'result')" @rename="renameNode(id, $event)" /></small>
              <button
                v-if="h5SlotMode"
                type="button"
                class="slot-pill nodrag nopan"
                :class="`is-${slotRoleFor(id)}`"
                :title="slotPillTitle(id)"
                @pointerdown.stop
                @click.stop="openSlotMenu(id, $event)"
              >{{ slotPillText(id) }}<i class="slot-pill-caret" aria-hidden="true">▾</i></button>
              <div v-if="selected && data.mode === 'image-result'" class="node-top-toolbar nodrag nopan"><button type="button" @click.stop="showNodeInfo(id)">信息</button><button type="button" @click.stop="deleteNode(id)">删除</button><button type="button" @click.stop="openImageNodeUpload(id)">上传图片</button></div>
              <NodeHeader v-if="data.mode !== 'image-result'" :icon="CircleCheck" :title="getNodeDisplayName(data, 'result')" icon-tone="green" @rename="renameNode(id, $event)" @more="toggleNodeActions(id)" />
              <NodeActionMenu :open="nodeActionId === id" @delete="deleteNode(id)" />
              <div v-if="data.mode === 'image-result'" class="node-image-frame" :class="{ 'mark-target-wrap': markingActive }" :style="imageFrameStyle(data)">
                <img :src="data.image" alt="图片生成结果" class="mark-target" draggable="false" @click="handleCanvasMarkClick(id, $event)" />
                <div v-if="markingActive" class="mark-badge-layer">
                  <span
                    v-for="badge in markBadgesForNode(id)"
                    :key="badge.id"
                    class="mark-badge"
                    :class="{ active: badge.active }"
                    :style="badge.style"
                  >{{ badge.index }}</span>
                </div>
              </div>
              <div v-else class="result-preview" :class="data.state">
                <span v-if="data.state === 'running'" class="result-spinner" />
                <VideoCamera v-else />
              </div>
              <small v-if="data.mode !== 'image-result'">{{ resultStateText(data.state) }}</small>
            </article>
          </template>

          <template #node-image="{ id, data, selected }">
            <article class="image-generation-node" :class="{ selected: selected || selectedNodeId === id, 'has-slot': h5SlotMode }" :style="imageGeneratorNodeStyle(data)">
              <Handle type="target" :position="Position.Left" class="flow-handle" title="拖到这里完成连接" aria-label="图像生成输入连接点" />
              <Handle type="source" :position="Position.Right" class="flow-handle" title="从这里拖动连线" aria-label="图像生成输出连接点" />
              <small class="node-kind-label node-display-name"><Picture /><NodeName :title="getNodeDisplayName(data, 'image')" @rename="renameNode(id, $event)" /></small>
              <button
                v-if="h5SlotMode"
                type="button"
                class="slot-pill nodrag nopan"
                :class="`is-${slotRoleFor(id)}`"
                :title="slotPillTitle(id)"
                @pointerdown.stop
                @click.stop="openSlotMenu(id, $event)"
              >{{ slotPillText(id) }}<i class="slot-pill-caret" aria-hidden="true">▾</i></button>
              <div v-if="selected || selectedNodeId === id" class="image-action-toolbar nodrag nopan">
                <button type="button" @click.stop="showNodeInfo(id)">信息</button><button type="button" @click.stop="deleteNode(id)">删除</button>
                <button type="button" @click.stop="confirmAssetStored(id)">存素材</button><button type="button" @click.stop="downloadGeneratedImage(id)">下载</button>
                <button type="button" @click.stop="openGeneratorOutputUpload(id)">替换图片</button><button type="button" @click.stop="copyNodePrompt(id)">复制提示词</button>
              </div>
              <div class="image-generation-preview" :class="{ 'mark-target-wrap': markingActive }">
                <img v-if="data.output?.url" :src="data.output.url" alt="图像生成结果" class="mark-target" draggable="false" @click="handleCanvasMarkClick(id, $event)" />
                <div v-else class="empty-image-node"><Picture /><span>空图片节点</span></div>
                <div v-if="markingActive && data.output?.url" class="mark-badge-layer">
                  <span
                    v-for="badge in markBadgesForNode(id)"
                    :key="badge.id"
                    class="mark-badge"
                    :class="{ active: badge.active }"
                    :style="badge.style"
                  >{{ badge.index }}</span>
                </div>
              </div>
              <div v-if="Array.isArray(data.outputVariants) && data.outputVariants.length > 1" class="image-variant-strip nodrag nopan">
                <button
                  v-for="(variant, variantIndex) in data.outputVariants"
                  :key="variant.assetId || variant.url || variantIndex"
                  type="button"
                  class="image-variant-thumb"
                  :class="{ active: data.output?.url === variant.url }"
                  :title="`选择第 ${variantIndex + 1} 张`"
                  @pointerdown.stop
                  @click.stop="selectImageVariant(id, variantIndex)"
                >
                  <img :src="variant.url" alt="" />
                  <span>{{ variantIndex + 1 }}</span>
                </button>
              </div>
              <Teleport v-if="selected || selectedNodeId === id || expandedNodeId === id" to="body" :disabled="promptZoomNodeId !== id">
              <div class="node-follow-panel image-composer-panel nodrag nopan" :class="{ 'is-zoom-open': promptZoomNodeId === id }" :style="promptZoomStyle(id)" @pointerdown.stop @click.stop>
              <div class="composer-head">
              <div v-if="directNodeReferenceChips(id).length" class="node-upstream-thumbs nodrag nopan" aria-label="上游素材">
                <div v-for="(reference, referenceIndex) in directNodeReferenceChips(id)" :key="reference.id" class="upstream-thumb">
                  <button type="button" class="upstream-thumb-open" :title="`${reference.name}（点击放大预览）`" :aria-label="`放大预览 ${reference.name}`" @pointerdown.stop @click.stop="openUpstreamPreview(reference, $event)">
                    <img v-if="reference.image" :src="reference.image" alt="" />
                    <component :is="reference.icon" v-else />
                  </button>
                  <span class="upstream-thumb-index" aria-hidden="true">{{ referenceIndex + 1 }}</span>
                  <button v-if="hasDirectReferenceEdge(id, reference.id)" type="button" class="upstream-thumb-remove" title="移除引用" aria-label="移除引用" @pointerdown.stop @click.stop="removeReferenceChip(id, reference.id)"><Close /></button>
                  <button type="button" class="upstream-thumb-mention" title="引用到提示词" aria-label="把该上游引用到提示词" @pointerdown.stop @click.stop="insertReferenceToPrompt(id, reference)">@</button>
                </div>
              </div>
              <div v-else-if="upstreamNodes(id).length" class="node-upstream-thumbs node-upstream-thumbs-placeholder nodrag nopan" aria-label="上游素材占位">
                <div v-for="(upstream, upstreamIndex) in upstreamNodes(id)" :key="`upstream-placeholder-${upstream.id || upstreamIndex}`" class="upstream-thumb-placeholder" aria-hidden="true"></div>
              </div>
              <button type="button" class="composer-zoom-button nodrag nopan" :title="promptZoomNodeId === id ? '收起提示词卡片（Esc）' : '放大提示词卡片'" :aria-label="promptZoomNodeId === id ? '收起提示词卡片' : '放大提示词卡片'" @pointerdown.stop @click.stop="promptZoomNodeId === id ? closePromptZoom() : openPromptZoom(id)">
                <ScaleToOriginal v-if="promptZoomNodeId === id" />
                <FullScreen v-else />
              </button>
              </div>
              <div class="node-prompt-shell">
                <div class="generation-prompt-inline">
                  <div :key="promptEditorDomKey(id)" :ref="(element) => setGenerationConfigNodePromptRef(id, element)" class="node-prompt-input inline-prompt-editor" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="输入想生成的画面内容" @input="updateInlineGeneratorPrompt(id, $event)" @blur="commitInlinePrompt(id, $event)" @click="handlePromptEditorClick">
                    <template v-for="part in inlinePromptParts(data, id, false, true, false)" :key="part.key">
                      <span v-if="part.type === 'reference' && part.reference" class="inline-prompt-reference" draggable="true" :data-reference-id="part.reference.id" contenteditable="false"><img v-if="part.reference.image" :src="part.reference.image" alt="" /><component v-else :is="part.reference.icon" /><span>@{{ part.reference.name }}</span></span>
                      <span v-else-if="part.type === 'element' && part.element" class="inline-prompt-reference inline-prompt-element" draggable="true" :data-element-id="part.element.id" :title="`标记元素 ${part.index} · ${part.element.label}`" contenteditable="false"><img v-if="part.element.thumb" :src="part.element.thumb" alt="" /><b class="inline-element-index">{{ part.index }}</b><span class="inline-element-name">{{ part.element.label }}</span><i class="inline-element-caret" role="button" :aria-label="`选择「${part.element.label}」的内容`" @click.stop="openElementMenu(part.element.id, id, $event)"><ArrowDown /></i></span>
                      <span v-else class="inline-prompt-text" data-placeholder="输入想生成的画面内容">{{ part.text || '' }}</span>
                    </template>
                  </div>
                </div>
              </div>
              <p v-if="data.error" class="generator-error">{{ data.error }}</p>
              <div class="image-composer-controls with-count">
                <div class="image-composer-assets">
                  <button type="button" class="composer-asset-button" title="参考图" @click.stop="openReferenceUpload(id)"><Picture /><span>参考图</span></button>
                  <button type="button" class="composer-asset-button" title="标记" aria-label="标记图片局部元素" @click.stop="openMarking(id)"><Aim /><span>标记</span></button>
                  <button type="button" class="composer-asset-button" @click.stop="showCameraPlaceholder"><VideoCamera /><span>摄像机</span></button>
                </div>
                <select class="composer-model-select" :value="data.config?.model || defaultGeneratorModel({ type: 'image', data })" @change="updateGeneratorConfig(id, 'model', $event.target.value)"><option v-for="model in generatorModels({ type: 'image', data })" :key="model" :value="model">{{ generatorModelLabel(model) }}</option></select>
                <select class="composer-ratio-select" :value="data.config?.ratio || '1:1'" @change="updateGeneratorConfig(id, 'ratio', $event.target.value)"><option>1:1</option><option>16:9</option><option>9:16</option><option>4:3</option><option>3:4</option></select>
                <select
                  class="composer-count-select"
                  title="一个节点出几张图；报告里的结果图张数＝各出图节点张数相加"
                  aria-label="出图张数"
                  :value="generatorCount({ data })"
                  @change="updateGeneratorConfig(id, 'count', Number($event.target.value))"
                >
                  <option v-for="count in GENERATOR_COUNT_OPTIONS" :key="count" :value="count">{{ count }}张</option>
                </select>
                <button type="button" class="node-run-button" :disabled="data.status === 'running'" @click.stop="runGenerator(id)">
                  {{ data.status === 'running' ? '生成中…' : data.output?.url ? '重新生成' : '生成图像' }}
                </button>
              </div>
              </div>
              </Teleport>
            </article>
          </template>

          <template #node-text="{ id, data, selected }">
            <article v-if="data.mode === 'free-text'" class="free-text-node" :class="{ selected }" :style="textNodeShellStyle(data)">
              <small class="node-kind-label node-display-name"><EditPen /><NodeName :title="getNodeDisplayName(data, 'text')" @rename="renameNode(id, $event)" /></small>
              <div v-if="selected" class="text-floating-toolbar plain-text-toolbar nodrag nopan" @pointerdown.stop @click.stop>
                <label class="text-color-control" title="文字颜色">
                  <input type="color" :value="data.style?.color || '#20242b'" aria-label="文字颜色" @input="updatePlainTextStyle(id, 'color', $event.target.value)" />
                </label>
                <select :value="data.style?.fontFamily || 'Microsoft YaHei'" aria-label="字体" title="字体" @change="updatePlainTextStyle(id, 'fontFamily', $event.target.value)">
                  <option value="Microsoft YaHei">Aa</option>
                  <option value="Arial">Arial</option>
                  <option value="Georgia">Georgia</option>
                  <option value="KaiTi">楷体</option>
                </select>
                <input class="text-size-input" type="number" min="12" max="240" step="0.5" :value="data.style?.fontSize || 42" aria-label="字号" title="字号" @change="updatePlainTextStyle(id, 'fontSize', $event.target.value)" />
                <div class="text-align-group" role="group" aria-label="文字对齐">
                  <button type="button" :class="{ active: (data.style?.textAlign || 'left') === 'left' }" title="左对齐" aria-label="左对齐" @click.stop="updatePlainTextStyle(id, 'textAlign', 'left')">左</button>
                  <button type="button" :class="{ active: data.style?.textAlign === 'center' }" title="居中对齐" aria-label="居中对齐" @click.stop="updatePlainTextStyle(id, 'textAlign', 'center')">中</button>
                  <button type="button" :class="{ active: data.style?.textAlign === 'right' }" title="右对齐" aria-label="右对齐" @click.stop="updatePlainTextStyle(id, 'textAlign', 'right')">右</button>
                </div>
                <button type="button" title="删除文字" aria-label="删除文字" @click.stop="deleteNode(id)"><Delete /></button>
              </div>
              <div
                :ref="(element) => setTextEditorRef(id, element)"
                class="free-text-editor"
                :class="{ 'nodrag nopan editing': textEditingNodeId === id }"
                :style="textEditorStyle(data)"
                :contenteditable="textEditingNodeId === id"
                spellcheck="false"
                role="textbox"
                aria-label="画布文字"
                @dblclick.stop="focusFreeTextEditor(id)"
                @blur="finishFreeTextEditing(id, $event)"
                @keydown.esc.prevent="finishFreeTextEditing(id, $event)"
                @input="updateFreeText(id, $event)"
              >{{ data.text || '双击编辑标题' }}</div>
            </article>
            <article v-else class="workflow-node smart-text-node" :class="{ selected, 'has-slot': h5SlotMode }" :style="textNodeShellStyle(data)">
              <Handle type="target" :position="Position.Left" class="flow-handle" title="拖到这里完成连接" aria-label="文字输入连接点" />
              <Handle type="source" :position="Position.Right" class="flow-handle" title="从这里拖动连线" aria-label="文字输出连接点" />
              <small class="node-kind-label node-display-name"><EditPen /><NodeName :title="getNodeDisplayName(data, 'text')" @rename="renameNode(id, $event)" /></small>
              <button
                v-if="h5SlotMode"
                type="button"
                class="slot-pill nodrag nopan"
                :class="`is-${slotRoleFor(id)}`"
                :title="slotPillTitle(id)"
                @pointerdown.stop
                @click.stop="openSlotMenu(id, $event)"
              >{{ slotPillText(id) }}<i class="slot-pill-caret" aria-hidden="true">▾</i></button>
              <NodeActionMenu :open="nodeActionId === id" @delete="deleteNode(id)" />
              <div v-if="selected" class="smart-node-actions nodrag nopan">
                <button type="button" @click.stop="toggleTextAgent(id)"><MagicStick />编辑</button>
                <button type="button" @click.stop="focusTextEditor(id)"><EditPen />编辑文字</button>
                <button type="button" @click.stop="createImageBranch(id)"><Picture />生图</button>
                <button type="button" @click.stop="addTextToPortfolio(id)"><FolderOpened />添加到素材库</button>
                <button type="button" title="把这段文字放大到独立面板里看/写" aria-label="放大文字面板" @click.stop="openTextZoom(id)"><FullScreen />放大</button>
                <button type="button" @click.stop="deleteNode(id)">删除</button>
              </div>
              <div
                :ref="(element) => setTextEditorRef(id, element)"
                class="smart-text-editor"
                :class="{ 'nodrag nopan editing': textEditingNodeId === id }"
                :contenteditable="textEditingNodeId === id"
                spellcheck="false"
                role="textbox"
                aria-label="智能文本"
                @blur="finishTextEditing(id, $event)"
                @keydown.esc.prevent="finishTextEditing(id, $event)"
                @wheel="handleTextEditorWheel(id, $event)"
              >{{ smartTextValue(data) }}</div>
              <!-- 文本节点编辑卡片：与图像/视频节点完全同一套卡片结构（上游小图标 + @ 引用片 + 文本模型选择），
                   输入框仍然编辑 data.prompt / data.promptParts，因此 @ 引用、标记元素片、光标插入全部复用既有链路。 -->
              <Teleport v-if="selected && textAgentNodeId === id" to="body" :disabled="promptZoomNodeId !== id">
              <div class="node-follow-panel image-composer-panel text-agent-panel nodrag nopan" :class="{ 'is-zoom-open': promptZoomNodeId === id }" :style="promptZoomStyle(id)" @pointerdown.stop @click.stop>
              <div class="composer-head">
              <div v-if="directNodeReferenceChips(id).length" class="node-upstream-thumbs nodrag nopan" aria-label="上游素材">
                <div v-for="(reference, referenceIndex) in directNodeReferenceChips(id)" :key="reference.id" class="upstream-thumb">
                  <button type="button" class="upstream-thumb-open" :title="`${reference.name}（点击放大预览）`" :aria-label="`放大预览 ${reference.name}`" @pointerdown.stop @click.stop="openUpstreamPreview(reference, $event)">
                    <img v-if="reference.image" :src="reference.image" alt="" />
                    <component :is="reference.icon" v-else />
                  </button>
                  <span class="upstream-thumb-index" aria-hidden="true">{{ referenceIndex + 1 }}</span>
                  <button v-if="hasDirectReferenceEdge(id, reference.id)" type="button" class="upstream-thumb-remove" title="移除引用" aria-label="移除引用" @pointerdown.stop @click.stop="removeReferenceChip(id, reference.id)"><Close /></button>
                  <button type="button" class="upstream-thumb-mention" title="引用到提示词" aria-label="把该上游引用到提示词" @pointerdown.stop @click.stop="insertReferenceToPrompt(id, reference)">@</button>
                </div>
              </div>
              <div v-else-if="upstreamNodes(id).length" class="node-upstream-thumbs node-upstream-thumbs-placeholder nodrag nopan" aria-label="上游素材占位">
                <div v-for="(upstream, upstreamIndex) in upstreamNodes(id)" :key="`upstream-placeholder-${upstream.id || upstreamIndex}`" class="upstream-thumb-placeholder" aria-hidden="true"></div>
              </div>
              <button type="button" class="composer-zoom-button nodrag nopan" :title="promptZoomNodeId === id ? '收起提示词卡片（Esc）' : '放大提示词卡片'" :aria-label="promptZoomNodeId === id ? '收起提示词卡片' : '放大提示词卡片'" @pointerdown.stop @click.stop="promptZoomNodeId === id ? closePromptZoom() : openPromptZoom(id)">
                <ScaleToOriginal v-if="promptZoomNodeId === id" />
                <FullScreen v-else />
              </button>
              </div>
              <div class="node-prompt-shell">
                <div class="generation-prompt-inline">
                  <div :ref="(element) => setGenerationConfigNodePromptRef(id, element)" class="node-prompt-input inline-prompt-editor" contenteditable="true" role="textbox" aria-multiline="true" :data-placeholder="TEXT_AGENT_PLACEHOLDER" @input="updateInlineGeneratorPrompt(id, $event)" @blur="commitInlinePrompt(id, $event)" @click="handlePromptEditorClick">
                    <template v-for="part in inlinePromptParts(data, id, false, true, false)" :key="part.key">
                      <span v-if="part.type === 'reference' && part.reference" class="inline-prompt-reference" draggable="true" :data-reference-id="part.reference.id" contenteditable="false"><img v-if="part.reference.image" :src="part.reference.image" alt="" /><component v-else :is="part.reference.icon" /><span>@{{ part.reference.name }}</span></span>
                      <span v-else-if="part.type === 'element' && part.element" class="inline-prompt-reference inline-prompt-element" draggable="true" :data-element-id="part.element.id" :title="`标记元素 ${part.index} · ${part.element.label}`" contenteditable="false"><img v-if="part.element.thumb" :src="part.element.thumb" alt="" /><b class="inline-element-index">{{ part.index }}</b><span class="inline-element-name">{{ part.element.label }}</span><i class="inline-element-caret" role="button" :aria-label="`选择「${part.element.label}」的内容`" @click.stop="openElementMenu(part.element.id, id, $event)"><ArrowDown /></i></span>
                      <span v-else class="inline-prompt-text" :data-placeholder="TEXT_AGENT_PLACEHOLDER">{{ part.text || '' }}</span>
                    </template>
                  </div>
                </div>
              </div>
              <p v-if="data.error" class="generator-error">{{ data.error }}</p>
              <div class="image-composer-controls text-agent-controls">
                <select class="composer-model-select" :value="textAgentModelFor(data)" aria-label="选择文本模型" :disabled="!textAgentModels.length" @change="updateGeneratorConfig(id, 'model', $event.target.value)">
                  <option v-if="!textAgentModels.length" value="">未配置文本模型</option>
                  <option v-for="model in textAgentModels" :key="model" :value="model">{{ generatorModelLabel(model) }}</option>
                </select>
                <button type="button" class="node-run-button" :disabled="textAgentLoading" @click.stop="requestTextAgent(id)">{{ textAgentLoading ? '发送中…' : '发送' }}</button>
              </div>
              </div>
              </Teleport>
            </article>
          </template>

          <template #node-config="{ id, data, selected }">
            <article class="canvas-generation-config generation-config-node" :class="{ selected }">
              <Handle type="target" :position="Position.Left" class="flow-handle" title="拖到这里完成连接" aria-label="生成配置输入连接点" />
              <Handle type="source" :position="Position.Right" class="flow-handle" title="从这里拖动连线" aria-label="生成配置输出连接点" />
              <header class="generation-config-header generation-config-node-header">
                <strong><NodeName :title="getNodeDisplayName(data, 'config')" @rename="renameNode(id, $event)" /></strong>
                <NodeActionMenu :open="nodeActionId === id" @delete="deleteNode(id)" />
                <button type="button" aria-label="删除生成配置" class="generation-config-node-delete nodrag nopan" @pointerdown.stop @click.stop="deleteNode(id)"><Close /></button>
              </header>
              <div class="generation-mode-tabs" role="tablist" aria-label="生成类型">
                <button type="button" class="nodrag nopan" :class="{ active: data.generationType === 'image' }" @click.stop="selectGenerationConfigNodeType(id, 'image')"><Picture />生图</button>
                <button type="button" class="nodrag nopan" :class="{ active: data.generationType === 'text' }" @click.stop="selectGenerationConfigNodeType(id, 'text')"><EditPen />文本</button>
                <button type="button" class="nodrag nopan" :class="{ active: data.generationType === 'video' }" @click.stop="selectGenerationConfigNodeType(id, 'video')"><VideoCamera />视频</button>
                <button type="button" class="audio-config-tab nodrag nopan" title="音频功能暂未开放" @click.stop="showAudioPlaceholder"><Microphone />音频</button>
              </div>
              <div class="generation-reference-summary" aria-label="已引用素材统计">
                <span>提示词 {{ data.prompt ? '1 个' : '0 个' }}</span>
                <span>引用素材 {{ directNodeReferenceChips(id).length }} 个</span>
                <span class="audio-placeholder">参考音频 0 个</span>
              </div>
              <button type="button" class="compose-prompt-button nodrag nopan" @click.stop="focusGenerationConfigNodePrompt(id)"><Connection />组装提示词</button>
              <div v-if="directNodeReferenceChips(id).length" class="node-upstream-thumbs nodrag nopan" aria-label="上游素材">
                <div v-for="(reference, referenceIndex) in directNodeReferenceChips(id)" :key="reference.id" class="upstream-thumb">
                  <button type="button" class="upstream-thumb-open" :title="`${reference.name}（点击放大预览）`" :aria-label="`放大预览 ${reference.name}`" @pointerdown.stop @click.stop="openUpstreamPreview(reference, $event)">
                    <img v-if="reference.image" :src="reference.image" alt="" />
                    <component :is="reference.icon" v-else />
                  </button>
                  <span class="upstream-thumb-index" aria-hidden="true">{{ referenceIndex + 1 }}</span>
                  <button v-if="hasDirectReferenceEdge(id, reference.id)" type="button" class="upstream-thumb-remove" title="移除引用" aria-label="移除引用" @pointerdown.stop @click.stop="removeReferenceChip(id, reference.id)"><Close /></button>
                  <button type="button" class="upstream-thumb-mention" title="引用到提示词" aria-label="把该上游引用到提示词" @pointerdown.stop @click.stop="insertReferenceToPrompt(id, reference)">@</button>
                </div>
              </div>
              <div v-else-if="upstreamNodes(id).length" class="node-upstream-thumbs node-upstream-thumbs-placeholder nodrag nopan" aria-label="上游素材占位">
                <div v-for="(upstream, upstreamIndex) in upstreamNodes(id)" :key="`upstream-placeholder-${upstream.id || upstreamIndex}`" class="upstream-thumb-placeholder" aria-hidden="true"></div>
              </div>
              <div class="generation-prompt-shell nodrag nopan">
                <div class="generation-prompt-inline">
                  <div
                    :key="promptEditorDomKey(id)"
                    :ref="(element) => setGenerationConfigNodePromptRef(id, element)"
                    class="generation-config-prompt inline-prompt-editor"
                    contenteditable="true"
                    role="textbox"
                    aria-multiline="true"
                    :data-placeholder="data.generationType === 'text' ? '输入要生成的文本内容' : data.generationType === 'video' ? '描述要生成的视频内容' : '描述要生成的图像内容'"
                    @input="updateInlineGenerationConfigNode(id, $event)"
                    @blur="commitInlinePrompt(id, $event)"
                    @click="handlePromptEditorClick"
                  ><template v-for="part in inlinePromptParts(data, id, false, true, false)" :key="part.key">
                    <span v-if="part.type === 'reference' && part.reference" class="inline-prompt-reference" draggable="true" :data-reference-id="part.reference.id" contenteditable="false"><img v-if="part.reference.image" :src="part.reference.image" alt="" /><component v-else :is="part.reference.icon" /><span>@{{ part.reference.name }}</span></span>
                    <span v-else-if="part.type === 'element' && part.element" class="inline-prompt-reference inline-prompt-element" draggable="true" :data-element-id="part.element.id" :title="`标记元素 ${part.index} · ${part.element.label}`" contenteditable="false"><img v-if="part.element.thumb" :src="part.element.thumb" alt="" /><b class="inline-element-index">{{ part.index }}</b><span class="inline-element-name">{{ part.element.label }}</span><i class="inline-element-caret" role="button" :aria-label="`选择「${part.element.label}」的内容`" @click.stop="openElementMenu(part.element.id, id, $event)"><ArrowDown /></i></span>
                    <span v-else class="inline-prompt-text" :data-placeholder="data.generationType === 'text' ? '输入要生成的文本内容' : data.generationType === 'video' ? '描述要生成的视频内容' : '描述要生成的图像内容'">{{ part.text || '' }}</span>
                  </template></div>
                </div>
              </div>
              <div class="generation-config-controls" :class="{ 'text-config-controls': data.generationType === 'text' }">
                <select class="nodrag nopan" :value="data.model" aria-label="选择生成模型" @change="updateGenerationConfigNode(id, 'model', $event.target.value)">
                  <option v-for="model in generatorModels({ type: data.generationType, data })" :key="model" :value="model">{{ generatorModelLabel(model) }}</option>
                </select>
                <select v-if="data.generationType !== 'text'" class="nodrag nopan" :value="data.ratio" aria-label="选择画面比例" @change="updateGenerationConfigNode(id, 'ratio', $event.target.value)">
                  <option value="1:1">自动 · 1:1 · 1 张</option>
                  <option value="16:9">横屏 · 16:9 · 1 张</option>
                  <option value="9:16">竖屏 · 9:16 · 1 张</option>
                </select>
                <button type="button" class="camera-placeholder-button nodrag nopan" @click.stop="showCameraPlaceholder"><VideoCamera />摄像机</button>
              </div>
              <button type="button" class="generation-config-run nodrag nopan" @click.stop="createGeneratorNodeFromConfig(id)"><span>✦</span><ArrowRight />生成</button>
              <small>点击生成后将直接在右侧生成结果。</small>
            </article>
          </template>

          <!-- 分组容器（VueFlow 真父子）：成员被 extent:'parent' 约束在框内，拖组带成员一起动 -->
          <template #node-group="{ id, data }">
            <div
              class="group-node"
              :class="{ 'group-node-marking': markingActive }"
              :style="{ width: `${data.width || GROUP_NODE_DEFAULT_WIDTH}px`, height: `${data.height || GROUP_NODE_DEFAULT_HEIGHT}px` }"
              @pointerdown.capture="onGroupPointerDown(id)"
            >
              <header class="group-node-head">
                <span class="group-node-title"><NodeName :title="getNodeDisplayName(data, 'group')" drag-target trigger="dblclick" @rename="renameNode(id, $event)" /></span>
                <span class="group-node-count">{{ groupMemberCount(id) }} 个节点</span>
                <button type="button" class="group-node-ungroup nodrag nopan" title="解散分组，成员恢复为独立节点" @click.stop="ungroupOneGroup(id)">解组</button>
              </header>
            </div>
          </template>

        </VueFlow>

        <!-- 提示词卡片放大态：遮罩盖住画布（画布同步灰度），挡住一切画布交互；点遮罩 = 收起 -->
        <div v-if="promptZoomNodeId" class="prompt-zoom-scrim" @pointerdown.stop @click.stop="closePromptZoom"></div>

        <!-- 文字节点放大态：把节点正文搬到这块独立大面板里读写，改动实时写回原节点。
             不拉伸节点本身（画布自带缩放，硬拉会让字号失真、位置跑偏），退出后原节点照旧留在原位。 -->
        <Transition name="fade">
          <div
            v-if="textZoomNode"
            class="text-zoom-layer"
            role="dialog"
            aria-modal="true"
            aria-label="放大编辑文字"
            @pointerdown.stop
            @click.stop="closeTextZoom"
          >
            <div class="text-zoom-panel" @pointerdown.stop @click.stop>
              <header class="text-zoom-head">
                <div class="text-zoom-title">
                  <FullScreen />
                  <strong>放大编辑</strong>
                  <span>改动实时写回画布上的节点</span>
                </div>
                <span class="text-zoom-size" aria-label="节点正文字号">{{ textZoomFontSize }}px</span>
                <button type="button" class="text-zoom-close" title="收起（Esc）" aria-label="收起放大面板" @click.stop="closeTextZoom"><Close /></button>
              </header>
              <div
                ref="textZoomEditor"
                class="text-zoom-editor"
                :style="{ fontSize: `${textZoomFontSize * 1.2}px` }"
                contenteditable="true"
                spellcheck="false"
                role="textbox"
                aria-multiline="true"
                aria-label="放大的文字内容"
                @input="handleTextZoomInput"
                @blur="flushTextZoomEdit"
                @keydown.esc.prevent.stop="closeTextZoom"
              >{{ textZoomText }}</div>
              <footer class="text-zoom-foot">
                <span>Esc 收起 · 内容随画布自动保存</span>
                <button type="button" class="text-zoom-done" @click.stop="closeTextZoom">完成</button>
              </footer>
            </div>
          </div>
        </Transition>

        <Transition name="fade">
          <div v-if="marqueeMode" class="marquee-hint" role="status" @pointerdown.stop @click.stop>
            <Aim />
            <span><strong>框选模式：</strong>在画布空白处按住拖动，框住的节点会被选中；拖动任一选中的节点可整体移动</span>
            <em v-if="marqueeSelectionCount">已选 {{ marqueeSelectionCount }} 个</em>
            <button type="button" class="marquee-hint-exit" @click.stop="toggleMarqueeMode">退出</button>
          </div>
        </Transition>

        <Transition name="fade">
          <div v-if="markingActive" class="mark-mode-bar" role="status" aria-label="元素选择模式" @pointerdown.stop @click.stop>
            <span class="mark-mode-bar-icon" aria-hidden="true"><Aim /></span>
            <div class="mark-mode-bar-copy">
              <strong>元素选择模式</strong>
              <span>点击图片选择局部元素</span>
            </div>
            <em v-if="markingState.pending">识别中…</em>
            <em v-else-if="markChips.length">已标记 {{ markChips.length }} / {{ MARKING_MAX_ELEMENTS }}</em>
            <button type="button" class="mark-mode-back" @click.stop="returnToMarkingNode">返回节点</button>
            <button type="button" class="mark-mode-close" aria-label="退出元素选择模式" title="退出" @click.stop="closeMarking"><Close /></button>
          </div>
        </Transition>

        <!-- 空画布引导：新建画布不再自带示例节点，用这块引导告诉用户从哪里开始 -->
        <Transition name="fade">
          <div
            v-if="showEmptyCanvasGuide"
            class="canvas-empty-guide"
            role="status"
            aria-label="空白画布引导"
            @pointerdown.stop
            @click.stop
          >
            <span class="canvas-empty-icon" aria-hidden="true"><MagicStick /></span>
            <strong>空白画布</strong>
            <p>选一种方式开始，节点会出现在画布中央。</p>
            <div class="canvas-empty-actions">
              <button type="button" class="empty-action-primary" @click="handleCreateOption('upload')">
                <UploadFilled />
                <span>上传图片</span>
              </button>
              <button type="button" @click="addTextNode">
                <EditPen />
                <span>添加文字</span>
              </button>
              <button type="button" @click="openCanvasTemplatePanelFromEmpty">
                <Collection />
                <span>套用模板</span>
              </button>
            </div>
            <small>也可以从左侧「创作」里添加图像生成、视频生成节点。</small>
          </div>
        </Transition>

        <Transition name="fade">
          <div v-if="connectionGuideVisible && edgesVisible && !marqueeMode && !markingActive && nodes.length" class="connection-guide" role="status" @pointerdown.stop @click.stop>
            <Connection />
            <span><strong>连接节点：</strong>从节点边缘蓝点拖到另一个节点</span>
            <button type="button" @click="dismissConnectionGuide">知道了</button>
          </div>
        </Transition>

        <Transition name="fade">
          <div v-if="connectionCreateMenu.visible" class="connection-create-menu" :style="connectionCreateMenuStyle" @pointerdown.stop @click.stop>
            <button v-for="option in connectionCreateOptions" :key="option.type" type="button" @click="createNodeAtConnection(option.type)">
              <component :is="option.icon" />
              <span>{{ option.label }}</span>
            </button>
          </div>
        </Transition>

        <Transition name="fade">
          <section
            v-if="generationConfigOpen"
            ref="generationConfigPanel"
            class="canvas-generation-config"
            :class="{ 'is-dragging': generationConfigDrag.active }"
            :style="generationConfigPanelStyle"
            aria-label="生成配置"
            @pointerdown.stop
            @click.stop
          >
            <header class="generation-config-header" @pointerdown.stop="startGenerationConfigDrag">
              <strong>生成配置</strong>
              <button type="button" aria-label="关闭生成配置" @pointerdown.stop @click="generationConfigOpen = false"><Close /></button>
            </header>
            <div class="generation-mode-tabs" role="tablist" aria-label="生成类型">
              <button type="button" :class="{ active: generationConfig.type === 'image' }" @click="selectGenerationConfigType('image')"><Picture />生图</button>
              <button type="button" :class="{ active: generationConfig.type === 'text' }" @click="selectGenerationConfigType('text')"><EditPen />文本</button>
              <button type="button" :class="{ active: generationConfig.type === 'video' }" @click="selectGenerationConfigType('video')"><VideoCamera />视频</button>
              <button type="button" class="audio-config-tab" title="音频功能暂未开放" @click="showAudioPlaceholder"><Microphone />音频</button>
            </div>
            <div class="generation-reference-summary" aria-label="已引用素材统计">
              <span>提示词 {{ generationConfig.prompt ? '1 个' : '0 个' }}</span>
              <span>引用素材 {{ directNodeReferenceChips(generationConfigSourceNodeId, true).length }} 个</span>
              <span class="audio-placeholder">参考音频 0 个</span>
            </div>
            <button type="button" class="compose-prompt-button" @click="focusGenerationConfigPrompt"><Connection />组装提示词</button>
            <div class="generation-prompt-shell">
              <div class="generation-prompt-inline">
                <div v-if="directNodeReferenceChips(generationConfigSourceNodeId, true).length" class="generation-reference-chips" aria-label="已连接输入">
                  <template v-for="(reference, referenceIndex) in directNodeReferenceChips(generationConfigSourceNodeId, true)" :key="reference.id">
                    <span class="generation-reference-chip" :title="reference.name">
                      <img v-if="reference.image" :src="reference.image" alt="" /><component :is="reference.icon" v-else />
                      <span>@{{ reference.name }}</span>
                      <button v-if="hasDirectReferenceEdge(generationConfigSourceNodeId, reference.id)" type="button" class="generation-reference-remove" aria-label="移除引用" @pointerdown.stop @click.stop="removeReferenceChip(generationConfigSourceNodeId, reference.id)">×</button>
                    </span>
                  </template>
                </div>
                <div ref="generationConfigPromptInput" class="generation-config-prompt inline-prompt-editor" contenteditable="true" role="textbox" aria-multiline="true" :data-placeholder="generationConfig.type === 'text' ? '输入要生成的文本内容' : generationConfig.type === 'video' ? '描述要生成的视频内容' : '描述要生成的图像内容'" @input="updateInlineFloatingPrompt" @blur="commitInlinePrompt('', $event)" ><template v-for="part in inlinePromptParts(generationConfig, generationConfigSourceNodeId, true)" :key="part.key"><span v-if="part.type === 'reference' && part.reference" class="inline-prompt-reference" draggable="true" :data-reference-id="part.reference.id" contenteditable="false"><img v-if="part.reference.image" :src="part.reference.image" alt="" /><component v-else :is="part.reference.icon" /><span>@{{ part.reference.name }}</span></span><span v-else class="inline-prompt-text" :data-placeholder="generationConfig.type === 'text' ? '输入要生成的文本内容' : generationConfig.type === 'video' ? '描述要生成的视频内容' : '描述要生成的图像内容'">{{ part.text || '' }}</span></template></div>
              </div>
            </div>
            <div class="generation-config-controls" :class="{ 'text-config-controls': generationConfig.type === 'text' }">
              <select v-model="generationConfig.model" aria-label="选择生成模型">
                <option v-for="model in generatorModels({ type: `${generationConfig.type}-generation`, data: generationConfig })" :key="model" :value="model">{{ generatorModelLabel(model) }}</option>
              </select>
              <select v-if="generationConfig.type !== 'text'" v-model="generationConfig.ratio" aria-label="选择画面比例">
                <option value="1:1">自动 · 1:1 · 1 张</option>
                <option value="16:9">横屏 · 16:9 · 1 张</option>
                <option value="9:16">竖屏 · 9:16 · 1 张</option>
              </select>
              <button type="button" class="camera-placeholder-button" @click="showCameraPlaceholder"><VideoCamera />摄像机</button>
            </div>
            <button type="button" class="generation-config-run" @click="openConfiguredGenerationNode"><span>⚡</span><ArrowRight />生成</button>
            <small>点击生成后将直接在右侧生成结果。</small>
          </section>
        </Transition>

        <div class="zoom-dock" aria-label="画布缩放">
          <button type="button" title="缩小" @click.stop="zoomOutCanvas"><ZoomOut /></button>
          <strong>{{ zoomPercent }}%</strong>
          <button type="button" title="放大" @click.stop="zoomInCanvas"><ZoomIn /></button>
          <span class="dock-divider" />
          <button type="button" title="适应画布" @click.stop="fitCanvas"><Aim /></button>
        </div>

        <div class="canvas-mode-note">
          <Connection />
          <span>{{ edgesVisible ? '工作流连线已显示' : '干净模式 · 连线已隐藏' }}</span>
        </div>

        <Transition name="edge-dock">
          <div
            v-if="selectedEdge && edgesVisible"
            class="edge-action-dock"
            role="toolbar"
            aria-label="已选择的连线操作"
            @pointerdown.stop
            @click.stop
          >
            <div class="edge-relation" :title="selectedEdgeLabel">
              <Connection />
              <strong>{{ selectedEdgeLabel }}</strong>
            </div>
            <button type="button" class="edge-cancel-button" @click="clearSelectedEdge">取消</button>
            <button type="button" class="edge-delete-button" @click="deleteSelectedEdge">
              <Delete />
              <span>删除连线</span>
            </button>
          </div>
        </Transition>

        <Transition name="edge-dock">
          <div
            v-if="edgeUndoNotice"
            class="edge-undo-toast"
            role="status"
            aria-live="polite"
            @pointerdown.stop
            @click.stop
          >
            <span>已删除“{{ edgeUndoNotice.label }}”连线</span>
            <button type="button" @click="undo">撤销</button>
          </div>
        </Transition>
      </section>

      <aside class="right-panel">
        <button
          type="button"
          class="right-panel-toggle"
          :title="rightPanelCollapsed ? '展开右侧栏' : '收起右侧栏'"
          @click="rightPanelCollapsed = !rightPanelCollapsed"
        >
          <ArrowLeft v-if="!rightPanelCollapsed" />
          <ArrowRight v-else />
        </button>

        <div v-if="!rightPanelCollapsed" class="right-panel-inner">
          <section class="accordion-section assistant-section" :class="{ open: openPanel === 'assistant' }">
            <button type="button" class="accordion-header" @click="togglePanel('assistant')">
              <span class="accordion-icon assistant-icon"><MagicStick /></span>
              <span class="accordion-heading">
                <strong>AI画布助手</strong>
                <small v-if="openPanel !== 'assistant'">上次对话：已创建视频流程</small>
              </span>
              <span v-if="openPanel !== 'assistant'" class="continue-copy">展开继续对话</span>
              <ArrowUp v-if="openPanel === 'assistant'" />
              <ArrowDown v-else />
            </button>

            <div v-if="openPanel === 'assistant'" class="assistant-content">
              <div class="assistant-greeting">
                <span>Hi，</span>
                <strong>今天想创作什么？</strong>
                <p>告诉我你的想法，我会直接把可执行修改应用到当前画布。</p>
                <small v-if="selectedNode" class="assistant-context">正在处理：{{ selectedNodeTitle }}</small>
              </div>
              <div class="assistant-suggestions">
                <button type="button" @click="useSuggestion('帮我完善商品视频工作流')">完善商品视频工作流</button>
                <button type="button" @click="useSuggestion('优化运动鞋广告提示词')">优化运动鞋广告提示词</button>
                <button type="button" @click="useSuggestion('检查节点连接是否完整')">检查节点连接</button>
              </div>
              <div v-if="aiMessages.length" class="assistant-messages">
                <div v-for="message in aiMessages" :key="message.id" :class="['assistant-message', message.role, message.kind === 'ticket' ? 'ticket' : '', message.undone ? 'undone' : '']">
                  <template v-if="message.kind === 'ticket'">
                    <span class="ticket-badge"><CircleCheck /></span>
                    <span class="ticket-text">{{ message.text }}</span>
                    <button v-if="!message.undone && !message.noUndo" type="button" class="ticket-undo" @click="undoAssistantStep(message)">撤销这一步</button>
                    <span v-else-if="message.undone" class="ticket-undone">已撤销</span>
                    <span v-else class="ticket-undone">已完成</span>
                  </template>
                  <template v-else-if="message.kind === 'evaluation'">
                    <span class="evaluation-text">{{ message.text }}</span>
                    <button v-if="message.refinePrompt && !message.applied" type="button" class="evaluation-refine" @click="refineFromEvaluation(message)">按建议重绘</button>
                    <span v-else-if="message.applied" class="evaluation-applied">已按建议重绘</span>
                  </template>
                  <template v-else>{{ message.text }}</template>
                </div>
              </div>
              <form class="assistant-composer" @submit.prevent="sendAssistantMessage">
                <textarea
                  v-model="assistantInput"
                  aria-label="输入对话内容"
                  maxlength="500"
                  rows="2"
                  placeholder="描述你的灵感，支持 @ 输入内容"
                  @keydown.enter.exact.prevent="sendAssistantMessage"
                />
                <div v-if="assistantAttachment" class="assistant-attachment">
                  <Picture />
                  <span>{{ assistantAttachment.name }}</span>
                  <button type="button" aria-label="移除对话附件" @click="assistantAttachment = null"><Close /></button>
                </div>
                <div class="assistant-composer-toolbar">
                  <div class="assistant-composer-tools">
                    <button type="button" class="composer-upload" aria-label="上传对话附件" @click="assistantFileInput?.click()">
                      <Plus />
                    </button>
                    <Connection class="model-icon" />
                    <select v-model="assistantModel" aria-label="选择文本模型" :disabled="!configuredTextModels.length">
                      <option v-if="!configuredTextModels.length" value="">未配置文本模型</option>
                      <option v-for="model in configuredTextModels" :key="model" :value="model">{{ configuredModelLabels[model] || model }}</option>
                    </select>
                  </div>
                  <button
                    v-if="!assistantInput.trim()"
                    type="button"
                    class="composer-primary voice-button"
                    :class="{ listening: voiceListening }"
                    :aria-pressed="voiceListening"
                    :aria-label="voiceListening ? '停止语音输入' : '开始语音输入'"
                    @click="toggleVoiceInput"
                  >
                    <Microphone />
                  </button>
                  <button v-else type="submit" class="composer-primary" aria-label="发送对话" :disabled="assistantRunning">
                    <ArrowUp />
                  </button>
                </div>
                <small v-if="assistantRunning" class="assistant-running-note">正在分析画布并执行工作流…</small>
                <input
                  ref="assistantFileInput"
                  class="visually-hidden"
                  type="file"
                  accept="image/*,.pdf,.txt"
                  @change="handleAssistantUpload"
                />
              </form>
              <small class="assistant-disclaimer">AI 会直接修改当前画布；所有修改都可以通过撤销恢复。</small>
            </div>
          </section>

          <section class="accordion-section template-section" :class="{ open: templatePanelOpen }">
            <button type="button" class="accordion-header" @click="togglePanel('templates')">
              <span class="accordion-icon template-icon"><Collection /></span>
              <span class="accordion-heading">
                <strong>画布模板</strong>
                <small v-if="!templatePanelOpen">把流程存成模板，一键复用</small>
                <small v-else>{{ canvasTemplates.length ? `${canvasTemplates.length} 个可用模板` : '暂无模板' }}</small>
              </span>
              <ArrowUp v-if="templatePanelOpen" />
              <ArrowDown v-else />
            </button>

            <div v-if="templatePanelOpen" class="template-content">
              <div class="template-save">
                <div class="template-save-head">
                  <strong>把选中节点存为模板</strong>
                  <span class="template-save-count">{{ templateSelectionIds().length }} 个节点</span>
                </div>
                <input
                  v-model="templateForm.name"
                  type="text"
                  maxlength="40"
                  placeholder="模板名称（留空自动命名）"
                  aria-label="模板名称"
                />
                <div class="template-save-row">
                  <select v-model="templateForm.scope" aria-label="模板可见范围">
                    <option value="private">仅自己可见</option>
                    <option value="org">机构内共用</option>
                  </select>
                  <button
                    type="button"
                    class="template-save-button"
                    :disabled="templateSaving || !templateSelectionIds().length"
                    @click="saveTemplateFromSelection"
                  >
                    {{ templateSaving ? '保存中…' : '存为模板' }}
                  </button>
                </div>
                <small class="template-hint">提示：先在画布上用「框选」选中一段流程，再回到这里保存。</small>
              </div>

              <div class="template-list-head">
                <strong>可用模板</strong>
                <button type="button" class="template-refresh" :disabled="templatePanelLoading" @click="refreshCanvasTemplates">
                  {{ templatePanelLoading ? '读取中…' : '刷新' }}
                </button>
              </div>

              <div v-if="templatePanelLoading && !canvasTemplates.length" class="template-empty">正在读取模板…</div>
              <div v-else-if="!canvasTemplates.length" class="template-empty">还没有模板。框选一段流程后即可保存。</div>
              <ul v-else class="template-list">
                <li v-for="item in canvasTemplates" :key="item.id" class="template-item">
                  <div class="template-item-main">
                    <span class="template-item-name">{{ item.name }}</span>
                    <span class="template-item-meta">
                      <span class="template-scope">{{ item.scope === 'org' ? '机构共用' : '仅自己' }}</span>
                      {{ item.nodeCount }} 节点 · {{ item.edgeCount }} 连线
                    </span>
                  </div>
                  <div class="template-item-actions">
                    <button type="button" class="template-apply" @click="applyCanvasTemplate(item)">应用</button>
                    <button type="button" class="template-delete" aria-label="删除模板" @click="deleteTemplateById(item)">
                      <Delete />
                    </button>
                  </div>
                </li>
              </ul>
            </div>
          </section>

          <section v-if="false" class="accordion-section settings-section" :class="{ open: openPanel === 'settings' }">
            <button type="button" class="accordion-header" @click="togglePanel('settings')">
              <span class="accordion-icon settings-icon"><component :is="selectedNodeIcon" /></span>
              <span class="accordion-heading">
                <strong>当前节点设置 · {{ selectedNodeTitle }}</strong>
                <small v-if="openPanel !== 'settings'">点击展开参数</small>
              </span>
              <ArrowUp v-if="openPanel === 'settings'" />
              <ArrowDown v-else />
            </button>

            <div v-if="openPanel === 'settings'" class="settings-content">
              <template v-if="isGeneratorNode(selectedNode)">
                <div v-if="connectedReferenceImage(selectedNode.id)" class="settings-image">
                  <img :src="connectedReferenceImage(selectedNode.id)" alt="当前生成节点参考图" />
                </div>

                <label class="field-label" :for="`generator-prompt-${selectedNode.id}`">
                  {{ selectedNode.data.mode === 'text-generation' ? '生成要求' : '提示词' }}
                </label>
                <textarea
                  :id="`generator-prompt-${selectedNode.id}`"
                  :value="selectedNode.data.prompt || ''"
                  maxlength="500"
                  :placeholder="selectedNode.data.mode === 'text-generation' ? '描述要生成的标题、文案或提示词' : '描述主体、场景和效果'"
                  @input="updateGeneratorPrompt(selectedNode.id, $event)"
                  @change="commitHistory()"
                />
                <div class="counter">{{ (selectedNode.data.prompt || '').length }} / 500</div>

                <label class="setting-row">
                  <span>模型</span>
                  <select :value="selectedNode.data.config?.model || defaultGeneratorModel(selectedNode)" @change="updateGeneratorConfig(selectedNode.id, 'model', $event.target.value)">
                    <option v-for="model in generatorModels(selectedNode)" :key="model" :value="model">{{ generatorModelLabel(model) }}</option>
                  </select>
                </label>

                <div v-if="selectedNode.type === 'video'" class="setting-row duration-row">
                  <span>时长</span>
                  <div class="segmented-control">
                    <button
                      v-for="duration in [5]"
                      :key="duration"
                      type="button"
                      :class="{ active: Number(selectedNode.data.config?.duration || 5) === duration }"
                      @click="updateGeneratorConfig(selectedNode.id, 'duration', duration)"
                    >
                      {{ duration }}秒
                    </button>
                  </div>
                </div>

                <label v-if="selectedNode.type !== 'text'" class="setting-row">
                  <span>画面比例</span>
                  <select :value="selectedNode.data.config?.ratio || '1:1'" @change="updateGeneratorConfig(selectedNode.id, 'ratio', $event.target.value)">
                    <option>16:9</option>
                    <option>9:16</option>
                    <option>1:1</option>
                    <option v-if="selectedNode.type === 'image'">4:3</option>
                    <option v-if="selectedNode.type === 'image'">3:4</option>
                  </select>
                </label>

                <label v-if="selectedNode.type !== 'text'" class="setting-row">
                  <span>清晰度</span>
                  <select :value="selectedNode.data.config?.resolution || '1080P'" @change="updateGeneratorConfig(selectedNode.id, 'resolution', $event.target.value)">
                    <option>720P</option>
                    <option>1080P</option>
                    <option>2K</option>
                  </select>
                </label>

                <!-- 张数：一个节点出几张。报告里「结果图」的张数就是各出图节点张数之和，
                     所以这里是用户报告能不能出到 8~10 张的唯一开关。 -->
                <div v-if="selectedNode.type === 'image'" class="setting-row count-row">
                  <span>张数</span>
                  <div class="segmented-control count-control">
                    <button
                      v-for="count in GENERATOR_COUNT_OPTIONS"
                      :key="count"
                      type="button"
                      :class="{ active: generatorCount(selectedNode) === count }"
                      @click="updateGeneratorConfig(selectedNode.id, 'count', count)"
                    >
                      {{ count }}
                    </button>
                  </div>
                </div>
                <p v-if="selectedNode.type === 'image'" class="count-hint">
                  一个节点出 {{ generatorCount(selectedNode) }} 张，每张构图会略有变化。张数越多，出图耗时和费用越高。
                </p>

                <div class="credit-hint"><Coin />将调用已配置的真实模型 <small>以后台计费为准</small></div>

                <button type="button" class="generate-button" :disabled="selectedNode.data.status === 'running'" @click="runGenerator(selectedNode.id)">
                  <span v-if="selectedNode.data.status === 'running'" class="button-spinner" />
                  {{ selectedNode.data.status === 'running' ? '生成中…' : '开始生成' }}
                </button>

                <div class="run-status">
                  <strong>运行状态</strong>
                  <span><i :class="{ running: selectedNode.data.status === 'running' }" />{{ generatorStatusText(selectedNode.data) }}</span>
                  <small v-if="selectedNode.data.error" class="settings-error">{{ selectedNode.data.error }}</small>
                </div>
              </template>

              <div v-else class="generic-node-settings">
                <component :is="selectedNodeIcon" />
                <strong>{{ selectedNodeTitle }}</strong>
                <p v-if="selectedNode?.type === 'upload'">该节点是工作流起点，请从右侧蓝色连接点拖到下一个节点。</p>
                <p v-else-if="selectedNode?.type === 'result'">该节点是结果终点，请把上游节点拖到左侧蓝色连接点。</p>
                <p v-else-if="selectedNode?.type === 'text'">自由文字只用于排版，不参与工作流连线；可以直接编辑或使用顶部工具栏调整格式。</p>
                <p v-else>该节点已选中，可以从左右蓝色连接点拖动连线。</p>
                <button type="button" @click="deleteNode(selectedNode?.id)"><Delete />删除当前节点</button>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </section>

    <!-- 我的素材库：以前这个按钮是 router.push 跳去工作台，等于把人踢出画布、画布内容当场看不见。
         现在改成画布内弹窗，点一张素材直接落到画布上，不离开当前工作流。 -->
    <el-dialog
      v-model="materialLibraryOpen"
      title="我的素材库"
      width="min(880px, 94vw)"
      class="canvas-material-dialog"
      append-to-body
      destroy-on-close
    >
      <div class="material-library-toolbar">
        <button
          v-for="tab in materialLibraryTabs"
          :key="tab.value"
          type="button"
          class="material-library-tab"
          :class="{ active: materialLibraryTab === tab.value }"
          @click="materialLibraryTab = tab.value"
        >{{ tab.label }}<span>{{ tab.count }}</span></button>
      </div>
      <div v-if="sketchMaterialsLoading" class="material-library-empty">正在读取素材…</div>
      <div v-else-if="visibleMaterialLibraryItems.length" class="material-library-grid">
        <button
          v-for="item in visibleMaterialLibraryItems"
          :key="item.id"
          type="button"
          class="material-library-card"
          :title="`${item.title}（点击加入画布）`"
          :aria-label="`把 ${item.title} 加入画布`"
          @click="addLibraryMaterialToCanvas(item)"
        >
          <img
            :src="item.preview"
            :alt="item.title"
            loading="lazy"
            @error="markMaterialBroken(item)"
          />
          <span class="material-library-card-name">{{ item.title }}</span>
        </button>
      </div>
      <div v-else class="material-library-empty">
        这个分类还没有可用图片。先去 AI 绘画页生成作品，或在画布上上传图片。
      </div>
      <template #footer>
        <p class="material-library-hint">点任意一张图片，就会在画布上新建一个图片节点。</p>
      </template>
    </el-dialog>

    <Teleport to="body">
      <Transition name="fade">
        <div v-if="upstreamPreview" class="upstream-preview-layer">
          <div class="upstream-preview-catcher" @click="closeUpstreamPreview" />
          <div class="upstream-preview-pop" :style="upstreamPreviewStyle" role="dialog" aria-label="上游素材预览">
            <div class="upstream-preview-figure">
              <img v-if="upstreamPreview.kind === 'image' && upstreamPreview.image" :src="upstreamPreview.image" :alt="upstreamPreview.name" />
              <video v-else-if="upstreamPreview.kind === 'video' && upstreamPreview.video" :src="upstreamPreview.video" controls playsinline />
              <p v-else-if="upstreamPreview.kind === 'text'" class="upstream-preview-text">{{ upstreamPreview.text || '这个上游节点还没有内容。' }}</p>
              <p v-else class="upstream-preview-text">这个上游节点暂时没有可预览的素材。</p>
            </div>
            <footer class="upstream-preview-caption">
              <strong>{{ upstreamPreview.name }}</strong>
              <button type="button" class="upstream-preview-close" aria-label="关闭预览" title="关闭预览" @click="closeUpstreamPreview"><Close /></button>
            </footer>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="fade">
        <div v-if="elementMenu" class="element-menu-layer">
          <div class="element-menu-catcher" @click="closeElementMenu" />
          <div class="element-menu-pop" :style="elementMenuStyle" role="dialog" aria-label="选择标记对应的内容">
            <p class="element-menu-title">这个标记指的是什么</p>
            <div v-if="elementMenu.candidates.length" class="element-menu-list">
              <button
                v-for="candidate in elementMenu.candidates"
                :key="candidate"
                type="button"
                class="element-menu-item"
                :class="{ active: candidate === elementMenu.text }"
                @click="chooseElementContent(candidate)"
              >
                <Check />
                <span>{{ candidate }}</span>
              </button>
            </div>
            <p v-else class="element-menu-empty">识别暂不可用，请直接手动填写内容</p>
            <div class="element-menu-manual">
              <input
                type="text"
                maxlength="24"
                :value="elementMenu.text"
                placeholder="手动填写内容"
                aria-label="手动填写标记内容"
                @input="elementMenu.text = $event.target.value"
                @keydown.enter.prevent="chooseElementContent(elementMenu.text)"
              />
              <button type="button" @click="chooseElementContent(elementMenu.text)">确定</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="promptDropIndicator"
        class="prompt-drop-indicator"
        :style="{ left: `${promptDropIndicator.left}px`, top: `${promptDropIndicator.top}px`, height: `${promptDropIndicator.height}px` }"
      />
    </Teleport>

    <!-- 卡槽菜单：节点卡片会随画布缩放，菜单挂在 body 上按屏幕坐标定位才不会跟着变大变小 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="slotMenu" class="slot-menu-layer">
          <div class="slot-menu-catcher" @click="closeSlotMenu" />
          <div class="slot-menu-pop" :style="slotMenuStyle" role="dialog" aria-label="这个节点在用户端是什么">
            <p class="slot-menu-title">这个节点在用户端报告里是</p>
            <div class="slot-menu-list">
              <button
                v-for="option in slotMenuOptions"
                :key="option.role"
                type="button"
                class="slot-menu-item"
                :class="{ active: slotMenuRole === option.role }"
                @click.stop="setNodeSlotRole(slotMenu.nodeId, option.role)"
              >
                <span class="slot-menu-dot" />
                <span class="slot-menu-txt">
                  <span class="slot-menu-label">{{ option.label }}</span>
                  <span class="slot-menu-desc">{{ option.desc }}</span>
                </span>
              </button>
            </div>
            <template v-if="slotMenuRole === 'image'">
              <div class="slot-menu-sep" />
              <label class="slot-menu-seq">
                <span>排第几格</span>
                <input
                  type="number"
                  min="0"
                  max="60"
                  step="1"
                  :value="slotMenuIndex"
                  placeholder="自动"
                  aria-label="排第几格"
                  @change="setNodeSlotIndex(slotMenu.nodeId, $event.target.value)"
                />
              </label>
              <p class="slot-menu-foot">留空就按画布位置自动排（从上到下、从左到右）</p>
              <p class="slot-menu-foot is-strong">{{ slotMenuHereHint }}</p>
            </template>
            <p v-else-if="slotMenuRole === 'none'" class="slot-menu-foot">这个节点照常运行，只是用户端不给它留格子。</p>
          </div>
        </div>
      </Transition>
    </Teleport>
  </main>
</template>

<script setup>
import { computed, defineComponent, h, markRaw, nextTick, onBeforeUnmount, onMounted, reactive, ref, toRaw, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Aim,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CircleCheck,
  Close,
  Coin,
  Collection,
  Connection,
  Crop,
  Delete,
  Document,
  EditPen,
  FolderOpened,
  FolderRemove,
  FullScreen,
  Grid,
  MagicStick,
  MoreFilled,
  Microphone,
  Operation,
  Picture,
  Plus,
  RefreshLeft,
  ScaleToOriginal,
  UploadFilled,
  VideoCamera,
  View,
  ZoomIn,
  ZoomOut,
} from '@element-plus/icons-vue'
import { addEdge, Handle, Position, useVueFlow, VueFlow } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import { createEmptyProject, useProjectStore } from '../stores/projectStore'
import { useUserStore } from '../stores/userStore'
import { apiClient } from '../services/apiClient'
import { useSketchMaterials } from '../composables/useSketchMaterials'
import { extractImageUrl } from '../utils/referenceImages'
import {
  discardLegacyStorageKey,
  readAccountJson,
  readAccountText,
  removeAccountText,
  writeAccountJson,
  writeAccountText,
} from '../utils/accountScope'
import {
  deleteCanvasTemplate,
  describeImageRegion,
  generateArtwork,
  generateVideo,
  getCanvasTemplate,
  getVideoTask,
  listCanvasTemplates,
  requestCanvasAssistant,
  requestCanvasAttachment,
  saveCanvasTemplate,
} from '../services/aiGateway'

const DEMO_IMAGE = '/canvas-demo-sneaker.png'
const STORAGE_KEY = 'ai-workflow-canvas-stage1-v2'
const CONNECTION_GUIDE_KEY = 'ai-workflow-connection-guide-seen-v2'
const SERVER_AUTH_MODE = import.meta.env.VITE_AUTH_MODE === 'server'
const props = defineProps({
  adminMode: Boolean,
  initialCanvas: { type: Object, default: null },
  workflowTitle: { type: String, default: '' },
  // 后台模式：草稿是否还有未落库改动（驱动「文件」按钮上的橙点）
  adminDirty: Boolean,
  // 后台模式：保存进行中（禁用「保存草稿」并改成「正在保存…」）
  adminSaving: Boolean,
  // 后台模式：「返回」那一项的文字（返回工作流库 / 返回报告中心 / 返回玩法列表）
  adminBackLabel: { type: String, default: '返回工作流列表' },
  // 后台模式：是否显示「用户使用页面」（H5 工作流才有这一步）
  adminStudentPage: Boolean,
  // 后台模式：这个工作流被绑到 H5 报告时，节点上要能标「对应用户端第几格」
  h5SlotMode: Boolean,
})
const emit = defineEmits(['save', 'close', 'change', 'request-save', 'open-student-page'])

const NodeName = defineComponent({
  name: 'NodeName',
  // dragTarget=true：标题即拖动把手（分组节点只有一个窄标题栏，标题必须能带动整个组）。
  // 这类节点用双击进入改名，单击留给"选中/拖动"，避免拖完组松手就误触改名。
  props: {
    title: { type: String, required: true },
    dragTarget: { type: Boolean, default: false },
    trigger: { type: String, default: 'click' },
  },
  emits: ['rename'],
  setup(props, { emit }) {
    const editing = ref(false)
    const draft = ref('')
    const input = ref(null)
    const stop = (event) => event.stopPropagation()
    const finish = (cancel = false) => {
      if (!editing.value) return
      editing.value = false
      if (cancel) return
      const title = draft.value.trim()
      if (!title) {
        ElMessage.warning('节点名称不能为空，已保留原名称')
        return
      }
      if (title !== props.title) emit('rename', title)
    }
    const start = async (event) => {
      event.stopPropagation()
      draft.value = props.title
      editing.value = true
      await nextTick()
      input.value?.focus()
      input.value?.select()
    }
    return () => editing.value
      ? h('input', {
        ref: input,
        class: 'node-name-input',
        value: draft.value,
        maxlength: 50,
        'aria-label': '节点名称',
        title: '回车保存，Esc 取消',
        onInput: (event) => { draft.value = event.target.value },
        onPointerdown: props.dragTarget ? undefined : stop,
        onClick: stop,
        onDblclick: stop,
        onBlur: () => finish(),
        onKeydown: (event) => {
          event.stopPropagation()
          if (event.isComposing) return
          if (event.key === 'Enter' || event.key === 'Escape') {
            event.preventDefault()
            finish(event.key === 'Escape')
          }
        },
      })
      : h('button', {
        type: 'button',
        // nodrag 会让 VueFlow 忽略这块区域的拖动 → 分组标题绝不能用它，否则整组拖不动。
        class: props.dragTarget ? 'node-name-button' : 'node-name-button nodrag nopan',
        title: props.trigger === 'dblclick' ? `${props.title}（双击修改名称）` : `${props.title}（点击修改名称）`,
        'aria-label': `修改节点名称：${props.title}`,
        onPointerdown: props.dragTarget ? undefined : stop,
        onClick: props.trigger === 'dblclick' ? undefined : start,
        onDblclick: props.trigger === 'dblclick' ? start : undefined,
      }, props.title)
  },
})

const NodeHeader = defineComponent({  name: 'NodeHeader',
  props: {
    icon: { type: Object, required: true },
    title: { type: String, required: true },
    iconTone: { type: String, default: 'blue' },
  },
  emits: ['more', 'rename'],
  setup(props, { emit }) {
    return () => h('header', { class: 'node-header' }, [
      h('span', { class: ['node-type-icon', `tone-${props.iconTone}`] }, [h(props.icon)]),
      h(NodeName, { title: props.title, onRename: (title) => emit('rename', title) }),
      h('button', {
        type: 'button',
        class: 'node-more',
        title: '节点操作',
        onPointerdown: (event) => event.stopPropagation(),
        onClick: (event) => {
          event.stopPropagation()
          emit('more')
        },
      }, [h(MoreFilled)]),
    ])
  },
})

const NodeActionMenu = defineComponent({
  name: 'NodeActionMenu',
  props: { open: Boolean },
  emits: ['delete'],
  setup(props, { emit }) {
    return () => props.open
      ? h('div', { class: 'node-action-menu', onPointerdown: (event) => event.stopPropagation() }, [
        h('button', {
          type: 'button',
          onClick: (event) => {
            event.stopPropagation()
            emit('delete')
          },
        }, [h(Delete), '删除节点']),
      ])
      : null
  },
})

const router = useRouter()
const route = useRoute()
const projectStore = useProjectStore()
const userStore = useUserStore()
/**
 * 当前登录账号的 ID：画布助手对话、画布记住的文档 ID 都按它分开存。
 * 取不到（未登录/演示模式）时是空串，存储层会退成 anonymous 一份，
 * 那种情况下本来也不存在「别人的对话」。
 */
const accountId = computed(() => String(userStore.user?.id || '').trim())
const sourceProject = reactive(createEmptyProject('pro'))
const fileInput = ref(null)
const referenceFileInput = ref(null)
const videoFileInput = ref(null)
const referenceTargetNodeId = ref('')
const referenceUploadMode = ref('reference')
const assistantFileInput = ref(null)
const createMenuOpen = ref(!props.adminMode)
// 左上角「文件」下拉：新建/保存/删除 + 返回工作台，四项统一入口。
const fileMenuOpen = ref(false)
const fileMenuWrap = ref(null)
const canvasArea = ref(null)
const generationConfigPanel = ref(null)
const generationConfigOpen = ref(false)
const generationConfigSourceNodeId = ref('')
const generationConfigPromptInput = ref(null)
const generationConfigPosition = reactive({ x: 0, y: 0 })
const generationConfigDrag = reactive({
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0,
  initialLeft: 0,
  initialTop: 0,
  width: 0,
  height: 0,
})
const generationConfigPanelStyle = computed(() => ({
  transform: `translate3d(${generationConfigPosition.x}px, ${generationConfigPosition.y}px, 0)`,
}))
// 后台排版工作流时右栏（AI 画布助手）是浮在画布上的，展开会盖住右侧约 390px：
// 那里的节点和连接点被面板吃掉，用户表现为「拖不出线」。后台进来先收起，需要时点 ‹ 展开。
const rightPanelCollapsed = ref(Boolean(props.adminMode))
const edgesVisible = ref(true)
const connectionInProgress = ref(false)
const connectionStartNodeId = ref('')
// 最近一次「被拦下的连线」。松手时 connectionStartNodeId 有时已经取不到值
// （VueFlow 在部分拖拽场景下不给 nodeId），靠它兜住，才能告诉用户真正的原因。
const rejectedConnection = ref(null)
const connectionCompleted = ref(false)
const connectionCreateMenu = reactive({ visible: false, x: 0, y: 0, source: '', target: null })
const connectionCreateOptions = [
  { type: 'text-generation', label: '文字生成', icon: markRaw(EditPen) },
  { type: 'image-generation', label: '图像生成', icon: markRaw(Picture) },
  { type: 'video-generation', label: '视频生成', icon: markRaw(VideoCamera) },
  { type: 'result', label: '结果展示', icon: markRaw(CircleCheck) },
]
const connectionCreateMenuStyle = computed(() => ({ left: `${connectionCreateMenu.x}px`, top: `${connectionCreateMenu.y}px` }))
const connectionGuideVisible = ref(true)
const openPanel = ref('assistant')
// 新画布是空白，没有默认选中节点（原来指向种子节点 video-1）。
const selectedNodeId = ref('')
const selectedEdgeId = ref('')
const marqueeMode = ref(false)
// 最近一次框选选中的节点 id：供「成组」按钮使用（框选结束后项目自身的单选态会被清空）。
const lastMarqueeSelection = ref([])
const edgeUndoNotice = ref(null)
const nodeActionId = ref('')
const expandedNodeId = ref('')
const upstreamPreview = ref(null)
const upstreamPreviewAnchor = ref(null)
const textAgentNodeId = ref('')
// 提示词卡片「放大态」：为空的节点 id 表示没有卡片处于放大；有值时该卡片移到 body 层居中放大，
// 画布其余部分冻结（灰度 + 压暗）。
const promptZoomNodeId = ref('')
// 放大时卡片以「画布区中心」为准（而不是整个视口中心），左侧节点面板开着时也不会偏。
const promptZoomCenter = ref({ x: 0, y: 0 })

function openPromptZoom(id) {
  if (!id) return
  const rect = canvasArea.value?.getBoundingClientRect?.()
  promptZoomCenter.value = rect && rect.width
    ? { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
    : { x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) }
  promptZoomNodeId.value = id
  refreshNodeSlot(id)
}

function promptZoomStyle(id) {
  if (promptZoomNodeId.value !== id) return null
  return { left: `${promptZoomCenter.value.x}px`, top: `${promptZoomCenter.value.y}px` }
}

// VueFlow 的节点层用 v-memo([node.id]) 缓存节点，节点内部的插槽内容只有「节点自身」变化时才会重渲染 ——
// 父组件状态（promptZoomNodeId）变化不足以让卡片里的 :class / :style / Teleport 刷新。
// 这里给该节点的 data 换成内容完全相同的新对象（用户节点与 VueFlow 内部节点指向同一个新对象，
// 字段与值都不变，不污染存档），借官方 API 触发一次节点重渲染。
function refreshNodeSlot(id) {
  const node = nodes.value.find((item) => item.id === id)
  if (!node) return
  const nextData = { ...(node.data || {}) }
  node.data = nextData
  updateNodeData(id, nextData, { replace: true })
}

function closePromptZoom() {
  const id = promptZoomNodeId.value
  promptZoomNodeId.value = ''
  if (id) refreshNodeSlot(id)
}

// ── H5 报告卡槽（只在这个工作流被绑到 H5 报告时出现）────────────────────────
// 老师点节点右上角的胶囊，说清「这个节点在用户端报告里是什么」。
// 结果落在 node.data.studentSlot = { role, index }，服务端 buildH5WorkflowRequest
// 按它把用户素材一张一张派给节点（第 N 格 = 第 N 张图），不再全塞给第一个节点。
// 能选的卡槽角色跟节点类型绑死：提示词节点出不了图，就不该给「图像素材」这一项，
// 否则会选出一个「占着第 N 格却永远不会出图」的空卡槽（曾经显示成「图?」）。
const SLOT_ROLE_CATALOG = {
  image: { role: 'image', label: '图像素材', desc: '用户勾的图，按顺序填进这一格' },
  text: { role: 'text', label: '文字素材', desc: '用户的创作自述接到这个节点后面' },
  result: { role: 'result', label: '结果返回', desc: '跑完的图回到报告这一页' },
  none: { role: 'none', label: '不上前端', desc: '只做中间加工，不占用户端的格子' },
}
const SLOT_ALLOWED = {
  image: ['image', 'none'],
  prompt: ['text', 'none'],
  text: ['text', 'none'],
  result: ['result', 'none'],
}
const SLOT_ROLE_LABEL = { image: '图像素材', text: '文字素材', result: '结果返回', none: '不上前端' }
const SLOT_MENU_WIDTH = 292
const SLOT_MENU_HEIGHT = 286
const slotMenu = ref(null)
const slotMenuStyle = computed(() => {
  const menu = slotMenu.value
  if (!menu) return { left: '0px', top: '0px' }
  return menu.placement === 'above'
    ? { left: `${menu.left}px`, top: `${menu.top}px`, transform: 'translateY(-100%)' }
    : { left: `${menu.left}px`, top: `${menu.top}px` }
})
const slotMenuNode = computed(() => (slotMenu.value ? nodes.value.find((node) => node.id === slotMenu.value.nodeId) || null : null))
const slotMenuRole = computed(() => (slotMenu.value ? slotRoleFor(slotMenu.value.nodeId) : ''))
const slotMenuOptions = computed(() => (SLOT_ALLOWED[slotMenuNode.value?.type] || ['none']).map((role) => SLOT_ROLE_CATALOG[role]))
const slotMenuIndex = computed(() => {
  const value = Number(slotMenuNode.value?.data?.studentSlot?.index || 0)
  return value > 0 ? value : ''
})

// 仅用于显示，判定规则必须和服务端 h5SlotRoleOf 一致。
function slotRoleFor(id) {
  const node = nodes.value.find((item) => item.id === id)
  const allowed = SLOT_ALLOWED[node?.type] || ['none']
  const explicit = String(node?.data?.studentSlot?.role || '')
  if (allowed.includes(explicit)) return explicit
  if (node?.type === 'image') return 'image'
  if (node?.type === 'result') return 'result'
  // 文字节点不自动推断成「文字素材」：老模板里每个提示词节点都会被推断成 text，
  // 一推断就会把用户自述偷偷接到老师原来的提示词后面，所以默认「不上前端」。
  return 'none'
}

// 图像卡槽的排列，和服务端 h5ImageSlotOrder 用的是同一套算法：
// 「排第几格」填了数字就是字面意思；没填的按画布从上到下、从左到右补空位。
function slotCanvasOrder(left, right) {
  const leftY = Number(left.node?.position?.y || 0)
  const rightY = Number(right.node?.position?.y || 0)
  if (leftY !== rightY) return leftY - rightY
  const leftX = Number(left.node?.position?.x || 0)
  const rightX = Number(right.node?.position?.x || 0)
  if (leftX !== rightX) return leftX - rightX
  return left.order - right.order
}
const slotOrderMap = computed(() => {
  const all = nodes.value
    .filter((node) => node.type === 'image' && slotRoleFor(node.id) === 'image')
    .map((node, order) => ({ node, order, index: Number(node?.data?.studentSlot?.index || 0) }))
  const canvasSorted = [...all].sort(slotCanvasOrder)
  const pinned = canvasSorted
    .filter((item) => item.index > 0)
    .sort((left, right) => left.index - right.index || slotCanvasOrder(left, right))
  const queue = canvasSorted.filter((item) => !(item.index > 0))
  const slots = []
  for (const item of pinned) {
    const at = item.index - 1
    if (at < slots.length && slots[at]) queue.push(item)
    else slots[at] = item
  }
  for (let i = 0; i < slots.length; i += 1) {
    if (!slots[i]) slots[i] = queue.shift() || null
  }
  while (queue.length) slots.push(queue.shift())
  const map = {}
  slots.filter(Boolean).forEach((item, idx) => { map[item.node.id] = idx + 1 })
  return map
})

function slotPillText(id) {
  const role = slotRoleFor(id)
  if (role === 'image') return `图 ${slotOrderMap.value[id] || '?'}`
  if (role === 'text') return 'T 文字'
  if (role === 'result') return '结果返回'
  return '不上前端'
}

function slotPillTitle(id) {
  const role = slotRoleFor(id)
  const hint = role === 'image'
    ? `用户端第 ${slotOrderMap.value[id] || '?'} 格`
    : SLOT_ROLE_LABEL[role]
  return `${hint}｜点击修改这个节点在用户端的位置`
}

const slotTotal = computed(() => Object.keys(slotOrderMap.value).length)
// 老师填的号可能大于卡槽总数：服务端会把空位挤掉，节点自动落到最后一格。
// 这里把「实际落在第几格」直接说出来，免得填了 8 却看到「图 1」以为没生效。
const slotMenuHereHint = computed(() => {
  const id = slotMenu.value?.nodeId
  const here = id ? slotOrderMap.value[id] : 0
  if (!here) return ''
  if (slotTotal.value <= 1) return '画布上只有这 1 个图像卡槽，所以它就是第 1 格'
  return `当前共 ${slotTotal.value} 个图像卡槽，这个节点落在第 ${here} 格`
})

function openSlotMenu(id, event) {
  const rect = event.currentTarget.getBoundingClientRect()
  const left = Math.max(12, Math.min(rect.left + rect.width - SLOT_MENU_WIDTH, window.innerWidth - SLOT_MENU_WIDTH - 12))
  const below = rect.bottom + 10 + SLOT_MENU_HEIGHT < window.innerHeight
  slotMenu.value = {
    nodeId: id,
    left,
    top: below ? rect.bottom + 10 : rect.top - 10,
    placement: below ? 'below' : 'above',
  }
}

function closeSlotMenu() {
  slotMenu.value = null
}

function writeNodeSlot(id, patch) {
  const node = nodes.value.find((item) => item.id === id)
  if (!node) return
  const nextData = { ...(node.data || {}) }
  const current = nextData.studentSlot && typeof nextData.studentSlot === 'object' ? nextData.studentSlot : {}
  nextData.studentSlot = { ...current, ...patch }
  // ⚠️ node.data 和 updateNodeData 必须都写，缺一个就会丢：
  // · 只写 node.data：VueFlow 内部那份节点没变，v-memo([node.id]) 不重渲染，胶囊不动。
  // · 只写 updateNodeData：nodes.value 那份没变，之后任何一次 refreshNodeSlot / serializeCanvas
  //   都会拿 nodes.value 的旧 data 覆盖回去，刚设的 studentSlot 直接丢（这个坑踩过）。
  node.data = nextData
  updateNodeData(id, nextData, { replace: true })
}

function setNodeSlotRole(id, role) {
  const nextData = { ...(nodes.value.find((item) => item.id === id)?.data || {}) }
  const current = nextData.studentSlot && typeof nextData.studentSlot === 'object' ? nextData.studentSlot : {}
  const patch = { role }
  // 只有图像卡槽才有「排第几格」，换成其它角色就把序号清掉，避免存档里留脏字段
  if (role !== 'image') patch.index = 0
  else patch.index = Number(current.index || 0)
  writeNodeSlot(id, patch)
  // 选「图像素材」还要接着填序号，菜单留着；其余三项选完就没别的事，直接收起，
  // 否则遮罩会盖住整张画布，用户得再点一次空白处。
  if (role !== 'image') closeSlotMenu()
}

function setNodeSlotIndex(id, value) {
  const index = Math.max(0, Math.min(60, Math.round(Number(value) || 0)))
  writeNodeSlot(id, { index })
}
const textAgentLoading = ref(false)
const textEditingNodeId = ref('')
const textEditorRefs = new Map()
const generationConfigNodePromptRefs = new Map()
const saveState = ref(props.adminMode ? '工作流草稿已载入' : (SERVER_AUTH_MODE ? '已保存到服务端' : '已保存到本机'))
const serverCanvasDocument = ref(null)
const canvasTitle = ref('')
// 画布名称：顶栏卡片里可直接点击改名，保存时随画布一起落到服务端（title）或本机存储。
// 空名一律显示为「未命名无限画布」，避免顶栏出现空白卡片。
const DEFAULT_CANVAS_NAME = '未命名无限画布'
const canvasDisplayName = computed(() => canvasTitle.value.trim() || DEFAULT_CANVAS_NAME)
const canvasNameEditing = ref(false)
const canvasNameDraft = ref('')
const canvasNameInput = ref(null)

async function startCanvasNameEdit() {
  canvasNameDraft.value = canvasTitle.value.trim()
  canvasNameEditing.value = true
  await nextTick()
  canvasNameInput.value?.focus()
  canvasNameInput.value?.select()
}

// commit=true 保存草稿；commit=false 取消（Esc），一律还原成改名前的内容。
function finishCanvasNameEdit(commit = true) {
  if (!canvasNameEditing.value) return
  canvasNameEditing.value = false
  if (!commit) return
  canvasTitle.value = canvasNameDraft.value.trim().slice(0, 40)
  canvasNameDraft.value = ''
  scheduleSave()
}

function handleCanvasNameKeydown(event) {
  if (event.isComposing) return
  event.stopPropagation()
  if (event.key === 'Enter') {
    event.preventDefault()
    finishCanvasNameEdit()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    finishCanvasNameEdit(false)
  }
}

const canvasResourceKey = ref('')
// 当前画布对应哪条服务端文档，要记在浏览器里：sourceProject 在没打开具体项目时
// 是 createEmptyProject() 造的临时对象，id 是 p-<时间戳>，每次刷新都不一样，
// 光靠 resourceKey 前缀匹配永远对不上，刷新后就会把同一张画布再存一份。
const CANVAS_DOCUMENT_ID_KEY = 'ai-workflow-canvas-document-id'
/**
 * 🔴 「上次打开的是哪张画布」也必须按账号分开记。
 * 两个用户共用一台电脑时，服务端文档是按账号隔离的（ownerUserId 不同，别人查不到），
 * 但浏览器里这个 ID 要是共用一个键，B 登录后拿到的就是 A 的文档 ID：
 * 列表里查不到 → 查不到就退化成「新画布」，看起来像「我的画布丢了」，
 * 万一哪天查得到，那就是直接把 A 的画布打开给 B 看。
 */

function readRememberedCanvasDocumentId() {
  return readAccountText(CANVAS_DOCUMENT_ID_KEY, accountId.value).trim()
}

function rememberCanvasDocument(document) {
  if (!document?.id) return
  writeAccountText(CANVAS_DOCUMENT_ID_KEY, accountId.value, document.id)
}

function forgetCanvasDocument() {
  removeAccountText(CANVAS_DOCUMENT_ID_KEY, accountId.value)
}
const assistantInput = ref('')
const assistantModel = ref('')
const assistantAttachment = ref(null)
const assistantRunning = ref(false)
const voiceListening = ref(false)
const aiMessages = ref([])
const assistantAgentState = ref({ phase: 'clarifying', brief: {}, pendingQuestions: [], plan: [], lastActionResult: '', updatedAt: '' })
const assistantConversation = computed(() => aiMessages.value.slice(-10).map((item) => ({ role: item.role === 'user' ? 'user' : 'assistant', content: String(item.text || '').slice(0, 3000) })))
/**
 * 画布助手对话的本地暂存键（基础键，真正落盘时还会拼上账号指纹）。
 * 老版本是一个写死的全局键 `canvas-assistant-session-v1`，不分账号：
 * A 用户问完退出、B 用户登录，B 打开助手就能看到 A 的全部对话。
 */
const ASSISTANT_SESSION_KEY = 'canvas-assistant-session-v1'
/** 只留最近几条：这纯粹是「刷新后还能接着看」的体验数据，不是完整聊天记录 */
const ASSISTANT_SESSION_LIMIT = 10

function readAssistantSession() {
  const saved = readAccountJson(ASSISTANT_SESSION_KEY, accountId.value)
  return saved && typeof saved === 'object' ? saved : null
}

function saveAssistantSession() {
  writeAccountJson(ASSISTANT_SESSION_KEY, accountId.value, {
    messages: aiMessages.value.slice(-ASSISTANT_SESSION_LIMIT),
    state: assistantAgentState.value,
  })
}
const historySnapshots = ref([])
const historyIndex = ref(-1)
let saveTimer = null
let speechRecognizer = null
let connectionFeedbackTimer = null
let edgeUndoTimer = null

const settings = reactive({
  prompt: '生成一段高级感运动鞋广告视频，镜头缓慢环绕，柔和棚拍光线',
  model: 'agnes-video-v2.0',
  duration: 8,
  ratio: '16:9',
  resolution: '1080P',
  creativity: 65,
})
const generationConfig = reactive({
  type: 'image',
  prompt: '',
  model: 'agnes-image-2.0-flash',
  ratio: '1:1',
  referenceRelations: [],
})
const configuredImageModels = ref([])
const configuredVideoModels = ref([])
const configuredTextModels = ref([])
const configuredModelLabels = ref({})
const configuredModelProviders = ref({})
if (props.adminMode && props.initialCanvas?.settings) Object.assign(settings, props.initialCanvas.settings)

// 新建画布一律从空白开始：不再预置「图片 / 文字生成 / 视频生成」示例节点。
// （用户明确要求：每次打开无限画布不该自带已经创建好的节点）
const defaultNodes = () => []
const defaultEdges = () => []

// 仅后台「重置工作流」使用：重置后给一条能直接跑通的最小流程，避免画布全空无从下手。
const resetWorkflowNodes = () => [
  {
    id: 'upload-1',
    type: 'upload',
    position: { x: 40, y: 250 },
    data: { title: '图片', image: DEMO_IMAGE },
  },
  {
    id: 'prompt-1',
    type: 'text',
    position: { x: 330, y: 305 },
    data: {
      mode: 'text-generation',
      title: '文字生成',
      prompt: '生成一段高级感运动鞋广告视频提示词',
      status: 'succeeded',
      output: { text: '高级感运动鞋广告视频，产品主体保持居中，镜头缓慢环绕，柔和棚拍光线。' },
      config: { model: '' },
    },
  },
  {
    id: 'video-1',
    type: 'video',
    position: { x: 600, y: 260 },
    data: {
      mode: 'video-generation',
      title: '视频生成',
      prompt: '',
      status: 'idle',
      config: { model: 'agnes-video-v2.0', duration: 6, ratio: '16:9', resolution: '720P' },
    },
  },
]

const resetWorkflowEdges = () => [
  edge('edge-upload-video', 'upload-1', 'video-1'),
  edge('edge-prompt-video', 'prompt-1', 'video-1'),
]

const nodes = ref(props.adminMode && Array.isArray(props.initialCanvas?.nodes) && props.initialCanvas.nodes.length ? JSON.parse(JSON.stringify(props.initialCanvas.nodes)) : defaultNodes())
const edges = ref(props.adminMode && Array.isArray(props.initialCanvas?.edges) ? JSON.parse(JSON.stringify(props.initialCanvas.edges)) : defaultEdges())

const { fitView, zoomIn, zoomOut, viewport, findNode, addSelectedNodes, removeSelectedNodes, updateNodeData } = useVueFlow('ai-creation-workflow')

const creationOptions = [
  { type: 'upload', label: '上传', icon: markRaw(UploadFilled) },
  { type: 'text-generation', label: '文字生成', icon: markRaw(MagicStick) },
  { type: 'image-generation', label: '图像生成', icon: markRaw(Picture) },
  { type: 'video-generation', label: '视频生成', icon: markRaw(VideoCamera) },
  // 结果展示节点原先只能由新建玩法的模板自带，用户删掉或重搭后就再也加不回来，
  // 保存会被「工作流缺少结果节点」拦住，所以必须给一个手动入口。
  { type: 'result', label: '结果展示', icon: markRaw(CircleCheck) },
]

const workspaceTitle = computed(() => {
  if (props.adminMode) return props.workflowTitle || '未命名玩法'
  const title = sourceProject.title?.trim()
  return title && title !== '新的AI绘画项目' ? title : '电商广告视频'
})
const requestedCanvasId = computed(() => String(route.query.canvasId || '').trim())
const zoomPercent = computed(() => Math.round((viewport.value?.zoom || 1) * 100))
const selectedNode = computed(() => nodes.value.find((node) => node.id === selectedNodeId.value) || nodes.value[0])
const marqueeSelectionCount = computed(() => nodes.value.filter((node) => node.selected).length)
const selectedNodeTitle = computed(() => selectedNode.value?.data?.title || '未选择节点')
const selectedEdge = computed(() => edges.value.find((item) => item.id === selectedEdgeId.value) || null)
const selectedEdgeLabel = computed(() => {
  if (!selectedEdge.value) return ''
  return `${nodeDisplayName(selectedEdge.value.source)} → ${nodeDisplayName(selectedEdge.value.target)}`
})
const selectedNodeIcon = computed(() => {
  const iconMap = { upload: UploadFilled, prompt: MagicStick, video: VideoCamera, result: CircleCheck, image: Picture, config: Operation, text: EditPen }
  return iconMap[selectedNode.value?.type] || Picture
})
const inputImage = computed(() => {
  const source = nodes.value.find((node) => node.type === 'upload' && node.data?.image)
  return source?.data?.image || DEMO_IMAGE
})
const canUndo = computed(() => historyIndex.value > 0)
const canRedo = computed(() => historyIndex.value >= 0 && historyIndex.value < historySnapshots.value.length - 1)
// 空白画布引导：画布上没有节点、且没在框选/打开发成配置浮层时才显示，避免挡住正常操作。
const showEmptyCanvasGuide = computed(() => !nodes.value.length
  && !marqueeMode.value
  && !generationConfigOpen.value)

onMounted(async () => {
  // 老版本把所有账号的助手对话挤在一个不分人的键里，里面的内容已经不知道是谁的了。
  // 只能丢掉：继承给当前登录的人，等于把上一个人的话送给他看。
  discardLegacyStorageKey(ASSISTANT_SESSION_KEY)
  // 账号可能在路由守卫里异步恢复，等一拍再读，避免读到 anonymous 那份。
  await nextTick()
  const saved = readAssistantSession()
  if (Array.isArray(saved?.messages)) aiMessages.value = saved.messages.slice(-ASSISTANT_SESSION_LIMIT)
  if (saved?.state && typeof saved.state === 'object') assistantAgentState.value = { ...assistantAgentState.value, ...saved.state }
  if (props.adminMode) {
    if (props.initialCanvas) applySavedCanvas(props.initialCanvas)
  } else {
    Object.assign(sourceProject, projectStore.currentProject || projectStore.draft || createEmptyProject('pro'))
    await restoreCanvas()
  }
  // 已知坑（见 .workbuddy/memory/MEMORY.md）：VueFlow 挂载期会把初始 nodes/edges（defaultNodes 种子）回写，
  // 覆盖 onMounted 中恢复的画布，导致刷新后看不到已保存内容。挂载完成后重新赋值一次引用触发 v-model 同步即可修复。
  await nextTick()
  nodes.value = [...nodes.value]
  edges.value = [...edges.value]
  connectionGuideVisible.value = props.adminMode ? false : window.localStorage.getItem(CONNECTION_GUIDE_KEY) !== 'dismissed'
  commitHistory(true)
  window.addEventListener('keydown', handleShortcut)
  // 点空白处收起「文件」菜单（画布区域已有 closeFloatingMenus，顶栏这块要单独兜住）。
  window.addEventListener('pointerdown', handleFileMenuPointerDown, true)
  await loadConfiguredModels()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleShortcut)
  window.removeEventListener('pointerdown', handleFileMenuPointerDown, true)
  if (saveTimer) window.clearTimeout(saveTimer)
  if (connectionFeedbackTimer) window.clearTimeout(connectionFeedbackTimer)
  if (edgeUndoTimer) window.clearTimeout(edgeUndoTimer)
  stopGenerationConfigDrag()
  speechRecognizer?.stop?.()
})

watch([nodes, edges, settings, edgesVisible], scheduleSave, { deep: true })

function edge(id, source, target) {
  return {
    id,
    source,
    target,
    type: 'default',
    interactionWidth: 28,
    style: { stroke: '#2f80ed', strokeWidth: 2.4 },
  }
}

function toggleCreateMenu() {
  createMenuOpen.value = !createMenuOpen.value
  generationConfigOpen.value = false
  nodeActionId.value = ''
}

function toggleGenerationConfig() {
  generationConfigOpen.value = !generationConfigOpen.value
  generationConfigSourceNodeId.value = selectedNode.value?.id || ''
  generationConfig.referenceRelations = [...(selectedNode.value?.data?.referenceRelations || [])]
  createMenuOpen.value = false
  nodeActionId.value = ''
}

async function loadConfiguredModels() {
  try {
    const response = await apiClient.get('/ai/health')
    const providers = response?.data?.providers || {}
    const imageModels = []
    const videoModels = []
    const textModels = []
    const labels = {}
    const modelProviders = {}
    Object.entries(providers).forEach(([providerKey, provider]) => {
      if (!provider?.configured) return
      const providerLabel = provider.label || providerKey
      ;(provider.imageModels || (provider.imageModel ? [provider.imageModel] : [])).forEach((model) => {
        if (!imageModels.includes(model)) imageModels.push(model)
        labels[model] = `${providerLabel} · ${provider.modelLabels?.[model] || model}`
        modelProviders[model] = providerKey
      })
      ;(provider.videoModels || (provider.videoModel ? [provider.videoModel] : [])).forEach((model) => {
        if (!videoModels.includes(model)) videoModels.push(model)
        labels[model] = `${providerLabel} · ${provider.modelLabels?.[model] || model}`
        modelProviders[model] = providerKey
      })
      ;(provider.textModels || (provider.textModel ? [provider.textModel] : [])).forEach((model) => {
        if (!textModels.includes(model)) textModels.push(model)
        labels[model] = `${providerLabel} · ${provider.modelLabels?.[model] || model}`
        modelProviders[model] = providerKey
      })
    })
    configuredImageModels.value = imageModels
    configuredVideoModels.value = videoModels
    configuredTextModels.value = textModels
    configuredModelLabels.value = labels
    configuredModelProviders.value = modelProviders
    if (!textModels.includes(assistantModel.value)) assistantModel.value = textModels[0] || ''
    nodes.value.forEach((node) => {
      if (!isGeneratorNode(node)) return
      const options = generatorModels(node)
      if (options.length && !options.includes(node.data.config?.model || node.data.model)) {
        if (node.data.config) node.data.config.model = options[0]
        else node.data.model = options[0]
      }
    })
    const currentModels = generationConfig.type === 'video' ? configuredVideoModels.value : configuredImageModels.value
    if (currentModels.length && !currentModels.includes(generationConfig.model)) generationConfig.model = currentModels[0]
  } catch {
    // 保留默认模型，允许本地演示模式继续使用画布。
  }
}

function startGenerationConfigDrag(event) {
  if (generationConfigDrag.active || (event.pointerType === 'mouse' && event.button !== 0)) return
  const panel = generationConfigPanel.value
  if (!panel) return
  const rect = panel.getBoundingClientRect()
  generationConfigDrag.active = true
  generationConfigDrag.pointerId = event.pointerId
  generationConfigDrag.startX = event.clientX
  generationConfigDrag.startY = event.clientY
  generationConfigDrag.originX = generationConfigPosition.x
  generationConfigDrag.originY = generationConfigPosition.y
  generationConfigDrag.initialLeft = rect.left
  generationConfigDrag.initialTop = rect.top
  generationConfigDrag.width = rect.width
  generationConfigDrag.height = rect.height
  document.body.classList.add('generation-config-dragging')
  window.addEventListener('pointermove', moveGenerationConfigDrag)
  window.addEventListener('pointerup', stopGenerationConfigDrag)
  window.addEventListener('pointercancel', stopGenerationConfigDrag)
}

function moveGenerationConfigDrag(event) {
  if (!generationConfigDrag.active || event.pointerId !== generationConfigDrag.pointerId) return
  const area = canvasArea.value
  if (!area) return
  const bounds = area.getBoundingClientRect()
  const minLeft = bounds.left + 8
  const maxLeft = Math.max(minLeft, bounds.right - generationConfigDrag.width - 8)
  const minTop = bounds.top + 8
  const maxTop = Math.max(minTop, bounds.bottom - generationConfigDrag.height - 8)
  const nextLeft = Math.min(maxLeft, Math.max(minLeft, generationConfigDrag.initialLeft + event.clientX - generationConfigDrag.startX))
  const nextTop = Math.min(maxTop, Math.max(minTop, generationConfigDrag.initialTop + event.clientY - generationConfigDrag.startY))
  generationConfigPosition.x = generationConfigDrag.originX + nextLeft - generationConfigDrag.initialLeft
  generationConfigPosition.y = generationConfigDrag.originY + nextTop - generationConfigDrag.initialTop
}

function stopGenerationConfigDrag() {
  if (!generationConfigDrag.active) return
  generationConfigDrag.active = false
  generationConfigDrag.pointerId = null
  document.body.classList.remove('generation-config-dragging')
  window.removeEventListener('pointermove', moveGenerationConfigDrag)
  window.removeEventListener('pointerup', stopGenerationConfigDrag)
  window.removeEventListener('pointercancel', stopGenerationConfigDrag)
}

function selectGenerationConfigType(type) {
  generationConfig.type = type
  generationConfig.model = type === 'text'
    ? defaultTextModel()
    : type === 'video'
      ? 'agnes-video-v2.0'
      : 'agnes-image-2.0-flash'
}

function focusGenerationConfigPrompt() {
  generationConfigPromptInput.value?.focus?.()
}

function showAudioPlaceholder() {
  ElMessage.info('音频生成与参考音频功能暂未开放')
}

async function openConfiguredGenerationNode() {
  const type = generationConfig.type
  const nodeMeta = type === 'text'
    ? {
        nodeType: 'text',
        title: '文字生成',
        mode: 'text-generation',
        prompt: generationConfig.prompt,
        referenceRelations: [...generationConfig.referenceRelations],
        status: 'idle',
        config: { model: generationConfig.model },
      }
    : type === 'video'
      ? {
          nodeType: 'video',
          title: '视频生成',
          mode: 'video-generation',
          prompt: generationConfig.prompt,
          referenceRelations: [...generationConfig.referenceRelations],
          status: 'idle',
          config: { model: generationConfig.model, duration: 6, ratio: generationConfig.ratio, resolution: '720P' },
        }
      : {
          nodeType: 'image',
          title: '图像生成',
          mode: 'image-generation',
          prompt: generationConfig.prompt,
          referenceRelations: [...generationConfig.referenceRelations],
          status: 'idle',
          config: { model: generationConfig.model, ratio: generationConfig.ratio, resolution: '1080P' },
        }
  const { nodeType, ...data } = nodeMeta
  const newNode = createNode(nodeType, data)
  const anchor = selectedNode.value || nodes.value[nodes.value.length - 1]
  if (anchor) newNode.position = { x: anchor.position.x + 430, y: anchor.position.y }
  appendSelectedNode(newNode)
  expandedNodeId.value = ['image', 'video'].includes(nodeType) ? newNode.id : ''
  generationConfigOpen.value = false
  await nextTick()
  await runGenerator(newNode.id)
  commitHistory()
  ElMessage.success('已生成结果')
}

function closeFloatingMenus() {
  fileMenuOpen.value = false
  nodeActionId.value = ''
}

function handlePaneClick() {
  connectionCreateMenu.visible = false
  nodeActionId.value = ''
  selectedNodeId.value = ''
  expandedNodeId.value = ''
  textAgentNodeId.value = ''
  textEditingNodeId.value = ''
  clearSelectedEdge()
}

// 框选结束后，节点高亮完全交由 VueFlow 的 selected 状态主导。
// 若不清理项目自身的单选态，框选前选中的节点会残留工具栏与蓝框，与框选结果不一致。
function handleSelectionEnd() {
  // 记录本次框选结果：框选结束后项目单选态会被清空，但「成组」需要知道选了哪些。
  const picked = nodes.value.filter((node) => node.selected && node.type !== 'group').map((node) => node.id)
  if (picked.length) lastMarqueeSelection.value = picked
  nodeActionId.value = ''
  selectedNodeId.value = ''
  expandedNodeId.value = ''
  clearSelectedEdge()
}

function handleCreateOption(type) {
  if (type === 'upload') {
    fileInput.value?.click()
    return
  }
  const nodeMeta = {
    'text-generation': {
      nodeType: 'text',
      title: '文字生成',
      mode: 'text-generation',
      prompt: '',
      status: 'idle',
      config: { model: defaultTextModel() },
    },
    'image-generation': {
      nodeType: 'image',
      title: '图像生成',
      mode: 'image-generation',
      prompt: '',
      status: 'idle',
      config: { model: 'agnes-image-2.0-flash', ratio: '1:1', resolution: '1080P' },
    },
    'video-generation': {
      nodeType: 'video',
      title: '视频生成',
      mode: 'video-generation',
      prompt: '',
      status: 'idle',
      config: { model: 'agnes-video-v2.0', duration: 5, ratio: '16:9', resolution: '1080P' },
    },
    // 结果节点只负责展示上游产物，没有模型参数，所以不带 mode / config。
    result: {
      nodeType: 'result',
      title: '结果展示',
      state: 'idle',
    },
  }[type]
  if (!nodeMeta) return
  if (['image-generation', 'video-generation'].includes(type) && window.matchMedia('(max-width: 1180px)').matches) {
    rightPanelCollapsed.value = true
  }
  const { nodeType, ...data } = nodeMeta
  const newNode = createNode(nodeType, data)
  appendSelectedNode(newNode)
  expandedNodeId.value = ['image', 'video'].includes(nodeType) ? newNode.id : ''
  openPanel.value = type === 'text-generation' ? 'assistant' : type === 'result' ? '' : 'settings'
  createMenuOpen.value = false
  commitHistory()
  ElMessage.success(`已添加“${nodeMeta.title}”节点`)
}

function createNode(type, data) {
  const count = nodes.value.length
  const placementIndex = count % 3
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    position: count ? { x: 120 + placementIndex * 36, y: -8 + placementIndex * 32 } : emptyCanvasNodePosition(type),
    data,
  }
}

// 空画布的第一个节点：落在当前视口中央（换算回画布坐标），否则会落在顶栏下面像"没反应"。
function emptyCanvasNodePosition(type) {
  const [width, height] = GROUP_NODE_SIZE_FALLBACK[type] || [320, 260]
  const rect = canvasArea.value?.getBoundingClientRect?.()
  const zoom = Number(viewport.value?.zoom || 1) || 1
  if (!rect || !rect.width || !rect.height) return { x: 120, y: 120 }
  const centerX = (rect.width / 2 - Number(viewport.value?.x || 0)) / zoom - width / 2
  const centerY = (rect.height / 2 - Number(viewport.value?.y || 0)) / zoom - height / 2
  return { x: Math.round(centerX), y: Math.round(Math.max(centerY, 24)) }
}

function appendSelectedNode(newNode) {
  nodes.value.forEach((node) => { node.selected = false })
  newNode.selected = true
  nodes.value = [...nodes.value, newNode]
  selectedNodeId.value = newNode.id
}

// ---- 分组（VueFlow 真父子）：成组 / 解组 / 自适应框大小 ----
const GROUP_PAD = 32
// 估算回退（优先用 VueFlow 已测量出的真实尺寸）
const GROUP_NODE_SIZE_FALLBACK = {
  upload: [300, 320],
  image: [420, 520],
  video: [420, 500],
  text: [360, 150],
  result: [300, 320],
  config: [380, 260],
  group: [520, 360],
}

function nodeSizeEstimate(node) {
  const measured = findNode(node?.id)?.dimensions
  const width = Number(measured?.width || 0)
  const height = Number(measured?.height || 0)
  if (width > 0 && height > 0) return { width, height }
  const [fallbackWidth, fallbackHeight] = GROUP_NODE_SIZE_FALLBACK[node?.type] || [320, 260]
  return { width: fallbackWidth, height: fallbackHeight }
}

function groupMembers(groupId) {
  return nodes.value.filter((node) => node.parentNode === groupId)
}

function groupMemberCount(groupId) {
  return groupMembers(groupId).length
}

// 把一批「顶层节点」归为一组。成员坐标转成相对组框坐标，绝对视觉位置不变。
function groupNodes(nodeIds, title = '分组') {
  const ids = Array.isArray(nodeIds) ? nodeIds.filter(Boolean) : []
  const members = nodes.value.filter((node) => ids.includes(node.id) && node.type !== 'group' && !node.parentNode)
  if (members.length < 2) {
    ElMessage.warning('至少选中 2 个未成组的节点才能成组')
    return ''
  }
  const boxes = members.map((node) => {
    const size = nodeSizeEstimate(node)
    return { x: Number(node.position.x), y: Number(node.position.y), width: size.width, height: size.height }
  })
  const gx = Math.round(Math.min(...boxes.map((box) => box.x)) - GROUP_PAD)
  const gy = Math.round(Math.min(...boxes.map((box) => box.y)) - GROUP_PAD)
  const gw = Math.round(Math.max(...boxes.map((box) => box.x + box.width)) + GROUP_PAD - gx)
  const gh = Math.round(Math.max(...boxes.map((box) => box.y + box.height)) + GROUP_PAD - gy)
  const groupId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  members.forEach((node) => {
    // 绝对 → 相对（相对坐标是 VueFlow parentNode 的约定）
    node.position = { x: Math.round(Number(node.position.x) - gx), y: Math.round(Number(node.position.y) - gy) }
    node.parentNode = groupId
    node.extent = 'parent'
    node.selected = false
  })
  const group = {
    id: groupId,
    type: 'group',
    position: { x: gx, y: gy },
    width: gw,
    height: gh,
    style: { width: `${gw}px`, height: `${gh}px` },
    data: { mode: 'group', title: String(title || '分组').slice(0, 40), width: gw, height: gh },
    selectable: false,
  }
  // 组排在最前：便于首帧父子测量，也让存储更好读。
  nodes.value = [group, ...nodes.value]
  lastMarqueeSelection.value = []
  selectedNodeId.value = groupId
  scheduleSave()
  commitHistory()
  return groupId
}

// 解组：成员相对坐标换算回绝对坐标，再移除组节点（视觉位置不变）。
function ungroupNodes(groupIds) {
  const ids = Array.isArray(groupIds) ? groupIds.filter(Boolean) : []
  const groups = new Set(ids.length ? ids : nodes.value.filter((node) => node.type === 'group').map((node) => node.id))
  if (!groups.size) return 0
  let moved = 0
  nodes.value.forEach((node) => {
    if (!node.parentNode || !groups.has(node.parentNode)) return
    const parent = nodes.value.find((item) => item.id === node.parentNode)
    node.position = {
      x: Math.round(Number(parent?.position?.x || 0) + Number(node.position?.x || 0)),
      y: Math.round(Number(parent?.position?.y || 0) + Number(node.position?.y || 0)),
    }
    delete node.parentNode
    delete node.extent
    moved += 1
  })
  nodes.value = nodes.value.filter((node) => !groups.has(node.id))
  if (groups.has(selectedNodeId.value)) selectedNodeId.value = nodes.value[0]?.id || ''
  scheduleSave()
  commitHistory()
  return moved
}

// 重算组框以刚好包住所有成员，同时抵消位移，保证成员视觉位置不变。
function autofitGroup(groupId) {
  const group = nodes.value.find((node) => node.id === groupId && node.type === 'group')
  if (!group) return
  const members = groupMembers(groupId)
  if (!members.length) return
  const boxes = members.map((node) => {
    const size = nodeSizeEstimate(node)
    return {
      x: Number(group.position.x) + Number(node.position.x),
      y: Number(group.position.y) + Number(node.position.y),
      width: size.width,
      height: size.height,
    }
  })
  const ngx = Math.round(Math.min(...boxes.map((box) => box.x)) - GROUP_PAD)
  const ngy = Math.round(Math.min(...boxes.map((box) => box.y)) - GROUP_PAD)
  const ngw = Math.round(Math.max(...boxes.map((box) => box.x + box.width)) + GROUP_PAD - ngx)
  const ngh = Math.round(Math.max(...boxes.map((box) => box.y + box.height)) + GROUP_PAD - ngy)
  const dx = ngx - Number(group.position.x)
  const dy = ngy - Number(group.position.y)
  if (dx || dy) members.forEach((node) => { node.position = { x: node.position.x - dx, y: node.position.y - dy } })
  group.position = { x: ngx, y: ngy }
  group.width = ngw
  group.height = ngh
  group.style = { ...(group.style || {}), width: `${ngw}px`, height: `${ngh}px` }
  group.data = { ...(group.data || {}), width: ngw, height: ngh }
}

// 组框按下：把「组」标记为选中，并清掉成员的选中态。
// VueFlow 的 getDragItems 会跳过「父节点已选中」的子节点；否则拖组时成员会被算成独立拖拽项而位移两倍。
function onGroupPointerDown(groupId) {
  if (markingActive.value) return
  const members = groupMembers(groupId)
  members.forEach((node) => { node.selected = false })
  const group = nodes.value.find((node) => node.id === groupId)
  if (group) group.selected = true
  try {
    if (members.length) removeSelectedNodes(members)
    addSelectedNodes([{ id: groupId }])
  } catch {}
  nodeActionId.value = ''
}

function groupSelectedNodes() {
  const picked = nodes.value.filter((node) => node.selected && node.type !== 'group').map((node) => node.id)
  const target = picked.length >= 2 ? picked : lastMarqueeSelection.value
  if (target.length < 2) {
    ElMessage.warning('请先用「框选」或按住 Shift 选中至少 2 个节点')
    return
  }
  const groupId = groupNodes(target)
  if (groupId) ElMessage.success(`已把 ${groupMemberCount(groupId)} 个节点归为一组`)
}

function ungroupOneGroup(groupId) {
  const moved = ungroupNodes([groupId])
  if (moved) ElMessage.success(`已解组，${moved} 个节点恢复为独立节点`)
}

function ungroupSelectedNode() {
  const pickedGroups = nodes.value.filter((node) => node.selected && node.type === 'group').map((node) => node.id)
  const fallback = pickedGroups.length
    ? pickedGroups
    : nodes.value.filter((node) => node.type === 'group' && (node.id === selectedNodeId.value)).map((node) => node.id)
  if (!fallback.length) {
    ElMessage.warning('请先选中一个分组')
    return
  }
  ungroupOneGroup(fallback[0])
}

// ---- 画布模板（P2）：把一段子图存成服务端模板，之后可一键实例化回来 ----
// 单条内联素材超过这个体积就不写进模板，避免模板被 base64 撑爆（服务端上限 512KB）。
const TEMPLATE_INLINE_DATA_LIMIT = 64 * 1024

const templatePanelOpen = computed(() => openPanel.value === 'templates' && !rightPanelCollapsed.value)
const templatePanelLoading = ref(false)
const templateSaving = ref(false)
const canvasTemplates = ref([])
const templateForm = reactive({ name: '', scope: 'private' })

function isHeavyInlineData(value) {
  return typeof value === 'string' && value.startsWith('data:') && value.length > TEMPLATE_INLINE_DATA_LIMIT
}

// 递归清掉模板快照里的超大内联素材（dataUrl / base64），只保留结构性字段。
function stripHeavyInlineData(value, depth = 0) {
  if (depth > 8 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((item) => stripHeavyInlineData(item, depth + 1))
  const next = {}
  Object.entries(value).forEach(([key, item]) => {
    next[key] = isHeavyInlineData(item) ? '' : stripHeavyInlineData(item, depth + 1)
  })
  return next
}

// 当前要存为模板的节点：优先用选中态，退回到最近一次框选结果。
function templateSelectionIds() {
  const picked = nodes.value.filter((node) => node.selected).map((node) => node.id)
  if (picked.length) return picked
  return [...lastMarqueeSelection.value]
}

// 把一批节点抽成模板快照：顶层坐标归一化到左上角原点，分组父子结构原样保留。
function extractSubgraph(nodeIds) {
  const ids = Array.isArray(nodeIds) ? nodeIds.filter(Boolean) : []
  const set = new Set(ids)
  if (!set.size) return { nodes: [], edges: [] }
  // 分组必须「连父带子」一起走，否则实例化后父子悬空、坐标会错位。
  let changed = true
  while (changed) {
    changed = false
    nodes.value.forEach((node) => {
      if (node.parentNode && set.has(node.parentNode) && !set.has(node.id)) { set.add(node.id); changed = true }
      if (node.parentNode && set.has(node.id) && !set.has(node.parentNode)) { set.add(node.parentNode); changed = true }
    })
  }
  const picked = nodes.value.filter((node) => set.has(node.id))
  if (!picked.length) return { nodes: [], edges: [] }
  const tops = picked.filter((node) => !node.parentNode || !set.has(node.parentNode))
  const originX = Math.min(...tops.map((node) => Number(node.position?.x) || 0))
  const originY = Math.min(...tops.map((node) => Number(node.position?.y) || 0))
  const snapshot = picked.map((node) => {
    const isMember = Boolean(node.parentNode && set.has(node.parentNode))
    const item = {
      id: node.id,
      type: node.type,
      position: isMember
        ? { x: Math.round(Number(node.position?.x) || 0), y: Math.round(Number(node.position?.y) || 0) }
        : {
          x: Math.round((Number(node.position?.x) || 0) - originX),
          y: Math.round((Number(node.position?.y) || 0) - originY),
        },
      data: stripHeavyInlineData(JSON.parse(JSON.stringify(node.data || {}))),
    }
    if (node.parentNode) item.parentNode = node.parentNode
    if (node.extent) item.extent = node.extent
    if (Number.isFinite(node.width)) item.width = Math.round(node.width)
    if (Number.isFinite(node.height)) item.height = Math.round(node.height)
    if (node.style) item.style = JSON.parse(JSON.stringify(node.style))
    return item
  })
  const snapshotEdges = edges.value
    .filter((edge) => set.has(edge.source) && set.has(edge.target))
    .map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
      ...(edge.type ? { type: edge.type } : {}),
      ...(edge.label ? { label: edge.label } : {}),
    }))
  return { nodes: snapshot, edges: snapshotEdges }
}

// 实例化模板：重映射所有 id（节点 / 父子 / 连线 / 引用片 / 标记元素），避免与现有画布撞车。
function instantiateTemplate(template, origin = null) {
  const graph = template?.graph || {}
  const sourceNodes = Array.isArray(graph.nodes) ? graph.nodes : []
  if (!sourceNodes.length) {
    ElMessage.warning('这个模板是空的')
    return []
  }
  const stamp = Date.now()
  const idMap = new Map()
  sourceNodes.forEach((node, index) => {
    idMap.set(node.id, `${node.type}-${stamp}-${index}-${Math.random().toString(36).slice(2, 6)}`)
  })
  const remapReferences = (value, depth = 0) => {
    if (depth > 8 || value === null || typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map((item) => remapReferences(item, depth + 1))
    const next = {}
    Object.entries(value).forEach(([key, item]) => {
      if ((key === 'nodeId' || key === 'id') && typeof item === 'string' && idMap.has(item)) {
        next[key] = idMap.get(item)
        return
      }
      next[key] = remapReferences(item, depth + 1)
    })
    return next
  }

  const tops = sourceNodes.filter((node) => !node.parentNode || !idMap.has(node.parentNode))
  const minX = Math.min(...tops.map((node) => Number(node.position?.x) || 0))
  const minY = Math.min(...tops.map((node) => Number(node.position?.y) || 0))
  let baseX = Number(origin?.x)
  let baseY = Number(origin?.y)
  if (!Number.isFinite(baseX) || !Number.isFinite(baseY)) {
    // 没指定落点：放在现有画布（不含分组）的右侧，避免叠在已有节点上。
    const existing = nodes.value.filter((node) => node.type !== 'group')
    baseX = existing.length
      ? Math.round(Math.max(...existing.map((node) => Number(node.position?.x) || 0)) + 140)
      : 120
    baseY = existing.length
      ? Math.round(Math.min(...existing.map((node) => Number(node.position?.y) || 0)))
      : 80
  }

  const created = sourceNodes.map((node) => {
    const isMember = Boolean(node.parentNode && idMap.has(node.parentNode))
    const next = {
      id: idMap.get(node.id),
      type: node.type,
      position: isMember
        ? { x: Number(node.position?.x) || 0, y: Number(node.position?.y) || 0 }
        : {
          x: Math.round((Number(node.position?.x) || 0) - minX + baseX),
          y: Math.round((Number(node.position?.y) || 0) - minY + baseY),
        },
      data: remapReferences(JSON.parse(JSON.stringify(node.data || {}))),
      selected: false,
    }
    if (isMember) next.parentNode = idMap.get(node.parentNode)
    if (node.extent) next.extent = node.extent
    if (Number.isFinite(node.width)) next.width = Math.round(node.width)
    if (Number.isFinite(node.height)) next.height = Math.round(node.height)
    if (node.style) next.style = JSON.parse(JSON.stringify(node.style))
    if (node.type === 'group') next.selectable = false
    return next
  })

  const createdEdges = (Array.isArray(graph.edges) ? graph.edges : [])
    .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
    .map((edge, index) => ({
      id: `edge-${stamp}-${index}-${Math.random().toString(36).slice(2, 6)}`,
      source: idMap.get(edge.source),
      target: idMap.get(edge.target),
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
      ...(edge.type ? { type: edge.type } : {}),
      ...(edge.label ? { label: edge.label } : {}),
    }))

  // 组节点排在前面，便于首帧父子测量。
  const ordered = [...created.filter((node) => node.type === 'group'), ...created.filter((node) => node.type !== 'group')]
  nodes.value.forEach((node) => { node.selected = false })
  nodes.value = [...nodes.value, ...ordered]
  if (createdEdges.length) edges.value = [...edges.value, ...createdEdges]
  selectedNodeId.value = ordered.find((node) => node.type !== 'group')?.id || ordered[0]?.id || ''
  expandedNodeId.value = ''
  lastMarqueeSelection.value = []
  nextTick(() => {
    try { fitView({ nodes: ordered.map((node) => node.id), padding: 0.24, duration: 260 }) } catch {}
  })
  scheduleSave()
  commitHistory()
  return ordered.map((node) => node.id)
}

async function refreshCanvasTemplates() {
  templatePanelLoading.value = true
  try {
    const list = await listCanvasTemplates()
    canvasTemplates.value = list
  } catch (error) {
    canvasTemplates.value = []
    ElMessage.error(error?.response?.data?.message || error?.message || '读取画布模板失败')
  } finally {
    templatePanelLoading.value = false
  }
}

function openTemplatePanel() {
  rightPanelCollapsed.value = false
  openPanel.value = 'templates'
  refreshCanvasTemplates()
}

// 空白画布引导里的「套用模板」：直接打开右侧模板面板。
function openCanvasTemplatePanelFromEmpty() {
  openTemplatePanel()
}

watch(openPanel, (panel) => {
  if (panel === 'templates' && !canvasTemplates.value.length) refreshCanvasTemplates()
})

async function saveTemplateFromSelection() {
  const ids = templateSelectionIds()
  if (!ids.length) {
    ElMessage.warning('请先在画布上框选或选中要存为模板的节点')
    return
  }
  const graph = extractSubgraph(ids)
  if (!graph.nodes.length) {
    ElMessage.warning('选中的节点无法组成模板')
    return
  }
  const name = templateForm.name.trim() || `模板 ${new Date().toLocaleString('zh-CN', { hour12: false })}`
  templateSaving.value = true
  try {
    const saved = await saveCanvasTemplate({
      name,
      description: '',
      scope: templateForm.scope,
      graph,
    })
    if (saved) {
      ElMessage.success(`已存为模板「${saved.name}」（${saved.nodeCount} 个节点）`)
      templateForm.name = ''
      await refreshCanvasTemplates()
    } else {
      ElMessage.error('保存模板失败')
    }
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || error?.message || '保存模板失败')
  } finally {
    templateSaving.value = false
  }
}

async function applyCanvasTemplate(template) {
  if (!template?.id) return
  let graph = template.graph
  if (!graph || !Array.isArray(graph.nodes) || !graph.nodes.length) {
    try {
      const full = await getCanvasTemplate(template.id)
      graph = full?.graph
    } catch (error) {
      ElMessage.error(error?.response?.data?.message || error?.message || '读取模板详情失败')
      return
    }
  }
  const ids = instantiateTemplate({ ...template, graph })
  if (ids.length) ElMessage.success(`已应用模板「${template.name}」，新增 ${ids.length} 个节点`)
}

async function deleteTemplateById(template) {
  if (!template?.id) return
  try {
    await deleteCanvasTemplate(template.id)
    ElMessage.success('模板已删除')
    await refreshCanvasTemplates()
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || error?.message || '删除模板失败')
  }
}

async function handleUpload(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    ElMessage.warning('请选择图片文件')
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.warning('图片大小不能超过 10MB')
    return
  }
  try {
    const dataUrl = await readFileAsDataUrl(file)
    const dimensions = await readImageDimensions(dataUrl)
      const asset = await persistCanvasAsset(file, dataUrl)
    const newNode = createNode('upload', {
      title: file.name.replace(/\.[^.]+$/, '') || '上传图片',
      image: asset.url,
      assetId: asset.id,
      originalName: file.name,
      naturalWidth: dimensions.width,
      naturalHeight: dimensions.height,
      aspectRatio: dimensions.width / dimensions.height,
    })
    appendSelectedNode(newNode)
    createMenuOpen.value = false
    commitHistory()
    ElMessage.success('图片已加入画布')
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || error.message || '图片上传失败，请重试')
  }
}

function addTextNode() {
  const newNode = createNode('text', {
    mode: 'free-text',
    title: '文字',
    text: '双击编辑标题',
    style: {
      color: '#20242b',
      fontFamily: 'Microsoft YaHei',
      fontSize: 42,
      fontWeight: 700,
      textAlign: 'left',
      width: 360,
      minHeight: 72,
    },
  })
  appendSelectedNode(newNode)
  openPanel.value = 'settings'
  commitHistory()
}

function toggleMarqueeMode() {
  marqueeMode.value = !marqueeMode.value
  if (!marqueeMode.value) return
  // 进入框选模式时收起单选相关的临时 UI，避免与框选叠加造成理解混乱；
  // 不清空节点自身的 selected，用户可以先选中再用框选追加。
  connectionCreateMenu.visible = false
  nodeActionId.value = ''
  clearSelectedEdge()
}

function updateNodeText(id, event) {
  const node = nodes.value.find((item) => item.id === id)
  if (!node) return
  node.data.text = event.target.textContent?.trim() || '文字'
  commitHistory()
}

function smartTextValue(data = {}) {
  return data.text || data.output?.text || data.prompt || ''
}

function setTextEditorRef(id, element) {
  if (element) textEditorRefs.set(id, element)
  else textEditorRefs.delete(id)
}

function focusTextEditor(id) {
  textEditingNodeId.value = id
  requestAnimationFrame(() => textEditorRefs.get(id)?.focus?.())
}

// ---------------- 文字节点「放大编辑」 ----------------
// 把文字节点的正文搬到一块独立大面板里读写。不拉伸节点本身：画布自带缩放，
// 硬拉节点会让字号失真、位置跑偏；面板里改的内容直接写回同一个节点，
// 因此画布上的正文、提示词、下游引用都会同步，退出后原节点照旧留在原位。
const textZoomNodeId = ref('')
const textZoomText = ref('')
const textZoomOriginal = ref('')
const textZoomFontSize = ref(15)
const textZoomEditor = ref(null)
const textZoomNode = computed(() => (textZoomNodeId.value
  ? nodes.value.find((item) => item.id === textZoomNodeId.value) || null
  : null))

function openTextZoom(id) {
  const node = nodes.value.find((item) => item.id === id)
  if (!node) return
  const text = smartTextValue(node.data)
  textZoomNodeId.value = id
  textZoomText.value = text
  textZoomOriginal.value = text
  // 字号取节点正文的真实字号，面板上显示的大小与画布一致（放大只是把面板做大）。
  const sourceEditor = textEditorRefs.get(id)
  const measured = sourceEditor ? Number.parseFloat(window.getComputedStyle(sourceEditor).fontSize) : NaN
  textZoomFontSize.value = Number.isFinite(measured) && measured > 0 ? measured : 15
  nextTick(() => {
    const editor = textZoomEditor.value
    if (!editor) return
    editor.focus()
    const selection = window.getSelection?.()
    if (!selection) return
    const range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
  })
}

// 输入时直接写回节点，但不回写 textZoomText —— 否则 Vue 会重渲染 contenteditable，光标被顶回开头。
function handleTextZoomInput(event) {
  const node = textZoomNode.value
  if (!node) return
  const text = event.target?.innerText ?? event.target?.textContent ?? ''
  node.data.text = text
  node.data.prompt = text
}

function flushTextZoomEdit() {
  const node = textZoomNode.value
  if (!node) return
  const editor = textZoomEditor.value
  const raw = editor ? (editor.innerText ?? editor.textContent ?? '') : (node.data.text ?? '')
  const text = raw.trim() || '文字'
  node.data.text = text
  node.data.prompt = text
  // 记下已提交的内容：失焦与「收起」会连着触发，避免同一处改动被记成两次撤销。
  if (text !== textZoomOriginal.value) {
    textZoomOriginal.value = text
    commitHistory()
  }
}

function closeTextZoom() {
  if (!textZoomNodeId.value) return
  flushTextZoomEdit()
  textZoomNodeId.value = ''
  textZoomText.value = ''
  textZoomOriginal.value = ''
}

function updateSmartText(id, event) {
  const node = nodes.value.find((item) => item.id === id)
  if (!node) return
  node.data.text = event.target.textContent?.trim() || '文字'
  node.data.prompt = node.data.text
  commitHistory()
}

function updateFreeText(id, event) {
  const node = nodes.value.find((item) => item.id === id && item.data?.mode === 'free-text')
  if (!node) return
  node.data.text = event.target.textContent || ''
}

function finishFreeTextEditing(id, event) {
  const node = nodes.value.find((item) => item.id === id && item.data?.mode === 'free-text')
  if (node) node.data.text = event.target.textContent?.trim() || '文字'
  if (textEditingNodeId.value === id) textEditingNodeId.value = ''
  commitHistory()
}

function focusFreeTextEditor(id) {
  textEditingNodeId.value = id
  requestAnimationFrame(() => {
    const editor = textEditorRefs.get(id)
    editor?.focus?.()
    const selection = window.getSelection?.()
    if (selection && editor) {
      const range = document.createRange()
      range.selectNodeContents(editor)
      range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)
    }
  })
}

function updatePlainTextStyle(id, key, value) {
  const node = nodes.value.find((item) => item.id === id && item.data?.mode === 'free-text')
  if (!node) return
  const style = { ...(node.data.style || {}) }
  if (key === 'fontSize') {
    const nextSize = Number(value)
    style.fontSize = Number.isFinite(nextSize) ? Math.min(240, Math.max(12, nextSize)) : 42
  } else {
    style[key] = value
  }
  node.data.style = style
  commitHistory()
}

function finishTextEditing(id, event) {
  updateSmartText(id, event)
  if (textEditingNodeId.value === id) textEditingNodeId.value = ''
}

// 文本节点正文框的滚轮归属，避免「想缩放画布却滚动了文本」互相打架：
// - 编辑态（点了「编辑文字」）：滚轮只滚动文本框内容，不再冒泡给画布去缩放；
// - 非编辑态：文本框不吃滚轮，滚轮继续冒泡给画布做缩放。
function handleTextEditorWheel(id, event) {
  if (textEditingNodeId.value === id) {
    event.stopPropagation()
    return
  }
  event.preventDefault()
}

function toggleTextAgent(id) {
  selectedNodeId.value = id
  expandedNodeId.value = ''
  textEditingNodeId.value = ''
  textAgentNodeId.value = textAgentNodeId.value === id ? '' : id
}

async function requestTextAgent(id) {
  const node = nodes.value.find((item) => item.id === id)
  if (!node || textAgentLoading.value) return
  // 与图像/视频节点完全相同的提示词组装规则：上游文本 + 标记元素内容 + 提示词结构片。
  // 这样卡片里的 @ 引用片才会真正进入发给智能体的内容，而不是只显示在界面上。
  const instruction = effectiveGeneratorPrompt(node)
  if (!instruction) {
    ElMessage.warning('请先输入要发送给智能体的内容')
    return
  }
  const model = textAgentModelFor(node.data)
  const currentText = String(node.data.output?.text || node.data.text || '').trim()
  // 已经生成过文字时，把原文一并带上，让智能体这次读到的是「改哪里」而不是从零重写。
  const message = currentText && currentText !== instruction ? `${instruction}\n原文：${currentText}` : instruction
  textAgentLoading.value = true
  try {
    const result = await requestCanvasAssistant({
      operation: 'generate-text',
      message,
      model,
      provider: textAgentProviderFor(model),
      selectedNode: assistantNodeContext(node),
      upstream: upstreamNodes(id).map(assistantNodeContext),
    })
    // 与 runGenerator 的文本分支保持同一条应用链路：优先取 set_node_text 提案，其次用回复正文。
    // 两者都没有内容时提示重试，绝不把"我打算怎么做"这类说明写进节点。
    const proposalText = String(result.proposals?.find((item) => item.type === 'set_node_text')?.payload?.text || '').trim()
    const produced = proposalText || String(result.reply || '').trim()
    if (Array.isArray(result.warnings) && result.warnings.length) ElMessage.warning(result.warnings[0])
    if (!produced) {
      ElMessage.warning('智能体没有返回可用文字，请换个说法再试')
      return
    }
    const target = nodes.value.find((item) => item.id === id)
    if (target) {
      // 节点正文（smartTextValue）优先读 data.text，其次 data.output.text。
      // 只写 output.text 时，若该节点已有 data.text，界面上会看不到任何变化 —— 所以两处一起写。
      // data.prompt / data.promptParts 保留为「指令」，方便继续让智能体改。
      target.data.output = { text: produced }
      target.data.text = produced
    }
    scheduleSave()
    commitHistory()
    ElMessage.success('已写入智能体生成的文字')
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || error.message || '智能体暂时不可用')
  } finally { textAgentLoading.value = false }
}

async function createImageBranch(id, forceNew = false) {
  const existingEdge = edges.value.find((item) => item.source === id && nodes.value.find((node) => node.id === item.target)?.data?.mode === 'generation-config')
  if (existingEdge && !forceNew) {
    selectedNodeId.value = existingEdge.target
    return
  }
  const source = nodes.value.find((node) => node.id === id)
  if (!source) return
  const newNode = createNode('config', {
    mode: 'generation-config',
    title: '生成配置',
    generationType: 'image',
    prompt: smartTextValue(source.data),
    model: 'agnes-image-2.0-flash',
    ratio: '1:1',
  })
  newNode.position = { x: source.position.x + 430, y: source.position.y }
  appendSelectedNode(newNode)
  await nextTick()
  edges.value = addEdge(edge(`edge-${id}-${newNode.id}`, id, newNode.id), edges.value)
  generationConfigOpen.value = false
  commitHistory()
}

// contenteditable 的占位符判定：只看 DOM 结构不可靠 —— 浏览器把用户键入的文字插成 editor 的
// 裸文本节点时，Vue 托管的空 .inline-prompt-text 依然满足「唯一元素子节点 + :empty」，
// 占位符就会和正文重叠显示。这里按「真实内容」判定：有文字或有 chip 即为非空，切换 .is-empty。
// 用 MutationObserver 自动跟随一切 DOM 变化（键入 / 插入 chip / 删除 chip / 重渲染），
// 避免在每个输入处理函数里手工补同步（漏一处就会退化成同一个 bug）。
const promptPlaceholderObservers = new WeakMap()
function syncPromptEditorPlaceholder(editor) {
  if (!editor || editor.nodeType !== 1 || !editor.classList?.contains('inline-prompt-editor')) return
  const hasChip = Boolean(editor.querySelector('.inline-prompt-reference, .inline-prompt-element'))
  const text = String(editor.textContent || '').replace(/\u200b/g, '').trim()
  editor.classList.toggle('is-empty', !hasChip && !text)
}
function observePromptEditor(editor) {
  if (!editor || editor.nodeType !== 1 || !editor.classList?.contains('inline-prompt-editor')) return
  syncPromptEditorPlaceholder(editor)
  if (promptPlaceholderObservers.has(editor)) return
  const observer = new MutationObserver(() => syncPromptEditorPlaceholder(editor))
  observer.observe(editor, { childList: true, subtree: true, characterData: true })
  promptPlaceholderObservers.set(editor, observer)
}
function unobservePromptEditor(editor) {
  const observer = editor ? promptPlaceholderObservers.get(editor) : null
  if (!observer) return
  observer.disconnect()
  promptPlaceholderObservers.delete(editor)
}

function setGenerationConfigNodePromptRef(id, element) {
  if (element) {
    generationConfigNodePromptRefs.set(id, element)
    observePromptEditor(element)
    return
  }
  unobservePromptEditor(generationConfigNodePromptRefs.get(id))
  generationConfigNodePromptRefs.delete(id)
}

// 浮动「生成配置」面板的输入框是字符串 ref，单独跟随它的挂载。
watch(generationConfigPromptInput, (editor) => {
  if (editor) observePromptEditor(editor)
})

function focusGenerationConfigNodePrompt(id) {
  requestAnimationFrame(() => generationConfigNodePromptRefs.get(id)?.focus?.())
}

function selectGenerationConfigNodeType(id, type) {
  const node = nodes.value.find((item) => item.id === id)
  if (!node) return
  node.data.generationType = type
  node.data.model = type === 'text' ? defaultTextModel() : type === 'video' ? 'agnes-video-v2.0' : 'agnes-image-2.0-flash'
  commitHistory()
}

function updateGenerationConfigNode(id, key, value) {
  const node = nodes.value.find((item) => item.id === id)
  if (!node) return
  node.data[key] = value
  if (key !== 'prompt') commitHistory()
}

async function createGeneratorNodeFromConfig(id) {
  const configNode = nodes.value.find((item) => item.id === id && item.type === 'config')
  if (!configNode) return
  const type = configNode.data.generationType || 'image'
  const nodeType = type === 'text' ? 'text' : type === 'video' ? 'video' : 'image'
  const nodeData = type === 'text'
    ? {
        mode: 'text-generation',
        title: '文字生成',
        prompt: configNode.data.prompt || '',
        referenceRelations: [...(configNode.data.referenceRelations || [])],
        status: 'idle',
        config: { model: configNode.data.model || defaultTextModel() },
      }
    : type === 'video'
      ? {
          mode: 'video-generation',
          title: '视频生成',
          prompt: configNode.data.prompt || '',
          referenceRelations: [...(configNode.data.referenceRelations || [])],
          status: 'idle',
          config: { model: configNode.data.model || 'agnes-video-v2.0', duration: 6, ratio: configNode.data.ratio || '16:9', resolution: '720P' },
        }
      : {
          mode: 'image-generation',
          title: '图像生成',
          prompt: configNode.data.prompt || '',
          referenceRelations: [...(configNode.data.referenceRelations || [])],
          status: 'idle',
          config: { model: configNode.data.model || 'agnes-image-2.0-flash', ratio: configNode.data.ratio || '1:1', resolution: '1080P' },
        }
  const newNode = createNode(nodeType, nodeData)
  newNode.position = { x: configNode.position.x + 430, y: configNode.position.y }
  appendSelectedNode(newNode)
  await nextTick()
  edges.value = addEdge(edge(`edge-${id}-${newNode.id}`, id, newNode.id), edges.value)
  expandedNodeId.value = ['image', 'video'].includes(nodeType) ? newNode.id : ''
  await runGenerator(newNode.id)
  commitHistory()
  ElMessage.success('已生成结果')
}

function openReferenceUpload(id) { referenceTargetNodeId.value = id; referenceUploadMode.value = 'reference'; referenceFileInput.value?.click() }
function openImageNodeUpload(id) { referenceTargetNodeId.value = id; referenceUploadMode.value = 'image'; referenceFileInput.value?.click() }
function openGeneratorOutputUpload(id) { referenceTargetNodeId.value = id; referenceUploadMode.value = 'generator-output'; referenceFileInput.value?.click() }
function openVideoNodeUpload(id) { referenceTargetNodeId.value = id; videoFileInput.value?.click() }
async function handleReferenceUpload(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  const node = nodes.value.find((item) => item.id === referenceTargetNodeId.value)
  if (!file || !node) return
  if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) return ElMessage.warning('请选择不超过 10MB 的图片')
  try {
    const dataUrl = await readFileAsDataUrl(file)
    const asset = await persistCanvasAsset(file, dataUrl)
    if (referenceUploadMode.value === 'image') {
      const dimensions = await readImageDimensions(dataUrl)
      node.data.image = asset.url
      // 保留可直接传给图像模型的 data URL；asset.url 仅用于画布展示和持久化。
      node.data.imageData = dataUrl
      node.data.assetId = asset.id
      node.data.originalName = file.name
      node.data.naturalWidth = dimensions.width
      node.data.naturalHeight = dimensions.height
      node.data.aspectRatio = dimensions.width / dimensions.height
    } else if (referenceUploadMode.value === 'generator-output') {
      const dimensions = await readImageDimensions(dataUrl)
      node.data.output = { ...(node.data.output || {}), url: asset.url, assetId: asset.id, originalName: file.name }
      node.data.outputAspectRatio = dimensions.width / dimensions.height
    } else {
      node.data.referenceImage = asset.url
      node.data.referenceAssetId = asset.id
    }
    commitHistory()
  } catch (error) { ElMessage.error(error?.response?.data?.message || error.message || '参考图上传失败') }
}
function generatorReferenceImage(data, id) { return data?.referenceImage || connectedReferenceImage(id) }
function showCameraPlaceholder() { ElMessage.info('摄像机功能暂未开放') }
async function handleVideoUpload(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  const node = nodes.value.find((item) => item.id === referenceTargetNodeId.value)
  if (!file || !node) return
  if (!file.type.startsWith('video/')) return ElMessage.warning('请选择视频文件')
  if (file.size > 50 * 1024 * 1024) return ElMessage.warning('视频大小不能超过 50MB')
  try {
    const dataUrl = await readFileAsDataUrl(file)
    const asset = await persistCanvasAsset(file, dataUrl, 'canvas-video')
    const dimensions = await readVideoDimensions(dataUrl)
    node.data.output = { url: asset.url, assetId: asset.id, originalName: file.name }
    node.data.outputAspectRatio = dimensions.width / dimensions.height
    node.data.status = 'succeeded'
    node.data.error = ''
    commitHistory()
    ElMessage.success('视频已加入节点')
  } catch (error) { ElMessage.error(error?.response?.data?.message || error.message || '视频上传失败') }
}
function showNodeInfo(id) { const node = nodes.value.find((item) => item.id === id); ElMessage.info(`${node?.data?.title || '节点'} · ${node?.data?.mode || node?.type || ''}`) }
function confirmAssetStored(id) { const node = nodes.value.find((item) => item.id === id); ElMessage.info(node?.data?.output?.assetId ? '图片已保存到个人云端素材' : '当前图片尚未生成或保存') }
function downloadGeneratedImage(id) { const node = nodes.value.find((item) => item.id === id); if (!node?.data?.output?.url) return ElMessage.warning('当前没有可下载图片'); const link = document.createElement('a'); link.href = node.data.output.url; link.download = '画布生成图片.png'; link.click() }
async function copyNodePrompt(id) { const node = nodes.value.find((item) => item.id === id); const prompt = effectiveGeneratorPrompt(node); if (!prompt) return ElMessage.warning('当前没有提示词'); await navigator.clipboard.writeText(prompt); ElMessage.success('提示词已复制') }
function imageGeneratorNodeStyle(data = {}) {
  const rawRatio = Number(data.outputAspectRatio || parseRatio(data.config?.ratio || '1:1'))
  const ratio = Math.min(4, Math.max(0.25, Number.isFinite(rawRatio) ? rawRatio : 1))
  let width = ratio >= 1 ? Math.min(430, Math.max(230, Math.round(250 * ratio))) : Math.max(190, Math.round(300 * ratio))
  let height = Math.round(width / ratio)
  if (height > 430) {
    height = 430
    width = Math.max(190, Math.round(height * ratio))
  }
  return { width: `${width}px`, '--image-preview-height': `${height}px` }
}
function videoGeneratorNodeStyle(data = {}) {
  const rawRatio = Number(data.outputAspectRatio || parseRatio(data.config?.ratio || '16:9'))
  const ratio = Math.min(2.4, Math.max(.56, Number.isFinite(rawRatio) ? rawRatio : 16 / 9))
  const width = Math.round(Math.min(520, Math.max(300, ratio >= 1 ? 300 * ratio : 300)))
  return { width: `${width}px`, '--video-preview-height': `${Math.round(width / ratio)}px` }
}
function parseRatio(value) { const [w, h] = String(value || '1:1').split(':').map(Number); return w > 0 && h > 0 ? w / h : 1 }

function updateTextStyle(id, key, value) {
  const node = nodes.value.find((item) => item.id === id)
  if (!node) return
  node.data.style = { ...(node.data.style || {}), [key]: value }
  commitHistory()
}

function toggleTextBold(id) {
  const node = nodes.value.find((item) => item.id === id)
  if (!node) return
  updateTextStyle(id, 'fontWeight', node.data.style?.fontWeight === 700 ? 400 : 700)
}

function captureTextSize(id, event) {
  const node = nodes.value.find((item) => item.id === id)
  if (!node) return
  const width = Math.round(event.currentTarget.offsetWidth)
  const minHeight = Math.round(event.currentTarget.offsetHeight)
  if (width === node.data.style?.width && minHeight === node.data.style?.minHeight) return
  node.data.style = { ...(node.data.style || {}), width, minHeight }
  commitHistory()
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('无法读取图片文件'))
    reader.readAsDataURL(file)
  })
}

function readImageDimensions(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 })
    image.onerror = () => reject(new Error('无法识别图片尺寸'))
    image.src = src
  })
}

function readVideoDimensions(src) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => resolve({ width: video.videoWidth || 16, height: video.videoHeight || 9 })
    video.onerror = () => reject(new Error('无法识别视频尺寸'))
    video.src = src
  })
}

async function persistCanvasAsset(file, dataUrl, kind = 'canvas-image') {
  // 玩法工作流由管理员编辑，图片属于工作流配置，不应走用户个人资产接口。
  if (!SERVER_AUTH_MODE || props.adminMode) return { id: '', url: dataUrl }
  const { data } = await apiClient.post('/me/assets', {
    kind,
    originalName: file.name,
    mimeType: file.type,
    base64: dataUrl,
  })
  const id = data.asset?.id
  if (!id) throw new Error('服务端没有返回素材编号')
  return { id, url: `/api/assets/${encodeURIComponent(id)}` }
}

// ---- 我的素材库（画布内弹窗）----
// 用户明确要求：左侧「我的素材库」不能跳到外面的素材库页面，要在画布内弹出来。
// 素材来源跟绘画页的参考图弹窗保持同一套口径：生成作品 + 上传参考图 + 手绘稿，
// 只有能取到真实图片地址的条目才列出来（视频/3D/画布没有图片，点进画布也没意义）。
const materialLibraryOpen = ref(false)
const materialLibraryTab = ref('all')
const { sketchMaterials, sketchMaterialsLoading, loadSketchMaterials } = useSketchMaterials()

// 图片地址能取到 ≠ 图片能打开。生成作品里有些存的是火山 TOS 临时签名链接（有效期 24 小时），
// 过期后直连 403，卡片就变成浏览器的破图图标。这种卡片点下去会在画布上加一个空节点，
// 所以一旦图片加载失败，就把这条记下来、从列表里剔掉，连页签数量一起减掉。
// 记的是「编号 + 地址」而不是只记编号：签名链接过期后重新生成的作品会拿到新地址，
// 地址一变就当新素材重新试一次，不会被上一次的失败永久封掉。
const brokenMaterialKeys = ref(new Set())

function materialKey(item) {
  return `${item?.id || ''}::${item?.preview || ''}`
}

function markMaterialBroken(item) {
  const key = materialKey(item)
  if (!item?.id || brokenMaterialKeys.value.has(key)) return
  const next = new Set(brokenMaterialKeys.value)
  next.add(key)
  brokenMaterialKeys.value = next
}

function libraryPreviewUrl(...candidates) {
  const direct = candidates.find(Boolean)
  return extractImageUrl(direct)
}

const materialLibraryItems = computed(() => {
  const items = []
  projectStore.projects.forEach((project) => {
    const projectName = String(project.title || '未命名项目').trim()
    ;(project.versions || []).forEach((version, index) => {
      const preview = libraryPreviewUrl(version.imageUrl, version.preview, version.url, version.background)
      if (!preview) return
      items.push({
        id: `version-${project.id}-${version.id || index}`,
        kind: 'artwork',
        title: version.title || `${projectName} · V${index + 1}`,
        preview,
      })
    })
    ;(project.referenceImages || []).forEach((reference, index) => {
      const preview = libraryPreviewUrl(reference.preview, reference.imageUrl, reference.url)
      if (!preview) return
      items.push({
        id: `reference-${project.id}-${reference.id || index}`,
        kind: 'upload',
        title: reference.name || `${projectName} · 参考图${index + 1}`,
        preview,
      })
    })
  })
  sketchMaterials.value.forEach((material) => {
    if (!material?.preview) return
    items.push({ id: material.id, kind: 'sketch', title: material.title || '手绘稿', preview: material.preview })
  })
  return items.filter((item) => !brokenMaterialKeys.value.has(materialKey(item)))
})

const materialLibraryTabs = computed(() => [
  { value: 'all', label: '全部', count: materialLibraryItems.value.length },
  { value: 'artwork', label: '生成作品', count: materialLibraryItems.value.filter((item) => item.kind === 'artwork').length },
  { value: 'upload', label: '上传素材', count: materialLibraryItems.value.filter((item) => item.kind === 'upload').length },
  { value: 'sketch', label: '手绘稿', count: materialLibraryItems.value.filter((item) => item.kind === 'sketch').length },
])

const visibleMaterialLibraryItems = computed(() => (materialLibraryTab.value === 'all'
  ? materialLibraryItems.value
  : materialLibraryItems.value.filter((item) => item.kind === materialLibraryTab.value)))

function openMaterialLibrary() {
  createMenuOpen.value = false
  materialLibraryTab.value = 'all'
  materialLibraryOpen.value = true
  // 手绘稿不在 projectStore 里，每次打开重新拉一次，新存的手绘稿才能立刻看到。
  loadSketchMaterials()
}

/**
 * 点一张素材 → 在画布上新建一个「上传」节点。
 * 复用上传节点类型（它就是画布里的素材起点），下游可以直接连线生成。
 * 不重新上传一遍文件：素材本身已有稳定地址，再存一份只会多出重复资产。
 */
async function addLibraryMaterialToCanvas(item) {
  if (!item?.preview) {
    ElMessage.warning('这张素材没有可用的图片，无法加入画布')
    return
  }
  const newNode = createNode('upload', {
    title: item.title || '素材库图片',
    image: item.preview,
    originalName: item.title || '素材库图片',
  })
  appendSelectedNode(newNode)
  materialLibraryOpen.value = false
  commitHistory()
  await hydrateImageMetadata(newNode)
  ElMessage.success('已加入画布')
}

function addTextToPortfolio(id) {
  const node = nodes.value.find((item) => item.id === id)
  const text = smartTextValue(node?.data).trim()
  if (!node || !text) {
    ElMessage.warning('请先在文本框中输入内容')
    return
  }
  const saved = projectStore.saveText(sourceProject.id, {
    id: `text-${id}`,
    title: `${sourceProject.title || '未命名项目'} · 文本`,
    text,
    sourceNodeId: id,
  })
  if (!saved) {
    ElMessage.warning('当前项目尚未准备好，暂时无法保存文本')
    return
  }
  ElMessage.success('文本已添加到素材库')
}

async function hydrateImageMetadata(node, force = false) {
  if (!node?.data?.image || (!force && node.data.aspectRatio)) return
  try {
    const size = await readImageDimensions(node.data.image)
    node.data = {
      ...node.data,
      naturalWidth: size.width,
      naturalHeight: size.height,
      aspectRatio: size.width / size.height,
    }
  } catch {}
}

function imageLayout(data = {}) {
  const rawRatio = Number(data.aspectRatio || (data.naturalWidth && data.naturalHeight ? data.naturalWidth / data.naturalHeight : 1))
  const ratio = Math.min(6, Math.max(0.16, Number.isFinite(rawRatio) ? rawRatio : 1))
  let width = ratio >= 1 ? Math.min(360, Math.max(230, Math.round(230 * ratio))) : Math.max(170, Math.round(320 * ratio))
  let height = Math.round(width / ratio)
  if (height > 360) {
    height = 360
    width = Math.max(170, Math.round(height * ratio))
  }
  return { width, height }
}

function uploadNodeStyle(data) {
  const { width } = imageLayout(data)
  return { width: `${width}px` }
}

function imageFrameStyle(data) {
  const { height } = imageLayout(data)
  return { height: `${height}px` }
}

function textNodeShellStyle(data) {
  return { width: `${Math.max(180, Number(data.style?.width || 360))}px` }
}

function textEditorStyle(data) {
  const style = data.style || {}
  return {
    width: `${Math.max(180, Number(style.width || 360))}px`,
    minHeight: `${Math.max(52, Number(style.minHeight || 72))}px`,
    color: style.color || '#20242b',
    fontFamily: style.fontFamily || 'Microsoft YaHei',
    fontSize: `${Math.max(12, Number(style.fontSize || 42))}px`,
    fontWeight: Number(style.fontWeight || 700),
    textAlign: style.textAlign || 'left',
  }
}

function isGeneratorNode(node) {
  return Boolean(node && ['text-generation', 'image-generation', 'video-generation'].includes(node.data?.mode))
}

function generatorModels(node) {
  // 文本节点只允许选文本模型（与后台「文本模型」配置一致）；图像/视频同理各取本类模型。
  if (node?.data?.mode === 'text-generation' || node?.type === 'text') return configuredTextModels.value
  if (node?.type === 'video' || node?.type === 'video-generation') return configuredVideoModels.value
  return configuredImageModels.value
}

// 文本节点编辑卡片可选的文本模型（来源：后台已配置的文本模型，见 loadConfiguredModels）。
const textAgentModels = computed(() => configuredTextModels.value)
const TEXT_AGENT_PLACEHOLDER = '告诉智能体如何修改这段文字，可用下方 @ 引用上游素材'

function textAgentModelFor(data = {}) {
  const configured = configuredTextModels.value
  const current = String(data.config?.model || '')
  if (configured.includes(current)) return current
  return configured[0] || ''
}

function textAgentProviderFor(model) {
  return configuredModelProviders.value[model] || ''
}

// 文本节点的新建默认模型：取后台已配置的第一个文本模型（原先写死的「创作 Agent」并不是真实模型名）。
function defaultTextModel() {
  return configuredTextModels.value[0] || ''
}

function defaultGeneratorModel(node) {
  return generatorModels(node)[0]
}

function generatorModelLabel(model) {
  const labels = {
    '创作 Agent': '创作智能体',
    '提示词专家': '提示词专家',
    'agnes-video-v2.0': 'Agnes 视频 2.0',
    'agnes-image-2.0-flash': 'Agnes 图像 2.0 极速版',
    'doubao-seedream-4-0-250828': '豆包 Seedream 4.0',
    'gpt-image-1': 'GPT Image 1',
  }
  return configuredModelLabels.value[model] || labels[model] || model
}

function imageProviderForModel(model = '') {
  if (configuredModelProviders.value[model]) return configuredModelProviders.value[model]
  if (String(model).startsWith('doubao-')) return 'volcengine'
  if (String(model).startsWith('gpt-image')) return 'openai'
  return 'agnes'
}

function updateGeneratorPrompt(id, event) {
  const node = nodes.value.find((item) => item.id === id)
  if (!node) return
  node.data.prompt = event.target.value
  node.data.error = ''
}

function inlinePromptText(event) {
  return inlinePromptPartsFromEditor(event).filter((part) => part.type === 'text').map((part) => part.text).join('').replace(/\u200b/g, '').slice(0, 500)
}

// 递归收集输入框里的结构片。
// 必须递归：模板会把纯文本包进 <span class="inline-prompt-text">，而光标插入的 chip
// 有可能落进这类包裹元素内部 —— 只读第 1 层会把它当成纯文本，导致引用片被永久降级（数据损坏）。
function collectInlinePromptParts(root) {
  const parts = []
  const visit = (node) => {
    if (!node) return
    if (node.nodeType === 3) {
      const text = String(node.textContent || '').replace(/\u200b/g, '')
      if (text) parts.push({ type: 'text', text })
      return
    }
    if (node.nodeType !== 1) return
    // element 片同时带有 inline-prompt-reference 类（复用视觉体系），必须先判断 element，避免被当成 reference。
    if (node.classList?.contains('inline-prompt-element')) {
      parts.push({ type: 'element', id: node.dataset.elementId || '' })
      return
    }
    if (node.classList?.contains('inline-prompt-reference')) {
      parts.push({ type: 'reference', id: node.dataset.referenceId || '' })
      return
    }
    Array.from(node.childNodes || []).forEach(visit)
  }
  Array.from(root.childNodes || []).forEach(visit)
  // 合并相邻文本片，保证 promptParts 结构干净。
  return parts.reduce((acc, part) => {
    const last = acc[acc.length - 1]
    if (part.type === 'text' && last?.type === 'text') last.text += part.text
    else acc.push({ ...part })
    return acc
  }, [])
}

function inlinePromptPartsFromEditor(event) {
  const editor = event?.currentTarget
  if (!editor) return []
  return collectInlinePromptParts(editor).filter((part) => (part.type === 'reference' || part.type === 'element') ? part.id : part.text)
}

// 输入框 DOM 的重挂钥匙：chip 被浏览器从 DOM 里删掉后，Vue 的 vdom 仍以为它还在，
// 单纯改数据不会把节点重新插回真实 DOM（chip 会「数据在、看不见」）。补回 element 片时
// 递增该节点的钥匙，强制这一个输入框按 promptParts 整体重渲染一次，让 chip 真正回到界面上。
const promptEditorDomKeys = reactive({})
function promptEditorDomKey(id) {
  return `prompt-editor-${id}-${promptEditorDomKeys[id] || 0}`
}

// 数据优先护栏：禁止「DOM 回读把结构片（reference / element）静默降级掉」。
//
// 为什么需要它：输入框是 contenteditable，chip 是 contenteditable=false 的原子节点。
// DOM 回读（inlinePromptPartsFromEditor）是「按界面上现在有什么」重写 promptParts，
// 一旦 chip 在这之前被浏览器从 DOM 里拿掉，回读结果里就没有它，promptParts 被整块覆盖 → 片永久消失，
// 而底层数据（连线 / data.elements）其实好端端地还在。触发路径都很日常：
//   · 光标紧挨 chip 退格、Ctrl+A 全选后重新打字 → chip 被整块删掉；
//   · chip 曾经被拖拽换位（真实 DOM 被手工移动过）→ Vue 的 vdom 与真实 DOM 不同步，下一次 patch 顺手删掉它；
//   · 点其它按钮（如「标记」）让输入框失焦 → 立刻触发一次 blur 回读。
// 现象因此很像「偶发」：第 5 步刚确认引用片还在，点一下「标记」就没了。
//
// 判定哪些片「应该还在」——不看 DOM，看底层事实：
//   · element 片：data.elements 里还有这个元素（图上仍显示徽标，就说明这个标记没被删）；
//   · reference 片：连线还连着（@ 引用的唯一来源是连线，要取消引用应该断开连线，而不是删 chip）。
// 只要底层事实还在，就一律补回 promptParts（保持已有片原位，缺失的按原保存顺序追加末尾）。
function withPreservedStructureParts(parts, nodeId) {
  const list = Array.isArray(parts) ? parts : []
  const node = nodes.value.find((item) => item.id === nodeId)
  if (!node) return list
  const data = node.data || {}
  const elements = Array.isArray(data.elements) ? data.elements : []
  const elementIds = new Set(elements.filter((element) => element?.id).map((element) => String(element.id)))
  // 引用片的合法性只取决于「这条上游连线还在不在」，所以要用当前连线实时算，不能信老数据。
  // 注意不能拿 nodeReferenceChips() 的返回值当白名单：它只收录「当前有内容」的节点，
  // 上游节点内容暂时被清空（重新生成中）时会把合法引用误判成失效而丢掉。
  const upstreamIds = new Set()
  const walk = (startId) => {
    const queue = [startId]
    while (queue.length) {
      const current = queue.shift()
      edges.value.filter((edge) => edge.target === current).forEach((edge) => {
        if (upstreamIds.has(edge.source) || edge.source === nodeId) return
        upstreamIds.add(edge.source)
        queue.push(edge.source)
      })
    }
  }
  walk(nodeId)
  const referenceIds = upstreamIds
  const shouldKeep = (part) => {
    if (part?.type === 'element') return elementIds.has(String(part.id))
    if (part?.type === 'reference') return referenceIds.has(String(part.id))
    return false
  }
  // 反向也要管：用户主动断开连线（或删掉标记元素）之后，留在数据里的结构片就是脏数据。
  // 只「不补回」是不够的——脏片会一直躺在 promptParts 里，靠的是刷新才看不见，属于数据与认知不一致。
  // 剪枝的判据必须仍然是底层事实，不能改成「DOM 里还有没有这个 chip」：
  // 上游节点内容暂时为空时 UI 本来就不渲染该 chip，但那条引用是合法的，必须保住。
  //
  // 【注意】剪枝【不能】递增 promptEditorDomKeys：被剪掉的片本来就渲染不出来（渲染与剪枝用的是同一套
  // 底层事实，referenceMap / elementMap 查不到就 return null），所以界面与数据始终一致，无需重渲染。
  // 而按键重渲染会把这个输入框整体换掉——用户正在打字时等于光标被抢、输入中断（实测会让
  // DOM 查询瞬间取不到 .node-prompt-input）。只有「补回」才需要换钥匙。
  // 【注意】没有脏片时必须原样返回 list 本身（同一个数组引用），绝不能返回 filter 产生的新数组：
  // 每次键入都会走这里，换成新引用就等于每次都让 promptParts 「变了」→ 输入框整块重渲染 →
  // 光标被打断、正在输入的字丢，实测会让后续按钮点击也命不中。
  const hasStale = list.some((part) => (part?.type === 'reference' || part?.type === 'element') && !shouldKeep(part))
  const kept = hasStale
    ? list.filter((part) => (part?.type === 'reference' || part?.type === 'element' ? shouldKeep(part) : true))
    : list
  const keyOf = (part) => `${part.type}:${part.id}`
  const present = new Set(kept.filter(shouldKeep).map(keyOf))
  const saved = Array.isArray(data.promptParts) ? data.promptParts : []
  const missing = []
  const seen = new Set()
  saved.forEach((part) => {
    if (!shouldKeep(part)) return
    const key = keyOf(part)
    if (present.has(key) || seen.has(key)) return
    seen.add(key)
    missing.push({ type: part.type, id: String(part.id) })
  })
  if (!missing.length) return kept
  // chip 已被浏览器从真实 DOM 删掉：换钥匙重渲染，把补回的片真正显示出来，并把光标收回输入框末尾。
  promptEditorDomKeys[nodeId] = (promptEditorDomKeys[nodeId] || 0) + 1
  nextTick(() => {
    const editor = generationConfigNodePromptRefs.get(nodeId)
    if (!editor) return
    editor.focus?.()
    const range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
    const selection = window.getSelection()
    if (!selection) return
    selection.removeAllRanges()
    selection.addRange(range)
  })
  return [...kept, ...missing]
}

function inlinePromptParts(data = {}, id = '', includeSelf = false, includeReferences = false, autoFillReferences = true) {
  // 引用素材默认在输入框外单独展示，避免与用户真正输入的提示词重复、混淆。
  // 节点内输入框用 autoFillReferences=false：只在用户手动插入过引用（promptParts 有记录）时才渲染引用片，
  // 否则老画布一打开就会把所有上游自动排到文字前面，外观被改得面目全非。
  if (!includeReferences) return [{ type: 'text', text: data.prompt || '', key: 'prompt-text' }]
  const references = nodeReferenceChips(id, includeSelf)
  const referenceMap = new Map(references.map((reference) => [reference.id, reference]))
  const elements = Array.isArray(data.elements) ? data.elements : []
  const elementMap = new Map(elements.map((element) => [element.id, element]))
  const saved = Array.isArray(data.promptParts) ? data.promptParts : []
  if (!saved.length) {
    if (!autoFillReferences) return [{ type: 'text', text: data.prompt || '', key: 'prompt-text' }]
    return [
      ...references.map((reference) => ({ type: 'reference', id: reference.id, reference, key: `reference-${reference.id}` })),
      { type: 'text', text: data.prompt || '', key: 'prompt-text' },
    ]
  }
  const represented = new Set()
  const parts = saved.map((part, index) => {
    // 兼容老画布：遇到未知 type（含历史遗留类型）必须安全跳过，绝不能崩、也不能改变既有外观。
    const type = part?.type
    if (type && type !== 'text' && type !== 'reference' && type !== 'element') return null
    if (type === 'element') {
      // 标记元素优先按 id 从 data.elements 还原；老数据若自带完整字段则直接使用。
      const element = elementMap.get(part.id) || (part.thumb ? part : null)
      if (!element) return null
      // 编号与图上徽标一一对应：取该元素在 data.elements 中的次序（从 1 开始）。
      const position = elements.findIndex((item) => item.id === element.id)
      return { type: 'element', id: element.id, element, index: position < 0 ? 0 : position + 1, key: `element-${element.id}-${index}` }
    }
    if (type === 'reference') {
      const reference = referenceMap.get(part.id)
      if (!reference) return null
      represented.add(reference.id)
      return { type: 'reference', id: reference.id, reference, key: `reference-${reference.id}-${index}` }
    }
    return { type: 'text', text: String(part?.text || ''), key: `prompt-text-${index}` }
  }).filter(Boolean)
  if (autoFillReferences) {
    references.forEach((reference) => {
      if (!represented.has(reference.id)) parts.splice(Math.max(parts.length - 1, 0), 0, { type: 'reference', id: reference.id, reference, key: `reference-${reference.id}-new` })
    })
  }
  if (!parts.some((part) => part.type === 'text')) parts.push({ type: 'text', text: data.prompt || '', key: 'prompt-text-fallback' })
  return parts
}

function updateInlineGeneratorPrompt(id, event) {
  const node = nodes.value.find((item) => item.id === id)
  if (!node) return
  const rawData = toRaw(node.data)
  rawData.promptParts = withPreservedStructureParts(inlinePromptPartsFromEditor(event), id)
  rawData.prompt = inlinePromptText(event)
  rawData.error = ''
}

function updateInlineGenerationConfigNode(id, event) {
  const node = nodes.value.find((item) => item.id === id)
  if (!node) return
  const rawData = toRaw(node.data)
  rawData.promptParts = withPreservedStructureParts(inlinePromptPartsFromEditor(event), id)
  rawData.prompt = inlinePromptText(event)
}

function updateInlineFloatingPrompt(event) {
  const rawConfig = toRaw(generationConfig)
  rawConfig.promptParts = inlinePromptPartsFromEditor(event)
  rawConfig.prompt = inlinePromptText(event)
}

function commitInlinePrompt(id, event) {
  if (id) updateInlineGeneratorPrompt(id, event)
  else updateInlineFloatingPrompt(event)
  scheduleSave()
  commitHistory()
}

// 一个出图节点最多出几张。上限和后台 MAX_GENERATION_COUNT 保持一致。
const GENERATOR_MAX_COUNT = 4
const GENERATOR_COUNT_OPTIONS = [1, 2, 3, 4]

function generatorCount(node) {
  const value = Number(node?.data?.config?.count)
  if (!Number.isFinite(value) || value < 1) return 1
  return Math.min(GENERATOR_MAX_COUNT, Math.round(value))
}

function updateGeneratorConfig(id, key, value) {
  const node = nodes.value.find((item) => item.id === id)
  if (!node) return
  node.data.config = { ...(node.data.config || {}), [key]: value }
  commitHistory()
}

function videoPresetValue(data = {}) {
  const { resolution = '720P', ratio = '16:9', duration = 6 } = data.config || {}
  return `${resolution}|${ratio}|${duration}`
}

function updateVideoPreset(id, value) {
  const [resolution, ratio, duration] = String(value).split('|')
  const node = nodes.value.find((item) => item.id === id)
  if (!node) return
  node.data.config = { ...(node.data.config || {}), resolution, ratio, duration: Number(duration) }
  commitHistory()
}

function upstreamNodes(id) {
  const sourceIds = edges.value.filter((item) => item.target === id).map((item) => item.source)
  return sourceIds.map((sourceId) => nodes.value.find((node) => node.id === sourceId)).filter(Boolean)
}

const defaultNodeNames = {
  upload: '图片',
  video: '视频',
  image: '图像',
  text: '文本',
  prompt: '文字生成',
  config: '生成配置',
  result: '生成结果',
}

function getNodeDisplayName(data = {}, type = '') {
  if (data.displayName) return data.displayName
  const outputName = data.output?.originalName || data.output?.fileName
  if (type === 'upload') return data.originalName || data.title || defaultNodeNames.upload
  if (type === 'video') return outputName || data.originalName || data.title || defaultNodeNames.video
  if (type === 'image' || type === 'result') return outputName || data.originalName || data.title || (type === 'result' ? defaultNodeNames.result : defaultNodeNames.image)
  if (type === 'text') return data.title || (data.mode === 'free-text' ? '文字' : defaultNodeNames.text)
  return data.title || (type === 'group' ? '分组' : defaultNodeNames[type]) || defaultNodeNames.config
}

function renameNode(id, title) {
  const node = nodes.value.find((item) => item.id === id)
  const name = title.trim().slice(0, 50)
  if (!node || !name || name === getNodeDisplayName(node.data, node.type)) return
  node.data = { ...node.data, title: name, displayName: name }
  commitHistory()
}

function nodeReferenceDescriptor(node) {
  if (!node) return null
  const data = node.data || {}
  const image = node.type === 'upload' ? data.image : node.type === 'image' || (node.type === 'result' && data.mode === 'image-result') ? (data.output?.url || data.image) : ''
  const video = node.type === 'video' && data.output?.url ? data.output.url : ''
  const text = node.type === 'text' || node.type === 'prompt' ? smartTextValue(data) : ''
  if (image) return { id: node.id, kind: 'image', image, video: '', text: '', icon: markRaw(Picture), name: getNodeDisplayName(data, node.type === 'upload' ? 'upload' : node.type === 'result' ? 'result' : 'image') }
  if (video) return { id: node.id, kind: 'video', image: '', video, text: '', icon: markRaw(VideoCamera), name: getNodeDisplayName(data, 'video') }
  if (text) return { id: node.id, kind: 'text', image: '', video: '', text, icon: markRaw(EditPen), name: getNodeDisplayName(data, 'text') }
  return null
}

function nodeReferenceChips(id, includeSelf = false) {
  const visited = new Set()
  const results = []
  const add = (node) => {
    const reference = nodeReferenceDescriptor(node)
    if (reference && !results.some((item) => item.id === reference.id)) results.push(reference)
  }
  const walk = (nodeId) => {
    if (!nodeId || visited.has(nodeId)) return
    visited.add(nodeId)
    upstreamNodes(nodeId).forEach((node) => { add(node); walk(node.id) })
  }
  if (includeSelf) add(nodes.value.find((node) => node.id === id))
  walk(id)
  return results.slice(0, 12)
}

function directNodeReferenceChips(id, includeSelf = false) {
  const results = []
  const add = (node) => {
    const reference = nodeReferenceDescriptor(node)
    if (reference && !results.some((item) => item.id === reference.id)) results.push(reference)
  }
  if (includeSelf) add(nodes.value.find((node) => node.id === id))
  upstreamNodes(id).forEach(add)
  return results.slice(0, 8)
}

function hasDirectReferenceEdge(targetId, sourceId) {
  if (!targetId || !sourceId || targetId === sourceId) return false
  return edges.value.some((item) => item.source === sourceId && item.target === targetId)
}

function removeReferenceChip(targetId, sourceId) {
  if (!hasDirectReferenceEdge(targetId, sourceId)) return
  edges.value = edges.value.filter((item) => !(item.source === sourceId && item.target === targetId))
  commitHistory()
}

function openUpstreamPreview(reference, event) {
  if (!reference) return
  const rect = event?.currentTarget?.getBoundingClientRect?.()
  upstreamPreviewAnchor.value = rect
    ? { centerX: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom }
    : null
  upstreamPreview.value = reference
}

function closeUpstreamPreview() {
  upstreamPreview.value = null
  upstreamPreviewAnchor.value = null
}

// 把输入框 DOM 的变化同步回节点数据：引用与文字的顺序统一保存在 promptParts 里
function syncPromptFromEditor(nodeId, editor) {
  const node = nodes.value.find((item) => item.id === nodeId)
  if (!node || !editor) return
  const event = { currentTarget: editor }
  const rawData = toRaw(node.data)
  rawData.promptParts = withPreservedStructureParts(inlinePromptPartsFromEditor(event), nodeId)
  rawData.prompt = inlinePromptText(event)
  rawData.error = ''
  scheduleSave()
  commitHistory()
}

// 在光标处插入引用片，并强制让 chip 成为 .inline-prompt-editor 的直接子节点。
// 为什么必须这样：模板把纯文本包进 <span class="inline-prompt-text">，一旦 chip 落进这个壳
//（光标停在文字中间/末尾时就会发生），读取逻辑会把整个壳当纯文本读走，引用片就被永久降级成文本。
function insertChipAtEditorCaret(editor, chip, range) {
  const container = range?.startContainer
  const offset = Number(range?.startOffset) || 0
  if (!container) { editor.appendChild(chip); return }
  const isChip = (node) => node?.nodeType === 1 && (node.classList?.contains('inline-prompt-reference') || node.classList?.contains('inline-prompt-element'))
  // 光标落在 editor 本身：按子节点序号插入
  if (container === editor) {
    editor.insertBefore(chip, editor.childNodes[Math.min(Math.max(offset, 0), editor.childNodes.length)] || null)
    return
  }
  // 光标在文本节点内：按光标把文本拆成「前 / 后」两段
  if (container.nodeType === 3) {
    const length = (container.textContent || '').length
    const after = container.splitText(Math.min(Math.max(offset, 0), length))
    let top = after
    while (top.parentNode && top.parentNode !== editor) top = top.parentNode
    if (top.parentNode !== editor) { editor.appendChild(chip); return }
    if (top !== after) {
      if (isChip(top)) {
        // 光标在已有 chip 内部：直接插到该 chip 之后，不要复制 chip 外壳
        editor.insertBefore(chip, top.nextSibling)
        return
      }
      // 被模板壳（如 inline-prompt-text）包着：复制一层同款空壳，把尾部文本提到 editor 层
      const shell = top.cloneNode(false)
      shell.appendChild(after)
      editor.insertBefore(shell, top.nextSibling)
      top = shell
    }
    editor.insertBefore(chip, top)
    return
  }
  // 光标落在元素节点上：插到「光标所在元素」之后（同样提升到 editor 层）
  let block = container
  while (block.parentNode && block.parentNode !== editor) block = block.parentNode
  if (block.parentNode === editor && block !== editor) editor.insertBefore(chip, block.nextSibling)
  else editor.appendChild(chip)
}

// 点 @ 把上游引用插入到节点提示词输入框的光标处；未聚焦或无选区时追加到末尾。
// 允许同一上游重复插入；插入后的引用片可在输入框内拖动换位。
//
// 数据优先（与 element chip 走完全同一套机制）：只改 node.data.promptParts，chip 由模板渲染，
// promptParts 是唯一数据源。绝不手工往 DOM 里塞 chip —— 手工插入的节点 Vue 并不知道，
// 一旦发生重渲染就会和模板渲染出的 chip 叠成两个（数据也变成两个引用）；
// 而且手工插的 chip 很容易被光标带进模板渲染出的 <span class="inline-prompt-text"> 里，
// 读取时整个壳会被当成纯文本，引用片被永久降级成文本。
function insertReferenceToPrompt(nodeId, reference) {
  const node = nodes.value.find((item) => item.id === nodeId)
  if (!node || !reference) return
  // 光标位置：优先取「此刻仍在输入框内」的真实选区，其次取最近一次记录的光标。
  const caret = capturePromptCaret(nodeId) || lastPromptCaretByNode.get(nodeId) || null
  // 先把输入框「当前真实内容」回读进数据。点 @ 不会让输入框失焦（按钮上有 @pointerdown.stop），
  // 所以此刻 data 里可能还缺用户刚打进去的文字；不回读就直接插引用片，数据与界面会各说一套。
  const editorBeforeInsert = generationConfigNodePromptRefs.get(nodeId)
  if (editorBeforeInsert) {
    const event = { currentTarget: editorBeforeInsert }
    const rawData = toRaw(node.data)
    rawData.promptParts = withPreservedStructureParts(inlinePromptPartsFromEditor(event), nodeId)
    rawData.prompt = inlinePromptText(event)
  }
  const parts = promptPartsWithPart(node, { type: 'reference', id: reference.id }, caret)
  node.data.promptParts = parts
  node.data.prompt = promptPartsText(parts)
  node.data.error = ''
  // 换钥匙整块重渲染：浏览器键入时留下的是「原生文字节点」，普通 patch 不会清掉它，
  // 它会与 Vue 按数据画出的文字块并存（用户看到「同一段提示词显示两遍」、刷新后仍在）。
  promptEditorDomKeys[nodeId] = (promptEditorDomKeys[nodeId] || 0) + 1
  scheduleSave()
  commitHistory()
  // 渲染完成后把光标放到新插入的 chip 之后，方便继续输入（best-effort，不参与数据正确性）。
  nextTick(() => {
    const editor = generationConfigNodePromptRefs.get(nodeId)
    if (!editor) return
    editor.focus?.()
    const chips = editor.querySelectorAll(`[data-reference-id="${reference.id}"]`)
    const target = chips[chips.length - 1]
    if (!target) return
    const range = document.createRange()
    range.setStartAfter(target)
    range.collapse(true)
    const selection = window.getSelection()
    if (!selection) return
    selection.removeAllRanges()
    selection.addRange(range)
  })
}

// ---- 引用片在提示词输入框内直接拖动换位 ----
// 拖拽状态不需要参与渲染，用普通变量即可（避免把 DOM 节点包进响应式代理）
let promptDrag = null
const promptDropIndicator = ref(null)

function promptEditorNodeId(editor) {
  if (!editor) return ''
  for (const [id, element] of generationConfigNodePromptRefs.entries()) {
    if (element === editor) return id
  }
  return ''
}

function caretRangeAtPoint(x, y) {
  if (typeof document.caretRangeFromPoint === 'function') return document.caretRangeFromPoint(x, y)
  if (typeof document.caretPositionFromPoint === 'function') {
    const position = document.caretPositionFromPoint(x, y)
    if (!position) return null
    const range = document.createRange()
    range.setStart(position.offsetNode, position.offset)
    range.collapse(true)
    return range
  }
  return null
}

function handlePromptDragStart(event) {
  const target = event.target
  if (!target?.classList?.contains('inline-prompt-reference')) return
  const editor = target.closest?.('.inline-prompt-editor')
  if (!editor) return
  promptDrag = { element: target, editor, nodeId: promptEditorNodeId(editor) }
  target.classList.add('is-dragging')
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    try { event.dataTransfer.setData('text/plain', target.dataset.referenceId || '') } catch { /* 某些浏览器限制 setData，忽略 */ }
  }
}

function handlePromptDragOver(event) {
  if (!promptDrag) return
  if (event.target?.closest?.('.inline-prompt-editor') !== promptDrag.editor) return
  // 只在拖动引用片时接管默认行为，避免影响正常的文字选择
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  const range = caretRangeAtPoint(event.clientX, event.clientY)
  if (range && promptDrag.editor.contains(range.startContainer)) {
    const caret = range.getBoundingClientRect()
    const editorRect = promptDrag.editor.getBoundingClientRect()
    promptDropIndicator.value = {
      left: Math.round(caret.left),
      top: Math.round(editorRect.top),
      height: Math.round(editorRect.height),
    }
  } else {
    promptDropIndicator.value = null
  }
}

function handlePromptDrop(event) {
  if (!promptDrag) return
  event.preventDefault()
  const { element, editor, nodeId } = promptDrag
  const range = caretRangeAtPoint(event.clientX, event.clientY)
  // 复用「保证落在 editor 层」的插入函数移动 chip：既实现换位，又不会被包进文本壳里降级成文本。
  if (range && editor.contains(range.startContainer) && !element.contains(range.startContainer)) {
    insertChipAtEditorCaret(editor, element, range)
  }
  clearPromptDrag()
  syncPromptAfterDrag(nodeId, editor)
}

function handlePromptDragEnd() {
  clearPromptDrag()
}

function clearPromptDrag() {
  promptDrag?.element?.classList?.remove('is-dragging')
  promptDrag = null
  promptDropIndicator.value = null
}

function syncPromptAfterDrag(nodeId, editor) {
  if (nodeId) {
    syncPromptFromEditor(nodeId, editor)
    return
  }
  // 画布右下角「生成配置」浮动面板的提示词
  const rawConfig = toRaw(generationConfig)
  rawConfig.promptParts = inlinePromptPartsFromEditor({ currentTarget: editor })
  rawConfig.prompt = inlinePromptText({ currentTarget: editor })
  scheduleSave()
  commitHistory()
}

// ==================== 局部元素提取引用（标记）：画布级「元素选择模式」 ====================
// 交互语义（对齐 LibTV 无限画布）：
//   ① 点节点编辑栏的「标记」按钮 → 进入「元素选择模式」（画布顶部蓝色提示条，**不弹任何卡片**）
//   ② 画布**保持可拖拽平移**（用于移动画面找图）；节点拖拽被禁用，避免误移节点
//   ③ 画布上「任意含图的节点」都可直接点击：点一下 → [同步] 裁一小块图 + 在该点插入引用 chip
//   ④ [异步] 调识别接口拿 3~5 个候选 → chip 自动采用第一个候选
//   ⑤ 点 chip 箭头 → Teleport 下拉菜单（屏幕坐标）→ 选中后 chip 名称更新
//   ⑥ 点「返回节点」→ 退出模式，聚焦/滚动到发起标记的节点可见
// 注意：不是重绘，不修改原图；裁剪小图只是作为参考素材参与常规生成。
const MARKING_MAX_ELEMENTS = 6
const MARKING_CROP_SIZE = 240
const MARKING_MAX_EDGE = 512
const MARKING_PENDING_LABEL = '识别中'
const MARKING_FAILED_LABEL = '未识别'

// 进入元素选择模式时用到的「提示词光标位置」，以及每个节点最近一次的光标位置。
let markCaret = null
const lastPromptCaretByNode = new Map()

// 元素选择模式状态（无面板：画布本身就是选择区）。
const markingState = reactive({
  active: false,
  nodeId: '', // 发起标记的节点：引用 chip 插入它的提示词框
  pending: 0, // 进行中的识别请求数量
  status: '',
  error: '',
})
const markingActive = computed(() => markingState.active)

// 标记内容下拉菜单：Teleport 到 body + getBoundingClientRect 屏幕坐标定位（画布有 transform，就地定位必然错位）。
const elementMenu = ref(null)
const elementMenuElementId = computed(() => elementMenu.value?.elementId || '')
const elementMenuStyle = computed(() => {
  const menu = elementMenu.value
  if (!menu) return { left: '0px', top: '0px' }
  return menu.placement === 'top'
    ? { left: `${menu.left}px`, top: `${menu.top}px`, transform: 'translateY(calc(-100% - 8px))' }
    : { left: `${menu.left}px`, top: `${menu.bottom}px`, transform: 'translateY(8px)' }
})

function markNodeElements(node) {
  return Array.isArray(node?.data?.elements) ? node.data.elements : []
}

const markChips = computed(() => markNodeElements(nodes.value.find((item) => item.id === markingState.nodeId)))

// 一个节点可被标记的图像：upload 用自带图；image / image-result 用输出图（退回自带图）；
// 视频 / 文本 / 配置等没有图像的节点返回空。与连线关系无关。
function nodeMarkingImage(node) {
  const data = node?.data || {}
  if (node?.type === 'upload') return String(data.image || '').trim()
  if (node?.type === 'image') return String(data.output?.url || data.image || '').trim()
  if (node?.type === 'result' && data.mode === 'image-result') return String(data.output?.url || data.image || '').trim()
  return ''
}

// 该图像与「发起标记节点」的关系：output（本身）/ upstream（直接上游）/ canvas（画布其它节点）。
function markImageRef(initiateNodeId, sourceNodeId) {
  if (!initiateNodeId || !sourceNodeId) return 'canvas'
  if (initiateNodeId === sourceNodeId) return 'output'
  return upstreamNodes(initiateNodeId).some((item) => item.id === sourceNodeId) ? 'upstream' : 'canvas'
}

// ---- 进入 / 退出「元素选择模式」（不弹卡片，画布即选择区） ----
function openMarking(nodeId) {
  const node = nodes.value.find((item) => item.id === nodeId)
  if (!node) return
  if (markNodeElements(node).length >= MARKING_MAX_ELEMENTS) {
    ElMessage.warning(`每个节点最多引用 ${MARKING_MAX_ELEMENTS} 个标记元素，请先删除已有元素`)
    return
  }
  if (!nodes.value.some((item) => nodeMarkingImage(item))) {
    ElMessage.warning('画布上还没有可用于标记的图片')
    return
  }
  marqueeMode.value = false
  closeElementMenu()
  // 记下提示词框的光标位置：点的「标记」按钮会夺走焦点，所以要先用最近一次记录兜底。
  markCaret = lastPromptCaretByNode.get(nodeId) || capturePromptCaret(nodeId)
  Object.assign(markingState, { active: true, nodeId, pending: 0, status: '', error: '' })
}

function closeMarking() {
  closeElementMenu()
  Object.assign(markingState, { active: false, nodeId: '', pending: 0, status: '', error: '' })
}

// 「返回节点」：退出模式并聚焦/滚动到发起标记的节点（回到进入前的节点编辑状态）。
function returnToMarkingNode() {
  const id = markingState.nodeId
  closeMarking()
  if (!id) return
  const node = nodes.value.find((item) => item.id === id)
  if (!node) return
  selectedNodeId.value = id
  expandedNodeId.value = ['image-generation', 'video-generation'].includes(node.data?.mode) ? id : ''
  nextTick(() => {
    try {
      fitView({ nodes: [id], padding: 0.4, duration: 280, maxZoom: 1.15 })
    } catch {
      fitView({ padding: 0.4, duration: 280, maxZoom: 1.15 })
    }
  })
}

// ---- 图上的圆形编号徽标（编号与提示词里的引用 chip 一一对应） ----
// fx / fy 是「点击点相对图片元素框」的比例（0~1），与画布缩放/平移无关，直接按百分比定位即可。
function markBadgeStyle(element) {
  const fx = Number.isFinite(element?.fx) ? element.fx : 0.5
  const fy = Number.isFinite(element?.fy) ? element.fy : 0.5
  return { left: `${fx * 100}%`, top: `${fy * 100}%` }
}

// 某个含图节点上要显示的徽标：取发起节点 elements 里 nodeId 指向它的那些（编号沿用全局顺序）。
function markBadgesForNode(nodeId) {
  const activeId = elementMenuElementId.value
  return markChips.value
    .map((element, index) => ({ id: element.id, index: index + 1, active: element.id === activeId, nodeId: element.nodeId || '', style: markBadgeStyle(element) }))
    .filter((badge) => badge.nodeId === nodeId)
}

// ---- [同步] 画布图上点击 → 以点击点为中心裁块 → 插 chip → 出徽标（全程零网络） ----
// object-fit: contain 会在图片框内留黑边，点击点必须按 contain 几何换算成「原图像素坐标」。
function imagePointFromEvent(image, event) {
  const rect = image.getBoundingClientRect()
  const naturalWidth = image.naturalWidth || 0
  const naturalHeight = image.naturalHeight || 0
  if (!naturalWidth || !naturalHeight || !rect.width || !rect.height) return null
  const scale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight)
  const drawnWidth = naturalWidth * scale
  const drawnHeight = naturalHeight * scale
  const offsetX = (rect.width - drawnWidth) / 2
  const offsetY = (rect.height - drawnHeight) / 2
  const localX = event.clientX - rect.left - offsetX
  const localY = event.clientY - rect.top - offsetY
  // 点到黑边不算标记。
  if (localX < 0 || localY < 0 || localX > drawnWidth || localY > drawnHeight) return null
  return {
    x: Math.round(Math.min(Math.max(localX / scale, 0), naturalWidth)),
    y: Math.round(Math.min(Math.max(localY / scale, 0), naturalHeight)),
  }
}

// 画布图上点击：进入模式后任意含图节点都可直接点标记。
function handleCanvasMarkClick(sourceNodeId, event) {
  if (!markingActive.value) return
  const image = event?.currentTarget
  if (!image) return
  // 标记态下点图片不应触发节点选中/展开。
  event.stopPropagation()
  const point = imagePointFromEvent(image, event)
  if (!point) return
  const rect = image.getBoundingClientRect()
  const fx = rect.width ? (event.clientX - rect.left) / rect.width : 0.5
  const fy = rect.height ? (event.clientY - rect.top) / rect.height : 0.5
  addMarkAtPoint(sourceNodeId, image, point, { fx, fy })
}

// 以点击点为中心裁一块方图（约 240×240，上限 512px）。
function cropRegionAround(image, point) {
  const naturalWidth = image.naturalWidth || 0
  const naturalHeight = image.naturalHeight || 0
  if (!naturalWidth || !naturalHeight) return null
  const size = Math.max(1, Math.min(MARKING_CROP_SIZE, naturalWidth, naturalHeight))
  const x = Math.round(Math.min(Math.max(point.x - size / 2, 0), naturalWidth - size))
  const y = Math.round(Math.min(Math.max(point.y - size / 2, 0), naturalHeight - size))
  return cropImageRect(image, { x, y, w: size, h: size })
}

// 裁剪内核：按「原图像素矩形」裁剪，任一边超过 MARKING_MAX_EDGE(512) 时等比缩小。
// 跨域图片会污染 canvas，toDataURL 抛错，由调用方降级提示。
function cropImageRect(image, rect) {
  const naturalWidth = image.naturalWidth || 0
  const naturalHeight = image.naturalHeight || 0
  if (!naturalWidth || !naturalHeight) return null
  const x = Math.round(Math.min(Math.max(Number(rect?.x) || 0, 0), Math.max(0, naturalWidth - 1)))
  const y = Math.round(Math.min(Math.max(Number(rect?.y) || 0, 0), Math.max(0, naturalHeight - 1)))
  const w = Math.max(1, Math.round(Math.min(Number(rect?.w) || 1, naturalWidth - x)))
  const h = Math.max(1, Math.round(Math.min(Number(rect?.h) || 1, naturalHeight - y)))
  const region = document.createElement('canvas')
  region.width = w
  region.height = h
  region.getContext('2d').drawImage(image, x, y, w, h, 0, 0, w, h)
  let output = region
  let outputWidth = w
  let outputHeight = h
  const longest = Math.max(w, h)
  if (longest > MARKING_MAX_EDGE) {
    const ratio = MARKING_MAX_EDGE / longest
    outputWidth = Math.max(1, Math.round(w * ratio))
    outputHeight = Math.max(1, Math.round(h * ratio))
    const scaled = document.createElement('canvas')
    scaled.width = outputWidth
    scaled.height = outputHeight
    const scaledCtx = scaled.getContext('2d')
    scaledCtx.imageSmoothingEnabled = true
    scaledCtx.imageSmoothingQuality = 'high'
    scaledCtx.drawImage(region, 0, 0, outputWidth, outputHeight)
    output = scaled
  }
  return { dataUrl: output.toDataURL('image/png'), rect: { x, y, w, h } }
}

const IMAGE_LOAD_TIMEOUT = 8000

// 把图片 URL 加载成 <img>，供程序化裁剪使用（不依赖画布上的 DOM 节点）。
function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const src = String(url || '').trim()
    if (!src) return reject(new Error('该节点没有可用的图片'))
    const image = new Image()
    if (!src.startsWith('data:')) image.crossOrigin = 'anonymous'
    const timer = window.setTimeout(() => reject(new Error('图片加载超时')), IMAGE_LOAD_TIMEOUT)
    image.onload = () => { window.clearTimeout(timer); resolve(image) }
    image.onerror = () => { window.clearTimeout(timer); reject(new Error('图片加载失败（可能跨域或链接失效）')) }
    image.src = src
  })
}

// 程序化建元素：给「来源节点 + 归一化矩形」就能生成标记元素（助手 / 模板都走这里，不依赖鼠标）。
// region 是相对图片的归一化矩形（0~1）。
async function createElementFromRegion({ initiateNodeId, sourceNodeId, region, label = '', caret = null } = {}) {
  const initiateNode = nodes.value.find((node) => node.id === initiateNodeId)
  if (!initiateNode) throw new Error('找不到接收元素引用的节点')
  const sourceNode = nodes.value.find((node) => node.id === sourceNodeId)
  const url = nodeMarkingImage(sourceNode)
  if (!url) throw new Error('被裁剪的节点没有可用的图片')
  const list = markNodeElements(initiateNode)
  if (list.length >= MARKING_MAX_ELEMENTS) throw new Error(`每个节点最多引用 ${MARKING_MAX_ELEMENTS} 个标记元素`)
  const rx = Math.min(1, Math.max(0, Number(region?.x) || 0))
  const ry = Math.min(1, Math.max(0, Number(region?.y) || 0))
  const rw = Math.min(1 - rx, Math.max(0.02, Number(region?.w) || 0.5))
  const rh = Math.min(1 - ry, Math.max(0.02, Number(region?.h) || 0.5))
  const image = await loadImageElement(url)
  const naturalWidth = image.naturalWidth || 0
  const naturalHeight = image.naturalHeight || 0
  let cropped = null
  try {
    cropped = cropImageRect(image, {
      x: rx * naturalWidth,
      y: ry * naturalHeight,
      w: rw * naturalWidth,
      h: rh * naturalHeight,
    })
  } catch {
    throw new Error('这块区域无法裁剪（跨域图片），请改用其它图片')
  }
  if (!cropped?.dataUrl) throw new Error('裁剪区域失败')
  const point = { x: cropped.rect.x + cropped.rect.w / 2, y: cropped.rect.y + cropped.rect.h / 2 }
  const element = {
    id: `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    // nodeId 记录「实际被裁剪图片的来源节点」，引用 chip 仍写进发起节点的提示词框。
    nodeId: sourceNodeId,
    imageRef: markImageRef(initiateNode.id, sourceNodeId),
    sourceKey: `node:${sourceNodeId}`,
    label: label || MARKING_PENDING_LABEL,
    content: label || MARKING_PENDING_LABEL,
    candidates: [],
    point,
    fx: naturalWidth ? point.x / naturalWidth : 0.5,
    fy: naturalHeight ? point.y / naturalHeight : 0.5,
    sourceWidth: naturalWidth,
    sourceHeight: naturalHeight,
    thumb: cropped.dataUrl,
    rect: cropped.rect,
    createdAt: new Date().toISOString(),
  }
  // 写响应式代理；chip 只能由 promptParts 渲染出来，绝不手工插 DOM。
  initiateNode.data.elements = [...list, element]
  initiateNode.data.promptParts = promptPartsWithPart(initiateNode, { type: 'element', id: element.id }, caret)
  initiateNode.data.prompt = promptPartsText(initiateNode.data.promptParts)
  scheduleSave()
  commitHistory()
  // 异步识别：不阻塞、不加 await。
  if (!label) recognizeElementContent(initiateNode.id, element.id, cropped.dataUrl)
  return element
}

function addMarkAtPoint(sourceNodeId, image, point, fraction) {
  const initiateNode = nodes.value.find((item) => item.id === markingState.nodeId)
  if (!initiateNode || !image || !point) return
  const list = markNodeElements(initiateNode)
  if (list.length >= MARKING_MAX_ELEMENTS) {
    ElMessage.warning(`每个节点最多引用 ${MARKING_MAX_ELEMENTS} 个标记元素`)
    return
  }
  let cropped = null
  try {
    cropped = cropRegionAround(image, point)
  } catch {
    ElMessage.warning('这块区域无法裁剪（跨域图片），请改用其它图片')
    return
  }
  if (!cropped?.dataUrl) {
    ElMessage.warning('裁剪区域失败，请重新点击')
    return
  }
  const element = {
    id: `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    // nodeId 记录「实际被标记图像的来源节点」（画布上任意含图节点，未必是发起标记的这个）。
    // 引用 chip 仍写入发起标记节点的提示词框（见下方 promptParts）。
    nodeId: sourceNodeId,
    imageRef: markImageRef(initiateNode.id, sourceNodeId),
    sourceKey: `node:${sourceNodeId}`,
    label: MARKING_PENDING_LABEL,
    content: MARKING_PENDING_LABEL,
    candidates: [],
    point,
    fx: fraction?.fx,
    fy: fraction?.fy,
    sourceWidth: image.naturalWidth || 0,
    sourceHeight: image.naturalHeight || 0,
    thumb: cropped.dataUrl,
    rect: cropped.rect,
    createdAt: new Date().toISOString(),
  }
  // 必须写到响应式代理上（不能用 toRaw），否则 markChips / 徽标不会重渲染。
  initiateNode.data.elements = [...list, element]
  // 同步链路：把 element 片写进 promptParts（光标处），chip 与徽标全部由响应式渲染出来。
  // 全程不发网络请求 —— 这是「点下去就出图标」的来源。绝不能改成手工插 DOM，
  // 否则会和随后由 promptParts 触发的重渲染叠成两个 chip。
  initiateNode.data.promptParts = promptPartsWithPart(initiateNode, { type: 'element', id: element.id }, markCaret)
  initiateNode.data.prompt = promptPartsText(initiateNode.data.promptParts)
  markCaret = null
  scheduleSave()
  commitHistory()
  markingState.error = ''
  markingState.status = `第 ${list.length + 1} 个标记已插入提示词，正在识别内容…`
  markingState.pending += 1
  // 异步识别：绝不阻塞上面的同步链路。
  recognizeElementContent(initiateNode.id, element.id, cropped.dataUrl)
}

async function recognizeElementContent(nodeId, elementId, dataUrl) {
  try {
    const result = await describeImageRegion({ image: dataUrl })
    const candidates = Array.isArray(result?.candidates) ? result.candidates.filter(Boolean).slice(0, 5) : []
    if (!candidates.length) throw new Error('识别接口没有返回候选内容')
    // 首选候选即默认值：用户不点箭头也能直接用。
    applyElementPatch(nodeId, elementId, { candidates, label: candidates[0], content: candidates[0], recognizeError: '' })
    markingState.status = `识别完成：${candidates[0]}（可点箭头换其它候选）`
  } catch (error) {
    // AC-05：识别失败/不可用时候选为空、不阻塞、可手动填写，chip 绝不能停在「识别中」。
    const message = error?.response?.data?.details?.message || error?.response?.data?.message || error?.message || '区域识别失败'
    applyElementPatch(nodeId, elementId, { candidates: [], label: MARKING_FAILED_LABEL, content: '', recognizeError: String(message) })
    markingState.error = String(message)
    markingState.status = ''
    ElMessage.warning(`${message}，可点标记上的箭头手动填写内容`)
  } finally {
    markingState.pending = Math.max(0, markingState.pending - 1)
  }
}

function applyElementPatch(nodeId, elementId, patch = {}) {
  const node = nodes.value.find((item) => item.id === nodeId)
  if (!node) return
  const list = markNodeElements(node)
  if (!list.some((item) => item.id === elementId)) return
  // 同上：写响应式代理，面板里的 chip 名称、图上徽标、提示词框里的 chip 会一起更新。
  node.data.elements = list.map((item) => (item.id === elementId ? { ...item, ...patch } : item))
  scheduleSave()
}

// ---- 引用 chip：唯一来源是 node.data.promptParts，交给模板渲染（绝不手工插 DOM，避免重复 chip） ----
function elementIndexOf(node, elementId) {
  const position = markNodeElements(node).findIndex((item) => item.id === elementId)
  return position < 0 ? 0 : position + 1
}

function promptPartsText(parts) {
  return (Array.isArray(parts) ? parts : [])
    .filter((part) => part?.type === 'text')
    .map((part) => String(part.text || ''))
    .join('')
    .replace(/\u200b/g, '')
    .slice(0, 500)
}

// 打开标记面板时记下提示词框里的光标位置，供「插入到光标处」使用。
// 注意：编辑器 DOM 里除了三个模板片之外还有空白文本节点/注释锚点，
// 所以不能用 childNodes 的下标 —— 必须只数「元素子节点」，它才与 promptParts 一一对应。
function capturePromptCaret(nodeId) {
  const editor = generationConfigNodePromptRefs.get(nodeId)
  const selection = typeof window === 'undefined' ? null : window.getSelection()
  if (!editor || !selection || selection.rangeCount === 0) return null
  if (!editor.contains(selection.anchorNode)) return null
  const range = selection.getRangeAt(0)
  const container = range.startContainer
  let index = 0
  let found = false
  for (const child of Array.from(editor.childNodes)) {
    if (child === container || (child.nodeType === 1 && child.contains(container))) { found = true; break }
    if (child.nodeType === 1) index += 1
  }
  if (!found) index = editor.children.length
  const offset = container.nodeType === 3 ? range.startOffset : 0
  return { index, offset }
}

// 在 promptParts 的指定位置插入一个「结构片」（reference 或 element）；光标落在文字中间时把该文字片切开，
// 真正做到「插在光标处」。reference 与 element 两条链路共用这一个数据写入函数。
function promptPartsWithPart(node, part, caret) {
  const saved = Array.isArray(node?.data?.promptParts) ? node.data.promptParts : null
  const parts = saved && saved.length
    ? saved.map((item) => ({ ...item }))
    : (node?.data?.prompt ? [{ type: 'text', text: String(node.data.prompt) }] : [])
  if (!caret) {
    parts.push(part)
    return parts
  }
  let index = Math.min(Math.max(caret.index, 0), parts.length)
  const target = parts[index]
  const text = target?.type === 'text' ? String(target.text || '') : ''
  if (target?.type === 'text' && caret.offset > 0 && caret.offset < text.length) {
    parts.splice(index, 1, { type: 'text', text: text.slice(0, caret.offset) }, part, { type: 'text', text: text.slice(caret.offset) })
    return parts
  }
  if (target?.type === 'text' && caret.offset >= text.length) index += 1
  parts.splice(index, 0, part)
  return parts
}

// ---- 下拉菜单（Teleport 到 body + 屏幕坐标定位） ----
function openElementMenu(elementId, nodeId, event) {
  if (!elementId || !nodeId) return
  const node = nodes.value.find((item) => item.id === nodeId)
  const element = markNodeElements(node).find((item) => item.id === elementId)
  const anchor = event?.currentTarget?.getBoundingClientRect?.()
  if (!element || !anchor) return
  const viewportWidth = typeof window === 'undefined' ? 1200 : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight
  const menuWidth = 256
  const openUpward = anchor.top > 260 && anchor.top > viewportHeight - anchor.bottom
  elementMenu.value = {
    elementId,
    nodeId,
    candidates: Array.isArray(element.candidates) ? element.candidates.filter(Boolean) : [],
    // 占位/失败态不预填，避免用户误把「识别中」当成内容提交。
    text: element.label === MARKING_PENDING_LABEL || element.label === MARKING_FAILED_LABEL ? '' : String(element.label || ''),
    left: Math.round(Math.min(Math.max(anchor.left, 12), Math.max(12, viewportWidth - menuWidth - 12))),
    top: Math.round(anchor.top),
    bottom: Math.round(anchor.bottom),
    placement: openUpward ? 'top' : 'bottom',
  }
}

function closeElementMenu() {
  elementMenu.value = null
}

function handlePromptEditorClick(event) {
  const editor = event?.currentTarget
  const nodeId = promptEditorNodeId(editor)
  const caret = event?.target?.closest?.('.inline-element-caret')
  if (caret) {
    // 点的是 chip 上的箭头 → 打开内容下拉菜单。
    const chip = caret.closest('[data-element-id]')
    if (chip) openElementMenu(chip.dataset.elementId, nodeId, { currentTarget: caret })
    return
  }
  // 否则把这次点击的光标位置记下来，供「标记插入到光标处」使用。
  const position = capturePromptCaret(nodeId)
  if (nodeId && position) lastPromptCaretByNode.set(nodeId, position)
}

function chooseElementContent(value) {
  const menu = elementMenu.value
  if (!menu) return
  const name = String(value || '').trim().slice(0, 24)
  if (!name) return
  applyElementPatch(menu.nodeId, menu.elementId, { label: name, content: name })
  closeElementMenu()
  markingState.error = ''
  markingState.status = `标记内容已更新为「${name}」`
}

// 生成时把被引用的标记元素裁剪图并入参考图数组（去重，元素上限 MARKING_MAX_ELEMENTS 个）。
function elementReferenceImages(data = {}) {
  const parts = Array.isArray(data.promptParts) ? data.promptParts : []
  const elements = Array.isArray(data.elements) ? data.elements : []
  const byId = new Map(elements.map((element) => [element.id, element]))
  const values = []
  parts.filter((part) => part?.type === 'element').forEach((part) => {
    const element = byId.get(part.id) || (part?.thumb ? part : null)
    const thumb = element?.thumb
    if (thumb && !values.includes(thumb)) values.push(thumb)
  })
  return values.slice(0, MARKING_MAX_ELEMENTS)
}

// 把 promptParts 渲染成最终提示词：文字片原样保留，标记元素片替换为它选定的内容文字。
// 「识别中 / 未识别」是占位态，绝不能当成内容送给模型。没有 element 片时结果与 before 完全相同。
function promptPartsToText(data = {}) {
  const parts = Array.isArray(data.promptParts) ? data.promptParts : []
  if (!parts.length) return ''
  const elements = Array.isArray(data.elements) ? data.elements : []
  const byId = new Map(elements.map((element) => [element.id, element]))
  const rendered = parts.map((part) => {
    if (part?.type === 'element') {
      const element = byId.get(part.id) || (part?.thumb ? part : null)
      const name = String(element?.content || element?.label || '').trim()
      if (!name || name === MARKING_PENDING_LABEL || name === MARKING_FAILED_LABEL) return ''
      return ` ${name} `
    }
    if (part?.type === 'reference') return ''
    if (part?.type && part.type !== 'text') return ''
    return String(part?.text || '')
  }).join('')
  return rendered.replace(/\u200b/g, '').replace(/[ \t]{2,}/g, ' ').trim()
}

// 预览浮层贴在图标正上方弹出；上方空间不足时改到图标下方，避免被视口裁掉
const upstreamPreviewPlacement = computed(() => {
  const anchor = upstreamPreviewAnchor.value
  if (!anchor) return 'top'
  return anchor.top > 300 ? 'top' : 'bottom'
})

const upstreamPreviewStyle = computed(() => {
  const anchor = upstreamPreviewAnchor.value
  if (!anchor) return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  if (upstreamPreviewPlacement.value === 'top') {
    return { left: `${anchor.centerX}px`, top: `${anchor.top}px`, transform: 'translate(-50%, calc(-100% - 10px))' }
  }
  return { left: `${anchor.centerX}px`, top: `${anchor.bottom}px`, transform: 'translate(-50%, 10px)' }
})

function referenceRelationValue(id, index) {
  const node = nodes.value.find((item) => item.id === id)
  return node?.data?.referenceRelations?.[index] || ''
}

function updateReferenceRelation(id, index, event) {
  const node = nodes.value.find((item) => item.id === id)
  if (!node) return
  const relations = [...(node.data.referenceRelations || [])]
  relations[index] = event.target.value
  node.data.referenceRelations = relations
  commitHistory()
}

function updateFloatingReferenceRelation(index, event) {
  generationConfig.referenceRelations[index] = event.target.value
}

function connectedReferenceImage(id) {
  for (const node of upstreamNodes(id)) {
    const direct = node.type === 'upload' ? (node.data?.imageData || node.data?.image) : node.type === 'image' ? (node.data?.output?.imageData || node.data?.output?.url || node.data?.image) : ''
    if (direct) return direct
  }
  return ''
}

function connectedReferenceImages(id) {
  return upstreamNodes(id).map((node) => node.type === 'upload'
    ? (node.data?.imageData || node.data?.image)
    : node.type === 'image'
      ? (node.data?.output?.imageData || node.data?.output?.url || node.data?.image)
      : '').filter(Boolean).slice(0, 4)
}

async function modelReadableReference(value) {
  const source = String(value || '').trim()
  if (!source || /^data:image\//i.test(source) || /^https?:\/\//i.test(source)) return source
  if (!source.startsWith('/api/')) return source
  const response = await fetch(source, { credentials: 'include' })
  if (!response.ok) throw new Error(`参考图读取失败（${response.status}）`)
  const blob = await response.blob()
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('参考图转换失败'))
    reader.readAsDataURL(blob)
  })
}

async function resolveModelReferenceImages(values) {
  const unique = [...new Set((values || []).filter(Boolean))]
  return await Promise.all(unique.map((value) => modelReadableReference(value)))
}

function generationReferenceChips(id, includeSelf = false) {
  return nodeReferenceChips(id, includeSelf).filter((reference) => reference.kind === 'image').slice(0, 8)
}

function directUpstreamText(id) {
  return upstreamNodes(id)
    .map((node) => node.data?.output?.text || node.data?.prompt || (node.data?.mode === 'free-text' ? node.data?.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim()
}

function effectiveGeneratorPrompt(node) {
  const references = directNodeReferenceChips(node.id)
  const relations = (node.data?.referenceRelations || [])
    .map((value, index) => {
      const relation = String(value || '').trim()
      if (!relation) return ''
      const sourceName = references[index]?.name || `素材${index + 1}`
      const targetName = references[index + 1]?.name || '当前生成内容'
      return `素材关系：${sourceName} ${relation} ${targetName}`
    })
    .filter(Boolean)
    .join('\n')
  // 有 promptParts 时按片渲染：文字片原样，标记元素片换成它选定的内容文字，
  // 这样「点出来的标记」才会真正进入提示词。老画布没有 element 片，结果与改造前完全一致。
  const body = promptPartsToText(node.data) || String(node.data?.prompt || '').trim()
  return [directUpstreamText(node.id), relations, body].filter(Boolean).join('\n').trim()
}

function generatorStatusText(data = {}) {
  if (data.status === 'running') return '生成中'
  if (data.status === 'succeeded') return '生成成功'
  if (data.status === 'failed') return '生成失败，可重试'
  return data.prompt?.trim() || data.output?.text ? '准备就绪' : '待输入'
}

async function storeGeneratedDataUrl(dataUrl, fileName, mimeType) {
  if (!SERVER_AUTH_MODE || !String(dataUrl || '').startsWith('data:')) return { id: '', url: dataUrl }
  const { data } = await apiClient.post('/me/assets', {
    kind: 'canvas-generated',
    originalName: fileName,
    mimeType,
    base64: dataUrl,
  })
  const id = data.asset?.id
  return id ? { id, url: `/api/assets/${encodeURIComponent(id)}` } : { id: '', url: dataUrl }
}

async function runGenerator(id, options = {}) {
  const recordHistory = options.recordHistory !== false
  const throwOnError = options.throwOnError === true
  const node = nodes.value.find((item) => item.id === id)
  if (!node || !isGeneratorNode(node) || node.data.status === 'running') return false
  if (!generatorModels(node).length) {
    ElMessage.warning('暂无可用模型，请联系管理员开启模型后刷新页面')
    return false
  }
  const prompt = effectiveGeneratorPrompt(node)
  if (!prompt) {
    node.data.error = '请先输入生成要求，或连接一个有文字内容的上游节点。'
    node.data.status = 'failed'
    ElMessage.warning(node.data.error)
    if (throwOnError) throw new Error(node.data.error)
    return false
  }

  // 开始生成即结束元素选择，避免标记模式的节点拖拽锁继续生效。
  closeMarking()
  node.data = { ...node.data, status: 'running', error: '' }
  selectedNodeId.value = id
  openPanel.value = 'settings'
  if (recordHistory) commitHistory()
  try {
    // 外部模型或后端不可用时不能让节点永久停留在“生成中”。
    const withTimeout = (promise, timeoutMs = 45000) => Promise.race([
      promise,
      new Promise((_, reject) => window.setTimeout(() => reject(new Error('生成请求超时，请检查模型配置或网络后重试')), timeoutMs)),
    ])
    if (node.data.mode === 'text-generation') {
      const result = await withTimeout(requestCanvasAssistant({
        operation: 'generate-text',
        message: prompt,
        selectedNode: assistantNodeContext(node),
        upstream: upstreamNodes(id).map(assistantNodeContext),
      }), 90000)
      // 只认 set_node_text 提案：服务端已改为「只返回正文」，reply 同样是正文本身。
      // 但绝不能在没有正文时把 reply 当正文写回 —— 那正是"工作汇报"污染节点的来源。
      const proposalText = String(result.proposals?.find((item) => item.type === 'set_node_text')?.payload?.text || '').trim()
      const produced = proposalText || String(result.reply || '').trim()
      if (!produced) {
        const warning = Array.isArray(result.warnings) && result.warnings.length ? result.warnings[0] : '模型没有返回可用正文，请把要求写得更具体后重试'
        throw new Error(warning)
      }
      if (Array.isArray(result.warnings) && result.warnings.length) ElMessage.warning(result.warnings[0])
      node.data.output = { text: produced }
      node.data.text = produced
    } else if (node.data.mode === 'image-generation') {
      const referenceImage = connectedReferenceImage(id)
      const referenceImages = connectedReferenceImages(id)
      // 标记元素（局部提取引用）的裁剪小图并入参考图数组：优先生效，去重，元素最多 MARKING_MAX_ELEMENTS 个。
      const elementImages = elementReferenceImages(node.data)
      const baseReferences = referenceImages.length ? referenceImages : (referenceImage ? [referenceImage] : [])
      const readableReferenceImages = await withTimeout(resolveModelReferenceImages([...elementImages, ...baseReferences]), 30000)
      // 张数：智能体显式传 count 优先；手动点「开始生成」时回落到节点上配的张数。
      // 上限 GENERATOR_MAX_COUNT(4) 与后台 MAX_GENERATION_COUNT 保持一致。
      const requestedCount = Number(options.count) || Number(node.data.config?.count) || 1
      const variantCount = Math.min(GENERATOR_MAX_COUNT, Math.max(1, Math.round(requestedCount)))
      const result = await withTimeout(generateArtwork({
        prompt,
        model: node.data.config?.model || configuredImageModels.value[0] || 'agnes-image-2.1-flash',
        provider: imageProviderForModel(node.data.config?.model),
        ratio: node.data.config?.ratio || '1:1',
        quality: 'high',
        referenceImage: readableReferenceImages[0] || '',
        images: readableReferenceImages,
        // 优先使用模型返回的原图 URL，避免 Agnes 的 Base64 响应被压缩成低清缩略图。
        returnBase64: false,
        count: variantCount,
        projectId: sourceProject.id,
      }), 180000)
      const results = (Array.isArray(result.results) ? result.results : []).filter((item) => item?.imageUrl).slice(0, variantCount)
      if (!results.length) throw new Error('图像模型没有返回可用图片')
      // 服务端提示「参考图协议未声明」时透传给用户：不阻断出图，但要让上游图可能没生效这件事可见。
      const referenceWarnings = Array.isArray(result.raw?.warnings) ? result.raw.warnings : []
      if (referenceWarnings.length) ElMessage.warning(referenceWarnings[0])
      const stamp = Date.now()
      const variants = []
      for (let variantIndex = 0; variantIndex < results.length; variantIndex += 1) {
        const item = results[variantIndex]
        const variantName = `画布生成-${stamp}-${variantIndex + 1}.png`
        const storedVariant = await storeGeneratedDataUrl(item.imageUrl, variantName, 'image/png')
        variants.push({ url: storedVariant.url, imageData: item.imageUrl, assetId: storedVariant.id, originalName: variantName, provider: item.provider, model: item.model })
      }
      // 首张仍是主结果（保留 data.output 单图字段，向后兼容）；多版本时额外存 outputVariants 供对比选择。
      node.data.output = variants[0]
      node.data.outputVariants = variants.length > 1 ? variants : []
      try { const size = await readImageDimensions(variants[0].url); node.data.outputAspectRatio = size.width / size.height } catch { node.data.outputAspectRatio = parseRatio(node.data.config?.ratio) }
    } else {
      const referenceImage = connectedReferenceImage(id)
      const videoElementImages = elementReferenceImages(node.data)
      const result = await withTimeout(generateVideo({
        prompt,
        model: node.data.config?.model || '',
        provider: 'agnes',
        duration: Number(node.data.config?.duration || 5),
        ratio: node.data.config?.ratio || '16:9',
        resolution: node.data.config?.resolution || '1080P',
        referenceImage: videoElementImages[0] || referenceImage,
        images: [...videoElementImages, ...(referenceImage ? [referenceImage] : [])],
      }), 45000)
      const finalResult = result.videoUrl ? result : await withTimeout(waitForVideoTask(result.taskId, result.provider), 180000)
      if (!finalResult.videoUrl) throw new Error(finalResult.error || '视频模型没有返回可播放结果')
      node.data.output = { url: finalResult.videoUrl, taskId: result.taskId, provider: result.provider, originalName: `画布生成-${Date.now()}.mp4` }
    }
    node.data.status = 'succeeded'
    node.data.error = ''
    ElMessage.success(`${node.data.title}已完成`)
  } catch (error) {
    node.data.status = 'failed'
    node.data.error = error?.response?.data?.message || error.message || '生成失败，请稍后重试'
    ElMessage.error(node.data.error)
    if (throwOnError) throw error
  }
  // 无论请求如何结束，都清除运行态，避免按钮和画布被永久锁住。
  if (node.data.status === 'running') {
    node.data.status = 'failed'
    node.data.error = '生成未返回结果，请重试'
  }
  if (recordHistory) commitHistory()
  return node.data.status === 'succeeded'
}

// 多版本出图后，点缩略图把某一张设为当前主结果（data.output）。
function selectImageVariant(id, index) {
  const node = nodes.value.find((item) => item.id === id)
  const variants = Array.isArray(node?.data?.outputVariants) ? node.data.outputVariants : []
  const variant = variants[index]
  if (!node || !variant) return
  node.data.output = variant
  scheduleSave()
  commitHistory()
}

// 评价卡「按建议重绘」：把评价给出的改进提示词追加到选中生成节点，再触发生成。
async function refineFromEvaluation(message) {
  const node = selectedNode.value
  const refine = String(message?.refinePrompt || '').trim()
  if (!node || !isGeneratorNode(node)) { ElMessage.warning('请先选中一个用于重绘的生成节点'); return }
  if (!refine) { ElMessage.warning('这条评价没有给出可直接重绘的提示词'); return }
  const parts = Array.isArray(node.data.promptParts) && node.data.promptParts.length
    ? [...node.data.promptParts, { type: 'text', text: ` ${refine}` }]
    : [{ type: 'text', text: refine }]
  node.data.promptParts = parts
  node.data.prompt = promptPartsText(parts)
  message.applied = true
  await nextTick()
  await runGenerator(node.id)
}

async function waitForVideoTask(taskId, provider) {
  if (!taskId) throw new Error('视频接口没有返回任务编号')
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 2000))
    const task = await getVideoTask(taskId, provider)
    if (task.status === 'succeeded' || task.videoUrl) return task
    if (['failed', 'cancelled', 'error'].includes(task.status)) throw new Error(task.error || '视频生成任务失败')
  }
  throw new Error('视频生成等待超时，请稍后重新打开画布查看')
}

function assistantNodeContext(node) {
  return {
    id: node?.id || '',
    type: node?.type || '',
    mode: node?.data?.mode || '',
    title: node?.data?.title || '',
    prompt: node?.data?.prompt || '',
    text: node?.data?.text || node?.data?.output?.text || '',
    assetId: node?.data?.assetId || node?.data?.output?.assetId || '',
    // 图片地址必须一起带上：只传 assetId 时，服务端拼不出可读的图片地址，
    // 文字节点就"看不到"上游图（曾因此让生成结果完全脱离素材）。
    image: node?.data?.image || node?.data?.output?.url || node?.data?.output?.imageUrl || node?.data?.outputUrl || '',
  }
}

// 拖线过程中实时判断「这条线能不能连上」。
// 有两类情况必须提前挡掉，否则用户会看到一条绿色的"可以连"提示线、松手却什么都没发生：
//   1) 自己连自己；
//   2) 这两个节点之间已经有一条线了（重复边会被 addEdge 静默去重）。
// ⚠️ VueFlow 在校验时也会拿「画布上已经存在的边」来问一遍，这类必须一律放行：
// 曾经在这里不区分，结果 48 条老连线全被判成「重复」→ 整批从画布上消失。
// 区分办法：已经在画布里的边带 id，正在拖的那条还没有。
function isValidCanvasConnection(connection) {
  if (String(connection?.id || '')) return true
  const source = String(connection?.source || '')
  const target = String(connection?.target || '')
  if (!source || !target || source === target) {
    rejectedConnection.value = { source, target, reason: source && source === target ? 'self' : 'invalid' }
    return false
  }
  const duplicated = edges.value.some((edge) => edge.source === source && edge.target === target)
  if (duplicated) {
    rejectedConnection.value = { source, target, reason: 'duplicated' }
    return false
  }
  rejectedConnection.value = null
  return true
}

// 松手那一刻，鼠标下面是哪个节点的连接点（不在连接点上返回空字符串）。
function droppedTargetNodeId(point) {
  if (typeof document === 'undefined') return ''
  const clientX = Number(point?.clientX)
  const clientY = Number(point?.clientY)
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return ''
  const hit = document.elementFromPoint(clientX, clientY)
  const handle = hit?.closest?.('.vue-flow__handle')
  if (!handle) return ''
  const nodeElement = handle.closest?.('[data-id]')
  const raw = nodeElement?.getAttribute?.('data-id') || nodeElement?.dataset?.id || ''
  return String(raw).replace(/^vue-flow__node-/, '')
}

function handleConnect(params) {
  const previousEdgeCount = edges.value.length
  const nextEdges = addEdge({
    ...params,
    type: 'default',
    interactionWidth: 28,
    style: { stroke: '#2f80ed', strokeWidth: 2.4 },
  }, edges.value)
  if (nextEdges.length === previousEdgeCount) {
    // 兜底：正常已被 isValidCanvasConnection 拦住，这里绝不能再静默失败。
    ElMessage.info('这两个节点已经连过了，不用重复连线')
    return
  }
  edges.value = nextEdges
  connectionCompleted.value = true
  dismissConnectionGuide()
  commitHistory()
  ElMessage.success('节点已连接')
}

function handleConnectStart(params = {}) {
  connectionInProgress.value = true
  rejectedConnection.value = null
  const domNode = params.event?.target?.closest?.('[data-id]')
  const rawNodeId = params.nodeId
    || params.node?.id
    || domNode?.dataset?.id
    || selectedNodeId.value
    || ''
  const normalizedNodeId = String(rawNodeId).replace(/^vue-flow__node-/, '')
  connectionStartNodeId.value = nodes.value.some((node) => node.id === normalizedNodeId) ? normalizedNodeId : ''
  connectionCompleted.value = false
  if (connectionFeedbackTimer) window.clearTimeout(connectionFeedbackTimer)
}

function captureConnectionPointer(event) {
  const handle = event.target?.closest?.('.vue-flow__handle')
  if (!handle) return
  if (handle.classList.contains('target')) return
  const nodeElement = handle.closest?.('[data-id]')
  const rawId = nodeElement?.dataset?.id || nodeElement?.getAttribute?.('data-id') || ''
  const normalizedId = String(rawId).replace(/^vue-flow__node-/, '')
  if (nodes.value.some((node) => node.id === normalizedId)) {
    connectionStartNodeId.value = normalizedId
  }
}

function handleConnectEnd(event) {
  if (!connectionInProgress.value) return
  if (connectionFeedbackTimer) window.clearTimeout(connectionFeedbackTimer)
  connectionFeedbackTimer = window.setTimeout(() => {
    if (!connectionCompleted.value) {
      const point = event?.event || event
      const bounds = canvasArea.value?.getBoundingClientRect?.()
      const clientX = point?.clientX || bounds?.left || 0
      const clientY = point?.clientY || bounds?.top || 0
      // 松手时正落在某个节点的连接点上 = 用户想连这两个节点、但没连成，
      // 不是「拖到空白想新建节点」。以前这里一律弹「新建节点」菜单，
      // 用户看到菜单就以为画布坏了。现在先说清原因，空白处才弹菜单。
      const droppedNodeId = droppedTargetNodeId(point)
      const rejected = rejectedConnection.value
      const sourceId = connectionStartNodeId.value || rejected?.source || ''
      if (droppedNodeId) {
        if (droppedNodeId === sourceId) {
          ElMessage.warning('不能把节点连到它自己，请拖到其他节点')
        } else if (
          rejected?.reason === 'duplicated'
          || edges.value.some((e) => e.source === sourceId && e.target === droppedNodeId)
        ) {
          ElMessage.info('这两个节点已经连过了，换一个还没连的节点试试')
        } else {
          ElMessage.warning('这条线没有连上，请从节点右侧的圆点拖到目标节点左侧的圆点')
        }
      } else {
        const x = Math.max(12, Math.min((bounds?.width || 800) - 230, clientX - (bounds?.left || 0)))
        const y = Math.max(12, Math.min((bounds?.height || 600) - 190, clientY - (bounds?.top || 0)))
        connectionCreateMenu.visible = true
        connectionCreateMenu.x = x
        connectionCreateMenu.y = y
        connectionCreateMenu.source = connectionStartNodeId.value || ''
        connectionCreateMenu.target = { clientX, clientY }
      }
    }
    connectionInProgress.value = false
    connectionCompleted.value = false
    connectionStartNodeId.value = ''
    rejectedConnection.value = null
  }, 0)
}

async function createNodeAtConnection(type) {
  const sourceId = connectionCreateMenu.source || selectedNodeId.value
  const bounds = canvasArea.value?.getBoundingClientRect?.()
  const point = connectionCreateMenu.target || {}
  const zoom = Number(viewport.value?.zoom || 1)
  const position = {
    x: (point.clientX - (bounds?.left || 0) - Number(viewport.value?.x || 0)) / zoom,
    y: (point.clientY - (bounds?.top || 0) - Number(viewport.value?.y || 0)) / zoom,
  }
  const meta = {
    'text-generation': { nodeType: 'text', title: '文字生成', mode: 'text-generation', prompt: '', status: 'idle', config: { model: defaultTextModel() } },
    'image-generation': { nodeType: 'image', title: '图像生成', mode: 'image-generation', prompt: '', status: 'idle', config: { model: 'agnes-image-2.1-flash', ratio: '1:1', resolution: '1080P' } },
    'video-generation': { nodeType: 'video', title: '视频生成', mode: 'video-generation', prompt: '', status: 'idle', config: { model: 'agnes-video-v2.0', duration: 5, ratio: '16:9', resolution: '1080P' } },
    // 从生成节点拖线出来直接接终点站：这是「补结果节点」最顺手的一条路。
    result: { nodeType: 'result', title: '结果展示', state: 'idle' },
  }[type]
  if (!meta) return
  const { nodeType, ...data } = meta
  const node = createNode(nodeType, data)
  node.position = position
  appendSelectedNode(node)
  if (sourceId && sourceId !== node.id) {
    // 等新节点渲染完成（handle 挂载）后再建边，否则 VueFlow 解析不到 handle 会丢弃该边。
    await nextTick()
    // 三个节点的 Handle 均未显式指定 id，故默认 handle 为 null；
    // 源节点右侧 source handle / 新节点左侧 target handle 即为此默认值。
    const connect = (id) => ({ ...edge(id, sourceId, node.id), sourceHandle: null, targetHandle: null })
    const nextEdges = addEdge(connect(`edge-${sourceId}-${node.id}`), edges.value)
    if (nextEdges.length === edges.value.length) {
      nextEdges.push(connect(`workflow-edge-${Date.now()}`))
    }
    edges.value = nextEdges
  }
  connectionCreateMenu.visible = false
  expandedNodeId.value = ['image', 'video'].includes(nodeType) ? node.id : ''
  openPanel.value = type === 'text-generation' ? 'assistant' : type === 'result' ? '' : 'settings'
  commitHistory()
  ElMessage.success(`已创建“${data.title}”节点`)
}

function dismissConnectionGuide() {
  connectionGuideVisible.value = false
  try {
    window.localStorage.setItem(CONNECTION_GUIDE_KEY, 'dismissed')
  } catch {
    // 浏览器禁用本地存储时，仅在当前页面隐藏提示。
  }
}

function nodeDisplayName(id) {
  const node = nodes.value.find((node) => node.id === id)
  return node ? getNodeDisplayName(node.data, node.type) : '未命名节点'
}

function handleEdgeClick({ event, edge: clickedEdge }) {
  event?.stopPropagation?.()
  if (!edgesVisible.value || !clickedEdge?.id) return
  selectedEdgeId.value = clickedEdge.id
  edges.value = edges.value.map((item) => ({ ...item, selected: item.id === clickedEdge.id }))
  createMenuOpen.value = false
  nodeActionId.value = ''
}

function clearSelectedEdge() {
  if (!selectedEdgeId.value && !edges.value.some((item) => item.selected)) return
  selectedEdgeId.value = ''
  edges.value = edges.value.map((item) => (item.selected ? { ...item, selected: false } : item))
}

function deleteSelectedEdge() {
  const targetEdge = selectedEdge.value
  if (!targetEdge) return
  const label = selectedEdgeLabel.value
  edges.value = edges.value.filter((item) => item.id !== targetEdge.id)
  selectedEdgeId.value = ''
  commitHistory()
  showEdgeUndoNotice(label)
}

function showEdgeUndoNotice(label) {
  edgeUndoNotice.value = { label }
  if (edgeUndoTimer) window.clearTimeout(edgeUndoTimer)
  edgeUndoTimer = window.setTimeout(() => {
    edgeUndoNotice.value = null
    edgeUndoTimer = null
  }, 6000)
}

function clearEdgeUndoNotice() {
  edgeUndoNotice.value = null
  if (edgeUndoTimer) window.clearTimeout(edgeUndoTimer)
  edgeUndoTimer = null
}

function handleNodeClick({ node }) {
  clearSelectedEdge()
  if (textEditingNodeId.value !== node.id) textEditingNodeId.value = ''
  selectedNodeId.value = node.id
  expandedNodeId.value = ['image-generation', 'video-generation'].includes(node.data?.mode) ? node.id : ''
  nodeActionId.value = ''
  if (expandedNodeId.value && window.matchMedia('(max-width: 1180px)').matches) {
    rightPanelCollapsed.value = true
  }
  if (!rightPanelCollapsed.value) openPanel.value = 'assistant'
}

function handleNodeDragStop(event) {
  // 拖动的是「组内成员」时，重算组框（组框跟着内容走，成员视觉位置不变）。
  const dragged = Array.isArray(event?.nodes) && event.nodes.length ? event.nodes : [event?.node].filter(Boolean)
  const touched = new Set()
  dragged.forEach((item) => {
    const node = nodes.value.find((entry) => entry.id === (item?.id || item))
    if (node?.parentNode) touched.add(node.parentNode)
  })
  touched.forEach((groupId) => autofitGroup(groupId))
  commitHistory()
}

function toggleNodeActions(id) {
  nodeActionId.value = nodeActionId.value === id ? '' : id
}

function deleteNode(id) {
  if (!id) return
  // 删分组时先把成员摘出来（相对坐标换回绝对），避免留下悬空父引用触发 NODE_MISSING_PARENT。
  if (nodes.value.find((node) => node.id === id)?.type === 'group') {
    nodes.value.filter((node) => node.parentNode === id).forEach((node) => detachFromGroup(node))
  }
  nodes.value = nodes.value.filter((node) => node.id !== id)
  edges.value = edges.value.filter((item) => item.source !== id && item.target !== id)
  if (selectedNodeId.value === id) selectedNodeId.value = nodes.value[0]?.id || ''
  if (textEditingNodeId.value === id) textEditingNodeId.value = ''
  if (promptZoomNodeId.value === id) promptZoomNodeId.value = ''
  selectedEdgeId.value = ''
  nodeActionId.value = ''
  commitHistory()
}

function toggleEdges() {
  clearSelectedEdge()
  edgesVisible.value = !edgesVisible.value
  connectionInProgress.value = false
  connectionCompleted.value = false
  ElMessage.success(edgesVisible.value ? '工作流连线已显示' : '已进入干净模式')
}

function togglePanel(panel) {
  openPanel.value = openPanel.value === panel ? '' : panel
}

function useSuggestion(text) {
  assistantInput.value = text
  sendAssistantMessage()
}

// 精细编辑（改样式 / 调提示词结构 / 引用已有标记元素）需要助手知道节点内部结构。
// 只回传轻量信息：样式数值、提示词结构片（类型 + id 或简短文本）、已标记元素清单；
// 绝不回传缩略图 base64，避免把上下文撑爆。
function assistantNodeStructure(node) {
  const data = node?.data || {}
  const structure = {}
  if (node?.type === 'group') {
    structure.memberCount = nodes.value.filter((item) => item.parentNode === node.id).length
    structure.title = String(data.title || '分组').slice(0, 40)
  }
  if (data.mode === 'free-text' && data.style && typeof data.style === 'object') {
    structure.style = {
      color: data.style.color || '',
      fontFamily: data.style.fontFamily || '',
      fontSize: Number(data.style.fontSize) || 0,
      fontWeight: Number(data.style.fontWeight) || 0,
      textAlign: data.style.textAlign || '',
      width: Number(data.style.width) || 0,
      minHeight: Number(data.style.minHeight) || 0,
    }
  }
  if (Array.isArray(data.promptParts) && data.promptParts.length) {
    structure.promptParts = data.promptParts.slice(0, 40).map((part) => (
      part?.type === 'text'
        ? { type: 'text', text: String(part.text || '').slice(0, 300) }
        : { type: String(part?.type || ''), id: String(part?.id || '') }
    ))
  }
  if (Array.isArray(data.elements) && data.elements.length) {
    structure.elements = data.elements.slice(0, 12).map((element, index) => ({
      id: String(element?.id || ''),
      index: index + 1,
      content: String(element?.content || element?.label || '').slice(0, 60),
    }))
  }
  return structure
}

function assistantCanvasSnapshot(options = {}) {
  const withOutputs = options.withOutputs === true
  const includeStructure = options.includeStructure === true
  const upstreamOfSelected = new Set(
    selectedNode.value ? upstreamNodes(selectedNode.value.id).map((item) => item.id) : [],
  )
  return {
    nodes: nodes.value.map((node) => {
      const outputUrl = node.data?.output?.url || node.data?.image || ''
      // 默认只回传「有无结果」，避免每次请求都把 base64 大图塞进上下文。
      // 仅在助手明确需要看图（withOutputs）或该节点是当前操作对象/其上游时，才带上可读 URL。
      const includeUrl = withOutputs || node.id === selectedNodeId.value || upstreamOfSelected.has(node.id)
      return {
        id: node.id,
        type: node.type,
        position: { x: Number(node.position?.x || 0), y: Number(node.position?.y || 0) },
        // 分组（真父子）：只有存在时才回传，老画布不受影响。
        ...(node.parentNode ? { parentNode: node.parentNode } : {}),
        data: {
          mode: node.data?.mode || '',
          title: node.data?.title || '',
          prompt: String(node.data?.prompt || '').slice(0, 1200),
          text: String(node.data?.text || '').slice(0, 1200),
          outputText: String(node.data?.output?.text || '').slice(0, 1200),
          generationType: node.data?.generationType || '',
          status: node.data?.status || node.data?.state || '',
          hasImage: Boolean(node.data?.image || node.data?.output?.url),
          hasVideo: Boolean(node.data?.output?.url && node.data?.generationType === 'video'),
          assetId: node.data?.assetId || node.data?.output?.assetId || '',
          config: node.data?.config || {},
          ...(includeStructure ? assistantNodeStructure(node) : {}),
          ...(includeUrl && outputUrl ? { outputUrl } : {}),
        },
      }
    }),
    edges: edges.value.map((item) => ({ id: item.id, source: item.source, target: item.target })),
    summary: {
      nodeCount: nodes.value.length,
      edgeCount: edges.value.length,
      selected: selectedNodeId.value || '',
      imageNodes: nodes.value.filter((node) => node.data?.image || node.data?.output?.url).length,
      groupCount: nodes.value.filter((node) => node.type === 'group').length,
    },
  }
}

// 供 AI 助手理解画布：真实存在的 7 类节点 + 各自用途与连线方向。
// generate 字段区分「可被助手 create_node 创建」与「仅可被已有画布引用」。
function assistantAvailableNodeTypes() {
  return [
    { nodeType: 'upload', mode: 'upload', label: '上传图片', canCreate: false, role: '素材来源', accepts: false, produces: true, desc: '承载用户上传的图片素材，作为下游生图/生视频的参考图或垫图。只能由用户手动上传，助手不能创建，但可读取其图片并由 create_edge 连到生成节点。' },
    { nodeType: 'prompt', mode: 'prompt', label: '提示词', canCreate: false, role: '提示词来源', accepts: true, produces: true, desc: '承载一段提示词文本，可接收上游内容并输出给下游生成节点。助手一般不创建，优先复用；如需写入提示词请用 update_node 改生成节点的 prompt。' },
    { nodeType: 'text', mode: 'text-generation', label: '文字生成', canCreate: true, role: '生成节点', accepts: true, produces: true, desc: '调用文本模型生成文案、脚本、课程方案等文字结果。可用 create_node 创建，data.prompt 写指令。' },
    { nodeType: 'image', mode: 'image-generation', label: '图像生成', canCreate: true, role: '生成节点', accepts: true, produces: true, desc: '调用图像模型生图。可用 create_node 创建，data.prompt 写画面描述，data.config 可带 model/ratio/resolution。上游连入 upload 节点可作为参考图。' },
    { nodeType: 'video', mode: 'video-generation', label: '视频生成', canCreate: true, role: '生成节点', accepts: true, produces: true, desc: '调用视频模型生成视频。可用 create_node 创建，data.config 可带 model/duration(5/10)/ratio/resolution。上游可连 image/upload 作为首帧参考。' },
    { nodeType: 'result', mode: 'image-result|result', label: '结果展示', canCreate: false, role: '结果展示', accepts: true, produces: false, desc: '承载生成结果用于展示与后续标记引用。由生成流程自动产生，助手不要创建。' },
    { nodeType: 'config', mode: 'generation-config', label: '生成配置', canCreate: false, role: '配置面板', accepts: true, produces: true, desc: '画布右下角的生成配置节点，集中设置生成类型/模型/比例/提示词并触发生成。助手不要创建或删除它。' },
    { nodeType: 'group', mode: 'group', label: '画布分组', canCreate: false, role: '组织容器', accepts: false, produces: false, desc: '把多个节点归为一个可整体拖动的分组（VueFlow 真父子，成员被约束在组框内）。助手不要用 create_node 创建它；要把已有节点归组请用 group_nodes（nodeIds + title），要解散请用 ungroup_nodes（groupIds）。分组只做组织，不参与数据流转。' },
  ]
}

function assistantNodeId(id, createdIds = new Map()) {
  const value = String(id || '')
  return createdIds.get(value) || (nodes.value.some((node) => node.id === value) ? value : '')
}

function finitePosition(position, fallback) {
  const x = Number(position?.x)
  const y = Number(position?.y)
  return { x: Number.isFinite(x) ? x : fallback.x, y: Number.isFinite(y) ? y : fallback.y }
}

function generatorNodeData(nodeType, data = {}) {
  if (nodeType === 'text') return {
    mode: 'text-generation', title: data.title || '文字生成', prompt: String(data.prompt || ''), status: 'idle',
    config: { model: data.config?.model || configuredTextModels.value[0] || '' },
  }
  if (nodeType === 'video') return {
    mode: 'video-generation', title: data.title || '视频生成', prompt: String(data.prompt || ''), status: 'idle',
    config: { model: data.config?.model || configuredVideoModels.value[0] || 'agnes-video-v2.0', duration: Number(data.config?.duration || 5), ratio: data.config?.ratio || '16:9', resolution: data.config?.resolution || '720P' },
  }
  return {
    mode: 'image-generation', title: data.title || '图像生成', prompt: String(data.prompt || ''), status: 'idle',
    config: { model: data.config?.model || configuredImageModels.value[0] || 'agnes-image-2.1-flash', ratio: data.config?.ratio || '1:1', resolution: data.config?.resolution || '1080P' },
  }
}

function applyAssistantNodePatch(node, patch = {}) {
  const data = patch.data && typeof patch.data === 'object' ? patch.data : patch
  if (typeof data.title === 'string') node.data.title = data.title.slice(0, 160)
  if (typeof data.prompt === 'string') node.data.prompt = data.prompt.slice(0, 4000)
  if (typeof data.text === 'string') node.data.text = data.text.slice(0, 6000)
  if (typeof data.status === 'string' && ['idle', 'running', 'succeeded', 'failed'].includes(data.status)) node.data.status = data.status
  if (data.config && typeof data.config === 'object') node.data.config = { ...(node.data.config || {}), ...data.config }
  // 自由文本节点（free-text）的样式与尺寸：复用节点自身的 style 结构，仅对 free-text 生效，
  // 避免把排版样式误写到图像/视频等生成节点上。
  const style = data.style || data.presentation
  if (node.data.mode === 'free-text' && style && typeof style === 'object') {
    const next = { ...(node.data.style || {}) }
    if (typeof style.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(style.color)) next.color = style.color
    if (typeof style.fontFamily === 'string' && style.fontFamily.trim()) next.fontFamily = style.fontFamily.trim().slice(0, 60)
    if (Number.isFinite(Number(style.fontSize))) next.fontSize = Math.min(240, Math.max(12, Number(style.fontSize)))
    if (Number.isFinite(Number(style.fontWeight))) next.fontWeight = Math.min(900, Math.max(100, Number(style.fontWeight)))
    if (['left', 'center', 'right'].includes(style.textAlign)) next.textAlign = style.textAlign
    if (Number.isFinite(Number(style.width))) next.width = Math.min(1200, Math.max(120, Number(style.width)))
    if (Number.isFinite(Number(style.minHeight))) next.minHeight = Math.min(1200, Math.max(40, Number(style.minHeight)))
    node.data.style = next
  }
}

async function executeAssistantActions(actions = []) {
  if (!Array.isArray(actions) || !actions.length) throw new Error('AI 没有返回可执行的画布操作')
  const before = { nodes: JSON.stringify(nodes.value), edges: JSON.stringify(edges.value) }
  const createdIds = new Map()
  const affected = []
  const executionLog = []
  // 记录每步「执行前」的历史快照下标，供单步撤销精确定位。
  const stepCheckpoints = []
  try {
    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index] || {}
      const type = String(action.type || '')
      executionLog.push({ index, type, status: 'running' })
      const beforeIndex = historyIndex.value
      if (type === 'create_node') {
        const nodeType = ['text', 'image', 'video'].includes(action.nodeType) ? action.nodeType : ''
        if (!nodeType) throw new Error(`第 ${index + 1} 步包含不支持的节点类型`)
        const fallback = nodes.value[nodes.value.length - 1]?.position || { x: 120, y: 120 }
        const node = createNode(nodeType, generatorNodeData(nodeType, action.data || {}))
        node.position = finitePosition(action.position, { x: fallback.x + 360, y: fallback.y })
        nodes.value = [...nodes.value, node]
        if (action.clientId) createdIds.set(String(action.clientId), node.id)
        affected.push(node.id)
        executionLog[index].status = 'succeeded'
        commitHistory()
        stepCheckpoints.push({ index, type, beforeIndex })
        continue
      }
      if (type === 'update_node') {
        const id = assistantNodeId(action.nodeId || action.targetNodeId, createdIds)
        const node = nodes.value.find((item) => item.id === id)
        if (!node) throw new Error(`第 ${index + 1} 步找不到要修改的节点`)
        applyAssistantNodePatch(node, action.data || action.patch || {})
        affected.push(node.id)
        executionLog[index].status = 'succeeded'
        commitHistory()
        stepCheckpoints.push({ index, type, beforeIndex })
        continue
      }
      if (type === 'move_node') {
        const id = assistantNodeId(action.nodeId || action.targetNodeId, createdIds)
        const node = nodes.value.find((item) => item.id === id)
        if (!node) throw new Error(`第 ${index + 1} 步找不到要移动的节点`)
        node.position = finitePosition(action.position, node.position || { x: 0, y: 0 })
        affected.push(node.id)
        executionLog[index].status = 'succeeded'
        commitHistory()
        stepCheckpoints.push({ index, type, beforeIndex })
        continue
      }
      if (type === 'delete_node') {
        const id = assistantNodeId(action.nodeId || action.targetNodeId, createdIds)
        if (!id || !nodes.value.some((item) => item.id === id)) throw new Error(`第 ${index + 1} 步找不到要删除的节点`)
        nodes.value = nodes.value.filter((item) => item.id !== id)
        edges.value = edges.value.filter((item) => item.source !== id && item.target !== id)
        executionLog[index].status = 'succeeded'
        commitHistory()
        stepCheckpoints.push({ index, type, beforeIndex })
        continue
      }
      if (type === 'create_edge') {
        const source = assistantNodeId(action.source, createdIds)
        const target = assistantNodeId(action.target, createdIds)
        if (!source || !target || source === target) throw new Error(`第 ${index + 1} 步的连线端点无效`)
        if (!edges.value.some((item) => item.source === source && item.target === target)) {
          edges.value = addEdge(edge(action.id || `agent-edge-${Date.now()}-${index}`, source, target), edges.value)
        }
        if (!edges.value.some((item) => item.source === source && item.target === target)) throw new Error(`第 ${index + 1} 步连线写入失败`)
        executionLog[index].status = 'succeeded'
        commitHistory()
        stepCheckpoints.push({ index, type, beforeIndex })
        continue
      }
      if (type === 'delete_edge') {
        const edgeId = String(action.edgeId || action.id || '')
        const source = assistantNodeId(action.source, createdIds)
        const target = assistantNodeId(action.target, createdIds)
        const beforeCount = edges.value.length
        edges.value = edges.value.filter((item) => edgeId ? item.id !== edgeId : !(item.source === source && item.target === target))
        if (edges.value.length === beforeCount) throw new Error(`第 ${index + 1} 步找不到要删除的连线`)
        executionLog[index].status = 'succeeded'
        commitHistory()
        stepCheckpoints.push({ index, type, beforeIndex })
        continue
      }
      if (type === 'reference_element') {
        const targetId = assistantNodeId(action.nodeId || action.targetNodeId, createdIds)
        const target = nodes.value.find((item) => item.id === targetId)
        if (!target) throw new Error(`第 ${index + 1} 步找不到要引用标记元素的节点`)
        const sourceId = assistantNodeId(action.source || action.sourceNodeId, createdIds)
        const source = nodes.value.find((item) => item.id === sourceId)
        const sourceElements = Array.isArray(source?.data?.elements) ? source.data.elements : []
        const wanted = Array.isArray(action.elementIds) && action.elementIds.length ? action.elementIds.map((value) => String(value)) : null
        const picked = sourceElements.filter((element) => element && (!wanted || wanted.includes(String(element.id))))
        if (!picked.length) throw new Error(`第 ${index + 1} 步没有可引用的标记元素`)
        // 元素对象随片一起并入目标节点：提示词与参考图都按 id 从「本节点 data.elements」解析，
        // 跨节点引用必须把元素复制过来，否则两边都取不到。
        const targetElements = Array.isArray(target.data.elements) ? [...target.data.elements] : []
        const knownIds = new Set(targetElements.map((element) => String(element?.id || '')))
        const additions = picked.filter((element) => !knownIds.has(String(element.id)))
        if (additions.length) {
          additions.forEach((element) => { targetElements.push({ ...element }); knownIds.add(String(element.id)) })
          target.data.elements = targetElements
        }
        const baseParts = Array.isArray(target.data.promptParts) && target.data.promptParts.length
          ? target.data.promptParts
          : (String(target.data.prompt || '').trim() ? [{ type: 'text', text: String(target.data.prompt) }] : [])
        const partIds = new Set(baseParts.filter((part) => part?.type === 'element').map((part) => String(part.id)))
        const newParts = additions.filter((element) => !partIds.has(String(element.id))).map((element) => ({ type: 'element', id: String(element.id) }))
        if (newParts.length) {
          target.data.promptParts = [...baseParts, ...newParts]
          target.data.prompt = promptPartsText(target.data.promptParts)
        }
        affected.push(target.id)
        executionLog[index].status = 'succeeded'
        commitHistory()
        stepCheckpoints.push({ index, type, beforeIndex })
        continue
      }
      if (type === 'run_generator') {
        const id = assistantNodeId(action.nodeId || action.targetNodeId, createdIds)
        if (!id || !nodes.value.some((item) => item.id === id)) throw new Error(`第 ${index + 1} 步找不到要运行的节点`)
        await runGenerator(id, { recordHistory: false, throwOnError: true, count: Number(action.count) || 1 })
        affected.push(id)
        executionLog[index].status = 'succeeded'
        commitHistory()
        stepCheckpoints.push({ index, type, beforeIndex })
        continue
      }
      if (type === 'group_nodes') {
        const ids = (Array.isArray(action.nodeIds) ? action.nodeIds : [])
          .map((value) => assistantNodeId(value, createdIds))
          .filter(Boolean)
        const groupId = groupNodes(ids, action.title || '分组')
        if (!groupId) throw new Error(`第 ${index + 1} 步成组失败（至少需要 2 个未成组的顶层节点）`)
        affected.push(groupId)
        executionLog[index].status = 'succeeded'
        commitHistory()
        stepCheckpoints.push({ index, type, beforeIndex })
        continue
      }
      if (type === 'ungroup_nodes') {
        const ids = (Array.isArray(action.groupIds) ? action.groupIds : [])
          .map((value) => assistantNodeId(value, createdIds))
          .filter(Boolean)
        if (!ids.length) throw new Error(`第 ${index + 1} 步没有指定要解散的分组`)
        const moved = ungroupNodes(ids)
        if (!moved) throw new Error(`第 ${index + 1} 步没有可解散的分组`)
        executionLog[index].status = 'succeeded'
        commitHistory()
        stepCheckpoints.push({ index, type, beforeIndex })
        continue
      }
      if (type === 'add_element_reference') {
        const initiateId = assistantNodeId(action.initiateNodeId || action.nodeId || action.targetNodeId, createdIds)
        const sourceId = assistantNodeId(action.sourceNodeId || action.source, createdIds)
        if (!initiateId || !sourceId) throw new Error(`第 ${index + 1} 步的元素引用端点无效`)
        await createElementFromRegion({
          initiateNodeId: initiateId,
          sourceNodeId: sourceId,
          region: action.region,
          label: action.label || '',
        })
        affected.push(initiateId)
        executionLog[index].status = 'succeeded'
        commitHistory()
        stepCheckpoints.push({ index, type, beforeIndex })
        continue
      }
      if (type === 'save_as_template') {
        const ids = (Array.isArray(action.nodeIds) ? action.nodeIds : [])
          .map((value) => assistantNodeId(value, createdIds))
          .filter(Boolean)
        if (!ids.length) throw new Error(`第 ${index + 1} 步没有指定要存为模板的节点`)
        const graph = extractSubgraph(ids)
        if (!graph.nodes.length) throw new Error(`第 ${index + 1} 步的节点无法组成模板`)
        const saved = await saveCanvasTemplate({
          name: String(action.name || '').trim() || `模板 ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
          description: action.description || '',
          scope: action.scope === 'org' ? 'org' : 'private',
          graph,
        })
        if (!saved) throw new Error(`第 ${index + 1} 步保存模板失败`)
        await refreshCanvasTemplates()
        affected.push(ids[0])
        executionLog[index].status = 'succeeded'
        stepCheckpoints.push({ index, type, beforeIndex })
        continue
      }
      if (type === 'instantiate_template') {
        const templateId = String(action.templateId || '').trim()
        if (!templateId) throw new Error(`第 ${index + 1} 步没有指定要套用的模板`)
        const template = await getCanvasTemplate(templateId)
        if (!template?.graph?.nodes?.length) throw new Error(`第 ${index + 1} 步找不到可用的模板`)
        const newIds = instantiateTemplate(template, action.position)
        if (!newIds.length) throw new Error(`第 ${index + 1} 步套用模板失败`)
        newIds.forEach((id) => affected.push(id))
        executionLog[index].status = 'succeeded'
        commitHistory()
        stepCheckpoints.push({ index, type, beforeIndex })
        continue
      }
      throw new Error(`第 ${index + 1} 步包含未知操作 ${type || '空操作'}`)
    }
    selectedNodeId.value = affected[affected.length - 1] || selectedNodeId.value
    expandedNodeId.value = ['image', 'video'].includes(nodes.value.find((item) => item.id === selectedNodeId.value)?.type) ? selectedNodeId.value : ''
    // 保持助手面板打开，用户才能看到执行小票；不再强制切到设置面板。
    if (openPanel.value !== 'assistant') openPanel.value = 'settings'
    // 失败回滚时也要能回到执行前的原始状态
    return { affected, executionLog, stepCheckpoints }
  } catch (error) {
    const failedIndex = executionLog.findIndex((item) => item.status === 'running')
    if (failedIndex >= 0) executionLog[failedIndex].status = 'failed'
    console.warn('[canvas-agent] workflow execution failed', { error: error?.message || String(error), executionLog })
    nodes.value = JSON.parse(before.nodes)
    edges.value = JSON.parse(before.edges)
    throw error
  }
}

// 助手动作 → 中文名，用于单步执行小票展示。
const ASSISTANT_ACTION_LABELS = {
  create_node: '创建节点',
  update_node: '修改节点',
  move_node: '移动节点',
  delete_node: '删除节点',
  create_edge: '连接节点',
  delete_edge: '断开连线',
  run_generator: '执行生成',
  reference_element: '引用标记元素',
  group_nodes: '归为一组',
  ungroup_nodes: '解散分组',
  add_element_reference: '裁剪局部参考',
  save_as_template: '存为模板',
  instantiate_template: '套用模板',
}

// 这些动作不改画布（是服务端副作用），小票不提供单步撤销。
const ASSISTANT_NO_UNDO_ACTIONS = new Set(['save_as_template'])

// 供助手选用的模板清单（只带轻量摘要，不含 graph）。
function assistantTemplateSummaries() {
  return canvasTemplates.value.slice(0, 20).map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description || '',
    scope: item.scope || 'private',
    nodeCount: Number(item.nodeCount || 0),
  }))
}

function assistantActionDescription(action = {}) {
  const label = ASSISTANT_ACTION_LABELS[action.type] || action.type || '未知操作'
  const targetId = action.nodeId || action.targetNodeId || action.clientId || ''
  const node = targetId ? nodes.value.find((item) => item.id === targetId) : null
  const targetTitle = node?.data?.title || action?.data?.title || ''
  const typeLabel = { text: '文字', image: '图像', video: '视频' }[action.nodeType] || ''
  const detail = action.type === 'create_node' && typeLabel ? `新建${typeLabel}节点`
    : action.type === 'create_edge' || action.type === 'delete_edge' ? '调整连线'
    : action.type === 'group_nodes' ? `${Array.isArray(action.nodeIds) ? action.nodeIds.length : 0} 个节点 → 「${String(action.title || '分组').slice(0, 20)}」`
    : action.type === 'ungroup_nodes' ? `${Array.isArray(action.groupIds) ? action.groupIds.length : 0} 个分组`
    : action.type === 'add_element_reference' ? '裁一块图作为局部参考'
    : action.type === 'save_as_template' ? `${Array.isArray(action.nodeIds) ? action.nodeIds.length : 0} 个节点 → 「${String(action.name || '新模板').slice(0, 20)}」`
    : action.type === 'instantiate_template' ? `模板「${canvasTemplates.value.find((item) => item.id === action.templateId)?.name || action.templateId || ''}」`
    : targetTitle ? `「${String(targetTitle).slice(0, 20)}」` : ''
  return { label, detail, targetId }
}

// 执行小票：一步一票，可单独撤销。
// 每步执行后 commitHistory 会压入新的快照，此处记录「该步之前」的快照下标，
// 撤销即把画布回退到那一步之前的完整状态。
function assistantStepTicket(action, index, stepCount, beforeIndex) {
  const { label, detail } = assistantActionDescription(action)
  return {
    id: `assistant-ticket-${Date.now()}-${index}`,
    role: 'assistant',
    kind: 'ticket',
    text: `${index + 1}/${stepCount} ${label}${detail ? ` · ${detail}` : ''}`,
    historyIndex: beforeIndex,
    undone: false,
    noUndo: ASSISTANT_NO_UNDO_ACTIONS.has(action.type),
  }
}

function undoAssistantStep(message) {
  if (!message || message.undone) return
  const target = Number(message.historyIndex)
  if (!Number.isFinite(target) || target < 0 || target >= historySnapshots.value.length) {
    ElMessage.warning('这一步已无法单独撤销，请使用画布撤销按钮')
    return
  }
  historyIndex.value = target
  restoreHistorySnapshot()
  message.undone = true
  ElMessage.success('已撤销这一步')
}

async function sendAssistantMessage() {
  if (!configuredTextModels.value.length) {
    ElMessage.warning('暂无可用文本模型，请联系管理员开启模型后刷新页面')
    return
  }
  const text = assistantInput.value.trim()
  const attachment = assistantAttachment.value
  if (!text && !attachment) return
  if (assistantRunning.value) return

  aiMessages.value.push({ id: `user-${Date.now()}`, role: 'user', text: text || '请分析这个附件' })
  assistantInput.value = ''
  assistantRunning.value = true
  try {
    // 附件真解析：图片走视觉模型转成文字描述，注入上下文。
    let attachmentContext = ''
    if (attachment) {
      aiMessages.value.push({ id: `assistant-reading-${Date.now()}`, role: 'assistant', kind: 'note', text: `正在读取附件「${attachment.name}」…` })
      try {
        const parsed = await requestCanvasAttachment({ name: attachment.name, mime: attachment.mime, dataUrl: attachment.dataUrl })
        attachmentContext = `\n\n【用户提供的附件分析】${parsed.description}`
      } catch (error) {
        aiMessages.value.push({ id: `assistant-attach-error-${Date.now()}`, role: 'assistant', text: `附件「${attachment.name}」读取失败：${error?.response?.data?.message || error.message || '未知错误'}。可改为用文字描述。` })
      }
      assistantAttachment.value = null
    }
    // 用户提到"看/检查/评价/这张图"等，说明需要助手真正读图 → 携带输出 URL。
    const wantsVision = /(看看|看一下|看下|检查|评价|点评|这张|这幅|画面|构图|配色|结果怎么样|效果怎么样)/.test(text)
    // 助手需要知道有哪些模板可用；模板是低频读，缺失时补一次。
    if (!canvasTemplates.value.length) await refreshCanvasTemplates()
    const basePayload = {
      operation: 'assist',
      model: assistantModel.value,
      provider: configuredModelProviders.value[assistantModel.value] || '',
      selectedNode: assistantNodeContext(selectedNode.value),
      upstream: selectedNode.value ? upstreamNodes(selectedNode.value.id).map(assistantNodeContext) : [],
      availableNodeTypes: assistantAvailableNodeTypes(),
      availableTemplates: assistantTemplateSummaries(),
    }
    let result = await requestCanvasAssistant({
      ...basePayload,
      message: (text || '请分析当前画布并搭建合理的工作流') + attachmentContext,
      canvas: assistantCanvasSnapshot({ withOutputs: wantsVision, includeStructure: true }),
      conversation: assistantConversation.value,
      agentState: assistantAgentState.value,
    })
    // 模糊目标必须先完成需求澄清，防止模型猜测后直接污染画布。
    const clarificationOnly = /^(请|帮我|我想|我要)?\s*(做|创建|搭建|生成)?\s*(一个)?\s*(电商|商品|促销|活动|产品|品牌)?\s*(海报|视频|图片|工作流)(工作流|流程)?(的)?[。！!？?\s]*$/i.test(text)
    if (clarificationOnly && result.actions?.length) {
      result.actions = []
      result.reply = '为了准确搭建工作流，请先告诉我：主题或内容是什么？是否有参考素材？最终要输出图片、视频还是其他结果？'
    }
    assistantAgentState.value = { ...assistantAgentState.value, ...(result.agentState || {}), phase: result.phase || assistantAgentState.value.phase, plan: result.plan || assistantAgentState.value.plan }
    if (result.actions?.length) {
      if (result.reply) aiMessages.value.push({ id: `assistant-plan-${Date.now()}`, role: 'assistant', text: result.reply })
      // 后端一次性返回按依赖排序的完整计划，前端整批执行（不再是「执行一步→再问一步」）。
      // 每一步执行前都会 commitHistory，因此仍按 stepCheckpoints 生成可单步撤销的小票。
      const actions = result.actions
      assistantAgentState.value = { ...assistantAgentState.value, phase: 'executing', updatedAt: new Date().toISOString() }
      const { stepCheckpoints } = await executeAssistantActions(actions)
      stepCheckpoints.forEach((checkpoint, ticketIndex) => {
        const action = actions[checkpoint.index] || actions[ticketIndex] || {}
        aiMessages.value.push(assistantStepTicket(action, ticketIndex, actions.length, checkpoint.beforeIndex ?? historyIndex.value))
      })
      assistantAgentState.value = { ...assistantAgentState.value, phase: 'completed', lastActionResult: `已执行 ${actions.length} 步`, updatedAt: new Date().toISOString() }
      aiMessages.value.push({ id: `assistant-${Date.now()}`, role: 'assistant', text: `工作流执行完成，共 ${actions.length} 步。每一步都可在上方小票中单独撤销。` })
    } else {
      // 看图评价：后端给出可重绘的 refinePrompt 时渲染成评价卡，可一键按建议重绘。
      const refinePrompt = String(result.refinePrompt || '').trim()
      aiMessages.value.push({ id: `assistant-${Date.now()}`, role: 'assistant', kind: refinePrompt ? 'evaluation' : '', text: result.reply || '请补充需求后继续。', refinePrompt })
    }
    if (result.warnings?.length) aiMessages.value.push({ id: `assistant-warning-${Date.now()}`, role: 'assistant', text: result.warnings.join('；') })
  } catch (error) {
    aiMessages.value.push({
      id: `assistant-error-${Date.now()}`,
      role: 'assistant',
      text: error?.response?.data?.message || error.message || 'AI 画布助手暂时不可用，请稍后重试。',
    })
  } finally {
    saveAssistantSession()
    assistantRunning.value = false
  }
}

async function handleAssistantUpload(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (file.size > 8 * 1024 * 1024) {
    ElMessage.warning('对话附件请控制在 8MB 以内')
    return
  }
  const mime = file.type || ''
  const isImage = /^image\//.test(mime)
  const isText = /^text\//.test(mime) || /\.(txt|md|csv)$/i.test(file.name)
  if (!isImage && !isText) {
    ElMessage.warning('目前仅支持图片（PNG/JPG 等）或纯文本（TXT/MD）附件')
    return
  }
  try {
    const dataUrl = await readFileAsDataUrl(file)
    // 文本类直接取正文；图片保留 dataUrl 交给后端视觉模型。
    const textContent = isText ? dataUrl.replace(/^data:[^,]*,/, '') : ''
    assistantAttachment.value = {
      name: file.name,
      mime,
      size: file.size,
      kind: isImage ? 'image' : 'text',
      dataUrl: isImage ? dataUrl : '',
      text: textContent,
    }
    ElMessage.success(isImage ? '图片已加入，发送后我会先读图' : '文本已加入本次对话')
  } catch (error) {
    ElMessage.error(error.message || '附件读取失败')
  }
}

function toggleVoiceInput() {
  if (voiceListening.value) {
    speechRecognizer?.stop?.()
    voiceListening.value = false
    return
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) {
    ElMessage.info('当前浏览器暂不支持语音识别，请使用文字输入')
    return
  }

  speechRecognizer = new SpeechRecognition()
  speechRecognizer.lang = 'zh-CN'
  speechRecognizer.interimResults = true
  speechRecognizer.continuous = false
  speechRecognizer.onresult = (event) => {
    assistantInput.value = Array.from(event.results)
      .map((result) => result[0]?.transcript || '')
      .join('')
      .trim()
  }
  speechRecognizer.onerror = () => {
    voiceListening.value = false
    ElMessage.warning('没有识别到语音，请重试或改用文字输入')
  }
  speechRecognizer.onend = () => {
    voiceListening.value = false
  }
  try {
    speechRecognizer.start()
    voiceListening.value = true
  } catch {
    voiceListening.value = false
    ElMessage.warning('语音输入启动失败，请稍后重试')
  }
}

function applyAssistantProposal(proposal) {
  if (!proposal || !selectedNode.value) {
    ElMessage.warning('请先选中一个画布节点，再让助手执行操作')
    return
  }
  const target = nodes.value.find((node) => node.id === proposal.targetNodeId) || selectedNode.value
  if (proposal.type === 'set_node_text') {
    if (target.data.mode === 'text-generation') target.data.output = { text: proposal.payload?.text || '' }
    else target.data.text = proposal.payload?.text || target.data.text
  } else if (proposal.type === 'set_node_prompt') {
    target.data.prompt = proposal.payload?.prompt || target.data.prompt
    target.data.error = ''
  } else if (proposal.type === 'create_generator_and_connect') {
    const mode = ['image-generation', 'video-generation'].includes(proposal.payload?.mode) ? proposal.payload.mode : 'image-generation'
    const type = mode === 'video-generation' ? 'video' : 'image'
    const newNode = createNode(type, {
      mode,
      title: mode === 'video-generation' ? '视频生成' : '图像生成',
      prompt: proposal.payload?.prompt || '',
      status: 'idle',
      config: mode === 'video-generation'
        ? { model: 'agnes-video-v2.0', duration: 5, ratio: '16:9', resolution: '1080P' }
        : { model: 'agnes-image-2.1-flash', ratio: '1:1', resolution: '1080P' },
    })
    newNode.position = { x: target.position.x + 320, y: target.position.y }
    nodes.value = [...nodes.value, newNode]
    edges.value = addEdge(edge(`edge-${target.id}-${newNode.id}`, target.id, newNode.id), edges.value)
    selectedNodeId.value = newNode.id
  } else {
    ElMessage.warning('这项 AI 建议暂不支持自动应用')
    return
  }
  openPanel.value = 'settings'
  commitHistory()
  ElMessage.success('AI 助手已将修改应用到画布')
}

function syncVideoNode() {
  const videoNode = nodes.value.find((node) => node.id === selectedNodeId.value && node.type === 'video')
    || nodes.value.find((node) => node.type === 'video')
  if (!videoNode) return
  videoNode.data = { ...videoNode.data, prompt: settings.prompt }
}

function resultStateText(state) {
  if (state === 'running') return '生成中'
  if (state === 'ready') return '结果已就绪'
  return '等待运行'
}

function zoomInCanvas() {
  zoomIn({ duration: 180 })
}

function zoomOutCanvas() {
  zoomOut({ duration: 180 })
}

function fitCanvas() {
  fitView({ padding: 0.28, duration: 260, maxZoom: 1.05 })
}

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.()
  else document.exitFullscreen?.()
}

function goBack() {
  if (props.adminMode) {
    emit('close')
    return
  }
  router.push('/student/paint')
}

// 后台「文件 → 保存草稿」：画布本身不落库，真正的保存由外层页面负责，
// 这里只把「用户点了保存」这件事报上去（外层会带着最新快照去写草稿）。
function saveAdminDraft() {
  if (props.adminSaving) return
  emit('request-save')
}

// 后台「文件 → 用户使用页面」：H5 工作流的第二步，交给外层路由跳转。
function openAdminStudentPage() {
  emit('open-student-page')
}

function goToWorkbench() {
  router.push('/student/workbench')
}

function toggleFileMenu() {
  fileMenuOpen.value = !fileMenuOpen.value
  // 同一时间只开一个浮层，避免「文件」菜单和创作面板叠在一起。
  if (fileMenuOpen.value) {
    createMenuOpen.value = false
    nodeActionId.value = ''
  }
}

function closeFileMenu() {
  fileMenuOpen.value = false
}

// 点击菜单项：先收起菜单，再执行原有动作（原动作里的二次确认弹窗保持原样）。
function runFileMenuAction(action) {
  fileMenuOpen.value = false
  if (typeof action === 'function') action()
}

function handleFileMenuPointerDown(event) {
  if (!fileMenuOpen.value) return
  const wrap = fileMenuWrap.value
  if (wrap && event.target instanceof Node && wrap.contains(event.target)) return
  fileMenuOpen.value = false
}

function createCanvasResourceKey() {
  const suffix = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return `canvas:${sourceProject.id}:${suffix}`
}

function resetCanvasSettings() {
  Object.assign(settings, {
    prompt: '生成一段高级感运动鞋广告视频，镜头缓慢环绕，柔和棚拍光线',
    model: 'agnes-video-v2.0',
    duration: 8,
    ratio: '16:9',
    resolution: '1080P',
    creativity: 65,
  })
}

function createNewCanvas() {
  if (!window.confirm('确定新建画布吗？当前未保存内容可能无法恢复。')) return
  if (saveTimer) window.clearTimeout(saveTimer)
  serverCanvasDocument.value = null
  // 新画布要跟上一张彻底断开，否则下次刷新又会被拉回旧画布。
  forgetCanvasDocument()
  canvasResourceKey.value = createCanvasResourceKey()
  // 留空即显示默认名「未命名无限画布」，用户点一下就能改成自己的名字。
  canvasTitle.value = ''
  canvasNameEditing.value = false
  nodes.value = []
  edges.value = []
  resetCanvasSettings()
  edgesVisible.value = true
  selectedNodeId.value = ''
  selectedEdgeId.value = ''
  expandedNodeId.value = ''
  textAgentNodeId.value = ''
  textEditingNodeId.value = ''
  clearEdgeUndoNotice()
  historySnapshots.value = []
  historyIndex.value = -1
  commitHistory(true)
  saveState.value = SERVER_AUTH_MODE ? '新画布未保存' : '新画布已创建'
  ElMessage.success('已新建空白无限画布')
}

async function deleteCurrentCanvas() {
  if (!serverCanvasDocument.value) {
    // 本机画布也按账号存，所以「有没有」和「删哪个」都要问当前账号那一条
    if (!SERVER_AUTH_MODE && readAccountText(STORAGE_KEY, accountId.value)) {
      if (!window.confirm('确定删除当前本机画布吗？')) return
      removeAccountText(STORAGE_KEY, accountId.value)
      ElMessage.success('当前画布已删除')
      router.push('/student/workbench')
      return
    }
    ElMessage.info('当前没有已保存的无限画布')
    return
  }
  if (!window.confirm('确定删除当前画布吗？删除后不会影响 AI 绘画项目。')) return
  if (saveTimer) window.clearTimeout(saveTimer)
  try {
    await apiClient.delete(`/me/documents/${serverCanvasDocument.value.id}`)
    forgetCanvasDocument()
    serverCanvasDocument.value = null
    canvasResourceKey.value = ''
    ElMessage.success('当前画布已删除')
    router.push('/student/workbench')
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '删除画布失败，请稍后重试')
  }
}

async function saveCanvasToLibrary() {
  try {
    await saveCanvas()
    ElMessage.success('无限画布已保存到素材库')
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '保存画布失败，请稍后重试')
  }
}

function resetWorkflow() {
  if (!window.confirm('确定重置当前画布吗？')) return
  nodes.value = resetWorkflowNodes()
  edges.value = resetWorkflowEdges()
  resetCanvasSettings()
  edgesVisible.value = true
  selectedNodeId.value = 'video-1'
  selectedEdgeId.value = ''
  clearEdgeUndoNotice()
  historySnapshots.value = []
  historyIndex.value = -1
  commitHistory(true)
  window.setTimeout(fitCanvas, 40)
}

function handleShortcut(event) {
  const target = event.target
  if (event.key === 'Escape' && textZoomNodeId.value) {
    event.preventDefault()
    closeTextZoom()
    return
  }
  if (event.key === 'Escape' && promptZoomNodeId.value) {
    event.preventDefault()
    closePromptZoom()
    return
  }
  if (event.key === 'Escape' && elementMenu.value) {
    event.preventDefault()
    closeElementMenu()
    return
  }
  if (event.key === 'Escape' && markingState.active) {
    event.preventDefault()
    closeMarking()
    return
  }
  if (event.key === 'Escape' && upstreamPreview.value) {
    event.preventDefault()
    closeUpstreamPreview()
    return
  }
  if (event.key === 'Escape' && fileMenuOpen.value) {
    event.preventDefault()
    closeFileMenu()
    return
  }
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) return
  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedEdge.value) {
    event.preventDefault()
    deleteSelectedEdge()
    return
  }
  if ((event.key === 'Delete' || event.key === 'Backspace')) {
    const selectedGraphNode = nodes.value.find((node) => node.selected)
    if (selectedGraphNode) {
      event.preventDefault()
      deleteNode(selectedGraphNode.id)
      return
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    event.shiftKey ? redo() : undo()
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    redo()
  }
}

function serializeCanvas() {
  const nodeIds = new Set(nodes.value.map((node) => node.id))
  return {
    version: 2,
    nodes: nodes.value.map((node) => ({
      id: node.id,
      type: node.type,
      position: { x: node.position.x, y: node.position.y },
      data: JSON.parse(JSON.stringify(node.data || {})),
      // 分组（真父子）字段：只在存在时写入，老画布格式与 version 完全不变。
      ...(node.parentNode ? { parentNode: node.parentNode } : {}),
      ...(node.extent ? { extent: node.extent } : {}),
      ...(Number.isFinite(node.width) ? { width: node.width } : {}),
      ...(Number.isFinite(node.height) ? { height: node.height } : {}),
      ...(node.style ? { style: JSON.parse(JSON.stringify(node.style)) } : {}),
    })),
    edges: edges.value
      .filter((item) => nodeIds.has(item.source) && nodeIds.has(item.target))
      .map((item) => ({
      id: item.id,
      source: item.source,
      target: item.target,
      sourceHandle: item.sourceHandle,
      targetHandle: item.targetHandle,
      type: item.type === 'bezier' ? 'default' : (item.type || 'default'),
      interactionWidth: item.interactionWidth || 28,
      style: { stroke: '#2f80ed', strokeWidth: 2.4 },
      })),
    settings: { ...settings },
    edgesVisible: edgesVisible.value,
  }
}

function scheduleSave() {
  saveState.value = '正在保存'
  if (saveTimer) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveCanvas().catch(() => { saveState.value = SERVER_AUTH_MODE ? '服务端保存失败，请重试' : '本机存储空间不足' })
  }, 320)
}

// 保存必须串行：两次保存几乎同时发出时，彼此都还看到 serverCanvasDocument 为空，
// 于是同一个画布被 POST 成二三份文档（改名后各存一份，素材库里出现一堆同名画布）。
let saveInFlight = null
let saveQueued = null

function saveCanvas() {
  // 已有保存在跑 → 排一次“跑完再存”，把期间累积的改动一起带上；
  // 期间又来多少请求都复用同一个排队任务，不会堆出一串重复请求。
  if (saveInFlight) {
    if (!saveQueued) {
      saveQueued = saveInFlight.catch(() => {}).then(() => {
        saveQueued = null
        return runSaveCanvas()
      })
    }
    return saveQueued
  }
  return runSaveCanvas()
}

function runSaveCanvas() {
  saveInFlight = doSaveCanvas().finally(() => { saveInFlight = null })
  return saveInFlight
}

async function doSaveCanvas() {
  if (props.adminMode) {
    const snapshot = serializeCanvas()
    emit('save', snapshot)
    emit('change', snapshot)
    saveState.value = '改动待保存到玩法草稿'
    return
  }
  if (!SERVER_AUTH_MODE) {
    // 本机模式下画布名称也要跟着存下来，否则刷新后名字丢回默认值。
    // 🔴 同样按账号分开：同一台电脑换人登录，看不到也改不动别人的画布。
    writeAccountJson(STORAGE_KEY, accountId.value, { ...serializeCanvas(), title: canvasTitle.value.trim() })
    saveState.value = '已保存到本机'
    return
  }
  const payload = {
    // 名称与顶栏显示保持一致：用户没起名时统一存「未命名无限画布」，
    // 这样素材库里看到的标题就是他在画布上看到的标题，方便后期辨认。
    title: canvasDisplayName.value,
    data: serializeCanvas(),
  }
  if (serverCanvasDocument.value) {
    const document = await patchCanvasDocument(serverCanvasDocument.value.id, serverCanvasDocument.value.version, payload)
    serverCanvasDocument.value = document
    rememberCanvasDocument(document)
  } else {
    try {
      const { data } = await apiClient.post('/me/documents', {
        type: 'canvas',
        resourceKey: canvasResourceKey.value || createCanvasResourceKey(),
        ...payload,
      })
      serverCanvasDocument.value = data.document
      canvasResourceKey.value = data.document.resourceKey || canvasResourceKey.value
      rememberCanvasDocument(data.document)
    } catch (error) {
      // 两个标签页同时编辑同一个画布时，后到的那次 POST 会撞上 resource_key 唯一索引。
      // 这种情况不算失败：把已经存在的那份找回来接着更新，避免又多出一份画布。
      const existing = await findOwnCanvasByKey(canvasResourceKey.value).catch(() => null)
      if (!existing) throw error
      serverCanvasDocument.value = await patchCanvasDocument(existing.id, existing.version, payload)
      canvasResourceKey.value = serverCanvasDocument.value.resourceKey || canvasResourceKey.value
      rememberCanvasDocument(serverCanvasDocument.value)
    }
  }
  saveState.value = '已保存到服务端'
}

// 带乐观锁的更新：本机这份版本号可能已经落后（例如同一账号在另一台设备改过）。
// 落后时后端不报错、只是不写，等于改动静默丢失 —— 所以这里取回最新版本号再写一次，
// 让“保存成功”这个提示名副其实。
async function patchCanvasDocument(id, version, payload) {
  try {
    const { data } = await apiClient.patch(`/me/documents/${id}`, { ...payload, version })
    return data.document
  } catch (error) {
    const latest = await apiClient.get(`/me/documents/${id}`).then((res) => res.data.document).catch(() => null)
    if (!latest || latest.version === version) throw error
    const { data } = await apiClient.patch(`/me/documents/${id}`, { ...payload, version: latest.version })
    return data.document
  }
}

async function findOwnCanvasByKey(resourceKey) {
  if (!resourceKey) return null
  const { data } = await apiClient.get('/me/documents', { params: { type: 'canvas' } })
  return (data.documents || []).find((item) => item.resourceKey === resourceKey) || null
}

async function restoreCanvas() {
  if (SERVER_AUTH_MODE) {
    const { data } = await apiClient.get('/me/documents', { params: { type: 'canvas' } })
    const documents = data.documents || []
    const projectPrefix = `canvas:${sourceProject.id}`
    // 找“上次那张画布”的优先级：
    // 1) 素材库点进来带的 canvasId —— 用户明确要看这一张；
    // 2) 浏览器记住的文档 id —— 普通刷新/再进来都该接着上一张改；
    // 3) 同项目前缀 —— 兼容没记住 id 的老会话，选最近更新的那张；
    // 4) 都没有就当新画布，首次保存时才建文档。
    const rememberedId = readRememberedCanvasDocumentId()
    const document = (requestedCanvasId.value && documents.find((item) => item.id === requestedCanvasId.value))
      || (rememberedId && documents.find((item) => item.id === rememberedId))
      || documents.find((item) => item.resourceKey === projectPrefix)
      || documents.find((item) => String(item.resourceKey || '').startsWith(`${projectPrefix}:`))
      || null
    if (!document) return
    serverCanvasDocument.value = document
    rememberCanvasDocument(document)
    canvasResourceKey.value = document.resourceKey || createCanvasResourceKey()
    canvasTitle.value = document.title || ''
    applySavedCanvas(document.data)
    return
  }
  const saved = readAccountJson(STORAGE_KEY, accountId.value)
  if (!saved) return
  // 老版本本机画布没有 title 字段，回退到默认名，不覆盖用户已改的名字。
  canvasTitle.value = String(saved?.title || '').trim()
  canvasResourceKey.value = `canvas:${sourceProject.id}`
  applySavedCanvas(saved)
}

// ---- 分组（VueFlow 真父子）辅助 ----
const GROUP_NODE_DEFAULT_WIDTH = 520
const GROUP_NODE_DEFAULT_HEIGHT = 360

// 把节点从所属分组里摘出来（相对坐标换算回绝对坐标），组本身不动。
function detachFromGroup(node) {
  if (!node?.parentNode) return
  const parent = nodes.value.find((item) => item.id === node.parentNode)
  if (parent) {
    node.position = {
      x: Number(parent.position?.x || 0) + Number(node.position?.x || 0),
      y: Number(parent.position?.y || 0) + Number(node.position?.y || 0),
    }
  }
  delete node.parentNode
  delete node.extent
}

// 载入画布后的父子关系自愈：悬空/非法的父引用直接降级为顶层节点，保证老画布不崩。
function repairCanvasGroups(list) {
  if (!Array.isArray(list) || !list.length) return list
  const ids = new Set(list.map((node) => node.id))
  const groupIds = new Set(list.filter((node) => node.type === 'group').map((node) => node.id))
  list.forEach((node) => {
    if (node.parentNode && (!ids.has(node.parentNode) || !groupIds.has(node.parentNode))) {
      delete node.parentNode
      delete node.extent
    }
    if (node.type === 'group') {
      const width = Number(node.width || node.data?.width) || GROUP_NODE_DEFAULT_WIDTH
      const height = Number(node.height || node.data?.height) || GROUP_NODE_DEFAULT_HEIGHT
      node.width = width
      node.height = height
      node.style = { ...(node.style || {}), width: `${width}px`, height: `${height}px` }
      node.data = { ...(node.data || {}), mode: 'group', width, height, title: node.data?.title || '分组' }
      node.selectable = false
    }
    if (node.parentNode) node.extent = node.extent || 'parent'
  })
  // 组排在前面：便于首帧父子测量，也让存储更好读。
  return list.slice().sort((a, b) => (a.parentNode ? 1 : 0) - (b.parentNode ? 1 : 0))
}

function applySavedCanvas(saved) {
  try {
    if (Array.isArray(saved?.nodes) && saved.nodes.length) {
      nodes.value = props.adminMode ? saved.nodes : saved.nodes.map((node) => migrateCanvasNode(node, saved.settings))
      nodes.value = repairCanvasGroups(nodes.value)
      // 旧版「标记」便签节点已下线：老画布里残留的 marker 节点直接剔除，
      // 避免 VueFlow 渲染未知节点类型；相连的边会在下面的 nodeIds 过滤中一并丢弃。
      if (nodes.value.some((node) => node.type === 'marker')) {
        nodes.value = nodes.value.filter((node) => node.type !== 'marker')
        ElMessage.info('旧版「标记」便签已下线，画布中的标记节点已移除')
      }
      nodes.value.filter((node) => node.type === 'upload').forEach((node) => hydrateImageMetadata(node))
      nodes.value.filter((node) => node.data?.mode === 'image-result').forEach((node) => hydrateImageMetadata(node, true))
      nodes.value.filter((node) => node.data?.mode === 'image-generation').forEach((node) => hydrateGeneratedImageMetadata(node))
    }
    if (Array.isArray(saved.edges)) {
      const nodeIds = new Set(nodes.value.map((node) => node.id))
      // 历史数据里同一源节点的多条连线 ID 可能完全一样（后端曾把 ID 截断到 48 位，
      // `vueflow__edge-<源>-<目标>` 会被截成同一个前缀）。VueFlow 用 ID 做渲染 key，
      // 重复 ID 会让 8 条连线叠成一条、并且再也拖不出新的同源连线。
      // 这里加载时按出现顺序重新编号，保证每条边 ID 唯一。
      const usedEdgeIds = new Set()
      edges.value = saved.edges
        .filter((item) => nodeIds.has(item.source) && nodeIds.has(item.target))
        .map((item, index) => {
          let id = String(item.id || `edge_${index + 1}`)
          if (usedEdgeIds.has(id)) {
            let suffix = 2
            while (usedEdgeIds.has(`${id}_${suffix}`)) suffix += 1
            id = `${id}_${suffix}`
          }
          usedEdgeIds.add(id)
          return {
            ...item,
            id,
            type: item.type === 'bezier' ? 'default' : (item.type || 'default'),
            interactionWidth: item.interactionWidth || 28,
          }
        })
    }
    if (!props.adminMode) mergeSplitImageResults()
    if (saved.settings) Object.assign(settings, saved.settings)
    if (typeof saved.edgesVisible === 'boolean') edgesVisible.value = saved.edgesVisible
    selectedNodeId.value = nodes.value.find((node) => node.type === 'video')?.id || nodes.value[0]?.id || ''
  } catch {}
}

function mergeSplitImageResults() {
  const mergedResultIds = new Set()
  for (const result of nodes.value.filter((node) => node.data?.mode === 'image-result')) {
    const incoming = edges.value.find((item) => item.target === result.id)
    const source = incoming ? nodes.value.find((node) => node.id === incoming.source && node.type === 'image') : null
    if (!source || !result.data?.image) continue
    source.data.output = { ...(source.data.output || {}), url: result.data.image, assetId: result.data.assetId || '' }
    source.data.outputAspectRatio = Number(result.data.aspectRatio || 0) || source.data.outputAspectRatio
    mergedResultIds.add(result.id)
    hydrateGeneratedImageMetadata(source)
  }
  // 被合并掉的 result 节点若在某个分组里，先摘出来再删（否则组内会留下悬空父引用）。
  nodes.value.filter((node) => mergedResultIds.has(node.id)).forEach((node) => detachFromGroup(node))
  nodes.value = nodes.value.filter((node) => !mergedResultIds.has(node.id))
  edges.value = edges.value.filter((item) => !mergedResultIds.has(item.source) && !mergedResultIds.has(item.target))
}

async function hydrateGeneratedImageMetadata(node) {
  if (!node?.data?.output?.url || node.data.outputAspectRatio) return
  try {
    const size = await readImageDimensions(node.data.output.url)
    node.data.outputAspectRatio = size.width / size.height
  } catch {}
}

function migrateCanvasNode(source, legacySettings = {}) {
  const node = JSON.parse(JSON.stringify(source || {}))
  node.data = node.data || {}
  if (node.type === 'upload') return node
  // 分组节点：data 由 repairCanvasGroups 统一补齐，这里原样返回。
  if (node.type === 'group') return node
  if (node.type === 'prompt') {
    node.type = 'text'
    node.data = {
      mode: 'text-generation',
      title: '文字生成',
      prompt: node.data.prompt || '',
      status: node.data.prompt ? 'succeeded' : 'idle',
      output: node.data.prompt ? { text: node.data.prompt } : null,
      config: { model: defaultTextModel() },
    }
    return node
  }
  if (node.type === 'text' && !node.data.mode) {
    node.data = {
      ...node.data,
      mode: 'free-text',
      style: {
        color: '#20242b',
        fontFamily: 'Microsoft YaHei',
        fontSize: 42,
        fontWeight: 700,
        textAlign: 'left',
        width: 360,
        minHeight: 72,
        ...(node.data.style || {}),
      },
    }
    return node
  }
  if (node.type === 'image' && !node.data.mode) {
    node.data = {
      ...node.data,
      mode: 'image-generation',
      title: '图像生成',
      prompt: node.data.prompt || node.data.description || '',
      status: 'idle',
      config: { model: 'agnes-image-2.1-flash', ratio: '1:1', resolution: '1080P', ...(node.data.config || {}) },
    }
    return node
  }
  if (node.type === 'video' && !node.data.mode) {
    node.data = {
      ...node.data,
      mode: 'video-generation',
      title: '视频生成',
      prompt: node.data.prompt || legacySettings.prompt || '',
      status: 'idle',
      config: {
        model: String(legacySettings.model || '').startsWith('agnes-video') ? legacySettings.model : 'agnes-video-v2.0',
        duration: Number(legacySettings.duration || 5),
        ratio: legacySettings.ratio || '16:9',
        resolution: legacySettings.resolution || '1080P',
        ...(node.data.config || {}),
      },
    }
  }
  return node
}

function snapshotString() {
  return JSON.stringify({ nodes: serializeCanvas().nodes, edges: serializeCanvas().edges })
}

function commitHistory(replace = false) {
  clearEdgeUndoNotice()
  const snapshot = snapshotString()
  if (replace || historyIndex.value < 0) {
    historySnapshots.value = [snapshot]
    historyIndex.value = 0
    return
  }
  if (historySnapshots.value[historyIndex.value] === snapshot) return
  historySnapshots.value = historySnapshots.value.slice(0, historyIndex.value + 1)
  historySnapshots.value.push(snapshot)
  if (historySnapshots.value.length > 40) historySnapshots.value.shift()
  historyIndex.value = historySnapshots.value.length - 1
}

function restoreHistorySnapshot() {
  const snapshot = historySnapshots.value[historyIndex.value]
  if (!snapshot) return
  const parsed = JSON.parse(snapshot)
  nodes.value = parsed.nodes
  edges.value = parsed.edges
  selectedEdgeId.value = ''
  selectedNodeId.value = nodes.value.find((node) => node.id === selectedNodeId.value)?.id
    || nodes.value.find((node) => node.type === 'video')?.id
    || nodes.value[0]?.id
    || ''
}

function undo() {
  if (!canUndo.value) return
  clearEdgeUndoNotice()
  selectedEdgeId.value = ''
  historyIndex.value -= 1
  restoreHistorySnapshot()
}

function redo() {
  if (!canRedo.value) return
  clearEdgeUndoNotice()
  selectedEdgeId.value = ''
  historyIndex.value += 1
  restoreHistorySnapshot()
}
</script>

<style lang="scss">
.workflow-page {
  --navy: #071832;
  --blue: #2878f0;
  --blue-soft: #edf5ff;
  --line: #e3e9f2;
  --muted: #748199;
  height: calc(100vh - var(--app-top, 0px));
  min-height: 700px;
  overflow: hidden;
  color: #17243a;
  background: #f5f7fb;
}
.workflow-page.admin-workflow-mode {
  height: 760px;
  min-height: 680px;
  border: 1px solid #e1e5ee;
  border-radius: 14px;
  overflow: hidden;
}
.admin-workflow-mode .workspace-shell {
  height: calc(100% - 64px);
  min-height: 0;
  grid-template-columns: 76px minmax(0, 1fr) 390px;
}
.admin-workflow-mode .workspace-shell.right-panel-collapsed { grid-template-columns: 76px minmax(0, 1fr) 0; }
.admin-workflow-mode .tool-rail { width: 76px; }
.admin-workflow-mode .create-popover { left: 88px; }

.workflow-topbar {
  position: relative;
  z-index: 50;
  height: 64px;
  padding: 0 22px 0 26px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  color: #fff;
  background: var(--navy);
  box-shadow: 0 4px 18px rgba(3, 14, 33, .18);
}

.brand-block,
.topbar-actions,
.save-state {
  display: flex;
  align-items: center;
}

.brand-block { gap: 14px; min-width: 0; }
.brand-block > strong { font-size: 21px; letter-spacing: -.02em; white-space: nowrap; }

/* 左上角「文件」下拉：原来独立在右侧的三个点菜单 + 返回工作台，合并到这一个入口。
   全局有 button{min-height:var(--touch-size)}，这里的按钮都必须显式写 min-height。 */
.file-menu-wrap { position: relative; flex-shrink: 0; }
.file-menu-trigger {
  position: relative;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, .22);
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, .9);
  background: rgba(255, 255, 255, .06);
  font-size: 12px;
  cursor: pointer;
}
.file-menu-trigger:hover,
.file-menu-trigger.active { color: #fff; background: rgba(255, 255, 255, .14); border-color: rgba(255, 255, 255, .34); }
.file-menu-trigger svg { width: 15px; height: 15px; flex-shrink: 0; }
.file-menu-caret { width: 11px !important; height: 11px !important; opacity: .7; transition: transform .16s ease; }
.file-menu-trigger.active .file-menu-caret { transform: rotate(180deg); }
/* 有未保存改动时的小橙点：贴在「文件」按钮右上角，不占排版位置。
   后台顶栏那行「有未保存改动」的小字去掉后，用这个点兜住「改了没存」的可见性。 */
.file-menu-dot {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #f5a623;
  box-shadow: 0 0 0 2px #0f1f39;
  pointer-events: none;
}
.floating-workflow-mode .file-menu-dot { box-shadow: 0 0 0 2px #fff; }
/* 只给读屏软件看，视觉上不出现。 */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.file-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 60;
  width: 208px;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 16px 44px rgba(15, 32, 61, .18);
}
.file-menu button {
  width: 100%;
  min-height: 38px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 9px;
  text-align: left;
  color: #2a374d;
  background: transparent;
  font-size: 13px;
  cursor: pointer;
}
.file-menu button:hover { background: #f2f6fb; }
.file-menu button svg { width: 16px; height: 16px; flex-shrink: 0; color: #6a7ca0; }
.file-menu button.is-danger { color: #b8393f; }
.file-menu button.is-danger svg { color: #c9605f; }
.file-menu button.is-danger:hover { background: #fdf1f1; }
.file-menu-sep { display: block; height: 1px; margin: 6px 8px; background: var(--line); }

/* 画布名称：点击即可改名。限宽 + ellipsis，长名字不会把右侧保存状态、全屏菜单挤走。
   注意全局有 button{min-height:var(--touch-size)}，小按钮必须显式清掉 min-height。 */
.canvas-name-action {
  min-width: 0;
  min-height: 0;
  max-width: 220px;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, .92);
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  cursor: text;
}
.canvas-name-action:hover { border-color: rgba(255, 255, 255, .22); background: rgba(255, 255, 255, .08); }
.canvas-name-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.canvas-name-action svg { width: 14px; height: 14px; flex-shrink: 0; opacity: .6; }
.canvas-name-input {
  width: 200px;
  max-width: 220px;
  min-height: 0;
  padding: 4px 8px;
  border: 1px solid rgba(255, 255, 255, .42);
  border-radius: 8px;
  color: #fff;
  background: rgba(255, 255, 255, .12);
  font-size: 14px;
  font-weight: 600;
  outline: none;
}
.canvas-name-input:focus { border-color: #fff; background: rgba(255, 255, 255, .18); }
.canvas-name-input::placeholder { color: rgba(255, 255, 255, .55); }
.topbar-divider { width: 1px; height: 22px; background: rgba(255, 255, 255, .22); }
.project-name { color: rgba(255, 255, 255, .82); font-size: 14px; }
.project-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.save-state {
  gap: 8px;
  color: rgba(255, 255, 255, .84);
  font-size: 14px;
}
.save-state svg { width: 17px; height: 17px; }
.save-spinner,
.button-spinner,
.result-spinner {
  display: inline-block;
  border: 2px solid rgba(255, 255, 255, .45);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin .8s linear infinite;
}
.save-spinner { width: 15px; height: 15px; color: #fff; }

.topbar-actions {
  justify-content: flex-end;
  gap: 4px;
  position: relative;
}
.topbar-actions > button {
  min-height: 40px;
  border: 0;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, .82);
  background: transparent;
  cursor: pointer;
}
.topbar-actions .icon-action { width: 40px; padding: 0; }
.topbar-actions > button:hover:not(:disabled) { color: #fff; background: rgba(255, 255, 255, .09); }
.topbar-actions > button:disabled { opacity: .5; cursor: not-allowed; }
.topbar-actions svg { width: 21px; height: 21px; }
.topbar-actions .topbar-divider { margin: 0 8px; }

.workspace-shell {
  height: calc(100vh - var(--app-top, 0px) - 64px);
  min-height: 636px;
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr) 390px;
  transition: grid-template-columns .22s ease;
}
.workspace-shell.right-panel-collapsed { grid-template-columns: 86px minmax(0, 1fr) 0; }

.tool-rail {
  position: relative;
  z-index: 35;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-right: 1px solid var(--line);
  background: #fff;
  box-shadow: 5px 0 18px rgba(25, 42, 72, .035);
}
.rail-actions { padding: 18px 10px; display: grid; gap: 8px; }
.rail-action {
  min-height: 72px;
  border: 0;
  border-radius: 11px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 7px;
  color: #263a59;
  background: transparent;
  cursor: pointer;
  transition: background .16s ease, color .16s ease;
}
.rail-action svg { width: 24px; height: 24px; }
/* 按钮可用宽度只有 66px（栏 86 - 内边距 20），「我的素材库」5 个字在 12px/700 下会折成
   「我的素 / 材库」两行，还把按钮撑高。改成 11px/600 并锁死单行。 */
.rail-action span { font-size: 11px; font-weight: 600; white-space: nowrap; letter-spacing: -.2px; }
.rail-action:hover { background: #f4f7fb; }
.rail-action.active { color: var(--blue); background: var(--blue-soft); }

.rail-line-control {
  margin: 0 11px 16px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  display: grid;
  justify-items: center;
  gap: 6px;
  color: #36506f;
}
.rail-line-control > svg { width: 22px; height: 22px; }
.rail-line-control > span { font-size: 12px; font-weight: 700; }
.rail-line-control small { color: #9aa5b6; font-size: 10px; line-height: 1.4; text-align: center; }
.mini-switch {
  width: 37px;
  min-height: 21px;
  padding: 2px;
  border: 0;
  border-radius: 999px;
  background: #cbd4e0;
  cursor: pointer;
  transition: background .16s ease;
}
.mini-switch span {
  display: block;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 5px rgba(19, 35, 59, .24);
  transition: transform .16s ease;
}
.mini-switch.on { background: var(--blue); }
.mini-switch.on span { transform: translateX(16px); }

.create-popover {
  position: absolute;
  z-index: 50;
  top: 24px;
  left: 98px;
  width: 188px;
  padding: 12px;
  border: 1px solid #dfe6f0;
  border-radius: 13px;
  background: #fff;
  box-shadow: 0 18px 48px rgba(24, 42, 73, .18);
}
.popover-arrow {
  position: absolute;
  left: -8px;
  top: 27px;
  width: 15px;
  height: 15px;
  border-left: 1px solid #dfe6f0;
  border-bottom: 1px solid #dfe6f0;
  background: #fff;
  transform: rotate(45deg);
}
.create-popover header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 9px;
}
.create-popover header strong { font-size: 15px; }
.create-popover header button {
  width: 32px;
  min-height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: #516078;
  background: transparent;
  cursor: pointer;
}
.create-popover header button:hover { background: #f1f5f9; }
.create-popover header svg { width: 18px; height: 18px; }
.create-options { display: grid; grid-template-columns: 1fr; gap: 6px; }
.create-options button {
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid #e2e8f1;
  border-radius: 8px;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  color: #243753;
  background: #fff;
  cursor: pointer;
  transition: border-color .16s ease, background .16s ease, transform .16s ease;
}
.create-options button:hover,
.create-options button.featured { color: var(--blue); border-color: #cfe0ff; background: #edf5ff; }
.create-options button:hover { transform: translateX(2px); }
.create-options svg { width: 18px; height: 18px; color: #596dff; }
.create-options span { font-size: 12px; font-weight: 700; text-align: left; }

.canvas-area {
  position: relative;
  min-width: 0;
  overflow: hidden;
  background-color: #f8fafc;
  background-image: radial-gradient(circle, #d7dee8 1.1px, transparent 1.1px);
  background-size: 22px 22px;
}
.flow-canvas { width: 100%; height: 100%; background: transparent; }
.flow-canvas .vue-flow__pane { cursor: grab; }
.flow-canvas .vue-flow__pane.dragging { cursor: grabbing; }
.flow-canvas .vue-flow__node { border: 0; background: transparent; box-shadow: none; }
.flow-canvas .vue-flow__node.selected { box-shadow: none; }
.canvas-area.marquee-mode .flow-canvas .vue-flow__pane,
.canvas-area.marquee-mode .flow-canvas .vue-flow__pane.dragging { cursor: crosshair; }
.flow-canvas .vue-flow__selection {
  background: rgba(22, 119, 255, .12);
  border: 1px solid #1677ff;
}
/* 空白画布引导：新建画布不再自带示例节点，这里给一个明确的起点。 */
.canvas-empty-guide {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 20;
  width: min(420px, calc(100% - 48px));
  padding: 26px 24px 22px;
  transform: translate(-50%, -50%);
  border: 1px solid #e3e9f2;
  border-radius: 18px;
  display: grid;
  justify-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, .97);
  box-shadow: 0 18px 42px rgba(23, 43, 77, .1);
  text-align: center;
}
.canvas-empty-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  margin-bottom: 2px;
  color: var(--blue);
  background: var(--blue-soft);
}
.canvas-empty-icon > svg { width: 22px; height: 22px; }
.canvas-empty-guide strong { font-size: 15px; color: #17243a; }
.canvas-empty-guide p {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--muted);
}
.canvas-empty-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 6px;
}
.canvas-empty-actions button {
  min-width: 0;
  min-height: 0;
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #2b3a55;
  background: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.canvas-empty-actions button:hover { border-color: #b9d3fa; background: #f7fbff; color: #176be5; }
.canvas-empty-actions button > svg { width: 15px; height: 15px; }
.canvas-empty-actions .empty-action-primary {
  border-color: var(--blue);
  color: #fff;
  background: var(--blue);
}
.canvas-empty-actions .empty-action-primary:hover { border-color: #176be5; color: #fff; background: #176be5; }
.canvas-empty-guide small {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.6;
  color: #98a3b6;
}

.marquee-hint {
  position: absolute;
  top: 18px;
  left: 50%;
  z-index: 26;
  transform: translateX(-50%);
  display: flex;
  max-width: min(92%, 660px);
  align-items: center;
  gap: 10px;
  padding: 8px 10px 8px 12px;
  border: 1px solid #cfe0ff;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(23, 43, 77, .12);
  color: #2b3a55;
  font-size: 12px;
  line-height: 1.5;
}
.marquee-hint > svg { width: 16px; height: 16px; flex: 0 0 auto; color: #1677ff; }
.marquee-hint strong { color: #1677ff; font-weight: 800; }
.marquee-hint em {
  flex: 0 0 auto;
  padding: 1px 9px;
  border-radius: 999px;
  background: #edf5ff;
  color: #1260b3;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
}
.marquee-hint-exit {
  min-width: 0;
  min-height: 0;
  height: 24px;
  flex: 0 0 auto;
  padding: 0 11px;
  border: 0;
  border-radius: 999px;
  background: #1677ff;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

/* ---- 分组容器（VueFlow parentNode 真父子）---- */
.group-node {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  border: 1.5px dashed #9fb6d8;
  border-radius: 18px;
  background: rgba(234, 242, 255, .45);
  transition: border-color .16s ease, background .16s ease;
}
.group-node:hover { border-color: #6f9bd8; }
.group-node.selected {
  border-color: #1677ff;
  border-style: solid;
  background: rgba(219, 234, 255, .55);
  box-shadow: 0 0 0 3px rgba(22, 119, 255, .14);
}
/* 元素选择模式下组框不拦截指针，避免挡住成员图片的点选标记 */
.group-node-marking {
  pointer-events: none;
  border-style: dashed;
  background: rgba(234, 242, 255, .2);
}
.group-node-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 6px 12px;
}
.group-node-title {
  color: #2b3a55;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .2px;
}
.group-node-count { color: #748199; font-size: 11px; }
.group-node-ungroup {
  min-width: 0;
  min-height: 0;
  height: 24px;
  margin-left: auto;
  padding: 0 10px;
  border: 1px solid #cfe0ff;
  border-radius: 999px;
  background: #fff;
  color: #1260b3;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.group-node-ungroup:hover { border-color: #1677ff; color: #1677ff; }
/* ---- 画布模板面板（P2） ---- */
.template-content { display: flex; flex-direction: column; gap: 12px; padding: 4px 2px 2px; }
.template-save {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid #e2ebf7;
  border-radius: 12px;
  background: #f7fafe;
}
.template-save-head { display: flex; align-items: center; gap: 8px; }
.template-save-head strong { color: #2b3a55; font-size: 12px; font-weight: 800; }
.template-save-count { margin-left: auto; color: #1260b3; font-size: 11px; font-weight: 700; }
.template-save input,
.template-save select {
  width: 100%;
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid #d6e3f4;
  border-radius: 9px;
  background: #fff;
  color: #2b3a55;
  font-size: 12px;
  box-sizing: border-box;
}
.template-save-row { display: flex; gap: 8px; }
.template-save-row select { flex: 1 1 auto; }
.template-save-button {
  min-width: 0;
  min-height: 0;
  height: 32px;
  padding: 0 14px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 9px;
  background: #1677ff;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.template-save-button:disabled { background: #d7e3f5; color: #8ea3bf; cursor: not-allowed; }
.template-hint { color: #9aa4b4; font-size: 10px; line-height: 1.5; }
.template-list-head { display: flex; align-items: center; gap: 8px; }
.template-list-head strong { color: #2b3a55; font-size: 12px; font-weight: 800; }
.template-refresh {
  min-width: 0;
  min-height: 0;
  height: 24px;
  margin-left: auto;
  padding: 0 10px;
  border: 1px solid #cfe0ff;
  border-radius: 999px;
  background: #fff;
  color: #1260b3;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.template-refresh:disabled { color: #9aa4b4; cursor: default; }
.template-empty {
  padding: 14px 10px;
  border: 1px dashed #d6e3f4;
  border-radius: 12px;
  background: #fbfdff;
  color: #9aa4b4;
  font-size: 11px;
  text-align: center;
}
.template-list { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.template-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid #e2ebf7;
  border-radius: 12px;
  background: #fff;
}
.template-item-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1 1 auto; }
.template-item-name {
  color: #2b3a55;
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.template-item-meta { display: flex; align-items: center; gap: 6px; color: #8a95a8; font-size: 10px; }
.template-scope {
  padding: 1px 6px;
  border-radius: 999px;
  background: #eaf2ff;
  color: #1260b3;
  font-weight: 700;
}
.template-item-actions { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
.template-apply {
  min-width: 0;
  min-height: 0;
  height: 28px;
  padding: 0 12px;
  border: 1px solid #cfe0ff;
  border-radius: 999px;
  background: #f2f7ff;
  color: #1260b3;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.template-apply:hover { border-color: #1677ff; color: #1677ff; }
.template-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid #f0dcdc;
  border-radius: 50%;
  background: #fff;
  color: #d4553f;
  cursor: pointer;
}
.template-delete svg { width: 14px; height: 14px; }
.template-delete:hover { border-color: #d4553f; background: #fdf3f1; }
.template-icon { color: #1260b3; }
.marquee-hint-exit:hover { background: #1260b3; }
.flow-canvas .vue-flow__edge-path { transition: opacity .18s ease, stroke-width .16s ease, filter .16s ease; }
.flow-canvas .vue-flow__edge-interaction { cursor: pointer; touch-action: manipulation; }
.flow-canvas .vue-flow__edge.selected .vue-flow__edge-path {
  stroke: #1677ff !important;
  stroke-width: 4px !important;
  filter: drop-shadow(0 0 4px rgba(22, 119, 255, .34));
}
.clean-mode .flow-canvas .vue-flow__edges { opacity: 0; pointer-events: none; }
.flow-canvas .vue-flow__connection-path { stroke: var(--blue); stroke-width: 3; }
.flow-canvas .flow-handle {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  box-shadow: none;
  cursor: crosshair;
  /* 连接点必须比节点内容层更高：否则图片预览 / 空图片占位会盖住它，
     鼠标按下去落在内容上，连线根本起不来。 */
  z-index: 6;
}
.flow-canvas .flow-handle::after {
  content: '';
  position: absolute;
  inset: 8px;
  border: 3px solid #fff;
  border-radius: 50%;
  background: var(--blue);
  box-shadow: 0 0 0 1px rgba(40, 120, 240, .26), 0 3px 8px rgba(40, 120, 240, .2);
  opacity: .82;
  transition: inset .14s ease, opacity .14s ease, box-shadow .14s ease, background .14s ease;
}
.workflow-node:hover .flow-handle::after,
.workflow-node.selected .flow-handle::after,
.flow-canvas .flow-handle:hover::after {
  inset: 5px;
  opacity: 1;
  box-shadow: 0 0 0 2px rgba(40, 120, 240, .22), 0 5px 12px rgba(40, 120, 240, .28);
}
.connection-active .flow-handle::after,
.flow-canvas .flow-handle.connecting::after,
.flow-canvas .flow-handle.valid::after {
  inset: 4px;
  opacity: 1;
  background: #20b879;
  box-shadow: 0 0 0 4px rgba(32, 184, 121, .16), 0 6px 14px rgba(32, 184, 121, .24);
}
.clean-mode .flow-handle { opacity: 0; pointer-events: none; }

.workflow-node {
  position: relative;
  width: 226px;
  padding: 12px;
  border: 1px solid #dce4ef;
  border-radius: 10px;
  color: #20324c;
  background: rgba(255, 255, 255, .98);
  box-shadow: 0 8px 22px rgba(25, 43, 74, .08);
  transition: border-color .16s ease, box-shadow .16s ease;
}
.reference-media-node,
.image-result-node,
.smart-text-node {
  padding: 0;
  border: 1.5px solid #8f8a83;
  border-radius: 17px;
  color: #302f2d;
  background: #e9e7e2;
  box-shadow: none;
}
.reference-media-node.selected,
.image-result-node.selected,
.smart-text-node.selected {
  border: 2px solid #3184ff;
  box-shadow: 0 7px 20px rgba(49, 132, 255, .12);
}
.node-kind-label {
  position: absolute;
  left: 10px;
  bottom: calc(100% + 5px);
  max-width: min(240px, calc(100% - 20px));
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #595650;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.node-display-name svg { width: 13px; height: 13px; flex: 0 0 auto; }
.node-display-name { text-overflow: ellipsis; }
/* 有卡槽胶囊时，节点名要让出右上角那一块，否则长名字会钻到胶囊底下 */
.has-slot .node-kind-label { max-width: calc(100% - 92px); }
/* 节点右上角的「对应用户端哪一格」胶囊。常亮，方便一眼看完整张画布的对应关系。 */
.slot-pill {
  position: absolute;
  right: 10px;
  bottom: calc(100% + 3px);
  z-index: 3;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  box-sizing: border-box;
  height: 20px;
  min-height: 0;
  padding: 0 8px;
  border: 1px solid #dfe4ec;
  border-radius: 999px;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(20, 35, 60, .13);
  transition: transform .14s ease, box-shadow .14s ease, background .14s ease;
}
.slot-pill:hover { transform: translateY(-1px); box-shadow: 0 3px 8px rgba(20, 35, 60, .2); }
.slot-pill-caret { font-size: 9px; font-style: normal; opacity: .55; }
.slot-pill.is-image { border-color: #f0c69a; background: #fff3e6; color: #a05a12; }
.slot-pill.is-text { border-color: #c3cdf5; background: #eef2ff; color: #3d51a8; }
.slot-pill.is-result { border-color: #b6ddc4; background: #e9f7ee; color: #1f7a45; }
.slot-pill.is-none { border-color: #dfe4ec; background: #f3f4f6; color: #6b7280; }
/* 卡槽菜单：挂在 body 上按屏幕坐标定位（画布会缩放，放节点里会被一起缩小） */
.slot-menu-layer { position: fixed; inset: 0; z-index: 2350; }
.slot-menu-catcher { position: absolute; inset: 0; background: transparent; }
.slot-menu-pop {
  position: fixed;
  box-sizing: border-box;
  width: 292px;
  padding: 10px;
  border: 1px solid #e2e6ee;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 18px 44px rgba(22, 38, 66, .18);
}
.slot-menu-title { margin: 0 0 8px; padding: 0 2px; color: #6b7a94; font-size: 11px; }
.slot-menu-list { display: grid; gap: 4px; }
.slot-menu-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  min-height: 0;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: none;
  color: #2c3a52;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.slot-menu-item:hover { background: #f5f7fb; }
.slot-menu-item.active { border-color: #cfe0ff; background: #eef5ff; }
.slot-menu-dot {
  flex: 0 0 auto;
  width: 13px;
  height: 13px;
  margin-top: 2px;
  border: 1.5px solid #c6cede;
  border-radius: 50%;
  background: #fff;
}
.slot-menu-item.active .slot-menu-dot { border-color: #2878f0; background: #2878f0; box-shadow: inset 0 0 0 2.5px #fff; }
.slot-menu-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.slot-menu-label { font-size: 13px; font-weight: 600; line-height: 1.3; }
.slot-menu-desc { color: #7a879b; font-size: 11px; line-height: 1.35; }
.slot-menu-sep { height: 1px; margin: 8px 2px; background: #eef1f6; }
.slot-menu-seq { display: flex; align-items: center; gap: 8px; padding: 0 2px; color: #45536c; font-size: 12px; }
.slot-menu-seq input {
  width: 74px;
  box-sizing: border-box;
  height: 28px;
  padding: 0 8px;
  border: 1px solid #dfe4ed;
  border-radius: 8px;
  background: #fff;
  color: #2c3a52;
  font: inherit;
  font-size: 12px;
}
.slot-menu-foot { margin: 6px 0 0; padding: 0 2px; color: #98a3b5; font-size: 11px; line-height: 1.4; }
.slot-menu-foot + .slot-menu-foot { margin-top: 2px; }
.slot-menu-foot.is-strong { color: #4d6fd0; }
.node-name-button,
.node-name-input {
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  padding: 3px 4px;
  border: 1px solid transparent;
  border-radius: 4px;
  color: inherit;
  background: transparent;
  font: inherit;
  line-height: 1.3;
}
.node-name-button { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; cursor: text; }
.node-name-button:hover { color: #2878f0; background: #edf5ff; }
.node-name-button:focus-visible,
.node-name-input { outline: none; border-color: #2878f0; background: #fff; }
.node-name-input { width: 180px; }
.node-kind-label .node-name-button,
.node-kind-label .node-name-input { box-sizing: border-box; height: 24px; }
.node-header > .node-name-button,
.node-header > .node-name-input { flex: 1; font-size: 14px; font-weight: 700; }
.group-node-title .node-name-button { font-weight: inherit; }
.generation-config-header .node-name-button { width: auto; min-height: 24px; display: inline-block; font: inherit; }
.reference-media-node .node-image-frame,
.image-result-node .node-image-frame {
  width: 100%;
  margin: 0;
  border-radius: 15px;
  background: #e9e7e2;
}
.reference-media-node .node-image-frame img,
.image-result-node .node-image-frame img { object-fit: contain; }
/* 和图像/视频生成节点同一套规则：24px 透明热区接鼠标，::after 画 12px 小圆点。
   原先这三个节点（参考素材 / 结果图 / 文字）是 12px 实体圆点，缩放到 0.92 后只剩 11px，
   鼠标稍偏一点就落在节点内容上，表现为「拖不出线」。 */
.reference-media-node .flow-handle,
.image-result-node .flow-handle,
.smart-text-node .flow-handle {
  width: 24px;
  height: 24px;
  border: 0;
  background: transparent;
  box-shadow: none;
}
.reference-media-node .flow-handle::after,
.image-result-node .flow-handle::after,
.smart-text-node .flow-handle::after {
  content: '';
  position: absolute;
  inset: 6px;
  border: 2px solid #827b72;
  border-radius: 50%;
  background: #fff;
  opacity: 1;
  box-shadow: none;
}
.reference-media-node.selected .flow-handle::after,
.image-result-node.selected .flow-handle::after,
.smart-text-node.selected .flow-handle::after { border-color: #3184ff; }
.workflow-node:hover { border-color: #a9c8f8; }
.workflow-node.selected { border: 2px solid var(--blue); box-shadow: 0 8px 26px rgba(40, 120, 240, .14); }
.node-header { display: flex; align-items: center; gap: 8px; min-height: 28px; }
.node-header strong { flex: 1; font-size: 14px; }
.node-type-icon { width: 23px; height: 23px; display: grid; place-items: center; }
.node-type-icon svg { width: 20px; height: 20px; }
.tone-purple { color: #6f63ff; }
.tone-green { color: #36bf7f; }
.tone-blue { color: #2f80ed; }
.tone-orange { color: #e8872c; }
.node-more {
  width: 27px;
  min-height: 27px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  display: grid;
  place-items: center;
  color: #5e6c82;
  background: transparent;
  cursor: pointer;
}
.node-more:hover { background: #f0f4f8; }
.node-more svg { width: 18px; height: 18px; }
.node-action-menu {
  position: absolute;
  z-index: 8;
  top: 42px;
  right: 9px;
  padding: 5px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 10px 24px rgba(20, 38, 68, .14);
}
.node-action-menu button {
  min-height: 32px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #d64545;
  background: transparent;
  cursor: pointer;
  white-space: nowrap;
}
.node-action-menu button:hover { background: #fff1f1; }
.node-action-menu svg { width: 15px; height: 15px; }

.node-image-frame {
  position: relative;
  margin-top: 10px;
  overflow: hidden;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: #eef2f6;
}
.node-image-frame img { width: 100%; height: 100%; display: block; object-fit: contain; }
.asset-preview img { width: 100%; height: 100%; display: block; object-fit: cover; }
.settings-image img { width: 100%; height: 100%; display: block; object-fit: contain; }
.node-image-background { width: 100%; height: 100%; }
.prompt-node { width: 196px; padding: 12px; }
.prompt-node p,
.compact-node p {
  margin: 9px 0 0;
  padding: 10px;
  border-radius: 8px;
  color: #536078;
  background: #f5f3ff;
  font-size: 12px;
  line-height: 1.55;
}
.video-node { width: 178px; padding: 12px; }
.node-meta { margin: 9px 0 0; display: grid; }
.node-meta div { padding: 10px 2px; border-top: 1px solid #e6ebf2; }
.node-meta dt { margin-bottom: 5px; color: #7a879c; font-size: 11px; }
.node-meta dd { margin: 0; color: #29415f; font-size: 13px; }
.result-node { width: 154px; padding: 10px; }
.result-preview {
  height: 88px;
  margin-top: 9px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: #8190a7;
  background: #edf1f5;
}
.result-preview.ready { color: #fff; background: #27b874; }
.result-preview svg { width: 26px; height: 26px; }
.result-spinner { width: 24px; height: 24px; color: var(--blue); border-color: #cbdcf6; border-top-color: var(--blue); }
.result-node small { display: block; margin-top: 7px; color: #7b8799; font-size: 10px; text-align: center; }
.compact-node { width: 190px; }
.generator-node { width: 268px; padding: 12px; }
.generator-node-summary { min-height: 112px; padding: 14px; border-radius: 10px; display: grid; place-items: center; align-content: center; gap: 10px; color: #6f7781; background: #e9e7e2; text-align: center; }
.generator-node-summary svg { width: 28px; height: 28px; color: #9c9b97; }
.generator-node-summary span { max-width: 100%; overflow: hidden; display: -webkit-box; font-size: 12px; line-height: 1.5; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.image-generation-node,
.video-generation-node {
  position: relative;
  box-sizing: border-box;
  min-width: 190px;
  padding: 0;
  border: 1.5px solid #8f8a83;
  border-radius: 17px;
  color: #302f2d;
  background: #e9e7e2;
  box-shadow: none;
  transition: border-color .16s ease, box-shadow .16s ease;
}
.image-generation-node.selected,
.video-generation-node.selected {
  border: 2px solid #3184ff;
  box-shadow: 0 7px 20px rgba(49, 132, 255, .12);
}
.image-generation-preview {
  position: relative;
  width: 100%;
  height: var(--image-preview-height, 250px);
  overflow: hidden;
  border-radius: 15px;
  display: grid;
  place-items: center;
  background: #e9e7e2;
}
.video-generation-preview {
  width: 100%;
  height: var(--video-preview-height, 270px);
  overflow: hidden;
  border-radius: 15px;
  display: grid;
  place-items: center;
  background: #e9e7e2;
}
.video-generation-preview video { width: 100%; height: 100%; display: block; object-fit: contain; }
.image-generation-preview img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}
.empty-image-node {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 9px;
  color: #827f79;
  font-size: 12px;
}
.empty-image-node svg { width: 40px; height: 40px; }
.empty-video-node {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 9px;
  color: #aaa7a0;
  font-size: 13px;
}
.empty-video-node svg { width: 38px; height: 38px; }
/* 连接点：12px 的小圆点只是「看着的样子」，真正接鼠标的透明热区要 24px。
   之前把整块做成 12px 实体圆点，节点内容（空图片占位、预览图）会盖住大半，
   只剩边缘一两像素能点中，看起来就是「连不上线」。热区放大 + ::after 画圆点解决。 */
.image-generation-node .flow-handle,
.video-generation-node .flow-handle {
  width: 24px;
  height: 24px;
  border: 0;
  background: transparent;
  box-shadow: none;
}
.image-generation-node .flow-handle::after,
.video-generation-node .flow-handle::after {
  content: '';
  position: absolute;
  inset: 6px;
  border: 2px solid #827b72;
  border-radius: 50%;
  background: #fff;
  opacity: 1;
  box-shadow: none;
}
.image-generation-node.selected .flow-handle::after,
.video-generation-node.selected .flow-handle::after { border-color: #3184ff; }
.image-action-toolbar {
  position: absolute;
  z-index: 24;
  left: 50%;
  bottom: calc(100% + 34px);
  min-width: max-content;
  padding: 8px;
  border-radius: 13px;
  display: flex;
  align-items: center;
  gap: 3px;
  background: #232323;
  box-shadow: 0 12px 28px rgba(0, 0, 0, .22);
  transform: translateX(-50%);
  white-space: nowrap;
}
.image-action-toolbar button {
  min-height: 36px;
  padding: 0 10px;
  border: 0;
  border-radius: 7px;
  color: #fff;
  background: transparent;
  font-size: 11px;
  cursor: pointer;
}
.image-action-toolbar button:hover { background: #3a3a3a; }
.node-follow-panel.image-composer-panel {
  box-sizing: border-box;
  top: calc(100% + 14px);
  left: 50%;
  width: 390px;
  max-width: calc(100vw - 112px);
  min-width: min(300px, calc(100vw - 112px));
  min-height: 174px;
  padding: 14px;
  border-color: #d7d3cc;
  border-radius: 14px;
  background: #fffefa;
  transform: translateX(-50%);
}
.node-follow-panel.video-composer-panel {
  box-sizing: border-box;
  top: calc(100% + 14px);
  left: 50%;
  width: 390px;
  max-width: calc(100vw - 112px);
  min-width: min(300px, calc(100vw - 112px));
  min-height: 174px;
  padding: 14px;
  border-color: #d7d3cc;
  border-radius: 14px;
  background: #fffefa;
  transform: translateX(-50%);
}
.image-composer-panel .node-prompt-input {
  min-height: 96px;
  margin: 0;
  padding: 4px 2px 12px;
  border: 0;
  border-radius: 0;
  color: #302f2d;
  background: transparent;
  font-size: 13px;
  line-height: 1.65;
  box-shadow: none;
}
/* 图像编辑面板控件区：两行 —— 第一行三个带文字操作胶囊（左对齐），
   第二行参数工具带（模型弹性 + 比例固定 + 生成按钮右对齐）。
   注意：全局 button { min-height: 48px } 会把小按钮撑成竖长胶囊，
   所以每个控件都必须显式 min-height:0 覆盖。 */
.image-composer-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 84px auto;
  align-items: center;
  gap: 6px;
}
.image-composer-assets {
  display: flex;
  align-items: center;
  gap: 6px;
  grid-column: 1 / -1;
}
.image-composer-controls > button,
.image-composer-controls > select,
.image-composer-assets > button {
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;            /* 压掉全局 48px 触摸目标，防止竖长胶囊 */
  height: 32px;
  padding: 0 12px;
  border: 1px solid #e2dfd9;
  border-radius: 16px;
  color: #45413c;
  background: #f8f7f3;
  font-size: 12px;
  white-space: nowrap;
}
.image-composer-assets > button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; cursor: pointer; }
.image-composer-assets > button svg { width: 14px; height: 14px; }
.image-composer-assets > button:hover { background: #f0eeea; }
.image-composer-controls .composer-model-select { grid-column: 1 / 2; }
.image-composer-controls .composer-ratio-select { grid-column: 2 / 3; }
.image-composer-controls .node-run-button { grid-column: 3 / 4; }
/* 出图节点多一格「张数」：模型弹性 + 比例 84 + 张数 68 + 生成按钮。
   只给带 with-count 的面板开 4 列，文本/视频面板布局保持不变。 */
.image-composer-controls.with-count { grid-template-columns: minmax(0, 1fr) 84px 68px auto; }
.image-composer-controls.with-count .composer-count-select { grid-column: 3 / 4; }
.image-composer-controls.with-count .node-run-button { grid-column: 4 / 5; }
.image-composer-controls .node-run-button {
  border-color: #242424;
  color: #fff;
  background: #242424;
  font-weight: 700;
}
.image-composer-controls .node-run-button:hover:not(:disabled) { background: #111; }
.image-composer-controls .node-run-button:disabled { opacity: .58; }
.video-composer-panel .node-prompt-input {
  min-height: 82px;
  margin: 0;
  padding: 4px 2px 12px;
  border: 0;
  border-radius: 0;
  color: #302f2d;
  background: transparent;
  font-size: 13px;
  line-height: 1.65;
  box-shadow: none;
}
/* ══════════ 提示词卡片（图像 / 视频 / 文本节点共用）══════════
   规格：卡片 626px 宽（含 1px 边框）+ 16px 内边距；提示词 16px / 行高 32px；
   输入框固定 3 行（96px）起，内容变多时整卡自动长高，最多 5 行（160px），
   再超出则框内上下滚动（6px 细滚动条）。节点框子本身不改。 */
.node-follow-panel.image-composer-panel,
.node-follow-panel.video-composer-panel {
  width: 626px;
  padding: 16px;
  border-radius: 16px;
}
/* 卡片首行：左 = 上游缩略卡（可换行），右 = 放大按钮（恒定停在卡片右上角） */
.composer-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-height: 32px;
  margin-bottom: 10px;
}
.composer-head .node-upstream-thumbs {
  flex: 1 1 auto;
  margin-bottom: 0;
  min-width: 0;
}
.composer-zoom-button {
  flex: 0 0 auto;
  margin-left: auto;        /* 没有上游缩略卡时也钉在右上角 */
  display: flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  padding: 0;
  min-width: 0;             /* 压掉全局 button 触摸目标尺寸 */
  min-height: 0;
  border: 1px solid #e2dfd9;
  border-radius: 16px;
  color: #45413c;
  background: #f8f7f3;
  cursor: pointer;
  transition: border-color .12s ease, background .12s ease, color .12s ease;
}
.composer-zoom-button svg { width: 16px; height: 16px; }
.composer-zoom-button:hover { border-color: #86b1f5; color: #1260b3; background: #eef6ff; }
.composer-zoom-button:focus-visible { outline: 2px solid #86b1f5; outline-offset: 1px; }
/* 输入框：3 行 = 96px（固定下限）→ 5 行 = 160px（上限）→ 超出在框内滚动 */
.node-follow-panel.image-composer-panel .node-prompt-shell,
.node-follow-panel.video-composer-panel .node-prompt-shell {
  padding: 8px 8px;
}
.node-follow-panel.image-composer-panel .node-prompt-input,
.node-follow-panel.video-composer-panel .node-prompt-input {
  min-height: 96px;
  max-height: 160px;
  padding: 0 2px;
  font-size: 16px;
  line-height: 32px;
  overflow-y: auto;
}
/* 细滚动条 6px（不要写 scrollbar-width，Chromium 一旦看到它就会忽略 ::-webkit-scrollbar） */
.node-follow-panel .node-prompt-input::-webkit-scrollbar { width: 6px; height: 6px; }
.node-follow-panel .node-prompt-input::-webkit-scrollbar-track { background: transparent; }
.node-follow-panel .node-prompt-input::-webkit-scrollbar-thumb { border-radius: 3px; background: #b9c5d4; }
.node-follow-panel .node-prompt-input::-webkit-scrollbar-thumb:hover { background: #94a4b8; }
@supports not selector(::-webkit-scrollbar) {
  .node-follow-panel .node-prompt-input { scrollbar-width: thin; scrollbar-color: #b9c5d4 transparent; }
}
/* 放大态：画布其余部分冻结为灰度并压暗（遮罩在画布区内，卡片被 Teleport 到 body 层） */
.canvas-area.prompt-zoom .flow-canvas {
  filter: grayscale(1) contrast(.94);
  transition: filter .2s ease;
}
.prompt-zoom-scrim {
  position: absolute;
  inset: 0;
  z-index: 2000;
  background: rgba(14, 21, 34, .52);
}
.node-follow-panel.is-zoom-open {
  position: fixed;
  top: 50%;
  left: 50%;
  max-width: none;
  min-width: 0;
  z-index: 2400;
  transform: translate(-50%, -50%) scale(1.35);
  box-shadow: 0 30px 70px rgba(8, 16, 30, .45);
  animation: promptZoomPop .24s cubic-bezier(.22, 1.2, .36, 1) both;
}
@keyframes promptZoomPop {
  from { transform: translate(-50%, -50%) scale(1.02); opacity: .4; }
  to { transform: translate(-50%, -50%) scale(1.35); opacity: 1; }
}
/* 文字节点「放大编辑」：遮罩铺满画布区，面板居中固定 900×700（小屏自动收缩）。
   只做「把文字搬大」这一件事，不改变节点自身的尺寸与位置。 */
.text-zoom-layer {
  position: absolute;
  inset: 0;
  z-index: 2400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(14, 21, 34, .52);
}
.text-zoom-panel {
  box-sizing: border-box;
  width: min(900px, 100%);
  height: min(700px, 100%);
  padding: 18px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  background: #fff;
  box-shadow: 0 30px 70px rgba(8, 16, 30, .45);
  animation: textZoomPop .22s cubic-bezier(.22, 1.2, .36, 1) both;
}
@keyframes textZoomPop {
  from { transform: scale(.97); opacity: .5; }
  to { transform: scale(1); opacity: 1; }
}
.text-zoom-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid #edf1f6;
}
.text-zoom-title {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #263a59;
}
.text-zoom-title svg { width: 16px; height: 16px; flex-shrink: 0; color: #7c8ea8; }
.text-zoom-title strong { font-size: 14px; font-weight: 700; }
.text-zoom-title span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #94a3b8; font-size: 12px; }
.text-zoom-size {
  flex-shrink: 0;
  padding: 3px 9px;
  border-radius: 999px;
  color: #64748b;
  background: #f1f5f9;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.text-zoom-close {
  min-width: 0;
  min-height: 0;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #7c8ea8;
  background: transparent;
  cursor: pointer;
}
.text-zoom-close:hover { color: #263a59; background: #f1f5f9; }
.text-zoom-close svg { width: 16px; height: 16px; }
/* 正文：1.2 倍显示（面板比节点宽得多，同字号在大面板里偏小），超出在框内滚动。 */
.text-zoom-editor {
  min-height: 0;
  flex: 1;
  margin: 14px 0;
  padding: 20px 22px;
  border: 1px solid #e3eaf3;
  border-radius: 12px;
  outline: none;
  color: #302f2d;
  background: #fbfcfe;
  font-size: 18px;
  line-height: 1.75;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  overflow-y: auto;
}
.text-zoom-editor:focus { border-color: #b9cdea; background: #fff; }
.text-zoom-editor::-webkit-scrollbar { width: 6px; }
.text-zoom-editor::-webkit-scrollbar-thumb { border-radius: 999px; background: #cbd5e1; }
.text-zoom-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.text-zoom-foot span { color: #94a3b8; font-size: 12px; }
.text-zoom-done {
  min-width: 0;
  min-height: 0;
  padding: 8px 20px;
  border: 1px solid #242424;
  border-radius: 9px;
  color: #fff;
  background: #242424;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.text-zoom-done:hover { background: #111; }
.node-prompt-shell,
.generation-prompt-shell {
  width: 100%;
  box-sizing: border-box;
  margin-top: 10px;
  padding: 6px 8px 0;
  border: 1px solid #dfe6ef;
  border-radius: 9px;
  background: #f8faff;
}
.generation-prompt-shell { margin-top: 8px; border-color: #e0e5ec; background: #fff; }
.node-prompt-shell:focus-within,
.generation-prompt-shell:focus-within { border-color: #86b1f5; box-shadow: 0 0 0 3px rgba(40, 120, 240, .08); }
.node-prompt-shell .node-prompt-input,
.generation-prompt-shell .generation-config-prompt { margin-top: 0; }
.generation-prompt-inline {
  display: flex;
  align-items: flex-start;
  gap: 0;
  min-width: 0;
  flex-wrap: nowrap;
}
.generation-prompt-inline > .generation-reference-chips {
  display: none;
}
.generation-prompt-inline > .node-reference-chips {
  max-height: 50px;
  overflow: visible;
  gap: 3px;
}
.generation-prompt-inline > .node-reference-chips .generation-reference-chip {
  min-width: 0;
  max-width: 94px;
  flex: 1 1 0;
}
.generation-prompt-inline > .node-prompt-input,
.generation-prompt-inline > .generation-config-prompt {
  width: auto;
  min-width: 120px;
  flex: 1 1 0;
  margin-top: 0;
  padding: 4px 2px 10px;
}
.inline-prompt-editor {
  display: block;
  width: 100% !important;
  min-width: 0 !important;
  min-height: 72px;
  box-sizing: border-box;
  overflow-y: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  cursor: text;
}
.inline-prompt-editor:focus { outline: 0; }
.inline-prompt-editor .inline-prompt-text { white-space: pre-wrap; }
/* 占位符由 JS 按「真实内容（文字或 chip）」切换 .is-empty，不能只靠 :only-child/:empty：
   contenteditable 里浏览器把键入的文字插成 editor 的裸文本节点时，Vue 托管的 .inline-prompt-text
   仍是空且「唯一的元素子节点」（结构伪类不统计文本节点），占位符会与正文重叠显示。 */
.inline-prompt-editor.is-empty::before { content: attr(data-placeholder); color: #94a3b8; pointer-events: none; user-select: none; }
.inline-prompt-reference { display: inline-flex; align-items: center; gap: 3px; height: 22px; max-width: 130px; margin: 0 3px 2px 0; padding: 0 4px 0 3px; vertical-align: middle; border: 1px solid rgba(22,131,255,.28); border-radius: 6px; color: #1260b3; background: #eef6ff; font-size: 11px; font-weight: 700; line-height: 1; user-select: none; }
.inline-prompt-reference img { width: 16px; height: 16px; border-radius: 3px; object-fit: cover; }
.inline-prompt-reference[draggable="true"] { cursor: grab; }
.inline-prompt-reference.is-dragging { opacity: .35; cursor: grabbing; }
.prompt-drop-indicator {
  position: fixed;
  z-index: 2090;
  width: 2px;
  border-radius: 1px;
  background: #1260b3;
  pointer-events: none;
}
.inline-prompt-reference svg { width: 14px; height: 14px; }
.inline-prompt-reference span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 标记元素片：复用 .inline-prompt-reference 视觉体系，用虚线边框 + 透明底缩略图区分「提取素材」 */
.inline-prompt-element { max-width: 168px; border-style: dashed; border-color: rgba(22,131,255,.55); background: #fff; }
.inline-prompt-element img {
  width: 16px;
  height: 16px;
  box-sizing: border-box;
  border: 1px solid rgba(22,131,255,.24);
  border-radius: 3px;
  object-fit: contain;
  background-color: #fff;
  background-image: linear-gradient(45deg, #eef2f7 25%, transparent 25%, transparent 75%, #eef2f7 75%), linear-gradient(45deg, #eef2f7 25%, transparent 25%, transparent 75%, #eef2f7 75%);
  background-size: 6px 6px;
  background-position: 0 0, 3px 3px;
}
/* chip 结构 = 缩略图 + 编号 + 元素名称 + 下拉箭头（编号与图上徽标一一对应） */
.inline-prompt-element .inline-element-index {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 13px;
  height: 13px;
  padding: 0 3px;
  border-radius: 7px;
  color: #fff;
  background: var(--blue);
  font-size: 10px;
  font-weight: 700;
  font-style: normal;
  line-height: 1;
}
.inline-prompt-element .inline-element-caret {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  color: inherit;
  cursor: pointer;
}
.inline-prompt-element .inline-element-caret svg { width: 11px; height: 11px; }
.inline-prompt-element .inline-element-caret:hover { opacity: .65; }
.generation-prompt-inline > .node-prompt-input,
.generation-prompt-inline > .generation-config-prompt {
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  resize: none;
}
.generation-prompt-inline > .node-prompt-input:focus,
.generation-prompt-inline > .generation-config-prompt:focus {
  border: 0;
  box-shadow: none;
  outline: 0;
}
.node-reference-chips { max-height: 66px; overflow-y: auto; padding-bottom: 4px; flex-wrap: wrap; align-items: flex-start; }
.node-prompt-shell .generation-reference-chip,
.generation-prompt-shell .generation-reference-chip { max-width: 120px; height: 25px; font-size: 11px; }
.generation-prompt-shell .generation-config-prompt { border: 0; background: transparent; }
.video-composer-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 84px auto;
  align-items: center;
  gap: 6px;
}
.video-composer-controls > button,
.video-composer-controls > select {
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;            /* 压掉全局 48px 触摸目标，防止竖长胶囊 */
  height: 36px;
  padding: 0 10px;
  border: 1px solid #e2dfd9;
  border-radius: 18px;
  color: #45413c;
  background: #f8f7f3;
  font-size: 11px;
}
.video-composer-controls > button { display: flex; align-items: center; justify-content: center; gap: 5px; cursor: pointer; }
.video-composer-controls > button svg { width: 14px; height: 14px; }
.video-composer-controls .node-run-button { border-color: #242424; color: #fff; background: #242424; font-weight: 700; }
.video-composer-controls .node-run-button:hover:not(:disabled) { background: #111; }
.video-composer-controls .node-run-button:disabled { opacity: .58; }
.smart-text-node { min-width: 320px; min-height: 190px; }
.smart-text-editor { min-height: 150px; max-height: 320px; overflow: hidden; padding: 18px; outline: none; color: #302f2d; font-size: 15px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
/* 只有点了「编辑文字」进入编辑态，正文框才吃掉滚轮做上下滚动；非编辑态滚轮留给画布缩放。 */
.smart-text-editor.editing { overflow-y: auto; }
.smart-node-actions { position: absolute; z-index: 18; left: 50%; bottom: calc(100% + 34px); padding: 7px; border-radius: 13px; display: flex; gap: 4px; background: #232323; box-shadow: 0 12px 28px rgba(0,0,0,.22); transform: translateX(-50%); white-space: nowrap; }
.node-top-toolbar { position: absolute; z-index: 18; left: 50%; bottom: calc(100% + 34px); padding: 7px; border-radius: 13px; display: flex; gap: 4px; background: #232323; box-shadow: 0 12px 28px rgba(0,0,0,.22); transform: translateX(-50%); white-space: nowrap; }
.node-top-toolbar button { min-height: 36px; padding: 0 9px; border: 0; border-radius: 7px; color: #fff; background: transparent; font-size: 11px; cursor: pointer; }
.node-top-toolbar button:hover { background: #3a3a3a; }
.smart-node-actions button, .node-quick-action { min-height: 36px; padding: 0 9px; border: 0; border-radius: 7px; display: flex; align-items: center; gap: 5px; color: #fff; background: transparent; font-size: 11px; cursor: pointer; }
.smart-node-actions button:hover { background: #3a3a3a; }
.smart-node-actions svg, .node-quick-action svg { width: 14px; height: 14px; }
.node-quick-action { margin-top: 8px; color: #315377; background: #eef4fb; }
.inline-image-action { position: absolute; top: 40px; right: 12px; min-height: 28px; padding: 0 8px; border: 1px solid #dce4ef; border-radius: 999px; display: flex; align-items: center; gap: 4px; color: #52647b; background: #fff; font-size: 11px; cursor: pointer; }
.inline-image-action svg { width: 13px; height: 13px; }
.node-follow-panel { position: absolute; z-index: 20; top: calc(100% + 14px); left: -14px; width: 300px; padding: 14px; border: 1px solid #d9e0e8; border-radius: 12px; background: #fff; box-shadow: 0 14px 32px rgba(20, 38, 68, .18); }
.node-follow-panel textarea { box-sizing: border-box; width: 100%; min-height: 82px; padding: 10px; border: 1px solid #dfe6ef; border-radius: 8px; resize: vertical; outline: none; font: inherit; font-size: 12px; }
.generator-config-row { margin-top: 10px; display: flex; gap: 7px; }
.generator-config-row select, .generator-config-row button { min-height: 34px; padding: 0 9px; border: 1px solid #dfe5ee; border-radius: 8px; color: #35465d; background: #f8fafc; font-size: 11px; cursor: pointer; }
.generator-config-row select { min-width: 0; flex: 1; }
.generator-config-row button { color: #fff; background: var(--blue); }
/* 文本节点编辑卡片：整卡外观与输入框直接复用 .image-composer-panel（宽度也一致），
   只把底部控件区从「模型 + 比例 + 生成」三列收成「文本模型 + 发送」两列。 */
.text-agent-controls { grid-template-columns: minmax(0, 1fr) auto; }
.text-agent-controls .composer-model-select { grid-column: 1 / 2; }
.text-agent-controls .node-run-button { grid-column: 2 / 3; }
.node-prompt-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 72px;
  margin-top: 10px;
  padding: 10px 11px;
  border: 1px solid #dfe6ef;
  border-radius: 9px;
  resize: vertical;
  outline: none;
  color: #36475f;
  background: #f8faff;
  font: inherit;
  font-size: 12px;
  line-height: 1.55;
}
.node-prompt-input:focus { border-color: #86b1f5; box-shadow: 0 0 0 3px rgba(40, 120, 240, .08); }
.generator-reference {
  min-height: 42px;
  margin-top: 8px;
  padding: 5px 8px 5px 5px;
  border: 1px solid #dfe7f3;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #607089;
  background: #fff;
  font-size: 10px;
}
.generator-reference img { width: 42px; height: 34px; border-radius: 6px; object-fit: contain; background: #eef2f6; }
.generator-output { height: 150px; margin-top: 9px; overflow: hidden; border-radius: 9px; background: #eef2f6; }
.generator-output img,
.generator-output video { width: 100%; height: 100%; display: block; object-fit: contain; }
.video-output { aspect-ratio: 16 / 9; height: auto; }
.text-generator-output {
  max-height: 150px;
  margin-top: 9px;
  overflow: auto;
  padding: 10px;
  border-radius: 8px;
  color: #3e4f68;
  background: #f5f3ff;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}
.generator-error { margin: 8px 0 0; color: #c64b4b; font-size: 10px; line-height: 1.45; }
.generator-footer { margin-top: 9px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.generator-status { min-width: 0; color: #7c899b; font-size: 10px; }
.generator-status.running { color: #2878e8; }
.generator-status.succeeded { color: #20a968; }
.generator-status.failed { color: #c64b4b; }
.node-run-button {
  min-height: 36px;
  padding: 0 13px;
  border: 0;
  border-radius: 8px;
  color: #fff;
  background: var(--blue);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.node-run-button:hover:not(:disabled) { background: #176be5; }
.node-run-button:disabled { opacity: .65; cursor: wait; }

.free-text-node { position: relative; min-width: 180px; padding: 2px; color: #20242b; background: transparent; }
.free-text-node.selected { outline: 2px solid #48c8df; outline-offset: 2px; }
.free-text-editor {
  box-sizing: border-box;
  min-height: 72px;
  padding: 4px 7px;
  overflow: auto;
  resize: both;
  outline: none;
  line-height: 1.25;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  cursor: text;
}
.free-text-editor:focus { box-shadow: inset 0 0 0 1px rgba(72, 200, 223, .75); }
.plain-text-toolbar { min-width: 310px; }
.plain-text-toolbar .text-color-control { width: 30px; height: 30px; display: grid; place-items: center; }
.plain-text-toolbar .text-color-control input { width: 24px; height: 24px; padding: 0; border: 0; border-radius: 7px; overflow: hidden; cursor: pointer; }
.plain-text-toolbar .text-align-group { display: flex; align-items: center; gap: 2px; padding-left: 5px; border-left: 1px solid #e7e9ed; }
.plain-text-toolbar .text-align-group button { width: 27px; min-height: 30px; font-size: 12px; }
.plain-text-toolbar > button:last-child { margin-left: 2px; border-left: 1px solid #e7e9ed; border-radius: 0; }
.text-floating-toolbar {
  position: absolute;
  z-index: 12;
  left: 50%;
  bottom: calc(100% + 12px);
  min-height: 44px;
  padding: 5px 7px;
  border: 1px solid #e2e6ec;
  border-radius: 13px;
  display: flex;
  align-items: center;
  gap: 5px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(24, 41, 68, .16);
  transform: translateX(-50%);
  white-space: nowrap;
}
.text-floating-toolbar input[type='color'] { width: 30px; height: 30px; padding: 2px; border: 0; border-radius: 7px; background: #f2f4f7; cursor: pointer; }
.text-floating-toolbar select,
.text-floating-toolbar .text-size-input {
  height: 32px;
  border: 0;
  border-radius: 7px;
  color: #27364d;
  background: #f7f8fa;
  font: inherit;
  font-size: 11px;
}
.text-floating-toolbar select { max-width: 112px; padding: 0 7px; }
.text-floating-toolbar .text-size-input { width: 54px; padding: 0 5px; }
.text-floating-toolbar button {
  width: 32px;
  min-height: 32px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  display: grid;
  place-items: center;
  color: #26354b;
  background: #f7f8fa;
  font-weight: 800;
  cursor: pointer;
}
.text-floating-toolbar button.active { color: #fff; background: var(--blue); }
.text-floating-toolbar button svg { width: 15px; height: 15px; }

.zoom-dock {
  position: absolute;
  z-index: 25;
  left: 18px;
  bottom: 18px;
  height: 54px;
  padding: 6px;
  border: 1px solid #dfe6ef;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 3px;
  background: rgba(255, 255, 255, .96);
  box-shadow: 0 8px 22px rgba(23, 39, 66, .08);
}
.zoom-dock button {
  width: 39px;
  min-height: 39px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: #2c405f;
  background: transparent;
  cursor: pointer;
}
.zoom-dock button:hover { background: #f1f5fa; }
.zoom-dock svg { width: 18px; height: 18px; }
.zoom-dock strong { min-width: 51px; font-size: 14px; text-align: center; }
.dock-divider { width: 1px; height: 26px; margin: 0 3px; background: #e3e8ef; }
.canvas-mode-note {
  position: absolute;
  z-index: 20;
  right: 16px;
  bottom: 18px;
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid #e2e8f0;
  border-radius: 9px;
  display: flex;
  align-items: center;
  gap: 7px;
  color: #65738a;
  background: rgba(255, 255, 255, .88);
  font-size: 11px;
}
.canvas-mode-note svg { width: 15px; height: 15px; }
.edge-action-dock,
.edge-undo-toast {
  position: absolute;
  z-index: 29;
  left: 50%;
  bottom: 84px;
  transform: translateX(-50%);
  border: 1px solid #dfe6ef;
  border-radius: 12px;
  background: rgba(255, 255, 255, .98);
  box-shadow: 0 12px 30px rgba(23, 39, 66, .15);
}
.edge-action-dock {
  width: min(560px, calc(100% - 36px));
  min-height: 56px;
  padding: 6px 8px 6px 14px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
}
.edge-relation {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #21344f;
}
.edge-relation > svg { width: 18px; height: 18px; flex: 0 0 auto; color: var(--blue); }
.edge-relation strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.edge-action-dock button,
.edge-undo-toast button {
  min-height: 44px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
}
.edge-cancel-button {
  min-width: 64px;
  padding: 0 14px;
  border: 1px solid #e0e6ef;
  color: #4a5870;
  background: #f6f8fb;
}
.edge-cancel-button:hover { border-color: #cbd6e5; background: #eef2f7; }
.edge-delete-button {
  min-width: 112px;
  padding: 0 16px;
  border: 1px solid #f04444;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: #fff;
  background: #f04444;
  box-shadow: 0 6px 15px rgba(240, 68, 68, .2);
}
.edge-delete-button:hover { border-color: #d93636; background: #d93636; }
.edge-delete-button svg { width: 17px; height: 17px; }
.edge-undo-toast {
  min-height: 52px;
  max-width: min(520px, calc(100% - 36px));
  padding: 4px 6px 4px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  color: #34445d;
  font-size: 12px;
}
.edge-undo-toast span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.edge-undo-toast button {
  min-width: 66px;
  padding: 0 14px;
  border: 0;
  color: var(--blue);
  background: #edf5ff;
}
.edge-undo-toast button:hover { background: #dfeeff; }
.connection-guide {
  position: absolute;
  z-index: 24;
  top: 18px;
  right: 18px;
  min-height: 42px;
  max-width: calc(100% - 36px);
  padding: 7px 8px 7px 12px;
  border: 1px solid #b9d3fa;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #49617e;
  background: rgba(255, 255, 255, .96);
  box-shadow: 0 8px 22px rgba(25, 50, 88, .11);
  font-size: 11px;
}
.connection-guide > svg { width: 17px; height: 17px; flex: 0 0 auto; color: var(--blue); }
.connection-guide span { white-space: nowrap; }
.connection-guide strong { color: #23405f; }
.connection-guide button {
  min-height: 28px;
  padding: 0 9px;
  border: 0;
  border-radius: 7px;
  color: #fff;
  background: var(--blue);
  font-size: 10px;
  cursor: pointer;
  white-space: nowrap;
}
.connection-guide button:hover { background: #176be5; }
.connection-create-menu {
  position: absolute;
  z-index: 28;
  width: 220px;
  padding: 8px;
  border: 1px solid #dfe5ef;
  border-radius: 14px;
  background: rgba(255, 255, 255, .98);
  box-shadow: 0 12px 30px rgba(24, 47, 80, .18);
}
.connection-create-menu button {
  width: 100%;
  min-height: 48px;
  margin: 0 0 6px;
  padding: 0 14px;
  border: 1px solid #dfe5ef;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 14px;
  color: #1e3555;
  background: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
.connection-create-menu button:last-child { margin-bottom: 0; }
.connection-create-menu button:hover { border-color: #9bbcf2; background: #eef5ff; color: #286ed6; }
.connection-create-menu svg { width: 20px; height: 20px; color: #4b72e8; }

.canvas-generation-config {
  position: absolute;
  z-index: 26;
  top: 96px;
  left: clamp(112px, 16vw, 220px);
  width: min(360px, calc(100% - 154px));
  padding: 13px;
  border: 1px solid #3986ff;
  border-radius: 14px;
  color: #202b3a;
  background: rgba(255, 255, 255, .98);
  box-shadow: 0 14px 34px rgba(31, 67, 119, .2);
  will-change: transform;
}
.canvas-generation-config.is-dragging { user-select: none; box-shadow: 0 18px 40px rgba(31, 67, 119, .28); }
.generation-config-node {
  position: relative;
  top: auto;
  left: auto;
  z-index: auto;
  width: 380px;
  max-width: none;
  min-width: 0;
  margin: 0;
  transform: none;
  cursor: default;
}
.generation-config-node.selected { border-width: 2px; box-shadow: 0 9px 26px rgba(31, 67, 119, .24); }
.generation-config-node-header { cursor: grab; }
.generation-config-node-header:active { cursor: grabbing; }
.generation-config-node-delete { width: 26px; min-height: 26px; padding: 0; border: 0; border-radius: 7px; display: grid; place-items: center; color: #536078; background: transparent; cursor: pointer; }
.generation-config-node-delete:hover { color: #c54e4e; background: #fff1f1; }
.generation-config-node-delete svg { width: 15px; height: 15px; }
.generation-config-header { min-height: 28px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.generation-config-header { cursor: grab; touch-action: none; }
.canvas-generation-config.is-dragging .generation-config-header { cursor: grabbing; }
.generation-config-header strong { font-size: 14px; }
.generation-config-header button { width: 30px; min-height: 30px; padding: 0; border: 0; border-radius: 7px; display: grid; place-items: center; color: #536078; background: transparent; cursor: pointer; }
.generation-config-header button:hover { background: #f0f3f7; }
.generation-config-header svg { width: 17px; height: 17px; }
.generation-mode-tabs { margin-top: 12px; padding: 4px; border: 1px solid #e3e7ed; border-radius: 10px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 3px; background: #f8f9fb; }
.generation-mode-tabs button { min-width: 0; min-height: 30px; padding: 0 4px; border: 0; border-radius: 7px; display: flex; align-items: center; justify-content: center; gap: 4px; color: #627088; background: transparent; font-size: 10px; cursor: pointer; white-space: nowrap; }
.generation-mode-tabs button.active { color: #26364d; background: #fff; box-shadow: 0 2px 7px rgba(29, 50, 78, .12); font-weight: 700; }
.generation-mode-tabs button:hover:not(.audio-config-tab) { color: #246fd8; }
.generation-mode-tabs svg { width: 14px; height: 14px; flex: 0 0 auto; }
.generation-mode-tabs .audio-config-tab { color: #a4aeba; cursor: not-allowed; }
.generation-reference-summary { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
.generation-reference-summary span { min-height: 26px; padding: 0 8px; border: 1px solid #e5e9ee; border-radius: 7px; display: inline-flex; align-items: center; color: #5f6d80; background: #f8fafc; font-size: 10px; }
.generation-reference-summary .audio-placeholder { color: #a4aeba; }
.compose-prompt-button { min-height: 32px; margin-top: 10px; padding: 0 9px; border: 1px solid #d9e0e9; border-radius: 8px; display: inline-flex; align-items: center; gap: 5px; color: #40536d; background: #fff; font-size: 11px; cursor: pointer; }
.compose-prompt-button:hover { border-color: #8db8fa; color: #176be5; background: #f3f8ff; }
.compose-prompt-button svg { width: 14px; height: 14px; }
.generation-config-prompt { box-sizing: border-box; width: 100%; min-height: 78px; margin-top: 8px; padding: 9px; border: 1px solid #e0e5ec; border-radius: 8px; resize: vertical; outline: none; color: #2e3c51; background: #fff; font: inherit; font-size: 12px; line-height: 1.5; }
.generation-config-prompt:focus { border-color: #7daef7; box-shadow: 0 0 0 3px rgba(47, 126, 241, .1); }
.generation-reference-chips { display: flex; align-items: center; gap: 6px; max-width: 100%; overflow-x: auto; padding: 2px 0 7px; scrollbar-width: thin; }
.node-reference-chips { flex-wrap: nowrap; overflow: visible; }
.generation-reference-chip { min-width: 0; max-width: 180px; height: 22px; display: inline-flex; align-items: center; gap: 3px; padding: 0 3px; border: 1px solid rgba(22,131,255,.28); border-radius: 6px; background: #eef6ff; color: #1260b3; font-size: 11px; font-weight: 700; white-space: nowrap; user-select: none; vertical-align: middle; }
.generation-reference-chip img { width: 20px; height: 20px; flex: 0 0 auto; border-radius: 3px; object-fit: cover; }
.generation-reference-chip svg { width: 16px; height: 16px; flex: 0 0 auto; }
.generation-reference-chip span { overflow: hidden; text-overflow: ellipsis; }
.generation-reference-remove { flex: 0 0 auto; width: 14px; height: 14px; padding: 0; border: 0; border-radius: 999px; display: inline-grid; place-items: center; color: inherit; background: transparent; font-size: 12px; line-height: 1; cursor: pointer; }
.generation-reference-remove:hover { background: rgba(18,96,179,.15); }
.generation-config-controls { margin-top: 10px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.22fr) auto; gap: 7px; }
.generation-config-controls.text-config-controls { grid-template-columns: minmax(0, 1fr) auto; }
.generation-config-controls select,
.camera-placeholder-button { min-width: 0; min-height: 37px; padding: 0 9px; border: 1px solid #dfe5ec; border-radius: 9px; color: #3d4d63; background: #f9fafb; font-size: 11px; outline: none; }
.camera-placeholder-button { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; white-space: nowrap; }
.camera-placeholder-button:hover { border-color: #aab9ca; background: #f0f3f7; }
.camera-placeholder-button svg { width: 14px; height: 14px; }
.generation-config-run { width: 100%; min-height: 36px; margin-top: 8px; border: 0; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 7px; color: #fff; background: #242424; font-size: 12px; font-weight: 700; cursor: pointer; }
.generation-config-run:hover { background: #101010; }
.generation-config-run svg { width: 16px; height: 16px; }
.canvas-generation-config > small { display: block; margin-top: 8px; color: #7e8a9a; font-size: 10px; line-height: 1.45; }

.right-panel {
  position: relative;
  z-index: 30;
  min-width: 0;
  border-left: 1px solid var(--line);
  background: #f8fafc;
  box-shadow: -5px 0 18px rgba(25, 42, 72, .035);
}
.right-panel-inner {
  height: 100%;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.right-panel-toggle {
  position: absolute;
  z-index: 5;
  left: -18px;
  top: 50%;
  width: 19px;
  min-height: 52px;
  padding: 0;
  border: 1px solid #dde4ee;
  border-right: 0;
  border-radius: 9px 0 0 9px;
  display: grid;
  place-items: center;
  color: #2a4b78;
  background: #fff;
  cursor: pointer;
  box-shadow: -5px 5px 12px rgba(26, 44, 72, .06);
  transform: translateY(-50%);
}
.right-panel-toggle svg { width: 15px; height: 15px; }
.right-panel-collapsed .right-panel { overflow: visible; border: 0; }
.right-panel-collapsed .right-panel-toggle { left: -20px; border: 1px solid #dde4ee; border-radius: 9px 0 0 9px; }

.accordion-section {
  overflow: hidden;
  border: 1px solid #dfe6ef;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 5px 16px rgba(24, 42, 73, .04);
}
.accordion-header {
  width: 100%;
  min-height: 78px;
  padding: 14px 16px;
  border: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #1d2f49;
  background: #fff;
  text-align: left;
  cursor: pointer;
}
.accordion-header > svg { width: 17px; height: 17px; color: #3d5879; }
.accordion-icon {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}
.accordion-icon svg { width: 22px; height: 22px; }
.assistant-icon { color: #7564f7; }
.settings-icon { color: #34b978; }
.accordion-heading { min-width: 0; display: grid; gap: 6px; flex: 1; }
.accordion-heading strong { font-size: 15px; }
.accordion-heading small { color: #7c899d; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.continue-copy { color: #79869a; font-size: 10px; white-space: nowrap; }

.assistant-section.open { min-height: 0; flex: 1; display: flex; flex-direction: column; }
.assistant-section.open .accordion-header { flex: 0 0 auto; }
.assistant-content { min-height: 0; padding: 0 16px 16px; flex: 1; display: flex; flex-direction: column; }
.assistant-greeting { padding: 8px 2px 14px; }
.assistant-greeting span,
.assistant-greeting strong { display: block; color: #27455c; font-size: 20px; line-height: 1.35; }
.assistant-greeting p { margin: 8px 0 0; color: #8792a4; font-size: 12px; line-height: 1.55; }
.assistant-context {
  width: fit-content;
  max-width: 100%;
  margin-top: 10px;
  padding: 5px 9px;
  border-radius: 999px;
  display: block;
  overflow: hidden;
  color: #5f52db;
  background: #f2efff;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.assistant-suggestions { display: flex; flex-wrap: wrap; gap: 7px; }
.assistant-suggestions button {
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid #e0e6ef;
  border-radius: 999px;
  color: #56657a;
  background: #fff;
  font-size: 11px;
  cursor: pointer;
}
.assistant-suggestions button:hover { color: #5f52db; border-color: #cfc8ff; background: #f7f5ff; }
.assistant-messages { margin-top: 12px; min-height: 0; max-height: 230px; overflow-y: auto; display: grid; gap: 8px; }
.assistant-message {
  width: fit-content;
  max-width: 88%;
  padding: 9px 11px;
  border-radius: 10px;
  color: #536078;
  background: #f1f4f8;
  font-size: 11px;
  line-height: 1.55;
}
.assistant-message.user { margin-left: auto; color: #fff; background: #596dff; }
/* 单步执行小票：等宽状态条 + 单步撤销 */
.assistant-message.ticket {
  width: 100%;
  max-width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  color: #2f6b46;
  background: #f0f8f3;
  border: 1px solid #d6ecdf;
  border-radius: 8px;
}
.assistant-message.ticket.undone { color: #7b8798; background: #f4f6f9; border-color: #e3e8ef; }
.assistant-message.ticket.undone .ticket-text { text-decoration: line-through; }
.ticket-badge { display: inline-flex; flex: 0 0 auto; color: #2f9e5f; }
.ticket-badge svg { width: 14px; height: 14px; }
.ticket-text { flex: 1 1 auto; min-width: 0; font-size: 11px; line-height: 1.5; word-break: break-all; }
.ticket-undo {
  flex: 0 0 auto;
  min-width: 0;
  min-height: 0;
  padding: 3px 8px;
  border: 1px solid #cfe0d6;
  border-radius: 6px;
  color: #2f6b46;
  background: #fff;
  font-size: 10px;
  cursor: pointer;
}
.ticket-undo:hover { color: #1f8a4c; border-color: #a9d5bd; }
.ticket-undone { flex: 0 0 auto; color: #9aa6b8; font-size: 10px; }
.assistant-message.note { color: #6b7789; background: transparent; border: 1px dashed #dbe2ec; }
.assistant-message.evaluation { display: grid; gap: 6px; border-color: #b9ccf5; background: #f3f7ff; }
.evaluation-text { white-space: pre-wrap; }
.evaluation-applied { color: #2f9e6b; font-size: 12px; }
.image-variant-strip { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.image-variant-thumb { position: relative; width: 46px; height: 46px; min-width: 0; min-height: 0; padding: 0; border: 2px solid transparent; border-radius: 8px; overflow: hidden; background: #eef2f8; cursor: pointer; }
.image-variant-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.image-variant-thumb span { position: absolute; right: 2px; bottom: 1px; min-width: 14px; height: 14px; border-radius: 7px; background: rgba(20, 30, 50, .72); color: #fff; font-size: 10px; line-height: 14px; text-align: center; }
.image-variant-thumb.active { border-color: #596dff; }
.assistant-message button {
  min-height: 30px;
  margin-top: 8px;
  padding: 0 9px;
  border: 1px solid #c8dafa;
  border-radius: 7px;
  display: block;
  color: #2767c8;
  background: #fff;
  cursor: pointer;
}
.assistant-composer {
  margin-top: auto;
  min-height: 112px;
  padding: 12px 12px 10px;
  border: 1px solid #9de8f5;
  border-radius: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #fff;
}
.assistant-composer:focus-within { border-color: #65d6ec; box-shadow: 0 0 0 3px rgba(61, 207, 234, .1); }
.assistant-composer > textarea {
  width: 100%;
  min-height: 42px;
  padding: 0;
  border: 0;
  resize: none;
  outline: none;
  color: #2f3d52;
  background: transparent;
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
}
.assistant-composer > textarea::placeholder { color: #b3bac4; }
.assistant-composer-toolbar { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.assistant-composer-tools { min-width: 0; display: flex; align-items: center; gap: 7px; }
.assistant-composer button { border: 0; cursor: pointer; }
.composer-upload {
  width: 30px;
  min-height: 30px;
  padding: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #17243a;
  background: #f4f5f7;
}
.composer-upload:hover { background: #e9edf2; }
.assistant-composer select {
  min-width: 0;
  max-width: 126px;
  height: 30px;
  padding: 0 20px 0 22px;
  border: 0;
  outline: none;
  color: #344154;
  background: transparent;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.assistant-composer-tools .model-icon { width: 15px; height: 15px; margin-right: -24px; position: relative; z-index: 1; color: #596dff; pointer-events: none; }
.composer-primary {
  width: 34px;
  min-height: 34px;
  padding: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: #17243a;
}
.composer-primary:hover { background: #0f1a2b; }
.composer-primary.voice-button.listening { background: #e0505b; animation: pulse 1s ease-in-out infinite; }
.assistant-composer svg { width: 16px; height: 16px; }
.assistant-attachment {
  min-height: 28px;
  padding: 0 5px 0 8px;
  border: 1px solid #e3e8ef;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #5a687c;
  background: #f8fafc;
  font-size: 10px;
}
.assistant-attachment > svg { color: #5e6ef5; }
.assistant-attachment span { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.assistant-attachment button { width: 24px; min-height: 24px; padding: 0; border-radius: 6px; display: grid; place-items: center; color: #6f7b8d; background: transparent; }
.assistant-attachment button:hover { background: #edf1f5; }
.assistant-attachment button svg { width: 13px; height: 13px; }
.assistant-disclaimer { display: block; margin-top: 8px; color: #9aa4b4; font-size: 10px; line-height: 1.45; }

.settings-content { padding: 0 16px 16px; }
.field-label { display: block; margin: 5px 0 8px; color: #4d5e75; font-size: 12px; font-weight: 700; }
.settings-image { height: 126px; overflow: hidden; border-radius: 9px; background: #eef2f6; }
.settings-content textarea {
  width: 100%;
  min-height: 92px;
  padding: 11px;
  border: 1px solid #dfe5ee;
  border-radius: 9px;
  resize: vertical;
  color: #4a5870;
  background: #fff;
  font-size: 12px;
  line-height: 1.55;
  outline: none;
}
.settings-content textarea:focus { border-color: #86b1f5; box-shadow: 0 0 0 3px rgba(40, 120, 240, .08); }
.counter { margin: -22px 9px 10px 0; position: relative; color: #8a96a8; font-size: 10px; text-align: right; pointer-events: none; }
.setting-row {
  min-height: 50px;
  border-top: 1px solid #edf0f4;
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  color: #465770;
  font-size: 12px;
  font-weight: 700;
}
.setting-row select {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #dfe5ee;
  border-radius: 8px;
  color: #40536e;
  background: #fff;
  outline: none;
}
.duration-row { grid-template-columns: 84px minmax(0, 1fr); }
.segmented-control { padding: 3px; border: 1px solid #dfe5ee; border-radius: 8px; display: grid; grid-template-columns: repeat(3, 1fr); background: #f8fafc; }
.segmented-control:has(button:only-child) { grid-template-columns: 1fr; }
.segmented-control button {
  min-height: 29px;
  border: 0;
  border-radius: 6px;
  color: #4d5f78;
  background: transparent;
  font-size: 11px;
  cursor: pointer;
}
.segmented-control button.active { color: #fff; background: var(--blue); box-shadow: 0 4px 10px rgba(40, 120, 240, .22); }
.creativity-row { grid-template-columns: 84px minmax(0, 1fr) 42px; }
.creativity-row input { width: 100%; accent-color: var(--blue); }
.creativity-row output {
  min-height: 32px;
  border: 1px solid #e1e6ed;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: #536078;
  background: #fff;
  font-weight: 500;
}
/* 张数：8 档横排，窄侧栏下也要一眼看全，所以不换行、字号收紧 */
.count-control { grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 2px; }
.count-control button { padding: 0; min-width: 0; font-size: 12px; }
.count-hint {
  margin: -2px 0 8px;
  color: #8290a4;
  font-size: 11px;
  line-height: 1.5;
}
.credit-hint {
  min-height: 48px;
  margin-top: 8px;
  padding: 0 12px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #2871da;
  background: #eaf3ff;
  font-size: 12px;
  font-weight: 700;
}
.credit-hint svg { width: 19px; height: 19px; }
.credit-hint small { margin-left: auto; color: #8290a4; font-size: 10px; font-weight: 500; }
.generate-button {
  width: 100%;
  min-height: 48px;
  margin-top: 10px;
  border: 0;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #fff;
  background: var(--blue);
  box-shadow: 0 8px 18px rgba(40, 120, 240, .2);
  cursor: pointer;
  font-weight: 700;
}
.generate-button:hover:not(:disabled) { background: #176be5; }
.generate-button:disabled { opacity: .75; cursor: wait; }
.button-spinner { width: 17px; height: 17px; color: #fff; }
.run-status { margin-top: 10px; padding-top: 10px; border-top: 1px solid #edf0f4; display: grid; gap: 7px; }
.run-status strong { color: #536078; font-size: 11px; }
.run-status span { display: flex; align-items: center; gap: 7px; color: #6d7a8f; font-size: 11px; }
.run-status i { width: 7px; height: 7px; border-radius: 50%; background: #36bf7f; }
.run-status i.running { background: #2f80ed; animation: pulse 1s ease-in-out infinite; }
.settings-error { color: #c64b4b; font-size: 10px; line-height: 1.5; }
.generic-node-settings { min-height: 230px; display: grid; place-items: center; align-content: center; gap: 10px; text-align: center; }
.generic-node-settings > svg { width: 34px; height: 34px; color: #5f6ef5; }
.generic-node-settings p { margin: 0; color: #7b879a; font-size: 11px; line-height: 1.6; }
.generic-node-settings button { min-height: 36px; padding: 0 12px; border: 1px solid #f1cccc; border-radius: 8px; display: flex; align-items: center; gap: 6px; color: #c84c4c; background: #fff; cursor: pointer; }
.generic-node-settings button:hover { background: #fff4f4; }
.generic-node-settings button svg { width: 15px; height: 15px; }

.visually-hidden { position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.popover-enter-active,
.popover-leave-active,
.fade-enter-active,
.fade-leave-active { transition: opacity .16s ease, transform .16s ease; }
.popover-enter-from,
.popover-leave-to { opacity: 0; transform: translateX(-6px) scale(.98); }
.fade-enter-from,
.fade-leave-to,
.edge-dock-enter-from,
.edge-dock-leave-to { opacity: 0; }
.edge-dock-enter-active,
.edge-dock-leave-active { transition: opacity .16s ease, transform .16s ease; }
.edge-dock-enter-from,
.edge-dock-leave-to { transform: translate(-50%, 8px); }

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse { 50% { opacity: .35; transform: scale(.82); } }

@media (max-width: 1180px) {
  .workspace-shell { grid-template-columns: 78px minmax(0, 1fr) 340px; }
  .workspace-shell.right-panel-collapsed { grid-template-columns: 78px minmax(0, 1fr) 0; }
  .tool-rail { width: 78px; }
  .create-popover { left: 90px; }
  .continue-copy { display: none; }
}

@media (max-width: 880px) {
  .workflow-topbar { grid-template-columns: minmax(0, 1fr) auto; }
  .save-state { display: none; }
  .workspace-shell { grid-template-columns: 72px minmax(0, 1fr); }
  .tool-rail { width: 72px; }
  .right-panel { position: absolute; top: 64px; right: 0; bottom: 0; width: min(390px, calc(100vw - 72px)); }
  .right-panel-collapsed .right-panel { width: 0; }
  .create-popover { left: 84px; width: 188px; }
  .rail-actions { padding-inline: 7px; }
  .canvas-mode-note { display: none; }
   .canvas-generation-config { top: 82px; left: 14px; width: min(360px, calc(100% - 28px)); max-height: calc(100% - 98px); overflow-y: auto; }
  .edge-action-dock,
  .edge-undo-toast {
    left: 18px;
    right: calc(min(390px, calc(100vw - 72px)) + 12px);
    width: auto;
    max-width: none;
    transform: none;
  }
  .workspace-shell.right-panel-collapsed .edge-action-dock,
  .workspace-shell.right-panel-collapsed .edge-undo-toast { right: 18px; }
  .edge-relation { gap: 4px; }
  .edge-relation > svg { display: none; }
  .edge-relation strong {
    display: -webkit-box;
    overflow: hidden;
    white-space: normal;
    line-height: 1.25;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .edge-dock-enter-from,
  .edge-dock-leave-to { transform: translateY(8px); }
}

@media (max-width: 520px) {
  .generation-config-controls { grid-template-columns: 1fr 1fr; }
  .camera-placeholder-button { grid-column: 1 / -1; justify-content: center; }
  .generation-mode-tabs button { font-size: 10px; }
}

.node-upstream-thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0 0 10px;
  padding: 2px 0 0;
}
/* 连了上游、但上游暂无可引用内容时：保留卡片位置（占位卡位），不再用文字提示。 */
.upstream-thumb-placeholder {
  flex: 0 0 auto;
  width: 65px;
  height: 65px;
  border: 1px dashed #cfd8e3;
  border-radius: 12px;
  background: #f6f8fb;
}
.upstream-thumb {
  position: relative;
  width: 65px;
  height: 65px;
  flex: 0 0 auto;
}
.upstream-thumb-open {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(22, 131, 255, .28);
  border-radius: 12px;
  background: #eef6ff;
  color: #1260b3;
  cursor: zoom-in;
}
.upstream-thumb-open:hover { border-color: #86b1f5; box-shadow: 0 0 0 2px rgba(40, 120, 240, .12); }
.upstream-thumb-open img { display: block; width: 100%; height: 100%; object-fit: cover; }
.upstream-thumb-open svg { width: 40px; height: 40px; }
.upstream-thumb-index {
  position: absolute;
  top: -8px;
  left: -8px;
  box-sizing: border-box;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  border-radius: 12px;
  background: #334155;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  line-height: 24px;
  text-align: center;
  pointer-events: none;
}
.upstream-thumb-remove {
  position: absolute;
  top: -8px;
  right: -8px;
  display: flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: #334155;
  color: #fff;
  opacity: 0;
  cursor: pointer;
  transition: opacity .12s ease;
}
.upstream-thumb:hover .upstream-thumb-remove,
.upstream-thumb-remove:focus-visible { opacity: 1; }
.upstream-thumb-remove svg { width: 14px; height: 14px; }
.upstream-thumb-mention {
  position: absolute;
  right: -8px;
  bottom: -8px;
  display: flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: #1260b3;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition: background .12s ease, transform .12s ease;
}
.upstream-thumb-mention:hover { background: #0f4f92; transform: scale(1.08); }
.upstream-thumb-mention:focus-visible { outline: 2px solid #86b1f5; outline-offset: 1px; }
/* 缩略图上的小按钮不适用全局触摸目标尺寸（button { min-height: var(--touch-size) }），否则会被撑成竖长椭圆 */
.upstream-thumb button { min-width: 0; min-height: 0; }

.upstream-preview-layer {
  position: fixed;
  inset: 0;
  z-index: 2100;
}
.upstream-preview-catcher {
  position: absolute;
  inset: 0;
  background: transparent;
}
.upstream-preview-pop {
  position: fixed;
  display: flex;
  flex-direction: column;
  width: 236px;
  overflow: hidden;
  border: 1px solid #dfe6ef;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 16px 40px rgba(15, 23, 42, .2);
}
.upstream-preview-figure {
  display: flex;
  min-height: 140px;
  max-height: 236px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #f8faff;
}
.upstream-preview-figure img,
.upstream-preview-figure video {
  display: block;
  width: 100%;
  max-height: 236px;
  background: #0f172a;
  object-fit: contain;
}
.upstream-preview-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 9px;
  border-top: 1px solid #eef2f8;
}
.upstream-preview-caption strong {
  overflow: hidden;
  color: #33415c;
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.upstream-preview-close {
  display: flex;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid #dfe6ef;
  border-radius: 6px;
  background: #fff;
  color: #4b5a72;
  cursor: pointer;
}
.upstream-preview-close:hover { border-color: #86b1f5; color: #1260b3; }
.upstream-preview-close svg { width: 13px; height: 13px; }
.upstream-preview-text {
  margin: 0;
  padding: 14px;
  max-height: 200px;
  overflow-y: auto;
  color: #2b3646;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
}

/* ============ 局部元素提取引用（标记）：画布级「元素选择模式」 ============ */
/* 模式条在 .canvas-area 内、徽标在画布节点内、下拉菜单被 Teleport 到 body，
   三处共用同一组 token，所以在两个作用域上各声明一次；下面的规则一律只用 var()。 */
.canvas-area,
.element-menu-layer {
  --mark-accent: #1683ff;
  --mark-accent-strong: #1260b3;
  --mark-accent-soft: #eef6ff;
  --mark-border: #cfe0ff;
  --mark-ink: #1f2c45;
  --mark-ink-soft: #40506e;
  --mark-ink-muted: #6b7a94;
  --mark-on-accent-soft: rgba(255, 255, 255, .2);
  --mark-on-accent-strong: rgba(255, 255, 255, .32);
  --mark-on-accent-dim: rgba(255, 255, 255, .82);
  --mark-bar-shadow: 0 8px 24px rgba(23, 43, 77, .18);
  --mark-badge-shadow: 0 2px 6px rgba(15, 23, 42, .28);
}

/* 模式条：画布顶部居中蓝色悬浮条（不是卡片，不遮挡画布交互） */
.mark-mode-bar {
  position: absolute;
  top: 16px;
  left: 50%;
  z-index: 27;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(92%, 760px);
  padding: 8px 10px 8px 14px;
  border-radius: 999px;
  color: #fff;
  background: var(--mark-accent);
  box-shadow: var(--mark-bar-shadow);
  font-size: 12px;
  line-height: 1.4;
}
.mark-mode-bar-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--mark-on-accent-soft);
}
.mark-mode-bar-icon svg { width: 15px; height: 15px; }
.mark-mode-bar-copy { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.mark-mode-bar-copy strong { font-size: 13px; font-weight: 800; letter-spacing: .01em; }
.mark-mode-bar-copy span { color: var(--mark-on-accent-dim); font-size: 11px; white-space: nowrap; }
.mark-mode-bar em {
  flex: 0 0 auto;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--mark-on-accent-soft);
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
}
.mark-mode-back {
  flex: 0 0 auto;
  height: 28px;
  min-height: 0;
  padding: 0 13px;
  border: 0;
  border-radius: 999px;
  color: var(--mark-accent-strong);
  background: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: transform .15s ease, box-shadow .15s ease;
}
.mark-mode-back:hover { transform: translateY(-1px); box-shadow: var(--mark-bar-shadow); }
.mark-mode-close {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  min-width: 0;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: #fff;
  background: var(--mark-on-accent-soft);
  cursor: pointer;
  transition: background-color .15s ease;
}
.mark-mode-close svg { width: 14px; height: 14px; }
.mark-mode-close:hover { background: var(--mark-on-accent-strong); }

/* 画布进入标记态：含图节点可点（十字光标 + 高亮描边），节点拖拽已禁用但画布仍可平移 */
.canvas-area.marking-mode .flow-canvas .mark-target { cursor: crosshair; }
.canvas-area.marking-mode .flow-canvas .mark-target-wrap {
  outline: 2px solid var(--mark-accent);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px var(--mark-accent-soft);
}

/* 图上圆形编号徽标（覆盖在图片框上，按点击点比例定位；随画布缩放/平移不错位） */
.mark-badge-layer { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
.mark-badge {
  position: absolute;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 2px solid #fff;
  border-radius: 50%;
  color: #fff;
  background: var(--mark-accent);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  transform: translate(-50%, -50%);
  pointer-events: none;
  box-shadow: var(--mark-badge-shadow);
}
.mark-badge.active { background: var(--mark-accent-strong); }

/* ============ 标记内容下拉菜单（Teleport 到 body + 屏幕坐标定位） ============ */
.element-menu-layer { position: fixed; inset: 0; z-index: 2300; }
.element-menu-catcher { position: absolute; inset: 0; background: transparent; }
.element-menu-pop {
  position: fixed;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 256px;
  padding: 10px;
  border: 1px solid var(--mark-border);
  border-radius: 12px;
  background: #fff;
  box-shadow: var(--shadow-soft);
}
.element-menu-title { margin: 0; color: var(--mark-ink-muted); font-size: 11px; letter-spacing: .02em; }
.element-menu-list { display: flex; flex-direction: column; gap: 3px; max-height: 208px; overflow-y: auto; }
.element-menu-item {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-height: 34px;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--mark-ink-soft);
  background: transparent;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition: background-color .15s ease;
}
.element-menu-item svg { flex: 0 0 auto; width: 13px; height: 13px; visibility: hidden; }
.element-menu-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.element-menu-item:hover { background: var(--mark-accent-soft); }
.element-menu-item.active { color: var(--mark-accent-strong); font-weight: 700; }
.element-menu-item.active svg { visibility: visible; }
.element-menu-empty { margin: 0; padding: 6px 2px; color: var(--mark-ink-muted); font-size: 12px; }
.element-menu-manual { display: flex; gap: 6px; padding-top: 6px; border-top: 1px solid var(--mark-border); }
.element-menu-manual input {
  box-sizing: border-box;
  flex: 1 1 auto;
  min-width: 0;
  height: 34px;
  padding: 0 9px;
  border: 1px solid var(--mark-border);
  border-radius: 8px;
  color: var(--mark-ink);
  background: #fff;
  font-size: 12px;
}
.element-menu-manual input:focus { outline: 0; border-color: var(--mark-accent); }
.element-menu-manual button {
  flex: 0 0 auto;
  height: 34px;
  padding: 0 13px;
  border: 1px solid var(--mark-accent-strong);
  border-radius: 8px;
  color: #fff;
  background: var(--mark-accent-strong);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

@media (max-width: 640px) {
  .mark-mode-bar { max-width: calc(100% - 24px); gap: 8px; padding-right: 8px; }
  .mark-mode-bar-copy span { display: none; }
  .mark-mode-bar em { display: none; }
  .mark-mode-back { padding: 0 10px; }
}

@media (prefers-reduced-motion: reduce) {
  .mark-mode-back,
  .mark-mode-close,
  .element-menu-item { transition: none; }
}

/* 用户画布和后台玩法工作流共用悬浮操作区，画布铺满各自容器。 */
.workflow-page.floating-workflow-mode { position: relative; height: calc(100dvh - var(--app-top, 0px)); min-height: 0; }
.workflow-page.admin-workflow-mode.floating-workflow-mode { height: 100%; min-height: 0; border: 0; border-radius: 0; }
.floating-workflow-mode .workflow-topbar {
  position: absolute;
  inset: 16px 16px auto;
  height: auto;
  padding: 0;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: #263a59;
  background: transparent;
  box-shadow: none;
  pointer-events: none;
}
.floating-workflow-mode .brand-block,
.floating-workflow-mode .topbar-actions,
.floating-workflow-mode .save-state {
  min-height: 52px;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 6px 22px rgba(25, 42, 72, .08);
  pointer-events: auto;
}
.floating-workflow-mode .brand-block { gap: 12px; padding-left: 16px; }
.floating-workflow-mode .brand-block > strong { font-size: 18px; }
.floating-workflow-mode.admin-workflow-mode .brand-block { min-width: 0; }
.floating-workflow-mode.admin-workflow-mode .project-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #36506f; }
.floating-workflow-mode .file-menu-trigger { color: #36506f; border-color: var(--line); background: #f8fafc; }
.floating-workflow-mode .file-menu-trigger:hover,
.floating-workflow-mode .file-menu-trigger.active { color: var(--blue); background: var(--blue-soft); border-color: #cfe2f9; }
.floating-workflow-mode .canvas-name-action { color: #263a59; }
.floating-workflow-mode .canvas-name-action:hover { border-color: var(--line); background: var(--blue-soft); color: var(--blue); }
.floating-workflow-mode .canvas-name-action svg { opacity: .45; }
.floating-workflow-mode .canvas-name-input { color: #263a59; border-color: var(--blue); background: #fff; }
.floating-workflow-mode .canvas-name-input::placeholder { color: var(--muted); }
.floating-workflow-mode .topbar-actions > button { color: #36506f; }
.floating-workflow-mode .topbar-actions > button:hover:not(:disabled) { color: var(--blue); background: var(--blue-soft); }
.floating-workflow-mode .topbar-divider { background: var(--line); }
.floating-workflow-mode .save-state { min-height: 36px; align-self: center; color: #748199; font-size: 12px; }
.floating-workflow-mode .save-spinner { color: var(--blue); border-color: #d7e6fb; border-top-color: var(--blue); }
.floating-workflow-mode .workspace-shell { position: relative; display: block; height: 100%; min-height: 0; }
.floating-workflow-mode .canvas-area { position: absolute; inset: 0; }
.floating-workflow-mode .marquee-hint,
.floating-workflow-mode .mark-mode-bar,
.floating-workflow-mode .connection-guide { top: 88px; max-width: calc(100% - 132px); }
.floating-workflow-mode .tool-rail {
  position: absolute;
  top: 88px;
  bottom: 80px;
  left: 16px;
  width: 76px;
  border: 1px solid var(--line);
  border-radius: 16px;
  box-shadow: 0 6px 22px rgba(25, 42, 72, .08);
}
.floating-workflow-mode .rail-actions { min-height: 0; padding: 8px; gap: 4px; overflow-y: auto; scrollbar-width: thin; }
.floating-workflow-mode .rail-action { flex-shrink: 0; min-height: 64px; }
.floating-workflow-mode .rail-line-control { flex-shrink: 0; margin: 0 8px 10px; padding-top: 10px; }
.floating-workflow-mode .create-popover { top: 0; left: 88px; max-height: calc(100dvh - 112px); overflow-y: auto; }
.floating-workflow-mode .canvas-area > .canvas-generation-config { top: 88px; left: 110px; width: min(360px, calc(100% - 132px)); max-height: calc(100% - 108px); overflow-y: auto; }
.floating-workflow-mode .right-panel {
  position: absolute;
  top: 88px;
  right: 16px;
  bottom: 24px;
  width: min(390px, calc(100% - 132px));
  border: 1px solid var(--line);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 6px 22px rgba(25, 42, 72, .08);
}
.floating-workflow-mode .right-panel-inner { border-radius: inherit; }
.floating-workflow-mode .right-panel-collapsed .right-panel { right: 0; width: 0; border: 0; box-shadow: none; }
.floating-workflow-mode .right-panel-toggle { left: -29px; width: 28px; border: 1px solid var(--line); border-radius: 9px; }
.floating-workflow-mode .right-panel-collapsed .right-panel-toggle { left: -40px; border-radius: 9px; }
@media (max-width: 880px) {
  .floating-workflow-mode .workflow-topbar { inset: 12px 12px auto; }
  .floating-workflow-mode .brand-block { gap: 8px; padding-left: 12px; }
  .floating-workflow-mode .brand-block > strong { font-size: 16px; }
  .floating-workflow-mode .tool-rail { left: 12px; width: 68px; top: 80px; bottom: 72px; }
  .floating-workflow-mode .rail-actions { padding: 6px; }
  .floating-workflow-mode .create-popover { left: 80px; }
  .floating-workflow-mode .canvas-area > .canvas-generation-config { top: 80px; left: 92px; width: min(360px, calc(100% - 116px)); max-height: calc(100% - 100px); }
  .floating-workflow-mode .right-panel { top: 80px; right: 12px; }
}
@media (max-height: 650px) {
  .floating-workflow-mode .rail-action { min-height: 48px; gap: 3px; }
  .floating-workflow-mode .rail-action svg { width: 20px; height: 20px; }
  .floating-workflow-mode .rail-line-control small { display: none; }
}
@media (max-width: 600px) {
  .floating-workflow-mode .brand-block > strong { display: none; }
  .floating-workflow-mode .topbar-actions .topbar-divider { margin: 0 2px; }
}

/* ---- 我的素材库弹窗 ---- */
.canvas-material-dialog .material-library-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid #eef2f7;
}
.canvas-material-dialog .material-library-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid #e3e9f2;
  border-radius: 999px;
  background: #fff;
  color: #475569;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.canvas-material-dialog .material-library-tab span {
  font-size: 12px;
  font-weight: 800;
  color: #94a3b8;
}
.canvas-material-dialog .material-library-tab.active,
.canvas-material-dialog .material-library-tab:hover {
  border-color: #2878f0;
  background: #edf5ff;
  color: #2878f0;
}
.canvas-material-dialog .material-library-tab.active span { color: #2878f0; }
.canvas-material-dialog .material-library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  max-height: 56vh;
  overflow-y: auto;
}
.canvas-material-dialog .material-library-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border: 1px solid #e3e9f2;
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  text-align: left;
}
.canvas-material-dialog .material-library-card:hover {
  border-color: #2878f0;
  box-shadow: 0 6px 18px rgba(40, 120, 240, .14);
}
.canvas-material-dialog .material-library-card img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 8px;
  background: #f1f5f9;
}
.canvas-material-dialog .material-library-card-name {
  font-size: 12px;
  font-weight: 700;
  color: #263a59;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.canvas-material-dialog .material-library-empty {
  padding: 40px 12px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
}
.canvas-material-dialog .material-library-hint {
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
}

</style>
