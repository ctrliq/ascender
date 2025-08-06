import React from 'react';

import { t } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import { node } from 'prop-types';
import styled from 'styled-components';
import _Detail from './Detail';

const Detail = styled(_Detail)`
  dd& {
    color: red;
  }
`;

function DeletedDetail({ label, dataCy, helpText }) {
  const { i18n } = useLingui();
  return (
    <Detail
      label={label}
      dataCy={dataCy}
      value={i18n._(t`Deleted`)}
      helpText={helpText}
    />
  );
}

DeletedDetail.propTypes = {
  label: node.isRequired,
};

export default DeletedDetail;
