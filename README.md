# Pet Max — E-commerce Store

A full-stack pet supplies store: cat food, treats, litter, grooming and toys. Built with **Node.js + Express + SQLite**, no framework on the frontend (plain HTML/CSS/JS) so there's nothing extra to learn to edit it.

## What's included

- **Storefront** — hero, category browsing, search + sort, product quick-view, cart drawer, checkout
- **Checkout** — Cash on Delivery, online payment (JazzCash/EasyPaisa/bank transfer with reference number), and a WhatsApp order button on every product, the cart, and floating on every page
- **Order tracking** — customers can look up their order by code
- **Admin panel** at `/admin` — add/edit/delete products, view orders, update order status, dashboard stats
- **Database** — SQLite (a single file, `db/petmax.db`), no separate database server to install

## 1. Before you launch — things to change

Open **`public/js/main.js`** and edit the `CONFIG` object near the top:

```js
const CONFIG = {
  whatsappNumber: '923001234567', // <-- YOUR real WhatsApp number, country code first, no + or spaces
  bank: {
    accountTitle: 'Pet Max / Hassan',
    jazzcash: '0300-1234567',      // <-- your real JazzCash number
    easypaisa: '0300-1234567',     // <-- your real EasyPaisa number
    bankName: 'Meezan Bank',
    bankAccount: '0123456789012',
    iban: 'PK00MEZN0000000123456789',
  },
  freeDeliveryThreshold: 3000, // free delivery above this order total
  deliveryFee: 200,
};
```

Also change the **admin password** — either set an environment variable `ADMIN_PASSWORD` when you run the server, or edit the default in `routes/auth.js` (default is `petmax2026`).

## 2. Run it locally

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install       # install dependencies (first time only)
npm run seed      # load the 19 sample products into the database (first time only)
npm start         # start the server
```

Then open **http://localhost:3000** — the store — and **http://localhost:3000/admin** — the admin panel.

While actively editing, `npm run dev` restarts the server automatically every time you save a file (uses `nodemon`).

## 3. Editing in VS Code

1. `File → Open Folder` → select this `petmax-store` folder
2. Open the terminal (`` Ctrl+` ``) and run the commands above
3. Ctrl/Cmd-click the `localhost:3000` link in the terminal to open it in your browser
4. Recommended extensions (VS Code will prompt you): **SQLite Viewer** (browse `db/petmax.db` as a table), **Prettier**, **ESLint**
5. A debug config is already set up — `Run and Debug → Run Pet Max server` lets you set breakpoints in `server.js` and the route files

## 4. Managing products day-to-day

You don't need to touch code to add or edit products — use the admin panel:

1. Go to `/admin`, log in with your admin password
2. **Products tab** → "Add product" or click "Edit" on any row
3. Changes appear on the storefront immediately, no restart needed

Orders show up under the **Orders tab** — update status (new → processing → shipped → delivered) as you fulfil them, and mark online payments as verified once you've checked the transaction ID against your JazzCash/EasyPaisa/bank account.

## 5. How checkout actually works

- **Cash on Delivery** — order is placed immediately, marked "pending" payment, you collect cash on delivery
- **Online payment** — the customer sees your JazzCash/EasyPaisa/bank details on screen, transfers manually, and enters their transaction reference number at checkout. This is the same pattern most small Pakistani stores use since it doesn't require a merchant payment gateway account. If you later get a JazzCash/EasyPaisa **merchant** account, a real payment gateway can be wired in — that's a bigger integration than this starter includes, since it needs your merchant credentials.
- **WhatsApp** — always available as a backup: pre-fills a message with the order/cart details so the customer just hits send

Stock is decremented automatically when an order is placed, and re-priced server-side from the database — so a customer can't tamper with prices in their browser.

## 6. Deploying so it's live for customers

This is a standard Node.js app, so it runs on most Node hosts. Two good options for a solo founder:

**Railway or Render** (recommended — easiest)
1. Push this folder to a GitHub repo
2. Create a new project on [Railway](https://railway.app) or [Render](https://render.com), connect the repo
3. Set the start command to `npm start`
4. Set environment variables: `ADMIN_PASSWORD` (your real password) and `SESSION_SECRET` (any random string)
5. **Important:** enable a persistent disk/volume for the `db/` folder, or your products and orders will reset every time you redeploy — both platforms have this as an option in their dashboard

**A VPS** (more control)
1. Install Node.js on the server
2. Copy the project over, run `npm install --omit=dev`
3. Run it with a process manager so it restarts on crash/reboot: `npx pm2 start server.js --name petmax`
4. Put Nginx in front for your domain name and free HTTPS via Let's Encrypt

Either way, once it's live, point your Daraz store description / Instagram bio link at your domain.

## Project structure

```
petmax-store/
  server.js              — Express app entry point
  db/
    database.js           — SQLite connection + schema
    seed.js                — sample product data (npm run seed)
  routes/
    products.js            — product API (list/filter/CRUD)
    orders.js               — order API (place/track/admin manage)
    auth.js                  — admin login/logout
  middleware/auth.js          — protects admin-only routes
  public/
    index.html                — storefront
    admin.html                 — admin panel
    css/style.css                — storefront design system
    css/admin.css                 — admin panel styles
    js/main.js                     — storefront logic (EDIT CONFIG HERE)
    js/cart.js                      — cart (saved in the browser)
    js/admin.js                      — admin panel logic
    js/icons.js                       — hand-built product icon set
    images/logo.png                    — your Pet Max logo
```
