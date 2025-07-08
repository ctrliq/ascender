import React, { useEffect, useCallback } from 'react';
import { Card } from '@patternfly/react-core';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { useLocation } from 'react-router-dom';
import useRequest from 'hooks/useRequest';
import { LabelsAPI } from 'api';
import { getQSConfig, parseQueryString } from 'util/qs';
import PaginatedTable, { HeaderRow, HeaderCell } from '../PaginatedTable';
import LabelListItem from './LabelListItem';

const qsConfig = getQSConfig('labels', {
        page: 1,
        page_size: 20,
        order_by: 'name' }, []);

function LabelLists() {
  const { i18n } = useLingui();
  const location = useLocation();

  const {
    result: { results, count },
    error: contentError,
    isLoading,
    request: fetchLabels,
  } = useRequest(
    useCallback(async () => {
      const params = {
        ...parseQueryString(qsConfig, location.search),
        unifiedjobtemplate_labels__search: '',
      };
      const { data } = await LabelsAPI.read(params);
      return {
        results: data.results,
        count: data.count,
      };
    }, [location.search]),
    { results: [], count: 0 }
  );

  useEffect(() => {
    fetchLabels();
  }, [fetchLabels]);

  return (
    <Card>
      <PaginatedTable
        contentError={contentError}
        hasContentLoading={isLoading}
        items={results}
        itemCount={count}
        pluralizedItemName={i18n._(msg`Labels`)}
        qsConfig={qsConfig}
        toolbarSearchColumns={[
          { name: i18n._(msg`Name`), key: 'name__icontains', isDefault: true },
          { name: i18n._(msg`Organization`), key: 'organization__name__icontains' },
        ]}
        headerRow={
          <HeaderRow qsConfig={qsConfig}>
            <HeaderCell sortKey="name">{i18n._(msg`Name`)}</HeaderCell>
            <HeaderCell>{i18n._(msg`Organization`)}</HeaderCell>
          </HeaderRow>
        }
        renderRow={(label) => <LabelListItem label={label} searchOrg />}
      />
    </Card>
  );
}

export default LabelLists;
