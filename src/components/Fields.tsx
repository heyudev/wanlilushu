// Small form controls shared by the welcome screen, trip settings and cost parameters.

export function Choice<T extends string>({ value, options, onChange, label }: {
  value: T; options: [T, string][]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="seg-btns" role="group" aria-label={label}>
        {options.map(([v, t]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{t}</button>)}
      </div>
    </div>
  );
}

export function Num({ id, label, value, onChange, step = 1, min = 0, unit }: {
  id: string; label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; unit?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}{unit && <span className="muted">（{unit}）</span>}</label>
      <input id={id} type="number" inputMode="decimal" value={value} step={step} min={min}
        onChange={(e) => { const v = Number(e.target.value); if (e.target.value !== "" && Number.isFinite(v)) onChange(v); }} />
    </div>
  );
}

export function Stepper({ id, label, value, onChange, min = 0, max = 9 }: {
  id: string; label: string; value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  return (
    <div className="stepper" role="group" aria-labelledby={id}>
      <span id={id}>{label}</span>
      <button type="button" aria-label={`${label}减一`} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <b className="num" aria-live="polite">{value}</b>
      <button type="button" aria-label={`${label}加一`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

export function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

/** Number input that may be left empty (null = not filled in). */
export function NumOpt({ id, label, value, onChange, step = 1, unit, placeholder = "未填写" }: {
  id: string; label: string; value: number | null; onChange: (v: number | null) => void; step?: number; unit?: string; placeholder?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}{unit && <span className="muted">（{unit}）</span>}</label>
      <input id={id} type="number" inputMode="decimal" step={step} min={0} placeholder={placeholder} value={value ?? ""}
        className={value == null ? "empty" : ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))} />
    </div>
  );
}
