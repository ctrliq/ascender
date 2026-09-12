import type { Untyped } from 'types/api';
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import {
  WorkflowDispatchContext,
  WorkflowStateContext,
} from 'contexts/Workflow';
import { renderWithContexts } from '../../../../../../testUtils/rtlContexts';
import LinkModal from './LinkModal';
import type { WorkflowState } from '../../../../../components/Workflow/workflowReducer';

const dispatch = vi.fn();
const onConfirm = vi.fn();

describe('LinkModal', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Adding new link', () => {
    beforeEach(() => {
      renderWithContexts(
        <WorkflowDispatchContext.Provider value={dispatch}>
          <WorkflowStateContext.Provider
            value={
              {
                linkToEdit: null,
              } as unknown as WorkflowState
            }
          >
            <LinkModal header="TEST" onConfirm={onConfirm} />
          </WorkflowStateContext.Provider>
        </WorkflowDispatchContext.Provider>
      );
    });

    test('Dropdown defaults to success when adding new link', () => {
      // AnsibleSelect renders a native <select id="link-select">.
      expect(
        (document.querySelector('#link-select')! as HTMLInputElement).value
      ).toBe('success');
    });

    test('Cancel button dispatches as expected', () => {
      fireEvent.click(document.querySelector('button#link-cancel')!);
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
      fireEvent.change(document.querySelector('#link-select')!, {
        target: { value: 'always' },
      });
      fireEvent.click(document.querySelector('button#link-confirm')!);
      expect(onConfirm).toHaveBeenCalledWith('always', undefined);
    });

    test('Condition fields shown and passed to callback when selecting condition', () => {
      fireEvent.change(document.querySelector('#link-select')!, {
        target: { value: 'condition' },
      });
      const artifactKeyInput = document.querySelector(
        '#link-condition-artifact-key'
      ) as Untyped;
      expect(artifactKeyInput).not.toBeNull();
      // save is disabled until an artifact key is provided
      expect(
        (document.querySelector('button#link-confirm')! as HTMLInputElement)
          .disabled
      ).toBe(true);
      fireEvent.change(artifactKeyInput, {
        target: { value: 'environment' },
      });
      fireEvent.change(
        document.querySelector('#link-condition-expected-value')!,
        {
          target: { value: 'production' },
        }
      );
      fireEvent.click(document.querySelector('button#link-confirm')!);
      expect(onConfirm).toHaveBeenCalledWith('condition', {
        trigger: 'success',
        artifact_key: 'environment',
        operator: 'eq',
        expected_value: 'production',
      });
    });
  });

  describe('Editing existing link', () => {
    test('Dropdown defaults to existing link type when editing link', () => {
      renderWithContexts(
        <WorkflowDispatchContext.Provider value={dispatch}>
          <WorkflowStateContext.Provider
            value={
              {
                linkToEdit: {
                  source: {
                    id: 2,
                  },
                  target: {
                    id: 3,
                  },
                  linkType: 'failure',
                },
              } as unknown as WorkflowState
            }
          >
            <LinkModal header="TEST" onConfirm={onConfirm} />
          </WorkflowStateContext.Provider>
        </WorkflowDispatchContext.Provider>
      );
      expect(
        (document.querySelector('#link-select')! as HTMLInputElement).value
      ).toBe('failure');
    });
  });
});
