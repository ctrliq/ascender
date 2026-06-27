import React, { useEffect, useCallback } from 'react';
import {
  Link,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams,
} from 'routerCompat';

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

function CredentialType({ setBreadcrumb }) {
  const { t } = useLingui();
  const { id } = useParams();
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
          {t`Back to credential types`}
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
            {contentError.response?.status === 404 && (
              <span>
                {t`Credential type not found.`}{' '}
                <Link to="/credential_types">
                  {t`View all credential types`}
                </Link>
              </span>
            )}
          </ContentError>
        </Card>
      </PageSection>
    );
  }

  let cardHeader = <RoutedTabs tabsArray={tabsArray} />;
  if (pathname.endsWith('edit')) {
    cardHeader = null;
  }

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        {cardHeader}
        {isLoading && <ContentLoading />}
        {!isLoading && credentialType && (
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
          </Routes>
        )}
      </Card>
    </PageSection>
  );
}

export default CredentialType;
