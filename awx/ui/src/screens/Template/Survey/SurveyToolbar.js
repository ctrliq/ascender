import React from 'react';
import { useRouteMatch } from 'react-router-dom';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';

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
  const { i18n } = useLingui();
  isDeleteDisabled = !canEdit || isDeleteDisabled;
  const match = useRouteMatch();
  return (
    <Toolbar id="survey-toolbar" ouiaId="survey-toolbar">
      <ToolbarContent>
        <ToolbarItem>
          <Checkbox
            isDisabled={!canEdit}
            isChecked={isAllSelected}
            onChange={(isChecked) => {
              onSelectAll(isChecked);
            }}
            aria-label={i18n._(msg`Select all`)}
            id="select-all"
            ouiaId="select-all"
          />
        </ToolbarItem>
        <ToolbarGroup>
          <ToolbarItem>
            <ToolbarAddButton
              isDisabled={!canEdit}
              linkTo={`${match.url}/add`}
            />
          </ToolbarItem>
          {canEdit && onOpenOrderModal && (
            <ToolbarItem>
              <Tooltip
                content={i18n._(
                  msg`Click to rearrange the order of the survey questions`
                )}
              >
                <Button
                  onClick={() => {
                    onOpenOrderModal();
                  }}
                  variant="secondary"
                  ouiaId="edit-order"
                >
                  {i18n._(msg`Edit Order`)}
                </Button>
              </Tooltip>
            </ToolbarItem>
          )}
          <ToolbarItem>
            <Tooltip
              content={
                isDeleteDisabled
                  ? i18n._(msg`Select a question to delete`)
                  : i18n._(msg`Delete survey question`)
              }
            >
              <div>
                <Button
                  ouiaId="survey-delete-button"
                  variant="secondary"
                  isDisabled={isDeleteDisabled}
                  onClick={() => onToggleDeleteModal(true)}
                >
                  {i18n._(msg`Delete`)}
                </Button>
              </div>
            </Tooltip>
          </ToolbarItem>
        </ToolbarGroup>
        {!emptyList && (
          <SwitchWrapper>
            <Switch
              aria-label={i18n._(msg`Survey Toggle`)}
              id="survey-toggle"
              label={i18n._(msg`Survey Enabled`)}
              labelOff={i18n._(msg`Survey Disabled`)}
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
