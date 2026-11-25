import { TopBar } from './components/TopBar';
import { LeftPanel } from './components/LeftPanel';
import { Viewport } from './components/Viewport';
import { Inspector } from './components/Inspector';
import { Timeline } from './components/Timeline';
import { ExportDialog } from './components/ExportDialog';
import { Toasts } from './components/Toasts';
import { useAppStore } from './store';

export default function App() {
  const presentMode = useAppStore((s) => s.presentMode);
  return (
    <div className={`app-shell ${presentMode ? 'present-mode' : ''}`}>
      <TopBar />
      <LeftPanel />
      <Viewport />
      <Inspector />
      <Timeline />
      <ExportDialog />
      <Toasts />
    </div>
  );
}
