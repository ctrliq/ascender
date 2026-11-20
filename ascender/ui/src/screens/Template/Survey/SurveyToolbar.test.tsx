import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import SurveyToolbar from './SurveyToolbar';

vi.mock('../../../api/models/JobTemplates');

describe('<SurveyToolbar />', () => {
  test('delete Button is disabled', () => {
    renderWithContexts(
      <SurveyToolbar
        isDeleteDisabled
        onSelectAll={vi.fn()}
        isAllSelected
        onToggleDeleteModal={vi.fn()}
        onToggleSurvey={vi.fn()}
        canEdit={false}
      />
    );

    const deleteButton = document.querySelector(
      '[data-ouia-component-id="survey-delete-button"]'
    );
    expect(deleteButton).toBeInTheDocument();
    expect(deleteButton).toBeDisabled();
    expect(
      document.querySelector('[data-ouia-component-id="edit-order"]')
    ).not.toBeInTheDocument();
  });

  test('delete Button is enabled and Edit order button is rendered', () => {
    renderWithContexts(
      <SurveyToolbar
        isDeleteDisabled={false}
        onSelectAll={vi.fn()}
        isAllSelected
        onToggleDeleteModal={vi.fn()}
        onToggleSurvey={vi.fn()}
        onOpenOrderModal={vi.fn()}
        canEdit
      />
    );

    expect(screen.getByLabelText('Select all')).toBeChecked();

    const deleteButton = document.querySelector(
      '[data-ouia-component-id="survey-delete-button"]'
    );
    expect(deleteButton).toBeInTheDocument();
    expect(deleteButton).not.toBeDisabled();
    expect(
      document.querySelector('[data-ouia-component-id="edit-order"]')
    ).toBeInTheDocument();
  });

  test('switch is off', () => {
    renderWithContexts(
      <SurveyToolbar
        onToggleDeleteModal={() => {}}
        surveyEnabled={false}
        isDeleteDisabled={false}
        onSelectAll={vi.fn()}
        isAllSelected
        onToggleDelete={vi.fn()}
        onToggleSurvey={vi.fn()}
      />
    );

    const switchInput = screen.getByLabelText('Survey Toggle');
    expect(switchInput).toBeInTheDocument();
    expect(switchInput).not.toBeChecked();
    // PF6 has no off label, so the label itself has to follow the state.
    expect(screen.getByText('Survey Disabled')).toBeInTheDocument();
    expect(screen.queryByText('Survey Enabled')).not.toBeInTheDocument();
  });

  test('switch is on', () => {
    renderWithContexts(
      <SurveyToolbar
        onToggleDeleteModal={() => {}}
        surveyEnabled
        isDeleteDisabled={false}
        onSelectAll={vi.fn()}
        isAllSelected
        onToggleDelete={vi.fn()}
        onToggleSurvey={vi.fn()}
      />
    );

    const switchInput = screen.getByLabelText('Survey Toggle');
    expect(switchInput).toBeInTheDocument();
    expect(switchInput).toBeChecked();
    expect(screen.getByText('Survey Enabled')).toBeInTheDocument();
  });

  test('all action buttons in toolbar are disabled', () => {
    renderWithContexts(
      <SurveyToolbar
        onToggleDeleteModal={() => {}}
        surveyEnabled
        isDeleteDisabled={false}
        onSelectAll={vi.fn()}
        isAllSelected
        onToggleDelete={vi.fn()}
        onToggleSurvey={vi.fn()}
        canEdit={false}
      />
    );

    expect(screen.getByLabelText('Select all')).toBeDisabled();
    expect(screen.getByLabelText('Survey Toggle')).toBeDisabled();

    // Add is left out rather than disabled, as on the other lists.
    expect(screen.queryByText('Add')).not.toBeInTheDocument();

    const deleteButton = document.querySelector(
      '[data-ouia-component-id="survey-delete-button"]'
    );
    expect(deleteButton).toBeInTheDocument();
    expect(deleteButton).toBeDisabled();
    expect(
      document.querySelector('[data-ouia-component-id="edit-order"]')
    ).not.toBeInTheDocument();
  });

  test('Delete tooltip gives the permission as the reason', async () => {
    const { user } = renderWithContexts(
      <SurveyToolbar
        onToggleDeleteModal={() => {}}
        surveyEnabled
        isDeleteDisabled
        onSelectAll={vi.fn()}
        isAllSelected={false}
        onToggleSurvey={vi.fn()}
        canEdit={false}
      />
    );

    await user.hover(
      screen.getByRole('button', { name: 'Delete' }).parentElement!
    );
    expect(
      await screen.findByText(
        'You do not have permission to delete survey questions'
      )
    ).toBeInTheDocument();
  });

  // Named as the Add Question beside them is, for what they act on.
  test('says Delete Questions and Edit Question Order', async () => {
    const { user } = renderWithContexts(
      <SurveyToolbar
        onToggleDeleteModal={() => {}}
        surveyEnabled
        isDeleteDisabled={false}
        onSelectAll={vi.fn()}
        isAllSelected={false}
        onToggleSurvey={vi.fn()}
        onOpenOrderModal={vi.fn()}
        canEdit
      />
    );

    await user.hover(
      screen.getByRole('button', { name: 'Delete' }).parentElement!
    );
    expect(await screen.findByText('Delete Questions')).toBeInTheDocument();
    await user.hover(screen.getByRole('button', { name: 'Edit Order' }));
    expect(await screen.findByText('Edit Question Order')).toBeInTheDocument();
  });

  test('clicking buttons fires handlers', () => {
    const onToggleDeleteModal = vi.fn();
    const onOpenOrderModal = vi.fn();
    const onToggleSurvey = vi.fn();
    const onSelectAll = vi.fn();
    renderWithContexts(
      <SurveyToolbar
        surveyEnabled={false}
        isDeleteDisabled={false}
        onSelectAll={onSelectAll}
        isAllSelected={false}
        onToggleDeleteModal={onToggleDeleteModal}
        onToggleSurvey={onToggleSurvey}
        onOpenOrderModal={onOpenOrderModal}
        canEdit
      />
    );

    fireEvent.click(
      document.querySelector('[data-ouia-component-id="survey-delete-button"]')!
    );
    expect(onToggleDeleteModal).toHaveBeenCalledWith(true);

    fireEvent.click(
      document.querySelector('[data-ouia-component-id="edit-order"]')!
    );
    expect(onOpenOrderModal).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Survey Toggle'));
    expect(onToggleSurvey).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByLabelText('Select all'));
    expect(onSelectAll).toHaveBeenCalledWith(true);
  });
});
