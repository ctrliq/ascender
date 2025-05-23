/* eslint-disable react/destructuring-assignment */
import React from 'react';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { Link } from 'react-router-dom';

const ansibleDocUrls = {
  ec2: 'https://docs.ansible.com/ansible/latest/collections/amazon/aws/aws_ec2_inventory.html',
  azure_rm:
    'https://docs.ansible.com/ansible/latest/collections/azure/azcollection/azure_rm_inventory.html',
  controller:
    'https://docs.ansible.com/ansible/latest/collections/awx/awx/tower_inventory.html',
  gce: 'https://docs.ansible.com/ansible/latest/collections/google/cloud/gcp_compute_inventory.html',
  insights:
    'https://docs.ansible.com/ansible/latest/collections/redhatinsights/insights/insights_inventory.html',
  openstack:
    'https://docs.ansible.com/ansible/latest/collections/openstack/cloud/openstack_inventory.html',
  satellite6:
    'https://docs.ansible.com/ansible/latest/collections/theforeman/foreman/foreman_inventory.html',
  rhv: 'https://docs.ansible.com/ansible/latest/collections/ovirt/ovirt/ovirt_inventory.html',
  vmware:
    'https://docs.ansible.com/ansible/latest/collections/community/vmware/vmware_vm_inventory_inventory.html',
  constructed:
    'https://docs.ansible.com/ansible/latest/collections/ansible/builtin/constructed_inventory.html',
  terraform:
    'https://github.com/ansible-collections/cloud.terraform/blob/stable-statefile-inventory/plugins/inventory/terraform_state.py',
};

function useInventoryHelpTextStrings() {
  const { i18n } = useLingui();
  return {
    labels: i18n._(msg`Optional labels that describe this inventory,
          such as 'dev' or 'test'. Labels can be used to group and filter
          inventories and completed jobs.`),
    variables: () => {
      const jsonExample = `
      {
        "somevar": "somevalue"
        "somepassword": "Magic"
      }
    `;
      const yamlExample = `
      ---
      somevar: somevalue
      somepassword: magic
    `;

      return (
        <>
          {i18n._(msg`Variables must be in JSON or YAML syntax. Use the radio button to toggle between the two.`)}
          <br />
          <br />
          {i18n._(msg`JSON:`)}
          <pre>{jsonExample}</pre>
          <br />
          {i18n._(msg`YAML:`)}
          <pre>{yamlExample}</pre>
          <br />
          {i18n._(msg`View JSON examples at`)}{' '}
          <a
            href="http://www.json.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            {i18n._(msg`www.json.org`)}
          </a>
          <br />
          {i18n._(msg`View YAML examples at`)}{' '}
          <a
            href="http://docs.ansible.com/YAMLSyntax.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            {i18n._(msg`docs.ansible.com`)}
          </a>
        </>
      );
    },
    subFormVerbosityFields: i18n._(msg`Control the level of output Ansible will produce for inventory source update jobs.`),
    subFormOptions: {
      overwrite: (
        <>
          {i18n._(msg`If checked, any hosts and groups that were previously present on the external source but are now removed will be removed from the inventory. Hosts and groups that were not managed by the inventory source will be promoted to the next manually created group or if there is no manually created group to promote them into, they will be left in the "all" default group for the inventory.`)}
          <br />
          <br />
          {i18n._(msg`When not checked, local child hosts and groups not found on the external source will remain untouched by the inventory update process.`)}
        </>
      ),
      overwriteVariables: (
        <>
          {i18n._(msg`If checked, all variables for child groups and hosts will be removed and replaced by those found on the external source.`)}
          <br />
          <br />
          {i18n._(msg`When not checked, a merge will be performed, combining local variables with those found on the external source.`)}
        </>
      ),
      updateOnLaunch: ({ value }) => (
        <>
          <div>
            {i18n._(msg`Each time a job runs using this inventory, refresh the inventory from the selected source before executing job tasks.`)}
          </div>
          <br />
          {value && (
            <div>
              {i18n._(msg`If you want the Inventory Source to update on launch , click on Update on Launch, and also go to `)}
              <Link to={`/projects/${value.id}/details`}> {value.name} </Link>
              {i18n._(msg`and click on Update Revision on Launch.`)}
            </div>
          )}
        </>
      ),
      updateOnProjectUpdate: ({ value }) => (
        <>
          <div>
            {i18n._(msg`After every project update where the SCM revision changes, refresh the inventory from the selected source before executing job tasks. This is intended for static content, like the Ansible inventory .ini file format.`)}
          </div>
          <br />
          {value && (
            <div>
              {i18n._(msg`If you want the Inventory Source to update on launch , click on Update on Launch, and also go to `)}
              <Link to={`/projects/${value.id}/details`}> {value.name} </Link>
              {i18n._(msg`and click on Update Revision on Launch`)}
            </div>
          )}
        </>
      ),
      cachedTimeOut: i18n._(msg`Time in seconds to consider an inventory sync to be current. During job runs and callbacks the task system will evaluate the timestamp of the latest sync. If it is older than Cache Timeout, it is not considered current, and a new inventory sync will be performed.`),
    },
    enabledVariableField: i18n._(msg`Retrieve the enabled state from the given dict of host variables. The enabled variable may be specified using dot notation, e.g: 'foo.bar'`),
    sourceControlBranch: i18n._(msg`Branch to use on inventory sync. Project default used if blank. Only allowed if project allow_override field is set to true.`),
    enabledValue: i18n._(msg`This field is ignored unless an Enabled Variable is set. If the enabled variable matches this value, the host will be enabled on import.`),
    hostFilter: i18n._(msg`Regular expression where only matching host names will be imported. The filter is applied as a post-processing step after any inventory plugin filters are applied.`),
    sourceVars: (docsBaseUrl, source) => {
      const docsUrl = `${docsBaseUrl}/html/userguide/inventories.html#inventory-plugins`;
      let sourceType = '';
      if (source && source !== 'scm') {
        const type = ansibleDocUrls[source].split(/[/,.]/);
        sourceType = type[type.length - 2];
      }
      return (
        <>
          {i18n._(msg`Variables used to configure the inventory source. For a detailed description of how to configure this plugin, see`)}{' '}
          <a
            href={docsBaseUrl ? docsUrl : ''}
            target="_blank"
            rel="noopener noreferrer"
          >
            {i18n._(msg`Inventory Plugins`)}
          </a>{' '}
          {i18n._(msg`in the documentation and the`)}{' '}
          <a
            href={ansibleDocUrls[source]}
            target="_blank"
            rel="noopener noreferrer"
          >
            {sourceType}
          </a>{' '}
          {i18n._(msg`plugin configuration guide.`)}
          <br />
          <br />
        </>
      );
    },
    constructedInventorySourceVars: () => {
      const yamlExample = `
      ---
      plugin: constructed
      strict: true
      use_vars_plugins: true
    `;
      return (
        <>
          {i18n._(msg`Variables used to configure the constructed inventory plugin. For a detailed description of how to configure this plugin, see`)}{' '}
          <a
            href={ansibleDocUrls.constructed}
            target="_blank"
            rel="noopener noreferrer"
          >
            {i18n._(msg`constructed inventory`)}
          </a>{' '}
          {i18n._(msg`plugin configuration guide.`)}
          <br />
          <br />
          <hr />
          <br />
          {i18n._(msg`Variables must be in JSON or YAML syntax. Use the radio button to toggle between the two.`)}
          <br />
          <br />
          {i18n._(msg`YAML:`)}
          <pre>{yamlExample}</pre>
        </>
      );
    },
    sourcePath: i18n._(msg`The inventory file to be synced by this source. You can select from the dropdown or enter a file within the input.`),
    preventInstanceGroupFallback: i18n._(msg`If enabled, the inventory will prevent adding any organization instance groups to the list of preferred instances groups to run associated job templates on. Note: If this setting is enabled and you provided an empty list, the global instance groups will be applied.`),
    enabledOptions: (
      <p>{i18n._(msg`Prevent Instance Group Fallback: If enabled, the inventory will prevent adding any organization instance groups to the list of preferred instances groups to run associated job templates on.`)}</p>
    ),
  };
}

export default useInventoryHelpTextStrings;
