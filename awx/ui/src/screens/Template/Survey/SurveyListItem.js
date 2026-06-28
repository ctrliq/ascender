import React from 'react';
import { Link } from 'react-router';
import {
	Label, Tooltip,
	Button
} from '@patternfly/react-core';

import { useLingui } from '@lingui/react/macro';

import { Tr, Td } from '@patternfly/react-table';
import { PencilAltIcon } from '@patternfly/react-icons';
import styled from 'styled-components';
import ChipGroup from 'components/ChipGroup';
import { ActionItem, ActionsTd } from 'components/PaginatedTable';

const Required = styled.span`
  color: var(--pf-v6-global--danger-color--100);
  margin-left: var(--pf-v6-global--spacer--xs);
`;

const SurveyActionsTd = styled(ActionsTd)`
  && {
    padding-right: 35px;
  }
`;

function SurveyListItem({ canEdit, question, isChecked, onSelect, rowIndex }) {
  const { t } = useLingui();
  return (
    <Tr ouiaId={`survey-row-${question.variable}`}>
      <Td
        data-cy={`${question.variable}-select`}
        select={{
          rowIndex,
          isSelected: isChecked,
          onSelect,
        }}
        dataLabel={t`Selected`}
      />
      <Td
        data-cy={`${question.variable}-name`}
        id={`survey-list-item-${question.variable}`}
        dataLabel={t`Name`}
      >
        <>
          <Link
            to={`survey/edit?question_variable=${encodeURIComponent(
              question.variable
            )}`}
          >
            <b>{question.question_name}</b>
          </Link>
          {question.required && (
            <Required
              aria-label={t`Required`}
              className="pf-v6-c-form__label-required"
              aria-hidden="true"
            >
              *
            </Required>
          )}
        </>
      </Td>
      <Td data-cy={`${question.variable}-type`} dataLabel={t`Type`}>
        {question.type}
      </Td>
      <Td dataLabel={t`Default`}>
        {[question.type].includes('password') && (
          <span>{t`encrypted`.toUpperCase()}</span>
        )}
        {[question.type].includes('multiselect') &&
          question.default.length > 0 && (
            <ChipGroup
              numChips={5}
              totalChips={question.default.split('\n').length}
              ouiaId="multiselect-default-chips"
            >
              {question.default.split('\n').map((chip) => (
                <Label variant="outline"
                  key={chip}

                  data-ouia-component-id={`multiselect-default-${chip}-chip`}
                >
                  {chip}
                </Label>
              ))}
            </ChipGroup>
          )}
        {![question.type].includes('password') &&
          ![question.type].includes('multiselect') && (
            <span>{question.default}</span>
          )}
      </Td>
      <SurveyActionsTd dataLabel={t`Actions`}>
        <ActionItem visible={canEdit}>
          <Tooltip content={t`Edit Survey`} position="top">
            <Button icon={<PencilAltIcon />}
              ouiaId={`edit-survey-${question.variable}`}
              variant="plain"
              component={Link}
              to={`survey/edit?question_variable=${encodeURIComponent(
                question.variable
              )}`}
             />
          </Tooltip>
        </ActionItem>
      </SurveyActionsTd>
    </Tr>
  );
}
export default SurveyListItem;
