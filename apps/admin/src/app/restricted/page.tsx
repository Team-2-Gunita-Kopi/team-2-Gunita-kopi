"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Restricted } from "@gunita/ui";
import { signOut } from "@/features/auth";

export default function RestrictedPage() {
  const router = useRouter();

  useEffect(() => {
    void signOut();
  }, []);

  return (
    <Restricted
      message="This portal is only for the Owner account."
      actionLabel="Back to sign-in"
      onAction={() => router.replace("/login")}
    />
  );
}
