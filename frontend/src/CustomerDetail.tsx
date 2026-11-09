import { useEffect, useState } from 'react'
import { api, day, money, statusLabel, type Customer, type Surgery, type SurgeryStatus } from './api'
import { initials } from './Customers'
import Modal from './Modal'
import EditRecord from './EditRecord'
import CurrencyFields, { type CurrencyValue } from './CurrencyFields'

const blank = { title: '', date: '', price: '', paidAmount: '', status: 'Planned' as SurgeryStatus }

export default function CustomerDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const [c, setC] = useState<Customer | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Surgery | null>(null)
  const [f, setF] = useState(blank)
  const [cur, setCur] = useState<CurrencyValue>({ currency: '', rate: '' })

  const load = () => api.customer(id).then(setC)
  useEffect(() => { load() }, [id])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    await api.addSurgery({ customerId: id, title: f.title, date: f.date || new Date().toISOString().slice(0, 10), price: +f.price || 0, paidAmount: +f.paidAmount || 0, currency: cur.currency, status: f.status })
    setF(blank); setCur({ currency: '', rate: '' }); setOpen(false); load()
  }

  async function remove() {
    if (!confirm('Müşteri ve tüm kayıtları silinsin mi?')) return
    await api.deleteCustomer(id)
    onBack()
  }

  if (!c) return null
  const active = (c.surgeries ?? []).filter(s => s.status !== 'Cancelled')
  const price = active.reduce((t, s) => t + s.price * s.rateToTry, 0)
  const paid = active.reduce((t, s) => t + s.paidAmount * s.rateToTry, 0)

  return (
    <div className="stack">
      <div><button className="btn sm" onClick={onBack}>← Müşteriler</button></div>

      <div className="page-head">
        <div className="detail-head">
          <div className="avatar lg">{initials(c)}</div>
          <div>
            <h2>{`${c.firstName} ${c.lastName}`.trim() || '(isimsiz)'}</h2>
            <span className="muted">{[c.phone, c.email].filter(Boolean).map(v => <span key={v} className="contact-item">{v}</span>)}{!c.phone && !c.email && 'İletişim bilgisi yok'}</span>
          </div>
        </div>
        <button className="btn danger" onClick={remove}>Müşteriyi sil</button>
      </div>

      <div className="cards">
        <div className="card"><span>Kayıt sayısı</span><b>{active.length}</b></div>
        <div className="card"><span>Toplam tutar (₺)</span><b>{money(price)}</b></div>
        <div className="card accent"><span>Ödenen (₺)</span><b>{money(paid)}</b></div>
        <div className="card"><span>Kalan (₺)</span><b>{money(price - paid)}</b></div>
      </div>

      {c.notes && <div className="panel"><div className="panel-body"><span className="muted">Not: </span>{c.notes}</div></div>}

      <div className="panel">
        <div className="panel-head">
          <h3>Ameliyatlar</h3>
          <button className="btn primary sm" onClick={() => setOpen(true)}>+ Ameliyat ekle</button>
        </div>
        {!c.surgeries?.length ? (
          <div className="empty"><b>Henüz kayıt yok</b>İlk ameliyatı eklemek için butona bas.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Tarih</th><th>Ameliyat</th><th className="num">Ücret</th><th className="num">Ödenen</th><th>Durum</th><th /></tr></thead>
              <tbody>
                {c.surgeries.map(s => (
                  <tr key={s.id}>
                    <td>{day(s.date)}</td><td>{s.title || '—'}</td>
                    <td className="num">{money(s.price, s.currency)}{s.currency !== 'TRY' && <small className="muted"><br />≈ {money(s.price * s.rateToTry)}</small>}</td><td className="num">{money(s.paidAmount, s.currency)}</td>
                    <td><span className={`badge ${s.status}`}>{statusLabel[s.status]}</span></td>
                    <td><div className="actions"><button className="btn sm" onClick={() => setEditing({ ...s, customerName: `${c.firstName} ${c.lastName}`.trim(), customerId: c.id })}>Düzenle</button><button className="btn sm danger" onClick={async () => { await api.deleteSurgery(s.id); load() }}>Sil</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && (
        <Modal title="Ameliyat ekle" onClose={() => setOpen(false)}>
          <form onSubmit={add}>
            <div className="modal-body">
              <div className="form-grid">
                <label className="field full">Ameliyat<input autoFocus value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></label>
                <label className="field">Tarih<input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></label>
                <label className="field">Durum
                  <select value={f.status} onChange={e => setF({ ...f, status: e.target.value as SurgeryStatus })}>
                    {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <CurrencyFields value={cur} onChange={setCur} amount={+f.price || 0} />
                <label className="field">Ücret<input type="number" min="0" step="0.01" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></label>
                <label className="field">Ödenen<input type="number" min="0" step="0.01" value={f.paidAmount} onChange={e => setF({ ...f, paidAmount: e.target.value })} /></label>
              </div>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn" onClick={() => setOpen(false)}>Vazgeç</button>
              <button className="btn primary">Kaydet</button>
            </div>
          </form>
        </Modal>
      )}
      {editing && <EditRecord s={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  )
}