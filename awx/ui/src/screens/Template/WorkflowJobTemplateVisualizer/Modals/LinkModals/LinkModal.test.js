import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import { renderWithContexts } from '../../../../../../testUtils/rtlContexts';
import LinkModal from './LinkModal';

const dispatch = jest.fn();
const onConfirm = jest.fn();

describe('LinkModal', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Adding new link', () => {
    beforeEach(() => {
      renderWithContexts(
        <WorkflowDispatchContext.Provider value={dispatch}>
          <WorkflowStateContext.Provider
            value={{
              linkToEdit: null,
            }}
          >
            <LinkModal header="TEST" onConfirm={onConfirm} />
          </WorkflowStateContext.Provider>
        </WorkflowDispatchContext.Provider>
      );
    });

    test('Dropdown defaults to success when adding new link', () => {
      // AnsibleSelect renders a native <select id="link-select">.
      expect(document.querySelector('#link-select').value).toBe('success');
    });

    test('Cancel button dispatches as expected', () => {
      fireEvent.click(document.querySelector('button#link-cancel'));
      expect(dispatch).toHaveBeenCalledWith({
        type: 'CANCEL_LINK_MODAL',
      });
    });

    test('Close button dispatches as expected', () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(dispatch).toHaveBeenCalledWith({
        type: 'CANCEL_LINK_MODAL',
      });
    });

    test('Confirm button passes callback correct link type after changing dropdown', () => {
      fireEvent.change(document.querySelector('#link-select'), {
        target: { value: 'always' },
      });
      fireEvent.click(document.querySelector('button#link-confirm'));
      expect(onConfirm).toHaveBeenCalledWith('always');
    });
  });

  describe('Editing existing link', () => {
    test('Dropdown defaults to existing link type when editing link', () => {
      renderWithContexts(
        <WorkflowDispatchContext.Provider value={dispatch}>
          <WorkflowStateContext.Provider
            value={{
              linkToEdit: {
                source: {
                  id: 2,
                },
                target: {
                  id: 3,
                },
                linkType: 'failure',
              },
            }}
          >
            <LinkModal header="TEST" onConfirm={onConfirm} />
          </WorkflowStateContext.Provider>
        </WorkflowDispatchContext.Provider>
      );
      expect(document.querySelector('#link-select').value).toBe('failure');
    });
  });
});
