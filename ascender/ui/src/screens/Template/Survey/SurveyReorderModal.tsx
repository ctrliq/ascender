import type { SurveyConfig, SurveyQuestion } from 'types/api';
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
  Button,
} from '@patternfly/react-core';
import { Modal } from '@patternfly/react-core/deprecated';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';

export interface SurveyReorderModalProps {
  questions: SurveyQuestion[];
  isOrderModalOpen: boolean;
  onCloseOrderModal: () => void;
  /** Saves the survey back with its questions in the order just dragged. */
  onSave: (questions: SurveyQuestion[], config?: SurveyConfig) => void;
  [key: string]: unknown;
}

function SurveyReorderModal({
  questions,
  isOrderModalOpen,
  onCloseOrderModal,
  onSave,
}: SurveyReorderModalProps) {
  const { t } = useLingui();
  const [surveyQuestions, setSurveyQuestions] = useState([...questions]);
  const [itemStartIndex, setStartItemIndex] = useState<number | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const ref = useRef<HTMLTableSectionElement>(null);

  // The rows are dragged within the table body, which is what bounds the drop.
  const rows = () => Array.from(ref.current?.children ?? []);

  const isValidDrop = (evt: React.DragEvent) => {
    const ulRect = ref.current?.getBoundingClientRect();
    if (!ulRect) {
      return false;
    }
    return (
      evt.clientX > ulRect.x &&
      evt.clientX < ulRect.x + ulRect.width &&
      evt.clientY > ulRect.y &&
      evt.clientY < ulRect.y + ulRect.height
    );
  };
  const onDrop = (evt: React.DragEvent) => {
    if (!isValidDrop(evt)) {
      onDragCancel();
    }
  };

  const onDragCancel = () => {
    rows().forEach((el) => {
      el.setAttribute('aria-pressed', 'false');
    });
    setDraggedItemId(null);
    setStartItemIndex(null);
  };

  const onDragOver = (evt: React.DragEvent) => {
    evt.preventDefault();

    const curListItem = (evt.target as HTMLElement).closest('tr');
    if (!curListItem) {
      return null;
    }

    const dragId = curListItem.id;
    const newDraggedItemIndex = rows().findIndex((item) => item.id === dragId);

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

  const moveItem = (
    arr: SurveyQuestion[],
    itemId: string | null,
    toIndex: number
  ) => {
    const fromIndex = arr.findIndex((item) => item.variable === itemId);

    if (fromIndex === toIndex) {
      return arr;
    }
    const temp = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, temp[0] as SurveyQuestion);

    return arr;
  };

  const onDragLeave = (evt: React.DragEvent) => {
    if (!isValidDrop(evt)) {
      setStartItemIndex(null);
    }
  };

  const onDragEnd = (evt: React.DragEvent) => {
    (evt.target as HTMLElement).setAttribute('aria-pressed', 'false');

    setDraggedItemId(null);
    setStartItemIndex(null);
  };

  const onDragStart = (evt: React.DragEvent<HTMLTableRowElement>) => {
    evt.dataTransfer.effectAllowed = 'move';
    const newDraggedItemId = evt.currentTarget.id;

    const originalStartIndex = rows().findIndex(
      (item) => item.id === newDraggedItemId
    );

    evt.currentTarget.setAttribute('aria-pressed', 'true');
    setDraggedItemId(newDraggedItemId);
    setStartItemIndex(originalStartIndex);
  };

  const defaultAnswer = (q: SurveyQuestion) => {
    // A question's default is whatever its type takes, so the preview shows it
    // as text; a multiselect keeps several on their own lines.
    const answer = String(q.default ?? '');
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
            value={answer}
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
                {answer || t`Select an option`}
              </MenuToggle>
            )}
          >
            <SelectList>
              {choices.length > 0 &&
                choices.map((option: string) => (
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
                {answer.length > 0 ? (
                  <LabelGroup>
                    {answer.split('\n').map((val) => (
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
                choices.map((option: string) => (
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
            value={answer}
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
            <Th dataLabel={t`Default Answer(s)`}>{t`Default Answer(s)`}</Th>
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
              <Td dataLabel={t`Default Answer(s)`}>{defaultAnswer(q)}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Modal>
  );
}
export default SurveyReorderModal;
