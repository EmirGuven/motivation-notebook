export default function Tabs<T extends string>({ items, value, onChange, label }: {
  items: { key: T; label: string }[]
  value: T
  onChange: (k: T) => void
  label: string
}) {
  return (
    <div className="seg" role="tablist" aria-label={label} style={{ alignSelf: 'flex-start' }}>
      {items.map(t => (
        <button key={t.key} type="button" role="tab" aria-selected={value === t.key}
          className={value === t.key ? 'on' : ''} onClick={() => onChange(t.key)}>{t.label}</button>
      ))}
    </div>
  )
}
