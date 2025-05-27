import React, { useEffect, useCallback } from 'react';
import {
  Link,
  Redirect,
  Route,
  Switch,
  useLocation,
  useParams,
} from 'react-router-dom';

import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
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
  const { i18n } = useLingui();
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
          {i18n._(msg`Back to credential types`)}
        </>
      ),
      link: '/credential_types',
      id: 99,
      persistentFilterKey: 'credentialTypes',
    },
    {
      name: i18n._(msg`Details`),
      link: `/credential_types/${id}/details`,
      id: 0,
    },
  ];

  if (!isLoading && contentError) {
    return (
      <PageSection>
        <Card>
          <ContentError error={contentError}>
            {contentError.response?.status === 404 && (
              <span>
                {i18n._(msg`Credential type not found.`)}{' '}
                <Link to="/credential_types">
                  {i18n._(msg`View all credential types`)}
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
    <PageSection>
      <Card>
        {cardHeader}
        {isLoading && <ContentLoading />}
        {!isLoading && credentialType && (
          <Switch>
            <Redirect
              from="/credential_types/:id"
              to="/credential_types/:id/details"
              exact
            />
            {credentialType && (
              <>
                <Route path="/credential_types/:id/edit">
                  <CredentialTypeEdit credentialType={credentialType} />
                </Route>
                <Route path="/credential_types/:id/details">
                  <CredentialTypeDetails credentialType={credentialType} />
                </Route>
              </>
            )}
          </Switch>
        )}
      </Card>
    </PageSection>
  );
}

export default CredentialType;
