import { createInterface } from "readline";
import { runAgent } from "./lib/agent";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("\n🤖 Welcome to Safe Agent CLI!");
console.log("You can interact with your Safe through natural language.");
console.log("Type 'exit' to quit the program.\n");

const askQuestion = () => {
  rl.question("You: ", async (input) => {
    if (input.toLowerCase() === "exit") {
      console.log("\nGoodbye! 👋\n");
      rl.close();
      return;
    }

    try {
      console.log("\n🤖 Agent is thinking...\n");
      const response = await runAgent(input);
      console.log("Agent:", response);
      console.log(); // Empty line for better readability
    } catch (error) {
      console.error(
        "\n❌ Error:",
        error instanceof Error ? error.message : "An unknown error occurred"
      );
      console.log(); // Empty line for better readability
    }

    askQuestion(); // Continue the conversation
  });
};

// Start the conversation
askQuestion();
