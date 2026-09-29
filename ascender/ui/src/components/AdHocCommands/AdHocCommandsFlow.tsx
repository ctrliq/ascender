import type { ApiEntity, Inventory, OptionsChoice, Paginated } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import { InventoriesAPI, CredentialTypesAPI } from 'api';
import AlertModal from '../AlertModal';
import ErrorDetail from '../ErrorDetail';
import ContentError from '../ContentError';
import AdHocCommandsWizard from './AdHocCommandsWizard';
import type { AdHocItem, AdHocValues } from './types';

export interface AdHocCommandsFlowProps {
  /** The hosts or groups the command runs against. */
  adHocItems: AdHocItem[];
  /** The modules the api offers, as value and label pairs. */
  moduleOptions: OptionsChoice[];
  /**
   * The inventory the command runs against. The inventory screens leave it
   * out, since their own address already names it; the hosts screen, which
   * lists every inventory's hosts, says which one the selection is from.
   */
  inventoryId?: number | string | null;
  onLaunchLoading: (isLoading: boolean) => void;
  onClose: () => void;
}

/**
 * The ad hoc command wizard, and the reads and the launch around it.
 *
 * Opened from a button beside a list of hosts or groups, and from the run
 * menu those lists carry: the trigger is the caller's, everything the wizard
 * needs is here.
 */
function AdHocCommandsFlow({
  adHocItems,
  moduleOptions,
  inventoryId,
  onLaunchLoading,
  onClose,
}: AdHocCommandsFlowProps) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { id: routeInventoryId } = useParams() as { id: string };
  const id = inventoryId ?? routeInventoryId;

  const {
    result: { credentialTypeId, organizationId },
    request: fetchData,
    error: fetchError,
  } = useRequest(
    useCallback(async () => {
      const [{ data }, cred] = await Promise.all([
        InventoriesAPI.readDetail<Inventory>(id as string),
        CredentialTypesAPI.read<Paginated<ApiEntity>>({ namespace: 'ssh' }),
      ]);
      return {
        credentialTypeId: cred.data.results[0]?.id ?? null,
        organizationId: data.organization ?? null,
      };
    }, [id]),
    { credentialTypeId: null, organizationId: null }
  );

  useEffect(() => {
    if (id) {
      fetchData();
    }
  }, [fetchData, id]);

  const {
    isLoading: isLaunchLoading,
    error: launchError,
    request: launchAdHocCommands,
  } = useRequest(
    useCallback(
      async (values: Record<string, unknown>) => {
        const { data } = await InventoriesAPI.launchAdHocCommands(
          id as string,
          values
        );
        navigate(`/runs/command/${data.id}/output`);
      },
      [id, navigate]
    )
  );

  const { error, dismissError } = useDismissableError(
    launchError || fetchError
  );

  const handleSubmit = async (values: AdHocValues) => {
    const {
      credentials,
      credential_passwords: { become_password, ssh_password, ssh_key_unlock },
      execution_environment,
      ...remainingValues
    } = values;

    await launchAdHocCommands({
      credential: credentials[0]?.id,
      become_password,
      ssh_password,
      ssh_key_unlock,
      execution_environment: execution_environment?.[0]?.id,
      ...remainingValues,
    });
  };

  useEffect(
    () => onLaunchLoading(isLaunchLoading),
    [isLaunchLoading, onLaunchLoading]
  );

  if (error) {
    return (
      <AlertModal
        isOpen={Boolean(error)}
        variant="error"
        title={t`Error!`}
        onClose={() => {
          dismissError();
          onClose();
        }}
      >
        {launchError ? (
          <>
            {t`Failed to launch job.`}
            <ErrorDetail error={error} />
          </>
        ) : (
          <ContentError error={error} />
        )}
      </AlertModal>
    );
  }

  return (
    <AdHocCommandsWizard
      adHocItems={adHocItems}
      organizationId={organizationId}
      moduleOptions={moduleOptions}
      credentialTypeId={credentialTypeId}
      onCloseWizard={onClose}
      onLaunch={handleSubmit}
    />
  );
}

export default AdHocCommandsFlow;
