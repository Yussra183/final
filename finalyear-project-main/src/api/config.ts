/**
 * Centralized API configuration.
 *
 * USE_MOCK is now `false` — the app talks to the live Spring Boot backend.
 * BASE_URL points at the dev machine's LAN IP so Expo Go on a physical
 * device can reach Spring Boot running on port 8080.
 *   - Android emulator:  http://10.0.2.2:8080
 *   - iOS simulator:     http://localhost:8080
 *   - Physical device:   http://<your-LAN-IP>:8080
 *
 * Replace YOUR_LAN_IP with the LAN address of the machine running
 * `java -jar target/gas-delivery-0.0.1-SNAPSHOT.jar`.
 */

export const API_CONFIG = {
  /** Toggle to switch between the in-memory mock store and the real API. */
  USE_MOCK: false,

  /**
   * Base URL of the Spring Boot backend. No trailing slash.
   * Override per-machine: pick the IP your device/emulator can reach.
   *   - Android emulator:  http://10.0.2.2:8080
   *   - iOS simulator:     http://localhost:8080
   *   - Physical device:   http://<your-LAN-IP>:8080
   */
  BASE_URL: "http://10.199.203.181:8080",


  /** Default request timeout, in milliseconds. */
  TIMEOUT_MS: 15000,

  /** Optional API key / version header for the backend. */
  API_VERSION: "v1",
} as const;

export type ApiConfig = typeof API_CONFIG;
