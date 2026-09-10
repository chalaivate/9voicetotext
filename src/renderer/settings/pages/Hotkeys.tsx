import { Card, Field } from '../../shared/components/Card';
import { Select } from '../../shared/components/Select';
import { Button } from '../../shared/components/Button';
import { useSettings } from '../../shared/use-settings';
import { tokens } from '../../shared/tokens';
import { HotkeyCapture } from '../components/HotkeyCapture';

const MAC_DEFAULT = 'Control+Command+Space';
const WIN_DEFAULT = 'Control+Alt+Space';

function platformDefault(): string {
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  return isMac ? MAC_DEFAULT : WIN_DEFAULT;
}

export function HotkeysPage(): JSX.Element {
  const settings = useSettings((s) => s.settings);
  const patch = useSettings((s) => s.patch);

  if (!settings) return <div />;

  const restoreDefault = (): void => {
    void patch({ hotkey: { combo: platformDefault() } });
  };

  return (
    <>
      <h1>Hotkeys</h1>

      <Card
        title="Recording shortcut"
        description="Press your global hotkey from any app to start (and stop) recording."
      >
        <Field label="Combination" hint="Click Change, then press the keys you want.">
          <HotkeyCapture
            value={settings.hotkey.combo}
            onChange={(combo) => void patch({ hotkey: { combo } })}
          />
        </Field>
        <Field
          label="Mode"
          hint="Toggle = press to start / press again to stop. Push-to-talk = hold to record, release to send. Auto-stop = press once, app stops automatically after silence."
        >
          <Select
            value={settings.hotkey.mode}
            onValueChange={(v) =>
              void patch({ hotkey: { mode: v as 'toggle' | 'push-to-talk' | 'auto-stop' } })
            }
            options={[
              { value: 'toggle', label: 'Toggle' },
              { value: 'push-to-talk', label: 'Push-to-talk' },
              { value: 'auto-stop', label: 'Auto-stop on silence' }
            ]}
          />
        </Field>
        <div style={{ paddingTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={restoreDefault}>
            Restore default ({platformDefault().replaceAll('+', ' + ')})
          </Button>
        </div>
      </Card>

      {settings.hotkey.mode === 'push-to-talk' && (
        <Card title="Push-to-talk requires Accessibility permission">
          <p
            style={{
              fontSize: 12,
              color: tokens.color.textDim,
              margin: 0,
              lineHeight: 1.6
            }}
          >
            We use a system-wide listener to detect when you release the hotkey. On macOS this
            requires <strong style={{ color: tokens.color.text }}>Accessibility permission</strong>.
            If push-to-talk doesn&apos;t respond, open{' '}
            <em>System Settings → Privacy &amp; Security → Accessibility</em> and add 9VoiceToText
            (or your terminal during dev). Toggle mode works without this permission.
          </p>
        </Card>
      )}

      {settings.hotkey.mode === 'auto-stop' && (
        <Card title="Auto-stop on silence">
          <p
            style={{
              fontSize: 12,
              color: tokens.color.textDim,
              margin: 0,
              lineHeight: 1.6
            }}
          >
            Press your hotkey once to start. Recording stops automatically after{' '}
            <strong style={{ color: tokens.color.text }}>
              {(settings.audio.silenceDurationMs / 1000).toFixed(0)} seconds
            </strong>{' '}
            of silence. Press the hotkey again during recording to <em>cancel</em> without sending.
            Tune the silence threshold + duration on the <strong>Audio</strong> page.
          </p>
        </Card>
      )}
    </>
  );
}
