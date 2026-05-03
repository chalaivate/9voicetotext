import { tokens } from '../../shared/tokens';

const labels: Record<string, { title: string; sprint: string; preview: string }> = {
  hotkeys: {
    title: 'Hotkeys',
    sprint: 'Sprint 4b',
    preview:
      'Capture custom hotkey, switch between push-to-talk and toggle modes, detect conflicts.'
  },
  audio: {
    title: 'Audio',
    sprint: 'Sprint 4b',
    preview: 'Pick a microphone, override sample rate.'
  },
  vocabulary: {
    title: 'Vocabulary',
    sprint: 'Sprint 4b',
    preview: 'Add custom terms (proper nouns, technical jargon) to improve Whisper accuracy.'
  }
};

export function ComingSoonPage({ tab }: { tab: string }): JSX.Element {
  const meta = labels[tab] ?? { title: tab, sprint: '?', preview: '' };
  return (
    <div
      style={{
        padding: '40px 0',
        textAlign: 'center',
        color: tokens.color.textDim
      }}
    >
      <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 12px', color: tokens.color.text }}>
        {meta.title}
      </h1>
      <div style={{ fontSize: 13, marginBottom: 8, color: tokens.color.brandBlueLight }}>
        Coming in {meta.sprint}
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 420, margin: '0 auto' }}>
        {meta.preview}
      </p>
    </div>
  );
}
