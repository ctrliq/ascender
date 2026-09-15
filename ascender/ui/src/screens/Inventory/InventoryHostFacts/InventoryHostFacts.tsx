import type { Host } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { CardBody } from 'components/Card';
import { DetailList } from 'components/DetailList';
import { VariablesDetail } from 'components/CodeEditor';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import useHostFacts from 'hooks/useHostFacts';

export interface InventoryHostFactsProps {
  host: Host;
  [key: string]: unknown;
}

function InventoryHostFacts({ host }: InventoryHostFactsProps) {
  const { data: result, isPending, error } = useHostFacts(host.id);

  const { t } = useLingui();

  if (error) {
    return <ContentError error={error} />;
  }

  if (isPending) {
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
