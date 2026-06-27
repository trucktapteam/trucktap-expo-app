import { TruckCommandCenter, TruckNextBestAction } from '@/lib/truckCommandCenter';

export type TruckCoachSeverity = 'actionRequired' | 'warning' | 'info' | 'success';

export type TruckCoachMessage = {
  headline: string;
  message: string;
  encouragement: string;
  estimatedTime: string;
  celebration: string;
  severity: TruckCoachSeverity;
};

const defaultCoachMessage: TruckCoachMessage = {
  headline: "Today's Mission",
  message: 'Keep your truck profile fresh.',
  encouragement: 'Small updates help customers know where to find you.',
  estimatedTime: 'About 1 minute.',
  celebration: '',
  severity: 'info',
};

const actionTemplates: Record<TruckNextBestAction, TruckCoachMessage> = {
  'Add Truck Name': {
    headline: "Today's Mission",
    message: 'Add your truck name.',
    encouragement: "Customers can't discover your truck until this is complete.",
    estimatedTime: 'About 30 seconds.',
    celebration: '',
    severity: 'actionRequired',
  },
  'Upload Logo': {
    headline: "Today's Mission",
    message: 'Upload your logo.',
    encouragement: "Customers can't discover your truck until this is complete.",
    estimatedTime: 'About 30 seconds.',
    celebration: '',
    severity: 'actionRequired',
  },
  'Upload Hero Image': {
    headline: "Today's Mission",
    message: 'Upload your hero image.',
    encouragement: 'A great cover photo helps customers recognize your truck.',
    estimatedTime: 'About 1 minute.',
    celebration: '',
    severity: 'actionRequired',
  },
  'Go LIVE': {
    headline: "Today's Mission",
    message: 'Go LIVE.',
    encouragement: 'Customers nearby are searching for food right now.',
    estimatedTime: 'About 30 seconds.',
    celebration: '',
    severity: 'warning',
  },
  'Add Upcoming Stop': {
    headline: "Today's Mission",
    message: 'Add your next stop.',
    encouragement: "Followers love knowing where you're headed next.",
    estimatedTime: 'About 1 minute.',
    celebration: '',
    severity: 'info',
  },
  'Check Messages': {
    headline: "Today's Mission",
    message: 'Check your messages.',
    encouragement: 'TruckTap updates help you keep your business moving.',
    estimatedTime: 'About 30 seconds.',
    celebration: '',
    severity: 'info',
  },
  'Add Announcement': {
    headline: "Today's Mission",
    message: 'Share an announcement.',
    encouragement: 'A quick update can bring regulars back today.',
    estimatedTime: 'About 1 minute.',
    celebration: '',
    severity: 'info',
  },
  'Respond to Reviews': {
    headline: "Today's Mission",
    message: 'Respond to your reviews.',
    encouragement: 'A thoughtful reply builds trust with future customers.',
    estimatedTime: 'About 2 minutes.',
    celebration: '',
    severity: 'info',
  },
  "Great Job — You're Ready": {
    headline: 'Great Job!',
    message: "You're ready for customers today.",
    encouragement: 'Keep your truck LIVE and your schedule updated.',
    estimatedTime: '',
    celebration: 'Your truck is ready and looking great.',
    severity: 'success',
  },
  'No action available': {
    headline: 'No Action Available',
    message: 'No owner action is available right now.',
    encouragement: 'Contact TruckTap support if you think this needs attention.',
    estimatedTime: '',
    celebration: '',
    severity: 'info',
  },
};

export function getTruckCoachMessage(commandCenter: TruckCommandCenter): TruckCoachMessage {
  return actionTemplates[commandCenter.nextAction] ?? defaultCoachMessage;
}
