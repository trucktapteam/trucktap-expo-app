import { usePathname, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';

export const useTruckLifecycleLogger = (screenName: string) => {
  const pathname = usePathname();
  const segments = useSegments();
  const routeRef = useRef({ pathname, segments: [...segments] });
  routeRef.current = { pathname, segments: [...segments] };

  useEffect(() => {
    if (__DEV__) {
      console.log(`[${screenName}] mounted`, {
        pathname: routeRef.current.pathname,
        segments: routeRef.current.segments,
      });
    }

    return () => {
      if (__DEV__) {
        console.log(`[${screenName}] unmounted`, {
          pathname: routeRef.current.pathname,
          segments: routeRef.current.segments,
        });
      }
    };
  }, [screenName]);
};
