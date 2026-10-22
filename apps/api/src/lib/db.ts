import type { Database } from '@sidehustle/db';

export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0] | Database;
