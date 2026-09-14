import type { SummaryFieldRef, User } from 'types/api';
import React from 'react';
import { Trans } from '@lingui/react/macro';
import { Link } from 'react-router';
import { formatDateString } from 'util/dates';
import Detail from './Detail';
import './DetailList.css';

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
      className="awx-detail--break-word"
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
