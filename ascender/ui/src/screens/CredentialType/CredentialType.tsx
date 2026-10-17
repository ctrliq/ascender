import type { DetailedError, SetBreadcrumb } from 'types/api';
import React, { useEffect, useCallback } from 'react';
import {
  Link,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams,
} from 'react-router';

import { useLingui } from '@lingui/react/macro';
import { Card, PageSection } from '@patternfly/react-core';
import { CaretLeftIcon } from '@patternfly/react-icons';

import useRequest from 'hooks/useRequest';
import { CredentialTypesAPI } from 'api';
import RoutedTabs from 'components/RoutedTabs';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';

import CredentialTypeDetails from './CredentialTypeDetails';
import CredentialTypeEdit from './CredentialTypeEdit';

export interface CredentialTypeProps {
  setBreadcrumb: SetBreadcrumb;
  [key: string]: unknown;
}

function CredentialType({ setBreadcrumb }: CredentialTypeProps) {
  const { t } = useLingui();
  const { id } = useParams() as { id: string };
  const { pathname } = useLocation();

  const {
    isLoading,
    error: contentError,
    request: fetchCredentialTypes,
    result: credentialType,
  } = useRequest(
    useCallback(async () => {
      const { data } = await CredentialTypesAPI.readDetail(id);
      return data;
    }, [id])
  );

  useEffect(() => {
    fetchCredentialTypes();
  }, [fetchCredentialTypes, pathname]);

  useEffect(() => {
    if (credentialType) {
      setBreadcrumb(credentialType);
    }
  }, [credentialType, setBreadcrumb]);

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Credential Types`}
        </>
      ),
      link: '/credential_types',
      id: 99,
      persistentFilterKey: 'credentialTypes',
    },
    {
      name: t`Details`,
      link: `/credential_types/${id}/details`,
      id: 0,
    },
  ];

  if (!isLoading && contentError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={contentError}>
            {(contentError as DetailedError).response?.status === 404 && (
              <span>
                {t`Credential type not found.`}{' '}
                <Link to="/credential_types">
                  {t`View all Credential Types.`}
                </Link>
              </span>
            )}
          </ContentError>
        </Card>
      </PageSection>
    );
  }

  let cardHeader: React.ReactNode = <RoutedTabs tabsArray={tabsArray} />;
  if (pathname.endsWith('edit')) {
    cardHeader = null;
  }

  /*
   * One loading animation, in the place the content will be. Drawn inside the
   * card it made the page arrive in pieces: a card and its tabs first, an
   * animation inside them, then the content. Asked with the credentialType rather
   * than on its own, so a later read does not throw away a page already drawn.
   */
  if (isLoading && !credentialType) {
    return (
      <PageSection hasBodyWrapper={false}>
        <ContentLoading />
      </PageSection>
    );
  }

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        {cardHeader}
        {credentialType && (
          <Routes>
            <Route index element={<Navigate to="details" replace />} />
            <Route
              path="edit"
              element={<CredentialTypeEdit credentialType={credentialType} />}
            />
            <Route
              path="details"
              element={
                <CredentialTypeDetails credentialType={credentialType} />
              }
            />
            {/* A path under the credential type that none of the tabs
                name, as on a credential, says so rather than a blank card. */}
            <Route
              path="*"
              element={
                <ContentError isNotFound>
                  <Link to={`/credential_types/${id}/details`}>
                    {t`View Credential Type Details`}
                  </Link>
                </ContentError>
              }
            />
          </Routes>
        )}
      </Card>
    </PageSection>
  );
}

export default CredentialType;
