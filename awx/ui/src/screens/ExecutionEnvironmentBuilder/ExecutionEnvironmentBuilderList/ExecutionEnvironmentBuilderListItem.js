import React, { useState, useCallback } from 'react';
import { string, bool, func } from 'prop-types';
import { useLingui } from '@lingui/react/macro';
import { Link, useHistory } from 'react-router-dom';
import { Button } from '@patternfly/react-core';
import { Tr, Td } from '@patternfly/react-table';
import { PencilAltIcon, RocketIcon } from '@patternfly/react-icons';

import { ActionsTd, ActionItem, TdBreakWord } from 'components/PaginatedTable';
import CopyButton from 'components/CopyButton';
import { ExecutionEnvironmentBuildersAPI } from 'api';
import { timeOfDay } from 'util/dates';

function ExecutionEnvironmentBuilderListItem({
  executionEnvironmentBuilder,
  detailUrl,
  isSelected,
  onSelect,
  onCopy,
  rowIndex,
  fetchExecutionEnvironmentBuilders,
}) {
  const { t } = useLingui();
  const history = useHistory();
  const [isDisabled, setIsDisabled] = useState(false);
  const [isLaunchDisabled, setIsLaunchDisabled] = useState(false);

  const copyExecutionEnvironmentBuilder = useCallback(async () => {
    const response = await ExecutionEnvironmentBuildersAPI.copy(
      executionEnvironmentBuilder.id,
      {
        name: `${executionEnvironmentBuilder.name} @ ${timeOfDay()}`,
      }
    );
    if (response.status === 201) {
      onCopy(response.data.id);
    }
    await fetchExecutionEnvironmentBuilders();
  }, [
    executionEnvironmentBuilder.id,
    executionEnvironmentBuilder.name,
    fetchExecutionEnvironmentBuilders,
    onCopy,
  ]);

  const launchBuild = useCallback(async () => {
    try {
      setIsLaunchDisabled(true);
      const response = await ExecutionEnvironmentBuildersAPI.launch(
        executionEnvironmentBuilder.id,
        {
          name: `${executionEnvironmentBuilder.name}`,
        }
      );
      if (response.status === 201) {
        history.push(`/jobs/build/${response.data.execution_environment_builder_build}`);
      }
    } catch (error) {
      setIsLaunchDisabled(false);
    }
  }, [executionEnvironmentBuilder.id, executionEnvironmentBuilder.name, history]);

  const handleCopyStart = useCallback(() => {
    setIsDisabled(true);
  }, []);

  const handleCopyFinish = useCallback(() => {
    setIsDisabled(false);
  }, []);

  return (
    <Tr id={`eeb-row-${executionEnvironmentBuilder.id}`}>
      <Td
        select={{
          rowIndex,
          isSelected,
          onSelect,
          disable: false,
        }}
        dataLabel={t`Selected`}
      />
      <TdBreakWord
        id={`eeb-name-${executionEnvironmentBuilder.id}`}
        dataLabel={t`Name`}
      >
        <Link to={`${detailUrl}`}>
          <b>{executionEnvironmentBuilder.name}</b>
        </Link>
      </TdBreakWord>
      <Td dataLabel={t`Image`}>
        {executionEnvironmentBuilder.image}
      </Td>
      <Td dataLabel={t`Tag`}>
        {executionEnvironmentBuilder.tag}
      </Td>
      <ActionsTd dataLabel={t`Actions`} gridColumns="auto 40px 40px">
        <ActionItem
          visible={executionEnvironmentBuilder.summary_fields?.user_capabilities?.edit}
          tooltip={t`Edit`}
        >
          <Button
            ouiaId={`${executionEnvironmentBuilder.id}-edit-button`}
            aria-label={t`Edit`}
            variant="plain"
            component={Link}
            to={`/execution_environment_builders/${executionEnvironmentBuilder.id}/edit`}
          >
            <PencilAltIcon />
          </Button>
        </ActionItem>
        <ActionItem
          visible
          tooltip={t`Launch`}
        >
          <Button
            ouiaId={`${executionEnvironmentBuilder.id}-launch-button`}
            aria-label={t`Launch`}
            variant="plain"
            isDisabled={isLaunchDisabled}
            onClick={launchBuild}
          >
            <RocketIcon />
          </Button>
        </ActionItem>
        <ActionItem
          visible={executionEnvironmentBuilder.summary_fields?.user_capabilities?.copy}
          tooltip={t`Copy`}
        >
          <CopyButton
            ouiaId={`copy-eeb-${executionEnvironmentBuilder.id}`}
            isDisabled={isDisabled}
            onCopyStart={handleCopyStart}
            onCopyFinish={handleCopyFinish}
            copyItem={copyExecutionEnvironmentBuilder}
            errorMessage={t`Failed to copy execution environment builder`}
          />
        </ActionItem>
      </ActionsTd>
    </Tr>
  );
}

ExecutionEnvironmentBuilderListItem.propTypes = {
  executionEnvironmentBuilder: string.isRequired,
  detailUrl: string.isRequired,
  isSelected: bool.isRequired,
  onSelect: func.isRequired,
  onCopy: func.isRequired,
  rowIndex: func.isRequired,
  fetchExecutionEnvironmentBuilders: func.isRequired,
};

export default ExecutionEnvironmentBuilderListItem;
