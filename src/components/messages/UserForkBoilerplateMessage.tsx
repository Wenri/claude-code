import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import * as React from 'react'
import { FORK_GLYPH } from '../../constants/figures.js'
import {
  FORK_BOILERPLATE_TAG,
  FORK_DIRECTIVE_PREFIX,
} from '../../constants/xml.js'
import { Box, Text } from '../../ink.js'

type Props = {
  addMargin: boolean
  param: TextBlockParam
}

const FORK_BOILERPLATE_REGEX = new RegExp(
  `<${FORK_BOILERPLATE_TAG}>[\\s\\S]*?</${FORK_BOILERPLATE_TAG}>\\n*`,
)

export function UserForkBoilerplateMessage({
  addMargin,
  param: { text },
}: Props): React.ReactNode {
  const withoutBoilerplate = text.replace(FORK_BOILERPLATE_REGEX, '')
  const content = withoutBoilerplate.startsWith(FORK_DIRECTIVE_PREFIX)
    ? withoutBoilerplate.slice(FORK_DIRECTIVE_PREFIX.length)
    : withoutBoilerplate

  return (
    <Box
      marginTop={addMargin ? 1 : 0}
      backgroundColor="userMessageBackground"
      paddingRight={1}
    >
      <Text dimColor>{FORK_GLYPH}</Text>
      <Box paddingLeft={1}>
        <Text>{content}</Text>
      </Box>
    </Box>
  )
}
