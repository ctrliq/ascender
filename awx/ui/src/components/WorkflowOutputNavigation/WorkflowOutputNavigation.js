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

function WorkflowOutputNavigation({ relatedJobs, parentRef }) {
  const { t } = useLingui();
  const { id } = useParams();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [filterBy, setFilterBy] = useState();
  const [inlineFilter, setInlineFilter] = useState('');

  // Every node that actually ran a job, the one on screen included. Dropping the
  // current job undercounts the workflow by one and leaves the menu with no entry
  // for where you are. Approval nodes have no job output to navigate to.
  const jobNodes = relatedJobs.filter(
    ({ job: jobId, summary_fields: summaryFields }) =>
      jobId && summaryFields?.job?.type !== 'workflow_approval'
  );

  // 1-based, and 0 when the job on screen is not one of the workflow's nodes
  const currentPosition =
    jobNodes.findIndex(({ job: jobId }) => `${jobId}` === id) + 1;

  const statusLabels = {
    Failed: t`Failed`,
    Successful: t`Successful`,
  };

  const handleFilter = (value) => {
    setFilterBy((current) => (current === value ? undefined : value));
  };

  const nodeLabel = (node) =>
    stringIsUUID(node.identifier)
      ? node.summary_fields.job.name
      : node.identifier;

  // Derived rather than held in state: the previous version seeded a useState
  // from the first render's list, so after navigating within the workflow the
  // menu still offered the jobs relative to the page you came from.
  const statusFiltered = filterBy
    ? jobNodes.filter(
        (node) => node.summary_fields.job.status === filterBy.toLowerCase()
      )
    : jobNodes;

  const visibleJobs = inlineFilter
    ? statusFiltered.filter((node) =>
        nodeLabel(node).toLowerCase().includes(inlineFilter.toLowerCase())
      )
    : statusFiltered;

  const numSuccessJobs = jobNodes.filter(
    (node) => node.summary_fields.job.status === 'successful'
  ).length;
  const numFailedJobs = jobNodes.filter(
    (node) => node.summary_fields.job.status === 'failed'
  ).length;

  const handleSelect = (_event, value) => {
    if (value === 'Failed' || value === 'Successful') {
      handleFilter(value);
      return;
    }
    setIsOpen(false);
    const node = jobNodes.find((candidate) => candidate.id === value);
    if (!node || `${node.job}` === id) {
      return;
    }
    const segment = JOB_TYPE_URL_SEGMENT_MAP[node.summary_fields.job.type];
    if (!segment) {
      return;
    }
    navigate(`/jobs/${segment}/${node.summary_fields.job.id}/output`);
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
        <MenuToggle
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
                {statusLabels[filterBy] || filterBy}
              </Label>
            </ChipGroup>
          )}
          {!filterBy &&
            (currentPosition > 0
              ? t`Workflow Job ${currentPosition}/${jobNodes.length}`
              : t`Workflow Jobs (${jobNodes.length})`)}
        </MenuToggle>
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
