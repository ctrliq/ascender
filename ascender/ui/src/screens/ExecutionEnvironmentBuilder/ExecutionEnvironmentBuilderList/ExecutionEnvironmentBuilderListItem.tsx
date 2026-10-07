import type { ExecutionEnvironmentBuilder } from 'types/api';
import React, { useState, useCallback } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Link } from 'react-router';
import { Button } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { PencilAltIcon, RocketIcon } from '@patternfly/react-icons';

import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import { ActionsTd, ActionItem, TdBreakWord } from 'components/PaginatedTable';
import CopyButton from 'components/CopyButton';
import { ExecutionEnvironmentBuildersAPI } from 'api';
import { timeOfDay } from 'util/dates';
import useLaunchBuild from '../shared/useLaunchBuild';

export interface ExecutionEnvironmentBuilderListItemProps {
  executionEnvironmentBuilder: ExecutionEnvironmentBuilder;
  detailUrl: string;
  isSelected: boolean;
  /** Ticks the row's checkbox; the list holds which rows are selected. */
  onSelect: () => void;
  onCopy: (id: number) => void;
  rowIndex: number;
  /** Re-reads the page once the copy has landed. */
  fetchExecutionEnvironmentBuilders: () => Promise<unknown> | void;
}

function ExecutionEnvironmentBuilderListItem({
  executionEnvironmentBuilder: builder,
  detailUrl,
  isSelected,
  onSelect,
  onCopy,
  rowIndex,
  fetchExecutionEnvironmentBuilders,
}: ExecutionEnvironmentBuilderListItemProps) {
  const { t } = useLingui();
  const [isDisabled, setIsDisabled] = useState(false);
  const { launch, isLaunching, error, dismissError } = useLaunchBuild(
    builder.id
  );
  const capabilities = builder.summary_fields.user_capabilities;

  const copyBuilder = useCallback(async () => {
    const response = await ExecutionEnvironmentBuildersAPI.copy(builder.id, {
      name: `${builder.name} @ ${timeOfDay()}`,
    });
    if (response.status === 201) {
      onCopy(response.data.id);
    }
    await fetchExecutionEnvironmentBuilders();
  }, [builder.id, builder.name, fetchExecutionEnvironmentBuilders, onCopy]);

  return (
    <Tr id={`eeb-row-${builder.id}`} ouiaId={`eeb-row-${builder.id}`}>
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
          isDisabled: false,
        }}
        dataLabel={t`Selected`}
      />
      <TdBreakWord id={`eeb-name-${builder.id}`} dataLabel={t`Name`}>
        <Link to={detailUrl}>
          <b>{builder.name}</b>
        </Link>
      </TdBreakWord>
      <Td dataLabel={t`Image`}>{`${builder.image}:${builder.tag}`}</Td>
      <Td dataLabel={t`Project`}>
        {builder.summary_fields.project && (
          <Link to={`/projects/${builder.summary_fields.project.id}/details`}>
            {builder.summary_fields.project.name}
          </Link>
        )}
      </Td>
      <Td dataLabel={t`Organization`}>
        {builder.summary_fields.organization && (
          <Link
            to={`/organizations/${builder.summary_fields.organization.id}/details`}
          >
            {builder.summary_fields.organization.name}
          </Link>
        )}
      </Td>
      <ActionsTd dataLabel={t`Actions`} gridColumns="auto 40px 40px">
        <ActionItem
          visible={Boolean(capabilities?.start)}
          tooltip={t`Build Execution Environment`}
        >
          <Button
            icon={<RocketIcon />}
            ouiaId={`${builder.id}-build-button`}
            aria-label={t`Build Execution Environment`}
            variant="plain"
            isDisabled={isLaunching || !builder.summary_fields.project}
            onClick={() => launch()}
          />
        </ActionItem>
        <ActionItem
          visible={Boolean(capabilities?.edit)}
          tooltip={t`Edit Execution Environment Builder`}
        >
          <Button
            icon={<PencilAltIcon />}
            ouiaId={`${builder.id}-edit-button`}
            aria-label={t`Edit Execution Environment Builder`}
            variant="plain"
            component={Link}
            to={`/execution_environment_builders/${builder.id}/edit`}
          />
        </ActionItem>
        <ActionItem
          visible={Boolean(capabilities?.copy)}
          tooltip={t`Copy Execution Environment Builder`}
        >
          <CopyButton
            ouiaId={`copy-eeb-${builder.id}`}
            isDisabled={isDisabled}
            onCopyStart={() => setIsDisabled(true)}
            onCopyFinish={() => setIsDisabled(false)}
            copyItem={copyBuilder}
            errorMessage={t`Failed to copy execution environment builder`}
          />
        </ActionItem>
      </ActionsTd>
      {Boolean(error) && (
        <AlertModal
          isOpen={Boolean(error)}
          onClose={dismissError}
          title={t`Error`}
          variant="error"
        >
          {t`Failed to start the build.`}
          <ErrorDetail error={error} />
        </AlertModal>
      )}
    </Tr>
  );
}

export default ExecutionEnvironmentBuilderListItem;
