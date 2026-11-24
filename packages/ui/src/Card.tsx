import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  alt?: boolean;
}

export function Card({ alt, className, ...props }: CardProps) {
  return <div className={["card", alt ? "card-2" : "", className ?? ""].filter(Boolean).join(" ")} {...props} />;
}
