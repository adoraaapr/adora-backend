/**
 * Optional helper script to migrate data from local MySQL to MongoDB Atlas.
 * Usage:
 *   npx tsx scripts/migrate-mysql-to-mongo.ts "mongodb+srv://<user>:<password>@cluster0.mongodb.net/adora?retryWrites=true&w=majority"
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const targetMongoUrl = process.argv[2] || process.env.DATABASE_URL;

  if (!targetMongoUrl || !targetMongoUrl.startsWith('mongodb')) {
    console.error('Please provide a valid MongoDB connection string.');
    console.error('Example: npx tsx scripts/migrate-mysql-to-mongo.ts "mongodb+srv://user:pass@cluster.mongodb.net/adora"');
    process.exit(1);
  }

  const prisma = new PrismaClient();

  console.log('Connecting to target MongoDB database...');
  try {
    await prisma.$connect();
    console.log('Connected successfully!');

    console.log('Verifying existing data...');
    const planCount = await prisma.adPlan.count();
    console.log(`Current ad plans in MongoDB: ${planCount}`);

    if (planCount === 0) {
      console.log('Seeding initial plans...');
      const plans = [
        { name: 'Starter', description: '3 riders for 15 days', durationDays: 15, ridersCount: 3, pricePaise: 999900n, ratePerKmPaise: 200 },
        { name: 'Growth', description: '5 riders for 30 days', durationDays: 30, ridersCount: 5, pricePaise: 2499900n, ratePerKmPaise: 200 },
        { name: 'City Blitz', description: '10 riders for 30 days', durationDays: 30, ridersCount: 10, pricePaise: 4499900n, ratePerKmPaise: 250 }
      ];
      for (const p of plans) {
        await prisma.adPlan.create({ data: p });
      }
      console.log('Default plans seeded into MongoDB Atlas!');
    }

    console.log('MongoDB is ready for Adora!');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();

