import 'styled-components/macro';
import React from 'react';
import { t } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import { Chip, Tooltip, Button } from '@patternfly/react-core';
import { useLingui } from '@lingui/react';

import { Tr, Td } from '@patternfly/react-table';
import { PencilAltIcon } from '@patternfly/react-icons';
import styled from 'styled-components';
import ChipGroup from 'components/ChipGroup';
import { ActionItem, ActionsTd } from 'components/PaginatedTable';

const Required = styled.span`
  color: var(--pf-global--danger-color--100);
  margin-left: var(--pf-global--spacer--xs);
`;

const SurveyActionsTd = styled(ActionsTd)`
  && {
    padding-right: 35px;
  }
`;

function SurveyListItem({ canEdit, question, isChecked, onSelect, rowIndex }) {
  const { i18n } = useLingui();
  return (
    <Tr ouiaId={`survey-row-${question.variable}`}>
      <Td
        data-cy={`${question.variable}-select`}
        select={{
          rowIndex,
          isSelected: isChecked,
          onSelect,
        }}
        dataLabel={i18n._(t`Selected`)}
      />
      <Td
        data-cy={`${question.variable}-name`}
        id={`survey-list-item-${question.variable}`}
        dataLabel={i18n._(t`Name`)}
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
              aria-label={i18n._(t`Required`)}
              className="pf-c-form__label-required"
              aria-hidden="true"
            >
              *
            </Required>
          )}
        </>
      </Td>
      <Td data-cy={`${question.variable}-type`} dataLabel={i18n._(t`Type`)}>
        {question.type}
      </Td>
      <Td dataLabel={i18n._(t`Default`)}>
        {[question.type].includes('password') && (
          <span>{i18n._(t`encrypted`).toUpperCase()}</span>
        )}
        {[question.type].includes('multiselect') &&
          question.default.length > 0 && (
            <ChipGroup
              numChips={5}
              totalChips={question.default.split('\n').length}
              ouiaId="multiselect-default-chips"
            >
              {question.default.split('\n').map((chip) => (
                <Chip
                  key={chip}
                  isReadOnly
                  ouiaId={`multiselect-default-${chip}-chip`}
                >
                  {chip}
                </Chip>
              ))}
            </ChipGroup>
          )}
        {![question.type].includes('password') &&
          ![question.type].includes('multiselect') && (
            <span>{question.default}</span>
          )}
      </Td>
      <SurveyActionsTd dataLabel={i18n._(t`Actions`)}>
        <ActionItem visible={canEdit}>
          <Tooltip content={i18n._(t`Edit Survey`)} position="top">
            <Button
              ouiaId={`edit-survey-${question.variable}`}
              variant="plain"
              component={Link}
              to={`survey/edit?question_variable=${encodeURIComponent(
                question.variable
              )}`}
            >
              <PencilAltIcon />
            </Button>
          </Tooltip>
        </ActionItem>
      </SurveyActionsTd>
    </Tr>
  );
}
export default SurveyListItem;
