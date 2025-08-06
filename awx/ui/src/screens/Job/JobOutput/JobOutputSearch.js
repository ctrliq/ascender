import React from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { t } from '@lingui/react/macro';
import {
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  ToolbarToggleGroup,
  Tooltip,
  Button,
} from '@patternfly/react-core';
import { SearchIcon } from '@patternfly/react-icons';
import Search from 'components/Search';
import {
  parseQueryString,
  mergeParams,
  removeParams,
  updateQueryString,
} from 'util/qs';
import { isJobRunning } from 'util/jobs';
import { useLingui } from '@lingui/react';

const SearchToolbarContent = styled(ToolbarContent)`
  padding-left: 0px !important;
  padding-right: 0px !important;
`;

function JobOutputSearch({
  qsConfig,
  job,
  eventRelatedSearchableKeys,
  eventSearchableKeys,
  scrollToEnd,
  isFollowModeEnabled,
  setIsFollowModeEnabled,
}) {
  const { i18n } = useLingui();
  const location = useLocation();
  const history = useHistory();

  const handleSearch = (key, value) => {
    const params = parseQueryString(qsConfig, location.search);
    const qs = updateQueryString(
      qsConfig,
      location.search,
      mergeParams(params, { [key]: value })
    );
    pushHistoryState(qs);
  };

  const handleReplaceSearch = (key, value) => {
    const qs = updateQueryString(qsConfig, location.search, {
      [key]: value,
    });
    pushHistoryState(qs);
  };

  const handleRemoveSearchTerm = (key, value) => {
    const oldParams = parseQueryString(qsConfig, location.search);
    const updatedParams = removeParams(qsConfig, oldParams, {
      [key]: value,
    });
    const qs = updateQueryString(qsConfig, location.search, updatedParams);
    pushHistoryState(qs);
  };

  const handleRemoveAllSearchTerms = () => {
    const oldParams = parseQueryString(qsConfig, location.search);
    Object.keys(oldParams).forEach((key) => {
      oldParams[key] = null;
    });
    const qs = updateQueryString(qsConfig, location.search, oldParams);
    pushHistoryState(qs);
  };

  const pushHistoryState = (qs) => {
    const { pathname } = history.location;
    history.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const handleFollowToggle = () => {
    if (isFollowModeEnabled) {
      setIsFollowModeEnabled(false);
    } else {
      setIsFollowModeEnabled(true);
      scrollToEnd();
    }
  };

  const columns = [
    {
      name: i18n._(t`Stdout`),
      key: 'stdout__icontains',
      isDefault: true,
    },
  ];

  if (job.type !== 'system_job' && job.type !== 'inventory_update') {
    columns.push({
      name: i18n._(t`Event`),
      key: 'or__event',
      options: [
        ['debug', i18n._(t`Debug`)],
        ['deprecated', i18n._(t`Deprecated`)],
        ['error', i18n._(t`Error`)],
        ['runner_on_file_diff', i18n._(t`File Difference`)],
        ['playbook_on_setup', i18n._(t`Gathering Facts`)],
        ['runner_on_async_failed', i18n._(t`Host Async Failure`)],
        ['runner_on_async_ok', i18n._(t`Host Async OK`)],
        ['runner_on_failed', i18n._(t`Host Failed`)],
        ['runner_on_error', i18n._(t`Host Failure`)],
        ['runner_on_ok', i18n._(t`Host OK`)],
        ['runner_on_async_poll', i18n._(t`Host Polling`)],
        ['runner_retry', i18n._(t`Host Retry`)],
        ['runner_on_skipped', i18n._(t`Host Skipped`)],
        ['runner_on_start', i18n._(t`Host Started`)],
        ['runner_on_unreachable', i18n._(t`Host Unreachable`)],
        ['playbook_on_include', i18n._(t`Including File`)],
        ['runner_item_on_failed', i18n._(t`Item Failed`)],
        ['runner_item_on_ok', i18n._(t`Item OK`)],
        ['runner_item_on_skipped', i18n._(t`Item Skipped`)],
        ['playbook_on_no_hosts_matched', i18n._(t`No Hosts Matched`)],
        ['playbook_on_no_hosts_remaining', i18n._(t`No Hosts Remaining`)],
        ['runner_on_no_hosts', i18n._(t`No Hosts Remaining`)],
        ['playbook_on_play_start', i18n._(t`Play Started`)],
        ['playbook_on_stats', i18n._(t`Playbook Complete`)],
        ['playbook_on_start', i18n._(t`Playbook Started`)],
        ['playbook_on_notify', i18n._(t`Running Handlers`)],
        ['system_warning', i18n._(t`System Warning`)],
        ['playbook_on_task_start', i18n._(t`Task Started`)],
        ['playbook_on_vars_prompt', i18n._(t`Variables Prompted`)],
        ['verbose', i18n._(t`Verbose`)],
        ['warning', i18n._(t`Warning`)],
      ],
    });
  }
  columns.push({ name: i18n._(t`Advanced`), key: 'advanced' });
  const isDisabled = isJobRunning(job.status);

  return (
    <Toolbar
      id="job_output-toolbar"
      clearAllFilters={handleRemoveAllSearchTerms}
      collapseListedFiltersBreakpoint="lg"
      clearFiltersButtonText={i18n._(t`Clear all filters`)}
      ouiaId="job-output-toolbar"
    >
      <SearchToolbarContent>
        <ToolbarToggleGroup toggleIcon={<SearchIcon />} breakpoint="lg">
          <ToolbarItem variant="search-filter">
            {isDisabled ? (
              <Tooltip
                content={i18n._(
                  t`Search is disabled while the job is running`
                )}
              >
                <Search
                  qsConfig={qsConfig}
                  columns={columns}
                  searchableKeys={eventSearchableKeys}
                  relatedSearchableKeys={eventRelatedSearchableKeys}
                  onSearch={handleSearch}
                  onReplaceSearch={handleReplaceSearch}
                  onShowAdvancedSearch={() => {}}
                  onRemove={handleRemoveSearchTerm}
                  isDisabled
                />
              </Tooltip>
            ) : (
              <Search
                qsConfig={qsConfig}
                columns={columns}
                searchableKeys={eventSearchableKeys}
                relatedSearchableKeys={eventRelatedSearchableKeys}
                onSearch={handleSearch}
                onReplaceSearch={handleReplaceSearch}
                onShowAdvancedSearch={() => {}}
                onRemove={handleRemoveSearchTerm}
              />
            )}
          </ToolbarItem>
        </ToolbarToggleGroup>
        {isJobRunning(job.status) ? (
          <Button
            variant={isFollowModeEnabled ? 'secondary' : 'primary'}
            onClick={handleFollowToggle}
          >
            {isFollowModeEnabled ? i18n._(t`Unfollow`) : i18n._(t`Follow`)}
          </Button>
        ) : null}
      </SearchToolbarContent>
    </Toolbar>
  );
}

export default JobOutputSearch;
