import { defineStore } from 'pinia'
import { apiClient } from '../services/apiClient'

const STORAGE_KEY = 'art-studio-account-permissions'
const GROUP_STORAGE_KEY = 'art-studio-permission-groups'
const SERVER_AUTH_MODE = import.meta.env.VITE_AUTH_MODE === 'server'

const defaultPermissionGroups = [
  {
    id: 'group-course-teachers',
    name: '课程讲师组',
    description: '可查看和使用获授权课程，并向负责的班级或用户发放课程。',
    status: 'enabled',
    memberIds: ['tea-001'],
    permissions: {
      courseLibraryView: true,
      courseUse: true,
      courseUpload: true,
      courseDistribute: true,
      classManage: true,
      reports: true,
    },
  },
  {
    id: 'group-course-assistants',
    name: '课程助教组',
    description: '可查看和使用获授权课程，不可上传或发放课程。',
    status: 'enabled',
    memberIds: [],
    permissions: {
      courseLibraryView: true,
      courseUse: true,
      courseUpload: false,
      courseDistribute: false,
      classManage: false,
      reports: true,
    },
  },
]

const defaultAccounts = [
  {
    id: 'stu-001',
    role: 'student',
    name: '小画家阿橙',
    account: '小画家阿橙',
    className: 'AI创意美术A班',
    status: 'enabled',
    permissions: {
      studentAccess: true,
      aiCreate: true,
      courses: true,
      reports: true,
    },
  },
  {
    id: 'tea-001',
    role: 'teacher',
    name: '王讲师',
    account: '王讲师',
    className: 'AI创意美术教研组',
    status: 'enabled',
    groupIds: ['group-course-teachers'],
    permissions: {
      teacherAccess: true,
      courseManage: true,
      classManage: true,
      reports: true,
    },
  },
  {
    id: 'adm-001',
    role: 'admin',
    name: '管理员',
    account: '管理员',
    className: '机构管理中心',
    status: 'enabled',
    permissions: {
      adminAccess: true,
      courseLibrary: true,
      accountManage: true,
      apiConfig: true,
      agents: true,
    },
  },
]

const roleHomeMap = {
  student: '/student/workbench',
  teacher: '/teacher/workbench',
  admin: '/admin',
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeAccount(account = {}) {
  const preset = SERVER_AUTH_MODE ? {} : (defaultAccounts.find((item) => item.id === account.id || item.role === account.role) || defaultAccounts[0])
  return {
    ...preset,
    ...account,
    permissions: {
      ...preset.permissions,
      ...(account.permissions || {}),
    },
    groupIds: account.groupIds || preset.groupIds || [],
  }
}

function normalizePermissionGroup(group = {}) {
  const preset = SERVER_AUTH_MODE ? {} : (defaultPermissionGroups.find((item) => item.id === group.id) || {})
  return {
    ...preset,
    ...group,
    id: group.id || `group-${Date.now()}`,
    name: group.name || '未命名权限组',
    description: group.description || '',
    status: group.status || 'enabled',
    memberIds: Array.isArray(group.memberIds) ? [...new Set(group.memberIds)] : (preset.memberIds || []),
    permissions: {
      ...(preset.permissions || {}),
      ...(group.permissions || {}),
    },
  }
}

function readAccounts() {
  if (SERVER_AUTH_MODE) return []
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return clone(defaultAccounts)
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(normalizeAccount) : clone(defaultAccounts)
  } catch {
    return clone(defaultAccounts)
  }
}

function readPermissionGroups() {
  if (SERVER_AUTH_MODE) return []
  const raw = localStorage.getItem(GROUP_STORAGE_KEY)
  if (!raw) return clone(defaultPermissionGroups)
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(normalizePermissionGroup) : clone(defaultPermissionGroups)
  } catch {
    return clone(defaultPermissionGroups)
  }
}

export const useAccountPermissionStore = defineStore('accountPermission', {
  state: () => ({
    accounts: readAccounts(),
    permissionGroups: readPermissionGroups(),
    campuses: [],
    classes: [],
    organizationWide: false,
    loaded: false,
    loading: false,
  }),
  getters: {
    byRole: (state) => (role) => state.accounts.filter((account) => account.role === role),
    groupById: (state) => (id) => state.permissionGroups.find((group) => group.id === id),
    groupsForAccount: (state) => (accountId) => state.permissionGroups.filter((group) => (
      group.status === 'enabled' && group.memberIds.includes(accountId)
    )),
    roleHome: () => (role) => roleHomeMap[role] || '/login',
  },
  actions: {
    persist() {
      if (SERVER_AUTH_MODE) return
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.accounts))
      localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(this.permissionGroups))
    },
    getAccountForUser(user) {
      if (!user) return null
      return this.accounts.find((account) => account.id === user.id)
        || this.accounts.find((account) => account.role === user.role && account.name === user.name)
        || this.accounts.find((account) => account.role === user.role)
        || null
    },
    canAccessRoute(user, route) {
      if (!user) return false
      if (SERVER_AUTH_MODE) {
        const roles = route.meta?.roles || []
        return !roles.length || roles.includes(user.role)
      }
      const account = this.getAccountForUser(user)
      if (!account || account.status !== 'enabled') return false
      const roles = route.meta?.roles || []
      if (!roles.length) return true
      if (!roles.includes(user.role)) return false
      const key = route.meta?.permissionKey
      return key ? Boolean(this.effectivePermissions(account)[key]) : true
    },
    effectivePermissions(accountOrId) {
      const account = typeof accountOrId === 'string'
        ? this.accounts.find((item) => item.id === accountOrId)
        : accountOrId
      if (!account) return {}
      return this.permissionGroups
        .filter((group) => group.status === 'enabled' && group.memberIds.includes(account.id))
        .reduce((permissions, group) => {
          Object.entries(group.permissions || {}).forEach(([key, value]) => {
            permissions[key] = Boolean(permissions[key] || value)
          })
          return permissions
        }, { ...(account.permissions || {}) })
    },
    async loadAdminData(force = false) {
      if (!SERVER_AUTH_MODE || this.loading || (this.loaded && !force)) return
      this.loading = true
      try {
        const [accountsResponse, groupsResponse, optionsResponse] = await Promise.all([
          apiClient.get('/admin/accounts'),
          apiClient.get('/admin/permission-groups'),
          apiClient.get('/admin/account-options'),
        ])
        this.accounts = (accountsResponse.data.accounts || []).map(normalizeAccount)
        this.permissionGroups = (groupsResponse.data.groups || []).map(normalizePermissionGroup)
        this.campuses = optionsResponse.data.campuses || []
        this.classes = optionsResponse.data.classes || []
        this.organizationWide = Boolean(optionsResponse.data.organizationWide)
        this.loaded = true
      } finally {
        this.loading = false
      }
    },
    // 讲师端（服务端模式）：账号 / 权限组接口只给管理员，讲师读不到，以前讲师端「上传课程」等按钮永远是灰的。
    // 改读 /me/course-access：只放当前账号和他所在的权限组（只有课程相关的开关）。
    async loadMyCourseAccess(user) {
      if (!SERVER_AUTH_MODE || user?.role !== 'teacher') return
      const { data } = await apiClient.get('/me/course-access', { timeout: 10000 })
      this.accounts = [normalizeAccount({ id: user.id, name: user.name, role: user.role, status: 'enabled', permissions: data.permissions || {} })]
      this.permissionGroups = (data.groups || []).map((group) => normalizePermissionGroup({ ...group, status: 'enabled', memberIds: [user.id] }))
    },
    clearServerData() {
      if (!SERVER_AUTH_MODE) return
      this.accounts = []
      this.permissionGroups = []
      this.campuses = []
      this.classes = []
      this.loaded = false
    },
    async updatePermission(accountId, key, value) {
      const account = this.accounts.find((item) => item.id === accountId)
      if (!account) return
      account.permissions = { ...(account.permissions || {}), [key]: value }
      if (SERVER_AUTH_MODE) {
        await apiClient.patch(`/admin/accounts/${accountId}`, { permissions: account.permissions })
        await this.loadAdminData(true)
        return
      }
      this.persist()
    },
    async updateAccount(accountId, patch = {}) {
      if (SERVER_AUTH_MODE) {
        const current = this.accounts.find((item) => item.id === accountId)
        await apiClient.patch(`/admin/accounts/${accountId}`, patch)
        await this.syncServerRelations(accountId, current?.role, patch)
        if (patch.password) await apiClient.post(`/admin/accounts/${accountId}/reset-password`, { password: patch.password })
        await this.loadAdminData(true)
        return this.accounts.find((item) => item.id === accountId) || null
      }
      const index = this.accounts.findIndex((item) => item.id === accountId)
      if (index < 0) return null
      this.accounts.splice(index, 1, normalizeAccount({ ...this.accounts[index], ...patch }))
      if ('groupIds' in patch) this.syncAccountGroupMembership(accountId, this.accounts[index].groupIds)
      this.persist()
      return this.accounts[index]
    },
    async createAccount(payload = {}) {
      if (SERVER_AUTH_MODE) {
        const { data } = await apiClient.post('/admin/accounts', payload)
        await this.syncServerRelations(data.id, payload.role, payload)
        await this.loadAdminData(true)
        return this.accounts.find((item) => item.id === data.id) || { id: data.id, ...payload }
      }
      const account = normalizeAccount({
        ...payload,
        id: `account-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      })
      this.accounts.push(account)
      this.syncAccountGroupMembership(account.id, account.groupIds)
      this.persist()
      return account
    },
    async deleteAccount(accountId) {
      if (SERVER_AUTH_MODE) {
        await apiClient.delete(`/admin/accounts/${accountId}`)
        await this.loadAdminData(true)
        return true
      }
      const index = this.accounts.findIndex((item) => item.id === accountId)
      if (index < 0) return false
      this.accounts.splice(index, 1)
      this.permissionGroups.forEach((group) => {
        group.memberIds = (group.memberIds || []).filter((id) => id !== accountId)
      })
      this.persist()
      return true
    },
    async createPermissionGroup(payload = {}) {
      if (SERVER_AUTH_MODE) {
        const { data } = await apiClient.post('/admin/permission-groups', payload)
        await this.loadAdminData(true)
        return this.permissionGroups.find((group) => group.id === data.id) || { id: data.id, ...payload }
      }
      const group = normalizePermissionGroup({
        ...payload,
        id: `group-${Date.now()}`,
      })
      this.permissionGroups.push(group)
      this.syncGroupMembership(group.id, group.memberIds)
      this.persist()
      return group
    },
    async updatePermissionGroup(groupId, patch = {}) {
      if (SERVER_AUTH_MODE) {
        await apiClient.patch(`/admin/permission-groups/${groupId}`, patch)
        await this.loadAdminData(true)
        return this.permissionGroups.find((group) => group.id === groupId) || null
      }
      const index = this.permissionGroups.findIndex((group) => group.id === groupId)
      if (index < 0) return null
      const group = normalizePermissionGroup({ ...this.permissionGroups[index], ...patch, id: groupId })
      this.permissionGroups.splice(index, 1, group)
      this.syncGroupMembership(group.id, group.memberIds)
      this.persist()
      return group
    },
    async deletePermissionGroup(groupId) {
      if (SERVER_AUTH_MODE) {
        await apiClient.delete(`/admin/permission-groups/${groupId}`)
        await this.loadAdminData(true)
        return true
      }
      const before = this.permissionGroups.length
      this.permissionGroups = this.permissionGroups.filter((group) => group.id !== groupId)
      if (this.permissionGroups.length === before) return false
      this.accounts.forEach((account) => {
        account.groupIds = (account.groupIds || []).filter((id) => id !== groupId)
      })
      this.persist()
      return true
    },
    syncGroupMembership(groupId, memberIds = []) {
      const memberSet = new Set(memberIds)
      this.accounts.forEach((account) => {
        const groupIds = new Set(account.groupIds || [])
        if (memberSet.has(account.id)) groupIds.add(groupId)
        else groupIds.delete(groupId)
        account.groupIds = [...groupIds]
      })
    },
    syncAccountGroupMembership(accountId, groupIds = []) {
      const groupIdSet = new Set(groupIds)
      this.permissionGroups.forEach((group) => {
        const memberIds = new Set(group.memberIds || [])
        if (groupIdSet.has(group.id)) memberIds.add(accountId)
        else memberIds.delete(accountId)
        group.memberIds = [...memberIds]
      })
    },
    async syncServerRelations(accountId, role, payload) {
      if (!SERVER_AUTH_MODE) return
      if (['teacher', 'student'].includes(role) && payload.classIds !== undefined) {
        await apiClient.put(`/admin/accounts/${accountId}/teacher-classes`, { classIds: payload.classIds })
      }
      if (role === 'admin' && payload.adminScopes !== undefined) {
        await apiClient.put(`/admin/accounts/${accountId}/admin-scopes`, { scopes: payload.adminScopes })
      }
    },
    async resetPassword(accountId, password) {
      if (!SERVER_AUTH_MODE) return false
      await apiClient.post(`/admin/accounts/${accountId}/reset-password`, { password })
      return true
    },
    async revokeSessions(accountId) {
      if (!SERVER_AUTH_MODE) return false
      await apiClient.delete(`/admin/accounts/${accountId}/sessions`)
      return true
    },
  },
})
