import { useEffect, useState } from 'react'
import { api, type PrimConfig } from './api'

// Puan sistemi ayarları: ağırlıklar, dönüşüm hedefi, yuvarlama ve puan→yüzde kademeleri.
export default function PrimSettings() {
  const [c, setC] = useState<PrimConfig | null>(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => { api.primConfig().then(setC) }, [])
  if (!c) return null

  const w = c.weights
  const total = w.revenue + w.conversion + w.quality + w.manager
  const setW = (k: keyof PrimConfig['weights']) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setC({ ...c, weights: { ...w, [k]: +e.target.value } })
  const setBand = (i: number, k: 'min' | 'percent', v: number) =>
    setC({ ...c, bands: c.bands.map((b, j) => (j === i ? { ...b, [k]: v } : b)) })

  async function save() {
    setErr('')
    try {
      await api.savePrimConfig(c!)
      setC(await api.primConfig())
      setMsg('Kaydedildi.'); setTimeout(() => setMsg(''), 2500)
    } catch (e) { setErr((e as Error).message) }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Prim puan sistemi</h3>
        <div className="toolbar">{msg && <span className="muted">{msg}</span>}<button type="button" className="btn primary sm" onClick={save}>Puan sistemini kaydet</button></div>
      </div>
      <div className="panel-body stack">
        <div className="form-grid">
          <label className="field">Ciro puanı (max)<input type="number" min="0" value={w.revenue} onChange={setW('revenue')} /></label>
          <label className="field">Lead dönüşüm puanı (max)<input type="number" min="0" value={w.conversion} onChange={setW('conversion')} /></label>
          <label className="field">Kalite ve yönetim kuralları (max)<input type="number" min="0" value={w.quality} onChange={setW('quality')} /></label>
          <label className="field">Yönetici değerlendirmesi (max)<input type="number" min="0" value={w.manager} onChange={setW('manager')} /></label>
          <label className="field">Dönüşüm hedefi (%)<input type="number" min="0.01" step="0.01" value={c.conversionTarget} onChange={e => setC({ ...c, conversionTarget: +e.target.value })} /></label>
          <label className="field">Puan yuvarlama
            <select value={c.rounding} onChange={e => setC({ ...c, rounding: e.target.value as PrimConfig['rounding'] })}>
              <option value="Down">Aşağı (21,4 → 21)</option>
              <option value="Nearest">En yakın tam sayı (21,5 → 22)</option>
              <option value="None">Yuvarlama yok (21,43)</option>
            </select>
          </label>
        </div>
        <p className="muted" style={{ margin: 0 }}>Toplam puan: <b>{total}</b>{total !== 100 && ' (şirket sisteminde 100 olmalı mı, kontrol et)'}. Şirketin yuvarlama kuralı belli değilse "Aşağı" temkinli seçimdir.</p>

        <div>
          <h3 style={{ marginBottom: 8 }}>Puana göre hakediş yüzdesi</h3>
          <table>
            <thead><tr><th>Alt sınır (puan ≥)</th><th>Prim yüzdesi (%)</th><th /></tr></thead>
            <tbody>
              {c.bands.map((b, i) => (
                <tr key={i}>
                  <td><input type="number" min="0" value={b.min} onChange={e => setBand(i, 'min', +e.target.value)} /></td>
                  <td><input type="number" min="0" step="0.1" value={b.percent} onChange={e => setBand(i, 'percent', +e.target.value)} /></td>
                  <td><div className="actions"><button type="button" className="btn sm danger" onClick={() => setC({ ...c, bands: c.bands.filter((_, j) => j !== i) })}>Sil</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: '12px 0 0' }}><button type="button" className="btn sm" onClick={() => setC({ ...c, bands: [...c.bands, { min: 0, percent: 0 }] })}>+ Kademe ekle</button></p>
          <p className="muted" style={{ margin: '8px 0 0' }}>Toplam puan en yüksek sağlanan alt sınıra göre kademeyi belirler. En düşük sınırın altı prim yok sayılır.</p>
        </div>
        {err && <p className="err">{err}</p>}
      </div>
    </div>
  )
}
