import ResourceTabs from 'components/ResourceTabs';
import React, { useEffect, useCallback, useState, useRef } from 'react';
import { useLingui } from '@lingui/react/macro';
import { PageSection, Card, CardBody } from '@patternfly/react-core';
import ContentError from 'components/ContentError';
import useRequest from 'hooks/useRequest';
import useTitle from 'hooks/useTitle';
import { MeshAPI } from 'api';
import { useUserProfile } from 'contexts/Config';
import { getInstanceTabs } from '../Instances/tabs';
import Header from './Header';
import MeshGraph from './MeshGraph';
import useZoom from './utils/useZoom';
import { CHILDSELECTOR, PARENTSELECTOR } from './constants';
import type { MeshData, MeshNode } from './constants';

function TopologyView() {
  const { t, i18n } = useLingui();
  const userProfile = useUserProfile();
  useTitle(t`Topology`);
  const storedNodes = useRef<MeshNode[] | null>(null);
  const [showLegend, setShowLegend] = useState(true);
  const [showZoomControls, setShowZoomControls] = useState(false);
  const {
    isLoading,
    result: { meshData },
    error: fetchInitialError,
    request: fetchMeshVisualizer,
  } = useRequest(
    useCallback(async () => {
      const { data } = await MeshAPI.read<MeshData>();
      storedNodes.current = data.nodes;
      return {
        meshData: data,
      };
    }, []),
    { meshData: { nodes: [], links: [] } }
  );
  useEffect(() => {
    fetchMeshVisualizer();
  }, [fetchMeshVisualizer]);
  const { zoom, zoomFit, zoomIn, zoomOut, resetZoom } = useZoom(
    PARENTSELECTOR,
    CHILDSELECTOR
  );

  // The strip the instances and groups carry, kept on the error card too so a
  // failed read of the mesh still leaves the way to the other tabs.
  const tabs = (
    <ResourceTabs
      aria-label={t`Instance tabs`}
      ouiaId="instance-tabs"
      tabs={getInstanceTabs(userProfile).map(({ label, path }) => ({
        label: i18n._(label),
        path,
      }))}
    />
  );

  return (
    <>
      <Header
        title={t`Topology`}
        handleSwitchToggle={setShowLegend}
        toggleState={showLegend}
        zoomIn={zoomIn}
        zoomOut={zoomOut}
        zoomFit={zoomFit}
        refresh={fetchMeshVisualizer}
        resetZoom={resetZoom}
        showZoomControls={showZoomControls}
        // The error card has no graph to wait for, so Refresh stays open
        // there as the way to try the read again.
        isRefreshDisabled={fetchInitialError ? isLoading : !showZoomControls}
      />
      {fetchInitialError ? (
        <PageSection hasBodyWrapper={false}>
          <Card>
            {tabs}
            <CardBody>
              <ContentError error={fetchInitialError} />
            </CardBody>
          </Card>
        </PageSection>
      ) : (
        <PageSection
          hasBodyWrapper={false}
          isFilled
          style={{ display: 'flex', flexDirection: 'column' }}
        >
          <Card style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* The instances this draws are a list of their own, so the two are
                tabs of one screen rather than two items in the rail. */}
            {tabs}
            <CardBody style={{ flex: 1 }}>
              {!isLoading && (
                <MeshGraph
                  data={meshData}
                  showLegend={showLegend}
                  zoom={zoom}
                  setShowZoomControls={setShowZoomControls}
                  storedNodes={storedNodes}
                />
              )}
            </CardBody>
          </Card>
        </PageSection>
      )}
    </>
  );
}

export default TopologyView;
