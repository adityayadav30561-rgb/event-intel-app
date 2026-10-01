import type { EventType, PaletteId } from '../domain/types';

/** A configurable topic. Categories, technologies and industries all share this shape. */
export type Topic = {
  id: string;
  name: string;
  /** Extra words that should find this topic in search. */
  keywords?: string[];
  palette: PaletteId;
  /** Ionicons glyph name; the app maps it to an icon. */
  icon: string;
};

/** Event categories (spec §23). The server becomes the source of truth from Phase 2. */
export const CATEGORIES: Topic[] = [
  { id: 'erp', name: 'ERP & Enterprise Software', keywords: ['erp', 'enterprise software', 'enterprise applications'], palette: 'blue', icon: 'layers' },
  { id: 'crm', name: 'CRM & Customer Experience', keywords: ['crm', 'customer experience', 'cx'], palette: 'rose', icon: 'people' },
  { id: 'hr-tech', name: 'HR Technology', keywords: ['hrms', 'hr tech', 'payroll', 'future of work'], palette: 'rose', icon: 'id-card' },
  { id: 'mdm', name: 'Master Data Management', keywords: ['mdm', 'master data', 'data governance'], palette: 'slate', icon: 'server' },
  { id: 'supply-chain', name: 'Supply Chain', keywords: ['supply chain', 'scm'], palette: 'amber', icon: 'git-network' },
  { id: 'procurement', name: 'Procurement', keywords: ['procurement', 'sourcing', 'purchasing'], palette: 'amber', icon: 'cart' },
  { id: 'finance-tech', name: 'Finance Technology', keywords: ['finance', 'cfo', 'accounting'], palette: 'green', icon: 'cash' },
  { id: 'manufacturing', name: 'Manufacturing', keywords: ['manufacturing', 'factory', 'production', 'machine tool', 'machine tools', 'tooling', 'tooltech', 'imtex', 'foundry', 'casting', 'die casting', 'welding', 'surface finishing', 'metal forming', 'productronica'], palette: 'orange', icon: 'construct' },
  { id: 'industry-4', name: 'Industry 4.0', keywords: ['industry 4.0', 'smart factory', 'iiot'], palette: 'orange', icon: 'hardware-chip' },
  { id: 'automation', name: 'Industrial Automation', keywords: ['automation', 'robotics', 'plc'], palette: 'orange', icon: 'cog' },
  { id: 'ai', name: 'Artificial Intelligence', keywords: ['ai', 'artificial intelligence', 'genai', 'machine learning', 'ml'], palette: 'violet', icon: 'sparkles' },
  { id: 'cloud', name: 'Cloud', keywords: ['cloud', 'saas', 'aws', 'azure'], palette: 'sky', icon: 'cloud' },
  { id: 'devops', name: 'DevOps', keywords: ['devops', 'platform engineering', 'kubernetes'], palette: 'sky', icon: 'git-branch' },
  { id: 'cybersecurity', name: 'Cybersecurity', keywords: ['cybersecurity', 'cyber', 'security', 'ciso', 'zero trust', 'infosec'], palette: 'teal', icon: 'shield-checkmark' },
  { id: 'data', name: 'Data & Analytics', keywords: ['data', 'analytics', 'bi', 'database', 'mongodb', 'snowflake', 'databricks', 'big data'], palette: 'indigo', icon: 'analytics' },
  { id: 'digital-transformation', name: 'Digital Transformation', keywords: ['digital transformation', 'cio', 'it symposium', 'it leaders', 'technology leaders', 'cxo', 'tech summit', 'technology summit'], palette: 'indigo', icon: 'trending-up' },
  { id: 'it-services', name: 'IT Services', keywords: ['it services', 'outsourcing'], palette: 'blue', icon: 'desktop' },
  { id: 'fintech', name: 'FinTech', keywords: ['fintech', 'payments', 'banking'], palette: 'green', icon: 'card' },
  { id: 'logistics', name: 'Logistics', keywords: ['logistics', 'warehousing', 'freight'], palette: 'amber', icon: 'cube' },
  { id: 'retail-tech', name: 'Retail & E-commerce', keywords: ['retail', 'e-commerce', 'ecommerce', 'd2c'], palette: 'rose', icon: 'storefront' },
  { id: 'startups', name: 'Startups', keywords: ['startup', 'founders', 'venture'], palette: 'violet', icon: 'rocket' },
  { id: 'business', name: 'Business & Trade', keywords: ['msme', 'export', 'exporters', 'b2b', 'trade fair', 'trade show', 'buyer seller'], palette: 'slate', icon: 'briefcase' },
  { id: 'gov-tech', name: 'Government Technology', keywords: ['government', 'govtech', 'public sector', 'e-governance'], palette: 'teal', icon: 'business' },
];

/** Technologies and platforms users follow (spec §24). */
export const TECHNOLOGIES: Topic[] = [
  { id: 'sap', name: 'SAP', keywords: ['sap', 's/4hana', 's4hana', 'hana'], palette: 'blue', icon: 'layers' },
  { id: 'odoo', name: 'Odoo', keywords: ['odoo'], palette: 'violet', icon: 'apps' },
  { id: 'oracle', name: 'Oracle', keywords: ['oracle', 'netsuite'], palette: 'rose', icon: 'server' },
  { id: 'ms-dynamics', name: 'Microsoft Dynamics', keywords: ['dynamics', 'dynamics 365', 'microsoft dynamics'], palette: 'sky', icon: 'grid' },
  { id: 'salesforce', name: 'Salesforce', keywords: ['salesforce'], palette: 'sky', icon: 'cloud' },
  { id: 'zoho', name: 'Zoho', keywords: ['zoho'], palette: 'amber', icon: 'apps' },
  { id: 'erp-generic', name: 'ERP', keywords: ['erp'], palette: 'blue', icon: 'layers' },
  { id: 'crm-generic', name: 'CRM', keywords: ['crm'], palette: 'rose', icon: 'people' },
  { id: 'hrms', name: 'HRMS', keywords: ['hrms', 'hcm', 'payroll'], palette: 'rose', icon: 'id-card' },
  { id: 'genai', name: 'Generative AI', keywords: ['genai', 'generative ai', 'llm'], palette: 'violet', icon: 'sparkles' },
  { id: 'ml', name: 'Machine Learning', keywords: ['machine learning', 'ml'], palette: 'violet', icon: 'git-merge' },
  { id: 'iot', name: 'IoT', keywords: ['iot', 'iiot', 'internet of things'], palette: 'orange', icon: 'radio' },
  { id: 'robotics', name: 'Robotics', keywords: ['robotics', 'robots', 'cobots'], palette: 'orange', icon: 'hardware-chip' },
  { id: 'rpa', name: 'RPA', keywords: ['rpa', 'process automation'], palette: 'indigo', icon: 'repeat' },
  { id: 'aws', name: 'AWS', keywords: ['aws', 'amazon web services'], palette: 'amber', icon: 'cloud' },
  { id: 'azure', name: 'Microsoft Azure', keywords: ['azure'], palette: 'sky', icon: 'cloud' },
  { id: 'gcp', name: 'Google Cloud', keywords: ['google cloud', 'gcp', 'gdg', 'devfest', 'google developer'], palette: 'blue', icon: 'cloud' },
  { id: 'kubernetes', name: 'Kubernetes', keywords: ['kubernetes', 'k8s', 'containers'], palette: 'sky', icon: 'cube' },
  { id: 'blockchain', name: 'Blockchain', keywords: ['blockchain', 'web3'], palette: 'slate', icon: 'link' },
];

/** Industries an event's audience comes from. */
export const INDUSTRIES: Topic[] = [
  { id: 'manufacturing', name: 'Manufacturing', palette: 'orange', icon: 'construct' },
  { id: 'automotive', name: 'Automotive', keywords: ['auto', 'automotive', 'ev', 'electric vehicle', 'mobility'], palette: 'slate', icon: 'car' },
  { id: 'pharma', name: 'Pharma & Life Sciences', keywords: ['pharma', 'pharmaceutical', 'pharmaceuticals', 'cphi', 'life sciences', 'biotech'], palette: 'teal', icon: 'flask' },
  { id: 'healthcare', name: 'Healthcare', keywords: ['healthcare', 'hospital', 'medical', 'medtech', 'med expo'], palette: 'teal', icon: 'medkit' },
  { id: 'bfsi', name: 'Banking & Financial Services', keywords: ['bfsi', 'banking', 'insurance'], palette: 'green', icon: 'cash' },
  { id: 'retail', name: 'Retail', keywords: ['retail', 'fmcg'], palette: 'rose', icon: 'storefront' },
  { id: 'logistics', name: 'Logistics', keywords: ['logistics', 'transport'], palette: 'amber', icon: 'cube' },
  { id: 'energy', name: 'Energy & Utilities', keywords: ['energy', 'power sector', 'renewable', 'solar', 'battery', 'batteries', 'hydrogen', 'wind energy', 'electricity', 'transmission'], palette: 'amber', icon: 'flash' },
  { id: 'construction', name: 'Construction & Real Estate', keywords: ['construction', 'infrastructure', 'real estate', 'cement', 'building materials'], palette: 'orange', icon: 'business' },
  { id: 'textiles', name: 'Textiles', keywords: ['textile', 'apparel'], palette: 'violet', icon: 'shirt' },
  { id: 'electronics', name: 'Electronics', keywords: ['electronics', 'electronica', 'semiconductor', 'semicon', 'ems', 'pcb', 'lighting', 'photonics', 'laser'], palette: 'indigo', icon: 'hardware-chip' },
  { id: 'government', name: 'Government & Public Sector', keywords: ['government', 'psu'], palette: 'teal', icon: 'business' },
  { id: 'it', name: 'Information Technology', keywords: ['information technology', 'software', 'saas', 'it services'], palette: 'blue', icon: 'desktop' },
  { id: 'education', name: 'Education', keywords: ['education', 'edtech'], palette: 'sky', icon: 'school' },
  { id: 'telecom', name: 'Telecom', keywords: ['telecom', 'telecommunications', 'mobile congress', '5g', '6g'], palette: 'sky', icon: 'cellular' },
  { id: 'aerospace', name: 'Aerospace & Defence', keywords: ['aerospace', 'aviation', 'defence', 'defense', 'space expo', 'space technology', 'drone', 'drones'], palette: 'slate', icon: 'airplane' },
  { id: 'agriculture', name: 'Agriculture & Food', keywords: ['agriculture', 'agritech', 'agri', 'agricon', 'farming', 'horticulture', 'dairy', 'food processing'], palette: 'green', icon: 'leaf' },
  { id: 'metals', name: 'Mining & Metals', keywords: ['mining', 'metals', 'steel', 'aluminium', 'aluminum', 'alucast', 'metallurgy'], palette: 'slate', icon: 'hammer' },
  { id: 'chemicals', name: 'Chemicals & Plastics', keywords: ['chemicals', 'plastics', 'polymers', 'packaging'], palette: 'green', icon: 'beaker' },
];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  conference: 'Conference',
  expo: 'Expo',
  exhibition: 'Exhibition',
  trade_show: 'Trade Show',
  summit: 'Summit',
  seminar: 'Seminar',
  workshop: 'Workshop',
  meetup: 'Meetup',
  networking: 'Networking Event',
  roundtable: 'Roundtable',
  webinar: 'Webinar',
  hackathon: 'Hackathon',
  training: 'Training',
  product_launch: 'Product Launch',
  industry_forum: 'Industry Forum',
  business_forum: 'Business Forum',
  technology_event: 'Technology Event',
  government_event: 'Government Event',
  community_event: 'Community Event',
  convention: 'Convention',
};

const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((item) => [item.id, item]));
const categoryMap = byId(CATEGORIES);
const technologyMap = byId(TECHNOLOGIES);
const industryMap = byId(INDUSTRIES);

export const getCategory = (id: string) => categoryMap.get(id);
export const getTechnology = (id: string) => technologyMap.get(id);
export const getIndustry = (id: string) => industryMap.get(id);

/** Display names for an event's topics, technologies first (they are the most specific). */
export function topicNames(event: { technologyIds: string[]; categoryIds: string[] }, max = 3): string[] {
  const names = [
    ...event.technologyIds.map((id) => getTechnology(id)?.name),
    ...event.categoryIds.map((id) => getCategory(id)?.name),
  ].filter((name): name is string => Boolean(name));
  return [...new Set(names)].slice(0, max);
}
