/*
 * The notification types the api knows, and what each is called.
 *
 * Kept here rather than with the notification template screens, because a
 * shared component, the notifications tab every template and organization
 * carries, names them too, and a component reaching into a screen for them
 * had the layers the wrong way round.
 */
import type { I18n, MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

/*
 * Descriptors rather than strings, so every place that names a type reads it
 * through the active locale. The brand names come out the same in most
 * languages, but a translator still gets to decide that.
 */
export const NOTIFICATION_TYPES = {
  email: msg`Email`,
  grafana: msg`Grafana`,
  irc: msg`IRC`,
  matrix: msg`Matrix`,
  mattermost: msg`Mattermost`,
  pagerduty: msg`Pagerduty`,
  rocketchat: msg`Rocket.Chat`,
  slack: msg`Slack`,
  twilio: msg`Twilio`,
  webhook: msg`Webhook`,
} satisfies Record<string, MessageDescriptor>;

/**
 * What a notification type is called, in the active locale.
 *
 * Args:
 *   type: The api's name for the type, such as `rocketchat`.
 *   i18n: The Lingui instance to translate with.
 *
 * Returns:
 *   The type's label, or the api's own name for a type this list does not
 *   know, so a row never shows up blank.
 */
export function getNotificationTypeLabel(
  type: string | null | undefined,
  i18n: I18n
): string {
  const descriptor = type
    ? (NOTIFICATION_TYPES as Record<string, MessageDescriptor | undefined>)[
        type
      ]
    : undefined;
  return descriptor ? i18n._(descriptor) : (type ?? '');
}

/**
 * The types as the search toolbar's options, value then label.
 *
 * Args:
 *   i18n: The Lingui instance to translate the labels with.
 *
 * Returns:
 *   One [value, label] pair per type, in the order the list above gives.
 */
export function getNotificationTypeOptions(i18n: I18n): [string, string][] {
  return Object.entries(NOTIFICATION_TYPES).map(([value, label]) => [
    value,
    i18n._(label),
  ]);
}
