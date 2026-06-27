import React, { useState } from 'react';
import { useParams } from 'react-router';
import { useNavigate } from 'routerCompat';
import { useLingui } from '@lingui/react/macro';
import {
	Label, MenuToggle,
	Select,
	SelectGroup,
	SelectList,
	SelectOption,
	TextInputGroup,
	TextInputGroupMain
} from '@patternfly/react-core';

import ChipGroup from 'components/ChipGroup';
import { stringIsUUID } from 'util/strings';

const JOB_URL_SEGMENT_MAP = {
  job: 'playbook',
  project_update: 'project',
  system_job: 'management',
  system: 'system_job',
  inventory_update: 'inventory',
  workflow_job: 'workflow',
};

function WorkflowOutputNavigation({ relatedJobs, parentRef }) {
  const { t } = useLingui();
  const { id } = useParams();
  const navigate = useNavigate();

  const relevantResults = relatedJobs.filter(
    ({ job: jobId, summary_fields }) =>
      jobId &&
      `${jobId}` !== id &&
      summary_fields.job.type !== 'workflow_approval'
  );

  const [isOpen, setIsOpen] = useState(false);
  const [filterBy, setFilterBy] = useState();
  const [sortedJobs, setSortedJobs] = useState(relevantResults);
  const [inlineFilter, setInlineFilter] = useState('');

  const statusLabels = {
    Failed: t`Failed`,
    Successful: t`Successful`,
  };

  const handleFilter = (v) => {
    if (filterBy === v) {
      setSortedJobs(relevantResults);
      setFilterBy();
    } else {
      setFilterBy(v);
      setSortedJobs(
        relevantResults.filter(
          (node) =>
            node.summary_fields.job.status === v.toLowerCase() &&
            `${node.job}` !== id
        )
      );
    }
  };

  const numSuccessJobs = relevantResults.filter(
    (node) => node.summary_fields.job.status === 'successful'
  ).length;
  const numFailedJobs = relevantResults.length - numSuccessJobs;

  const filteredJobs = inlineFilter
    ? sortedJobs.filter((node) => {
        const label = stringIsUUID(node.identifier)
          ? node.summary_fields.job.name
          : node.identifier;
        return label.toLowerCase().includes(inlineFilter.toLowerCase());
      })
    : sortedJobs;

  return (
    <Select
      key={`${id}`}
      isOpen={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setInlineFilter('');
      }}
      onSelect={(_e, v) => {
        if (v === 'Failed' || v === 'Successful') {
          handleFilter(v);
          return;
        }
        const node = sortedJobs.find(
          (n) => n.summary_fields.job.name === v
        );
        if (node) {
          const url = `/jobs/${JOB_URL_SEGMENT_MAP[node.summary_fields.job.type]}/${node.summary_fields.job?.id}/output`;
          navigate(url);
          setIsOpen(false);
        }
      }}
      popperProps={
        parentRef?.current
          ? { appendTo: parentRef.current }
          : undefined
      }
      toggle={(toggleRef) => (
        <MenuToggle
          ref={toggleRef}
          onClick={() => setIsOpen(!isOpen)}
          isExpanded={isOpen}
        >
          {filterBy ? (
            <ChipGroup numChips={1} totalChips={1}>
              <Label variant="outline" key={filterBy} onClose={() => handleFilter(filterBy)}>
                {statusLabels[filterBy] || filterBy}
              </Label>
            </ChipGroup>
          ) : (
            t`Workflow Job 1/${relevantResults.length}`
          )}
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
          {filteredJobs?.map((node) => (
            <SelectOption
              key={node.id}
              value={node.summary_fields.job.name}
            >
              {stringIsUUID(node.identifier)
                ? node.summary_fields.job.name
                : node.identifier}
            </SelectOption>
          ))}
        </SelectGroup>
      </SelectList>
    </Select>
  );
}

export default WorkflowOutputNavigation;
