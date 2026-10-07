# Glow & Melt

Celestial candle storefront for Cloudflare + Supabase.

## Customer features
- Google sign-in
- Account details: name, phone, address, city, state and PIN
- Save delivery details
- Cart and checkout
- UPI payment + UTR submission
- Orders / Track order
- Seven delivery steps:
  1. Payment submitted
  2. Payment verified
  3. Processing
  4. Packed
  5. Shipped
  6. Out for delivery
  7. Delivered
- Three-line menu with Products, Cart, Orders/Track order, Account details, Checkout, Admin and Sign out

## Admin
Admin is restricted to the Google account:
`wafaabbas1636@gmail.com`

The admin panel supports:
- Unlimited products
- Product name, description, price and ₹ discount
- Up to 4 product photos
- Product photo gallery
- Add/edit products
- Hide/show products
- Delete products
- View all orders
- Change order status
- Payment status and UTR
- Expected delivery date
- Product/order statistics

## Supabase setup

1. Open Supabase SQL Editor.
2. Run the complete `supabase/schema.sql` file from this project.
3. In Supabase Authentication > Providers, make sure Google is enabled.
4. In Google Cloud OAuth, keep the Supabase callback URL:
   `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
5. In Supabase Authentication > URL Configuration, set the Site URL to your deployed Cloudflare URL, for example:
   `https://glowandmelt.facet4419.workers.dev`
6. Add the deployed URL to the allowed redirect URLs if required:
   `https://glowandmelt.facet4419.workers.dev/**`

The SQL creates the `product-images` public storage bucket and restricts uploads/deletes to the admin account.

## Important
Do not replace `public/config.js` with a different Supabase project if the current project is already working. Keep the existing working Supabase URL, publishable key and UPI settings.

The project is static and can be deployed with the existing `wrangler.toml`.
