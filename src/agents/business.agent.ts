import type { TestAgentState, ActionResult } from "../state/types.js";
import * as tools from "../tools/index.js";
import config from "../config/index.js";

type BusinessAction =
  | "create_job"
  | "view_applications"
  | "make_offer"
  | "view_offers"
  | "complete_job"
  | "leave_review";

interface BusinessActionParams {
  create_job?: {
    title?: string;
    category?: string;
    description?: string;
    budget?: number;
  };
  view_applications?: {
    jobId: string;
  };
  make_offer?: {
    jobId: string;
    tradespersonProfileId: string;
    applicationId?: string;
    budget: number;
  };
  view_offers?: {
    status?: string;
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

export async function businessAgent(
  state: TestAgentState,
  action: BusinessAction,
  params?: BusinessActionParams
): Promise<{ state: TestAgentState; result: ActionResult }> {
  // Find the business user in state
  const business = state.testUsers.find((u) => u.role === "business");

  if (!business) {
    return {
      state,
      result: {
        success: false,
        action,
        agentType: "business",
        userId: "",
        error: "No business user found in state",
        timestamp: new Date(),
      },
    };
  }

  const result: ActionResult = {
    success: false,
    action,
    agentType: "business",
    userId: business.id,
    timestamp: new Date(),
  };

  try {
    switch (action) {
      case "create_job": {
        const jobParams = params?.create_job || {};
        const category =
          jobParams.category ||
          config.jobCategories[
            Math.floor(Math.random() * config.jobCategories.length)
          ];

        const job = await tools.createJob(business, {
          title: jobParams.title || `Business ${category} Project`,
          category,
          description:
            jobParams.description ||
            `Business project requiring ${category} services. Professional work required with attention to detail.`,
          budget: jobParams.budget || Math.floor(Math.random() * 1000) + 500, // Higher budgets for business
        });

        state.jobs.push(job);
        state.messages.push(`Business created job: ${job.title}`);
        result.success = true;
        result.data = job;
        break;
      }

      case "view_applications": {
        const jobId = params?.view_applications?.jobId;
        // Find jobs created by this business
        const businessJobs = state.jobs.filter(
          (j) => j.createdBy === business.id
        );

        const targetJobId = jobId || businessJobs[0]?.id;
        if (!targetJobId) {
          throw new Error("No job ID provided and no business jobs in state");
        }

        const applications = await tools.getJobApplications(
          business,
          targetJobId
        );

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
          `Business viewed ${applications.length} applications for job ${targetJobId}`
        );
        result.success = true;
        result.data = applications;
        break;
      }

      case "make_offer": {
        const offerParams = params?.make_offer;
        if (!offerParams?.jobId || !offerParams?.tradespersonProfileId) {
          throw new Error("Job ID and tradesperson profile ID required");
        }

        const offer = await tools.createOffer(business, {
          jobId: offerParams.jobId,
          tradespersonProfileId: offerParams.tradespersonProfileId,
          applicationId: offerParams.applicationId,
          budget: offerParams.budget,
          startDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0],
          message:
            "Our business would like to offer you this project. We look forward to working with you.",
        });

        state.offers.push(offer);
        state.messages.push(`Business made offer for job ${offerParams.jobId}`);
        result.success = true;
        result.data = offer;
        break;
      }

      case "view_offers": {
        const status = params?.view_offers?.status;
        const offers = await tools.getOffers(business, status);

        state.messages.push(
          `Business viewed ${offers.length} offers${
            status ? ` (status: ${status})` : ""
          }`
        );
        result.success = true;
        result.data = offers;
        break;
      }

      case "complete_job": {
        const offerId = params?.complete_job?.offerId;
        if (!offerId) {
          throw new Error("No offer ID provided");
        }

        await tools.completeOffer(business, offerId);

        // Update local state
        const offerIndex = state.offers.findIndex((o) => o.id === offerId);
        if (offerIndex >= 0) {
          state.offers[offerIndex].status = "COMPLETED";
        }

        state.messages.push(`Business completed job (offer ${offerId})`);
        result.success = true;
        break;
      }

      case "leave_review": {
        const reviewParams = params?.leave_review;
        if (!reviewParams?.offerId) {
          throw new Error("No offer ID provided");
        }

        const review = await tools.createReview(business, {
          offerId: reviewParams.offerId,
          rating: reviewParams.rating || Math.floor(Math.random() * 2) + 4,
          feedback:
            reviewParams.feedback ||
            "Excellent professional service. Met all business requirements and delivered on time.",
        });

        state.reviews.push(review);
        state.messages.push(
          `Business left ${review.rating}-star review for offer ${reviewParams.offerId}`
        );
        result.success = true;
        result.data = review;
        break;
      }

      default:
        throw new Error(`Unknown business action: ${action}`);
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    state.errors.push(`Business ${action} failed: ${result.error}`);
    state.messages.push(`Business action failed: ${action} - ${result.error}`);
  }

  state.actionHistory.push(result);
  return { state, result };
}

/**
 * Get available actions for business based on current state
 */
export function getAvailableBusinessActions(
  state: TestAgentState
): BusinessAction[] {
  const actions: BusinessAction[] = ["create_job", "view_offers"];

  const business = state.testUsers.find((u) => u.role === "business");
  if (!business) return actions;

  // Check for business-created jobs
  const businessJobs = state.jobs.filter((j) => j.createdBy === business.id);
  if (businessJobs.length > 0) {
    actions.push("view_applications");
  }

  // Check for applications to business jobs
  const businessJobIds = new Set(businessJobs.map((j) => j.id));
  const businessApplications = state.applications.filter((a) =>
    businessJobIds.has(a.jobId)
  );
  if (businessApplications.length > 0) {
    actions.push("make_offer");
  }

  // Check for accepted offers
  const businessOffers = state.offers.filter(
    (o) => o.homeownerId === business.id
  );
  const acceptedOffers = businessOffers.filter((o) => o.status === "ACCEPTED");
  if (acceptedOffers.length > 0) {
    actions.push("complete_job");
  }

  // Check for completed but unreviewed offers
  const completedOffers = businessOffers.filter(
    (o) => o.status === "COMPLETED"
  );
  const reviewedOfferIds = new Set(state.reviews.map((r) => r.offerId));
  const unreviewedOffers = completedOffers.filter(
    (o) => !reviewedOfferIds.has(o.id)
  );
  if (unreviewedOffers.length > 0) {
    actions.push("leave_review");
  }

  return actions;
}
