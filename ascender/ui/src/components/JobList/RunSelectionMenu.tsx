import type { OptionsChoice } from 'types/api';
import React, { useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import {
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
} from '@patternfly/react-core';
import Tooltip from 'components/Tooltip';
import AdHocCommandsFlow from 'components/AdHocCommands/AdHocCommandsFlow';
import type { AdHocItem } from 'components/AdHocCommands/types';
import toHostPattern from 'util/hostPattern';
import RunTemplateWizard from './RunTemplateWizard';
import RunCommandWizard from './RunCommandWizard';
import useForgetRunModalParams from './runModalParams';

/** What a list of hosts or groups can start, in the order the menu reads. */
type Flow = 'job' | 'workflow' | 'command';

export interface RunSelectionMenuProps {
  /** The hosts or groups ticked, which the run is limited to. */
  items: AdHocItem[];
  /**
   * The inventory they are in, which the run uses rather than asking. The
   * hosts screen lists every inventory's hosts, so it has one only once the
   * selection names one, and a command cannot be started without it.
   */
  inventoryId?: number | string | null;
  /** The modules the api offers for that inventory, for the command form. */
  moduleOptions: OptionsChoice[];
  onLaunchLoading: (isLoading: boolean) => void;
  /** False where the account may not start a command on this inventory, in
   * which case the menu offers the two template runs and not the third. */
  canRunCommand?: boolean;
  /**
   * True where what is ticked lives in more than one inventory, as it can on
   * a hosts list holding every inventory's: one run happens in one of them,
   * so the wizard asks rather than taking the names as a limit.
   */
  spansInventories?: boolean;
  /** Told apart per screen, since more than one list carries this menu. */
  ouiaId?: string;
  /**
   * What the tooltip says, where the run is aimed at something fixed rather
   * than at what is ticked: this host, or this whole inventory.
   */
  tooltip?: string;
  /**
   * What a run with nothing ticked is aimed at, where the list sits under
   * one group or one host: its name is the limit, and label is what the
   * tooltip says, "Run on Group" or "Run on Host". Without it nothing ticked
   * is the whole inventory, which is right only for a list of all of it.
   */
  scope?: { item: AdHocItem; label: string };
}

/**
 * The run menu beside a list of hosts or groups.
 *
 * It says the same three things the runs list's own menu says, a job, a
 * workflow or a command, and it needs no first step to say what to run on:
 * what is ticked in the list behind it is the run's limit, and the inventory
 * that list belongs to is the run's inventory.
 */
function RunSelectionMenu({
  items,
  inventoryId,
  moduleOptions,
  onLaunchLoading,
  canRunCommand = true,
  spansInventories = false,
  ouiaId = 'run-selection-menu',
  tooltip: fixedTooltip,
  scope,
}: RunSelectionMenuProps) {
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const [flow, setFlow] = useState<Flow | null>(null);
  /*
   * What the run is aimed at, taken as the modal opens rather than read from
   * the selection while it is up: the lists inside these wizards page through
   * the query string, which re-reads the list behind them and clears what was
   * ticked.
   */
  const [target, setTarget] = useState<{
    limit: string;
    items: AdHocItem[];
  } | null>(null);

  const forgetModalParams = useForgetRunModalParams();
  const close = () => {
    setFlow(null);
    setTarget(null);
    forgetModalParams();
  };

  const open = (next: Flow) => {
    setIsOpen(false);
    setFlow(next);
    /* Nothing ticked is what the list sits under, the group or the host,
       where there is one. The command form takes its limit from the same
       items, so it is handed that one rather than nothing. */
    const aimedAt = items.length || !scope ? items : [scope.item];
    setTarget({
      // Nothing ticked and nothing to fall back on is the whole list, which
      // the ad hoc command form says in the same word: its limit opens on
      // all where no host was picked.
      limit: toHostPattern(aimedAt.map((item) => item.name)) || 'all',
      items: aimedAt,
    });
  };

  const menu: { key: Flow; label: string }[] = [
    { key: 'job', label: t`Job` },
    { key: 'workflow', label: t`Workflow` },
    ...(canRunCommand ? [{ key: 'command' as Flow, label: t`Command` }] : []),
  ];

  /* What a click will do, which the ticks decide, in the words the wizard
     behind it uses for the same thing: a run is aimed at something. */
  const tooltip = (() => {
    if (fixedTooltip !== undefined) {
      return fixedTooltip;
    }
    if (items.length) {
      return t`Run on Selected`;
    }
    return scope ? scope.label : t`Run on All`;
  })();

  return (
    <>
      <Tooltip content={tooltip}>
        <Dropdown
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          ouiaId={`${ouiaId}-dropdown`}
          toggle={(toggleRef) => (
            <MenuToggle
              ref={toggleRef}
              id={ouiaId}
              variant="secondary"
              aria-label={t`Run`}
              onClick={() => setIsOpen(!isOpen)}
              isExpanded={isOpen}
              ouiaId={ouiaId}
            >
              {t`Run`}
            </MenuToggle>
          )}
        >
          <DropdownList>
            {menu.map(({ key, label }) => (
              <DropdownItem
                key={key}
                ouiaId={`${ouiaId}-${key}-item`}
                onClick={() => open(key)}
              >
                {label}
              </DropdownItem>
            ))}
          </DropdownList>
        </Dropdown>
      </Tooltip>

      {target && (flow === 'job' || flow === 'workflow') && (
        <RunTemplateWizard
          templateType={
            flow === 'job' ? 'job_template' : 'workflow_job_template'
          }
          /* Hosts from two inventories are not one run's limit, so the
             wizard opens on the step that asks, as the runs list does. */
          asksForTarget={spansInventories}
          limit={spansInventories ? undefined : target.limit}
          inventoryId={
            !spansInventories && inventoryId ? Number(inventoryId) : null
          }
          onClose={close}
        />
      )}
      {/*
       * A command is sent to an inventory's own endpoint. Where the list says
       * which that is, the form opens on what was ticked; where it does not,
       * as on a hosts list spanning every inventory with nothing ticked, the
       * wizard from the runs list asks first.
       */}
      {target &&
        flow === 'command' &&
        (inventoryId ? (
          <AdHocCommandsFlow
            adHocItems={target.items}
            moduleOptions={moduleOptions}
            inventoryId={inventoryId}
            onLaunchLoading={onLaunchLoading}
            onClose={close}
          />
        ) : (
          <RunCommandWizard onClose={close} />
        ))}
    </>
  );
}

export default RunSelectionMenu;
