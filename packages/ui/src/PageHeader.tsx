import React from "react";

export interface PageHeaderProps {
  latin: string;
  title: string;
  actions?: React.ReactNode;
}

export function PageHeader({ latin, title, actions }: PageHeaderProps) {
  return (
    <div className="screen-head">
      <div>
        <div className="kicker" lang="tl-Tglg" data-latin={latin}>
          ᜄᜓᜈᜒᜆ
        </div>
        <h1>{title}</h1>
      </div>
      <div className="head-actions">{actions}</div>
    </div>
  );
}
