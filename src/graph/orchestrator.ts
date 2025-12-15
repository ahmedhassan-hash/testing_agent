import { END, START, StateGraph } from "@langchain/langgraph";
import chalk from "chalk";
import { businessAgent, homeownerAgent, tradespersonAgent } from "../agents/index.js";
import type { TestAgentState, TestScenario, UserRole } from "../state/types.js";
import { createInitialState } from "../state/types.js";
import { createTestUser, deleteTestUser } from "../tools/auth.tools.js";

// Channels for state management
const graphChannels = {
  testUsers: {
    reducer: (a: any, b: any) => b ?? a,
    default: () => [],
  },
  jobs: {
    reducer: (a: any, b: any) => b ?? a,
    default: () => [],
  },
  applications: {
    reducer: (a: any, b: any) => b ?? a,
    default: () => [],
  },
  offers: {
    reducer: (a: any, b: any) => b ?? a,
    default: () => [],
  },
  reviews: {
    reducer: (a: any, b: any) => b ?? a,
    default: () => [],
  },
  currentScenario: {
    reducer: (a: any, b: any) => b ?? a,
    default: () => null,
  },
  currentStepIndex: {
    reducer: (a: any, b: any) => b ?? a,
    default: () => 0,
  },
  actionHistory: {
    reducer: (a: any, b: any) => b ?? a,
    default: () => [],
  },
  errors: {
    reducer: (a: any, b: any) => b ?? a,
    default: () => [],
  },
  status: {
    reducer: (a: any, b: any) => b ?? a,
    default: () => "idle" as const,
  },
  messages: {
    reducer: (a: any, b: any) => b ?? a,
    default: () => [],
  },
};

/**
 * Node: Initialize test users based on scenario requirements
 */
async function initializeUsers(state: TestAgentState): Promise<TestAgentState> {
  console.log(chalk.blue("\n📋 Initializing test users..."));

  const scenario = state.currentScenario;
  if (!scenario) {
    state.errors.push("No scenario loaded");
    state.status = "failed";
    return state;
  }

  // Determine which user types are needed
  const neededRoles = new Set<UserRole>();
  for (const step of scenario.steps) {
    neededRoles.add(step.agent);
  }

  // Create test users for each needed role
  for (const role of neededRoles) {
    try {
      console.log(chalk.gray(`  Creating ${role} user...`));
      const user = await createTestUser({ role });
      state.testUsers.push(user);
      state.messages.push(`Created ${role} user: ${user.fullName}`);
      console.log(chalk.green(`  ✓ Created ${role}: ${user.email}`));
    } catch (error) {
      const msg = `Failed to create ${role} user: ${error}`;
      state.errors.push(msg);
      console.log(chalk.red(`  ✗ ${msg}`));
    }
  }

  // Check if we have all needed users
  const createdRoles = new Set(state.testUsers.map(u => u.role));
  const missingRoles = [...neededRoles].filter(r => !createdRoles.has(r));

  if (missingRoles.length > 0) {
    state.errors.push(`Missing required users: ${missingRoles.join(", ")}`);
    state.status = "failed";
  } else {
    state.status = "running";
    console.log(chalk.green(`\n✓ All ${state.testUsers.length} test users created`));
  }

  return state;
}

/**
 * Node: Execute current scenario step
 */
async function executeStep(state: TestAgentState): Promise<TestAgentState> {
  const scenario = state.currentScenario;
  if (!scenario || state.currentStepIndex >= scenario.steps.length) {
    return state;
  }

  const step = scenario.steps[state.currentStepIndex];
  const stepNum = state.currentStepIndex + 1;
  const totalSteps = scenario.steps.length;

  console.log(chalk.cyan(`\n🔄 Step ${stepNum}/${totalSteps}: ${step.agent} → ${step.action}`));

  try {
    let result;

    // Route to appropriate agent
    switch (step.agent) {
      case "homeowner":
        result = await homeownerAgent(state, step.action as any, step.params as any);
        break;
      case "tradesperson":
        result = await tradespersonAgent(state, step.action as any, step.params as any);
        break;
      case "business":
        result = await businessAgent(state, step.action as any, step.params as any);
        break;
      default:
        throw new Error(`Unknown agent type: ${step.agent}`);
    }

    state = result.state;

    if (result.result.success) {
      console.log(chalk.green(`   ✓ ${step.expectedOutcome || "Success"}`));
    } else {
      console.log(chalk.red(`   ✗ Failed: ${result.result.error}`));
    }
  } catch (error) {
    const msg = `Step ${stepNum} failed: ${error}`;
    state.errors.push(msg);
    console.log(chalk.red(`   ✗ ${msg}`));
  }

  // Move to next step
  state.currentStepIndex++;

  return state;
}

/**
 * Node: Cleanup test data
 */
async function cleanup(state: TestAgentState): Promise<TestAgentState> {
  console.log(chalk.blue("\n🧹 Cleaning up test users..."));

  for (const user of state.testUsers) {
    try {
      await deleteTestUser(user);
      console.log(chalk.gray(`  ✓ Deleted ${user.email}`));
    } catch (error) {
      console.log(chalk.yellow(`  ⚠ Could not delete ${user.email}: ${error}`));
    }
  }

  state.messages.push("Cleanup completed");
  return state;
}

/**
 * Node: Finalize and report results
 */
function finalize(state: TestAgentState): TestAgentState {
  const scenario = state.currentScenario;

  console.log(chalk.blue("\n" + "=".repeat(50)));
  console.log(chalk.blue("📊 TEST RESULTS"));
  console.log(chalk.blue("=".repeat(50)));

  if (scenario) {
    console.log(chalk.white(`Scenario: ${scenario.name}`));
    console.log(chalk.white(`Description: ${scenario.description}`));
  }

  const successfulActions = state.actionHistory.filter(a => a.success).length;
  const failedActions = state.actionHistory.filter(a => !a.success).length;

  console.log(chalk.white(`\nActions: ${successfulActions} passed, ${failedActions} failed`));

  if (state.errors.length > 0) {
    console.log(chalk.red("\nErrors:"));
    state.errors.forEach(e => console.log(chalk.red(`  - ${e}`)));
    state.status = "failed";
  } else {
    state.status = "completed";
  }

  console.log(chalk.white("\nEntities created:"));
  console.log(chalk.gray(`  - Users: ${state.testUsers.length}`));
  console.log(chalk.gray(`  - Jobs: ${state.jobs.length}`));
  console.log(chalk.gray(`  - Applications: ${state.applications.length}`));
  console.log(chalk.gray(`  - Offers: ${state.offers.length}`));
  console.log(chalk.gray(`  - Reviews: ${state.reviews.length}`));

  if (state.status === "completed") {
    console.log(chalk.green("\n✅ TEST PASSED"));
  } else {
    console.log(chalk.red("\n❌ TEST FAILED"));
  }

  console.log(chalk.blue("=".repeat(50) + "\n"));

  return state;
}

/**
 * Conditional edge: Check if more steps remain
 */
function shouldContinue(state: TestAgentState): string {
  if (state.status === "failed") {
    return "cleanup";
  }

  const scenario = state.currentScenario;
  if (!scenario) {
    return "cleanup";
  }

  if (state.currentStepIndex < scenario.steps.length) {
    return "execute_step";
  }

  return "cleanup";
}

/**
 * Build the test orchestrator graph
 */
export function buildOrchestratorGraph() {
  // Define node names as const for type safety
  const nodes = {
    initializeUsers: "initialize_users",
    executeStep: "execute_step",
    cleanup: "cleanup",
    finalize: "finalize",
  } as const;

  const graph = new StateGraph<TestAgentState>({
    channels: graphChannels,
  })
    .addNode(nodes.initializeUsers, initializeUsers)
    .addNode(nodes.executeStep, executeStep)
    .addNode(nodes.cleanup, cleanup)
    .addNode(nodes.finalize, finalize)
    .addEdge(START, nodes.initializeUsers)
    .addConditionalEdges(nodes.initializeUsers, shouldContinue, {
      execute_step: nodes.executeStep,
      cleanup: nodes.cleanup,
    })
    .addConditionalEdges(nodes.executeStep, shouldContinue, {
      execute_step: nodes.executeStep,
      cleanup: nodes.cleanup,
    })
    .addEdge(nodes.cleanup, nodes.finalize)
    .addEdge(nodes.finalize, END);

  return graph.compile();
}

/**
 * Run a test scenario
 */
export async function runScenario(scenario: TestScenario, options?: { skipCleanup?: boolean }): Promise<TestAgentState> {
  console.log(chalk.blue("\n" + "=".repeat(50)));
  console.log(chalk.blue(`🚀 STARTING TEST: ${scenario.name}`));
  console.log(chalk.blue("=".repeat(50)));
  console.log(chalk.gray(scenario.description));

  const graph = buildOrchestratorGraph();

  const initialState: TestAgentState = {
    ...createInitialState(),
    currentScenario: scenario,
    status: "running",
  };

  const finalState = await graph.invoke(initialState);

  return finalState as TestAgentState;
}
