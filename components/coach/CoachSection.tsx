import React from 'react';
import { View } from 'react-native';
import { TruckMission } from '@/lib/truckMission';
import { TruckOpportunity, TruckOpportunityAction } from '@/lib/truckOpportunities';
import { TruckSnapshotTile } from '@/lib/truckBusinessSnapshot';
import { TruckWin } from '@/lib/truckWins';
import TodaysMission from '@/components/coach/TodaysMission';
import BiggestOpportunities from '@/components/coach/BiggestOpportunities';
import BusinessSnapshot from '@/components/coach/BusinessSnapshot';
import Wins from '@/components/coach/Wins';

export type CoachSectionProps = {
  mission: TruckMission;
  opportunities: TruckOpportunity[];
  snapshotTiles: TruckSnapshotTile[];
  wins: TruckWin[];
  onAction: (action: TruckOpportunityAction) => void;
};

/**
 * Coach 2.0: business-mentor layout - Today's Mission, Biggest Opportunities,
 * Business Snapshot, Wins, in that order. Pure presentation; all ranking and
 * copy live in lib/truckMission.ts, lib/truckOpportunities.ts,
 * lib/truckBusinessSnapshot.ts, and lib/truckWins.ts.
 */
export default function CoachSection({
  mission,
  opportunities,
  snapshotTiles,
  wins,
  onAction,
}: CoachSectionProps) {
  return (
    <View>
      <TodaysMission mission={mission} onAction={onAction} />
      <BiggestOpportunities opportunities={opportunities} onAction={onAction} />
      <BusinessSnapshot tiles={snapshotTiles} />
      <Wins wins={wins} />
    </View>
  );
}
