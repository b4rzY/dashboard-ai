const labels = {
  CONNECTED: 'Conectada',
  SYNCING: 'Sincronizando',
  NEEDS_ATTENTION: 'Requiere atención',
  ERROR: 'Error',
};
export function Status({ status }: { status: keyof typeof labels }) {
  return (
    <span className={`status status-${status.toLowerCase()}`}>
      <i />
      {labels[status]}
    </span>
  );
}
