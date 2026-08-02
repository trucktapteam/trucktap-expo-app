import type { TruckCommandCenter } from '@/lib/truckCommandCenter';
import {
  getCompletedDailyMission,
  getOpportunityMission,
  getSteadyStateMission,
  getUrgentMission,
  type TruckMission,
} from '@/lib/truckMission';
import type { TruckOpportunity } from '@/lib/truckOpportunities';

export type DailyMissionStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

type DailyMissionRecord = {
  dateKey: string;
  opportunityId: string;
  opportunityTitle: string;
  status: 'active' | 'completed';
};

type ResolveDailyMissionInput = {
  truckId: string;
  date: Date;
  commandCenter: TruckCommandCenter;
  opportunities: TruckOpportunity[];
};

const STORAGE_PREFIX = 'truckCoachDailyMission:v1';

export const getLocalCalendarDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const getDailyMissionStorageKey = (truckId: string, dateKey: string): string =>
  `${STORAGE_PREFIX}:${truckId}:${dateKey}`;

const getLocalCalendarDayNumber = (date: Date): number =>
  Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);

const hashTruckId = (truckId: string): number => {
  let hash = 0;
  for (let index = 0; index < truckId.length; index += 1) {
    hash = ((hash * 31) + truckId.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

export const selectDeterministicDailyOpportunity = (
  opportunities: TruckOpportunity[],
  truckId: string,
  date: Date
): TruckOpportunity | null => {
  if (opportunities.length === 0) return null;
  const index = (hashTruckId(truckId) + getLocalCalendarDayNumber(date)) % opportunities.length;
  return opportunities[index];
};

const parseRecord = (value: string | null, dateKey: string): DailyMissionRecord | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<DailyMissionRecord>;
    if (
      parsed.dateKey !== dateKey ||
      typeof parsed.opportunityId !== 'string' ||
      typeof parsed.opportunityTitle !== 'string' ||
      (parsed.status !== 'active' && parsed.status !== 'completed')
    ) {
      return null;
    }
    return parsed as DailyMissionRecord;
  } catch {
    return null;
  }
};

export async function resolveDailyTruckMission(
  input: ResolveDailyMissionInput,
  storage: DailyMissionStorage
): Promise<TruckMission> {
  const urgentMission = getUrgentMission(input.commandCenter);
  if (urgentMission) return urgentMission;

  const dateKey = getLocalCalendarDateKey(input.date);
  const storageKey = getDailyMissionStorageKey(input.truckId, dateKey);
  const record = parseRecord(await storage.getItem(storageKey), dateKey);

  if (record?.status === 'completed') {
    return getCompletedDailyMission(record.opportunityTitle);
  }

  if (record) {
    const persistedOpportunity = input.opportunities.find(
      opportunity => opportunity.id === record.opportunityId
    );
    if (persistedOpportunity) return getOpportunityMission(persistedOpportunity);

    const completedRecord: DailyMissionRecord = { ...record, status: 'completed' };
    await storage.setItem(storageKey, JSON.stringify(completedRecord));
    return getCompletedDailyMission(record.opportunityTitle);
  }

  const previousDate = new Date(input.date);
  previousDate.setDate(previousDate.getDate() - 1);
  const previousDateKey = getLocalCalendarDateKey(previousDate);
  const previousRecord = parseRecord(
    await storage.getItem(getDailyMissionStorageKey(input.truckId, previousDateKey)),
    previousDateKey
  );
  const rotatingOpportunities = previousRecord && input.opportunities.length > 1
    ? input.opportunities.filter(opportunity => opportunity.id !== previousRecord.opportunityId)
    : input.opportunities;
  const selected = selectDeterministicDailyOpportunity(
    rotatingOpportunities.length > 0 ? rotatingOpportunities : input.opportunities,
    input.truckId,
    input.date
  );
  if (!selected) return getSteadyStateMission(input.truckId);

  const nextRecord: DailyMissionRecord = {
    dateKey,
    opportunityId: selected.id,
    opportunityTitle: selected.title,
    status: 'active',
  };
  await storage.setItem(storageKey, JSON.stringify(nextRecord));
  return getOpportunityMission(selected);
}
