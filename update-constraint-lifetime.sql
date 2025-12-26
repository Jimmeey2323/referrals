-- Update existing table to enforce lifetime uniqueness instead of daily uniqueness
-- This script updates the constraint to prevent duplicate rewards for lifetime

-- First, drop the existing constraint
ALTER TABLE referral_rewards DROP CONSTRAINT IF EXISTS referral_rewards_unique_daily_pair;

-- Add the new lifetime uniqueness constraint
ALTER TABLE referral_rewards ADD CONSTRAINT referral_rewards_unique_lifetime_pair 
    UNIQUE ("givingMemberId", "receivingMemberId");

-- Update the comment
COMMENT ON CONSTRAINT referral_rewards_unique_lifetime_pair ON referral_rewards 
    IS 'Ensures one reward per giving/receiving member pair for lifetime';

-- Verify the constraint exists
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(c.oid) as constraint_definition
FROM pg_constraint c 
JOIN pg_class t ON c.conrelid = t.oid 
WHERE t.relname = 'referral_rewards' 
    AND c.contype = 'u';