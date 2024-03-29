import React from 'react';
import { Link } from 'react-router-dom';
import { t } from '@lingui/macro';
import 'styled-components/macro';
import { Tr, Td, ExpandableRowContent } from '@patternfly/react-table';
import { formatDateString } from 'util/dates';
import { Detail, DetailList } from 'components/DetailList';

function InstancePeerListItem({
  peerInstance,
  isSelected,
  onSelect,
  isExpanded,
  onExpand,
  rowIndex,
}) {
  const labelId = `check-action-${peerInstance.id}`;
  const isHopNode = peerInstance.node_type === 'hop';
  return (
    <>
      <Tr
        id={`peerInstance-row-${peerInstance.id}`}
        ouiaId={`peerInstance-row-${peerInstance.id}`}
      >
        {isHopNode ? (
          <Td />
        ) : (
          <Td
            expand={{
              rowIndex,
              isExpanded,
              onToggle: onExpand,
            }}
          />
        )}
        <Td
          select={{
            rowIndex,
            isSelected,
            onSelect,
          }}
          dataLabel={t`Selected`}
        />

        <Td id={labelId} dataLabel={t`Name`}>
          <Link to={`/instances/${peerInstance.instance}/details`}>
            <b>{peerInstance.hostname}</b>
          </Link>
        </Td>

        <Td id={labelId} dataLabel={t`Address`}>
          {peerInstance.address}
        </Td>

        <Td id={labelId} dataLabel={t`Port`}>
          {peerInstance.port}
        </Td>

        <Td dataLabel={t`Node Type`}>{peerInstance.node_type}</Td>

        <Td id={labelId} dataLabel={t`Canonical`}>
          {peerInstance.canonical.toString()}
        </Td>
      </Tr>
      {!isHopNode && (
        <Tr
          ouiaId={`peerInstance-row-${peerInstance.id}-expanded`}
          isExpanded={isExpanded}
        >
          <Td colSpan={2} />
          <Td colSpan={7}>
            <ExpandableRowContent>
              <DetailList>
                <Detail
                  data-cy="running-jobs"
                  value={peerInstance.jobs_running}
                  label={t`Running Jobs`}
                />
                <Detail
                  data-cy="total-jobs"
                  value={peerInstance.jobs_total}
                  label={t`Total Jobs`}
                />
                <Detail
                  data-cy="policy-type"
                  label={t`Policy Type`}
                  value={peerInstance.managed_by_policy ? t`Auto` : t`Manual`}
                />
                <Detail
                  data-cy="last-health-check"
                  label={t`Last Health Check`}
                  value={formatDateString(peerInstance.last_health_check)}
                />
              </DetailList>
            </ExpandableRowContent>
          </Td>
        </Tr>
      )}
    </>
  );
}

export default InstancePeerListItem;
