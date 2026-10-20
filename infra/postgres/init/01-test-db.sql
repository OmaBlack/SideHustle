-- A separate database for integration tests, so `pnpm test` never touches dev data.
CREATE DATABASE sidehustle_test OWNER sidehustle;
