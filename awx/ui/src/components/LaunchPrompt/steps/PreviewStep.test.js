import React from 'react';
import { screen } from '@testing-library/react';
import { Formik } from 'formik';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import PreviewStep from './PreviewStep';

// PromptDetail is a large read-only detail renderer; this suite only cares
// about the resource/overrides PreviewStep computes and forwards, so mock it
// and surface the props it receives into the DOM for assertion.
jest.mock('../../PromptDetail', () => ({ resource, overrides }) => (
  <div
    data-testid="prompt-detail"
    data-resource={JSON.stringify(resource)}
    data-overrides={JSON.stringify(overrides)}
  />
));

const resource = {
  id: 1,
  type: 'job_template',
  summary_fields: {
    inventory: { id: 12 },
    recent_jobs: [],
  },
  related: {},
};

const survey = {
  name: '',
  spec: [
    {
      variable: 'foo',
      type: 'text',
    },
  ],
};

const formErrors = {
  inventory: 'An inventory must be selected',
};

function getPromptDetail() {
  return screen.getByTestId('prompt-detail');
}

describe('PreviewStep', () => {
  test('should render PromptDetail', () => {
    renderWithContexts(
      <Formik initialValues={{ limit: '4', survey_foo: 'abc' }}>
        <PreviewStep
          resource={resource}
          launchConfig={{
            ask_limit_on_launch: true,
            survey_enabled: true,
          }}
          surveyConfig={survey}
          formErrors={formErrors}
        />
      </Formik>
    );

    const detail = getPromptDetail();
    expect(JSON.parse(detail.dataset.resource)).toEqual(resource);
    expect(JSON.parse(detail.dataset.overrides)).toEqual({
      extra_vars: 'foo: abc\n',
      limit: '4',
      survey_foo: 'abc',
    });
  });

  test('should render PromptDetail without survey', () => {
    renderWithContexts(
      <Formik initialValues={{ limit: '4' }}>
        <PreviewStep
          resource={resource}
          launchConfig={{
            ask_limit_on_launch: true,
          }}
          formErrors={formErrors}
        />
      </Formik>
    );

    const detail = getPromptDetail();
    expect(JSON.parse(detail.dataset.resource)).toEqual(resource);
    expect(JSON.parse(detail.dataset.overrides)).toEqual({
      limit: '4',
    });
  });

  test('should handle extra vars with survey', () => {
    renderWithContexts(
      <Formik initialValues={{ extra_vars: 'one: 1', survey_foo: 'abc' }}>
        <PreviewStep
          resource={resource}
          launchConfig={{
            ask_variables_on_launch: true,
            survey_enabled: true,
          }}
          surveyConfig={survey}
          formErrors={formErrors}
        />
      </Formik>
    );

    const detail = getPromptDetail();
    expect(JSON.parse(detail.dataset.resource)).toEqual(resource);
    expect(JSON.parse(detail.dataset.overrides)).toEqual({
      extra_vars: 'one: 1\nfoo: abc\n',
      survey_foo: 'abc',
    });
  });

  test('should handle extra vars without survey', () => {
    renderWithContexts(
      <Formik initialValues={{ extra_vars: 'one: 1' }}>
        <PreviewStep
          resource={resource}
          launchConfig={{
            ask_variables_on_launch: true,
          }}
          formErrors={formErrors}
        />
      </Formik>
    );

    const detail = getPromptDetail();
    expect(JSON.parse(detail.dataset.resource)).toEqual(resource);
    expect(JSON.parse(detail.dataset.overrides)).toEqual({
      extra_vars: 'one: 1\n',
    });
  });

  test('should remove survey with empty array value', () => {
    renderWithContexts(
      <Formik
        initialValues={{ extra_vars: 'one: 1' }}
        values={{ extra_vars: 'one: 1', survey_foo: [] }}
      >
        <PreviewStep
          resource={resource}
          launchConfig={{
            ask_variables_on_launch: true,
          }}
          formErrors={formErrors}
        />
      </Formik>
    );

    const detail = getPromptDetail();
    expect(JSON.parse(detail.dataset.resource)).toEqual(resource);
    expect(JSON.parse(detail.dataset.overrides)).toEqual({
      extra_vars: 'one: 1\n',
    });
  });
});
