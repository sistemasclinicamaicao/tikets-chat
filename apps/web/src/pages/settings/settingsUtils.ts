import type { KeyboardEvent } from 'react';
import { ApiError } from '../../lib/api';

export function settingsErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

export function etiquetaCategoriaEstado(category: string): string {
  if (category === 'active' || category === 'activo') return 'Activo';
  return category;
}

export function selectableRowProps(
  isActive: boolean,
  onSelect: () => void,
): {
  className: string | undefined;
  onClick: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
  role: 'button';
  tabIndex: 0;
} {
  return {
    className: isActive ? 'settings-row-active' : undefined,
    onClick: onSelect,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect();
      }
    },
    role: 'button',
    tabIndex: 0,
  };
}
