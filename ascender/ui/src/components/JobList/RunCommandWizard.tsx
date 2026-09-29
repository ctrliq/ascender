import type { ApiEntity, Inventory, OptionsChoice, Paginated } from 'types/api';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { CredentialTypesAPI, InventoriesAPI } from 'api';
import useRequest, { useDismissableError } from 'hooks/useRequest';
import { useFormContext } from 'components/Form';
import AlertModal from 'components/AlertModal';
import ContentError from 'components/ContentError';
import ErrorDetail from 'components/ErrorDetail';
import AdHocCommandsWizard from 'components/AdHocCommands/AdHocCommandsWizard';
import type { AdHocValues } from 'components/AdHocCommands/types';
import RunTargetStep from './RunTargetStep';
import type { RunTarget } from './RunTargetStep';
import RunOnDetail from './RunOnDetail';
import {
  NOT_STARTED_STATE,
  NotStartedDetail,
  startEach,
  toNavigationState,
} from './notStarted';
import type { NotStarted } from './notStarted';

export interface RunCommandWizardProps {
  onClose: () => void;
}

/**
 * The step that asks what the command runs on, inside the form the rest of
 * the wizard fills in: what is ticked is the limit, which the form shows in
 * its header and sends with the command.
 */
function CommandTargetStep({
  value,
  onChange,
}: {
  value: RunTarget | null;
  onChange: (target: RunTarget | null) => void;
}) {
  const { setFieldValue } = useFormContext<AdHocValues>();
  return (
    <RunTargetStep
      value={value}
      inventoryRole="adhoc_role"
      onChange={(target) => {
        onChange(target);
        // A whole inventory has no pattern, which is the word for every host.
        setFieldValue('limit', target?.limit || 'all');
      }}
    />
  );
}

/**
 * A command, run from the runs list.
 *
 * Everywhere else a command is started from a list of hosts or groups, which
 * says which inventory it runs against and what to limit it to. Here the step
 * before this asks, and the form below is the one those screens show.
 */
function RunCommandWizard({ onClose }: RunCommandWizardProps) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [target, setTarget] = useState<RunTarget | null>(null);
  /* Held, since the launch below is keyed on what it runs against. */
  const inventoryIds = useMemo(
    () => target?.inventoryIds ?? [],
    [target?.inventoryIds]
  );
  /* What the form asks the api about, which is the first of the inventories:
     the modules on offer and the credentials to pick from are the same
     question wherever the command will run. */
  const inventory = inventoryIds[0] ?? null;

  /* What the form needs about the inventory picked: the modules the api
     offers for it, the ssh credential type, and the organization to look
     credentials up in. The inventory screens read the same three. */
  const {
    result: { moduleOptions, credentialTypeId, organizationId },
    error: optionsError,
    isLoading,
    request: fetchOptions,
  } = useRequest(
    useCallback(async () => {
      if (!inventory) {
        return {
          moduleOptions: [],
          credentialTypeId: null,
          organizationId: null,
        };
      }
      const [{ data: adHocOptions }, { data: detail }, credentialTypes] =
        await Promise.all([
          InventoriesAPI.readAdHocOptions(inventory),
          InventoriesAPI.readDetail<Inventory>(inventory),
          CredentialTypesAPI.read<Paginated<ApiEntity>>({ namespace: 'ssh' }),
        ]);
      return {
        moduleOptions: (adHocOptions.actions.GET?.module_name?.choices ??
          []) as OptionsChoice[],
        credentialTypeId: credentialTypes.data.results[0]?.id ?? null,
        organizationId: detail.organization ?? null,
      };
    }, [inventory]),
    { moduleOptions: [], credentialTypeId: null, organizationId: null }
  );

  useEffect(() => {
    if (inventory) {
      fetchOptions();
    }
  }, [inventory, fetchOptions]);

  const { error: launchError, request: launchCommand } = useRequest(
    useCallback(
      async (values: Record<string, unknown>) => {
        /* One inventory is one command, and a refusal of it is the error
           this wizard shows. The wizard closes on the way to the run, as the
           template wizard does, rather than staying up over its output. */
        if (inventoryIds.length < 2) {
          const { data } = await InventoriesAPI.launchAdHocCommands(
            inventoryIds[0] as number,
            values
          );
          onClose();
          navigate(`/runs/command/${data.id}/output`);
          return;
        }
        /* One command in each inventory ticked, started in the order they
           were ticked, and one refusal does not stop the rest. The list is
           where the ones that started are, and where the refusals are named
           with their reasons, since this wizard is gone by then. */
        const inventoryNames = target?.inventoryNames ?? [];
        const { started, refused } = await startEach(
          inventoryIds,
          (id) => InventoriesAPI.launchAdHocCommands(id, values),
          (id) => inventoryNames[inventoryIds.indexOf(id)] ?? `#${id}`
        );
        if (!started.length) {
          setRefusedAll(refused);
          return;
        }
        onClose();
        navigate(
          '/runs',
          refused.length
            ? { state: { [NOT_STARTED_STATE]: toNavigationState(refused) } }
            : undefined
        );
      },
      [inventoryIds, target, navigate, onClose]
    )
  );

  const { error, dismissError } = useDismissableError(
    launchError || optionsError
  );
  /* Several commands asked for and every one refused: nothing to move on
     to, so they are named here. */
  const [refusedAll, setRefusedAll] = useState<NotStarted[]>([]);

  const handleSubmit = async (values: AdHocValues) => {
    const {
      credentials,
      credential_passwords: { become_password, ssh_password, ssh_key_unlock },
      execution_environment,
      ...rest
    } = values;
    await launchCommand({
      credential: credentials[0]?.id,
      become_password,
      ssh_password,
      ssh_key_unlock,
      execution_environment: execution_environment?.[0]?.id,
      ...rest,
    });
  };

  if (refusedAll.length) {
    return (
      <AlertModal isOpen variant="error" title={t`Error!`} onClose={onClose}>
        {t`Not started: ${refusedAll.map(({ name }) => name).join(', ')}`}
        <NotStartedDetail refused={refusedAll} />
      </AlertModal>
    );
  }

  if (error) {
    return (
      <AlertModal
        isOpen
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

  /*
   * The wizard stays up while the inventory's own options are read: the step
   * that needs them is the one after the step being answered, and remounting
   * the form around them would lose that answer.
   */
  return (
    <AdHocCommandsWizard
      adHocItems={[]}
      firstStep={{
        id: 'target',
        name: t`Run On`,
        component: <CommandTargetStep value={target} onChange={setTarget} />,
        enableNext: Boolean(target) && !isLoading,
      }}
      runOn={target ? <RunOnDetail summary={target.summary} /> : undefined}
      moduleOptions={moduleOptions}
      credentialTypeId={credentialTypeId}
      organizationId={organizationId}
      onCloseWizard={onClose}
      onLaunch={handleSubmit}
    />
  );
}

export default RunCommandWizard;
