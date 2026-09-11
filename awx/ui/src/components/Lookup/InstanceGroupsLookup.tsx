import type { Untyped } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { useLocation } from 'react-router';
import { Trans, useLingui } from '@lingui/react/macro';
import { FormGroup } from '@patternfly/react-core';
import { InstanceGroupsAPI } from 'api';
import { getSearchableKeys } from 'components/PaginatedTable';
import { getQSConfig, parseQueryString } from 'util/qs';
import useRequest from 'hooks/useRequest';
import Popover from '../Popover';
import OptionsList from '../OptionsList';
import Lookup from './Lookup';
import LookupErrorMessage from './shared/LookupErrorMessage';
import FieldWithPrompt from '../FieldWithPrompt';
import type { LookupItem } from './shared/reducer';

const QS_CONFIG = getQSConfig('instance-groups', {
  page: 1,
  page_size: 5,
  order_by: 'name',
});

export interface InstanceGroupsLookupProps {
  id?: string;
  value: Untyped;
  onChange: (...args: Untyped[]) => void;
  tooltip?: React.ReactNode;
  className?: string;
  required?: boolean;
  fieldName?: Untyped;
  validate?: (...args: Untyped[]) => void;
  isPromptableField?: boolean;
  promptId?: number | string;
  promptName?: Untyped;
  [key: string]: unknown;
}

function InstanceGroupsLookup({
  id = 'org-instance-groups',
  value,
  onChange,
  tooltip = '',
  className = '',
  required = false,
  fieldName = 'instance_groups',
  validate = () => undefined,
  isPromptableField,
  promptId,
  promptName,
}: InstanceGroupsLookupProps) {
  const location = useLocation();
  const { t } = useLingui();
  const {
    result: { instanceGroups, count, relatedSearchableKeys, searchableKeys },
    request: fetchInstanceGroups,
    error,
    isLoading,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [{ data }, actionsResponse] = await Promise.all([
        InstanceGroupsAPI.read(params),
        InstanceGroupsAPI.readOptions(),
      ]);
      return {
        instanceGroups: data.results,
        count: data.count,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val: Untyped) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [location]),
    {
      instanceGroups: [],
      count: 0,
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchInstanceGroups();
  }, [fetchInstanceGroups]);

  const renderLookup = () => (
    <>
      <Lookup
        id="org-instance-groups"
        header={t`Instance Groups`}
        value={value as LookupItem[]}
        onChange={onChange}
        onUpdate={fetchInstanceGroups}
        fieldName={fieldName}
        validate={validate}
        qsConfig={QS_CONFIG}
        multiple
        required={required}
        isLoading={isLoading}
        modalDescription={
          <>
            <b>
              <Trans>Selected</Trans>
            </b>
            <br />
            <Trans>
              Note: The order in which these are selected sets the execution
              precedence. Select more than one to enable drag.
            </Trans>
          </>
        }
        renderOptionsList={({ state, dispatch, canDelete }) => (
          <OptionsList
            value={state.selectedItems}
            options={instanceGroups}
            optionCount={count}
            searchColumns={[
              {
                name: t`Name`,
                key: 'name__icontains',
                isDefault: true,
              },
              {
                name: t`Credential Name`,
                key: 'credential__name__icontains',
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
            header={t`Instance Groups`}
            name="instanceGroups"
            qsConfig={QS_CONFIG}
            readOnly={!canDelete}
            selectItem={(item: LookupItem) =>
              dispatch({ type: 'SELECT_ITEM', item })
            }
            deselectItem={(item: LookupItem) =>
              dispatch({ type: 'DESELECT_ITEM', item })
            }
            sortSelectedItems={(selectedItems: LookupItem[]) =>
              dispatch({ type: 'SET_SELECTED_ITEMS', selectedItems })
            }
            isSelectedDraggable
          />
        )}
      />
      <LookupErrorMessage error={error} />
    </>
  );

  // Asserted rather than optional: a caller that asks for the promptable
  // variant passes the two the checkbox needs, and one that does not never
  // reaches this branch.
  return isPromptableField ? (
    <FieldWithPrompt
      fieldId={id}
      label={t`Instance Groups`}
      promptId={promptId as string | number}
      promptName={promptName as string}
      tooltip={tooltip}
    >
      {renderLookup()}
    </FieldWithPrompt>
  ) : (
    <FormGroup
      className={className}
      label={t`Instance Groups`}
      labelHelp={tooltip ? <Popover content={tooltip} /> : undefined}
      fieldId={id}
    >
      {renderLookup()}
    </FormGroup>
  );
}

export default InstanceGroupsLookup;
