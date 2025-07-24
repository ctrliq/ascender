import React from 'react';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import {
  Alert,
  AlertActionLink,
  ClipboardCopyButton,
  CodeBlock,
  CodeBlockAction,
  CodeBlockCode,
  ClipboardCopy,
  Form,
  FormFieldGroupExpandable,
  FormFieldGroupHeader,
  FormGroup,
  Panel,
  CardBody,
} from '@patternfly/react-core';
import {
  TableComposable,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
} from '@patternfly/react-table';
import { ExternalLinkAltIcon } from '@patternfly/react-icons';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import { useConfig } from 'contexts/Config';

function ConstructedInventoryHint() {
  const config = useConfig();
  const { i18n } = useLingui();

  return (
    <Alert
      isExpandable
      isInline
      variant="info"
      title={i18n._(msg`How to use constructed inventory plugin`)}
      actionLinks={
        <AlertActionLink
          href={`${getDocsBaseUrl(
            config
          )}/html/userguide/inventories.html#constructed-inventories`}
          component="a"
          target="_blank"
          rel="noopener noreferrer"
        >
          {i18n._(msg`View constructed inventory documentation here`)}{' '}
          <ExternalLinkAltIcon />
        </AlertActionLink>
      }
    >
      <span>
        {i18n._(msg`This table gives a few useful parameters of the constructed
               inventory plugin. For the full list of parameters `)}{' '}
        <a href="https://docs.ansible.com/ansible/latest/collections/ansible/builtin/constructed_inventory.html">
          {i18n._(msg`view the constructed inventory plugin docs here.`)}
        </a>
      </span>
      <br />
      <br />
      <TableComposable
        aria-label={i18n._(msg`Constructed inventory parameters table`)}
        variant="compact"
      >
        <Thead>
          <Tr>
            <Th>{i18n._(msg`Parameter`)}</Th>
            <Th>{i18n._(msg`Description`)}</Th>
          </Tr>
        </Thead>
        <Tbody>
          <Tr ouiaId="plugin-row">
            <Td dataLabel={i18n._(msg`name`)}>
              <code>plugin</code>
              <p style={{ color: 'blue' }}>{i18n._(msg`string`)}</p>
              <p style={{ color: 'red' }}>{i18n._(msg`required`)}</p>
            </Td>
            <Td dataLabel={i18n._(msg`description`)}>
              {i18n._(msg`Token that ensures this is a source file
              for the ‘constructed’ plugin.`)}
            </Td>
          </Tr>
          <Tr key="strict">
            <Td dataLabel={i18n._(msg`name`)}>
              <code>strict</code>
              <p style={{ color: 'blue' }}>{i18n._(msg`boolean`)}</p>
            </Td>
            <Td dataLabel={i18n._(msg`description`)}>
              {i18n._(msg`If yes make invalid entries a fatal error, otherwise skip and
              continue.`)}{' '}
              <br />
              {i18n._(msg`If users need feedback about the correctness
              of their constructed groups, it is highly recommended
              to use strict: true in the plugin configuration.`)}
            </Td>
          </Tr>
          <Tr key="groups">
            <Td dataLabel={i18n._(msg`name`)}>
              <code>groups</code>
              <p style={{ color: 'blue' }}>{i18n._(msg`dictionary`)}</p>
            </Td>
            <Td dataLabel={i18n._(msg`description`)}>
              {i18n._(msg`Add hosts to group based on Jinja2 conditionals.`)}
            </Td>
          </Tr>
          <Tr key="compose">
            <Td dataLabel={i18n._(msg`name`)}>
              <code>compose</code>
              <p style={{ color: 'blue' }}>{i18n._(msg`dictionary`)}</p>
            </Td>
            <Td dataLabel={i18n._(msg`description`)}>
              {i18n._(msg`Create vars from jinja2 expressions. This can be useful
              if the constructed groups you define do not contain the expected
              hosts. This can be used to add hostvars from expressions so
              that you know what the resultant values of those expressions are.`)}
            </Td>
          </Tr>
        </Tbody>
      </TableComposable>
      <br />
      <br />
      <Panel>
        <CardBody>
          <Form autoComplete="off">
            <b>{i18n._(msg`Constructed inventory examples`)}</b>
            <LimitToIntersectionExample i18n={i18n} />
            <FilterOnNestedGroupExample i18n={i18n} />
            <HostsByProcessorTypeExample i18n={i18n} />
          </Form>
        </CardBody>
      </Panel>
    </Alert>
  );
}

function LimitToIntersectionExample({ i18n }) {
  const [copied, setCopied] = React.useState(false);
  const clipboardCopyFunc = (event, text) => {
    navigator.clipboard.writeText(text.toString());
  };

  const onClick = (event, text) => {
    clipboardCopyFunc(event, text);
    setCopied(true);
  };

  const limitToIntersectionLimit = `is_shutdown:&product_dev`;
  const limitToIntersectionCode = `plugin: constructed
strict: true
groups:
  shutdown_in_product_dev: state | default("running") == "shutdown" and account_alias == "product_dev"`;

  return (
    <FormFieldGroupExpandable
      header={
        <FormFieldGroupHeader
          titleText={{
            text: i18n._(msg`Construct 2 groups, limit to intersection`),
            id: 'intersection-example',
          }}
          titleDescription={i18n._(msg`This constructed inventory input 
            creates a group for both of the categories and uses 
            the limit (host pattern) to only return hosts that 
            are in the intersection of those two groups.`)}
        />
      }
    >
      <FormGroup
        label={i18n._(msg`Limit`)}
        fieldId="intersection-example-limit"
      >
        <ClipboardCopy
          isReadOnly
          hoverTip={i18n._(msg`Copy`)}
          clickTip={i18n._(msg`Copied`)}
        >
          {limitToIntersectionLimit}
        </ClipboardCopy>
      </FormGroup>
      <FormGroup
        label={i18n._(msg`Source vars`)}
        fieldId="intersection-example-source-vars"
      >
        <CodeBlock
          actions={
            <CodeBlockAction>
              <ClipboardCopyButton
                id="intersection-example-source-vars"
                textId="intersection-example-source-vars"
                aria-label={i18n._(msg`Copy to clipboard`)}
                onClick={(e) => onClick(e, limitToIntersectionCode)}
                exitDelay={copied ? 1500 : 600}
                maxWidth="110px"
                variant="plain"
                onTooltipHidden={() => setCopied(false)}
              >
                {copied
                  ? i18n._(msg`Successfully copied to clipboard!`)
                  : i18n._(msg`Copy to clipboard`)}
              </ClipboardCopyButton>
            </CodeBlockAction>
          }
        >
          <CodeBlockCode id="intersection-example-source-vars">
            {limitToIntersectionCode}
          </CodeBlockCode>
        </CodeBlock>
      </FormGroup>
    </FormFieldGroupExpandable>
  );
}
function FilterOnNestedGroupExample({ i18n }) {
  const [copied, setCopied] = React.useState(false);
  const clipboardCopyFunc = (event, text) => {
    navigator.clipboard.writeText(text.toString());
  };

  const onClick = (event, text) => {
    clipboardCopyFunc(event, text);
    setCopied(true);
  };

  const nestedGroupsInventoryLimit = `groupA`;
  const nestedGroupsInventorySourceVars = `plugin: constructed`;
  const nestedGroupsInventory = `all:
  children:
    groupA:
      children:
        groupB:
          hosts:
            host1: {}
      vars:
        filter_var: filter_val
    ungrouped:
      hosts:
        host2: {}`;

  return (
    <FormFieldGroupExpandable
      header={
        <FormFieldGroupHeader
          titleText={{
            text: i18n._(msg`Filter on nested group name`),
            id: 'nested-groups-example',
          }}
          titleDescription={i18n._(msg`This constructed inventory input
            creates a group for both of the categories and uses
            the limit (host pattern) to only return hosts that
            are in the intersection of those two groups.`)}
        />
      }
    >
      <FormGroup>
        <p>{i18n._(msg`Nested groups inventory definition:`)}</p>
        <CodeBlock>
          <CodeBlockCode id="nested-groups-example-inventory">
            {nestedGroupsInventory}
          </CodeBlockCode>
        </CodeBlock>
      </FormGroup>
      <FormGroup
        label={i18n._(msg`Limit`)}
        fieldId="nested-groups-example-limit"
      >
        <ClipboardCopy
          isReadOnly
          hoverTip={i18n._(msg`Copy`)}
          clickTip={i18n._(msg`Copied`)}
        >
          {nestedGroupsInventoryLimit}
        </ClipboardCopy>
      </FormGroup>
      <FormGroup
        label={i18n._(msg`Source vars`)}
        fieldId="nested-groups-example-source-vars"
      >
        <CodeBlock
          actions={
            <CodeBlockAction>
              <ClipboardCopyButton
                id="nested-groups-example-source-vars"
                textId="nested-groups-example-source-vars"
                aria-label={i18n._(msg`Copy to clipboard`)}
                onClick={(e) => onClick(e, nestedGroupsInventorySourceVars)}
                exitDelay={copied ? 1500 : 600}
                maxWidth="110px"
                variant="plain"
                onTooltipHidden={() => setCopied(false)}
              >
                {copied
                  ? i18n._(msg`Successfully copied to clipboard!`)
                  : i18n._(msg`Copy to clipboard`)}
              </ClipboardCopyButton>
            </CodeBlockAction>
          }
        >
          <CodeBlockCode id="nested-groups-example-source-vars">
            {nestedGroupsInventorySourceVars}
          </CodeBlockCode>
        </CodeBlock>
      </FormGroup>
    </FormFieldGroupExpandable>
  );
}
function HostsByProcessorTypeExample({ i18n }) {
  const [copied, setCopied] = React.useState(false);
  const clipboardCopyFunc = (event, text) => {
    navigator.clipboard.writeText(text.toString());
  };

  const onClick = (event, text) => {
    clipboardCopyFunc(event, text);
    setCopied(true);
  };

  const hostsByProcessorLimit = `intel_hosts`;
  const hostsByProcessorSourceVars = `plugin: constructed
strict: true
groups:
  intel_hosts: "'GenuineIntel' in ansible_processor"`;

  return (
    <FormFieldGroupExpandable
      header={
        <FormFieldGroupHeader
          titleText={{
            text: i18n._(msg`Hosts by processor type`),
            id: 'processor-example',
          }}
          titleDescription={i18n._(msg`It is hard to give a specification for
            the inventory for Ansible facts, because to populate
            the system facts you need to run a playbook against
            the inventory that has \`gather_facts: true\`. The
            actual facts will differ system-to-system.`)}
        />
      }
    >
      <FormGroup label={i18n._(msg`Limit`)} fieldId="processor-example-limit">
        <ClipboardCopy
          isReadOnly
          hoverTip={i18n._(msg`Copy`)}
          clickTip={i18n._(msg`Copied`)}
        >
          {hostsByProcessorLimit}
        </ClipboardCopy>
      </FormGroup>
      <FormGroup
        label={i18n._(msg`Source vars`)}
        fieldId="processor-example-source-vars"
      >
        <CodeBlock
          actions={
            <CodeBlockAction>
              <ClipboardCopyButton
                id="processor-example-source-vars"
                textId="processor-example-source-vars"
                aria-label={i18n._(msg`Copy to clipboard`)}
                onClick={(e) => onClick(e, hostsByProcessorSourceVars)}
                exitDelay={copied ? 1500 : 600}
                maxWidth="110px"
                variant="plain"
                onTooltipHidden={() => setCopied(false)}
              >
                {copied
                  ? i18n._(msg`Successfully copied to clipboard!`)
                  : i18n._(msg`Copy to clipboard`)}
              </ClipboardCopyButton>
            </CodeBlockAction>
          }
        >
          <CodeBlockCode id="processor-example-source-vars">
            {hostsByProcessorSourceVars}
          </CodeBlockCode>
        </CodeBlock>
      </FormGroup>
    </FormFieldGroupExpandable>
  );
}

export default ConstructedInventoryHint;
