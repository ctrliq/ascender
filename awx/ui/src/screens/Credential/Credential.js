import React, { useCallback, useEffect } from 'react';
import { useLingui } from '@lingui/react/macro';

import { CaretLeftIcon } from '@patternfly/react-icons';
import { Card, PageSection } from '@patternfly/react-core';
import { Link,
  Routes,
  Route,
  Navigate,
  useParams,
  useLocation } from 'react-router';
import useRequest from 'hooks/useRequest';
import { ResourceAccessList } from 'components/ResourceAccessList';
import ContentError from 'components/ContentError';
import ContentLoading from 'components/ContentLoading';
import RoutedTabs from 'components/RoutedTabs';
import RelatedTemplateList from 'components/RelatedTemplateList';
import { CredentialsAPI } from 'api';
import CredentialDetail from './CredentialDetail';
import CredentialEdit from './CredentialEdit';

const unacceptableCredentialTypes = [
  'centrify_vault_kv',
  'aim',
  'conjur',
  'hashivault_kv',
  'hashivault_ssh',
  'azure_kv',
  'thycotic_dsv',
  'thycotic_tss',
  'galaxy_api_token',
  'insights',
  'registry',
  'scm',
];

function Credential({ setBreadcrumb }) {
  const { t } = useLingui();
  const { pathname } = useLocation();
  const { id } = useParams();

  const {
    request: fetchCredential,
    result: { credential },
    isLoading: hasContentLoading,
    error: contentError,
  } = useRequest(
    useCallback(async () => {
      const { data } = await CredentialsAPI.readDetail(id);
      return {
        credential: data,
      };
    }, [id]),
    {
      credential: null,
    }
  );

  useEffect(() => {
    fetchCredential();
  }, [fetchCredential, pathname]);

  useEffect(() => {
    if (credential) {
      setBreadcrumb(credential);
    }
  }, [credential, setBreadcrumb]);

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {t`Back to Credentials`}
        </>
      ),
      link: `/credentials`,
      id: 99,
      persistentFilterKey: 'credentials',
    },
    { name: t`Details`, link: `/credentials/${id}/details`, id: 0 },
    {
      name: t`Access`,
      link: `/credentials/${id}/access`,
      id: 1,
    },
  ];
  if (
    !unacceptableCredentialTypes.includes(credential?.kind) &&
    credential !== null
  ) {
    tabsArray.push({
      name: t`Job Templates`,
      link: `/credentials/${id}/job_templates`,
      id: 2,
    });
  }
  let showCardHeader = true;

  if (pathname.endsWith('edit') || pathname.endsWith('add')) {
    showCardHeader = false;
  }

  if (!hasContentLoading && contentError) {
    return (
      <PageSection hasBodyWrapper={false}>
        <Card>
          <ContentError error={contentError}>
            {contentError.response && contentError.response.status === 404 && (
              <span>
                {t`Credential not found.`}{' '}
                <Link to="/credentials">
                  {t`View all Credentials.`}
                </Link>
              </span>
            )}
          </ContentError>
        </Card>
      </PageSection>
    );
  }
  if (hasContentLoading) {
    return <ContentLoading />;
  }

  return (
    <PageSection hasBodyWrapper={false}>
      <Card>
        {showCardHeader && <RoutedTabs tabsArray={tabsArray} />}
        {!hasContentLoading && credential && (
          <Routes>
            <Route index element={<Navigate to="details" replace />} />
            <Route
              path="details"
              element={<CredentialDetail credential={credential} />}
            />
            <Route
              path="edit"
              element={<CredentialEdit credential={credential} />}
            />
            <Route
              path="access"
              element={
                <ResourceAccessList
                  resource={credential}
                  apiModel={CredentialsAPI}
                />
              }
            />
            <Route
              path="job_templates"
              element={
                <RelatedTemplateList
                  searchParams={{ credentials__id: credential.id }}
                  resourceName={[credential.name, credential.kind]}
                />
              }
            />
            <Route
              path="*"
              element={
                <ContentError isNotFound>
                  {id && (
                    <Link to={`/credentials/${id}/details`}>
                      {t`View Credential Details`}
                    </Link>
                  )}
                </ContentError>
              }
            />
          </Routes>
        )}
      </Card>
    </PageSection>
  );
}

export default Credential;
