import type { DetailedError, Label } from 'types/api';
import React, { useEffect, useCallback, useMemo } from 'react';
import { Card } from '@patternfly/react-core';
import { useLingui } from '@lingui/react/macro';
import { useLocation } from 'react-router';
import useRequest, { useDeleteItems } from 'hooks/useRequest';
import useSelected from 'hooks/useSelected';
import AlertModal from 'components/AlertModal';
import ErrorDetail from 'components/ErrorDetail';
import getErrorMessage from 'components/ErrorDetail/getErrorMessage';
import DatalistToolbar from 'components/DataListToolbar';
import PaginatedTable, {
  ToolbarAddButton,
  ToolbarDeleteButton,
  HeaderRow,
  HeaderCell,
} from 'components/PaginatedTable';
import { LabelsAPI, UnifiedJobTemplatesAPI } from 'api';
import { useConfig } from 'contexts/Config';
import { getQSConfig, parseQueryString } from 'util/qs';
import { mapInBatches } from 'util/batches';
import type { QSParams } from 'util/qs';
import LabelListItem from './LabelListItem';
import './LabelLists.css';
import type { TemplateCounts } from './LabelListItem';
import { canChangeLabel, readAdministeredOrganizationIds } from './labelAccess';

const qsConfig = getQSConfig(
  'labels',
  {
    page: 1,
    page_size: 20,
    order_by: 'name',
  },
  []
);

/** What a label's templates are counted by. */
interface CountedLabel {
  id: number;
  organizationId?: number;
}

/** How many labels have their templates counted at once. */
const COUNT_BATCH_SIZE = 5;

/**
 * How many job templates and how many workflow templates carry one label.
 *
 * Asked of the api as two counts, one per kind, each a request for a single
 * row whose answer carries the total. Tallying the labels templates carry
 * would take one request for a whole page, but a template lists at most ten
 * of its labels in summary_fields, so a template with more would go uncounted
 * under the rest; and filtering on every label at once put them all in one
 * address, which a long list outgrows.
 *
 * A template counts towards a label only where the two share an organization.
 * Nothing stops a template carrying a label another organization owns, and a
 * count that included those could not be shown: the link beside it narrows to
 * the label's own organization, and the two have to agree.
 *
 * Args:
 *     label: The label to count for, by id, and the organization it
 *         belongs to where it belongs to one.
 *
 * Returns:
 *     The two counts.
 */
async function readLabelCounts({
  id,
  organizationId,
}: CountedLabel): Promise<TemplateCounts> {
  const params = {
    labels__id: id,
    ...(organizationId ? { organization__id: organizationId } : {}),
    page_size: 1,
  };
  const [jobTemplates, workflowTemplates] = await Promise.all([
    UnifiedJobTemplatesAPI.read({ ...params, type: 'job_template' }),
    UnifiedJobTemplatesAPI.read({ ...params, type: 'workflow_job_template' }),
  ]);
  return {
    jobTemplates: jobTemplates.data.count ?? 0,
    workflowTemplates: workflowTemplates.data.count ?? 0,
  };
}

/**
 * The template counts of some labels, by label id.
 *
 * Only for the labels that need them: the ones on screen, or every label the
 * search matched where the list is ordered by a count.
 *
 * Args:
 *     labels: The labels to count for.
 *
 * Returns:
 *     The two counts for each of them, by label id.
 */
async function readTemplateCounts(
  labels: CountedLabel[]
): Promise<Record<number, TemplateCounts>> {
  const counts = await mapInBatches(labels, COUNT_BATCH_SIZE, readLabelCounts);
  return Object.fromEntries(
    labels.map((label, index) => [label.id, counts[index] as TemplateCounts])
  );
}

/** How many rows one request asks for when reading everything. */
const READ_ALL_PAGE_SIZE = 200;

/**
 * Every label the search matches, rather than one page of them.
 *
 * Two of the columns count templates, which the api cannot order labels by:
 * it has no such field, and answers 400 to the attempt. Sorting those columns
 * therefore happens here, and sorting here only means anything over the whole
 * set rather than over whichever page happened to be on screen.
 *
 * Args:
 *     filters: What the toolbar is searching for, without the paging and the
 *         ordering, which this screen answers itself.
 *
 * Returns:
 *     Every label matching, in whatever order the api gave them.
 */
async function readAllLabels(filters: QSParams): Promise<Label[]> {
  const params = { ...filters, page_size: READ_ALL_PAGE_SIZE };
  const { data: firstPage } = await LabelsAPI.read({ ...params, page: 1 });
  const pageCount = Math.ceil((firstPage.count ?? 0) / READ_ALL_PAGE_SIZE);
  // Pages are fetched together rather than in a loop, so the wait is one round
  // trip however many of them there are.
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_unused, i) =>
      LabelsAPI.read({ ...params, page: i + 2 })
    )
  );
  return [firstPage, ...rest.map(({ data }) => data)].flatMap(
    (page) => page.results ?? []
  );
}

/** What each sortable column orders by. */
type SortReader = (label: Label, counts?: TemplateCounts) => string | number;

const BY_NAME: SortReader = (label) => (label.name ?? '').toLowerCase();

/** The columns whose order is the template counts. */
const COUNT_SORTS = ['job_templates', 'workflow_templates'];

/** Whether an ordering is by one of the counts, either way round. */
const ordersByCount = (orderBy: string) =>
  COUNT_SORTS.includes(orderBy.replace(/^-/, ''));

const SORTS: Record<string, SortReader> = {
  name: BY_NAME,
  organization__name: (label) =>
    (label.summary_fields?.organization?.name ?? '').toLowerCase(),
  job_templates: (_label, counts) => counts?.jobTemplates ?? 0,
  workflow_templates: (_label, counts) => counts?.workflowTemplates ?? 0,
};

/**
 * The labels in the order asked for, and the page of them being shown.
 *
 * Args:
 *     labels: Every label the search matched.
 *     counts: What each label carries, by label id.
 *     orderBy: The column to order by, a leading minus for descending.
 *     page: Which page to cut, counting from one.
 *     pageSize: How many rows a page holds.
 *
 * Returns:
 *     The rows for that page, and how many there are in all.
 */
function sortAndPage(
  labels: Label[],
  counts: Record<number, TemplateCounts>,
  orderBy: string,
  page: number,
  pageSize: number
): { results: Label[]; count: number } {
  const descending = orderBy.startsWith('-');
  const key = descending ? orderBy.slice(1) : orderBy;
  const read = SORTS[key] ?? BY_NAME;
  const sorted = [...labels].sort((a, b) => {
    const left = read(a, counts[a.id]);
    const right = read(b, counts[b.id]);
    if (left === right) {
      // A tie reads better by name than in whatever order the api gave them.
      return (a.name ?? '').localeCompare(b.name ?? '');
    }
    const order = left < right ? -1 : 1;
    return descending ? -order : order;
  });
  const start = (page - 1) * pageSize;
  return {
    results: sorted.slice(start, start + pageSize),
    count: labels.length,
  };
}

/**
 * Why the api refused to delete a label that is still in use, as it said it.
 *
 * Args:
 *     error: What the delete rejected with.
 *
 * Returns:
 *     The api's message where the refusal was a 409, and null otherwise.
 */
function inUseReason(error: unknown): string | null {
  const response = (error as DetailedError | null)?.response;
  if (response?.status !== 409) {
    return null;
  }
  const message = getErrorMessage(response);
  return typeof message === 'string' ? message : null;
}

function LabelLists() {
  const { t } = useLingui();
  const location = useLocation();
  const { me } = useConfig();
  // Read by what they hold rather than by the object, so a config that is
  // rebuilt with the same user does not read the whole list again.
  const meId = me?.id;
  const isSuperuser = Boolean(me?.is_superuser);

  /*
   * The paging and the ordering are this screen's to answer, so they are taken
   * out of what the api is asked: reading is keyed on the search alone, and
   * turning a page or changing the order sorts what is already here rather than
   * reading it again.
   */
  const {
    page = 1,
    page_size: pageSize = 20,
    order_by: orderBy = 'name',
    ...filters
  } = parseQueryString(qsConfig, location.search) as QSParams & {
    page?: number;
    page_size?: number;
    order_by?: string;
  };
  const filterKey = JSON.stringify(filters);

  const {
    result: { labels, canAdd, adminOrgIds },
    error: contentError,
    isLoading,
    request: fetchLabels,
  } = useRequest(
    useCallback(async () => {
      // Every label, not only the ones a job template carries. The filter that
      // used to be here restricted the list to labels in use, which is a fine
      // read-only view and the wrong one for a screen that creates them: a new
      // label belongs to nothing yet, so it would have been made and then not
      // shown.
      const [all, options, administered] = await Promise.all([
        readAllLabels(JSON.parse(filterKey) as QSParams),
        LabelsAPI.readOptions(),
        readAdministeredOrganizationIds({
          id: meId,
          is_superuser: isSuperuser,
        }),
      ]);
      return {
        labels: all,
        // Add is offered to whoever the api offers POST, as on every other
        // list; the api still checks the organization chosen on the form.
        canAdd: Boolean(options?.data?.actions?.POST),
        adminOrgIds: administered,
      };
    }, [filterKey, meId, isSuperuser]),
    {
      labels: [] as Label[],
      canAdd: false,
      adminOrgIds: new Set<number>(),
    }
  );

  /*
   * Which labels need their templates counted. Ordered by name or by
   * organization, only the page on screen does, and it is cut before the
   * counts are read. Ordered by a count, the order is the counts, so every
   * label the search matched is counted before a page can be cut.
   */
  // Inside a memo, like every other use of the ordering: a bare call on a
  // value parsed out of the address alongside the search reads, to the
  // linter, as though it could change what the labels were read with.
  const isCountOrder = useMemo(() => ordersByCount(orderBy), [orderBy]);
  const pageByName = useMemo(
    () =>
      isCountOrder ? null : sortAndPage(labels, {}, orderBy, page, pageSize),
    [isCountOrder, labels, orderBy, page, pageSize]
  );
  /*
   * What a count is asked by, the label and its organization, held as text
   * the way the search is: the counts are read again when the labels to count
   * change, and not when the same ones arrive in a list read again.
   */
  const toCountKey = JSON.stringify(
    (pageByName ? pageByName.results : labels).map((label) => ({
      id: label.id,
      organizationId: label.summary_fields?.organization?.id,
    }))
  );

  const {
    result: templateCounts,
    error: countError,
    isLoading: isCounting,
    request: fetchCounts,
  } = useRequest(
    useCallback(
      () => readTemplateCounts(JSON.parse(toCountKey) as CountedLabel[]),
      [toCountKey]
    ),
    {} as Record<number, TemplateCounts>
  );

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  /*
   * Edit and delete follow the api's rule rather than being offered to all:
   * a label may be changed or deleted by a superuser or by an admin of its
   * organization, and by nobody else. Offered to everyone, both ended in 403.
   * Where the api says so itself, in the label's user_capabilities, that is
   * what is followed; the organizations are the rule for an api that does not.
   */
  const canChange = useCallback(
    (label: Label) => {
      const capabilities = (
        label.summary_fields as
          { user_capabilities?: { edit?: boolean } } | undefined
      )?.user_capabilities;
      if (typeof capabilities?.edit === 'boolean') {
        return capabilities.edit;
      }
      return canChangeLabel({ is_superuser: isSuperuser }, adminOrgIds, label);
    },
    [isSuperuser, adminOrgIds]
  );
  const canDelete = useCallback(
    (label: Label) => {
      const capabilities = (
        label.summary_fields as
          { user_capabilities?: { delete?: boolean } } | undefined
      )?.user_capabilities;
      if (typeof capabilities?.delete === 'boolean') {
        return capabilities.delete;
      }
      return canChange(label);
    },
    [canChange]
  );

  const { results, count } = useMemo(
    () =>
      pageByName ??
      sortAndPage(labels, templateCounts, orderBy, page, pageSize),
    [pageByName, labels, templateCounts, orderBy, page, pageSize]
  );

  useEffect(() => {
    fetchLabels();
  }, [fetchLabels]);

  const { selected, isAllSelected, handleSelect, clearSelected, selectAll } =
    useSelected(results);

  const {
    isLoading: isDeleteLoading,
    deletionError,
    deleteItems: deleteLabels,
    clearDeletionError,
  } = useDeleteItems(
    useCallback(async () => {
      /* Every one is asked for, whatever the others answer: a label still in
         use is refused on its own, and the rest go. The first refusal is the
         one said, once all have answered and the list can be read again. */
      const answers = await Promise.allSettled(
        selected.map(({ id }) => LabelsAPI.destroy(id))
      );
      const refused = answers.find(
        (answer): answer is PromiseRejectedResult =>
          answer.status === 'rejected'
      );
      if (refused) {
        throw refused.reason;
      }
    }, [selected]),
    { qsConfig, allItemsSelected: isAllSelected, fetchItems: fetchLabels }
  );

  const inUseMessage = inUseReason(deletionError);

  const handleDelete = async () => {
    await deleteLabels();
    clearSelected();
  };

  return (
    <Card>
      <PaginatedTable
        contentError={contentError || countError}
        hasContentLoading={isLoading || isDeleteLoading || isCounting}
        items={results}
        itemCount={count}
        pluralizedItemName={t`Labels`}
        qsConfig={qsConfig}
        toolbarSearchColumns={[
          { name: t`Name`, key: 'name__icontains', isDefault: true },
          {
            name: t`Organization`,
            key: 'organization__name__icontains',
          },
        ]}
        renderToolbar={(props) => (
          <DatalistToolbar
            {...props}
            isAllSelected={isAllSelected}
            onSelectAll={selectAll}
            qsConfig={qsConfig}
            additionalControls={[
              ...(canAdd
                ? [
                    <ToolbarAddButton
                      key="add"
                      linkTo="/labels/add"
                      tooltip={t`Add Label`}
                    />,
                  ]
                : []),
              <ToolbarDeleteButton
                key="delete"
                onDelete={handleDelete}
                itemsToDelete={selected}
                pluralizedItemName={t`Labels`}
                /* The button reads user_capabilities to decide what may be
                   deleted, and a label's summary carries none, so it is told
                   the api's own rule instead: whoever may not change a label
                   may not delete it either. The tooltip names the labels that
                   hold the button back. */
                cannotDelete={(item) => !canDelete(item as unknown as Label)}
                /* The api refuses to delete a label anything still carries,
                   templates and finished jobs alike, since deleting it would
                   take it off all of them at once. Saying so before the click
                   saves a refusal after it. */
                deleteMessage={t`Only a label that nothing carries can be deleted: detach it from its templates, inventories and schedules first. This cannot be undone. Are you sure you want to delete it?`}
              />,
            ]}
          />
        )}
        headerRow={
          /*
           * Widths, which no other list sets, because no other list is this
           * narrow: they hold names and dates and fill the table on their own,
           * where these hold a word and a digit. They are shares rather than
           * pixels, the table handing out what it has over by the ratio between
           * them, and these are the shares that grow the four gaps between the
           * headings at the same rate, so a wider window widens all four alike
           * rather than one of them. What is left over then is a constant
           * difference, which the padding in the stylesheet takes out.
           */
          <HeaderRow qsConfig={qsConfig}>
            <HeaderCell
              sortKey="name"
              width={287}
              className="ascender-label-lists__name"
            >
              {t`Name`}
            </HeaderCell>
            <HeaderCell sortKey="organization__name" width={298}>
              {t`Organization`}
            </HeaderCell>
            {/* One digit under a heading of two words, so the heading is what
                sets the width. Asking for as good as nothing leaves this column
                at its heading and no wider. */}
            <HeaderCell
              sortKey="job_templates"
              width={1}
              className="ascender-label-lists__count"
            >
              {t`Job Templates`}
            </HeaderCell>
            <HeaderCell
              sortKey="workflow_templates"
              width={366}
              className="ascender-label-lists__count"
            >
              {t`Workflow Templates`}
            </HeaderCell>
            <HeaderCell width={259} className="ascender-label-lists__actions">
              {t`Actions`}
            </HeaderCell>
          </HeaderRow>
        }
        renderRow={(label, index) => (
          <LabelListItem
            key={label.id}
            label={label}
            templateCounts={templateCounts[label.id]}
            canEdit={canChange(label)}
            rowIndex={index}
            isSelected={selected.some((row) => row.id === label.id)}
            onSelect={() => handleSelect(label)}
          />
        )}
      />
      {Boolean(deletionError) && (
        <AlertModal
          isOpen
          variant="error"
          aria-label={t`Deletion error`}
          title={t`Error!`}
          onClose={clearDeletionError}
        >
          {t`Failed to delete one or more labels.`}
          {/* A label still in use is refused with a reason worth reading
              as it stands, what to do about it, rather than behind Details. */}
          {inUseMessage && <p>{inUseMessage}</p>}
          <ErrorDetail error={deletionError} />
        </AlertModal>
      )}
    </Card>
  );
}

export default LabelLists;
