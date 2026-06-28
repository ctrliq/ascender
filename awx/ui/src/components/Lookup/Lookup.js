import React, { useReducer, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useField } from 'formik';
import { SearchIcon } from '@patternfly/react-icons';
import {
	Label, Button,
	ButtonVariant,
	InputGroup,
	TextInput,
	InputGroupItem
} from '@patternfly/react-core';
import {

	Modal
} from '@patternfly/react-core/deprecated';
import { useLingui } from '@lingui/react/macro';
import styled from 'styled-components';
import useDebounce from 'hooks/useDebounce';
import ChipGroup from '../ChipGroup';
import reducer, { initReducer } from './shared/reducer';

const ChipHolder = styled.div`
  --pf-v6-c-form-control--Height: auto;
  min-height: 37px;
  display: flex;
  align-items: center;
  background-color: ${(props) =>
    props.$isDisabled ? "var(--pf-t--global--text--color--disabled)" : null};
`;
function Lookup({
  id = 'lookup-search',
  header = null,
  onChange,
  onBlur = () => {},
  isLoading,
  value = null,
  multiple = false,
  required = false,
  qsConfig,
  renderItemChip = ({ item, removeItem }) => (
    <Label variant="outline" key={item.id} onClose={() => removeItem(item)} >
      {item.name}
    </Label>
  ),
  renderOptionsList,
  isDisabled = false,
  onDebounce = () => undefined,
  fieldName,
  validate = () => undefined,
  modalDescription = '',
  onUpdate = () => {},
}) {
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

  const [state, dispatch] = useReducer(
    reducer,
    { value, multiple, required },
    initReducer
  );

  useEffect(() => {
    dispatch({ type: 'SET_MULTIPLE', value: multiple });
  }, [multiple]);

  useEffect(() => {
    dispatch({ type: 'SET_VALUE', value });
    if (value?.name) {
      setTypedText(value.name);
    } else {
      setTypedText('');
    }
  }, [value, multiple]);

  useEffect(() => {
    if (!multiple) {
      setTypedText(state.selectedItems[0] ? state.selectedItems[0].name : '');
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

  const removeItem = (item) => onChange(value.filter((i) => i.id !== item.id));

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
    (!required || (multiple && value.length > 1)) && !isDisabled;
  let items = [];
  if (multiple) {
    items = value;
  } else if (value) {
    items.push(value);
  }

  return (
    <>
      <InputGroup onBlur={onBlur}>
        <InputGroupItem><Button icon={<SearchIcon />}
          aria-label={t`Search`}
          id={`${id}-open`}
          ouiaId={`${id}-open`}
          onClick={onClick}
          variant={ButtonVariant.control}
          isDisabled={isLoading || isDisabled}
         /></InputGroupItem>
        {multiple ? (
          <InputGroupItem isFill><ChipHolder $isDisabled={isDisabled} className="pf-v6-c-form-control">
            <ChipGroup
              numChips={5}
              totalChips={items.length}
              ouiaId={`${id}-chips`}
            >
              {items.map((item) =>
                renderItemChip({
                  item,
                  removeItem,
                  canDelete,
                })
              )}
            </ChipGroup>
          </ChipHolder></InputGroupItem>
        ) : (
          <InputGroupItem isFill><TextInput
            id={id}
            ouiaId={`${id}-input`}
            value={typedText}
            onChange={(_event, inputValue) => {
              setTypedText(inputValue);
              if (value?.name !== inputValue) {
                debounceRequest(inputValue);
              }
            }}
            isDisabled={isLoading || isDisabled}
          /></InputGroupItem>
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
