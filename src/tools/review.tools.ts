import { createUserClient, supabaseAdmin } from "../config/supabase.js";
import type { TestUser, TestReview } from "../state/types.js";

interface CreateReviewParams {
  offerId: string;
  rating: number;
  feedback: string;
}

/**
 * Creates a review for a completed job
 */
export async function createReview(
  user: TestUser,
  params: CreateReviewParams
): Promise<TestReview> {
  if (user.role !== "homeowner" && user.role !== "business") {
    throw new Error(`User ${user.email} is not a homeowner or business`);
  }

  if (!user.sessionToken) {
    throw new Error(`User ${user.email} has no session token`);
  }

  // Get offer details
  const { data: offer, error: offerError } = await supabaseAdmin
    .from("job_offers")
    .select(`
      id,
      job_id,
      homeowner_id,
      tradesperson_id,
      budget,
      job:jobs(category)
    `)
    .eq("id", params.offerId)
    .single();

  if (offerError || !offer) {
    throw new Error(`Failed to fetch offer: ${offerError?.message}`);
  }

  const client = createUserClient(user.sessionToken);

  const reviewData = {
    offer_id: params.offerId,
    job_id: offer.job_id,
    homeowner_id: offer.homeowner_id,
    tradesperson_id: offer.tradesperson_id,
    job_category: (offer.job as any)?.category || "General",
    budget: offer.budget,
    rating: params.rating,
    feedback: params.feedback,
  };

  const { data: review, error } = await client
    .from("reviews")
    .insert(reviewData)
    .select()
    .single();

  if (error || !review) {
    throw new Error(`Failed to create review: ${error?.message}`);
  }

  console.log(`Created review for offer ${params.offerId}: ${params.rating}/5 stars`);

  return {
    id: review.id,
    offerId: review.offer_id,
    rating: review.rating,
    feedback: review.feedback,
    createdAt: new Date(review.created_at),
  };
}

/**
 * Gets reviews for a tradesperson
 */
export async function getTradespersonReviews(
  tradespersonProfileId: string,
  limit: number = 10
): Promise<any[]> {
  const { data: reviews, error } = await supabaseAdmin.rpc(
    "get_tradesperson_reviews",
    {
      p_tradesperson_id: tradespersonProfileId,
      p_page: 1,
      p_page_size: limit,
    }
  );

  if (error) {
    console.warn(`Warning: Could not get reviews: ${error.message}`);
    return [];
  }

  return reviews || [];
}

/**
 * Gets reviews by a homeowner
 */
export async function getHomeownerReviews(
  homeownerProfileId: string,
  limit: number = 10
): Promise<any[]> {
  const { data: reviews, error } = await supabaseAdmin.rpc(
    "get_homeowner_reviews",
    {
      p_homeowner_id: homeownerProfileId,
      p_page: 1,
      p_page_size: limit,
    }
  );

  if (error) {
    console.warn(`Warning: Could not get reviews: ${error.message}`);
    return [];
  }

  return reviews || [];
}

/**
 * Gets review for a specific offer
 */
export async function getReviewByOfferId(offerId: string): Promise<any | null> {
  const { data: review, error } = await supabaseAdmin.rpc(
    "get_review_by_offer_id",
    {
      p_offer_id: offerId,
    }
  );

  if (error) {
    console.warn(`Warning: Could not get review: ${error.message}`);
    return null;
  }

  return review;
}
