import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { Formik } from 'formik';
import { ApplicationsAPI } from 'api';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import ApplicationLookup from './ApplicationLookup';

jest.mock('../../api');
const application = {
  id: 1,
  name: 'app',
  description: '',
};

const fetchedApplications = {
  data: {
    count: 2,
    results: [
      {
        id: 1,
        name: 'app',
        description: '',
      },
      {
        id: 4,
        name: 'application that should not crash',
        description: '',
      },
    ],
  },
};
describe('ApplicationLookup', () => {
  beforeEach(() => {
    ApplicationsAPI.read.mockResolvedValueOnce(fetchedApplications);
    ApplicationsAPI.readOptions.mockResolvedValue({
      data: { actions: { GET: {} }, related_search_fields: [] },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should render successfully', async () => {
    renderWithContexts(
      <Formik>
        <ApplicationLookup
          label="Application"
          value={application}
          onChange={() => {}}
        />
      </Formik>
    );
    expect(await screen.findByText('Application')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Search' })
    ).toBeInTheDocument();
  });

  test('should fetch applications', async () => {
    renderWithContexts(
      <Formik>
        <ApplicationLookup
          label="Application"
          value={application}
          onChange={() => {}}
        />
      </Formik>
    );
    await waitFor(() =>
      expect(ApplicationsAPI.read).toHaveBeenCalledTimes(1)
    );
  });

  test('should display label', async () => {
    renderWithContexts(
      <Formik>
        <ApplicationLookup
          label="Application"
          value={application}
          onChange={() => {}}
        />
      </Formik>
    );
    expect(await screen.findByText('Application')).toBeInTheDocument();
  });
});
