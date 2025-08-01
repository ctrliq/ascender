import React, { useEffect, useCallback } from 'react';
import {
  Link,
  Redirect,
  Route,
  Switch,
  useLocation,
  useParams,
} from 'react-router-dom';

import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { CaretLeftIcon } from '@patternfly/react-icons';
import { Card, PageSection } from '@patternfly/react-core';

import useRequest from 'hooks/useRequest';
import { InstanceGroupsAPI } from 'api';
import RoutedTabs from 'components/RoutedTabs';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import JobList from 'components/JobList';

import InstanceGroupDetails from './InstanceGroupDetails';
import InstanceGroupEdit from './InstanceGroupEdit';
import Instances from './Instances/Instances';

function InstanceGroup({ setBreadcrumb }) {
  const { i18n } = useLingui();
  const { id } = useParams();
  const { pathname } = useLocation();

  const {
    isLoading,
    error: contentError,
    request: fetchInstanceGroups,
    result: { instanceGroup },
  } = useRequest(
    useCallback(async () => {
      const { data } = await InstanceGroupsAPI.readDetail(id);

      return {
        instanceGroup: data,
      };
    }, [id]),
    { instanceGroup: null }
  );

  useEffect(() => {
    fetchInstanceGroups();
  }, [fetchInstanceGroups, pathname]);

  useEffect(() => {
    if (instanceGroup) {
      setBreadcrumb(instanceGroup);
    }
  }, [instanceGroup, setBreadcrumb]);

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {i18n._(msg`Back to Instance Groups`)}
        </>
      ),
      link: '/instance_groups',
      id: 99,
      persistentFilterKey: 'instanceGroups',
    },
    {
      name: i18n._(msg`Details`),
      link: `/instance_groups/${id}/details`,
      id: 0,
    },
    {
      name: i18n._(msg`Instances`),
      link: `/instance_groups/${id}/instances`,
      id: 1,
    },
    {
      name: i18n._(msg`Jobs`),
      link: `/instance_groups/${id}/jobs`,
      id: 2,
    },
  ];

  if (!isLoading && contentError) {
    return (
      <PageSection>
        <Card>
          <ContentError error={contentError}>
            {contentError.response?.status === 404 && (
              <span>
                {i18n._(msg`Instance group not found.`)}

                <Link to="/instance_groups">
                  {i18n._(msg`View all instance groups`)}
                </Link>
              </span>
            )}
          </ContentError>
        </Card>
      </PageSection>
    );
  }

  let cardHeader = <RoutedTabs tabsArray={tabsArray} />;

  if (['edit', 'instances/'].some((name) => pathname.includes(name))) {
    cardHeader = null;
  }

  return (
    <PageSection>
      <Card>
        {cardHeader}
        {isLoading && <ContentLoading />}
        {!isLoading && instanceGroup && (
          <Switch>
            <Redirect
              from="/instance_groups/:id"
              to="/instance_groups/:id/details"
              exact
            />
            {instanceGroup && (
              <>
                <Route path="/instance_groups/:id/edit">
                  <InstanceGroupEdit instanceGroup={instanceGroup} />
                </Route>
                <Route path="/instance_groups/:id/details">
                  <InstanceGroupDetails instanceGroup={instanceGroup} />
                </Route>
                <Route path="/instance_groups/:id/instances">
                  <Instances
                    instanceGroup={instanceGroup}
                    setBreadcrumb={setBreadcrumb}
                  />
                </Route>
                <Route path="/instance_groups/:id/jobs">
                  <JobList
                    showTypeColumn
                    defaultParams={{ instance_group: instanceGroup.id }}
                  />
                </Route>
              </>
            )}
          </Switch>
        )}
      </Card>
    </PageSection>
  );
}

export default InstanceGroup;
