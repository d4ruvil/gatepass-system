const STATUS_LABELS = {
  pending: ["Waiting: Coordinator", "yellow"],
  coordinator_approved: ["Waiting: Lab Incharge", "yellow"],
  lab_approved: ["Waiting: Dean", "yellow"],
  approved: ["Approved", "green"],
  rejected: ["Rejected", "red"],
  revoked: ["Revoked", "red"],
  expired: ["Expired", "grey"],
};

export default function StatusBadge({ status }) {
  const [label, color] = STATUS_LABELS[status] || [status, "grey"];
  return <span className={`badge badge-${color}`}>{label}</span>;
}
