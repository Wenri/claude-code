/**
 * Reconstructed fixed 2.1.89 behavior: quote the complete command for eval,
 * then place stdin redirection outside that quoted argument.
 * The historical export name is retained; this does not parse or rewrite pipes.
 */
export function rearrangePipeCommand(command: string): string {
  return singleQuoteForEval(command) + ' < /dev/null'
}

/** Escape embedded quotes while retaining the input string as the receiver. */
function singleQuoteForEval(command: string): string {
  return "'" + command.replaceAll("'", `'"'"'`) + "'"
}
