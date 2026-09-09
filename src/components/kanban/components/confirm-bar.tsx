interface ConfirmBarProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  style?: React.CSSProperties;
}

export function ConfirmBar({
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Yes, delete',
  cancelLabel = 'No, keep',
  style,
}: ConfirmBarProps) {
  return (
    <div className="confirm-bar" style={style}>
      <span>{message}</span>
      <button className="btn btn-sm btn-danger" onClick={onConfirm} aria-label={confirmLabel}>
        {confirmLabel}
      </button>
      <button className="btn btn-sm" onClick={onCancel} aria-label={cancelLabel}>
        {cancelLabel}
      </button>
    </div>
  );
}
