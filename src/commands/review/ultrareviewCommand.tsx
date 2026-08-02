import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.js'
import React from 'react'
import { extraUsage } from '../extra-usage/index.js'
import { logEvent } from '../../services/analytics/index.js'
import { isPolicyAllowed } from '../../services/policyLimits/index.js'
import type {
  LocalJSXCommandCall,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import { hasClaudeAiBillingAccess } from '../../utils/billing.js'
import {
  checkOverageGate,
  confirmOverage,
  launchRemoteReview,
  prepareRemoteReviewScope,
  type RemoteReviewScope,
} from './reviewRemote.js'
import { UltrareviewOverageDialog } from './UltrareviewOverageDialog.js'
import { getUltrareviewDurationNote } from './ultrareviewEnabled.js'

function contentBlocksToString(blocks: ContentBlockParam[]): string {
  return blocks
    .map(block => (block.type === 'text' ? block.text : ''))
    .filter(Boolean)
    .join('\n')
}

async function launchAndDone(
  scope: RemoteReviewScope,
  context: Parameters<LocalJSXCommandCall>[1],
  onDone: LocalJSXCommandOnDone,
  billingNote: string,
  signal?: AbortSignal,
): Promise<void> {
  const result = await launchRemoteReview(scope, context, billingNote)
  if (signal?.aborted) return
  if (result) {
    onDone(contentBlocksToString(result.blocks), {
      shouldQuery: true,
      metaMessages: result.launched
        ? [
            'The output above is already visible to the user. Briefly acknowledge it without repeating the target, URL, or billing note. Findings will arrive via task-notification.',
          ]
        : undefined,
    })
  } else {
    onDone(
      'Ultrareview failed to launch the remote session. Check that this is a GitHub repo and try again.',
      { display: 'system' },
    )
  }
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  if (!isPolicyAllowed('allow_remote_sessions')) {
    onDone(
      "Remote sessions are disabled by your organization's policy. Contact your organization admin to enable them.",
      { display: 'system' },
    )
    return null
  }

  const [prepared, gate] = await Promise.all([
    prepareRemoteReviewScope(args),
    checkOverageGate(),
  ])
  if (!prepared.ok) {
    onDone(prepared.error, { display: 'system' })
    return null
  }
  const scope = prepared.scope

  switch (gate.kind) {
    case 'blocked': {
      logEvent('tengu_review_overage_blocked', { reason: gate.reason })
      const action = gate.actionUrl ? `\n  → ${gate.actionUrl}` : ''
      const requestHint =
        gate.actionUrl?.includes('/admin-settings/') &&
        extraUsage.isEnabled() &&
        !hasClaudeAiBillingAccess()
          ? '\n  Run /extra-usage to request this from your admin.'
          : ''
      onDone(`${gate.message}${action}${requestHint}`, { display: 'system' })
      return null
    }
    case 'needs-confirm':
    case 'proceed': {
      if (gate.kind === 'needs-confirm') {
        logEvent('tengu_review_overage_dialog_shown', {})
      }
      return (
        <UltrareviewOverageDialog
          subtitle={
            gate.kind === 'needs-confirm'
              ? getUltrareviewDurationNote()
              : gate.billingNote || null
          }
          body={gate.kind === 'needs-confirm' ? gate.body : undefined}
          scope={scope}
          onProceed={async signal => {
            await launchAndDone(
              scope,
              context,
              onDone,
              gate.billingNote,
              signal,
            )
            if (!signal.aborted && gate.kind === 'needs-confirm') {
              confirmOverage()
            }
          }}
          onCancel={() =>
            onDone('Ultrareview cancelled.', { display: 'system' })
          }
        />
      )
    }
  }
}
