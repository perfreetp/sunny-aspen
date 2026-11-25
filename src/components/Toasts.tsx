import { useAppStore } from '../store';

export function Toasts() {
  const notices = useAppStore((s) => s.notices);
  const dismiss = useAppStore((s) => s.dismissNotice);
  return (
    <div className="toast-stack">
      {notices.map((n) => (
        <button key={n.id} type="button" className={`toast ${n.tone}`} onClick={() => dismiss(n.id)}>
          <span className="toast-icon">{n.tone === 'ok' ? '✓' : n.tone === 'warn' ? '!' : 'i'}</span>
          <span>{n.text}</span>
        </button>
      ))}
    </div>
  );
}
