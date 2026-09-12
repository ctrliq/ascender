import type { SummaryFieldRef, User } from 'types/api';
import React from 'react';
import { Trans } from '@lingui/react/macro';
import { Link } from 'react-router';
import styled from 'styled-components';
import { formatDateString } from 'util/dates';
import _Detail from './Detail';

const Detail = styled(_Detail)`
  word-break: break-word;
`;

export interface UserDateDetailProps {
  label: React.ReactNode;
  date: unknown;
  /**
   * Either the user or the reference summary_fields inlines, which is what
   * created_by and modified_by are; only id and username are read.
   */
  user?: (User | (SummaryFieldRef & { username?: string })) | null;
  [key: string]: unknown;
}

function UserDateDetail({ label, date, user = null }: UserDateDetailProps) {
  const dateStr = formatDateString(date as string);
  const username = user ? (user.username as string) : '';
  return (
    <Detail
      label={label}
      dataCy="user-date-detail"
      value={
        user ? (
          <Trans>
            {dateStr} by <Link to={`/users/${user.id}`}>{username}</Link>
          </Trans>
        ) : (
          dateStr
        )
      }
    />
  );
}
export default UserDateDetail;
