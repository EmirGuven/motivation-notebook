import { useEffect, useState } from 'react'
import { api, type AppSettings } from './api'
import PrimSettings from './PrimSettings'
import Tabs from './Tabs'
import UsersSettings from './UsersSettings'

// Yüklenen görseli en fazla 256px'e küçültüp PNG data URL'e çevirir.
function toLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const k = Math.min(1, 256 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Görsel okunamadı.')) }
    img.src = url
  })
}

type SettingsTab = 'general' | 'rates' | 'prim' | 'users'
const TABS: { key: SettingsTab; label: string }[] = [
  { key: 'general', label: 'Genel' },
  { key: 'rates', label: 'Kurlar' },
  { key: 'prim', label: 'Prim' },
  { key: 'users', label: 'Kullanıcılar' },
]

export default function Settings({ onLogout }: { onLogout: () => void }) {
  const [st, setSt] = useState<AppSettings | null>(null)
  const [mode, setMode] = useState<'Auto' | 'Manual'>('Auto')
  const [def, setDef] = useState('TRY')
  const [manual, setManual] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState('')
  const [tab, setTab] = useState<SettingsTab>('general')
  const [logo, setLogo] = useState<string | null>(null)

  function apply(s: AppSettings) {
    setSt(s); setMode(s.rateMode); setDef(s.defaultCurrency)
    setManual(Object.fromEntries(s.currencies.map(c => [c.code, c.manualRate ? String(c.manualRate) : ''])))
  }
  useEffect(() => { api.settings().then(apply); api.logo().then(l => setLogo(l.dataUrl)) }, [])

  function pushLogo(v: string | null) {
    setLogo(v)
    window.dispatchEvent(new CustomEvent('crm-logo', { detail: v }))
  }
  async function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const data = await toLogo(f)
      await api.saveLogo(data)
      pushLogo(data)
    } catch (err) { setMsg((err as Error).message) }
  }
  async function removeLogo() {
    await api.deleteLogo()
    pushLogo(null)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    await api.saveSettings({
      rateMode: mode, defaultCurrency: def,
      manualRates: Object.fromEntries(Object.entries(manual).map(([k, v]) => [k, +v > 0 ? +v : null])),
    })
    apply(await api.settings())
    setMsg('Kaydedildi.')
    setTimeout(() => setMsg(''), 2500)
  }

  if (!st) return null
  const rate = (n: number | null) => (n ? n.toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : '—')

  return (
    <form className="stack" onSubmit={save}>
      <div className="page-head">
        <div><h2>Ayarlar</h2><p>Logo, para birimi, kur, prim ve kullanıcılar.</p></div>
        <div className="toolbar">
          {msg && <span className="muted">{msg}</span>}
          {(tab === 'general' || tab === 'rates') && <button className="btn primary">Kaydet</button>}
        </div>
      </div>

      <Tabs label="Ayar sekmeleri" items={TABS} value={tab} onChange={setTab} />

      {tab === 'general' && <>
      <div className="panel">
        <div className="panel-head"><h3>Logo</h3></div>
        <div className="panel-body logo-set">
          <div className="logo-prev">{logo ? <img src={logo} alt="Logo" /> : <i>C</i>}</div>
          <label className="btn sm">Logo yükle
            <input type="file" accept="image/*" hidden onChange={pickLogo} />
          </label>
          {logo && <button type="button" className="btn sm danger" onClick={removeLogo}>Kaldır</button>}
          <span className="muted">Menünün üstünde görünür. PNG, JPG veya SVG.</span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Genel</h3></div>
        <div className="panel-body form-grid">
          <label className="field">Varsayılan para birimi
            <select value={def} onChange={e => setDef(e.target.value)}>
              {st.currencies.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </select>
          </label>
          <label className="field">Kur kaynağı
            <select value={mode} onChange={e => setMode(e.target.value as 'Auto' | 'Manual')}>
              <option value="Auto">Otomatik (TCMB günlük kur)</option>
              <option value="Manual">Manuel (aşağıya girdiğim kurlar)</option>
            </select>
          </label>
        </div>
      </div>

      </>}

      {tab === 'rates' && (
      <div className="panel">
        <div className="panel-head">
          <h3>Kurlar (₺ karşılığı)</h3>
          <button type="button" className="btn sm" onClick={async () => apply(await api.settings(true))}>TCMB'den yenile</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Para birimi</th><th className="num">TCMB{st.rateDate ? ` (${st.rateDate})` : ''}</th><th className="num">Manuel kur</th><th className="num">Kullanılan</th></tr></thead>
            <tbody>
              {st.currencies.filter(c => c.code !== 'TRY').map(c => (
                <tr key={c.code}>
                  <td><b>{c.code}</b> <span className="muted">{c.name}</span></td>
                  <td className="num">{rate(c.autoRate)}</td>
                  <td className="num">
                    <input style={{ maxWidth: 130, textAlign: 'right' }} type="number" min="0" step="0.0001" placeholder="—"
                      value={manual[c.code] ?? ''} onChange={e => setManual({ ...manual, [c.code]: e.target.value })} />
                  </td>
                  <td className="num"><b>{rate(c.effectiveRate)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel-body muted">
          Yeni kayıt eklerken kur o günkü değerle kaydedilir; sonradan kur değişse bile eski kayıtların TL karşılığı değişmez.
          Kurları burada bir kez gir, hasta eklerken tekrar sormaz. "Manuel" seçersen yazdığın kurlar, "Otomatik" seçersen TCMB kuru kullanılır.
        </div>
      </div>
      )}

      {tab === 'prim' && <PrimSettings />}

      {tab === 'users' && <UsersSettings />}

      <div className="panel mobile-only">
        <div className="panel-body" style={{ width: '100%' }}>
          <button type="button" className="btn danger" style={{ width: '100%' }} onClick={onLogout}>Çıkış yap</button>
        </div>
      </div>
    </form>
  )
}
