import type { Command } from '../../commands.js'
import { env } from '../../utils/env.js'

// Terminals that natively support CSI u / Kitty keyboard protocol
const NATIVE_CSIU_TERMINALS: Record<string, string> = {
  ghostty: 'Ghostty',
  kitty: 'Kitty',
  WezTerm: 'WezTerm',
}

const terminalSetup = {
  type: 'local-jsx',
  name: 'terminal-setup',
  requires: { ink: true },
  get description() {
    if (env.terminal === 'Apple_Terminal') {
      return 'Enable Option+Enter key binding for newlines and visual bell'
    }
    if (
      process.env.__CFBundleIdentifier === 'com.googlecode.iterm2' &&
      (env.terminal === 'iTerm.app' ||
        env.terminal === 'tmux' ||
        env.terminal === 'screen' ||
        env.terminal === null)
    ) {
      return 'Enable iTerm2 clipboard access for /copy'
    }
    return 'Install Shift+Enter key binding for newlines'
  },
  isHidden: env.terminal !== null && env.terminal in NATIVE_CSIU_TERMINALS,
  load: () => import('./terminalSetup.js'),
} satisfies Command

export default terminalSetup
