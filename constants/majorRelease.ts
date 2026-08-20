export type MajorReleaseCopy = {
  eyebrow: string;
  title: string;
  message: string;
  highlights: readonly string[];
  dismissLabel: string;
};

export type MajorReleaseAnnouncement = {
  id: string;
  platforms: readonly ('android' | 'ios')[];
  owner: MajorReleaseCopy;
  customer: MajorReleaseCopy;
};

// Set this to null when there is no meaningful release to announce. For a
// future rollout, replace the object and give it a new, stable id. Dismissal
// is stored per id, so a new release can be shown once without resurfacing an
// announcement the user has already closed.
export const ACTIVE_MAJOR_RELEASE: MajorReleaseAnnouncement | null = {
  id: '2026-08-faster-photo-uploads',
  platforms: ['android', 'ios'],
  owner: {
    eyebrow: 'WHAT’S NEW',
    title: 'Keeping your truck fresh just got easier.',
    message:
      'Updating your menu, photos, and event flyers should now take less waiting and less mobile data.',
    highlights: [
      'Large photos upload faster and more reliably.',
      'Menus, galleries, profiles, and event flyers all get the same smoother upload experience.',
    ],
    dismissLabel: 'Got it',
  },
  customer: {
    eyebrow: 'WHAT’S NEW',
    title: 'A little more privacy when you share a sighting.',
    message:
      'TruckTap sightings now share what people need to find a truck while keeping more of your information private.',
    highlights: [
      'Public sightings keep account details out of the feed and use a nearby location instead of an exact pin.',
      'Sighting and profile photos upload more reliably, especially on mobile data.',
    ],
    dismissLabel: 'Got it',
  },
};
