import React from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Link } from 'react-router-dom';
import { Tr, Td } from '@patternfly/react-table';

function ExecutionEnvironmentTemplateListItem({ template, detailUrl }) {
  const { i18n } = useLingui();
  return (
    <Tr
      id={`template-row-${template.id}`}
      ouiaId={`template-row-${template.id}`}
    >
      <Td dataLabel={i18n._(msg`Name`)}>
        <Link to={`${detailUrl}`}>
          <b>{template.name}</b>
        </Link>
      </Td>
      <Td dataLabel={i18n._(msg`Type`)}>
        {template.type === 'job_template'
          ? i18n._(msg`Job Template`)
          : i18n._(msg`Workflow Job Template`)}
      </Td>
    </Tr>
  );
}

export default ExecutionEnvironmentTemplateListItem;
