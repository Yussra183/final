/**
 * Supplier → Delivery Operation Details — compatibility redirect
 *
 * The actual delivery-operations flow lives on the Delivery Operations
 * page as three internal tabs. This route is kept as a thin redirect
 * so any existing direct links (e.g. dashboard quick actions, sidebar
 * "Live Delivery") keep working — it deep-links into the operations
 * page with the correct tab + route id pre-selected.
 */
import { useEffect } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { Colors } from "../../../constants/colors";

export default function SupplierRouteDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  useEffect(() => {
    router.replace({
      pathname: "/(supplier)/operations" as any,
      params: {
        tab: "details",
        ...(id ? { routeId: id } : {}),
      },
    });
  }, [router, id]);
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.background,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ActivityIndicator color={Colors.supplier} />
    </View>
  );
}
