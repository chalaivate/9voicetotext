import { useEffect, useState } from 'react';
import { Card } from '../../shared/components/Card';
import { Button } from '../../shared/components/Button';
import { Logo } from '../../shared/components/Logo';
import { tokens } from '../../shared/tokens';
import { useSettings } from '../../shared/use-settings';
import { toast } from '../../shared/components/Toast';
import type { AppInfo } from '../../../preload/api';

export function AboutPage(): JSX.Element {
  const reset = useSettings((s) => s.reset);
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void window.voiceToText.app.info().then(setInfo);
  }, []);

  const diagnostic = info
    ? `${info.name} ${info.version}\nElectron ${info.electron} · Chrome ${info.chrome} · Node ${info.node}\nPlatform ${info.platform} ${info.arch}`
    : '';

  return (
    <>
      <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 24px' }}>About</h1>

      <Card title="9VoiceToText">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <Logo size={56} />
          <div style={{ fontSize: 13, color: tokens.color.text, lineHeight: 1.6 }}>
            Cross-platform voice-to-text desktop app powered by OpenAI Whisper.
            <br />
            Speak naturally. Type instantly. Anywhere.
          </div>
        </div>
        <div
          style={{
            marginTop: 16,
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '6px 16px',
            fontSize: 12,
            color: tokens.color.textDim
          }}
        >
          <span>Version</span>
          <span style={{ fontFamily: tokens.font.mono }}>{info?.version ?? '…'}</span>
          <span>Runtime</span>
          <span style={{ fontFamily: tokens.font.mono }}>
            {info ? `Electron ${info.electron} · ${info.platform} ${info.arch}` : '…'}
          </span>
          <span>Author</span>
          <span>9Expert Training</span>
          <span>Privacy</span>
          <span>Audio is never written to disk; transcribed text never leaves OpenAI.</span>
        </div>
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

      <Card title="Privacy policy">
        <ul style={{ fontSize: 12, color: tokens.color.textDim, lineHeight: 1.7, paddingLeft: 20 }}>
          <li>Audio is captured to memory only — never written to disk.</li>
          <li>
            The API key is stored encrypted by your operating system (Keychain on macOS, Credential
            Manager on Windows) via keytar.
          </li>
          <li>
            Transcribed text is sent to OpenAI per their{' '}
            <a
              href="https://openai.com/policies/api-data-usage-policies"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: tokens.color.link }}
            >
              API data usage policy
            </a>{' '}
            — OpenAI does not use it to train their models.
          </li>
          <li>No telemetry. No analytics. No third-party tracking.</li>
        </ul>
      </Card>

      <div
        style={{
          marginTop: 24,
          textAlign: 'center',
          fontSize: 11,
          color: tokens.color.textFaint
        }}
      >
        <button
          disabled={!info}
          onClick={() => {
            void navigator.clipboard.writeText(diagnostic).then(
              () => toast('Copied diagnostic info', 'info'),
              () => toast('Clipboard unavailable', 'error')
            );
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: tokens.color.textFaint,
            cursor: 'pointer',
            fontSize: 11,
            textDecoration: 'underline'
          }}
        >
          Copy diagnostic info
        </button>
      </div>
    </>
  );
}
