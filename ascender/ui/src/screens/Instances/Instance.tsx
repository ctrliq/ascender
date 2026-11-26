import type { Instance as InstanceType, SetBreadcrumb } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { useLingui } from '@lingui/react/macro';

import { Link, Routes, Route, Navigate, useParams } from 'react-router';
import { CaretLeftIcon } from '@patternfly/react-icons';
import { Card, PageSection } from '@patternfly/react-core';
import { useConfig } from 'contexts/Config';
import ContentError from 'components/ContentError';
import RoutedTabs from 'components/RoutedTabs';
import useRequest from 'hooks/useRequest';
import { InstancesAPI, SettingsAPI } from 'api';
import ContentLoading from 'components/ContentLoading';
import InstanceDetail from './InstanceDetail';
import InstancePeerList from './InstancePeers';
import InstanceListenerAddressList from './InstanceListenerAddressList';
import InstanceInstanceGroupList from './InstanceInstanceGroups';
import InstanceJobList from './InstanceJobs';
import {
  DEFAULT_QUEUE_NAMES,
  queueNamesFrom,
} from '../InstanceGroup/shared/queueNames';

export interface InstanceProps {
  setBreadcrumb: SetBreadcrumb;
  [key: string]: unknown;
}

function Instance({ setBreadcrumb }: InstanceProps) {
  const { t } = useLingui();
  const { me } = useConfig();
  const canReadSettings = me?.is_superuser || me?.is_system_auditor;

  const { id } = useParams() as { id: string };
  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Instances`}
        </>
      ),
      link: `/instances`,
      id: 99,
      persistentFilterKey: 'instances',
    },
    { name: t`Details`, link: `/instances/${id}/details`, id: 0 },
  ];

  const {
    result: { isK8s, instance, queueNames },
    error,
    isLoading,
    request,
  } = useRequest(
    // The result is an object rather than the flags themselves so that the
    // initial value has somewhere to carry isLoading, which is what holds the
    // screen on its spinner until the setting has been read.
    useCallback(async () => {
      const [{ data }, settings] = await Promise.all([
        InstancesAPI.readDetail(id),
        canReadSettings ? SettingsAPI.readCategory('system') : null,
      ]);
      return {
        isK8s: Boolean(settings?.data?.IS_K8S),
        // Kept whole rather than only its node type, so the tabs below that
        // need the instance take it from here instead of reading it again.
        instance: data as InstanceType,
        // The same read holds the control plane group's name, which is the
        // one group a hybrid node may not leave.
        queueNames: queueNamesFrom(
          settings?.data as Record<string, unknown> | undefined
        ),
      };
    }, [id, canReadSettings]),
    {
      isK8s: false,
      instance: undefined as InstanceType | undefined,
      queueNames: DEFAULT_QUEUE_NAMES,
      isLoading: true,
    }
  );
  const nodeType = instance?.node_type;

  // A hop node only relays traffic across the mesh: it belongs to no instance
  // group and never runs a job, so those two tabs would always be empty.
  const isHopNode = nodeType === 'hop';

  useEffect(() => {
    request();
  }, [request]);

  if (isK8s) {
    tabsArray.push({
      name: t`Listener Addresses`,
      link: `/instances/${id}/listener_addresses`,
      id: 1,
    });
    tabsArray.push({
      name: t`Peers`,
      link: `/instances/${id}/peers`,
      id: 2,
    });
  }
  if (!isHopNode) {
    // Runs last, as on every other object that has them.
    tabsArray.push({
      name: t`Instance Groups`,
      link: `/instances/${id}/instance_groups`,
      id: 3,
    });
    tabsArray.push({
      name: t`Runs`,
      link: `/instances/${id}/runs`,
      id: 4,
    });
  }
  if (isLoading) {
    return <ContentLoading />;
  }

  if (error) {
    return <ContentError error={error} />;
  }
  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        <RoutedTabs tabsArray={tabsArray} />
        <Routes>
          <Route index element={<Navigate to="details" replace />} />
          <Route
            path="details"
            element={
              <InstanceDetail isK8s={isK8s} setBreadcrumb={setBreadcrumb} />
            }
          />
          {isK8s && (
            <Route
              path="listener_addresses"
              element={
                <InstanceListenerAddressList setBreadcrumb={setBreadcrumb} />
              }
            />
          )}
          {isK8s && (
            <Route
              path="peers"
              element={<InstancePeerList setBreadcrumb={setBreadcrumb} />}
            />
          )}
          {!isHopNode && instance && (
            <Route
              path="instance_groups"
              element={
                <InstanceInstanceGroupList
                  instance={instance}
                  controlPlaneName={queueNames.controlPlane}
                  setBreadcrumb={setBreadcrumb}
                />
              }
            />
          )}
          {!isHopNode && (
            <Route
              path="runs"
              element={<InstanceJobList setBreadcrumb={setBreadcrumb} />}
            />
          )}
          <Route
            path="*"
            element={
              <ContentError isNotFound>
                {id && (
                  <Link to={`/instances/${id}/details`}>
                    {t`View Instance Details`}
                  </Link>
                )}
              </ContentError>
            }
          />
        </Routes>
      </Card>
    </PageSection>
  );
}

export default Instance;
