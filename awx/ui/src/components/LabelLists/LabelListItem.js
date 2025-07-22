import React from 'react';
import { Tr, Td } from '@patternfly/react-table';
import { Link } from 'react-router-dom';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';

function LabelListItem({ label, searchOrg }) {
  const { i18n } = useLingui();
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
      <Td dataLabel={i18n._(msg`Name`)}>
        <b>
          <Link to={{ pathname: '/templates', search }}>{label.name}</Link>
        </b>
      </Td>
      <Td dataLabel={i18n._(msg`Organization`)}>
        {label.summary_fields?.organization?.name || ''}
      </Td>
    </Tr>
  );
}

export default LabelListItem;
