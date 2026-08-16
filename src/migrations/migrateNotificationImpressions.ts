import {
  type GlobalConfig,
  getGlobalConfig,
  saveGlobalConfig,
} from "../utils/config.js";

const LEGACY_NOTIFICATION_KEYS: Record<string, keyof GlobalConfig> = {
  "subscription-switch": "subscriptionNoticeCount",
};

export function migrateNotificationImpressions(): void {
  const config = getGlobalConfig();
  if (config.seenNotifications !== undefined) return;

  const seenNotifications: Record<string, number> = {};
  for (const [id, legacyKey] of Object.entries(LEGACY_NOTIFICATION_KEYS)) {
    const legacyValue: unknown = config[legacyKey];
    if (typeof legacyValue === "number" && legacyValue > 0) {
      seenNotifications[id] = legacyValue;
    } else if (legacyValue === true) {
      seenNotifications[id] = 1;
    }
  }

  saveGlobalConfig((current) =>
    current.seenNotifications !== undefined
      ? current
      : { ...current, seenNotifications },
  );
}
