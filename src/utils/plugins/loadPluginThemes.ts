import type { CustomTheme } from '../theme.js'
import type { LoadedPlugin } from '../../types/plugin.js'
import {
  loadThemePath,
  registerPluginThemeBases,
} from '../customThemes.js'
import { loadAllPluginsCacheOnly } from './pluginLoader.js'

/** Load and publish custom themes from all enabled plugins. */
export async function loadPluginThemes(
  plugins?: LoadedPlugin[],
): Promise<CustomTheme[]> {
  const enabled = plugins ?? (await loadAllPluginsCacheOnly()).enabled
  const themes: CustomTheme[] = []
  for (const plugin of enabled) {
    const source = { plugin: plugin.name }
    const prefix = `${plugin.name}:`
    if (plugin.themesPath) {
      themes.push(...loadThemePath(plugin.themesPath, source, prefix))
    }
    for (const themePath of plugin.themesPaths ?? []) {
      themes.push(...loadThemePath(themePath, source, prefix))
    }
  }
  themes.sort((a, b) => a.name.localeCompare(b.name))
  registerPluginThemeBases(themes)
  return themes
}
