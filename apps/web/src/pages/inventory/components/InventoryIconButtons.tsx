import type { ReactNode } from 'react';

type IconBtnProps = {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
  children: ReactNode;
};

export function InventoryIconButton({ label, onClick, variant = 'default', children }: IconBtnProps) {
  return (
    <button
      type="button"
      className={`inventory-icon-btn${variant === 'danger' ? ' inventory-icon-btn--danger' : ''}`}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function IconEye() {
  return <i className="ti ti-eye" aria-hidden="true" />;
}

/** Ícono cámara (ver ficha / detalle), alineado al listado de referencia. */
export function IconCamera() {
  return <i className="ti ti-camera" aria-hidden="true" />;
}

export function IconPrint() {
  return <i className="ti ti-printer" aria-hidden="true" />;
}

export function IconPencil() {
  return <i className="ti ti-pencil" aria-hidden="true" />;
}

export function IconTrash() {
  return <i className="ti ti-trash" aria-hidden="true" />;
}

export function IconMore() {
  return <i className="ti ti-dots" aria-hidden="true" />;
}
