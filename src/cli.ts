import { createInterface } from "readline";
import { runAgent } from "./lib/agent";
import {
  RepositoryAnalysis,
  Contributor,
  analyzeRepository,
} from "./lib/tools/github";
import { createWriteStream } from "fs";
import { join } from "path";

// Create a debug log file
const debugLogStream = createWriteStream(join(process.cwd(), "debug.log"), {
  flags: "a",
});

// Redirect all stderr to the debug log file
const originalStdErrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk: any, encoding?: any, callback?: any) => {
  debugLogStream.write(chunk, encoding);
  return true;
};

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("\n🤖 Welcome to Safe Agent CLI!");
console.log("You can interact with your Safe through natural language.");
console.log("Type 'exit' to quit the program.\n");
console.log("Debug logs are written to debug.log\n");

async function formatAnalysis(analysis: RepositoryAnalysis): Promise<string> {
  let output = `\n📊 Repository Analysis: ${analysis.name}\n`;
  output += "═".repeat(output.length - 1) + "\n\n";

  if (analysis.isForked && analysis.upstream) {
    output += "🔍 Original Repository\n";
    output += `   ${analysis.upstream.fullName}\n`;
    output += `   • Description: ${analysis.upstream.description}\n`;
    output += `   • Created: ${new Date(
      analysis.upstream.createdAt
    ).toLocaleDateString()}\n`;
    output += `   • Total Commits: ${analysis.upstream.totalCommits}\n\n`;
  }

  output += "📁 Repository Information\n";
  output += `   • Created: ${new Date(
    analysis.fork.createdAt
  ).toLocaleDateString()}\n`;
  output += `   • Description: ${analysis.fork.description}\n`;
  output += `   • Last Push: ${new Date(
    analysis.fork.lastPushAt
  ).toLocaleDateString()}\n`;
  output += `   • Total Commits: ${analysis.totalCommits}\n\n`;

  output += "👥 Contributors\n";
  analysis.contributors.forEach((contributor: Contributor, index: number) => {
    const name = contributor.login || contributor.name;
    const githubUrl = contributor.login
      ? `https://github.com/${contributor.login}`
      : null;

    output += `   ${index + 1}. ${name}${githubUrl ? ` (${githubUrl})` : ""}\n`;
    output += `      • ${contributor.commits} commits (${contributor.percentage}%)\n`;
    output += `      • ${
      contributor.isUpstreamContributor ? "Original" : "Fork"
    } contributor\n`;

    if (contributor.upstreamCommits > 0) {
      output += `      • ${contributor.upstreamCommits} upstream commits\n`;
    }
    if (contributor.forkCommits > 0) {
      output += `      • ${contributor.forkCommits} fork commits\n`;
    }

    output += `      • Last active: ${new Date(
      contributor.lastActive
    ).toLocaleDateString()}\n`;
    if (index < analysis.contributors.length - 1) output += "\n";
  });

  return output;
}

const askQuestion = () => {
  rl.question("You: ", async (input) => {
    if (input.toLowerCase() === "exit") {
      debugLogStream.end();
      console.log("\nGoodbye! 👋\n");
      rl.close();
      return;
    }

    try {
      // Extract repository name if it's an analysis request
      if (input.toLowerCase().startsWith("analyze")) {
        const match = input.match(/\(([^)]+)\)/);
        if (match) {
          const [owner, repo] = match[1].split("/");
          process.stdout.write("\r⏳ Analyzing repository...");
          try {
            const analysis = await analyzeRepository(owner, repo);
            // Clear the loading message
            process.stdout.write("\r" + " ".repeat(50) + "\r");
            // Show the formatted analysis results
            console.log(await formatAnalysis(analysis));
          } catch (error) {
            // Clear the loading message
            process.stdout.write("\r" + " ".repeat(50) + "\r");
            console.log("\n❌ Repository Analysis Failed:");
            console.log(
              error instanceof Error ? error.message : "Unknown error"
            );
          }
        } else {
          console.log(
            "\n❌ Invalid repository format. Use: analyze (owner/repo)"
          );
        }
      } else {
        const response = await runAgent(input);
        console.log("\n🤖 Response:", response);
      }
    } catch (error) {
      console.log(
        "\n❌ Error:",
        error instanceof Error ? error.message : "An unknown error occurred"
      );
    }

    console.log(); // Empty line for better readability
    askQuestion(); // Continue the conversation
  });
};

// Start the conversation
askQuestion();
