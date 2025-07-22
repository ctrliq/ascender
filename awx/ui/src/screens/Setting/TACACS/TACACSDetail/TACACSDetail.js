import React, { useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useLingui } from '@lingui/react';
import { msg } from '@lingui/macro';
import { Button, Alert as PFAlert } from '@patternfly/react-core';
import { CaretLeftIcon } from '@patternfly/react-icons';
import styled from 'styled-components';
import { CardBody, CardActionsRow } from 'components/Card';
import ContentLoading from 'components/ContentLoading';
import ContentError from 'components/ContentError';
import RoutedTabs from 'components/RoutedTabs';
import { SettingsAPI } from 'api';
import useRequest from 'hooks/useRequest';
import { DetailList } from 'components/DetailList';
import { useConfig } from 'contexts/Config';
import { useSettings } from 'contexts/Settings';
import { SettingDetail } from '../../shared';

const Alert = styled(PFAlert)`
  margin-bottom: 20px;
`;

function TACACSDetail() {
  const { i18n } = useLingui();
  const { me } = useConfig();
  const { GET: options } = useSettings();

  const {
    isLoading,
    error,
    request,
    result: tacacs,
  } = useRequest(
    useCallback(async () => {
      const { data } = await SettingsAPI.readCategory('tacacsplus');
      return data;
    }, []),
    null
  );

  useEffect(() => {
    request();
  }, [request]);

  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {i18n._(msg`Back to Settings`)}
        </>
      ),
      link: `/settings`,
      id: 99,
    },
    {
      name: i18n._(msg`Details`),
      link: `/settings/tacacs/details`,
      id: 0,
    },
  ];
  if (isLoading) {
    return <ContentLoading />;
  }
  if (!isLoading && error) {
    return <ContentError error={error} />;
  }
  return (
    <>
      <RoutedTabs tabsArray={tabsArray} />
      <CardBody>
        {isLoading && <ContentLoading />}
        {!isLoading && error && <ContentError error={error} />}
        {!isLoading && tacacs && (
          <>
            <Alert
              variant="info"
              isInline
              data-cy="TACACS-deprecation-warning"
              title={i18n._(
                msg`This feature is deprecated and will be removed in a future release.`
              )}
              ouiaId="tacacs-deprecation-alert"
            />
            <DetailList>
              {Object.keys(tacacs).map((key) => {
                const record = options?.[key];
                return (
                  <SettingDetail
                    key={key}
                    id={key}
                    helpText={record?.help_text}
                    label={record?.label}
                    type={record?.type}
                    unit={record?.unit}
                    value={tacacs?.[key]}
                  />
                );
              })}
            </DetailList>
          </>
        )}
        {me?.is_superuser && (
          <CardActionsRow>
            <Button
              aria-label={i18n._(msg`Edit`)}
              component={Link}
              to="/settings/tacacs/edit"
              ouiaId="tacacs-detail-edit-button"
            >
              {i18n._(msg`Edit`)}
            </Button>
          </CardActionsRow>
        )}
      </CardBody>
    </>
  );
}

export default TACACSDetail;
