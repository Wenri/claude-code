import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import React, { useEffect, useMemo, useState } from 'react'
import { Box, Text } from '../ink.js'
import { useKeybinding } from '../keybindings/useKeybinding.js'
import { logEvent } from '../services/analytics/index.js'
import { ALL_MODEL_CONFIGS } from '../utils/model/configs.js'
import { modelSupports1M } from '../utils/context.js'
import { getProxyFetchOptions } from '../utils/proxy.js'
import { updateSettingsForSource } from '../utils/settings/settings.js'
import { Select } from './CustomSelect/select.js'
import { Dialog } from './design-system/Dialog.js'
import { Spinner } from './Spinner.js'
import TextInput from './TextInput.js'

export type VertexAuthMethod = 'adc' | 'serviceAccount' | 'environment'

export type VertexWizardData = {
  authMethod?: VertexAuthMethod
  keyFile?: string
  projectId?: string
  region?: string
  verifiedIdentity?: string
  pinSonnet?: string
  pinOpus?: string
  pinHaiku?: string
}

type ProbeReason = 'auth' | 'permission' | 'model' | 'network' | 'other'
export type VertexProbeResult =
  | { ok: true }
  | { ok: false; reason: ProbeReason }
type VerificationResult =
  | { status: 'ok'; identity: string; note?: string }
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
  permission: 'no aiplatform.endpoints.predict permission',
  model: 'not enabled in this project',
  network: 'unreachable',
  other: 'request failed',
}
const GCP_CREDENTIAL_TIMEOUT_MS = 12_000
export const ADC_LOGIN_COMMAND = 'gcloud auth application-default login'

function with1mSuffix(model: string): string {
  return /\[1m\]$/i.test(model) ? model : `${model}[1m]`
}

export function getVertexModelDefaults(): Record<ModelTier, string> {
  return {
    sonnet: ALL_MODEL_CONFIGS.sonnet45.vertex,
    opus: ALL_MODEL_CONFIGS.opus46.vertex,
    haiku: ALL_MODEL_CONFIGS.haiku45.vertex,
  }
}

export function getVertexModelCandidates(tier: ModelTier): string[] {
  const values = new Set<string>()
  for (const config of Object.values(ALL_MODEL_CONFIGS)) {
    if (config.vertex.toLowerCase().includes(tier)) values.add(config.vertex)
  }
  return [...values].sort().reverse()
}

export function getGcloudConfigDir(): string {
  if (process.platform === 'win32' && process.env.APPDATA) {
    return join(process.env.APPDATA, 'gcloud')
  }
  return join(homedir(), '.config', 'gcloud')
}

export async function discoverGcloudProjects(): Promise<string[]> {
  const projects = new Set<string>()
  const configDir = process.env.CLOUDSDK_CONFIG ?? getGcloudConfigDir()
  try {
    const configurationsDir = join(configDir, 'configurations')
    for (const filename of await readdir(configurationsDir)) {
      if (!filename.startsWith('config_')) continue
      try {
        const contents = await readFile(
          join(configurationsDir, filename),
          'utf8',
        )
        for (const match of contents.matchAll(/^project\s*=\s*(\S+)/gm)) {
          const project = match[1]?.trim()
          if (project) projects.add(project)
        }
      } catch {
        // An unreadable gcloud configuration is simply not discoverable.
      }
    }
  } catch {
    // Missing gcloud configuration is handled by manual project entry.
  }
  try {
    const adc = JSON.parse(
      await readFile(
        join(configDir, 'application_default_credentials.json'),
        'utf8',
      ),
    ) as { quota_project_id?: string }
    if (adc.quota_project_id) projects.add(adc.quota_project_id)
  } catch {
    // ADC is optional.
  }
  return [...projects].sort()
}

export function expandVertexKeyFile(path: string): string {
  if (path === '~' || path.startsWith('~/')) return join(homedir(), path.slice(1))
  return path
}

async function createVertexGoogleAuth(data: VertexWizardData) {
  const { GoogleAuth } = await import('google-auth-library')
  return new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    ...(data.authMethod === 'serviceAccount' && data.keyFile
      ? { keyFilename: data.keyFile }
      : {}),
    ...(data.projectId ? { projectId: data.projectId } : {}),
  })
}

export async function createVertexProbeClient(data: VertexWizardData) {
  const [{ AnthropicVertex }, googleAuth] = await Promise.all([
    import('@anthropic-ai/vertex-sdk'),
    createVertexGoogleAuth(data),
  ])
  return new AnthropicVertex({
    region: data.region,
    projectId: data.projectId,
    googleAuth,
    maxRetries: 0,
    timeout: 15_000,
    fetchOptions: getProxyFetchOptions({ forAnthropicAPI: true }),
  })
}

export async function probeVertexModel(
  data: VertexWizardData,
  model: string,
): Promise<VertexProbeResult> {
  let client
  try {
    client = await createVertexProbeClient(data)
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

function vertexVerificationError(
  error: unknown,
  data: VertexWizardData,
): Extract<VerificationResult, { status: 'error' }> {
  const message = (error as { message?: string })?.message ?? String(error)
  if (
    data.authMethod === 'serviceAccount' &&
    /ENOENT|no such file/i.test(message)
  ) {
    return {
      status: 'error',
      error: `Service account key file not found: ${data.keyFile}`,
    }
  }
  if (/Could not load the default credentials/i.test(message)) {
    return data.authMethod === 'adc'
      ? {
          status: 'error',
          error: 'No Application Default Credentials found. Run:',
          command: ADC_LOGIN_COMMAND,
        }
      : {
          status: 'error',
          error:
            'No GCP credentials found in the environment. Set GOOGLE_APPLICATION_CREDENTIALS or run gcloud auth application-default login.',
        }
  }
  if (/invalid_grant|Token has been expired|reauth/i.test(message)) {
    if (data.authMethod === 'serviceAccount') {
      return {
        status: 'error',
        error:
          'Service account credentials have been revoked or expired. Obtain a new key file from GCP IAM (IAM → Service Accounts → Keys → Add Key).',
      }
    }
    if (data.authMethod === 'adc') {
      return {
        status: 'error',
        error: 'GCP credentials expired. Run:',
        command: ADC_LOGIN_COMMAND,
      }
    }
    return {
      status: 'error',
      error:
        'GCP credentials in the environment have expired or been revoked. Refresh them (gcloud auth application-default login for ADC, or replace the GOOGLE_APPLICATION_CREDENTIALS key file).',
    }
  }
  if (/Unable to detect a Project Id/i.test(message)) {
    return {
      status: 'error',
      error:
        'Could not determine a GCP project from the credentials. Go back and set the project ID explicitly.',
    }
  }
  if (/Timed out waiting for GCP/i.test(message)) {
    return {
      status: 'error',
      error:
        'Timed out resolving GCP credentials (no ADC, no key file, and no GCE metadata server).',
      ...(data.authMethod === 'adc' && { command: ADC_LOGIN_COMMAND }),
    }
  }
  return { status: 'error', error: message }
}

export async function verifyVertexSetup(
  data: VertexWizardData,
): Promise<VerificationResult> {
  let identity: string
  try {
    const auth = await createVertexGoogleAuth(data)
    const token = (async () => {
      await (await auth.getClient()).getAccessToken()
    })()
    const timeout = new Promise<never>((_resolve, reject) =>
      setTimeout(
        () => reject(new Error('Timed out waiting for GCP credentials')),
        GCP_CREDENTIAL_TIMEOUT_MS,
      ),
    )
    await Promise.race([token, timeout])
    let clientEmail: string | undefined
    try {
      clientEmail = (await auth.getCredentials()).client_email
    } catch {
      clientEmail = undefined
    }
    identity =
      clientEmail ??
      (data.authMethod === 'serviceAccount'
        ? `service account (${data.keyFile})`
        : 'Application Default Credentials')
  } catch (error) {
    return vertexVerificationError(error, data)
  }

  const model = getVertexModelDefaults().haiku
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

export function buildVertexEnvironment(
  data: VertexWizardData,
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
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
    env.GOOGLE_APPLICATION_CREDENTIALS = data.keyFile
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
        title="Set up Google Vertex AI"
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

function InputStep({
  subtitle,
  description,
  hint,
  placeholder,
  initialValue = '',
  onBack,
  onSubmit,
}: {
  subtitle: string
  description: string
  hint?: string
  placeholder: string
  initialValue?: string
  onBack(): void
  onSubmit(value: string): void
}) {
  const [value, setValue] = useState(initialValue)
  const [cursorOffset, setCursorOffset] = useState(initialValue.length)
  const [error, setError] = useState<string | null>(null)
  useKeybinding('confirm:no', onBack, { context: 'Settings' })
  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed) {
      setError(subtitle === 'GCP project ID' ? 'Project ID is required' : subtitle === 'Vertex AI region' ? 'Region is required' : 'Path is required')
      return
    }
    setError(null)
    onSubmit(trimmed)
  }
  return (
    <WizardFrame subtitle={subtitle} onBack={onBack}>
      <Box flexDirection="column" gap={1}>
        <Text>{description}</Text>
        {hint && <Text dimColor>{hint}</Text>}
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={submit}
          placeholder={placeholder}
          columns={60}
          cursorOffset={cursorOffset}
          onChangeCursorOffset={setCursorOffset}
          focus
          showCursor
        />
        {error && <Text color="error">{error}</Text>}
      </Box>
    </WizardFrame>
  )
}

function ProjectStep({
  data,
  onBack,
  onSubmit,
}: {
  data: VertexWizardData
  onBack(): void
  onSubmit(projectId: string): void
}) {
  const [projects, setProjects] = useState<string[] | null>(null)
  const [manual, setManual] = useState(false)
  useEffect(() => {
    let cancelled = false
    void discoverGcloudProjects().then(result => {
      if (!cancelled) setProjects(result)
    })
    return () => {
      cancelled = true
    }
  }, [])
  if (!projects) {
    return (
      <WizardFrame subtitle="GCP project" onBack={onBack}>
        <Box>
          <Spinner />
          <Text> Reading ~/.config/gcloud…</Text>
        </Box>
      </WizardFrame>
    )
  }
  if (
    manual ||
    projects.length === 0 ||
    projects.length > 12 ||
    Boolean(data.projectId && !projects.includes(data.projectId))
  ) {
    return (
      <InputStep
        subtitle="GCP project ID"
        description="The project where Vertex AI is enabled."
        hint={`Find it with \`gcloud config get-value project\` or in the GCP console header.${projects.length > 12 ? ` Found ${projects.length} projects — too many to list.` : ''}`}
        placeholder="my-gcp-project"
        initialValue={data.projectId}
        onBack={onBack}
        onSubmit={onSubmit}
      />
    )
  }
  return (
    <WizardFrame subtitle="GCP project" onBack={onBack}>
      <Box flexDirection="column" gap={1}>
        <Text dimColor>
          Found {projects.length} {projects.length === 1 ? 'project' : 'projects'} in your gcloud configurations.
        </Text>
        <Select
          options={[
            ...projects.map(project => ({ label: project, value: project })),
            { label: 'Type a different project…', value: '__manual__' },
          ]}
          defaultValue={
            data.projectId && projects.includes(data.projectId)
              ? data.projectId
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
  data: VertexWizardData
  onBack(): void
  onContinue(identity?: string): void
}) {
  const [result, setResult] = useState<VerificationResult | null>(null)
  useEffect(() => {
    let cancelled = false
    void verifyVertexSetup(data).then(value => {
      if (!cancelled) setResult(value)
    })
    return () => {
      cancelled = true
    }
  }, [data])
  if (!result) {
    return (
      <WizardFrame subtitle="Verifying credentials" onBack={onBack}>
        <Box flexDirection="column">
          <Box>
            <Spinner />
            <Text> Calling Google Cloud…</Text>
          </Box>
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
          <Select
            options={[{ label: 'Continue', value: 'continue' }]}
            onChange={() => onContinue(result.identity)}
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

function PinModelsStep({
  data,
  onBack,
  onContinue,
}: {
  data: VertexWizardData
  onBack(): void
  onContinue(pins: Partial<VertexWizardData>): void
}) {
  const defaults = useMemo(getVertexModelDefaults, [])
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
  const [selected, setSelected] = useState(
    () =>
      Object.fromEntries(
        MODEL_TIERS.map(tier => [tier, existingPins[tier] ?? defaults[tier]]),
      ) as Record<ModelTier, string>,
  )
  const [states, setStates] = useState<
    Record<ModelTier, VertexProbeResult | 'pending'>
  >({ sonnet: 'pending', opus: 'pending', haiku: 'pending' })
  const [mode, setMode] = useState<
    'summary' | { picking: ModelTier }
  >('summary')
  useEffect(() => {
    let cancelled = false
    for (const tier of MODEL_TIERS) {
      void probeVertexModel(data, selected[tier]).then(result => {
        if (!cancelled) {
          setStates(current => ({ ...current, [tier]: result }))
        }
      })
    }
    return () => {
      cancelled = true
    }
  }, [data, selected])
  if (mode !== 'summary') {
    const tier = mode.picking
    return (
      <VertexModelPicker
        key={tier}
        tier={tier}
        data={data}
        fallback={defaults[tier]}
        current={selected[tier]}
        existingPin={existingPins[tier]}
        onPick={model => {
          setSelected(current => ({ ...current, [tier]: model }))
          const index = MODEL_TIERS.indexOf(tier)
          const next = MODEL_TIERS[index + 1]
          setMode(next ? { picking: next } : 'summary')
        }}
        onCancel={() => setMode('summary')}
      />
    )
  }
  const settled = MODEL_TIERS.every(tier => states[tier] !== 'pending')
  const hasWorking = MODEL_TIERS.some(
    tier => states[tier] !== 'pending' && states[tier].ok,
  )
  const hasWorking1m =
    settled &&
    MODEL_TIERS.some(tier => {
      const state = states[tier]
      return state !== 'pending' && state.ok && modelSupports1M(selected[tier])
    })
  const pins = (use1m = false) => {
    const working = (tier: ModelTier) => {
      const result = states[tier]
      if (result === 'pending' || !result.ok) return undefined
      const model = selected[tier]
      return use1m && modelSupports1M(model) ? with1mSuffix(model) : model
    }
    return {
      pinSonnet: working('sonnet'),
      pinOpus: working('opus'),
      pinHaiku: working('haiku'),
    }
  }
  return (
    <WizardFrame subtitle="Pin model versions" onBack={onBack}>
      <Box flexDirection="column" gap={1}>
        <Text>
          Without pinning, Claude Code uses its built-in defaults. When a new model ships, your install will try to call it even if it is not yet available in your project — Claude Code will fail to connect to Vertex AI until you enable the model or pin to one you have.
        </Text>
        <Text dimColor>Each candidate is tested with a one-token request:</Text>
        {MODEL_TIERS.map(tier => {
          const result = states[tier]
          const status =
            result === 'pending'
              ? '…'
              : result.ok
                ? '✓'
                : `✗ (${PROBE_ERRORS[result.reason]})`
          return (
            <Text key={tier}>
              {'  '}{status} {MODEL_LABELS[tier].padEnd(7)}→ {selected[tier]}
            </Text>
          )
        })}
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
            if (value === 'manual') {
              setMode({ picking: 'sonnet' })
              return
            }
            onContinue(
              value === 'pin' || value === 'pin1m'
                ? pins(value === 'pin1m')
                : {
                    pinSonnet: undefined,
                    pinOpus: undefined,
                    pinHaiku: undefined,
                  },
            )
          }}
          onCancel={onBack}
        />
      </Box>
    </WizardFrame>
  )
}

function VertexModelOption({
  id,
  state,
  suffix,
}: {
  id: string
  state: VertexProbeResult | 'pending'
  suffix?: string
}) {
  if (state === 'pending') {
    return (
      <Text>
        … {id}
        {suffix && <Text dimColor> {suffix}</Text>}
      </Text>
    )
  }
  if (state.ok) {
    return (
      <Text>
        ✓ {id}
        {suffix && <Text dimColor> {suffix}</Text>}
      </Text>
    )
  }
  return (
    <Text dimColor>
      ✗ {id}
      {suffix && ` ${suffix}`}{' '}
      <Text color="error">({PROBE_ERRORS[state.reason]})</Text>
    </Text>
  )
}

function VertexModelPicker({
  tier,
  data,
  fallback,
  current,
  existingPin,
  onPick,
  onCancel,
}: {
  tier: ModelTier
  data: VertexWizardData
  fallback: string
  current: string
  existingPin?: string
  onPick(model: string): void
  onCancel(): void
}) {
  const candidates = useMemo(() => {
    const models = getVertexModelCandidates(tier)
    for (const model of [fallback, current, existingPin]) {
      if (model && !models.includes(model)) models.push(model)
    }
    return models
  }, [tier, fallback, current, existingPin])
  const [states, setStates] = useState<
    Record<string, VertexProbeResult | 'pending'>
  >(() => Object.fromEntries(candidates.map(model => [model, 'pending'])))
  useEffect(() => {
    let cancelled = false
    for (const model of candidates) {
      void probeVertexModel(data, model).then(result => {
        if (!cancelled) {
          setStates(existing => ({ ...existing, [model]: result }))
        }
      })
    }
    return () => {
      cancelled = true
    }
    // The picker is keyed by tier, so its candidate set is fixed for its life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const settled = candidates.every(model => states[model] !== 'pending')
  const works = (model: string): boolean => {
    const result = states[model]
    return result !== undefined && result !== 'pending' && result.ok
  }
  const ordered = useMemo(() => {
    if (!settled) return candidates
    return [...candidates].sort(
      (left, right) => Number(!works(left)) - Number(!works(right)),
    )
  }, [candidates, states, settled])
  const defaultValue = settled
    ? works(current)
      ? current
      : works(fallback)
        ? fallback
        : ordered.find(works) ?? current
    : current
  return (
    <WizardFrame subtitle={`Pin ${MODEL_LABELS[tier]} model`} onBack={onCancel}>
      <Box flexDirection="column" gap={1}>
        <Text dimColor>
          Available {MODEL_LABELS[tier]} versions on Vertex AI · each tested
          with a one-token request.
        </Text>
        <Select
          key={settled ? 'settled' : 'pending'}
          options={ordered.map(model => ({
            value: model,
            label: (
              <VertexModelOption
                id={model}
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
          }))}
          defaultValue={defaultValue}
          onChange={onPick}
          onCancel={onCancel}
        />
      </Box>
    </WizardFrame>
  )
}

function ConfirmStep({
  data,
  onBack,
  onComplete,
}: {
  data: VertexWizardData
  onBack(): void
  onComplete(message: string): void
}) {
  const [error, setError] = useState<string | null>(null)
  const environment = buildVertexEnvironment(data)
  const entries = Object.entries(environment).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  )
  const save = () => {
    const result = updateSettingsForSource('userSettings', {
      env: environment,
    })
    if (result.error) {
      setError(result.error.message)
      return
    }
    logEvent('tengu_vertex_setup_complete', {
      auth_method: data.authMethod,
      pinned_models: String(
        Boolean(data.pinSonnet || data.pinOpus || data.pinHaiku),
      ),
      verified: String(Boolean(data.verifiedIdentity)),
    })
    onComplete(
      `Vertex AI configuration saved to ~/.claude/settings.json.${
        data.authMethod === 'adc'
          ? ' When your ADC token expires, run `gcloud auth application-default login` — Claude Code picks up refreshed credentials automatically.'
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
              {'  '}<Text color="suggestion">{key}</Text> = {value}
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
  | 'serviceAccount'
  | 'project'
  | 'region'
  | 'verify'
  | 'models'
  | 'confirm'

export function VertexSetupWizard({
  onComplete,
  onCancel,
}: {
  onComplete(message: string): void
  onCancel(): void
}) {
  const [step, setStep] = useState<WizardStep>('auth')
  const [history, setHistory] = useState<WizardStep[]>([])
  const [data, setData] = useState<VertexWizardData>({})
  const goTo = (next: WizardStep, update?: Partial<VertexWizardData>) => {
    if (update) setData(current => ({ ...current, ...update }))
    setHistory(current => [...current, step])
    setStep(next)
  }
  const goBack = () => {
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
        <WizardFrame
          subtitle="How do you authenticate to Google Cloud?"
          onBack={onCancel}
        >
          <Box flexDirection="column" gap={1}>
            <Text dimColor>
              Claude Code uses the standard GCP credential chain. Pick the method you already use with gcloud or in your deployment.
            </Text>
            <Select
              options={[
                {
                  label: 'Application Default Credentials (gcloud auth)',
                  value: 'adc',
                },
                { label: 'Service account key file', value: 'serviceAccount' },
                {
                  label: 'Use credentials already in my environment',
                  value: 'environment',
                },
              ]}
              defaultValue={data.authMethod}
              onChange={value => {
                const authMethod = value as VertexAuthMethod
                goTo(
                  authMethod === 'serviceAccount'
                    ? 'serviceAccount'
                    : 'project',
                  { authMethod },
                )
              }}
              onCancel={onCancel}
            />
          </Box>
        </WizardFrame>
      )
    case 'serviceAccount':
      return (
        <InputStep
          subtitle="Service account key"
          description="Path to the service account JSON key file."
          hint="Download one from the GCP console under IAM → Service Accounts → Keys → Add key."
          placeholder="~/keys/my-project-vertex.json"
          initialValue={data.keyFile}
          onBack={goBack}
          onSubmit={keyFile =>
            goTo('project', { keyFile: expandVertexKeyFile(keyFile) })
          }
        />
      )
    case 'project':
      return (
        <ProjectStep
          data={data}
          onBack={goBack}
          onSubmit={projectId => goTo('region', { projectId })}
        />
      )
    case 'region':
      return (
        <InputStep
          subtitle="Vertex AI region"
          description="Where Claude models are served from."
          hint="Use 'global', 'us', or 'eu' for a multi-region endpoint (recommended), or a specific location like us-east5 if you have regional quota."
          placeholder="global"
          initialValue={data.region ?? 'global'}
          onBack={goBack}
          onSubmit={region => goTo('verify', { region })}
        />
      )
    case 'verify':
      return (
        <VerificationStep
          data={data}
          onBack={goBack}
          onContinue={verifiedIdentity =>
            goTo('models', { verifiedIdentity })
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
