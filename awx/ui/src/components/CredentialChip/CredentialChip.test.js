import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import CredentialChip from './CredentialChip';

describe('CredentialChip', () => {
  test('should render SSH kind', () => {
    const credential = {
      id: 1,
      kind: 'ssh',
      name: 'foo',
    };

    renderWithContexts(<CredentialChip credential={credential} />);
    expect(screen.getByText(/SSH:/)).toBeInTheDocument();
    expect(screen.getByText('foo', { exact: false })).toHaveTextContent(
      'SSH: foo'
    );
  });

  test('should render AWS kind', () => {
    const credential = {
      id: 1,
      kind: 'aws',
      name: 'foo',
    };

    renderWithContexts(<CredentialChip credential={credential} />);
    expect(screen.getByText('foo', { exact: false })).toHaveTextContent(
      'AWS: foo'
    );
  });

  test('should render with "Cloud"', () => {
    const credential = {
      id: 1,
      cloud: true,
      kind: 'other',
      name: 'foo',
    };

    renderWithContexts(<CredentialChip credential={credential} />);
    expect(screen.getByText('foo', { exact: false })).toHaveTextContent(
      'Cloud: foo'
    );
  });

  test('should render with other kind', () => {
    const credential = {
      id: 1,
      kind: 'other',
      name: 'foo',
    };

    renderWithContexts(<CredentialChip credential={credential} />);
    expect(screen.getByText('foo', { exact: false })).toHaveTextContent(
      'Other: foo'
    );
  });

  test('should render a deletable chip with a close button by default', () => {
    const credential = { id: 1, kind: 'ssh', name: 'foo' };
    renderWithContexts(
      <CredentialChip credential={credential} onClick={() => {}} />
    );
    // PF Chip's close button is labelled by the chip text (aria-labelledby).
    expect(
      screen.getByRole('button', { name: /SSH: foo/ })
    ).toBeInTheDocument();
  });

  test('should render a read-only chip without a close button', () => {
    const credential = { id: 1, kind: 'ssh', name: 'foo' };
    renderWithContexts(<CredentialChip credential={credential} isReadOnly />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
