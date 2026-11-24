import React from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";

export interface RestrictedProps {
  message: string;
  actionLabel: string;
  onAction: () => void;
}

export const Restricted: React.FC<RestrictedProps> = ({ message, actionLabel, onAction }) => (
  <div className="restricted card">
    <Icon name="alert" />
    <h2>Access restricted</h2>
    <p className="muted">{message}</p>
    <Button onClick={onAction}>{actionLabel}</Button>
  </div>
);
