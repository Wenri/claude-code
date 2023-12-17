import React, { useEffect, useRef } from "react";
import { getIsNonInteractiveSession } from "../../bootstrap/state.js";
import {
  type Notification,
  useNotifications,
} from "../../context/notifications.js";
import { Text } from "../../ink.js";
import { logEvent } from "../../services/analytics/index.js";
import { getOauthProfileFromApiKey } from "../../services/oauth/getOauthProfile.js";
import { isClaudeAISubscriber } from "../../utils/auth.js";
import { isInBundledMode } from "../../utils/bundledMode.js";
import {
  isChromeExtensionInstalled,
  shouldEnableClaudeInChrome,
} from "../../utils/claudeInChrome/setup.js";
import { getGlobalConfig, saveGlobalConfig } from "../../utils/config.js";
import { logForDebugging } from "../../utils/debug.js";
import { getCurrentInstallationType } from "../../utils/doctorDiagnostic.js";
import { isEnvTruthy, isRunningOnHomespace } from "../../utils/envUtils.js";
import { logError } from "../../utils/log.js";
import { checkInstall } from "../../utils/nativeInstaller/index.js";
import { checkAndInstallOfficialMarketplace } from "../../utils/plugins/officialMarketplaceStartupCheck.js";
import {
  isProSwitchSuppressed,
  isUpgradeSuppressed,
} from "../../utils/subscriptionUpsell.js";

type StartupNotificationResult =
  | Notification
  | Notification[]
  | null
  | undefined;

type StartupNotificationConfig = {
  id: string;
  compute: () => StartupNotificationResult | Promise<StartupNotificationResult>;
  maxImpressions?: number;
  onShown?: () => void;
};

function getChromeFlag(): boolean | undefined {
  if (process.argv.includes("--chrome")) return true;
  if (process.argv.includes("--no-chrome")) return false;
  return undefined;
}

function recent(timestamp: number | undefined): boolean {
  return timestamp !== undefined && Date.now() - timestamp < 3_000;
}

async function getExistingClaudeSubscription(): Promise<"Max" | "Pro" | null> {
  if (isClaudeAISubscriber()) return null;
  const profile = await getOauthProfileFromApiKey();
  if (!profile) return null;
  if (profile.account.has_claude_max && !isUpgradeSuppressed()) return "Max";
  if (profile.account.has_claude_pro && !isProSwitchSuppressed()) return "Pro";
  return null;
}

const STARTUP_NOTIFICATIONS: StartupNotificationConfig[] = [
  {
    id: "npm-deprecation",
    compute: async () => {
      if (
        isInBundledMode() ||
        isEnvTruthy(process.env.DISABLE_INSTALLATION_CHECKS)
      ) {
        return null;
      }
      if ((await getCurrentInstallationType()) === "development") return null;
      return {
        timeoutMs: 15_000,
        key: "npm-deprecation-warning",
        text: "Claude Code has switched from npm to native installer. Run `claude install` or see https://docs.anthropic.com/en/docs/claude-code/getting-started for more options.",
        color: "warning",
        priority: "high",
      };
    },
  },
  {
    id: "official-marketplace",
    compute: async () => {
      const result = await checkAndInstallOfficialMarketplace();
      const notifications: Notification[] = [];
      if (result.configSaveFailed) {
        logForDebugging("Showing marketplace config save failure notification");
        notifications.push({
          key: "marketplace-config-save-failed",
          jsx: (
            <Text color="error">
              Failed to save marketplace retry info · Check ~/.claude.json
              permissions
            </Text>
          ),
          priority: "immediate",
          timeoutMs: 10_000,
        });
      }
      if (result.installed) {
        logForDebugging(
          "Showing marketplace installation success notification",
        );
        notifications.push({
          key: "marketplace-installed",
          jsx: (
            <Text color="success">
              ✓ Anthropic marketplace installed · /plugin to see available
              plugins
            </Text>
          ),
          priority: "immediate",
          timeoutMs: 7_000,
        });
      } else if (result.skipped && result.reason === "unknown") {
        logForDebugging(
          "Showing marketplace installation failure notification",
        );
        notifications.push({
          key: "marketplace-install-failed",
          jsx: (
            <Text color="warning">
              Failed to install Anthropic marketplace · Will retry on next
              startup
            </Text>
          ),
          priority: "immediate",
          timeoutMs: 8_000,
        });
      }
      return notifications;
    },
  },
  {
    id: "install-messages",
    compute: async () =>
      (await checkInstall()).map((message, index) => {
        let priority: Notification["priority"] = "low";
        if (message.type === "error" || message.userActionRequired) {
          priority = "high";
        } else if (message.type === "path" || message.type === "alias") {
          priority = "medium";
        }
        return {
          key: `install-message-${index}-${message.type}`,
          text: message.message,
          priority,
          color:
            message.type === "error"
              ? ("error" as const)
              : ("warning" as const),
        };
      }),
  },
  {
    id: "chrome-extension",
    compute: async () => {
      const chromeFlag = getChromeFlag();
      if (!shouldEnableClaudeInChrome(chromeFlag)) return null;
      if (!isClaudeAISubscriber()) {
        return {
          key: "chrome-requires-subscription",
          jsx: (
            <Text color="error">
              Claude in Chrome requires a claude.ai subscription
            </Text>
          ),
          priority: "immediate",
          timeoutMs: 5_000,
        };
      }
      if (!(await isChromeExtensionInstalled()) && !isRunningOnHomespace()) {
        return {
          key: "chrome-extension-not-detected",
          jsx: (
            <Text color="warning">
              Chrome extension not detected · https://claude.ai/chrome to
              install
            </Text>
          ),
          priority: "immediate",
          timeoutMs: 3_000,
        };
      }
      if (chromeFlag === undefined) {
        return {
          key: "claude-in-chrome-default-enabled",
          text: "Claude in Chrome enabled · /chrome",
          priority: "low",
        };
      }
      return null;
    },
  },
  {
    id: "model-migration",
    compute: () => {
      const config = getGlobalConfig();
      const notifications: Notification[] = [];
      if (recent(config.sonnet45To46MigrationTimestamp)) {
        notifications.push({
          key: "sonnet-46-update",
          text: "Model updated to Sonnet 4.6",
          color: "suggestion",
          priority: "high",
          timeoutMs: 3_000,
        });
      }
      const isLegacyRemap = Boolean(config.legacyOpusMigrationTimestamp);
      const timestamp =
        config.legacyOpusMigrationTimestamp ?? config.opusProMigrationTimestamp;
      if (recent(timestamp)) {
        notifications.push({
          key: "opus-pro-update",
          text: isLegacyRemap
            ? "Model updated to Opus 4.7 · Set CLAUDE_CODE_DISABLE_LEGACY_MODEL_REMAP=1 to opt out"
            : "Model updated to Opus 4.7",
          color: "suggestion",
          priority: "high",
          timeoutMs: isLegacyRemap ? 8_000 : 3_000,
        });
      }
      return notifications.length > 0 ? notifications : null;
    },
  },
  {
    id: "subscription-switch",
    maxImpressions: 3,
    onShown: () => logEvent("tengu_switch_to_subscription_notice_shown", {}),
    compute: async () => {
      const subscriptionType = await getExistingClaudeSubscription();
      if (subscriptionType === null) return null;
      return {
        key: "switch-to-subscription",
        jsx: (
          <Text color="suggestion">
            Use your existing Claude {subscriptionType} plan with Claude Code
            <Text color="text" dimColor>
              {" "}
              · /login to activate
            </Text>
          </Text>
        ),
        priority: "low",
      };
    },
  },
];

export function useStartupNotifications(
  configs: StartupNotificationConfig[] = STARTUP_NOTIFICATIONS,
): void {
  const { addNotification } = useNotifications();
  const hasRun = useRef(false);

  useEffect(() => {
    if (getIsNonInteractiveSession() || hasRun.current) return;
    hasRun.current = true;
    const seen = getGlobalConfig().seenNotifications ?? {};
    const shown: string[] = [];

    void Promise.allSettled(
      configs.map(async (config) => {
        if (
          config.maxImpressions !== undefined &&
          (seen[config.id] ?? 0) >= config.maxImpressions
        ) {
          return;
        }
        const computed = await config.compute();
        if (!computed || (Array.isArray(computed) && computed.length === 0)) {
          return;
        }
        for (const notification of Array.isArray(computed)
          ? computed
          : [computed]) {
          addNotification(notification);
        }
        config.onShown?.();
        if (config.maxImpressions !== undefined) shown.push(config.id);
      }),
    ).then((results) => {
      for (const result of results) {
        if (result.status === "rejected") logError(result.reason);
      }
      if (shown.length === 0) return;
      saveGlobalConfig((current) => {
        const next = { ...(current.seenNotifications ?? {}) };
        for (const id of shown) next[id] = (next[id] ?? 0) + 1;
        return { ...current, seenNotifications: next };
      });
    });
  }, [addNotification, configs]);
}
