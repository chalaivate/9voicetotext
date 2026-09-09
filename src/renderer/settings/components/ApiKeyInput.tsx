import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { tokens } from '../../shared/tokens';
import { Button } from '../../shared/components/Button';
import { Input } from '../../shared/components/Input';
import { toast } from '../../shared/components/Toast';

type Status = 'idle' | 'saving' | 'testing' | 'ok' | 'fail';

export function ApiKeyInput(): JSX.Element {
  const [hasKey, setHasKey] = useState(false);
  const [mask, setMask] = useState<string>('(loading…)');
  const [draft, setDraft] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [statusMsg, setStatusMsg] = useState<string>('');

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh(): Promise<void> {
    const [present, m] = await Promise.all([
      window.voiceToText.secrets.hasApiKey(),
      window.voiceToText.secrets.keyMask()
    ]);
    setHasKey(present);
    setMask(m);
  }

  async function save(): Promise<void> {
    if (!draft.trim()) return;
    setStatus('saving');
    try {
      await window.voiceToText.secrets.setApiKey(draft.trim());
      setDraft('');
      setRevealed(false);
      await refresh();
      setStatus('idle');
      toast('API key saved to keychain', 'success');
    } catch (err) {
      setStatus('fail');
      setStatusMsg((err as Error).message);
    }
  }

  async function remove(): Promise<void> {
    const confirmed = window.confirm('Remove the saved OpenAI API key from your keychain?');
    if (!confirmed) return;
    await window.voiceToText.secrets.deleteApiKey();
    await refresh();
    toast('API key removed', 'info');
  }

  async function test(): Promise<void> {
    setStatus('testing');
    setStatusMsg('');
    const result = await window.voiceToText.secrets.testApiKey();
    setStatus(result.ok ? 'ok' : 'fail');
    setStatusMsg(result.message);
    toast(result.message, result.ok ? 'success' : 'error', result.ok ? 1500 : 4000);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      {hasKey && (
        <div style={statusRow}>
          <span style={{ color: tokens.color.success, fontSize: 12 }}>● Stored in keychain</span>
          <span style={{ color: tokens.color.textDim, fontSize: 12, fontFamily: tokens.font.mono }}>
            {mask}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <Input
          type={revealed ? 'text' : 'password'}
          placeholder={hasKey ? 'Enter a new key to replace…' : 'sk-…'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          style={{ fontFamily: tokens.font.mono, fontSize: 12 }}
        />
        <Button variant="ghost" size="sm" onClick={() => setRevealed((r) => !r)}>
          {revealed ? 'Hide' : 'Show'}
        </Button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button
          variant="primary"
          size="sm"
          onClick={save}
          disabled={!draft.trim() || status === 'saving'}
        >
          {status === 'saving' ? 'Saving…' : hasKey ? 'Replace key' : 'Save key'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={test}
          disabled={!hasKey || status === 'testing'}
        >
          {status === 'testing' ? 'Testing…' : 'Test connection'}
        </Button>
        {hasKey && (
          <Button variant="danger" size="sm" onClick={remove}>
            Remove
          </Button>
        )}
      </div>

      {statusMsg && (
        <div
          style={{
            fontSize: 12,
            color: status === 'ok' ? tokens.color.success : tokens.color.error
          }}
        >
          {statusMsg}
        </div>
      )}

      <div
        style={{
          fontSize: 11,
          color: tokens.color.textFaint,
          marginTop: 4,
          lineHeight: 1.5
        }}
      >
        Stored in macOS Keychain / Windows Credential Manager via keytar. Get a key from{' '}
        <a
          href="https://platform.openai.com/api-keys"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: tokens.color.link }}
        >
          platform.openai.com/api-keys
        </a>
        .
      </div>
    </div>
  );
}

const statusRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '6px 10px',
  background: tokens.color.bg,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.sm
};
