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
  { id: 'pune', name: 'Pune', state: 'Maharashtra', aliases: ['poona', 'pimpri', 'chinchwad', 'pimpri chinchwad', 'moshi', 'hinjewadi'], latitude: 18.5204, longitude: 73.8567, popular: true },
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
  // Tier-2 cities and industrial hubs (event sources often name these).
  { id: 'manesar', name: 'Manesar', state: 'Haryana', region: 'delhi-ncr', latitude: 28.3515, longitude: 76.9428 },
  { id: 'sonipat', name: 'Sonipat', state: 'Haryana', region: 'delhi-ncr', latitude: 28.9931, longitude: 77.0151 },
  { id: 'panipat', name: 'Panipat', state: 'Haryana', latitude: 29.3909, longitude: 76.9635 },
  { id: 'amritsar', name: 'Amritsar', state: 'Punjab', latitude: 31.634, longitude: 74.8723 },
  { id: 'jalandhar', name: 'Jalandhar', state: 'Punjab', latitude: 31.326, longitude: 75.5762 },
  { id: 'dehradun', name: 'Dehradun', state: 'Uttarakhand', aliases: ['dehra dun'], latitude: 30.3165, longitude: 78.0322 },
  { id: 'shimla', name: 'Shimla', state: 'Himachal Pradesh', latitude: 31.1048, longitude: 77.1734 },
  { id: 'jammu', name: 'Jammu', state: 'Jammu and Kashmir', latitude: 32.7266, longitude: 74.857 },
  { id: 'srinagar', name: 'Srinagar', state: 'Jammu and Kashmir', latitude: 34.0837, longitude: 74.7973 },
  { id: 'agra', name: 'Agra', state: 'Uttar Pradesh', latitude: 27.1767, longitude: 78.0081 },
  { id: 'kanpur', name: 'Kanpur', state: 'Uttar Pradesh', latitude: 26.4499, longitude: 80.3319 },
  { id: 'varanasi', name: 'Varanasi', state: 'Uttar Pradesh', aliases: ['banaras', 'benares'], latitude: 25.3176, longitude: 82.9739 },
  { id: 'prayagraj', name: 'Prayagraj', state: 'Uttar Pradesh', aliases: ['allahabad'], latitude: 25.4358, longitude: 81.8463 },
  { id: 'patna', name: 'Patna', state: 'Bihar', latitude: 25.5941, longitude: 85.1376 },
  { id: 'ranchi', name: 'Ranchi', state: 'Jharkhand', latitude: 23.3441, longitude: 85.3096 },
  { id: 'jamshedpur', name: 'Jamshedpur', state: 'Jharkhand', latitude: 22.8046, longitude: 86.2029 },
  { id: 'raipur', name: 'Raipur', state: 'Chhattisgarh', latitude: 21.2514, longitude: 81.6296 },
  { id: 'cuttack', name: 'Cuttack', state: 'Odisha', latitude: 20.4625, longitude: 85.883 },
  { id: 'siliguri', name: 'Siliguri', state: 'West Bengal', latitude: 26.7271, longitude: 88.3953 },
  { id: 'durgapur', name: 'Durgapur', state: 'West Bengal', latitude: 23.5204, longitude: 87.3119 },
  { id: 'shillong', name: 'Shillong', state: 'Meghalaya', latitude: 25.5788, longitude: 91.8933 },
  { id: 'rourkela', name: 'Rourkela', state: 'Odisha', latitude: 22.2604, longitude: 84.8536 },
  { id: 'sambalpur', name: 'Sambalpur', state: 'Odisha', latitude: 21.4669, longitude: 83.9812 },
  { id: 'kharagpur', name: 'Kharagpur', state: 'West Bengal', latitude: 22.346, longitude: 87.232 },
  { id: 'haldia', name: 'Haldia', state: 'West Bengal', latitude: 22.0667, longitude: 88.0698 },
  { id: 'asansol', name: 'Asansol', state: 'West Bengal', latitude: 23.6739, longitude: 86.9524 },
  { id: 'dhanbad', name: 'Dhanbad', state: 'Jharkhand', latitude: 23.7957, longitude: 86.4304 },
  { id: 'bokaro', name: 'Bokaro', state: 'Jharkhand', aliases: ['bokaro steel city'], latitude: 23.6693, longitude: 86.1511 },
  { id: 'gaya', name: 'Gaya', state: 'Bihar', latitude: 24.7914, longitude: 85.0002 },
  { id: 'dibrugarh', name: 'Dibrugarh', state: 'Assam', latitude: 27.4728, longitude: 94.912 },
  { id: 'silchar', name: 'Silchar', state: 'Assam', latitude: 24.8333, longitude: 92.7789 },
  { id: 'agartala', name: 'Agartala', state: 'Tripura', latitude: 23.8315, longitude: 91.2868 },
  { id: 'imphal', name: 'Imphal', state: 'Manipur', latitude: 24.817, longitude: 93.9368 },
  { id: 'aizawl', name: 'Aizawl', state: 'Mizoram', latitude: 23.7271, longitude: 92.7176 },
  { id: 'kohima', name: 'Kohima', state: 'Nagaland', latitude: 25.6751, longitude: 94.1086 },
  { id: 'itanagar', name: 'Itanagar', state: 'Arunachal Pradesh', latitude: 27.0844, longitude: 93.6053 },
  { id: 'port-blair', name: 'Port Blair', state: 'Andaman and Nicobar Islands', aliases: ['sri vijaya puram'], latitude: 11.6234, longitude: 92.7265 },
  { id: 'gangtok', name: 'Gangtok', state: 'Sikkim', latitude: 27.3389, longitude: 88.6065 },
  { id: 'rajkot', name: 'Rajkot', state: 'Gujarat', latitude: 22.3039, longitude: 70.8022 },
  { id: 'gandhidham', name: 'Gandhidham', state: 'Gujarat', aliases: ['kandla'], latitude: 23.0753, longitude: 70.1337 },
  { id: 'vapi', name: 'Vapi', state: 'Gujarat', latitude: 20.3893, longitude: 72.911 },
  { id: 'ankleshwar', name: 'Ankleshwar', state: 'Gujarat', latitude: 21.6264, longitude: 73.0152 },
  { id: 'jodhpur', name: 'Jodhpur', state: 'Rajasthan', latitude: 26.2389, longitude: 73.0243 },
  { id: 'udaipur', name: 'Udaipur', state: 'Rajasthan', latitude: 24.5854, longitude: 73.7125 },
  { id: 'kota', name: 'Kota', state: 'Rajasthan', latitude: 25.2138, longitude: 75.8648 },
  { id: 'gwalior', name: 'Gwalior', state: 'Madhya Pradesh', latitude: 26.2183, longitude: 78.1828 },
  { id: 'jabalpur', name: 'Jabalpur', state: 'Madhya Pradesh', latitude: 23.1815, longitude: 79.9864 },
  { id: 'nashik', name: 'Nashik', state: 'Maharashtra', aliases: ['nasik'], latitude: 19.9975, longitude: 73.7898 },
  { id: 'aurangabad', name: 'Chhatrapati Sambhajinagar', state: 'Maharashtra', aliases: ['aurangabad', 'sambhajinagar'], latitude: 19.8762, longitude: 75.3433 },
  { id: 'kolhapur', name: 'Kolhapur', state: 'Maharashtra', latitude: 16.705, longitude: 74.2433 },
  { id: 'hubballi', name: 'Hubballi', state: 'Karnataka', aliases: ['hubli', 'hubli dharwad'], latitude: 15.3647, longitude: 75.124 },
  { id: 'mangaluru', name: 'Mangaluru', state: 'Karnataka', aliases: ['mangalore'], latitude: 12.9141, longitude: 74.856 },
  { id: 'belagavi', name: 'Belagavi', state: 'Karnataka', aliases: ['belgaum'], latitude: 15.8497, longitude: 74.4977 },
  { id: 'hosur', name: 'Hosur', state: 'Tamil Nadu', latitude: 12.7409, longitude: 77.8253 },
  { id: 'madurai', name: 'Madurai', state: 'Tamil Nadu', latitude: 9.9252, longitude: 78.1198 },
  { id: 'tiruchirappalli', name: 'Tiruchirappalli', state: 'Tamil Nadu', aliases: ['trichy', 'tiruchi'], latitude: 10.7905, longitude: 78.7047 },
  { id: 'salem', name: 'Salem', state: 'Tamil Nadu', latitude: 11.6643, longitude: 78.146 },
  { id: 'tiruppur', name: 'Tiruppur', state: 'Tamil Nadu', aliases: ['tirupur'], latitude: 11.1085, longitude: 77.3411 },
  { id: 'vijayawada', name: 'Vijayawada', state: 'Andhra Pradesh', latitude: 16.5062, longitude: 80.648 },
  { id: 'tirupati', name: 'Tirupati', state: 'Andhra Pradesh', latitude: 13.6288, longitude: 79.4192 },
  { id: 'warangal', name: 'Warangal', state: 'Telangana', latitude: 17.9689, longitude: 79.5941 },
  { id: 'thrissur', name: 'Thrissur', state: 'Kerala', aliases: ['trichur'], latitude: 10.5276, longitude: 76.2144 },
  { id: 'kozhikode', name: 'Kozhikode', state: 'Kerala', aliases: ['calicut'], latitude: 11.2588, longitude: 75.7804 },
  { id: 'puducherry', name: 'Puducherry', state: 'Puducherry', aliases: ['pondicherry', 'pondy'], latitude: 11.9416, longitude: 79.8083 },
];

const cityMap = new Map(CITIES.map((city) => [city.id, city]));
export const getCity = (id: string) => cityMap.get(id);

export const regionCityIds = (region: RegionId) => CITIES.filter((city) => city.region === region).map((city) => city.id);
