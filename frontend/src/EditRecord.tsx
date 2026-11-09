import { useState } from 'react'
import { api, statusLabel, type Surgery, type SurgeryStatus } from './api'
import CurrencyFields, { type CurrencyValue } from './CurrencyFields'
import Modal from './Modal'

// Bir hasta kaydını (hasta adı + hizmet/tarih/ciro/para birimi/durum/not) sonradan düzeltir. Hiçbir alan zorunlu değil.
export default function EditRecord({ s, onClose, onSaved }: { s: Surgery; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(s.customerName ?? '')
  const [service, setService] = useState(s.title)
  const [date, setDate] = useState(s.date.slice(0, 10))
  const [ciro, setCiro] = useState(String(s.price))
  const [cur, setCur] = useState<CurrencyValue>({ currency: s.currency, rate: String(s.rateToTry) })
  const [status, setStatus] = useState<SurgeryStatus>(s.status)
  const [note, setNote] = useState(s.notes ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      const clean = name.trim().replace(/\s+/g, ' ')
      if (clean !== (s.customerName ?? '').trim()) {
        const parts = clean.split(' ').filter(Boolean)
        const lastName = parts.length > 1 ? parts.pop()! : ''
        const c = await api.customer(s.customerId)
        // PUT tüm alanları yazdığı için mevcut telefon/e-posta/notu koruyoruz
        await api.updateCustomer(s.customerId, { firstName: parts.join(' '), lastName, phone: c.phone, email: c.email, notes: c.notes })
      }
      const price = +ciro || 0
      await api.updateSurgery(s.id, {
        customerId: s.customerId, title: service.trim(), date: date || new Date().toISOString().slice(0, 10),
        price, paidAmount: price, currency: cur.currency || s.currency, status, notes: note || null,
        commissionRate: s.commissionRate,
        // para birimi aynıysa backend kayıt anındaki kuru korur, değiştiyse güncel kuru uygular
      })
      onSaved(); onClose()
    } catch (x) { setErr((x as Error).message); setBusy(false) }
  }

  return (
    <Modal title="Kaydı düzenle" onClose={onClose}>
      <form onSubmit={save}>
        <div className="modal-body">
          <div className="form-grid">
            <label className="field full">Hasta adı soyadı<input autoFocus value={name} onChange={e => setName(e.target.value)} /></label>
            <label className="field full">Hizmet<input value={service} onChange={e => setService(e.target.value)} /></label>
            <label className="field">Geliş tarihi<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
            <label className="field">Durum
              <select value={status} onChange={e => setStatus(e.target.value as SurgeryStatus)}>
                {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="field">Ciro<input type="number" min="0" step="0.01" value={ciro} onChange={e => setCiro(e.target.value)} /></label>
            <CurrencyFields value={cur} onChange={setCur} amount={+ciro || 0} />
            <label className="field full">Not<textarea value={note} onChange={e => setNote(e.target.value)} /></label>
          </div>
          {err && <p className="err">{err}</p>}
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Para birimini değiştirirsen güncel kur uygulanır; değiştirmezsen kaydın kuru aynı kalır.</p>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
          <button className="btn primary" disabled={busy}>Kaydet</button>
        </div>
      </form>
    </Modal>
  )
}
