import React, { createContext, useContext, useMemo, useRef } from 'react';

export type AutoModeDenial = {
  toolName: string;
  /** Human-readable tool description shown in the permission UI. */
  display: string;
  /** Stable serialization of the tool input for matching later approvals. */
  inputKey: string;
  reason: string;
  timestamp: number;
};

type RecentDenialsStore = {
  getDenials: () => readonly AutoModeDenial[];
  recordDenial: (denial: AutoModeDenial) => void;
  removeDenial: (denial: AutoModeDenial) => void;
};

const MAX_RECENT_DENIALS = 20;

const RecentDenialsContext = createContext<RecentDenialsStore>({
  getDenials: () => [],
  recordDenial: () => {},
  removeDenial: () => {}
});

export function RecentDenialsProvider({
  children
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const denialsRef = useRef<AutoModeDenial[]>([]);
  const store = useMemo<RecentDenialsStore>(() => ({
    getDenials: () => denialsRef.current,
    recordDenial: denial => {
      denialsRef.current = [denial, ...denialsRef.current.slice(0, MAX_RECENT_DENIALS - 1)];
    },
    removeDenial: denial => {
      denialsRef.current = denialsRef.current.filter(candidate => candidate !== denial);
    }
  }), []);
  return <RecentDenialsContext.Provider value={store}>{children}</RecentDenialsContext.Provider>;
}

export function useRecentDenials(): RecentDenialsStore {
  return useContext(RecentDenialsContext);
}
