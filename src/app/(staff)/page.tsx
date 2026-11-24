import { redirect } from "next/navigation";

// The bare address opens the staff POS, never the Owner sign-in (the Owner uses /admin/login).
export default function Home() {
  redirect("/staff/pos");
}
