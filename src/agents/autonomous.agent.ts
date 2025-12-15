import chalk from "chalk";
import { chat } from "../config/llm.js";
import type {
  ActionResult,
  TestAgentState,
  TestUser,
  UserRole,
} from "../state/types.js";
import { businessAgent } from "./business.agent.js";
import { homeownerAgent } from "./homeowner.agent.js";
import { tradespersonAgent } from "./tradesperson.agent.js";

// Types for autonomous operation
export type HomeownerAction =
  | "create_job"
  | "view_applications"
  | "shortlist_applicant"
  | "make_offer"
  | "complete_job"
  | "leave_review";
export type TradespersonAction =
  | "browse_jobs"
  | "apply_to_job"
  | "view_offers"
  | "accept_offer"
  | "reject_offer"
  | "view_reviews";
export type BusinessAction =
  | "create_job"
  | "view_applications"
  | "make_offer"
  | "view_offers"
  | "complete_job"
  | "leave_review";
export type AnyAction = HomeownerAction | TradespersonAction | BusinessAction;

export interface AgentDecision {
  action: AnyAction;
  reasoning: string;
  params?: Record<string, any>;
}

export interface AutonomousAgentConfig {
  userId: string;
  role: UserRole;
  goals: string[];
  personality?: string;
}

/**
 * Get the state context for a specific user to help LLM make decisions
 */
function getAgentContext(state: TestAgentState, user: TestUser): string {
  const myJobs = state.jobs.filter((j) => j.createdBy === user.id);
  const myApplications = state.applications.filter(
    (a) => a.applicantId === user.id
  );
  const myOffers = state.offers.filter(
    (o) => o.homeownerId === user.id || o.tradespersonId === user.id
  );
  const myReviews = state.reviews;

  // Jobs I can apply to (for tradespersons)
  const appliedJobIds = new Set(myApplications.map((a) => a.jobId));
  const availableJobs = state.jobs.filter(
    (j) =>
      j.status === "OPEN" && !appliedJobIds.has(j.id) && j.createdBy !== user.id
  );

  // Applications to my jobs (for homeowners/business)
  const applicationsToMyJobs = state.applications.filter((a) =>
    myJobs.some((j) => j.id === a.jobId)
  );

  // Pending offers for me
  const pendingOffersForMe = myOffers.filter(
    (o) => o.status === "PENDING" && o.tradespersonId === user.id
  );

  // Accepted offers I can complete (homeowner/business)
  const acceptedOffersToComplete = myOffers.filter(
    (o) => o.status === "ACCEPTED" && o.homeownerId === user.id
  );

  // Completed offers I can review
  const reviewedOfferIds = new Set(myReviews.map((r) => r.offerId));
  const offersToReview = myOffers.filter(
    (o) =>
      o.status === "COMPLETED" &&
      !reviewedOfferIds.has(o.id) &&
      o.homeownerId === user.id
  );

  return `
Current State for ${user.fullName} (${user.role}):
- My Jobs Posted: ${myJobs.length} (Open: ${
    myJobs.filter((j) => j.status === "OPEN").length
  }, In Progress: ${
    myJobs.filter((j) => j.status === "IN_PROGRESS").length
  }, Completed: ${myJobs.filter((j) => j.status === "COMPLETED").length})
- My Applications: ${myApplications.length}
- Available Jobs to Apply: ${availableJobs.length}
- Applications to My Jobs: ${applicationsToMyJobs.length} (Pending review)
- My Offers: ${myOffers.length} (Pending: ${
    myOffers.filter((o) => o.status === "PENDING").length
  }, Accepted: ${myOffers.filter((o) => o.status === "ACCEPTED").length})
- Pending Offers for Me to Respond: ${pendingOffersForMe.length}
- Accepted Offers I Can Complete: ${acceptedOffersToComplete.length}
- Completed Offers I Can Review: ${offersToReview.length}
- My Reviews Given: ${
    myReviews.filter((r) =>
      myOffers.some((o) => o.id === r.offerId && o.homeownerId === user.id)
    ).length
  }

Recent Activity:
${
  state.actionHistory
    .slice(-5)
    .map(
      (a) =>
        `- ${a.agentType}: ${a.action} (${a.success ? "success" : "failed"})`
    )
    .join("\n") || "No recent activity"
}
`.trim();
}

/**
 * Get available actions for a user based on their role and state
 */
export function getAvailableActions(
  state: TestAgentState,
  user: TestUser
): AnyAction[] {
  // Create a temporary state view focused on this user
  const userState = { ...state };

  switch (user.role) {
    case "homeowner":
      return getAvailableHomeownerActionsForUser(userState, user);
    case "tradesperson":
      return getAvailableTradespersonActionsForUser(userState, user);
    case "business":
      return getAvailableBusinessActionsForUser(userState, user);
    default:
      return [];
  }
}

/**
 * Get available homeowner actions considering this specific user
 */
function getAvailableHomeownerActionsForUser(
  state: TestAgentState,
  user: TestUser
): HomeownerAction[] {
  const actions: HomeownerAction[] = ["create_job"];

  const myJobs = state.jobs.filter((j) => j.createdBy === user.id);
  if (myJobs.length > 0) {
    actions.push("view_applications");
  }

  // Check for applications to my jobs
  const myJobIds = new Set(myJobs.map((j) => j.id));
  const applicationsToMyJobs = state.applications.filter((a) =>
    myJobIds.has(a.jobId)
  );
  if (applicationsToMyJobs.length > 0) {
    actions.push("shortlist_applicant", "make_offer");
  }

  // Check for accepted offers
  const myOffers = state.offers.filter((o) => o.homeownerId === user.id);
  const acceptedOffers = myOffers.filter((o) => o.status === "ACCEPTED");
  if (acceptedOffers.length > 0) {
    actions.push("complete_job");
  }

  // Check for completed offers to review
  const completedOffers = myOffers.filter((o) => o.status === "COMPLETED");
  const reviewedOfferIds = new Set(state.reviews.map((r) => r.offerId));
  const unreviewedOffers = completedOffers.filter(
    (o) => !reviewedOfferIds.has(o.id)
  );
  if (unreviewedOffers.length > 0) {
    actions.push("leave_review");
  }

  return actions;
}

/**
 * Get available tradesperson actions considering this specific user
 */
function getAvailableTradespersonActionsForUser(
  state: TestAgentState,
  user: TestUser
): TradespersonAction[] {
  const actions: TradespersonAction[] = [
    "browse_jobs",
    "view_offers",
    "view_reviews",
  ];

  // Always allow apply_to_job - there are jobs in the database to apply to
  // Limit applications per user to avoid spam
  const myApplications = state.applications.filter(
    (a) => a.applicantId === user.id
  );
  if (myApplications.length < 5) {
    actions.push("apply_to_job");
  }

  // Check for pending offers to me
  const pendingOffers = state.offers.filter(
    (o) => o.tradespersonId === user.id && o.status === "PENDING"
  );
  if (pendingOffers.length > 0) {
    actions.push("accept_offer", "reject_offer");
  }

  return actions;
}

/**
 * Get available business actions considering this specific user
 */
function getAvailableBusinessActionsForUser(
  state: TestAgentState,
  user: TestUser
): BusinessAction[] {
  const actions: BusinessAction[] = ["create_job", "view_offers"];

  const myJobs = state.jobs.filter((j) => j.createdBy === user.id);
  if (myJobs.length > 0) {
    actions.push("view_applications");
  }

  // Check for applications to my jobs
  const myJobIds = new Set(myJobs.map((j) => j.id));
  const applicationsToMyJobs = state.applications.filter((a) =>
    myJobIds.has(a.jobId)
  );
  if (applicationsToMyJobs.length > 0) {
    actions.push("make_offer");
  }

  // Check for accepted offers
  const myOffers = state.offers.filter((o) => o.homeownerId === user.id);
  const acceptedOffers = myOffers.filter((o) => o.status === "ACCEPTED");
  if (acceptedOffers.length > 0) {
    actions.push("complete_job");
  }

  // Check for completed offers to review
  const completedOffers = myOffers.filter((o) => o.status === "COMPLETED");
  const reviewedOfferIds = new Set(state.reviews.map((r) => r.offerId));
  const unreviewedOffers = completedOffers.filter(
    (o) => !reviewedOfferIds.has(o.id)
  );
  if (unreviewedOffers.length > 0) {
    actions.push("leave_review");
  }

  return actions;
}

/**
 * Use LLM to decide what action to take next
 */
export async function decideNextAction(
  state: TestAgentState,
  user: TestUser,
  goals: string[],
  useLLM: boolean = true
): Promise<AgentDecision | null> {
  const availableActions = getAvailableActions(state, user);

  if (availableActions.length === 0) {
    return null;
  }

  // If LLM is disabled or not available, use smart heuristics
  if (!useLLM) {
    return decideWithHeuristics(state, user, availableActions);
  }

  const context = getAgentContext(state, user);

  // Role-specific guidance
  const roleGuidance: Record<UserRole, string> = {
    homeowner:
      "PRIORITY: If you have applications, make_offer. If you have accepted offers, complete_job. If completed, leave_review. Only create_job if you have none.",
    tradesperson:
      "PRIORITY: If you have pending offers, accept_offer. Otherwise APPLY TO JOBS - use apply_to_job action! Don't just browse, actually APPLY. You should apply to multiple jobs.",
    business:
      "PRIORITY: If you have applications, make_offer. If you have accepted offers, complete_job. If completed, leave_review. Only create_job if needed.",
    team_member: "",
    admin: "",
  };

  const prompt = `You are an autonomous agent acting as a ${
    user.role
  } in a job marketplace simulation.

${context}

Your goals:
${goals.map((g, i) => `${i + 1}. ${g}`).join("\n")}

${roleGuidance[user.role]}

Available actions you can take RIGHT NOW:
${availableActions.map((a, i) => `${i + 1}. ${a}`).join("\n")}

IMPORTANT: Take ACTION, don't just observe! If you're a tradesperson with apply_to_job available, USE IT.

Respond in this exact JSON format:
{
  "action": "action_name",
  "reasoning": "brief explanation",
  "params": {}
}

Params (optional, system will auto-fill if not provided):
- apply_to_job: {} (system picks a job for you)
- make_offer: {} (system picks application)
- accept_offer: {} (system picks pending offer)
- complete_job: {} (system picks accepted offer)
- leave_review: {} (system picks completed offer)

If truly nothing to do: {"action": "WAIT", "reasoning": "why"}`;

  try {
    const response = await chat(prompt, {
      systemPrompt: `You are an autonomous testing agent. You make decisions to simulate real user behavior in a job marketplace. Be decisive and action-oriented. Respond ONLY with valid JSON.`,
      temperature: 0.4,
    });

    // Parse response
    const cleaned = response.replace(/```json\n?|\n?```/g, "").trim();
    const decision = JSON.parse(cleaned);

    if (decision.action === "WAIT") {
      return null;
    }

    // Validate action is available
    if (!availableActions.includes(decision.action)) {
      console.log(
        chalk.yellow(
          `  LLM suggested unavailable action: ${decision.action}, using heuristics`
        )
      );
      return decideWithHeuristics(state, user, availableActions);
    }

    return {
      action: decision.action,
      reasoning: decision.reasoning,
      params: decision.params || {},
    };
  } catch (error) {
    console.log(
      chalk.yellow(`  LLM decision failed, using heuristics: ${error}`)
    );
    return decideWithHeuristics(state, user, availableActions);
  }
}

/**
 * Smart heuristic-based decision making (fallback when LLM unavailable)
 */
function decideWithHeuristics(
  state: TestAgentState,
  user: TestUser,
  availableActions: AnyAction[]
): AgentDecision | null {
  // Priority-based decision making
  const priorityOrder: Record<UserRole, AnyAction[]> = {
    homeowner: [
      "leave_review",
      "complete_job",
      "make_offer",
      "view_applications",
      "create_job",
    ],
    tradesperson: [
      "accept_offer",
      "apply_to_job",
      "browse_jobs",
      "view_offers",
      "view_reviews",
    ],
    business: [
      "leave_review",
      "complete_job",
      "make_offer",
      "view_applications",
      "create_job",
      "view_offers",
    ],
    team_member: [],
    admin: [],
  };

  const priorities = priorityOrder[user.role] || [];

  for (const action of priorities) {
    if (availableActions.includes(action)) {
      const params = generateActionParams(state, user, action);
      return {
        action,
        reasoning: `Heuristic: ${action} is the highest priority available action`,
        params,
      };
    }
  }

  // Default to first available action
  if (availableActions.length > 0) {
    const action = availableActions[0];
    return {
      action,
      reasoning: `Heuristic: defaulting to first available action`,
      params: generateActionParams(state, user, action),
    };
  }

  return null;
}

/**
 * Generate appropriate params for an action based on state
 */
function generateActionParams(
  state: TestAgentState,
  user: TestUser,
  action: AnyAction
): Record<string, any> {
  const myJobs = state.jobs.filter((j) => j.createdBy === user.id);
  const myJobIds = new Set(myJobs.map((j) => j.id));
  const myOffers = state.offers.filter(
    (o) => o.homeownerId === user.id || o.tradespersonId === user.id
  );
  const myApplications = state.applications.filter(
    (a) => a.applicantId === user.id
  );

  switch (action) {
    case "apply_to_job": {
      const appliedJobIds = new Set(myApplications.map((a) => a.jobId));
      const availableJob = state.jobs.find(
        (j) =>
          j.status === "OPEN" &&
          !appliedJobIds.has(j.id) &&
          j.createdBy !== user.id
      );
      if (availableJob) {
        return {
          apply_to_job: {
            jobId: availableJob.id,
            estimatedCost: Math.floor(
              availableJob.budget * (0.85 + Math.random() * 0.2)
            ),
            message:
              "I'm interested in this job and have the required experience.",
          },
        };
      }
      break;
    }

    case "make_offer": {
      const applicationsToMyJobs = state.applications.filter((a) =>
        myJobIds.has(a.jobId)
      );
      const pendingApplication = applicationsToMyJobs.find(
        (a) => a.status === "UR" || a.status === "S"
      );
      if (pendingApplication) {
        const job = state.jobs.find((j) => j.id === pendingApplication.jobId);
        // Use tradespersonProfileId from the application (synced from DB)
        // Fall back to looking up from testUsers if not available
        let tradespersonProfileId = pendingApplication.tradespersonProfileId;
        if (!tradespersonProfileId) {
          const applicant = state.testUsers.find(
            (u) => u.id === pendingApplication.applicantId
          );
          tradespersonProfileId = applicant?.tradespersonProfileId;
        }
        if (job && tradespersonProfileId) {
          return {
            make_offer: {
              jobId: pendingApplication.jobId,
              tradespersonProfileId,
              applicationId: pendingApplication.id,
              budget: pendingApplication.estimatedCost || job.budget,
            },
          };
        }
      }
      break;
    }

    case "accept_offer":
    case "reject_offer": {
      const pendingOffer = myOffers.find(
        (o) => o.status === "PENDING" && o.tradespersonId === user.id
      );
      if (pendingOffer) {
        return { [action]: { offerId: pendingOffer.id } };
      }
      break;
    }

    case "complete_job": {
      const acceptedOffer = myOffers.find(
        (o) => o.status === "ACCEPTED" && o.homeownerId === user.id
      );
      if (acceptedOffer) {
        return { complete_job: { offerId: acceptedOffer.id } };
      }
      break;
    }

    case "leave_review": {
      const reviewedOfferIds = new Set(state.reviews.map((r) => r.offerId));
      const completedOffer = myOffers.find(
        (o) =>
          o.status === "COMPLETED" &&
          o.homeownerId === user.id &&
          !reviewedOfferIds.has(o.id)
      );
      if (completedOffer) {
        return {
          leave_review: {
            offerId: completedOffer.id,
            rating: Math.floor(Math.random() * 2) + 4, // 4-5 stars
            feedback: "Great work! Professional and completed on time.",
          },
        };
      }
      break;
    }

    case "view_applications": {
      const jobWithApplications = myJobs.find((j) =>
        state.applications.some((a) => a.jobId === j.id)
      );
      if (jobWithApplications) {
        return { view_applications: { jobId: jobWithApplications.id } };
      }
      break;
    }
  }

  return {};
}

/**
 * Execute an action for a specific user
 */
export async function executeAction(
  state: TestAgentState,
  user: TestUser,
  decision: AgentDecision
): Promise<{ state: TestAgentState; result: ActionResult }> {
  // Temporarily set this user as the "active" user for the existing agents
  // by making sure it's findable by role
  const originalUsers = [...state.testUsers];

  // Move this user to front so find() will get them
  const userIndex = state.testUsers.findIndex((u) => u.id === user.id);
  if (userIndex > 0) {
    const [thisUser] = state.testUsers.splice(userIndex, 1);
    state.testUsers.unshift(thisUser);
  }

  try {
    let result;

    switch (user.role) {
      case "homeowner":
        result = await homeownerAgent(
          state,
          decision.action as any,
          decision.params as any
        );
        break;
      case "tradesperson":
        result = await tradespersonAgent(
          state,
          decision.action as any,
          decision.params as any
        );
        break;
      case "business":
        result = await businessAgent(
          state,
          decision.action as any,
          decision.params as any
        );
        break;
      default:
        throw new Error(`Unsupported role: ${user.role}`);
    }

    // Restore original user order
    result.state.testUsers = originalUsers;

    return result;
  } catch (error) {
    // Restore on error too
    state.testUsers = originalUsers;
    throw error;
  }
}

/**
 * Check if simulation goals have been met
 */
export function checkGoalsCompleted(
  state: TestAgentState,
  goals: SimulationGoals
): boolean {
  return (
    state.jobs.length >= goals.minJobs &&
    state.applications.length >= goals.minApplications &&
    state.offers.filter(
      (o) => o.status === "ACCEPTED" || o.status === "COMPLETED"
    ).length >= goals.minAcceptedOffers &&
    state.reviews.length >= goals.minReviews
  );
}

export interface SimulationGoals {
  minJobs: number;
  minApplications: number;
  minAcceptedOffers: number;
  minReviews: number;
  maxIterations: number;
}

export const DEFAULT_GOALS: SimulationGoals = {
  minJobs: 30,
  minApplications: 60,
  minAcceptedOffers: 15,
  minReviews: 10,
  maxIterations: 50,
};
