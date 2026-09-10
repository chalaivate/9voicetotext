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
      <h1>General</h1>

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
        <Field label="Show waveform" hint="Live audio visualization while recording.">
          <Toggle
            checked={settings.ui.showWaveform}
            onChange={(v) => void patch({ ui: { showWaveform: v } })}
          />
        </Field>
      </Card>

      <Card
        title="Caption"
        description="The transcribed text floats above an anchor line on screen; the status pill sits just below it."
      >
        <Field label="Show transcribed text" hint="Turn off to keep only the status pill.">
          <Toggle
            checked={settings.ui.caption.show}
            onChange={(v) => void patch({ ui: { caption: { ...settings.ui.caption, show: v } } })}
          />
        </Field>
        <Field label="Anchor line" hint="Percent of screen height, measured from the top.">
          <Input
            type="number"
            min={30}
            max={95}
            value={settings.ui.caption.anchorPercent}
            onChange={(e) => {
              const n = Math.max(30, Math.min(95, Number(e.target.value) || 90));
              void patch({ ui: { caption: { ...settings.ui.caption, anchorPercent: n } } });
            }}
          />
        </Field>
        <Field label="Font size" hint="Pixels. 28 reads well on a laptop, 36+ on a projector.">
          <Input
            type="number"
            min={14}
            max={72}
            value={settings.ui.caption.fontSize}
            onChange={(e) => {
              const n = Math.max(14, Math.min(72, Number(e.target.value) || 28));
              void patch({ ui: { caption: { ...settings.ui.caption, fontSize: n } } });
            }}
          />
        </Field>
        <Field label="Text colour">
          <Input
            type="color"
            value={settings.ui.caption.textColor}
            onChange={(e) =>
              void patch({ ui: { caption: { ...settings.ui.caption, textColor: e.target.value } } })
            }
            style={{ padding: 2, width: 64 }}
          />
        </Field>
        <Field label="Background" hint="Transparent, frosted glass, or a solid colour.">
          <Select
            value={settings.ui.caption.background}
            onValueChange={(v) =>
              void patch({
                ui: {
                  caption: { ...settings.ui.caption, background: v as 'none' | 'glass' | 'solid' }
                }
              })
            }
            options={[
              { value: 'none', label: 'Transparent' },
              { value: 'glass', label: 'Frosted glass' },
              { value: 'solid', label: 'Solid colour' }
            ]}
          />
        </Field>
        {settings.ui.caption.background !== 'none' && (
          <>
            <Field label="Background colour">
              <Input
                type="color"
                value={settings.ui.caption.backgroundColor}
                onChange={(e) =>
                  void patch({
                    ui: { caption: { ...settings.ui.caption, backgroundColor: e.target.value } }
                  })
                }
                style={{ padding: 2, width: 64 }}
              />
            </Field>
            <Field label="Background opacity" hint="0 to 100.">
              <Input
                type="number"
                min={0}
                max={100}
                value={settings.ui.caption.backgroundOpacity}
                onChange={(e) => {
                  const n = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                  void patch({ ui: { caption: { ...settings.ui.caption, backgroundOpacity: n } } });
                }}
              />
            </Field>
          </>
        )}
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

      <Card
        title="Output"
        description="Some apps (Claude Desktop, VS Code with rich-text editors) block programmatic Cmd+V. Switch to clipboard-only if auto-paste isn't landing in your target app."
      >
        <Field
          label="After recording"
          hint="Paste at cursor: auto-types into the focused field. Clipboard only: you press Cmd+V manually (works in every app)."
        >
          <Select
            value={settings.output.mode}
            onValueChange={(v) =>
              void patch({ output: { mode: v as 'paste' | 'clipboard' | 'both' } })
            }
            options={[
              { value: 'paste', label: 'Paste at cursor (auto)' },
              { value: 'clipboard', label: 'Clipboard only (manual ⌘V)' },
              { value: 'both', label: 'Both — keep in clipboard after paste' }
            ]}
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
