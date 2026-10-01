import type { EventQuery } from '../contracts/events';
import type { PaletteId } from '../domain/types';

/** Curated collections (spec §72): named lists defined by the same filters as Explore. */
export type Collection = { id: string; name: string; description: string; icon: string; palette: PaletteId; query: Omit<EventQuery, 'cursor' | 'limit'> };

export const COLLECTIONS: Collection[] = [
  { id: 'sap-india', name: 'SAP Events India', description: 'Conferences, forums and meetups about SAP.', icon: 'layers', palette: 'blue', query: { technologyIds: ['sap'] } },
  { id: 'erp-india', name: 'ERP Events India', description: 'Enterprise software and ERP events.', icon: 'apps', palette: 'indigo', query: { categoryIds: ['erp'] } },
  { id: 'manufacturing', name: 'Manufacturing Events', description: 'Expos and forums for manufacturers.', icon: 'construct', palette: 'orange', query: { categoryIds: ['manufacturing'] } },
  { id: 'odoo', name: 'Odoo Events', description: 'Meetups, workshops and partner days.', icon: 'grid', palette: 'violet', query: { technologyIds: ['odoo'] } },
  { id: 'tech-conferences', name: 'Technology Conferences', description: 'Conferences and summits.', icon: 'mic', palette: 'teal', query: { eventTypes: ['conference', 'summit'] } },
  { id: 'trade-shows', name: 'Expos and Trade Shows', description: 'Exhibitions, expos and trade fairs.', icon: 'storefront', palette: 'amber', query: { eventTypes: ['expo', 'exhibition', 'trade_show'] } },
  { id: 'north-india', name: 'North India', description: 'Delhi NCR, Punjab, Haryana, Rajasthan, UP and the hills.', icon: 'compass', palette: 'rose', query: { cityIds: ['zone-north'] } },
  { id: 'south-india', name: 'South India', description: 'Bengaluru, Hyderabad, Chennai, Kerala and more.', icon: 'compass', palette: 'green', query: { cityIds: ['zone-south'] } },
  { id: 'west-india', name: 'West India', description: 'Mumbai, Pune, Gujarat and Goa.', icon: 'compass', palette: 'sky', query: { cityIds: ['zone-west'] } },
  { id: 'east-india', name: 'East India', description: 'Kolkata, Odisha, Bihar, Jharkhand and the North East.', icon: 'compass', palette: 'amber', query: { cityIds: ['zone-east'] } },
  { id: 'delhi-ncr', name: 'Delhi NCR Events', description: 'Delhi, Gurugram, Noida and nearby.', icon: 'business', palette: 'slate', query: { cityIds: ['delhi-ncr'] } },
  { id: 'recently-added', name: 'Recently Added', description: 'The newest events, latest first.', icon: 'sparkles', palette: 'violet', query: { sort: 'recently_added' } },
];

export const getCollection = (id: string) => COLLECTIONS.find((c) => c.id === id);
