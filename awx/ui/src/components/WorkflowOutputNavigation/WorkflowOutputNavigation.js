import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import {
  Select,
  SelectOption,
  SelectGroup,
  SelectVariant,
  Chip,
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
  const { i18n } = useLingui();
  const { id } = useParams();

  const relevantResults = relatedJobs.filter(
    ({ job: jobId, summary_fields }) =>
      jobId &&
      `${jobId}` !== id &&
      summary_fields.job.type !== 'workflow_approval'
  );

  const [isOpen, setIsOpen] = useState(false);
  const [filterBy, setFilterBy] = useState();
  const [sortedJobs, setSortedJobs] = useState(relevantResults);

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

  return (
    <Select
      key={`${id}`}
      variant={SelectVariant.typeaheadMulti}
      menuAppendTo={parentRef?.current}
      onToggle={() => {
        setIsOpen(!isOpen);
      }}
      selections={filterBy}
      onSelect={(e, v) => {
        if (v !== 'Failed' && v !== 'Successful') return;
        handleFilter(v);
      }}
      isOpen={isOpen}
      isGrouped
      hasInlineFilter
      placeholderText={i18n._(msg`Workflow Job 1/${relevantResults.length}`)}
      chipGroupComponent={
        <ChipGroup numChips={1} totalChips={1}>
          <Chip key={filterBy} onClick={() => handleFilter(filterBy)}>
            {[filterBy]}
          </Chip>
        </ChipGroup>
      }
    >
      {[
        <SelectGroup label={i18n._(msg`Workflow Statuses`)} key="status">
          <SelectOption
            description={i18n._(msg`Filter by failed jobs`)}
            key="failed"
            value={i18n._(msg`Failed`)}
            itemCount={numFailedJobs}
          />
          <SelectOption
            description={i18n._(msg`Filter by successful jobs`)}
            key="successful"
            value={i18n._(msg`Successful`)}
            itemCount={numSuccessJobs}
          />
        </SelectGroup>,
        <SelectGroup label={i18n._(msg`Workflow Nodes`)} key="nodes">
          {sortedJobs?.map((node) => (
            <SelectOption
              key={node.id}
              to={`/jobs/${JOB_URL_SEGMENT_MAP[node.summary_fields.job.type]}/${
                node.summary_fields.job?.id
              }/output`}
              component={Link}
              value={node.summary_fields.job.name}
            >
              {stringIsUUID(node.identifier)
                ? node.summary_fields.job.name
                : node.identifier}
            </SelectOption>
          ))}
        </SelectGroup>,
      ]}
    </Select>
  );
}

export default WorkflowOutputNavigation;
