import type { TestScenario } from "../state/types.js";

/**
 * Full job lifecycle scenario:
 * 1. Homeowner posts a job
 * 2. Tradesperson browses and finds the job
 * 3. Tradesperson applies to the job
 * 4. Homeowner views applications
 * 5. Homeowner shortlists the tradesperson
 * 6. Homeowner makes an offer
 * 7. Tradesperson accepts the offer
 * 8. Homeowner marks job as complete
 * 9. Homeowner leaves a review
 */
export const fullLifecycleScenario: TestScenario = {
  name: "full-lifecycle",
  description:
    "Complete job lifecycle from posting to review",
  steps: [
    {
      agent: "homeowner",
      action: "create_job",
      expectedOutcome: "Job created successfully",
    },
    {
      agent: "tradesperson",
      action: "browse_jobs",
      expectedOutcome: "Jobs retrieved successfully",
    },
    {
      agent: "tradesperson",
      action: "apply_to_job",
      expectedOutcome: "Application submitted successfully",
    },
    {
      agent: "homeowner",
      action: "view_applications",
      expectedOutcome: "Applications retrieved successfully",
    },
    {
      agent: "homeowner",
      action: "make_offer",
      expectedOutcome: "Offer created successfully",
    },
    {
      agent: "tradesperson",
      action: "accept_offer",
      expectedOutcome: "Offer accepted successfully",
    },
    {
      agent: "homeowner",
      action: "complete_job",
      expectedOutcome: "Job marked as complete",
    },
    {
      agent: "homeowner",
      action: "leave_review",
      expectedOutcome: "Review submitted successfully",
    },
    {
      agent: "tradesperson",
      action: "view_reviews",
      expectedOutcome: "Reviews retrieved successfully",
    },
  ],
};

/**
 * Quick smoke test - just creates users and a job
 */
export const quickSmokeScenario: TestScenario = {
  name: "quick-smoke",
  description: "Quick smoke test - create users and post a job",
  steps: [
    {
      agent: "homeowner",
      action: "create_job",
      expectedOutcome: "Job created successfully",
    },
    {
      agent: "tradesperson",
      action: "browse_jobs",
      expectedOutcome: "Jobs retrieved successfully",
    },
  ],
};

/**
 * Homeowner flow - tests all homeowner actions
 */
export const homeownerFlowScenario: TestScenario = {
  name: "homeowner-flow",
  description: "Test all homeowner actions",
  steps: [
    {
      agent: "homeowner",
      action: "create_job",
      params: {
        category: "Plumbing",
        budget: 300,
      },
      expectedOutcome: "Job created successfully",
    },
    {
      agent: "homeowner",
      action: "create_job",
      params: {
        category: "Electrical",
        budget: 500,
      },
      expectedOutcome: "Second job created successfully",
    },
    {
      agent: "tradesperson",
      action: "apply_to_job",
      expectedOutcome: "Application submitted",
    },
    {
      agent: "homeowner",
      action: "view_applications",
      expectedOutcome: "Applications viewed",
    },
    {
      agent: "homeowner",
      action: "make_offer",
      expectedOutcome: "Offer made",
    },
  ],
};

/**
 * Tradesperson flow - tests all tradesperson actions
 */
export const tradespersonFlowScenario: TestScenario = {
  name: "tradesperson-flow",
  description: "Test all tradesperson actions",
  steps: [
    {
      agent: "homeowner",
      action: "create_job",
      expectedOutcome: "Job created for tradesperson to find",
    },
    {
      agent: "tradesperson",
      action: "browse_jobs",
      expectedOutcome: "Jobs browsed successfully",
    },
    {
      agent: "tradesperson",
      action: "apply_to_job",
      expectedOutcome: "Application submitted",
    },
    {
      agent: "homeowner",
      action: "make_offer",
      expectedOutcome: "Offer made to tradesperson",
    },
    {
      agent: "tradesperson",
      action: "view_offers",
      expectedOutcome: "Offers viewed",
    },
    {
      agent: "tradesperson",
      action: "accept_offer",
      expectedOutcome: "Offer accepted",
    },
  ],
};

/**
 * Business flow - tests business-specific actions
 */
export const businessFlowScenario: TestScenario = {
  name: "business-flow",
  description: "Test business user actions",
  steps: [
    {
      agent: "business",
      action: "create_job",
      params: {
        category: "General Repairs",
        budget: 1000,
      },
      expectedOutcome: "Business job created",
    },
    {
      agent: "tradesperson",
      action: "browse_jobs",
      expectedOutcome: "Jobs browsed",
    },
    {
      agent: "tradesperson",
      action: "apply_to_job",
      expectedOutcome: "Applied to business job",
    },
    {
      agent: "business",
      action: "view_applications",
      expectedOutcome: "Applications viewed",
    },
    {
      agent: "business",
      action: "make_offer",
      expectedOutcome: "Offer made",
    },
    {
      agent: "tradesperson",
      action: "accept_offer",
      expectedOutcome: "Offer accepted",
    },
    {
      agent: "business",
      action: "complete_job",
      expectedOutcome: "Job completed",
    },
    {
      agent: "business",
      action: "leave_review",
      expectedOutcome: "Review submitted",
    },
  ],
};

/**
 * Multi-applicant scenario - multiple tradespersons apply
 */
export const multiApplicantScenario: TestScenario = {
  name: "multi-applicant",
  description: "Multiple tradespersons apply to the same job",
  steps: [
    {
      agent: "homeowner",
      action: "create_job",
      params: {
        title: "Urgent Plumbing Repair",
        category: "Plumbing",
        budget: 400,
      },
      expectedOutcome: "Job created",
    },
    {
      agent: "tradesperson",
      action: "apply_to_job",
      params: {
        message: "I can start immediately!",
        estimatedCost: 350,
      },
      expectedOutcome: "First application submitted",
    },
    // Note: For multiple tradespersons, you'd create additional test users
    // This scenario demonstrates the structure
    {
      agent: "homeowner",
      action: "view_applications",
      expectedOutcome: "All applications visible",
    },
    {
      agent: "homeowner",
      action: "make_offer",
      expectedOutcome: "Offer made to selected tradesperson",
    },
  ],
};

// Export all scenarios
export const scenarios: Record<string, TestScenario> = {
  "full-lifecycle": fullLifecycleScenario,
  "quick-smoke": quickSmokeScenario,
  "homeowner-flow": homeownerFlowScenario,
  "tradesperson-flow": tradespersonFlowScenario,
  "business-flow": businessFlowScenario,
  "multi-applicant": multiApplicantScenario,
};

export function getScenario(name: string): TestScenario | undefined {
  return scenarios[name];
}

export function listScenarios(): string[] {
  return Object.keys(scenarios);
}
