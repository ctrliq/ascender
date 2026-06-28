import React from 'react';
import { useLocation } from 'react-router';
import { useLingui } from '@lingui/react/macro';

import styled from 'styled-components';

import {
  Switch,
  Checkbox,
  Button,
  Toolbar as _Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
  Tooltip,
} from '@patternfly/react-core';
import { ToolbarAddButton } from 'components/PaginatedTable';

const Toolbar = styled(_Toolbar)`
  margin-left: 10px;
`;
const SwitchWrapper = styled(ToolbarItem)`
  padding-left: 4px;
`;

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
}) {
  const { t } = useLingui();
  isDeleteDisabled = !canEdit || isDeleteDisabled;
  const { pathname } = useLocation();
  const surveyUrl = `${pathname.substr(0, pathname.indexOf('survey'))}survey`;
  return (
    <Toolbar id="survey-toolbar" ouiaId="survey-toolbar">
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
          <ToolbarItem>
            <ToolbarAddButton
              isDisabled={!canEdit}
              linkTo={`${surveyUrl}/add`}
            />
          </ToolbarItem>
          {canEdit && onOpenOrderModal && (
            <ToolbarItem>
              <Tooltip
                content={t`Click to rearrange the order of the survey questions`}
              >
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
            <Tooltip
              content={
                isDeleteDisabled
                  ? t`Select a question to delete`
                  : t`Delete survey question`
              }
            >
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
          <SwitchWrapper>
            <Switch
              aria-label={t`Survey Toggle`}
              id="survey-toggle"
              label={t`Survey Enabled`}

              isChecked={surveyEnabled}
              isDisabled={!canEdit}
              onChange={() => onToggleSurvey(!surveyEnabled)}
            />
          </SwitchWrapper>
        )}
      </ToolbarContent>
    </Toolbar>
  );
}

export default SurveyToolbar;
