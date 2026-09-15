import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../../testUtils/rtlContexts';
import PageControls from './PageControls';

describe('PageControls', () => {
  test('should render successfully', () => {
    renderWithContexts(<PageControls />);
    expect(
      screen.getByRole('button', { name: 'Scroll previous' })
    ).toBeInTheDocument();
  });

  test('should render menu control icons', () => {
    renderWithContexts(<PageControls isFlatMode />);
    // The four scroll buttons each wrap one angle icon.
    expect(
      screen.getByRole('button', { name: 'Scroll previous' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Scroll next' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Scroll first' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Scroll last' })
    ).toBeInTheDocument();
  });

  test('should render expand/collapse all', () => {
    renderWithContexts(<PageControls isFlatMode={false} isTemplateJob />);
    // Expanded state uses the "Collapse all job events" label (AngleDownIcon).
    expect(
      screen.getByRole('button', { name: 'Collapse all job events' })
    ).toBeInTheDocument();
  });

  test('should render correct expand/collapse angle icon', () => {
    renderWithContexts(
      <PageControls isFlatMode={false} isAllCollapsed isTemplateJob />
    );
    // Collapsed state uses the "Expand job events" label (AngleRightIcon).
    expect(
      screen.getByRole('button', { name: 'Expand job events' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Collapse all job events' })
    ).not.toBeInTheDocument();
  });

  test('Should not render expand/collapse all', () => {
    renderWithContexts(
      <PageControls isFlatMode={false} isAllCollapsed isTemplateJob={false} />
    );

    expect(
      screen.queryByRole('button', { name: 'Expand job events' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Collapse all job events' })
    ).not.toBeInTheDocument();
  });
});
