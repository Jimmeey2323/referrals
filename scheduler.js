#!/usr/bin/env node

import cron from 'node-cron';
import { processReferralRewards } from './referral-rewards-processor.js';
import dotenv from 'dotenv';

dotenv.config();

const TIMEZONE = 'Asia/Kolkata';
const SCHEDULE_TIME = process.env.CRON_SCHEDULE || '0 22 * * *'; // Default: 10 PM daily

console.log('🕐 Referral Rewards Scheduler Starting...');
console.log(`📅 Schedule: ${SCHEDULE_TIME} (${TIMEZONE})`);
console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);

// Schedule the job
cron.schedule(SCHEDULE_TIME, async () => {
    console.log('\n🚀 Scheduled referral rewards processing triggered...');
    console.log(`⏰ Time: ${new Date().toLocaleString('en-IN', { timeZone: TIMEZONE })}`);
    
    try {
        await processReferralRewards();
        console.log('✅ Scheduled processing completed successfully');
    } catch (error) {
        console.error('❌ Scheduled processing failed:', error.message);
        // In production, you might want to send alerts here
        if (process.env.WEBHOOK_URL) {
            try {
                await fetch(process.env.WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: `🚨 Referral rewards processing failed: ${error.message}`,
                        timestamp: new Date().toISOString()
                    })
                });
            } catch (webhookError) {
                console.error('Failed to send webhook notification:', webhookError.message);
            }
        }
    }
}, {
    scheduled: true,
    timezone: TIMEZONE
});

console.log('✅ Scheduler initialized and running...');

// Keep the process alive
process.on('SIGTERM', () => {
    console.log('📴 Scheduler shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('📴 Scheduler interrupted, shutting down...');
    process.exit(0);
});

// Health check endpoint for Railway
if (process.env.PORT) {
    const { createServer } = await import('http');
    
    const server = createServer((req, res) => {
        if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                status: 'healthy', 
                service: 'referral-rewards-scheduler',
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            }));
        } else {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Referral Rewards Scheduler is running');
        }
    });
    
    const port = process.env.PORT || 3000;
    server.listen(port, () => {
        console.log(`🌐 Health check server running on port ${port}`);
    });
}