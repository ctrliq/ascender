import React, { useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Popover } from '@patternfly/react-core';
import { OutlinedQuestionCircleIcon } from '@patternfly/react-icons';
import { func, shape } from 'prop-types';
import { JobTemplatesAPI } from 'api';
import { getQSConfig, parseQueryString } from 'util/qs';
import useRequest from 'hooks/useRequest';
import CheckboxListItem from 'components/CheckboxListItem';
import ChipGroup from 'components/ChipGroup';
import CredentialChip from 'components/CredentialChip';
import DataListToolbar from 'components/DataListToolbar';
import { Detail, DetailList } from 'components/DetailList';
import PaginatedTable, {
  ActionItem,
  HeaderCell,
  HeaderRow,
  getSearchableKeys,
} from 'components/PaginatedTable';

const QS_CONFIG = getQSConfig('job-templates', {
  page: 1,
  page_size: 5,
  order_by: 'name',
});

function TemplatePopoverContent({ template }) {
  const { i18n } = useLingui();
  return (
    <DetailList compact stacked>
      <Detail
        label={i18n._(msg`Inventory`)}
        value={template.summary_fields?.inventory?.name}
        dataCy={`template-${template.id}-inventory`}
      />
      <Detail
        label={i18n._(msg`Project`)}
        value={template.summary_fields?.project?.name}
        dataCy={`template-${template.id}-project`}
      />
      <Detail
        label={i18n._(msg`Playbook`)}
        value={template?.playbook}
        dataCy={`template-${template.id}-playbook`}
      />
      <Detail
        fullWidth
        label={i18n._(msg`Credentials`)}
        dataCy={`template-${template.id}-credentials`}
        value={
          <ChipGroup
            numChips={5}
            totalChips={template.summary_fields?.credentials?.length}
            ouiaId={`template-${template.id}-credential-chips`}
          >
            {template.summary_fields?.credentials?.map((c) => (
              <CredentialChip
                key={c.id}
                credential={c}
                isReadOnly
                ouiaId={`credential-${c.id}-chip`}
              />
            ))}
          </ChipGroup>
        }
        isEmpty={template.summary_fields?.credentials?.length === 0}
      />
    </DetailList>
  );
}

function JobTemplatesList({ nodeResource, onUpdateNodeResource }) {
  const location = useLocation();
  const { i18n } = useLingui();

  const {
    result: { jobTemplates, count, relatedSearchableKeys, searchableKeys },
    error,
    isLoading,
    request: fetchJobTemplates,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [response, actionsResponse] = await Promise.all([
        JobTemplatesAPI.read(params, {
          role_level: 'execute_role',
        }),
        JobTemplatesAPI.readOptions(),
      ]);
      return {
        jobTemplates: response.data.results,
        count: response.data.count,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
      };
    }, [location]),
    {
      jobTemplates: [],
      count: 0,
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );

  useEffect(() => {
    fetchJobTemplates();
  }, [fetchJobTemplates]);

  return (
    <PaginatedTable
      contentError={error}
      hasContentLoading={isLoading}
      itemCount={count}
      items={jobTemplates}
      qsConfig={QS_CONFIG}
      headerRow={
        <HeaderRow isExpandable={false} qsConfig={QS_CONFIG}>
          <HeaderCell sortKey="name">{i18n._(msg`Name`)}</HeaderCell>
        </HeaderRow>
      }
      renderRow={(item, index) => (
        <CheckboxListItem
          rowIndex={index}
          isSelected={!!(nodeResource && nodeResource.id === item.id)}
          itemId={item.id}
          key={`${item.id}-listItem`}
          name={item.name}
          label={item.name}
          onSelect={() => onUpdateNodeResource(item)}
          onDeselect={() => onUpdateNodeResource(null)}
          isRadio
          rowActions={[
            <ActionItem id={item.id} visible>
              <Popover
                bodyContent={<TemplatePopoverContent template={item} />}
                headerContent={<div>{i18n._(msg`Details`)}</div>}
                id={`item-${item.id}-info-popover`}
                position="right"
              >
                <OutlinedQuestionCircleIcon />
              </Popover>
            </ActionItem>,
          ]}
        />
      )}
      renderToolbar={(props) => <DataListToolbar {...props} fillWidth />}
      showPageSizeOptions={false}
      toolbarSearchColumns={[
        {
          name: i18n._(msg`Name`),
          key: 'name__icontains',
          isDefault: true,
        },
        {
          name: i18n._(msg`Playbook name`),
          key: 'playbook__icontains',
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
      toolbarSearchableKeys={searchableKeys}
      toolbarRelatedSearchableKeys={relatedSearchableKeys}
    />
  );
}

JobTemplatesList.propTypes = {
  nodeResource: shape(),
  onUpdateNodeResource: func.isRequired,
};

JobTemplatesList.defaultProps = {
  nodeResource: null,
};

export default JobTemplatesList;
