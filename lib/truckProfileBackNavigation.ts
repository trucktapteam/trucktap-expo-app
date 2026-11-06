// Decision logic for leaving a truck profile screen.
//
// /truck/[id] is a root-level route (see app/_layout.tsx) used by every
// external entry point into a truck profile - push notifications, QR/shared
// URLs, universal/app links, the trucktap:// scheme, and cold-start native
// intents (see NotificationResponseCoordinator, DeepLinkRouteCoordinator,
// and +native-intent.tsx). All of those navigate with router.replace(), and
// on a cold start the app deliberately skips its own default redirect to
// Discover while a notification/deep-link route is pending (see
// app/index.tsx), so /truck/[id] can end up as the *only* entry in the root
// stack with nothing beneath it for router.back() to return to.
//
// /(customer)/truck/[id] (opened by tapping a truck from Discover/Map) is a
// different route entirely, pushed onto the customer tab navigator's own
// stack, which always has Discover beneath it - that path is unaffected by
// any of this and keeps using plain router.back().
export const CUSTOMER_DISCOVER_ROUTE = '/(customer)/(tabs)/discover';

export type TruckProfileBackAction =
  | { type: 'back' }
  | { type: 'replace'; route: string };

/**
 * Decide how to leave a truck profile screen that may have been opened as
 * the root of the navigation stack. When real history exists, back()
 * behaves normally. When it doesn't (this screen is the root), fall back to
 * Discover instead of leaving the customer stranded with nowhere to go.
 */
export const resolveTruckProfileBackAction = (canGoBack: boolean): TruckProfileBackAction => (
  canGoBack ? { type: 'back' } : { type: 'replace', route: CUSTOMER_DISCOVER_ROUTE }
);
