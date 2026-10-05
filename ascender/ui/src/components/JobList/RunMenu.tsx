import type { ApiEntity, Paginated } from 'types/api';
import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import {
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
} from '@patternfly/react-core';
import type { QSParams } from 'util/qs';
import { InventorySourcesAPI, ProjectsAPI, SystemJobTemplatesAPI } from 'api';
import Tooltip from 'components/Tooltip';
import AlertModal from 'components/AlertModal';
import LaunchPicker from './LaunchPicker';
import RunTemplateWizard from './RunTemplateWizard';
import RunCommandWizard from './RunCommandWizard';
import LaunchDaysPrompt, { keepsHistory } from './LaunchDaysPrompt';
import useForgetRunModalParams from './runModalParams';
import { NotStartedDetail, readNotStarted, startEach } from './notStarted';
import type { NotStarted } from './notStarted';

/** What the menu offers, in the order the list's own Type column reads. */
type Flow =
  | 'job'
  | 'workflow'
  | 'command'
  | 'project_update'
  | 'inventory_update'
  | 'system_job';

/**
 * The run button on the runs list, which starts any kind of run.
 *
 * The list shows six kinds and the button offered one of them, a template.
 * Each item here opens what that kind is started from: the launch wizard for
 * a job or a workflow, the ad hoc form for a command, and for the other three
 * a list of what can be started and the launch itself.
 */
function RunMenu() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [daysFor, setDaysFor] = useState<ApiEntity[] | null>(null);
  /*
   * The runs the api refused where others did start. The picker names them
   * itself while it is open, but a launch that started anything closes it and
   * moves to the new run, which took the names down with it: they are said
   * here instead, on the page the launch went to, each with the reason the
   * api gave.
   */
  const [notStarted, setNotStarted] = useState<NotStarted[]>([]);

  /*
   * A wizard opened from somewhere else, a host list say, goes to the runs
   * list when some of its runs started and some did not, and it has gone by
   * then: it hands the refusals over in the navigation state, and they are
   * said here. Taken out of the state once read, so going back to this page
   * or reloading it does not say them again.
   */
  const location = useLocation();
  useEffect(() => {
    const handed = readNotStarted(location.state);
    if (handed.length) {
      setNotStarted(handed);
      navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: null,
      });
    }
  }, [location, navigate]);

  const forgetModalParams = useForgetRunModalParams();
  const close = () => {
    setFlow(null);
    forgetModalParams();
  };
  const open = (next: Flow) => {
    setIsOpen(false);
    setFlow(next);
  };

  /** Where a started run is watched, which is where each launch ends. */
  const goToRun = (segment: string, id: number) =>
    navigate(`/runs/${segment}/${id}/output`);

  /**
   * Starts one run per row ticked, and says where they went: one run has an
   * output page of its own, several have the runs list.
   *
   * Where nothing started, what the api refused comes back by name for the
   * modal, which stays open, to say which did not start. Where some did, the
   * modal closes on the way to them, so the refusals are said by this menu
   * instead and nothing comes back.
   *
   * @param items The rows ticked, one run each.
   * @param segment The runs address segment for this kind of run.
   * @param start Starts the run one row stands for.
   * @returns The rows refused, with the reasons, while the modal is still open.
   */
  const launchEach = async <T extends ApiEntity>(
    items: T[],
    segment: string,
    start: (item: T) => Promise<{ data: { id?: number } }>
  ): Promise<NotStarted[]> => {
    /* All of them at once, and the answers come back in the order they were
       asked for, so a refusal still names the row it belongs to. */
    const { started: answers, refused } = await startEach(
      items,
      start,
      (item) => String(item.name ?? '')
    );
    const started = answers.map((answer) => answer.data.id as number);
    if (!started.length) {
      return refused;
    }
    close();
    if (started.length === 1 && !refused.length) {
      goToRun(segment, started[0] as number);
    } else {
      navigate('/runs');
    }
    setNotStarted(refused);
    return [];
  };

  /* Only what a sync can be asked of: a manual project has no source to
     update, and the api answers a request to update one with a 405. */
  const readProjects = useCallback(
    (params: QSParams) =>
      ProjectsAPI.read<Paginated<ApiEntity>>({
        ...params,
        role_level: 'update_role',
        not__scm_type: '',
      }),
    []
  );
  /* No role_level here: the sources endpoint answers 500 to one, where the
     projects endpoint takes it. */
  const readSources = useCallback(
    (params: QSParams) =>
      InventorySourcesAPI.read<Paginated<ApiEntity>>(params),
    []
  );
  const readManagementJobs = useCallback(
    (params: QSParams) =>
      SystemJobTemplatesAPI.read<Paginated<ApiEntity>>(params),
    []
  );
  const items: { key: Flow; label: string }[] = [
    { key: 'job', label: t`Job` },
    { key: 'workflow', label: t`Workflow` },
    { key: 'command', label: t`Command` },
    { key: 'inventory_update', label: t`Inventory Sync` },
    { key: 'project_update', label: t`Project Sync` },
    { key: 'system_job', label: t`Cleanup Job` },
  ];

  return (
    <>
      <Tooltip content={t`Choose What to Run`}>
        <Dropdown
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          ouiaId="job-list-run-dropdown"
          toggle={(toggleRef) => (
            <MenuToggle
              ref={toggleRef}
              id="job-list-run-button"
              variant="secondary"
              aria-label={t`Run`}
              onClick={() => setIsOpen(!isOpen)}
              isExpanded={isOpen}
              ouiaId="job-list-run-button"
            >
              {t`Run`}
            </MenuToggle>
          )}
        >
          <DropdownList>
            {items.map(({ key, label }) => (
              <DropdownItem
                key={key}
                ouiaId={`run-${key}-item`}
                onClick={() => open(key)}
              >
                {label}
              </DropdownItem>
            ))}
          </DropdownList>
        </Dropdown>
      </Tooltip>

      {/* The three that run against an inventory ask what to run on first. */}
      {flow === 'job' && (
        <RunTemplateWizard
          templateType="job_template"
          asksForTarget
          onClose={close}
        />
      )}
      {flow === 'workflow' && (
        <RunTemplateWizard
          templateType="workflow_job_template"
          asksForTarget
          onClose={close}
        />
      )}
      {flow === 'command' && <RunCommandWizard onClose={close} />}

      {flow === 'inventory_update' && (
        <LaunchPicker
          title={t`Run Inventory Sync`}
          stepName={t`Source`}
          read={readSources}
          onLaunch={(sources) =>
            launchEach(sources, 'inventory', (source) =>
              InventorySourcesAPI.createSyncStart(source.id as number)
            )
          }
          onClose={close}
        />
      )}

      {flow === 'project_update' && (
        <LaunchPicker
          title={t`Run Project Sync`}
          stepName={t`Project`}
          read={readProjects}
          onLaunch={(projects) =>
            launchEach(projects, 'project', (project) =>
              ProjectsAPI.sync(project.id as number)
            )
          }
          onClose={close}
        />
      )}

      {flow === 'system_job' && (
        <LaunchPicker
          title={t`Run Cleanup Job`}
          stepName={t`Job`}
          read={readManagementJobs}
          onLaunch={async (managementJobs) => {
            /* Two of them keep a number of days of records, which is the one
               thing they ask for. Where any ticked job wants it, the prompt
               asks once and the number goes to each of them: it is the same
               question about the same run, asked twice over otherwise. */
            if (managementJobs.some(keepsHistory)) {
              // The prompt takes the modal's place rather than standing on
              // top of it: two modals at once hide the one underneath from
              // anything reading the page.
              close();
              setDaysFor(managementJobs);
              return [];
            }
            return launchEach(managementJobs, 'management', (managementJob) =>
              SystemJobTemplatesAPI.launch(managementJob.id as number, {})
            );
          }}
          onClose={close}
        />
      )}

      {daysFor && (
        <LaunchDaysPrompt
          jobCount={daysFor.length}
          onClose={() => setDaysFor(null)}
          onConfirm={async (days) => {
            const jobs = daysFor;
            setDaysFor(null);
            /* The number goes to the jobs that keep history; the rest take
               nothing, and were ticked in the same breath. */
            const refused = await launchEach(
              jobs,
              'management',
              (managementJob) =>
                SystemJobTemplatesAPI.launch(
                  managementJob.id as number,
                  keepsHistory(managementJob) ? { extra_vars: { days } } : {}
                )
            );
            // Only where none started: the prompt has already closed, so
            // there is no modal left to name them in.
            setNotStarted(refused);
          }}
        />
      )}

      {notStarted.length > 0 && (
        <AlertModal
          isOpen
          variant="warning"
          title={t`Error!`}
          ouiaId="run-menu-not-started"
          onClose={() => setNotStarted([])}
        >
          {t`Not started: ${notStarted.map(({ name }) => name).join(', ')}`}
          <NotStartedDetail refused={notStarted} />
        </AlertModal>
      )}
    </>
  );
}

export default RunMenu;
