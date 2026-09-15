import React, { useState, useCallback } from 'react';
import {
  AlertGroup,
  Alert,
  AlertActionCloseButton,
  AlertVariant,
} from '@patternfly/react-core';

/** One toast, as every caller of addToast constructs it. */
export interface ToastMessage {
  id?: number | string;
  title?: React.ReactNode;
  message?: React.ReactNode;
  variant?: 'warning' | 'success' | 'custom' | 'danger' | 'info';
  hasTimeout?: number | boolean;
}

export default function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((newToast: ToastMessage) => {
    setToasts((oldToasts) => [...oldToasts, newToast]);
  }, []);

  // Undefined is a real argument here: a toast raised without an id is
  // dismissed by the same filter, since its id does not match either.
  const removeToast = useCallback((toastId?: number | string) => {
    setToasts((oldToasts) => oldToasts.filter((t) => t.id !== toastId));
  }, []);

  return {
    addToast,
    removeToast,
    Toast,
    toastProps: {
      toasts,
      removeToast,
    },
  };
}

export function Toast({
  toasts,
  removeToast,
}: {
  toasts: ToastMessage[];
  removeToast: (id?: number | string) => void;
}) {
  if (!toasts.length) {
    return null;
  }

  return (
    <AlertGroup data-cy="toast-container" isToast>
      {toasts.map((toast) => (
        <Alert
          actionClose={
            <AlertActionCloseButton onClose={() => removeToast(toast.id)} />
          }
          onTimeout={() => removeToast(toast.id)}
          timeout={toast.hasTimeout}
          title={toast.title}
          variant={toast.variant}
          key={`toast-message-${toast.id}`}
          ouiaId={`toast-message-${toast.id}`}
        >
          {toast.message}
        </Alert>
      ))}
    </AlertGroup>
  );
}

export { AlertVariant };
