/*
  Modifications Copyright (c) 2023 Ctrl IQ, Inc.
*/

import 'styled-components/macro';
import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button, Popover, Tooltip, Chip } from '@patternfly/react-core';
import { Tr, Td, ExpandableRowContent } from '@patternfly/react-table';
import { msg, Trans } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import {
  ExclamationTriangleIcon,
  PencilAltIcon,
  ProjectDiagramIcon,
  RocketIcon,
} from '@patternfly/react-icons';
import styled from 'styled-components';
import { timeOfDay, formatDateString } from 'util/dates';
import { JobTemplatesAPI, WorkflowJobTemplatesAPI } from 'api';
import { toTitleCase } from 'util/strings';
import getDocsBaseUrl from 'util/getDocsBaseUrl';
import { useConfig } from 'contexts/Config';
import { ActionsTd, ActionItem, TdBreakWord } from '../PaginatedTable';
import { DetailList, Detail, DeletedDetail } from '../DetailList';
import ChipGroup from '../ChipGroup';
import CredentialChip from '../CredentialChip';
import ExecutionEnvironmentDetail from '../ExecutionEnvironmentDetail';
import { LaunchButton } from '../LaunchButton';
import Sparkline from '../Sparkline';
import CopyButton from '../CopyButton';

const ExclamationTriangleIconWarning = styled(ExclamationTriangleIcon)`
  color: var(--pf-global--warning-color--100);
  margin-left: 18px;
  cursor: pointer;
`;

ExclamationTriangleIconWarning.displayName = 'ExclamationTriangleIconWarning';

function TemplateListItem({
  isExpanded,
  onExpand,
  template,
  isSelected,
  onSelect,
  onCopy,
  detailUrl,
  fetchTemplates,
  rowIndex,
}) {
  const { i18n } = useLingui();
  const config = useConfig();
  const [isDisabled, setIsDisabled] = useState(false);
  const labelId = `check-action-${template.id}`;

  const docsLink = `${getDocsBaseUrl(
    config
  )}/html/upgrade-migration-guide/upgrade_to_ees.html`;

  const copyTemplate = useCallback(async () => {
    let response;
    if (template.type === 'job_template') {
      response = await JobTemplatesAPI.copy(template.id, {
        name: `${template.name} @ ${timeOfDay()}`,
      });
    } else {
      response = await WorkflowJobTemplatesAPI.copy(template.id, {
        name: `${template.name} @ ${timeOfDay()}`,
      });
    }
    if (response.status === 201) {
      onCopy(response.data.id);
    }
    await fetchTemplates();
  }, [fetchTemplates, template.id, template.name, template.type, onCopy]);

  const handleCopyStart = useCallback(() => {
    setIsDisabled(true);
  }, []);

  const handleCopyFinish = useCallback(() => {
    setIsDisabled(false);
  }, []);

  const {
    summary_fields: summaryFields,
    ask_inventory_on_launch: askInventoryOnLaunch,
  } = template;

  const missingResourceIcon =
    template.type === 'job_template' &&
    (!summaryFields.project ||
      (!summaryFields.inventory && !askInventoryOnLaunch));

  const missingExecutionEnvironment =
    template.type === 'job_template' &&
    template.custom_virtualenv &&
    !template.execution_environment;

  const inventoryValue = (kind, id) => {
    const inventorykind = kind === 'smart' ? 'smart_inventory' : 'inventory';

    return askInventoryOnLaunch ? (
      <>
        <Link to={`/inventories/${inventorykind}/${id}/details`}>
          {summaryFields.inventory.name}
        </Link>
        <span> {i18n._(msg`(Prompt on launch)`)}</span>
      </>
    ) : (
      <Link to={`/inventories/${inventorykind}/${id}/details`}>
        {summaryFields.inventory.name}
      </Link>
    );
  };
  let lastRun = '';
  const mostRecentJob = template.summary_fields.recent_jobs
    ? template.summary_fields.recent_jobs[0]
    : null;
  if (mostRecentJob) {
    lastRun = mostRecentJob.finished
      ? formatDateString(mostRecentJob.finished)
      : i18n._(msg`Running`);
  }

  return (
    <>
      <Tr
        id={`template-row-${template.id}`}
        ouiaId={`template-row-${template.id}`}
      >
        <Td
          expand={{
            rowIndex,
            isExpanded,
            onToggle: onExpand,
          }}
        />
        <Td
          select={{
            rowIndex,
            isSelected,
            onSelect,
          }}
          dataLabel={i18n._(msg`Selected`)}
        />
        <TdBreakWord id={labelId} dataLabel={i18n._(msg`Name`)}>
          <Link to={`${detailUrl}`}>
            <b>{template.name}</b>
          </Link>
          {missingResourceIcon && (
            <span>
              <Tooltip
                content={i18n._(msg`Resources are missing from this template.`)}
                position="right"
              >
                <ExclamationTriangleIcon css="color: #c9190b; margin-left: 20px;" />
              </Tooltip>
            </span>
          )}
          {missingExecutionEnvironment && (
            <span>
              <Popover
                className="missing-execution-environment"
                headerContent={
                  <div>{i18n._(msg`Execution Environment Missing`)}</div>
                }
                bodyContent={
                  <div>
                    <Trans>
                      Custom virtual environment {template.custom_virtualenv}{' '}
                      must be replaced by an execution environment. For more
                      information about migrating to execution environments see{' '}
                      <a
                        href={docsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        the documentation.
                      </a>
                    </Trans>
                  </div>
                }
                position="right"
              >
                <ExclamationTriangleIconWarning />
              </Popover>
            </span>
          )}
        </TdBreakWord>
        <Td dataLabel={i18n._(msg`Activity`)}>
          {summaryFields.recent_jobs ? (
            <Sparkline jobs={summaryFields.recent_jobs} />
          ) : null}
        </Td>
        <Td dataLabel={i18n._(msg`Last Ran`)}>{lastRun}</Td>
        <Td dataLabel={i18n._(msg`Type`)}>{toTitleCase(template.type)}</Td>
        <ActionsTd dataLabel={i18n._(msg`Actions`)}>
          <ActionItem
            visible={template.type === 'workflow_job_template'}
            tooltip={i18n._(msg`Visualizer`)}
          >
            <Button
              ouiaId={`${template.id}-visualizer-button`}
              id={`template-action-visualizer-${template.id}`}
              isDisabled={isDisabled}
              aria-label={i18n._(msg`Visualizer`)}
              variant="plain"
              component={Link}
              to={`/templates/workflow_job_template/${template.id}/visualizer`}
            >
              <ProjectDiagramIcon />
            </Button>
          </ActionItem>
          <ActionItem
            visible={template.summary_fields.user_capabilities.start}
            tooltip={i18n._(msg`Launch Template`)}
          >
            <LaunchButton resource={template}>
              {({ handleLaunch, isLaunching }) => (
                <Button
                  ouiaId={`${template.id}-launch-button`}
                  id={`template-action-launch-${template.id}`}
                  isDisabled={isDisabled || isLaunching}
                  aria-label={i18n._(msg`Launch template`)}
                  variant="plain"
                  onClick={handleLaunch}
                >
                  <RocketIcon />
                </Button>
              )}
            </LaunchButton>
          </ActionItem>
          <ActionItem
            visible={template.summary_fields.user_capabilities.edit}
            tooltip={i18n._(msg`Edit Template`)}
          >
            <Button
              ouiaId={`${template.id}-edit-button`}
              id={`template-action-edit-${template.id}`}
              isDisabled={isDisabled}
              aria-label={i18n._(msg`Edit Template`)}
              variant="plain"
              component={Link}
              to={`/templates/${template.type}/${template.id}/edit`}
            >
              <PencilAltIcon />
            </Button>
          </ActionItem>
          <ActionItem
            tooltip={i18n._(msg`Copy Template`)}
            visible={template.summary_fields.user_capabilities.copy}
          >
            <CopyButton
              id={`template-action-copy-${template.id}`}
              errorMessage={i18n._(msg`Failed to copy template.`)}
              isDisabled={isDisabled}
              onCopyStart={handleCopyStart}
              onCopyFinish={handleCopyFinish}
              copyItem={copyTemplate}
            />
          </ActionItem>
        </ActionsTd>
      </Tr>
      <Tr
        isExpanded={isExpanded}
        ouiaId={`template-row-${template.id}-expanded`}
      >
        <Td colSpan={2} />
        <Td colSpan={4}>
          <ExpandableRowContent>
            <DetailList>
              <Detail
                label={i18n._(msg`Description`)}
                value={template.description}
                dataCy={`template-${template.id}-description`}
              />
              {summaryFields.organization ? (
                <Detail
                  label={i18n._(msg`Organization`)}
                  value={
                    <Link
                      to={`/organizations/${summaryFields.organization.id}/details`}
                    >
                      {summaryFields.organization.name}
                    </Link>
                  }
                  dataCy={`template-${template.id}-organization`}
                />
              ) : null}
              {summaryFields.inventory ? (
                <Detail
                  label={i18n._(msg`Inventory`)}
                  value={inventoryValue(
                    summaryFields.inventory.kind,
                    summaryFields.inventory.id
                  )}
                  dataCy={`template-${template.id}-inventory`}
                />
              ) : (
                !askInventoryOnLaunch &&
                template.type === 'job_template' && (
                  <DeletedDetail label={i18n._(msg`Inventory`)} />
                )
              )}
              {summaryFields.project && (
                <Detail
                  label={i18n._(msg`Project`)}
                  value={
                    <Link to={`/projects/${summaryFields.project.id}/details`}>
                      {summaryFields.project.name}
                    </Link>
                  }
                  dataCy={`template-${template.id}-project`}
                />
              )}
              {template.type === 'job_template' && (
                <ExecutionEnvironmentDetail
                  virtualEnvironment={template.custom_virtualenv}
                  executionEnvironment={summaryFields?.execution_environment}
                />
              )}
              <Detail
                label={i18n._(msg`Last Modified`)}
                value={formatDateString(template.modified)}
                dataCy={`template-${template.id}-last-modified`}
              />
              {summaryFields.credentials ? (
                <Detail
                  fullWidth
                  label={i18n._(msg`Credentials`)}
                  value={
                    <ChipGroup
                      numChips={5}
                      totalChips={summaryFields.credentials.length}
                      ouiaId={`template-${template.id}-credential-chips`}
                    >
                      {summaryFields.credentials.map((c) => (
                        <CredentialChip
                          key={c.id}
                          credential={c}
                          isReadOnly
                          ouiaId={`credential-${c.id}-chip`}
                        />
                      ))}
                    </ChipGroup>
                  }
                  dataCy={`template-${template.id}-credentials`}
                  isEmpty={summaryFields.credentials.length === 0}
                />
              ) : null}
              {summaryFields.labels && (
                <Detail
                  fullWidth
                  label={i18n._(msg`Labels`)}
                  value={
                    <ChipGroup
                      numChips={5}
                      totalChips={summaryFields.labels.results.length}
                      ouiaId={`template-${template.id}-label-chips`}
                    >
                      {summaryFields.labels.results.map((l) => (
                        <Chip
                          key={l.id}
                          isReadOnly
                          ouiaId={`label-${l.id}-chip`}
                        >
                          {l.name}
                        </Chip>
                      ))}
                    </ChipGroup>
                  }
                  dataCy={`template-${template.id}-labels`}
                  isEmpty={summaryFields.labels.results.length === 0}
                />
              )}
            </DetailList>
          </ExpandableRowContent>
        </Td>
      </Tr>
    </>
  );
}

export { TemplateListItem as _TemplateListItem };
export default TemplateListItem;
