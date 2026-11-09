import { useEffect, useState } from 'react'
import { api, money, type Customer } from './api'
import Modal from './Modal'

const empty = { firstName: '', lastName: '', phone: '', email: '', notes: '' }
export const initials = (c: { firstName: string; lastName: string }) =>
  ((c.firstName[0] ?? '') + (c.lastName[0] ?? '')).toUpperCase() || '?'

export default function Customers({ onOpen }: { onOpen: (id: number) => void }) {
  const [list, setList] = useState<Customer[]>([])
  const [q, setQ] = useState('')
  const [modal, setModal] = useState<{ id: number | null } | null>(null)
  const [form, setForm] = useState(empty)
  const [err, setErr] = useState('')

  const load = () => api.customers(q).then(setList)
  useEffect(() => { load() }, [q])

  function openNew() { setForm(empty); setErr(''); setModal({ id: null }) }
  function openEdit(c: Customer) {
    setForm({ firstName: c.firstName, lastName: c.lastName, phone: c.phone ?? '', email: c.email ?? '', notes: c.notes ?? '' })
    setErr(''); setModal({ id: c.id })
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    try {
      if (modal?.id) await api.updateCustomer(modal.id, form)
      else await api.addCustomer(form)
      setModal(null)
      load()
    } catch (x) { setErr((x as Error).message) }
  }

  async function remove(c: Customer) {
    if (!confirm(`${c.firstName} ${c.lastName} ve tüm kayıtları silinsin mi?`)) return
    await api.deleteCustomer(c.id)
    load()
  }

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value })

  return (
    <div className="stack">
      <div className="page-head">
        <div><h2>Müşteriler</h2><p>{list.length} kayıtlı müşteri</p></div>
        <button className="btn primary" onClick={openNew}>+ Yeni müşteri</button>
      </div>

      <div className="panel">
        <div className="panel-head">
          <input className="search" placeholder="Ad veya telefon ara…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        {list.length === 0 ? (
          <div className="empty"><b>Müşteri bulunamadı</b>{q ? 'Aramayı değiştirmeyi dene.' : 'İlk müşteriyi eklemek için "Yeni müşteri" butonuna bas.'}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Müşteri</th><th>Telefon</th><th className="num">Kayıt</th><th className="num">Toplam tutar</th><th /></tr></thead>
              <tbody>
                {list.map(c => (
                  <tr key={c.id} className="click" onClick={() => onOpen(c.id)}>
                    <td>
                      <div className="person">
                        <div className="avatar">{initials(c)}</div>
                        <div><b>{`${c.firstName} ${c.lastName}`.trim() || '(isimsiz)'}</b><small>{c.email}</small></div>
                      </div>
                    </td>
                    <td>{c.phone || <span className="muted">—</span>}</td>
                    <td className="num">{c.surgeryCount}</td>
                    <td className="num">{money(c.totalPrice ?? 0)}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="actions">
                        <button className="btn sm" onClick={() => openEdit(c)}>Düzenle</button>
                        <button className="btn sm danger" onClick={() => remove(c)}>Sil</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <Modal title={modal.id ? 'Müşteriyi düzenle' : 'Yeni müşteri'} onClose={() => setModal(null)}>
          <form onSubmit={save}>
            <div className="modal-body">
              <div className="form-grid">
                <label className="field">Ad<input autoFocus value={form.firstName} onChange={set('firstName')} /></label>
                <label className="field">Soyad<input value={form.lastName} onChange={set('lastName')} /></label>
                <label className="field">Telefon<input value={form.phone} onChange={set('phone')} placeholder="05xx xxx xx xx" /></label>
                <label className="field">E-posta<input type="email" value={form.email} onChange={set('email')} /></label>
                <label className="field full">Notlar<textarea value={form.notes} onChange={set('notes')} /></label>
              </div>
              {err && <p className="err">{err}</p>}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn" onClick={() => setModal(null)}>Vazgeç</button>
              <button className="btn primary">Kaydet</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
