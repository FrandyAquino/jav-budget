// Types for the matchers expo-router/testing-library registers at runtime
// (https://docs.expo.dev/router/reference/testing/#jest-matchers); the package
// does not ship declarations for them.
declare global {
  namespace jest {
    interface Matchers<R> {
      toHavePathname(pathname: string): R;
      toHavePathnameWithParams(pathname: string): R;
      toHaveSegments(segments: string[]): R;
      toHaveSearchParams(params: Record<string, string | string[]>): R;
      toHaveRouterState(state: object): R;
    }
  }
}
export {};
