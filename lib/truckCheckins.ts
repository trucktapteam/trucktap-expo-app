import { supabase } from '@/lib/supabase';

export type TruckCheckIn = {
  truck_id: string;
  user_id: string;
  checkin_date: string;
  created_at?: string;
};

export const getLocalCheckInDate = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
};

export const fetchCurrentUserTruckCheckInCount = async (
  truckId: string,
  userId: string
): Promise<number> => {
  const { count, error } = await supabase
    .from('truck_checkins')
    .select('*', { count: 'exact', head: true })
    .eq('truck_id', truckId)
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  return count ?? 0;
};

export const hasCurrentUserCheckedInToday = async (
  truckId: string,
  userId: string,
  checkInDate = getLocalCheckInDate()
): Promise<boolean> => {
  const { count, error } = await supabase
    .from('truck_checkins')
    .select('*', { count: 'exact', head: true })
    .eq('truck_id', truckId)
    .eq('user_id', userId)
    .eq('checkin_date', checkInDate);

  if (error) {
    throw error;
  }

  return (count ?? 0) > 0;
};

export const insertCurrentUserTruckCheckIn = async (
  truckId: string,
  userId: string
): Promise<TruckCheckIn> => {
  const { data, error } = await supabase
    .from('truck_checkins')
    .insert({
      truck_id: truckId,
      user_id: userId,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as TruckCheckIn;
};
