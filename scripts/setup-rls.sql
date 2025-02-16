-- Enable Row Level Security
ALTER TABLE "SafeAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SplitsContract" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contributor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerificationSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccessKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccessLog" ENABLE ROW LEVEL SECURITY;

-- Create an authenticated user role
CREATE ROLE authenticated;

-- Safe Account Policies
CREATE POLICY "Safe accounts are viewable by owners"
ON "SafeAccount"
FOR SELECT
TO authenticated
USING (
  auth.uid()::text = owner_address
  OR EXISTS (
    SELECT 1 FROM "AccessKey"
    WHERE "AccessKey".safe_id = "SafeAccount".id
    AND "AccessKey".permissions->>'canView' = 'true'
    AND ("AccessKey".expires_at IS NULL OR "AccessKey".expires_at > NOW())
  )
);

CREATE POLICY "Safe accounts are only created by owners"
ON "SafeAccount"
FOR INSERT
TO authenticated
WITH CHECK (auth.uid()::text = owner_address);

-- Splits Contract Policies
CREATE POLICY "Splits contracts are viewable by Safe owners and contributors"
ON "SplitsContract"
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM "SafeAccount"
    WHERE "SafeAccount".id = "SplitsContract".safe_id
    AND "SafeAccount".owner_address = auth.uid()::text
  )
  OR EXISTS (
    SELECT 1 FROM "Contributor"
    WHERE "Contributor".splits_contract_id = "SplitsContract".id
    AND "Contributor".github_username = auth.jwt()->>'preferred_username'
  )
);

CREATE POLICY "Splits contracts are only created by Safe owners"
ON "SplitsContract"
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "SafeAccount"
    WHERE "SafeAccount".id = NEW.safe_id
    AND "SafeAccount".owner_address = auth.uid()::text
  )
);

-- Contributor Policies
CREATE POLICY "Contributors can view their own records"
ON "Contributor"
FOR SELECT
TO authenticated
USING (
  github_username = auth.jwt()->>'preferred_username'
  OR EXISTS (
    SELECT 1 FROM "SplitsContract"
    JOIN "SafeAccount" ON "SafeAccount".id = "SplitsContract".safe_id
    WHERE "SplitsContract".id = "Contributor".splits_contract_id
    AND "SafeAccount".owner_address = auth.uid()::text
  )
);

CREATE POLICY "Contributors can only update their own wallet"
ON "Contributor"
FOR UPDATE
TO authenticated
USING (github_username = auth.jwt()->>'preferred_username')
WITH CHECK (github_username = auth.jwt()->>'preferred_username');

-- Verification Session Policies
CREATE POLICY "Verification sessions are only visible to the contributor"
ON "VerificationSession"
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM "Contributor"
    WHERE "Contributor".id = "VerificationSession".contributor_id
    AND "Contributor".github_username = auth.jwt()->>'preferred_username'
  )
);

-- Access Key Policies
CREATE POLICY "Access keys are only visible to Safe owners"
ON "AccessKey"
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM "SafeAccount"
    WHERE "SafeAccount".id = "AccessKey".safe_id
    AND "SafeAccount".owner_address = auth.uid()::text
  )
);

-- Access Log Policies
CREATE POLICY "Access logs are only visible to Safe owners"
ON "AccessLog"
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM "SafeAccount"
    WHERE "SafeAccount".id = "AccessLog".safe_id
    AND "SafeAccount".owner_address = auth.uid()::text
  )
);

-- Create functions for common operations
CREATE OR REPLACE FUNCTION verify_contributor(
  p_contributor_id UUID,
  p_wallet_address TEXT
) RETURNS "Contributor" AS $$
DECLARE
  v_contributor "Contributor";
BEGIN
  -- Check if the contributor exists and is owned by the current user
  SELECT * INTO v_contributor
  FROM "Contributor"
  WHERE id = p_contributor_id
  AND github_username = auth.jwt()->>'preferred_username';

  IF v_contributor IS NULL THEN
    RAISE EXCEPTION 'Contributor not found or not authorized';
  END IF;

  -- Update the contributor
  UPDATE "Contributor"
  SET wallet_address = p_wallet_address,
      verification_status = 'VERIFIED',
      verified_at = NOW()
  WHERE id = p_contributor_id
  RETURNING * INTO v_contributor;

  RETURN v_contributor;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_safe_account_owner" ON "SafeAccount"(owner_address);
CREATE INDEX IF NOT EXISTS "idx_splits_contract_safe" ON "SplitsContract"(safe_id);
CREATE INDEX IF NOT EXISTS "idx_contributor_github" ON "Contributor"(github_username);
CREATE INDEX IF NOT EXISTS "idx_verification_session_contributor" ON "VerificationSession"(contributor_id);
CREATE INDEX IF NOT EXISTS "idx_access_key_safe" ON "AccessKey"(safe_id);
CREATE INDEX IF NOT EXISTS "idx_access_log_safe" ON "AccessLog"(safe_id); 