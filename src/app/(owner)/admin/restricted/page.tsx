"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Restricted } from "@/ui";
import { signOut } from "@/owner/features/auth";

export default function RestrictedPage() {
  const router = useRouter();

  useEffect(() => {
    void signOut();
  }, []);

  return (
    <Restricted
      message="This portal is only for the Owner account."
      actionLabel="Back to sign-in"
      onAction={() => router.replace("/admin/login")}
    />
  );
}
