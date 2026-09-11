import type { Untyped } from 'types/api';

export default function reducer(
  state: Record<string, unknown>,
  action: Untyped
) {
  switch (action.type) {
    case 'SELECT_ITEM':
      return selectItem(state, action.item);
    case 'DESELECT_ITEM':
      return deselectItem(state, action.item);
    case 'TOGGLE_MODAL':
      return toggleModal(state);
    case 'CLOSE_MODAL':
      return closeModal(state);
    case 'SET_MULTIPLE':
      return { ...state, multiple: action.value };
    case 'SET_VALUE':
      return { ...state, value: action.value };
    case 'SET_SELECTED_ITEMS':
      return { ...state, selectedItems: action.selectedItems };
    default:
      throw new Error(`Unrecognized action type: ${action.type}`);
  }
}

function selectItem(
  state: Record<string, unknown>,
  item: Record<string, unknown>
) {
  const { selectedItems, multiple } = state;
  if (!multiple) {
    return {
      ...state,
      selectedItems: [item],
    };
  }
  const index = selectedItems.findIndex((i: number) => i.id === item.id);
  if (index > -1) {
    return state;
  }
  return {
    ...state,
    selectedItems: [...selectedItems, item],
  };
}

function deselectItem(
  state: Record<string, unknown>,
  item: Record<string, unknown>
) {
  return {
    ...state,
    selectedItems: state.selectedItems.filter((i: number) => i.id !== item.id),
  };
}

function toggleModal(state: Record<string, unknown>) {
  const { isModalOpen, value, multiple } = state;
  if (isModalOpen) {
    return closeModal(state);
  }
  let selectedItems: Untyped[] = [];
  if (multiple) {
    selectedItems = [...value];
  } else if (value) {
    selectedItems.push(value);
  }
  return {
    ...state,
    isModalOpen: !isModalOpen,
    selectedItems,
  };
}

function closeModal(state: Record<string, unknown>) {
  return {
    ...state,
    isModalOpen: false,
  };
}

export interface InitReducerProps {
  value: Untyped;
  multiple?: boolean;
  required?: boolean;
  [key: string]: unknown;
}

export function initReducer({
  value,
  multiple = false,
  required = false,
}: InitReducerProps) {
  assertCorrectValueType(value, multiple);
  let selectedItems = [];
  if (value) {
    selectedItems = multiple ? [...value] : [value];
  }
  return {
    selectedItems,
    value,
    multiple,
    isModalOpen: false,
    required,
  };
}

function assertCorrectValueType(value: unknown, multiple: unknown) {
  if (!multiple && Array.isArray(value)) {
    throw new Error(
      'Lookup value must not be an array unless `multiple` is set'
    );
  }
  if (multiple && !Array.isArray(value)) {
    throw new Error('Lookup value must be an array if `multiple` is set');
  }
}
