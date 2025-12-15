import type { TestAgentState, TestUser, ActionResult } from "../state/types.js";
import * as tools from "../tools/index.js";
import config from "../config/index.js";

type HomeownerAction =
  | "create_job"
  | "view_applications"
  | "shortlist_applicant"
  | "make_offer"
  | "complete_job"
  | "leave_review";

interface HomeownerActionParams {
  create_job?: {
    title?: string;
    category?: string;
    description?: string;
    budget?: number;
  };
  view_applications?: {
    jobId: string;
  };
  shortlist_applicant?: {
    applicationId: string;
  };
  make_offer?: {
    jobId: string;
    tradespersonProfileId: string;
    applicationId?: string;
    budget: number;
  };
  complete_job?: {
    offerId: string;
  };
  leave_review?: {
    offerId: string;
    rating?: number;
    feedback?: string;
  };
}

/**
 * Homeowner sub-agent that can perform homeowner-specific actions
 */
export async function homeownerAgent(
  state: TestAgentState,
  action: HomeownerAction,
  params?: HomeownerActionParams
): Promise<{ state: TestAgentState; result: ActionResult }> {
  // Find the homeowner user in state
  const homeowner = state.testUsers.find((u) => u.role === "homeowner");

  if (!homeowner) {
    return {
      state,
      result: {
        success: false,
        action,
        agentType: "homeowner",
        userId: "",
        error: "No homeowner user found in state",
        timestamp: new Date(),
      },
    };
  }

  const result: ActionResult = {
    success: false,
    action,
    agentType: "homeowner",
    userId: homeowner.id,
    timestamp: new Date(),
  };

  try {
    switch (action) {
      case "create_job": {
        const jobParams = params?.create_job || {};
        const category =
          jobParams.category ||
          config.jobCategories[Math.floor(Math.random() * config.jobCategories.length)];

        const job = await tools.createJob(homeowner, {
          title: jobParams.title || `Test ${category} Job`,
          category,
          description:
            jobParams.description ||
            `This is a test job for ${category}. Looking for a skilled professional to help with this task.`,
          budget: jobParams.budget || Math.floor(Math.random() * 500) + 100,
        });

        state.jobs.push(job);
        state.messages.push(`Homeowner created job: ${job.title}`);
        result.success = true;
        result.data = job;
        break;
      }

      case "view_applications": {
        const jobId = params?.view_applications?.jobId || state.jobs[0]?.id;
        if (!jobId) {
          throw new Error("No job ID provided and no jobs in state");
        }

        const applications = await tools.getJobApplications(homeowner, jobId);

        // Sync fetched applications to state so make_offer becomes available
        for (const app of applications) {
          const existingIndex = state.applications.findIndex(a => a.id === app.id);
          const mappedApp = {
            id: app.id,
            jobId: app.job_id,
            applicantId: app.profile_id,
            tradespersonProfileId: app.tradesperson_profile_id,
            status: app.status,
            estimatedCost: app.estimated_cost,
            createdAt: new Date(app.created_at),
          };
          if (existingIndex >= 0) {
            state.applications[existingIndex] = mappedApp;
          } else {
            state.applications.push(mappedApp);
          }
        }

        state.messages.push(
          `Homeowner viewed ${applications.length} applications for job ${jobId}`
        );
        result.success = true;
        result.data = applications;
        break;
      }

      case "shortlist_applicant": {
        const applicationId = params?.shortlist_applicant?.applicationId;
        if (!applicationId) {
          throw new Error("No application ID provided");
        }

        await tools.updateApplicationStatus(homeowner, applicationId, "S");

        // Update local state
        const appIndex = state.applications.findIndex(
          (a) => a.id === applicationId
        );
        if (appIndex >= 0) {
          state.applications[appIndex].status = "S";
        }

        state.messages.push(`Homeowner shortlisted application ${applicationId}`);
        result.success = true;
        break;
      }

      case "make_offer": {
        const offerParams = params?.make_offer;
        if (!offerParams?.jobId || !offerParams?.tradespersonProfileId) {
          throw new Error("Job ID and tradesperson profile ID required");
        }

        const offer = await tools.createOffer(homeowner, {
          jobId: offerParams.jobId,
          tradespersonProfileId: offerParams.tradespersonProfileId,
          applicationId: offerParams.applicationId,
          budget: offerParams.budget,
          startDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0],
          message: "I would like to offer you this job based on your application.",
        });

        state.offers.push(offer);
        state.messages.push(`Homeowner made offer for job ${offerParams.jobId}`);
        result.success = true;
        result.data = offer;
        break;
      }

      case "complete_job": {
        const offerId = params?.complete_job?.offerId;
        if (!offerId) {
          throw new Error("No offer ID provided");
        }

        await tools.completeOffer(homeowner, offerId);

        // Update local state
        const offerIndex = state.offers.findIndex((o) => o.id === offerId);
        if (offerIndex >= 0) {
          state.offers[offerIndex].status = "COMPLETED";
        }

        state.messages.push(`Homeowner completed job (offer ${offerId})`);
        result.success = true;
        break;
      }

      case "leave_review": {
        const reviewParams = params?.leave_review;
        if (!reviewParams?.offerId) {
          throw new Error("No offer ID provided");
        }

        const review = await tools.createReview(homeowner, {
          offerId: reviewParams.offerId,
          rating: reviewParams.rating || Math.floor(Math.random() * 2) + 4, // 4-5 stars
          feedback:
            reviewParams.feedback ||
            "Great work! Professional and completed on time. Would recommend.",
        });

        state.reviews.push(review);
        state.messages.push(
          `Homeowner left ${review.rating}-star review for offer ${reviewParams.offerId}`
        );
        result.success = true;
        result.data = review;
        break;
      }

      default:
        throw new Error(`Unknown homeowner action: ${action}`);
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    state.errors.push(`Homeowner ${action} failed: ${result.error}`);
    state.messages.push(`Homeowner action failed: ${action} - ${result.error}`);
  }

  state.actionHistory.push(result);
  return { state, result };
}

/**
 * Get available actions for homeowner based on current state
 */
export function getAvailableHomeownerActions(
  state: TestAgentState
): HomeownerAction[] {
  const actions: HomeownerAction[] = ["create_job"];

  if (state.jobs.length > 0) {
    actions.push("view_applications");
  }

  if (state.applications.length > 0) {
    actions.push("shortlist_applicant", "make_offer");
  }

  const acceptedOffers = state.offers.filter((o) => o.status === "ACCEPTED");
  if (acceptedOffers.length > 0) {
    actions.push("complete_job");
  }

  const completedOffers = state.offers.filter((o) => o.status === "COMPLETED");
  const reviewedOfferIds = new Set(state.reviews.map((r) => r.offerId));
  const unreviewedCompletedOffers = completedOffers.filter(
    (o) => !reviewedOfferIds.has(o.id)
  );
  if (unreviewedCompletedOffers.length > 0) {
    actions.push("leave_review");
  }

  return actions;
}
