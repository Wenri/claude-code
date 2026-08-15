import React, { useMemo, useState } from 'react'
import {
  Form,
  type TextFormField,
} from '../../components/Form.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import type {
  PluginOptionSchema,
  PluginOptionValues,
} from '../../utils/plugins/pluginOptionsStorage.js'

/** Build the saved values using the same single-line input contract as Form. */
export function buildFinalValues(
  fields: string[],
  collected: Record<string, string>,
  configSchema: PluginOptionSchema,
  initialValues: PluginOptionValues | undefined,
): PluginOptionValues {
  const finalValues: PluginOptionValues = {}
  for (const fieldKey of fields) {
    const schema = configSchema[fieldKey]
    const value = (
      (collected[fieldKey] ?? '').split(/\r\n|\r|\n/, 1)[0] ?? ''
    ).trim()
    if (
      schema?.sensitive === true &&
      value === '' &&
      initialValues?.[fieldKey] !== undefined
    ) {
      continue
    }
    if (schema?.type === 'number') {
      if (value === '') continue
      const number = Number(value)
      finalValues[fieldKey] = Number.isNaN(number) ? value : number
    } else if (schema?.type === 'boolean') {
      finalValues[fieldKey] = isEnvTruthy(value)
    } else {
      finalValues[fieldKey] = value
    }
  }
  return finalValues
}

type Props = {
  title: string
  subtitle: string
  configSchema: PluginOptionSchema
  initialValues?: PluginOptionValues
  onSave: (config: PluginOptionValues) => void
  onCancel: () => void
}

/** Latest plugin configuration surface, backed by the shared validated Form. */
export function PluginOptionsDialog({
  title,
  subtitle,
  configSchema,
  initialValues,
  onSave,
  onCancel,
}: Props): React.ReactNode {
  const fields = Object.keys(configSchema)
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const key of fields) {
      const value =
        configSchema[key]?.sensitive === true ? undefined : initialValues?.[key]
      initial[key] = value === undefined ? '' : String(value)
    }
    return initial
  })
  const formFields = useMemo<TextFormField[]>(
    () =>
      fields.map(key => {
        const schema = configSchema[key]
        const sensitive = schema?.sensitive === true
        const hasSavedSensitiveValue =
          sensitive && initialValues?.[key] !== undefined
        return {
          type: 'text',
          key,
          label: schema?.title || key,
          required: schema?.required === true && !hasSavedSensitiveValue,
          mask: sensitive ? '*' : undefined,
          placeholder: hasSavedSensitiveValue ? '(unchanged)' : undefined,
          hint: () => schema?.description,
        }
      }),
    [configSchema, fields, initialValues],
  )

  if (fields.length === 0) return null

  return (
    <Form
      title={title}
      subtitle={subtitle}
      fields={formFields}
      values={values}
      onChange={(key, value) =>
        setValues(previous => ({ ...previous, [key]: value }))
      }
      onSubmit={() =>
        onSave(buildFinalValues(fields, values, configSchema, initialValues))
      }
      onCancel={onCancel}
      submitLabel="Save configuration"
    />
  )
}
