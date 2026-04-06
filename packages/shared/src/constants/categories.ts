// ================================================
// Document Categories
// ================================================

export const DOCUMENT_CATEGORIES = [
  'cultivation',
  'irrigation',
  'fertilization',
  'pest-management',
  'disease-control',
  'harvesting',
  'storage',
  'soil',
  'climate-environment',
  'date-palm-best-practices',
  'research-publications',
  'general-agriculture',
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  'cultivation': 'Cultivation',
  'irrigation': 'Irrigation',
  'fertilization': 'Fertilization',
  'pest-management': 'Pest Management',
  'disease-control': 'Disease Control',
  'harvesting': 'Harvesting',
  'storage': 'Storage',
  'soil': 'Soil',
  'climate-environment': 'Climate & Environment',
  'date-palm-best-practices': 'Date Palm Best Practices',
  'research-publications': 'Research & Publications',
  'general-agriculture': 'General Agriculture',
};
