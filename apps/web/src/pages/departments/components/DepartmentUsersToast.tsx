type Props = {
  message: string;
  variant: 'success' | 'error';
  onDismiss: () => void;
};

export function DepartmentUsersToast({ message, variant, onDismiss }: Props) {
  if (!message) return null;
  return (
    <div
      className={`dept-users-toast dept-users-toast--${variant}`}
      role={variant === 'error' ? 'alert' : 'status'}
    >
      <span>{message}</span>
      <button
        type="button"
        className="dept-users-toast__close"
        onClick={onDismiss}
        aria-label="Cerrar"
      >
        <i className="ti ti-x" aria-hidden="true" />
      </button>
    </div>
  );
}
