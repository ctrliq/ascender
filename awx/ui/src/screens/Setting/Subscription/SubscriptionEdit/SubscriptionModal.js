import React, { useCallback, useEffect } from 'react';

import { t, Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react';
import {
  Button,
  EmptyState,
  EmptyStateIcon,
  EmptyStateBody,
  Modal,
  Title,
} from '@patternfly/react-core';
import {
  TableComposable,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '@patternfly/react-table';
import { ExclamationTriangleIcon } from '@patternfly/react-icons';

import { ConfigAPI } from 'api';
import { formatDateString } from 'util/dates';
import useRequest from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import ErrorDetail from 'components/ErrorDetail';
import ContentEmpty from 'components/ContentEmpty';
import ContentLoading from 'components/ContentLoading';

function SubscriptionModal({
  subscriptionCreds = {},
  selectedSubscription = null,
  onClose,
  onConfirm,
}) {
  const {
    isLoading,
    error,
    request: fetchSubscriptions,
    result: subscriptions,
  } = useRequest(
    useCallback(async () => {
      if (!subscriptionCreds.username || !subscriptionCreds.password) {
        return [];
      }
      const { data } = await ConfigAPI.readSubscriptions(
        subscriptionCreds.username,
        subscriptionCreds.password
      );

      // Ensure unique ids for each subscription
      // because it is possible to have multiple
      // subscriptions with the same pool_id
      let repeatId = 1;
      data.forEach((i) => {
        i.id = repeatId++;
      });

      return data;
    }, []), // eslint-disable-line react-hooks/exhaustive-deps
    []
  );

  const { selected, setSelected } = useSelected(subscriptions);

  const handleConfirm = () => {
    const [subscription] = selected;
    onConfirm(subscription);
    onClose();
  };

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  useEffect(() => {
    if (selectedSubscription?.id) {
      setSelected([selectedSubscription]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { i18n } = useLingui();
  return (
    <Modal
      aria-label={i18n._(t`Subscription selection modal`)}
      isOpen
      onClose={onClose}
      title={i18n._(t`Select a subscription`)}
      width="50%"
      actions={[
        <Button
          aria-label={i18n._(t`Confirm selection`)}
          isDisabled={selected.length === 0}
          key="confirm"
          onClick={handleConfirm}
          variant="primary"
          ouiaId="subscription-modal-confirm"
        >
          <Trans>Select</Trans>
        </Button>,
        <Button
          aria-label={i18n._(t`Cancel`)}
          key="cancel"
          onClick={onClose}
          variant="link"
          ouiaId="subscription-modal-cancel"
        >
          <Trans>Cancel</Trans>
        </Button>,
      ]}
    >
      {isLoading && <ContentLoading />}
      {!isLoading && error && (
        <EmptyState variant="full">
          <EmptyStateIcon icon={ExclamationTriangleIcon} />
          <Title size="lg" headingLevel="h3">
            <Trans>No subscriptions found</Trans>
          </Title>
          <EmptyStateBody>
            <Trans>
              We were unable to locate licenses associated with this account.
            </Trans>{' '}
            <Button
              aria-label={i18n._(t`Close subscription modal`)}
              onClick={onClose}
              variant="link"
              isInline
              ouiaId="subscription-modal-close"
            >
              <Trans>Return to subscription management.</Trans>
            </Button>
          </EmptyStateBody>
          <ErrorDetail error={error} />
        </EmptyState>
      )}
      {!isLoading && !error && subscriptions?.length === 0 && (
        <ContentEmpty
          title={i18n._(t`No subscriptions found`)}
          message={i18n._(
            t`We were unable to locate subscriptions associated with this account.`
          )}
        />
      )}
      {!isLoading && !error && subscriptions?.length > 0 && (
        <TableComposable
          variant="compact"
          aria-label={i18n._(t`Subscriptions table`)}
        >
          <Thead>
            <Tr ouiaId="subscription-table-header">
              <Th />
              <Th>{i18n._(t`Name`)}</Th>
              <Th modifier="fitContent">{i18n._(t`Managed nodes`)}</Th>
              <Th modifier="fitContent">{i18n._(t`Expires`)}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {subscriptions.map((subscription) => (
              <Tr
                key={`row-${subscription.id}`}
                id={`row-${subscription.id}`}
                ouiaId={`subscription-row-${subscription.pool_id}`}
              >
                <Td
                  select={{
                    onSelect: () => setSelected([subscription]),
                    isSelected: selected.some(
                      (row) => row.id === subscription.id
                    ),
                    variant: 'radio',
                    rowIndex: `row-${subscription.id}`,
                  }}
                />
                <Td dataLabel={i18n._(t`Trial`)}>
                  {subscription.subscription_name}
                </Td>
                <Td dataLabel={i18n._(t`Managed nodes`)}>
                  {subscription.instance_count}
                </Td>
                <Td dataLabel={i18n._(t`Expires`)} modifier="nowrap">
                  {formatDateString(
                    new Date(subscription.license_date * 1000).toISOString(),
                    'UTC'
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </TableComposable>
      )}
    </Modal>
  );
}

export default SubscriptionModal;
