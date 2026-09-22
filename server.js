
require("dotenv").config();
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

const fs = require("fs");
fs.mkdirSync("./data", { recursive: true });

const db = new Database("./data/ogilatom.db");
db.pragma("journal_mode = WAL");

app.use(cors());
app.use(express.json({limit:"2mb"}));
app.use(express.urlencoded({extended:true}));
app.use(session({
  secret: process.env.SESSION_SECRET || "CHANGE_ME_IN_PRODUCTION",
  resave:false, saveUninitialized:false,
  cookie:{httpOnly:true, sameSite:"lax", secure:false, maxAge:86400000}
}));
app.use(express.static("public"));

db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, phone TEXT,
 password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS businesses(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 owner_id INTEGER, name TEXT NOT NULL, category TEXT, description TEXT,
 phone TEXT, whatsapp TEXT, website TEXT, social_json TEXT,
 status TEXT DEFAULT 'pending', featured INTEGER DEFAULT 0,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS services(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL, description TEXT, price INTEGER NOT NULL,
 active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS orders(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 order_code TEXT UNIQUE NOT NULL, user_id INTEGER, service_id INTEGER,
 customer_name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT,
 details TEXT, amount INTEGER NOT NULL, status TEXT DEFAULT 'pending',
 payment_status TEXT DEFAULT 'unpaid', mpesa_receipt TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS payments(
 id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, provider TEXT,
 amount INTEGER, receipt TEXT, status TEXT, raw_json TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS adverts(
 id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER,
 package TEXT, amount INTEGER, status TEXT DEFAULT 'pending',
 starts_at TEXT, ends_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

const serviceSeed = [
 ["ICT Support","Computer setup, troubleshooting, software and network support.",300],
 ["Digital Design","Posters, flyers, logos, business cards and social media graphics.",300],
 ["Web Development","Business websites, landing pages and website setup.",3500],
 ["Social Media","Social profiles, branded posts, content support and management.",500],
 ["Business Promotion","Business listings, featured placement and social promotion.",500],
 ["Digital Assistance","CVs, online applications, document formatting and PDF services.",100]
];
if(db.prepare("SELECT COUNT(*) c FROM services").get().c===0){
 const ins=db.prepare("INSERT INTO services(name,description,price) VALUES(?,?,?)");
 serviceSeed.forEach(x=>ins.run(...x));
}
if(!db.prepare("SELECT 1 FROM users WHERE email=?").get("admin@ogilatom.local")){
 const hash=bcrypt.hashSync("ChangeMe123!",12);
 db.prepare("INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,?)")
   .run("OGILATOM Admin","admin@ogilatom.local","0707912352",hash,"admin");
}

function auth(req,res,next){
 if(!req.session.user) return res.status(401).json({error:"Login required"});
 next();
}
function admin(req,res,next){
 if(!req.session.user || req.session.user.role!=="admin") return res.status(403).json({error:"Admin access required"});
 next();
}
function code(){return "OG-"+Date.now().toString(36).toUpperCase()+"-"+Math.floor(Math.random()*900+100)}

app.get("/api/health",(req,res)=>res.json({ok:true,name:"OGILATOM@ Digital Hub"}));
app.get("/api/services",(req,res)=>res.json(db.prepare("SELECT * FROM services WHERE active=1 ORDER BY id").all()));
app.get("/api/businesses",(req,res)=>res.json(db.prepare("SELECT * FROM businesses WHERE status='approved' ORDER BY featured DESC, id DESC").all()));

app.post("/api/register",(req,res)=>{
 const {name,email,phone,password}=req.body||{};
 if(!name||!email||!password) return res.status(400).json({error:"Name, email and password are required"});
 try{
  const hash=bcrypt.hashSync(password,12);
  const info=db.prepare("INSERT INTO users(name,email,phone,password_hash) VALUES(?,?,?,?)").run(name,email,phone||"",hash);
  req.session.user={id:info.lastInsertRowid,name,email,role:"customer"};
  res.json({ok:true,user:req.session.user});
 }catch(e){res.status(400).json({error:"Email is already registered"})}
});

app.post("/api/login",(req,res)=>{
 const {email,password}=req.body||{};
 const u=db.prepare("SELECT * FROM users WHERE email=?").get(email||"");
 if(!u || !bcrypt.compareSync(password||"",u.password_hash)) return res.status(401).json({error:"Invalid email or password"});
 req.session.user={id:u.id,name:u.name,email:u.email,role:u.role};
 res.json({ok:true,user:req.session.user});
});
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/me",(req,res)=>res.json({user:req.session.user||null}));

app.post("/api/orders",(req,res)=>{
 const {service_id,customer_name,phone,email,details,user_id}=req.body||{};
 const service=db.prepare("SELECT * FROM services WHERE id=? AND active=1").get(service_id);
 if(!service) return res.status(400).json({error:"Invalid service"});
 if(!customer_name||!phone) return res.status(400).json({error:"Customer name and phone are required"});
 const orderCode=code();
 const info=db.prepare(`INSERT INTO orders(order_code,user_id,service_id,customer_name,phone,email,details,amount)
 VALUES(?,?,?,?,?,?,?,?)`).run(orderCode,user_id||req.session.user?.id||null,service.id,customer_name,phone,email||"",details||"",service.price);
 res.json({ok:true,order_id:info.lastInsertRowid,order_code:orderCode,amount:service.price,status:"pending",payment_status:"unpaid"});
});

app.get("/api/orders/mine",auth,(req,res)=>{
 res.json(db.prepare(`SELECT o.*,s.name service_name FROM orders o LEFT JOIN services s ON s.id=o.service_id WHERE o.user_id=? ORDER BY o.id DESC`).all(req.session.user.id));
});

app.post("/api/businesses",auth,(req,res)=>{
 const {name,category,description,phone,whatsapp,website,social}=req.body||{};
 if(!name) return res.status(400).json({error:"Business name is required"});
 const info=db.prepare(`INSERT INTO businesses(owner_id,name,category,description,phone,whatsapp,website,social_json)
 VALUES(?,?,?,?,?,?,?,?)`).run(req.session.user.id,name,category||"",description||"",phone||"",whatsapp||"",website||"",JSON.stringify(social||{}));
 res.json({ok:true,id:info.lastInsertRowid,status:"pending"});
});

app.post("/api/adverts",auth,(req,res)=>{
 const {business_id,package:pkg,amount}=req.body||{};
 const b=db.prepare("SELECT * FROM businesses WHERE id=? AND owner_id=?").get(business_id,req.session.user.id);
 if(!b) return res.status(404).json({error:"Business not found"});
 const info=db.prepare("INSERT INTO adverts(business_id,package,amount) VALUES(?,?,?)").run(business_id,pkg||"Featured Listing",Number(amount)||0);
 res.json({ok:true,id:info.lastInsertRowid,status:"pending_payment"});
});

app.get("/api/admin/summary",admin,(req,res)=>{
 const orders=db.prepare("SELECT COUNT(*) c FROM orders").get().c;
 const pending=db.prepare("SELECT COUNT(*) c FROM orders WHERE status='pending'").get().c;
 const paid=db.prepare("SELECT COALESCE(SUM(amount),0) s FROM orders WHERE payment_status='paid'").get().s;
 const businesses=db.prepare("SELECT COUNT(*) c FROM businesses").get().c;
 res.json({orders,pending,paid,businesses});
});
app.get("/api/admin/orders",admin,(req,res)=>{
 res.json(db.prepare(`SELECT o.*,s.name service_name FROM orders o LEFT JOIN services s ON s.id=o.service_id ORDER BY o.id DESC`).all());
});
app.patch("/api/admin/orders/:id",admin,(req,res)=>{
 const {status}=req.body||{};
 db.prepare("UPDATE orders SET status=? WHERE id=?").run(status,req.params.id);
 res.json({ok:true});
});
app.get("/api/admin/businesses",admin,(req,res)=>res.json(db.prepare("SELECT * FROM businesses ORDER BY id DESC").all()));
app.patch("/api/admin/businesses/:id",admin,(req,res)=>{
 const {status,featured}=req.body||{};
 db.prepare("UPDATE businesses SET status=?, featured=? WHERE id=?").run(status||"pending",featured?1:0,req.params.id);
 res.json({ok:true});
});

/* ---------- M-Pesa (Daraja) helpers ---------- */
const MPESA_BASE = (process.env.MPESA_ENV === "production")
  ? "https://api.safaricom.co.ke"
  : "https://sandbox.safaricom.co.ke";

async function getMpesaToken(){
  const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString("base64");
  const r = await fetch(`${MPESA_BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` }
  });
  if(!r.ok) throw new Error("Failed to get M-Pesa access token");
  const data = await r.json();
  return data.access_token;
}

function mpesaTimestamp(){
  const d = new Date();
  const pad = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function normalizeMsisdn(phone){
  let p = String(phone).replace(/\D/g,"");
  if(p.startsWith("0")) p = "254"+p.slice(1);
  if(p.startsWith("254") && p.length===12) return p;
  throw new Error("Invalid phone number format");
}

app.post("/api/mpesa/stkpush", async (req,res)=>{
  try{
    const {order_id, phone} = req.body||{};
    const order = db.prepare("SELECT * FROM orders WHERE id=?").get(order_id);
    if(!order) return res.status(404).json({error:"Order not found"});
    if(!process.env.MPESA_CONSUMER_KEY || !process.env.MPESA_CONSUMER_SECRET || !process.env.MPESA_SHORTCODE || !process.env.MPESA_PASSKEY)
      return res.status(503).json({error:"M-Pesa is not configured yet. Add credentials to your .env file."});

    const msisdn = normalizeMsisdn(phone || order.phone);
    const timestamp = mpesaTimestamp();
    const password = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString("base64");
    const token = await getMpesaToken();

    const payload = {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.max(1, Math.round(order.amount)),
      PartyA: msisdn,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: msisdn,
      CallBackURL: process.env.MPESA_CALLBACK_URL,
      AccountReference: order.order_code,
      TransactionDesc: "OGILATOM order "+order.order_code
    };

    const r = await fetch(`${MPESA_BASE}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await r.json();

    if(data.ResponseCode !== "0"){
      return res.status(502).json({error: data.errorMessage || data.ResponseDescription || "STK push failed"});
    }

    db.prepare("INSERT INTO payments(order_id,provider,amount,status,raw_json) VALUES(?,?,?,?,?)")
      .run(order.id, "mpesa", payload.Amount, "pending", JSON.stringify(data));
    db.prepare("UPDATE orders SET status=? WHERE id=?").run("stk_sent", order.id);

    res.json({ok:true, message:"Check your phone to complete payment.", checkout_request_id: data.CheckoutRequestID});
  }catch(e){
    console.error("STK push error:", e);
    res.status(500).json({error: e.message || "Something went wrong initiating the payment"});
  }
});

app.post("/api/mpesa/callback",(req,res)=>{
  console.log("M-Pesa callback received", JSON.stringify(req.body));
  try{
    const stk = req.body?.Body?.stkCallback;
    if(!stk) return res.json({ResultCode:0, ResultDesc:"Accepted"});

    const checkoutId = stk.CheckoutRequestID;
    const payment = db.prepare("SELECT * FROM payments WHERE raw_json LIKE ? ORDER BY id DESC").get(`%${checkoutId}%`);
    if(!payment){
      console.warn("No matching payment for CheckoutRequestID", checkoutId);
      return res.json({ResultCode:0, ResultDesc:"Accepted"});
    }

    if(stk.ResultCode === 0){
      const items = stk.CallbackMetadata?.Item || [];
      const receipt = items.find(i=>i.Name==="MpesaReceiptNumber")?.Value || null;
      db.prepare("UPDATE payments SET status=?, receipt=? WHERE id=?").run("paid", receipt, payment.id);
      db.prepare("UPDATE orders SET status=?, payment_status=? WHERE id=?").run("paid","paid",payment.order_id);
    }else{
      db.prepare("UPDATE payments SET status=? WHERE id=?").run("failed", payment.id);
      db.prepare("UPDATE orders SET status=?, payment_status=? WHERE id=?").run("payment_failed","failed",payment.order_id);
    }
  }catch(e){
    console.error("Callback processing error:", e);
  }
  res.json({ResultCode:0, ResultDesc:"Accepted"});
});

app.get("*",(req,res)=>res.sendFile(require("path").join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`OGILATOM@ running on http://localhost:${PORT}`));
