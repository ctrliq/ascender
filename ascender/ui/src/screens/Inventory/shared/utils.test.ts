import parseHostFilter, {
  getGroupInventory,
  getInventoryPath,
  getInventoryType,
  getVmwarePlugin,
  mergeVmwarePlugin,
  VMWARE_DEFAULT_PLUGIN,
} from './utils';

describe('parseHostFilter', () => {
  test('parse host filter', () => {
    expect(
      parseHostFilter({
        host_filter:
          'host_filter=ansible_facts__ansible_processor[]="GenuineIntel"',
        name: 'Foo',
      })
    ).toEqual({
      host_filter: 'ansible_facts__ansible_processor[]="GenuineIntel"',
      name: 'Foo',
    });
  });
  test('do not parse host filter', () => {
    expect(parseHostFilter({ name: 'Foo' })).toEqual({
      name: 'Foo',
    });
  });
});

describe('getInventoryPath', () => {
  test('should return inventory path', () => {
    expect(getInventoryPath({ id: 1, kind: '' })).toMatch(
      '/inventories/inventory/1'
    );
  });
  test('should return smart inventory path', () => {
    expect(getInventoryPath({ id: 2, kind: 'smart' })).toMatch(
      '/inventories/smart_inventory/2'
    );
  });
  test('should return constructed inventory path', () => {
    expect(getInventoryPath({ id: 3, kind: 'constructed' })).toMatch(
      '/inventories/constructed_inventory/3'
    );
  });
});

describe('getVmwarePlugin', () => {
  test('defaults to community.vmware when no plugin key is set', () => {
    expect(getVmwarePlugin('---\nhostnames:\n  - config.name')).toEqual(
      VMWARE_DEFAULT_PLUGIN
    );
    expect(getVmwarePlugin('')).toEqual(VMWARE_DEFAULT_PLUGIN);
    expect(getVmwarePlugin(undefined)).toEqual(VMWARE_DEFAULT_PLUGIN);
  });
  test('returns supported plugin values', () => {
    expect(getVmwarePlugin('plugin: vmware.vmware.vms')).toEqual(
      'vmware.vmware.vms'
    );
    expect(
      getVmwarePlugin('plugin: community.vmware.vmware_vm_inventory')
    ).toEqual(VMWARE_DEFAULT_PLUGIN);
  });
  test('falls back to the default for unsupported or unparseable values', () => {
    expect(getVmwarePlugin('plugin: some.other.plugin')).toEqual(
      VMWARE_DEFAULT_PLUGIN
    );
    expect(getVmwarePlugin('this: is: not: yaml')).toEqual(
      VMWARE_DEFAULT_PLUGIN
    );
  });
});

describe('mergeVmwarePlugin', () => {
  test('leaves source vars untouched when default is selected and no plugin set', () => {
    const vars = '---\nhostnames:\n  - config.name';
    expect(mergeVmwarePlugin(vars, VMWARE_DEFAULT_PLUGIN)).toEqual(vars);
  });
  test('leaves source vars untouched when plugin already matches', () => {
    const vars = '# a comment\nplugin: vmware.vmware.vms';
    expect(mergeVmwarePlugin(vars, 'vmware.vmware.vms')).toEqual(vars);
  });
  test('writes the plugin key when the alternate collection is selected', () => {
    expect(
      mergeVmwarePlugin('---\nhostnames:\n  - config.name', 'vmware.vmware.vms')
    ).toEqual('hostnames:\n  - config.name\nplugin: vmware.vmware.vms\n');
  });
  test('overrides an existing plugin key when switching back to the default', () => {
    expect(
      mergeVmwarePlugin('plugin: vmware.vmware.vms', VMWARE_DEFAULT_PLUGIN)
    ).toEqual(`plugin: ${VMWARE_DEFAULT_PLUGIN}\n`);
  });
  test('preserves JSON formatting for JSON source vars', () => {
    expect(mergeVmwarePlugin('{"foo": "bar"}', 'vmware.vmware.vms')).toEqual(
      JSON.stringify({ foo: 'bar', plugin: 'vmware.vmware.vms' }, null, 2)
    );
  });
  test('returns unparseable source vars unchanged', () => {
    const vars = 'this: is: not: yaml';
    expect(mergeVmwarePlugin(vars, 'vmware.vmware.vms')).toEqual(vars);
  });
});

describe('getInventoryType', () => {
  test.each([
    ['', 'inventory'],
    [null, 'inventory'],
    ['smart', 'smart_inventory'],
    ['constructed', 'constructed_inventory'],
    ['federated', 'federated_inventory'],
  ])('names the type of a %s inventory', (kind, type) => {
    expect(getInventoryType(kind)).toBe(type);
  });
});

describe('getGroupInventory', () => {
  const groupIn = (kind?: string) => ({
    summary_fields: kind === undefined ? {} : { inventory: { id: 7, kind } },
  });

  test('follows the kind of the inventory the group is in', () => {
    expect(getGroupInventory(groupIn('constructed') as never)).toEqual({
      path: '/inventories/constructed_inventory/7',
      isReadOnly: true,
    });
    expect(getGroupInventory(groupIn('federated') as never).isReadOnly).toBe(
      true
    );
    expect(getGroupInventory(groupIn('') as never)).toEqual({
      path: '/inventories/inventory/7',
      isReadOnly: false,
    });
  });

  test('falls back to the inventory on screen', () => {
    expect(getGroupInventory(groupIn() as never, 3)).toEqual({
      path: '/inventories/inventory/3',
      isReadOnly: false,
    });
  });
});
