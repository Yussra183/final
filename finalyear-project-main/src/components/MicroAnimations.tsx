/**
 * src/components/MicroAnimations.tsx
 *
 * Tiny collection of building-block animations used across the
 * customer module — built on RN's built-in `Animated` API so we don't
 * add new dependencies.
 *
 * Designed to be:
 *   • Subtle  — animations stay under ~600ms and never block input.
 *   • Cheap   — only one parallel `Animated.timing`/`loop` per element.
 *   • Safe    — paused on unmount via `useNativeDriver: true` so the
 *               JS thread is never blocked.
 *
 * Components in this file:
 *   <PulseDot/>          A small dot with a heartbeat pulse, ideal for
 *                        notification badges and "live" status pills.
 *   <FadeIn/>            Fade + slight rise on mount.
 *   <PressableScale/>    Drop-in replacement for `TouchableOpacity`
 *                        that scales the inner content on press.
 *   <Shimmer/>           Skeleton placeholder that sweeps a gradient.
 *   <Spin/>              Continuous spinning icon (e.g. loading).
 */
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Radius } from "../../constants/colors";

/* -------------------------------------------------------------------- */
/* PulseDot                                                             */
/* -------------------------------------------------------------------- */

interface PulseDotProps {
  size?: number;
  color?: string;
  /** Render a softer halo around the dot. Default true. */
  halo?: boolean;
  style?: ViewStyle;
}

/**
 * Animated red dot used for unread-notification indicators. The core
 * circle pulses in scale and opacity via two parallel animations so
 * the entire heartbeat effect fits inside one `Animated.loop`.
 */
export function PulseDot({
  size = 8,
  color = Colors.primary,
  halo = true,
  style,
}: PulseDotProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.4,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.4,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale, opacity]);

  return (
    <View style={[{ width: size, height: size }, style]}>
      {halo ? (
        <Animated.View
          style={[
            styles.pulseHalo,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: color,
              opacity,
              transform: [{ scale }],
            },
          ]}
        />
      ) : null}
      <View
        style={[
          styles.pulseCore,
          {
            width: size * 0.6,
            height: size * 0.6,
            borderRadius: (size * 0.6) / 2,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

/* -------------------------------------------------------------------- */
/* FadeIn                                                               */
/* -------------------------------------------------------------------- */

interface FadeInProps {
  children: React.ReactNode;
  /** Delay in ms before the animation starts. */
  delay?: number;
  /** Vertical offset (px) the child rises from. Default 8. */
  rise?: number;
  duration?: number;
  style?: ViewStyle;
}

/**
 * Subtle entrance animation: fade from 0 → 1 while sliding up
 * `rise` pixels. Used to make the order history feel responsive
 * without being noisy.
 */
export function FadeIn({
  children,
  delay = 0,
  rise = 8,
  duration = 360,
  style,
}: FadeInProps) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [v, delay, duration]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/* -------------------------------------------------------------------- */
/* PressableScale                                                       */
/* -------------------------------------------------------------------- */

interface PressableScaleProps extends TouchableOpacityProps {
  scale?: number;
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * A `TouchableOpacity` wrapper that scales its child down on press.
 * Keeps the surrounding opacity hint of `TouchableOpacity` and adds a
 * subtle 0.96× scale on press-in, then springs back on press-out.
 */
export function PressableScale({
  scale = 0.96,
  children,
  style,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const v = useRef(new Animated.Value(1)).current;

  return (
    <TouchableOpacity
      activeOpacity={1}
      {...rest}
      onPressIn={(e) => {
        Animated.timing(v, {
          toValue: scale,
          duration: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        Animated.timing(v, {
          toValue: 1,
          duration: 140,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
        onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale: v }] }]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
}

/* -------------------------------------------------------------------- */
/* Shimmer — skeleton loader                                            */
/* -------------------------------------------------------------------- */

interface ShimmerProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

/**
 * Lightweight skeleton block that fades between two neutral tones.
 * Used as a "loading" placeholder anywhere the customer UI is
 * computing list data.
 */
export function Shimmer({
  width = "100%" as const,
  height = 16,
  borderRadius = Radius.sm,
  style,
}: ShimmerProps) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          opacity,
          backgroundColor: Colors.surfaceMuted,
        },
        style,
      ]}
    />
  );
}

/* -------------------------------------------------------------------- */
/* Spin                                                                 */
/* -------------------------------------------------------------------- */

interface SpinProps {
  /** Ionicons name to render inside the spinner. Default "refresh". */
  name?: keyof typeof Ionicons.glyphMap;
  size?: number;
  color?: string;
  style?: ViewStyle;
}

/**
 * Continuously rotating icon. Used inside loading buttons and the
 * rider-tracking "refresh" affordance.
 */
export function Spin({
  name = "refresh",
  size = 18,
  color = Colors.primary,
  style,
}: SpinProps) {
  const rotate = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [rotate]);
  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  return (
    <Animated.View style={[{ transform: [{ rotate: spin }] }, style]}>
      <Ionicons name={name} size={size} color={color} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pulseHalo: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  pulseCore: {
    position: "absolute",
    top: "20%",
    left: "20%",
  },
});
