import React from 'react';
import { useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';

import {
  Switch,
  Checkbox,
  Button,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from '@patternfly/react-core';
import { ToolbarAddButton } from 'components/PaginatedTable';
import './SurveyToolbar.css';
import Tooltip from 'components/Tooltip';

export interface SurveyToolbarProps {
  canEdit?: boolean;
  isAllSelected: boolean;
  onSelectAll: (isSelected: boolean) => void;
  surveyEnabled?: boolean;
  onToggleSurvey: (isEnabled: boolean) => void;
  isDeleteDisabled: boolean;
  onToggleDeleteModal: (isOpen: boolean) => void;
  /** Absent when there is nothing to reorder, which the toolbar checks. */
  onOpenOrderModal?: () => void;
  emptyList?: boolean;
  [key: string]: unknown;
}

function SurveyToolbar({
  canEdit,
  isAllSelected,
  onSelectAll,
  surveyEnabled,
  onToggleSurvey,
  isDeleteDisabled,
  onToggleDeleteModal,
  onOpenOrderModal,
  emptyList,
}: SurveyToolbarProps) {
  const { t } = useLingui();
  isDeleteDisabled = !canEdit || isDeleteDisabled;
  /* Why Delete cannot be pressed, where it cannot: the permission first,
     since ticking a question would not help with that. */
  /* Questions, in the plural, since one click deletes every question
     ticked, where Add adds the one Question. */
  let deleteTooltip = t`Delete Questions`;
  if (!canEdit) {
    deleteTooltip = t`You do not have permission to delete survey questions`;
  } else if (isDeleteDisabled) {
    deleteTooltip = t`Select a question to delete`;
  }
  const { pathname } = useLocation();
  const surveyUrl = `${pathname.substr(0, pathname.indexOf('survey'))}survey`;
  return (
    <Toolbar
      className="ascender-survey-toolbar__toolbar"
      id="survey-toolbar"
      ouiaId="survey-toolbar"
    >
      <ToolbarContent>
        <ToolbarItem>
          <Checkbox
            isDisabled={!canEdit}
            isChecked={isAllSelected}
            onChange={(_event, isChecked) => {
              onSelectAll(isChecked);
            }}
            aria-label={t`Select all`}
            id="select-all"
            ouiaId="select-all"
          />
        </ToolbarItem>
        <ToolbarGroup>
          {/* Left out rather than disabled for whoever may not edit, as the
              other lists leave out their Add. */}
          {canEdit && (
            <ToolbarItem>
              <ToolbarAddButton
                tooltip={t`Add Question`}
                linkTo={`${surveyUrl}/add`}
              />
            </ToolbarItem>
          )}
          {canEdit && onOpenOrderModal && (
            <ToolbarItem>
              <Tooltip content={t`Edit Question Order`}>
                <Button
                  onClick={() => {
                    onOpenOrderModal();
                  }}
                  variant="secondary"
                  ouiaId="edit-order"
                >
                  {t`Edit Order`}
                </Button>
              </Tooltip>
            </ToolbarItem>
          )}
          <ToolbarItem>
            <Tooltip content={deleteTooltip}>
              <div>
                <Button
                  ouiaId="survey-delete-button"
                  variant="secondary"
                  isDisabled={isDeleteDisabled}
                  onClick={() => onToggleDeleteModal(true)}
                >
                  {t`Delete`}
                </Button>
              </div>
            </Tooltip>
          </ToolbarItem>
        </ToolbarGroup>
        {!emptyList && (
          <ToolbarItem className="ascender-survey-toolbar__switch-wrapper">
            <Switch
              aria-label={t`Survey Toggle`}
              id="survey-toggle"
              label={surveyEnabled ? t`Survey Enabled` : t`Survey Disabled`}
              isChecked={surveyEnabled}
              isDisabled={!canEdit}
              onChange={() => onToggleSurvey(!surveyEnabled)}
            />
          </ToolbarItem>
        )}
      </ToolbarContent>
    </Toolbar>
  );
}

export default SurveyToolbar;
