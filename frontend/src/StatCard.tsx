import Icon, { type IconName } from './Icon'

// Kart: ikon+başlık, değer, geçen aya göre değişim ve yıllık mini grafik (seçili ay noktayla işaretli).
export default function StatCard({ icon, title, value, series, index, accent }: {
  icon: IconName
  title: string
  value: string
  series: number[] // 12 ay
  index: number // seçili ay (0-11)
  accent?: boolean
}) {
  const cur = series[index]
  const prev = index > 0 ? series[index - 1] : null
  // Geçen ay 0 ise yüzde hesaplanamaz; 0'dan artış yine "yükseliş" sayılır.
  const pct = prev !== null && prev > 0 ? ((cur - prev) / prev) * 100 : null
  const fromZero = prev === 0 && cur > 0
  const up = fromZero || (pct !== null && pct >= 0)
  // yükselişte yeşil, düşüşte kırmızı, yatay (±%2) ya da karşılaştırma yoksa sarı
  const FLAT = 2
  const color = { good: '#1b7f4b', bad: '#d23b2a', warn: '#e0a800' }
  const tone = fromZero ? 'good' : pct === null || Math.abs(pct) < FLAT ? 'warn' : up ? 'good' : 'bad'
  const c = color[tone]

  // Mini grafik: seçili ayda biten son 6 ay. Gelecek ayları (0 görünür) çizmeyiz, yoksa ay sonrası sahte düşüş gibi durur.
  const win = series.slice(Math.max(0, index - 5), index + 1)
  const W = 120, H = 56, pad = 5
  const max = Math.max(...win), min = Math.min(...win)
  const span = max - min || 1
  const pts = win.map((v, i) => [
    win.length === 1 ? W - pad : pad + (i * (W - 2 * pad)) / (win.length - 1),
    max === min ? H / 2 : H - pad - ((v - min) / span) * (H - 2 * pad),
  ] as const)
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const [sx, sy] = pts[pts.length - 1]

  return (
    <div className={'card stat tone-' + tone + (accent ? ' accent' : '')}>
      <div className="stat-title"><Icon name={icon} size={18} /><span>{title}</span></div>
      <div className="stat-body">
        <div className="stat-main">
          <b>{value}</b>
          <div className={'stat-delta ' + tone} style={{ color: c }}>
            {fromZero ? <><span>▲</span><span>Yeni</span></> : pct === null ? <span>—</span> : <><span>{up ? '▲' : '▼'}</span><span>%{Math.abs(pct).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</span></>}
            <small>geçen aya göre</small>
          </div>
        </div>
        <svg className="spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <polyline points={line} fill="none" stroke={c} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={sx} cy={sy} r="4" fill={c} stroke="#fff" strokeWidth="2" />
        </svg>
      </div>
    </div>
  )
}
