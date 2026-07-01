'use client';

import { useState, useRef, type FormHTMLAttributes } from 'react';
import ConfirmDialog from './confirm-dialog';

interface Props extends Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> {
  message: string;
  title?: string;
  confirmLabel?: string;
}

/** Drop-in replacement for <form> that shows a modal confirm before submitting. */
export default function ConfirmForm({ message, title, confirmLabel, children, ...props }: Props) {
  const [open, setOpen] = useState(false);
  const confirmedRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form
        ref={formRef}
        {...props}
        onSubmit={(e) => {
          if (!confirmedRef.current) {
            e.preventDefault();
            setOpen(true);
          }
          confirmedRef.current = false;
        }}
      >
        {children}
      </form>
      <ConfirmDialog
        open={open}
        title={title}
        message={message}
        confirmLabel={confirmLabel}
        onConfirm={() => {
          setOpen(false);
          confirmedRef.current = true;
          formRef.current?.requestSubmit();
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
