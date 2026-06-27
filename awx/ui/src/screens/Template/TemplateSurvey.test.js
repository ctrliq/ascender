import React from 'react';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';

import { Routes, Route } from 'routerCompat';
import { createMemoryHistory } from 'history';
import { JobTemplatesAPI, WorkflowJobTemplatesAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import TemplateSurvey from './TemplateSurvey';
import mockJobTemplateData from './shared/data.job_template.json';
import mockWorkflowJobTemplateData from './shared/data.workflow_job_template.json';

jest.mock('../../api/models/JobTemplates');
jest.mock('../../api/models/WorkflowJobTemplates');

const surveyData = {
  name: 'Survey',
  description: 'description for survey',
  spec: [
    { question_name: 'Foo', type: 'text', default: 'Bar', variable: 'foo' },
  ],
};

// TemplateSurvey is a v6 descendant screen mounted by Template at
// `.../:id/survey/*`, so mount it under the same real v6 route here (its child
// routes are relative; the SurveyList is the index route). The template id used
// by the API comes from the `template` prop, not the route param.
function renderSurvey(url, element) {
  const history = createMemoryHistory({ initialEntries: [url] });
  return renderWithContexts(
    <Routes>
      <Route path="/templates/:templateType/:id/survey/*" element={element} />
    </Routes>,
    { context: { router: { history } } }
  );
}

describe('<TemplateSurvey />', () => {
  beforeEach(() => {
    JobTemplatesAPI.readSurvey.mockResolvedValue({
      data: surveyData,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should fetch survey from API', async () => {
    renderSurvey(
      '/templates/job_template/7/survey',
      <TemplateSurvey template={mockJobTemplateData} canEdit />
    );
    await waitFor(() =>
      expect(JobTemplatesAPI.readSurvey).toHaveBeenCalledWith(7)
    );
    // The fetched survey is passed to SurveyList, which renders its question.
    expect(await screen.findByText('Foo')).toBeInTheDocument();
  });

  test('should display error in retrieving survey', async () => {
    JobTemplatesAPI.readSurvey.mockRejectedValue(new Error());
    renderSurvey(
      '/templates/job_template/7/survey',
      <TemplateSurvey template={{ ...mockJobTemplateData, id: 'a' }} />
    );
    // ContentError renders a 'Something went wrong' heading.
    expect(
      await screen.findByText('Something went wrong...')
    ).toBeInTheDocument();
  });

  test('should update API with survey changes', async () => {
    // Invoking SurveyList's `updateSurvey` prop directly with an arbitrary
    // 2-item spec has no DOM path that builds that exact array,
    // so this drives the same wiring (SurveyList.updateSurvey ->
    // TemplateSurvey.updateSurveySpec -> JobTemplatesAPI.updateSurvey) through a
    // partial delete: a 2-question survey with one question selected, on confirm,
    // calls updateSurvey with the surviving spec. NOTE: the asserted spec is
    // derived from real UI input.
    const twoQuestionSurvey = {
      name: 'Survey',
      description: 'description for survey',
      spec: [
        { question_name: 'Foo', type: 'text', default: 'One', variable: 'foo' },
        { question_name: 'Bar', type: 'text', default: 'Two', variable: 'bar' },
      ],
    };
    JobTemplatesAPI.readSurvey.mockResolvedValue({ data: twoQuestionSurvey });
    JobTemplatesAPI.updateSurvey.mockResolvedValue();
    renderSurvey(
      '/templates/job_template/7/survey',
      <TemplateSurvey template={mockJobTemplateData} canEdit />
    );

    // select only the first question (Foo)
    const fooRow = (await screen.findByText('Foo')).closest('tr');
    fireEvent.click(within(fooRow).getByRole('checkbox'));

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );

    await waitFor(() =>
      expect(JobTemplatesAPI.updateSurvey).toHaveBeenCalledWith(7, {
        name: 'Survey',
        description: 'description for survey',
        spec: [
          {
            question_name: 'Bar',
            type: 'text',
            default: 'Two',
            variable: 'bar',
          },
        ],
      })
    );
  });

  test('should toggle jt survey on', async () => {
    renderSurvey(
      '/templates/job_template/7/survey',
      <TemplateSurvey template={mockJobTemplateData} canEdit />
    );
    const toggle = await screen.findByRole('switch', {
      name: 'Survey Toggle',
    });
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(JobTemplatesAPI.update).toHaveBeenCalledWith(7, {
        survey_enabled: false,
      })
    );
  });

  test('should toggle wfjt survey on', async () => {
    WorkflowJobTemplatesAPI.readSurvey.mockResolvedValueOnce({
      data: surveyData,
    });
    renderSurvey(
      '/templates/workflow_job_template/15/survey',
      <TemplateSurvey template={mockWorkflowJobTemplateData} canEdit />
    );
    const toggle = await screen.findByRole('switch', {
      name: 'Survey Toggle',
    });
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(WorkflowJobTemplatesAPI.update).toHaveBeenCalledWith(15, {
        survey_enabled: false,
      })
    );
  });

  test('should successfully delete jt survey', async () => {
    JobTemplatesAPI.readSurvey.mockResolvedValueOnce({
      data: surveyData,
    });
    renderSurvey(
      '/templates/job_template/7/survey',
      <TemplateSurvey template={mockJobTemplateData} canEdit />
    );
    const selectAll = await screen.findByRole('checkbox', {
      name: 'Select all',
    });
    fireEvent.click(selectAll);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );
    await waitFor(() =>
      expect(JobTemplatesAPI.destroySurvey).toHaveBeenCalledWith(7)
    );
    expect(WorkflowJobTemplatesAPI.destroySurvey).toHaveBeenCalledTimes(0);
  });

  test('should successfully delete wfjt survey', async () => {
    WorkflowJobTemplatesAPI.readSurvey.mockResolvedValueOnce({
      data: surveyData,
    });
    renderSurvey(
      '/templates/workflow_job_template/15/survey',
      <TemplateSurvey template={mockWorkflowJobTemplateData} canEdit />
    );
    const selectAll = await screen.findByRole('checkbox', {
      name: 'Select all',
    });
    fireEvent.click(selectAll);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'confirm delete' })
    );
    await waitFor(() =>
      expect(WorkflowJobTemplatesAPI.destroySurvey).toHaveBeenCalledWith(15)
    );
    expect(JobTemplatesAPI.destroySurvey).toHaveBeenCalledTimes(0);
  });
});
