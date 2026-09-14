import type { SelectableOption } from 'types/api';

// A row a lookup holds is the same thing every selector works with, which is
// declared once with the api types.
export type LookupItem = SelectableOption;
export type { SelectableOption };

/**
 * What a lookup holds while its modal is open.
 *
 * `value` is the field's committed value, `selectedItems` what the modal has
 * ticked but not yet saved: closing the modal without saving discards the
 * latter and reopening seeds it from the former again.
 */
export interface LookupState {
  value: LookupItem | LookupItem[] | null;
  selectedItems: LookupItem[];
  multiple: boolean;
  required: boolean;
  isModalOpen: boolean;
}

/** Everything the lookup's modal dispatches. */
export type LookupAction =
  | { type: 'SELECT_ITEM'; item: LookupItem }
  | { type: 'DESELECT_ITEM'; item: LookupItem }
  | { type: 'TOGGLE_MODAL' }
  | { type: 'CLOSE_MODAL' }
  | { type: 'SET_MULTIPLE'; value: boolean }
  | { type: 'SET_VALUE'; value: LookupItem | LookupItem[] | null }
  | { type: 'SET_SELECTED_ITEMS'; selectedItems: LookupItem[] };

export default function reducer(
  state: LookupState,
  action: LookupAction
): LookupState {
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
      // The union above covers every case, so this is only reachable from a
      // dispatch the type checker did not see, such as one out of a .js file.
      throw new Error(
        `Unrecognized action type: ${(action as LookupAction).type}`
      );
  }
}

function selectItem(state: LookupState, item: LookupItem): LookupState {
  const { selectedItems, multiple } = state;
  if (!multiple) {
    return {
      ...state,
      selectedItems: [item],
    };
  }
  const index = selectedItems.findIndex((i) => i.id === item.id);
  if (index > -1) {
    return state;
  }
  return {
    ...state,
    selectedItems: [...selectedItems, item],
  };
}

function deselectItem(state: LookupState, item: LookupItem): LookupState {
  return {
    ...state,
    selectedItems: state.selectedItems.filter((i) => i.id !== item.id),
  };
}

function toggleModal(state: LookupState): LookupState {
  const { isModalOpen, value, multiple } = state;
  if (isModalOpen) {
    return closeModal(state);
  }
  let selectedItems: LookupItem[] = [];
  if (multiple) {
    selectedItems = [...((value ?? []) as LookupItem[])];
  } else if (value) {
    selectedItems.push(value as LookupItem);
  }
  return {
    ...state,
    isModalOpen: !isModalOpen,
    selectedItems,
  };
}

function closeModal(state: LookupState): LookupState {
  return {
    ...state,
    isModalOpen: false,
  };
}

export interface InitReducerProps {
  /** The field's current value: an array when multiple is set, or one item. */
  value: LookupItem | LookupItem[] | null;
  multiple?: boolean;
  required?: boolean;
  [key: string]: unknown;
}

export function initReducer({
  value,
  multiple = false,
  required = false,
}: InitReducerProps): LookupState {
  assertCorrectValueType(value, multiple);
  let selectedItems: LookupItem[] = [];
  if (value) {
    selectedItems = multiple
      ? [...(value as LookupItem[])]
      : [value as LookupItem];
  }
  return {
    selectedItems,
    value,
    multiple,
    isModalOpen: false,
    required,
  };
}

function assertCorrectValueType(value: unknown, multiple: boolean) {
  if (!multiple && Array.isArray(value)) {
    throw new Error(
      'Lookup value must not be an array unless `multiple` is set'
    );
  }
  if (multiple && !Array.isArray(value)) {
    throw new Error('Lookup value must be an array if `multiple` is set');
  }
}
