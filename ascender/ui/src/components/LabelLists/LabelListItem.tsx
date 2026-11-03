import type { Label } from 'types/api';
import React from 'react';
import { Button } from '@patternfly/react-core';
import { PencilAltIcon } from '@patternfly/react-icons';
import { Tr, Td } from '@patternfly/react-table';
import { Link } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import { ActionsTd, ActionItem } from 'components/PaginatedTable';
import './LabelLists.css';

/** How many of each kind of template carry a label. */
export interface TemplateCounts {
  jobTemplates: number;
  workflowTemplates: number;
}

export interface LabelListItemProps {
  label: Label;
  /** Omitted where the list does not offer selection, as on a detail tab. */
  isSelected?: boolean;
  onSelect?: () => void;
  rowIndex?: number;
  /**
   * How many templates of each kind carry this label. Absent where the list is
   * embedded, and where the label is on nothing at all.
   */
  templateCounts?: TemplateCounts;
  /**
   * Whether the current user may edit this label, which decides whether the
   * row offers the pencil. The api allows it to a superuser and to an admin
   * of the label's organization.
   */
  canEdit?: boolean;
  [key: string]: unknown;
}

function LabelListItem({
  label,
  isSelected,
  onSelect,
  rowIndex,
  templateCounts,
  canEdit = false,
}: LabelListItemProps) {
  const { t } = useLingui();

  /*
   * The label by id, which is what the counts beside it were counted by. By
   * name the list would answer with every label of that name, and a name is
   * only unique within an organization: two of them would bring each other's
   * templates along, and the number here would not be the number there.
   *
   * Narrowed to the label's own organization, which is the other half of what
   * the counts counted: nothing stops a template in one organization carrying
   * a label owned by another, and neither the number nor this list takes those.
   */
  let search = `?template.labels__id=${label.id}`;
  const organizationId = label.summary_fields?.organization?.id;
  if (organizationId) {
    search += `&template.organization__id=${organizationId}`;
  }

  /**
   * A count, linked to the templates it counts.
   *
   * Args:
   *     count: How many templates of this kind carry the label.
   *     type: The type the templates list filters on, which it shows as a
   *         chip the reader can drop to see the rest.
   *     dataLabel: The column heading, which the table reads out on narrow
   *         screens.
   *
   * Returns:
   *     The cell, with a dash where the label is on none of them: a link to an
   *     empty list is a promise of something to look at.
   */
  const countCell = (count: number, type: string, dataLabel: string) => (
    <Td dataLabel={dataLabel} className="ascender-label-lists__count">
      {count ? (
        <Link
          to={{
            pathname: '/templates',
            search: `${search}&template.or__type=${type}`,
          }}
        >
          {count}
        </Link>
      ) : (
        '-'
      )}
    </Td>
  );
  return (
    <Tr key={label.id} id={`label-row-${label.id}`}>
      {onSelect ? (
        <Td
          select={{
            rowIndex: rowIndex ?? 0,
            isSelected: Boolean(isSelected),
            onSelect,
          }}
          dataLabel={t`Selected`}
        />
      ) : (
        <Td style={{ width: 46, minWidth: 0, maxWidth: 46 }} />
      )}
      <Td dataLabel={t`Name`} className="ascender-label-lists__name">
        <b>
          <Link to={{ pathname: '/templates', search }}>{label.name}</Link>
        </b>
      </Td>
      <Td dataLabel={t`Organization`}>
        {label.summary_fields?.organization?.name || ''}
      </Td>
      {/* These only where the list offers selection: the same list is embedded
          on screens that only show which labels a thing carries. */}
      {onSelect &&
        countCell(
          templateCounts?.jobTemplates ?? 0,
          'job_template',
          t`Job Templates`
        )}
      {onSelect &&
        countCell(
          templateCounts?.workflowTemplates ?? 0,
          'workflow_job_template',
          t`Workflow Templates`
        )}
      {onSelect && (
        <ActionsTd
          dataLabel={t`Actions`}
          className="ascender-label-lists__actions"
        >
          <ActionItem visible={canEdit} tooltip={t`Edit Label`}>
            <Button
              icon={<PencilAltIcon />}
              ouiaId={`${label.id}-edit-button`}
              aria-label={t`Edit Label`}
              variant="plain"
              component={Link}
              to={`/labels/${label.id}/edit`}
            />
          </ActionItem>
        </ActionsTd>
      )}
    </Tr>
  );
}

export default LabelListItem;
