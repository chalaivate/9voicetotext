import type { ReactNode } from 'react';
import { tokens } from '../tokens';

interface Props {
  title?: string;
  description?: string;
  children: ReactNode;
}

export function Card({ title, description, children }: Props): JSX.Element {
  return (
    <section
      style={{
        background: tokens.color.bgRaised,
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.lg,
        padding: 20,
        marginBottom: 16
      }}
    >
      {title && (
        <div style={{ marginBottom: description ? 4 : 12 }}>
          <h2
            style={{
              fontSize: 14,
              fontWeight: 600,
              margin: 0,
              color: tokens.color.text
            }}
          >
            {title}
          </h2>
        </div>
      )}
      {description && (
        <p
          style={{
            fontSize: 12,
            color: tokens.color.textDim,
            margin: '0 0 16px',
            lineHeight: 1.5
          }}
        >
          {description}
        </p>
      )}
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '10px 0',
        borderTop: `1px solid ${tokens.color.border}`
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: tokens.color.text
          }}
        >
          {label}
        </div>
        {hint && (
          <div
            style={{
              fontSize: 11,
              color: tokens.color.textDim,
              marginTop: 2
            }}
          >
            {hint}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0, minWidth: 220 }}>{children}</div>
    </div>
  );
}
