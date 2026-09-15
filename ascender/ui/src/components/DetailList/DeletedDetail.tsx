import React from 'react';

import { useLingui } from '@lingui/react/macro';
import Detail from './Detail';
import './DetailList.css';

export interface DeletedDetailProps {
  label: React.ReactNode;
  dataCy?: string;
  helpText?: React.ReactNode;
  [key: string]: unknown;
}

function DeletedDetail({ label, dataCy, helpText }: DeletedDetailProps) {
  const { t } = useLingui();
  return (
    <Detail
      label={label}
      dataCy={dataCy}
      value={t`Deleted`}
      helpText={helpText}
    />
  );
}

export default DeletedDetail;
