/**
 * TraceGov Document Categories, Checklists, and Tracking Metadata
 * Derived from Nagarik Bada Patra (Municipal Citizen Charter) standards.
 */

export const DOCUMENT_TYPES = [
  'Recommendation Letter',
  'Tax Clearance Receipt',
  'Birth Certificate Registration',
  'Death Registration',
  'Marriage Certificate Registration',
  'Relationship (Kinship) Certificate',
  'Migration Certificate',
  'Character Certificate',
  'Unmarried Certificate',
  'Residence Certificate',
  'Income Certificate',
  'Land Valuation Claim',
  'House/Building Map Approval',
  'Citizenship Verification Request',
  'Business License Approval',
  'Business/Trade Renewal',
  'Senior Citizen ID / Social Security',
  'Disability ID Card',
  'Scholarship Recommendation',
];

/**
 * Category to Required Documents Mapping
 * Auto-populates required checklist items when a citizen or officer selects a document category.
 */
export const CATEGORY_CHECKLISTS = {
  'Recommendation Letter': [
    'Citizenship Copy',
    'Application Letter (Nivedan)',
    'Previous Tax Receipt',
  ],
  'Tax Clearance Receipt': [
    'Citizenship Copy',
    'Land/Property Ownership Copy',
    'Previous Year Tax Receipt',
  ],
  'Birth Certificate Registration': [
    'Hospital Birth Certificate / Proof',
    'Parents\' Citizenship Copy',
    'Parents\' Marriage Certificate',
  ],
  'Death Registration': [
    'Hospital Death Certificate / Local Verification',
    'Deceased\'s Citizenship Copy',
    'Applicant\'s Citizenship Copy',
  ],
  'Marriage Certificate Registration': [
    'Husband\'s Citizenship Copy',
    'Wife\'s Citizenship Copy',
    'Joint Passport Photo',
    'Ward Recommendation Letter',
  ],
  'Relationship (Kinship) Certificate': [
    'Applicant\'s Citizenship Copy',
    'Relatives\' Citizenship Copy',
    'Land Ownership Title Deed (Lalpurja)',
    'Ward Chair Field Verification',
  ],
  'Migration Certificate': [
    'Citizenship Copy of Head of Family',
    'Migration Destination Address Proof',
    'Tax Clearance Certificate',
  ],
  'Character Certificate': [
    'Citizenship Copy',
    'Police Clearance Report',
    'Passport Photo',
  ],
  'Unmarried Certificate': [
    'Citizenship Copy',
    'Ward Chair Recommendation',
    'Witness Identity Proofs',
  ],
  'Residence Certificate': [
    'Citizenship Copy',
    'House Ownership Document or Rent Agreement',
    'Electricity/Water Bill Receipt',
  ],
  'Income Certificate': [
    'Citizenship Copy',
    'Income Source Supporting Documents (Salary/Business/Land)',
    'Tax Payment Receipt',
  ],
  'Land Valuation Claim': [
    'Citizenship Copy',
    'Land Ownership Title Deed (Lalpurja)',
    'Previous Tax Invoice Receipt',
    'Ward Recommendation Letter',
  ],
  'House/Building Map Approval': [
    'Citizenship Copy',
    'Land Ownership Title Deed (Lalpurja)',
    'Building Design/Map Drawing',
    'Engineer Certification',
  ],
  'Citizenship Verification Request': [
    'Birth Certificate',
    'Parents\' Citizenship Copy',
    'Ward Recommendation Letter',
  ],
  'Business License Approval': [
    'Citizenship Copy of Proprietor',
    'Business Registration Form',
    'Rent Agreement / Land Deed',
    'Tax Office Clearance',
  ],
  'Business/Trade Renewal': [
    'Citizenship Copy',
    'Previous Business License',
    'Tax Clearance Receipt',
  ],
  'Senior Citizen ID / Social Security': [
    'Citizenship Copy (Age 60+)',
    'Passport Photo',
    'Ward Recommendation Letter',
  ],
  'Disability ID Card': [
    'Citizenship Copy / Birth Certificate',
    'Medical Officer Recommendation Report',
    'Passport Photo',
  ],
  'Scholarship Recommendation': [
    'Citizenship Copy / Birth Certificate',
    'Academic Transcripts / Mark Sheets',
    'School/College Recommendation Letter',
    'Income Certificate',
  ],
};

/**
 * Category Metadata
 * Metadata defining typical SLA turnaround time, desk count, and tracking utility.
 * 
 * TODO: Day estimates marked below are illustrative estimates derived from municipal charter patterns.
 * Verify these exact day-estimates against your target ward's published Nagarik Bada Patra before deployment.
 */
export const CATEGORY_META = {
  'Land Valuation Claim': { typicalDays: '5-10', deskCount: 'multi', trackingValue: 'high' }, // TODO: verify against charter
  'House/Building Map Approval': { typicalDays: '10-20', deskCount: 'multi', trackingValue: 'high' }, // TODO: verify against charter
  'Citizenship Verification Request': { typicalDays: '3-7', deskCount: 'multi', trackingValue: 'high' }, // TODO: verify against charter
  'Business License Approval': { typicalDays: '5-15', deskCount: 'multi', trackingValue: 'high' }, // TODO: verify against charter
  'Business/Trade Renewal': { typicalDays: '3-7', deskCount: 'multi', trackingValue: 'medium' }, // TODO: verify against charter
  'Migration Certificate': { typicalDays: '2-5', deskCount: 'multi', trackingValue: 'medium' }, // TODO: verify against charter
  'Disability ID Card': { typicalDays: '3-7', deskCount: 'multi', trackingValue: 'medium' }, // TODO: verify against charter
  'Senior Citizen ID / Social Security': { typicalDays: '2-5', deskCount: 'multi', trackingValue: 'medium' }, // TODO: verify against charter
  'Birth Certificate Registration': { typicalDays: '1-3', deskCount: 'multi', trackingValue: 'medium' }, // TODO: verify against charter
  'Death Registration': { typicalDays: '1-3', deskCount: 'multi', trackingValue: 'medium' }, // TODO: verify against charter
  'Marriage Certificate Registration': { typicalDays: '1-3', deskCount: 'multi', trackingValue: 'medium' }, // TODO: verify against charter
  'Relationship (Kinship) Certificate': { typicalDays: '2-4', deskCount: 'multi', trackingValue: 'medium' }, // TODO: verify against charter
  'Income Certificate': { typicalDays: '1-3', deskCount: 'multi', trackingValue: 'medium' }, // TODO: verify against charter
  'Scholarship Recommendation': { typicalDays: '1-3', deskCount: 'multi', trackingValue: 'medium' }, // TODO: verify against charter
  'Residence Certificate': { typicalDays: '0-1', deskCount: 'single', trackingValue: 'low' }, // TODO: verify against charter
  'Recommendation Letter': { typicalDays: '0-1', deskCount: 'single', trackingValue: 'low' }, // TODO: verify against charter
  'Tax Clearance Receipt': { typicalDays: '0-1', deskCount: 'single', trackingValue: 'low' }, // TODO: verify against charter
  'Character Certificate': { typicalDays: '0-1', deskCount: 'single', trackingValue: 'low' }, // TODO: verify against charter
  'Unmarried Certificate': { typicalDays: '0-1', deskCount: 'single', trackingValue: 'low' }, // TODO: verify against charter
};
