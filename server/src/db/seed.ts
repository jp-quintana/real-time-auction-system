import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { users } from 'src/modules/users/schemas';
import { items } from 'src/modules/items/schemas';
import { auctions } from 'src/modules/auctions/schemas';

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  console.log('Seeding database...');

  // Users
  const hashedPassword = await bcrypt.hash('password123', 10);

  const [admin, seller, bidder] = await db
    .insert(users)
    .values([
      { email: 'admin@example.com', password: hashedPassword, role: 'admin' },
      { email: 'seller@example.com', password: hashedPassword, role: 'user' },
      { email: 'bidder@example.com', password: hashedPassword, role: 'user' },
    ])
    .returning();

  console.log('Users seeded:', [admin.email, seller.email, bidder.email]);

  // Items (owned by seller)
  const [watch, painting, camera, guitar] = await db
    .insert(items)
    .values([
      {
        title: 'Vintage Watch',
        description: 'A rare 1960s Swiss watch in excellent condition.',
        sellerId: seller.id,
      },
      {
        title: 'Oil Painting',
        description: 'Abstract oil painting, 60x80cm.',
        sellerId: seller.id,
      },
      {
        title: 'Film Camera',
        description: 'Classic 35mm film camera, fully functional.',
        sellerId: seller.id,
      },
      {
        title: 'Acoustic Guitar',
        description: 'Handcrafted acoustic guitar from the 1980s.',
        sellerId: seller.id,
      },
    ])
    .returning();

  console.log('Items seeded:', [
    watch.title,
    painting.title,
    camera.title,
    guitar.title,
  ]);

  const now = new Date();
  const in5Minutes = new Date(now.getTime() + 5 * 60 * 1000);
  const in2Days = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Auctions
  const insertedAuctions = await db
    .insert(auctions)
    .values([
      {
        // Active — ends in 5 minutes (for bidding tests)
        itemId: watch.id,
        startingPrice: '50.00',
        startTime: now,
        endTime: in5Minutes,
        status: 'active',
      },
      {
        // Active — ends in 2 days
        itemId: painting.id,
        startingPrice: '200.00',
        startTime: now,
        endTime: in2Days,
        status: 'active',
      },
      {
        // Active — ends in 7 days
        itemId: guitar.id,
        startingPrice: '150.00',
        startTime: now,
        endTime: in7Days,
        status: 'active',
      },
      {
        // Closed
        itemId: camera.id,
        startingPrice: '75.00',
        startTime: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        status: 'closed',
      },
    ])
    .returning();

  console.log(`Auctions seeded: ${insertedAuctions.length}`);
  console.log(
    `  - "${watch.title}" ends at ${in5Minutes.toISOString()} (5 minutes from now)`,
  );

  await pool.end();
  console.log('Done!');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
