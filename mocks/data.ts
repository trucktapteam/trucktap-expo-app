import { TeamUpdate } from '@/types';

export const teamUpdates: TeamUpdate[] = [
  {
    id: 'update-1',
    title: 'New Analytics Features Available',
    body: 'We\'ve added detailed analytics to help you understand your customer engagement better. Check out the new QR scan tracking, photo view counts, and menu interaction stats in your dashboard.',
    date: '2026-01-08T10:00:00Z',
    important: true,
  },
  {
    id: 'update-2',
    title: 'Winter Weather Tip',
    body: 'Don\'t forget to update your status to "Closed" if weather conditions prevent you from operating. Your regular customers will appreciate knowing in advance, and you can post an announcement with your expected return date.',
    date: '2026-01-05T14:30:00Z',
    important: false,
  },
  {
    id: 'update-3',
    title: 'Profile Photos Drive 40% More Views',
    body: 'Our data shows that trucks with 5+ high-quality photos in their gallery receive 40% more profile views than those with fewer images. Make sure to showcase your truck, food, and atmosphere!',
    date: '2026-01-03T09:00:00Z',
    important: false,
  },
  {
    id: 'update-4',
    title: 'Action Required: Verify Your Profile',
    body: 'To build trust with customers and improve your visibility in search results, complete the verification process in your Profile tab. Verified trucks appear higher in search and get a blue checkmark badge.',
    date: '2025-12-28T16:00:00Z',
    important: true,
  },
  {
    id: 'update-5',
    title: 'Holiday Hours Reminder',
    body: 'Make sure your operating hours are up to date for the new year. Customers rely on accurate hours to plan their visits. You can update your schedule anytime in Settings > Operating Hours.',
    date: '2025-12-20T11:00:00Z',
    important: false,
  },
];

export const cuisineTypes = [
  'All',
  'Mexican',
  'American',
  'Italian',
  'Asian',
  'Thai',
  'Japanese',
  'Chinese',
  'Indian',
  'Mediterranean',
  'BBQ',
];
