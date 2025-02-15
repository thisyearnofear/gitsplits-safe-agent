import "dotenv/config";
import { z } from "zod";
import { Octokit } from "@octokit/rest";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

// Debug log for token
console.error(
  "GitHub Token status:",
  process.env.GITHUB_TOKEN ? "Present" : "Missing",
  "Length:",
  process.env.GITHUB_TOKEN?.length || 0
);

export interface Commit {
  sha: string;
  authorLogin: string | null;
  authorName: string | null;
  authorEmail: string | null;
  date: string;
  message: string;
  isUpstream: boolean;
}

export interface Contributor {
  login: string | null;
  name: string;
  email: string;
  commits: number;
  upstreamCommits: number;
  forkCommits: number;
  lastActive: string;
  isUpstreamContributor: boolean;
  isForkContributor: boolean;
  percentage: number;
  wallet?: string;
}

export interface RepositoryAnalysis {
  name: string;
  isForked: boolean;
  upstream: {
    fullName: string;
    description: string;
    createdAt: string;
    totalCommits: number;
  } | null;
  fork: {
    createdAt: string;
    description: string;
    lastPushAt: string;
    newCommits: number;
  };
  contributors: Contributor[];
  totalCommits: number;
}

async function verifyGitHubUser(username: string): Promise<boolean> {
  try {
    const response = await octokit.users.getByUsername({ username });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

async function verifyGitHubToken() {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN environment variable is not set");
  }
  try {
    const response = await octokit.rest.users.getAuthenticated();
    console.error(
      "GitHub Token verified. Authenticated as:",
      response.data.login
    );
    return true;
  } catch (error) {
    console.error("GitHub Token verification failed:", error);
    throw new Error("Invalid GitHub token");
  }
}

async function getRepositoryInfo(owner: string, repo: string) {
  console.error(`\nStep 1: Getting repository info for ${owner}/${repo}`);
  const response = await octokit.repos.get({ owner, repo });
  const repoInfo = response.data;

  console.error("Repository details:", {
    full_name: repoInfo.full_name,
    fork: repoInfo.fork,
    created_at: repoInfo.created_at,
    default_branch: repoInfo.default_branch,
  });

  return repoInfo;
}

async function getRepositoryCommits(
  owner: string,
  repo: string,
  since?: string
) {
  console.error(
    `\nStep 2: Fetching commits for ${owner}/${repo}${
      since ? ` since ${since}` : ""
    }`
  );
  const response = await octokit.repos.listCommits({
    owner,
    repo,
    per_page: 100,
    ...(since ? { since } : {}),
  });

  console.error(`Found ${response.data.length} commits`);
  return response.data;
}

async function validateCommits(commits: any[], context: string = "") {
  console.error(`\nStep 3: Validating commits ${context}`);
  const validatedCommits = [];
  const verifiedUsers = new Set<string>();

  for (const commit of commits) {
    const authorLogin = commit.author?.login;

    if (authorLogin) {
      if (!verifiedUsers.has(authorLogin)) {
        const isVerified = await verifyGitHubUser(authorLogin);
        console.error(
          `Verifying user ${authorLogin}: ${isVerified ? "✓" : "✗"}`
        );

        if (isVerified) {
          verifiedUsers.add(authorLogin);
        } else {
          console.error(`Skipping unverified user: ${authorLogin}`);
          continue;
        }
      }
      validatedCommits.push(commit);
    } else {
      console.error(
        `Skipping commit ${commit.sha.substring(0, 8)} - no GitHub user`
      );
    }
  }

  return { validatedCommits, verifiedUsers };
}

async function processContributor(
  commit: any,
  isUpstream: boolean
): Promise<Contributor | null> {
  // Only process commits that have complete author information
  if (!commit.commit?.author?.name) {
    console.error(
      `Skipping commit ${commit.sha.substring(
        0,
        8
      )} - incomplete author information`
    );
    return null;
  }

  const date = commit.commit.author.date || new Date().toISOString();

  return {
    login: commit.author?.login || null,
    name: commit.commit.author.name,
    email: commit.commit.author.email || "",
    commits: 1,
    upstreamCommits: isUpstream ? 1 : 0,
    forkCommits: isUpstream ? 0 : 1,
    lastActive: date,
    isUpstreamContributor: isUpstream,
    isForkContributor: !isUpstream,
    percentage: 0,
  };
}

export async function analyzeRepository(
  owner: string,
  repo: string
): Promise<RepositoryAnalysis> {
  console.error("\n=== Starting GitHub Repository Analysis ===");
  console.error(`Repository: ${owner}/${repo}`);
  console.error("Environment Check:");
  console.error(
    "- GITHUB_TOKEN:",
    process.env.GITHUB_TOKEN
      ? `Present (${process.env.GITHUB_TOKEN.length} chars)`
      : "Missing ❌"
  );

  // Verify token first
  try {
    console.error("\nVerifying GitHub token...");
    const authResponse = await octokit.rest.users.getAuthenticated();
    console.error(
      "✓ Token verified - Authenticated as:",
      authResponse.data.login
    );
  } catch (error) {
    console.error(
      "❌ GitHub token verification failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
    throw new Error("GitHub authentication failed - check your token");
  }

  try {
    // Get repository info including fork status
    console.error("\nFetching repository info...");
    const repoInfo = await octokit.rest.repos.get({
      owner,
      repo,
    });
    console.error("✓ Repository info retrieved");
    console.error("Repository details:", {
      full_name: repoInfo.data.full_name,
      fork: repoInfo.data.fork,
      parent: repoInfo.data.parent?.full_name,
      created_at: repoInfo.data.created_at,
      pushed_at: repoInfo.data.pushed_at,
    });

    let upstreamInfo = null;
    let upstreamCommits: any[] = [];
    const contributors: { [key: string]: Contributor } = {};

    if (repoInfo.data.fork && repoInfo.data.parent) {
      console.error(
        `Repository is a fork of ${repoInfo.data.parent.full_name}`
      );
      upstreamInfo = repoInfo.data.parent;

      // Fetch upstream commits
      const { data: parentCommits } = await octokit.rest.repos.listCommits({
        owner: repoInfo.data.parent.owner.login,
        repo: repoInfo.data.parent.name,
        per_page: 100,
      });

      console.error(
        "Upstream Commits:",
        JSON.stringify(
          parentCommits.map((c) => ({
            sha: c.sha.substring(0, 7),
            author: c.author?.login,
            committer: c.commit.author?.name,
            date: c.commit.author?.date,
            message: c.commit.message.split("\n")[0],
          })),
          null,
          2
        )
      );

      upstreamCommits = parentCommits;

      // Process upstream contributors
      for (const commit of parentCommits) {
        if (!commit.commit?.author?.name || !commit.commit?.author?.date) {
          console.error(
            `Skipping upstream commit ${commit.sha.substring(
              0,
              7
            )} - missing required data`
          );
          continue;
        }

        const key = commit.author?.login || commit.commit.author.name;
        if (!contributors[key]) {
          contributors[key] = {
            login: commit.author?.login || null,
            name: commit.commit.author.name,
            email: commit.commit.author.email || "",
            commits: 0,
            upstreamCommits: 0,
            forkCommits: 0,
            lastActive: commit.commit.author.date,
            isUpstreamContributor: true,
            isForkContributor: false,
            percentage: 0,
          };
        }
        contributors[key].commits++;
        contributors[key].upstreamCommits++;
        if (
          new Date(commit.commit.author.date) >
          new Date(contributors[key].lastActive)
        ) {
          contributors[key].lastActive = commit.commit.author.date;
        }
      }

      console.error(
        "Upstream Contributors:",
        JSON.stringify(Object.values(contributors), null, 2)
      );
    }

    // Fetch fork commits
    const { data: forkCommits } = await octokit.rest.repos.listCommits({
      owner,
      repo,
      per_page: 100,
    });

    console.error(
      "Fork Commits:",
      JSON.stringify(
        forkCommits.map((c) => ({
          sha: c.sha.substring(0, 7),
          author: c.author?.login,
          committer: c.commit.author?.name,
          date: c.commit.author?.date,
          message: c.commit.message.split("\n")[0],
        })),
        null,
        2
      )
    );

    // Process fork contributors
    for (const commit of forkCommits) {
      if (!commit.commit?.author?.name || !commit.commit?.author?.date) {
        console.error(
          `Skipping fork commit ${commit.sha.substring(
            0,
            7
          )} - missing required data`
        );
        continue;
      }

      const key = commit.author?.login || commit.commit.author.name;
      if (!contributors[key]) {
        contributors[key] = {
          login: commit.author?.login || null,
          name: commit.commit.author.name,
          email: commit.commit.author.email || "",
          commits: 0,
          upstreamCommits: 0,
          forkCommits: 0,
          lastActive: commit.commit.author.date,
          isUpstreamContributor: false,
          isForkContributor: true,
          percentage: 0,
        };
      }
      contributors[key].commits++;
      contributors[key].forkCommits++;
      if (
        new Date(commit.commit.author.date) >
        new Date(contributors[key].lastActive)
      ) {
        contributors[key].lastActive = commit.commit.author.date;
      }
    }

    console.error(
      "All Contributors:",
      JSON.stringify(Object.values(contributors), null, 2)
    );

    // Calculate percentages
    const totalCommits = Object.values(contributors).reduce(
      (sum, c) => sum + c.commits,
      0
    );
    const contributorsList = Object.values(contributors)
      .sort((a, b) => b.commits - a.commits)
      .map((c) => ({
        ...c,
        percentage: Math.round((c.commits / totalCommits) * 100),
      }));

    const createdAt = repoInfo.data.created_at || new Date().toISOString();
    const pushedAt = repoInfo.data.pushed_at || new Date().toISOString();

    const analysis = {
      name: `${owner}/${repo}`,
      isForked: repoInfo.data.fork,
      upstream: upstreamInfo
        ? {
            fullName: upstreamInfo.full_name,
            description: upstreamInfo.description || "",
            createdAt: upstreamInfo.created_at || new Date().toISOString(),
            totalCommits: upstreamCommits.length,
          }
        : null,
      fork: {
        createdAt,
        description: repoInfo.data.description || "",
        lastPushAt: pushedAt,
        newCommits: forkCommits.length,
      },
      contributors: contributorsList,
      totalCommits,
    };

    console.error("Final Analysis:", JSON.stringify(analysis, null, 2));
    return analysis;
  } catch (error) {
    console.error(
      "❌ Error fetching repository:",
      error instanceof Error ? error.message : "Unknown error"
    );
    if (error instanceof Error && error.message.includes("Not Found")) {
      throw new Error(`Repository ${owner}/${repo} not found`);
    }
    throw error;
  }
}

export const analyzeRepositoryMetadata = {
  name: "analyzeRepository",
  description:
    "Analyze a GitHub repository to determine contribution splits based on commit history. For forks, provides detailed analysis of both upstream and fork contributions.",
  schema: z.object({
    owner: z.string().describe("The owner of the repository"),
    repo: z.string().describe("The name of the repository"),
  }),
};
