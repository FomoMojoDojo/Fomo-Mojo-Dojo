export const FILE_CATEGORIES = [
  'Research',
  'Strategy',
  'Competitive',
  'Brand',
  'Financial',
  'Positioning',
  'Marketing',
  'Customer Data',
  'Operations',
  'Legal',
  'Other',
] as const;

export type FileCategory = (typeof FILE_CATEGORIES)[number];
