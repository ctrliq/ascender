import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import SurveyToolbar from './SurveyToolbar';

jest.mock('../../../api/models/JobTemplates');

describe('<SurveyToolbar />', () => {
  test('delete Button is disabled', () => {
    renderWithContexts(
      <SurveyToolbar
        isDeleteDisabled
        onSelectAll={jest.fn()}
        isAllSelected
        onToggleDeleteModal={jest.fn()}
        onToggleSurvey={jest.fn()}
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
        onSelectAll={jest.fn()}
        isAllSelected
        onToggleDeleteModal={jest.fn()}
        onToggleSurvey={jest.fn()}
        onOpenOrderModal={jest.fn()}
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
        surveyEnabled={false}
        isDeleteDisabled={false}
        onSelectAll={jest.fn()}
        isAllSelected
        onToggleDelete={jest.fn()}
        onToggleSurvey={jest.fn()}
      />
    );

    const switchInput = screen.getByLabelText('Survey Toggle');
    expect(switchInput).toBeInTheDocument();
    expect(switchInput).not.toBeChecked();
  });

  test('switch is on', () => {
    renderWithContexts(
      <SurveyToolbar
        surveyEnabled
        isDeleteDisabled={false}
        onSelectAll={jest.fn()}
        isAllSelected
        onToggleDelete={jest.fn()}
        onToggleSurvey={jest.fn()}
      />
    );

    const switchInput = screen.getByLabelText('Survey Toggle');
    expect(switchInput).toBeInTheDocument();
    expect(switchInput).toBeChecked();
  });

  test('all action buttons in toolbar are disabled', () => {
    renderWithContexts(
      <SurveyToolbar
        surveyEnabled
        isDeleteDisabled={false}
        onSelectAll={jest.fn()}
        isAllSelected
        onToggleDelete={jest.fn()}
        onToggleSurvey={jest.fn()}
        canEdit={false}
      />
    );

    expect(screen.getByLabelText('Select all')).toBeDisabled();
    expect(screen.getByLabelText('Survey Toggle')).toBeDisabled();

    // ToolbarAddButton renders as a disabled link (aria-disabled) labelled "Add".
    const addButton = screen.getByText('Add').closest('a, button');
    expect(addButton).toBeInTheDocument();
    expect(addButton).toHaveAttribute('aria-disabled', 'true');

    const deleteButton = document.querySelector(
      '[data-ouia-component-id="survey-delete-button"]'
    );
    expect(deleteButton).toBeInTheDocument();
    expect(deleteButton).toBeDisabled();
    expect(
      document.querySelector('[data-ouia-component-id="edit-order"]')
    ).not.toBeInTheDocument();
  });

  test('clicking buttons fires handlers', () => {
    const onToggleDeleteModal = jest.fn();
    const onOpenOrderModal = jest.fn();
    const onToggleSurvey = jest.fn();
    const onSelectAll = jest.fn();
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
      document.querySelector('[data-ouia-component-id="survey-delete-button"]')
    );
    expect(onToggleDeleteModal).toHaveBeenCalledWith(true);

    fireEvent.click(
      document.querySelector('[data-ouia-component-id="edit-order"]')
    );
    expect(onOpenOrderModal).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Survey Toggle'));
    expect(onToggleSurvey).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByLabelText('Select all'));
    expect(onSelectAll).toHaveBeenCalledWith(true);
  });
});
