import React from "react";
import { Redirect } from "expo-router";
import { useStore } from "../src/store/StoreContext";
import { roleHome } from "../src/utils/format";

/**
 * App entry. If a session exists, route to the user's role-specific
 * home; otherwise hand off to the login screen.
 *
 * Using <Redirect> instead of a useEffect-based router.replace prevents
 * a one-frame flash of blank content (which on a slow phone can look
 * like the app "shows nothing").
 */
export default function Index() {
  const { session } = useStore();

  if (session) {
    return <Redirect href={roleHome(session.user.role) as any} />;
  }
  return <Redirect href="/auth/login" />;
}
