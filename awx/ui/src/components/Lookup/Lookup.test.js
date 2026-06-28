import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import { Formik } from 'formik';
import { getQSConfig } from 'util/qs';
import { renderWithContexts } from '../../../testUtils/rtlContexts';
import Lookup from './Lookup';

const QS_CONFIG = getQSConfig('test', {});

describe('<Lookup />', () => {
  let onChange;
  // Captures the most recent render-props the Lookup passes to its options
  // list, so tests can assert on state/canDelete directly.
  let lastRenderProps;

  const renderOptionsList = (renderProps) => {
    lastRenderProps = renderProps;
    return <div data-testid="options-list" />;
  };

  function renderLookup(extraProps = {}) {
    const mockSelected = [{ name: 'foo', id: 1, url: '/api/v2/item/1' }];
    return renderWithContexts(
      <Formik>
        <Lookup
          id="test"
          multiple
          header="Foo Bar"
          value={mockSelected}
          onChange={onChange}
          qsConfig={QS_CONFIG}
          renderOptionsList={renderOptionsList}
          fieldName="foo"
          {...extraProps}
        />
      </Formik>
    );
  }

  beforeEach(() => {
    onChange = jest.fn();
    lastRenderProps = null;
  });

  test('should render successfully', () => {
    renderLookup();
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
  });

  test('should show selected items', () => {
    renderLookup();
    expect(screen.getByText('foo')).toBeInTheDocument();
  });

  test('should open and close modal', async () => {
    const { user } = renderLookup();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Search' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('options-list')).toBeInTheDocument();
    expect(lastRenderProps.state).toEqual({
      selectedItems: [{ id: 1, name: 'foo', url: '/api/v2/item/1' }],
      value: [{ id: 1, name: 'foo', url: '/api/v2/item/1' }],
      multiple: true,
      isModalOpen: true,
      required: false,
    });
    expect(lastRenderProps.dispatch).toBeTruthy();
    expect(lastRenderProps.canDelete).toEqual(true);

    await user.click(
      within(dialog).getByRole('button', { name: 'Cancel lookup' })
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  });

  test('should remove item when X button clicked', async () => {
    const { user } = renderLookup();
    const chip = screen.getByText('foo').closest('.pf-v6-c-label');
    await user.click(within(chip).getByRole('button'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  test('should pass canDelete false if required single select', async () => {
    const mockSelected = { name: 'foo', id: 1, url: '/api/v2/item/1' };
    const { user } = renderWithContexts(
      <Formik>
        <Lookup
          id="test"
          header="Foo Bar"
          required
          value={mockSelected}
          onChange={onChange}
          qsConfig={QS_CONFIG}
          renderOptionsList={renderOptionsList}
          fieldName="foo"
        />
      </Formik>
    );
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByRole('dialog');
    expect(lastRenderProps.canDelete).toEqual(false);
  });

  test('should be disabled while isLoading is true', () => {
    renderLookup({ isLoading: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
  });
});
