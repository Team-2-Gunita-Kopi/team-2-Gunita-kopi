"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Restricted } from "@/ui";

export default function RestrictedPage() {
  const router = useRouter();

  return (
    <Restricted
      message="The Barista POS is only for barista accounts."
      actionLabel="Back to sign-in"
      onAction={() => router.replace("/staff/login")}
    />
  );
}
