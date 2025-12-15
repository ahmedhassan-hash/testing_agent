import dotenv from "dotenv";

dotenv.config();

export const config = {
  // Supabase
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY!,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,

  // OpenAI (for LangChain)
  openaiApiKey: process.env.OPENAI_API_KEY,

  // Test configuration
  testUserPrefix: "test_agent_",
  testEmailDomain: "test.workmate.local",
  defaultPassword: "TestPassword123!",

  // Locations for test users (Australian cities)
  testLocations: [
    {
      display_name: "Sydney, NSW, Australia",
      lat: -33.8688,
      lon: 151.2093,
      place_id: "test_sydney",
    },
    {
      display_name: "Melbourne, VIC, Australia",
      lat: -37.8136,
      lon: 144.9631,
      place_id: "test_melbourne",
    },
    {
      display_name: "Brisbane, QLD, Australia",
      lat: -27.4698,
      lon: 153.0251,
      place_id: "test_brisbane",
    },
  ],

  // Trade categories for test tradespersons
  tradeCategories: [
    "Plumber",
    "Electrician",
    "Carpenter",
    "Painter",
    "Landscaper",
    "Cleaner",
    "Handyman",
    "Roofer",
  ],

  // Job categories for test jobs
  jobCategories: [
    "Plumbing",
    "Electrical",
    "Carpentry",
    "Painting",
    "Landscaping",
    "Cleaning",
    "General Repairs",
    "Roofing",
  ],

  // Timeouts
  actionTimeoutMs: 30000,
  scenarioTimeoutMs: 300000,

  // Retry configuration
  maxRetries: 3,
  retryDelayMs: 1000,
};

export default config;
