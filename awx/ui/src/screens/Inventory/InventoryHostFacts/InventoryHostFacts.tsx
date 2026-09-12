import type { Host } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { useLingui } from '@lingui/react/macro';
import { CardBody } from 'components/Card';
import { DetailList } from 'components/DetailList';
import { VariablesDetail } from 'components/CodeEditor';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import useRequest from 'hooks/useRequest';
import { HostsAPI } from 'api';

export interface InventoryHostFactsProps {
  host: Host;
  [key: string]: unknown;
}

function InventoryHostFacts({ host }: InventoryHostFactsProps) {
  const { request, isLoading, error, result } = useRequest(
    useCallback(async () => {
      const { data } = await HostsAPI.readFacts(host.id);

      return JSON.stringify(data, null, 4);
    }, [host]),
    null
  );

  const { t } = useLingui();
  useEffect(() => {
    request();
  }, [request]);

  if (error) {
    return <ContentError error={error} />;
  }

  if (isLoading || result === null) {
    return <ContentLoading />;
  }

  return (
    <CardBody>
      <DetailList gutter="sm">
        <VariablesDetail
          label={t`Facts`}
          rows="auto"
          value={result}
          name="facts"
          dataCy="inventory-host-facts-detail"
        />
      </DetailList>
    </CardBody>
  );
}

export default InventoryHostFacts;
