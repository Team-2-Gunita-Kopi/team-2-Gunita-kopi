import React from "react";

export interface EmptyStateProps {
  message: string;
  action?: React.ReactNode;
}

export function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <div className="card" style={{ textAlign: "center" }}>
      <p className="muted">{message}</p>
      {action}
    </div>
  );
}
