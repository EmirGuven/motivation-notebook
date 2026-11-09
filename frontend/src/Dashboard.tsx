import Tabs from './Tabs'
import { useEffect, useState } from 'react'
import { api, day, money, type PrimMonth, type PrimYear, type RevenueReport, type Surgery } from './api'
import Icon from './Icon'
import StatCard from './StatCard'

const MONTHS_FULL = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const pad = (n: number) => String(n).padStart(2, '0')
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate()

export default function Dashboard({ onNavigate }: { onNavigate: (tab: 'add' | 'commission' | 'prim') => void }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [tab, setTab] = useState<'month' | 'prim'>('month')
  // Kartların/prim tablosunun penceresi (başlangıç ayı + 2 ay). Karta basınca sadece seçili ay değişir, pencere yerinde kalır.
  const [anchor, setAnchor] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [r, setR] = useState<RevenueReport | null>(null)
  const [rows, setRows] = useState<Surgery[]>([])
  const [prim, setPrim] = useState<PrimMonth | null>(null)
  const [primYear, setPrimYear] = useState<PrimYear | null>(null)
  const [simPct, setSimPct] = useState<number | null>(null) // null = puana göre gerçek hakediş, sayı = o orana göre simülasyon
  const [primNext, setPrimNext] = useState<PrimYear | null>(null) // yıl sonunda 3 aylık pencere sonraki yıla taşar
  const [targets, setTargets] = useState<(number | null)[]>(Array(12).fill(null))
  // Hedef kartları: seçili ay + sonraki 2 ay. Yıl sonunu aşabildiği için iki yılın verisi tutulur.
  const [span, setSpan] = useState<{ revenue: Map<string, number>; target: Map<string, number> }>({ revenue: new Map(), target: new Map() })

  useEffect(() => {
    api.revenue(`${year}-01-01`, `${year}-12-31T23:59:59`).then(setR)
    api.targets(year).then(t => setTargets(t.months))
  }, [year])

  useEffect(() => {
    Promise.all([anchor.year, anchor.year + 1].map(y => Promise.all([
      api.revenue(`${y}-01-01`, `${y}-12-31T23:59:59`),
      api.targets(y),
    ]))).then(res => {
      const revenue = new Map<string, number>(), target = new Map<string, number>()
      res.forEach(([rep, t]) => {
        rep.monthly.forEach(m => revenue.set(m.month, m.revenue))
        t.months.forEach((v, i) => { if (v) target.set(`${t.year}-${pad(i + 1)}`, v) })
      })
      setSpan({ revenue, target })
    })
  }, [anchor.year])

  useEffect(() => {
    api.surgeries(`?from=${year}-${pad(month)}-01&to=${year}-${pad(month)}-${lastDay(year, month)}T23:59:59`)
      .then(a => setRows(a.filter(s => s.status !== 'Cancelled')))
  }, [year, month])

  useEffect(() => { api.prim(year, month).then(setPrim) }, [year, month])
  useEffect(() => { api.primYear(anchor.year).then(setPrimYear) }, [anchor.year])
  useEffect(() => { api.primYear(anchor.year + 1).then(setPrimNext) }, [anchor.year])

  function shift(d: number) {
    const idx = anchor.year * 12 + (anchor.month - 1) + d
    const ny = Math.floor(idx / 12), nm = (idx % 12) + 1
    setAnchor({ year: ny, month: nm }); setYear(ny); setMonth(nm)
  }

  const byMonth = new Map(r?.monthly.map(m => [m.month, m]))
  const cur = byMonth.get(`${year}-${pad(month)}`)
  const revenue = cur?.revenue ?? 0
  const count = cur?.count ?? 0
  const goal = targets[month - 1] ?? 0
  const left = goal - revenue

  // Başlık altı özet cümlesi
  const goalText = goal <= 0
    ? 'Bu ay için hedef girilmemiş.'
    : left > 0
      ? `hedefe ulaşma %${Math.round((revenue / goal) * 100)}, hedefe ${money(left)} kaldı.`
      : `hedef aşıldı (+${money(-left)}).`
  const summary = count === 0
    ? `${MONTHS_FULL[month - 1]} ayında henüz hasta yok. ${goal > 0 ? `Hedef ${money(goal)}.` : ''}`
    : `${MONTHS_FULL[month - 1]} ayında ${count} hasta ile ${money(revenue)} ciro yaptınız${goal > 0 ? '; ' : '. '}${goalText}${prim ? ` Şu anki prim hakedişiniz ${money(prim.result.prim)}.` : ''}`

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Dashboard</h2><p>{summary}</p></div>
        <div className="toolbar">
          <div className="year-nav">
            <button className="btn sm" onClick={() => shift(-1)}>←</button>
            <b style={{ minWidth: 110 }}>{MONTHS_FULL[month - 1]} {year}</b>
            <button className="btn sm" onClick={() => shift(1)}>→</button>
          </div>
          <button className="btn primary" onClick={() => onNavigate('add')}>+ Hasta ekle</button>
        </div>
      </div>

      <div className="cards">
        <StatCard accent icon="prim" title={`${MONTHS_FULL[month - 1]} ciro`} value={money(revenue)} index={month - 1}
          series={Array.from({ length: 12 }, (_, i) => byMonth.get(`${year}-${pad(i + 1)}`)?.revenue ?? 0)} />
        <StatCard icon="customers" title="Hasta sayısı" value={String(count)} index={month - 1}
          series={Array.from({ length: 12 }, (_, i) => byMonth.get(`${year}-${pad(i + 1)}`)?.count ?? 0)} />
        <StatCard icon="targets" title={`${MONTHS_FULL[month - 1]} hedefi`} value={goal > 0 ? money(goal) : '—'} index={month - 1}
          series={targets.map(t => t ?? 0)} />
        <StatCard icon="check" title={goal > 0 && left < 0 ? 'Hedef aşıldı' : 'Kalan hedef'} value={goal > 0 ? money(Math.abs(left)) : '—'} index={month - 1}
          series={Array.from({ length: 12 }, (_, i) => { const t = targets[i] ?? 0; return t > 0 ? Math.max(0, t - (byMonth.get(`${year}-${pad(i + 1)}`)?.revenue ?? 0)) : 0 })} />
      </div>

      <div className="goals">
        {[0, 1, 2].map(k => {
          const idx = anchor.year * 12 + (anchor.month - 1) + k
          const y = Math.floor(idx / 12), m = (idx % 12) + 1
          const key = `${y}-${pad(m)}`
          const selected = y === year && m === month
          const target = span.target.get(key) ?? 0
          const title = `${MONTHS_FULL[m - 1]}${y !== anchor.year ? ` ${y}` : ''} hedefi`
          return target > 0
            ? <Goal key={key} title={title} value={span.revenue.get(key) ?? 0} target={target} current={selected} onSelect={() => { setYear(y); setMonth(m) }} />
            : (
              <div key={key} className={'panel clickable' + (selected ? ' goal-current' : '')} role="button" tabIndex={0}
                onClick={() => { setYear(y); setMonth(m) }} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), (setYear(y), setMonth(m)))}>
                <div className="panel-body goal">
                  <div className="goal-top"><h3>{title}</h3></div>
                  <span className="muted">Hedef girilmemiş. <b>Hedefler</b> sayfasından ekleyebilirsin.</span>
                </div>
              </div>
            )
        })}
      </div>

      <Tabs label="Dashboard sekmeleri" items={[{ key: 'month', label: 'Bu ay' }, { key: 'prim', label: 'Prim kazancı' }]} value={tab} onChange={setTab} />

      {tab === 'month' && (
      <div className="two-col dash-cols">
        {prim && <PrimCard monthName={MONTHS_FULL[month - 1]} year={year} d={prim} yearTotal={(year === anchor.year ? primYear : primNext)?.totalPrim ?? 0} goalHit={goal > 0 && revenue >= goal} onOpen={() => onNavigate('prim')} />}

        <div className="panel">
          <div className="panel-head">
            <h3>{MONTHS_FULL[month - 1]} hastaları</h3>
            <button className="btn sm" onClick={() => onNavigate('commission')}>Komisyon sayfası</button>
          </div>
          {rows.length === 0 ? <div className="empty"><b>Bu ayda hasta yok</b>Hasta ekleyerek başla.</div> : (
            <div className="table-wrap">
              <table>
                <tbody>
                  {rows.slice(0, 4).map(s => (
                    <tr key={s.id}>
                      <td><b>{s.customerName}</b><br /><small className="muted"><span className="meta-date">{day(s.date)}</span>{s.title}</small></td>
                      <td className="num">{money(s.priceTry ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 4 && <div className="panel-body muted">+{rows.length - 4} hasta daha…</div>}
            </div>
          )}
        </div>
      </div>
      )}
      {tab === 'prim' && primYear && primNext && (() => {
        const topPercent = Math.max(0, ...(prim?.config.bands.map(b => b.percent) ?? [0]))
        // pencere: başlangıç ayı + sonraki 2 ay (geçmiş aylar gösterilmez)
        const items = [0, 1, 2].map(k => {
          const idx = anchor.year * 12 + (anchor.month - 1) + k
          const y = Math.floor(idx / 12), m = (idx % 12) + 1
          const src = y === anchor.year ? primYear : primNext
          const row = src.months.find(x => x.month === m)!
          return { ...row, year: y, k, sel: y === year && m === month }
        })
        // Filtre: oran seçenekleri Ayarlar'daki kademelerden gelir
        const options = [...new Set((prim?.config.bands ?? []).map(b => b.percent).filter(x => x > 0))].sort((a, b) => a - b)
        const shown = (x: { prim: number; revenue: number }) => simPct === null ? x.prim : x.revenue * simPct / 100
        const sum = items.reduce((t, x) => t + shown(x), 0)
        return (
          <div className="panel">
            <div className="panel-head">
              <h3>Prim kazancın <small className="muted">({MONTHS_FULL[anchor.month - 1]} ve sonraki 2 ay)</small></h3>
              <b>Toplam {money(sum)}</b>
            </div>
            <div className="seg-row">
              <span className="muted">Hakediş oranı</span>
              <div className="seg" role="group" aria-label="Hakediş oranı filtresi">
                <button className={simPct === null ? 'on' : ''} onClick={() => setSimPct(null)}>Puana göre</button>
                {options.map(o => <button key={o} className={simPct === o ? 'on' : ''} onClick={() => setSimPct(o)}>%{o}</button>)}
              </div>
              {simPct !== null && <span className="muted">Simülasyon: ciro × %{simPct}</span>}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ay</th><th className="num">Yapılan ciro (₺)</th><th className="num">Hedef (₺)</th><th className="num">Kalan hedef</th>
                    <th>Hedefe ulaşma</th><th className="num">Hakediş %</th><th className="num">Prim (₺)</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(m => {
                    const target = span.target.get(`${m.year}-${pad(m.month)}`) ?? 0
                    const reach = target > 0 ? (m.revenue / target) * 100 : 0
                    const isTop = topPercent > 0 && m.percent >= topPercent && m.hasData
                    return (
                      <tr key={`${m.year}-${m.month}`} className={'click' + (m.sel ? ' sel' : '')} onClick={() => { setYear(m.year); setMonth(m.month) }}>
                        <td><b>{MONTHS_FULL[m.month - 1]}{m.year !== anchor.year ? ` ${m.year}` : ''}</b></td>
                        <td className="num">{m.revenue > 0 ? money(m.revenue) : <span className="muted">—</span>}</td>
                        <td className="num">{target > 0 ? money(target) : <span className="muted">—</span>}</td>
                        <td className="num">{target > 0 ? (m.revenue >= target ? <span className="pos">Aşıldı +{money(m.revenue - target)}</span> : <span className="neg">{money(target - m.revenue)}</span>) : <span className="muted">—</span>}</td>
                        <td style={{ minWidth: 150 }}>
                          {target > 0 ? (
                            <div className="mini-progress">
                              <div className="progress"><div className={reach >= 100 ? 'fill good' : 'fill'} style={{ width: `${Math.min(100, reach)}%` }} /></div>
                              <span>%{reach.toFixed(0)}</span>
                            </div>
                          ) : <span className="muted">Hedef yok</span>}
                        </td>
                        <td className="num">{simPct !== null
                          ? <span className="pl-pct inline">%{simPct}</span>
                          : m.hasData ? <span className={'pl-pct inline' + (isTop ? ' top' : '')}>%{m.percent}</span> : <span className="muted">—</span>}</td>
                        <td className="num">{simPct !== null || m.hasData ? <b>{money(shown(m))}</b> : <span className="muted">—</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function Goal({ title, value, target, current, onSelect }: { title: string; value: number; target: number; current?: boolean; onSelect: () => void }) {
  const pct = target > 0 ? (value / target) * 100 : 0
  const done = pct >= 100
  return (
    <div className={'panel clickable' + (current ? ' goal-current' : '')} role="button" tabIndex={0}
      onClick={onSelect} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())}>
      <div className="panel-body goal">
        <div className="goal-top"><h3>{title}</h3><b className={done ? 'good' : ''}>%{pct.toFixed(0)}</b></div>
        <div className="progress"><div className={done ? 'fill good' : 'fill'} style={{ width: `${Math.min(100, pct)}%` }} /></div>
        <div className="goal-nums">
          <span>Yapılan <b>{money(value)}</b></span>
          <span>Hedef <b>{money(target)}</b></span>
        </div>
        <small className="muted">{done ? `Hedef aşıldı: +${money(value - target)}` : `Kalan: ${money(target - value)}`}</small>
      </div>
    </div>
  )
}

const MOODS: { from: number; title: string; text: string }[] = [
  { from: 5, title: 'Zirvedesin! Tebrikler', text: 'En üst kademedesin, bu ay prim tavanını yakaladın.' },
  { from: 4, title: 'Harikasın, zirve çok yakın', text: 'Çok iyi gidiyorsun, bir adım daha ve en üstesin.' },
  { from: 3, title: 'Güzel gidiyorsun', text: 'Sağlam bir kademedesin, böyle devam.' },
  { from: 1, title: 'Yola çıktın', text: 'Prim kazanmaya başladın, her yeni hasta primini büyütür.' },
  { from: 0, title: 'Haydi başlayalım', text: 'Hedefe doğru ilk adımları atma zamanı, sen yaparsın.' },
]

function PrimCard({ monthName, year, d, yearTotal, goalHit, onOpen }: {
  monthName: string; year: number; d: PrimMonth; yearTotal: number; goalHit: boolean; onOpen: () => void
}) {
  const r = d.result
  const mood = MOODS.find(m => r.bandPercent >= m.from)!
  const bands = [...d.config.bands].sort((a, b) => a.min - b.min)
  const topPercent = Math.max(0, ...bands.map(b => b.percent))
  const next = bands.find(b => b.min > r.totalPoints && b.percent > r.bandPercent)
  const celebrate = (topPercent > 0 && r.bandPercent >= topPercent) || goalHit
  const nf = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
  const need = next ? Math.ceil(next.min - r.totalPoints) : 0
  const extra = next ? r.revenue * next.percent / 100 - r.prim : 0
  const pct = next ? Math.min(100, (r.totalPoints / next.min) * 100) : 100

  return (
    <div className="prim-card">
      {celebrate && <div className="confetti" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ left: `${(i * 6.4) % 100}%`, animationDelay: `${(i % 6) * 0.15}s` }} />)}</div>}
      <div className="prim-top">
        <span className="prim-badge"><Icon name="prim" size={16} /> {monthName} primin</span>
        <button className="prim-link" onClick={onOpen}>Ayrıntı</button>
      </div>
      <div className="prim-amount">{money(r.prim)}</div>
      <div className="prim-sub"><span>%{nf(r.bandPercent)} hakediş</span><span>{nf(r.totalPoints)} / 100 puan</span></div>

      <div className="prim-mood"><b>{mood.title}</b><span>{mood.text}</span></div>
      {goalHit && <div className="prim-chip">Aylık ciro hedefini aştın</div>}

      <div className="prim-progress"><div style={{ width: `${pct}%` }} /></div>
      <div className="prim-next">
        {next
          ? <>Sonraki kademe <b>%{nf(next.percent)}</b> için <b>{need} puan</b> kaldı{extra > 0 && <> — primin <b>+{money(extra)}</b> artar</>}.</>
          : r.bandPercent > 0 ? 'Şu an en yüksek kademedesin.' : 'İlk kademeye ulaşmak için puan topla.'}
      </div>
      <div className="prim-year">{year} toplam prim: <b>{money(yearTotal)}</b></div>
    </div>
  )
}
