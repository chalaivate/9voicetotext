import type { CSSProperties } from 'react';
import { Card, Field } from '../../shared/components/Card';
import { Select } from '../../shared/components/Select';
import { ApiKeyInput } from '../components/ApiKeyInput';
import { useSettings } from '../../shared/use-settings';
import { tokens } from '../../shared/tokens';

const MODEL_INFO: Record<
  'whisper-1' | 'gpt-4o-transcribe' | 'gpt-4o-mini-transcribe',
  { label: string; price: string; quality: string; streaming: boolean; note?: string }
> = {
  'whisper-1': {
    label: 'Whisper-1 (legacy)',
    price: '$0.006/min',
    quality: 'Baseline',
    streaming: false,
    note: 'Hallucinates more on silent audio'
  },
  'gpt-4o-transcribe': {
    label: 'GPT-4o Transcribe (recommended)',
    price: '$0.006/min',
    quality: 'Best',
    streaming: true,
    note: 'Same price as whisper-1, fewer hallucinations'
  },
  'gpt-4o-mini-transcribe': {
    label: 'GPT-4o Mini Transcribe',
    price: '$0.003/min',
    quality: 'Near whisper-1',
    streaming: true,
    note: 'Half the cost, lighter quality'
  }
};

type ModelId = keyof typeof MODEL_INFO;

export function TranscriptionPage(): JSX.Element {
  const settings = useSettings((s) => s.settings);
  const patch = useSettings((s) => s.patch);

  if (!settings) return <div />;

  const currentModel = settings.transcription.model;
  const info = MODEL_INFO[currentModel];

  return (
    <>
      <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 24px' }}>Transcription</h1>

      <Card
        title="Model"
        description="Which OpenAI transcription endpoint to use. All three accept the same vocabulary/language settings."
      >
        <Field
          label="Transcription model"
          hint="GPT-4o Transcribe is the default — same price as whisper-1, better quality."
        >
          <Select
            value={currentModel}
            onValueChange={(v) => void patch({ transcription: { model: v as ModelId } })}
            options={(Object.keys(MODEL_INFO) as ModelId[]).map((id) => ({
              value: id,
              label: MODEL_INFO[id].label
            }))}
          />
        </Field>

        <div style={modelInfoBox}>
          <div style={modelInfoRow}>
            <span style={modelLabel}>Price</span>
            <span style={modelValue}>{info.price}</span>
          </div>
          <div style={modelInfoRow}>
            <span style={modelLabel}>Quality</span>
            <span style={modelValue}>{info.quality}</span>
          </div>
          <div style={modelInfoRow}>
            <span style={modelLabel}>Streaming</span>
            <span
              style={{
                ...modelValue,
                color: info.streaming ? tokens.color.success : tokens.color.textDim
              }}
            >
              {info.streaming ? '✓ Supported' : 'Not supported'}
            </span>
          </div>
          {info.note && (
            <div style={{ ...modelNote, color: tokens.color.textDim }}>{info.note}</div>
          )}
        </div>
      </Card>

      <Card
        title="OpenAI API key"
        description="Your key is sent only to OpenAI for transcription. It's stored in your OS keychain — never written to disk in plaintext, never sent to 9Expert."
      >
        <ApiKeyInput />
      </Card>
    </>
  );
}

const modelInfoBox: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  marginTop: 12,
  padding: '12px 14px',
  background: tokens.color.bg,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.md
};

const modelInfoRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 12
};

const modelLabel: CSSProperties = {
  color: tokens.color.textDim
};

const modelValue: CSSProperties = {
  color: tokens.color.text,
  fontFamily: tokens.font.mono
};

const modelNote: CSSProperties = {
  fontSize: 11,
  fontStyle: 'italic',
  marginTop: 4
};
