import type { LocalJSXCommandOnDone } from '../../types/command.js'

export type PluginSettingsProps = {
  onComplete: LocalJSXCommandOnDone
  args?: string
  showMcpRedirectMessage?: boolean
}

export type ViewState = {
  targetPlugin?: string
  targetMarketplace?: string
} & (
  | { type: 'menu' }
  | { type: 'help' }
  | { type: 'validate'; path?: string }
  | {
      type: 'tag'
      path?: string
      push: boolean
      dryRun: boolean
      force: boolean
      unknownFlag?: string
    }
  | { type: 'discover-plugins' }
  | { type: 'browse-marketplace'; targetMarketplace: string }
  | {
      type: 'manage-plugins'
      action?: 'enable' | 'disable' | 'uninstall'
    }
  | { type: 'marketplace-menu' }
  | { type: 'marketplace-list' }
  | { type: 'add-marketplace'; initialValue?: string }
  | {
      type: 'manage-marketplaces'
      action?: 'remove' | 'update'
    }
)
