import React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import { Tr, Td } from '@patternfly/react-table';

function ExecutionEnvironmentTemplateListItem({ template, detailUrl }) {
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
