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
  headline: 'Next Action',
  message: 'Keep your profile current.',
  encouragement: 'Small updates help customers find you.',
  estimatedTime: 'About 1 minute.',
  celebration: '',
  severity: 'info',
};

const actionTemplates: Record<TruckNextBestAction, TruckCoachMessage> = {
  'Add Truck Name': {
    headline: 'Next Action',
    message: 'Add your truck name.',
    encouragement: 'Customers cannot find your truck until this is done.',
    estimatedTime: 'About 30 seconds.',
    celebration: '',
    severity: 'actionRequired',
  },
  'Upload Logo': {
    headline: 'Next Action',
    message: 'Upload your logo.',
    encouragement: 'Customers cannot find your truck until this is done.',
    estimatedTime: 'About 30 seconds.',
    celebration: '',
    severity: 'actionRequired',
  },
  'Upload Hero Image': {
    headline: 'Next Action',
    message: 'Upload a hero image.',
    encouragement: 'A clear cover photo helps customers recognize your truck.',
    estimatedTime: 'About 1 minute.',
    celebration: '',
    severity: 'actionRequired',
  },
  'Add Service Area': {
    headline: 'Next Action',
    message: 'Add your service area.',
    encouragement: 'A primary location label helps customers understand where to find you.',
    estimatedTime: 'About 1 minute.',
    celebration: '',
    severity: 'info',
  },
  'Add Menu': {
    headline: 'Next Action',
    message: 'Add a menu.',
    encouragement: 'Menu items or a menu-board photo help customers decide what to order.',
    estimatedTime: 'About 2 minutes.',
    celebration: '',
    severity: 'info',
  },
  'Add Gallery Photos': {
    headline: 'Next Action',
    message: 'Add at least 3 gallery photos.',
    encouragement: 'Photos make your profile feel active and trustworthy.',
    estimatedTime: 'About 2 minutes.',
    celebration: '',
    severity: 'info',
  },
  'Add Operating Hours': {
    headline: 'Next Action',
    message: 'Add operating hours.',
    encouragement: 'Hours set customer expectations before you go LIVE.',
    estimatedTime: 'About 1 minute.',
    celebration: '',
    severity: 'info',
  },
  'Go LIVE': {
    headline: 'Next Action',
    message: 'Go LIVE.',
    encouragement: 'Customers nearby are looking for food right now.',
    estimatedTime: 'About 30 seconds.',
    celebration: '',
    severity: 'warning',
  },
  'Add Upcoming Stop': {
    headline: 'Next Action',
    message: 'Add your next stop.',
    encouragement: 'Customers want to know where you will be next.',
    estimatedTime: 'About 1 minute.',
    celebration: '',
    severity: 'info',
  },
  'Check Messages': {
    headline: 'Next Action',
    message: 'Check your messages.',
    encouragement: 'New updates can affect your day.',
    estimatedTime: 'About 30 seconds.',
    celebration: '',
    severity: 'info',
  },
  'Add Announcement': {
    headline: 'Next Action',
    message: 'Share an announcement.',
    encouragement: 'A quick update can bring regulars back today.',
    estimatedTime: 'About 1 minute.',
    celebration: '',
    severity: 'info',
  },
  'Respond to Reviews': {
    headline: 'Next Action',
    message: 'Respond to reviews.',
    encouragement: 'A quick reply builds trust with future customers.',
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
  if (commandCenter.nextAction === 'Go LIVE' && commandCenter.eventReadiness === 'starts_soon') {
    return {
      headline: 'Next Action',
      message: 'Go LIVE before your event begins.',
      encouragement: 'Customers will be looking for your truck soon.',
      estimatedTime: '30 seconds.',
      celebration: '',
      severity: 'warning',
    };
  }

  if (commandCenter.nextAction === 'Go LIVE' && commandCenter.eventReadiness === 'started') {
    return {
      headline: 'Next Action',
      message: 'Go LIVE now.',
      encouragement: "Customers may think you're closed until you go LIVE.",
      estimatedTime: '30 seconds.',
      celebration: '',
      severity: 'warning',
    };
  }

  if (commandCenter.nextAction === "Great Job — You're Ready" && commandCenter.eventReadiness === 'live_ready') {
    return {
      headline: 'Great Job!',
      message: "You're LIVE and ready for customers.",
      encouragement: 'Keep an eye on your event and stay visible while customers are nearby.',
      estimatedTime: '',
      celebration: "You're LIVE and ready for customers.",
      severity: 'success',
    };
  }

  return actionTemplates[commandCenter.nextAction] ?? defaultCoachMessage;
}
