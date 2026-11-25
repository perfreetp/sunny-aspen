import './styles.css';
import './components/effect-studio';
import { store } from './state/store';

declare global {
  interface Window {
    studio?: {
      store: typeof store;
    };
  }
}

window.studio = { store };
