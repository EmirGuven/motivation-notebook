import { useEffect, useState } from 'react'
import { api, auth } from './api'
import Login from './Login'
import Dashboard from './Dashboard'
import Customers from './Customers'
import CustomerDetail from './CustomerDetail'
import Commission from './Commission'
import Settings from './Settings'
import AddPatient from './AddPatient'
import Targets from './Targets'
import Prim from './Prim'
import Chat from './Chat'
import Icon, { type IconName } from './Icon'

type Tab = 'dashboard' | 'add' | 'targets' | 'prim' | 'commission' | 'customers' | 'settings'

const MENU: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'targets', label: 'Hedefler', icon: 'targets' },
  { key: 'prim', label: 'Prim', icon: 'prim' },
  { key: 'commission', label: 'Komisyon', icon: 'commission' },
  { key: 'customers', label: 'Müşteriler', icon: 'customers' },
  { key: 'settings', label: 'Ayarlar', icon: 'settings' },
]

export default function App() {
  const [authed, setAuthed] = useState(!!auth.token())
  const [tab, setTab] = useState<Tab>('dashboard')
  const [openId, setOpenId] = useState<number | null>(null)
  const [logo, setLogo] = useState<string | null>(null)
  const [version, setVersion] = useState(0) // sohbet veri değiştirince sayfalar yeniden yüklenir

  useEffect(() => {
    const h = () => setAuthed(false)
    window.addEventListener('crm-unauthorized', h)
    return () => window.removeEventListener('crm-unauthorized', h)
  }, [])

  useEffect(() => {
    if (!authed) return
    api.logo().then(l => setLogo(l.dataUrl)).catch(() => {})
    const h = (e: Event) => setLogo((e as CustomEvent<string | null>).detail)
    window.addEventListener('crm-logo', h)
    return () => window.removeEventListener('crm-logo', h)
  }, [authed])

  if (!authed) return <Login onLogin={() => setAuthed(true)} />

  return (
    <div className="layout">
      <aside>
        <div className="brand">{logo ? <img src={logo} alt="Logo" /> : <i>C</i>}</div>
        {MENU.map(m => (
          <button key={m.key} className={tab === m.key ? 'on' : ''} onClick={() => { setTab(m.key); setOpenId(null) }}>
            <span className="ico"><Icon name={m.icon} /></span>{m.label}
          </button>
        ))}
        <div className="user"><span className="avatar">{(auth.user() ?? '?').charAt(0).toUpperCase()}</span><span className="uname">{auth.user() ?? 'Kullanıcı'}</span></div>
        <button className="logout" onClick={async () => { await auth.logout(); setAuthed(false) }}><span className="ico"><Icon name="logout" /></span>Çıkış</button>
      </aside>
      <main key={version}>
        {tab === 'dashboard' && <Dashboard onNavigate={setTab} />}
        {tab === 'add' && <AddPatient onNavigate={setTab} />}
        {tab === 'targets' && <Targets />}
        {tab === 'prim' && <Prim onNavigate={setTab} />}
        {tab === 'commission' && <Commission onNavigate={setTab} />}
        {tab === 'settings' && <Settings onLogout={async () => { await auth.logout(); setAuthed(false) }} />}
        {tab === 'customers' && (openId
          ? <CustomerDetail id={openId} onBack={() => setOpenId(null)} />
          : <Customers onOpen={setOpenId} />)}
      </main>
      <Chat onChanged={() => setVersion(v => v + 1)} />
    </div>
  )
}
