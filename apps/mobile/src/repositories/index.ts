import { ApiEventRepository } from './api/ApiEventRepository';
import { MockEventRepository } from './mock/MockEventRepository';
import type { EventRepository } from './types';

export type { EventRepository } from './types';

const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');

/** "api" uses the live server; anything else uses the bundled sample data. */
export const dataMode: 'api' | 'mock' = process.env.EXPO_PUBLIC_DATA_MODE === 'api' && apiUrl ? 'api' : 'mock';

/** The active event data source. Nothing above the repository layer knows which one it is. */
export const eventRepository: EventRepository = dataMode === 'api' ? new ApiEventRepository(apiUrl!) : new MockEventRepository();
