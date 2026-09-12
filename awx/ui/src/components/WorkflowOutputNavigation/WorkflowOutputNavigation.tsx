import type { SummaryFieldRef } from 'types/api';
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import {
  Label,
  MenuToggle,
  Select,
  SelectGroup,
  SelectList,
  SelectOption,
  TextInputGroup,
  TextInputGroupMain,
} from '@patternfly/react-core';
import styled from 'styled-components';

import ChipGroup from 'components/ChipGroup';
import { stringIsUUID } from 'util/strings';

// api job type -> the segment the job routes are mounted under, the inverse of
// JOB_URL_SEGMENT_MAP in screens/Job/Job.js. A type missing here builds a url
// with "undefined" in it, so the two maps have to be kept in step.
const JOB_TYPE_URL_SEGMENT_MAP = {
  job: 'playbook',
  project_update: 'project',
  system_job: 'management',
  inventory_update: 'inventory',
  ad_hoc_command: 'command',
  workflow_job: 'workflow',
};

// The menu takes its minimum width from the toggle, and the toggle is only as
// wide as what it holds: picking a status swaps "Workflow Job 3/12" for a single
// short chip, which collapsed the toggle and the menu with it, down to the width
// of the filter input and truncating the node names. A floor keeps both usable,
// and leaves room for the longer translations of the position text.
const WorkflowMenuToggle = styled(MenuToggle)`
  min-width: 220px;
`;
WorkflowMenuToggle.displayName = 'WorkflowMenuToggle';

/**
 * One node of the workflow, as the workflow job's nodes endpoint returns it.
 * A node that ran carries the id of the job it ran, and an approval node
 * carries none.
 */
export interface WorkflowJobNode {
  id: number;
  job?: number | null;
  /** Null where the node was never given one, which is most of them. */
  identifier?: string | null;
  summary_fields?: {
    job?: SummaryFieldRef & { status?: string };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface WorkflowOutputNavigationProps {
  relatedJobs: WorkflowJobNode[];
  parentRef: React.RefObject<HTMLElement | null>;
  [key: string]: unknown;
}

function WorkflowOutputNavigation({
  relatedJobs,
  parentRef,
}: WorkflowOutputNavigationProps) {
  const { t } = useLingui();
  const { id } = useParams() as { id: string };
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [filterBy, setFilterBy] = useState<string | undefined>();
  const [inlineFilter, setInlineFilter] = useState('');

  // Every node that actually ran a job, the one on screen included. Dropping the
  // current job undercounts the workflow by one and leaves the menu with no entry
  // for where you are. Approval nodes have no job output to navigate to.
  const jobNodes = relatedJobs.filter(
    ({ job: jobId, summary_fields: summaryFields }) =>
      jobId && summaryFields?.job?.type !== 'workflow_approval'
  );

  // 1-based, and 0 when the job on screen is not one of the workflow's nodes
  const viewedPosition =
    jobNodes.findIndex(({ job: jobId }) => `${jobId}` === id) + 1;
  const total = jobNodes.length;

  // the parameter and total are named so the extracted message reads
  // {currentPosition}/{total} rather than leaving translators with a
  // positional {0}
  const positionLabel = (currentPosition: number) =>
    t`Workflow Job ${currentPosition}/${total}`;

  const statusLabels = {
    Failed: t`Failed`,
    Successful: t`Successful`,
  };

  const handleFilter = (value: string) => {
    setFilterBy((current) => (current === value ? undefined : value));
  };

  const nodeLabel = (node: WorkflowJobNode): string => {
    if (stringIsUUID(node.identifier ?? '')) {
      return node.summary_fields?.job?.name as string;
    }
    if (node.identifier) {
      return node.identifier;
    }
    // Sliced-job and federated-inventory workflows create their nodes directly
    // rather than copying them from a template node, so identifier is blank,
    // and every slice's job carries the same name as the template. Label these
    // by position, in the words the toggle uses for the job on screen.
    return positionLabel(
      jobNodes.findIndex((candidate) => candidate.id === node.id) + 1
    );
  };

  // Derived rather than held in state: the previous version seeded a useState
  // from the first render's list, so after navigating within the workflow the
  // menu still offered the jobs relative to the page you came from.
  const statusFiltered = filterBy
    ? jobNodes.filter(
        (node) => node.summary_fields?.job?.status === filterBy.toLowerCase()
      )
    : jobNodes;

  const visibleJobs = inlineFilter
    ? statusFiltered.filter((node) =>
        nodeLabel(node).toLowerCase().includes(inlineFilter.toLowerCase())
      )
    : statusFiltered;

  const numSuccessJobs = jobNodes.filter(
    (node) => node.summary_fields?.job?.status === 'successful'
  ).length;
  const numFailedJobs = jobNodes.filter(
    (node) => node.summary_fields?.job?.status === 'failed'
  ).length;

  const handleSelect = (_event: unknown, value: unknown) => {
    if (value === 'Failed' || value === 'Successful') {
      handleFilter(value);
      return;
    }
    setIsOpen(false);
    const node = jobNodes.find((candidate) => candidate.id === value);
    if (!node || `${node.job}` === id) {
      return;
    }
    const job = node.summary_fields?.job;
    const segment =
      JOB_TYPE_URL_SEGMENT_MAP[
        job?.type as keyof typeof JOB_TYPE_URL_SEGMENT_MAP
      ];
    if (!segment) {
      return;
    }
    navigate(`/jobs/${segment}/${job?.id}/output`);
  };

  return (
    <Select
      isOpen={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setInlineFilter('');
      }}
      onSelect={handleSelect}
      popperProps={
        parentRef?.current ? { appendTo: parentRef.current } : undefined
      }
      toggle={(toggleRef) => (
        <WorkflowMenuToggle
          ref={toggleRef}
          onClick={() => setIsOpen(!isOpen)}
          isExpanded={isOpen}
        >
          {filterBy && (
            <ChipGroup numChips={1} totalChips={1}>
              {/* no onClose: that renders a close <button> inside the toggle's
                  own <button>, which is invalid and swallows the click. The
                  filter is cleared by picking the same status again. */}
              <Label variant="outline" key={filterBy}>
                {statusLabels[filterBy as keyof typeof statusLabels] ||
                  filterBy}
              </Label>
            </ChipGroup>
          )}
          {!filterBy &&
            (viewedPosition > 0
              ? positionLabel(viewedPosition)
              : t`Workflow Jobs (${total})`)}
        </WorkflowMenuToggle>
      )}
    >
      <TextInputGroup>
        <TextInputGroupMain
          value={inlineFilter}
          onChange={(_event, val) => setInlineFilter(val)}
          placeholder={t`Filter...`}
          autoComplete="off"
        />
      </TextInputGroup>
      <SelectList>
        <SelectGroup label={t`Workflow Statuses`} key="status">
          <SelectOption
            description={t`Filter by failed jobs`}
            key="failed"
            value="Failed"
          >
            {t`Failed`} ({numFailedJobs})
          </SelectOption>
          <SelectOption
            description={t`Filter by successful jobs`}
            key="successful"
            value="Successful"
          >
            {t`Successful`} ({numSuccessJobs})
          </SelectOption>
        </SelectGroup>
        <SelectGroup label={t`Workflow Nodes`} key="nodes">
          {visibleJobs?.map((node) => (
            <SelectOption
              key={node.id}
              value={node.id}
              isSelected={`${node.job}` === id}
            >
              {nodeLabel(node)}
            </SelectOption>
          ))}
        </SelectGroup>
      </SelectList>
    </Select>
  );
}

export default WorkflowOutputNavigation;
