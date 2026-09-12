import React, { useReducer, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useField } from 'formik';
import type { FieldValidator } from 'formik';
import { SearchIcon } from '@patternfly/react-icons';
import {
  Label,
  Button,
  ButtonVariant,
  InputGroup,
  TextInput,
  InputGroupItem,
} from '@patternfly/react-core';
import { Modal } from '@patternfly/react-core/deprecated';
import { useLingui } from '@lingui/react/macro';
import styled from 'styled-components';
import useDebounce from 'hooks/useDebounce';
import type { QSConfig } from 'util/qs';
import ChipGroup from '../ChipGroup';
import reducer, { initReducer } from './shared/reducer';
import type { LookupAction, LookupItem, LookupState } from './shared/reducer';

const ChipHolder = styled.div<{ $isDisabled?: boolean }>`
  --pf-v6-c-form-control--Height: auto;
  min-height: 37px;
  display: flex;
  align-items: center;
  background-color: ${(props) =>
    props.$isDisabled ? 'var(--pf-t--global--text--color--disabled)' : null};
`;
export interface LookupProps {
  id?: string;
  header?: React.ReactNode;
  /**
   * Sets the field: one item, the list of them where the lookup takes more
   * than one, or null. Declared method style so a lookup that names its own
   * kind of row can hand its handler straight through.
   */
  onChange(value: LookupItem | LookupItem[] | null): void;
  /**
   * Declared method style on purpose: the handler is formik's own, which takes
   * an event or a field name, and it is handed straight to whichever
   * PatternFly input the field renders, which names its own event type.
   */
  onBlur?(event?: React.SyntheticEvent): void;
  isLoading?: boolean;
  value?: LookupItem | LookupItem[] | null;
  multiple?: boolean;
  required?: boolean;
  qsConfig: QSConfig;
  renderItemChip?(props: {
    item: LookupItem;
    removeItem: (item: LookupItem) => void;
    canDelete: boolean;
  }): React.ReactNode;
  /**
   * Renders the modal's body, which is a different list per lookup. It is
   * given the reducer so a list can tick and untick its own rows.
   */
  renderOptionsList: (props: {
    state: LookupState;
    dispatch: React.Dispatch<LookupAction>;
    canDelete: boolean;
  }) => React.ReactNode;
  isDisabled?: boolean;
  /** Looks up what the user typed, a moment after they stop typing. */
  onDebounce?: (name: string) => void;
  fieldName: string;
  validate?: FieldValidator;
  modalDescription?: React.ReactNode;
  /** Re-reads the list behind the modal, which is done as it opens. */
  onUpdate?: () => void;
  [key: string]: unknown;
}

function Lookup({
  id = 'lookup-search',
  header,
  onChange,
  onBlur = () => {},
  isLoading,
  value,
  multiple = false,
  required = false,
  qsConfig,
  renderItemChip = ({ item, removeItem }) => (
    <Label variant="outline" key={item.id} onClose={() => removeItem(item)}>
      {item.name as React.ReactNode}
    </Label>
  ),
  renderOptionsList,
  isDisabled = false,
  onDebounce = () => undefined,
  fieldName,
  validate = () => undefined,
  modalDescription = '',
  onUpdate = () => {},
}: LookupProps) {
  const { t } = useLingui();
  const location = useLocation();
  const navigate = useNavigate();
  const [typedText, setTypedText] = useState('');
  const debounceRequest = useDebounce(onDebounce, 1000);
  useField({
    name: fieldName,
    validate: (val) => {
      if (!multiple && !val && typedText && typedText !== '') {
        return t`That value was not found. Please enter or select a valid value.`;
      }
      return validate(val);
    },
  });

  // The field holds one item or a list of them, and the two are read apart
  // here: the text input and the chip list each want one of the two.
  const singleValue = Array.isArray(value) ? null : (value ?? null);
  const listValue: LookupItem[] = Array.isArray(value) ? value : [];
  const chipped: LookupItem[] = singleValue ? [singleValue] : [];
  const items: LookupItem[] = multiple ? listValue : chipped;

  const [state, dispatch] = useReducer(
    reducer,
    { value: value ?? null, multiple, required },
    initReducer
  );

  useEffect(() => {
    dispatch({ type: 'SET_MULTIPLE', value: multiple });
  }, [multiple]);

  useEffect(() => {
    dispatch({ type: 'SET_VALUE', value: value ?? null });
    const name = Array.isArray(value) ? null : value?.name;
    setTypedText(typeof name === 'string' ? name : '');
  }, [value, multiple]);

  useEffect(() => {
    if (!multiple) {
      setTypedText(
        state.selectedItems[0] ? (state.selectedItems[0].name as string) : ''
      );
    }
  }, [state.selectedItems, multiple]);

  const clearQSParams = () => {
    if (!location.search) {
      // This prevents "Warning: Hash history cannot PUSH the same path;
      // a new entry will not be added to the history stack" from appearing in the console.
      return;
    }
    const parts = location.search.replace(/^\?/, '').split('&');
    const ns = qsConfig.namespace;
    const otherParts = parts.filter((param) => !param.startsWith(`${ns}.`));
    navigate(`${location.pathname}?${otherParts.join('&')}`);
  };

  const save = () => {
    const { selectedItems } = state;
    if (multiple) {
      onChange(selectedItems);
    } else {
      onChange(selectedItems[0] || null);
    }
    clearQSParams();
    dispatch({ type: 'CLOSE_MODAL' });
  };

  const removeItem = (item: LookupItem) =>
    onChange((value as LookupItem[]).filter((i) => i.id !== item.id));

  const closeModal = () => {
    clearQSParams();
    dispatch({ type: 'CLOSE_MODAL' });
  };

  const onClick = () => {
    onUpdate();
    dispatch({ type: 'TOGGLE_MODAL' });
  };

  const { isModalOpen, selectedItems } = state;
  const canDelete =
    (!required || (multiple && items.length > 1)) && !isDisabled;

  return (
    <>
      <InputGroup onBlur={onBlur}>
        <InputGroupItem>
          <Button
            icon={<SearchIcon />}
            aria-label={t`Search`}
            id={`${id}-open`}
            ouiaId={`${id}-open`}
            onClick={onClick}
            variant={ButtonVariant.control}
            isDisabled={isLoading || isDisabled}
          />
        </InputGroupItem>
        {multiple ? (
          <InputGroupItem isFill>
            <ChipHolder
              $isDisabled={isDisabled}
              className="pf-v6-c-form-control"
            >
              <ChipGroup
                numChips={5}
                totalChips={items?.length ?? 0}
                ouiaId={`${id}-chips`}
              >
                {items.map((item: LookupItem) =>
                  renderItemChip?.({
                    item,
                    removeItem,
                    canDelete,
                  })
                )}
              </ChipGroup>
            </ChipHolder>
          </InputGroupItem>
        ) : (
          <InputGroupItem isFill>
            <TextInput
              id={id}
              ouiaId={`${id}-input`}
              value={typedText}
              onChange={(_event, inputValue) => {
                setTypedText(inputValue);
                if (singleValue?.name !== inputValue) {
                  debounceRequest(inputValue);
                }
              }}
              isDisabled={isLoading || isDisabled}
            />
          </InputGroupItem>
        )}
      </InputGroup>

      <Modal
        variant="large"
        title={t`Select ${header || t`Items`}`}
        aria-label={t`Lookup modal`}
        isOpen={isModalOpen}
        onClose={closeModal}
        description={state?.selectedItems?.length > 0 && modalDescription}
        ouiaId={`${id}-modal`}
        actions={[
          <Button
            ouiaId="modal-select-button"
            key="select"
            variant="primary"
            onClick={save}
            isDisabled={required && selectedItems.length === 0}
          >
            {t`Select`}
          </Button>,
          <Button
            ouiaId="modal-cancel-button"
            key="cancel"
            variant="link"
            onClick={closeModal}
            aria-label={t`Cancel lookup`}
          >
            {t`Cancel`}
          </Button>,
        ]}
      >
        {renderOptionsList({
          state,
          dispatch,
          canDelete,
        })}
      </Modal>
    </>
  );
}

export { Lookup as _Lookup };
export default Lookup;
