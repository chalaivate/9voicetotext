import { useSettings } from '../../shared/use-settings';
import { Card, Field } from '../../shared/components/Card';
import { Toggle } from '../../shared/components/Toggle';
import { Select } from '../../shared/components/Select';
import { Input } from '../../shared/components/Input';

export function GeneralPage(): JSX.Element {
  const settings = useSettings((s) => s.settings);
  const patch = useSettings((s) => s.patch);

  if (!settings) return <div />;

  return (
    <>
      <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 24px' }}>General</h1>

      <Card title="Appearance">
        <Field label="Theme" hint="Light, dark, or follow the system.">
          <Select
            value={settings.ui.theme}
            onValueChange={(v) => void patch({ ui: { theme: v as 'system' | 'light' | 'dark' } })}
            options={[
              { value: 'system', label: 'Follow system' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' }
            ]}
          />
        </Field>
        <Field label="Overlay position" hint="Where the recording overlay appears on screen.">
          <Select
            value={settings.ui.overlayPosition}
            onValueChange={(v) =>
              void patch({
                ui: { overlayPosition: v as typeof settings.ui.overlayPosition }
              })
            }
            options={[
              { value: 'top-right', label: 'Top right' },
              { value: 'top-left', label: 'Top left' },
              { value: 'bottom-right', label: 'Bottom right' },
              { value: 'bottom-left', label: 'Bottom left' }
            ]}
          />
        </Field>
        <Field label="Show waveform" hint="Live audio visualization while recording.">
          <Toggle
            checked={settings.ui.showWaveform}
            onChange={(v) => void patch({ ui: { showWaveform: v } })}
          />
        </Field>
      </Card>

      <Card title="Sound">
        <Field label="Sound feedback" hint="Beeps on record start/stop and error.">
          <Toggle
            checked={settings.ui.soundEnabled}
            onChange={(v) => void patch({ ui: { soundEnabled: v } })}
          />
        </Field>
        <Field label="Volume" hint="0 to 100.">
          <Input
            type="number"
            min={0}
            max={100}
            value={settings.ui.soundVolume}
            onChange={(e) => {
              const n = Math.max(0, Math.min(100, Number(e.target.value) || 0));
              void patch({ ui: { soundVolume: n } });
            }}
            disabled={!settings.ui.soundEnabled}
          />
        </Field>
      </Card>

      <Card title="App">
        <Field label="Launch at login" hint="Start 9VoiceToText automatically when you sign in.">
          <Toggle
            checked={settings.app.launchOnStartup}
            onChange={(v) => void patch({ app: { launchOnStartup: v } })}
          />
        </Field>
        <Field label="Check for updates" hint="Notify when a new version is available.">
          <Toggle
            checked={settings.app.checkForUpdates}
            onChange={(v) => void patch({ app: { checkForUpdates: v } })}
          />
        </Field>
        <Field
          label="History limit"
          hint="Maximum recent transcriptions to keep (0 disables history)."
        >
          <Input
            type="number"
            min={0}
            max={500}
            value={settings.app.historyLimit}
            onChange={(e) => {
              const n = Math.max(0, Math.min(500, Number(e.target.value) || 0));
              void patch({ app: { historyLimit: n } });
            }}
          />
        </Field>
      </Card>
    </>
  );
}
