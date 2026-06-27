import React, { useState, useRef } from 'react';
import { useLingui } from '@lingui/react/macro';
import { GripVerticalIcon } from '@patternfly/react-icons';
import {
	Label,
	LabelGroup,
	MenuToggle,
	Select,
	SelectList,
	SelectOption,
	TextInput,
	TextArea,
	Button
} from '@patternfly/react-core';
import {
	Modal
} from '@patternfly/react-core/deprecated';
import {
  Table,
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
  const { t } = useLingui();
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
            {t`encrypted`.toUpperCase()}
          </span>
        );
        break;
      case 'textarea':
        component = (
          <TextArea
            id={`survey-preview-textArea-${q.variable}`}
            type={`survey-preview-textArea-${q.variable}`}
            value={q.default}
            aria-label={t`Text Area`}
            isDisabled
          />
        );
        break;
      case 'multiplechoice':
        component = (
          <Select
            id={`survey-preview-multipleChoice-${q.variable}`}
            isOpen={false}
            onOpenChange={() => {}}
            toggle={(toggleRef) => (
              <MenuToggle
                ref={toggleRef}
                isDisabled
                aria-label={t`Multiple Choice`}
                ouiaId={`survey-preview-multipleChoice-${q.variable}`}
              >
                {q.default || t`Select an option`}
              </MenuToggle>
            )}
          >
            <SelectList>
              {choices.length > 0 &&
                choices.map((option) => (
                  <SelectOption key={option} value={option}>
                    {option}
                  </SelectOption>
                ))}
            </SelectList>
          </Select>
        );
        break;
      case 'multiselect':
        component = (
          <Select
            id={`survey-preview-multiSelect-${q.variable}`}
            isOpen={false}
            onOpenChange={() => {}}
            toggle={(toggleRef) => (
              <MenuToggle
                ref={toggleRef}
                isDisabled
                variant="typeahead"
                aria-label={t`Multi-Select`}
                ouiaId={`survey-preview-multiSelect-${q.variable}`}
              >
                {q.default.length > 0 ? (
                  <LabelGroup>
                    {q.default.split('\n').map((val) => (
                      <Label key={val}>{val}</Label>
                    ))}
                  </LabelGroup>
                ) : (
                  t`Select option(s)`
                )}
              </MenuToggle>
            )}
          >
            <SelectList>
              {choices.length > 0 &&
                choices.map((option) => (
                  <SelectOption key={option} value={option}>
                    {option}
                  </SelectOption>
                ))}
            </SelectList>
          </Select>
        );
        break;
      default:
        component = (
          <TextInput
            id={`survey-preview-text-${q.variable}`}
            value={q.default}
            isDisabled
            aria-label={t`Text`}
          />
        );
        break;
    }
    return component;
  };
  return (
    <Modal
      title={t`Survey Question Order`}
      aria-label={t`Survey preview modal`}
      isOpen={isOrderModalOpen}
      description={t`To reorder the survey questions drag and drop them in the desired location.`}
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
        >
          {t`Save`}
        </Button>,
        <Button
          ouiaId="survey-order-cancel"
          key="cancel"
          variant="link"
          onClick={() => onCloseOrderModal()}
        >
          {t`Cancel`}
        </Button>,
      ]}
    >
      <Table>
        <Thead>
          <Tr ouiaId="survey-order-table-header">
            <Th dataLabel={t`Order`}>{t`Order`}</Th>
            <Th dataLabel={t`Name`}>{t`Name`}</Th>
            <Th dataLabel={t`Default Answer(s)`}>
              {t`Default Answer(s)`}
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
              <Td dataLabel={t`Order`}>
                <Button icon={<GripVerticalIcon />} variant="plain" />
              </Td>
              <Td dataLabel={t`Name`} aria-label={q.question_name}>
                {q.question_name}
              </Td>
              <Td dataLabel={t`Default Answer(s)`}>
                {defaultAnswer(q)}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Modal>
  );
}
export default SurveyReorderModal;
