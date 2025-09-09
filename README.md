# Tent Booking Manager (Vue + Supabase)

A web app to manage tents and camping spots at a campsite.

## ✨ Features
- Create tents or free spots
- Book, extend, and free units
- Automatic release at 13:00 if not extended
- Realtime sync across devices with Supabase
- Deployed on Cloudflare Pages (free hosting)

## 🚀 Live Demo
👉 [pineside.pages.dev](https://pineside.pages.dev)

## 🛠 Tech Stack
- [Vue 3](https://vuejs.org/) + Vite
- [Supabase](https://supabase.com/) (Auth, Database, Realtime)
- [Cloudflare Pages](https://pages.cloudflare.com/) (Deployment)


Setup & Installation
Clone the repo and run locally:
git clone https://github.com/YOUR-USERNAME/tent-booking-manager.git
cd tent-booking-manager
npm install
npm run dev

🔑 Environment Variables
Create a .env file in the root:
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_TENANT_ID=uuid-here

📜 License
This project is open source and available under the MIT License.

