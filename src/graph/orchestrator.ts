import { END, START, StateGraph } from "@langchain/langgraph";
import chalk from "chalk";
import {
  checkGoalsCompleted,
  decideNextAction,
  DEFAULT_GOALS,
  executeAction,
  getAvailableActions,
  SimulationGoals,
} from "../agents/autonomous.agent.js";
import type { TestAgentState, UserRole } from "../state/types.js";
import { createInitialState } from "../state/types.js";
import { createTestUser } from "../tools/auth.tools.js";

// Extended state for autonomous operation
export interface AutonomousState extends TestAgentState {
  simulationConfig: SimulationConfig;
  currentIteration: number;
  agentGoals: Map<string, string[]>; // userId -> goals
  waitingAgents: Set<string>; // userIds that are waiting
  lastActionByAgent: Map<string, number>; // userId -> iteration
}

export interface SimulationConfig {
  homeownerCount: number;
  tradespersonCount: number;
  businessCount: number;
  goals: SimulationGoals;
  useLLM: boolean;
  delayBetweenActions: number; // ms
  maxWaitCycles: number; // max cycles an agent can wait before being skipped
}

export const DEFAULT_CONFIG: SimulationConfig = {
  homeownerCount: 3,
  tradespersonCount: 6,
  businessCount: 2,
  goals: DEFAULT_GOALS,
  useLLM: true,
  delayBetweenActions: 500,
  maxWaitCycles: 5,
};

// Default goals for each role
const ROLE_GOALS: Record<UserRole, string[]> = {
  homeowner: [
    "Post at least one job",
    "Review applications and make offers to qualified tradespersons",
    "Complete jobs and leave reviews for good work",
  ],
  tradesperson: [
    "Browse available jobs that match my skills",
    "Apply to promising jobs with competitive quotes",
    "Accept good offers and complete work professionally",
  ],
  business: [
    "Post jobs for business projects",
    "Find qualified tradespersons and make offers",
    "Complete projects and leave reviews",
  ],
  team_member: [],
  admin: [],
};

// Channels for autonomous state management
const autonomousChannels = {
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
  simulationConfig: {
    reducer: (a: any, b: any) => b ?? a,
    default: () => DEFAULT_CONFIG,
  },
  currentIteration: {
    reducer: (a: any, b: any) => b ?? a,
    default: () => 0,
  },
  agentGoals: {
    reducer: (a: any, b: any) => b ?? a,
    default: () => new Map(),
  },
  waitingAgents: {
    reducer: (a: any, b: any) => b ?? a,
    default: () => new Set(),
  },
  lastActionByAgent: {
    reducer: (a: any, b: any) => b ?? a,
    default: () => new Map(),
  },
};

/**
 * Node: Initialize multiple test users
 */
async function initializeUsers(
  state: AutonomousState
): Promise<AutonomousState> {
  const config = state.simulationConfig;

  console.log(chalk.blue("\n" + "=".repeat(60)));
  console.log(chalk.blue("🤖 AUTONOMOUS SIMULATION - Initializing Agents"));
  console.log(chalk.blue("=".repeat(60)));
  console.log(
    chalk.gray(
      `Creating ${config.homeownerCount} homeowners, ${config.tradespersonCount} tradespersons, ${config.businessCount} businesses`
    )
  );

  const usersToCreate: { role: UserRole; count: number }[] = [
    { role: "homeowner", count: config.homeownerCount },
    { role: "tradesperson", count: config.tradespersonCount },
    { role: "business", count: config.businessCount },
  ];

  state.agentGoals = new Map();
  state.waitingAgents = new Set();
  state.lastActionByAgent = new Map();

  for (const { role, count } of usersToCreate) {
    for (let i = 0; i < count; i++) {
      try {
        console.log(chalk.gray(`  Creating ${role} ${i + 1}/${count}...`));
        const user = await createTestUser({ role });
        state.testUsers.push(user);

        // Assign goals to this agent
        state.agentGoals.set(user.id, ROLE_GOALS[role]);
        state.lastActionByAgent.set(user.id, 0);

        console.log(
          chalk.green(`  ✓ Created ${role}: ${user.fullName} (${user.email})`)
        );
        state.messages.push(`Created ${role}: ${user.fullName}`);
      } catch (error) {
        const msg = `Failed to create ${role} ${i + 1}: ${error}`;
        state.errors.push(msg);
        console.log(chalk.red(`  ✗ ${msg}`));
      }
    }
  }

  // Check minimum requirements
  const homeowners = state.testUsers.filter(
    (u) => u.role === "homeowner"
  ).length;
  const tradespersons = state.testUsers.filter(
    (u) => u.role === "tradesperson"
  ).length;

  if (homeowners === 0 || tradespersons === 0) {
    state.errors.push("Need at least one homeowner and one tradesperson");
    state.status = "failed";
  } else {
    state.status = "running";
    console.log(
      chalk.green(`\n✓ Created ${state.testUsers.length} agents total`)
    );
  }

  return state;
}

/**
 * Node: Autonomous agent loop - each agent decides and acts
 */
async function autonomousLoop(
  state: AutonomousState
): Promise<AutonomousState> {
  const config = state.simulationConfig;
  state.currentIteration++;

  console.log(
    chalk.cyan(
      `\n━━━ Iteration ${state.currentIteration}/${config.goals.maxIterations} ━━━`
    )
  );

  // Shuffle agents to randomize action order
  const shuffledAgents = [...state.testUsers].sort(() => Math.random() - 0.5);

  let anyActionTaken = false;

  for (const agent of shuffledAgents) {
    // Skip if this agent has been waiting too long without opportunities
    const lastAction = state.lastActionByAgent.get(agent.id) || 0;
    const waitCycles = state.currentIteration - lastAction;

    if (
      state.waitingAgents.has(agent.id) &&
      waitCycles > config.maxWaitCycles
    ) {
      continue;
    }

    const goals = state.agentGoals.get(agent.id) || [];
    const availableActions = getAvailableActions(state, agent);

    // Log agent status
    const roleEmoji =
      agent.role === "homeowner"
        ? "🏠"
        : agent.role === "tradesperson"
        ? "🔧"
        : "🏢";

    if (availableActions.length === 0) {
      state.waitingAgents.add(agent.id);
      continue;
    }

    // Agent can act - remove from waiting
    state.waitingAgents.delete(agent.id);

    try {
      // Decide what to do
      const decision = await decideNextAction(
        state,
        agent,
        goals,
        config.useLLM
      );

      if (!decision) {
        console.log(
          chalk.gray(
            `  ${roleEmoji} ${agent.fullName}: waiting (no productive action)`
          )
        );
        state.waitingAgents.add(agent.id);
        continue;
      }

      console.log(
        chalk.white(
          `  ${roleEmoji} ${agent.fullName} → ${chalk.yellow(decision.action)}`
        )
      );
      if (decision.reasoning) {
        console.log(chalk.gray(`     └─ ${decision.reasoning}`));
      }

      // Execute the action
      const result = await executeAction(state, agent, decision);
      state = result.state as AutonomousState;

      if (result.result.success) {
        console.log(chalk.green(`     ✓ Success`));
        state.lastActionByAgent.set(agent.id, state.currentIteration);
        anyActionTaken = true;
      } else {
        console.log(chalk.red(`     ✗ Failed: ${result.result.error}`));
      }

      // Small delay between actions
      if (config.delayBetweenActions > 0) {
        await new Promise((r) => setTimeout(r, config.delayBetweenActions));
      }
    } catch (error) {
      console.log(
        chalk.red(`  ${roleEmoji} ${agent.fullName}: Error - ${error}`)
      );
      state.errors.push(`Agent ${agent.fullName} error: ${error}`);
    }
  }

  // Log current state summary
  console.log(
    chalk.gray(
      `\n  📊 State: ${state.jobs.length} jobs, ${state.applications.length} applications, ${state.offers.length} offers, ${state.reviews.length} reviews`
    )
  );

  // Check if all agents are stuck
  if (!anyActionTaken && state.waitingAgents.size === state.testUsers.length) {
    console.log(
      chalk.yellow("\n  ⚠ All agents waiting - simulation may be stuck")
    );
  }

  return state;
}

/**
 * Node: Skip cleanup - keep all test data
 */
async function cleanup(state: AutonomousState): Promise<AutonomousState> {
  console.log(chalk.blue("\n📦 Keeping all test users and data (no cleanup)"));
  console.log(chalk.gray(`  Users created: ${state.testUsers.length}`));
  state.testUsers.forEach((u) => {
    console.log(chalk.gray(`    - ${u.fullName} (${u.email})`));
  });
  state.messages.push("Simulation completed - data preserved");
  return state;
}

/**
 * Node: Finalize and report results
 */
function finalize(state: AutonomousState): AutonomousState {
  const config = state.simulationConfig;

  console.log(chalk.blue("\n" + "=".repeat(60)));
  console.log(chalk.blue("📊 AUTONOMOUS SIMULATION RESULTS"));
  console.log(chalk.blue("=".repeat(60)));

  console.log(
    chalk.white(`\nSimulation ran for ${state.currentIteration} iterations`)
  );

  // Goal achievement
  const goals = config.goals;
  const jobsGoal = state.jobs.length >= goals.minJobs;
  const appsGoal = state.applications.length >= goals.minApplications;
  const offersGoal =
    state.offers.filter(
      (o) => o.status === "ACCEPTED" || o.status === "COMPLETED"
    ).length >= goals.minAcceptedOffers;
  const reviewsGoal = state.reviews.length >= goals.minReviews;

  console.log(chalk.white("\nGoal Achievement:"));
  console.log(
    `  ${jobsGoal ? chalk.green("✓") : chalk.red("✗")} Jobs: ${
      state.jobs.length
    }/${goals.minJobs}`
  );
  console.log(
    `  ${appsGoal ? chalk.green("✓") : chalk.red("✗")} Applications: ${
      state.applications.length
    }/${goals.minApplications}`
  );
  console.log(
    `  ${offersGoal ? chalk.green("✓") : chalk.red("✗")} Accepted Offers: ${
      state.offers.filter(
        (o) => o.status === "ACCEPTED" || o.status === "COMPLETED"
      ).length
    }/${goals.minAcceptedOffers}`
  );
  console.log(
    `  ${reviewsGoal ? chalk.green("✓") : chalk.red("✗")} Reviews: ${
      state.reviews.length
    }/${goals.minReviews}`
  );

  // Action summary
  const successfulActions = state.actionHistory.filter((a) => a.success).length;
  const failedActions = state.actionHistory.filter((a) => !a.success).length;

  console.log(
    chalk.white(
      `\nActions: ${successfulActions} passed, ${failedActions} failed`
    )
  );

  // Per-agent summary
  console.log(chalk.white("\nAgent Activity:"));
  for (const user of state.testUsers) {
    const userActions = state.actionHistory.filter((a) => a.userId === user.id);
    const successes = userActions.filter((a) => a.success).length;
    const roleEmoji =
      user.role === "homeowner"
        ? "🏠"
        : user.role === "tradesperson"
        ? "🔧"
        : "🏢";
    console.log(
      chalk.gray(
        `  ${roleEmoji} ${user.fullName}: ${successes}/${userActions.length} successful actions`
      )
    );
  }

  if (state.errors.length > 0) {
    console.log(chalk.red("\nErrors:"));
    state.errors.slice(0, 5).forEach((e) => console.log(chalk.red(`  - ${e}`)));
    if (state.errors.length > 5) {
      console.log(chalk.red(`  ... and ${state.errors.length - 5} more`));
    }
  }

  // Final status
  const allGoalsMet = jobsGoal && appsGoal && offersGoal && reviewsGoal;
  if (allGoalsMet) {
    state.status = "completed";
    console.log(
      chalk.green("\n✅ SIMULATION COMPLETED SUCCESSFULLY - All goals met!")
    );
  } else if (state.errors.length > 10) {
    state.status = "failed";
    console.log(chalk.red("\n❌ SIMULATION FAILED - Too many errors"));
  } else {
    state.status = "completed";
    console.log(chalk.yellow("\n⚠ SIMULATION COMPLETED - Some goals not met"));
  }

  console.log(chalk.blue("=".repeat(60) + "\n"));

  return state;
}

/**
 * Conditional: Check if simulation should continue
 */
function shouldContinue(state: AutonomousState): string {
  // Stop if failed
  if (state.status === "failed") {
    return "cleanup";
  }

  const config = state.simulationConfig;

  // Stop if max iterations reached
  if (state.currentIteration >= config.goals.maxIterations) {
    console.log(chalk.yellow("\n⏱ Max iterations reached"));
    return "cleanup";
  }

  // Stop if all goals met
  if (checkGoalsCompleted(state, config.goals)) {
    console.log(chalk.green("\n🎯 All goals achieved!"));
    return "cleanup";
  }

  // Stop if too many errors
  if (state.errors.length > 20) {
    console.log(chalk.red("\n⚠ Too many errors, stopping simulation"));
    state.status = "failed";
    return "cleanup";
  }

  // Continue simulation
  return "autonomous_loop";
}

/**
 * Build the autonomous orchestrator graph
 */
export function buildAutonomousGraph() {
  const nodes = {
    initializeUsers: "initialize_users",
    autonomousLoop: "autonomous_loop",
    cleanup: "cleanup",
    finalize: "finalize",
  } as const;

  const graph = new StateGraph<AutonomousState>({
    channels: autonomousChannels as any,
  })
    .addNode(nodes.initializeUsers, initializeUsers)
    .addNode(nodes.autonomousLoop, autonomousLoop)
    .addNode(nodes.cleanup, cleanup)
    .addNode(nodes.finalize, finalize)
    .addEdge(START, nodes.initializeUsers)
    .addConditionalEdges(nodes.initializeUsers, shouldContinue, {
      autonomous_loop: nodes.autonomousLoop,
      cleanup: nodes.cleanup,
    })
    .addConditionalEdges(nodes.autonomousLoop, shouldContinue, {
      autonomous_loop: nodes.autonomousLoop,
      cleanup: nodes.cleanup,
    })
    .addEdge(nodes.cleanup, nodes.finalize)
    .addEdge(nodes.finalize, END);

  return graph.compile();
}

/**
 * Run autonomous simulation
 */
export async function runAutonomousSimulation(
  config: Partial<SimulationConfig> = {}
): Promise<AutonomousState> {
  const fullConfig: SimulationConfig = { ...DEFAULT_CONFIG, ...config };

  console.log(chalk.blue("\n" + "=".repeat(60)));
  console.log(chalk.blue("🚀 STARTING AUTONOMOUS SIMULATION"));
  console.log(chalk.blue("=".repeat(60)));
  console.log(chalk.gray(`Homeowners: ${fullConfig.homeownerCount}`));
  console.log(chalk.gray(`Tradespersons: ${fullConfig.tradespersonCount}`));
  console.log(chalk.gray(`Businesses: ${fullConfig.businessCount}`));
  console.log(
    chalk.gray(
      `LLM Decisions: ${
        fullConfig.useLLM ? "enabled" : "disabled (heuristics only)"
      }`
    )
  );
  console.log(
    chalk.gray(
      `Goals: ${fullConfig.goals.minJobs} jobs, ${fullConfig.goals.minApplications} apps, ${fullConfig.goals.minAcceptedOffers} offers, ${fullConfig.goals.minReviews} reviews`
    )
  );

  const graph = buildAutonomousGraph();

  const initialState: AutonomousState = {
    ...createInitialState(),
    simulationConfig: fullConfig,
    currentIteration: 0,
    agentGoals: new Map(),
    waitingAgents: new Set(),
    lastActionByAgent: new Map(),
    status: "running",
  };

  const finalState = await graph.invoke(initialState);

  return finalState as AutonomousState;
}
