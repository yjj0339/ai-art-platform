<template>
  <main class="admin-shell as-shell" :class="{ 'is-nav-open': navDrawerOpen }">
    <div v-if="navDrawerOpen" class="as-backdrop" aria-hidden="true" @click="navDrawerOpen = false"></div>

    <aside class="as-sidebar" aria-label="后台菜单">
      <div class="as-brand">
        <span class="as-brand-mark" :class="{ 'has-logo': Boolean(brandLogoUrl) }">
          <img v-if="brandLogoUrl" :src="brandLogoUrl" alt="机构 LOGO" />
          <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9L12 3.5z" /><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" /></svg>
        </span>
        <span class="as-brand-text">
          <strong>管理后台</strong>
          <small>AI创意设计思维平台</small>
        </span>
        <button class="as-icon-btn as-close" type="button" aria-label="收起菜单" @click="navDrawerOpen = false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <label class="as-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20" /></svg>
        <input v-model.trim="navQuery" type="search" placeholder="搜索功能" aria-label="搜索后台功能" @keydown.enter.prevent="openFirstNavMatch" @keydown.esc="navQuery = ''" />
      </label>

      <!-- 当前账号：系统设置顶上那一行的样子；头像是人像图标，不用名字的第一个字 -->
      <div class="as-me">
        <span class="as-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="3.8" /><path d="M4.8 19.6c1.4-3.2 4.1-4.9 7.2-4.9s5.8 1.7 7.2 4.9c-1.9 1.7-4.4 2.7-7.2 2.7s-5.3-1-7.2-2.7z" /></svg></span>
        <span class="as-me-text">
          <strong>{{ adminDisplayName }}</strong>
          <small>{{ userStore.user?.organization?.name || '管理员' }}</small>
        </span>
        <button type="button" class="as-logout" title="退出登录" aria-label="退出登录" @click="logout">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14M10 16.5L5.5 12 10 7.5M5.5 12H15" /></svg>
          <span>退出</span>
        </button>
      </div>

      <nav class="as-nav" aria-label="管理员导航">
        <template v-if="navQuery">
          <button
            v-for="item in navSearchResults"
            :key="item.id"
            type="button"
            class="as-item"
            :class="{ 'is-active': activeNav === item.id }"
            @click.stop="openNavFromSearch(item.id)"
          >
            <span class="as-icon" :style="{ '--tint': navIcon(item.id).tint }"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="navIcon(item.id).d" /></svg></span>
            <span class="as-label">{{ item.label }}</span>
            <small v-if="navSectionLabelOf(item.id)" class="as-meta">{{ navSectionLabelOf(item.id) }}</small>
          </button>
          <p v-if="!navSearchResults.length" class="as-empty">没有找到「{{ navQuery }}」</p>
        </template>
        <template v-else>
          <section v-for="section in navSections" :key="section.id" class="as-section">
            <button
              v-if="section.label"
              type="button"
              class="as-section-head"
              :class="{ 'is-closed': navSectionClosed[section.id] }"
              :aria-expanded="navSectionClosed[section.id] ? 'false' : 'true'"
              @click="toggleNavSection(section.id)"
            >
              <span>{{ section.label }}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5" /></svg>
            </button>
            <div v-show="!section.label || !navSectionClosed[section.id]" class="as-section-body">
              <button
                v-for="item in section.items"
                :key="item.id"
                type="button"
                class="as-item"
                :class="{ 'is-active': activeNav === item.id }"
                :aria-current="activeNav === item.id ? 'page' : undefined"
                @click.stop="selectAdminNav(item.id)"
              >
                <span class="as-icon" :style="{ '--tint': navIcon(item.id).tint }"><svg viewBox="0 0 24 24" aria-hidden="true"><path :d="navIcon(item.id).d" /></svg></span>
                <span class="as-label">{{ item.label }}</span>
              </button>
            </div>
          </section>
        </template>
      </nav>

    </aside>

    <section class="admin-main as-main">
      <!-- 顶栏只做「我在哪」：后台 › 分组 › 页面；页面自己的大标题和操作在下面。平板竖屏、手机上从这里的菜单键打开侧栏。 -->
      <header class="as-topbar" :class="{ 'is-scrolled': topbarScrolled }">
        <button class="as-icon-btn as-menu-btn" type="button" aria-label="打开菜单" @click="navDrawerOpen = true">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <nav class="as-crumbs" aria-label="当前位置">
          <span class="as-crumb-root">管理后台</span>
          <span v-if="currentSectionLabel" class="as-crumb-group">{{ currentSectionLabel }}</span>
          <strong>{{ currentNav.label }}</strong>
        </nav>
        <a class="as-top-link" href="/student/workbench" target="_blank" rel="noopener">
          <span>查看用户端</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 16L16 8M9.5 8H16v6.5" /></svg>
        </a>
      </header>


      <!-- 数据大盘：读 /api/admin/ops/overview 和 /api/admin/risk/overview 的真实数据（旧版是写死的 Mock 数字，已换掉） -->
      <AdminOverview
        v-if="activeNav === 'dashboard'"
        :user-name="adminDisplayName"
        :available-navs="navItems.map((item) => item.id)"
        @navigate="selectAdminNav"
      />

      <AdminRiskCenter v-else-if="activeNav === 'risk'" @changed="accountPermissionStore.loadAdminData(true)" />
      <AdminOpsCenter v-else-if="activeNav === 'ops'" />

      <section v-else-if="activeNav === 'accounts'" class="ax-page account-page">
        <header class="ax-head">
          <div>
            <h2>账号与权限</h2>
            <p>账号、分部与班级、注册邀请码、权限组和积分兑换码。数据按机构隔离：分部管理员只看得到、只管得了自己分部的账号。</p>
          </div>
          <div class="ax-head-actions">
            <button type="button" class="ax-btn" @click="selectAdminNav('risk')">账号安全</button>
            <button type="button" class="ax-btn is-primary" @click="openAccountCreate"><AdminIcon name="plus" plain />创建账号</button>
          </div>
        </header>

        <nav class="ax-tabs" aria-label="账号与权限分类">
          <button type="button" class="ax-tab" :class="{ 'is-active': accountPanel === 'accounts' }" @click="accountPanel = 'accounts'">账号列表<em class="ax-tab-count">{{ accountPermissionStore.accounts.length }}</em></button>
          <button v-if="accountPermissionStore.organizationWide" type="button" class="ax-tab" :class="{ 'is-active': accountPanel === 'organization' }" @click="openOrganizationSetup">分部与班级</button>
          <button v-if="accountPermissionStore.organizationWide" type="button" class="ax-tab" :class="{ 'is-active': accountPanel === 'enrollment' }" @click="openEnrollmentSetup">注册邀请码</button>
          <button type="button" class="ax-tab" :class="{ 'is-active': accountPanel === 'groups' }" @click="accountPanel = 'groups'">权限组<em class="ax-tab-count">{{ accountPermissionStore.permissionGroups.length }}</em></button>
          <button type="button" class="ax-tab" :class="{ 'is-active': accountPanel === 'codes' }" @click="openCreditCodePanel">积分兑换码</button>
        </nav>

        <template v-if="accountPanel === 'accounts'">
          <div class="ax-stats">
            <button type="button" class="ax-stat" @click="accountRoleFilter = 'student'; accountStatusFilter = 'all'">
              <span>小画家账号</span><strong>{{ accountSummary.student }}</strong><small>用户端</small>
            </button>
            <button type="button" class="ax-stat" @click="accountRoleFilter = 'teacher'; accountStatusFilter = 'all'">
              <span>讲师账号</span><strong>{{ accountSummary.teacher }}</strong><small>讲师端，权限跟随权限组</small>
            </button>
            <button type="button" class="ax-stat" @click="accountRoleFilter = 'admin'; accountStatusFilter = 'all'">
              <span>管理员</span><strong>{{ accountSummary.admin }}</strong><small>各自只管自己的范围</small>
            </button>
            <button type="button" class="ax-stat" :class="{ 'is-warn': accountSummary.banned || accountSummary.disabled }" @click="accountRoleFilter = 'all'; accountStatusFilter = accountSummary.banned ? 'banned' : 'disabled'">
              <span>停用 / 封禁中</span><strong>{{ accountSummary.disabled + accountSummary.banned }}</strong><small>停用 {{ accountSummary.disabled }} · 封禁中 {{ accountSummary.banned }}</small>
            </button>
          </div>

          <div class="ax-card is-flush">
            <div class="ax-toolbar">
              <div class="ax-search"><input v-model="accountKeyword" type="search" placeholder="搜索姓名、账号、班级或分部" aria-label="搜索账号" /></div>
              <select v-model="accountRoleFilter" class="ax-select" aria-label="账号类型">
                <option v-for="role in accountRoleTabs" :key="role.value" :value="role.value">{{ role.label }}</option>
              </select>
              <select v-model="accountCampusFilter" class="ax-select" aria-label="机构分部">
                <option value="all">全部分部</option>
                <option v-for="campus in accountPermissionStore.campuses" :key="campus.id" :value="campus.id">{{ campus.name }}</option>
              </select>
              <select v-model="accountStatusFilter" class="ax-select" aria-label="账号状态">
                <option value="all">全部状态</option><option value="enabled">启用</option><option value="disabled">停用</option><option value="banned">封禁中</option>
              </select>
              <span class="ax-grow"></span>
              <span class="ax-count">{{ filteredAccounts.length }} / {{ accountPermissionStore.accounts.length }} 个</span>
            </div>
            <div class="ax-table-wrap">
              <table class="ax-table account-table">
                <thead>
                  <tr><th>账号</th><th>类型</th><th>归属 / 管理范围</th><th class="account-col-perm">独立权限</th><th class="is-right">积分</th><th>状态</th><th class="is-right">操作</th></tr>
                </thead>
                <tbody>
                  <tr v-for="account in filteredAccounts" :key="account.id">
                    <td>
                      <button type="button" class="ax-person" :title="`查看 ${account.name} 的详情`" @click="openAccountDetail(account)">
                        <AdminAvatar :role="account.role" />
                        <span class="ax-cell-main"><strong>{{ account.name }}</strong><small>{{ account.account || '未设置登录账号' }}</small></span>
                      </button>
                    </td>
                    <td><span class="ax-tag" :class="roleTagClass(account.role)">{{ roleShortLabel(account.role) }}</span></td>
                    <td><span class="ax-ellipsis" :title="accountScopeText(account)">{{ accountScopeText(account) }}</span></td>
                    <td class="account-col-perm">
                      <div v-if="permissionEntries(account).length" class="ax-tags">
                        <label v-for="item in permissionEntries(account)" :key="`${account.id}-${item.key}`" class="ax-chip-check">
                          <input type="checkbox" :checked="item.value" @change="togglePermission(account.id, item.key, $event)" /><span>{{ item.label }}</span>
                        </label>
                      </div>
                      <span v-else class="ax-hint">{{ account.role === 'teacher' ? '跟随权限组' : '默认权限' }}</span>
                    </td>
                    <td class="is-right"><button type="button" class="ax-btn is-sm is-ghost account-credit" :title="`调整 ${account.name} 的积分`" @click.stop="openCreditDialog(account)">{{ creditBalanceOf(account) }} 分</button></td>
                    <td>
                      <span v-if="account.ban" class="account-ban" :title="account.ban.message || accountBanText(account)">
                        <span class="ax-pill is-bad">{{ accountBanScopeText(account) }}</span>
                        <small>{{ accountBanUntilText(account) }}</small>
                      </span>
                      <label v-else class="ax-switch">
                        <input type="checkbox" :checked="account.status === 'enabled'" :disabled="account.id === userStore.user?.id" :aria-label="`${account.name} 启用或停用`" @change="toggleAccountStatus(account, $event)" /><i></i>
                        <span>{{ account.status === 'enabled' ? '启用' : '停用' }}</span>
                      </label>
                    </td>
                    <td class="is-right">
                      <div class="ax-actions">
                        <button type="button" class="ax-btn is-sm" @click.stop="openAccountEdit(account)">编辑</button>
                        <button v-if="account.ban" type="button" class="ax-btn is-sm" @click.stop="liftAccountBan(account)">解封</button>
                        <button v-else-if="canBanAccount(account)" type="button" class="ax-btn is-sm is-danger" @click.stop="openAccountBan(account)">封禁</button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="!filteredAccounts.length" class="ax-empty">
              <strong>{{ accountPermissionStore.accounts.length ? '没有符合条件的账号' : '还没有账号' }}</strong>
              <span>{{ accountPermissionStore.accounts.length ? '换个筛选条件试试。' : '点右上角「创建账号」，或在「注册邀请码」里发码让大家自己注册。' }}</span>
            </div>
          </div>

          <el-dialog v-model="showCreditDialog" class="ax-dialog" title="积分" width="min(520px, 94vw)" align-center>
            <div v-if="creditTarget" class="ax-form is-1col">
              <div class="ax-person is-static">
                <AdminAvatar :role="creditTarget.role" />
                <span class="ax-cell-main"><strong>{{ creditTarget.name }}</strong><small>{{ roleLabel(creditTarget.role) }}{{ creditTarget.className ? ` · ${creditTarget.className}` : '' }}</small></span>
              </div>
              <div class="ax-kv">
                <div><span>当前余额</span><strong>{{ creditDetail.balance }} 分</strong></div>
                <div><span>今日免费剩余</span><strong>{{ creditDetail.freeRemaining }} / {{ creditDetail.freeTotal }} 次</strong></div>
              </div>
              <label class="ax-field">
                <span>调整数量</span>
                <input v-model.number="creditAdjustForm.delta" type="number" step="1" placeholder="例如 100 或 -50" />
                <small>正数加分，负数扣分。</small>
              </label>
              <div class="ax-tags">
                <button v-for="n in [10, 50, 100, 500]" :key="n" type="button" class="ax-btn is-sm" @click="creditAdjustForm.delta = n">+{{ n }}</button>
                <button type="button" class="ax-btn is-sm" @click="creditAdjustForm.delta = -10">-10</button>
              </div>
              <label class="ax-field"><span>原因</span><textarea v-model="creditAdjustForm.reason" rows="2" placeholder="例如：微信转账 10 元"></textarea></label>
              <div class="ax-section-title">最近积分流水</div>
              <div class="ax-rows account-ledger">
                <div v-for="entry in creditDetail.entries" :key="entry.id" class="ax-row">
                  <span class="ax-row-main"><strong>{{ creditEntryTitle(entry) }}</strong><small>{{ formatCreditTime(entry.createdAt) }}</small></span>
                  <strong class="account-ledger-amount" :class="{ 'is-in': entry.direction === 'in' }">{{ entry.direction === 'in' ? '+' : '-' }}{{ entry.amount }}</strong>
                </div>
                <p v-if="!creditDetail.entries.length" class="ax-hint">暂无积分流水。</p>
              </div>
            </div>
            <template #footer>
              <button type="button" class="ax-btn" @click="showCreditDialog = false">关闭</button>
              <button type="button" class="ax-btn is-primary" :disabled="creditAdjustSubmitting" @click="submitCreditAdjust">{{ creditAdjustSubmitting ? '提交中…' : '确认调整' }}</button>
            </template>
          </el-dialog>
        </template>

        <section v-else-if="accountPanel === 'organization'" class="ax-grid-2">
          <p v-if="organizationSetupError" class="ax-note is-bad ax-span-all">{{ organizationSetupError }}</p>
          <div class="ax-card">
            <div class="ax-card-head">
              <div><h3>机构分部</h3><p>先建分部，再建班级；账号和邀请码都要归到分部下。</p></div>
              <button type="button" class="ax-btn is-sm" :disabled="organizationSetupLoading" @click="loadOrganizationSetup">{{ organizationSetupLoading ? '刷新中…' : '刷新' }}</button>
            </div>
            <form class="ax-form account-inline-form" @submit.prevent="saveCampusSetup">
              <label class="ax-field"><span>分部名称</span><input v-model="campusDraft.name" placeholder="例如：主分部" /></label>
              <label class="ax-field"><span>分部代码</span><input v-model="campusDraft.code" placeholder="例如：main-campus" /></label>
              <div class="ax-form-actions"><button type="submit" class="ax-btn is-primary account-inline-btn">新增分部</button></div>
            </form>
            <div class="ax-divider account-gap"></div>
            <div class="account-filter-row">
              <div class="ax-search"><input v-model="campusKeyword" type="search" placeholder="搜索分部名称或代码" aria-label="搜索机构分部名称或代码" /></div>
              <select v-model="campusStatusFilter" class="ax-select" aria-label="按机构分部状态筛选"><option value="all">全部状态</option><option value="active">已启用</option><option value="disabled">已停用</option></select>
              <span class="ax-count">{{ filteredSetupCampuses.length }}/{{ organizationSetup.campuses.length }} 个</span>
            </div>
            <div class="ax-rows">
              <div v-for="campus in filteredSetupCampuses" :key="campus.id" class="ax-row">
                <span class="ax-row-main"><strong>{{ campus.name }}</strong><small>{{ campus.code }} · {{ campusClassCount(campus.id) }} 个班级</small></span>
                <span class="ax-actions">
                  <span class="ax-pill" :class="campus.status === 'active' ? 'is-ok' : 'is-muted'">{{ campus.status === 'active' ? '已启用' : '已停用' }}</span>
                  <button type="button" class="ax-btn is-sm" @click="openCampusEdit(campus)">编辑</button>
                  <button v-if="campus.status === 'active'" type="button" class="ax-btn is-sm is-danger" @click="confirmDisableCampus(campus)">停用</button>
                  <button v-else type="button" class="ax-btn is-sm" @click="enableCampus(campus)">重新启用</button>
                </span>
              </div>
            </div>
            <div v-if="!organizationSetup.campuses.length" class="ax-empty"><strong>还没有机构分部</strong><span>在上面填好名称和代码就能新增。</span></div>
            <div v-else-if="!filteredSetupCampuses.length" class="ax-empty"><strong>没有符合条件的分部</strong></div>
          </div>
          <div class="ax-card">
            <div class="ax-card-head"><div><h3>班级</h3><p>共 {{ organizationSetup.classes.length }} 个班级。</p></div></div>
            <form class="ax-form account-inline-form" @submit.prevent="saveClassSetup">
              <label class="ax-field"><span>所属分部</span>
                <select v-model="classDraft.campusId"><option value="">请选择分部</option><option v-for="campus in organizationSetup.campuses.filter((item) => item.status === 'active')" :key="campus.id" :value="campus.id">{{ campus.name }}</option></select>
              </label>
              <label class="ax-field"><span>班级名称</span><input v-model="classDraft.name" placeholder="例如：三年级 1 班" /></label>
              <div class="ax-form-actions"><button type="submit" class="ax-btn is-primary account-inline-btn">新增班级</button></div>
            </form>
            <div class="ax-divider account-gap"></div>
            <div class="ax-rows">
              <div v-for="item in organizationSetup.classes" :key="item.id" class="ax-row">
                <span class="ax-row-main"><strong>{{ item.name }}</strong><small>{{ campusName(item.campus_id) }}</small></span>
                <span class="ax-pill" :class="item.status === 'active' ? 'is-ok' : 'is-muted'">{{ item.status === 'active' ? '已启用' : '已归档' }}</span>
              </div>
            </div>
            <div v-if="!organizationSetup.classes.length" class="ax-empty"><strong>还没有班级</strong><span>先选分部，再填班级名称。</span></div>
          </div>
          <el-dialog v-model="showCampusEditDialog" class="ax-dialog" title="编辑分部" width="min(460px, 92vw)" align-center>
            <form class="ax-form is-1col" @submit.prevent="saveCampusEdit">
              <label class="ax-field"><span>分部名称</span><input v-model="campusEditDraft.name" /></label>
              <label class="ax-field"><span>分部代码</span><input v-model="campusEditDraft.code" /></label>
              <label class="ax-field"><span>状态</span><select v-model="campusEditDraft.status"><option value="active">启用</option><option value="disabled">停用</option></select></label>
            </form>
            <template #footer>
              <button type="button" class="ax-btn" @click="showCampusEditDialog = false">取消</button>
              <button type="button" class="ax-btn is-primary" @click="saveCampusEdit">保存修改</button>
            </template>
          </el-dialog>
        </section>

        <section v-else-if="accountPanel === 'enrollment'" class="ax-grid-2">
          <div class="ax-card">
            <div class="ax-card-head"><div><h3>生成邀请码</h3><p>拿到邀请码的人才能自己注册；邀请码会锁定机构、分部、角色和班级。</p></div></div>
            <form class="ax-form" @submit.prevent="createEnrollmentCode">
              <label class="ax-field"><span>分部</span>
                <select v-model="enrollmentDraft.campusId"><option value="">请选择分部</option><option v-for="campus in organizationSetup.campuses.filter((item) => item.status === 'active')" :key="campus.id" :value="campus.id">{{ campus.name }}</option></select>
              </label>
              <label class="ax-field"><span>班级（建议选）</span>
                <select v-model="enrollmentDraft.classId"><option value="">不绑定班级</option><option v-for="item in availableEnrollmentClasses" :key="item.id" :value="item.id">{{ item.name }}</option></select>
              </label>
              <label class="ax-field"><span>注册成</span><select v-model="enrollmentDraft.role"><option value="student">小画家</option><option value="teacher">讲师</option></select></label>
              <label class="ax-field"><span>能用几次</span><input v-model.number="enrollmentDraft.maxUses" type="number" min="1" max="1000" /></label>
              <label class="ax-field ax-span-all"><span>备注（只有管理员看得到）</span><input v-model="enrollmentDraft.label" placeholder="例如：三年级 1 班秋季招生" /></label>
              <div class="ax-form-actions"><button type="submit" class="ax-btn is-primary">生成邀请码</button></div>
            </form>
          </div>
          <div class="ax-card">
            <div class="ax-card-head">
              <div><h3>已生成的邀请码</h3><p>共 {{ organizationSetup.codes.length }} 个，点「复制」发给要注册的人。</p></div>
              <button type="button" class="ax-btn is-sm" :disabled="organizationSetupLoading" @click="loadOrganizationSetup">刷新</button>
            </div>
            <div class="ax-rows">
              <div v-for="item in organizationSetup.codes" :key="item.id" class="ax-row">
                <span class="ax-row-main">
                  <strong class="ax-mono">{{ item.code }}</strong>
                  <small>{{ roleLabel(item.role) }} · {{ campusName(item.campus_id) }}<template v-if="item.class_id"> · {{ className(item.class_id) }}</template>{{ item.label ? ` · ${item.label}` : '' }}</small>
                </span>
                <span class="ax-actions">
                  <span class="ax-pill" :class="item.status === 'active' && item.used_count < item.max_uses ? 'is-ok' : 'is-muted'">已用 {{ item.used_count }}/{{ item.max_uses }}</span>
                  <button type="button" class="ax-btn is-sm" @click="copyAdminText(item.code, '邀请码已复制')">复制</button>
                </span>
              </div>
            </div>
            <div v-if="!organizationSetup.codes.length" class="ax-empty"><strong>还没有邀请码</strong><span>在左边填好分部和角色就能生成。</span></div>
          </div>
        </section>

        <section v-else-if="accountPanel === 'codes'" class="ax-page">
          <div class="ax-card">
            <div class="ax-card-head">
              <div><h3>生成积分码</h3><p>收到付款后在这里发码；把码发给用户，用户到「个人中心 → 我的积分」粘贴兑换就到账。</p></div>
              <div class="ax-actions">
                <a class="ax-btn is-sm" :href="creditExportUrl('codes')" target="_blank" rel="noopener">导出码表</a>
                <a class="ax-btn is-sm" :href="creditExportUrl('check')" target="_blank" rel="noopener">导出核对表</a>
              </div>
            </div>
            <form class="ax-form is-3col" @submit.prevent="submitGenerateCodes">
              <label class="ax-field"><span>面额（积分）</span><input v-model.number="codeDraft.faceValue" type="number" min="1" step="1" placeholder="例如 100" /></label>
              <label class="ax-field"><span>生成数量</span><input v-model.number="codeDraft.quantity" type="number" min="1" max="500" placeholder="例如 1" /></label>
              <label class="ax-field"><span>有效期（天）</span><input v-model.number="codeDraft.expiresInDays" type="number" min="0" placeholder="留空为永久" /></label>
              <label class="ax-field"><span>码前缀</span><input v-model="codeDraft.prefix" maxlength="8" placeholder="留空则 ART" /></label>
              <label class="ax-field"><span>付款单号（选填）</span><input v-model="codeDraft.orderNo" placeholder="例如 JF20251106153000123" /></label>
              <label class="ax-field"><span>备注（只有管理员看得到）</span><input v-model="codeDraft.note" placeholder="例如：张讲师班 11 月充值" /></label>
              <div class="ax-form-actions"><button type="submit" class="ax-btn is-primary" :disabled="creditCodeSubmitting">{{ creditCodeSubmitting ? '生成中…' : '生成积分码' }}</button></div>
            </form>
          </div>
          <div class="ax-card is-flush">
            <div class="ax-toolbar">
              <select v-model="creditCodeStatusFilter" class="ax-select" aria-label="积分码状态" @change="loadCreditCodes">
                <option value="">全部状态</option><option value="unused">未使用</option><option value="redeemed">已兑换待核对</option><option value="confirmed">已核对收款</option><option value="void">已作废</option>
              </select>
              <span class="ax-grow"></span>
              <span class="ax-count">共 {{ creditCodes.length }} 条</span>
              <button type="button" class="ax-btn is-sm" :disabled="creditCodeLoading" @click="loadCreditCodes">{{ creditCodeLoading ? '刷新中…' : '刷新' }}</button>
            </div>
            <div class="ax-table-wrap">
              <table class="ax-table">
                <thead><tr><th>积分码</th><th class="is-right">面额</th><th>状态</th><th>单号 / 备注</th><th>时间</th><th class="is-right">操作</th></tr></thead>
                <tbody>
                  <tr v-for="item in creditCodes" :key="item.id">
                    <td><span class="ax-mono account-code">{{ item.code }}</span></td>
                    <td class="is-right is-num">{{ item.faceValue }} 分</td>
                    <td><span class="ax-pill" :class="creditCodeTone(item.status)">{{ creditCodeStatusLabel(item.status) }}</span></td>
                    <td>
                      <div class="ax-cell-main">
                        <small v-if="item.orderNo">单号 {{ item.orderNo }}</small>
                        <small v-if="item.note">{{ item.note }}</small>
                        <small v-if="!item.orderNo && !item.note">—</small>
                      </div>
                    </td>
                    <td class="is-nowrap">{{ item.redeemedAt ? `兑换于 ${formatCreditTime(item.redeemedAt)}` : `生成于 ${formatCreditTime(item.createdAt)}` }}</td>
                    <td class="is-right">
                      <div class="ax-actions">
                        <button type="button" class="ax-btn is-sm" @click="copyAdminText(item.code, '积分码已复制')">复制</button>
                        <button v-if="item.status === 'redeemed'" type="button" class="ax-btn is-sm is-soft" @click="confirmCreditCode(item)">确认收款</button>
                        <button v-if="item.status !== 'void' && item.status !== 'confirmed'" type="button" class="ax-btn is-sm is-danger" @click="voidCreditCodeItem(item)">作废</button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="!creditCodes.length" class="ax-empty"><strong>还没有积分码</strong><span>在上面填好面额和数量就能生成。</span></div>
          </div>
        </section>

        <section v-else class="ax-split">
          <aside class="ax-card account-group-list">
            <button type="button" class="ax-btn is-soft is-block" @click="startNewPermissionGroup"><AdminIcon name="plus" plain />新建权限组</button>
            <div class="ax-list account-gap">
              <button
                v-for="group in accountPermissionStore.permissionGroups"
                :key="group.id"
                type="button"
                class="ax-list-item"
                :class="{ 'is-active': selectedPermissionGroupId === group.id }"
                @click="selectPermissionGroup(group.id)"
              >
                <strong>{{ group.name }}</strong>
                <small>{{ group.memberIds.length }} 名成员 · {{ group.status === 'enabled' ? '已启用' : '已停用' }}</small>
              </button>
            </div>
            <p v-if="!accountPermissionStore.permissionGroups.length" class="ax-hint account-gap">还没有权限组。</p>
          </aside>
          <div class="ax-card">
            <div class="ax-card-head">
              <div><h3>{{ selectedPermissionGroupId ? '编辑权限组' : '新建权限组' }}</h3><p>权限组决定讲师能用哪些功能，也可以作为课程的授权对象。</p></div>
              <label class="ax-switch"><input v-model="permissionGroupDraft.enabled" type="checkbox" /><i></i><span>{{ permissionGroupDraft.enabled ? '启用' : '停用' }}</span></label>
            </div>
            <div class="ax-form">
              <label class="ax-field"><span>名称</span><input v-model="permissionGroupDraft.name" placeholder="例如：课程讲师组" /></label>
              <label class="ax-field ax-span-all"><span>说明</span><textarea v-model="permissionGroupDraft.description" rows="2" placeholder="这个组负责哪些课程、用在什么场合"></textarea></label>
              <div class="ax-field ax-span-all">
                <span>功能权限</span>
                <div class="ax-option-grid">
                  <label v-for="item in groupPermissionOptions" :key="item.key" class="ax-option">
                    <input v-model="permissionGroupDraft.permissions[item.key]" type="checkbox" />
                    <span><strong>{{ item.label }}</strong><small>{{ item.desc }}</small></span>
                  </label>
                </div>
              </div>
              <div class="ax-field ax-span-all">
                <span>成员（已选 {{ permissionGroupDraft.memberIds.length }} 人）</span>
                <div class="ax-tags">
                  <button v-for="role in groupMemberRoleTabs" :key="role.value" type="button" class="ax-btn is-sm" :class="{ 'is-soft': groupMemberRoleFilter === role.value }" @click="groupMemberRoleFilter = role.value">{{ role.label }}</button>
                </div>
                <div class="ax-option-grid">
                  <label v-for="account in groupMemberAccounts" :key="account.id" class="ax-option">
                    <input v-model="permissionGroupDraft.memberIds" type="checkbox" :value="account.id" />
                    <span><strong>{{ account.name }}</strong><small>{{ roleLabel(account.role) }}{{ account.className ? ` · ${account.className}` : '' }}</small></span>
                  </label>
                </div>
                <p v-if="!groupMemberAccounts.length" class="ax-hint">这个类型下还没有账号。</p>
              </div>
              <div class="ax-form-actions">
                <button v-if="selectedPermissionGroupId" type="button" class="ax-btn is-danger" @click="deletePermissionGroup">删除权限组</button>
                <button type="button" class="ax-btn is-primary" @click="savePermissionGroup">保存权限组</button>
              </div>
            </div>
          </div>
        </section>

        <el-dialog v-model="showAccountDetailDialog" class="ax-dialog" :title="selectedAccountDetail ? `账号详情 · ${selectedAccountDetail.name}` : '账号详情'" width="min(980px, 95vw)" align-center>
          <div v-if="selectedAccountDetail" class="account-detail">
            <aside class="account-detail-side">
              <AdminAvatar :role="selectedAccountDetail.role" size="lg" />
              <strong>{{ selectedAccountDetail.name }}</strong>
              <small>{{ roleLabel(selectedAccountDetail.role) }} · {{ selectedAccountDetail.className || '未设置班级' }}</small>
              <span v-if="selectedAccountDetail.ban" class="ax-pill is-bad">{{ accountBanText(selectedAccountDetail) }}</span>
              <span v-else class="ax-pill" :class="selectedAccountDetail.status === 'enabled' ? 'is-ok' : 'is-muted'">{{ selectedAccountDetail.status === 'enabled' ? '启用中' : '已停用' }}</span>
              <div class="account-detail-actions">
                <button type="button" class="ax-btn is-block" @click="openAccountEdit(selectedAccountDetail)">编辑账号</button>
                <button type="button" class="ax-btn is-block" @click="resetSelectedAccountPassword(selectedAccountDetail)">重置密码</button>
                <button type="button" class="ax-btn is-block" @click="revokeSelectedAccountSessions(selectedAccountDetail)">退出全部设备</button>
                <button v-if="selectedAccountDetail.ban" type="button" class="ax-btn is-block" @click="liftAccountBan(selectedAccountDetail)">解除封禁</button>
                <button v-else-if="canBanAccount(selectedAccountDetail)" type="button" class="ax-btn is-block is-danger" @click="openAccountBan(selectedAccountDetail)">封禁账号</button>
                <button v-if="selectedAccountDetail.status === 'enabled' && selectedAccountDetail.id !== userStore.user?.id" type="button" class="ax-btn is-block is-danger" @click="confirmDeleteAccount(selectedAccountDetail)">停用账号</button>
              </div>
            </aside>
            <section class="account-detail-main">
              <nav class="ax-tabs" aria-label="账号详情分类">
                <button v-for="tab in accountDetailTabs" :key="tab.value" type="button" class="ax-tab" :class="{ 'is-active': accountDetailTab === tab.value }" @click="accountDetailTab = tab.value">{{ tab.label }}</button>
              </nav>
              <template v-if="accountDetailTab === 'basic'">
                <p v-if="selectedAccountDetail.ban" class="ax-note is-bad">{{ selectedAccountDetail.ban.message }}</p>
                <div class="ax-kv">
                  <div><span>姓名</span><strong>{{ selectedAccountDetail.name }}</strong></div>
                  <div><span>登录账号</span><strong>{{ selectedAccountDetail.account || '未设置' }}</strong></div>
                  <div><span>类型</span><strong>{{ roleLabel(selectedAccountDetail.role) }}</strong></div>
                  <div><span>所属班级</span><strong>{{ selectedAccountDetail.className || '未设置' }}</strong></div>
                  <div><span>归属 / 管理范围</span><strong>{{ accountScopeText(selectedAccountDetail) }}</strong></div>
                  <div><span>权限组</span><strong>{{ permissionGroupNames(selectedAccountDetail.groupIds) }}</strong></div>
                  <div><span>创建时间</span><strong>{{ formatCreditTime(selectedAccountDetail.createdAt) }}</strong></div>
                  <div><span>积分</span><strong>{{ creditBalanceOf(selectedAccountDetail) }} 分</strong></div>
                </div>
                <div class="ax-section-title">独立权限</div>
                <div v-if="permissionEntries(selectedAccountDetail).length" class="ax-tags is-roomy">
                  <label v-for="item in permissionEntries(selectedAccountDetail)" :key="item.key" class="ax-chip-check">
                    <input type="checkbox" :checked="item.value" @change="togglePermission(selectedAccountDetail.id, item.key, $event)" /><span>{{ item.label }}</span>
                  </label>
                </div>
                <p class="ax-hint">{{ permissionEntries(selectedAccountDetail).length ? '点一下就能单独打开或关闭，和列表里的开关是同一个设置。' : '这个账号没有可单独设置的权限，按账号类型和权限组使用。' }}</p>
              </template>
              <template v-else-if="accountDetailTab === 'lessons'">
                <div class="ax-empty"><strong>暂无上课记录</strong><span>课程目前还没有按账号记录上课和完成进度。</span></div>
              </template>
              <template v-else-if="accountDetailTab === 'works'">
                <div v-if="accountDetailWorks.length" class="account-work-grid">
                  <article v-for="work in accountDetailWorks" :key="work.id">
                    <i :style="{ background: work.cover }"></i>
                    <strong>{{ work.title }}</strong>
                    <small>{{ work.course }}</small>
                  </article>
                </div>
                <div v-else class="ax-empty"><strong>暂无个人作品</strong><span>这个账号还没有在作品库里发布作品。</span></div>
              </template>
              <template v-else>
                <div v-if="accountDetailCredit.loading" class="ax-empty"><strong>正在读取…</strong></div>
                <p v-else-if="accountDetailCredit.error" class="ax-note is-bad">{{ accountDetailCredit.error }}</p>
                <template v-else>
                  <div class="ax-kv"><div><span>当前余额</span><strong>{{ accountDetailCredit.balance }} 分</strong></div></div>
                  <div class="ax-rows account-ledger">
                    <div v-for="entry in accountDetailCredit.entries" :key="entry.id" class="ax-row">
                      <span class="ax-row-main"><strong>{{ creditEntryTitle(entry) }}</strong><small>{{ formatCreditTime(entry.createdAt) }}</small></span>
                      <strong class="account-ledger-amount" :class="{ 'is-in': entry.direction === 'in' }">{{ entry.direction === 'in' ? '+' : '-' }}{{ entry.amount }}</strong>
                    </div>
                  </div>
                  <div v-if="!accountDetailCredit.entries.length" class="ax-empty"><strong>暂无积分记录</strong><span>充值、兑换、AI 创作消耗都会记在这里。</span></div>
                </template>
              </template>
            </section>
          </div>
        </el-dialog>

        <el-dialog v-model="showAccountEditDialog" class="ax-dialog" :title="accountEditMode === 'create' ? '创建账号' : '编辑账号'" width="min(600px, 94vw)" align-center>
          <div class="ax-form">
            <label class="ax-field"><span>账号类型</span>
              <select v-model="accountEditDraft.role" :disabled="accountEditMode === 'edit'"><option v-for="role in accountRoleTabs.filter((role) => role.value !== 'all')" :key="role.value" :value="role.value">{{ role.label }}</option></select>
            </label>
            <label class="ax-field"><span>姓名</span><input v-model="accountEditDraft.name" /></label>
            <label class="ax-field ax-span-all"><span>登录账号</span>
              <input :value="accountEditDraft.account" placeholder="3-20 位字母或数字，例如手机号" @input="onAccountDraftInput" />
              <small>只能用字母和数字，可以直接填手机号；大写会自动转小写。</small>
            </label>
            <label v-if="accountEditDraft.role === 'admin'" class="ax-field"><span>管理范围</span>
              <select v-model="accountEditDraft.adminScopeType"><option value="campus">指定分部</option><option v-if="accountPermissionStore.organizationWide" value="organization">整个机构</option></select>
            </label>
            <label v-if="accountEditDraft.role !== 'admin' || accountEditDraft.adminScopeType === 'campus'" class="ax-field"><span>所属分部</span>
              <select v-model="accountEditDraft.campusId"><option value="">请选择分部</option><option v-for="campus in accountPermissionStore.campuses" :key="campus.id" :value="campus.id">{{ campus.name }}</option></select>
            </label>
            <label class="ax-field"><span>状态</span><select v-model="accountEditDraft.status"><option value="enabled">启用</option><option value="disabled">停用</option></select></label>
            <span v-if="accountEditDraft.role === 'admin' && accountEditDraft.adminScopeType === 'campus'" class="account-form-spacer"></span>
            <div v-if="['student', 'teacher'].includes(accountEditDraft.role)" class="ax-field ax-span-all"><span>{{ accountEditDraft.role === 'teacher' ? '负责的班级（可多选）' : '所属班级（可多选）' }}</span>
              <div v-if="accountEditClassOptions.length" class="ax-tags is-roomy">
                <label v-for="item in accountEditClassOptions" :key="item.id" class="ax-chip-check"><input v-model="accountEditDraft.classIds" type="checkbox" :value="item.id" /><span>{{ item.name }}</span></label>
              </div>
              <small v-else>{{ accountEditDraft.campusId ? '这个分部还没有班级，可以先到「分部与班级」里新建。' : '先选所属分部，再选班级。' }}</small>
            </div>
            <div v-if="accountEditDraft.role === 'admin' && accountEditDraft.adminScopeType === 'campus'" class="ax-field ax-span-all"><span>能管理的分部（可多选）</span>
              <div class="ax-tags is-roomy">
                <label v-for="campus in accountPermissionStore.campuses" :key="campus.id" class="ax-chip-check"><input v-model="accountEditDraft.adminCampusIds" type="checkbox" :value="campus.id" /><span>{{ campus.name }}</span></label>
              </div>
              <small>这个管理员只看得到、只管得了这些分部的账号和数据。</small>
            </div>
            <label class="ax-field"><span>{{ accountEditMode === 'create' ? '登录密码' : '新密码（留空不改）' }}</span><input v-model="accountEditDraft.password" type="password" autocomplete="new-password" :required="accountEditMode === 'create'" /></label>
            <label class="ax-field"><span>{{ accountEditMode === 'create' ? '确认密码' : '确认新密码' }}</span><input v-model="accountEditDraft.passwordConfirm" type="password" autocomplete="new-password" /></label>
            <div v-if="accountEditDraft.role === 'teacher'" class="ax-field ax-span-all"><span>权限组（可多选）</span>
              <div v-if="accountPermissionStore.permissionGroups.length" class="ax-tags is-roomy">
                <label v-for="group in accountPermissionStore.permissionGroups" :key="group.id" class="ax-chip-check"><input v-model="accountEditDraft.groupIds" type="checkbox" :value="group.id" /><span>{{ group.name }}</span></label>
              </div>
              <small v-else>还没有权限组，可以先到「权限组」里新建。</small>
            </div>
          </div>
          <template #footer>
            <button type="button" class="ax-btn" @click="showAccountEditDialog = false">取消</button>
            <button type="button" class="ax-btn is-primary" @click="saveAccountEdit">保存</button>
          </template>
        </el-dialog>

        <AdminBanDialog v-model="accountBanDialog.open" :account="accountBanDialog.account" @banned="afterAccountBan" />
      </section>

      <section v-else-if="activeNav === 'courses'" class="ax-page course-page">
        <header class="ax-head">
          <div>
            <h2>课程库管理</h2>
            <p>讲师上传的视频、课件、题目和授权都在这里。授权给权限组后，组里的讲师就能在讲师端把课程发给班级。</p>
          </div>
          <div class="ax-head-actions">
            <button type="button" class="ax-btn is-primary" @click="openAdminCourseUpload"><AdminIcon name="plus" plain />上传新课程</button>
          </div>
        </header>

        <nav class="ax-tabs" aria-label="课程库分类">
          <button type="button" class="ax-tab" :class="{ 'is-active': coursePanel === 'bulk' }" @click="coursePanel = 'bulk'">课程列表<em class="ax-tab-count">{{ courseStore.courses.length }}</em></button>
          <button type="button" class="ax-tab" :class="{ 'is-active': coursePanel === 'auth' }" @click="coursePanel = 'auth'">课程授权</button>
          <button v-if="coursePanel === 'upload'" type="button" class="ax-tab is-active">{{ editingAdminCourseId ? '编辑课程' : '上传课程' }}</button>
        </nav>

        <!-- 上传 / 编辑课程 -->
        <template v-if="coursePanel === 'upload'">
          <section class="ax-card">
            <div class="ax-card-head"><div><h3>基础信息</h3><p>上传并解析课程文档后会先自动回填，之后还能手动改。</p></div></div>
            <div class="course-basic">
              <aside class="course-cover">
                <div class="course-cover-preview" role="button" tabindex="0" title="点击放大预览" :style="adminCourseCoverStyle" @click="showAdminCourseCoverPreview = true" @keydown.enter.prevent="showAdminCourseCoverPreview = true">
                  <span v-if="!adminCourseForm.cover">{{ adminCourseForm.title || '课程封面预览' }}</span>
                </div>
                <input ref="adminCoverFileInput" class="course-file-input" type="file" accept="image/png,image/jpeg,image/webp" @change="handleAdminCourseCoverFile" />
                <div class="course-cover-actions">
                  <button type="button" class="ax-btn is-sm" @click="adminCoverFileInput?.click()">上传封面图</button>
                  <button type="button" class="ax-btn is-sm is-soft" :disabled="adminCourseCoverGenerating" @click="generateAdminCourseCover">{{ adminCourseCoverGenerating ? '生成中…' : 'AI 生成封面' }}</button>
                </div>
                <small class="ax-hint">{{ adminCourseForm.coverFileName || '建议 16:9，支持 JPG、PNG、WEBP' }}</small>
                <details class="api-details course-cover-prompt">
                  <summary><AdminIcon name="chevron" plain class="api-details-icon" />封面提示词</summary>
                  <label class="ax-switch course-cover-source">
                    <input v-model="adminCourseForm.useParsedCoverPrompt" type="checkbox" /><i></i>
                    <span>用解析文档里提取的提示词</span>
                  </label>
                  <textarea v-model.trim="adminCourseForm.coverPrompt" class="ax-textarea" rows="3" placeholder="也可以自己写封面图提示词"></textarea>
                  <button type="button" class="ax-btn is-sm" :disabled="adminCourseCoverGenerating" @click="generateAdminCourseCover">按这段提示词生成</button>
                </details>
              </aside>

              <div class="ax-form course-basic-fields">
                <label class="ax-field ax-span-all"><span>课题名称</span><input v-model="adminCourseForm.title" placeholder="上传课程文档后会自动识别并填入" /></label>
                <div class="ax-field"><span>课程类型</span>
                  <div class="course-cat">
                    <button type="button" class="course-cat-trigger" :aria-expanded="showCourseCategoryDropdown" @click="showCourseCategoryDropdown = !showCourseCategoryDropdown">
                      <span>{{ selectedAdminCategoryLabel }}</span><AdminIcon name="chevron" plain class="course-cat-caret" />
                    </button>
                    <div v-if="showCourseCategoryDropdown" class="course-cat-menu">
                      <button type="button" class="course-cat-option is-custom" @click="selectCustomAdminCategory"><AdminIcon name="plus" plain /><span>自定义类型</span></button>
                      <button v-for="item in categoryOptions" :key="item.value" type="button" class="course-cat-option" :class="{ 'is-active': adminCourseForm.category === item.value }" @click="selectAdminCategory(item)">
                        <span>{{ item.label }}</span>
                        <i role="button" tabindex="0" title="删除这个课程类型" @click.stop="deleteCourseCategory(item)" @keydown.enter.stop.prevent="deleteCourseCategory(item)"><AdminIcon name="close" plain /></i>
                      </button>
                    </div>
                    <input v-if="adminCourseForm.category === customCourseCategoryValue" v-model.trim="adminCourseCustomCategoryName" class="ax-input course-cat-custom" placeholder="输入新的课程类型名称，回车保存" @keydown.enter.prevent="saveCustomAdminCategory" @blur="saveCustomAdminCategory" />
                  </div>
                </div>
                <label class="ax-field"><span>难度 / 适龄</span><input v-model="adminCourseForm.difficulty" placeholder="例如：少儿基础 · 8-10岁" /></label>
                <div class="ax-field ax-span-all"><span>授权给权限组</span>
                  <el-select v-model="adminCourseForm.authorizedGroupIds" class="course-group-select" multiple collapse-tags collapse-tags-tooltip placeholder="选择能使用这门课的权限组">
                    <el-option v-for="group in enabledPermissionGroups" :key="group.id" :label="group.name" :value="group.id" />
                  </el-select>
                  <small v-if="!enabledPermissionGroups.length">还没有启用的权限组，可以先到「账号权限 → 权限组」里新建。</small>
                </div>
                <label class="ax-field ax-span-all"><span>课程简介</span><textarea v-model="adminCourseForm.description" rows="3" placeholder="写几句这门课学什么、做什么"></textarea></label>
              </div>
            </div>
          </section>

          <div class="ax-grid-2">
            <section class="ax-card">
              <div class="ax-card-head"><div><h3>课程媒体</h3><p>用户端实际播放和查看的资源。</p></div></div>
              <div class="ax-rows">
                <div class="ax-row">
                  <span class="ax-row-main"><strong>课程视频</strong><small>{{ adminCourseForm.videoFileName || '支持 MP4 / MOV' }}</small></span>
                  <input ref="adminVideoFileInput" class="course-file-input" type="file" accept="video/*" @change="handleAdminVideoAssetFile" />
                  <button type="button" class="ax-btn is-sm" @click="adminVideoFileInput?.click()">{{ adminCourseForm.videoFileName ? '换一个' : '上传视频' }}</button>
                </div>
                <div class="ax-row">
                  <span class="ax-row-main"><strong>PDF 课件</strong><small>{{ adminCourseForm.pptFileName || '用户端按页查看' }}</small></span>
                  <input ref="adminPptFileInput" class="course-file-input" type="file" accept=".pdf,application/pdf" @change="handleAdminPptAssetFile" />
                  <button type="button" class="ax-btn is-sm" @click="adminPptFileInput?.click()">{{ adminCourseForm.pptFileName ? '换一个' : '上传课件' }}</button>
                </div>
              </div>
              <label class="ax-field course-video-url"><span>或者填视频地址</span><input v-model.trim="adminCourseForm.videoUrl" placeholder="https://cdn.example.com/course/video.mp4" /></label>
            </section>

            <section class="ax-card">
              <div class="ax-card-head"><div><h3>课程解析文档（可选）</h3><p>用来自动填写课程信息、选择题和封面提示词。</p></div></div>
              <input ref="adminDocumentFileInput" class="course-file-input" type="file" accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" @change="handleAdminCourseDocumentFile" />
              <div class="course-doc-actions">
                <button type="button" class="ax-btn is-sm" @click="adminDocumentFileInput?.click()">{{ adminCourseForm.documentFileName ? '换一个文档' : '上传文档' }}</button>
                <button type="button" class="ax-btn is-sm is-primary" :disabled="!adminCourseForm.documentFileName || adminCourseDocumentParsing" @click="parseAdminCourseDocument">{{ adminCourseDocumentParsing ? '解析中…' : '解析文档' }}</button>
              </div>
              <small class="ax-hint">{{ adminCourseForm.documentFileName || '支持 PDF / Word / TXT' }}</small>
              <div class="course-doc-status" :class="adminCourseForm.documentParseStatus.state">
                <strong>{{ adminCourseForm.documentParseStatus.message }}</strong>
                <span v-if="adminCourseForm.documentParseStatus.textLength">读到 {{ adminCourseForm.documentParseStatus.textLength }} 字 · 识别字段 {{ adminCourseForm.documentParseStatus.fieldCount }} 项 · 选择题 {{ adminCourseForm.documentParseStatus.questionCount }} 道</span>
                <em v-if="adminCourseForm.documentParseStatus.preview">{{ adminCourseForm.documentParseStatus.preview }}</em>
              </div>
            </section>
          </div>

          <section class="ax-card">
            <div class="ax-card-head">
              <div><h3>课程问答题 <small class="api-head-count">{{ adminCourseForm.questions.length }} 道</small></h3><p>解析文档会自动生成，也可以手动加；点圆点选正确答案。</p></div>
              <button type="button" class="ax-btn is-sm" @click="addAdminQuestion"><AdminIcon name="plus" plain />新建题目</button>
            </div>
            <div v-if="adminCourseForm.questions.length" class="course-questions">
              <article v-for="(question, index) in adminCourseForm.questions" :key="`admin-question-${index}`" class="course-question">
                <div class="course-question-head">
                  <span class="course-question-no">{{ index + 1 }}</span>
                  <input v-model.trim="question.title" class="ax-input" placeholder="输入题目，例如：门头设计最需要突出什么？" :aria-label="`第 ${index + 1} 题题目`" />
                  <button type="button" class="ax-btn is-sm is-danger" title="删除这道题" @click="removeAdminQuestion(index)">删除</button>
                </div>
                <div class="course-question-options">
                  <label v-for="(label, optionIndex) in questionOptionLabels" :key="label" class="course-option" :class="{ 'is-answer': question.answer === label }">
                    <input v-model="question.answer" type="radio" :value="label" :aria-label="`选 ${label} 为正确答案`" />
                    <b>{{ label }}</b>
                    <input v-model.trim="question.options[optionIndex]" class="course-option-input" :placeholder="`${label} 选项内容`" />
                  </label>
                </div>
              </article>
            </div>
            <div v-else class="ax-empty is-compact"><strong>还没有题目</strong><span>解析课程文档后会自动出现，也可以点「新建题目」自己加。</span></div>
          </section>

          <div class="course-save-bar">
            <span class="ax-hint">{{ editingAdminCourseId ? '正在编辑已有课程，保存后覆盖原来的内容。' : '保存后课程出现在课程列表里。' }}</span>
            <button type="button" class="ax-btn" @click="coursePanel = 'bulk'">返回列表</button>
            <button type="button" class="ax-btn is-primary" @click="createAdminCourse">保存到课程库</button>
          </div>

          <el-dialog v-model="showAdminCourseCoverPreview" class="ax-dialog" title="课程封面图预览" width="min(900px, 92vw)" align-center>
            <div class="course-cover-preview is-large" :style="adminCourseCoverStyle">
              <span v-if="!adminCourseForm.cover">{{ adminCourseForm.title || '课程封面预览' }}</span>
            </div>
          </el-dialog>
        </template>

        <!-- 课程列表：封面卡片墙 -->
        <template v-else-if="coursePanel === 'bulk'">
          <div class="ax-stats">
            <div v-for="item in adminCourseStats" :key="item.label" class="ax-stat"><span>{{ item.label }}</span><strong>{{ item.value }}</strong><small>{{ item.note }}</small></div>
          </div>
          <p v-if="!serverAuthMode" class="ax-note is-warn">演示模式（没有连后端）：课程只保存在这台电脑的浏览器里，换电脑、换浏览器或清理缓存后会看不到。</p>
          <p v-if="courseStore.loadError" class="ax-note is-bad">{{ courseStore.loadError }}</p>
          <div class="course-toolbar">
            <div class="ax-search"><input v-model="courseKeyword" type="search" placeholder="搜索课程名称" aria-label="搜索课程名称" /></div>
            <label v-if="filteredAdminCourses.length" class="ax-chip-check">
              <input type="checkbox" :checked="allAdminCoursesSelected" @change="toggleAllAdminCourses" />
              <span>全选</span>
            </label>
            <span class="ax-grow"></span>
            <template v-if="selectedAdminCourseIds.length">
              <span class="ax-count">已选 {{ selectedAdminCourseIds.length }} 门</span>
              <select class="ax-select course-batch" aria-label="批量操作" @change="handleAdminCourseBatchAction">
                <option value="">批量操作…</option>
                <option value="publish">批量发布</option>
                <option value="archive">批量转草稿</option>
                <option value="delete">批量删除</option>
              </select>
            </template>
            <span v-else class="ax-count">共 {{ filteredAdminCourses.length }} 门</span>
          </div>

          <div v-if="filteredAdminCourses.length" class="cl-grid">
            <article
              v-for="course in filteredAdminCourses"
              :key="course.id"
              class="cl-card"
              :class="{ 'is-selected': selectedAdminCourseIds.includes(course.id) }"
            >
              <div class="cl-card-cover" :style="{ background: course.cover || undefined }">
                <span v-if="!String(course.cover || '').startsWith('url(')" class="cl-card-cover-title">{{ course.title || '趣味设计课程' }}</span>
                <label class="cl-card-check" :title="selectedAdminCourseIds.includes(course.id) ? '取消选择' : '选择这门课'">
                  <input type="checkbox" :checked="selectedAdminCourseIds.includes(course.id)" :aria-label="`选择 ${course.title}`" @change="toggleAdminCourse(course.id)" />
                  <i aria-hidden="true"></i>
                </label>
                <span class="ax-pill cl-card-status" :class="course.status === 'published' ? 'is-ok' : 'is-muted'">{{ course.status === 'published' ? '已发布' : '草稿' }}</span>
              </div>
              <div class="cl-card-body">
                <button type="button" class="cl-card-title" :title="`编辑 ${course.title}`" @click="editAdminCourse(course)">{{ course.title || '趣味设计课程' }}</button>
                <p class="cl-card-meta">{{ categoryLabel(course.category) }} · {{ course.difficulty || course.ageRange || '未填写适龄' }}</p>
                <div class="ax-tags">
                  <span class="ax-tag" :class="courseHasVideo(course) ? 'is-info' : ''" :title="course.videoFileName || ''">{{ courseHasVideo(course) ? '有视频' : '无视频' }}</span>
                  <span class="ax-tag" :title="course.pptFileName || ''">{{ coursePptLabel(course) }}</span>
                </div>
                <p class="cl-card-groups" :title="courseCardAuthText(course)">
                  <AdminIcon name="accounts" size="sm" />
                  <span>{{ courseCardAuthText(course) }}</span>
                </p>
              </div>
              <footer class="cl-card-foot">
                <small>{{ course.ownerName || '管理员' }} · {{ formatDate(course.updatedAt || course.createdAt) }}</small>
                <div class="cl-card-actions">
                  <button type="button" class="ax-btn is-sm is-soft" @click="selectedAuthCourseId = course.id; coursePanel = 'auth'">授权</button>
                  <button type="button" class="ax-btn is-sm" @click="editAdminCourse(course)">编辑</button>
                  <button type="button" class="ax-btn is-sm is-ghost" @click="duplicateAdminCourse(course)">复制</button>
                  <button type="button" class="ax-btn is-sm is-danger" @click="deleteAdminCourse(course.id)">删除</button>
                </div>
              </footer>
            </article>
          </div>
          <div v-else class="ax-card">
            <div class="ax-empty">
              <strong>{{ courseStore.courses.length ? '没有符合条件的课程' : '课程库还是空的' }}</strong>
              <span>{{ courseStore.courses.length ? '换个关键词试试。' : '点「上传新课程」开始。' }}</span>
            </div>
          </div>
        </template>

        <!-- 课程授权 -->
        <section v-else class="ax-split course-auth">
          <div class="ax-card">
            <div class="ax-section-title">选择课程</div>
            <div class="ax-list course-auth-list">
              <button v-for="course in courseStore.courses" :key="course.id" type="button" class="ax-list-item" :class="{ 'is-active': selectedAuthCourseId === course.id }" @click="selectedAuthCourseId = course.id">
                <span class="ax-cell-main"><strong>{{ course.title }}</strong><small>{{ courseAuthSummary(course) }}</small></span>
              </button>
            </div>
            <p v-if="!courseStore.courses.length" class="ax-hint">课程库暂无课程，请先上传课程。</p>
          </div>
          <div v-if="selectedAuthCourse" class="ax-card">
            <div class="ax-card-head">
              <div><h3>{{ selectedAuthCourse.title }}</h3><p>上传者：{{ selectedAuthCourse.ownerName || '管理员' }} · 当前授权：{{ courseCardAuthText(selectedAuthCourse) }}</p></div>
            </div>
            <div class="ax-section-title">授权给权限组</div>
            <div v-if="enabledPermissionGroups.length" class="ax-option-grid">
              <label v-for="group in enabledPermissionGroups" :key="group.id" class="ax-option">
                <input v-model="selectedAuthGroupIds" type="checkbox" :value="group.id" />
                <span><strong>{{ group.name }}</strong><small>{{ group.memberIds.length }} 名成员{{ group.description ? ` · ${group.description}` : '' }}</small></span>
              </label>
            </div>
            <p v-else class="ax-hint">还没有启用的权限组，可以先到「账号权限 → 权限组」里新建。</p>
            <div class="ax-section-title">小画家能看到</div>
            <div class="ax-rows">
              <div class="ax-row">
                <span class="ax-row-main"><strong>全机构的小画家</strong><small>打开后本机构所有小画家都能在课程中心看到这门课。</small></span>
                <label class="ax-switch"><input v-model="selectedAuthOrganization" type="checkbox" aria-label="全机构的小画家都能看到" /><i></i></label>
              </div>
            </div>
            <template v-if="!selectedAuthOrganization">
              <div v-if="courseAuthClassOptions.length" class="ax-option-grid course-auth-classes">
                <label v-for="item in courseAuthClassOptions" :key="item.id" class="ax-option">
                  <input v-model="selectedAuthClassIds" type="checkbox" :value="item.id" />
                  <span><strong>{{ item.name }}</strong><small>{{ item.campusName || '班级' }}</small></span>
                </label>
              </div>
              <p v-else class="ax-hint">还没有班级，可以先到「账号权限 → 分部与班级」里新建；也可以只授权给讲师，由讲师发给自己的班级。</p>
            </template>
            <p class="ax-note is-plain course-auth-note">课程要是「已发布」状态小画家才看得到（保存授权会同时发布）。拿到授权的讲师可以在讲师端使用这门课；要发给自己的班级，讲师复制一份再发放。</p>
            <p v-if="courseAuthError" class="ax-note is-bad">{{ courseAuthError }}</p>
            <div class="ax-form-actions"><button type="button" class="ax-btn is-primary" :disabled="courseAuthSaving" @click="saveCourseAuthorization">{{ courseAuthSaving ? '保存中…' : '保存授权' }}</button></div>
          </div>
        </section>
      </section>

      <section v-else-if="activeNav === 'h5ReportTemplates'" class="ax-page h5c-page">
        <header class="ax-head">
          <div>
            <h2>H5报告中心</h2>
            <p>给每个版本绑定写报告文案的智能体，审核用户生成的 H5 报告，审核通过后才能分享。</p>
          </div>
          <div class="ax-head-actions">
            <label class="h5c-edition">
              <span>配置版本</span>
              <select v-model="selectedH5EditionId" class="ax-select" aria-label="当前配置版本" @change="selectH5Edition(selectedH5EditionId)">
                <option v-for="edition in h5EditionOptions" :key="edition.id" :value="edition.id">{{ edition.label }} · {{ edition.age }}</option>
              </select>
            </label>
          </div>
        </header>

        <nav class="ax-tabs" aria-label="H5报告中心分类">
          <button
            v-for="tab in h5CenterTabs.filter((item) => !item.retired)"
            :key="tab.id"
            type="button"
            class="ax-tab"
            :class="{ 'is-active': h5CenterTab === tab.id }"
            @click="switchH5CenterTab(tab.id)"
          >{{ tab.label }}<em v-if="tab.id === 'audit' && h5ReportCount('pending')" class="ax-tab-count is-alert">{{ h5ReportCount('pending') }}</em></button>
        </nav>

        <div class="ax-note is-plain h5c-retired">
          <AdminIcon name="h5WorkflowLibrary" size="sm" />
          <span><b>旧方案已停用：</b>{{ h5CenterTabs.filter((item) => item.retired).map((item) => item.label).join(' / ') }} 不再维护，配置和数据都原样保留，需要时可以再启用。报告画面现在以「报告工作流库」里的无限画布工作流为准。</span>
          <button type="button" class="ax-btn is-sm is-soft" @click="openH5WorkflowLibrary">打开报告工作流库</button>
        </div>

        <template v-if="h5CenterTab === 'strategies'">
          <section class="h5-strategy-page">
            <div class="h5-section-heading"><div><h3>H5 报告生成方案</h3><p>方案 1 和方案 2 独立运行，测试完成后可停用其中一种，不影响历史报告。</p></div><span class="h5-strategy-note">当前编辑：{{ selectedH5Strategy?.name || '未选择' }}</span></div>
            <div class="h5-strategy-grid">
              <button v-for="strategy in h5ReportCenterConfig.strategies" :key="strategy.id" type="button" class="h5-strategy-card" :class="{ active: selectedH5StrategyId === strategy.id }" @click="selectedH5StrategyId = strategy.id">
                <span class="h5-strategy-index">{{ strategy.id === 'h5-standard' ? '1' : '2' }}</span><span><strong>{{ strategy.name }}</strong><small>{{ strategy.type === 'canvas-workflow' ? '后台工作流生成视觉图 + 固定 H5 面板排版' : '现有结构化 H5 渲染器' }}</small></span><em :class="strategy.status">{{ strategy.type === 'canvas-workflow' && strategy.executionReady === false ? '待测试发布' : h5StrategyStatusLabel(strategy.status) }}</em>
              </button>
            </div>
            <div v-if="selectedH5Strategy" class="h5-strategy-editor">
              <div class="h5-form-grid h5-polished-form">
                <label>方案名称<input v-model.trim="selectedH5Strategy.name" /></label>
                <label>运行状态<select v-model="selectedH5Strategy.status"><option value="enabled">已启用</option><option value="testing">测试中</option><option value="disabled">已停用</option></select></label>
                <label class="h5-inline-check"><span>用户端可选择</span><input v-model="selectedH5Strategy.studentSelectable" type="checkbox" /></label>
                <label v-if="selectedH5Strategy.type === 'canvas-workflow'" class="h5-inline-check"><span>工作流已测试发布</span><input v-model="selectedH5Strategy.executionReady" type="checkbox" /></label>
                <label>渲染器<select v-model="selectedH5Strategy.rendererKey"><option value="existing-h5-renderer">现有 H5 渲染器</option><option value="canvas-workflow-renderer">无限画布工作流渲染器</option></select></label>
                <label v-if="selectedH5Strategy.type === 'canvas-workflow'">无限画布工作流 ID<input v-model.trim="selectedH5Strategy.workflowId" placeholder="创建工作流后自动填写" /></label>
                <label v-if="selectedH5Strategy.type === 'canvas-workflow'">工作流版本<input v-model.number="selectedH5Strategy.workflowVersion" type="number" min="0" /></label>
              </div>
              <div v-if="selectedH5Strategy.type === 'canvas-workflow'" class="h5-allowed-templates"><strong>绑定的 H5 模板</strong><div><label v-for="template in h5TemplateStore.templates" :key="template.id" :class="{ selected: selectedH5Strategy.boundTemplateIds.includes(template.id) }"><input v-model="selectedH5Strategy.boundTemplateIds" type="checkbox" :value="template.id" /><span :style="h5TemplateSwatchStyle(template)"></span>{{ template.name }}</label></div></div>
              <div class="h5-strategy-actions"><button v-if="selectedH5Strategy.type === 'canvas-workflow'" type="button" :disabled="h5WorkflowOpening" @click="openH5StrategyWorkflow">{{ h5WorkflowOpening ? '正在准备工作流…' : selectedH5Strategy.workflowId ? '打开无限画布工作流' : '创建并打开无限画布' }}</button><button v-if="selectedH5Strategy.type === 'canvas-workflow'" type="button" @click="openH5WorkflowLibrary">管理工作流库</button><span v-if="selectedH5Strategy.type === 'canvas-workflow'">H5 用户端使用固定报告面板，不需要配置 AI 玩法用户页面。请在无限画布内保存、真实测试并发布，再返回此处开放方案 2。</span></div>
            </div>
          </section>
        </template>

        <template v-else-if="h5CenterTab === 'editions'">
          <div class="h5-edition-grid">
            <button v-for="edition in h5EditionOptions" :key="edition.id" type="button" class="h5-edition-card" :class="{ active: selectedH5EditionId === edition.id, empty: h5EditionConfig(edition.id).status === 'unconfigured' }" @click="selectH5Edition(edition.id)">
              <span class="h5-edition-icon"><AdminIcon :name="edition.icon" size="lg" /></span>
              <span><strong>{{ edition.label }}</strong><small>{{ edition.age }}</small></span>
              <em :class="h5EditionConfig(edition.id).status">{{ h5EditionStatusLabel(h5EditionConfig(edition.id).status) }}</em>
              <b>{{ h5EditionSummary(edition.id) }}</b>
            </button>
          </div>

          <section class="h5-edition-workspace">
            <div class="h5-edition-settings">
              <div class="h5-section-heading"><div><h3>{{ selectedH5Edition.label }} H5 配置</h3><p>{{ selectedH5Edition.age }} · {{ selectedH5Edition.description }}</p></div><label class="h5-status-select">状态<select v-model="selectedH5EditionConfig.status"><option value="enabled">已启用</option><option value="unconfigured">未配置</option><option value="disabled">已停用</option></select></label></div>
              <div class="h5-setting-list">
                <label>页面类型<select v-model="selectedH5EditionConfig.rendererKey"><option value="">暂不绑定</option><option value="starter-simple">简化横屏创作报告</option><option value="pro-workbench">专业H5创作工作台</option></select></label>
                <label>默认生成方案<select v-model="selectedH5EditionConfig.defaultStrategyId"><option v-for="strategy in h5ReportCenterConfig.strategies" :key="strategy.id" :value="strategy.id">{{ strategy.name }}</option></select></label>
                <label>默认模板<select v-model="selectedH5EditionConfig.defaultTemplateId"><option value="">暂不设置</option><option v-for="template in h5TemplateStore.templates" :key="template.id" :value="template.id">{{ template.name }}</option></select></label>
                <label>文案策略<select v-model="selectedH5EditionConfig.contentProfile"><option value="starter-self-narration">用户第一人称创作自述</option><option value="story-narration">故事讲述型报告</option><option value="advanced-portfolio">成长作品集型报告</option><option value="pro-designer-story">专业设计师讲解型报告</option></select></label>
                <label>审核策略<select v-model="selectedH5EditionConfig.auditPolicy"><option value="h5-default-auto">自动审核通过后发布</option><option value="h5-manual">生成后进入人工审核</option></select></label>
              </div>
              <div class="h5-allowed-templates"><strong>允许使用的生成方案</strong><div><label v-for="strategy in h5ReportCenterConfig.strategies" :key="strategy.id" :class="{ selected: selectedH5EditionConfig.allowedStrategyIds.includes(strategy.id) }"><input v-model="selectedH5EditionConfig.allowedStrategyIds" type="checkbox" :value="strategy.id" /><span class="h5-strategy-dot"></span>{{ strategy.name }}</label></div></div>
              <div class="h5-choice-control"><div><strong>用户自主选择总开关</strong><small>关闭时用户端统一智能选择；开启后讲师可按课程决定是否允许用户选择。</small></div><button type="button" :class="{ on: selectedH5EditionConfig.studentCanChoose }" @click="selectedH5EditionConfig.studentCanChoose = !selectedH5EditionConfig.studentCanChoose"><i></i></button></div>
              <div class="h5-allowed-templates"><strong>允许使用的模板</strong><div><label v-for="template in h5TemplateStore.templates" :key="template.id" :class="{ selected: selectedH5EditionConfig.allowedTemplateIds.includes(template.id) }"><input v-model="selectedH5EditionConfig.allowedTemplateIds" type="checkbox" :value="template.id" /><span :style="h5TemplateSwatchStyle(template)"></span>{{ template.name }}</label></div></div>
            </div>
            <aside class="h5-live-preview" :style="h5TemplatePreviewStyle"><div class="h5-preview-title"><strong>H5实时预览</strong><span>横屏平板</span></div><div class="h5-tablet-frame"><div class="h5-tablet-cover"><small>{{ h5LayoutLabel(h5TemplateForm.layout) }}</small><h3>我的奇妙<br />未来城市</h3><p>林子墨 · {{ selectedH5Edition.label }}</p><button type="button">开始探索</button></div></div><div class="h5-preview-dots"><i class="active"></i><i></i><i></i><i></i></div></aside>
          </section>
        </template>


        <template v-else-if="h5CenterTab === 'style'">
          <H5TemplateStudio ref="h5TemplateStudio" :template="h5TemplateForm" :templates="h5TemplateStore.templates" @select-template="selectH5TemplateSafely(h5TemplateStore.byId($event))" @saved="onH5StudioSaved" />
          <details class="h5-legacy-parameters"><summary>高级参数与原版预设</summary>
          <div class="h5-style-workspace">
            <section class="h5-template-list h5-style-list">
              <div class="h5-list-heading"><strong>风格模板</strong><button type="button" @click="startCreateH5Template">新建模板</button></div>
              <label class="h5-search-input"><AdminIcon name="search" plain /><input v-model="h5TemplateKeyword" placeholder="搜索模板" /></label>
              <article v-for="template in filteredH5Templates" :key="template.id" :class="{ active: selectedH5TemplateId === template.id }" @click="selectH5TemplateSafely(template)"><img v-if="template.coverImage" :src="template.coverImage" alt="" /><i v-else :style="h5TemplateSwatchStyle(template)"></i><div><strong>{{ template.name }}</strong><span>{{ h5TemplateEditionText(template.id) }} · {{ h5StatusLabel(template.status) }}</span></div><b v-if="selectedH5TemplateId === template.id"><AdminIcon name="check" plain /></b></article>
              <button type="button" class="h5-copy-template" :disabled="!selectedH5TemplateId" @click="duplicateH5Template">复制当前模板</button>
            </section>
            <section class="h5-style-editor">
              <div class="h5-section-heading"><div><h3>{{ h5TemplateForm.name || '新的 H5 报告模板' }}</h3><p><b v-if="h5TemplateDirty" class="h5-unsaved">有未保存修改</b><span v-else>{{ h5StatusLabel(h5TemplateForm.status) }} · 当前草稿已保存</span></p></div><select v-model="h5TemplateForm.status"><option value="published">已发布</option><option value="draft">草稿</option><option value="disabled">停用</option></select></div>
              <div class="h5-style-steps"><button v-for="step in h5StyleSteps" :key="step.id" type="button" :class="{ active: h5StyleStep === step.id }" @click="h5StyleStep = step.id">{{ step.label }}</button></div>
              <div v-if="h5StyleStep === 'base'" class="h5-form-grid h5-polished-form"><label>模板名称<input v-model.trim="h5TemplateForm.name" /></label><label>所属生成方案<select v-model="h5TemplateForm.strategyId"><option v-for="strategy in h5ReportCenterConfig.strategies" :key="strategy.id" :value="strategy.id">{{ strategy.name }}</option></select></label><label>内置版式<select v-model="h5TemplateForm.layout"><option v-for="item in h5ReportLayouts" :key="item.value" :value="item.value">{{ item.label }}</option></select></label><label>字体风格<input v-model="h5TemplateForm.fontFamily" /></label><label>内容密度<select v-model="h5TemplateForm.contentDensity"><option value="relaxed">舒展</option><option value="standard">标准</option><option value="compact">紧凑</option></select></label><label>最少页面<select v-model.number="h5TemplateForm.minPages"><option v-for="count in [6,7,8]" :key="count" :value="count">{{ count }}页</option></select></label><label>最多页面<select v-model.number="h5TemplateForm.maxPages"><option v-for="count in [8,10,12]" :key="count" :value="count">{{ count }}页</option></select></label><label>主色<input v-model="h5TemplateForm.theme.primary" type="color" /></label><label>辅助色<input v-model="h5TemplateForm.theme.secondary" type="color" /></label><label>强调色<input v-model="h5TemplateForm.theme.accent" type="color" /></label><label>背景色<input v-model="h5TemplateForm.theme.background" type="color" /></label></div>
              <div v-if="h5StyleStep === 'base' && h5TemplateForm.layout === 'product-design-story'" class="h5-product-story-hint"><strong>产品设计故事模板</strong><p>用户的最终作品、草图、AI方案、3D与场景图会自动填入对应页面；模板只控制蓝图背景、数字分身、页面结构与6–12页扩展规则。</p></div>
              <div v-else-if="h5StyleStep === 'cover'" class="h5-cover-editor"><div v-if="h5TemplateForm.coverImage" class="h5-cover-image" :style="{ backgroundImage: `url(${h5TemplateForm.coverImage})` }"></div><div v-else class="h5-cover-empty">还没有封面图</div><label class="h5-upload-button">上传模板封面<input type="file" accept="image/*" @change="handleH5CoverUpload" /></label><label>封面图片地址<input v-model="h5TemplateForm.coverImage" placeholder="/assets/h5-report/cover.png" /></label><p>封面同时用于后台模板列表和用户端风格选择，不会覆盖用户自己的作品图片。</p></div>
              <div v-else-if="h5StyleStep === 'modules'" class="h5-module-editor"><div class="h5-element-switches"><strong>页面元素</strong><label v-for="item in h5VisualElements" :key="item.key"><span>{{ item.label }}</span><input v-model="h5TemplateForm.displayOptions[item.key]" type="checkbox" /></label></div><div class="h5-module-config"><strong>章节顺序与显示</strong><div class="h5-module-chips"><label v-for="(key, index) in h5TemplateForm.moduleOrder" :key="key"><input type="checkbox" :checked="!h5TemplateForm.hiddenModules.includes(key)" @change="toggleH5Module(key)" /><span>{{ h5ModuleLabel(key) }}</span><button type="button" :disabled="index === 0" aria-label="上移" @click="moveH5Module(index, -1)"><AdminIcon name="arrowUp" plain /></button><button type="button" :disabled="index === h5TemplateForm.moduleOrder.length - 1" aria-label="下移" @click="moveH5Module(index, 1)"><AdminIcon name="arrowDown" plain /></button></label></div></div><div v-if="h5TemplateForm.layout === 'product-design-story'" class="h5-product-page-designs"><strong>产品故事页面预设</strong><p>这里只调整稳定的预设版式，不提供自由拖拽；用户作品仍由系统匹配或由用户在图框中替换。</p><div class="h5-product-page-design-grid"><article v-for="item in productStoryPageOptions" :key="item.key"><label><span>{{ item.label }}</span><input v-model="ensureProductStoryPageDesign(item.key).enabled" type="checkbox" /></label><label>版式<select v-model="ensureProductStoryPageDesign(item.key).variant"><option v-for="variant in item.variants" :key="variant.value" :value="variant.value">{{ variant.label }}</option></select></label><label>背景<select v-model="ensureProductStoryPageDesign(item.key).backgroundStyle"><option v-for="background in item.backgrounds" :key="background.value" :value="background.value">{{ background.label }}</option></select></label><label>用户角色<select v-model="ensureProductStoryPageDesign(item.key).characterPose"><option v-for="pose in productStoryCharacterPoses" :key="pose.value" :value="pose.value">{{ pose.label }}</option></select></label></article></div></div></div>
              <div v-else class="h5-poster-editor"><div class="h5-poster-preview" :style="{ backgroundImage: `url(${h5TemplateForm.posterConfig.backgroundImage || h5TemplateForm.coverImage})` }"><span>我的创作报告</span><strong>林同学</strong><i>扫码查看H5</i></div><div class="h5-form-grid"><label>海报背景图<input v-model="h5TemplateForm.posterConfig.backgroundImage" placeholder="默认使用模板封面" /></label><label>标题对齐<select v-model="h5TemplateForm.posterConfig.titleAlign"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label><label>二维码位置<select v-model="h5TemplateForm.posterConfig.qrPosition"><option value="bottom-right">右下角</option><option value="bottom-left">左下角</option></select></label><label><span>显示用户信息</span><input v-model="h5TemplateForm.posterConfig.showStudentInfo" type="checkbox" /></label><label><span>显示平台品牌</span><input v-model="h5TemplateForm.posterConfig.showBrand" type="checkbox" /></label><label>官网按钮文字<input v-model="h5TemplateForm.officialButtonText" /></label><label>官网地址<input v-model="h5TemplateForm.officialUrl" placeholder="https://" /></label></div></div>
              <footer class="h5-editor-actions"><button type="button" @click="cancelH5TemplateEdit">取消修改</button><button v-if="selectedH5TemplateId && !h5TemplateStore.byId(selectedH5TemplateId)?.builtIn" type="button" class="danger" @click="deleteH5Template">删除自定义模板</button><button type="button" class="admin-primary-btn" :disabled="h5DraftSaving" @click="saveH5TemplateDraft">{{ h5DraftSaving ? '保存中…' : '保存模板草稿' }}</button></footer>
            </section>
            <aside class="h5-live-preview h5-style-preview"><div class="h5-preview-title"><strong>真实H5预览</strong><div><button type="button" :class="{ active: h5PreviewDevice === 'tablet' }" @click="h5PreviewDevice = 'tablet'">平板</button><button type="button" :class="{ active: h5PreviewDevice === 'phone' }" @click="h5PreviewDevice = 'phone'">手机</button></div></div><H5ReportRenderer v-model="h5PreviewPage" :template="h5TemplateForm" :pages="h5PreviewPages" :device="h5PreviewDevice" student-name="林同学" :edition-label="selectedH5Edition.label" /><button type="button" class="h5-student-test" @click="openH5StudentTest">在用户端测试当前模板</button></aside>
          </div>
          </details>
        </template>

        <template v-else-if="h5CenterTab === 'agent'">
          <section class="ax-card h5c-agent">
            <div class="ax-card-head">
              <div>
                <h3>{{ selectedH5Edition.label }}正在使用的报告智能体</h3>
                <p>这里显示当前版本实际绑定、正在生效的智能体。模型、提示词和备用模型在「智能体配置」里统一维护。</p>
              </div>
              <span class="ax-pill" :class="{ 'is-ok': h5AgentBindingState.type === 'success', 'is-info': h5AgentBindingState.type === 'fallback', 'is-bad': h5AgentBindingState.type === 'error' }">{{ h5AgentBindingState.label }}</span>
            </div>

            <div class="h5c-facts">
              <article class="h5c-fact">
                <AdminIcon name="agents" size="lg" />
                <span class="h5c-fact-body">
                  <small>绑定智能体</small>
                  <strong>{{ selectedH5BoundAgent?.name || '尚未绑定' }}</strong>
                  <em :title="selectedH5BoundAgent ? h5AgentFlowLabel : ''">{{ selectedH5BoundAgent ? `应用流程：${h5AgentFlowLabel}` : '请先选择一个已启用的H5报告智能体' }}</em>
                </span>
              </article>
              <article class="h5c-fact">
                <AdminIcon name="text" size="lg" />
                <span class="h5c-fact-body">
                  <small>文案策略</small>
                  <strong>{{ h5ContentProfileLabel(selectedH5EditionConfig.contentProfile) }}</strong>
                  <em>随当前版本的H5报告生成请求生效</em>
                </span>
              </article>
              <article class="h5c-fact">
                <AdminIcon name="sparkles" size="lg" />
                <span class="h5c-fact-body">
                  <small>模型调用</small>
                  <strong class="ax-mono">{{ h5AgentModelLabel }}</strong>
                  <em>备用：{{ h5AgentFallbackLabel }}</em>
                </span>
              </article>
              <article class="h5c-fact">
                <AdminIcon name="clock" size="lg" />
                <span class="h5c-fact-body">
                  <small>最近保存</small>
                  <strong>{{ h5AgentSavedAt }}</strong>
                  <em :class="{ 'is-bad': selectedH5BoundAgent && selectedH5BoundAgent.status !== 'enabled' }">{{ selectedH5BoundAgent?.status === 'enabled' ? '智能体已启用，可供用户端调用' : '智能体状态异常，请更换或启用' }}</em>
                </span>
              </article>
            </div>

            <div class="h5c-bind">
              <label class="ax-field">
                <span>当前版本绑定智能体</span>
                <select v-model="selectedH5EditionConfig.agentId">
                  <option value="">不绑定，使用全局H5默认智能体</option>
                  <option v-if="selectedH5EditionConfig.agentId && !h5CompatibleAgents.some((agent) => agent.id === selectedH5EditionConfig.agentId)" :value="selectedH5EditionConfig.agentId" disabled>{{ reportAgents.some((agent) => agent.id === selectedH5EditionConfig.agentId) ? '当前绑定的智能体不是 H5 报告类型' : '原绑定的智能体已不存在' }}（请重新选择）</option>
                  <option v-for="agent in h5CompatibleAgents" :key="agent.id" :value="agent.id">{{ agent.name }} · {{ agent.status === 'enabled' ? '已启用' : '已停用' }}</option>
                </select>
                <small>更换后点页面底部「发布本次配置」，用户端才会用新的绑定。</small>
              </label>
              <div class="h5c-rules">
                <span>文案原则</span>
                <div class="ax-tags is-roomy">
                  <span class="ax-tag is-brand"><AdminIcon name="check" plain class="h5c-tag-icon" />用户第一人称</span>
                  <span class="ax-tag is-brand"><AdminIcon name="check" plain class="h5c-tag-icon" />保留用户原意</span>
                  <span class="ax-tag is-brand"><AdminIcon name="check" plain class="h5c-tag-icon" />不虚构创作过程</span>
                </div>
              </div>
            </div>

            <div class="ax-form-actions h5c-agent-actions">
              <button type="button" class="ax-btn" :disabled="!selectedH5BoundAgent || h5AgentTesting" @click="testCurrentH5Agent">{{ h5AgentTesting ? '测试生成中…' : '测试生成样例' }}</button>
              <button type="button" class="ax-btn is-primary" :disabled="!selectedH5BoundAgent" @click="editCurrentH5Agent">更换或编辑智能体</button>
            </div>
          </section>
        </template>

        <template v-else>
          <section class="ax-card is-flush h5c-audit">
            <div class="ax-card-head">
              <div><h3>H5报告审核与发布</h3><p>只有审核通过的报告才能生成分享链接。</p></div>
              <button type="button" class="ax-btn is-sm" :disabled="h5ReportsLoading" @click="loadH5Reports"><AdminIcon name="refresh" plain />刷新队列</button>
            </div>

            <div class="h5c-checks">
              <div class="h5c-check">
                <AdminIcon name="shield" />
                <span class="ax-row-main"><strong>文案安全检查</strong><small>敏感内容、不适龄表达与隐私信息</small></span>
                <span class="ax-pill is-ok">已启用</span>
              </div>
              <div class="h5c-check">
                <AdminIcon name="layers" />
                <span class="ax-row-main"><strong>素材完整度</strong><small>缺少素材时保留友好空状态</small></span>
                <span class="ax-pill is-ok">已启用</span>
              </div>
              <div class="h5c-check">
                <AdminIcon name="eye" tint="#ff9500" />
                <span class="ax-row-main"><strong>图片视频审核</strong><small>未接外部安全接口时进入人工复核</small></span>
                <span class="ax-pill is-warn">人工复核</span>
              </div>
            </div>

            <div class="ax-toolbar h5c-audit-bar">
              <div class="ax-seg" aria-label="按状态筛选">
                <button v-for="item in h5AuditFilters" :key="item.value" type="button" :class="{ 'is-active': h5AuditFilter === item.value }" @click="h5AuditFilter = item.value">{{ item.label }}<em class="h5c-seg-count">{{ h5ReportCount(item.value) }}</em></button>
              </div>
              <span class="ax-grow"></span>
              <span class="ax-count">共 {{ filteredH5Reports.length }} 份</span>
            </div>

            <div v-if="h5ReportsLoading" class="ax-empty is-compact"><strong>正在读取审核队列…</strong></div>
            <div v-else-if="!filteredH5Reports.length" class="ax-empty"><strong>没有符合条件的H5报告</strong><span>用户生成报告后会出现在这里。</span></div>
            <div v-else class="h5c-reports">
              <article v-for="report in filteredH5Reports" :key="report.id" class="h5c-report">
                <span class="h5c-report-cover">
                  <img v-if="report.cover || report.templateSnapshot?.coverImage" :src="report.cover || report.templateSnapshot?.coverImage" alt="" />
                  <AdminIcon v-else name="report" size="lg" />
                </span>
                <span class="h5c-report-main">
                  <strong>{{ report.title }}</strong>
                  <small>{{ report.studentName || '用户' }} · {{ report.templateSnapshot?.name || report.h5TemplateId || '未命名模板' }}</small>
                  <small v-if="report.auditReason" class="h5c-report-reason" :title="report.auditReason">{{ report.auditReason }}</small>
                </span>
                <span class="ax-pill h5c-report-status" :class="{ 'is-ok': report.status === 'published', 'is-warn': report.status === 'pending', 'is-bad': report.status === 'rejected', 'is-muted': report.status === 'draft' || report.status === 'offline' }">{{ h5ReportStatusLabel(report.status) }}</span>
                <span class="h5c-report-actions">
                  <a v-if="report.shareToken && report.status === 'published'" class="ax-btn is-sm is-ghost" :href="`/h5-report/public/${report.shareToken}`" target="_blank" rel="noopener"><AdminIcon name="external" plain />查看分享页</a>
                  <button v-if="report.status !== 'published'" type="button" class="ax-btn is-sm is-primary" @click="auditH5Report(report.id, 'published')">通过并发布</button>
                  <button v-if="report.status === 'published'" type="button" class="ax-btn is-sm" @click="auditH5Report(report.id, 'offline')">下架</button>
                  <button v-if="['pending', 'draft'].includes(report.status)" type="button" class="ax-btn is-sm is-danger" @click="auditH5Report(report.id, 'rejected')">驳回</button>
                </span>
              </article>
            </div>
          </section>
        </template>

        <div class="ax-savebar">
          <span class="ax-hint">{{ h5CenterStatus }}</span>
          <button v-if="h5HasUnpublishedChanges" type="button" class="ax-btn" @click="discardH5DraftChanges">放弃未发布修改</button>
          <button type="button" class="ax-btn is-primary" :disabled="h5CenterSaving" @click="saveH5ReportCenter">{{ h5CenterSaving ? '发布中…' : '发布本次配置' }}</button>
        </div>
      </section>

      <H5WorkflowLibraryPanel v-else-if="activeNav === 'h5WorkflowLibrary'" @back="openH5ReportCenter" />

      <section v-else-if="activeNav === 'api'" class="ax-page api-page">
        <header class="ax-head">
          <div>
            <h2>API 配置</h2>
            <p>接入画图、视频、文字和 3D 的模型平台。密钥只保存在服务器上，页面不会显示明文。</p>
          </div>
          <div class="ax-head-actions">
            <template v-if="providerView === 'list'">
              <button type="button" class="ax-btn" @click="loadProviderConfig">刷新</button>
              <button type="button" class="ax-btn is-primary" @click="startCreateProvider(providerCategory)"><AdminIcon name="plus" plain />新建平台</button>
            </template>
            <button v-else type="button" class="ax-btn api-back-btn" @click="openProviderList()"><AdminIcon name="chevron" plain class="ax-icon-back" />返回平台列表</button>
          </div>
        </header>

        <nav class="ax-tabs" aria-label="API 分类">
          <button v-for="tab in apiCategoryTabs" :key="tab.value" type="button" class="ax-tab" :class="{ 'is-active': providerCategory === tab.value }" @click="openProviderList(tab.value)">
            {{ tab.label }}<em class="ax-tab-count">{{ tab.count }}</em>
          </button>
        </nav>

        <!-- 平台列表（2026-11-26 按功能重写：出图备用模型、平台健康状态、免费检测连接、模型显示名） -->
        <template v-if="providerView === 'list'">
          <section v-if="providerCategory !== 'model3d'" class="ax-card api-guard">
            <div class="api-guard-main">
              <AdminIcon name="shield" tint="#34c759" size="lg" />
              <span class="ax-row-main">
                <strong>出图备用模型</strong>
                <small>主平台出故障（连不上、超时、限流、服务器错误）时自动换用一次，内容不合规不会换；换了也只扣一次积分。同一平台连续失败 3 次会暂停 1 分钟起，暂停期间直接用备用。</small>
              </span>
            </div>
            <div class="api-guard-ctl">
              <select class="ax-select api-guard-select" :value="fallbackSelectValue" :disabled="fallbackSaving" aria-label="出图备用模型" @change="changeImageFallback($event.target.value)">
                <option value="">不使用备用模型</option>
                <option v-for="option in fallbackOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
              <span v-if="fallbackSaving" class="ax-pill is-muted">保存中…</span>
              <span v-else-if="providerConfig.imageFallback?.enabled && !providerConfig.imageFallback?.usable" class="ax-pill is-bad">已失效</span>
              <span v-else-if="providerConfig.imageFallback?.enabled" class="ax-pill is-ok">已开启</span>
              <span v-else class="ax-pill is-muted">未开启</span>
            </div>
            <p v-if="providerConfig.imageFallback?.problem" class="ax-note is-bad api-guard-note">{{ providerConfig.imageFallback.problem }}</p>
          </section>

          <div class="ax-stats">
            <div class="ax-stat"><span>已接入平台</span><strong>{{ apiSummary.platforms }}</strong><small>{{ apiSummary.configured }} 个已填好密钥</small></div>
            <div class="ax-stat"><span>用户端可用模型</span><strong>{{ apiSummary.enabledModels }}</strong><small>共 {{ apiSummary.totalModels }} 个，关掉的用户看不到</small></div>
            <template v-if="providerCategory === 'model3d'">
              <div class="ax-stat"><span>3D 服务</span><strong class="api-stat-text">{{ providerConfig.providers?.hunyuan3d?.enabled === false ? '已停用' : '已启用' }}</strong><small>关掉后用户端不能提交新任务</small></div>
              <div class="ax-stat"><span>腾讯云凭证</span><strong class="api-stat-text">{{ providerConfig.providers?.hunyuan3d?.credentialsConfigured ? '已配置' : '待配置' }}</strong><small>SecretId + SecretKey，只存在服务器</small></div>
            </template>
            <template v-else>
              <div class="ax-stat"><span>默认平台</span><strong class="api-stat-text" :title="apiSummary.defaultLabel">{{ apiSummary.defaultLabel }}</strong><small>没指定平台时用它</small></div>
              <div class="ax-stat" :class="{ 'is-warn': apiUnhealthyCount }"><span>平台状态</span><strong class="api-stat-text">{{ apiUnhealthyCount ? `${apiUnhealthyCount} 个异常` : '全部正常' }}</strong><small>{{ apiUnhealthyCount ? '在下面的列表里可以立即恢复' : '出图失败会自动记在这里' }}</small></div>
            </template>
          </div>

          <div class="ax-card is-flush">
            <div class="ax-toolbar">
              <label class="api-check-all">
                <input type="checkbox" :checked="allProviderRowsSelected" :disabled="!providerCards.length" @change="toggleAllProviders($event.target.checked)" />
                <span>全选</span>
              </label>
              <span class="ax-grow"></span>
              <template v-if="selectedProviderIds.length">
                <span class="ax-count">已选 {{ selectedProviderIds.length }} 个</span>
                <button type="button" class="ax-btn is-sm" @click="selectedProviderIds = []">取消选择</button>
                <button type="button" class="ax-btn is-sm is-danger" @click="deleteSelectedProviders">批量删除</button>
              </template>
              <span v-else class="ax-count">点模型就能单独开关，马上保存；用户端刷新后生效。</span>
            </div>

            <ul v-if="providerCards.length" class="api-list">
              <li v-for="provider in providerCards" :key="provider.key" class="api-item" :class="{ 'is-selected': selectedProviderIds.includes(provider.key) }">
                <div class="api-item-head">
                  <input v-model="selectedProviderIds" type="checkbox" :value="provider.key" :aria-label="`选择 ${provider.label}`" />
                  <AdminIcon :name="providerIconName(provider)" :tint="providerTint(provider)" size="lg" />
                  <span class="ax-cell-main api-item-title">
                    <strong>{{ provider.label }}</strong>
                    <small class="ax-mono">{{ provider.key }}</small>
                  </span>
                  <span class="api-item-tags">
                    <span v-if="provider.key === providerConfig.defaultProvider" class="ax-tag is-brand">默认</span>
                    <span class="ax-tag">{{ provider.custom ? '自定义' : '内置' }}</span>
                    <span class="ax-pill" :class="provider.configured ? 'is-ok' : 'is-warn'">{{ provider.configured ? '已配置' : '未配置' }}</span>
                    <span v-if="providerHealthBadge(provider)" class="ax-pill" :class="providerHealthBadge(provider).tone">{{ providerHealthBadge(provider).text }}</span>
                  </span>
                  <span class="ax-actions api-item-actions">
                    <button v-if="provider.key !== 'hunyuan3d'" type="button" class="ax-btn is-sm" :disabled="providerProbe[provider.key]?.loading || !provider.configured" :title="provider.configured ? '读一次平台的模型列表，确认地址和 Key 能用；不出图、不花钱' : '先填好 API Key'" @click="probeProvider(provider)">
                      {{ providerProbe[provider.key]?.loading ? '检测中…' : '检测连接' }}
                    </button>
                    <button type="button" class="ax-btn is-sm is-soft" @click="editProvider(provider.key)">编辑</button>
                    <button type="button" class="ax-btn is-sm is-danger" @click="deleteProvider(provider.key)">删除</button>
                  </span>
                </div>

                <div class="api-item-body">
                  <p class="api-item-meta">
                    <span v-if="provider.baseUrl" class="api-item-url" :class="{ 'ax-mono': /^https?:/i.test(provider.baseUrl) }" :title="provider.baseUrl">{{ provider.baseUrl }}</span>
                    <span v-if="provider.key !== 'hunyuan3d'" :title="provider.imageInputLabel">{{ shortImageInputLabel(provider.imageInputLabel) }}{{ provider.imageInputSource === 'auto' ? '（自动识别）' : '' }}</span>
                  </p>
                  <p v-if="providerProbe[provider.key]?.result" class="ax-note api-item-note" :class="probeTone(providerProbe[provider.key].result)">{{ providerProbe[provider.key].result.message }}</p>
                  <div v-if="['cooling', 'failing'].includes(provider.health?.status)" class="ax-note is-warn api-item-note api-health-note">
                    <span>
                      {{ providerHealthText(provider) }}
                      <template v-if="provider.health.lastError">最近一次：{{ provider.health.lastError }}</template>
                    </span>
                    <button type="button" class="ax-btn is-sm" :disabled="providerHealthResetting === provider.key" @click="resetProviderHealthState(provider)">{{ providerHealthResetting === provider.key ? '恢复中…' : '立即恢复' }}</button>
                  </div>
                  <div class="api-item-models">
                    <span class="api-item-models-head">用户端可用模型 <small>{{ providerEnabledModelCount(provider) }} / {{ listedProviderModels(provider).length }}</small></span>
                    <div v-if="listedProviderModels(provider).length" class="ax-tags is-roomy">
                      <label v-for="model in listedProviderModels(provider)" :key="model" class="ax-chip-check api-model-chip" :title="`${model}：点一下${provider.disabledModels?.includes(model) ? '打开' : '关闭'}`">
                        <input
                          type="checkbox"
                          :checked="!provider.disabledModels?.includes(model)"
                          :aria-label="`${provider.label} · ${modelDisplayName(provider, model)} 用户端可用`"
                          :disabled="providerModelToggling !== ''"
                          @change="changeProviderModelSelection($event, provider, model)"
                        />
                        <span>{{ providerModelToggling === `${provider.key}:${model}` ? '保存中…' : modelDisplayName(provider, model) }}</span>
                      </label>
                    </div>
                    <p v-else class="ax-hint">还没有模型，点「编辑」添加。</p>
                  </div>
                </div>
              </li>
            </ul>
            <div v-else class="ax-empty">
              <strong>这一类还没有平台</strong>
              <span>点右上角「新建平台」，填好地址、Key 和模型就能用。</span>
            </div>
          </div>
        </template>

        <!-- 腾讯混元 3D：专用配置页 -->
        <div v-else-if="isHunyuan3dProvider" :key="providerFormRenderKey" class="api-form-layout">
          <div class="api-form-main">
            <section class="ax-card">
              <div class="ax-card-head">
                <div><h3>基础配置</h3><p>腾讯混元 3D，通过腾讯云 SDK 接入。</p></div>
                <label class="ax-switch">
                  <input v-model="providerForm.enabled" type="checkbox" aria-label="启用 3D 生成功能" /><i></i>
                  <span>{{ providerForm.enabled ? '已启用' : '已停用' }}</span>
                </label>
              </div>
              <p class="ax-hint api-card-lead">关闭后，用户端不能提交新的 3D 生成任务；已生成的作品不受影响。</p>
              <div class="ax-form">
                <label class="ax-field"><span>显示名称</span><input v-model="providerForm.label" autocomplete="off" /></label>
                <label class="ax-field"><span>接入方式</span><input :value="providerForm.baseUrl" readonly /></label>
              </div>
            </section>

            <section class="ax-card">
              <div class="ax-card-head"><div><h3>生成版本与用户权限</h3><p>至少保留一个版本，两个版本都输出 GLB。</p></div></div>
              <div class="ax-rows">
                <div class="ax-row">
                  <span class="ax-row-main"><strong>默认生成版本</strong><small>用户创建任务时默认使用</small></span>
                  <div class="ax-seg" role="group" aria-label="默认生成版本">
                    <button type="button" :class="{ 'is-active': providerForm.defaultEdition === 'rapid' }" :disabled="!providerForm.editions.rapid" @click="providerForm.defaultEdition = 'rapid'">极速版</button>
                    <button type="button" :class="{ 'is-active': providerForm.defaultEdition === 'pro' }" :disabled="!providerForm.editions.pro" @click="providerForm.defaultEdition = 'pro'">专业版</button>
                  </div>
                </div>
                <label class="ax-row api-switch-row">
                  <span class="ax-row-main"><strong>用户可使用极速版</strong><small>课堂快速生成，参数由平台自动处理</small></span>
                  <span class="ax-switch"><input v-model="providerForm.editions.rapid" type="checkbox" /><i></i></span>
                </label>
                <label class="ax-row api-switch-row">
                  <span class="ax-row-main"><strong>用户可使用专业版</strong><small>高质量生成，可设置面数与 PBR</small></span>
                  <span class="ax-switch"><input v-model="providerForm.editions.pro" type="checkbox" /><i></i></span>
                </label>
              </div>
            </section>

            <section class="ax-card">
              <div class="ax-card-head"><div><h3>模型与输出</h3><p>专业版用下面选中的模型；面数、PBR、高清纹理只在专业版里给用户显示。</p></div></div>
              <div class="ax-form">
                <label class="ax-field"><span>专业版模型</span><select v-model="providerForm.defaultModel"><option v-for="model in providerForm.models" :key="model" :value="model">{{ model }}</option></select></label>
                <label class="ax-field"><span>输出格式</span><input value="GLB" readonly /></label>
              </div>
              <details class="api-details">
                <summary><AdminIcon name="chevron" plain class="api-details-icon" />管理可用模型 <small>当前 {{ providerForm.models.length }} 个</small></summary>
                <div class="api-model-add">
                  <input v-model.trim="providerModelDraft" class="ax-input" autocomplete="off" placeholder="输入模型名称" @keyup.enter="addProviderModel()" />
                  <button type="button" class="ax-btn is-primary" @click="addProviderModel()">添加模型</button>
                </div>
                <div v-if="providerForm.models.length" class="ax-rows api-model-rows">
                  <div v-for="model in providerForm.models" :key="model" class="ax-row api-model-row" :class="{ 'is-default': providerForm.defaultModel === model }">
                    <span class="ax-row-main"><strong class="ax-mono api-model-name">{{ model }}</strong></span>
                    <span v-if="providerForm.defaultModel === model" class="ax-tag is-brand">默认</span>
                    <button v-else type="button" class="ax-btn is-sm is-ghost" @click="setProviderDefaultModel(model)">设为默认</button>
                    <button type="button" class="ax-btn is-sm is-danger" @click="removeProviderModel(model)">删除</button>
                  </div>
                </div>
              </details>
            </section>

            <section class="ax-card">
              <div class="ax-card-head"><div><h3>服务端密钥</h3><p>保存后由服务器加密保存，页面不会再显示 SecretKey；留空表示不修改已保存的密钥。</p></div></div>
              <p class="ax-note is-warn api-card-lead">这里只能填腾讯云 API 密钥对（SecretId 以 AKID 开头 + SecretKey）。混元 3D 控制台里 sk- 开头的 API Key 不能填在这里。</p>
              <div class="ax-form">
                <label class="ax-field"><span>SecretId</span><input v-model.trim="providerForm.secretId" autocomplete="off" placeholder="填写腾讯云 SecretId" /></label>
                <label class="ax-field"><span>SecretKey</span><input v-model="providerForm.secretKey" type="password" autocomplete="new-password" :placeholder="providerConfig.providers?.hunyuan3d?.credentialsConfigured ? '已配置；留空不修改' : '填写腾讯云 SecretKey'" /></label>
                <label class="ax-field"><span>地域</span><select v-model="providerForm.region"><option value="ap-guangzhou">ap-guangzhou（广州）</option><option value="ap-shanghai">ap-shanghai（上海）</option><option value="ap-beijing">ap-beijing（北京）</option></select></label>
                <label class="ax-field"><span>API Endpoint</span><input v-model.trim="providerForm.endpoint" autocomplete="off" placeholder="ai3d.tencentcloudapi.com" /></label>
              </div>
            </section>
          </div>

          <aside class="api-aside">
            <section class="ax-card">
              <div class="api-aside-head">
                <AdminIcon name="cube" size="xl" />
                <span class="ax-cell-main"><strong>{{ providerForm.label || '腾讯混元 3D' }}</strong><small>腾讯云 SDK · {{ hunyuanRegionLabel }}</small></span>
              </div>
              <span class="ax-pill api-aside-pill" :class="!providerForm.enabled ? 'is-muted' : (providerConfig.providers?.hunyuan3d?.credentialsConfigured ? 'is-ok' : 'is-warn')">
                {{ !providerForm.enabled ? '服务已停用' : (providerConfig.providers?.hunyuan3d?.credentialsConfigured ? '服务可用' : '待配置密钥') }}
              </span>
              <div class="ax-kv api-kv-1col">
                <div><span>默认版本</span><strong>{{ providerForm.defaultEdition === 'pro' ? '专业版' : '极速版' }}</strong></div>
                <div><span>用户可用</span><strong>{{ [providerForm.editions.rapid && '极速版', providerForm.editions.pro && '专业版'].filter(Boolean).join('、') || '未开放' }}</strong></div>
                <div><span>专业版模型</span><strong>{{ providerForm.defaultModel || '未设置' }}</strong></div>
                <div><span>凭证</span><strong>{{ providerConfig.providers?.hunyuan3d?.credentialsConfigured ? '已配置' : '待配置' }}</strong></div>
              </div>
              <div class="api-aside-actions">
                <button type="button" class="ax-btn is-primary is-block" :disabled="providerSaving" @click="saveProviderConfig">{{ providerSaving ? '保存中…' : '保存配置' }}</button>
                <button type="button" class="ax-btn is-block" :disabled="apiTesting" @click="testSelectedProvider">{{ apiTesting ? '测试中…' : '测试连接' }}</button>
              </div>
              <p v-if="apiTestResult" class="ax-note" :class="apiTestResult.ok ? 'is-ok' : 'is-bad'">{{ apiTestResult.message }}</p>
              <p class="ax-hint">用户端：极速版隐藏专业参数，专业版显示面数与 PBR。改完点「保存配置」才生效。</p>
            </section>
          </aside>
        </div>

        <!-- 普通模型平台：新建 / 编辑（2026-11-26 重写：参考图能力自动识别、模型显示名、免费检测连接） -->
        <div v-else :key="providerFormRenderKey" class="api-form-layout">
          <div class="api-form-main">
            <section class="ax-card">
              <div class="ax-card-head">
                <div>
                  <h3>{{ creatingProvider ? '新建模型平台' : '基本信息' }}</h3>
                  <p>{{ creatingProvider ? '填好平台标识、地址和 Key，再在下面添加要用的模型。' : '平台地址和密钥。密钥保存后不会再显示。' }}</p>
                </div>
              </div>
              <div class="ax-form">
                <label class="ax-field"><span>平台标识</span>
                  <input v-if="creatingProvider" v-model="providerForm.key" autocomplete="off" placeholder="例如：deepseek / qwen-compatible" />
                  <select v-else v-model="providerForm.key" @change="selectProvider(providerForm.key)">
                    <option v-for="provider in providerCards" :key="provider.key" :value="provider.key">{{ provider.label }}</option>
                  </select>
                  <small>{{ creatingProvider ? '建议用小写英文、数字和短横线，保存后出现在平台列表里。' : '可以直接切换到同一类的其他平台。' }}</small>
                </label>
                <label class="ax-field"><span>显示名称</span>
                  <input v-model="providerForm.label" autocomplete="off" placeholder="例如：通义千问 / 自定义 Image2 平台" />
                  <small>显示在平台列表和智能体的模型选择里。</small>
                </label>
                <template v-if="providerForm.category === 'custom'">
                  <label class="ax-field"><span>可用能力（英文逗号分隔）</span><input v-model="providerForm.capabilitiesText" placeholder="text,image,video,model3d" /></label>
                  <label class="ax-field"><span>绑定位置（英文逗号分隔）</span>
                    <input v-model="providerForm.bindingsText" placeholder="例如：paint.generate,agent:report.full" />
                    <small>目前只保存绑定规则，暂不参与权限判断。</small>
                  </label>
                </template>
                <label class="ax-field ax-span-all"><span>API 地址（Base URL）</span>
                  <input v-model="providerForm.baseUrl" autocomplete="off" placeholder="https://apihub.agnes-ai.com/v1" />
                  <small>填平台文档里的地址；粘成完整接口地址（…/images/generations）也行，保存时会自动去掉后缀。</small>
                </label>
                <label class="ax-field ax-span-all"><span>API Key</span>
                  <input v-model="providerForm.apiKey" type="password" autocomplete="new-password" placeholder="粘贴平台给你的密钥，保存后不会显示明文" />
                  <small v-if="!creatingProvider && apiCurrentProvider?.configured">这个平台已经保存过 Key；只有要换 Key 时才需要重新填写。</small>
                </label>
              </div>
            </section>

            <section class="ax-card">
              <div class="ax-card-head">
                <div>
                  <h3>模型 <small class="api-head-count">{{ providerForm.models.length }} 个</small></h3>
                  <p>类型决定出现在哪：图像在 AI 绘画，视频在 AI 视频，文字给智能体。「显示名」是用户端下拉里看到的名字，不填就自动起名。</p>
                </div>
                <button type="button" class="ax-btn is-sm" :disabled="creatingProvider || providerModelLoading" :title="creatingProvider ? '先保存新平台，再从平台读取模型' : '向平台的 /models 读取可用模型（不产生费用）'" @click="fetchUpstreamModels">
                  {{ providerModelLoading ? '正在获取…' : '从平台获取模型' }}
                </button>
              </div>
              <div class="api-model-add">
                <input v-model.trim="providerModelDraft" class="ax-input" autocomplete="off" placeholder="输入模型名称，例如 doubao-seedream-4-0-250828" @keyup.enter="addProviderModel()" />
                <button type="button" class="ax-btn is-primary" @click="addProviderModel()">添加模型</button>
              </div>
              <div v-if="upstreamModels.length" class="api-model-add">
                <select v-model="selectedUpstreamModel" class="ax-select">
                  <option value="">从平台返回的 {{ upstreamModels.length }} 个模型里选一个</option>
                  <option v-for="model in upstreamModels" :key="model" :value="model">{{ model }}</option>
                </select>
                <button type="button" class="ax-btn" :disabled="!selectedUpstreamModel" @click="addSelectedUpstreamModel">加入列表</button>
              </div>
              <div v-if="providerForm.models.length" class="api-model-list">
                <div v-for="model in providerForm.models" :key="model" data-provider-model-row class="api-model-item" :class="{ 'is-default': providerForm.defaultModel === model }">
                  <div class="api-model-item-main">
                    <strong class="ax-mono api-model-name" :title="model">{{ model }}</strong>
                    <input
                      v-model.trim="providerForm.modelLabels[model]"
                      class="ax-input api-model-label"
                      maxlength="24"
                      autocomplete="off"
                      :placeholder="`显示名（默认：${formAutoModelLabel(model)}）`"
                      :aria-label="`${model} 的显示名`"
                    />
                    <small v-if="providerForm.key !== 'agnes' && providerModelKind(model) === 'video'" class="api-model-note">视频生成目前只接了 Agnes，这个平台的视频模型用户端暂时选不到。</small>
                  </div>
                  <div class="api-model-item-ctl">
                    <div class="ax-seg" role="group" :aria-label="`${model} 的类型`">
                      <button v-for="kind in apiModelKindOptions" :key="kind.value" type="button" :class="{ 'is-active': providerModelKind(model) === kind.value }" @click="setProviderModelKind(model, kind.value)">{{ kind.label }}</button>
                    </div>
                    <span v-if="providerForm.defaultModel === model" class="ax-tag is-brand api-default-tag">默认</span>
                    <button v-else type="button" class="ax-btn is-sm is-ghost" @click="setProviderDefaultModel(model)">设为默认</button>
                    <button type="button" class="ax-btn is-sm is-danger" @click="removeProviderModel(model)">删除</button>
                  </div>
                </div>
              </div>
              <div v-else class="ax-empty is-compact"><strong>还没有模型</strong><span>在上面输入模型名称添加，或点「从平台获取模型」。</span></div>
            </section>

            <section class="ax-card">
              <div class="ax-card-head">
                <div><h3>参考图</h3><p>画布上的上游图、标记元素要怎么送进模型。能认出来的平台自动设置，一般不用管。</p></div>
              </div>
              <div class="ax-rows">
                <div class="ax-row">
                  <span class="ax-row-main">
                    <strong>手动指定</strong>
                    <small>{{ imageInputAutoHint }}</small>
                  </span>
                  <label class="ax-switch">
                    <input :checked="!providerForm.imageInputAuto" type="checkbox" aria-label="手动指定参考图方式" @change="providerForm.imageInputAuto = !$event.target.checked" /><i></i>
                  </label>
                </div>
              </div>
              <div v-if="!providerForm.imageInputAuto" class="ax-form api-imageinput-form">
                <label class="ax-field ax-span-all"><span>接收参考图的方式</span>
                  <select v-model="providerForm.imageInputMode">
                    <option value="body-field">请求体顶层 image 字段（多数 OpenAI 兼容平台、火山方舟）</option>
                    <option value="extra-body-image">extra_body.image 数组（Agnes）</option>
                    <option value="edits">改用 /images/edits 上传（OpenAI gpt-image-1）</option>
                    <option value="none">这个平台不支持参考图</option>
                  </select>
                </label>
                <label v-if="providerForm.imageInputMode === 'body-field'" class="ax-field"><span>参考图字段名</span>
                  <input v-model.trim="providerForm.imageInputField" autocomplete="off" placeholder="image" />
                  <small>火山方舟用 image；平台文档写的是别的字段名就照填。</small>
                </label>
                <label v-if="providerForm.imageInputMode !== 'none'" class="ax-field"><span>单次最多几张参考图</span>
                  <input v-model.number="providerForm.imageInputMaxImages" type="number" min="1" max="16" />
                  <small>超过时只取前几张；OpenAI gpt-image-1 单次只接受 1 张。</small>
                </label>
              </div>
              <details class="api-details">
                <summary><AdminIcon name="chevron" plain class="api-details-icon" />高级：作品局部重绘、真实出图自检</summary>
                <div class="ax-form api-details-body">
                  <label class="ax-field ax-span-all"><span>作品局部重绘</span>
                    <select v-model="providerForm.imageEditProtocol">
                      <option value="none">未验证 / 不支持选区编辑</option>
                      <option value="openai-mask">OpenAI 兼容 /images/edits（image + mask）</option>
                    </select>
                    <small>参考图能力不等于局部重绘，只给确认支持遮罩编辑的模型开启；这项配置本身不产生费用。</small>
                  </label>
                  <template v-if="providerForm.imageEditProtocol === 'openai-mask'">
                    <label class="ax-field"><span>支持遮罩编辑的模型（每行一个）</span><textarea v-model="providerForm.imageEditModelsText" rows="3" placeholder="填写这个平台已添加的模型名称"></textarea></label>
                    <label class="ax-field"><span>编辑输出尺寸</span><select v-model="providerForm.imageEditSize"><option>1024x1024</option><option>1536x1024</option><option>1024x1536</option></select></label>
                  </template>
                  <label class="ax-switch ax-span-all api-cost-switch">
                    <input v-model="providerForm.checkReferenceImage" type="checkbox" /><i></i>
                    <span>检测连接时顺便真实出一张图，验证参考图能不能送进去（会产生 1 次出图费用）</span>
                  </label>
                </div>
              </details>
            </section>

            <section v-if="isVolcengineProvider" class="ax-card">
              <div class="ax-card-head">
                <div><h3>图片水印</h3><p>火山方舟官方开关，对应接口的 watermark 参数。</p></div>
                <label class="ax-switch">
                  <input v-model="providerForm.imageWatermark" type="checkbox" aria-label="生成的图片带官方水印" /><i></i>
                  <span>{{ providerForm.imageWatermark ? '带官方水印' : '不带水印' }}</span>
                </label>
              </div>
              <p class="ax-hint">默认开启，点「保存配置」后生效，只影响之后新生成的图片，已经生成的不变；用户端不能修改。关闭后图上不再印水印，作品对外发布时仍应按国家规定注明是 AI 生成。</p>
            </section>
          </div>

          <aside class="api-aside">
            <section class="ax-card">
              <div class="api-aside-head">
                <AdminIcon :name="creatingProvider && !providerForm.label ? 'plus' : providerIconName(providerForm)" :tint="creatingProvider && !providerForm.label ? '' : providerTint(providerForm)" size="xl" />
                <span class="ax-cell-main"><strong>{{ providerForm.label || '新平台' }}</strong><small class="ax-mono">{{ providerForm.key || '还没填平台标识' }}</small></span>
              </div>
              <div class="ax-kv api-kv-1col">
                <div><span>密钥</span><strong>{{ creatingProvider ? '保存后生效' : (apiCurrentProvider?.configured ? '已配置' : '未配置') }}</strong></div>
                <div><span>模型</span><strong>{{ providerForm.models.length }} 个{{ providerForm.defaultModel ? ` · 默认 ${formModelDisplayName(providerForm.defaultModel)}` : '' }}</strong></div>
                <div><span>默认平台</span><strong>{{ providerConfig.defaultProvider === providerForm.key ? '是，没指定平台时用它' : '否' }}</strong></div>
                <div v-if="!creatingProvider && apiCurrentProvider?.health?.status && apiCurrentProvider.health.status !== 'unknown'"><span>运行状态</span><strong>{{ providerHealthBadge(apiCurrentProvider)?.text || '正常' }}</strong></div>
              </div>
              <div class="api-aside-actions">
                <button type="button" class="ax-btn is-primary is-block" :disabled="providerSaving" @click="saveProviderConfig">
                  {{ providerSaving ? '保存中…' : creatingProvider ? '创建并保存' : '保存配置' }}
                </button>
                <button v-if="creatingProvider" type="button" class="ax-btn is-block" :disabled="providerSaving" @click="cancelCreateProvider">取消新建</button>
                <template v-else>
                  <button type="button" class="ax-btn is-block" :disabled="apiTesting || !providerForm.key" :title="providerForm.checkReferenceImage ? '会真实出一张图（产生 1 次费用）' : '读一次平台的模型列表，不出图、不花钱'" @click="testSelectedProvider">
                    {{ apiTesting ? '检测中…' : providerForm.checkReferenceImage ? '检测连接 + 出图自检' : '检测连接（免费）' }}
                  </button>
                  <button type="button" class="ax-btn is-block" :disabled="!providerForm.key || providerConfig.defaultProvider === providerForm.key" @click="setDefaultProvider">
                    {{ providerConfig.defaultProvider === providerForm.key ? '已是默认平台' : '设为默认平台' }}
                  </button>
                </template>
              </div>
              <p v-if="apiTesting" class="ax-note is-plain">正在检测这个平台…</p>
              <p v-else-if="apiTestResult" class="ax-note" :class="probeTone(apiTestResult)">{{ apiTestResult.message }}</p>
              <p class="ax-hint">改了地址或 Key 要先「保存配置」，检测的是已保存的设置。</p>
            </section>

            <section class="ax-card">
              <div class="ax-section-title">整体情况</div>
              <div class="ax-kv api-kv-1col">
                <div><span>默认平台</span><strong>{{ apiSummary.defaultLabel }}</strong></div>
                <div><span>默认文字平台</span><strong>{{ apiSummary.defaultTextLabel }}</strong></div>
                <div><span>出图备用模型</span><strong>{{ providerConfig.imageFallback?.enabled ? `${providerConfig.imageFallback.providerLabel} · ${providerConfig.imageFallback.modelLabel}${providerConfig.imageFallback.usable ? '' : '（已失效）'}` : '未开启' }}</strong></div>
                <div><span>前端模式 · 后端地址</span><strong>{{ aiMode }} · <span class="ax-mono">{{ apiBaseUrl }}</span></strong></div>
              </div>
              <div class="api-aside-actions is-row">
                <button type="button" class="ax-btn is-sm" :disabled="apiTesting" @click="runAiConnectionTest">测试默认模型</button>
                <button type="button" class="ax-btn is-sm" @click="loadProviderConfig">刷新配置</button>
              </div>
            </section>
          </aside>
        </div>
      </section>

      <AiSkillCenter v-else-if="activeNav === 'featureManagement'" />

      <ImageStyleAdmin v-else-if="activeNav === 'imageStyleTemplates'" />

      <WorkbenchAdmin v-else-if="activeNav === 'workbench'" />

      <AgentPartnerAdmin v-else-if="activeNav === 'partner'" />

      <PromptLibraryAdmin v-else-if="activeNav === 'promptLibrary'" />

      <GalleryAuditPanel v-else-if="activeNav === 'audit'" ref="galleryAuditPanel" />

      <GalleryCategoryPanel v-else-if="activeNav === 'galleryCategories'" />

      <section v-else-if="activeNav === 'agents'" class="ax-page ag-page">
        <header class="ax-head">
          <div>
            <h2>智能体配置</h2>
            <p>用户端的 AI 智能体：人设、能调用的模型、完整提示词，以及每次调用的记录。改完记得保存。</p>
          </div>
          <div class="ax-head-actions">
            <template v-if="agentLogOpen">
              <button type="button" class="ax-btn" :disabled="agentLogLoading" @click="loadAgentLogs">{{ agentLogLoading ? '读取中…' : '刷新' }}</button>
              <button type="button" class="ax-btn is-danger" :disabled="agentLogLoading || !agentLogs.length" @click="clearAgentLogs">清空记录</button>
            </template>
            <button v-else-if="agentCanvasView" type="button" class="ax-btn is-primary" :disabled="canvasAgentSaving" @click="saveCanvasAgentConfig">{{ canvasAgentSaving ? '保存中…' : '保存配置' }}</button>
            <button v-else-if="agentView === 'list'" type="button" class="ax-btn is-primary" @click="createReportAgent"><AdminIcon name="plus" plain />新建智能体</button>
          </div>
        </header>

        <nav class="ax-tabs" aria-label="智能体配置分类">
          <button type="button" class="ax-tab" :class="{ 'is-active': !agentCanvasView && !agentLogOpen }" @click="agentCanvasView = false; agentLogOpen = false">基础智能体<em class="ax-tab-count">{{ reportAgents.length }}</em></button>
          <button type="button" class="ax-tab" :class="{ 'is-active': agentCanvasView && !agentLogOpen }" @click="agentCanvasView = true; agentLogOpen = false">无限画布智能体</button>
          <button type="button" class="ax-tab" :class="{ 'is-active': agentLogOpen }" @click="openAgentLogView">调用记录</button>
        </nav>

        <!-- 调用记录 -->
        <template v-if="agentLogOpen">
          <p class="ax-note"><span>每走一次智能体就记一行，<b>只记流程、模型、耗时和结果，不记用户原话</b>。用户说「它没反应」时先看这里：是模型报错、没配 Key，还是根本没走到这条流程。</span></p>
          <div class="ax-card is-flush">
            <div class="ax-toolbar">
              <select v-model="agentLogFlowFilter" class="ax-select" aria-label="按流程筛选" @change="loadAgentLogs">
                <option value="">全部流程</option>
                <option v-for="flow in agentFlows" :key="flow.key" :value="flow.key">{{ flow.label }}</option>
                <option value="agent.dryRun">智能体试跑</option>
              </select>
              <select v-model="agentLogStatusFilter" class="ax-select" aria-label="按结果筛选" @change="loadAgentLogs">
                <option value="all">全部结果</option>
                <option value="ok">成功</option>
                <option value="error">失败</option>
              </select>
              <span class="ax-grow"></span>
              <span class="ax-count">共 {{ agentLogs.length }} 条 · 最多保留最近 500 条</span>
            </div>
            <div v-if="agentLogs.length" class="ax-table-wrap">
              <table class="ax-table ag-log-table">
                <thead><tr><th>时间</th><th>流程</th><th>智能体</th><th>模型</th><th class="is-right">耗时</th><th>结果</th></tr></thead>
                <tbody>
                  <tr v-for="log in agentLogs" :key="log.id">
                    <td class="is-nowrap">{{ formatAgentLogTime(log.at) }}</td>
                    <td><span class="ax-cell-main"><strong>{{ agentFlowLabel(log.flowKey) || log.flowKey || '—' }}</strong><small v-if="agentFlowLabel(log.flowKey)" class="ax-mono">{{ log.flowKey }}</small></span></td>
                    <td>{{ log.agentName || '—' }}</td>
                    <td><span class="ax-cell-main"><strong class="ax-mono">{{ log.model || '—' }}</strong><small>{{ log.provider }}<template v-if="log.source"> · {{ log.source }}</template></small></span></td>
                    <td class="is-right is-num">{{ log.durationMs ? `${(log.durationMs / 1000).toFixed(1)} 秒` : '—' }}</td>
                    <td>
                      <span class="ax-pill" :class="log.status === 'error' ? 'is-bad' : 'is-ok'">{{ log.status === 'error' ? '失败' : '成功' }}</span>
                      <small v-if="log.error" class="ag-log-error" :title="log.error">{{ log.error }}</small>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="ax-empty">
              <strong>{{ agentLogLoading ? '正在读取…' : '还没有调用记录' }}</strong>
              <span v-if="!agentLogLoading">去用户端用一次智能体，或在编辑页里「试跑这句」，这里就会有数据。</span>
            </div>
          </div>
        </template>

        <!-- 无限画布智能体 -->
        <template v-else-if="agentCanvasView">
          <div class="ag-editor">
            <div class="ag-editor-main">
              <section class="ax-card">
                <div class="ax-card-head">
                  <div><h3>基本设置</h3><p>能读取整张画布、规划工作流并创建节点和连线。用户发送目标后才执行，打开页面时不会悄悄改画布。</p></div>
                  <label class="ax-switch">
                    <input v-model="canvasAgentForm.enabled" type="checkbox" /><i></i>
                    <span>{{ canvasAgentForm.enabled ? '已启用' : '已停用' }}</span>
                  </label>
                </div>
                <div class="ax-form">
                  <label class="ax-field"><span>智能体名称</span><input v-model="canvasAgentForm.name" /></label>
                  <label class="ax-field"><span>流程标识</span><input v-model="canvasAgentForm.flowKey" class="ax-mono" /></label>
                  <label class="ax-field">
                    <span>默认文本模型</span>
                    <select v-model="canvasAgentForm.model">
                      <option value="创作 Agent">创作 Agent</option>
                      <option value="提示词专家">提示词专家</option>
                      <option value="">跟随系统默认模型</option>
                    </select>
                  </label>
                  <label class="ax-field"><span>单次最多操作几步</span><input v-model.number="canvasAgentForm.maxActions" type="number" min="1" max="12" /><small>1～12 步，步数越多一次能搭的工作流越长。</small></label>
                </div>
              </section>
              <section class="ax-card">
                <div class="ax-card-head"><div><h3>智能体提示词</h3><p>统一写人设、工作目标、回答方式、提问规则和执行边界。</p></div></div>
                <textarea v-model="canvasAgentForm.prompt" class="ax-textarea ag-prompt-box" placeholder="在这里统一填写智能体的人设、工作目标、回答方式、提问规则和执行边界。"></textarea>
              </section>
            </div>
            <aside class="ag-editor-side">
              <section class="ax-card">
                <div class="ax-card-head"><div><h3>工作流能力</h3><p>它可以替用户做哪些事。</p></div></div>
                <div class="ax-rows">
                  <label v-for="item in canvasAgentCapabilities" :key="item.key" class="ax-row ag-toggle-row">
                    <span class="ax-row-main"><strong>{{ item.label }}</strong></span>
                    <span class="ax-switch"><input v-model="canvasAgentForm.capabilities[item.key]" type="checkbox" /><i></i></span>
                  </label>
                </div>
              </section>
              <section class="ax-card">
                <div class="ax-card-head"><div><h3>行为规则</h3><p>它做事时必须守的规矩。</p></div></div>
                <div class="ax-rows">
                  <label v-for="item in canvasAgentRules" :key="item.key" class="ax-row ag-toggle-row">
                    <span class="ax-row-main"><strong>{{ item.label }}</strong></span>
                    <span class="ax-switch"><input v-model="canvasAgentForm.rules[item.key]" type="checkbox" /><i></i></span>
                  </label>
                </div>
              </section>
              <p v-if="canvasAgentStatus" class="ax-note is-plain">{{ canvasAgentStatus }}</p>
            </aside>
          </div>
        </template>

        <!-- 智能体列表 -->
        <template v-else-if="agentView === 'list'">
          <div class="ag-toolbar">
            <div class="ax-search"><input v-model="agentKeyword" type="search" placeholder="搜索名称、人设、目标关键词" aria-label="搜索智能体" /></div>
            <select v-model="agentTypeFilter" class="ax-select" aria-label="按类型筛选">
              <option value="all">全部类型</option>
              <option value="report">报告生成</option>
              <option value="report-outline">报告大纲</option>
              <option value="ppt-image">PPT页图生成</option>
              <option value="custom">自定义任务</option>
            </select>
            <select v-model="agentStatusFilter" class="ax-select" aria-label="按状态筛选">
              <option value="all">全部状态</option>
              <option value="enabled">启用中</option>
              <option value="disabled">已停用</option>
            </select>
            <span class="ax-grow"></span>
            <label v-if="filteredAgents.length" class="ax-chip-check">
              <input type="checkbox" :checked="allFilteredAgentsSelected" @change="toggleAllFilteredAgents" />
              <span>全选</span>
            </label>
            <button type="button" class="ax-btn is-danger is-sm" :disabled="!selectedAgentIds.length" @click="deleteCheckedAgents">删除选中{{ selectedAgentIds.length ? `（${selectedAgentIds.length}）` : '' }}</button>
          </div>

          <div v-if="filteredAgents.length" class="ag-grid">
            <article
              v-for="agent in filteredAgents"
              :key="agent.id"
              class="ag-card"
              :class="{ 'is-primary': isPrimaryAgent(agent.id), 'is-off': agent.status === 'disabled', 'is-selected': selectedAgentIds.includes(agent.id) }"
              @click="openAgentEditor(agent.id)"
            >
              <header class="ag-card-head">
                <AdminIcon name="agents" :tint="isPrimaryAgent(agent.id) ? '' : '#8e8e93'" size="lg" />
                <div class="ag-card-title">
                  <button type="button" class="ag-card-name" @click.stop="openAgentEditor(agent.id)">{{ agent.name || '未命名智能体' }}</button>
                  <div class="ax-tags">
                    <span v-if="isPrimaryAgent(agent.id)" class="ax-pill is-ok">用户端在用</span>
                    <span v-else class="ax-pill is-muted">备用</span>
                    <span v-if="agent.status === 'disabled'" class="ax-pill is-bad">已停用</span>
                  </div>
                </div>
                <label class="ag-card-check" title="选中后可以批量删除" @click.stop>
                  <input v-model="selectedAgentIds" type="checkbox" :value="agent.id" :aria-label="`选择 ${agent.name}`" />
                  <i aria-hidden="true"></i>
                </label>
              </header>
              <p class="ag-card-role">{{ agentRoleLine(agent) }}</p>
              <div class="ax-tags">
                <span class="ax-tag">{{ agentTypeLabel(agent.type) }}</span>
                <span class="ax-tag">{{ agentStatusLabel(agent.status) }}</span>
                <span class="ax-tag">更新于 {{ formatAgentTime(agent.updatedAt) }}</span>
              </div>
              <footer class="ag-card-foot" @click.stop>
                <button type="button" class="ax-btn is-sm is-soft" @click="openAgentEditor(agent.id)">编辑</button>
                <button v-if="!isPrimaryAgent(agent.id)" type="button" class="ax-btn is-sm" @click="setPrimaryAgent(agent.id)">设为在用</button>
                <button type="button" class="ax-btn is-sm is-ghost" @click="copyAgent(agent.id)">复制</button>
                <span class="ax-grow"></span>
                <button type="button" class="ax-btn is-sm is-danger" :disabled="reportAgents.length <= 1" :title="reportAgents.length <= 1 ? '至少要留一个智能体' : ''" @click="deleteAgent(agent.id)">删除</button>
              </footer>
            </article>
          </div>
          <div v-else class="ax-card">
            <div class="ax-empty"><strong>没有匹配的智能体</strong><span>换个筛选条件，或点右上角「新建智能体」。</span></div>
          </div>

          <div class="ax-savebar">
            <span class="ax-hint">{{ agentStatus || '新建、复制、删除、设为在用都要点「保存配置」才会生效。' }}</span>
            <button type="button" class="ax-btn" :disabled="agentSaving" @click="resetReportAgentConfig">恢复默认配置</button>
            <button type="button" class="ax-btn is-primary" :disabled="agentSaving" @click="saveReportAgentConfig">{{ agentSaving ? '保存中…' : '保存配置' }}</button>
          </div>
        </template>

        <!-- 编辑智能体 -->
        <template v-else>
          <div class="ag-edit-head">
            <button type="button" class="ax-btn is-ghost ag-back" @click="backToAgentList"><AdminIcon name="chevron" plain class="ag-back-icon" />返回列表</button>
            <AdminIcon name="agents" :tint="isPrimaryAgentForm ? '' : '#8e8e93'" size="lg" />
            <div class="ag-edit-title">
              <small>编辑智能体</small>
              <strong>{{ reportAgentForm.name || '新建报告智能体' }}</strong>
            </div>
          </div>

          <div class="ag-editor is-edit">
            <div class="ag-editor-main">
              <section class="ax-card">
                <div class="ax-card-head"><div><h3>基本信息</h3><p>名称和类型决定它出现在哪些流程里。</p></div></div>
                <div class="ax-form is-3col">
                  <label class="ax-field"><span>智能体名称</span><input v-model="reportAgentForm.name" @input="syncSelectedAgentForm" /></label>
                  <label class="ax-field">
                    <span>智能体类型</span>
                    <select v-model="reportAgentForm.type" @change="handleAgentTypeChange">
                      <option value="report">报告生成</option>
                      <option value="report-outline">报告大纲</option>
                      <option value="ppt-image">PPT页图生成</option>
                      <option value="h5-first-person-report">H5第一人称报告</option>
                      <option value="custom">自定义任务</option>
                    </select>
                  </label>
                  <label class="ax-field">
                    <span>任务类型</span>
                    <select v-model="reportAgentForm.taskType" @change="handleAgentTaskTypeChange">
                      <option v-for="item in agentTaskTypes" :key="item.value" :value="item.value">{{ item.label }}</option>
                    </select>
                  </label>
                </div>
              </section>

              <section class="ax-card">
                <div class="ax-card-head">
                  <div><h3>模型调用</h3><p>限制它能调用哪些模型，并设置默认模型和备用模型。</p></div>
                  <span class="ax-pill is-info">{{ compatibleAgentModelOptions.length }} 个可用模型</span>
                </div>
                <div class="ax-form is-3col">
                  <label class="ax-field">
                    <span>默认模型</span>
                    <select v-model="reportAgentForm.defaultModelKey" @change="syncSelectedAgentForm">
                      <option value="">跟随系统默认</option>
                      <option v-for="model in compatibleAgentModelOptions" :key="model.key" :value="model.key">{{ model.label }}</option>
                    </select>
                  </label>
                  <label class="ax-field">
                    <span>备用模型</span>
                    <select v-model="reportAgentForm.fallbackModelKey" @change="syncSelectedAgentForm">
                      <option value="">不设置备用</option>
                      <option v-for="model in compatibleAgentModelOptions" :key="model.key" :value="model.key">{{ model.label }}</option>
                    </select>
                  </label>
                  <label class="ax-field">
                    <span>只允许调用</span>
                    <select v-if="compatibleAgentModelOptions.length" v-model="reportAgentAllowedModelKey">
                      <option value="">不限制，跟随默认/备用模型</option>
                      <option v-for="model in compatibleAgentModelOptions" :key="model.key" :value="model.key">{{ model.label }}（{{ model.configured ? '已配置' : '未配置Key' }}）</option>
                    </select>
                    <small v-else>当前任务类型没有可用模型，请先到「API 配置」里填写模型名称。</small>
                  </label>
                  <label class="ax-field"><span>超时时间（秒）</span><input v-model.number="reportAgentForm.modelParams.timeoutSeconds" type="number" min="10" max="300" @input="syncSelectedAgentForm" /></label>
                  <label class="ax-field"><span>温度 / 创造性</span><input v-model.number="reportAgentForm.modelParams.temperature" type="number" min="0" max="1" step="0.05" @input="syncSelectedAgentForm" /><small>0 最稳定，1 最有想象力。</small></label>
                  <label v-if="reportAgentForm.taskType === 'image'" class="ax-field">
                    <span>画幅比例</span>
                    <select v-model="reportAgentForm.modelParams.ratio" @change="syncSelectedAgentForm">
                      <option value="16:9">16:9 PPT横版</option>
                      <option value="4:3">4:3 课堂投影</option>
                      <option value="1:1">1:1 方图</option>
                      <option value="9:16">9:16 竖版</option>
                    </select>
                  </label>
                  <label v-if="reportAgentForm.taskType === 'image'" class="ax-field"><span>单次生成数量</span><input v-model.number="reportAgentForm.modelParams.count" type="number" min="1" max="4" @input="syncSelectedAgentForm" /></label>
                </div>
              </section>

              <section class="ax-card">
                <div class="ax-card-head">
                  <div><h3>完整提示词 / 工作流程</h3><p>一次写清人设、目标、素材范围、执行步骤、输出格式、质量要求和异常处理。</p></div>
                  <button type="button" class="ax-btn is-sm" :aria-expanded="promptExpanded" @click="promptExpanded = !promptExpanded">{{ promptExpanded ? '收起' : '展开编辑' }}</button>
                </div>
                <div class="ag-example-row">
                  <span class="ax-hint">插入示例：</span>
                  <button type="button" class="ax-btn is-sm is-soft" @click="insertAgentExample('outline')">报告大纲</button>
                  <button type="button" class="ax-btn is-sm is-soft" @click="insertAgentExample('pptImage')">PPT 页图</button>
                  <button type="button" class="ax-btn is-sm is-soft" @click="insertAgentExample('paint')">绘画优化</button>
                  <button type="button" class="ax-btn is-sm is-soft" @click="insertAgentExample('video')">视频分镜</button>
                </div>
                <textarea
                  v-model="reportAgentForm.masterPrompt"
                  class="ax-textarea ag-prompt-box"
                  :class="{ 'is-expanded': promptExpanded }"
                  placeholder="示例：你是一个……智能体。你的任务是……你可以读取……请按以下步骤工作：1... 2... 输出格式必须为……质量要求是……当素材不足时……"
                  @input="syncSelectedAgentForm"
                ></textarea>
              </section>

              <!-- 试跑：只判断「它会怎么理解」，绝不执行。改完人设先在这里验一遍。 -->
              <section class="ax-card">
                <div class="ax-card-head">
                  <div><h3>试跑这句（不花钱）</h3><p>写一句用户可能说的话，看它会怎么理解、会补什么、准备走哪条流程。<b>只判断，不生成</b>：不出图、不扣积分、不写任何数据。</p></div>
                </div>
                <div class="ag-dry-input">
                  <textarea v-model="dryRunText" class="ax-textarea" rows="2" maxlength="300" placeholder="例如：帮我画一只月球上的猫" @keydown.ctrl.enter.prevent="runAgentDryRun"></textarea>
                  <button type="button" class="ax-btn is-primary" :disabled="dryRunLoading || !dryRunText.trim()" @click="runAgentDryRun">{{ dryRunLoading ? '试跑中…' : '试跑这句' }}</button>
                </div>
                <div class="ag-example-row">
                  <span class="ax-hint">试这几句：</span>
                  <button v-for="sample in dryRunSamples" :key="sample" type="button" class="ax-btn is-sm" @click="dryRunText = sample">{{ sample }}</button>
                </div>
                <p v-if="dryRunError" class="ax-note is-bad">{{ dryRunError }}</p>
                <div v-if="dryRunResult" class="ag-dry-result">
                  <div class="ax-tags is-roomy">
                    <span class="ax-pill is-brand">{{ dryRunResult.intentLabel }}</span>
                    <span class="ax-pill" :class="dryRunResult.isCommand ? 'is-ok' : 'is-warn'">{{ dryRunResult.isCommand ? '会直接做' : '只建议，不动手' }}</span>
                    <span class="ax-tag">{{ dryRunResult.actionLabel }}</span>
                    <span class="ax-tag">花费：{{ dryRunResult.spend }}</span>
                    <span v-if="dryRunResult.confidence" class="ax-tag">把握 {{ Math.round(dryRunResult.confidence * 100) }}%</span>
                    <span class="ax-tag">{{ (dryRunResult.durationMs / 1000).toFixed(1) }} 秒</span>
                  </div>
                  <p v-if="dryRunResult.reason" class="ag-dry-reason">{{ dryRunResult.reason }}</p>
                  <div v-if="dryRunResult.filledPrompt" class="ag-dry-block">
                    <strong>它整理出来的描述</strong>
                    <p>{{ dryRunResult.filledPrompt }}</p>
                  </div>
                  <div v-if="dryRunResult.additions.length" class="ag-dry-block">
                    <strong>它替你补了 {{ dryRunResult.additions.length }} 样</strong>
                    <ul>
                      <li v-for="(item, index) in dryRunResult.additions" :key="index"><b>{{ item.label }}</b>{{ item.value }}<small v-if="item.why">{{ item.why }}</small></li>
                    </ul>
                  </div>
                  <div v-if="dryRunResult.missing.length" class="ag-dry-block is-warn">
                    <strong>这几样它不敢编，得问用户</strong>
                    <ul><li v-for="(item, index) in dryRunResult.missing" :key="index">{{ item }}</li></ul>
                  </div>
                  <div v-if="dryRunResult.questions.length" class="ag-dry-block">
                    <strong>它准备先问一句</strong>
                    <ul><li v-for="(item, index) in dryRunResult.questions" :key="index">{{ item }}</li></ul>
                  </div>
                </div>
              </section>

              <details class="ax-card ag-advanced">
                <summary><span><strong>高级拆分配置</strong><small>兼容旧智能体，可选填写</small></span><AdminIcon name="chevron" plain class="ag-advanced-icon" /></summary>
                <div class="ax-form ag-advanced-body">
                  <label class="ax-field"><span>智能体人设提示词</span><textarea v-model="reportAgentForm.persona" @input="syncSelectedAgentForm"></textarea></label>
                  <label class="ax-field"><span>智能体任务目标</span><textarea v-model="reportAgentForm.reportGoal" @input="syncSelectedAgentForm"></textarea></label>
                  <label class="ax-field"><span>工作流程提示词</span><textarea v-model="reportAgentForm.generationLogic" @input="syncSelectedAgentForm"></textarea></label>
                  <label class="ax-field"><span>输入素材范围说明</span><textarea v-model="reportAgentForm.inputScope" @input="syncSelectedAgentForm"></textarea></label>
                  <label class="ax-field"><span>输出格式要求</span><textarea v-model="reportAgentForm.outputRules" @input="syncSelectedAgentForm"></textarea></label>
                  <label class="ax-field"><span>质量检查规则</span><textarea v-model="reportAgentForm.qualityRules" @input="syncSelectedAgentForm"></textarea></label>
                  <label class="ax-field"><span>失败或素材缺失处理规则</span><textarea v-model="reportAgentForm.fallbackRules" @input="syncSelectedAgentForm"></textarea></label>
                  <label class="ax-field"><span>页面结构规则（报告类可选）</span><textarea v-model="reportAgentForm.pageStructure" @input="syncSelectedAgentForm"></textarea></label>
                  <label class="ax-field"><span>排版规则（报告类可选）</span><textarea v-model="reportAgentForm.layoutRules" @input="syncSelectedAgentForm"></textarea></label>
                  <label class="ax-field"><span>入门版规则</span><textarea v-model="reportAgentForm.difficultyRules.starter" @input="syncSelectedAgentForm"></textarea></label>
                  <label class="ax-field"><span>高级版规则</span><textarea v-model="reportAgentForm.difficultyRules.pro" @input="syncSelectedAgentForm"></textarea></label>
                  <label class="ax-field"><span>初级版规则（旧版本，兼容旧数据）</span><textarea v-model="reportAgentForm.difficultyRules.junior" @input="syncSelectedAgentForm"></textarea></label>
                  <label class="ax-field"><span>进阶版规则（旧版本，兼容旧数据）</span><textarea v-model="reportAgentForm.difficultyRules.advanced" @input="syncSelectedAgentForm"></textarea></label>
                </div>
              </details>
            </div>

            <aside class="ag-editor-side">
              <section class="ax-card ag-side-card">
                <div class="ag-side-status" :class="{ 'is-on': isPrimaryAgentForm }">
                  <AdminIcon :name="isPrimaryAgentForm ? 'check' : 'agents'" :tint="isPrimaryAgentForm ? '' : '#8e8e93'" />
                  <span class="ax-cell-main"><strong>{{ isPrimaryAgentForm ? '用户端正在用它' : '备用，用户看不到它' }}</strong><small>绘画、视频、3D、项目报告、课程五个页面共用同一个智能体。</small></span>
                </div>
                <button v-if="!isPrimaryAgentForm" type="button" class="ax-btn is-soft is-block" @click="setPrimaryAgent(selectedAgentId)">设为用户端智能体</button>
                <p class="ax-hint">要给用户换本领，去「AI玩法中心」发技能卡，用户在页面上自己挑。</p>
                <label class="ax-field">
                  <span>状态</span>
                  <select v-model="reportAgentForm.status" @change="syncSelectedAgentForm">
                    <option value="enabled">启用</option>
                    <option value="disabled">停用</option>
                  </select>
                </label>
                <button type="button" class="ax-btn is-primary is-block" :disabled="agentSaving" @click="saveReportAgentConfig">{{ agentSaving ? '保存中…' : '保存配置' }}</button>
                <p v-if="agentStatus" class="ax-hint">{{ agentStatus }}</p>
              </section>
            </aside>
          </div>
        </template>
      </section>

      <section v-else-if="activeNav === 'creditBilling'" class="ax-page billing-page credit-billing-page">
        <header class="ax-head">
          <div>
            <h2>AI 用量与计费</h2>
            <p>每类 AI 能力每天白送几次、送完后每次扣多少积分；也可以给单个模型单独定价。</p>
          </div>
          <div class="ax-head-actions">
            <button type="button" class="ax-btn" :disabled="billingLoading" @click="loadCreditBilling">{{ billingLoading ? '读取中…' : '刷新' }}</button>
            <button type="button" class="ax-btn is-primary" :disabled="billingSaving" @click="saveCreditBilling">{{ billingSaving ? '保存中…' : '保存计费设置' }}</button>
          </div>
        </header>

        <p v-if="billingError" class="ax-note is-bad">{{ billingError }}</p>
        <p v-if="billingNotice" class="ax-note is-ok">{{ billingNotice }}</p>

        <section class="ax-card">
          <div class="ax-card-head">
            <div>
              <h3>每类能力的默认额度</h3>
              <p>「每天赠送」按次数记，不折成积分，当天没用完就作废；送完后按「用完每次扣」从积分余额里扣。改完点右上角「保存计费设置」。</p>
            </div>
          </div>
          <div v-if="billingAbilities.length" class="billing-ability-grid">
            <article v-for="item in billingAbilities" :key="item.ability" class="billing-ability" :class="{ 'is-off': !item.enabled }">
              <header>
                <span class="ax-cell-main"><strong>{{ item.label }}</strong><small>按{{ item.unit }}计</small></span>
                <label class="ax-switch">
                  <input v-model="item.enabled" type="checkbox" :aria-label="`${item.label} 启用`" /><i></i>
                  <span>{{ item.enabled ? '启用' : '停用' }}</span>
                </label>
              </header>
              <div class="billing-ability-fields">
                <label class="billing-num">
                  <span>每天赠送</span>
                  <span class="billing-num-input"><input v-model.number="item.dailyFree" type="number" min="0" step="1" /><em>次</em></span>
                </label>
                <label class="billing-num">
                  <span>用完每次扣</span>
                  <span class="billing-num-input"><input v-model.number="item.credits" type="number" min="0" step="1" /><em>积分 / {{ item.unit }}</em></span>
                </label>
              </div>
            </article>
          </div>
          <div v-else class="ax-empty is-compact"><strong>{{ billingLoading ? '正在读取…' : '没有读到计费设置' }}</strong><span v-if="!billingLoading">点右上角「刷新」再试一次。</span></div>
          <p class="ax-hint billing-example">例：出图每天送 8 张、用完每次扣 5 分，用户今天出第 9 张图时才扣 5 积分。一份 H5 报告内部要跑 6~8 张图，所以单价建议比出图高。</p>
        </section>

        <section class="ax-card is-flush">
          <div class="ax-card-head">
            <div>
              <h3>模型单独定价 <small class="api-head-count">{{ billingModels.length }} 个模型</small></h3>
              <p>模型从「API 配置」里自动读出来，不用手输。给某个模型填了价就按它算；留空的按上面的默认价。</p>
            </div>
            <button type="button" class="ax-btn is-sm" :disabled="billingLoading" @click="loadCreditBillingModels">重新读取模型</button>
          </div>
          <div v-if="billingModels.length" class="ax-table-wrap">
            <table class="ax-table">
              <thead><tr><th>能力</th><th>平台</th><th>模型</th><th>每次扣</th><th class="is-right">价格</th></tr></thead>
              <tbody>
                <tr v-for="item in billingModels" :key="item.key">
                  <td><span class="ax-tag">{{ abilityLabel(item.ability) }}</span></td>
                  <td><span class="billing-provider-name" :title="item.providerLabel || item.provider">{{ item.providerLabel || item.provider }}</span></td>
                  <td><span class="ax-mono billing-model-name" :title="item.model">{{ item.model }}</span></td>
                  <td>
                    <span class="billing-num-input is-sm">
                      <input v-model.number="item.credits" type="number" min="0" step="1" placeholder="默认价" :aria-label="`${item.model} 每次扣多少积分`" /><em>积分</em>
                    </span>
                  </td>
                  <td class="is-right">
                    <span v-if="item.credits == null || item.credits === ''" class="ax-pill is-muted">按默认价</span>
                    <button v-else type="button" class="ax-btn is-sm is-ghost" @click="resetModelPrice(item)">改回默认价</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="ax-empty is-compact">
            <strong>{{ billingModelsLoading ? '正在读取模型…' : '没有读到模型' }}</strong>
            <span v-if="!billingModelsLoading">先到「API 配置」里填好并打开模型，再点「重新读取模型」。</span>
          </div>
        </section>

        <section class="ax-card">
          <div class="ax-card-head">
            <div>
              <h3>用户看到的提示文字</h3>
              <p>花括号里的是占位符，会自动换成真实数字，别删掉。改完点「保存提示文字」马上生效。</p>
            </div>
            <div class="ax-actions">
              <button type="button" class="ax-btn is-sm" @click="resetBillingMessages">恢复默认文案</button>
              <button type="button" class="ax-btn is-sm is-primary" :disabled="billingMessageSaving" @click="saveBillingMessages">{{ billingMessageSaving ? '保存中…' : '保存提示文字' }}</button>
            </div>
          </div>
          <div class="ax-form is-3col">
            <label v-for="item in billingMessageFields" :key="item.key" class="ax-field">
              <span>{{ item.label }}</span>
              <textarea v-model="billingMessages[item.key]" rows="3"></textarea>
              <small>可用占位符：{{ item.placeholders }}</small>
            </label>
          </div>
        </section>
      </section>

      <section v-else class="ax-page settings-page">
        <header class="ax-head">
          <div>
            <h2>系统设置</h2>
            <p>平台运行状态和常用设置入口。这里只显示真实状态，具体设置到对应页面里改。</p>
          </div>
          <div class="ax-head-actions">
            <button type="button" class="ax-btn" :disabled="systemStatus.loading" @click="loadSystemStatus">{{ systemStatus.loading ? '检查中…' : '重新检查' }}</button>
          </div>
        </header>

        <div class="ax-stats">
          <div class="ax-stat" :class="{ 'is-alert': systemStatus.loaded && !systemStatus.health?.ok }">
            <span>服务器</span>
            <strong class="settings-stat-text">{{ !systemStatus.loaded ? '检查中' : (systemStatus.health?.ok ? '运行正常' : '连接不上') }}</strong>
            <small>{{ !systemStatus.loaded || systemStatus.health?.ok ? '后端接口能正常访问' : '请检查后端服务是否启动' }}</small>
          </div>
          <div class="ax-stat" :class="{ 'is-warn': systemStatus.health?.ok && !systemStatus.health.databaseConfigured }">
            <span>数据库</span>
            <strong class="settings-stat-text">{{ !systemStatus.health?.ok ? '—' : (systemStatus.health.databaseConfigured ? '已连接' : '未配置') }}</strong>
            <small>账号、作品和积分都存在这里</small>
          </div>
          <div class="ax-stat">
            <span>登录方式</span>
            <strong class="settings-stat-text">{{ !systemStatus.health?.ok ? '—' : (systemStatus.health.authMode === 'server' ? '服务器账号' : '演示模式') }}</strong>
            <small>{{ systemStatus.health?.authMode === 'demo' ? '演示模式不保存真实数据' : '账号密码由服务器校验' }}</small>
          </div>
          <div class="ax-stat" :class="{ 'is-warn': systemStatus.ai && !systemStatus.ai.ok }">
            <span>默认 AI 平台</span>
            <strong class="settings-stat-text" :title="systemDefaultProviderLabel">{{ systemDefaultProviderLabel }}</strong>
            <small>{{ !systemStatus.ai ? '读取中' : (systemStatus.ai.ok ? '已配置 Key，可以出图' : '还没配置 API Key') }}</small>
          </div>
        </div>

        <div class="ax-grid-2">
          <section class="ax-card">
            <div class="ax-card-head"><div><h3>平台信息</h3><p>平台名称目前写在程序里，需要改名请联系技术人员。</p></div></div>
            <div class="ax-kv settings-kv">
              <div><span>平台名称</span><strong>AI创意设计思维平台</strong></div>
              <div><span>机构</span><strong>{{ userStore.user?.organization?.name || '—' }}<small v-if="userStore.user?.organization?.code" class="settings-sub ax-mono">{{ userStore.user.organization.code }}</small></strong></div>
              <div><span>当前管理员</span><strong>{{ userStore.user?.name || '—' }}<small class="settings-sub ax-mono">{{ userStore.user?.account }}</small></strong></div>
              <div><span>管理范围</span><strong>{{ accountPermissionStore.organizationWide ? '整个机构' : '指定分部' }}</strong></div>
              <div><span>前端 AI 模式</span><strong>{{ aiModeLabel }}</strong></div>
              <div><span>后端地址</span><strong class="ax-mono">{{ apiBaseUrl }}</strong></div>
            </div>
          </section>

          <section class="ax-card">
            <div class="ax-card-head"><div><h3>待处理</h3><p>需要管理员看一眼的事情，点一下直接过去。</p></div></div>
            <div class="ax-rows">
              <button type="button" class="ax-row settings-link" @click="selectAdminNav('ops')">
                <span class="ax-row-main"><strong>异常管理</strong><small>服务器错误和 AI 调用失败</small></span>
                <span class="ax-pill" :class="systemStatus.opsOpen ? 'is-warn' : 'is-ok'">{{ systemOpsText }}</span>
              </button>
              <button v-if="systemStatus.riskPending !== null" type="button" class="ax-row settings-link" @click="selectAdminNav('risk')">
                <span class="ax-row-main"><strong>账号安全</strong><small>被拦截的内容、需要关心的表达</small></span>
                <span class="ax-pill" :class="systemStatus.riskPending ? 'is-warn' : 'is-ok'">{{ systemStatus.riskPending ? systemStatus.riskPending + ' 条待处理' : '没有待处理' }}</span>
              </button>
              <button type="button" class="ax-row settings-link" @click="selectAdminNav('api')">
                <span class="ax-row-main"><strong>AI 平台</strong><small>{{ systemUnconfiguredProviders.length ? '没配置 Key：' + systemUnconfiguredProviders.join('、') : '没配置 Key 的平台用户端用不了' }}</small></span>
                <span class="ax-pill" :class="systemUnconfiguredProviders.length ? 'is-warn' : 'is-ok'">{{ !systemStatus.ai ? '—' : (systemUnconfiguredProviders.length ? systemUnconfiguredProviders.length + ' 个未配置' : '全部已配置') }}</span>
              </button>
            </div>
          </section>
        </div>

        <section class="ax-card">
          <div class="ax-card-head"><div><h3>常用设置</h3><p>平台的各项设置分别在下面这些页面里。</p></div></div>
          <div class="settings-shortcuts">
            <button v-for="item in systemShortcuts" :key="item.id" type="button" class="settings-shortcut" @click="selectAdminNav(item.id)">
              <AdminIcon :name="item.id" size="lg" />
              <span class="ax-cell-main"><strong>{{ item.label }}</strong><small>{{ item.desc }}</small></span>
              <AdminIcon name="chevron" plain class="settings-shortcut-arrow" />
            </button>
          </div>
        </section>
        <p v-if="systemStatus.error" class="ax-note is-bad">{{ systemStatus.error }}</p>
      </section>


    </section>

    <div v-if="showApiConfig" class="api-config-mask" @click.self="showApiConfig = false">
      <section class="api-config-dialog">
        <header>
          <h2>AI接口密钥配置</h2>
          <button type="button" @click="showApiConfig = false">关闭</button>
        </header>
        <p>真实 API Key 建议放在后端环境变量里，前端只配置接口地址和测试模式，避免密钥暴露到浏览器。</p>
        <div class="env-box">
          <strong>.env.local 当前建议配置</strong>
          <code>VITE_AI_MODE=auto</code>
          <code>VITE_API_BASE_URL=/api</code>
        </div>
        <div class="env-box">
          <strong>后端需要提供的接口</strong>
          <code>GET /api/ai/health</code>
          <code>POST /api/ai/image/generate</code>
        </div>
        <div class="dialog-actions">
          <button type="button" :disabled="apiTesting" @click="runAiConnectionTest">{{ apiTesting ? '测试中' : '测试连接' }}</button>
          <button type="button" class="secondary" @click="showApiConfig = false">完成</button>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import H5ReportRenderer from '../components/H5ReportRenderer.vue'
import GalleryAuditPanel from '../components/GalleryAuditPanel.vue'
import GalleryCategoryPanel from '../components/GalleryCategoryPanel.vue'
import H5TemplateStudio from '../components/H5TemplateStudio.vue'
import H5WorkflowLibraryPanel from '../components/H5WorkflowLibraryPanel.vue'
import { productDesignStoryPages } from '../utils/productDesignStory'
import { useUserStore } from '../stores/userStore'
import { courseCategories, useCourseStore } from '../stores/courseStore'
import { useAccountPermissionStore } from '../stores/accountPermissionStore'
import { useGalleryStore } from '../stores/galleryStore'
import {
  deleteTemplateSourceFile,
  getTemplateSourceFile,
  reportLayoutOptions,
  reportRendererPresets,
  reportTemplateCategories,
  saveTemplateSourceFile,
  useReportTemplateStore,
} from '../stores/reportTemplateStore'
import { h5ReportLayouts, h5ReportModules, useH5ReportTemplateStore } from '../stores/h5ReportTemplateStore'
import { generateArtwork, getAiMode, testAiConnection, getJuniorCreativeAgentConfig, saveJuniorCreativeAgentConfig } from '../services/aiGateway'
import { generateArtwork as generateMockArtwork } from '../services/mockAiService'
import { apiClient } from '../services/apiClient'
import { getBrandLogo } from '../services/workbenchGateway'
import {
  adminFetchCreditOverview,
  adminAdjustCredits,
  adminFetchUserCredit,
  adminFetchCreditCodes,
  adminGenerateCodes,
  adminConfirmCode,
  adminVoidCode,
  adminExportCreditCodesUrl,
} from '../services/creditGateway'
import AiSkillCenter from '../components/AiSkillCenter.vue'
import PromptLibraryAdmin from '../components/PromptLibraryAdmin.vue'
import ImageStyleAdmin from '../components/ImageStyleAdmin.vue'
import WorkbenchAdmin from '../components/WorkbenchAdmin.vue'
import AgentPartnerAdmin from '../components/AgentPartnerAdmin.vue'
import AdminOverview from '../components/AdminOverview.vue'
import AdminIcon from '../components/admin/AdminIcon.vue'
import AdminAvatar from '../components/admin/AdminAvatar.vue'
import { adminIcon } from '../components/admin/adminIcons.js'
import AdminRiskCenter from '../components/AdminRiskCenter.vue'
import AdminOpsCenter from '../components/AdminOpsCenter.vue'
import AdminBanDialog from '../components/AdminBanDialog.vue'
import '../styles/admin-theme.scss'
import '../styles/admin-ui.scss'
import '../styles/admin-shell.scss'
// 第三版外观：苹果「系统设置」风格（只改外观，放在最后覆盖前两版）
import '../styles/admin-apple.scss'
import { defaultSkillConfiguration } from '../utils/aiSkillSchema'
import { accountFormatError, sanitizeAccountInput } from '../utils/accountRules'
import { saveEditableAiSkill } from '../services/adminAiSkillEditorStore'
import { uploadCourseAsset, uploadCoursePdfToServer, uploadCourseVideoToServer } from '../services/coursePptConversion'
import { parsePptxTemplate } from '../utils/pptxTemplateParser'
import { parseCourseDocument, readCourseDocumentText, readCoursePptPages } from '../utils/courseUploadParser'
import { createCourseAssetId, createCourseAssetObjectUrl, getCourseAsset, saveCourseAsset } from '../stores/courseAssetStore'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const courseStore = useCourseStore()
const accountPermissionStore = useAccountPermissionStore()
const galleryStore = useGalleryStore()

const galleryAuditPanel = ref(null)
const reportTemplateStore = useReportTemplateStore()
const h5TemplateStore = useH5ReportTemplateStore()
// 地址栏 ?module= 能直接打开的后台页面：刷新后还停在原来那页，也方便把某一页的链接发给别人。
const ADDRESSABLE_ADMIN_MODULES = ['accounts', 'risk', 'ops', 'courses', 'api', 'creditBilling', 'agents', 'settings', 'promptLibrary', 'featureManagement', 'imageStyleTemplates', 'workbench', 'partner', 'audit', 'galleryCategories']
const activeNav = ref(route.path === '/admin/h5-report-workflows'
  ? 'h5WorkflowLibrary'
  : route.path === '/admin/h5-reports' || route.query.module === 'h5ReportTemplates'
    ? 'h5ReportTemplates'
    : (ADDRESSABLE_ADMIN_MODULES.includes(route.query.module) ? route.query.module : 'dashboard'))
// 侧栏顶部品牌标识：后台「工作台管理」配了 LOGO 就换成图片，没配就还是「AI」方块。
const brandLogoUrl = ref('')
const accountPanel = ref('accounts')
const accountRoleFilter = ref('all')
const accountKeyword = ref('')
const accountCreditMap = ref({})
// ── AI 用量与计费面板 ───────────────────────────────────────────────
// 三块内容：能力默认额度（每天送几次 + 用完每次扣几分）、模型单独定价、用户端提示文案。
const billingLoading = ref(false)
const billingSaving = ref(false)
const billingError = ref('')
const billingNotice = ref('')
const billingLoaded = ref(false)
const billingAbilities = ref([])
const billingModels = ref([])
const billingModelsLoading = ref(false)
const billingRawModelPrices = ref([])
const billingMessages = reactive({})
const billingMessageDefaults = reactive({})
const billingMessageSaving = ref(false)
// 文案字段：key 与后端 CREDIT_MESSAGE_DEFAULTS 一一对应，label / 占位符在这里给中文说明。
const billingMessageFields = [
  { key: 'freeExhausted', label: '免费次数用完，问要不要扣积分', placeholders: '{ability} {credits} {balance} {free}' },
  { key: 'notEnough', label: '积分不够时', placeholders: '{credits} {balance} {shortfall} {ability}' },
  { key: 'noBalance', label: '余额为 0，直接拦下', placeholders: '{ability} {credits}' },
  { key: 'failedRefund', label: '生成失败，积分已退回', placeholders: '{credits} {ability}' },
  { key: 'rechargeGuide', label: '充值引导提示', placeholders: '无' },
  { key: 'redeemSuccess', label: '积分码兑换成功', placeholders: '{credits}' },
]
const showCreditDialog = ref(false)
const creditTarget = ref(null)
const creditAdjustSubmitting = ref(false)
const creditDetail = reactive({ balance: 0, freeTotal: 60, freeUsed: 0, freeRemaining: 60, entries: [] })
const creditAdjustForm = reactive({ delta: 100, reason: '' })
const creditCodes = ref([])
const creditCodeLoading = ref(false)
const creditCodeSubmitting = ref(false)
const creditCodeStatusFilter = ref('')
const codeDraft = reactive({ faceValue: 100, quantity: 1, prefix: '', note: '', expiresInDays: '', orderNo: '' })
const accountCampusFilter = ref('all')
const accountStatusFilter = ref('all')
const showAccountDetailDialog = ref(false)
const showAccountEditDialog = ref(false)
const selectedAccountDetailId = ref('')
const accountDetailTab = ref('basic')
const accountEditMode = ref('edit')
const accountEditDraft = reactive({
  id: '', role: '', name: '', account: '', className: '', campusId: '', classIds: [],
  status: 'enabled', groupIds: [],
  adminScopeType: 'campus', adminCampusIds: [], password: '', passwordConfirm: '',
})
// 账号输入边打字边纠正：大写转小写、剔除中文与符号，避免填完才被服务端打回。
function onAccountDraftInput(event) {
  accountEditDraft.account = sanitizeAccountInput(event?.target?.value ?? '')
}
const organizationSetupLoading = ref(false)
const organizationSetupError = ref('')
const organizationSetup = reactive({ campuses: [], classes: [], codes: [] })
const campusDraft = reactive({ name: '', code: '' })
const campusKeyword = ref('')
const campusStatusFilter = ref('all')
const showCampusEditDialog = ref(false)
const campusEditDraft = reactive({ id: '', name: '', code: '', status: 'active' })
const classDraft = reactive({ campusId: '', name: '' })
const enrollmentDraft = reactive({ campusId: '', classId: '', role: 'student', maxUses: 1, label: '' })
const coursePanel = ref('bulk')
const courseKeyword = ref('')
const selectedAdminCourseIds = ref([])
const editingAdminCourseId = ref('')
const selectedAuthCourseId = ref(courseStore.courses[0]?.id || '')
const selectedAuthGroupIds = ref([])
// 课程授权里「小画家能看到」：全机构 / 按真实班级（服务端 course_assignments）
const selectedAuthOrganization = ref(false)
const selectedAuthClassIds = ref([])
const courseAuthSaving = ref(false)
const courseAuthError = ref('')
const selectedPermissionGroupId = ref(accountPermissionStore.permissionGroups[0]?.id || '')
const groupMemberRoleFilter = ref('all')
const templatePanel = ref('list')
const templateKeyword = ref('')
const selectedH5TemplateId = ref(h5TemplateStore.templates[0]?.id || '')
const productStoryPageKeys = ['cover', 'inspiration', 'problem', 'sketch', 'ai', 'model', 'scene', 'reflection']
const h5TemplateForm = reactive(createH5TemplateForm(h5TemplateStore.templates[0]))
// 旧方案的三个页签已停用，进 H5 报告中心默认落在「文案与智能体」
const h5CenterTab = ref('agent')
const h5TemplateStudio = ref(null)
const h5CenterRevision = ref('')
async function switchH5CenterTab(tab) {
  if (H5_RETIRED_TABS.includes(tab)) return
  if (tab !== h5CenterTab.value && h5TemplateStudio.value && !await h5TemplateStudio.value.canLeave()) return
  h5CenterTab.value = tab
}
const selectedH5StrategyId = ref('h5-standard')
const h5TemplateKeyword = ref('')
const selectedH5EditionId = ref('starter')
const h5CenterSaving = ref(false)
const h5WorkflowOpening = ref(false)
const h5CenterStatus = ref('正在读取服务器配置…')
const defaultH5Strategies = [
  { id: 'h5-standard', name: '方案1：标准 H5 报告', type: 'renderer', status: 'enabled', studentSelectable: true, executionReady: true, rendererKey: 'existing-h5-renderer', workflowId: '', workflowVersion: 0 },
  { id: 'h5-canvas-workflow', name: '方案2：无限画布工作流报告', type: 'canvas-workflow', status: 'testing', studentSelectable: false, executionReady: false, rendererKey: 'canvas-workflow-renderer', workflowId: '', workflowVersion: 0, adapterKey: 'h5-report-canvas-adapter', boundTemplateIds: [], inputPolicy: { text: 'report-document', images: 'all-project-materials', template: 'selected-h5-template' }, outputPolicy: { resultType: 'page-images', maxPages: 12, ratio: '9:16', requireImageResult: true } },
]
const h5ReportCenterConfig = reactive({ version: 2, strategies: defaultH5Strategies.map((item) => ({ ...item })), templates: [], editions: {} })
const h5StyleStep = ref('base')
const h5StyleSteps = [
  { id: 'base', label: '1 基础风格' },
  { id: 'cover', label: '2 封面设置' },
  { id: 'modules', label: '3 章节与组件' },
  { id: 'poster', label: '4 分享海报' },
]
const productStoryPageOptions = [
  { key: 'cover', label: '这是我的设计', variants: [{ value: 'cover-student-product-a', label: '作品主视觉' }, { value: 'cover-student-product-b', label: '作品拼贴' }], backgrounds: [{ value: 'blueprint-collage', label: '蓝图拼贴' }, { value: 'material-paper', label: '材质纸张' }] },
  { key: 'inspiration', label: '我的灵感从哪里来', variants: [{ value: 'inspiration-board-a', label: '灵感拼贴板' }, { value: 'inspiration-board-b', label: '观察连线' }], backgrounds: [{ value: 'research-collage', label: '观察拼贴' }, { value: 'sticky-notes', label: '便签记录' }] },
  { key: 'problem', label: '我想解决的问题', variants: [{ value: 'problem-cards-a', label: '问题卡片' }, { value: 'problem-scene-a', label: '场景说明' }], backgrounds: [{ value: 'sticky-notes', label: '便签记录' }, { value: 'blueprint-paper', label: '蓝图纸张' }] },
  { key: 'sketch', label: '我画下第一版想法', variants: [{ value: 'sketch-compare-a', label: '草图对比' }, { value: 'sketch-single-a', label: '单张草图' }], backgrounds: [{ value: 'blueprint-paper', label: '蓝图纸张' }, { value: 'material-paper', label: '材质纸张' }] },
  { key: 'ai', label: '我和AI一起试方案', variants: [{ value: 'ai-compare-a', label: '三案比较' }, { value: 'ai-single-a', label: '单案解析' }], backgrounds: [{ value: 'ai-connection', label: 'AI连线' }, { value: 'blueprint-paper', label: '蓝图纸张' }] },
  { key: 'model', label: '我把它做成立体的', variants: [{ value: 'model-showcase-a', label: '3D展示' }, { value: 'model-thinking-a', label: '结构思考' }], backgrounds: [{ value: 'model-grid', label: '建模网格' }, { value: 'blueprint-paper', label: '蓝图纸张' }] },
  { key: 'scene', label: '我想象它真正被使用', variants: [{ value: 'scene-immersive-a', label: '沉浸场景' }, { value: 'scene-collage-a', label: '环境拼贴' }], backgrounds: [{ value: 'scene-extend', label: '场景延伸' }, { value: 'research-collage', label: '观察拼贴' }] },
  { key: 'reflection', label: '这是我的收获', variants: [{ value: 'reflection-timeline-a', label: '成长时间线' }, { value: 'reflection-cards-a', label: '收获卡片' }], backgrounds: [{ value: 'blueprint-paper', label: '蓝图纸张' }, { value: 'material-paper', label: '材质纸张' }] },
]
const productStoryCharacterPoses = [
  { value: 'presenting', label: '介绍作品' }, { value: 'thinking', label: '观察思考' }, { value: 'pointing', label: '指向问题' }, { value: 'drawing', label: '绘制草图' },
  { value: 'comparing', label: '比较方案' }, { value: 'presenting-3d', label: '展示立体作品' }, { value: 'explaining', label: '讲解场景' }, { value: 'thumbs-up', label: '完成点赞' },
]
const productStorySourceTypes = [
  { value: 'finalWork', label: '最终作品' },
  { value: 'sketch', label: '草稿/手稿' },
  { value: 'aiImage', label: 'AI创意图' },
  { value: 'model3d', label: '3D视觉图' },
  { value: 'scene', label: '环境宣传图' },
  { value: 'video', label: '视频封面' },
]
const h5TemplateBaseline = ref('')
const h5TemplateDirty = ref(false)
const h5DraftSaving = ref(false)
const h5ReferenceUploading = reactive({})
const h5HasUnpublishedChanges = ref(false)
const h5PreviewDevice = ref('tablet')
const h5PreviewPage = ref(0)
const h5AgentTesting = ref(false)
const h5Reports = ref([])
const h5ReportsLoading = ref(false)
const h5AuditFilter = ref('all')
const h5AuditFilters = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待审核' },
  { value: 'published', label: '已发布' },
  { value: 'rejected', label: '已驳回' },
  { value: 'offline', label: '已下架' },
]
const h5PreviewPages = computed(() => h5TemplateForm.layout === 'product-design-story'
  ? productDesignStoryPages({
      title: '我的城市漫游车', studentName: '林同学', ideaSummary: '我观察到短距离出行时，很多人希望走得更轻松，也希望车子看起来有自己的想法。',
      sketchOriginal: '/assets/h5-report/product-design-story.png', sketchOptimized: '/assets/h5-report/product-design-story.png',
      referenceImages: ['/assets/h5-report/product-design-story.png'], versions: [{ imageUrl: '/assets/h5-report/product-design-story.png' }], finalVersionId: '', models3d: [], videos: [],
    }, {}, h5TemplateForm)
  : [
  { id: 'cover', type: 'cover', label: '封面', eyebrow: '我的创作报告', title: '未来城市生态空间', text: '我是林同学，这是我用观察、草图和想象完成的创作。', src: '/assets/h5-report/ai-tech.png' },
  { id: 'idea', type: 'idea', label: '创意', eyebrow: '我的创意想法', title: '让城市和自然一起呼吸', text: '我从树叶的脉络中找到了道路的灵感，希望城市能收集雨水、净化空气，也让每一层空间都连接阳光。', src: '/assets/h5-report/kids-classroom.png' },
  { id: 'process', type: 'process', label: '过程', eyebrow: '一步一步完成', title: '从手稿到作品', text: '我先画构图，再比较不同方案，最后保留了最能表达主题的细节。', src: '/assets/h5-report/growth-file.png' },
  { id: 'finalWork', type: 'finalWork', label: '作品', eyebrow: '我的最终作品', title: '完成啦', text: '这是我最满意的作品，希望你能发现里面的小惊喜。', src: '/assets/h5-report/art-gallery.png' },
  { id: 'backCover', type: 'backCover', label: '结尾', eyebrow: '谢谢观看', title: '我的创作故事讲完啦', text: '每一次观察和尝试，都让我更接近自己的想法。' },
])
const filteredH5Reports = computed(() => h5Reports.value.filter((item) => h5AuditFilter.value === 'all' || item.status === h5AuditFilter.value))
const templateCategoryFilter = ref('all')
const templateStatusFilter = ref('all')
const selectedTemplateId = ref(reportTemplateStore.templates[0]?.id || '')
const selectedReportTemplateIds = ref([])
const pendingTemplateSourceFile = ref(null)
const templateParsing = ref(false)
const templateEditorPageIndex = ref(0)
const selectedTemplateElementId = ref('')
const selectedTemplateLayer = ref('none')
const templateEditorZoom = ref(86)
const templateEditorCanvasRef = ref(null)
const templateSlotImageInput = ref(null)
const templateDecorImageInput = ref(null)
const templateDecorUploadTargetId = ref('')
const templateSlotDragTargetId = ref('')
const templateCanvasImageDragActive = ref(false)
const templateBackgroundDragActive = ref(false)
const templateInspectorSectionIds = ['template', 'page', 'element', 'brand']
const templateInspectorPreferenceKey = 'admin-report-template-inspector-v1'
const savedTemplateInspectorPreferences = loadTemplateInspectorPreferences()
const templateInspectorSectionOrder = ref(savedTemplateInspectorPreferences.order)
const templateInspectorCollapsed = reactive(savedTemplateInspectorPreferences.collapsed)
const templateResizeHandles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const templateFontOptions = ['Microsoft YaHei', 'SimHei', 'SimSun', 'KaiTi', 'Arial', 'Georgia']
const templateTextAlignOptions = [
  { value: 'left', label: '左对齐' },
  { value: 'center', label: '居中' },
  { value: 'right', label: '右对齐' },
]
const templateElementDragState = reactive({
  slotId: '',
  startClientX: 0,
  startClientY: 0,
  startX: 0,
  startY: 0,
  moved: false,
})
const templateElementResizeState = reactive({
  slotId: '',
  handle: '',
  startClientX: 0,
  startClientY: 0,
  startX: 0,
  startY: 0,
  startW: 0,
  startH: 0,
})
const apiTesting = ref(false)
const apiTestResult = ref(null)
const showApiConfig = ref(false)
const providerSaving = ref(false)
const creatingProvider = ref(false)
const providerView = ref('list')
const providerFormRenderKey = ref(0)
const agentSaving = ref(false)
const agentStatus = ref('后端保存后，用户端生成报告会自动使用这套智能体配置。')
const agentCanvasView = ref(false)
const canvasAgentSaving = ref(false)
const canvasAgentStatus = ref('正在读取无限画布智能体配置。')
const canvasAgentCapabilities = [
  { key: 'createNode', label: '创建节点' }, { key: 'createEdge', label: '建立连线' },
  { key: 'updateNode', label: '修改节点' }, { key: 'moveNode', label: '移动节点' },
  { key: 'deleteNode', label: '删除节点' }, { key: 'deleteEdge', label: '断开连线' },
  { key: 'runGenerator', label: '执行图像/视频生成' }, { key: 'recognizeRegion', label: '标记区域识别 / 读图' },
  { key: 'groupNodes', label: '节点成组 / 解组' }, { key: 'canvasTemplate', label: '画布模板（存/用模板）' },
  { key: 'addElementReference', label: '局部元素引用' },
]
const canvasAgentRules = [
  { key: 'reuseNodes', label: '优先复用已有节点' }, { key: 'askWhenUnclear', label: '需求不完整时先提问' },
  { key: 'noQuotaWithoutRequest', label: '用户未要求时不消耗生成额度' }, { key: 'verifyEachStep', label: '每步执行后校验' },
]
const canvasAgentForm = reactive({ enabled: true, name: '创作 Agent', flowKey: 'canvas.assistant', model: '创作 Agent', maxActions: 12, prompt: '你是一个通用型无限画布工作流助手。\n\n【人设】\n你是一名专业、稳健的工作流设计师，不限定行业和用途。\n\n【工作目标】\n先读取整张画布，理解用户目标，规划节点和连线，并在每一步后校验真实状态。\n\n【回答与提问规则】\n信息不足时先提问，一次最多提出 3 个关键问题；不要猜测，不要直接创建节点。信息足够后，先简要总结理解，再执行工作流。\n\n【执行边界】\n优先复用已有节点；用户没有明确要求生成时不执行生成；不得伪造节点、连线或结果；只使用系统支持的节点类型和操作。', personaPrompt: '', responseStyle: '', systemPrompt: '', capabilities: { createNode: true, createEdge: true, updateNode: true, moveNode: true, deleteNode: true, deleteEdge: true, runGenerator: true, recognizeRegion: true, groupNodes: true, canvasTemplate: true, addElementReference: true }, rules: { reuseNodes: true, askWhenUnclear: true, noQuotaWithoutRequest: true, verifyEachStep: true } })
const agentStatusFilter = ref('enabled')
const agentTypeFilter = ref('all')
const agentKeyword = ref('')
const agentView = ref('list')
const agentLogOpen = ref(false)
const agentLogs = ref([])
const agentLogLoading = ref(false)
const agentLogFlowFilter = ref('')
const agentLogStatusFilter = ref('all')
const dryRunText = ref('')
const dryRunLoading = ref(false)
const dryRunResult = ref(null)
const dryRunError = ref('')
// 这四句覆盖了老师最关心的四种情况：明确下令 / 只在想 / 换页面 / 找东西
const dryRunSamples = [
  '帮我画一只月球上的猫',
  '我想画猫，但不知道背景用什么',
  '给我做一个关于恐龙的视频',
  '我之前画的作品都放哪了',
]
const selectedAgentId = ref('')
const selectedAgentIds = ref([])
const selectedFlowKey = ref('report.full')
const selectedProvider = ref('agnes')
const selectedProviderIds = ref([])
const providerCategory = ref('painting')
const promptExpanded = ref(false)
const aiMode = getAiMode()
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api'
const defaultProviderCatalog = {
  agnes: {
    key: 'agnes',
    label: 'Agnes AI',
    baseUrl: 'https://apihub.agnes-ai.com/v1',
    imageModel: 'agnes-image-2.0-flash',
    textModel: 'agnes-2.0-flash',
    videoModel: 'agnes-video-v2.0',
    configured: false,
    category: 'painting',
  },
  volcengine: {
    key: 'volcengine',
    label: '火山方舟',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    imageModel: 'doubao-seedream-4-0-250828',
    textModel: 'doubao-seed-1-6-250615',
    videoModel: '',
    configured: false,
  },
  openai: {
    key: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    imageModel: 'gpt-image-1',
    textModel: 'gpt-4.1-mini',
    videoModel: '',
    configured: false,
  },
  deepseek: {
    key: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    imageModel: '',
    textModel: 'deepseek-chat',
    videoModel: '',
    configured: false,
  },
}
const providerConfig = reactive({
  defaultProvider: 'agnes',
  defaultTextProvider: 'agnes',
  // 出图备用模型（服务端 imageFallbackView）：{ enabled, provider, model, providerLabel, modelLabel, usable, problem }
  imageFallback: null,
  providers: JSON.parse(JSON.stringify(defaultProviderCatalog)),
})
const reportAgentState = reactive({ agents: [], bindings: {}, activeAgentId: '', flows: [] })
const agentBindings = reactive({})
const reportAgentForm = reactive({
  id: '',
  name: '',
  type: 'report',
  taskType: 'text',
  status: 'enabled',
  updatedAt: '',
  flowKey: 'report.full',
  boundFlowKeys: [],
  allowedModelKeys: [],
  defaultModelKey: '',
  fallbackModelKey: '',
  modelParams: {
    temperature: 0.2,
    timeoutSeconds: 120,
    ratio: '16:9',
    count: 1,
    quality: 'high',
    supportReference: true,
  },
  masterPrompt: '',
  persona: '',
  reportGoal: '',
  generationLogic: '',
  inputScope: '',
  outputRules: '',
  qualityRules: '',
  fallbackRules: '',
  pageStructure: '',
  layoutRules: '',
  difficultyRules: {
    junior: '',
    starter: '',
    advanced: '',
    pro: '',
  },
})
const providerForm = reactive({
  category: 'painting',
  capabilitiesText: '',
  bindingsText: '',
  key: 'agnes',
  label: 'Agnes AI',
  baseUrl: 'https://apihub.agnes-ai.com/v1',
  imageModel: 'agnes-image-2.0-flash',
  textModel: 'agnes-2.0-flash',
  videoModel: 'agnes-video-v2.0',
  imageModels: ['agnes-image-2.0-flash'],
  textModels: ['agnes-2.0-flash'],
  videoModels: ['agnes-video-v2.0'],
  models: ['agnes-2.0-flash', 'agnes-image-2.0-flash', 'agnes-video-v2.0'],
  defaultModel: 'agnes-2.0-flash',
  apiKey: '',
  secretId: '',
  secretKey: '',
  region: 'ap-guangzhou',
  endpoint: 'ai3d.tencentcloudapi.com',
  enabled: true,
  defaultEdition: 'rapid',
  editions: { rapid: true, pro: true },
  // 参考图能力：决定画布上的「上游图 / 标记元素」能否真正送进图像模型。
  imageInputMode: 'extra-body-image',
  imageEditProtocol: 'none',
  imageEditModelsText: '',
  imageEditSize: '1024x1024',
  imageInputField: 'image',
  imageInputMaxImages: 4,
  checkReferenceImage: false,
  // 火山方舟图片的官方水印开关（方舟 watermark 参数），默认开启。
  imageWatermark: true,
  // 参考图方式：默认自动识别（按地址 / 模型名），打开「手动指定」才用下面几个字段
  imageInputAuto: true,
  // 模型显示名：{ 模型名: 用户端看到的名字 }，没填的自动起名
  modelLabels: {},
})
const providerModelDraft = ref('')
const providerModelLoading = ref(false)
const providerModelsExpanded = ref(false)
const upstreamModels = ref([])
const selectedUpstreamModel = ref('')
const adminCourseForm = reactive({
  title: '',
  category: 'storefront',
  difficulty: '少儿基础 · 8-10岁',
  description: '',
  cover: '',
  coverAssetId: '',
  coverFileName: '',
  coverPrompt: '',
  useParsedCoverPrompt: true,
  videoAssetId: '',
  videoFileName: '',
  videoUrl: '',
  pptAssetId: '',
  pptFileName: '',
  pptPdfUrl: '',
  pptSlideImages: [],
  documentFileName: '',
  questionsText: '',
  questions: [],
  pptPages: [],
  designRequirements: [],
  documentParseStatus: {
    state: 'idle',
    message: '尚未上传课程文档',
    textLength: 0,
    fieldCount: 0,
    questionCount: 0,
    preview: '',
  },
  authorizedGroupIds: [],
})
const adminVideoFileInput = ref(null)
const adminPptFileInput = ref(null)
const adminDocumentFileInput = ref(null)
const adminCoverFileInput = ref(null)
const adminCourseDocumentText = ref('')
const adminCourseDocumentParsing = ref(false)
const adminCourseCoverGenerating = ref(false)
const showAdminCourseCoverPreview = ref(false)
const permissionGroupDraft = reactive({
  name: '',
  description: '',
  enabled: true,
  memberIds: [],
  permissions: {},
})
const reportTemplateForm = reactive({
  id: '',
  name: '',
  description: '',
  category: 'classroom',
  rendererPreset: 'classroom',
  status: 'draft',
  previewImage: '',
  backgroundImage: '',
  decorImages: [],
  templatePages: [],
  assetMode: 'structured-assets',
  sourceFileName: '',
  sourceFileSize: 0,
  sourceUpdatedAt: '',
  parseStatus: 'none',
  parseMessage: '',
  importMeta: null,
  fontFamily: 'Microsoft YaHei',
  footerBrand: '美佳美画 AI 创意美术',
  styleTagsText: '',
  suitableCoursesText: '',
  suitableAgeRangesText: '',
  suitablePages: [],
  textDensity: 'medium',
  imageCapacity: 1,
  overflowPolicy: 'shrink-then-split',
  preferredLayouts: [],
  matchingKeywordsText: '',
  theme: {
    bg: 'F7FBFA',
    surface: 'FFFFFF',
    primary: '1F9D8A',
    secondary: '2563EB',
    accent: 'D9F99D',
    title: '12343B',
    text: '334155',
    muted: '64748B',
    soft: 'ECFDF5',
  },
  enabledLayouts: [],
  visibility: 'public',
  authorizedGroupIds: [],
  authorizedClasses: [],
})
const navItems = [
  { id: 'dashboard', label: '数据大盘', desc: '今天的新增与活跃、AI 调用、积分、接口可用率和待处理事项。', action: '刷新数据' },
  { id: 'accounts', label: '账号权限', desc: '账号、机构分部与班级、邀请码、权限组和积分码；每个管理员只看得到自己范围内的账号。', action: '查看权限' },
  // 账号安全：违规内容拦截记录、封禁 / 解封、登录锁定、敏感词、识别规则（接口 /api/admin/risk/*）。
  { id: 'risk', label: '账号安全', desc: '违规拦截记录、账号封禁、登录锁定、敏感词和拦截设置。', action: '封禁账号' },
  { id: 'courses', label: '课程库管理', desc: '上传课程、批量管理课程和配置课程授权。', action: '上传课程' },
  // 「报告模板风格库」是旧方案（PPT 式报告模板），已整块删除：菜单入口和面板都不在了。
  // 现在报告风格统一走下面的「报告工作流库」——那里发布一个画布模板，用户端「选一个风格」就多一张卡。
  { id: 'h5ReportTemplates', label: 'H5报告中心', desc: '统一管理用户端版本、视觉模板、文案智能体和审核发布。', action: '配置 H5' },
  { id: 'creditBilling', label: 'AI 用量与计费', desc: '设置每类 AI 能力每天赠送几次、用完扣多少积分，以及各模型单独定价。', action: '保存计费设置' },
  { id: 'h5WorkflowLibrary', label: '报告工作流库', desc: '按风格管理方案 2 的无限画布工作流，配置封面、用户可选与调用上限。', action: '管理工作流' },
  { id: 'api', label: 'API 配置', desc: '配置绘画、视频、3D、审核和支付等服务接口。', action: '新建 API 配置' },
  { id: 'featureManagement', label: 'AI玩法中心', desc: '配置、发布并管理用户端可用的图像与视频玩法。', action: '管理玩法' },
  { id: 'imageStyleTemplates', label: 'AI图像功能管理', desc: '维护用户端绘画页的图像风格模板：封面图、风格提示词与分组。', action: '编辑风格模板' },
  // 工作台是用户每天第一眼看到的页面：卡片图、背景（图或视频）、LOGO 都从这里换。
  // 注意卡片不能新增 —— 每张卡绑死一个用户页面，加了没有页面可去。
  { id: 'workbench', label: '工作台管理', desc: '替换用户工作台的卡片封面图、整屏背景（图片或视频）和品牌 LOGO。', action: '编辑外观' },
  { id: 'promptLibrary', label: '提示词库管理', desc: '维护初级版和入门版用户端的图标提示词分类与内容。', action: '管理提示词' },
  { id: 'agents', label: '智能体配置', desc: '配置报告智能体的人设、生成逻辑和输出规则。', action: '保存配置' },
  // 用户端顶栏「AI 伙伴」（会聊天、会用技能的智能体）：模型、形象、能力开关、技能导入试用发布、调用记录。
  { id: 'partner', label: 'AI 创作伙伴', desc: '用户端「AI 伙伴」用哪个模型、怎么说话、能做什么；技能（SKILL.md）导入、试用、发布；调用记录。', action: '管理 AI 伙伴' },
  // 作品广场：把原来平铺在外的「内容审核」收进来，再加「分类管理」。
  // 分类以前是拿作品的课程名去重凑的，没绑课程时会退回作品标题，按钮上就显示成某幅画的名字。
  { id: 'galleryCategories', label: '分类管理', desc: '维护用户端作品广场顶部的筛选分类，并给作品归类。', action: '新建分类' },
  { id: 'audit', label: '内容审核', desc: '设置提示词、图片和人工复核的审核策略。', action: '规则设置' },
  // 异常管理：服务器出错和 AI 调用失败的记录（接口 /api/admin/ops/errors）。
  { id: 'ops', label: '异常管理', desc: '服务器出错和 AI 调用失败的记录，处理完标记已解决。', action: '刷新' },
  { id: 'settings', label: '系统设置', desc: '管理平台基础信息、主题与运行环境。', action: '保存设置' },
]
const currentNav = computed(() => navItems.find((item) => item.id === activeNav.value) || navItems[0])
const adminDisplayName = computed(() => userStore.user?.name || userStore.user?.account || '管理员')
// 顶栏：页面往下滚以后才出现底部分隔线（苹果工具栏的做法）
const topbarScrolled = ref(false)
function updateTopbarScrolled() { topbarScrolled.value = window.scrollY > 4 }
onMounted(() => { updateTopbarScrolled(); window.addEventListener('scroll', updateTopbarScrolled, { passive: true }) })
onBeforeUnmount(() => window.removeEventListener('scroll', updateTopbarScrolled))
// 平板竖屏 / 手机：侧栏变成抽屉
const navDrawerOpen = ref(false)

// ---- 左侧导航：按用途分区，全部展开可见（2026-11-26 后台外壳重做） ----------------
// 以前 9 个功能页藏在「功能管理」折叠组里，找起来要先猜在哪个组；现在按用途分 5 个区，
// 每一项都有自己的图标和颜色，侧栏顶上还能直接搜。分区只改菜单的「摆法」，页面、路由、权限判断一律没动。
const NAV_SECTIONS = [
  { id: 'overview', label: '', items: ['dashboard'] },
  { id: 'people', label: '账号与安全', items: ['accounts', 'risk'] },
  { id: 'teaching', label: '教学内容', items: ['courses', 'h5ReportTemplates', 'h5WorkflowLibrary'] },
  { id: 'ai', label: 'AI 能力', items: ['api', 'creditBilling', 'featureManagement', 'imageStyleTemplates', 'promptLibrary', 'agents', 'partner'] },
  { id: 'gallery', label: '作品广场与外观', items: ['galleryCategories', 'audit', 'workbench'] },
  { id: 'system', label: '系统', items: ['ops', 'settings'] },
]
// 菜单图标：统一放在 src/components/admin/adminIcons.js（侧栏、数据大盘、设置页、API 配置共用一份）
function navIcon(id) {
  return adminIcon(id)
}
const navItemById = new Map(navItems.map((item) => [item.id, item]))
// 防漏：以后在 navItems 里加了页面却忘了放进分区，也会出现在最后的「其他」里，不会从菜单里消失。
const navSections = (() => {
  const placed = new Set(NAV_SECTIONS.flatMap((section) => section.items))
  const rest = navItems.filter((item) => !placed.has(item.id)).map((item) => item.id)
  const sections = rest.length ? [...NAV_SECTIONS, { id: 'other', label: '其他', items: rest }] : NAV_SECTIONS
  return sections.map((section) => ({ ...section, items: section.items.map((id) => navItemById.get(id)).filter(Boolean) }))
})()
function navSectionLabelOf(id) {
  return navSections.find((section) => section.items.some((item) => item.id === id))?.label || ''
}
// 顶栏面包屑：当前页面属于哪个分区（数据大盘不属于分区就不显示）
const currentSectionLabel = computed(() => navSectionLabelOf(currentNav.value.id))

// 分区可以收起，各存各的；当前页面所在的分区强制展开（否则看不到自己选中的是哪一项）。
const NAV_SECTION_STORAGE_KEY = 'admin-nav-section-closed'
function readClosedNavSections() {
  try {
    const value = JSON.parse(window.localStorage.getItem(NAV_SECTION_STORAGE_KEY) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}
const navSectionClosed = reactive(Object.fromEntries(readClosedNavSections().map((id) => [id, true])))
function saveClosedNavSections() {
  try {
    window.localStorage.setItem(NAV_SECTION_STORAGE_KEY, JSON.stringify(Object.keys(navSectionClosed).filter((id) => navSectionClosed[id])))
  } catch {
    /* 隐私模式下存不了就算了，不影响收起 */
  }
}
function toggleNavSection(id) {
  navSectionClosed[id] = !navSectionClosed[id]
  saveClosedNavSections()
}
function openActiveNavSection() {
  const section = navSections.find((item) => item.items.some((nav) => nav.id === activeNav.value))
  if (section && navSectionClosed[section.id]) navSectionClosed[section.id] = false
}
openActiveNavSection()
watch(activeNav, () => { openActiveNavSection() })

// 侧栏搜索：按页面名或说明里的字找；回车直接打开第一个结果。
const navQuery = ref('')
const navSearchResults = computed(() => {
  const keyword = navQuery.value.toLowerCase()
  if (!keyword) return []
  return navItems.filter((item) => `${item.label} ${item.desc || ''} ${navSectionLabelOf(item.id)}`.toLowerCase().includes(keyword))
})
function openNavFromSearch(id) {
  navQuery.value = ''
  selectAdminNav(id)
}
function openFirstNavMatch() {
  const first = navSearchResults.value[0]
  if (first) openNavFromSearch(first.id)
}

function openH5ReportCenter() {
  activeNav.value = 'h5ReportTemplates'
  if (H5_RETIRED_TABS.includes(h5CenterTab.value)) h5CenterTab.value = 'agent'
  router.replace({ path: '/admin/h5-reports' })
}

async function selectAdminNav(id) {
  navDrawerOpen.value = false
  if (id !== 'h5ReportTemplates' && h5TemplateStudio.value && !await h5TemplateStudio.value.canLeave()) return
  if (activeNav.value === 'audit' && id !== 'audit' && !await galleryAuditPanel.value?.confirmLeave()) return
  if (id === 'h5ReportTemplates') {
    openH5ReportCenter()
    return
  }
  if (id === 'h5WorkflowLibrary') {
    activeNav.value = 'h5WorkflowLibrary'
    router.replace({ path: '/admin/h5-report-workflows' })
    return
  }
  activeNav.value = id
  if (id === 'audit') router.replace({ path: '/admin', query: { module: 'audit' } })
  else if (id === 'galleryCategories') router.replace({ path: '/admin', query: { module: 'galleryCategories' } })
  else if (id === 'featureManagement') router.replace({ path: '/admin', query: { module: 'featureManagement', type: route.query.type === 'video' ? 'video' : 'image' } })
  else if (id === 'imageStyleTemplates') router.replace({ path: '/admin', query: { module: 'imageStyleTemplates' } })
  else if (ADDRESSABLE_ADMIN_MODULES.includes(id)) router.replace({ path: '/admin', query: { module: id } })
  else if (route.query.module || route.path === '/admin/h5-reports' || route.path === '/admin/h5-report-workflows') router.replace({ path: '/admin' })
}

const h5TemplatePreviewStyle = computed(() => ({
  '--h5-admin-primary': h5TemplateForm.theme.primary,
  '--h5-admin-secondary': h5TemplateForm.theme.secondary,
  '--h5-admin-accent': h5TemplateForm.theme.accent,
  '--h5-admin-bg': h5TemplateForm.theme.background,
  '--h5-admin-surface': h5TemplateForm.theme.surface,
  '--h5-admin-text': h5TemplateForm.theme.text,
  fontFamily: h5TemplateForm.fontFamily || 'Microsoft YaHei',
}))
// 旧方案留下的三块（生成方案 / 版本与模板 / 视觉风格）已停用：
// 配置结构、数据、页面代码全部保留，只是后台不再让点，避免两套方案互相打架。
// 以后要复活，把 retired 去掉即可。
const h5CenterTabs = [
  { id: 'strategies', label: '生成方案', retired: true },
  { id: 'editions', label: '版本与模板', retired: true },
  { id: 'style', label: '视觉风格', retired: true },
  { id: 'agent', label: '文案与智能体' },
  { id: 'audit', label: '审核与发布' },
]
const H5_RETIRED_TABS = h5CenterTabs.filter((tab) => tab.retired).map((tab) => tab.id)
const h5EditionOptions = [
  { id: 'junior', label: '初级版', age: '4–6岁', icon: 'seedling', description: '低龄创意启蒙与表达记录' },
  { id: 'starter', label: '入门版', age: '6–9岁', icon: 'sparkles', description: '课堂创作过程与第一人称讲解' },
  { id: 'advanced', label: '进阶版', age: '10–12岁', icon: 'trendUp', description: '作品探索与迭代说明' },
  { id: 'pro', label: '高级版', age: '13岁+', icon: 'star', description: '专业作品集与设计表达' },
]
const selectedH5Edition = computed(() => h5EditionOptions.find((item) => item.id === selectedH5EditionId.value) || h5EditionOptions[1])
const selectedH5EditionConfig = computed(() => h5EditionConfig(selectedH5EditionId.value))
const selectedH5Strategy = computed(() => h5ReportCenterConfig.strategies?.find((item) => item.id === selectedH5StrategyId.value) || h5ReportCenterConfig.strategies?.[0] || null)
const filteredH5Templates = computed(() => {
  const keyword = h5TemplateKeyword.value.trim().toLowerCase()
  return h5TemplateStore.templates.filter((item) => !keyword || [item.name, item.description, item.layout].join(' ').toLowerCase().includes(keyword))
})
const h5VisualElements = [
  { key: 'studentInfo', label: '顶部用户信息' },
  { key: 'chapterNav', label: '章节导航' },
  { key: 'social', label: '点赞与评语' },
  { key: 'download', label: '下载报告' },
  { key: 'official', label: '品牌官网按钮' },
]
const h5CompatibleAgents = computed(() => reportAgentState.agents.filter((agent) => agent.type === 'h5-first-person-report'))
const selectedH5BoundAgent = computed(() => {
  const configuredId = selectedH5EditionConfig.value?.agentId
  const fallbackId = agentBindings['report.h5FirstPerson']
  return reportAgentState.agents.find((agent) => agent.id === configuredId)
    || reportAgentState.agents.find((agent) => agent.id === fallbackId)
    || null
})
const h5AgentBindingState = computed(() => {
  const configuredId = selectedH5EditionConfig.value?.agentId
  if (!configuredId) return { type: 'fallback', label: '使用全局默认智能体' }
  // 绑定的 id 已被删掉时，selectedH5BoundAgent 会退回全局默认智能体；这里要如实提示，不能显示「已配置并生效」
  if (!reportAgentState.agents.some((agent) => agent.id === configuredId)) {
    return selectedH5BoundAgent.value
      ? { type: 'error', label: '原绑定已失效，正在用全局默认' }
      : { type: 'error', label: '绑定智能体不存在' }
  }
  if (!selectedH5BoundAgent.value) return { type: 'error', label: '绑定智能体不存在' }
  if (selectedH5BoundAgent.value.status !== 'enabled') return { type: 'error', label: '绑定智能体已停用' }
  return { type: 'success', label: '已配置并生效' }
})
const h5AgentFlowLabel = computed(() => bindingLabels(selectedH5BoundAgent.value?.id || '') || 'H5报告 / 第一人称项目汇报')
const h5AgentModelLabel = computed(() => selectedH5BoundAgent.value?.defaultModelKey || '跟随平台默认模型')
const h5AgentFallbackLabel = computed(() => selectedH5BoundAgent.value?.fallbackModelKey || '未设置备用模型')
const h5AgentSavedAt = computed(() => formatH5AgentTime(selectedH5BoundAgent.value?.updatedAt))
const summary = [
  { label: '分部数', value: '2', note: 'Mock 数据' },
  { label: '用户账号', value: '186', note: '待接真实后端' },
  { label: '今日调用', value: '426', note: 'AI 生成请求' },
  { label: '预估成本', value: '¥128', note: '按模拟单价' },
]
const campuses = [
  { name: '金碧花园分部', classes: 8, students: 126, status: '正常' },
  { name: '新城体验分部', classes: 4, students: 60, status: '试运行' },
]
const accountRoleTabs = [
  { label: '全部账号', value: 'all' },
  { label: '用户端账号', value: 'student' },
  { label: '讲师端账号', value: 'teacher' },
  { label: '管理员账号', value: 'admin' },
]
const accountDetailTabs = [
  { value: 'basic', label: '基本信息' },
  { value: 'lessons', label: '上课记录' },
  { value: 'works', label: '个人作品册' },
  { value: 'orders', label: '积分记录' },
]
const groupMemberRoleTabs = accountRoleTabs.filter((item) => item.value !== 'admin')
const groupPermissionOptions = [
  { key: 'courseLibraryView', label: '查看课程库', desc: '查看管理员授权给本组的课程' },
  { key: 'courseUse', label: '使用课程', desc: '使用已授权课程进行教学' },
  { key: 'courseUpload', label: '上传课程', desc: '上传课程并进入管理员总课程库' },
  { key: 'courseDistribute', label: '发放课程', desc: '向指定班级或用户发放课程' },
  { key: 'classManage', label: '班级管理', desc: '查看和管理负责的班级' },
  { key: 'reports', label: '项目报告', desc: '查看和发送项目报告' },
]
const agentTaskTypes = [
  { value: 'text', label: '文本整理' },
  { value: 'image', label: '图像生成' },
  { value: 'video', label: '视频生成' },
  { value: 'model3d', label: '3D生成' },
  { value: 'audit', label: '审核判断' },
]
const themeColorFields = [
  { key: 'bg', label: '页面背景' },
  { key: 'surface', label: '内容底色' },
  { key: 'primary', label: '主色' },
  { key: 'secondary', label: '辅助色' },
  { key: 'accent', label: '强调色' },
  { key: 'title', label: '标题色' },
  { key: 'text', label: '正文色' },
  { key: 'muted', label: '说明色' },
  { key: 'soft', label: '浅色块' },
]
const reportStyleBlueprints = [
  {
    id: 'kids-art-show',
    name: '儿童艺术展',
    desc: '明亮活泼，适合低龄段作品展示和主题展。',
    category: 'portfolio',
    rendererPreset: 'portfolio',
    theme: { bg: 'FFFBEB', surface: 'FFFFFF', primary: 'F59E0B', secondary: '14B8A6', accent: 'FDE68A', title: '7C2D12', text: '3F3F46', muted: '71717A', soft: 'FEF3C7' },
    textDensity: 'light',
    imageCapacity: 4,
    layouts: ['cover-hero', 'image-text', 'before-after', 'review-card', 'comment', 'back-cover'],
    tags: '儿童、展览、明亮、作品',
    keywords: '儿童、展览、作品、色彩',
  },
  {
    id: 'parent-briefing',
    name: '汇报简报',
    desc: '干净清晰，适合课后快速分享。',
    category: 'classroom',
    rendererPreset: 'classroom',
    theme: { bg: 'F8FAFC', surface: 'FFFFFF', primary: '0F766E', secondary: '2563EB', accent: '99F6E4', title: '134E4A', text: '334155', muted: '64748B', soft: 'CCFBF1' },
    textDensity: 'light',
    imageCapacity: 2,
    layouts: ['cover-hero', 'text-focus', 'before-after', 'image-text', 'comment', 'back-cover'],
    tags: '简报、清晰、课后',
    keywords: '课后、汇报、体验课',
  },
  {
    id: 'ai-process',
    name: 'AI创作过程',
    desc: '突出草图、提示词、迭代和最终作品。',
    category: 'growth',
    rendererPreset: 'growth',
    theme: { bg: 'F0FDFA', surface: 'FFFFFF', primary: '0D9488', secondary: '7C3AED', accent: 'A7F3D0', title: '042F2E', text: '334155', muted: '64748B', soft: 'CCFBF1' },
    textDensity: 'medium',
    imageCapacity: 4,
    layouts: ['cover-hero', 'before-after', 'timeline', 'image-text', 'storyboard', 'review-card', 'back-cover'],
    tags: 'AI、过程、迭代、数字艺术',
    keywords: 'AI、提示词、迭代、草图、成品',
  },
  {
    id: 'graduation-review',
    name: '结课成果册',
    desc: '正式稳重，适合阶段成果、续班沟通和归档。',
    category: 'growth',
    rendererPreset: 'brand',
    theme: { bg: 'FDF2F8', surface: 'FFFFFF', primary: 'BE185D', secondary: '0F766E', accent: 'FBCFE8', title: '831843', text: '374151', muted: '6B7280', soft: 'FCE7F3' },
    textDensity: 'medium',
    imageCapacity: 3,
    layouts: ['cover-hero', 'text-focus', 'timeline', 'image-text', 'review-card', 'comment', 'back-cover'],
    tags: '结课、成果、正式、归档',
    keywords: '结课、成果、续班、阶段',
  },
]
const templateEditorPageBlueprints = [
  { role: 'cover', title: '封面', layout: 'cover-hero' },
  { role: 'understanding', title: '课程理解', layout: 'text-focus' },
  { role: 'sketch', title: '草图对比', layout: 'before-after' },
  { role: 'process', title: '创作过程', layout: 'timeline' },
  { role: 'work', title: '作品展示', layout: 'image-text' },
  { role: 'review', title: 'AI 点评', layout: 'review-card' },
  { role: 'teacher', title: '讲师评语', layout: 'comment' },
  { role: 'back', title: '封底', layout: 'back-cover' },
]
// 服务端模式下课程分类是机构级数据（org_course_categories 表），必须跟着服务端走；
// demo 模式继续用 localStorage，避免纯前端演示时报错。
const serverAuthMode = import.meta.env.VITE_AUTH_MODE === 'server'
const adminCourseCategoryStorageKey = 'art-studio-course-categories'
const adminCourseDeletedCategoryStorageKey = 'art-studio-course-categories-deleted'
const customCourseCategoryValue = 'custom'
const deletedCourseCategoryValues = ref(serverAuthMode ? [] : readDeletedCourseCategoryValues())
const categoryOptions = ref(readAdminCourseCategoryOptions())
const showCourseCategoryDialog = ref(false)
const newCourseCategoryName = ref('')
const showCourseCategoryDropdown = ref(false)
const adminCourseCustomCategoryName = ref('')
const customCategoryOptions = computed(() => {
  const defaultValues = new Set(courseCategories.map((item) => item.value))
  return categoryOptions.value.filter((item) => !defaultValues.has(item.value))
})
const selectedAdminCategoryLabel = computed(() => {
  if (adminCourseForm.category === customCourseCategoryValue) return adminCourseCustomCategoryName.value || '自定义'
  return categoryLabel(adminCourseForm.category)
})
const adminCourseCoverStyle = computed(() => ({
  background: adminCourseForm.cover || 'linear-gradient(135deg, #0f766e, #38bdf8)',
}))
const questionOptionLabels = ['A', 'B', 'C', 'D']
const apis = [
  { name: '火山方舟豆包绘画', desc: 'AI 生图默认预留接口', status: '待配置 API Key' },
  { name: 'Seedance 视频生成', desc: '后续视频生成模块预留', status: '待配置 API Key' },
  { name: '影眸 3D 生成', desc: '后续 3D 模型生成模块预留', status: '待配置 API Key' },
  { name: '内容安全审核', desc: '文本与图片审核预留', status: '待配置 API Key' },
  { name: '支付订单接口', desc: 'Token 充值和订单系统预留', status: '后续接入' },
]
const logs = [
  { id: 'a1', title: 'Vite 构建通过', time: '今天 20:10' },
  { id: 'a2', title: 'Mock API 健康检查通过', time: '今天 20:05' },
  { id: 'a3', title: '内容审核接口预留完成', time: '今天 19:50' },
]
const providerCards = computed(() => Object.values(providerConfig.providers || {}).filter((provider) => (
  (provider.category || (provider.key === 'hunyuan3d' ? 'model3d' : 'painting')) === providerCategory.value
)))
const isHunyuan3dProvider = computed(() => providerForm.key === 'hunyuan3d')
// 官方水印开关只对火山方舟有效：预置的 volcengine，或 Base URL 指向方舟（*.volces.com）的自建平台。
const isVolcengineProvider = computed(() => providerForm.key === 'volcengine' || isArkHostedUrl(providerForm.baseUrl))
function isArkHostedUrl(value) {
  try {
    return /(^|\.)volces\.com$/i.test(new URL(String(value || '').trim()).hostname)
  } catch {
    return false
  }
}
const providerModelToggling = ref('')

function listedProviderModels(provider) {
  return normalizeProviderModels(provider.models, provider.defaultModel, provider.textModels, provider.imageModels, provider.videoModels, provider.textModel, provider.imageModel, provider.videoModel)
}

// 列表里的「参考图」角标只放简称，全文放 title（悬停可见）：
// 原样「参考图（/images/edits 上传）」会把「类型」列挤成三行，表格一下就高了。
function shortImageInputLabel(label) {
  const text = String(label || '').trim()
  if (!text) return '不收参考图'
  if (text.includes('不支持')) return '不收参考图'
  if (text.includes('/images/edits') || /edits/.test(text)) return '参考图 · 上传接口'
  if (text.includes('extra_body')) return '参考图 · extra_body'
  if (text.includes('未声明')) return '参考图 · 按 OpenAI 兼容'
  const field = text.match(/字段\s*([^\s）)]+)/)
  return field ? `参考图 · ${field[1]} 字段` : '参考图'
}

function changeProviderModelSelection(event, provider, model) {
  // 以服务端保存结果为准；保存失败时复选框保持原状态。
  event.target.checked = !provider.disabledModels?.includes(model)
  void toggleProviderModel(provider, model)
}

async function toggleProviderModel(provider, model) {
  if (providerModelToggling.value) return
  providerModelToggling.value = `${provider.key}:${model}`
  try {
    const { data } = await apiClient.post('/admin/ai-providers/model-status', {
      provider: provider.key,
      model,
      enabled: Boolean(provider.disabledModels?.includes(model)),
    })
    provider.disabledModels = data.disabledModels
    ElMessage.success(data.message)
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '保存模型开关失败，请重试')
  } finally {
    providerModelToggling.value = ''
  }
}
const allProviderRowsSelected = computed(() => (
  providerCards.value.length > 0
  && providerCards.value.every((provider) => selectedProviderIds.value.includes(provider.key))
))
const visibleProviderModels = computed(() => {
  if (providerModelsExpanded.value || providerForm.models.length <= 1) return providerForm.models
  const defaultModel = providerForm.defaultModel || providerForm.models[0]
  return defaultModel ? [defaultModel] : providerForm.models.slice(0, 1)
})
// ---------- API 配置页（新版界面用到的小工具，数据和接口都沿用原来的） ----------
const API_CATEGORY_TABS = [
  { value: 'painting', label: '绘画 · 视频 · 文字' },
  { value: 'model3d', label: '3D 世界' },
  { value: 'custom', label: '自定义' },
]
const apiModelKindOptions = [
  { value: 'image', label: '图像' },
  { value: 'video', label: '视频' },
  { value: 'text', label: '文字' },
]
function providerCategoryOf(provider = {}) {
  return provider.category || (provider.key === 'hunyuan3d' ? 'model3d' : 'painting')
}
const apiCategoryTabs = computed(() => {
  const providers = Object.values(providerConfig.providers || {})
  return API_CATEGORY_TABS.map((tab) => ({ ...tab, count: providers.filter((provider) => providerCategoryOf(provider) === tab.value).length }))
})
function providerEnabledModelCount(provider) {
  return listedProviderModels(provider).filter((model) => !provider.disabledModels?.includes(model)).length
}
// 平台图标：3D 平台用立方体，其它用「接口」插头；颜色按平台 key 固定分配，同一个平台每次颜色都一样
const PROVIDER_TINTS = ['#0a84ff', '#5856d6', '#30b0c7', '#ff9500', '#ff2d55', '#30c158', '#af52de', '#ff9f0a']
function providerIconName(provider = {}) {
  return providerCategoryOf(provider) === 'model3d' ? 'cube' : 'plug'
}
function providerTint(provider = {}) {
  const key = String(provider.key || provider.label || '')
  let hash = 0
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return PROVIDER_TINTS[hash % PROVIDER_TINTS.length]
}
const apiSummary = computed(() => {
  const providers = providerConfig.providers || {}
  const labelOf = (key) => providers[key]?.label || key || '未设置'
  return {
    platforms: providerCards.value.length,
    configured: providerCards.value.filter((provider) => provider.configured).length,
    totalModels: providerCards.value.reduce((sum, provider) => sum + listedProviderModels(provider).length, 0),
    enabledModels: providerCards.value.reduce((sum, provider) => sum + providerEnabledModelCount(provider), 0),
    defaultLabel: labelOf(providerConfig.defaultProvider),
    defaultTextLabel: labelOf(providerConfig.defaultTextProvider || providerConfig.defaultProvider),
  }
})
const apiCurrentProvider = computed(() => providerConfig.providers?.[providerForm.key] || null)

// ---- 出图备用模型 / 平台健康状态 / 免费检测连接 / 模型显示名（2026-11-26） ----
const fallbackSaving = ref(false)
const providerProbe = reactive({})
const providerHealthResetting = ref('')
function modelDisplayName(provider, model) {
  return provider?.modelLabels?.[model] || model
}
// 输入框里的占位：服务端按命名规则算好的自动名；新加还没保存的模型就显示模型名本身
function formAutoModelLabel(model) {
  return apiCurrentProvider.value?.autoModelLabels?.[model] || model
}
function formModelDisplayName(model) {
  return String(providerForm.modelLabels?.[model] || '').trim() || formAutoModelLabel(model)
}
const fallbackSelectValue = computed(() => {
  const fallback = providerConfig.imageFallback
  return fallback?.enabled && fallback.provider && fallback.model ? `${fallback.provider}::${fallback.model}` : ''
})
// 备用模型候选：已启用、填了 Key 的平台里开着的图像模型。当前设置已失效时也列出来（标「已失效」），不让下拉框显示成别的。
const fallbackOptions = computed(() => {
  const options = Object.values(providerConfig.providers || {})
    .filter((provider) => provider.key !== 'hunyuan3d' && provider.enabled !== false && provider.configured)
    .flatMap((provider) => (provider.imageModels || [])
      .filter((model) => !(provider.disabledModels || []).includes(model))
      .map((model) => ({ value: `${provider.key}::${model}`, label: `${provider.label} · ${modelDisplayName(provider, model)}` })))
  const current = fallbackSelectValue.value
  if (current && !options.some((option) => option.value === current)) {
    const fallback = providerConfig.imageFallback
    options.push({ value: current, label: `${fallback.providerLabel || fallback.provider} · ${fallback.modelLabel || fallback.model}（已失效）` })
  }
  return options
})
async function changeImageFallback(value) {
  fallbackSaving.value = true
  try {
    const [provider, ...rest] = String(value || '').split('::')
    const { data } = await apiClient.post('/admin/ai-providers/fallback', value ? { provider, model: rest.join('::') } : { enabled: false })
    providerConfig.imageFallback = data.imageFallback || null
    ElMessage.success(data.message || '已保存')
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '保存失败，请稍后再试')
  } finally {
    fallbackSaving.value = false
  }
}
// 平台健康：只把异常（暂停中 / 连续失败）标出来，正常的不额外加标签，免得满屏绿点
function providerHealthBadge(provider) {
  const health = provider?.health
  if (health?.status === 'cooling') return { tone: 'is-warn', text: `暂停中 · ${health.cooldownSeconds} 秒` }
  if (health?.status === 'failing') return { tone: 'is-warn', text: `连续失败 ${health.consecutiveFailures} 次` }
  return null
}
// 暂停提示要和备用模型的实际设置一致：没设可用的备用时，服务端仍会先试这个平台（见服务端 generateImages）
function providerHealthText(provider) {
  const health = provider?.health || {}
  if (health.status !== 'cooling') return `最近连续失败 ${health.consecutiveFailures} 次。`
  const fallback = providerConfig.imageFallback
  const seconds = health.cooldownSeconds
  if (!fallback?.enabled || !fallback.usable) return `连续失败，约 ${seconds} 秒后自动解除。还没设可用的出图备用模型，期间出图仍会先试这个平台。`
  if (fallback.provider === provider.key) return `连续失败，约 ${seconds} 秒后自动解除。备用模型也在这个平台上，整个平台出故障时帮不上忙，建议换成其它平台的模型。`
  return `连续失败，暂停使用约 ${seconds} 秒，期间出图直接走备用模型（${fallback.providerLabel || fallback.provider}）。`
}
const apiUnhealthyCount = computed(() => providerCards.value.filter((provider) => providerHealthBadge(provider)).length)
async function resetProviderHealthState(provider) {
  providerHealthResetting.value = provider.key
  try {
    const { data } = await apiClient.post('/admin/ai-providers/health/reset', { provider: provider.key })
    ElMessage.success(data.message || '已恢复')
    await loadProviderConfig()
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '恢复失败，请稍后再试')
  } finally {
    providerHealthResetting.value = ''
  }
}
// 列表里的「检测连接」：只读平台的模型列表，不出图、不花钱
async function probeProvider(provider) {
  providerProbe[provider.key] = { loading: true, result: null }
  try {
    const { data } = await apiClient.post('/admin/ai-providers/test', { provider: provider.key })
    providerProbe[provider.key] = { loading: false, result: data }
  } catch (error) {
    providerProbe[provider.key] = { loading: false, result: { ok: false, message: error?.response?.data?.message || '检测失败，请稍后再试' } }
  }
}
function probeTone(result) {
  if (!result) return ''
  if (result.connection?.status === 'unsupported') return 'is-warn'
  return result.ok ? 'is-ok' : 'is-bad'
}
const imageInputAutoHint = computed(() => {
  if (!providerForm.imageInputAuto) return '已打开：按下面选的方式发送参考图。只有自动识别不对时才需要。'
  const current = apiCurrentProvider.value
  if (creatingProvider.value || !current) return '关着就自动识别：保存后按地址和模型名判断（火山方舟 / Seedream、Agnes、OpenAI 官方都认得）。'
  if (current.imageInputSource === 'manual') return '关掉后保存，就改回自动识别。'
  if (current.imageInputSource === 'default') return '现在自动识别：没认出这个平台，按 OpenAI 兼容方式（顶层 image 字段）发送；出图时参考图没生效再打开。'
  if (current.imageInputSource === 'preset') return `现在用内置平台的官方设置：${current.imageInputLabel}`
  // 旧表单存过、和自动识别结果一样的设置，服务端也按「自动」报，但文字里没有「自动识别」前缀
  const label = current.imageInputLabel || ''
  return label.startsWith('自动识别') ? `现在${label}` : `现在自动识别：${label || '按 OpenAI 兼容处理'}`
})
const hunyuanRegionLabel = computed(() => ({ 'ap-guangzhou': '广州', 'ap-shanghai': '上海', 'ap-beijing': '北京' }[providerForm.region] || providerForm.region || '未设置地域'))
const reportAgents = computed(() => reportAgentState.agents || [])
const agentModelOptions = computed(() => {
  const options = []
  Object.entries(providerConfig.providers || {}).forEach(([providerKey, provider]) => {
    const label = provider.label || providerKey
    const models = normalizeProviderModels(
      provider.models,
      provider.defaultModel,
      provider.textModels,
      provider.imageModels,
      provider.videoModels,
      provider.textModel,
      provider.imageModel,
      provider.videoModel,
    )
    models.forEach((model) => {
      options.push({
        key: `${providerKey}:text:${model}`,
        providerKey,
        taskType: 'text',
        model,
        label: `${label} / ${model}`,
        configured: Boolean(provider.configured),
      })
    })
  })
  return options
})
const compatibleAgentModelOptions = computed(() => {
  return agentModelOptions.value
})
const reportAgentAllowedModelKey = computed({
  get() {
    const compatibleKeys = new Set(compatibleAgentModelOptions.value.map((item) => item.key))
    return reportAgentForm.allowedModelKeys.find((key) => compatibleKeys.has(key)) || ''
  },
  set(value) {
    reportAgentForm.allowedModelKeys = value ? [value] : []
    syncSelectedAgentForm()
  },
})
const filteredAccounts = computed(() => {
  const keyword = accountKeyword.value.trim().toLowerCase()
  return accountPermissionStore.accounts.filter((account) => {
    if (accountRoleFilter.value !== 'all' && account.role !== accountRoleFilter.value) return false
    if (accountCampusFilter.value !== 'all' && account.campus?.id !== accountCampusFilter.value) return false
    if (accountStatusFilter.value === 'banned') {
      if (!account.ban) return false
    } else if (accountStatusFilter.value !== 'all' && account.status !== accountStatusFilter.value) return false
    return !keyword || [account.name, account.account, account.className, account.campus?.name]
      .some((value) => String(value || '').toLowerCase().includes(keyword))
  })
})
const availableEnrollmentClasses = computed(() => organizationSetup.classes.filter((item) => item.campus_id === enrollmentDraft.campusId && item.status === 'active'))
const filteredSetupCampuses = computed(() => {
  const keyword = campusKeyword.value.trim().toLowerCase()
  return organizationSetup.campuses.filter((campus) => {
    if (campusStatusFilter.value !== 'all' && campus.status !== campusStatusFilter.value) return false
    return !keyword || [campus.name, campus.code].some((value) => String(value || '').toLowerCase().includes(keyword))
  })
})
const selectedAccountDetail = computed(() => accountPermissionStore.accounts.find((account) => account.id === selectedAccountDetailId.value) || null)
// ---- 账号与权限页（2026-11-26 重做）：统计、归属文字、封禁 / 解封、详情里的积分记录 ----
// 编辑账号弹窗：只列出所选分部下的班级（没选分部时列出全部），和原来的下拉多选同一套数据。
const accountEditClassOptions = computed(() => accountPermissionStore.classes.filter((item) => !accountEditDraft.campusId || item.campus_id === accountEditDraft.campusId))
const accountSummary = computed(() => {
  const list = accountPermissionStore.accounts
  return {
    student: list.filter((item) => item.role === 'student').length,
    teacher: list.filter((item) => item.role === 'teacher').length,
    admin: list.filter((item) => item.role === 'admin').length,
    disabled: list.filter((item) => item.status !== 'enabled').length,
    // 账号列表接口里的 ban 只在「正在封禁」时才有值
    banned: list.filter((item) => item.ban).length,
  }
})
function roleShortLabel(role) {
  return { student: '小画家', teacher: '讲师', admin: '管理员' }[role] || '账号'
}
function roleTagClass(role) {
  return { teacher: 'is-info', admin: 'is-brand' }[role] || ''
}
// 归属 / 管理范围：管理员显示能管哪些分部（账号隔离的边界），其他人显示分部、班级或权限组。
function accountScopeText(account) {
  if (!account) return ''
  if (account.role === 'admin') {
    const scopes = Array.isArray(account.adminScopes) ? account.adminScopes : []
    if (scopes.some((item) => item.type === 'organization')) return '管理范围：整个机构'
    const names = scopes.filter((item) => item.type === 'campus').map((item) => accountPermissionStore.campuses.find((campus) => campus.id === item.campusId)?.name || '已停用的分部')
    return names.length ? `管理范围：${names.join('、')}` : '管理范围：未设置'
  }
  const parts = [account.campus?.name, account.role === 'teacher' ? `权限组：${permissionGroupNames(account.groupIds)}` : account.className].filter(Boolean)
  return parts.join(' · ') || '未设置归属'
}
function accountBanScopeText(account) {
  return account?.ban?.scope === 'all' ? '暂停登录' : '暂停 AI'
}
function accountBanUntilText(account) {
  const ban = account?.ban
  if (!ban) return ''
  return ban.permanent || !ban.endsAt ? '永久' : `到 ${formatCreditTime(ban.endsAt)}`
}
function accountBanText(account) {
  if (!account?.ban) return ''
  return `${accountBanScopeText(account)} · ${accountBanUntilText(account)}`
}
function canBanAccount(account) {
  return Boolean(account?.id) && account.role !== 'admin' && account.id !== userStore.user?.id
}
const accountBanDialog = reactive({ open: false, account: null })
function openAccountBan(account) {
  accountBanDialog.account = { id: account.id, name: account.name, account: account.account, role: account.role }
  accountBanDialog.open = true
}
async function afterAccountBan() {
  await accountPermissionStore.loadAdminData(true)
}
async function liftAccountBan(account) {
  const ban = account?.ban
  if (!ban?.id) return
  try {
    await ElMessageBox.confirm(`解除「${account.name}」的封禁？解除后马上恢复正常使用。`, '解除封禁', { type: 'warning', confirmButtonText: '解除', cancelButtonText: '取消' })
  } catch {
    return
  }
  try {
    await apiClient.post(`/admin/risk/bans/${encodeURIComponent(ban.id)}/lift`, { reason: '管理员在账号列表解除' })
    ElMessage.success('已解除封禁')
    await accountPermissionStore.loadAdminData(true)
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '解除失败，请到「账号安全 → 封禁名单」里再试')
  }
}
function creditCodeTone(status) {
  return { unused: 'is-info', redeemed: 'is-warn', confirmed: 'is-ok', void: 'is-muted' }[status] || 'is-muted'
}
async function copyAdminText(text, message = '已复制') {
  try {
    await navigator.clipboard.writeText(String(text || ''))
    ElMessage.success(message)
  } catch {
    ElMessage.warning('浏览器不允许自动复制，请手动选中复制')
  }
}
// 账号详情里的「积分记录」：切到这个标签才去读，不在打开详情时白读一次。
const accountDetailCredit = reactive({ loading: false, balance: 0, entries: [], error: '' })
watch([accountDetailTab, selectedAccountDetailId], async ([tab, id]) => {
  if (tab !== 'orders' || !id) return
  accountDetailCredit.loading = true
  accountDetailCredit.error = ''
  try {
    const detail = await adminFetchUserCredit(id)
    accountDetailCredit.balance = Number(detail?.balance || 0)
    accountDetailCredit.entries = Array.isArray(detail?.entries) ? detail.entries : []
  } catch (error) {
    accountDetailCredit.entries = []
    accountDetailCredit.error = error?.response?.data?.message || '读取积分记录失败'
  } finally {
    accountDetailCredit.loading = false
  }
})

const accountDetailWorks = computed(() => {
  const account = selectedAccountDetail.value
  if (!account?.name) return []
  return galleryStore.managedWorks.filter((work) => work.author === account.name).slice(0, 12)
})
const groupMemberAccounts = computed(() => (
  groupMemberRoleFilter.value === 'all'
    ? accountPermissionStore.accounts.filter((account) => account.role !== 'admin')
    : accountPermissionStore.byRole(groupMemberRoleFilter.value)
))
const enabledPermissionGroups = computed(() => accountPermissionStore.permissionGroups.filter((group) => group.status === 'enabled'))
const availableClassNames = computed(() => [...new Set([
  ...accountPermissionStore.byRole('student').map((account) => account.className),
  'AI创意美术A班',
  '进阶设计班',
  '低龄启蒙班',
  '周末综合班',
].filter(Boolean))])
const filteredReportTemplates = computed(() => {
  const keyword = templateKeyword.value.trim().toLowerCase()
  return reportTemplateStore.templates.filter((template) => {
    if (templateCategoryFilter.value !== 'all' && template.category !== templateCategoryFilter.value) return false
    if (templateStatusFilter.value !== 'all' && template.status !== templateStatusFilter.value) return false
    if (!keyword) return true
    return [template.name, template.description, template.sourceFileName, template.createdBy]
      .some((value) => String(value || '').toLowerCase().includes(keyword))
  })
})
const selectedReportTemplate = computed(() => reportTemplateStore.byId(selectedTemplateId.value))
const selectedReportTemplateNames = computed(() => reportTemplateStore.templates
  .filter((template) => selectedReportTemplateIds.value.includes(template.id))
  .map((template) => template.name)
  .join('、') || '暂未选择模板')
const allReportTemplatesSelected = computed(() => (
  Boolean(filteredReportTemplates.value.length)
  && filteredReportTemplates.value.every((template) => selectedReportTemplateIds.value.includes(template.id))
))
const reportTemplatePreviewStyle = computed(() => ({
  '--tpl-bg': `#${reportTemplateForm.theme.bg}`,
  '--tpl-surface': `#${reportTemplateForm.theme.surface}`,
  '--tpl-primary': `#${reportTemplateForm.theme.primary}`,
  '--tpl-secondary': `#${reportTemplateForm.theme.secondary}`,
  '--tpl-accent': `#${reportTemplateForm.theme.accent}`,
  '--tpl-title': `#${reportTemplateForm.theme.title}`,
  '--tpl-text': `#${reportTemplateForm.theme.text}`,
  '--tpl-muted': `#${reportTemplateForm.theme.muted}`,
  '--tpl-soft': `#${reportTemplateForm.theme.soft}`,
}))
const currentTemplateEditorPage = computed(() => {
  ensureTemplateEditorPages()
  return reportTemplateForm.templatePages[templateEditorPageIndex.value] || reportTemplateForm.templatePages[0]
})
const selectedTemplateElement = computed(() => (
  currentTemplateEditorPage.value?.slots?.find((slot) => slot.id === selectedTemplateElementId.value) || null
))
const isSelectedTemplateTextElement = computed(() => (
  Boolean(selectedTemplateElement.value && ['title', 'subtitle', 'body', 'footer'].includes(selectedTemplateElement.value.type))
))
const selectedTemplateQuickbarStyle = computed(() => {
  const slot = selectedTemplateElement.value
  if (!slot) return {}
  const centerX = clampNumber(Number(slot.x || 0) + Number(slot.w || 0.1) / 2, 0.22, 0.78, 0.5)
  return {
    left: `${centerX * 100}%`,
    top: `${Number(slot.y || 0) * 100}%`,
  }
})
const templateEditorCanvasStyle = computed(() => ({
  background: `linear-gradient(135deg, #${reportTemplateForm.theme.bg}, #${reportTemplateForm.theme.soft})`,
  color: `#${reportTemplateForm.theme.text}`,
  fontFamily: `${reportTemplateForm.fontFamily || 'Microsoft YaHei'}, sans-serif`,
}))
const filteredAdminCourses = computed(() => {
  const keyword = courseKeyword.value.trim().toLowerCase()
  if (!keyword) return courseStore.courses
  return courseStore.courses.filter((course) => [
    course.title,
    categoryLabel(course.category),
    course.difficulty,
    course.ageRange,
    course.videoFileName,
    course.pptFileName,
    ...(course.authorizedClasses || []),
    ...(course.authorizedStudents || []),
    course.ownerName,
    ...permissionGroupNameList(course.authorizedGroupIds),
  ].some((value) => String(value || '').toLowerCase().includes(keyword)))
})
const allAdminCoursesSelected = computed(() => (
  Boolean(filteredAdminCourses.value.length)
  && filteredAdminCourses.value.every((course) => selectedAdminCourseIds.value.includes(course.id))
))
const selectedAuthCourse = computed(() => courseStore.courses.find((course) => course.id === selectedAuthCourseId.value))
const adminCourseStats = computed(() => {
  const courses = courseStore.courses
  const published = courses.filter((course) => course.status === 'published').length
  const draft = courses.length - published
  const authorized = courses.filter((course) => courseAuthParts(course).length).length
  return [
    { label: '课程总数', value: courses.length, note: '管理员课程库' },
    { label: '已授权', value: authorized, note: '已发给讲师组或小画家' },
    { label: '草稿课程', value: draft, note: '待补充或未发布' },
    { label: '当前选中', value: selectedAdminCourseIds.value.length, note: '可批量处理' },
  ]
})
const agentFlows = computed(() => reportAgentState.flows?.length ? reportAgentState.flows : [
  { key: 'report.full', label: '项目报告 / 一键生成完整报告' },
  { key: 'report.materialsToOutline', label: '项目报告 / 整理资料生成PPT大纲' },
  { key: 'report.image2DeckStyle', label: '项目报告 / Image2生成三版PPT页图' },
  { key: 'report.fullPptImageDeck', label: '项目报告 / 一键生成图片型PPT' },
  { key: 'report.rewritePage', label: '项目报告 / 单页重写' },
  { key: 'report.youngMode', label: '初级/入门报告生成' },
  { key: 'report.advancedMode', label: '进阶/高级报告生成' },
  { key: 'report.exportCopy', label: '导出说明/讲稿预留' },
  { key: 'paint.promptOptimize', label: 'AI绘画 / 提示词优化' },
  { key: 'paint.sketchUnderstand', label: 'AI绘画 / 草图理解' },
  { key: 'paint.preGenerateAudit', label: 'AI绘画 / 图像生成前审核' },
  { key: 'course.parse', label: '课程中心 / 课程内容解析' },
  { key: 'course.studentAnswer', label: '课程中心 / 用户回答整理' },
  { key: 'video.storyboard', label: 'AI视频 / 分镜脚本生成' },
  { key: 'video.cameraPrompt', label: 'AI视频 / 运镜参数建议' },
  { key: 'model3d.description', label: '3D生成 / 模型说明生成' },
  { key: 'model3d.parameters', label: '3D生成 / 参数建议' },
  { key: 'audit.text', label: '内容审核 / 文本审核' },
  { key: 'audit.materialRisk', label: '内容审核 / 素材风险提示' },
])
const enabledAgents = computed(() => reportAgents.value.filter((agent) => agent.status === 'enabled'))

// —— 流程按「页面」分组 ------------------------------------------------------
// 原来 20 条流程平铺在一格里，报告、绘画、视频、3D、课程、审核混在一起，
// 老师想改「绘画那条」得在一堆英文 key 里找。分组只改「怎么看」，不改数据结构：
// 勾的还是同一个 boundFlowKeys，保存逻辑一行没动。
// 注意：这里**不虚构没有流程的页面**（比如作品库现在没有绑定流程，就不显示空卡片）。
const AGENT_FLOW_GROUP_DEFS = [
  { id: 'paint', label: 'AI 绘画', desc: '用户画完之后的整理与审核', match: (key) => key.startsWith('paint.') },
  { id: 'video', label: 'AI 视频', desc: '分镜与运镜参数', match: (key) => key.startsWith('video.') },
  { id: 'model3d', label: 'AI 3D 世界', desc: '模型说明与参数', match: (key) => key.startsWith('model3d.') },
  { id: 'course', label: '课程', desc: '课程解析与用户回答整理', match: (key) => key.startsWith('course.') },
  { id: 'report', label: 'H5 报告 / 项目报告', desc: '大纲、页图、单页重写与导出', match: (key) => key.startsWith('report.') },
  { id: 'audit', label: '内容审核', desc: '文本与素材风险', match: (key) => key.startsWith('audit.') },
]

const agentFlowGroups = computed(() => {
  const flows = agentFlows.value || []
  const claimed = new Set()
  const groups = AGENT_FLOW_GROUP_DEFS.map((group) => {
    const items = flows.filter((flow) => {
      if (claimed.has(flow.key)) return false
      if (!group.match(flow.key)) return false
      claimed.add(flow.key)
      return true
    })
    return { ...group, flows: items }
  }).filter((group) => group.flows.length)
  const rest = flows.filter((flow) => !claimed.has(flow.key))
  if (rest.length) groups.push({ id: 'other', label: '其他流程', desc: '未归入以上页面', flows: rest })
  return groups
})

// "项目报告 / 一键生成完整报告" → "一键生成完整报告"，卡片里不用重复写页面名
function flowShortLabel(flow = {}) {
  const label = String(flow.label || flow.key || '')
  const parts = label.split('/')
  return (parts.length > 1 ? parts[parts.length - 1] : label).trim()
}

function agentGroupBoundCount(group = {}) {
  const bound = reportAgentForm.boundFlowKeys || []
  return (group.flows || []).filter((flow) => bound.includes(flow.key)).length
}

function agentFlowLabel(flowKey) {
  const matched = (agentFlows.value || []).find((flow) => flow.key === flowKey)
  if (matched) return flowShortLabel(matched)
  if (flowKey === 'agent.dryRun') return '智能体试跑'
  return ''
}

// 模型 key 长成「provider:text:model」，直接摆出来没人看得懂，这里只留模型名。
// 供应商名和模型名一样时（deepseek / deepseek-v4.1-flash 的前缀常被填成模型名）不重复显示。
function agentModelShortLabel(agent = {}) {
  const key = String(agent.defaultModelKey || '')
  if (!key) return '跟随系统默认模型'
  const matched = agentModelOptions.value.find((item) => item.key === key)
  if (matched?.model) {
    const providerLabel = String(providerConfig.providers?.[matched.providerKey]?.label || matched.providerKey || '')
    const same = providerLabel.toLowerCase() === String(matched.model).toLowerCase()
    return same || !providerLabel ? matched.model : `${providerLabel} / ${matched.model}`
  }
  const parts = key.split(':')
  return parts.length >= 3 ? parts.slice(2).join(':') : key
}

const selectedAgent = computed(() => reportAgents.value.find((agent) => agent.id === selectedAgentId.value))
const defaultAgentFlowKey = computed(() => agentFlows.value[0]?.key || 'report.full')
const filteredAgents = computed(() => {
  const keyword = agentKeyword.value.trim().toLowerCase()
  return reportAgents.value.filter((agent) => {
    if (agentStatusFilter.value !== 'all' && agent.status !== agentStatusFilter.value) return false
    if (agentTypeFilter.value !== 'all' && agent.type !== agentTypeFilter.value) return false
    if (!keyword) return true
    return [agent.name, agent.masterPrompt, agent.persona, agent.reportGoal, agent.generationLogic, agent.inputScope, agent.qualityRules].some((value) => String(value || '').toLowerCase().includes(keyword))
  })
})
const allFilteredAgentsSelected = computed(() => {
  if (!filteredAgents.value.length) return false
  const selected = new Set(selectedAgentIds.value)
  return filteredAgents.value.every((agent) => selected.has(agent.id))
})

const permissionLabels = {
  studentAccess: '进入用户端',
  aiCreate: 'AI创作',
  courses: '课程学习',
  reports: '项目报告',
  teacherAccess: '进入讲师端',
  courseManage: '课程管理',
  classManage: '班级管理',
  adminAccess: '进入管理员后台',
  courseLibrary: '课程库管理',
  accountManage: '账号权限管理',
  apiConfig: 'API配置',
  agents: '智能体配置',
}

function loadTemplateInspectorPreferences() {
  const fallback = {
    order: [...templateInspectorSectionIds],
    collapsed: { template: false, page: false, element: false, brand: false },
  }
  try {
    const saved = JSON.parse(window.localStorage.getItem('admin-report-template-inspector-v1') || '{}')
    const savedOrder = Array.isArray(saved.order) ? saved.order.filter((id) => fallback.order.includes(id)) : []
    const order = [...savedOrder, ...fallback.order.filter((id) => !savedOrder.includes(id))]
    const collapsed = Object.fromEntries(templateInspectorSectionIds.map((id) => [id, Boolean(saved.collapsed?.[id])]))
    return { order, collapsed }
  } catch {
    return fallback
  }
}

function saveTemplateInspectorPreferences() {
  try {
    window.localStorage.setItem(templateInspectorPreferenceKey, JSON.stringify({
      order: templateInspectorSectionOrder.value,
      collapsed: templateInspectorCollapsed,
    }))
  } catch {
    // 浏览器禁止本地存储时，仍允许在当前编辑会话中调整栏目。
  }
}

function templateInspectorSectionStyle(id) {
  return { order: templateInspectorSectionOrder.value.indexOf(id) }
}

function isTemplateInspectorSectionCollapsed(id) {
  return Boolean(templateInspectorCollapsed[id])
}

function toggleTemplateInspectorSection(id) {
  templateInspectorCollapsed[id] = !templateInspectorCollapsed[id]
  saveTemplateInspectorPreferences()
}

function canMoveTemplateInspectorSection(id, direction) {
  const index = templateInspectorSectionOrder.value.indexOf(id)
  const targetIndex = index + direction
  return index >= 0 && targetIndex >= 0 && targetIndex < templateInspectorSectionOrder.value.length
}

function moveTemplateInspectorSection(id, direction) {
  if (!canMoveTemplateInspectorSection(id, direction)) return
  const order = [...templateInspectorSectionOrder.value]
  const index = order.indexOf(id)
  const targetIndex = index + direction
  ;[order[index], order[targetIndex]] = [order[targetIndex], order[index]]
  templateInspectorSectionOrder.value = order
  saveTemplateInspectorPreferences()
}

function clearTemplateSelection() {
  stopTemplateSlotDragging()
  stopTemplateSlotResizing()
  selectedTemplateElementId.value = ''
  selectedTemplateLayer.value = 'none'
}

function handleTemplateEditorKeydown(event) {
  if (activeNav.value !== 'reportTemplates' || templatePanel.value !== 'edit') return
  const tagName = event.target?.tagName?.toLowerCase()
  if (['input', 'textarea', 'select'].includes(tagName) || event.target?.isContentEditable) return
  if (event.key === 'Escape') {
    clearTemplateSelection()
    return
  }
  if (!['Delete', 'Backspace'].includes(event.key)) return
  event.preventDefault()
  removeSelectedTemplateLayer()
}

onMounted(() => {
  void loadAdminCourses()
  loadProviderConfig()
  loadReportAgentConfig()
  loadCanvasAgentConfig()
  loadH5ReportCenter()
  loadH5Reports()
  loadAccountCredits()
  // 品牌 LOGO 单独拉，失败就保持内置「AI」方块，不影响后台任何功能。
  getBrandLogo().then((url) => { brandLogoUrl.value = url })
  window.addEventListener('keydown', handleTemplateEditorKeydown)
})

async function loadCanvasAgentConfig() {
  try {
    const config = await getJuniorCreativeAgentConfig()
    if (config?.canvasAgent) Object.assign(canvasAgentForm, config.canvasAgent, { prompt: config.canvasAgent.prompt || [config.canvasAgent.personaPrompt, config.canvasAgent.responseStyle, config.canvasAgent.systemPrompt].filter(Boolean).join('\n\n'), capabilities: { ...canvasAgentForm.capabilities, ...(config.canvasAgent.capabilities || {}) }, rules: { ...canvasAgentForm.rules, ...(config.canvasAgent.rules || {}) } })
    canvasAgentStatus.value = '已读取无限画布智能体配置。'
  } catch (error) { canvasAgentStatus.value = error?.response?.data?.message || '无限画布智能体配置读取失败' }
}

async function saveCanvasAgentConfig() {
  canvasAgentSaving.value = true
  try {
    const current = await getJuniorCreativeAgentConfig()
    const saved = await saveJuniorCreativeAgentConfig({ ...current, canvasAgent: JSON.parse(JSON.stringify(canvasAgentForm)) })
    if (saved?.canvasAgent) Object.assign(canvasAgentForm, saved.canvasAgent)
    canvasAgentStatus.value = '无限画布智能体配置已保存，画布助手下次请求时生效。'
    ElMessage.success(canvasAgentStatus.value)
  } catch (error) { canvasAgentStatus.value = error?.response?.data?.message || '无限画布智能体配置保存失败'; ElMessage.error(canvasAgentStatus.value) } finally { canvasAgentSaving.value = false }
}

onBeforeUnmount(() => {
  stopTemplateSlotDragging()
  stopTemplateSlotResizing()
  window.removeEventListener('keydown', handleTemplateEditorKeydown)
})

watch(selectedAuthCourse, (course) => {
  if (!course) return
  selectedAuthGroupIds.value = [...(course.authorizedGroupIds || [])]
  selectedAuthOrganization.value = course.authorizedOrganization === true
  selectedAuthClassIds.value = [...(course.authorizedClassIds || [])]
  courseAuthError.value = ''
}, { immediate: true })

watch(selectedPermissionGroupId, (groupId) => {
  const group = accountPermissionStore.groupById(groupId)
  if (group) applyPermissionGroupDraft(group)
}, { immediate: true })

watch(h5TemplateForm, () => {
  h5TemplateDirty.value = Boolean(h5TemplateBaseline.value && JSON.stringify(createH5TemplateForm(h5TemplateForm)) !== h5TemplateBaseline.value)
}, { deep: true })

watch(h5CenterTab, (tab) => {
  if (tab === 'audit') loadH5Reports()
})


function roleLabel(role) {
  return {
    student: '用户端账号',
    teacher: '讲师端账号',
    admin: '管理员账号',
  }[role] || '账号'
}

function accountBindingText(account) {
  if (account.role === 'teacher') return `权限组：${permissionGroupNames(account.groupIds)}`
  return account.className || '未设置'
}

function accountNames(ids = []) {
  return ids.map((id) => accountPermissionStore.accounts.find((account) => account.id === id)?.name || id)
}

function permissionEntries(account) {
  return Object.entries(account.permissions || {}).map(([key, value]) => ({
    key,
    value,
    label: permissionLabels[key] || key,
  }))
}

async function togglePermission(accountId, key, event) {
  await accountPermissionStore.updatePermission(accountId, key, event.target.checked)
  ElMessage.success('账号权限已更新')
}

async function toggleAccountStatus(account, event) {
  await accountPermissionStore.updateAccount(account.id, { status: event.target.checked ? 'enabled' : 'disabled' })
  ElMessage.success('账号状态已更新')
}

function openAccountDetail(account) {
  selectedAccountDetailId.value = account.id
  accountDetailTab.value = 'basic'
  showAccountDetailDialog.value = true
}

function openAccountEdit(account) {
  accountEditMode.value = 'edit'
  Object.assign(accountEditDraft, {
    id: account.id,
    role: account.role,
    name: account.name || '',
    account: account.account || '',
    className: account.className || '',
    campusId: account.campus?.id || '',
    classIds: [...(account.classIds || [])],
    status: account.status || 'enabled',
    groupIds: [...(account.groupIds || [])],
    adminScopeType: account.adminScopes?.some((scope) => scope.type === 'organization') ? 'organization' : 'campus',
    adminCampusIds: (account.adminScopes || []).filter((scope) => scope.type === 'campus').map((scope) => scope.campusId),
    password: '',
    passwordConfirm: '',
  })
  showAccountEditDialog.value = true
}

function openAccountCreate() {
  accountEditMode.value = 'create'
  Object.assign(accountEditDraft, {
    id: '',
    role: 'student',
    name: '',
    account: '',
    className: '',
    campusId: accountPermissionStore.campuses[0]?.id || '',
    classIds: [],
    status: 'enabled',
    groupIds: [],
    adminScopeType: accountPermissionStore.organizationWide ? 'organization' : 'campus',
    adminCampusIds: [],
    password: '',
    passwordConfirm: '',
  })
  showAccountEditDialog.value = true
}

function campusName(campusId) {
  return organizationSetup.campuses.find((item) => item.id === campusId)?.name || '未知机构分部'
}

function className(classId) {
  return organizationSetup.classes.find((item) => item.id === classId)?.name || '未知班级'
}

async function loadOrganizationSetup() {
  if (!accountPermissionStore.organizationWide) return
  organizationSetupLoading.value = true
  organizationSetupError.value = ''
  try {
    const response = await apiClient.get('/admin/organization-setup')
    organizationSetup.campuses = response.data.campuses || []
    organizationSetup.classes = response.data.classes || []
    organizationSetup.codes = response.data.codes || []
    if (!classDraft.campusId) classDraft.campusId = organizationSetup.campuses.find((item) => item.status === 'active')?.id || ''
    if (!enrollmentDraft.campusId) enrollmentDraft.campusId = classDraft.campusId
  } catch (error) {
    organizationSetupError.value = error.response?.data?.message || error.message || '无法读取机构分部与邀请码数据。'
  } finally {
    organizationSetupLoading.value = false
  }
}

async function openOrganizationSetup() {
  accountPanel.value = 'organization'
  await loadOrganizationSetup()
}

async function openEnrollmentSetup() {
  accountPanel.value = 'enrollment'
  await loadOrganizationSetup()
}

async function saveCampusSetup() {
  const name = campusDraft.name.trim()
  const code = campusDraft.code.trim()
  if (!name || !code) {
    ElMessage.warning('请填写机构分部名称和机构分部代码。')
    return
  }
  try {
    await apiClient.post('/admin/campuses', { name, code })
    campusDraft.name = ''
    campusDraft.code = ''
    await loadOrganizationSetup()
    await accountPermissionStore.loadAdminData()
    ElMessage.success('机构分部已创建。')
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message || '创建机构分部失败。')
  }
}

function campusClassCount(campusId) {
  return organizationSetup.classes.filter((item) => item.campus_id === campusId).length
}

function openCampusEdit(campus) {
  Object.assign(campusEditDraft, {
    id: campus.id,
    name: campus.name || '',
    code: campus.code || '',
    status: campus.status === 'disabled' ? 'disabled' : 'active',
  })
  showCampusEditDialog.value = true
}

async function saveCampusEdit() {
  const name = campusEditDraft.name.trim()
  const code = campusEditDraft.code.trim()
  if (!name || !code) {
    ElMessage.warning('请填写机构分部名称和机构分部代码。')
    return
  }
  try {
    await apiClient.patch(`/admin/campuses/${encodeURIComponent(campusEditDraft.id)}`, { name, code, status: campusEditDraft.status })
    showCampusEditDialog.value = false
    await loadOrganizationSetup()
    await accountPermissionStore.loadAdminData()
    ElMessage.success('机构分部信息已更新。')
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message || '更新机构分部失败。')
  }
}

async function confirmDisableCampus(campus) {
  try {
    await ElMessageBox.confirm(`停用“${campus.name}”后，该机构分部不会再出现在创建账号、班级和邀请码的可选列表中；已有账号和业务数据会保留。`, '删除机构分部', {
      confirmButtonText: '停用机构分部',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await apiClient.delete(`/admin/campuses/${encodeURIComponent(campus.id)}`)
    await loadOrganizationSetup()
    await accountPermissionStore.loadAdminData()
    ElMessage.success('机构分部已停用，原有数据未删除。')
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message || '停用机构分部失败。')
  }
}

async function enableCampus(campus) {
  try {
    await apiClient.patch(`/admin/campuses/${encodeURIComponent(campus.id)}`, { name: campus.name, code: campus.code, status: 'active' })
    await loadOrganizationSetup()
    await accountPermissionStore.loadAdminData()
    ElMessage.success('机构分部已重新启用。')
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message || '重新启用机构分部失败。')
  }
}

async function saveClassSetup() {
  const name = classDraft.name.trim()
  if (!classDraft.campusId || !name) {
    ElMessage.warning('请选择机构分部并填写班级名称。')
    return
  }
  try {
    await apiClient.post('/admin/classes', { campusId: classDraft.campusId, name })
    classDraft.name = ''
    await loadOrganizationSetup()
    await accountPermissionStore.loadAdminData()
    ElMessage.success('班级已创建。')
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message || '创建班级失败。')
  }
}

async function createEnrollmentCode() {
  if (!enrollmentDraft.campusId) {
    ElMessage.warning('请选择机构分部。')
    return
  }
  try {
    const response = await apiClient.post('/admin/enrollment-codes', {
      campusId: enrollmentDraft.campusId,
      classId: enrollmentDraft.classId || null,
      role: enrollmentDraft.role,
      maxUses: enrollmentDraft.maxUses,
      label: enrollmentDraft.label.trim(),
    })
    enrollmentDraft.classId = ''
    enrollmentDraft.maxUses = 1
    enrollmentDraft.label = ''
    await loadOrganizationSetup()
    ElMessage.success(`邀请码已生成：${response.data.enrollmentCode?.code || '请刷新查看'}`)
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message || '生成邀请码失败。')
  }
}

async function saveAccountEdit() {
  const name = accountEditDraft.name.trim()
  if (!name) {
    ElMessage.warning('请填写账号姓名')
    return
  }
  // 以前账号留空会退回用姓名当账号，姓名是中文时就变成了中文账号。
  // 现在账号必须是独立填写的英文账号，不允许再用姓名兜底。
  const account = sanitizeAccountInput(accountEditDraft.account)
  const accountMessage = accountFormatError(account)
  if (accountMessage) {
    ElMessage.warning(`请填写登录账号：${accountMessage}`)
    return
  }
  const payload = {
    name,
    account,
    className: accountEditDraft.className.trim(),
    campusId: accountEditDraft.role === 'admin' && accountEditDraft.adminScopeType === 'organization' ? null : accountEditDraft.campusId,
    classIds: [...accountEditDraft.classIds],
    status: accountEditDraft.status,
    groupIds: accountEditDraft.role === 'teacher' ? [...accountEditDraft.groupIds] : [],
    adminScopeType: accountEditDraft.adminScopeType,
    adminScopes: accountEditDraft.role === 'admin'
      ? (accountEditDraft.adminScopeType === 'organization'
          ? [{ type: 'organization', campusId: null }]
          : accountEditDraft.adminCampusIds.map((campusId) => ({ type: 'campus', campusId })))
      : undefined,
  }
  if (accountEditDraft.role !== 'admin' && !payload.campusId) {
    ElMessage.warning('请选择账号所属机构分部')
    return
  }
  if (accountEditDraft.role === 'admin' && accountEditDraft.adminScopeType === 'campus') {
    if (!accountEditDraft.adminCampusIds.length) {
      ElMessage.warning('请至少选择一个授权机构分部')
      return
    }
    payload.campusId = accountEditDraft.adminCampusIds[0]
  }
  if (['student', 'teacher'].includes(accountEditDraft.role)) {
    payload.className = accountPermissionStore.classes
      .filter((item) => payload.classIds.includes(item.id)).map((item) => item.name).join('、')
  }
  if (accountEditMode.value === 'edit' && accountEditDraft.id === userStore.user?.id) payload.adminScopes = undefined
  const password = accountEditDraft.password
  const passwordConfirm = accountEditDraft.passwordConfirm
  if (accountEditMode.value === 'create' && !password) {
    ElMessage.warning('请设置登录密码')
    return
  }
  if (password || passwordConfirm) {
    if (password.length < 8) {
      ElMessage.warning('密码至少需要 8 位')
      return
    }
    if (password !== passwordConfirm) {
      ElMessage.warning('两次输入的密码不一致')
      return
    }
    payload.password = password
  }
  if (accountEditMode.value === 'create') {
    await accountPermissionStore.createAccount({ ...payload, role: accountEditDraft.role })
    accountRoleFilter.value = 'all'
    ElMessage.success('账号已创建')
  } else {
    await accountPermissionStore.updateAccount(accountEditDraft.id, payload)
    ElMessage.success('账号信息已保存')
  }
  showAccountEditDialog.value = false
}

async function resetSelectedAccountPassword(account) {
  try {
    const { value } = await ElMessageBox.prompt(`为“${account.name}”设置新密码`, '重置密码', {
      confirmButtonText: '重置并退出全部设备', cancelButtonText: '取消', inputType: 'password',
      inputValidator: (value) => String(value || '').length >= 8 || '密码至少需要 8 位',
    })
    await accountPermissionStore.resetPassword(account.id, value)
    ElMessage.success('密码已由服务端加盐哈希保存，旧会话已全部失效')
  } catch {}
}

async function revokeSelectedAccountSessions(account) {
  try {
    await ElMessageBox.confirm(`确定让“${account.name}”退出全部设备吗？`, '强制退出', { type: 'warning' })
    await accountPermissionStore.revokeSessions(account.id)
    ElMessage.success('该账号的全部服务端会话已撤销')
  } catch {}
}

async function confirmDeleteAccount(account) {
  if (account.id === userStore.user?.id) {
    ElMessage.warning('不能删除当前登录的管理员账号')
    return
  }
  try {
    await ElMessageBox.confirm(`确定停用账号“${account.name}”吗？作品、画布、报告、视频和 3D 数据会保留。`, '停用账号', {
      confirmButtonText: '停用',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  if (!(await accountPermissionStore.deleteAccount(account.id))) {
    ElMessage.error('账号删除失败')
    return
  }
  if (selectedAccountDetailId.value === account.id) showAccountDetailDialog.value = false
  ElMessage.success('账号已停用，业务数据仍保留在服务端')
}

function emptyGroupPermissions() {
  return Object.fromEntries(groupPermissionOptions.map((item) => [item.key, false]))
}

function applyPermissionGroupDraft(group = {}) {
  permissionGroupDraft.name = group.name || ''
  permissionGroupDraft.description = group.description || ''
  permissionGroupDraft.enabled = group.status !== 'disabled'
  permissionGroupDraft.memberIds = [...(group.memberIds || [])]
  permissionGroupDraft.permissions = {
    ...emptyGroupPermissions(),
    ...(group.permissions || {}),
  }
}

function startNewPermissionGroup() {
  selectedPermissionGroupId.value = ''
  applyPermissionGroupDraft()
}

function selectPermissionGroup(groupId) {
  selectedPermissionGroupId.value = groupId
  const group = accountPermissionStore.groupById(groupId)
  if (group) applyPermissionGroupDraft(group)
}

async function savePermissionGroup() {
  const name = permissionGroupDraft.name.trim()
  if (!name) {
    ElMessage.warning('请填写权限组名称')
    return
  }
  const payload = {
    name,
    description: permissionGroupDraft.description.trim(),
    status: permissionGroupDraft.enabled ? 'enabled' : 'disabled',
    memberIds: [...permissionGroupDraft.memberIds],
    permissions: { ...permissionGroupDraft.permissions },
  }
  const group = selectedPermissionGroupId.value
    ? await accountPermissionStore.updatePermissionGroup(selectedPermissionGroupId.value, payload)
    : await accountPermissionStore.createPermissionGroup(payload)
  selectedPermissionGroupId.value = group.id
  ElMessage.success('权限组已保存')
}

async function deletePermissionGroup() {
  const groupId = selectedPermissionGroupId.value
  if (!groupId) return
  if (await accountPermissionStore.deletePermissionGroup(groupId)) {
    // 课程数据里去掉这个组（服务端删组时已经删了对应的授权记录，这里让课程数据也一致）
    for (const course of courseStore.courses.filter((item) => (item.authorizedGroupIds || []).includes(groupId))) {
      try {
        await courseStore.updateCourse(course.id, { authorizedGroupIds: course.authorizedGroupIds.filter((id) => id !== groupId) })
      } catch (error) {
        console.warn('[courses] 清理已删除权限组的课程授权失败：', course.id, error?.message)
      }
    }
    reportTemplateStore.templates.forEach((template) => {
      if ((template.authorizedGroupIds || []).includes(groupId)) {
        reportTemplateStore.updateTemplate(template.id, {
          authorizedGroupIds: template.authorizedGroupIds.filter((id) => id !== groupId),
        })
      }
    })
    selectedPermissionGroupId.value = accountPermissionStore.permissionGroups[0]?.id || ''
    if (!selectedPermissionGroupId.value) applyPermissionGroupDraft()
    ElMessage.success('权限组已删除，相关课程授权已同步移除')
  }
}

function categoryLabel(value) {
  if (value === customCourseCategoryValue) return adminCourseCustomCategoryName.value || '自定义'
  return categoryOptions.value.find((item) => item.value === value)?.label || value || '综合项目'
}

function readDeletedCourseCategoryValues() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(adminCourseDeletedCategoryStorageKey) || '[]')
    return Array.isArray(saved) ? saved.map((item) => String(item)).filter(Boolean) : []
  } catch {
    return []
  }
}

function readAdminCourseCategoryOptions() {
  const deletedValues = new Set(deletedCourseCategoryValues.value || [])
  const defaults = courseCategories.filter((item) => item.value !== 'all' && !deletedValues.has(item.value)).map((item) => ({ ...item }))
  try {
    const saved = JSON.parse(window.localStorage.getItem(adminCourseCategoryStorageKey) || '[]')
    if (!Array.isArray(saved)) return defaults
    const values = new Set(defaults.map((item) => item.value))
    const custom = saved
      .map((item) => ({
        label: String(item?.label || '').trim(),
        value: String(item?.value || '').trim(),
      }))
      .filter((item) => item.label && item.value && !values.has(item.value))
    return [...defaults, ...custom]
  } catch {
    return defaults
  }
}

// 课程分类在服务端模式下是机构级数据（org_course_categories：内置 7 个 + 机构自定义），演示模式才存浏览器
function toCategoryOptions(list) {
  return (Array.isArray(list) ? list : []).map((item) => ({ value: String(item.value), label: String(item.label) }))
}

// 课程库（服务端）：进后台就拉一次；授权页要用的班级、权限组也一起准备好
async function loadAdminCourses() {
  await Promise.all([
    courseStore.load(),
    loadServerCourseCategories(),
    serverAuthMode ? accountPermissionStore.loadAdminData().catch(() => {}) : null,
  ])
  if (!courseStore.courses.some((course) => course.id === selectedAuthCourseId.value)) {
    selectedAuthCourseId.value = courseStore.courses[0]?.id || ''
  }
}

async function loadServerCourseCategories() {
  if (!serverAuthMode) return
  try {
    const { data } = await apiClient.get('/course-categories', { timeout: 10000 })
    if (Array.isArray(data.categories) && data.categories.length) categoryOptions.value = toCategoryOptions(data.categories)
    await migrateLocalCourseCategories()
  } catch (error) {
    console.warn('[courses] 课程分类读取失败：', error?.response?.data?.message || error?.message)
  }
}

// 旧后台把自定义课程类型存在浏览器里：服务端模式下搬上去一次（每个机构一次）
async function migrateLocalCourseCategories() {
  const flag = `art-studio-course-categories-migrated:${userStore.user?.organization?.id || ''}`
  if (window.localStorage.getItem(flag)) return
  let saved = []
  try {
    saved = JSON.parse(window.localStorage.getItem(adminCourseCategoryStorageKey) || '[]')
  } catch {
    saved = []
  }
  const labels = new Set(categoryOptions.value.map((item) => item.label))
  try {
    for (const item of (Array.isArray(saved) ? saved : [])) {
      const label = String(item?.label || '').trim()
      if (!label || labels.has(label)) continue
      const id = String(item?.value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '') || `custom-${Date.now().toString(36)}`
      const { data } = await apiClient.post('/admin/course-categories', { id, label, sortOrder: categoryOptions.value.length + 1 }, { timeout: 10000 })
      if (Array.isArray(data.categories)) categoryOptions.value = toCategoryOptions(data.categories)
      labels.add(label)
    }
    window.localStorage.setItem(flag, new Date().toISOString())
  } catch (error) {
    console.warn('[courses] 本机课程类型搬到服务端失败：', error?.response?.data?.message || error?.message)
  }
}

async function createAdminCourseCategory(name = '') {
  const label = String(name).trim().replace(/\s+/g, ' ')
  if (!label) return null
  const existing = categoryOptions.value.find((item) => item.label.toLocaleLowerCase() === label.toLocaleLowerCase())
  if (existing) return existing
  if (serverAuthMode) {
    const id = `custom-${Date.now().toString(36)}`
    const { data } = await apiClient.post('/admin/course-categories', { id, label, sortOrder: categoryOptions.value.length + 1 }, { timeout: 10000 })
    if (Array.isArray(data.categories)) categoryOptions.value = toCategoryOptions(data.categories)
    return categoryOptions.value.find((item) => item.value === id) || { label, value: id }
  }
  const category = {
    label,
    value: `custom-${Date.now()}-${categoryOptions.value.length}`,
  }
  categoryOptions.value = [...categoryOptions.value, category]
  const defaultValues = new Set(courseCategories.map((item) => item.value))
  const custom = categoryOptions.value.filter((item) => !defaultValues.has(item.value))
  window.localStorage.setItem(adminCourseCategoryStorageKey, JSON.stringify(custom))
  return category
}

function openCourseCategoryDialog() {
  newCourseCategoryName.value = ''
  showCourseCategoryDialog.value = true
}

function closeCourseCategoryDialog() {
  showCourseCategoryDialog.value = false
  newCourseCategoryName.value = ''
}

async function saveCourseCategory() {
  let category
  try {
    category = await createAdminCourseCategory(newCourseCategoryName.value)
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '课程类型保存失败，请稍后重试')
    return
  }
  if (!category) {
    ElMessage.warning('请先填写课程类型名称')
    return
  }
  adminCourseForm.category = category.value
  newCourseCategoryName.value = ''
  ElMessage.success('课程类型已添加')
}

function persistCustomCourseCategories() {
  if (serverAuthMode) return
  window.localStorage.setItem(adminCourseCategoryStorageKey, JSON.stringify(customCategoryOptions.value))
}

function persistDeletedCourseCategories() {
  if (serverAuthMode) return
  window.localStorage.setItem(adminCourseDeletedCategoryStorageKey, JSON.stringify(deletedCourseCategoryValues.value))
}

function selectCustomAdminCategory() {
  adminCourseForm.category = customCourseCategoryValue
  showCourseCategoryDropdown.value = false
}

function selectAdminCategory(category) {
  if (!category?.value) return
  adminCourseForm.category = category.value
  adminCourseCustomCategoryName.value = ''
  showCourseCategoryDropdown.value = false
}

async function saveCustomAdminCategory() {
  if (adminCourseForm.category !== customCourseCategoryValue) return null
  const category = await createAdminCourseCategory(adminCourseCustomCategoryName.value)
  if (!category) return null
  adminCourseForm.category = category.value
  adminCourseCustomCategoryName.value = ''
  return category
}

async function resolveAdminCourseCategoryForSave() {
  if (adminCourseForm.category !== customCourseCategoryValue) return adminCourseForm.category
  let category
  try {
    category = await saveCustomAdminCategory()
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '课程类型保存失败，请稍后重试')
    return ''
  }
  if (!category) {
    if (!adminCourseCustomCategoryName.value.trim()) ElMessage.warning('请先填写自定义课程类型名称')
    return ''
  }
  return category.value
}

async function deleteCourseCategory(category) {
  if (!category?.value) return
  const inUse = courseStore.courses.some((course) => course.category === category.value)
  if (inUse) {
    ElMessage.warning('该课程类型已有课程使用，暂不能删除')
    return
  }
  if (serverAuthMode) {
    try {
      const { data } = await apiClient.delete(`/admin/course-categories/${encodeURIComponent(category.value)}`, { timeout: 10000 })
      if (Array.isArray(data.categories)) categoryOptions.value = toCategoryOptions(data.categories)
    } catch (error) {
      ElMessage.error(error?.response?.data?.message || '删除失败，请稍后重试')
      return
    }
  } else {
    const defaultValues = new Set(courseCategories.map((item) => item.value))
    if (defaultValues.has(category.value) && !deletedCourseCategoryValues.value.includes(category.value)) {
      deletedCourseCategoryValues.value = [...deletedCourseCategoryValues.value, category.value]
      persistDeletedCourseCategories()
    }
    categoryOptions.value = categoryOptions.value.filter((item) => item.value !== category.value)
    persistCustomCourseCategories()
  }
  if (adminCourseForm.category === category.value) adminCourseForm.category = categoryOptions.value[0]?.value || customCourseCategoryValue
  ElMessage.success('课程类型已删除')
}

function createBlankAdminQuestion() {
  return {
    type: 'choice',
    title: '',
    options: ['', '', '', ''],
    answer: 'A',
  }
}

function normalizeAdminQuestion(question = {}) {
  const options = Array.from({ length: 4 }, (_, index) => String(question.options?.[index] || '').trim())
  return {
    type: 'choice',
    title: String(question.title || '').trim(),
    options,
    answer: questionOptionLabels.includes(question.answer) ? question.answer : 'A',
  }
}

function normalizeAdminQuestions(questions = []) {
  return questions
    .map((question) => normalizeAdminQuestion(question))
    .filter((question) => question.title || question.options.some(Boolean))
}

function syncAdminQuestionText() {
  adminCourseForm.questionsText = adminCourseForm.questions.map((question) => question.title).filter(Boolean).join('\n')
}

function addAdminQuestion() {
  adminCourseForm.questions.push(createBlankAdminQuestion())
  syncAdminQuestionText()
}

function removeAdminQuestion(index) {
  adminCourseForm.questions.splice(index, 1)
  syncAdminQuestionText()
}

function safeJoin(value) {
  return Array.isArray(value) && value.length ? value.join('、') : '暂未设置'
}

function permissionGroupNameList(ids = []) {
  // 服务端模式下组已经删掉（或是旧版本的演示组 ID）就不显示，免得出现一串看不懂的编号
  return (ids || []).map((id) => accountPermissionStore.groupById(id)?.name || (serverAuthMode ? '' : id)).filter(Boolean)
}

function permissionGroupNames(ids = []) {
  const names = permissionGroupNameList(ids)
  return names.length ? names.join('、') : '暂未授权'
}

function defaultH5EditionConfig(id) {
  const defaults = {
    junior: { status: 'unconfigured', rendererKey: '', defaultStrategyId: 'h5-standard', allowedStrategyIds: ['h5-standard'], defaultTemplateId: '', allowedTemplateIds: [], studentCanChoose: false, contentProfile: 'starter-self-narration', agentId: 'report-agent-h5-first-person', auditPolicy: 'h5-default-auto' },
    starter: { status: 'enabled', rendererKey: 'starter-simple', defaultStrategyId: 'h5-standard', allowedStrategyIds: ['h5-standard'], defaultTemplateId: 'h5-kids-classroom', allowedTemplateIds: ['h5-kids-classroom'], studentCanChoose: false, contentProfile: 'starter-self-narration', agentId: 'report-agent-h5-first-person', auditPolicy: 'h5-default-auto' },
    advanced: { status: 'unconfigured', rendererKey: '', defaultStrategyId: 'h5-standard', allowedStrategyIds: ['h5-standard'], defaultTemplateId: '', allowedTemplateIds: [], studentCanChoose: false, contentProfile: 'advanced-portfolio', agentId: 'report-agent-h5-first-person', auditPolicy: 'h5-default-auto' },
    pro: { status: 'enabled', rendererKey: 'pro-workbench', defaultStrategyId: 'h5-standard', allowedStrategyIds: ['h5-standard'], defaultTemplateId: 'h5-ai-tech', allowedTemplateIds: ['h5-ai-tech', 'h5-art-gallery', 'h5-growth-file'], studentCanChoose: true, contentProfile: 'pro-designer-story', agentId: 'report-agent-h5-first-person', auditPolicy: 'h5-default-auto' },
  }
  return { ...defaults[id] }
}
function h5ContentProfileLabel(value) {
  return {
    'starter-self-narration': '用户第一人称创作自述',
    'story-narration': '故事讲述型报告',
    'advanced-portfolio': '成长作品集型报告',
    'pro-designer-story': '专业设计师讲解型报告',
  }[value] || '未设置文案策略'
}
function formatH5AgentTime(value) {
  if (!value) return '尚未保存'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '已保存'
  return date.toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-')
}
function editCurrentH5Agent() {
  const agent = selectedH5BoundAgent.value
  if (!agent) {
    ElMessage.warning('当前版本尚未绑定可编辑的H5报告智能体')
    return
  }
  openAgentEditor(agent.id)
  activeNav.value = 'agents'
}
function h5EditionConfig(id) {
  if (!h5ReportCenterConfig.editions) h5ReportCenterConfig.editions = {}
  if (!h5ReportCenterConfig.editions[id]) h5ReportCenterConfig.editions[id] = defaultH5EditionConfig(id)
  return h5ReportCenterConfig.editions[id]
}
function h5EditionStatusLabel(status) {
  return { enabled: '已启用', unconfigured: '未配置', disabled: '已停用' }[status] || '未配置'
}
function h5StrategyStatusLabel(status) {
  return { enabled: '已启用', testing: '测试中', disabled: '已停用' }[status] || '未配置'
}
async function openH5StrategyWorkflow() {
  const strategy = selectedH5Strategy.value
  if (!strategy || strategy.type !== 'canvas-workflow' || h5WorkflowOpening.value) return
  h5WorkflowOpening.value = true
  try {
    if (!strategy.workflowId) {
      const created = await saveEditableAiSkill({
        title: `${strategy.name || '方案2'}工作流`,
        summary: 'H5 报告方案 2 的无限画布配图与文字整理工作流。',
        skillType: 'image',
        scopeType: 'organization',
        sortOrder: 0,
        configuration: defaultSkillConfiguration('image'),
      })
      if (!created?.id) throw new Error('无限画布工作流创建失败')
      strategy.workflowId = created.id
      strategy.workflowVersion = Number(created.draftRevision || 1)
      const response = await apiClient.post('/admin/h5-report-config/draft', { ...JSON.parse(JSON.stringify(h5ReportCenterConfig)), configRevision: h5CenterRevision.value })
      h5CenterRevision.value = response.data.revision
      h5HasUnpublishedChanges.value = true
      h5CenterStatus.value = '方案 2 工作流已创建，配置草稿已保存'
      ElMessage.success(response.data.message || '方案 2 工作流已创建')
    }
    router.push({ path: `/admin/ai-skills/${encodeURIComponent(strategy.workflowId)}/workflow`, query: { returnTo: 'h5-report' } })
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || error?.message || '无法打开无限画布工作流')
  } finally {
    h5WorkflowOpening.value = false
  }
}

// 方案 2 的所有风格工作流都在「报告工作流库」里管理，这里只负责跳转。
function openH5WorkflowLibrary() {
  activeNav.value = 'h5WorkflowLibrary'
  router.replace({ path: '/admin/h5-report-workflows' })
}
function h5EditionSummary(id) {
  const config = h5EditionConfig(id)
  if (config.status === 'unconfigured') return '用户端暂未开放'
  const template = h5TemplateStore.byId(config.defaultTemplateId)
  return template ? `${template.name}${config.studentCanChoose ? ' · 可选模板' : ''}` : '暂未设置默认模板'
}
function h5TemplateEditionText(templateId) {
  const labels = h5EditionOptions
    .filter((edition) => h5EditionConfig(edition.id).allowedTemplateIds?.includes(templateId))
    .map((edition) => edition.label)
  return labels.length ? labels.join('、') : '未绑定版本'
}
function selectH5Edition(id) {
  selectedH5EditionId.value = id
  const config = h5EditionConfig(id)
  const template = h5TemplateStore.byId(config.defaultTemplateId) || h5TemplateStore.templates[0]
  if (template) selectH5Template(template)
}
function syncH5TemplatesToCenter() {
  h5ReportCenterConfig.templates = JSON.parse(JSON.stringify(h5TemplateStore.templates))
}
function onH5StudioSaved(result) {
  h5CenterRevision.value = result.revision
  h5TemplateStore.replaceTemplates(result.draft.templates)
  syncH5TemplatesToCenter()
  const selected = h5TemplateStore.byId(result.template.id)
  if (selected) selectH5Template(selected)
  h5HasUnpublishedChanges.value = JSON.stringify(result.draft) !== JSON.stringify(result.published)
}
function applyH5ReportCenterConfig(config = {}) {
  const strategies = Array.isArray(config.strategies) && config.strategies.length ? config.strategies : defaultH5Strategies.map((item) => ({ ...item }))
  strategies.forEach((strategy) => {
    if (strategy.type !== 'canvas-workflow') return
    strategy.adapterKey = 'h5-report-canvas-adapter'
    strategy.boundTemplateIds = Array.isArray(strategy.boundTemplateIds) ? strategy.boundTemplateIds : []
    strategy.inputPolicy = { text: 'report-document', images: 'all-project-materials', template: 'selected-h5-template' }
    strategy.outputPolicy = { resultType: 'page-images', maxPages: 12, ratio: '9:16', requireImageResult: true, ...(strategy.outputPolicy || {}) }
  })
  Object.assign(h5ReportCenterConfig, {
    version: config.version || 2,
    updatedAt: config.updatedAt || '',
    strategies,
    templates: Array.isArray(config.templates) ? config.templates : [],
    editions: config.editions || {},
  })
  h5EditionOptions.forEach((edition) => h5EditionConfig(edition.id))
  h5TemplateStore.replaceTemplates(h5ReportCenterConfig.templates)
  if (!h5ReportCenterConfig.strategies.some((item) => item.id === selectedH5StrategyId.value)) selectedH5StrategyId.value = h5ReportCenterConfig.strategies[0]?.id || 'h5-standard'
  const current = h5TemplateStore.byId(selectedH5TemplateId.value) || h5TemplateStore.templates[0]
  if (current) selectH5Template(current)
}
async function loadH5ReportCenter() {
  try {
    h5CenterStatus.value = '正在读取服务器配置…'
    const response = await apiClient.get('/admin/h5-report-config')
    h5CenterRevision.value = response.data.revision
    applyH5ReportCenterConfig(response.data.draft || response.data)
    h5HasUnpublishedChanges.value = response.data.hasUnpublishedChanges === true
    h5CenterStatus.value = h5HasUnpublishedChanges.value ? '存在尚未发布的配置草稿' : '服务器配置已同步'
  } catch (error) {
    h5CenterStatus.value = '服务器未连接，当前显示本地模板'
    if (!h5ReportCenterConfig.strategies.length) h5ReportCenterConfig.strategies = defaultH5Strategies.map((item) => ({ ...item }))
    syncH5TemplatesToCenter()
  }
}
async function saveH5ReportCenter() {
  if (selectedH5EditionConfig.value.status === 'enabled' && !selectedH5EditionConfig.value.defaultTemplateId) {
    ElMessage.warning('已启用版本需要设置默认模板')
    return
  }
  if (selectedH5EditionConfig.value.defaultStrategyId && !selectedH5EditionConfig.value.allowedStrategyIds.includes(selectedH5EditionConfig.value.defaultStrategyId)) {
    selectedH5EditionConfig.value.allowedStrategyIds.push(selectedH5EditionConfig.value.defaultStrategyId)
  }
  syncH5TemplatesToCenter()
  h5CenterSaving.value = true
  try {
    const response = await apiClient.post('/admin/h5-report-config', { ...JSON.parse(JSON.stringify(h5ReportCenterConfig)), configRevision: h5CenterRevision.value })
    h5CenterRevision.value = response.data.revision
    applyH5ReportCenterConfig(response.data.config)
    h5HasUnpublishedChanges.value = false
    h5CenterStatus.value = '服务器配置已同步'
    ElMessage.success(response.data.message || 'H5 报告中心配置已发布')
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || 'H5 配置保存失败，请检查服务端是否已启动')
  } finally {
    h5CenterSaving.value = false
  }
}

function createH5TemplateForm(template = {}) {
  const moduleKeys = h5ReportModules.map((item) => item.key)
  return {
    id: template?.id || '',
    strategyId: template?.strategyId || 'h5-standard',
    designDocument: template?.designDocument ? JSON.parse(JSON.stringify(template.designDocument)) : null,
    organizationId: template?.organizationId || '',
    revision: Number(template?.revision || 0),
    name: template?.name || '',
    layout: template?.layout || 'kids-classroom',
    description: template?.description || '',
    status: template?.status || 'draft',
    theme: {
      primary: template?.theme?.primary || '#f97316',
      secondary: template?.theme?.secondary || '#14b8a6',
      accent: template?.theme?.accent || '#facc15',
      background: template?.theme?.background || '#fff7ed',
      surface: template?.theme?.surface || '#ffffff',
      text: template?.theme?.text || '#334155',
    },
    fontFamily: template?.fontFamily || 'Microsoft YaHei',
    contentDensity: template?.contentDensity || 'relaxed',
    pageMode: template?.pageMode === 'paged' ? 'paged' : 'paged',
    storyPreset: template?.storyPreset || '',
    renderVersion: Number(template?.renderVersion || 1),
    visualGeneration: {
      enabled: template?.visualGeneration?.enabled === true,
      mode: template?.visualGeneration?.mode || 'full-page',
      storyOrder: Array.isArray(template?.visualGeneration?.storyOrder) && template.visualGeneration.storyOrder.length
        ? [...template.visualGeneration.storyOrder]
        : [...productStoryPageKeys],
    },
    pageDesigns: { ...(template?.pageDesigns || {}) },
    minPages: Math.max(1, Math.min(12, Number(template?.minPages || 6))),
    maxPages: Math.max(6, Math.min(12, Number(template?.maxPages || 12))),
    displayOptions: {
      studentInfo: template?.displayOptions?.studentInfo !== false,
      chapterNav: template?.displayOptions?.chapterNav !== false,
      social: template?.displayOptions?.social !== false,
      download: template?.displayOptions?.download !== false,
      official: template?.displayOptions?.official !== false,
    },
    coverImage: template?.coverImage || '',
    decorImages: Array.isArray(template?.decorImages) ? [...template.decorImages] : [],
    previewImages: Array.isArray(template?.previewImages) ? [...template.previewImages] : [],
    posterConfig: {
      backgroundImage: template?.posterConfig?.backgroundImage || template?.coverImage || '',
      titleAlign: template?.posterConfig?.titleAlign || 'left',
      showStudentInfo: template?.posterConfig?.showStudentInfo !== false,
      showBrand: template?.posterConfig?.showBrand !== false,
      qrPosition: template?.posterConfig?.qrPosition || 'bottom-right',
    },
    moduleOrder: Array.isArray(template?.moduleOrder) && template.moduleOrder.length ? [...template.moduleOrder] : [...moduleKeys],
    hiddenModules: Array.isArray(template?.hiddenModules) ? [...template.hiddenModules] : [],
    officialButtonText: template?.officialButtonText || '进入官网',
    officialUrl: template?.officialUrl || '',
  }
}
function resetH5TemplateForm(template = {}) {
  Object.assign(h5TemplateForm, createH5TemplateForm(template))
  h5TemplateBaseline.value = JSON.stringify(createH5TemplateForm(template))
  h5TemplateDirty.value = false
}
function selectH5Template(template) {
  if (!template) return
  selectedH5TemplateId.value = template.id
  resetH5TemplateForm(template)
}
function selectH5VisualTemplate() {
  selectH5Template(h5TemplateStore.byId(selectedH5TemplateId.value))
}
function selectProductStoryVisualTemplate() {
  const template = h5TemplateStore.templates.find((item) => item.layout === 'product-design-story')
  if (!template) {
    ElMessage.warning('当前模板库中还没有产品设计故事模板')
    return
  }
  selectH5Template(template)
}
function startCreateH5Template() {
  if (h5TemplateDirty.value && !window.confirm('当前模板有未保存修改，确定新建模板吗？')) return
  selectedH5TemplateId.value = ''
  resetH5TemplateForm({ name: '新的 H5 报告模板', status: 'draft' })
  h5StyleStep.value = 'base'
}
function selectH5TemplateSafely(template) {
  if (h5TemplateDirty.value && !window.confirm('当前模板有未保存修改，确定切换模板吗？')) return
  selectH5Template(template)
}
function h5LayoutLabel(value) {
  return h5ReportLayouts.find((item) => item.value === value)?.label || value
}
function h5ModuleLabel(value) {
  return h5ReportModules.find((item) => item.key === value)?.label || value
}
function ensureProductStoryPageDesign(key) {
  if (!h5TemplateForm.pageDesigns || typeof h5TemplateForm.pageDesigns !== 'object') h5TemplateForm.pageDesigns = {}
  if (!h5TemplateForm.pageDesigns[key]) {
    const page = productStoryPageOptions.find((item) => item.key === key)
    h5TemplateForm.pageDesigns[key] = {
      enabled: true,
      variant: page?.variants?.[0]?.value || '',
      backgroundStyle: page?.backgrounds?.[0]?.value || '',
      characterPose: productStoryCharacterPoses[0].value,
      characterPosition: 'right-bottom',
      aiPrompt: '',
      title: page?.label || key,
      allowedSourceTypes: productStorySourceTypes.map((item) => item.value),
      fallbackVariant: 'friendly-empty',
      allowRegenerate: true,
      referenceImages: [],
      referenceStrength: 0.7,
    }
  }
  const design = h5TemplateForm.pageDesigns[key]
  if (!design.title) design.title = productStoryPageOptions.find((item) => item.key === key)?.label || key
  if (!Array.isArray(design.allowedSourceTypes)) design.allowedSourceTypes = productStorySourceTypes.map((item) => item.value)
  if (!design.fallbackVariant) design.fallbackVariant = 'friendly-empty'
  if (typeof design.allowRegenerate !== 'boolean') design.allowRegenerate = true
  if (!Array.isArray(design.referenceImages)) design.referenceImages = []
  else if (design.referenceImages.length > 3 || design.referenceImages.some((image) => !image)) {
    design.referenceImages = design.referenceImages.filter(Boolean).slice(0, 3)
  }
  if (!Number.isFinite(Number(design.referenceStrength))) design.referenceStrength = 0.7
  return design
}
function moveVisualStoryPage(index, delta) {
  const order = [...(h5TemplateForm.visualGeneration?.storyOrder || [])]
  const target = index + delta
  if (target < 0 || target >= order.length) return
  const [item] = order.splice(index, 1)
  order.splice(target, 0, item)
  h5TemplateForm.visualGeneration.storyOrder = order
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('参考图读取失败'))
    reader.readAsDataURL(file)
  })
}
async function handleH5VisualReferenceUpload(pageKey, event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    ElMessage.warning('参考图仅支持PNG、JPG或WEBP格式')
    return
  }
  if (file.size > 8 * 1024 * 1024) {
    ElMessage.warning('参考图不能超过8MB')
    return
  }
  const design = ensureProductStoryPageDesign(pageKey)
  if (design.referenceImages.length >= 3) {
    ElMessage.warning('每个页面最多上传3张参考图')
    return
  }
  h5ReferenceUploading[pageKey] = true
  try {
    const templateId = safeVisualTemplateId(h5TemplateForm.id || selectedH5TemplateId.value || 'visual-template-draft')
    const response = await apiClient.post('/admin/h5-visual-template-assets', {
      templateId,
      pageId: pageKey,
      imageData: await fileToDataUrl(file),
    })
    design.referenceImages = [...design.referenceImages, response.data.assetUrl].slice(0, 3)
    ElMessage.success('整页参考图已上传，请保存模板草稿')
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '参考图上传失败，请检查后端服务')
  } finally {
    h5ReferenceUploading[pageKey] = false
  }
}
function safeVisualTemplateId(value = '') {
  return String(value).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 96) || 'visual-template-draft'
}
function removeH5VisualReference(pageKey, imageIndex) {
  const design = ensureProductStoryPageDesign(pageKey)
  design.referenceImages = design.referenceImages.filter((_, index) => index !== imageIndex)
}
function h5StatusLabel(value) {
  return { published: '已上架', draft: '草稿', disabled: '停用' }[value] || value
}
function h5TemplateSwatchStyle(template) {
  const theme = template.theme || {}
  return { background: `linear-gradient(135deg, ${theme.primary || '#f97316'}, ${theme.accent || '#facc15'})` }
}
function toggleH5Module(key) {
  const next = new Set(h5TemplateForm.hiddenModules)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  h5TemplateForm.hiddenModules = [...next]
}
function moveH5Module(index, direction) {
  const target = index + direction
  if (target < 0 || target >= h5TemplateForm.moduleOrder.length) return
  const next = [...h5TemplateForm.moduleOrder]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  h5TemplateForm.moduleOrder = next
}
function handleH5CoverUpload(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    h5TemplateForm.coverImage = String(reader.result || '')
    ElMessage.success('H5 封面背景图已载入，保存后生效')
  }
  reader.readAsDataURL(file)
  event.target.value = ''
}
function saveH5Template() {
  if (!h5TemplateForm.name.trim()) {
    ElMessage.warning('请填写 H5 模板名称')
    return
  }
  const payload = createH5TemplateForm(h5TemplateForm)
  const saved = selectedH5TemplateId.value
    ? h5TemplateStore.updateTemplate(selectedH5TemplateId.value, payload)
    : h5TemplateStore.createTemplate(payload)
  if (!saved) {
    ElMessage.error('H5 模板保存失败')
    return null
  }
  selectedH5TemplateId.value = saved.id
  resetH5TemplateForm(saved)
  syncH5TemplatesToCenter()
  h5TemplateBaseline.value = JSON.stringify(createH5TemplateForm(saved))
  h5TemplateDirty.value = false
  return saved
}
async function saveH5TemplateDraft() {
  const saved = saveH5Template()
  if (!saved) return
  h5DraftSaving.value = true
  try {
    const response = await apiClient.post('/admin/h5-report-config/draft', { ...JSON.parse(JSON.stringify(h5ReportCenterConfig)), configRevision: h5CenterRevision.value })
    h5CenterRevision.value = response.data.revision
    h5HasUnpublishedChanges.value = true
    h5CenterStatus.value = '模板草稿已保存，等待发布'
    ElMessage.success(response.data.message || '模板草稿已保存')
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '模板草稿保存失败')
  } finally { h5DraftSaving.value = false }
}
function cancelH5TemplateEdit() {
  const current = h5TemplateStore.byId(selectedH5TemplateId.value)
  if (current) resetH5TemplateForm(current)
  else startCreateH5Template()
}
async function discardH5DraftChanges() {
  try {
    await ElMessageBox.confirm('将放弃后台尚未发布的模板和版本修改，恢复到当前已发布配置。', '放弃未发布修改', { confirmButtonText: '确认放弃', cancelButtonText: '取消', type: 'warning' })
  } catch { return }
  try {
    const response = await apiClient.get('/admin/h5-report-config')
    applyH5ReportCenterConfig(response.data.published || response.data)
    const restored = await apiClient.post('/admin/h5-report-config/draft', { ...JSON.parse(JSON.stringify(response.data.published || response.data)), configRevision: response.data.revision }); h5CenterRevision.value = restored.data.revision
    h5HasUnpublishedChanges.value = false
    h5CenterStatus.value = '已恢复当前发布配置'
  } catch { ElMessage.error('恢复发布配置失败') }
}
function openH5StudentTest() {
  sessionStorage.setItem('h5-report-template-test', JSON.stringify(createH5TemplateForm(h5TemplateForm)))
  const target = router.resolve({ path: '/student/h5-report', query: { templateTest: '1' } })
  window.open(target.href, '_blank', 'noopener')
}
async function testCurrentH5Agent() {
  if (!selectedH5BoundAgent.value) return
  h5AgentTesting.value = true
  try {
    const response = await apiClient.post('/report/generate', { mode: 'h5-first-person-report', flowKey: 'report.h5FirstPerson', agentId: selectedH5BoundAgent.value.id, project: { title: '未来城市测试作品', prompt: '自然、未来城市、儿童创意美术', ideaSummary: '我希望城市能和自然一起呼吸。' }, form: { title: 'H5智能体测试报告' }, selectedStyle: h5TemplateForm })
    const pageCount = response.data?.pages?.length || 0
    ElMessage.success(`智能体测试成功，返回 ${pageCount} 个报告章节`)
  } catch (error) { ElMessage.error(error?.response?.data?.message || '智能体测试失败，请检查模型配置') }
  finally { h5AgentTesting.value = false }
}
async function loadH5Reports() {
  h5ReportsLoading.value = true
  try { h5Reports.value = (await apiClient.get('/admin/h5-reports')).data.reports || [] }
  catch { h5Reports.value = [] }
  finally { h5ReportsLoading.value = false }
}
function h5ReportCount(status) { return status === 'all' ? h5Reports.value.length : h5Reports.value.filter((item) => item.status === status).length }
function h5ReportStatusLabel(status) { return { draft: '草稿', pending: '待人工审核', rejected: '已驳回', published: '已发布', offline: '已下架' }[status] || status }
async function auditH5Report(id, status) {
  const reason = status === 'rejected' ? window.prompt('请输入驳回原因', '请补充或调整报告内容后重新提交') : ''
  if (status === 'rejected' && reason === null) return
  try {
    await apiClient.patch(`/admin/h5-reports/${id}/audit`, { status, reason })
    await loadH5Reports()
    ElMessage.success(status === 'published' ? '报告已通过并生成分享链接' : '报告状态已更新')
  } catch (error) { ElMessage.error(error?.response?.data?.message || '审核操作失败') }
}
function duplicateH5Template() {
  const copy = h5TemplateStore.duplicateTemplate(selectedH5TemplateId.value, userStore.user?.name || '管理员')
  if (!copy) return
  selectedH5TemplateId.value = copy.id
  resetH5TemplateForm(copy)
  syncH5TemplatesToCenter()
  ElMessage.success('H5 模板已复制为草稿')
}
function deleteH5Template() {
  const target = h5TemplateStore.byId(selectedH5TemplateId.value)
  if (!target) return
  if (target.builtIn) {
    ElMessage.warning('系统内置 H5 模板不能删除，可复制后停用副本')
    return
  }
  if (!window.confirm(`确认删除「${target.name}」？`)) return
  h5TemplateStore.deleteTemplate(target.id)
  const next = h5TemplateStore.templates[0]
  selectedH5TemplateId.value = next?.id || ''
  resetH5TemplateForm(next)
  syncH5TemplatesToCenter()
  ElMessage.success('H5 模板已删除')
}

function reportTemplateCategoryLabel(value) {
  return reportTemplateCategories.find((item) => item.value === value)?.label || value || '课堂报告'
}

function rendererPresetLabel(value) {
  return reportRendererPresets.find((item) => item.value === value)?.label || value || '清爽课堂'
}

function reportTemplateStatusLabel(value) {
  return { published: '已发布', draft: '草稿', disabled: '已停用' }[value] || value
}

function reportTemplateParseStatusLabel(value) {
  return { none: '未解析', parsing: '解析中', parsed: '已解析', failed: '解析失败', manual: '手动调整' }[value] || '未解析'
}

function reportTemplateAuthorizationText(template) {
  if (template.visibility === 'public') return '全员可用'
  const groups = permissionGroupNameList(template.authorizedGroupIds)
  const classes = template.authorizedClasses || []
  return [...groups, ...classes].join('、') || '未选择授权对象'
}

function templateThemeStyle(template) {
  return {
    '--mini-bg': `#${template.theme?.bg || 'F7FBFA'}`,
    '--mini-primary': `#${template.theme?.primary || '1F9D8A'}`,
    '--mini-secondary': `#${template.theme?.secondary || '2563EB'}`,
    '--mini-soft': `#${template.theme?.soft || 'ECFDF5'}`,
  }
}

function uid(prefix = 'tpl') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, number))
}

function normalizeColorInput(value, fallback = '334155') {
  const hex = String(value || '').replace('#', '').toUpperCase()
  return /^[0-9A-F]{6}$/.test(hex) ? hex : fallback
}

function slotColorValue(value) {
  return `#${normalizeColorInput(value, '334155')}`
}

function templateElementTypeLabel(type) {
  return { title: '标题', subtitle: '副标题', body: '正文', image: '图片框', decor: '图案', footer: '页脚' }[type] || '元素'
}

function reportLayoutLabel(value) {
  return reportLayoutOptions.find((item) => item.value === value)?.label || value || '文本页'
}

function sampleTextForSlot(type, layout, pageTitle = '') {
  if (type === 'title') return pageTitle === '封面' ? '童趣课堂展示页' : pageTitle || '项目创作报告'
  if (type === 'subtitle') return '用户作品成长记录'
  if (type === 'body') return layout === 'timeline' ? '观察想法 / 草图尝试 / AI 迭代 / 成品表达' : '1. 课程目标与创作重点\n2. 用户观察与表达亮点\n3. 下一步练习建议'
  if (type === 'image') return '课程网格'
  if (type === 'footer') return reportTemplateForm.footerBrand || '美佳美画 AI 创意美术'
  return ''
}

function decorSvgData(kind = 'cloud') {
  const drawings = {
    logo: '<circle cx="80" cy="80" r="68" fill="#FBBF24"/><circle cx="80" cy="80" r="58" fill="none" stroke="#FFFFFF" stroke-opacity=".65" stroke-width="10"/><text x="80" y="94" text-anchor="middle" font-family="Arial" font-size="44" font-weight="900" fill="#FFFFFF">AI</text>',
    spark: '<path d="M80 8 98 62 152 80 98 98 80 152 62 98 8 80 62 62Z" fill="#FBBF24"/>',
    cloud: '<path d="M40 124c-21 0-34-13-34-31 0-17 12-29 29-31C41 36 60 20 84 20c31 0 51 23 53 50 13 4 21 14 21 27 0 16-12 27-30 27H40Z" fill="#BFDBFE"/>',
    mascot: '<path d="M49 57c0-30 17-47 31-47 18 0 33 17 33 47" fill="#7C2D12"/><circle cx="80" cy="65" r="41" fill="#FFD7BC"/><circle cx="64" cy="62" r="5" fill="#7C2D12"/><circle cx="96" cy="62" r="5" fill="#7C2D12"/><path d="M69 78c8 9 14 9 22 0" fill="none" stroke="#F97316" stroke-width="6" stroke-linecap="round"/><path d="M45 121c0-24 15-36 35-36s35 12 35 36v31H45v-31Z" fill="#60A5FA"/><path d="M56 147h48" stroke="#FBBF24" stroke-width="10" stroke-linecap="round"/>',
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">${drawings[kind] || drawings.cloud}</svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

function makeDecorSlot(kind, x, y, w, h, extra = {}) {
  const names = { logo: 'AI 标志', spark: '星点', cloud: '云朵', mascot: '人物图案' }
  return makeTemplateSlot('decor', x, y, w, h, {
    ...extra,
    decorKind: kind,
    decorName: extra.decorName || names[kind] || '装饰图案',
    imageSrc: extra.imageSrc || decorSvgData(kind),
  })
}

function defaultDecorSlotsForPage() {
  return [
    makeDecorSlot('logo', 0.077, 0.084, 0.055, 0.098),
    makeDecorSlot('spark', 0.38, 0.18, 0.024, 0.043),
    makeDecorSlot('spark', 0.83, 0.19, 0.022, 0.039),
    makeDecorSlot('cloud', 0.82, 0.105, 0.09, 0.12),
    makeDecorSlot('mascot', 0.105, 0.35, 0.15, 0.29),
  ]
}

function decorImageToSlot(decor = {}, index = 0) {
  const fallbackBoxes = {
    'top-right': { x: 0.76, y: 0.06, w: 0.18, h: 0.18 },
    'bottom-left': { x: 0.04, y: 0.73, w: 0.18, h: 0.18 },
    'bottom-right': { x: 0.78, y: 0.74, w: 0.18, h: 0.18 },
    'top-left': { x: 0.04, y: 0.06, w: 0.18, h: 0.18 },
  }
  const box = fallbackBoxes[decor.placement] || Object.values(fallbackBoxes)[index % 4]
  return makeDecorSlot(decor.kind || 'cloud', Number(decor.x ?? box.x), Number(decor.y ?? box.y), Number(decor.w ?? box.w), Number(decor.h ?? box.h), {
    id: decor.id,
    decorName: decor.name,
    imageSrc: decor.src,
    locked: decor.locked,
  })
}

function makeTemplateSlot(type, x, y, w, h, extra = {}) {
  return {
    id: extra.id || uid(type),
    type,
    x,
    y,
    w,
    h,
    source: 'admin-editor',
    sampleText: extra.sampleText || sampleTextForSlot(type, extra.layout, extra.pageTitle),
    fontFamily: extra.fontFamily || reportTemplateForm.fontFamily || 'Microsoft YaHei',
    fontSize: extra.fontSize || (type === 'title' ? 34 : type === 'subtitle' ? 18 : type === 'footer' ? 10 : 15),
    fontWeight: Number(extra.fontWeight || (type === 'title' ? 900 : type === 'footer' ? 500 : 400)),
    textAlign: extra.textAlign || (type === 'title' ? 'center' : 'left'),
    lineHeight: Number(extra.lineHeight || (type === 'title' ? 1.12 : 1.45)),
    italic: Boolean(extra.italic),
    underline: Boolean(extra.underline),
    maxLines: extra.maxLines || (type === 'title' ? 2 : type === 'footer' ? 1 : 5),
    color: extra.color || (type === 'title' ? reportTemplateForm.theme.title : reportTemplateForm.theme.text),
    fill: extra.fill || (type === 'image' ? reportTemplateForm.theme.soft : reportTemplateForm.theme.surface),
    radius: extra.radius ?? 0.04,
    locked: Boolean(extra.locked),
    decorKind: extra.decorKind || '',
    decorName: extra.decorName || '',
    imageSrc: extra.imageSrc || '',
    imageFileName: extra.imageFileName || '',
    imageFit: extra.imageFit || 'cover',
  }
}

function defaultSlotsForLayout(layout, pageTitle) {
  const base = { layout, pageTitle }
  const map = {
    'cover-hero': [
      makeTemplateSlot('title', 0.22, 0.11, 0.58, 0.14, { ...base, fontSize: 30 }),
      makeTemplateSlot('body', 0.43, 0.37, 0.32, 0.21, { ...base, maxLines: 3, fill: 'FDE68A', sampleText: '课程内容\n1. 了解主题与创作目标\n2. 观察颜色、构图和细节\n3. 完成作品并表达想法' }),
      makeTemplateSlot('body', 0.12, 0.66, 0.30, 0.19, { ...base, maxLines: 3, fill: 'BAE6FD', sampleText: '课程内容\n1. 记录课堂表现\n2. 提炼作品亮点\n3. 给出练习建议' }),
      makeTemplateSlot('image', 0.45, 0.66, 0.28, 0.19, { ...base, fill: 'BBF7D0', sampleText: '图片内容' }),
      makeTemplateSlot('image', 0.76, 0.32, 0.18, 0.32, { ...base, fill: 'FFFFFF' }),
      makeTemplateSlot('body', 0.76, 0.72, 0.18, 0.13, { ...base, maxLines: 2, fill: 'FDBA74', color: 'FFFFFF', sampleText: '鼓励评语\n持续表达，大胆创作' }),
    ],
    'text-focus': [
      makeTemplateSlot('title', 0.1, 0.12, 0.62, 0.1, { ...base, fontSize: 30 }),
      makeTemplateSlot('body', 0.12, 0.3, 0.64, 0.34, { ...base, maxLines: 5 }),
      makeTemplateSlot('image', 0.78, 0.3, 0.14, 0.3, base),
      makeTemplateSlot('footer', 0.1, 0.86, 0.62, 0.06, base),
    ],
    'before-after': [
      makeTemplateSlot('title', 0.08, 0.1, 0.5, 0.1, { ...base, fontSize: 28 }),
      makeTemplateSlot('image', 0.1, 0.3, 0.32, 0.38, base),
      makeTemplateSlot('image', 0.55, 0.3, 0.32, 0.38, base),
      makeTemplateSlot('body', 0.12, 0.72, 0.72, 0.1, { ...base, maxLines: 2 }),
    ],
    timeline: [
      makeTemplateSlot('title', 0.08, 0.1, 0.5, 0.1, { ...base, fontSize: 28 }),
      makeTemplateSlot('body', 0.1, 0.32, 0.18, 0.28, { ...base, maxLines: 4 }),
      makeTemplateSlot('body', 0.31, 0.32, 0.18, 0.28, { ...base, maxLines: 4 }),
      makeTemplateSlot('body', 0.52, 0.32, 0.18, 0.28, { ...base, maxLines: 4 }),
      makeTemplateSlot('body', 0.73, 0.32, 0.18, 0.28, { ...base, maxLines: 4 }),
    ],
    'image-text': [
      makeTemplateSlot('title', 0.58, 0.15, 0.32, 0.1, { ...base, fontSize: 28 }),
      makeTemplateSlot('image', 0.08, 0.17, 0.42, 0.54, base),
      makeTemplateSlot('body', 0.58, 0.32, 0.3, 0.28, { ...base, maxLines: 5 }),
    ],
    'review-card': [
      makeTemplateSlot('title', 0.1, 0.12, 0.48, 0.1, { ...base, fontSize: 28 }),
      makeTemplateSlot('body', 0.12, 0.32, 0.68, 0.34, { ...base, maxLines: 5 }),
      makeTemplateSlot('footer', 0.12, 0.78, 0.52, 0.06, base),
    ],
    comment: [
      makeTemplateSlot('title', 0.1, 0.13, 0.48, 0.1, { ...base, fontSize: 28 }),
      makeTemplateSlot('body', 0.15, 0.32, 0.65, 0.32, { ...base, maxLines: 5 }),
      makeTemplateSlot('footer', 0.18, 0.74, 0.46, 0.06, base),
    ],
    'back-cover': [
      makeTemplateSlot('title', 0.24, 0.25, 0.52, 0.12, { ...base, fontSize: 34 }),
      makeTemplateSlot('body', 0.25, 0.44, 0.5, 0.15, { ...base, maxLines: 3 }),
      makeTemplateSlot('footer', 0.25, 0.7, 0.5, 0.06, base),
    ],
  }
  return (map[layout] || map['text-focus']).map((slot) => ({ ...slot }))
}

function makeTemplatePage(blueprint, index = 0) {
  const layout = blueprint.layout || 'text-focus'
  const title = blueprint.title || `报告页面 ${index + 1}`
  return {
    id: blueprint.id || uid('template-page'),
    sourceIndex: index + 1,
    title,
    role: blueprint.role || 'content',
    layout,
    backgroundImage: blueprint.backgroundImage || '',
    backgroundLocked: Boolean(blueprint.backgroundLocked),
    backgroundFit: blueprint.backgroundFit || 'cover',
    decorImages: [],
    decorInitialized: true,
    slotProfile: 'editor',
    slots: [...defaultDecorSlotsForPage(index), ...defaultSlotsForLayout(layout, title)],
    textRunCount: 0,
    imageCount: 0,
    shapeCount: 0,
  }
}

function normalizeTemplateEditorSlot(slot = {}, index = 0, layout = 'text-focus', pageTitle = '') {
  const type = ['title', 'subtitle', 'body', 'footer', 'image', 'decor'].includes(slot.type) ? slot.type : 'body'
  const w = clampNumber(slot.w, 0.02, 0.94, type === 'decor' ? 0.12 : type === 'image' ? 0.28 : 0.4)
  const h = clampNumber(slot.h, 0.02, 0.86, type === 'decor' ? 0.16 : type === 'image' ? 0.32 : 0.12)
  return {
    ...makeTemplateSlot(type, 0.08, 0.12 + index * 0.1, w, h, { layout, pageTitle }),
    ...slot,
    id: slot.id || uid(type),
    x: clampNumber(slot.x, 0, 0.98 - w, 0.08),
    y: clampNumber(slot.y, 0, 0.96 - h, 0.12 + index * 0.1),
    w,
    h,
    fontFamily: templateFontOptions.includes(slot.fontFamily) ? slot.fontFamily : reportTemplateForm.fontFamily || 'Microsoft YaHei',
    fontSize: clampNumber(slot.fontSize, 8, 72, type === 'title' ? 34 : 15),
    fontWeight: clampNumber(slot.fontWeight, 400, 900, type === 'title' ? 900 : 400),
    textAlign: ['left', 'center', 'right'].includes(slot.textAlign) ? slot.textAlign : type === 'title' ? 'center' : 'left',
    lineHeight: clampNumber(slot.lineHeight, 0.8, 3, type === 'title' ? 1.12 : 1.45),
    italic: Boolean(slot.italic),
    underline: Boolean(slot.underline),
    maxLines: clampNumber(slot.maxLines, 1, 12, type === 'title' ? 2 : 5),
    color: normalizeColorInput(slot.color, type === 'title' ? reportTemplateForm.theme.title : reportTemplateForm.theme.text),
    fill: normalizeColorInput(slot.fill, type === 'image' ? reportTemplateForm.theme.soft : reportTemplateForm.theme.surface),
    locked: Boolean(slot.locked),
    decorKind: slot.decorKind || slot.kind || '',
    decorName: slot.decorName || slot.name || '',
    imageSrc: slot.imageSrc || slot.src || '',
    imageFit: ['cover', 'contain', 'fill'].includes(slot.imageFit) ? slot.imageFit : type === 'decor' ? 'contain' : 'cover',
  }
}

function normalizeTemplateEditorPages(pages = []) {
  const source = Array.isArray(pages) && pages.length ? pages : templateEditorPageBlueprints.map(makeTemplatePage)
  return source.map((page, index) => {
    const layout = page.layout || templateEditorPageBlueprints[index]?.layout || 'text-focus'
    const title = page.title || templateEditorPageBlueprints[index]?.title || `报告页面 ${index + 1}`
    const pageSlots = Array.isArray(page.slots) && page.slots.length ? page.slots : defaultSlotsForLayout(layout, title)
    const savedDecorSlots = (Array.isArray(page.decorImages) ? page.decorImages : []).map(decorImageToSlot)
    const hasInlineDecor = pageSlots.some((slot) => slot?.type === 'decor')
    const decorSlots = hasInlineDecor
      ? []
      : savedDecorSlots.length
        ? savedDecorSlots
        : page.decorInitialized
          ? []
          : defaultDecorSlotsForPage(index)
    return {
      ...makeTemplatePage({ ...page, title, layout }, index),
      ...page,
      id: page.id || uid('template-page'),
      sourceIndex: index + 1,
      title,
      role: page.role || templateEditorPageBlueprints[index]?.role || 'content',
      layout,
      decorInitialized: true,
      slots: [...decorSlots, ...pageSlots]
        .map((slot, slotIndex) => normalizeTemplateEditorSlot(slot, slotIndex, layout, title)),
    }
  })
}

function ensureTemplateEditorPages() {
  if (!Array.isArray(reportTemplateForm.templatePages) || !reportTemplateForm.templatePages.length) {
    reportTemplateForm.templatePages = normalizeTemplateEditorPages()
  }
  if (templateEditorPageIndex.value >= reportTemplateForm.templatePages.length) templateEditorPageIndex.value = 0
}

function selectTemplateEditorPage(index) {
  clearTemplateSelection()
  ensureTemplateEditorPages()
  templateEditorPageIndex.value = Math.max(0, Math.min(reportTemplateForm.templatePages.length - 1, index))
}

function selectTemplateElement(id) {
  selectedTemplateElementId.value = id
  selectedTemplateLayer.value = 'element'
}

function selectTemplateBackground() {
  stopTemplateSlotDragging()
  stopTemplateSlotResizing()
  selectedTemplateElementId.value = ''
  selectedTemplateLayer.value = 'background'
}

function handleTemplateCanvasSurfaceClick(event) {
  if (event.target?.closest?.('.ppt-canvas-slot, .ppt-slot-quickbar, .ppt-background-badge')) return
  clearTemplateSelection()
}

function normalizeSelectedTemplateElement() {
  if (!selectedTemplateElement.value) return
  const normalized = normalizeTemplateEditorSlot(selectedTemplateElement.value, 0, currentTemplateEditorPage.value.layout, currentTemplateEditorPage.value.title)
  Object.assign(selectedTemplateElement.value, normalized)
}

function addTemplateElement(type = 'body') {
  ensureTemplateEditorPages()
  const slots = currentTemplateEditorPage.value.slots || []
  const slot = makeTemplateSlot(type, 0.16 + (slots.length % 3) * 0.08, 0.18 + (slots.length % 4) * 0.08, type === 'image' ? 0.28 : 0.36, type === 'image' ? 0.28 : 0.12, {
    layout: currentTemplateEditorPage.value.layout,
    pageTitle: currentTemplateEditorPage.value.title,
  })
  currentTemplateEditorPage.value.slots.push(slot)
  selectTemplateElement(slot.id)
}

function openTemplateDecorImagePicker(replaceSelected = false) {
  templateDecorUploadTargetId.value = replaceSelected && selectedTemplateElement.value?.type === 'decor'
    ? selectedTemplateElement.value.id
    : ''
  templateDecorImageInput.value?.click()
}

async function handleTemplateDecorImageUpload(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if (!validateTemplateImageFile(file)) {
    ElMessage.warning('请上传不超过5MB的 PNG、JPG 或 WEBP 图片')
    event.target.value = ''
    templateDecorUploadTargetId.value = ''
    return
  }
  const targetPage = currentTemplateEditorPage.value
  const replaceTarget = targetPage.slots?.find((slot) => slot.id === templateDecorUploadTargetId.value && slot.type === 'decor')
  if (replaceTarget?.locked) {
    ElMessage.warning('图案已锁定，请先解锁')
    event.target.value = ''
    templateDecorUploadTargetId.value = ''
    return
  }
  try {
    const imageResult = await compressTemplateDecorImage(file)
    let slot = replaceTarget
    if (!slot) {
      const canvasRatio = 16 / 9
      const imageRatio = imageResult.aspectRatio || 1
      const slotWidth = 0.18
      const slotHeight = clampNumber((slotWidth * canvasRatio) / imageRatio, 0.08, 0.36, 0.18)
      slot = makeDecorSlot('custom', 0.41, 0.32, slotWidth, slotHeight, {
        decorName: file.name,
        imageSrc: imageResult.src,
        imageFileName: file.name,
        imageFit: 'contain',
      })
      targetPage.slots.push(slot)
    } else {
      slot.decorKind = 'custom'
      slot.decorName = file.name
      slot.imageSrc = imageResult.src
      slot.imageFileName = file.name
      slot.imageFit = 'contain'
    }
    slot.imageAspectRatio = imageResult.aspectRatio
    slot.imageUpdatedAt = new Date().toISOString()
    selectTemplateElement(slot.id)
    ElMessage.success(replaceTarget ? '图案图片已更换' : '图案图片已加入画布')
  } catch (error) {
    ElMessage.error(error.message || '图案图片读取失败')
  } finally {
    event.target.value = ''
    templateDecorUploadTargetId.value = ''
  }
}

function removeSelectedTemplateElement() {
  if (!selectedTemplateElementId.value) return
  currentTemplateEditorPage.value.slots = currentTemplateEditorPage.value.slots.filter((slot) => slot.id !== selectedTemplateElementId.value)
  clearTemplateSelection()
}

function removeSelectedTemplateLayer() {
  if (selectedTemplateLayer.value === 'background') {
    clearCurrentPageBackground()
    return
  }
  removeSelectedTemplateElement()
}

function selectedTemplateElementIndex() {
  return currentTemplateEditorPage.value?.slots?.findIndex((slot) => slot.id === selectedTemplateElementId.value) ?? -1
}

function duplicateSelectedTemplateElement() {
  const index = selectedTemplateElementIndex()
  if (index < 0) return
  const source = currentTemplateEditorPage.value.slots[index]
  const copy = {
    ...JSON.parse(JSON.stringify(source)),
    id: uid(source.type),
    x: Number(clampNumber(Number(source.x || 0) + 0.025, 0, 0.98 - Number(source.w || 0.1), source.x).toFixed(4)),
    y: Number(clampNumber(Number(source.y || 0) + 0.025, 0, 0.96 - Number(source.h || 0.1), source.y).toFixed(4)),
    locked: false,
  }
  currentTemplateEditorPage.value.slots.splice(index + 1, 0, copy)
  selectedTemplateElementId.value = copy.id
}

function moveSelectedTemplateElementToIndex(targetIndex) {
  const slots = currentTemplateEditorPage.value?.slots || []
  const index = selectedTemplateElementIndex()
  if (index < 0 || targetIndex < 0 || targetIndex >= slots.length || targetIndex === index) return
  const [slot] = slots.splice(index, 1)
  slots.splice(targetIndex, 0, slot)
}

function bringSelectedTemplateElementForward() {
  const index = selectedTemplateElementIndex()
  moveSelectedTemplateElementToIndex(index + 1)
}

function sendSelectedTemplateElementBackward() {
  const index = selectedTemplateElementIndex()
  moveSelectedTemplateElementToIndex(index - 1)
}

function bringSelectedTemplateElementToFront() {
  const slots = currentTemplateEditorPage.value?.slots || []
  moveSelectedTemplateElementToIndex(slots.length - 1)
}

function sendSelectedTemplateElementToBack() {
  moveSelectedTemplateElementToIndex(0)
}

function toggleSelectedTemplateElementLock() {
  if (!selectedTemplateElement.value) return
  selectedTemplateElement.value.locked = !selectedTemplateElement.value.locked
}

function toggleTemplateTextBold() {
  if (!isSelectedTemplateTextElement.value) return
  selectedTemplateElement.value.fontWeight = Number(selectedTemplateElement.value.fontWeight || 400) >= 700 ? 400 : 700
}

function updateSelectedTemplateDecorKind() {
  if (selectedTemplateElement.value?.type !== 'decor') return
  const kind = selectedTemplateElement.value.decorKind || 'cloud'
  const names = { logo: 'AI 标志', spark: '星点', cloud: '云朵', mascot: '人物图案' }
  selectedTemplateElement.value.decorName = names[kind] || '装饰图案'
  selectedTemplateElement.value.imageSrc = decorSvgData(kind)
}

function handleSelectedTemplateElementTypeChange() {
  const slot = selectedTemplateElement.value
  if (!slot) return
  if (slot.type === 'decor') {
    slot.decorKind = slot.decorKind || 'cloud'
    updateSelectedTemplateDecorKind()
  }
  if (['title', 'subtitle', 'body', 'footer'].includes(slot.type)) {
    slot.sampleText = slot.sampleText || sampleTextForSlot(slot.type, currentTemplateEditorPage.value.layout, currentTemplateEditorPage.value.title)
    slot.fontFamily = slot.fontFamily || reportTemplateForm.fontFamily || 'Microsoft YaHei'
  }
  normalizeSelectedTemplateElement()
}

function addTemplatePage() {
  ensureTemplateEditorPages()
  const page = makeTemplatePage({ title: `自定义页面 ${reportTemplateForm.templatePages.length + 1}`, layout: 'text-focus', role: 'content' }, reportTemplateForm.templatePages.length)
  reportTemplateForm.templatePages.push(page)
  selectTemplateEditorPage(reportTemplateForm.templatePages.length - 1)
}

function duplicateTemplatePage() {
  ensureTemplateEditorPages()
  const source = currentTemplateEditorPage.value
  const copy = JSON.parse(JSON.stringify(source))
  copy.id = uid('template-page')
  copy.title = `${source.title} 副本`
  copy.slots = copy.slots.map((slot) => ({ ...slot, id: uid(slot.type) }))
  reportTemplateForm.templatePages.splice(templateEditorPageIndex.value + 1, 0, copy)
  selectTemplateEditorPage(templateEditorPageIndex.value + 1)
}

function resetTemplateEditorPages() {
  reportTemplateForm.templatePages = normalizeTemplateEditorPages()
  selectTemplateEditorPage(0)
  ElMessage.success('已恢复 8 页固定模板版式')
}

function templateEditorSlotStyle(slot, index = 0) {
  return {
    left: `${slot.x * 100}%`,
    top: `${slot.y * 100}%`,
    width: `${slot.w * 100}%`,
    height: `${slot.h * 100}%`,
    color: `#${slot.color || reportTemplateForm.theme.text}`,
    background: ['title', 'decor'].includes(slot.type) ? 'transparent' : `#${slot.fill || reportTemplateForm.theme.surface}`,
    fontFamily: `${slot.fontFamily || reportTemplateForm.fontFamily || 'Microsoft YaHei'}, sans-serif`,
    fontSize: `${slot.fontSize || 15}px`,
    fontWeight: Number(slot.fontWeight || 400),
    fontStyle: slot.italic ? 'italic' : 'normal',
    textDecoration: slot.underline ? 'underline' : 'none',
    textAlign: slot.textAlign || 'left',
    lineHeight: Number(slot.lineHeight || 1.45),
    WebkitLineClamp: slot.maxLines || 4,
    // 元素层级由 slots 数组顺序决定。选中态只能提高边框和工具栏的可见性，
    // 不能提高元素本身的 z-index，否则“上一层/下一层”交换后视觉顺序不会变化。
    zIndex: 4 + index,
  }
}

function templateEditorThumbStyle(page) {
  return {
    background: page.backgroundImage || reportTemplateForm.backgroundImage
      ? `url("${page.backgroundImage || reportTemplateForm.backgroundImage}") center/cover`
      : `linear-gradient(135deg, #${reportTemplateForm.theme.bg}, #${reportTemplateForm.theme.soft})`,
  }
}

function templateEditorThumbSlotStyle(slot) {
  return {
    left: `${slot.x * 100}%`,
    top: `${slot.y * 100}%`,
    width: `${slot.w * 100}%`,
    height: `${slot.h * 100}%`,
    background: slot.type === 'decor' ? '#FBBF24' : undefined,
  }
}

function templateCanvasPointFromEvent(event) {
  const canvas = templateEditorCanvasRef.value
  if (!canvas) return { x: 0.5, y: 0.5 }
  const rect = canvas.getBoundingClientRect()
  return {
    x: clampNumber((event.clientX - rect.left) / rect.width, 0, 1, 0.5),
    y: clampNumber((event.clientY - rect.top) / rect.height, 0, 1, 0.5),
  }
}

function stopTemplateSlotDragging() {
  window.removeEventListener('pointermove', handleTemplateSlotPointerMove)
  window.removeEventListener('pointerup', handleTemplateSlotPointerUp)
  templateElementDragState.slotId = ''
  templateElementDragState.moved = false
  document.body.classList.remove('template-slot-dragging')
}

function handleTemplateSlotPointerDown(slot, event) {
  if (event.button !== 0) return
  selectTemplateElement(slot.id)
  if (slot.locked) return
  templateElementDragState.slotId = slot.id
  templateElementDragState.startClientX = event.clientX
  templateElementDragState.startClientY = event.clientY
  templateElementDragState.startX = Number(slot.x || 0)
  templateElementDragState.startY = Number(slot.y || 0)
  templateElementDragState.moved = false
  document.body.classList.add('template-slot-dragging')
  event.currentTarget?.setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', handleTemplateSlotPointerMove)
  window.addEventListener('pointerup', handleTemplateSlotPointerUp)
  event.preventDefault()
}

function stopTemplateSlotResizing() {
  window.removeEventListener('pointermove', handleTemplateSlotResizePointerMove)
  window.removeEventListener('pointerup', handleTemplateSlotResizePointerUp)
  templateElementResizeState.slotId = ''
  templateElementResizeState.handle = ''
  document.body.classList.remove('template-slot-resizing')
}

function handleTemplateSlotResizePointerDown(slot, handle, event) {
  if (event.button !== 0 || slot.locked) return
  selectTemplateElement(slot.id)
  templateElementResizeState.slotId = slot.id
  templateElementResizeState.handle = handle
  templateElementResizeState.startClientX = event.clientX
  templateElementResizeState.startClientY = event.clientY
  templateElementResizeState.startX = Number(slot.x || 0)
  templateElementResizeState.startY = Number(slot.y || 0)
  templateElementResizeState.startW = Number(slot.w || 0.1)
  templateElementResizeState.startH = Number(slot.h || 0.1)
  document.body.classList.add('template-slot-resizing')
  event.currentTarget?.setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', handleTemplateSlotResizePointerMove)
  window.addEventListener('pointerup', handleTemplateSlotResizePointerUp)
  event.preventDefault()
}

function handleTemplateSlotResizePointerMove(event) {
  if (!templateElementResizeState.slotId) return
  const slot = currentTemplateEditorPage.value?.slots?.find((item) => item.id === templateElementResizeState.slotId)
  const canvas = templateEditorCanvasRef.value
  if (!slot || !canvas || slot.locked) return
  const rect = canvas.getBoundingClientRect()
  const dx = (event.clientX - templateElementResizeState.startClientX) / rect.width
  const dy = (event.clientY - templateElementResizeState.startClientY) / rect.height
  const handle = templateElementResizeState.handle
  let x = templateElementResizeState.startX
  let y = templateElementResizeState.startY
  let w = templateElementResizeState.startW
  let h = templateElementResizeState.startH
  if (handle.includes('e')) w = templateElementResizeState.startW + dx
  if (handle.includes('s')) h = templateElementResizeState.startH + dy
  if (handle.includes('w')) {
    x = templateElementResizeState.startX + dx
    w = templateElementResizeState.startW - dx
  }
  if (handle.includes('n')) {
    y = templateElementResizeState.startY + dy
    h = templateElementResizeState.startH - dy
  }
  const minW = slot.type === 'image' ? 0.06 : 0.08
  const minH = slot.type === 'image' ? 0.06 : 0.04
  if (handle.includes('w')) {
    x = clampNumber(x, 0, templateElementResizeState.startX + templateElementResizeState.startW - minW, slot.x)
    w = templateElementResizeState.startX + templateElementResizeState.startW - x
  }
  if (handle.includes('n')) {
    y = clampNumber(y, 0, templateElementResizeState.startY + templateElementResizeState.startH - minH, slot.y)
    h = templateElementResizeState.startY + templateElementResizeState.startH - y
  }
  w = clampNumber(w, minW, 0.98 - x, slot.w)
  h = clampNumber(h, minH, 0.96 - y, slot.h)
  slot.x = Number(x.toFixed(4))
  slot.y = Number(y.toFixed(4))
  slot.w = Number(w.toFixed(4))
  slot.h = Number(h.toFixed(4))
  event.preventDefault()
}

function handleTemplateSlotResizePointerUp(event) {
  if (templateElementResizeState.slotId) event.preventDefault()
  stopTemplateSlotResizing()
}

function handleTemplateSlotPointerMove(event) {
  if (!templateElementDragState.slotId) return
  const slot = currentTemplateEditorPage.value?.slots?.find((item) => item.id === templateElementDragState.slotId)
  const canvas = templateEditorCanvasRef.value
  if (!slot || !canvas) return
  const rect = canvas.getBoundingClientRect()
  const dx = (event.clientX - templateElementDragState.startClientX) / rect.width
  const dy = (event.clientY - templateElementDragState.startClientY) / rect.height
  if (Math.abs(dx) > 0.002 || Math.abs(dy) > 0.002) templateElementDragState.moved = true
  slot.x = Number(clampNumber(templateElementDragState.startX + dx, 0, 0.98 - Number(slot.w || 0.1), slot.x).toFixed(4))
  slot.y = Number(clampNumber(templateElementDragState.startY + dy, 0, 0.96 - Number(slot.h || 0.1), slot.y).toFixed(4))
  event.preventDefault()
}

function handleTemplateSlotPointerUp(event) {
  if (templateElementDragState.slotId) event.preventDefault()
  stopTemplateSlotDragging()
}

async function handleTemplateEditorPageBackground(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const targetPage = currentTemplateEditorPage.value
  if (targetPage.backgroundLocked) {
    ElMessage.warning('背景已锁定，请先解锁')
    event.target.value = ''
    return
  }
  if (!validateTemplateImageFile(file)) {
    ElMessage.warning('请上传不超过5MB的 PNG、JPG 或 WEBP 图片')
    event.target.value = ''
    return
  }
  try {
    targetPage.backgroundImage = await compressTemplatePreview(file)
    selectedTemplateLayer.value = 'background'
    selectedTemplateElementId.value = ''
    ElMessage.success('当前页背景已载入')
  } catch (error) {
    ElMessage.error(error.message || '当前页背景读取失败')
  } finally {
    event.target.value = ''
  }
}

function clearCurrentPageBackground() {
  if (!currentTemplateEditorPage.value?.backgroundImage) return
  if (currentTemplateEditorPage.value.backgroundLocked) {
    ElMessage.warning('背景已锁定，请先解锁')
    return
  }
  currentTemplateEditorPage.value.backgroundImage = ''
  clearTemplateSelection()
}

function toggleCurrentPageBackgroundLock() {
  currentTemplateEditorPage.value.backgroundLocked = !currentTemplateEditorPage.value.backgroundLocked
}

function handleTemplateBackgroundDragEnter(event) {
  const hasImage = Array.from(event.dataTransfer?.items || []).some((item) => item.type?.startsWith('image/'))
  if (hasImage) templateBackgroundDragActive.value = true
}

function handleTemplateBackgroundDragOver(event) {
  const hasImage = Array.from(event.dataTransfer?.items || []).some((item) => item.type?.startsWith('image/'))
  if (hasImage) event.dataTransfer.dropEffect = currentTemplateEditorPage.value.backgroundLocked ? 'none' : 'copy'
}

function handleTemplateBackgroundDragLeave(event) {
  if (event.currentTarget?.contains?.(event.relatedTarget)) return
  templateBackgroundDragActive.value = false
}

async function handleTemplateBackgroundDrop(event) {
  templateBackgroundDragActive.value = false
  const targetPage = currentTemplateEditorPage.value
  if (targetPage.backgroundLocked) {
    ElMessage.warning('背景已锁定，请先解锁')
    return
  }
  const file = Array.from(event.dataTransfer?.files || []).find((item) => item.type?.startsWith('image/'))
  if (!file) return
  if (!validateTemplateImageFile(file)) {
    ElMessage.warning('请上传不超过5MB的 PNG、JPG 或 WEBP 图片')
    return
  }
  try {
    targetPage.backgroundImage = await compressTemplatePreview(file)
    targetPage.backgroundFit = targetPage.backgroundFit || 'cover'
    selectedTemplateLayer.value = 'background'
    selectedTemplateElementId.value = ''
    ElMessage.success('当前页背景已载入')
  } catch (error) {
    ElMessage.error(error.message || '当前页背景读取失败')
  }
}

async function applyTemplateSlotImage(slot, file) {
  if (!slot || slot.type !== 'image') {
    ElMessage.warning('请先选择一个图片框')
    return false
  }
  if (slot.locked) {
    ElMessage.warning('图片框已锁定，请先解锁')
    return false
  }
  if (!validateTemplateImageFile(file)) {
    ElMessage.warning('请上传不超过5MB的 PNG、JPG 或 WEBP 图片')
    return false
  }
  try {
    const imageResult = await compressTemplateSlotImage(file)
    slot.imageSrc = imageResult.src
    slot.imageAspectRatio = imageResult.aspectRatio
    slot.imageFileName = file.name
    slot.imageUpdatedAt = new Date().toISOString()
    if (!slot.sampleText || slot.sampleText === '课程网格') slot.sampleText = '已上传图片'
    selectTemplateElement(slot.id)
    ElMessage.success('图片已载入当前图片框')
    return true
  } catch (error) {
    ElMessage.error(error.message || '图片读取失败')
    return false
  }
}

async function handleSelectedTemplateSlotImage(event) {
  const file = event.target.files?.[0]
  if (!file) return
  await applyTemplateSlotImage(selectedTemplateElement.value, file)
  event.target.value = ''
}

function handleTemplateSlotDragEnter(slot) {
  if (slot?.type === 'image' && !slot.locked) templateSlotDragTargetId.value = slot.id
}

function handleTemplateSlotDragLeave(slot) {
  if (templateSlotDragTargetId.value === slot?.id) templateSlotDragTargetId.value = ''
}

async function handleTemplateSlotImageDrop(slot, event) {
  templateSlotDragTargetId.value = ''
  templateCanvasImageDragActive.value = false
  if (slot?.type !== 'image') return
  const file = Array.from(event.dataTransfer?.files || []).find((item) => item.type?.startsWith('image/'))
  if (!file) {
    ElMessage.warning('请拖入 PNG、JPG 或 WEBP 图片文件')
    return
  }
  await applyTemplateSlotImage(slot, file)
}

function handleTemplateCanvasImageDragEnter(event) {
  const hasImage = Array.from(event.dataTransfer?.items || []).some((item) => item.type?.startsWith('image/'))
  if (hasImage) templateCanvasImageDragActive.value = true
}

function handleTemplateCanvasImageDragOver(event) {
  const hasImage = Array.from(event.dataTransfer?.items || []).some((item) => item.type?.startsWith('image/'))
  if (hasImage) {
    templateCanvasImageDragActive.value = true
    event.dataTransfer.dropEffect = 'copy'
  }
}

function handleTemplateCanvasImageDragLeave(event) {
  if (event.currentTarget?.contains?.(event.relatedTarget)) return
  templateCanvasImageDragActive.value = false
}

async function handleTemplateCanvasImageDrop(event) {
  templateCanvasImageDragActive.value = false
  const file = Array.from(event.dataTransfer?.files || []).find((item) => item.type?.startsWith('image/'))
  if (!file) return
  if (!validateTemplateImageFile(file)) {
    ElMessage.warning('请拖入不超过5MB的 PNG、JPG 或 WEBP 图片')
    return
  }
  const targetPage = currentTemplateEditorPage.value
  const point = templateCanvasPointFromEvent(event)
  try {
    const imageResult = await compressTemplateSlotImage(file)
    const canvasRatio = 16 / 9
    const imageRatio = imageResult.aspectRatio || 1.33
    const slotWidth = 0.28
    const slotHeight = clampNumber((slotWidth * canvasRatio) / imageRatio, 0.12, 0.46, 0.24)
    const slot = makeTemplateSlot('image', 0, 0, slotWidth, slotHeight, {
      layout: targetPage.layout,
      pageTitle: targetPage.title,
      fill: 'FFFFFF',
      sampleText: '上传图片',
    })
    slot.x = Number(clampNumber(point.x - slot.w / 2, 0, 0.98 - slot.w, 0.36).toFixed(4))
    slot.y = Number(clampNumber(point.y - slot.h / 2, 0, 0.96 - slot.h, 0.36).toFixed(4))
    slot.imageSrc = imageResult.src
    slot.imageAspectRatio = imageResult.aspectRatio
    slot.imageFileName = file.name
    slot.imageUpdatedAt = new Date().toISOString()
    targetPage.slots.push(slot)
    selectTemplateElement(slot.id)
    ElMessage.success('图片已按比例加入画布')
  } catch (error) {
    ElMessage.error(error.message || '图片读取失败')
  }
}

function clearSelectedTemplateSlotImage() {
  if (!selectedTemplateElement.value || selectedTemplateElement.value.type !== 'image') return
  selectedTemplateElement.value.imageSrc = ''
  selectedTemplateElement.value.imageFileName = ''
  selectedTemplateElement.value.imageUpdatedAt = ''
}

function applyReportTemplateForm(template = reportTemplateStore.byId('classroom')) {
  const source = template || reportTemplateStore.templates[0]
  if (!source) return
  reportTemplateForm.id = template?.id || ''
  reportTemplateForm.name = template?.name || ''
  reportTemplateForm.description = template?.description || ''
  reportTemplateForm.category = source.category || 'classroom'
  reportTemplateForm.rendererPreset = source.rendererPreset || 'classroom'
  reportTemplateForm.status = template?.status || 'draft'
  reportTemplateForm.previewImage = template?.previewImage || ''
  reportTemplateForm.backgroundImage = template?.backgroundImage || ''
  reportTemplateForm.decorImages = [...(template?.decorImages || [])]
  reportTemplateForm.templatePages = [...(template?.templatePages || [])]
  reportTemplateForm.assetMode = template?.assetMode || 'structured-assets'
  reportTemplateForm.sourceFileName = template?.sourceFileName || ''
  reportTemplateForm.sourceFileSize = template?.sourceFileSize || 0
  reportTemplateForm.sourceUpdatedAt = template?.sourceUpdatedAt || ''
  reportTemplateForm.parseStatus = template?.parseStatus || 'none'
  reportTemplateForm.parseMessage = template?.parseMessage || ''
  reportTemplateForm.importMeta = template?.importMeta || null
  reportTemplateForm.fontFamily = source.fontFamily || 'Microsoft YaHei'
  reportTemplateForm.footerBrand = source.footerBrand || '美佳美画 AI 创意美术'
  reportTemplateForm.styleTagsText = (source.styleTags || []).join('、')
  reportTemplateForm.suitableCoursesText = (source.suitableCourses || []).join('、')
  reportTemplateForm.suitableAgeRangesText = (source.suitableAgeRanges || []).join('、')
  reportTemplateForm.suitablePages = [...(source.suitablePages || [])]
  reportTemplateForm.textDensity = source.textDensity || 'medium'
  reportTemplateForm.imageCapacity = Number(source.imageCapacity ?? 1)
  reportTemplateForm.overflowPolicy = source.overflowPolicy || 'shrink-then-split'
  reportTemplateForm.preferredLayouts = [...(source.preferredLayouts || [])]
  reportTemplateForm.matchingKeywordsText = (source.matchingKeywords || []).join('、')
  Object.assign(reportTemplateForm.theme, source.theme || {})
  reportTemplateForm.enabledLayouts = [...(source.enabledLayouts || reportLayoutOptions.map((item) => item.value))]
  reportTemplateForm.visibility = template?.visibility || 'public'
  reportTemplateForm.authorizedGroupIds = [...(template?.authorizedGroupIds || [])]
  reportTemplateForm.authorizedClasses = [...(template?.authorizedClasses || [])]
  pendingTemplateSourceFile.value = null
  reportTemplateForm.templatePages = normalizeTemplateEditorPages(reportTemplateForm.templatePages)
  selectTemplateEditorPage(0)
}

function startNewReportTemplate() {
  selectedReportTemplateIds.value = []
  applyReportTemplateForm()
  reportTemplateForm.id = ''
  reportTemplateForm.name = ''
  reportTemplateForm.description = ''
  reportTemplateForm.status = 'draft'
  reportTemplateForm.previewImage = ''
  reportTemplateForm.backgroundImage = ''
  reportTemplateForm.decorImages = []
  reportTemplateForm.templatePages = []
  reportTemplateForm.assetMode = 'structured-assets'
  reportTemplateForm.sourceFileName = ''
  reportTemplateForm.sourceFileSize = 0
  reportTemplateForm.sourceUpdatedAt = ''
  reportTemplateForm.parseStatus = 'none'
  reportTemplateForm.parseMessage = ''
  reportTemplateForm.importMeta = null
  reportTemplateForm.styleTagsText = ''
  reportTemplateForm.suitableCoursesText = ''
  reportTemplateForm.suitableAgeRangesText = ''
  reportTemplateForm.suitablePages = []
  reportTemplateForm.textDensity = 'medium'
  reportTemplateForm.imageCapacity = 1
  reportTemplateForm.overflowPolicy = 'shrink-then-split'
  reportTemplateForm.preferredLayouts = []
  reportTemplateForm.matchingKeywordsText = ''
  templatePanel.value = 'edit'
}

function editReportTemplate(template) {
  selectedReportTemplateIds.value = []
  selectedTemplateId.value = template.id
  applyReportTemplateForm(template)
  templatePanel.value = 'edit'
}

function openReportTemplateAuthorization() {
  selectedReportTemplateIds.value = []
  if (!selectedTemplateId.value && reportTemplateStore.templates.length) selectedTemplateId.value = reportTemplateStore.templates[0].id
  loadSelectedTemplateAuthorization()
  templatePanel.value = 'auth'
}

function openBatchReportTemplateAuthorization() {
  if (!selectedReportTemplateIds.value.length) {
    ElMessage.warning('请先选择要授权的PPT模板')
    return
  }
  const firstTemplate = reportTemplateStore.byId(selectedReportTemplateIds.value[0])
  if (firstTemplate) {
    selectedTemplateId.value = firstTemplate.id
    applyReportTemplateForm(firstTemplate)
  }
  templatePanel.value = 'auth'
}

function selectReportTemplateAuthorization(template) {
  selectedReportTemplateIds.value = []
  selectedTemplateId.value = template.id
  applyReportTemplateForm(template)
  templatePanel.value = 'auth'
}

function loadSelectedTemplateAuthorization() {
  const template = selectedReportTemplate.value
  if (template) applyReportTemplateForm(template)
}

function setTemplateThemeColor(key, value) {
  reportTemplateForm.theme[key] = String(value || '').replace('#', '').toUpperCase()
}

function applyReportStyleBlueprint(style) {
  if (!style) return
  if (!reportTemplateForm.name.trim() || reportTemplateForm.name === '新的PPT风格模板') reportTemplateForm.name = style.name
  reportTemplateForm.description = style.desc
  reportTemplateForm.category = style.category
  reportTemplateForm.rendererPreset = style.rendererPreset
  reportTemplateForm.textDensity = style.textDensity
  reportTemplateForm.imageCapacity = style.imageCapacity
  reportTemplateForm.enabledLayouts = [...style.layouts]
  reportTemplateForm.preferredLayouts = [...style.layouts]
  reportTemplateForm.styleTagsText = style.tags
  reportTemplateForm.matchingKeywordsText = style.keywords
  Object.assign(reportTemplateForm.theme, style.theme)
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('预览图读取失败'))
      image.src = reader.result
    }
    reader.onerror = () => reject(new Error('预览图读取失败'))
    reader.readAsDataURL(file)
  })
}

async function compressTemplatePreview(file) {
  const image = await loadImageFile(file)
  const canvas = document.createElement('canvas')
  canvas.width = 960
  canvas.height = 540
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器无法处理该背景图')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
  return canvas.toDataURL('image/jpeg', 0.76)
}

async function compressTemplateSlotImage(file) {
  const image = await loadImageFile(file)
  const maxWidth = 900
  const maxHeight = 675
  const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器无法处理该图片')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return {
    src: canvas.toDataURL('image/jpeg', 0.78),
    aspectRatio: image.naturalWidth / image.naturalHeight,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  }
}

async function compressTemplateDecorImage(file) {
  const image = await loadImageFile(file)
  const maxWidth = 720
  const maxHeight = 720
  const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器无法处理该图案')
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return {
    src: canvas.toDataURL('image/png'),
    aspectRatio: image.naturalWidth / image.naturalHeight,
  }
}

async function compressTemplateDecor(file) {
  const image = await loadImageFile(file)
  const canvas = document.createElement('canvas')
  canvas.width = 360
  canvas.height = 240
  const context = canvas.getContext('2d')
  const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
  return canvas.toDataURL('image/png')
}

function validateTemplateImageFile(file) {
  return file && /^image\/(png|jpeg|webp)$/.test(file.type) && file.size <= 5 * 1024 * 1024
}

async function handleReportTemplateBackground(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if (!validateTemplateImageFile(file)) {
    ElMessage.warning('请上传不超过5MB的 PNG、JPG 或 WEBP 图片')
    event.target.value = ''
    return
  }
  try {
    reportTemplateForm.backgroundImage = await compressTemplatePreview(file)
    if (!reportTemplateForm.previewImage) reportTemplateForm.previewImage = reportTemplateForm.backgroundImage
    ElMessage.success('背景图已载入')
  } catch (error) {
    ElMessage.error(error.message || '背景图读取失败')
  } finally {
    event.target.value = ''
  }
}

async function handleReportTemplatePreview(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if (!validateTemplateImageFile(file)) {
    ElMessage.warning('请上传不超过5MB的 PNG、JPG 或 WEBP 图片')
    event.target.value = ''
    return
  }
  try {
    reportTemplateForm.previewImage = await compressTemplatePreview(file)
    ElMessage.success('模板预览图已载入')
  } catch (error) {
    ElMessage.error(error.message || '预览图读取失败')
  } finally {
    event.target.value = ''
  }
}

async function handleReportTemplateDecor(event) {
  const files = Array.from(event.target.files || []).filter(Boolean).slice(0, 4)
  if (!files.length) return
  const invalid = files.find((file) => !validateTemplateImageFile(file))
  if (invalid) {
    ElMessage.warning('元素图仅支持不超过5MB的 PNG、JPG 或 WEBP 图片')
    event.target.value = ''
    return
  }
  try {
    const remain = Math.max(0, 4 - reportTemplateForm.decorImages.length)
    const selected = files.slice(0, remain)
    const nextDecor = await Promise.all(selected.map(async (file, index) => ({
      id: `decor-${Date.now()}-${index}`,
      name: file.name.replace(/\.[^.]+$/, ''),
      src: await compressTemplateDecor(file),
      placement: ['top-right', 'bottom-left', 'bottom-right', 'top-left'][(reportTemplateForm.decorImages.length + index) % 4],
    })))
    reportTemplateForm.decorImages = [...reportTemplateForm.decorImages, ...nextDecor].slice(0, 4)
    ElMessage.success(`已载入 ${nextDecor.length} 张元素图`)
  } catch (error) {
    ElMessage.error(error.message || '元素图读取失败')
  } finally {
    event.target.value = ''
  }
}

function removeReportTemplateDecor(id) {
  reportTemplateForm.decorImages = reportTemplateForm.decorImages.filter((item) => item.id !== id)
}

function applyParsedPptxResult(result, file) {
  reportTemplateForm.category = result.category || reportTemplateForm.category
  reportTemplateForm.rendererPreset = result.rendererPreset || reportTemplateForm.rendererPreset
  reportTemplateForm.fontFamily = result.fontFamily || reportTemplateForm.fontFamily
  reportTemplateForm.parseStatus = result.parseStatus || 'parsed'
  reportTemplateForm.parseMessage = result.parseMessage || 'PPTX 风格已解析'
  reportTemplateForm.sourceUpdatedAt = result.sourceUpdatedAt || new Date().toISOString()
  reportTemplateForm.importMeta = result.importMeta || null
  reportTemplateForm.backgroundImage = result.backgroundImage || ''
  reportTemplateForm.decorImages = [...(result.decorImages || [])]
  reportTemplateForm.templatePages = [...(result.templatePages || [])]
  reportTemplateForm.assetMode = result.assetMode || 'structured-assets'
  Object.assign(reportTemplateForm.theme, result.theme || {})
  if (!reportTemplateForm.previewImage && result.previewImage) reportTemplateForm.previewImage = result.previewImage
  if (!reportTemplateForm.name.trim()) reportTemplateForm.name = file.name.replace(/\.pptx$/i, '')
}

async function parsePendingReportTemplateSource(file) {
  templateParsing.value = true
  reportTemplateForm.parseStatus = 'parsing'
  reportTemplateForm.parseMessage = '正在解析 PPTX 风格...'
  try {
    const result = await parsePptxTemplate(file)
    applyParsedPptxResult(result, file)
    ElMessage.success('PPTX 风格已解析并写入模板配置')
  } catch (error) {
    reportTemplateForm.parseStatus = 'failed'
    reportTemplateForm.parseMessage = error.message || 'PPTX 风格解析失败，请手动调整颜色和版式'
    reportTemplateForm.sourceUpdatedAt = new Date().toISOString()
    reportTemplateForm.importMeta = {
      parser: 'pptx-structure-v1',
      sourceName: file.name,
      sourceSize: file.size,
      parsedAt: new Date().toISOString(),
      error: reportTemplateForm.parseMessage,
    }
    ElMessage.warning(reportTemplateForm.parseMessage)
  } finally {
    templateParsing.value = false
  }
}

async function handleReportTemplateSource(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const lowerName = file.name.toLowerCase()
  const isPptx = lowerName.endsWith('.pptx')
  const isPpt = lowerName.endsWith('.ppt')
  if ((!isPptx && !isPpt) || file.size > 20 * 1024 * 1024) {
    ElMessage.warning('请上传不超过20MB的 PPT 或 PPTX 文件')
    event.target.value = ''
    return
  }
  pendingTemplateSourceFile.value = file
  reportTemplateForm.sourceFileName = file.name
  reportTemplateForm.sourceFileSize = file.size
  reportTemplateForm.sourceUpdatedAt = new Date().toISOString()
  if (isPptx) {
    await parsePendingReportTemplateSource(file)
    return
  }
  reportTemplateForm.parseStatus = 'manual'
  reportTemplateForm.parseMessage = '旧版 PPT 已作为源文件保存；如需自动解析颜色、背景和版式，请先转为 PPTX 后重新上传。'
  reportTemplateForm.importMeta = {
    parser: 'ppt-source-only',
    sourceName: file.name,
    sourceSize: file.size,
    parsedAt: new Date().toISOString(),
  }
  if (!reportTemplateForm.name.trim()) reportTemplateForm.name = file.name.replace(/\.ppt$/i, '')
  ElMessage.warning(reportTemplateForm.parseMessage)
}

function clearReportTemplateBackground() {
  reportTemplateForm.backgroundImage = ''
  reportTemplateForm.decorImages = []
  reportTemplateForm.templatePages = []
  reportTemplateForm.assetMode = 'structured-assets'
  reportTemplateForm.parseStatus = reportTemplateForm.parseStatus === 'parsed' ? 'manual' : reportTemplateForm.parseStatus
  reportTemplateForm.parseMessage = '已清除模板背景图和装饰图，将使用结构化颜色渲染'
}

async function reparseReportTemplateSource() {
  let sourceFile = pendingTemplateSourceFile.value
  try {
    if (!sourceFile && reportTemplateForm.id) {
      const record = await getTemplateSourceFile(reportTemplateForm.id)
      sourceFile = record?.file || null
    }
  } catch {
    sourceFile = null
  }
  if (!sourceFile) {
    ElMessage.warning('本机未找到源 PPTX，请重新上传模板源文件')
    return
  }
  await parsePendingReportTemplateSource(sourceFile)
}

function wouldRemoveLastPublicTemplate(id, status, visibility) {
  if (status === 'published' && visibility === 'public') return false
  const current = reportTemplateStore.byId(id)
  if (!current || current.status !== 'published' || current.visibility !== 'public') return false
  return reportTemplateStore.templates.filter((item) => item.id !== id && item.status === 'published' && item.visibility === 'public').length === 0
}

function wouldRemoveLastPublicTemplates(ids = [], patch = {}) {
  const idSet = new Set(ids)
  const remainingPublicTemplates = reportTemplateStore.templates.filter((template) => {
    if (!idSet.has(template.id)) return template.status === 'published' && template.visibility === 'public'
    const nextStatus = patch.status ?? template.status
    const nextVisibility = patch.visibility ?? template.visibility
    return nextStatus === 'published' && nextVisibility === 'public'
  })
  return remainingPublicTemplates.length === 0
}

function reportTemplatePayload() {
  const splitList = (value) => String(value || '').split(/[、,，;；]/).map((item) => item.trim()).filter(Boolean)
  const templatePages = normalizeTemplateEditorPages(reportTemplateForm.templatePages)
  return {
    name: reportTemplateForm.name.trim(),
    description: reportTemplateForm.description.trim(),
    category: reportTemplateForm.category,
    rendererPreset: reportTemplateForm.rendererPreset,
    status: reportTemplateForm.status,
    previewImage: reportTemplateForm.previewImage,
    backgroundImage: reportTemplateForm.backgroundImage,
    decorImages: [...reportTemplateForm.decorImages],
    templatePages,
    assetMode: reportTemplateForm.assetMode,
    sourceFileName: reportTemplateForm.sourceFileName,
    sourceFileSize: reportTemplateForm.sourceFileSize,
    sourceUpdatedAt: reportTemplateForm.sourceUpdatedAt,
    parseStatus: reportTemplateForm.parseStatus,
    parseMessage: reportTemplateForm.parseMessage,
    importMeta: reportTemplateForm.importMeta ? { ...reportTemplateForm.importMeta } : null,
    fontFamily: reportTemplateForm.fontFamily.trim() || 'Microsoft YaHei',
    footerBrand: reportTemplateForm.footerBrand.trim() || '美佳美画 AI 创意美术',
    styleTags: splitList(reportTemplateForm.styleTagsText),
    suitableCourses: splitList(reportTemplateForm.suitableCoursesText),
    suitableAgeRanges: splitList(reportTemplateForm.suitableAgeRangesText),
    suitablePages: [...reportTemplateForm.suitablePages],
    textDensity: reportTemplateForm.textDensity,
    imageCapacity: Math.max(0, Math.min(6, Number(reportTemplateForm.imageCapacity || 0))),
    overflowPolicy: reportTemplateForm.overflowPolicy,
    preferredLayouts: [...reportTemplateForm.preferredLayouts],
    matchingKeywords: splitList(reportTemplateForm.matchingKeywordsText),
    theme: { ...reportTemplateForm.theme },
    enabledLayouts: [...reportTemplateForm.enabledLayouts],
    visibility: reportTemplateForm.visibility,
    authorizedGroupIds: [...reportTemplateForm.authorizedGroupIds],
    authorizedClasses: [...reportTemplateForm.authorizedClasses],
    createdBy: userStore.user?.name || '管理员',
  }
}

async function saveReportTemplate() {
  if (!reportTemplateForm.name.trim()) {
    ElMessage.warning('请填写模板名称')
    return
  }
  if (!reportTemplateForm.enabledLayouts.length) {
    ElMessage.warning('请至少启用一种页面版式')
    return
  }
  if (wouldRemoveLastPublicTemplate(reportTemplateForm.id, reportTemplateForm.status, reportTemplateForm.visibility)) {
    ElMessage.warning('系统必须保留至少一个已发布且全员可用的模板')
    return
  }
  let template = null
  try {
    template = reportTemplateForm.id
      ? reportTemplateStore.updateTemplate(reportTemplateForm.id, reportTemplatePayload())
      : reportTemplateStore.createTemplate(reportTemplatePayload())
  } catch (error) {
    ElMessage.error(error.message || '模板保存失败')
    return
  }
  if (!template) return
  if (pendingTemplateSourceFile.value) {
    try {
      await saveTemplateSourceFile(template.id, pendingTemplateSourceFile.value)
    } catch (error) {
      reportTemplateStore.updateTemplate(template.id, { sourceFileName: '', sourceFileSize: 0 })
      ElMessage.error(error.message || '源PPTX保存失败')
      return
    }
  }
  selectedTemplateId.value = template.id
  pendingTemplateSourceFile.value = null
  templatePanel.value = 'list'
  ElMessage.success('PPT模板已保存')
}

function saveReportTemplateAuthorization() {
  const targetIds = selectedReportTemplateIds.value.length
    ? [...selectedReportTemplateIds.value]
    : selectedReportTemplate.value ? [selectedReportTemplate.value.id] : []
  if (!targetIds.length) return
  if (wouldRemoveLastPublicTemplates(targetIds, { visibility: reportTemplateForm.visibility })) {
    ElMessage.warning('系统必须保留至少一个已发布且全员可用的模板')
    return
  }
  targetIds.forEach((id) => reportTemplateStore.updateTemplate(id, {
    visibility: reportTemplateForm.visibility,
    authorizedGroupIds: [...reportTemplateForm.authorizedGroupIds],
    authorizedClasses: [...reportTemplateForm.authorizedClasses],
  }))
  ElMessage.success(targetIds.length > 1 ? `已批量授权 ${targetIds.length} 套PPT模板` : '模板使用授权已保存并同步到用户端')
  templatePanel.value = 'list'
}

function duplicateReportTemplate(template) {
  const copy = reportTemplateStore.duplicateTemplate(template.id, userStore.user?.name || '管理员')
  if (!copy) return
  selectedTemplateId.value = copy.id
  editReportTemplate(copy)
  ElMessage.success('模板已复制为草稿')
}

async function downloadReportTemplateSource(template) {
  try {
    const record = await getTemplateSourceFile(template.id)
    if (!record?.file) {
      ElMessage.warning('本机未找到该模板的源PPTX，请重新上传')
      return
    }
    const url = URL.createObjectURL(record.file)
    const link = document.createElement('a')
    link.href = url
    link.download = record.name || template.sourceFileName || `${template.name}.pptx`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (error) {
    ElMessage.error(error.message || '源PPTX下载失败')
  }
}

async function removeReportTemplate(template) {
  if (!reportTemplateStore.canDelete(template.id)) {
    ElMessage.warning('系统必须保留至少一个已发布且全员可用的模板')
    return
  }
  if (!window.confirm(`确认删除「${template.name}」？`)) return
  if (!reportTemplateStore.deleteTemplate(template.id)) return
  try { await deleteTemplateSourceFile(template.id) } catch {}
  selectedTemplateId.value = reportTemplateStore.templates[0]?.id || ''
  ElMessage.success('PPT模板已删除')
}

function toggleReportTemplateSelection(id) {
  selectedReportTemplateIds.value = selectedReportTemplateIds.value.includes(id)
    ? selectedReportTemplateIds.value.filter((item) => item !== id)
    : [...selectedReportTemplateIds.value, id]
}

function toggleAllReportTemplates(event) {
  const current = new Set(selectedReportTemplateIds.value)
  filteredReportTemplates.value.forEach((template) => {
    if (event.target.checked) current.add(template.id)
    else current.delete(template.id)
  })
  selectedReportTemplateIds.value = Array.from(current)
}

function clearReportTemplateSelection() {
  selectedReportTemplateIds.value = []
}

function bulkUpdateReportTemplates(status) {
  if (!selectedReportTemplateIds.value.length) {
    ElMessage.warning('请先选择PPT模板')
    return
  }
  if (wouldRemoveLastPublicTemplates(selectedReportTemplateIds.value, { status })) {
    ElMessage.warning('系统必须保留至少一个已发布且全员可用的模板')
    return
  }
  selectedReportTemplateIds.value.forEach((id) => reportTemplateStore.updateTemplate(id, { status }))
  ElMessage.success(status === 'published' ? '已批量发布PPT模板' : '已批量停用PPT模板')
}

function bulkPublishReportTemplates() {
  bulkUpdateReportTemplates('published')
}

function bulkDisableReportTemplates() {
  bulkUpdateReportTemplates('disabled')
}

function bulkDuplicateReportTemplates() {
  if (!selectedReportTemplateIds.value.length) {
    ElMessage.warning('请先选择PPT模板')
    return
  }
  const count = selectedReportTemplateIds.value
    .map((id) => reportTemplateStore.duplicateTemplate(id, userStore.user?.name || '管理员'))
    .filter(Boolean)
    .length
  selectedReportTemplateIds.value = []
  ElMessage.success(`已复制 ${count} 套PPT模板为草稿`)
}

async function bulkRemoveReportTemplates() {
  if (!selectedReportTemplateIds.value.length) {
    ElMessage.warning('请先选择PPT模板')
    return
  }
  if (wouldRemoveLastPublicTemplates(selectedReportTemplateIds.value, { status: 'deleted', visibility: 'deleted' })) {
    ElMessage.warning('系统必须保留至少一个已发布且全员可用的模板')
    return
  }
  const confirmed = window.confirm(`确认删除选中的 ${selectedReportTemplateIds.value.length} 套PPT模板？`)
  if (!confirmed) return
  let removed = 0
  for (const id of selectedReportTemplateIds.value) {
    if (reportTemplateStore.deleteTemplate(id)) {
      removed += 1
      try { await deleteTemplateSourceFile(id) } catch {}
    }
  }
  selectedReportTemplateIds.value = []
  selectedTemplateId.value = reportTemplateStore.templates[0]?.id || ''
  ElMessage.success(`已删除 ${removed} 套PPT模板`)
}

function questionLines(value) {
  const fallbackOptions = ['结合课程内容认真观察', '随意选择喜欢的效果', '只看图片大小', '忽略课程主题要求']
  return String(value || '')
    .split(/\n+/)
    .map((line) => {
      const parts = line.split(/[|｜]/).map((item) => item.trim()).filter(Boolean)
      if (!parts.length) return null
      if (parts.length >= 5) {
        const [title, optionA, optionB, optionC, optionD, answer = 'A'] = parts
        return {
          type: 'choice',
          title,
          options: [optionA, optionB, optionC, optionD],
          answer: /^[ABCD]$/i.test(answer) ? answer.toUpperCase() : 'A',
        }
      }
      return {
        type: 'choice',
        title: parts[0],
        options: fallbackOptions,
        answer: 'A',
      }
    })
    .filter(Boolean)
}

function resetAdminCourseForm() {
  editingAdminCourseId.value = ''
  adminCourseForm.title = ''
  adminCourseForm.category = 'storefront'
  adminCourseCustomCategoryName.value = ''
  showCourseCategoryDropdown.value = false
  adminCourseForm.difficulty = '少儿基础 · 8-10岁'
  adminCourseForm.description = ''
  adminCourseForm.cover = ''
  adminCourseForm.coverAssetId = ''
  adminCourseForm.coverFileName = ''
  adminCourseForm.coverPrompt = ''
  adminCourseForm.useParsedCoverPrompt = true
  adminCourseForm.videoAssetId = ''
  adminCourseForm.videoFileName = ''
  adminCourseForm.videoUrl = ''
  adminCourseForm.pptAssetId = ''
  adminCourseForm.pptFileName = ''
  adminCourseForm.pptPdfUrl = ''
  adminCourseForm.pptSlideImages = []
  adminCourseForm.documentFileName = ''
  adminCourseForm.questionsText = ''
  adminCourseForm.questions = []
  adminCourseForm.pptPages = []
  adminCourseForm.designRequirements = []
  adminCourseDocumentText.value = ''
  adminCourseDocumentParsing.value = false
  Object.assign(adminCourseForm.documentParseStatus, {
    state: 'idle',
    message: '尚未上传课程文档',
    textLength: 0,
    fieldCount: 0,
    questionCount: 0,
    preview: '',
  })
  adminCourseForm.authorizedGroupIds = []
}

function openAdminCourseUpload() {
  resetAdminCourseForm()
  coursePanel.value = 'upload'
  selectedAdminCourseIds.value = []
}

function editAdminCourse(course) {
  if (!course?.id) return
  editingAdminCourseId.value = course.id
  adminCourseForm.title = course.title || ''
  adminCourseForm.category = course.category || 'storefront'
  adminCourseCustomCategoryName.value = ''
  showCourseCategoryDropdown.value = false
  adminCourseForm.difficulty = course.difficulty || course.ageRange || '少儿基础 · 8-10岁'
  adminCourseForm.description = course.description || ''
  adminCourseForm.cover = course.cover || ''
  adminCourseForm.coverAssetId = course.coverAssetId || ''
  adminCourseForm.coverFileName = course.coverFileName || ''
  adminCourseForm.coverPrompt = course.coverPrompt || ''
  adminCourseForm.useParsedCoverPrompt = true
  adminCourseForm.videoAssetId = course.videoAssetId || ''
  adminCourseForm.videoFileName = course.videoFileName || ''
  adminCourseForm.videoUrl = course.videoUrl || ''
  adminCourseForm.pptAssetId = course.pptAssetId || ''
  adminCourseForm.pptFileName = course.pptFileName || ''
  adminCourseForm.pptPdfUrl = course.pptPdfUrl || ''
  adminCourseForm.pptSlideImages = Array.isArray(course.pptSlideImages) ? [...course.pptSlideImages] : []
  adminCourseForm.documentFileName = course.documentFileName || ''
  adminCourseForm.questions = Array.isArray(course.questions) ? course.questions.map((question) => ({ ...question, options: [...(question.options || [])] })) : []
  adminCourseForm.questionsText = adminCourseForm.questions.map((question) => question.title).join('\n')
  adminCourseForm.pptPages = Array.isArray(course.pptPages) ? course.pptPages.map((page) => ({ ...page })) : []
  adminCourseForm.designRequirements = Array.isArray(course.designRequirements) ? course.designRequirements.map((item) => ({ ...item })) : []
  adminCourseForm.authorizedGroupIds = Array.isArray(course.authorizedGroupIds) ? [...course.authorizedGroupIds] : []
  adminCourseDocumentText.value = ''
  if (adminCourseForm.coverAssetId) loadAdminCourseCoverAsset(adminCourseForm.coverAssetId)
  adminCourseDocumentParsing.value = false
  Object.assign(adminCourseForm.documentParseStatus, {
    state: 'idle',
    message: course.documentFileName ? `正在编辑已上传课程《${course.documentFileName}》` : '正在编辑课程，可重新上传文档解析',
    textLength: 0,
    fieldCount: 0,
    questionCount: adminCourseForm.questions.length,
    preview: course.description || '',
  })
  selectedAdminCourseIds.value = []
  coursePanel.value = 'upload'
}

async function handleAdminCourseCoverFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    ElMessage.warning('请上传 JPG、PNG 或 WEBP 图片')
    event.target.value = ''
    return
  }
  try {
    if (serverAuthMode) {
      // 服务端模式：封面必须传上去，否则学生端拿到的是一个只存在于这台电脑的 assetId，
      // 换台设备打开就是空白封面。
      const asset = await uploadCourseAsset(file, { kind: 'cover' })
      if (!asset?.url) throw new Error('封面图未上传成功')
      adminCourseForm.coverAssetId = ''
      adminCourseForm.cover = `url("${asset.url}") center / cover no-repeat`
      adminCourseForm.coverFileName = file.name
      ElMessage.success('课程封面图已上传')
      return
    }
    const assetId = createCourseAssetId('cover')
    const record = await saveCourseAsset(assetId, file, { kind: 'cover' })
    adminCourseForm.coverAssetId = assetId
    adminCourseForm.cover = `url("${createCourseAssetObjectUrl(record)}") center / cover no-repeat`
    adminCourseForm.coverFileName = file.name
    ElMessage.success('课程封面图已更新')
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || error.message || '课程封面图上传失败，请重试')
  } finally {
    event.target.value = ''
  }
}

async function loadAdminCourseCoverAsset(assetId) {
  try {
    const record = await getCourseAsset(assetId)
    if (adminCourseForm.coverAssetId !== assetId || !record?.file) return
    adminCourseForm.cover = `url("${createCourseAssetObjectUrl(record)}") center / cover no-repeat`
  } catch (error) {
    console.info('course cover asset load skipped', error)
  }
}

function buildAdminCourseCoverPrompt() {
  const parts = [
    adminCourseForm.title && `课程主题：${adminCourseForm.title}`,
    adminCourseForm.description && `课程简介：${adminCourseForm.description}`,
    adminCourseForm.difficulty && `适龄：${adminCourseForm.difficulty}`,
    adminCourseForm.category && `课程类型：${categoryLabel(adminCourseForm.category)}`,
    adminCourseForm.designRequirements?.map((item) => item.value).filter(Boolean).join('；'),
    '少儿创意美术课程封面，16:9 横版，主题明确，色彩明亮，画面干净，不包含文字',
  ]
  return parts.filter(Boolean).join('。')
}

async function generateAdminCourseCover() {
  const prompt = adminCourseForm.coverPrompt.trim() || buildAdminCourseCoverPrompt()
  if (!prompt) {
    ElMessage.warning('请先上传解析文档或输入封面提示词')
    return
  }
  adminCourseForm.coverPrompt = prompt
  adminCourseCoverGenerating.value = true
  try {
    const request = {
      prompt,
      difficulty: adminCourseForm.difficulty,
      style: '少儿创意美术课程封面',
      ratio: '16:9',
      count: 1,
    }
    const generation = generateArtwork(request)
    const generated = getAiMode() === 'api'
      ? await Promise.race([
        generation,
        new Promise((_, reject) => window.setTimeout(() => reject(new Error('AI 课程封面图生成超时，请检查图像模型配置和接口状态')), 15000)),
      ])
      : await Promise.race([
        generation.catch(() => null),
        new Promise((resolve) => window.setTimeout(() => resolve(null), 6000)),
      ]) || {
        source: 'mock-timeout',
        results: await generateMockArtwork(request),
      }
    const result = generated.results?.[0]
    const cover = result?.imageUrl
      ? `url("${result.imageUrl}") center / cover no-repeat`
      : result?.background
    if (!cover) throw new Error('AI 未返回可用的封面图')
    adminCourseForm.cover = cover
    adminCourseForm.coverAssetId = ''
    adminCourseForm.coverFileName = generated.source === 'api' ? 'AI 生成课程封面' : 'Mock AI 课程封面'
    ElMessage.success(generated.source === 'api' ? 'AI 课程封面图已生成' : '已生成 Mock AI 课程封面图')
  } catch (error) {
    ElMessage.warning(error.message || 'AI 课程封面图生成失败')
  } finally {
    adminCourseCoverGenerating.value = false
  }
}

function handleAdminVideoFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  adminCourseForm.videoFileName = file.name
  ElMessage.success('课程视频已加入上传列表')
  event.target.value = ''
}

async function handleAdminPptFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  adminCourseForm.pptFileName = file.name
  try {
    adminCourseForm.pptPages = await readCoursePptPages(file)
    ElMessage.success(adminCourseForm.pptPages.length ? `已读取 ${adminCourseForm.pptPages.length} 页 PPT 内容` : '课程PPT已加入上传列表')
  } catch (error) {
    adminCourseForm.pptPages = []
    adminCourseForm.pptPdfUrl = ''
    adminCourseForm.pptSlideImages = []
    ElMessage.warning(error.message || 'PPT读取失败，仍可保存文件名')
  } finally {
    event.target.value = ''
  }
}

async function handleAdminVideoAssetFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    if (serverAuthMode) {
      // 服务端模式：视频只有一份，就是服务器上那份。
      // 以前这里是「本地 IndexedDB 存一份 + 顺手试传服务器，失败就 console.info 静默跳过」，
      // 结果服务器没存上、老师以为传好了，学生打开是黑屏，还查不出原因。
      ElMessage.info('正在上传课程视频，请勿关闭页面...')
      const asset = await uploadCourseAsset(file, { kind: 'video' })
      if (!asset?.url) throw new Error('视频未上传成功')
      adminCourseForm.videoAssetId = ''
      adminCourseForm.videoFileName = file.name
      adminCourseForm.videoUrl = asset.url
      ElMessage.success('课程视频已上传到服务器，可在用户端播放')
      return
    }
    const assetId = createCourseAssetId('video')
    await saveCourseAsset(assetId, file, { kind: 'video' })
    adminCourseForm.videoAssetId = assetId
    adminCourseForm.videoFileName = file.name
    adminCourseForm.videoUrl = `local-video://${file.name}`
    try {
      const uploaded = await uploadCourseVideoToServer(file)
      if (uploaded?.ok && uploaded.videoUrl) adminCourseForm.videoUrl = uploaded.videoUrl
    } catch (uploadError) {
      console.info('server video upload skipped', uploadError?.response?.data || uploadError)
    }
    ElMessage.success('课程视频已保存，可在用户端播放')
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || error?.message || '视频上传失败，请重试')
  } finally {
    event.target.value = ''
  }
}

async function handleAdminPptAssetFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    ElMessage.warning('请上传 PDF 课件文件')
    event.target.value = ''
    return
  }
  try {
    if (serverAuthMode) {
      // 服务端模式：PDF 课件也统一走受保护素材接口，再让服务端渲染成图片页。
      // pdfUrl 用素材接口返回的 url（带鉴权），服务端 renderCoursePdfOnServer 会自己读这份文件。
      const asset = await uploadCourseAsset(file, { kind: 'pdf' })
      if (!asset?.url) throw new Error('PDF 课件未上传成功')
      adminCourseForm.pptAssetId = ''
      adminCourseForm.pptFileName = file.name
      adminCourseForm.pptPages = []
      adminCourseForm.pptPdfUrl = asset.url
      adminCourseForm.pptSlideImages = []
      ElMessage.success('PDF 课件已上传到服务器，可在用户端查看')
      return
    }
    const assetId = createCourseAssetId('pdf')
    await saveCourseAsset(assetId, file, { kind: 'pdf' })
    adminCourseForm.pptAssetId = assetId
    adminCourseForm.pptFileName = file.name
    adminCourseForm.pptPages = []
    adminCourseForm.pptPdfUrl = ''
    adminCourseForm.pptSlideImages = []
    const uploaded = await uploadCoursePdfToServer(file)
    if (!uploaded?.ok || !uploaded.pdfUrl) throw new Error('PDF 课件未上传到后端，请确认后端服务已启动')
    adminCourseForm.pptPdfUrl = uploaded.pdfUrl
    adminCourseForm.pptSlideImages = (uploaded.slides || []).map((slide) => slide.imageUrl).filter(Boolean)
    ElMessage.success('PDF 课件已保存，可在用户端查看')
  } catch (error) {
    adminCourseForm.pptPages = []
    adminCourseForm.pptPdfUrl = ''
    adminCourseForm.pptSlideImages = []
    ElMessage.error(error?.response?.data?.message || error?.message || 'PDF 课件保存失败，请重新选择文件')
  } finally {
    event.target.value = ''
  }
}

async function handleAdminCourseDocumentFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  adminCourseForm.documentFileName = file.name
  adminCourseForm.documentParseStatus.state = 'reading'
  adminCourseForm.documentParseStatus.message = `正在读取《${file.name}》`
  adminCourseDocumentParsing.value = true
  try {
    adminCourseDocumentText.value = await readCourseDocumentText(file)
    if (!adminCourseDocumentText.value.trim()) {
      throw new Error('未读取到课程文档文字，请检查文件格式')
    }
    await parseAdminCourseDocument()
  } catch (error) {
    adminCourseDocumentText.value = ''
    Object.assign(adminCourseForm.documentParseStatus, {
      state: 'error',
      message: error.message || '文档读取失败，请检查文件格式',
      textLength: 0,
      fieldCount: 0,
      questionCount: 0,
      preview: '建议上传新版 Word DOCX、文字型 PDF 或 TXT 文件。',
    })
    ElMessage.warning(error.message || '文档读取失败')
  } finally {
    adminCourseDocumentParsing.value = false
    event.target.value = ''
  }
}

async function parseAdminCourseDocument() {
  if (!adminCourseDocumentText.value.trim()) return false
  adminCourseDocumentParsing.value = true
  try {
    const parsed = parseCourseDocument(
      adminCourseDocumentText.value,
      adminCourseForm.documentFileName,
      {
        category: adminCourseForm.category,
        difficulty: adminCourseForm.difficulty,
      },
    )
    adminCourseForm.title = parsed.title
    adminCourseForm.category = parsed.category
    adminCourseForm.difficulty = parsed.difficulty
    adminCourseForm.description = parsed.description
    adminCourseForm.questions = normalizeAdminQuestions(parsed.questions)
    adminCourseForm.designRequirements = parsed.designRequirements || []
    if (adminCourseForm.useParsedCoverPrompt || !adminCourseForm.coverPrompt.trim()) {
      adminCourseForm.coverPrompt = buildAdminCourseCoverPrompt()
    }
    if (!adminCourseForm.pptPages.length) adminCourseForm.pptPages = parsed.pptPages || []
    syncAdminQuestionText()
    Object.assign(adminCourseForm.documentParseStatus, {
      state: 'success',
      message: `已解析课程文档《${adminCourseForm.documentFileName}》`,
      textLength: parsed.textLength,
      fieldCount: parsed.fieldCount,
      questionCount: adminCourseForm.questions.length,
      preview: parsed.preview,
    })
    ElMessage.success('课程信息和选择题已自动填写')
    return true
  } catch (error) {
    Object.assign(adminCourseForm.documentParseStatus, {
      state: 'error',
      message: error.message || '课程文档解析失败',
      preview: '',
    })
    ElMessage.warning(error.message || '课程文档解析失败')
    return false
  } finally {
    adminCourseDocumentParsing.value = false
  }
}

function createAdminCourse() {
  void persistAdminCourse()
}

async function persistAdminCourse() {
  if (!adminCourseForm.title.trim()) {
    ElMessage.warning('请先填写课题名称')
    return
  }
  const isEditing = Boolean(editingAdminCourseId.value)
  const existingCourse = isEditing ? courseStore.courses.find((course) => course.id === editingAdminCourseId.value) : null
  if (isEditing && !existingCourse) {
    ElMessage.warning('课程不存在或已被删除，请刷新课程列表后重试')
    return
  }
  const normalizedQuestions = normalizeAdminQuestions(adminCourseForm.questions)
  adminCourseForm.questions = normalizedQuestions
  syncAdminQuestionText()
  const selectedCategory = await resolveAdminCourseCategoryForSave()
  if (!selectedCategory) return
  const payload = {
    title: adminCourseForm.title.trim(),
    category: selectedCategory,
    difficulty: adminCourseForm.difficulty,
    ageRange: adminCourseForm.difficulty,
    description: adminCourseForm.description,
    cover: adminCourseForm.coverAssetId ? 'linear-gradient(135deg, #0f766e, #38bdf8)' : adminCourseForm.cover,
    coverAssetId: adminCourseForm.coverAssetId,
    coverFileName: adminCourseForm.coverFileName,
    coverPrompt: adminCourseForm.coverPrompt,
    videoAssetId: adminCourseForm.videoAssetId,
    videoFileName: adminCourseForm.videoFileName,
    videoUrl: adminCourseForm.videoUrl || (adminCourseForm.videoFileName ? `local-video://${adminCourseForm.videoFileName}` : 'mock://video/course'),
    pptAssetId: adminCourseForm.pptAssetId,
    pptFileName: adminCourseForm.pptFileName,
    pptPdfUrl: adminCourseForm.pptPdfUrl,
    pptSlideImages: adminCourseForm.pptSlideImages,
    pptPages: adminCourseForm.pptPages,
    documentFileName: adminCourseForm.documentFileName,
    icon: categoryLabel(selectedCategory).slice(0, 1),
    questions: normalizedQuestions.length
      ? normalizedQuestions
      : questionLines(adminCourseForm.questionsText),
    designRequirements: adminCourseForm.designRequirements,
    ownerId: existingCourse?.ownerId || userStore.user?.id || 'adm-001',
    ownerName: existingCourse?.ownerName || userStore.user?.name || '管理员',
    ownerRole: existingCourse?.ownerRole || 'admin',
    authorizedGroupIds: [...adminCourseForm.authorizedGroupIds],
    authorizedClasses: existingCourse?.authorizedClasses || [],
    authorizedStudents: existingCourse?.authorizedStudents || [],
  }
  // 等服务端真正写库成功再提示：断网 / 没权限时不能弹「已保存」
  let course
  try {
    course = isEditing
      ? await courseStore.updateCourse(editingAdminCourseId.value, payload)
      : await courseStore.createCourse(payload)
  } catch (error) {
    ElMessage.error(error?.message || '课程保存失败，请稍后重试')
    return
  }
  if (!course) {
    ElMessage.warning('课程不存在或已被删除，请刷新课程列表后重试')
    return
  }
  selectedAuthCourseId.value = course.id
  resetAdminCourseForm()
  coursePanel.value = 'bulk'
  ElMessage.success(isEditing ? '课程已更新' : '课程已保存到课程库')
}

function toggleAdminCourse(id) {
  selectedAdminCourseIds.value = selectedAdminCourseIds.value.includes(id)
    ? selectedAdminCourseIds.value.filter((item) => item !== id)
    : [...selectedAdminCourseIds.value, id]
}

function toggleAllAdminCourses(event) {
  selectedAdminCourseIds.value = event.target.checked ? filteredAdminCourses.value.map((course) => course.id) : []
}

async function bulkUpdateCourses(status) {
  if (!selectedAdminCourseIds.value.length) {
    ElMessage.warning('请先选择课程')
    return
  }
  try {
    const updated = await courseStore.bulkUpdateStatus(selectedAdminCourseIds.value, status)
    selectedAdminCourseIds.value = []
    ElMessage.success(`${status === 'published' ? '已批量发布' : '已批量下架'} ${updated} 门课程`)
  } catch (error) {
    ElMessage.error(error?.message || '批量修改失败，请稍后重试')
  }
}

function bulkPublishCourses() {
  bulkUpdateCourses('published')
}

function bulkArchiveCourses() {
  bulkUpdateCourses('draft')
}

async function bulkDeleteCourses() {
  if (!selectedAdminCourseIds.value.length) {
    ElMessage.warning('请先选择课程')
    return
  }
  const count = selectedAdminCourseIds.value.length
  try {
    await ElMessageBox.confirm(`删除选中的 ${count} 门课程？删除后讲师和小画家都看不到了。`, '删除课程', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    const removed = await courseStore.deleteCourses(selectedAdminCourseIds.value)
    selectedAdminCourseIds.value = []
    selectedAuthCourseId.value = courseStore.courses[0]?.id || ''
    ElMessage.success(`已删除 ${removed} 门课程`)
  } catch (error) {
    ElMessage.error(error?.message || '删除失败，请稍后重试')
  }
}

function handleAdminCourseBatchAction(event) {
  const action = event.target.value
  event.target.value = ''
  if (!action) return
  if (action === 'publish') {
    bulkPublishCourses()
    return
  }
  if (action === 'archive') {
    bulkArchiveCourses()
    return
  }
  if (action === 'delete') {
    bulkDeleteCourses()
  }
}

function clearAdminCourseSelection() {
  selectedAdminCourseIds.value = []
}

async function deleteAdminCourse(id) {
  const course = courseStore.courses.find((item) => item.id === id)
  try {
    await ElMessageBox.confirm(`删除「${course?.title || '这门课程'}」？删除后讲师和小画家都看不到了。`, '删除课程', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    if (await courseStore.deleteCourse(id)) {
      selectedAdminCourseIds.value = selectedAdminCourseIds.value.filter((item) => item !== id)
      selectedAuthCourseId.value = courseStore.courses[0]?.id || ''
      ElMessage.success('课程已从课程库删除')
    }
  } catch (error) {
    ElMessage.error(error?.message || '删除失败，请稍后重试')
  }
}

async function duplicateAdminCourse(course) {
  try {
    // 复制品不带原课程的授权：新课先只在课程库里，需要时再单独授权
    const copy = await courseStore.createCourse({
      ...course,
      title: `${course.title || '趣味设计课程'} 副本`,
      status: course.status || 'published',
      ownerId: userStore.user?.id || '',
      ownerName: userStore.user?.name || '管理员',
      ownerRole: 'admin',
      authorizedGroupIds: [],
      authorizedClassIds: [],
      authorizedOrganization: false,
      authorizedClasses: [],
      authorizedStudents: [],
    })
    selectedAuthCourseId.value = copy.id
    ElMessage.success('已复制课程到课程库')
  } catch (error) {
    ElMessage.error(error?.message || '复制失败，请稍后重试')
  }
}

// 列表里每门课的授权摘要：讲师权限组 + 小画家范围
// 授权范围的几段文字：讲师组（只算还在的组）、小画家（全机构 / 班级 / 单发）
function courseAuthParts(course, { groupNames = false } = {}) {
  const parts = []
  const groups = permissionGroupNameList(course.authorizedGroupIds)
  if (groups.length) parts.push(groupNames ? `讲师组：${groups.join('、')}` : `${groups.length} 个讲师组`)
  const knownClassIds = new Set((accountPermissionStore.classes || []).map((item) => item.id))
  const classCount = (course.authorizedClassIds || []).filter((id) => !serverAuthMode || !knownClassIds.size || knownClassIds.has(id)).length
  if (course.authorizedOrganization) parts.push('全机构小画家')
  else if (classCount) parts.push(`${classCount} 个班级`)
  if (!course.authorizedOrganization && (course.authorizedStudentIds || []).length) parts.push(`${course.authorizedStudentIds.length} 位小画家`)
  return parts
}

function courseAuthSummary(course) {
  const parts = courseAuthParts(course)
  return parts.length ? `已授权：${parts.join('、')}` : '还没授权'
}

function courseCardAuthText(course) {
  const parts = courseAuthParts(course, { groupNames: true })
  return parts.length ? parts.join(' · ') : '暂未授权'
}

// 新建课程时自动带的演示占位（mock:// 视频、一页「课程导入」）不算真的有视频 / 课件
function courseHasVideo(course) {
  return Boolean(course.videoFileName || course.videoAssetId || (course.videoUrl && !/^mock:\/\//i.test(course.videoUrl)))
}

function coursePptLabel(course) {
  if (course.pptFileName || course.pptPdfUrl) return 'PDF 课件'
  const pages = (course.pptPages || []).filter((page) => !(page?.title === '课程导入' && page?.body === '这里展示讲师上传的PPT内容。'))
  return pages.length ? `${pages.length} 页课件` : '无课件'
}

// 可勾选的班级：后台账号数据里的真实班级（带分部名）
const courseAuthClassOptions = computed(() => {
  const campusNames = Object.fromEntries((accountPermissionStore.campuses || []).map((campus) => [campus.id, campus.name]))
  return (accountPermissionStore.classes || []).map((item) => ({ id: item.id, name: item.name, campusName: campusNames[item.campus_id] || '' }))
})

async function saveCourseAuthorization() {
  if (!selectedAuthCourse.value || courseAuthSaving.value) return
  courseAuthSaving.value = true
  courseAuthError.value = ''
  try {
    await courseStore.updateCourse(selectedAuthCourse.value.id, {
      // 已经删掉的组（或旧版本的演示组 ID）顺手清掉
      authorizedGroupIds: selectedAuthGroupIds.value.filter((id) => !serverAuthMode || accountPermissionStore.groupById(id)),
      authorizedOrganization: selectedAuthOrganization.value,
      authorizedClassIds: selectedAuthOrganization.value ? [] : [...selectedAuthClassIds.value],
      status: 'published',
    })
    ElMessage.success('授权已保存，讲师端和小画家端刷新后就能看到')
  } catch (error) {
    courseAuthError.value = error?.message || '保存失败，请稍后重试'
  } finally {
    courseAuthSaving.value = false
  }
}

function formatDate(value) {
  if (!value) return '刚刚'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function openProviderList(category = providerCategory.value) {
  providerCategory.value = category
  providerView.value = 'list'
  creatingProvider.value = false
  selectedProviderIds.value = selectedProviderIds.value.filter((key) => providerConfig.providers?.[key])
}

function editProvider(key) {
  selectProvider(key)
  if (providerConfig.providers?.[key]) {
    creatingProvider.value = false
    providerView.value = 'form'
  }
}

function toggleAllProviders(checked) {
  selectedProviderIds.value = checked ? providerCards.value.map((provider) => provider.key) : []
}

function fillProviderForm(provider) {
  providerForm.category = provider.category || (provider.key === 'hunyuan3d' ? 'model3d' : 'painting')
  providerForm.capabilitiesText = Array.isArray(provider.capabilities) ? provider.capabilities.join(',') : ''
  providerForm.bindingsText = Array.isArray(provider.bindings) ? provider.bindings.join(',') : ''
  providerForm.key = provider.key
  providerForm.label = provider.label
  providerForm.baseUrl = provider.baseUrl
  providerForm.imageModel = provider.imageModel || ''
  providerForm.textModel = provider.textModel || ''
  providerForm.videoModel = provider.videoModel || ''
  providerForm.imageModels = normalizeProviderModels(provider.imageModels, provider.imageModel)
  providerForm.textModels = normalizeProviderModels(provider.textModels, provider.textModel)
  providerForm.videoModels = normalizeProviderModels(provider.videoModels, provider.videoModel)
  providerForm.models = normalizeProviderModels(
    provider.models,
    provider.defaultModel,
    provider.textModels,
    provider.imageModels,
    provider.videoModels,
    provider.textModel,
    provider.imageModel,
    provider.videoModel,
  )
  providerForm.defaultModel = provider.defaultModel || provider.textModel || providerForm.models[0] || ''
  providerForm.apiKey = ''
  providerForm.secretId = ''
  providerForm.secretKey = ''
  providerForm.region = provider.connection?.region || 'ap-guangzhou'
  providerForm.endpoint = provider.connection?.endpoint || 'ai3d.tencentcloudapi.com'
  providerForm.enabled = provider.enabled !== false
  providerForm.defaultEdition = provider.defaultEdition === 'pro' ? 'pro' : 'rapid'
  providerForm.editions = { rapid: provider.editions?.rapid !== false, pro: provider.editions?.pro !== false }
  // 参考图能力：直接读服务端归一化后的声明；未声明的走「未声明」提示而不是猜。
  providerForm.imageInputMode = provider.imageInput?.mode || 'body-field'
  providerForm.imageEditProtocol = provider.imageEdit?.protocol || 'none'
  providerForm.imageEditModelsText = (provider.imageEdit?.models || []).join('\n')
  providerForm.imageEditSize = provider.imageEdit?.size || '1024x1024'
  providerForm.imageInputField = provider.imageInput?.field || 'image'
  providerForm.imageInputMaxImages = provider.imageInput?.maxImages || 4
  providerForm.checkReferenceImage = false
  providerForm.imageWatermark = provider.imageWatermark !== false
  providerForm.imageInputAuto = (provider.imageInputSource || (provider.imageInput?.auto ? 'auto' : 'manual')) !== 'manual'
  providerForm.modelLabels = { ...(provider.customModelLabels || {}) }
  providerModelDraft.value = ''
  providerModelsExpanded.value = false
  upstreamModels.value = []
  selectedUpstreamModel.value = ''
  providerFormRenderKey.value += 1
}

function startCreateProvider(category = providerCategory.value) {
  creatingProvider.value = true
  providerView.value = 'form'
  selectedProvider.value = ''
  providerForm.category = category
  providerForm.capabilitiesText = ''
  providerForm.bindingsText = ''
  providerForm.key = ''
  providerForm.label = ''
  providerForm.baseUrl = ''
  providerForm.imageModel = ''
  providerForm.textModel = ''
  providerForm.videoModel = ''
  providerForm.imageModels = []
  providerForm.textModels = []
  providerForm.videoModels = []
  providerForm.models = []
  providerForm.defaultModel = ''
  providerForm.apiKey = ''
  providerForm.secretId = ''
  providerForm.secretKey = ''
  providerForm.region = 'ap-guangzhou'
  providerForm.endpoint = 'ai3d.tencentcloudapi.com'
  providerForm.enabled = true
  providerForm.defaultEdition = 'rapid'
  providerForm.editions = { rapid: true, pro: true }
  // 新平台默认按 OpenAI 兼容（顶层 image 字段）尝试发送参考图；保存后可在表单里改。
  providerForm.imageInputMode = 'body-field'
  providerForm.imageEditProtocol = 'none'
  providerForm.imageEditModelsText = ''
  providerForm.imageEditSize = '1024x1024'
  providerForm.imageInputField = 'image'
  providerForm.imageInputMaxImages = 4
  providerForm.checkReferenceImage = false
  providerForm.imageWatermark = true
  providerForm.imageInputAuto = true
  providerForm.modelLabels = {}
  providerModelDraft.value = ''
  providerModelsExpanded.value = false
  upstreamModels.value = []
  selectedUpstreamModel.value = ''
  providerFormRenderKey.value += 1
  apiTestResult.value = null
  ElMessage.info('已进入创建新API模式，请填写表单后保存')
}

function normalizeProviderModels(...sources) {
  return [...new Set(sources
    .flatMap((source) => Array.isArray(source) ? source : [source])
    .map((item) => String(item || '').trim())
    .filter(Boolean))]
}

function providerCapabilities(provider = {}) {
  const capabilities = []
  if (normalizeProviderModels(provider.textModels, provider.textModel).length) capabilities.push('文本')
  if (normalizeProviderModels(provider.imageModels, provider.imageModel).length) capabilities.push('图像')
  if (normalizeProviderModels(provider.videoModels, provider.videoModel).length) capabilities.push('视频')
  return capabilities.length ? capabilities : ['未选择能力']
}

function providerPrimaryModel(provider = {}) {
  return provider.textModel || provider.imageModel || provider.videoModel || '未填写模型名称'
}

// 模型类型（图像 / 视频 / 文字）：用户端只按这三类列表取模型（AI 绘画 / AI 视频 / 智能体）。
// 没归类的按平台声明的唯一能力或模型名推断，规则和服务端 server/provider-models.js 的 inferModelCapability 一致。
const PROVIDER_MODEL_KINDS = ['image', 'video', 'text']
function guessProviderModelKind(model) {
  const declared = String(providerForm.capabilitiesText || '').split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => PROVIDER_MODEL_KINDS.includes(item))
  if (declared.length === 1) return declared[0]
  const name = String(model || '')
  if (/t2v|i2v|v2v/i.test(name)) return 'video'
  if (/t2i|i2i/i.test(name)) return 'image'
  if (/video|seedance|kling|veo|sora|wan-?2|hailuo|vidu|runway|pika|pixverse/i.test(name)) return 'video'
  if (/image|seedream|seededit|dall-?e|flux|stable-?diffusion|sdxl|sd3|kolors|cogview|wanx|midjourney|ideogram|recraft|nano-?banana|jimeng|hidream/i.test(name)) return 'image'
  return 'text'
}
function providerModelKind(model) {
  return PROVIDER_MODEL_KINDS.find((kind) => providerForm[`${kind}Models`].includes(model)) || guessProviderModelKind(model)
}
function setProviderModelKind(model, kind) {
  if (!PROVIDER_MODEL_KINDS.includes(kind)) return
  PROVIDER_MODEL_KINDS.forEach((item) => {
    const rest = providerForm[`${item}Models`].filter((entry) => entry !== model)
    providerForm[`${item}Models`] = item === kind ? [...rest, model] : rest
    // 单值字段（imageModel 等）跟着列表走：模型换了类型，旧类型的单值字段不能还指着它。
    if (item !== kind && providerForm[`${item}Model`] === model) providerForm[`${item}Model`] = rest[0] || ''
  })
  // 这一类还没有默认模型时：优先用标了「默认」的模型，否则用列表里最早的，不让刚改类型的模型插到前面。
  if (!providerForm[`${kind}Model`]) {
    const list = providerForm[`${kind}Models`]
    providerForm[`${kind}Model`] = list.includes(providerForm.defaultModel) ? providerForm.defaultModel : list[0]
  }
}

function addProviderModel(model = providerModelDraft.value) {
  // 护栏：模板若写成 @click="addProviderModel"（漏括号），Vue 会把原生 DOM 事件当作第一个参数传进来，
  // String(event) 会得到 "[object PointerEvent]" 并被当成合法模型名写进配置（曾污染过 hunyuan3d.models）。
  // 这里只接受字符串，非字符串一律回退到输入框草稿值。
  const normalizedModel = String(typeof model === 'string' ? model : providerModelDraft.value).trim()
  if (!normalizedModel) {
    ElMessage.warning('请填写模型名称')
    return
  }
  const models = normalizeProviderModels(providerForm.models, normalizedModel)
  if (models.length === providerForm.models.length) {
    ElMessage.info('该模型已经在列表中')
    return
  }
  providerForm.models = models
  // 新加的模型先按名字归类（3D 平台的是版本号，不归类），后台可以在列表里改。
  if (!isHunyuan3dProvider.value) setProviderModelKind(normalizedModel, guessProviderModelKind(normalizedModel))
  providerForm.defaultModel = providerForm.defaultModel || normalizedModel
  if (providerForm.models.length > 1) providerModelsExpanded.value = true
  providerModelDraft.value = ''
  return true
}

function addSelectedUpstreamModel() {
  if (addProviderModel(selectedUpstreamModel.value)) selectedUpstreamModel.value = ''
}

function setProviderDefaultModel(model) {
  providerForm.defaultModel = model
}

function removeProviderModel(model) {
  const models = providerForm.models.filter((item) => item !== model)
  providerForm.models = models
  // 各类型列表和单值字段里也删掉：以前只删统一列表，删掉的模型在用户端照样能选。
  PROVIDER_MODEL_KINDS.forEach((kind) => {
    providerForm[`${kind}Models`] = providerForm[`${kind}Models`].filter((item) => item !== model)
    if (providerForm[`${kind}Model`] === model) providerForm[`${kind}Model`] = providerForm[`${kind}Models`][0] || ''
  })
  if (providerForm.defaultModel === model) providerForm.defaultModel = models[0] || ''
  if (models.length <= 1) providerModelsExpanded.value = false
}

async function fetchUpstreamModels() {
  if (creatingProvider.value) {
    ElMessage.warning('请先保存新的 API 平台，再从上游读取模型列表')
    return
  }
  providerModelLoading.value = true
  try {
    const response = await apiClient.post('/admin/ai-providers/models', { provider: providerForm.key })
    upstreamModels.value = Array.isArray(response.data.models) ? response.data.models : []
    selectedUpstreamModel.value = ''
    ElMessage.success(response.data.message || '已获取上游模型列表')
  } catch (error) {
    upstreamModels.value = []
    ElMessage.error(error?.response?.data?.message || '获取上游模型失败，请检查 API 地址、Key 或上游是否支持 /models')
  } finally {
    providerModelLoading.value = false
  }
}

function cancelCreateProvider() {
  creatingProvider.value = false
  const target = providerConfig.defaultProvider || Object.keys(providerConfig.providers || {})[0]
  if (target) selectProvider(target)
  openProviderList()
}

function selectProvider(key) {
  selectedProvider.value = key
  const provider = providerConfig.providers?.[key]
  if (provider) fillProviderForm(provider)
}

async function deleteProvider(key) {
  const provider = providerConfig.providers?.[key]
  if (!provider) return
  if (!window.confirm(`确定删除“${provider.label || key}”吗？删除后该配置不会再出现在 API 配置列表中。`)) return
  try {
    await apiClient.delete(`/admin/ai-providers/${encodeURIComponent(key)}`)
    selectedProviderIds.value = selectedProviderIds.value.filter((item) => item !== key)
    if (selectedProvider.value === key) selectedProvider.value = ''
    await loadProviderConfig()
    openProviderList()
    ElMessage.success('API配置已删除')
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '删除失败，请检查后端是否启动')
  }
}

async function deleteSelectedProviders() {
  const keys = selectedProviderIds.value.filter((key) => providerConfig.providers?.[key])
  if (!keys.length) return
  if (!window.confirm(`确定批量删除 ${keys.length} 个 API 配置吗？`)) return
  try {
    await Promise.all(keys.map((key) => apiClient.delete(`/admin/ai-providers/${encodeURIComponent(key)}`)))
    selectedProviderIds.value = []
    if (keys.includes(selectedProvider.value)) selectedProvider.value = ''
    await loadProviderConfig()
    openProviderList()
    ElMessage.success('已批量删除 API 配置')
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '批量删除失败，请检查后端是否启动')
  }
}

async function loadProviderConfig() {
  try {
    const response = await apiClient.get('/admin/ai-providers')
    const providers = response.data.providers || {}
    providerConfig.defaultProvider = response.data.defaultProvider || 'agnes'
    providerConfig.defaultTextProvider = response.data.defaultTextProvider || providerConfig.defaultProvider
    providerConfig.providers = providers
    providerConfig.imageFallback = response.data.imageFallback || null
    selectedProviderIds.value = selectedProviderIds.value.filter((key) => providerConfig.providers?.[key])
    const target = providerConfig.providers[selectedProvider.value] ? selectedProvider.value : providerConfig.defaultProvider
    if (target) selectProvider(target)
  } catch (error) {
    providerConfig.providers = {
      ...JSON.parse(JSON.stringify(defaultProviderCatalog)),
      ...(providerConfig.providers || {}),
    }
    selectedProviderIds.value = selectedProviderIds.value.filter((key) => providerConfig.providers?.[key])
    const target = providerConfig.providers[selectedProvider.value] ? selectedProvider.value : providerConfig.defaultProvider
    if (target) selectProvider(target)
    ElMessage.warning(error?.response?.data?.message || '后端模型配置接口暂不可用')
  }
}

function taskTypeForAgentType(type = '') {
  if (type === 'ppt-image') return 'image'
  if (type === 'report' || type === 'report-outline') return 'text'
  return 'text'
}

function defaultAgentModelParams(taskType = 'text', patch = {}) {
  return {
    temperature: Number.isFinite(Number(patch.temperature)) ? Number(patch.temperature) : taskType === 'image' ? 0.35 : 0.2,
    timeoutSeconds: Number.isFinite(Number(patch.timeoutSeconds)) ? Number(patch.timeoutSeconds) : taskType === 'image' ? 180 : 120,
    ratio: patch.ratio || '16:9',
    count: Math.min(Math.max(Number(patch.count || 1), 1), 4),
    quality: patch.quality || 'high',
    supportReference: patch.supportReference !== false,
  }
}

function defaultReportAgentDraft(patch = {}) {
  const taskType = patch.taskType || taskTypeForAgentType(patch.type)
  const boundFlowKeys = Array.isArray(patch.boundFlowKeys) ? [...patch.boundFlowKeys] : []
  return {
    id: patch.id || `report-agent-${Date.now()}`,
    name: patch.name || '新建自定义智能体',
    type: patch.type || 'custom',
    taskType,
    status: patch.status || 'enabled',
    updatedAt: patch.updatedAt || new Date().toISOString(),
    flowKey: patch.flowKey || boundFlowKeys[0] || defaultAgentFlowKey.value,
    boundFlowKeys,
    allowedModelKeys: Array.isArray(patch.allowedModelKeys) ? [...patch.allowedModelKeys] : [],
    defaultModelKey: patch.defaultModelKey || '',
    fallbackModelKey: patch.fallbackModelKey || '',
    modelParams: defaultAgentModelParams(taskType, patch.modelParams || {}),
    masterPrompt: patch.masterPrompt || '',
    persona: patch.persona || '',
    reportGoal: patch.reportGoal || '',
    generationLogic: patch.generationLogic || '',
    inputScope: patch.inputScope || '',
    outputRules: patch.outputRules || '',
    qualityRules: patch.qualityRules || '',
    fallbackRules: patch.fallbackRules || '',
    pageStructure: patch.pageStructure || '',
    layoutRules: patch.layoutRules || '',
    difficultyRules: {
      junior: patch.difficultyRules?.junior || '初级版：短句、儿童口吻、鼓励表达。',
      starter: patch.difficultyRules?.starter || '入门版：课堂表达，说明观察、想法和完成结果。',
      advanced: patch.difficultyRules?.advanced || '进阶版：加入构图、色彩、提示词和迭代逻辑。',
      pro: patch.difficultyRules?.pro || '高级版：加入专业参数、分镜、排版和作品集表达。',
    },
  }
}

function boundFlowKeysForAgent(agentId) {
  return agentFlows.value
    .filter((flow) => agentBindings[flow.key] === agentId)
    .map((flow) => flow.key)
}

function fallbackAgentId(excludedAgentId = '') {
  const fallback = reportAgentState.agents.find((agent) => agent.status === 'enabled' && agent.id !== excludedAgentId)
    || reportAgentState.agents.find((agent) => agent.id !== excludedAgentId)
    || reportAgentState.agents.find((agent) => agent.status === 'enabled')
    || reportAgentState.agents[0]
  return fallback?.id || ''
}

function normalizeBoundFlowKeys(keys = []) {
  const available = new Set(agentFlows.value.map((flow) => flow.key))
  return [...new Set(keys)].filter((key) => available.has(key))
}

function fillReportAgentForm(agent = defaultReportAgentDraft()) {
  reportAgentForm.id = agent.id || ''
  reportAgentForm.name = agent.name || ''
  reportAgentForm.type = agent.type || 'report'
  reportAgentForm.taskType = agent.taskType || taskTypeForAgentType(agent.type)
  reportAgentForm.status = agent.status || 'enabled'
  reportAgentForm.updatedAt = agent.updatedAt || ''
  const boundFlowKeys = normalizeBoundFlowKeys(boundFlowKeysForAgent(agent.id).length
    ? boundFlowKeysForAgent(agent.id)
    : agent.boundFlowKeys || [])
  reportAgentForm.boundFlowKeys = boundFlowKeys
  reportAgentForm.flowKey = boundFlowKeys[0] || agent.flowKey || defaultAgentFlowKey.value
  reportAgentForm.allowedModelKeys = Array.isArray(agent.allowedModelKeys) ? [...agent.allowedModelKeys] : []
  reportAgentForm.defaultModelKey = agent.defaultModelKey || ''
  reportAgentForm.fallbackModelKey = agent.fallbackModelKey || ''
  reportAgentForm.modelParams = defaultAgentModelParams(reportAgentForm.taskType, agent.modelParams || {})
  reportAgentForm.masterPrompt = agent.masterPrompt || ''
  reportAgentForm.persona = agent.persona || ''
  reportAgentForm.reportGoal = agent.reportGoal || ''
  reportAgentForm.generationLogic = agent.generationLogic || ''
  reportAgentForm.inputScope = agent.inputScope || ''
  reportAgentForm.outputRules = agent.outputRules || ''
  reportAgentForm.qualityRules = agent.qualityRules || ''
  reportAgentForm.fallbackRules = agent.fallbackRules || ''
  reportAgentForm.pageStructure = agent.pageStructure || ''
  reportAgentForm.layoutRules = agent.layoutRules || ''
  reportAgentForm.difficultyRules.junior = agent.difficultyRules?.junior || ''
  reportAgentForm.difficultyRules.starter = agent.difficultyRules?.starter || ''
  reportAgentForm.difficultyRules.advanced = agent.difficultyRules?.advanced || ''
  reportAgentForm.difficultyRules.pro = agent.difficultyRules?.pro || ''
}

function normalizeAgentModelSelection() {
  const compatibleKeys = new Set(compatibleAgentModelOptions.value.map((item) => item.key))
  const allowedModelKey = reportAgentForm.allowedModelKeys.find((key) => compatibleKeys.has(key))
  reportAgentForm.allowedModelKeys = allowedModelKey ? [allowedModelKey] : []
  if (reportAgentForm.defaultModelKey && !compatibleKeys.has(reportAgentForm.defaultModelKey)) reportAgentForm.defaultModelKey = ''
  if (reportAgentForm.fallbackModelKey && !compatibleKeys.has(reportAgentForm.fallbackModelKey)) reportAgentForm.fallbackModelKey = ''
}

function handleAgentTaskTypeChange() {
  reportAgentForm.modelParams = defaultAgentModelParams(reportAgentForm.taskType, reportAgentForm.modelParams)
  normalizeAgentModelSelection()
  syncSelectedAgentForm()
}

function handleAgentTypeChange() {
  reportAgentForm.taskType = taskTypeForAgentType(reportAgentForm.type)
  handleAgentTaskTypeChange()
}

function syncSelectedAgentForm() {
  const index = reportAgentState.agents.findIndex((agent) => agent.id === selectedAgentId.value)
  if (index < 0) return
  normalizeAgentModelSelection()
  // 用户端只有一个人设：在用的那个吃下全部页面，其余智能体只是备用，不绑任何流程。
  const primaryId = reportAgentState.activeAgentId || reportAgentState.agents[0]?.id || ''
  const nextBoundFlowKeys = primaryId === selectedAgentId.value
    ? agentFlows.value.map((flow) => flow.key)
    : []
  reportAgentState.agents[index] = {
    ...JSON.parse(JSON.stringify(reportAgentForm)),
    flowKey: nextBoundFlowKeys[0] || reportAgentForm.flowKey || defaultAgentFlowKey.value,
    boundFlowKeys: nextBoundFlowKeys,
    updatedAt: new Date().toISOString(),
  }
  syncAgentBindings()
}

// 绑定表只保留一个主人：所有流程统一指向「用户端在用」的智能体。
// 后端仍是按 flowKey 找人，所以这里必须写满，不能留空。
function syncAgentBindings() {
  const primaryId = reportAgentState.activeAgentId
    || enabledAgents.value[0]?.id
    || reportAgents.value[0]?.id
    || ''
  agentFlows.value.forEach((flow) => {
    agentBindings[flow.key] = primaryId
  })
}

function isPrimaryAgent(id) {
  if (!id) return false
  const primaryId = reportAgentState.activeAgentId
    || enabledAgents.value[0]?.id
    || reportAgents.value[0]?.id
    || ''
  return id === primaryId
}

const isPrimaryAgentForm = computed(() => isPrimaryAgent(selectedAgentId.value))

function setPrimaryAgent(id) {
  const agent = reportAgentState.agents.find((item) => item.id === id)
  if (!agent) return
  reportAgentState.activeAgentId = id
  if (agent.status !== 'enabled') agent.status = 'enabled'
  const allKeys = agentFlows.value.map((flow) => flow.key)
  reportAgentState.agents.forEach((item) => {
    item.boundFlowKeys = item.id === id ? allKeys.slice() : []
  })
  syncAgentBindings()
  if (agentView.value === 'edit') {
    reportAgentForm.status = 'enabled'
    reportAgentForm.boundFlowKeys = allKeys.slice()
    syncSelectedAgentForm()
  }
  ElMessage.success(`${agent.name || '该智能体'} 已设为用户端智能体，绘画、视频、3D、报告、课程都会用它。记得点「保存配置」。`)
}

function applyReportAgentConfig(config = {}) {
  reportAgentState.agents = (config.agents || []).map((agent) => defaultReportAgentDraft(agent))
  reportAgentState.bindings = { ...(config.bindings || {}) }
  reportAgentState.activeAgentId = config.activeAgentId || reportAgentState.agents[0]?.id || ''
  reportAgentState.flows = config.flows || agentFlows.value
  Object.keys(agentBindings).forEach((key) => delete agentBindings[key])
  // 老配置可能是 5 个智能体各管几条流程；用户端只有一个人设，这里统一收敛到一个主智能体。
  const primaryId = reportAgentState.activeAgentId
    || reportAgentState.bindings[agentFlows.value[0]?.key]
    || reportAgentState.agents[0]?.id
    || ''
  reportAgentState.activeAgentId = primaryId
  agentFlows.value.forEach((flow) => {
    agentBindings[flow.key] = primaryId
  })
  selectedAgentId.value = reportAgentState.activeAgentId || reportAgentState.agents[0]?.id || ''
  selectedAgentIds.value = []
  agentView.value = 'list'
  reportAgentState.agents.forEach((agent) => {
    agent.boundFlowKeys = boundFlowKeysForAgent(agent.id)
    agent.flowKey = agent.boundFlowKeys[0] || agent.flowKey || defaultAgentFlowKey.value
  })
  fillReportAgentForm(reportAgentState.agents.find((agent) => agent.id === selectedAgentId.value))
}

async function loadReportAgentConfig() {
  try {
    const response = await apiClient.get('/admin/report-agent-config')
    applyReportAgentConfig(response.data)
    agentStatus.value = '已读取后端报告智能体配置。'
  } catch (error) {
    agentStatus.value = error?.response?.data?.message || '报告智能体配置接口暂不可用'
  }
}

function selectAgent(id) {
  if (agentView.value === 'edit') syncSelectedAgentForm()
  selectedAgentId.value = id
  fillReportAgentForm(reportAgentState.agents.find((agent) => agent.id === id))
}

// —— 调用记录 ---------------------------------------------------------------
function openAgentLogView() {
  agentLogOpen.value = true
  loadAgentLogs()
}

function formatAgentLogTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (num) => String(num).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

async function loadAgentLogs() {
  if (agentLogLoading.value) return
  agentLogLoading.value = true
  try {
    const response = await apiClient.get('/admin/report-agent-config/logs', {
      params: {
        flowKey: agentLogFlowFilter.value || undefined,
        status: agentLogStatusFilter.value || 'all',
        limit: 200,
      },
    })
    agentLogs.value = Array.isArray(response.data?.logs) ? response.data.logs : []
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '读取调用记录失败')
    agentLogs.value = []
  } finally {
    agentLogLoading.value = false
  }
}

async function clearAgentLogs() {
  if (!agentLogs.value.length) return
  agentLogLoading.value = true
  try {
    await apiClient.post('/admin/report-agent-config/logs/clear')
    agentLogs.value = []
    ElMessage.success('调用记录已清空')
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '清空失败')
  } finally {
    agentLogLoading.value = false
  }
}

// —— 试跑 -------------------------------------------------------------------
// 只判断「它会怎么理解」，服务端不会触发出图/出视频，也不扣积分。
async function runAgentDryRun() {
  const text = dryRunText.value.trim()
  if (!text || dryRunLoading.value) return
  dryRunLoading.value = true
  dryRunError.value = ''
  dryRunResult.value = null
  try {
    const response = await apiClient.post('/admin/report-agent-config/preview', {
      text,
      agentId: selectedAgentId.value || '',
    })
    dryRunResult.value = response.data
  } catch (error) {
    dryRunError.value = error?.response?.data?.message || '试跑失败，请检查 API 配置里的文本模型'
  } finally {
    dryRunLoading.value = false
  }
}

function openAgentEditor(id) {
  selectAgent(id)
  agentView.value = 'edit'
}

function backToAgentList() {
  syncSelectedAgentForm()
  agentView.value = 'list'
}

function createReportAgent() {
  if (agentView.value === 'edit') syncSelectedAgentForm()
  const agent = defaultReportAgentDraft({
    flowKey: selectedFlowKey.value || defaultAgentFlowKey.value,
    boundFlowKeys: [selectedFlowKey.value || defaultAgentFlowKey.value],
  })
  reportAgentState.agents.unshift(agent)
  selectedAgentId.value = agent.id
  fillReportAgentForm(agent)
  agent.boundFlowKeys.forEach((key) => { agentBindings[key] = agent.id })
  selectedAgentIds.value = []
  agentView.value = 'edit'
  agentStatus.value = '已创建新智能体草稿，保存后生效。'
}

function copyAgent(id = selectedAgentId.value) {
  const source = reportAgentState.agents.find((agent) => agent.id === id)
  if (!source) return
  if (agentView.value === 'edit') syncSelectedAgentForm()
  const copy = defaultReportAgentDraft({
    ...source,
    id: `report-agent-${Date.now()}`,
    name: `${source.name} 副本`,
    flowKey: source.flowKey || defaultAgentFlowKey.value,
    boundFlowKeys: [],
    updatedAt: new Date().toISOString(),
  })
  reportAgentState.agents.unshift(copy)
  selectedAgentId.value = copy.id
  fillReportAgentForm(copy)
  selectedAgentIds.value = []
  agentView.value = 'edit'
  agentStatus.value = '已复制智能体，保存后生效。'
}

function copySelectedAgent() {
  copyAgent(selectedAgentId.value)
}

function removeAgents(ids = []) {
  const idSet = new Set(ids)
  const nextAgents = reportAgentState.agents.filter((agent) => !idSet.has(agent.id))
  if (!nextAgents.length) {
    ElMessage.warning('至少需要保留 1 个智能体。')
    return false
  }
  reportAgentState.agents = nextAgents
  const fallback = reportAgentState.agents.find((agent) => agent.status === 'enabled') || reportAgentState.agents[0]
  Object.keys(agentBindings).forEach((key) => {
    if (idSet.has(agentBindings[key])) agentBindings[key] = fallback.id
  })
  if (idSet.has(selectedAgentId.value)) {
    selectedAgentId.value = fallback.id
    fillReportAgentForm(fallback)
    agentView.value = 'list'
  }
  selectedAgentIds.value = selectedAgentIds.value.filter((id) => !idSet.has(id))
  return true
}

function deleteAgent(id = selectedAgentId.value) {
  const target = reportAgentState.agents.find((agent) => agent.id === id)
  if (!target || reportAgentState.agents.length <= 1) return
  const confirmed = window.confirm(`确认删除「${target.name}」？如果它已绑定流程，系统会自动切回默认智能体。`)
  if (!confirmed) return
  if (removeAgents([id])) agentStatus.value = '已删除智能体草稿，保存后生效。'
}

function deleteSelectedAgent() {
  deleteAgent(selectedAgentId.value)
}

function deleteCheckedAgents() {
  if (!selectedAgentIds.value.length) return
  const names = reportAgentState.agents
    .filter((agent) => selectedAgentIds.value.includes(agent.id))
    .map((agent) => agent.name)
    .join('、')
  const confirmed = window.confirm(`确认删除选中的 ${selectedAgentIds.value.length} 个智能体？${names ? `\n${names}` : ''}`)
  if (!confirmed) return
  if (removeAgents(selectedAgentIds.value)) agentStatus.value = '已批量删除智能体草稿，保存后生效。'
}

function toggleAllFilteredAgents(event) {
  const current = new Set(selectedAgentIds.value)
  filteredAgents.value.forEach((agent) => {
    if (event.target.checked) current.add(agent.id)
    else current.delete(agent.id)
  })
  selectedAgentIds.value = Array.from(current)
}

function insertAgentExample(type) {
  const examples = {
    outline: `你是一个项目资料整理与PPT大纲智能体。
你的任务：读取用户当前项目素材，先整理成项目文档，再生成适合 16:9 PPT 的页面大纲。
可读取素材：课程名称、课程说明、草图、线稿、AI迭代图、3D模型、AI视频、创作想法、讲师评语。
工作流程：
1. 先判断素材是否完整，梳理项目主题和创作过程。
2. 输出一份 projectDocument，包含项目目标、课堂问答、创作过程、提示词、最终作品说明和讲师评语位。
3. 按封面、课程理解、草图线稿、迭代流程、成品说明、AI点评、讲师评语、封底组织PPT大纲。
4. 每页只表达一个重点，正文写成短句，不写成长文。
输出格式：只输出 JSON，包含 reportTitle、projectDocument、outline、pages、materialSummary、warnings。
质量要求：不写空话，不编造不存在的素材；缺失素材时用已有课程和项目文本补齐。`,
    pptImage: `你是一个 Image2 PPT模板生成智能体。
你的任务：根据项目文档和PPT大纲，生成三版完整PPT页图风格方案，并为最终PPT输出每页完整页面图。
可读取素材：项目文档、PPT大纲、课程类型、用户最终作品图、草图/线稿/迭代图、当前模板偏好。
工作流程：
1. 先生成三版风格方向：清爽课堂版、作品集展示版、品牌设计版。
2. 每版都要说明适合场景、主色、字体气质、封面构图和内容页规则。
3. 用户确认风格后，为每一页生成一张 16:9 完整PPT页图，画面要像真正设计过的课堂项目报告。
4. 页图里可以包含标题、短句、作品图、装饰、页码和页脚，优先保证视觉完整。
输出格式：只输出 JSON，包含 styleOptions 和 pages。styleOptions 每项包含 id、name、desc、coverPreview；pages 每项包含 id、title、subtitle、body、generatedImage、imagePrompt。
质量要求：不伪造不存在的真实图片；如果 Image2 未启用，必须返回 image2Status=unavailable 和明确原因。`,
    paint: `你是一个 AI 绘画提示词优化智能体。
你的任务：把用户的口语化想法整理成适合图像生成模型使用的提示词。
可读取素材：用户输入、课程主题、草图描述、已选风格、画幅比例、清晰度。
工作流程：
1. 保留用户原始创意，不替换主题。
2. 补充主体、场景、构图、色彩、光影、材质和风格。
3. 给出正向提示词和必要的反向提示词。
输出格式：返回优化后的中文提示词、关键词标签、负面提示词和简短说明。
质量要求：语言清晰，适合少儿美术课堂，不加入危险、低俗或侵权内容。`,
    video: `你是一个 AI 视频分镜脚本智能体。
你的任务：根据用户作品和创意说明生成短视频分镜与运镜建议。
可读取素材：作品图、项目主题、角色设定、用户创作想法、视频时长、画面比例。
工作流程：
1. 先总结视频主题和视觉重点。
2. 拆分为开场、主体动作、细节特写、结尾展示。
3. 为每个镜头写出画面内容、镜头运动、时长和字幕建议。
输出格式：返回分镜列表、运镜参数建议、旁白或字幕草稿。
质量要求：镜头数量不要过多，适合课堂展示和作品分享。`,
  }
  reportAgentForm.masterPrompt = examples[type] || ''
  syncSelectedAgentForm()
}

function agentTypeLabel(type) {
  if (type === 'report') return '报告生成'
  if (type === 'report-outline') return '报告大纲'
  if (type === 'ppt-image') return 'PPT页图生成'
  if (type === 'custom') return '自定义任务'
  if (type === 'h5-first-person-report') return 'H5第一人称报告'
  return type || '自定义任务'
}

function agentStatusLabel(status) {
  return status === 'disabled' ? '已停用' : '启用中'
}

// 卡片上那行「这个智能体是干什么的」：优先人设摘要，没有再退到生成目标。
function agentRoleLine(agent = {}) {
  const raw = String(agent.persona || agent.reportGoal || agent.masterPrompt || '').replace(/\s+/g, ' ').trim()
  if (!raw) return '还没有填写人设，点开补一句「你是谁、负责什么」。'
  return raw.length > 96 ? `${raw.slice(0, 96)}…` : raw
}

function flowKeyForAgent(agentId) {
  return agentFlows.value.find((flow) => agentBindings[flow.key] === agentId)?.key || ''
}

function bindingLabels(agentId) {
  const labels = agentFlows.value
    .filter((flow) => agentBindings[flow.key] === agentId)
    .map((flow) => flow.label.replace('项目报告 / ', ''))
  return labels.length ? labels.join('、') : '-'
}

function formatAgentTime(value) {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleDateString()
  } catch {
    return '-'
  }
}

async function saveReportAgentConfig() {
  agentSaving.value = true
  try {
    if (agentView.value === 'edit') syncSelectedAgentForm()
    const fallback = reportAgentState.agents.find((agent) => agent.status === 'enabled') || reportAgentState.agents[0]
    const primaryId = reportAgentState.activeAgentId || selectedAgentId.value || fallback?.id || ''
    reportAgentState.activeAgentId = primaryId
    const primaryAgent = reportAgentState.agents.find((agent) => agent.id === primaryId)
    if (primaryAgent && primaryAgent.status !== 'enabled') primaryAgent.status = 'enabled'
    // 用户端只有一个智能体在干活，绑定表必须写满且全部指向它。
    const allFlowKeys = agentFlows.value.map((flow) => flow.key)
    reportAgentState.agents.forEach((agent) => {
      agent.boundFlowKeys = agent.id === primaryId ? allFlowKeys.slice() : []
      agent.flowKey = agent.boundFlowKeys[0] || agent.flowKey || defaultAgentFlowKey.value
    })
    syncAgentBindings()
    const payload = {
      agents: JSON.parse(JSON.stringify(reportAgentState.agents)),
      bindings: JSON.parse(JSON.stringify(agentBindings)),
      activeAgentId: primaryId,
    }
    const response = await apiClient.post('/admin/report-agent-config', payload)
    applyReportAgentConfig(response.data.config)
    const savedAgent = reportAgentState.agents.find((agent) => agent.id === payload.activeAgentId)
    agentStatus.value = `${savedAgent?.name || '当前智能体'} 已保存。绘画、视频、3D、报告、课程五个页面都会用它的人设。`
    ElMessage.success(agentStatus.value)
  } catch (error) {
    agentStatus.value = error?.response?.data?.message || '保存报告智能体配置失败'
    ElMessage.error(agentStatus.value)
  } finally {
    agentSaving.value = false
  }
}

async function resetReportAgentConfig() {
  agentSaving.value = true
  try {
    const response = await apiClient.post('/admin/report-agent-config/reset')
    applyReportAgentConfig(response.data.config)
    agentStatus.value = response.data.message || '报告智能体配置已恢复默认。'
    ElMessage.success(agentStatus.value)
  } catch (error) {
    agentStatus.value = error?.response?.data?.message || '恢复默认配置失败'
    ElMessage.error(agentStatus.value)
  } finally {
    agentSaving.value = false
  }
}

async function saveProviderConfig() {
  providerSaving.value = true
  try {
    if (!providerForm.key.trim()) {
      ElMessage.warning('请填写 API 标识')
      return
    }
    if (isHunyuan3dProvider.value && !providerForm.editions.rapid && !providerForm.editions.pro) {
      ElMessage.warning('腾讯混元3D至少需要启用极速版或专业版中的一个')
      return
    }
    if (isHunyuan3dProvider.value && providerForm.editions[providerForm.defaultEdition] === false) {
      providerForm.defaultEdition = providerForm.editions.rapid ? 'rapid' : 'pro'
    }
    if (!providerForm.label.trim()) {
      ElMessage.warning('请填写显示名称')
      return
    }
    const payload = {
      key: providerForm.key,
      label: providerForm.label,
      category: providerForm.category,
      capabilities: providerForm.capabilitiesText.split(',').map((item) => item.trim()).filter(Boolean),
      bindings: providerForm.bindingsText.split(',').map((item) => item.trim()).filter(Boolean),
      baseUrl: providerForm.baseUrl,
      textModel: providerForm.textModel,
      imageModel: providerForm.imageModel,
      videoModel: providerForm.videoModel,
      textModels: providerForm.textModels,
      imageModels: providerForm.imageModels,
      videoModels: providerForm.videoModels,
      models: providerForm.models,
      defaultModel: providerForm.defaultModel,
      apiKey: isHunyuan3dProvider.value ? '' : providerForm.apiKey,
      imageEdit: {
        protocol: providerForm.imageEditProtocol,
        models: providerForm.imageEditModelsText.split(/[\n,]/).map((item) => item.trim()).filter(Boolean),
        size: providerForm.imageEditSize,
      },
      secretId: isHunyuan3dProvider.value ? providerForm.secretId : '',
      secretKey: isHunyuan3dProvider.value ? providerForm.secretKey : '',
      region: isHunyuan3dProvider.value ? providerForm.region : '',
      endpoint: isHunyuan3dProvider.value ? providerForm.endpoint : '',
      enabled: providerForm.enabled,
      defaultEdition: providerForm.defaultEdition,
      editions: providerForm.editions,
      // 只有火山方舟会用到，其它平台服务端不存。
      imageWatermark: providerForm.imageWatermark,
      // 模型显示名：只存填了的，空的交给服务端自动起名
      modelLabels: Object.fromEntries(providerForm.models
        .map((model) => [model, String(providerForm.modelLabels?.[model] || '').trim()])
        .filter(([, label]) => label)),
      // 参考图能力：自动识别时传 { mode: 'auto' }，服务端清掉手动指定；手动时按选的方式保存。
      imageInput: isHunyuan3dProvider.value
        ? { mode: 'none' }
        : providerForm.imageInputAuto
          ? { mode: 'auto' }
          : providerForm.imageInputMode === 'none'
          ? { mode: 'none' }
          : providerForm.imageInputMode === 'edits'
            ? { mode: 'edits', maxImages: providerForm.imageInputMaxImages }
            : providerForm.imageInputMode === 'extra-body-image'
              ? { mode: 'extra-body-image', maxImages: providerForm.imageInputMaxImages }
              : { mode: 'body-field', field: providerForm.imageInputField || 'image', maxImages: providerForm.imageInputMaxImages },
      defaultProvider: providerConfig.defaultProvider || providerForm.key,
    }
    await apiClient.post('/admin/ai-providers', payload)
    const savedKey = providerForm.key.trim().toLowerCase()
    selectedProvider.value = savedKey
    creatingProvider.value = false
    await loadProviderConfig()
    if (isHunyuan3dProvider.value) {
      await selectProvider(savedKey)
      providerView.value = 'form'
      providerForm.secretId = ''
      providerForm.secretKey = ''
      ElMessage.success('腾讯混元3D配置已保存')
    } else {
      openProviderList()
      ElMessage.success('AI模型配置已保存')
    }
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '保存失败，请检查后端是否启动')
  } finally {
    providerSaving.value = false
  }
}

async function setDefaultProvider() {
  try {
    await apiClient.post('/admin/ai-providers/default', { provider: providerForm.key })
    await loadProviderConfig()
    ElMessage.success('已设为默认模型')
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '设置默认模型失败')
  }
}

async function testSelectedProvider() {
  apiTesting.value = true
  apiTestResult.value = null
  try {
    const response = await apiClient.post('/admin/ai-providers/test', {
      provider: providerForm.key,
      // 勾选后才做真实出图自检（会产生 1 次出图费用）。
      checkReferenceImage: Boolean(providerForm.checkReferenceImage) && !isHunyuan3dProvider.value,
    })
    apiTestResult.value = response.data
    if (response.data.ok) ElMessage.success(response.data.message)
    else ElMessage.warning(response.data.message)
  } catch (error) {
    apiTestResult.value = { ok: false, message: error?.response?.data?.message || '测试失败，请检查后端是否启动' }
    ElMessage.error(apiTestResult.value.message)
  } finally {
    apiTesting.value = false
  }
}

async function runAiConnectionTest() {
  apiTesting.value = true
  apiTestResult.value = null
  try {
    apiTestResult.value = await testAiConnection()
    if (apiTestResult.value.ok) ElMessage.success('AI接口连接正常')
    else ElMessage.warning(apiTestResult.value.message)
  } finally {
    apiTesting.value = false
  }
}

// ---------- 系统设置：只读的真实运行状态（替换原来写死的「MVP Mock 环境」） ----------
const systemStatus = reactive({ loading: false, loaded: false, health: null, ai: null, opsOpen: null, riskPending: null, error: '' })
const systemShortcuts = [
  { id: 'api', label: 'API 配置', desc: '模型平台、密钥、每个模型的开关' },
  { id: 'creditBilling', label: 'AI 用量与计费', desc: '每天免费次数、积分价格' },
  { id: 'risk', label: '账号安全', desc: '敏感词、拦截规则、封禁和登录锁定' },
  { id: 'accounts', label: '账号权限', desc: '账号、分部班级、邀请码、积分码' },
  { id: 'workbench', label: '工作台管理', desc: '工作台封面、背景和品牌 LOGO' },
  { id: 'ops', label: '异常管理', desc: '服务器错误和 AI 调用失败记录' },
]
const aiModeLabel = computed(() => ({ api: '真实接口', mock: '演示数据（不调用模型）', auto: '自动（后端可用时走真实接口）' }[aiMode] || aiMode || '—'))
const systemDefaultProviderLabel = computed(() => {
  const ai = systemStatus.ai
  if (!ai) return '—'
  return ai.providers?.[ai.defaultProvider]?.label || ai.defaultProvider || '未设置'
})
const systemUnconfiguredProviders = computed(() => Object.entries(systemStatus.ai?.providers || {})
  .filter(([key, item]) => key !== 'hunyuan3d' && !item.configured)
  .map(([key, item]) => item.label || key))
const systemOpsText = computed(() => {
  if (systemStatus.opsOpen === null) return '—'
  return systemStatus.opsOpen ? systemStatus.opsOpen + ' 条未解决' : '没有未解决'
})
async function loadSystemStatus() {
  if (systemStatus.loading) return
  systemStatus.loading = true
  systemStatus.error = ''
  const [health, ai, ops, risk] = await Promise.allSettled([
    apiClient.get('/health'),
    apiClient.get('/ai/health'),
    apiClient.get('/admin/ops/errors', { params: { status: 'open', page: 1, pageSize: 1 } }),
    apiClient.get('/admin/risk/overview'),
  ])
  systemStatus.health = health.status === 'fulfilled' ? health.value.data : { ok: false }
  systemStatus.ai = ai.status === 'fulfilled' ? ai.value.data : null
  systemStatus.opsOpen = ops.status === 'fulfilled' ? Number(ops.value.data?.stats?.open || 0) : null
  // 账号安全只给机构管理员看；分部管理员拿到 403 时这一行不显示。
  systemStatus.riskPending = risk.status === 'fulfilled' ? Number(risk.value.data?.pendingEvents || 0) : null
  if (health.status !== 'fulfilled') systemStatus.error = '连不上后端服务：' + (health.reason?.message || '请检查服务是否启动')
  systemStatus.loaded = true
  systemStatus.loading = false
}

async function logout() {
  if (activeNav.value === 'audit' && !await galleryAuditPanel.value?.confirmLeave()) return
  userStore.logout()
  router.push('/login')
}

/* ---------- 积分管理 ---------- */

function creditBalanceOf(account) {
  const value = accountCreditMap.value?.[account.id]
  return Number.isFinite(Number(value)) ? Number(value) : 0
}

function creditEntryTitle(entry) {
  const kindMap = {
    recharge: '充值入账',
    redeem: '积分码兑换',
    admin_adjust: '后台调整',
    consume: 'AI 创作消耗',
    refund: '失败退回',
    void: '积分码作废扣回',
  }
  return entry.reason || kindMap[entry.kind] || (entry.direction === 'out' ? '积分消耗' : '积分入账')
}

function formatCreditTime(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return '—'
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function creditCodeStatusLabel(status) {
  return { issued: '未使用', redeemed: '已兑换待核对', confirmed: '已核对收款', void: '已作废' }[status] || status
}

function creditExportUrl(type) {
  return adminExportCreditCodesUrl(type)
}

// ── AI 用量与计费：读取 / 保存 ──────────────────────────────────────
function abilityLabel(ability) {
  const hit = billingAbilities.value.find((item) => item.ability === ability)
  if (hit?.label) return hit.label
  return { image: '出图', video: '视频', model3d: '3D 模型', report_h5: 'H5 报告', ai_text: 'AI 文字' }[ability] || ability
}

// providerConfig 里的供应商 → 它能干哪几类活。这是「从 API 配置自动读模型」的唯一依据，
// 不写死任何模型名：后台换模型，这里跟着变。
function providerAbilityModels(provider) {
  const rows = []
  // models 是「来源列表」（数组 + 单值），要展开后再归一化：以前直接传整个列表，
  // 多个图像模型的数组会被 String() 拼成「a,b」一条假模型，第二个模型就没法单独定价。
  const push = (ability, models) => {
    for (const model of normalizeProviderModels(...models)) rows.push({ ability, model })
  }
  push('image', [provider.imageModels, provider.imageModel])
  push('video', [provider.videoModels, provider.videoModel])
  push('text', []) // 文本模型归到 ai_text，下面单独处理
  const textModels = normalizeProviderModels(provider.textModels, provider.textModel)
  for (const model of textModels) rows.push({ ability: 'ai_text', model })
  // 3D 供应商（混元）的模型挂在 models/defaultModel 上
  if ((provider.category || '') === 'model3d') {
    for (const model of normalizeProviderModels(provider.models, provider.defaultModel)) rows.push({ ability: 'model3d', model })
  }
  return rows.filter((row) => row.ability !== 'text')
}

/** 把「API 配置里已启用的模型」与「已保存的单独定价」合并成一张表。*/
function buildBillingModels() {
  const disabled = new Set()
  const rows = []
  const seen = new Set()
  const providers = providerConfig.providers || {}
  for (const provider of Object.values(providers)) {
    if (provider.enabled === false) continue
    const providerLabel = provider.label || provider.key
    for (const key of provider.disabledModels || []) disabled.add(`${provider.key}:${key}`)
    for (const item of providerAbilityModels(provider)) {
      const priceKey = `${item.ability}|${provider.key}|${item.model}`
      if (seen.has(priceKey)) continue
      seen.add(priceKey)
      const saved = billingRawModelPrices.value.find((price) => (
        price.ability === item.ability
        && String(price.provider || '') === String(provider.key || '')
        && String(price.model || '') === String(item.model || '')
      ))
      rows.push({
        key: priceKey,
        ability: item.ability,
        provider: provider.key,
        providerLabel,
        model: item.model,
        // null = 走能力默认价，输入框显示空
        credits: saved ? Number(saved.credits) : null,
        enabled: !disabled.has(`${provider.key}:${item.model}`),
      })
    }
  }
  // 已保存但当前供应商被停用/删掉的定价，也要列出来，否则用户看不到、改不掉
  for (const price of billingRawModelPrices.value) {
    const priceKey = `${price.ability}|${price.provider}|${price.model}`
    if (seen.has(priceKey)) continue
    seen.add(priceKey)
    rows.push({
      key: priceKey,
      ability: price.ability,
      provider: price.provider,
      providerLabel: providers?.[price.provider]?.label || price.provider || '（跨供应商）',
      model: price.model,
      credits: Number(price.credits),
      enabled: true,
      orphan: true,
    })
  }
  const order = { image: 10, video: 20, model3d: 30, report_h5: 40, ai_text: 50 }
  rows.sort((a, b) => (order[a.ability] || 99) - (order[b.ability] || 99)
    || String(a.provider).localeCompare(String(b.provider))
    || String(a.model).localeCompare(String(b.model)))
  billingModels.value = rows
}

async function loadCreditBillingModels() {
  billingModelsLoading.value = true
  try {
    // 拉最新的供应商配置（包含用户在「API 配置」里刚加的模型）
    const response = await apiClient.get('/admin/ai-providers')
    if (response.data?.providers) providerConfig.providers = response.data.providers
    buildBillingModels()
    billingNotice.value = billingModels.value.length
      ? `已读取 ${billingModels.value.length} 个模型，未填价的走上面那块默认价。`
      : ''
  } catch (error) {
    buildBillingModels()
    ElMessage.warning(error?.response?.data?.message || '模型列表读取失败，已按本地缓存显示')
  } finally {
    billingModelsLoading.value = false
  }
}

async function loadCreditBilling() {
  billingLoading.value = true
  billingError.value = ''
  try {
    const { data } = await apiClient.get('/admin/credit-prices')
    billingAbilities.value = (data.abilities || []).map((item) => ({
      ability: item.ability,
      label: item.label,
      unit: item.unit,
      credits: Number(item.credits || 0),
      dailyFree: Number(item.dailyFree || 0),
      enabled: item.status !== 'disabled',
    }))
    billingRawModelPrices.value = Array.isArray(data.modelPrices) ? data.modelPrices : []
    const messages = data.messages || {}
    for (const field of billingMessageFields) {
      billingMessages[field.key] = String(messages[field.key] ?? '')
      billingMessageDefaults[field.key] = String(messages[field.key] ?? '')
    }
    await loadCreditBillingModels()
    billingLoaded.value = true
  } catch (error) {
    billingError.value = error?.response?.data?.message || '计费设置读取失败，请确认后台服务已启动。'
  } finally {
    billingLoading.value = false
  }
}

async function saveCreditBilling() {
  if (billingSaving.value) return
  billingSaving.value = true
  billingError.value = ''
  billingNotice.value = ''
  try {
    const { data } = await apiClient.put('/admin/credit-prices', {
      abilities: billingAbilities.value.map((item) => ({
        ability: item.ability,
        credits: Number(item.credits || 0),
        dailyFree: Number(item.dailyFree || 0),
        status: item.enabled ? 'enabled' : 'disabled',
      })),
      // credits 传 null 让后端删掉这条单独定价 → 回到默认价
      modelPrices: billingModels.value.map((item) => ({
        ability: item.ability,
        provider: item.provider,
        model: item.model,
        credits: item.credits == null || item.credits === '' ? null : Number(item.credits),
        label: item.model,
      })),
    })
    billingRawModelPrices.value = Array.isArray(data.modelPrices) ? data.modelPrices : []
    buildBillingModels()
    billingNotice.value = '计费设置已保存，用户下次生成就按新价算。'
    ElMessage.success('计费设置已保存')
  } catch (error) {
    billingError.value = error?.response?.data?.message || '保存失败，请重试。'
    ElMessage.error(billingError.value)
  } finally {
    billingSaving.value = false
  }
}

function resetModelPrice(item) {
  item.credits = null
}

async function saveBillingMessages() {
  if (billingMessageSaving.value) return
  billingMessageSaving.value = true
  billingNotice.value = ''
  billingError.value = ''
  try {
    const payload = {}
    for (const field of billingMessageFields) payload[field.key] = String(billingMessages[field.key] ?? '')
    const { data } = await apiClient.put('/admin/credit-messages', { messages: payload })
    const messages = data.messages || {}
    for (const field of billingMessageFields) {
      billingMessages[field.key] = String(messages[field.key] ?? '')
      billingMessageDefaults[field.key] = String(messages[field.key] ?? '')
    }
    billingNotice.value = '提示文字已保存，用户端立刻生效。'
    ElMessage.success('提示文字已保存')
  } catch (error) {
    billingError.value = error?.response?.data?.message || '提示文字保存失败，请重试。'
    ElMessage.error(billingError.value)
  } finally {
    billingMessageSaving.value = false
  }
}

function resetBillingMessages() {
  // 只清空输入框，点了「保存提示文字」才真正写库 → 避免误触直接覆盖。
  for (const field of billingMessageFields) billingMessages[field.key] = ''
  billingNotice.value = '已清空所有提示文字，点「保存提示文字」后会恢复成系统默认文案。'
}

async function loadAccountCredits() {
  try {
    const result = await adminFetchCreditOverview()
    accountCreditMap.value = result?.credits || {}
  } catch (error) {
    accountCreditMap.value = {}
  }
}

async function openCreditDialog(account) {
  creditTarget.value = account
  creditDetail.balance = creditBalanceOf(account)
  creditDetail.entries = []
  creditAdjustForm.delta = 100
  creditAdjustForm.reason = ''
  showCreditDialog.value = true
  try {
    const detail = await adminFetchUserCredit(account.id)
    creditDetail.balance = Number(detail?.balance || 0)
    creditDetail.freeTotal = Number(detail?.freeTotal ?? 60)
    creditDetail.freeUsed = Number(detail?.freeUsed || 0)
    creditDetail.freeRemaining = Number(detail?.freeRemaining || 0)
    creditDetail.entries = Array.isArray(detail?.entries) ? detail.entries : []
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '读取积分信息失败')
  }
}

async function submitCreditAdjust() {
  const target = creditTarget.value
  if (!target) return
  const delta = Number(creditAdjustForm.delta)
  if (!Number.isInteger(delta) || delta === 0) {
    ElMessage.warning('请输入非 0 的整数积分')
    return
  }
  if (creditAdjustSubmitting.value) return
  creditAdjustSubmitting.value = true
  try {
    const result = await adminAdjustCredits({
      userId: target.id,
      delta,
      reason: creditAdjustForm.reason || (delta > 0 ? '后台加分' : '后台扣分'),
    })
    ElMessage.success(`已调整，当前余额 ${result?.balance ?? ''} 积分`)
    accountCreditMap.value = { ...accountCreditMap.value, [target.id]: Number(result?.balance || 0) }
    await openCreditDialog(target)
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '调整失败')
  } finally {
    creditAdjustSubmitting.value = false
  }
}

function openCreditCodePanel() {
  accountPanel.value = 'codes'
  loadCreditCodes()
}

async function loadCreditCodes() {
  creditCodeLoading.value = true
  try {
    const result = await adminFetchCreditCodes({ status: creditCodeStatusFilter.value })
    creditCodes.value = Array.isArray(result?.codes) ? result.codes : []
  } catch (error) {
    creditCodes.value = []
    ElMessage.error(error?.response?.data?.message || '读取积分码失败')
  } finally {
    creditCodeLoading.value = false
  }
}

async function submitGenerateCodes() {
  const faceValue = Number(codeDraft.faceValue)
  const quantity = Number(codeDraft.quantity)
  if (!Number.isInteger(faceValue) || faceValue <= 0) {
    ElMessage.warning('面额必须是大于 0 的整数')
    return
  }
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 500) {
    ElMessage.warning('数量需在 1–500 之间')
    return
  }
  if (creditCodeSubmitting.value) return
  creditCodeSubmitting.value = true
  try {
    const result = await adminGenerateCodes({
      faceValue,
      quantity,
      prefix: codeDraft.prefix || '',
      note: codeDraft.note || '',
      orderNo: codeDraft.orderNo || '',
      expiresInDays: codeDraft.expiresInDays === '' ? null : Number(codeDraft.expiresInDays),
    })
    const list = Array.isArray(result?.codes) ? result.codes : []
    const firstCode = typeof list[0] === 'string' ? list[0] : (list[0]?.code || '')
    ElMessage.success(`已生成 ${list.length} 个积分码`)
    if (list.length === 1 && firstCode && navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(firstCode)
        ElMessage.info(`积分码 ${firstCode} 已复制`)
      } catch (error) { /* 忽略剪贴板失败 */ }
    }
    codeDraft.note = ''
    codeDraft.orderNo = ''
    await loadCreditCodes()
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '生成失败')
  } finally {
    creditCodeSubmitting.value = false
  }
}

async function confirmCreditCode(item) {
  try {
    await adminConfirmCode(item.id)
    ElMessage.success('已标记为收到款')
    await loadCreditCodes()
  } catch (error) {
    ElMessage.error(error?.response?.data?.message || '操作失败')
  }
}

async function voidCreditCodeItem(item) {
  const used = item.status === 'redeemed'
  try {
    if (used) {
      await ElMessageBox.confirm(
        `该码已被兑换，作废会同时扣回 ${item.faceValue} 积分，确认继续？`,
        '作废积分码',
        { confirmButtonText: '作废并扣回', cancelButtonText: '取消', type: 'warning' },
      )
    } else {
      await ElMessageBox.confirm('确认作废该积分码？作废后无法再兑换。', '作废积分码', {
        confirmButtonText: '作废', cancelButtonText: '取消', type: 'warning',
      })
    }
    await adminVoidCode(item.id, used)
    ElMessage.success('已作废')
    await loadCreditCodes()
    await loadAccountCredits()
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error?.response?.data?.message || '操作失败')
  }
}

watch(activeNav, (value) => {
  if (value === 'accounts') loadAccountCredits()
  // 进面板才拉数据，省一次首屏请求
  if (value === 'creditBilling' && !billingLoaded.value) loadCreditBilling()
}, { immediate: true }) // 直接打开 / 刷新 ?module=creditBilling 时也要加载，否则计费表是空的
// 系统设置页：每次进来都重新检查一次（直接用 ?module=settings 打开时也要检查）。
watch(activeNav, (value) => { if (value === 'settings') loadSystemStatus() }, { immediate: true })
</script>

<style scoped lang="scss">
.panel,
.admin-summary article {
  background: #fff;
  border: 1px solid var(--adm-line);
  border-radius: var(--adm-radius-lg);
  box-shadow: var(--adm-shadow);
}
.panel-title h2 { margin: 0; color: var(--color-title); }
.panel p { margin: 6px 0 0; color: var(--color-text); line-height: 1.6; }
.content-stack { display: grid; gap: 22px; }
.admin-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.admin-summary article {
  padding: 20px;
  display: grid;
  gap: 6px;
}
.admin-summary span,
.admin-summary small,
.panel-title span,
.api-row small { color: var(--color-muted); }
.admin-summary strong {
  color: var(--color-primary);
  font-size: 32px;
}
.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(280px, .6fr);
  gap: 18px;
}
.panel {
  padding: 22px;
  min-height: 360px;
}
.panel-wide { min-height: 320px; }
.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}
.panel-title-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.panel-title button {
  border: 0;
  border-radius: 10px;
  min-height: 38px;
  padding: 0 16px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  cursor: pointer;
  font-weight: 600;
}
.table-like,
.api-list,
.log-list,
.settings-list { display: grid; gap: 12px; }
.api-test-card {
  margin-bottom: 14px;
  border: 1px solid #e7e3ff;
  border-radius: 10px;
  padding: 14px;
  background: #faf9ff;
  display: grid;
  gap: 8px;
}
.api-test-card.success {
  border-color: rgba(34,197,94,.35);
  background: #f0fdf4;
}
.api-test-card.error {
  border-color: rgba(249,115,22,.42);
  background: #fff7ed;
}
.api-test-card strong {
  color: var(--color-title);
}
.api-test-card p,
.api-test-card small {
  margin: 0;
  color: var(--color-muted);
}
.api-test-card button {
  width: fit-content;
  min-height: 42px;
  border: 0;
  border-radius: 10px;
  padding: 0 16px;
  background: var(--color-primary);
  color: #fff;
  cursor: pointer;
  font-weight: 700;
}
.api-test-card .api-config-card-btn {
  justify-self: start;
  background: #111827;
}
.api-test-card button:disabled {
  cursor: not-allowed;
  opacity: .55;
}
.api-button-row,
.provider-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.api-test-card .secondary,
.provider-actions .secondary {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.api-config-tabs {
  margin-top: 16px;
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
  display: flex;
  gap: 10px;
}
.api-config-tabs button,
.provider-list-actions button,
.provider-table-row button,
.provider-back-btn {
  min-height: 38px;
  border: 1px solid #cbd5e1;
  border-radius: 7px;
  padding: 0 14px;
  background: #fff;
  color: #475569;
  cursor: pointer;
  font-weight: 700;
}
.api-config-tabs button.active {
  border-color: var(--color-primary);
  background: #f4f2ff;
  color: var(--color-primary-hover);
}
.provider-list-panel,
.provider-form-panel {
  margin-top: 16px;
  display: grid;
  gap: 14px;
}
.provider-list-toolbar {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 14px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.provider-list-toolbar > div:first-child {
  display: grid;
  gap: 4px;
}
.provider-list-toolbar strong {
  color: var(--color-title);
}
.provider-list-toolbar small {
  color: var(--color-muted);
  font-size: 12px;
  line-height: 1.5;
}
.provider-list-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.provider-list-actions .danger,
.provider-table-row .danger {
  border-color: #fecaca;
  background: #fff;
  color: #dc2626;
}
/* 「新建API配置」：列表工具栏里唯一的主动作，用实心蓝把它和刷新/批量删除区分开 */
.provider-list-actions button.create {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}
.provider-list-actions button.create:hover {
  border-color: var(--color-primary-hover);
  background: var(--color-primary-hover);
}
.provider-list-actions button:disabled,
.provider-table-row button:disabled {
  cursor: not-allowed;
  opacity: .45;
}
.provider-table {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  overflow-x: auto;
}
.provider-table-head,
.provider-table-row {
  display: grid;
  /* 「前端启用模型」以前占 220~240px，但按钮里真正用到的字只有 ~120px，右边整段是空的；
     「类型」列给到 140px 也装不下长的参考图说明，会被挤成三行。这里一并收窄、加宽类型列。 */
  grid-template-columns: 76px minmax(148px, 1fr) 96px 150px 176px 172px;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  min-width: 860px;
}
.provider-table-head {
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  color: #475569;
  font-size: 13px;
  font-weight: 700;
}
.provider-table-head label,
.provider-table-row label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.provider-table-head input,
.provider-table-row input {
  width: 16px;
  height: 16px;
  min-height: 16px;
  padding: 0;
}
.provider-table-row {
  border-bottom: 1px solid #edf2f7;
  cursor: pointer;
  color: #64748b;
}
.provider-table-row:last-of-type {
  border-bottom: 0;
}
.provider-table-row:hover {
  background: #f8fafc;
}
.provider-table-row strong {
  color: var(--color-title);
  font-weight: 700;
}
.provider-table-row span {
  font-size: 13px;
}
.provider-table-row span.ready {
  width: fit-content;
  border-radius: 999px;
  padding: 4px 10px;
  background: #f4f2ff;
  color: var(--color-primary-hover);
  font-weight: 700;
}
.provider-table-row em {
  display: flex;
  gap: 8px;
  justify-content: flex-start;
  font-style: normal;
  white-space: nowrap;
}
/* 「编辑 / 删除」曾被列宽挤成竖排两行，按钮加 nowrap + 不缩 */
.provider-table-row em button {
  flex: 0 0 auto;
  white-space: nowrap;
}
.provider-model-picker { min-width: 0; }
.provider-model-picker-trigger { display: flex; align-items: center; gap: 6px; width: 100%; max-width: 168px; min-height: 38px; padding: 7px 10px; background: #fff; border: 1px solid #dbe2ea; border-radius: 10px; color: #334155; }
.provider-model-picker-trigger > span:first-child { white-space: nowrap; }
.provider-model-picker-trigger:hover { border-color: #94a3b8; background: #f8fafc; }
.provider-model-picker-trigger small { margin-left: auto; color: #64748b; font-size: 12px; white-space: nowrap; }
.provider-model-picker-arrow { color: #94a3b8; }
.provider-model-menu { color: #334155; font-size: 13px; }
.provider-model-menu-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid #eef2f6; }
.provider-model-menu-heading small { color: #94a3b8; font-size: 12px; }
.provider-model-menu-options { max-height: 280px; overflow-y: auto; padding: 6px; }
.provider-model-menu-option { display: flex; align-items: center; gap: 10px; min-height: 42px; padding: 8px 10px; border-radius: 8px; cursor: pointer; }
.provider-model-menu-option:hover { background: #f1f5f9; }
.provider-model-menu-option input { flex-shrink: 0; width: 16px; height: 16px; margin: 0; accent-color: var(--color-primary); cursor: pointer; }
.provider-model-menu-option span { min-width: 0; overflow-wrap: anywhere; }
.provider-model-menu-option small { margin-left: auto; flex-shrink: 0; color: #94a3b8; }
.provider-model-menu-hint { margin: 0; padding: 10px 16px; background: #f8fafc; border-top: 1px solid #eef2f6; color: #94a3b8; font-size: 12px; }
.provider-model-menu-empty { margin: 12px; color: #94a3b8; }
.provider-model-picker-trigger:focus-visible, .provider-model-menu-option input:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.provider-back-btn {
  width: fit-content;
}
.provider-layout {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.report-template-library.editing-template {
  height: 100vh;
  min-height: 0;
  border-radius: 0;
  padding: 0;
  overflow: hidden;
}
.ppt-template-editor {
  height: 100vh;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  background: #f6f7f9;
  display: grid;
  grid-template-rows: 116px minmax(0, 1fr);
  box-shadow: none;
}
.ppt-editor-topbar {
  min-height: 116px;
  padding: 0;
  border-bottom: 1px solid #e5e7eb;
  background: rgba(255,255,255,.96);
  display: grid;
  grid-template-rows: 56px 60px;
}
.ppt-editor-icon-dock {
  min-width: 0;
  padding: 0 18px;
  border-bottom: 1px solid #eef2f7;
  display: grid;
  grid-template-columns: minmax(320px, 1fr) auto minmax(240px, 1fr);
  align-items: center;
  gap: 16px;
}
.ppt-editor-icon-dock > strong {
  color: #52525b;
  font-size: 15px;
  letter-spacing: 0;
}
.ppt-round-tools,
.ppt-window-tools {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ppt-round-tools button {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  font-size: 15px;
  font-weight: 700;
  box-shadow: 0 7px 16px rgba(15,23,42,.12);
}
.ppt-round-tools .tool-home { background: #ff7058; }
.ppt-round-tools .tool-student { background: #f58fa1; }
.ppt-round-tools .tool-slide { background: #5aa0d6; }
.ppt-round-tools .tool-grid { background: #f2f4f7; color: #6b7280; }
.ppt-round-tools .tool-undo { background: #e0f2fe; color: #0e7490; }
.ppt-round-tools .tool-brand { background: #fbbf24; }
.ppt-round-tools .tool-assets { background: #93d27d; }
.ppt-round-tools .tool-text { background: #e879b7; }
.ppt-window-tools {
  justify-content: flex-end;
  color: #71717a;
  font-weight: 700;
}
.ppt-window-tools span {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
}
.ppt-editor-commandbar {
  min-width: 0;
  padding: 0 18px;
  display: grid;
  grid-template-columns: minmax(200px, .8fr) minmax(220px, 300px) minmax(136px, 160px) auto minmax(max-content, 1fr);
  gap: 12px;
  align-items: center;
}
.ppt-editor-brand,
.ppt-editor-actions {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}
.ppt-editor-brand button {
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  background: #ff7058;
  color: #fff;
  cursor: pointer;
  font-size: 18px;
  font-weight: 700;
}
.ppt-editor-brand strong {
  color: #111827;
  font-size: 16px;
}
.ppt-editor-brand span {
  min-width: 0;
  color: #64748b;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ppt-template-name-field,
.ppt-template-status-field {
  min-width: 0;
  height: 38px;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  background: #fff;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 0 12px;
}
.ppt-template-name-field span,
.ppt-template-status-field span {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
.ppt-template-name-field input,
.ppt-template-status-field select {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: #111827;
  font-size: 13px;
  font-weight: 600;
}
.ppt-template-subtitle {
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}
.ppt-editor-actions button,
.ppt-editor-toolbar button {
  min-height: 36px;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  padding: 0 14px;
  background: #fff;
  color: #475569;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}
.ppt-editor-actions {
  justify-content: flex-end;
}
.ppt-editor-actions .admin-primary-btn {
  border-color: var(--tpl-primary);
  background: var(--tpl-primary);
  color: #fff;
}
.ppt-editor-shell {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  display: grid;
  grid-template-columns: 238px minmax(620px, 1fr) 348px;
}
.ppt-page-rail {
  height: 100%;
  min-height: 0;
  border-right: 1px solid #e5e7eb;
  background: #fff;
  overflow-y: auto;
  display: grid;
  align-content: start;
  grid-auto-rows: max-content;
  gap: 10px;
  padding: 12px;
}
.ppt-rail-head {
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #111827;
  font-weight: 700;
}
.ppt-rail-head button {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  background: #f1f5f9;
  cursor: pointer;
  font-weight: 700;
}
.ppt-thumb-card {
  width: 100%;
  height: 84px;
  border: 2px solid transparent;
  border-radius: 10px;
  padding: 7px;
  background: #f8fafc;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  grid-template-rows: 54px 14px;
  gap: 5px 8px;
  align-items: center;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
}
.ppt-thumb-card.active {
  border-color: var(--tpl-primary);
  background: #fff;
  box-shadow: 0 8px 18px rgba(15,23,42,.1);
}
.ppt-thumb-card > span {
  color: #94a3b8;
  font-size: 12px;
  font-weight: 700;
}
.ppt-thumb-card i {
  position: relative;
  width: 100%;
  height: 54px;
  aspect-ratio: 16 / 9;
  border-radius: 5px;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(15,23,42,.1);
  background-color: #fff7ed;
}
.ppt-thumb-card b {
  position: absolute;
  border-radius: 2px;
  background: rgba(255,255,255,.78);
}
.ppt-thumb-card .thumb-slot-title { background: var(--tpl-primary); }
.ppt-thumb-card .thumb-slot-image { background: rgba(20,184,166,.72); }
.ppt-thumb-card strong {
  grid-column: 2;
  color: #334155;
  font-size: 12px;
  line-height: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ppt-editor-stage {
  height: 100%;
  min-height: 0;
  background:
    linear-gradient(90deg, rgba(226,232,240,.7) 1px, transparent 1px),
    linear-gradient(180deg, rgba(226,232,240,.7) 1px, transparent 1px),
    #f3f4f6;
  background-size: 28px 28px;
  display: grid;
  grid-template-rows: 48px minmax(0, 1fr) 38px;
}
.ppt-editor-toolbar {
  padding: 0 16px;
  border-bottom: 1px solid #dbe2ea;
  background: rgba(255,255,255,.92);
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
}
.ppt-editor-toolbar span {
  margin-left: auto;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}
.ppt-hidden-file-input {
  display: none;
}
.ppt-canvas-wrap {
  min-height: 0;
  padding: 24px 20px;
  display: grid;
  place-items: start center;
  overflow: auto;
  background:
    radial-gradient(circle at 50% 25%, rgba(255,255,255,.92), transparent 34%),
    rgba(15, 23, 42, .04);
}
.ppt-template-canvas {
  position: relative;
  width: min(98%, 1040px);
  aspect-ratio: 16 / 9;
  border: 1px solid rgba(245, 158, 11, .38);
  border-radius: 7px;
  background:
    linear-gradient(135deg, #fff1b8 0%, var(--tpl-bg) 36%, var(--tpl-soft) 100%),
    #fff;
  overflow: visible;
  box-shadow: 0 26px 60px rgba(15,23,42,.24);
}
.ppt-template-canvas::before {
  content: '';
  position: absolute;
  inset: 5.2%;
  z-index: 0;
  border-radius: 26px;
  background: rgba(255, 255, 246, .86);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.72);
  pointer-events: none;
}
.ppt-template-canvas.image-drag-over {
  box-shadow: 0 0 0 4px rgba(20,184,166,.22), 0 26px 60px rgba(15,23,42,.24);
}
.ppt-template-canvas.image-drag-over::after {
  content: '松开图片：拖到图片框会替换，拖到空白处会新建图片框';
  position: absolute;
  left: 50%;
  bottom: 18px;
  z-index: 20;
  transform: translateX(-50%);
  border-radius: 999px;
  padding: 8px 14px;
  background: rgba(15, 118, 110, .92);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  pointer-events: none;
  white-space: nowrap;
}
.ppt-canvas-kids-decor {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}
.decor-logo {
  position: absolute;
  left: 7.7%;
  top: 8.4%;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: #fbbf24;
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 950;
  box-shadow: inset 0 0 0 4px rgba(255,255,255,.6);
}
.decor-spark {
  position: absolute;
  width: 14px;
  height: 14px;
  background: #fbbf24;
  transform: rotate(45deg);
  border-radius: 4px;
}
.spark-a { left: 38%; top: 18%; }
.spark-b { right: 15%; top: 20%; }
.decor-cloud {
  position: absolute;
  right: 9%;
  top: 12%;
  width: 58px;
  height: 28px;
  border-radius: 999px;
  background: #d6cffd;
}
.decor-cloud::before,
.decor-cloud::after {
  content: '';
  position: absolute;
  bottom: 7px;
  border-radius: 50%;
  background: #d6cffd;
}
.decor-cloud::before {
  left: 8px;
  width: 28px;
  height: 28px;
}
.decor-cloud::after {
  right: 8px;
  width: 34px;
  height: 34px;
}
.decor-mascot {
  position: absolute;
  left: 12%;
  top: 38%;
  width: 135px;
  height: 140px;
}
.decor-mascot::before {
  content: '';
  position: absolute;
  left: 17px;
  top: 12px;
  width: 90px;
  height: 78px;
  border-radius: 45% 45% 50% 50%;
  background: #ffd7bc;
  box-shadow:
    -18px -2px 0 #7c2d12,
    56px -5px 0 #7c2d12,
    13px -22px 0 #7c2d12,
    30px 58px 0 -16px #fb7185,
    62px 58px 0 -16px #fb7185;
}
.decor-mascot i {
  position: absolute;
  left: 32px;
  top: 45px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #7c2d12;
  box-shadow: 40px 0 0 #7c2d12;
}
.decor-mascot b {
  position: absolute;
  left: 52px;
  top: 62px;
  width: 23px;
  height: 12px;
  border-radius: 0 0 999px 999px;
  background: #f97316;
}
.decor-mascot em {
  position: absolute;
  left: 40px;
  bottom: 0;
  width: 62px;
  height: 58px;
  border-radius: 18px 18px 8px 8px;
  background: #60a5fa;
  box-shadow: 0 28px 0 -13px #fbbf24;
}
.ppt-canvas-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: .48;
  border-radius: inherit;
  pointer-events: none;
}
.ppt-canvas-bg.active {
  opacity: .64;
}
.ppt-canvas-bg.locked {
  opacity: .58;
}
.ppt-canvas-background-hitarea {
  position: absolute;
  inset: 0;
  z-index: 2;
  border: 2px solid transparent;
  border-radius: inherit;
  padding: 0;
  background: transparent;
  cursor: pointer;
}
.ppt-canvas-background-hitarea.active {
  border-color: var(--color-primary);
  box-shadow: inset 0 0 0 3px rgba(37, 99, 235, .16);
}
.ppt-background-badge {
  position: absolute;
  left: 18px;
  top: 18px;
  z-index: 42;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  border: 1px solid rgba(15, 23, 42, .12);
  border-radius: 10px;
  background: rgba(255, 255, 255, .92);
  color: #0f172a;
  font-size: 11px;
  font-weight: 700;
  box-shadow: 0 10px 24px rgba(15, 23, 42, .12);
}
.ppt-background-badge.locked {
  border-color: rgba(245, 158, 11, .45);
  background: rgba(255, 251, 235, .94);
}
.ppt-background-badge button {
  border: 0;
  border-radius: 8px;
  padding: 4px 6px;
  background: #e2e8f0;
  color: #334155;
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
}
.ppt-background-badge button:disabled {
  cursor: not-allowed;
  opacity: .46;
}
.ppt-canvas-accent {
  position: absolute;
  left: 7%;
  top: 8%;
  width: 30px;
  height: 30px;
  z-index: 1;
  border-radius: 50%;
  background: rgba(255, 255, 255, .38);
  box-shadow: none;
}
.ppt-canvas-page-no {
  position: absolute;
  right: 5%;
  bottom: 4%;
  z-index: 5;
  color: var(--tpl-muted);
  font-size: 12px;
  font-weight: 700;
}
.ppt-canvas-slot {
  position: absolute;
  z-index: 4;
  border: 1px dashed rgba(37, 99, 235, .38);
  border-radius: 18px;
  padding: 12px 14px;
  display: grid;
  align-content: center;
  text-align: left;
  overflow: visible;
  cursor: grab;
  box-shadow: 0 12px 26px rgba(15,23,42,.11);
  outline: 1px solid rgba(255,255,255,.64);
  white-space: pre-line;
  user-select: none;
  touch-action: none;
}
.ppt-canvas-slot:hover {
  border-color: rgba(37, 99, 235, .72);
}
.ppt-canvas-slot.dragging {
  cursor: grabbing;
  opacity: .92;
  z-index: 8;
}
.ppt-canvas-slot.locked {
  cursor: default;
  border-style: solid;
  border-color: rgba(245, 158, 11, .72);
}
.ppt-canvas-slot.locked::before {
  content: '锁定';
  position: absolute;
  right: 8px;
  top: 8px;
  z-index: 5;
  border-radius: 999px;
  padding: 3px 7px;
  background: rgba(245, 158, 11, .92);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}
.template-slot-dragging,
.template-slot-dragging *,
.template-slot-resizing,
.template-slot-resizing * {
  cursor: grabbing !important;
}
.ppt-canvas-slot.slot-image {
  padding: 10px;
}
.ppt-canvas-slot.active {
  border: 2px solid var(--color-primary);
  box-shadow: 0 0 0 4px rgba(37,99,235,.14), 0 12px 30px rgba(15,23,42,.16);
}
.ppt-slot-quickbar {
  position: absolute;
  left: 50%;
  z-index: 70;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: min(560px, 86vw);
  padding: 4px;
  border: 1px solid rgba(15, 23, 42, .12);
  border-radius: 10px;
  background: rgba(255,255,255,.96);
  box-shadow: 0 14px 32px rgba(15,23,42,.18);
  transform: translate(-50%, calc(-100% - 10px));
  white-space: nowrap;
}
.ppt-slot-quickbar > strong {
  padding: 0 6px;
  color: #334155;
  font-size: 11px;
}
.ppt-slot-quickbar button {
  border: 0;
  border-radius: 8px;
  padding: 5px 7px;
  background: #eef2ff;
  color: #1e3a8a;
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}
.ppt-slot-quickbar button:hover {
  background: #e7e3ff;
}
.ppt-slot-quickbar button.danger {
  background: #fee2e2;
  color: #b91c1c;
}
.ppt-slot-quickbar button:disabled {
  cursor: not-allowed;
  opacity: .45;
}
.ppt-background-quickbar {
  left: 50%;
  top: 14px;
  transform: translate(-50%, calc(-100% - 10px));
}
.ppt-slot-resize-handle {
  position: absolute;
  z-index: 65;
  width: 8px;
  height: 8px;
  min-width: 8px;
  min-height: 8px;
  padding: 0;
  border: 1px solid #fff;
  border-radius: 2px;
  background: var(--color-primary);
  box-shadow: 0 0 0 1px rgba(37, 99, 235, .45);
  box-sizing: border-box;
  appearance: none;
}
.handle-nw { left: -5px; top: -5px; cursor: nwse-resize; }
.handle-n { left: 50%; top: -5px; transform: translateX(-50%); cursor: ns-resize; }
.handle-ne { right: -5px; top: -5px; cursor: nesw-resize; }
.handle-e { right: -5px; top: 50%; transform: translateY(-50%); cursor: ew-resize; }
.handle-se { right: -5px; bottom: -5px; cursor: nwse-resize; }
.handle-s { left: 50%; bottom: -5px; transform: translateX(-50%); cursor: ns-resize; }
.handle-sw { left: -5px; bottom: -5px; cursor: nesw-resize; }
.handle-w { left: -5px; top: 50%; transform: translateY(-50%); cursor: ew-resize; }
.ppt-canvas-slot strong,
.ppt-canvas-slot span {
  min-width: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
}
.ppt-canvas-slot strong {
  line-height: 1.12;
  color: var(--tpl-title);
  font-weight: 700;
}
.ppt-canvas-slot span {
  line-height: 1.45;
}
.ppt-canvas-slot.slot-title {
  border-color: transparent;
  background: transparent !important;
  box-shadow: none;
  text-align: center;
  overflow: visible;
}
.ppt-canvas-slot.slot-decor {
  border-color: transparent;
  border-radius: 4px;
  padding: 0;
  background: transparent !important;
  box-shadow: none;
  outline: 0;
}
.ppt-canvas-slot.slot-decor:hover,
.ppt-canvas-slot.slot-decor.active {
  border-color: var(--color-primary);
}
.slot-decor-sample {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
  pointer-events: none;
}
.ppt-canvas-slot.slot-title strong {
  color: #f97316;
  text-shadow:
    1px 0 0 #3b82f6,
    0 2px 0 rgba(255,255,255,.9);
}
.ppt-canvas-slot.slot-title strong::first-letter {
  color: #3b82f6;
}
.ppt-canvas-slot.slot-body::before {
  content: '◆';
  position: absolute;
  left: 14px;
  top: 12px;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: var(--tpl-primary);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 12px;
  box-shadow: 0 7px 14px rgba(15,23,42,.14);
}
.ppt-canvas-slot.slot-body > span {
  padding-left: 44px;
  color: inherit;
}
.ppt-canvas-slot.slot-body {
  color: #92400e;
}
.ppt-canvas-slot.slot-body[style*="FFFFFF"] {
  text-align: center;
}
.slot-image-sample {
  width: 100%;
  height: 100%;
  border-radius: 14px;
  background:
    linear-gradient(135deg, rgba(255,255,255,.88), rgba(255,255,255,.54)),
    #fff;
  color: var(--tpl-primary);
  display: grid !important;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-auto-rows: 1fr;
  gap: 6px;
  padding: 22px 8px 8px;
  position: relative;
  font-weight: 700;
  box-shadow: inset 0 0 0 2px rgba(96, 165, 250, .25);
}
.slot-image-sample.has-image {
  display: block !important;
  padding: 0;
  background: #fff;
  box-shadow: inset 0 0 0 2px rgba(20,184,166,.2);
}
.slot-image-sample.has-image img {
  width: 100%;
  height: 100%;
  border-radius: 12px;
  display: block;
  object-fit: cover;
}
.slot-image-sample.drag-over {
  box-shadow: inset 0 0 0 3px #14b8a6, 0 0 0 5px rgba(20,184,166,.2);
}
.slot-image-sample em {
  position: absolute;
  inset: 0;
  border-radius: 14px;
  background: rgba(15, 118, 110, .82);
  color: #fff;
  display: grid;
  place-items: center;
  padding: 10px;
  text-align: center;
  font-size: 12px;
  font-style: normal;
  line-height: 1.35;
  z-index: 3;
}
.slot-image-sample::before {
  content: '课程网格';
  position: absolute;
  left: 10px;
  right: 10px;
  top: 4px;
  color: #64748b;
  text-align: center;
  font-size: 10px;
}
.slot-image-sample.has-image::before {
  content: none;
}
.slot-image-sample i {
  border-radius: 5px;
  background:
    linear-gradient(135deg, rgba(14,165,233,.45), rgba(249,115,22,.32)),
    #e7e3ff;
  box-shadow: inset 0 0 0 1px rgba(15,23,42,.08);
}
.slot-image-sample strong {
  position: absolute;
  opacity: 0;
}
.slot-image-uploader {
  border: 1px dashed #bae6fd;
  border-radius: 10px;
  padding: 10px;
  background: #faf9ff;
  display: grid;
  gap: 8px;
}
.slot-image-uploader input[type='file'] {
  display: none;
}
.slot-image-uploader button {
  width: 100%;
}
.slot-image-uploader span {
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}
.ppt-editor-footer {
  padding: 0 16px;
  border-top: 1px solid #dbe2ea;
  background: rgba(255,255,255,.9);
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 18px;
  font-size: 12px;
  font-weight: 700;
}
.ppt-inspector {
  height: 100%;
  min-height: 0;
  border-left: 1px solid #e5e7eb;
  background: #fff;
  overflow-y: auto;
  display: grid;
  align-content: start;
}
.inspector-block {
  padding: 16px;
  border-bottom: 1px solid #eef2f7;
  display: grid;
  gap: 12px;
}
.inspector-block.collapsed {
  gap: 0;
}
.inspector-block.collapsed > :not(.inspector-title) {
  display: none;
}
.inspector-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.inspector-title-actions {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}
.inspector-title strong,
.inspector-block > strong {
  color: #111827;
  font-size: 15px;
}
.inspector-title span {
  color: #94a3b8;
  font-size: 12px;
  font-weight: 700;
}
.inspector-title button,
.muted-action {
  min-height: 32px;
  border: 1px solid #e5e7eb;
  border-radius: 7px;
  background: #f8fafc;
  color: #64748b;
  cursor: pointer;
  font-weight: 700;
}
.inspector-title-actions button {
  min-width: 28px;
  padding: 0 7px;
}
.inspector-title-actions button:disabled {
  cursor: not-allowed;
  opacity: .38;
}
.inspector-tool-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.inspector-tool-grid button {
  min-height: 42px;
  border: 1px solid #edf0f5;
  border-radius: 10px;
  background: #fff;
  color: #64748b;
  cursor: pointer;
  font-size: 16px;
  font-weight: 700;
  box-shadow: 0 7px 14px rgba(15,23,42,.04);
}
.inspector-material-box {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 12px;
  background: #f8fafc;
  display: grid;
  gap: 5px;
}
.inspector-material-box strong {
  color: #111827;
  font-size: 13px;
}
.inspector-material-box span {
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}
.background-drop-zone {
  border-style: dashed;
  cursor: copy;
}
.background-drop-zone.active {
  border-color: #14b8a6;
  background: #ecfdf5;
}
.background-drop-zone.locked {
  cursor: not-allowed;
  border-color: #f59e0b;
  background: #fffbeb;
}
.background-control-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.background-control-grid label {
  grid-column: 1 / -1;
}
.muted-action:disabled {
  cursor: not-allowed;
  opacity: .48;
}
.inspector-block label {
  min-width: 0;
  display: grid;
  gap: 6px;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
}
.inspector-block input,
.inspector-block select,
.inspector-block textarea {
  width: 100%;
  min-height: 38px;
  border: 1px solid #e5e7eb;
  border-radius: 7px;
  padding: 0 10px;
  background: #f8fafc;
  color: #111827;
  outline: none;
}
.inspector-block textarea {
  min-height: 74px;
  padding: 9px 10px;
  resize: vertical;
}
.inspector-mini-grid,
.inspector-metric-grid,
.inspector-color-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.inspector-metric-grid input {
  text-align: center;
}
.ppt-text-tools {
  display: grid;
  gap: 10px;
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}
.ppt-text-button-row {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
}
.ppt-text-button-row button {
  width: 100%;
  height: 32px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  color: #334155;
  cursor: pointer;
  font-weight: 700;
}
.ppt-text-button-row button.active {
  border-color: var(--color-primary);
  background: #e7e3ff;
  color: var(--color-primary-hover);
}
.ppt-editor-toolbar button:disabled {
  cursor: not-allowed;
  opacity: .45;
}
.inspector-color-grid label {
  grid-template-columns: minmax(0, 1fr) 34px;
  align-items: center;
}
.inspector-color-grid span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.inspector-color-grid input[type="color"] {
  width: 34px;
  min-height: 34px;
  padding: 2px;
}
.file-action {
  min-height: 40px;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  padding: 10px;
  background: #f8fafc;
  cursor: pointer;
}
.file-action input {
  display: none;
}
.inspector-block.empty {
  color: #64748b;
  background: #f8fafc;
}
.inspector-block.empty p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.5;
}
.provider-list {
  display: grid;
  gap: 10px;
}
.provider-list button {
  min-height: 92px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 12px;
  background: #f8fafc;
  display: grid;
  gap: 5px;
  text-align: left;
  cursor: pointer;
}
.provider-list button.active {
  border-color: var(--color-primary);
  background: #fff7ed;
  box-shadow: inset 4px 0 0 var(--color-primary);
}
.provider-list .draft-provider-card {
  border-style: dashed;
}
.provider-list .draft-provider-card span {
  background: #ffedd5;
  color: var(--color-primary);
}
.provider-list strong,
.provider-form label {
  color: var(--color-title);
  font-weight: 700;
}
.provider-list small {
  color: var(--color-muted);
}
.provider-capability-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.provider-capability-tags em {
  border-radius: 999px;
  padding: 3px 8px;
  background: #eef2ff;
  color: #3730a3;
  font-size: 12px;
  font-style: normal;
  font-weight: 700;
}
.provider-list span {
  width: fit-content;
  border-radius: 999px;
  padding: 4px 9px;
  background: #e5e7eb;
  color: #6b7280;
  font-size: 12px;
  font-weight: 700;
}
.provider-list span.ready {
  background: #dcfce7;
  color: #15803d;
}
.provider-hint {
  display: block;
  margin-top: 6px;
  color: var(--color-muted);
  font-size: 12px;
  font-weight: 700;
}
/* API 配置列表里的「参考图能力」角标：让上游图能否进模型一眼可见，而不是藏在代码里。 */
.provider-image-input-tag {
  display: block;
  max-width: 100%;
  overflow: hidden;
  margin-top: 4px;
  color: var(--color-muted);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.provider-reference-settings .provider-switch-row {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}
.provider-form {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 16px;
  background: #fff;
  display: grid;
  gap: 12px;
}
.hunyuan-config-page {
  display: grid;
  gap: 16px;
  color: #1f2937;
}
.hunyuan-config-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}
.hunyuan-config-head h3,
.hunyuan-config-head p,
.hunyuan-config-section h4,
.hunyuan-config-summary h4 {
  margin: 0;
}
.hunyuan-config-head h3 {
  color: var(--color-title);
  font-size: 24px;
  letter-spacing: -.02em;
}
.hunyuan-config-head p {
  margin-top: 7px;
  color: var(--color-muted);
  font-size: 14px;
}
.hunyuan-config-actions {
  display: flex;
  gap: 10px;
  flex: 0 0 auto;
}
.hunyuan-config-actions button {
  min-height: 42px;
  border: 0;
  border-radius: 9px;
  padding: 0 17px;
  background: var(--color-primary);
  color: #fff;
  cursor: pointer;
  font-weight: 700;
}
.hunyuan-config-actions button.secondary {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
}
.hunyuan-config-actions button:disabled { cursor: not-allowed; opacity: .55; }
.hunyuan-status-strip {
  display: grid;
  grid-template-columns: 1.25fr repeat(4, 1fr);
  align-items: center;
  min-height: 86px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
}
.hunyuan-status-strip > * {
  min-width: 0;
  padding: 0 20px;
  border-right: 1px solid #e2e8f0;
  color: #334155;
  font-weight: 600;
}
.hunyuan-status-strip > *:last-child { border-right: 0; }
.hunyuan-status-strip span { display: grid; gap: 6px; }
.hunyuan-status-strip small { color: #94a3b8; font-size: 12px; font-weight: 700; }
.status-dot { display: inline-block; width: 10px; height: 10px; margin-right: 9px; border-radius: 50%; background: #10b981; }
.status-dot.pending { background: #f59e0b; }
.hunyuan-config-layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; align-items: start; }
.hunyuan-config-main { display: grid; gap: 14px; }
.hunyuan-config-section,
.hunyuan-config-summary {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 18px 22px;
  background: #fff;
}
.hunyuan-config-section h4,
.hunyuan-config-summary h4 { padding-bottom: 13px; border-bottom: 1px solid #e2e8f0; color: var(--color-title); font-size: 16px; }
.hunyuan-enable-row,
.hunyuan-edition-row,
.hunyuan-permission-row,
.hunyuan-secret-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.hunyuan-enable-row { padding: 17px 0; }
.hunyuan-enable-row > div,
.hunyuan-permission-row > span:first-child { display: grid; gap: 5px; }
.hunyuan-enable-row small,
.hunyuan-permission-row small,
.hunyuan-edition-row small { color: #94a3b8; font-size: 12px; font-weight: 600; }
.hunyuan-switch { display: inline-flex; align-items: center; flex: 0 0 auto; cursor: pointer; }
.hunyuan-switch input { position: absolute; opacity: 0; pointer-events: none; }
.hunyuan-switch span { position: relative; width: 44px; height: 24px; border-radius: 999px; background: #cbd5e1; transition: .18s ease; }
.hunyuan-switch span::after { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; content: ''; box-shadow: 0 1px 2px rgba(15,23,42,.2); transition: .18s ease; }
.hunyuan-switch input:checked + span { background: var(--color-primary); }
.hunyuan-switch input:checked + span::after { transform: translateX(20px); }
.hunyuan-field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.hunyuan-field-grid label { display: grid; gap: 7px; color: #475569; font-size: 13px; font-weight: 600; }
.hunyuan-field-grid input,
.hunyuan-field-grid select { min-height: 42px; border: 1px solid #dbe3ee; border-radius: 10px; padding: 0 12px; background: #f8fafc; color: #334155; font: inherit; }
.hunyuan-edition-row { min-height: 60px; border-bottom: 1px solid #e2e8f0; }
.hunyuan-edition-row strong { min-width: 122px; }
.hunyuan-edition-row small { margin-right: auto; }
.hunyuan-segmented { display: inline-grid; grid-template-columns: 1fr 1fr; width: 236px; overflow: hidden; border: 1px solid #d8dee8; border-radius: 7px; background: #fff; }
.hunyuan-segmented button { min-height: 34px; border: 0; border-right: 1px solid #d8dee8; background: #fff; color: #475569; cursor: pointer; font-weight: 600; }
.hunyuan-segmented button:last-child { border-right: 0; }
.hunyuan-segmented button.active { background: #fff2e8; color: var(--color-primary); box-shadow: inset 0 0 0 1px var(--color-primary); }
.hunyuan-segmented button:disabled { cursor: not-allowed; opacity: .45; }
.hunyuan-permission-row { min-height: 59px; border-bottom: 1px solid #e2e8f0; cursor: pointer; }
.hunyuan-permission-row:last-child { border-bottom: 0; }
.hunyuan-advanced,
.hunyuan-model-details { margin-top: 14px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; }
.hunyuan-advanced summary,
.hunyuan-model-details summary { display: flex; align-items: center; justify-content: space-between; min-height: 46px; padding: 0 14px; cursor: pointer; color: #334155; font-weight: 600; }
.hunyuan-advanced summary small,
.hunyuan-model-details summary small { color: #94a3b8; font-size: 12px; font-weight: 600; }
.hunyuan-advanced p { margin: 0; padding: 0 14px 14px; color: #64748b; font-size: 13px; line-height: 1.6; }
.hunyuan-model-details .provider-model-add-row,
.hunyuan-model-details .provider-model-list { margin: 0 14px 14px; }
.hunyuan-secret-section { padding-bottom: 10px; }
.hunyuan-secret-tip { margin: 14px 0 4px; border-radius: 7px; padding: 10px 12px; background: #fff7ed; color: #9a5a13; font-size: 13px; }
.hunyuan-secret-row { min-height: 42px; border-bottom: 1px solid #e2e8f0; }
.hunyuan-secret-row:last-child { border-bottom: 0; }
.hunyuan-secret-row span { color: #059669; font-size: 13px; font-weight: 600; }
.hunyuan-config-summary { position: sticky; top: 16px; }
.hunyuan-config-summary dl { margin: 4px 0 16px; }
.hunyuan-config-summary dl > div { display: flex; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid #e2e8f0; }
.hunyuan-config-summary dt { color: #64748b; }
.hunyuan-config-summary dd { margin: 0; color: #334155; text-align: right; font-weight: 600; }
.hunyuan-config-summary dd:not(.disabled) { color: var(--color-primary); }
.hunyuan-config-summary dd.disabled { color: #dc2626; }
.hunyuan-student-note { display: grid; gap: 9px; border: 1px solid #fed7aa; border-radius: 10px; padding: 14px; background: #fffaf5; color: #7c4a10; font-size: 13px; }
.hunyuan-student-note strong { color: var(--color-primary); }
.hunyuan-config-summary > small { display: block; margin-top: 16px; color: #94a3b8; font-size: 12px; }
.provider-capability-field {
  display: grid;
  gap: 8px;
}
.provider-capability-field > strong {
  color: var(--color-title);
  font-weight: 700;
}
.provider-capability-options {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.provider-capability-options label {
  min-height: 42px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #f8fafc;
  cursor: pointer;
}
.provider-capability-options input {
  min-height: auto;
  width: 16px;
  height: 16px;
  padding: 0;
}
.provider-draft-banner {
  display: grid;
  gap: 4px;
  border: 1px solid #fed7aa;
  border-radius: 10px;
  padding: 12px;
  background: #fff7ed;
  color: var(--color-title);
}
.provider-draft-banner span {
  color: var(--color-muted);
  font-size: 13px;
}
.panel-title-actions .secondary.active {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: #fff7ed;
}
.provider-form label {
  display: grid;
  gap: 7px;
}
.provider-form input,
.provider-form select {
  min-height: 46px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0 12px;
  background: #f9fafb;
  color: var(--color-text);
}
.provider-form .provider-capability-options label {
  display: inline-flex;
  gap: 8px;
}
.provider-form .provider-capability-options input {
  min-height: auto;
  width: 16px;
  height: 16px;
  padding: 0;
}
.provider-model-manager {
  border: 1px solid #e7e3ff;
  border-radius: 10px;
  padding: 12px;
  background: #faf9ff;
  display: grid;
  gap: 10px;
}
.provider-model-manager-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.provider-model-manager-head > div {
  display: grid;
  gap: 4px;
}
.provider-model-manager-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.provider-model-manager-head small,
.provider-empty-models {
  margin: 0;
  color: var(--color-muted);
  font-size: 12px;
  line-height: 1.5;
}
.provider-model-manager button,
.provider-model-add-row button,
.provider-upstream-row button,
.provider-model-list button {
  min-height: 38px;
  border: 0;
  border-radius: 10px;
  padding: 0 12px;
  background: var(--color-primary);
  color: #fff;
  cursor: pointer;
  font-weight: 700;
}
.provider-model-manager button.secondary,
.provider-model-list button.secondary {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.provider-model-manager button:disabled,
.provider-model-list button:disabled {
  cursor: not-allowed;
  opacity: .55;
}
.provider-model-add-row,
.provider-upstream-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}
.provider-model-add-row input,
.provider-upstream-row select {
  min-width: 0;
  min-height: 40px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0 10px;
  background: #fff;
  color: var(--color-text);
}
.provider-model-list {
  display: grid;
  gap: 8px;
}
.provider-model-list article {
  min-width: 0;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px;
  background: #fff;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto auto;
  gap: 8px;
  align-items: center;
}
.provider-model-list select.provider-model-kind {
  min-height: 34px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0 6px;
  background: #fff;
  color: var(--color-text);
  font-size: 13px;
}
.provider-model-list .provider-model-note {
  grid-column: 1 / -1;
  color: #b45309;
  font-size: 12px;
}
.provider-model-list article.active {
  border-color: #fbbf24;
  background: #fffbeb;
}
.provider-model-list code {
  min-width: 0;
  overflow: hidden;
  color: #334155;
  font-family: Consolas, monospace;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.provider-model-list span {
  border-radius: 999px;
  padding: 4px 8px;
  background: #fef3c7;
  color: #92400e;
  font-size: 12px;
  font-weight: 700;
}
.provider-model-list button.danger {
  background: #fff1f2;
  color: #be123c;
}
.provider-actions button {
  min-height: 46px;
  border: 0;
  border-radius: 10px;
  padding: 0 16px;
  background: var(--color-primary);
  color: #fff;
  cursor: pointer;
  font-weight: 700;
}
.agent-config-panel {
  background: linear-gradient(135deg, #faf9ff 0%, #eef4fb 100%);
  box-shadow: none;
  min-height: 640px;
}
.agent-subnav {
  display: flex;
  gap: 8px;
  margin: -4px 0 18px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e5e7eb;
}
.agent-subnav button {
  min-height: 38px;
  border: 1px solid #dbe3ee;
  border-radius: 10px;
  padding: 0 14px;
  background: #fff;
  color: #64748b;
  cursor: pointer;
  font-weight: 700;
}
.agent-subnav button.active {
  border-color: #5b55d9;
  background: #f0efff;
  color: #5148c8;
}

/* —— 流程按页面分组 —— */
/* —— 智能体列表：卡片式 —— */
.agent-card-list { display: grid; gap: 12px; }
.agent-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 16px 18px;
  border: 1px solid #e6ebf5;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 2px 10px rgba(38, 75, 125, .04);
  cursor: pointer;
  transition: border-color .16s, box-shadow .16s;
}
.agent-card:hover { border-color: #c7d2fe; box-shadow: 0 8px 22px rgba(81, 72, 200, .10); }
.agent-card.primary { border-color: #c7d2fe; border-left: 4px solid #5b55d9; background: linear-gradient(90deg, #f7f6ff, #fff 42%); }
.agent-card.off { background: #fafbfd; }
.agent-card-main { min-width: 0; display: grid; gap: 8px; }
.agent-card-name { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.agent-card-name h3 { margin: 0; color: #10254c; font-size: 16px; font-weight: 700; line-height: 1.4; overflow-wrap: anywhere; }
.agent-card-badge {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 3px 9px;
  background: #f1f4f8;
  color: #697a94;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  line-height: 1.6;
}
.agent-card-badge.on { background: #e8f8ee; color: #169655; }
.agent-card-badge.off { background: #fff0ed; color: #d75a3f; }
.agent-card-role {
  margin: 0;
  color: #5b6b83;
  font-size: 13px;
  line-height: 1.65;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.agent-card-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: #8494a8; font-size: 12px; }
.agent-card-meta span { display: inline-flex; align-items: center; }
.agent-card-meta span + span::before { content: '·'; margin-right: 8px; color: #c3ccda; font-weight: 700; }
.agent-card-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.agent-card-actions button {
  min-height: 0;
  padding: 6px 12px;
  border: 1px solid #dfe6f2;
  border-radius: 10px;
  background: #fff;
  color: #3d4d66;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.agent-card-actions button:hover { border-color: #b9c4dc; }
.agent-card-actions button.secondary { background: #f7f9fd; color: #4b5c78; }
.agent-card-actions button.danger { border-color: #f6d5cf; background: #fff6f4; color: #d75a3f; }
.agent-card-actions button:disabled { opacity: .5; cursor: not-allowed; }
@media (max-width: 900px) {
  .agent-card { grid-template-columns: minmax(0, 1fr); }
  .agent-card-actions { justify-content: flex-start; }
}

/* —— 用户端智能体：一个在岗，其余备用 —— */
.agent-primary-hint {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 4px 14px;
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-left: 4px solid #cbd5e1;
  border-radius: 12px;
  background: #f8fafc;
}
.agent-primary-hint.on { border-color: #c7d2fe; border-left-color: #5b55d9; background: #f5f4ff; }
.agent-primary-hint strong { grid-column: 1; color: #1f2937; font-size: 14px; }
.agent-primary-hint.on strong { color: #4338ca; }
.agent-primary-hint small { grid-column: 1; color: #64748b; font-size: 12px; line-height: 1.5; font-weight: 600; }
.agent-primary-hint button { grid-column: 2; grid-row: 1 / span 2; align-self: center; }

.agent-flow-grouped { grid-column: 1 / -1; display: grid; gap: 10px; }
.agent-flow-grouped-head { display: grid; gap: 3px; }
.agent-flow-grouped-head strong { color: #1f2937; }
.agent-flow-grouped-head small { color: #64748b; font-weight: 600; }
.agent-flow-group-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 10px;
  align-items: start;
}
.agent-flow-group-card {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px 12px;
  padding: 12px;
  border: 1px solid #e4e9f2;
  border-radius: 10px;
  background: #fff;
  align-content: start;
}
.agent-flow-group-card header {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 7px;
  margin-bottom: 4px;
  border-bottom: 1px dashed #e8edf5;
}
.agent-flow-group-card header > div { flex: 1 1 auto; min-width: 0; display: grid; gap: 1px; }
.agent-flow-group-card header strong { color: #1f2937; font-size: 13px; }
.agent-flow-group-card header small { color: #94a3b8; font-size: 11px; font-weight: 600; }
.agent-flow-group-card header em {
  flex: 0 0 auto;
  font-style: normal;
  font-size: 11px;
  font-weight: 700;
  color: #4f46e5;
  background: #eef2ff;
  border-radius: 999px;
  padding: 1px 7px;
}
.agent-flow-group-icon {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: #f0efff;
  color: #5148c8;
  font-size: 12px;
  font-weight: 700;
}
.agent-flow-item {
  display: flex !important;
  align-items: flex-start !important;
  gap: 8px !important;
  grid-column: auto !important;
  padding: 5px 6px;
  border-radius: 7px;
  cursor: pointer;
  font-weight: 600 !important;
  color: #334155 !important;
}
.agent-flow-item:hover { background: #f6f8fc; }
.agent-flow-item input {
  width: 16px;
  height: 16px;
  min-height: 16px;
  margin-top: 2px;
  flex: 0 0 auto;
}
.agent-flow-item > span { display: grid; gap: 1px; min-width: 0; }
.agent-flow-item b { font-size: 12px; font-weight: 600; color: #1f2937; }
.agent-flow-item small { font-size: 10px; color: #a3aec0; font-weight: 600; overflow-wrap: anywhere; }

/* —— 试跑 —— */
.agent-dry-run {
  display: grid;
  gap: 10px;
  margin-top: 16px;
  padding: 16px;
  border: 1px solid #dbe3ee;
  border-radius: 12px;
  background: linear-gradient(135deg, #fbfcff, #f4f7fd);
}
.agent-dry-run-head { display: flex; align-items: flex-start; gap: 14px; }
.agent-dry-run-head > div { flex: 1 1 auto; min-width: 0; }
.agent-dry-run-head h3 { margin: 0 0 4px; font-size: 15px; color: #1f2937; }
.agent-dry-run-head p { margin: 0; color: #64748b; font-size: 12px; line-height: 1.6; }
.agent-dry-run-head p b { color: #b45309; }
.agent-dry-run-head .agent-create-btn { flex: 0 0 auto; }
.agent-dry-run-input {
  width: 100%;
  box-sizing: border-box;
  min-height: 62px;
  padding: 10px 12px;
  border: 1px solid #dbe3ee;
  border-radius: 9px;
  background: #fff;
  color: #1f2937;
  font: inherit;
  line-height: 1.55;
  resize: vertical;
}
.agent-dry-run-samples { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.agent-dry-run-samples span { color: #94a3b8; font-size: 11px; font-weight: 600; }
.agent-dry-run-samples button {
  min-height: 0;
  padding: 4px 9px;
  border: 1px solid #dbe3ee;
  border-radius: 999px;
  background: #fff;
  color: #475569;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.agent-dry-run-samples button:hover { border-color: #b9b3f0; color: #4f46e5; }
.agent-dry-run-error { margin: 0; color: #dc2626; font-size: 12px; font-weight: 700; }
.agent-dry-run-result {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid #e4e9f2;
}
.agent-dry-run-badges { display: flex; flex-wrap: wrap; gap: 6px; }
.agent-dry-run-badges em {
  font-style: normal;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
}
.agent-dry-run-badges em.intent { background: #eef2ff; color: #4338ca; }
.agent-dry-run-badges em.go { background: #e9f8ef; color: #0f9d58; }
.agent-dry-run-badges em.ask { background: #fff7e6; color: #b45309; }
.agent-dry-run-reason { margin: 0; color: #475569; font-size: 12.5px; line-height: 1.6; }
.agent-dry-run-block { display: grid; gap: 5px; padding-top: 9px; border-top: 1px dashed #e8edf5; }
.agent-dry-run-block strong { color: #1f2937; font-size: 12.5px; }
.agent-dry-run-block p { margin: 0; color: #334155; font-size: 12.5px; line-height: 1.7; }
.agent-dry-run-block ul { margin: 0; padding-left: 16px; display: grid; gap: 4px; }
.agent-dry-run-block li { color: #334155; font-size: 12.5px; line-height: 1.6; }
.agent-dry-run-block li em {
  font-style: normal;
  margin-right: 6px;
  padding: 1px 6px;
  border-radius: 5px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 11px;
  font-weight: 600;
}
.agent-dry-run-block li small { display: block; color: #94a3b8; font-size: 11px; }
.agent-dry-run-block.warn strong { color: #b45309; }

/* —— 调用记录 —— */
.agent-log-page { display: grid; gap: 12px; }
.agent-log-actions { display: flex; gap: 8px; }
.agent-log-actions button {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid #dbe3ee;
  border-radius: 10px;
  background: #fff;
  color: #475569;
  font-weight: 600;
  cursor: pointer;
}
.agent-log-actions button.danger { color: #dc2626; border-color: #fecaca; background: #fff7f7; }
.agent-log-actions button:disabled { opacity: .5; cursor: not-allowed; }
.agent-log-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid #e4e9f2;
  border-radius: 10px;
  background: #fff;
}
.agent-log-filters label { display: grid; gap: 5px; color: #334155; font-weight: 700; font-size: 12px; }
.agent-log-filters select {
  min-height: 34px;
  box-sizing: border-box;
  padding: 0 10px;
  border: 1px solid #dbe3ee;
  border-radius: 10px;
  background: #fff;
  color: #1f2937;
  font: inherit;
}
.agent-log-count { margin-left: auto; color: #94a3b8; font-size: 11px; font-weight: 700; }
.agent-log-table { border: 1px solid #e4e9f2; border-radius: 10px; background: #fff; overflow: hidden; }
.agent-log-head,
.agent-log-row {
  display: grid;
  grid-template-columns: 96px minmax(0, 1.1fr) minmax(0, .8fr) minmax(0, .9fr) 70px minmax(0, 1.4fr);
  gap: 10px;
  align-items: start;
  padding: 9px 14px;
}
.agent-log-head {
  background: #f6f8fc;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  border-bottom: 1px solid #e8edf5;
}
.agent-log-row { border-bottom: 1px solid #f1f5f9; font-size: 12px; color: #334155; }
.agent-log-row:last-child { border-bottom: 0; }
.agent-log-row.error { background: #fffafa; }
.agent-log-row > span { min-width: 0; overflow-wrap: anywhere; }
.agent-log-row b { display: block; font-weight: 600; color: #1f2937; }
.agent-log-row small { display: block; color: #94a3b8; font-size: 10.5px; }
.agent-log-row em {
  font-style: normal;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 999px;
  background: #e9f8ef;
  color: #0f9d58;
}
.agent-log-row em.error { background: #fee2e2; color: #dc2626; }
.agent-log-error { color: #dc2626 !important; margin-top: 3px; }
@media (max-width: 900px) {
  .agent-log-head { display: none; }
  .agent-log-row { grid-template-columns: 1fr; gap: 4px; }
  .agent-log-count { margin-left: 0; }
}
.agent-advanced-config-page { max-width: 980px; }
.agent-advanced-intro { margin: -4px 0 18px; color: #64748b; line-height: 1.6; }
.agent-advanced-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding: 18px;
  border: 1px solid #e7e3ff;
  border-radius: 14px;
  background: #faf9ff;
}
.agent-advanced-form label { display: grid; gap: 7px; color: #334155; font-weight: 700; }
.agent-advanced-form input,
.agent-advanced-form textarea { box-sizing: border-box; width: 100%; min-height: 40px; border: 1px solid #dbe3ee; border-radius: 10px; padding: 9px 11px; background: #fff; color: #1f2937; font: inherit; }
.agent-advanced-form textarea { min-height: 86px; resize: vertical; line-height: 1.5; }
.agent-advanced-form .agent-advanced-textarea { min-height: 170px; }
.agent-advanced-form label:nth-of-type(2),
.agent-advanced-form label:nth-of-type(8),
.agent-advanced-form label:nth-of-type(9) { grid-column: 1 / -1; }
.agent-advanced-switch { display: flex !important; grid-column: auto !important; align-items: center; gap: 8px; min-height: 40px; }
.agent-advanced-switch input { width: 17px; min-height: 17px; }
.agent-status-line { margin: 14px 0 0; color: #64748b; font-size: 13px; }
.canvas-agent-config-page { max-width: 1120px; }
.canvas-agent-form select { box-sizing: border-box; width: 100%; min-height: 40px; border: 1px solid #dbe3ee; border-radius: 10px; padding: 0 11px; background: #fff; color: #1f2937; font: inherit; }
.canvas-agent-capabilities { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding: 14px; border: 1px solid #e4e9f2; border-radius: 10px; background: #f8fafc; }
.canvas-agent-capabilities > strong { grid-column: 1 / -1; color: #1f2937; }
.canvas-agent-capabilities .agent-advanced-switch { display: flex; align-items: center; gap: 7px; font-weight: 700; }
@media (max-width: 760px) { .agent-advanced-form { grid-template-columns: 1fr; } .agent-advanced-form label:nth-of-type(2), .agent-advanced-form label:nth-of-type(8), .agent-advanced-form label:nth-of-type(9) { grid-column: auto; } }
.agent-page-head,
.agent-editor-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.agent-title-line {
  display: flex;
  align-items: center;
  gap: 14px;
}
.agent-title-line h2,
.agent-editor-top h2 {
  margin: 0;
  color: var(--color-title);
}
.agent-back-btn,
.agent-back-list {
  border: 0;
  background: transparent;
  color: #1f2937;
  cursor: pointer;
  font-weight: 700;
}
.agent-back-btn {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  font-size: 30px;
  line-height: 1;
}
.agent-back-btn:hover,
.agent-back-list:hover {
  background: #eef2ff;
}
.agent-create-btn,
.agent-editor-top > button:last-child {
  min-height: 42px;
  border: 0;
  border-radius: 10px;
  padding: 0 18px;
  background: #5b55d9;
  color: #fff;
  cursor: pointer;
  font-weight: 700;
  box-shadow: 0 8px 18px rgba(91,85,217,.22);
}
.agent-filter-card {
  width: min(100%, 880px);
  margin-bottom: 18px;
  border: 1px solid #e8edf5;
  border-radius: 10px;
  padding: 10px;
  background: rgba(255,255,255,.92);
  display: grid;
  grid-template-columns: minmax(280px, 1.5fr) 130px 130px auto minmax(120px, 1fr);
  gap: 10px;
  box-shadow: 0 12px 34px rgba(15,23,42,.08);
}
.agent-filter-card input,
.agent-filter-card select,
.agent-editor-top select,
.agent-basic-grid input,
.agent-basic-grid select,
.agent-config-panel textarea {
  min-height: 40px;
  border: 1px solid #e5e7eb;
  border-radius: 7px;
  padding: 0 12px;
  background: #fff;
  color: var(--color-text);
  outline: none;
}
.agent-search {
  min-width: 0;
}
.agent-search input {
  width: 100%;
}
.agent-bulk-delete {
  min-height: 40px;
  border: 1px solid #e5e7eb;
  border-radius: 7px;
  background: #fff;
  color: #64748b;
  cursor: pointer;
  font-weight: 700;
}
.agent-bulk-delete:disabled {
  opacity: .55;
  cursor: not-allowed;
}
.agent-empty {
  padding: 42px 20px;
  text-align: center;
  color: var(--color-muted);
}
.agent-editor-page {
  border-radius: 16px;
  padding: 18px;
  background: rgba(255,255,255,.96);
  box-shadow: 0 18px 42px rgba(15,23,42,.12);
}
.agent-editor-top {
  margin-bottom: 18px;
  padding-bottom: 16px;
  border-bottom: 1px solid #edf1f7;
}
.agent-editor-top > div {
  min-width: 0;
  flex: 1;
}
.agent-editor-top small {
  display: block;
  margin-bottom: 4px;
  color: var(--color-muted);
  font-weight: 700;
}
.agent-editor-top label {
  display: grid;
  gap: 6px;
  color: var(--color-muted);
  font-size: 12px;
  font-weight: 700;
}
.agent-back-list {
  min-height: 40px;
  border-radius: 10px;
  padding: 0 12px;
}
.agent-basic-grid,
.agent-config-grid,
.difficulty-agent-grid {
  display: grid;
  gap: 12px;
}
.agent-basic-grid {
  grid-template-columns: minmax(0, 1fr) 150px minmax(210px, .8fr) 150px;
  margin-bottom: 12px;
}
.agent-flow-picker {
  grid-column: 1 / -1;
}
.agent-flow-options {
  min-height: 96px;
  max-height: 210px;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
}
.agent-flow-options label {
  min-width: 0;
  min-height: 38px;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid #f1f5f9;
  border-radius: 7px;
  background: #f8fafc;
  color: #334155;
  font-size: 12px;
  font-weight: 600;
}
.agent-flow-options input {
  width: 16px;
  height: 16px;
}
.agent-flow-options span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agent-flow-picker small {
  color: var(--color-muted);
  font-size: 12px;
}
.agent-model-panel {
  margin-top: 14px;
  border: 1px solid #fde68a;
  border-radius: 14px;
  padding: 16px;
  background: #fffbeb;
}
.agent-model-head {
  margin-bottom: 12px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
.agent-model-head h3 {
  margin: 0;
  color: var(--color-title);
}
.agent-model-head p {
  margin: 6px 0 0;
  color: #92400e;
  line-height: 1.55;
}
.agent-model-head span {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 6px 10px;
  background: #fff7ed;
  color: #b45309;
  font-size: 12px;
  font-weight: 700;
}
.agent-model-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.agent-model-grid label,
.agent-model-picker {
  min-width: 0;
  display: grid;
  gap: 8px;
  color: var(--color-title);
  font-weight: 700;
}
.agent-model-picker {
  margin-top: 12px;
}
.agent-model-select {
  display: block;
  margin-top: 8px;
}
.agent-model-select select {
  width: 100%;
  min-height: 42px;
  border: 1px solid #fed7aa;
  border-radius: 10px;
  padding: 0 12px;
  background: #fff;
  color: #334155;
  font-size: 13px;
}
.agent-model-picker p {
  margin: 0;
  color: #92400e;
  font-size: 13px;
  line-height: 1.5;
}
.agent-master-prompt {
  margin-top: 14px;
  border: 1px solid #e7e3ff;
  border-radius: 14px;
  padding: 16px;
  background: #faf9ff;
}
.agent-prompt-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 12px;
}
.agent-prompt-head h3 {
  margin: 0;
  color: var(--color-title);
}
.agent-prompt-head p {
  margin: 6px 0 0;
  color: var(--color-muted);
  line-height: 1.55;
}
.agent-example-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.agent-example-actions button {
  min-height: 34px;
  border: 1px solid #d6cffd;
  border-radius: 10px;
  padding: 0 10px;
  background: #fff;
  color: var(--color-primary);
  cursor: pointer;
  font-weight: 700;
}
.agent-example-actions .agent-prompt-expand {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}
.agent-config-panel .agent-master-textarea {
  width: 100%;
  min-height: 220px;
  font-size: 14px;
  transition: min-height .2s ease;
}
.agent-config-panel .agent-master-textarea.expanded {
  min-height: clamp(520px, 70vh, 900px);
}
.agent-advanced-panel {
  margin-top: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
}
.agent-advanced-panel summary {
  min-height: 46px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  color: var(--color-title);
  cursor: pointer;
  font-weight: 700;
}
.agent-advanced-panel[open] {
  padding-bottom: 14px;
}
.agent-advanced-panel[open] summary {
  margin-bottom: 12px;
  border-bottom: 1px solid #eef2f7;
}
.agent-advanced-panel .agent-config-grid,
.agent-advanced-panel .difficulty-agent-grid {
  padding: 0 14px;
}
.agent-config-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.difficulty-agent-grid {
  margin-top: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.agent-basic-grid label,
.agent-config-grid label,
.difficulty-agent-grid label {
  min-width: 0;
  display: grid;
  gap: 8px;
  color: var(--color-title);
  font-weight: 700;
}
.agent-config-panel textarea {
  min-height: 116px;
  padding: 10px 12px;
  line-height: 1.55;
  resize: vertical;
}
.agent-actions {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.agent-actions button {
  min-height: 46px;
  border: 0;
  border-radius: 10px;
  padding: 0 16px;
  background: var(--color-primary);
  color: #fff;
  cursor: pointer;
  font-weight: 700;
}
.agent-actions .secondary {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.agent-actions button:disabled {
  opacity: .55;
  cursor: not-allowed;
}
.agent-actions small {
  color: var(--color-muted);
  font-weight: 600;
}
@media (max-width: 1280px) {
  .agent-filter-card {
    width: 100%;
    grid-template-columns: minmax(220px, 1fr) 130px 160px 120px;
  }
  .agent-filter-card select:nth-of-type(4),
  .agent-bulk-delete {
    grid-column: span 2;
  }
}
@media (max-width: 980px) {
  .agent-filter-card,
  .agent-basic-grid,
  .agent-flow-options,
  .agent-model-grid,
  .agent-model-options,
  .agent-config-grid,
  .difficulty-agent-grid {
    grid-template-columns: 1fr;
  }
  .agent-filter-card select:nth-of-type(4),
  .agent-bulk-delete {
    grid-column: auto;
  }
  .agent-editor-top {
    align-items: stretch;
    flex-direction: column;
  }
}
@media (max-width: 720px) {
  .organization-setup-grid,
  .organization-form,
  .enrollment-form,
  .organization-filter-row {
    grid-template-columns: 1fr;
  }
  .organization-list article,
  .enrollment-code-list article {
    grid-template-columns: 1fr;
  }
  .organization-list em,
  .enrollment-code-list em {
    justify-self: start;
  }
}
.api-config-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(15,23,42,.42);
  display: grid;
  place-items: center;
  padding: 24px;
}
.api-config-dialog {
  width: min(560px, 92vw);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 24px 80px rgba(15,23,42,.24);
  padding: 20px;
  display: grid;
  gap: 14px;
}
.api-config-dialog header,
.dialog-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.api-config-dialog header button,
.dialog-actions button {
  min-height: 44px;
  border: 0;
  border-radius: 10px;
  padding: 0 16px;
  background: var(--color-primary);
  color: #fff;
  cursor: pointer;
  font-weight: 700;
}
.dialog-actions .secondary,
.api-config-dialog header button {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.env-box {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 12px;
  background: #f8fafc;
  display: grid;
  gap: 8px;
}
.env-box code {
  border-radius: 8px;
  padding: 8px 10px;
  background: #111827;
  color: #fff;
  font-family: Consolas, monospace;
}
.table-head,
.row,
.api-row,
.log-row {
  min-height: 64px;
  border-radius: 10px;
  background: #f7f9fc;
  padding: 12px 16px;
  display: grid;
  align-items: center;
  gap: 14px;
}
.table-head,
.row { grid-template-columns: 1fr 140px 140px 120px; }
.table-head {
  min-height: 48px;
  color: var(--color-muted);
  font-weight: 700;
}
.api-row { grid-template-columns: 1fr auto; }
.log-row { grid-template-columns: 1fr auto; }
.row strong,
.api-row strong,
.log-row strong,
.course-card strong { color: var(--color-title); }
.row span,
.api-row span,
.log-row span { color: var(--color-muted); }
.row em,
.course-card small {
  font-style: normal;
  color: var(--color-primary);
  font-weight: 700;
}
.course-grid,
.audit-rules {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}
.course-card,
.audit-rules article {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 16px;
  display: grid;
  gap: 8px;
}
.course-card > span,
.audit-box strong {
  color: var(--color-primary);
  font-weight: 700;
}
.audit-box {
  border-radius: 10px;
  background: var(--color-primary-soft);
  padding: 20px;
  margin-bottom: 16px;
}
.audit-rules span { color: var(--color-muted); }
.audit-rules strong { color: var(--color-title); }
.audit-mode-badge {
  min-height: 32px;
  padding: 0 10px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  background: #fff7ed;
  color: #c2410c;
  font-size: 12px;
  font-weight: 700;
}
.audit-mode-badge.is-server {
  background: #ecfdf5;
  color: #047857;
}
.panel-title .audit-rules-button {
  min-height: 36px;
  margin-left: auto;
  padding: 0 16px;
  border: 1px solid var(--color-primary);
  border-radius: 10px;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.panel-title .audit-rules-button:hover { filter: brightness(1.06); }
.audit-rules-more {
  justify-self: start;
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: #fff;
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.audit-rules-body { display: grid; gap: 16px; }
.audit-rule-group {
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: #f8fafc;
  display: grid;
  gap: 12px;
}
.audit-rule-group h3 { margin: 0; color: var(--color-title); font-size: 14px; }
.audit-rule-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.audit-rule-row > span { display: grid; gap: 2px; min-width: 0; }
.audit-rule-row strong { color: var(--color-title); font-size: 13px; }
.audit-rule-row small { color: var(--color-muted); font-size: 12px; }
.audit-rule-row .el-textarea { max-width: 300px; }
.audit-rule-column { flex-direction: column; align-items: stretch !important; }
.audit-rule-column .el-textarea { max-width: none; }
.audit-rule-value { display: flex; align-items: center; gap: 10px; min-width: 220px; }
.audit-rule-value b { color: var(--color-title); min-width: 24px; text-align: right; }
.audit-rules-footer { display: flex; align-items: center; gap: 12px; width: 100%; }
.audit-rules-reset {
  border: none;
  background: transparent;
  color: var(--color-danger, #dc2626);
  font-size: 13px;
  cursor: pointer;
  padding: 6px 0;
}
.audit-rules-hint { flex: 1; color: var(--color-muted); font-size: 12px; text-align: right; }
.audit-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.audit-summary-grid article {
  min-height: 94px;
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: #fff;
  display: grid;
  gap: 8px;
}
.audit-summary-grid span { color: var(--color-muted); font-size: 13px; }
.audit-summary-grid strong { color: var(--color-title); font-size: 24px; }
.audit-settings-row {
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: #f8fafc;
  display: grid;
  grid-template-columns: auto auto minmax(240px, 1fr);
  gap: 16px;
  align-items: center;
}
.audit-settings-row label { display: flex; align-items: center; gap: 10px; color: var(--color-title); font-weight: 600; }
.audit-settings-row .audit-threshold { display: grid; grid-template-columns: 120px minmax(120px, 1fr); }
.audit-settings-row > p { grid-column: 1 / -1; margin: 0; color: var(--color-muted); font-size: 13px; }
.audit-work-list { margin-top: 18px; }
.audit-work-head { min-height: 44px; display: flex; align-items: center; justify-content: space-between; }
.audit-work-head strong { color: var(--color-title); }
.audit-work-head span { color: var(--color-muted); font-size: 13px; }
.audit-table-wrap { overflow-x: auto; border: 1px solid var(--color-border); border-radius: 10px; }
.audit-table-wrap table { width: 100%; min-width: 900px; border-collapse: collapse; }
.audit-table-wrap th,
.audit-table-wrap td { padding: 12px; border-bottom: 1px solid var(--color-border); text-align: left; vertical-align: middle; }
.audit-table-wrap th { background: #f8fafc; color: var(--color-muted); font-size: 12px; }
.audit-table-wrap td { color: var(--color-text); font-size: 13px; }
.audit-table-wrap td:first-child { min-width: 180px; }
.audit-table-wrap td:first-child strong,
.audit-table-wrap td:first-child small { display: block; }
.audit-table-wrap td:first-child small { margin-top: 4px; color: var(--color-muted); }
.audit-status { min-height: 26px; padding: 0 8px; border-radius: 999px; display: inline-flex; align-items: center; background: #f1f5f9; font-weight: 700; }
.audit-status.is-published { background: #dcfce7; color: #166534; }
.audit-status.is-rejected { background: #fee2e2; color: #991b1b; }
.audit-status.is-review { background: #fef3c7; color: #92400e; }
.audit-row-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.audit-row-actions button { min-height: 32px; padding: 0 10px; border: 0; border-radius: 8px; background: var(--color-primary); color: #fff; cursor: pointer; font-weight: 600; }
.audit-row-actions button.secondary { border: 1px solid var(--color-border); background: #fff; color: var(--color-title); }
.audit-row-actions button.danger { background: #dc2626; }
.metric-box {
  min-height: 220px;
  border-radius: 10px;
  background: linear-gradient(135deg, #fff7ed, #ffffff);
  display: grid;
  place-content: center;
  gap: 10px;
  text-align: center;
  padding: 24px;
}
.metric-box strong {
  color: var(--color-primary);
  font-size: 44px;
}
.settings-list label {
  display: grid;
  gap: 8px;
  color: var(--color-title);
  font-weight: 700;
}
.settings-list input {
  min-height: 48px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0 12px;
  color: var(--color-text);
  background: #f9fafb;
}
.admin-tab-row {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.admin-tab-row button,
.admin-course-tools button,
.admin-primary-btn,
.admin-course-row button {
  min-height: 44px;
  border: 0;
  border-radius: 10px;
  padding: 0 16px;
  background: #eef2f7;
  color: #334155;
  cursor: pointer;
  font-weight: 700;
}
.admin-tab-row button.active,
.admin-primary-btn,
.admin-course-tools button {
  background: var(--color-primary);
  color: #fff;
}
.permission-table,
.admin-course-table {
  display: grid;
  gap: 10px;
}
.permission-head,
.permission-row,
.admin-course-head,
.admin-course-row {
  min-height: 58px;
  border-radius: 10px;
  padding: 12px 14px;
  background: #f8fafc;
  display: grid;
  gap: 12px;
  align-items: center;
}
.permission-head,
.permission-row {
  grid-template-columns: minmax(180px, 1fr) minmax(170px, .8fr) 120px minmax(280px, 1.4fr);
}
.permission-head,
.admin-course-head {
  min-height: 46px;
  color: var(--color-muted);
  font-weight: 700;
}
.permission-row strong,
.admin-course-row strong,
.auth-summary strong {
  color: var(--color-title);
}
.permission-row small,
.permission-row > span,
.admin-course-row span,
.auth-summary span {
  color: var(--color-muted);
}
.switch-line,
.permission-checks label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text);
  font-weight: 600;
}
.permission-checks {
  display: flex;
  align-items: center;
  gap: 10px 14px;
  flex-wrap: wrap;
}
.account-permission-page {
  padding: 0;
  overflow: hidden;
  background: #fff;
}
.account-permission-page > .panel-title {
  min-height: 94px;
  margin: 0;
  padding: 24px 26px 18px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  border-bottom: 1px solid #e5eaf0;
  background: #fff;
}
.account-permission-page > .panel-title h2 {
  margin: 0;
  color: #172033;
  font-size: 22px;
}
.account-permission-page > .panel-title span {
  margin-top: 7px;
  color: #718096;
}
.account-primary-tabs {
  min-height: 56px;
  margin: 0;
  padding: 0 26px;
  gap: 28px;
  flex-wrap: nowrap;
  border-bottom: 1px solid #e5eaf0;
  background: #fff;
}
.account-primary-tabs button,
.account-primary-tabs button.active {
  position: relative;
  min-height: 56px;
  border: 0;
  border-radius: 0;
  padding: 0 2px;
  background: transparent;
  color: #718096;
  box-shadow: none;
}
.account-primary-tabs button.active {
  color: #172033;
}
.account-primary-tabs button.active::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: var(--color-primary);
}
.account-sub-tabs {
  min-height: 68px;
  margin: 0;
  padding: 14px 26px;
  gap: 8px;
  justify-content: space-between;
  border: 0;
  background: #fff;
}
.account-role-select {
  display: inline-grid;
  grid-template-columns: auto 188px;
  align-items: center;
  gap: 10px;
  color: #526174;
  font-size: 13px;
  font-weight: 600;
}
.account-role-select select {
  width: 100%;
  min-height: 36px;
  border: 1px solid #dce4ee;
  border-radius: 5px;
  padding: 0 32px 0 11px;
  background: #fff;
  color: #334155;
  cursor: pointer;
  font-weight: 700;
}
.account-sub-tabs .account-create-btn {
  min-height: 36px;
  border: 0;
  border-radius: 8px;
  padding: 0 14px;
  background: var(--color-primary);
  color: #fff;
  cursor: pointer;
  font-weight: 700;
}
.account-table-surface {
  gap: 0;
  margin: 0 26px 26px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
}
.account-table-surface .permission-head,
.account-table-surface .permission-row {
  grid-template-columns: minmax(160px, 1fr) minmax(140px, .8fr) 100px minmax(220px, 1.3fr) 92px 118px;
  min-height: 64px;
  border-radius: 0;
  padding: 12px 16px;
}
.account-table-surface .permission-head {
  min-height: 44px;
  background: #f8fafc;
  color: #718096;
  font-size: 12px;
}
.account-table-surface .permission-row {
  border-top: 1px solid #e8edf3;
  background: #fff;
}
.account-table-surface .permission-row:hover {
  background: #fcfdff;
}
.account-table-surface .permission-row strong {
  font-size: 14px;
}
.account-table-surface .switch-line {
  width: fit-content;
  min-height: 28px;
  border-radius: 999px;
  padding: 0 10px;
  background: #ecfdf5;
  color: #16856e;
  font-size: 12px;
}
.account-table-surface .switch-line input,
.account-table-surface .permission-checks input {
  accent-color: var(--color-primary);
}
.account-detail-trigger {
  min-width: 0;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.account-detail-trigger:hover strong {
  color: var(--color-primary);
  text-decoration: underline;
  text-underline-offset: 3px;
}
/* ---------- 积分管理 ---------- */

.account-credit-cell {
  min-height: 40px;
  border: 1px solid #fed7aa;
  border-radius: 10px;
  background: #fff7ed;
  color: #ea580c;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 1px;
  cursor: pointer;
}

.account-credit-cell strong {
  color: #ea580c;
  font-size: 15px;
  line-height: 1.1;
}

.account-credit-cell small {
  color: #c4741c;
  font-size: 11px;
  font-weight: 600;
}

.account-credit-cell:hover {
  border-color: #f97316;
  background: #ffedd5;
}

.credit-code-panel {
  display: grid;
  gap: 14px;
  padding: 0 26px 26px;
}

.credit-code-head-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.credit-code-head-actions a {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
}

.credit-code-form {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
  padding: 14px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.credit-code-form label {
  display: grid;
  gap: 6px;
  color: #4a5568;
  font-size: 13px;
  font-weight: 600;
}

.credit-code-form label.full {
  grid-column: 1 / -1;
}

.credit-code-form input {
  height: 38px;
  border: 1px solid #dbe4ee;
  border-radius: 10px;
  background: #fff;
  padding: 0 10px;
  font: inherit;
  color: #0f172a;
}

.credit-code-form button[type="submit"] {
  grid-column: 1 / -1;
  justify-self: start;
  min-height: 40px;
  padding: 0 20px;
}

.credit-code-filters {
  display: flex;
  align-items: center;
  gap: 14px;
}

.credit-code-count {
  color: #718096;
  font-size: 13px;
  font-weight: 600;
}

.credit-code-table {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
}

.credit-code-head,
.credit-code-row {
  display: grid;
  grid-template-columns: minmax(170px, 1.1fr) 96px 128px minmax(160px, 1.2fr) 96px 168px;
  gap: 12px;
  align-items: center;
  padding: 10px 16px;
}

.credit-code-head {
  min-height: 44px;
  background: #f8fafc;
  color: #718096;
  font-size: 12px;
  font-weight: 700;
}

.credit-code-row {
  min-height: 62px;
  border-top: 1px solid #e8edf3;
  background: #fff;
  font-size: 13px;
  color: #4a5568;
}

.credit-code-value {
  color: #0f172a;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px;
  letter-spacing: .04em;
}

.credit-code-meta {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.credit-code-meta small {
  color: #8a94a8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.code-status {
  width: fit-content;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 12px;
  font-style: normal;
  font-weight: 700;
  background: #f1f5f9;
  color: #64748b;
}

.code-status.issued { background: #f4f2ff; color: var(--color-primary); }
.code-status.redeemed { background: #fff7ed; color: #ea580c; }
.code-status.confirmed { background: #ecfdf5; color: #16856e; }
.code-status.void { background: #fef2f2; color: #dc2626; }

.credit-code-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.credit-code-actions button {
  min-height: 32px;
  border: 1px solid #dbe4ee;
  border-radius: 5px;
  padding: 0 10px;
  background: #fff;
  color: #506074;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.credit-code-actions button:disabled {
  opacity: .45;
  cursor: not-allowed;
}

.credit-code-actions button.delete {
  border-color: #fecaca;
  color: #dc2626;
}

.credit-code-empty {
  margin: 0;
  padding: 22px 16px;
  color: #a3adc0;
  text-align: center;
  font-size: 13px;
}

.credit-dialog {
  display: grid;
  gap: 14px;
}

.credit-dialog-head {
  display: grid;
  gap: 2px;
}

.credit-dialog-head strong {
  color: #0f172a;
  font-size: 17px;
}

.credit-dialog-head span {
  color: #8a94a8;
  font-size: 13px;
}

.credit-dialog-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.credit-dialog-metrics article {
  border: 1px solid #e8edf4;
  border-radius: 10px;
  background: #f8fafc;
  padding: 12px;
  display: grid;
  gap: 4px;
}

.credit-dialog-metrics span {
  color: #8a94a8;
  font-size: 12px;
  font-weight: 600;
}

.credit-dialog-metrics strong {
  color: #0f172a;
  font-size: 22px;
}

.credit-adjust-form {
  display: grid;
  gap: 10px;
}

.credit-adjust-form label {
  display: grid;
  gap: 6px;
  color: #4a5568;
  font-size: 13px;
  font-weight: 600;
}

.credit-adjust-form input,
.credit-adjust-form textarea {
  border: 1px solid #dbe4ee;
  border-radius: 10px;
  padding: 8px 10px;
  font: inherit;
  color: #0f172a;
}

.credit-quick-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.credit-quick-row button {
  min-height: 30px;
  border: 1px solid #fed7aa;
  border-radius: 999px;
  background: #fff7ed;
  color: #ea580c;
  padding: 0 14px;
  font-weight: 700;
  cursor: pointer;
}

.credit-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

.credit-dialog-ledger {
  display: grid;
  gap: 6px;
}

.credit-dialog-ledger > p {
  margin: 0;
  color: #8a94a8;
  font-size: 12px;
  font-weight: 700;
}

.credit-dialog-ledger-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  border-radius: 10px;
  background: #f8fafc;
  padding: 0 10px;
  font-size: 13px;
  color: #4a5568;
}

.credit-dialog-ledger-row em {
  font-style: normal;
  font-weight: 700;
  color: #dc2626;
}

.credit-dialog-ledger-row em.positive {
  color: #16a34a;
}

.account-row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}.account-row-actions button,
.account-dialog-secondary {
  min-height: 32px;
  border: 1px solid #dbe4ee;
  border-radius: 5px;
  padding: 0 10px;
  background: #fff;
  color: #506074;
  cursor: pointer;
  font-weight: 600;
}
.account-row-actions .edit {
  border-color: #f8c28e;
  color: #d56513;
}
.account-row-actions .delete {
  border-color: #fecaca;
  color: #d84b4b;
}
.account-detail-dialog .el-dialog,
.account-edit-dialog .el-dialog {
  overflow: hidden;
  border-radius: 10px;
}
.account-detail-dialog .el-dialog__header {
  margin: 0;
  padding: 0;
}
.account-detail-dialog .el-dialog__body {
  padding: 0;
}
.account-detail-dialog-head {
  min-height: 56px;
  padding: 0 20px;
  border-bottom: 1px solid #ffdcca;
  background: #fff5ed;
  color: #a94e11;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.account-detail-dialog-head strong {
  font-size: 16px;
}
.account-detail-dialog-head button {
  width: 30px;
  height: 30px;
  border: 1px solid #f3b98e;
  border-radius: 999px;
  background: transparent;
  color: #b75a1c;
  cursor: pointer;
  font-size: 21px;
  line-height: 1;
}
.account-detail-tabs {
  display: flex;
  gap: 28px;
  padding: 0 22px;
  border-bottom: 1px solid #e5eaf0;
  overflow-x: auto;
}
.account-detail-tabs button {
  position: relative;
  min-height: 52px;
  flex: 0 0 auto;
  border: 0;
  padding: 0 1px;
  background: transparent;
  color: #718096;
  cursor: pointer;
  font-weight: 600;
}
.account-detail-tabs button.active {
  color: #172033;
}
.account-detail-tabs button.active::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: var(--color-primary);
}
.account-detail-content {
  min-height: 510px;
  display: grid;
  grid-template-columns: 235px minmax(0, 1fr);
}
.account-detail-summary {
  padding: 26px 18px;
  border-right: 1px solid #e5eaf0;
  background: #fbfcfe;
  text-align: center;
  display: grid;
  align-content: start;
  justify-items: center;
  gap: 8px;
}
.account-detail-avatar {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: #e6edf7;
  color: #365370;
  display: grid;
  place-items: center;
  font-size: 28px;
  font-weight: 700;
}
.account-detail-summary > strong {
  margin-top: 5px;
  color: #172033;
  font-size: 17px;
}
.account-detail-summary > span {
  color: #718096;
  font-size: 12px;
  line-height: 1.5;
}
.account-detail-summary em {
  margin-top: 7px;
  border-radius: 999px;
  padding: 6px 10px;
  background: #eaf8f3;
  color: #16856e;
  font-size: 12px;
  font-style: normal;
  font-weight: 700;
}
.account-detail-summary em.disabled {
  background: #fef2f2;
  color: #b91c1c;
}
.account-detail-summary > button {
  width: 100%;
  min-height: 36px;
  margin-top: 12px;
  border: 1px solid #f8b27e;
  border-radius: 8px;
  background: #fff;
  color: #d56415;
  cursor: pointer;
  font-weight: 600;
}
.account-detail-body {
  min-width: 0;
  padding: 25px 28px;
  background: #fff;
}
.account-detail-body h3 {
  margin: 0 0 18px;
  color: #172033;
  font-size: 17px;
}
.account-detail-body h4 {
  margin: 26px 0 12px;
  color: #172033;
  font-size: 15px;
}
.account-detail-info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 34px;
}
.account-detail-info-grid article {
  min-width: 0;
  padding: 0 0 13px;
  margin-bottom: 14px;
  border-bottom: 1px solid #edf0f5;
}
.account-detail-info-grid span,
.account-detail-work-grid span {
  display: block;
  color: #718096;
  font-size: 12px;
}
.account-detail-info-grid strong {
  display: block;
  margin-top: 7px;
  overflow: hidden;
  color: #172033;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-detail-permissions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.account-detail-permissions span {
  border: 1px solid #ccebe2;
  border-radius: 5px;
  padding: 7px 10px;
  background: #f1fbf7;
  color: #16856e;
  font-size: 12px;
  font-weight: 600;
}
.account-detail-empty {
  min-height: 260px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  color: #718096;
  text-align: center;
}
.account-detail-empty strong {
  color: #334155;
  font-size: 16px;
}
.account-detail-empty span {
  max-width: 360px;
  font-size: 13px;
  line-height: 1.6;
}
.account-detail-work-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.account-detail-work-grid article {
  min-width: 0;
  border: 1px solid #e3eaf2;
  border-radius: 7px;
  overflow: hidden;
}
.account-detail-work-grid i {
  display: block;
  aspect-ratio: 4 / 3;
}
.account-detail-work-grid strong,
.account-detail-work-grid span {
  overflow: hidden;
  display: block;
  padding: 0 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-detail-work-grid strong {
  margin-top: 10px;
  color: #172033;
  font-size: 13px;
}
.account-detail-work-grid span {
  margin: 5px 0 10px;
}
.account-edit-dialog .el-dialog__body {
  padding-top: 8px;
}
.account-edit-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.account-edit-form label {
  display: grid;
  gap: 7px;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
}
.account-edit-form label.full {
  grid-column: 1 / -1;
}
.account-edit-form .account-field-tip {
  color: #94a3b8;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
}
.account-edit-form input,
.account-edit-form select {
  min-height: 40px;
  border: 1px solid #dbe4ee;
  border-radius: 8px;
  padding: 0 10px;
  background: #fff;
  color: #334155;
}
.account-edit-form select[multiple] {
  min-height: 104px;
  padding: 6px;
}
.account-group-content {
  min-height: 520px;
  margin: 20px 26px 26px;
  padding: 18px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fbfcfe;
}
.organization-setup-content {
  min-height: 420px;
}
.organization-setup-heading,
.organization-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.organization-setup-heading h3,
.organization-card-head h4 {
  margin: 0;
  color: #172033;
}
.organization-setup-heading p {
  margin: 7px 0 0;
  color: #718096;
  font-size: 13px;
}
.organization-setup-error {
  margin: 14px 0 0;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 12px;
  background: #fff5f5;
  color: #b91c1c;
  font-size: 13px;
}
.organization-setup-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin-top: 20px;
}
.organization-card,
.enrollment-code-list {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
}
.organization-card {
  padding: 16px;
}
.organization-card-head span {
  color: #718096;
  font-size: 12px;
  font-weight: 600;
}
.organization-form,
.enrollment-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 15px;
}
.organization-form label,
.enrollment-form label {
  display: grid;
  gap: 6px;
  color: #526174;
  font-size: 12px;
  font-weight: 600;
}
.organization-form input,
.organization-form select,
.enrollment-form input,
.enrollment-form select {
  min-height: 38px;
  border: 1px solid #dbe4ee;
  border-radius: 8px;
  padding: 0 10px;
  background: #fff;
  color: #334155;
}
.organization-form .admin-primary-btn,
.enrollment-form .admin-primary-btn {
  align-self: end;
  min-height: 38px;
}
.organization-filter-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 112px;
  gap: 8px;
  margin-top: 12px;
}
.organization-filter-row input,
.organization-filter-row select,
.campus-edit-form input,
.campus-edit-form select {
  min-height: 36px;
  border: 1px solid #dbe4ee;
  border-radius: 8px;
  padding: 0 10px;
  background: #fff;
  color: #334155;
}
.enrollment-form {
  margin-top: 20px;
}
.enrollment-form .full {
  grid-column: 1 / -1;
}
.organization-list,
.enrollment-code-list {
  display: grid;
  gap: 0;
  margin-top: 16px;
  overflow: hidden;
}
.organization-list article,
.enrollment-code-list article {
  display: grid;
  align-items: center;
  gap: 5px 12px;
  padding: 12px;
  border-top: 1px solid #edf0f5;
}
.organization-list article {
  grid-template-columns: minmax(0, 1fr) auto auto;
}
.organization-list-main {
  min-width: 0;
  display: grid;
  gap: 4px;
}
.organization-row-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}
.organization-row-actions button {
  min-height: 28px;
  border: 1px solid #dbe4ee;
  border-radius: 5px;
  padding: 0 8px;
  background: #fff;
  color: #475467;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}
.organization-row-actions button:hover {
  border-color: #9db2c8;
  background: #f8fafc;
}
.organization-row-actions button.danger {
  border-color: #fecaca;
  color: #b91c1c;
}
.campus-edit-form {
  display: grid;
  gap: 14px;
}
.campus-edit-form label {
  display: grid;
  gap: 7px;
  color: #475467;
  font-size: 13px;
  font-weight: 600;
}
.campus-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}
.organization-list article:first-child,
.enrollment-code-list article:first-child {
  border-top: 0;
}
.organization-list strong,
.enrollment-code-list strong {
  color: #172033;
  font-size: 13px;
}
.organization-list span,
.enrollment-code-list span,
.enrollment-code-list small {
  color: #718096;
  font-size: 12px;
}
.organization-list em,
.enrollment-code-list em {
  border-radius: 999px;
  padding: 4px 8px;
  background: #ecfdf5;
  color: #16856e;
  font-size: 11px;
  font-style: normal;
  font-weight: 600;
  white-space: nowrap;
}
.organization-list em.disabled,
.organization-list em.archived {
  background: #f1f5f9;
  color: #64748b;
}
.organization-list > p,
.enrollment-code-list > p {
  margin: 0;
  padding: 20px 12px;
  color: #718096;
  font-size: 13px;
}
.enrollment-code-list article {
  grid-template-columns: minmax(0, 1fr) auto;
}
.enrollment-code-list article > div {
  display: grid;
  gap: 4px;
}
.permission-group-layout {
  min-height: 520px;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 18px;
}
.permission-group-list {
  border-right: 1px solid #e5eaf0;
  padding-right: 18px;
  display: grid;
  align-content: start;
  gap: 8px;
}
.permission-group-list button {
  min-height: 64px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
  background: #f8fafc;
  color: #334155;
  text-align: left;
  cursor: pointer;
  display: grid;
  gap: 5px;
}
.permission-group-list button.active {
  border-color: #20c997;
  background: #ecfdf5;
  box-shadow: inset 3px 0 0 #20c997;
}
.permission-group-list .new-group-btn {
  min-height: 44px;
  background: #20c997;
  color: #fff;
  text-align: center;
  place-items: center;
  font-weight: 700;
}
.permission-group-list small,
.group-editor-title p,
.group-option-grid small,
.member-option-grid small {
  color: #64748b;
}
.permission-group-editor {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 14px;
}
.group-editor-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.group-editor-title h3,
.group-editor-title p {
  margin: 0;
}
.permission-group-editor > label {
  display: grid;
  gap: 7px;
  color: #0f172a;
  font-weight: 700;
}
.permission-group-editor input[type='text'],
.permission-group-editor > label input,
.permission-group-editor textarea {
  min-height: 44px;
  border: 1px solid #dbe2ea;
  border-radius: 8px;
  padding: 9px 11px;
  background: #fff;
  color: #334155;
}
.permission-group-editor textarea {
  min-height: 72px;
  resize: vertical;
}
.permission-group-editor fieldset,
.course-group-options,
.course-auth-groups {
  min-width: 0;
  margin: 0;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px;
}
.permission-group-editor legend,
.course-group-options legend,
.course-auth-groups legend {
  padding: 0 6px;
  color: #0f172a;
  font-weight: 700;
}
.group-option-grid,
.member-option-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.group-option-grid label,
.member-option-grid label,
.course-auth-groups label {
  min-height: 54px;
  border: 1px solid #edf0f5;
  border-radius: 5px;
  padding: 9px 10px;
  display: flex;
  align-items: flex-start;
  gap: 9px;
  background: #f8fafc;
  cursor: pointer;
}
.group-option-grid span,
.member-option-grid span,
.course-auth-groups span {
  display: grid;
  gap: 3px;
}
.group-editor-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.danger-btn {
  min-height: 44px;
  border: 1px solid #fecaca;
  border-radius: 10px;
  padding: 0 16px;
  background: #fff;
  color: #dc2626;
  cursor: pointer;
  font-weight: 700;
}
.admin-course-form,
.course-auth-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.admin-course-form label,
.course-auth-panel label {
  display: grid;
  gap: 7px;
  color: var(--color-title);
  font-weight: 700;
}
.admin-course-form label.full,
.admin-course-form .course-group-options,
.admin-primary-btn,
.course-auth-panel .course-auth-groups,
.course-auth-panel .auth-summary,
.course-auth-panel p {
  grid-column: 1 / -1;
}
.admin-course-form input,
.admin-course-form select,
.admin-course-form textarea,
.course-auth-panel select,
.admin-course-tools input {
  min-height: 46px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0 12px;
  background: #f9fafb;
  color: var(--color-text);
}
.admin-course-form textarea {
  min-height: 92px;
  padding: 10px 12px;
  resize: vertical;
}
.course-group-options {
  display: flex;
  align-items: center;
  gap: 10px 18px;
  flex-wrap: wrap;
}
.course-group-options label {
  display: inline-flex;
  grid-auto-flow: column;
  align-items: center;
  gap: 7px;
}
.course-auth-groups {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.admin-primary-btn {
  justify-self: start;
}
.admin-course-tools {
  margin-bottom: 12px;
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto auto auto;
  gap: 10px;
}
.admin-course-tools .danger {
  background: #fee2e2;
  color: #b91c1c;
}
.admin-course-head,
.admin-course-row {
  grid-template-columns: 34px minmax(150px, 1fr) minmax(130px, .9fr) minmax(180px, 1fr) minmax(150px, .8fr) 80px 80px;
}
.admin-course-row em {
  color: var(--color-primary);
  font-style: normal;
  font-weight: 700;
}
.admin-course-row button {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.auth-summary {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 14px;
  background: #f8fafc;
  display: grid;
  gap: 6px;
}
.admin-course-page.course-library-page {
  min-height: 680px;
  border: 1px solid #e5e7eb;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  overflow: hidden;
}
.library-title-row {
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 10px;
}
.library-title-row h3 {
  margin: 0;
  color: #0f172a;
  font-size: 22px;
}
.library-title-row p {
  margin: 4px 0 0;
  color: #64748b;
}
.library-title-row strong {
  border-radius: 999px;
  background: #e8f8f2;
  color: #0f766e;
  padding: 8px 12px;
}
.edu-toolbar,
.filter-line,
.pagination-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.edu-toolbar button,
.filter-line button,
.pagination-bar button,
.row-actions button {
  min-height: 32px;
  border: 1px solid #dbe2ea;
  border-radius: 3px;
  background: #fff;
  color: #334155;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 600;
}
.edu-toolbar button:disabled,
.pagination-bar button:disabled {
  cursor: not-allowed;
  opacity: .45;
}
.edu-toolbar .green-btn,
.green-btn {
  border-color: #20c997 !important;
  background: #20c997 !important;
  color: #fff !important;
}
.edu-toolbar button.active {
  border-color: #20c997;
  color: #0f172a;
  box-shadow: inset 0 2px 0 #20c997;
}
.edu-toolbar label {
  min-height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #475569;
  font-size: 13px;
  font-weight: 600;
}
.edu-toolbar input {
  width: 180px;
  height: 32px;
  border: 1px solid #dbe2ea;
  border-radius: 3px;
  padding: 0 9px;
}
.edu-toolbar > span {
  flex: 1;
  min-width: 20px;
}
.filter-line {
  min-height: 34px;
  color: #64748b;
  font-size: 13px;
}
.filter-line span {
  flex: 1;
}
.filter-line label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.filter-line b {
  color: #0f766e;
  font-weight: 700;
}
.dense-table-wrap {
  min-height: 0;
  flex: 1;
  overflow: auto;
  border: 1px solid #edf0f5;
}
.dense-table {
  width: 100%;
  min-width: 1120px;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 13px;
}
.dense-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  height: 40px;
  background: #f8fafc;
  color: #475569;
  text-align: left;
}
.dense-table td {
  height: 44px;
  border-top: 1px solid #edf0f5;
  color: #334155;
}
.dense-table th,
.dense-table td {
  padding: 0 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dense-table a {
  color: #0f766e;
  font-weight: 700;
}
.library-table th:nth-child(1),
.library-table td:nth-child(1) {
  width: 34px;
}
.library-table th:nth-child(2),
.library-table td:nth-child(2) {
  width: 150px;
}
.library-table th:nth-child(5),
.library-table td:nth-child(5),
.library-table th:nth-child(6),
.library-table td:nth-child(6),
.library-table th:nth-child(7),
.library-table td:nth-child(7) {
  width: 112px;
}
.library-table th:nth-child(11),
.library-table td:nth-child(11) {
  width: 134px;
}
.row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.row-actions button {
  min-height: 28px;
  padding: 0 7px;
  font-size: 12px;
}
.row-actions button:nth-child(1) {
  border-color: #d6cffd;
  color: var(--color-primary);
}
.row-actions button:nth-child(2) {
  border-color: #bbf7d0;
  color: #15803d;
}
.row-actions button:nth-child(3) {
  border-color: #fecaca;
  color: #dc2626;
}
.tag-green {
  border-radius: 999px;
  padding: 4px 8px;
  background: #dcfce7;
  color: #16a34a;
  font-style: normal;
  font-weight: 700;
}
.pagination-bar {
  min-height: 34px;
  justify-content: flex-end;
  color: #64748b;
  font-size: 13px;
}
.pagination-bar b {
  min-width: 28px;
  height: 28px;
  border-radius: 3px;
  background: #20c997;
  color: #fff;
  display: grid;
  place-items: center;
}
.report-template-library {
  min-height: 680px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}
.template-library-toolbar select {
  height: 32px;
  border: 1px solid #dbe2ea;
  border-radius: 3px;
  padding: 0 8px;
  background: #fff;
  color: #334155;
}
.report-template-list {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.report-template-table {
  min-width: 1240px;
}
.report-template-table th:nth-child(1),
.report-template-table td:nth-child(1) { width: 34px; }
.report-template-table th:nth-child(2),
.report-template-table td:nth-child(2) { width: 72px; }
.report-template-table th:nth-child(3),
.report-template-table td:nth-child(3) { width: 130px; }
.report-template-table th:nth-child(4),
.report-template-table td:nth-child(4) { width: 76px; }
.report-template-table th:nth-child(5),
.report-template-table td:nth-child(5) { width: 78px; }
.report-template-table th:nth-child(6),
.report-template-table td:nth-child(6) { width: 100px; }
.report-template-table th:nth-child(7),
.report-template-table td:nth-child(7) { width: 82px; }
.report-template-table th:nth-child(8),
.report-template-table td:nth-child(8) { width: 118px; }
.report-template-table th:nth-child(9),
.report-template-table td:nth-child(9) { width: 190px; }
.report-template-table th:nth-child(10),
.report-template-table td:nth-child(10) { width: 80px; }
.report-template-table th:nth-child(11),
.report-template-table td:nth-child(11) { width: 164px; }
.report-template-table td:nth-child(3) small {
  display: block;
  margin-top: 3px;
  color: #94a3b8;
}
.template-mini-preview {
  width: 70px;
  aspect-ratio: 16 / 9;
  border: 1px solid #dbe2ea;
  border-radius: 4px;
  background: var(--mini-bg);
  overflow: hidden;
  display: block;
  position: relative;
}
.template-mini-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.template-mini-preview i,
.template-mini-preview b {
  position: absolute;
  display: block;
}
.template-mini-preview i {
  left: 7px;
  top: 8px;
  width: 26px;
  height: 4px;
  border-radius: 2px;
  background: var(--mini-primary);
}
.template-mini-preview b {
  right: 7px;
  bottom: 6px;
  width: 26px;
  height: 20px;
  border-radius: 3px;
  background: var(--mini-soft);
  border: 1px solid var(--mini-secondary);
}
.template-status {
  border-radius: 999px;
  padding: 4px 8px;
  font-style: normal;
  font-weight: 700;
}
.template-status.published { background: #dcfce7; color: #15803d; }
.template-status.draft { background: #fef3c7; color: #a16207; }
.template-status.disabled { background: #e2e8f0; color: #64748b; }
.template-parse-status {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border-radius: 999px;
  padding: 3px 8px;
  background: #eef2ff;
  color: #3730a3;
  font-size: 12px;
  font-style: normal;
  font-weight: 700;
}
.template-parse-status.none { background: #f1f5f9; color: #64748b; }
.template-parse-status.parsing { background: #e7e3ff; color: var(--color-primary-hover); }
.template-parse-status.parsed { background: #dcfce7; color: #15803d; }
.template-parse-status.failed { background: #fee2e2; color: #dc2626; }
.template-parse-status.manual { background: #fef3c7; color: #a16207; }
.template-row-actions {
  gap: 4px;
  overflow: visible;
  white-space: normal;
  flex-wrap: nowrap;
}
.template-row-actions button:nth-child(n) {
  border-color: #dbe2ea;
  color: #334155;
}
.template-row-actions button:last-child {
  border-color: #fecaca;
  color: #dc2626;
}
.source-file-link {
  max-width: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--color-primary);
  font-size: 12px;
  text-align: left;
  text-decoration: underline;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.report-template-auth > label {
  display: grid;
  gap: 6px;
  color: #0f172a;
  font-weight: 700;
}
.report-template-auth > label select {
  min-height: 44px;
  border: 1px solid #dbe2ea;
  border-radius: 8px;
  padding: 8px 10px;
  background: #fff;
  color: #334155;
}
.template-layout-fieldset,
.template-visibility-options,
.template-auth-grid fieldset {
  min-width: 0;
  margin: 0;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px;
}
.template-layout-fieldset legend,
.template-visibility-options legend,
.template-auth-grid legend {
  padding: 0 6px;
  color: #0f172a;
  font-weight: 700;
}
.template-layout-fieldset,
.template-visibility-options {
  display: flex;
  align-items: center;
  gap: 9px 16px;
  flex-wrap: wrap;
}
.template-layout-fieldset label,
.template-visibility-options label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #334155;
  font-weight: 600;
}
.report-template-auth {
  max-width: 980px;
  display: grid;
  align-content: start;
  gap: 14px;
}
.auth-batch-card {
  border: 1px solid #d6cffd;
  border-radius: 10px;
  padding: 12px 14px;
  background: #f4f2ff;
  display: grid;
  gap: 5px;
}
.auth-batch-card strong {
  color: var(--color-primary-hover);
}
.auth-batch-card span {
  color: #475569;
  line-height: 1.5;
}
.template-auth-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.template-auth-grid fieldset {
  display: grid;
  gap: 8px;
}
.template-auth-grid label {
  min-height: 54px;
  border: 1px solid #edf0f5;
  border-radius: 5px;
  padding: 9px 10px;
  display: flex;
  align-items: flex-start;
  gap: 9px;
  background: #f8fafc;
}
.template-auth-grid label span {
  display: grid;
  gap: 3px;
}
.template-auth-grid small {
  color: #64748b;
}
.member-role-filter {
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}
.member-role-filter button {
  min-height: 34px;
  border: 1px solid #dbe2ea;
  border-radius: 5px;
  padding: 0 10px;
  background: #fff;
  color: #475569;
  font-weight: 600;
}
.member-role-filter button.active {
  border-color: #20c997;
  background: #ecfdf5;
  color: #0f766e;
}
@media (max-width: 760px) {
  .admin-summary,
  .content-grid,
  .course-grid,
  .audit-rules,
  .audit-settings-row { grid-template-columns: 1fr; }
  .audit-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .audit-settings-row .audit-threshold { grid-template-columns: 120px minmax(120px, 1fr); }
  .table-head,
  .row,
  .permission-head,
  .permission-row,
  .admin-course-head,
  .admin-course-row,
  .admin-course-form,
  .course-auth-panel,
  .admin-course-tools,
  .permission-group-layout,
  .template-auth-grid,
  .group-option-grid,
  .member-option-grid,
  .course-auth-groups { grid-template-columns: 1fr; }
}

.course-library-page {
  --course-surface: #ffffff;
  --course-surface-soft: #f7fafc;
  --course-border: #e2e8f0;
  --course-text: #1f2937;
  --course-muted: #64748b;
  --course-accent: #0f766e;
  --course-accent-soft: #e8f8f2;
}
.admin-course-page.course-library-page {
  min-height: 720px;
  border-color: var(--course-border);
  border-radius: 10px;
  background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
  gap: 14px;
  padding: 18px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, .06);
}
.course-library-page .library-title-row {
  min-height: 72px;
  align-items: flex-start;
  border-bottom: 0;
  padding: 0;
}
.course-library-page .library-title-row h3 {
  font-size: 26px;
  line-height: 1.15;
}
.course-library-page .library-title-row p {
  max-width: 620px;
  color: var(--course-muted);
}
.course-library-page .library-title-row strong {
  border: 1px solid #c8f0e3;
  border-radius: 10px;
  background: var(--course-accent-soft);
  color: var(--course-accent);
  white-space: nowrap;
}
.course-library-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.course-library-stats article {
  min-height: 92px;
  border: 1px solid var(--course-border);
  border-radius: 10px;
  padding: 14px;
  background: var(--course-surface);
  display: grid;
  align-content: center;
  gap: 5px;
}
.course-library-stats span,
.course-library-stats small {
  color: var(--course-muted);
  font-size: 12px;
  font-weight: 600;
}
.course-library-stats strong {
  color: var(--course-text);
  font-size: 28px;
  line-height: 1;
}
.course-library-page .admin-library-toolbar {
  border: 1px solid var(--course-border);
  border-radius: 10px;
  padding: 10px;
  background: var(--course-surface-soft);
  display: grid;
  grid-template-columns: auto auto auto minmax(220px, 1fr);
  gap: 10px;
}
.course-library-page .toolbar-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.course-library-page .toolbar-group + .toolbar-group {
  padding-left: 10px;
  border-left: 1px solid var(--course-border);
}
.course-library-page .edu-toolbar button {
  min-height: 36px;
  border-radius: 8px;
}
.course-library-page .batch-action-field {
  min-height: 36px;
}
.course-library-page .batch-action-field select {
  height: 36px;
  border: 1px solid #dbe2ea;
  border-radius: 8px;
  padding: 0 30px 0 10px;
  background: #fff;
  color: #334155;
  font-weight: 600;
}
.course-library-page .batch-action-field select:disabled {
  cursor: not-allowed;
  opacity: .5;
}
.course-library-page .edu-toolbar button.active {
  border-color: #99f6e4;
  background: #ecfdf5;
  color: var(--course-accent);
  box-shadow: inset 0 -2px 0 var(--course-accent);
}
.course-library-page .course-search-field {
  justify-self: end;
  width: min(100%, 330px);
  justify-content: flex-end;
}
.course-library-page .course-search-field input {
  width: min(220px, 100%);
  border-radius: 8px;
  background: #fff;
}
.course-library-page .admin-library-filter {
  border: 1px solid #e7e3ff;
  border-radius: 10px;
  padding: 8px 10px;
  background: #faf9ff;
}
.course-library-page .course-category-panel {
  border: 1px solid #c8f0e3;
  border-radius: 10px;
  padding: 12px;
  background: #f4fbf8;
  display: grid;
  grid-template-columns: minmax(160px, .8fr) minmax(220px, 1fr) auto;
  gap: 12px;
  align-items: end;
}
.course-library-page .course-category-panel > div {
  display: grid;
  gap: 4px;
}
.course-library-page .course-category-panel strong {
  color: var(--course-text);
}
.course-library-page .course-category-panel span {
  color: var(--course-muted);
  font-size: 12px;
  font-weight: 600;
}
.course-library-page .course-category-panel label {
  color: var(--course-text);
  font-weight: 700;
}
.course-library-page .course-category-panel input {
  width: 100%;
  margin-top: 6px;
  border: 1px solid var(--course-border);
  border-radius: 8px;
  min-height: 38px;
  padding: 0 10px;
  background: #fff;
}
.course-library-page .course-category-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.course-library-page .course-category-actions button {
  min-height: 38px;
  border: 1px solid var(--course-border);
  border-radius: 8px;
  padding: 0 12px;
  background: #fff;
  color: #334155;
  cursor: pointer;
  font-weight: 700;
}
.course-library-page .course-category-list {
  grid-column: 1 / -1;
  border-top: 1px solid #d7f4ea;
  padding-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.course-library-page .course-category-list button {
  min-height: 30px;
  border: 1px solid #bbf7d0;
  border-radius: 999px;
  padding: 0 10px;
  background: #fff;
  color: var(--course-accent);
  cursor: pointer;
  font-weight: 700;
}
.course-library-page .admin-course-list {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.course-library-page .library-table-wrap {
  border-color: var(--course-border);
  border-radius: 10px;
  background: #fff;
}
.course-library-page .dense-table {
  min-width: 1180px;
}
.course-library-page .dense-table th {
  height: 44px;
  background: #f1f5f9;
  color: #475569;
}
.course-library-page .dense-table td {
  height: 52px;
}
.course-library-page .dense-table th,
.course-library-page .dense-table td {
  padding: 0 10px;
}
.course-library-page .library-table th:nth-child(2),
.course-library-page .library-table td:nth-child(2) {
  width: 190px;
}
.course-library-page .library-table th:nth-child(8),
.course-library-page .library-table td:nth-child(8) {
  width: 160px;
}
.course-library-page .library-table th:nth-child(11),
.course-library-page .library-table td:nth-child(11) {
  width: 190px;
}
.course-library-page .row-actions {
  gap: 6px;
}
.course-library-page .row-actions button {
  min-height: 30px;
  border-radius: 5px;
}
.course-library-page .row-actions button:nth-child(4) {
  border-color: #fecaca;
  color: #dc2626;
}
.course-library-page .admin-course-form,
.course-library-page .course-auth-panel {
  border: 1px solid var(--course-border);
  border-radius: 10px;
  padding: 16px;
  background: #fff;
}
.course-library-page .admin-course-form {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}
.course-library-page .admin-course-section {
  border: 1px solid var(--course-border);
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
}
.course-library-page .admin-course-section > header {
  min-height: 52px;
  border-bottom: 1px solid var(--course-border);
  padding: 12px 14px;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.course-library-page .admin-course-section > header strong {
  color: var(--course-text);
  font-size: 15px;
  font-weight: 700;
}
.course-library-page .admin-course-section > header span {
  color: var(--course-muted);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  text-align: right;
}
.course-library-page .admin-section-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}
.course-library-page .admin-inline-action {
  min-height: 34px;
  border: 1px solid #99f6e4;
  border-radius: 8px;
  padding: 0 12px;
  background: #ecfdf5;
  color: var(--course-accent);
  cursor: pointer;
  font-weight: 700;
}
.course-library-page .admin-course-section-body {
  padding: 14px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.course-library-page .admin-course-section-body.single {
  grid-template-columns: 1fr;
}
.course-library-page .admin-course-form input,
.course-library-page .admin-course-form select,
.course-library-page .admin-course-form textarea,
.course-library-page .admin-course-form .el-select,
.course-library-page .course-auth-panel select {
  background: #fff;
}
.course-library-page .admin-course-form .el-select {
  width: 100%;
}
.course-library-page .admin-course-form .el-select .el-select__wrapper {
  min-height: 46px;
  border-radius: 10px;
  box-shadow: 0 0 0 1px var(--course-border) inset;
}
.course-library-page .admin-category-select {
  position: relative;
  display: grid;
  gap: 8px;
}
.course-library-page .admin-category-trigger {
  width: 100%;
  min-height: 46px;
  border: 1px solid var(--course-border);
  border-radius: 10px;
  padding: 0 12px;
  background: #fff;
  color: var(--course-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-weight: 700;
}
.course-library-page .admin-category-trigger b {
  color: var(--course-muted);
}
.course-library-page .admin-category-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 20;
  border: 1px solid var(--course-border);
  border-radius: 10px;
  padding: 6px;
  background: #fff;
  box-shadow: 0 18px 50px rgba(15, 23, 42, .16);
  display: grid;
  gap: 4px;
  max-height: 280px;
  overflow-y: auto;
}
.course-library-page .admin-category-option {
  width: 100%;
  min-height: 36px;
  border: 0;
  border-radius: 8px;
  padding: 0 8px 0 10px;
  background: #fff;
  color: #334155;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-weight: 700;
  text-align: left;
}
.course-library-page .admin-category-option:hover,
.course-library-page .admin-category-option.active {
  background: #ecfdf5;
  color: var(--course-accent);
}
.course-library-page .admin-category-option.fixed {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #fff;
  border-bottom: 1px solid var(--course-border);
  border-radius: 6px 6px 2px 2px;
}
.course-library-page .admin-category-option i {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  color: #dc2626;
  display: grid;
  place-items: center;
  font-style: normal;
}
.course-library-page .admin-category-option i:hover {
  background: #fee2e2;
}
.course-library-page .admin-category-custom-input {
  min-height: 42px;
}
.course-library-page .admin-upload-field {
  min-width: 0;
  border: 1px solid var(--course-border);
  border-radius: 10px;
  padding: 12px;
  background: #f8fafc;
  display: grid;
  gap: 9px;
}
.course-library-page .admin-upload-field input[type='file'] {
  display: none;
}
.course-library-page .admin-upload-field > span,
.course-library-page .admin-question-result-head strong {
  color: var(--course-text);
  font-weight: 700;
}
.course-library-page .course-group-select {
  max-width: 560px;
}
.course-library-page .admin-upload-field small,
.course-library-page .admin-question-result-head span,
.course-library-page .admin-question-result article span {
  color: var(--course-muted);
  line-height: 1.5;
}
.course-library-page .admin-upload-field button {
  width: fit-content;
  min-height: 36px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0 12px;
  background: #fff;
  color: #334155;
  cursor: pointer;
  font-weight: 700;
}
.course-library-page .admin-upload-field .ai-parse-btn {
  border-color: #99f6e4;
  background: #ecfdf5;
  color: var(--course-accent);
}
.course-library-page .admin-upload-field button:disabled {
  cursor: not-allowed;
  opacity: .55;
}
.course-library-page .admin-upload-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.course-library-page .admin-course-upload-layout {
  display: grid;
  grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
  gap: 16px;
  padding: 14px;
}
.course-library-page .admin-course-cover-panel {
  min-width: 0;
  padding: 14px;
  border: 1px dashed #b8c6d8;
  border-radius: 10px;
  background: #f8fafc;
  display: grid;
  align-content: start;
  gap: 9px;
}
.course-library-page .admin-course-cover-panel > strong,
.course-library-page .admin-cover-ai-panel > strong {
  color: var(--course-text);
  font-weight: 700;
}
.course-library-page .admin-course-cover-panel input[type='file'] {
  display: none;
}
.course-library-page .admin-course-cover-preview {
  min-height: 222px;
  border-radius: 7px;
  overflow: hidden;
  color: #fff;
  display: grid;
  place-items: center;
  padding: 18px;
  text-align: center;
  font-size: 20px;
  font-weight: 700;
  cursor: zoom-in;
}
.course-library-page .admin-course-cover-dialog-preview {
  min-height: min(68vh, 560px);
  border-radius: 10px;
  color: #fff;
  display: grid;
  place-items: center;
  padding: 24px;
  text-align: center;
  font-size: 24px;
  font-weight: 700;
}
.course-library-page .admin-course-cover-panel > button,
.course-library-page .admin-cover-ai-panel button {
  width: 100%;
  min-height: 38px;
  border: 1px solid #99d9c9;
  border-radius: 8px;
  background: #fff;
  color: #087359;
  cursor: pointer;
  font-weight: 700;
}
.course-library-page .admin-course-cover-panel > button.admin-cover-ai-btn {
  border-color: var(--course-accent);
  background: var(--course-accent);
  color: #fff;
}
.course-library-page .admin-course-cover-panel button:disabled {
  cursor: not-allowed;
  opacity: .6;
}
.course-library-page .admin-cover-ai-panel {
  padding: 10px;
  border: 1px solid #b8dfd4;
  border-radius: 7px;
  background: #effaf7;
  display: grid;
  gap: 8px;
}
.course-library-page .admin-cover-prompt-source {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #4f6679;
  font-size: 12px;
  font-weight: 700;
}
.course-library-page .admin-cover-prompt-source input {
  min-height: auto;
  accent-color: var(--course-accent);
}
.course-library-page .admin-cover-ai-panel textarea {
  min-height: 72px;
  resize: vertical;
  font-size: 12px;
}
.course-library-page .admin-course-cover-panel > small {
  color: var(--course-muted);
  font-size: 12px;
  line-height: 1.5;
}
.course-library-page .admin-course-info-stack {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 12px;
}
.course-library-page .admin-course-section-body.admin-course-basic-grid {
  padding: 0;
}
.course-library-page .admin-inline-course-media,
.course-library-page .admin-inline-document-panel {
  overflow: hidden;
  border: 1px solid var(--course-border);
  border-radius: 10px;
  background: #fbfcfe;
}
.course-library-page .admin-inline-course-media > header,
.course-library-page .admin-inline-document-panel > header {
  min-height: 42px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--course-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.course-library-page .admin-inline-course-media > header strong,
.course-library-page .admin-inline-document-panel > header strong {
  color: var(--course-text);
  font-size: 14px;
  font-weight: 700;
}
.course-library-page .admin-inline-course-media > header span,
.course-library-page .admin-inline-document-panel > header span {
  color: var(--course-muted);
  font-size: 12px;
  font-weight: 700;
}
.course-library-page .admin-inline-course-media-grid {
  padding: 12px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.course-library-page .admin-inline-document-panel .admin-upload-field {
  margin: 12px;
}
@media (max-width: 1200px) {
  .course-library-page .admin-course-upload-layout {
    grid-template-columns: 280px minmax(0, 1fr);
  }
  .course-library-page .admin-course-section-body.admin-course-basic-grid {
    grid-template-columns: 1fr;
  }
  .course-library-page .admin-inline-course-media-grid {
    grid-template-columns: 1fr;
  }
}
.course-library-page .admin-question-editor {
  border: 1px solid var(--course-border);
  border-radius: 10px;
  padding: 12px;
  background: #f8fafc;
  display: grid;
  gap: 10px;
}
.course-library-page .admin-question-title-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 38px;
  gap: 8px;
  align-items: end;
}
.course-library-page .admin-question-title-row button,
.course-library-page .admin-question-result article button {
  min-height: 38px;
  border: 1px solid var(--course-border);
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font-weight: 700;
}
.course-library-page .admin-question-title-row button.remove,
.course-library-page .admin-question-result article button {
  border-color: #fecaca;
  background: #fff7f7;
  color: #dc2626;
}
.course-library-page .admin-question-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.course-library-page .admin-question-options label {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}
.course-library-page .admin-question-options span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--course-text);
  font-weight: 700;
}
.course-library-page .admin-document-status,
.course-library-page .admin-question-result {
  border: 1px solid #e7e3ff;
  border-radius: 10px;
  padding: 10px;
  background: #faf9ff;
  display: grid;
  gap: 5px;
}
.course-library-page .admin-document-status.success {
  border-color: #bbf7d0;
  background: #f0fdf4;
}
.course-library-page .admin-document-status.error {
  border-color: #fecaca;
  background: #fff7f7;
}
.course-library-page .admin-document-status strong {
  color: #0f172a;
}
.course-library-page .admin-document-status span,
.course-library-page .admin-document-status em {
  color: var(--course-muted);
  font-size: 12px;
  font-style: normal;
  line-height: 1.5;
}
.course-library-page .admin-question-empty {
  margin: 0;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  padding: 12px;
  color: var(--course-muted);
  background: #fff;
}
.course-library-page .admin-question-result article {
  border-top: 1px solid #e2e8f0;
  padding-top: 8px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}
.course-library-page .admin-question-result article strong {
  grid-column: 1 / -1;
  color: #0f172a;
  font-size: 13px;
}
.course-library-page .admin-question-result article span {
  min-width: 0;
}
.course-library-page .admin-question-result article em {
  color: var(--course-accent);
  font-size: 12px;
  font-style: normal;
  font-weight: 700;
}
.course-library-page .course-auth-groups label {
  min-height: 68px;
  border-radius: 10px;
  background: #fff;
}
.course-library-page .pagination-bar {
  border-top: 1px solid var(--course-border);
  padding-top: 8px;
}
.h5-center-page {
  --h5-blue: var(--color-primary);
  --h5-cyan: #20c7d9;
  --h5-ink: #10254c;
  display: grid;
  gap: 18px;
  min-width: 0;
}
.h5-center-heading,
.h5-section-heading,
.h5-preview-title,
.h5-list-heading,
.h5-center-footer,
.h5-choice-control,
.h5-audit-rule-grid article {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.h5-center-heading h2,
.h5-section-heading h3,
.h5-agent-bridge h3 { margin: 0; color: #10254c; }
.h5-center-heading h2 { font-size: 28px; letter-spacing: -.04em; }
.h5-center-heading p,
.h5-section-heading p,
.h5-agent-bridge p { margin: 7px 0 0; color: #7081a0; font-size: 13px; }
.h5-center-context { display: flex; align-items: center; justify-content: flex-end; gap: 14px; }.h5-center-context label { display: flex; align-items: center; gap: 8px; color: #60708a; font-size: 13px; font-weight: 600; }.h5-center-context select { min-height: 36px; border: 1px solid #cbdcf3; border-radius: 10px; padding: 0 10px; background: #fff; color: #1c4a82; font-weight: 600; }
.h5-server-state { color: #426080; font-size: 13px; font-weight: 600; }
.h5-server-state i { display: inline-block; width: 9px; height: 9px; margin-right: 7px; border-radius: 50%; background: #16a34a; }
.h5-center-tabs { display: flex; gap: 34px; border-bottom: 1px solid #e2eaf6; }
.h5-center-tabs button { border: 0; border-bottom: 3px solid transparent; padding: 0 0 13px; background: transparent; color: #536582; cursor: pointer; font-size: 15px; font-weight: 700; }
.h5-center-tabs button.active { color: var(--h5-blue); border-bottom-color: var(--h5-blue); }
/* 旧方案页签：可见但点不动，明确告诉老师「已停用」，不是坏了 */
.h5-center-tabs button.is-retired,
.h5-center-tabs button.is-retired:hover {
  color: #b9c2cf;
  cursor: not-allowed;
  border-bottom-color: transparent;
}
.h5-center-tabs button.is-retired span { text-decoration: line-through; }
.h5-tab-retired {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #eef1f5;
  color: #9aa5b4;
  font-size: 10px;
  font-style: normal;
  font-weight: 600;
  vertical-align: middle;
}
.h5-retired-notice {
  margin: 14px 0 0;
  padding: 10px 14px;
  border: 1px dashed #d9dfe8;
  border-radius: 10px;
  background: #fafbfc;
  color: #77828f;
  font-size: 12.5px;
  line-height: 1.75;
}
.h5-retired-notice b { margin-right: 6px; color: #4c5766; }
.h5-visual-config-page { display: grid; gap: 16px; }
.h5-visual-heading-controls { display:flex; align-items:flex-end; gap:10px; flex-wrap:wrap; }
.h5-visual-switch-card, .h5-visual-order-card, .h5-visual-page-card { border: 1px solid #dce7f5; border-radius: 12px; background: #fff; padding: 16px; }
.h5-visual-switch-card { display:flex; align-items:center; justify-content:space-between; gap: 16px; }
.h5-visual-switch-card small, .h5-visual-card-heading span { display:block; color:#71829b; font-size:12px; margin-top:5px; }
.h5-visual-switch-card button, .h5-choice-control button { width:44px; height:24px; border:0; border-radius:999px; background:#cbd5e1; padding:3px; cursor:pointer; }
.h5-visual-switch-card button i, .h5-choice-control button i { display:block; width:18px; height:18px; border-radius:50%; background:#fff; transition:transform .2s; }
.h5-visual-switch-card button.on, .h5-choice-control button.on { background:var(--color-primary); }
.h5-visual-switch-card button.on i, .h5-choice-control button.on i { transform:translateX(20px); }
.h5-visual-notice { padding:12px 14px; border-radius: 10px; background:#fff7ed; color:#9a5a14; font-size:13px; }
.h5-visual-notice button { margin-left:8px; border:1px solid #f0b36b; border-radius:7px; padding:6px 9px; background:#fff; color:#9a5a14; cursor:pointer; font-weight: 600; }
.h5-visual-card-heading { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
.h5-visual-order-list { display:flex; gap:8px; flex-wrap:wrap; }
.h5-visual-order-item { display:flex; align-items:center; gap:8px; border:1px solid #e2e8f0; border-radius: 10px; padding:7px 9px; color:#334155; font-size:13px; }
.h5-visual-order-item b { color:var(--color-primary); }
.h5-visual-order-item button { border:0; background:transparent; color:#52709b; cursor:pointer; }
.h5-visual-order-item button:disabled { opacity:.3; cursor:not-allowed; }
.h5-visual-pages-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.h5-visual-page-card { display:grid; gap:10px; }
.h5-visual-page-card-head { display:flex; justify-content:space-between; align-items:center; }
.h5-reference-editor { display:grid; gap:9px; padding:12px; border:1px solid #d8e5f5; border-radius:9px; background:#f7fbff; }
.h5-reference-heading { display:flex; justify-content:space-between; align-items:center; color:#274971; font-size:12px; font-weight: 700; }
.h5-reference-heading small { color:#7990ae; }
.h5-reference-list { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
.h5-reference-list figure { position:relative; overflow:hidden; aspect-ratio:1/2; margin:0; border:1px solid #cddcee; border-radius:7px; background:#eaf2fc; }
.h5-reference-list img { width:100%; height:100%; object-fit:cover; display:block; }
.h5-reference-list button { position:absolute; right:4px; top:4px; width:24px; height:24px; border:0; border-radius:50%; background:rgba(13,32,61,.82); color:#fff; cursor:pointer; font-size:17px; line-height:1; }
.h5-reference-empty { min-height:88px; display:grid; place-items:center; padding:12px; border:1px dashed #b9cce4; border-radius: 10px; color:#7187a4; text-align:center; font-size:12px; line-height:1.55; }
.h5-reference-upload { min-height:36px; display:flex !important; align-items:center; justify-content:center; border:1px solid #8fb4e5; border-radius: 10px; background:#fff; color:#205da9 !important; cursor:pointer; }
.h5-reference-upload.disabled { opacity:.5; cursor:not-allowed; }
.h5-reference-upload input { display:none; }
.h5-reference-strength { display:grid; grid-template-columns:1fr 42px; align-items:center; gap:8px; }
.h5-reference-strength input { padding:0; }
.h5-reference-strength b { color:#2369d2; text-align:right; }
.h5-visual-page-card label { display:grid; gap:5px; color:#63748c; font-size:12px; font-weight:700; }
.h5-visual-page-card input, .h5-visual-page-card textarea, .h5-visual-page-card select { width:100%; border:1px solid #d9e3f0; border-radius:7px; padding:8px 9px; font:inherit; color:#1f3555; background:#fbfdff; box-sizing:border-box; }
.h5-visual-source-types { display:flex; align-items:center; flex-wrap:wrap; gap:8px; color:#63748c; font-size:12px; }
.h5-visual-source-types label, .h5-visual-inline-check { display:flex !important; align-items:center; gap:4px; font-weight:600 !important; }
@media (max-width: 1100px) { .h5-visual-pages-grid { grid-template-columns:1fr; } }
.h5-edition-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 15px; }
.h5-edition-card { min-height: 156px; position: relative; overflow: hidden; padding: 20px; border: 1px solid #e2eaf6; border-radius: 14px; background: #fff; color: #10254c; text-align: left; cursor: pointer; display: grid; grid-template-columns: 54px 1fr; gap: 13px; align-content: start; transition: .2s ease; }
.h5-edition-card:hover { transform: translateY(-2px); box-shadow: 0 10px 22px rgba(30, 73, 135, .09); }
.h5-edition-card.active { border-color: var(--h5-blue); box-shadow: 0 0 0 2px rgba(22,119,255,.08); }
.h5-edition-card.empty { background: linear-gradient(180deg, #fff, #fafcff); }
.h5-edition-icon { width: 54px; height: 54px; display: grid; place-items: center; border-radius: 15px; background: #edf4ff; color: var(--h5-blue); font-size: 19px; font-weight: 700; }
.h5-edition-card strong,.h5-edition-card small,.h5-edition-card b { display: block; }
.h5-edition-card strong { padding-top: 4px; font-size: 17px; }
.h5-edition-card small { margin-top: 5px; color: #71819c; }
.h5-edition-card em { position: absolute; right: 15px; top: 18px; border-radius: 5px; padding: 4px 7px; background: #e9f8ef; color: #15924d; font-size: 12px; font-style: normal; font-weight: 700; }
.h5-edition-card em.unconfigured { background: #f1f4f8; color: #748198; }
.h5-edition-card em.disabled { background: #fff1ed; color: #d85d3c; }
.h5-edition-card b { grid-column: 1 / -1; margin-top: 5px; color: #596a84; font-size: 13px; }
.h5-edition-workspace,.h5-style-workspace { display: grid; grid-template-columns: minmax(0, 1.22fr) minmax(360px, .78fr); gap: 16px; align-items: stretch; }
.h5-edition-settings,.h5-style-editor,.h5-live-preview,.h5-agent-bridge,.h5-audit-overview { border: 1px solid #e1eaf7; border-radius: 14px; background: #fff; box-shadow: 0 8px 24px rgba(38, 75, 125, .05); }
.h5-edition-settings,.h5-style-editor,.h5-audit-overview { padding: 22px; }
.h5-status-select { display: flex; align-items: center; gap: 8px; color: #60708a; font-size: 13px; font-weight: 600; }
.h5-status-select select,.h5-section-heading > select,.h5-setting-list select,.h5-polished-form input,.h5-polished-form select { min-height: 38px; border: 1px solid #dce6f4; border-radius: 10px; padding: 0 10px; background: #fff; color: #283b5b; }
.h5-setting-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 20px 0; }
.h5-setting-list label,.h5-polished-form label { display: grid; gap: 7px; color: #344766; font-size: 13px; font-weight: 700; }
.h5-choice-control { padding: 15px 0; border-top: 1px solid #edf2f8; border-bottom: 1px solid #edf2f8; }
.h5-choice-control strong,.h5-choice-control small { display: block; }
.h5-choice-control small { margin-top: 5px; color: #7a8aa4; font-size: 12px; }
.h5-choice-control button { width: 44px; height: 24px; border: 0; border-radius: 99px; padding: 3px; background: #cfd9e7; cursor: pointer; transition: .2s; }
.h5-choice-control button i { display: block; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: .2s; }
.h5-choice-control button.on { background: var(--h5-blue); }.h5-choice-control button.on i { transform: translateX(20px); }
.h5-allowed-templates { padding-top: 17px; }.h5-allowed-templates > strong { color: #334766; font-size: 13px; }.h5-allowed-templates > div { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
.h5-allowed-templates label { display: flex; align-items: center; min-height: 42px; gap: 8px; border: 1px solid #e1eaf7; border-radius: 10px; padding: 7px; color: #546681; font-size: 12px; cursor: pointer; }.h5-allowed-templates label.selected { border-color: #7eb4ff; background: #f5f9ff; color: #155fcf; font-weight: 600; }.h5-allowed-templates label span { width: 20px; height: 20px; border-radius: 8px; }
.h5-live-preview { min-width: 0; padding: 17px; background: radial-gradient(circle at 50% 38%, #e9f8ff 0, #f8fcff 52%, #fff 100%); }.h5-preview-title strong { color: #203758; }.h5-preview-title span { border: 1px solid #bed8ff; border-radius: 7px; padding: 6px 9px; color: #1768d4; font-size: 12px; font-weight: 600; }
.h5-tablet-frame { margin: 18px auto 10px; max-width: 540px; padding: 8px; border-radius: 30px; background: #101827; box-shadow: 0 10px 28px rgba(22, 67, 127, .2); }.h5-tablet-cover { min-height: 292px; padding: 28px; border-radius: 23px; background: linear-gradient(135deg, rgba(255,255,255,.94), rgba(235,249,255,.75)), linear-gradient(135deg, var(--h5-admin-secondary), var(--h5-admin-bg)); color: var(--h5-admin-primary); display: grid; align-content: space-between; }.h5-tablet-cover small { color: #497497; font-weight: 600; }.h5-tablet-cover h3 { margin: 20px 0 0; font-size: 35px; line-height: 1.08; letter-spacing: -.05em; }.h5-tablet-cover p { margin: 10px 0; color: #456e8f; font-size: 13px; font-weight: 600; }.h5-tablet-cover button { align-self: end; width: 155px; min-height: 39px; border: 0; border-radius: 99px; background: #fff; color: var(--h5-admin-primary); box-shadow: 0 5px 12px rgba(16, 57, 109, .12); font-weight: 700; }.h5-preview-dots { display: flex; justify-content: center; gap: 8px; }.h5-preview-dots i { width: 7px; height: 7px; border-radius: 50%; background: #cdd9e8; }.h5-preview-dots i.active { background: var(--h5-blue); }
.h5-style-workspace { grid-template-columns: 270px minmax(0, 1fr) minmax(360px, .86fr); }.h5-style-list { border: 1px solid #e1eaf7; border-radius: 14px; padding: 14px; background: #fff; }.h5-list-heading { margin-bottom: 13px; color: #233957; }.h5-list-heading button,.h5-copy-template { border: 1px solid #9bc5ff; border-radius: 7px; padding: 7px 9px; background: #fff; color: #1669dc; cursor: pointer; font-weight: 600; }.h5-search-input { display: flex; align-items: center; gap: 7px; margin-bottom: 12px; border: 1px solid #dce6f4; border-radius: 10px; padding: 0 9px; color: #8291a8; }.h5-search-input input { width: 100%; min-height: 37px; border: 0; outline: 0; }.h5-style-list article { position: relative; min-height: 76px; grid-template-columns: 46px minmax(0, 1fr); padding: 9px; }.h5-style-list article b { position: absolute; right: 10px; top: 9px; display: grid; width: 20px; height: 20px; place-items: center; border-radius: 50%; background: var(--color-primary); color: #fff; }.h5-copy-template { width: 100%; margin-top: 12px; }.h5-style-editor { min-width: 0; }.h5-style-steps { display: flex; gap: 17px; margin: 18px 0; border-bottom: 1px solid #edf2f8; overflow: auto; }.h5-style-steps button { white-space: nowrap; border: 0; border-bottom: 2px solid transparent; padding: 0 0 10px; background: transparent; color: #8796ab; font-weight: 600; }.h5-style-steps button.active { border-color: var(--color-primary); color: var(--color-primary); }.h5-polished-form { margin-bottom: 18px; }.h5-polished-form input[type='color'] { width: 100%; padding: 4px; }.h5-element-switches { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding-top: 16px; border-top: 1px solid #edf2f8; }.h5-element-switches strong { grid-column: 1 / -1; color: #344766; font-size: 13px; }.h5-element-switches label { display: flex; align-items: center; justify-content: space-between; color: #63758f; font-size: 12px; }.h5-element-switches input { accent-color: var(--color-primary); }.h5-module-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }.h5-module-chips label { display: inline-flex; align-items: center; gap: 4px; border: 1px solid #dfe8f4; border-radius: 7px; padding: 5px 6px; color: #5b6d86; font-size: 12px; }.h5-module-chips button { border: 0; padding: 0 2px; background: transparent; color: #6683ad; cursor: pointer; }.h5-style-preview { padding: 17px; }
.h5-style-list article img { width: 46px; height: 56px; border-radius: 10px; object-fit: cover; }.h5-unsaved { border-radius: 999px; padding: 4px 8px; background: #fff2df; color: #d66b00; font-size: 12px; }.h5-product-story-hint { margin: 0 0 18px; border: 1px solid #b9d8ff; border-radius: 10px; padding: 12px 14px; background: linear-gradient(135deg,#edf7ff,#f6f3ff); color: #2e5484; }.h5-product-story-hint strong { color: #1559d6; }.h5-product-story-hint p { margin: 6px 0 0; font-size: 12px; line-height: 1.65; }.h5-cover-editor,.h5-module-editor,.h5-poster-editor { min-height: 310px; display: grid; align-content: start; gap: 14px; }.h5-cover-image,.h5-cover-empty { min-height: 190px; border-radius: 12px; background-position: center; background-size: cover; }.h5-cover-empty { display: grid; place-items: center; border: 1px dashed #b9cce5; background: #f7faff; color: #7b8ca5; }.h5-upload-button { width: fit-content; border-radius: 10px; padding: 10px 14px; background: #eaf4ff; color: #176bd8; cursor: pointer; font-weight: 700; }.h5-upload-button input { display: none; }.h5-cover-editor > label:not(.h5-upload-button) { display: grid; gap: 7px; color: #536985; font-size: 12px; font-weight: 600; }.h5-cover-editor input { min-height: 40px; border: 1px solid #dce6f4; border-radius: 10px; padding: 0 10px; }.h5-cover-editor p { color: #7b8ba3; font-size: 12px; line-height: 1.6; }.h5-editor-actions { margin-top: 20px; display: flex; justify-content: flex-end; gap: 8px; }.h5-editor-actions button { min-height: 40px; border: 1px solid #d7e2f0; border-radius: 10px; padding: 0 14px; background: #fff; color: #4b6385; cursor: pointer; }.h5-editor-actions .danger { color: #dc4b4b; }.h5-poster-preview { width: 210px; min-height: 285px; margin: auto; border-radius: 16px; padding: 18px; box-sizing: border-box; display: grid; align-content: end; background-position: center; background-size: cover; color: #fff; box-shadow: 0 16px 34px rgba(28, 57, 96, .2); text-shadow: 0 2px 12px rgba(0,0,0,.55); }.h5-poster-preview span,.h5-poster-preview strong,.h5-poster-preview i { display: block; }.h5-poster-preview strong { margin-top: 6px; font-size: 22px; }.h5-poster-preview i { margin-top: 12px; font-size: 11px; font-style: normal; }.h5-preview-title div { display: flex; gap: 5px; }.h5-preview-title button { min-height: 30px; border: 1px solid #c9dbf3; border-radius: 7px; background: #fff; color: #617593; }.h5-preview-title button.active { border-color: var(--color-primary); background: var(--color-primary); color: #fff; }.h5-style-preview :deep(.report-device-frame) { min-height: 340px; }.h5-style-preview :deep(.report-page) { min-height: 250px; padding: 22px; }.h5-style-preview :deep(.report-art),.h5-style-preview :deep(.report-empty) { min-height: 190px; }.h5-style-preview :deep(.report-copy h2) { font-size: 28px; }.h5-style-preview :deep(.report-copy p) { font-size: 12px; }.h5-style-preview :deep(.story-page) { min-height: 340px; padding: 15px; }.h5-style-preview :deep(.story-copy h2) { font-size: 25px; }.h5-style-preview :deep(.story-copy p) { font-size: 11px; }.h5-style-preview :deep(.story-image.main) { min-height: 165px; }.h5-student-test { width: 100%; min-height: 40px; margin-top: 12px; border: 1px solid #9bc5ff; border-radius: 10px; background: #fff; color: #1669dc; font-weight: 700; cursor: pointer; }
.h5-agent-bridge { min-height: 340px; padding: 38px; display: flex; align-items: center; justify-content: space-between; gap: 40px; background: linear-gradient(135deg, #f3f8ff, #fff); }.h5-agent-bridge > div:first-child { max-width: 650px; }.h5-agent-bridge > div > span { color: var(--color-primary); font-weight: 700; }.h5-agent-bridge h3 { margin-top: 12px; font-size: 28px; }.h5-agent-bridge p { max-width: 620px; font-size: 14px; line-height: 1.8; }.h5-agent-tags { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 22px; }.h5-agent-tags b { border-radius: 7px; padding: 7px 10px; background: #eaf4ff; color: #2c6dcc; font-size: 12px; }.h5-agent-actions { display: grid; gap: 10px; min-width: 190px; }.h5-agent-actions button:not(.admin-primary-btn) { min-height: 38px; border: 1px solid #d9e5f5; border-radius: 10px; background: #fff; color: #4d6382; cursor: pointer; }
.h5-agent-status-card { padding: 28px; border: 1px solid #e1eaf7; border-radius: 14px; background: linear-gradient(135deg, #f6faff 0%, #fff 60%); box-shadow: 0 8px 24px rgba(38, 75, 125, .05); }.h5-agent-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }.h5-agent-card-head span { color: var(--color-primary); font-weight: 700; }.h5-agent-card-head h3 { margin: 10px 0 0; color: #10254c; font-size: 25px; }.h5-agent-card-head p { max-width: 700px; margin: 9px 0 0; color: #7081a0; font-size: 13px; line-height: 1.7; }.h5-agent-card-head em { flex: 0 0 auto; border-radius: 999px; padding: 7px 10px; background: #e8f8ee; color: #169655; font-size: 12px; font-style: normal; font-weight: 700; }.h5-agent-card-head em.error { background: #fff0ed; color: #d75a3f; }.h5-agent-card-head em.fallback { background: #f1f4f8; color: #697a94; }.h5-agent-summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 24px; }.h5-agent-summary-grid article { min-height: 120px; padding: 15px; border: 1px solid #e1eaf7; border-radius: 11px; background: #fff; }.h5-agent-summary-grid span,.h5-agent-summary-grid strong,.h5-agent-summary-grid small { display: block; }.h5-agent-summary-grid span { color: #7a8ba5; font-size: 12px; }.h5-agent-summary-grid strong { margin-top: 9px; color: #1c3558; font-size: 14px; line-height: 1.45; }.h5-agent-summary-grid small { margin-top: 7px; color: #8391a6; font-size: 12px; line-height: 1.45; }.h5-agent-binding-control { display: grid; grid-template-columns: minmax(280px, .7fr) 1fr; gap: 18px; align-items: end; margin-top: 19px; padding: 17px; border-radius: 10px; background: #edf6ff; }.h5-agent-binding-control label { display: grid; gap: 7px; color: #345477; font-size: 13px; font-weight: 700; }.h5-agent-binding-control select { min-height: 39px; border: 1px solid #c8ddf9; border-radius: 10px; padding: 0 10px; background: #fff; color: #244e7c; }.h5-agent-binding-control p { margin: 0; color: #617c9b; font-size: 12px; line-height: 1.6; }.h5-agent-status-card .h5-agent-actions { margin-top: 22px; display: flex; justify-content: flex-end; }.h5-agent-status-card .h5-agent-actions button { min-width: 160px; }
.h5-audit-rule-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 20px; }.h5-audit-rule-grid article { padding: 16px; border: 1px solid #e1eaf7; border-radius: 10px; }.h5-audit-rule-grid article i { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 10px; background: #e6f8ee; color: #16a34a; font-style: normal; font-weight: 700; }.h5-audit-rule-grid strong,.h5-audit-rule-grid span { display: block; }.h5-audit-rule-grid span { margin-top: 4px; color: #7b8aa0; font-size: 12px; line-height: 1.4; }.h5-audit-rule-grid b { color: #169655; font-size: 12px; white-space: nowrap; }
.h5-audit-filters { margin: 20px 0 12px; display: flex; gap: 8px; flex-wrap: wrap; }.h5-audit-filters button { min-height: 36px; border: 1px solid #dce6f3; border-radius: 999px; padding: 0 13px; background: #fff; color: #61748e; }.h5-audit-filters button.active { border-color: var(--color-primary); background: #eaf4ff; color: #1768d4; font-weight: 700; }.h5-audit-empty { min-height: 180px; display: grid; place-items: center; border: 1px dashed #d6e2f1; border-radius: 12px; color: #7d8da5; }.h5-report-review-list { display: grid; gap: 10px; }.h5-report-review-list article { display: grid; grid-template-columns: 74px minmax(0, 1fr) auto; gap: 14px; align-items: center; border: 1px solid #e1eaf7; border-radius: 12px; padding: 10px; }.h5-report-review-list img { width: 74px; height: 58px; border-radius: 10px; object-fit: cover; background: #edf3fa; }.h5-report-review-list strong,.h5-report-review-list span,.h5-report-review-list small { display: block; }.h5-report-review-list span { margin-top: 5px; color: #667992; font-size: 12px; }.h5-report-review-list small { margin-top: 4px; color: #8a99ae; }.h5-report-review-list article > div:last-child { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }.h5-report-review-list button,.h5-report-review-list a { min-height: 34px; border: 1px solid #d8e3f1; border-radius: 7px; padding: 0 10px; display: inline-flex; align-items: center; background: #fff; color: #4d6687; text-decoration: none; }.h5-report-review-list .approve { border-color: #a8dec0; color: #16864e; }.h5-report-review-list .danger { border-color: #f0c7c7; color: #c84545; }
.h5-center-footer { border-top: 1px solid #e4ebf5; padding-top: 16px; color: #75849b; font-size: 12px; }.h5-center-footer > div { display: flex; gap: 10px; }.h5-center-footer button:not(.admin-primary-btn) { min-height: 38px; border: 1px solid #d7e2f0; border-radius: 10px; padding: 0 13px; background: #fff; color: #4b6385; cursor: pointer; }
.h5-style-steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; overflow: visible; }
.h5-style-steps button { min-width: 0; padding: 0 2px 10px; font-size: 12px; white-space: normal; }
.h5-strategy-page { min-width: 0; }.h5-strategy-note { color: #7a8ba5; font-size: 12px; }.h5-strategy-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin: 18px 0; }.h5-strategy-card { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; align-items: center; gap: 11px; min-height: 78px; border: 1px solid #dfe8f4; border-radius: 12px; padding: 12px; background: #fff; color: #243957; text-align: left; cursor: pointer; }.h5-strategy-card.active { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(22,119,255,.1); }.h5-strategy-index { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 50%; background: #edf4ff; color: #1768d4; font-weight: 700; }.h5-strategy-card strong, .h5-strategy-card small { display: block; }.h5-strategy-card small { margin-top: 5px; color: #7b8ca5; font-size: 11px; }.h5-strategy-card em { border-radius: 999px; padding: 4px 8px; background: #eef3f8; color: #718198; font-size: 11px; font-style: normal; white-space: nowrap; }.h5-strategy-card em.enabled { background: #e5f7ed; color: #198754; }.h5-strategy-card em.testing { background: #fff3df; color: #bf7415; }.h5-strategy-card em.disabled { background: #f5e9e9; color: #b45454; }.h5-strategy-editor { border: 1px solid #e1eaf7; border-radius: 14px; padding: 18px; background: #fbfdff; }.h5-strategy-actions { display: flex; align-items: center; gap: 12px; margin-top: 12px; color: #73849d; font-size: 12px; }.h5-strategy-actions button { min-height: 35px; border: 1px solid #b8d1f3; border-radius: 10px; padding: 0 11px; background: #fff; color: #2466bd; cursor: pointer; font-weight: 600; }.h5-inline-check { display: flex !important; align-items: center; justify-content: space-between; min-height: 38px; }
@media (max-width: 1350px) { .h5-style-workspace { grid-template-columns: 220px minmax(0, 1fr) 330px; }.h5-style-preview { grid-column: auto; }.h5-edition-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 1140px) { .h5-style-workspace { grid-template-columns: 250px minmax(0, 1fr); }.h5-style-preview { grid-column: 1 / -1; } }
@media (max-width: 960px) { .h5-edition-workspace,.h5-style-workspace { grid-template-columns: 1fr; }.h5-style-preview { grid-column: auto; }.h5-audit-rule-grid { grid-template-columns: 1fr; } }
@media (max-width: 1080px) { .h5-agent-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.h5-agent-binding-control { grid-template-columns: 1fr; }.h5-center-heading { align-items: flex-start; }.h5-center-context { flex-wrap: wrap; justify-content: flex-start; } }
.h5-template-admin {
  display: grid;
  gap: 16px;
}
.h5-template-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.h5-template-list {
  display: grid;
  gap: 10px;
}
.h5-template-list article {
  min-height: 92px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 12px;
  background: #fff;
  cursor: pointer;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}
.h5-template-list article.active {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(255, 122, 0, .14);
}
.h5-template-list i {
  width: 48px;
  height: 48px;
  border-radius: 10px;
}
.h5-template-list strong,
.h5-template-list span,
.h5-template-list small {
  display: block;
}
.h5-template-list span,
.h5-template-list small {
  margin-top: 4px;
  color: var(--color-muted);
  line-height: 1.35;
}
.h5-template-form {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 14px;
  background: #fff;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 16px;
}
.h5-preview-phone {
  --h5-admin-primary: #f97316;
  --h5-admin-secondary: #14b8a6;
  --h5-admin-accent: #facc15;
  --h5-admin-bg: #fff7ed;
  --h5-admin-surface: #fff;
  --h5-admin-text: #334155;
  min-height: 520px;
  border-radius: 18px;
  padding: 18px;
  background: var(--h5-admin-bg);
  color: var(--h5-admin-text);
  box-shadow: inset 0 0 0 8px #111827;
  display: grid;
  gap: 10px;
  align-content: start;
}
.phone-cover,
.phone-section {
  border-radius: 10px;
  background: var(--h5-admin-surface);
  padding: 12px;
}
.phone-cover {
  min-height: 150px;
  display: grid;
  align-content: end;
  color: var(--h5-admin-primary);
}
.phone-cover span,
.phone-cover strong {
  display: block;
}
.phone-cover strong {
  margin-top: 8px;
  font-size: 22px;
  line-height: 1.18;
}
.phone-section {
  min-height: 42px;
  color: var(--h5-admin-primary);
  font-weight: 700;
}
.h5-preview-phone button {
  min-height: 42px;
  border: 0;
  border-radius: 10px;
  background: var(--h5-admin-primary);
  color: #fff;
  font-weight: 700;
}
.h5-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.h5-form-grid .full,
.h5-module-config,
.h5-form-actions {
  grid-column: 1 / -1;
}
.h5-form-grid label {
  display: grid;
  gap: 6px;
  color: var(--color-title);
  font-weight: 700;
}
.h5-form-grid input,
.h5-form-grid textarea,
.h5-form-grid select {
  min-height: 42px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 8px 10px;
}
.h5-form-grid textarea {
  min-height: 86px;
  resize: vertical;
}
.h5-module-config {
  margin-top: 12px;
  display: grid;
  gap: 8px;
}
.h5-module-row {
  min-height: 42px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 8px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
}
.h5-module-row label {
  display: flex;
  align-items: center;
  gap: 8px;
}
.h5-module-row button,
.h5-form-actions button {
  min-height: 34px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  font-weight: 700;
}
.h5-form-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.h5-form-actions .danger {
  color: #dc2626;
}

/* ── AI 用量与计费面板 ─────────────────────────────────────────── */
.credit-billing-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  /* admin-main 是 grid，网格项默认可被内容撑宽 → 显式允许收缩，横向滚动留在表格内部 */
  min-width: 0;
}
.billing-head-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.billing-error,
.billing-notice {
  margin: 0;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
}
.billing-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
}
.billing-notice {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #15803d;
}
.billing-block {
  border: 1px solid #e5eaf0;
  border-radius: 14px;
  background: #fff;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.billing-block-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.billing-block-head h3 {
  margin: 0 0 6px;
  font-size: 15px;
  color: #111827;
}
.billing-block-head p {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: #6b7280;
  max-width: 720px;
}
.billing-tip {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: #94a3b8;
}
.billing-ability-table,
.billing-model-table {
  display: flex;
  flex-direction: column;
  border: 1px solid #eef2f7;
  border-radius: 10px;
  /* 窄屏（平板竖屏/1280 以下）让表格自己横向滚，别把整个后台撑出横向滚动条 */
  overflow-x: auto;
  overflow-y: hidden;
}
.billing-ability-head,
.billing-model-head {
  display: grid;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: #f8fafc;
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
}
.billing-ability-head,
.billing-ability-row {
  grid-template-columns: minmax(150px, 1.2fr) minmax(120px, 1fr) minmax(120px, 1fr) 90px;
}
.billing-model-head,
.billing-model-row {
  grid-template-columns: 90px minmax(110px, 0.9fr) minmax(180px, 1.4fr) minmax(120px, 1fr) 120px;
}
.billing-ability-row,
.billing-model-row {
  display: grid;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-top: 1px solid #eef2f7;
  font-size: 13px;
  color: #1f2937;
}
.billing-ability-name {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.billing-ability-name strong {
  font-size: 13.5px;
  color: #111827;
}
.billing-ability-name small {
  font-size: 11.5px;
  color: #9ca3af;
}
.billing-model-name {
  font-size: 13px;
  color: #111827;
  word-break: break-all;
}
.billing-input {
  display: flex;
  align-items: center;
  gap: 6px;
}
.billing-input input {
  width: 76px;
  height: 32px;
  border: 1px solid #dbe3ec;
  border-radius: 10px;
  padding: 0 8px;
  font-size: 13px;
  color: #111827;
  background: #fff;
}
.billing-input input:focus {
  outline: none;
  border-color: #ff7a00;
  box-shadow: 0 0 0 3px rgba(255, 122, 0, 0.12);
}
.billing-input em {
  font-style: normal;
  font-size: 11.5px;
  color: #9ca3af;
  white-space: nowrap;
}
.billing-model-clear {
  height: 28px;
  min-height: 0;
  border: 1px solid #dbe3ec;
  background: #fff;
  border-radius: 10px;
  padding: 0 10px;
  font-size: 12px;
  color: #64748b;
  cursor: pointer;
}
.billing-model-clear.is-default {
  border-style: dashed;
  color: #b0b8c4;
  cursor: default;
}
.billing-message-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}
.billing-message-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.billing-message-item > span {
  font-size: 12.5px;
  font-weight: 700;
  color: #374151;
}
.billing-message-item textarea {
  width: 100%;
  border: 1px solid #dbe3ec;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 13px;
  line-height: 1.6;
  color: #111827;
  resize: vertical;
  font-family: inherit;
}
.billing-message-item textarea:focus {
  outline: none;
  border-color: #ff7a00;
  box-shadow: 0 0 0 3px rgba(255, 122, 0, 0.12);
}
.billing-message-item small {
  font-size: 11px;
  color: #9ca3af;
  word-break: break-all;
}
.billing-message-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
@media (max-width: 1080px) {
  .billing-ability-head,
  .billing-ability-row {
    grid-template-columns: minmax(110px, 1fr) minmax(100px, 1fr) minmax(100px, 1fr) 70px;
  }
  .billing-model-head,
  .billing-model-row {
    grid-template-columns: 76px minmax(90px, 1fr) minmax(140px, 1.4fr) minmax(100px, 1fr) 100px;
  }
  /* 表格容器内部滚动：给行一个下限宽度，列才不会被压成一团 */
  .billing-ability-head,
  .billing-ability-row {
    min-width: 430px;
  }
  .billing-model-head,
  .billing-model-row {
    min-width: 620px;
  }
}
@media (max-width: 760px) {
  .billing-ability-head,
  .billing-model-head {
    display: none;
  }
  .billing-ability-row,
  .billing-model-row {
    grid-template-columns: 1fr;
    gap: 8px;
    padding: 14px;
  }
  .billing-message-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1280px) {
  .course-library-page .admin-library-toolbar {
    grid-template-columns: 1fr 1fr;
  }
  .course-library-page .course-search-field {
    justify-self: stretch;
    justify-content: space-between;
  }
}
@media (max-width: 760px) {
  .api-config-tabs,
  .provider-list-toolbar,
  .provider-list-actions {
    align-items: stretch;
    flex-direction: column;
  }
  .api-config-tabs button,
  .provider-list-actions button {
    width: 100%;
  }
  .provider-model-manager-head,
  .provider-model-manager-actions,
  .provider-model-add-row,
  .provider-upstream-row,
  .provider-model-list article {
    grid-template-columns: 1fr;
  }
  .provider-model-manager-head {
    display: grid;
  }
  .provider-model-manager-head button,
  .provider-model-manager-actions button,
  .provider-model-add-row button,
  .provider-upstream-row button,
  .provider-model-list button {
    width: 100%;
  }
  .audit-summary-grid { grid-template-columns: 1fr; }
  .audit-settings-row .audit-threshold { grid-template-columns: 1fr; }
  .admin-course-page.course-library-page {
    min-height: auto;
    padding: 14px;
  }
  .course-library-page .library-title-row {
    flex-direction: column;
  }
  .course-library-stats,
  .course-library-page .admin-library-toolbar,
  .course-library-page .course-category-panel,
  .course-library-page .admin-course-form,
  .course-library-page .course-auth-panel,
  .course-library-page .course-auth-groups,
  .course-library-page .admin-question-options,
  .course-library-page .admin-course-upload-layout,
  .course-library-page .admin-inline-course-media-grid {
    grid-template-columns: 1fr;
  }
  .course-library-page .admin-question-title-row {
    grid-template-columns: 1fr 44px;
  }
  .course-library-page .toolbar-group {
    width: 100%;
  }
  .course-library-page .toolbar-group + .toolbar-group {
    padding-left: 0;
    padding-top: 10px;
    border-left: 0;
    border-top: 1px solid var(--course-border);
  }
  .course-library-page .edu-toolbar button,
  .course-library-page .batch-action-field,
  .course-library-page .batch-action-field select,
  .course-library-page .admin-upload-field button,
  .course-library-page .course-search-field,
  .course-library-page .course-search-field input {
    width: 100%;
  }
  .course-library-page .admin-library-filter {
    align-items: flex-start;
  }
  .course-library-page .admin-library-filter span,
  .course-library-page .pagination-bar span {
    flex-basis: 100%;
  }
  .account-permission-page > .panel-title {
    min-height: auto;
    padding: 18px 16px 15px;
  }
  .account-primary-tabs {
    overflow-x: auto;
    padding: 0 16px;
    gap: 22px;
  }
  .account-primary-tabs button {
    flex: 0 0 auto;
  }
  .account-sub-tabs {
    padding: 12px 16px;
  }
  .account-role-select {
    grid-template-columns: 1fr;
    gap: 5px;
    width: 100%;
  }
  .account-sub-tabs {
    align-items: stretch;
  }
  .account-create-btn {
    width: 100%;
  }
  .account-table-surface,
  .account-group-content {
    margin: 0 16px 16px;
  }
  .account-table-surface .permission-head {
    display: none;
  }
  .account-table-surface .permission-row {
    grid-template-columns: 1fr;
    gap: 10px;
    padding: 14px;
  }
  .account-row-actions {
    justify-content: flex-start;
  }
  .account-detail-content {
    min-height: 0;
    grid-template-columns: 1fr;
  }
  .account-detail-summary {
    border-right: 0;
    border-bottom: 1px solid #e5eaf0;
    padding: 18px;
  }
  .account-detail-summary > button {
    max-width: 240px;
  }
  .account-detail-body {
    padding: 20px 16px;
  }
  .account-detail-info-grid,
  .account-edit-form {
    grid-template-columns: 1fr;
  }
  .account-detail-work-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .account-group-content {
    padding: 12px;
  }
  .account-group-content.permission-group-layout {
    min-height: auto;
    grid-template-columns: 1fr;
  }
  .permission-group-list {
    border-right: 0;
    border-bottom: 1px solid #e5eaf0;
    padding: 0 0 12px;
  }
}
</style>
