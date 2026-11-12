# Uniride Next.js app: run guide

See the steps below to install, configure Firebase, and test on several devices over your LAN.

## 1. Firebase setup (one time)

1. Open Firebase console, select project `unirideweb`, go to **Build → Realtime Database**, and click **Create database**.
2. Copy the database URL from the Data tab into `NEXT_PUBLIC_FIREBASE_DATABASE_URL` in `.env.local`.
3. In the **Rules** tab, paste the contents of `database.rules.json` and click **Publish**.

## 2. Install and run on your LAN

```powershell
cd C:\Users\avina\OneDrive\Desktop\antigravproject\uniride\uni2
npm install
npm run dev            # next dev -H 0.0.0.0 -p 3000
ipconfig               # note the Wi-Fi IPv4, e.g. 192.168.1.42
```

If Windows Firewall asks about Node.js, allow it on Private networks.

## 3. Multi-device test

- Rider: `http://<LAN-IP>:3000/?role=rider` (or `/book`)
- Driver: `http://<LAN-IP>:3000/?role=driver` (or `/driver`)

1. On the rider device, set pickup and drop. The fare is calculated at ₹32/km. Tap **Book Cab**.
2. On the driver device, open the request and tap **Accept Ride**. The trip auto-starts after 3 s.
3. The cab marker moves live on the rider's map. Location updates come through Firebase about once per second.

## 4. Production

`npm run build` then `npm start`. To deploy on Vercel's Hobby plan, add the seven `NEXT_PUBLIC_FIREBASE_*` env vars.

