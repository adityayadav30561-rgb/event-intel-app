import { ApiAccountRepository } from './api/ApiAccountRepository';
import { createApiClient } from './api/client';
import { ApiEventRepository } from './api/ApiEventRepository';
import { MockAccountRepository } from './mock/MockAccountRepository';
import { MockEventRepository } from './mock/MockEventRepository';
import type { AccountRepository, EventRepository } from './types';

export type { AccountRepository, EventRepository, RankedEvent } from './types';
export { ApiError } from './api/client';

const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');

/** "api" uses the live server; anything else uses the bundled sample data. */
export const dataMode: 'api' | 'mock' = process.env.EXPO_PUBLIC_DATA_MODE === 'api' && apiUrl ? 'api' : 'mock';

const api = dataMode === 'api' ? createApiClient(apiUrl!) : undefined;

/** The active data sources. Nothing above the repository layer knows which ones they are. */
export const eventRepository: EventRepository = api ? new ApiEventRepository(api) : new MockEventRepository();
export const accountRepository: AccountRepository = api ? new ApiAccountRepository(api) : new MockAccountRepository(eventRepository);
