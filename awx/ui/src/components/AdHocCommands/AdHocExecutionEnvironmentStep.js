import React, { useEffect, useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { useField } from 'formik';
import { Form, FormGroup } from '@patternfly/react-core';
import { ExecutionEnvironmentsAPI } from 'api';

import { parseQueryString, getQSConfig, mergeParams } from 'util/qs';
import { getSearchableKeys } from 'components/PaginatedTable';
import useRequest from 'hooks/useRequest';
import Popover from '../Popover';
import ContentError from '../ContentError';
import ContentLoading from '../ContentLoading';
import OptionsList from '../OptionsList';

const QS_CONFIG = getQSConfig('execution_environments', {
  page: 1,
  page_size: 5,
  order_by: 'name',
});
function AdHocExecutionEnvironmentStep({ organizationId }) {
  const { i18n } = useLingui();
  const history = useHistory();
  const [executionEnvironmentField, , executionEnvironmentHelpers] = useField(
    'execution_environment'
  );
  const {
    error,
    isLoading,
    request: fetchExecutionEnvironments,
    result: {
      executionEnvironments,
      executionEnvironmentsCount,
      relatedSearchableKeys,
      searchableKeys,
    },
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, history.location.search);
      const globallyAvailableParams = { or__organization__isnull: 'True' };
      const organizationIdParams = organizationId
        ? { or__organization__id: organizationId }
        : {};

      const [
        {
          data: { results, count },
        },
        actionsResponse,
      ] = await Promise.all([
        ExecutionEnvironmentsAPI.read(
          mergeParams(params, {
            ...globallyAvailableParams,
            ...organizationIdParams,
          })
        ),
        ExecutionEnvironmentsAPI.readOptions(),
      ]);
      return {
        executionEnvironments: results,
        executionEnvironmentsCount: count,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [history.location.search, organizationId]),
    {
      executionEnvironments: [],
      executionEnvironmentsCount: 0,
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchExecutionEnvironments();
  }, [fetchExecutionEnvironments]);

  if (error) {
    return <ContentError error={error} />;
  }
  if (isLoading) {
    return <ContentLoading />;
  }

  return (
    <Form autoComplete="off">
      <FormGroup
        fieldId="execution_enviroment"
        label={i18n._(msg`Execution Environment`)}
        aria-label={i18n._(msg`Execution Environment`)}
        labelIcon={
          <Popover
            content={i18n._(
              msg`Select the Execution Environment you want this command to run inside.`
            )}
          />
        }
      >
        <OptionsList
          isLoading={isLoading}
          value={executionEnvironmentField.value || []}
          options={executionEnvironments}
          optionCount={executionEnvironmentsCount}
          header={i18n._(msg`Execution Environments`)}
          qsConfig={QS_CONFIG}
          searchColumns={[
            {
              name: i18n._(msg`Name`),
              key: 'name__icontains',
              isDefault: true,
            },
            {
              name: i18n._(msg`Created By (Username)`),
              key: 'created_by__username',
            },
            {
              name: i18n._(msg`Modified By (Username)`),
              key: 'modified_by__username',
            },
          ]}
          sortColumns={[
            {
              name: i18n._(msg`Name`),
              key: 'name',
            },
          ]}
          name="execution_environment"
          searchableKeys={searchableKeys}
          relatedSearchableKeys={relatedSearchableKeys}
          selectItem={(value) => {
            executionEnvironmentHelpers.setValue([value]);
          }}
          deselectItem={() => {
            executionEnvironmentHelpers.setValue([]);
          }}
        />
      </FormGroup>
    </Form>
  );
}
export default AdHocExecutionEnvironmentStep;
