import { setupI18n } from '@lingui/core';
import {
  NOTIFICATION_TYPES,
  getNotificationTypeLabel,
  getNotificationTypeOptions,
} from './notificationTypes';

/*
 * The type names are read through the active locale, so a catalogue that
 * translates one is what the filter and the rows show.
 */
describe('notification type names', () => {
  const i18n = setupI18n();
  i18n.load('es', { [NOTIFICATION_TYPES.email.id]: 'Correo' });
  i18n.activate('es');

  test('the filter options are translated', () => {
    const options = getNotificationTypeOptions(i18n);
    expect(options).toContainEqual(['email', 'Correo']);
    expect(options.map(([value]) => value)).not.toContain('hipchat');
  });

  test('a row names its type in the active locale', () => {
    expect(getNotificationTypeLabel('email', i18n)).toBe('Correo');
  });

  test('a type the list does not know keeps the api name', () => {
    expect(getNotificationTypeLabel('hipchat', i18n)).toBe('hipchat');
  });
});
