type Props = {
  message: string;
  variant: 'success' | 'error';
  onDismiss: () => void;
};

export function SettingsUsersToast({ message, variant, onDismiss }: Props) {
  if (!message) return null;
  return (
    <div
      className={`settings-users-toast settings-users-toast--${variant}`}
      role={variant === 'error' ? 'alert' : 'status'}
    >
      <span>{message}</span>
      <button
        type="button"
        className="settings-users-toast__close"
        onClick={onDismiss}
        aria-label="Cerrar"
      >
        <i className="ti ti-x" aria-hidden="true" />
      </button>
    </div>
  );
}
