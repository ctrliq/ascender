import React, { useCallback, useEffect } from 'react';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';

import { CaretLeftIcon } from '@patternfly/react-icons';
import { Card, PageSection } from '@patternfly/react-core';
import {
  Switch,
  useParams,
  useLocation,
  useRouteMatch,
  Route,
  Redirect,
  Link,
} from 'react-router-dom';
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
  const { i18n } = useLingui();
  const { pathname } = useLocation();

  const match = useRouteMatch({
    path: '/credentials/:id',
  });
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
          {i18n._(msg`Back to Credentials`)}
        </>
      ),
      link: `/credentials`,
      id: 99,
      persistentFilterKey: 'credentials',
    },
    { name: i18n._(msg`Details`), link: `/credentials/${id}/details`, id: 0 },
    {
      name: i18n._(msg`Access`),
      link: `/credentials/${id}/access`,
      id: 1,
    },
  ];
  if (
    !unacceptableCredentialTypes.includes(credential?.kind) &&
    credential !== null
  ) {
    tabsArray.push({
      name: i18n._(msg`Job Templates`),
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
      <PageSection>
        <Card>
          <ContentError error={contentError}>
            {contentError.response && contentError.response.status === 404 && (
              <span>
                {i18n._(msg`Credential not found.`)}{' '}
                <Link to="/credentials">
                  {i18n._(msg`View all Credentials.`)}
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
    <PageSection>
      <Card>
        {showCardHeader && <RoutedTabs tabsArray={tabsArray} />}
        {!hasContentLoading && credential && (
          <Switch>
            <Redirect
              from="/credentials/:id"
              to="/credentials/:id/details"
              exact
            />
            {credential && [
              <Route key="details" path="/credentials/:id/details">
                <CredentialDetail credential={credential} />
              </Route>,
              <Route key="edit" path="/credentials/:id/edit">
                <CredentialEdit credential={credential} />
              </Route>,
              <Route key="access" path="/credentials/:id/access">
                <ResourceAccessList
                  resource={credential}
                  apiModel={CredentialsAPI}
                />
              </Route>,
              <Route key="job_templates" path="/credentials/:id/job_templates">
                <RelatedTemplateList
                  searchParams={{ credentials__id: credential.id }}
                  resourceName={[credential.name, credential.kind]}
                />
              </Route>,
              <Route key="not-found" path="*">
                {!hasContentLoading && (
                  <ContentError isNotFound>
                    {match.params.id && (
                      <Link to={`/credentials/${match.params.id}/details`}>
                        {i18n._(msg`View Credential Details`)}
                      </Link>
                    )}
                  </ContentError>
                )}
              </Route>,
            ]}
            <Route key="not-found" path="*">
              {!hasContentLoading && (
                <ContentError isNotFound>
                  {id && (
                    <Link to={`/credentials/${id}/details`}>
                      {i18n._(msg`View Credential Details`)}
                    </Link>
                  )}
                </ContentError>
              )}
            </Route>
          </Switch>
        )}
      </Card>
    </PageSection>
  );
}

export default Credential;
