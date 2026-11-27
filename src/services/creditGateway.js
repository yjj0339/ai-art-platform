import { apiClient } from './apiClient'

// ---- 用户侧 ----
export const fetchCreditSummary = () => apiClient.get('/credits/summary').then((r) => r.data)
export const fetchCreditLedger = (limit = 50, before = '') =>
  apiClient.get('/credits/ledger', { params: { limit, before } }).then((r) => r.data)
export const redeemCreditCode = (code) => apiClient.post('/credits/redeem', { code }).then((r) => r.data)

// ---- 后台：加减分 / 概览 ----
export const adminFetchCreditOverview = (params = {}) =>
  apiClient.get('/admin/credits/overview', { params }).then((r) => r.data)
export const adminAdjustCredits = (payload) =>
  apiClient.post('/admin/credits/adjust', payload).then((r) => r.data)
export const adminFetchUserCredit = (userId) =>
  apiClient.get(`/admin/credits/${userId}`).then((r) => r.data)

// ---- 后台：兑换码 ----
export const adminFetchCreditCodes = (params = {}) =>
  apiClient.get('/admin/credit-codes', { params }).then((r) => r.data)
export const adminGenerateCodes = (payload) =>
  apiClient.post('/admin/credit-codes', payload).then((r) => r.data)
export const adminConfirmCode = (id) =>
  apiClient.post(`/admin/credit-codes/${id}/confirm`, {}).then((r) => r.data)
export const adminVoidCode = (id, clawBack = false) =>
  apiClient.post(`/admin/credit-codes/${id}/void`, { clawBack }).then((r) => r.data)
export const adminExportCreditCodesUrl = (type = 'codes') =>
  `${apiClient.defaults.baseURL}/admin/credit-codes/export?type=${type}`

// ---- 后台：价目 ----
export const adminFetchCreditPrices = () => apiClient.get('/admin/credit-prices').then((r) => r.data)
export const adminSaveCreditPrices = (prices) =>
  apiClient.put('/admin/credit-prices', { prices }).then((r) => r.data)
