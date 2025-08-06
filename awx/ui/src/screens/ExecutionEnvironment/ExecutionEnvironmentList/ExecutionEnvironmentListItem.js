import React, { useState, useCallback } from 'react';
import { string, bool, func } from 'prop-types';
import { useLingui } from '@lingui/react';
import { t } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import { Button } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { PencilAltIcon } from '@patternfly/react-icons';

import { ActionsTd, ActionItem, TdBreakWord } from 'components/PaginatedTable';
import CopyButton from 'components/CopyButton';
import { ExecutionEnvironment } from 'types';
import { ExecutionEnvironmentsAPI } from 'api';
import { timeOfDay } from 'util/dates';

function ExecutionEnvironmentListItem({
  executionEnvironment,
  detailUrl,
  isSelected,
  onSelect,
  onCopy,
  rowIndex,
  fetchExecutionEnvironments,
}) {
  const { i18n } = useLingui();
  const [isDisabled, setIsDisabled] = useState(false);

  const copyExecutionEnvironment = useCallback(async () => {
    const response = await ExecutionEnvironmentsAPI.copy(
      executionEnvironment.id,
      {
        name: `${executionEnvironment.name} @ ${timeOfDay()}`,
      }
    );
    if (response.status === 201) {
      onCopy(response.data.id);
    }
    await fetchExecutionEnvironments();
  }, [
    executionEnvironment.id,
    executionEnvironment.name,
    fetchExecutionEnvironments,
    onCopy,
  ]);

  const handleCopyStart = useCallback(() => {
    setIsDisabled(true);
  }, []);

  const handleCopyFinish = useCallback(() => {
    setIsDisabled(false);
  }, []);

  return (
    <Tr
      id={`ee-row-${executionEnvironment.id}`}
      ouiaId={`ee-row-${executionEnvironment.id}`}
    >
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
          disable: false,
        }}
        dataLabel={i18n._(t`Selected`)}
      />
      <TdBreakWord
        id={`ee-name-${executionEnvironment.id}`}
        dataLabel={i18n._(t`Name`)}
      >
        <Link to={`${detailUrl}`}>
          <b>{executionEnvironment.name}</b>
        </Link>
      </TdBreakWord>
      <Td dataLabel={i18n._(t`Image`)}>{executionEnvironment.image}</Td>
      <Td dataLabel={i18n._(t`Organization`)}>
        {executionEnvironment.organization ? (
          <Link
            to={`/organizations/${executionEnvironment?.summary_fields?.organization?.id}/details`}
          >
            <b>{executionEnvironment?.summary_fields?.organization?.name}</b>
          </Link>
        ) : (
          i18n._(t`Globally Available`)
        )}
      </Td>
      <ActionsTd dataLabel={i18n._(t`Actions`)} gridColumns="auto 40px">
        <ActionItem
          visible={executionEnvironment.summary_fields.user_capabilities.edit}
          tooltip={i18n._(t`Edit Execution Environment`)}
        >
          <Button
            ouiaId={`${executionEnvironment.id}-edit-button`}
            aria-label={i18n._(t`Edit Execution Environment`)}
            variant="plain"
            component={Link}
            to={`/execution_environments/${executionEnvironment.id}/edit`}
          >
            <PencilAltIcon />
          </Button>
        </ActionItem>
        <ActionItem
          visible={executionEnvironment.summary_fields.user_capabilities.copy}
          tooltip={i18n._(t`Copy Execution Environment`)}
        >
          <CopyButton
            ouiaId={`copy-ee-${executionEnvironment.id}`}
            isDisabled={isDisabled}
            onCopyStart={handleCopyStart}
            onCopyFinish={handleCopyFinish}
            copyItem={copyExecutionEnvironment}
            errorMessage={i18n._(t`Failed to copy execution environment`)}
          />
        </ActionItem>
      </ActionsTd>
    </Tr>
  );
}

ExecutionEnvironmentListItem.prototype = {
  executionEnvironment: ExecutionEnvironment.isRequired,
  detailUrl: string.isRequired,
  isSelected: bool.isRequired,
  onSelect: func.isRequired,
  onCopy: func.isRequired,
};

export default ExecutionEnvironmentListItem;
