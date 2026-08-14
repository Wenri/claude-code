import axios from 'axios'
import { getOauthConfig } from '../../constants/oauth.js'
import { getOAuthHeaders, prepareApiRequest } from '../../utils/teleport/api.js'
import { logForDebugging } from '../../utils/debug.js'
import { logError } from '../../utils/log.js'
import { isEssentialTrafficOnly } from '../../utils/privacyLevel.js'

const DEFAULT_MONTHLY_SPEND_LIMIT_CENTS = 2_000

type UserFacingApiError = {
  error?: {
    message?: string
    details?: { error_visibility?: string }
  }
}

export type ExtraUsagePaymentMethod = {
  brand?: string | null
  type?: string | null
  last4?: string | null
}

export type ExtraUsageAutoReloadSettings = {
  enabled: boolean
  threshold_in_minor_units?: number | null
  reload_to_in_minor_units?: number | null
}

export type ExtraUsageBalance = {
  amount: number
  currency: string
  auto_reload_settings?: ExtraUsageAutoReloadSettings | null
}

export type ExtraUsageBundle = {
  id: string
  credit_minor_units: number
  price_minor_units: number
  discount_minor_units: number
  local_credit_minor_units: number
  local_price_minor_units: number
}

export type ExtraUsageBundles = {
  bundles: ExtraUsageBundle[]
  bundle_paid_this_month_minor_units: number
  bundle_monthly_cap_minor_units: number | null
  purchases_reset_at: string
  currency: string
  stripe_product_id?: string
}

export type ExtraUsagePurchase =
  | { kind: 'bundle'; bundle: ExtraUsageBundle }
  | { kind: 'custom'; amountCents: number }

export type ExtraUsagePurchaseResult = {
  payment_status: 'success' | 'pending_invoice' | 'requires_action' | string
  purchase_id?: string
  payment_intent_client_secret?: string
}

export type ExtraUsageTaxPreview = {
  tax_minor_units: number
  tax_rate_pct: number
  tax_label: string | null
}

export type ExtraUsagePurchaseStatus = {
  purchase_id: string
  status: 'paid' | 'pending' | 'failed' | 'action_needed' | string
  stripe_payment_intent_client_secret?: string | null
}

export function extractUserFacingExtraUsageError(error: unknown): string | null {
  if (!axios.isAxiosError<UserFacingApiError>(error)) return null
  const apiError = error.response?.data?.error
  if (apiError?.details?.error_visibility !== 'user_facing') return null
  return apiError.message ?? null
}

async function prepareExtraUsageApiRequest(): Promise<{
  headers: Record<string, string>
  orgUUID: string
  baseUrl: string
}> {
  if (isEssentialTrafficOnly()) {
    throw new Error('Extra usage not available in essential-traffic-only mode')
  }
  const { accessToken, orgUUID } = await prepareApiRequest()
  return {
    headers: {
      ...getOAuthHeaders(accessToken),
      'x-organization-uuid': orgUUID,
    },
    orgUUID,
    baseUrl: getOauthConfig().BASE_API_URL,
  }
}

export async function enableExtraUsage(): Promise<boolean> {
  try {
    const { headers, orgUUID, baseUrl } = await prepareExtraUsageApiRequest()
    await axios.post(
      `${baseUrl}/api/oauth/organizations/${orgUUID}/setup_overage_billing`,
      { org_monthly_spend_limit: DEFAULT_MONTHLY_SPEND_LIMIT_CENTS },
      { headers },
    )
    await axios.put(
      `${baseUrl}/api/oauth/organizations/${orgUUID}/overage_spend_limit`,
      { is_enabled: true },
      { headers },
    )
    return true
  } catch (error) {
    logError(error as Error)
    return false
  }
}

export async function setExtraUsageSpendLimit(
  monthlyCreditLimit: number | null,
  currency: string,
): Promise<boolean> {
  try {
    const { headers, orgUUID, baseUrl } = await prepareExtraUsageApiRequest()
    await axios.put(
      `${baseUrl}/api/oauth/organizations/${orgUUID}/overage_spend_limit`,
      {
        is_enabled: true,
        monthly_credit_limit: monthlyCreditLimit,
        currency,
      },
      { headers },
    )
    return true
  } catch (error) {
    logError(error as Error)
    return false
  }
}

export async function setExtraUsageAutoReload(
  enabled: boolean,
  thresholdInMinorUnits: number | undefined,
  reloadToInMinorUnits: number | undefined,
  currency: string,
): Promise<boolean> {
  try {
    const { headers, orgUUID, baseUrl } = await prepareExtraUsageApiRequest()
    await axios.put(
      `${baseUrl}/api/oauth/organizations/${orgUUID}/contracts/auto_reload_settings`,
      {
        enabled,
        ...(thresholdInMinorUnits !== undefined && {
          threshold_in_minor_units: thresholdInMinorUnits,
        }),
        ...(reloadToInMinorUnits !== undefined && {
          reload_to_in_minor_units: reloadToInMinorUnits,
        }),
        currency,
      },
      { headers },
    )
    return true
  } catch (error) {
    logError(error as Error)
    return false
  }
}

export async function fetchExtraUsageBalance(): Promise<ExtraUsageBalance | null> {
  try {
    const { headers, orgUUID, baseUrl } = await prepareExtraUsageApiRequest()
    const response = await axios.get<ExtraUsageBalance>(
      `${baseUrl}/api/oauth/organizations/${orgUUID}/prepaid/credits`,
      { headers, timeout: 5_000 },
    )
    return response.data
  } catch (error) {
    logError(error as Error)
    return null
  }
}

export async function fetchExtraUsageBundles(): Promise<ExtraUsageBundles | null> {
  try {
    const { headers, orgUUID, baseUrl } = await prepareExtraUsageApiRequest()
    const response = await axios.get<ExtraUsageBundles>(
      `${baseUrl}/api/oauth/organizations/${orgUUID}/prepaid/bundles`,
      { headers, timeout: 5_000 },
    )
    return response.data
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return null
    logError(error as Error)
    return null
  }
}

export async function fetchExtraUsagePaymentMethod(): Promise<ExtraUsagePaymentMethod | null> {
  const { headers, orgUUID, baseUrl } = await prepareExtraUsageApiRequest()
  const response = await axios.get<ExtraUsagePaymentMethod | null>(
    `${baseUrl}/api/oauth/organizations/${orgUUID}/payment_method`,
    { headers, timeout: 5_000 },
  )
  return response.data ?? null
}

export async function purchaseExtraUsage(
  purchase: ExtraUsagePurchase,
): Promise<ExtraUsagePurchaseResult> {
  const body =
    purchase.kind === 'bundle'
      ? {
          amount: purchase.bundle.credit_minor_units,
          bundle_id: purchase.bundle.id,
          expected_price_minor_units: purchase.bundle.price_minor_units,
        }
      : { amount: purchase.amountCents }
  const { headers, orgUUID, baseUrl } = await prepareExtraUsageApiRequest()
  const response = await axios.post<ExtraUsagePurchaseResult>(
    `${baseUrl}/api/oauth/organizations/${orgUUID}/contracts/prepaid/credits`,
    body,
    { headers },
  )
  return response.data
}

export async function fetchExtraUsageTaxPreview(
  price: number,
  currency: string,
  stripeProductId: string | undefined,
): Promise<ExtraUsageTaxPreview | null> {
  if (!stripeProductId) return null
  try {
    const { headers, orgUUID, baseUrl } = await prepareExtraUsageApiRequest()
    const response = await axios.post<{
      tax_rate: number | null
      tax_label?: string | null
    }>(
      `${baseUrl}/api/oauth/organizations/${orgUUID}/billing/tax_rate`,
      { product_id: stripeProductId, price, currency },
      { headers, timeout: 5_000 },
    )
    const taxRate = response.data.tax_rate
    if (taxRate == null) return null
    return {
      tax_minor_units: Math.round((price * taxRate) / 100),
      tax_rate_pct: taxRate,
      tax_label: response.data.tax_label ?? null,
    }
  } catch (error) {
    logForDebugging(`tax_rate preview unavailable: ${String(error)}`)
    return null
  }
}

export async function fetchExtraUsagePurchaseStatus(
  purchaseId: string,
): Promise<ExtraUsagePurchaseStatus> {
  const { headers, orgUUID, baseUrl } = await prepareExtraUsageApiRequest()
  const response = await axios.get<ExtraUsagePurchaseStatus>(
    `${baseUrl}/api/oauth/organizations/${orgUUID}/prepaid/commits/${purchaseId}`,
    { headers },
  )
  return response.data
}
