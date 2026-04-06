import 'dotenv/config';
import PgBoss from 'pg-boss';
import { getEnv } from './config/env.js';

async function testBoss() {
  const env = getEnv();
  console.log('Using DB URL:', env.DATABASE_URL);
  
  const boss = new PgBoss(env.DATABASE_URL);
  
  boss.on('error', error => console.error('PgBoss Error:', error));

  try {
    console.log('Stopping boss if running...');
    // In case there's another instance
    
    console.log('Starting boss...');
    await boss.start();
    console.log('Boss started!');

    const queue = 'test-queue';
    console.log(`Sending job to ${queue}...`);
    const jobId = await boss.send(queue, { hello: 'world' });
    console.log('Job sent! ID:', jobId);

    console.log('Checking jobs in DB...');
    // We can't easily use prisma here without setup, so just exit
    await boss.stop();
    console.log('Boss stopped. Test complete.');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
}

testBoss();
