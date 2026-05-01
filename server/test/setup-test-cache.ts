import { GenericContainer, StartedTestContainer } from 'testcontainers';
import Redis from 'ioredis';

export interface TestCache {
  container: StartedTestContainer;
  client: Redis;
  connectionUri: string;
}

export async function setupTestCache(): Promise<TestCache> {
  const container = await new GenericContainer('redis:7.4-alpine')
    .withExposedPorts(6379)
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(6379);
  const connectionUri = `redis://${host}:${port}`;

  const client = new Redis(connectionUri, {
    maxRetriesPerRequest: 3,
  });

  return { container, client, connectionUri };
}

export async function teardownTestCache(testCache: TestCache) {
  await testCache.client.quit();
  await testCache.container.stop();
}
