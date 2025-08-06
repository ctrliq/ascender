import React from 'react';
import { Link } from 'react-router-dom';
import { t, Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import styled from 'styled-components';
import {
  Button,
  HelperText as PFHelperText,
  HelperTextItem,
  Label,
} from '@patternfly/react-core';
import {
  CaretLeftIcon,
  CheckIcon,
  ExclamationCircleIcon,
} from '@patternfly/react-icons';
import RoutedTabs from 'components/RoutedTabs';
import { CardBody, CardActionsRow } from 'components/Card';
import { DetailList, Detail } from 'components/DetailList';
import { useConfig } from 'contexts/Config';
import { formatDateString, secondsToDays } from 'util/dates';

const HelperText = styled(PFHelperText)`
  margin-top: 10px;
`;

function SubscriptionDetail() {
  const { i18n } = useLingui();
  const { me = {}, license_info, version, systemConfig } = useConfig();
  const baseURL = '/settings/subscription';
  const tabsArray = [
    {
      name: (
        <>
          <CaretLeftIcon />
          {i18n._(t`Back to Settings`)}
        </>
      ),
      link: '/settings',
      id: 99,
    },
    {
      name: i18n._(t`Subscription Details`),
      link: `${baseURL}/details`,
      id: 0,
    },
  ];

  const { automated_instances: automatedInstancesCount, automated_since } =
    license_info;

  const automatedInstancesSinceDateTime = automated_since
    ? formatDateString(new Date(automated_since * 1000).toISOString())
    : null;

  return (
    <>
      <RoutedTabs tabsArray={tabsArray} />
      <CardBody>
        <DetailList>
          {systemConfig?.SUBSCRIPTION_USAGE_MODEL ===
            'unique_managed_hosts' && (
            <Detail
              dataCy="subscription-status"
              label={i18n._(t`Status`)}
              value={
                license_info.compliant ? (
                  <>
                    <Label variant="outline" color="green" icon={<CheckIcon />}>
                      {i18n._(t`Compliant`)}
                    </Label>
                    <HelperText>
                      <HelperTextItem>
                        {i18n._(
                          t`The number of hosts you have automated against is below your subscription count.`
                        )}
                      </HelperTextItem>
                    </HelperText>
                  </>
                ) : (
                  <>
                    <Label
                      variant="outline"
                      color="red"
                      icon={<ExclamationCircleIcon />}
                    >
                      {i18n._(t`Out of compliance`)}
                    </Label>
                    <HelperText>
                      <HelperTextItem>
                        {i18n._(
                          t`You have automated against more hosts than your subscription allows.`
                        )}
                      </HelperTextItem>
                    </HelperText>
                  </>
                )
              }
            />
          )}
          {typeof automatedInstancesCount !== 'undefined' &&
            automatedInstancesCount !== null &&
            systemConfig?.SUBSCRIPTION_USAGE_MODEL !== '' && (
              <Detail
                dataCy="subscription-hosts-automated"
                label={i18n._(t`Hosts automated`)}
                value={
                  automated_since ? (
                    <Trans>
                      {automatedInstancesCount} since{' '}
                      {automatedInstancesSinceDateTime}
                    </Trans>
                  ) : (
                    automatedInstancesCount
                  )
                }
              />
            )}
          {systemConfig?.SUBSCRIPTION_USAGE_MODEL !== '' && (
            <Detail
              dataCy="subscription-hosts-imported"
              label={i18n._(t`Hosts imported`)}
              value={license_info.current_instances}
            />
          )}
          {systemConfig?.SUBSCRIPTION_USAGE_MODEL ===
            'unique_managed_hosts' && (
            <Detail
              dataCy="subscription-hosts-remaining"
              label={i18n._(t`Hosts remaining`)}
              value={license_info.free_instances}
            />
          )}
          {systemConfig?.SUBSCRIPTION_USAGE_MODEL ===
            'unique_managed_hosts' && (
            <Detail
              dataCy="subscription-hosts-deleted"
              label={i18n._(t`Hosts deleted`)}
              value={license_info.deleted_instances}
            />
          )}
          {systemConfig?.SUBSCRIPTION_USAGE_MODEL ===
            'unique_managed_hosts' && (
            <Detail
              dataCy="subscription-hosts-reactivated"
              label={i18n._(t`Active hosts previously deleted`)}
              value={license_info.reactivated_instances}
            />
          )}

          {systemConfig?.SUBSCRIPTION_USAGE_MODEL !== '' &&
            license_info.instance_count < 9999999 && (
              <Detail
                dataCy="subscription-hosts-available"
                label={i18n._(t`Hosts available`)}
                value={license_info.available_instances}
              />
            )}
          {systemConfig?.SUBSCRIPTION_USAGE_MODEL !== '' &&
            license_info.instance_count >= 9999999 && (
              <Detail
                dataCy="subscription-unlimited-hosts-available"
                label={i18n._(t`Hosts available`)}
                value={i18n._(t`Unlimited`)}
              />
            )}
          <Detail
            dataCy="subscription-type"
            label={i18n._(t`Subscription type`)}
            value={license_info.license_type}
          />
          <Detail
            dataCy="subscription-name"
            label={i18n._(t`Subscription`)}
            value={license_info.subscription_name}
          />
          <Detail
            dataCy="subscription-trial"
            label={i18n._(t`Trial`)}
            value={license_info.trial ? i18n._(t`True`) : i18n._(t`False`)}
          />
          <Detail
            dataCy="subscription-expires-on-date"
            label={i18n._(t`Expires on`)}
            value={
              license_info.license_date &&
              formatDateString(
                new Date(license_info.license_date * 1000).toISOString()
              )
            }
          />
          <Detail
            dataCy="subscription-expires-on-utc-date"
            label={i18n._(t`Expires on UTC`)}
            value={
              license_info.license_date &&
              formatDateString(
                new Date(license_info.license_date * 1000).toISOString(),
                'UTC'
              )
            }
          />
          <Detail
            dataCy="subscription-days-remaining"
            label={i18n._(t`Days remaining`)}
            value={
              license_info.time_remaining &&
              secondsToDays(license_info.time_remaining)
            }
          />
          <Detail
            dataCy="subscription-version"
            label={i18n._(t`Automation controller version`)}
            value={version}
          />
        </DetailList>
        <br />
        <Trans>
          If you are ready to upgrade or renew, please{' '}
          <Button
            component="a"
            href="https://www.redhat.com/contact"
            variant="link"
            target="_blank"
            rel="noopener noreferrer"
            isInline
          >
            contact us.
          </Button>
        </Trans>
        {me.is_superuser && (
          <CardActionsRow>
            <Button
              aria-label={i18n._(t`edit`)}
              component={Link}
              to="/settings/subscription/edit"
            >
              <Trans>Edit</Trans>
            </Button>
          </CardActionsRow>
        )}
      </CardBody>
    </>
  );
}

export default SubscriptionDetail;
