import { useEffect, useId, useState } from 'react';

interface Props {
  label: string;
  value: number;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  digits?: number;
  hint?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}

export function NumberField({
  label,
  value,
  unit,
  min,
  max,
  step = 1,
  digits = 2,
  hint,
  onChange,
  disabled,
}: Props) {
  const id = useId();
  const fmt = (v: number) => (Number.isFinite(v) ? String(Number(v.toFixed(digits))) : '');
  const [text, setText] = useState(fmt(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);

  const commit = (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setText(fmt(value));
      return;
    }
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    onChange(v);
    setText(fmt(v));
  };

  return (
    <label className="field" htmlFor={id} title={hint}>
      <span className="field-label">{label}</span>
      <span className={`field-input${disabled ? ' is-disabled' : ''}`}>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={text}
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            if (Number.isFinite(n) && e.target.value.trim() !== '') {
              let v = n;
              if (min !== undefined) v = Math.max(min, v);
              if (max !== undefined) v = Math.min(max, v);
              if (v !== n) return; // wait for blur to clamp
              onChange(v);
            }
          }}
          onBlur={(e) => {
            setFocused(false);
            commit(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        {unit ? <span className="field-unit">{unit}</span> : null}
      </span>
    </label>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  hint?: string;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: SelectFieldProps<T>) {
  const id = useId();
  return (
    <label className="field" htmlFor={id} title={hint}>
      <span className="field-label">{label}</span>
      <span className="field-input">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value} title={o.hint}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}

export function Toggle({ label, checked, onChange, hint }: ToggleProps) {
  return (
    <label className="toggle" title={hint}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-label">{label}</span>
    </label>
  );
}
