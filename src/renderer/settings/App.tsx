import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { tokens } from '../shared/tokens';
import { ToastHost } from '../shared/components/Toast';
import { useSettings } from '../shared/use-settings';
import { GeneralPage } from './pages/General';
import { HotkeysPage } from './pages/Hotkeys';
import { AudioPage } from './pages/Audio';
import { TranscriptionPage } from './pages/Transcription';
import { VocabularyPage } from './pages/Vocabulary';
import { AboutPage } from './pages/About';

type TabId = 'general' | 'hotkeys' | 'audio' | 'transcription' | 'vocabulary' | 'about';

interface Tab {
  id: TabId;
  label: string;
  available: boolean;
}

const TABS: Tab[] = [
  { id: 'general', label: 'General', available: true },
  { id: 'hotkeys', label: 'Hotkeys', available: true },
  { id: 'audio', label: 'Audio', available: true },
  { id: 'transcription', label: 'Transcription', available: true },
  { id: 'vocabulary', label: 'Vocabulary', available: true },
  { id: 'about', label: 'About', available: true }
];

export default function App(): JSX.Element {
  const [active, setActive] = useState<TabId>('general');
  const load = useSettings((s) => s.load);
  const loaded = useSettings((s) => s.loaded);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        body, html, #root { margin: 0; padding: 0; height: 100vh; background: ${tokens.color.bg}; color: ${tokens.color.text}; font-family: ${tokens.font.sans}; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: ${tokens.color.border}; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: ${tokens.color.slate}; }
      `}</style>
      <div style={layout}>
        <Sidebar active={active} onSelect={setActive} />
        <main style={main}>
          {!loaded ? (
            <div style={{ color: tokens.color.textDim, padding: 32 }}>Loading…</div>
          ) : (
            <PageContent tab={active} />
          )}
        </main>
      </div>
      <ToastHost />
    </>
  );
}

function PageContent({ tab }: { tab: TabId }): JSX.Element {
  switch (tab) {
    case 'general':
      return <GeneralPage />;
    case 'hotkeys':
      return <HotkeysPage />;
    case 'audio':
      return <AudioPage />;
    case 'transcription':
      return <TranscriptionPage />;
    case 'vocabulary':
      return <VocabularyPage />;
    case 'about':
      return <AboutPage />;
  }
}

function Sidebar({
  active,
  onSelect
}: {
  active: TabId;
  onSelect: (id: TabId) => void;
}): JSX.Element {
  return (
    <aside style={sidebar}>
      <div style={sidebarHeader}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>9VoiceToText</div>
        <div style={{ fontSize: 11, color: tokens.color.textDim, marginTop: 2 }}>Settings</div>
      </div>
      <nav>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            style={{
              ...sidebarItem,
              background: active === tab.id ? tokens.color.bgRaised : 'transparent',
              color: active === tab.id ? tokens.color.text : tokens.color.textDim
            }}
          >
            <span>{tab.label}</span>
            {!tab.available && (
              <span
                style={{
                  fontSize: 10,
                  color: tokens.color.textFaint,
                  background: tokens.color.bg,
                  padding: '2px 6px',
                  borderRadius: 4
                }}
              >
                soon
              </span>
            )}
          </button>
        ))}
      </nav>
    </aside>
  );
}

const layout: CSSProperties = {
  display: 'flex',
  height: '100vh',
  width: '100vw',
  overflow: 'hidden'
};

const sidebar: CSSProperties = {
  width: 200,
  background: tokens.color.bgSidebar,
  borderRight: `1px solid ${tokens.color.border}`,
  display: 'flex',
  flexDirection: 'column',
  paddingTop: 'env(titlebar-area-height, 36px)'
};

const sidebarHeader: CSSProperties = {
  padding: '0 16px 16px'
};

const sidebarItem: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  border: 'none',
  textAlign: 'left',
  padding: '8px 16px',
  fontSize: 13,
  fontFamily: tokens.font.sans,
  cursor: 'pointer',
  transition: 'background 100ms ease, color 100ms ease'
};

const main: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '40px 32px',
  maxWidth: 700,
  margin: '0 auto'
};
