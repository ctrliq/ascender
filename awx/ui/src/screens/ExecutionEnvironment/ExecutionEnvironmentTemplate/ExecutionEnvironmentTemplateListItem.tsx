import type { AnyUnifiedJobTemplate } from 'types/api';
import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Link } from 'react-router';
import { Tr, Td } from '@patternfly/react-table';

export interface ExecutionEnvironmentTemplateListItemProps {
  template: AnyUnifiedJobTemplate;
  detailUrl: string;
}

function ExecutionEnvironmentTemplateListItem({
  template,
  detailUrl,
}: ExecutionEnvironmentTemplateListItemProps) {
  const { t } = useLingui();
  return (
    <Tr
      id={`template-row-${template.id}`}
      ouiaId={`template-row-${template.id}`}
    >
      <Td dataLabel={t`Name`}>
        <Link to={`${detailUrl}`}>
          <b>{template.name}</b>
        </Link>
      </Td>
      <Td dataLabel={t`Type`}>
        {template.type === 'job_template'
          ? t`Job Template`
          : t`Workflow Job Template`}
      </Td>
    </Tr>
  );
}

export default ExecutionEnvironmentTemplateListItem;
