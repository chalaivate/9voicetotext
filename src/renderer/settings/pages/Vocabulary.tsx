import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Card, Field } from '../../shared/components/Card';
import { Toggle } from '../../shared/components/Toggle';
import { Input } from '../../shared/components/Input';
import { Button } from '../../shared/components/Button';
import { useSettings } from '../../shared/use-settings';
import { tokens } from '../../shared/tokens';

const PRESET_LABELS: Record<string, { label: string; hint: string }> = {
  coding: {
    label: 'Coding terms',
    hint: 'TypeScript, React, Electron, async/await, REST, JSON…'
  },
  microsoft365: {
    label: 'Microsoft 365',
    hint: 'Word, Excel, PowerPoint, Power BI, Power Automate, Copilot…'
  },
  brandNames: {
    label: 'Brand names',
    hint: 'Claude Code, Cursor, GitHub, Anthropic, OpenAI, Notion, Slack…'
  },
  thai: {
    label: 'Thai vocabulary',
    hint: 'ทดสอบ, ฟังก์ชัน, คอมโพเนนต์ + ชาลัยเวท / 9Expert names'
  }
};

export function VocabularyPage(): JSX.Element {
  const settings = useSettings((s) => s.settings);
  const patch = useSettings((s) => s.patch);
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState<string>('');

  useEffect(() => {
    if (!settings) return;
    let cancelled = false;
    void window.voiceToText.vocabulary.preview().then((p) => {
      if (!cancelled) setPreview(p);
    });
    return () => {
      cancelled = true;
    };
  }, [settings]);

  if (!settings) return <div />;

  const presets = settings.transcription.vocabularyPresets;
  const customTerms = settings.transcription.customVocabulary;

  const togglePreset = (key: keyof typeof presets, value: boolean): void => {
    void patch({ transcription: { vocabularyPresets: { ...presets, [key]: value } } });
  };

  const addTerm = (): void => {
    const term = draft.trim();
    if (!term) return;
    if (customTerms.includes(term)) {
      setDraft('');
      return;
    }
    void patch({ transcription: { customVocabulary: [...customTerms, term] } });
    setDraft('');
  };

  const removeTerm = (term: string): void => {
    void patch({
      transcription: { customVocabulary: customTerms.filter((t) => t !== term) }
    });
  };

  return (
    <>
      <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 24px' }}>Vocabulary</h1>

      <Card
        title="Presets"
        description="Vocabulary chunks Whisper sees as a hint to recognize proper nouns and technical terms."
      >
        {(Object.keys(PRESET_LABELS) as Array<keyof typeof presets>).map((key) => {
          const meta = PRESET_LABELS[key];
          return (
            <Field key={key} label={meta?.label ?? key} hint={meta?.hint ?? ''}>
              <Toggle checked={presets[key]} onChange={(v) => togglePreset(key, v)} />
            </Field>
          );
        })}
      </Card>

      <Card
        title="Custom terms"
        description="Add proper nouns Whisper keeps misrecognizing. Spelling counts — write it like Whisper should output it."
      >
        <div style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. ชาลัยเวท, Glistening Muffin, 9VoiceToText"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTerm();
              }
            }}
          />
          <Button variant="primary" size="sm" onClick={addTerm} disabled={!draft.trim()}>
            Add
          </Button>
        </div>
        {customTerms.length > 0 && (
          <div style={chipRow}>
            {customTerms.map((term) => (
              <span key={term} style={chip}>
                {term}
                <button
                  onClick={() => removeTerm(term)}
                  style={chipX}
                  aria-label={`Remove ${term}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {customTerms.length === 0 && (
          <div style={{ fontSize: 12, color: tokens.color.textFaint, paddingTop: 12 }}>
            No custom terms yet.
          </div>
        )}
      </Card>

      <Card
        title="Hallucination filter"
        description="Drop common Whisper boilerplate (e.g. “ขอบคุณที่รับชม”, “Thanks for watching”) when it appears on silent recordings, instead of pasting it."
      >
        <Field
          label="Filter known hallucinations"
          hint="Recommended on. Disable only if you actually want to dictate “Thanks for watching”."
        >
          <Toggle
            checked={settings.transcription.filterHallucinations}
            onChange={(v) => void patch({ transcription: { filterHallucinations: v } })}
          />
        </Field>
      </Card>

      <Card
        title="Prompt preview"
        description="The exact string we will pass to Whisper as the `prompt` parameter."
      >
        <pre style={previewStyle}>{preview || '(loading…)'}</pre>
        <div style={{ fontSize: 11, color: tokens.color.textFaint, paddingTop: 6 }}>
          Whisper has a 244-token prompt limit. Current preview is roughly{' '}
          <strong>{Math.ceil(preview.length / 4)}</strong> tokens.
        </div>
      </Card>
    </>
  );
}

const chipRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  paddingTop: 12
};

const chip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: tokens.color.bg,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: 999,
  padding: '4px 10px',
  fontSize: 12,
  color: tokens.color.text
};

const chipX: CSSProperties = {
  background: 'transparent',
  color: tokens.color.textDim,
  border: 'none',
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: 1,
  padding: 0
};

const previewStyle: CSSProperties = {
  fontFamily: tokens.font.mono,
  fontSize: 11,
  lineHeight: 1.5,
  background: tokens.color.bg,
  border: `1px solid ${tokens.color.border}`,
  borderRadius: tokens.radius.md,
  padding: 12,
  margin: 0,
  whiteSpace: 'pre-wrap',
  color: tokens.color.textDim,
  maxHeight: 200,
  overflow: 'auto'
};
