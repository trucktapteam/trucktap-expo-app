import { getTruckCoachMessage, TruckCoachMessage } from '@/lib/truckCoach';
import { TruckCommandCenter, TruckNextBestAction } from '@/lib/truckCommandCenter';
import { TruckOpportunity, TruckOpportunityAction } from '@/lib/truckOpportunities';

type CoachInsight = Pick<TruckCoachMessage, 'headline' | 'message' | 'encouragement'>;

export type TruckDashboardRecommendations = {
  nextActionMessage: string;
  coach: TruckCoachMessage;
  roadTip: {
    id: TruckNextBestAction;
    summary: string;
    detail: string;
  };
  opportunities: TruckOpportunity[];
};

const coachInsights: Record<TruckNextBestAction, CoachInsight> = {
  'Add Truck Name': {
    headline: 'Why identity matters',
    message: 'Your truck name is how customers recognize and search for your business.',
    encouragement: 'A consistent name makes search, recommendations, and word-of-mouth easier to connect back to your truck.',
  },
  'Upload Logo': {
    headline: 'Why identity matters',
    message: 'A recognizable logo helps customers spot your truck across the app.',
    encouragement: 'Using the same clear logo across your profile and social channels builds familiarity and trust over time.',
  },
  'Upload Hero Image': {
    headline: 'Why photos matter',
    message: 'A strong hero image helps customers recognize your truck at a glance.',
    encouragement: 'A bright, current cover photo gives people confidence that they have found the right truck and helps them decide faster.',
  },
  'Add Bio': {
    headline: 'Tell your story',
    message: 'A short bio helps customers understand what makes your truck special.',
    encouragement: 'A few memorable details about your food, story, or community can turn a first visit into a lasting connection.',
  },
  'Add Service Area': {
    headline: 'Help customers plan',
    message: 'A service area gives customers a quick sense of where they can find you.',
    encouragement: 'A familiar city or region label reduces uncertainty before customers look at your exact LIVE location or schedule.',
  },
  'Add Menu': {
    headline: 'Build customer confidence',
    message: 'Menus help customers understand what you serve before they visit.',
    encouragement: 'Clear item names, prices, and photos reduce decision time and make choosing your truck easier.',
  },
  'Add Gallery Photos': {
    headline: 'Show what makes you special',
    message: 'Gallery photos help customers picture the food and experience you offer.',
    encouragement: 'A mix of food, truck, and service photos makes the profile feel active and gives new customers more reasons to trust their choice.',
  },
  'Add Operating Hours': {
    headline: 'Set clear expectations',
    message: 'Operating hours help customers understand when your truck is typically available.',
    encouragement: 'Even approximate recurring hours set useful expectations, while LIVE status and scheduled stops provide the precise details.',
  },
  'Go LIVE': {
    headline: 'Be visible nearby',
    message: 'LIVE status tells nearby customers that you are serving right now.',
    encouragement: 'Keeping both status and location current reassures nearby customers that the trip is worth making.',
  },
  'Add Upcoming Stop': {
    headline: 'Help customers plan ahead',
    message: 'Customers are more likely to visit trucks with upcoming stops.',
    encouragement: 'Keeping one or two future stops scheduled helps followers plan visits, keeps your truck looking active, and encourages repeat customers.',
  },
  'Check Messages': {
    headline: 'Stay informed',
    message: 'Owner messages can contain updates that affect your truck or service day.',
    encouragement: 'Checking updates regularly helps you catch important account or service information before it affects the day.',
  },
  'Add Announcement': {
    headline: 'Keep followers engaged',
    message: 'Announcements give regulars a reason to check back between events.',
    encouragement: 'Short, timely updates keep the profile feeling active and give followers a reason to return between scheduled stops.',
  },
  'Respond to Reviews': {
    headline: 'Build customer trust',
    message: 'Thoughtful review replies show customers that their feedback matters.',
    encouragement: 'Visible, thoughtful engagement shows future customers that you listen and care about the experience you provide.',
  },
  "Great Job — You're Ready": {
    headline: 'Great job!',
    message: 'Your profile and daily details are looking great.',
    encouragement: 'Consistent LIVE activity, current schedules, and occasional updates will keep that momentum going.',
  },
  'No action available': {
    headline: 'Here when you need it',
    message: 'There are no owner recommendations to review right now.',
    encouragement: 'TruckTap Coach will surface a new Road Tip when your profile, schedule, or customer activity creates useful guidance.',
  },
};

const opportunityActionByNextAction: Record<TruckNextBestAction, TruckOpportunityAction | null> = {
  'Add Truck Name': null,
  'Upload Logo': null,
  'Upload Hero Image': null,
  'Add Bio': null,
  'Add Service Area': null,
  'Add Menu': 'menu',
  'Add Gallery Photos': 'gallery',
  'Add Operating Hours': null,
  'Go LIVE': 'goLive',
  'Add Upcoming Stop': 'schedule',
  'Check Messages': null,
  'Add Announcement': 'announcement',
  'Respond to Reviews': 'reviews',
  "Great Job — You're Ready": null,
  'No action available': null,
};

export function coordinateTruckDashboardRecommendations(
  commandCenter: TruckCommandCenter,
  opportunities: TruckOpportunity[]
): TruckDashboardRecommendations {
  const actionCoach = getTruckCoachMessage(commandCenter);
  const insight = coachInsights[commandCenter.nextAction];
  const activeOpportunityAction = opportunityActionByNextAction[commandCenter.nextAction];
  const seenActions = new Set<TruckOpportunityAction>();

  const secondaryOpportunities = opportunities.filter(opportunity => {
    if (activeOpportunityAction && opportunity.action === activeOpportunityAction) return false;
    if (opportunity.action === 'none') return true;
    if (seenActions.has(opportunity.action)) return false;

    seenActions.add(opportunity.action);
    return true;
  });

  return {
    nextActionMessage: actionCoach.message,
    coach: {
      ...actionCoach,
      ...insight,
      estimatedTime: '',
    },
    roadTip: {
      id: commandCenter.nextAction,
      summary: insight.message,
      detail: insight.encouragement,
    },
    opportunities: secondaryOpportunities,
  };
}
