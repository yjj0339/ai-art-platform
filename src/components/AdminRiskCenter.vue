<template>
  <section class="ax-page">
    <header class="ax-head">
      <div>
        <h2>账号安全</h2>
        <p>不适合的内容会被自动拦截并记下来；多次违规的账号可以暂停 AI 或暂停登录。这里只显示本机构的账号和记录，由机构管理员统一处理。</p>
      </div>
      <div v-if="!forbidden" class="ax-head-actions">
        <button type="button" class="ax-btn" :disabled="loading" @click="refreshAll">{{ loading ? '刷新中…' : '刷新' }}</button>
        <button type="button" class="ax-btn is-primary" @click="openBan()"><AdminIcon name="plus" plain />封禁账号</button>
      </div>
    </header>

    <div v-if="forbidden" class="ax-card">
      <div class="ax-empty"><strong>这一页由机构管理员处理</strong><span>{{ forbidden }}</span></div>
    </div>

    <template v-else>
      <div class="ax-stats is-5">
        <button type="button" class="ax-stat" :class="{ 'is-warn': overview.pendingEvents }" @click="jumpEvents('pending')">
          <span>待处理记录</span><strong>{{ overview.pendingEvents }}</strong><small>近 30 天还没看过的</small>
        </button>
        <button type="button" class="ax-stat" :class="{ 'is-alert': overview.pendingCare }" @click="jumpEvents('pending', 'self_harm')">
          <span>需要关心</span><strong>{{ overview.pendingCare }}</strong><small>自伤类表达，建议讲师尽快跟进</small>
        </button>
        <div class="ax-stat">
          <span>24 小时拦截</span><strong>{{ overview.blocked24h }}</strong><small>24 小时共 {{ overview.events24h }} 条记录</small>
        </div>
        <button type="button" class="ax-stat" @click="tab = 'bans'">
          <span>封禁中的账号</span><strong>{{ overview.activeBans }}</strong><small>含自动封禁和手动封禁</small>
        </button>
        <button type="button" class="ax-stat" :class="{ 'is-warn': overview.lockedAccounts + overview.lockedNetworks }" @click="tab = 'locks'">
          <span>登录锁定</span><strong>{{ overview.lockedAccounts + overview.lockedNetworks }}</strong><small>{{ overview.lockedNetworks ? `含 ${overview.lockedNetworks} 个网络` : '密码连续输错被锁' }}</small>
        </button>
      </div>

      <nav class="ax-tabs" aria-label="账号安全分类">
        <button v-for="item in tabs" :key="item.id" type="button" class="ax-tab" :class="{ 'is-active': tab === item.id }" @click="tab = item.id">
          {{ item.label }}
          <em v-if="item.count" class="ax-tab-count" :class="{ 'is-alert': item.alert }">{{ item.count }}</em>
        </button>
      </nav>

      <!-- 风险记录 -->
      <div v-if="tab === 'events'" class="ax-card is-flush">
        <div class="ax-toolbar">
          <div class="ax-search"><input v-model.trim="eventFilter.keyword" placeholder="搜索账号、姓名或内容" @keyup.enter="loadEvents(1)" @search="loadEvents(1)" type="search" /></div>
          <select v-model="eventFilter.status" class="ax-select" @change="loadEvents(1)">
            <option value="pending">待处理</option><option value="handled">已处理</option><option value="">全部状态</option>
          </select>
          <select v-model="eventFilter.category" class="ax-select" @change="loadEvents(1)">
            <option value="">全部分类</option>
            <option v-for="(label, key) in meta.categories" :key="key" :value="key">{{ label }}</option>
          </select>
          <select v-model="eventFilter.scope" class="ax-select" @change="loadEvents(1)">
            <option value="">全部场景</option>
            <option v-for="(label, key) in meta.scopes" :key="key" :value="key">{{ label }}</option>
          </select>
          <select v-model="eventFilter.days" class="ax-select" @change="loadEvents(1)">
            <option :value="1">近 1 天</option><option :value="7">近 7 天</option><option :value="30">近 30 天</option>
          </select>
          <span class="ax-grow"></span>
          <template v-if="selectedEvents.length">
            <span class="ax-count">已选 {{ selectedEvents.length }} 条</span>
            <button type="button" class="ax-btn is-sm is-soft" @click="handleEvents(true)">标记已处理</button>
            <button type="button" class="ax-btn is-sm" @click="handleEvents(false)">重新打开</button>
          </template>
          <span v-else class="ax-count">共 {{ events.total }} 条</span>
        </div>
        <div class="ax-table-wrap">
          <table class="ax-table">
            <thead>
              <tr>
                <th class="is-check"><input type="checkbox" :checked="allEventsChecked" aria-label="全选本页" @change="toggleAllEvents($event.target.checked)" /></th>
                <th>时间</th><th>谁</th><th class="risk-col-scope">场景</th><th>命中</th><th>内容摘录（已打码）</th><th>状态</th><th class="is-right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in events.items" :key="item.id">
                <td class="is-check"><input v-model="selectedEvents" type="checkbox" :value="item.id" :aria-label="`选择 ${item.excerpt}`" /></td>
                <td class="is-nowrap">{{ formatTime(item.createdAt) }}</td>
                <td>
                  <div v-if="item.user?.id" class="ax-cell-main"><strong>{{ item.user.name || item.user.account }}</strong><small>{{ item.user.account }}</small></div>
                  <span v-else class="ax-hint">{{ item.actorLabel || item.actor || '访客' }}</span>
                </td>
                <td class="risk-col-scope"><span class="ax-tag">{{ item.scopeLabel }}</span></td>
                <td class="is-nowrap risk-hit"><span class="ax-pill" :class="actionTone(item.action)">{{ item.actionLabel }}</span> <small class="ax-hint">{{ item.categoryLabel }}</small></td>
                <td><span class="ax-ellipsis risk-excerpt" :title="item.excerpt">{{ item.excerpt || '—' }}</span></td>
                <td><span class="ax-pill" :class="item.handled ? 'is-muted' : 'is-warn'">{{ item.handled ? '已处理' : '待处理' }}</span></td>
                <td class="is-right">
                  <div class="ax-actions">
                    <button type="button" class="ax-btn is-sm" @click="handleEvents(!item.handled, [item.id])">{{ item.handled ? '重新打开' : '处理完了' }}</button>
                    <button v-if="item.user?.id && item.user.role !== 'admin'" type="button" class="ax-btn is-sm is-danger" @click="openBan(item.user, `违规内容：${item.categoryLabel}`)">封禁</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="!events.items.length" class="ax-empty"><strong>{{ eventFilter.status === 'pending' ? '没有待处理的记录' : '没有符合条件的记录' }}</strong><span>拦截、打码和需要关注的内容都会记在这里。</span></div>
        <div v-if="events.total > events.pageSize" class="ax-pager">
          <span>第 {{ events.page }} / {{ pageCount(events) }} 页</span>
          <button type="button" class="ax-btn is-sm" :disabled="events.page <= 1" @click="loadEvents(events.page - 1)">上一页</button>
          <button type="button" class="ax-btn is-sm" :disabled="events.page >= pageCount(events)" @click="loadEvents(events.page + 1)">下一页</button>
        </div>
      </div>

      <!-- 封禁名单 -->
      <div v-else-if="tab === 'bans'" class="ax-card is-flush">
        <div class="ax-toolbar">
          <div class="ax-search"><input v-model.trim="banFilter.keyword" type="search" placeholder="搜索账号或姓名" @keyup.enter="loadBans(1)" @search="loadBans(1)" /></div>
          <select v-model="banFilter.status" class="ax-select" @change="loadBans(1)">
            <option value="active">生效中</option><option value="ended">已结束</option>
          </select>
          <span class="ax-grow"></span>
          <span class="ax-count">共 {{ bans.total }} 条</span>
        </div>
        <div class="ax-table-wrap">
          <table class="ax-table">
            <thead><tr><th>账号</th><th>限制范围</th><th>来源</th><th>原因</th><th>开始</th><th>结束</th><th>状态</th><th class="is-right">操作</th></tr></thead>
            <tbody>
              <tr v-for="item in bans.items" :key="item.id">
                <td><div class="ax-cell-main"><strong>{{ item.user.name || item.user.account }}</strong><small>{{ item.user.account }}</small></div></td>
                <td><span class="ax-pill" :class="item.scope === 'all' ? 'is-bad' : 'is-warn'">{{ item.scopeLabel }}</span></td>
                <td class="is-nowrap">{{ item.sourceLabel }}<small v-if="item.createdBy" class="ax-hint"> · {{ item.createdBy }}</small></td>
                <td><span class="ax-ellipsis" :title="item.reason">{{ item.reason || '—' }}</span></td>
                <td class="is-nowrap">{{ formatTime(item.startsAt || item.createdAt) }}</td>
                <td class="is-nowrap">{{ item.permanent ? '永久' : formatTime(item.endsAt) }}</td>
                <td>
                  <span class="ax-pill" :class="item.status === 'active' ? 'is-bad' : 'is-muted'">{{ item.statusLabel }}</span>
                  <small v-if="item.liftReason" class="ax-hint ban-lift-note" :title="item.liftReason">{{ item.liftedBy ? `${item.liftedBy}：` : '' }}{{ item.liftReason }}</small>
                </td>
                <td class="is-right">
                  <button v-if="item.status === 'active'" type="button" class="ax-btn is-sm" @click="liftBan(item)">解除</button>
                  <span v-else class="ax-hint">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="!bans.items.length" class="ax-empty">
          <strong>{{ banFilter.status === 'active' ? '现在没有被封禁的账号' : '还没有结束的封禁记录' }}</strong>
          <span>违规次数达到「拦截设置」里的阈值会自动封禁，也可以在右上角手动封禁。</span>
        </div>
        <div v-if="bans.total > bans.pageSize" class="ax-pager">
          <span>第 {{ bans.page }} / {{ pageCount(bans) }} 页</span>
          <button type="button" class="ax-btn is-sm" :disabled="bans.page <= 1" @click="loadBans(bans.page - 1)">上一页</button>
          <button type="button" class="ax-btn is-sm" :disabled="bans.page >= pageCount(bans)" @click="loadBans(bans.page + 1)">下一页</button>
        </div>
      </div>

      <!-- 登录锁定 -->
      <div v-else-if="tab === 'locks'" class="ax-card is-flush">
        <div class="ax-toolbar">
          <span class="ax-hint">密码连续输错会自动锁定一段时间。确认是本人后可以提前解除，解除后马上能重新登录。</span>
          <span class="ax-grow"></span>
          <span class="ax-count">共 {{ locks.length + networkLocks.length }} 个</span>
        </div>
        <!-- 网络锁定：同一个网络（出口 IP）登录本机构失败太多，整个网络暂停登录。只显示 IP 前两段。 -->
        <div v-if="networkLocks.length" class="ax-table-wrap">
          <table class="ax-table">
            <thead><tr><th>网络</th><th>失败次数</th><th>开始出错</th><th>锁定到</th><th class="is-right">操作</th></tr></thead>
            <tbody>
              <tr v-for="item in networkLocks" :key="item.id">
                <td><div class="ax-cell-main"><strong>{{ item.ipHint || '未知网络' }}</strong><small>这个网络里所有人暂时都不能登录</small></div></td>
                <td class="is-num">{{ item.failures }} 次</td>
                <td class="is-nowrap">{{ formatTime(item.firstFailedAt) }}</td>
                <td class="is-nowrap">{{ formatTime(item.lockedUntil) }}</td>
                <td class="is-right"><button type="button" class="ax-btn is-sm" @click="clearNetworkLock(item)">解除锁定</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="ax-table-wrap">
          <table class="ax-table">
            <thead><tr><th>账号</th><th>类型</th><th>连续输错</th><th>锁定到</th><th class="is-right">操作</th></tr></thead>
            <tbody>
              <tr v-for="item in locks" :key="item.user.id">
                <td><div class="ax-cell-main"><strong>{{ item.user.name || item.user.account }}</strong><small>{{ item.user.account }}</small></div></td>
                <td>{{ roleText(item.user.role) }}</td>
                <td class="is-num">{{ item.failures }} 次</td>
                <td class="is-nowrap">{{ formatTime(item.lockedUntil) }}</td>
                <td class="is-right"><button type="button" class="ax-btn is-sm" @click="clearLock(item)">解除锁定</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="!locks.length && !networkLocks.length" class="ax-empty"><strong>没有被锁定的账号</strong><span>一切正常。</span></div>
      </div>

      <!-- 敏感词库 -->
      <div v-else-if="tab === 'words'" class="ax-card is-flush">
        <div class="ax-toolbar">
          <div class="ax-search"><input v-model.trim="wordFilter.keyword" type="search" placeholder="搜索词语" @keyup.enter="loadWords(1)" @search="loadWords(1)" /></div>
          <select v-model="wordFilter.category" class="ax-select" @change="loadWords(1)">
            <option value="">全部分类</option>
            <option v-for="(label, key) in meta.categories" :key="key" :value="key">{{ label }}（{{ words.summary.byCategory?.[key] || 0 }}）</option>
          </select>
          <select v-model="wordFilter.action" class="ax-select" @change="loadWords(1)">
            <option value="">全部处理方式</option>
            <option v-for="(label, key) in meta.actions" :key="key" :value="key">{{ label }}（{{ words.summary.byAction?.[key] || 0 }}）</option>
          </select>
          <select v-model="wordFilter.enabled" class="ax-select" @change="loadWords(1)">
            <option value="">启用和停用</option><option value="true">只看启用</option><option value="false">只看停用</option>
          </select>
          <select v-model="wordFilter.sort" class="ax-select" @change="loadWords(1)">
            <option value="">最新添加</option><option value="hits">命中最多</option>
          </select>
          <span class="ax-grow"></span>
          <a class="ax-btn is-sm" href="/api/admin/risk/words/export" target="_blank" rel="noopener">导出</a>
          <label class="ax-btn is-sm">导入 CSV<input type="file" accept=".csv,.txt,text/csv,text/plain" hidden @change="importWords" /></label>
          <button type="button" class="ax-btn is-sm is-primary" @click="openWordDialog"><AdminIcon name="plus" plain />添加词语</button>
        </div>
        <div class="ax-table-wrap">
          <table class="ax-table">
            <thead><tr><th>词语</th><th>分类</th><th>处理方式</th><th>来源</th><th class="is-right">命中</th><th>最近命中</th><th>启用</th><th class="is-right">操作</th></tr></thead>
            <tbody>
              <tr v-for="item in words.items" :key="item.id">
                <td><strong class="word-text">{{ item.word }}</strong></td>
                <td>
                  <select class="ax-select is-inline" :value="item.category" :aria-label="`${item.word} 的分类`" @change="patchWord(item, { category: $event.target.value })">
                    <option v-for="(label, key) in meta.categories" :key="key" :value="key">{{ label }}</option>
                  </select>
                </td>
                <td>
                  <select class="ax-select is-inline" :value="item.action" :aria-label="`${item.word} 的处理方式`" @change="patchWord(item, { action: $event.target.value })">
                    <option v-for="(label, key) in meta.actions" :key="key" :value="key">{{ label }}</option>
                  </select>
                </td>
                <td class="is-nowrap">{{ sourceText(item.source) }}</td>
                <td class="is-right is-num">{{ item.hitCount }}</td>
                <td class="is-nowrap">{{ item.lastHitAt ? formatTime(item.lastHitAt) : '—' }}</td>
                <td>
                  <label class="ax-switch"><input type="checkbox" :checked="item.enabled" :aria-label="`启用 ${item.word}`" @change="patchWord(item, { enabled: $event.target.checked })" /><i></i></label>
                </td>
                <td class="is-right"><button type="button" class="ax-btn is-sm is-danger" @click="deleteWord(item)">删除</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="!words.items.length" class="ax-empty"><strong>没有符合条件的词语</strong><span>可以点「添加词语」，一行一个，一次加很多个。</span></div>
        <div class="ax-pager">
          <span>共 {{ words.total }} 个 · 停用 {{ words.summary.disabled || 0 }} 个</span>
          <template v-if="words.total > words.pageSize">
            <span>第 {{ words.page }} / {{ pageCount(words) }} 页</span>
            <button type="button" class="ax-btn is-sm" :disabled="words.page <= 1" @click="loadWords(words.page - 1)">上一页</button>
            <button type="button" class="ax-btn is-sm" :disabled="words.page >= pageCount(words)" @click="loadWords(words.page + 1)">下一页</button>
          </template>
        </div>
      </div>

      <!-- 识别规则 -->
      <div v-else-if="tab === 'rules'" class="ax-card">
        <div class="ax-card-head">
          <div>
            <h3>识别规则</h3>
            <p>内置规则识别联系方式、刷屏等；自定义规则可以写「词A+词B」组合（同时出现才算）或正则。</p>
          </div>
          <button type="button" class="ax-btn is-primary is-sm" @click="openRuleDialog()"><AdminIcon name="plus" plain />新建规则</button>
        </div>
        <div class="ax-rows">
          <div v-for="item in rules" :key="item.id" class="ax-row">
            <div class="ax-row-main rule-main">
              <strong>{{ item.name }} <span class="ax-tag" :class="item.builtin ? 'is-info' : 'is-brand'">{{ item.builtin ? '内置' : kindText(item.kind) }}</span></strong>
              <small>{{ item.description || item.pattern }}</small>
              <span class="ax-tags rule-scopes">
                <span v-for="scope in item.scopes" :key="scope" class="ax-tag">{{ meta.scopes[scope] || scope }}</span>
              </span>
            </div>
            <div class="rule-side">
              <span class="ax-hint">命中 {{ item.hitCount }} 次</span>
              <select class="ax-select is-inline" :value="item.action" :aria-label="`${item.name} 的处理方式`" @change="patchRule(item, { action: $event.target.value })">
                <option value="block">拦截</option><option value="review">关注</option><option value="mask">打码</option>
              </select>
              <label class="ax-switch"><input type="checkbox" :checked="item.enabled" :aria-label="`启用 ${item.name}`" @change="patchRule(item, { enabled: $event.target.checked })" /><i></i></label>
              <button v-if="!item.builtin" type="button" class="ax-btn is-sm" @click="openRuleDialog(item)">编辑</button>
              <button v-if="!item.builtin" type="button" class="ax-btn is-sm is-danger" @click="deleteRule(item)">删除</button>
            </div>
          </div>
        </div>
        <div v-if="!rules.length" class="ax-empty"><strong>还没有规则</strong></div>
      </div>

      <!-- 拦截设置 -->
      <div v-else-if="tab === 'settings'" class="settings-layout">
        <div class="ax-grid-2">
          <section class="ax-card">
            <div class="ax-card-head"><div><h3>内容拦截</h3><p>关掉总开关后，所有场景都不再检查（不建议）。</p></div>
              <label class="ax-switch"><input v-model="settingsDraft.enabled" type="checkbox" /><i></i><span>{{ settingsDraft.enabled ? '已开启' : '已关闭' }}</span></label>
            </div>
            <div class="ax-rows">
              <label v-for="(label, key) in meta.scopes" :key="key" class="ax-row">
                <span class="ax-row-main"><strong>{{ label }}</strong></span>
                <span class="ax-switch"><input v-model="settingsDraft.scopes[key]" type="checkbox" :disabled="!settingsDraft.enabled" /><i></i></span>
              </label>
            </div>
            <label class="ax-field settings-gap">
              <span>被拦截时给小画家看的话</span>
              <input v-model="settingsDraft.blockMessage" maxlength="80" />
            </label>
          </section>

          <section class="ax-card">
            <div class="ax-card-head"><div><h3>自动封禁</h3><p>短时间内被拦截太多次，就自动暂停一段时间，次数越多暂停越久。</p></div>
              <label class="ax-switch"><input v-model="settingsDraft.banPolicy.enabled" type="checkbox" /><i></i><span>{{ settingsDraft.banPolicy.enabled ? '已开启' : '已关闭' }}</span></label>
            </div>
            <div class="ax-form">
              <label class="ax-field"><span>统计时间（分钟）</span><input v-model.number="settingsDraft.banPolicy.windowMinutes" type="number" min="5" max="1440" /></label>
              <label class="ax-field"><span>被拦截几次就封禁</span><input v-model.number="settingsDraft.banPolicy.threshold" type="number" min="2" max="100" /></label>
              <label v-for="(minutes, index) in settingsDraft.banPolicy.durations" :key="index" class="ax-field">
                <span>第 {{ index + 1 }} 次封禁（分钟）</span>
                <input v-model.number="settingsDraft.banPolicy.durations[index]" type="number" min="5" />
                <small>约 {{ durationText(settingsDraft.banPolicy.durations[index]) }}</small>
              </label>
              <label class="ax-field"><span>封禁后限制</span>
                <select v-model="settingsDraft.banPolicy.scope"><option value="ai">暂停 AI 与发布</option><option value="all">暂停登录</option></select>
              </label>
            </div>
            <p class="ax-hint settings-gap">现在的规则：{{ settingsDraft.banPolicy.windowMinutes }} 分钟内被拦截 {{ settingsDraft.banPolicy.threshold }} 次，自动{{ settingsDraft.banPolicy.scope === 'all' ? '暂停登录' : '暂停 AI 与发布' }} {{ durationText(settingsDraft.banPolicy.durations[0]) }}。</p>
          </section>

          <section class="ax-card">
            <div class="ax-card-head"><div><h3>分享页留言</h3><p>访客在公开分享的报告下留言，按 IP 限制频率。</p></div>
              <label class="ax-switch"><input v-model="settingsDraft.publicComments.enabled" type="checkbox" /><i></i><span>{{ settingsDraft.publicComments.enabled ? '允许留言' : '关闭留言' }}</span></label>
            </div>
            <label class="ax-field"><span>同一 IP 每小时最多留言</span><input v-model.number="settingsDraft.publicComments.perIpPerHour" type="number" min="1" max="100" :disabled="!settingsDraft.publicComments.enabled" /></label>
          </section>

          <section class="ax-card">
            <div class="ax-card-head"><div><h3>青少年保护</h3><p>连续使用提醒休息；夜间时段可以暂停 AI 创作。</p></div></div>
            <div class="ax-form">
              <label class="ax-field"><span>连续使用多久提醒休息（分钟）</span><input v-model.number="settingsDraft.youth.restReminderMinutes" type="number" min="0" max="240" /><small>填 0 表示不提醒</small></label>
              <label class="ax-field"><span>夜间暂停</span>
                <span class="ax-switch quiet-switch"><input v-model="settingsDraft.youth.quietHours.enabled" type="checkbox" /><i></i><span>{{ settingsDraft.youth.quietHours.enabled ? '已开启' : '未开启' }}</span></span>
              </label>
              <label class="ax-field"><span>从</span><input v-model="settingsDraft.youth.quietHours.start" type="time" :disabled="!settingsDraft.youth.quietHours.enabled" /></label>
              <label class="ax-field"><span>到</span><input v-model="settingsDraft.youth.quietHours.end" type="time" :disabled="!settingsDraft.youth.quietHours.enabled" /></label>
            </div>
          </section>
        </div>
        <div class="settings-savebar">
          <span class="ax-hint">{{ settingsUpdatedAt ? `上次保存：${formatTime(settingsUpdatedAt)}` : '还没有保存过，正在使用默认设置' }}</span>
          <button type="button" class="ax-btn" :disabled="settingsSaving" @click="loadSettings">放弃修改</button>
          <button type="button" class="ax-btn is-primary" :disabled="settingsSaving" @click="saveSettings">{{ settingsSaving ? '保存中…' : '保存设置' }}</button>
        </div>
      </div>

      <!-- 检测工具 -->
      <div v-else-if="tab === 'test'" class="ax-grid-2">
        <section class="ax-card">
          <div class="ax-card-head"><div><h3>试一试</h3><p>输入一段话，看看会被怎样处理。只做检测，不会记进风险记录。</p></div></div>
          <div class="ax-form is-1col">
            <label class="ax-field"><span>场景</span>
              <select v-model="testDraft.scope"><option v-for="(label, key) in meta.scopes" :key="key" :value="key">{{ label }}</option></select>
            </label>
            <label class="ax-field"><span>内容</span><textarea v-model="testDraft.text" rows="5" maxlength="2000" placeholder="例如：我的电话是 13800138000"></textarea></label>
            <div class="ax-form-actions"><button type="button" class="ax-btn is-primary" :disabled="testing" @click="runTest">{{ testing ? '检测中…' : '检测' }}</button></div>
          </div>
        </section>
        <section class="ax-card">
          <div class="ax-card-head"><div><h3>结果</h3></div></div>
          <div v-if="!testResult" class="ax-empty"><strong>还没有检测</strong><span>左边输入内容后点「检测」。</span></div>
          <div v-else class="ax-form is-1col">
            <div><span class="ax-pill" :class="actionTone(testResult.action)">{{ testResult.actionLabel }}</span></div>
            <div class="ax-kv"><div><span>处理后的内容</span><strong>{{ testResult.text }}</strong></div></div>
            <p v-if="testResult.message" class="ax-note is-warn">小画家会看到：{{ testResult.message }}</p>
            <p v-if="testResult.selfHarm" class="ax-note is-bad">识别到自伤类表达：会提示求助方式，并在「需要关心」里提醒讲师。</p>
            <div v-if="testResult.hits.length" class="ax-rows">
              <div v-for="(hit, index) in testResult.hits" :key="index" class="ax-row">
                <span class="ax-row-main"><strong>{{ hit.label }}</strong><small>{{ hit.source === 'rule' ? '规则' : '敏感词' }} · {{ hit.categoryLabel }}</small></span>
                <span class="ax-pill" :class="actionTone(hit.action)">{{ hit.actionLabel }}</span>
              </div>
            </div>
            <p v-else class="ax-hint">没有命中任何词语或规则。</p>
          </div>
        </section>
      </div>
    </template>

    <AdminBanDialog v-model="banDialog.open" :account="banDialog.account" :accounts="accountOptions" :default-reason="banDialog.reason" @banned="afterBan" />

    <el-dialog v-model="wordDialog.open" class="ax-dialog" title="添加词语" width="min(520px, 94vw)" align-center append-to-body>
      <div class="ax-form is-1col">
        <label class="ax-field"><span>词语（一行一个）</span><textarea v-model="wordDialog.words" rows="6" placeholder="一行写一个词，可以一次粘贴很多"></textarea></label>
        <div class="ax-form">
          <label class="ax-field"><span>分类</span><select v-model="wordDialog.category"><option v-for="(label, key) in meta.categories" :key="key" :value="key">{{ label }}</option></select></label>
          <label class="ax-field"><span>处理方式</span><select v-model="wordDialog.action"><option v-for="(label, key) in meta.actions" :key="key" :value="key">{{ label }}</option></select></label>
        </div>
        <p class="ax-hint">拦截：不让发出去；关注：照常发出，但记下来给管理员看；打码：用星号盖住；放行：白名单，不处理。</p>
      </div>
      <template #footer>
        <button type="button" class="ax-btn" @click="wordDialog.open = false">取消</button>
        <button type="button" class="ax-btn is-primary" :disabled="wordDialog.saving" @click="submitWords">{{ wordDialog.saving ? '添加中…' : '添加' }}</button>
      </template>
    </el-dialog>

    <el-dialog v-model="ruleDialog.open" class="ax-dialog" :title="ruleDialog.id ? '编辑规则' : '新建规则'" width="min(560px, 94vw)" align-center append-to-body>
      <div class="ax-form">
        <label class="ax-field"><span>规则名称</span><input v-model="ruleDialog.name" maxlength="30" placeholder="例如：约见面" /></label>
        <label class="ax-field"><span>类型</span>
          <select v-model="ruleDialog.kind" :disabled="Boolean(ruleDialog.id)"><option value="combo">组合词</option><option value="regex">正则</option></select>
        </label>
        <label class="ax-field ax-span-all"><span>{{ ruleDialog.kind === 'combo' ? '组合（每行一组，词之间用 + 连接）' : '正则表达式' }}</span>
          <textarea v-model="ruleDialog.pattern" rows="3" :placeholder="ruleDialog.kind === 'combo' ? '见面+地址\n加我+私聊' : '例如：\\d{6,}'"></textarea>
          <small>{{ ruleDialog.kind === 'combo' ? '同一组里的词同时出现才算命中，每组 2～5 个词，最多 20 组。' : '不支持反向引用和嵌套重复，太慢的规则会被拒绝。' }}</small>
        </label>
        <label class="ax-field"><span>分类</span><select v-model="ruleDialog.category"><option v-for="(label, key) in meta.categories" :key="key" :value="key">{{ label }}</option></select></label>
        <label class="ax-field"><span>处理方式</span><select v-model="ruleDialog.action"><option value="block">拦截</option><option value="review">关注</option><option value="mask">打码</option></select></label>
        <div class="ax-field ax-span-all"><span>在哪些场景检查</span>
          <div class="ax-tags">
            <label v-for="(label, key) in meta.scopes" :key="key" class="ax-chip-check"><input v-model="ruleDialog.scopes" type="checkbox" :value="key" /><span>{{ label }}</span></label>
          </div>
        </div>
        <label class="ax-field ax-span-all"><span>说明（可不填）</span><input v-model="ruleDialog.description" maxlength="200" /></label>
      </div>
      <template #footer>
        <button type="button" class="ax-btn" @click="ruleDialog.open = false">取消</button>
        <button type="button" class="ax-btn is-primary" :disabled="ruleDialog.saving" @click="submitRule">{{ ruleDialog.saving ? '保存中…' : '保存' }}</button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { apiClient } from '../services/apiClient'
import AdminBanDialog from './AdminBanDialog.vue'
import AdminIcon from './admin/AdminIcon.vue'

// 「账号安全」：把后端已有的风控接口（/api/admin/risk/*）做成一个页面。
// 只有机构级管理员能用（接口会 403），分部管理员看到的是说明，不是报错。
const emit = defineEmits(['changed'])

const tab = ref('events')
const loading = ref(false)
const forbidden = ref('')
const overview = reactive({ events24h: 0, blocked24h: 0, pendingCare: 0, pendingEvents: 0, activeBans: 0, lockedAccounts: 0, lockedNetworks: 0 })
const meta = reactive({ scopes: {}, categories: {}, actions: {} })

const events = reactive({ items: [], total: 0, page: 1, pageSize: 30 })
const eventFilter = reactive({ status: 'pending', category: '', scope: '', days: 30, keyword: '' })
const selectedEvents = ref([])
const bans = reactive({ items: [], total: 0, page: 1, pageSize: 30 })
const banFilter = reactive({ status: 'active', keyword: '' })
const locks = ref([])
const networkLocks = ref([])
const words = reactive({ items: [], total: 0, page: 1, pageSize: 50, summary: {} })
const wordFilter = reactive({ keyword: '', category: '', action: '', enabled: '', sort: '' })
const rules = ref([])
const settingsDraft = reactive(defaultSettings())
const settingsUpdatedAt = ref('')
const settingsSaving = ref(false)
const testDraft = reactive({ scope: 'chat', text: '' })
const testResult = ref(null)
const testing = ref(false)
const accountOptions = ref([])
const banDialog = reactive({ open: false, account: null, reason: '' })
const wordDialog = reactive({ open: false, words: '', category: 'other', action: 'block', saving: false })
const ruleDialog = reactive({ open: false, id: '', kind: 'combo', name: '', pattern: '', category: 'other', action: 'block', scopes: [], description: '', saving: false })

const tabs = computed(() => [
  { id: 'events', label: '风险记录', count: overview.pendingEvents, alert: overview.pendingCare > 0 },
  { id: 'bans', label: '封禁名单', count: overview.activeBans },
  { id: 'locks', label: '登录锁定', count: overview.lockedAccounts + overview.lockedNetworks },
  { id: 'words', label: '敏感词库' },
  { id: 'rules', label: '识别规则' },
  { id: 'settings', label: '拦截设置' },
  { id: 'test', label: '检测工具' },
])
const allEventsChecked = computed(() => events.items.length > 0 && events.items.every((item) => selectedEvents.value.includes(item.id)))

function defaultSettings() {
  return {
    enabled: true,
    scopes: { chat: true, prompt: true, gallery: true, public_comment: true, profile: true },
    blockMessage: '',
    banPolicy: { enabled: true, windowMinutes: 60, threshold: 5, durations: [30, 1440, 10080], scope: 'ai' },
    publicComments: { enabled: true, perIpPerHour: 6 },
    youth: { restReminderMinutes: 40, quietHours: { enabled: false, start: '22:00', end: '06:00' } },
  }
}

function errorMessage(error, fallback) {
  return error?.response?.data?.message || fallback
}

// 403 = 当前管理员不是机构级范围：整页换成说明，不再一个个接口报错。
function catchForbidden(error) {
  if (error?.response?.status === 403) {
    forbidden.value = errorMessage(error, '当前账号没有整个机构的管理范围。') + ' 请用机构管理员账号处理。'
    return true
  }
  return false
}

async function loadOverview() {
  const { data } = await apiClient.get('/admin/risk/overview')
  Object.assign(overview, {
    events24h: data.events24h || 0, blocked24h: data.blocked24h || 0, pendingCare: data.pendingCare || 0,
    pendingEvents: data.pendingEvents || 0, activeBans: data.activeBans || 0, lockedAccounts: data.lockedAccounts || 0, lockedNetworks: data.lockedNetworks || 0,
  })
}

async function loadSettings() {
  const { data } = await apiClient.get('/admin/risk/settings')
  Object.assign(meta, { scopes: data.scopes || {}, categories: data.categories || {}, actions: data.actions || {} })
  const base = defaultSettings()
  const saved = data.settings || {}
  Object.assign(settingsDraft, {
    ...base,
    ...saved,
    scopes: { ...base.scopes, ...(saved.scopes || {}) },
    banPolicy: { ...base.banPolicy, ...(saved.banPolicy || {}), durations: [...(saved.banPolicy?.durations || base.banPolicy.durations)] },
    publicComments: { ...base.publicComments, ...(saved.publicComments || {}) },
    youth: { ...base.youth, ...(saved.youth || {}), quietHours: { ...base.youth.quietHours, ...(saved.youth?.quietHours || {}) } },
  })
  settingsUpdatedAt.value = data.updatedAt || ''
}

async function loadEvents(page = events.page) {
  const params = { page, pageSize: events.pageSize, days: eventFilter.days }
  for (const key of ['status', 'category', 'scope', 'keyword']) if (eventFilter[key]) params[key] = eventFilter[key]
  try {
    const { data } = await apiClient.get('/admin/risk/events', { params })
    Object.assign(events, { items: data.items || [], total: data.total || 0, page: data.page || page })
    selectedEvents.value = []
  } catch (error) {
    if (!catchForbidden(error)) ElMessage.error(errorMessage(error, '风险记录读取失败'))
  }
}

async function loadBans(page = bans.page) {
  const params = { page, pageSize: bans.pageSize, status: banFilter.status }
  if (banFilter.keyword) params.keyword = banFilter.keyword
  try {
    const { data } = await apiClient.get('/admin/risk/bans', { params })
    Object.assign(bans, { items: data.items || [], total: data.total || 0, page: data.page || page })
  } catch (error) {
    if (!catchForbidden(error)) ElMessage.error(errorMessage(error, '封禁名单读取失败'))
  }
}

async function loadLocks() {
  try {
    const { data } = await apiClient.get('/admin/risk/login-locks')
    locks.value = data.items || []
    networkLocks.value = data.networkLocks || []
  } catch (error) {
    if (!catchForbidden(error)) ElMessage.error(errorMessage(error, '登录锁定读取失败'))
  }
}

async function loadWords(page = words.page) {
  const params = { page, pageSize: words.pageSize }
  for (const key of ['keyword', 'category', 'action', 'enabled', 'sort']) if (wordFilter[key]) params[key] = wordFilter[key]
  try {
    const { data } = await apiClient.get('/admin/risk/words', { params })
    Object.assign(words, { items: data.items || [], total: data.total || 0, page: data.page || page, summary: data.summary || {} })
  } catch (error) {
    if (!catchForbidden(error)) ElMessage.error(errorMessage(error, '敏感词读取失败'))
  }
}

async function loadRules() {
  try {
    const { data } = await apiClient.get('/admin/risk/rules')
    rules.value = data.items || []
  } catch (error) {
    if (!catchForbidden(error)) ElMessage.error(errorMessage(error, '规则读取失败'))
  }
}

async function loadAccounts() {
  try {
    const { data } = await apiClient.get('/admin/accounts')
    accountOptions.value = Array.isArray(data.accounts) ? data.accounts : []
  } catch {
    accountOptions.value = []
  }
}

const tabLoaders = { events: () => loadEvents(1), bans: () => loadBans(1), locks: loadLocks, words: () => loadWords(1), rules: loadRules, settings: loadSettings }

async function refreshAll() {
  loading.value = true
  try {
    await Promise.all([loadOverview(), loadSettings()])
    forbidden.value = ''
    await tabLoaders[tab.value]?.()
  } catch (error) {
    if (!catchForbidden(error)) ElMessage.error(errorMessage(error, '账号安全数据读取失败'))
  } finally {
    loading.value = false
  }
}

watch(tab, (value) => {
  if (!forbidden.value) tabLoaders[value]?.()
})

function jumpEvents(status, category = '') {
  Object.assign(eventFilter, { status, category })
  if (tab.value === 'events') loadEvents(1)
  else tab.value = 'events'
}

function toggleAllEvents(checked) {
  selectedEvents.value = checked ? events.items.map((item) => item.id) : []
}

async function handleEvents(handled, ids = selectedEvents.value) {
  if (!ids.length) return
  try {
    const { data } = await apiClient.post('/admin/risk/events/handle', { ids, handled })
    ElMessage.success(handled ? `已标记 ${data.updated} 条为已处理` : `已重新打开 ${data.updated} 条`)
    await Promise.all([loadEvents(), loadOverview()])
  } catch (error) {
    ElMessage.error(errorMessage(error, '操作失败'))
  }
}

function openBan(user = null, reason = '') {
  banDialog.account = user?.id ? user : null
  banDialog.reason = reason
  banDialog.open = true
  if (!user?.id && !accountOptions.value.length) loadAccounts()
}

async function afterBan() {
  await Promise.all([loadOverview(), tab.value === 'bans' ? loadBans(1) : Promise.resolve()])
  emit('changed')
}

async function liftBan(item) {
  let reason = ''
  try {
    const result = await ElMessageBox.prompt(`解除「${item.user.name || item.user.account}」的封禁？可以写一句原因（选填）。`, '解除封禁', {
      confirmButtonText: '解除', cancelButtonText: '取消', inputPlaceholder: '例如：已和家人沟通', inputValue: '',
    })
    reason = result.value || ''
  } catch {
    return
  }
  try {
    await apiClient.post(`/admin/risk/bans/${encodeURIComponent(item.id)}/lift`, { reason })
    ElMessage.success('已解除封禁')
    await Promise.all([loadBans(), loadOverview()])
    emit('changed')
  } catch (error) {
    ElMessage.error(errorMessage(error, '解除失败'))
  }
}

async function clearLock(item) {
  try {
    await apiClient.post('/admin/risk/login-locks/clear', { userId: item.user.id })
    ElMessage.success(`已解除「${item.user.name || item.user.account}」的登录锁定`)
    await Promise.all([loadLocks(), loadOverview()])
  } catch (error) {
    ElMessage.error(errorMessage(error, '解除锁定失败'))
  }
}

async function clearNetworkLock(item) {
  try {
    await apiClient.post('/admin/risk/login-locks/clear', { lockId: item.id })
    ElMessage.success(`已解除网络「${item.ipHint || '未知网络'}」的登录锁定`)
    await Promise.all([loadLocks(), loadOverview()])
  } catch (error) {
    ElMessage.error(errorMessage(error, '解除锁定失败'))
  }
}

async function patchWord(item, patch) {
  try {
    const { data } = await apiClient.patch(`/admin/risk/words/${encodeURIComponent(item.id)}`, patch)
    Object.assign(item, data.word || patch)
  } catch (error) {
    ElMessage.error(errorMessage(error, '修改失败'))
    await loadWords()
  }
}

async function deleteWord(item) {
  try {
    await ElMessageBox.confirm(`删除「${item.word}」？删除后这个词不再被识别。`, '删除词语', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
  } catch {
    return
  }
  try {
    await apiClient.delete(`/admin/risk/words/${encodeURIComponent(item.id)}`)
    ElMessage.success('已删除')
    await loadWords(words.items.length === 1 && words.page > 1 ? words.page - 1 : words.page)
  } catch (error) {
    ElMessage.error(errorMessage(error, '删除失败'))
  }
}

function openWordDialog() {
  Object.assign(wordDialog, { open: true, words: '', category: 'other', action: 'block', saving: false })
}

async function submitWords() {
  if (!wordDialog.words.trim()) { ElMessage.warning('请先写词语，一行一个'); return }
  wordDialog.saving = true
  try {
    const { data } = await apiClient.post('/admin/risk/words', { words: wordDialog.words, category: wordDialog.category, action: wordDialog.action })
    ElMessage.success(`新增 ${data.added || 0} 个，更新 ${data.updated || 0} 个${data.skipped ? `，跳过 ${data.skipped} 个` : ''}`)
    wordDialog.open = false
    await loadWords(1)
  } catch (error) {
    ElMessage.error(errorMessage(error, '添加失败'))
  } finally {
    wordDialog.saving = false
  }
}

async function importWords(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (file.size > 2 * 1024 * 1024) { ElMessage.warning('文件太大，请分批导入（单次 2MB 以内）'); return }
  try {
    const text = await file.text()
    const { data } = await apiClient.post('/admin/risk/words', { words: text, source: 'import' })
    ElMessage.success(`导入完成：新增 ${data.added || 0} 个，更新 ${data.updated || 0} 个${data.skipped ? `，跳过 ${data.skipped} 个` : ''}`)
    await loadWords(1)
  } catch (error) {
    ElMessage.error(errorMessage(error, '导入失败'))
  }
}

async function patchRule(item, patch) {
  try {
    const { data } = await apiClient.patch(`/admin/risk/rules/${encodeURIComponent(item.id)}`, patch)
    Object.assign(item, data.rule || patch)
  } catch (error) {
    ElMessage.error(errorMessage(error, '修改失败'))
    await loadRules()
  }
}

function openRuleDialog(item = null) {
  Object.assign(ruleDialog, item
    ? { open: true, id: item.id, kind: item.kind, name: item.name, pattern: item.pattern, category: item.category, action: item.action, scopes: [...(item.scopes || [])], description: item.description || '', saving: false }
    : { open: true, id: '', kind: 'combo', name: '', pattern: '', category: 'other', action: 'block', scopes: Object.keys(meta.scopes), description: '', saving: false })
}

async function submitRule() {
  ruleDialog.saving = true
  const payload = { name: ruleDialog.name, pattern: ruleDialog.pattern, category: ruleDialog.category, action: ruleDialog.action, scopes: ruleDialog.scopes, description: ruleDialog.description }
  try {
    if (ruleDialog.id) await apiClient.patch(`/admin/risk/rules/${encodeURIComponent(ruleDialog.id)}`, payload)
    else await apiClient.post('/admin/risk/rules', { ...payload, kind: ruleDialog.kind })
    ElMessage.success('规则已保存')
    ruleDialog.open = false
    await loadRules()
  } catch (error) {
    ElMessage.error(errorMessage(error, '保存失败'))
  } finally {
    ruleDialog.saving = false
  }
}

async function deleteRule(item) {
  try {
    await ElMessageBox.confirm(`删除规则「${item.name}」？`, '删除规则', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
  } catch {
    return
  }
  try {
    await apiClient.delete(`/admin/risk/rules/${encodeURIComponent(item.id)}`)
    ElMessage.success('已删除')
    await loadRules()
  } catch (error) {
    ElMessage.error(errorMessage(error, '删除失败'))
  }
}

async function saveSettings() {
  settingsSaving.value = true
  try {
    const { data } = await apiClient.put('/admin/risk/settings', JSON.parse(JSON.stringify(settingsDraft)))
    if (data.settings) await loadSettings()
    ElMessage.success('设置已保存，马上生效')
  } catch (error) {
    ElMessage.error(errorMessage(error, '保存失败'))
  } finally {
    settingsSaving.value = false
  }
}

async function runTest() {
  if (!testDraft.text.trim()) { ElMessage.warning('先输入要检测的内容'); return }
  testing.value = true
  try {
    const { data } = await apiClient.post('/admin/risk/test', { text: testDraft.text, scope: testDraft.scope })
    testResult.value = { ...data, hits: data.hits || [] }
  } catch (error) {
    ElMessage.error(errorMessage(error, '检测失败'))
  } finally {
    testing.value = false
  }
}

function actionTone(action) {
  return { block: 'is-bad', review: 'is-warn', mask: 'is-info', allow: 'is-ok', pass: 'is-ok' }[action] || 'is-muted'
}
function sourceText(source) {
  return { builtin: '内置', manual: '手动添加', import: '导入' }[source] || source || '—'
}
function kindText(kind) {
  return { combo: '组合词', regex: '正则' }[kind] || '自定义'
}
function roleText(role) {
  return { student: '小画家', teacher: '讲师', admin: '管理员' }[role] || '账号'
}
function pageCount(list) {
  return Math.max(1, Math.ceil((list.total || 0) / (list.pageSize || 30)))
}
function durationText(minutes) {
  const value = Number(minutes) || 0
  if (!value) return '永久'
  if (value % 10080 === 0) return `${value / 10080} 周`
  if (value % 1440 === 0) return `${value / 1440} 天`
  if (value % 60 === 0) return `${value / 60} 小时`
  return `${value} 分钟`
}
function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  const pad = (n) => String(n).padStart(2, '0')
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (sameDay) return `今天 ${time}`
  return `${date.getFullYear() === now.getFullYear() ? '' : `${date.getFullYear()}-`}${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`
}

onMounted(refreshAll)
</script>

<style scoped>
.word-text { color: var(--ax-ink); font-weight: 600; }
.ax-select.is-inline { min-width: 104px; height: 30px; min-height: 30px; padding-top: 4px; padding-bottom: 4px; font-size: 12.5px; }
.ban-lift-note { display: block; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 1280px) {
  /* 平板和小屏笔记本：场景列收起（筛选里还能按场景看）、分类换到第二行、摘录变窄，让操作按钮留在屏幕内 */
  .risk-col-scope { display: none; }
  .risk-hit .ax-hint { display: block; margin-top: 3px; }
  .risk-excerpt { max-width: 150px; }
}
.rule-main { gap: 4px; }
.rule-main > strong { display: flex; align-items: center; gap: 8px; }
.rule-scopes { margin-top: 2px; }
.rule-side { display: flex; flex-shrink: 0; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px; }
.settings-layout { display: grid; gap: 16px; }
.settings-gap { margin-top: 14px; }
.quiet-switch { min-height: 36px; }
.settings-savebar {
  position: sticky;
  bottom: 12px;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border: 1px solid var(--ax-line);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: var(--ax-shadow);
  backdrop-filter: blur(14px);
}
.settings-savebar .ax-hint { margin-right: auto; }
@media (max-width: 900px) {
  .ax-row { flex-direction: column; align-items: stretch; }
  .rule-side { justify-content: flex-start; }
}
</style>
