#!/usr/bin/env node

import 'dotenv/config';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import path from 'path';

// ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIGURATION ---
const CONFIG = {
    // Retry system configuration
    MAX_RETRIES: 3,
    INITIAL_RETRY_DELAY: 1000,
    MAX_RETRY_DELAY: 10000,
    
    // Timeout configuration (reduced for production)
    TIMEOUTS: {
        CUSTOMER_REQUEST: 30000,
        REPORT_REQUEST: 45000,
        PAYMENT_REQUEST: 30000,
        SUPABASE_REQUEST: 15000,
    },
    
    // Polling configuration for async reports
    POLL_INTERVAL_MS: 3000,
    POLL_MAX_ATTEMPTS: 100, // 5 minutes max
    
    // API endpoints
    MOMENCE_BASE_URL: "https://momence.com/_api/primary",
    HOST_ID: process.env.MOMENCE_HOST_ID || "13752",
    
    // Location mapping
    LOCATIONS: {
        "Kwality House, Kemps Corner": 9030,
        "Supreme HQ, Bandra": 29821,
        "Kenkere House": 22116,
    },
    
    // Membership configuration
    REFERRAL_MEMBERSHIP_ID: parseInt(process.env.REFERRAL_MEMBERSHIP_ID || "583035"),
    
    // Supabase configuration
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    SUPABASE_TABLE: process.env.SUPABASE_TABLE || "referral_rewards",
    
    // Production settings
    IS_PRODUCTION: process.env.NODE_ENV === 'production',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info'
};

// Initialize Supabase client
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_KEY);

// --- UTILITY FUNCTIONS ---
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Production logging utility
const logger = {
    info: (message, ...args) => {
        console.log(`[${new Date().toISOString()}] INFO: ${message}`, ...args);
    },
    warn: (message, ...args) => {
        console.warn(`[${new Date().toISOString()}] WARN: ${message}`, ...args);
    },
    error: (message, ...args) => {
        console.error(`[${new Date().toISOString()}] ERROR: ${message}`, ...args);
    },
    debug: (message, ...args) => {
        if (CONFIG.LOG_LEVEL === 'debug' || !CONFIG.IS_PRODUCTION) {
            console.log(`[${new Date().toISOString()}] DEBUG: ${message}`, ...args);
        }
    }
};

function getMomenceHeaders() {
    return {
        'Cookie': process.env.MOMENCE_ALL_COOKIES,
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
        'x-app': 'dashboard-3e70af2f38ef34aeb9824cb7b75a7397e5c9966e',
        'x-origin': `https://momence.com/dashboard/${CONFIG.HOST_ID}/reports/customer-referral-rewards`,
        'baggage': 'sentry-environment=production,sentry-release=dashboard-3e70af2f38ef34aeb9824cb7b75a7397e5c9966e',
        'sentry-trace': '6f8ad8c1ee2447e8a6200d60d422116c-8c2eabb852a4a659-0',
        'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin'
    };
}

async function sendRequestWithRetry(requestOptions, requestType = 'GENERAL') {
    const timeout = CONFIG.TIMEOUTS[`${requestType}_REQUEST`] || CONFIG.TIMEOUTS.CUSTOMER_REQUEST;
    
    for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
        try {
            logger.debug(`${requestType} request attempt ${attempt}/${CONFIG.MAX_RETRIES}...`);
            const response = await axios({
                ...requestOptions,
                timeout,
                validateStatus: (status) => status < 500
            });
            
            if (response.status >= 400) {
                const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
                error.response = response;
                throw error;
            }
            
            logger.debug(`${requestType} request successful`);
            return response.data;
        } catch (error) {
            logger.warn(`${requestType} request failed on attempt ${attempt}: ${error.message}`);
            
            if (attempt === CONFIG.MAX_RETRIES) {
                logger.error(`${requestType} request failed permanently after ${CONFIG.MAX_RETRIES} attempts`);
                throw error;
            }
            
            const delayTime = Math.min(
                CONFIG.INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1),
                CONFIG.MAX_RETRY_DELAY
            );
            logger.debug(`Waiting ${delayTime}ms before retry...`);
            await delay(delayTime);
        }
    }
}

// --- API FUNCTIONS ---

/**
 * Fetches customers with exactly 1 visit for specific membership
 */
async function fetchCustomersWithOneVisit() {
    console.log('📋 Fetching customers with exactly 1 visit...');
    
    const url = `${CONFIG.MOMENCE_BASE_URL}/host/${CONFIG.HOST_ID}/customers`;
    const params = {
        filters: JSON.stringify({
            "type": "and",
            "visits": {
                "count": {
                    "type": "exactly",
                    "value": 1
                },
                "qualifiers": {
                    "sessionIds": [],
                    "templateIds": [],
                    "sessionSeriesIds": [],
                    "appointmentServiceIds": [],
                    "membershipIds": [{"membershipId": 263860}],
                    "teacherIds": [],
                    "locationIds": []
                },
                "dateType": "fixed",
                "startDate": "2025-12-01T12:00:00+05:30",
                "endDate": "2027-12-31T12:00:00+05:30"
            }
        }),
        query: "",
        page: 0,
        pageSize: 20
    };
    
    const customers = [];
    let page = 0;
    let hasMoreData = true;
    
    while (hasMoreData) {
        try {
            const response = await sendRequestWithRetry({
                method: 'GET',
                url: url,
                params: { ...params, page },
                headers: getMomenceHeaders()
            }, 'CUSTOMER');
            
            if (response.payload && response.payload.length > 0) {
                customers.push(...response.payload);
                console.log(`   📄 Page ${page}: ${response.payload.length} customers (Total: ${customers.length})`);
                page++;
            } else {
                hasMoreData = false;
            }
        } catch (error) {
            console.error(`❌ Failed to fetch customers page ${page}:`, error.message);
            hasMoreData = false;
        }
    }
    
    console.log(`✅ Total customers fetched: ${customers.length}`);
    return customers;
}

/**
 * Initiates referral rewards report
 */
async function initiateReferralReport() {
    console.log('📊 Initiating referral rewards report...');
    
    const url = `${CONFIG.MOMENCE_BASE_URL}/host/${CONFIG.HOST_ID}/reports/customer-referral-rewards/async`;
    
    const payload = {
        "timeZone": "Asia/Kolkata",
        "groupRecurring": false,
        "computedSaleValue": true,
        "includeVatInRevenue": true,
        "useBookedEntityDateRange": false,
        "excludeMembershipRenews": false,
        "day": "2025-12-26T00:00:00.000Z",
        "moneyCreditSalesFilter": "filterOutSalesPaidByMoneyCredits",
        "hideVoided": false,
        "excludeInactiveMembers": false,
        "includeRefunds": false,
        "showOnlySpotfillerRevenue": false,
        "startDate": "2025-12-22T18:30:00.000Z",
        "endDate": "2027-12-31T18:29:00.000Z",
        "startDate2": "2025-12-22T18:30:00.000Z",
        "endDate2": "2025-12-31T18:29:59.999Z",
        "datePreset": -1,
        "datePreset2": 4
    };
    
    try {
        const response = await sendRequestWithRetry({
            method: 'POST',
            url: url,
            data: payload,
            headers: {
                ...getMomenceHeaders(),
                'x-idempotence-key': generateIdempotenceKey()
            }
        }, 'REPORT');
        
        if (!response.reportRunId) {
            throw new Error('No reportRunId returned from referral report API');
        }
        
        console.log(`✅ Referral report initiated, ID: ${response.reportRunId}`);
        return response.reportRunId;
    } catch (error) {
        console.error('❌ Failed to initiate referral report:', error.message);
        throw error;
    }
}

/**
 * Polls for referral report completion
 */
async function pollReferralReport(reportRunId) {
    console.log(`⏳ Polling referral report ${reportRunId}...`);
    
    const url = `${CONFIG.MOMENCE_BASE_URL}/host/${CONFIG.HOST_ID}/reports/customer-referral-rewards/report-runs/${reportRunId}`;
    
    for (let attempt = 0; attempt < CONFIG.POLL_MAX_ATTEMPTS; attempt++) {
        try {
            const response = await sendRequestWithRetry({
                method: 'GET',
                url: url,
                headers: getMomenceHeaders()
            }, 'REPORT');
            
            console.log(`   📊 Report status: ${response.status}`);
            
            if (response.status === 'completed') {
                // Handle nested structure: reportData.items
                const items = response.reportData?.items || response.items || [];
                console.log(`✅ Referral report completed! Found ${items.length} items`);
                return items;
            } else if (response.status === 'failed') {
                throw new Error('Referral report failed on server');
            }
            
            console.log(`   ⏳ Waiting ${CONFIG.POLL_INTERVAL_MS}ms before next poll...`);
            await delay(CONFIG.POLL_INTERVAL_MS);
            
        } catch (error) {
            console.error(`❌ Error polling referral report:`, error.message);
            if (attempt === CONFIG.POLL_MAX_ATTEMPTS - 1) {
                throw error;
            }
        }
    }
    
    throw new Error('Referral report polling timeout');
}

/**
 * Checks if a giving/receiving member pair has already been processed
 */
async function checkIfAlreadyProcessed(givingMemberId, receivingMemberId) {
    try {
        const { data, error } = await supabase
            .from(CONFIG.SUPABASE_TABLE)
            .select('givingMemberId, receivingMemberId, givingMemberRewarded, processing_status')
            .eq('givingMemberId', givingMemberId)
            .eq('receivingMemberId', receivingMemberId);
            
        if (error) {
            console.warn(`⚠️ Supabase query error:`, error.message);
            return { processed: false, rewarded: false };
        }
        
        const existingRecord = data && data.length > 0 ? data[0] : null;
        return {
            processed: !!existingRecord,
            rewarded: existingRecord?.givingMemberRewarded || false,
            status: existingRecord?.processing_status || null
        };
    } catch (error) {
        console.warn(`⚠️ Failed to check processing status:`, error.message);
        return { processed: false, rewarded: false };
    }
}

/**
 * Makes payment request to reward giving member
 */
async function rewardGivingMember(givingMemberId, homeLocationId) {
    console.log(`💰 Rewarding giving member ${givingMemberId}...`);
    
    const url = `${CONFIG.MOMENCE_BASE_URL}/host/${CONFIG.HOST_ID}/pos/payments/pay-cart`;
    
    const payload = {
        "hostId": parseInt(CONFIG.HOST_ID),
        "payingMemberId": givingMemberId,
        "targetMemberId": givingMemberId,
        "items": [
            {
                "guid": generateGuid(),
                "type": "membership",
                "quantity": 1,
                "priceInCurrency": 0,
                "isPaymentPlanUsed": false,
                "membershipId": CONFIG.REFERRAL_MEMBERSHIP_ID,
                "appliedPriceRuleIds": []
            }
        ],
        "paymentMethods": [
            {
                "type": "free",
                "weightRelative": 1,
                "guid": generateGuid()
            }
        ],
        "isEmailSent": false,
        "homeLocationId": homeLocationId
    };
    
    try {
        const response = await sendRequestWithRetry({
            method: 'POST',
            url: url,
            data: payload,
            headers: {
                ...getMomenceHeaders(),
                'x-idempotence-key': generateIdempotenceKey()
            }
        }, 'PAYMENT');
        
        console.log(`✅ Successfully rewarded giving member ${givingMemberId}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to reward giving member ${givingMemberId}:`, error.message);
        return false;
    }
}

/**
 * Updates Supabase table with referral information
 */
async function updateSupabaseRecord(referralData) {
    console.log(`📝 Updating Supabase record for receiving member ${referralData.receivingMemberId}...`);
    
    const record = {
        createdAt: new Date().toISOString(),
        receivingMemberEmail: referralData.receivingMemberEmail,
        receivingMemberId: referralData.receivingMemberId,
        receivingMemberFirstName: referralData.receivingMemberFirstName,
        receivingMemberLastName: referralData.receivingMemberLastName,
        manuallyAdded: false,
        givingMemberRewarded: referralData.givingMemberRewarded,
        receivingMemberTotalSpend: referralData.receivingMemberTotalSpend || 0,
        spendingThreshold: 0,
        hostName: "Physique 57 Mumbai",
        hostCurrency: "inr",
        givingMemberFirstName: referralData.givingMemberFirstName,
        givingMemberLastName: referralData.givingMemberLastName,
        givingMemberId: referralData.givingMemberId,
        shouldGivingMemberBeRewarded: true,
        homeLocation: referralData.homeLocation,
        receivingMemberVisits: referralData.receivingMemberVisits
    };
    
    try {
        // Try insert first, then update if conflict
        const { data, error } = await supabase
            .from(CONFIG.SUPABASE_TABLE)
            .insert(record)
            .select();
            
        if (error) {
            // If it's a conflict error, try an update instead
            if (error.code === '23505') { // unique_violation
                console.log(`   📝 Record exists, updating...`);
                const { data: updateData, error: updateError } = await supabase
                    .from(CONFIG.SUPABASE_TABLE)
                    .update({
                        "updatedAt": new Date().toISOString(),
                        receivingMemberTotalSpend: record.receivingMemberTotalSpend,
                        receivingMemberVisits: record.receivingMemberVisits,
                        givingMemberRewarded: record.givingMemberRewarded
                    })
                    .eq('givingMemberId', record.givingMemberId)
                    .eq('receivingMemberId', record.receivingMemberId)
                    .select();
                    
                if (updateError) {
                    console.error('❌ Supabase update error:', updateError.message);
                    return false;
                }
            } else {
                console.error('❌ Supabase insert error:', error.message);
                return false;
            }
        }
        
        console.log('✅ Supabase record updated successfully');
        return true;
    } catch (error) {
        console.error('❌ Failed to update Supabase:', error.message);
        return false;
    }
}

// --- UTILITY FUNCTIONS ---

function generateGuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function generateIdempotenceKey() {
    return generateGuid();
}

function getLocationIdFromName(locationName) {
    return CONFIG.LOCATIONS[locationName] || CONFIG.LOCATIONS["Kwality House, Kemps Corner"]; // Default to Kwality House
}

function formatDateToIST(dateString) {
    if (!dateString) return "";
    try {
        const date = new Date(dateString);
        const formatted = date.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        return formatted.replace(/(\d{2})\/(\d{2})\/(\d{4}),/, '$1-$2-$3,');
    } catch (e) {
        return "";
    }
}

// --- MAIN PROCESSING FUNCTION ---

async function processReferralRewards() {
    logger.info('🚀 Starting Referral Rewards Processing...');
    logger.info('='.repeat(60));
    
    try {
        // Validate environment variables
        const requiredEnvVars = ['MOMENCE_ALL_COOKIES', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
        const missing = requiredEnvVars.filter(v => !process.env[v]);
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }
        
        logger.info('🔧 Environment check passed');
        
        // Step 1: Fetch customers and initiate referral report in parallel
        console.log('\n📊 STEP 1: Fetching data...');
        const [customers, reportRunId] = await Promise.all([
            fetchCustomersWithOneVisit(),
            initiateReferralReport()
        ]);
        
        if (customers.length === 0) {
            console.log('⚠️ No customers found with exactly 1 visit');
            return;
        }
        
        // Step 2: Poll for referral report completion
        console.log('\n📊 STEP 2: Waiting for referral report...');
        const referralData = await pollReferralReport(reportRunId);
        
        if (referralData.length === 0) {
            console.log('⚠️ No referral data found');
            return;
        }
        
        // Step 3: Process matches and rewards
        console.log('\n🎯 STEP 3: Processing matches and rewards...');
        let processedCount = 0;
        let rewardedCount = 0;
        let skippedCount = 0;
        
        // Create customer lookup map
        const customerMap = new Map();
        customers.forEach(customer => {
            customerMap.set(customer.memberId, customer);
        });
        
        console.log(`📋 Found ${customers.length} customers and ${referralData.length} referral records`);
        
        // Process each referral record
        for (const referral of referralData) {
            processedCount++;
            
            console.log(`\n--- Processing referral ${processedCount}/${referralData.length} ---`);
            console.log(`📧 Receiving Member: ${referral.receivingMemberEmail} (ID: ${referral.receivingMemberId})`);
            console.log(`👥 Giving Member: ${referral.givingMemberFirstName} ${referral.givingMemberLastName} (ID: ${referral.givingMemberId})`);
            console.log(`🏠 Home Location: ${referral.homeLocation}`);
            console.log(`📊 Visits: ${referral.receivingMemberVisits}, Spend: ${referral.receivingMemberTotalSpend}`);
            
            // Check if receiving member is in our customer list
            const receivingMember = customerMap.get(referral.receivingMemberId);
            if (!receivingMember) {
                console.log(`⏭️ Receiving member ${referral.receivingMemberId} not in customer list, skipping`);
                continue;
            }
            
            // Determine if member qualifies (>= 1 visits)
            const isQualified = (referral.receivingMemberVisits || 0) >= 1;
            if (!isQualified) {
                console.log(`📝 Receiving member ${referral.receivingMemberId} has < 1 visits - will track but not reward`);
            }
            
            // Check if this giving/receiving member pair has already been processed
            const processStatus = await checkIfAlreadyProcessed(
                referral.givingMemberId,
                referral.receivingMemberId
            );
            
            if (processStatus.processed) {
                if (processStatus.rewarded) {
                    console.log(`🚫 LIFETIME DUPLICATE: Giving member ${referral.givingMemberId} was already rewarded for receiving member ${referral.receivingMemberId} - skipping forever`);
                } else {
                    console.log(`⏭️ Giving/receiving member pair ${referral.givingMemberId}/${referral.receivingMemberId} already processed (status: ${processStatus.status}), skipping`);
                }
                skippedCount++;
                continue;
            }
            
            // Only reward if member is qualified
            let rewardSuccess = false;
            if (isQualified) {
                // Determine home location
                const homeLocationId = getLocationIdFromName(referral.homeLocation);
                console.log(`🏠 Using home location ID: ${homeLocationId} for ${referral.homeLocation}`);
                
                // Reward giving member
                rewardSuccess = await rewardGivingMember(referral.givingMemberId, homeLocationId);
            } else {
                console.log(`⏭️ Not rewarding - receiving member not qualified`);
            }
            
            // Prepare referral data for Supabase
            const referralRecord = {
                receivingMemberEmail: receivingMember.email,
                receivingMemberId: referral.receivingMemberId,
                receivingMemberFirstName: receivingMember.firstName,
                receivingMemberLastName: receivingMember.lastName,
                givingMemberRewarded: rewardSuccess,
                receivingMemberTotalSpend: referral.receivingMemberTotalSpend || 0,
                givingMemberFirstName: referral.givingMemberFirstName,
                givingMemberLastName: referral.givingMemberLastName,
                givingMemberId: referral.givingMemberId,
                homeLocation: referral.homeLocation,
                receivingMemberVisits: referral.receivingMemberVisits || 1
            };
            
            // Update Supabase
            const supabaseSuccess = await updateSupabaseRecord(referralRecord);
            
            if (rewardSuccess) {
                rewardedCount++;
                console.log(`✅ Successfully processed referral for giving member ${referral.givingMemberId}`);
            } else {
                console.log(`❌ Failed to reward giving member ${referral.givingMemberId}`);
            }
            
            // Add small delay between rewards to be nice to the API
            await delay(1000);
        }
        
        // Final summary
        logger.info('\n📊 PROCESSING SUMMARY');
        logger.info('='.repeat(60));
        logger.info(`📋 Total customers fetched: ${customers.length}`);
        logger.info(`📊 Total referral records: ${referralData.length}`);
        logger.info(`🎯 Records processed: ${processedCount}`);
        logger.info(`💰 Members rewarded: ${rewardedCount}`);
        logger.info(`⏭️ Records skipped (already rewarded): ${skippedCount}`);
        logger.info('✅ Referral rewards processing completed successfully!');
        
    } catch (error) {
        logger.error('\n💥 CRITICAL ERROR:', error.message);
        if (error.stack) {
            logger.error('Stack trace:', error.stack);
        }
        if (CONFIG.IS_PRODUCTION) {
            process.exit(1);
        } else {
            throw error;
        }
    }
}

// --- ERROR HANDLING ---

process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// --- SCRIPT ENTRY POINT ---

// Main execution when run directly (ESM-compatible)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
    logger.info('🎯 Referral Rewards Processor v1.0');
    logger.info(`🕐 Started at: ${new Date().toLocaleString()}`);
    logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    processReferralRewards().catch(logger.error);
}

export { processReferralRewards };
export default { processReferralRewards };