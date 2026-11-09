import { useEffect, useState } from 'react'
import { api, money, type AppSettings } from './api'

export interface CurrencyValue { currency: string; rate: string }

// Para birimi seçimi. Kur burada girilmez; Ayarlar'dan gelir, kayıt sırasında backend uygular (rate sadece önizleme).
export default function CurrencyFields({ value, onChange, amount }: {
  value: CurrencyValue
  onChange: (v: CurrencyValue) => void
  amount: number
}) {
  const [st, setSt] = useState<AppSettings | null>(null)

  useEffect(() => {
    api.settings().then(s => {
      setSt(s)
      if (!value.currency) pick(s.defaultCurrency, s)
    })
  }, [])

  function pick(code: string, s = st) {
    const eff = s?.currencies.find(c => c.code === code)?.effectiveRate
    onChange({ currency: code, rate: code === 'TRY' ? '1' : eff ? String(eff) : '' })
  }

  if (!st) return null
  const tl = value.currency === 'TRY' ? null : amount * (+value.rate || 0)
  return (
    <label className="field">Para birimi
      <select value={value.currency} onChange={e => pick(e.target.value)}>
        {st.currencies.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
      </select>
      {tl !== null && amount > 0 && <small className="muted">≈ {money(tl)} (Ayarlar'daki kur)</small>}
    </label>
  )
}
