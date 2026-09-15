import type { Host } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';

import { CardBody } from 'components/Card';
import { DetailList } from 'components/DetailList';
import { VariablesDetail } from 'components/CodeEditor';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import useHostFacts from 'hooks/useHostFacts';

export interface HostFactsProps {
  host: Host;
  [key: string]: unknown;
}

function HostFacts({ host }: HostFactsProps) {
  const { t } = useLingui();
  const { data: facts = '{}', isPending, error } = useHostFacts(host.id);

  if (isPending) {
    return <ContentLoading />;
  }

  if (error) {
    return <ContentError error={error} />;
  }

  return (
    <CardBody>
      <DetailList gutter="sm">
        <VariablesDetail
          label={t`Facts`}
          rows="auto"
          value={facts}
          name="facts"
          dataCy="host-facts-detail"
        />
      </DetailList>
    </CardBody>
  );
}

export default HostFacts;
