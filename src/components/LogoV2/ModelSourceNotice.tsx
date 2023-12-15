import * as React from 'react'
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js'
import { Box, Text } from '../../ink.js'
import {
  getModelSourceAnnotation,
  renderModelSetting,
} from '../../utils/model/model.js'

export function ModelSourceNotice(): React.ReactNode {
  const model = useMainLoopModel()
  const sourceSuffix = React.useMemo(getModelSourceAnnotation, [model])
  if (!sourceSuffix) return null
  return (
    <Box paddingLeft={2}>
      <Text dimColor={true}>
        Using {renderModelSetting(model)}{sourceSuffix} · /model to change
      </Text>
    </Box>
  )
}
