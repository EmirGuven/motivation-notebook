import { useEffect, useRef, useState } from 'react'
import { api, type ChatTurn } from './api'
import Icon from './Icon'

interface Msg extends ChatTurn { actions?: string[]; error?: boolean; basic?: boolean }

const KEY = 'crm_chat'
const EXAMPLES = [
  'Ayşe Yılmaz saç ekimi 14 Kasım 50000 TL kaydet',
  'Berk Nacar\'a "telefonu açmıyor" notunu al',
  'Emir Güven\'in tarihini 25 Kasım yap',
  'Bu ay ne kadar ciro yaptım?',
]

function load(): Msg[] {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export default function Chat({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>(load)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-40))) } catch { /* yoksay */ }
    end.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, open, busy])

  async function send(content: string) {
    content = content.trim()
    if (!content || busy) return
    const next: Msg[] = [...msgs, { role: 'user', content }]
    setMsgs(next); setText(''); setBusy(true)
    try {
      // Hata mesajlarını ve eylem etiketlerini modele geri göndermiyoruz, sadece konuşma metnini.
      const history = next.filter(m => !m.error).slice(-30).map(({ role, content }) => ({ role, content }))
      const r = await api.chat(history)
      setMsgs([...next, { role: 'assistant', content: r.reply, actions: r.actions, basic: r.basic }])
      if (r.changed) onChanged()
    } catch (e) {
      setMsgs([...next, { role: 'assistant', content: (e as Error).message, error: true }])
    } finally { setBusy(false) }
  }

  return (
    <>
      {!open && <button className="chat-fab" onClick={() => setOpen(true)} aria-label="Asistanı aç"><Icon name="chat" size={22} /><span className="fab-label">Asistan</span></button>}
      {open && (
        <div className="chat">
          <div className="chat-head">
            <b>Asistan</b>{msgs.some(m => m.basic) && <span className="badge-basic" title="Claude API anahtarı yok; kalıp cümleleri anlayan basit mod çalışıyor">basit mod</span>}
            <div>
              {msgs.length > 0 && <button className="btn sm" onClick={() => setMsgs([])}>Temizle</button>}{' '}
              <button className="btn sm icon" onClick={() => setOpen(false)} aria-label="Kapat"><Icon name="close" size={16} /></button>
            </div>
          </div>
          <div className="chat-body">
            {msgs.length === 0 && (
              <div className="chat-empty">
                <p>Ne yapmak istediğini yaz; hasta kaydeder, not alır, kayıt düzeltirim. Aşağıdakine benzer cümleler kur:</p>
                {EXAMPLES.map(e => <button key={e} className="chip" onClick={() => send(e)}>{e}</button>)}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`bubble ${m.role}${m.error ? ' error' : ''}`}>
                {m.actions?.map((a, j) => <div key={j} className="action"><Icon name="check" size={14} />{a}</div>)}
                <div className="bubble-text">{m.content}</div>
              </div>
            ))}
            {busy && <div className="bubble assistant"><span className="typing">Çalışıyor…</span></div>}
            <div ref={end} />
          </div>
          <form className="chat-input" onSubmit={e => { e.preventDefault(); send(text) }}>
            <input autoFocus placeholder="Örn. Ali Veli'ye not al…" value={text} onChange={e => setText(e.target.value)} disabled={busy} />
            <button className="btn primary" disabled={busy || !text.trim()}>Gönder</button>
          </form>
        </div>
      )}
    </>
  )
}
