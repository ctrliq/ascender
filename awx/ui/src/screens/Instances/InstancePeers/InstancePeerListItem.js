import React from 'react';
import { Link } from 'react-router-dom';
import { t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
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
  const { i18n } = useLingui();
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
          dataLabel={i18n._(t`Selected`)}
        />

        <Td id={labelId} dataLabel={i18n._(t`Name`)}>
          <Link to={`/instances/${peerInstance.instance}/details`}>
            <b>{peerInstance.hostname}</b>
          </Link>
        </Td>

        <Td id={labelId} dataLabel={i18n._(t`Address`)}>
          {peerInstance.address}
        </Td>

        <Td id={labelId} dataLabel={i18n._(t`Port`)}>
          {peerInstance.port}
        </Td>

        <Td dataLabel={i18n._(t`Node Type`)}>{peerInstance.node_type}</Td>

        <Td id={labelId} dataLabel={i18n._(t`Canonical`)}>
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
                  label={i18n._(t`Running Jobs`)}
                />
                <Detail
                  data-cy="total-jobs"
                  value={peerInstance.jobs_total}
                  label={i18n._(t`Total Jobs`)}
                />
                <Detail
                  data-cy="policy-type"
                  label={i18n._(t`Policy Type`)}
                  value={
                    peerInstance.managed_by_policy
                      ? i18n._(t`Auto`)
                      : i18n._(t`Manual`)
                  }
                />
                <Detail
                  data-cy="last-health-check"
                  label={i18n._(t`Last Health Check`)}
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
