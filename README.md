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

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

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
