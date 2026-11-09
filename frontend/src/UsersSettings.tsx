import { useEffect, useState } from 'react'
import { api, auth, day, type AppUser } from './api'

export default function UsersSettings() {
  const [users, setUsers] = useState<AppUser[] | null>(null)
  const [name, setName] = useState('')
  const [pass, setPass] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [newPass, setNewPass] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const me = auth.user()

  const load = () => api.users().then(setUsers)
  useEffect(() => { load() }, [])

  async function run(fn: () => Promise<unknown>, ok: string) {
    setErr(''); setMsg('')
    try { await fn(); await load(); setMsg(ok); setTimeout(() => setMsg(''), 2500) }
    catch (e) {
      const m = (e as Error).message
      try { setErr(JSON.parse(m)) } catch { setErr(m) }
    }
  }

  const add = () => run(async () => { await api.addUser(name.trim(), pass); setName(''); setPass('') }, 'Kullanıcı eklendi.')
  const changePass = (id: number) => run(async () => { await api.setUserPassword(id, newPass); setEditId(null); setNewPass('') }, 'Şifre güncellendi.')
  const remove = (u: AppUser) => confirm(`"${u.username}" silinsin mi?`) && run(() => api.deleteUser(u.id), 'Kullanıcı silindi.')
  const enter = (fn: () => void) => (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); fn() } }

  if (!users) return null

  return (
    <>
      <div className="panel">
        <div className="panel-head"><h3>Yeni kullanıcı</h3>{msg && <span className="muted">{msg}</span>}</div>
        <div className="panel-body form-grid">
          <label className="field">Kullanıcı adı
            <input value={name} autoComplete="off" onChange={e => setName(e.target.value)} onKeyDown={enter(add)} />
          </label>
          <label className="field">Şifre (en az 6 karakter)
            <input type="password" value={pass} autoComplete="new-password" onChange={e => setPass(e.target.value)} onKeyDown={enter(add)} />
          </label>
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn primary" disabled={!name.trim() || !pass} onClick={add}>Kullanıcı ekle</button>
          </div>
        </div>
        {err && <div className="panel-body" style={{ color: 'var(--danger)' }}>{err}</div>}
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Kullanıcılar ({users.length})</h3></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Kullanıcı adı</th><th>Eklenme</th><th /></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td><b>{u.username}</b>{u.username === me && <span className="muted"> (sen)</span>}</td>
                  <td>{day(u.createdAt)}</td>
                  <td>
                    {editId === u.id ? (
                      <div className="actions">
                        <input type="password" placeholder="Yeni şifre" autoComplete="new-password" value={newPass} style={{ maxWidth: 160 }}
                          onChange={e => setNewPass(e.target.value)} onKeyDown={enter(() => changePass(u.id))} />
                        <button type="button" className="btn sm primary" disabled={!newPass} onClick={() => changePass(u.id)}>Kaydet</button>
                        <button type="button" className="btn sm" onClick={() => { setEditId(null); setNewPass('') }}>Vazgeç</button>
                      </div>
                    ) : (
                      <div className="actions">
                        <button type="button" className="btn sm" onClick={() => { setEditId(u.id); setNewPass('') }}>Şifre değiştir</button>
                        {u.username !== me && <button type="button" className="btn sm danger" onClick={() => remove(u)}>Sil</button>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel-body muted">Şifresi değişen ya da silinen kullanıcının açık oturumu kapanır.</div>
      </div>
    </>
  )
}
