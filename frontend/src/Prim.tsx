import Tabs from './Tabs'
import { useEffect, useState } from 'react'
import { api, money, type PrimMonth, type PrimYear } from './api'

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const nf = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))

export default function Prim({ onNavigate }: { onNavigate: (tab: 'targets' | 'settings') => void }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [d, setD] = useState<PrimMonth | null>(null)
  const [y, setY] = useState<PrimYear | null>(null)
  const [f, setF] = useState({ leads: '', deposits: '', rate: '', quality: '', manager: '' })
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState('')

  function refresh() {
    api.prim(year, month).then(setD)
    api.primYear(year).then(setY)
  }
  function load() {
    api.prim(year, month).then(r => {
      setD(r)
      const i = r.inputs
      setF({
        leads: i.leads?.toString() ?? '', deposits: i.deposits?.toString() ?? '', rate: i.rateOverride?.toString() ?? '',
        quality: i.quality?.toString() ?? '', manager: i.manager?.toString() ?? '',
      })
      setDirty(false)
    })
    api.primYear(year).then(setY)
  }
  useEffect(load, [year, month])

  function shift(delta: number) {
    const idx = year * 12 + (month - 1) + delta
    setYear(Math.floor(idx / 12)); setMonth((idx % 12) + 1)
  }
  const edit = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); setDirty(true) }

  async function save() {
    await api.savePrimInputs(year, month, {
      leads: num(f.leads), deposits: num(f.deposits), rateOverride: num(f.rate), quality: num(f.quality), manager: num(f.manager),
    })
    setDirty(false)
    setMsg('Kaydedildi'); setTimeout(() => setMsg(''), 1500)
    refresh() // yazdığın kutular yerinde kalır, sadece puanlar/prim yenilenir
  }

  // Yazmayı bırakınca otomatik kaydet ve hesabı yenile (Excel gibi)
  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(save, 600)
    return () => clearTimeout(t)
  }, [f, dirty])

  const [tab, setTab] = useState<'calc' | 'months'>('calc')

  if (!d) return null
  const r = d.result, w = d.config.weights
  const bands = [...d.config.bands].sort((a, b) => b.min - a.min)
  const topMax = w.revenue + w.conversion + w.quality + w.manager

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Prim</h2><p>{MONTHS[month - 1]} {year}: {money(r.revenue)} ciro × %{nf(r.bandPercent)} hakediş = <b>{money(r.prim)}</b> prim ({nf(r.totalPoints)} puan, iptaller hariç, TL'ye çevrilmiş ay toplamı).</p></div>
        <div className="toolbar">
          <div className="year-nav">
            <button className="btn sm" onClick={() => shift(-1)}>←</button>
            <b style={{ minWidth: 110 }}>{MONTHS[month - 1]} {year}</b>
            <button className="btn sm" onClick={() => shift(1)}>→</button>
          </div>
          <span className="muted">{dirty ? 'Hesaplanıyor…' : msg || 'Otomatik kaydedilir'}</span>
        </div>
      </div>

      <div className="cards">
        <div className="card"><span>Gerçekleşen ciro</span><b>{money(r.revenue)}</b></div>
        <div className="card"><span>Toplam puan</span><b>{nf(r.totalPoints)} <small className="muted">/ {topMax}</small></b></div>
        <div className="card"><span>Hakediş yüzdesi</span><b>%{nf(r.bandPercent)}</b></div>
        <div className="card accent"><span>Prim hakediş</span><b>{money(r.prim)}</b></div>
      </div>

      <Tabs label="Prim sekmeleri" items={[{ key: 'calc', label: 'Puan hesabı' }, { key: 'months', label: 'Ay ay prim' }]} value={tab} onChange={setTab} />

      {tab === 'calc' && (
      <div className="two-col prim-cols">
        <div className="panel">
          <div className="panel-head"><h3>Puan hesabı</h3></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Kalem</th><th className="num">Hedef</th><th className="num">Gerçekleşen</th><th className="num">Puan</th></tr></thead>
              <tbody>
                <tr>
                  <td><b>Ciro</b><br /><small className="muted">max {w.revenue}</small></td>
                  <td className="num">{r.revenueTarget ? money(r.revenueTarget) : <button className="btn sm" onClick={() => onNavigate('targets')}>Hedef gir</button>}</td>
                  <td className="num">{money(r.revenue)}</td>
                  <td className="num"><b>{nf(r.revenueScore.points)}</b></td>
                </tr>
                <tr>
                  <td><b>Lead dönüşüm oranı</b><br /><small className="muted">max {w.conversion}</small></td>
                  <td className="num">%{nf(d.config.conversionTarget)}</td>
                  <td className="num"><span className="pct-wrap">%<input className="pt-input" type="number" min="0" step="0.01" placeholder="0" value={f.rate} onChange={edit('rate')} /></span></td>
                  <td className="num"><b>{nf(r.conversionScore.points)}</b></td>
                </tr>
                <tr>
                  <td><b>Kalite ve yönetim kurallarına uyum</b><br /><small className="muted">max {w.quality}</small></td>
                  <td className="num muted">—</td>
                  <td className="num"><input className="pt-input" type="number" min="0" max={w.quality} step="0.5" placeholder="0" value={f.quality} onChange={edit('quality')} /></td>
                  <td className="num"><b>{nf(r.qualityScore.points)}</b></td>
                </tr>
                <tr>
                  <td><b>Yönetici değerlendirmesi</b><br /><small className="muted">max {w.manager}</small></td>
                  <td className="num muted">—</td>
                  <td className="num"><input className="pt-input" type="number" min="0" max={w.manager} step="0.5" placeholder="0" value={f.manager} onChange={edit('manager')} /></td>
                  <td className="num"><b>{nf(r.managerScore.points)}</b></td>
                </tr>
                <tr className="total"><td colSpan={3}>Toplam puan</td><td className="num">{nf(r.totalPoints)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-head"><h3>Puana göre hakediş</h3><button className="btn sm" onClick={() => onNavigate('settings')}>Düzenle</button></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Puan</th><th className="num">Yüzde</th></tr></thead>
                <tbody>
                  {bands.map((b, i) => {
                    const upper = i === 0 ? topMax : bands[i - 1].min - 1
                    const hit = r.bandMin === b.min
                    return (
                      <tr key={b.min} className={hit ? 'sel' : ''}>
                        <td>{b.min} – {upper}</td>
                        <td className="num"><b>{b.percent === 0 ? 'Prim yok' : `%${nf(b.percent)}`}</b></td>
                      </tr>
                    )
                  })}
                  <tr className={r.bandMin === null ? 'sel' : ''}><td>{bands.length && bands[bands.length - 1].min > 1 ? `0 – ${bands[bands.length - 1].min - 1}` : '0'}</td><td className="num"><b>Prim yok</b></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      )}

      {tab === 'months' && y && (
        <div className="panel">
          <div className="panel-head"><h3>{year} — ay ay prim</h3></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ay</th><th className="num">Ciro</th><th className="num">Puan</th><th className="num">Yüzde</th><th className="num">Prim</th></tr></thead>
              <tbody>
                {y.months.map(m => (
                  <tr key={m.month} className={'click' + (m.month === month ? ' sel' : '')} onClick={() => setMonth(m.month)}>
                    <td><b>{MONTHS[m.month - 1]}</b></td>
                    <td className="num">{m.hasData ? money(m.revenue) : <span className="muted">—</span>}</td>
                    <td className="num">{m.hasData ? nf(m.points) : <span className="muted">—</span>}</td>
                    <td className="num">{m.hasData ? `%${nf(m.percent)}` : <span className="muted">—</span>}</td>
                    <td className="num">{m.hasData ? <b>{money(m.prim)}</b> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
                <tr className="total"><td>Yıllık toplam</td><td className="num">{money(y.totalRevenue)}</td><td /><td /><td className="num">{money(y.totalPrim)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
