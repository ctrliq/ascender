import type { SummaryFieldRef } from 'types/api';
import React, { useCallback, useEffect } from 'react';
import type { FieldValidator } from 'formik';
import { useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';
import {
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import { ProjectsAPI } from 'api';
import useAutoPopulateLookup from 'hooks/useAutoPopulateLookup';
import useRequest from 'hooks/useRequest';
import { getSearchableKeys } from 'components/PaginatedTable';
import { getQSConfig, parseQueryString } from 'util/qs';
import OptionsList from '../OptionsList';
import Popover from '../Popover';
import Lookup from './Lookup';
import LookupErrorMessage from './shared/LookupErrorMessage';
import type { LookupItem } from './shared/reducer';

const QS_CONFIG = getQSConfig('project', {
  page: 1,
  page_size: 5,
  order_by: 'name',
  role_level: 'use_role',
});

export interface ProjectLookupProps {
  helperTextInvalid?: string;
  autoPopulate?: boolean;
  isValid?: boolean;
  /** Declared method style so a caller may name its own row type. */
  onChange(value: SummaryFieldRef | null): void;
  required?: boolean;
  /** Rendered in a popover beside the label, so markup is fine. */
  tooltip?: React.ReactNode;
  value?: SummaryFieldRef | null;
  /**
   * Declared method style on purpose: the handler is formik's own, which takes
   * an event or a field name, and it is handed straight to whichever
   * PatternFly input the field renders, which names its own event type.
   */
  onBlur?(event?: React.SyntheticEvent): void;
  isOverrideDisabled?: boolean;
  validate?: FieldValidator;
  fieldName?: string;
  [key: string]: unknown;
}

function ProjectLookup({
  helperTextInvalid = '',
  autoPopulate = false,
  isValid = true,
  onChange,
  required = false,
  tooltip = '',
  value,
  onBlur = () => {},
  isOverrideDisabled = false,
  validate = () => undefined,
  fieldName = 'project',
}: ProjectLookupProps) {
  const location = useLocation();
  const { t } = useLingui();
  const autoPopulateLookup = useAutoPopulateLookup(onChange);
  const {
    result: { projects, count, relatedSearchableKeys, searchableKeys, canEdit },
    request: fetchProjects,
    error,
    isLoading,
  } = useRequest(
    useCallback(async () => {
      const params = parseQueryString(QS_CONFIG, location.search);
      const [{ data }, actionsResponse] = await Promise.all([
        ProjectsAPI.read(params),
        ProjectsAPI.readOptions(),
      ]);
      if (autoPopulate) {
        autoPopulateLookup(data.results);
      }
      return {
        count: data.count,
        projects: data.results,
        relatedSearchableKeys: (
          actionsResponse?.data?.related_search_fields || []
        ).map((val) => val.slice(0, -8)),
        searchableKeys: getSearchableKeys(actionsResponse.data.actions?.GET),
        canEdit:
          Boolean(actionsResponse.data.actions.POST) || isOverrideDisabled,
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoPopulate, autoPopulateLookup, location.search]),
    {
      count: 0,
      projects: [],
      relatedSearchableKeys: [],
      searchableKeys: [],
      canEdit: false,
    }
  );

  const checkProjectName = useCallback(
    async (name: string) => {
      if (!name) {
        onChange(null);
        return;
      }

      try {
        const {
          data: { results: nameMatchResults, count: nameMatchCount },
        } = await ProjectsAPI.read({ name });
        onChange(nameMatchCount ? (nameMatchResults[0] ?? null) : null);
      } catch {
        onChange(null);
      }
    },
    [onChange]
  );

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return (
    <FormGroup
      fieldId="project"
      isRequired={required}
      label={t`Project`}
      labelHelp={tooltip ? <Popover content={tooltip} /> : undefined}
    >
      <Lookup
        id="project"
        header={t`Project`}
        name="project"
        value={value}
        onBlur={onBlur}
        onChange={onChange}
        onUpdate={fetchProjects}
        onDebounce={checkProjectName}
        fieldName={fieldName}
        validate={validate}
        required={required}
        isLoading={isLoading}
        isDisabled={!canEdit}
        qsConfig={QS_CONFIG}
        renderOptionsList={({ state, dispatch, canDelete }) => (
          <OptionsList
            value={state.selectedItems}
            searchColumns={[
              {
                name: t`Name`,
                key: 'name__icontains',
                isDefault: true,
              },
              {
                name: t`Type`,
                key: 'or__scm_type',
                options: [
                  [``, t`Manual`],
                  [`git`, t`Git`],
                  [`svn`, t`Subversion`],
                  [`archive`, t`Remote Archive`],
                ],
              },
              {
                name: t`Source Control URL`,
                key: 'scm_url__icontains',
              },
              {
                name: t`Modified By (Username)`,
                key: 'modified_by__username__icontains',
              },
              {
                name: t`Created By (Username)`,
                key: 'created_by__username__icontains',
              },
            ]}
            sortColumns={[
              {
                name: t`Name`,
                key: 'name',
              },
            ]}
            searchableKeys={searchableKeys}
            relatedSearchableKeys={relatedSearchableKeys}
            options={projects}
            optionCount={count}
            multiple={state.multiple}
            header={t`Project`}
            name="project"
            qsConfig={QS_CONFIG}
            readOnly={!canDelete}
            selectItem={(item: LookupItem) =>
              dispatch({ type: 'SELECT_ITEM', item })
            }
            deselectItem={(item: LookupItem) =>
              dispatch({ type: 'DESELECT_ITEM', item })
            }
          />
        )}
      />
      <LookupErrorMessage error={error} />
      {!isValid && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant="error">{helperTextInvalid}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </FormGroup>
  );
}

export { ProjectLookup as _ProjectLookup };
export default ProjectLookup;
