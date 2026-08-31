import { isJsonString, jsonToYaml, parseVariableField } from 'util/yaml';

const parseHostFilter = (value) => {
  if (value.host_filter && value.host_filter.includes('host_filter=')) {
    return {
      ...value,
      host_filter: value.host_filter.slice('host_filter='.length),
    };
  }
  return value;
};
export default parseHostFilter;

export function getInventoryPath(inventory) {
  if (!inventory) return '/inventories';
  const url = {
    '': `/inventories/inventory/${inventory.id}`,
    smart: `/inventories/smart_inventory/${inventory.id}`,
    constructed: `/inventories/constructed_inventory/${inventory.id}`,
    federated: `/inventories/federated_inventory/${inventory.id}`,
  };
  return url[inventory.kind];
}

// The vmware source supports two inventory plugins: the deprecated
// community.vmware collection (the default) and its vmware.vmware
// replacement. The choice is carried in the `plugin` key of source_vars.
export const VMWARE_DEFAULT_PLUGIN = 'community.vmware.vmware_vm_inventory';
export const VMWARE_PLUGIN_OPTIONS = [
  {
    value: VMWARE_DEFAULT_PLUGIN,
    key: 'community.vmware',
    label: 'community.vmware',
  },
  {
    value: 'vmware.vmware.vms',
    key: 'vmware.vmware',
    label: 'vmware.vmware',
  },
];

export function getVmwarePlugin(sourceVars) {
  let plugin;
  try {
    ({ plugin } = parseVariableField(sourceVars || '---'));
  } catch (error) {
    return VMWARE_DEFAULT_PLUGIN;
  }
  return VMWARE_PLUGIN_OPTIONS.some(({ value }) => value === plugin)
    ? plugin
    : VMWARE_DEFAULT_PLUGIN;
}

export function mergeVmwarePlugin(sourceVars, plugin) {
  let parsed;
  try {
    parsed = parseVariableField(sourceVars || '---');
  } catch (error) {
    // let the API report the unparseable source_vars rather than clobber them
    return sourceVars;
  }
  if (
    parsed.plugin === plugin ||
    (plugin === VMWARE_DEFAULT_PLUGIN && parsed.plugin === undefined)
  ) {
    return sourceVars;
  }
  const merged = { ...parsed, plugin };
  return isJsonString(sourceVars)
    ? JSON.stringify(merged, null, 2)
    : jsonToYaml(JSON.stringify(merged));
}
