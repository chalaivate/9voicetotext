import { Card } from '../../shared/components/Card';
import { ApiKeyInput } from '../components/ApiKeyInput';
import { tokens } from '../../shared/tokens';

export function TranscriptionPage(): JSX.Element {
  return (
    <>
      <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 24px' }}>Transcription</h1>

      <Card
        title="OpenAI API key"
        description="Your key is sent only to OpenAI for transcription. It's stored in your OS keychain — never written to disk in plaintext, never sent to 9Expert."
      >
        <ApiKeyInput />
      </Card>

      <Card
        title="More settings coming in Sprint 4b"
        description="Language preference, custom vocabulary editor, post-processing toggle, and provider selection (Whisper API vs. local model) will land in the next sub-sprint."
      >
        <div style={{ fontSize: 12, color: tokens.color.textFaint, padding: '12px 0' }}>
          Right now Whisper auto-detects language and uses a hard-coded vocabulary tuned for
          Thai-English coding workflows.
        </div>
      </Card>
    </>
  );
}
