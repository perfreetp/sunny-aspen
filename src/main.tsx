import { createRoot } from 'react-dom/client';
import App from './App';
import { useAppStore } from './store';
import * as timing from './lib/timing';
import './styles.css';

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__SHADE_STORE__ = useAppStore;
  (window as unknown as Record<string, unknown>).__SHADE_TIMING__ = timing;
}

const container = document.getElementById('root');
if (!container) throw new Error('Root container #root not found');
createRoot(container).render(<App />);
