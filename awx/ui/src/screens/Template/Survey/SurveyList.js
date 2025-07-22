import React, { useState } from 'react';

import { msg } from '@lingui/macro';
import { Button } from '@patternfly/react-core';
import { TableComposable, Thead, Tr, Th, Tbody } from '@patternfly/react-table';
import AlertModal from 'components/AlertModal';
import ContentEmpty from 'components/ContentEmpty';
import ContentLoading from 'components/ContentLoading';
import { useLingui } from '@lingui/react';

import useSelected from 'hooks/useSelected';
import SurveyListItem from './SurveyListItem';
import SurveyToolbar from './SurveyToolbar';
import SurveyReorderModal from './SurveyReorderModal';

function SurveyList({
  isLoading,
  survey,
  surveyEnabled,
  toggleSurvey,
  updateSurvey,
  deleteSurvey,
  canEdit,
}) {
  const { i18n } = useLingui();
  const questions = survey?.spec || [];
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  const { selected, isAllSelected, setSelected, selectAll, clearSelected } =
    useSelected(questions);

  const handleSelect = (item) => {
    if (selected.some((q) => q.variable === item.variable)) {
      setSelected(selected.filter((q) => q.variable !== item.variable));
    } else {
      setSelected(selected.concat(item));
    }
  };

  const handleDelete = async () => {
    if (isAllSelected) {
      await deleteSurvey();
    } else {
      await updateSurvey(questions.filter((q) => !selected.includes(q)));
    }
    setIsDeleteModalOpen(false);
    clearSelected();
  };

  const deleteModal = (
    <AlertModal
      variant="danger"
      title={
        isAllSelected
          ? i18n._(msg`Delete Survey`)
          : i18n._(msg`Delete Questions`)
      }
      isOpen={isDeleteModalOpen}
      onClose={() => {
        setIsDeleteModalOpen(false);
        clearSelected();
      }}
      actions={[
        <Button
          ouiaId="delete-confirm-button"
          key="delete"
          variant="danger"
          aria-label={i18n._(msg`confirm delete`)}
          onClick={handleDelete}
        >
          {i18n._(msg`Delete`)}
        </Button>,
        <Button
          ouiaId="delete-cancel-button"
          key="cancel"
          variant="link"
          aria-label={i18n._(msg`cancel delete`)}
          onClick={() => {
            setIsDeleteModalOpen(false);
            clearSelected();
          }}
        >
          {i18n._(msg`Cancel`)}
        </Button>,
      ]}
    >
      <div>{i18n._(msg`This action will delete the following:`)}</div>
      {selected.map((question) => (
        <span key={question.variable}>
          <strong>{question.question_name}</strong>
          <br />
        </span>
      ))}
    </AlertModal>
  );

  let content;
  if (isLoading) {
    content = <ContentLoading />;
  } else {
    content = (
      <>
        <TableComposable ouiaId="survey-list">
          <Thead>
            <Tr ouiaId="survey-table-header">
              <Th />
              <Th dataLabel={i18n._(msg`Name`)}>{i18n._(msg`Name`)}</Th>
              <Th dataLabel={i18n._(msg`Type`)}>{i18n._(msg`Type`)}</Th>
              <Th dataLabel={i18n._(msg`Default`)}>{i18n._(msg`Default`)}</Th>
              <Th dataLabel={i18n._(msg`Actions`)}>{i18n._(msg`Actions`)}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {questions?.map((question, index) => (
              <SurveyListItem
                key={question.variable}
                isLast={index === questions.length - 1}
                isFirst={index === 0}
                question={question}
                isChecked={selected.some(
                  (q) => q.variable === question.variable
                )}
                onSelect={() => handleSelect(question)}
                canEdit={canEdit}
                rowIndex={index}
              />
            ))}
          </Tbody>
        </TableComposable>
        {isDeleteModalOpen && deleteModal}
        {isOrderModalOpen && (
          <SurveyReorderModal
            isOrderModalOpen={isOrderModalOpen}
            onCloseOrderModal={() => setIsOrderModalOpen(false)}
            questions={questions}
            onSave={(newOrder) => {
              updateSurvey(newOrder);
              setIsOrderModalOpen(false);
            }}
          />
        )}
      </>
    );
  }

  const emptyList = !questions || questions?.length <= 0;

  if (emptyList && !isLoading) {
    content = (
      <ContentEmpty
        message={i18n._(msg`Please add survey questions.`)}
        title={i18n._(msg`No survey questions found.`)}
      />
    );
  }
  return (
    <>
      <SurveyToolbar
        onOpenOrderModal={
          questions.length > 1 &&
          (() => {
            setIsOrderModalOpen(true);
          })
        }
        isAllSelected={isAllSelected}
        onSelectAll={selectAll}
        surveyEnabled={surveyEnabled}
        onToggleSurvey={toggleSurvey}
        isDeleteDisabled={selected?.length === 0}
        canEdit={canEdit}
        emptyList={emptyList}
        onToggleDeleteModal={() => setIsDeleteModalOpen(true)}
      />
      {content}
    </>
  );
}

export default SurveyList;
