import { v4 as uuidv4 } from "uuid";
import config from "../config/index.js";
import { supabaseAdmin, supabaseAnon } from "../config/supabase.js";
import type { TestUser, UserRole } from "../state/types.js";

interface CreateUserParams {
  role: UserRole;
  fullName?: string;
  location?: {
    display_name: string;
    lat: number;
    lon: number;
    place_id: string;
  };
  tradeCategories?: string[];
  businessName?: string;
}

export async function createTestUser(
  params: CreateUserParams
): Promise<TestUser> {
  const { role, fullName, location, tradeCategories, businessName } = params;

  const uniqueId = uuidv4().slice(0, 8);
  const email = `${config.testUserPrefix}${role}_${uniqueId}@${config.testEmailDomain}`;
  const password = config.defaultPassword;
  const name = fullName || `Test ${role} ${uniqueId}`;

  const testLocation =
    location ||
    config.testLocations[Math.floor(Math.random() * config.testLocations.length)];

  console.log(`Creating test user: ${email} (${role})`);

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        role,
      },
    });

  if (authError || !authData.user) {
    throw new Error(`Failed to create auth user: ${authError?.message}`);
  }

  const userId = authData.user.id;

  // Profile data - email is stored in auth.users, not profiles
  const profileData = {
    user_id: userId,
    role,
    full_name: name,
    phone_number: `+6140000${uniqueId.slice(0, 4)}`,
    address: testLocation.display_name,
    latitude: testLocation.lat,
    longitude: testLocation.lon,
    location: testLocation,
    subscription_plan: "free",
    subscription_status: "active",
    status: "active",
  };

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .insert(profileData)
    .select()
    .single();

  if (profileError || !profile) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    throw new Error(`Failed to create profile: ${profileError?.message}`);
  }

  let tradespersonProfileId: string | undefined;
  let businessProfileId: string | undefined;

  if (role === "tradesperson") {
    const trades =
      tradeCategories ||
      [config.tradeCategories[Math.floor(Math.random() * config.tradeCategories.length)]];

    const tradespersonData = {
      profile_id: profile.id,
      abn: `${Math.floor(Math.random() * 90000000000) + 10000000000}`,
      trade_categories: trades,
      skills: ["General maintenance", "Installation", "Repairs"],
      experience_years: Math.floor(Math.random() * 10) + 1,
      hourly_rate: Math.floor(Math.random() * 50) + 50,
      location_radius: 50,
      service_areas: [testLocation.display_name.split(",")[0]],
      description: `Experienced ${trades[0]} available for all types of work.`,
    };

    const { data: tradespersonProfile, error: tpError } = await supabaseAdmin
      .from("tradesperson_profiles")
      .insert(tradespersonData)
      .select()
      .single();

    if (tpError) {
      console.warn(`Warning: Failed to create tradesperson profile: ${tpError.message}`);
    } else {
      tradespersonProfileId = tradespersonProfile.id;
    }
  } else if (role === "business") {
    const businessData = {
      profile_id: profile.id,
      business_name: businessName || `Test Business ${uniqueId}`,
      abn_acn: `${Math.floor(Math.random() * 90000000000) + 10000000000}`,
      business_address: testLocation.display_name,
      business_type: "Trade Services",
      industry: "Construction & Trades",
      company_size: "1-10",
    };

    const { data: businessProfile, error: bpError } = await supabaseAdmin
      .from("business_profiles")
      .insert(businessData)
      .select()
      .single();

    if (bpError) {
      console.warn(`Warning: Failed to create business profile: ${bpError.message}`);
    } else {
      businessProfileId = businessProfile.id;
    }
  }

  // Step 4: Sign in to get session token
  const { data: signInData, error: signInError } =
    await supabaseAnon.auth.signInWithPassword({
      email,
      password,
    });

  if (signInError) {
    console.warn(`Warning: Could not sign in test user: ${signInError.message}`);
  }

  const testUser: TestUser = {
    id: profile.id,
    email,
    password,
    role,
    profileId: profile.id,
    tradespersonProfileId,
    businessProfileId,
    fullName: name,
    createdAt: new Date(),
    sessionToken: signInData?.session?.access_token,
    metadata: {
      authUserId: userId,
      location: testLocation,
      tradeCategories: role === "tradesperson" ? tradeCategories : undefined,
    },
  };

  console.log(`Created test user: ${name} (${profile.id})`);
  return testUser;
}


export async function signInAsUser(
  email: string,
  password: string
): Promise<string> {
  const { data, error } = await supabaseAnon.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    throw new Error(`Failed to sign in: ${error?.message}`);
  }

  return data.session.access_token;
}


export async function deleteTestUser(testUser: TestUser): Promise<void> {
  const authUserId = testUser.metadata?.authUserId as string;

  if (!authUserId) {
    console.warn(`No auth user ID found for test user ${testUser.id}`);
    return;
  }

  console.log(`Deleting test user: ${testUser.email}`);

  try {
    if (testUser.tradespersonProfileId) {
      await supabaseAdmin
        .from("tradesperson_profiles")
        .delete()
        .eq("id", testUser.tradespersonProfileId);
    }
    if (testUser.businessProfileId) {
      await supabaseAdmin
        .from("business_profiles")
        .delete()
        .eq("id", testUser.businessProfileId);
    }

    await supabaseAdmin.from("profiles").delete().eq("id", testUser.profileId);

    await supabaseAdmin.auth.admin.deleteUser(authUserId);

    console.log(`Deleted test user: ${testUser.email}`);
  } catch (error) {
    console.error(`Error deleting test user ${testUser.email}:`, error);
  }
}

export async function cleanupAllTestUsers(): Promise<number> {
  console.log("Cleaning up all test users...");

  // Get test users from auth.users by email pattern, then find their profiles
  const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();

  if (authError) {
    throw new Error(`Failed to list auth users: ${authError.message}`);
  }

  // Filter test users by email pattern
  const testAuthUsers = authUsers.users.filter(
    (u) => u.email?.startsWith(config.testUserPrefix)
  );

  if (testAuthUsers.length === 0) {
    console.log("No test users found to cleanup");
    return 0;
  }

  const testUserIds = testAuthUsers.map((u) => u.id);

  // Get profiles for these auth users
  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id, user_id")
    .in("user_id", testUserIds);

  if (error) {
    throw new Error(`Failed to fetch test profiles: ${error.message}`);
  }

  console.log(`Found ${testAuthUsers.length} test users to cleanup`);

  // Delete profiles first (if they exist)
  if (profiles && profiles.length > 0) {
    for (const profile of profiles) {
      try {
        await supabaseAdmin
          .from("tradesperson_profiles")
          .delete()
          .eq("profile_id", profile.id);

        await supabaseAdmin
          .from("business_profiles")
          .delete()
          .eq("profile_id", profile.id);

        await supabaseAdmin.from("profiles").delete().eq("id", profile.id);
      } catch (err) {
        console.error(`Error cleaning up profile ${profile.id}:`, err);
      }
    }
  }

  // Delete auth users
  for (const authUser of testAuthUsers) {
    try {
      await supabaseAdmin.auth.admin.deleteUser(authUser.id);
    } catch (err) {
      console.error(`Error deleting auth user ${authUser.email}:`, err);
    }
  }

  console.log(`Cleaned up ${testAuthUsers.length} test users`);
  return testAuthUsers.length;
}
