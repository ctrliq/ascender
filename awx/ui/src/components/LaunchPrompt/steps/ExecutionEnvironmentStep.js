import React, { useCallback, useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { useField } from 'formik';
import { ExecutionEnvironmentsAPI } from 'api';
import { getSearchableKeys } from 'components/PaginatedTable';
import { getQSConfig, parseQueryString } from 'util/qs';
import useRequest from 'hooks/useRequest';
import OptionsList from '../../OptionsList';
import ContentLoading from '../../ContentLoading';
import ContentError from '../../ContentError';

const QS_CONFIG = getQSConfig('execution_environment', {
  page: 1,
  page_size: 5,
});

function ExecutionEnvironmentStep() {
  const { i18n } = useLingui();
  const [field, , helpers] = useField('execution_environment');

  const history = useHistory();

  const {
    isLoading,
    error,
    result: {
      execution_environments,
      count,
      relatedSearchableKeys,
      searchableKeys,
    },
    request: fetchExecutionEnvironments,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, history.location.search);
      const [{ data }, actionsResponse] = await Promise.all([
        ExecutionEnvironmentsAPI.read(params),
        ExecutionEnvironmentsAPI.readOptions(),
      ]);
      return {
        execution_environments: data.results,
        count: data.count,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [history.location]),
    {
      count: 0,
      execution_environments: [],
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchExecutionEnvironments();
  }, [fetchExecutionEnvironments]);

  if (isLoading) {
    return <ContentLoading />;
  }
  if (error) {
    return <ContentError error={error} />;
  }

  return (
    <div data-cy="execution-environment-prompt">
      <OptionsList
        value={field.value ? [field.value] : []}
        options={execution_environments}
        optionCount={count}
        columns={[
          {
            name: i18n._(msg`Name`),
            key: 'name',
          },
          {
            name: i18n._(msg`Image`),
            key: 'image',
          },
        ]}
        searchColumns={[
          {
            name: i18n._(msg`Name`),
            key: 'name__icontains',
            isDefault: true,
          },
          {
            name: i18n._(msg`Image`),
            key: 'image__icontains',
          },
        ]}
        sortColumns={[
          {
            name: i18n._(msg`Name`),
            key: 'name',
          },
          {
            name: i18n._(msg`Image`),
            key: 'image',
          },
        ]}
        searchableKeys={searchableKeys}
        relatedSearchableKeys={relatedSearchableKeys}
        header={i18n._(msg`Execution Environments`)}
        name="execution_environment"
        qsConfig={QS_CONFIG}
        readOnly
        selectItem={helpers.setValue}
        deselectItem={() => helpers.setValue(null)}
      />
    </div>
  );
}

export default ExecutionEnvironmentStep;
