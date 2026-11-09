import { useEffect, useState } from 'react'
import { api, money, type Surgery } from './api'
import EditRecord from './EditRecord'
import CurrencyFields, { type CurrencyValue } from './CurrencyFields'

const blank = { name: '', service: '', date: new Date().toISOString().slice(0, 10), ciro: '' }

export default function AddPatient({ onNavigate }: { onNavigate: (tab: 'commission') => void }) {
  const [f, setF] = useState(blank)
  const [cur, setCur] = useState<CurrencyValue>({ currency: '', rate: '' })
  const [services, setServices] = useState<string[]>([])
  const [recent, setRecent] = useState<Surgery[]>([])
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Surgery | null>(null)

  const loadRecent = () => api.surgeries().then(all => {
    setRecent(all.slice(0, 5))
    setServices([...new Set(all.map(s => s.title).filter(t => t && t !== 'Hasta'))])
  })
  useEffect(() => { loadRecent() }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setOk(''); setBusy(true)
    try {
      const name = f.name.trim().replace(/\s+/g, ' ')
      const parts = name.split(' ').filter(Boolean)
      const lastName = parts.length > 1 ? parts.pop()! : ''
      const firstName = parts.join(' ') || 'İsimsiz'
      const existing = name === '' ? undefined : (await api.customers(name)).find(c =>
        `${c.firstName} ${c.lastName}`.trim().toLowerCase() === `${firstName} ${lastName}`.trim().toLowerCase())
      const customer = existing ?? await api.addCustomer({ firstName, lastName })
      const ciro = +f.ciro || 0
      await api.addSurgery({
        customerId: customer.id, title: f.service.trim(), date: f.date || new Date().toISOString().slice(0, 10),
        price: ciro, paidAmount: ciro, currency: cur.currency, status: 'Planned',
      })
      setOk(`${name || 'İsimsiz hasta'} eklendi.`)
      setF({ ...blank, date: f.date })
      loadRecent()
    } catch (x) { setErr((x as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Hasta ekle</h2><p>Hiçbir alan zorunlu değil; eksikleri sonradan Düzenle ile tamamlayabilirsin. Komisyon listesine otomatik düşer.</p></div>
        <button className="btn" onClick={() => onNavigate('commission')}>Komisyon listesine git</button>
      </div>

      <div className="panel">
        <div className="panel-body">
          <form onSubmit={submit} className="stack" style={{ maxWidth: 640 }}>
            <div className="form-grid">
              <label className="field full">Hasta adı soyadı
                <input autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
              </label>
              <label className="field full">Hizmet
                <input list="services" placeholder="Örn. Saç ekimi, Burun estetiği…" value={f.service} onChange={e => setF({ ...f, service: e.target.value })} />
                <datalist id="services">{services.map(s => <option key={s} value={s} />)}</datalist>
              </label>
              <label className="field">Geliş tarihi
                <input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
              </label>
              <label className="field">Ciro
                <input type="number" min="0" step="0.01" placeholder="50000" value={f.ciro} onChange={e => setF({ ...f, ciro: e.target.value })} />
              </label>
              <CurrencyFields value={cur} onChange={setCur} amount={+f.ciro || 0} />
            </div>
            {err && <p className="err">{err}</p>}
            {ok && <p className="ok">{ok}</p>}
            <div><button className="btn primary" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Hastayı kaydet'}</button></div>
          </form>
        </div>
      </div>

      {recent.length > 0 && (
        <div className="panel">
          <div className="panel-head"><h3>Son eklenenler</h3></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Tarih</th><th>Hasta</th><th>Hizmet</th><th className="num">Ciro</th><th /></tr></thead>
              <tbody>
                {recent.map(s => (
                  <tr key={s.id}>
                    <td>{new Date(s.date).toLocaleDateString('tr-TR')}</td><td><b>{s.customerName || '(isimsiz)'}</b></td><td>{s.title || '—'}</td>
                    <td className="num">{money(s.price, s.currency)}{s.currency !== 'TRY' && <small className="muted"><br />≈ {money(s.priceTry ?? 0)}</small>}</td>
                    <td><div className="actions"><button className="btn sm" onClick={() => setEditing(s)}>Düzenle</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {editing && <EditRecord s={editing} onClose={() => setEditing(null)} onSaved={loadRecent} />}
    </div>
  )
}
