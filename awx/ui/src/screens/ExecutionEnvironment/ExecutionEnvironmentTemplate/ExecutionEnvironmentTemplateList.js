import React, { useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Card } from '@patternfly/react-core';

import { ExecutionEnvironmentsAPI } from 'api';
import { getQSConfig, parseQueryString } from 'util/qs';
import useRequest from 'hooks/useRequest';
import DatalistToolbar from 'components/DataListToolbar';
import PaginatedTable, {
  HeaderCell,
  HeaderRow,
  getSearchableKeys,
} from 'components/PaginatedTable';

import ExecutionEnvironmentTemplateListItem from './ExecutionEnvironmentTemplateListItem';

const QS_CONFIG = getQSConfig(
  'execution_environments',
  {
    page: 1,
    page_size: 20,
    order_by: 'name',
    type: 'job_template,workflow_job_template',
  },
  ['id', 'page', 'page_size']
);

function ExecutionEnvironmentTemplateList({ executionEnvironment }) {
  const { i18n } = useLingui();
  const { id } = executionEnvironment;
  const location = useLocation();

  const {
    error: contentError,
    isLoading,
    request: fetchTemplates,
    result: {
      templates,
      templatesCount,
      relatedSearchableKeys,
      searchableKeys,
    },
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);

      const [response, responseActions] = await Promise.all([
        ExecutionEnvironmentsAPI.readUnifiedJobTemplates(id, params),
        ExecutionEnvironmentsAPI.readUnifiedJobTemplateOptions(id),
      ]);

      return {
        templates: response.data.results,
        templatesCount: response.data.count,
        actions: responseActions.data.actions,
        relatedSearchableKeys: (
          responseActions?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(responseActions.data.actions?.GET),
      };
    }, [location, id]),
    {
      templates: [],
      templatesCount: 0,
      actions: {},
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  return (
    <Card>
      <PaginatedTable
        contentError={contentError}
        hasContentLoading={isLoading}
        items={templates}
        itemCount={templatesCount}
        pluralizedItemName={i18n._(msg`Templates`)}
        qsConfig={QS_CONFIG}
        toolbarSearchableKeys={searchableKeys}
        toolbarRelatedSearchableKeys={relatedSearchableKeys}
        toolbarSearchColumns={[
          {
            name: i18n._(msg`Name`),
            key: 'name__icontains',
            isDefault: true,
          },
          {
            name: i18n._(msg`Type`),
            key: 'or__type',
            options: [
              [`job_template`, i18n._(msg`Job Template`)],
              [`workflow_job_template`, i18n._(msg`Workflow Template`)],
            ],
          },
          {
            name: i18n._(msg`Created By (Username)`),
            key: 'created_by__username__icontains',
          },
          {
            name: i18n._(msg`Modified By (Username)`),
            key: 'modified_by__username__icontains',
          },
        ]}
        renderToolbar={(props) => (
          <DatalistToolbar {...props} qsConfig={QS_CONFIG} />
        )}
        headerRow={
          <HeaderRow qsConfig={QS_CONFIG} isSelectable={false}>
            <HeaderCell sortKey="name">{i18n._(msg`Name`)}</HeaderCell>
            <HeaderCell>{i18n._(msg`Type`)}</HeaderCell>
          </HeaderRow>
        }
        renderRow={(template) => (
          <ExecutionEnvironmentTemplateListItem
            key={template.id}
            template={template}
            detailUrl={`/templates/${template.type}/${template.id}/details`}
          />
        )}
      />
    </Card>
  );
}

export default ExecutionEnvironmentTemplateList;
