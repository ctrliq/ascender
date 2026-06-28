import React, { useCallback, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import styled from 'styled-components';
import { Routes, Route } from 'react-router';
import {
	Alert,
	ClipboardCopy,
	ClipboardCopyVariant
} from '@patternfly/react-core';
import {
	Modal
} from '@patternfly/react-core/deprecated';
import { formatDateString } from 'util/dates';
import { Detail, DetailList } from 'components/DetailList';
import UserTokenAdd from '../UserTokenAdd';
import UserTokenList from '../UserTokenList';
import UserToken from '../UserToken';

const TokenAlert = styled(Alert)`
  margin-bottom: 20px;
`;

function UserTokens({ setBreadcrumb, user }) {
  const { t } = useLingui();
  const [tokenModalSource, setTokenModalSource] = useState(null);

  const onSuccessfulAdd = useCallback(
    (token) => setTokenModalSource(token),
    [setTokenModalSource]
  );

  return (
    <>
      <Routes>
        <Route
          path="add"
          element={<UserTokenAdd onSuccessfulAdd={onSuccessfulAdd} />}
        />
        {/* so the nested <UserToken> route tree can match the rest */}
        <Route
          path=":tokenId/*"
          element={<UserToken user={user} setBreadcrumb={setBreadcrumb} />}
        />
        <Route index element={<UserTokenList />} />
      </Routes>
      {tokenModalSource && (
        <Modal
          aria-label={t`Token information`}
          isOpen
          variant="medium"
          title={t`Token information`}
          onClose={() => setTokenModalSource(null)}
        >
          <TokenAlert
            variant="info"
            isInline
            title={t`This is the only time the token value and associated refresh token value will be shown.`}
          />
          <DetailList stacked>
            {tokenModalSource.token && (
              <Detail
                label={t`Token`}
                value={
                  <ClipboardCopy
                    isReadOnly
                    variant={ClipboardCopyVariant.expansion}
                  >
                    {tokenModalSource.token}
                  </ClipboardCopy>
                }
              />
            )}
            {tokenModalSource.refresh_token && (
              <Detail
                label={t`Refresh Token`}
                value={
                  <ClipboardCopy
                    isReadOnly
                    variant={ClipboardCopyVariant.expansion}
                  >
                    {tokenModalSource.refresh_token}
                  </ClipboardCopy>
                }
              />
            )}
            <Detail
              label={t`Expires`}
              value={formatDateString(tokenModalSource.expires)}
            />
          </DetailList>
        </Modal>
      )}
    </>
  );
}

export default UserTokens;
