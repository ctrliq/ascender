import type { Project, SummaryFieldRef } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import type { FieldValidator } from 'formik';
import { useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import {
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Tooltip,
} from '@patternfly/react-core';
import { ExecutionEnvironmentsAPI, ProjectsAPI } from 'api';
import { getSearchableKeys } from 'components/PaginatedTable';
import { getQSConfig, parseQueryString, mergeParams } from 'util/qs';
import useRequest from 'hooks/useRequest';
import type { QSParams } from 'util/qs';
import Popover from '../Popover';
import OptionsList from '../OptionsList';
import Lookup from './Lookup';
import LookupErrorMessage from './shared/LookupErrorMessage';
import FieldWithPrompt from '../FieldWithPrompt';
import type { LookupItem } from './shared/reducer';

const QS_CONFIG = getQSConfig('execution_environments', {
  page: 1,
  page_size: 5,
  order_by: 'name',
});

export interface ExecutionEnvironmentLookupProps {
  id?: string;
  globallyAvailable?: unknown;
  helperTextInvalid?: React.ReactNode;
  isDisabled?: boolean;
  isValid?: boolean;
  /**
   * Declared method style on purpose: the handler is formik's own, which takes
   * an event or a field name, and it is handed straight to whichever
   * PatternFly input the field renders, which names its own event type.
   */
  onBlur?(event?: React.SyntheticEvent): void;
  /** Declared method style so a caller may name its own row type. */
  onChange(value: SummaryFieldRef | null): void;
  organizationId?: number | string;
  popoverContent?: React.ReactNode;
  projectId?: number | string;
  tooltip?: React.ReactNode;
  validate?: FieldValidator;
  value?: SummaryFieldRef | null;
  fieldName?: string;
  overrideLabel?: boolean;
  isPromptableField?: boolean;
  promptId?: string;
  promptName?: string;
  [key: string]: unknown;
}

function ExecutionEnvironmentLookup({
  id = 'execution-environments',
  globallyAvailable,
  helperTextInvalid,
  isDisabled,
  isValid = true,
  onBlur,
  onChange,
  organizationId,
  popoverContent = '',
  projectId,
  tooltip,
  validate = () => undefined,
  value,
  fieldName = 'execution_environment',
  overrideLabel = false,
  isPromptableField,
  promptId,
  promptName,
}: ExecutionEnvironmentLookupProps) {
  const { t } = useLingui();
  const location = useLocation();
  const {
    request: fetchProject,
    error: fetchProjectError,
    isLoading: isProjectLoading,
    result: project,
  } = useRequest(
    // Without a project there is none to read, and the detail is partial
    // until the read lands.
    useCallback(async (): Promise<Partial<Project>> => {
      if (!projectId) {
        return {};
      }
      const { data } = await ProjectsAPI.readDetail(projectId);
      return data;
    }, [projectId]),
    { isLoading: true }
  );

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const {
    result: {
      executionEnvironments,
      count,
      relatedSearchableKeys,
      searchableKeys,
    },
    request: fetchExecutionEnvironments,
    error,
    isLoading,
  } = useRequest(
    useCallback(async () => {
      if (isProjectLoading) {
        return {
          executionEnvironments: [],
          count: 0,
        };
      }
      const params = parseQueryString(QS_CONFIG, location.search);
      const globallyAvailableParams: QSParams = globallyAvailable
        ? { or__organization__isnull: 'True' }
        : {};
      const organizationIdParams: QSParams = organizationId
        ? { or__organization__id: organizationId }
        : {};
      const projectIdParams: QSParams =
        projectId && project?.organization
          ? {
              or__organization__id: project.organization,
            }
          : {};
      const [{ data }, actionsResponse] = await Promise.all([
        ExecutionEnvironmentsAPI.read(
          mergeParams(params, {
            ...globallyAvailableParams,
            ...organizationIdParams,
            ...projectIdParams,
          })
        ),
        ExecutionEnvironmentsAPI.readOptions(),
      ]);
      return {
        executionEnvironments: data.results,
        count: data.count,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [
      location,
      globallyAvailable,
      organizationId,
      projectId,
      project,
      isProjectLoading,
    ]),
    {
      executionEnvironments: [],
      count: 0,
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  const checkExecutionEnvironmentName = useCallback(
    async (name: string) => {
      if (!name) {
        onChange(null);
        return;
      }

      try {
        const {
          data: { results: nameMatchResults, count: nameMatchCount },
        } = await ExecutionEnvironmentsAPI.read({ name });
        onChange(nameMatchCount ? (nameMatchResults[0] ?? null) : null);
      } catch {
        onChange(null);
      }
    },
    [onChange]
  );

  useEffect(() => {
    fetchExecutionEnvironments();
  }, [fetchExecutionEnvironments]);

  const renderLookup = () => (
    <>
      <Lookup
        id={id}
        header={t`Execution Environment`}
        value={value}
        onBlur={onBlur}
        onChange={onChange}
        onUpdate={fetchExecutionEnvironments}
        onDebounce={checkExecutionEnvironmentName}
        fieldName={fieldName}
        validate={validate}
        qsConfig={QS_CONFIG}
        isLoading={isLoading || isProjectLoading}
        isDisabled={isDisabled}
        renderOptionsList={({ state, dispatch, canDelete }) => (
          <OptionsList
            value={state.selectedItems}
            options={executionEnvironments}
            optionCount={count}
            searchColumns={[
              {
                name: t`Name`,
                key: 'name__icontains',
                isDefault: true,
              },
            ]}
            sortColumns={[
              {
                name: t`Name`,
                key: 'name',
              },
            ]}
            searchableKeys={searchableKeys}
            relatedSearchableKeys={relatedSearchableKeys}
            multiple={state.multiple}
            header={t`Execution Environment`}
            name="executionEnvironments"
            qsConfig={QS_CONFIG}
            readOnly={!canDelete}
            selectItem={(item: LookupItem) =>
              dispatch({ type: 'SELECT_ITEM', item })
            }
            deselectItem={(item: LookupItem) =>
              dispatch({ type: 'DESELECT_ITEM', item })
            }
          />
        )}
      />
      <LookupErrorMessage error={error || fetchProjectError} />
    </>
  );

  const renderLabel = () => {
    if (overrideLabel) {
      return null;
    }
    return t`Execution Environment`;
  };

  // Asserted rather than optional: a caller that asks for the promptable
  // variant passes the two the checkbox needs, and one that does not never
  // reaches this branch.
  return isPromptableField ? (
    <FieldWithPrompt
      fieldId={id}
      label={renderLabel()}
      promptId={promptId as string}
      promptName={promptName as string}
      tooltip={popoverContent}
    >
      {tooltip && isDisabled ? (
        <Tooltip content={tooltip}>{renderLookup()}</Tooltip>
      ) : (
        renderLookup()
      )}
    </FieldWithPrompt>
  ) : (
    <FormGroup
      fieldId={id}
      label={renderLabel()}
      labelHelp={
        popoverContent ? <Popover content={popoverContent} /> : undefined
      }
    >
      {tooltip && isDisabled ? (
        <Tooltip content={tooltip}>{renderLookup()}</Tooltip>
      ) : (
        renderLookup()
      )}

      <LookupErrorMessage error={error || fetchProjectError} />
      {!isValid && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant="error">{helperTextInvalid}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </FormGroup>
  );
}

export default ExecutionEnvironmentLookup;
