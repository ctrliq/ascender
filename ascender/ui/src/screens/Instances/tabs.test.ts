import { i18n } from '@lingui/core';
import { messages as englishMessages } from '../../locales/en/messages';
import { getInstanceTabs } from './tabs';

i18n.load('en', englishMessages);
i18n.activate('en');

describe('getInstanceTabs', () => {
  test('offers all four tabs to an admin or an auditor', () => {
    const all = [
      '/instances',
      '/instance_groups',
      '/container_groups',
      '/topology',
    ];
    expect(
      getInstanceTabs({ isSuperUser: true }).map((tab) => tab.path)
    ).toEqual(all);
    expect(
      getInstanceTabs({ isSystemAuditor: true }).map((tab) => tab.path)
    ).toEqual(all);
  });

  test('leaves out the tabs a user cannot open', () => {
    expect(getInstanceTabs({}).map((tab) => tab.path)).toEqual([
      '/instance_groups',
      '/container_groups',
    ]);
  });
});
