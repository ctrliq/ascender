import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useHistory } from 'react-router-dom';
import styled from 'styled-components';
import { t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import {
  Card,
  PageSection,
  PageSectionVariants,
  SelectGroup,
  Select as PFSelect,
  SelectVariant,
  SelectOption,
  Title,
} from '@patternfly/react-core';

import DatalistToolbar from 'components/DataListToolbar';
import PaginatedTable, {
  HeaderRow,
  HeaderCell,
  getSearchableKeys,
} from 'components/PaginatedTable';
import useRequest from 'hooks/useRequest';
import useTitle from 'hooks/useTitle';
import { getQSConfig, parseQueryString, updateQueryString } from 'util/qs';
import { ActivityStreamAPI } from 'api';

import ActivityStreamListItem from './ActivityStreamListItem';

const Select = styled(PFSelect)`
  && {
    width: auto;
    white-space: nowrap;
    max-height: 480px;
  }
`;

function ActivityStream() {
  const { i18n } = useLingui();
  const { light } = PageSectionVariants;

  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const location = useLocation();
  const history = useHistory();
  useTitle(i18n._(t`Activity Stream`));
  const urlParams = new URLSearchParams(location.search);

  const activityStreamType = urlParams.get('type') || 'all';

  let typeParams = {};

  if (activityStreamType !== 'all') {
    typeParams = {
      or__object1__in: activityStreamType,
      or__object2__in: activityStreamType,
    };
  }

  const QS_CONFIG = getQSConfig(
    'activity_stream',
    {
      page: 1,
      page_size: 20,
      order_by: '-timestamp',
    },
    ['id', 'page', 'page_size']
  );

  const {
    result: { results, count, relatedSearchableKeys, searchableKeys },
    error: contentError,
    isLoading,
    request: fetchActivityStream,
  } = useRequest(
    useCallback(
      async () => {
        const params = parseQueryString(QS_CONFIG, location.search);
        const [response, actionsResponse] = await Promise.all([
          ActivityStreamAPI.read({ ...params, ...typeParams }),
          ActivityStreamAPI.readOptions(),
        ]);
        return {
          results: response.data.results,
          count: response.data.count,
          relatedSearchableKeys: (
            actionsResponse?.data?.related_search_fields || []
          ).map((val) => val.slice(0, -8)),
          searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
        };
      },
      [location] // eslint-disable-line react-hooks/exhaustive-deps
    ),
    {
      results: [],
      count: 0,
      relatedSearchableKeys: [],
      searchableKeys: [],
    }
  );
  useEffect(() => {
    fetchActivityStream();
  }, [fetchActivityStream]);

  const pushHistoryState = (urlParamsToAdd) => {
    const pageOneQs = updateQueryString(QS_CONFIG, location.search, {
      page: 1,
    });
    const qs = updateQueryString(null, pageOneQs, {
      type: urlParamsToAdd.get('type'),
    });

    history.push(qs ? `${location.pathname}?${qs}` : location.pathname);
  };

  return (
    <>
      <PageSection
        variant={light}
        className="pf-m-condensed"
        style={{ display: 'flex', justifyContent: 'space-between' }}
      >
        <Title size="2xl" headingLevel="h2" data-cy="screen-title">
          {i18n._(t`Activity Stream`)}
        </Title>
        <span id="grouped-type-select-id" hidden>
          {i18n._(t`Activity Stream type selector`)}
        </span>
        <Select
          variant={SelectVariant.single}
          aria-labelledby="grouped-type-select-id"
          typeAheadAriaLabel={i18n._(t`Select an activity type`)}
          className="activityTypeSelect"
          onToggle={setIsTypeDropdownOpen}
          onSelect={(event, selection) => {
            if (selection) {
              urlParams.set('type', selection);
            }
            setIsTypeDropdownOpen(false);
            pushHistoryState(urlParams);
          }}
          selections={activityStreamType}
          isOpen={isTypeDropdownOpen}
          isGrouped
          noResultsFoundText={i18n._(t`No results found`)}
          ouiaId="activity-type-select"
        >
          <SelectGroup label={i18n._(t`Views`)} key="views">
            <SelectOption key="all_activity" value="all">
              {i18n._(t`Dashboard (all activity)`)}
            </SelectOption>
            <SelectOption key="jobs" value="job">
              {i18n._(t`Jobs`)}
            </SelectOption>
            <SelectOption key="schedules" value="schedule">
              {i18n._(t`Schedules`)}
            </SelectOption>
            <SelectOption key="workflow_approvals" value="workflow_approval">
              {i18n._(t`Workflow Approvals`)}
            </SelectOption>
          </SelectGroup>
          <SelectGroup label={i18n._(t`Resources`)} key="resources">
            <SelectOption
              key="templates"
              value="job_template,workflow_job_template,workflow_job_template_node"
            >
              {i18n._(t`Templates`)}
            </SelectOption>
            <SelectOption key="credentials" value="credential">
              {i18n._(t`Credentials`)}
            </SelectOption>
            <SelectOption key="projects" value="project">
              {i18n._(t`Projects`)}
            </SelectOption>
            <SelectOption key="inventories" value="inventory">
              {i18n._(t`Inventories`)}
            </SelectOption>
            <SelectOption key="hosts" value="host">
              {i18n._(t`Hosts`)}
            </SelectOption>
          </SelectGroup>
          <SelectGroup label={i18n._(t`Access`)} key="access">
            <SelectOption key="organizations" value="organization">
              {i18n._(t`Organizations`)}
            </SelectOption>
            <SelectOption key="users" value="user">
              {i18n._(t`Users`)}
            </SelectOption>
            <SelectOption key="teams" value="team">
              {i18n._(t`Teams`)}
            </SelectOption>
          </SelectGroup>
          <SelectGroup label={i18n._(t`Administration`)} key="administration">
            <SelectOption key="credential_types" value="credential_type">
              {i18n._(t`Credential Types`)}
            </SelectOption>
            <SelectOption
              key="notification_templates"
              value="notification_template"
            >
              {i18n._(t`Notification Templates`)}
            </SelectOption>
            <SelectOption key="instance" value="instance">
              {i18n._(t`Instances`)}
            </SelectOption>
            <SelectOption key="instance_groups" value="instance_group">
              {i18n._(t`Instance Groups`)}
            </SelectOption>
            <SelectOption
              key="applications"
              value="o_auth2_application,o_auth2_access_token"
            >
              {i18n._(t`Applications & Tokens`)}
            </SelectOption>
            <SelectOption
              key="execution_environments"
              value="execution_environment"
            >
              {i18n._(t`Execution Environments`)}
            </SelectOption>
          </SelectGroup>
          <SelectGroup label={i18n._(t`Settings`)} key="settings">
            <SelectOption key="settings" value="setting">
              {i18n._(t`Settings`)}
            </SelectOption>
          </SelectGroup>
        </Select>
      </PageSection>
      <PageSection>
        <Card>
          <PaginatedTable
            contentError={contentError}
            hasContentLoading={isLoading}
            items={results}
            itemCount={count}
            pluralizedItemName={i18n._(t`Events`)}
            qsConfig={QS_CONFIG}
            toolbarSearchColumns={[
              {
                name: i18n._(t`Keyword`),
                key: 'search',
                isDefault: true,
              },
              {
                name: i18n._(t`Initiated by (username)`),
                key: 'actor__username__icontains',
              },
            ]}
            toolbarSortColumns={[
              {
                name: i18n._(t`Time`),
                key: 'timestamp',
              },
              {
                name: i18n._(t`Initiated by`),
                key: 'actor__username',
              },
            ]}
            toolbarSearchableKeys={searchableKeys}
            toolbarRelatedSearchableKeys={relatedSearchableKeys}
            headerRow={
              <HeaderRow qsConfig={QS_CONFIG}>
                <HeaderCell sortKey="timestamp">{i18n._(t`Time`)}</HeaderCell>
                <HeaderCell sortKey="actor__username">
                  {i18n._(t`Initiated by`)}
                </HeaderCell>
                <HeaderCell>{i18n._(t`Event`)}</HeaderCell>
                <HeaderCell>{i18n._(t`Actions`)}</HeaderCell>
              </HeaderRow>
            }
            renderToolbar={(props) => (
              <DatalistToolbar {...props} qsConfig={QS_CONFIG} />
            )}
            renderRow={(streamItem, index) => (
              <ActivityStreamListItem key={index} streamItem={streamItem} />
            )}
          />
        </Card>
      </PageSection>
    </>
  );
}

export default ActivityStream;
