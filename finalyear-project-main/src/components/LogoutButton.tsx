/**
 * LogoutButton — compact "log out" icon button.
 *
 * Surfaces an `Alert.alert` confirmation; on confirm it calls
 * `logout()` from the store. The route guard in each module's
 * `_layout.tsx` handles the redirect to `/auth/login` once the
 * session is null, so no explicit `router.replace` is needed here.
 */
import React from "react";
import { Alert, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Radius } from "../../constants/colors";
import { useStore } from "../store/StoreContext";

export function LogoutButton() {
  const { logout } = useStore();

  const confirm = () => {
    Alert.alert("Logout", "Sign out of your account?", [
      { text: "Cancel", style: "cancel" },
      { text: "Logout", style: "destructive", onPress: logout },
    ]);
  };

  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={confirm}
      accessibilityRole="button"
      accessibilityLabel="Logout"
    >
      <Ionicons name="log-out-outline" size={22} color={Colors.danger} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2", // soft red wash, matches SellerHeader
    marginLeft: 8,
  },
});
