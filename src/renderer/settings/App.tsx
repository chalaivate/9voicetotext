import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  AudioLines,
  BookA,
  Info,
  Keyboard,
  Settings2,
  Sparkles,
  type LucideIcon
} from 'lucide-react';
import { applyTheme, themeCss, tokens } from '../shared/tokens';
import { BrandMark } from '../shared/components/BrandMark';
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
  icon: LucideIcon;
}

const TABS: Tab[] = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'hotkeys', label: 'Hotkeys', icon: Keyboard },
  { id: 'audio', label: 'Audio', icon: AudioLines },
  { id: 'transcription', label: 'Transcription', icon: Sparkles },
  { id: 'vocabulary', label: 'Vocabulary', icon: BookA },
  { id: 'about', label: 'About', icon: Info }
];

export default function App(): JSX.Element {
  const [active, setActive] = useState<TabId>('general');
  const load = useSettings((s) => s.load);
  const loaded = useSettings((s) => s.loaded);
  const theme = useSettings((s) => s.settings?.ui.theme ?? 'system');
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    void load();
    void window.voiceToText.app
      .info()
      .then((i) => setVersion(i.version))
      .catch(() => setVersion(''));
  }, [load]);

  // Apply the theme now and re-apply when the OS scheme flips in 'system'.
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (): void => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  return (
    <>
      <style>{`
        ${themeCss}
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pageIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        body, html, #root {
          margin: 0; padding: 0; height: 100vh;
          background: ${tokens.color.bg}; color: ${tokens.color.text};
          font-family: ${tokens.font.sans};
          -webkit-font-smoothing: antialiased;
        }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: ${tokens.color.border}; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: ${tokens.color.slate}; }
        .nav-item {
          position: relative;
          display: flex; align-items: center; gap: 10px;
          width: calc(100% - 16px); margin: 2px 8px;
          border: none; border-radius: 10px; text-align: left;
          padding: 9px 12px; font-size: 13px; font-weight: 500;
          font-family: inherit; cursor: pointer;
          background: transparent; color: ${tokens.color.textDim};
          transition: background 120ms ease, color 120ms ease, transform 120ms ease;
        }
        .nav-item:hover { background: var(--c-sidebar-glow); color: ${tokens.color.text}; }
        .nav-item:active { transform: scale(0.98); }
        .nav-item.is-active {
          background: ${tokens.color.bgRaised};
          color: ${tokens.color.text};
          box-shadow: var(--c-card-shadow), inset 0 0 0 1px ${tokens.color.border};
        }
        .nav-item.is-active::before {
          content: ""; position: absolute; left: -8px; top: 9px; bottom: 9px; width: 3px;
          border-radius: 3px; background: linear-gradient(${tokens.color.brandBlue}, ${tokens.color.accent});
        }
        .nav-item.is-active svg { color: ${tokens.color.brandBlue}; }
        .page { animation: pageIn 180ms ease; }
        .page h1 {
          font-size: 22px; font-weight: 700; letter-spacing: -0.2px; margin: 0 0 20px;
        }
        a { color: ${tokens.color.brandBlueLight}; }
      `}</style>
      <div style={layout}>
        <Sidebar active={active} onSelect={setActive} version={version} />
        <main style={main}>
          {!loaded ? (
            <div style={{ color: tokens.color.textDim, padding: 32 }}>Loading…</div>
          ) : (
            <div className="page" key={active}>
              <PageContent tab={active} />
            </div>
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
  onSelect,
  version
}: {
  active: TabId;
  onSelect: (id: TabId) => void;
  version: string;
}): JSX.Element {
  return (
    <aside style={sidebar}>
      <div style={sidebarHeader}>
        <BrandMark size={34} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.2 }}>9VoiceToText</div>
          <div style={{ fontSize: 11, color: tokens.color.textDim, marginTop: 1 }}>Settings</div>
        </div>
      </div>
      <nav style={{ flex: 1 }}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`nav-item${active === tab.id ? ' is-active' : ''}`}
              onClick={() => onSelect(tab.id)}
            >
              <Icon size={16} strokeWidth={2} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
      <div style={sidebarFooter}>
        <span style={versionPill}>{version ? `v${version}` : 'dev'}</span>
        <div style={{ marginTop: 8, lineHeight: 1.5 }}>
          Built with Claude Code
          <br />
          Electron · React · TypeScript
        </div>
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
  width: 212,
  background: tokens.color.bgSidebar,
  borderRight: `1px solid ${tokens.color.border}`,
  display: 'flex',
  flexDirection: 'column',
  paddingTop: 'env(titlebar-area-height, 36px)',
  // Let the user drag the frameless (macOS hiddenInset) window by the sidebar.
  WebkitAppRegion: 'drag'
} as CSSProperties;

const sidebarHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '4px 16px 18px'
};

const sidebarFooter: CSSProperties = {
  padding: '12px 16px 16px',
  fontSize: 10.5,
  color: tokens.color.textFaint,
  borderTop: `1px solid ${tokens.color.border}`
};

const versionPill: CSSProperties = {
  display: 'inline-block',
  fontFamily: tokens.font.mono,
  fontSize: 10,
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 999,
  background: tokens.color.bgRaised,
  border: `1px solid ${tokens.color.border}`,
  color: tokens.color.textDim
};

const main: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '40px 36px 48px',
  WebkitAppRegion: 'no-drag'
} as CSSProperties;
