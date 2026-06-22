import React from 'react';
import { Trans } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { formatDateString } from 'util/dates';
import _Detail from './Detail';

const Detail = styled(_Detail)`
  word-break: break-word;
`;

function UserDateDetail({ label, date, user = null }) {
  const dateStr = formatDateString(date);
  const username = user ? user.username : '';
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
