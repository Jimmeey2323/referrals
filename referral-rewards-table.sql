-- Referral Rewards Table for Momence Integration
-- This script creates the complete database schema for tracking referral rewards

-- Drop existing objects if they exist (for clean reinstall)
DROP VIEW IF EXISTS referral_rewards_summary;
DROP TABLE IF EXISTS referral_rewards;

-- Main referral rewards table
CREATE TABLE referral_rewards (
    -- Primary identifiers
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Processing date (set by trigger for daily constraints)
    processing_date DATE,
    
    -- Receiving member information
    "receivingMemberEmail" TEXT NOT NULL,
    "receivingMemberId" BIGINT NOT NULL,
    "receivingMemberFirstName" TEXT,
    "receivingMemberLastName" TEXT,
    "receivingMemberTotalSpend" DECIMAL(10,2) DEFAULT 0,
    "receivingMemberVisits" INTEGER DEFAULT 0,
    
    -- Giving member information
    "givingMemberId" BIGINT NOT NULL,
    "givingMemberFirstName" TEXT,
    "givingMemberLastName" TEXT,
    "givingMemberRewarded" BOOLEAN DEFAULT FALSE,
    
    -- Business logic fields
    "manuallyAdded" BOOLEAN DEFAULT FALSE,
    "shouldGivingMemberBeRewarded" BOOLEAN DEFAULT TRUE,
    "spendingThreshold" DECIMAL(10,2) DEFAULT 0,
    
    -- Location and host information
    "homeLocation" TEXT,
    "hostName" TEXT DEFAULT 'Physique 57 Mumbai',
    "hostCurrency" TEXT DEFAULT 'inr',
    
    -- Processing status and comments
    processing_status TEXT DEFAULT 'pending',
    qualification_comments TEXT,
    reward_comments TEXT,
    
    -- Indexes
    CONSTRAINT referral_rewards_unique_lifetime_pair 
        UNIQUE ("givingMemberId", "receivingMemberId")
);

-- Create indexes for performance
CREATE INDEX idx_referral_rewards_giving_member ON referral_rewards("givingMemberId");
CREATE INDEX idx_referral_rewards_receiving_member ON referral_rewards("receivingMemberId");
CREATE INDEX idx_referral_rewards_processing_date ON referral_rewards(processing_date);
CREATE INDEX idx_referral_rewards_rewarded ON referral_rewards("givingMemberRewarded");
CREATE INDEX idx_referral_rewards_status ON referral_rewards(processing_status);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_referral_rewards_updated_at 
    BEFORE UPDATE ON referral_rewards 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add qualification tracking function
CREATE OR REPLACE FUNCTION update_qualification_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Set processing date if not already set
    IF NEW.processing_date IS NULL THEN
        NEW.processing_date = DATE(NEW."createdAt");
    END IF;
    
    -- Update qualification comments based on receiving member visits
    IF NEW."receivingMemberVisits" >= 1 THEN
        NEW.qualification_comments = COALESCE(NEW.qualification_comments, '') || 
            CASE 
                WHEN NEW.qualification_comments IS NULL OR NEW.qualification_comments = '' THEN 
                    'Receiving member qualified with ' || NEW."receivingMemberVisits" || ' visits'
                ELSE 
                    '; Updated: ' || NEW."receivingMemberVisits" || ' visits'
            END;
        NEW.processing_status = 'qualified';
    ELSE
        NEW.qualification_comments = COALESCE(NEW.qualification_comments, '') || 
            CASE 
                WHEN NEW.qualification_comments IS NULL OR NEW.qualification_comments = '' THEN 
                    'Receiving member not qualified - only ' || COALESCE(NEW."receivingMemberVisits", 0) || ' visits'
                ELSE 
                    '; Updated: only ' || COALESCE(NEW."receivingMemberVisits", 0) || ' visits'
            END;
        NEW.processing_status = 'not_qualified';
    END IF;
    
    -- Update reward comments
    IF NEW."givingMemberRewarded" THEN
        NEW.reward_comments = COALESCE(NEW.reward_comments, '') || 
            CASE 
                WHEN NEW.reward_comments IS NULL OR NEW.reward_comments = '' THEN 
                    'Giving member rewarded successfully on ' || CURRENT_DATE
                ELSE 
                    '; Reward confirmed on ' || CURRENT_DATE
            END;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_referral_qualification_status 
    BEFORE INSERT OR UPDATE ON referral_rewards 
    FOR EACH ROW 
    EXECUTE FUNCTION update_qualification_status();

-- Create a summary view for easy reporting
CREATE VIEW referral_rewards_summary AS
SELECT 
    processing_date,
    COUNT(*) as total_referrals,
    COUNT(CASE WHEN "givingMemberRewarded" THEN 1 END) as rewards_processed,
    COUNT(CASE WHEN processing_status = 'qualified' THEN 1 END) as qualified_referrals,
    COUNT(CASE WHEN processing_status = 'not_qualified' THEN 1 END) as unqualified_referrals,
    SUM("receivingMemberTotalSpend") as total_receiving_member_spend,
    AVG("receivingMemberVisits") as avg_receiving_member_visits
FROM referral_rewards
GROUP BY processing_date
ORDER BY processing_date DESC;

-- Add RLS (Row Level Security) policies if needed
-- ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;

-- Add comments for documentation
COMMENT ON TABLE referral_rewards IS 'Tracks referral rewards processing for Momence integration';
COMMENT ON COLUMN referral_rewards.processing_date IS 'Date column set by trigger for daily constraint handling';
COMMENT ON COLUMN referral_rewards.qualification_comments IS 'Automatically updated comments about member qualification status';
COMMENT ON COLUMN referral_rewards.reward_comments IS 'Automatically updated comments about reward processing';
COMMENT ON CONSTRAINT referral_rewards_unique_lifetime_pair ON referral_rewards IS 'Ensures one reward per giving/receiving member pair for lifetime';

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT ALL ON referral_rewards TO your_service_role;
-- GRANT SELECT ON referral_rewards_summary TO your_service_role;

-- Sample query to check the table structure
-- SELECT column_name, data_type, is_nullable, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'referral_rewards' 
-- ORDER BY ordinal_position;

COMMIT;