type ScheduledNotificationLike = {
  identifier: string;
  content: {
    data?: Record<string, unknown> | null;
  };
};

export const getUpcomingStopReminderIds = (
  notifications: ScheduledNotificationLike[]
) => {
  const reminderIds: Record<string, string> = {};

  for (const notification of notifications) {
    const data = notification.content.data;
    if (data?.type !== 'upcoming_stop_reminder') continue;

    const stopId = data.stop_id ?? data.stopId;
    if (stopId === null || stopId === undefined) continue;

    reminderIds[String(stopId)] = notification.identifier;
  }

  return reminderIds;
};
