/**
 * Admin index route — redirects to the dashboard page. The default
 * landing for the admin role is `/dashboard` (served by dashboard.tsx).
 */
import React from "react";
import { Redirect } from "expo-router";
import { useStore } from "../../src/store/StoreContext";

export default function AdminIndex() {
  const { session } = useStore();
  if (!session) return <Redirect href="/auth/login" />;
  if (session.user.role !== "admin") return <Redirect href="/auth/login" />;
  return <Redirect href="/dashboard" />;
}