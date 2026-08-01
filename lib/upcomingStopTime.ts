const minutesSinceMidnight = (date: Date) =>
  date.getHours() * 60 + date.getMinutes();

export const getStopDurationMinutes = (
  startTime: Date,
  endTime: Date,
  endsNextDay: boolean
) => {
  const startMinutes = minutesSinceMidnight(startTime);
  const endMinutes = minutesSinceMidnight(endTime) + (endsNextDay ? 24 * 60 : 0);
  const durationMinutes = endMinutes - startMinutes;

  return durationMinutes > 0 ? durationMinutes : null;
};

export const formatStopDuration = (durationMinutes: number | null) => {
  if (durationMinutes === null) return null;

  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
};
