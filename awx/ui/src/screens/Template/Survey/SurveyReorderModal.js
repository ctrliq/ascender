import React, { useState, useRef } from 'react';
import { msg } from '@lingui/macro';
import { useLingui } from '@lingui/react';
import { GripVerticalIcon } from '@patternfly/react-icons';
import {
  Modal,
  TextInput,
  TextArea,
  Select,
  SelectOption,
  SelectVariant,
  Button,
} from '@patternfly/react-core';
import {
  TableComposable,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from '@patternfly/react-table';

function SurveyReorderModal({
  questions,
  isOrderModalOpen,
  onCloseOrderModal,
  onSave,
}) {
  const { i18n } = useLingui();
  const [surveyQuestions, setSurveyQuestions] = useState([...questions]);
  const [itemStartIndex, setStartItemIndex] = useState(null);
  const [draggedItemId, setDraggedItemId] = useState(null);
  const ref = useRef(null);

  const isValidDrop = (evt) => {
    const ulRect = ref.current.getBoundingClientRect();
    return (
      evt.clientX > ulRect.x &&
      evt.clientX < ulRect.x + ulRect.width &&
      evt.clientY > ulRect.y &&
      evt.clientY < ulRect.y + ulRect.height
    );
  };
  const onDrop = (evt) => {
    if (!isValidDrop(evt)) {
      onDragCancel();
    }
  };

  const onDragCancel = () => {
    Array.from(ref.current.children).forEach((el) => {
      el.setAttribute('aria-pressed', 'false');
    });
    setDraggedItemId(null);
    setStartItemIndex(null);
  };

  const onDragOver = (evt) => {
    evt.preventDefault();

    const curListItem = evt.target.closest('tr');

    const dragId = curListItem.id;
    const newDraggedItemIndex = Array.from(ref.current.children).findIndex(
      (item) => item.id === dragId
    );

    if (newDraggedItemIndex !== itemStartIndex) {
      const temporaryOrder = moveItem(
        [...surveyQuestions],
        draggedItemId,
        newDraggedItemIndex
      );

      setSurveyQuestions(temporaryOrder);
    }
    return null;
  };

  const moveItem = (arr, itemId, toIndex) => {
    const fromIndex = arr.findIndex((item) => item.variable === itemId);

    if (fromIndex === toIndex) {
      return arr;
    }
    const temp = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, temp[0]);

    return arr;
  };

  const onDragLeave = (evt) => {
    if (!isValidDrop(evt)) {
      setStartItemIndex(null);
    }
  };

  const onDragEnd = (evt) => {
    evt.target.setAttribute('aria-pressed', 'false');

    setDraggedItemId(null);
    setStartItemIndex(null);
  };

  const onDragStart = (evt) => {
    evt.dataTransfer.effectAllowed = 'move';
    const newDraggedItemId = evt.currentTarget.id;

    const originalStartIndex = Array.from(ref.current.children).findIndex(
      (item) => item.id === evt.currentTarget.id
    );

    evt.currentTarget.setAttribute('aria-pressed', 'true');
    setDraggedItemId(newDraggedItemId);
    setStartItemIndex(originalStartIndex);
  };

  const defaultAnswer = (q) => {
    let component = null;
    const choices = Array.isArray(q.choices)
      ? q.choices
      : (q.choices || '').split('\n');
    switch (q.type) {
      case 'password':
        component = (
          <span id="survey-preview-encrypted">
            {i18n._(msg`encrypted`).toUpperCase()}
          </span>
        );
        break;
      case 'textarea':
        component = (
          <TextArea
            id={`survey-preview-textArea-${q.variable}`}
            type={`survey-preview-textArea-${q.variable}`}
            value={q.default}
            aria-label={i18n._(msg`Text Area`)}
            isDisabled
          />
        );
        break;
      case 'multiplechoice':
        component = (
          <Select
            id={`survey-preview-multipleChoice-${q.variable}`}
            ouiaId={`survey-preview-multipleChoice-${q.variable}`}
            isDisabled
            aria-label={i18n._(msg`Multiple Choice`)}
            typeAheadAriaLabel={i18n._(msg`Multiple Choice`)}
            placeholderText={q.default}
            onToggle={() => {}}
          />
        );
        break;
      case 'multiselect':
        component = (
          <Select
            isDisabled
            isReadOnly
            variant={SelectVariant.typeaheadMulti}
            isOpen={false}
            selections={q.default.length > 0 ? q.default.split('\n') : []}
            onToggle={() => {}}
            aria-label={i18n._(msg`Multi-Select`)}
            typeAheadAriaLabel={i18n._(msg`Multi-Select`)}
            id={`survey-preview-multiSelect-${q.variable}`}
            ouiaId={`survey-preview-multiSelect-${q.variable}`}
            noResultsFoundText={i18n._(msg`No results found`)}
          >
            {choices.length > 0 &&
              choices.map((option) => (
                <SelectOption key={option} value={option} />
              ))}
          </Select>
        );
        break;
      default:
        component = (
          <TextInput
            id={`survey-preview-text-${q.variable}`}
            value={q.default}
            isDisabled
            aria-label={i18n._(msg`Text`)}
          />
        );
        break;
    }
    return component;
  };
  return (
    <Modal
      title={i18n._(msg`Survey Question Order`)}
      aria-label={i18n._(msg`Survey preview modal`)}
      isOpen={isOrderModalOpen}
      description={i18n._(msg`To reorder the survey questions drag and drop them in the desired location.`)}
      onClose={() => onCloseOrderModal()}
      variant="medium"
      actions={[
        <Button
          variant="primary"
          ouiaId="survey-order-save"
          key="save"
          onClick={() => {
            onSave(surveyQuestions);
          }}
        >{i18n._(msg`Save`)}</Button>,
        <Button
          ouiaId="survey-order-cancel"
          key="cancel"
          variant="link"
          onClick={() => onCloseOrderModal()}
        >{i18n._(msg`Cancel`)}</Button>,
      ]}
    >
      <TableComposable>
        <Thead>
          <Tr ouiaId="survey-order-table-header">
            <Th dataLabel={i18n._(msg`Order`)}>{i18n._(msg`Order`)}</Th>
            <Th dataLabel={i18n._(msg`Name`)}>{i18n._(msg`Name`)}</Th>
            <Th dataLabel={i18n._(msg`Default Answer(s)`)}>{i18n._(msg`Default Answer(s)`)}
            </Th>
          </Tr>
        </Thead>
        <Tbody onDragOver={onDragOver} onDragLeave={onDragLeave} ref={ref}>
          {surveyQuestions.map((q) => (
            <Tr
              key={q.variable}
              id={q.variable}
              draggable
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              onDragStart={onDragStart}
              ouiaId={`survey-order-row-${q.variable}`}
            >
              <Td dataLabel={i18n._(msg`Order`)}>
                <Button variant="plain">
                  <GripVerticalIcon />
                </Button>
              </Td>
              <Td dataLabel={i18n._(msg`Name`)} aria-label={q.question_name}>
                {q.question_name}
              </Td>
              <Td dataLabel={i18n._(msg`Default Answer(s)`)}>{defaultAnswer(q)}</Td>
            </Tr>
          ))}
        </Tbody>
      </TableComposable>
    </Modal>
  );
}
export default SurveyReorderModal;
