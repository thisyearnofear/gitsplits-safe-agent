# GitSplits: Revenue Sharing for Open Source

GitSplits helps developers set up fair revenue sharing for their open source projects. It analyzes GitHub repositories to determine contribution splits and manages revenue distribution through Safe accounts.

## Current State

- ✅ GitHub Analysis: Analyze repositories to determine contribution splits
  - Handles both original repositories and forks
  - Tracks upstream vs fork contributions
  - Provides detailed contributor statistics
- ✅ Safe Integration: Created test Safe at `0x38A7F83e02B8c0B40BFc8Ee138581051A32A80FA`
- 🚧 Identity Verification: In progress
- 🚧 Smart Contracts: Planned

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Set up environment variables in `.env`:

```env
GITHUB_TOKEN=your_github_token
AGENT_PRIVATE_KEY=your_agent_private_key
AGENT_ADDRESS=your_agent_address
GEMINI_API_KEY=your_gemini_api_key
```

3. Run the CLI:

```bash
npm run cli
# or
npx tsx src/cli.ts
```

## Example Commands

Analyze a repository:

```
Analyze the contribution splits for repository owner/repo
```

Create a Gitsplit:

```
Create a Gitsplit for repository owner/repo with donations enabled
```

Verify identity and claim share:

```
Help me claim my share for repository owner/repo
```

## Development Setup

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Supabase account
- GitHub account with API access
- Gemini API key
- Safe wallet on Sepolia

### Environment Setup

1. Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

2. Fill in the required environment variables:

```env
# Agent Configuration
AGENT_PRIVATE_KEY="your_agent_private_key_here"
AGENT_ADDRESS="your_agent_address_here"

# Model Configuration
GEMINI_API_KEY="your_gemini_api_key_here"

# GitHub Configuration
GITHUB_TOKEN="your_github_token_here"

# Splits Configuration
SPLITS_API_KEY="your_splits_api_key_here"

# Database Configuration
DATABASE_URL="your_supabase_postgres_url"

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL="your_supabase_project_url"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your_supabase_anon_key"
SUPABASE_SERVICE_ROLE_KEY="your_supabase_service_role_key"
```

### Database Setup

1. Initialize the database:

```bash
npm run db:migrate
```

2. Apply RLS policies:

```bash
psql your_database_url -f scripts/setup-rls.sql
```

The database includes the following tables with RLS policies:

- `SafeAccount`: Stores Safe wallet information
  - RLS: Only owners can view and create
- `SplitsContract`: Manages revenue sharing contracts
  - RLS: Viewable by Safe owners and contributors
- `Contributor`: Tracks contributor information
  - RLS: Users can view their own records
- `VerificationSession`: Handles identity verification
  - RLS: Only visible to the contributor
- `AccessKey`: Manages API access keys
  - RLS: Only visible to Safe owners
- `AccessLog`: Audit trail for access
  - RLS: Only visible to Safe owners

### Testing

Run the test suite to verify the setup:

```bash
# Test database connection
npm run test:db

# Test database security and RLS
npm run test:db-security

# Run comprehensive tests
npm run test:db-comprehensive
```

The comprehensive test suite verifies:

- Safe Account creation and access
- Splits Contract management
- Contributor updates and verification
- Access key creation and validation
- RLS policy enforcement
- Audit logging

### Development Server

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### API Routes

The application exposes the following API endpoints:

- `POST /api/agent`: Main endpoint for interacting with the AI agent
  - Handles natural language commands
  - Executes repository analysis
  - Manages splits contracts
  - Processes identity verification

### Scripts

Utility scripts for setup and maintenance:

- `generate-agent-wallet.ts`: Create a new agent wallet
- `create-safe.ts`: Deploy a new Safe
- `check-balance.ts`: Check wallet balances
- `setup-rls.sql`: Configure database security

### Security Features

1. Row Level Security (RLS)

   - Fine-grained access control
   - Role-based permissions
   - Automatic policy enforcement

2. Access Key Management

   - Time-based expiration
   - Permission-based access
   - Audit logging

3. Identity Verification

   - GitHub account verification
   - Wallet ownership verification
   - Time-limited verification sessions

4. Safe Integration
   - Multi-signature wallet support
   - Secure contract deployment
   - Transaction signing

## Safe Integration

Created a new Safe at address: 0x38A7F83e02B8c0B40BFc8Ee138581051A32A80FA

View Safe at:
https://app.safe.global/home?safe=sep:0x38A7F83e02B8c0B40BFc8Ee138581051A32A80FA

## Next Steps

1. Complete identity verification system
2. Implement smart contracts for revenue distribution
3. Add web interface for easier interaction
4. Set up automated testing

## Contributing

Contributions are welcome! Please check the issues page for current tasks.
