import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Select } from '../../components/CustomSelect/index.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { ProgressBar } from '../../components/design-system/ProgressBar.js'
import { AnimatedClawd } from '../../components/LogoV2/AnimatedClawd.js'
import { Spinner } from '../../components/Spinner.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import TextInput from '../../components/TextInput.js'
import { Box, Text } from '../../ink.js'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import {
  type ExtraUsage,
  fetchUtilization,
} from '../../services/api/usage.js'
import {
  enableExtraUsage,
  type ExtraUsageAutoReloadSettings,
  type ExtraUsageBalance,
  type ExtraUsageBundle,
  type ExtraUsagePaymentMethod,
  extractUserFacingExtraUsageError,
  fetchExtraUsageBalance,
  fetchExtraUsageBundles,
  fetchExtraUsagePaymentMethod,
  fetchExtraUsagePurchaseStatus,
  fetchExtraUsageTaxPreview,
  purchaseExtraUsage,
  setExtraUsageAutoReload,
  setExtraUsageSpendLimit,
} from '../../services/api/extraUsage.js'
import { logEvent } from '../../services/analytics/index.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { openBrowser } from '../../utils/browser.js'
import { saveGlobalConfig } from '../../utils/config.js'
import { logError } from '../../utils/log.js'

const EXTRA_USAGE_SETTINGS_URL = 'https://claude.ai/settings/usage'
const EXTRA_USAGE_HELP_URL =
  'https://support.claude.com/en/articles/12429409-extra-usage-for-paid-claude-plans'
const CONSUMER_TERMS_URL = 'https://www.anthropic.com/legal/consumer-terms'
const PURCHASE_POLL_INTERVAL_MS = 2_000
const PURCHASE_POLL_ATTEMPTS = 30
const CUSTOM_PURCHASE_MINIMUM_USD_CENTS = 500
const AUTO_RELOAD_MINIMUM_DELTA_USD_CENTS = 1_000

const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  BRL: 'R$',
  CAD: 'CA$',
  AUD: 'A$',
  NZD: 'NZ$',
  SGD: 'S$',
}
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND'])

function currencySymbol(currency: string): string {
  const normalized = currency.toUpperCase()
  return CURRENCY_SYMBOLS[normalized] ?? `${normalized} `
}

function formatMoney(
  minorUnits: number,
  currency: string,
  mode: 'precise' | 'whole' | 'fit' = 'precise',
): string {
  const normalized = currency.toUpperCase()
  const symbol = currencySymbol(normalized)
  if (ZERO_DECIMAL_CURRENCIES.has(normalized)) {
    return `${symbol}${Math.round(minorUnits)}`
  }
  const amount = minorUnits / 100
  if (mode === 'whole') return `${symbol}${Math.round(amount)}`
  if (mode === 'fit' && amount % 1 === 0) return `${symbol}${amount}`
  return `${symbol}${amount.toFixed(2)}`
}

function paymentMethodLabel(method: ExtraUsagePaymentMethod): string {
  return `${method.brand ?? method.type} ····${method.last4 ?? ''}`
}

type LoadedStep = {
  s: 'enabled'
  usage: ExtraUsage
  balance: ExtraUsageBalance | null
  paymentMethod: ExtraUsagePaymentMethod | null
}

type Step =
  | { s: 'loading' }
  | { s: 'not_enabled'; paymentMethod: ExtraUsagePaymentMethod | null }
  | LoadedStep
  | { s: 'enabling'; work: Promise<boolean> }
  | { s: 'adjust_limit'; current: number | null }
  | { s: 'adjusting' }
  | { s: 'buy_select'; paymentMethod: ExtraUsagePaymentMethod }
  | {
      s: 'buy_custom'
      paymentMethod: ExtraUsagePaymentMethod
      initialCents?: number
    }
  | {
      s: 'buy_confirm'
      paymentMethod: ExtraUsagePaymentMethod
      cents: number
      bundle?: ExtraUsageBundle
    }
  | { s: 'buy_purchasing' }
  | { s: 'buy_polling'; purchaseId: string; credit: number }
  | { s: 'buy_success'; credit: number }
  | {
      s: 'auto_reload_config'
      current: ExtraUsageAutoReloadSettings | null | undefined
      paymentMethod: ExtraUsagePaymentMethod
    }
  | { s: 'auto_reload_saving'; enabled: boolean; work: Promise<boolean> }
  | { s: 'error'; message: string }

export function ExtraUsageDialog({
  onDone,
}: {
  onDone: LocalJSXCommandOnDone
}): React.ReactNode {
  const [step, setStep] = useState<Step>({ s: 'loading' })
  const [currency, setCurrency] = useState('USD')
  const [bundles, setBundles] = useState<ExtraUsageBundle[]>([])
  const [stripeProductId, setStripeProductId] = useState<string>()

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setStep({ s: 'loading' })
    try {
      const [utilization, balance, paymentMethod, bundleResponse] =
        await Promise.all([
          fetchUtilization(),
          fetchExtraUsageBalance(),
          fetchExtraUsagePaymentMethod(),
          fetchExtraUsageBundles(),
        ])
      setCurrency(
        (bundleResponse?.currency ?? balance?.currency ?? 'USD').toUpperCase(),
      )
      setBundles(bundleResponse?.bundles ?? [])
      setStripeProductId(bundleResponse?.stripe_product_id)
      if (utilization === null) {
        setStep({
          s: 'error',
          message:
            'Could not load extra usage status — try /login if your session expired.',
        })
        return
      }
      const usage = utilization.extra_usage ?? {
        is_enabled: false,
        monthly_limit: null,
        used_credits: null,
        utilization: null,
      }
      if (!usage.is_enabled) {
        setStep({ s: 'not_enabled', paymentMethod })
        return
      }
      setStep({ s: 'enabled', usage, balance, paymentMethod })
    } catch (error) {
      logError(error as Error)
      setStep({ s: 'error', message: 'Failed to load extra usage status' })
    }
  }, [])

  useEffect(() => {
    logEvent('tengu_extra_usage_inline_dialog_shown', {})
    void load()
  }, [load])

  const cancel = (fromStep: string) => {
    logEvent('tengu_extra_usage_inline_dialog_cancel', { from_step: fromStep })
    onDone(undefined, { display: 'skip' })
  }

  const enable = () => {
    logEvent('tengu_extra_usage_inline_dialog_enable_confirm', {})
    const work = enableExtraUsage().then(async success => {
      logEvent('tengu_extra_usage_inline_dialog_enable_result', { success })
      if (!success) return false
      saveGlobalConfig(config => {
        if (!config.oauthAccount || config.oauthAccount.hasExtraUsageEnabled) {
          return config
        }
        return {
          ...config,
          oauthAccount: { ...config.oauthAccount, hasExtraUsageEnabled: true },
        }
      })
      await load(false)
      return true
    })
    setStep({ s: 'enabling', work })
  }

  const finishAutoReload = (success: boolean, enabled: boolean) => {
    if (!success) {
      setStep({ s: 'error', message: 'Failed to update auto-reload' })
      return
    }
    if (!enabled) void load()
  }

  const saveAutoReload = (
    enabled: boolean,
    threshold?: number,
    reloadTo?: number,
  ) => {
    logEvent('tengu_extra_usage_inline_dialog_auto_reload', {
      enabled,
      threshold_cents: threshold,
      reload_to_cents: reloadTo,
      currency,
    })
    const request = setExtraUsageAutoReload(
      enabled,
      threshold,
      reloadTo,
      currency,
    )
    const work = enabled
      ? request.then(async success => {
          if (success) await load(false)
          return success
        })
      : request
    setStep({ s: 'auto_reload_saving', enabled, work })
  }

  const actOnEnabled = (action: string, loaded: LoadedStep) => {
    switch (action) {
      case 'continue':
        onDone('Continuing with extra usage')
        return
      case 'buy':
        if (!loaded.paymentMethod) {
          logEvent('tengu_extra_usage_inline_dialog_fallback_browser', {
            reason: 'no_payment_method',
          })
          onDone(
            `No card on file — add a payment method at ${EXTRA_USAGE_SETTINGS_URL}`,
          )
          return
        }
        setStep({ s: 'buy_select', paymentMethod: loaded.paymentMethod })
        return
      case 'adjust':
        setStep({ s: 'adjust_limit', current: loaded.usage.monthly_limit })
        return
      case 'auto_reload':
        if (!loaded.paymentMethod) {
          logEvent('tengu_extra_usage_inline_dialog_fallback_browser', {
            reason: 'no_payment_method',
          })
          onDone(
            `No card on file — add a payment method at ${EXTRA_USAGE_SETTINGS_URL}`,
          )
          return
        }
        setStep({
          s: 'auto_reload_config',
          current: loaded.balance?.auto_reload_settings,
          paymentMethod: loaded.paymentMethod,
        })
        return
      case 'manage':
        void openBrowser(EXTRA_USAGE_SETTINGS_URL)
        onDone(`Opening ${EXTRA_USAGE_SETTINGS_URL}`)
    }
  }

  const buy = async (cents: number, bundle?: ExtraUsageBundle) => {
    logEvent('tengu_extra_usage_inline_dialog_buy_confirm', {
      amount_cents: cents,
      preset: Boolean(bundle),
      currency,
    })
    setStep({ s: 'buy_purchasing' })
    const credit = bundle?.local_credit_minor_units ?? cents
    try {
      const result = await purchaseExtraUsage(
        bundle
          ? { kind: 'bundle', bundle }
          : { kind: 'custom', amountCents: cents },
      )
      if (result.payment_status === 'success') {
        logEvent('tengu_extra_usage_inline_dialog_buy_result', {
          status: 'success',
        })
        setStep({ s: 'buy_success', credit })
      } else if (
        result.payment_status === 'pending_invoice' &&
        result.purchase_id
      ) {
        setStep({
          s: 'buy_polling',
          purchaseId: result.purchase_id,
          credit,
        })
      } else if (result.payment_status === 'requires_action') {
        logEvent('tengu_extra_usage_inline_dialog_buy_result', {
          status: '3ds_fallback',
        })
        setStep({
          s: 'error',
          message: `Your card requires additional verification — this purchase was not completed. Try again at ${EXTRA_USAGE_SETTINGS_URL}`,
        })
      } else {
        setStep({ s: 'error', message: 'Unexpected purchase state' })
      }
    } catch (error) {
      logError(error as Error)
      logEvent('tengu_extra_usage_inline_dialog_buy_result', {
        status: 'failed',
      })
      const message = extractUserFacingExtraUsageError(error)
      setStep({
        s: 'error',
        message: message ? `Purchase failed: ${message}` : 'Purchase failed',
      })
    }
  }

  switch (step.s) {
    case 'loading':
      return <Loading message="Loading extra usage status…" />
    case 'enabling':
      return (
        <WorkCompletion
          message="Turning on extra usage…"
          work={step.work}
          celebrate
          onDone={success => {
            if (!success) {
              setStep({
                s: 'error',
                message: 'Failed to turn on extra usage',
              })
            }
          }}
        />
      )
    case 'adjusting':
      return <Loading message="Updating spend limit…" />
    case 'buy_purchasing':
      return (
        <AnimatedLoading message="Processing payment… (may take a few seconds)" />
      )
    case 'auto_reload_saving':
      return (
        <WorkCompletion
          message={
            step.enabled
              ? 'Turning on auto-reload…'
              : 'Turning off auto-reload…'
          }
          work={step.work}
          celebrate={step.enabled}
          onDone={success => finishAutoReload(success, step.enabled)}
        />
      )
    case 'not_enabled':
      return (
        <EnableExtraUsage
          paymentMethod={step.paymentMethod}
          onConfirm={enable}
          onCancel={() => cancel('not_enabled')}
        />
      )
    case 'enabled':
      return (
        <EnabledExtraUsage
          loaded={step}
          currency={currency}
          onAction={action => actOnEnabled(action, step)}
          onCancel={() => cancel('enabled')}
        />
      )
    case 'buy_select':
      return (
        <BuySelect
          paymentMethod={step.paymentMethod}
          bundles={bundles}
          currency={currency}
          onBundle={bundle =>
            setStep({
              s: 'buy_confirm',
              paymentMethod: step.paymentMethod,
              cents: bundle.local_price_minor_units,
              bundle,
            })
          }
          onCustom={() =>
            setStep({
              s: 'buy_custom',
              paymentMethod: step.paymentMethod,
            })
          }
          onCancel={() => void load()}
        />
      )
    case 'buy_custom':
      return (
        <AmountInput
          title="Buy extra usage"
          subtitle={`Payment: ${paymentMethodLabel(step.paymentMethod)}`}
          currency={currency}
          initial={String((step.initialCents ?? 7_500) / 100)}
          minimumCents={
            currency === 'USD' ? CUSTOM_PURCHASE_MINIMUM_USD_CENTS : undefined
          }
          footer="By confirming, you allow Anthropic to charge your card in the amount above."
          onSubmit={cents =>
            setStep({
              s: 'buy_confirm',
              paymentMethod: step.paymentMethod,
              cents,
            })
          }
          onCancel={() =>
            setStep({
              s: 'buy_select',
              paymentMethod: step.paymentMethod,
            })
          }
        />
      )
    case 'buy_confirm':
      return (
        <BuyConfirm
          paymentMethod={step.paymentMethod}
          cents={step.cents}
          bundle={step.bundle}
          currency={currency}
          stripeProductId={stripeProductId}
          onConfirm={() => void buy(step.cents, step.bundle)}
          onCancel={() =>
            setStep(
              step.bundle
                ? { s: 'buy_select', paymentMethod: step.paymentMethod }
                : {
                    s: 'buy_custom',
                    paymentMethod: step.paymentMethod,
                    initialCents: step.cents,
                  },
            )
          }
        />
      )
    case 'buy_polling':
      return (
        <PurchasePolling
          purchaseId={step.purchaseId}
          onSuccess={() => setStep({ s: 'buy_success', credit: step.credit })}
          onError={message => setStep({ s: 'error', message })}
        />
      )
    case 'buy_success':
      return (
        <PurchaseSuccess
          message={`Added ${formatMoney(step.credit, currency)} of extra usage`}
          onDone={() =>
            onDone(
              `Added ${formatMoney(step.credit, currency)} of extra usage`,
            )
          }
        />
      )
    case 'adjust_limit':
      return (
        <SpendLimit
          current={step.current}
          currency={currency}
          onConfirm={async value => {
            logEvent('tengu_extra_usage_inline_dialog_adjust_limit', {
              old_cents: step.current ?? undefined,
              new_cents: value ?? undefined,
              unlimited: value === null,
              currency,
            })
            setStep({ s: 'adjusting' })
            if (!(await setExtraUsageSpendLimit(value, currency))) {
              setStep({ s: 'error', message: 'Failed to update spend limit' })
              return
            }
            onDone(
              value === null
                ? 'Monthly limit set to unlimited'
                : `Monthly limit updated to ${formatMoney(value, currency, 'whole')}`,
            )
          }}
          onCancel={() => void load()}
        />
      )
    case 'auto_reload_config':
      return (
        <AutoReload
          current={step.current}
          paymentMethod={step.paymentMethod}
          currency={currency}
          onSave={saveAutoReload}
          onCancel={() => void load()}
        />
      )
    case 'error':
      return (
        <ErrorDialog
          message={step.message}
          onClose={() => cancel('error')}
        />
      )
  }
}

function Loading({ message }: { message: string }): React.ReactNode {
  return (
    <Box flexDirection="row" gap={1} paddingTop={1}>
      <Spinner />
      <Text dimColor>{message}</Text>
    </Box>
  )
}

function AnimatedLoading({ message }: { message: string }): React.ReactNode {
  return (
    <Box
      flexDirection="row"
      gap={2}
      alignItems="center"
      paddingTop={2}
    >
      <AnimatedClawd autoplay />
      <Text dimColor>{message}</Text>
    </Box>
  )
}

function WorkCompletion({
  message,
  work,
  celebrate,
  onDone,
}: {
  message: string
  work: Promise<boolean>
  celebrate: boolean
  onDone: (success: boolean) => void
}): React.ReactNode {
  const result = useRef<{ value: boolean } | null>(null)
  const animationDone = useRef(!celebrate)
  const unmounted = useRef(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  const finish = useCallback(() => {
    if (unmounted.current) return
    if (result.current && animationDone.current) {
      onDoneRef.current(result.current.value)
    }
  }, [])

  useEffect(() => {
    void work
      .then(value => {
        result.current = { value }
        finish()
      })
      .catch(error => {
        logError(error as Error)
        result.current = { value: false }
        finish()
      })
    return () => {
      unmounted.current = true
    }
  }, [finish, work])

  if (!celebrate) {
    return <Loading message={message} />
  }
  return (
    <Box
      flexDirection="row"
      gap={2}
      alignItems="center"
      paddingTop={1}
    >
      <AnimatedClawd
        sequence="celebrate"
        onComplete={() => {
          animationDone.current = true
          finish()
        }}
      />
      <Box marginTop={1}>
        <Text dimColor>{message}</Text>
      </Box>
    </Box>
  )
}

function EnableExtraUsage({
  paymentMethod,
  onConfirm,
  onCancel,
}: {
  paymentMethod: ExtraUsagePaymentMethod | null
  onConfirm: () => void
  onCancel: () => void
}): React.ReactNode {
  return (
    <Dialog title="Turn on extra usage" onCancel={onCancel} color="suggestion">
      <Text>Keep using Claude when you hit a limit.</Text>
      <Text dimColor>
        {paymentMethod
          ? `Card on file: ${paymentMethodLabel(paymentMethod)}`
          : `No card on file — add one at ${EXTRA_USAGE_SETTINGS_URL} before buying.`}
      </Text>
      <Text dimColor>
        By turning on, you agree to turn on extra usage as defined in our Help
        Center article:{'\n'}
        {EXTRA_USAGE_HELP_URL}
      </Text>
      <Select
        options={[
          { label: 'Turn on', value: 'yes' },
          { label: 'Cancel', value: 'no' },
        ]}
        onChange={value => (value === 'yes' ? onConfirm() : onCancel())}
        onCancel={onCancel}
      />
    </Dialog>
  )
}

function EnabledExtraUsage({
  loaded,
  currency,
  onAction,
  onCancel,
}: {
  loaded: LoadedStep
  currency: string
  onAction: (action: string) => void
  onCancel: () => void
}): React.ReactNode {
  const { columns } = useTerminalSize()
  const barWidth = Math.min(columns - 6, 50)
  const spent =
    loaded.usage.used_credits === null
      ? '—'
      : formatMoney(loaded.usage.used_credits, currency)
  const monthlyLimit =
    loaded.usage.monthly_limit === null
      ? 'Unlimited'
      : formatMoney(loaded.usage.monthly_limit, currency, 'whole')
  const percent = Math.round(loaded.usage.utilization ?? 0)
  const balance = loaded.balance
    ? formatMoney(loaded.balance.amount, currency)
    : '—'
  const autoReload = loaded.balance?.auto_reload_settings?.enabled
  const [resetDate] = useState(() => {
    const now = new Date()
    return new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1,
    ).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  })

  return (
    <Dialog title="Extra usage" onCancel={onCancel} color="suggestion">
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text>{spent} spent</Text>
          <ProgressBar
            ratio={percent / 100}
            width={barWidth}
            fillColor="rate_limit_fill"
            emptyColor="rate_limit_empty"
          />
          <Text>{percent}% used</Text>
        </Box>
        <Text dimColor>
          Resets {resetDate} · {monthlyLimit} monthly limit
        </Text>
      </Box>
      <Select
        options={[
          {
            label: `${balance} balance · auto-reload ${autoReload ? 'on' : 'off'}\n`,
            value: 'auto_reload',
          },
          { label: 'Buy more', value: 'buy' },
          { label: 'Continue with extra usage', value: 'continue' },
          { label: 'Adjust monthly limit', value: 'adjust' },
          { label: 'Manage on claude.ai', value: 'manage' },
        ]}
        onChange={onAction}
        onCancel={onCancel}
        visibleOptionCount={5}
      />
    </Dialog>
  )
}

function BuySelect({
  paymentMethod,
  bundles,
  currency,
  onBundle,
  onCustom,
  onCancel,
}: {
  paymentMethod: ExtraUsagePaymentMethod
  bundles: ExtraUsageBundle[]
  currency: string
  onBundle: (bundle: ExtraUsageBundle) => void
  onCustom: () => void
  onCancel: () => void
}): React.ReactNode {
  const options = [
    ...bundles.map((bundle, index) => ({
      label: formatMoney(bundle.local_credit_minor_units, currency, 'fit'),
      description:
        bundle.credit_minor_units > 0 && bundle.discount_minor_units > 0
          ? `Save ${Math.round((bundle.discount_minor_units / bundle.credit_minor_units) * 100)}%`
          : undefined,
      value: `bundle:${index}`,
    })),
    { label: 'Custom amount…', value: 'custom' },
    { label: 'Cancel', value: 'cancel' },
  ]
  return (
    <Dialog title="Buy extra usage" onCancel={onCancel} color="suggestion">
      <Text dimColor>Payment: {paymentMethodLabel(paymentMethod)}</Text>
      <Select
        options={options}
        onChange={value => {
          if (value === 'custom') onCustom()
          else if (value === 'cancel') onCancel()
          else {
            const bundle = bundles[Number(value.slice('bundle:'.length))]
            if (bundle) onBundle(bundle)
          }
        }}
        onCancel={onCancel}
        visibleOptionCount={options.length}
      />
      <Text dimColor>
        By confirming, you allow Anthropic to charge your card in the amount
        above.
      </Text>
    </Dialog>
  )
}

function AmountInput({
  title,
  subtitle,
  currency,
  initial,
  minimumCents,
  footer,
  onSubmit,
  onCancel,
}: {
  title: string
  subtitle?: string
  currency: string
  initial: string
  minimumCents?: number
  footer?: string
  onSubmit: (cents: number) => void
  onCancel: () => void
}): React.ReactNode {
  const [value, setValue] = useState(initial)
  const [cursorOffset, setCursorOffset] = useState(initial.length)
  const cents = Math.round(Number(value.replace(/[^0-9.]/g, '')) * 100)
  const belowMinimum =
    minimumCents !== undefined && cents > 0 && cents < minimumCents
  const submit = () => {
    if (cents > 0 && !belowMinimum) onSubmit(cents)
  }
  return (
    <Dialog title={title} onCancel={onCancel} color="suggestion">
      {subtitle && <Text dimColor>{subtitle}</Text>}
      <Box flexDirection="row" gap={1}>
        <Text>{currencySymbol(currency)}</Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={submit}
          onExit={onCancel}
          focus
          showCursor
          columns={40}
          cursorOffset={cursorOffset}
          onChangeCursorOffset={setCursorOffset}
        />
      </Box>
      {footer && <Text dimColor>{footer}</Text>}
      {belowMinimum && minimumCents !== undefined && (
        <Text color="error">
          Minimum is {formatMoney(minimumCents, currency, 'whole')}
        </Text>
      )}
    </Dialog>
  )
}

function BuyConfirm({
  paymentMethod,
  cents,
  bundle,
  currency,
  stripeProductId,
  onConfirm,
  onCancel,
}: {
  paymentMethod: ExtraUsagePaymentMethod
  cents: number
  bundle?: ExtraUsageBundle
  currency: string
  stripeProductId?: string
  onConfirm: () => void
  onCancel: () => void
}): React.ReactNode {
  const [tax, setTax] = useState<
    'loading' | Awaited<ReturnType<typeof fetchExtraUsageTaxPreview>>
  >('loading')
  useEffect(() => {
    let active = true
    void fetchExtraUsageTaxPreview(cents, currency, stripeProductId).then(
      result => {
        if (active) setTax(result)
      },
    )
    return () => {
      active = false
    }
  }, [cents, currency, stripeProductId])

  const credit = bundle?.local_credit_minor_units ?? cents
  const discount = credit - cents
  const discountPercent =
    credit > 0 && discount > 0 ? Math.round((discount / credit) * 100) : 0
  const taxUnavailable = tax === null
  const taxAmount = tax === 'loading' || tax === null ? 0 : tax.tax_minor_units
  const total = cents + taxAmount
  return (
    <Dialog title="Buy extra usage" onCancel={onCancel} color="suggestion">
      <Text>Subtotal: {formatMoney(credit, currency)}</Text>
      {discount > 0 && (
        <>
          <Text>
            Discount{discountPercent > 0 ? ` (${discountPercent}%)` : ''}: −
            {formatMoney(discount, currency)}
          </Text>
          <Text>Subtotal after discount: {formatMoney(cents, currency)}</Text>
        </>
      )}
      <Text dimColor={tax === 'loading' || taxUnavailable}>
        {tax === 'loading'
          ? 'Tax: …'
          : taxUnavailable
            ? 'Tax: —'
            : `${tax.tax_label ?? 'Tax'} (${Number(tax.tax_rate_pct.toFixed(2))}%): ${formatMoney(tax.tax_minor_units, currency)}`}
      </Text>
      <Text bold>
        Total due:{' '}
        {tax === 'loading' || taxUnavailable
          ? tax === 'loading'
            ? '…'
            : '—'
          : formatMoney(total, currency)}
      </Text>
      <Text dimColor>Payment {paymentMethodLabel(paymentMethod)}</Text>
      {taxUnavailable && (
        <Text color="warning">
          Couldn't calculate tax. Try again, or buy at{' '}
          {EXTRA_USAGE_SETTINGS_URL}
        </Text>
      )}
      <Select
        options={
          taxUnavailable
            ? [{ label: 'Go back', value: 'no' }]
            : [
                {
                  label:
                    tax === 'loading'
                      ? 'Pay (calculating…)'
                      : `Pay ${formatMoney(total, currency)} now`,
                  value: 'yes',
                  disabled: tax === 'loading',
                },
                { label: 'Go back', value: 'no' },
              ]
        }
        onChange={value => (value === 'yes' ? onConfirm() : onCancel())}
        onCancel={onCancel}
      />
      {!taxUnavailable && (
        <Text dimColor>
          By confirming, you allow Anthropic to charge your card in the amount
          above.
        </Text>
      )}
    </Dialog>
  )
}

function SpendLimit({
  current,
  currency,
  onConfirm,
  onCancel,
}: {
  current: number | null
  currency: string
  onConfirm: (value: number | null) => void
  onCancel: () => void
}): React.ReactNode {
  const initial = current === null ? '150' : String(Math.round(current / 100))
  const [value, setValue] = useState(initial)
  const [cursorOffset, setCursorOffset] = useState(initial.length)
  const cents = Math.round(Number(value.replace(/[^0-9.]/g, '')) * 100)
  return (
    <Dialog title="Set monthly spend limit" onCancel={onCancel} color="suggestion">
      <Text>
        You can set a maximum amount you can spend on extra usage per month.
      </Text>
      <Box borderStyle="single" paddingX={1}>
        <Text>{currencySymbol(currency)}</Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={() => cents > 0 && onConfirm(cents)}
          focus
          showCursor
          columns={40}
          cursorOffset={cursorOffset}
          onChangeCursorOffset={setCursorOffset}
        />
      </Box>
      <Text dimColor>This spend limit goes into effect immediately.</Text>
      <Select
        options={[
          { label: 'Set limit', value: 'set', disabled: cents <= 0 },
          { label: 'Set to unlimited', value: 'unlimited' },
          { label: 'Cancel', value: 'cancel' },
        ]}
        onChange={choice => {
          if (choice === 'set' && cents > 0) onConfirm(cents)
          else if (choice === 'unlimited') onConfirm(null)
          else if (choice === 'cancel') onCancel()
        }}
        onCancel={onCancel}
      />
    </Dialog>
  )
}

function AutoReload({
  current,
  paymentMethod,
  currency,
  onSave,
  onCancel,
}: {
  current: ExtraUsageAutoReloadSettings | null | undefined
  paymentMethod: ExtraUsagePaymentMethod
  currency: string
  onSave: (
    enabled: boolean,
    threshold?: number,
    reloadTo?: number,
  ) => void
  onCancel: () => void
}): React.ReactNode {
  const initialThreshold = current?.threshold_in_minor_units
    ? String(Math.round(current.threshold_in_minor_units / 100))
    : '5'
  const initialReloadTo = current?.reload_to_in_minor_units
    ? String(Math.round(current.reload_to_in_minor_units / 100))
    : '15'
  const [threshold, setThreshold] = useState(initialThreshold)
  const [reloadTo, setReloadTo] = useState(initialReloadTo)
  const [thresholdCursor, setThresholdCursor] = useState(
    initialThreshold.length,
  )
  const [reloadCursor, setReloadCursor] = useState(initialReloadTo.length)
  const thresholdCents = Math.round(
    Number(threshold.replace(/[^0-9.]/g, '')) * 100,
  )
  const reloadToCents = Math.round(
    Number(reloadTo.replace(/[^0-9.]/g, '')) * 100,
  )
  const validation =
    thresholdCents <= 0 || reloadToCents <= 0
      ? 'Enter an amount'
      : reloadToCents <= thresholdCents
        ? 'Reload-to must be above threshold'
        : currency === 'USD' &&
            reloadToCents - thresholdCents <
              AUTO_RELOAD_MINIMUM_DELTA_USD_CENTS
          ? `Reload must be at least ${formatMoney(AUTO_RELOAD_MINIMUM_DELTA_USD_CENTS, currency, 'whole')} above threshold`
          : ''
  return (
    <Dialog title="Auto-reload" onCancel={onCancel} color="suggestion">
      <Text>
        Automatically buy more extra usage when your balance is low.
        {current?.enabled && <Text color="success"> · Currently on</Text>}
      </Text>
      <Text dimColor>Card on file: {paymentMethodLabel(paymentMethod)}</Text>
      <Text dimColor>When extra usage balance falls below:</Text>
      <Box borderStyle="single" paddingX={1}>
        <Text>{currencySymbol(currency)}</Text>
        <TextInput
          value={threshold}
          onChange={setThreshold}
          focus
          showCursor
          columns={30}
          cursorOffset={thresholdCursor}
          onChangeCursorOffset={setThresholdCursor}
        />
      </Box>
      <Text dimColor>Reload balance to:</Text>
      <Box borderStyle="single" paddingX={1}>
        <Text>{currencySymbol(currency)}</Text>
        <TextInput
          value={reloadTo}
          onChange={setReloadTo}
          showCursor
          columns={30}
          cursorOffset={reloadCursor}
          onChangeCursorOffset={setReloadCursor}
        />
      </Box>
      <Text dimColor>
        By selecting Agree, you authorize Anthropic to automatically charge{' '}
        {paymentMethodLabel(paymentMethod)} on a recurring basis whenever your
        balance reaches the threshold, per the Consumer Terms (
        {CONSUMER_TERMS_URL}). Turn off any time here or at{' '}
        {EXTRA_USAGE_SETTINGS_URL}.
      </Text>
      <Select
        options={[
          {
            label: current?.enabled ? 'Agree and save' : 'Agree and turn on',
            value: 'save',
            disabled: Boolean(validation),
          },
          ...(current?.enabled
            ? [{ label: 'Turn off', value: 'off' as const }]
            : []),
          { label: 'Cancel', value: 'cancel' as const },
        ]}
        onChange={choice => {
          if (choice === 'save' && !validation) {
            onSave(true, thresholdCents, reloadToCents)
          } else if (choice === 'off') onSave(false)
          else if (choice === 'cancel') onCancel()
        }}
        onCancel={onCancel}
      />
      {validation && <Text color="error">· {validation}</Text>}
    </Dialog>
  )
}

function PurchasePolling({
  purchaseId,
  onSuccess,
  onError,
}: {
  purchaseId: string
  onSuccess: () => void
  onError: (message: string) => void
}): React.ReactNode {
  const successRef = useRef(onSuccess)
  const errorRef = useRef(onError)
  successRef.current = onSuccess
  errorRef.current = onError
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    const record = (status: string) =>
      logEvent('tengu_extra_usage_inline_dialog_buy_result', { status })
    const poll = async () => {
      if (cancelled) return
      attempts += 1
      if (attempts > PURCHASE_POLL_ATTEMPTS) {
        cancelled = true
        errorRef.current(
          'Purchase timed out — check claude.ai/settings/usage',
        )
        return
      }
      try {
        const result = await fetchExtraUsagePurchaseStatus(purchaseId)
        if (cancelled) return
        if (result.status === 'paid') {
          cancelled = true
          record('success')
          successRef.current()
        } else if (result.status === 'failed') {
          cancelled = true
          record('failed')
          errorRef.current('Payment failed')
        } else if (result.status === 'action_needed') {
          cancelled = true
          record('3ds_fallback')
          errorRef.current(
            `Your card requires additional verification — this purchase was not completed. Try again at ${EXTRA_USAGE_SETTINGS_URL}`,
          )
        } else {
          timer = setTimeout(() => void poll(), PURCHASE_POLL_INTERVAL_MS)
        }
      } catch (error) {
        if (cancelled) return
        cancelled = true
        logError(error as Error)
        errorRef.current('Failed to check purchase status')
      }
    }
    void poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [purchaseId])
  return (
    <AnimatedLoading message="Confirming payment… (may take a few seconds)" />
  )
}

function PurchaseSuccess({
  message,
  onDone,
}: {
  message: string
  onDone: () => void
}): React.ReactNode {
  return (
    <Box
      flexDirection="row"
      gap={2}
      alignItems="center"
      paddingTop={1}
    >
      <AnimatedClawd sequence="celebrate" onComplete={onDone} />
      <Box marginTop={1}>
        <Text color="success">{message}</Text>
      </Box>
    </Box>
  )
}

function ErrorDialog({
  message,
  onClose,
}: {
  message: string
  onClose: () => void
}): React.ReactNode {
  const handlers = useMemo(
    () => ({
      'confirm:yes': () => {
        void openBrowser(EXTRA_USAGE_SETTINGS_URL)
        onClose()
      },
    }),
    [onClose],
  )
  useKeybindings(handlers, { context: 'Confirmation' })
  return (
    <Dialog title="Extra usage" onCancel={onClose} color="error">
      <Box flexDirection="column" gap={1}>
        <Text color="error">{message}</Text>
        <Text dimColor>
          Enter to open {EXTRA_USAGE_SETTINGS_URL} · Esc to close
        </Text>
      </Box>
    </Dialog>
  )
}
