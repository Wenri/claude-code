import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import React, { useEffect, useMemo, useState } from 'react'
import { Select } from './CustomSelect/select.js'
import { Dialog } from './design-system/Dialog.js'
import { Form, type FormField } from './Form.js'
import { Spinner } from './Spinner.js'
import TextInput from './TextInput.js'
import { Box, Text } from '../ink.js'
import { useKeybinding } from '../keybindings/useKeybinding.js'
import { logEvent } from '../services/analytics/index.js'
import { getAWSClientProxyConfig, getProxyFetchOptions } from '../utils/proxy.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../utils/settings/settings.js'
import { ALL_MODEL_CONFIGS } from '../utils/model/configs.js'
import { modelSupports1M } from '../utils/context.js'

export type BedrockAuthMethod =
  | 'profile'
  | 'bearer'
  | 'accessKey'
  | 'environment'

export type BedrockWizardData = {
  authMethod?: BedrockAuthMethod
  awsProfile?: string
  bearerToken?: string
  accessKeyId?: string
  secretAccessKey?: string
  sessionToken?: string
  region?: string
  verifiedIdentity?: string
  discoveredProfiles?: string[]
  pinSonnet?: string
  pinOpus?: string
  pinHaiku?: string
}

type ProbeReason = 'auth' | 'permission' | 'model' | 'network' | 'other'
export type ProbeResult = { ok: true } | { ok: false; reason: ProbeReason }
type VerificationResult =
  | {
      status: 'ok'
      identity: string
      profiles: string[]
      note?: string
    }
  | { status: 'error'; error: string; command?: string }

type ModelTier = 'sonnet' | 'opus' | 'haiku'
const MODEL_TIERS: readonly ModelTier[] = ['sonnet', 'opus', 'haiku']
const MODEL_LABELS: Record<ModelTier, string> = {
  sonnet: 'Sonnet',
  opus: 'Opus',
  haiku: 'Haiku',
}
const MODEL_ENV_KEYS: Record<ModelTier, string> = {
  sonnet: 'ANTHROPIC_DEFAULT_SONNET_MODEL',
  opus: 'ANTHROPIC_DEFAULT_OPUS_MODEL',
  haiku: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
}
const PROBE_ERRORS: Record<ProbeReason, string> = {
  auth: 'auth failed',
  permission: 'no InvokeModel permission',
  model: 'not enabled in this account',
  network: 'unreachable',
  other: 'request failed',
}

function regionPrefix(region?: string): 'us' | 'eu' | 'apac' | 'global' {
  const value = region ?? ''
  if (value.startsWith('us-') && !value.startsWith('us-gov-')) return 'us'
  if (value.startsWith('eu-')) return 'eu'
  if (value.startsWith('ap-')) return 'apac'
  return 'global'
}

function withRegionPrefix(model: string, region?: string): string {
  return model.replace(/^(?:us|eu|apac|global)\./, `${regionPrefix(region)}.`)
}

function with1mSuffix(model: string): string {
  return /\[1m\]$/i.test(model) ? model : `${model}[1m]`
}

export function getBedrockModelCandidates(
  region?: string,
): Record<ModelTier, { needle: string; fallback: string }> {
  const config = {
    sonnet: ALL_MODEL_CONFIGS.sonnet45,
    opus: ALL_MODEL_CONFIGS.opus46,
    haiku: ALL_MODEL_CONFIGS.haiku45,
  }
  return Object.fromEntries(
    MODEL_TIERS.map(tier => [
      tier,
      {
        needle: config[tier].firstParty,
        fallback: withRegionPrefix(config[tier].bedrock, region),
      },
    ]),
  ) as Record<ModelTier, { needle: string; fallback: string }>
}

async function credentialProvider(data: BedrockWizardData) {
  switch (data.authMethod) {
    case 'profile': {
      const { fromNodeProviderChain } = await import(
        '@aws-sdk/credential-providers'
      )
      return fromNodeProviderChain({
        profile: data.awsProfile,
        ignoreCache: true,
      })
    }
    case 'accessKey':
      return async () => ({
        accessKeyId: data.accessKeyId!,
        secretAccessKey: data.secretAccessKey!,
        ...(data.sessionToken && { sessionToken: data.sessionToken }),
      })
    case 'environment':
    default:
      return undefined
  }
}

/**
 * Source owner for the setup wizard's Anthropic Bedrock probe. In 2.1.96 the
 * SDK's apiKey option replaced the hand-authored Authorization header.
 */
export async function createBedrockProbeClient(data: BedrockWizardData) {
  const { AnthropicBedrock } = await import('@anthropic-ai/bedrock-sdk')
  const base = {
    awsRegion: data.region,
    maxRetries: 0,
    fetchOptions: getProxyFetchOptions({ forAnthropicAPI: true }),
  }
  if (data.authMethod === 'bearer') {
    return new AnthropicBedrock({
      ...base,
      apiKey: data.bearerToken,
    })
  }
  const provider = await credentialProvider(data)
  if (!provider) return new AnthropicBedrock(base)
  const credentials = await provider()
  return new AnthropicBedrock({
    ...base,
    awsAccessKey: credentials.accessKeyId,
    awsSecretKey: credentials.secretAccessKey,
    awsSessionToken: credentials.sessionToken,
  })
}

export async function probeBedrockModel(
  data: BedrockWizardData,
  model: string,
): Promise<ProbeResult> {
  let client
  try {
    client = await createBedrockProbeClient(data)
  } catch {
    return { ok: false, reason: 'auth' }
  }
  try {
    await client.messages.create({
      model: model.replace(/\[1m\]$/i, ''),
      max_tokens: 1,
      messages: [{ role: 'user', content: '.' }],
    })
    return { ok: true }
  } catch (error) {
    const status = (error as { status?: number })?.status
    if (status === 401) return { ok: false, reason: 'auth' }
    if (status === 403) return { ok: false, reason: 'permission' }
    if (status === 400 || status === 404) {
      return { ok: false, reason: 'model' }
    }
    if (status === 429) return { ok: true }
    if (status === undefined) return { ok: false, reason: 'network' }
    return { ok: false, reason: 'other' }
  }
}

function awsVerificationError(
  error: unknown,
  data: BedrockWizardData,
): Extract<VerificationResult, { status: 'error' }> {
  const typed = error as { name?: string; message?: string }
  const name = typed?.name ?? 'Error'
  const message = typed?.message ?? String(error)
  const command =
    data.authMethod === 'profile'
      ? `aws sso login --profile ${data.awsProfile}`
      : undefined
  switch (name) {
    case 'CredentialsProviderError':
      return data.authMethod === 'profile'
        ? {
            status: 'error',
            error: `Could not load credentials for profile "${data.awsProfile}". If this is an SSO profile, run:`,
            command,
          }
        : { status: 'error', error: `No AWS credentials found. ${message}` }
    case 'ExpiredTokenException':
    case 'TokenRefreshRequired':
      return data.authMethod === 'profile'
        ? { status: 'error', error: 'SSO session expired. Run:', command }
        : { status: 'error', error: `Credentials expired. ${message}` }
    case 'ForbiddenException':
      return data.authMethod === 'profile'
        ? {
            status: 'error',
            error: `SSO portal denied access to the role for profile "${data.awsProfile}". The permission set may have been revoked — check your AWS access portal.`,
          }
        : { status: 'error', error: `Forbidden. ${message}` }
    case 'AccessDeniedException':
      return {
        status: 'error',
        error: `Access denied. Your IAM role needs bedrock:ListInferenceProfiles permission. ${message}`,
      }
    case 'UnrecognizedClientException':
    case 'InvalidSignatureException':
      return { status: 'error', error: `Invalid credentials. ${message}` }
    case 'UnknownEndpoint':
    case 'ENOTFOUND':
      return {
        status: 'error',
        error: `Cannot reach AWS in region "${data.region}". Check the region name and your network.`,
      }
    default:
      return { status: 'error', error: `${name}: ${message}` }
  }
}

async function verifyBearer(
  data: BedrockWizardData,
): Promise<VerificationResult> {
  const model = getBedrockModelCandidates(data.region).haiku.fallback
  const result = await probeBedrockModel(data, model)
  if (result.ok) {
    return {
      status: 'ok',
      identity: 'Bedrock API key',
      profiles: [],
      note: `Test request to ${model} succeeded.`,
    }
  }
  switch (result.reason) {
    case 'auth':
      return {
        status: 'error',
        error: 'Invalid Bedrock API key. Check the key and try again.',
      }
    case 'permission':
      return {
        status: 'error',
        error:
          'API key was rejected. Your IAM policy may be missing bedrock:CallWithBearerToken or bedrock:InvokeModel.',
      }
    case 'model':
      return {
        status: 'ok',
        identity: 'Bedrock API key',
        profiles: [],
        note: `The key works, but ${model} is not enabled in your account. Pin a model you have access to on the next step.`,
      }
    case 'network':
      return {
        status: 'error',
        error: `Could not reach Bedrock in region "${data.region}". Check the region name and your network.`,
      }
    case 'other':
      return {
        status: 'error',
        error: 'The test request failed. Check the key and region.',
      }
  }
}

export async function verifyBedrockSetup(
  data: BedrockWizardData,
): Promise<VerificationResult> {
  if (data.authMethod === 'bearer') return verifyBearer(data)
  try {
    const provider = await credentialProvider(data)
    const base = {
      ...(await getAWSClientProxyConfig()),
      region: data.region,
      ...(provider && { credentials: provider }),
    }
    const { STSClient, GetCallerIdentityCommand } = await import(
      '@aws-sdk/client-sts'
    )
    const identity = await new STSClient(base).send(
      new GetCallerIdentityCommand({}),
    )
    const displayIdentity = identity.Arn ?? identity.UserId ?? '(unknown)'
    const { BedrockClient, ListInferenceProfilesCommand } = await import(
      '@aws-sdk/client-bedrock'
    )
    const client = new BedrockClient(base)
    const profiles: string[] = []
    let nextToken: string | undefined
    do {
      const response = await client.send(
        new ListInferenceProfilesCommand({
          ...(nextToken && { nextToken }),
          typeEquals: 'SYSTEM_DEFINED',
        }),
      )
      for (const profile of response.inferenceProfileSummaries ?? []) {
        if (profile.inferenceProfileId?.includes('anthropic')) {
          profiles.push(profile.inferenceProfileId)
        }
      }
      nextToken = response.nextToken
    } while (nextToken)
    return {
      status: 'ok',
      identity: displayIdentity,
      profiles,
    }
  } catch (error) {
    return awsVerificationError(error, data)
  }
}

export async function discoverAwsProfiles(): Promise<string[]> {
  const profiles = new Set<string>()
  const home = homedir()
  for (const { path, pattern } of [
    {
      path: join(home, '.aws', 'config'),
      pattern: /^\[(?:profile\s+)?([^\]]+)\]/gm,
    },
    {
      path: join(home, '.aws', 'credentials'),
      pattern: /^\[([^\]]+)\]/gm,
    },
  ]) {
    try {
      for (const match of (await readFile(path, 'utf8')).matchAll(pattern)) {
        const name = match[1]?.trim()
        if (name && !name.startsWith('sso-session ')) profiles.add(name)
      }
    } catch {
      // Missing AWS files simply mean there are no discoverable profiles.
    }
  }
  return [...profiles].sort()
}

export function buildBedrockEnvironment(
  data: BedrockWizardData,
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    CLAUDE_CODE_USE_BEDROCK: '1',
    CLAUDE_CODE_USE_VERTEX: undefined,
    CLAUDE_CODE_USE_FOUNDRY: undefined,
    CLAUDE_CODE_USE_ANTHROPIC_AWS: undefined,
    AWS_REGION: data.region,
    AWS_PROFILE: undefined,
    AWS_BEARER_TOKEN_BEDROCK: undefined,
    AWS_ACCESS_KEY_ID: undefined,
    AWS_SECRET_ACCESS_KEY: undefined,
    AWS_SESSION_TOKEN: undefined,
    ANTHROPIC_DEFAULT_SONNET_MODEL: undefined,
    ANTHROPIC_DEFAULT_OPUS_MODEL: undefined,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: undefined,
  }
  switch (data.authMethod) {
    case 'profile':
      env.AWS_PROFILE = data.awsProfile
      break
    case 'bearer':
      env.AWS_BEARER_TOKEN_BEDROCK = data.bearerToken
      break
    case 'accessKey':
      env.AWS_ACCESS_KEY_ID = data.accessKeyId
      env.AWS_SECRET_ACCESS_KEY = data.secretAccessKey
      if (data.sessionToken) env.AWS_SESSION_TOKEN = data.sessionToken
      break
    case 'environment':
    case undefined:
      break
  }
  if (data.pinSonnet) env.ANTHROPIC_DEFAULT_SONNET_MODEL = data.pinSonnet
  if (data.pinOpus) env.ANTHROPIC_DEFAULT_OPUS_MODEL = data.pinOpus
  if (data.pinHaiku) env.ANTHROPIC_DEFAULT_HAIKU_MODEL = data.pinHaiku
  return env
}

function WizardFrame({
  subtitle,
  onBack,
  children,
}: {
  subtitle: string
  onBack(): void
  children: React.ReactNode
}) {
  return (
    <>
      <Dialog
        title="Set up AWS Bedrock"
        subtitle={subtitle}
        onCancel={onBack}
        color="suggestion"
        hideInputGuide
        isCancelActive={false}
      >
        {children}
      </Dialog>
      <Box marginLeft={3} marginTop={1}>
        <Text dimColor>↑↓ navigate · Enter select · Esc go back</Text>
      </Box>
    </>
  )
}

function AuthMethodStep({
  onBack,
  onSelect,
}: {
  onBack(): void
  onSelect(method: BedrockAuthMethod): void
}) {
  return (
    <WizardFrame subtitle="How do you authenticate to AWS?" onBack={onBack}>
      <Box flexDirection="column" gap={1}>
        <Text dimColor>
          {'Claude Code uses the standard AWS credential chain. Pick the method you already use with the AWS CLI.'}
        </Text>
        <Select
          options={[
            { label: 'AWS profile (SSO or named profile)', value: 'profile' },
            { label: 'Bedrock API key (bearer token)', value: 'bearer' },
            { label: 'Access key + secret', value: 'accessKey' },
            {
              label: 'Use credentials already in my environment',
              value: 'environment',
            },
          ]}
          onChange={value => onSelect(value as BedrockAuthMethod)}
          onCancel={onBack}
        />
      </Box>
    </WizardFrame>
  )
}

function InputStep({
  subtitle,
  description,
  hint,
  placeholder,
  initialValue = '',
  requiredMessage,
  mask,
  onBack,
  onSubmit,
}: {
  subtitle: string
  description?: string
  hint?: string
  placeholder?: string
  initialValue?: string
  requiredMessage?: string
  mask?: string
  onBack(): void
  onSubmit(value: string): void
}) {
  const [value, setValue] = useState(initialValue)
  const [cursorOffset, setCursorOffset] = useState(initialValue.length)
  const [error, setError] = useState<string | null>(null)
  useKeybinding('confirm:no', onBack, { context: 'Settings' })
  function submit() {
    const trimmed = value.trim()
    if (requiredMessage && !trimmed) {
      setError(requiredMessage)
      return
    }
    setError(null)
    onSubmit(trimmed)
  }
  return (
    <WizardFrame subtitle={subtitle} onBack={onBack}>
      <Box flexDirection="column" gap={1}>
        {description && <Text>{description}</Text>}
        {hint && <Text dimColor>{hint}</Text>}
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={submit}
          placeholder={placeholder}
          mask={mask}
          columns={60}
          cursorOffset={cursorOffset}
          onChangeCursorOffset={setCursorOffset}
          focus
          showCursor
        />
        {error && <Text color="error">{error}</Text>}
        <Text dimColor>Enter continue · Esc go back</Text>
      </Box>
    </WizardFrame>
  )
}

const ACCESS_KEY_FIELDS: FormField[] = [
  {
    type: 'text',
    key: 'accessKeyId',
    label: 'Access key ID',
    placeholder: 'AKIA…',
    required: true,
  },
  {
    type: 'text',
    key: 'secretAccessKey',
    label: 'Secret access key',
    mask: '*',
    required: true,
  },
  {
    type: 'text',
    key: 'sessionToken',
    label: 'Session token',
    mask: '*',
    hint: () =>
      'Only needed for temporary credentials from STS. Leave empty for long-lived keys.',
  },
]

function AccessKeyStep({
  data,
  onBack,
  onSubmit,
}: {
  data: BedrockWizardData
  onBack(): void
  onSubmit(
    credentials: Pick<
      BedrockWizardData,
      'accessKeyId' | 'secretAccessKey' | 'sessionToken'
    >,
  ): void
}) {
  const [values, setValues] = useState({
    accessKeyId: data.accessKeyId ?? '',
    secretAccessKey: data.secretAccessKey ?? '',
    sessionToken: data.sessionToken ?? '',
  })
  return (
    <Form
      title="Set up AWS Bedrock"
      subtitle="AWS access keys"
      fields={ACCESS_KEY_FIELDS}
      values={values}
      onChange={(key, value) =>
        setValues(current => ({ ...current, [key]: value }))
      }
      onSubmit={() =>
        onSubmit({
          accessKeyId: values.accessKeyId.trim(),
          secretAccessKey: values.secretAccessKey.trim(),
          sessionToken: values.sessionToken.trim() || undefined,
        })
      }
      onCancel={onBack}
      submitLabel="Continue"
    />
  )
}

function ProfileStep({
  data,
  onBack,
  onSubmit,
}: {
  data: BedrockWizardData
  onBack(): void
  onSubmit(profile: string): void
}) {
  const [profiles, setProfiles] = useState<string[] | null>(null)
  const [manual, setManual] = useState(false)
  useEffect(() => {
    let cancelled = false
    void discoverAwsProfiles().then(value => {
      if (!cancelled) setProfiles(value)
    })
    return () => {
      cancelled = true
    }
  }, [])
  if (!profiles) {
    return (
      <WizardFrame subtitle="AWS profile" onBack={onBack}>
        <Box>
          <Spinner />
          <Text> Reading ~/.aws/config…</Text>
        </Box>
      </WizardFrame>
    )
  }
  if (manual || profiles.length === 0 || profiles.length > 12) {
    return (
      <InputStep
        subtitle="AWS profile name"
        description="The name from ~/.aws/config (after [profile …])."
        hint={`If this is an SSO profile, run \`aws sso login --profile NAME\` first.${profiles.length > 12 ? ` Found ${profiles.length} profiles — too many to list.` : ''}`}
        placeholder="my-bedrock-profile"
        initialValue={data.awsProfile ?? ''}
        requiredMessage="Profile name is required"
        onBack={onBack}
        onSubmit={onSubmit}
      />
    )
  }
  return (
    <WizardFrame subtitle="AWS profile" onBack={onBack}>
      <Box flexDirection="column" gap={1}>
        <Text dimColor>
          Found {profiles.length} {profiles.length === 1 ? 'profile' : 'profiles'}
          {' in ~/.aws/config and ~/.aws/credentials.'}
        </Text>
        <Select
          options={[
            ...profiles.map(profile => ({ label: profile, value: profile })),
            { label: 'Type a different name…', value: '__manual__' },
          ]}
          defaultValue={
            data.awsProfile && profiles.includes(data.awsProfile)
              ? data.awsProfile
              : undefined
          }
          onChange={value => {
            if (value === '__manual__') setManual(true)
            else onSubmit(value)
          }}
          onCancel={onBack}
        />
      </Box>
    </WizardFrame>
  )
}

function VerificationStep({
  data,
  onBack,
  onContinue,
}: {
  data: BedrockWizardData
  onBack(): void
  onContinue(result?: Extract<VerificationResult, { status: 'ok' }>): void
}) {
  const [result, setResult] = useState<VerificationResult | null>(null)
  useEffect(() => {
    let cancelled = false
    void verifyBedrockSetup(data).then(value => {
      if (!cancelled) setResult(value)
    })
    return () => {
      cancelled = true
    }
  }, [data])
  if (!result) {
    return (
      <WizardFrame subtitle="Verification" onBack={onBack}>
        <Box flexDirection="column">
          <Box>
            <Spinner />
            <Text> Verifying credentials</Text>
          </Box>
          <Text dimColor>
            {data.authMethod === 'bearer'
              ? 'Sending a test request to Bedrock…'
              : 'Calling AWS STS and Bedrock…'}
          </Text>
          <Text dimColor>This may take a few seconds.</Text>
        </Box>
      </WizardFrame>
    )
  }
  if (result.status === 'ok') {
    return (
      <WizardFrame subtitle="Verification" onBack={onBack}>
        <Box flexDirection="column" gap={1}>
          <Text color="success">Authenticated as {result.identity}</Text>
          {result.note && <Text dimColor>{result.note}</Text>}
          <Text dimColor>
            {result.profiles.length > 0
              ? `Found ${result.profiles.length} Anthropic inference ${result.profiles.length === 1 ? 'profile' : 'profiles'} in this region.`
              : 'No Anthropic inference profiles found in this region. You may still proceed — model defaults will use the built-in IDs.'}
          </Text>
          <Select
            options={[{ label: 'Continue', value: 'continue' }]}
            onChange={() => onContinue(result)}
            onCancel={onBack}
          />
        </Box>
      </WizardFrame>
    )
  }
  return (
    <WizardFrame subtitle="Verification failed" onBack={onBack}>
      <Box flexDirection="column" gap={1}>
        <Text color="error">{result.error}</Text>
        {result.command && <Text color="suggestion">    {result.command}</Text>}
        <Select
          options={[
            { label: 'Go back and fix', value: 'back' },
            { label: 'Save anyway (skip verification)', value: 'skip' },
          ]}
          onChange={value => {
            if (value === 'back') onBack()
            else onContinue()
          }}
          onCancel={onBack}
        />
      </Box>
    </WizardFrame>
  )
}

function ModelPickerStep({
  tier,
  data,
  profiles,
  fallback,
  current,
  existingPin,
  onPick,
  onCancel,
}: {
  tier: ModelTier
  data: BedrockWizardData
  profiles: string[]
  fallback: string
  current: string
  existingPin?: string
  onPick(value: string): void
  onCancel(): void
}) {
  const candidates = useMemo(() => {
    const values = profiles
      .filter(profile => profile.toLowerCase().includes(tier))
      .sort()
      .reverse()
    for (const value of [fallback, current, existingPin]) {
      if (value && !values.includes(value)) values.push(value)
    }
    return values
  }, [profiles, tier, fallback, current, existingPin])
  const [states, setStates] = useState<
    Record<string, ProbeResult | 'pending'>
  >(() => Object.fromEntries(candidates.map(value => [value, 'pending'])))
  useEffect(() => {
    let cancelled = false
    for (const candidate of candidates) {
      void probeBedrockModel(data, candidate).then(result => {
        if (!cancelled) {
          setStates(previous => ({ ...previous, [candidate]: result }))
        }
      })
    }
    return () => {
      cancelled = true
    }
    // The picker is keyed by tier, so its candidates and wizard data are fixed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const settled = candidates.every(candidate => states[candidate] !== 'pending')
  const works = (candidate: string) => {
    const state = states[candidate]
    return state !== undefined && state !== 'pending' && state.ok
  }
  const ordered = settled
    ? [...candidates].sort(
        (left, right) => Number(works(right)) - Number(works(left)),
      )
    : candidates
  const discoveredCount = profiles.filter(profile =>
    profile.toLowerCase().includes(tier),
  ).length
  return (
    <WizardFrame subtitle={`Pin ${MODEL_LABELS[tier]} model`} onBack={onCancel}>
      <Box flexDirection="column" gap={1}>
        <Text dimColor>
          {discoveredCount > 0
            ? `${discoveredCount} ${MODEL_LABELS[tier]} ${discoveredCount === 1 ? 'profile' : 'profiles'} in your account · each tested with a one-token request.`
            : `No ${MODEL_LABELS[tier]} profiles found in your account.`}
        </Text>
        <Select
          key={settled ? 'settled' : 'pending'}
          options={ordered.map(id => {
            const state = states[id] ?? 'pending'
            const suffix =
              id === existingPin
                ? '(currently pinned)'
                : id === fallback
                  ? '(built-in default)'
                  : id === current
                    ? '(selected)'
                  : undefined
            const status =
              state === 'pending'
                ? '…'
                : state.ok
                  ? '✓'
                  : `✗ (${PROBE_ERRORS[state.reason]})`
            return {
              value: id,
              label: `${status} ${id}${suffix ? ` ${suffix}` : ''}`,
            }
          })}
          defaultValue={settled ? ordered.find(works) : current}
          onChange={onPick}
          onCancel={onCancel}
        />
      </Box>
    </WizardFrame>
  )
}

function PinModelsStep({
  data,
  onBack,
  onContinue,
}: {
  data: BedrockWizardData
  onBack(): void
  onContinue(pins: Partial<BedrockWizardData>): void
}) {
  const candidates = useMemo(() => getBedrockModelCandidates(data.region), [
    data.region,
  ])
  const existingPins = useMemo(
    () =>
      Object.fromEntries(
        MODEL_TIERS.map(tier => [
          tier,
          process.env[MODEL_ENV_KEYS[tier]]?.trim() || undefined,
        ]),
      ) as Record<ModelTier, string | undefined>,
    [],
  )
  const initialSelected = useMemo(
    () =>
      Object.fromEntries(
        MODEL_TIERS.map(tier => [
          tier,
          existingPins[tier] ??
            data.discoveredProfiles?.find(profile =>
              profile.includes(candidates[tier].needle),
            ) ??
            candidates[tier].fallback,
        ]),
      ) as Record<ModelTier, string>,
    [candidates, data.discoveredProfiles, existingPins],
  )
  const [selected, setSelected] = useState(initialSelected)
  const [manualTier, setManualTier] = useState<ModelTier | null>(null)
  const [states, setStates] = useState<
    Record<ModelTier, ProbeResult | 'pending'>
  >({ sonnet: 'pending', opus: 'pending', haiku: 'pending' })
  useEffect(() => {
    let cancelled = false
    for (const tier of MODEL_TIERS) {
      void probeBedrockModel(data, selected[tier]).then(result => {
        if (!cancelled) {
          setStates(current => ({ ...current, [tier]: result }))
        }
      })
    }
    return () => {
      cancelled = true
    }
  }, [data, selected])
  const settled = MODEL_TIERS.every(tier => states[tier] !== 'pending')
  const hasWorking = MODEL_TIERS.some(
    tier => states[tier] !== 'pending' && states[tier].ok,
  )
  if (manualTier) {
    return (
      <ModelPickerStep
        key={manualTier}
        tier={manualTier}
        data={data}
        profiles={data.discoveredProfiles ?? []}
        fallback={candidates[manualTier].fallback}
        current={selected[manualTier]}
        existingPin={existingPins[manualTier]}
        onPick={value => {
          setSelected(previous => ({ ...previous, [manualTier]: value }))
          const index = MODEL_TIERS.indexOf(manualTier)
          setManualTier(MODEL_TIERS[index + 1] ?? null)
        }}
        onCancel={() => setManualTier(null)}
      />
    )
  }
  const hasWorking1m =
    settled &&
    MODEL_TIERS.some(tier => {
      const state = states[tier]
      return state !== 'pending' && state.ok && modelSupports1M(selected[tier])
    })
  function pinWorking(use1m = false) {
    const pin = (tier: ModelTier) => {
      const state = states[tier]
      if (state === 'pending' || !state.ok) return undefined
      const model = selected[tier]
      return use1m && modelSupports1M(model) ? with1mSuffix(model) : model
    }
    onContinue({
      pinSonnet: pin('sonnet'),
      pinOpus: pin('opus'),
      pinHaiku: pin('haiku'),
    })
  }
  return (
    <WizardFrame subtitle="Pin model versions" onBack={onBack}>
      <Box flexDirection="column" gap={1}>
        <Text>
          {'Without pinning, Claude Code uses its built-in defaults. When a new model ships, your install will try to call it even if your account has not yet enabled it — Claude Code will fail to connect to Bedrock until you enable the model or pin to one you have.'}
        </Text>
        <Box flexDirection="column">
          <Text dimColor>
            Each candidate is tested with a one-token request:
          </Text>
          {MODEL_TIERS.map(tier => {
            const state = states[tier]
            const detail =
              state === 'pending'
                ? '…'
                : state.ok
                  ? '✓'
                  : `✗ (${PROBE_ERRORS[state.reason]})`
            return (
              <Text key={tier} color={state !== 'pending' && !state.ok ? 'error' : undefined}>
                {'  '}{detail} {MODEL_LABELS[tier].padEnd(7)}→ {selected[tier]}
              </Text>
            )
          })}
        </Box>
        <Select
          options={[
            ...(hasWorking
              ? [{ label: 'Pin the working models', value: 'pin' }]
              : []),
            ...(hasWorking1m
              ? [
                  {
                    label: 'Pin the working models with 1M context',
                    value: 'pin1m',
                  },
                ]
              : []),
            { label: 'Choose different models…', value: 'manual' },
            {
              label: 'Skip — use Claude Code defaults (auto-updates)',
              value: 'skip',
            },
          ]}
          onChange={value => {
            if (value === 'pin') pinWorking()
            else if (value === 'pin1m') pinWorking(true)
            else if (value === 'manual') setManualTier('sonnet')
            else {
              onContinue({
                pinSonnet: undefined,
                pinOpus: undefined,
                pinHaiku: undefined,
              })
            }
          }}
          onCancel={onBack}
        />
      </Box>
    </WizardFrame>
  )
}

const HIDDEN_ENV_KEYS = new Set([
  'AWS_BEARER_TOKEN_BEDROCK',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
])

function ConfirmStep({
  data,
  onBack,
  onComplete,
}: {
  data: BedrockWizardData
  onBack(): void
  onComplete(message: string): void
}) {
  const [error, setError] = useState<string | null>(null)
  const env = buildBedrockEnvironment(data)
  const entries = Object.entries(env).filter(([, value]) => value !== undefined)
  function save() {
    const existing = getSettingsForSource('userSettings') ?? {}
    const result = updateSettingsForSource('userSettings', {
      ...existing,
      env: env as Record<string, string>,
    })
    if (result.error) {
      setError(result.error.message)
      return
    }
    logEvent('tengu_bedrock_setup_complete', {
      auth_method: data.authMethod,
      pinned_models: String(
        Boolean(data.pinSonnet || data.pinOpus || data.pinHaiku),
      ),
      verified: String(Boolean(data.verifiedIdentity)),
    })
    onComplete(
      `Bedrock configuration saved to ~/.claude/settings.json. Restart Claude Code to apply.${
        data.authMethod === 'profile'
          ? ` When your SSO session expires (typically 8 hours), run \`aws sso login --profile ${data.awsProfile}\` — Claude Code picks up refreshed credentials automatically.`
          : ''
      }`,
    )
  }
  return (
    <WizardFrame subtitle="Confirm and save" onBack={onBack}>
      <Box flexDirection="column" gap={1}>
        <Text>These will be written to ~/.claude/settings.json under env:</Text>
        <Box flexDirection="column">
          {entries.map(([key, value]) => (
            <Text key={key}>
              {'  '}
              <Text color="suggestion">{key}</Text> ={' '}
              {HIDDEN_ENV_KEYS.has(key) ? (
                <Text dimColor>(hidden)</Text>
              ) : (
                value
              )}
            </Text>
          ))}
        </Box>
        {data.verifiedIdentity && (
          <Text dimColor>✓ Verified as {data.verifiedIdentity}</Text>
        )}
        {error && <Text color="error">{error}</Text>}
        <Select
          options={[
            { label: 'Save', value: 'save' },
            { label: 'Cancel', value: 'cancel' },
          ]}
          onChange={value => {
            if (value === 'save') save()
            else onBack()
          }}
          onCancel={onBack}
        />
      </Box>
    </WizardFrame>
  )
}

type WizardStep =
  | 'auth'
  | 'profile'
  | 'bearer'
  | 'accessKey'
  | 'region'
  | 'verify'
  | 'models'
  | 'confirm'

export function BedrockSetupWizard({
  onComplete,
  onCancel,
}: {
  onComplete(message: string): void
  onCancel(): void
}) {
  const [step, setStep] = useState<WizardStep>('auth')
  const [history, setHistory] = useState<WizardStep[]>([])
  const [data, setData] = useState<BedrockWizardData>({})
  function goTo(next: WizardStep, update?: Partial<BedrockWizardData>) {
    if (update) setData(current => ({ ...current, ...update }))
    setHistory(current => [...current, step])
    setStep(next)
  }
  function goBack() {
    const previous = history.at(-1)
    if (!previous) {
      onCancel()
      return
    }
    setHistory(current => current.slice(0, -1))
    setStep(previous)
  }
  switch (step) {
    case 'auth':
      return (
        <AuthMethodStep
          onBack={onCancel}
          onSelect={authMethod => {
            const next: Record<BedrockAuthMethod, WizardStep> = {
              profile: 'profile',
              bearer: 'bearer',
              accessKey: 'accessKey',
              environment: 'region',
            }
            goTo(next[authMethod], { authMethod })
          }}
        />
      )
    case 'profile':
      return (
        <ProfileStep
          data={data}
          onBack={goBack}
          onSubmit={awsProfile => goTo('region', { awsProfile })}
        />
      )
    case 'bearer':
      return (
        <InputStep
          subtitle="Bedrock API key"
          description="Paste your Bedrock API key."
          hint="Generate one in the AWS console under Bedrock → API keys."
          placeholder="bedrock-api-key-…"
          initialValue={data.bearerToken}
          requiredMessage="API key is required"
          mask="*"
          onBack={goBack}
          onSubmit={bearerToken => goTo('region', { bearerToken })}
        />
      )
    case 'accessKey':
      return (
        <AccessKeyStep
          data={data}
          onBack={goBack}
          onSubmit={credentials => goTo('region', credentials)}
        />
      )
    case 'region':
      return (
        <InputStep
          subtitle="AWS region"
          description="Where your Bedrock models are enabled."
          hint="Claude Code reads this from AWS_REGION, not ~/.aws/config — set it explicitly even if your profile has a region."
          placeholder="us-east-1"
          initialValue={data.region ?? process.env.AWS_REGION ?? 'us-east-1'}
          requiredMessage="Region is required"
          onBack={goBack}
          onSubmit={region => goTo('verify', { region })}
        />
      )
    case 'verify':
      return (
        <VerificationStep
          data={data}
          onBack={goBack}
          onContinue={result =>
            goTo('models', {
              verifiedIdentity: result?.identity,
              discoveredProfiles: result?.profiles ?? [],
            })
          }
        />
      )
    case 'models':
      return (
        <PinModelsStep
          data={data}
          onBack={goBack}
          onContinue={pins => goTo('confirm', pins)}
        />
      )
    case 'confirm':
      return (
        <ConfirmStep
          data={data}
          onBack={goBack}
          onComplete={onComplete}
        />
      )
  }
}
