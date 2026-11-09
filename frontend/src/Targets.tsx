import { useEffect, useState } from 'react'
import { api, money, type RevenueReport } from './api'

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const pad = (n: number) => String(n).padStart(2, '0')

export default function Targets() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [vals, setVals] = useState<string[]>(Array(12).fill(''))
  const [r, setR] = useState<RevenueReport | null>(null)
  const [fill, setFill] = useState('')
  const [msg, setMsg] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    api.targets(year).then(t => { setVals(t.months.map(m => (m ? String(m) : ''))); setDirty(false) })
    api.revenue(`${year}-01-01`, `${year}-12-31T23:59:59`).then(setR)
  }, [year])

  const byMonth = new Map(r?.monthly.map(m => [m.month, m.revenue]))
  const target = (i: number) => +vals[i] || 0
  const actual = (i: number) => byMonth.get(`${year}-${pad(i + 1)}`) ?? 0
  const totalTarget = vals.reduce((t, v) => t + (+v || 0), 0)
  const totalActual = MONTHS.reduce((t, _, i) => t + actual(i), 0)

  const edit = (i: number, v: string) => { setVals(vals.map((x, j) => (j === i ? v : x))); setDirty(true) }

  async function save() {
    await api.saveTargets(year, vals.map(v => (+v > 0 ? +v : null)))
    setDirty(false); setMsg('Kaydedildi.')
    setTimeout(() => setMsg(''), 2500)
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Ciro hedefleri</h2><p>Her ay için ayrı hedef gir. Dashboard bu hedeflere göre ilerlemeni gösterir.</p></div>
        <div className="toolbar">
          <div className="year-nav">
            <button className="btn sm" onClick={() => setYear(year - 1)}>←</button>
            <b>{year}</b>
            <button className="btn sm" onClick={() => setYear(year + 1)}>→</button>
          </div>
          {msg && <span className="muted">{msg}</span>}
          <button className="btn primary" onClick={save} disabled={!dirty}>Kaydet</button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>{year} — aylık hedefler (₺)</h3>
          <div className="toolbar">
            <input style={{ width: 150 }} type="number" min="0" placeholder="Tüm aylar için" value={fill} onChange={e => setFill(e.target.value)} />
            <button className="btn sm" disabled={!(+fill > 0)} onClick={() => { setVals(Array(12).fill(fill)); setDirty(true) }}>Hepsine uygula</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Ay</th><th className="num">Hedef (₺)</th><th className="num">Yapılan ciro</th><th style={{ width: 220 }}>İlerleme</th><th className="num">Fark</th></tr></thead>
            <tbody>
              {MONTHS.map((m, i) => {
                const t = target(i), a = actual(i)
                const pct = t > 0 ? (a / t) * 100 : 0
                return (
                  <tr key={m}>
                    <td><b>{m}</b></td>
                    <td className="num">
                      <input style={{ maxWidth: 150, textAlign: 'right' }} type="number" min="0" step="1" placeholder="—" value={vals[i]} onChange={e => edit(i, e.target.value)} />
                    </td>
                    <td className="num">{money(a)}</td>
                    <td>
                      {t > 0 ? (
                        <div className="mini-progress">
                          <div className="progress"><div className={pct >= 100 ? 'fill good' : 'fill'} style={{ width: `${Math.min(100, pct)}%` }} /></div>
                          <span>%{pct.toFixed(0)}</span>
                        </div>
                      ) : <span className="muted">Hedef yok</span>}
                    </td>
                    <td className="num">{t > 0 ? <span className={a >= t ? 'pos' : 'neg'}>{a >= t ? '+' : '−'}{money(Math.abs(a - t))}</span> : ''}</td>
                  </tr>
                )
              })}
              <tr className="total">
                <td>Yıllık toplam</td><td className="num">{money(totalTarget)}</td><td className="num">{money(totalActual)}</td>
                <td>{totalTarget > 0 && `%${((totalActual / totalTarget) * 100).toFixed(0)}`}</td>
                <td className="num">{totalTarget > 0 && <span className={totalActual >= totalTarget ? 'pos' : 'neg'}>{totalActual >= totalTarget ? '+' : '−'}{money(Math.abs(totalActual - totalTarget))}</span>}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
