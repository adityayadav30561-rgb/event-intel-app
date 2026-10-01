/**
 * Indian cities with coordinates and search aliases (spec §19). This is a starting set for search,
 * filters and demo data; the database (Phase 2) supports any Indian city.
 */
export type City = {
  id: string;
  name: string;
  state: string;
  /** Other spellings and old names, matched in search. */
  aliases?: string[];
  /** Metro region the city belongs to, e.g. Delhi NCR. */
  region?: RegionId;
  latitude: number;
  longitude: number;
  /** Shown first in city pickers. */
  popular?: boolean;
};

export type RegionId = 'delhi-ncr' | 'mumbai-mmr';

export const REGIONS: { id: RegionId; name: string; aliases: string[] }[] = [
  { id: 'delhi-ncr', name: 'Delhi NCR', aliases: ['ncr', 'delhi ncr', 'delhi-ncr'] },
  { id: 'mumbai-mmr', name: 'Mumbai Metropolitan Region', aliases: ['mmr'] },
];

export const CITIES: City[] = [
  { id: 'delhi', name: 'New Delhi', state: 'Delhi', aliases: ['delhi', 'new delhi'], region: 'delhi-ncr', latitude: 28.6139, longitude: 77.209, popular: true },
  { id: 'gurugram', name: 'Gurugram', state: 'Haryana', aliases: ['gurgaon'], region: 'delhi-ncr', latitude: 28.4595, longitude: 77.0266, popular: true },
  { id: 'noida', name: 'Noida', state: 'Uttar Pradesh', aliases: ['greater noida'], region: 'delhi-ncr', latitude: 28.5355, longitude: 77.391, popular: true },
  { id: 'ghaziabad', name: 'Ghaziabad', state: 'Uttar Pradesh', region: 'delhi-ncr', latitude: 28.6692, longitude: 77.4538 },
  { id: 'faridabad', name: 'Faridabad', state: 'Haryana', region: 'delhi-ncr', latitude: 28.4089, longitude: 77.3178 },
  { id: 'mumbai', name: 'Mumbai', state: 'Maharashtra', aliases: ['bombay'], region: 'mumbai-mmr', latitude: 19.076, longitude: 72.8777, popular: true },
  { id: 'navi-mumbai', name: 'Navi Mumbai', state: 'Maharashtra', region: 'mumbai-mmr', latitude: 19.033, longitude: 73.0297 },
  { id: 'thane', name: 'Thane', state: 'Maharashtra', region: 'mumbai-mmr', latitude: 19.2183, longitude: 72.9781 },
  { id: 'pune', name: 'Pune', state: 'Maharashtra', aliases: ['poona'], latitude: 18.5204, longitude: 73.8567, popular: true },
  { id: 'bengaluru', name: 'Bengaluru', state: 'Karnataka', aliases: ['bangalore', 'blr'], latitude: 12.9716, longitude: 77.5946, popular: true },
  { id: 'hyderabad', name: 'Hyderabad', state: 'Telangana', aliases: ['hyd', 'secunderabad', 'cyberabad'], latitude: 17.385, longitude: 78.4867, popular: true },
  { id: 'chennai', name: 'Chennai', state: 'Tamil Nadu', aliases: ['madras'], latitude: 13.0827, longitude: 80.2707, popular: true },
  { id: 'kolkata', name: 'Kolkata', state: 'West Bengal', aliases: ['calcutta'], latitude: 22.5726, longitude: 88.3639, popular: true },
  { id: 'ahmedabad', name: 'Ahmedabad', state: 'Gujarat', aliases: ['amdavad'], latitude: 23.0225, longitude: 72.5714, popular: true },
  { id: 'gandhinagar', name: 'Gandhinagar', state: 'Gujarat', latitude: 23.2156, longitude: 72.6369 },
  { id: 'surat', name: 'Surat', state: 'Gujarat', latitude: 21.1702, longitude: 72.8311 },
  { id: 'vadodara', name: 'Vadodara', state: 'Gujarat', aliases: ['baroda'], latitude: 22.3072, longitude: 73.1812 },
  { id: 'jaipur', name: 'Jaipur', state: 'Rajasthan', latitude: 26.9124, longitude: 75.7873, popular: true },
  { id: 'goa', name: 'Goa', state: 'Goa', aliases: ['panaji', 'panjim'], latitude: 15.4909, longitude: 73.8278, popular: true },
  { id: 'lucknow', name: 'Lucknow', state: 'Uttar Pradesh', latitude: 26.8467, longitude: 80.9462 },
  { id: 'chandigarh', name: 'Chandigarh', state: 'Chandigarh', aliases: ['mohali', 'tricity'], latitude: 30.7333, longitude: 76.7794 },
  { id: 'indore', name: 'Indore', state: 'Madhya Pradesh', latitude: 22.7196, longitude: 75.8577 },
  { id: 'bhopal', name: 'Bhopal', state: 'Madhya Pradesh', latitude: 23.2599, longitude: 77.4126 },
  { id: 'nagpur', name: 'Nagpur', state: 'Maharashtra', latitude: 21.1458, longitude: 79.0882 },
  { id: 'kochi', name: 'Kochi', state: 'Kerala', aliases: ['cochin', 'ernakulam'], latitude: 9.9312, longitude: 76.2673 },
  { id: 'thiruvananthapuram', name: 'Thiruvananthapuram', state: 'Kerala', aliases: ['trivandrum'], latitude: 8.5241, longitude: 76.9366 },
  { id: 'coimbatore', name: 'Coimbatore', state: 'Tamil Nadu', aliases: ['kovai'], latitude: 11.0168, longitude: 76.9558 },
  { id: 'bhubaneswar', name: 'Bhubaneswar', state: 'Odisha', latitude: 20.2961, longitude: 85.8245 },
  { id: 'visakhapatnam', name: 'Visakhapatnam', state: 'Andhra Pradesh', aliases: ['vizag'], latitude: 17.6868, longitude: 83.2185 },
  { id: 'mysuru', name: 'Mysuru', state: 'Karnataka', aliases: ['mysore'], latitude: 12.2958, longitude: 76.6394 },
  { id: 'ludhiana', name: 'Ludhiana', state: 'Punjab', latitude: 30.901, longitude: 75.8573 },
  { id: 'guwahati', name: 'Guwahati', state: 'Assam', latitude: 26.1445, longitude: 91.7362 },
];

const cityMap = new Map(CITIES.map((city) => [city.id, city]));
export const getCity = (id: string) => cityMap.get(id);

export const regionCityIds = (region: RegionId) => CITIES.filter((city) => city.region === region).map((city) => city.id);
