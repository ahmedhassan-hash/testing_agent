import { createUserClient, supabaseAdmin } from "../config/supabase.js";
import config from "../config/index.js";
import type { TestUser, TestJob, TestApplication, TestOffer } from "../state/types.js";

interface CreateJobParams {
  title: string;
  category: string;
  description: string;
  budget: number;
  preferredDate?: string;
  jobLength?: "ASAP" | "WITHIN_COUPLE_DAYS" | "WITHIN_COUPLE_WEEKS" | "WITHIN_COUPLE_MONTHS";
}

/**
 * Creates a job as a homeowner
 */
export async function createJob(
  user: TestUser,
  params: CreateJobParams
): Promise<TestJob> {
  if (user.role !== "homeowner" && user.role !== "business") {
    throw new Error(`User ${user.email} is not a homeowner or business`);
  }

  if (!user.sessionToken) {
    throw new Error(`User ${user.email} has no session token`);
  }

  const client = createUserClient(user.sessionToken);
  const location = user.metadata?.location as {
    display_name: string;
    lat: number;
    lon: number;
    place_id: string;
  };

  const jobData = {
    job_title: params.title,
    category: params.category,
    description: params.description,
    budget: params.budget,
    preferred_date: params.preferredDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    job_length: params.jobLength || "WITHIN_COUPLE_WEEKS",
    status: "OPEN",
    user_id: user.profileId,
    location,
    latitude: location.lat,
    longitude: location.lon,
    quota: 3,
    posted_date: new Date().toISOString(),
  };

  const { data: job, error } = await client
    .from("jobs")
    .insert(jobData)
    .select()
    .single();

  if (error || !job) {
    throw new Error(`Failed to create job: ${error?.message}`);
  }

  console.log(`Created job: ${job.job_title} (${job.id})`);

  return {
    id: job.id,
    title: job.job_title,
    category: job.category,
    status: job.status,
    createdBy: user.id,
    budget: job.budget,
    createdAt: new Date(job.created_at),
  };
}

/**
 * Gets matching jobs for a tradesperson
 * Uses direct table query since get_matching_jobs_with_metrics RPC may not exist
 */
export async function getMatchingJobs(
  user: TestUser,
  limit: number = 10
): Promise<any[]> {
  if (user.role !== "tradesperson") {
    throw new Error(`User ${user.email} is not a tradesperson`);
  }

  if (!user.sessionToken) {
    throw new Error(`User ${user.email} has no session token`);
  }

  const client = createUserClient(user.sessionToken);

  // Direct query to jobs table - get open jobs not posted by this user
  const { data: jobs, error } = await client
    .from("jobs")
    .select(`
      id,
      job_title,
      category,
      description,
      budget,
      status,
      preferred_date,
      job_length,
      location,
      latitude,
      longitude,
      created_at,
      user_id
    `)
    .eq("status", "OPEN")
    .neq("user_id", user.profileId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to get matching jobs: ${error.message}`);
  }

  console.log(`Found ${jobs?.length || 0} matching jobs for ${user.fullName}`);
  return jobs || [];
}

/**
 * Creates a job application as a tradesperson
 */
export async function applyToJob(
  user: TestUser,
  jobId: string,
  params: {
    estimatedCost: number;
    message: string;
    startDate?: string;
  }
): Promise<TestApplication> {
  if (user.role !== "tradesperson") {
    throw new Error(`User ${user.email} is not a tradesperson`);
  }

  if (!user.sessionToken) {
    throw new Error(`User ${user.email} has no session token`);
  }

  // Get job details to find poster_id
  const { data: job, error: jobError } = await supabaseAdmin
    .from("jobs")
    .select("user_id")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    throw new Error(`Failed to fetch job: ${jobError?.message}`);
  }

  const client = createUserClient(user.sessionToken);

  const applicationData = {
    job_id: jobId,
    profile_id: user.profileId,
    tradesperson_profile_id: user.tradespersonProfileId,
    poster_id: job.user_id,
    estimated_cost: params.estimatedCost,
    message: params.message,
    start_date: params.startDate || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    status: "UR", // Under Review
    is_timeline_acceptable: true,
  };

  const { data: application, error } = await client
    .from("job_applications")
    .insert(applicationData)
    .select()
    .single();

  if (error || !application) {
    throw new Error(`Failed to create application: ${error?.message}`);
  }

  console.log(`Applied to job ${jobId} as ${user.fullName}`);

  return {
    id: application.id,
    jobId: application.job_id,
    applicantId: user.id,
    status: application.status,
    estimatedCost: application.estimated_cost,
    createdAt: new Date(application.created_at),
  };
}

/**
 * Gets applications for a job (as homeowner)
 */
export async function getJobApplications(
  user: TestUser,
  jobId: string
): Promise<any[]> {
  if (!user.sessionToken) {
    throw new Error(`User ${user.email} has no session token`);
  }

  const client = createUserClient(user.sessionToken);

  // Use explicit foreign key hints to avoid ambiguous relationship errors
  const { data: applications, error } = await client
    .from("job_applications")
    .select(`
      id,
      job_id,
      profile_id,
      tradesperson_profile_id,
      poster_id,
      estimated_cost,
      message,
      status,
      viewed_at,
      is_timeline_acceptable,
      additional_notes,
      start_date,
      created_at,
      updated_at,
      applicant:profiles!job_applications_profile_id_fkey(id, full_name, profile_image_url),
      tradesperson_profile:tradesperson_profiles!job_applications_tradesperson_profile_id_fkey(id, trade_categories, experience_years, hourly_rate)
    `)
    .eq("job_id", jobId);

  if (error) {
    throw new Error(`Failed to get applications: ${error.message}`);
  }

  console.log(`Found ${applications?.length || 0} applications for job ${jobId}`);
  return applications || [];
}

/**
 * Updates application status (shortlist, accept, etc.)
 */
export async function updateApplicationStatus(
  user: TestUser,
  applicationId: string,
  status: "IP" | "C" | "UR" | "S" | "V" | "A"
): Promise<void> {
  if (!user.sessionToken) {
    throw new Error(`User ${user.email} has no session token`);
  }

  const client = createUserClient(user.sessionToken);

  const { error } = await client
    .from("job_applications")
    .update({ status, viewed_at: status === "V" ? new Date().toISOString() : undefined })
    .eq("id", applicationId);

  if (error) {
    throw new Error(`Failed to update application status: ${error.message}`);
  }

  console.log(`Updated application ${applicationId} status to ${status}`);
}

/**
 * Creates an offer from homeowner to tradesperson
 */
export async function createOffer(
  user: TestUser,
  params: {
    jobId: string;
    tradespersonProfileId: string;
    applicationId?: string;
    budget: number;
    startDate: string;
    message?: string;
  }
): Promise<TestOffer> {
  if (user.role !== "homeowner" && user.role !== "business") {
    throw new Error(`User ${user.email} is not a homeowner or business`);
  }

  if (!user.sessionToken) {
    throw new Error(`User ${user.email} has no session token`);
  }

  // Get tradesperson's profile_id from tradesperson_profile_id
  const { data: tpProfile, error: tpError } = await supabaseAdmin
    .from("tradesperson_profiles")
    .select("profile_id")
    .eq("id", params.tradespersonProfileId)
    .single();

  if (tpError || !tpProfile) {
    throw new Error(`Failed to fetch tradesperson profile: ${tpError?.message}`);
  }

  const client = createUserClient(user.sessionToken);

  // First create or get conversation
  const { data: conversation, error: convError } = await client
    .from("conversations")
    .upsert(
      {
        homeowner_id: user.profileId,
        tradesperson_id: tpProfile.profile_id,
      },
      { onConflict: "homeowner_id,tradesperson_id" }
    )
    .select()
    .single();

  if (convError || !conversation) {
    throw new Error(`Failed to create conversation: ${convError?.message}`);
  }

  const offerData = {
    job_id: params.jobId,
    homeowner_id: user.profileId,
    tradesperson_id: tpProfile.profile_id,
    conversation_id: conversation.id,
    job_application_id: params.applicationId,
    budget: params.budget,
    start_date: params.startDate,
    message: params.message || "I would like to offer you this job.",
    status: "PENDING",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };

  const { data: offer, error } = await client
    .from("job_offers")
    .insert(offerData)
    .select()
    .single();

  if (error || !offer) {
    throw new Error(`Failed to create offer: ${error?.message}`);
  }

  console.log(`Created offer for job ${params.jobId}`);

  return {
    id: offer.id,
    jobId: offer.job_id,
    homeownerId: user.id,
    tradespersonId: tpProfile.profile_id,
    status: offer.status,
    budget: offer.budget,
    createdAt: new Date(offer.created_at),
  };
}

/**
 * Responds to an offer (accept/reject) as tradesperson
 */
export async function respondToOffer(
  user: TestUser,
  offerId: string,
  accept: boolean
): Promise<void> {
  if (user.role !== "tradesperson") {
    throw new Error(`User ${user.email} is not a tradesperson`);
  }

  if (!user.sessionToken) {
    throw new Error(`User ${user.email} has no session token`);
  }

  const client = createUserClient(user.sessionToken);

  const { error } = await client
    .from("job_offers")
    .update({
      status: accept ? "ACCEPTED" : "REJECTED",
      responded_at: new Date().toISOString(),
    })
    .eq("id", offerId);

  if (error) {
    throw new Error(`Failed to respond to offer: ${error.message}`);
  }

  // If accepted, update job status
  if (accept) {
    const { data: offer } = await supabaseAdmin
      .from("job_offers")
      .select("job_id")
      .eq("id", offerId)
      .single();

    if (offer) {
      await supabaseAdmin
        .from("jobs")
        .update({ status: "IN_PROGRESS" })
        .eq("id", offer.job_id);
    }
  }

  console.log(`${accept ? "Accepted" : "Rejected"} offer ${offerId}`);
}

/**
 * Marks an offer as completed
 */
export async function completeOffer(
  user: TestUser,
  offerId: string
): Promise<void> {
  if (!user.sessionToken) {
    throw new Error(`User ${user.email} has no session token`);
  }

  const client = createUserClient(user.sessionToken);

  const { error } = await client
    .from("job_offers")
    .update({
      status: "COMPLETED",
      completed_at: new Date().toISOString(),
    })
    .eq("id", offerId);

  if (error) {
    throw new Error(`Failed to complete offer: ${error.message}`);
  }

  // Update job status
  const { data: offer } = await supabaseAdmin
    .from("job_offers")
    .select("job_id")
    .eq("id", offerId)
    .single();

  if (offer) {
    await supabaseAdmin
      .from("jobs")
      .update({ status: "COMPLETED" })
      .eq("id", offer.job_id);
  }

  console.log(`Completed offer ${offerId}`);
}

/**
 * Gets offers for a user
 */
export async function getOffers(
  user: TestUser,
  status?: string
): Promise<any[]> {
  if (!user.sessionToken) {
    throw new Error(`User ${user.email} has no session token`);
  }

  const client = createUserClient(user.sessionToken);

  let query = client
    .from("job_offers")
    .select(`
      *,
      job:jobs(*),
      homeowner:profiles!job_offers_homeowner_id_fkey(id, full_name, email),
      tradesperson:profiles!job_offers_tradesperson_id_fkey(id, full_name, email)
    `);

  if (user.role === "homeowner" || user.role === "business") {
    query = query.eq("homeowner_id", user.profileId);
  } else if (user.role === "tradesperson") {
    query = query.eq("tradesperson_id", user.profileId);
  }

  if (status) {
    query = query.eq("status", status);
  }

  const { data: offers, error } = await query;

  if (error) {
    throw new Error(`Failed to get offers: ${error.message}`);
  }

  console.log(`Found ${offers?.length || 0} offers for ${user.fullName}`);
  return offers || [];
}
