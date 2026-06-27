import React from 'react';
import { render, screen, act } from '@testing-library/react';
import useToast, { Toast, AlertVariant } from './useToast';

describe('useToast', () => {
  const result = { current: null };
  const latest = () => result.current;
  const Test = () => {
    result.current = useToast();
    return null;
  };

  test('should provide Toast component', () => {
    render(<Test />);
    expect(latest().Toast).toEqual(Toast);
  });

  test('should add toast', () => {
    render(<Test />);

    expect(latest().toastProps.toasts).toEqual([]);
    act(() => {
      latest().addToast({
        message: 'one',
        id: 1,
        variant: 'success',
      });
    });

    expect(latest().toastProps.toasts).toEqual([
      {
        message: 'one',
        id: 1,
        variant: 'success',
      },
    ]);
  });

  test('should remove toast', () => {
    render(<Test />);

    act(() => {
      latest().addToast({
        message: 'one',
        id: 1,
        variant: 'success',
      });
    });
    expect(latest().toastProps.toasts).toHaveLength(1);
    act(() => {
      latest().removeToast(1);
    });

    expect(latest().toastProps.toasts).toHaveLength(0);
  });
});

describe('Toast', () => {
  test('should render nothing with no toasts', () => {
    const { container } = render(<Toast toasts={[]} removeToast={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('should render toast alert', () => {
    const toast = {
      title: 'Inventory saved',
      variant: AlertVariant.success,
      id: 1,
      message: 'the message',
    };
    render(<Toast toasts={[toast]} removeToast={() => {}} />);

    const alert = screen.getByText('Inventory saved').closest('.pf-v6-c-alert');
    expect(alert).toHaveClass('pf-m-success');
    expect(alert).toHaveAttribute('data-ouia-component-id', 'toast-message-1');
    expect(alert).toHaveTextContent('the message');
  });

  test('should call removeToast', () => {
    const removeToast = jest.fn();
    const toast = {
      title: 'Inventory saved',
      variant: AlertVariant.success,
      id: 1,
    };
    render(<Toast toasts={[toast]} removeToast={removeToast} />);

    const closeButton = screen.getByRole('button', { name: /close/i });
    act(() => {
      closeButton.click();
    });
    expect(removeToast).toHaveBeenCalledTimes(1);
  });

  test('should render multiple alerts', () => {
    const toasts = [
      {
        title: 'Inventory saved',
        variant: AlertVariant.success,
        id: 1,
        message: 'the message',
      },
      {
        title: 'error saving',
        variant: AlertVariant.danger,
        id: 2,
      },
    ];
    render(<Toast toasts={toasts} removeToast={() => {}} />);

    expect(screen.getByText('Inventory saved')).toBeInTheDocument();
    expect(screen.getByText('error saving')).toBeInTheDocument();
  });
});
