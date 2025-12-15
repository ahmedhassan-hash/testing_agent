#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import dotenv from "dotenv";
import { runScenario } from "./graph/orchestrator.js";
import { runAutonomousSimulation, type SimulationConfig } from "./graph/autonomous-orchestrator.js";
import { scenarios, listScenarios, getScenario } from "./scenarios/index.js";
import { cleanupAllTestUsers } from "./tools/auth.tools.js";

// Load environment variables
dotenv.config();

const program = new Command();

program
  .name("workmate-testing-agent")
  .description("LangGraph-based multi-agent testing system for Workmate AI")
  .version("1.0.0");

// NEW: Autonomous simulation command (default)
program
  .command("autonomous")
  .alias("auto")
  .description("Run autonomous multi-agent simulation - agents decide their own actions!")
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

// Legacy: Scenario-based run
program
  .command("scenario")
  .description("Run a scripted test scenario (legacy mode - not autonomous)")
  .option("-s, --scenario <name>", "Scenario to run", "full-lifecycle")
  .option("--no-cleanup", "Skip cleanup of test users after run")
  .option("--list", "List available scenarios")
  .action(async (options) => {
    if (options.list) {
      console.log(chalk.blue("\nAvailable scenarios:"));
      for (const name of listScenarios()) {
        const scenario = getScenario(name);
        console.log(chalk.white(`  ${name}`));
        console.log(chalk.gray(`    ${scenario?.description}`));
        console.log(chalk.gray(`    Steps: ${scenario?.steps.length}`));
      }
      return;
    }

    const scenario = getScenario(options.scenario);
    if (!scenario) {
      console.error(chalk.red(`Unknown scenario: ${options.scenario}`));
      console.log(chalk.gray(`Available: ${listScenarios().join(", ")}`));
      process.exit(1);
    }

    try {
      const result = await runScenario(scenario, {
        skipCleanup: !options.cleanup,
      });

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

program
  .command("list")
  .description("List available test scenarios")
  .action(() => {
    console.log(chalk.blue("\n📋 Available Test Scenarios\n"));

    for (const [name, scenario] of Object.entries(scenarios)) {
      console.log(chalk.cyan(`${name}`));
      console.log(chalk.white(`  ${scenario.description}`));
      console.log(chalk.gray(`  Steps: ${scenario.steps.length}`));

      // Show step summary
      const agentCounts: Record<string, number> = {};
      for (const step of scenario.steps) {
        agentCounts[step.agent] = (agentCounts[step.agent] || 0) + 1;
      }

      const agentSummary = Object.entries(agentCounts)
        .map(([agent, count]) => `${agent}: ${count}`)
        .join(", ");
      console.log(chalk.gray(`  Agent actions: ${agentSummary}`));
      console.log();
    }
  });

// Default command - run autonomous simulation
program
  .action(async () => {
    console.log(chalk.blue("\n🤖 Running autonomous simulation (default)"));
    console.log(chalk.gray("Use 'autonomous --help' for options, or 'scenario' for scripted mode\n"));

    try {
      const result = await runAutonomousSimulation();
      process.exit(result.status === "completed" ? 0 : 1);
    } catch (error) {
      console.error(chalk.red(`\nFatal error: ${error}`));
      process.exit(1);
    }
  });

program.parse();
