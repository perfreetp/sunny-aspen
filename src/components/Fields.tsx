import type { JSX } from 'solid-js';

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: string;
  warning?: boolean;
  disabled?: boolean;
  onChange: (value: number) => void;
}

export function NumberField(props: NumberFieldProps): JSX.Element {
  const step = () => props.step ?? 1;
  const isInteger = () => step() >= 1;

  const commit = (raw: number) => {
    if (!Number.isFinite(raw)) return;
    props.onChange(raw);
  };

  return (
    <label class="field" classList={{ 'field-warning': props.warning, 'field-disabled': props.disabled }}>
      <span class="field-label-row">
        <span class="field-label">{props.label}</span>
        <span class="field-value">
          <input
            class="number-input"
            type="number"
            value={props.value}
            min={props.min}
            max={props.max}
            step={props.step}
            disabled={props.disabled}
            onInput={(event) => commit(event.currentTarget.valueAsNumber)}
          />
          {props.unit ? <span class="field-unit">{props.unit}</span> : null}
        </span>
      </span>
      <input
        class="range-input"
        type="range"
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step}
        disabled={props.disabled}
        onInput={(event) => commit(event.currentTarget.valueAsNumber)}
      />
      {props.hint ? <span class="field-hint">{props.hint}</span> : null}
      {isInteger() ? null : null}
    </label>
  );
}

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; title?: string }>;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>(props: SegmentedControlProps<T>): JSX.Element {
  return (
    <div class="field">
      <span class="field-label">{props.label}</span>
      <div class="segmented">
        {props.options.map((option) => (
          <button
            type="button"
            class="segmented-button"
            classList={{ active: props.value === option.value }}
            title={option.title}
            onClick={() => props.onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
