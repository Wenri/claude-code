import React from 'react';
import Text from '../../ink/components/Text.js';

type ParsedKey = {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  super: boolean;
};

type ShortcutFormat = {
  style?: 'default' | 'compact' | 'symbol';
  keyCase?: 'title' | 'lower' | 'glyph';
  modCase?: 'lower' | 'title' | 'glyph';
  caretCtrl?: boolean;
  modSep?: string;
  arrowSep?: string;
  chordSep?: string;
  shiftAsCase?: boolean;
  charCase?: 'preserve' | 'upper';
  platform?: 'macos' | 'other';
};

type ResolvedShortcutFormat = Required<Omit<ShortcutFormat, 'style'>>;

const FORMAT_STYLES: Record<NonNullable<ShortcutFormat['style']>, ResolvedShortcutFormat> = {
  default: {
    keyCase: 'title',
    modCase: 'lower',
    caretCtrl: false,
    modSep: '+',
    arrowSep: '/',
    chordSep: ' ',
    shiftAsCase: false,
    charCase: 'preserve',
    platform: 'other',
  },
  compact: {
    keyCase: 'lower',
    modCase: 'lower',
    caretCtrl: true,
    modSep: '+',
    arrowSep: '',
    chordSep: ' ',
    shiftAsCase: true,
    charCase: 'preserve',
    platform: 'other',
  },
  symbol: {
    keyCase: 'glyph',
    modCase: 'glyph',
    caretCtrl: false,
    modSep: '',
    arrowSep: '',
    chordSep: ' ',
    shiftAsCase: true,
    charCase: 'upper',
    platform: 'other',
  },
};

const KEY_NAMES: Record<string, [string, string, string]> = {
  enter: ['Enter', 'enter', '⏎'],
  escape: ['Esc', 'esc', '⎋'],
  tab: ['Tab', 'tab', '⇥'],
  ' ': ['Space', 'space', '␣'],
  backspace: ['Backspace', 'backspace', '⌫'],
  delete: ['Delete', 'delete', '⌦'],
  up: ['↑', '↑', '↑'],
  down: ['↓', '↓', '↓'],
  left: ['←', '←', '←'],
  right: ['→', '→', '→'],
  pageup: ['PageUp', 'pgup', '⇞'],
  pagedown: ['PageDown', 'pgdn', '⇟'],
  home: ['Home', 'home', '↖'],
  end: ['End', 'end', '↘'],
};

const KEY_CASE_INDEX = { title: 0, lower: 1, glyph: 2 } as const;
const ARROW_KEYS = new Set(['up', 'down', 'left', 'right']);
const NO_MODIFIERS = { ctrl: false, alt: false, shift: false, meta: false, super: false };

function parseKey(input: string): ParsedKey {
  const result: ParsedKey = { key: '', ...NO_MODIFIERS };
  for (const rawPart of input.split('+')) {
    const part = rawPart.toLowerCase();
    switch (part) {
      case 'ctrl':
      case 'control':
        result.ctrl = true;
        break;
      case 'alt':
      case 'opt':
      case 'option':
        result.alt = true;
        break;
      case 'shift':
        result.shift = true;
        break;
      case 'meta':
        result.meta = true;
        break;
      case 'cmd':
      case 'command':
      case 'super':
      case 'win':
        result.super = true;
        break;
      case 'esc':
        result.key = 'escape';
        break;
      case 'return':
        result.key = 'enter';
        break;
      case 'del':
        result.key = 'delete';
        break;
      case 'space':
        result.key = ' ';
        break;
      case '↑':
        result.key = 'up';
        break;
      case '↓':
        result.key = 'down';
        break;
      case '←':
        result.key = 'left';
        break;
      case '→':
        result.key = 'right';
        break;
      default:
        result.key = part;
    }
  }
  return result;
}

function parseChord(input: string): ParsedKey[] {
  if (input === ' ') return [parseKey('space')];
  return input.trim().split(/\s+/).map(parseKey);
}

function resolveFormat(format: ShortcutFormat = {}): ResolvedShortcutFormat {
  const { style = 'default', ...overrides } = format;
  const definedOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  );
  return { ...FORMAT_STYLES[style], ...definedOverrides };
}

function modifiers(key: ParsedKey): string[] {
  const result: string[] = [];
  if (key.ctrl) result.push('ctrl');
  if (key.shift) result.push('shift');
  if (key.alt || key.meta) result.push('alt');
  if (key.super) result.push('super');
  return result;
}

function isShiftedLetter(key: ParsedKey): boolean {
  return key.shift && !key.ctrl && !key.alt && !key.meta && !key.super && /^[a-z]$/.test(key.key);
}

function visibleModifiers(key: ParsedKey, format: ResolvedShortcutFormat): string[] {
  return format.shiftAsCase && isShiftedLetter(key) ? [] : modifiers(key);
}

function formatModifier(modifier: string, format: ResolvedShortcutFormat): string {
  if (format.modCase === 'glyph') {
    return { ctrl: '⌃', shift: '⇧', alt: '⌥', super: '⌘' }[modifier] ?? modifier;
  }
  const title = format.modCase === 'title';
  const names = modifier === 'alt'
    ? format.platform === 'macos' ? 'opt' : 'alt'
    : modifier === 'super'
      ? format.platform === 'macos' ? 'cmd' : 'super'
      : modifier;
  return title ? names[0]!.toUpperCase() + names.slice(1) : names;
}

function formatKey(key: ParsedKey, format: ResolvedShortcutFormat): string {
  if (format.shiftAsCase && isShiftedLetter(key)) return key.key.toUpperCase();
  const keyNames = KEY_NAMES[key.key];
  const keyName = keyNames
    ? keyNames[KEY_CASE_INDEX[format.keyCase]]
    : format.charCase === 'upper' ? key.key.toUpperCase() : key.key;
  const mods = modifiers(key);
  if (format.caretCtrl && mods.length === 1 && mods[0] === 'ctrl') return `^${keyName}`;
  if (format.modCase === 'glyph') return `${mods.map(mod => formatModifier(mod, format)).join('')}${keyName}`;
  return [...mods.map(mod => formatModifier(mod, format)), keyName].join(format.modSep);
}

function commonModifiers(keys: ParsedKey[], format: ResolvedShortcutFormat): ParsedKey | undefined {
  const [first, ...rest] = keys;
  if (!first || visibleModifiers(first, format).length === 0) return undefined;
  const firstModifiers = visibleModifiers(first, format);
  return rest.every(key => {
    const keyModifiers = visibleModifiers(key, format);
    return firstModifiers.length === keyModifiers.length && firstModifiers.every((mod, index) => mod === keyModifiers[index]);
  }) ? first : undefined;
}

function modifierPrefix(key: ParsedKey, format: ResolvedShortcutFormat): string {
  const mods = modifiers(key);
  if (format.caretCtrl && mods.length === 1 && mods[0] === 'ctrl') return '^';
  if (format.modCase === 'glyph') return mods.map(mod => formatModifier(mod, format)).join('');
  return `${mods.map(mod => formatModifier(mod, format)).join(format.modSep)}${format.modSep}`;
}

export function formatKeyboardShortcut(chords: string | string[], options: ShortcutFormat = {}): string {
  const parsed = (typeof chords === 'string' ? [chords] : chords).map(parseChord);
  const format = resolveFormat(options);
  const formatChord = (chord: ParsedKey[]) => chord.map(key => formatKey(key, format)).join(format.chordSep);
  if (parsed.length === 0) return '';
  if (parsed.length === 1) return formatChord(parsed[0]!);
  const singleKeys = parsed.every(chord => chord.length === 1) ? parsed.map(chord => chord[0]!) : undefined;
  if (!singleKeys) return parsed.map(formatChord).join('/');
  const common = commonModifiers(singleKeys, format);
  const separator = singleKeys.every(key => ARROW_KEYS.has(key.key)) && (common || singleKeys.every(key => visibleModifiers(key, format).length === 0))
    ? format.arrowSep
    : '/';
  if (common) {
    const withoutModifiers = singleKeys.map(key => formatKey({ ...key, ...NO_MODIFIERS }, format));
    return `${modifierPrefix(common, format)}${withoutModifiers.join(separator)}`;
  }
  return singleKeys.map(key => formatKey(key, format)).join(separator);
}

type Props = {
  /** The key or chord to display (e.g., "ctrl+o", "Enter", "↑/↓") */
  shortcut?: string;
  /** A chord, or alternate chords, parsed and rendered with the bundle formatter. */
  chord?: string | string[];
  /** Bundle-compatible key/modifier formatting overrides. */
  format?: ShortcutFormat;
  /** The action the key performs (e.g., "expand", "select", "navigate") */
  action: string;
  /** Whether to wrap the hint in parentheses. Default: false */
  parens?: boolean;
  /** Whether to render the shortcut in bold. Default: false */
  bold?: boolean;
};

/**
 * Renders a keyboard shortcut hint like "ctrl+o to expand" or "(tab to toggle)"
 *
 * Wrap in <Text dimColor> for the common dim styling.
 *
 * @example
 * // Simple hint wrapped in dim Text
 * <Text dimColor><KeyboardShortcutHint shortcut="esc" action="cancel" /></Text>
 *
 * // With parentheses: "(ctrl+o to expand)"
 * <Text dimColor><KeyboardShortcutHint shortcut="ctrl+o" action="expand" parens /></Text>
 *
 * // With bold shortcut: "Enter to confirm" (Enter is bold)
 * <Text dimColor><KeyboardShortcutHint shortcut="Enter" action="confirm" bold /></Text>
 *
 * // Multiple hints with middot separator - use Byline
 * <Text dimColor>
 *   <Byline>
 *     <KeyboardShortcutHint shortcut="Enter" action="confirm" />
 *     <KeyboardShortcutHint shortcut="Esc" action="cancel" />
 *   </Byline>
 * </Text>
 */
export function KeyboardShortcutHint({
  shortcut,
  chord,
  action,
  format,
  parens = false,
  bold = false,
}: Props): React.ReactNode {
  const display = chord === undefined ? (shortcut ?? '') : formatKeyboardShortcut(chord, format);
  if (!display) return null;
  const shortcutText = bold ? <Text bold>{display}</Text> : display;
  if (parens) {
    return <Text>({shortcutText} to {action})</Text>;
  }
  return <Text>{shortcutText} to {action}</Text>;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsIlRleHQiLCJQcm9wcyIsInNob3J0Y3V0IiwiYWN0aW9uIiwicGFyZW5zIiwiYm9sZCIsIktleWJvYXJkU2hvcnRjdXRIaW50IiwidDAiLCIkIiwiX2MiLCJ0MSIsInQyIiwidW5kZWZpbmVkIiwidDMiLCJzaG9ydGN1dFRleHQiLCJ0NCJdLCJzb3VyY2VzIjpbIktleWJvYXJkU2hvcnRjdXRIaW50LnRzeCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUmVhY3QgZnJvbSAncmVhY3QnXG5pbXBvcnQgVGV4dCBmcm9tICcuLi8uLi9pbmsvY29tcG9uZW50cy9UZXh0LmpzJ1xuXG50eXBlIFByb3BzID0ge1xuICAvKiogVGhlIGtleSBvciBjaG9yZCB0byBkaXNwbGF5IChlLmcuLCBcImN0cmwrb1wiLCBcIkVudGVyXCIsIFwi4oaRL+KGk1wiKSAqL1xuICBzaG9ydGN1dDogc3RyaW5nXG4gIC8qKiBUaGUgYWN0aW9uIHRoZSBrZXkgcGVyZm9ybXMgKGUuZy4sIFwiZXhwYW5kXCIsIFwic2VsZWN0XCIsIFwibmF2aWdhdGVcIikgKi9cbiAgYWN0aW9uOiBzdHJpbmdcbiAgLyoqIFdoZXRoZXIgdG8gd3JhcCB0aGUgaGludCBpbiBwYXJlbnRoZXNlcy4gRGVmYXVsdDogZmFsc2UgKi9cbiAgcGFyZW5zPzogYm9vbGVhblxuICAvKiogV2hldGhlciB0byByZW5kZXIgdGhlIHNob3J0Y3V0IGluIGJvbGQuIERlZmF1bHQ6IGZhbHNlICovXG4gIGJvbGQ/OiBib29sZWFuXG59XG5cbi8qKlxuICogUmVuZGVycyBhIGtleWJvYXJkIHNob3J0Y3V0IGhpbnQgbGlrZSBcImN0cmwrbyB0byBleHBhbmRcIiBvciBcIih0YWIgdG8gdG9nZ2xlKVwiXG4gKlxuICogV3JhcCBpbiA8VGV4dCBkaW1Db2xvcj4gZm9yIHRoZSBjb21tb24gZGltIHN0eWxpbmcuXG4gKlxuICogQGV4YW1wbGVcbiAqIC8vIFNpbXBsZSBoaW50IHdyYXBwZWQgaW4gZGltIFRleHRcbiAqIDxUZXh0IGRpbUNvbG9yPjxLZXlib2FyZFNob3J0Y3V0SGludCBzaG9ydGN1dD1cImVzY1wiIGFjdGlvbj1cImNhbmNlbFwiIC8+PC9UZXh0PlxuICpcbiAqIC8vIFdpdGggcGFyZW50aGVzZXM6IFwiKGN0cmwrbyB0byBleHBhbmQpXCJcbiAqIDxUZXh0IGRpbUNvbG9yPjxLZXlib2FyZFNob3J0Y3V0SGludCBzaG9ydGN1dD1cImN0cmwrb1wiIGFjdGlvbj1cImV4cGFuZFwiIHBhcmVucyAvPjwvVGV4dD5cbiAqXG4gKiAvLyBXaXRoIGJvbGQgc2hvcnRjdXQ6IFwiRW50ZXIgdG8gY29uZmlybVwiIChFbnRlciBpcyBib2xkKVxuICogPFRleHQgZGltQ29sb3I+PEtleWJvYXJkU2hvcnRjdXRIaW50IHNob3J0Y3V0PVwiRW50ZXJcIiBhY3Rpb249XCJjb25maXJtXCIgYm9sZCAvPjwvVGV4dD5cbiAqXG4gKiAvLyBNdWx0aXBsZSBoaW50cyB3aXRoIG1pZGRvdCBzZXBhcmF0b3IgLSB1c2UgQnlsaW5lXG4gKiA8VGV4dCBkaW1Db2xvcj5cbiAqICAgPEJ5bGluZT5cbiAqICAgICA8S2V5Ym9hcmRTaG9ydGN1dEhpbnQgc2hvcnRjdXQ9XCJFbnRlclwiIGFjdGlvbj1cImNvbmZpcm1cIiAvPlxuICogICAgIDxLZXlib2FyZFNob3J0Y3V0SGludCBzaG9ydGN1dD1cIkVzY1wiIGFjdGlvbj1cImNhbmNlbFwiIC8+XG4gKiAgIDwvQnlsaW5lPlxuICogPC9UZXh0PlxuICovXG5leHBvcnQgZnVuY3Rpb24gS2V5Ym9hcmRTaG9ydGN1dEhpbnQoe1xuICBzaG9ydGN1dCxcbiAgYWN0aW9uLFxuICBwYXJlbnMgPSBmYWxzZSxcbiAgYm9sZCA9IGZhbHNlLFxufTogUHJvcHMpOiBSZWFjdC5SZWFjdE5vZGUge1xuICBjb25zdCBzaG9ydGN1dFRleHQgPSBib2xkID8gPFRleHQgYm9sZD57c2hvcnRjdXR9PC9UZXh0PiA6IHNob3J0Y3V0XG5cbiAgaWYgKHBhcmVucykge1xuICAgIHJldHVybiAoXG4gICAgICA8VGV4dD5cbiAgICAgICAgKHtzaG9ydGN1dFRleHR9IHRvIHthY3Rpb259KVxuICAgICAgPC9UZXh0PlxuICAgIClcbiAgfVxuICByZXR1cm4gKFxuICAgIDxUZXh0PlxuICAgICAge3Nob3J0Y3V0VGV4dH0gdG8ge2FjdGlvbn1cbiAgICA8L1RleHQ+XG4gIClcbn1cbiJdLCJtYXBwaW5ncyI6IjtBQUFBLE9BQU9BLEtBQUssTUFBTSxPQUFPO0FBQ3pCLE9BQU9DLElBQUksTUFBTSw4QkFBOEI7QUFFL0MsS0FBS0MsS0FBSyxHQUFHO0VBQ1g7RUFDQUMsUUFBUSxFQUFFLE1BQU07RUFDaEI7RUFDQUMsTUFBTSxFQUFFLE1BQU07RUFDZDtFQUNBQyxNQUFNLENBQUMsRUFBRSxPQUFPO0VBQ2hCO0VBQ0FDLElBQUksQ0FBQyxFQUFFLE9BQU87QUFDaEIsQ0FBQzs7QUFFRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsT0FBTyxTQUFBQyxxQkFBQUMsRUFBQTtFQUFBLE1BQUFDLENBQUEsR0FBQUMsRUFBQTtFQUE4QjtJQUFBUCxRQUFBO0lBQUFDLE1BQUE7SUFBQUMsTUFBQSxFQUFBTSxFQUFBO0lBQUFMLElBQUEsRUFBQU07RUFBQSxJQUFBSixFQUs3QjtFQUZOLE1BQUFILE1BQUEsR0FBQU0sRUFBYyxLQUFkRSxTQUFjLEdBQWQsS0FBYyxHQUFkRixFQUFjO0VBQ2QsTUFBQUwsSUFBQSxHQUFBTSxFQUFZLEtBQVpDLFNBQVksR0FBWixLQUFZLEdBQVpELEVBQVk7RUFBQSxJQUFBRSxFQUFBO0VBQUEsSUFBQUwsQ0FBQSxRQUFBSCxJQUFBLElBQUFHLENBQUEsUUFBQU4sUUFBQTtJQUVTVyxFQUFBLEdBQUFSLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUosS0FBRyxDQUFDLENBQUVILFNBQU8sQ0FBRSxFQUFwQixJQUFJLENBQWtDLEdBQTlDQSxRQUE4QztJQUFBTSxDQUFBLE1BQUFILElBQUE7SUFBQUcsQ0FBQSxNQUFBTixRQUFBO0lBQUFNLENBQUEsTUFBQUssRUFBQTtFQUFBO0lBQUFBLEVBQUEsR0FBQUwsQ0FBQTtFQUFBO0VBQW5FLE1BQUFNLFlBQUEsR0FBcUJELEVBQThDO0VBRW5FLElBQUlULE1BQU07SUFBQSxJQUFBVyxFQUFBO0lBQUEsSUFBQVAsQ0FBQSxRQUFBTCxNQUFBLElBQUFLLENBQUEsUUFBQU0sWUFBQTtNQUVOQyxFQUFBLElBQUMsSUFBSSxDQUFDLENBQ0ZELGFBQVcsQ0FBRSxJQUFLWCxPQUFLLENBQUUsQ0FDN0IsRUFGQyxJQUFJLENBRUU7TUFBQUssQ0FBQSxNQUFBTCxNQUFBO01BQUFLLENBQUEsTUFBQU0sWUFBQTtNQUFBTixDQUFBLE1BQUFPLEVBQUE7SUFBQTtNQUFBQSxFQUFBLEdBQUFQLENBQUE7SUFBQTtJQUFBLE9BRlBPLEVBRU87RUFBQTtFQUVWLElBQUFBLEVBQUE7RUFBQSxJQUFBUCxDQUFBLFFBQUFMLE1BQUEsSUFBQUssQ0FBQSxRQUFBTSxZQUFBO0lBRUNDLEVBQUEsSUFBQyxJQUFJLENBQ0ZELGFBQVcsQ0FBRSxJQUFLWCxPQUFLLENBQzFCLEVBRkMsSUFBSSxDQUVFO0lBQUFLLENBQUEsTUFBQUwsTUFBQTtJQUFBSyxDQUFBLE1BQUFNLFlBQUE7SUFBQU4sQ0FBQSxNQUFBTyxFQUFBO0VBQUE7SUFBQUEsRUFBQSxHQUFBUCxDQUFBO0VBQUE7RUFBQSxPQUZQTyxFQUVPO0FBQUEiLCJpZ25vcmVMaXN0IjpbXX0=
