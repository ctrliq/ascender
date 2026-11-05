import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { renderWithContexts } from '../../../../../testUtils/rtlContexts';
import CredentialPluginTestAlert from './CredentialPluginTestAlert';

describe('<CredentialPluginTestAlert />', () => {
  test('renders expected content when test is successful', async () => {
    renderWithContexts(
      <CredentialPluginTestAlert
        credentialName="Foobar"
        successResponse={{}}
        errorResponse={null}
      />
    );
    await waitFor(() =>
      expect(
        document.querySelector('p#credential-plugin-test-message')
      ).toHaveTextContent('Test passed')
    );
    expect(
      document.querySelector('b#credential-plugin-test-name')
    ).toHaveTextContent('Foobar');
  });

  test('renders expected content when test fails with the expected return string formatting', async () => {
    renderWithContexts(
      <CredentialPluginTestAlert
        credentialName="Foobar"
        successResponse={null}
        errorResponse={{
          response: {
            data: {
              inputs: `HTTP 404
              {"errors":["not found"]}
              `,
            },
          },
        }}
      />
    );
    await waitFor(() =>
      expect(
        document.querySelector('p#credential-plugin-test-message')
      ).toHaveTextContent('HTTP 404: not found')
    );
    expect(
      document.querySelector('b#credential-plugin-test-name')
    ).toHaveTextContent('Foobar');
  });

  test('renders expected content when test fails without the expected return string formatting', async () => {
    renderWithContexts(
      <CredentialPluginTestAlert
        credentialName="Foobar"
        successResponse={null}
        errorResponse={{
          response: {
            data: {
              inputs: 'usernamee is not present at /secret/foo/bar/baz',
            },
          },
        }}
      />
    );
    await waitFor(() =>
      expect(
        document.querySelector('p#credential-plugin-test-message')
      ).toHaveTextContent('usernamee is not present at /secret/foo/bar/baz')
    );
    expect(
      document.querySelector('b#credential-plugin-test-name')
    ).toHaveTextContent('Foobar');
  });

  test('shows the claims a workload identity test sent', async () => {
    const { user } = renderWithContexts(
      <CredentialPluginTestAlert
        credentialName="Vault OIDC"
        successResponse={null}
        errorResponse={{
          response: {
            data: {
              inputs: 'HTTP 400',
              details: {
                sent_jwt_payload: { ascender_job_template_name: 'patch' },
              },
            },
          },
        }}
      />
    );
    await waitFor(() =>
      expect(
        document.querySelector('#credential-plugin-test-claims')
      ).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: 'Claims sent' }));
    expect(screen.getByText(/ascender_job_template_name/)).toBeVisible();
  });

  test('shows no claims for other credentials', async () => {
    renderWithContexts(
      <CredentialPluginTestAlert
        credentialName="Foobar"
        successResponse={{}}
        errorResponse={null}
      />
    );
    await waitFor(() =>
      expect(
        document.querySelector('p#credential-plugin-test-message')
      ).toHaveTextContent('Test passed')
    );
    expect(document.querySelector('#credential-plugin-test-claims')).toBeNull();
  });
});
