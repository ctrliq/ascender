import type { SummaryFieldRef } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import type { FieldValidator } from 'formik';
import { useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { FormGroup } from '@patternfly/react-core';
import { ApplicationsAPI } from 'api';
import { getSearchableKeys } from 'components/PaginatedTable';
import { getQSConfig, parseQueryString } from 'util/qs';
import useRequest from 'hooks/useRequest';
import Lookup from './Lookup';
import OptionsList from '../OptionsList';
import LookupErrorMessage from './shared/LookupErrorMessage';
import type { LookupItem } from './shared/reducer';

const QS_CONFIG = getQSConfig('applications', {
  page: 1,
  page_size: 5,
  order_by: 'name',
});

export interface ApplicationLookupProps {
  /** Declared method style so a caller may name its own row type. */
  onChange(value: SummaryFieldRef | null): void;
  value?: SummaryFieldRef | null;
  label: React.ReactNode;
  fieldName?: string;
  validate?: FieldValidator;
  [key: string]: unknown;
}

function ApplicationLookup({
  onChange,
  value,
  label,
  fieldName = 'application',
  validate = () => undefined,
}: ApplicationLookupProps) {
  const { t } = useLingui();
  const location = useLocation();
  const {
    error,
    result: { applications, itemCount, relatedSearchableKeys, searchableKeys },
    request: fetchApplications,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);

      const [
        {
          data: { results, count },
        },
        actionsResponse,
      ] = await Promise.all([
        ApplicationsAPI.read(params),
        ApplicationsAPI.readOptions(),
      ]);
      return {
        applications: results,
        itemCount: count,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse?.data?.actions?.GET),
      };
    }, [location]),
    {
      applications: [],
      itemCount: 0,
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  const checkApplicationName = useCallback(
    async (name: string) => {
      if (!name) {
        onChange(null);
        return;
      }

      try {
        const {
          data: { results: nameMatchResults, count: nameMatchCount },
        } = await ApplicationsAPI.read({ name });
        onChange(nameMatchCount ? (nameMatchResults[0] ?? null) : null);
      } catch {
        onChange(null);
      }
    },
    [onChange]
  );

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);
  return (
    <FormGroup fieldId="application" label={label}>
      <Lookup
        id="application"
        header={t`Application`}
        value={value}
        onChange={onChange}
        onUpdate={fetchApplications}
        onDebounce={checkApplicationName}
        fieldName={fieldName}
        validate={validate}
        qsConfig={QS_CONFIG}
        renderOptionsList={({ state, dispatch, canDelete }) => (
          <OptionsList
            value={state.selectedItems}
            options={applications}
            optionCount={itemCount}
            header={t`Applications`}
            qsConfig={QS_CONFIG}
            searchColumns={[
              {
                name: t`Name`,
                key: 'name__icontains',
                isDefault: true,
              },
              {
                name: t`Description`,
                key: 'description__icontains',
              },
            ]}
            sortColumns={[
              {
                name: t`Name`,
                key: 'name',
              },
              {
                name: t`Created`,
                key: 'created',
              },
              {
                name: t`Organization`,
                key: 'organization',
              },
              {
                name: t`Description`,
                key: 'description',
              },
            ]}
            searchableKeys={searchableKeys}
            relatedSearchableKeys={relatedSearchableKeys}
            readOnly={!canDelete}
            name="application"
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

export default ApplicationLookup;
