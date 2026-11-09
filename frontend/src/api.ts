const BASE = import.meta.env.VITE_API_URL ?? `http://${location.hostname}:5080`

export type SurgeryStatus = 'Planned' | 'Completed' | 'Cancelled'

export interface Customer {
  id: number
  firstName: string
  lastName: string
  phone?: string | null
  email?: string | null
  notes?: string | null
  surgeryCount?: number
  totalPrice?: number
  surgeries?: Surgery[]
}

export interface Surgery {
  id: number
  customerId: number
  customerName?: string
  title: string
  date: string
  price: number
  paidAmount: number
  commissionRate: number
  currency: string
  rateToTry: number
  priceTry?: number
  commission?: number
  commissionTry?: number
  status: SurgeryStatus
  notes?: string | null
}

export interface RevenueReport {
  revenue: number
  collected: number
  outstanding: number
  commission: number
  surgeryCount: number
  monthly: { month: string; revenue: number; collected: number; commission: number; count: number }[]
}

const TOKEN_KEY = 'crm_token'
const USER_KEY = 'crm_user'
export const auth = {
  token: () => localStorage.getItem(TOKEN_KEY),
  user: () => localStorage.getItem(USER_KEY),
  clear: () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY) },
  async login(username: string, password: string) {
    const res = await fetch(BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) throw new Error('Kullanıcı adı veya şifre hatalı.')
    const j = await res.json()
    localStorage.setItem(TOKEN_KEY, j.token)
    localStorage.setItem(USER_KEY, j.username ?? username)
  },
  async logout() {
    await fetch(BASE + '/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${auth.token()}` } }).catch(() => {})
    auth.clear()
  },
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token()}` },
  })
  if (res.status === 401) {
    auth.clear()
    window.dispatchEvent(new Event('crm-unauthorized'))
    throw new Error('Oturum süresi doldu.')
  }
  if (!res.ok) throw new Error(await res.text())
  return res.status === 204 ? (undefined as T) : res.json()
}

const body = (data: unknown) => JSON.stringify(data)

export interface CurrencyOption {
  code: string
  name: string
  autoRate: number | null
  manualRate: number | null
  effectiveRate: number | null
}
export interface AppSettings {
  rateMode: 'Auto' | 'Manual'
  defaultCurrency: string
  rateDate: string | null
  currencies: CurrencyOption[]
}

export interface AppUser { id: number; username: string; createdAt: string }

export interface Targets { year: number; months: (number | null)[] }

export interface ChatTurn { role: 'user' | 'assistant'; content: string }
export interface ChatReply { reply: string; actions: string[]; changed: boolean; basic?: boolean }

export interface PrimConfig {
  weights: { revenue: number; conversion: number; quality: number; manager: number }
  conversionTarget: number
  rounding: 'Down' | 'Nearest' | 'None'
  bands: { min: number; percent: number }[]
}
export interface PrimInputs { leads: number | null; deposits: number | null; rateOverride: number | null; quality: number | null; manager: number | null }
export interface PrimResult {
  revenue: number; revenueTarget: number | null; revenueScore: { max: number; points: number }
  conversionRate: number | null; conversionOverridden: boolean; conversionScore: { max: number; points: number }
  qualityScore: { max: number; points: number }; managerScore: { max: number; points: number }
  totalPoints: number; bandPercent: number; bandMin: number | null; prim: number
}
export interface PrimMonth { year: number; month: number; config: PrimConfig; inputs: PrimInputs; result: PrimResult }
export interface PrimYear {
  year: number; totalPrim: number; totalRevenue: number
  months: { month: number; revenue: number; points: number; percent: number; prim: number; hasData: boolean }[]
}

export const api = {
  prim: (year: number, month: number) => req<PrimMonth>(`/api/prim?year=${year}&month=${month}`),
  primYear: (year: number) => req<PrimYear>(`/api/prim/year?year=${year}`),
  primConfig: () => req<PrimConfig>('/api/prim/config'),
  savePrimConfig: (c: PrimConfig) => req<void>('/api/prim/config', { method: 'PUT', body: body(c) }),
  savePrimInputs: (year: number, month: number, i: PrimInputs) =>
    req<void>('/api/prim/inputs', { method: 'PUT', body: body({ year, month, ...i }) }),
  chat: async (messages: ChatTurn[]): Promise<ChatReply> => {
    try {
      return await req<ChatReply>('/api/chat', { method: 'POST', body: body({ messages }) })
    } catch (e) {
      // Backend { error } döndürür; düz metne çevir.
      const m = (e as Error).message
      try { throw new Error(JSON.parse(m).error ?? m) } catch (x) { throw x instanceof SyntaxError ? new Error(m) : x }
    }
  },
  targets: (year: number) => req<Targets>(`/api/targets?year=${year}`),
  saveTargets: (year: number, months: (number | null)[]) =>
    req<void>('/api/targets', { method: 'PUT', body: body({ year, months }) }),

  settings: (refresh = false) => req<AppSettings>(`/api/settings?refresh=${refresh}`),
  saveSettings: (s: { rateMode: string; defaultCurrency: string; manualRates: Record<string, number | null> }) =>
    req<void>('/api/settings', { method: 'PUT', body: body(s) }),

  users: () => req<AppUser[]>('/api/users'),
  addUser: (username: string, password: string) => req<AppUser>('/api/users', { method: 'POST', body: body({ username, password }) }),
  setUserPassword: (id: number, password: string) => req<void>(`/api/users/${id}/password`, { method: 'PUT', body: body({ password }) }),
  deleteUser: (id: number) => req<void>(`/api/users/${id}`, { method: 'DELETE' }),

  logo: () => req<{ dataUrl: string | null }>('/api/logo'),
  saveLogo: (dataUrl: string) => req<void>('/api/logo', { method: 'PUT', body: body({ dataUrl }) }),
  deleteLogo: () => req<void>('/api/logo', { method: 'DELETE' }),

  customers: (q = '') => req<Customer[]>(`/api/customers?q=${encodeURIComponent(q)}`),
  customer: (id: number) => req<Customer>(`/api/customers/${id}`),
  addCustomer: (c: Partial<Customer>) => req<Customer>('/api/customers', { method: 'POST', body: body(c) }),
  updateCustomer: (id: number, c: Partial<Customer>) => req<Customer>(`/api/customers/${id}`, { method: 'PUT', body: body(c) }),
  deleteCustomer: (id: number) => req<void>(`/api/customers/${id}`, { method: 'DELETE' }),

  surgeries: (qs = '') => req<Surgery[]>(`/api/surgeries${qs}`),
  addSurgery: (s: Partial<Surgery>) => req<Surgery>('/api/surgeries', { method: 'POST', body: body(s) }),
  updateSurgery: (id: number, s: Partial<Surgery>) => req<Surgery>(`/api/surgeries/${id}`, { method: 'PUT', body: body(s) }),
  deleteSurgery: (id: number) => req<void>(`/api/surgeries/${id}`, { method: 'DELETE' }),

  revenue: (from?: string, to?: string) => {
    const p = new URLSearchParams()
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    return req<RevenueReport>(`/api/reports/revenue?${p}`)
  },
}

export const money = (n: number, currency = 'TRY') => n.toLocaleString('tr-TR', { style: 'currency', currency })
export const day = (d: string) => new Date(d).toLocaleDateString('tr-TR')
export const statusLabel: Record<SurgeryStatus, string> = {
  Planned: 'Planlandı',
  Completed: 'Tamamlandı',
  Cancelled: 'İptal',
}
