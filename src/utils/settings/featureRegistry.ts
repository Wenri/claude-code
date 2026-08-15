import { z } from 'zod/v4'
import {
  EXTERNAL_PERMISSION_MODES,
  PERMISSION_MODES,
  type PermissionMode,
} from '../permissions/PermissionMode.js'

export const SETTING_FEATURE_KEYS = [
  'autoMode',
  'deepLink',
  'voice',
  'assistant',
  'briefView',
] as const

export type SettingFeatureKey = (typeof SETTING_FEATURE_KEYS)[number]

type SchemaShape = Record<string, z.ZodType>

type SettingFeatureDefinition = {
  buildGate: () => boolean
  shape: () => SchemaShape
  permissionsShape?: () => SchemaShape
  permissionModes?: () => PermissionMode[]
}

const EMPTY_ASSISTANT_SHAPE: SchemaShape = {}

/**
 * Build-time setting surfaces present in the published CLI. Keeping the
 * registry explicit lets the main settings schema, permission schema, plugin
 * settings projection, and JSON-schema generator consume the same gates.
 */
const SETTING_FEATURE_REGISTRY: Record<
  SettingFeatureKey,
  SettingFeatureDefinition
> = {
  autoMode: {
    buildGate: () => true,
    shape: () => ({
      skipAutoPermissionPrompt: z
        .boolean()
        .optional()
        .describe('Whether the user has accepted the auto mode opt-in dialog'),
      useAutoModeDuringPlan: z
        .boolean()
        .optional()
        .describe(
          'Whether plan mode uses auto mode semantics when auto mode is available (default: true)',
        ),
      autoMode: z
        .object({
          allow: z
            .array(z.string())
            .optional()
            .describe('Rules for the auto mode classifier allow section'),
          soft_deny: z
            .array(z.string())
            .optional()
            .describe('Rules for the auto mode classifier deny section'),
          environment: z
            .array(z.string())
            .optional()
            .describe(
              'Entries for the auto mode classifier environment section',
            ),
        })
        .optional()
        .describe('Auto mode classifier prompt customization'),
    }),
    permissionsShape: () => ({
      disableAutoMode: z
        .enum(['disable'])
        .optional()
        .describe('Disable auto mode'),
    }),
    permissionModes: () =>
      PERMISSION_MODES.filter(
        mode => !EXTERNAL_PERMISSION_MODES.includes(mode),
      ),
  },
  deepLink: {
    buildGate: () => true,
    shape: () => ({
      disableDeepLinkRegistration: z
        .enum(['disable'])
        .optional()
        .describe(
          'Prevent claude-cli:// protocol handler registration with the OS',
        ),
    }),
  },
  voice: {
    buildGate: () => true,
    shape: () => ({
      voiceEnabled: z
        .boolean()
        .optional()
        .describe('Enable voice mode (hold-to-talk dictation)'),
    }),
  },
  assistant: {
    buildGate: () => false,
    shape: () => EMPTY_ASSISTANT_SHAPE,
  },
  briefView: {
    buildGate: () => true,
    shape: () => ({
      defaultView: z
        .enum(['chat', 'transcript'])
        .optional()
        .describe(
          'Default transcript view: chat (SendUserMessage checkpoints only) or transcript (full)',
        ),
    }),
  },
}

export function getEnabledSettingFeatures(): SettingFeatureKey[] {
  return SETTING_FEATURE_KEYS.filter(
    key => SETTING_FEATURE_REGISTRY[key].buildGate(),
  )
}

export function getSettingFeatureShape(
  features: readonly SettingFeatureKey[],
): SchemaShape {
  let shape: SchemaShape = {}
  for (const feature of features) {
    shape = { ...shape, ...SETTING_FEATURE_REGISTRY[feature].shape() }
  }
  return shape
}

export function getSettingFeaturePermissionsShape(
  features: readonly SettingFeatureKey[],
): SchemaShape {
  let shape: SchemaShape = {}
  for (const feature of features) {
    shape = {
      ...shape,
      ...SETTING_FEATURE_REGISTRY[feature].permissionsShape?.(),
    }
  }
  return shape
}

export function getSettingFeaturePermissionModes(
  features: readonly SettingFeatureKey[],
): PermissionMode[] {
  const modes: PermissionMode[] = []
  for (const feature of features) {
    modes.push(
      ...(SETTING_FEATURE_REGISTRY[feature].permissionModes?.() ?? []),
    )
  }
  return modes
}
