<template>
  <section class="ax-page pt-page">
    <header class="ax-head">
      <div>
        <h2>AI 创作伙伴</h2>
        <p>用户端顶栏「AI 伙伴」用的就是这里的设置：它叫什么、怎么说话、用哪个模型、能不能出图出视频；技能（SKILL.md）也在这里导入、试用、发布。</p>
      </div>
      <div class="ax-head-actions">
        <button type="button" class="ax-btn" :disabled="loading" @click="reloadAll"><AdminIcon name="refresh" plain />{{ loading ? '读取中…' : '刷新' }}</button>
      </div>
    </header>

    <nav class="ax-tabs" role="tablist" aria-label="AI 创作伙伴设置">
      <button type="button" role="tab" class="ax-tab" :aria-selected="tab === 'settings'" :class="{ 'is-active': tab === 'settings' }" @click="switchTab('settings')">基本设置</button>
      <button type="button" role="tab" class="ax-tab" :aria-selected="tab === 'skills'" :class="{ 'is-active': tab === 'skills' }" @click="switchTab('skills')">技能<em v-if="skills.length" class="ax-tab-count">{{ skills.length }}</em></button>
      <button type="button" role="tab" class="ax-tab" :aria-selected="tab === 'logs'" :class="{ 'is-active': tab === 'logs' }" @click="switchTab('logs')">调用记录</button>
    </nav>

    <div v-if="loadError" class="ax-note is-bad pt-note" role="alert"><span>{{ loadError }}</span><button type="button" class="ax-btn is-sm" @click="reloadAll">重新加载</button></div>

    <!-- ========== 基本设置 ========== -->
    <template v-if="tab === 'settings'">
      <div v-if="loading && !form" class="ax-card"><div class="ax-empty is-compact" aria-live="polite"><strong>正在读取设置…</strong></div></div>
      <template v-else-if="form">
        <section class="ax-card pt-hero" :class="`is-${status.tone}`">
          <AdminIcon :name="status.tone === 'ok' ? 'check' : status.tone === 'error' ? 'alert' : 'partner'" :tint="status.tone === 'warn' || status.tone === 'muted' ? '#8e8e93' : status.tone === 'error' ? '#ff3b30' : ''" size="lg" />
          <div class="ax-row-main pt-hero-text">
            <strong>{{ status.title }}</strong>
            <small>{{ status.text }}</small>
          </div>
          <div class="pt-hero-actions">
            <label class="pt-enable">
              <span class="ax-switch"><input v-model="form.enabled" type="checkbox" aria-label="开启 AI 伙伴"><i></i></span>
              <span>{{ form.enabled ? '已开启' : '已关闭' }}</span>
            </label>
            <button type="button" class="ax-btn is-primary" :disabled="testing || !models.text.length" @click="runConnectionTest"><AdminIcon name="plug" plain />{{ testing ? '测试中…' : '测试连接' }}</button>
          </div>
        </section>
        <div v-if="testResult" class="ax-note" :class="testResult.ok ? 'is-ok' : 'is-bad'" role="status">
          <span><b>{{ testResult.ok ? '连接成功' : '连接失败' }}</b> · {{ testResult.detail }}<template v-if="testResult.reply"><br>AI 回复：「{{ testResult.reply }}」</template></span>
        </div>

        <div class="pt-layout">
          <!-- 左：用户看到的样子（示意），名字 / 头像 / 开场白 / 快捷说法改了这里马上变 -->
          <aside class="ax-card pt-preview">
            <div class="pt-preview-head"><strong>用户看到的样子</strong><small>示意，改了马上变</small></div>
            <div class="pt-phone">
              <div class="pt-agent">
                <span class="pt-avatar">
                  <img v-if="form.avatar" :src="form.avatar" alt="头像预览">
                  <svg v-else class="pt-avatar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 15.5 8.5M14 5l1.2-2.2L16.4 5l2.2 1.2-2.2 1.2-1.2 2.2L14 7.4l-2.2-1.2zM19 11.5l.7-1.3.7 1.3 1.3.7-1.3.7-.7 1.3-.7-1.3-1.3-.7z" /></svg>
                </span>
                <span class="ax-row-main"><strong>{{ form.name || '小艺' }}</strong><small>{{ form.enabled ? 'AI 伙伴 · 在线' : 'AI 伙伴 · 已关闭' }}</small></span>
              </div>
              <p class="pt-bubble" :class="{ 'is-empty': !form.greeting }">{{ form.greeting || '（还没写开场白）' }}</p>
              <div v-if="quickText.trim()" class="pt-quick">
                <span v-for="(line, index) in quickText.split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 6)" :key="index">{{ line }}</span>
              </div>
            </div>
            <div class="pt-avatar-ops">
              <input ref="avatarInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="onAvatarFile">
              <button type="button" class="ax-btn is-sm is-soft" @click="avatarInput?.click()"><AdminIcon name="upload" plain />上传头像</button>
              <button v-if="form.avatar" type="button" class="ax-btn is-sm is-ghost" @click="form.avatar = ''">用默认</button>
            </div>
          </aside>

          <div class="pt-main">
            <section class="ax-card">
              <div class="ax-card-head"><div><h3>形象与说话方式</h3><p>名字和开场白用户一进来就能看到；「说话风格」只给 AI 看，用来决定它怎么聊天。</p></div></div>
              <div class="ax-form">
                <label class="ax-field">
                  <span>名字</span>
                  <input v-model.trim="form.name" type="text" maxlength="16" placeholder="例如：小艺">
                </label>
                <label class="ax-field">
                  <span>开场白</span>
                  <input v-model="form.greeting" type="text" maxlength="200">
                </label>
                <label class="ax-field pt-wide">
                  <span>说话风格（人设）</span>
                  <textarea v-model="form.persona" rows="3" maxlength="2000" placeholder="例如：说话亲切、有耐心，会真诚地夸奖对方作品里的亮点。" />
                </label>
                <label class="ax-field">
                  <span>快捷说法</span>
                  <textarea v-model="quickText" rows="4" placeholder="帮我画一只会飞的小猫" />
                  <small>每行一条，最多 6 条。</small>
                </label>
                <label class="ax-field">
                  <span>碰到不合适的话题时怎么回</span>
                  <textarea v-model="form.blockedReply" rows="4" maxlength="200" />
                </label>
              </div>
            </section>

            <section class="ax-card">
              <div class="ax-card-head"><div><h3>模型</h3><p>下拉框里只列出「API 配置」里已经填好密钥、并且启用了的模型。选「自动」就跟着「API 配置」里的默认模型走；选中的模型出问题时，会自动换下一个能用的。</p></div></div>
              <p v-if="!models.text.length" class="ax-note is-warn pt-card-note"><span>「API 配置」里还没有能用的文字模型，AI 伙伴现在没法回答。先去填好文字模型的密钥，回来点「刷新」。</span></p>
              <div class="ax-form">
                <label class="ax-field">
                  <span>聊天用的模型</span>
                  <select v-model="textModelValue">
                    <option value="">自动</option>
                    <option v-if="textModelMissing" :value="textModelValue">{{ form.provider }} · {{ form.model }}（已不可用）</option>
                    <option v-for="item in models.text" :key="optionKey(item)" :value="optionKey(item)">{{ item.label }}</option>
                  </select>
                </label>
                <label class="ax-field">
                  <span>出图用的模型</span>
                  <select v-model="imageModelValue">
                    <option value="">自动</option>
                    <option v-if="imageModelMissing" :value="imageModelValue">{{ form.imageProvider }} · {{ form.imageModel }}（已不可用）</option>
                    <option v-for="item in models.image" :key="optionKey(item)" :value="optionKey(item)">{{ item.label }}</option>
                  </select>
                </label>
              </div>
              <div class="pt-rows">
                <div class="pt-row">
                  <AdminIcon name="video" size="sm" />
                  <span class="ax-row-main"><strong>视频</strong><small>{{ models.video[0]?.label || '没有可用的视频模型（在「API 配置」里配置后自动启用）' }}</small></span>
                </div>
                <label class="pt-row">
                  <AdminIcon name="eye" size="sm" />
                  <span class="ax-row-main"><strong>能看图</strong><small>用户上传图片时一起发给模型。只有支持看图的模型才能打开，不支持的模型会报错。</small></span>
                  <span class="ax-switch"><input v-model="form.vision" type="checkbox" aria-label="能看图"><i></i></span>
                </label>
              </div>
            </section>

            <section class="ax-card">
              <div class="ax-card-head"><div><h3>能做的事</h3><p>关掉的能力 AI 就不会用。「出图」「出视频」和平台其他页面一样按「AI 用量与计费」扣积分（管理员、讲师不扣）。</p></div></div>
              <div class="pt-tools">
                <label v-for="key in toolKeys" :key="key" class="pt-tool" :class="{ 'is-on': form.tools[key] }">
                  <span class="ax-row-main"><strong>{{ toolLabels[key] || key }}</strong><small>{{ TOOL_HINTS[key] || '' }}</small></span>
                  <span class="ax-switch"><input v-model="form.tools[key]" type="checkbox" :aria-label="toolLabels[key] || key"><i></i></span>
                </label>
              </div>
            </section>

            <section class="ax-card">
              <div class="ax-card-head"><div><h3>用量与计费</h3><p>防止一个账号一天聊太多、一轮出太多图。管理员和讲师不受每日条数限制，也不扣积分。</p></div></div>
              <div class="ax-form is-3col">
                <label class="ax-field">
                  <span>每人每天最多聊几条</span>
                  <input v-model.number="form.dailyMessageLimit" type="number" min="0" max="1000" step="1">
                  <small>0 = 不限</small>
                </label>
                <label class="ax-field">
                  <span>一次回答最多出几张图</span>
                  <input v-model.number="form.maxImagesPerTurn" type="number" min="0" max="4" step="1">
                  <small>0–4</small>
                </label>
                <label class="ax-field">
                  <span>一次回答最多出几个视频</span>
                  <input v-model.number="form.maxVideosPerTurn" type="number" min="0" max="2" step="1">
                  <small>0–2</small>
                </label>
              </div>
              <div class="pt-rows">
                <label class="pt-row">
                  <AdminIcon name="coins" size="sm" />
                  <span class="ax-row-main"><strong>聊天也扣积分</strong><small>按「AI 文字」的价格，每条一次</small></span>
                  <span class="ax-switch"><input v-model="form.billing.chargeTurns" type="checkbox" aria-label="聊天也扣积分"><i></i></span>
                </label>
                <label class="pt-row">
                  <AdminIcon name="image" size="sm" />
                  <span class="ax-row-main"><strong>出图扣积分</strong></span>
                  <span class="ax-switch"><input v-model="form.billing.chargeImages" type="checkbox" aria-label="出图扣积分"><i></i></span>
                </label>
                <label class="pt-row">
                  <AdminIcon name="video" size="sm" />
                  <span class="ax-row-main"><strong>出视频扣积分</strong></span>
                  <span class="ax-switch"><input v-model="form.billing.chargeVideos" type="checkbox" aria-label="出视频扣积分"><i></i></span>
                </label>
              </div>
            </section>

            <details class="ax-card pt-advanced">
              <summary><span>高级设置<small>一般不用改</small></span><AdminIcon name="chevron" plain class="pt-advanced-icon" /></summary>
              <div class="ax-form">
                <label class="ax-field">
                  <span>发挥程度：{{ Number(form.temperature).toFixed(1) }}</span>
                  <input v-model.number="form.temperature" class="pt-range" type="range" min="0" max="1.5" step="0.1">
                  <small>越大越天马行空。</small>
                </label>
                <label class="ax-field">
                  <span>一次回答最多几步</span>
                  <input v-model.number="form.maxSteps" type="number" min="1" max="10" step="1">
                  <small>读技能、出图、排版各算一步，1–10。</small>
                </label>
                <label class="ax-field">
                  <span>记住最近几轮对话</span>
                  <input v-model.number="form.historyTurns" type="number" min="0" max="20" step="1">
                  <small>0–20。</small>
                </label>
                <label class="ax-field">
                  <span>一次回答最长</span>
                  <input v-model.number="form.maxReplyTokens" type="number" min="200" max="4000" step="100">
                  <small>200–4000，单位约等于字。</small>
                </label>
              </div>
            </details>
          </div>
        </div>

        <div class="ax-savebar">
          <span class="ax-hint">{{ dirty ? '有改动还没保存，用户端仍按旧设置。' : savedText }}</span>
          <span class="pt-savebar-actions">
            <button type="button" class="ax-btn is-ghost" :disabled="saving || !dirty" @click="discardChanges"><AdminIcon name="undo" plain />撤销改动</button>
            <button type="button" class="ax-btn is-primary" :disabled="saving || !dirty" @click="saveConfig">{{ saving ? '保存中…' : '保存并生效' }}</button>
          </span>
        </div>
      </template>
    </template>

    <!-- ========== 技能 ========== -->
    <template v-else-if="tab === 'skills'">
      <section class="ax-card is-flush">
        <div class="ax-card-head pt-flush-head">
          <div>
            <h3>技能</h3>
            <p>一个技能 = 一份 SKILL.md：头部写 name（英文名）和 description（一句话说明什么时候用），正文写步骤。导入后先是<b>草稿</b>，用户看不到；点「试用」确认效果，再点「发布」。AI 会按 description 自己判断什么时候用，用户也能在 AI 伙伴里直接点选。</p>
          </div>
          <div class="pt-head-tools">
            <button type="button" class="ax-btn is-sm" @click="downloadTemplate"><AdminIcon name="download" plain />示例模板</button>
            <input ref="importInput" type="file" accept=".md,.markdown,.txt,.zip" multiple hidden @change="onImportFiles">
            <button type="button" class="ax-btn is-sm is-primary" :disabled="importing" @click="importInput?.click()"><AdminIcon name="upload" plain />{{ importing ? '导入中…' : '导入 SKILL.md / 压缩包' }}</button>
          </div>
        </div>

        <div v-if="packages.length" class="pt-package">
          <AdminIcon name="layers" size="sm" />
          <span>从「AI 玩法中心」已上传的技能包导入</span>
          <select v-model="packageId" class="ax-select" aria-label="选择技能包">
            <option value="">选择技能包…</option>
            <option v-for="item in packages" :key="item.id" :value="item.id">{{ item.title || item.fileName || item.packageKey }}</option>
          </select>
          <button type="button" class="ax-btn is-sm is-soft" :disabled="!packageId || importing" @click="importFromPackage">导入</button>
        </div>

        <div v-if="importReport" class="pt-report">
          <div class="pt-report-head">
            <strong>导入结果：成功 {{ importReport.imported.length }} 个{{ importReport.skipped.length ? `，跳过 ${importReport.skipped.length} 个` : '' }}</strong>
            <button type="button" class="ax-btn is-sm is-ghost" @click="importReport = null">知道了</button>
          </div>
          <ul>
            <li v-for="item in importReport.imported" :key="`ok-${item.id}`" class="is-ok">
              <AdminIcon name="check" plain />
              <span>{{ item.title }}（{{ item.action === 'updated' ? '已更新，上下架状态不变' : '新草稿' }}）<small v-if="item.skippedFiles?.length">忽略了 {{ item.skippedFiles.length }} 个非文本文件</small></span>
            </li>
            <li v-for="(item, index) in importReport.skipped" :key="`skip-${index}`" class="is-bad">
              <AdminIcon name="alert" plain />
              <span>{{ item.fileName }}：{{ item.reason }}</span>
            </li>
          </ul>
        </div>

        <div v-if="skillsLoading && !skills.length" class="ax-empty is-compact" aria-live="polite"><strong>正在读取技能…</strong></div>
        <div v-else-if="!skills.length" class="ax-empty"><strong>还没有技能</strong><span>点右上角「导入」，或者先下载示例模板照着写一份。</span></div>
        <ul v-else class="pt-skills">
          <li v-for="skill in skills" :key="skill.id" class="pt-skill" :class="`is-${skill.status}`">
            <span class="pt-skill-icon" :style="{ '--skill-color': skill.color || '#7c6cf0' }">
              <img v-if="skill.coverUrl" :src="skill.coverUrl" alt="">
              <b v-else-if="skill.icon">{{ skill.icon }}</b>
              <AdminIcon v-else name="sparkles" plain />
            </span>
            <div class="pt-skill-main">
              <div class="pt-skill-title">
                <strong>{{ skill.title }}</strong>
                <span class="ax-pill" :class="skill.status === 'published' ? 'is-ok' : skill.status === 'draft' ? 'is-warn' : 'is-muted'">{{ STATUS_LABELS[skill.status] || skill.status }}</span>
                <span class="ax-tag">{{ SOURCE_LABELS[skill.source] || '上传' }}</span>
              </div>
              <p>{{ skill.description }}</p>
              <small>用过 {{ skill.useCount || 0 }} 次 · 更新于 {{ formatTime(skill.updatedAt) }}{{ skill.resourceNames?.length ? ` · 参考文件 ${skill.resourceNames.length} 个` : '' }}</small>
            </div>
            <div class="pt-skill-actions">
              <button type="button" class="ax-btn is-sm is-soft" @click="openTester(skill)"><AdminIcon name="send" plain />试用</button>
              <button v-if="skill.status !== 'published'" type="button" class="ax-btn is-sm is-primary" :disabled="busySkillId === skill.id" @click="setSkillStatus(skill, 'published')">发布</button>
              <button v-else type="button" class="ax-btn is-sm" :disabled="busySkillId === skill.id" @click="setSkillStatus(skill, 'disabled')">下架</button>
              <button type="button" class="ax-btn is-sm" @click="openEditor(skill)">编辑</button>
              <a class="pt-icon-btn" :href="exportUrl(skill)" :download="`${skill.slug}-SKILL.md`" title="导出 SKILL.md" aria-label="导出 SKILL.md"><AdminIcon name="download" plain /></a>
              <button type="button" class="pt-icon-btn is-danger" :disabled="busySkillId === skill.id" title="删除" aria-label="删除" @click="removeSkill(skill)"><AdminIcon name="trash" plain /></button>
            </div>
          </li>
        </ul>
      </section>
    </template>

    <!-- ========== 调用记录 ========== -->
    <template v-else>
      <section class="ax-card is-flush">
        <div class="ax-card-head pt-flush-head">
          <div>
            <h3>调用记录</h3>
            <p>每回答一次记一行，<b>只记模型、耗时、用了哪些能力和结果，不记用户原话</b>。用户说「它没反应」时先看这里：是模型报错、没配密钥，还是余额不足。</p>
          </div>
          <div class="pt-head-tools">
            <div class="ax-seg" role="group" aria-label="按结果筛选">
              <button v-for="option in [{ value: 'all', label: '全部' }, { value: 'ok', label: '成功' }, { value: 'error', label: '失败' }]" :key="option.value" type="button" :class="{ 'is-active': logStatus === option.value }" :aria-pressed="logStatus === option.value" @click="logStatus = option.value; loadLogs()">{{ option.label }}</button>
            </div>
            <button type="button" class="ax-btn is-sm" :disabled="logsLoading" @click="loadLogs"><AdminIcon name="refresh" plain />{{ logsLoading ? '读取中…' : '刷新' }}</button>
          </div>
        </div>
        <div v-if="logsLoading && !logs.length" class="ax-empty is-compact" aria-live="polite"><strong>正在读取…</strong></div>
        <div v-else-if="!logs.length" class="ax-empty"><strong>{{ logStatus === 'error' ? '没有失败的记录' : '还没有调用记录' }}</strong><span>用户和 AI 伙伴聊一句，这里就会多一行。</span></div>
        <div v-else class="ax-table-wrap">
          <table class="ax-table pt-log-table">
            <thead>
              <tr><th>时间</th><th>结果</th><th>模型</th><th class="is-right">耗时</th><th>内容</th></tr>
            </thead>
            <tbody>
              <tr v-for="log in logs" :key="log.id">
                <td class="is-nowrap is-num">{{ formatTime(log.at) }}</td>
                <td><span class="ax-pill" :class="log.status === 'error' ? 'is-bad' : 'is-ok'">{{ log.status === 'error' ? '失败' : '成功' }}</span></td>
                <td class="pt-log-model">{{ log.provider ? `${log.provider} · ${log.model}` : '—' }}</td>
                <td class="is-right is-num">{{ (Number(log.durationMs || 0) / 1000).toFixed(1) }} 秒</td>
                <td>
                  <span class="pt-log-summary">{{ log.summary }}</span>
                  <small v-if="log.error" class="pt-log-error">{{ log.error }}</small>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <!-- 编辑技能 -->
    <el-dialog v-model="editor.open" class="ax-dialog" :title="editor.id ? `编辑技能：${editor.title || ''}` : '编辑技能'" width="min(760px, 94vw)" align-center append-to-body destroy-on-close>
      <div v-if="editor.loading" class="ax-empty is-compact" aria-live="polite"><strong>正在读取技能内容…</strong></div>
      <div v-else class="pt-editor">
        <div class="ax-form">
          <label class="ax-field">
            <span>名称</span>
            <input v-model.trim="editor.title" type="text" maxlength="40">
          </label>
          <label class="ax-field">
            <span>排序</span>
            <input v-model.number="editor.sortOrder" type="number" min="0" max="100000" step="10">
            <small>数字小的排前面。</small>
          </label>
        </div>
        <div class="pt-look">
          <span class="pt-skill-icon is-lg" :style="{ '--skill-color': editor.color || '#7c6cf0' }">
            <img v-if="editorCoverPreview" :src="editorCoverPreview" alt="封面预览">
            <b v-else-if="editor.icon">{{ editor.icon }}</b>
            <AdminIcon v-else name="sparkles" plain />
          </span>
          <div class="pt-look-fields">
            <label class="ax-field pt-look-icon">
              <span>图标</span>
              <input v-model.trim="editor.icon" type="text" maxlength="4" placeholder="🐼" aria-label="图标（一个表情）">
            </label>
            <label class="ax-field pt-look-color">
              <span>颜色</span>
              <input v-model="editor.color" type="color" aria-label="颜色">
            </label>
            <div class="pt-look-cover">
              <input ref="coverInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="onCoverFile">
              <button type="button" class="ax-btn is-sm is-soft" @click="coverInput?.click()"><AdminIcon name="image" plain />{{ editorCoverPreview ? '换封面' : '加封面' }}</button>
              <button v-if="editorCoverPreview" type="button" class="ax-btn is-sm is-ghost" @click="clearCover">去掉封面</button>
            </div>
          </div>
        </div>
        <label class="ax-field">
          <span>一句话说明</span>
          <input v-model="editor.description" type="text" maxlength="1024">
          <small>AI 靠这句话判断什么时候用这个技能。</small>
        </label>
        <label class="ax-field">
          <span>推荐问法</span>
          <textarea v-model="editor.starterText" rows="3" />
          <small>每行一条，最多 6 条，用户点技能后可以直接选。</small>
        </label>
        <label class="ax-field">
          <span>正文（AI 按这里的步骤做）</span>
          <textarea v-model="editor.instructions" rows="14" class="pt-mono" maxlength="60000" />
        </label>
      </div>
      <template #footer>
        <button type="button" class="ax-btn" @click="editor.open = false">取消</button>
        <button type="button" class="ax-btn is-primary" :disabled="editor.loading || editor.saving" @click="saveEditor">{{ editor.saving ? '保存中…' : '保存' }}</button>
      </template>
    </el-dialog>

    <!-- 试用 -->
    <el-drawer v-model="tester.open" class="ax-drawer" :size="drawerSize" :title="tester.skill ? `试用：${tester.skill.title}` : '试用 AI 伙伴'" append-to-body @closed="closeTester">
      <div class="pt-tester">
        <p class="ax-note is-plain pt-tester-note"><span>管理员试用不扣积分、不算每日条数。{{ tester.skill && tester.skill.status !== 'published' ? '这个技能还没发布，只有管理员能试用。' : '' }}试用的对话关掉后自动删除。</span></p>
        <div ref="chatRef" class="pt-chat">
          <div v-if="!tester.messages.length" class="pt-chat-empty">
            <span>说一句话试试：</span>
            <button v-for="prompt in testerPrompts" :key="prompt" type="button" class="pt-suggest" @click="sendTest(prompt)">{{ prompt }}</button>
          </div>
          <div v-for="message in tester.messages" :key="message.id" class="pt-msg" :class="`is-${message.role}`">
            <div class="pt-msg-bubble">
              <div v-if="message.chips.length" class="pt-msg-chips">
                <span v-for="chip in message.chips" :key="chip.key" class="pt-msg-chip" :class="`is-${chip.status}`">{{ chip.text }}</span>
              </div>
              <p v-if="message.text" class="pt-msg-text">{{ message.text }}</p>
              <div v-if="message.images.length" class="pt-msg-images">
                <a v-for="url in message.images" :key="url" :href="url" target="_blank" rel="noopener"><img :src="url" alt="生成的图片"></a>
              </div>
              <p v-for="note in message.notes" :key="note" class="pt-msg-note">{{ note }}</p>
              <p v-if="message.error" class="pt-msg-error">{{ message.error }}</p>
              <span v-if="message.pending && !message.text && !message.error" class="pt-typing"><i></i><i></i><i></i></span>
              <small v-if="message.model" class="pt-msg-model">{{ message.model }}</small>
            </div>
          </div>
        </div>
        <form class="pt-composer" @submit.prevent="sendTest()">
          <textarea v-model="tester.input" rows="2" maxlength="1200" placeholder="输入一句话，Enter 发送，Shift+Enter 换行" aria-label="试用输入" @keydown.enter.exact.prevent="sendTest()" />
          <div class="pt-composer-actions">
            <button type="button" class="ax-btn is-sm is-ghost" :disabled="tester.busy || !tester.messages.length" @click="restartTester"><AdminIcon name="undo" plain />重新开始</button>
            <button v-if="tester.busy" type="button" class="ax-btn is-sm is-danger" @click="stopTester">停止</button>
            <button v-else type="submit" class="ax-btn is-sm is-primary" :disabled="!tester.input.trim()"><AdminIcon name="send" plain />发送</button>
          </div>
        </form>
      </div>
    </el-drawer>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  adminAgentSkillExportUrl,
  deleteAdminAgentSkill,
  deleteAgentConversation,
  getAdminAgentConfig,
  getAdminAgentSkill,
  importAdminAgentSkillFromPackage,
  importAdminAgentSkills,
  listAdminAgentLogs,
  listAdminAgentSkills,
  saveAdminAgentConfig,
  streamAgentChat,
  updateAdminAgentSkill,
} from '../services/agentGateway'
import { listSkillPackages } from '../services/aiSkillPackageGateway'
import AdminIcon from './admin/AdminIcon.vue'

const STATUS_LABELS = { published: '已发布', draft: '草稿', disabled: '已下架' }
const SOURCE_LABELS = { builtin: '内置', upload: '上传', package: '技能包' }
const TOOL_HINTS = {
  generate_image: '按对话内容出图，按张扣积分',
  generate_video: '先出首帧再生成短视频，耗时较长，按次扣积分',
  compose_page: '把文字和配图排成详情页、海报版面',
  find_workflow: '推荐「AI 玩法中心」里已发布的玩法',
  search_prompt_library: '从提示词库里找现成的说法',
  list_courses: '推荐能看的课程',
  list_my_works: '查看当前账号自己的作品（看不到别人的）',
  suggest_tool: '给出去绘画、画板、视频等页面的按钮',
}
const TEST_MESSAGE = '你好！请用一句话介绍你自己。'
const SKILL_TEMPLATE = `---
name: animal-storybook
description: 当对方想把喜欢的动物画成一页绘本、或者想编一个动物小故事时使用。
metadata:
  title: 动物绘本小作家
  icon: 🐼
  color: "#7c6cf0"
  max_images: 2
---

# 动物绘本小作家

## 什么时候用
- 对方说想画某种动物、想做绘本、想编一个小故事

## 步骤
1. 用一句话问清楚：画什么动物？它在做什么？在哪里？（对方已经说清楚就跳过这一步）
2. 调用「生成图片」出 1 张图，比例 4:3，画风写：温暖的儿童绘本、柔和水彩、干净的背景
3. 给这张图配 1～2 句适合 6～16 岁小朋友读的故事
4. 最后问对方：要不要接着画下一页？

## 注意
- 语言亲切、简单，不用生僻字
- 不画恐怖、暴力或让人不舒服的内容
`

const tab = ref('settings')
const loading = ref(false)
const loadError = ref('')

/* ---------- 基本设置 ---------- */
const form = ref(null)
const quickText = ref('')
const snapshot = ref('')
const savedAt = ref('')
const saving = ref(false)
const models = ref({ text: [], image: [], video: [] })
const toolLabels = ref({})
const avatarInput = ref(null)
const testing = ref(false)
const testResult = ref(null)
let testController = null

const toolKeys = computed(() => Object.keys(form.value?.tools || {}))
const dirty = computed(() => Boolean(form.value) && serializeForm() !== snapshot.value)
const savedText = computed(() => (savedAt.value ? `已保存 · ${formatTime(savedAt.value)}` : '已保存'))

function serializeForm() {
  return JSON.stringify({ form: form.value, quick: quickText.value })
}

function optionKey(item) {
  return item?.provider && item?.model ? `${item.provider}::${item.model}` : ''
}

function splitKey(value) {
  const text = String(value || '')
  const index = text.indexOf('::')
  return index > 0 ? [text.slice(0, index), text.slice(index + 2)] : ['', '']
}

const textModelValue = computed({
  get: () => optionKey({ provider: form.value?.provider, model: form.value?.model }),
  set: (value) => {
    const [provider, model] = splitKey(value)
    form.value.provider = provider
    form.value.model = model
  },
})
const imageModelValue = computed({
  get: () => optionKey({ provider: form.value?.imageProvider, model: form.value?.imageModel }),
  set: (value) => {
    const [provider, model] = splitKey(value)
    form.value.imageProvider = provider
    form.value.imageModel = model
  },
})
const textModelMissing = computed(() => Boolean(textModelValue.value) && !models.value.text.some((item) => optionKey(item) === textModelValue.value))
const imageModelMissing = computed(() => Boolean(imageModelValue.value) && !models.value.image.some((item) => optionKey(item) === imageModelValue.value))

function labelFor(list, value, fallback) {
  if (!value) return fallback
  return list.find((item) => optionKey(item) === value)?.label || `${value.replace('::', ' · ')}（已不可用，会自动换用其他模型）`
}

const status = computed(() => {
  const config = form.value
  if (!config) return { tone: 'muted', title: '', text: '' }
  if (!models.value.text.length) {
    return { tone: 'error', title: '还不能用', text: '「API 配置」里没有能用的文字模型（需要填好密钥并启用）。用户现在发消息会失败。' }
  }
  if (!config.enabled) {
    return { tone: 'warn', title: '已关闭', text: '用户打开 AI 伙伴会看到「暂时没有开放」。打开右边的开关并保存即可恢复。' }
  }
  const text = labelFor(models.value.text, textModelValue.value, '自动（跟随「API 配置」里的默认文字模型）')
  const image = config.tools.generate_image && config.maxImagesPerTurn > 0
    ? labelFor(models.value.image, imageModelValue.value, models.value.image.length ? '自动' : '没有可用的出图模型')
    : '已关闭'
  const video = config.tools.generate_video && config.maxVideosPerTurn > 0 ? (models.value.video[0]?.label || '没有可用的视频模型') : '已关闭'
  return { tone: 'ok', title: '可以使用', text: `聊天：${text}；出图：${image}；视频：${video}。点「测试连接」可以真的问它一句，确认能连上。` }
})

function applyConfig(config) {
  form.value = JSON.parse(JSON.stringify(config))
  quickText.value = (config.quickPrompts || []).join('\n')
  snapshot.value = serializeForm()
  savedAt.value = config.updatedAt || ''
}

async function loadConfig() {
  const data = await getAdminAgentConfig()
  models.value = { text: data.models?.text || [], image: data.models?.image || [], video: data.models?.video || [] }
  toolLabels.value = data.toolLabels || {}
  applyConfig(data.config || {})
}

function discardChanges() {
  if (!form.value) return
  const previous = JSON.parse(snapshot.value)
  form.value = previous.form
  quickText.value = previous.quick
}

async function saveConfig() {
  if (!form.value || saving.value) return
  saving.value = true
  try {
    const payload = {
      ...form.value,
      quickPrompts: quickText.value.split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 6),
    }
    applyConfig(await saveAdminAgentConfig(payload))
    testResult.value = null
    ElMessage.success('已保存，立即生效')
  } catch (error) {
    ElMessage.error(errorText(error, '保存失败，请稍后再试'))
  } finally {
    saving.value = false
  }
}

async function runConnectionTest() {
  if (testing.value) return
  if (dirty.value) {
    ElMessage.warning('先点「保存并生效」，再测试连接（测试用的是已保存的设置）')
    return
  }
  testing.value = true
  testResult.value = null
  testController = new AbortController()
  const started = Date.now()
  let reply = ''
  let failure = ''
  let model = ''
  let conversationId = ''
  try {
    await streamAgentChat({ message: TEST_MESSAGE }, {
      signal: testController.signal,
      onEvent(type, data) {
        if (type === 'meta') conversationId = data.conversationId || conversationId
        else if (type === 'delta') reply += data.text || ''
        else if (type === 'replace') reply = data.text || ''
        else if (type === 'error') failure = data.message || 'AI 服务返回错误'
        else if (type === 'done') {
          conversationId = data.conversationId || conversationId
          if (data.model) model = `${data.provider} · ${data.model}`
        }
      },
    })
  } catch (error) {
    failure = error.message || '连接失败'
  } finally {
    testing.value = false
    testController = null
  }
  if (conversationId) deleteAgentConversation(conversationId).catch(() => {})
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  const ok = !failure && Boolean(reply.trim())
  testResult.value = {
    ok,
    detail: ok
      ? `用时 ${seconds} 秒${model ? `，回答的是 ${model}` : ''}。`
      : (failure || '模型没有返回任何内容，请到「调用记录」里看具体原因。'),
    reply: reply.trim().slice(0, 160),
  }
}

/* ---------- 图片工具 ---------- */
function readImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片读不出来')) }
    image.src = url
  })
}

// square：裁成正方形（头像）；否则等比缩到长边 maxSide 以内（封面）
async function shrinkImage(file, { square = 0, maxSide = 0 } = {}) {
  const image = await readImage(file)
  const width = image.naturalWidth
  const height = image.naturalHeight
  if (!width || !height) throw new Error('图片尺寸无效')
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (square) {
    const side = Math.min(width, height)
    canvas.width = square
    canvas.height = square
    context.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, square, square)
  } else {
    const scale = Math.min(1, maxSide / Math.max(width, height))
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
  }
  const webp = canvas.toDataURL('image/webp', 0.88)
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.88)
}

async function onAvatarFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || !form.value) return
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
    ElMessage.warning('头像只支持 PNG / JPG / WEBP')
    return
  }
  try {
    form.value.avatar = await shrinkImage(file, { square: 192 })
  } catch {
    ElMessage.error('这张图片读不出来，换一张试试')
  }
}

/* ---------- 技能 ---------- */
const skills = ref([])
const skillsLoading = ref(false)
const busySkillId = ref('')
const importInput = ref(null)
const importing = ref(false)
const importReport = ref(null)
const packages = ref([])
const packageId = ref('')
let packagesLoaded = false

async function loadSkills() {
  skillsLoading.value = true
  try {
    skills.value = await listAdminAgentSkills()
  } finally {
    skillsLoading.value = false
  }
}

async function loadPackages() {
  if (packagesLoaded) return
  try {
    const list = await listSkillPackages({})
    packages.value = (Array.isArray(list) ? list : []).filter((item) => item?.id)
    packagesLoaded = true
  } catch {
    packages.value = []
  }
}

function exportUrl(skill) {
  return adminAgentSkillExportUrl(skill.id)
}

function downloadTemplate() {
  const blob = new Blob([SKILL_TEMPLATE], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'SKILL-示例.md'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '')
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

async function onImportFiles(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (!files.length || importing.value) return
  const items = []
  const skipped = []
  for (const file of files.slice(0, 20)) {
    try {
      if (/\.zip$/i.test(file.name)) {
        if (file.size > 20 * 1024 * 1024) skipped.push({ fileName: file.name, reason: '压缩包超过 20MB' })
        else items.push({ fileName: file.name, zipBase64: await fileToBase64(file) })
      } else if (/\.(md|markdown|txt)$/i.test(file.name)) {
        if (file.size > 2 * 1024 * 1024) skipped.push({ fileName: file.name, reason: '文件超过 2MB，不像是一份 SKILL.md' })
        else items.push({ fileName: file.name, text: await file.text() })
      } else {
        skipped.push({ fileName: file.name, reason: '只支持 .md 文件或 .zip 压缩包' })
      }
    } catch {
      skipped.push({ fileName: file.name, reason: '文件读取失败' })
    }
  }
  if (files.length > 20) skipped.push({ fileName: `另外 ${files.length - 20} 个文件`, reason: '一次最多导入 20 个，请分批导入' })
  if (!items.length) {
    importReport.value = { imported: [], skipped }
    return
  }
  importing.value = true
  try {
    const result = await importAdminAgentSkills(items)
    importReport.value = { imported: result.imported || [], skipped: [...skipped, ...(result.skipped || [])] }
    await loadSkills()
  } catch (error) {
    ElMessage.error(errorText(error, '导入失败，请稍后再试'))
  } finally {
    importing.value = false
  }
}

async function importFromPackage() {
  if (!packageId.value || importing.value) return
  importing.value = true
  try {
    const saved = await importAdminAgentSkillFromPackage(packageId.value)
    importReport.value = { imported: [saved], skipped: [] }
    packageId.value = ''
    await loadSkills()
  } catch (error) {
    const name = packages.value.find((item) => item.id === packageId.value)?.title || '技能包'
    importReport.value = { imported: [], skipped: [{ fileName: name, reason: errorText(error, '导入失败') }] }
  } finally {
    importing.value = false
  }
}

function replaceSkill(next) {
  const index = skills.value.findIndex((item) => item.id === next.id)
  if (index >= 0) skills.value.splice(index, 1, { ...skills.value[index], ...next })
}

async function setSkillStatus(skill, nextStatus) {
  busySkillId.value = skill.id
  try {
    replaceSkill(await updateAdminAgentSkill(skill.id, { status: nextStatus }))
    ElMessage.success(nextStatus === 'published' ? `「${skill.title}」已发布，用户端马上能用` : `「${skill.title}」已下架`)
  } catch (error) {
    ElMessage.error(errorText(error, '操作失败'))
  } finally {
    busySkillId.value = ''
  }
}

async function removeSkill(skill) {
  try {
    await ElMessageBox.confirm(
      `删除后用户端马上看不到「${skill.title}」。${skill.source === 'builtin' ? '内置技能删除后不会自动恢复。' : '想留个备份可以先点「导出」。'}`,
      '删除技能',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  busySkillId.value = skill.id
  try {
    await deleteAdminAgentSkill(skill.id)
    skills.value = skills.value.filter((item) => item.id !== skill.id)
    ElMessage.success('已删除')
  } catch (error) {
    ElMessage.error(errorText(error, '删除失败'))
  } finally {
    busySkillId.value = ''
  }
}

/* ---------- 编辑技能 ---------- */
const coverInput = ref(null)
const editor = reactive({
  open: false, loading: false, saving: false, id: '',
  title: '', description: '', icon: '', color: '#7c6cf0', starterText: '', sortOrder: 0, instructions: '',
  coverUrl: '', coverData: '', removeCover: false,
})
const editorCoverPreview = computed(() => (editor.removeCover ? '' : (editor.coverData || editor.coverUrl)))

async function openEditor(skill) {
  Object.assign(editor, { open: true, loading: true, saving: false, id: skill.id, title: skill.title, coverData: '', removeCover: false })
  try {
    const full = await getAdminAgentSkill(skill.id)
    Object.assign(editor, {
      title: full.title || '',
      description: full.description || '',
      icon: full.icon || '',
      color: full.color || '#7c6cf0',
      starterText: (full.starterPrompts || []).join('\n'),
      sortOrder: Number(full.sortOrder) || 0,
      instructions: full.instructions || '',
      coverUrl: full.coverUrl || '',
      loading: false,
    })
  } catch (error) {
    editor.open = false
    ElMessage.error(errorText(error, '读取技能失败'))
  }
}

async function onCoverFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
    ElMessage.warning('封面只支持 PNG / JPG / WEBP')
    return
  }
  try {
    editor.coverData = await shrinkImage(file, { maxSide: 960 })
    editor.removeCover = false
  } catch {
    ElMessage.error('这张图片读不出来，换一张试试')
  }
}

function clearCover() {
  editor.coverData = ''
  editor.removeCover = true
}

async function saveEditor() {
  if (editor.saving) return
  if (!editor.title.trim() || !editor.description.trim() || !editor.instructions.trim()) {
    ElMessage.warning('名称、一句话说明和正文都不能空')
    return
  }
  editor.saving = true
  try {
    const patch = {
      title: editor.title,
      description: editor.description,
      icon: editor.icon,
      color: editor.color,
      starterPrompts: editor.starterText.split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 6),
      sortOrder: editor.sortOrder,
      instructions: editor.instructions,
    }
    if (editor.coverData) patch.coverData = editor.coverData
    else if (editor.removeCover) patch.coverUrl = ''
    replaceSkill(await updateAdminAgentSkill(editor.id, patch))
    editor.open = false
    ElMessage.success('已保存')
  } catch (error) {
    ElMessage.error(errorText(error, '保存失败'))
  } finally {
    editor.saving = false
  }
}

/* ---------- 试用 ---------- */
const chatRef = ref(null)
const viewportWidth = ref(typeof window === 'undefined' ? 1280 : window.innerWidth)
const drawerSize = computed(() => (viewportWidth.value < 640 ? '100%' : '520px'))
const tester = reactive({ open: false, skill: null, messages: [], input: '', busy: false, conversationId: '' })
const testerConversations = new Set()
const testerPrompts = computed(() => {
  const list = tester.skill?.starterPrompts?.length ? tester.skill.starterPrompts : (form.value?.quickPrompts || [])
  return list.slice(0, 4)
})
let testerController = null
let messageSeq = 0

function onResize() {
  viewportWidth.value = window.innerWidth
}

function openTester(skill) {
  Object.assign(tester, { open: true, skill, messages: [], input: '', busy: false, conversationId: '' })
}

function scrollChat() {
  nextTick(() => {
    const element = chatRef.value
    if (element) element.scrollTop = element.scrollHeight
  })
}

function upsertChip(message, key, text, chipStatus = 'done') {
  const chip = message.chips.find((item) => item.key === key)
  if (chip) Object.assign(chip, { text, status: chipStatus })
  else message.chips.push({ key, text, status: chipStatus })
}

async function sendTest(preset) {
  const text = String(preset ?? tester.input).trim()
  if (!text || tester.busy) return
  tester.input = ''
  tester.messages.push({ id: ++messageSeq, role: 'user', text, chips: [], images: [], notes: [], error: '', model: '', pending: false })
  tester.messages.push({ id: ++messageSeq, role: 'assistant', text: '', chips: [], images: [], notes: [], error: '', model: '', pending: true })
  // 必须拿 reactive 数组里的那一份（代理对象）来改，界面才会跟着刷新
  const reply = tester.messages[tester.messages.length - 1]
  tester.busy = true
  testerController = new AbortController()
  scrollChat()
  const skill = tester.skill
  try {
    await streamAgentChat({
      message: text,
      conversationId: tester.conversationId || undefined,
      skill: skill?.slug || undefined,
      testDraft: Boolean(skill && skill.status !== 'published'),
    }, {
      signal: testerController.signal,
      onEvent(type, data) {
        if (type === 'meta' && data.conversationId) {
          tester.conversationId = data.conversationId
          testerConversations.add(data.conversationId)
        } else if (type === 'delta') reply.text += data.text || ''
        else if (type === 'replace') reply.text = data.text || ''
        else if (type === 'skill') upsertChip(reply, `skill-${data.slug}`, `技能：${data.title}`)
        else if (type === 'tool') upsertChip(reply, `tool-${data.id}`, `${data.label}${data.status === 'running' ? '…' : data.summary ? `：${data.summary}` : ''}`, data.status === 'error' ? 'error' : data.status === 'running' ? 'running' : 'done')
        else if (type === 'image' && data.url) reply.images.push(data.url)
        else if (type === 'video') reply.notes.push('已提交一个视频任务（用户端会自动等它生成好再播放）')
        else if (type === 'layout') reply.notes.push('已排好一份版面（用户端可以导出长图）')
        else if (type === 'action' && data.label) reply.notes.push(`给用户的按钮：${data.label}`)
        else if (type === 'notice' && data.message) reply.notes.push(data.message)
        else if (type === 'error') reply.error = data.message || 'AI 服务返回错误'
        else if (type === 'done' && data.model) reply.model = `${data.provider} · ${data.model}`
        scrollChat()
      },
    })
  } catch (error) {
    reply.error = error.message || '发送失败'
  } finally {
    reply.pending = false
    tester.busy = false
    testerController = null
    if (!reply.text && !reply.error && !reply.images.length && !reply.notes.length) reply.notes.push('已停止')
    scrollChat()
  }
}

function stopTester() {
  testerController?.abort()
}

function cleanupConversations() {
  for (const id of testerConversations) deleteAgentConversation(id).catch(() => {})
  testerConversations.clear()
}

function restartTester() {
  stopTester()
  cleanupConversations()
  Object.assign(tester, { messages: [], input: '', conversationId: '' })
}

function closeTester() {
  stopTester()
  cleanupConversations()
  Object.assign(tester, { skill: null, messages: [], input: '', busy: false, conversationId: '' })
}

/* ---------- 调用记录 ---------- */
const logs = ref([])
const logsLoading = ref(false)
const logStatus = ref('all')
let logsLoaded = false

async function loadLogs() {
  logsLoading.value = true
  try {
    logs.value = await listAdminAgentLogs(logStatus.value)
    logsLoaded = true
  } catch (error) {
    ElMessage.error(errorText(error, '读取调用记录失败'))
  } finally {
    logsLoading.value = false
  }
}

/* ---------- 通用 ---------- */
function errorText(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getMonth() + 1}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function switchTab(next) {
  tab.value = next
  if (next === 'skills') loadPackages()
  if (next === 'logs' && !logsLoaded) loadLogs()
}

async function reloadAll() {
  if (loading.value) return
  if (dirty.value) {
    try {
      await ElMessageBox.confirm('基本设置里有改动还没保存，刷新会丢掉这些改动。', '刷新', { type: 'warning', confirmButtonText: '丢掉并刷新', cancelButtonText: '取消' })
    } catch {
      return
    }
  }
  loading.value = true
  loadError.value = ''
  try {
    await Promise.all([loadConfig(), loadSkills()])
    if (tab.value === 'logs') await loadLogs()
  } catch (error) {
    loadError.value = errorText(error, '读取失败，请稍后再试')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  window.addEventListener('resize', onResize)
  reloadAll()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  testController?.abort()
  stopTester()
  cleanupConversations()
})
</script>

<style scoped>
/* AI 创作伙伴（2026-11-26 第二版）：状态横幅 + 左侧实时预览 + 右侧设置卡片；技能列表、调用记录表；组件类名一律 pt- 前缀 */
.pt-note { align-items: center; }
.pt-note > span { flex: 1 1 auto; }

.pt-hero { display: flex; align-items: center; gap: 16px; padding: 18px 22px; }
.pt-hero-text { flex: 1 1 auto; }
.pt-hero-text > strong { font-size: 16px; }
.pt-hero-text > small { line-height: 1.55; white-space: normal; }
.pt-hero.is-ok { box-shadow: inset 0 0 0 1px rgba(52, 199, 89, 0.25), var(--ax-shadow); }
.pt-hero.is-error { box-shadow: inset 0 0 0 1px rgba(255, 59, 48, 0.25), var(--ax-shadow); }
.pt-hero.is-error .pt-hero-text > strong { color: var(--ax-bad); }
.pt-hero-actions { display: flex; flex: none; align-items: center; gap: 14px; }
.pt-enable { display: inline-flex; align-items: center; gap: 10px; color: var(--ax-ink); font-size: 14px; font-weight: 600; cursor: pointer; }

.pt-layout { display: grid; grid-template-columns: 300px minmax(0, 1fr); align-items: start; gap: 16px; }
.pt-main { display: grid; gap: 16px; min-width: 0; }
.pt-main > .ax-card > .ax-form { margin-top: 2px; }
.pt-wide { grid-column: 1 / -1; }
.pt-card-note { margin: -4px 0 14px; }

/* 预览卡：像手机里的一屏聊天 */
.pt-preview { position: sticky; top: 92px; display: grid; gap: 14px; }
.pt-preview-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.pt-preview-head > strong { color: var(--ax-ink); font-size: 15px; }
.pt-preview-head > small { color: var(--ax-muted); font-size: 12px; }
.pt-phone { display: grid; gap: 12px; padding: 16px; border-radius: 22px; background: linear-gradient(160deg, #eef4ff, #f7f0fb 55%, #eefaf4); box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.06); }
.pt-agent { display: flex; align-items: center; gap: 10px; }
.pt-avatar { display: grid; flex: none; overflow: hidden; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, #5e5ce6, #bf5af2); box-shadow: 0 4px 12px rgba(94, 92, 230, 0.25); }
.pt-avatar > img { width: 100%; height: 100%; object-fit: cover; }
.pt-avatar-icon { width: 22px; height: 22px; fill: none; stroke: #fff; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.pt-bubble { justify-self: start; max-width: 92%; margin: 0; padding: 10px 14px; border-radius: 18px 18px 18px 6px; background: #fff; box-shadow: 0 2px 8px rgba(16, 24, 40, 0.06); color: var(--ax-ink); font-size: 13.5px; line-height: 1.55; overflow-wrap: anywhere; }
.pt-bubble.is-empty { color: var(--ax-faint); }
.pt-quick { display: flex; flex-wrap: wrap; gap: 6px; }
.pt-quick > span { padding: 5px 10px; border-radius: 999px; background: rgba(255, 255, 255, 0.85); color: var(--ax-brand); font-size: 12px; font-weight: 600; }
.pt-avatar-ops { display: flex; flex-wrap: wrap; gap: 8px; }

/* 行式开关（能看图 / 计费 / 能力） */
.pt-rows { display: grid; margin-top: 16px; border-top: 1px solid var(--ax-line); }
.pt-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--ax-line); }
.pt-row:last-child { border-bottom: 0; padding-bottom: 0; }
.pt-row > .ax-row-main { flex: 1 1 auto; }
.pt-row > .ax-row-main > small { white-space: normal; }
label.pt-row { cursor: pointer; }
.pt-tools { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.pt-tool { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; background: var(--ax-surface-2); cursor: pointer; transition: background 0.15s ease; }
.pt-tool.is-on { background: rgba(var(--ax-brand-rgb), 0.06); }
.pt-tool > .ax-row-main { flex: 1 1 auto; }
.pt-tool > .ax-row-main > small { white-space: normal; }

.pt-advanced { display: grid; gap: 16px; }
.pt-advanced > summary { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--ax-ink); font-size: 16px; font-weight: 700; list-style: none; cursor: pointer; }
.pt-advanced > summary::-webkit-details-marker { display: none; }
.pt-advanced > summary small { margin-left: 8px; color: var(--ax-muted); font-size: 12.5px; font-weight: 400; }
.pt-advanced > summary:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ax-brand-ring); border-radius: 8px; }
.pt-advanced-icon { color: var(--ax-muted); transform: rotate(90deg); transition: transform 0.2s ease; }
.pt-advanced[open] .pt-advanced-icon { transform: rotate(-90deg); }
.pt-range { width: 100%; accent-color: var(--ax-brand); }
.pt-savebar-actions { display: flex; gap: 8px; }

/* 技能 */
.pt-flush-head { margin: 0; padding: 18px 22px 14px; border-bottom: 1px solid var(--ax-line); }
.pt-head-tools { display: flex; flex: none; flex-wrap: wrap; align-items: center; gap: 8px; }
.pt-package { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px 22px; border-bottom: 1px solid var(--ax-line); background: var(--ax-surface-2); color: var(--ax-text); font-size: 13px; }
.pt-package > .ax-select { min-width: 200px; }
.pt-report { display: grid; gap: 8px; margin: 14px 22px 0; padding: 12px 14px; border-radius: 14px; background: var(--ax-surface-2); }
.pt-report-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--ax-ink); font-size: 13.5px; }
.pt-report > ul { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.pt-report li { display: flex; align-items: flex-start; gap: 6px; font-size: 13px; line-height: 1.5; }
.pt-report li > .adm-icon.is-plain { flex: none; width: 15px; height: 15px; margin-top: 2px; }
.pt-report li.is-ok { color: var(--ax-ok); }
.pt-report li.is-bad { color: var(--ax-bad); }
.pt-report li small { margin-left: 6px; color: var(--ax-muted); }
.pt-skills { display: grid; margin: 0; padding: 0; list-style: none; }
.pt-skill { display: flex; align-items: center; gap: 14px; padding: 14px 22px; border-bottom: 1px solid var(--ax-line); }
.pt-skill:last-child { border-bottom: 0; }
.pt-skill.is-disabled .pt-skill-title > strong,
.pt-skill.is-disabled .pt-skill-main > p { color: var(--ax-muted); }
.pt-skill-icon { display: grid; flex: none; overflow: hidden; place-items: center; width: 46px; height: 46px; border-radius: 14px; background: color-mix(in srgb, var(--skill-color) 16%, #fff); color: var(--skill-color); }
.pt-skill-icon > img { width: 100%; height: 100%; object-fit: cover; }
.pt-skill-icon > b { font-size: 22px; line-height: 1; }
.pt-skill-icon > .adm-icon.is-plain { width: 22px; height: 22px; }
.pt-skill-icon.is-lg { width: 72px; height: 72px; border-radius: 20px; }
.pt-skill-icon.is-lg > b { font-size: 34px; }
.pt-skill-main { display: grid; flex: 1 1 auto; gap: 3px; min-width: 0; }
.pt-skill-title { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.pt-skill-title > strong { color: var(--ax-ink); font-size: 15px; font-weight: 700; }
.pt-skill-main > p { display: -webkit-box; overflow: hidden; margin: 0; color: var(--ax-text); font-size: 13px; line-height: 1.5; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.pt-skill-main > small { color: var(--ax-muted); font-size: 12px; }
.pt-skill-actions { display: flex; flex: none; align-items: center; gap: 6px; }
.pt-icon-btn { display: grid; place-items: center; width: 32px; height: 32px; min-height: 0; padding: 0; border: 0; border-radius: 10px; background: transparent; color: var(--ax-muted); text-decoration: none; cursor: pointer; transition: background 0.12s ease, color 0.12s ease; }
.pt-icon-btn:hover:not(:disabled) { background: var(--ax-fill); color: var(--ax-ink); }
.pt-icon-btn.is-danger:hover:not(:disabled) { background: var(--ax-bad-soft); color: var(--ax-bad); }
.pt-icon-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.pt-icon-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ax-brand-ring); }
.pt-icon-btn > .adm-icon.is-plain { width: 17px; height: 17px; }

/* 调用记录 */
.pt-log-model { color: var(--ax-text); white-space: nowrap; }
.pt-log-summary { display: block; color: var(--ax-ink); }
.pt-log-error { display: block; margin-top: 3px; color: var(--ax-bad); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }

/* 编辑技能弹窗 */
.pt-editor { display: grid; gap: 14px; }
.pt-look { display: flex; align-items: center; gap: 16px; padding: 14px 16px; border-radius: 16px; background: var(--ax-surface-2); }
.pt-look-fields { display: flex; flex: 1 1 auto; flex-wrap: wrap; align-items: flex-end; gap: 12px; min-width: 0; }
.pt-look-icon { width: 96px; }
.pt-look-icon > input { text-align: center; font-size: 18px !important; }
.pt-look-color { width: 72px; }
.pt-look-color > input[type='color'] { width: 100%; height: 40px; padding: 4px !important; cursor: pointer; }
.pt-look-cover { display: flex; flex-wrap: wrap; gap: 8px; padding-bottom: 2px; }
.pt-mono { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 12.5px !important; }

/* 试用抽屉 */
.pt-tester { display: flex; flex-direction: column; gap: 12px; height: 100%; min-height: 0; }
.pt-tester-note { flex: none; margin: 0; }
.pt-chat { display: flex; flex: 1 1 auto; flex-direction: column; gap: 10px; min-height: 0; padding: 4px 2px; overflow-y: auto; }
.pt-chat-empty { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--ax-muted); font-size: 13px; }
.pt-suggest { min-height: 0; padding: 7px 12px; border: 0; border-radius: 999px; background: var(--ax-brand-soft); color: var(--ax-brand); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.pt-suggest:hover { background: rgba(var(--ax-brand-rgb), 0.16); }
.pt-msg { display: flex; }
.pt-msg.is-user { justify-content: flex-end; }
.pt-msg-bubble { display: grid; gap: 6px; max-width: 86%; padding: 10px 14px; border-radius: 18px 18px 18px 6px; background: var(--ax-fill); color: var(--ax-ink); font-size: 13.5px; line-height: 1.6; }
.pt-msg.is-user .pt-msg-bubble { border-radius: 18px 18px 6px 18px; background: var(--ax-brand); color: #fff; }
.pt-msg-text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.pt-msg-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.pt-msg-chip { padding: 2px 8px; border-radius: 999px; background: rgba(255, 255, 255, 0.75); color: var(--ax-text); font-size: 11.5px; }
.pt-msg-chip.is-error { color: var(--ax-bad); }
.pt-msg-chip.is-done,
.pt-msg-chip.is-ok { color: var(--ax-ok); }
.pt-msg-images { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.pt-msg-images img { display: block; width: 100%; border-radius: 12px; }
.pt-msg-note { margin: 0; color: var(--ax-muted); font-size: 12px; }
.pt-msg-error { margin: 0; color: var(--ax-bad); font-size: 12.5px; }
.pt-msg-model { color: var(--ax-muted); font-size: 11px; }
.pt-msg.is-user .pt-msg-model { color: rgba(255, 255, 255, 0.75); }
.pt-typing { display: inline-flex; gap: 4px; padding: 4px 0; }
.pt-typing > i { width: 6px; height: 6px; border-radius: 50%; background: var(--ax-muted); animation: pt-blink 1.2s infinite ease-in-out; }
.pt-typing > i:nth-child(2) { animation-delay: 0.15s; }
.pt-typing > i:nth-child(3) { animation-delay: 0.3s; }
@keyframes pt-blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }
.pt-composer { display: grid; flex: none; gap: 8px; padding: 10px; border-radius: 18px; background: var(--ax-surface-2); }
.pt-composer > textarea { width: 100%; min-height: 56px; padding: 8px 10px; border: 0; border-radius: 12px; background: #fff; color: var(--ax-ink); font: inherit; font-size: 13.5px; resize: none; }
.pt-composer > textarea:focus { outline: none; box-shadow: 0 0 0 3px var(--ax-brand-ring); }
.pt-composer-actions { display: flex; justify-content: flex-end; gap: 8px; }

@media (max-width: 1180px) {
  .pt-layout { grid-template-columns: minmax(0, 1fr); }
  .pt-preview { position: static; grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
  .pt-preview-head { grid-column: 1 / -1; }
}
@media (max-width: 900px) {
  .pt-hero { flex-wrap: wrap; }
  .pt-hero-actions { width: 100%; justify-content: space-between; }
  .pt-tools { grid-template-columns: minmax(0, 1fr); }
  .pt-skill { flex-wrap: wrap; }
  .pt-skill-actions { width: 100%; justify-content: flex-end; }
}
@media (max-width: 640px) {
  .pt-preview { grid-template-columns: minmax(0, 1fr); }
}
</style>
