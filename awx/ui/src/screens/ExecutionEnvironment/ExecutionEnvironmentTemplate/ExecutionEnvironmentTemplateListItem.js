import React from 'react';
import { useLingui } from '@lingui/react';
import { t } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import { Tr, Td } from '@patternfly/react-table';

function ExecutionEnvironmentTemplateListItem({ template, detailUrl }) {
  const { i18n } = useLingui();
  return (
    <Tr
      id={`template-row-${template.id}`}
      ouiaId={`template-row-${template.id}`}
    >
      <Td dataLabel={i18n._(t`Name`)}>
        <Link to={`${detailUrl}`}>
          <b>{template.name}</b>
        </Link>
      </Td>
      <Td dataLabel={i18n._(t`Type`)}>
        {template.type === 'job_template'
          ? i18n._(t`Job Template`)
          : i18n._(t`Workflow Job Template`)}
      </Td>
    </Tr>
  );
}

export default ExecutionEnvironmentTemplateListItem;
