import type { SummaryFieldRef } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { FormGroup } from '@patternfly/react-core';
import { JobTemplatesAPI } from 'api';
import useRequest from 'hooks/useRequest';
import { getSearchableKeys } from 'components/PaginatedTable';
import { getQSConfig, parseQueryString } from 'util/qs';
import OptionsList from '../OptionsList';
import Popover from '../Popover';
import Lookup from './Lookup';
import LookupErrorMessage from './shared/LookupErrorMessage';
import type { LookupItem } from './shared/reducer';

// Only the templates the user can launch, which is what the api asks of a
// template a credential is tested as
const QS_CONFIG = getQSConfig('job_template', {
  page: 1,
  page_size: 5,
  order_by: 'name',
  role_level: 'execute_role',
});

export interface JobTemplateLookupProps {
  /** Declared method style so a caller may name its own row type. */
  onChange(value: SummaryFieldRef | null): void;
  value?: SummaryFieldRef | null;
  required?: boolean;
  /** Rendered in a popover beside the label, so markup is fine. */
  tooltip?: React.ReactNode;
  fieldName?: string;
  /** The id of the input, for a page with more than one of these. */
  id?: string;
  [key: string]: unknown;
}

function JobTemplateLookup({
  onChange,
  value = null,
  required = false,
  tooltip = '',
  fieldName = 'job_template',
  id = 'job_template',
}: JobTemplateLookupProps) {
  const location = useLocation();
  const { t } = useLingui();
  const {
    result: { jobTemplates, count, relatedSearchableKeys, searchableKeys },
    request: fetchJobTemplates,
    error,
    isLoading,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [{ data }, actionsResponse] = await Promise.all([
        JobTemplatesAPI.read(params),
        JobTemplatesAPI.readOptions(),
      ]);
      return {
        count: data.count,
        jobTemplates: data.results,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse?.data?.actions?.GET),
      };
    }, [location.search]),
    {
      count: 0,
      jobTemplates: [],
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  const checkJobTemplateName = useCallback(
    async (name: string, isStale: () => boolean) => {
      if (!name) {
        onChange(null);
        return;
      }
      try {
        const {
          data: { results, count: matches },
        } = await JobTemplatesAPI.read({ name, role_level: 'execute_role' });
        if (isStale()) {
          return;
        }
        // A name is only unique within an organization, and the test runs
        // with the claims of the template picked, so an ambiguous name has to
        // be chosen from the list
        onChange(matches === 1 ? (results[0] ?? null) : null);
      } catch {
        if (!isStale()) {
          onChange(null);
        }
      }
    },
    [onChange]
  );

  useEffect(() => {
    fetchJobTemplates();
  }, [fetchJobTemplates]);

  return (
    <FormGroup
      fieldId={id}
      isRequired={required}
      label={t`Job Template`}
      labelHelp={tooltip ? <Popover content={tooltip} /> : undefined}
    >
      <Lookup
        id={id}
        header={t`Job Template`}
        name="job_template"
        value={value}
        onChange={onChange}
        onUpdate={fetchJobTemplates}
        onDebounce={checkJobTemplateName}
        clearOnType
        fieldName={fieldName}
        required={required}
        isLoading={isLoading}
        qsConfig={QS_CONFIG}
        renderOptionsList={({ state, dispatch, canDelete }) => (
          <OptionsList
            value={state.selectedItems}
            searchColumns={[
              { name: t`Name`, key: 'name__icontains', isDefault: true },
              {
                name: t`Playbook name`,
                key: 'playbook__icontains',
              },
              {
                name: t`Created By (Username)`,
                key: 'created_by__username__icontains',
              },
            ]}
            sortColumns={[{ name: t`Name`, key: 'name' }]}
            searchableKeys={searchableKeys}
            relatedSearchableKeys={relatedSearchableKeys}
            options={jobTemplates}
            optionCount={count}
            multiple={state.multiple}
            header={t`Job Template`}
            name="job_template"
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
      <LookupErrorMessage error={error} />
    </FormGroup>
  );
}

export default JobTemplateLookup;
