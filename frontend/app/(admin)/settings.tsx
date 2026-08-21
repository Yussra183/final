/**
 * Admin Dashboard – Settings page.
 *
 * Sections:
 *   • System Settings  – currency, language, time zone, maintenance mode
 *   • User Roles       – permissions matrix for Admin/Operations/Support
 *   • Notifications    – email/SMS/push toggles per event type
 *   • Security         – 2FA, password policy, session timeout, IP allowlist
 */
import React, { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AdminLayout } from "../../src/components/admin/AdminLayout";
import {
  AdminButton,
  AdminCard,
  AdminFormField,
  AdminInput,
  AdminSelect,
} from "../../src/components/admin";
import { AdminIcon } from "../../src/components/admin/Icon";
import type { AdminIconName } from "../../src/components/admin/Icon";
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
} from "../../constants/colors";

type Section = "system" | "roles" | "notifications" | "security";

export default function SettingsPage() {
  const [section, setSection] = useState<Section>("system");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // System state
  const [currency, setCurrency] = useState("KES");
  const [language, setLanguage] = useState("en");
  const [timezone, setTimezone] = useState("Africa/Nairobi");
  const [maintenance, setMaintenance] = useState(false);

  // Notifications
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySms, setNotifySms] = useState(true);
  const [notifyPush, setNotifyPush] = useState(false);
  const [notifyNewSeller, setNotifyNewSeller] = useState(true);
  const [notifyNewRider, setNotifyNewRider] = useState(true);
  const [notifyOrderIssue, setNotifyOrderIssue] = useState(true);
  const [notifyRiderAssign, setNotifyRiderAssign] = useState(true);

  // Security
  const [twoFactor, setTwoFactor] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState("30");
  const [passwordLength, setPasswordLength] = useState("12");
  const [ipAllowlist, setIpAllowlist] = useState("");

  const handleSave = () => {
    setSavedAt(new Date().toLocaleTimeString());
  };

  return (
    <AdminLayout
      title="Settings"
      subtitle="Configure system, roles, notifications and security"
    >
      {/* Section tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
      >
        {(
          [
            { key: "system", label: "System Settings", icon: "settings" as AdminIconName },
            { key: "roles", label: "User Roles", icon: "shield" as AdminIconName },
            { key: "notifications", label: "Notifications", icon: "notifications" as AdminIconName },
            { key: "security", label: "Security", icon: "lock" as AdminIconName },
          ] as { key: Section; label: string; icon: AdminIconName }[]
        ).map((t) => {
          const active = section === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setSection(t.key)}
              activeOpacity={0.85}
              style={[styles.tab, active && styles.tabActive]}
            >
              <View style={styles.tabIcon}>
                <AdminIcon
                  name={t.icon}
                  size={14}
                  color={active ? "#FFF" : Colors.textSecondary}
                />
              </View>
              <Text
                style={[styles.tabText, active && styles.tabTextActive]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {savedAt ? (
        <View style={styles.savedBanner}>
          <Text style={styles.savedText}>✓ Changes saved at {savedAt}</Text>
        </View>
      ) : null}

      {section === "system" && (
        <AdminCard>
          <Text style={styles.cardTitle}>System Settings</Text>
          <Text style={styles.cardSub}>
            Platform-wide configuration options
          </Text>
          <View style={{ marginTop: Spacing.lg, gap: Spacing.md }}>
            <AdminFormField label="Default Currency">
              <AdminSelect
                value={currency}
                onValueChange={setCurrency}
                options={[
                  { label: "Kenyan Shilling (KES)", value: "KES" },
                  { label: "US Dollar (USD)", value: "USD" },
                  { label: "Euro (EUR)", value: "EUR" },
                  { label: "Pound Sterling (GBP)", value: "GBP" },
                ]}
              />
            </AdminFormField>
            <AdminFormField label="Default Language">
              <AdminSelect
                value={language}
                onValueChange={setLanguage}
                options={[
                  { label: "English", value: "en" },
                  { label: "Swahili", value: "sw" },
                  { label: "French", value: "fr" },
                ]}
              />
            </AdminFormField>
            <AdminFormField label="Time Zone">
              <AdminSelect
                value={timezone}
                onValueChange={setTimezone}
                options={[
                  { label: "Africa/Nairobi", value: "Africa/Nairobi" },
                  { label: "Africa/Lagos", value: "Africa/Lagos" },
                  { label: "Africa/Cairo", value: "Africa/Cairo" },
                  { label: "UTC", value: "UTC" },
                ]}
              />
            </AdminFormField>
            <SettingRow
              title="Maintenance Mode"
              subtitle="Disable customer-facing features temporarily"
              value={maintenance}
              onValueChange={setMaintenance}
            />
          </View>
        </AdminCard>
      )}

      {section === "roles" && (
        <AdminCard>
          <Text style={styles.cardTitle}>User Roles</Text>
          <Text style={styles.cardSub}>
            Manage permissions for each admin role
          </Text>
          <View style={styles.permissionsGrid}>
            <View style={styles.permissionsHeader}>
              <Text style={[styles.permissionsHeaderText, { flex: 1.4 }]}>
                Capability
              </Text>
              <Text style={styles.permissionsHeaderText}>Super Admin</Text>
              <Text style={styles.permissionsHeaderText}>Operations</Text>
              <Text style={styles.permissionsHeaderText}>Support</Text>
            </View>
            {(
              [
                { cap: "Register Suppliers", a: true, o: true, s: false },
                { cap: "Approve Sellers", a: true, o: true, s: false },
                { cap: "Approve Riders", a: true, o: true, s: false },
                { cap: "Assign Riders", a: true, o: true, s: false },
                { cap: "Manage Routes", a: true, o: true, s: false },
                { cap: "Resolve Orders", a: true, o: true, s: true },
                { cap: "View Reports", a: true, o: true, s: true },
                { cap: "Edit Settings", a: true, o: false, s: false },
                { cap: "Manage Roles", a: true, o: false, s: false },
              ] as const
            ).map((row) => (
              <View key={row.cap} style={styles.permissionsRow}>
                <Text style={[styles.permissionsCapText, { flex: 1.4 }]}>
                  {row.cap}
                </Text>
                <PermissionCell allowed={row.a} />
                <PermissionCell allowed={row.o} />
                <PermissionCell allowed={row.s} />
              </View>
            ))}
          </View>
        </AdminCard>
      )}

      {section === "notifications" && (
        <View style={{ gap: Spacing.lg }}>
          <AdminCard>
            <Text style={styles.cardTitle}>Notification Channels</Text>
            <Text style={styles.cardSub}>
              Choose how admins receive alerts
            </Text>
            <View style={{ marginTop: Spacing.lg, gap: Spacing.sm }}>
              <SettingRow
                title="Email Notifications"
                subtitle="Receive alerts via email"
                value={notifyEmail}
                onValueChange={setNotifyEmail}
              />
              <SettingRow
                title="SMS Notifications"
                subtitle="Critical alerts only"
                value={notifySms}
                onValueChange={setNotifySms}
              />
              <SettingRow
                title="Push Notifications"
                subtitle="Mobile push notifications"
                value={notifyPush}
                onValueChange={setNotifyPush}
              />
            </View>
          </AdminCard>

          <AdminCard>
            <Text style={styles.cardTitle}>Event Triggers</Text>
            <Text style={styles.cardSub}>
              Choose which events trigger admin notifications
            </Text>
            <View style={{ marginTop: Spacing.lg, gap: Spacing.sm }}>
              <SettingRow
                title="New Seller Application"
                subtitle="Notify when a seller applies"
                value={notifyNewSeller}
                onValueChange={setNotifyNewSeller}
              />
              <SettingRow
                title="New Rider Application"
                subtitle="Notify when a rider applies"
                value={notifyNewRider}
                onValueChange={setNotifyNewRider}
              />
              <SettingRow
                title="Order Issue"
                subtitle="Notify when an order needs attention"
                value={notifyOrderIssue}
                onValueChange={setNotifyOrderIssue}
              />
              <SettingRow
                title="Rider Assignment Response"
                subtitle="Notify when sellers accept or reject riders"
                value={notifyRiderAssign}
                onValueChange={setNotifyRiderAssign}
              />
            </View>
          </AdminCard>
        </View>
      )}

      {section === "security" && (
        <AdminCard>
          <Text style={styles.cardTitle}>Security Settings</Text>
          <Text style={styles.cardSub}>
            Protect your admin account and platform
          </Text>
          <View style={{ marginTop: Spacing.lg, gap: Spacing.md }}>
            <SettingRow
              title="Two-Factor Authentication"
              subtitle="Require 2FA for all admin logins"
              value={twoFactor}
              onValueChange={setTwoFactor}
            />
            <AdminFormField label="Session Timeout (minutes)">
              <AdminInput
                value={sessionTimeout}
                onChangeText={(v) => setSessionTimeout(v.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
              />
            </AdminFormField>
            <AdminFormField label="Minimum Password Length">
              <AdminInput
                value={passwordLength}
                onChangeText={(v) =>
                  setPasswordLength(v.replace(/[^0-9]/g, ""))
                }
                keyboardType="number-pad"
              />
            </AdminFormField>
            <AdminFormField
              label="IP Allowlist"
              hint="Comma-separated IPs. Leave empty to allow all."
            >
              <AdminInput
                value={ipAllowlist}
                onChangeText={setIpAllowlist}
                placeholder="e.g. 196.201.214.200, 102.215.10.0"
                multiline
              />
            </AdminFormField>
          </View>
        </AdminCard>
      )}
    </AdminLayout>
  );
}

function SettingRow({
  title,
  subtitle,
  value,
  onValueChange,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingTitle}>{title}</Text>
        {subtitle ? (
          <Text style={styles.settingSubtitle}>{subtitle}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: Colors.surfaceMuted, true: Colors.primary }}
        thumbColor="#FFF"
      />
    </View>
  );
}

function PermissionCell({ allowed }: { allowed: boolean }) {
  return (
    <View style={styles.permissionCell}>
      <View
        style={[
          styles.permissionDot,
          allowed
            ? { backgroundColor: Colors.success }
            : { backgroundColor: Colors.danger, opacity: 0.4 },
        ]}
      >
        <Text style={styles.permissionDotText}>{allowed ? "✓" : "✕"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabsRow: {
    flexDirection: "row",
    gap: 6,
    paddingBottom: Spacing.lg,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  tabActive: {
    backgroundColor: Colors.admin,
    borderColor: Colors.admin,
  },
  tabIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  tabText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: "#FFF",
  },
  savedBanner: {
    backgroundColor: "#D1FAE5",
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginBottom: Spacing.lg,
  },
  savedText: {
    color: "#065F46",
    fontWeight: "800",
  },
  cardTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  cardSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderRadius: Radius.md,
  },
  settingTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  settingSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  permissionsGrid: {
    marginTop: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  permissionsHeader: {
    flexDirection: "row",
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    alignItems: "center",
  },
  permissionsHeaderText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "800",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "center",
  },
  permissionsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  permissionsCapText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.text,
  },
  permissionCell: {
    flex: 1,
    alignItems: "center",
  },
  permissionDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionDotText: {
    color: "#FFF",
    fontWeight: "900",
    fontSize: 12,
  },
});