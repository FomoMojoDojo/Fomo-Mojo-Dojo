// Types for the Routes view
export interface RouteStep {
  id: string;
  title: string;
  status: 'complete' | 'in_progress' | 'not_started';
}

export interface EvidenceItem {
  id: string;
  title: string;
  status: 'complete' | 'in_progress' | 'missing';
}

export interface Route {
  id: string;
  title: string;
  category: 'fix' | 'improve' | 'create';
  shortDescription: string;
  mojoImpactPoints: number;
  effort: 'low' | 'medium' | 'high';
  status: 'in_progress' | 'not_started' | 'complete';
  recommended: boolean;
  dependencies: string[];
  steps: RouteStep[];
  evidenceChecklist: EvidenceItem[];
  whyRecommended: string[];
}

export interface ReadinessDimension {
  id: string;
  label: string;
  percentComplete: number;
  status: 'in_progress' | 'missing' | 'complete';
  summary: string;
}

export interface MojoScoreSummary {
  companyName: string;
  strategyMapLabel: string;
  lastUpdated: string;
  currentScore: number;
  weeklyDelta: number;
  potentialScore: number;
  potentialConditionLabel: string;
  inputsCompleteCount: number;
  inputsTotalCount: number;
  criticalGapsCount: number;
}

export interface RoutesData {
  mojoScoreSummary: MojoScoreSummary;
  readinessDimensions: ReadinessDimension[];
  routes: Route[];
}

import seedData from './routesSeedData.json';

export const ROUTES_DATA = seedData as RoutesData;
