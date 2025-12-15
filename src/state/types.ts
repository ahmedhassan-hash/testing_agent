import { z } from "zod";

// User role types matching your app
export const UserRoleSchema = z.enum([
  "homeowner",
  "tradesperson",
  "business",
  "team_member",
  "admin",
]);
export type UserRole = z.infer<typeof UserRoleSchema>;

// Test user that gets created and stored
export const TestUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  password: z.string(),
  role: UserRoleSchema,
  profileId: z.string().uuid().optional(),
  tradespersonProfileId: z.string().uuid().optional(),
  businessProfileId: z.string().uuid().optional(),
  fullName: z.string(),
  createdAt: z.date(),
  sessionToken: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});
export type TestUser = z.infer<typeof TestUserSchema>;

// Job created during testing
export const TestJobSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  category: z.string(),
  status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CLOSED"]),
  createdBy: z.string().uuid(), // TestUser id
  budget: z.number(),
  createdAt: z.date(),
});
export type TestJob = z.infer<typeof TestJobSchema>;

// Application created during testing
export const TestApplicationSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  applicantId: z.string().uuid(), // TestUser id (tradesperson)
  tradespersonProfileId: z.string().uuid().optional(), // tradesperson_profile_id for making offers
  status: z.enum(["IP", "C", "UR", "S", "V", "A"]),
  estimatedCost: z.number(),
  createdAt: z.date(),
});
export type TestApplication = z.infer<typeof TestApplicationSchema>;

// Offer created during testing
export const TestOfferSchema = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  homeownerId: z.string().uuid(),
  tradespersonId: z.string().uuid(),
  status: z.enum([
    "PENDING",
    "ACCEPTED",
    "REJECTED",
    "COMPLETED",
    "WITHDRAWN",
    "EXPIRED",
  ]),
  budget: z.number(),
  createdAt: z.date(),
});
export type TestOffer = z.infer<typeof TestOfferSchema>;

// Review created during testing
export const TestReviewSchema = z.object({
  id: z.string().uuid(),
  offerId: z.string().uuid(),
  rating: z.number().min(1).max(5),
  feedback: z.string(),
  createdAt: z.date(),
});
export type TestReview = z.infer<typeof TestReviewSchema>;

// Action result from sub-agents
export const ActionResultSchema = z.object({
  success: z.boolean(),
  action: z.string(),
  agentType: UserRoleSchema,
  userId: z.string().uuid(),
  data: z.any().optional(),
  error: z.string().optional(),
  timestamp: z.date(),
});
export type ActionResult = z.infer<typeof ActionResultSchema>;

// Test scenario definition
export const TestScenarioSchema = z.object({
  name: z.string(),
  description: z.string(),
  steps: z.array(
    z.object({
      agent: UserRoleSchema,
      action: z.string(),
      params: z.record(z.any()).optional(),
      expectedOutcome: z.string().optional(),
    })
  ),
});
export type TestScenario = z.infer<typeof TestScenarioSchema>;

// Main graph state
export interface TestAgentState {
  // Test users created for this run
  testUsers: TestUser[];

  // Entities created during testing
  jobs: TestJob[];
  applications: TestApplication[];
  offers: TestOffer[];
  reviews: TestReview[];

  // Current scenario being executed
  currentScenario: TestScenario | null;
  currentStepIndex: number;

  // Action history
  actionHistory: ActionResult[];

  // Errors encountered
  errors: string[];

  // Overall test status
  status: "idle" | "running" | "completed" | "failed";

  // Messages for logging/output
  messages: string[];
}

// Initial state factory
export function createInitialState(): TestAgentState {
  return {
    testUsers: [],
    jobs: [],
    applications: [],
    offers: [],
    reviews: [],
    currentScenario: null,
    currentStepIndex: 0,
    actionHistory: [],
    errors: [],
    status: "idle",
    messages: [],
  };
}
