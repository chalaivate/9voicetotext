import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { AudioLines, BookA, Info, Keyboard, Mic, SlidersHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { applyTheme, tokens } from '../shared/tokens';
import { ToastHost } from '../shared/components/Toast';
import { Logo } from '../shared/components/Logo';
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
  icon: LucideIcon;
}

const TABS: Tab[] = [
  { id: 'general', label: 'General', icon: SlidersHorizontal },
  { id: 'hotkeys', label: 'Hotkeys', icon: Keyboard },
  { id: 'audio', label: 'Audio', icon: Mic },
  { id: 'transcription', label: 'Transcription', icon: AudioLines },
  { id: 'vocabulary', label: 'Vocabulary', icon: BookA },
  { id: 'about', label: 'About', icon: Info }
];

export default function App(): JSX.Element {
  const [active, setActive] = useState<TabId>('general');
  const load = useSettings((s) => s.load);
  const loaded = useSettings((s) => s.loaded);
  // undefined until settings arrive — main.tsx already painted the cached
  // theme, so don't overwrite it with a default in the meantime.
  const themePref = useSettings((s) => s.settings?.ui.theme);

  useEffect(() => {
    void load();
  }, [load]);

  // Theme: follow Settings → General → Theme, and re-resolve when the OS
  // flips between light/dark while "system" is selected.
  useEffect(() => {
    if (!themePref) return;
    applyTheme(themePref);
    if (themePref !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => void applyTheme('system');
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [themePref]);

  return (
    <>
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
  const [version, setVersion] = useState<string>('');
  useEffect(() => {
    void window.voiceToText.app.info().then((i) => setVersion(i.version));
  }, []);

  return (
    <aside style={sidebar}>
      <div style={sidebarHeader}>
        <Logo size={30} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.01em' }}>
            <span style={{ color: tokens.color.brandBlue }}>9</span>VoiceToText
          </div>
          <div style={{ fontSize: 11, color: tokens.color.textDim, marginTop: 1 }}>Settings</div>
        </div>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 10px' }}>
        {TABS.map((tab) => {
          const isActive = active === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className="nav-item"
              onClick={() => onSelect(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              style={{
                ...sidebarItem,
                background: isActive ? 'rgba(36, 134, 255, 0.14)' : 'transparent',
                color: isActive ? tokens.color.text : tokens.color.textDim,
                boxShadow: isActive ? 'inset 3px 0 0 #D4F73F' : 'none'
              }}
            >
              <Icon
                size={16}
                strokeWidth={2}
                color={isActive ? '#2486FF' : 'currentColor'}
                style={{ flexShrink: 0 }}
              />
              <span style={{ fontWeight: isActive ? 600 : 500 }}>{tab.label}</span>
            </button>
          );
        })}
      </nav>
      <div style={sidebarFooter}>
        <div>{version ? `v${version}` : ''}</div>
        <div>by 9Expert Training</div>
      </div>
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
  width: 210,
  flexShrink: 0,
  background: tokens.color.bgSidebar,
  borderRight: `1px solid ${tokens.color.border}`,
  display: 'flex',
  flexDirection: 'column',
  paddingTop: 'env(titlebar-area-height, 36px)',
  // Let the user drag the window from the empty sidebar area (macOS hiddenInset).
  WebkitAppRegion: 'drag'
} as CSSProperties;

const sidebarHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '4px 16px 18px'
};

const sidebarItem: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  border: 'none',
  textAlign: 'left',
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: 13,
  fontFamily: tokens.font.sans,
  cursor: 'pointer',
  transition: 'background 120ms ease, color 120ms ease',
  WebkitAppRegion: 'no-drag'
} as CSSProperties;

const sidebarFooter: CSSProperties = {
  marginTop: 'auto',
  padding: '12px 16px 14px',
  fontSize: 10.5,
  lineHeight: 1.6,
  color: tokens.color.textFaint,
  fontFamily: tokens.font.mono
};

const main: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '40px 32px',
  maxWidth: 700,
  margin: '0 auto',
  boxSizing: 'border-box',
  width: '100%'
};
