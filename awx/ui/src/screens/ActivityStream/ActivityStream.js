import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import styled from 'styled-components';
import { useLingui } from '@lingui/react/macro';
import {
	Card,
	MenuToggle,
	PageSection,
	Select,
	SelectGroup,
	SelectList,
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

const StyledMenuToggle = styled(MenuToggle)`
  && {
    width: 250px;
    white-space: nowrap;
  }
`;

function ActivityStream() {
  const { t } = useLingui();
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useTitle(t`Activity Stream`);
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
    ['id', 'page', 'page_size'],
    ['timestamp']
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

    navigate(qs ? `${location.pathname}?${qs}` : location.pathname);
  };

  const typeLabelMap = {
    all: t`Dashboard (all activity)`,
    job: t`Jobs`,
    schedule: t`Schedules`,
    workflow_approval: t`Workflow Approvals`,
    'job_template,workflow_job_template,workflow_job_template_node': t`Templates`,
    credential: t`Credentials`,
    project: t`Projects`,
    inventory: t`Inventories`,
    host: t`Hosts`,
    organization: t`Organizations`,
    user: t`Users`,
    team: t`Teams`,
    credential_type: t`Credential Types`,
    notification_template: t`Notification Templates`,
    instance: t`Instances`,
    instance_group: t`Instance Groups`,
    'o_auth2_application,o_auth2_access_token': t`Applications & Tokens`,
    execution_environment: t`Execution Environments`,
    setting: t`Settings`,
  };

  return (
    <>
      <PageSection hasBodyWrapper={false}
        className="pf-m-condensed"
        style={{ display: 'flex', justifyContent: 'space-between' }}
      >
        <Title size="2xl" headingLevel="h2" data-cy="screen-title">
          {t`Activity Stream`}
        </Title>
        <span id="grouped-type-select-id" hidden>
          {t`Activity Stream type selector`}
        </span>
        <Select
          isOpen={isTypeDropdownOpen}
          onOpenChange={setIsTypeDropdownOpen}
          onSelect={(_event, selection) => {
            if (selection) {
              urlParams.set('type', selection);
            }
            setIsTypeDropdownOpen(false);
            pushHistoryState(urlParams);
          }}
          aria-labelledby="grouped-type-select-id"
          className="activityTypeSelect"
          data-ouia-component-id="activity-type-select"
          popperProps={{ position: 'end' }}
          isScrollable
          toggle={(toggleRef) => (
            <StyledMenuToggle
              ref={toggleRef}
              onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
              isExpanded={isTypeDropdownOpen}
            >
              {typeLabelMap[activityStreamType] || activityStreamType}
            </StyledMenuToggle>
          )}
        >
          <SelectGroup label={t`Views`} key="views">
            <SelectList>
              <SelectOption value="all">
                {t`Dashboard (all activity)`}
              </SelectOption>
              <SelectOption value="job">
                {t`Jobs`}
              </SelectOption>
              <SelectOption value="schedule">
                {t`Schedules`}
              </SelectOption>
              <SelectOption value="workflow_approval">
                {t`Workflow Approvals`}
              </SelectOption>
            </SelectList>
          </SelectGroup>
          <SelectGroup label={t`Resources`} key="resources">
            <SelectList>
              <SelectOption
                value="job_template,workflow_job_template,workflow_job_template_node"
              >
                {t`Templates`}
              </SelectOption>
              <SelectOption value="credential">
                {t`Credentials`}
              </SelectOption>
              <SelectOption value="project">
                {t`Projects`}
              </SelectOption>
              <SelectOption value="inventory">
                {t`Inventories`}
              </SelectOption>
              <SelectOption value="host">
                {t`Hosts`}
              </SelectOption>
            </SelectList>
          </SelectGroup>
          <SelectGroup label={t`Access`} key="access">
            <SelectList>
              <SelectOption value="organization">
                {t`Organizations`}
              </SelectOption>
              <SelectOption value="user">
                {t`Users`}
              </SelectOption>
              <SelectOption value="team">
                {t`Teams`}
              </SelectOption>
            </SelectList>
          </SelectGroup>
          <SelectGroup label={t`Administration`} key="administration">
            <SelectList>
              <SelectOption value="credential_type">
                {t`Credential Types`}
              </SelectOption>
              <SelectOption
                value="notification_template"
              >
                {t`Notification Templates`}
              </SelectOption>
              <SelectOption value="instance">
                {t`Instances`}
              </SelectOption>
              <SelectOption value="instance_group">
                {t`Instance Groups`}
              </SelectOption>
              <SelectOption
                value="o_auth2_application,o_auth2_access_token"
              >
                {t`Applications & Tokens`}
              </SelectOption>
              <SelectOption
                value="execution_environment"
              >
                {t`Execution Environments`}
              </SelectOption>
            </SelectList>
          </SelectGroup>
          <SelectGroup label={t`Settings`} key="settings">
            <SelectList>
              <SelectOption value="setting">
                {t`Settings`}
              </SelectOption>
            </SelectList>
          </SelectGroup>
        </Select>
      </PageSection>
      <PageSection hasBodyWrapper={false}>
        <Card>
          <PaginatedTable
            contentError={contentError}
            hasContentLoading={isLoading}
            items={results}
            itemCount={count}
            pluralizedItemName={t`Events`}
            qsConfig={QS_CONFIG}
            toolbarSearchColumns={[
              {
                name: t`Keyword`,
                key: 'search',
                isDefault: true,
              },
              {
                name: t`Initiated by (username)`,
                key: 'actor__username__icontains',
              },
              {
                name: t`Time`,
                key: 'timestamp',
              },
            ]}
            toolbarSortColumns={[
              {
                name: t`Time`,
                key: 'timestamp',
              },
              {
                name: t`Initiated by`,
                key: 'actor__username',
              },
            ]}
            toolbarSearchableKeys={searchableKeys}
            toolbarRelatedSearchableKeys={relatedSearchableKeys}
            headerRow={
              <HeaderRow qsConfig={QS_CONFIG}>
                <HeaderCell sortKey="timestamp">{t`Time`}</HeaderCell>
                <HeaderCell sortKey="actor__username">
                  {t`Initiated by`}
                </HeaderCell>
                <HeaderCell>{t`Event`}</HeaderCell>
                <HeaderCell>{t`Actions`}</HeaderCell>
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
