/**
 * src/components/Sheet.tsx
 *
 * Lightweight bottom-sheet that opens over the current screen. No
 * external dep — built on top of React Native's `Modal` + `Animated`
 * + `PanResponder`. `@gorhom/bottom-sheet` was the alternative and
 * is rejected for this use case (single consumer, ~30 KB + a native
 * gesture dep to drag in for one feature).
 *
 * Snap points are fractions of the screen height:
 *   - 0.15 (peek) — just the drag handle
 *   - 0.50 (half)  — default resting position
 *   - 0.90 (full)  — covers most of the screen
 *
 * Drag the handle up/down to snap. Tap the scrim or use the pull-
 * down-and-release gesture to dismiss. The sheet is unmounted when
 * `visible` flips to false so the parent owns the lifecycle — no
 * `requestClose`/`onModalHide` ceremony.
 *
 * Tokens only from `constants/colors.ts`.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  Modal,
  PanResponder,
  type PanResponderInstance,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  /** Optional title shown above the sheet body. */
  title?: string;
  /** Optional right-side action in the title bar. */
  titleRight?: React.ReactNode;
  /**
   * Snap points as fractions of screen height. Defaults to
   * `[0.15, 0.5, 0.9]`. Pass a custom set if you need a different
   * shelf of resting places.
   */
  snapPoints?: number[];
  /** Index into `snapPoints` to open at. Defaults to the middle one. */
  initialSnap?: number;
  children: React.ReactNode;
  /** Override the default padding inside the sheet body. */
  contentStyle?: ViewStyle;
}

const DEFAULT_SNAP_POINTS = [0.15, 0.5, 0.9];

export function Sheet({
  visible,
  onClose,
  title,
  titleRight,
  snapPoints = DEFAULT_SNAP_POINTS,
  initialSnap = 1,
  children,
  contentStyle,
}: SheetProps) {
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get("window").height;

  // Snap heights in px, sorted ascending (smallest -> largest).
  const snapHeights = useMemo(
    () =>
      [...snapPoints]
        .sort((a, b) => a - b)
        .map((p) => Math.round(p * windowHeight)),
    [snapPoints, windowHeight],
  );

  // 0 = smallest snap (most negative translateY), N-1 = tallest snap.
  const [snapIdx, setSnapIdx] = useState(
    Math.min(Math.max(0, initialSnap), snapHeights.length - 1),
  );

  // Animated translateY. The rest position for snap `i` is
  // `windowHeight - snapHeights[i]`. We start the sheet HIDDEN
  // (translateY = windowHeight) so the first show animates up.
  const translateY = useRef(new Animated.Value(windowHeight)).current;

  // The drag-tracking refs. `panStartTranslateY` records where the
  // sheet was when the gesture started so we can offset the gesture's
  // delta by it.
  const panStartTranslateY = useRef<number>(0);
  const snapHeightsRef = useRef<number[]>(snapHeights);
  snapHeightsRef.current = snapHeights;

  const animateToSnap = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(idx, snapHeightsRef.current.length - 1));
      setSnapIdx(clamped);
      const restY = windowHeight - snapHeightsRef.current[clamped];
      Animated.timing(translateY, {
        toValue: restY,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [translateY, windowHeight],
  );

  /**
   * PanResponder — handles both drag-up to grow the sheet and
   * drag-down to shrink (or dismiss when dragged below the bottom
   * shelf). The gesture velocity is checked on release to decide
   * whether to advance a snap point or fall back.
   */
  const panResponder: PanResponderInstance = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dy) > 4 && Math.abs(g.dx) < Math.abs(g.dy),
        onPanResponderGrant: () => {
          translateY.stopAnimation();
          panStartTranslateY.current =
            (translateY as unknown as { __getValue: () => number }).__getValue?.() ??
            0;
        },
        onPanResponderMove: (_, g) => {
          const restY =
            windowHeight - snapHeightsRef.current[snapIdx];
          const next = restY + g.dy;
          // Clamp so the sheet can't be dragged above the tallest
          // snap or below the bottom shelf (which would put the
          // drag handle off-screen).
          const minY = windowHeight - snapHeightsRef.current[snapHeightsRef.current.length - 1];
          const maxY = windowHeight - snapHeightsRef.current[0];
          translateY.setValue(Math.max(minY, Math.min(maxY, next)));
        },
        onPanResponderRelease: (_, g) => {
          const restY =
            windowHeight - snapHeightsRef.current[snapIdx];
          const projected = restY + g.dy + g.vy * 200;
          // Find the closest snap target by snap-Y distance.
          let bestIdx = snapIdx;
          let bestDist = Infinity;
          for (let i = 0; i < snapHeightsRef.current.length; i++) {
            const target = windowHeight - snapHeightsRef.current[i];
            const dist = Math.abs(target - projected);
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = i;
            }
          }
          // Special case: if the user dragged below the smallest
          // snap with intent (`vy > 0.6 || dy > 80`), dismiss.
          const smallestY =
            windowHeight - snapHeightsRef.current[0];
          const wasSwipingDown =
            g.vy > 0.6 ||
            (g.dy > 80 && restY + g.dy > smallestY + 40);
          if (bestIdx === 0 && wasSwipingDown) {
            Animated.timing(translateY, {
              toValue: windowHeight,
              duration: 180,
              easing: Easing.in(Easing.cubic),
              useNativeDriver: true,
            }).start(() => onClose());
            return;
          }
          animateToSnap(bestIdx);
        },
        onPanResponderTerminate: () => {
          animateToSnap(snapIdx);
        },
      }),
    [animateToSnap, onClose, snapIdx, translateY, windowHeight],
  );

  /**
   * When `visible` flips false externally, animate the sheet off-
   * screen. When it flips true, reset the snap index to the initial
   * snap and animate it in. We also dismiss the keyboard so an open
   * sheet doesn't cover a focused input field.
   */
  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
      const startIdx = Math.min(
        Math.max(0, initialSnap),
        snapHeights.length - 1,
      );
      setSnapIdx(startIdx);
      const restY = windowHeight - snapHeights[startIdx];
      translateY.setValue(windowHeight);
      Animated.timing(translateY, {
        toValue: restY,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: windowHeight,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
    // We intentionally don't depend on `initialSnap` after first show
    // because `animateToSnap` already handles user-initiated snaps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal
      transparent
      animationType="none"
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        accessibilityLabel="Dismiss sheet"
        onPress={onClose}
        style={styles.scrim}
      >
        {/* The scrim Pressable catches empty-area taps but must not
            steal them from the sheet — RN Modal hosts the sheet as a
            sibling; we wrap it in a view that disables press
            propagation by NOT being a Pressable itself. */}
      </Pressable>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.sheet,
          {
            height: snapHeights[snapIdx],
            paddingBottom: insets.bottom + Spacing.md,
            transform: [{ translateY }],
          },
          contentStyle,
        ]}
      >
        <View style={styles.handleHit} {...panResponder.panHandlers}>
          <View style={styles.handle} />
        </View>
        {(title || titleRight) && (
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {titleRight ? (
              <View style={styles.headerRight}>{titleRight}</View>
            ) : null}
          </View>
        )}
        <View style={styles.body}>{children}</View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.scrim,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  handleHit: {
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
});
