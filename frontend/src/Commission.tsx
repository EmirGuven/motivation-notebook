import Tabs from './Tabs'
import { useEffect, useState } from 'react'
import EditRecord from './EditRecord'
import { api, day, money, type RevenueReport, type Surgery } from './api'

const RATES = [1, 2, 3, 4, 5]
const pad = (n: number) => String(n).padStart(2, '0')
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate()

export default function Commission({ onNavigate }: { onNavigate: (tab: 'add') => void }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [yearly, setYearly] = useState<RevenueReport | null>(null)
  const [rows, setRows] = useState<Surgery[]>([])
  const [editing, setEditing] = useState<Surgery | null>(null)
  const [targets, setTargets] = useState<(number | null)[]>(Array(12).fill(null))

  const load = () => {
    api.revenue(`${year}-01-01`, `${year}-12-31T23:59:59`).then(setYearly)
    const mm = pad(month)
    api.surgeries(`?from=${year}-${mm}-01&to=${year}-${mm}-${lastDay(year, month)}T23:59:59`)
      .then(r => setRows(r.filter(s => s.status !== 'Cancelled').sort((a, b) => a.date.localeCompare(b.date))))
  }
  useEffect(load, [year, month])
  useEffect(() => { api.targets(year).then(t => setTargets(t.months)) }, [year])

  const totalCiro = rows.reduce((t, s) => t + (s.priceTry ?? 0), 0)
  const byMonth = new Map(yearly?.monthly.map(m => [m.month, m]))
  const done = byMonth.get(`${year}-${pad(month)}`)?.revenue ?? 0
  const goal = targets[month - 1] ?? 0
  const left = goal - done
  const [tab, setTab] = useState<'months' | 'patients'>('months')
  const pct = goal > 0 ? (done / goal) * 100 : 0

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Komisyon</h2><p>Hastaların cirosu üzerinden %1–%5 komisyon kazancın (₺). Kurlar Ayarlar'dan gelir.</p></div>
        <button className="btn primary" onClick={() => onNavigate('add')}>+ Hasta ekle</button>
      </div>

      <div className="cards">
        <div className="card"><span>{MONTHS[month - 1]} hedefi</span><b>{goal > 0 ? money(goal) : '—'}</b></div>
        <div className="card accent"><span>Yapılan ciro</span><b>{money(done)}</b></div>
        <div className="card"><span>{goal > 0 && left < 0 ? 'Hedef aşıldı' : 'Kalan hedef'}</span><b className={goal > 0 && left <= 0 ? 'pos' : ''}>{goal > 0 ? money(Math.abs(left)) : '—'}</b></div>
        <div className="card">
          <span>Hedefe ulaşma</span><b>{goal > 0 ? `%${pct.toFixed(0)}` : '—'}</b>
          {goal > 0 && <div className="progress"><div className={pct >= 100 ? 'fill good' : 'fill'} style={{ width: `${Math.min(100, pct)}%` }} /></div>}
        </div>
      </div>
      {goal === 0 && <p className="muted" style={{ margin: 0 }}>Bu ay için hedef girilmemiş. <b>Hedefler</b> sayfasından ekleyebilirsin.</p>}

      <Tabs label="Komisyon sekmeleri" items={[{ key: 'months', label: 'Ay ay kazanç' }, { key: 'patients', label: 'Hastalar' }]} value={tab} onChange={setTab} />

      {tab === 'months' && (
      <div className="panel">
        <div className="panel-head">
          <h3>{year} — ay ay kazanç</h3>
          <div className="year-nav">
            <button className="btn sm" onClick={() => setYear(year - 1)}>←</button>
            <b>{year}</b>
            <button className="btn sm" onClick={() => setYear(year + 1)}>→</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Ay</th><th className="num">Hasta</th><th className="num">Yapılan ciro (₺)</th><th className="num">Hedef (₺)</th><th className="num">Kalan hedef</th>{RATES.map(r => <th className="num" key={r}>%{r}</th>)}</tr>
            </thead>
            <tbody>
              {MONTHS.map((name, i) => {
                const m = byMonth.get(`${year}-${pad(i + 1)}`)
                const t = targets[i] ?? 0
                const rev = m?.revenue ?? 0
                return (
                  <tr key={name} className={'click' + (i + 1 === month ? ' sel' : '')} onClick={() => setMonth(i + 1)}>
                    <td><b>{name}</b></td><td className="num">{m?.count ?? 0}</td><td className="num">{money(rev)}</td>
                    <td className="num">{t > 0 ? money(t) : <span className="muted">—</span>}</td>
                    <td className="num">{t > 0 ? (rev >= t ? <span className="pos">Aşıldı +{money(rev - t)}</span> : <span className="neg">{money(t - rev)}</span>) : <span className="muted">—</span>}</td>
                    {RATES.map(r => <td className="num" key={r}>{money((m?.revenue ?? 0) * r / 100)}</td>)}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {tab === 'patients' && (
      <div className="panel">
        <div className="panel-head"><h3>{MONTHS[month - 1]} {year} — hastalar</h3></div>
        {rows.length === 0 ? <div className="empty"><b>Bu ayda hasta yok</b>Sağ üstteki "+ Hasta ekle" ile ekleyebilirsin.</div> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Tarih</th><th>Hasta</th><th>Hizmet</th><th className="num">Ciro</th>{RATES.map(r => <th className="num" key={r}>%{r}</th>)}<th /></tr>
              </thead>
              <tbody>
                {rows.map(s => (
                  <tr key={s.id}>
                    <td>{day(s.date)}</td><td><b>{s.customerName || '(isimsiz)'}</b></td><td>{s.title || '—'}</td><td className="num">{money(s.price, s.currency)}{s.currency !== 'TRY' && <small className="muted"><br />≈ {money(s.priceTry ?? 0)}</small>}</td>
                    {RATES.map(r => <td className="num" key={r}>{money((s.priceTry ?? 0) * r / 100)}</td>)}
                    <td><div className="actions"><button className="btn sm" onClick={() => setEditing(s)}>Düzenle</button><button className="btn sm danger" onClick={async () => { await api.deleteSurgery(s.id); load() }}>Sil</button></div></td>
                  </tr>
                ))}
                <tr className="total">
                  <td colSpan={3}>Toplam ({rows.length} hasta, ₺)</td><td className="num">{money(totalCiro)}</td>
                  {RATES.map(r => <td className="num" key={r}>{money(totalCiro * r / 100)}</td>)}<td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
      {editing && <EditRecord s={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  )
}