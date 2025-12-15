#!/usr/bin/env node

import chalk from "chalk";
import { Command } from "commander";
import dotenv from "dotenv";
import {
  runAutonomousSimulation,
  type SimulationConfig,
} from "./graph/orchestrator.js";
import { cleanupAllTestUsers } from "./tools/auth.tools.js";

dotenv.config();

const program = new Command();

program
  .name("workmate-testing-agent")
  .description("LangGraph-based multi-agent testing system for Workmate AI")
  .version("1.0.0");

// Autonomous simulation command
program
  .command("autonomous")
  .alias("auto")
  .description(
    "Run autonomous multi-agent simulation - agents decide their own actions!"
  )
  .option("-h, --homeowners <count>", "Number of homeowner agents", "2")
  .option("-t, --tradespersons <count>", "Number of tradesperson agents", "3")
  .option("-b, --businesses <count>", "Number of business agents", "1")
  .option("--no-llm", "Disable LLM decisions (use heuristics only)")
  .option("-i, --iterations <count>", "Max iterations", "50")
  .option("--jobs <count>", "Minimum jobs goal", "3")
  .option("--apps <count>", "Minimum applications goal", "5")
  .option("--offers <count>", "Minimum accepted offers goal", "2")
  .option("--reviews <count>", "Minimum reviews goal", "2")
  .option("-d, --delay <ms>", "Delay between actions in ms", "500")
  .action(async (options) => {
    const config: Partial<SimulationConfig> = {
      homeownerCount: parseInt(options.homeowners),
      tradespersonCount: parseInt(options.tradespersons),
      businessCount: parseInt(options.businesses),
      useLLM: options.llm !== false,
      delayBetweenActions: parseInt(options.delay),
      goals: {
        minJobs: parseInt(options.jobs),
        minApplications: parseInt(options.apps),
        minAcceptedOffers: parseInt(options.offers),
        minReviews: parseInt(options.reviews),
        maxIterations: parseInt(options.iterations),
      },
    };

    try {
      const result = await runAutonomousSimulation(config);
      process.exit(result.status === "completed" ? 0 : 1);
    } catch (error) {
      console.error(chalk.red(`\nFatal error: ${error}`));
      process.exit(1);
    }
  });

program
  .command("cleanup")
  .description("Clean up all test users from the database")
  .action(async () => {
    try {
      console.log(chalk.blue("\n🧹 Cleaning up all test users..."));
      const count = await cleanupAllTestUsers();
      console.log(chalk.green(`\n✓ Cleaned up ${count} test users`));
    } catch (error) {
      console.error(chalk.red(`\nFailed to cleanup: ${error}`));
      process.exit(1);
    }
  });

// Default command - run autonomous simulation
program.action(async () => {
  console.log(chalk.blue("\n🤖 Running autonomous simulation..."));
  console.log(chalk.gray("Use 'autonomous --help' for options\n"));

  try {
    const result = await runAutonomousSimulation();
    process.exit(result.status === "completed" ? 0 : 1);
  } catch (error) {
    console.error(chalk.red(`\nFatal error: ${error}`));
    process.exit(1);
  }
});

program.parse();
