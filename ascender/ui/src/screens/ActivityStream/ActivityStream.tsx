import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
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
import './ActivityStream.css';

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

  const pushHistoryState = (urlParamsToAdd: URLSearchParams) => {
    const pageOneQs = updateQueryString(QS_CONFIG, location.search, {
      page: 1,
    });
    const qs = updateQueryString(null, pageOneQs, {
      type: urlParamsToAdd.get('type'),
    });

    navigate(qs ? `${location.pathname}?${qs}` : location.pathname);
  };

  /*
   * Named and grouped as the nav rail names them, so a type reads the same
   * here as the screen it links from. Runs takes in every kind the stream
   * records, not only playbook jobs. Cleanup jobs are left out: the stream
   * records nothing for them, so the choice would only ever show an empty
   * list.
   */
  const RUN_TYPES = 'job,workflow_job,ad_hoc_command';
  const TEMPLATE_TYPES =
    'job_template,workflow_job_template,workflow_job_template_node';
  const APPLICATION_TYPES = 'o_auth2_application,o_auth2_access_token';

  const typeLabelMap = {
    all: t`Dashboard (All Activity)`,
    workflow_approval: t`Approvals`,
    [RUN_TYPES]: t`Runs`,
    schedule: t`Schedules`,
    credential: t`Credentials`,
    host: t`Hosts`,
    inventory: t`Inventories`,
    label: t`Labels`,
    project: t`Projects`,
    [TEMPLATE_TYPES]: t`Templates`,
    credential_type: t`Credential Types`,
    organization: t`Organizations`,
    team: t`Teams`,
    user: t`Users`,
    execution_environment: t`Execution Environments`,
    instance: t`Instances`,
    instance_group: t`Instance Groups`,
    [APPLICATION_TYPES]: t`API Applications & Tokens`,
    notification_template: t`Notifications`,
    setting: t`Settings`,
  } as Record<string, string>;

  return (
    <>
      <PageSection
        hasBodyWrapper={false}
        className="pf-m-condensed"
        style={{ display: 'flex', justifyContent: 'space-between' }}
      >
        <Title size="2xl" headingLevel="h2" data-cy="screen-title">
          {t`Activity Stream`}
        </Title>
        <span id="grouped-type-select-id" hidden>
          {t`Activity Stream Type Selector`}
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
            <MenuToggle
              className="ascender-activity-stream__styled-menu-toggle"
              ref={toggleRef}
              onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)}
              isExpanded={isTypeDropdownOpen}
            >
              {typeLabelMap[activityStreamType] || activityStreamType}
            </MenuToggle>
          )}
        >
          <SelectGroup label={t`Views`} key="views">
            <SelectList>
              <SelectOption value="all">{typeLabelMap.all}</SelectOption>
            </SelectList>
          </SelectGroup>
          <SelectGroup label={t`Operations`} key="operations">
            <SelectList>
              {['workflow_approval', RUN_TYPES, 'schedule'].map((type) => (
                <SelectOption key={type} value={type}>
                  {typeLabelMap[type]}
                </SelectOption>
              ))}
            </SelectList>
          </SelectGroup>
          <SelectGroup label={t`Resources`} key="resources">
            <SelectList>
              {[
                'credential',
                'host',
                'inventory',
                'label',
                'project',
                TEMPLATE_TYPES,
                'credential_type',
              ].map((type) => (
                <SelectOption key={type} value={type}>
                  {typeLabelMap[type]}
                </SelectOption>
              ))}
            </SelectList>
          </SelectGroup>
          <SelectGroup label={t`Access`} key="access">
            <SelectList>
              {['organization', 'team', 'user'].map((type) => (
                <SelectOption key={type} value={type}>
                  {typeLabelMap[type]}
                </SelectOption>
              ))}
            </SelectList>
          </SelectGroup>
          <SelectGroup label={t`Infrastructure`} key="infrastructure">
            <SelectList>
              {['execution_environment', 'instance', 'instance_group'].map(
                (type) => (
                  <SelectOption key={type} value={type}>
                    {typeLabelMap[type]}
                  </SelectOption>
                )
              )}
            </SelectList>
          </SelectGroup>
          <SelectGroup label={t`Integrations`} key="integrations">
            <SelectList>
              {[APPLICATION_TYPES, 'notification_template'].map((type) => (
                <SelectOption key={type} value={type}>
                  {typeLabelMap[type]}
                </SelectOption>
              ))}
            </SelectList>
          </SelectGroup>
          <SelectGroup label={t`Settings`} key="settings">
            <SelectList>
              <SelectOption value="setting">
                {typeLabelMap.setting}
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
                name: t`Initiated By (Username)`,
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
                name: t`Initiated By`,
                key: 'actor__username',
              },
            ]}
            toolbarSearchableKeys={searchableKeys}
            toolbarRelatedSearchableKeys={relatedSearchableKeys}
            headerRow={
              <HeaderRow qsConfig={QS_CONFIG} isSelectable={false}>
                <HeaderCell sortKey="timestamp">{t`Time`}</HeaderCell>
                <HeaderCell sortKey="actor__username">
                  {t`Initiated By`}
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
