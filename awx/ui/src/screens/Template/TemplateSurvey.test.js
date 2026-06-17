import React from 'react';
import { act } from 'react-dom/test-utils';

import { Routes, Route } from 'react-router-dom-v5-compat';
import { createMemoryHistory } from 'history';
import { JobTemplatesAPI, WorkflowJobTemplatesAPI } from 'api';
import { mountWithContexts } from '../../../testUtils/enzymeHelpers';
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
async function mountSurvey(url, element) {
  const history = createMemoryHistory({ initialEntries: [url] });
  let wrapper;
  await act(async () => {
    wrapper = mountWithContexts(
      <Routes>
        <Route path="/templates/:templateType/:id/survey/*" element={element} />
      </Routes>,
      { context: { router: { history } } }
    );
  });
  wrapper.update();
  return wrapper;
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
    const wrapper = await mountSurvey(
      '/templates/job_template/7/survey',
      <TemplateSurvey template={mockJobTemplateData} canEdit />
    );
    expect(JobTemplatesAPI.readSurvey).toHaveBeenCalledWith(7);
    expect(wrapper.find('SurveyList').prop('survey')).toEqual(surveyData);
  });

  test('should display error in retrieving survey', async () => {
    JobTemplatesAPI.readSurvey.mockRejectedValue(new Error());
    const wrapper = await mountSurvey(
      '/templates/job_template/7/survey',
      <TemplateSurvey template={{ ...mockJobTemplateData, id: 'a' }} />
    );
    expect(wrapper.find('ContentError').length).toBe(1);
  });

  test('should update API with survey changes', async () => {
    const wrapper = await mountSurvey(
      '/templates/job_template/7/survey',
      <TemplateSurvey template={mockJobTemplateData} canEdit />
    );

    await act(async () => {
      await wrapper.find('SurveyList').invoke('updateSurvey')([
        { question_name: 'Foo', type: 'text', default: 'One', variable: 'foo' },
        { question_name: 'Bar', type: 'text', default: 'Two', variable: 'bar' },
      ]);
    });
    expect(JobTemplatesAPI.updateSurvey).toHaveBeenCalledWith(7, {
      name: 'Survey',
      description: 'description for survey',
      spec: [
        { question_name: 'Foo', type: 'text', default: 'One', variable: 'foo' },
        { question_name: 'Bar', type: 'text', default: 'Two', variable: 'bar' },
      ],
    });
  });

  test('should toggle jt survery on', async () => {
    const wrapper = await mountSurvey(
      '/templates/job_template/7/survey',
      <TemplateSurvey template={mockJobTemplateData} canEdit />
    );
    await act(() =>
      wrapper.find('Switch[aria-label="Survey Toggle"]').prop('onChange')()
    );
    wrapper.update();

    expect(JobTemplatesAPI.update).toHaveBeenCalledWith(7, {
      survey_enabled: false,
    });
  });

  test('should toggle wfjt survey on', async () => {
    WorkflowJobTemplatesAPI.readSurvey.mockResolvedValueOnce({
      data: surveyData,
    });
    const wrapper = await mountSurvey(
      '/templates/workflow_job_template/15/survey',
      <TemplateSurvey template={mockWorkflowJobTemplateData} canEdit />
    );
    await act(() =>
      wrapper.find('Switch[aria-label="Survey Toggle"]').prop('onChange')()
    );

    wrapper.update();
    expect(WorkflowJobTemplatesAPI.update).toHaveBeenCalledWith(15, { survey_enabled: false });
  });

  test('should successfully delete jt survey', async () => {
    JobTemplatesAPI.readSurvey.mockResolvedValueOnce({
      data: surveyData,
    });
    const wrapper = await mountSurvey(
      '/templates/job_template/7/survey',
      <TemplateSurvey template={mockJobTemplateData} canEdit />
    );
    act(() => wrapper.find('Checkbox#select-all').invoke('onChange')(true));
    wrapper.update();
    wrapper.find('Button[ouiaId="survey-delete-button"]').simulate('click');
    wrapper.update();
    await act(async () =>
      wrapper.find('Button[ouiaId="delete-confirm-button"]').simulate('click')
    );
    wrapper.update();
    expect(JobTemplatesAPI.destroySurvey).toHaveBeenCalledWith(7);
    expect(WorkflowJobTemplatesAPI.destroySurvey).toHaveBeenCalledTimes(0);
  });

  test('should successfully delete wfjt survey', async () => {
    WorkflowJobTemplatesAPI.readSurvey.mockResolvedValueOnce({
      data: surveyData,
    });
    const wrapper = await mountSurvey(
      '/templates/workflow_job_template/15/survey',
      <TemplateSurvey template={mockWorkflowJobTemplateData} canEdit />
    );
    act(() => wrapper.find('Checkbox#select-all').invoke('onChange')(true));
    wrapper.update();
    wrapper.find('Button[ouiaId="survey-delete-button"]').simulate('click');
    wrapper.update();
    await act(async () =>
      wrapper.find('Button[ouiaId="delete-confirm-button"]').simulate('click')
    );
    wrapper.update();
    expect(WorkflowJobTemplatesAPI.destroySurvey).toHaveBeenCalledWith(15);
    expect(JobTemplatesAPI.destroySurvey).toHaveBeenCalledTimes(0);
  });
});
