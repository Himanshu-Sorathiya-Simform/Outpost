import { useAppSettings, type AppSettingValues } from '@/lib'
import { Segmented } from '@/ui'

type Theme = AppSettingValues['theme']

/** Day / Night / Auto. Writes the app setting; the appearance observer applies it to <html>. */
export function ThemeControl({ showLabel = false }: { showLabel?: boolean }) {
  const theme = useAppSettings((s) => s.theme)
  const set = useAppSettings((s) => s.set)
  return (
    <Segmented<Theme>
      label="Theme"
      showLabel={showLabel}
      size="sm"
      block
      value={theme}
      onChange={(next) => set({ theme: next })}
      options={[
        { value: 'light', label: 'Day', icon: 'sun' },
        { value: 'dark', label: 'Night', icon: 'moon' },
        { value: 'system', label: 'Auto' },
      ]}
    />
  )
}
