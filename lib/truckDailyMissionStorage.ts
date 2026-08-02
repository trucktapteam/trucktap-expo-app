import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveDailyTruckMission } from '@/lib/truckDailyMission';
import type { TruckCommandCenter } from '@/lib/truckCommandCenter';
import type { TruckOpportunity } from '@/lib/truckOpportunities';

export const resolveStoredDailyTruckMission = (input: {
  truckId: string;
  date: Date;
  commandCenter: TruckCommandCenter;
  opportunities: TruckOpportunity[];
}) => resolveDailyTruckMission(input, AsyncStorage);
