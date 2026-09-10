import { useEffect, useState, type CSSProperties } from 'react';
import { Card } from '../../shared/components/Card';
import { Button } from '../../shared/components/Button';
import { BrandMark } from '../../shared/components/BrandMark';
import { tokens } from '../../shared/tokens';
import { useSettings } from '../../shared/use-settings';
import { toast } from '../../shared/components/Toast';
import type { AppInfo } from '../../../preload/api';

/** Tooling + runtime stack, shown so the "what did you build this with?" question answers itself. */
const STACK: { name: string; role: string }[] = [
  { name: 'Claude Code', role: 'AI pair-programmer (design, code, tests, packaging)' },
  { name: 'Electron', role: 'Cross-platform desktop shell' },
  { name: 'TypeScript', role: 'Main, preload and renderer processes' },
  { name: 'React 18', role: 'Overlay + Settings UI' },
  { name: 'Vite (electron-vite)', role: 'Bundling + HMR' },
  { name: 'OpenAI gpt-4o-transcribe', role: 'Speech-to-text (Thai / English / mixed)' },
  { name: 'Web Audio + MediaRecorder', role: 'Mic capture, waveform, silence detection' },
  { name: 'uiohook-napi', role: 'Global push-to-talk key events' },
  { name: 'keytar', role: 'API key in the OS keychain' },
  { name: 'zustand + zod', role: 'Settings state + schema validation' },
  { name: 'Vitest', role: '120+ unit tests' },
  { name: 'electron-builder', role: 'DMG / NSIS installers via GitHub Actions' }
];

export function AboutPage(): JSX.Element {
  const reset = useSettings((s) => s.reset);
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void window.voiceToText.app
      .info()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  const diagnostics = info
    ? `9VoiceToText ${info.version}\nElectron ${info.electron} · Chromium ${info.chrome} · Node ${info.node}\n${info.platform} ${info.arch}`
    : '9VoiceToText (version unavailable)';

  return (
    <>
      <h1>About</h1>

      <div style={hero}>
        <BrandMark size={72} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.3 }}>9VoiceToText</span>
            <span style={versionPill}>{info ? `v${info.version}` : '…'}</span>
          </div>
          <div style={{ fontSize: 13, color: tokens.color.textDim, marginTop: 4, lineHeight: 1.6 }}>
            Speak naturally. Type instantly. Anywhere.
            <br />
            Hold a hotkey, speak Thai / English / mixed, and the text lands at your cursor in any
            app.
          </div>
        </div>
      </div>

      <Card title="Built with" description="The complete toolchain behind this app.">
        <div style={stackGrid}>
          {STACK.map((item) => (
            <div key={item.name} style={stackItem}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: tokens.color.text }}>
                {item.name}
              </div>
              <div style={{ fontSize: 11, color: tokens.color.textDim, marginTop: 2 }}>
                {item.role}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Details">
        <div style={detailGrid}>
          <span>Version</span>
          <span>{info ? info.version : '—'}</span>
          <span>Runtime</span>
          <span>
            {info ? `Electron ${info.electron} · Chromium ${info.chrome} · Node ${info.node}` : '—'}
          </span>
          <span>Platform</span>
          <span>{info ? `${info.platform} ${info.arch}` : '—'}</span>
          <span>Author</span>
          <span>9Expert Training (9Expert Co., Ltd.)</span>
          <span>License</span>
          <span>MIT</span>
        </div>
        <div style={{ marginTop: 12 }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(diagnostics);
              toast('Copied diagnostic info', 'info');
            }}
          >
            Copy diagnostic info
          </Button>
        </div>
      </Card>

      <Card title="Privacy">
        <ul
          style={{
            fontSize: 12,
            color: tokens.color.textDim,
            lineHeight: 1.7,
            paddingLeft: 20,
            margin: 0
          }}
        >
          <li>Audio is captured to memory only — never written to disk.</li>
          <li>
            The API key is stored encrypted by your operating system (Keychain on macOS, Credential
            Manager on Windows) via keytar.
          </li>
          <li>
            Audio is sent to OpenAI for transcription per their{' '}
            <a
              href="https://openai.com/policies/api-data-usage-policies"
              target="_blank"
              rel="noopener noreferrer"
            >
              API data usage policy
            </a>{' '}
            — API data is not used to train their models.
          </li>
          <li>No telemetry. No analytics. No third-party tracking.</li>
        </ul>
      </Card>

      <Card title="Reset">
        <div style={{ fontSize: 12, color: tokens.color.textDim, marginBottom: 12 }}>
          Restore all settings to defaults. Your API key in the OS keychain is NOT removed by this
          action.
        </div>
        <Button
          variant="danger"
          size="sm"
          onClick={async () => {
            const ok = window.confirm('Reset all settings to defaults?');
            if (!ok) return;
            await reset();
          }}
        >
          Reset settings
        </Button>
      </Card>
    </>
  );
}

const hero: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 18,
  padding: '20px 22px',
  marginBottom: 16,
  borderRadius: tokens.radius.xl,
  border: `1px solid ${tokens.color.border}`,
  background: `linear-gradient(135deg, rgba(36,134,255,0.16), rgba(212,247,63,0.08) 60%, transparent), ${tokens.color.bgRaised}`,
  boxShadow: 'var(--c-card-shadow)'
};

const versionPill: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: 11,
  fontWeight: 600,
  padding: '2px 9px',
  borderRadius: 999,
  background: tokens.color.brandBlue,
  color: '#fff'
};

const stackGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
  gap: 8
};

const stackItem: CSSProperties = {
  padding: '10px 12px',
  borderRadius: tokens.radius.md,
  background: tokens.color.bg,
  border: `1px solid ${tokens.color.border}`
};

const detailGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: '6px 16px',
  fontSize: 12,
  color: tokens.color.textDim
};
