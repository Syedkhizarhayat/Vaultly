/* ==========================================================
   Vaultly — Supabase Configuration
   --------------------------------------------------------
   Replace the two values below with YOUR OWN project details.
   Get them from: Supabase Dashboard → Project Settings → API
     - Project URL      → SUPABASE_URL
     - anon / public key → SUPABASE_ANON_KEY
   --------------------------------------------------------
   See SUPABASE-GUIDE.md, Step 11, for exactly where to find this.
   ========================================================== */

const SUPABASE_URL = "https://pmrkpaqwipquwksvlwxe.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_kKL8CLz8S53DMwpJ0I85Lw_etqik3Ft";

// Initialize Supabase client (do not edit below this line)
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
