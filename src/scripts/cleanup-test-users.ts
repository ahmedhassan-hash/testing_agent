#!/usr/bin/env node

import chalk from "chalk";
import dotenv from "dotenv";
import { cleanupAllTestUsers } from "../tools/auth.tools.js";

dotenv.config();

async function main() {
  console.log(chalk.blue("\n🧹 Test User Cleanup Script"));
  console.log(chalk.blue("=".repeat(40)));

  try {
    const count = await cleanupAllTestUsers();
    console.log(chalk.green(`\n✓ Successfully cleaned up ${count} test users`));
  } catch (error) {
    console.error(chalk.red(`\n✗ Cleanup failed: ${error}`));
    process.exit(1);
  }
}

main();
