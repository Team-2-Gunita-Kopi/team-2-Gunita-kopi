import { redirect } from "next/navigation";

// Signed-out visitors never reach this page: the middleware sends them to /login?redirect=/.
// After sign-in they land here, so this must open the home screen, not /login again.
export default function HomePage() {
  redirect("/staff/pos");
}
