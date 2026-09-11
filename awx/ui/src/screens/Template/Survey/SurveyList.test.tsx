import type { ApiResponse } from 'api/Base';
import React from 'react';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { JobTemplatesAPI } from 'api';
import type { ResponseOf } from '../../../../testUtils/responseOf';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import SurveyList from './SurveyList';
import mockJobTemplateData from '../shared/data.job_template.json';

vi.mock('../../../api/models/JobTemplates');

const surveyData = {
  name: 'Survey',
  description: 'description for survey',
  spec: [
    { question_name: 'Foo', type: 'text', default: 'Bar', variable: 'foo' },
    { question_name: 'Bizz', type: 'text', default: 'bazz', variable: 'bizz' },
  ],
};

describe('<SurveyList />', () => {
  test('expect component to mount successfully', async () => {
    renderWithContexts(
      <SurveyList
        deleteSurvey={() => {}}
        updateSurvey={() => {}}
        survey={surveyData}
      />
    );
    await waitFor(() => expect(screen.getByText('Foo')).toBeInTheDocument());
  });

  test('should toggle survey', async () => {
    const toggleSurvey = vi.fn();
    vi.mocked(JobTemplatesAPI.update).mockResolvedValue(
      undefined as unknown as ApiResponse<unknown>
    );
    renderWithContexts(
      <SurveyList
        deleteSurvey={() => {}}
        updateSurvey={() => {}}
        survey={surveyData}
        surveyEnabled
        toggleSurvey={toggleSurvey}
      />
    );

    const toggle = screen.getByRole('switch', { name: 'Survey Toggle' });
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);
    await waitFor(() => expect(toggleSurvey).toHaveBeenCalled());
  });

  test('should select all and delete', async () => {
    const deleteSurvey = vi.fn();
    renderWithContexts(
      <SurveyList
        updateSurvey={() => {}}
        survey={surveyData}
        deleteSurvey={deleteSurvey}
        canEdit
      />
    );

    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    expect(deleteButton).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Edit Order' })
    ).toBeInTheDocument();

    const selectAll = screen.getByRole('checkbox', { name: 'Select all' });
    expect(selectAll).not.toBeChecked();

    fireEvent.click(selectAll);
    await waitFor(() => expect(selectAll).toBeChecked());
    expect(deleteButton).not.toBeDisabled();

    fireEvent.click(deleteButton);

    const confirmButton = await screen.findByRole('button', {
      name: 'confirm delete',
    });
    fireEvent.click(confirmButton);
    await waitFor(() => expect(deleteSurvey).toHaveBeenCalled());
  });

  test('should render Edit Order button', async () => {
    renderWithContexts(
      <SurveyList
        deleteSurvey={() => {}}
        updateSurvey={() => {}}
        survey={surveyData}
        canEdit
      />
    );
    expect(
      await screen.findByRole('button', { name: 'Edit Order' })
    ).toBeInTheDocument();
  });

  test('Edit Order button should render Modal', async () => {
    renderWithContexts(
      <SurveyList
        deleteSurvey={() => {}}
        updateSurvey={() => {}}
        survey={surveyData}
        canEdit
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Order' }));

    const modal = await screen.findByRole('dialog');
    expect(
      within(modal).getByRole('heading', { name: 'Survey Question Order' })
    ).toBeInTheDocument();
  });

  test('Modal close button should close modal', async () => {
    renderWithContexts(
      <SurveyList
        deleteSurvey={() => {}}
        updateSurvey={() => {}}
        survey={surveyData}
        canEdit
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit Order' }));

    const modal = await screen.findByRole('dialog');
    expect(
      within(modal).getByRole('heading', { name: 'Survey Question Order' })
    ).toBeInTheDocument();

    fireEvent.click(within(modal).getByRole('button', { name: 'Close' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  });

  test('user without edit/delete permission cannot delete', async () => {
    const deleteSurvey = vi.fn();
    renderWithContexts(
      <SurveyList
        updateSurvey={() => {}}
        survey={surveyData}
        deleteSurvey={deleteSurvey}
      />
    );

    expect(screen.getByRole('checkbox', { name: 'Select all' })).toBeDisabled();
    expect(
      screen.getByRole('switch', { name: 'Survey Toggle' })
    ).toBeDisabled();
    // Add and Delete toolbar buttons are disabled without edit permission.
    // The Add control is a PF Button rendered as a link (aria-disabled).
    expect(screen.getByRole('link', { name: 'Add' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});

describe('Survey with no questions', () => {
  test('Survey with no questions renders empty state', async () => {
    vi.mocked(JobTemplatesAPI.readSurvey).mockResolvedValue(
      {} as unknown as ResponseOf<typeof JobTemplatesAPI.readSurvey>
    );
    renderWithContexts(
      <SurveyList
        deleteSurvey={() => {}}
        updateSurvey={() => {}}
        template={mockJobTemplateData}
      />
    );

    expect(
      await screen.findByText('No survey questions found.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Foo')).not.toBeInTheDocument();
  });
});
