import React from 'react';
import { Tr, Td } from '@patternfly/react-table';
import { Link } from 'react-router-dom';
import { useLingui } from '@lingui/react/macro';

function LabelListItem({ label, searchOrg }) {
  const { t } = useLingui();
  let search = `?template.labels__name__icontains=${encodeURIComponent(
    label.name
  )}`;
  if (searchOrg && label.summary_fields?.organization?.id) {
    search += `&template.organization__id=${encodeURIComponent(
      label.summary_fields.organization.id
    )}`;
  }
  return (
    <Tr key={label.id}>
      <Td style={{ width: 46, minWidth: 0, maxWidth: 46 }} />
      <Td dataLabel={t`Name`}>
        <b>
          <Link to={{ pathname: '/templates', search }}>{label.name}</Link>
        </b>
      </Td>
      <Td dataLabel={t`Organization`}>
        {label.summary_fields?.organization?.name || ''}
      </Td>
    </Tr>
  );
}

export default LabelListItem;
