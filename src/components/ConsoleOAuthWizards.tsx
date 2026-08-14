import React, { useEffect, useMemo, useRef, useState } from 'react'
import { readFile, readdir } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { logEvent } from '../services/analytics/index.js'
import { buildVertexGoogleAuth, getVertexApiBaseUrl } from '../services/api/vertexAuth.js'
import { Box, Text } from '../ink.js'
import { useKeybinding } from '../keybindings/useKeybinding.js'
import { getDisplayPath } from '../utils/file.js'
import { modelSupports1M } from '../utils/context.js'
import {
  applyBedrockRegionPrefix,
  findFirstMatch,
} from '../utils/model/bedrock.js'
import { ALL_MODEL_CONFIGS } from '../utils/model/configs.js'
import {
  getSettingsFilePathForSource,
  updateSettingsForSource,
} from '../utils/settings/settings.js'
import {
  getAWSClientProxyConfig,
  getProxyFetchOptions,
} from '../utils/proxy.js'
import { Select } from './CustomSelect/select.js'
import { StatusIcon } from './design-system/StatusIcon.js'
import { Spinner } from './Spinner.js'
import TextInput from './TextInput.js'
import { WizardDialogLayout } from './wizard/WizardDialogLayout.js'
import { WizardProvider } from './wizard/WizardProvider.js'
import { useWizard } from './wizard/useWizard.js'

type ModelTier = 'sonnet' | 'opus' | 'haiku'
type AuthMethodResult =
  | { ok: true }
  | {
      ok: false
      reason: 'auth' | 'permission' | 'model' | 'network' | 'other'
    }
type ProbeState = 'pending' | AuthMethodResult

const MODEL_TIERS: ModelTier[] = ['sonnet', 'opus', 'haiku']
const MODEL_TIER_LABELS: Record<ModelTier, string> = {
  sonnet: 'Sonnet',
  opus: 'Opus',
  haiku: 'Haiku',
}
const MODEL_ENV_KEYS: Record<ModelTier, string> = {
  sonnet: 'ANTHROPIC_DEFAULT_SONNET_MODEL',
  opus: 'ANTHROPIC_DEFAULT_OPUS_MODEL',
  haiku: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
}
const DEFAULT_MODEL_KEYS: Record<ModelTier, keyof typeof ALL_MODEL_CONFIGS> = {
  sonnet: 'sonnet45',
  opus: 'opus46',
  haiku: 'haiku45',
}
const PROBE_ERROR_LABELS = {
  Bedrock: {
    auth: 'auth failed',
    permission: 'no InvokeModel permission',
    model: 'not enabled in this account',
    network: 'unreachable',
    other: 'request failed',
  },
  'Vertex AI': {
    auth: 'auth failed',
    permission: 'no aiplatform.endpoints.predict permission',
    model: 'not enabled in this project',
    network: 'unreachable',
    other: 'request failed',
  },
} as const

type BedrockWizardData = Record<string, unknown> & {
  authMethod?: 'profile' | 'bearer' | 'accessKey' | 'environment'
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

type VertexWizardData = Record<string, unknown> & {
  authMethod?: 'adc' | 'serviceAccount' | 'environment'
  keyFile?: string
  projectId?: string
  region?: string
  verifiedIdentity?: string
  pinSonnet?: string
  pinOpus?: string
  pinHaiku?: string
}

type VerifyResult =
  | {
      status: 'ok'
      identity: string
      note?: string
      profiles?: string[]
    }
  | { status: 'error'; error: string; command?: string }

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`
}

function InputFooter(): React.ReactNode {
  return <Text>Enter to continue · Esc to go back</Text>
}

function ErrorLine({ error }: { error: string | null }): React.ReactNode {
  return error ? (
    <Box marginTop={1}>
      <Text color="error">{error}</Text>
    </Box>
  ) : null
}

function LoadingStep({
  subtitle,
  message,
  detail,
}: {
  subtitle: string
  message: string
  detail?: string
}): React.ReactNode {
  return (
    <WizardDialogLayout subtitle={subtitle}>
      <Box flexDirection="column">
        <Box>
          <Spinner />
          <Text> {message}</Text>
        </Box>
        {detail ? <Text dimColor>{detail}</Text> : null}
      </Box>
    </WizardDialogLayout>
  )
}

function ConfirmChoice({
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  cancelFirst = false,
}: {
  confirmLabel: string
  cancelLabel: string
  onConfirm(): void
  onCancel(): void
  cancelFirst?: boolean
}): React.ReactNode {
  const confirm = { label: confirmLabel, value: 'confirm' }
  const cancel = { label: cancelLabel, value: 'cancel' }
  return (
    <Select
      options={cancelFirst ? [cancel, confirm] : [confirm, cancel]}
      defaultFocusValue={cancelFirst ? 'cancel' : 'confirm'}
      onChange={value => (value === 'confirm' ? onConfirm() : onCancel())}
      onCancel={onCancel}
    />
  )
}

function classifyProbeError(error: unknown): AuthMethodResult {
  const status = (error as { status?: number } | undefined)?.status
  if (status === 401) return { ok: false, reason: 'auth' }
  if (status === 403) return { ok: false, reason: 'permission' }
  if (status === 400 || status === 404) {
    return { ok: false, reason: 'model' }
  }
  if (status === 429) return { ok: true }
  if (status === undefined) return { ok: false, reason: 'network' }
  return { ok: false, reason: 'other' }
}

function getPinUpdates(
  selected: Record<ModelTier, string>,
  results: Record<ModelTier, ProbeState>,
  add1m: boolean,
): Pick<
  BedrockWizardData,
  'pinSonnet' | 'pinOpus' | 'pinHaiku'
> {
  const working = (tier: ModelTier): string | undefined => {
    const result = results[tier]
    if (result === 'pending' || !result.ok) return undefined
    const model = selected[tier]
    return add1m && modelSupports1M(model) && !/\[1m\]$/i.test(model)
      ? `${model}[1m]`
      : model
  }
  return {
    pinSonnet: working('sonnet'),
    pinOpus: working('opus'),
    pinHaiku: working('haiku'),
  }
}

function ModelResultLine({
  provider,
  tier,
  model,
  state,
}: {
  provider: keyof typeof PROBE_ERROR_LABELS
  tier: ModelTier
  model: string
  state: ProbeState
}): React.ReactNode {
  const label = MODEL_TIER_LABELS[tier].padEnd(7)
  if (state === 'pending') {
    return (
      <Box>
        <Text>  </Text>
        <Spinner />
        <Text> {label}→ {model}</Text>
      </Box>
    )
  }
  if (state.ok) {
    return (
      <Text>
        {'  '}
        <StatusIcon status="success" withSpace />
        {label}→ <Text color="success">{model}</Text>
      </Text>
    )
  }
  return (
    <Text>
      {'  '}
      <StatusIcon status="error" withSpace />
      {label}→ <Text dimColor>{model}</Text>{' '}
      <Text color="error">({PROBE_ERROR_LABELS[provider][state.reason]})</Text>
    </Text>
  )
}

function ModelOptionLabel({
  provider,
  model,
  state,
  suffix,
}: {
  provider: keyof typeof PROBE_ERROR_LABELS
  model: string
  state: ProbeState
  suffix?: string
}): React.ReactNode {
  if (state === 'pending') {
    return (
      <Text>
        <StatusIcon status="pending" withSpace />
        {model}
        {suffix ? <Text dimColor> {suffix}</Text> : null}
      </Text>
    )
  }
  if (state.ok) {
    return (
      <Text>
        <StatusIcon status="success" withSpace />
        {model}
        {suffix ? <Text dimColor> {suffix}</Text> : null}
      </Text>
    )
  }
  return (
    <Text dimColor>
      <StatusIcon status="error" withSpace />
      {model}
      {suffix ? ` ${suffix}` : ''}{' '}
      <Text color="error">({PROBE_ERROR_LABELS[provider][state.reason]})</Text>
    </Text>
  )
}

function ManualModelPicker({
  provider,
  tier,
  candidates,
  current,
  existingPin,
  fallback,
  probe,
  onPick,
  onCancel,
  description,
}: {
  provider: keyof typeof PROBE_ERROR_LABELS
  tier: ModelTier
  candidates: string[]
  current: string
  existingPin?: string
  fallback: string
  probe(model: string): Promise<AuthMethodResult>
  onPick(model: string): void
  onCancel(): void
  description: string
}): React.ReactNode {
  const [states, setStates] = useState<Record<string, ProbeState>>(() =>
    Object.fromEntries(candidates.map(model => [model, 'pending'])),
  )
  const candidatesKey = candidates.join('\0')
  useEffect(() => {
    let cancelled = false
    for (const model of candidates) {
      void probe(model).then(result => {
        if (!cancelled) {
          setStates(previous => ({ ...previous, [model]: result }))
        }
      })
    }
    return () => {
      cancelled = true
    }
  }, [candidatesKey, probe])

  const settled = candidates.every(model => states[model] !== 'pending')
  const works = (model: string): boolean => {
    const state = states[model]
    return state !== undefined && state !== 'pending' && state.ok
  }
  const sorted = settled
    ? [...candidates].sort(
        (left, right) => Number(works(right)) - Number(works(left)),
      )
    : candidates
  const defaultValue = settled
    ? works(current)
      ? current
      : works(fallback)
        ? fallback
        : sorted.find(works)
    : current
  const options = sorted.map(model => ({
    value: model,
    label: (
      <ModelOptionLabel
        provider={provider}
        model={model}
        state={states[model] ?? 'pending'}
        suffix={
          model === existingPin
            ? '(currently pinned)'
            : model === fallback
              ? '(built-in default)'
              : model === current
                ? '(selected)'
                : undefined
        }
      />
    ),
  }))
  return (
    <WizardDialogLayout subtitle={`Pin ${MODEL_TIER_LABELS[tier]} model`}>
      <Box flexDirection="column" gap={1}>
        <Text dimColor>{description}</Text>
        <Select
          key={settled ? 'settled' : 'pending'}
          options={options}
          defaultValue={defaultValue}
          onChange={onPick}
          onCancel={onCancel}
        />
      </Box>
    </WizardDialogLayout>
  )
}

function ModelPinStep({
  provider,
  initial,
  existing,
  candidatesForTier,
  probe,
  onComplete,
  onCancel,
}: {
  provider: 'Bedrock' | 'Vertex AI'
  initial: Record<ModelTier, string>
  existing: Partial<Record<ModelTier, string>>
  candidatesForTier(tier: ModelTier): string[]
  probe(model: string): Promise<AuthMethodResult>
  onComplete(
    pins: Pick<
      BedrockWizardData,
      'pinSonnet' | 'pinOpus' | 'pinHaiku'
    >,
  ): void
  onCancel(): void
}): React.ReactNode {
  const [selected, setSelected] = useState(initial)
  const [results, setResults] = useState<Record<ModelTier, ProbeState>>({
    sonnet: 'pending',
    opus: 'pending',
    haiku: 'pending',
  })
  const [pickingTier, setPickingTier] = useState<ModelTier | null>(null)

  useEffect(() => {
    let cancelled = false
    setResults(previous => ({ ...previous, sonnet: 'pending' }))
    void probe(selected.sonnet).then(result => {
      if (!cancelled) setResults(previous => ({ ...previous, sonnet: result }))
    })
    return () => {
      cancelled = true
    }
  }, [probe, selected.sonnet])
  useEffect(() => {
    let cancelled = false
    setResults(previous => ({ ...previous, opus: 'pending' }))
    void probe(selected.opus).then(result => {
      if (!cancelled) setResults(previous => ({ ...previous, opus: result }))
    })
    return () => {
      cancelled = true
    }
  }, [probe, selected.opus])
  useEffect(() => {
    let cancelled = false
    setResults(previous => ({ ...previous, haiku: 'pending' }))
    void probe(selected.haiku).then(result => {
      if (!cancelled) setResults(previous => ({ ...previous, haiku: result }))
    })
    return () => {
      cancelled = true
    }
  }, [probe, selected.haiku])

  if (pickingTier) {
    const candidates = candidatesForTier(pickingTier)
    return (
      <ManualModelPicker
        key={pickingTier}
        provider={provider}
        tier={pickingTier}
        candidates={candidates}
        current={selected[pickingTier]}
        existingPin={existing[pickingTier]}
        fallback={initial[pickingTier]}
        probe={probe}
        description={
          provider === 'Bedrock'
            ? `${candidates.filter(model => model.toLowerCase().includes(pickingTier)).length} ${MODEL_TIER_LABELS[pickingTier]} ${plural(candidates.length, 'profile')} in your account · each tested with a one-token request.`
            : `Available ${MODEL_TIER_LABELS[pickingTier]} versions on Vertex AI · each tested with a one-token request.`
        }
        onPick={model => {
          setSelected(previous => ({ ...previous, [pickingTier]: model }))
          const next = MODEL_TIERS[MODEL_TIERS.indexOf(pickingTier) + 1]
          setPickingTier(next ?? null)
        }}
        onCancel={() => setPickingTier(null)}
      />
    )
  }

  const settled = MODEL_TIERS.every(tier => results[tier] !== 'pending')
  const hasWorking =
    settled &&
    MODEL_TIERS.some(tier => {
      const result = results[tier]
      return result !== 'pending' && result.ok
    })
  const supports1m =
    hasWorking &&
    MODEL_TIERS.some(tier => {
      const result = results[tier]
      return (
        result !== 'pending' &&
        result.ok &&
        modelSupports1M(selected[tier])
      )
    })
  const options = [
    ...(hasWorking
      ? [{ label: 'Pin the working models', value: 'pin' }]
      : []),
    ...(supports1m
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
  ]
  return (
    <WizardDialogLayout subtitle="Pin model versions">
      <Box flexDirection="column" gap={1}>
        <Text>
          {provider === 'Bedrock'
            ? 'Without pinning, Claude Code uses its built-in defaults. When a new model ships, your install will try to call it even if your account has not yet enabled it — Claude Code will fail to connect to Bedrock until you enable the model or pin to one you have.'
            : 'Without pinning, Claude Code uses its built-in defaults. When a new model ships, your install will try to call it even if it is not yet available in your project — Claude Code will fail to connect to Vertex AI until you enable the model or pin to one you have.'}
        </Text>
        <Box flexDirection="column">
          <Text dimColor>Each candidate is tested with a one-token request:</Text>
          {MODEL_TIERS.map(tier => (
            <ModelResultLine
              key={tier}
              provider={provider}
              tier={tier}
              model={selected[tier]}
              state={results[tier]}
            />
          ))}
        </Box>
        <Select
          options={options}
          onChange={value => {
            if (value === 'manual') {
              setPickingTier('sonnet')
              return
            }
            if (value === 'pin' || value === 'pin1m') {
              onComplete(getPinUpdates(selected, results, value === 'pin1m'))
            } else {
              onComplete({
                pinSonnet: undefined,
                pinOpus: undefined,
                pinHaiku: undefined,
              })
            }
          }}
          onCancel={onCancel}
        />
      </Box>
    </WizardDialogLayout>
  )
}

const BEDROCK_STEPS = {
  AUTH_METHOD: 0,
  PROFILE: 1,
  BEARER: 2,
  ACCESS_KEY: 3,
  REGION: 4,
  VERIFY: 5,
  PIN_MODELS: 6,
  CONFIRM: 7,
} as const

function getBedrockDefaults(region: string): Record<ModelTier, string> {
  const prefix = region.startsWith('us-') && !region.startsWith('us-gov-')
    ? 'us'
    : region.startsWith('eu-')
      ? 'eu'
      : region.startsWith('ap-')
        ? 'apac'
        : 'global'
  return Object.fromEntries(
    MODEL_TIERS.map(tier => [
      tier,
      applyBedrockRegionPrefix(
        ALL_MODEL_CONFIGS[DEFAULT_MODEL_KEYS[tier]].bedrock,
        prefix,
      ),
    ]),
  ) as Record<ModelTier, string>
}

async function readAwsProfiles(): Promise<string[]> {
  const profiles = new Set<string>()
  for (const { path, regex } of [
    {
      path: join(homedir(), '.aws', 'config'),
      regex: /^\[(?:profile\s+)?([^\]]+)\]/gm,
    },
    {
      path: join(homedir(), '.aws', 'credentials'),
      regex: /^\[([^\]]+)\]/gm,
    },
  ]) {
    try {
      const contents = await readFile(path, 'utf8')
      for (const match of contents.matchAll(regex)) {
        const profile = match[1]?.trim()
        if (profile && !profile.startsWith('sso-session ')) profiles.add(profile)
      }
    } catch {
      // Missing/unreadable AWS files simply mean there are no discoverable profiles.
    }
  }
  return [...profiles].sort()
}

async function getBedrockCredentialsProvider(data: BedrockWizardData) {
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
    default:
      return undefined
  }
}

async function createBedrockWizardClient(data: BedrockWizardData) {
  const [{ AnthropicBedrock }] = await Promise.all([
    import('@anthropic-ai/bedrock-sdk'),
  ])
  const region = data.region!
  const baseOptions = {
    awsRegion: region,
    maxRetries: 0,
    fetchOptions: getProxyFetchOptions({
      url:
        process.env.ANTHROPIC_BEDROCK_BASE_URL ||
        `https://bedrock-runtime.${region}.amazonaws.com`,
    }),
  }
  if (data.authMethod === 'bearer') {
    return new AnthropicBedrock({ ...baseOptions, apiKey: data.bearerToken })
  }
  const provider = await getBedrockCredentialsProvider(data)
  if (provider) {
    const credentials = await provider()
    return new AnthropicBedrock({
      ...baseOptions,
      awsAccessKey: credentials.accessKeyId,
      awsSecretKey: credentials.secretAccessKey,
      awsSessionToken: credentials.sessionToken,
    })
  }
  return new AnthropicBedrock(baseOptions)
}

async function probeBedrockModel(
  data: BedrockWizardData,
  model: string,
): Promise<AuthMethodResult> {
  let client
  try {
    client = await createBedrockWizardClient(data)
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
    return classifyProbeError(error)
  }
}

function formatBedrockVerificationError(
  error: unknown,
  data: BedrockWizardData,
): { error: string; command?: string } {
  const value = error as { name?: string; message?: string } | undefined
  const name = value?.name ?? 'Error'
  const message = value?.message ?? String(error)
  const ssoCommand =
    data.authMethod === 'profile'
      ? `aws sso login --profile ${data.awsProfile}`
      : undefined
  switch (name) {
    case 'CredentialsProviderError':
      return data.authMethod === 'profile'
        ? {
            error: `Could not load credentials for profile "${data.awsProfile}". If this is an SSO profile, run:`,
            command: ssoCommand,
          }
        : { error: `No AWS credentials found. ${message}` }
    case 'ExpiredTokenException':
    case 'TokenRefreshRequired':
      return data.authMethod === 'profile'
        ? { error: 'SSO session expired. Run:', command: ssoCommand }
        : { error: `Credentials expired. ${message}` }
    case 'ForbiddenException':
      return data.authMethod === 'profile'
        ? {
            error: `SSO portal denied access to the role for profile "${data.awsProfile}". The permission set may have been revoked — check your AWS access portal.`,
          }
        : { error: `Forbidden. ${message}` }
    case 'AccessDeniedException':
      return {
        error: `Access denied. Your IAM role needs bedrock:ListInferenceProfiles permission. ${message}`,
      }
    case 'UnrecognizedClientException':
    case 'InvalidSignatureException':
      return { error: `Invalid credentials. ${message}` }
    case 'UnknownEndpoint':
    case 'ENOTFOUND':
      return {
        error: `Cannot reach AWS in region "${data.region}". Check the region name and your network.`,
      }
    default:
      return { error: `${name}: ${message}` }
  }
}

async function verifyBedrock(data: BedrockWizardData): Promise<VerifyResult> {
  if (data.authMethod === 'bearer') {
    const model = getBedrockDefaults(data.region!).haiku
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

  try {
    const provider = await getBedrockCredentialsProvider(data)
    const clientConfig = {
      ...(await getAWSClientProxyConfig({
        url: `https://bedrock.${data.region}.amazonaws.com`,
      })),
      region: data.region!,
      ...(provider && { credentials: provider }),
    }
    const [{ STSClient, GetCallerIdentityCommand }, { BedrockClient, ListInferenceProfilesCommand }] =
      await Promise.all([
        import('@aws-sdk/client-sts'),
        import('@aws-sdk/client-bedrock'),
      ])
    const identity = await new STSClient(clientConfig).send(
      new GetCallerIdentityCommand({}),
    )
    const displayIdentity = identity.Arn ?? identity.UserId ?? '(unknown)'
    const client = new BedrockClient(clientConfig)
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
    return { status: 'ok', identity: displayIdentity, profiles }
  } catch (error) {
    return { status: 'error', ...formatBedrockVerificationError(error, data) }
  }
}

function BedrockAuthStep(): React.ReactNode {
  const { goBack, goToStep, updateWizardData } =
    useWizard<BedrockWizardData>()
  const destinations = {
    profile: BEDROCK_STEPS.PROFILE,
    bearer: BEDROCK_STEPS.BEARER,
    accessKey: BEDROCK_STEPS.ACCESS_KEY,
    environment: BEDROCK_STEPS.REGION,
  }
  return (
    <WizardDialogLayout subtitle="How do you authenticate to AWS?">
      <Box flexDirection="column" gap={1}>
        <Text dimColor>
          Claude Code uses the standard AWS credential chain. Pick the method
          you already use with the AWS CLI.
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
          onChange={value => {
            const authMethod = value as BedrockWizardData['authMethod']
            updateWizardData({ authMethod })
            goToStep(destinations[authMethod!])
          }}
          onCancel={goBack}
        />
      </Box>
    </WizardDialogLayout>
  )
}

function BedrockProfileStep(): React.ReactNode {
  const { goBack, goToStep, updateWizardData, wizardData } =
    useWizard<BedrockWizardData>()
  const [profiles, setProfiles] = useState<string[] | null>(null)
  useEffect(() => {
    let cancelled = false
    void readAwsProfiles().then(value => {
      if (!cancelled) setProfiles(value)
    })
    return () => {
      cancelled = true
    }
  }, [])
  if (!profiles) {
    return (
      <LoadingStep subtitle="AWS profile" message="Reading ~/.aws/config…" />
    )
  }
  return (
    <BedrockProfileReady
      profiles={profiles}
      initialProfile={wizardData.awsProfile}
      onCancel={goBack}
      onSelect={profile => {
        updateWizardData({ awsProfile: profile })
        goToStep(BEDROCK_STEPS.REGION)
      }}
    />
  )
}

function BedrockProfileReady({
  profiles,
  initialProfile,
  onSelect,
  onCancel,
}: {
  profiles: string[]
  initialProfile?: string
  onSelect(profile: string): void
  onCancel(): void
}): React.ReactNode {
  const tooMany = profiles.length > 12
  const initialIsCustom = Boolean(
    initialProfile && !profiles.includes(initialProfile),
  )
  const suggested = tooMany
    ? profiles.find(profile => profile.toLowerCase().includes('bedrock'))
    : undefined
  const [manual, setManual] = useState(
    profiles.length === 0 || tooMany || initialIsCustom,
  )
  const [value, setValue] = useState(initialProfile ?? suggested ?? '')
  const [cursor, setCursor] = useState(value.length)
  const [error, setError] = useState<string | null>(null)
  useKeybinding('confirm:no', onCancel, {
    context: 'Settings',
    isActive: manual,
  })
  if (!manual) {
    const options = [
      ...profiles.map(profile => ({ label: profile, value: profile })),
      { label: 'Type a different name…', value: '__manual__' },
    ]
    return (
      <WizardDialogLayout subtitle="AWS profile">
        <Box flexDirection="column" gap={1}>
          <Text dimColor>
            Found {profiles.length} {plural(profiles.length, 'profile')} in
            ~/.aws/config and ~/.aws/credentials.
          </Text>
          <Select
            options={options}
            defaultValue={
              initialProfile && profiles.includes(initialProfile)
                ? initialProfile
                : undefined
            }
            onChange={profile => {
              if (profile === '__manual__') setManual(true)
              else onSelect(profile)
            }}
            onCancel={onCancel}
          />
        </Box>
      </WizardDialogLayout>
    )
  }
  const submit = (): void => {
    const profile = value.trim()
    if (!profile) {
      setError('Profile name is required')
      return
    }
    setError(null)
    onSelect(profile)
  }
  return (
    <WizardDialogLayout subtitle="AWS profile name" footerText={<InputFooter />}>
      <Box flexDirection="column">
        <Text>The name from ~/.aws/config (after [profile …]).</Text>
        {tooMany ? (
          <Text dimColor>
            Found {profiles.length} profiles — too many to list.
            {suggested ? ` Prepopulated with "${suggested}".` : ''}
          </Text>
        ) : null}
        <Text dimColor>
          If this is an SSO profile, run `aws sso login --profile NAME` first.
        </Text>
        <Box marginTop={1}>
          <TextInput
            value={value}
            onChange={setValue}
            onSubmit={submit}
            placeholder="my-bedrock-profile"
            columns={60}
            cursorOffset={cursor}
            onChangeCursorOffset={setCursor}
            focus
            showCursor
          />
        </Box>
        <ErrorLine error={error} />
      </Box>
    </WizardDialogLayout>
  )
}

function BedrockBearerStep(): React.ReactNode {
  const { goBack, goToStep, updateWizardData, wizardData } =
    useWizard<BedrockWizardData>()
  const [value, setValue] = useState(wizardData.bearerToken ?? '')
  const [cursor, setCursor] = useState(value.length)
  const [error, setError] = useState<string | null>(null)
  useKeybinding('confirm:no', goBack, { context: 'Settings' })
  const submit = (): void => {
    const token = value.trim()
    if (!token) {
      setError('API key is required')
      return
    }
    setError(null)
    updateWizardData({ bearerToken: token })
    goToStep(BEDROCK_STEPS.REGION)
  }
  return (
    <WizardDialogLayout subtitle="Bedrock API key" footerText={<InputFooter />}>
      <Box flexDirection="column">
        <Text>Paste your Bedrock API key.</Text>
        <Text dimColor>
          Generate one in the AWS console under Bedrock → API keys.
        </Text>
        <Box marginTop={1}>
          <TextInput
            value={value}
            onChange={setValue}
            onSubmit={submit}
            placeholder="bedrock-api-key-…"
            mask="*"
            columns={60}
            cursorOffset={cursor}
            onChangeCursorOffset={setCursor}
            focus
            showCursor
          />
        </Box>
        <ErrorLine error={error} />
      </Box>
    </WizardDialogLayout>
  )
}

function BedrockAccessKeyStep(): React.ReactNode {
  const { goBack, goNext, updateWizardData, wizardData } =
    useWizard<BedrockWizardData>()
  const fields = [
    {
      key: 'accessKeyId' as const,
      label: 'Access key ID',
      placeholder: 'AKIA…',
      mask: undefined,
      required: true,
    },
    {
      key: 'secretAccessKey' as const,
      label: 'Secret access key',
      placeholder: '',
      mask: '*',
      required: true,
    },
    {
      key: 'sessionToken' as const,
      label: 'Session token',
      placeholder: '',
      mask: '*',
      required: false,
    },
  ]
  const [index, setIndex] = useState(0)
  const [values, setValues] = useState({
    accessKeyId: wizardData.accessKeyId ?? '',
    secretAccessKey: wizardData.secretAccessKey ?? '',
    sessionToken: wizardData.sessionToken ?? '',
  })
  const field = fields[index]!
  const value = values[field.key]
  const [cursor, setCursor] = useState(value.length)
  const [error, setError] = useState<string | null>(null)
  useKeybinding(
    'confirm:no',
    () => {
      if (index > 0) {
        setIndex(previous => previous - 1)
        setError(null)
      } else goBack()
    },
    { context: 'Settings' },
  )
  const submit = (): void => {
    if (field.required && !value.trim()) {
      setError(`${field.label} is required`)
      return
    }
    setError(null)
    if (index < fields.length - 1) {
      const next = fields[index + 1]!
      setIndex(previous => previous + 1)
      setCursor(values[next.key].length)
      return
    }
    updateWizardData({
      accessKeyId: values.accessKeyId.trim(),
      secretAccessKey: values.secretAccessKey.trim(),
      sessionToken: values.sessionToken.trim() || undefined,
    })
    goNext()
  }
  return (
    <WizardDialogLayout
      title="Set up AWS Bedrock"
      subtitle="AWS access keys"
      footerText={<InputFooter />}
    >
      <Box flexDirection="column">
        {fields.map((item, itemIndex) => (
          <Text key={item.key} dimColor={itemIndex !== index}>
            {itemIndex === index ? '› ' : '  '}
            {item.label}
            {item.required ? '*' : ' '}{' '}
            {itemIndex < index
              ? item.mask
                ? item.mask.repeat(Math.min(values[item.key].length, 60))
                : values[item.key]
              : ''}
          </Text>
        ))}
        {field.key === 'sessionToken' ? (
          <Text dimColor>
            Only needed for temporary credentials from STS. Leave empty for
            long-lived keys.
          </Text>
        ) : null}
        <Box marginTop={1}>
          <TextInput
            key={field.key}
            value={value}
            onChange={next =>
              setValues(previous => ({ ...previous, [field.key]: next }))
            }
            onSubmit={submit}
            placeholder={field.placeholder}
            mask={field.mask}
            columns={60}
            cursorOffset={cursor}
            onChangeCursorOffset={setCursor}
            focus
            showCursor
          />
        </Box>
        <ErrorLine error={error} />
      </Box>
    </WizardDialogLayout>
  )
}

function BedrockRegionStep(): React.ReactNode {
  const { goBack, goNext, updateWizardData, wizardData } =
    useWizard<BedrockWizardData>()
  const [value, setValue] = useState(wizardData.region ?? 'us-east-1')
  const [cursor, setCursor] = useState(value.length)
  const [error, setError] = useState<string | null>(null)
  useKeybinding('confirm:no', goBack, { context: 'Settings' })
  const submit = (): void => {
    const region = value.trim()
    if (!region) {
      setError('Region is required')
      return
    }
    setError(null)
    updateWizardData({ region })
    goNext()
  }
  return (
    <WizardDialogLayout subtitle="AWS region" footerText={<InputFooter />}>
      <Box flexDirection="column">
        <Text>Where your Bedrock models are enabled.</Text>
        <Text dimColor>
          Claude Code reads this from AWS_REGION, not ~/.aws/config — set it
          explicitly even if your profile has a region.
        </Text>
        <Box marginTop={1}>
          <TextInput
            value={value}
            onChange={setValue}
            onSubmit={submit}
            placeholder="us-east-1"
            columns={40}
            cursorOffset={cursor}
            onChangeCursorOffset={setCursor}
            focus
            showCursor
          />
        </Box>
        <ErrorLine error={error} />
      </Box>
    </WizardDialogLayout>
  )
}

function BedrockVerifyStep(): React.ReactNode {
  const { goBack, goNext, updateWizardData, wizardData } =
    useWizard<BedrockWizardData>()
  const [result, setResult] = useState<VerifyResult | null>(null)
  useEffect(() => {
    let cancelled = false
    void verifyBedrock(wizardData).then(value => {
      if (cancelled) return
      if (value.status === 'ok') {
        updateWizardData({
          verifiedIdentity: value.identity,
          discoveredProfiles: value.profiles ?? [],
        })
      } else {
        updateWizardData({
          verifiedIdentity: undefined,
          discoveredProfiles: undefined,
        })
      }
      setResult(value)
    })
    return () => {
      cancelled = true
    }
  }, [])
  if (!result) {
    return (
      <LoadingStep
        subtitle="Verifying credentials"
        message={
          wizardData.authMethod === 'bearer'
            ? 'Sending a test request to Bedrock…'
            : 'Calling AWS STS and Bedrock…'
        }
        detail="This may take a few seconds."
      />
    )
  }
  if (result.status === 'ok') {
    const profiles = result.profiles ?? []
    return (
      <WizardDialogLayout subtitle="Verification">
        <Box flexDirection="column" gap={1}>
          <Text>
            <StatusIcon status="success" withSpace />
            Authenticated as <Text bold>{result.identity}</Text>
          </Text>
          <Text dimColor>
            {result.note ??
              (profiles.length > 0
                ? `Found ${profiles.length} Anthropic inference ${plural(profiles.length, 'profile')} in this region.`
                : 'No Anthropic inference profiles found in this region. You may still proceed — model defaults will use the built-in IDs.')}
          </Text>
          <Select
            options={[{ label: 'Continue', value: 'continue' }]}
            onChange={goNext}
            onCancel={goBack}
          />
        </Box>
      </WizardDialogLayout>
    )
  }
  return (
    <WizardDialogLayout subtitle="Verification failed" color="error">
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text>
            <StatusIcon status="error" withSpace />
            {result.error}
          </Text>
          {result.command ? (
            <Text bold color="suggestion">    {result.command}</Text>
          ) : null}
        </Box>
        <ConfirmChoice
          cancelFirst
          confirmLabel="Save anyway (skip verification)"
          cancelLabel="Go back and fix"
          onConfirm={goNext}
          onCancel={goBack}
        />
      </Box>
    </WizardDialogLayout>
  )
}

function BedrockPinModelsStep(): React.ReactNode {
  const { goBack, goNext, updateWizardData, wizardData } =
    useWizard<BedrockWizardData>()
  const defaults = useMemo(
    () => getBedrockDefaults(wizardData.region!),
    [wizardData.region],
  )
  const existing = useMemo(
    () =>
      Object.fromEntries(
        MODEL_TIERS.map(tier => [
          tier,
          process.env[MODEL_ENV_KEYS[tier]]?.trim() || undefined,
        ]),
      ) as Partial<Record<ModelTier, string>>,
    [],
  )
  const initial = useMemo(
    () =>
      Object.fromEntries(
        MODEL_TIERS.map(tier => [
          tier,
          existing[tier] ??
            findFirstMatch(
              wizardData.discoveredProfiles ?? [],
              ALL_MODEL_CONFIGS[DEFAULT_MODEL_KEYS[tier]].firstParty,
            ) ??
            defaults[tier],
        ]),
      ) as Record<ModelTier, string>,
    [defaults, existing, wizardData.discoveredProfiles],
  )
  const probe = React.useCallback(
    (model: string) => probeBedrockModel(wizardData, model),
    [wizardData],
  )
  return (
    <ModelPinStep
      provider="Bedrock"
      initial={initial}
      existing={existing}
      candidatesForTier={tier => {
        const candidates = (wizardData.discoveredProfiles ?? [])
          .filter(model => model.toLowerCase().includes(tier))
          .sort()
          .reverse()
        for (const model of [defaults[tier], initial[tier], existing[tier]]) {
          if (model && !candidates.includes(model)) candidates.push(model)
        }
        return candidates
      }}
      probe={probe}
      onComplete={pins => {
        updateWizardData(pins)
        goNext()
      }}
      onCancel={goBack}
    />
  )
}

function buildBedrockEnvironment(data: BedrockWizardData) {
  const environment: Record<string, string | undefined> = {
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
    ANTHROPIC_SMALL_FAST_MODEL: undefined,
  }
  if (data.authMethod === 'profile') environment.AWS_PROFILE = data.awsProfile
  if (data.authMethod === 'bearer') {
    environment.AWS_BEARER_TOKEN_BEDROCK = data.bearerToken
  }
  if (data.authMethod === 'accessKey') {
    environment.AWS_ACCESS_KEY_ID = data.accessKeyId
    environment.AWS_SECRET_ACCESS_KEY = data.secretAccessKey
    if (data.sessionToken) environment.AWS_SESSION_TOKEN = data.sessionToken
  }
  if (data.pinSonnet) {
    environment.ANTHROPIC_DEFAULT_SONNET_MODEL = data.pinSonnet
  }
  if (data.pinOpus) {
    environment.ANTHROPIC_DEFAULT_OPUS_MODEL = data.pinOpus
  }
  if (data.pinHaiku) {
    environment.ANTHROPIC_DEFAULT_HAIKU_MODEL = data.pinHaiku
  }
  return environment
}

const BEDROCK_SECRET_KEYS = new Set([
  'AWS_BEARER_TOKEN_BEDROCK',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
])

function BedrockConfirmStep({
  onComplete,
}: {
  onComplete(message: string): void
}): React.ReactNode {
  const { goBack, wizardData } = useWizard<BedrockWizardData>()
  const [error, setError] = useState<string | null>(null)
  const settingsPath = getDisplayPath(
    getSettingsFilePathForSource('userSettings') ?? '~/.claude/settings.json',
  )
  const environment = buildBedrockEnvironment(wizardData)
  const entries = Object.entries(environment).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  )
  const save = (): void => {
    const result = updateSettingsForSource('userSettings', {
      env: environment,
    } as never)
    if (result.error) {
      setError(result.error.message)
      return
    }
    logEvent('tengu_bedrock_setup_complete', {
      auth_method: wizardData.authMethod,
      pinned_models: String(
        Boolean(
          wizardData.pinSonnet || wizardData.pinOpus || wizardData.pinHaiku,
        ),
      ),
      verified: String(Boolean(wizardData.verifiedIdentity)),
    })
    onComplete(
      `Bedrock configuration saved to ${settingsPath}.${
        wizardData.authMethod === 'profile'
          ? ` When your SSO session expires (typically 8 hours), run \`aws sso login --profile ${wizardData.awsProfile}\` — Claude Code picks up refreshed credentials automatically.`
          : ''
      }`,
    )
  }
  return (
    <WizardDialogLayout subtitle="Confirm and save">
      <Box flexDirection="column" gap={1}>
        <Text>These will be written to {settingsPath} under env:</Text>
        <Box flexDirection="column">
          {entries.map(([key, value]) => (
            <Text key={key}>
              {'  '}
              <Text color="suggestion">{key}</Text> ={' '}
              {BEDROCK_SECRET_KEYS.has(key) ? (
                <Text dimColor>(hidden)</Text>
              ) : (
                value
              )}
            </Text>
          ))}
        </Box>
        {wizardData.verifiedIdentity ? (
          <Text dimColor>
            <StatusIcon status="success" withSpace />
            Verified as {wizardData.verifiedIdentity}
          </Text>
        ) : null}
        <ErrorLine error={error} />
        <ConfirmChoice
          confirmLabel="Save"
          cancelLabel="Cancel"
          onConfirm={save}
          onCancel={goBack}
        />
      </Box>
    </WizardDialogLayout>
  )
}

export function BedrockSetupWizard({
  onComplete,
  onCancel,
}: {
  onComplete(message: string): void
  onCancel(): void
}): React.ReactNode {
  const completeRef = useRef(onComplete)
  completeRef.current = onComplete
  const [steps] = useState(() => [
    BedrockAuthStep,
    BedrockProfileStep,
    BedrockBearerStep,
    BedrockAccessKeyStep,
    BedrockRegionStep,
    BedrockVerifyStep,
    BedrockPinModelsStep,
    () => (
      <BedrockConfirmStep onComplete={message => completeRef.current(message)} />
    ),
  ])
  return (
    <WizardProvider
      steps={steps}
      initialData={{}}
      onComplete={() => {}}
      onCancel={onCancel}
      title="Set up AWS Bedrock"
      showStepCounter={false}
    />
  )
}

const VERTEX_STEPS = {
  AUTH_METHOD: 0,
  SERVICE_ACCOUNT: 1,
  PROJECT: 2,
  REGION: 3,
  VERIFY: 4,
  PIN_MODELS: 5,
  CONFIRM: 6,
} as const

const GCLOUD_AUTH_COMMAND = 'gcloud auth application-default login'
const GCP_CREDENTIAL_TIMEOUT_MS = 12_000

function getVertexDefaults(): Record<ModelTier, string> {
  return Object.fromEntries(
    MODEL_TIERS.map(tier => [
      tier,
      ALL_MODEL_CONFIGS[DEFAULT_MODEL_KEYS[tier]].vertex,
    ]),
  ) as Record<ModelTier, string>
}

function getVertexCandidates(tier: ModelTier): string[] {
  const candidates = new Set<string>()
  for (const config of Object.values(ALL_MODEL_CONFIGS)) {
    if (config.vertex.toLowerCase().includes(tier)) {
      candidates.add(config.vertex)
    }
  }
  return [...candidates].sort().reverse()
}

function getVertexAuthConfig(data: VertexWizardData) {
  if (data.authMethod === 'serviceAccount' && data.keyFile) {
    return { kind: 'keyFile' as const, path: data.keyFile }
  }
  return { kind: 'default' as const }
}

async function createVertexWizardClient(data: VertexWizardData) {
  const { AnthropicVertex } = await import('@anthropic-ai/vertex-sdk')
  const googleAuth = await buildVertexGoogleAuth(
    getVertexAuthConfig(data),
    data.projectId,
  )
  return new AnthropicVertex({
    region: data.region!,
    projectId: data.projectId,
    googleAuth,
    maxRetries: 0,
    timeout: 15_000,
    fetchOptions: getProxyFetchOptions({
      url:
        process.env.ANTHROPIC_VERTEX_BASE_URL ||
        getVertexApiBaseUrl(data.region),
    }),
  })
}

async function probeVertexModel(
  data: VertexWizardData,
  model: string,
): Promise<AuthMethodResult> {
  let client
  try {
    client = await createVertexWizardClient(data)
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
    return classifyProbeError(error)
  }
}

function formatVertexCredentialError(
  error: unknown,
  data: VertexWizardData,
): { error: string; command?: string } {
  const message =
    (error as { message?: string } | undefined)?.message ?? String(error)
  if (
    data.authMethod === 'serviceAccount' &&
    /ENOENT|no such file/i.test(message)
  ) {
    return { error: `Service account key file not found: ${data.keyFile}` }
  }
  if (/Could not load the default credentials/i.test(message)) {
    return data.authMethod === 'adc'
      ? {
          error: 'No Application Default Credentials found. Run:',
          command: GCLOUD_AUTH_COMMAND,
        }
      : {
          error:
            'No GCP credentials found in the environment. Set GOOGLE_APPLICATION_CREDENTIALS or run gcloud auth application-default login.',
        }
  }
  if (/invalid_grant|Token has been expired|reauth/i.test(message)) {
    if (data.authMethod === 'serviceAccount') {
      return {
        error:
          'Service account credentials have been revoked or expired. Obtain a new key file from GCP IAM (IAM → Service Accounts → Keys → Add Key).',
      }
    }
    if (data.authMethod === 'adc') {
      return {
        error: 'GCP credentials expired. Run:',
        command: GCLOUD_AUTH_COMMAND,
      }
    }
    return {
      error:
        'GCP credentials in the environment have expired or been revoked. Refresh them (gcloud auth application-default login for ADC, or replace the GOOGLE_APPLICATION_CREDENTIALS key file).',
    }
  }
  if (/Unable to detect a Project Id/i.test(message)) {
    return {
      error:
        'Could not determine a GCP project from the credentials. Go back and set the project ID explicitly.',
    }
  }
  if (/Timed out waiting for GCP/i.test(message)) {
    return {
      error:
        'Timed out resolving GCP credentials (no ADC, no key file, and no GCE metadata server).',
      ...(data.authMethod === 'adc' && { command: GCLOUD_AUTH_COMMAND }),
    }
  }
  return { error: message }
}

async function verifyVertex(data: VertexWizardData): Promise<VerifyResult> {
  let identity: string
  try {
    const googleAuth = await buildVertexGoogleAuth(
      getVertexAuthConfig(data),
      data.projectId,
    )
    const credentialRequest = (async () => {
      await (await googleAuth.getClient()).getAccessToken()
    })()
    const timeout = new Promise<never>((_resolve, reject) => {
      setTimeout(
        () => reject(new Error('Timed out waiting for GCP credentials')),
        GCP_CREDENTIAL_TIMEOUT_MS,
      )
    })
    await Promise.race([credentialRequest, timeout])
    let clientEmail: string | undefined
    try {
      clientEmail = (await googleAuth.getCredentials()).client_email
    } catch {
      clientEmail = undefined
    }
    identity =
      clientEmail ??
      (data.authMethod === 'serviceAccount'
        ? `service account (${data.keyFile})`
        : 'Application Default Credentials')
  } catch (error) {
    return { status: 'error', ...formatVertexCredentialError(error, data) }
  }

  const model = getVertexDefaults().haiku
  const result = await probeVertexModel(data, model)
  if (result.ok) {
    return {
      status: 'ok',
      identity,
      note: `Test request to ${model} succeeded.`,
    }
  }
  switch (result.reason) {
    case 'auth':
      return {
        status: 'error',
        error:
          'Got a token, but Vertex AI rejected it. The credential may lack the cloud-platform scope.',
      }
    case 'permission':
      return {
        status: 'error',
        error: `Permission denied calling Vertex AI in project "${data.projectId}". The principal needs the aiplatform.endpoints.predict permission (Vertex AI User role), and the Vertex AI API must be enabled.`,
      }
    case 'model':
      return {
        status: 'ok',
        identity,
        note: `Credentials work, but ${model} returned not-found in ${data.region}. Pin a model you have access to on the next step, or try the 'global' region.`,
      }
    case 'network':
      return {
        status: 'error',
        error: `Could not reach Vertex AI in region "${data.region}". Check the region name and your network.`,
      }
    case 'other':
      return {
        status: 'ok',
        identity,
        note: `Credentials work, but the test request to ${model} failed. You can pin a different model on the next step.`,
      }
  }
}

async function readGcloudProjects(): Promise<string[]> {
  const projects = new Set<string>()
  const configRoot =
    process.env.CLOUDSDK_CONFIG ?? join(homedir(), '.config', 'gcloud')
  try {
    const configurations = join(configRoot, 'configurations')
    for (const filename of await readdir(configurations)) {
      if (!filename.startsWith('config_')) continue
      try {
        const contents = await readFile(join(configurations, filename), 'utf8')
        for (const match of contents.matchAll(/^project\s*=\s*(\S+)/gm)) {
          const project = match[1]?.trim()
          if (project) projects.add(project)
        }
      } catch {
        // Ignore individual unreadable gcloud configurations.
      }
    }
  } catch {
    // Missing gcloud configuration is a normal manual-entry path.
  }
  try {
    const credentials = JSON.parse(
      await readFile(
        join(configRoot, 'application_default_credentials.json'),
        'utf8',
      ),
    ) as { quota_project_id?: unknown }
    if (typeof credentials.quota_project_id === 'string') {
      projects.add(credentials.quota_project_id)
    }
  } catch {
    // ADC may not exist yet.
  }
  return [...projects].sort()
}

function VertexAuthStep(): React.ReactNode {
  const { goBack, goToStep, updateWizardData, wizardData } =
    useWizard<VertexWizardData>()
  const destinations = {
    adc: VERTEX_STEPS.PROJECT,
    serviceAccount: VERTEX_STEPS.SERVICE_ACCOUNT,
    environment: VERTEX_STEPS.PROJECT,
  }
  return (
    <WizardDialogLayout subtitle="How do you authenticate to Google Cloud?">
      <Box flexDirection="column" gap={1}>
        <Text dimColor>
          Claude Code uses the standard GCP credential chain. Pick the method
          you already use with gcloud or in your deployment.
        </Text>
        <Select
          options={[
            {
              label: 'Application Default Credentials (gcloud auth)',
              value: 'adc',
            },
            {
              label: 'Service account key file',
              value: 'serviceAccount',
            },
            {
              label: 'Use credentials already in my environment',
              value: 'environment',
            },
          ]}
          defaultValue={wizardData.authMethod}
          onChange={value => {
            const authMethod = value as VertexWizardData['authMethod']
            updateWizardData({ authMethod })
            goToStep(destinations[authMethod!])
          }}
          onCancel={goBack}
        />
      </Box>
    </WizardDialogLayout>
  )
}

function VertexServiceAccountStep(): React.ReactNode {
  const { goBack, goToStep, updateWizardData, wizardData } =
    useWizard<VertexWizardData>()
  const [value, setValue] = useState(wizardData.keyFile ?? '')
  const [cursor, setCursor] = useState(value.length)
  const [error, setError] = useState<string | null>(null)
  useKeybinding('confirm:no', goBack, { context: 'Settings' })
  const submit = (): void => {
    const rawPath = value.trim()
    if (!rawPath) {
      setError('Path is required')
      return
    }
    setError(null)
    const keyFile =
      rawPath === '~' || rawPath.startsWith('~/')
        ? join(homedir(), rawPath.slice(1))
        : rawPath
    updateWizardData({ keyFile })
    goToStep(VERTEX_STEPS.PROJECT)
  }
  return (
    <WizardDialogLayout
      subtitle="Service account key"
      footerText={<InputFooter />}
    >
      <Box flexDirection="column">
        <Text>Path to the service account JSON key file.</Text>
        <Text dimColor>
          Download one from the GCP console under IAM → Service Accounts → Keys
          → Add key.
        </Text>
        <Box marginTop={1}>
          <TextInput
            value={value}
            onChange={setValue}
            onSubmit={submit}
            placeholder="~/keys/my-project-vertex.json"
            columns={60}
            cursorOffset={cursor}
            onChangeCursorOffset={setCursor}
            focus
            showCursor
          />
        </Box>
        <ErrorLine error={error} />
      </Box>
    </WizardDialogLayout>
  )
}

function VertexProjectStep(): React.ReactNode {
  const { goBack, goToStep, updateWizardData, wizardData } =
    useWizard<VertexWizardData>()
  const [projects, setProjects] = useState<string[] | null>(null)
  useEffect(() => {
    let cancelled = false
    void readGcloudProjects().then(value => {
      if (!cancelled) setProjects(value)
    })
    return () => {
      cancelled = true
    }
  }, [])
  if (!projects) {
    return (
      <LoadingStep subtitle="GCP project" message="Reading ~/.config/gcloud…" />
    )
  }
  return (
    <VertexProjectReady
      projects={projects}
      initialProject={wizardData.projectId}
      onCancel={goBack}
      onSelect={projectId => {
        updateWizardData({ projectId })
        goToStep(VERTEX_STEPS.REGION)
      }}
    />
  )
}

function VertexProjectReady({
  projects,
  initialProject,
  onSelect,
  onCancel,
}: {
  projects: string[]
  initialProject?: string
  onSelect(project: string): void
  onCancel(): void
}): React.ReactNode {
  const tooMany = projects.length > 12
  const initialIsCustom = Boolean(
    initialProject && !projects.includes(initialProject),
  )
  const [manual, setManual] = useState(
    projects.length === 0 || tooMany || initialIsCustom,
  )
  const [value, setValue] = useState(initialProject ?? '')
  const [cursor, setCursor] = useState(value.length)
  const [error, setError] = useState<string | null>(null)
  useKeybinding('confirm:no', onCancel, {
    context: 'Settings',
    isActive: manual,
  })
  if (!manual) {
    const options = [
      ...projects.map(project => ({ label: project, value: project })),
      { label: 'Type a different project…', value: '__manual__' },
    ]
    return (
      <WizardDialogLayout subtitle="GCP project">
        <Box flexDirection="column" gap={1}>
          <Text dimColor>
            Found {projects.length} {plural(projects.length, 'project')} in your
            gcloud configurations.
          </Text>
          <Select
            options={options}
            defaultValue={
              initialProject && projects.includes(initialProject)
                ? initialProject
                : undefined
            }
            onChange={project => {
              if (project === '__manual__') setManual(true)
              else onSelect(project)
            }}
            onCancel={onCancel}
          />
        </Box>
      </WizardDialogLayout>
    )
  }
  const submit = (): void => {
    const project = value.trim()
    if (!project) {
      setError('Project ID is required')
      return
    }
    setError(null)
    onSelect(project)
  }
  return (
    <WizardDialogLayout subtitle="GCP project ID" footerText={<InputFooter />}>
      <Box flexDirection="column">
        <Text>The project where Vertex AI is enabled.</Text>
        {tooMany ? (
          <Text dimColor>
            Found {projects.length} projects — too many to list.
          </Text>
        ) : null}
        <Text dimColor>
          Find it with `gcloud config get-value project` or in the GCP console
          header.
        </Text>
        <Box marginTop={1}>
          <TextInput
            value={value}
            onChange={setValue}
            onSubmit={submit}
            placeholder="my-gcp-project"
            columns={60}
            cursorOffset={cursor}
            onChangeCursorOffset={setCursor}
            focus
            showCursor
          />
        </Box>
        <ErrorLine error={error} />
      </Box>
    </WizardDialogLayout>
  )
}

function VertexRegionStep(): React.ReactNode {
  const { goBack, goNext, updateWizardData, wizardData } =
    useWizard<VertexWizardData>()
  const [value, setValue] = useState(wizardData.region ?? 'global')
  const [cursor, setCursor] = useState(value.length)
  const [error, setError] = useState<string | null>(null)
  useKeybinding('confirm:no', goBack, { context: 'Settings' })
  const submit = (): void => {
    const region = value.trim()
    if (!region) {
      setError('Region is required')
      return
    }
    setError(null)
    updateWizardData({ region })
    goNext()
  }
  return (
    <WizardDialogLayout subtitle="Vertex AI region" footerText={<InputFooter />}>
      <Box flexDirection="column">
        <Text>Where Claude models are served from.</Text>
        <Text dimColor>
          Use 'global', 'us', or 'eu' for a multi-region endpoint (recommended),
          or a specific location like us-east5 if you have regional quota.
        </Text>
        <Box marginTop={1}>
          <TextInput
            value={value}
            onChange={setValue}
            onSubmit={submit}
            placeholder="global"
            columns={40}
            cursorOffset={cursor}
            onChangeCursorOffset={setCursor}
            focus
            showCursor
          />
        </Box>
        <ErrorLine error={error} />
      </Box>
    </WizardDialogLayout>
  )
}

function VertexVerifyStep(): React.ReactNode {
  const { goBack, goNext, updateWizardData, wizardData } =
    useWizard<VertexWizardData>()
  const [result, setResult] = useState<VerifyResult | null>(null)
  useEffect(() => {
    let cancelled = false
    void verifyVertex(wizardData).then(value => {
      if (cancelled) return
      updateWizardData({
        verifiedIdentity: value.status === 'ok' ? value.identity : undefined,
      })
      setResult(value)
    })
    return () => {
      cancelled = true
    }
  }, [])
  if (!result) {
    return (
      <LoadingStep
        subtitle="Verifying credentials"
        message="Calling Google Cloud…"
        detail="This may take a few seconds."
      />
    )
  }
  if (result.status === 'ok') {
    return (
      <WizardDialogLayout subtitle="Verification">
        <Box flexDirection="column" gap={1}>
          <Text>
            <StatusIcon status="success" withSpace />
            Authenticated as <Text bold>{result.identity}</Text>
          </Text>
          {result.note ? <Text dimColor>{result.note}</Text> : null}
          <Select
            options={[{ label: 'Continue', value: 'continue' }]}
            onChange={goNext}
            onCancel={goBack}
          />
        </Box>
      </WizardDialogLayout>
    )
  }
  return (
    <WizardDialogLayout subtitle="Verification failed" color="error">
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text>
            <StatusIcon status="error" withSpace />
            {result.error}
          </Text>
          {result.command ? (
            <Text bold color="suggestion">    {result.command}</Text>
          ) : null}
        </Box>
        <ConfirmChoice
          cancelFirst
          confirmLabel="Save anyway (skip verification)"
          cancelLabel="Go back and fix"
          onConfirm={goNext}
          onCancel={goBack}
        />
      </Box>
    </WizardDialogLayout>
  )
}

function VertexPinModelsStep(): React.ReactNode {
  const { goBack, goNext, updateWizardData, wizardData } =
    useWizard<VertexWizardData>()
  const defaults = useMemo(getVertexDefaults, [])
  const existing = useMemo(
    () =>
      Object.fromEntries(
        MODEL_TIERS.map(tier => [
          tier,
          process.env[MODEL_ENV_KEYS[tier]]?.trim() || undefined,
        ]),
      ) as Partial<Record<ModelTier, string>>,
    [],
  )
  const initial = useMemo(
    () =>
      Object.fromEntries(
        MODEL_TIERS.map(tier => [tier, existing[tier] ?? defaults[tier]]),
      ) as Record<ModelTier, string>,
    [defaults, existing],
  )
  const probe = React.useCallback(
    (model: string) => probeVertexModel(wizardData, model),
    [wizardData],
  )
  return (
    <ModelPinStep
      provider="Vertex AI"
      initial={initial}
      existing={existing}
      candidatesForTier={tier => {
        const candidates = getVertexCandidates(tier)
        for (const model of [defaults[tier], initial[tier], existing[tier]]) {
          if (model && !candidates.includes(model)) candidates.push(model)
        }
        return candidates
      }}
      probe={probe}
      onComplete={pins => {
        updateWizardData(pins)
        goNext()
      }}
      onCancel={goBack}
    />
  )
}

function buildVertexEnvironment(data: VertexWizardData) {
  const environment: Record<string, string | undefined> = {
    CLAUDE_CODE_USE_VERTEX: '1',
    CLAUDE_CODE_USE_BEDROCK: undefined,
    CLAUDE_CODE_USE_FOUNDRY: undefined,
    CLAUDE_CODE_USE_ANTHROPIC_AWS: undefined,
    ANTHROPIC_VERTEX_PROJECT_ID: data.projectId,
    CLOUD_ML_REGION: data.region,
    GOOGLE_APPLICATION_CREDENTIALS: undefined,
    ANTHROPIC_DEFAULT_SONNET_MODEL: undefined,
    ANTHROPIC_DEFAULT_OPUS_MODEL: undefined,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: undefined,
    ANTHROPIC_SMALL_FAST_MODEL: undefined,
  }
  if (data.authMethod === 'serviceAccount') {
    environment.GOOGLE_APPLICATION_CREDENTIALS = data.keyFile
  }
  if (data.pinSonnet) {
    environment.ANTHROPIC_DEFAULT_SONNET_MODEL = data.pinSonnet
  }
  if (data.pinOpus) {
    environment.ANTHROPIC_DEFAULT_OPUS_MODEL = data.pinOpus
  }
  if (data.pinHaiku) {
    environment.ANTHROPIC_DEFAULT_HAIKU_MODEL = data.pinHaiku
  }
  return environment
}

function VertexConfirmStep({
  onComplete,
}: {
  onComplete(message: string): void
}): React.ReactNode {
  const { goBack, wizardData } = useWizard<VertexWizardData>()
  const [error, setError] = useState<string | null>(null)
  const settingsPath = getDisplayPath(
    getSettingsFilePathForSource('userSettings') ?? '~/.claude/settings.json',
  )
  const environment = buildVertexEnvironment(wizardData)
  const entries = Object.entries(environment).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  )
  const save = (): void => {
    const result = updateSettingsForSource('userSettings', {
      env: environment,
    } as never)
    if (result.error) {
      setError(result.error.message)
      return
    }
    logEvent('tengu_vertex_setup_complete', {
      auth_method: wizardData.authMethod,
      pinned_models: String(
        Boolean(
          wizardData.pinSonnet || wizardData.pinOpus || wizardData.pinHaiku,
        ),
      ),
      verified: String(Boolean(wizardData.verifiedIdentity)),
    })
    onComplete(
      `Vertex AI configuration saved to ${settingsPath}.${
        wizardData.authMethod === 'adc'
          ? ' When your ADC token expires, run `gcloud auth application-default login` — Claude Code picks up refreshed credentials automatically.'
          : ''
      }`,
    )
  }
  return (
    <WizardDialogLayout subtitle="Confirm and save">
      <Box flexDirection="column" gap={1}>
        <Text>These will be written to {settingsPath} under env:</Text>
        <Box flexDirection="column">
          {entries.map(([key, value]) => (
            <Text key={key}>
              {'  '}
              <Text color="suggestion">{key}</Text> = {value}
            </Text>
          ))}
        </Box>
        {wizardData.verifiedIdentity ? (
          <Text dimColor>
            <StatusIcon status="success" withSpace />
            Verified as {wizardData.verifiedIdentity}
          </Text>
        ) : null}
        <ErrorLine error={error} />
        <ConfirmChoice
          confirmLabel="Save"
          cancelLabel="Cancel"
          onConfirm={save}
          onCancel={goBack}
        />
      </Box>
    </WizardDialogLayout>
  )
}

export function VertexSetupWizard({
  onComplete,
  onCancel,
}: {
  onComplete(message: string): void
  onCancel(): void
}): React.ReactNode {
  const completeRef = useRef(onComplete)
  completeRef.current = onComplete
  const [steps] = useState(() => [
    VertexAuthStep,
    VertexServiceAccountStep,
    VertexProjectStep,
    VertexRegionStep,
    VertexVerifyStep,
    VertexPinModelsStep,
    () => (
      <VertexConfirmStep onComplete={message => completeRef.current(message)} />
    ),
  ])
  return (
    <WizardProvider
      steps={steps}
      initialData={{}}
      onComplete={() => {}}
      onCancel={onCancel}
      title="Set up Google Vertex AI"
      showStepCounter={false}
    />
  )
}
