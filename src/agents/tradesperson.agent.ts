import type { TestAgentState, TestUser, ActionResult } from "../state/types.js";
import * as tools from "../tools/index.js";

type TradespersonAction =
  | "browse_jobs"
  | "apply_to_job"
  | "view_offers"
  | "accept_offer"
  | "reject_offer"
  | "view_reviews";

interface TradespersonActionParams {
  browse_jobs?: {
    limit?: number;
  };
  apply_to_job?: {
    jobId: string;
    estimatedCost?: number;
    message?: string;
  };
  view_offers?: {
    status?: string;
  };
  accept_offer?: {
    offerId: string;
  };
  reject_offer?: {
    offerId: string;
  };
}

/**
 * Tradesperson sub-agent that can perform tradesperson-specific actions
 */
export async function tradespersonAgent(
  state: TestAgentState,
  action: TradespersonAction,
  params?: TradespersonActionParams
): Promise<{ state: TestAgentState; result: ActionResult }> {
  // Find the tradesperson user in state
  const tradesperson = state.testUsers.find((u) => u.role === "tradesperson");

  if (!tradesperson) {
    return {
      state,
      result: {
        success: false,
        action,
        agentType: "tradesperson",
        userId: "",
        error: "No tradesperson user found in state",
        timestamp: new Date(),
      },
    };
  }

  const result: ActionResult = {
    success: false,
    action,
    agentType: "tradesperson",
    userId: tradesperson.id,
    timestamp: new Date(),
  };

  try {
    switch (action) {
      case "browse_jobs": {
        const limit = params?.browse_jobs?.limit || 10;
        const jobs = await tools.getMatchingJobs(tradesperson, limit);

        state.messages.push(
          `Tradesperson found ${jobs.length} matching jobs`
        );
        result.success = true;
        result.data = jobs;
        break;
      }

      case "apply_to_job": {
        const applyParams = params?.apply_to_job;

        // Get job to apply to - either specified, from state, or query database
        let jobId = applyParams?.jobId;
        let jobBudget = 200;

        // First try jobs in state
        if (!jobId && state.jobs.length > 0) {
          const appliedJobIds = new Set(
            state.applications
              .filter(a => a.applicantId === tradesperson.id)
              .map(a => a.jobId)
          );
          const openJobs = state.jobs.filter(
            (j) => j.status === "OPEN" && !appliedJobIds.has(j.id) && j.createdBy !== tradesperson.id
          );
          if (openJobs.length > 0) {
            jobId = openJobs[0].id;
            jobBudget = openJobs[0].budget;
          }
        }

        // If still no job, query the database for available jobs
        if (!jobId) {
          const dbJobs = await tools.getMatchingJobs(tradesperson, 10);
          if (dbJobs.length > 0) {
            // Pick a random job from the results to add variety
            const randomJob = dbJobs[Math.floor(Math.random() * dbJobs.length)];
            jobId = randomJob.id;
            jobBudget = randomJob.budget || 200;
          }
        }

        if (!jobId) {
          throw new Error("No jobs available to apply to");
        }

        const application = await tools.applyToJob(tradesperson, jobId, {
          estimatedCost:
            applyParams?.estimatedCost ||
            Math.floor(jobBudget * (0.8 + Math.random() * 0.4)), // 80-120% of budget
          message:
            applyParams?.message ||
            "I am interested in this job and have the skills required. I have extensive experience in this type of work and can complete it efficiently.",
        });

        state.applications.push(application);
        state.messages.push(`Tradesperson applied to job ${jobId}`);
        result.success = true;
        result.data = application;
        break;
      }

      case "view_offers": {
        const status = params?.view_offers?.status;
        const offers = await tools.getOffers(tradesperson, status);

        state.messages.push(
          `Tradesperson viewed ${offers.length} offers${status ? ` (status: ${status})` : ""}`
        );
        result.success = true;
        result.data = offers;
        break;
      }

      case "accept_offer": {
        let offerId = params?.accept_offer?.offerId;

        // If no offer ID provided, accept first pending offer
        if (!offerId) {
          const pendingOffers = state.offers.filter(
            (o) => o.status === "PENDING"
          );
          if (pendingOffers.length > 0) {
            offerId = pendingOffers[0].id;
          }
        }

        if (!offerId) {
          throw new Error("No offer ID provided and no pending offers in state");
        }

        await tools.respondToOffer(tradesperson, offerId, true);

        // Update local state
        const offerIndex = state.offers.findIndex((o) => o.id === offerId);
        if (offerIndex >= 0) {
          state.offers[offerIndex].status = "ACCEPTED";
        }

        // Update job status
        const offer = state.offers.find((o) => o.id === offerId);
        if (offer) {
          const jobIndex = state.jobs.findIndex((j) => j.id === offer.jobId);
          if (jobIndex >= 0) {
            state.jobs[jobIndex].status = "IN_PROGRESS";
          }
        }

        state.messages.push(`Tradesperson accepted offer ${offerId}`);
        result.success = true;
        break;
      }

      case "reject_offer": {
        const offerId = params?.reject_offer?.offerId;
        if (!offerId) {
          throw new Error("No offer ID provided");
        }

        await tools.respondToOffer(tradesperson, offerId, false);

        // Update local state
        const offerIndex = state.offers.findIndex((o) => o.id === offerId);
        if (offerIndex >= 0) {
          state.offers[offerIndex].status = "REJECTED";
        }

        state.messages.push(`Tradesperson rejected offer ${offerId}`);
        result.success = true;
        break;
      }

      case "view_reviews": {
        if (!tradesperson.tradespersonProfileId) {
          throw new Error("Tradesperson profile ID not found");
        }

        const reviews = await tools.getTradespersonReviews(
          tradesperson.tradespersonProfileId
        );

        state.messages.push(
          `Tradesperson viewed ${reviews.length} reviews`
        );
        result.success = true;
        result.data = reviews;
        break;
      }

      default:
        throw new Error(`Unknown tradesperson action: ${action}`);
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    state.errors.push(`Tradesperson ${action} failed: ${result.error}`);
    state.messages.push(
      `Tradesperson action failed: ${action} - ${result.error}`
    );
  }

  state.actionHistory.push(result);
  return { state, result };
}

/**
 * Get available actions for tradesperson based on current state
 */
export function getAvailableTradespersonActions(
  state: TestAgentState
): TradespersonAction[] {
  const actions: TradespersonAction[] = ["browse_jobs", "view_offers"];

  // Can apply if there are open jobs
  const openJobs = state.jobs.filter((j) => j.status === "OPEN");
  if (openJobs.length > 0) {
    // Check if already applied
    const tradesperson = state.testUsers.find((u) => u.role === "tradesperson");
    if (tradesperson) {
      const appliedJobIds = new Set(
        state.applications
          .filter((a) => a.applicantId === tradesperson.id)
          .map((a) => a.jobId)
      );
      const unappliedJobs = openJobs.filter((j) => !appliedJobIds.has(j.id));
      if (unappliedJobs.length > 0) {
        actions.push("apply_to_job");
      }
    }
  }

  // Can accept/reject if there are pending offers
  const pendingOffers = state.offers.filter((o) => o.status === "PENDING");
  if (pendingOffers.length > 0) {
    actions.push("accept_offer", "reject_offer");
  }

  // Can view reviews anytime
  actions.push("view_reviews");

  return actions;
}
