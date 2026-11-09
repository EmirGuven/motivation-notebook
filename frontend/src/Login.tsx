import { useState } from 'react'
import { auth } from './api'

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    try {
      await auth.login(u, p)
      onLogin()
    } catch (x) {
      setErr((x as Error).message)
    }
  }

  return (
    <div className="login">
      <form onSubmit={submit}>
        <div className="logo">C</div>
        <h2>Giriş yap</h2>
        <p className="sub">Hasta, ciro ve prim defterine eriş.</p>
        <label className="field">Kullanıcı adı
          <input autoFocus value={u} onChange={e => setU(e.target.value)} />
        </label>
        <label className="field">Şifre
          <input type="password" value={p} onChange={e => setP(e.target.value)} />
        </label>
        {err && <p className="err">{err}</p>}
        <button className="btn primary">Giriş yap</button>
      </form>
    </div>
  )
}
