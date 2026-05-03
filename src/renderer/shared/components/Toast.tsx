import { useEffect, useState, type ReactNode } from 'react';
import { tokens } from '../tokens';

export interface ToastMessage {
  id: number;
  text: string;
  variant?: 'info' | 'success' | 'error';
  durationMs?: number;
}

let nextId = 1;
const listeners = new Set<(t: ToastMessage) => void>();

export function toast(
  text: string,
  variant: ToastMessage['variant'] = 'info',
  durationMs = 1800
): void {
  const message: ToastMessage = { id: nextId++, text, variant, durationMs };
  for (const fn of listeners) fn(message);
}

export function ToastHost(): JSX.Element {
  const [items, setItems] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const onMessage = (msg: ToastMessage): void => {
      setItems((prev) => [...prev, msg]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== msg.id));
      }, msg.durationMs ?? 1800);
    };
    listeners.add(onMessage);
    return () => {
      listeners.delete(onMessage);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 1000,
        pointerEvents: 'none'
      }}
    >
      {items.map((item) => (
        <ToastItem key={item.id} message={item} />
      ))}
    </div>
  );
}

function ToastItem({ message }: { message: ToastMessage }): ReactNode {
  const accent: Record<NonNullable<ToastMessage['variant']>, string> = {
    info: tokens.color.brandBlue,
    success: tokens.color.success,
    error: tokens.color.error
  };
  return (
    <div
      style={{
        background: tokens.color.bgRaised,
        border: `1px solid ${tokens.color.border}`,
        borderLeft: `3px solid ${accent[message.variant ?? 'info']}`,
        color: tokens.color.text,
        padding: '10px 14px',
        borderRadius: tokens.radius.md,
        fontSize: 13,
        boxShadow: tokens.shadow.lg,
        animation: 'toastIn 180ms ease',
        maxWidth: 360,
        pointerEvents: 'auto'
      }}
    >
      {message.text}
    </div>
  );
}
