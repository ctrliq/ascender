import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';

import ContentError from './ContentError';

describe('ContentError', () => {
  test('renders the generic error content', () => {
    renderWithContexts(
      <ContentError
        error={
          new Error({
            response: {
              config: {
                method: 'post',
              },
              data: 'An error occurred',
            },
          })
        }
      />
    );
    expect(screen.getByText('Something went wrong...')).toBeInTheDocument();
    expect(
      screen.getByText(
        'There was an error loading this content. Please reload the page.'
      )
    ).toBeInTheDocument();
  });

  test('renders Not Found content for a 404 response', () => {
    const error = new Error('not found');
    error.response = { status: 404, headers: {} };
    renderWithContexts(<ContentError error={error} />);
    expect(screen.getByText('Not Found')).toBeInTheDocument();
    expect(
      screen.getByText('The page you requested could not be found.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Something went wrong...')
    ).not.toBeInTheDocument();
  });

  test('renders Not Found content when isNotFound is set', () => {
    renderWithContexts(<ContentError isNotFound />);
    expect(screen.getByText('Not Found')).toBeInTheDocument();
  });
});
