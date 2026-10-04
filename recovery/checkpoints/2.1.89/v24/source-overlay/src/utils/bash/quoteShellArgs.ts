/**
 * Explicit reconstruction of the fixed 2.1.89 shared argument-quoting helper.
 * The public name and file are reconstruction choices, not original metadata.
 */
export function quoteShellArgs(args: ReadonlyArray<unknown>): string {
  return args.map(arg => {
    const text = String(arg)
    if (text === '') return "''"
    if (/^[A-Za-z0-9_./:=@+,-]+$/.test(text)) return text
    return "'" + text.replaceAll("'", `'"'"'`) + "'"
  }).join(' ')
}
